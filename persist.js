/* FeedOS 16 · Salvataggio locale: IndexedDB (principale), localStorage (riserva), memoria (ultima risorsa).
 * I dati restano nel browser di questo dispositivo. Istantanee automatiche giornaliere e manuali. */

const DB = 'feedos16', STORE = 'kv', SNAP = 'snap', LS_KEY = 'feedos16.data';
let dbp = null;
let mode = 'idb';

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      if (!('indexedDB' in globalThis)) throw new Error('IndexedDB non disponibile');
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Database bloccato'));
    } catch (e) { rej(e); }
  });
  dbp.catch(() => { mode = testLocal() ? 'local' : 'memory'; });
  return dbp;
}
function testLocal() { try { localStorage.setItem('feedos16.t', '1'); localStorage.removeItem('feedos16.t'); return true; } catch { return false; } }
function tx(store, kind, fn) {
  return openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, kind); const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transazione annullata'));
  }));
}

export function storageMode() { return mode; }

export async function loadData() {
  try {
    const v = await tx(STORE, 'readonly', s => s.get('data'));
    mode = 'idb';
    return v || null;
  } catch {
    if (testLocal()) { mode = 'local'; try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
    mode = 'memory'; return null;
  }
}

export async function saveData(data) {
  if (mode === 'memory') return 'memory';
  if (mode === 'local') {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); return 'local'; } catch (e) { return 'error:' + (e.name === 'QuotaExceededError' ? 'spazio insufficiente' : e.message); }
  }
  try { await tx(STORE, 'readwrite', s => s.put(data, 'data')); return 'idb'; }
  catch (e) { return 'error:' + (e?.message || 'salvataggio non riuscito'); }
}

export async function clearData() {
  try { await tx(STORE, 'readwrite', s => s.delete('data')); } catch { /* ignora */ }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignora */ }
}

// ---------- istantanee ----------
export async function saveSnapshot(data, label, auto = false) {
  const snap = { id: new Date().toISOString(), label, auto, size: JSON.stringify(data).length, data };
  try {
    await tx(SNAP, 'readwrite', s => s.put(snap));
    const all = await listSnapshots();
    const autos = all.filter(x => x.auto);
    if (autos.length > 10) await Promise.all(autos.slice(10).map(x => deleteSnapshot(x.id)));
    return true;
  } catch { return false; }
}
export async function listSnapshots() {
  try {
    const all = await tx(SNAP, 'readonly', s => s.getAll());
    return (all || []).map(({ id, label, auto, size }) => ({ id, label, auto, size })).sort((a, b) => (a.id < b.id ? 1 : -1));
  } catch { return []; }
}
export async function getSnapshot(id) { try { return await tx(SNAP, 'readonly', s => s.get(id)); } catch { return null; } }
export async function deleteSnapshot(id) { try { await tx(SNAP, 'readwrite', s => s.delete(id)); } catch { /* ignora */ } }

/** Stima dello spazio usato e disponibile (dove il browser lo consente). */
export async function quota() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { used: e.usage, total: e.quota } : null; } catch { return null; }
}
