/* FeedOS 17 · Produzione › Bilancio di massa (pacchetto WP6): per materia prima apertura, arrivi, prelievi, rettifiche
 * e chiusura a libro nel periodo globale; conte fisiche con la differenza da registrare (rettifica FIFO sui lotti,
 * annullabile); calo effettivo fra due conte consecutive e suo andamento; lotti che non quadrano. */
import React, { useMemo, useState } from 'react';
import { LuScale, LuCheck, LuPlus, LuTriangleAlert } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { isClosedMonth } from '../core/schema.js';
import { nf, sf, dateIt, relDays, monthLabel, byId } from '../core/util.js';
import { usePeriod } from '../ui/period.jsx';
import { plantBalance, shrinkSummary, shrinkTrend, integrity, bookAt, countOps, adjustStockOps } from '../engine/massbalance.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm } from '../ui/ui.jsx';
import { LineChart } from '../ui/charts.jsx';
import { Def, eurTxt } from './direzione-conto.jsx';

const T1 = v => (v == null || !Number.isFinite(v) ? '—' : nf(v, Math.abs(v) < 100 ? 1 : 0));
const sT = v => (v == null || !Number.isFinite(v) ? '—' : sf(v, 1));
/** Calo tollerato fra due conte, in quota dei prelievi (settings.ops.shrinkTolPct, di base 0,4%). */
const tolOf = d => { const v = +d?.settings?.ops?.shrinkTolPct; return (v > 0 ? v : 0.4) / 100; };

