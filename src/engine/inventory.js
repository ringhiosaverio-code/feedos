/* FeedOS 17 · Rimanenze: valorizzazione a una data (FIFO, costo medio ponderato, sostituzione), prodotto finito,
 * andamento mensile, classi ABC (valore consumato) e XYZ (variabilità dei consumi), materiali lenti ed eccedenze.
 * Valorizzazione GESTIONALE, non fiscale. Tutto puro (usabile nei test in node); importa solo actuals e util.
 * Contratto della fondazione: inventorySummary(d, ctx, P) e abcXyz(d, ctx, P) mantengono firma e chiavi. */
import { inventoryValuation, lotUnitCost, makeIndex, costsOf, shipmentFacts } from './actuals.js';
import { requirements } from './mrp.js';
import { addDays, daysBetween, mondayOf, monthsIn, endOfMonth, addMonths, sum, mean, stdev, todayLocal } from '../core/util.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const EMPTY = [];
/** Oggi dell'archivio: l'ancora del demo, altrimenti il giorno locale (come actuals.makeCtx). */
export const todayOf = d => (d?.settings?.dataset === 'demo' && d?.settings?.demoAnchor ? d.settings.demoAnchor : todayLocal());

// piccola memoria per identità degli argomenti (poche voci per nome): i motori sono chiamati da pagina, segnali e schede
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

/** Tasso annuo di mantenimento delle scorte (%): settings.ops.carryRatePct, di base 8. */
export const carryRate = d => { const v = d?.settings?.ops?.carryRatePct; return v != null && Number.isFinite(+v) ? +v : 8; };

/* ---------- movimenti dei lotti MP (per ricostruire la giacenza a una data) ---------- */
function moves(d) {
  return cached('moves', [d.ingLots, d.lots, d.adjustments], () => {
    const use = new Map(); // ingLotId → [{date, t}] consumi dei lotti di prodotto
    for (const l of d.lots || EMPTY) for (const c of l.comp || EMPTY) {
      if (!c?.l) continue;
      let a = use.get(c.l); if (!a) use.set(c.l, a = []);
      a.push({ date: l.date, t: n0(c.kg) / 1000 });
    }
    const adj = new Map(); // ingLotId → [{date, t}] rettifiche con segno (negativo = tolto)
    for (const a of d.adjustments || EMPTY) {
      if (!a?.ingLotId) continue;
      let x = adj.get(a.ingLotId); if (!x) adj.set(a.ingLotId, x = []);
      x.push({ date: a.date || '', t: n0(a.tonnes) });
    }
    return { use, adj };
  });
}

/**
 * Giacenza di un lotto MP alla data: si parte dal residuo di oggi e si riaggiungono i consumi e le rettifiche successivi
 * (identico a «ricevuto − consumato − rettificato fino alla data» quando il bilancio di massa del lotto è chiuso,
 * ed esattamente uguale al residuo per le date da oggi in poi).
 */
function lotStockAt(l, date, M) {
  if (!l?.date || l.date > date) return 0;
  let t = n0(l.remaining);
  for (const u of M.use.get(l.id) || EMPTY) if (u.date > date) t += u.t;
  for (const a of M.adj.get(l.id) || EMPTY) if (a.date > date) t -= a.t;
  return t > 1e-9 ? t : 0;
}

/**
 * Valore delle materie prime a una data passata (o di oggi).
 * method 'fifo' = giacenza dei lotti × prezzo del lotto · 'cmp' = giacenza × prezzo medio ponderato degli arrivi dei 12 mesi
 * precedenti la data · 'sostituzione' = giacenza × prezzo corrente (per una data passata: prezzo dell'ultimo arrivo).
 * Solo lotti accettati; quelli in attesa di esito sono a parte (quarantine). → {value, t, quarantine, byIng: [{ingId, t, value, price}]}
 */
