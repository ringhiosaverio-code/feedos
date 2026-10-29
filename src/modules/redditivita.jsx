/* FeedOS 17 · Redditività netta per cliente, prodotto e agente (pacchetto WP3): margine dopo il costo di servizio
 * (trasporto per distanza e consegne, provvigioni, dilazione, reclami, visite), curva della balena, concentrazione,
 * matrice dei clienti, rischio di abbandono e «E se perdiamo…». Contratto: la sezione della scheda cliente CustomerProfit. */
import React, { useMemo, useState } from 'react';
import { LuTriangleAlert, LuSettings2 } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { ctxOf, appToday } from '../core/derived.js';
import { nf, pct } from '../core/util.js';
import { PM_LABEL, pm, pmDec, fmtPm } from '../core/units.js';
import { resolvePeriod } from '../core/period.js';
import { usePeriod } from '../ui/period.jsx';
import { customerProfit, productProfit, agentProfit, churnRisk, lossImpact, logisticsSettings, QUADRANTS } from '../engine/profitability.js';
import { dataStart, coverage } from '../engine/actuals.js';
import { Panel, Table, Chip, Kpi, Seg, Field, Select, NumInput, Empty, Btn, useWidth } from '../ui/ui.jsx';
import { LineChart } from '../ui/charts.jsx';
import { Def, money, eurTxt, kEur, HWaterfall } from './direzione-conto.jsx';

const QCOLOR = { Difendere: 'var(--s3)', Sviluppare: 'var(--s1)', 'Rinegoziare prezzo': 'var(--s4)', 'Ristrutturare servizio': 'var(--s2)' };
const QHINT = QUADRANTS; // spiegazione di ogni azione suggerita, dal motore
const t1 = v => (v == null || !Number.isFinite(+v) ? '—' : nf(pm(v), pmDec(1))); // per tonnellata, o per kg nell'edizione agrofarmaci

/** Dati del periodo e del confronto (solo periodi, non il budget: il budget non ha clienti). */
function useProfit(d, by) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const fn = by === 'prodotti' ? productProfit : by === 'agenti' ? agentProfit : customerProfit;
  const cur = useMemo(() => fn(d, ctx, per.P), [d, ctx, per.P, fn]);
  const C = per.C && !per.C.budget ? per.C : null;
  const cmp = useMemo(() => (C ? fn(d, ctx, C) : null), [d, ctx, C, fn]);
  // il dettaglio per cliente esiste solo dove ci sono le consegne (non lo storico mensile aggregato):
  // la copertura del confronto si misura sulle consegne
  const start = dataStart(ctx.facts, []);
  const cov = C ? Math.min(coverage(per.P, start) ?? 0, coverage(C, start) ?? 0) : null;
  return { ...per, ctx, cur, cmp: cmp && cmp.totals?.tonnes > 0 ? cmp : null, C, cov };
}
const kcmp = (pr, cur, cmp, o = {}) => (pr.C && cmp != null ? { cur, value: cmp, label: pr.C.short, cov: pr.cov, kind: 'flow', good: 'up', decimals: 1, ...o } : undefined);