export function BilancioMassa({ d }) {
  const per = usePeriod(d);
  const today = appToday(d);
  const [view, setView] = useState('conte');
  const [q, setQ] = useState('');
  const rows = useMemo(() => plantBalance(d, per.P), [d, per.P]);
  const S = useMemo(() => shrinkSummary(d, null, per.P), [d, per.P]);
  const trend = useMemo(() => shrinkTrend(d), [d.stockCounts, d.ingLots, d.lots, d.adjustments, d.ingredients]);
  const bad = useMemo(() => integrity(d), [d.ingLots, d.lots, d.adjustments]);
  const tol = tolOf(d);
  const ing = byId(d.ingredients || []);
  const shown = filterRows(view === 'conte' ? rows.filter(r => r.counts > 0) : rows, q, ['name', 'category']);
  const register = r => {
    const c = (d.stockCounts || []).find(x => x.id === r.countId);
    if (!c) return;
    // un mese chiuso non accetta movimenti: la differenza della conta va nel mese corrente
    const closed = isClosedMonth(d, c.date);
    const date = closed ? today : c.date;
    const physicalT = closed ? bookAt(d, r.ingId, today) + r.deltaT : +c.measuredT;
    confirm(`Registrare la conta di ${r.name}?`, (
      <div className="stack" style={{ gap: 8 }}>
        <p>La conta del {dateIt(c.date)} ha trovato <b>{T1(c.measuredT)} t</b> contro <b>{T1(r.bookAtCount)} t</b> a libro: rettifica di <b>{sT(r.deltaT)} t</b> ({eurTxt(r.pendingEur)}) {r.deltaT < 0 ? 'tolta dai lotti più vecchi' : 'aggiunta al lotto più recente'}.</p>
        {closed && <p className="small muted">Il mese di {monthLabel(c.date.slice(0, 7), false)} è chiuso: la rettifica porta la data di oggi ({dateIt(today)}).</p>}
        <p className="small muted">L’operazione si può annullare. Le rimanenze e i lotti si aggiornano subito.</p>
      </div>
    ), () => {
      const ops = adjustStockOps(d, { ingId: r.ingId, physicalT, date, countId: c.id, note: closed ? `Conta fisica del ${dateIt(c.date)}` : 'Conta fisica' });
      if (store.batch(ops, `Inventario registrato: ${r.name} ${sT(r.deltaT)} t`)) toast(`Libro di ${r.name} allineato alla conta`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    }, { ok: 'Registra la rettifica' });
  };
  const lastCountRows = rows.filter(r => r.countDate === S.lastCount);
  return (
    <>
      <div className="kpis">
        <Kpi label={<Def text="Calo fra due conte fisiche consecutive ÷ prelievi dello stesso intervallo, sommato sulle materie prime contate nel periodo. Una conta non registrata lascia la differenza nel libro: conta solo la parte maturata dalla conta precedente.">Calo effettivo</Def>}
          value={S.shrinkPct != null ? nf(S.shrinkPct * 100, 2) : '—'} unit="%" status={S.shrinkPct == null ? undefined : S.shrinkPct <= tol * 0.75 ? 'ok' : S.shrinkPct <= tol ? 'warn' : 'bad'} target={`≤ ${nf(tol * 100, 1)}%`}
          foot={S.lossT ? `${T1(S.lossT)} t · ${eurTxt(S.lossEur)} fra le conte` : 'servono almeno due conte'} />
        <Kpi label={<Def text="Differenze delle ultime conte non ancora registrate, valorizzate al prezzo FIFO dei lotti in giacenza: valore che il magazzino a libro sovrastima (o sottostima).">Differenze da registrare</Def>}
          value={eurTxt(S.unexplainedEur)} status={S.pending ? (Math.abs(S.unexplainedEur) > 5000 ? 'bad' : 'warn') : 'ok'} foot={S.pending ? `${sT(S.pendingT)} t su ${S.pending} materie prime` : 'Tutte le conte registrate'} />
        <Kpi label="Ultima conta fisica" value={S.lastCount ? dateIt(S.lastCount, 'dm') : '—'} foot={S.lastCount ? `${relDays(S.lastCount, today)} · ${lastCountRows.length} materie prime` : 'Nessuna conta nel periodo'} />
        <Kpi label={<Def text="Lotti di materia prima in cui ricevuto − prelevato + rettifiche non è uguale al residuo: errori di registrazione da correggere prima di fidarsi del libro.">Lotti che non quadrano</Def>} value={nf(bad.length)} status={bad.length ? 'bad' : 'ok'} foot={bad.length ? 'da verificare' : 'tutti i lotti quadrano'} />
        <Kpi label={<Def text="Rettifiche del periodo non legate a una conta fisica (scorte corrette a mano, cali dichiarati).">Rettifiche senza conta</Def>} value={sT(S.adjOther)} unit="t" foot="nel periodo" />
      </div>

      <div className="grid g2">
        <Panel title="Calo mese per mese" sub={`Fra due conte consecutive, in % dei prelievi · tolleranza ${nf(tol * 100, 1)}%`}>
          {trend.length >= 2
            ? <LineChart labels={trend.map(t => monthLabel(t.date.slice(0, 7)))} height={200} unit="%" decimals={2} area={false} yMin={0}
              series={[{ key: 'pct', label: 'Calo', color: 'var(--s2)', values: trend.map(t => (t.pct == null ? null : t.pct * 100)) }]}
              refs={[{ y: tol * 100, label: 'tolleranza', kind: 'crit' }]} ariaLabel="Calo effettivo mensile fra le conte fisiche" />
            : <Empty icon={LuScale} title="Servono almeno due conte">Il calo si misura fra due conte fisiche della stessa materia prima.</Empty>}
        </Panel>
        <NewCount d={d} today={today} />
      </div>

      <Panel title="Materie prime: libro e conte" sub={`Periodo ${dateIt(per.P.from)} – ${dateIt(per.P.to)} · chiusura a libro = apertura + arrivi − prelievi + rettifiche · differenza = conta − libro alla data della conta`} flush id="mb-table"
        actions={<><Seg label="Materie prime" value={view} onChange={setView} options={[{ id: 'conte', label: 'Con conta' }, { id: 'tutte', label: 'Tutte' }]} /><SearchBox value={q} onChange={setQ} placeholder="Cerca" /></>}>
        <Table rows={shown} rowKey={r => r.ingId} onRow={r => openDrawer('ingredient', r.ingId)} initialSort={{ key: 'pendingEur', dir: 'asc' }} exportName="bilancio-di-massa" cols={[
          { key: 'name', label: 'Materia prima', render: r => <span><b>{r.name}</b><span className="sub">{r.category}</span></span> },
          { key: 'opening', label: 'Apertura', align: 'r', render: r => T1(r.opening) },
          { key: 'in', label: 'Arrivi', align: 'r', render: r => T1(r.in) },
          { key: 'out', label: 'Prelievi', align: 'r', render: r => T1(r.out) },
          { key: 'adj', label: 'Rettifiche', align: 'r', render: r => (Math.abs(r.adj) >= 0.05 ? sT(r.adj) : '—') },
          { key: 'closingBook', label: 'Libro a fine periodo', align: 'r', render: r => T1(r.closingBook) },
          { key: 'physical', label: 'Ultima conta', align: 'r', render: r => (r.physical != null ? <span>{T1(r.physical)}<span className="sub">{dateIt(r.countDate, 'dm')}</span></span> : '—') },
          { key: 'pendingEur', label: 'Differenza', align: 'r', sort: r => (r.deltaT == null ? null : r.applied ? 0 : r.pendingEur), render: r => (r.deltaT == null ? '—'
            : <span className={r.deltaT < -0.05 ? 'pr-neg' : ''}>{sT(r.deltaT)} t<span className="sub">{r.applied ? 'registrata' : eurTxt(r.pendingEur)}</span></span>), csv: r => r.deltaT },
          { key: 'shrinkPct', label: 'Calo fra le conte', align: 'r', render: r => (r.shrinkPct == null ? '—' : <Chip kind={r.shrinkPct > tol ? 'crit' : r.shrinkPct > tol * 0.75 ? 'warn' : 'good'}>{nf(r.shrinkPct * 100, 2)}%</Chip>), csv: r => r.shrinkPct },
          { key: 'act', label: '', nosort: true, csv: false, render: r => (r.applied === false && Math.abs(r.deltaT || 0) >= 0.05
            ? <Btn small kind="primary" icon={LuCheck} onClick={e => { e.stopPropagation(); register(r); }}>Registra</Btn>
            : r.applied ? <Chip kind="good">registrata</Chip> : null) },
        ]} />
      </Panel>

      {bad.length > 0 && (
        <Panel title="Lotti che non quadrano" sub="ricevuto − prelevato + rettifiche ≠ residuo: correggi la registrazione o il residuo del lotto">
          <Table rows={bad} onRow={r => openDrawer('ingLot', r.id)} cols={[
            { key: 'code', label: 'Lotto', render: r => <span className="code">{r.code}</span> },
            { key: 'ingId', label: 'Materia prima', render: r => ing[r.ingId]?.name || r.ingId },
            { key: 'gap', label: 'Scarto t', align: 'r', render: r => <span className="pr-neg"><LuTriangleAlert aria-hidden="true" /> {sf(r.gap, 3)}</span> },
          ]} />
        </Panel>
      )}
    </>
  );
}

function NewCount({ d, today }) {
  const opts = (d.ingredients || []).filter(i => (+i.stock || 0) > 0 || (d.stockCounts || []).some(c => c.ingId === i.id)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const [f, setF] = useState({ ingId: opts[0]?.id || '', date: today, measuredT: null });
  const set = p => setF(x => ({ ...x, ...p }));
  const book = f.ingId && f.date ? bookAt(d, f.ingId, f.date) : null;
  const diff = book != null && f.measuredT != null ? f.measuredT - book : null;
  const save = () => {
    if (!f.ingId || f.measuredT == null || f.measuredT < 0) { toast('Indica materia prima e quantità contata', 'err'); return; }
    const name = (d.ingredients || []).find(i => i.id === f.ingId)?.name || '';
    store.batch(countOps(d, { ingId: f.ingId, date: f.date, measuredT: f.measuredT, by: 'Magazzino' }), `Conta fisica: ${name} ${nf(f.measuredT, 1)} t`);
    toast('Conta salvata: registrala per allineare il libro', 'ok', { label: 'Annulla', fn: () => store.undo() });
    set({ measuredT: null });
  };
  if (!opts.length) return null;
  return (
    <Panel title="Nuova conta fisica" sub="Silos e magazzino misurati: la differenza con il libro alla stessa data diventa una rettifica quando la registri">
      <div className="stack" style={{ gap: 10 }}>
        <div className="form">
          <Field label="Materia prima"><Select value={f.ingId} onChange={v => set({ ingId: v })} options={opts.map(i => ({ id: i.id, label: i.name }))} /></Field>
          <Field label="Data"><input type="date" className="input" value={f.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
          <Field label="Contato t"><NumInput value={f.measuredT} onChange={v => set({ measuredT: v })} decimals={1} /></Field>
        </div>
        <p className="small muted">A libro alla data: <b>{book != null ? `${nf(book, 1)} t` : '—'}</b>{diff != null && <> · differenza <b className={diff < 0 ? 'pr-neg' : ''}>{sf(diff, 1)} t</b>{book > 0 && ` (${sf(diff / book * 100, 1)}%)`}</>}</p>
        <div><Btn small kind="primary" icon={LuPlus} onClick={save}>Salva la conta</Btn></div>
      </div>
    </Panel>
  );
}
