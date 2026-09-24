/* FeedOS 16 · Oggi: decisioni spiegate, numeri della settimana, gemello in miniatura, attività. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuSparkles, LuPresentation, LuFactory, LuTruck } from 'react-icons/lu';
import { useData, store, toast, uiStore } from '../core/store.js';
import { go } from '../core/router.js';
import { ROLE } from '../core/roles.js';
import { signals, appToday, costs, kpis, weekly, idx, mrp } from '../core/derived.js';
import { addDays, dateIt, nf, sum, mondayOf, daysBetween, relDays } from '../core/util.js';
import { PageHead, Panel, Kpi, Btn, Table, Field, Select, Chip, Empty, Tabs, Sev } from '../ui/ui.jsx';
import { SignalList } from './shared.jsx';
import { TwinMini } from './gemello.jsx';
import { checkAnalysis } from '../engine/quality.js';
import { profile } from '../engine/nutrients.js';

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function greeting() { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; }

export function Oggi({ route }) {
  const d = useData();
  const tab = route.tab || 'decisioni';
  const today = appToday(d);
  const role = ROLE[d.settings?.role] || ROLE.direzione;
  const all = signals(d);
  const mine = role.id === 'direzione' ? all : all.filter(s => s.roles?.includes(role.id));
  const crit = mine.filter(s => s.severity === 'critico').length;
  const openTasks = d.tasks.filter(t => t.status !== 'fatto' && t.status !== 'scartato');
  return (
    <>
      <PageHead title="Oggi" lead={<>{greeting()}. {cap(dateIt(today, 'day'))} · vista {role.label.toLowerCase()}. {mine.length ? <><b>{mine.length}</b> decisioni aperte{crit ? <>, <b>{crit}</b> critiche</> : ''}. Ogni segnale spiega il perché con i numeri: nessuna azione parte da sola.</> : 'Nessuna decisione aperta.'}</>}
        actions={<><Btn icon={LuSparkles} onClick={() => go('economia', 'scenari')}>E se…</Btn><Btn kind="primary" icon={LuPresentation} onClick={() => uiStore.set({ tour: 0 })}>Presentazione guidata</Btn></>}
        tabs={[{ id: 'decisioni', label: 'Decisioni', n: mine.length }, { id: 'attivita', label: 'Attività', n: openTasks.length }, { id: 'registro', label: 'Ultime modifiche' }]} tab={tab} onTab={t => go('oggi', t)} />
      {tab === 'decisioni' && <Decisioni d={d} today={today} mine={mine} role={role} />}
      {tab === 'attivita' && <Attivita d={d} today={today} />}
      {tab === 'registro' && <Registro d={d} />}
    </>
  );
}

function Decisioni({ d, today, mine, role }) {
  const K = useKpis(d, today);
  const [filter, setFilter] = useState('tutte');
  const list = filter === 'tutte' ? mine : mine.filter(s => s.severity === filter);
  return (
    <>
      <div className="kpis" id="oggi-kpi">
        <Kpi label="Produzione ultimi 7 giorni" value={nf(K.prod7)} unit="t" spark={K.prodSpark} delta={K.prodDelta} foot="vs media 4 settimane" onClick={() => go('produzione', 'registro')} />
        <Kpi label="Margine sulle consegne (30 giorni)" value={nf(K.margin, 1)} unit="€/t" spark={K.marginSpark} sparkColor="var(--s3)" foot={`${nf(K.ship30)} t consegnate`} onClick={() => go('economia', 'margini')} title="Prezzo di vendita meno costo pieno ai prezzi di oggi" />
        <Kpi label="Elettricità per tonnellata (4 sett.)" value={nf(K.kwhT, 1)} unit="kWh/t" spark={K.kwhSpark} sparkColor="var(--s4)" delta={K.kwhDelta} deltaGood={K.kwhDelta != null ? K.kwhDelta <= 0 : null} foot="vs 12 settimane" onClick={() => go('produzione', 'energia')} />
        <Kpi label="CO₂ dei vettori energetici (12 mesi)" value={nf(K.co2T, 2)} unit="kg/t" foot={`FV ${nf(K.fv * 100, 1)}% dell’elettricità`} onClick={() => go('esg', 'energia')} />
        <Kpi label="Lotti conformi all’etichetta (90 giorni)" value={K.conf == null ? '—' : nf(K.conf * 100, 1)} unit="%" foot={`${K.analyzed} lotti analizzati`} onClick={() => go('qualita', 'lotti')} />
      </div>
      <div className="split">
        <Panel title="Da decidere" sub="Ordinate per urgenza e impatto economico" flush id="oggi-decisioni"
          actions={<div className="seg" role="group" aria-label="Filtro gravità">{[['tutte', 'Tutte'], ['critico', 'Critiche'], ['attenzione', 'Attenzione'], ['info', 'Informazioni']].map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>}>
          <SignalList items={list} limit={7} />
        </Panel>
        <div className="stack">
          <Panel title="Lo stabilimento adesso" sub="Ultimi 30 giorni · clicca per il gemello digitale" id="oggi-twin" actions={<Btn small icon={LuFactory} onClick={() => go('gemello')}>Apri</Btn>}>
            <TwinMini />
          </Panel>
          <Settimana d={d} today={today} />
        </div>
      </div>
    </>
  );
}

function useKpis(d, today) {
  const C = costs(d);
  const W = weekly(d);
  const E = kpis(d);
  return useMemo(() => {
    const from7 = addDays(today, -6), from28 = addDays(today, -27), from112 = addDays(today, -111);
    const r7 = d.runs.filter(r => r.date >= from7 && r.date <= today);
    const prod7 = sum(r7, r => r.tonnes);
    const full = W.prod.slice(-13, -1);
    const prev4 = W.prod.slice(-5, -1);
    const avg4 = prev4.length ? sum(prev4) / prev4.length : null;
    const r28 = d.runs.filter(r => r.date >= from28 && r.date <= today), rPrev = d.runs.filter(r => r.date < from28 && r.date >= from112);
    const kwhT = sum(r28, r => r.kwh) / Math.max(1, sum(r28, r => r.tonnes));
    const kwhPrev = sum(rPrev, r => r.kwh) / Math.max(1, sum(rPrev, r => r.tonnes));
    const kwhSpark = [];
    for (let k = 12; k >= 1; k--) { const a = addDays(today, -7 * k), b = addDays(today, -7 * (k - 1)); const rs = d.runs.filter(r => r.date > a && r.date <= b); kwhSpark.push(sum(rs, r => r.kwh) / Math.max(1, sum(rs, r => r.tonnes))); }
    const s30 = d.shipments.filter(s => s.date > addDays(today, -30) && s.date <= today);
    const ship30 = sum(s30, s => s.tonnes);
    const margin = ship30 ? sum(s30, s => s.tonnes * (s.price - (C[s.productId]?.total || 0))) / ship30 : null;
    const marginSpark = [];
    for (let k = 12; k >= 1; k--) { const a = addDays(today, -28 * k), b = addDays(today, -28 * (k - 1)); const ss = d.shipments.filter(s => s.date > a && s.date <= b); const t = sum(ss, s => s.tonnes); marginSpark.push(t ? sum(ss, s => s.tonnes * (s.price - (C[s.productId]?.total || 0))) / t : null); }
    const I = idx(d);
    let ok = 0, n = 0;
    for (const l of d.lots) {
      if (l.date < addDays(today, -90) || !l.analyses?.length) continue;
      const f = I.form[I.prod[l.productId]?.formulaId]; if (!f) continue;
      const run = I.run[l.runId];
      const lines = (f.history || []).find(h => h.version === run?.formulaVersion)?.lines || f.lines;
      const decl = Math.round(profile(lines, I.ing).PG * 10) / 10;
      n++; if (checkAnalysis('PG', l.analyses[0].values.PG, decl).status === 'ok') ok++;
    }
    return { prod7, prodSpark: full, prodDelta: avg4 ? (prod7 / avg4 - 1) * 100 : null, kwhT, kwhSpark, kwhDelta: kwhPrev ? (kwhT / kwhPrev - 1) * 100 : null, margin, marginSpark, ship30, co2T: E.energy.co2PerT, fv: E.energy.coverage || 0, conf: n ? ok / n : null, analyzed: n };
  }, [d, today, C, W, E]);
}

function Settimana({ d, today }) {
  const I = idx(d);
  const w0 = mondayOf(today);
  const rows = d.lines.map(l => {
    const t = sum(d.plan.filter(p => p.week === w0 && p.lineId === l.id), p => p.tonnes);
    const cap = l.capacityTph * l.hoursWeek * 0.9;
    return { l, t, cap, u: cap ? t / cap : 0 };
  });
  const incoming = d.purchases.filter(p => p.status !== 'ricevuto' && p.deliveryDate >= today && p.deliveryDate <= addDays(today, 7)).sort((a, b) => a.deliveryDate < b.deliveryDate ? -1 : 1);
  return (
    <Panel title="Questa settimana" sub={`Settimana dal ${dateIt(w0, 'dm')}`}>
      <div className="stack" style={{ gap: 12 }}>
        {rows.map(r => (
          <div key={r.l.id} className="grid" style={{ gap: 4 }}>
            <div className="row between small"><b>{r.l.name}</b><span className="num">{nf(r.t)} t · {nf(r.u * 100)}%</span></div>
            <div className="bar-cell" title={`Carico ${nf(r.u * 100)}% della capacità utile`}><i style={{ width: Math.min(100, r.u * 100) + '%', background: r.u > 1 ? 'var(--crit)' : r.u > 0.9 ? 'var(--serious)' : 'var(--s1)' }} /></div>
          </div>
        ))}
        <div className="hr" />
        <div className="eyebrow">Arrivi di materie prime</div>
        {incoming.length ? incoming.slice(0, 6).map(p => (
          <div key={p.id} className="row between small"><span className="row gap-s"><LuTruck size={15} aria-hidden="true" />{I.ing[p.ingId]?.name}</span><span className="num muted">{nf(p.tonnes)} t · {relDays(p.deliveryDate, today)}</span></div>
        )) : <span className="small muted">Nessun arrivo nei prossimi 7 giorni.</span>}
      </div>
    </Panel>
  );
}

function Attivita({ d, today }) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('Direzione');
  const [due, setDue] = useState(addDays(today, 7));
  const [show, setShow] = useState('aperte');
  const rows = d.tasks.filter(t => show === 'tutte' || (t.status !== 'fatto' && t.status !== 'scartato'));
  const add = e => {
    e.preventDefault();
    if (!title.trim()) return;
    store.add('tasks', { title: title.trim(), owner, due, status: 'aperto', priority: 'media', source: 'manuale', createdAt: today, area: 'oggi' }, 'Nuova attività: ' + title.trim());
    setTitle(''); toast('Attività aggiunta');
  };
  const set = (t, patch, label) => store.update('tasks', t.id, patch, label);
  return (
    <div className="split">
      <Panel title="Attività" sub="Decisioni prese e lavoro assegnato" flush actions={<div className="seg">{['aperte', 'tutte'].map(k => <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>{k === 'aperte' ? 'Aperte' : 'Tutte'}</button>)}</div>}>
        <Table rows={rows} initialSort={{ key: 'due', dir: 'asc' }} cols={[
          { key: 'title', label: 'Attività', render: t => <><b>{t.title}</b>{t.detail && <span className="sub">{t.detail.slice(0, 140)}{t.detail.length > 140 ? '…' : ''}</span>}</> },
          { key: 'owner', label: 'Responsabile' },
          { key: 'due', label: 'Scadenza', render: t => <span className={t.due < today && t.status !== 'fatto' ? 'chip crit' : ''}>{dateIt(t.due)}</span> },
          { key: 'status', label: 'Stato', render: t => <select className="select" style={{ height: 30, width: 130 }} value={t.status} onClick={e => e.stopPropagation()} onChange={e => set(t, { status: e.target.value, doneAt: e.target.value === 'fatto' ? today : null }, `Attività «${t.title}»: ${e.target.value}`)} aria-label="Stato">
            {['aperto', 'in corso', 'fatto', 'scartato'].map(s => <option key={s}>{s}</option>)}</select> },
          { key: 'source', label: 'Origine', render: t => t.source === 'segnale' ? <Chip kind="accent">da segnale</Chip> : <Chip>manuale</Chip> },
        ]} />
      </Panel>
      <Panel title="Nuova attività">
        <form className="stack" style={{ gap: 12 }} onSubmit={add}>
          <Field label="Cosa fare"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. verificare il contratto soia" id="task-title" /></Field>
          <Field label="Responsabile"><Select value={owner} onChange={setOwner} options={['Direzione', 'Acquisti', 'Formulazione', 'Produzione', 'Qualità', 'Commerciale', 'Manutenzione']} id="task-owner" /></Field>
          <Field label="Scadenza"><input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} id="task-due" /></Field>
          <Btn kind="primary" type="submit" icon={LuPlus}>Aggiungi</Btn>
        </form>
      </Panel>
    </div>
  );
}

function Registro({ d }) {
  return (
    <Panel title="Ultime modifiche" sub="Ogni modifica resta registrata con data, vista e descrizione" flush>
      <Table rows={d.events.slice(0, 300)} pageSize={40} cols={[
        { key: 'at', label: 'Quando', render: e => <span className="nowrap">{new Date(e.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span> },
        { key: 'role', label: 'Vista', render: e => ROLE[e.role]?.short || e.role },
        { key: 'label', label: 'Modifica' },
      ]} empty="Ancora nessuna modifica registrata." />
    </Panel>
  );
}