export function Redditivita({ d, sel }) {
  const [by, setBy] = useState('clienti');
  const pr = useProfit(d, by);
  const cp = by === 'clienti' ? pr.cur : null;
  const cpAll = useMemo(() => (by === 'clienti' ? pr.cur : customerProfit(d, pr.ctx, pr.P)), [by, pr.cur, d, pr.ctx, pr.P]);
  const tot = pr.cur?.totals || {};
  const totC = pr.cmp?.totals || null;
  const rows = pr.cur?.rows || [];
  const cur = by === 'clienti' ? rows.find(r => r.id === sel) || null : null;
  if (!rows.length) return <Panel title="Redditività"><Empty title="Nessuna consegna nel periodo">La redditività netta si calcola dalle consegne del periodo, al costo effettivo dei lotti.</Empty></Panel>;
  const neg = cpAll.rows.filter(r => r.net < 0);
  return (
    <>
      <div className="row between">
        <Seg options={[{ id: 'clienti', label: 'Clienti' }, { id: 'prodotti', label: 'Prodotti' }, { id: 'agenti', label: 'Agenti' }]} value={by} onChange={setBy} label="Vista" />
        <span className="small muted">{pr.P.label} · margine netto = MdC I − trasporto − provvigioni − dilazione − reclami − visite</span>
      </div>
      <div className="kpis">
        <Kpi label={<Def text="Margine di contribuzione I (ricavi netti meno costi variabili effettivi) meno trasporto ripartito per distanza e consegne, provvigioni, costo della dilazione di pagamento (termini + ritardo medio), reclami e visite.">Margine netto</Def>}
          {...money(tot.net)} foot={`${t1(tot.netT)} ${PM_LABEL} su ${nf(tot.tonnes)} t`} cmp={kcmp(pr, tot.net, totC?.net)} />
        <Kpi label={<Def text="Curva della balena: clienti ordinati dal più redditizio. Il picco è il margine cumulato massimo in % del totale: oltre il 100% significa che i clienti in coda lo erodono.">Picco della curva</Def>}
          value={cpAll.peakPct != null ? nf(cpAll.peakPct * 100, 0) : '—'} unit="%" status={cpAll.peakPct > 1.05 ? 'warn' : undefined} foot="margine dei clienti migliori sul totale" />
        <Kpi label="Clienti in perdita" value={neg.length} status={neg.length ? 'bad' : 'ok'} foot={neg.length ? `${kEur(-neg.reduce((s, r) => s + r.net, 0))} da recuperare` : 'nessuno nel periodo'} onClick={neg.length ? () => { setBy('clienti'); openDrawer('customer', neg[0].id); } : undefined} />
        <Kpi label={<Def text="Indice di Herfindahl-Hirschman sui ricavi per cliente (0–10.000): sotto 1.500 portafoglio non concentrato, oltre 2.500 molto concentrato.">Concentrazione (HHI)</Def>}
          value={cpAll.hhi != null ? nf(cpAll.hhi) : '—'} status={cpAll.hhi > (d.settings?.concentration?.hhiBad ?? 2500) ? 'bad' : cpAll.hhi > (d.settings?.concentration?.hhiWarn ?? 1500) ? 'warn' : 'ok'} foot={`primo cliente ${pct(cpAll.top1, 1)}`} />
        <Kpi label="Quota dei primi 10" value={cpAll.top10 != null ? nf(cpAll.top10 * 100, 1) : '—'} unit="%" foot={`l’80% dei ricavi da ${cpAll.n80 ?? '—'} clienti`} />
      </div>
      {by === 'clienti' ? <ClientiView d={d} pr={pr} cp={cp} cur={cur} /> : <AltView d={d} by={by} pr={pr} />}
      <div className="split">
        <ChurnPanel d={d} pr={pr} />
        <LossPanel d={d} pr={pr} cp={cpAll} />
      </div>
      <LogisticsPanel d={d} />
    </>
  );
}

