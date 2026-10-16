/* FeedOS 17 · Listini, realizzazione del prezzo, offerte e segnali commerciali (pacchetto WP4).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Stato di un'offerta alla data (il pacchetto aggiunge 'scaduta'). */
export function offerState(o, today) { return o.status; }

/** Segnali commerciali (offerte in scadenza o scadute, sconti oltre l'autorizzato, visite, listino necessario). → Signal[] */
export function commercialSignals(d, ctx) { return []; }

/** Sezione «Commerciale» del report CdA, o null. */
export function commercialReportSection(d, ctx, P, C) { return null; }
