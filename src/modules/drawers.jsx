/* FeedOS 16 · schede laterali: prodotto, materia prima, cliente, offerta, reclamo, lotto di prodotto, lotto di materia prima.
 * Ogni scheda mostra i collegamenti (formula, lotti, clienti) e le azioni tipiche del reparto. */
import React, { useMemo, useState } from 'react';
import { LuFlaskConical, LuShieldAlert, LuShieldCheck, LuLock, LuArrowRight, LuPlus, LuCheck, LuX, LuLeaf, LuTag, LuUser, LuWheat, LuBoxes, LuMessageSquare, LuFileText } from 'react-icons/lu';
import { useData, useUi, store, toast, closeDrawer, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, costs, volumes, mrp, traceIndex, customerStats, shippedByLot } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, relDays, round } from '../core/util.js';
import { NUT } from '../engine/nutrients.js';
import { offerCheck } from '../engine/costing.js';
import { backward } from '../engine/trace.js';
import { acceptIngLotOps } from '../engine/operations.js';
import { checkAnalysis } from '../engine/quality.js';
import { Drawer, Btn, Chip, Kv, Table, Field, NumInput, Select, confirm } from '../ui/ui.jsx';
import { StackBar, Legend, SERIES } from '../ui/charts.jsx';
import { lotChip, declaredFor, lotCheck, PARAMS } from './qualita.jsx';
import { OCHECK } from './commerciale.jsx';

export function DrawerHost() {
  const dr = useUi(s => s.drawer);
  const d = useData();
  if (!dr) return null;
  const C = { product: ProductD, ingredient: IngredientD, customer: CustomerD, offer: OfferD, complaint: ComplaintD, lot: LotD, ingLot: IngLotD }[dr.kind];
  return C ? <C key={dr.kind + dr.id} d={d} id={dr.id} /> : null;
}
const nav = (...a) => { closeDrawer(); go(...a); };
const Missing = () => <Drawer title="Elemento non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;

