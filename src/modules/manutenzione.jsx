/* FeedOS 17 · Manutenzione leggera (pacchetto WP6): componenti delle linee con contatori alimentati dalle campagne,
 * scadenze del piano, guasti (MTBF/MTTR dai fermi), costo per tonnellata, rientro della sostituzione della trafila
 * e ordini di lavoro (attività dell'area produzione con il componente collegato).
 * Contratto della fondazione: la scheda laterale AssetD({d, id}), aperta con openDrawer('asset', id). */
import React, { useMemo, useState } from 'react';
import { LuWrench, LuCalendarClock, LuCheck, LuPlus } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, addDays, daysBetween, relDays, sum, byId } from '../core/util.js';
import { PM_LABEL, pm, nfPm, fmtPm } from '../core/units.js';
import { assetStatus, reliability, maintenanceCost, dieReplacement, workOrderOps, completeWorkOrderOps, maintenanceSummary, isOpenWo, ASSET_KINDS } from '../engine/maintenance.js';
import { Panel, Kpi, Table, Chip, Btn, Field, Select, NumInput, Empty, Drawer, Kv } from '../ui/ui.jsx';
import { Def, eurTxt } from './direzione-conto.jsx';

const unitTxt = u => (u === 'giorni' ? 'giorni' : u === 'h' ? 'ore' : 't');
const dueKind = n => (n == null ? '' : n <= 7 ? 'crit' : n <= 30 ? 'warn' : '');

function Meter({ used, label }) {
  const u = Math.max(0, used || 0);
  const color = u >= 1 ? 'var(--crit)' : u >= 0.85 ? 'var(--serious)' : u >= 0.7 ? 'var(--warn)' : 'var(--good)';
  return <span className="meter" role="img" aria-label={label} title={label} style={{ minWidth: 80 }}><i style={{ width: Math.min(100, u * 100) + '%', background: color }} /></span>;
}

function useAssetRows(d, today) {
  return useMemo(() => {
    const line = byId(d.lines || []);
    return (d.assets || []).map(a => {
      const st = assetStatus(d, a, today), rel = reliability(d, a, today), mc = maintenanceCost(d, a, today);
      return { ...a, st, rel, mc, lineName: line[a.lineId]?.name || 'Stabilimento', dueIn: st.dueDate ? daysBetween(today, st.dueDate) : null, open: (d.tasks || []).filter(t => t.assetId === a.id && isOpenWo(t)) };
    });
  }, [d.assets, d.runs, d.stops, d.tasks, d.lines, today]);
}

