/* FeedOS 18 · EUDR e fornitori (pacchetto WP3 «filiera»): geolocalizzazione degli appezzamenti.
 * validateGeoJSON: FeatureCollection in WGS-84 (EPSG:4326), almeno 6 decimali, anelli chiusi con almeno 4 posizioni, nessuna
 * auto-intersezione (prova O(n²) sui segmenti, fino a 5.000 vertici), superficie sulla sfera
 * A = R²·|Σ(λ₂−λ₁)(2+sinφ₁+sinφ₂)|/2 con R = 6.371.008,8 m, punto ammesso solo con superficie dichiarata sotto i 4 ha,
 * appezzamenti ripetuti; problemi descritti in italiano. plotMapModel/plotMapSvg: proiezione equirettangolare adattata al
 * riquadro, senza mappe di sfondo, colori del tema. Funzioni pure, senza dipendenze, senza eccezioni verso chi chiama. */

export const EARTH_R = 6371008.8;
export const MAX_VERTICES = 5000;
export const MAX_GEOJSON_BYTES = 2000000;
export const POINT_MAX_HA = 4;
export const MIN_DECIMALS = 6;

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const rad = x => (x * Math.PI) / 180;
const r6 = x => Math.round(x * 1e6) / 1e6;
const GEOMS = ['Point', 'MultiPoint', 'Polygon', 'MultiPolygon'];
const AREA_KEYS = ['Area', 'area', 'AREA', 'areaHa', 'area_ha', 'Superficie', 'superficie', 'ha'];
const NAME_KEYS = ['ProductionPlace', 'productionPlace', 'name', 'Name', 'nome', 'Nome', 'PlotID', 'plotId', 'id'];

/** Superficie di un anello [[lon, lat], …] chiuso, in m², sulla sfera di raggio EARTH_R. */
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i], [l2, p2] = ring[i + 1];
    s += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((s * EARTH_R * EARTH_R) / 2);
}
/** Superficie di un poligono (anello esterno meno i fori) in ettari. */
export function polygonAreaHa(rings) {
  if (!Array.isArray(rings) || !rings.length) return 0;
  const outer = ringAreaM2(rings[0]);
  const holes = rings.slice(1).reduce((s, r) => s + ringAreaM2(r), 0);
  return Math.max(0, outer - holes) / 10000;
}

/** Decimali con cui è scritto un numero (1e-7 → 7). */
function decimalsOf(x) {
  const s = String(x);
  const e = s.match(/e-(\d+)$/i);
  if (e) { const mant = s.split(/e/i)[0]; const i = mant.indexOf('.'); return +e[1] + (i < 0 ? 0 : mant.length - i - 1); }
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/* orientamento del terzetto (p, q, r): 0 allineati, 1 orario, 2 antiorario */
function orient(p, q, r) {
  const v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(v) < 1e-18) return 0;
  return v > 0 ? 1 : 2;
}
const onSeg = (p, q, r) => q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) && q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
/** I segmenti ab e cd si toccano o si incrociano? */
export function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}
/** L'anello chiuso si interseca da sé? (segmenti non adiacenti che si toccano). */
export function ringSelfIntersects(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}
/** Due anelli dello stesso poligono si incrociano? */
function ringsCross(a, b) {
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
  return false;
}

/**
 * Controllo di un file GeoJSON (testo o oggetto) del formato del sistema d'informazione UE.
 * → { ok, features: [{i, name, geom, coords, areaHa, declaredAreaHa, lat, lon, vertices, valid, issues}], issues: [{level:'errore'|'avviso', feature, msg}],
 *     totalAreaHa, bbox: [minLon, minLat, maxLon, maxLat] | null, vertexCount, intersectionsChecked, maxDecimals }
 * opts.maxVertices: limite della prova delle auto-intersezioni (di base 5.000).
 */
