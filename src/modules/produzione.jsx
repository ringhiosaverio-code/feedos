/* FeedOS 16 · Produzione: piano delle linee con carico e riequilibrio, registrazioni che aggiornano
 * scorte e tracciabilità (prelievo FIFO dai lotti), energia per tonnellata con deriva per linea. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuWrench, LuArrowRightLeft, LuCheck, LuTriangleAlert, LuX, LuDownload } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, signals } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, mondayOf, median, round } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { registerRunOps } from '../engine/operations.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv } from '../ui/ui.jsx';
import { LineChart, Columns, Legend, SERIES } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

const UTIL = 0.9; // quota utile della capacità teorica (cambi prodotto, pulizie, fermi brevi)
export const capOf = l => l.capacityTph * l.hoursWeek * UTIL;

export function Produzione({ route }) {
  const d = useData();
  const tab = route.tab || 'piano';
  const sigs = signals(d).filter(s => s.area === 'produzione');
  return (
    <>
      <PageHead title="Produzione" lead="Piano delle linee con il carico di ogni settimana, registrazioni di produzione che scaricano le materie prime lotto per lotto e creano il lotto di prodotto, energia per tonnellata con la deriva di ogni linea."
        actions={<Btn kind="primary" icon={LuPlus} onClick={() => go('produzione', 'registro', 'nuova')}>Registra produzione</Btn>}
        tabs={NAV.produzione.tabs} tab={tab} onTab={t => go('produzione', t)} />
      {sigs.length > 0 && tab !== 'energia' && <Panel title="Da decidere in produzione" flush><SignalList items={sigs} limit={2} compact /></Panel>}
      {tab === 'piano' && <Piano d={d} />}
      {tab === 'registro' && <Registro d={d} nuova={route.id === 'nuova'} />}
      {tab === 'energia' && <Energia d={d} sel={route.id} sigs={sigs} />}
    </>
  );
}

/* ---------------- piano ---------------- */
function usePlanLoad(d) {
  return useMemo(() => {
    const today = appToday(d);
    const weeks = [...new Set(d.plan.map(p => p.week))].filter(w => w >= mondayOf(today)).sort().slice(0, 8);
    const load = {};
    for (const l of d.lines) for (const w of weeks) load[l.id + w] = { line: l, week: w, t: 0, cap: capOf(l), items: [] };
    for (const p of d.plan) { const c = load[p.lineId + p.week]; if (c) { c.t += +p.tonnes || 0; c.items.push(p); } }
    for (const c of Object.values(load)) c.u = c.cap ? c.t / c.cap : 0;
    return { weeks, load };
  }, [d.plan, d.lines, appToday(d)]);
}

/** Proposte di riequilibrio: dalla linea sovraccarica a una linea dello stesso tipo con capacità libera nella stessa settimana,
 *  altrimenti anticipo alla settimana precedente sulla stessa linea. */
function rebalance(d, weeks, load) {
  const out = [];
  const spare = Object.fromEntries(Object.entries(load).map(([k, c]) => [k, c.cap - c.t]));
  for (const w of weeks) {
    for (const l of d.lines) {
      const c = load[l.id + w];
      let over = c.t - c.cap;
      if (over <= 1) continue;
      const items = [...c.items].sort((a, b) => b.tonnes - a.tonnes);
      for (const other of d.lines.filter(x => x.id !== l.id && x.kind === l.kind)) {
        const key = other.id + w;
        for (const it of items) {
          if (over <= 0.5 || spare[key] <= 0.5) break;
          const mv = Math.min(Math.ceil(over), Math.floor(spare[key]), it.tonnes);
          if (mv < 5) continue;
          out.push({ kind: 'linea', from: l, to: other, week: w, item: it, t: mv });
          over -= mv; spare[key] -= mv; spare[l.id + w] += mv;
        }
      }
      const wi = weeks.indexOf(w);
      if (over > 0.5 && wi > 1) {
        const prev = weeks[wi - 1], key = l.id + prev;
        const it = items[0];
        const mv = Math.min(Math.ceil(over), Math.floor(spare[key]), it.tonnes);
        if (mv >= 5) { out.push({ kind: 'anticipo', from: l, to: l, week: w, toWeek: prev, item: it, t: mv }); over -= mv; spare[key] -= mv; }
      }
      if (over > 0.5) out.push({ kind: 'residuo', from: l, week: w, t: Math.ceil(over) });
    }
  }
  return out;
}

