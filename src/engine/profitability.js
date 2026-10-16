/* FeedOS 17 · Redditività netta per cliente, prodotto e agente con costo di servizio (pacchetto WP3).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Redditività per cliente nel periodo P: righe, curva della balena, concentrazione (HHI, quote, N80). */
export function customerProfit(d, ctx, P) {
  return { rows: [], totals: null, whale: { points: [], peakPct: null }, hhi: null, top1: null, top5: null, top10: null, n80: null, peakPct: null };
}

/** Classi ABC dei clienti {custId: {abcRev, abcNet}}. */
export function abcCustomers(d, ctx, P) { return {}; }

/** Segnali di redditività (clienti in perdita, abbandono, concentrazione). → Signal[] */
export function profitSignals(d, ctx) { return []; }

/** Sezione «Redditività» del report CdA, o null. */
export function profitReportSection(d, ctx, P, C) { return null; }
