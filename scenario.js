/* FeedOS 16 · Simulatore «E se…»: propaga uno scenario su formule, costi, margini ed emissioni. */
import { formulaCost, formulaCO2, optimize } from './formulation.js';
import { productCost } from './costing.js';

/** Prezzi delle materie prime nello scenario (variazioni % per categoria e per singola materia prima). */
export function scenarioPrices(ingredients, sc) {
  const o = {};
  for (const i of ingredients) {
    let p = +i.price || 0;
    const cat = sc.byCategory?.[i.category];
    if (cat) p *= 1 + cat / 100;
    const one = sc.byIngredient?.[i.id];
    if (one) p *= 1 + one / 100;
    if (p !== +i.price) o[i.id] = p;
  }
  return o;
}

/**
 * @param {object} d  { ingredients, specs, formulas, products, lines, energy:{kwhPrice,gplPrice}, volumes:{[productId]: t/anno} }
 * @param {object} sc { byCategory, byIngredient, kwhPricePct, gplPricePct, volumePct, reoptimize, carbonPrice (€/t CO₂e), listPricePct }
 */
export function runScenario(d, sc) {
  const ingById = Object.fromEntries(d.ingredients.map(i => [i.id, i]));
  const specById = Object.fromEntries(d.specs.map(s => [s.id, s]));
  const formById = Object.fromEntries(d.formulas.map(f => [f.id, f]));
  const lineById = Object.fromEntries(d.lines.map(l => [l.id, l]));
  const overrides = scenarioPrices(d.ingredients, sc);
  const en0 = d.energy || {};
  const en1 = { kwhPrice: (+en0.kwhPrice || 0) * (1 + (sc.kwhPricePct || 0) / 100), gplPrice: (+en0.gplPrice || 0) * (1 + (sc.gplPricePct || 0) / 100) };
  const volF = 1 + (sc.volumePct || 0) / 100;
  const priceF = 1 + (sc.listPricePct || 0) / 100;
  const rows = [];
  for (const p of d.products) {
    if (p.active === false) continue;
    const f = formById[p.formulaId];
    if (!f) continue;
    const line = lineById[p.lineId];
    const base = productCost(p, f, ingById, line, en0);
    // soia certificata senza deforestazione: a ricetta fissa sostituisce kg per kg la soia convenzionale
    const fLines = sc.swapSoy && ingById.soiadf ? swapSoy(f.lines) : f.lines;
    const fixed = productCost({ ...p, listPrice: p.listPrice * priceF }, { ...f, lines: fLines }, ingById, line, en1, overrides);
    let reopt = null, reLines = null;
    if (sc.reoptimize && specById[f.specId]) {
      const r = optimize({ ingredients: d.ingredients, spec: specById[f.specId], lines: f.lines,
        options: { priceOverrides: overrides, carbonPrice: (sc.carbonPrice || 0) / 1000, contaminant: d.contaminant?.(f), exclude: sc.swapSoy ? ['soia44', 'soia48'] : [] } });
      if (r.status === 'optimal') {
        reLines = r.lines;
        reopt = productCost({ ...p, listPrice: p.listPrice * priceF }, { ...f, lines: r.lines }, ingById, line, en1, overrides);
      }
    }
    const scen = reopt || fixed;
    const vol = (+d.volumes?.[p.id] || 0);
    rows.push({
      productId: p.id, volume: vol, volumeSc: vol * volF,
      base, fixed, reopt, scen,
      delta: scen.total - base.total,
      deltaFixed: fixed.total - base.total,
      saving: reopt ? fixed.total - reopt.total : 0,
      marginBase: base.margin, marginSc: scen.margin,
      annualMarginBase: base.margin * vol, annualMarginSc: scen.margin * vol * volF,
      co2Base: formulaCO2(f.lines, ingById), co2Sc: formulaCO2(reLines || fLines, ingById),
      lines: reLines,
    });
  }
  const tot = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const annualCostDelta = rows.reduce((s, r) => s + r.delta * r.volumeSc, 0);
  const revenueBase = rows.reduce((s, r) => s + r.base.price * r.volume, 0);
  // contributi dei singoli fattori (a ricetta fissa): quanto pesa ciascuna materia prima variata
  const drivers = [];
  for (const [id, price] of Object.entries(overrides)) {
    let dAnn = 0;
    for (const p of d.products) {
      const f = formById[p.formulaId]; if (!f) continue;
      const kg = f.lines.find(l => l.ing === id)?.kg || 0;
      dAnn += (price - (+ingById[id].price || 0)) * kg / 1000 * (+d.volumes?.[p.id] || 0) * volF;
    }
    if (Math.abs(dAnn) > 0.5) drivers.push({ key: id, label: ingById[id].name, annual: dAnn });
  }
  const tVol = rows.reduce((s, r) => s + r.volumeSc, 0);
  const enDelta = ((en1.kwhPrice - (+en0.kwhPrice || 0)) * avgLine(d, 'kwhPerT') + (en1.gplPrice - (+en0.gplPrice || 0)) * avgLine(d, 'gplKgPerT')) * tVol;
  if (Math.abs(enDelta) > 0.5) drivers.push({ key: 'energia', label: 'Energia (elettricità e GPL)', annual: enDelta });
  drivers.sort((a, b) => Math.abs(b.annual) - Math.abs(a.annual));
  return {
    rows, drivers, overrides,
    annualCostDelta,
    annualMarginBase: tot('annualMarginBase'), annualMarginSc: tot('annualMarginSc'),
    revenueBase,
    savingReopt: rows.reduce((s, r) => s + r.saving * r.volumeSc, 0),
    co2BaseT: rows.reduce((s, r) => s + r.co2Base * r.volume, 0) / 1000,
    co2ScT: rows.reduce((s, r) => s + r.co2Sc * r.volumeSc, 0) / 1000,
  };
}
function swapSoy(lines) {
  const out = []; let add = 0;
  for (const l of lines) { if (l.ing === 'soia44' || l.ing === 'soia48') add += +l.kg; else out.push({ ...l }); }
  if (add > 0) { const ex = out.find(l => l.ing === 'soiadf'); if (ex) ex.kg = +ex.kg + add; else out.push({ ing: 'soiadf', kg: add }); }
  return out;
}
function avgLine(d, k) {
  const lineById = Object.fromEntries(d.lines.map(l => [l.id, l]));
  let s = 0, t = 0;
  for (const p of d.products) { const v = +d.volumes?.[p.id] || 0; s += (+lineById[p.lineId]?.[k] || 0) * v; t += v; }
  return t ? s / t : 0;
}
