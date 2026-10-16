/* FeedOS 17 · Catalogo dei KPI con obiettivi e semafori (pacchetto WP7).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */

/** Catalogo: [{id, label, unit, kind, dir, area, link, compute(d, ctx, P), def}]. */
export const KPIS = [];

/** Valori dei KPI nel periodo P {kpiId: number|null}. */
export function kpiValues(d, ctx, P) { return {}; }

/** Semaforo di un valore rispetto all'obiettivo: 'ok' | 'warn' | 'bad' | null. */
export function statusFor(d, kpiId, value) { return null; }

/** Segnali dei KPI fuori obiettivo. → Signal[] */
export function kpiSignals(d, ctx) { return []; }

/** Sezione «KPI» del report CdA, o null. */
export function kpiReportSection(d, ctx, P, C) { return null; }
