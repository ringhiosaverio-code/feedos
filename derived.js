/* FeedOS 16 · Dati derivati con memorizzazione per dipendenze (ricalcolati solo se cambiano le collezioni usate). */
import { byId, iso, addDays, sum, mondayOf } from './util.js';
import { productCost } from '../engine/costing.js';
import { requirements } from '../engine/mrp.js';
import { computeSignals, annualVolumes } from '../engine/signals.js';
import { optimize, formulaCost } from '../engine/formulation.js';
import { computeKpis } from '../engine/esg.js';
import { SPECIES, AFB1_LIMITS } from '../engine/nutrients.js';
import { buildIndex } from '../engine/trace.js';

const cache = new Map();
function memo(name, deps, fn) {
  const c = cache.get(name);
  if (c && c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i])) return c.value;
  const value = fn();
  cache.set(name, { deps, value });
  return value;
}

export function appToday(d) { return d.settings?.dataset === 'demo' && d.settings?.demoAnchor ? d.settings.demoAnchor : iso(new Date()); }

export const idx = d => memo('idx', [d.ingredients, d.products, d.formulas, d.specs, d.lines, d.customers, d.agents, d.lots, d.ingLots, d.runs], () => ({
  ing: byId(d.ingredients), prod: byId(d.products), form: byId(d.formulas), spec: byId(d.specs), line: byId(d.lines),
  cust: byId(d.customers), agent: byId(d.agents), lot: byId(d.lots), ingLot: byId(d.ingLots), run: byId(d.runs),
  runByLot: Object.fromEntries(d.runs.map(r => [r.lotId, r])),
}));

export const costs = d => memo('costs', [d.products, d.formulas, d.ingredients, d.lines, d.settings?.energy], () => {
  const I = idx(d);
  const out = {};
  for (const p of d.products) out[p.id] = productCost(p, I.form[p.formulaId], I.ing, I.line[p.lineId], d.settings?.energy);
  return out;
});

export const volumes = d => memo('vol', [d.shipments, appToday(d)], () => annualVolumes(d, appToday(d)));

export const mrp = (d, weeks = 8) => memo('mrp' + weeks, [d.plan, d.products, d.formulas, d.ingredients, d.purchases, d.runs, appToday(d)], () =>
  requirements({ today: appToday(d), weeks, plan: d.plan, products: d.products, formulas: d.formulas, ingredients: d.ingredients, purchases: d.purchases, runs: d.runs }));

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

export const signals = d => memo('signals', [d, appToday(d)], () => computeSignals(d, appToday(d), { mrp: mrp(d), volumes: volumes(d), reopt: reopt(d) }));

export const period12 = d => { const t = appToday(d); return { from: addDays(t, -364), to: t }; };
export const kpis = (d, period = period12(d)) => memo('kpis' + period.from + period.to, [d.runs, d.energy, d.shipments, d.lots, d.complaints, d.visits, d.ingLots, d.esgManual, d.settings, d.formulas, d.ingredients], () => computeKpis(d, period));

export const traceIndex = d => memo('trace', [d.lots, d.shipments, d.ingLots], () => buildIndex(d));

/** Serie settimanali di produzione e consegne (ultime 52 settimane). */
export const weekly = d => memo('weekly', [d.runs, d.shipments, appToday(d)], () => {
  const t = appToday(d); const w0 = mondayOf(addDays(t, -7 * 51));
  const weeks = Array.from({ length: 52 }, (_, k) => addDays(w0, 7 * k));
  const prod = Object.fromEntries(weeks.map(w => [w, 0])), ship = Object.fromEntries(weeks.map(w => [w, 0])), rev = Object.fromEntries(weeks.map(w => [w, 0]));
  for (const r of d.runs) { const w = mondayOf(r.date); if (w in prod) prod[w] += r.tonnes; }
  for (const s of d.shipments) { const w = mondayOf(s.date); if (w in ship) { ship[w] += s.tonnes; rev[w] += s.tonnes * s.price; } }
  return { weeks, prod: weeks.map(w => prod[w]), ship: weeks.map(w => ship[w]), rev: weeks.map(w => rev[w]) };
});

/** Consegne e margine per cliente negli ultimi 12 mesi. */
export const customerStats = d => memo('custStats', [d.shipments, d.customers, d.products, d.formulas, d.ingredients, appToday(d)], () => {
  const t = appToday(d), from = addDays(t, -364);
  const C = costs(d);
  const out = {};
  for (const c of d.customers) out[c.id] = { tonnes: 0, revenue: 0, margin: 0, last: null, n: 0, byProduct: {} };
  for (const s of d.shipments) {
    const o = out[s.customerId]; if (!o) continue;
    if (!o.last || s.date > o.last) o.last = s.date;
    if (s.date < from) continue;
    o.tonnes += s.tonnes; o.revenue += s.tonnes * s.price; o.n++;
    o.margin += s.tonnes * (s.price - (C[s.productId]?.total || 0));
    o.byProduct[s.productId] = (o.byProduct[s.productId] || 0) + s.tonnes;
  }
  return out;
});

export const shippedByLot = d => memo('shipLot', [d.shipments], () => {
  const m = {}; for (const s of d.shipments) m[s.lotId] = (m[s.lotId] || 0) + s.tonnes; return m;
});

export function sumBy(arr, f) { return sum(arr, f); }
