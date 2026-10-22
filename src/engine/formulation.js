/* FeedOS 16 · Formulazione a costo minimo con analisi di sensibilità.
 * Variabili: kg di ciascuna materia prima per 1.000 kg di mangime (tal quale).
 * Obiettivo: € per t = Σ prezzo(€/t)/1000 · kg  (+ eventuale prezzo del carbonio · kg CO₂e/t). */
import { solveLP } from './lp.js';
import { NUT, SPECIES, AFB1_LIMITS, profile } from './nutrients.js';

export const BATCH = 1000;

function val(ing, nut) {
  if (nut === 'SS') return +ing.dm || 0;
  const v = ing.nutr?.[nut];
  return v == null || v === '' ? 0 : +v;
}

/** Prezzo effettivo €/t di una materia prima (con eventuale scenario). */
export function priceOf(ing, overrides) {
  if (overrides && overrides[ing.id] != null) return +overrides[ing.id];
  return +ing.price || 0;
}

/**
 * Costruisce il problema LP.
 * @param {object} P { ingredients, spec, lines, options }
 *  spec.constraints: [{nut, min, max, basis:'tq'|'ss'}]
 *  spec.ratios: [{num, den, min, max}]
 *  spec.ingLimits: { [ingId]: {min, max} } (kg/t)
 *  spec.groups: [{name, ings:[id], min, max}] (kg/t)
 *  options: { carbonPrice (€/kg CO₂e), maxChange (kg/t), locked:{[id]:kg}, exclude:[id], priceOverrides, contaminant:{AFB1:max}, stockTonnes, drop:{constraints:Set,...} }
 */
export function buildLP(P) {
  const o = P.options || {};
  const exclude = new Set(o.exclude || []);
  const ings = P.ingredients.filter(i => !exclude.has(i.id) && i.active !== false);
  const n = ings.length;
  const c = ings.map(i => priceOf(i, o.priceOverrides) / 1000 + (o.carbonPrice || 0) * (+i.ef || 0) / 1000);
  const A = [], b = [], types = [], meta = [];
  const push = (row, type, rhs, m) => { A.push(row); types.push(type); b.push(rhs); meta.push(m); };
  push(ings.map(() => 1), '=', BATCH, { kind: 'total', label: 'Totale 1.000 kg' });
  const drop = o.drop || {};
  for (const k of P.spec?.constraints || []) {
    if (drop.nut && drop.nut.has(k.nut + (k.basis === 'ss' ? '@ss' : ''))) continue;
    const ss = k.basis === 'ss';
    const row = bound => ings.map(i => ss ? val(i, k.nut) - bound * (+i.dm || 0) / 100 : val(i, k.nut));
    if (k.min != null && k.min !== '') push(ss ? row(+k.min) : row(0), '>=', ss ? 0 : BATCH * +k.min, { kind: 'nut', nut: k.nut, side: 'min', bound: +k.min, basis: k.basis || 'tq' });
    if (k.max != null && k.max !== '') push(ss ? row(+k.max) : row(0), '<=', ss ? 0 : BATCH * +k.max, { kind: 'nut', nut: k.nut, side: 'max', bound: +k.max, basis: k.basis || 'tq' });
  }
  for (const r of P.spec?.ratios || []) {
    if (drop.ratio && drop.ratio.has(r.num + '/' + r.den)) continue;
    if (r.min != null && r.min !== '') push(ings.map(i => val(i, r.num) - r.min * val(i, r.den)), '>=', 0, { kind: 'ratio', num: r.num, den: r.den, side: 'min', bound: +r.min });
    if (r.max != null && r.max !== '') push(ings.map(i => val(i, r.num) - r.max * val(i, r.den)), '<=', 0, { kind: 'ratio', num: r.num, den: r.den, side: 'max', bound: +r.max });
  }
  for (const g of P.spec?.groups || []) {
    if (drop.group && drop.group.has(g.name)) continue;
    const set = new Set(g.ings);
    const row = ings.map(i => set.has(i.id) || (g.category && i.category === g.category) ? 1 : 0);
    if (row.every(v => v === 0)) continue;
    if (g.min != null && g.min !== '') push(row, '>=', +g.min, { kind: 'group', name: g.name, side: 'min', bound: +g.min });
    if (g.max != null && g.max !== '') push(row, '<=', +g.max, { kind: 'group', name: g.name, side: 'max', bound: +g.max });
  }
  if (o.contaminant) {
    for (const [nut, max] of Object.entries(o.contaminant)) {
      if (max == null || (drop.cont && drop.cont.has(nut))) continue;
      push(ings.map(i => +(i.contam?.[nut] ?? 0)), '<=', BATCH * max, { kind: 'contam', nut, side: 'max', bound: max });
    }
  }
  // limiti per ingrediente
  const cur = Object.fromEntries((P.lines || []).map(l => [l.ing, +l.kg || 0]));
  const lb = [], ub = [];
  for (const i of ings) {
    const lim = P.spec?.ingLimits?.[i.id] || {};
    let lo = lim.min != null && lim.min !== '' ? +lim.min : 0;
    let hi = lim.max != null && lim.max !== '' ? +lim.max : (i.maxKg != null ? +i.maxKg : BATCH);
    if (o.locked && o.locked[i.id] != null) { lo = hi = +o.locked[i.id]; }
    else if (o.maxChange != null && o.maxChange !== '' && cur[i.id] != null) {
      lo = Math.max(lo, cur[i.id] - +o.maxChange); hi = Math.min(hi, cur[i.id] + +o.maxChange);
    } else if (o.maxChange != null && o.maxChange !== '' && cur[i.id] == null && P.lines?.length) {
      hi = Math.min(hi, +o.maxChange); // un nuovo ingrediente può entrare al massimo per la variazione ammessa
    }
    if (o.stockTonnes && i.stock != null && i.stock !== '') hi = Math.min(hi, BATCH * (+i.stock) / +o.stockTonnes);
    lb.push(Math.max(0, lo)); ub.push(Math.max(Math.max(0, lo), hi));
  }
  return { lp: { c, A, b, types, lb, ub }, ings, meta };
}

