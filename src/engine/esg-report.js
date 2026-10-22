/* FeedOS 18 · Report e questionari (pacchetto WP4 «report»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function reportSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function reportReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const REPORT_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const REPORT_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function reportDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function reportCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function reportSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const REPORT_METHOD = {
  it: "Metodo in preparazione: i datapoint del VSME vengono raccolti dai pacchetti con la loro qualità (misurato, calcolato, stimato) e congelati alla chiusura dell’esercizio.",
  en: "Method in preparation: VSME datapoints are collected from the packages with their quality (measured, calculated, estimated) and frozen when the reporting period is closed.",
};
