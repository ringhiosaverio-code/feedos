/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): formulazione a basso carbonio (specifica dei mangimi).
 * Usa la programmazione lineare di formulation.js (optimize, carbonFrontier) senza modificarla: si passa un elenco di materie
 * prime il cui «ef» è il valore del registro per l'origine e lo schema scelti (obiettivo co2), la sola quota LUC + gestione del
 * suolo (obiettivo luc) o l'occupazione di suolo (obiettivo land). Il vincolo sulle proteine edibili dall'uomo (HeP) è un
 * rapporto lineare (Σ x·PG·HEF ≤ massimo × Σ x·PG) aggiunto alla specifica.
 * Frontiera di Pareto (€/t, kg CO₂e/t) con il costo marginale Δ€/t ÷ Δkg CO₂e/t; leve di riduzione per prodotto (MACC) con
 * kg CO₂e/t, €/t e € per t CO₂e, annualizzate sui volumi. Funzioni pure, senza orologio né console. */
import { optimize, carbonFrontier, formulaCost, buildLP } from './formulation.js';
import { solveLP } from './lp.js';
import { SPECIES, AFB1_LIMITS } from './nutrients.js';
import { ingredientEf, familyOf, circOf, landM2a, pcf, cached, A, has, fin, num, isObj } from './esg-pcf-core.js';
import { flagDefaults } from './esg-clima-factors.js';
import { esgToday } from './esg-years.js';
import { round, sum, addDays } from '../core/util.js';

export const OBJECTIVES = { co2: 'Impronta totale (kg CO₂e/t)', luc: 'Cambio d’uso e gestione del suolo (kg CO₂e/t)', land: 'Occupazione di suolo (m²·anno/t)' };
const contaminantFor = species => ({ AFB1: AFB1_LIMITS[SPECIES[species]?.afb1 || 'altri'] });

/** Varianti di origine e schema disponibili nel registro per una materia prima: [{key, origin, scheme, coc, total, label}]. */
export function efChoices(d, ingId) {
  const rows = A(d?.efIngredients).filter(r => r && r.ingId === ingId && fin(r.total));
  return rows.map(r => ({ key: r.id, origin: r.origin || '*', scheme: r.scheme || null, coc: r.coc || null, total: +r.total, luc: num(r.luc),
    label: `${r.origin === '*' || !r.origin ? 'generica' : r.origin}${r.scheme ? ' · ' + r.scheme : ''}${r.coc ? ' (' + r.coc + ')' : ''} · ${round(+r.total, 0)} kg/t` }));
}

/**
 * Materie prime per la programmazione lineare con il valore dell'obiettivo al posto di ef. choices: {ingId: {origin, scheme, coc}}.
 * Ogni voce porta _co2 (impronta), _luc (LUC + gestione del suolo), _land (m²·a/t) e nutr.HEPN (PG × frazione edibile).
 */
export function lpIngredients(d, { objective = 'co2', choices = {}, date = null, hepScenario = 'med' } = {}) {
  const day = date || esgToday(d);
  return A(d?.ingredients).filter(i => i && has(i.id) && i.active !== false).map(ing => {
    const ch = isObj(choices[ing.id]) ? choices[ing.id] : {};
    const ef = ingredientEf(d, ing.id, { ...ch, date: day, components: true });
    const co2 = ef.total ?? 0;
    let lucLm = ef.luc != null || ef.landMgmt != null ? (ef.luc || 0) + (ef.landMgmt || 0) : null;
    if (lucLm == null) { const f = flagDefaults(d, ing).flag; lucLm = f ? co2 * Math.max(0, Math.min(1, f.value)) : 0; }
    const land = landM2a(d, ing.id, ch).value ?? 0;
    const c = circOf(d, ing);
    const hef = hepScenario === 'low' ? c.hefLow : hepScenario === 'high' ? c.hefHigh : c.hefMed;
    const metric = objective === 'luc' ? lucLm : objective === 'land' ? land : co2;
    return { ...ing, ef: metric, _co2: co2, _luc: lucLm, _lucOnly: ef.luc != null ? ef.luc : null, _land: land, _src: ef.source, nutr: { ...(ing.nutr || {}), HEPN: (num(ing.nutr?.PG) ?? 0) * hef } };
  });
}
const metrics = (lines, byId) => {
  let co2 = 0, luc = 0, land = 0, pg = 0, hepn = 0;
  for (const l of lines) { const i = byId[l.ing]; if (!i) continue; const t = (+l.kg || 0) / 1000; co2 += t * i._co2; luc += t * i._luc; land += t * i._land; pg += (+l.kg || 0) * (num(i.nutr?.PG) ?? 0); hepn += (+l.kg || 0) * (num(i.nutr?.HEPN) ?? 0); }
  return { co2, luc, land, hep: pg > 0 ? hepn / pg : null };
};
function problemFor(d, formula, opts) {
  const spec = A(d?.specs).find(s => s && s.id === formula?.specId);
  if (!spec) return null;
  const ings = lpIngredients(d, opts);
  const ratios = [...A(spec.ratios)];
  if (fin(opts.hepMax)) ratios.push({ num: 'HEPN', den: 'PG', max: +opts.hepMax });
  return { P: { ingredients: ings, spec: { ...spec, ratios }, lines: A(formula.lines), options: { contaminant: contaminantFor(formula.species || spec.species) } }, ings, byId: Object.fromEntries(ings.map(i => [i.id, i])), spec };
}

