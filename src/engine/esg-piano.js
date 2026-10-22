/* FeedOS 18 · Obiettivi e piano (pacchetto WP7 «piano»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function pianoSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function pianoReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const PIANO_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const PIANO_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function pianoDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function pianoCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function pianoSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const PIANO_METHOD = {
  it: "Metodo in preparazione: obiettivi con anno base, traiettoria di riferimento e avanzamento; le misure si valutano al prezzo interno del carbonio dell’impresa.",
  en: "Method in preparation: targets with base year, reference pathway and progress; measures are assessed at the company’s internal carbon price.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Soglie di base dei criteri ESG (quota fotovoltaica, recupero dei rifiuti, ore di formazione, aumento dell'acqua per tonnellata). */
export const ESG_THRESHOLDS = Object.freeze({ pvShare: 0.40, recovery: 0.50, trainingH: 20, waterDrift: 0.12 });
/** Prezzo interno del carbonio in € per t CO₂e: settings.esg18.piano.carbonPrice, di base 80. */
export function carbonPrice(d) {
  const v = d?.settings?.esg18?.piano?.carbonPrice;
  return v != null && v !== '' && Number.isFinite(+v) && +v > 0 ? +v : 80;
}
/** Soglie dei criteri ESG: valori di base fusi con settings.esg18.piano.targets (solo numeri validi). */
export function esgThresholds(d) {
  const t = d?.settings?.esg18?.piano?.targets;
  const out = { ...ESG_THRESHOLDS };
  if (t && typeof t === 'object') for (const k of Object.keys(out)) if (t[k] != null && t[k] !== '' && Number.isFinite(+t[k])) out[k] = +t[k];
  return out;
}
