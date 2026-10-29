/* FeedOS 18 · ESG › Obiettivi e piano: elementi condivisi delle sottosezioni (numeri, esportazioni, curva dei costi di abbattimento
 * con barre di larghezza variabile, barra di avanzamento). Prefisso CSS epi-. Grafici sottili, colori delle serie del tema. */
import React, { useRef, useState } from 'react';
import { nf } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { getPrefs } from '../core/prefs.js';
import { ROLES } from '../core/roles.js';
import { niceTicks } from '../ui/charts.jsx';
import { useWidth, Chip } from '../ui/ui.jsx';

export const fin = v => v != null && v !== '' && Number.isFinite(+v);
/** Numero con decimali scelti (— se manca). */
export const n = (v, d = 0) => (fin(v) ? nf(+v, d) : '—');
/** Euro senza decimali. */
export const eurTxt = v => (fin(v) ? `${nf(+v)} €` : '—');
/** Frazione come percentuale. */
export const pctTxt = (v, d = 0) => (fin(v) ? `${nf(+v * 100, d)}%` : '—');
/** Valore con l'unità (le percentuali senza spazio). */
export const withUnit = (v, unit, d = 1) => (fin(v) ? (unit === '%' ? `${nf(+v, d)}%` : `${nf(+v, d)} ${unit || ''}`.trim()) : '—');
/** Autore di una modifica: il ruolo scelto nella testata. */
export const authorNow = () => { const r = getPrefs().role; return ROLES.find(x => x.id === r)?.short || 'Direzione'; };
export function downloadCsv(name, rows, cols) { download(`feedos-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime) { download(`feedos-${name}-${stamp()}.${ext}`, text, mime); }

const STATE = { onTrack: ['good', 'in linea'], offTrack: ['warn', 'in ritardo'], achieved: ['good', 'raggiunto'], unknown: ['outline', 'non disponibile'] };
/** Stato di un obiettivo. */
export function TargetState({ s }) { const [k, l] = STATE[s] || STATE.unknown; return <Chip kind={k}>{l}</Chip>; }
const MST = { idea: 'outline', approvata: 'accent', 'in corso': 'violet', completata: 'good', scartata: 'outline' };
/** Stato di una misura. */
export function MeasureState({ s }) { return <Chip kind={MST[s] || 'outline'}>{s || '—'}</Chip>; }

/** Barra di avanzamento sottile (0-1), senza colori decorativi. */
export function ProgressBar({ value, label }) {
  const v = fin(value) ? Math.max(0, Math.min(1, +value)) : null;
  return (
    <span className="epi-prog" role="img" aria-label={label || (v == null ? 'avanzamento non disponibile' : `avanzamento ${nf(v * 100)}%`)}>
      <span className="epi-prog-t"><span className="epi-prog-f" style={{ width: `${v == null ? 0 : v * 100}%` }} /></span>
      <span className="epi-prog-l">{v == null ? '—' : `${nf(v * 100)}%`}</span>
    </span>
  );
}

/**
 * Curva dei costi marginali di abbattimento: una barra per misura, larga quanto le t CO₂e l'anno e alta quanto il costo in €/t.
 * La linea orizzontale è il prezzo del carbonio: le barre sotto la linea hanno VAN positivo a quel prezzo.
 * bars: [{id, label, x0, x1, tco2, mac}] (da maccCurve), price: €/t.
 */
export function MaccChart({ bars, price, height = 280, ariaLabel = 'Curva dei costi marginali di abbattimento' }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  if (!bars.length) return null;
  const total = bars[bars.length - 1].x1;
  const lo = Math.min(0, ...bars.map(b => b.mac), fin(price) ? +price : 0), hi = Math.max(0, ...bars.map(b => b.mac), fin(price) ? +price : 0);
  // le misure molto care schiacciano le altre: la scala si ferma a 3 volte il prezzo (le barre oltre sono tagliate e marcate)
  const cap = fin(price) && price > 0 ? Math.max(price * 3, 50) : null;
  const top = cap != null ? Math.min(hi, cap) : hi;
  const ticks = niceTicks(lo, top, 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const padL = Math.max(40, 8 + 7 * nf(y1).length), padR = 16, padT = 16, padB = 48;
  const x = v => padL + v / (total || 1) * (W - padL - padR);
  const y = v => padT + (y1 - Math.max(y0, Math.min(y1, v))) / ((y1 - y0) || 1) * (height - padT - padB);
  const xt = niceTicks(0, total, Math.max(2, Math.floor((W - padL) / 90)));
  const h = hover != null ? bars[hover] : null;
  return (
    <div className="chart epi-macc" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} className="epi-ax" x={padL - 8} y={y(t) + 4} textAnchor="end">{nf(t)}</text>)}
        {xt.filter(t => t <= total).map(t => <text key={'x' + t} className="epi-ax" x={x(t)} y={height - 28} textAnchor={t === 0 ? 'start' : 'middle'}>{nf(t)}</text>)}
        {bars.map((b, i) => {
          const ok = fin(price) && b.mac <= price;
          const ya = y(Math.max(0, b.mac)), yb = y(Math.min(0, b.mac));
          const w = Math.max(1, x(b.x1) - x(b.x0) - 1);
          return (
            <g key={b.id} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${i + 1}. ${b.label}: ${nf(b.tco2, 1)} t CO₂e l’anno, ${nf(b.mac)} € per t`}>
              <rect x={x(b.x0)} y={ya} width={w} height={Math.max(1, yb - ya)} className={ok ? 'epi-bar-ok' : 'epi-bar-ko'} opacity={hover == null || hover === i ? 1 : 0.55} />
              {cap != null && b.mac > top && <line x1={x(b.x0)} x2={x(b.x0) + w} y1={padT + 1} y2={padT + 1} className="epi-cut" />}
              {w >= 16 && <text className="epi-ax" x={x(b.x0) + w / 2} y={b.mac >= 0 ? ya - 4 : yb + 12} textAnchor="middle">{i + 1}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="epi-zero" />
        {fin(price) && <line x1={padL} x2={W - padR} y1={y(price)} y2={y(price)} className="epi-price" />}
        <text className="epi-ax" x={padL} y={height - 6} textAnchor="start">t CO₂e l’anno, cumulate</text>
      </svg>
      {h && <div className="tip" style={{ left: Math.min(Math.max(x((h.x0 + h.x1) / 2), 100), W - 100), top: 8 }} role="status">
        <div className="muted xs">{hover + 1}. {h.label}</div>
        <div className="r"><span className="small">Riduzione</span><span className="epi-strong">{nf(h.tco2, 1)} t CO₂e/anno</span></div>
        <div className="r"><span className="small">Costo di abbattimento</span><span className="epi-strong">{nf(h.mac)} €/t</span></div>
      </div>}
    </div>
  );
}
