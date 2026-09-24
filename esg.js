/* FeedOS 16 · Indicatori ESG alimentati dai dati operativi (registro della tesi, Tabella A.1).
 * Ogni valore dichiara la provenienza: 'auto' (calcolato dai dati dell'app), 'manuale' (inserito), 'tesi'. */
import { ESG_REGISTRY } from '../data/esgRegistry.js';
import { formulaCO2, coProductShare } from './formulation.js';
import { balance, aggregate, scope1PerKg, DEFAULTS } from './energy.js';
import { sum } from '../core/util.js';

/**
 * @param {object} d dati dell'app; @param {{from:string,to:string}} period date ISO incluse
 */
export function computeKpis(d, period, opt = {}) {
  const inP = x => x >= period.from && x <= period.to;
  const runs = d.runs.filter(r => inP(r.date));
  const tonnes = sum(runs, r => r.tonnes);
  const en = aggregate(d.energy.filter(e => inP(e.month + '-15')));
  const factors = { ...DEFAULTS, feGrid: +d.settings?.energy?.feGrid || DEFAULTS.feGrid, feGpl: +d.settings?.energy?.feGpl || DEFAULTS.feGpl };
  const b = balance({ ...en, tonnes }, factors);
  const ingById = Object.fromEntries(d.ingredients.map(i => [i.id, i]));
  const formById = Object.fromEntries(d.formulas.map(f => [f.id, f]));
  const verLines = r => { const f = formById[r.formulaId]; if (!f) return null; const h = (f.history || []).find(x => x.version === r.formulaVersion); return (h || f).lines; };
  let coT = 0, soyAll = 0, soyCert = 0, ingCO2 = 0, rawCost = 0;
  for (const r of runs) {
    const lines = verLines(r); if (!lines) continue;
    coT += r.tonnes * coProductShare(lines, ingById);
    ingCO2 += r.tonnes * formulaCO2(lines, ingById);
    for (const l of lines) {
      const ing = ingById[l.ing];
      if (!ing) continue;
      if (/soia/i.test(ing.name)) { soyAll += r.tonnes * l.kg / 1000; if (ing.certified) soyCert += r.tonnes * l.kg / 1000; }
      rawCost += r.tonnes * l.kg / 1000 * (+ing.price || 0);
    }
  }
  const ships = d.shipments.filter(s => inP(s.date));
  const revenue = sum(ships, s => s.tonnes * s.price);
  const lotsP = d.lots.filter(l => inP(l.date));
  const analyses = sum(lotsP, l => l.analyses?.length || 0) + d.ingLots.filter(l => inP(l.date) && l.analyses).length;
  const compl = d.complaints.filter(c => inP(c.date));
  const nc = compl.filter(c => c.kind === 'prodotto' && c.rootCause !== 'Nessuna non conformità riscontrata').length + (opt.lotNc || 0);
  const assisted = new Set(d.visits.filter(v => inP(v.date) && v.kind === 'tecnica').map(v => v.customerId)).size;
  const ingLotsP = d.ingLots.filter(l => inP(l.date) && l.status !== 'bloccato');
  const purchVal = sum(ingLotsP, l => l.tonnes * (l.price || 0));
  const itVal = sum(ingLotsP.filter(l => ingById[l.ingId]?.origin === 'Italia'), l => l.tonnes * (l.price || 0));
  const m = d.esgManual || {};
  const auto = {
    E1: [b.kwhGrid, 'kWh'], E2: [b.kwhSelf, 'kWh'], E3: [b.coverage != null ? b.coverage * 100 : null, '%'], E4: [b.elecPerT, 'kWh/t'],
    E5: [b.gplKg, 'kg'], E6: [b.co2Gpl, 't CO₂'], E7: [b.co2Grid, 't CO₂'],
    E8: [tonnes ? (ingCO2 + (b.co2Grid + b.scope1) * 1000) / tonnes : null, 'kg CO₂e/t', 'Stima indicativa: fattori di emissione delle materie prime + energia di stabilimento'],
    E12: [tonnes ? coT / tonnes * 100 : null, '% in peso'], E15: [soyAll ? soyCert / soyAll * 100 : null, '%'],
    S8: [analyses, 'n.'], S9: [nc, 'n.'], S10: [compl.length, 'n.'], S11: [assisted, 'n.'],
    C1: [revenue, '€'], C3: [revenue ? rawCost / revenue * 100 : null, '% sui ricavi', 'Costo materie prime ai prezzi correnti sulle quantità prodotte'],
    C10: [purchVal ? itVal / purchVal * 100 : null, '%', 'Quota in valore dei lotti di materie prime di origine italiana'],
  };
  if (m.S1) auto.C8 = [revenue / m.S1, '€/addetto'];
  const out = [];
  for (const k of ESG_REGISTRY) {
    let value = null, unit = k.unit, source = null, note = '';
    if (auto[k.code] && auto[k.code][0] != null && Number.isFinite(auto[k.code][0])) { [value, unit, note = ''] = auto[k.code]; source = 'auto'; }
    else if (m[k.code] != null && m[k.code] !== '') { value = m[k.code]; source = 'manuale'; }
    if (opt.thesis && opt.thesis[k.code] != null) { value = opt.thesis[k.code]; source = 'tesi'; unit = k.unit; }
    out.push({ ...k, value, unitShown: unit, source, note });
  }
  return { kpis: out, energy: b, tonnes, revenue, scope1: b.scope1, scope2: b.scope2, factors, scope1PerKg: scope1PerKg(factors) };
}

/** Copertura del modulo Basic del VSME: requisito coperto se almeno un indicatore collegato è in classe A o B (regola della tesi, §2.8). */
export function vsmeCoverage(kpis, vsme) {
  return vsme.map(r => {
    const linked = kpis.filter(k => k.vsme === r.id);
    const cls = linked.filter(k => k.cls === 'A' || k.cls === 'B');
    const withData = linked.filter(k => k.value != null);
    const covered = r.kind === 'narr' ? null : (r.partial ? 'parziale' : cls.length ? 'coperto' : 'non coperto');
    return { ...r, linked, withData: withData.length, covered };
  });
}
