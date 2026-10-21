/* FeedOS 17 · Fabbisogni di materie prime dal piano di produzione (MRP a periodi settimanali).
 * Fabbisogno lordo settimanale = Σ tonnellate pianificate × kg/t della formula in vigore.
 * Scorta proiettata = scorta utilizzabile + arrivi confermati + lotti in quarantena (arrivo condizionato) − fabbisogni.
 * Quando la scorta proiettata scende sotto la sicurezza si pianifica un ordine che arriva a inizio settimana
 * (da emettere entro «inizio settimana − tempo di consegna»). Se quella data è già passata l'ordine è in ritardo:
 * arriva appena possibile e la settimana resta scoperta. Una rottura è quindi «non evitabile» solo dentro
 * il tempo di consegna: il resto è fabbisogno da coprire con gli ordini pianificati.
 * 17: un lotto arrivato e in attesa dell'analisi conta come arrivo condizionato alla data + giorni di rilascio (prima un arrivo
 * registrato spariva dai fabbisogni e generava un ordine in più); un ordine in ritardo resta nella settimana in corso ed è segnalato;
 * un ordine parziale conta per il residuo; accanto alla scorta impostata c'è quella statistica, z × √(LT·σd² + d̄²·σLT²),
 * con il capitale che si libererebbe; il lotto rispetta l'ordine minimo del fornitore. */
import { addDays, daysBetween, mondayOf, sum, mean, stdev } from '../core/util.js';
import { formulaLinesAt } from './purchaseVariance.js';

export function orderStep(ing) { return ['aminoacido', 'premix'].includes(ing.category) ? 0.5 : ing.category === 'minerale' ? 5 : 28; } // 28 t = un autotreno
function roundUp(v, step) { return Math.ceil(v / step - 1e-9) * step; }
const EMPTY = [];
const n0 = v => (Number.isFinite(+v) ? +v : 0);
/** z del livello di servizio per classe ABC: A 98%, B 95%, C 90%. */
export const Z_CLASS = { A: 2.05, B: 1.65, C: 1.28 };
const zOfService = p => (p >= 0.99 ? 2.33 : p >= 0.98 ? 2.05 : p >= 0.975 ? 1.96 : p >= 0.95 ? 1.65 : p >= 0.9 ? 1.28 : 0.84);
/** Quantità ancora da ricevere di un ordine aperto (il residuo di un parziale). */
export const openQty = p => Math.max(0, n0(p.tonnes) - (p.status === 'parziale' ? n0(p.receivedT) : 0));
const isOpen = p => p && p.status !== 'ricevuto' && p.status !== 'annullato';

/** Fornitore preferito di una materia prima: quello indicato sulla materia prima, altrimenti il primo qualificato che la tratta. */
export function preferredSupplier(ing, suppliers = EMPTY) {
  return suppliers.find(s => s.name === ing.supplier && s.approval !== 'sospeso') || suppliers.find(s => (s.ingIds || EMPTY).includes(ing.id) && s.approval === 'qualificato') || null;
}

/**
 * Scorta di sicurezza statistica in tonnellate: z × √(LT·σd² + d̄²·σLT²), con consumi e tempi in giorni lavorativi.
 * @param {{dailyUse:number[], LT:number, sdLT:number, z:number}} a dailyUse = consumi dei giorni lavorativi; LT e sdLT in giorni lavorativi
 */
export function safetyStock({ dailyUse, LT, sdLT, z }) {
  if (!dailyUse?.length || !(LT > 0)) return 0;
  const dm = mean(dailyUse), sd = dailyUse.length > 1 ? stdev(dailyUse) : 0;
  return z * Math.sqrt(LT * sd * sd + dm * dm * (sdLT || 0) * (sdLT || 0));
}

/** Consumi giornalieri dei giorni lavorativi delle ultime `weeks` settimane, dalle campagne (versione della formula usata). */
export function dailyUseSeries(a, weeks = 26) {
  const today = a.today, from = addDays(today, -7 * weeks);
  const prod = Object.fromEntries((a.products || EMPTY).map(p => [p.id, p])), form = Object.fromEntries((a.formulas || EMPTY).map(f => [f.id, f]));
  const days = [];
  for (let x = addDays(from, 1); x < today; x = addDays(x, 1)) { const wd = new Date(x + 'T00:00:00Z').getUTCDay(); if (wd >= 1 && wd <= 5) days.push(x); }
  const idx = Object.fromEntries(days.map((x, i) => [x, i]));
  const use = {};
  for (const r of a.runs || EMPTY) {
    const i = idx[r.date];
    if (i == null) continue;
    const f = form[r.formulaId] || form[prod[r.productId]?.formulaId];
    for (const l of formulaLinesAt(f, r.formulaVersion, r.date) || EMPTY) (use[l.ing] ||= new Array(days.length).fill(0))[i] += (n0(r.tonnes) * n0(l.kg)) / 1000;
  }
  return { days, use };
}

