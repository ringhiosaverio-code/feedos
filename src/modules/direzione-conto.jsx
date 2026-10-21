/* FeedOS 17 · Direzione › Conto economico gestionale (WP1) e strumenti condivisi dell'area:
 * formattatori in euro, definizioni al passaggio del mouse, cascata orizzontale, colonne mensili con mesi in corso tratteggiati,
 * hook useDir (periodo, conto del periodo e del confronto, copertura). */
import React, { useId, useMemo, useRef, useState } from 'react';
import { LuInfo, LuChevronRight, LuSnowflake, LuTriangleAlert } from 'react-icons/lu';
import { nf, sf, pct, monthLabel } from '../core/util.js';
import { ctxOf } from '../core/derived.js';
import { usePeriod } from '../ui/period.jsx';
import { pnlFor, aggregate, PNL_LINES, VAR_LINE, FIXED_LINE, compareLines, stockEffect, effectiveCoverage, keyLabel } from '../engine/pnl.js';
import { budgetTotals, activeVersion } from '../engine/budget.js';
import { statusFor } from '../engine/kpis.js';
import { Panel, Kpi, Table, Seg, Chip, Empty, useWidth } from '../ui/ui.jsx';
import { niceTicks } from '../ui/charts.jsx';

// ---------------- formattatori ----------------
/** Importo diviso in valore e unità per gli indicatori: 16,75 M€ · 461 k€ · 820 €. */
export function money(v) {
  if (v == null || !Number.isFinite(+v)) return { value: '—', unit: '' };
  const a = Math.abs(v);
  if (a >= 1e6) return { value: nf(v / 1e6, 2), unit: 'M€' };
  if (a >= 1e4) return { value: nf(v / 1e3, 0), unit: 'k€' };
  if (a >= 1e3) return { value: nf(v / 1e3, 1), unit: 'k€' };
  return { value: nf(v, 0), unit: '€' };
}
export const eurTxt = v => { const m = money(v); return m.unit ? `${m.value} ${m.unit}` : m.value; };
export const kEur = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '—' : nf(v / 1000, d) + ' k€');
export const skEur = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '—' : sf(v / 1000, d) + ' k€');
export const eur0 = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, 0));
export const perT = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, 2));

/** Definizione al passaggio del mouse (o al tocco: il riquadro prende il fuoco). */
export function Def({ text, children, label }) {
  if (!text) return children || null;
  return (
    <span className="dz-def" tabIndex={0} aria-label={label || (typeof children === 'string' ? `${children}: ${text}` : text)}>
      {children}<LuInfo aria-hidden="true" /><span className="dz-tip" role="tooltip">{text}</span>
    </span>
  );
}

/** Scostamento colorato: verde se favorevole, rosso se sfavorevole. kind 'flow' → %; 'abs' → € con segno. */
export function Delta({ cur, cmp, kind = 'abs', good = 'up', decimals = 0, unit = '' }) {
  if (cur == null || cmp == null || !Number.isFinite(+cur) || !Number.isFinite(+cmp)) return <span className="dz-pct">—</span>;
  const dv = cur - cmp;
  const txt = kind === 'pct' ? (Math.abs(cmp) >= 0.5 ? sf(dv / Math.abs(cmp) * 100, 1) + '%' : '—') : sf(dv, decimals) + (unit ? ' ' + unit : '');
  const sign = Math.abs(dv) < 0.5 * 10 ** -decimals ? 0 : Math.sign(dv);
  const cls = !sign || !good ? '' : (good === 'up') === sign > 0 ? 'good' : 'bad'; // good null: neutro (voci per memoria)
  return <span className={`dz-d ${cls}`}>{txt}</span>;
}

// ---------------- hook dell'area ----------------
/**
 * Periodo globale, contesto dei motori, conto del periodo (cur) e del confronto (cmp: periodo C o budget), copertura effettiva.
 */