export function validateGeoJSON(input, opts = {}) {
  const issues = [];
  const out = { ok: false, features: [], issues, totalAreaHa: 0, bbox: null, vertexCount: 0, intersectionsChecked: false, maxDecimals: null };
  const err = (msg, feature = null) => issues.push({ level: 'errore', feature, msg });
  const warn = (msg, feature = null) => issues.push({ level: 'avviso', feature, msg });
  let gj = input;
  if (typeof input === 'string') {
    if (input.length > MAX_GEOJSON_BYTES) { err('File troppo grande: oltre 2 MB. Dividete gli appezzamenti in più file.'); return out; }
    try { gj = JSON.parse(input); } catch { err('Il file non è un GeoJSON leggibile (JSON non valido).'); return out; }
  }
  if (!isObj(gj)) { err('Il contenuto non è un oggetto GeoJSON.'); return out; }
  if (gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) { err('Serve una FeatureCollection con l’elenco «features», come nel formato del sistema d’informazione UE.'); return out; }
  const crsName = gj.crs?.properties?.name;
  if (crsName && !/(EPSG:+4326|CRS84|WGS ?84)/i.test(String(crsName))) err(`Sistema di riferimento «${crsName}»: servono coordinate WGS-84 (EPSG:4326), longitudine e latitudine in gradi.`);
  if (!gj.features.length) { err('Nessun appezzamento nel file.'); return out; }
  const maxV = Number.isFinite(opts.maxVertices) ? opts.maxVertices : MAX_VERTICES;
  // conteggio dei vertici prima delle prove pesanti
  let total = 0;
  const countPos = c => (Array.isArray(c) && typeof c[0] === 'number' ? 1 : Array.isArray(c) ? c.reduce((s, x) => s + countPos(x), 0) : 0);
  for (const f of gj.features) total += countPos(f?.geometry?.coordinates);
  out.vertexCount = total;
  out.intersectionsChecked = total <= maxV;
  if (!out.intersectionsChecked) warn(`Controllo delle auto-intersezioni non eseguito: ${total} vertici, oltre il limite di ${maxV}.`);
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity, maxDec = 0;
  const seen = new Map();
  gj.features.forEach((f, i) => {
    const n = i + 1, fIssues = [];
    let fErrors = 0;
    const fe = msg => { err(`Appezzamento ${n}: ${msg}`, i); fIssues.push(msg); fErrors++; };
    const fw = msg => { warn(`Appezzamento ${n}: ${msg}`, i); fIssues.push(msg); };
    const props = isObj(f?.properties) ? f.properties : {};
    const nameKey = NAME_KEYS.find(k => props[k] != null && String(props[k]).trim());
    const name = nameKey ? String(props[nameKey]).slice(0, 80) : `Appezzamento ${n}`;
    const areaKey = AREA_KEYS.find(k => props[k] != null && props[k] !== '' && Number.isFinite(+props[k]));
    const declaredAreaHa = areaKey ? +props[areaKey] : null;
    const rec = { i, name, geom: null, coords: null, areaHa: null, declaredAreaHa, lat: null, lon: null, vertices: 0, valid: false, issues: fIssues };
    out.features.push(rec);
    if (!isObj(f) || f.type !== 'Feature') { fe('non è un oggetto «Feature».'); return; }
    const g = f.geometry;
    if (!isObj(g) || !GEOMS.includes(g.type)) { fe(`geometria «${g?.type ?? 'assente'}» non ammessa: servono Point, MultiPoint, Polygon o MultiPolygon.`); return; }
    rec.geom = g.type;
    let bad = false, fDec = 0, swapped = false;
    const pos = p => {
      if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { bad = true; return null; }
      const [lon, lat] = p;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) { bad = true; if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) swapped = true; return null; }
      fDec = Math.max(fDec, decimalsOf(lon), decimalsOf(lat));
      rec.vertices++;
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      return [lon, lat];
    };
    const ringOf = (r, label) => {
      if (!Array.isArray(r)) { bad = true; return null; }
      const pts = r.map(pos);
      if (pts.some(p => !p)) return null;
      if (pts.length < 4) { fe(`${label} con ${pts.length} posizioni: ne servono almeno 4 (la prima ripetuta in fondo).`); return null; }
      const a = pts[0], z = pts[pts.length - 1];
      if (a[0] !== z[0] || a[1] !== z[1]) { fe(`${label} non chiuso: l’ultima posizione deve essere uguale alla prima.`); return null; }
      for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k][0] - pts[k - 1][0]) > 180) { fw(`${label} attraversa l’antimeridiano: superficie non affidabile.`); break; }
      if (out.intersectionsChecked && ringSelfIntersects(pts)) fe(`${label} si interseca da sé (lati che si incrociano).`);
      return pts;
    };
    const polyOf = (rings, label) => {
      if (!Array.isArray(rings) || !rings.length) { bad = true; return null; }
      const rs = rings.map((r, k) => ringOf(r, k === 0 ? `${label}contorno` : `${label}foro ${k}`));
      if (rs.some(x => !x)) return null;
      if (out.intersectionsChecked) for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) if (ringsCross(rs[a], rs[b])) fe(`${label}foro che tocca o incrocia un altro anello.`);
      return rs;
    };
    let coords = null, area = null, centre = null;
    if (g.type === 'Point') {
      const p = pos(g.coordinates);
      if (p) { coords = p; centre = p; }
    } else if (g.type === 'MultiPoint') {
      const ps = Array.isArray(g.coordinates) ? g.coordinates.map(pos) : [];
      if (ps.length && ps.every(Boolean)) { coords = ps; centre = [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]; }
      else bad = true;
    } else if (g.type === 'Polygon') {
      const rs = polyOf(g.coordinates, '');
      if (rs) { coords = rs; area = polygonAreaHa(rs); centre = centroid(rs[0]); }
    } else {
      const ps = Array.isArray(g.coordinates) ? g.coordinates.map((rings, k) => polyOf(rings, `parte ${k + 1}, `)) : [];
      if (ps.length && ps.every(Boolean)) { coords = ps; area = ps.reduce((s, rs) => s + polygonAreaHa(rs), 0); centre = centroid(ps[0][0]); }
      else if (!ps.length) bad = true;
    }
    if (bad) fe(swapped ? 'coordinate fuori dai limiti WGS-84: forse latitudine e longitudine sono invertite (l’ordine corretto è longitudine, latitudine).' : 'coordinate mancanti o fuori dai limiti WGS-84 (longitudine ±180, latitudine ±90).');
    if (!coords) return;
    rec.coords = coords;
    rec.lon = centre ? r6(centre[0]) : null;
    rec.lat = centre ? r6(centre[1]) : null;
    maxDec = Math.max(maxDec, fDec);
    if (fDec < MIN_DECIMALS) fw(`coordinate con ${fDec} decimali: il regolamento ne chiede almeno ${MIN_DECIMALS} (circa 10 cm).`);
    if (g.type === 'Point' || g.type === 'MultiPoint') {
      rec.areaHa = declaredAreaHa;
      if (declaredAreaHa == null) fw('superficie non dichiarata: il sistema UE assume 4 ha; sotto i 4 ha indicate la superficie, da 4 ha in su serve il poligono.');
      else if (declaredAreaHa >= POINT_MAX_HA) fe(`punto con superficie dichiarata di ${fmt(declaredAreaHa)} ha: da 4 ha in su serve il poligono del confine.`);
    } else {
      rec.areaHa = Math.round(area * 1000) / 1000;
      if (area < 0.01) fw('superficie inferiore a 0,01 ha: verificare le coordinate.');
      if (declaredAreaHa != null && declaredAreaHa > 0 && Math.abs(area - declaredAreaHa) / declaredAreaHa > 0.1) fw(`superficie calcolata ${fmt(area)} ha, dichiarata ${fmt(declaredAreaHa)} ha (differenza oltre il 10%).`);
    }
    const key = g.type + ':' + JSON.stringify(coords, (k, v) => (typeof v === 'number' ? r6(v) : v));
    if (seen.has(key)) fe(`uguale all’appezzamento ${seen.get(key) + 1}.`);
    else seen.set(key, i);
    rec.valid = fErrors === 0;
  });
  out.maxDecimals = out.features.some(f => f.coords) ? maxDec : null;
  out.totalAreaHa = Math.round(out.features.reduce((s, f) => s + (f.areaHa || 0), 0) * 1000) / 1000;
  out.bbox = Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
  out.ok = !issues.some(x => x.level === 'errore');
  return out;
}
const fmt = v => (Math.round(v * 100) / 100).toString().replace('.', ',');
function centroid(ring) {
  const pts = ring.slice(0, -1);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Appezzamenti salvati (righe di eudrPlots con coords) → FeatureCollection GeoJSON in testo. */
export function plotsToGeoJSON(plots, meta = {}) {
  const features = (Array.isArray(plots) ? plots : []).filter(p => p && p.coords && GEOMS.includes(p.geom)).map(p => ({
    type: 'Feature',
    properties: { ProductionPlace: p.name || '', ...(p.geom === 'Point' || p.geom === 'MultiPoint' ? (p.areaHa != null ? { Area: p.areaHa } : {}) : { Area: p.areaHa ?? null }), ...(meta.producer ? { ProducerName: meta.producer } : {}), ...(meta.country ? { ProducerCountry: meta.country } : {}) },
    geometry: { type: p.geom, coordinates: p.coords },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 1);
}

/** Lunghezza «tonda» della barra di scala (metri) vicina a target. */
function niceMeters(target) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  let best = steps[0];
  for (const s of steps) if (s <= target) best = s;
  return best;
}

/**
 * Modello della mappa degli appezzamenti (proiezione equirettangolare adattata al riquadro, nessuna mappa di sfondo):
 * features = [{geom, coords, name, valid, areaHa}] → { width, height, shapes: [{kind:'area'|'punto', d|cx,cy,r, label, lx, ly, valid, i}],
 * scale: {px, label}, bbox, corners: {nw, se} } oppure null senza coordinate.
 */
export function plotMapModel(features, { width = 640, height = 360, pad = 30 } = {}) {
  const fs = (Array.isArray(features) ? features : []).filter(f => f && f.coords && GEOMS.includes(f.geom));
  const all = [];
  const walk = c => { if (Array.isArray(c) && typeof c[0] === 'number') all.push(c); else if (Array.isArray(c)) c.forEach(walk); };
  fs.forEach(f => walk(f.coords));
  if (!all.length) return null;
  let minLon = Math.min(...all.map(p => p[0])), maxLon = Math.max(...all.map(p => p[0]));
  let minLat = Math.min(...all.map(p => p[1])), maxLat = Math.max(...all.map(p => p[1]));
  const latMid = (minLat + maxLat) / 2, kx = Math.max(0.05, Math.cos(rad(latMid)));
  const minSpan = 0.004; // circa 400 m: un solo punto resta leggibile
  if ((maxLon - minLon) * kx < minSpan) { const c = (minLon + maxLon) / 2, h = minSpan / kx / 2; minLon = c - h; maxLon = c + h; }
  if (maxLat - minLat < minSpan) { const c = (minLat + maxLat) / 2; minLat = c - minSpan / 2; maxLat = c + minSpan / 2; }
  const spanX = (maxLon - minLon) * kx, spanY = maxLat - minLat;
  const s = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (width - spanX * s) / 2, oy = (height - spanY * s) / 2;
  const P = ([lon, lat]) => [ox + (lon - minLon) * kx * s, oy + (maxLat - lat) * s];
  const r1 = v => Math.round(v * 10) / 10;
  const ringD = ring => ring.map((p, k) => { const [x, y] = P(p); return (k ? 'L' : 'M') + r1(x) + ' ' + r1(y); }).join('') + 'Z';
  const shapes = [];
  fs.forEach((f, k) => {
    const i = f.i ?? k, label = f.name || `Appezzamento ${i + 1}`, valid = f.valid !== false;
    if (f.geom === 'Point' || f.geom === 'MultiPoint') {
      const pts = f.geom === 'Point' ? [f.coords] : f.coords;
      const mPerPx = (EARTH_R * Math.PI / 180) / s;
      const rM = f.areaHa > 0 ? Math.sqrt((f.areaHa * 10000) / Math.PI) : 0;
      const r = Math.max(5, Math.min(40, rM / mPerPx));
      pts.forEach((p, j) => { const [cx, cy] = P(p); const above = cy - r - 6; shapes.push({ kind: 'punto', cx: r1(cx), cy: r1(cy), r: r1(r), label, lx: r1(cx), ly: r1(above >= 14 ? above : cy + r + 14), valid, i, key: `${i}-${j}` }); });
    } else {
      const polys = f.geom === 'Polygon' ? [f.coords] : f.coords;
      const d = polys.map(rs => rs.map(ringD).join('')).join('');
      const c = centroid(polys[0][0]);
      const [lx, ly] = c ? P(c) : [0, 0];
      shapes.push({ kind: 'area', d, label, lx: r1(lx), ly: r1(ly), valid, i, key: String(i) });
    }
  });
  const mPerPx = (EARTH_R * Math.PI / 180) / s;
  const len = niceMeters(mPerPx * Math.min(140, width / 4));
  return { width, height, shapes, scale: { px: r1(len / mPerPx), label: len >= 1000 ? `${len / 1000} km` : `${len} m` }, bbox: [minLon, minLat, maxLon, maxLat],
    corners: { nw: `${r6(maxLat).toFixed(4)}°, ${r6(minLon).toFixed(4)}°`, se: `${r6(minLat).toFixed(4)}°, ${r6(maxLon).toFixed(4)}°` } };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Mappa degli appezzamenti come SVG autonomo (testo), con i colori del tema e un ripiego per l'uso fuori da FeedOS. */
export function plotMapSvg(features, opts = {}) {
  const m = plotMapModel(features, opts);
  if (!m) return '';
  const { width: W, height: H } = m;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.title || 'Mappa degli appezzamenti')}" font-family="sans-serif" font-size="11">`,
    `<rect width="${W}" height="${H}" fill="var(--surface-2, #F3F6F2)"/>`];
  for (const sh of m.shapes) {
    const stroke = sh.valid ? 'var(--accent, #1D6B45)' : 'var(--crit, #D03B3B)', fill = sh.valid ? 'var(--accent-soft, #DCEBE1)' : 'var(--crit-soft, #F8DEDC)';
    if (sh.kind === 'area') parts.push(`<path d="${sh.d}" fill="${fill}" fill-opacity="0.8" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.6"/>`);
    else parts.push(`<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r}" fill="${fill}" fill-opacity="0.8" stroke="${stroke}" stroke-width="1.6"/>`);
    parts.push(`<text x="${sh.lx}" y="${sh.ly}" text-anchor="middle" fill="var(--ink, #101A14)">${esc(sh.label)}</text>`);
  }
  parts.push(`<g fill="var(--ink-2, #405048)"><rect x="12" y="${H - 18}" width="${m.scale.px}" height="3"/><text x="12" y="${H - 22}">${esc(m.scale.label)}</text>`,
    `<text x="${W - 12}" y="16" text-anchor="end">N ↑</text><text x="12" y="16">${esc(m.corners.nw)}</text><text x="${W - 12}" y="${H - 8}" text-anchor="end">${esc(m.corners.se)}</text></g></svg>`);
  return parts.join('');
}
