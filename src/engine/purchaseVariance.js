/* FeedOS 17 · Varianze di prezzo d'acquisto e di materiale (pacchetto WP5).
 * Standard di un anno = riga di «standards» {year, ingId, price}; senza riga, la mediana dei prezzi dei lotti ricevuti nelle prime
 * 3 settimane di quell'anno (o dei dati, se iniziano dopo il 1° gennaio).
 * PPV = Σ lotti ricevuti nel periodo (prezzo − standard) × t.
 * Varianza di materiale di un lotto di prodotto: effettivo − standard = prezzo + quantità (identità esatta):
 *   prezzo = Σ t effettive × (prezzo dei lotti consumati − standard), quantità = Σ (t effettive − t della formula) × standard;
 *   a parte l'effetto formula = costo agli standard della versione usata − della versione approvata di oggi. */
import { sum, median, addDays, byId } from '../core/util.js';

const EMPTY = [];
const n0 = v => (Number.isFinite(+v) ? +v : 0);
const okLot = l => l && l.status !== 'bloccato' && n0(l.tonnes) > 0 && l.date;
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// piccola memoria per identità degli argomenti (stile inventory.js)
const caches = new Map();
function cached(name, deps, fn, max = 6) {
  let list = caches.get(name);
  if (!list) caches.set(name, (list = []));
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/** Standard dell'anno per tutte le materie prime: {ingId: €/t}. */
export function stdPrices(d, year) {
  return cached('std|' + year, [d.standards, d.ingLots], () => {
    const out = {};
    const byIng = {};
    for (const l of d.ingLots || EMPTY) if (okLot(l) && +l.date.slice(0, 4) === year) (byIng[l.ingId] ||= []).push(l);
    for (const [ing, lots] of Object.entries(byIng)) {
      lots.sort(byDate);
      const end = addDays(lots[0].date, 20);
      const first = lots.filter(l => l.date <= end).map(l => n0(l.price)).filter(p => p > 0);
      if (first.length) out[ing] = median(first);
    }
    for (const s of d.standards || EMPTY) if (+s.year === year && s.ingId && n0(s.price) > 0) out[s.ingId] = n0(s.price);
    return out;
  });
}

/** Standard di una materia prima per l'anno (null se non c'è né riga né lotto dell'anno). */
export function stdPrice(d, ingId, year) { return stdPrices(d, year)[ingId] ?? null; }

/**
 * Varianza di prezzo d'acquisto del periodo P (contratto): lotti ricevuti nel periodo, non respinti.
 * → {total, spend, stdSpend, pct, byIng: [{ingId, ppv, tonnes, spend, stdSpend, pct}], byMonth: [{month, ppv, byIng}]}
 */
export function ppv(d, ctx, P) {
  return cached('ppv|' + P.from + '|' + P.to, [d.ingLots, d.standards], () => {
    const byIng = {}, byMonth = {};
    let total = 0, spend = 0, stdSpend = 0;
    for (const l of d.ingLots || EMPTY) {
      if (!okLot(l) || l.date < P.from || l.date > P.to) continue;
      const std = stdPrice(d, l.ingId, +l.date.slice(0, 4));
      if (std == null) continue;
      const t = n0(l.tonnes), v = (n0(l.price) - std) * t;
      total += v; spend += n0(l.price) * t; stdSpend += std * t;
      const bi = (byIng[l.ingId] ||= { ingId: l.ingId, ppv: 0, tonnes: 0, spend: 0, stdSpend: 0 });
      bi.ppv += v; bi.tonnes += t; bi.spend += n0(l.price) * t; bi.stdSpend += std * t;
      const m = l.date.slice(0, 7), bm = (byMonth[m] ||= { month: m, ppv: 0, spend: 0, byIng: {} });
      bm.ppv += v; bm.spend += n0(l.price) * t; bm.byIng[l.ingId] = (bm.byIng[l.ingId] || 0) + v;
    }
    return {
      total, spend, stdSpend, pct: stdSpend ? total / stdSpend : null,
      byIng: Object.values(byIng).map(x => ({ ...x, pct: x.stdSpend ? x.ppv / x.stdSpend : null, avgPrice: x.tonnes ? x.spend / x.tonnes : null, std: x.tonnes ? x.stdSpend / x.tonnes : null })).sort((a, b) => Math.abs(b.ppv) - Math.abs(a.ppv)),
      byMonth: Object.values(byMonth).sort((a, b) => (a.month < b.month ? -1 : 1)),
    };
  });
}

/** Righe (kg/t) della versione di una formula: quella indicata dalla campagna nella storia, altrimenti quella in vigore alla data. */
export function formulaLinesAt(f, version, date) {
  if (!f) return null;
  const hist = f.history || EMPTY;
  if (version != null) { const h = hist.find(x => x.version === version); if (h?.lines) return h.lines; if (f.version === version) return f.lines; }
  let cur = null;
  for (const h of hist) if (!h.date || h.date <= date) cur = h;
  return cur?.lines || f.lines || null;
}

/**
 * Varianza di materiale dei lotti di prodotto del periodo P agli standard dell'anno di produzione.
 * → {total: {tonnes, actual, std, price, quantity, formula}, byProduct, byMonth, byIng, byLot}
 */
export function materialVariance(d, ctx, P) {
  return cached('mv|' + P.from + '|' + P.to, [d.lots, d.ingLots, d.standards, d.formulas, d.runs, d.products], () => {
    const ingLot = byId(d.ingLots || EMPTY), run = byId(d.runs || EMPTY), prod = byId(d.products || EMPTY), form = byId(d.formulas || EMPTY);
    const T = { tonnes: 0, actual: 0, std: 0, price: 0, quantity: 0, formula: 0 };
    const byProduct = {}, byMonth = {}, byIng = {}, byLot = [];
    const add = (o, x) => { for (const k of Object.keys(T)) o[k] = (o[k] || 0) + (x[k] || 0); };
    for (const lot of d.lots || EMPTY) {
      if (!lot.date || lot.date < P.from || lot.date > P.to || !(lot.comp || EMPTY).length) continue;
      const r = run[lot.runId], p = prod[lot.productId], f = form[r?.formulaId || p?.formulaId];
      const year = +lot.date.slice(0, 4), std = stdPrices(d, year);
      const used = formulaLinesAt(f, r?.formulaVersion, lot.date);
      const t = n0(lot.tonnes);
      // consumi effettivi per materia prima: t e valore ai prezzi dei lotti consumati
      const act = {};
      for (const c of lot.comp) {
        const il = ingLot[c.l], ing = c.ing || il?.ingId;
        if (!ing) continue;
        const o = (act[ing] ||= { t: 0, v: 0 });
        const tt = n0(c.kg) / 1000;
        o.t += tt; o.v += tt * n0(il?.price);
      }
      const stdLines = {};
      for (const l of used || EMPTY) stdLines[l.ing] = (stdLines[l.ing] || 0) + (t * n0(l.kg)) / 1000;
      const x = { tonnes: t, actual: 0, std: 0, price: 0, quantity: 0, formula: 0 };
      let ok = true;
      for (const ing of new Set([...Object.keys(act), ...Object.keys(stdLines)])) {
        const s = std[ing];
        if (s == null) { ok = false; break; }
        const a = act[ing] || { t: 0, v: 0 }, k = stdLines[ing] || 0;
        const pv = a.v - a.t * s, qv = (a.t - k) * s;
        x.actual += a.v; x.std += k * s; x.price += pv; x.quantity += qv;
        const bi = (byIng[ing] ||= { ingId: ing, actualT: 0, stdT: 0, price: 0, quantity: 0 });
        bi.actualT += a.t; bi.stdT += k; bi.price += pv; bi.quantity += qv;
      }
      if (!ok) continue;
      // effetto formula: versione usata contro la versione approvata di oggi, entrambe agli standard
      const curLines = f?.lines || used || EMPTY;
      x.formula = sum(used || EMPTY, l => (t * n0(l.kg)) / 1000 * (std[l.ing] ?? 0)) - sum(curLines, l => (t * n0(l.kg)) / 1000 * (std[l.ing] ?? 0));
      add(T, x);
      add((byProduct[lot.productId] ||= { productId: lot.productId }), x);
      add((byMonth[lot.date.slice(0, 7)] ||= { month: lot.date.slice(0, 7) }), x);
      byLot.push({ lotId: lot.id, productId: lot.productId, date: lot.date, ...x });
    }
    const perT = o => ({ ...o, var: o.actual - o.std, varT: o.tonnes ? (o.actual - o.std) / o.tonnes : null, actualT: o.tonnes ? o.actual / o.tonnes : null, stdT: o.tonnes ? o.std / o.tonnes : null });
    return {
      total: perT(T),
      byProduct: Object.values(byProduct).map(perT).sort((a, b) => Math.abs(b.actual - b.std) - Math.abs(a.actual - a.std)),
      byMonth: Object.values(byMonth).map(perT).sort((a, b) => (a.month < b.month ? -1 : 1)),
      byIng: Object.values(byIng).sort((a, b) => Math.abs(b.price + b.quantity) - Math.abs(a.price + a.quantity)),
      byLot,
    };
  });
}

/** Quotazione di mercato della settimana di una data: l'ultima pubblicata entro la data (al più 10 giorni prima). */
export function quoteIndex(d) {
  return cached('quotes', [d.market], () => {
    const by = {};
    for (const q of d.market || EMPTY) if (q.commodity && q.date && n0(q.price) > 0) (by[q.commodity] ||= []).push(q);
    for (const list of Object.values(by)) list.sort(byDate);
    const at = (com, date) => {
      const list = by[com];
      if (!list) return null;
      let lo = 0, hi = list.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].date <= date) lo = m + 1; else hi = m; }
      const q = list[lo - 1];
      return q && q.date >= addDays(date, -10) ? n0(q.price) : null;
    };
    const avg = (com, from, to) => { const xs = (by[com] || EMPTY).filter(q => q.date > from && q.date <= to).map(q => n0(q.price)); return xs.length ? sum(xs, x => x) / xs.length : null; };
    return { at, avg, has: com => !!by[com], series: com => by[com] || EMPTY };
  });
}

