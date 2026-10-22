/* FeedOS 18 · EUDR e fornitori (pacchetto WP3 «filiera»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function filieraSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function filieraReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const FILIERA_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const FILIERA_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function filieraDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function filieraCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function filieraSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const FILIERA_METHOD = {
  it: "Metodo in preparazione: FeedOS organizza i riferimenti EUDR delle materie prime e le verifiche sui fornitori; non deposita dichiarazioni nel sistema TRACES.",
  en: "Method in preparation: FeedOS organises EUDR references for raw materials and supplier checks; it does not file statements in the TRACES system.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Quote della soia (senza deforestazione, con DDS, a rischio) nel periodo (06 WP3). Stub: null. */
export function soyShares(d, P) { return null; }
/** Riferimenti delle dichiarazioni di dovuta diligenza per le consegne indicate. Stub: []. */
export function refsForShipments(d, shipmentIds) { return []; }