export function useDir(d) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const year = +per.P.to.slice(0, 4);
  const cur = useMemo(() => pnlFor(d, ctx, per.P), [d, ctx, per.P]);
  const cmp = useMemo(() => {
    if (!per.C) return null;
    if (per.C.budget) { const bt = budgetTotals(d, per.P, activeVersion(d, year)); return bt ? { ...bt.pnl, coverage: bt.coverage } : null; }
    return pnlFor(d, ctx, per.C);
  }, [d, ctx, per.P, per.C, year]);
  // copertura dei dati: un confronto è omogeneo se entrambi i periodi hanno dati per almeno il 90% dei giorni
  // (budget: quota del periodo coperta da un budget, che è annuale; periodo scelto: es. il primo mese, parziale)
  const covP = effectiveCoverage(d, ctx, per.P);
  const covC = !per.C ? null : per.C.budget ? (cmp ? cmp.coverage : 0) : effectiveCoverage(d, ctx, per.C);
  const cov = covC == null ? null : Math.min(covC, covP ?? 1);
  const cmpLabel = !per.C ? null : per.C.budget ? 'budget' : per.C.short;
  const hasData = !!cur && (cur.tonnes > 0 || Math.abs(cur.revenueNet) > 0);
  return { ...per, ctx, year, cur, cmp, cov, covP, covC, cmpLabel, hasData };
}
/**
 * Semaforo e obiettivo di un indicatore dal catalogo degli obiettivi (motore KPI, settings.targets): {status, target}.
 * Senza obiettivo (o con il motore KPI non disponibile) restituisce {} e l'indicatore resta neutro.
 */
export function goal(d, id, value, fmt) {
  if (value == null || !Number.isFinite(+value)) return {};
  let status = null;
  try { status = statusFor(d, id, +value) || null; } catch { status = null; }
  const tv = d.settings?.targets?.[id]?.target;
  return { status: status || undefined, target: tv != null && Number.isFinite(+tv) && fmt ? fmt(+tv) : undefined };
}

/** Proprietà cmp di Kpi per un valore del conto. */
export function kc(dir, cur, cmp, { kind = 'flow', good = 'up', unit = '', decimals = 1, scale = 1 } = {}) {
  if (!dir.C || cmp == null) return undefined;
  return { cur, value: cmp, kind, good, unit, decimals, scale, label: dir.cmpLabel, cov: dir.cov };
}

// ---------------- cascata orizzontale ----------------
/**
 * Cascata orizzontale: steps [{key, label, value, kind: 'total'|'step', def, sub}]; i totali partono da zero,
 * i passi dal punto raggiunto. fmt formatta i valori; onPick(step) rende le righe cliccabili.
 */
