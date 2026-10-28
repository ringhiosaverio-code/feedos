/* FeedOS 18 · ESG › Impronta mangimi: elementi condivisi dalle sottosezioni (numeri, etichette di provenienza e qualità del dato,
 * esportazioni). Prefisso CSS epc-. Nessuno stato proprio. */
import React from 'react';
import { nf } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { store, toast } from '../core/store.js';
import { Chip } from '../ui/ui.jsx';

export const kgTxt = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, Math.abs(v) < 10 ? 1 : 0));
export const tTxt = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, Math.abs(v) < 10 ? 1 : 0));
export const pctTxt = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v * 100, d)}%`);
export const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
/** Scarica righe in CSV (separatore punto e virgola, virgola decimale). */
export function downloadCsv(name, rows, cols) { return download(`feedos-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime = 'text/plain;charset=utf-8') { return download(`feedos-${name}-${stamp()}.${ext}`, text, mime); }
export function downloadJson(name, obj) { return download(`feedos-${name}-${stamp()}.json`, JSON.stringify(obj, null, 2), 'application/json'); }
export const shortName = s => String(s || '').replace(/ \((demo|fantasia)\)/g, '');

const SRC = { fornitore: ['good', 'fornitore', 'Impronta dichiarata dal fornitore (dato primario)'], registro: ['accent', 'registro', 'Registro dei fattori: origine, banca dati, anno'],
  anagrafica: ['warn', 'anagrafica', 'Valore dell’anagrafica senza fonte (qualità 5)'], letteratura: ['violet', 'letteratura', 'Valore di letteratura del pacchetto, da sostituire con la banca dati'], mancante: ['crit', 'mancante', 'Nessun fattore'] };
/** Provenienza del fattore di una materia prima. */
export function SourceChip({ source }) {
  const [k, l, t] = SRC[source] || ['outline', source || '—', ''];
  return <Chip kind={k} title={t}>{l}</Chip>;
}
/** Qualità del dato (DQR 1 ottima … 5 scarsa). */
export function DqrChip({ q }) {
  if (q == null || !Number.isFinite(+q)) return <Chip kind="outline">DQR —</Chip>;
  const k = q <= 2 ? 'good' : q <= 3 ? 'accent' : q <= 4 ? 'warn' : 'crit';
  return <Chip kind={k} title="Qualità del dato secondo la PEF: 1 ottima, 5 scarsa">DQR {nf(q, 1)}</Chip>;
}
/** Stato di una fotografia pubblicata. */
export function SnapChip({ snap, alert }) {
  if (!snap) return <Chip kind="outline">non pubblicata</Chip>;
  if (alert) return <Chip kind="warn" title={alert.reasons.map(r => r.text).join('; ')}>da ricalcolare</Chip>;
  return <Chip kind="good" title={`Pubblicata il ${snap.publishedAt}`}>pubblicata</Chip>;
}
/** Banda P10–P90 in linea (barra con il valore centrale). */
export function Band({ p10, p90, value, max }) {
  if (![p10, p90, value].every(v => Number.isFinite(+v)) || !(max > 0)) return <span className="muted">—</span>;
  const x = v => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <span className="epc-band" title={`P10 ${nf(p10)} · P90 ${nf(p90)} kg CO₂e/t`} aria-label={`intervallo da ${nf(p10)} a ${nf(p90)} kg CO₂e per tonnellata`}>
      <span className="epc-band-r" style={{ left: x(p10), width: `calc(${x(p90)} - ${x(p10)})` }} />
      <span className="epc-band-v" style={{ left: x(value) }} />
    </span>
  );
}
