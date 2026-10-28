/* DifesaOS · Commerciale › Campagne e premi: ordini anticipati contro l'anno prima alla stessa data, premi di fine campagna
 * sugli obiettivi dei clienti, resi con tetto. I calcoli stanno in engine/agro-camp.js. */
import React, { useMemo } from 'react';
import { LuCalendarCheck, LuCheck } from 'react-icons/lu';
import { store, toast } from '../../core/store.js';
import { go } from '../../core/router.js';
import { appToday } from '../../core/derived.js';
import { nf, eur, pct, dateIt, byId, sum } from '../../core/util.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Empty } from '../../ui/ui.jsx';
import { LineChart, Legend, Bars } from '../../ui/charts.jsx';
import { campaignsAt, earlyProgress, rebateAccrual, returnsStats } from '../../engine/agro-camp.js';

const VIEWS = [{ id: 'anticipi', label: 'Ordini anticipati' }, { id: 'premi', label: 'Premi' }, { id: 'resi', label: 'Resi' }];
const REASON = { invenduto: 'Invenduto di fine stagione', danneggiato: 'Confezioni danneggiate', revoca: 'Prodotto revocato' };

export function Campagne({ d, route }) {
  const today = appToday(d);
  const view = VIEWS.some(v => v.id === route.id) ? route.id : 'anticipi';
  const { cur, prev } = useMemo(() => campaignsAt(d, today), [d, today]);
  const ep = useMemo(() => earlyProgress(d, cur, prev, today), [d, cur, prev, today]);
  const closed = prev && prev.to < today ? prev : null;
  const rbPrev = useMemo(() => rebateAccrual(d, closed, today), [d, closed, today]);
  const rbCur = useMemo(() => rebateAccrual(d, cur, today), [d, cur, today]);
  const rs = useMemo(() => returnsStats(d, closed || cur, today), [d, closed, cur, today]);
  if (!cur) return <Empty icon={LuCalendarCheck} title="Nessuna campagna registrata">Una campagna ha stagione, scaglioni di sconto per gli ordini anticipati, obiettivi dei clienti e premi.</Empty>;
  return (
    <>
      <div className="kpis">
        <Kpi label={`Ordini anticipati ${cur.name}`} value={nf((ep?.cur || 0) / 1e6, 2)} unit="M€" foot={ep?.prevSame ? `${pct(ep.ratio, 0)} dello scorso anno alla stessa data` : 'nessun confronto'} status={ep?.ratio == null ? null : ep.ratio >= 0.95 ? 'ok' : ep.ratio >= 0.85 ? 'warn' : 'bad'} />
        <Kpi label="Clienti che hanno ordinato" value={nf(ep?.customers || 0)} foot={`${nf(ep?.prevCustomers || 0)} l’anno scorso a questa data`} />
        <Kpi label={closed ? `Premi ${closed.name}` : 'Premi maturati'} value={eur(closed ? rbPrev.total : rbCur.total)} foot={closed ? (rbPrev.settled ? `liquidati il ${dateIt(closed.rebatesSettledAt)}` : `da liquidare entro il ${dateIt(closed.settleBy)} · ${nf(rbPrev.n)} clienti`) : `${nf(rbCur.n)} clienti sopra il primo scaglione`} status={closed && !rbPrev.settled ? 'warn' : 'ok'} />
        <Kpi label="Resi sulla campagna" value={pct(rs?.share, 1)} foot={`tetto ${nf((rs?.cap || 0.05) * 100)}% per cliente · ${nf(rs?.over.length || 0)} oltre`} status={rs?.over.length ? 'warn' : 'ok'} />
      </div>
      <div className="row" style={{ marginBottom: 10 }}><Seg options={VIEWS} value={view} onChange={v => go('commerciale', 'campagne', v)} label="Vista delle campagne" /></div>
      {view === 'anticipi' && <Anticipi d={d} cur={cur} prev={prev} ep={ep} today={today} />}
      {view === 'premi' && <Premi closed={closed} rbPrev={rbPrev} cur={cur} rbCur={rbCur} today={today} />}
      {view === 'resi' && <Resi d={d} rs={rs} camp={closed || cur} />}
    </>
  );
}

