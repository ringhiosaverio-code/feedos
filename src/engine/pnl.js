/* FeedOS 17 · Conto economico gestionale a costi diretti (pacchetto WP1).
 * Dai fatti al costo effettivo (actuals.js) e dai costi fissi per centro: ricavi lordi → sconti → ricavi netti →
 * costi variabili industriali (MdC I) → trasporti e provvigioni (MdC II) → fissi monetari per gruppo (EBITDA) →
 * ammortamenti (EBIT) → onere figurativo del circolante. I mesi chiusi usano i numeri congelati (closings).
 * Puro: usabile nei test in node. */
import { byId, monthsIn, monthFraction, endOfMonth, daysBetween, daysInMonth, addDays } from '../core/util.js';
import { aggregateFacts, fixedFor, makeCtx, FACT_SUMS } from './actuals.js';
import { SPECIES } from './nutrients.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const EMPTY = [];
const GROUPS = ['stabilimento', 'commerciale', 'struttura'];
const SUM_KEYS = [...FACT_SUMS, 'n'];

/**
 * Righe del conto economico, in ordine. total = riga di totale (somma progressiva delle righe precedenti).
 * def = definizione mostrata al passaggio del mouse.
 */
export const PNL_LINES = [
  { id: 'ricaviLordi', label: 'Ricavi lordi a listino', short: 'Ricavi lordi', def: 'Tonnellate consegnate × listino valido alla data di ogni consegna.' },
  { id: 'sconti', label: 'Sconti e abbuoni', short: 'Sconti', def: 'Differenza tra listino e prezzo applicato in bolla: sconti cliente, promozioni e abbuoni.' },
  { id: 'ricaviNetti', label: 'Ricavi netti', short: 'Ricavi netti', total: true, def: 'Tonnellate × prezzo applicato. Ricavi lordi − sconti.' },
  { id: 'materiePrime', label: 'Materie prime', short: 'Materie prime', def: 'Costo effettivo dei lotti di materia prima usati in ogni lotto spedito (composizione del lotto × prezzo del lotto MP).' },
  { id: 'calo', label: 'Calo di lavorazione', short: 'Calo', def: 'Materia prima persa in lavorazione: materie prime × calo% / (1 − calo%).' },
  { id: 'energia', label: 'Energia', short: 'Energia', def: 'kWh e kg di GPL misurati sulla lavorazione del lotto, ai prezzi dell’energia del mese; senza misura, lo standard della linea.' },
  { id: 'trasformazioneVar', label: 'Trasformazione variabile', short: 'Trasformaz. var.', def: 'Quota variabile del costo di trasformazione del prodotto (materiali di consumo, usura, manodopera a chiamata).' },
  { id: 'imballi', label: 'Imballi', short: 'Imballi', def: 'Sacchi, big bag e pallet: costo standard per tonnellata del prodotto.' },
  { id: 'mdc1', label: 'Margine di contribuzione I', short: 'MdC I', total: true, def: 'Ricavi netti − costi variabili industriali (materie prime, calo, energia, trasformazione variabile, imballi).' },
  { id: 'trasporti', label: 'Trasporti', short: 'Trasporti', def: 'Costo standard di consegna per tonnellata del prodotto.' },
  { id: 'provvigioni', label: 'Provvigioni', short: 'Provvigioni', def: 'Ricavi netti × percentuale di provvigione dell’agente della consegna.' },
  { id: 'mdc2', label: 'Margine di contribuzione II', short: 'MdC II', total: true, def: 'MdC I − costi variabili commerciali (trasporti e provvigioni). È il «margine di contribuzione» usato nel resto di FeedOS.' },
  { id: 'fissiStabilimento', label: 'Costi fissi di stabilimento', short: 'Fissi stabilimento', def: 'Centri di costo monetari del gruppo «stabilimento»: personale, manutenzione, qualità, logistica interna.' },
  { id: 'fissiCommerciali', label: 'Costi fissi commerciali', short: 'Fissi commerciali', def: 'Centri di costo monetari del gruppo «commerciale» (struttura di vendita fissa).' },
  { id: 'fissiStruttura', label: 'Costi fissi di struttura', short: 'Fissi struttura', def: 'Centri di costo monetari del gruppo «struttura»: amministrazione, direzione, servizi, assicurazioni.' },
  { id: 'ebitda', label: 'EBITDA', short: 'EBITDA', total: true, def: 'MdC II − costi fissi monetari. Margine operativo lordo, prima degli ammortamenti.' },
  { id: 'ammortamenti', label: 'Ammortamenti', short: 'Ammortamenti', def: 'Centri di costo non monetari (cash = no): quote di ammortamento di impianti e fabbricati.' },
  { id: 'ebit', label: 'EBIT', short: 'EBIT', total: true, def: 'EBITDA − ammortamenti. Risultato operativo gestionale.' },
  { id: 'oneriCircolante', label: 'Onere figurativo del circolante', short: 'Onere circolante', def: 'Costo del denaro immobilizzato nei crediti: ricavi × (1 + IVA) × tasso × (giorni di pagamento + 15) / 365.' },
  { id: 'ebitDopoCircolante', label: 'EBIT dopo il costo del circolante', short: 'EBIT dopo circolante', total: true, def: 'EBIT − onere figurativo del circolante: quanto rende davvero la gestione dopo aver finanziato i clienti.' },
];
export const LINE = Object.fromEntries(PNL_LINES.map(l => [l.id, l]));