/**
 * Frontiera a basso carbonio di una formula: punti di Pareto tra costo (€/t) e obiettivo scelto, con il costo marginale tra punti
 * vicini e rispetto alla formula approvata. opts: {objective: 'co2'|'luc'|'land', choices, hepMax, points (≤ 12), date}.
 * → {objective, current: {cost, co2, luc, land, hep, metric}, points: [{cost, metric, co2, luc, land, hep, lines, eurPerKg, vsCurrent}], cheapest, minMetric, spec} | null
 */
export function lowCarbonFrontier(d, formulaOrId, opts = {}) {
  const formula = typeof formulaOrId === 'string' ? A(d?.formulas).find(f => f && f.id === formulaOrId) : formulaOrId;
  if (!formula) return null;
  const o = { objective: OBJECTIVES[opts.objective] ? opts.objective : 'co2', choices: isObj(opts.choices) ? opts.choices : {}, hepMax: fin(opts.hepMax) ? +opts.hepMax : null, points: Math.max(3, Math.min(12, Math.round(+opts.points || 9))), date: opts.date || null, hepScenario: opts.hepScenario || 'med' };
  const key = `front|${formula.id}|${formula.version}|${JSON.stringify(o)}`;
  return cached(key, [d?.ingredients, d?.efIngredients, d?.supplierPcfs, d?.specs, d?.formulas, d?.ingCircular, d?.settings], () => {
    const pb = problemFor(d, formula, o);
    if (!pb) return null;
    const cur = metrics(A(formula.lines), pb.byId);
    const curCost = formulaCost(A(formula.lines), pb.byId);
    const mOf = m => (o.objective === 'luc' ? m.luc : o.objective === 'land' ? m.land : m.co2);
    let pts = [];
    try { pts = carbonFrontier(pb.P, o.points); } catch { pts = []; }
    const points = pts.map(p => { const m = metrics(p.lines, pb.byId); return { cost: p.cost, metric: mOf(m), ...m, lines: p.lines.map(l => ({ ing: l.ing, kg: round(l.kg, 2) })), abatement: p.abatement }; })
      .filter((p, i, a) => a.findIndex(q => Math.abs(q.cost - p.cost) < 0.01 && Math.abs(q.metric - p.metric) < 0.01) === i)
      .sort((a, b) => b.metric - a.metric);
    const base = points[0] || null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], prev = points[i - 1];
      p.eurPerKg = prev && prev.metric - p.metric > 1e-6 ? (p.cost - prev.cost) / (prev.metric - p.metric) : null;
      p.vsCurrent = { cost: p.cost - curCost, metric: p.metric - mOf(cur), co2: p.co2 - cur.co2, eurPerKg: mOf(cur) - p.metric > 1e-6 ? (p.cost - curCost) / (mOf(cur) - p.metric) : null };
      p.vsBase = { cost: p.cost - base.cost, metric: p.metric - base.metric, co2: p.co2 - base.co2, pct: base.metric ? (p.metric - base.metric) / base.metric : null, eurPerKg: base.metric - p.metric > 1e-6 ? (p.cost - base.cost) / (base.metric - p.metric) : null };
    }
    return { objective: o.objective, objectiveLabel: OBJECTIVES[o.objective], formulaId: formula.id, formulaVersion: formula.version, specId: pb.spec.id, hepMax: o.hepMax, opts: o,
      current: { cost: curCost, metric: mOf(cur), ...cur }, base, points, cheapest: base, minMetric: points[points.length - 1] || null, feasible: points.length > 0 };
  }, 2);
}

/**
 * Punto a costo minimo con un tetto preciso dell'obiettivo (stessa specifica e stesse materie prime della frontiera): una
 * programmazione lineare in più con il vincolo Σ valore × kg ≤ tetto × 1.000. → punto come quelli della frontiera | null se impossibile.
 */
