/* FeedOS 16 · Commerciale: clienti sul territorio con margine reale, offerte con prezzo minimo in tempo reale,
 * listino allineato ai costi, visite tecniche con il reddito sul costo alimentare (IOFC), rete agenti. */
import React, { useMemo, useRef, useState } from 'react';
import { LuPlus, LuSend, LuCheck, LuX, LuDownload, LuSparkles, LuTriangleAlert, LuMapPin, LuUsers } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, signals, costs, customerStats, volumes } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, mean, round, relDays } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { offerCheck } from '../engine/costing.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv, useWidth } from '../ui/ui.jsx';
import { Bars, Columns, Legend, SERIES } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

const OSTATUS = { bozza: '', inviata: 'accent', accettata: 'good', persa: 'crit' };
export const OCHECK = { ok: { kind: 'good', label: 'margine obiettivo' }, 'sotto-obiettivo': { kind: 'warn', label: 'sotto l’obiettivo' }, 'sotto-minimo': { kind: 'crit', label: 'sotto il minimo' } };
const agentColor = (d, id) => SERIES[Math.max(0, d.agents.findIndex(a => a.id === id)) % SERIES.length];

export function Commerciale({ route }) {
  const d = useData();
  const tab = route.tab || 'clienti';
  return (
    <>
      <PageHead title="Commerciale" lead="Clienti con il margine vero (prezzo meno costo pieno di oggi), offerte che mostrano il prezzo minimo mentre le scrivi, listino allineato ai costi, visite tecniche con il reddito sul costo alimentare."
        actions={<Btn kind="primary" icon={LuPlus} onClick={() => go('commerciale', 'offerte', 'nuova')}>Nuova offerta</Btn>}
        tabs={NAV.commerciale.tabs} tab={tab} onTab={t => go('commerciale', t)} />
      {tab === 'clienti' && <Clienti d={d} sel={route.id} />}
      {tab === 'offerte' && <Offerte d={d} sel={route.id} />}
      {tab === 'listino' && <Listino d={d} />}
      {tab === 'visite' && <Visite d={d} />}
      {tab === 'rete' && <Rete d={d} />}
    </>
  );
}

/* ---------------- clienti ---------------- */
function useCustomerRows(d) {
  const S = customerStats(d); const today = appToday(d); const I = idx(d);
  return useMemo(() => {
    const from90 = addDays(today, -90), from180 = addDays(today, -180);
    const t90 = {}, tPrev = {};
    for (const s of d.shipments) { if (s.date > from90) t90[s.customerId] = (t90[s.customerId] || 0) + s.tonnes; else if (s.date > from180) tPrev[s.customerId] = (tPrev[s.customerId] || 0) + s.tonnes; }
    return d.customers.map(c => { const s = S[c.id] || {}; return { ...c, ...s, agent: I.agent[c.agentId]?.name, marginT: s.tonnes ? s.margin / s.tonnes : null, idle: s.last ? daysBetween(s.last, today) : null, trend: tPrev[c.id] ? (t90[c.id] || 0) / tPrev[c.id] - 1 : null }; });
  }, [S, d.customers, today]);
}

