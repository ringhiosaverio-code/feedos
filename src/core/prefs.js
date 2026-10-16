/* FeedOS 17 · preferenze d'interfaccia di questo browser (tema, dimensione, vista, periodo…).
 * Stanno fuori dall'archivio: non entrano in annulla/ripeti né nei backup e non ricalcolano i dati derivati. */
import { useSyncExternalStore, useCallback, useRef } from 'react';

const KEY = 'feedos16.prefs';
const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

/** Periodo di partenza (core/period.js lo riesporta come DEFAULT_SPEC). */
export const DEFAULT_PERIOD = deepFreeze({ preset: '12m', from: null, to: null, compare: 'prec' });
export const PREF_DEFAULTS = deepFreeze({
  theme: 'auto', size: 'normale', role: 'direzione', agentId: null, period: DEFAULT_PERIOD,
  lastSeenAt: null, lastBackupAt: null, tableViews: {},
});

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
function read() { try { const s = globalThis.localStorage?.getItem(KEY); const j = s ? JSON.parse(s) : {}; return isObj(j) ? j : {}; } catch { return {}; } }
function write() { try { globalThis.localStorage?.setItem(KEY, JSON.stringify(stored)); } catch { /* resta in memoria */ } }

let stored = read();                          // solo le chiavi scelte dall'utente
let prefs = { ...PREF_DEFAULTS, ...stored };  // con i valori di base
const listeners = new Set();
function emit() { for (const l of listeners) l(); }

export const getPrefs = () => prefs;
export function subscribePrefs(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Aggiorna le preferenze: oggetto parziale oppure funzione (prefs) → oggetto parziale. */
export function setPrefs(patch) {
  const p = typeof patch === 'function' ? patch(prefs) : patch;
  if (!isObj(p) || Object.keys(p).every(k => stored[k] === p[k])) return prefs;
  stored = { ...stored, ...p };
  prefs = { ...PREF_DEFAULTS, ...stored };
  write(); emit();
  return prefs;
}

/** Semina solo le preferenze non ancora scelte (es. tema e vista migrati da un archivio dello schema 16). */
export function seedPrefs(seed) {
  const miss = Object.fromEntries(Object.entries(seed || {}).filter(([k, v]) => v != null && stored[k] === undefined));
  return Object.keys(miss).length ? setPrefs(miss) : prefs;
}

/** Hook: il selettore deve restituire riferimenti stabili (p => p.role, p => p.period…). */
export function usePrefs(selector = p => p) {
  const sel = useRef(selector); sel.current = selector;
  const get = useCallback(() => sel.current(prefs), []);
  return useSyncExternalStore(subscribePrefs, get, get);
}

// altre schede dello stesso browser: tema e vista restano allineati
try { globalThis.addEventListener?.('storage', e => { if (e.key === KEY) { stored = read(); prefs = { ...PREF_DEFAULTS, ...stored }; emit(); } }); } catch { /* ignora */ }
