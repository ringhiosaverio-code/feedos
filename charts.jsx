/* FeedOS 16 · grafici SVG: una sola scala per segni, tacche ed etichette; testo con i colori del tema;
 * segni sottili, griglia leggera, suggerimento al passaggio e alla messa a fuoco. */
import React, { useRef, useState, useMemo } from 'react';
import { nf } from '../core/util.js';
import { useWidth } from './ui.jsx';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const span = max - min, step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0)), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step * 0.5; v += step) out.push(Math.round(v / step) * step);
  return out;
}
const dec = step => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.title && <div className="muted xs">{tip.title}</div>}
      {tip.rows.map((r, i) => <div key={i} className="r"><span className="row gap-s">{r.color && <i className="key" style={{ background: r.color }} />}<span className="small">{r.label}</span></span><b>{r.value}</b></div>)}
    </div>
  );
}

/**
 * Linee (una o più serie) con banda opzionale e linee di riferimento.
 * series: [{key,label,color,values:[number|null], dashed}], labels: [string] (asse x), band: {lo:[],hi:[],label}
 * refs: [{y,label,kind:'crit'|'muted'}]
 */
export function LineChart({ series, labels, height = 220, unit = '', decimals = 1, band, refs = [], yMin, yMax, xEvery, area = true, ariaLabel, markLast = true, formatX = x => x }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const n = labels.length;
  const all = [...series.flatMap(s => s.values), ...(band ? [...band.lo, ...band.hi] : []), ...refs.map(r => r.y)].filter(v => v != null && Number.isFinite(v));
  if (!all.length) all.push(0, 1);
  const mn = yMin ?? Math.min(...all), mx = yMax ?? Math.max(...all);
  const ticks = niceTicks(mn, mx, height < 180 ? 3 : 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const tickDec = Math.max(0, dec(ticks[1] - ticks[0]));
  const padL = Math.max(34, 8 + 7 * nf(hi, tickDec).length), padR = Math.max(markLast ? 58 : 14, refs.length ? 8 + 6.2 * Math.max(...refs.map(r => String(r.label || '').length)) : 0), padT = 12, padB = 24;
  const x = i => padL + (n <= 1 ? 0 : i * (W - padL - padR) / (n - 1));
  const y = v => padT + (hi - v) / (hi - lo || 1) * (height - padT - padB);
  const path = vals => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null || !Number.isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; }); return d; };
  const every = xEvery || Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL - padR) / 64))));
  const onMove = e => {
    const r = box.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - padL) / ((W - padL - padR) / Math.max(1, n - 1)))));
    setHover(i);
  };
  const tip = hover != null ? {
    x: Math.min(Math.max(x(hover), 90), W - 90), y: padT + 4, title: formatX(labels[hover]),
    rows: [...series.map(s => ({ color: s.color, label: s.label, value: s.values[hover] == null ? '—' : nf(s.values[hover], decimals) + (unit ? ' ' + unit : '') })),
      ...(band ? [{ label: band.label || 'Banda', value: band.lo[hover] == null ? '—' : `${nf(band.lo[hover], decimals)}–${nf(band.hi[hover], decimals)}` }] : [])],
  } : null;
  return (
    <div className="chart" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel || series.map(s => s.label).join(', ')} style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t, tickDec)}</text>)}
        {labels.map((l, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every * 0.6) ? <text key={'x' + i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{formatX(l)}</text> : null)}
        {band && (() => { const ids = band.hi.map((v, i) => (v != null && band.lo[i] != null ? i : -1)).filter(i => i >= 0); if (ids.length < 2) return null;
          return <path d={ids.map((i, k) => (k ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(band.hi[i]).toFixed(1)).join('') + [...ids].reverse().map(i => 'L' + x(i).toFixed(1) + ' ' + y(band.lo[i]).toFixed(1)).join('') + 'Z'} fill={band.color || series[0]?.color || 'var(--s1)'} opacity=".14" />; })()}
        {refs.map((r, i) => <g key={'r' + i}><line x1={padL} x2={W - padR} y1={y(r.y)} y2={y(r.y)} stroke={r.kind === 'crit' ? 'var(--crit)' : 'var(--ink-2)'} strokeWidth="1.2" opacity={r.kind === 'crit' ? .9 : .5} /><text x={W - padR + 4} y={y(r.y) + 3.5} className="lbl-ink" style={{ fill: r.kind === 'crit' ? 'var(--crit-ink)' : undefined }}>{r.label}</text></g>)}
        {series.map((s, k) => (
          <g key={s.key || k}>
            {area && series.length === 1 && lastIdx(s.values) >= 0 && <path d={path(s.values) + `L${x(lastIdx(s.values))} ${height - padB}L${x(firstIdx(s.values))} ${height - padB}Z`} fill={s.color} opacity=".08" />}
            {lastIdx(s.values) >= 0 && <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />}
            {markLast && lastIdx(s.values) >= 0 && <><circle cx={x(lastIdx(s.values))} cy={y(s.values[lastIdx(s.values)])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              {series.length <= 3 && <text x={x(lastIdx(s.values)) + 8} y={y(s.values[lastIdx(s.values)]) + 4} className="lbl-strong">{nf(s.values[lastIdx(s.values)], decimals)}</text>}</>}
          </g>
        ))}
        {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} stroke="var(--ink-2)" strokeWidth="1" opacity=".45" />
          {series.map((s, k) => s.values[hover] != null && <circle key={k} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}</g>}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
const lastIdx = v => { for (let i = v.length - 1; i >= 0; i--) if (v[i] != null && Number.isFinite(v[i])) return i; return -1; };
const firstIdx = v => v.findIndex(x => x != null && Number.isFinite(x));

/** Barre orizzontali (una serie, valori all'estremità). data: [{key,label,value,color,note}] */
export function Bars({ data, unit = '', decimals = 0, rowH = 26, max, ariaLabel, onClick, color = 'var(--s1)', labelW }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const mx = max ?? Math.max(...data.map(d => Math.abs(d.value)), 0);
  const LW = labelW ?? Math.min(220, Math.max(90, W * 0.36));
  const vW = 70;
  const bw = v => Math.max(0, (W - LW - vW - 8) * Math.abs(v) / (mx || 1));
  const H = data.length * rowH + 4;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }}>
        {data.map((d, i) => {
          const y0 = i * rowH + 4, bh = Math.min(16, rowH - 10);
          return (
            <g key={d.key || i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={onClick ? () => onClick(d) : undefined} style={{ cursor: onClick ? 'pointer' : undefined }}>
              <rect className="hit" x="0" y={y0 - 3} width={W} height={rowH} />
              <text x={LW - 8} y={y0 + bh / 2 + 4} textAnchor="end" className="lbl-ink">{trunc(d.label, Math.floor(LW / 6.4))}</text>
              <rect x={LW} y={y0} width={Math.max(2, bw(d.value))} height={bh} rx="4" fill={d.color || color} opacity={hover == null || hover === i ? 1 : .55} />
              <text x={LW + bw(d.value) + 6} y={y0 + bh / 2 + 4} className="lbl-strong">{nf(d.value, decimals)}{unit ? ' ' + unit : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function trunc(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; }

/** Colonne verticali, anche impilate. cols: [{label, parts:[{key,value}]}], keys: [{key,label,color}] */
export function Columns({ cols, keys, height = 220, unit = '', decimals = 0, ariaLabel, refLine, every }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const totals = cols.map(c => c.parts.reduce((s, p) => s + Math.max(0, p.value || 0), 0));
  const ticks = niceTicks(0, Math.max(...totals, refLine?.y || 0), 4);
  const hi = ticks[ticks.length - 1];
  const tickDec = dec(ticks[1] - ticks[0]);
  const padL = Math.max(34, 8 + 7 * nf(hi, tickDec).length), padR = 10, padT = 12, padB = 24;
  const n = cols.length;
  const slot = (W - padL - padR) / Math.max(1, n);
  const bw = Math.min(24, slot * 0.7);
  const y = v => padT + (hi - v) / (hi || 1) * (height - padT - padB);
  const ev = every || Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL) / 56))));
  const tip = hover != null ? { x: Math.min(Math.max(padL + slot * (hover + .5), 90), W - 90), y: padT, title: cols[hover].label, rows: [...keys.map(k => ({ color: k.color, label: k.label, value: nf(cols[hover].parts.find(p => p.key === k.key)?.value || 0, decimals) + (unit ? ' ' + unit : '') })), ...(keys.length > 1 ? [{ label: 'Totale', value: nf(totals[hover], decimals) + (unit ? ' ' + unit : '') }] : [])] } : null;
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t, tickDec)}</text>)}
        {cols.map((c, i) => {
          let acc = 0;
          const cx = padL + slot * (i + .5);
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} />
              {keys.map((k, j) => {
                const v = Math.max(0, c.parts.find(p => p.key === k.key)?.value || 0);
                if (!v) return null;
                const y1 = y(acc + v), y2 = y(acc); acc += v;
                const top = j === keys.length - 1 || keys.slice(j + 1).every(kk => !(c.parts.find(p => p.key === kk.key)?.value > 0));
                const h = Math.max(1, y2 - y1 - (j > 0 ? 2 : 0));
                return top ? <path key={k.key} d={roundTop(cx - bw / 2, y1, bw, h, 4)} fill={k.color} opacity={hover == null || hover === i ? 1 : .6} />
                  : <rect key={k.key} x={cx - bw / 2} y={y1} width={bw} height={h} fill={k.color} opacity={hover == null || hover === i ? 1 : .6} />;
              })}
              {(i % ev === 0) && <text x={cx} y={height - 6} textAnchor="middle">{c.label}</text>}
            </g>
          );
        })}
        {refLine && <g><line x1={padL} x2={W - padR} y1={y(refLine.y)} y2={y(refLine.y)} stroke="var(--crit)" strokeWidth="1.2" /><text x={W - padR} y={y(refLine.y) - 5} textAnchor="end" style={{ fill: 'var(--crit-ink)' }} className="lbl-ink">{refLine.label}</text></g>}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
