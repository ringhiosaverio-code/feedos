/* FeedOS 17 · Dati derivati con memorizzazione per dipendenze (ricalcolati solo se cambiano le collezioni usate).
 * Cache LRU di 64 voci per nome. ctxOf(d) è il contesto stabile dei motori (stessa forma di actuals.makeCtx). */
import { addDays, sum, mondayOf, todayLocal } from './util.js';
import { requirements } from '../engine/mrp.js';
import { computeSignals } from '../engine/signals.js';
import { optimize, formulaCost } from '../engine/formulation.js';
import { computeKpis } from '../engine/esg.js';
import { overview } from '../engine/sustainability.js';
import { reportingPeriods, ESG_DATA_COLLS } from '../engine/esg-years.js';
import { SPECIES, AFB1_LIMITS } from '../engine/nutrients.js';
import { buildIndex } from '../engine/trace.js';
import { makeIndex, costsOf, volumesOf, shipmentFacts, aggregateFacts, fixedFor, inventoryValuation, dataStart } from '../engine/actuals.js';

const MAX = 64;
const cache = new Map();
function memo(name, deps, fn) {
  const c = cache.get(name);
  if (c && c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i])) { cache.delete(name); cache.set(name, c); return c.value; }
  const value = fn();
  cache.delete(name); cache.set(name, { deps, value });
  if (cache.size > MAX) cache.delete(cache.keys().next().value); // la voce usata meno di recente
  return value;
}

export function appToday(d) { return d.settings?.dataset === 'demo' && d.settings?.demoAnchor ? d.settings.demoAnchor : todayLocal(); }

export const idx = d => memo('idx', [d.ingredients, d.products, d.formulas, d.specs, d.lines, d.customers, d.agents, d.lots, d.ingLots, d.runs], () => makeIndex(d));

export const costs = d => memo('costs', [d.products, d.formulas, d.ingredients, d.lines, d.settings?.energy], () => costsOf(d, idx(d)));

export const volumes = d => memo('vol', [d.shipments, appToday(d)], () => volumesOf(d, appToday(d)));

export const mrp = (d, weeks = 8) => memo('mrp' + weeks, [d.plan, d.products, d.formulas, d.ingredients, d.purchases, d.runs, d.ingLots, d.suppliers, d.settings?.ops, appToday(d)], () =>
  requirements({ today: appToday(d), weeks, plan: d.plan, products: d.products, formulas: d.formulas, ingredients: d.ingredients, purchases: d.purchases, runs: d.runs,
    ingLots: d.ingLots || [], suppliers: d.suppliers || [], settings: d.settings || {} }));

export function contaminantFor(d, formula) {
  const sp = SPECIES[formula?.species];
  return { AFB1: AFB1_LIMITS[sp?.afb1 || 'altri'] };
}
export const reopt = d => memo('reopt', [d.formulas, d.ingredients, d.specs], () => {
  const I = idx(d); const out = {};
  for (const f of d.formulas) {
    const spec = I.spec[f.specId];
    if (!spec) continue;
    out[f.id] = optimize({ ingredients: d.ingredients, spec, lines: f.lines, options: { contaminant: contaminantFor(d, f) } });
    out[f.id].current = formulaCost(f.lines, I.ing);
  }
  return out;
});

export const signals = d => memo('signals', [d, appToday(d)], () => computeSignals(d, appToday(d), { mrp: mrp(d), volumes: volumes(d), reopt: reopt(d), facts: facts(d), costs: costs(d), ix: idx(d) }));

export const period12 = d => { const t = appToday(d); return { from: addDays(t, -364), to: t }; };
export const kpis = (d, period = period12(d)) => memo('kpis' + period.from + period.to, [d.runs, d.energy, d.shipments, d.lots, d.complaints, d.visits, d.ingLots, d.esgManual, d.settings, d.formulas, d.ingredients, d.water, d.waste, d.survey], () => computeKpis(d, period));
/** Quadro ESG per il cruscotto: acqua, rifiuti, Scope 1-2-3, questionario, maturità e prossimi passi. */
export const esgOverview = d => { const P = period12(d); const R = kpis(d, P); return memo('esgOverview', [R, d.ingLots, d.survey], () => overview(d, P, R)); };
/** Esercizi ESG dell'archivio, dal più recente (engine/esg-years.js): dipendono dalle impostazioni, da oggi, dai registri e dallo storico. */
export const esgPeriods = d => memo('esgPeriods', [d.settings, appToday(d), d.esgHistory, d.esgClosings, ...ESG_DATA_COLLS.map(c => d[c])], () => reportingPeriods(d));

export const traceIndex = d => memo('trace', [d.lots, d.shipments, d.ingLots, d.adjustments], () => buildIndex(d));

