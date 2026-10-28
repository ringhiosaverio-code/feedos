/* FeedOS 17 · Bilancio di massa di stabilimento, inventari fisici e calo effettivo (pacchetto WP6).
 * Libro di una materia prima = Σ lotti ricevuti (accettati o in attesa di esito) − Σ prelievi dei lotti di prodotto
 * + Σ rettifiche (con segno: un calo è negativo). Un lotto quadra quando tonnes − Σ prelievi + Σ rettifiche = residuo.
 * Calo effettivo = differenza maturata fra due conte fisiche consecutive ÷ prelievi dello stesso intervallo:
 * una conta non registrata lascia la sua differenza nel libro, e la conta successiva la contiene già. */
import { sum, uid, addDays } from '../core/util.js';

const inP = (x, P) => x >= P.from && x <= P.to;
/** Lotti fisicamente in stabilimento: accettati, esauriti o in attesa di esito (non i bloccati, respinti al fornitore). */
const onSite = l => l.status === 'accettato' || l.status === 'esaurito' || l.status === 'in attesa';
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id)));

// registro per materia prima con somme progressive (una voce: l'archivio è immutabile, l'identità degli elenchi basta)
let memo = null;
function ledger(d) {
  if (memo && memo.k[0] === d.ingLots && memo.k[1] === d.lots && memo.k[2] === d.adjustments) return memo.v;
  const ev = {}, lotIng = {};
  const push = (ing, date, k, t) => { if (ing && date && t) (ev[ing] ||= []).push({ date, k, t }); };
  for (const l of d.ingLots || []) { lotIng[l.id] = l.ingId; if (onSite(l)) push(l.ingId, l.date, 'in', +l.tonnes || 0); }
  for (const l of d.lots || []) for (const c of l.comp || []) push(c.ing || lotIng[c.l], l.date, 'out', (+c.kg || 0) / 1000);
  for (const a of d.adjustments || []) push(a.ingId, a.date, 'adj', +a.tonnes || 0);
  const v = {};
  for (const [ing, list] of Object.entries(ev)) {
    list.sort(byDate);
    const x = { dates: [], cin: [], cout: [], cadj: [] };
    let i0 = 0, o0 = 0, a0 = 0;
    for (const e of list) {
      if (e.k === 'in') i0 += e.t; else if (e.k === 'out') o0 += e.t; else a0 += e.t;
      const n = x.dates.length;
      if (n && x.dates[n - 1] === e.date) { x.cin[n - 1] = i0; x.cout[n - 1] = o0; x.cadj[n - 1] = a0; }
      else { x.dates.push(e.date); x.cin.push(i0); x.cout.push(o0); x.cadj.push(a0); }
    }
    v[ing] = x;
  }
  memo = { k: [d.ingLots, d.lots, d.adjustments], v };
  return v;
}

/** Ricevuto, prelevato e rettificato cumulati di una materia prima fino alla data inclusa. */
function cumAt(L, ingId, date) {
  const x = L[ingId];
  if (!x || !date) return { in: 0, out: 0, adj: 0 };
  let lo = 0, hi = x.dates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (x.dates[m] <= date) lo = m + 1; else hi = m; }
  return lo ? { in: x.cin[lo - 1], out: x.cout[lo - 1], adj: x.cadj[lo - 1] } : { in: 0, out: 0, adj: 0 };
}

/** Giacenza a libro di una materia prima alla data (inclusa). */
export function bookAt(d, ingId, date) {
  const c = cumAt(ledger(d), ingId, date);
  return c.in - c.out + c.adj;
}

/** Prelievi (t) di una materia prima dopo `from` e fino a `to` incluso. */
export function usedBetween(d, ingId, from, to) {
  const L = ledger(d);
  return cumAt(L, ingId, to).out - cumAt(L, ingId, from).out;
}

/** Lotti di materia prima che non quadrano: |tonnes − Σ prelievi + Σ rettifiche − residuo| > 0,01 t. */
export function integrity(d) {
  const used = {}, adj = {};
  for (const l of d.lots || []) for (const c of l.comp || []) used[c.l] = (used[c.l] || 0) + (+c.kg || 0) / 1000;
  for (const a of d.adjustments || []) if (a.ingLotId) adj[a.ingLotId] = (adj[a.ingLotId] || 0) + (+a.tonnes || 0);
  return (d.ingLots || []).filter(onSite).map(l => ({ id: l.id, code: l.code, ingId: l.ingId, gap: (+l.tonnes || 0) - (used[l.id] || 0) + (adj[l.id] || 0) - (+l.remaining || 0) }))
    .filter(x => Math.abs(x.gap) > 0.01);
}