function Clienti({ d, sel }) {
  const rows = useCustomerRows(d); const today = appToday(d);
  const [q, setQ] = useState(''), [agent, setAgent] = useState('');
  React.useEffect(() => { if (sel && d.customers.some(c => c.id === sel)) openDrawer('customer', sel); }, [sel]);
  const view = filterRows(rows.filter(r => !agent || r.agentId === agent), q, ['name', 'city', 'province', 'agent', 'code']);
  const active = rows.filter(r => r.idle != null && r.idle <= 90);
  const sigs = signals(d).filter(s => s.area === 'commerciale' && s.link?.tab === 'clienti');
  return (
    <>
      <div className="kpis">
        <Kpi label="Clienti attivi (90 giorni)" value={active.length} foot={`su ${rows.length} in anagrafica`} />
        <Kpi label="Consegnato in 12 mesi" value={nf(sum(rows, r => r.tonnes || 0))} unit="t" foot={`${nf(sum(rows, r => r.revenue || 0) / 1e6, 2)} M€ di ricavi`} />
        <Kpi label="Margine medio" value={nf(sum(rows, r => r.margin || 0) / Math.max(1, sum(rows, r => r.tonnes || 0)), 1)} unit="€/t" foot="prezzo meno costo pieno di oggi" />
        <Kpi label="Clienti fermi da oltre 30 giorni" value={rows.filter(r => r.idle > 30).length} foot="con consegne nei 12 mesi" />
      </div>
      {sigs.length > 0 && <Panel title="Clienti da richiamare" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="split r">
        <Panel title="Sul territorio" sub="Ogni punto è un cliente: colore = agente, dimensione = tonnellate in 12 mesi" id="com-map">
          <CustomerMap d={d} rows={rows} onPick={c => openDrawer('customer', c.id)} agent={agent} />
          <Legend items={d.agents.map(a => ({ label: a.name, color: agentColor(d, a.id) }))} />
        </Panel>
        <Panel title="Clienti" sub="Margine sui prezzi effettivi delle consegne · clic per la scheda" flush
          actions={<><select className="select" style={{ width: 170 }} value={agent} onChange={e => setAgent(e.target.value)} aria-label="Agente"><option value="">Tutti gli agenti</option>{d.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><SearchBox value={q} onChange={setQ} placeholder="Cliente o comune" id="cust-search" /></>}>
          <Table rows={view} selected={sel} onRow={c => openDrawer('customer', c.id)} initialSort={{ key: 'tonnes', dir: 'desc' }} pageSize={25} cols={[
            { key: 'name', label: 'Cliente', render: c => <><b>{c.name}</b><span className="sub">{c.city} ({c.province}) · {c.type}</span></> },
            { key: 'tonnes', label: 't 12 mesi', align: 'r', render: c => nf(c.tonnes || 0) },
            { key: 'marginT', label: 'Margine €/t', align: 'r', render: c => c.marginT == null ? '—' : <span className={c.marginT < 0 ? 'chip crit' : ''}>{nf(c.marginT, 1)}</span> },
            { key: 'trend', label: 'Ultimi 90 gg', align: 'r', render: c => c.trend == null ? '—' : <span className={c.trend < -0.25 ? 'chip warn' : ''}>{sf(c.trend * 100)}%</span> },
            { key: 'idle', label: 'Ultima consegna', align: 'r', render: c => c.last ? <span className={c.idle > 30 ? 'chip warn' : ''}>{relDays(c.last, today)}</span> : '—' },
            { key: 'agent', label: 'Agente' },
          ]} />
        </Panel>
      </div>
    </>
  );
}

function CustomerMap({ d, rows, onPick, agent }) {
  const box = useRef(null); const W = useWidth(box, 420);
  const [hover, setHover] = useState(null);
  const pts = rows.filter(r => r.lat != null);
  if (!pts.length) return <Empty title="Nessuna coordinata" />;
  const lat0 = Math.min(...pts.map(p => p.lat)) - 0.1, lat1 = Math.max(...pts.map(p => p.lat)) + 0.1;
  const lon0 = Math.min(...pts.map(p => p.lon)) - 0.1, lon1 = Math.max(...pts.map(p => p.lon)) + 0.1;
  const k = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
  const H = Math.min(560, Math.max(300, W * (lat1 - lat0) / ((lon1 - lon0) * k)));
  const sx = (W - 20) / ((lon1 - lon0) * k), sy = (H - 20) / (lat1 - lat0), s = Math.min(sx, sy);
  const x = lon => 10 + (lon - lon0) * k * s, y = lat => 10 + (lat1 - lat) * s;
  const tmax = Math.max(...pts.map(p => p.tonnes || 0), 1);
  const r = t => 3 + 9 * Math.sqrt((t || 0) / tmax);
  const provs = {};
  for (const p of pts) (provs[p.province] ||= []).push(p);
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="chart map" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mappa schematica dei clienti" style={{ height: H }}>
        <g className="grid">{Array.from({ length: 7 }, (_, i) => lat0 + (lat1 - lat0) * i / 6).map(v => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} />)}</g>
        {Object.entries(provs).map(([pv, ps]) => { const cx = mean(ps.map(p => x(p.lon))), top = Math.min(...ps.map(p => y(p.lat) - r(p.tonnes))); return <text key={pv} x={cx} y={Math.max(12, top - 6)} textAnchor="middle" className="prov">{pv}</text>; })}
        {pts.map((p, i) => (
          <g key={p.id} onPointerEnter={() => setHover(i)} onClick={() => onPick(p)} style={{ cursor: 'pointer' }} opacity={!agent || p.agentId === agent ? 1 : 0.18}>
            <circle cx={x(p.lon)} cy={y(p.lat)} r={r(p.tonnes) + 5} className="hit" />
            <circle cx={x(p.lon)} cy={y(p.lat)} r={r(p.tonnes)} fill={agentColor(d, p.agentId)} fillOpacity={p.idle > 30 ? 0.25 : 0.75} stroke={p.idle > 30 ? agentColor(d, p.agentId) : 'var(--surface)'} strokeWidth={p.idle > 30 ? 2 : 1.2} />
          </g>
        ))}
      </svg>
      {h && <div className="tip" style={{ left: Math.min(Math.max(x(h.lon), 90), W - 90), top: y(h.lat) - r(h.tonnes) - 6 }}><b>{h.name}</b><div className="small">{h.city} · {nf(h.tonnes || 0)} t · {h.marginT != null ? nf(h.marginT, 1) + ' €/t' : '—'}</div>{h.idle > 30 && <div className="small">fermo da {h.idle} giorni</div>}</div>}
      <p className="xs muted" style={{ margin: '6px 0 0' }}>Posizioni dei comuni (coordinate approssimate), senza base cartografica · cerchio vuoto = cliente fermo da oltre 30 giorni.</p>
    </div>
  );
}

