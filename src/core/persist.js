/* FeedOS 17 · Salvataggio locale: IndexedDB (principale), localStorage (riserva), memoria (ultima risorsa).
 * I dati restano nel browser di questo dispositivo. Istantanee automatiche giornaliere e manuali:
 * i dati in 'snap', i soli metadati in 'snapmeta' (l'elenco non legge mai gli archivi interi). Le foto (prove di campo, confezioni)
 * stanno in 'media', fuori dall'archivio: non appesantiscono i salvataggi e le istantanee; il backup le porta con sé. */
import { META as EDITION } from '../editions/meta.js';
import { setPrefs } from './prefs.js';

// nomi dall'edizione (FeedOS: 'feedos16', invariato per gli archivi già salvati; DifesaOS: archivio separato)
const KEYP = EDITION.storageKey || 'feedos16';
const DB = KEYP, DB_VERSION = 3, STORE = 'kv', SNAP = 'snap', META = 'snapmeta', MEDIA = 'media', LS_KEY = KEYP + '.data', MAX_AUTO = 10;
let dbp = null;
let mode = 'idb';

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let timer = null;
    try {
      if (!('indexedDB' in globalThis)) throw new Error('IndexedDB non disponibile');
      const r = indexedDB.open(DB, DB_VERSION);
      r.onupgradeneeded = e => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA, { keyPath: 'id' }); // versione 3: foto
        if (!db.objectStoreNames.contains(META)) {
          const meta = db.createObjectStore(META, { keyPath: 'id' });
          // una tantum (versione 1 → 2): metadati delle istantanee già salvate
          if (e.oldVersion >= 1) r.transaction.objectStore(SNAP).openCursor().onsuccess = ev => {
            const c = ev.target.result; if (!c) return;
            const { id, label, auto, size, data } = c.value;
            meta.put({ id, label, auto: !!auto, size: size ?? JSON.stringify(data ?? null).length, at: id });
            c.continue();
          };
        }
      };
      r.onsuccess = () => {
        clearTimeout(timer);
        const db = r.result;
        db.onversionchange = () => { db.close(); mode = 'blocked'; }; // una versione più recente in un'altra scheda: questa smette di salvare
        res(db);
      };
      r.onerror = () => { clearTimeout(timer); rej(r.error); };
      // un'altra scheda tiene aperta la versione precedente: si aspetta un poco, poi si apre in sola lettura
      r.onblocked = () => { timer = setTimeout(() => rej(Object.assign(new Error('L’archivio è aperto in un’altra scheda con una versione precedente di FeedOS: chiudila e ricarica la pagina.'), { blocked: true })), 4000); };
    } catch (e) { rej(e); }
  });
  dbp.catch(e => { mode = e?.blocked ? 'blocked' : testLocal() ? 'local' : 'memory'; });
  return dbp;
}
function testLocal() { try { localStorage.setItem(KEYP + '.t', '1'); localStorage.removeItem(KEYP + '.t'); return true; } catch { return false; } }
/** Transazione su uno o più archivi: fn riceve gli object store nell'ordine dei nomi. */
function tx(stores, kind, fn) {
  const names = [].concat(stores);
  return openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(names, kind);
    const out = fn(...names.map(n => t.objectStore(n)));
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transazione annullata'));
  }));
}

export function storageMode() { return mode; }

/** Archivio salvato oppure null se non c'è niente. Lancia un errore se c'è ma non si può leggere. */
export async function loadData() {
  try {
    const v = await tx(STORE, 'readonly', s => s.get('data'));
    mode = 'idb';
    return v || null;
  } catch (e) {
    if (e?.blocked) throw e;
    if (testLocal()) {
      mode = 'local';
      let s = null;
      try { s = localStorage.getItem(LS_KEY); } catch { return null; }
      if (!s) return null;
      try { return JSON.parse(s); } catch { throw new Error('L’archivio salvato in questo browser non è leggibile: non viene sovrascritto.'); }
    }
    mode = 'memory'; return null;
  }
}

