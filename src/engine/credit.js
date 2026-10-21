/* FeedOS 17 · Crediti verso clienti, fidi, DSO e rischio (pacchetto WP2).
 * Il partitario (fatture, incassi, scadenze, ritardi) sta in cash.js e qui si riesporta; questo modulo aggiunge anzianità,
 * esposizione e fido, punteggio di rischio, perdita attesa, operazioni di incasso e sollecito, segnali e sezione del report.
 * Grafo aciclico: actuals ← inventory ← cash ← credit. Tutto puro (usabile nei test in node).
 * Contratto della fondazione: creditSummary(d, today), financeSignals(d, ctx), financeReportSection(d, ctx, P, C). */
import { ledger, monthlyGross, dsoCountBack, dsoContract, invoicesOf, paidSoFar, vatOf, finOf, todayOf, cashLowPoint, workingCapital } from './cash.js';
import { slowMovers } from './inventory.js';
import { nextCode } from '../core/codes.js';
import { applyOpsTo } from '../core/ops.js';
import { addDays, daysBetween, sum, byId, nf, dateIt, uid } from '../core/util.js';

export { invoicesFromShipments, invoicesOf, openItems, avgDelay, dsoCountBack, dsoContract, dueDateFor, customerTerms, ledger, monthlyGross, paidSoFar } from './cash.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const r2 = v => Math.round(v * 100) / 100;
const EMPTY = [];
const eur = v => nf(v) + ' €';
const pc = v => nf(v * 100, 0) + '%';