export function frontierAt(d, formulaOrId, fr, cap) {
  const formula = typeof formulaOrId === 'string' ? A(d?.formulas).find(f => f && f.id === formulaOrId) : formulaOrId;
  if (!formula || !fr || !fin(cap)) return null;
  const pb = problemFor(d, formula, fr.opts || { objective: fr.objective });
  if (!pb) return null;
  let r = null, ings = null;
  try { const b = buildLP(pb.P); ings = b.ings; b.lp.A.push(ings.map(i => +i.ef || 0)); b.lp.b.push(+cap * 1000); b.lp.types.push('<='); r = solveLP(b.lp); } catch { r = null; }
  if (!r || r.status !== 'optimal') return null;
  const lines = ings.map((i, j) => ({ ing: i.id, kg: r.x[j] })).filter(l => l.kg > 1e-6);
  const m = metrics(lines, pb.byId);
  const mOf = x => (fr.objective === 'luc' ? x.luc : fr.objective === 'land' ? x.land : x.co2);
  const cost = formulaCost(lines, pb.byId);
  const base = fr.base || { cost, metric: mOf(m), co2: m.co2 };
  return { cost, metric: mOf(m), ...m, lines: lines.map(l => ({ ing: l.ing, kg: round(l.kg, 2) })), cap: +cap,
    vsCurrent: { cost: cost - fr.current.cost, metric: mOf(m) - fr.current.metric, co2: m.co2 - fr.current.co2 },
    vsBase: { cost: cost - base.cost, metric: mOf(m) - base.metric, co2: m.co2 - base.co2, pct: base.metric ? (mOf(m) - base.metric) / base.metric : null, eurPerKg: base.metric - mOf(m) > 1e-6 ? (cost - base.cost) / (base.metric - mOf(m)) : null } };
}
/** Punto a costo minimo che riduce l'obiettivo della quota indicata rispetto alla riformulazione a costo minimo (es. 0,09 = −9%). */
export function pointForCut(d, formulaOrId, fr, cut) {
  if (!fr || !fr.base) return null;
  return frontierAt(d, formulaOrId, fr, fr.base.metric * (1 - cut));
}

/** Operazioni per salvare una proposta di formula a basso carbonio (lowCarbonDesigns) da un punto della frontiera. */
export function designOps(d, product, fr, point, { at = null, note = '' } = {}) {
  if (!product || !fr || !point) return { ops: [], design: null };
  const day = at || esgToday(d);
  const r = pcf(d, product.id, {});
  let n = A(d?.lowCarbonDesigns).filter(x => x && x.productId === product.id).length + 1;
  while (A(d?.lowCarbonDesigns).some(x => x && x.id === `lcd-${product.id}-${n}`)) n++;
  const design = designRecord(product, fr, point, r, { id: `lcd-${product.id}-${n}`, at: day, note });
  return { ops: [{ kind: 'add', coll: 'lowCarbonDesigns', obj: design }], design };
}

/**
 * Riga di lowCarbonDesigns: variazioni rispetto alla riformulazione a costo minimo con i prezzi di oggi (costDeltaT, co2DeltaT, pct
 * sull'impronta del prodotto) e rispetto alla formula approvata (vsFormula). Le righe della formula restano interne.
 */
export function designRecord(product, fr, point, r, { id, at, note = '', status = 'proposta' }) {
  const base = fr.base || { cost: fr.current.cost, co2: fr.current.co2 };
  return { id, productId: product.id, formulaId: fr.formulaId, baseVersion: fr.formulaVersion, objective: fr.objective, cap: round(point.metric, 1),
    costDeltaT: round(point.cost - base.cost, 2), co2DeltaT: round(point.co2 - base.co2, 1), co2DeltaPct: r && r.total ? round((point.co2 - base.co2) / r.total * 100, 1) : null,
    vsFormula: { costDeltaT: round(point.cost - fr.current.cost, 2), co2DeltaT: round(point.co2 - fr.current.co2, 1) }, pcfBase: r ? round(r.total, 0) : null,
    lines: point.lines, hep: point.hep == null ? null : round(point.hep, 3), createdAt: at, status, note: note || '' };
}

