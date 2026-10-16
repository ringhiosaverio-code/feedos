/* FeedOS 17 · Qualità dei dati: regole, punteggio e segnali (pacchetto WP7).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Esegue le regole (opts.scope: 'all' | 'closing' | 'import'): {score, byArea, rules}. */
export function runRules(d, ctx, opts = {}) { return { score: null, byArea: {}, rules: [] }; }

/** Segnali della qualità dei dati. → Signal[] */
export function dqSignals(d, ctx) { return []; }

/** Sezione «Qualità dei dati» del report CdA, o null. */
export function dqReportSection(d, ctx, P, C) { return null; }