const caches = new Map();
function cached(name, deps, fn, max = 6) {
  let list = caches.get(name);
  if (!list) caches.set(name, list = []);
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/** Probabilità di insolvenza per classe (%), sovrascrivibili in settings.finance.pd. */
export const PD_DEFAULT = Object.freeze({ A: 0.5, B: 2, C: 6, D: 20 });
/** Perdita in caso di insolvenza (%), settings.finance.lgd. */
export const LGD_DEFAULT = 60;
/** Quote di svalutazione suggerite per fascia di scaduto (1–30, 31–60, 61–90, oltre 90 giorni). */
export const WRITE_DOWN = Object.freeze([0.01, 0.05, 0.2, 0.5]);
export const pdOf = d => ({ ...PD_DEFAULT, ...Object.fromEntries(Object.entries(finOf(d).pd || {}).filter(([, v]) => has(v)).map(([k, v]) => [k, +v])) });
export const lgdOf = d => (has(finOf(d).lgd) ? +finOf(d).lgd : LGD_DEFAULT);

/* ---------- anzianità ---------- */
export const AGING_BUCKETS = [
  { id: 'b0_30', group: 'aScadere', label: 'A scadere entro 30 giorni', short: '0–30' },
  { id: 'b31_60', group: 'aScadere', label: 'A scadere tra 31 e 60 giorni', short: '31–60' },
  { id: 'oltre60', group: 'aScadere', label: 'A scadere oltre 60 giorni', short: '> 60' },
  { id: 'b1_30', group: 'scaduto', label: 'Scaduto da 1–30 giorni', short: '1–30' },
  { id: 'b31_60', group: 'scaduto', label: 'Scaduto da 31–60 giorni', short: '31–60' },
  { id: 'b61_90', group: 'scaduto', label: 'Scaduto da 61–90 giorni', short: '61–90' },
  { id: 'oltre90', group: 'scaduto', label: 'Scaduto da oltre 90 giorni', short: '> 90' },
];
/** Anzianità delle partite aperte: a scadere (0–30, 31–60, oltre 60) e scaduto (1–30, 31–60, 61–90, oltre 90). Le fasce sommano il totale. */
export function aging(open, today) {
  const a = { aScadere: { b0_30: 0, b31_60: 0, oltre60: 0 }, scaduto: { b1_30: 0, b31_60: 0, b61_90: 0, oltre90: 0 }, total: 0 };
  for (const it of open || EMPTY) {
    const v = has(it.residual) ? +it.residual : n0(it.total) - n0(it.paid);
    const od = it.dueDate ? daysBetween(it.dueDate, today) : 0;
    if (od > 0) a.scaduto[od <= 30 ? 'b1_30' : od <= 60 ? 'b31_60' : od <= 90 ? 'b61_90' : 'oltre90'] += v;
    else a.aScadere[-od <= 30 ? 'b0_30' : -od <= 60 ? 'b31_60' : 'oltre60'] += v;
    a.total += v;
  }
  return a;
}
/** Svalutazione suggerita: scaduto per fascia × 1%, 5%, 20%, 50%. */
export function writeDownSuggestion(ag) {
  const s = ag?.scaduto || {};
  return n0(s.b1_30) * WRITE_DOWN[0] + n0(s.b31_60) * WRITE_DOWN[1] + n0(s.b61_90) * WRITE_DOWN[2] + n0(s.oltre90) * WRITE_DOWN[3];
}

/* ---------- esposizione e rischio ---------- */
/** Offerte accettate negli ultimi 90 giorni non ancora consegnate (t dell'offerta − t consegnate dopo l'offerta), lorde d'IVA, per cliente. */
function acceptedOffers(d, today) {
  return cached('offers|' + today, [d.offers, d.shipments, d.settings?.finance], () => {
    const vat = vatOf(d), from = addDays(today, -90), out = {};
    const acc = (d.offers || EMPTY).filter(o => o.status === 'accettata' && o.date && o.date >= from && o.date <= today);
    if (!acc.length) return out;
    const ship = new Map();
    for (const s of d.shipments || EMPTY) { const k = s.customerId + '|' + s.productId; let a = ship.get(k); if (!a) ship.set(k, a = []); a.push(s); }
    for (const o of acc) {
      const delivered = sum((ship.get(o.customerId + '|' + o.productId) || EMPTY).filter(s => s.date >= o.date && s.date <= today), s => s.tonnes);
      const rem = Math.max(0, n0(o.tonnes) - delivered);
      if (rem > 0) out[o.customerId] = (out[o.customerId] || 0) + rem * n0(o.price) * (1 + vat / 100);
    }
    return out;
  });
}
/** Esposizione del cliente: crediti aperti + consegne da fatturare × (1 + IVA) + offerte accettate da consegnare × prezzo × t × (1 + IVA). */
export function exposure(d, custId, today = todayOf(d)) {
  const b = ledger(d, today).byCust[custId];
  return n0(b?.open) + n0(b?.uninvGross) + n0(acceptedOffers(d, today)[custId]);
}

/**
 * Punteggio di rischio 0–100 con il dettaglio:
 * 35 × min(1, scaduto oltre 60 gg / esposizione) + 25 × min(1, ritardo medio / 60) + 15 se il ritardo degli ultimi 3 mesi supera
 * quello dei 12 mesi di oltre 5 giorni (tolleranza contro il rumore) + 15 × min(1, utilizzo del fido) + 10 se c'è un insoluto nei 12 mesi.
 * Classe A < 20, B < 40, C < 60, D ≥ 60.
 */
export function riskScore({ exposure: ex = 0, overdue60 = 0, avgDelay = 0, delay3 = null, delay12 = null, util = null, insoluta = false } = {}) {
  const parts = [
    { key: 'scaduto60', label: 'Scaduto oltre 60 giorni sull’esposizione', max: 35, points: 35 * Math.min(1, ex > 0 ? Math.max(0, overdue60) / ex : 0), value: ex > 0 ? overdue60 / ex : 0 },
    { key: 'ritardo', label: 'Ritardo medio d’incasso (60 giorni = massimo)', max: 25, points: 25 * Math.min(1, Math.max(0, n0(avgDelay)) / 60), value: avgDelay },
    { key: 'tendenza', label: 'Ritardo in peggioramento negli ultimi 3 mesi', max: 15, points: delay3 != null && delay12 != null && delay3 > delay12 + 5 ? 15 : 0, value: delay3 },
    { key: 'fido', label: 'Utilizzo del fido', max: 15, points: 15 * Math.min(1, Math.max(0, n0(util))), value: util },
    { key: 'insoluto', label: 'Insoluto negli ultimi 12 mesi', max: 10, points: insoluta ? 10 : 0, value: !!insoluta },
  ];
  const score = sum(parts, p => p.points);
  return { score, cls: score < 20 ? 'A' : score < 40 ? 'B' : score < 60 ? 'C' : 'D', parts };
}
/** Primo giorno dei dati dei crediti: la prima fattura o, se viene prima, la prima consegna (da cui si stimano le fatture). */
export function creditStart(d) {
  let s = null;
  for (const x of [...(d.invoices || EMPTY), ...(d.shipments || EMPTY)]) if (x.date && (!s || x.date < s)) s = x.date;
  return s;
}
/** Giorni di dati che servono prima di una data perché i suoi crediti aperti siano completi (termini di pagamento e ritardi). */
export const AR_HORIZON = 90;

/** Perdita attesa = esposizione × PD della classe × LGD. */
export function expectedLoss(ex, cls, d) { return n0(ex) * (pdOf(d)[cls] ?? PD_DEFAULT.D) / 100 * lgdOf(d) / 100; }

/**
 * Sintesi dei crediti alla data (contratto): aperti, scaduti, DSO a ritroso e contrattuale, dettaglio per cliente
 * {open, overdue, exposure, creditLimit, util, avgDelay, riskClass, score, …}; in più anzianità, consegne da fatturare,
 * perdita attesa, svalutazione suggerita e la fonte («stimato» se le fatture sono ricostruite dalle consegne).
 */
export function creditSummary(d, today = todayOf(d)) {
  return cached('cs|' + today, [d.invoices, d.payments, d.shipments, d.customers, d.offers, d.settings?.finance], () => {
    const L = ledger(d, today), offers = acceptedOffers(d, today), pd = pdOf(d), lgd = lgdOf(d);
    const byCustomer = {};
    const classes = { A: 0, B: 0, C: 0, D: 0 };
    let exposureTot = 0, el = 0, overLimit = 0, nearLimit = 0, offersTot = 0;
    const ids = new Set([...(d.customers || EMPTY).map(c => c.id), ...Object.keys(L.byCust)]);
    const cust = byId(d.customers || EMPTY);
    for (const id of ids) {
      const b = L.byCust[id] || {}, c = cust[id];
      const off = n0(offers[id]);
      const ex = n0(b.open) + n0(b.uninvGross) + off;
      const limit = has(c?.creditLimit) && +c.creditLimit > 0 ? +c.creditLimit : null;
      const util = limit ? ex / limit : null;
      const rs = riskScore({ exposure: ex, overdue60: n0(b.overdue60), avgDelay: n0(b.delay12), delay3: b.delay3 ?? null, delay12: b.nPaid12 ? b.delay12 : null, util, insoluta: !!b.insoluta12 });
      const active = ex > 0.5 || n0(b.nPaid12) > 0;
      const loss = ex * (pd[rs.cls] ?? 20) / 100 * lgd / 100;
      byCustomer[id] = {
        open: n0(b.open), overdue: n0(b.overdue), overdue30: n0(b.overdue30), overdue60: n0(b.overdue60), nOpen: n0(b.nOpen), oldestDue: b.oldestDue || null,
        uninvoiced: n0(b.uninvGross), offers: off, exposure: ex, creditLimit: limit, util,
        avgDelay: n0(b.delay12), delay3: b.delay3 ?? null, nPaid12: n0(b.nPaid12), insoluta: !!b.insoluta12, lastPayment: b.lastPayment || null,
        riskClass: rs.cls, score: rs.score, breakdown: rs.parts, expectedLoss: loss, active,
      };
      if (active) {
        classes[rs.cls]++; exposureTot += ex; el += loss; offersTot += off;
        if (util != null && util >= 1) overLimit++; else if (util != null && util >= 0.9) nearLimit++;
      }
    }
    const ag = aging(L.open, today);
    const t = L.totals;
    return {
      today, open: t.open, overdue: t.overdue, overdue30: t.overdue30, overdue60: t.overdue60, nOpen: t.nOpen,
      dso: (d.shipments || EMPTY).length || (d.invoices || EMPTY).length ? dsoCountBack(t.open, monthlyGross(d, today), today) : null, dsoContract: dsoContract(d, { from: addDays(today, -364), to: today }),
      byCustomer, aging: ag, uninvoiced: { taxable: L.uninvoiced.taxable, gross: L.uninvoiced.gross, n: L.uninvoiced.n, customers: new Set(L.uninvoiced.list.map(g => g.customerId)).size },
      offersExposure: offersTot, exposure: exposureTot, expectedLoss: el, writeDown: writeDownSuggestion(ag), classes, overLimit, nearLimit,
      estimated: L.hasEstimated, estimatedOnly: L.estimatedOnly, estimatedOpen: t.estimatedOpen,
      source: L.estimatedOnly ? 'stimato' : L.hasEstimated && t.estimatedOpen > 0.5 ? 'misto' : 'fatture', vatPct: L.vat,
    };
  });
}

/* ---------- operazioni (store.batch) ---------- */
const STRIP = ['estimated', 'assumedPaid', 'paid', 'residual', 'daysOverdue', 'daysToDue'];
/**
 * Operazioni per registrare un incasso: aggiunge il pagamento e aggiorna stato, importo pagato e data della fattura
 * ('pagata' a saldo, 'parziale' altrimenti; insoluti e contestati restano tali finché non sono saldati).
 * Una fattura solo stimata si registra prima, con il numero FT successivo (contatore nelle impostazioni nello stesso passo).
 * → ops (vuoto se la fattura non esiste o l'importo non è positivo)
 */
export function registerPaymentOps(d, invoiceId, { date, amount, method, note } = {}, today = todayOf(d)) {
  const amt = r2(n0(amount));
  if (!(amt > 0)) return [];
  const day = date || today;
  const real = (d.invoices || EMPTY).find(x => x.id === invoiceId);
  // dal partitario: una fattura importata senza scadenza o totale li riceve dai termini del cliente
  const inv = invoicesOf(d, today).find(x => x.id === invoiceId) || invoicesOf(d, day).find(x => x.id === invoiceId) || real;
  if (!inv) return [];
  const ops = [];
  let target = inv, materialized = false;
  if (!real) {
    const { code, op } = nextCode(d, 'FT', inv.date);
    const base = Object.fromEntries(Object.entries(inv).filter(([k]) => !STRIP.includes(k)));
    let id = `ft-${inv.customerId}-${inv.month || String(inv.date).slice(0, 7)}`, k = 2;
    while ((d.invoices || EMPTY).some(x => x.id === id)) id = `ft-${inv.customerId}-${inv.month}-${k++}`;
    target = { ...base, id, number: code, source: 'stimata', status: 'aperta', paidAmount: 0, paidAt: null, registeredAt: today };
    materialized = true;
    ops.push(op);
  }
  const prev = materialized ? 0 : paidSoFar(d, target);
  const paid = r2(prev + amt), residual = r2(n0(target.total) - paid);
  const status = residual <= 0.005 ? 'pagata' : target.status === 'insoluta' || target.status === 'contestata' ? target.status : 'parziale';
  const patch = { status, paidAmount: paid, paidAt: residual <= 0.005 ? day : target.paidAt ?? null, lastPaymentAt: day };
  const pay = { id: uid('pag'), date: day, customerId: target.customerId, invoiceId: target.id, amount: amt, method: method || target.method || 'bonifico', note: note || '' };
  if (materialized) ops.push({ kind: 'add', coll: 'invoices', obj: { ...target, ...patch } });
  ops.push({ kind: 'add', coll: 'payments', obj: pay });
  if (!materialized) ops.push({ kind: 'update', coll: 'invoices', id: target.id, patch });
  return ops;
}

/**
 * Un incasso ripartito sulle partite aperte del cliente, dalla scadenza più vecchia (le contestate si saltano).
 * → {ops, allocated, rest, n} — ops per un unico store.batch.
 */
export function allocatePaymentOps(d, custId, { date, amount, method, note } = {}, today = todayOf(d)) {
  let rest = r2(n0(amount)), cur = d, n = 0;
  const ops = [];
  const items = (ledger(d, today).byCust[custId]?.items || EMPTY).filter(i => i.residual > 0.005 && i.status !== 'contestata');
  for (const it of items) {
    if (rest <= 0.005) break;
    const a = r2(Math.min(rest, it.residual));
    const o = registerPaymentOps(cur, it.id, { date, amount: a, method, note }, today);
    if (!o.length) continue;
    cur = applyOpsTo(cur, o, { force: true }).data;
    ops.push(...o); rest = r2(rest - a); n++;
  }
  return { ops, allocated: r2(n0(amount) - rest), rest, n };
}

/** Operazioni per un sollecito: un'attività dell'Amministrazione (area finanza) con lo scaduto del cliente; vuoto se non c'è scaduto. */
export function dunningOps(d, custId, today = todayOf(d)) {
  const b = ledger(d, today).byCust[custId];
  const over = (b?.items || EMPTY).filter(i => i.daysOverdue > 0 && i.residual > 0.005);
  if (!over.length) return [];
  const c = (d.customers || EMPTY).find(x => x.id === custId);
  const amount = sum(over, i => i.residual), oldest = Math.max(...over.map(i => i.daysOverdue));
  return [{ kind: 'add', coll: 'tasks', obj: {
    title: `Sollecito di pagamento: ${c?.name || custId}`,
    detail: `Scaduto ${eur(amount)} su ${over.length} ${over.length === 1 ? 'fattura' : 'fatture'} (la più vecchia scaduta da ${oldest} giorni). Lettera di sollecito emessa il ${dateIt(today)}: verificare l’incasso entro una settimana.`,
    area: 'finanza', owner: 'Amministrazione', due: addDays(today, 7), status: 'aperto', priority: oldest > 60 ? 'alta' : 'media', source: 'sollecito',
    createdAt: today, customerId: custId, amount: r2(amount), invoices: over.map(i => i.number || i.id), link: { area: 'finanza', tab: 'crediti', id: custId },
  } }];
}

/* ---------- segnali ---------- */
/**
 * Segnali di finanza: fido superato (critico) o quasi esaurito (≥ 90%, attenzione); scaduto oltre 30 giorni sopra 5 mila €
 * (settings.finance.overdueSignalAbs); cassa prevista oltre le linee di credito (critico) o sotto zero (attenzione), con la settimana;
 * materiali lenti o in eccesso per più di 20 mila € (info); lotti MP in scadenza entro 30 giorni (attenzione).
 * Oltre 5 clienti dello stesso tipo si raggruppano in un segnale solo.
 */
export function financeSignals(d, ctx) {
  const today = ctx?.today || todayOf(d);
  const out = [];
  const custBy = byId(d.customers || EMPTY);
  const link = id => ({ area: 'finanza', tab: 'crediti', id });
  if ((d.invoices || EMPTY).length || (d.shipments || EMPTY).length) {
    const cs = creditSummary(d, today);
    const tag = cs.source === 'fatture' ? '' : ' (stimato)';
    const rows = Object.entries(cs.byCustomer).map(([id, b]) => ({ id, b, c: custBy[id] })).filter(r => r.c);
    const credit = b => b.open + b.uninvoiced; // credito già maturato (senza le offerte da consegnare)
    const comp = b => `crediti aperti ${eur(b.open)}${b.uninvoiced > 0.5 ? `, consegne da fatturare ${eur(b.uninvoiced)}` : ''}${b.offers > 0.5 ? `, offerte accettate da consegnare ${eur(b.offers)}` : ''}`;
    const lim = rows.filter(r => r.b.util != null && r.b.util >= 1);
    const over = lim.filter(r => credit(r.b) >= r.b.creditLimit).sort((x, y) => (y.b.exposure - y.b.creditLimit) - (x.b.exposure - x.b.creditLimit));
    const viaOffers = lim.filter(r => credit(r.b) < r.b.creditLimit).sort((x, y) => (y.b.exposure - y.b.creditLimit) - (x.b.exposure - x.b.creditLimit));
    for (const { id, b, c } of over) out.push({
      key: `fido:${id}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'critico', agentId: c.agentId,
      title: `Fido superato: ${c.name}`,
      why: `Esposizione ${eur(b.exposure)} su un fido di ${eur(b.creditLimit)} (${pc(b.util)})${tag}: ${comp(b)}.${b.overdue > 0.5 ? ` Scaduto ${eur(b.overdue)}.` : ''} Classe di rischio ${b.riskClass}.`,
      action: 'Sospendere nuove consegne a credito finché l’esposizione non rientra, oppure rivedere il fido con la direzione; sollecitare lo scaduto.',
      impact: b.exposure - b.creditLimit, link: link(id),
    });
    // oltre il fido solo per le offerte accettate ancora da consegnare: un impegno, non ancora un credito
    viaOffers.slice(0, 3).forEach(({ id, b, c }) => out.push({
      key: `fido-offerte:${id}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'attenzione', agentId: c.agentId,
      title: `Offerte accettate oltre il fido: ${c.name}`,
      why: `Con le consegne promesse l’esposizione arriva a ${eur(b.exposure)} su un fido di ${eur(b.creditLimit)} (${pc(b.util)})${tag}: ${comp(b)}.`,
      action: 'Verificare il fido prima di programmare le consegne dell’offerta, o chiedere un pagamento più rapido delle fatture aperte.',
      impact: b.exposure - b.creditLimit, link: link(id),
    }));
    if (viaOffers.length > 3) out.push({
      key: `fido-offerte:altri:${viaOffers.slice(3).map(r => r.id).join(',')}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'info',
      title: `Altri ${viaOffers.length - 3} clienti oltre il fido con le offerte accettate`,
      why: viaOffers.slice(3, 7).map(r => `${r.c.name} ${pc(r.b.util)}`).join('; ') + (viaOffers.length > 7 ? '…' : '') + tag + '.',
      action: 'Rivedere i fidi in Finanza › Crediti e fidi.', impact: sum(viaOffers.slice(3), r => r.b.exposure - r.b.creditLimit), link: link(),
    });
    const near = rows.filter(r => r.b.util != null && r.b.util >= 0.9 && r.b.util < 1).sort((x, y) => y.b.util - x.b.util);
    if (near.length) out.push({
      key: `fido90:${near.map(r => r.id).join(',')}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'attenzione',
      ...(near.length === 1 ? { agentId: near[0].c.agentId } : {}),
      title: near.length === 1 ? `Fido quasi esaurito: ${near[0].c.name}` : `${near.length} clienti sopra il 90% del fido`,
      why: near.slice(0, 4).map(r => `${r.c.name} ${pc(r.b.util)} (restano ${eur(r.b.creditLimit - r.b.exposure)})`).join('; ') + (near.length > 4 ? '…' : '') + tag + '.',
      action: 'Concordare l’incasso delle prossime scadenze prima di accettare nuovi ordini rilevanti, o rivedere i fidi.',
      impact: sum(near, r => r.b.exposure) / 20, link: link(near.length === 1 ? near[0].id : undefined),
    });
    const thr = has(finOf(d).overdueSignalAbs) ? +finOf(d).overdueSignalAbs : 5000;
    const late = rows.filter(r => r.b.overdue30 > thr).sort((x, y) => y.b.overdue30 - x.b.overdue30);
    late.slice(0, 3).forEach(({ id, b, c }) => out.push({
      key: `scaduto:${id}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'attenzione', agentId: c.agentId,
      title: `Scaduto oltre 30 giorni: ${c.name}, ${eur(b.overdue30)}`,
      why: `Scaduto totale ${eur(b.overdue)}${b.overdue60 > 0.5 ? `, di cui ${eur(b.overdue60)} oltre 60 giorni` : ''}${tag}; ritardo medio degli incassi ${nf(b.avgDelay)} giorni${b.insoluta ? ', un insoluto negli ultimi 12 mesi' : ''}. Classe di rischio ${b.riskClass} (${nf(b.score)}/100).`,
      action: 'Inviare un sollecito scritto e telefonare all’amministrazione del cliente; valutare il blocco delle consegne se non paga entro 15 giorni.',
      impact: b.overdue30, link: link(id),
    }));
    if (late.length > 3) out.push({
      key: `scaduto:altri:${late.slice(3).map(r => r.id).join(',')}`, area: 'finanza', roles: ['direzione', 'commerciale'], severity: 'attenzione',
      title: `Altri ${late.length - 3} ${late.length - 3 === 1 ? 'cliente' : 'clienti'} con scaduto oltre 30 giorni`,
      why: `Totale ${eur(sum(late.slice(3), r => r.b.overdue30))}: ${late.slice(3, 7).map(r => `${r.c.name} ${eur(r.b.overdue30)}`).join('; ')}${late.length > 7 ? '…' : ''}${tag}.`,
      action: 'Pianificare i solleciti dalla tabella dei clienti in Finanza › Crediti e fidi.', impact: sum(late.slice(3), r => r.b.overdue30), link: link(),
    });
  }
  // cassa
  try {
    const lp = cashLowPoint(d, ctx);
    if (lp && (lp.belowLines || lp.belowZero)) {
      const lines = sum(finOf(d).creditLines || EMPTY, l => n0(l.limit));
      out.push({
        key: `cassa:${lp.belowLines ? 'linee' : 'zero'}:${lp.from}`, area: 'finanza', roles: ['direzione'], severity: lp.belowLines ? 'critico' : 'attenzione',
        title: lp.belowLines ? `Cassa prevista oltre le linee di credito nella settimana del ${dateIt(lp.from, 'dm')}` : `Cassa prevista sotto zero nella settimana del ${dateIt(lp.from, 'dm')}`,
        why: `Saldo minimo previsto ${eur(lp.closing)} (stimato) con linee di credito per ${eur(lines)}: ${lp.belowLines ? `mancano ${eur(-lp.headroom)} oltre i fidi bancari` : `si usano ${eur(-lp.closing)} delle linee, margine residuo ${eur(lp.headroom)}`}.`,
        action: lp.belowLines ? 'Anticipare incassi (sollecito degli scaduti, anticipo fatture), spostare pagamenti non urgenti o chiedere un aumento delle linee prima di quella settimana.' : 'Verificare gli incassi attesi e l’utilizzo delle linee nella cassa a 13 settimane.',
        impact: Math.abs(lp.closing), link: { area: 'finanza', tab: 'cassa' },
      });
    }
  } catch (e) { /* previsione non disponibile: nessun segnale */ }
  // rimanenze lente o in eccesso
  const slow = slowMovers(d, ctx).filter(r => r.excessValue > 20000 || ((r.flags.noNeed || r.flags.old) && r.value > 20000));
  const name = id => (d.ingredients || EMPTY).find(i => i.id === id)?.name || id;
  if (slow.length && slow.length <= 3) for (const r of slow) out.push({
    key: `scorte:${r.ingId}`, area: 'finanza', roles: ['direzione', 'acquisti'], severity: 'info',
    title: `Capitale fermo in ${name(r.ingId).toLowerCase()}: ${eur(r.excessValue > 0.5 ? r.excessValue : r.value)}`,
    why: `${nf(r.t, 1)} t in giacenza per ${eur(r.value)}${r.coverDays != null ? `, copertura ${nf(r.coverDays)} giorni` : ', nessun fabbisogno nelle 8 settimane del piano'}${r.oldestLotDays > 90 ? `, lotto più vecchio di ${r.oldestLotDays} giorni` : ''}. Costo di mantenimento ${eur(r.carryingCost)} l’anno.`,
    action: r.action, impact: r.excessValue || r.value, link: { area: 'finanza', tab: 'rimanenze', id: r.ingId },
  });
  else if (slow.length > 3) out.push({
    key: `scorte:${slow.map(r => r.ingId).join(',')}`, area: 'finanza', roles: ['direzione', 'acquisti'], severity: 'info',
    title: `${slow.length} materie prime lente o in eccesso`,
    why: `${slow.slice(0, 4).map(r => `${name(r.ingId).toLowerCase()} ${eur(r.excessValue > 0.5 ? r.excessValue : r.value)}`).join('; ')}${slow.length > 4 ? '…' : ''}. Capitale in eccesso ${eur(sum(slow, r => r.excessValue))}.`,
    action: 'Aprire Finanza › Rimanenze: sospendere i riordini o usare per primi i lotti indicati.', impact: sum(slow, r => r.excessValue), link: { area: 'finanza', tab: 'rimanenze' },
  });
  // lotti MP in scadenza
  const exp = new Map();
  for (const l of d.ingLots || EMPTY) {
    if (!l.expiry || l.status === 'bloccato' || n0(l.remaining) <= 0.005) continue;
    const days = daysBetween(today, l.expiry);
    if (days > 30) continue;
    const e = exp.get(l.ingId) || { t: 0, v: 0, first: l.expiry, lots: [] };
    e.t += n0(l.remaining); e.v += n0(l.remaining) * n0(l.price); if (l.expiry < e.first) e.first = l.expiry; e.lots.push(l.code || l.id);
    exp.set(l.ingId, e);
  }
  for (const [ingId, e] of exp) out.push({
    key: `scadenza:${ingId}:${e.first}`, area: 'finanza', roles: ['direzione', 'acquisti', 'qualita'], severity: 'attenzione',
    title: `${name(ingId)} in scadenza il ${dateIt(e.first, 'dm')}`,
    why: `${e.lots.length} ${e.lots.length === 1 ? 'lotto' : 'lotti'} (${e.lots.slice(0, 3).join(', ')}) per ${nf(e.t, 1)} t e ${eur(e.v)} scadono entro 30 giorni.`,
    action: 'Programmare l’uso nelle prossime produzioni o concordare il reso con il fornitore.', impact: e.v, link: { area: 'finanza', tab: 'rimanenze', id: ingId },
  });
  return out;
}

/* ---------- report CdA ---------- */
/** Sezione «Finanza» del report: crediti, scaduto, DSO contro contrattuale, ciclo di cassa, punto più basso della cassa; anzianità in tabella. */
export function financeReportSection(d, ctx, P, C) {
  if (!(d.invoices || EMPTY).length && !(d.shipments || EMPTY).length) return null;
  const today = ctx?.today || todayOf(d);
  const asOf = P?.to && P.to < today ? P.to : today;
  const cs = creditSummary(d, asOf);
  const csC = C && !C.budget && C.to ? creditSummary(d, C.to < today ? C.to : today) : null;
  let wc = null, lp = null;
  try { wc = workingCapital(d, ctx, asOf); } catch { /* senza rimanenze */ }
  try { lp = cashLowPoint(d, ctx); } catch { /* senza previsione */ }
  const est = cs.source !== 'fatture';
  const od30 = cs.open > 0 ? cs.overdue30 / cs.open * 100 : 0;
  const kpis = [
    { label: 'Crediti aperti' + (est ? ' (stimato)' : ''), value: cs.open, unit: '€', decimals: 0, ...(csC ? { cmp: { value: csC.open, kind: 'flow', good: 'down' } } : {}) },
    { label: 'Scaduto oltre 30 giorni', value: od30, unit: '%', decimals: 1, status: od30 > 15 ? 'bad' : od30 > 8 ? 'warn' : 'ok', ...(csC && csC.open > 0 ? { cmp: { value: csC.overdue30 / csC.open * 100, kind: 'ratio', good: 'down', unit: '%' } } : {}) },
    { label: 'DSO (a ritroso)', value: cs.dso, unit: 'giorni', decimals: 0, status: cs.dso != null && cs.dsoContract != null ? (cs.dso - cs.dsoContract > 20 ? 'bad' : cs.dso - cs.dsoContract > 10 ? 'warn' : 'ok') : null, ...(csC ? { cmp: { value: csC.dso, kind: 'ratio', good: 'down', unit: 'giorni', decimals: 0 } } : {}) },
    { label: 'DSO contrattuale', value: cs.dsoContract, unit: 'giorni', decimals: 0 },
    { label: 'Ciclo di cassa', value: wc?.ccc ?? null, unit: 'giorni', decimals: 0 },
    { label: 'Punto più basso di cassa (13 settimane)', value: lp?.closing ?? null, unit: '€', decimals: 0, status: lp ? (lp.belowLines ? 'bad' : lp.belowZero ? 'warn' : 'ok') : null },
  ];
  const rows = AGING_BUCKETS.map(b => { const v = cs.aging[b.group][b.id]; return { bucket: b.label, amount: v, share: cs.aging.total > 0 ? v / cs.aging.total : 0 }; });
  rows.push({ bucket: 'Totale crediti aperti', amount: cs.aging.total, share: cs.aging.total > 0 ? 1 : 0 });
  const narrative = [
    `Crediti aperti ${eur(cs.open)}${est ? ' (stimati dalle consegne)' : ''}: DSO ${nf(cs.dso)} giorni contro ${nf(cs.dsoContract)} contrattuali, ${nf((cs.dso ?? 0) - (cs.dsoContract ?? 0))} giorni oltre i termini concordati tra fatturazione a fine mese e ritardi.`,
    `Scaduto ${eur(cs.overdue)}, di cui ${eur(cs.overdue60)} oltre 60 giorni; perdita attesa ${eur(cs.expectedLoss)} e svalutazione suggerita ${eur(cs.writeDown)}. ${cs.overLimit ? `${cs.overLimit} ${cs.overLimit === 1 ? 'cliente supera' : 'clienti superano'} il fido.` : 'Nessun cliente oltre il fido.'}`,
  ];
  if (wc) narrative.push(`Capitale circolante ${eur(wc.nwc)} (crediti ${eur(wc.ar)} + rimanenze ${eur(wc.mp + wc.fg)} − debiti ${eur(wc.ap)}), costo annuo ${eur(wc.costPerYear)} al ${nf(wc.rate, 1)}%; ciclo di cassa ${nf(wc.ccc)} giorni.`);
  if (lp) narrative.push(`Cassa a 13 settimane (stimata): punto più basso ${eur(lp.closing)} nella settimana del ${dateIt(lp.from, 'dm')}, margine sulle linee di credito ${eur(lp.headroom)}.`);
  return {
    id: 'finanza', title: 'Finanza', order: 50, kpis,
    table: { cols: [{ key: 'bucket', label: 'Anzianità dei crediti', align: 'l', fmt: 'text' }, { key: 'amount', label: 'Importo', align: 'r', fmt: 'eur' }, { key: 'share', label: 'Quota', align: 'r', fmt: 'pct' }], rows },
    narrative,
  };
}
