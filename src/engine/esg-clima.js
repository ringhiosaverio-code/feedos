/* FeedOS 18 · Clima e GHG (pacchetto WP1 «clima»): stub della fondazione 18.
 * Contratto (07-contract §2): le firme e i nomi restano questi; il pacchetto sostituisce i corpi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. */
import { packItems } from './esg-packs.js';
import { PACK_CLIMA } from '../data/pack-clima.js';

/** Segnali di «Oggi» del pacchetto (chiavi con il prefisso del pacchetto). */
export function climaSignals(d, ctx) { return []; }
/** Sezione del report CdA / Rapporto ESG. */
export function climaReportSection(d, ctx, P, C) { return null; }
/** Indicatori del catalogo KPI (id esg-…, area 'esg', src = raccolta con date o month). */
export const CLIMA_KPIS = [];
/** Regole della qualità dei dati (id riservati, area 'esg'). */
export const CLIMA_RULES = [];
/** Datapoint del VSME forniti dal pacchetto. */
export function climaDatapoints(d, P) { return {}; }
/** Scadenze e controlli del calendario degli adempimenti. */
export function climaCalendarItems(d, today) { return []; }
/** Modello di lettura della pagina. */
export function climaSummary(d, P) { return null; }
/** Nota metodologica (italiano e inglese). */
export const CLIMA_METHOD = {
  it: "Metodo in preparazione: l’inventario seguirà la struttura del GHG Protocol e della ISO 14064-1, con confini, esclusioni e fattori dichiarati (fonte e anno).",
  en: "Method in preparation: the inventory will follow the GHG Protocol and ISO 14064-1 structure, with stated boundaries, exclusions and factors (source and year).",
};

/* ---------- funzioni usate da altri pacchetti (contratto §4: firme fisse, stub della fondazione) ---------- */
/** Fattore di emissione: {value, unit, source, year, status, overridden} o null. Stub: ricerca nel pacchetto di contenuti integrato
 * (o in quello importato più recente). Il pacchetto clima aggiunge la precedenza: sostituzione > pacchetto importato > integrato. */
export function factor(d, id, year) {
  const it = packItems(d, 'clima', PACK_CLIMA).find(x => x && x.id === id);
  if (!it || !Number.isFinite(+it.value)) return null;
  return { value: +it.value, unit: it.unit || '', source: it.source || '', year: it.year ?? null, status: it.status || 'da verificare', overridden: false };
}
/** Inventario GHG del periodo (06 WP1). Stub: null. */
export function inventory(d, P) { return null; }
/** Controlli F-gas in scadenza. Stub: []. */
export function fgasDue(d, today) { return []; }
