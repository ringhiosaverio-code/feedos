/* FeedOS 17 · Crediti verso clienti, fidi, DSO e rischio (pacchetto WP2).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Sintesi dei crediti alla data: aperti, scaduti, DSO e dettaglio per cliente. */
export function creditSummary(d, today) { return { open: 0, overdue: 0, overdue30: 0, dso: null, dsoContract: null, byCustomer: {} }; }

/** Segnali di finanza (fidi, scaduto, cassa, eccedenze, scadenze dei lotti). → Signal[] */
export function financeSignals(d, ctx) { return []; }

/** Sezione «Finanza» del report CdA, o null. */
export function financeReportSection(d, ctx, P, C) { return null; }