export function HWaterfall({ steps, fmt = eurTxt, onPick, ariaLabel }) {
  let run = 0;
  const bars = steps.map(s => {
    if (s.kind === 'total') { run = s.value; return { ...s, from: 0, to: s.value }; }
    const from = run; run += s.value; return { ...s, from, to: run };
  });
  const vals = bars.flatMap(b => [b.from, b.to]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const x = v => ((v - lo) / span) * 100;
  return (
    <div className="dz-hw" role="list" aria-label={ariaLabel}>
      {bars.map((b, i) => {
        const a = Math.min(x(b.from), x(b.to)), w = Math.abs(x(b.to) - x(b.from));
        const neg = b.kind !== 'total' && b.value < 0;
        return (
          <div key={b.key || i} role="listitem" className={`dz-hw-row ${b.kind === 'total' ? 'total' : ''} ${onPick && b.kind !== 'total' ? 'pick' : ''}`}
            onClick={onPick && b.kind !== 'total' ? () => onPick(b) : undefined} title={`${b.label}: ${fmt(b.value)}`}>
            <span className="dz-hw-lbl">{b.def ? <Def text={b.def}>{b.label}</Def> : b.label}</span>
            <span className="dz-hw-track" aria-hidden="true">
              <i className="dz-hw-zero" style={{ left: x(0) + '%' }} />
              <i className={`dz-hw-bar ${b.kind === 'total' ? 'total' : ''} ${b.kind === 'total' && b.value < 0 ? 'negt' : ''} ${neg ? 'neg' : ''}`} style={{ left: a + '%', width: Math.max(0.4, w) + '%', background: b.color }} />
            </span>
            <span className={`dz-hw-val ${b.kind === 'total' ? '' : neg ? 'neg' : b.value > 0 ? 'pos' : ''}`}>
              {b.kind === 'total' ? fmt(b.value) : (b.value > 0 ? '+' : b.value < 0 ? '−' : '') + fmt(Math.abs(b.value))}
              {b.sub && <span className="dz-hw-sub">{b.sub}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- colonne mensili ----------------
/**
 * Colonne raggruppate per mese, anche negative. cols: [{key, label, title, bars: [{key, value, color, hatch, outline}], note}]
 * legend: [{label, color, hatch, outline}]. tip(col) → righe [{label, value, color}] del riquadro al passaggio.
 */
export function MonthBars({ cols, legend, height = 230, decimals = 0, unit = '', ariaLabel, tip }) {
  const box = useRef(null);
  const W = useWidth(box);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState(null);
  const vals = cols.flatMap(c => c.bars.map(b => b.value).filter(v => v != null && Number.isFinite(v)));
  const ticks = niceTicks(Math.min(0, ...vals, 0), Math.max(0, ...vals, 1), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const tdec = ticks.length > 1 && ticks[1] - ticks[0] < 1 ? 1 : 0;
  const padL = Math.max(36, 10 + 7 * Math.max(nf(lo, tdec).length, nf(hi, tdec).length)), padR = 8, padT = 14, padB = 26;
  const n = cols.length, slot = (W - padL - padR) / Math.max(1, n);
  const nb = Math.max(1, ...cols.map(c => c.bars.length));
  const bw = Math.max(3, Math.min(16, (slot * 0.74) / nb));
  const y = v => padT + ((hi - v) / (hi - lo || 1)) * (height - padT - padB);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL) / 48))));
  const colors = [...new Set(cols.flatMap(c => c.bars.filter(b => b.hatch).map(b => b.color)))];
  const pid = c => `dzh${uid}${colors.indexOf(c)}`;
  const hv = hover != null ? cols[hover] : null;
  const rows = hv ? (tip ? tip(hv) : hv.bars.map(b => ({ label: b.label || b.key, value: nf(b.value, decimals) + (unit ? ' ' + unit : ''), color: b.color }))) : null;
  return (
    <div className="chart dz-mb" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} style={{ height }}>
        <defs>{colors.map(c => (
          <pattern key={c} id={pid(c)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={c} opacity=".22" /><rect width="2.4" height="6" fill={c} opacity=".9" />
          </pattern>))}</defs>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t, tdec)}</text>)}
        <line className="zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
        {cols.map((c, i) => {
          const cx = padL + slot * (i + 0.5), w0 = cx - (c.bars.length * bw + (c.bars.length - 1) * 2) / 2;
          return (
            <g key={c.key} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} />
              {c.bars.map((b, j) => {
                if (b.value == null || !Number.isFinite(b.value)) return null;
                const top = Math.min(y(b.value), y(0)), h = Math.max(1, Math.abs(y(b.value) - y(0)));
                const fill = b.outline ? 'none' : b.hatch ? `url(#${pid(b.color)})` : b.color;
                return <rect key={b.key} x={w0 + j * (bw + 2)} y={top} width={bw} height={h} rx="2.5" fill={fill} stroke={b.outline || b.hatch ? b.color : 'none'} strokeWidth={b.outline ? 1.5 : b.hatch ? 1 : 0}
                  opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              {(i % every === 0 || i === n - 1) && <text x={cx} y={height - 9} textAnchor="middle" className={c.note ? 'open-l' : undefined}>{c.label}</text>}
            </g>
          );
        })}
      </svg>
      {hv && <div className="tip" style={{ left: Math.min(Math.max(padL + slot * (hover + 0.5), 100), W - 100), top: padT }} role="status">
        <div className="muted xs">{hv.title || hv.label}{hv.note ? ` · ${hv.note}` : ''}</div>
        {rows.map((r, k) => <div key={k} className="r"><span className="row gap-s">{r.color && <i className="key" style={{ background: r.color }} />}<span className="small">{r.label}</span></span><b>{r.value}</b></div>)}
      </div>}
      {legend && <div className="dz-legend">{legend.map(l => <span key={l.label} style={{ color: l.color }}><i className={l.hatch ? 'hatch' : l.outline ? 'outline' : ''} style={{ background: l.color }} /><span style={{ color: 'var(--ink-2)' }}>{l.label}</span></span>)}</div>}
    </div>
  );
}

// ---------------- conto economico ----------------
const DIMS = [{ id: 'productId', label: 'Prodotto' }, { id: 'customerId', label: 'Cliente' }, { id: 'agentId', label: 'Agente' }, { id: 'species', label: 'Specie' }];
const KEY_TOTALS = new Set(['mdc2', 'ebit']);
/** Variazione % solo se il confronto è almeno 0,5 € (altrimenti «—»). */
const pctOf = (v, c) => (c == null || v == null || Math.abs(c) < 0.5 ? null : (v - c) / Math.abs(c));
const MAX_CHILD = 8;

/** Cascata dai ricavi netti all'EBIT (passi del conto). */
export function pnlSteps(p) {
  const by = p.by, t = p.tonnes;
  const sub = v => (t > 0 ? `${nf(v / t, 1)} €/t` : undefined);
  const st = (id, label, kind) => ({ key: id, label: label || PNL_LINES.find(l => l.id === id).short, value: by[id], kind: kind || 'step', def: PNL_LINES.find(l => l.id === id).def, sub: kind === 'total' ? sub(by[id]) : undefined });
  return [
    st('ricaviNetti', 'Ricavi netti', 'total'), st('materiePrime'), st('calo'), st('energia'), st('trasformazioneVar'), st('imballi'), st('mdc1', 'MdC I', 'total'),
    st('trasporti'), st('provvigioni'), st('mdc2', 'MdC II', 'total'), st('fissiStabilimento'), st('fissiCommerciali'), st('fissiStruttura'), st('ebitda', 'EBITDA', 'total'),
    st('ammortamenti'), st('ebit', 'EBIT', 'total'),
  ].filter(s => s.kind === 'total' || Math.abs(s.value) >= 0.5);
}

export function Conto({ d }) {
  const dir = useDir(d);
  const { P, C, cur, cmp, ctx } = dir;
  const [dim, setDim] = useState('productId');
  const [open, setOpen] = useState(() => new Set());
  const centers = d.costCenters || [];
  // righe per chiave (periodo e confronto) per l'espansione delle voci variabili: stesse regole del totale (storico ripartito per giorni)
  const byKey = useMemo(() => aggregate(ctx.facts, d.salesHistory || [], P, [dim]).rows, [ctx.facts, d.salesHistory, P, dim]);
  const byKeyC = useMemo(() => (C && !C.budget ? Object.fromEntries(aggregate(ctx.facts, d.salesHistory || [], C, [dim]).rows.map(r => [r[dim] ?? '', r])) : null), [ctx.facts, d.salesHistory, C, dim]);
  if (!dir.hasData) return <Panel title="Conto economico"><Empty title="Nessuna consegna nel periodo">Il conto economico si costruisce dalle consegne (con i lotti e le lavorazioni) e dai costi fissi per centro. Registra o importa le consegne da Dati › Importa, oppure scegli un altro periodo.</Empty></Panel>;
  const lines = compareLines(cur, cmp);
  const t = cur.tonnes;
  const rows = [];
  for (const l of lines) {
    const fixedGroup = FIXED_LINE[l.id];
    const expandable = !!(VAR_LINE[l.id] && l.id !== 'oneriCircolante') || (!!fixedGroup && Math.abs(l.value) > 0);
    rows.push({ ...l, kind: l.total ? 'tot' : 'line', expandable, open: open.has(l.id) });
    if (!open.has(l.id)) continue;
    if (VAR_LINE[l.id]) {
      const f = VAR_LINE[l.id];
      const ch = byKey.map(r => ({ k: r[dim] ?? '', v: f(r), t: r.tonnes, c: byKeyC ? (byKeyC[r[dim] ?? ''] ? f(byKeyC[r[dim] ?? '']) : 0) : null })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      const top = ch.slice(0, MAX_CHILD), rest = ch.slice(MAX_CHILD);
      for (const c of top) rows.push({ id: `${l.id}:${c.k}`, kind: 'child', label: keyLabel(d, dim, c.k, ctx.ix), value: c.v, perT: c.t > 0 ? c.v / c.t : null, pctRev: cur.revenueNet ? c.v / cur.revenueNet : null, cmp: c.c, delta: c.c == null ? null : c.v - c.c, deltaPct: pctOf(c.v, c.c) });
      if (rest.length) {
        const v = rest.reduce((s, x) => s + x.v, 0), tt = rest.reduce((s, x) => s + x.t, 0), cc = byKeyC ? rest.reduce((s, x) => s + (x.c || 0), 0) : null;
        rows.push({ id: `${l.id}:altri`, kind: 'child', label: `Altri ${rest.length}`, value: v, perT: tt > 0 ? v / tt : null, pctRev: cur.revenueNet ? v / cur.revenueNet : null, cmp: cc, delta: cc == null ? null : v - cc, deltaPct: pctOf(v, cc) });
      }
    } else if (fixedGroup) {
      const fx = cur.fixed?.byCenter || {}, fc = cmp?.fixed?.byCenter || null;
      for (const c of centers) {
        const isNon = c.cash === false, grp = ['stabilimento', 'commerciale', 'struttura'].includes(c.group) ? c.group : 'struttura';
        if (fixedGroup === 'nonCash' ? !isNon : isNon || grp !== fixedGroup) continue;
        const v = -(fx[c.id] || 0);
        if (!v && !(fc && fc[c.id])) continue;
        const cv = fc ? -(fc[c.id] || 0) : null;
        rows.push({ id: `${l.id}:${c.id}`, kind: 'child', label: c.name, value: v, perT: t > 0 ? v / t : null, pctRev: cur.revenueNet ? v / cur.revenueNet : null, cmp: cv, delta: cv == null ? null : v - cv, deltaPct: pctOf(v, cv) });
      }
    }
  }
  const se = stockEffect(cur.sums);
  rows.push({ id: 'effettoScorte', kind: 'memo', label: 'Effetto scorte (per memoria)', value: se, perT: t > 0 ? se / t : null, pctRev: cur.revenueNet ? se / cur.revenueNet : null, cmp: cmp?.sums ? stockEffect(cmp.sums) : null, def: 'Costo variabile ai prezzi di oggi − costo variabile effettivo dei lotti venduti. Positivo: le scorte comprate prima dei rincari hanno sostenuto il margine.' });
  for (const r of rows) if (r.kind === 'memo') { r.delta = r.cmp == null ? null : r.value - r.cmp; r.deltaPct = pctOf(r.value, r.cmp); }
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cols = [
    { key: 'label', label: 'Voce', nosort: true, csv: r => (r.kind === 'child' ? '   ' : '') + r.label, render: r => {
      if (r.kind === 'child') return <span className="dz-ch">{r.label}</span>;
      const lbl = <Def text={r.def}>{r.label}</Def>;
      return <span className={`dz-lbl ${r.kind === 'tot' ? 'dz-tot' + (KEY_TOTALS.has(r.id) ? ' key' : '') : r.kind === 'memo' ? 'dz-memo' : ''}`}>
        <span className={`dz-exp ${r.expandable ? '' : 'none'} ${r.open ? 'on' : ''}`} aria-hidden="true"><LuChevronRight /></span>{lbl}</span>;
    } },
    { key: 'value', label: '€', align: 'r', nosort: true, csv: r => Math.round(r.value * 100) / 100, render: r => eur0(r.value) },
    { key: 'perT', label: '€/t', align: 'r', nosort: true, csv: r => r.perT, render: r => perT(r.perT), className: '' },
    { key: 'pctRev', label: '% ricavi', align: 'r', nosort: true, csv: r => r.pctRev, render: r => <span className="dz-pct">{r.pctRev == null ? '—' : pct(r.pctRev, 1)}</span> },
    ...(cmp ? [
      { key: 'cmp', label: C?.budget ? 'Budget' : `Confronto`, csvLabel: 'Confronto', align: 'r', nosort: true, csv: r => r.cmp, render: r => eur0(r.cmp) },
      { key: 'delta', label: 'Δ €', align: 'r', nosort: true, csv: r => r.delta, render: r => <Delta cur={r.value} cmp={r.cmp} good={r.kind === 'memo' ? null : 'up'} /> }, // valori con segno: più alto è meglio
      { key: 'deltaPct', label: 'Δ%', align: 'r', nosort: true, csv: r => r.deltaPct, render: r => <span className="dz-pct">{r.deltaPct == null ? '—' : sf(r.deltaPct * 100, 1) + '%'}</span> },
    ] : []),
  ];
  const ct = cur.by;
  const varCost = cur.sums.raw + cur.sums.shrink + cur.sums.energy + cur.sums.varConv + cur.sums.pack;
  return (
    <>
      <div className="kpis">
        <Kpi label="Ricavi netti" {...money(ct.ricaviNetti)} cmp={kc(dir, ct.ricaviNetti, cmp?.by.ricaviNetti)} foot={`${nf(t)} t`} />
        <Kpi label="MdC I" value={perT(t ? ct.mdc1 / t : null)} unit="€/t" cmp={kc(dir, t ? ct.mdc1 / t : null, cmp && cmp.tonnes ? cmp.by.mdc1 / cmp.tonnes : null, { kind: 'ratio', unit: '€/t' })} foot={eurTxt(ct.mdc1)} />
        <Kpi label="MdC II" value={perT(t ? ct.mdc2 / t : null)} unit="€/t" cmp={kc(dir, t ? ct.mdc2 / t : null, cmp && cmp.tonnes ? cmp.by.mdc2 / cmp.tonnes : null, { kind: 'ratio', unit: '€/t' })} foot={eurTxt(ct.mdc2)}
          {...goal(d, 'mdc-t', t ? ct.mdc2 / t : null, v => nf(v, 0) + ' €/t')} />
        <Kpi label="EBIT" {...money(ct.ebit)} cmp={kc(dir, ct.ebit, cmp?.by.ebit)} foot={cur.revenueNet ? `${pct(ct.ebit / cur.revenueNet, 1)} dei ricavi` : null} />
      </div>
      <Panel title="Conto economico a costi diretti" flush className="dz-pnl"
        sub={<>Costo effettivo dei lotti venduti, {P.label}{cmp ? ` · confronto: ${C.budget ? 'budget' : C.label}` : ''}. Clic su una voce per il dettaglio per {DIMS.find(x => x.id === dim).label.toLowerCase()} (costi fissi per centro).</>}
        actions={<div className="dz-head-chips">
          {cur.frozen ? <Chip kind="accent" icon={LuSnowflake} title={`Numeri congelati alla chiusura del mese${cur.closedAt ? ' (' + cur.closedAt.slice(0, 10).split('-').reverse().join('/') + ')' : ''}`}>congelato</Chip> : P.open ? <Chip kind="outline">in corso</Chip> : <Chip kind="outline">provvisorio</Chip>}
          {cur.estimatedMonths?.length > 0 && <Chip kind="maize" icon={LuTriangleAlert} title={`Costi fissi da budget o media per ${cur.estimatedMonths.map(m => monthLabel(m, false)).join(', ')}`}>fissi stimati</Chip>}
          {cur.partialFixedMonths?.length > 0 && <Chip kind="warn" icon={LuTriangleAlert} title={`Consuntivo dei costi fissi incompleto per ${cur.partialFixedMonths.map(m => monthLabel(m, false)).join(', ')}: i centri senza importo valgono zero (Direzione › Costi fissi)`}>fissi parziali</Chip>}
          {dir.cov != null && dir.cov < 0.9 && <Chip kind="warn" title={dir.covP != null && dir.covP < 0.9 ? `Il periodo scelto ha dati solo per il ${pct(dir.covP, 0)} dei giorni (inizio dei dati)` : `Dati per il ${pct(dir.covC, 0)} del periodo di confronto`}>non confrontabile</Chip>}
          <Seg label="Dettaglio per" value={dim} onChange={v => setDim(v)} options={DIMS} />
        </div>}>
        <Table rows={rows} cols={cols} pageSize={500} rowKey={r => r.id} exportName="conto-economico" caption="Conto economico"
          onRow={r => { if (r.expandable) toggle(r.id); }} />
      </Panel>
      <div className="split">
        <Panel title="Dai ricavi netti all’EBIT" sub={`${P.label} · per riga anche il valore per tonnellata dei margini`}>
          <HWaterfall steps={pnlSteps(cur)} ariaLabel="Cascata dai ricavi netti all’EBIT" />
        </Panel>
        <Panel title="Effetto scorte" sub="Margine al costo effettivo dei lotti e «ai costi di oggi»">
          <div className="dz-read">
            <p><b>{se >= 0 ? '+' : '−'}{eurTxt(Math.abs(se))}</b> ({cur.revenueNet ? pct(se / cur.revenueNet, 1) : '—'} dei ricavi): il costo variabile effettivo dei lotti venduti è {eurTxt(varCost)}; agli stessi volumi, con i prezzi di oggi delle materie prime e dell’energia, sarebbe {eurTxt(cur.sums.replVar)}.</p>
            <p>A costi di oggi il MdC I sarebbe {eurTxt(ct.mdc1 - se)} ({perT(t ? (ct.mdc1 - se) / t : null)} €/t) invece di {eurTxt(ct.mdc1)} ({perT(t ? ct.mdc1 / t : null)} €/t). {se > 0 ? 'Le scorte comprate prima dei rincari hanno sostenuto il margine: senza interventi su listini o ricette, i prossimi mesi renderanno meno.' : se < 0 ? 'Le scorte comprate a prezzi più alti hanno pesato sul margine: ai prezzi di oggi il margine migliora.' : 'Costi effettivi e costi di oggi coincidono.'}</p>
            <p className="small muted">Mesi dallo storico mensile: nessun effetto scorte (manca il costo di sostituzione).</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
