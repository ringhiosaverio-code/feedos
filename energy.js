/* FeedOS 16 · Energia ed emissioni di stabilimento (metodo della tesi, §2.6 e Capitolo 4).
 * Elettricità: location-based, fattore di rete in kg CO₂/kWh. GPL: fattore massico kg CO₂/kg,
 * più CH₄ e N₂O da combustione (IPCC 2006, GWP AR6) per lo Scope 1. */

export const DEFAULTS = {
  feGrid: 0.3769,     // kg CO₂/kWh (Puglia 2023, ISPRA) · fattore della tesi
  feGpl: 3.0115,      // kg CO₂/kg GPL (valore centrale della tesi)
  lhvKwhKg: 13.14,    // contenuto energetico del GPL (PCI) kWh/kg
  pciTJperGg: 47.3,
  ch4KgTJ: 1.0, n2oKgTJ: 0.1, gwpCh4: 27.9, gwpN2o: 273,
};

export function scope1PerKg(f = DEFAULTS) {
  return f.feGpl + f.pciTJperGg * 1e-6 * (f.ch4KgTJ * f.gwpCh4 + f.n2oKgTJ * f.gwpN2o);
}

/** Bilancio di un periodo: record {kwhGrid, kwhPV, kwhExport, gplKg, tonnes}. */
export function balance(r, f = DEFAULTS) {
  const kwhGrid = +r.kwhGrid || 0, pv = +r.kwhPV || 0, exp = +r.kwhExport || 0, gpl = +r.gplKg || 0, t = +r.tonnes || 0;
  const self = Math.max(0, pv - exp);
  const elec = kwhGrid + self;
  const heat = gpl * f.lhvKwhKg;
  const co2Grid = kwhGrid * f.feGrid / 1000;          // t CO₂
  const co2Gpl = gpl * f.feGpl / 1000;                 // t CO₂
  const scope1 = gpl * scope1PerKg(f) / 1000;          // t CO₂e
  return {
    kwhGrid, kwhPV: pv, kwhExport: exp, kwhSelf: self, kwhElec: elec, kwhHeat: heat, kwhTotal: elec + heat, gplKg: gpl, tonnes: t,
    coverage: elec > 0 ? self / elec : null,
    elecPerT: t > 0 ? elec / t : null, heatPerT: t > 0 ? heat / t : null, energyPerT: t > 0 ? (elec + heat) / t : null,
    co2Grid, co2Gpl, co2: co2Grid + co2Gpl, scope1, scope2: co2Grid,
    co2PerT: t > 0 ? (co2Grid + co2Gpl) * 1000 / t : null,   // kg CO₂/t (vettori energetici, come nella tesi)
    gplShare: co2Grid + co2Gpl > 0 ? co2Gpl / (co2Grid + co2Gpl) : null,
  };
}

export function aggregate(records) {
  const s = { kwhGrid: 0, kwhPV: 0, kwhExport: 0, gplKg: 0, tonnes: 0 };
  for (const r of records) for (const k of Object.keys(s)) s[k] += +r[k] || 0;
  return s;
}

/** Modello della tesi: I(s) = [E·(1−s)·FE + m·f] / Q  (kg CO₂/t). */
export function intensityAt(s, { E, Q, m, FE, f }) { return (E * (1 - s) * FE + m * f) / Q; }

/** Producibilità FV mensile (profilo tipico Italia meridionale, quota sul totale annuo). */
export const PV_PROFILE = [0.046, 0.058, 0.083, 0.095, 0.109, 0.113, 0.119, 0.110, 0.089, 0.072, 0.058, 0.048];

/* Fattori di emissione della rete elettrica (location-based, kg CO₂/kWh) da fonti pubbliche ISPRA. */
export const GRID_FACTORS = [
  { id: 'ita23', label: 'Italia 2023', value: 0.2347, src: 'ISPRA, Rapporti 413/2025 (mix nazionale)' },
  { id: 'ita24p', label: 'Italia 2024 (preliminare)', value: 0.1989, src: 'ISPRA, Rapporti 413/2025' },
  { id: 'ita24c', label: 'Italia 2024 (consolidato)', value: 0.1926, src: 'ISPRA, Rapporti 430/2026' },
  { id: 'ita25p', label: 'Italia 2025 (preliminare)', value: 0.1996, src: 'ISPRA, Rapporti 430/2026' },
  { id: 'pug23', label: 'Puglia 2023 (regionale)', value: 0.3769, src: 'ISPRA, Rapporti 413/2025, Tab. 3.2' },
];
