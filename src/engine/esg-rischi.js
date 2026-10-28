/* FeedOS 18 · Rischi climatici (pacchetto WP8 «rischi»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function rischiSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function rischiReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const RISCHI_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const RISCHI_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function rischiDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function rischiCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function rischiSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const RISCHI_METHOD = {
  it: "Metodo in preparazione: screening qualitativo dei pericoli per sito e orizzonte temporale, con le fonti dei dati pubblici usati.",
  en: "Method in preparation: qualitative hazard screening by site and time horizon, with the public data sources used.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Coordinate dello stabilimento: {lat, lon, source} o null. Stub: settings.company.lat/lon. */
export function plantCoords(d) {
  const c = d?.settings?.company;
  if (!c || c.lat == null || c.lon == null || c.lat === '' || c.lon === '') return null;
  const lat = +c.lat, lon = +c.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, source: 'anagrafica dell’azienda' } : null;
}
