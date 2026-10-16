/* FeedOS 16 · Navigazione con l'ancora dell'indirizzo: #area.scheda.id (solo lettere, cifre, punto e trattino). */
import { useSyncExternalStore } from 'react';

export const AREAS = ['oggi', 'gemello', 'formulazione', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia', 'esg', 'dati'];

export function parseHash(h = location.hash) {
  const raw = decodeURIComponent(String(h || '').replace(/^#\/?/, ''));
  const [area, tab, ...rest] = raw.split('.');
  return { area: AREAS.includes(area) ? area : 'oggi', tab: tab || null, id: rest.length ? rest.join('.') : null };
}
let current = parseHash();
const subs = new Set();
function onHash() { current = parseHash(); for (const f of subs) f(); try { window.scrollTo({ top: 0 }); } catch { /* ignora */ } }
if (typeof window !== 'undefined') window.addEventListener('hashchange', onHash);

export function useRoute() { return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => current, () => current); }
export function go(area, tab, id) {
  const h = '#' + [area, tab, id].filter(x => x != null && x !== '').map(x => String(x).replace(/[^A-Za-z0-9_~-]/g, '-')).join('.');
  if (location.hash === h) { onHash(); return; }
  location.hash = h;
}
export function href(area, tab, id) { return '#' + [area, tab, id].filter(Boolean).join('.'); }
