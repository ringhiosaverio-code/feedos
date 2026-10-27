/* FeedOS 18 · ESG › Clima e GHG: registri della scheda (combustibili, flotta e consegne, F-gas, fattori di emissione).
 * Ogni scrittura passa da store.batch con un'etichetta italiana (un'azione = un passo annullabile). Prefisso CSS ecl-. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuUpload, LuDownload, LuRotateCcw, LuPencil, LuX, LuSave } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, monthLabel, addMonths, norm } from '../core/util.js';
import { readFile, parseCSV } from '../core/io.js';
import { autoMap, preview, toOps } from '../core/importers.js';
import { applyPackOps } from '../engine/esg-packs.js';
import { fuelSpec, toNatural, fgasDue, ets2Exposure, factorRegistry, overrideOps, resetOps, climaPackInfo, gridFactorInUse, newerGridFactor, plantLocation, customerDistances,
  deliveryModeOf, FUEL_LABEL, USE_LABEL, GRID_CHOICE_LABEL, PACK_CLIMA, CLIMA_FACTOR_GROUPS } from '../engine/esg-clima.js';
import { CLIMA_FUELS, CLIMA_FUEL_USES, CLIMA_FUEL_UNITS, CLIMA_FUEL_SOURCES, CLIMA_DELIVERY_MODES } from '../data/fields-clima.js';
import { Panel, Kpi, Table, Btn, Chip, Field, NumInput, Select, Seg, Empty, Kv, SearchBox, filterRows, confirm } from '../ui/ui.jsx';
import { Columns, Legend, SERIES } from '../ui/charts.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { StatusChip, setEsgSettings, Disclaimer } from './esg-shared.jsx';
import { tco2, pctTxt, numTxt, authorNow, downloadCsv, downloadText, FgasStatus } from './esg-clima-ui.jsx';

const EMPTY = [];
const opt = xs => xs.map(x => ({ id: x, label: x }));
const FUEL_OPT = CLIMA_FUELS.map(f => ({ id: f, label: FUEL_LABEL[f] }));
const USE_OPT = CLIMA_FUEL_USES.map(u => ({ id: u, label: USE_LABEL[u] }));
const MODE_LABEL = { 'flotta-propria': 'Flotta propria', vettore: 'Vettore pagato dall’azienda', 'ritiro-cliente': 'Ritiro del cliente' };
const MODE_SCOPE = { 'flotta-propria': 'Scope 1 (gasolio della flotta)', vettore: 'Scope 3, categoria 4', 'ritiro-cliente': 'Scope 3, categoria 9' };
const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });

/* ================= combustibili ================= */
/** Emissioni di un consumo: {qty naturale, t CO₂e, biogenica} o null se l'unità non è convertibile. */
function rowT(d, r) {
  const sp = fuelSpec(d, r.fuel);
  const q = sp ? toNatural(sp, r.qty, r.unit) : null;
  if (q == null) return null;
  return { q, unit: sp.unit, t: q * ((sp.co2?.value || 0) + (sp.nonco2?.value || 0)) / 1000, bio: q * (sp.bio?.value || 0) / 1000 };
}
export function Combustibili({ d, P, inv }) {
  const today = appToday(d);
  const last = addMonths(today.slice(0, 7), -1);
  const vehicles = d.vehicles || EMPTY;
  const [f, setF] = useState(() => ({ month: last, fuel: 'gasolio', use: 'flotta', qty: null, unit: 'l', vehicleId: '', source: 'fattura', docRef: '', note: '' }));
  const [imp, setImp] = useState(null);
  const set = p => setF(x => ({ ...x, ...p }));
  const W = inv.window, inW = new Set(W.months);
  const rows = useMemo(() => (d.fuelUse || EMPTY).filter(r => inW.has(String(r.month).slice(0, 7))).map(r => ({ ...r, calc: rowT(d, r) })).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : String(a.fuel).localeCompare(String(b.fuel)))), [d.fuelUse, d.factorOverrides, d.settings, W.from]);
  const vCode = id => vehicles.find(v => v.id === id)?.code || '';
  const pv = rowT(d, { fuel: f.fuel, qty: f.qty, unit: f.unit });
  const submit = () => {
    if (!/^\d{4}-\d{2}$/.test(f.month || '') || f.month > today.slice(0, 7)) return toast('Indica un mese valido, non nel futuro', 'err');
    if (!(f.qty > 0)) return toast('Indica la quantità consumata', 'err');
    if (!pv) return toast(`${f.unit} non è un’unità valida per ${FUEL_LABEL[f.fuel]}`, 'err');
    const obj = { month: f.month, fuel: f.fuel, use: f.use, qty: f.qty, unit: f.unit, vehicleId: f.vehicleId || null, source: f.source, docRef: f.docRef.trim(), note: f.note.trim(), at: today };
    store.batch([{ kind: 'add', coll: 'fuelUse', obj }], `Clima · consumo registrato: ${nf(f.qty)} ${f.unit} di ${FUEL_LABEL[f.fuel].toLowerCase()} (${monthLabel(f.month, false)})`);
    undoToast(`Consumo registrato: ${tco2(pv.t)} t CO₂e`);
    set({ qty: null, docRef: '', note: '' });
  };
  const remove = r => { store.remove('fuelUse', r.id, `Clima · consumo eliminato: ${r.fuel} ${r.month}`); undoToast('Consumo eliminato'); };
  const onFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { header, rows: rs } = parseCSV(await readFile(file));
      const map = autoMap(header, 'combustibili');
      setImp({ name: file.name, pv: preview(d, 'combustibili', rs, map), map });
    } catch { toast('File non leggibile: serve un CSV con intestazioni', 'err'); }
  };
  const applyImport = () => {
    const ops = toOps(imp.pv);
    if (!ops.length) { setImp(null); return toast('Nessuna riga nuova o modificata', 'err'); }
    store.batch(ops, `Clima · importati i consumi di combustibili da ${imp.name}`);
    undoToast(`${imp.pv.counts.new} righe nuove, ${imp.pv.counts.changed} aggiornate`);
    setImp(null);
  };
  // emissioni mese per mese, per combustibile (GPL del registro dell'energia compreso)
  const fuels = [...new Set([...rows.map(r => r.fuel), ...(inv.scope1.lines.some(l => l.fuel === 'gpl') ? ['gpl'] : [])])];
  const byM = Object.fromEntries(W.months.map(m => [m, {}]));
  const gplM = new Set(rows.filter(r => r.fuel === 'gpl').map(r => r.month));
  const gpl = fuelSpec(d, 'gpl');
  for (const e of d.energy || EMPTY) if (byM[e.month] && !gplM.has(e.month) && e.gplKg > 0) byM[e.month].gpl = (byM[e.month].gpl || 0) + e.gplKg * ((gpl.co2?.value || 0) + (gpl.nonco2?.value || 0)) / 1000;
  for (const r of rows) if (r.calc && byM[r.month]) byM[r.month][r.fuel] = (byM[r.month][r.fuel] || 0) + r.calc.t;
  const color = fu => SERIES[CLIMA_FUELS.indexOf(fu) % SERIES.length];
  const e2 = ets2Exposure(d, P);
  const lit = rows.filter(r => r.fuel === 'gasolio' && r.calc).reduce((s, r) => s + r.calc.q, 0);
  return (
    <>
      <div className="kpis">
        <Kpi label="Combustione stazionaria" value={tco2(inv.scope1.stationary)} unit="t CO₂e" foot="vapore, riscaldamento, gruppo elettrogeno" />
        <Kpi label="Combustione mobile" value={tco2(inv.scope1.mobile)} unit="t CO₂e" foot="flotta di consegna e carrelli" />
        <Kpi label="Gasolio registrato" value={nf(lit)} unit="litri" foot={`${rows.length} righe nel periodo`} />
        <Kpi label="CO₂ soggetta all’ETS2" value={tco2(e2.annualTCO2)} unit="t/anno" foot={`dal ${e2.start}: ${nf(e2.rows[1]?.cost ?? 0)} € a ${e2.rows[1]?.price ?? 60} €/t`} />
      </div>
      {inv.scope1.fromSurvey && <div className="note maize">Nessun consumo registrato nel periodo: lo Scope 1 usa il gasolio e il gas dichiarati nel questionario, ripartiti sui mesi (qualità «stimato»).</div>}
      <div className="split r">
        <Panel title="Registra un consumo" sub="Una riga per documento: fattura, lettura del contatore o estratto della carta carburante" id="ecl-fuel-form">
          <div className="stack ecl-gap">
            <div className="form">
              <Field label="Mese"><input className="input" type="month" value={f.month} max={today.slice(0, 7)} onChange={e => set({ month: e.target.value })} /></Field>
              <Field label="Combustibile"><Select value={f.fuel} onChange={v => set({ fuel: v, unit: fuelSpec(d, v)?.unit || f.unit })} options={FUEL_OPT} ariaLabel="Combustibile" /></Field>
              <Field label="Uso"><Select value={f.use} onChange={v => set({ use: v })} options={USE_OPT} ariaLabel="Uso" /></Field>
              <Field label="Quantità"><NumInput value={f.qty} min={0} decimals={1} onChange={v => set({ qty: v })} ariaLabel="Quantità" /></Field>
              <Field label="Unità"><Select value={f.unit} onChange={v => set({ unit: v })} options={opt(CLIMA_FUEL_UNITS)} ariaLabel="Unità" /></Field>
              {(f.use === 'flotta' || f.use === 'carrelli') && <Field label="Mezzo"><Select value={f.vehicleId} onChange={v => set({ vehicleId: v })} options={[{ id: '', label: '—' }, ...vehicles.map(v => ({ id: v.id, label: `${v.code} · ${v.kind}` }))]} ariaLabel="Mezzo" /></Field>}
              <Field label="Fonte del dato"><Select value={f.source} onChange={v => set({ source: v })} options={opt(CLIMA_FUEL_SOURCES)} ariaLabel="Fonte del dato" /></Field>
              <Field label="Documento"><input className="input" value={f.docRef} maxLength={80} onChange={e => set({ docRef: e.target.value })} placeholder="Es. fattura 1234/26" /></Field>
            </div>
            <div className="row between">
              <span className="small muted">{pv ? `${nf(pv.q, 1)} ${pv.unit} → ${tco2(pv.t)} t CO₂e${pv.bio ? ` (più ${tco2(pv.bio)} t di CO₂ biogenica fuori dagli scope)` : ''}` : f.qty > 0 ? 'Unità non convertibile per questo combustibile' : 'Il calcolo usa i fattori del registro, con fonte e anno'}</span>
              <Btn kind="primary" icon={LuPlus} onClick={submit}>Registra</Btn>
            </div>
            <div className="ecl-import">
              <label className="btn small"><LuUpload aria-hidden="true" />Importa da CSV<input type="file" accept=".csv,text/csv" className="sr" onChange={onFile} /></label>
              <span className="xs muted">Colonne: mese, combustibile, uso, quantità, unità, documento. Il GPL qui sostituisce quello del registro dell’energia nello stesso mese.</span>
            </div>
            {imp && <div className="note">
              <b>{imp.name}</b>: {imp.pv.counts.new} nuove, {imp.pv.counts.changed} modificate, {imp.pv.counts.same} invariate, {imp.pv.counts.error} con errori.
              {imp.pv.rows.filter(r => r.status === 'error').slice(0, 3).map(r => <div key={r.i} className="xs">Riga {r.i + 2}: {r.errors.map(e => e.msg).join('; ')}</div>)}
              <div className="row ecl-mt"><Btn small kind="primary" onClick={applyImport} disabled={!imp.pv.counts.new && !imp.pv.counts.changed}>Importa</Btn><Btn small kind="ghost" icon={LuX} onClick={() => setImp(null)}>Annulla</Btn></div>
            </div>}
          </div>
        </Panel>
        <Panel title="Mese per mese" sub="t CO₂e da combustione per combustibile (GPL dal registro dell’energia)">
          {W.months.length ? <>
            <Columns cols={W.months.map(m => ({ label: monthLabel(m), parts: fuels.map(fu => ({ key: fu, value: byM[m][fu] || 0 })) }))} keys={fuels.map(fu => ({ key: fu, label: FUEL_LABEL[fu], color: color(fu) }))} unit="t CO₂e" decimals={1} height={210} ariaLabel="Emissioni da combustione per mese" />
            <Legend items={fuels.map(fu => ({ label: FUEL_LABEL[fu], color: color(fu) }))} />
          </> : <Empty title="Nessun mese chiuso nel periodo" />}
        </Panel>
      </div>
      <Panel title="Registro dei consumi" sub={`${P.label} · si annulla con Ctrl Z`} flush>
        <Table rows={rows} pageSize={24} exportName="clima-combustibili" initialSort={{ key: 'month', dir: 'desc' }} cols={[
          { key: 'month', label: 'Mese', render: r => <b>{monthLabel(r.month, false)}</b> },
          { key: 'fuel', label: 'Combustibile', csv: r => FUEL_LABEL[r.fuel] || r.fuel, render: r => FUEL_LABEL[r.fuel] || r.fuel },
          { key: 'use', label: 'Uso', csv: r => USE_LABEL[r.use] || r.use, render: r => <span className="small">{USE_LABEL[r.use] || r.use}{r.vehicleId ? ` · ${vCode(r.vehicleId)}` : ''}</span> },
          { key: 'qty', label: 'Quantità', align: 'r', render: r => `${nf(r.qty)} ${r.unit || ''}` },
          { key: 'unit', label: 'Unità', csvOnly: true },
          { key: 't', label: 't CO₂e', align: 'r', sort: r => r.calc?.t ?? null, csv: r => r.calc?.t ?? null, render: r => (r.calc ? <b>{tco2(r.calc.t)}</b> : <Chip kind="warn">unità?</Chip>) },
          { key: 'source', label: 'Fonte', render: r => <span className="small">{r.source}</span> },
          { key: 'docRef', label: 'Documento', render: r => <span className="small muted ecl-wrap">{r.docRef}</span> },
          { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: r => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il consumo" onClick={() => remove(r)} /> },
        ]} empty="Nessun consumo registrato nel periodo" />
      </Panel>
      <Panel title={`Esposizione all’ETS2 dal ${e2.start}`} sub="Costo della CO₂ fossile di gas, GPL, gasolio e benzina, trasferito dai fornitori di combustibile">
        <Table rows={[...e2.rows.map(r => ({ ...r, id: 'p' + r.price, label: `${nf(r.price)} €/t` })), ...(e2.internal ? [{ ...e2.internal, id: 'int', label: `${nf(e2.internal.price)} €/t (prezzo interno)` }] : [])]} cols={[
          { key: 'label', label: 'Prezzo della CO₂', nosort: true },
          { key: 'cost', label: '€ all’anno', align: 'r', nosort: true, render: r => <b>{nf(r.cost)}</b> },
          { key: 'perT', label: '€ per t prodotta', align: 'r', nosort: true, render: r => nf(r.perT, 2) },
        ]} />
        <p className="small muted ecl-mt">{nf(e2.annualTCO2, 1)} t di CO₂ fossile all’anno ({Object.entries(e2.byFuel).map(([k, v]) => `${FUEL_LABEL[k]} ${nf(v, 1)} t`).join(', ') || 'nessun combustibile fossile'}). {e2.note}</p>
      </Panel>
    </>
  );
}