/**
 * Premio pagato sul mercato: prezzo del lotto ÷ quotazione della stessa settimana − 1 (materie prime con quotazione).
 * → {median, lots: [{id, ingId, supplierId, supplier, date, premium, tonnes}], byIng, byMonth}
 */
export function marketPremium(d, P) {
  const Q = quoteIndex(d);
  const lots = [];
  for (const l of d.ingLots || EMPTY) {
    if (!okLot(l) || l.date < P.from || l.date > P.to || !Q.has(l.ingId)) continue;
    const q = Q.at(l.ingId, l.date);
    if (!q) continue;
    lots.push({ id: l.id, ingId: l.ingId, supplierId: l.supplierId || null, supplier: l.supplier || '', date: l.date, premium: n0(l.price) / q - 1, tonnes: n0(l.tonnes), quote: q, price: n0(l.price) });
  }
  const group = (keyOf, name) => {
    const m = {};
    for (const x of lots) (m[keyOf(x)] ||= []).push(x);
    return Object.entries(m).map(([k, xs]) => ({ [name]: k, median: median(xs.map(x => x.premium)), tonnes: sum(xs, x => x.tonnes), n: xs.length }));
  };
  return { median: lots.length ? median(lots.map(x => x.premium)) : null, lots, byIng: group(x => x.ingId, 'ingId').sort((a, b) => b.tonnes - a.tonnes),
    byMonth: group(x => x.date.slice(0, 7), 'month').sort((a, b) => (a.month < b.month ? -1 : 1)) };
}

