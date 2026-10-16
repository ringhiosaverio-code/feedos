/* FeedOS 16 · utilità: numeri e date all'italiana, generatore casuale riproducibile, identificativi. */

// ---------- numeri ----------
const nfCache = new Map();
function nfmt(d, opt = {}) {
  const k = d + JSON.stringify(opt);
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, ...opt }));
  return nfCache.get(k);
}
/** Numero formattato in italiano (1.234,5). Restituisce '—' per valori mancanti. */
export function nf(v, d = 0, opt) {
  if (v == null || v === '' || !Number.isFinite(+v)) return '—';
  const x = +v;
  return nfmt(d, opt).format(Math.abs(x) < 0.5 * 10 ** -d ? 0 : x);
}
/** Numero con segno esplicito (+1,2 / −0,4). */
export function sf(v, d = 0) {
  if (v == null || !Number.isFinite(+v)) return '—';
  const s = nf(Math.abs(v), d);
  return (v > 0 && s !== nf(0, d) ? '+' : v < 0 && s !== nf(0, d) ? '−' : '') + s;
}
export function pct(v, d = 1) { return v == null || !Number.isFinite(+v) ? '—' : nf(v * 100, d) + '%'; }
export function eur(v, d = 0) { return v == null || !Number.isFinite(+v) ? '—' : nf(v, d) + ' €'; }
/** Numero compatto: 1.284 · 12,9 mila · 4,2 mln */
export function compact(v, d = 1) {
  if (v == null || !Number.isFinite(+v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return nf(v / 1e6, d) + ' mln';
  if (a >= 1e4) return nf(v / 1e3, d) + ' mila';
  return nf(v, a < 10 ? 1 : 0);
}
export function round(v, d = 0) { const f = 10 ** d; return Math.round(v * f) / f; }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function sum(a, f = x => x) { let s = 0; for (const x of a) s += +f(x) || 0; return s; }
export function mean(a) { return a.length ? sum(a) / a.length : null; }
export function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function quantile(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export function stdev(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(sum(a, x => (x - m) ** 2) / (a.length - 1)); }
export function groupBy(a, f) { const m = new Map(); for (const x of a) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
export function byId(a) { const o = Object.create(null); for (const x of a) o[x.id] = x; return o; }

// ---------- date ----------
export const DAY = 86400000;
export function iso(d) { const x = d instanceof Date ? d : new Date(d); return x.toISOString().slice(0, 10); }
export function parse(s) { if (s instanceof Date) return s; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function addDays(s, n) { return iso(new Date(parse(s).getTime() + n * DAY)); }
export function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
export function mondayOf(s) { const d = parse(s); const wd = (d.getUTCDay() + 6) % 7; return iso(new Date(d.getTime() - wd * DAY)); }
export function monthOf(s) { return String(s).slice(0, 7); }
export function dayOfYear(s) { const d = parse(s); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1; }
export function isoWeek(s) {
  const d = parse(s); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - first) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export function dateIt(s, style = 'short') {
  if (!s) return '—';
  const d = parse(s);
  const dd = d.getUTCDate(), m = d.getUTCMonth(), y = d.getUTCFullYear();
  if (style === 'long') return `${dd} ${MESI[m]} ${y}`;
  if (style === 'day') return `${GIORNI[d.getUTCDay()]} ${dd} ${MESI[m]}`;
  if (style === 'dm') return `${dd} ${MESI3[m]}`;
  if (style === 'month') return `${MESI[m]} ${y}`;
  if (style === 'mon') return `${MESI3[m]} ${String(y).slice(2)}`;
  return `${String(dd).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
}
export function monthLabel(ym, short = true) { const [y, m] = ym.split('-').map(Number); return short ? `${MESI3[m - 1]} ${String(y).slice(2)}` : `${MESI[m - 1]} ${y}`; }
export function relDays(s, today) {
  const n = daysBetween(today, s);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}

// ---------- casuale riproducibile ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const r = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    normal: (m = 0, s = 1) => { let u = 0, v = 0; while (u === 0) u = next(); while (v === 0) v = next(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    logn: (med, sigma) => med * Math.exp(sigma * r.normal()),
    shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted: (items, w) => { const t = sum(w); let x = next() * t; for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; },
  };
  return r;
}

// ---------- identificativi ----------
let idc = 0;
export function uid(prefix = 'x') { idc = (idc + 1) % 1e6; return prefix + '-' + Date.now().toString(36) + '-' + idc.toString(36) + Math.random().toString(36).slice(2, 5); }
export function slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
export function norm(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