function Piano({ d }) {
  const I = idx(d); const today = appToday(d);
  const { weeks, load } = usePlanLoad(d);
  const [cell, setCell] = useState(null);
  const [wk, setWk] = useState(null);
  const props = useMemo(() => rebalance(d, weeks, load), [d.plan, weeks, load]);
  const w0 = weeks[0];
  const thisW = sum(Object.values(load).filter(c => c.week === w0), c => c.t);
  const capW = sum(d.lines, capOf);
  const overs = Object.values(load).filter(c => c.t - c.cap > 1);
  const done = sum(d.runs.filter(r => r.date >= w0 && r.date <= today), r => r.tonnes);
  const shownW = cell ? cell.week : (wk || w0);
  const rows = d.plan.filter(p => p.week === shownW && (!cell || p.lineId === cell.line));
  const apply = pr => {
    const it = pr.item;
    const ops = [{ kind: 'update', coll: 'plan', id: it.id, patch: { tonnes: it.tonnes - pr.t } }];
    const target = d.plan.find(p => p.week === (pr.toWeek || pr.week) && p.productId === it.productId && p.lineId === pr.to.id);
    if (target) ops.push({ kind: 'update', coll: 'plan', id: target.id, patch: { tonnes: target.tonnes + pr.t } });
    else ops.push({ kind: 'add', coll: 'plan', obj: { week: pr.toWeek || pr.week, productId: it.productId, lineId: pr.to.id, tonnes: pr.t, status: 'previsto', note: 'Riequilibrio del carico' } });
    store.batch(ops, `Piano riequilibrato: ${nf(pr.t)} t di ${I.prod[it.productId]?.name} ${pr.kind === 'linea' ? `su ${pr.to.name}` : `anticipate alla settimana del ${dateIt(pr.toWeek, 'dm')}`}`);
    toast('Piano aggiornato: fabbisogni e carichi ricalcolati', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const [np, setNp] = useState({ week: w0, productId: d.products[0]?.id, tonnes: 50 });
  const addPlan = () => {
    const p = I.prod[np.productId]; if (!p || !(np.tonnes > 0)) return;
    store.add('plan', { week: np.week, productId: p.id, lineId: p.lineId, tonnes: np.tonnes, status: 'previsto' }, `Piano: +${nf(np.tonnes)} t di ${p.name} (settimana del ${dateIt(np.week, 'dm')})`);
    toast('Aggiunto al piano');
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Piano di questa settimana" value={nf(thisW)} unit="t" foot={`già prodotte ${nf(done)} t`} />
        <Kpi label="Carico medio delle linee" value={nf(sum(Object.values(load), c => c.t) / Math.max(1, capW * weeks.length) * 100)} unit="%" foot={`capacità utile ${nf(capW)} t/settimana`} />
        <Kpi label="Settimane-linea oltre la capacità" value={overs.length} foot={overs.length ? `${nf(sum(overs, c => c.t - c.cap))} t da spostare` : 'nessun sovraccarico'} />
        <Kpi label="Proposte di riequilibrio" value={props.filter(p => p.kind !== 'residuo').length} foot="da confermare una per una" />
      </div>
      <Panel title="Carico delle linee" sub={`Tonnellate pianificate sulla capacità utile (${nf(UTIL * 100)}% della teorica) · clic su una cella per filtrare il piano`} flush id="prod-load">
        <div className="tw">
          <table className="t load">
            <thead><tr><th>Linea</th>{weeks.map(w => <th key={w} className="r">{dateIt(w, 'dm')}</th>)}</tr></thead>
            <tbody>{d.lines.map(l => (
              <tr key={l.id}>
                <td><b>{l.name}</b><span className="sub">{l.capacityTph} t/h · {l.hoursWeek} h/sett. · {nf(capOf(l))} t utili</span></td>
                {weeks.map(w => { const c = load[l.id + w]; const on = cell && cell.line === l.id && cell.week === w; return (
                  <td key={w} className={`lc ${c.t - c.cap > 1 ? 'over' : c.u > 0.92 ? 'hi' : ''} ${on ? 'on' : ''}`} onClick={() => setCell(on ? null : { line: l.id, week: w })} title={`${l.name}, settimana del ${dateIt(w)}: ${nf(c.t)} t su ${nf(c.cap)} t`}>
                    <b>{nf(c.u * 100)}%</b><span>{nf(c.t)} t</span><i style={{ width: `calc((100% - 20px) * ${Math.min(1, c.u).toFixed(3)})` }} />
                  </td>); })}
              </tr>))}</tbody>
          </table>
        </div>
      </Panel>
      {props.length > 0 && (
        <Panel title="Riequilibrio proposto" sub="Spostamenti verso una linea dello stesso tipo con capacità libera, oppure anticipi: verificare filiere, diametri e pulizie prima di confermare" flush id="prod-rebalance">
          <div className="signals">{props.map((p, i) => (
            <article key={i} className={`sig ${p.kind === 'residuo' ? 'critico' : 'info'}`}>
              <span className="ic" aria-hidden="true">{p.kind === 'residuo' ? <LuTriangleAlert /> : <LuArrowRightLeft />}</span>
              <div>
                <h4>{p.kind === 'linea' ? `Spostare ${nf(p.t)} t di ${I.prod[p.item.productId]?.name} da ${p.from.name} a ${p.to.name}` : p.kind === 'anticipo' ? `Anticipare ${nf(p.t)} t di ${I.prod[p.item.productId]?.name} alla settimana del ${dateIt(p.toWeek, 'dm')}` : `${p.from.name}: restano ${nf(p.t)} t oltre la capacità`}</h4>
                <p className="why">Settimana del {dateIt(p.week, 'dm')}: {p.kind === 'residuo' ? 'nessuna linea compatibile ha capacità libera. Servono ore in più (turno aggiuntivo) o uno spostamento di consegne.' : `la linea di origine è al ${nf(load[p.from.id + p.week].u * 100)}% della capacità utile.`}</p>
              </div>
              <div className="btns">{p.kind !== 'residuo' && <Btn small kind="primary" icon={LuCheck} onClick={() => apply(p)}>Applica</Btn>}</div>
            </article>))}</div>
        </Panel>
      )}
      <div className="split">
        <Panel title={cell ? `Piano · ${I.line[cell.line]?.name}, settimana del ${dateIt(cell.week, 'dm')}` : `Piano della settimana del ${dateIt(shownW, 'dm')}`} sub={`${nf(sum(rows, p => p.tonnes))} t · modifiche immediate, annullabili`} flush
          actions={cell ? <Btn small kind="ghost" icon={LuX} onClick={() => setCell(null)}>Tutte le linee</Btn> : <select className="select" style={{ width: 170 }} value={shownW} onChange={e => setWk(e.target.value)} aria-label="Settimana">{weeks.map(w => <option key={w} value={w}>Settimana del {dateIt(w, 'dm')}</option>)}</select>}>
          <Table rows={rows} pageSize={30} initialSort={{ key: 'tonnes', dir: 'desc' }} cols={[
            { key: 'product', label: 'Prodotto', sort: p => I.prod[p.productId]?.name, render: p => <><b>{I.prod[p.productId]?.name}</b><span className="sub">{I.prod[p.productId]?.form}</span></> },
            { key: 'lineId', label: 'Linea', render: p => <select className="select" style={{ height: 30, width: 150 }} value={p.lineId} onChange={e => store.update('plan', p.id, { lineId: e.target.value }, `Piano: ${I.prod[p.productId]?.name} su ${I.line[e.target.value]?.name}`)} aria-label="Linea">{d.lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select> },
            { key: 'tonnes', label: 't', align: 'r', render: p => <div style={{ width: 90, marginLeft: 'auto' }}><NumInput value={p.tonnes} decimals={0} slim onChange={v => store.update('plan', p.id, { tonnes: Math.max(0, v || 0) }, `Piano: ${I.prod[p.productId]?.name} ${nf(v || 0)} t`)} ariaLabel="Tonnellate" /></div> },
            { key: 'status', label: 'Stato', render: p => <Chip kind={p.status === 'confermato' ? 'good' : ''}>{p.status}</Chip> },
            { key: 'x', label: '', nosort: true, render: p => <Btn small kind="ghost" icon={LuTrash2} title="Togli dal piano" onClick={() => { store.remove('plan', p.id, `Piano: tolto ${I.prod[p.productId]?.name} (${dateIt(p.week, 'dm')})`); toast('Tolto dal piano', 'ok', { label: 'Annulla', fn: () => store.undo() }); }} /> },
          ]} />
        </Panel>
        <Panel title="Aggiungi al piano" sub="La linea proposta è quella abituale del prodotto">
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Settimana"><Select value={np.week} onChange={v => setNp(x => ({ ...x, week: v }))} options={weeks.map(w => ({ id: w, label: 'dal ' + dateIt(w) }))} /></Field>
            <Field label="Prodotto"><Select value={np.productId} onChange={v => setNp(x => ({ ...x, productId: v }))} options={d.products.map(p => ({ id: p.id, label: p.name }))} /></Field>
            <Field label="Tonnellate"><NumInput value={np.tonnes} onChange={v => setNp(x => ({ ...x, tonnes: v || 0 }))} decimals={0} /></Field>
            <Btn kind="primary" icon={LuPlus} onClick={addPlan}>Aggiungi</Btn>
            <p className="small muted">Ogni modifica del piano ricalcola subito fabbisogni di materie prime, carichi e ordini pianificati.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- registro ---------------- */
function Registro({ d, nuova }) {
  const I = idx(d); const today = appToday(d);
  const [days, setDays] = useState(30), [line, setLine] = useState(''), [q, setQ] = useState('');
  const runs = d.runs.filter(r => r.date > addDays(today, -days) && (!line || r.lineId === line));
  const view = filterRows(runs, q, [r => I.prod[r.productId]?.name, r => I.lot[r.lotId]?.code]);
  const t = sum(runs, r => r.tonnes);
  return (
    <>
      {nuova && <NuovaProduzione d={d} />}
      <div className="kpis">
        <Kpi label={`Prodotto negli ultimi ${days} giorni`} value={nf(t)} unit="t" foot={`${runs.length} registrazioni`} />
        <Kpi label="Resa oraria media" value={nf(t / Math.max(1, sum(runs, r => r.hours || 0)), 1)} unit="t/h" />
        <Kpi label="Elettricità" value={nf(sum(runs, r => r.kwh || 0) / Math.max(1, t), 1)} unit="kWh/t" foot="delle linee, esclusi i servizi generali" />
        <Kpi label="Scarti" value={nf(sum(runs, r => r.waste || 0) / Math.max(1, t) * 100, 2)} unit="%" />
      </div>
      <Panel title="Registrazioni di produzione" sub="Ogni registrazione crea un lotto di prodotto con i lotti di materia prima usati · clic per il lotto" flush
        actions={<><Seg options={[{ id: 7, label: '7 gg' }, { id: 30, label: '30 gg' }, { id: 90, label: '90 gg' }]} value={days} onChange={setDays} label="Periodo" />
          <select className="select" style={{ width: 170 }} value={line} onChange={e => setLine(e.target.value)} aria-label="Linea"><option value="">Tutte le linee</option>{d.lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <SearchBox value={q} onChange={setQ} placeholder="Prodotto o lotto" id="run-search" />
          {!nuova && <Btn small kind="primary" icon={LuPlus} onClick={() => go('produzione', 'registro', 'nuova')}>Nuova</Btn>}
          <Btn small icon={LuDownload} title="Esporta CSV" onClick={() => download(`produzione-${stamp()}.csv`, toCSV(view, [{ key: 'date', label: 'Data' }, { label: 'Lotto', value: r => I.lot[r.lotId]?.code }, { label: 'Prodotto', value: r => I.prod[r.productId]?.name }, { label: 'Linea', value: r => I.line[r.lineId]?.name }, { key: 'tonnes', label: 't' }, { key: 'hours', label: 'ore' }, { key: 'kwh', label: 'kWh' }, { key: 'gplKg', label: 'GPL kg' }, { key: 'waste', label: 'Scarti t' }, { key: 'formulaVersion', label: 'Versione formula' }]), 'text/csv;charset=utf-8')} /></>}>
        <Table rows={view} onRow={r => openDrawer('lot', r.lotId)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={40} cols={[
          { key: 'date', label: 'Data', render: r => <>{dateIt(r.date, 'dm')}<span className="sub">turno {r.shift || '—'}</span></> },
          { key: 'lot', label: 'Lotto', sort: r => I.lot[r.lotId]?.code, render: r => <span className="code">{I.lot[r.lotId]?.code}</span> },
          { key: 'product', label: 'Prodotto', sort: r => I.prod[r.productId]?.name, render: r => <><b>{I.prod[r.productId]?.name}</b><span className="sub">formula v{r.formulaVersion}</span></> },
          { key: 'lineId', label: 'Linea', render: r => I.line[r.lineId]?.name },
          { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes, 1) },
          { key: 'tph', label: 't/h', align: 'r', sort: r => r.hours ? r.tonnes / r.hours : null, render: r => r.hours ? nf(r.tonnes / r.hours, 1) : '—' },
          { key: 'kwht', label: 'kWh/t', align: 'r', sort: r => r.kwh / r.tonnes, render: r => r.kwh ? nf(r.kwh / r.tonnes, 1) : '—' },
          { key: 'gplt', label: 'GPL kg/t', align: 'r', sort: r => r.gplKg / r.tonnes, render: r => nf((r.gplKg || 0) / r.tonnes, 2) },
          { key: 'status', label: 'Lotto', sort: r => I.lot[r.lotId]?.status, render: r => { const s = I.lot[r.lotId]?.status; return <Chip kind={s === 'rilasciato' ? 'good' : s === 'bloccato' ? 'crit' : 'warn'}>{s}</Chip>; } },
        ]} />
      </Panel>
    </>
  );
}

function NuovaProduzione({ d }) {
  const I = idx(d); const today = appToday(d);
  const [f, setF] = useState({ date: today, productId: d.products[0]?.id, lineId: d.products[0]?.lineId, tonnes: 24, hours: null, kwh: null, gplKg: null, waste: 0, shift: '1°' });
  const [err, setErr] = useState(null);
  const line = I.line[f.lineId], prod = I.prod[f.productId], form = I.form[prod?.formulaId];
  const set = patch => { setF(x => ({ ...x, ...patch })); setErr(null); };
  const est = { hours: f.tonnes && line ? round(f.tonnes / (line.capacityTph * 0.88), 1) : null, kwh: f.tonnes && line ? Math.round(f.tonnes * line.kwhPerT) : null, gplKg: f.tonnes && line ? Math.round(f.tonnes * line.gplKgPerT) : null };
  const save = () => {
    if (!(f.tonnes > 0)) { setErr({ text: 'Indica le tonnellate prodotte.' }); return; }
    const r = registerRunOps(d, { ...f, hours: f.hours ?? est.hours, kwh: f.kwh ?? est.kwh, gplKg: f.gplKg ?? est.gplKg });
    if (r.error) { setErr({ text: r.error }); return; }
    if (r.shortages.length) { setErr({ text: 'Mancano materie prime tracciate: registra prima l’arrivo o accetta i lotti in attesa.', list: r.shortages }); return; }
    store.batch(r.ops, `Produzione registrata: ${nf(f.tonnes, 1)} t di ${prod.name} (lotto ${r.lot.code})`);
    toast(`Lotto ${r.lot.code} creato: ${r.lot.comp.length} lotti di materia prima scaricati`, 'ok', { label: 'Apri lotto', fn: () => openDrawer('lot', r.lot.id) });
    go('produzione', 'registro');
  };
  return (
    <Panel title="Nuova registrazione di produzione" sub="Le materie prime si scaricano dai lotti accettati più vecchi (FIFO) secondo la formula approvata; il lotto nasce «in attesa» del rilascio" id="prod-new"
      actions={<Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={() => go('produzione', 'registro')} />}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="form">
          <Field label="Data"><input type="date" className="input" value={f.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
          <Field label="Prodotto"><Select value={f.productId} onChange={v => set({ productId: v, lineId: I.prod[v]?.lineId || f.lineId })} options={d.products.map(p => ({ id: p.id, label: p.name }))} id="run-prod" /></Field>
          <Field label="Linea"><Select value={f.lineId} onChange={v => set({ lineId: v })} options={d.lines.map(l => ({ id: l.id, label: l.name }))} /></Field>
          <Field label="Turno"><Select value={f.shift} onChange={v => set({ shift: v })} options={['1°', '2°', '3°']} /></Field>
        </div>
        <div className="form">
          <Field label="Tonnellate"><NumInput value={f.tonnes} onChange={v => set({ tonnes: v })} decimals={2} id="run-t" /></Field>
          <Field label="Ore di marcia" hint={est.hours ? `stima ${nf(est.hours, 1)} h` : ''}><NumInput value={f.hours} onChange={v => set({ hours: v })} decimals={1} placeholder={est.hours ? nf(est.hours, 1) : ''} /></Field>
          <Field label="Elettricità kWh" hint={est.kwh ? `tipico ${nf(est.kwh)} kWh` : ''}><NumInput value={f.kwh} onChange={v => set({ kwh: v })} decimals={0} placeholder={est.kwh ? nf(est.kwh) : ''} /></Field>
          <Field label="GPL kg" hint={est.gplKg != null ? `tipico ${nf(est.gplKg)} kg` : ''}><NumInput value={f.gplKg} onChange={v => set({ gplKg: v })} decimals={0} placeholder={est.gplKg != null ? nf(est.gplKg) : ''} /></Field>
          <Field label="Scarti t"><NumInput value={f.waste} onChange={v => set({ waste: v || 0 })} decimals={2} /></Field>
        </div>
        {form && <p className="small muted">Formula {form.code} versione {form.version}: {form.lines.length} materie prime, {nf(sum(form.lines, l => l.kg) * (f.tonnes || 0) / 1000, 1)} t da scaricare. Se lasci vuoti ore ed energia, FeedOS usa i valori tipici della linea (da correggere con le letture reali).</p>}
        {err && <div className="note crit"><b>{err.text}</b>{err.list && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{err.list.map(s => <li key={s.ing}>{I.ing[s.ing]?.name}: mancano {nf(s.kg / 1000, 2)} t</li>)}</ul>}</div>}
        <div className="row"><Btn kind="primary" icon={LuCheck} onClick={save}>Registra e crea il lotto</Btn><Btn kind="ghost" onClick={() => go('produzione', 'registro')}>Annulla</Btn></div>
      </div>
    </Panel>
  );
}

/* ---------------- energia e linee ---------------- */
export function lineStats(d, today, weeksBack = 26) {
  const w0 = mondayOf(addDays(today, -7 * (weeksBack - 1)));
  const weeks = Array.from({ length: weeksBack }, (_, k) => addDays(w0, 7 * k));
  const out = {};
  for (const l of d.lines) {
    const acc = Object.fromEntries(weeks.map(w => [w, { t: 0, kwh: 0, gpl: 0, h: 0, waste: 0 }]));
    for (const r of d.runs) { if (r.lineId !== l.id) continue; const w = mondayOf(r.date); const a = acc[w]; if (!a) continue; a.t += r.tonnes; a.kwh += r.kwh || 0; a.gpl += r.gplKg || 0; a.h += r.hours || 0; a.waste += r.waste || 0; }
    const kwhT = weeks.map(w => acc[w].t > 5 ? acc[w].kwh / acc[w].t : null);
    const base = median(kwhT.slice(0, weeksBack - 5).filter(v => v != null));
    const last4 = weeks.slice(-4).reduce((s, w) => ({ t: s.t + acc[w].t, kwh: s.kwh + acc[w].kwh, gpl: s.gpl + acc[w].gpl, h: s.h + acc[w].h, waste: s.waste + acc[w].waste }), { t: 0, kwh: 0, gpl: 0, h: 0, waste: 0 });
    const cur = last4.t ? last4.kwh / last4.t : null;
    const tYear = sum(d.runs.filter(r => r.lineId === l.id && r.date > addDays(today, -365)), r => r.tonnes);
    out[l.id] = { line: l, weeks, acc, kwhT, gplT: weeks.map(w => acc[w].t > 5 ? acc[w].gpl / acc[w].t : null), tph: weeks.map(w => acc[w].h > 0 ? acc[w].t / acc[w].h : null),
      base, cur, drift: base && cur ? cur / base - 1 : null, last4, tYear, gplCur: last4.t ? last4.gpl / last4.t : null, tphCur: last4.h ? last4.t / last4.h : null, wasteCur: last4.t ? last4.waste / last4.t : null };
  }
  return out;
}

function Energia({ d, sel, sigs }) {
  const today = appToday(d); const I = idx(d);
  const S = useMemo(() => lineStats(d, today), [d.runs, d.lines, today]);
  const en = d.settings?.energy || {};
  const cur = S[sel] || Object.values(S).sort((a, b) => (b.drift || 0) - (a.drift || 0))[0];
  const l = cur.line;
  const annualCost = cur.drift > 0 ? (cur.cur - cur.base) * cur.tYear * (+en.kwhPrice || 0) : 0;
  const compl = d.complaints.filter(c => c.date > addDays(today, -45) && I.run[I.lot[c.lotId]?.runId]?.lineId === l.id);
  const task = () => {
    store.add('tasks', { title: `Verifica energetica ${l.name}: trafila, condizionatore e taratura`, detail: `Consumo ultime 4 settimane ${nf(cur.cur, 1)} kWh/t contro ${nf(cur.base, 1)} di riferimento (${sf(cur.drift * 100, 1)}%). Costo stimato ${nf(annualCost)} € l’anno.`, area: 'produzione', owner: 'Manutenzione', due: addDays(today, 7), status: 'aperto', priority: 'alta', source: 'energia', createdAt: today }, `Attività di manutenzione: ${l.name}`);
    toast('Attività assegnata alla manutenzione', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const labels = cur.weeks.map(w => dateIt(w, 'dm'));
  return (
    <>
      {sigs.length > 0 && <Panel title="Da decidere in produzione" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="grid g3" id="prod-lines">
        {Object.values(S).map(s => (
          <button key={s.line.id} className={`kpi linecard ${s.line.id === l.id ? 'on' : ''}`} onClick={() => go('produzione', 'energia', s.line.id)}>
            <span className="lbl">{s.line.name}</span>
            <span className="val">{nf(s.cur, 1)}<small>kWh/t ultime 4 sett.</small></span>
            <span className="foot"><span>{s.drift != null && <span className={`delta ${s.drift > 0.07 ? 'up bad' : s.drift < -0.03 ? 'down good' : ''}`}>{sf(s.drift * 100, 1)}%</span>} rispetto a {nf(s.base, 1)} di riferimento</span></span>
          </button>
        ))}
      </div>
      <div className="split">
        <Panel title={`${l.name} · elettricità per tonnellata`} sub="Media settimanale delle registrazioni · riferimento = mediana delle 21 settimane precedenti" id="prod-energy">
          <LineChart labels={labels} height={240} unit="kWh/t" decimals={1} xEvery={4}
            series={[{ key: 'k', label: 'kWh/t', color: SERIES[l.color - 1] || 'var(--s1)', values: cur.kwhT }]}
            refs={[{ y: cur.base, label: 'riferimento', kind: 'muted' }, { y: cur.base * 1.07, label: '+7%', kind: 'crit' }]} ariaLabel={`Elettricità per tonnellata della ${l.name}`} />
        </Panel>
        <Panel title="Lettura" sub={`${nf(cur.tYear)} t prodotte in 12 mesi`}>
          <div className="stack" style={{ gap: 12 }}>
            <Kv items={[['Elettricità', `${nf(cur.cur, 1)} kWh/t (riferimento ${nf(cur.base, 1)})`], ['GPL', `${nf(cur.gplCur, 2)} kg/t`], ['Resa oraria', `${nf(cur.tphCur, 1)} t/h su ${l.capacityTph} nominali`], ['Scarti', `${nf((cur.wasteCur || 0) * 100, 2)}%`], ['Costo energetico', `${nf((cur.cur || 0) * (+en.kwhPrice || 0) + (cur.gplCur || 0) * (+en.gplPrice || 0), 2)} €/t`]]} />
            {cur.drift > 0.07 ? <div className="note crit"><b>Consumo in aumento del {nf(cur.drift * 100, 1)}%.</b> Se continua costa circa {nf(annualCost)} € l’anno in elettricità{compl.length ? `; negli ultimi 45 giorni ${compl.length} reclami riguardano lotti di questa linea (${[...new Set(compl.map(c => c.category.toLowerCase()))].join(', ')})` : ''}. Cause tipiche: trafila usurata, vapore del condizionatore, rulli da regolare.</div>
              : <div className="note good">Consumo in linea con il riferimento.</div>}
            {cur.drift > 0.07 && <Btn kind="primary" icon={LuWrench} onClick={task}>Assegna una verifica alla manutenzione</Btn>}
            {compl.length > 0 && <Btn small kind="ghost" onClick={() => go('qualita', 'reclami')}>Vedi i reclami collegati</Btn>}
          </div>
        </Panel>
      </div>
      <div className="grid g2">
        <Panel title="GPL per tonnellata" sub="Condizionamento a vapore delle linee pellet">
          <LineChart labels={labels} height={180} unit="kg/t" decimals={2} xEvery={4} series={[{ key: 'g', label: 'kg/t', color: 'var(--s2)', values: cur.gplT }]} ariaLabel="GPL per tonnellata" />
        </Panel>
        <Panel title="Resa oraria" sub="Tonnellate per ora di marcia">
          <LineChart labels={labels} height={180} unit="t/h" decimals={1} xEvery={4} series={[{ key: 't', label: 't/h', color: 'var(--s3)', values: cur.tph }]} refs={[{ y: l.capacityTph, label: 'nominale', kind: 'muted' }]} ariaLabel="Resa oraria" />
        </Panel>
      </div>
    </>
  );
}