function ClientiView({ d, pr, cp, cur }) {
  const rows = cp.rows;
  const target = cp.target;
  return (
    <>
      <div className="split">
        <Panel title="Curva della balena" sub="Margine netto cumulato (in % del totale) contro la quota di clienti, dal più redditizio">
          <LineChart labels={cp.whale.points.map(p => nf(p.x * 100, 0) + '%')} height={240} unit="%" decimals={0} markLast={false}
            series={[{ key: 'w', label: 'Margine cumulato', color: 'var(--s3)', values: cp.whale.points.map(p => p.y * 100) }]}
            refs={[{ y: 100, label: 'totale', kind: 'muted' }]} ariaLabel="Curva della balena dei clienti" />
          <p className="small muted" style={{ marginTop: 8 }}>Picco al {nf((cp.peakPct || 0) * 100)}%: i clienti oltre il picco riducono il margine complessivo di {kEur(Math.max(0, (cp.peakPct || 1) - 1) * (cp.totals?.net || 0))}.</p>
        </Panel>
        <Panel title="Matrice dei clienti" sub={`Tonnellate (asse orizzontale, scala logaritmica) e margine netto per tonnellata; obiettivo ${fmtPm(target, 0)} · clic per la scheda`}>
          <Quadrant rows={rows} target={target} median={cp.median} onPick={r => openDrawer('customer', r.id)} />
          <div className="legend" style={{ marginTop: 8 }}>{Object.keys(QUADRANTS).map(q => <span key={q} title={QHINT[q]}><i style={{ background: QCOLOR[q] }} />{q} ({rows.filter(r => r.quadrant === q).length})</span>)}</div>
        </Panel>
      </div>
      {cur && <Panel title={`Dal prezzo al margine netto · ${cur.name}`} sub="Per tonnellata, nel periodo: costi effettivi dei lotti, trasporto ripartito per distanza e consegne">
        <CustomerWaterfall r={cur} />
      </Panel>}
      <Panel title="Clienti" sub="Clic per la scheda del cliente · ordinabile · esportabile" flush>
        <Table rows={rows} exportName="redditivita-clienti" selected={cur?.id} onRow={r => openDrawer('customer', r.id)} initialSort={{ key: 'net', dir: 'desc' }} pageSize={25} cols={[
          { key: 'name', label: 'Cliente', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.city}</span></>, csv: r => r.name },
          { key: 'quadrant', label: 'Azione', render: r => <Chip title={QHINT[r.quadrant]}><i className="dot" style={{ background: QCOLOR[r.quadrant], marginRight: 8 }} />{r.quadrant}</Chip>, csv: r => r.quadrant },
          { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes), csv: r => r.tonnes },
          { key: 'net', label: 'Netto', align: 'r', render: r => <span className={r.net < 0 ? 'chip crit' : ''}>{kEur(r.net)}</span>, csv: r => r.net },
          { key: 'netT', label: `Netto ${PM_LABEL}`, align: 'r', render: r => t1(r.netT), csv: r => pm(r.netT) },
          { key: 'logT', label: `Trasporto ${PM_LABEL}`, align: 'r', render: r => t1(r.logT), csv: r => pm(r.logT) },
          { key: 'km', label: 'km', align: 'r', render: r => nf(r.km), csv: r => r.km },
          { key: 'avgDrop', label: 'Consegna media', align: 'r', render: r => <>{t1(r.avgDrop)} t<span className="sub">min. {t1(r.minDropT)} t</span></>, csv: r => r.avgDrop },
          { key: 'termsDays', label: 'Giorni', align: 'r', render: r => <>{nf(r.termsDays)}<span className="sub">{r.delay > 1 ? `+${nf(r.delay)} ritardo` : 'puntuale'}</span></>, csv: r => r.termsDays },
          { key: 'priceNeededT', label: <Def text="Aumento di prezzo per tonnellata necessario a portare il margine netto all’obiettivo, a parità di servizio.">Prezzo necessario</Def>, csvLabel: `Prezzo necessario ${PM_LABEL}`, align: 'r', render: r => (r.gapT > 0 ? <Chip kind="warn">+{t1(r.gapT)} {PM_LABEL}</Chip> : <span className="muted">—</span>), csv: r => pm(r.gapT) },
          { key: 'abc', label: 'ABC', sort: r => r.abcRev + r.abcNet, render: r => <span className="row gap-s"><Chip title="Classe sui ricavi">{r.abcRev}</Chip><Chip kind={r.abcNet === 'C' ? 'warn' : 'good'} title="Classe sul margine netto">{r.abcNet}</Chip></span>, csv: r => `${r.abcRev}/${r.abcNet}` },
        ]} />
      </Panel>
    </>
  );
}