function roundTop(x, y, w, h, r) { r = Math.min(r, h, w / 2); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; }

/** Barra impilata orizzontale al 100% (composizione). parts: [{key,label,value,color}] */
export function StackBar({ parts, height = 22, showLabels = true, ariaLabel, unit = '%' }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const tot = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  let x = 0;
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        {parts.map((p, i) => {
          const w = Math.max(0, p.value) / tot * W;
          const x0 = x; x += w;
          const label = `${p.label} ${nf(p.value / tot * 100, 0)}%`;
          const fits = showLabels && w > label.length * 6.3 + 12;
          return (
            <g key={p.key || i} onPointerEnter={() => setHover(i)}>
              <rect x={x0 + (i ? 1 : 0)} y="0" width={Math.max(0, w - (i ? 2 : 0))} height={height} rx={i === 0 || i === parts.length - 1 ? 4 : 0} fill={p.color} opacity={hover == null || hover === i ? 1 : .7} />
              {fits && <text x={x0 + 8} y={height / 2 + 4} style={{ fill: '#fff', fontWeight: 700 }}>{label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && <Tip tip={{ x: Math.min(Math.max(20, parts.slice(0, hover).reduce((s, p) => s + p.value, 0) / tot * W + parts[hover].value / tot * W / 2), W - 20), y: 0, rows: [{ color: parts[hover].color, label: parts[hover].label, value: `${nf(parts[hover].value / tot * 100, 1)}%` + (parts[hover].abs != null ? ` · ${parts[hover].abs}` : '') }] }} />}
    </div>
  );
}

/** Cascata: dal prezzo al margine, o dal costo delle materie prime al costo pieno. steps: [{label,value,kind:'total'|'neg'|'pos'}] */
export function Waterfall({ steps, height = 240, unit = '€/t', decimals = 2, ariaLabel }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  let run = 0;
  const bars = steps.map(s => {
    if (s.kind === 'total') { const b = { ...s, from: 0, to: s.value }; run = s.value; return b; }
    const from = run; run += s.value; return { ...s, from, to: run };
  });
  const vals = bars.flatMap(b => [b.from, b.to]);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const padL = 44, padR = 8, padT = 18, padB = 40;
  const n = bars.length, slot = (W - padL - padR) / n, bw = Math.min(40, slot * 0.62);
  const y = v => padT + (hi - v) / (hi - lo || 1) * (height - padT - padB);
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t)}</text>)}
        {bars.map((b, i) => {
          const cx = padL + slot * (i + .5);
          const top = Math.min(y(b.from), y(b.to)), h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
          const col = b.kind === 'total' ? 'var(--ink-2)' : b.value < 0 ? 'var(--s2)' : 'var(--s3)';
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} />
              <rect x={cx - bw / 2} y={top} width={bw} height={h} rx="3" fill={b.color || col} opacity={hover == null || hover === i ? 1 : .6} />
              {i < n - 1 && <line x1={cx + bw / 2} x2={cx + slot - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke="var(--axis)" strokeWidth="1" />}
              <text x={cx} y={top - 5} textAnchor="middle" className="lbl-strong" style={{ fontSize: 11 }}>{b.kind === 'total' ? nf(b.value, 0) : (b.value > 0 ? '+' : '−') + nf(Math.abs(b.value), b.value > -10 && b.value < 10 ? 1 : 0)}</text>
              <text x={cx} y={height - 24} textAnchor="middle" className="lbl-ink" style={{ fontSize: 10.5 }}>{wrap(b.label)[0]}</text>
              <text x={cx} y={height - 11} textAnchor="middle" className="lbl-ink" style={{ fontSize: 10.5 }}>{wrap(b.label)[1]}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && <Tip tip={{ x: Math.min(Math.max(padL + slot * (hover + .5), 90), W - 90), y: padT, rows: [{ label: bars[hover].label, value: nf(bars[hover].value, decimals) + ' ' + unit }] }} />}
    </div>
  );
}
function wrap(s) { const w = String(s).split(' '); if (w.length < 2 || s.length < 12) return [s, '']; const mid = Math.ceil(w.length / 2); return [w.slice(0, mid).join(' '), w.slice(mid).join(' ')]; }

/** Sensibilità a tornado. rows: [{label, lo, hi, loLabel, hiLabel}], base */
export function Tornado({ rows, base, unit = '', decimals = 2, ariaLabel }) {
  const box = useRef(null);
  const W = useWidth(box);
  const vals = rows.flatMap(r => [r.lo, r.hi, base]);
  const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.12 || 1;
  const LW = Math.min(200, W * 0.34), padR = 20;
  const x = v => LW + (v - (mn - pad)) / ((mx + pad) - (mn - pad)) * (W - LW - padR);
  const rowH = 34, H = rows.length * rowH + 28;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }}>
        <line x1={x(base)} x2={x(base)} y1={4} y2={H - 20} stroke="var(--ink-2)" strokeWidth="1.2" />
        <text x={x(base)} y={H - 6} textAnchor="middle" className="lbl-ink">{nf(base, decimals)} {unit}</text>
        {rows.map((r, i) => {
          const y0 = 8 + i * rowH;
          const a = Math.min(r.lo, r.hi), b = Math.max(r.lo, r.hi);
          return (
            <g key={i}>
              <text x={LW - 8} y={y0 + 15} textAnchor="end" className="lbl-ink">{trunc(r.label, Math.floor(LW / 6.3))}</text>
              <rect x={x(a)} y={y0 + 4} width={Math.max(2, x(b) - x(a))} height="16" rx="4" fill="var(--s1)" opacity=".85" />
              <text x={x(a) - 5} y={y0 + 16} textAnchor="end" style={{ fontSize: 10.5 }}>{nf(a, decimals)}</text>
              <text x={x(b) + 5} y={y0 + 16} style={{ fontSize: 10.5 }}>{nf(b, decimals)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Punti collegati (frontiera costo–emissioni). points: [{x,y,label,active}] */
export function Frontier({ points, current, xLabel, yLabel, xDec = 0, yDec = 2, height = 250, ariaLabel, onPick }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const xs = [...points.map(p => p.x), ...(current ? [current.x] : [])], ys = [...points.map(p => p.y), ...(current ? [current.y] : [])];
  const tx = niceTicks(Math.min(...xs), Math.max(...xs), 4), ty = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const padL = 48, padR = 14, padT = 24, padB = 38;
  const x = v => padL + (v - tx[0]) / (tx[tx.length - 1] - tx[0] || 1) * (W - padL - padR);
  const y = v => padT + (ty[ty.length - 1] - v) / (ty[ty.length - 1] - ty[0] || 1) * (height - padT - padB);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <g className="grid">{ty.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ty.map(t => <text key={'y' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t, dec(ty[1] - ty[0]))}</text>)}
        {tx.map(t => <text key={'x' + t} x={x(t)} y={height - 22} textAnchor="middle">{nf(t, dec(tx[1] - tx[0]))}</text>)}
        <text x={(padL + W - padR) / 2} y={height - 5} textAnchor="middle" className="lbl-ink">{xLabel}</text>
        <text x={padL - 6} y={10} textAnchor="end" className="lbl-ink">{yLabel}</text>
        <path d={sorted.map((p, i) => (i ? 'L' : 'M') + x(p.x) + ' ' + y(p.y)).join('')} fill="none" stroke="var(--s3)" strokeWidth="2" />
        {current && <g><path d={`M${x(current.x)} ${y(current.y) - 7}L${x(current.x) + 7} ${y(current.y)}L${x(current.x)} ${y(current.y) + 7}L${x(current.x) - 7} ${y(current.y)}Z`} fill="var(--maize)" stroke="var(--surface)" strokeWidth="2" /><text x={x(current.x) - 10} y={y(current.y) - 9} textAnchor="end" className="lbl-strong">{current.label}</text></g>}
        {points.map((p, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onClick={onPick ? () => onPick(p, i) : undefined} style={{ cursor: onPick ? 'pointer' : undefined }}>
            <circle cx={x(p.x)} cy={y(p.y)} r="13" className="hit" />
            <circle cx={x(p.x)} cy={y(p.y)} r={p.active ? 6.5 : 4.5} fill={p.active ? 'var(--maize)' : 'var(--s3)'} stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {hover != null && <Tip tip={{ x: Math.min(Math.max(x(points[hover].x), 90), W - 90), y: y(points[hover].y) - 6, title: points[hover].label, rows: [{ label: xLabel, value: nf(points[hover].x, xDec) }, { label: yLabel, value: nf(points[hover].y, yDec) }] }} />}
    </div>
  );
}

/** Diagramma di flusso (Sankey) a colonne. nodes: [{id,label,col,color}], links: [{from,to,value}] */
export function Sankey({ nodes, links, height = 260, unit = '', decimals = 0, ariaLabel }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const L = useMemo(() => {
    const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
    const val = {};
    for (const n of nodes) val[n.id] = Math.max(links.filter(l => l.from === n.id).reduce((s, l) => s + l.value, 0), links.filter(l => l.to === n.id).reduce((s, l) => s + l.value, 0));
    const colTot = cols.map(c => nodes.filter(n => n.col === c).reduce((s, n) => s + val[n.id], 0));
    const gap = 14, padT = 8, padB = 8, nodeW = 12;
    const k = Math.min(...cols.map((c, i) => (height - padT - padB - gap * (nodes.filter(n => n.col === c).length - 1)) / (colTot[i] || 1)));
    const labelW = 132;
    const colX = c => labelW / 2 + (cols.indexOf(c)) * (W - labelW - nodeW) / Math.max(1, cols.length - 1);
    const pos = {};
    for (const c of cols) {
      let yy = padT;
      for (const n of nodes.filter(n => n.col === c)) { pos[n.id] = { x: colX(c), y: yy, h: val[n.id] * k }; yy += val[n.id] * k + gap; }
    }
    const outOff = {}, inOff = {};
    const paths = links.map(l => {
      const a = pos[l.from], b = pos[l.to];
      const w = l.value * k;
      const y0 = a.y + (outOff[l.from] || 0) + w / 2, y1 = b.y + (inOff[l.to] || 0) + w / 2;
      outOff[l.from] = (outOff[l.from] || 0) + w; inOff[l.to] = (inOff[l.to] || 0) + w;
      const x0 = a.x + nodeW, x1 = b.x, xm = (x0 + x1) / 2;
      return { ...l, d: `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`, w };
    });
    // etichette senza sovrapposizioni: distanza minima di 26 px nella stessa colonna
    const labelY = {};
    for (const c of cols) {
      const ns = nodes.filter(n => n.col === c).map(n => ({ id: n.id, y: pos[n.id].y + Math.max(2, pos[n.id].h) / 2 })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ns.length; i++) if (ns[i].y - ns[i - 1].y < 26) ns[i].y = ns[i - 1].y + 26;
      const over = ns.length ? ns[ns.length - 1].y - (height - 12) : 0;
      if (over > 0) for (let i = ns.length - 1; i >= 0; i--) { ns[i].y -= over; if (i > 0 && ns[i].y - ns[i - 1].y < 26) ns[i - 1].y = ns[i].y - 26; }
      for (const n of ns) labelY[n.id] = n.y;
    }
    return { pos, paths, nodeW, val, labelY };
  }, [nodes, links, W, height]);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        {L.paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={byId[p.from].color || 'var(--s1)'} strokeWidth={Math.max(1, p.w)} opacity={hover == null || hover === i ? .35 : .12} onPointerEnter={() => setHover(i)} />)}
        {nodes.map(n => {
          const p = L.pos[n.id]; const right = p.x > W / 2;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={L.nodeW} height={Math.max(2, p.h)} rx="3" fill={n.color || 'var(--ink-2)'} />
              <text x={right ? p.x - 6 : p.x + L.nodeW + 6} y={L.labelY[n.id] - 2} textAnchor={right ? 'end' : 'start'} className="lbl-ink">{n.label}</text>
              <text x={right ? p.x - 6 : p.x + L.nodeW + 6} y={L.labelY[n.id] + 11} textAnchor={right ? 'end' : 'start'} style={{ fontSize: 10.5 }}>{nf(L.val[n.id], decimals)} {unit}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && <Tip tip={{ x: W / 2, y: 20, rows: [{ label: `${byId[L.paths[hover].from].label} → ${byId[L.paths[hover].to].label}`, value: nf(L.paths[hover].value, decimals) + ' ' + unit }] }} />}
    </div>
  );
}

/** Legenda (sempre presente con due o più serie). */
export function Legend({ items, line }) {
  return <div className="legend">{items.map(i => <span key={i.label}><i className={line || i.line ? 'line' : ''} style={{ background: i.color }} />{i.label}</span>)}</div>;
}

/** Nuvola di punti su asse temporale. points: [{t:'YYYY-MM-DD', y, color, label, key}], refs: [{y,label,kind}] */
export function Dots({ points, height = 220, unit = '', decimals = 1, refs = [], ariaLabel, onPick, yMin }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  if (!points.length) return <div className="chart" ref={box}><p className="small muted">Nessun dato.</p></div>;
  const ts = points.map(p => Date.parse(p.t)), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const ys = [...points.map(p => p.y), ...refs.map(r => r.y)];
  const ticks = niceTicks(yMin ?? Math.min(0, ...ys), Math.max(...ys), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const padL = 40, padR = 70, padT = 10, padB = 24;
  const x = t => padL + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = v => padT + (hi - v) / (hi - lo || 1) * (height - padT - padB);
  const months = []; { const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); while (d.getTime() <= t1) { months.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); } }
  const every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor((W - padL - padR) / 70))));
  const MES = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t, dec(ticks[1] - ticks[0]))}</text>)}
        {months.map((m, i) => i % every === 0 ? <text key={m} x={x(m)} y={height - 6} textAnchor="middle">{MES[new Date(m).getUTCMonth()]}</text> : null)}
        {refs.map((r, i) => <g key={'r' + i}><line x1={padL} x2={W - padR} y1={y(r.y)} y2={y(r.y)} stroke={r.kind === 'crit' ? 'var(--crit)' : r.kind === 'warn' ? 'var(--warn)' : 'var(--ink-2)'} strokeWidth="1.2" strokeDasharray={r.kind === 'warn' ? '4 3' : undefined} opacity=".85" /><text x={W - padR + 5} y={y(r.y) + 3.5} className="lbl-ink" style={{ fill: r.kind === 'crit' ? 'var(--crit-ink)' : undefined }}>{r.label}</text></g>)}
        {points.map((p, i) => (
          <g key={p.key || i} onPointerEnter={() => setHover(i)} onClick={onPick ? () => onPick(p) : undefined} style={{ cursor: onPick ? 'pointer' : undefined }}>
            <circle cx={x(ts[i])} cy={y(p.y)} r="9" className="hit" />
            <circle cx={x(ts[i])} cy={y(p.y)} r={hover === i ? 5.5 : 4} fill={p.color || 'var(--s1)'} stroke="var(--surface)" strokeWidth="1.5" opacity={hover == null || hover === i ? 0.95 : 0.6} />
          </g>
        ))}
      </svg>
      {hover != null && <Tip tip={{ x: Math.min(Math.max(x(ts[hover]), 90), W - 90), y: y(points[hover].y) - 8, title: points[hover].label, rows: [{ color: points[hover].color, label: points[hover].t.split('-').reverse().join('/'), value: nf(points[hover].y, decimals) + (unit ? ' ' + unit : '') }] }} />}
    </div>
  );
}
