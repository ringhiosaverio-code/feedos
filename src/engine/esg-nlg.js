/* FeedOS 18 · Testi automatici dei report ESG senza intelligenza artificiale (fondazione 18): numeri con unità, frasi di
 * variazione, elenchi e testi bilingui con interpolazione. Regole fisse e deterministiche, italiano o inglese.
 * fmtNum(v, unità, lingua, decimali?) · deltaPhrase(attuale, precedente, {good, unit, lang, kind}) · listJoin(voci, lingua)
 * · T(chiave, valori, lingua): cerca in I18N, poi l'italiano, poi restituisce la chiave. */
import { I18N } from '../data/esg-i18n.js';

const LOC = { it: 'it-IT', en: 'en-GB' };
const fmtCache = new Map();
function formatter(lang, d) {
  const k = lang + d;
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.NumberFormat(LOC[lang] || LOC.it, { minimumFractionDigits: 0, maximumFractionDigits: d }));
  return fmtCache.get(k);
}
const L = lang => (lang === 'en' ? 'en' : 'it');
const finite = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);

/** Testo di una chiave con interpolazione {nome}; i numeri si formattano nella lingua. Ripiego: italiano, poi la chiave. */
export function T(key, vars = {}, lang = 'it') {
  const e = I18N[key];
  const s = e ? (e[L(lang)] ?? e.it ?? key) : key;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? (typeof vars[k] === 'number' ? fmtNum(vars[k], '', lang) : String(vars[k])) : m));
}

/** Decimali automatici: 0 sopra 100, 1 sopra 10, 2 sopra 1, 3 sotto. */
const autoDec = v => { const a = Math.abs(v); return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3; };

/** Numero con unità nella lingua: 1.234,5 t CO₂e · 12,5% · «n.d.» se manca. decimals facoltativo (altrimenti automatico). */
export function fmtNum(v, unit = '', lang = 'it', decimals) {
  if (!finite(v)) return T('na', {}, lang);
  const x = +v, d = Number.isInteger(decimals) && decimals >= 0 ? decimals : autoDec(x);
  let s = formatter(L(lang), d).format(Math.abs(x) < 0.5 * 10 ** -d ? 0 : x);
  if (s === '-0') s = '0';
  if (!unit) return s;
  return unit === '%' ? s + '%' : `${s} ${unit}`;
}

/**
 * Frase di variazione rispetto al periodo precedente, con giudizio:
 * «in calo del 4,2% (da 812 a 778 t CO₂e), un miglioramento» / «down 4.2% (from 812 to 778 t CO₂e), an improvement».
 * good: 'up' | 'down' (direzione favorevole; altro = nessun giudizio). Con unit '%' o kind 'ratio' la variazione è in punti
 * (o nell'unità), non in percentuale. Valori mancanti → «non confrontabile con il periodo precedente».
 */
export function deltaPhrase(cur, prev, { good = null, unit = '', lang = 'it', kind = null } = {}) {
  if (!finite(cur) || !finite(prev)) return T('nlg.notComparable', {}, lang);
  const c = +cur, p = +prev, diff = c - p;
  const ratio = kind === 'ratio' || unit === '%';
  // «da 812 a 778 t CO₂e»: l'unità una volta sola (le percentuali la ripetono: «da 40% a 42,1%»)
  const fromTo = T('nlg.fromTo', { prev: fmtNum(p, unit === '%' ? '%' : '', lang), cur: fmtNum(c, unit, lang) }, lang);
  const stable = ratio ? Math.abs(diff) < Math.max(1e-9, Math.abs(p) * 0.005) : p !== 0 ? Math.abs(diff / p) < 0.005 : Math.abs(diff) < 1e-9;
  if (stable) return `${T('nlg.stable', {}, lang)} (${fromTo})`;
  const up = diff > 0;
  let head;
  if (ratio) {
    const n = Math.abs(diff);
    const amount = unit === '%' ? T(fmtNum(n, '', lang) === '1' ? 'nlg.point' : 'nlg.points', { n: fmtNum(n, '', lang) }, lang) : fmtNum(n, unit, lang);
    head = T(up ? 'nlg.upAbs' : 'nlg.downAbs', { abs: amount }, lang);
  } else if (p !== 0) head = T(up ? 'nlg.up' : 'nlg.down', { pct: fmtNum(Math.abs(diff / p) * 100, '%', lang, 1) }, lang);
  else head = T(up ? 'nlg.upAbs' : 'nlg.downAbs', { abs: fmtNum(Math.abs(diff), unit, lang) }, lang);
  const judge = good === 'up' || good === 'down' ? T((good === 'up') === up ? 'nlg.better' : 'nlg.worse', {}, lang) : '';
  return `${head} (${fromTo})${judge ? ', ' + judge : ''}`;
}

/** Elenco in prosa: «a, b e c» / «a, b and c». Voci vuote ignorate. */
export function listJoin(xs, lang = 'it') {
  const a = (Array.isArray(xs) ? xs : []).filter(x => x != null && x !== '').map(String);
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} ${T('and', {}, lang)} ${a[a.length - 1]}`;
}
