/* FeedOS 17 · Simulatore «E se…»: propaga uno scenario su formule, costi, margini, EBIT, pareggio ed emissioni.
 * Base: prezzo netto incassato negli ultimi 90 giorni (ripiego: listino), costo pieno di oggi, volumi degli ultimi 12 mesi,
 * solo prodotti attivi. Il motore restituisce già tutti gli aggregati: l'interfaccia non somma niente.
 * I fattori (driver) scompongono esattamente il Δ costi a formule invariate: Σ driver = annualCostDelta.
 * EBIT e pareggio partono dal consuntivo degli ultimi 12 mesi (margine di contribuzione per prodotto e costi fissi reali):
 * i volumi cambiano il costo fisso per tonnellata (CF / volume) e l'EBIT con la leva operativa. */
import { formulaCost, formulaCO2, optimize } from './formulation.js';
import { productCost, shrinkFactor } from './costing.js';
import { SPECIES, AFB1_LIMITS } from './nutrients.js';
import { aggregateFacts, fixedFor } from './actuals.js';
import { addDays, byId } from '../core/util.js';

/** Le 7 categorie di materie prime con un cursore nello scenario. */
export const CATEGORIES = [['cereale', 'Cereali'], ['proteico', 'Proteici'], ['coprodotto', 'Co-prodotti'], ['grasso', 'Grassi'], ['minerale', 'Minerali'], ['aminoacido', 'Aminoacidi'], ['premix', 'Premiscele']];

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const EMPTY = [];

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

/** Limite di aflatossina della specie della formula (stesso criterio di derived.contaminantFor). */
export function contaminantOf(formula) {
  const sp = SPECIES[formula?.species];
  return { AFB1: AFB1_LIMITS[sp?.afb1 || 'altri'] };
}

/**
 * Ingressi del simulatore dall'archivio e dal contesto dei motori (ctx = derived.ctxOf o actuals.makeCtx).
 * netPrice: €/t netti incassati negli ultimi 90 giorni; mcT e commissionRate per prodotto e costi fissi dagli ultimi 12 mesi.
 */
export function scenarioBase(d, ctx) {
  const today = ctx.today;
  const P12 = { from: addDays(today, -364), to: today };
  const from90 = addDays(today, -90);
  const n90 = {};
  for (const f of ctx.facts || EMPTY) if (f.date > from90 && f.date <= today) { const o = (n90[f.productId] ||= { t: 0, r: 0 }); o.t += f.tonnes; o.r += f.revenue; }
  const netPrice = {};
  for (const p of d.products || EMPTY) netPrice[p.id] = n90[p.id]?.t > 0 ? n90[p.id].r / n90[p.id].t : n0(p.listPrice);
  const A = aggregateFacts(ctx.facts || EMPTY, d.salesHistory || EMPTY, P12, ['productId']);
  const mcT = {}, commissionRate = {};
  for (const r of A.rows) if (r.tonnes > 0) { mcT[r.productId] = r.mc2 / r.tonnes; commissionRate[r.productId] = r.revenue ? r.commission / r.revenue : 0; }
  const hasFixed = (d.fixedCosts || EMPTY).some(r => (r.kind || 'consuntivo') === 'consuntivo');
  const F = hasFixed ? fixedFor(d.fixedCosts, d.costCenters || EMPTY, P12) : null;
  return {
    ingredients: d.ingredients || EMPTY, specs: d.specs || EMPTY, formulas: d.formulas || EMPTY, products: d.products || EMPTY, lines: d.lines || EMPTY,
    energy: d.settings?.energy || {}, volumes: ctx.volumes || {}, netPrice, mcT, commissionRate,
    fixedAnnual: F ? F.total : null, fixedEstimated: F ? F.estimatedMonths : [], elasticity: n0(d.settings?.finance?.elasticity),
    contaminant: contaminantOf,
  };
}

// ri-ottimizzazione ai prezzi di oggi (efficienza già disponibile): memorizzata per materie prime → formula → specifica
const baseCache = new WeakMap();
function baseReopt(d, f, spec) {
  if (d.baseReopt?.[f.id]) return d.baseReopt[f.id];
  let byF = baseCache.get(d.ingredients);
  if (!byF) { byF = new WeakMap(); baseCache.set(d.ingredients, byF); }
  const hit = byF.get(f);
  if (hit && hit.spec === spec) return hit.r;
  const r = optimize({ ingredients: d.ingredients, spec, lines: f.lines, options: { contaminant: d.contaminant?.(f) } });
  byF.set(f, { spec, r });
  return r;
}

/**
 * @param {object} d  { ingredients, specs, formulas, products, lines, energy: {kwhPrice, gplPrice}, volumes: {[productId]: t/anno},
 *   netPrice?: {[productId]: €/t}, mcT?: {[productId]: €/t}, commissionRate?: {[productId]: quota}, fixedAnnual?: €, elasticity?, contaminant?(formula), baseReopt? }
 * @param {object} sc { byCategory, byIngredient, kwhPricePct, gplPricePct, volumePct, listPricePct, elasticity, reoptimize, carbonPrice (€/t CO₂e), swapSoy }
 */
