/* FeedOS 16 · Stato dell'applicazione: dati per collezioni immutabili, cronologia (annulla/ripeti),
 * registro delle modifiche, salvataggio automatico. */
import { useSyncExternalStore, useCallback, useRef } from 'react';
import { loadData, saveData, saveSnapshot, storageMode } from './persist.js';
import { iso, uid } from './util.js';

import { COLLECTIONS, emptyData } from './schema.js';
export { COLLECTIONS, emptyData };

let state = { data: emptyData(), ready: false, saving: 'idle', saveMode: 'idb', lastSaved: null };
const listeners = new Set();
const history = { past: [], future: [] };
let saveTimer = null, lastSnapDay = null;

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

export async function initStore(makeDefault) {
  const saved = await loadData();
  if (saved && saved.settings?.schema === 16) set({ data: migrate(saved), ready: true, saveMode: storageMode() });
  else set({ data: makeDefault ? await makeDefault() : emptyData(), ready: true, saveMode: storageMode(), fresh: true });
  if (!saved) scheduleSave();
}
function migrate(d) { for (const c of COLLECTIONS) if (!Array.isArray(d[c])) d[c] = []; d.settings ||= {}; d.settings.signalState ||= {}; d.esgManual ||= {}; return d; }

function scheduleSave() {
  clearTimeout(saveTimer);
  set({ saving: 'pending' });
  saveTimer = setTimeout(async () => {
    const res = await saveData(state.data);
    const day = iso(new Date());
    if (!res.startsWith('error') && lastSnapDay !== day && res === 'idb') { lastSnapDay = day; saveSnapshot(state.data, 'Istantanea automatica', true); }
    set({ saving: res.startsWith('error') ? 'error' : 'saved', saveError: res.startsWith('error') ? res.slice(6) : null, saveMode: storageMode(), lastSaved: new Date().toISOString() });
  }, 500);
}

function logEvent(d, label, coll, id) {
  const ev = { id: uid('ev'), at: new Date().toISOString(), role: d.settings?.role || 'direzione', label, coll, entity: id };
  const events = [ev, ...(d.events || [])].slice(0, 800);
  return { ...d, events };
}

/** Applica un insieme di operazioni come un unico passo annullabile. */
function applyOps(ops, label, record = true) {
  let d = state.data;
  const done = [];
  for (const op of ops) {
    if (op.kind === 'settings') {
      const before = d.settings;
      d = { ...d, settings: typeof op.value === 'function' ? op.value(d.settings) : { ...d.settings, ...op.value } };
      done.push({ kind: 'settings', before, after: d.settings });
      continue;
    }
    if (op.kind === 'esg') {
      const before = d.esgManual;
      d = { ...d, esgManual: { ...d.esgManual, ...op.value } };
      done.push({ kind: 'esg', before, after: d.esgManual });
      continue;
    }
    const arr = d[op.coll] || [];
    if (op.kind === 'add') {
      const obj = { ...op.obj, id: op.obj.id || uid(op.coll.slice(0, 2)) };
      d = { ...d, [op.coll]: [obj, ...arr] };
      done.push({ kind: 'add', coll: op.coll, id: obj.id, after: obj });
    } else if (op.kind === 'update') {
      const i = arr.findIndex(x => x.id === op.id);
      if (i < 0) continue;
      const before = arr[i];
      const after = typeof op.patch === 'function' ? op.patch(before) : { ...before, ...op.patch };
      const next = arr.slice(); next[i] = after;
      d = { ...d, [op.coll]: next };
      done.push({ kind: 'update', coll: op.coll, id: op.id, before, after });
    } else if (op.kind === 'remove') {
      const i = arr.findIndex(x => x.id === op.id);
      if (i < 0) continue;
      const before = arr[i];
      d = { ...d, [op.coll]: arr.filter(x => x.id !== op.id) };
      done.push({ kind: 'remove', coll: op.coll, id: op.id, before, index: i });
    } else if (op.kind === 'replace') {
      const before = d[op.coll];
      d = { ...d, [op.coll]: op.value };
      done.push({ kind: 'replace', coll: op.coll, before, after: op.value });
    }
  }
  if (!done.length) return null;
  const first = done.find(x => x.coll);
  if (label) d = logEvent(d, label, first?.coll || done[0].kind, first?.id);
  set({ data: d });
  if (record) { history.past.push({ label, ops: done }); if (history.past.length > 60) history.past.shift(); history.future = []; }
  scheduleSave();
  return done;
}

