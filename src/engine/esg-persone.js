/* FeedOS 18 · Persone e sicurezza (pacchetto WP5 «persone»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function personeSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function personeReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const PERSONE_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const PERSONE_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function personeDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function personeCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function personeSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const PERSONE_METHOD = {
  it: "Metodo in preparazione: indici di frequenza e gravità sulle ore lavorate, dati personali solo con codici pseudonimi e celle con meno di 5 persone non mostrate.",
  en: "Method in preparation: frequency and severity rates on hours worked, personal data only with pseudonymous codes and cells with fewer than 5 people suppressed.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Organico dell'esercizio (06 WP5). Stub: null. */
export function workforce(d, periodKey) { return null; }
/** Indici di sicurezza del periodo (06 WP5). Stub: null. */
export function safetyRates(d, P) { return null; }