export function runScenario(d, sc = {}) {
  const ingById = byId(d.ingredients || EMPTY), specById = byId(d.specs || EMPTY), formById = byId(d.formulas || EMPTY), lineById = byId(d.lines || EMPTY);
  const overrides = scenarioPrices(d.ingredients || EMPTY, sc);
  const en0 = d.energy || {};
  const en1 = { kwhPrice: n0(en0.kwhPrice) * (1 + n0(sc.kwhPricePct) / 100), gplPrice: n0(en0.gplPrice) * (1 + n0(sc.gplPricePct) / 100) };
  const dp = n0(sc.listPricePct) / 100;
  const eps = sc.elasticity != null && Number.isFinite(+sc.elasticity) ? +sc.elasticity : n0(d.elasticity);
  const volF = (1 + n0(sc.volumePct) / 100) * Math.max(0, 1 + eps * dp);
  const swap = !!sc.swapSoy && !!ingById.soiadf;
  const pricesOnly = !Object.keys(overrides).length && !swap && !n0(sc.carbonPrice);
  const reCache = new Map(); // ri-ottimizzazione dello scenario per formula (non per prodotto)
  const drv = new Map();
  const addDrv = (key, label, v) => { const x = drv.get(key); if (x) x.annual += v; else drv.set(key, { key, label, annual: v }); };
  const rows = [];
  for (const p of d.products || EMPTY) {
    if (p.active === false) continue;
    const f = formById[p.formulaId];
    if (!f) continue;
    const line = lineById[p.lineId], spec = specById[f.specId];
    const base = productCost(p, f, ingById, line, en0);
    // soia certificata senza deforestazione: a ricetta fissa sostituisce kg per kg la soia convenzionale
    const fLines = swap ? swapSoy(f.lines) : f.lines;
    const fixed = productCost(p, { ...f, lines: fLines }, ingById, line, en1, overrides);
    let reopt = null, reLines = null, baseRe = null;
    if (sc.reoptimize && spec) {
      const br = baseReopt(d, f, spec);
      if (br?.status === 'optimal') baseRe = productCost(p, { ...f, lines: br.lines }, ingById, line, en0);
      let r = reCache.get(f.id);
      if (!r) {
        r = pricesOnly ? br : optimize({ ingredients: d.ingredients, spec, lines: f.lines,
          options: { priceOverrides: overrides, carbonPrice: n0(sc.carbonPrice) / 1000, contaminant: d.contaminant?.(f), exclude: swap ? ['soia44', 'soia48'] : [] } });
        reCache.set(f.id, r);
      }
      if (r?.status === 'optimal') { reLines = r.lines; reopt = productCost(p, { ...f, lines: r.lines }, ingById, line, en1, overrides); }
    }
    const scen = reopt || fixed;
    const vol = n0(d.volumes?.[p.id]), volSc = vol * volF;
    const net = d.netPrice?.[p.id] != null ? n0(d.netPrice[p.id]) : n0(p.listPrice), netSc = net * (1 + dp);
    const cr = n0(d.commissionRate?.[p.id]);
    const fixT = n0(base.processingFix);
    // margine di contribuzione €/t: consuntivo degli ultimi 12 mesi, altrimenti modellato (prezzo netto − costi variabili di oggi − provvigione)
    const mcT = d.mcT?.[p.id] != null ? n0(d.mcT[p.id]) : net - (base.total - fixT) - net * cr;
    const mcTsc = mcT - (scen.total - base.total) + (netSc - net) * (1 - cr);
    // fattori a formula fissa: prezzo di ogni materia prima (con il suo calo), sostituzione della soia, elettricità, GPL
    const k = 1 + shrinkFactor(p);
    for (const l of fLines) {
      const id = l.ing; if (!(id in overrides) || !ingById[id]) continue;
      addDrv(id, ingById[id].name, (overrides[id] - n0(ingById[id].price)) * n0(l.kg) / 1000 * k * volSc);
    }
    if (swap) addDrv('swapSoy', 'Soia certificata', (formulaCost(fLines, ingById) - formulaCost(f.lines, ingById)) * k * volSc);
    addDrv('kwh', 'Elettricità', n0(line?.kwhPerT) * (en1.kwhPrice - n0(en0.kwhPrice)) * volSc);
    addDrv('gpl', 'GPL', n0(line?.gplKgPerT) * (en1.gplPrice - n0(en0.gplPrice)) * volSc);
    rows.push({
      productId: p.id, volume: vol, volumeSc: volSc, net, netSc,
      base, fixed, reopt, scen, baseReopt: baseRe,
      delta: scen.total - base.total,
      deltaFixed: fixed.total - base.total,
      deltaReopt: reopt ? reopt.total - (baseRe || base).total : null,
      saving: reopt ? fixed.total - reopt.total : 0,
      savingAvailable: baseRe ? base.total - baseRe.total : 0,
      marginBase: net - base.total, marginSc: netSc - scen.total,
      annualMarginBase: (net - base.total) * vol, annualMarginSc: (netSc - scen.total) * volSc,
      mcT, mcTsc, contribBase: mcT * vol, contribSc: mcTsc * volSc, fixT,
      belowMin: scen.minPrice != null && netSc < scen.minPrice,
      co2Base: formulaCO2(f.lines, ingById), co2Sc: formulaCO2(reLines || fLines, ingById),
      lines: reLines,
    });
  }
  const tot = f => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const drivers = [...drv.values()].filter(x => Math.abs(x.annual) > 1e-9).sort((a, b) => Math.abs(b.annual) - Math.abs(a.annual));
  const V = tot(r => r.volume), Vsc = tot(r => r.volumeSc);
  const annualMarginBase = tot(r => r.annualMarginBase), annualMarginSc = tot(r => r.annualMarginSc);
  const contribBase = tot(r => r.contribBase), contribSc = tot(r => r.contribSc);
  const CF = d.fixedAnnual != null && Number.isFinite(+d.fixedAnnual) ? +d.fixedAnnual : null;
  const varBase = V ? tot(r => (r.base.total - r.fixT) * r.volume) / V : null, varSc = Vsc ? tot(r => (r.scen.total - r.fixT) * r.volumeSc) / Vsc : null;
  const fixedBase = CF != null && V ? CF / V : null, fixedSc = CF != null && Vsc ? CF / Vsc : null;
  const mcBase = V ? contribBase / V : null, mcSc = Vsc ? contribSc / Vsc : null;
  const ebitBase = CF != null ? contribBase - CF : null, ebitSc = CF != null ? contribSc - CF : null;
  const bepTBase = CF != null && mcBase > 0 ? CF / mcBase : null, bepTSc = CF != null && mcSc > 0 ? CF / mcSc : null;
  const dpT = V ? tot(r => r.net * dp * r.volume) / V : 0;
  return {
    rows, drivers, overrides,
    // Δ costi annui a formule invariate (= Σ driver) e con le formule ri-ottimizzate (al netto dell'efficienza già disponibile)
    annualCostDelta: tot(r => r.deltaFixed * r.volumeSc),
    annualCostDeltaReopt: sc.reoptimize ? tot(r => (r.deltaReopt ?? r.deltaFixed) * r.volumeSc) : null,
    savingReopt: tot(r => r.saving * r.volumeSc),
    savingAvailable: tot(r => r.savingAvailable * r.volume),
    annualMarginBase, annualMarginSc, dMargin: annualMarginSc - annualMarginBase,
    revenueBase: tot(r => r.net * r.volume), revenueSc: tot(r => r.netSc * r.volumeSc),
    volumeBase: V, volumeSc: Vsc, volumeFactor: volF, elasticity: eps,
    contribBase, contribSc, fixedAnnual: CF,
    ebitBase, ebitSc, dEbit: CF != null ? contribSc - contribBase : null, dEbitPct: ebitBase ? (contribSc - contribBase) / Math.abs(ebitBase) : null,
    unit: { varBase, varSc, fixedBase, fixedSc, base: varBase != null && fixedBase != null ? varBase + fixedBase : varBase, sc: varSc != null && fixedSc != null ? varSc + fixedSc : varSc,
      delta: varBase != null && varSc != null ? (varSc + (fixedSc ?? 0)) - (varBase + (fixedBase ?? 0)) : null, dFixed: fixedBase != null && fixedSc != null ? fixedSc - fixedBase : null },
    mcTBase: mcBase, mcTSc: mcSc, bepTBase, bepTSc, dBepT: bepTBase != null && bepTSc != null ? bepTSc - bepTBase : null,
    // variazione di volume che lascia invariato il margine di contribuzione dopo una variazione di prezzo: −Δp / (MdC/t + Δp)
    breakEvenVolumePct: dp && mcBase != null && mcBase + dpT !== 0 ? -dpT / (mcBase + dpT) : null, priceDeltaT: dpT,
    co2BaseT: tot(r => r.co2Base * r.volume) / 1000,
    co2ScT: tot(r => r.co2Sc * r.volumeSc) / 1000,
  };
}
function swapSoy(lines) {
  const out = []; let add = 0;
  for (const l of lines) { if (l.ing === 'soia44' || l.ing === 'soia48') add += +l.kg; else out.push({ ...l }); }
  if (add > 0) { const ex = out.find(l => l.ing === 'soiadf'); if (ex) ex.kg = +ex.kg + add; else out.push({ ing: 'soiadf', kg: add }); }
  return out;
}
