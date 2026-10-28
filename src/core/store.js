/* FeedOS 17 · Stato dell'applicazione: dati per collezioni immutabili, cronologia (annulla/ripeti),
 * registro delle modifiche, salvataggio automatico, avvio sicuro (migrazioni, mai il demo sopra un archivio salvato). */
import { META as EDITION } from '../editions/meta.js';
import { useSyncExternalStore, useCallback, useRef } from 'react';
import { loadData, saveData, saveSnapshot, storageMode } from './persist.js';
import { uid, todayLocal } from './util.js';
import { getPrefs, seedPrefs } from './prefs.js';
import { applyOpsTo, revertOp, reapplyOp, CLOSED_MSG } from './ops.js';

import { COLLECTIONS, SCHEMA_VERSION, emptyData, migrateData, schemaOf, schemaErrorText, ensureCollections, validateShape } from './schema.js';
export { COLLECTIONS, emptyData };

let state = { data: emptyData(), ready: false, saving: 'idle', saveMode: 'idb', lastSaved: null, readOnly: false, loadError: null, otherTab: false };
const listeners = new Set();
const history = { past: [], future: [] };
let saveTimer = null, upgradeFn = d => d;

function emit() { for (const l of listeners) l(); }
function set(patch) { state = { ...state, ...patch }; emit(); }
export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Hook: seleziona una parte dello stato; il selettore deve restituire riferimenti stabili. */
export function useStore(selector = s => s) {
  const sel = useRef(selector); sel.current = selector;
  const get = useCallback(() => sel.current(state), []);
  return useSyncExternalStore(subscribe, get, get);
}
export const useData = () => useStore(s => s.data);

const NEWER = 'Archivio creato da una versione più recente di FeedOS: sola lettura';

/**
 * Avvio: carica l'archivio salvato e lo porta allo schema corrente (istantanea prima di migrare).
 * makeDefault() (il demo) parte SOLO se non c'è niente di salvato; uno schema più recente si apre in sola lettura.
 */
export async function initStore(makeDefault, upgrade = d => d) {
  upgradeFn = upgrade;
  let saved = null;
  try { saved = await loadData(); }
  catch (e) { set({ data: emptyData(), ready: true, readOnly: true, loadError: e?.message || 'Archivio non leggibile', saveMode: storageMode() }); startLifecycle(); return; }
  if (saved) {
    const from = schemaOf(saved);
    if (from != null && from > SCHEMA_VERSION) { set({ data: ensureCollections(saved), ready: true, readOnly: true, loadError: NEWER, saveMode: storageMode() }); startLifecycle(); return; }
    let m;
    try {
      if (from != null && from < SCHEMA_VERSION) await saveSnapshot(saved, `Prima della migrazione allo schema ${SCHEMA_VERSION}`, false);
      m = migrateData(saved);
    } catch (e) {
      set({ data: emptyData(), ready: true, readOnly: true, loadError: schemaErrorText(e) + ' L’archivio salvato non viene toccato.', saveMode: storageMode() });
      startLifecycle(); return;
    }
    seedPrefs(m.prefsSeed);
    let data = upgradeFn(m.data);
    const dirty = m.applied.length > 0 || data !== m.data;
    if (m.applied.length) data = logEvent(data, 'Archivio aggiornato: ' + m.applied.join(' · '), 'archivio');
    const shape = validateShape(data);
    set({ data, ready: true, saveMode: storageMode(), shapeErrors: shape.ok ? null : shape.errors });
    if (dirty) scheduleSave();
  } else {
    let data = makeDefault ? await makeDefault() : emptyData();
    try { const m = migrateData(data); data = m.data; seedPrefs(m.prefsSeed); } catch { data = emptyData(); }
    set({ data, ready: true, saveMode: storageMode(), fresh: true });
    scheduleSave();
  }
  startLifecycle();
}

