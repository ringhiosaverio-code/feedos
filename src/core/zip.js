/* FeedOS 18 · Archivi ZIP senza compressione (fondazione 18), senza dipendenze: pacchetto per il revisore, esportazioni per
 * i clienti, moduli dei fornitori. Metodo «store» (nessuna compressione), nomi in UTF-8 (bit 11), CRC-32, directory centrale.
 * Date dei file fisse (01/01/1980) se non indicate, così lo stesso contenuto dà lo stesso archivio (e la stessa impronta).
 * Limiti: niente ZIP64 (al massimo 65.535 file e 4 GB). */
import { toBytes, utf8Bytes } from './hash.js';

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** CRC-32 (IEEE 802.3) di testo o byte: intero senza segno. crc32('hello') = 0x3610A686. */
export function crc32(input) {
  const b = toBytes(input);
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e ora MS-DOS da 'AAAA-MM-GG' o 'AAAA-MM-GGThh:mm:ss' (di base 01/01/1980 00:00). */
function dosTime(s) {
  const m = typeof s === 'string' ? s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/) : null;
  if (!m || +m[1] < 1980 || +m[1] > 2107) return { date: (1 << 5) | 1, time: 0 };
  return { date: ((+m[1] - 1980) << 9) | (+m[2] << 5) | +m[3], time: ((+(m[4] || 0)) << 11) | ((+(m[5] || 0)) << 5) | ((+(m[6] || 0)) >> 1) };
}

/** Nome sicuro dentro l'archivio: barre in avanti, niente radice, niente «..». */
export function zipName(name) {
  const parts = String(name ?? '').replace(/\\/g, '/').split('/').filter(p => p && p !== '.' && p !== '..');
  return parts.join('/') || 'file';
}

/**
 * Archivio ZIP «store»: files = [{name, data: Uint8Array | string, date?}] → Uint8Array.
 * opts.date: data di tutti i file (AAAA-MM-GG). Nomi ripetuti: dal secondo in poi si aggiunge « (2)», « (3)»…
 */
export function zipStore(files, opts = {}) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > 0xffff) throw new Error('Troppi file per un archivio ZIP senza ZIP64');
  const seen = new Map();
  const entries = list.map(f => {
    let name = zipName(f?.name);
    const n = seen.get(name) || 0; seen.set(name, n + 1);
    if (n) { const dot = name.lastIndexOf('.'); name = dot > 0 ? `${name.slice(0, dot)} (${n + 1})${name.slice(dot)}` : `${name} (${n + 1})`; }
    const data = toBytes(f?.data ?? '');
    return { nameBytes: utf8Bytes(name), data, crc: crc32(data), ...dosTime(f?.date || opts.date) };
  });
  let localSize = 0, cdSize = 0;
  for (const e of entries) { localSize += 30 + e.nameBytes.length + e.data.length; cdSize += 46 + e.nameBytes.length; }
  if (localSize + cdSize + 22 > 0xffffffff) throw new Error('Archivio troppo grande per un file ZIP senza ZIP64');
  const out = new Uint8Array(localSize + cdSize + 22);
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = v => { dv.setUint16(p, v, true); p += 2; }, u32 = v => { dv.setUint32(p, v >>> 0, true); p += 4; };
  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(e.time); u16(e.date); u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.nameBytes.length); u16(0);
    out.set(e.nameBytes, p); p += e.nameBytes.length;
    out.set(e.data, p); p += e.data.length;
  }
  const cdStart = p;
  entries.forEach((e, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(e.time); u16(e.date); u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.nameBytes.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]);
    out.set(e.nameBytes, p); p += e.nameBytes.length;
  });
  const cdLen = p - cdStart;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdLen); u32(cdStart); u16(0);
  return out;
}

/**
 * Lettura di un archivio ZIP (directory centrale → intestazioni locali): [{name, size, crc, method, data, ok}].
 * data è disponibile solo per i file non compressi (metodo 0); ok = CRC verificato. Archivio non valido → [].
 */
export function readZipEntries(bytes) {
  const b = toBytes(bytes);
  if (b.length < 22) return [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  const out = [];
  for (let k = 0; k < n; k++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return out;
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), comp = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nameB = b.subarray(p + 46, p + 46 + nl);
    const name = dec ? dec.decode(nameB) : String.fromCharCode(...nameB);
    let data = null, ok = false;
    if (off + 30 <= b.length && dv.getUint32(off, true) === 0x04034b50) {
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      if (method === 0 && start + comp <= b.length) { data = b.slice(start, start + comp); ok = crc32(data) === crc; }
    }
    out.push({ name, size, crc, method, data, ok });
    p += 46 + nl + xl + cl;
  }
  return out;
}
