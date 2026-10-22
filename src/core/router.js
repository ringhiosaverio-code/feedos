/* FeedOS 17 · Navigazione con l'ancora dell'indirizzo: #area.scheda.id~periodo~confronto
 * (lettere, cifre, trattino e trattino basso; l'id conserva i punti: 'nuova.c-12'). Il suffisso dopo «~» è il periodo globale:
 * si aggiorna con history.replaceState, quindi cambiare periodo non ricarica la pagina. */
import { useSyncExternalStore } from 'react';
import { getPeriodSpec, setPeriodSpec, subscribePeriod, serializeSpec, parseSpec } from './period.js';
import { AREA_IDS } from './areaIds.js';

export const AREAS = AREA_IDS;

const curHash = () => (typeof location !== 'undefined' ? location.hash : '');

/** Legge l'ancora: {area, tab, id, period} (period = testo dopo il primo «~», o null). */
export function parseHash(h = curHash()) {
  let raw = String(h || '').replace(/^#\/?/, '');
  try { raw = decodeURIComponent(raw); } catch { /* ancora non codificata bene: si legge com'è */ }
  const [path, ...tokens] = raw.split('~');
  const [area, tab, ...rest] = path.split('.');
  return { area: AREAS.includes(area) ? area : 'oggi', tab: tab || null, id: rest.length ? rest.join('.') : null, period: tokens.length ? tokens.join('~') : null };
}
const routeOf = p => ({ area: p.area, tab: p.tab, id: p.id });
const sameRoute = (a, b) => a.area === b.area && a.tab === b.tab && a.id === b.id;
/** Periodo letto dall'indirizzo: entra nello stato senza riscrivere l'indirizzo. */
function applyPeriod(token) { const s = token == null ? null : parseSpec(token); if (s) setPeriodSpec(s, { silent: true }); }

/** Rimette nell'indirizzo il suffisso del periodo corrente (senza voce nella cronologia, senza hashchange). */
function syncSuffix() {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const path = location.hash.replace(/^#\/?/, '').split('~')[0] || [current.area, current.tab, current.id].filter(Boolean).join('.');
  const s = serializeSpec(getPeriodSpec());
  const h = '#' + path + (s ? '~' + s : '');
  if (h !== location.hash) try { history.replaceState(history.state, '', h); } catch { /* ignora */ }
}

const first = parseHash();
applyPeriod(first.period);
let current = routeOf(first);
const subs = new Set();
function onHash(force) {
  const p = parseHash();
  applyPeriod(p.period);
  const r = routeOf(p);
  const changed = !sameRoute(r, current);
  if (changed) { current = r; for (const f of subs) f(); }
  if (p.period == null) syncSuffix();
  if (changed || force === true) try { window.scrollTo({ top: 0 }); } catch { /* ignora */ }
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => onHash());
subscribePeriod((_, opt) => { if (!opt?.silent) syncSuffix(); });
if (first.period == null) syncSuffix(); // periodo dalle preferenze: visibile anche nell'indirizzo di partenza

export function useRoute() { return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => current, () => current); }

const seg = (x, keepDots) => String(x).replace(keepDots ? /[^A-Za-z0-9_.-]/g : /[^A-Za-z0-9_-]/g, '-');
function build(area, tab, id, withPeriod) {
  const parts = [area, tab].filter(x => x != null && x !== '').map(x => seg(x));
  if (id != null && id !== '') parts.push(seg(id, true));
  const s = withPeriod ? serializeSpec(getPeriodSpec()) : '';
  return '#' + parts.join('.') + (s ? '~' + s : '');
}
/** Va a #area.scheda.id, con il suffisso del periodo quando non è quello di base. */
export function go(area, tab, id) {
  const h = build(area, tab, id, true);
  if (location.hash === h) { onHash(true); return; }
  location.hash = h;
}
/** Ancora per un collegamento <a href>: SENZA suffisso del periodo. Un'ancora disegnata prima di un cambio di periodo
 *  riporterebbe quello vecchio; senza suffisso il router mantiene il periodo corrente (lo rimette con replaceState). */
export function href(area, tab, id) { return build(area, tab, id, false); }
