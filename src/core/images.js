/* Foto: lettura dei dati EXIF delle JPEG (data dello scatto e posizione GPS) e riduzione per l'archivio (lato lungo 1600 px,
 * JPEG all'82%: una foto di campo da 4–8 MB diventa 200–400 kB). Le foto restano nel browser come l'archivio (persist.js, «media»). */

/** EXIF di una JPEG: {date: 'YYYY-MM-DDTHH:MM:SS', lat, lon} (campi assenti se mancano). Mai un errore: un file strano dà {}. */
export function readExif(buf) {
  const out = {};
  try {
    const v = buf instanceof DataView ? buf : new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) break;
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) return { ...out, ...tiff(v, off + 10, Math.min(v.byteLength, off + 2 + size)) };
      if (marker === 0xffda || size < 2) break; // inizio dei dati dell'immagine: niente EXIF
      off += 2 + size;
    }
  } catch { /* file non leggibile: nessun dato */ }
  return out;
}

function tiff(v, t0, end) {
  const out = {};
  const le = v.getUint16(t0) === 0x4949;
  const u16 = o => (o + 2 <= end ? v.getUint16(o, le) : 0), u32 = o => (o + 4 <= end ? v.getUint32(o, le) : 0);
  if (u16(t0 + 2) !== 42) return out;
  const ifd = rel => {
    const at = t0 + rel, tags = {};
    if (!rel || at + 2 > end) return tags;
    const n = Math.min(u16(at), 200);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return tags;
  };
  const ascii = tg => {
    if (!tg || tg.type !== 2) return null;
    const at = tg.count > 4 ? t0 + u32(tg.at) : tg.at;
    let s = '';
    for (let i = 0; i < tg.count - 1 && at + i < end; i++) s += String.fromCharCode(v.getUint8(at + i));
    return s;
  };
  const rationals = tg => {
    if (!tg || tg.type !== 5) return null;
    const at = t0 + u32(tg.at), out = [];
    for (let i = 0; i < tg.count && at + i * 8 + 8 <= end; i++) { const d = u32(at + i * 8 + 4); out.push(d ? u32(at + i * 8) / d : 0); }
    return out;
  };
  const ifd0 = ifd(u32(t0 + 4));
  const exif = ifd0[0x8769] ? ifd(u32(ifd0[0x8769].at)) : {};
  const dt = ascii(exif[0x9003]) || ascii(exif[0x9004]) || ascii(ifd0[0x0132]);
  const m = dt && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (m && m[1] !== '0000') out.date = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    const deg = r => (r && r.length >= 3 ? r[0] + r[1] / 60 + r[2] / 3600 : null);
    const lat = deg(rationals(g[2])), lon = deg(rationals(g[4]));
    const ref = tg => (tg && tg.count >= 1 ? String.fromCharCode(v.getUint8(tg.at)) : '');
    if (lat != null && lon != null && (lat || lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      out.lat = ref(g[1]) === 'S' ? -lat : lat;
      out.lon = ref(g[3]) === 'W' ? -lon : lon;
    }
  }
  return out;
}

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('immagine non leggibile')); im.src = url; });
}

/**
 * Foto ridotta per l'archivio: → {dataUrl, w, h, bytes, takenAt, lat, lon, name}. Rifiuta i formati che il browser non apre
 * (per esempio HEIC fuori da Safari) con un messaggio chiaro.
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  const buf = await file.arrayBuffer();
  const exif = readExif(buf);
  let img, url = null;
  try {
    img = typeof createImageBitmap === 'function' ? await createImageBitmap(file, { imageOrientation: 'from-image' }) : null;
  } catch { img = null; }
  if (!img) {
    url = URL.createObjectURL(file);
    try { img = await loadImage(url); } catch { URL.revokeObjectURL(url); throw new Error(`«${file.name}»: formato non leggibile in questo browser (usare JPEG o PNG)`); }
  }
  const w0 = img.width, h0 = img.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  if (url) URL.revokeObjectURL(url);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, w, h, bytes: Math.round((dataUrl.length - 23) * 0.75), takenAt: exif.date || null, lat: exif.lat ?? null, lon: exif.lon ?? null, name: file.name };
}