/**
 * Effetto dei tempi d'acquisto: Σ t × (media delle quotazioni delle 13 settimane prima dell'arrivo − quotazione all'arrivo).
 * Positivo = si è comprato sotto la media recente del mercato. → {total, byIng: [{ingId, gain, tonnes}]}
 */
export function timing(d, P) {
  const Q = quoteIndex(d);
  const by = {};
  let total = 0;
  for (const l of d.ingLots || EMPTY) {
    if (!okLot(l) || l.date < P.from || l.date > P.to || !Q.has(l.ingId)) continue;
    const q = Q.at(l.ingId, l.date), a = Q.avg(l.ingId, addDays(l.date, -91), l.date);
    if (!q || !a) continue;
    const g = n0(l.tonnes) * (a - q);
    total += g;
    const o = (by[l.ingId] ||= { ingId: l.ingId, gain: 0, tonnes: 0 });
    o.gain += g; o.tonnes += n0(l.tonnes);
  }
  return { total, byIng: Object.values(by).sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain)) };
}

/** Effettivo e standard di un prodotto per mese (sezione della scheda prodotto): [{month, tonnes, actualT, stdT, varT}]. */
export function productActualVsStd(d, productId, P) {
  const mv = materialVariance(d, null, P);
  const by = {};
  for (const x of mv.byLot) if (x.productId === productId) { const o = (by[x.date.slice(0, 7)] ||= { month: x.date.slice(0, 7), tonnes: 0, actual: 0, std: 0 }); o.tonnes += x.tonnes; o.actual += x.actual; o.std += x.std; }
  return Object.values(by).sort((a, b) => (a.month < b.month ? -1 : 1)).map(o => ({ ...o, actualT: o.tonnes ? o.actual / o.tonnes : null, stdT: o.tonnes ? o.std / o.tonnes : null, varT: o.tonnes ? (o.actual - o.std) / o.tonnes : null }));
}