/** Ottimizza e restituisce formula, profilo, vincoli attivi e prezzi ombra. */
export function optimize(P) {
  const { lp, ings, meta } = buildLP(P);
  if (ings.length < 1) return { status: 'error', message: 'Nessuna materia prima ammessa.' };
  const r = solveLP(lp);
  if (r.status !== 'optimal') return { status: r.status, message: r.message, ings, meta };
  const byId = Object.fromEntries(ings.map(i => [i.id, i]));
  const o = P.options || {};
  const lines = ings.map((i, j) => ({ ing: i.id, kg: round(r.x[j], 6) })).filter(l => l.kg > 1e-6).sort((a, b) => b.kg - a.kg);
  const cost = lines.reduce((s, l) => s + priceOf(byId[l.ing], o.priceOverrides) * l.kg / 1000, 0);
  const prof = profile(lines, byId);
  const constraints = meta.map((m, k) => {
    const shadowPerUnit = r.duals[k]; // € per unità di termine noto (obiettivo in €/t)
    let shadow = null, unitLabel = '';
    if (m.kind === 'nut') {
      const nut = NUT[m.nut];
      // termine noto = 1000·limite (t.q.). Per SS la riga è riformulata: effetto per unità di limite ≈ -Σ dm/100·x·y
      shadow = m.basis === 'ss' ? shadowPerUnit * ssWeight(r.x, ings) : shadowPerUnit * BATCH;
      unitLabel = `€/t per +1 ${nut?.unit === '%' ? 'punto %' : nut?.unit}`;
    } else if (m.kind === 'group') { shadow = shadowPerUnit; unitLabel = '€/t per +1 kg'; }
    else if (m.kind === 'contam') { shadow = shadowPerUnit * BATCH; unitLabel = '€/t per +1 µg/kg'; }
    else if (m.kind === 'ratio') { shadow = null; }
    return { ...m, value: meta[k].kind === 'nut' ? (m.basis === 'ss' ? dmValue(prof, m.nut) : prof[m.nut]) : r.activity[k] / (m.kind === 'contam' ? BATCH : 1), binding: r.binding[k], dual: r.duals[k], shadow: m.kind === 'total' ? null : (r.binding[k] ? shadow : 0), unitLabel };
  });
  const ingredients = ings.map((i, j) => {
    const price = priceOf(i, o.priceOverrides);
    const kg = r.x[j];
    const rcTotal = r.reducedCosts[j] - (r.boundDuals[j] || 0); // costo ridotto rispetto a tutti i vincoli (€/kg di ingrediente)
    const used = kg > 1e-6;
    const atLb = r.atLower[j] && lp.lb[j] > 0;
    return {
      id: i.id, kg, price, used,
      atMax: r.atUpper[j] && used, atMin: atLb,
      // prezzo sotto il quale l'ingrediente entrerebbe in formula (se escluso)
      entryPrice: !used && lp.ub[j] > 0 ? price - rcTotal * 1000 : null,
      // valore del limite massimo: € risparmiati per +1 kg di limite (se al massimo)
      maxValue: r.atUpper[j] && used ? -(r.boundDuals[j] || 0) : 0,
      // costo del minimo imposto: €/t per +1 kg di minimo
      minCost: atLb ? r.reducedCosts[j] : 0,
    };
  });
  const co2 = lines.reduce((s, l) => s + (+byId[l.ing].ef || 0) * l.kg / 1000, 0); // kg CO₂e/t
  const coShare = lines.reduce((s, l) => s + (byId[l.ing].coProduct ? l.kg : 0), 0) / BATCH;
  return { status: 'optimal', lines, cost, profile: prof, constraints, ingredients, co2, coShare, objective: r.objective, iterations: r.iterations };
}