/** Valore (con segno) delle righe variabili a partire dalle somme dei fatti. */
export const VAR_LINE = {
  ricaviLordi: s => n0(s.listRevenue), sconti: s => -n0(s.discount), ricaviNetti: s => n0(s.revenue),
  materiePrime: s => -n0(s.raw), calo: s => -n0(s.shrink), energia: s => -n0(s.energy), trasformazioneVar: s => -n0(s.varConv), imballi: s => -n0(s.pack),
  mdc1: s => n0(s.mc1), trasporti: s => -n0(s.logistics), provvigioni: s => -n0(s.commission), mdc2: s => n0(s.mc2), oneriCircolante: s => -n0(s.finCost),
};
/** Righe dei costi fissi e gruppo dei centri che le alimentano. */
export const FIXED_LINE = { fissiStabilimento: 'stabilimento', fissiCommerciali: 'commerciale', fissiStruttura: 'struttura', ammortamenti: 'nonCash' };

/**
 * Costi fissi divisi come il conto economico: monetari per gruppo (stabilimento, commerciale, struttura) e non monetari.
 * Un centro sconosciuto conta come monetario di struttura (stessa regola di fixedFor). Senza anagrafica dei centri
 * gli ammortamenti si tolgono dal gruppo stabilimento.
 */
export function fixedSplit(fixed, centers) {
  if (fixed?.split) return fixed.split;
  const out = { stabilimento: 0, commerciale: 0, struttura: 0, nonCash: 0 };
  if (!fixed) return out;
  if (centers) {
    const cc = byId(centers);
    for (const [id, v] of Object.entries(fixed.byCenter || {})) {
      const c = cc[id];
      if (c?.cash === false) { out.nonCash += n0(v); continue; }
      out[GROUPS.includes(c?.group) ? c.group : 'struttura'] += n0(v);
    }
    return out;
  }
  for (const g of GROUPS) out[g] = n0(fixed.byGroup?.[g]);
  out.nonCash = n0(fixed.nonCash);
  let rest = out.nonCash;
  for (const g of ['stabilimento', 'struttura', 'commerciale']) { const x = Math.min(out[g], rest); out[g] -= x; rest -= x; }
  return out;
}

/**
 * Conto economico da somme dei fatti (total) e costi fissi (fixed, forma di fixedFor).
 * → {lines: [{id, label, short, total, def, value, perT, pctRev}], by: {id: valore}, tonnes, revenueNet, split, fixedTotal}
 */
