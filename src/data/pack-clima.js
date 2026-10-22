/* FeedOS 18 · Pacchetto di contenuti «clima» integrato (fondazione 18, minimo): fattori di emissione con fonte, anno e stato.
 * File senza dipendenze, di proprietà del pacchetto clima, che lo amplia. Un pacchetto importato con versione più recente
 * (settings.esg18.packs.clima) lo sostituisce (src/engine/esg-packs.js). */
export const PACK_CLIMA = {
  pack: 'clima',
  version: '2026.0',
  validAsOf: '2026-10-21',
  items: [
    { id: 'el.lb.it.2024', label: 'Rete elettrica Italia 2024, location-based (consolidato)', value: 0.1926, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 430/2026', year: 2024, status: 'verificato' },
    { id: 'el.lb.it.2025p', label: 'Rete elettrica Italia 2025, location-based (preliminare)', value: 0.1996, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 430/2026', year: 2025, status: 'preliminare' },
    { id: 'gpl.co2', label: 'GPL, CO₂ da combustione', value: 2.985, unit: 'kg CO₂/kg', source: 'IPCC 2006, vol. 2: 63,1 t CO₂/TJ × 47,3 MJ/kg', year: 2006, status: 'verificato' },
    { id: 'gas.co2', label: 'Gas naturale, CO₂ da combustione', value: 1.975, unit: 'kg CO₂/Sm³', source: 'Parametri standard nazionali MASE/ISPRA (valore in uso in FeedOS)', year: 2024, status: 'da verificare' },
    { id: 'gwp.ch4', label: 'GWP a 100 anni del metano', value: 27.9, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato' },
    { id: 'gwp.n2o', label: 'GWP a 100 anni del protossido di azoto', value: 273, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato' },
  ],
};
