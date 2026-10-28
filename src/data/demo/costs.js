/* FeedOS 17 · Struttura dei costi del mangimificio dimostrativo (dati inventati): centri di costo,
 * costi fissi mensili a consuntivo degli ultimi 24 mesi e quota variabile della trasformazione.
 * Estensore dei dati demo: legge l'archivio senza modificarlo e restituisce una patch {add, update}. */
import { rng, addMonths, round } from '../../core/util.js';

export const COST_CENTERS = [
  { id: 'cc-pers', code: 'CDC-01', name: 'Personale di stabilimento', group: 'stabilimento', cash: true, driver: 'ore' },
  { id: 'cc-man', code: 'CDC-02', name: 'Manutenzione', group: 'stabilimento', cash: true, driver: 'ore' },
  { id: 'cc-qual', code: 'CDC-03', name: 'Qualità e laboratorio', group: 'stabilimento', cash: true, driver: 'lotti' },
  { id: 'cc-log', code: 'CDC-04', name: 'Logistica interna', group: 'stabilimento', cash: true, driver: 'tonnellate' },
  { id: 'cc-amm', code: 'CDC-05', name: 'Ammortamenti', group: 'stabilimento', cash: false, driver: 'ore' },
  { id: 'cc-dir', code: 'CDC-06', name: 'Amministrazione e direzione', group: 'struttura', cash: true, driver: null },
  { id: 'cc-serv', code: 'CDC-07', name: 'Servizi e assicurazioni', group: 'struttura', cash: true, driver: null },
  { id: 'cc-comm', code: 'CDC-08', name: 'Commerciale fisso', group: 'commerciale', cash: true, driver: 'ricavi' },
];

// € all'anno negli ultimi 12 mesi (totale 1,81 M€); i 12 mesi precedenti valgono il 97%
const ANNUAL = { 'cc-pers': 620000, 'cc-man': 170000, 'cc-qual': 90000, 'cc-log': 110000, 'cc-amm': 300000, 'cc-dir': 330000, 'cc-serv': 70000, 'cc-comm': 120000 };
const EXTRA_REPAIR = 28000;          // riparazione straordinaria di febbraio (solo negli ultimi 12 mesi)
const NOISY = ['cc-man', 'cc-serv']; // ±3% di variazione mensile, a somma nulla sull'anno

/** Pesi mensili di un centro: il personale ha 14 mensilità (doppie a giugno e dicembre), gli altri 12 uguali. */
const weights = (cc, months) => months.map(m => (cc === 'cc-pers' && /-(06|12)$/.test(m) ? 2 : 1));

/**
 * @param d archivio demo (sola lettura) · @param {{today, R}} today = ancora del demo, R = rng dell'estensore
 * @returns {{add: {costCenters, fixedCosts}, update: {products: [{id, varProcessCost}]}}}
 */
export function demoCosts(d, opts = {}) { return costsDemo(d, opts, FEED_COSTS); }
/* Struttura dei costi dello stabilimento: centri, costi annui, riparazione straordinaria. L'edizione agrofarmaci passa la sua. */
export const FEED_COSTS = { centers: COST_CENTERS, annual: ANNUAL, extraRepair: EXTRA_REPAIR, repairCenter: 'cc-man', repairNote: 'Comprende la riparazione straordinaria della pressa (28.000 €)', noisy: NOISY, varShare: 0.32 };
/** Estensore dei costi con la configurazione dello stabilimento (cfg, vedi FEED_COSTS). */
export function costsDemo(d, { today, R = rng(16 + 101) } = {}, cfg = FEED_COSTS) {
  const last = addMonths(String(today).slice(0, 7), -1);
  const recent = Array.from({ length: 12 }, (_, k) => addMonths(last, k - 11));    // ultimi 12 mesi chiusi
  const earlier = recent.map(m => addMonths(m, -12));                             // i 12 precedenti
  const fixedCosts = [];
  for (const [months, k, isRecent] of [[earlier, 0.97, false], [recent, 1, true]]) {
    for (const cc of cfg.centers) {
      const target = Math.round(cfg.annual[cc.id] * k);
      const extra = isRecent && cc.id === cfg.repairCenter ? cfg.extraRepair : 0;
      const w = weights(cc.id, months), W = w.reduce((s, x) => s + x, 0);
      let noise = months.map(() => (cfg.noisy.includes(cc.id) ? R.range(-0.03, 0.03) : 0));
      const mean = noise.reduce((s, x) => s + x, 0) / noise.length;
      noise = noise.map(x => x - mean);
      const amounts = months.map((m, i) => Math.round((target - extra) * w[i] / W * (1 + noise[i]) + (extra && /-02$/.test(m) ? extra : 0)));
      amounts[amounts.length - 1] += target - amounts.reduce((s, x) => s + x, 0); // il totale dell'anno torna esatto
      months.forEach((m, i) => fixedCosts.push({
        id: `fc-${m}-${cc.id.slice(3)}`, month: m, centerId: cc.id, kind: 'consuntivo', amount: amounts[i], source: 'demo',
        note: extra && /-02$/.test(m) ? cfg.repairNote : '',
      }));
    }
  }
  fixedCosts.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return {
    add: { costCenters: cfg.centers.map(c => ({ ...c })), fixedCosts },
    update: { products: (d.products || []).map(p => ({ id: p.id, varProcessCost: round((+p.processCost || 0) * cfg.varShare) })) },
  };
}