/**
 * Conte fisiche di una materia prima in ordine di data: libro al momento della conta, differenza (fisico − libro),
 * parte maturata dalla conta precedente (incr), prelievi dell'intervallo e calo % = −incr ÷ prelievi.
 * Il libro registrato sulla conta (bookT) vale anche dopo la registrazione, che porta il libro al fisico.
 */
export function countHistory(d, ingId) {
  const L = ledger(d);
  const out = [];
  let prev = null;
  for (const c of (d.stockCounts || []).filter(x => x.ingId === ingId && x.measuredT != null && x.date).sort(byDate)) {
    const cum = cumAt(L, ingId, c.date);
    const book = c.bookT != null ? +c.bookT : cum.in - cum.out + cum.adj;
    const diff = +c.measuredT - book;
    const incr = prev ? diff - (prev.applied ? 0 : prev.diff) : null;
    const used = prev ? cum.out - prev.outAt : null;
    const row = { id: c.id, date: c.date, measured: +c.measuredT, book, diff, incr, used, pct: incr != null && used > 0 ? -incr / used : null, applied: !!c.applied, note: c.note || '', by: c.by || '', outAt: cum.out };
    out.push(row);
    prev = row;
  }
  return out;
}

/** Prezzo medio FIFO dei residui accettati per materia prima (prezzo di listino se non c'è giacenza). */
function fifoPrices(d) {
  const o = {};
  for (const l of d.ingLots || []) if (l.remaining > 0 && l.status === 'accettato') { const x = (o[l.ingId] ||= { t: 0, v: 0 }); x.t += +l.remaining; x.v += l.remaining * (+l.price || 0); }
  const out = {};
  for (const i of d.ingredients || []) out[i.id] = o[i.id]?.t ? o[i.id].v / o[i.id].t : +i.price || 0;
  return out;
}

/**
 * Bilancio del periodo per materia prima: apertura, arrivi, prelievi, rettifiche, chiusura a libro; ultima conta del periodo
 * (fisico, differenza, registrata o no); calo fra le conte del periodo (lossT su usedCounted) e rettifiche senza conta.
 */
export function plantBalance(d, P) {
  const L = ledger(d), price = fifoPrices(d);
  const before = addDays(P.from, -1);
  return (d.ingredients || []).map(i => {
    const a = cumAt(L, i.id, before), b = cumAt(L, i.id, P.to);
    const opening = a.in - a.out + a.adj, inT = b.in - a.in, out = b.out - a.out, adj = b.adj - a.adj;
    const hist = countHistory(d, i.id).filter(h => inP(h.date, P));
    const last = hist[hist.length - 1] || null;
    const steps = hist.filter(h => h.incr != null);
    const lossT = -sum(steps, h => h.incr), usedCounted = sum(steps, h => h.used);
    const adjOther = sum((d.adjustments || []).filter(x => x.ingId === i.id && !x.countId && inP(x.date, P)), x => +x.tonnes || 0);
    const p = price[i.id];
    const pendingT = last && !last.applied ? last.diff : 0;
    return { ingId: i.id, name: i.name, category: i.category, opening, in: inT, out, adj, adjOther, closingBook: opening + inT - out + adj,
      physical: last?.measured ?? null, countDate: last?.date ?? null, countId: last?.id ?? null, bookAtCount: last?.book ?? null, deltaT: last?.diff ?? null,
      applied: last ? last.applied : null, pendingT, pendingEur: pendingT * p, price: p, counts: hist.length,
      lossT: steps.length ? lossT : null, lossEur: steps.length ? lossT * p : null, usedCounted, shrinkPct: usedCounted > 0 ? lossT / usedCounted : null };
  }).filter(r => r.opening > 0.01 || r.in > 0.01 || r.out > 0.01 || r.physical != null);
}

/**
 * Calo effettivo dello stabilimento nel periodo: Σ cali fra conte consecutive ÷ Σ prelievi degli stessi intervalli.
 * unexplainedEur = differenze delle ultime conte non ancora registrate, con segno, al prezzo FIFO.
 */
