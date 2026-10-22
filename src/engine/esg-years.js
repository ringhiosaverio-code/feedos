/* FeedOS 18 · Esercizi ESG (fondazione 18): periodi di rendicontazione, esercizio corrente e precedente, serie storiche,
 * impostazioni dei pacchetti in settings.esg18.<pkg>.
 * Modalità (settings.esg18.report.periodMode): 'anno' = esercizio che inizia nel mese fyStartMonth; '12m-chiusi' = gli ultimi
 * 12 mesi solari chiusi prima di oggi (demo al 21/10/2026 → 01/10/2025 – 30/09/2026). Senza scelta: '12m-chiusi' finché i dati
 * coprono meno di 24 mesi, poi 'anno'. L'elenco dei periodi va indietro finché ci sono dati (registri o storico dichiarato),
 * da 1 a 5 periodi, il più recente per primo.
 * Forma di un periodo ESG (compatibile con il periodo globale P): { key, from, to, days, months, label, short, mode },
 * key = '12m-2026-09' oppure 'anno-2025' (anno di inizio dell'esercizio). Funzioni pure: nessun orologio, nessuna eccezione. */
import { addMonths, endOfMonth, daysBetween, monthsIn, monthLabel, todayLocal } from '../core/util.js';

/** Raccolte che dicono «qui ci sono dati» per un periodo (con date o month). */
export const ESG_DATA_COLLS = ['runs', 'shipments', 'energy', 'water', 'waste', 'ingLots'];
export const MAX_PERIODS = 5;
export const PERIOD_MODES = ['12m-chiusi', 'anno'];

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const p2 = n => String(n).padStart(2, '0');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Oggi per l'archivio: l'ancora del demo, altrimenti il giorno locale (come core/derived.appToday, senza dipendenze). */
export function esgToday(d) {
  return d?.settings?.dataset === 'demo' && d?.settings?.demoAnchor ? d.settings.demoAnchor : todayLocal();
}

/** Fusione profonda di oggetti semplici (gli elenchi si sostituiscono). Non modifica gli argomenti. */
export function deepMerge(base, patch) {
  if (!isObj(patch)) return isObj(base) ? { ...base } : patch === undefined ? base : patch;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

/** Impostazioni di un pacchetto: valori di base fusi (in profondità) con settings.esg18[pkg]. */
export function esgSettings(d, pkg, defaults = {}) {
  const cur = d?.settings?.esg18?.[pkg];
  return deepMerge(isObj(defaults) ? defaults : {}, isObj(cur) ? cur : {});
}

/**
 * Operazione per store.batch che aggiorna settings.esg18[pkg] senza toccare il resto:
 * oggetto → fuso in profondità con il valore attuale; funzione (attuale) → il valore restituito sostituisce settings.esg18[pkg].
 */
export function esgSettingsOp(pkg, patchOrFn) {
  return {
    kind: 'settings',
    value: st => {
      const all = isObj(st?.esg18) ? st.esg18 : {};
      const cur = isObj(all[pkg]) ? all[pkg] : {};
      const next = typeof patchOrFn === 'function' ? patchOrFn(cur) : deepMerge(cur, patchOrFn);
      return { ...st, esg18: { ...all, [pkg]: isObj(next) ? next : {} } };
    },
  };
}

/** Mese di inizio dell'esercizio ESG: settings.esg18.report.fyStartMonth, poi quello finanziario, poi gennaio. */
export function fyStartMonth(d) {
  const r = d?.settings?.esg18?.report;
  const v = Math.round(+(r?.fyStartMonth ?? d?.settings?.finance?.fiscalYearStartMonth ?? 1));
  return v >= 1 && v <= 12 ? v : 1;
}

/** Primo e ultimo giorno con dati nei registri operativi ({first, last} o null se l'archivio è vuoto). */
export function dataRange(d) {
  let first = null, last = null;
  for (const c of ESG_DATA_COLLS) {
    const rows = d?.[c];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const x = typeof r?.date === 'string' ? r.date.slice(0, 10) : typeof r?.month === 'string' ? r.month.slice(0, 7) + '-01' : null;
      if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x)) continue;
      if (!first || x < first) first = x;
      if (!last || x > last) last = x;
    }
  }
  return first ? { first, last } : null;
}