/* ================= flotta e consegne ================= */
export function Flotta({ d, P, inv }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const vehicles = d.vehicles || EMPTY;
  const inW = new Set(inv.window.months);
  const lit = {};
  for (const r of d.fuelUse || EMPTY) if (r.vehicleId && inW.has(String(r.month).slice(0, 7))) { const c = rowT(d, r); if (c) { const x = lit[r.vehicleId] || (lit[r.vehicleId] = { q: 0, t: 0 }); x.q += c.q; x.t += c.t; } }
  const lg = inv.s3.logistics, bm = lg.byMode;
  const totT = Object.values(bm).reduce((s, x) => s + x.t, 0);
  const fleetL = (d.fuelUse || EMPTY).filter(r => r.use === 'flotta' && inW.has(String(r.month).slice(0, 7))).reduce((s, r) => s + (rowT(d, r)?.q || 0), 0);
  const dist = customerDistances(d);
  const tByC = {};
  for (const s of d.shipments || EMPTY) if (s.date >= inv.window.from && s.date <= inv.window.to) tByC[s.customerId] = (tByC[s.customerId] || 0) + (+s.tonnes || 0);
  const custRows = filterRows((d.customers || EMPTY).map(c => ({ id: c.id, name: c.name, city: c.city || '', km: dist.byCustomer.get(c.id)?.km ?? null, est: dist.byCustomer.get(c.id)?.estimated, t: tByC[c.id] || 0, mode: deliveryModeOf(d, c.id) })), q, ['name', 'city', 'mode']);
  const setMode = (c, mode) => {
    const ex = (d.customerLogistics || EMPTY).some(x => x.id === c.id);
    store.batch([ex ? { kind: 'update', coll: 'customerLogistics', id: c.id, patch: { mode } } : { kind: 'add', coll: 'customerLogistics', obj: { id: c.id, mode } }], `Clima · consegna a ${c.name}: ${MODE_LABEL[mode].toLowerCase()}`);
  };
  const removeV = v => confirm('Eliminare il mezzo?', <p>{v.code} ({v.kind}) esce dal registro; i consumi già registrati restano.</p>, () => { store.remove('vehicles', v.id, `Clima · mezzo eliminato: ${v.code}`); undoToast('Mezzo eliminato'); }, { ok: 'Elimina', danger: true });
  const plant = plantLocation(d);
  return (
    <>
      <div className="kpis">
        {CLIMA_DELIVERY_MODES.map(m => <Kpi key={m} label={MODE_LABEL[m]} value={pctTxt(totT ? bm[m].t / totT : null)} foot={`${nf(bm[m].t)} t consegnate · ${MODE_SCOPE[m]}`} />)}
        <Kpi label="Gasolio per t consegnata" value={bm['flotta-propria'].t > 0 && fleetL > 0 ? nf(fleetL / bm['flotta-propria'].t, 2) : '—'} unit="l/t" foot="flotta propria, nel periodo" />
      </div>
      <div className="split">
        <Panel title="Mezzi" sub="Flotta di consegna e carrelli: il gasolio registrato per mezzo entra nello Scope 1" flush
          actions={<Btn small icon={adding ? LuX : LuPlus} onClick={() => setAdding(x => !x)}>{adding ? 'Chiudi' : 'Nuovo mezzo'}</Btn>}>
          {adding && <div className="ecl-pad"><EntityForm coll="vehicles" d={d} rec={{ kind: 'autoarticolato', fuel: 'gasolio', owned: true }} saveLabel="Aggiungi il mezzo"
            onSave={v => { store.batch([{ kind: 'add', coll: 'vehicles', obj: { ...v, owned: v.owned !== false } }], `Clima · nuovo mezzo: ${v.code}`); setAdding(false); undoToast('Mezzo aggiunto'); }} onCancel={() => setAdding(false)} /></div>}
          <Table rows={vehicles} exportName="clima-mezzi" cols={[
            { key: 'code', label: 'Mezzo', render: v => <b>{v.code}</b> },
            { key: 'kind', label: 'Tipo' },
            { key: 'euro', label: 'Classe', render: v => <span className="small">{v.fuel} · {v.euro || '—'}</span> },
            { key: 'q', label: 'Litri nel periodo', align: 'r', sort: v => lit[v.id]?.q ?? 0, csv: v => lit[v.id]?.q ?? 0, render: v => nf(lit[v.id]?.q ?? 0) },
            { key: 't', label: 't CO₂e', align: 'r', sort: v => lit[v.id]?.t ?? 0, csv: v => lit[v.id]?.t ?? 0, render: v => tco2(lit[v.id]?.t ?? 0) },
            { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: v => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il mezzo" onClick={() => removeV(v)} /> },
          ]} empty="Nessun mezzo registrato" />
        </Panel>
        <Panel title="Distanze verso i clienti" sub="Linea d’aria dallo stabilimento × fattore stradale">
          {plant ? <Kv items={[['Stabilimento', `${nf(plant.lat, 4)}, ${nf(plant.lon, 4)}`], ['Fonte delle coordinate', plant.source], ['Fattore stradale', nf(dist.roadFactor, 2)], ['Distanza media', `${nf(dist.avgKm, 0)} km`], ['Clienti con coordinate', `${dist.known} di ${(d.customers || EMPTY).length}`]]} />
            : <Empty title="Mancano le coordinate dello stabilimento">Inseriscile nell’anagrafica dell’azienda (Dati › Impostazioni): servono per le categorie 4 e 9 dello Scope 3.</Empty>}
          <p className="small muted ecl-mt">I trasporti con un vettore pagato dall’azienda vanno nella categoria 4, i ritiri con mezzi del cliente nella categoria 9, le consegne con la flotta propria sono già nello Scope 1 (gasolio).</p>
        </Panel>
      </div>
      <Panel title="Modalità di consegna per cliente" sub="Cambia la riga per spostare le tonnellate tra Scope 1, categoria 4 e categoria 9" flush actions={<SearchBox value={q} onChange={setQ} placeholder="Cerca cliente" id="ecl-cust-q" />}>
        <Table rows={custRows} pageSize={15} exportName="clima-consegne" initialSort={{ key: 't', dir: 'desc' }} cols={[
          { key: 'name', label: 'Cliente', render: c => <><b>{c.name}</b><span className="sub">{c.city}</span></> },
          { key: 'km', label: 'km stradali', align: 'r', render: c => (c.km == null ? '—' : `${nf(c.km)}${c.est ? ' (stima)' : ''}`) },
          { key: 't', label: 't nel periodo', align: 'r', render: c => nf(c.t) },
          { key: 'mode', label: 'Consegna', csv: c => MODE_LABEL[c.mode], render: c => <Select className="slim" value={c.mode} onChange={m => setMode(c, m)} options={CLIMA_DELIVERY_MODES.map(m => ({ id: m, label: MODE_LABEL[m] }))} ariaLabel={`Consegna a ${c.name}`} /> },
        ]} empty="Nessun cliente" />
      </Panel>
    </>
  );
}

/* ================= F-gas ================= */
export function Fgas({ d, P, inv }) {
  const today = appToday(d);
  const [form, setForm] = useState(null); // 'eq' | 'ev'
  const due = fgasDue(d, today);
  const eqs = d.fgasEquipment || EMPTY;
  const evs = [...(d.fgasEvents || EMPTY)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const eqName = id => eqs.find(e => e.id === id)?.name || id;
  const next = due.find(x => x.due && !x.exempt);
  const pack = climaPackInfo(d);
  const removeEq = e => confirm('Eliminare l’apparecchiatura?', <p>«{e.name}» e i suoi interventi restano nel registro delle modifiche e si possono ripristinare con Annulla.</p>, () => {
    store.batch([{ kind: 'remove', coll: 'fgasEquipment', id: e.id }, ...(d.fgasEvents || EMPTY).filter(x => x.equipmentId === e.id).map(x => ({ kind: 'remove', coll: 'fgasEvents', id: x.id }))], `Clima · apparecchiatura F-gas eliminata: ${e.name}`);
    undoToast('Apparecchiatura eliminata');
  }, { ok: 'Elimina', danger: true });
  const removeEv = x => { store.remove('fgasEvents', x.id, `Clima · intervento F-gas eliminato del ${dateIt(x.date)}`); undoToast('Intervento eliminato'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Apparecchiature con F-gas" value={nf(eqs.length)} foot={`${due.filter(x => x.exempt).length} esenti dai controlli`} />
        <Kpi label="Carica totale" value={tco2(due.reduce((s, x) => s + (x.chargeT || 0), 0))} unit="t CO₂e" foot="kg × GWP AR6" />
        <Kpi label="Perdite nel periodo" value={tco2(inv.scope1.fugitive)} unit="t CO₂e" foot="ricariche × GWP (Scope 1)" />
        <Kpi label="Prossimo controllo" value={next ? dateIt(next.due) : '—'} foot={next ? `${next.name} · ${next.daysLeft < 0 ? `scaduto da ${-next.daysLeft} giorni` : `tra ${next.daysLeft} giorni`}` : 'nessun controllo dovuto'} status={next ? (next.status === 'scaduto' ? 'bad' : next.status === 'in scadenza' ? 'warn' : 'ok') : undefined} />
      </div>
      <Panel title="Controlli delle perdite" sub="Frequenza dalla carica in t CO₂e: 12 mesi da 5 t, 6 da 50 t, 3 da 500 t; doppia con il rilevatore di perdite; verifica entro un mese dopo una ricarica" flush id="ecl-fgas-due">
        <Table rows={due} rowKey={x => x.equipmentId} exportName="clima-fgas-scadenze" cols={[
          { key: 'name', label: 'Apparecchiatura', render: x => <><b>{x.name}</b><span className="sub">{x.location}</span></> },
          { key: 'gas', label: 'Gas', render: x => <span className="code">{x.gas}</span> },
          { key: 'chargeKg', label: 'kg', align: 'r', render: x => nf(x.chargeKg, 1) },
          { key: 'chargeT', label: 't CO₂e', align: 'r', render: x => tco2(x.chargeT) },
          { key: 'months', label: 'Frequenza', render: x => <span className="small ecl-wrap">{x.months ? `ogni ${x.months} mesi` : x.reason}</span> },
          { key: 'lastCheck', label: 'Ultimo controllo', render: x => (x.lastCheck ? dateIt(x.lastCheck) : '—') },
          { key: 'due', label: 'Scadenza', render: x => (x.due ? <b>{dateIt(x.due)}</b> : '—') },
          { key: 'status', label: 'Stato', render: x => <FgasStatus s={x.status} /> },
        ]} empty="Nessuna apparecchiatura registrata" />
      </Panel>
      <div className="split">
        <Panel title="Apparecchiature" flush actions={<Btn small icon={form === 'eq' ? LuX : LuPlus} onClick={() => setForm(x => (x === 'eq' ? null : 'eq'))}>{form === 'eq' ? 'Chiudi' : 'Nuova'}</Btn>}>
          {form === 'eq' && <div className="ecl-pad"><EntityForm coll="fgasEquipment" d={d} rec={{ gas: 'R-410A', hermetic: false, leakDetection: false }} saveLabel="Aggiungi"
            onSave={v => { store.batch([{ kind: 'add', coll: 'fgasEquipment', obj: { ...v, hermetic: v.hermetic === true, leakDetection: v.leakDetection === true } }], `Clima · nuova apparecchiatura F-gas: ${v.name}`); setForm(null); undoToast('Apparecchiatura aggiunta'); }} onCancel={() => setForm(null)} /></div>}
          <Table rows={eqs} exportName="clima-fgas-apparecchiature" cols={[
            { key: 'name', label: 'Nome', render: e => <><b>{e.name}</b><span className="sub">{e.location}</span></> },
            { key: 'gas', label: 'Gas', render: e => <span className="code">{e.gas}</span> },
            { key: 'chargeKg', label: 'kg', align: 'r', render: e => nf(e.chargeKg, 1) },
            { key: 'flags', label: 'Caratteristiche', csv: e => [e.hermetic ? 'ermetica' : '', e.leakDetection ? 'rilevatore' : ''].filter(Boolean).join(', '), render: e => <span className="small">{[e.hermetic && 'ermetica', e.leakDetection && 'rilevatore'].filter(Boolean).join(', ') || '—'}</span> },
            { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: e => <Btn small kind="ghost" icon={LuTrash2} title="Elimina l’apparecchiatura" onClick={() => removeEq(e)} /> },
          ]} empty="Nessuna apparecchiatura" />
        </Panel>
        <Panel title="Interventi" sub="Controlli, ricariche, recuperi: le ricariche sono le perdite dello Scope 1" flush actions={<Btn small icon={form === 'ev' ? LuX : LuPlus} onClick={() => setForm(x => (x === 'ev' ? null : 'ev'))} disabled={!eqs.length}>{form === 'ev' ? 'Chiudi' : 'Nuovo intervento'}</Btn>}>
          {form === 'ev' && <div className="ecl-pad"><EntityForm coll="fgasEvents" d={d} rec={{ equipmentId: eqs[0]?.id, date: today, type: 'controllo', sentToFgasDb: false }} saveLabel="Registra"
            onSave={v => { store.batch([{ kind: 'add', coll: 'fgasEvents', obj: { ...v, sentToFgasDb: v.sentToFgasDb === true } }], `Clima · intervento F-gas: ${v.type} su ${eqName(v.equipmentId)}`); setForm(null); undoToast('Intervento registrato'); }} onCancel={() => setForm(null)} /></div>}
          <Table rows={evs} pageSize={12} exportName="clima-fgas-interventi" cols={[
            { key: 'date', label: 'Data', render: x => dateIt(x.date) },
            { key: 'equipmentId', label: 'Apparecchiatura', csv: x => eqName(x.equipmentId), render: x => <span className="small">{eqName(x.equipmentId)}</span> },
            { key: 'type', label: 'Intervento', render: x => (x.type === 'ricarica' ? <Chip kind="warn">ricarica {nf(x.kg, 1)} kg</Chip> : x.type) },
            { key: 'sentToFgasDb', label: 'Banca Dati FGAS', csv: x => (x.sentToFgasDb ? 'comunicato' : 'da comunicare'), render: x => (x.sentToFgasDb ? <Chip kind="good">comunicato</Chip> : <Chip kind="warn">da comunicare</Chip>) },
            { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: x => <Btn small kind="ghost" icon={LuTrash2} title="Elimina l’intervento" onClick={() => removeEv(x)} /> },
          ]} empty="Nessun intervento registrato" />
        </Panel>
      </div>
      <p className="small muted">Regolamento (UE) 2024/573 sui gas fluorurati (fonte: testo del regolamento; valido al {dateIt(pack.validAsOf)}). Comunicazione degli interventi alla Banca Dati FGAS entro 30 giorni (DPR 146/2018) <StatusChip status="da verificare" /> in attesa del nuovo decreto attuativo.</p>
    </>
  );
}

/* ================= fattori di emissione ================= */
const GROUP_LABEL = Object.fromEntries(CLIMA_FACTOR_GROUPS);
export function Fattori({ d, P, inv }) {
  const today = appToday(d);
  const [grp, setGrp] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const pack = climaPackInfo(d, today);
  const reg = useMemo(() => factorRegistry(d, { used: inv.usedFactors, today }), [d.factorOverrides, d.settings, inv]);
  const grid = gridFactorInUse(d, P), newer = newerGridFactor(d, grid);
  const choice = d.settings?.esg18?.clima?.gridFactor || 'energia';
  const rows = filterRows(reg.filter(r => !grp || (grp === 'uso' ? r.inUse : r.group === grp)), q, ['label', 'id', 'source']);
  const startEdit = r => setEdit({ id: r.id, label: r.label, value: r.value, unit: r.unit, source: r.overridden ? r.source : '', year: r.overridden ? r.year : Number(today.slice(0, 4)), reason: r.overridden ? r.reason : '' });
  const save = () => {
    const ops = overrideOps(d, edit.id, edit, { by: authorNow(), at: today });
    if (!ops.length) return toast('Servono valore, fonte e motivo della sostituzione', 'err');
    store.batch(ops, `Clima · fattore sostituito: ${edit.label} = ${edit.value} ${edit.unit} (${edit.reason})`);
    undoToast('Fattore sostituito: l’inventario usa il nuovo valore'); setEdit(null);
  };
  const reset = r => confirm('Tornare al valore del pacchetto?', <p>«{r.label}» torna a {numTxt(r.packValue)} {r.unit} ({r.packSource}). La sostituzione resta nel registro delle modifiche.</p>, () => {
    store.batch(resetOps(d, r.id), `Clima · fattore ripristinato: ${r.label}`); undoToast('Valore del pacchetto ripristinato');
  }, { ok: 'Ripristina' });
  const onPack = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = applyPackOps(d, await readFile(file), PACK_CLIMA);
    if (!res.ok) return toast(res.errors[0] || 'Pacchetto non valido', 'err');
    if (res.pack.pack !== 'clima') return toast('Il file non è un pacchetto «clima»', 'err');
    confirm(`Importare il pacchetto clima ${res.pack.version}?`, <div className="stack ecl-gap-s"><p>Valido al {dateIt(res.pack.validAsOf)} · {res.pack.items.length} voci.</p><p>Rispetto al pacchetto in uso: {res.diff.added.length} nuove, {res.diff.changed.length} modificate, {res.diff.removed.length} tolte.</p>{res.diff.changed.length > 0 && <p className="small muted">Modificate: {res.diff.changed.slice(0, 12).join(', ')}{res.diff.changed.length > 12 ? '…' : ''}</p>}<p className="small">Le sostituzioni fatte a mano restano e continuano a valere.</p></div>,
      () => { store.batch(res.ops, `Clima · pacchetto dei fattori ${res.pack.version} importato`); undoToast(`Pacchetto ${res.pack.version} in uso`); }, { ok: 'Importa' });
  };
  const exportJson = () => downloadText('pacchetto-clima', 'json', JSON.stringify({ pack: 'clima', version: pack.version, validAsOf: pack.validAsOf, source: pack.source, items: reg.filter(r => !r.custom).map(r => ({ id: r.id, group: r.group, label: r.label, value: r.value, unit: r.unit, source: r.source, year: r.year, status: r.status, kind: r.kind })) }, null, 2), 'application/json');
  const gridOpts = [{ id: 'energia', label: `Come la scheda Energia${choice === 'energia' && grid ? ` (${grid.label}, ${numTxt(grid.value)})` : ''}` }, { id: 'auto', label: 'Il più recente per l’anno dell’esercizio' },
    ...reg.filter(r => r.group === 'elettricita' && r.id.startsWith('el.lb.it.') && r.value != null).map(r => ({ id: r.id, label: `${r.label} · ${numTxt(r.value)}` }))];
  return (
    <>
      <div className="split">
        <Panel title="Pacchetto dei fattori" sub="Fattori con fonte, anno e stato; un pacchetto più recente si importa da file JSON (si vedono le differenze prima)">
          <div className="stack ecl-gap">
            <Kv items={[['Versione in uso', <span>{pack.version} <Chip kind="outline">{pack.origin}</Chip></span>], ['Valido al', <span>{dateIt(pack.validAsOf)} {pack.stale && <StatusChip status="da verificare" />}</span>], ['Voci', nf(reg.length)], ['In uso nell’inventario', nf(reg.filter(r => r.inUse).length)], ['Sostituite a mano', nf(reg.filter(r => r.overridden && !r.custom).length)]]} />
            <div className="row">
              <label className="btn small"><LuUpload aria-hidden="true" />Importa pacchetto<input type="file" accept=".json,application/json" className="sr" onChange={onPack} /></label>
              <Btn small kind="ghost" icon={LuDownload} onClick={exportJson}>Esporta JSON</Btn>
            </div>
          </div>
        </Panel>
        <Panel title="Fattore di rete dell’inventario" sub="Scope 2 location-based e perdite di rete">
          <div className="stack ecl-gap">
            <Field label="Fattore usato"><Select value={choice} onChange={v => setEsgSettings('clima', { gridFactor: v }, `Clima · fattore di rete: ${v === 'energia' ? 'come la scheda Energia' : v === 'auto' ? 'per anno' : v}`)} options={gridOpts} ariaLabel="Fattore di rete" /></Field>
            {grid && <p className="small">In uso: <b>{numTxt(grid.value)} {grid.unit}</b> · {grid.source} ({grid.year ?? 'anno n.d.'}) · {GRID_CHOICE_LABEL[grid.choice]} <StatusChip status={grid.status} /></p>}
            {newer && <div className="note">È disponibile un fattore più recente: <b>{newer.label}</b>, {numTxt(newer.value)} {newer.unit} ({newer.source}). Con «come la scheda Energia» lo stesso numero vale in tutte le schede: cambialo lì o sceglilo qui.</div>}
          </div>
        </Panel>
      </div>
      {edit && <Panel title={`Sostituisci: ${edit.label}`} sub="La sostituzione vale per tutto l’archivio e resta tracciata (valore precedente, autore, data, motivo)" id="ecl-override">
        <div className="form">
          <Field label="Valore"><NumInput value={edit.value} decimals={4} onChange={v => setEdit(x => ({ ...x, value: v }))} ariaLabel="Valore del fattore" /></Field>
          <Field label="Unità"><input className="input" value={edit.unit} onChange={e => setEdit(x => ({ ...x, unit: e.target.value }))} /></Field>
          <Field label="Anno del fattore"><NumInput value={edit.year} decimals={0} min={1990} max={2100} onChange={v => setEdit(x => ({ ...x, year: v }))} ariaLabel="Anno del fattore" /></Field>
          <Field label="Fonte *"><input className="input" value={edit.source} maxLength={200} onChange={e => setEdit(x => ({ ...x, source: e.target.value }))} placeholder="Es. ISPRA, Rapporti 430/2026" /></Field>
          <Field label="Motivo *" className="ecl-span2"><input className="input" value={edit.reason} maxLength={300} onChange={e => setEdit(x => ({ ...x, reason: e.target.value }))} placeholder="Perché si sostituisce il valore del pacchetto" /></Field>
        </div>
        <div className="row ecl-mt"><Btn kind="primary" icon={LuSave} onClick={save}>Salva la sostituzione</Btn><Btn kind="ghost" icon={LuX} onClick={() => setEdit(null)}>Annulla</Btn></div>
      </Panel>}
      <Panel title="Registro dei fattori" sub="Precedenza: sostituzione con motivo > pacchetto importato > pacchetto integrato" flush
        actions={<><Select className="slim" value={grp} onChange={setGrp} options={[{ id: '', label: 'Tutti i gruppi' }, { id: 'uso', label: 'Solo quelli in uso' }, ...CLIMA_FACTOR_GROUPS.map(([id, l]) => ({ id, label: l }))]} ariaLabel="Gruppo di fattori" /><SearchBox value={q} onChange={setQ} placeholder="Cerca fattore" id="ecl-factor-q" /></>}>
        <Table rows={rows} pageSize={25} exportName="clima-fattori" cols={[
          { key: 'label', label: 'Fattore', render: r => <><b>{r.label}</b><span className="sub"><span className="code">{r.id}</span> · {GROUP_LABEL[r.group] || r.group}</span></> },
          { key: 'value', label: 'Valore', align: 'r', render: r => <b>{r.value == null ? '—' : numTxt(r.value)}</b> },
          { key: 'unit', label: 'Unità', render: r => <span className="small">{r.unit}</span> },
          { key: 'source', label: 'Fonte', render: r => <span className="small ecl-wrap">{r.source}{r.reason && r.overridden ? <span className="sub">Motivo: {r.reason}{r.by ? ` · ${r.by}` : ''}{r.at ? `, ${dateIt(r.at)}` : ''}</span> : null}</span> },
          { key: 'year', label: 'Anno', align: 'r', render: r => r.year ?? '—' },
          { key: 'status', label: 'Stato', csv: r => `${r.status}${r.overridden ? ' · sostituito' : ''}${r.inUse ? ' · in uso' : ''}`, render: r => <span className="ecl-chips"><StatusChip status={r.status} />{r.overridden && <Chip kind="accent">sostituito</Chip>}{r.inUse && <Chip kind="good">in uso</Chip>}{r.stale && <Chip kind="warn">oltre 3 anni</Chip>}</span> },
          { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: r => (r.custom ? <span className="xs muted">dalla scheda Energia</span> : <span className="row ecl-nowrap">
            <Btn small kind="ghost" icon={LuPencil} title="Sostituisci il valore" onClick={() => startEdit(r)} />
            {r.overridden && <Btn small kind="ghost" icon={LuRotateCcw} title="Torna al valore del pacchetto" onClick={() => reset(r)} />}</span>) },
        ]} empty="Nessun fattore" />
      </Panel>
      <Disclaimer />
    </>
  );
}