export async function saveData(data) {
  if (mode === 'memory') return 'memory';
  if (mode === 'blocked') return 'error:archivio aperto in un’altra scheda';
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
  const id = new Date().toISOString();
  const meta = { id, label, auto: !!auto, size: JSON.stringify(data).length, at: id };
  try {
    await tx([SNAP, META], 'readwrite', (snap, m) => { snap.put({ ...meta, data }); m.put(meta); });
    const autos = (await listSnapshots()).filter(x => x.auto);
    if (autos.length > MAX_AUTO) await Promise.all(autos.slice(MAX_AUTO).map(x => deleteSnapshot(x.id)));
    return true;
  } catch { return false; }
}
/** Elenco delle istantanee (solo metadati), dalla più recente. */
export async function listSnapshots() {
  try {
    const all = await tx(META, 'readonly', s => s.getAll());
    return (all || []).map(({ id, label, auto, size, at }) => ({ id, label, auto, size, at: at || id })).sort((a, b) => (a.id < b.id ? 1 : -1));
  } catch { return []; }
}
export async function getSnapshot(id) { try { return await tx(SNAP, 'readonly', s => s.get(id)); } catch { return null; } }
export async function deleteSnapshot(id) { try { await tx([SNAP, META], 'readwrite', (s, m) => { s.delete(id); m.delete(id); }); } catch { /* ignora */ } }

/** Registra l'ora dell'ultimo backup esportato (preferenza del browser, non dato dell'archivio). */
export function markBackup() { setPrefs({ lastBackupAt: new Date().toISOString() }); }

/** Stima dello spazio usato e disponibile (dove il browser lo consente). */
export async function quota() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { used: e.usage, total: e.quota } : null; } catch { return null; }
}

// ---------- foto (archivio «media») ----------
// senza IndexedDB le foto restano solo in memoria fino alla chiusura della pagina (l'interfaccia lo dice)
const memMedia = new Map();
const idbOk = () => mode === 'idb';
/** Salva una foto {id, dataUrl, w, h, bytes, …}. → 'idb' | 'memory' */
export async function putMedia(rec) {
  if (!rec?.id) return null;
  if (idbOk()) { try { await tx(MEDIA, 'readwrite', s => s.put(rec)); return 'idb'; } catch { /* in memoria */ } }
  memMedia.set(rec.id, rec);
  return 'memory';
}
/** Foto per id (null se assente). */
export async function getMedia(id) {
  if (!id) return null;
  if (memMedia.has(id)) return memMedia.get(id);
  if (!idbOk()) return null;
  try { return (await tx(MEDIA, 'readonly', s => s.get(id))) || null; } catch { return null; }
}
/** Più foto insieme: → [rec] nell'ordine degli id trovati. */
export async function getMediaMany(ids) { return (await Promise.all([...new Set(ids || [])].map(getMedia))).filter(Boolean); }
export async function deleteMedia(id) { memMedia.delete(id); if (idbOk()) { try { await tx(MEDIA, 'readwrite', s => s.delete(id)); } catch { /* ignora */ } } }
/** Elenco delle foto salvate (id e peso, senza le immagini). */
export async function listMedia() {
  const mem = [...memMedia.values()].map(r => ({ id: r.id, bytes: r.bytes || 0 }));
  if (!idbOk()) return mem;
  try {
    const out = [];
    await tx(MEDIA, 'readonly', s => { s.openCursor().onsuccess = e => { const c = e.target.result; if (!c) return; out.push({ id: c.value.id, bytes: c.value.bytes || (c.value.dataUrl || '').length * 0.75 }); c.continue(); }; });
    return [...out, ...mem.filter(m => !out.some(o => o.id === m.id))];
  } catch { return mem; }
}
/** Foto che nessun archivio usa più (né quello attuale né le istantanee): si possono eliminare. used: id usati dall'archivio attuale. */
export async function unusedMedia(used) {
  const keep = new Set(used || []);
  for (const m of await listSnapshots()) {
    const x = await getSnapshot(m.id);
    for (const ph of x?.data?.photos || []) if (ph?.mediaId) keep.add(ph.mediaId);
  }
  return (await listMedia()).filter(m => !keep.has(m.id));
}
export const mediaPersistent = () => idbOk();