/** Modalità dei periodi: scelta in settings.esg18.report.periodMode, altrimenti secondo i mesi di dati (< 24 → 12 mesi chiusi). */
export function periodMode(d) {
  const m = d?.settings?.esg18?.report?.periodMode;
  if (PERIOD_MODES.includes(m)) return m;
  const r = dataRange(d);
  if (!r) return '12m-chiusi';
  const lastClosed = addMonths(esgToday(d).slice(0, 7), -1);
  const n = monthsIn(r.first.slice(0, 7), lastClosed).length;
  return n < 24 ? '12m-chiusi' : 'anno';
}

const monthName = ym => `${MESI[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

/** Periodo ESG da date (mesi interi). */
function build(from, to, mode, fy) {
  const fromM = from.slice(0, 7), toM = to.slice(0, 7);
  let key, label, short;
  if (mode === 'anno') {
    const y = +fromM.slice(0, 4);
    key = `anno-${y}`;
    label = fy === 1 ? `anno ${y}` : `esercizio ${y}/${String(y + 1).slice(2)} (${monthName(fromM)} – ${monthName(toM)})`;
    short = fy === 1 ? String(y) : `${y}/${String(y + 1).slice(2)}`;
  } else {
    key = `12m-${toM}`;
    label = `12 mesi a ${monthName(toM)}`;
    short = `${monthLabel(fromM)} – ${monthLabel(toM)}`;
  }
  return { key, from, to, days: daysBetween(from, to) + 1, months: monthsIn(from, to), label, short, mode };
}

/** Periodo di una chiave ('12m-2026-09', 'anno-2025'); null se la chiave non è valida. */
export function periodByKey(d, key) {
  const k = typeof key === 'string' ? key : key?.key;
  if (typeof k !== 'string') return null;
  let m = k.match(/^12m-(\d{4})-(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    const toM = `${m[1]}-${m[2]}`;
    return build(addMonths(toM, -11) + '-01', endOfMonth(toM), '12m-chiusi', 1);
  }
  m = k.match(/^anno-(\d{4})$/);
  if (m) {
    const fy = fyStartMonth(d);
    const fromM = `${m[1]}-${p2(fy)}`;
    return build(fromM + '-01', endOfMonth(addMonths(fromM, 11)), 'anno', fy);
  }
  return null;
}

/** Periodo precedente della stessa lunghezza (12 mesi prima); null se la chiave non è valida. */
export function previousPeriod(d, key) {
  const k = typeof key === 'string' ? key : key?.key;
  if (typeof k !== 'string') return null;
  let m = k.match(/^12m-(\d{4})-(\d{2})$/);
  if (m) return periodByKey(d, `12m-${addMonths(`${m[1]}-${m[2]}`, -12)}`);
  m = k.match(/^anno-(\d{4})$/);
  if (m) return periodByKey(d, `anno-${+m[1] - 1}`);
  return null;
}

/** Esercizio corrente: gli ultimi 12 mesi chiusi, oppure l'ultimo esercizio annuale già chiuso. */
export function currentPeriod(d) {
  const lastClosed = addMonths(esgToday(d).slice(0, 7), -1);
  if (periodMode(d) !== 'anno') return periodByKey(d, `12m-${lastClosed}`);
  const fy = fyStartMonth(d);
  const y = +lastClosed.slice(0, 4), mo = +lastClosed.slice(5, 7);
  let start = mo >= fy ? y : y - 1;                       // esercizio che contiene l'ultimo mese chiuso
  const endM = addMonths(`${start}-${p2(fy)}`, 11);
  if (endM > lastClosed) start -= 1;                      // non ancora finito: si rendiconta il precedente
  return periodByKey(d, `anno-${start}`);
}

/** Una riga dello storico (esgHistory) o di una chiusura riguarda il periodo P? id = chiave del periodo oppure anno (AAAA). */
export function rowMatches(id, P) {
  if (id == null || !P) return false;
  const s = String(id);
  if (s === P.key) return true;
  if (/^\d{4}$/.test(s)) return P.key === `anno-${s}` || (P.mode !== 'anno' && P.to.slice(0, 4) === s);
  return false;
}
const historyRow = (d, P) => (Array.isArray(d?.esgHistory) ? d.esgHistory.find(r => rowMatches(r?.id, P)) : null) || null;
const closingRow = (d, P) => (Array.isArray(d?.esgClosings) ? d.esgClosings.find(r => r?.id === P.key) : null) || null;

/** Ci sono dati per il periodo? Registri che lo toccano, storico dichiarato o chiusura salvata. */
export function periodHasData(d, P, range = dataRange(d)) {
  if (!P) return false;
  if (range && P.to >= range.first && P.from <= range.last) return true;
  return !!(historyRow(d, P) || closingRow(d, P));
}

/** Periodi di rendicontazione, dal più recente: almeno 1, al massimo 5, finché ci sono dati. */
export function reportingPeriods(d) {
  const cur = currentPeriod(d);
  const out = [cur];
  const range = dataRange(d);
  let p = cur;
  while (out.length < MAX_PERIODS) {
    p = previousPeriod(d, p.key);
    if (!p || !periodHasData(d, p, range)) break;
    out.push(p);
  }
  return out;
}

/* Campi dello storico dichiarato (esgHistory) che corrispondono a un datapoint del VS con la stessa unità. */
export const HISTORY_ALIASES = { 'B3.s1': 's1', 'B3.s2-lb': 's2lb', 'B3.s2-mb': 's2mb', 'B3.mwh': 'mwh', 'B3.mwh-ren-el': 'mwhRen', 'B6.withdrawal': 'waterM3', 'B9.fatalities': 'fatalities' };
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);

/**
 * Serie storica di una misura sui periodi di rendicontazione, dal più vecchio: [{key, label, short, from, to, value, source}].
 * metric: campo di esgHistory (s1, tonnes, waterM3…), id di datapoint ('B3.s1') o di KPI. Precedenza per ogni periodo:
 * chiusura approvata (valori congelati: datapoints[metric].value o kpis[metric]) → storico dichiarato → valore calcolato
 * da opts.live(P) → altra chiusura salvata (bozza o in revisione). source: 'chiusura' | 'storico dichiarato' | 'calcolato' | null.
 * opts.periods sostituisce l'elenco dei periodi. Non si interrompe mai: un errore di live vale null.
 */
export function historySeries(d, metric, opts = {}) {
  const periods = Array.isArray(opts.periods) && opts.periods.length ? opts.periods : reportingPeriods(d);
  const live = typeof opts.live === 'function' ? opts.live : null;
  const alias = HISTORY_ALIASES[metric];
  const frozen = c => {
    if (!c) return null;
    const dp = isObj(c.datapoints) ? c.datapoints[metric] : null;
    const v = isObj(dp) ? num(dp.value) : num(dp);
    return v != null ? v : isObj(c.kpis) ? num(c.kpis[metric]) : null;
  };
  const rows = [];
  for (const P of [...periods].reverse()) {
    const c = closingRow(d, P), h = historyRow(d, P);
    let value = null, source = null;
    const fc = frozen(c);
    if (c && c.status === 'approvato' && fc != null) { value = fc; source = 'chiusura'; }
    if (value == null && h) { const v = num(h[metric] ?? (alias ? h[alias] : undefined)); if (v != null) { value = v; source = 'storico dichiarato'; } }
    if (value == null && live) { let v = null; try { v = num(live(P)); } catch { v = null; } if (v != null) { value = v; source = 'calcolato'; } }
    if (value == null && fc != null) { value = fc; source = 'chiusura'; }
    rows.push({ key: P.key, label: P.label, short: P.short, from: P.from, to: P.to, value, source });
  }
  return rows;
}