function Anticipi({ d, cur, prev, ep, today }) {
  const agents = byId(d.agents || []);
  const ag = Object.keys({ ...ep.byAgent.cur, ...ep.byAgent.prev }).map(id => ({ id, name: agents[id]?.name || id, zone: agents[id]?.zone || '', cur: ep.byAgent.cur[id] || 0, prev: ep.byAgent.prev[id] || 0 }))
    .map(r => ({ ...r, ratio: r.prev ? r.cur / r.prev : null })).sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9));
  const cats = Object.keys({ ...ep.byCat.cur, ...ep.byCat.prev }).map(k => ({ k, cur: ep.byCat.cur[k] || 0, prev: ep.byCat.prev[k] || 0 })).sort((a, b) => b.prev - a.prev);
  return (
    <>
      <div className="split">
        <Panel title="Ordini anticipati cumulati" sub={`Dall’apertura del ${dateIt(cur.earlyFrom)} alla chiusura del ${dateIt(cur.earlyTo)}, contro la ${prev?.name || 'campagna precedente'}`} id="camp-curve">
          <LineChart labels={ep.curve.map(c => c.label)} height={240} unit="M€" decimals={2} area={false}
            series={[{ key: 'p', label: prev?.name || 'Anno prima', color: 'var(--s7)', dashed: true, values: ep.curve.map(c => (c.prev == null ? null : c.prev / 1e6)) }, { key: 'c', label: cur.name, color: 'var(--s1)', values: ep.curve.map(c => (c.cur == null ? null : c.cur / 1e6)) }]}
            ariaLabel="Ordini anticipati cumulati" />
          <Legend items={[{ label: cur.name, color: 'var(--s1)', line: true }, { label: prev?.name || 'Anno prima', color: 'var(--s7)', line: true }]} />
          <div className="row gap-s" style={{ marginTop: 8 }}>
            {(cur.earlyTiers || []).map(t => <Chip key={t.until} kind={t.until < today ? 'outline' : t.until === ep.nextDeadline ? 'accent' : 'outline'}>{`−${nf(t.pct)}% fino al ${dateIt(t.until, 'dm')}`}</Chip>)}
          </div>
        </Panel>
        <Panel title="Per categoria di prodotto" sub="Quest’anno contro l’anno prima alla stessa data">
          <Bars data={cats.flatMap(c => [{ key: c.k + 'c', label: `${c.k} · quest’anno`, value: c.cur / 1000, color: 'var(--s1)' }, { key: c.k + 'p', label: `${c.k} · anno prima`, value: c.prev / 1000, color: 'var(--s7)' }]).slice(0, 14)} unit="mila €" ariaLabel="Ordini anticipati per categoria" rowH={22} />
        </Panel>
      </div>
      <Panel title="Per agente" sub="I più indietro rispetto all’anno prima in alto" flush>
        <Table rows={ag} exportName="anticipi-agenti" cols={[
          { key: 'name', label: 'Agente', render: r => <span><b>{r.name}</b> <span className="muted small">{r.zone}</span></span> },
          { key: 'cur', label: 'Quest’anno', align: 'r', render: r => eur(r.cur) },
          { key: 'prev', label: 'Anno prima, stessa data', align: 'r', render: r => eur(r.prev) },
          { key: 'ratio', label: 'Rapporto', align: 'r', render: r => (r.ratio == null ? '—' : <Chip kind={r.ratio >= 0.95 ? 'good' : r.ratio >= 0.85 ? 'warn' : 'crit'}>{pct(r.ratio, 0)}</Chip>) },
        ]} />
      </Panel>
    </>
  );
}

