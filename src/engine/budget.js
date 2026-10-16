/* FeedOS 17 · Budget, stima di chiusura e segnali di budget (pacchetto WP1).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Segnali del budget (scostamento YTD, stima di chiusura, budget dell'anno successivo, mese da chiudere). → Signal[] */
export function budgetSignals(d, ctx) { return []; }

/** Totali di budget del periodo P (Σ mesi × quota del mese) per la versione indicata; null senza budget. */
export function budgetTotals(d, P, version = 'B') { return null; }
