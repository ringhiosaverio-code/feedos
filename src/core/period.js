/* FeedOS 17 · Periodo globale: preset, confronto, etichette, scostamenti e stato condiviso.
 * Le funzioni sono pure (usabili nei test in node). Lo stato vive qui, si salva in prefs.period
 * e il router lo riporta nell'indirizzo come suffisso «~ytd~ap». */
import { addDays, daysBetween, addMonths, monthStart, endOfMonth, monthLabel, dateIt, sf, parse, iso, todayLocal, daysInMonth, monthsIn, monthFraction } from './util.js';
import { DEFAULT_PERIOD, getPrefs, setPrefs, subscribePrefs } from './prefs.js';

export { daysInMonth, monthsIn, monthFraction };

export const PRESETS = [
  { id: 'mese', label: 'Mese in corso', short: 'Mese' },
  { id: 'mese-chiuso', label: 'Ultimo mese chiuso', short: 'Mese chiuso' },
  { id: 'trimestre', label: 'Trimestre in corso', short: 'Trimestre' },
  { id: 'ytd', label: 'Da inizio anno', short: 'Anno' },
  { id: '12m', label: 'Ultimi 12 mesi', short: '12 mesi' },
  { id: 'anno-prec', label: 'Anno precedente', short: 'Anno prec.' },
  { id: 'custom', label: 'Date a scelta', short: 'Date' },
];
export const COMPARES = [
  { id: 'prec', label: 'Periodo precedente' },
  { id: 'ap', label: 'Anno precedente' },
  { id: 'budget', label: 'Budget' },
  { id: 'nessuno', label: 'Nessun confronto' },
];
export const DEFAULT_SPEC = DEFAULT_PERIOD;
const PRESET_IDS = new Set(PRESETS.map(p => p.id)), COMPARE_IDS = new Set(COMPARES.map(c => c.id));

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
const p2 = n => String(n).padStart(2, '0');

/** Specifica valida: preset e confronto noti; 'custom' con due date (altrimenti torna al preset di base). */
export function normSpec(s) {
  const o = s && typeof s === 'object' ? s : {};
  const preset = PRESET_IDS.has(o.preset) ? o.preset : DEFAULT_SPEC.preset;
  const compare = COMPARE_IDS.has(o.compare) ? o.compare : DEFAULT_SPEC.compare;
  if (preset !== 'custom') return { preset, from: null, to: null, compare };
  let from = isDate(o.from) ? o.from : null, to = isDate(o.to) ? o.to : null;
  if (!from || !to) return { preset: DEFAULT_SPEC.preset, from: null, to: null, compare };
  if (from > to) [from, to] = [to, from];
  return { preset, from, to, compare };
}
export const sameSpec = (a, b) => a.preset === b.preset && a.compare === b.compare && (a.from ?? null) === (b.from ?? null) && (a.to ?? null) === (b.to ?? null);

/** Periodo fatto di mesi interi (dal primo all'ultimo giorno). */
export const isWholeMonths = (from, to) => String(from).slice(8, 10) === '01' && to === endOfMonth(to);

/** Inizio dell'esercizio che contiene la data (fyStart = mese di inizio, 1 = gennaio). */
function fyStartOf(date, fyStart) {
  const y = +date.slice(0, 4), m = +date.slice(5, 7);
  return `${m >= fyStart ? y : y - 1}-${p2(fyStart)}-01`;
}