/** Classe ABC delle materie prime per valore consumato nelle campagne degli ultimi 12 mesi ai prezzi di oggi (A fino all'80%, B fino al 95%).
 *  a = {today, runs, products, formulas, ingredients}: la stessa classe in fabbisogni, coperture e segnali degli acquisti. */
export function abcClasses(a) {
  const { use } = dailyUseSeries(a, 52);
  const price = Object.fromEntries((a.ingredients || EMPTY).map(i => [i.id, n0(i.price)]));
  const val = Object.entries(use).map(([k, xs]) => [k, sum(xs, x => x) * (price[k] || 0)]).sort((x, y) => y[1] - x[1]);
  const tot = sum(val, x => x[1]), out = {};
  let acc = 0;
  for (const [k, v] of val) { out[k] = acc < 0.8 * tot ? 'A' : acc < 0.95 * tot ? 'B' : 'C'; acc += v; }
  return out;
}

/**
 * @param {object} a { today, weeks, plan:[{week, productId, tonnes}], products, formulas, ingredients, purchases, runs?, ingLots?, suppliers?, settings? }
 *   Con «runs», per la settimana in corso conta solo la parte del piano non ancora prodotta (la scorta di oggi
 *   ha già scontato i consumi registrati da lunedì).
 * @returns {{weeks:string[], rows:object[]}} righe con cells, planned, suggestion, risk; in più (17) conditional, overdue,
 *   ssStat, ssStatDays, ssConfigured, releasable, z, cls, ltDays, sdLT, supplierId, minOrderT, eoq.
 */