export function pnl(total, fixed, centers) {
  const s = total || {};
  const split = fixedSplit(fixed, centers);
  const raw = {
    ...Object.fromEntries(Object.entries(VAR_LINE).filter(([id]) => !LINE[id].total).map(([id, f]) => [id, f(s)])),
    fissiStabilimento: -split.stabilimento, fissiCommerciali: -split.commerciale, fissiStruttura: -split.struttura, ammortamenti: -split.nonCash,
  };
  const t = n0(s.tonnes), rev = n0(s.revenue);
  const by = {};
  let run = 0;
  const lines = PNL_LINES.map(l => {
    const value = l.total ? run : raw[l.id] || 0;
    if (!l.total) run += value;
    by[l.id] = value;
    return { ...l, total: !!l.total, value, perT: t > 0 ? value / t : null, pctRev: Math.abs(rev) > 1e-9 ? value / rev : null };
  });
  return { lines, by, tonnes: t, revenueNet: rev, split, fixedTotal: split.stabilimento + split.commerciale + split.struttura + split.nonCash, sums: s };
}

const isWhole = P => !!P?.from && P.from.slice(8) === '01' && P.to === endOfMonth(P.to);

// ---------------- costi fissi con una sola versione di budget ----------------
/** Versione di budget di riferimento dell'anno secondo le impostazioni (approvata, altrimenti l'ultima bozza), o null. */
export function statusVersion(d, year) {
  const fin = d?.settings?.finance || {};
  return fin.budgetStatus?.[year]?.version ?? (fin.budget && +fin.budget.year === +year ? fin.budget.version : null) ?? null;
}
const frCache = new WeakMap();
/**
 * Costi fissi da passare a fixedFor: tutti i consuntivi e, negli anni con più versioni di budget (revisioni),
 * i soli costi di budget della versione di riferimento. Senza questo filtro un mese stimato sommerebbe B e R1.
 */
export function fixedRows(d) {
  const rows = d?.fixedCosts || EMPTY;
  const fin = d?.settings?.finance;
  const hit = frCache.get(rows);
  if (hit && hit.fin === fin) return hit.out;
  const vers = {};
  for (const r of rows) if (r.kind === 'budget') (vers[String(r.month).slice(0, 4)] ||= new Set()).add(r.version || 'B');
  const keep = {};
  for (const [y, s] of Object.entries(vers)) if (s.size > 1) { const sv = statusVersion(d, y); keep[y] = sv && s.has(sv) ? sv : [...s].pop(); }
  const out = Object.keys(keep).length ? rows.filter(r => { if (r.kind !== 'budget') return true; const k = keep[String(r.month).slice(0, 4)]; return !k || (r.version || 'B') === k; }) : rows;
  frCache.set(rows, { fin, out });
  return out;
}

/** Primo giorno con fatti di spedizione (memorizzato per elenco). */
const firstCache = new WeakMap();
export function firstFactDate(facts) {
  if (!facts) return null;
  if (firstCache.has(facts)) return firstCache.get(facts);
  let s = null;
  for (const f of facts) if (f.date && (s == null || f.date < s)) s = f.date;
  firstCache.set(facts, s);
  return s;
}

/**
 * Copertura effettiva di P: giorni con fatti (dalla prima consegna) più i giorni coperti dallo storico mensile prima dei fatti,
 * sul totale dei giorni. Sotto 0,9 il confronto non è omogeneo (es. il primo mese, parziale).
 */
export function effectiveCoverage(d, ctx, P) {
  if (!P?.from || !P?.to) return null;
  const days = daysBetween(P.from, P.to) + 1;
  const first = firstFactDate(ctx?.facts || EMPTY);
  const fm = first ? first.slice(0, 7) : null;
  let cov = 0;
  if (first && first <= P.to) cov += daysBetween(first > P.from ? first : P.from, P.to) + 1;
  const hm = new Set();
  for (const h of d.salesHistory || EMPTY) { const m = String(h.month || '').slice(0, 7); if (m && (!fm || m < fm) && monthFraction(m, P) > 0) hm.add(m); }
  for (const m of hm) cov += monthFraction(m, P) * daysInMonth(m); // mesi interi e parziali (ripartiti per giorni)
  return Math.max(0, Math.min(1, cov / days));
}

