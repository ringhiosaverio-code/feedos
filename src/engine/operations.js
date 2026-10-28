/* FeedOS 17 · Operazioni che toccano più archivi insieme (un solo passo annullabile):
 * arrivo di un ordine d'acquisto (anche parziale) → lotto di materia prima in attesa; esito dell'accettazione con la causa del respingimento;
 * storno di un arrivo non ancora usato;
 * registrazione di produzione → prelievo FIFO dai lotti, nuovo lotto di prodotto, scorte aggiornate. */
import { round, dayOfYear, uid } from '../core/util.js';

/** Codice lotto di materia prima: M01-26264-07 (materia prima, anno e giorno dell'anno, progressivo). */
export function ingLotCode(ing, date, n) { return `${ing.code.replace('MP', 'M')}-${date.slice(2, 4)}${String(dayOfYear(date)).padStart(3, '0')}-${String(n % 100).padStart(2, '0')}`; }
export function lotCode(line, date, n) { return `L${date.slice(2, 4)}${String(dayOfYear(date)).padStart(3, '0')}-${line.code}-${String(n % 100).padStart(2, '0')}`; }

/** Arrivo di un ordine: il lotto nasce «in attesa» finché l'analisi di accettazione non lo libera.
 *  Un arrivo sotto il 98% della quantità ancora aperta lascia l'ordine «parziale» con il residuo da ricevere. */
export function receivePurchaseOps(d, po, { date, tonnes, ddt, analyses } = {}) {
  const ing = d.ingredients.find(i => i.id === po.ingId);
  if (!ing) return null;
  const prev = po.status === 'parziale' ? +po.receivedT || 0 : 0;
  const t = round(+tonnes || Math.max(0, (+po.tonnes || 0) - prev), 2);
  const total = round(prev + t, 2);
  const status = total >= 0.98 * (+po.tonnes || 0) ? 'ricevuto' : 'parziale';
  const n = d.ingLots.filter(l => l.ingId === ing.id).length + 1;
  const sup = (d.suppliers || []).find(s => s.id === po.supplierId) || (d.suppliers || []).find(s => s.name === (po.supplier || ing.supplier));
  const lot = {
    id: uid('il'), code: ingLotCode(ing, date, n), ingId: ing.id, supplier: po.supplier || ing.supplier, supplierId: sup?.id || po.supplierId || null, date, tonnes: t, remaining: t,
    price: +po.price || +ing.price || 0, ddt: ddt || '', poId: po.id,
    analyses: { PG: analyses?.PG ?? null, UM: analyses?.UM ?? null, AFB1: analyses?.AFB1 ?? null },
    status: 'in attesa', note: 'Arrivo registrato in FeedOS: in attesa dell’analisi di accettazione',
  };
  return [
    { kind: 'update', coll: 'purchases', id: po.id, patch: { status, receivedAt: date, receivedT: total, ...(sup && !po.supplierId ? { supplierId: sup.id } : {}) } },
    { kind: 'add', coll: 'ingLots', obj: lot },
  ];
}

/** Cause di respingimento di un lotto di materia prima. */
export const REJECT_REASONS = [
  { id: 'AFB1', label: 'Aflatossina B1 oltre il limite' }, { id: 'umidità', label: 'Umidità eccessiva' }, { id: 'proteina', label: 'Proteina sotto il contratto' },
  { id: 'corpi estranei', label: 'Corpi estranei o infestanti' }, { id: 'documenti', label: 'Documenti mancanti o non conformi' }, { id: 'altro', label: 'Altro' },
];

/** Esito dell'accettazione di un lotto di materia prima: aggiorna stato e scorta disponibile; un respingimento porta la causa. */
export function acceptIngLotOps(d, lot, { analyses, accept, reason }) {
  const ing = d.ingredients.find(i => i.id === lot.ingId);
  const status = accept ? 'accettato' : 'bloccato';
  const ops = [{ kind: 'update', coll: 'ingLots', id: lot.id, patch: { analyses: { ...lot.analyses, ...analyses }, status, ...(accept ? {} : { rejectReason: reason || 'altro' }) } }];
  if (ing && accept && lot.status !== 'accettato') ops.push({ kind: 'update', coll: 'ingredients', id: ing.id, patch: x => ({ ...x, stock: round((+x.stock || 0) + (+lot.remaining || 0), 1) }) });
  if (ing && !accept && lot.status === 'accettato') ops.push({ kind: 'update', coll: 'ingredients', id: ing.id, patch: x => ({ ...x, stock: round(Math.max(0, (+x.stock || 0) - (+lot.remaining || 0)), 1) }) });
  return ops;
}

/**
 * Storno di un arrivo registrato per errore: solo se il lotto non è stato usato (residuo = quantità, nessun prelievo).
 * Toglie il lotto (e la sua scorta se era accettato) e riapre l'ordine. → {ops} oppure {error}
 */