/* ---------------- leve di riduzione per prodotto (MACC) ---------------- */
export const LEVERS = {
  dcf: { label: 'Soia senza deforestazione al posto di quella convenzionale', short: 'Soia DCF' },
  'colza-girasole': { label: 'Colza e girasole al posto della farina di soia', short: 'Colza e girasole' },
  leguminose: { label: 'Leguminose nazionali (favino, pisello) almeno al 5%', short: 'Leguminose' },
  coprodotti: { label: 'Più coprodotti dell’agroindustria (+10 punti)', short: 'Coprodotti' },
  grassi: { label: 'Grassi senza olio di soia o di palma', short: 'Fonte di grasso' },
};
/** Volume annuo di un prodotto (t vendute negli ultimi 365 giorni; altrimenti prodotte). */
export function annualVolume(d, productId) {
  const today = esgToday(d), from = addDays(today, -365);
  const ship = sum(A(d?.shipments).filter(s => s && s.productId === productId && String(s.date || '') > from && String(s.date || '') <= today), s => +s.tonnes || 0);
  if (ship > 0) return ship;
  return sum(A(d?.runs).filter(r => r && r.productId === productId && String(r.date || '') > from && String(r.date || '') <= today), r => +r.tonnes || 0);
}
/**
 * Leve di riduzione di un prodotto: ogni leva è una variante della programmazione lineare sulla specifica della formula (stessa
 * nutrizione), confrontata con l'ottimo a costo minimo. → {productId, base: {cost, co2}, levers: [{id, label, feasible, dCost (€/t),
 * dCo2 (kg CO₂e/t risparmiati), eurPerT (€/t CO₂e), annualT (t CO₂e/anno), annualEur, lines}], volume, cheapest}
 */
export function productMacc(d, productId) {
  const prod = A(d?.products).find(p => p && p.id === productId);
  const formula = prod ? A(d?.formulas).find(f => f && f.id === prod.formulaId) : null;
  if (!prod || !formula) return null;
  return cached('macc|' + productId, [d?.ingredients, d?.efIngredients, d?.supplierPcfs, d?.specs, d?.formulas, d?.products, d?.shipments, d?.settings], () => {
    const pb = problemFor(d, formula, { objective: 'co2' });
    if (!pb) return null;
    const run = P => { try { const r = optimize(P); return r.status === 'optimal' ? r : null; } catch { return null; } };
    const base = run(pb.P);
    if (!base) return null;
    const m0 = metrics(base.lines, pb.byId);
    const volume = annualVolume(d, productId);
    const famOf = id => familyOf(d, pb.byId[id]) || '';
    const ids = pb.ings.map(i => i.id);
    const soyMeal = ids.filter(id => famOf(id) === 'soia-farina');
    const soyConv = soyMeal.filter(id => (pb.byId[id]._lucOnly ?? pb.byId[id]._luc) > 0.1 * pb.byId[id]._co2);
    const variant = (patch) => {
      const spec = { ...pb.P.spec, groups: [...A(pb.P.spec.groups), ...A(patch.groups)], ingLimits: { ...(pb.P.spec.ingLimits || {}), ...(patch.ingLimits || {}) } };
      return run({ ...pb.P, spec, options: { ...pb.P.options, exclude: patch.exclude || [] } });
    };
    const curRes = sum(A(formula.lines).filter(l => circOf(d, pb.byId[l.ing]).coClass === 'residuo'), l => +l.kg || 0);
    const residues = ids.filter(id => circOf(d, pb.byId[id]).coClass === 'residuo');
    const legumes = ids.filter(id => famOf(id) === 'leguminose');
    const fats = ids.filter(id => ['soia-olio', 'palma-olio'].includes(famOf(id)));
    const defs = {
      dcf: soyConv.length && soyMeal.length > soyConv.length ? { exclude: soyConv } : null,
      'colza-girasole': soyMeal.length ? { exclude: soyMeal } : null,
      leguminose: legumes.length ? { groups: [{ name: 'leguminose-min', ings: legumes, min: 50 }] } : null,
      coprodotti: residues.length ? { groups: [{ name: 'coprodotti-min', ings: residues, min: Math.min(600, curRes + 100) }] } : null,
      grassi: fats.length && base.lines.some(l => fats.includes(l.ing)) ? { exclude: fats } : null,
    };
    const levers = Object.entries(LEVERS).map(([id, L]) => {
      const def = defs[id];
      if (!def) return { id, ...L, feasible: false, reason: 'non applicabile a questa formula' };
      const r = variant(def);
      if (!r) return { id, ...L, feasible: false, reason: 'la specifica nutrizionale non si rispetta' };
      const m = metrics(r.lines, pb.byId);
      const dCost = r.cost - base.cost, dCo2 = m0.co2 - m.co2;
      return { id, ...L, feasible: true, dCost, dCo2, eurPerT: dCo2 > 0.5 ? dCost / dCo2 * 1000 : null, annualT: volume * dCo2 / 1000, annualEur: volume * dCost, lines: r.lines.map(l => ({ ing: l.ing, kg: round(l.kg, 1) })), reduces: dCo2 > 0.5 };
    });
    const useful = levers.filter(l => l.feasible && l.reduces).sort((a, b) => a.eurPerT - b.eurPerT);
    return { productId, name: prod.name, formulaId: formula.id, base: { cost: base.cost, co2: m0.co2 }, levers, volume, cheapest: useful[0] || null };
  }, 2);
}
