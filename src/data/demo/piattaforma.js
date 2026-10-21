/* FeedOS 17 · Estensore del demo: obiettivi dei KPI e storico della qualità dei dati (pacchetto WP7).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Obiettivi di settore per un mangimificio di medie dimensioni; nessuna anomalia è inserita nei dati. */
const TARGETS = {
  oee: { target: 0.75, warn: 0.65 },
  'utilizzo-linee': { target: 0.85, warn: 0.75 },
  'kwh-t': { target: 22, warn: 24 },
  'scarto-pct': { target: 0.005, warn: 0.008 },
  'reclami-1000t': { target: 1.0, warn: 1.5 },
  dso: { target: 75, warn: 85 },
  'scaduto-pct': { target: 0.1, warn: 0.15 },
  otif: { target: 0.92, warn: 0.85 },
  dio: { target: 25, warn: 32 },
  'calo-effettivo': { target: 0.005, warn: 0.008 },
  'mdc-t': { target: 50, warn: 45 },
  'quota-mp': { target: 0.67, warn: 0.7 },
  hhi: { target: 1500, warn: 2500 },
  'top10-pct': { target: 0.5, warn: 0.6 },
  'successo-offerte-valore': { target: 0.6, warn: 0.5 },
  'ebitda-pct': { target: 0.05, warn: 0.03 },
  'margine-pieno-t': { target: 15, warn: 8 },
  'ppv-pct': { target: 0.02, warn: 0.05 },
  'copertura-mp-gg': { min: 10, max: 30, warn: 5 },
};

export function demoPiattaforma(d, { today } = {}) {
  if (!today) return {};
  const cur = d.settings?.targets || {};
  const targets = Object.fromEntries(Object.entries(TARGETS).filter(([k]) => !(k in cur)));
  return { settings: { targets, dq: { history: [] } } };
}