// ---------------- storico mensile ripartito per giorni ----------------
const SCALE = ['tonnes', 'revenue', 'listRevenue', 'discount', 'raw', 'shrink', 'energy', 'varConv', 'pack', 'fixConv', 'logistics', 'commission', 'finCost', 'replVar', 'n'];
const has = v => v != null && v !== '' && Number.isFinite(+v);
/**
 * Righe dello storico mensile dei mesi solo in parte dentro P (e precedenti ai fatti), ripartite per giorni:
 * ogni valore × quota del mese nel periodo. Così un periodo mobile (12 mesi, trimestre…) si confronta anche con lo storico.
 */
export function partialHistory(facts, salesHistory, P) {
  const first = firstFactDate(facts || EMPTY), fm = first ? first.slice(0, 7) : null;
  const out = [];
  for (const h of salesHistory || EMPTY) {
    const m = String(h.month || '').slice(0, 7);
    if (!m || (fm && m >= fm)) continue;
    const f = monthFraction(m, P);
    if (f <= 0 || f >= 1) continue;
    const r = { ...h, month: m, prorata: f, n: has(h.n) ? +h.n * f : f };
    for (const k of SCALE) if (k !== 'n' && has(h[k])) r[k] = +h[k] * f;
    out.push(r);
  }
  return out;
}
/** aggregateFacts più lo storico dei mesi parziali ripartito per giorni (stessa forma: {rows, total, historyMonths, partialMonths}). */
export function aggregate(facts, salesHistory, P, keys = []) {
  const a = aggregateFacts(facts || EMPTY, salesHistory || EMPTY, P, keys);
  const part = partialHistory(facts, salesHistory, P);
  if (!part.length) return { ...a, partialMonths: [] };
  const months = [...new Set(part.map(h => h.month))].sort();
  const b = aggregateFacts(EMPTY, part, { from: months[0] + '-01', to: endOfMonth(months[months.length - 1]) }, keys);
  const total = { ...a.total };
  for (const k of SUM_KEYS) total[k] = n0(total[k]) + n0(b.total[k]);
  const kk = r => keys.map(x => r[x] ?? '').join('\u0001');
  const map = new Map(a.rows.map(r => [kk(r), { ...r }]));
  for (const r of b.rows) { const k = kk(r), o = map.get(k); if (o) for (const s of SUM_KEYS) o[s] = n0(o[s]) + n0(r[s]); else map.set(k, { ...r }); }
  const rows = [...map.values()].sort((x, y) => { for (const k of keys) { const u = String(x[k] ?? ''), v = String(y[k] ?? ''); if (u !== v) return u < v ? -1 : 1; } return 0; });
  return { rows, total, historyMonths: [...new Set([...a.historyMonths, ...months])].sort(), partialMonths: months };
}

// ---------------- mesi chiusi ----------------
/** Chiusura del mese con stato 'chiuso', o null. */
export function closingOf(d, month) {
  const c = (d.closings || EMPTY).find(x => (x.month || x.id) === month);
  return c && c.status === 'chiuso' ? c : null;
}
/**
 * Conto economico congelato dei mesi indicati (somma delle chiusure con stato 'chiuso'), o null se un mese non è chiuso.
 * → stesso oggetto di pnl() con frozen: true, closedAt (ultima chiusura) e months.
 */
export function frozenFor(d, months) {
  if (!months?.length) return null;
  const total = Object.fromEntries(SUM_KEYS.map(k => [k, 0]));
  const fixed = { total: 0, cash: 0, nonCash: 0, byCenter: {}, byGroup: { stabilimento: 0, struttura: 0, commerciale: 0 }, split: { stabilimento: 0, commerciale: 0, struttura: 0, nonCash: 0 } };
  let closedAt = null;
  const sources = new Set();
  for (const m of months) {
    const c = closingOf(d, m);
    if (!c || !c.pnl) return null;
    for (const k of SUM_KEYS) total[k] += n0(c.pnl[k]);
    const f = c.fixed || {};
    fixed.total += n0(f.total); fixed.cash += n0(f.cash); fixed.nonCash += n0(f.nonCash);
    for (const [id, v] of Object.entries(f.byCenter || {})) fixed.byCenter[id] = (fixed.byCenter[id] || 0) + n0(v);
    for (const g of GROUPS) fixed.byGroup[g] += n0(f.byGroup?.[g]);
    const sp = f.split || fixedSplit(f, d.costCenters || EMPTY);
    for (const k of Object.keys(fixed.split)) fixed.split[k] += n0(sp[k]);
    if (c.closedAt && (!closedAt || c.closedAt > closedAt)) closedAt = c.closedAt;
    sources.add(c.source || 'feedos');
  }
  return { ...pnl(total, fixed), frozen: true, closedAt, months: [...months], sources: [...sources], fixed, estimatedMonths: [], missingMonths: [] };
}