export function Manutenzione({ d }) {
  const today = appToday(d);
  const rows = useAssetRows(d, today);
  const dies = useMemo(() => rows.filter(r => r.kind === 'trafila').map(r => ({ r, x: dieReplacement(d, r, today) })).filter(x => x.x && x.x.months != null && x.x.months < 24).sort((a, b) => a.x.months - b.x.months), [rows, d, today]);
  const plant = useMemo(() => maintenanceSummary(d, today), [d.stops, d.runs, d.tasks, today]);
  if (!rows.length) return <Panel title="Manutenzione"><Empty icon={LuWrench} title="Nessun componente censito">Aggiungi i componenti delle linee (trafile, rulli, condizionatori…) con il piano di manutenzione: i contatori di tonnellate e ore si aggiornano con le registrazioni di produzione.</Empty></Panel>;
  const due30 = rows.filter(r => r.dueIn != null && r.dueIn <= 30), overdue = rows.filter(r => r.dueIn != null && r.dueIn <= 0);
  const open = (d.tasks || []).filter(isOpenWo).sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : 1));
  const asset = byId(d.assets || []), line = byId(d.lines || []);
  return (
    <>
      <div className="kpis">
        <Kpi label="In scadenza entro 30 giorni" value={nf(due30.length)} unit={due30.length === 1 ? 'componente' : 'componenti'} status={overdue.length ? 'bad' : due30.length ? 'warn' : 'ok'}
          foot={due30.length ? due30.slice(0, 2).map(r => `${r.code || r.name} ${relDays(r.st.dueDate, today)}`).join(' · ') : 'Nessuna scadenza vicina'} />
        <Kpi label="Guasti in 12 mesi" value={nf(plant.failures)} foot={`${nf(plant.downH)} ore di fermo`} />
        <Kpi label={<Def text="Mean time between failures: ore di marcia delle linee negli ultimi 12 mesi ÷ numero di guasti.">MTBF dello stabilimento</Def>} value={plant.mtbf != null ? nf(plant.mtbf) : '—'} unit="h" foot="ore di marcia fra due guasti" />
        <Kpi label="Costo di manutenzione" value={eurTxt(plant.cost)} foot={plant.perT != null ? `${fmtPm(plant.perT, 2)} · ${plant.prev} preventivi, ${plant.corr} correttivi` : '12 mesi'} />
        <Kpi label="Ordini di lavoro aperti" value={nf(open.length)} foot={open.length ? `il primo ${relDays(open[0].due, today)}` : 'Nessuno'} />
      </div>

      {dies.map(({ r, x }) => (
        <Panel key={r.id} title={`${r.name}: la sostituzione si ripaga in ${nf(x.months, 1)} mesi`} sub={`Usura al ${nf((r.st.used || 0) * 100)}% del piano · confronto delle ultime 4 settimane con le settimane da −30 a −5`} id={`die-${r.id}`}
          actions={r.open.length ? <Chip kind="good" icon={LuCalendarClock}>pianificata {relDays(r.open[0].due, today)}</Chip>
            : <Btn kind="primary" icon={LuCalendarClock} onClick={() => { store.batch(workOrderOps(d, { assetId: r.id, kind: 'preventiva', due: addDays(today, 7), cost: r.replaceCost, title: `Sostituzione: ${r.name}`, today }), `Ordine di lavoro: sostituzione ${r.name}`); toast('Sostituzione pianificata fra 7 giorni', 'ok', { label: 'Annulla', fn: () => store.undo() }); }}>Pianifica la sostituzione</Btn>}>
          <div className="kpis">
            <Kpi label="Energia in più" value={eurTxt(x.energy)} unit="/anno" foot={`${nf(x.kwhCur, 1)} kWh/t contro ${nf(x.kwhBase, 1)}`} />
            <Kpi label={<Def text="Ore di marcia in più all’anno per produrre le stesse tonnellate alla portata attuale, valutate al costo orario della linea.">Portata persa</Def>} value={eurTxt(x.speed)} unit="/anno" foot={x.tphCur && x.tphBase ? `${nf(x.tphCur, 2)} t/h contro ${nf(x.tphBase, 2)} · ${nf(x.hoursLost)} h/anno` : '—'} />
            <Kpi label="Risparmio con la trafila nuova" value={eurTxt(x.saving)} unit="/anno" />
            <Kpi label="Costo della sostituzione" value={eurTxt(x.cost)} foot={`rientro in ${nf(x.months, 1)} mesi`} status={x.months <= 6 ? 'ok' : x.months <= 12 ? 'warn' : undefined} />
          </div>
        </Panel>
      ))}

      <Panel title="Componenti delle linee" sub="Contatori alimentati dalle registrazioni di produzione (tonnellate o ore di marcia dall’ultimo intervento) · scadenza stimata con il ritmo delle ultime 8 settimane" flush>
        <Table rows={rows} onRow={r => openDrawer('asset', r.id)} initialSort={{ key: 'due', dir: 'asc' }} exportName="componenti" cols={[
          { key: 'name', label: 'Componente', render: r => <span><b>{r.name}</b><span className="sub">{r.code} · {ASSET_KINDS[r.kind] || r.kind}</span></span>, csv: r => r.name },
          { key: 'lineName', label: 'Linea' },
          { key: 'used', label: 'Contatore', sort: r => r.st.used ?? -1, render: r => (r.st.every ? <span className="stack" style={{ gap: 4 }}><Meter used={r.st.used} label={`${nf((r.st.used || 0) * 100)}% del piano`} /><span className="small muted">{nf(r.st.counter)} su {nf(r.st.every)} {unitTxt(r.st.unit)}</span></span> : '—'), csv: r => r.st.used },
          { key: 'due', label: 'Scadenza', sort: r => r.st.dueDate || '9999', render: r => (r.st.dueDate ? <span>{dateIt(r.st.dueDate)} <Chip kind={dueKind(r.dueIn)}>{relDays(r.st.dueDate, today)}</Chip></span> : '—'), csv: r => r.st.dueDate },
          { key: 'fail', label: 'Guasti 12 m', align: 'r', sort: r => r.rel.failures, render: r => nf(r.rel.failures), csv: r => r.rel.failures },
          { key: 'mtbf', label: 'MTBF h', align: 'r', sort: r => r.rel.mtbf, render: r => (r.rel.mtbf != null ? nf(r.rel.mtbf) : '—'), csv: r => r.rel.mtbf },
          { key: 'mttr', label: 'MTTR min', align: 'r', sort: r => r.rel.mttr, render: r => (r.rel.mttr != null ? nf(r.rel.mttr) : '—'), csv: r => r.rel.mttr },
          { key: 'perT', label: PM_LABEL, align: 'r', sort: r => r.mc.perT, render: r => (r.mc.perT != null ? nfPm(r.mc.perT, 2) : '—'), csv: r => pm(r.mc.perT) },
          { key: 'open', label: '', nosort: true, csv: false, render: r => (r.open.length ? <Chip kind="accent">{r.open.length} aperti</Chip> : null) },
        ]} />
      </Panel>

      <Panel title="Ordini di lavoro aperti" sub="Si chiudono dalla scheda del componente con costo e minuti di fermo; la chiusura di un intervento preventivo azzera il contatore" flush>
        <Table rows={open} onRow={t => (t.assetId ? openDrawer('asset', t.assetId) : null)} empty="Nessun ordine di lavoro aperto" cols={[
          { key: 'title', label: 'Intervento', render: t => <span><b>{t.title}</b><span className="sub">{asset[t.assetId]?.name || line[t.lineId]?.name || ''}</span></span> },
          { key: 'kind', label: 'Tipo', render: t => <Chip kind={t.kind === 'correttiva' ? 'crit' : 'outline'}>{t.kind || 'preventiva'}</Chip> },
          { key: 'due', label: 'Scadenza', render: t => (t.due ? <span>{dateIt(t.due)} <Chip kind={dueKind(daysBetween(today, t.due))}>{relDays(t.due, today)}</Chip></span> : '—') },
          { key: 'cost', label: 'Costo stimato', align: 'r', render: t => (t.cost != null ? eurTxt(t.cost) : '—') },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- scheda laterale del componente ---------------- */
export function AssetD({ d, id }) {
  const a = (d.assets || []).find(x => x.id === id);
  if (!a) return <Drawer title="Componente non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  return <AssetBody d={d} a={a} />;
}

function AssetBody({ d, a }) {
  const today = appToday(d);
  const line = (d.lines || []).find(l => l.id === a.lineId);
  const st = assetStatus(d, a, today), rel = reliability(d, a, today), mc = maintenanceCost(d, a, today);
  const die = a.kind === 'trafila' ? dieReplacement(d, a, today) : null;
  const open = (d.tasks || []).filter(t => t.assetId === a.id && isOpenWo(t)).sort((x, y) => ((x.due || '') < (y.due || '') ? -1 : 1));
  const history = [
    ...(d.tasks || []).filter(t => t.assetId === a.id && t.status === 'fatto').map(t => ({ id: t.id, date: t.doneAt || t.due, text: t.title, sub: [t.kind, t.cost != null ? eurTxt(t.cost) : null, t.downMin ? `${nf(t.downMin)} min di fermo` : null].filter(Boolean).join(' · '), kind: t.kind === 'correttiva' ? 'crit' : 'good' })),
    ...(d.stops || []).filter(s => s.assetId === a.id && s.reason === 'guasto').map(s => ({ id: s.id, date: s.date, text: `Guasto: ${s.note || 'senza nota'}`, sub: `${nf(s.minutes)} min di fermo`, kind: 'warn' })),
  ].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 10);
  return (
    <Drawer title={a.name} sub={`Componente${a.code ? ' · ' + a.code : ''}${line ? ' · ' + line.name : ''}`} icon={<span className="dicon"><LuWrench /></span>}>
      <Kv items={[['Tipo', ASSET_KINDS[a.kind] || a.kind || '—'], ['Linea', line?.name || 'Stabilimento'], a.spec ? ['Caratteristiche', a.spec] : null,
        ['Piano di manutenzione', a.plan?.every ? `ogni ${nf(a.plan.every)} ${unitTxt(a.plan.unit)}` : '—'], ['Ultimo intervento', a.lastServiceAt ? `${dateIt(a.lastServiceAt)} (${relDays(a.lastServiceAt, today)})` : '—'],
        ['Vita utile', a.lifeT != null ? `${nf(a.lifeT)} t` : '—'], ['Costo di sostituzione', a.replaceCost ? eurTxt(a.replaceCost) : '—']]} />
      {st.every && (
        <div className="dsec"><div className="eyebrow">Contatore · {nf((st.used || 0) * 100)}% del piano</div>
          <Meter used={st.used} label={`${nf(st.counter)} su ${nf(st.every)} ${unitTxt(st.unit)}`} />
          <p className="small muted" style={{ marginTop: 6 }}>{nf(st.counter)} su {nf(st.every)} {unitTxt(st.unit)} dall’ultimo intervento{st.dueDate ? ` · prossimo intervento ${st.rest <= 0 ? 'scaduto' : `stimato il ${dateIt(st.dueDate)} (${relDays(st.dueDate, today)})`}` : ''}.</p>
        </div>
      )}
      <div className="dsec"><div className="eyebrow">Affidabilità e costo · 12 mesi</div>
        <Kv items={[['Guasti', `${nf(rel.failures)} · ${nf(rel.downH, 1)} ore di fermo`], ['MTBF', rel.mtbf != null ? `${nf(rel.mtbf)} ore di marcia fra due guasti` : '—'], ['MTTR', rel.mttr != null ? `${nf(rel.mttr)} minuti per riparazione` : '—'],
          ['Costo degli interventi', `${eurTxt(mc.cost)} in ${nf(mc.n)} interventi${mc.perT != null ? ` · ${fmtPm(mc.perT, 2)}` : ''}`]]} />
      </div>
      {die && die.months != null && (
        <div className="dsec"><div className="eyebrow">Rientro della sostituzione</div>
          <div className={`note ${die.months <= 6 ? 'good' : 'warn'}`}>Con la trafila nuova si risparmiano circa <b>{eurTxt(die.saving)} l’anno</b> ({eurTxt(die.energy)} di energia, {eurTxt(die.speed)} di ore di marcia): la sostituzione da {eurTxt(die.cost)} si ripaga in <b>{nf(die.months, 1)} mesi</b>.</div>
        </div>
      )}
      <div className="dsec"><div className="eyebrow">Ordini di lavoro aperti</div>
        {open.length ? open.map(t => <CloseWo key={t.id} d={d} t={t} today={today} />) : <p className="small muted">Nessuno.</p>}
        <NewWo d={d} a={a} today={today} />
      </div>
      {history.length > 0 && (
        <div className="dsec"><div className="eyebrow">Storico</div>
          {history.map(h => <div key={h.id} className="dlink" style={{ cursor: 'default' }}><span className="code">{dateIt(h.date, 'dm')}</span><span>{h.text}<span className="sub">{h.sub}</span></span><Chip kind={h.kind}>{h.kind === 'warn' ? 'guasto' : h.kind === 'crit' ? 'correttivo' : 'eseguito'}</Chip></div>)}
        </div>
      )}
    </Drawer>
  );
}

function CloseWo({ d, t, today }) {
  const [f, setF] = useState({ date: today, cost: t.cost ?? null, downMin: t.downMin ?? null, reset: t.kind !== 'correttiva' });
  const set = p => setF(x => ({ ...x, ...p }));
  const close = () => {
    const ops = completeWorkOrderOps(d, t.id, { date: f.date, cost: f.cost, downMin: f.downMin, resetCounter: f.reset });
    if (store.batch(ops, `Ordine di lavoro eseguito: ${t.title}`)) toast(f.reset ? 'Intervento registrato: contatore azzerato' : 'Intervento registrato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <div className="panel inset" style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>{t.title}</b><Chip kind={dueKind(daysBetween(today, t.due))}>{relDays(t.due, today)}</Chip></div>
      <div className="form">
        <Field label="Eseguito il"><input type="date" className="input" value={f.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
        <Field label="Costo €"><NumInput value={f.cost} onChange={v => set({ cost: v })} decimals={0} /></Field>
        <Field label="Minuti di fermo"><NumInput value={f.downMin} onChange={v => set({ downMin: v })} decimals={0} /></Field>
      </div>
      <label className="row small" style={{ gap: 6, margin: '8px 0' }}><input type="checkbox" checked={f.reset} onChange={e => set({ reset: e.target.checked })} /> Azzera il contatore (sostituzione o revisione completa)</label>
      <Btn small kind="primary" icon={LuCheck} onClick={close}>Registra l’esecuzione</Btn>
    </div>
  );
}

function NewWo({ d, a, today }) {
  const [f, setF] = useState({ kind: 'preventiva', due: addDays(today, 7), cost: a.replaceCost || null, title: '' });
  const set = p => setF(x => ({ ...x, ...p }));
  const add = () => {
    store.batch(workOrderOps(d, { assetId: a.id, kind: f.kind, due: f.due, cost: f.cost, title: f.title.trim() || undefined, today }), `Ordine di lavoro: ${a.name}`);
    toast('Ordine di lavoro creato', 'ok', { label: 'Annulla', fn: () => store.undo() });
    set({ title: '' });
  };
  return (
    <div className="stack" style={{ gap: 8, marginTop: 6 }}>
      <div className="form">
        <Field label="Tipo"><Select value={f.kind} onChange={v => set({ kind: v })} options={[{ id: 'preventiva', label: 'Preventiva' }, { id: 'correttiva', label: 'Correttiva' }]} /></Field>
        <Field label="Entro il"><input type="date" className="input" value={f.due} min={today} onChange={e => set({ due: e.target.value })} /></Field>
        <Field label="Costo stimato €"><NumInput value={f.cost} onChange={v => set({ cost: v })} decimals={0} /></Field>
      </div>
      <Field label="Descrizione"><input className="input" value={f.title} onChange={e => set({ title: e.target.value })} placeholder={`${f.kind === 'correttiva' ? 'Riparazione' : 'Manutenzione preventiva'}: ${a.name}`} /></Field>
      <div><Btn small icon={LuPlus} onClick={add}>Nuovo ordine di lavoro</Btn></div>
    </div>
  );
}