/** Cascata per tonnellata dal prezzo netto al margine netto di un cliente. */
export function CustomerWaterfall({ r }) {
  const T = r.tonnes || 1, per = v => (v || 0) / T;
  const ind = r.raw + r.shrink + r.energy + r.varConv + r.pack;
  const steps = [
    { key: 'p', label: 'Prezzo netto', value: per(r.revenue), kind: 'total' },
    { key: 'ind', label: 'Costo industriale variabile', value: -per(ind), def: 'Materie prime dei lotti consegnati, calo, energia misurata, trasformazione variabile e imballi.' },
    { key: 'log', label: 'Trasporto', value: -per(r.logistics), def: `Ripartito per distanza (${nf(r.km)} km) e numero di consegne (${nf(r.drops)}).` },
    { key: 'comm', label: 'Provvigioni', value: -per(r.commission) },
    { key: 'fin', label: 'Dilazione di pagamento', value: -per(r.finCost), def: `${nf(r.termsDays)} giorni tra termini e ritardo medio, al costo del denaro delle impostazioni.` },
    { key: 'rec', label: 'Reclami', value: -per(r.complaints) },
    { key: 'vis', label: 'Visite', value: -per(r.visits), def: `${nf(r.nVisits)} visite al costo standard per visita.` },
    { key: 'net', label: 'Margine netto', value: per(r.net), kind: 'total' },
  ].filter(s => s.kind === 'total' || Math.abs(s.value) >= 0.005);
  return <HWaterfall steps={steps} fmt={v => fmtPm(v, 2)} ariaLabel="Cascata del margine netto per tonnellata" />;
}

/** Matrice tonnellate × margine netto per tonnellata (asse x logaritmico), con obiettivo e mediana. */
function Quadrant({ rows, target, median, onPick }) {
  const box = React.useRef(null);
  const W = useWidth(box, 520), H = 260, pl = 44, pr = 12, pt = 10, pb = 26;
  const [hover, setHover] = useState(null);
  const xs = rows.map(r => Math.max(1, r.tonnes)), ys = rows.map(r => r.netT);
  const lx0 = Math.log10(Math.min(...xs) * 0.8), lx1 = Math.log10(Math.max(...xs) * 1.2);
  const y0 = Math.min(0, ...ys, target) - 5, y1 = Math.max(...ys, target) + 5;
  const X = t => pl + (Math.log10(Math.max(1, t)) - lx0) / (lx1 - lx0 || 1) * (W - pl - pr);
  const Y = v => pt + (y1 - v) / (y1 - y0 || 1) * (H - pt - pb);
  const ticksX = [10, 30, 100, 300, 1000, 3000, 10000].filter(t => Math.log10(t) >= lx0 && Math.log10(t) <= lx1);
  const step = (y1 - y0) > 80 ? 20 : 10;
  const ticksY = []; for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticksY.push(v);
  const h = hover != null ? rows[hover] : null;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height: H }} role="img" aria-label="Matrice dei clienti: tonnellate e margine netto per tonnellata">
        <g className="grid">{ticksY.map(v => <line key={v} x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} />)}</g>
        {ticksY.map(v => <text key={'y' + v} x={pl - 6} y={Y(v) + 3.5} textAnchor="end">{nf(v)}</text>)}
        {ticksX.map(t => <text key={'x' + t} x={X(t)} y={H - 8} textAnchor="middle">{nf(t)} t</text>)}
        <line x1={pl} x2={W - pr} y1={Y(target)} y2={Y(target)} stroke="var(--maize)" strokeDasharray="4 3" />
        <text x={W - pr} y={Y(target) - 4} textAnchor="end" className="lbl-ink">obiettivo {fmtPm(target, 0)}</text>
        {median > 0 && <line x1={X(median)} x2={X(median)} y1={pt} y2={H - pb} stroke="var(--axis)" strokeDasharray="4 3" />}
        <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="var(--crit)" strokeOpacity=".5" />
        {rows.map((r, i) => (
          <circle key={r.id} cx={X(r.tonnes)} cy={Y(r.netT)} r={hover === i ? 7 : 5} fill={QCOLOR[r.quadrant]} fillOpacity={r.net < 0 ? 1 : 0.8}
            stroke={r.net < 0 ? 'var(--crit)' : 'var(--surface)'} strokeWidth="1.5" style={{ cursor: 'pointer' }}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => onPick?.(r)}>
            <title>{`${r.name}: ${nf(r.tonnes)} t, ${fmtPm(r.netT, 1)}`}</title>
          </circle>
        ))}
      </svg>
      {h && <div className="tip" style={{ left: Math.min(Math.max(X(h.tonnes), 90), W - 90), top: Y(h.netT) }}><b>{h.name}</b><div className="r"><span>Tonnellate</span><span>{nf(h.tonnes)}</span></div><div className="r"><span>Netto</span><span>{fmtPm(h.netT, 1)}</span></div><div className="r"><span>Azione</span><span>{h.quadrant}</span></div></div>}
    </div>
  );
}

