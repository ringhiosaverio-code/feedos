/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function pcfSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function pcfReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const PCF_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const PCF_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function pcfDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function pcfCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function pcfSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const PCF_METHOD = {
  it: "Metodo in preparazione: stima interna dell’impronta dalla culla al cancello secondo la metodologia PEFCR Feed, con versione della banca dati e data.",
  en: "Method in preparation: internal cradle-to-gate footprint estimate following the PEFCR Feed methodology, with database version and date.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Fattore di emissione di una materia prima in kg CO₂e per t. Stub: il valore dell'anagrafica (ing.ef), qualità dei dati 5. */
export function ingredientEf(d, ingId, opts = {}) {
  const ing = (Array.isArray(d?.ingredients) ? d.ingredients : []).find(i => i && i.id === ingId);
  const ef = ing && ing.ef != null && ing.ef !== '' && Number.isFinite(+ing.ef) ? +ing.ef : null;
  return { total: ef, fossil: null, luc: null, landMgmt: null, landM2a: null, dqr: 5, source: 'anagrafica' };
}
/** Impronta di un prodotto (06 WP2). Stub: null. */
export function pcf(d, productId, opts = {}) { return null; }
/** Fattore di un materiale d'imballaggio in kg CO₂e per kg. Stub: null. */
export function packagingFactor(material) { return null; }