export const store = {
  add: (coll, obj, label) => applyOps([{ kind: 'add', coll, obj }], label)?.[0]?.id,
  update: (coll, id, patch, label) => applyOps([{ kind: 'update', coll, id, patch }], label),
  remove: (coll, id, label) => applyOps([{ kind: 'remove', coll, id }], label),
  replace: (coll, value, label) => applyOps([{ kind: 'replace', coll, value }], label),
  settings: (value, label) => applyOps([{ kind: 'settings', value }], label),
  esg: (value, label) => applyOps([{ kind: 'esg', value }], label),
  batch: (ops, label) => applyOps(ops, label),
  /** Sostituisce l'intero archivio (demo, importazione, ripristino). Non annullabile, ma salva un'istantanea prima. */
  async load(data, label) {
    try { if (state.data && (state.data.formulas?.length || state.data.customers?.length)) await saveSnapshot(state.data, 'Prima di: ' + label, false); } catch { /* ignora */ }
    history.past = []; history.future = [];
    set({ data: migrate(logEvent(data, label, 'archivio')) });
    scheduleSave();
  },
  canUndo: () => history.past.length > 0,
  canRedo: () => history.future.length > 0,
  undoLabel: () => history.past[history.past.length - 1]?.label,
  undo() {
    const h = history.past.pop(); if (!h) return;
    let d = state.data;
    for (const op of [...h.ops].reverse()) d = revert(d, op);
    history.future.push(h);
    set({ data: logEvent(d, 'Annullato: ' + (h.label || 'modifica'), h.ops[0].coll) });
    scheduleSave();
    return h.label;
  },
  redo() {
    const h = history.future.pop(); if (!h) return;
    let d = state.data;
    for (const op of h.ops) d = reapply(d, op);
    history.past.push(h);
    set({ data: logEvent(d, 'Ripristinato: ' + (h.label || 'modifica'), h.ops[0].coll) });
    scheduleSave();
    return h.label;
  },
  saveNow: () => { clearTimeout(saveTimer); return saveData(state.data); },
};

function revert(d, op) {
  if (op.kind === 'settings') return { ...d, settings: op.before };
  if (op.kind === 'esg') return { ...d, esgManual: op.before };
  const arr = d[op.coll];
  if (op.kind === 'add') return { ...d, [op.coll]: arr.filter(x => x.id !== op.id) };
  if (op.kind === 'update') return { ...d, [op.coll]: arr.map(x => x.id === op.id ? op.before : x) };
  if (op.kind === 'remove') { const next = arr.slice(); next.splice(Math.min(op.index, next.length), 0, op.before); return { ...d, [op.coll]: next }; }
  if (op.kind === 'replace') return { ...d, [op.coll]: op.before };
  return d;
}
function reapply(d, op) {
  if (op.kind === 'settings') return { ...d, settings: op.after };
  if (op.kind === 'esg') return { ...d, esgManual: op.after };
  const arr = d[op.coll];
  if (op.kind === 'add') return { ...d, [op.coll]: [op.after, ...arr] };
  if (op.kind === 'update') return { ...d, [op.coll]: arr.map(x => x.id === op.id ? op.after : x) };
  if (op.kind === 'remove') return { ...d, [op.coll]: arr.filter(x => x.id !== op.id) };
  if (op.kind === 'replace') return { ...d, [op.coll]: op.after };
  return d;
}

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
  setTimeout(() => uiStore.set(u => ({ toast: u.toast.filter(t => t.id !== id) })), action ? 6500 : 3800);
}
export function openDrawer(kind, id, extra) { uiStore.set({ drawer: { kind, id, ...extra } }); }
export function closeDrawer() { uiStore.set({ drawer: null }); }