// ---------- salvataggio ----------
const SNAP_DAY_KEY = (EDITION.storageKey || 'feedos16') + '.lastSnapDay';
let memSnapDay = null;
function scheduleSave() {
  if (state.readOnly) return; // sola lettura: niente scritture
  clearTimeout(saveTimer);
  set({ saving: 'pending' });
  saveTimer = setTimeout(doSave, 500);
}
async function doSave() {
  saveTimer = null;
  const res = await saveData(state.data);
  const err = res.startsWith('error');
  if (!err && res === 'idb') dailySnapshot();
  set({ saving: err ? 'error' : 'saved', saveError: err ? res.slice(6) : null, saveMode: storageMode(), lastSaved: new Date().toISOString() });
  return res;
}
/** Un'istantanea automatica per giorno locale, anche tra più aperture della pagina. */
function dailySnapshot() {
  const day = todayLocal();
  let last = memSnapDay;
  try { last = localStorage.getItem(SNAP_DAY_KEY) ?? memSnapDay; } catch { /* memoria */ }
  if (last === day) return;
  memSnapDay = day;
  try { localStorage.setItem(SNAP_DAY_KEY, day); } catch { /* memoria */ }
  saveSnapshot(state.data, 'Istantanea automatica', true);
}
/** Salva subito se c'è un salvataggio in attesa (chiusura o scheda nascosta). */
export function flushSave() {
  if (!saveTimer || state.readOnly) return null;
  clearTimeout(saveTimer);
  return doSave();
}

