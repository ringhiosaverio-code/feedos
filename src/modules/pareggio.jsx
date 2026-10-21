/* FeedOS 17 · Pareggio e leva operativa (pacchetto WP3): punto di pareggio in tonnellate e in euro, margine di
 * sicurezza, leva operativa, struttura dei costi variabili e fissi, andamento mensile e assorbimento dei fissi per linea.
 * Costi fissi da Direzione › Costi fissi (consuntivo; i mesi senza consuntivo usano il budget e sono marcati «stimato»). */
import React, { useMemo } from 'react';
import { ctxOf } from '../core/derived.js';
import { nf, pct, monthLabel } from '../core/util.js';
import { usePeriod } from '../ui/period.jsx';
import { costStructure, bepSeries, bepCurve, absorption } from '../engine/breakeven.js';
import { effectiveCoverage } from '../engine/pnl.js';
import { Panel, Table, Chip, Kpi, Empty } from '../ui/ui.jsx';
import { LineChart, StackBar, Legend } from '../ui/charts.jsx';
import { Def, money, kEur } from './direzione-conto.jsx';

const CENTER_COLOR = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const VAR_LABEL = { raw: 'Materie prime', shrink: 'Calo', energy: 'Energia', varConv: 'Trasformazione variabile', pack: 'Imballi', logistics: 'Trasporto', commission: 'Provvigioni' };

