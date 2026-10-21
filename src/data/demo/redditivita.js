/* FeedOS 17 · Estensore del demo: coordinate dello stabilimento e modello logistico (pacchetto WP3).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Dati inventati: lo stabilimento di fantasia «Valle Verde» sta nel territorio dei clienti dimostrativi (valle del Crati);
 * logistica a distanza (per consegna + km andata e ritorno), obiettivo di margine netto e soglie di concentrazione.
 * Nessun numero casuale: R non serve, il risultato è identico a ogni generazione. */
export function demoRedditivita(d, { today, R } = {}) {
  return {
    settings: {
      company: { lat: 39.45, lon: 16.25 },
      logistics: { mode: 'distanza', perDrop: 35, perKm: 1.8, roadFactor: 1.3 },
      profit: { targetNetT: 20 },
      concentration: { hhiWarn: 1500, hhiBad: 2500, top1: 0.10, top10: 0.5, agentShare: 0.30, lossRate: 0.3 },
    },
  };
}