function ssWeight(x, ings) { return x.reduce((s, v, j) => s + v * (+ings[j].dm || 0) / 100, 0); }
function dmValue(prof, nut) { return prof[nut] == null || !prof.SS ? null : prof[nut] * 100 / prof.SS; }
function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }

/** Costo €/t (solo materie prime) di una formula esistente. */
export function formulaCost(lines, ingById, overrides) {
  let s = 0;
  for (const l of lines) { const i = ingById[l.ing]; if (i) s += priceOf(i, overrides) * (+l.kg) / 1000; }
  return s;
}
export function formulaCO2(lines, ingById) {
  let s = 0;
  for (const l of lines) { const i = ingById[l.ing]; if (i) s += (+i.ef || 0) * (+l.kg) / 1000; }
  return s;
}
export function coProductShare(lines, ingById) {
  let s = 0, t = 0;
  for (const l of lines) { const i = ingById[l.ing]; if (!i) continue; t += +l.kg; if (i.coProduct) s += +l.kg; }
  return t > 0 ? s / t : 0;
}

/** Verifica una formula esistente rispetto alla specifica: elenco di parametri fuori limite. */
export function checkSpec(lines, ingById, spec) {
  const prof = profile(lines, ingById);
  const out = [];
  for (const k of spec?.constraints || []) {
    const v = k.basis === 'ss' ? dmValue(prof, k.nut) : prof[k.nut];
    if (v == null) { out.push({ nut: k.nut, status: 'missing', value: null, min: k.min, max: k.max, basis: k.basis }); continue; }
    // tolleranza di mezza unità dell'ultima cifra mostrata: lo stato è coerente con il numero che l'utente vede
    // e assorbe l'arrotondamento delle dosi a 0,1 kg/t (es. ossido di magnesio 2,14 → 2,1 kg)
    const tol = 0.5 * 10 ** -(NUT[k.nut]?.dec ?? 2);
    let status = 'ok';
    if (k.min != null && k.min !== '' && v < +k.min - tol) status = 'low';
    if (k.max != null && k.max !== '' && v > +k.max + tol) status = 'high';
    out.push({ nut: k.nut, status, value: v, min: k.min, max: k.max, basis: k.basis || 'tq' });
  }
  for (const r of spec?.ratios || []) {
    const num = prof[r.num], den = prof[r.den];
    const v = den ? num / den : null;
    let status = v == null ? 'missing' : 'ok';
    if (v != null && r.min != null && v < r.min - 0.005) status = 'low';
    if (v != null && r.max != null && v > r.max + 0.005) status = 'high';
    out.push({ ratio: `${r.num}/${r.den}`, status, value: v, min: r.min, max: r.max });
  }
  return { profile: prof, items: out, ok: out.every(x => x.status === 'ok') };
}

/** Intervallo di prezzo in cui la quantità dell'ingrediente resta invariata (ricerca per bisezione). */
export function priceRange(P, ingId, base) {
  const res = base || optimize(P);
  if (res.status !== 'optimal') return null;
  const ing = P.ingredients.find(i => i.id === ingId);
  const kg0 = (res.lines.find(l => l.ing === ingId) || { kg: 0 }).kg;
  const p0 = priceOf(ing, P.options?.priceOverrides);
  const kgAt = price => {
    const r = optimize({ ...P, options: { ...(P.options || {}), priceOverrides: { ...(P.options?.priceOverrides || {}), [ingId]: price } } });
    return r.status === 'optimal' ? (r.lines.find(l => l.ing === ingId) || { kg: 0 }).kg : NaN;
  };
  const same = k => Math.abs(k - kg0) < 0.05; // tolleranza 0,05 kg/t
  const search = (lo, hi, dirUp) => { // lo: prezzo con quantità invariata; hi: prezzo dove cambia
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      if (same(kgAt(mid))) lo = mid; else hi = mid;
      if (Math.abs(hi - lo) < 0.25) break;
    }
    return dirUp ? lo : lo;
  };
  let up = null, down = null;
  const maxP = Math.max(p0 * 4, p0 + 400);
  if (!same(kgAt(maxP))) up = search(p0, maxP, true);
  if (p0 > 0 && !same(kgAt(0))) down = search(p0, 0, false);
  return { price: p0, kg: kg0, up, down };
}