/**
 * Conto economico del periodo P: fatti al costo effettivo (più lo storico mensile prima dei fatti, ripartito per giorni nei mesi parziali)
 * e costi fissi del periodo.
 * Se P è fatto di mesi interi tutti chiusi restituisce i numeri congelati (frozen: true).
 */
export function pnlFor(d, ctx, P) {
  if (!d || !P?.from || !P?.to) return null;
  const months = monthsIn(P);
  if (isWhole(P)) { const fr = frozenFor(d, months); if (fr) return fr; }
  const facts = ctx?.facts || makeCtx(d).facts;
  const a = aggregate(facts, d.salesHistory || EMPTY, P);
  const fixed = fixedFor(fixedRows(d), d.costCenters || EMPTY, P);
  fixed.split = fixedSplit(fixed, d.costCenters || EMPTY);
  return { ...pnl(a.total, fixed), frozen: false, fixed, estimatedMonths: fixed.estimatedMonths, missingMonths: fixed.missingMonths, partialFixedMonths: partialFixedMonths(d, months),
    historyMonths: a.historyMonths, partialMonths: a.partialMonths, months };
}

/** Mesi con consuntivo dei costi fissi solo per una parte dei centri (nel conto i centri mancanti valgono zero). */
export function partialFixedMonths(d, months) {
  const centers = d.costCenters || EMPTY;
  if (!centers.length) return [];
  const want = new Set(months), have = {};
  for (const r of d.fixedCosts || EMPTY) {
    const m = String(r.month || '').slice(0, 7);
    if ((r.kind || 'consuntivo') !== 'consuntivo' || !want.has(m)) continue;
    (have[m] ||= new Set()).add(r.centerId);
  }
  return months.filter(m => have[m] && centers.some(c => !have[m].has(c.id)));
}

/** Nome leggibile di una chiave di raggruppamento. */
export function keyLabel(d, key, k, ix) {
  if (k == null || k === '') return key === 'agentId' ? 'Senza agente' : 'Non indicato';
  if (key === 'species') return SPECIES[k]?.name || k;
  const coll = { productId: 'products', customerId: 'customers', agentId: 'agents' }[key];
  const map = ix?.[{ productId: 'prod', customerId: 'cust', agentId: 'agent' }[key]];
  const x = map ? map[k] : (d[coll] || EMPTY).find(r => r.id === k);
  return x?.name || k;
}

/**
 * Conto per prodotto, cliente, agente o specie nel periodo P (fatti più storico).
 * → [{key, label, tonnes, revenue, mdc1, mdc2, mdc2T, share, sums}] ordinati per MdC II decrescente; share = quota dei ricavi.
 */
export function pnlBy(d, ctx, P, key = 'productId') {
  const facts = ctx?.facts || makeCtx(d).facts;
  const a = aggregate(facts, d.salesHistory || EMPTY, P, [key]);
  const rev = a.total.revenue;
  return a.rows.map(r => ({
    key: r[key], label: keyLabel(d, key, r[key], ctx?.ix), tonnes: r.tonnes, revenue: r.revenue, mdc1: r.mc1, mdc2: r.mc2,
    mdc2T: r.tonnes > 0 ? r.mc2 / r.tonnes : null, share: Math.abs(rev) > 1e-9 ? r.revenue / rev : null, sums: r,
  })).sort((x, y) => y.mdc2 - x.mdc2);
}