/** Etichetta leggibile: «settembre 2026», «gennaio – settembre 2026», «1 – 16 ottobre 2026», «17/10/2025 – 16/10/2026». */
export function periodLabel(P) {
  if (!P?.from || !P?.to) return '—';
  const { from, to } = P, y0 = from.slice(0, 4), y1 = to.slice(0, 4);
  if (from === to) return dateIt(from, 'long');
  if (isWholeMonths(from, to)) {
    const m0 = from.slice(0, 7), m1 = to.slice(0, 7);
    if (m0 === m1) return monthLabel(m0, false);
    if (y0 === y1 && from.slice(5) === '01-01' && to.slice(5) === '12-31') return 'anno ' + y0;
    return y0 === y1 ? `${monthLabel(m0, false).split(' ')[0]} – ${monthLabel(m1, false)}` : `${monthLabel(m0, false)} – ${monthLabel(m1, false)}`;
  }
  if (from.slice(0, 7) === to.slice(0, 7)) return `${+from.slice(8)} – ${dateIt(to, 'long')}`;
  if (y0 === y1) return `${dateIt(from, 'dm')} – ${dateIt(to, 'dm')} ${y1}`;
  return `${dateIt(from)} – ${dateIt(to)}`;
}
/** Etichetta corta per chip e piè di indicatore: «set 26», «ott 25 – set 26», «01/01 – 16/10/26». */
function periodShort(P) {
  const { from, to } = P;
  if (isWholeMonths(from, to)) { const m0 = from.slice(0, 7), m1 = to.slice(0, 7); return m0 === m1 ? monthLabel(m0) : `${monthLabel(m0)} – ${monthLabel(m1)}`; }
  const d = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return from.slice(0, 4) === to.slice(0, 4) ? `${d(from)} – ${d(to)}/${to.slice(2, 4)}` : `${d(from)}/${from.slice(2, 4)} – ${d(to)}/${to.slice(2, 4)}`;
}

/** Periodo risolto da due date: {from, to, days, months, label, short, preset, open, key}. open = arriva a oggi (dati del giorno incompleti). */
export function makePeriod(from, to, { preset = 'custom', today = null } = {}) {
  const P = { from, to, days: daysBetween(from, to) + 1, months: monthsIn(from, to), preset, open: !!today && to >= today, key: from + '_' + to };
  P.label = periodLabel(P); P.short = periodShort(P);
  return P;
}

/**
 * Periodo della specifica alla data di oggi. 12m = oggi − 364 … oggi; ytd e trimestre seguono l'esercizio (fyStart);
 * mese-chiuso = mese solare precedente; anno-prec = esercizio precedente intero.
 */
export function resolvePeriod(spec, today = todayLocal(), { fyStart = 1 } = {}) {
  const s = normSpec(spec);
  const fy = Math.min(12, Math.max(1, Math.round(+fyStart) || 1));
  const ym = today.slice(0, 7);
  let from, to = today;
  switch (s.preset) {
    case 'mese': from = monthStart(today); break;
    case 'mese-chiuso': { const m = addMonths(ym, -1); from = m + '-01'; to = endOfMonth(m); break; }
    case 'trimestre': { const k = ((+ym.slice(5) - fy) % 12 + 12) % 12; from = addMonths(ym, -(k % 3)) + '-01'; break; }
    case 'ytd': from = fyStartOf(today, fy); break;
    case 'anno-prec': { const cur = fyStartOf(today, fy); from = addMonths(cur, -12); to = addDays(cur, -1); break; }
    case 'custom': from = s.from; to = s.to; break;
    default: from = addDays(today, -364);
  }
  return makePeriod(from, to, { preset: s.preset, today });
}

/**
 * Periodo di confronto.
 * 'prec': mesi interi → stesso numero di mesi prima; altrimenti P.days giorni prima.
 * 'ap': mesi interi → gli stessi mesi un anno prima; periodo aperto → stessi giorni (dal primo del mese/anno per mese, trimestre
 *       e da inizio anno, altrimenti fino alla stessa data dell'anno prima, col 29/02 che diventa 28/02); altrimenti date −1 anno.
 * 'budget' → {...P, budget: true}; 'nessuno' → null.
 */
export function comparePeriod(P, mode = 'prec', today = null) {
  if (!P || !mode || mode === 'nessuno') return null;
  if (mode === 'budget') return { ...P, budget: true, compare: 'budget' };
  const whole = isWholeMonths(P.from, P.to);
  let from, to;
  if (mode === 'ap') {
    if (whole) { from = addMonths(P.from, -12); to = endOfMonth(addMonths(P.to.slice(0, 7), -12)); }
    else if (P.open && P.from.slice(8) === '01') { from = addMonths(P.from, -12); to = addDays(from, P.days - 1); }
    else if (P.open) { to = addMonths(P.to, -12); from = addDays(to, -(P.days - 1)); }
    else { from = addMonths(P.from, -12); to = addMonths(P.to, -12); }
  } else {
    if (whole) { const n = monthsIn(P.from, P.to).length; from = addMonths(P.from, -n); to = endOfMonth(addMonths(P.to.slice(0, 7), -n)); }
    else { from = addDays(P.from, -P.days); to = addDays(P.to, -P.days); }
  }
  return { ...makePeriod(from, to, { preset: 'confronto', today }), compare: mode };
}