/** Frontiera costo–emissioni: minimo costo con tetto crescente di CO₂e/t. */
export function carbonFrontier(P, points = 8) {
  const base = optimize(P);
  if (base.status !== 'optimal') return [];
  const minCo2 = optimize({ ...P, ingredients: P.ingredients.map(i => ({ ...i, price: +i.ef || 0 })), options: { ...(P.options || {}), priceOverrides: null, carbonPrice: 0 } });
  if (minCo2.status !== 'optimal') return [{ co2: base.co2, cost: base.cost, lines: base.lines }];
  const hi = base.co2, lo = minCo2.co2;
  const out = [];
  for (let k = 0; k < points; k++) {
    const cap = hi - (hi - lo) * k / (points - 1);
    const spec = { ...P.spec, groups: [...(P.spec?.groups || [])] };
    const Pk = { ...P, spec };
    const { lp, ings, meta } = buildLP(Pk);
    lp.A.push(ings.map(i => +i.ef || 0)); lp.b.push(cap * 1000); lp.types.push('<=');
    const r = solveLP(lp);
    if (r.status !== 'optimal') continue;
    const byId = Object.fromEntries(ings.map(i => [i.id, i]));
    const lines = ings.map((i, j) => ({ ing: i.id, kg: r.x[j] })).filter(l => l.kg > 1e-6);
    // costo marginale di abbattimento: € per t di CO₂e evitata (duale del tetto, €/t di mangime per kg CO₂e/t)
    out.push({ cap, co2: formulaCO2(lines, byId), cost: formulaCost(lines, byId, P.options?.priceOverrides), lines, abatement: -r.duals[lp.A.length - 1] * 1000 * 1000 });
  }
  return out;
}

/** Diagnosi dell'inammissibilità: quali vincoli, se rimossi, rendono il problema risolvibile,
 *  e valore massimo/minimo raggiungibile per i nutrienti richiesti. */
export function diagnose(P) {
  const tips = [];
  const cons = P.spec?.constraints || [];
  for (const k of cons) {
    const key = k.nut + (k.basis === 'ss' ? '@ss' : '');
    const r = optimize({ ...P, options: { ...(P.options || {}), drop: { nut: new Set([key]) } } });
    if (r.status === 'optimal') {
      const v = k.basis === 'ss' ? dmValue(r.profile, k.nut) : r.profile[k.nut];
      tips.push({ kind: 'nut', nut: k.nut, basis: k.basis || 'tq', min: k.min, max: k.max, reachable: v, cost: r.cost });
    }
  }
  // estremi raggiungibili per ciascun nutriente richiesto, con i soli limiti di inclusione
  const extremes = {};
  for (const k of cons) {
    const { lp, ings } = buildLP({ ...P, spec: { ...P.spec, constraints: [], ratios: [] }, options: { ...(P.options || {}), contaminant: null } });
    const coef = ings.map(i => val(i, k.nut) / 1000);
    const mx = solveLP({ ...lp, c: coef.map(v => -v) });
    const mn = solveLP({ ...lp, c: coef });
    extremes[k.nut] = { max: mx.status === 'optimal' ? -mx.objective : null, min: mn.status === 'optimal' ? mn.objective : null };
  }
  return { tips, extremes };
}

/** Controllo aflatossina B1 della miscela rispetto al limite di legge della specie. */
export function afb1Check(lines, ingById, species) {
  let s = 0, known = true;
  for (const l of lines) {
    const i = ingById[l.ing];
    if (!i) continue;
    const v = i.contam?.AFB1;
    if (v == null) { if (i.category === 'cereale' || i.category === 'coprodotto' || i.category === 'proteico') known = false; continue; }
    s += +v * (+l.kg) / 1000;
  }
  const cat = SPECIES[species]?.afb1 || 'altri';
  const limit = AFB1_LIMITS[cat];
  return { value: s, limit, ratio: limit ? s / limit : null, complete: known, category: cat };
}
