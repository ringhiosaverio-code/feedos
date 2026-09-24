/* FeedOS 16 · scambio di file: scaricamento, CSV all'italiana (punto e virgola, virgola decimale), lettura file. */

/** Scarica un contenuto come file (funziona offline, senza server). */
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const q = v => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** CSV con separatore «;» e BOM, leggibile da Excel in italiano. cols: [{key|value(row), label}] */
export function toCSV(rows, cols) {
  const head = cols.map(c => q(c.label)).join(';');
  const body = rows.map(r => cols.map(c => q(c.value ? c.value(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

/** Lettura CSV tollerante: separatore «;» o «,» o tabulazione, virgolette, numeri con virgola decimale. */
export function parseCSV(text) {
  const t = String(text).replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!clean.length) return { header: [], rows: [] };
  const header = clean[0].map(h => h.trim());
  return { header, rows: clean.slice(1).map(r => Object.fromEntries(header.map((h, k) => [h, (r[k] ?? '').trim()]))) };
}

/** Numero da testo italiano o internazionale: «1.234,5» · «1234.5» · «12,3 %». */
export function num(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let x = String(s).trim().replace(/[€%\s]/g, '');
  if (!x) return null;
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (x.includes(',')) x = x.replace(',', '.');
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

export function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file); });
}

export function stamp() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
