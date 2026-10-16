/* FeedOS 17 · Fornitori qualificati, punteggio e segnali d'acquisto (pacchetto WP5).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Punteggio dei fornitori nel periodo P (OTIF, qualità, prezzo, documenti). → righe */
export function scorecard(d, ctx, P) { return []; }

/** Segnali degli acquisti (certificati, OTIF, fornitori sospesi, ordini in ritardo, PPV, coperture). → Signal[] */
export function purchasingSignals(d, ctx) { return []; }

/** Sezione «Acquisti» del report CdA, o null. */
export function purchasingReportSection(d, ctx, P, C) { return null; }