/* ---------- prodotto ---------- */
function ProductD({ d, id }) {
  const I = idx(d); const p = I.prod[id]; if (!p) return <Missing />;
  const c = costs(d)[id]; const V = volumes(d); const f = I.form[p.formulaId];
  const S = customerStats(d);
  const top = d.customers.map(x => ({ x, t: S[x.id]?.byProduct?.[id] || 0 })).filter(r => r.t > 0).sort((a, b) => b.t - a.t).slice(0, 6);
  const lots = d.lots.filter(l => l.productId === id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const parts = c.parts.filter(x => x.v > 0.01);
  return (
    <Drawer title={p.name} sub={`Prodotto · ${p.code}`} icon={<span className="dicon"><LuBoxes /></span>} wide
      actions={<><Btn icon={LuFlaskConical} onClick={() => nav('formulazione', 'formule', p.formulaId)}>Formula</Btn><Btn icon={LuLeaf} onClick={() => nav('esg', 'passaporto', p.id)}>Passaporto</Btn><Btn kind="primary" icon={LuArrowRight} onClick={() => nav('economia', 'margini', p.id)}>Margini</Btn></>}>
      <Kv items={[['Forma e confezione', `${p.form} · ${p.packaging}`], ['Linea', I.line[p.lineId]?.name], ['Formula', f ? `${f.code} · versione ${f.version}` : '—'], ['Volume', `${nf(V[id] || 0)} t negli ultimi 12 mesi`]]} />
      <div className="dsec"><div className="eyebrow">Costo pieno di oggi · {nf(c.total, 1)} €/t</div>
        <StackBar parts={parts.map((x, i) => ({ key: x.k, label: x.k, value: x.v, color: SERIES[i] }))} ariaLabel="Composizione del costo" />
        <Legend items={parts.map((x, i) => ({ label: `${x.k} ${nf(x.v, 1)}`, color: SERIES[i] }))} />
      </div>
      <Kv items={[['Prezzo di listino', `${nf(p.listPrice)} €/t`], ['Margine a listino', `${nf(c.margin, 1)} €/t (${nf(c.marginPct * 100, 1)}%)`], ['Prezzo minimo', `${nf(c.minPrice, 1)} €/t · margine ${p.minMarginPct}%`], ['Prezzo obiettivo', `${nf(c.targetPrice, 1)} €/t · margine ${p.targetMarginPct}%`]]} />
      {c.price < c.minPrice && <div className="note crit">Il listino è sotto il prezzo minimo: rivedere il prezzo o la formula.</div>}
      <div className="dsec"><div className="eyebrow">Clienti principali</div>
        {top.map(r => <button key={r.x.id} className="dlink" onClick={() => openDrawer('customer', r.x.id)}><span>{r.x.name}</span><span className="muted">{nf(r.t)} t</span></button>)}
      </div>
      <div className="dsec"><div className="eyebrow">Ultimi lotti</div>
        {lots.map(l => <button key={l.id} className="dlink" onClick={() => openDrawer('lot', l.id)}><span className="code">{l.code}</span><span className="muted">{dateIt(l.date, 'dm')} · {nf(l.tonnes, 1)} t</span>{lotChip(l.status)}</button>)}
      </div>
    </Drawer>
  );
}

/* ---------- materia prima ---------- */
function IngredientD({ d, id }) {
  const I = idx(d); const ing = I.ing[id]; if (!ing) return <Missing />;
  const row = mrp(d).rows.find(r => r.ingId === id);
  const uses = d.formulas.map(f => ({ f, kg: f.lines.find(l => l.ing === id)?.kg || 0 })).filter(x => x.kg > 0).sort((a, b) => b.kg - a.kg);
  const lots = d.ingLots.filter(l => l.ingId === id && l.status === 'accettato' && l.remaining > 0.005).sort((a, b) => (a.date < b.date ? -1 : 1));
  const waiting = d.ingLots.filter(l => l.ingId === id && l.status === 'in attesa');
  const upd = (patch, label) => store.update('ingredients', id, patch, label);
  const nuts = ['PG', 'GG', 'FG', 'CE', 'AM', 'NDF', 'UFL', 'EN', 'EM', 'LYS', 'MET', 'CA', 'P', 'NA'].filter(k => ing.nutr?.[k]);
  return (
    <Drawer title={ing.name} sub={`Materia prima · ${ing.code}`} icon={<span className="dicon"><LuWheat /></span>} wide
      actions={<><Btn onClick={() => nav('acquisti', 'fabbisogni', id)}>Fabbisogni</Btn><Btn onClick={() => nav('acquisti', 'scorte', id)}>Scorte</Btn><Btn kind="primary" icon={LuShieldAlert} onClick={() => nav('qualita', 'lotti-mp')}>Lotti</Btn></>}>
      <div className="form">
        <Field label="Prezzo €/t" hint="usato da formule, costi e scenari"><NumInput value={ing.price} decimals={1} onChange={v => v != null && v >= 0 && upd({ price: v, priceDate: appToday(d) }, `Prezzo di ${ing.name}: ${nf(v, 1)} €/t`)} /></Field>
        <Field label="Consegna (giorni)"><NumInput value={ing.leadDays} decimals={0} onChange={v => v != null && upd({ leadDays: v }, `Tempo di consegna di ${ing.name}`)} /></Field>
        <Field label="Scorta di sicurezza (giorni)"><NumInput value={ing.safetyDays} decimals={0} onChange={v => v != null && upd({ safetyDays: v }, `Scorta di sicurezza di ${ing.name}`)} /></Field>
        <Field label="Massimo in formula (kg/t)"><NumInput value={ing.maxKg} decimals={0} onChange={v => upd({ maxKg: v }, `Limite di ${ing.name}`)} /></Field>
      </div>
      <Kv items={[['Categoria', `${ing.category}${ing.coProduct ? ' · co-prodotto' : ''}${ing.certified ? ' · ' + ing.certified : ''}`], ['Fornitore', ing.supplier || '—'], ['Origine', ing.origin || '—'], ['Scorta utilizzabile', `${nf(ing.stock, 1)} t${row?.cover != null ? ` · ${nf(row.cover)} giorni di copertura` : ''}`], ['In attesa di accettazione', waiting.length ? `${waiting.length} lotti · ${nf(sum(waiting, l => l.tonnes), 1)} t` : 'nessuno'], ['Emissioni (indicative)', ing.ef != null ? `${nf(ing.ef)} kg CO₂e/t` : '—'], ['Aflatossina B1 tipica', ing.contam?.AFB1 ? `${nf(ing.contam.AFB1, 1)} µg/kg` : '—']]} />
      <div className="dsec"><div className="eyebrow">Valori nutrizionali (tal quale · sostanza secca {nf(ing.dm, 1)}%)</div>
        <div className="nutgrid">{nuts.map(k => <div key={k}><span>{NUT[k]?.short}</span><b>{nf(ing.nutr[k], NUT[k]?.dec)}</b><small>{NUT[k]?.unit}</small></div>)}</div>
      </div>
      <div className="dsec"><div className="eyebrow">Usata in {uses.length} formule</div>
        {uses.map(x => <button key={x.f.id} className="dlink" onClick={() => nav('formulazione', 'formule', x.f.id)}><span>{x.f.name}</span><span className="muted">{nf(x.kg, 1)} kg/t</span></button>)}
      </div>
      <div className="dsec"><div className="eyebrow">Lotti in giacenza (ordine di utilizzo)</div>
        {lots.length ? lots.map(l => <button key={l.id} className="dlink" onClick={() => openDrawer('ingLot', l.id)}><span className="code">{l.code}</span><span className="muted">{dateIt(l.date, 'dm')} · {nf(l.remaining, 1)} t{l.analyses?.AFB1 != null ? ` · AFB1 ${nf(l.analyses.AFB1, 1)}` : ''}</span></button>) : <span className="small muted">Nessun lotto in giacenza.</span>}
      </div>
    </Drawer>
  );
}

/* ---------- cliente ---------- */
function CustomerD({ d, id }) {
  const I = idx(d); const c = I.cust[id]; if (!c) return <Missing />;
  const S = customerStats(d)[id] || {}; const today = appToday(d);
  const ships = d.shipments.filter(s => s.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const offers = d.offers.filter(o => o.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const compl = d.complaints.filter(x => x.customerId === id);
  const visits = d.visits.filter(v => v.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const iofc = visits.filter(v => v.iofc != null).slice(0, 6);
  return (
    <Drawer title={c.name} sub={`Cliente · ${c.code} · ${c.type}`} icon={<span className="dicon"><LuUser /></span>} wide
      actions={<><Btn onClick={() => nav('commerciale', 'visite')}>Visite</Btn><Btn kind="primary" icon={LuPlus} onClick={() => nav('commerciale', 'offerte', 'nuova')}>Nuova offerta</Btn></>}>
      <div className="kpis two">
        <div className="kpi"><span className="lbl">Consegnato in 12 mesi</span><span className="val">{nf(S.tonnes || 0)}<small>t</small></span><span className="foot">{nf((S.revenue || 0) / 1000)} mila € di ricavi</span></div>
        <div className="kpi"><span className="lbl">Margine</span><span className="val">{S.tonnes ? nf(S.margin / S.tonnes, 1) : '—'}<small>€/t</small></span><span className="foot">ultima consegna {S.last ? relDays(S.last, today) : '—'}</span></div>
      </div>
      <Kv items={[['Comune', `${c.city} (${c.province})`], ['Agente', I.agent[c.agentId]?.name], ['Specie', (c.species || []).join(', ')], ['Capi', c.heads ? nf(c.heads) : '—'], ['Prodotti abituali', (c.products || []).map(code => d.products.find(p => p.code === code)?.name || code).join(', ')], ['Pagamento', `${c.paymentDays} giorni · sconto abituale ${nf(c.discountPct, 1)}%`], ['Cliente dal', c.since]]} />
      {iofc.length > 0 && <div className="note good">Reddito sul costo alimentare (IOFC) nelle ultime visite tecniche: {iofc.map(v => `${nf(v.iofc, 2)} €`).join(' · ')} per capo al giorno.</div>}
      <div className="dsec"><div className="eyebrow">Ultime consegne</div>
        {ships.slice(0, 8).map(s => <button key={s.id} className="dlink" onClick={() => openDrawer('lot', s.lotId)}><span>{dateIt(s.date, 'dm')} · {I.prod[s.productId]?.name}</span><span className="muted">{nf(s.tonnes, 1)} t · {nf(s.price)} €/t · lotto {I.lot[s.lotId]?.code}</span></button>)}
      </div>
      {offers.length > 0 && <div className="dsec"><div className="eyebrow">Offerte</div>{offers.slice(0, 5).map(o => <button key={o.id} className="dlink" onClick={() => openDrawer('offer', o.id)}><span className="code">{o.code}</span><span className="muted">{I.prod[o.productId]?.name} · {nf(o.tonnes)} t a {nf(o.price)}</span><Chip>{o.status}</Chip></button>)}</div>}
      {compl.length > 0 && <div className="dsec"><div className="eyebrow">Reclami</div>{compl.map(x => <button key={x.id} className="dlink" onClick={() => openDrawer('complaint', x.id)}><span className="code">{x.code}</span><span className="muted">{x.description}</span><Chip>{x.status}</Chip></button>)}</div>}
    </Drawer>
  );
}

/* ---------- offerta ---------- */
function OfferD({ d, id }) {
  const I = idx(d); const o = d.offers.find(x => x.id === id);
  const [note, setNote] = useState(o?.note || '');
  if (!o) return <Missing />;
  const p = I.prod[o.productId]; const cost = costs(d)[o.productId]; const chk = offerCheck(o, cost, p);
  return (
    <Drawer title={`Offerta ${o.code}`} sub={`${I.cust[o.customerId]?.name} · ${dateIt(o.date)}`} icon={<span className="dicon"><LuFileText /></span>}
      actions={<><Btn onClick={() => openDrawer('customer', o.customerId)}>Cliente</Btn><Btn onClick={() => openDrawer('product', o.productId)}>Prodotto</Btn></>}>
      <Kv items={[['Prodotto', p?.name], ['Quantità', `${nf(o.tonnes)} t`], ['Prezzo', `${nf(o.price)} €/t (listino ${nf(p?.listPrice)})`], ['Valida fino al', dateIt(o.validUntil)], ['Agente', I.agent[o.agentId]?.name]]} />
      <div className={`offer-check ${chk.status}`}>
        <Chip kind={OCHECK[chk.status].kind}>{OCHECK[chk.status].label}</Chip>
        <Kv items={[['Margine ai costi di oggi', `${nf(chk.margin, 1)} €/t · ${nf(chk.marginPct * 100, 1)}%`], ['Margine dell’offerta', `${nf(chk.total)} €`], ['Prezzo minimo · obiettivo', `${nf(cost.minPrice, 1)} · ${nf(cost.targetPrice, 1)} €/t`], o.costAtOffer ? ['Costo pieno all’offerta', `${nf(o.costAtOffer, 1)} €/t (oggi ${nf(cost.total, 1)})`] : null]} />
      </div>
      <Field label="Stato"><Select value={o.status} onChange={v => store.update('offers', o.id, { status: v, decidedAt: ['accettata', 'persa'].includes(v) ? appToday(d) : null }, `Offerta ${o.code}: ${v}`)} options={['bozza', 'inviata', 'accettata', 'persa']} /></Field>
      <Field label="Nota" hint="Motivo di una scelta commerciale, esito della trattativa"><textarea className="input" value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (o.note || '') && store.update('offers', o.id, { note }, `Offerta ${o.code}: nota`)} /></Field>
    </Drawer>
  );
}

/* ---------- reclamo ---------- */
function ComplaintD({ d, id }) {
  const I = idx(d); const c = d.complaints.find(x => x.id === id);
  const today = appToday(d);
  const [f, setF] = useState({ rootCause: c?.rootCause || '', action: c?.action || '', cost: c?.cost ?? null });
  if (!c) return <Missing />;
  const upd = (patch, label) => store.update('complaints', c.id, patch, label);
  const setStatus = s => upd({ status: s, closedAt: s === 'chiuso' ? today : null, ...(s === 'chiuso' ? f : {}) }, `Reclamo ${c.code}: ${s}`);
  const lot = I.lot[c.lotId]; const run = lot ? I.run[lot.runId] : null;
  return (
    <Drawer title={`Reclamo ${c.code}`} sub={`${I.cust[c.customerId]?.name} · ${dateIt(c.date)} · da ${daysBetween(c.date, today)} giorni`} icon={<span className="dicon"><LuMessageSquare /></span>} wide
      actions={<>{lot && <Btn icon={LuShieldAlert} onClick={() => nav('qualita', 'richiamo', lot.id)}>Simula richiamo del lotto</Btn>}<Btn kind="primary" icon={LuCheck} disabled={c.status === 'chiuso'} onClick={() => setStatus('chiuso')}>Chiudi il reclamo</Btn></>}>
      <div className="note"><b>{c.category}</b> · {c.description}</div>
      <Kv items={[['Prodotto', I.prod[c.productId]?.name], ['Lotto', lot ? `${lot.code} del ${dateIt(lot.date)} · ${I.line[run?.lineId]?.name || ''}` : '—'], ['Gravità', c.severity], ['Responsabile', c.owner]]} />
      {lot && <Btn small icon={LuTag} onClick={() => openDrawer('lot', lot.id)}>Apri il lotto: analisi e materie prime usate</Btn>}
      <Field label="Stato"><div className="seg" role="group" aria-label="Stato del reclamo">{['aperto', 'analisi', 'azione', 'chiuso'].map(s => <button key={s} aria-pressed={c.status === s} onClick={() => setStatus(s)}>{s}</button>)}</div></Field>
      <Field label="Causa trovata"><input className="input" value={f.rootCause} onChange={e => setF(x => ({ ...x, rootCause: e.target.value }))} onBlur={() => f.rootCause !== (c.rootCause || '') && upd({ rootCause: f.rootCause }, `Reclamo ${c.code}: causa`)} placeholder="Es. umidità di condizionamento bassa" /></Field>
      <Field label="Azione correttiva"><input className="input" value={f.action} onChange={e => setF(x => ({ ...x, action: e.target.value }))} onBlur={() => f.action !== (c.action || '') && upd({ action: f.action }, `Reclamo ${c.code}: azione`)} placeholder="Es. taratura del condizionatore" /></Field>
      <Field label="Costo del reclamo €"><NumInput value={f.cost} decimals={0} onChange={v => { setF(x => ({ ...x, cost: v })); upd({ cost: v }, `Reclamo ${c.code}: costo`); }} /></Field>
    </Drawer>
  );
}

/* ---------- lotto di prodotto ---------- */
function LotD({ d, id }) {
  const I = idx(d); const lot = I.lot[id];
  const today = appToday(d);
  const B = useMemo(() => (lot ? backward(traceIndex(d), id) : null), [d.lots, d.shipments, d.ingLots, id]);
  const [an, setAn] = useState({ PG: null, GG: null, FG: null, CE: null, UM: null });
  if (!lot || !B) return <Missing />;
  const chk = lotCheck(d, lot, I); const dec = declaredFor(d, lot, I);
  const run = I.run[lot.runId]; const shipped = sum(B.shipments, s => s.tonnes);
  const addAn = () => {
    if (!PARAMS.some(p => an[p.id] != null)) { toast('Inserisci almeno un valore', 'err'); return; }
    store.update('lots', id, x => ({ ...x, analyses: [...(x.analyses || []), { date: today, method: 'Laboratorio', values: { ...an } }] }), `Analisi registrata sul lotto ${lot.code}`);
    toast('Analisi registrata: esito calcolato con le tolleranze di legge'); setAn({ PG: null, GG: null, FG: null, CE: null, UM: null });
  };
  const setStatus = s => store.update('lots', id, { status: s, ...(s === 'rilasciato' ? { releasedAt: today } : { blockedAt: today }) }, `Lotto ${lot.code}: ${s}`);
  return (
    <Drawer title={`Lotto ${lot.code}`} sub={`${I.prod[lot.productId]?.name} · ${dateIt(lot.date)} · ${nf(lot.tonnes, 1)} t`} icon={<span className="dicon"><LuTag /></span>} wide
      actions={<><Btn icon={LuShieldAlert} onClick={() => nav('qualita', 'richiamo', id)}>Simula richiamo</Btn>
        {lot.status !== 'bloccato' && <Btn kind="danger" icon={LuLock} onClick={() => confirm(`Bloccare il lotto ${lot.code}?`, <p>{nf(Math.max(0, lot.tonnes - shipped), 1)} t a magazzino non potranno essere spedite.</p>, () => setStatus('bloccato'), { ok: 'Blocca', danger: true })}>Blocca</Btn>}
        {lot.status !== 'rilasciato' && <Btn kind="primary" icon={LuShieldCheck} onClick={() => setStatus('rilasciato')}>Rilascia</Btn>}</>}>
      <div className="row gap-s">{lotChip(lot.status)}{chk.status === 'ok' ? <Chip kind="good">conforme all’etichetta</Chip> : chk.status === 'fuori' ? <Chip kind="crit">fuori tolleranza</Chip> : <Chip>non analizzato</Chip>}</div>
      <Kv items={[['Linea e turno', `${I.line[run?.lineId]?.name || '—'} · ${run?.shift || '—'}`], ['Formula', `${I.form[run?.formulaId]?.code || '—'} versione ${run?.formulaVersion ?? '—'}`], ['Spedito', `${nf(shipped, 1)} t a ${new Set(B.shipments.map(s => s.customerId)).size} clienti`], ['A magazzino', `${nf(Math.max(0, lot.tonnes - shipped), 1)} t`]]} />
      <div className="dsec"><div className="eyebrow">Analisi rispetto al dichiarato</div>
        {chk.items.length ? <div className="tw"><table className="t"><thead><tr><th>Parametro</th><th className="r">Analizzato</th><th className="r">Dichiarato</th><th className="r">Ammesso</th><th>Esito</th></tr></thead>
          <tbody>{chk.items.map(x => <tr key={x.id}><td>{x.label}</td><td className="r">{nf(x.value, 2)}</td><td className="r">{nf(x.declared, 1)}</td><td className="r">{x.min != null ? `${nf(x.min, 2)}–${nf(x.max, 2)}` : '—'}</td><td>{x.status === 'ok' ? <Chip kind="good">ok</Chip> : x.status === 'n/d' ? '—' : <Chip kind="crit">{x.status}</Chip>}</td></tr>)}</tbody></table></div>
          : <p className="small muted">Nessuna analisi: registra l’esito del laboratorio o del NIR.</p>}
        <div className="form" style={{ marginTop: 10 }}>{[...PARAMS, { id: 'UM', label: 'Umidità' }].map(p => <Field key={p.id} label={`${p.id} %`} hint={dec[p.id] != null ? `dichiarato ${nf(dec[p.id], 1)}` : ''}><NumInput value={an[p.id]} decimals={2} onChange={v => setAn(x => ({ ...x, [p.id]: v }))} slim /></Field>)}</div>
        <Btn small icon={LuPlus} onClick={addAn}>Registra analisi</Btn>
      </div>
      <div className="dsec"><div className="eyebrow">Materie prime usate (a monte)</div>
        <div className="tw"><table className="t"><thead><tr><th>Lotto</th><th>Materia prima</th><th className="r">kg</th><th className="r">AFB1</th></tr></thead>
          <tbody>{B.inputs.map((x, i) => <tr key={i} className="click" onClick={() => openDrawer('ingLot', x.l)}><td><span className="code">{x.ingLot?.code}</span></td><td>{I.ing[x.ingLot?.ingId]?.name}</td><td className="r">{nf(x.kg)}</td><td className="r">{nf(x.ingLot?.analyses?.AFB1, 1)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="dsec"><div className="eyebrow">Consegne (a valle)</div>
        {B.shipments.length ? B.shipments.map(s => <button key={s.id} className="dlink" onClick={() => openDrawer('customer', s.customerId)}><span>{I.cust[s.customerId]?.name}</span><span className="muted">{dateIt(s.date, 'dm')} · {nf(s.tonnes, 1)} t · {s.ddt}</span></button>) : <span className="small muted">Ancora nessuna consegna.</span>}
      </div>
    </Drawer>
  );
}

/* ---------- lotto di materia prima ---------- */
function IngLotD({ d, id }) {
  const I = idx(d); const l = I.ingLot[id];
  const [a, setA] = useState({ UM: l?.analyses?.UM ?? null, PG: l?.analyses?.PG ?? null, AFB1: l?.analyses?.AFB1 ?? null });
  if (!l) return <Missing />;
  const ing = I.ing[l.ingId];
  const used = traceIndex(d).usedIn.get(id) || [];
  const decide = accept => {
    if (accept && a.AFB1 != null && a.AFB1 > 20) { toast('Con aflatossina B1 oltre 20 µg/kg il lotto non è accettabile come materia prima', 'err'); return; }
    store.batch(acceptIngLotOps(d, l, { analyses: a, accept }), `Lotto ${l.code} di ${ing?.name.toLowerCase()}: ${accept ? 'accettato' : 'respinto'}`);
    toast(accept ? 'Lotto accettato: ora è scorta utilizzabile' : 'Lotto respinto', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <Drawer title={`Lotto ${l.code}`} sub={`${ing?.name} · arrivo ${dateIt(l.date)}`} icon={<span className="dicon"><LuWheat /></span>} wide
      actions={<><Btn icon={LuShieldAlert} onClick={() => nav('qualita', 'richiamo', id)}>Dove è finito?</Btn>{l.status === 'in attesa' && <><Btn kind="danger" icon={LuX} onClick={() => decide(false)}>Respingi</Btn><Btn kind="primary" icon={LuCheck} onClick={() => decide(true)}>Accetta</Btn></>}</>}>
      <div className="row gap-s"><Chip kind={l.status === 'accettato' ? 'good' : l.status === 'bloccato' ? 'crit' : 'warn'}>{l.status === 'bloccato' ? 'respinto' : l.status}</Chip>{l.analyses?.AFB1 != null && <Chip kind={l.analyses.AFB1 > 20 ? 'crit' : l.analyses.AFB1 >= 10 ? 'warn' : 'good'}>AFB1 {nf(l.analyses.AFB1, 1)} µg/kg</Chip>}</div>
      <Kv items={[['Fornitore', l.supplier], ['Documento di trasporto', l.ddt || '—'], ['Quantità', `${nf(l.tonnes, 2)} t · residuo ${nf(l.remaining, 2)} t`], ['Prezzo', `${nf(l.price, 1)} €/t`], l.note ? ['Nota', l.note] : null]} />
      <div className="dsec"><div className="eyebrow">Analisi di accettazione</div>
        <div className="form">
          <Field label="Umidità %"><NumInput value={a.UM} decimals={1} onChange={v => setA(x => ({ ...x, UM: v }))} slim /></Field>
          <Field label="Proteina %" hint={ing?.nutr?.PG ? `atteso ${nf(ing.nutr.PG, 1)}` : ''}><NumInput value={a.PG} decimals={1} onChange={v => setA(x => ({ ...x, PG: v }))} slim /></Field>
          <Field label="AFB1 µg/kg" hint="limite materie prime 20"><NumInput value={a.AFB1} decimals={1} onChange={v => setA(x => ({ ...x, AFB1: v }))} slim /></Field>
        </div>
        {l.status !== 'in attesa' && <Btn small onClick={() => store.update('ingLots', id, { analyses: { ...l.analyses, ...a } }, `Analisi aggiornate: lotto ${l.code}`)}>Aggiorna analisi</Btn>}
      </div>
      <div className="dsec"><div className="eyebrow">Usato in {used.length} lotti di prodotto</div>
        {used.slice(0, 30).map(u => { const pl = I.lot[u.lot]; return <button key={u.lot} className="dlink" onClick={() => openDrawer('lot', u.lot)}><span className="code">{pl?.code}</span><span className="muted">{I.prod[pl?.productId]?.name} · {nf(u.kg)} kg</span>{pl && lotChip(pl.status)}</button>; })}
        {!used.length && <span className="small muted">Non ancora utilizzato.</span>}
      </div>
    </Drawer>
  );
}