function AltView({ d, by, pr }) {
  const rows = pr.cur.rows;
  const isA = by === 'agenti';
  return (
    <Panel title={isA ? 'Agenti' : 'Prodotti'} sub={isA ? `Margine netto del portafoglio dopo provvigioni; primo agente ${pct(pr.cur.topShare, 1)} dei ricavi` : 'Margine netto per prodotto dopo trasporto, provvigioni, dilazione, reclami e visite'} flush>
      <Table rows={rows} exportName={isA ? 'redditivita-agenti' : 'redditivita-prodotti'} initialSort={{ key: 'net', dir: 'desc' }} onRow={isA ? r => openDrawer('agent', r.id) : r => openDrawer('product', r.id)} cols={[
        { key: 'name', label: isA ? 'Agente' : 'Prodotto', render: r => <><b>{r.name}</b><span className="sub">{isA ? `${r.zone || ''} · ${r.customers ?? '—'} clienti` : `${r.code} · ${r.packaging}${r.active === false ? ' · non attivo' : ''}`}</span></>, csv: r => r.name },
        { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes), csv: r => r.tonnes },
        { key: 'revenue', label: 'Ricavi', align: 'r', render: r => kEur(r.revenue), csv: r => r.revenue },
        { key: 'mc2T', label: `MdC II ${PM_LABEL}`, align: 'r', sort: r => r.tonnes ? r.mc2 / r.tonnes : null, render: r => t1(r.tonnes ? r.mc2 / r.tonnes : null), csv: r => (r.tonnes ? pm(r.mc2 / r.tonnes) : null) },
        { key: 'commission', label: 'Provvigioni', align: 'r', render: r => kEur(r.commission), csv: r => r.commission },
        { key: 'net', label: 'Netto', align: 'r', render: r => <span className={r.net < 0 ? 'chip crit' : ''}>{kEur(r.net)}</span>, csv: r => r.net },
        { key: 'netT', label: `Netto ${PM_LABEL}`, align: 'r', sort: r => r.tonnes ? r.net / r.tonnes : null, render: r => t1(r.tonnes ? r.net / r.tonnes : null), csv: r => (r.tonnes ? pm(r.net / r.tonnes) : null) },
        { key: 'share', label: 'Quota ricavi', align: 'r', sort: r => r.revenue, render: r => pct(r.revenue / (pr.cur.totals?.revenue || 1), 1), csv: r => r.revenue / (pr.cur.totals?.revenue || 1) },
      ]} />
    </Panel>
  );
}

