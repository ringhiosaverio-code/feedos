/* FeedOS 18 · Governance ed evidenze (pacchetto WP6 «governance»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function governanceSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function governanceReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const GOVERNANCE_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const GOVERNANCE_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function governanceDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function governanceCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function governanceSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const GOVERNANCE_METHOD = {
  it: "Metodo in preparazione: ogni adempimento riporta la fonte normativa e la data di validità; le evidenze sono registrate con l’impronta SHA-256 del file.",
  en: "Method in preparation: each obligation shows its legal source and validity date; evidence is registered with the SHA-256 fingerprint of the file.",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Verifica di una dichiarazione ambientale (ECGT). Stub: sempre ammessa. */
export function checkClaim(text, ctx = {}) { return { ok: true, findings: [] }; }
/**
 * Evidenze collegate a un record: righe di d.evidence con links: [{type, ref}] (o type/ref diretti) che corrispondono.
 * ref null o assente = tutte le evidenze di quel tipo. Forma provvisoria dei collegamenti: il pacchetto governance la definisce.
 */
export function evidenceFor(d, type, ref) {
  const rows = Array.isArray(d?.evidence) ? d.evidence : [];
  const hit = l => !!l && l.type === type && (ref == null || String(l.ref) === String(ref));
  return rows.filter(e => e && ((Array.isArray(e.links) && e.links.some(hit)) || hit(e)));
}