export function valuationAt(d, date, method = 'fifo', { today = todayOf(d) } = {}) {
  return cached('val|' + method + '|' + date + '|' + today, [d.ingLots, d.lots, d.adjustments, d.ingredients], () => {
    const M = moves(d);
    const ing = {};
    const row = id => (ing[id] ||= { ingId: id, t: 0, fifo: 0, rcvT: 0, rcvV: 0, lastDate: '', lastPrice: null });
    let quarantine = 0;
    const from12 = addDays(date, -365);
    for (const l of d.ingLots || EMPTY) {
      if (l.status === 'bloccato' || !l.ingId) continue;
      const r = row(l.ingId), price = n0(l.price);
      // arrivi per il costo medio (12 mesi prima della data) e per l'ultimo prezzo noto
      if (l.date && l.date <= date) {
        if (l.date > from12) { r.rcvT += n0(l.tonnes); r.rcvV += n0(l.tonnes) * price; }
        if (l.date >= r.lastDate) { r.lastDate = l.date; r.lastPrice = price; }
      }
      const t = lotStockAt(l, date, M);
      if (t <= 0) continue;
      if (l.status === 'in attesa') { quarantine += t * price; continue; }
      if (l.status !== 'accettato') continue;
      r.t += t; r.fifo += t * price;
    }
    const ingById = Object.fromEntries((d.ingredients || EMPTY).map(i => [i.id, i]));
    const byIng = [];
    for (const r of Object.values(ing)) {
      if (r.t <= 1e-9) continue;
      let price;
      if (method === 'cmp') price = r.rcvT > 0 ? r.rcvV / r.rcvT : r.fifo / r.t;
      else if (method === 'sostituzione') price = date >= today ? n0(ingById[r.ingId]?.price) || (r.fifo / r.t) : (r.lastPrice ?? r.fifo / r.t);
      else price = r.fifo / r.t;
      byIng.push({ ingId: r.ingId, t: r.t, value: method === 'fifo' ? r.fifo : r.t * price, price });
    }
    byIng.sort((a, b) => b.value - a.value);
    return { date, method, value: sum(byIng, r => r.value), t: sum(byIng, r => r.t), quarantine, byIng };
  });
}

/* ---------- prodotto finito a una data ---------- */
function unitCosts(d, ctx) {
  const ix = ctx?.ix || makeIndex(d), costs = ctx?.costs || costsOf(d, ix);
  return cached('fgUnit', [d.lots, d.ingLots, d.runs, d.products, d.lines, d.settings?.energy, d.settings?.finance, ix, costs], () => {
    const m = new Map();
    for (const lot of d.lots || EMPTY) {
      const u = lotUnitCost(lot, ix, d.settings || {}, costs);
      m.set(lot.id, { v: u.rawT + u.shrinkT + u.energyT + u.varConvT + u.packT, f: u.fixConvT });
    }
    return m;
  });
}
function shipByLot(d) {
  return cached('shipLot', [d.shipments], () => {
    const m = new Map();
    for (const s of d.shipments || EMPTY) { let a = m.get(s.lotId); if (!a) m.set(s.lotId, a = []); a.push({ date: s.date, t: n0(s.tonnes) }); }
    return m;
  });
}
/** Prodotto finito non spedito alla data: t, valore al costo variabile e al costo pieno (con la trasformazione fissa), anche per prodotto. */
export function finishedAt(d, ctx, date) {
  const U = unitCosts(d, ctx), S = shipByLot(d);
  let t = 0, valueVar = 0, valueFull = 0;
  const byProduct = {};
  for (const lot of d.lots || EMPTY) {
    if (lot.status === 'bloccato' || !lot.date || lot.date > date) continue;
    let rest = n0(lot.tonnes);
    for (const s of S.get(lot.id) || EMPTY) if (s.date <= date) rest -= s.t;
    if (rest <= 0.05) continue;
    const u = U.get(lot.id) || { v: 0, f: 0 };
    t += rest; valueVar += rest * u.v; valueFull += rest * (u.v + u.f);
    const p = (byProduct[lot.productId] ||= { productId: lot.productId, t: 0, valueVar: 0, valueFull: 0, lots: 0 });
    p.t += rest; p.valueVar += rest * u.v; p.valueFull += rest * (u.v + u.f); p.lots++;
  }
  return { t, valueVar, valueFull, byProduct: Object.values(byProduct).sort((a, b) => b.valueFull - a.valueFull) };
}

