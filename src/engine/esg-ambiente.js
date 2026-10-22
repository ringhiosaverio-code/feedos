/* FeedOS 18 · Registri ambientali (pacchetto WP9 «ambiente»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function ambienteSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function ambienteReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const AMBIENTE_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const AMBIENTE_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function ambienteDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function ambienteCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function ambienteSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const AMBIENTE_METHOD = {
  it: "Metodo in preparazione: i registri ambientali partono dai dati già presenti (acqua, rifiuti, energia) e dichiarano la qualità di ogni valore.",
  en: "Method in preparation: environmental registers start from the data already in FeedOS (water, waste, energy) and state the quality of each value.",
};