function Premi({ closed, rbPrev, cur, rbCur, today }) {
  const settle = () => {
    store.update('campaigns', closed.id, { rebatesSettledAt: today }, `Premi della ${closed.name} liquidati`);
    toast('Liquidazione registrata', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const cols = [
    { key: 'customer', label: 'Cliente' },
    { key: 'target', label: 'Obiettivo', align: 'r', render: r => eur(r.target) },
    { key: 'actual', label: 'Fatturato netto resi', align: 'r', render: r => eur(r.actual) },
    { key: 'q', label: 'Obiettivo raggiunto', align: 'r', render: r => (r.q == null ? '—' : pct(r.q, 0)) },
    { key: 'tier', label: 'Premio', align: 'r', render: r => (r.tier ? `${nf(r.tier, 1)}%` : '—') },
    { key: 'rebate', label: 'Importo', align: 'r', render: r => eur(r.rebate) },
    { key: 'gap', label: 'Al prossimo scaglione', align: 'r', render: r => (r.gap ? `${eur(r.gap)} → ${nf(r.next, 1)}%` : '—') },
  ];
  return (
    <>
      {closed && (
        <Panel title={`Premi della ${closed.name}`} sub={`Stagione chiusa il ${dateIt(closed.to)}; scaglioni ${closed.rebateTiers.map(t => `${nf(t.pct, 1)}% da ${nf(t.fromPct)}% dell’obiettivo`).join(', ')}`} id="camp-premi"
          actions={rbPrev.settled ? <Chip kind="good" icon={LuCheck}>liquidati</Chip> : <Btn small icon={LuCheck} onClick={settle} disabled={!rbPrev.total}>Registra la liquidazione</Btn>} flush>
          <Table rows={rbPrev.rows} exportName={`premi-${closed.id}`} pageSize={20} cols={cols} foot={<><td><b>Totale</b></td><td className="r">{eur(sum(rbPrev.rows, r => r.target))}</td><td className="r">{eur(sum(rbPrev.rows, r => r.actual))}</td><td /><td /><td className="r"><b>{eur(rbPrev.total)}</b></td><td /></>} />
        </Panel>)}
      <Panel title={`${cur.name}: premi che maturano`} sub={`${pct(rbCur.elapsed, 0)} della stagione trascorsa: i clienti vicini allo scaglione successivo sono un’occasione di vendita`} flush>
        <Table rows={rbCur.rows} exportName={`premi-${cur.id}`} pageSize={15} initialSort={{ key: 'gap', dir: 'asc' }} cols={cols} />
      </Panel>
    </>
  );
}

function Resi({ d, rs, camp }) {
  const prods = byId(d.products || []), custs = byId(d.customers || []);
  if (!rs) return <Empty title="Nessun reso" />;
  const set = (r, status) => { store.update('returns', r.id, { status }, `Reso ${status}`); toast(`Reso ${status}`, 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  return (
    <>
      <div className="split">
        <Panel title="Resi per motivo" sub={`${camp.name} · tetto ${nf(rs.cap * 100)}% del fatturato del cliente`}>
          <Bars data={Object.entries(rs.byReason).map(([k, v]) => ({ key: k, label: REASON[k] || k, value: v / 1000 }))} unit="mila €" decimals={1} ariaLabel="Resi per motivo" />
        </Panel>
        <Panel title="Clienti oltre il tetto" sub="I resi riducono il fatturato su cui si calcola il premio">
          {rs.over.length ? <ul className="list">{rs.over.map(x => <li key={x.customerId}><b>{x.customer}</b>: {eur(x.value)} di resi, {pct(x.share, 1)} del fatturato</li>)}</ul> : <Empty title="Nessun cliente oltre il tetto" />}
        </Panel>
      </div>
      <Panel title="Richieste di reso" flush>
        <Table rows={rs.rows.map(r => ({ ...r, customer: custs[r.customerId]?.name || r.customerId, product: prods[r.productId]?.name || r.productId }))} exportName="resi" initialSort={{ key: 'date', dir: 'desc' }} cols={[
          { key: 'date', label: 'Data', render: r => dateIt(r.date) }, { key: 'customer', label: 'Cliente' }, { key: 'product', label: 'Prodotto' },
          { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes, 2) }, { key: 'value', label: 'Valore', align: 'r', render: r => eur(r.value) },
          { key: 'reason', label: 'Motivo', render: r => REASON[r.reason] || r.reason },
          { key: 'status', label: 'Stato', render: r => (r.status === 'richiesto' ? <span className="row gap-s"><Btn small kind="ghost" onClick={() => set(r, 'accettato')}>Accetta</Btn><Btn small kind="ghost" onClick={() => set(r, 'rifiutato')}>Rifiuta</Btn></span> : <Chip kind={r.status === 'accettato' ? 'good' : 'crit'}>{r.status}</Chip>) },
        ]} />
      </Panel>
    </>
  );
}