/** Valore mensile delle rimanenze (fine mese; il mese in corso a oggi): [{month, date, mp, fg, fgVar}]. */
export function stockHistory(d, months = 12, ctx = null) {
  const today = ctx?.today || todayOf(d);
  const ms = monthsIn(addMonths(today.slice(0, 7), -(months - 1)), today.slice(0, 7));
  return ms.map(m => {
    const date = endOfMonth(m) < today ? endOfMonth(m) : today;
    const f = finishedAt(d, ctx, date);
    return { month: m, date, mp: valuationAt(d, date, 'fifo', { today }).value, fg: f.valueFull, fgVar: f.valueVar };
  });
}

/* ---------- classi ABC / XYZ ---------- */
/**
 * Classi per materia prima. ABC sul valore consumato nel periodo P (Σ kg dei lotti di prodotto × prezzo del lotto MP):
 * A finché il cumulato resta entro l'80% (la prima voce che lo supera è già B), B entro il 95%, C il resto.
 * XYZ sul coefficiente di variazione dei consumi settimanali delle ultime 52 settimane complete
 * (dalla prima settimana con produzione): X < 0,25, Y 0,25–0,75, Z > 0,75.
 * → {ingId: {abc, xyz, value, share, cumShare, cv, t}}
 */
export function abcXyz(d, ctx, P) {
  const today = ctx?.today || todayOf(d);
  const from = P?.from || addDays(today, -364), to = P?.to || today;
  return cached('abc|' + from + '|' + to + '|' + today, [d.lots, d.ingLots, d.ingredients], () => {
    const il = Object.fromEntries((d.ingLots || EMPTY).map(l => [l.id, l]));
    const val = {}, tons = {};
    // settimane complete prima di quella in corso
    const wEnd = mondayOf(today), w0 = addDays(wEnd, -52 * 7);
    let firstProd = null;
    for (const l of d.lots || EMPTY) if (l.date && (!firstProd || l.date < firstProd)) firstProd = l.date;
    const start = firstProd && mondayOf(firstProd) > w0 ? mondayOf(firstProd) : w0;
    const nW = Math.max(0, Math.round(daysBetween(start, wEnd) / 7));
    const weekly = {};
    for (const l of d.lots || EMPTY) {
      const inP = l.date >= from && l.date <= to;
      const wi = l.date >= start && l.date < wEnd ? Math.floor(daysBetween(start, l.date) / 7) : -1;
      if (!inP && wi < 0) continue;
      for (const c of l.comp || EMPTY) {
        const lot = il[c.l]; const id = c.ing || lot?.ingId; if (!id) continue;
        const t = n0(c.kg) / 1000;
        if (inP) { val[id] = (val[id] || 0) + t * n0(lot?.price); tons[id] = (tons[id] || 0) + t; }
        if (wi >= 0) (weekly[id] ||= new Array(nW).fill(0))[wi] += t;
      }
    }
    const total = sum(Object.values(val));
    const ids = new Set([...Object.keys(val), ...Object.keys(weekly)]);
    const rows = [...ids].map(id => ({ id, value: val[id] || 0 })).sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
    const out = {};
    let cum = 0, first = true;
    for (const r of rows) {
      cum += r.value;
      const after = total > 0 ? cum / total : 1;
      // A finché il cumulato (voce compresa) resta entro l'80%: la prima voce che lo supera apre la B (la prima voce è sempre A)
      const abc = r.value <= 0 ? 'C' : first || after <= 0.8 + 1e-12 ? 'A' : after <= 0.95 + 1e-12 ? 'B' : 'C';
      first = false;
      const w = weekly[r.id];
      const m = w ? mean(w) : 0, s = w && w.length > 1 ? stdev(w) : null;
      const cv = m > 0 && s != null ? s / m : null;
      const xyz = cv == null ? null : cv < 0.25 ? 'X' : cv <= 0.75 ? 'Y' : 'Z';
      out[r.id] = { abc, xyz, value: r.value, share: total > 0 ? r.value / total : 0, cumShare: total > 0 ? cum / total : 0, cv, t: tons[r.id] || 0 };
    }
    return out;
  });
}