/* ---------------- offerte ---------------- */
function Offerte({ d, sel }) {
  const I = idx(d); const C = costs(d); const today = appToday(d);
  const [st, setSt] = useState('aperte');
  React.useEffect(() => { if (sel && sel !== 'nuova' && d.offers.some(o => o.id === sel)) openDrawer('offer', sel); }, [sel]);
  const rows = d.offers.map(o => { const p = I.prod[o.productId]; const c = C[o.productId]; return { ...o, chk: p && c ? offerCheck(o, c, p) : null, cname: I.cust[o.customerId]?.name, pname: p?.name }; })
    .filter(o => st === 'tutte' || (st === 'aperte' ? ['bozza', 'inviata'].includes(o.status) : o.status === st));
  const all = d.offers;
  const decided = all.filter(o => o.status === 'accettata' || o.status === 'persa');
  const setStatus = (o, s) => store.update('offers', o.id, { status: s, decidedAt: ['accettata', 'persa'].includes(s) ? today : null }, `Offerta ${o.code}: ${s}`);
  return (
    <>
      {sel === 'nuova' && <NuovaOfferta d={d} />}
      <div className="kpis">
        <Kpi label="Offerte aperte" value={all.filter(o => ['bozza', 'inviata'].includes(o.status)).length} foot={`${nf(sum(all.filter(o => ['bozza', 'inviata'].includes(o.status)), o => o.tonnes))} t in trattativa`} />
        <Kpi label="Tasso di successo" value={decided.length ? nf(all.filter(o => o.status === 'accettata').length / decided.length * 100) : '—'} unit="%" foot={`${decided.length} offerte decise`} />
        <Kpi label="Aperte sotto il prezzo minimo" value={rows.filter(o => ['bozza', 'inviata'].includes(o.status) && o.chk?.status === 'sotto-minimo').length} foot="da rivedere prima dell’invio" />
        <Kpi label="Margine delle offerte aperte" value={nf(sum(all.filter(o => ['bozza', 'inviata'].includes(o.status)), o => { const p = I.prod[o.productId], c = C[o.productId]; return p && c ? offerCheck(o, c, p).total : 0; }) / 1000, 1)} unit="mila €" foot="ai costi di oggi" />
      </div>
      <Panel title="Offerte" sub="Controllo in tempo reale: il costo pieno è quello di oggi (materie prime, energia, trasformazione, imballo, logistica)" flush
        actions={<Seg options={[{ id: 'aperte', label: 'Aperte' }, { id: 'accettata', label: 'Accettate' }, { id: 'persa', label: 'Perse' }, { id: 'tutte', label: 'Tutte' }]} value={st} onChange={setSt} label="Stato" />}>
        <Table rows={rows} selected={sel} onRow={o => openDrawer('offer', o.id)} initialSort={{ key: 'date', dir: 'desc' }} cols={[
          { key: 'code', label: 'Offerta', render: o => <><span className="code">{o.code}</span><span className="sub">{dateIt(o.date, 'dm')} · valida fino al {dateIt(o.validUntil, 'dm')}</span></> },
          { key: 'cname', label: 'Cliente', render: o => <><b>{o.cname}</b><span className="sub">{o.pname}</span></> },
          { key: 'tonnes', label: 't', align: 'r', render: o => nf(o.tonnes) },
          { key: 'price', label: 'Prezzo €/t', align: 'r', render: o => <>{nf(o.price)}<span className="sub">minimo {nf(o.chk?.minPrice)}</span></> },
          { key: 'margin', label: 'Margine', align: 'r', sort: o => o.chk?.marginPct, render: o => o.chk ? <>{nf(o.chk.margin, 1)} €/t<span className="sub">{nf(o.chk.marginPct * 100, 1)}%</span></> : '—' },
          { key: 'chk', label: 'Controllo', sort: o => o.chk?.status, render: o => o.chk ? <Chip kind={OCHECK[o.chk.status].kind} icon={o.chk.status === 'ok' ? LuCheck : LuTriangleAlert}>{OCHECK[o.chk.status].label}</Chip> : '—' },
          { key: 'status', label: 'Stato', render: o => <select className="select" style={{ height: 30, width: 118 }} value={o.status} onClick={e => e.stopPropagation()} onChange={e => setStatus(o, e.target.value)} aria-label="Stato">{['bozza', 'inviata', 'accettata', 'persa'].map(s => <option key={s}>{s}</option>)}</select> },
        ]} empty="Nessuna offerta in questo stato." />
      </Panel>
    </>
  );
}