function ChurnPanel({ d, pr }) {
  const ch = useMemo(() => churnRisk(d, pr.ctx), [d, pr.ctx]);
  const flagged = (ch.rows || []).filter(r => r.flag);
  return (
    <Panel title="Rischio di abbandono" sub="Clienti di classe A che nelle ultime 8 settimane comprano meno del 70% di quanto atteso dal loro peso abituale" flush>
      {flagged.length ? (
        <Table rows={flagged} initialSort={{ key: 'r', dir: 'asc' }} onRow={r => openDrawer('customer', r.id)} pageSize={8} cols={[
          { key: 'name', label: 'Cliente', render: r => <><b>{r.name}</b><span className="sub">ultima consegna {r.last ? r.last.split('-').reverse().join('/') : '—'}</span></> },
          { key: 'r', label: 'Attuale / atteso', align: 'r', render: r => <Chip kind={r.r < 0.4 ? 'crit' : 'warn'}>{nf(r.r * 100)}%</Chip> },
          { key: 'actual', label: 't (8 sett.)', align: 'r', render: r => <>{nf(r.actual)}<span className="sub">attese {nf(r.expected)}</span></> },
          { key: 'reasons', label: 'Possibili cause', nosort: true, render: r => <span className="small">{r.reasons.length ? r.reasons.join(' · ') : 'nessun segnale: chiedere all’agente'}</span> },
        ]} />
      ) : <Empty title="Nessun cliente importante in calo">I clienti di classe A comprano in linea con il loro andamento abituale.</Empty>}
    </Panel>
  );
}

function LossPanel({ d, pr, cp }) {
  const [kind, setKind] = useState('cliente');
  const opts = kind === 'cliente' ? [...cp.rows].sort((a, b) => b.revenue - a.revenue).map(r => ({ id: r.id, label: `${r.name} · ${kEur(r.revenue)}` })) : (d.agents || []).map(a => ({ id: a.id, label: a.name }));
  const [id, setId] = useState(opts[0]?.id || '');
  const [rate, setRate] = useState((d.settings?.concentration?.lossRate ?? 0.3) * 100);
  const sel = opts.some(o => o.id === id) ? id : opts[0]?.id;
  const L = useMemo(() => (sel ? lossImpact(d, pr.ctx, pr.P, kind === 'cliente' ? { customerId: sel, lossRate: rate / 100 } : { agentId: sel, lossRate: rate / 100 }) : null), [d, pr.ctx, pr.P, kind, sel, rate]);
  return (
    <Panel title="E se perdiamo…" sub="Effetto sull’EBIT di perdere una quota dei volumi di un cliente o del portafoglio di un agente: si perde il margine e i costi fissi si spalmano su meno tonnellate">
      <div className="stack" style={{ gap: 8 }}>
        <Seg options={[{ id: 'cliente', label: 'Cliente' }, { id: 'agente', label: 'Agente' }]} value={kind} onChange={k => { setKind(k); setId(''); }} label="Chi" />
        <Field label={kind === 'cliente' ? 'Cliente' : 'Agente'}><Select value={sel} onChange={setId} options={opts} ariaLabel="Chi si perde" /></Field>
        <Field label={`Volumi persi: ${nf(rate)}%`}><input className="range" type="range" min="10" max="100" step="5" value={rate} onChange={e => setRate(+e.target.value)} aria-label="Quota dei volumi persa" /></Field>
        {L && <div className="kv">
          <dt>Tonnellate perse</dt><dd>{nf(-L.dTonnes)} t ({pct(L.share, 1)} dei ricavi in gioco)</dd>
          <dt>Margine di contribuzione perso</dt><dd>{kEur(L.dMc2)}</dd>
          <dt>Costi fissi per tonnellata</dt><dd>{fmtPm(L.fixedPerT, 2)} → {fmtPm(L.fixedPerT + L.dFixedPerT, 2)}</dd>
          <dt>EBIT del periodo</dt><dd><b>{eurTxt(L.ebit)} → {eurTxt(L.ebitAfter)}</b> ({nf(L.ebit ? L.dEbit / Math.abs(L.ebit) * 100 : 0, 1)}%)</dd>
        </div>}
      </div>
    </Panel>
  );
}