/**
 * Scostamento tra valore corrente e di confronto.
 * kind 'flow' (somme: ricavi, t…) → in %; kind 'ratio' (€/t, %, giorni…) → in punti o unità, mai in %.
 * good 'up'|'down' dice quale direzione è favorevole. scale moltiplica il valore mostrato (100 per frazioni mostrate in punti).
 * → {abs, pct, good: true|false|null, sign: 1|0|−1, text}
 */
export function deltaInfo(cur, cmp, { kind = 'flow', good: dir = 'up', unit = '', decimals = 1, scale = 1 } = {}) {
  if (cur == null || cmp == null || cur === '' || cmp === '' || !Number.isFinite(+cur) || !Number.isFinite(+cmp)) return { abs: null, pct: null, good: null, sign: 0, text: '—' };
  const abs = +cur - +cmp;
  const pct = kind === 'flow' && Math.abs(+cmp) > 1e-12 ? abs / Math.abs(+cmp) : null;
  let shown, d, text;
  if (pct != null) { shown = pct * 100; d = 1; text = sf(shown, d) + '%'; }
  else {
    shown = abs * scale; d = decimals;
    const u = kind === 'ratio' && (unit === '%' || unit === 'pt') ? 'pt' : unit;
    text = sf(shown, d) + (u ? ' ' + u : '');
  }
  const sign = Math.abs(shown) < 0.5 * 10 ** -d ? 0 : shown > 0 ? 1 : -1;
  const good = !sign || (dir !== 'up' && dir !== 'down') ? null : dir === 'up' ? sign > 0 : sign < 0;
  return { abs, pct, good, sign, text };
}

/** Suffisso dell'indirizzo: '' per il periodo di base, 'ytd~ap', 'c2026-01-01_2026-09-30~prec'. */
export function serializeSpec(spec) {
  const s = normSpec(spec);
  if (sameSpec(s, DEFAULT_SPEC)) return '';
  return (s.preset === 'custom' ? `c${s.from}_${s.to}` : s.preset) + '~' + s.compare;
}
/** Inverso di serializeSpec; null se il testo non è un periodo valido. */
export function parseSpec(token) {
  const t = String(token ?? '').replace(/^~+/, '').trim();
  if (!t) return null;
  const [p, c] = t.split('~');
  const compare = COMPARE_IDS.has(c) ? c : DEFAULT_SPEC.compare;
  const m = /^c(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (m) return isDate(m[1]) && isDate(m[2]) ? normSpec({ preset: 'custom', from: m[1], to: m[2], compare }) : null;
  return PRESET_IDS.has(p) && p !== 'custom' ? normSpec({ preset: p, compare }) : null;
}

// ---------- stato condiviso (indirizzo ↔ preferenze) ----------
let spec = normSpec(getPrefs().period);
let writing = false;
const subs = new Set();
const emit = opt => { for (const f of subs) f(spec, opt); };

export const getPeriodSpec = () => spec;
/** fn(spec, {silent}) a ogni cambio; restituisce la funzione per smettere di ascoltare. */
export function subscribePeriod(fn) { subs.add(fn); return () => subs.delete(fn); }
/**
 * Cambia il periodo (oggetto parziale, completo o funzione) e lo salva in prefs.period.
 * silent: arriva dall'indirizzo, che quindi non va riscritto.
 */
export function setPeriodSpec(next, { silent = false } = {}) {
  const raw = typeof next === 'function' ? next(spec) : next;
  const n = normSpec(raw && raw.preset && raw.preset !== 'custom' ? { compare: spec.compare, ...raw } : { ...spec, ...raw });
  if (sameSpec(n, spec)) return spec;
  spec = n;
  writing = true;
  try { setPrefs({ period: n }); } finally { writing = false; }
  emit({ silent });
  return spec;
}
// preferenze cambiate da fuori (palette, altra scheda): il periodo le segue
subscribePrefs(() => {
  if (writing) return;
  const p = normSpec(getPrefs().period);
  if (!sameSpec(p, spec)) { spec = p; emit({ silent: false }); }
});