let lifecycle = false;
function startLifecycle() {
  if (lifecycle || typeof window === 'undefined') return;
  lifecycle = true;
  window.addEventListener('pagehide', () => { flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  try { const s = navigator.storage; if (s?.persist) Promise.resolve(s.persisted?.()).then(p => p || s.persist()).catch(() => {}); } catch { /* ignora */ }
  // altre schede aperte sullo stesso archivio: vince l'ultimo salvataggio, quindi lo si segnala
  try {
    const ch = new BroadcastChannel(EDITION.storageKey || 'feedos16'), me = uid('tab'), peers = new Set();
    const upd = () => set({ otherTab: peers.size > 0 });
    ch.onmessage = e => {
      const m = e.data || {};
      if (!m.id || m.id === me) return;
      if (m.t === 'hello') { peers.add(m.id); ch.postMessage({ t: 'here', id: me }); upd(); }
      else if (m.t === 'here') { peers.add(m.id); upd(); }
      else if (m.t === 'bye') { peers.delete(m.id); upd(); }
    };
    ch.postMessage({ t: 'hello', id: me });
    window.addEventListener('pagehide', () => ch.postMessage({ t: 'bye', id: me }));
    window.addEventListener('pageshow', e => { if (e.persisted) ch.postMessage({ t: 'hello', id: me }); });
  } catch { /* BroadcastChannel non disponibile */ }
}

function logEvent(d, label, coll, id) {
  const ev = { id: uid('ev'), at: new Date().toISOString(), role: getPrefs().role || 'direzione', label, coll, entity: id };
  const events = [ev, ...(d.events || [])].slice(0, 800);
  return { ...d, events };
}

/**
 * Applica un insieme di operazioni come un unico passo annullabile (vedi core/ops.js).
 * opts.silent: niente cronologia né registro · opts.force: ammette i mesi chiusi.
 * → false se rifiutato (mese chiuso), null se non cambia niente, altrimenti i passi eseguiti.
 */
function applyOps(ops, label, { silent = false, force = false } = {}) {
  const r = applyOpsTo(state.data, ops, { force });
  if (r.refused) { toast(CLOSED_MSG, 'err'); return false; }
  if (!r.done.length) return null;
  let d = r.data;
  const first = r.done.find(x => x.coll);
  if (label && !silent) d = logEvent(d, label, first?.coll || r.done[0].kind, first?.id);
  set({ data: d });
  if (!silent) { history.past.push({ label, ops: r.done }); if (history.past.length > 60) history.past.shift(); history.future = []; }
  scheduleSave();
  return r.done;
}

export const store = {
  add: (coll, obj, label, opts) => applyOps([{ kind: 'add', coll, obj }], label, opts)?.[0]?.id,
  update: (coll, id, patch, label, opts) => applyOps([{ kind: 'update', coll, id, patch }], label, opts),
  remove: (coll, id, label, opts) => applyOps([{ kind: 'remove', coll, id }], label, opts),
  replace: (coll, value, label, opts) => applyOps([{ kind: 'replace', coll, value }], label, opts),
  settings: (value, label, opts) => applyOps([{ kind: 'settings', value }], label, opts),
  esg: (value, label) => applyOps([{ kind: 'esg', value }], label),
  survey: (value, label) => applyOps([{ kind: 'survey', value }], label),
  /** ops: add, addMany, update, upsertMany, remove, removeMany, replace, settings, esg, survey. opts: {silent, force}. */
  batch: (ops, label, opts) => applyOps(ops, label, opts),
  /** Sostituisce l'intero archivio (demo, importazione, ripristino) portandolo allo schema corrente.
   *  Non annullabile, ma salva un'istantanea prima. → true se caricato, false se rifiutato. */
  async load(data, label) {
    if (state.readOnly) { toast('Archivio in sola lettura: niente è stato sostituito.', 'err'); return false; }
    let m;
    try { m = migrateData(data); } catch (e) { toast(schemaErrorText(e), 'err'); return false; }
    try { if (state.data && (state.data.formulas?.length || state.data.customers?.length)) await saveSnapshot(state.data, 'Prima di: ' + label, false); } catch { /* ignora */ }
    seedPrefs(m.prefsSeed);
    history.past = []; history.future = [];
    set({ data: logEvent(upgradeFn(m.data), label, 'archivio'), shapeErrors: null });
    scheduleSave();
    return true;
  },
  canUndo: () => history.past.length > 0,
  canRedo: () => history.future.length > 0,
  undoLabel: () => history.past[history.past.length - 1]?.label,
  undo() {
    const h = history.past.pop(); if (!h) return;
    let d = state.data;
    for (const op of [...h.ops].reverse()) d = revertOp(d, op);
    history.future.push(h);
    set({ data: logEvent(d, 'Annullato: ' + (h.label || 'modifica'), h.ops[0].coll) });
    scheduleSave();
    return h.label;
  },
  redo() {
    const h = history.future.pop(); if (!h) return;
    let d = state.data;
    for (const op of h.ops) d = reapplyOp(d, op);
    history.past.push(h);
    set({ data: logEvent(d, 'Ripristinato: ' + (h.label || 'modifica'), h.ops[0].coll) });
    scheduleSave();
    return h.label;
  },
  saveNow: () => { if (state.readOnly) return Promise.resolve('readonly'); clearTimeout(saveTimer); saveTimer = null; return saveData(state.data); },
};

// ---------- stato dell'interfaccia (non salvato) ----------
let ui = { drawer: null, toast: [], palette: false, tour: null, modal: null };
const uiListeners = new Set();
export const uiStore = {
  get: () => ui,
  set(p) { ui = { ...ui, ...(typeof p === 'function' ? p(ui) : p) }; for (const l of uiListeners) l(); },
  subscribe(fn) { uiListeners.add(fn); return () => uiListeners.delete(fn); },
};
export function useUi(selector = s => s) {
  const sel = useRef(selector); sel.current = selector;
  const get = useCallback(() => sel.current(ui), []);
  return useSyncExternalStore(uiStore.subscribe, get, get);
}
let toastId = 0;
export function toast(text, kind = 'ok', action) {
  const id = ++toastId;
  uiStore.set(u => ({ toast: [...u.toast, { id, text, kind, action }] }));
  const t = setTimeout(() => uiStore.set(u => ({ toast: u.toast.filter(t => t.id !== id) })), action ? 6500 : 3800);
  t?.unref?.(); // nei test node non tiene vivo il processo
}
export function openDrawer(kind, id, extra) { uiStore.set({ drawer: { kind, id, ...extra } }); }
export function closeDrawer() { uiStore.set({ drawer: null }); }
