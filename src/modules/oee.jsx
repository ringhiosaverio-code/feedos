/* FeedOS 17 · Produzione › OEE e fermi (pacchetto WP6): OEE dello stabilimento e delle linee nel periodo globale,
 * valore di un punto di OEE, albero delle perdite in ore o in euro, andamento settimanale, fermi per causa,
 * cambi prodotto, turni a confronto e registro dei fermi. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuGauge } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { go } from '../core/router.js';
import { ctxOf, appToday } from '../core/derived.js';
import { nf, dateIt, sum, byId } from '../core/util.js';
import { usePeriod } from '../ui/period.jsx';
import { oee, oeeSummary, oeeWeekly, byShift, changeoverPairs, STOP_REASONS, REASON } from '../engine/oee.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Field, Select, NumInput, Empty } from '../ui/ui.jsx';
import { LineChart, Bars, Legend, SERIES } from '../ui/charts.jsx';
import { Def, HWaterfall, kEur, eurTxt } from './direzione-conto.jsx';

const p1 = v => (v == null || !Number.isFinite(v) ? '—' : nf(v * 100, 1));
const hTxt = v => (v == null || !Number.isFinite(v) ? '—' : `${nf(v, Math.abs(v) < 10 ? 1 : 0)} h`);
const statusOf = (v, target) => (v == null ? undefined : v >= target ? 'ok' : v >= target - 0.1 ? 'warn' : 'bad');
const LOSS_DEF = {
  guasto: 'Fermi per guasto di un componente: si riducono con la manutenzione preventiva (Produzione › Manutenzione).',
  cambio: 'Tempo fra l’ultima tonnellata di un prodotto e la prima buona del successivo: si riduce raggruppando le campagne.',
  micro: 'Fermi brevi (intasamenti, sensori, ripartenze) sommati per turno.',
  speed: 'Ore di marcia oltre quelle che servirebbero alla velocità ideale del prodotto sulla linea.',
  quality: 'Ore spese per tonnellate scartate o per lotti bloccati.',
  residuo: 'Ore pianificate senza marcia né fermo registrato: registrarle rende l’analisi completa.',
};

export function OeeFermi({ d, sel }) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const lines = d.lines || [];
  const lineId = lines.some(l => l.id === sel) ? sel : null;
  const L = lineId ? lines.find(l => l.id === lineId) : null;
  const [unit, setUnit] = useState('h');
  const S = useMemo(() => oeeSummary(d, ctx, per.P), [d, ctx, per.P]);
  const SC = useMemo(() => (per.C && !per.C.budget ? oeeSummary(d, ctx, per.C) : null), [d, ctx, per.C]);
  const O = useMemo(() => oee(d, per.P, { lineId }), [d, per.P, lineId]);
  const W = useMemo(() => oeeWeekly(d, lineId, per.P.to, 26), [d, lineId, per.P.to]);
  // perdite in euro: ore di ogni linea × valore dell'ora della linea (margine perso se satura, costo orario altrimenti)
  const eurLoss = useMemo(() => {
    const acc = {};
    for (const l of lines.filter(x => !lineId || x.id === lineId)) {
      const o = lineId ? O : oee(d, per.P, { lineId: l.id }), v = S.byLine[l.id]?.eurH || 0;
      for (const s of o.lossTree || []) if (s.kind !== 'total' && s.value < 0) (acc[s.key] ||= { key: s.key, label: s.label, value: 0 }).value += -s.value * v;
    }
    return Object.values(acc).filter(x => x.value > 1).sort((a, b) => b.value - a.value);
  }, [d, per.P, lineId, O, S]);
  if (!lines.length) return <Panel title="OEE e fermi"><Empty title="Nessuna linea configurata">Le linee con portata e ore di turno si impostano in Dati › Impostazioni.</Empty></Panel>;
  if (!S.plant) return <Panel title="OEE e fermi"><Empty icon={LuGauge} title="Nessuna produzione con le ore di marcia nel periodo">L’OEE confronta le ore di marcia registrate con le ore di turno delle linee: registra la produzione con le ore (Produzione › Registro) o scegli un altro periodo.</Empty></Panel>;
  const target = S.target;
  const cur = lineId ? S.byLine[lineId] : S.plant;
  const prev = SC ? (lineId ? SC.byLine[lineId] : SC.plant) : null;
  const cmpOf = (a, b, o = {}) => (per.C && !per.C.budget && b != null && a != null ? { cur: a * 100, value: b * 100, kind: 'ratio', good: 'up', unit: 'pt', decimals: 1, label: per.C.short, cov: per.cov, ...o } : undefined);
  const gapTot = lineId ? S.byLine[lineId].gapEur : sum(Object.values(S.byLine), x => x.gapEur || 0);
  const best = lineId ? S.byLine[lineId] : Object.values(S.byLine).sort((a, b) => (b.eurPerPoint || 0) - (a.eurPerPoint || 0))[0];
  const bestLine = lineId ? L : lines.find(l => S.byLine[l.id] === best);
  const scope = L ? L.name : 'stabilimento';
  return (
    <>
      <div className="kpis">
        <Kpi label={<Def text={`OEE = disponibilità × prestazioni × qualità. Obiettivo ${nf(target * 100)}% (impostabile in Dati › Impostazioni). Misura quanta parte delle ore pianificate produce tonnellate buone alla velocità ideale.`}>OEE {L ? 'della linea' : 'dello stabilimento'}</Def>}
          value={p1(cur.oee)} unit="%" status={statusOf(cur.oee, target)} target={`${nf(target * 100)}%`} cmp={cmpOf(cur.oee, prev?.oee)} />
        <Kpi label={<Def text="Ore di marcia ÷ ore pianificate (ore di turno meno manutenzione programmata e mancanza di ordini).">Disponibilità</Def>} value={p1(cur.A)} unit="%" cmp={cmpOf(cur.A, prev?.A)} />
        <Kpi label={<Def text="Ore che servirebbero alla velocità ideale ÷ ore di marcia: misura la velocità persa (trafila usurata, prodotti lenti, rallentamenti).">Prestazioni</Def>} value={p1(cur.P)} unit="%" cmp={cmpOf(cur.P, prev?.P)} />
        <Kpi label={<Def text="Tonnellate buone ÷ tonnellate prodotte (scarti e lotti bloccati esclusi).">Qualità</Def>} value={p1(cur.Q)} unit="%" cmp={cmpOf(cur.Q, prev?.Q)} />
        <Kpi label={<Def text="Valore delle ore da recuperare per portare ogni linea all’OEE obiettivo: margine di contribuzione delle tonnellate perse sulle linee sature, costo orario delle ore in più sulle altre.">Recuperabile all’obiettivo</Def>}
          value={eurTxt(gapTot)} foot={`nel periodo · ${scope}`} />
        {bestLine && <Kpi label={<Def text="Valore di un punto di OEE nel periodo: 1% delle ore pianificate × valore dell’ora della linea.">Un punto di OEE vale</Def>}
          value={eurTxt(best.eurPerPoint)} foot={`${bestLine.name}${best.saturated ? ' · linea satura' : ''}`} />}
      </div>

      <div className="grid g3" id="oee-lines">
        {lines.map(l => {
          const x = S.byLine[l.id];
          return (
            <button key={l.id} className={`kpi linecard ${l.id === lineId ? 'on' : ''}`} onClick={() => go('produzione', 'oee', l.id === lineId ? undefined : l.id)} aria-pressed={l.id === lineId}>
              <span className="lbl">{x.oee != null && <i className="kdot" style={{ background: x.oee >= target ? 'var(--good)' : x.oee >= target - 0.1 ? 'var(--warn)' : 'var(--crit)' }} aria-hidden="true" />}{l.name}{x.saturated && <Chip kind="warn" title="Carico pianificato delle prossime 8 settimane oltre l’85% della capacità utile: un’ora persa è margine perso">satura</Chip>}</span>
              <span className="val">{p1(x.oee)}<small>% OEE</small></span>
              <span className="foot"><span>D {p1(x.A)}% · P {p1(x.P)}% · Q {p1(x.Q)}%</span></span>
              <span className="foot"><span>{x.gapEur > 0 ? `${eurTxt(x.gapEur)} recuperabili · 1 punto = ${eurTxt(x.eurPerPoint)}` : 'All’obiettivo'}</span></span>
            </button>
          );
        })}
      </div>

      {(O.residualPct > 0.1 || O.warnPerf) && (
        <div className={`note ${O.warnPerf ? 'crit' : 'warn'}`} style={{ marginBottom: 16 }}>
          {O.residualPct > 0.1 && <><b>{nf(O.residualPct * 100)}% delle ore pianificate senza marcia né fermo registrato.</b> L’OEE resta calcolato, ma le perdite non sono attribuite a una causa: registra i fermi del turno qui sotto. </>}
          {O.warnPerf && <><b>Prestazioni oltre il 105%.</b> La velocità ideale di alcuni prodotti è troppo bassa: aggiornala nei percorsi del prodotto (t/h ideali per linea).</>}
        </div>
      )}

      <div className="split">
        <Panel title={`Albero delle perdite · ${scope}`} sub={unit === 'h' ? `Dalle ${hTxt(O.Tpian)} pianificate alle ${hTxt(O.goodH)} a valore (tonnellate buone alla velocità ideale)` : 'Valore delle ore perse per causa: margine perso sulle linee sature, costo orario sulle altre'}
          actions={<Seg label="Unità" value={unit} onChange={setUnit} options={[{ id: 'h', label: 'Ore' }, { id: 'eur', label: 'Euro' }]} />} id="oee-tree">
          {unit === 'h'
            ? <HWaterfall steps={(O.lossTree || []).map(s => ({ ...s, def: s.def || LOSS_DEF[s.key], color: s.kind === 'total' ? undefined : REASON[s.key]?.planned ? 'var(--axis)' : undefined }))} fmt={hTxt} ariaLabel={`Albero delle perdite in ore, ${scope}`} />
            : eurLoss.length ? <Bars data={eurLoss.map((x, i) => ({ ...x, value: x.value / 1000, color: SERIES[i % 8] }))} unit="k€" decimals={1} ariaLabel={`Perdite in euro per causa, ${scope}`} /> : <Empty title="Nessuna perdita valorizzabile" />}
        </Panel>
        <Panel title="OEE settimana per settimana" sub={`Ultime 26 settimane complete · ${scope}`}>
          <LineChart labels={W.map(w => dateIt(w.week, 'dm'))} height={240} unit="%" decimals={0} xEvery={4} area={false} markLast={false} yMin={40} yMax={100}
            series={[{ key: 'oee', label: 'OEE', color: 'var(--s1)', values: W.map(w => (w.oee == null ? null : w.oee * 100)) },
              { key: 'A', label: 'Disponibilità', color: 'var(--s3)', values: W.map(w => (w.A == null ? null : w.A * 100)) },
              { key: 'P', label: 'Prestazioni', color: 'var(--s5)', values: W.map(w => (w.P == null ? null : w.P * 100)) }]}
            refs={[{ y: target * 100, label: 'obiettivo', kind: 'muted' }]} ariaLabel={`OEE settimanale, ${scope}`} />
          <Legend items={[{ label: 'OEE', color: 'var(--s1)', line: true }, { label: 'Disponibilità', color: 'var(--s3)', line: true }, { label: 'Prestazioni', color: 'var(--s5)', line: true }]} />
        </Panel>
      </div>

      <div className="grid g2">
        <StopsByReason O={O} scope={scope} />
        <Changeovers d={d} P={per.P} lineId={lineId} S={S} />
      </div>
      <Shifts d={d} P={per.P} lineId={lineId} scope={scope} />
      <StopLog d={d} P={per.P} lineId={lineId} />
    </>
  );
}

function StopsByReason({ O, scope }) {
  const rows = STOP_REASONS.filter(r => O.byReason[r.id] > 0).map(r => ({ key: r.id, label: r.label, value: O.byReason[r.id], color: r.planned ? 'var(--axis)' : r.id === 'guasto' ? 'var(--crit)' : 'var(--s1)', planned: r.planned }))
    .sort((a, b) => (a.planned === b.planned ? b.value - a.value : a.planned ? 1 : -1));
  return (
    <Panel title="Fermi per causa" sub={`Ore nel periodo · ${scope} · in grigio i fermi programmati, che non riducono la disponibilità`}>
      {rows.length ? <Bars data={rows} unit="h" decimals={0} ariaLabel={`Ore di fermo per causa, ${scope}`} /> : <Empty title="Nessun fermo registrato nel periodo">Registra i fermi con la causa per vedere dove si perde il tempo.</Empty>}
    </Panel>
  );
}

function Changeovers({ d, P, lineId, S }) {
  const C = useMemo(() => changeoverPairs(d, P, lineId), [d, P, lineId]);
  const prod = byId(d.products || []), line = byId(d.lines || []);
  // le coppie che valgono di più: ore di cambio × valore dell'ora della linea
  const rows = C.pairs.map(p => {
    const h = p.avgMin != null ? (p.n * p.avgMin) / 60 : null;
    return { ...p, id: p.key, h, eur: h != null ? h * (S.byLine[p.lineId]?.eurH || 0) : null };
  }).sort((a, b) => (b.eur || 0) - (a.eur || 0)).slice(0, 8);
  const lns = (d.lines || []).filter(l => !lineId || l.id === lineId);
  const top = rows[0];
  return (
    <Panel title="Cambi prodotto" sub={lns.map(l => `${l.name}: ${nf(C.perWeek[l.id] || 0, 1)} a settimana${C.avgMin[l.id] != null ? `, ${nf(C.avgMin[l.id])} min l’uno` : ''}`).join(' · ')}>
      {rows.length ? (
        <>
          <Table rows={rows} pageSize={8} cols={[
            { key: 'pair', label: 'Da → a', render: r => <span>{prod[r.from]?.code || r.from} → {prod[r.to]?.code || r.to}{!lineId && <span className="sub">{line[r.lineId]?.name}</span>}</span>, sort: r => `${r.from}${r.to}` },
            { key: 'n', label: 'Cambi', align: 'r', render: r => nf(r.n) },
            { key: 'h', label: 'Ore', align: 'r', render: r => hTxt(r.h) },
            { key: 'eur', label: 'Valore', align: 'r', render: r => (r.eur != null ? eurTxt(r.eur) : '—') },
          ]} />
          {top && top.n >= 10 && top.eur > 0 && <p className="small muted" style={{ marginTop: 8 }}>Il cambio che costa di più è {prod[top.from]?.code} → {prod[top.to]?.code} sulla {line[top.lineId]?.name.toLowerCase()} ({nf(top.n)} volte nel periodo): raggruppare le campagne dei due prodotti a settimane alterne dimezza i cambi e libera circa {hTxt(top.h / 2)}, {eurTxt(top.eur / 2)}.</p>}
        </>
      ) : <Empty title="Nessun cambio prodotto nel periodo" />}
    </Panel>
  );
}

function Shifts({ d, P, lineId, scope }) {
  const rows = useMemo(() => byShift(d, P, lineId).map(r => ({ ...r, id: r.shift })), [d, P, lineId]);
  if (rows.length < 2) return null;
  const best = Math.max(...rows.map(r => r.tph || 0));
  return (
    <Panel title="Turni a confronto" sub={`Resa e qualità per turno nel periodo · ${scope}`}>
      <Table rows={rows} cols={[
        { key: 'shift', label: 'Turno', render: r => <b>{r.shift} turno</b> },
        { key: 'n', label: 'Campagne', align: 'r', render: r => nf(r.n) },
        { key: 'tonnes', label: 'Tonnellate', align: 'r', render: r => nf(r.tonnes) },
        { key: 'hours', label: 'Ore di marcia', align: 'r', render: r => nf(r.hours) },
        { key: 'tph', label: 't/h', align: 'r', render: r => <span>{nf(r.tph, 2)}{r.tph === best && <Chip kind="good">migliore</Chip>}</span> },
        { key: 'P', label: 'Prestazioni', align: 'r', render: r => `${p1(r.P)}%` },
        { key: 'Q', label: 'Qualità', align: 'r', render: r => `${nf(r.Q * 100, 2)}%` },
      ]} />
    </Panel>
  );
}

function StopLog({ d, P, lineId }) {
  const today = appToday(d);
  const lines = d.lines || [];
  const [f, setF] = useState({ date: today, lineId: lineId || lines[0]?.id, reason: 'guasto', minutes: 30, assetId: '', note: '' });
  const set = p => setF(x => ({ ...x, ...p }));
  const assets = (d.assets || []).filter(a => a.lineId === f.lineId);
  const line = byId(lines), asset = byId(d.assets || []);
  const rows = useMemo(() => (d.stops || []).filter(s => s.date >= P.from && s.date <= P.to && (!lineId || s.lineId === lineId)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [d.stops, P, lineId]);
  const save = () => {
    if (!(f.minutes > 0)) { toast('Indica i minuti di fermo', 'err'); return; }
    store.add('stops', { date: f.date, lineId: f.lineId, reason: f.reason, minutes: Math.round(f.minutes), assetId: f.reason === 'guasto' && f.assetId ? f.assetId : null, note: f.note.trim(), shift: null, source: 'manuale' },
      `Fermo registrato: ${line[f.lineId]?.name}, ${REASON[f.reason]?.label.toLowerCase()} ${nf(f.minutes)} min`);
    toast('Fermo registrato', 'ok', { label: 'Annulla', fn: () => store.undo() });
    set({ minutes: 30, note: '' });
  };
  return (
    <Panel title="Registro dei fermi" sub={`${nf(rows.length)} fermi nel periodo${lineId ? ` · ${line[lineId]?.name}` : ''} · i guasti con il componente alimentano MTBF e MTTR della manutenzione`} id="oee-log">
      <div className="form" style={{ marginBottom: 12 }}>
        <Field label="Data"><input type="date" className="input" value={f.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
        <Field label="Linea"><Select value={f.lineId} onChange={v => set({ lineId: v, assetId: '' })} options={lines.map(l => ({ id: l.id, label: l.name }))} /></Field>
        <Field label="Causa"><Select value={f.reason} onChange={v => set({ reason: v })} options={STOP_REASONS.map(r => ({ id: r.id, label: r.label + (r.planned ? ' (programmato)' : '') }))} /></Field>
        <Field label="Minuti"><NumInput value={f.minutes} onChange={v => set({ minutes: v })} decimals={0} /></Field>
        {f.reason === 'guasto' && <Field label="Componente"><Select value={f.assetId} onChange={v => set({ assetId: v })} options={[{ id: '', label: '—' }, ...assets.map(a => ({ id: a.id, label: a.name }))]} /></Field>}
        <Field label="Nota"><input className="input" value={f.note} onChange={e => set({ note: e.target.value })} placeholder="facoltativa" /></Field>
      </div>
      <div className="row" style={{ marginBottom: 12 }}><Btn kind="primary" icon={LuPlus} onClick={save}>Registra il fermo</Btn></div>
      <Table rows={rows} pageSize={10} exportName="fermi" cols={[
        { key: 'date', label: 'Data', render: r => dateIt(r.date) },
        { key: 'lineId', label: 'Linea', render: r => line[r.lineId]?.name || r.lineId, csv: r => line[r.lineId]?.name || r.lineId },
        { key: 'reason', label: 'Causa', render: r => <Chip kind={REASON[r.reason]?.planned ? 'outline' : r.reason === 'guasto' ? 'crit' : ''}>{REASON[r.reason]?.label || r.reason}</Chip>, csv: r => REASON[r.reason]?.label || r.reason },
        { key: 'minutes', label: 'Minuti', align: 'r', render: r => nf(r.minutes) },
        { key: 'assetId', label: 'Componente', render: r => asset[r.assetId]?.name || '—', csv: r => asset[r.assetId]?.name || '' },
        { key: 'note', label: 'Nota', render: r => <span className="small">{r.note || ''}</span> },
        { key: 'x', label: '', nosort: true, csv: false, render: r => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il fermo" onClick={e => { e.stopPropagation(); store.remove('stops', r.id, 'Fermo eliminato'); toast('Fermo eliminato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }} /> },
      ]} />
    </Panel>
  );
}