/* ---------- lenti ed eccedenze ---------- */
/** Fabbisogni a 8 settimane quando il contesto non li porta (stessa chiamata di actuals.makeCtx). */
function mrpOf(d, today) {
  return cached('mrp|' + today, [d.plan, d.products, d.formulas, d.ingredients, d.purchases, d.runs, d.ingLots, d.suppliers, d.settings?.ops], () =>
    requirements({ today, weeks: 8, plan: d.plan || EMPTY, products: d.products || EMPTY, formulas: d.formulas || EMPTY, ingredients: d.ingredients || EMPTY,
      purchases: d.purchases || EMPTY, runs: d.runs || EMPTY, ingLots: d.ingLots || EMPTY, suppliers: d.suppliers || EMPTY, settings: d.settings || {} }), 2);
}
const it = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
/**
 * Materie prime lente o in eccesso, con capitale immobilizzato e costo di mantenimento.
 * Segnalata se: copertura > max(60, 3 × (consegna + sicurezza)) giorni, oppure nessun fabbisogno nelle 8 settimane del piano,
 * oppure lotto più vecchio di 90 giorni, oppure un lotto scade entro 30 giorni (ingLots.expiry, se presente).
 * eccesso = giacenza − (fabbisogno 8 settimane + scorta di sicurezza), valorizzato sui lotti più recenti (FIFO: restano quelli).
 * opts.all: tutte le materie prime in giacenza, non solo quelle segnalate.
 */
export function slowMovers(d, ctx, opts = {}) {
  const today = ctx?.today || todayOf(d);
  const mrpRows = ctx?.mrp?.rows || mrpOf(d, today).rows;
  return cached('slow|' + today + '|' + (opts.all ? 1 : 0), [d.ingLots, d.ingredients, mrpRows, d.settings?.ops], () => {
    const rate = carryRate(d) / 100;
    const byMrp = Object.fromEntries(mrpRows.map(r => [r.ingId, r]));
    const lotsBy = {};
    for (const l of d.ingLots || EMPTY) if (l.status === 'accettato' && n0(l.remaining) > 0.005) (lotsBy[l.ingId] ||= []).push(l);
    const out = [];
    for (const ing of d.ingredients || EMPTY) {
      const lots = (lotsBy[ing.id] || EMPTY).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const t = sum(lots, l => n0(l.remaining));
      if (t <= 0.05) continue;
      const value = sum(lots, l => n0(l.remaining) * n0(l.price));
      const r = byMrp[ing.id];
      const need8w = n0(r?.totalNeed), daily = n0(r?.daily), safety = n0(r?.safety);
      const coverDays = daily > 0 ? t / daily : null;
      const lead = n0(ing.leadDays) || 7, safetyDays = n0(ing.safetyDays) || 7;
      const coverMax = Math.max(60, 3 * (lead + safetyDays));
      const oldest = lots[0];
      const oldestLotDays = oldest ? daysBetween(oldest.date, today) : null;
      let expiry = null;
      for (const l of lots) if (l.expiry && (!expiry || l.expiry < expiry.expiry)) expiry = l;
      const expiryDays = expiry ? daysBetween(today, expiry.expiry) : null;
      const excessT = Math.max(0, t - (need8w + safety));
      // eccesso valorizzato dai lotti più recenti
      let left = excessT, excessValue = 0;
      for (let i = lots.length - 1; i >= 0 && left > 1e-9; i--) { const q = Math.min(left, n0(lots[i].remaining)); excessValue += q * n0(lots[i].price); left -= q; }
      const flags = {
        noNeed: need8w <= 1e-6,
        cover: coverDays != null && coverDays > coverMax,
        old: oldestLotDays != null && oldestLotDays > 90,
        expiring: expiryDays != null && expiryDays <= 30,
      };
      const flagged = flags.noNeed || flags.cover || flags.old || flags.expiring;
      if (!flagged && !opts.all) continue;
      let action;
      if (flags.expiring) action = expiryDays < 0 ? `Lotto scaduto il ${it(expiry.expiry)}: bloccarlo e decidere reso o smaltimento` : `Usare entro il ${it(expiry.expiry)} o concordare il reso con il fornitore`;
      else if (flags.noNeed) action = 'Nessun fabbisogno nelle prossime 8 settimane: inserirla in formula o rivenderla';
      else if (flags.cover) action = `Sospendere i riordini: copre ${Math.round(coverDays)} giorni contro i ${coverMax} che bastano`;
      else if (flags.old) action = `Usare per primo il lotto del ${it(oldest.date)} (${oldestLotDays} giorni) e verificarne umidità e qualità`;
      else action = 'Nessuna azione';
      out.push({
        ingId: ing.id, name: ing.name, t, value, avgPrice: value / t, coverDays, coverMax, needT8w: need8w, safetyT: safety,
        oldestLotDays, oldestLotId: oldest?.id ?? null, oldestLotCode: oldest?.code ?? null, oldestLotDate: oldest?.date ?? null,
        expiryDays, expiryLotId: expiry?.id ?? null, expiryDate: expiry?.expiry ?? null,
        excessT, excessValue, carryingCost: value * rate, excessCarryingCost: excessValue * rate, flags, flagged, action,
      });
    }
    out.sort((a, b) => b.excessValue - a.excessValue || b.value - a.value);
    return out;
  });
}