/** Serie settimanali di produzione e consegne (ultime 52 settimane). */
export const weekly = d => memo('weekly', [d.runs, d.shipments, appToday(d)], () => {
  const t = appToday(d); const w0 = mondayOf(addDays(t, -7 * 51));
  const weeks = Array.from({ length: 52 }, (_, k) => addDays(w0, 7 * k));
  const prod = Object.fromEntries(weeks.map(w => [w, 0])), ship = Object.fromEntries(weeks.map(w => [w, 0])), rev = Object.fromEntries(weeks.map(w => [w, 0]));
  for (const r of d.runs) { const w = mondayOf(r.date); if (w in prod) prod[w] += r.tonnes; }
  for (const s of d.shipments) { const w = mondayOf(s.date); if (w in ship) { ship[w] += s.tonnes; rev[w] += s.tonnes * s.price; } }
  return { weeks, prod: weeks.map(w => prod[w]), ship: weeks.map(w => ship[w]), rev: weeks.map(w => rev[w]) };
});

// ---------- fonte economica unica (engine/actuals.js) ----------
/** Un fatto per spedizione al costo effettivo dei lotti (materie prime, energia misurata, trasformazione, provvigioni…). */
export const facts = d => memo('facts', [d.shipments, d.lots, d.ingLots, d.runs, d.products, d.agents, d.customers, d.priceLists, d.lines, d.formulas, d.ingredients, d.settings?.energy, d.settings?.finance],
  () => shipmentFacts(d, { ix: idx(d), costsToday: costs(d) }));
/** Somme dei fatti nel periodo P per chiavi (con lo storico mensile prima dei fatti). */
export const agg = (d, P, keys = []) => memo('agg|' + keys + '|' + P.from + '|' + P.to, [facts(d), d.salesHistory], () => aggregateFacts(facts(d), d.salesHistory || [], P, keys));
/** Costi fissi del periodo P (consuntivo, mesi aperti dal budget o stimati). */
// String(): null/false (ripiego spento) e undefined (ripiego di base 'budget') devono dare chiavi diverse
export const fixedP = (d, P, opts = {}) => memo('fixed|' + P.from + '|' + P.to + '|' + (opts.kind || '') + '|' + String(opts.openMonthFallback), [d.fixedCosts, d.costCenters], () => fixedFor(d.fixedCosts || [], d.costCenters || [], P, opts));
/** Rimanenze di materie prime (FIFO, sostituzione, quarantena) e prodotto finito al costo effettivo. */
export const inventory = d => memo('inventory', [d.ingLots, d.ingredients, d.lots, d.shipments, d.runs, d.products, d.formulas, d.lines, d.settings?.energy, d.settings?.finance],
  () => inventoryValuation(d, { ix: idx(d), costsToday: costs(d), shipped: shippedByLot(d) }));
/** Primo giorno con dati di vendita (fatti o storico mensile): base della copertura dei confronti. */
export const dataStartOf = d => memo('dataStart', [facts(d), d.salesHistory], () => dataStart(facts(d), d.salesHistory || []));
/** Contesto stabile dei motori: {today, ix, costs, facts, mrp, volumes} (stessa forma di actuals.makeCtx). */
export const ctxOf = d => {
  const today = appToday(d), ix = idx(d), C = costs(d), F = facts(d), M = mrp(d), V = volumes(d);
  return memo('ctx', [today, ix, C, F, M, V], () => ({ today, ix, costs: C, facts: F, mrp: M, volumes: V }));
};

/**
 * Consegne e margine per cliente nel periodo P (di base gli ultimi 12 mesi).
 * margin = Σ marginFull (costo effettivo, dopo le provvigioni) · mc2 = margine di contribuzione ·
 * marginToday = Σ t × (prezzo − costo pieno di oggi), la formula di prima · last su tutta la storia, lastInP dentro P.
 */
export const customerStats = (d, P = period12(d)) => memo('custStats|' + P.from + '|' + P.to, [facts(d), costs(d), d.customers], () => {
  const C = costs(d);
  const out = {};
  for (const c of d.customers) out[c.id] = { tonnes: 0, revenue: 0, margin: 0, mc2: 0, marginToday: 0, last: null, lastInP: null, n: 0, byProduct: {} };
  for (const f of facts(d)) {
    const o = out[f.customerId]; if (!o) continue;
    if (!o.last || f.date > o.last) o.last = f.date;
    if (f.date < P.from || f.date > P.to) continue;
    if (!o.lastInP || f.date > o.lastInP) o.lastInP = f.date;
    o.tonnes += f.tonnes; o.revenue += f.revenue; o.n++;
    o.margin += f.marginFull; o.mc2 += f.mc2;
    o.marginToday += f.revenue - f.tonnes * (C[f.productId]?.total || 0);
    o.byProduct[f.productId] = (o.byProduct[f.productId] || 0) + f.tonnes;
  }
  return out;
});

export const shippedByLot = d => memo('shipLot', [d.shipments], () => {
  const m = {}; for (const s of d.shipments) m[s.lotId] = (m[s.lotId] || 0) + s.tonnes; return m;
});

export function sumBy(arr, f) { return sum(arr, f); }