function NuovaOfferta({ d }) {
  const I = idx(d); const C = costs(d); const today = appToday(d); const V = volumes(d);
  const [cust, setCust] = useState(d.customers[0]?.id);
  const c = I.cust[cust];
  const prods = d.products.filter(p => !c?.products?.length || c.products.includes(p.code));
  const [pid, setPid] = useState(null);
  const p = I.prod[pid && prods.some(x => x.id === pid) ? pid : prods[0]?.id];
  const cost = p ? C[p.id] : null;
  const [t, setT] = useState(60), [price, setPrice] = useState(null);
  const pr = price ?? (p ? Math.round(p.listPrice * (1 - (c?.discountPct || 0) / 100) / 5) * 5 : 0);
  const chk = p && cost ? offerCheck({ price: pr, tonnes: t }, cost, p) : null;
  const save = status => {
    if (!p || !(t > 0) || !(pr > 0)) return;
    const n = d.offers.length + 101;
    const id = store.add('offers', { code: `OF-${today.slice(2, 4)}-${n}`, date: today, customerId: c.id, productId: p.id, tonnes: t, price: pr, validUntil: addDays(today, 30), status, agentId: c.agentId, note: '', costAtOffer: round(cost.total, 2) }, `Nuova offerta a ${c.name}: ${nf(t)} t di ${p.name} a ${nf(pr)} €/t`);
    toast(status === 'inviata' ? 'Offerta registrata come inviata' : 'Bozza salvata');
    go('commerciale', 'offerte', id);
  };
  return (
    <Panel title="Nuova offerta" sub="Il margine si aggiorna mentre scrivi: costo pieno di oggi, prezzo minimo e obiettivo del prodotto" id="com-offer"
      actions={<Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={() => go('commerciale', 'offerte')} />}>
      <div className="split">
        <div className="stack" style={{ gap: 12 }}>
          <div className="form">
            <Field label="Cliente"><Select value={cust} onChange={v => { setCust(v); setPid(null); setPrice(null); }} options={[...d.customers].sort((a, b) => a.name.localeCompare(b.name)).map(x => ({ id: x.id, label: x.name }))} id="of-cust" /></Field>
            <Field label="Prodotto"><Select value={p?.id} onChange={v => { setPid(v); setPrice(null); }} options={prods.map(x => ({ id: x.id, label: x.name }))} id="of-prod" /></Field>
          </div>
          <div className="form">
            <Field label="Quantità (t)"><NumInput value={t} onChange={v => setT(v || 0)} decimals={0} id="of-t" /></Field>
            <Field label="Prezzo €/t" hint={`listino ${nf(p?.listPrice)} €/t · sconto abituale ${nf(c?.discountPct, 1)}%`}><NumInput value={pr} onChange={setPrice} decimals={0} step={5} id="of-price" /></Field>
          </div>
          <div className="row">
            <Btn small icon={LuSparkles} onClick={() => setPrice(Math.ceil(cost.targetPrice / 5) * 5)}>Prezzo obiettivo {nf(Math.ceil((cost?.targetPrice || 0) / 5) * 5)}</Btn>
            <Btn small onClick={() => setPrice(Math.ceil(cost.minPrice / 5) * 5)}>Prezzo minimo {nf(Math.ceil((cost?.minPrice || 0) / 5) * 5)}</Btn>
          </div>
          <div className="row"><Btn kind="primary" icon={LuSend} onClick={() => save('inviata')}>Registra come inviata</Btn><Btn onClick={() => save('bozza')}>Salva bozza</Btn></div>
        </div>
        {chk && (
          <div className={`offer-check ${chk.status}`}>
            <div className="eyebrow">Esito</div>
            <div className="big"><Chip kind={OCHECK[chk.status].kind} icon={chk.status === 'ok' ? LuCheck : LuTriangleAlert}>{OCHECK[chk.status].label}</Chip></div>
            <Kv items={[['Margine', `${nf(chk.margin, 1)} €/t · ${nf(chk.marginPct * 100, 1)}% del prezzo`], ['Margine dell’offerta', `${nf(chk.total)} €`], ['Costo pieno oggi', `${nf(cost.total, 1)} €/t (materie prime ${nf(cost.raw, 1)})`], ['Prezzo minimo', `${nf(cost.minPrice, 1)} €/t (margine ${nf(p.minMarginPct)}%)`], ['Prezzo obiettivo', `${nf(cost.targetPrice, 1)} €/t (margine ${nf(p.targetMarginPct)}%)`], ['Volume annuo del prodotto', `${nf(V[p.id] || 0)} t`]]} />
            {chk.status === 'sotto-minimo' && <p className="small">Sotto il minimo il prezzo non copre il margine deciso dalla direzione: se è una scelta commerciale, lascia una nota nella scheda dell’offerta.</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- listino ---------------- */
function Listino({ d }) {
  const C = costs(d); const V = volumes(d);
  const rows = d.products.map(p => { const c = C[p.id]; const tgt = Math.ceil(c.targetPrice / 5) * 5; return { ...p, c, marginPct: c.marginPct, tgt, status: c.price < c.minPrice - 1e-9 ? 'sotto-minimo' : c.price < c.targetPrice - 1e-9 ? 'sotto-obiettivo' : 'ok', vol: V[p.id] || 0 }; });
  const under = rows.filter(r => r.status === 'sotto-minimo');
  const setPrice = (p, price) => store.update('products', p.id, { listPrice: price, listUpdatedAt: appToday(d) }, `Listino: ${p.name} a ${nf(price)} €/t`);
  const alignAll = () => confirm(`Aggiornare ${under.length} prezzi di listino?`, <p>I prodotti sotto il margine minimo passano al prezzo obiettivo arrotondato a 5 €/t: {under.map(r => `${r.name} ${nf(r.listPrice)} → ${nf(r.tgt)}`).join('; ')}.</p>, () => {
    store.batch(under.map(r => ({ kind: 'update', coll: 'products', id: r.id, patch: { listPrice: r.tgt, listUpdatedAt: appToday(d) } })), `Listino allineato: ${under.length} prodotti`);
    toast('Listino aggiornato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  }, { ok: 'Aggiorna' });
  return (
    <>
      {under.length > 0 && <div className="note crit row between"><span><b>{under.length} prodotti hanno il prezzo di listino sotto il margine minimo</b> ai costi di oggi: {under.map(r => r.name).join(', ')}.</span><Btn small kind="primary" onClick={alignAll}>Allinea al prezzo obiettivo</Btn></div>}
      <Panel title="Listino" sub="Prezzo di listino (franco partenza, IVA esclusa) confrontato con il costo pieno di oggi" flush
        actions={<Btn small icon={LuDownload} onClick={() => download(`listino-${stamp()}.csv`, toCSV(rows, [{ key: 'code', label: 'Codice' }, { key: 'name', label: 'Prodotto' }, { key: 'form', label: 'Forma' }, { key: 'packaging', label: 'Confezione' }, { key: 'listPrice', label: 'Prezzo €/t' }]), 'text/csv;charset=utf-8')}>Esporta listino</Btn>}>
        <Table rows={rows} onRow={p => openDrawer('product', p.id)} initialSort={{ key: 'marginPct', dir: 'asc' }} cols={[
          { key: 'name', label: 'Prodotto', render: p => <><b>{p.name}</b><span className="sub">{p.code} · {p.form} · {p.packaging}</span></> },
          { key: 'listPrice', label: 'Listino €/t', align: 'r', render: p => <div style={{ width: 96, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}><NumInput value={p.listPrice} decimals={0} slim step={5} onChange={v => v > 0 && setPrice(p, v)} ariaLabel={`Prezzo di ${p.name}`} /></div> },
          { key: 'cost', label: 'Costo pieno', align: 'r', sort: p => p.c.total, render: p => nf(p.c.total, 1) },
          { key: 'marginPct', label: 'Margine', align: 'r', render: p => <>{nf(p.c.margin, 1)} €/t<span className="sub">{nf(p.marginPct * 100, 1)}%</span></> },
          { key: 'min', label: 'Minimo · obiettivo', align: 'r', sort: p => p.c.minPrice, render: p => `${nf(p.c.minPrice)} · ${nf(p.c.targetPrice)}` },
          { key: 'status', label: 'Controllo', render: p => <Chip kind={OCHECK[p.status].kind}>{OCHECK[p.status].label}</Chip> },
          { key: 'vol', label: 't/anno', align: 'r', render: p => nf(p.vol) },
          { key: 'x', label: '', nosort: true, render: p => p.status !== 'ok' ? <Btn small onClick={e => { e.stopPropagation(); setPrice(p, p.tgt); toast(`${p.name}: listino a ${nf(p.tgt)} €/t`, 'ok', { label: 'Annulla', fn: () => store.undo() }); }}>→ {nf(p.tgt)}</Btn> : null },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- visite ---------------- */
function Visite({ d }) {
  const I = idx(d); const today = appToday(d);
  const [agent, setAgent] = useState('');
  const vs = d.visits.filter(v => v.date > addDays(today, -60) && (!agent || v.agentId === agent));
  const dairy = d.visits.filter(v => v.iofc != null && v.date > addDays(today, -180));
  const byC = {};
  for (const v of dairy) (byC[v.customerId] ||= []).push(v);
  const iofc = Object.entries(byC).map(([id, arr]) => ({ key: id, label: I.cust[id]?.name, value: mean(arr.map(v => v.iofc)) })).sort((a, b) => b.value - a.value).slice(0, 12);
  const [f, setF] = useState({ customerId: d.customers[0]?.id, kind: 'tecnica', notes: '', milkKg: null, feedCostHead: null, nextAction: '' });
  const cust = I.cust[f.customerId];
  const isDairy = cust?.species?.includes('bovini-latte');
  const milkPrice = +d.settings?.milkPrice || 0.54;
  const add = () => {
    const iofcV = isDairy && f.milkKg && f.feedCostHead ? round(f.milkKg * milkPrice - f.feedCostHead, 2) : null;
    store.add('visits', { ...f, date: today, agentId: cust?.agentId, milkPrice: isDairy ? milkPrice : null, iofc: iofcV }, `Visita registrata: ${cust?.name}`);
    toast('Visita registrata'); setF(x => ({ ...x, notes: '', milkKg: null, feedCostHead: null, nextAction: '' }));
  };
  return (
    <>
      <div className="split">
        <Panel title="Visite degli ultimi 60 giorni" flush actions={<select className="select" style={{ width: 170 }} value={agent} onChange={e => setAgent(e.target.value)} aria-label="Agente"><option value="">Tutti gli agenti</option>{d.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}>
          <Table rows={vs} onRow={v => openDrawer('customer', v.customerId)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={25} cols={[
            { key: 'date', label: 'Data', render: v => dateIt(v.date, 'dm') },
            { key: 'c', label: 'Cliente', sort: v => I.cust[v.customerId]?.name, render: v => <><b>{I.cust[v.customerId]?.name}</b><span className="sub">{I.agent[v.agentId]?.name}</span></> },
            { key: 'kind', label: 'Tipo', render: v => <Chip kind={v.kind === 'tecnica' ? 'accent' : ''}>{v.kind}</Chip> },
            { key: 'notes', label: 'Note', render: v => <>{v.notes}{v.nextAction && v.nextAction !== 'Nessuna' && <span className="sub">prossimo passo: {v.nextAction}</span>}</> },
            { key: 'iofc', label: 'IOFC €/capo', align: 'r', render: v => v.iofc == null ? '—' : <>{nf(v.iofc, 2)}<span className="sub">{nf(v.milkKg, 1)} kg latte</span></> },
          ]} />
        </Panel>
        <Panel title="Registra una visita" sub="Per le stalle da latte: reddito sul costo alimentare (IOFC) = latte × prezzo − costo della razione per capo al giorno">
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Cliente"><Select value={f.customerId} onChange={v => setF(x => ({ ...x, customerId: v }))} options={[...d.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ id: c.id, label: c.name }))} /></Field>
            <Field label="Tipo"><Seg options={[{ id: 'tecnica', label: 'Tecnica' }, { id: 'commerciale', label: 'Commerciale' }]} value={f.kind} onChange={v => setF(x => ({ ...x, kind: v }))} label="Tipo di visita" /></Field>
            {isDairy && <div className="form">
              <Field label="Latte kg/capo/giorno"><NumInput value={f.milkKg} onChange={v => setF(x => ({ ...x, milkKg: v }))} decimals={1} /></Field>
              <Field label="Razione €/capo/giorno"><NumInput value={f.feedCostHead} onChange={v => setF(x => ({ ...x, feedCostHead: v }))} decimals={2} /></Field>
            </div>}
            {isDairy && f.milkKg && f.feedCostHead ? <div className="note good">IOFC {nf(f.milkKg * milkPrice - f.feedCostHead, 2)} € per capo al giorno (latte a {nf(milkPrice, 2)} €/kg)</div> : null}
            <Field label="Note"><textarea className="input" value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} placeholder="Cosa è emerso" /></Field>
            <Field label="Prossimo passo"><input className="input" value={f.nextAction} onChange={e => setF(x => ({ ...x, nextAction: e.target.value }))} placeholder="Es. inviare offerta" /></Field>
            <Btn kind="primary" icon={LuPlus} onClick={add}>Registra</Btn>
          </div>
        </Panel>
      </div>
      <Panel title="Reddito sul costo alimentare nelle stalle seguite" sub="Media delle visite tecniche degli ultimi 6 mesi (€/capo/giorno) · aiuta a parlare di risultato per l’allevatore, non solo di prezzo al quintale">
        <Bars data={iofc} decimals={2} unit="€" color="var(--s3)" ariaLabel="IOFC per cliente" />
      </Panel>
    </>
  );
}

/* ---------------- rete agenti ---------------- */
function Rete({ d }) {
  const rows = useCustomerRows(d); const today = appToday(d);
  const A = d.agents.map(a => {
    const mine = rows.filter(r => r.agentId === a.id);
    const offers = d.offers.filter(o => o.agentId === a.id);
    const dec = offers.filter(o => o.status === 'accettata' || o.status === 'persa');
    const t = sum(mine, r => r.tonnes || 0), rev = sum(mine, r => r.revenue || 0), m = sum(mine, r => r.margin || 0);
    return { ...a, n: mine.length, t, rev, marginT: t ? m / t : null, visits: d.visits.filter(v => v.agentId === a.id && v.date > addDays(today, -90)).length, win: dec.length ? offers.filter(o => o.status === 'accettata').length / dec.length : null, commission: rev * (a.commissionPct || 0) / 100, idle: mine.filter(r => r.idle > 30).length };
  });
  return (
    <>
      <div className="grid g2 start">
        <Panel title="Tonnellate per agente" sub="Ultimi 12 mesi"><Bars data={A.map(a => ({ key: a.id, label: a.name, value: a.t, color: agentColor(d, a.id) }))} unit="t" ariaLabel="Tonnellate per agente" /></Panel>
        <Panel title="Margine per tonnellata" sub="Sui prezzi effettivi, al costo pieno di oggi"><Bars data={A.map(a => ({ key: a.id, label: a.name, value: a.marginT || 0, color: agentColor(d, a.id) }))} unit="€/t" decimals={1} ariaLabel="Margine per agente" /></Panel>
      </div>
      <Panel title="Rete agenti" flush>
        <Table rows={A} cols={[
          { key: 'name', label: 'Agente', render: a => <><b>{a.name}</b><span className="sub">{a.zone}</span></> },
          { key: 'n', label: 'Clienti', align: 'r' },
          { key: 't', label: 't 12 mesi', align: 'r', render: a => nf(a.t) },
          { key: 'rev', label: 'Ricavi', align: 'r', render: a => nf(a.rev / 1000) + ' mila €' },
          { key: 'marginT', label: 'Margine €/t', align: 'r', render: a => nf(a.marginT, 1) },
          { key: 'visits', label: 'Visite 90 gg', align: 'r' },
          { key: 'win', label: 'Offerte vinte', align: 'r', render: a => a.win == null ? '—' : nf(a.win * 100) + '%' },
          { key: 'idle', label: 'Clienti fermi', align: 'r', render: a => a.idle ? <Chip kind="warn">{a.idle}</Chip> : '—' },
          { key: 'commission', label: 'Provvigioni stimate', align: 'r', render: a => nf(a.commission) + ' €' },
        ]} />
      </Panel>
    </>
  );
}
