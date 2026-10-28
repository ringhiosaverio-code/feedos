/* FeedOS 18 · Allegati delle evidenze (pacchetto WP6 «governance», proprietario di questo file).
 * I file stanno nello stesso database IndexedDB dell'archivio (core/persist.js: nome dall'edizione, archivio 'kv'), con chiavi
 * 'blob:<id>' e un indice 'blobs:index' {id: byte}; nessun cambio di versione del database. Non entrano mai nell'archivio JSON
 * né nei salvataggi automatici: il backup li include solo se l'utente lo sceglie (opzione dell'integratore in Dati › Archivio).
 * Budget: 200 MB in tutto, 15 MB per file. Se IndexedDB non c'è (navigazione privata, file aperto in un visualizzatore) si
 * ripiega sulla memoria della pagina: i file restano finché la pagina è aperta e l'interfaccia lo dice (mode() = 'memoria').
 * Nessun messaggio in console: ogni errore diventa un risultato {ok:false, error}. */
import { META as EDITION } from '../editions/meta.js';

export const BLOB_MAX_FILE = 15 * 1024 * 1024;
export const BLOB_MAX_TOTAL = 200 * 1024 * 1024;
const DB = EDITION.storageKey || 'feedos16', DB_VERSION = 2, STORE = 'kv', SNAP = 'snap', META = 'snapmeta';
const INDEX = 'blobs:index';
const key = id => 'blob:' + id;

let dbp = null;
let state = 'idb';
const mem = new Map();          // ripiego in memoria: id → {bytes, mime, name, size, sha256, at}

/** Stesso database e stesse regole di creazione di core/persist.js (si apre con la stessa versione: nessun aggiornamento). */
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      if (!('indexedDB' in globalThis)) throw new Error('IndexedDB non disponibile');
      const r = indexedDB.open(DB, DB_VERSION);
      r.onupgradeneeded = e => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) {
          const meta = db.createObjectStore(META, { keyPath: 'id' });
          if (e.oldVersion >= 1) r.transaction.objectStore(SNAP).openCursor().onsuccess = ev => {
            const c = ev.target.result; if (!c) return;
            const { id, label, auto, size, data } = c.value;
            meta.put({ id, label, auto: !!auto, size: size ?? JSON.stringify(data ?? null).length, at: id });
            c.continue();
          };
        }
      };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };
      r.onerror = () => rej(r.error || new Error('Database non disponibile'));
      r.onblocked = () => rej(new Error('Il database è aperto in un’altra scheda con una versione diversa'));
    } catch (e) { rej(e); }
  });
  dbp.catch(() => { state = 'memoria'; dbp = null; });
  return dbp;
}
function tx(kind, fn) {
  return openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, kind);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error || new Error('Transazione non riuscita'));
    t.onabort = () => rej(t.error || new Error('Transazione annullata (spazio esaurito?)'));
  }));
}
const errText = e => String(e?.message || e || 'errore');

/** Dove finiscono gli allegati: 'idb' (nel browser, persistenti) o 'memoria' (solo finché la pagina è aperta). */
export function blobMode() { return state; }

async function readIndex() {
  if (state === 'memoria') { const o = {}; for (const [id, v] of mem) o[id] = v.size; return o; }
  try { const v = await tx('readonly', s => s.get(INDEX)); return v && typeof v === 'object' ? v : {}; }
  catch { state = 'memoria'; return readIndex(); }
}

/** Spazio usato dagli allegati: {used, files, max, maxFile, mode, ids: {id: byte}}. */
export async function blobUsage() {
  const ids = await readIndex();
  const used = Object.values(ids).reduce((s, v) => s + (+v || 0), 0);
  return { used, files: Object.keys(ids).length, max: BLOB_MAX_TOTAL, maxFile: BLOB_MAX_FILE, mode: state, ids };
}

/** Controllo del budget prima di salvare: {ok, error?}. */
export function checkBudget(size, usedNow, replacing = 0) {
  if (!(size >= 0)) return { ok: false, error: 'Dimensione del file non valida' };
  if (size > BLOB_MAX_FILE) return { ok: false, error: `Il file supera i ${BLOB_MAX_FILE / 1048576} MB per allegato: registra solo l’impronta e il percorso` };
  if (usedNow - replacing + size > BLOB_MAX_TOTAL) return { ok: false, error: `Spazio per gli allegati esaurito (${BLOB_MAX_TOTAL / 1048576} MB): togli allegati vecchi o registra solo il percorso` };
  return { ok: true };
}

/**
 * Salva un allegato: bytes (Uint8Array | ArrayBuffer), meta {mime, name, sha256}. → {ok, mode, size} | {ok:false, error}.
 * Rispetta il budget (15 MB per file, 200 MB in tutto); sostituisce un allegato con lo stesso id.
 */
export async function putBlob(id, bytes, meta = {}) {
  if (!id) return { ok: false, error: 'Identificativo mancante' };
  const buf = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  if (!buf) return { ok: false, error: 'Contenuto del file non valido' };
  const u = await blobUsage();
  const chk = checkBudget(buf.byteLength, u.used, +u.ids[id] || 0);
  if (!chk.ok) return chk;
  const rec = { bytes: buf, mime: meta.mime || 'application/octet-stream', name: meta.name || id, size: buf.byteLength, sha256: meta.sha256 || null, at: meta.at || null };
  if (state === 'memoria') { mem.set(id, rec); return { ok: true, mode: state, size: rec.size }; }
  try {
    await tx('readwrite', s => {
      s.put(rec, key(id));
      const r = s.get(INDEX);
      r.onsuccess = () => { const ix = r.result && typeof r.result === 'object' ? { ...r.result } : {}; ix[id] = rec.size; s.put(ix, INDEX); };
    });
    return { ok: true, mode: state, size: rec.size };
  } catch (e) {
    if (state !== 'memoria' && !('indexedDB' in globalThis)) { state = 'memoria'; mem.set(id, rec); return { ok: true, mode: state, size: rec.size }; }
    return { ok: false, error: errText(e) };
  }
}

/** Allegato salvato: {bytes, mime, name, size, sha256} oppure null. */
export async function getBlob(id) {
  if (!id) return null;
  if (state === 'memoria') return mem.get(id) || null;
  try { return (await tx('readonly', s => s.get(key(id)))) || null; } catch { return mem.get(id) || null; }
}

/** Toglie un allegato (e la sua voce dall'indice). → {ok}. */
export async function deleteBlob(id) {
  if (!id) return { ok: false, error: 'Identificativo mancante' };
  mem.delete(id);
  if (state === 'memoria') return { ok: true };
  try {
    await tx('readwrite', s => {
      s.delete(key(id));
      const r = s.get(INDEX);
      r.onsuccess = () => { const ix = r.result && typeof r.result === 'object' ? { ...r.result } : {}; delete ix[id]; s.put(ix, INDEX); };
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: errText(e) }; }
}

/** C'è un allegato per questo id? */
export async function hasBlob(id) { const u = await blobUsage(); return Object.prototype.hasOwnProperty.call(u.ids, id); }