export function reverseReceiptOps(d, ingLotId) {
  const lot = (d.ingLots || []).find(l => l.id === ingLotId);
  if (!lot) return { error: 'Lotto non trovato.' };
  const used = (d.lots || []).some(p => (p.comp || []).some(c => c.l === ingLotId)) || Math.abs((+lot.remaining || 0) - (+lot.tonnes || 0)) > 0.001;
  if (used) return { error: 'Il lotto è già stato usato in produzione: non si può stornare (registra una rettifica d’inventario).' };
  const ops = [{ kind: 'remove', coll: 'ingLots', id: lot.id }];
  if (lot.status === 'accettato') ops.push({ kind: 'update', coll: 'ingredients', id: lot.ingId, patch: x => ({ ...x, stock: round(Math.max(0, (+x.stock || 0) - (+lot.remaining || 0)), 1) }) });
  const po = lot.poId && (d.purchases || []).find(p => p.id === lot.poId);
  if (po) {
    const left = round(Math.max(0, (+po.receivedT || 0) - (+lot.tonnes || 0)), 2);
    ops.push({ kind: 'update', coll: 'purchases', id: po.id, patch: left > 0.001 ? { status: 'parziale', receivedT: left } : { status: 'confermato', receivedAt: null, receivedT: null } });
  }
  return { ops };
}

/** Prelievo FIFO: i lotti accettati più vecchi, arrivati entro la data di produzione. */
export function allocateFIFO(ingLots, ingId, kg, date) {
  const avail = ingLots.filter(l => l.ingId === ingId && l.status === 'accettato' && (+l.remaining || 0) > 1e-6 && l.date <= date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1));
  const comp = [], take = {};
  let need = kg;
  for (const l of avail) {
    if (need <= 1e-6) break;
    const t = Math.min(need, (+l.remaining) * 1000);
    comp.push({ l: l.id, ing: ingId, kg: round(t, 1) });
    take[l.id] = t / 1000;
    need -= t;
  }
  return { comp, take, short: need > 0.5 ? need : 0 };
}

/**
 * Registrazione di produzione. Restituisce { ops, lot, shortages } — se mancano materie prime tracciate
 * (lotti non registrati o non accettati) non si registra nulla: la tracciabilità deve restare completa.
 */
export function registerRunOps(d, r) {
  const product = d.products.find(p => p.id === r.productId);
  const formula = d.formulas.find(f => f.id === product?.formulaId);
  const line = d.lines.find(l => l.id === r.lineId);
  if (!product || !formula || !line) return { ops: null, shortages: [], error: 'Prodotto, formula o linea mancanti.' };
  const tonnes = +r.tonnes || 0;
  const comp = [], lotTake = {}, shortages = [];
  for (const l of formula.lines) {
    const kg = tonnes * (+l.kg);
    const a = allocateFIFO(d.ingLots, l.ing, kg, r.date);
    comp.push(...a.comp);
    for (const [id, t] of Object.entries(a.take)) lotTake[id] = (lotTake[id] || 0) + t;
    if (a.short) shortages.push({ ing: l.ing, kg: a.short });
  }
  if (shortages.length) return { ops: null, shortages };
  const n = d.runs.length + 1;
  const runId = uid('r');
  const lot = { id: 'lt-' + runId, code: lotCode(line, r.date, n), runId, productId: product.id, date: r.date, tonnes: round(tonnes, 2), comp, status: 'in attesa', analyses: [] };
  const run = { id: runId, date: r.date, lineId: line.id, productId: product.id, formulaId: formula.id, formulaVersion: formula.version, tonnes: round(tonnes, 2),
    hours: +r.hours || null, kwh: +r.kwh || null, gplKg: +r.gplKg || 0, waste: +r.waste || 0, lotId: lot.id, shift: r.shift || '', note: r.note || '',
    estimated: r.estimated && typeof r.estimated === 'object' ? { ...r.estimated } : null }; // valori stimati (ore, kWh, GPL) non misurati
  const ops = [{ kind: 'add', coll: 'runs', obj: run }, { kind: 'add', coll: 'lots', obj: lot }];
  const byIng = {};
  for (const [id, t] of Object.entries(lotTake)) {
    const il = d.ingLots.find(x => x.id === id);
    ops.push({ kind: 'update', coll: 'ingLots', id, patch: x => ({ ...x, remaining: round(Math.max(0, (+x.remaining || 0) - t), 4) }) });
    byIng[il.ingId] = (byIng[il.ingId] || 0) + t;
  }
  for (const [ing, t] of Object.entries(byIng)) ops.push({ kind: 'update', coll: 'ingredients', id: ing, patch: x => ({ ...x, stock: round(Math.max(0, (+x.stock || 0) - t), 1) }) });
  // il piano della settimana si considera avanzato: nulla da aggiornare, il confronto piano/consuntivo è calcolato
  return { ops, lot, run, shortages: [] };
}
