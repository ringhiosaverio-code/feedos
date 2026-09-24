/* FeedOS 16 · Acquisti e mercati: dal piano di produzione ai fabbisogni, ordini suggeriti con data limite,
 * scorte in giorni di copertura, ordini e arrivi, quotazioni con previsione verificata. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuTruck, LuPackageCheck, LuTriangleAlert, LuCheck, LuDownload, LuX, LuShoppingCart } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, mrp, appToday, signals } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, relDays, mondayOf, round, mean } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { receivePurchaseOps } from '../engine/operations.js';
import { forecast, backtest } from '../engine/forecast.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv } from '../ui/ui.jsx';
import { LineChart, Legend } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

const STATUS = { rottura: { kind: 'crit', label: 'Rottura' }, sotto: { kind: 'warn', label: 'Sotto sicurezza' }, ok: { kind: 'good', label: 'Coperto' } };

export function Acquisti({ route }) {
  const d = useData();
  const tab = route.tab || 'fabbisogni';
  return (
    <>
      <PageHead title="Acquisti e mercati" lead="Il piano delle prossime 8 settimane diventa fabbisogno di materie prime: FeedOS proietta le scorte, segnala le rotture e propone quanto e quando ordinare, tenendo conto degli arrivi già confermati."
        tabs={NAV.acquisti.tabs} tab={tab} onTab={t => go('acquisti', t)} />
      {tab === 'fabbisogni' && <Fabbisogni d={d} sel={route.id} />}
      {tab === 'scorte' && <Scorte d={d} sel={route.id} />}
      {tab === 'ordini' && <Ordini d={d} sel={route.id} />}
      {tab === 'mercati' && <Mercati d={d} sel={route.id} />}
    </>
  );
}

/* ---------------- fabbisogni ---------------- */
function Fabbisogni({ d, sel }) {
  const M = mrp(d); const I = idx(d); const today = appToday(d);
  const [show, setShow] = useState('urgenti');
  const sigs = signals(d).filter(s => s.area === 'acquisti');
  const all = M.rows.flatMap(r => r.planned.map(p => ({ ...p, ingId: r.ingId, key: r.ingId + p.week, cover: r.cover, value: p.qty * (+I.ing[r.ingId]?.price || 0) })));
  const due = all.filter(p => p.late || daysBetween(today, p.orderBy) <= 7);
  const view = show === 'urgenti' ? due : all;
  const gaps = M.rows.filter(r => r.risk === 'rottura');
  const selRow = M.rows.find(r => r.ingId === sel);
  const createPO = p => {
    const ing = I.ing[p.ingId];
    const delivery = p.arrival < today ? today : p.arrival;
    store.add('purchases', { code: 'OA-' + String(2600 + d.purchases.length + 1), ingId: ing.id, supplier: ing.supplier, date: today, tonnes: p.qty, price: ing.price, deliveryDate: delivery, status: 'emesso', source: 'fabbisogni' }, `Ordine emesso: ${nf(p.qty)} t di ${ing.name.toLowerCase()}`);
    toast(`Ordine di ${nf(p.qty, p.qty < 10 ? 1 : 0)} t di ${ing.name.toLowerCase()} emesso per il ${dateIt(delivery, 'dm')}: fabbisogni ricalcolati`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Settimane scoperte anche ordinando oggi" value={gaps.length} foot={gaps.length ? gaps.map(r => I.ing[r.ingId]?.label || I.ing[r.ingId]?.name).slice(0, 3).join(', ') : 'nessuna materia prima'} />
        <Kpi label="Ordini in ritardo" value={all.filter(p => p.late).length} foot="la data utile è già passata" />
        <Kpi label="Da emettere entro 7 giorni" value={due.filter(p => !p.late).length} foot={`${nf(sum(due, p => p.qty))} t con quelli in ritardo`} />
        <Kpi label="Ordini pianificati (8 settimane)" value={all.length} unit={`· ${nf(sum(all, p => p.value) / 1000)} mila €`} foot={`${nf(sum(all, p => p.qty))} t ai prezzi di oggi`} />
      </div>
      {selRow && <IngDetail d={d} r={selRow} M={M} onClose={() => go('acquisti', 'fabbisogni')} onOrder={createPO} />}
      <Panel title="Ordini pianificati" sub="Uno per settimana in cui la scorta scenderebbe sotto la sicurezza: arrivo a inizio settimana, quantità per ripristinare la sicurezza più una settimana di consumo (autotreno da 28 t)" flush id="acq-sugg"
        actions={<Seg options={[{ id: 'urgenti', label: `Da emettere (${due.length})` }, { id: 'tutti', label: `Tutti (${all.length})` }]} value={show} onChange={setShow} label="Filtro ordini pianificati" />}>
        <Table rows={view} rowKey={p => p.key} onRow={p => go('acquisti', 'fabbisogni', p.ingId)} initialSort={{ key: 'orderBy', dir: 'asc' }} cols={[
          { key: 'ing', label: 'Materia prima', sort: p => I.ing[p.ingId]?.name, render: p => <><b>{I.ing[p.ingId]?.name}</b><span className="sub">{I.ing[p.ingId]?.supplier}</span></> },
          { key: 'week', label: 'Serve dal', render: p => <>{dateIt(p.week, 'dm')}<span className="sub">{p.status === 'rottura' ? 'altrimenti si esaurisce' : 'altrimenti sotto sicurezza'}</span></> },
          { key: 'qty', label: 'Quantità', align: 'r', render: p => <b>{nf(p.qty, p.qty < 10 ? 1 : 0)} t</b> },
          { key: 'orderBy', label: 'Emettere entro', render: p => p.late ? <Chip kind="crit" icon={LuTriangleAlert}>in ritardo</Chip> : <>{dateIt(p.orderBy, 'dm')}<span className="sub">{relDays(p.orderBy, today)}</span></> },
          { key: 'arrival', label: 'Arrivo', render: p => <>{dateIt(p.arrival, 'dm')}<span className="sub">consegna {p.lead} gg</span></> },
          { key: 'value', label: 'Valore', align: 'r', render: p => nf(p.value) + ' €' },
          { key: 'x', label: '', nosort: true, render: p => <Btn small kind={p.late || daysBetween(today, p.orderBy) <= 7 ? 'primary' : ''} icon={LuShoppingCart} onClick={e => { e.stopPropagation(); createPO(p); }}>Emetti</Btn> },
        ]} empty="Nessun ordine da emettere nei prossimi 7 giorni: le scorte e gli ordini aperti coprono il piano." />
      </Panel>
      <Panel title="Scorta proiettata settimana per settimana" sub="Giorni di copertura a fine settimana, contando gli ordini aperti e quelli pianificati · ▲ arrivo" flush id="acq-heat"
        actions={<Legend items={[{ label: 'Coperto', color: 'color-mix(in srgb, var(--good) 30%, var(--surface))' }, { label: 'Sotto sicurezza', color: 'var(--warn)' }, { label: 'Scoperto', color: 'var(--crit)' }]} />}>
        <Heat M={M} I={I} sel={sel} />
      </Panel>
      {sigs.length > 0 && <Panel title="Segnali degli acquisti" flush><SignalList items={sigs} limit={4} /></Panel>}
    </>
  );
}

function Heat({ M, I, sel }) {
  return (
    <div className="tw">
      <table className="t heat">
        <thead><tr><th>Materia prima</th><th className="r">Oggi t</th>{M.weeks.map(w => <th key={w} className="r">{dateIt(w, 'dm')}</th>)}</tr></thead>
        <tbody>
          {M.rows.filter(r => r.totalNeed > 0).map(r => (
            <tr key={r.ingId} className={`click ${sel === r.ingId ? 'sel' : ''}`} onClick={() => go('acquisti', 'fabbisogni', r.ingId)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') go('acquisti', 'fabbisogni', r.ingId); }}>
              <td><b>{I.ing[r.ingId]?.name}</b><span className="sub">{nf(r.daily, r.daily < 1 ? 2 : 1)} t/giorno · sicurezza {nf(I.ing[r.ingId]?.safetyDays)} gg</span></td>
              <td className="r">{nf(r.stock, r.stock < 10 ? 1 : 0)}</td>
              {r.cells.map(c => (
                <td key={c.week} className={`hc ${c.status}`} title={`Settimana del ${dateIt(c.week)}: fabbisogno ${nf(c.need, 1)} t · arrivi confermati ${nf(c.in, 1)} t · ordini pianificati ${nf(c.planned, 1)} t · scorta finale ${nf(c.end, 1)} t`}>
                  <span>{c.status === 'rottura' ? `−${nf(Math.abs(c.end), c.end > -10 ? 1 : 0)} t` : c.cover == null ? '—' : `${nf(Math.min(c.cover, 99))}${c.cover > 99 ? '+' : ''} gg`}</span>
                  {(c.in > 0 || c.planned > 0) && <i className={`in ${c.planned > 0 ? 'plan' : ''}`} aria-label={c.planned > 0 ? 'ordine pianificato' : 'arrivo confermato'}>▲</i>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngDetail({ d, r, M, onClose, onOrder }) {
  const I = idx(d); const ing = I.ing[r.ingId]; const today = appToday(d);
  const open = d.purchases.filter(p => p.ingId === r.ingId && p.status !== 'ricevuto' && p.status !== 'annullato');
  const labels = ['Oggi', ...M.weeks.map(w => dateIt(w, 'dm'))];
  const next = r.planned[0];
  return (
    <Panel title={ing.name} sub={`Scorta proiettata · consumo medio ${nf(r.daily, 2)} t/giorno · consegna in ${ing.leadDays} giorni`} id="acq-detail"
      actions={<>{next && <Btn small kind="primary" icon={LuShoppingCart} onClick={() => onOrder({ ...next, ingId: r.ingId })}>Emetti {nf(next.qty, next.qty < 10 ? 1 : 0)} t</Btn>}<Btn small onClick={() => openDrawer('ingredient', ing.id)}>Scheda</Btn><Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={onClose} /></>}>
      <div className="split">
        <div>
          <LineChart labels={labels} height={220} unit="t" decimals={1}
            series={[{ key: 's', label: 'Con gli ordini pianificati', color: 'var(--s1)', values: [r.stock, ...r.cells.map(c => c.end)] }, { key: 'r', label: 'Senza nuovi ordini', color: 'var(--s2)', dashed: true, values: [r.stock, ...r.cells.map(c => c.raw)] }]}
            refs={[{ y: r.safety, label: 'sicurezza', kind: 'muted' }, { y: 0, label: 'zero', kind: 'crit' }]} ariaLabel={`Scorta proiettata di ${ing.name}`} />
          <Legend items={[{ label: 'Con gli ordini pianificati', color: 'var(--s1)', line: true }, { label: 'Senza nuovi ordini', color: 'var(--s2)', line: true }]} />
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Kv items={[['Scorta oggi', `${nf(r.stock, 1)} t`], ['Scorta di sicurezza', `${nf(r.safety, 1)} t (${ing.safetyDays} giorni)`], ['Fabbisogno 8 settimane', `${nf(r.totalNeed, 1)} t`],
            ['Ordini aperti', open.length ? open.map(p => `${nf(p.tonnes)} t il ${dateIt(p.deliveryDate, 'dm')}`).join(' · ') : 'nessuno'],
            ['Ordini pianificati', r.planned.length ? r.planned.map(p => `${nf(p.qty, p.qty < 10 ? 1 : 0)} t entro ${dateIt(p.orderBy, 'dm')}${p.late ? ' (in ritardo)' : ''}`).join(' · ') : 'nessuno']]} />
          <p className="small muted">Il calcolo usa la formula approvata di ogni prodotto e il piano di produzione: se cambi una formula o il piano, i fabbisogni si aggiornano subito.</p>
        </div>
      </div>
    </Panel>
  );
}

/* ---------------- scorte ---------------- */
function Scorte({ d, sel }) {
  const M = mrp(d); const I = idx(d); const today = appToday(d);
  const [q, setQ] = useState('');
  const byIng = Object.fromEntries(M.rows.map(r => [r.ingId, r]));
  const lotsIn = useMemo(() => {
    const m = {};
    for (const l of d.ingLots) if (l.status === 'accettato' && (+l.remaining || 0) > 0.005) (m[l.ingId] ||= []).push(l);
    return m;
  }, [d.ingLots]);
  const rows = d.ingredients.map(i => {
    const r = byIng[i.id]; const lots = lotsIn[i.id] || [];
    const oldest = lots.reduce((a, l) => (!a || l.date < a ? l.date : a), null);
    return { ...i, daily: r?.daily || 0, cover: r?.cover ?? null, value: (+i.stock || 0) * (+i.price || 0), nLots: lots.length, oldest, age: oldest ? daysBetween(oldest, today) : null, waiting: d.ingLots.filter(l => l.ingId === i.id && l.status === 'in attesa').length };
  });
  const main = rows.filter(r => r.daily > 0).sort((a, b) => b.daily - a.daily).slice(0, 10);
  const view = filterRows(rows, q, ['name', 'code', 'supplier']);
  return (
    <>
      <div className="kpis">
        <Kpi label="Valore delle scorte" value={nf(sum(rows, r => r.value) / 1000)} unit="mila €" foot="scorta × prezzo di oggi" />
        <Kpi label="Materie prime in giacenza" value={rows.filter(r => r.stock > 0).length} foot={`${nf(sum(rows, r => r.stock))} t in tutto`} />
        <Kpi label="Copertura mediana" value={nf(median(rows.filter(r => r.cover != null).map(r => r.cover)))} unit="giorni" foot="rispetto al piano" />
        <Kpi label="Lotti in attesa di accettazione" value={sum(rows, r => r.waiting)} foot="non ancora utilizzabili" onClick={() => go('qualita', 'lotti-mp')} />
      </div>
      <Panel title="Silos e magazzini" sub="Il livello mostra i giorni di copertura (pieno = 30 giorni); la linea tratteggiata è la scorta di sicurezza" id="acq-silos">
        <div className="silos">
          {main.map(r => {
            const fill = Math.min(1, (r.cover || 0) / 30), safe = Math.min(1, (r.safetyDays || 10) / 30);
            const cls = r.cover != null && r.cover < 3 ? 'out' : r.cover != null && r.cover < (r.safetyDays || 10) ? 'low' : '';
            return (
              <button key={r.id} className={`silo ${cls}`} onClick={() => openDrawer('ingredient', r.id)} title={`${r.name}: ${nf(r.stock, 1)} t, ${nf(r.cover)} giorni di copertura`}>
                <span className="tank"><span className="fill" style={{ height: fill * 100 + '%' }} /><span className="safety" style={{ bottom: safe * 100 + '%' }} /></span>
                <b>{r.short || r.name}</b><small>{nf(r.stock, r.stock < 10 ? 1 : 0)} t · {r.cover == null ? '—' : nf(r.cover) + ' gg'}</small>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Giacenze" sub="Scorta utilizzabile (lotti accettati) · clic per la scheda" flush actions={<><SearchBox value={q} onChange={setQ} placeholder="Cerca materia prima" id="st-search" /><Btn small icon={LuDownload} onClick={() => download(`giacenze-${stamp()}.csv`, toCSV(rows, [{ key: 'code', label: 'Codice' }, { key: 'name', label: 'Materia prima' }, { key: 'stock', label: 'Scorta t' }, { key: 'price', label: 'Prezzo €/t' }, { label: 'Valore €', value: r => Math.round(r.value) }, { label: 'Copertura giorni', value: r => r.cover == null ? '' : Math.round(r.cover) }, { key: 'nLots', label: 'Lotti' }, { key: 'oldest', label: 'Lotto più vecchio' }]), 'text/csv;charset=utf-8')}>CSV</Btn></>}>
        <Table rows={view} onRow={r => openDrawer('ingredient', r.id)} selected={sel} initialSort={{ key: 'cover', dir: 'asc' }} pageSize={40} cols={[
          { key: 'name', label: 'Materia prima', render: r => <><span className="code">{r.code}</span> <b>{r.name}</b></> },
          { key: 'stock', label: 'Scorta t', align: 'r', render: r => nf(r.stock, r.stock < 10 ? 1 : 0) },
          { key: 'cover', label: 'Copertura', align: 'r', render: r => r.cover == null ? <span className="muted">non usata</span> : <span className={r.cover < (r.safetyDays || 10) ? 'chip warn' : ''}>{nf(r.cover)} gg</span> },
          { key: 'value', label: 'Valore €', align: 'r', render: r => nf(r.value) },
          { key: 'nLots', label: 'Lotti', align: 'r' },
          { key: 'age', label: 'Lotto più vecchio', align: 'r', render: r => r.oldest ? <>{nf(r.age)} gg<span className="sub">{dateIt(r.oldest, 'dm')}</span></> : '—' },
          { key: 'waiting', label: 'In attesa', align: 'r', render: r => r.waiting ? <Chip kind="warn">{r.waiting}</Chip> : '—' },
        ]} />
      </Panel>
    </>
  );
}
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/* ---------------- ordini ---------------- */
function Ordini({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  const [show, setShow] = useState('aperti');
  const [recv, setRecv] = useState(null);
  const rows = d.purchases.filter(p => show === 'tutti' || (p.status !== 'ricevuto' && p.status !== 'annullato'));
  const setStatus = (p, status) => store.update('purchases', p.id, { status }, `Ordine ${p.code}: ${status}`);
  return (
    <>
      <div className="split">
        <Panel title="Ordini di acquisto" sub="Gli ordini aperti entrano nel calcolo dei fabbisogni alla data di consegna" flush
          actions={<Seg options={[{ id: 'aperti', label: 'Aperti' }, { id: 'tutti', label: 'Tutti' }]} value={show} onChange={setShow} label="Filtro ordini" />}>
          <Table rows={rows} selected={sel} initialSort={{ key: 'deliveryDate', dir: 'asc' }} cols={[
            { key: 'code', label: 'Ordine', render: p => <><span className="code">{p.code}</span>{p.contract && <span className="sub">{p.contract}</span>}</> },
            { key: 'ing', label: 'Materia prima', sort: p => I.ing[p.ingId]?.name, render: p => <><b>{I.ing[p.ingId]?.name}</b><span className="sub">{p.supplier}{p.mode ? ' · ' + p.mode : ''}</span></> },
            { key: 'tonnes', label: 't', align: 'r', render: p => nf(p.tonnes, p.tonnes < 10 ? 1 : 0) },
            { key: 'price', label: '€/t', align: 'r', render: p => nf(p.price) },
            { key: 'deliveryDate', label: 'Consegna', render: p => <>{dateIt(p.deliveryDate, 'dm')}<span className="sub">{p.status === 'ricevuto' ? 'ricevuto ' + dateIt(p.receivedAt, 'dm') : relDays(p.deliveryDate, today)}</span></> },
            { key: 'status', label: 'Stato', render: p => p.status === 'ricevuto' || p.status === 'annullato' ? <Chip kind={p.status === 'ricevuto' ? 'good' : ''}>{p.status}</Chip> :
              <select className="select" style={{ height: 30, width: 128 }} value={p.status} onChange={e => setStatus(p, e.target.value)} aria-label="Stato dell’ordine">{['emesso', 'confermato', 'annullato'].map(s => <option key={s}>{s}</option>)}</select> },
            { key: 'x', label: '', nosort: true, render: p => p.status !== 'ricevuto' && p.status !== 'annullato' ? <Btn small icon={LuPackageCheck} onClick={() => setRecv(p)}>Arrivo</Btn> : null },
          ]} empty="Nessun ordine aperto." />
        </Panel>
        <div className="stack">
          {recv ? <Arrivo d={d} po={recv} onDone={() => setRecv(null)} /> : <NuovoOrdine d={d} />}
        </div>
      </div>
    </>
  );
}

function NuovoOrdine({ d }) {
  const today = appToday(d);
  const [ing, setIng] = useState(d.ingredients[0]?.id);
  const i = d.ingredients.find(x => x.id === ing);
  const [t, setT] = useState(28), [price, setPrice] = useState(null), [date, setDate] = useState(addDays(today, 7));
  const save = () => {
    if (!i || !(t > 0)) return;
    store.add('purchases', { code: 'OA-' + String(2600 + d.purchases.length + 1), ingId: i.id, supplier: i.supplier, date: today, tonnes: t, price: price ?? i.price, deliveryDate: date, status: 'emesso', source: 'manuale' }, `Nuovo ordine: ${nf(t)} t di ${i.name.toLowerCase()}`);
    toast('Ordine emesso');
  };
  return (
    <Panel title="Nuovo ordine" sub="Dopo l’emissione entra nei fabbisogni">
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Materia prima"><Select value={ing} onChange={v => { setIng(v); setPrice(null); }} options={d.ingredients.map(x => ({ id: x.id, label: x.name }))} id="po-ing" /></Field>
        <div className="form">
          <Field label="Quantità (t)"><NumInput value={t} onChange={setT} decimals={1} id="po-t" /></Field>
          <Field label="Prezzo €/t" hint={`oggi ${nf(i?.price)} €/t`}><NumInput value={price ?? i?.price} onChange={setPrice} decimals={1} id="po-price" /></Field>
        </div>
        <Field label="Consegna prevista" hint={`tempo di consegna tipico ${i?.leadDays ?? '—'} giorni`}><input type="date" className="input" value={date} min={today} onChange={e => setDate(e.target.value)} id="po-date" /></Field>
        <Kv items={[['Fornitore', i?.supplier], ['Valore', `${nf((t || 0) * (price ?? i?.price ?? 0))} €`]]} />
        <Btn kind="primary" icon={LuPlus} onClick={save}>Emetti ordine</Btn>
      </div>
    </Panel>
  );
}

function Arrivo({ d, po, onDone }) {
  const I = idx(d); const today = appToday(d);
  const ing = I.ing[po.ingId];
  const [t, setT] = useState(po.tonnes), [ddt, setDdt] = useState(''), [date, setDate] = useState(today);
  const save = () => {
    const ops = receivePurchaseOps(d, po, { date, tonnes: t, ddt });
    if (!ops) return;
    store.batch(ops, `Arrivo registrato: ${nf(t)} t di ${ing.name.toLowerCase()} (${po.code})`);
    toast('Arrivo registrato: il lotto è in attesa dell’analisi di accettazione', 'ok', { label: 'Apri lotti', fn: () => go('qualita', 'lotti-mp') });
    onDone();
  };
  return (
    <Panel title={`Arrivo ${po.code}`} sub={`${ing?.name} · ${po.supplier}`} actions={<Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={onDone} />}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="form">
          <Field label="Quantità ricevuta (t)"><NumInput value={t} onChange={setT} decimals={2} id="rc-t" /></Field>
          <Field label="Data"><input type="date" className="input" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Documento di trasporto"><input className="input" value={ddt} onChange={e => setDdt(e.target.value)} placeholder="Es. DDT 4821" /></Field>
        <p className="small muted">Il lotto nasce «in attesa»: diventa scorta utilizzabile solo dopo l’accettazione in Qualità (umidità, proteina, aflatossina B1).</p>
        <Btn kind="primary" icon={LuPackageCheck} onClick={save}>Registra arrivo</Btn>
      </div>
    </Panel>
  );
}

/* ---------------- mercati ---------------- */
function useMarket(d) {
  return useMemo(() => {
    const by = {};
    for (const q of d.market) (by[q.commodity] ||= { id: q.commodity, label: q.label, pts: [] }).pts.push(q);
    const today = appToday(d);
    for (const c of Object.values(by)) {
      c.pts = c.pts.filter(p => p.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
      const y = c.pts.map(p => p.price);
      c.last = y[y.length - 1]; c.ch4 = y.length > 4 ? (c.last / y[y.length - 5] - 1) * 100 : null;
      c.min52 = Math.min(...y.slice(-52)); c.max52 = Math.max(...y.slice(-52));
      c.fc = forecast(y, 8, 1);
      const bt = backtest(y, 4, 1, 52);
      // metodo ingenuo: il prezzo tra 4 settimane è uguale a quello di oggi
      const naive = []; for (let t = 52; t + 4 <= y.length; t++) naive.push(Math.abs(y[t - 1] - y[t + 3]) / y[t + 3]);
      c.bt = bt; c.naive = naive.length ? mean(naive) : null;
    }
    return Object.values(by);
  }, [d.market, appToday(d)]);
}

function Mercati({ d, sel }) {
  const list = useMarket(d);
  const cur = list.find(c => c.id === sel) || list[0];
  if (!cur) return <Empty title="Nessuna quotazione">Importa le quotazioni da «Dati».</Empty>;
  const n = cur.pts.length;
  const labels = [...cur.pts.map(p => p.date), ...cur.fc.points.map(p => addDays(cur.pts[n - 1].date, 7 * p.k))];
  const hist = [...cur.pts.map(p => p.price), ...cur.fc.points.map(() => null)];
  const fcs = [...cur.pts.map((p, i) => (i === n - 1 ? p.price : null)), ...cur.fc.points.map(p => p.value)];
  const lo = [...cur.pts.map((p, i) => (i === n - 1 ? p.price : null)), ...cur.fc.points.map(p => p.lo)];
  const hi = [...cur.pts.map((p, i) => (i === n - 1 ? p.price : null)), ...cur.fc.points.map(p => p.hi)];
  const beats = cur.bt.mape != null && cur.naive != null ? cur.bt.mape < cur.naive : null;
  const buys = d.ingLots.filter(l => l.ingId === cur.id);
  return (
    <>
      <Panel title="Quotazioni" sub="Ultima quotazione, variazione a 4 settimane e previsione a 4 settimane · clic per il grafico" flush>
        <Table rows={list} selected={cur.id} onRow={c => go('acquisti', 'mercati', c.id)} pageSize={20} cols={[
          { key: 'label', label: 'Prodotto', render: c => <b>{c.label}</b> },
          { key: 'last', label: 'Ultima €/t', align: 'r', render: c => nf(c.last) },
          { key: 'ch4', label: '4 settimane', align: 'r', render: c => <span className={Math.abs(c.ch4) >= 5 ? 'chip warn' : ''}>{sf(c.ch4, 1)}%</span> },
          { key: 'rng', label: 'Min–max 52 sett.', align: 'r', nosort: true, render: c => `${nf(c.min52)}–${nf(c.max52)}` },
          { key: 'fc', label: 'Previsione a 4 sett.', align: 'r', sort: c => c.fc.points[3].value, render: c => <>{nf(c.fc.points[3].value)}<span className="sub">{nf(c.fc.points[3].lo)}–{nf(c.fc.points[3].hi)}</span></> },
          { key: 'mape', label: 'Errore storico', align: 'r', sort: c => c.bt.mape, render: c => <>{nf(c.bt.mape * 100, 1)}%<span className="sub">ingenuo {nf(c.naive * 100, 1)}%</span></> },
        ]} />
      </Panel>
      <div className="split">
        <Panel title={cur.label} sub="Quotazione settimanale (dati dimostrativi) e previsione a 8 settimane con banda P10–P90" id="acq-market">
          <LineChart labels={labels} height={260} unit="€/t" decimals={1} formatX={x => dateIt(x, 'mon')} xEvery={13}
            series={[{ key: 'h', label: 'Quotazione', color: 'var(--s1)', values: hist }, { key: 'f', label: 'Previsione', color: 'var(--s2)', values: fcs, dashed: true }]}
            band={{ lo, hi, label: 'Banda P10–P90' }} ariaLabel={`Quotazioni e previsione di ${cur.label}`} markLast={false} />
          <Legend items={[{ label: 'Quotazione', color: 'var(--s1)', line: true }, { label: 'Previsione', color: 'var(--s2)', line: true }, { label: 'Banda P10–P90', color: 'color-mix(in srgb, var(--s1) 25%, transparent)' }]} />
        </Panel>
        <Panel title="Quanto fidarsi della previsione" sub="Verifica sui dati passati (backtest a origine mobile, orizzonte 4 settimane)">
          <div className="stack" style={{ gap: 12 }}>
            <Kv items={[['Errore medio (MAPE)', `${nf(cur.bt.mape * 100, 1)}%`], ['Metodo ingenuo («come oggi»)', `${nf(cur.naive * 100, 1)}%`], ['Distorsione media', `${cur.bt.bias > 0 ? '+' : ''}${nf(cur.bt.bias, 1)} €/t`], ['Valori reali dentro la banda', `${nf(cur.bt.coverage * 100)}% (atteso ≈ 80%)`], ['Prove', `${cur.bt.n} previsioni verificate`]]} />
            <div className={`note ${beats ? 'good' : 'maize'}`}>{beats ? 'Il modello ha sbagliato meno del metodo ingenuo: la tendenza stimata aggiunge informazione.' : 'Il modello non batte il metodo ingenuo: per questa materia prima conviene leggere la previsione come «prezzo stabile» con la sua banda di incertezza.'}</div>
            <p className="small muted">Metodo: livellamento esponenziale con tendenza (Holt), parametri scelti sui dati. Non è un consiglio d’acquisto: serve a dare un ordine di grandezza del rischio di prezzo.</p>
            {buys.length > 0 && <Kv items={[['Nostri acquisti (lotti)', `${buys.length} · prezzo medio ${nf(sum(buys, l => l.price * l.tonnes) / Math.max(1, sum(buys, l => l.tonnes)))} €/t`]]} />}
          </div>
        </Panel>
      </div>
    </>
  );
}
