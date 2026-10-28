/* FitoOS · CO₂ dei programmi di difesa consigliati (edizione agrofarmaci).
 * Per un programma (coltura, resa, trattamenti con prodotto, dose e numero di interventi, passaggi della macchina):
 * emissioni dei prodotti dalla culla al cancello (ricetta × fattori delle materie prime + energia della linea + imballo),
 * gasolio dei passaggi, totale per ettaro e per kg di raccolto (o di olio), rame metallo per ettaro.
 * Gli assorbimenti del suolo (inerbimento, potature trinciate) si mostrano a parte e non si sottraggono mai.
 * Fattori indicativi da verificare: nessuna dichiarazione di neutralità o di «impatto zero» si può basare su questo calcolo. */
import { byId, round, sum } from '../core/util.js';
import { copperBudget } from './agro-reg.js';

export const CO2_FACTORS = {
  version: '2026.1 (indicativo)',
  dieselKgL: 3.2,            // kg CO₂e per litro di gasolio agricolo, combustione più filiera del carburante (da verificare)
  pack: { tanica: 0.12, flacone: 0.18, sacco: 0.04, scatola: 0.08 }, // kg CO₂e per kg o L di prodotto, per tipo di imballo (stima)
  soilNote: 'Assorbimenti del suolo stimati e mostrati a parte: non si sottraggono dalle emissioni e non permettono dichiarazioni di neutralità.',
};

const packFactor = p => { const s = String(p?.packaging || '').toLowerCase(); for (const [k, v] of Object.entries(CO2_FACTORS.pack)) if (s.includes(k)) return v; return 0.06; };

/** kg CO₂e per kg (o per L) di prodotto: materie prime della ricetta, energia della linea, imballo. */
export function productFootprint(d, productId) {
  const p = (d.products || []).find(x => x.id === productId);
  if (!p) return null;
  const f = (d.formulas || []).find(x => x.id === p.formulaId);
  const ings = byId(d.ingredients || []);
  let rawT = 0; // kg CO₂e per t di prodotto dalle materie prime (righe della formula in kg per t, fattori in kg CO₂e per t)
  for (const c of f?.lines || []) rawT += (+c.kg || 0) / 1000 * (+ings[c.ing]?.ef || 0);
  const line = (d.lines || []).find(l => l.id === p.lineId) || {};
  const en = d.settings?.energy || {};
  const energyT = (+line.kwhPerT || 0) * (+en.feGrid || 0.25) + (+line.gplKgPerT || 0) * (+en.feGpl || 2.985);
  const perKg = (rawT + energyT) / 1000; // da kg CO₂e per t a per kg
  const dens = p.uom === 'L' ? +p.density || 1 : 1;
  const perUnit = perKg * dens + packFactor(p); // per kg o per L venduto
  return { productId, perUnit: round(perUnit, 3), raw: round(rawT / 1000 * dens, 3), energy: round(energyT / 1000 * dens, 3), pack: packFactor(p), unit: p.uom === 'L' ? 'L' : 'kg' };
}

/** Calcolo di un programma: righe per trattamento e totali per ettaro, per kg di raccolto e, per l'olivo, per kg di olio. */
export function programmeCo2(d, prog) {
  if (!prog) return null;
  const prods = byId(d.products || []);
  const rows = (prog.applications || []).map((a, i) => {
    const p = prods[a.productId], fp = productFootprint(d, a.productId);
    const qty = (+a.dose || 0) * (+a.n || 1);
    return { i, ...a, product: p?.name || a.productId, code: p?.code || '', unit: fp?.unit || 'kg', qty, ef: fp?.perUnit ?? null, co2: fp ? qty * fp.perUnit : 0,
      cost: qty * (+p?.unitPrice || 0), organic: !!p?.organic };
  });
  const products = sum(rows, r => r.co2), fuel = (+prog.passes || 0) * (+prog.fuelLPerPass || 0) * CO2_FACTORS.dieselKgL;
  const total = products + fuel, yieldKg = (+prog.yieldTHa || 0) * 1000;
  const oilKg = prog.oilYieldPct ? yieldKg * prog.oilYieldPct / 100 : null;
  const cu = copperBudget(prog.applications, d);
  return {
    id: prog.id, rows, products, fuel, total, perKg: yieldKg > 0 ? total / yieldKg : null, perKgOil: oilKg ? total / oilKg : null, oilKg, yieldKg,
    copperKgHa: cu, copper7y: round(cu * 7, 2), copperOk: cu <= 4, cost: sum(rows, r => r.cost), passes: +prog.passes || 0,
    soil: prog.soil || null, organicShare: rows.length ? rows.filter(r => r.organic).length / rows.length : null,
  };
}

/** Confronto fra il programma di riferimento e l'alternativa: variazioni assolute e percentuali. */
export function compareProgrammes(a, b) {
  if (!a || !b) return null;
  const dl = (x, y) => (x == null || y == null ? null : { abs: y - x, pct: x ? (y - x) / x : null });
  return { total: dl(a.total, b.total), perKg: dl(a.perKg, b.perKg), perKgOil: dl(a.perKgOil, b.perKgOil), copper: dl(a.copperKgHa, b.copperKgHa), cost: dl(a.cost, b.cost), passes: dl(a.passes, b.passes) };
}

/** Programmi raggruppati per coltura: riferimento e alternative. */
export function programmesByCrop(d) {
  const out = {};
  for (const p of d.cropProgrammes || []) (out[p.crop] ||= []).push(p);
  for (const list of Object.values(out)) list.sort((a, b) => (a.baseline === b.baseline ? (a.name < b.name ? -1 : 1) : a.baseline ? -1 : 1));
  return out;
}