/** Basi annue dei 365 giorni alla data: costo del venduto industriale (materie prime + calo + energia + trasformazione variabile
 *  + imballo dei fatti di vendita) e materie prime consumate (materie prime + calo). → {cogs, raw} */
export function costBase12(d, ctx, at) {
  const today = at || ctx?.today || todayOf(d);
  const facts = ctx?.facts || shipmentFacts(d, { ix: ctx?.ix || makeIndex(d) });
  return cached('cogs|' + today, [facts], () => {
    const from = addDays(today, -364);
    let cogs = 0, raw = 0;
    for (const f of facts) if (f.date >= from && f.date <= today) { cogs += f.raw + f.shrink + f.energy + f.varConv + f.pack; raw += f.raw + f.shrink; }
    return { cogs, raw };
  });
}
/** Costo del venduto industriale dei 12 mesi: Σ fatti materie prime + calo + energia + trasformazione variabile + imballo. */
export function cogs12(d, ctx, at) { return costBase12(d, ctx, at).cogs; }

/**
 * Sintesi delle rimanenze (contratto): MP al FIFO e prodotto finito al costo pieno effettivo (actuals), giorni di magazzino
 * DIO = (MP + PF) / (costo del venduto 12 mesi / 365), capitale in eccesso (lenti ed eccedenze) e costo annuo di mantenimento
 * di tutte le rimanenze (carryingCost) e del solo eccesso (excessCarryingCost), al tasso settings.ops.carryRatePct.
 * In più: dioMp = MP al FIFO / (materie prime consumate nei 12 mesi / 365), i giorni di consumo coperti dalle sole materie prime;
 * dioMpShare e dioFgShare = le due quote che sommano il DIO.
 */
export function inventorySummary(d, ctx, P) {
  const shipped = {};
  for (const s of d.shipments || EMPTY) shipped[s.lotId] = (shipped[s.lotId] || 0) + (+s.tonnes || 0);
  const ix = ctx?.ix || makeIndex(d);
  const v = inventoryValuation(d, { ix, costsToday: ctx?.costs || costsOf(d, ix), shipped });
  const { cogs: c12, raw: raw12 } = costBase12(d, ctx);
  const stock = v.mp.fifo + v.fg.valueFull;
  const dio = c12 > 0 ? stock / (c12 / 365) : null;
  const dioMp = raw12 > 0 ? v.mp.fifo / (raw12 / 365) : null;
  const slow = slowMovers(d, ctx);
  const excessValue = sum(slow, r => r.excessValue);
  const rate = carryRate(d) / 100;
  return {
    mpFifo: v.mp.fifo, fgValue: v.fg.valueFull, dio, excessValue, carryingCost: stock * rate,
    fgValueVar: v.fg.valueVar, fgT: v.fg.t, mpReplacement: v.mp.replacement, mpQuarantine: v.mp.quarantine,
    excessCarryingCost: excessValue * rate, turnover: dio ? 365 / dio : null, cogs12: c12, raw12, slowCount: slow.length,
    dioMp, dioMpShare: c12 > 0 ? v.mp.fifo / (c12 / 365) : null, dioFgShare: c12 > 0 ? v.fg.valueFull / (c12 / 365) : null,
  };
}