function LogisticsPanel({ d }) {
  const L = logisticsSettings(d);
  const co = d.settings?.company || {};
  const set = (patch, label) => store.settings(st => ({ ...st, logistics: { ...(st.logistics || {}), ...patch } }), label);
  return (
    <Panel title={<span className="row gap-s"><LuSettings2 aria-hidden="true" />Modello del costo di trasporto</span>} sub="Il totale del trasporto resta quello dei costi standard dei prodotti: cambia solo come si ripartisce tra i clienti">
      <div className="form">
        <Field label="Ripartizione"><Seg options={[{ id: 'standard', label: 'Standard per tonnellata' }, { id: 'distanza', label: 'Per distanza e consegne' }]} value={L.mode} onChange={m => { set({ mode: m }, `Trasporto ripartito ${m === 'distanza' ? 'per distanza e consegne' : 'a costo standard'}`); toast('Modello del trasporto aggiornato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }} label="Modello" /></Field>
        <Field label="€ per consegna"><NumInput value={L.perDrop} decimals={0} min={0} onChange={v => set({ perDrop: v ?? 0 }, 'Costo per consegna')} ariaLabel="Euro per consegna" /></Field>
        <Field label="€ per km"><NumInput value={L.perKm} decimals={2} min={0} onChange={v => set({ perKm: v ?? 0 }, 'Costo per km')} ariaLabel="Euro per chilometro" /></Field>
        <Field label="Fattore strada" hint="km stradali / km in linea d’aria"><NumInput value={L.roadFactor} decimals={2} min={1} onChange={v => set({ roadFactor: v ?? 1.3 }, 'Fattore strada')} ariaLabel="Fattore strada" /></Field>
      </div>
      {L.mode === 'distanza' && (co.lat == null || co.lon == null) && <p className="small" style={{ marginTop: 8 }}><LuTriangleAlert aria-hidden="true" /> Mancano le coordinate dello stabilimento (Dati › Impostazioni): finché non ci sono si usa il costo standard.</p>}
    </Panel>
  );
}

/** Sezione «Redditività» della scheda cliente: cascata per tonnellata degli ultimi 12 mesi, classi e azione suggerita. */
export function CustomerProfit({ d, id }) {
  const ctx = ctxOf(d);
  const today = appToday(d);
  const cp = useMemo(() => customerProfit(d, ctx, resolvePeriod({ preset: '12m' }, today)), [d, ctx, today]);
  const r = cp.rows.find(x => x.id === id);
  if (!r) return null;
  return (
    <section className="dsec">
      <span className="eyebrow">Redditività netta · ultimi 12 mesi</span>
      <div className="row gap-s">
        <Chip kind={r.net < 0 ? 'crit' : 'good'}>{fmtPm(r.netT, 1)} netti</Chip>
        <Chip title={QHINT[r.quadrant]}>{r.quadrant}</Chip>
        <Chip title="Classe ABC sui ricavi">ricavi {r.abcRev}</Chip>
        <Chip title="Classe ABC sul margine netto">margine {r.abcNet}</Chip>
        {r.gapT > 0 && <Chip kind="warn" title="Aumento di prezzo per arrivare all’obiettivo di margine netto">prezzo +{fmtPm(r.gapT, 1)}</Chip>}
      </div>
      <CustomerWaterfall r={r} />
      <span className="small muted">{nf(r.tonnes)} t in {nf(r.drops)} consegne (media {nf(r.avgDrop, 1)} t, minima conveniente {nf(r.minDropT, 1)} t) · {nf(r.km)} km · pagamento a {nf(r.termsDays)} giorni.</span>
    </section>
  );
}