export function shrinkSummary(d, ctx, P) {
  if (!P) return { shrinkPct: null, unexplainedEur: 0 };
  const rows = plantBalance(d, P);
  const usedC = sum(rows, r => r.usedCounted), lossT = sum(rows, r => r.lossT || 0);
  return { shrinkPct: usedC > 0 ? lossT / usedC : null, unexplainedEur: sum(rows, r => r.pendingEur), pendingT: sum(rows, r => r.pendingT), pending: rows.filter(r => r.applied === false).length,
    lossT, lossEur: sum(rows, r => r.lossEur || 0), out: sum(rows, r => r.out), adjOther: sum(rows, r => r.adjOther), lastCount: rows.map(r => r.countDate).filter(Boolean).sort().pop() || null };
}

/** Calo mensile dello stabilimento dalle conte (per data di conta): [{date, lossT, used, pct, n}]. */
export function shrinkTrend(d) {
  const acc = {};
  for (const i of d.ingredients || []) for (const h of countHistory(d, i.id)) {
    if (h.incr == null) continue;
    const o = (acc[h.date] ||= { date: h.date, lossT: 0, used: 0, n: 0 });
    o.lossT -= h.incr; o.used += h.used; o.n++;
  }
  return Object.values(acc).sort(byDate).map(o => ({ ...o, pct: o.used > 0 ? o.lossT / o.used : null }));
}

/** Nuova conta fisica con il libro del momento: → ops */
export function countOps(d, { ingId, date, measuredT, note = '', by = '' }) {
  return [{ kind: 'add', coll: 'stockCounts', obj: { id: uid('cnt'), date, ingId, measuredT: +measuredT, bookT: Math.round(bookAt(d, ingId, date) * 1000) / 1000, applied: false, note, by } }];
}

/**
 * Registrazione di un inventario: porta il libro della materia prima alla quantità contata alla data della conta.
 * Un calo si toglie dai lotti più vecchi (FIFO); un'eccedenza si aggiunge al lotto più recente. → ops (un passo annullabile)
 */
export function adjustStockOps(d, { ingId, physicalT, date, reason = 'inventario', countId = null, note = '' }) {
  const book = bookAt(d, ingId, date);
  const diff = physicalT - book;
  const ops = [], adds = [];
  const count = countId ? (d.stockCounts || []).find(c => c.id === countId) : null;
  const markCount = () => { if (count) ops.push({ kind: 'update', coll: 'stockCounts', id: countId, patch: { applied: true, ...(count.bookT == null ? { bookT: Math.round(book * 1000) / 1000 } : {}) } }); };
  if (Math.abs(diff) < 0.005) { markCount(); return ops; }
  const lots = (d.ingLots || []).filter(l => l.ingId === ingId && l.status === 'accettato').sort(byDate);
  if (diff < 0) {
    let rest = -diff;
    for (const l of lots) {
      if (rest <= 1e-9) break;
      const take = Math.min(rest, +l.remaining || 0);
      if (take <= 0) continue;
      rest -= take;
      ops.push({ kind: 'update', coll: 'ingLots', id: l.id, patch: { remaining: Math.round(((+l.remaining || 0) - take) * 1000) / 1000 } });
      adds.push({ id: uid('adj'), date, ingId, ingLotId: l.id, tonnes: -Math.round(take * 1000) / 1000, reason, countId, note });
    }
    if (rest > 1e-6) adds.push({ id: uid('adj'), date, ingId, ingLotId: null, tonnes: -Math.round(rest * 1000) / 1000, reason, countId, note: (note ? note + ' · ' : '') + 'oltre i residui dei lotti' });
  } else {
    const l = lots[lots.length - 1];
    if (l) ops.push({ kind: 'update', coll: 'ingLots', id: l.id, patch: { remaining: Math.round(((+l.remaining || 0) + diff) * 1000) / 1000 } });
    adds.push({ id: uid('adj'), date, ingId, ingLotId: l?.id || null, tonnes: Math.round(diff * 1000) / 1000, reason, countId, note });
  }
  const ing = (d.ingredients || []).find(i => i.id === ingId);
  ops.push({ kind: 'addMany', coll: 'adjustments', objs: adds });
  if (ing) ops.push({ kind: 'update', coll: 'ingredients', id: ingId, patch: { stock: Math.max(0, Math.round(((+ing.stock || 0) + diff) * 10) / 10) } });
  markCount();
  return ops;
}