export function Pareggio({ d }) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const cs = useMemo(() => costStructure(d, ctx, per.P), [d, ctx, per.P]);
  const C = per.C && !per.C.budget ? per.C : null;
  const csC = useMemo(() => (C ? costStructure(d, ctx, C) : null), [d, ctx, C]);
  const cov = C ? Math.min(effectiveCoverage(d, ctx, per.P) ?? 1, effectiveCoverage(d, ctx, C) ?? 1) : null;
  const months = useMemo(() => { const m = []; let [y, mo] = per.P.to.slice(0, 7).split('-').map(Number); for (let i = 0; i < 13; i++) { m.unshift(`${y}-${String(mo).padStart(2, '0')}`); mo--; if (!mo) { mo = 12; y--; } } return m; }, [per.P.to]);
  const series = useMemo(() => bepSeries(d, ctx, months), [d, ctx, months]);
  const curve = useMemo(() => (cs ? bepCurve(cs) : null), [cs]);
  const abs = useMemo(() => absorption(d, ctx, per.P), [d, ctx, per.P]);
  if (!cs || !cs.tonnes) return <Panel title="Pareggio"><Empty title="Servono consegne e costi fissi nel periodo">Il punto di pareggio usa il margine di contribuzione delle consegne e i costi fissi per centro (Direzione › Costi fissi).</Empty></Panel>;
  const cmpOf = (cur, prev, o = {}) => (C && prev != null ? { cur, value: prev, label: C.short, cov, kind: 'ratio', good: 'up', decimals: 1, ...o } : undefined);
  const centers = Object.fromEntries((d.costCenters || []).map(c => [c.id, c]));
  const varParts = Object.entries(cs.variableParts || {}).filter(([, v]) => v > 0).map(([k, v], i) => ({ key: k, label: VAR_LABEL[k] || k, value: v, color: CENTER_COLOR[i % 8] }));
  const fixParts = Object.entries(cs.byCenter || {}).filter(([, v]) => v > 0).map(([k, v], i) => ({ key: k, label: centers[k]?.name || k, value: v, color: CENTER_COLOR[(i + 3) % 8] }));
  const pts = curve?.points || [];
  return (
    <>
      <div className="kpis">
        <Kpi label={<Def text="Tonnellate per coprire i costi fissi del periodo con il margine di contribuzione II medio per tonnellata: costi fissi ÷ MdC II €/t.">Punto di pareggio</Def>}
          value={nf(cs.bepT)} unit="t" foot={`${money(cs.bepEur).value} ${money(cs.bepEur).unit} di ricavi`} cmp={cmpOf(cs.bepT, csC?.bepT, { good: 'down', decimals: 0, unit: 't', kind: 'flow' })} />
        <Kpi label={<Def text="Quota delle tonnellate vendute oltre il punto di pareggio: (t − pareggio) ÷ t. Dice di quanto possono calare i volumi prima di andare in perdita.">Margine di sicurezza</Def>}
          value={nf(cs.mos * 100, 1)} unit="%" status={cs.mos < 0.1 ? 'bad' : cs.mos < 0.2 ? 'warn' : 'ok'} foot={`${nf(cs.mosT)} t sopra il pareggio`} cmp={cmpOf(cs.mos * 100, csC ? csC.mos * 100 : null, { unit: 'punti' })} />
        <Kpi label={<Def text="Leva operativa: MdC II ÷ EBIT. Con leva 5 un calo dei volumi dell’1% riduce l’EBIT di circa il 5%.">Leva operativa</Def>}
          value={cs.dol != null && Number.isFinite(cs.dol) && cs.ebit > 0 ? nf(cs.dol, 1) : '—'} foot={cs.ebit > 0 ? `EBIT ${kEur(cs.ebit)}` : 'EBIT negativo nel periodo'} />
        <Kpi label="Costi fissi per tonnellata" value={nf(cs.fixedT, 2)} unit="€/t" foot={`${kEur(cs.cf)} nel periodo, di cui ${kEur(cs.cfNonCash)} ammortamenti`} cmp={cmpOf(cs.fixedT, csC?.fixedT, { good: 'down', unit: '€/t' })} />
        <Kpi label="MdC II per tonnellata" value={nf(cs.mcT, 2)} unit="€/t" foot={`${pct(cs.mcPct, 1)} dei ricavi`} cmp={cmpOf(cs.mcT, csC?.mcT, { unit: '€/t' })} />
      </div>
      <div className="split">
        <Panel title="Diagramma di redditività" sub={`Ricavi e costi totali (variabili + fissi) al variare delle tonnellate, con i prezzi e i costi medi del periodo; pareggio a ${nf(cs.bepT)} t, volume attuale ${nf(cs.tonnes)} t`}>
          <LineChart labels={pts.map(p => nf(p.t / 1000, 1) + ' kt')} height={250} unit="€" decimals={0} markLast={false} area={false}
            series={[{ key: 'r', label: 'Ricavi', color: 'var(--s3)', values: pts.map(p => p.revenue) }, { key: 'c', label: 'Costi totali', color: 'var(--s2)', values: pts.map(p => p.cost) }, { key: 'f', label: 'Costi fissi', color: 'var(--axis)', values: pts.map(p => p.fixed) }]}
            ariaLabel="Ricavi e costi in funzione delle tonnellate" />
          <Legend items={[{ label: 'Ricavi', color: 'var(--s3)', line: true }, { label: 'Costi totali', color: 'var(--s2)', line: true }, { label: 'Costi fissi', color: 'var(--axis)', line: true }]} />
        </Panel>
        <Panel title="Margine di sicurezza mese per mese" sub="Tonnellate oltre il pareggio sulle tonnellate del mese; i mesi in corso o con costi fissi stimati sono indicati">
          <LineChart labels={series.map(m => monthLabel(m.month))} height={250} unit="%" decimals={0}
            series={[{ key: 'mos', label: 'Margine di sicurezza', color: 'var(--s1)', values: series.map(m => (m.tonnes && !m.open && (m.cov ?? 1) >= 0.9 ? m.mos * 100 : null)) }]}
            refs={[{ y: 0, label: 'pareggio', kind: 'muted' }]} ariaLabel="Margine di sicurezza mensile" />
          <p className="small muted" style={{ marginTop: 6 }}>{series.some(m => m.open || (m.cov ?? 1) < 0.9) ? `Esclusi i mesi parziali: ${series.filter(m => m.open || (m.cov ?? 1) < 0.9).map(m => monthLabel(m.month, false)).join(', ')}.` : ''} Pareggio mensile da {nf(Math.min(...series.filter(m => m.bepT > 0 && !m.open && (m.cov ?? 1) >= 0.9).map(m => m.bepT)))} a {nf(Math.max(...series.filter(m => m.bepT > 0 && !m.open && (m.cov ?? 1) >= 0.9).map(m => m.bepT)))} t.</p>
        </Panel>
      </div>
      <Panel title="Struttura dei costi" sub={`Variabili ${kEur(cs.variable)} (${pct(cs.variable / (cs.variable + cs.cf), 0)}) e fissi ${kEur(cs.cf)} per centro di costo`}>
        <div className="stack" style={{ gap: 12 }}>
          <div><span className="eyebrow">Costi variabili</span><StackBar parts={varParts} ariaLabel="Composizione dei costi variabili" /><Legend items={varParts.map(p => ({ label: `${p.label} ${kEur(p.value, 0)}`, color: p.color }))} /></div>
          <div><span className="eyebrow">Costi fissi per centro</span><StackBar parts={fixParts} ariaLabel="Composizione dei costi fissi" /><Legend items={fixParts.map(p => ({ label: `${p.label} ${kEur(p.value, 0)}`, color: p.color }))} /></div>
        </div>
      </Panel>
      <Panel title="Assorbimento dei costi fissi di stabilimento per linea" sub="Tariffa oraria sulla capacità (costi fissi di stabilimento ÷ ore utili): sotto-assorbimento = ore non lavorate pagate comunque" flush>
        <Table rows={abs.rows || []} exportName="assorbimento-linee" cols={[
          { key: 'name', label: 'Linea', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {nf(r.runs)} campagne</span></>, csv: r => r.name },
          { key: 'hours', label: 'Ore lavorate', align: 'r', render: r => <>{nf(r.hours)}<span className="sub">su {nf(r.capacityHours)} utili</span></>, csv: r => r.hours },
          { key: 'util', label: 'Utilizzo', align: 'r', render: r => <Chip kind={r.util > 1 ? 'warn' : r.util < 0.75 ? 'warn' : 'good'}>{nf(r.util * 100)}%</Chip>, csv: r => r.util },
          { key: 'rate', label: 'Tariffa €/h', align: 'r', render: r => nf(r.rate, 0), csv: r => r.rate },
          { key: 'actual', label: 'Fissi della linea', align: 'r', render: r => kEur(r.actual), csv: r => r.actual },
          { key: 'absorbed', label: 'Assorbiti', align: 'r', render: r => kEur(r.absorbed), csv: r => r.absorbed },
          { key: 'underOver', label: <Def text="Assorbiti − effettivi: negativo = capacità pagata e non usata, positivo = linea sopra la capacità utile.">Sotto/sovra</Def>, csvLabel: 'Sotto/sovra assorbimento', align: 'r', render: r => <span className={r.underOver < 0 ? 'chip warn' : 'chip good'}>{kEur(r.underOver)}</span>, csv: r => r.underOver },
          { key: 'perT', label: 'Fissi €/t', align: 'r', sort: r => (r.tonnes ? r.actual / r.tonnes : null), render: r => nf(r.tonnes ? r.actual / r.tonnes : null, 2), csv: r => (r.tonnes ? r.actual / r.tonnes : null) },
        ]} />
      </Panel>
    </>
  );
}