/** Confronto riga per riga: {id, label, value, cmp, delta, deltaPct, perT, cmpPerT, deltaPerT, …}. */
export function compareLines(cur, cmp) {
  const cl = Object.fromEntries((cmp?.lines || EMPTY).map(l => [l.id, l]));
  return (cur?.lines || EMPTY).map(l => {
    const c = cl[l.id];
    const cv = c ? c.value : null;
    const delta = cv == null ? null : l.value - cv;
    return {
      ...l, cmp: cv, cmpPerT: c?.perT ?? null, cmpPctRev: c?.pctRev ?? null, delta,
      deltaPct: delta == null || Math.abs(cv) < 0.5 ? null : delta / Math.abs(cv), // sotto 0,5 € la percentuale non ha senso
      deltaPerT: l.perT != null && c?.perT != null ? l.perT - c.perT : null,
    };
  });
}

/** Effetto scorte: costo variabile ai prezzi di oggi − costo variabile effettivo dei lotti (positivo = le scorte hanno protetto il margine). */
export function stockEffect(total) {
  const s = total || {};
  return n0(s.replVar) - (n0(s.raw) + n0(s.shrink) + n0(s.energy) + n0(s.varConv) + n0(s.pack));
}
export const STOCK_EFFECT_LABEL = 'Effetto scorte';

/**
 * Serie mensile: per ogni mese 'YYYY-MM' {month, tonnes, revenue, mdc1, mdc2, mdc2T, fixed, ebitda, ebit, bepT, open, frozen, estimatedFixed, partial}.
 * Il mese in corso arriva a oggi (open); i mesi chiusi usano i numeri congelati; bepT = fissi / MdC II per t.
 */
export function monthlySeries(d, ctx, months) {
  const today = ctx?.today || null, tm = today ? today.slice(0, 7) : null;
  const facts = ctx?.facts || makeCtx(d).facts;
  const first = firstFactDate(facts);
  const hist = new Set((d.salesHistory || EMPTY).map(h => String(h.month || '').slice(0, 7)));
  return (months || EMPTY).map(m => {
    const open = !!tm && m === tm;
    // primo mese dei fatti iniziato a metà (e senza storico): i confronti non sono omogenei
    const partial = !!first && first.slice(0, 7) === m && first > m + '-01' && !hist.has(m);
    const future = !!tm && m > tm;
    const P = { from: m + '-01', to: open ? today : endOfMonth(m) };
    let p, frozen = false, estimatedFixed = false, missingFixed = false;
    const fr = !open && !future ? frozenFor(d, [m]) : null;
    if (fr) { p = fr; frozen = true; }
    else if (future) p = pnl({}, null);
    else {
      const a = aggregateFacts(facts, d.salesHistory || EMPTY, P);
      const fixed = fixedFor(fixedRows(d), d.costCenters || EMPTY, P);
      fixed.split = fixedSplit(fixed, d.costCenters || EMPTY);
      p = pnl(a.total, fixed);
      estimatedFixed = fixed.estimatedMonths.includes(m); missingFixed = fixed.missingMonths.includes(m);
    }
    const t = p.tonnes, mc2 = p.by.mdc2, fixedTot = p.fixedTotal, mdc2T = t > 0 ? mc2 / t : null;
    return {
      month: m, tonnes: t, revenue: p.revenueNet, mdc1: p.by.mdc1, mdc2: mc2, mdc2T, fixed: fixedTot, ebitda: p.by.ebitda, ebit: p.by.ebit,
      bepT: mdc2T > 0 ? fixedTot / mdc2T : null, open, future, frozen, estimatedFixed, missingFixed, partial, firstDay: partial ? first : null,
      days: open ? daysBetween(P.from, P.to) + 1 : daysInMonth(m),
    };
  });
}

/** Ultimi n mesi fino al mese di oggi compreso: ['YYYY-MM', …]. */
export function lastMonths(today, n = 13) {
  const out = [];
  let m = String(today).slice(0, 7);
  for (let i = 0; i < n; i++) { out.unshift(m); const [y, mm] = m.split('-').map(Number); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; }
  return out;
}

/** Somma due oggetti di somme dei fatti (per totali di più periodi). */
export function addSums(a, b) { const o = {}; for (const k of SUM_KEYS) o[k] = n0(a?.[k]) + n0(b?.[k]); return o; }

/** Giorno prima: utile per i periodi aperti. */
export const dayBefore = s => addDays(s, -1);