export function requirements(a) {
  const today = a.today;
  const w0 = mondayOf(today);
  const weeks = Array.from({ length: a.weeks || 8 }, (_, k) => addDays(w0, 7 * k));
  const prod = Object.fromEntries(a.products.map(p => [p.id, p]));
  const form = Object.fromEntries(a.formulas.map(f => [f.id, f]));
  const ops = { releaseDays: 2, orderCost: 60, carryRatePct: 8, serviceLevel: 0.95, ...(a.settings?.ops || {}) };
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
  const inc = {}, late = {};
  for (const o of a.purchases || []) {
    if (!isOpen(o)) continue;
    const wk = mondayOf(o.deliveryDate < w0 ? w0 : o.deliveryDate);
    if (!weeks.includes(wk)) continue;
    const q = openQty(o);
    inc[o.ingId] ??= {};
    inc[o.ingId][wk] = (inc[o.ingId][wk] || 0) + q;
    if (o.deliveryDate < today) (late[o.ingId] ||= []).push({ id: o.id, code: o.code, t: q, days: daysBetween(o.deliveryDate, today) });
  }
  // lotti arrivati in attesa dell'analisi: arrivo condizionato alla data + giorni di rilascio
  const cond = {};
  for (const l of a.ingLots || EMPTY) {
    if (l.status !== 'in attesa' || !(n0(l.remaining) > 0)) continue;
    const rel = addDays(l.date || today, +ops.releaseDays || 0);
    const wk = mondayOf(rel < today ? today : rel);
    if (!weeks.includes(wk)) continue;
    (cond[l.ingId] ||= {})[wk] = (cond[l.ingId][wk] || 0) + n0(l.remaining);
  }
  // scorta statistica: consumi giornalieri delle ultime 26 settimane, tempi di consegna reali dei fornitori, classe ABC
  const series = a.runs?.length ? dailyUseSeries(a, 26) : { use: {} };
  const abc = a.runs?.length ? abcClasses(a) : {};
  const lt = {};
  for (const p of a.purchases || EMPTY) if (p.receivedAt && p.date && p.receivedAt > addDays(today, -365)) (lt[p.ingId] ||= []).push(daysBetween(p.date, p.receivedAt));
  const fifo = {};
  for (const l of a.ingLots || EMPTY) if (l.status === 'accettato' && n0(l.remaining) > 0) { const o = (fifo[l.ingId] ||= { t: 0, v: 0 }); o.t += n0(l.remaining); o.v += n0(l.remaining) * n0(l.price); }
  const rows = [];
  for (const ing of a.ingredients) {
    const n = need[ing.id] || {}, r = inc[ing.id] || {}, c = cond[ing.id] || {};
    const totalNeed = weeks.reduce((s, w) => s + (n[w] || 0), 0);
    if (totalNeed <= 0 && !(+ing.stock > 0)) continue;
    const daily = totalNeed / (weeks.length * 7) || 0;
    const safety = daily * (+ing.safetyDays || 7);
    const lead = +ing.leadDays || 7;
    const sup = preferredSupplier(ing, a.suppliers || EMPTY);
    const step = orderStep(ing), minQ = Math.max(step, n0(sup?.minOrderT));
    let stock = +ing.stock || 0, raw = stock;
    const cells = [], planned = [], pipe = {}; // pipe: arrivi pianificati in ritardo, per settimana
    for (const w of weeks) {
      const condW = c[w] || 0;
      const inW = (r[w] || 0) + condW, outW = n[w] || 0;
      const start = stock;
      const lateIn = pipe[w] || 0;
      let e = stock + inW + lateIn - outW;
      raw = raw + inW - outW;
      let plannedIn = lateIn;
      const pending = Object.entries(pipe).filter(([wk]) => wk > w).reduce((s, [, q]) => s + q, 0);
      if (daily > 0 && e + pending < safety - 1e-9) {
        const orderBy = addDays(w, -lead);
        const isLate = orderBy < today;
        const arrival = isLate ? addDays(today, lead) : w;
        const qty = Math.max(minQ, roundUp(safety + daily * 7 - e - pending, step));
        const wa = mondayOf(arrival);
        const same = isLate && planned.find(p => p.late && mondayOf(p.arrival) === wa);
        if (same) same.qty += qty; // due ordini in ritardo con lo stesso arrivo diventano uno solo
        else planned.push({ week: w, arrival, orderBy: isLate ? today : orderBy, qty, late: isLate, lead, status: e < 0 ? 'rottura' : 'sotto', supplierId: sup?.id || null });
        if (wa <= w) { e += qty; plannedIn += qty; } else pipe[wa] = (pipe[wa] || 0) + qty;
      }
      stock = e;
      const cover = daily > 0 ? stock / daily : null;
      const status = stock < -1e-6 ? 'rottura' : stock < safety - 1e-6 ? 'sotto' : 'ok';
      const cell = { week: w, start, need: outW, in: inW, planned: plannedIn, end: stock, raw, cover, status };
      if (condW) cell.conditional = condW;
      if (w === w0 && late[ing.id]) cell.overdue = sum(late[ing.id], x => x.t);
      cells.push(cell);
    }
    // scorta di sicurezza statistica e capitale liberabile
    const use = series.use[ing.id] || null;
    const lts = lt[ing.id] || EMPTY;
    const ltDays = lts.length >= 3 ? mean(lts) : lead, sdLT = lts.length >= 3 ? stdev(lts) : 0.2 * lead;
    const cls = abc[ing.id] || null;
    const z = cls ? Z_CLASS[cls] : zOfService(+ops.serviceLevel || 0.95);
    // variabilità storica (coefficiente di variazione dei consumi giornalieri) applicata al ritmo del piano: se le formule cambiano
    // una materia prima, la scorta segue il consumo futuro e non quello passato
    const histMean = use ? mean(use) : 0;
    const scaled = histMean > 0 && daily > 0 ? use.map(x => (x * (daily * 7) / 5) / histMean) : null;
    const ssStat = scaled ? safetyStock({ dailyUse: scaled, LT: (ltDays * 5) / 7, sdLT: (sdLT * 5) / 7, z }) : null;
    const price = fifo[ing.id]?.t ? fifo[ing.id].v / fifo[ing.id].t : n0(ing.price);
    const annual = daily * 365;
    const eoq = annual > 0 && price > 0 && cls !== 'A' ? Math.sqrt((2 * annual * (+ops.orderCost || 60)) / (((+ops.carryRatePct || 8) / 100) * price)) : null;
    // sconto per quantità: conviene se la quantità in più si consuma entro due settimane e il risparmio supera il costo di mantenerla
    for (const p of planned) {
      const brk = (sup?.priceBreaks || EMPTY).filter(b => n0(b.fromT) > p.qty && n0(b.fromT) - p.qty <= daily * 14).sort((x, y) => x.fromT - y.fromT)[0];
      if (brk) {
        const extra = brk.fromT - p.qty, saving = brk.fromT * price * (n0(brk.discountPct) / 100) - extra * price * ((+ops.carryRatePct || 8) / 100) * (extra / Math.max(daily, 1e-9) / 365);
        if (saving > 0) p.priceBreak = { fromT: brk.fromT, discountPct: n0(brk.discountPct), saving };
      }
    }
    const first = planned[0] || null;
    rows.push({ ingId: ing.id, stock: +ing.stock || 0, daily, safety, lead, cover: daily > 0 ? (+ing.stock || 0) / daily : null, totalNeed, cells, planned, suggestion: first,
      risk: cells.some(c2 => c2.status === 'rottura') ? 'rottura' : cells.some(c2 => c2.status === 'sotto') ? 'sotto' : 'ok',
      conditional: sum(Object.values(c), x => x), overdue: late[ing.id] || EMPTY,
      ssStat, ssStatDays: ssStat != null && daily > 0 ? ssStat / daily : null, ssConfigured: safety, releasable: ssStat != null ? Math.max(0, safety - ssStat) * price : null,
      z, cls, ltDays, sdLT, supplierId: sup?.id || null, minOrderT: n0(sup?.minOrderT) || null, eoq, price });
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

/** Consumo medio giornaliero storico dalle campagne, con la versione della formula usata da ciascuna (per confronto con il piano). */
export function historicUse(runs, formulasByProduct, from, to) {
  const use = {};
  let days = Math.max(1, daysBetween(from, to));
  for (const r of runs) {
    if (r.date < from || r.date > to) continue;
    const f = formulasByProduct[r.productId];
    if (!f) continue;
    for (const l of formulaLinesAt(f, r.formulaVersion, r.date) || EMPTY) use[l.ing] = (use[l.ing] || 0) + (+r.tonnes) * (+l.kg) / 1000;
  }
  for (const k of Object.keys(use)) use[k] /= days;
  return use;
}

/**
 * Copertura delle materie prime A nelle prossime `weeks` settimane: fabbisogno (piano a 8 settimane, poi la media settimanale del piano),
 * coperto (scorta + quarantena + ordini aperti entro l'orizzonte), scoperto, settimane coperte e rischio di prezzo al P90 sulla parte scoperta:
 * scoperto × prezzo × σ13 × 1,28, con σ13 = deviazione dei rendimenti logaritmici a 13 settimane della quotazione (o dei prezzi pagati).
 * @param {object} d archivio · ctx con mrp e today
 */
export function coverage(d, ctx, { weeks = 13 } = {}) {
  const today = ctx?.today || d.settings?.demoAnchor;
  const M = ctx?.mrp;
  if (!today || !M) return [];
  const end = addDays(mondayOf(today), 7 * weeks - 1);
  const out = [];
  for (const r of M.rows) {
    if (r.cls !== 'A' || !(r.totalNeed > 0)) continue;
    const weekly = r.totalNeed / M.weeks.length;
    const needT = weeks <= M.weeks.length ? sum(r.cells.slice(0, weeks), c => c.need) : r.totalNeed + weekly * (weeks - M.weeks.length);
    const quarantine = sum((d.ingLots || EMPTY).filter(l => l.ingId === r.ingId && l.status === 'in attesa'), l => n0(l.remaining));
    const pos = sum((d.purchases || EMPTY).filter(p => p.ingId === r.ingId && isOpen(p) && (p.deliveryDate || today) <= end), openQty);
    const coveredT = r.stock + quarantine + pos;
    const openT = Math.max(0, needT - coveredT);
    const sigma = priceSigma13(d, r.ingId, today);
    out.push({ ingId: r.ingId, weeks, needT, stock: r.stock, quarantine, pos, coveredT, openT, weeksCovered: weekly > 0 ? coveredT / weekly : null, price: r.price, sigma13: sigma,
      p90RiskEur: sigma != null ? openT * r.price * sigma * 1.28 : null });
  }
  return out.sort((a, b) => (b.p90RiskEur || 0) - (a.p90RiskEur || 0));
}

/** Volatilità a 13 settimane del prezzo di una materia prima: quotazione di mercato se c'è, altrimenti i prezzi settimanali dei lotti. */
export function priceSigma13(d, ingId, today) {
  let ys = (d.market || EMPTY).filter(q => q.commodity === ingId && q.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1)).map(q => n0(q.price));
  if (ys.length < 30) {
    const wk = {};
    for (const l of d.ingLots || EMPTY) if (l.ingId === ingId && l.date <= today && n0(l.price) > 0) { const w = mondayOf(l.date); (wk[w] ||= []).push(n0(l.price)); }
    ys = Object.keys(wk).sort().map(w => mean(wk[w]));
  }
  const rets = [];
  for (let i = 13; i < ys.length; i++) if (ys[i] > 0 && ys[i - 13] > 0) rets.push(Math.log(ys[i] / ys[i - 13]));
  return rets.length >= 8 ? stdev(rets) : null;
}
