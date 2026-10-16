/* FeedOS 16 · Fabbisogni di materie prime dal piano di produzione (MRP a periodi settimanali).
 * Fabbisogno lordo settimanale = Σ tonnellate pianificate × kg/t della formula in vigore.
 * Scorta proiettata = scorta utilizzabile + arrivi confermati − fabbisogni.
 * Quando la scorta proiettata scende sotto la sicurezza si pianifica un ordine che arriva a inizio settimana
 * (da emettere entro «inizio settimana − tempo di consegna»). Se quella data è già passata l'ordine è in ritardo:
 * arriva appena possibile e la settimana resta scoperta. Una rottura è quindi «non evitabile» solo dentro
 * il tempo di consegna: il resto è fabbisogno da coprire con gli ordini pianificati. */
import { addDays, daysBetween, mondayOf } from '../core/util.js';

export function orderStep(ing) { return ['aminoacido', 'premix'].includes(ing.category) ? 0.5 : ing.category === 'minerale' ? 5 : 28; } // 28 t = un autotreno
function roundUp(v, step) { return Math.ceil(v / step - 1e-9) * step; }

/**
 * @param {object} a { today, weeks, plan:[{week, productId, tonnes}], products, formulas, ingredients, purchases, runs? }
 *   Con «runs», per la settimana in corso conta solo la parte del piano non ancora prodotta (la scorta di oggi
 *   ha già scontato i consumi registrati da lunedì).
 * @returns {{weeks:string[], rows:object[]}}
 */
export function requirements(a) {
  const today = a.today;
  const w0 = mondayOf(today);
  const weeks = Array.from({ length: a.weeks || 8 }, (_, k) => addDays(w0, 7 * k));
  const prod = Object.fromEntries(a.products.map(p => [p.id, p]));
  const form = Object.fromEntries(a.formulas.map(f => [f.id, f]));
  const done = {}; // prodotto -> t già prodotte nella settimana in corso
  for (const r of a.runs || []) if (r.date >= w0 && r.date <= today) done[r.productId] = (done[r.productId] || 0) + (+r.tonnes || 0);
  const need = {}; // ing -> week -> t
  for (const p of a.plan) {
    if (!weeks.includes(p.week)) continue;
    const f = form[prod[p.productId]?.formulaId];
    if (!f) continue;
    let t = +p.tonnes || 0;
    if (p.week === w0 && a.runs) { const used = Math.min(t, done[p.productId] || 0); done[p.productId] = (done[p.productId] || 0) - used; t -= used; }
    for (const l of f.lines) {
      need[l.ing] ??= {};
      need[l.ing][p.week] = (need[l.ing][p.week] || 0) + t * (+l.kg) / 1000;
    }
  }
  const inc = {};
  for (const o of a.purchases || []) {
    if (o.status === 'ricevuto' || o.status === 'annullato') continue;
    const wk = mondayOf(o.deliveryDate < w0 ? w0 : o.deliveryDate);
    if (!weeks.includes(wk)) continue;
    inc[o.ingId] ??= {};
    inc[o.ingId][wk] = (inc[o.ingId][wk] || 0) + (+o.tonnes);
  }
  const rows = [];
  for (const ing of a.ingredients) {
    const n = need[ing.id] || {}, r = inc[ing.id] || {};
    const totalNeed = weeks.reduce((s, w) => s + (n[w] || 0), 0);
    if (totalNeed <= 0 && !(+ing.stock > 0)) continue;
    const daily = totalNeed / (weeks.length * 7) || 0;
    const safety = daily * (+ing.safetyDays || 7);
    const lead = +ing.leadDays || 7;
    const step = orderStep(ing);
    let stock = +ing.stock || 0, raw = stock;
    const cells = [], planned = [], pipe = {}; // pipe: arrivi pianificati in ritardo, per settimana
    for (const w of weeks) {
      const inW = r[w] || 0, outW = n[w] || 0;
      const start = stock;
      const late = pipe[w] || 0;
      let e = stock + inW + late - outW;
      raw = raw + inW - outW;
      let plannedIn = late;
      const pending = Object.entries(pipe).filter(([wk]) => wk > w).reduce((s, [, q]) => s + q, 0);
      if (daily > 0 && e + pending < safety - 1e-9) {
        const orderBy = addDays(w, -lead);
        const isLate = orderBy < today;
        const arrival = isLate ? addDays(today, lead) : w;
        const qty = Math.max(step, roundUp(safety + daily * 7 - e - pending, step));
        const wa = mondayOf(arrival);
        const same = isLate && planned.find(p => p.late && mondayOf(p.arrival) === wa);
        if (same) same.qty += qty; // due ordini in ritardo con lo stesso arrivo diventano uno solo
        else planned.push({ week: w, arrival, orderBy: isLate ? today : orderBy, qty, late: isLate, lead, status: e < 0 ? 'rottura' : 'sotto' });
        if (wa <= w) { e += qty; plannedIn += qty; } else pipe[wa] = (pipe[wa] || 0) + qty;
      }
      stock = e;
      const cover = daily > 0 ? stock / daily : null;
      const status = stock < -1e-6 ? 'rottura' : stock < safety - 1e-6 ? 'sotto' : 'ok';
      cells.push({ week: w, start, need: outW, in: inW, planned: plannedIn, end: stock, raw, cover, status });
    }
    const first = planned[0] || null;
    rows.push({ ingId: ing.id, stock: +ing.stock || 0, daily, safety, lead, cover: daily > 0 ? (+ing.stock || 0) / daily : null, totalNeed, cells, planned, suggestion: first,
      risk: cells.some(c => c.status === 'rottura') ? 'rottura' : cells.some(c => c.status === 'sotto') ? 'sotto' : 'ok' });
  }
  rows.sort((x, y) => sev(y, today) - sev(x, today) || (x.cover ?? 1e9) - (y.cover ?? 1e9));
  return { weeks, rows };
}
function sev(r, today) {
  if (r.risk === 'rottura') return 4;
  if (r.planned.some(p => p.late)) return 3;
  if (r.risk === 'sotto') return 2;
  if (r.planned.some(p => daysBetween(today, p.orderBy) <= 7)) return 1;
  return 0;
}

/** Consumo medio giornaliero storico da registrazioni di produzione (per confronto con il piano). */
export function historicUse(runs, formulasByProduct, from, to) {
  const use = {};
  let days = Math.max(1, daysBetween(from, to));
  for (const r of runs) {
    if (r.date < from || r.date > to) continue;
    const f = formulasByProduct[r.productId];
    if (!f) continue;
    for (const l of f.lines) use[l.ing] = (use[l.ing] || 0) + (+r.tonnes) * (+l.kg) / 1000;
  }
  for (const k of Object.keys(use)) use[k] /= days;
  return use;
}
