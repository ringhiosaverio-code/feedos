/* FeedOS 17 · Economia: margini per prodotto al costo effettivo dei lotti o ai costi di oggi (avvisi sul prezzo netto
 * incassato), redditività netta per cliente/prodotto/agente, pareggio e leva operativa, simulatore «E se…» che propaga
 * uno scenario su formule, costi, margini e CO₂, previsioni della domanda verificate sul passato e confrontate con il piano. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuSave, LuTrash2, LuRotateCcw, LuSparkles, LuLeaf, LuX } from 'react-icons/lu';
import { useData, store, toast, useUi, uiStore, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, costs, volumes, contaminantFor, weekly, signals } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, mondayOf, mean } from '../core/util.js';
import { PM_LABEL, pm, nfPm, fmtPm, up, upDec, fmtUp, cellUp, colUp, upLabel, unitOf, SMALL_UNITS } from '../core/units.js';
import { runScenario, scenarioBase } from '../engine/scenario.js';
import { forecastAuto, MODEL_LABEL } from '../engine/forecast.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, Empty, Seg, Kv } from '../ui/ui.jsx';
import { Waterfall, Bars, LineChart, Legend, StackBar } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { Redditivita } from './redditivita.jsx';
import { Pareggio } from './pareggio.jsx';
import { productProfit } from '../engine/profitability.js';
import { ctxOf } from '../core/derived.js';
import { usePeriod } from '../ui/period.jsx';
import { NAV } from '../app/nav.js';

const CAT = [['cereale', 'Cereali'], ['proteico', 'Proteici'], ['coprodotto', 'Co-prodotti'], ['grasso', 'Grassi'], ['minerale', 'Minerali'], ['aminoacido', 'Aminoacidi'], ['premix', 'Premiscele']];

export function Economia({ route }) {
  const d = useData();
  const tab = route.tab || 'margini';
  return (
    <>
      <PageHead title="Economia" lead="Quanto rende ogni tonnellata: margine al costo effettivo dei lotti o ai costi di oggi sui prezzi realmente incassati, redditività netta di clienti, prodotti e agenti, punto di pareggio, simulatore «E se…» e previsioni della domanda verificate sul passato."
        tabs={NAV.economia.tabs} tab={tab} onTab={t => go('economia', t)} />
      {tab === 'margini' && <Margini d={d} sel={route.id} />}
      {tab === 'redditivita' && <Redditivita d={d} sel={route.id} />}
      {tab === 'pareggio' && <Pareggio d={d} />}
      {tab === 'scenari' && <Scenari d={d} />}
      {tab === 'previsioni' && <Previsioni d={d} sel={route.id} />}
    </>
  );
}

/* ---------------- margini ---------------- */
export function useProductEconomics(d) {
  const C = costs(d); const V = volumes(d); const today = appToday(d);
  return useMemo(() => {
    const from = addDays(today, -90);
    const rev = {}, t = {};
    for (const s of d.shipments) if (s.date > from) { rev[s.productId] = (rev[s.productId] || 0) + s.tonnes * s.price; t[s.productId] = (t[s.productId] || 0) + s.tonnes; }
    // avvisi sul prezzo NETTO incassato negli ultimi 90 giorni (listino quando non ci sono consegne); prodotti non attivi esclusi
    return d.products.filter(p => p.active !== false && C[p.id] && C[p.id].total != null).map(p => {
      const c = C[p.id]; const real = t[p.id] ? rev[p.id] / t[p.id] : (p.listPrice || c.price);
      const m = real - c.total;
      return { ...p, c, real, margin: m, marginPct: real ? m / real : null, vol: V[p.id] || 0, annual: m * (V[p.id] || 0), discount: p.listPrice ? 1 - real / p.listPrice : null, below: real < c.minPrice - 1e-9, listBelow: p.listPrice < c.minPrice - 1e-9 };
    });
  }, [C, V, d.products, d.shipments, today]);
}

function Margini({ d, sel }) {
  const [mode, setMode] = useState('effettivo');
  return (
    <>
      <div className="row between">
        <Seg options={[{ id: 'effettivo', label: 'Effettivo (costo dei lotti)' }, { id: 'oggi', label: 'A costi di oggi' }]} value={mode} onChange={setMode} label="Base di costo" />
        <span className="small muted">{mode === 'effettivo' ? 'Consegne del periodo al costo effettivo dei lotti di materie prime, energia misurata e provvigioni' : 'Prezzi netti degli ultimi 90 giorni contro il costo pieno ai prezzi di oggi'}</span>
      </div>
      {mode === 'effettivo' ? <MarginiEffettivi d={d} sel={sel} /> : <MarginiOggi d={d} sel={sel} />}
    </>
  );
}

/** Margini per prodotto nel periodo, al costo effettivo (fonte unica del conto economico). */
function MarginiEffettivi({ d, sel }) {
  const per = usePeriod(d); const ctx = ctxOf(d);
  const pp = useMemo(() => productProfit(d, ctx, per.P), [d, ctx, per.P]);
  const econ = useProductEconomics(d);
  const I = idx(d); const P = r => I.prod[r?.id];
  const rows = pp.rows.filter(r => r.tonnes > 0).map(r => ({ ...r, below: econ.find(e => e.id === r.id)?.below, minPrice: econ.find(e => e.id === r.id)?.c.minPrice, priceT: r.revenue / r.tonnes, varT: (r.raw + r.shrink + r.energy + r.varConv + r.pack) / r.tonnes, mc2T: r.mc2 / r.tonnes, fullT: r.marginFull / r.tonnes }));
  const T = pp.totals || {};
  const cur = rows.find(r => r.id === sel) || [...rows].sort((a, b) => b.mc2 - a.mc2)[0];
  const sigs = signals(d).filter(s => s.area === 'economia');
  if (!rows.length) return <Panel title="Margini"><Empty title="Nessuna consegna nel periodo" /></Panel>;
  const per1 = v => (cur ? up(v / cur.tonnes, P(cur)) : 0); // per tonnellata, o per kg o L nell'edizione agrofarmaci
  const steps = cur ? [
    { label: 'Prezzo netto', value: per1(cur.revenue), kind: 'total' },
    { label: 'Materie prime', value: -per1(cur.raw) }, { label: 'Calo', value: -per1(cur.shrink) }, { label: 'Energia', value: -per1(cur.energy) },
    { label: 'Trasformazione variabile', value: -per1(cur.varConv) }, { label: 'Imballi', value: -per1(cur.pack) }, { label: 'Trasporto', value: -per1(cur.logistics) }, { label: 'Provvigioni', value: -per1(cur.commission) },
    { label: 'MdC II', value: per1(cur.mc2), kind: 'total', color: cur.mc2 >= 0 ? 'var(--s3)' : 'var(--crit)' },
    { label: 'Trasformazione fissa', value: -per1(cur.fixConv) },
    { label: 'Margine pieno', value: per1(cur.marginFull), kind: 'total', color: cur.marginFull >= 0 ? 'var(--s3)' : 'var(--crit)' },
  ].filter(x => x.kind === 'total' || Math.abs(x.value) > 0.005) : [];
  return (
    <>
      <div className="kpis">
        <Kpi label="Margine di contribuzione II" value={nf(T.mc2 / 1000)} unit="mila €" foot={`${fmtPm(T.tonnes ? T.mc2 / T.tonnes : null, 1)} · ${per.P.short}`} onClick={() => go('direzione', 'conto')} />
        <Kpi label="Margine pieno" value={nf(T.marginFull / 1000)} unit="mila €" foot={`${fmtPm(T.tonnes ? T.marginFull / T.tonnes : null, 1)} dopo la trasformazione fissa`} />
        <Kpi label="Materie prime sui ricavi" value={nf(T.revenue ? T.raw / T.revenue * 100 : null, 1)} unit="%" foot="al prezzo effettivo dei lotti consegnati" />
        <Kpi label="Prodotti sotto il prezzo minimo" value={econ.filter(r => r.below).length} status={econ.some(r => r.below) ? 'warn' : 'ok'} foot="prezzo netto incassato (90 giorni) contro il minimo ai costi di oggi" onClick={() => go('commerciale', 'listino')} />
      </div>
      {sigs.length > 0 && <Panel title="Da decidere" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="split">
        <Panel title={`Dal prezzo al margine · ${cur?.name}`} sub={`${SMALL_UNITS ? `Per ${unitOf(P(cur)) === 'L' ? 'litro' : 'kg'} venduto` : 'Per tonnellata'} nel periodo, al costo effettivo · ${nf(cur?.tonnes)} t consegnate`} id="eco-waterfall">
          <Waterfall steps={steps} height={300} unit={upLabel(P(cur))} decimals={upDec(2)} ariaLabel={`Cascata del margine effettivo di ${cur?.name}`} />
        </Panel>
        <Panel title="Dove si guadagna" sub="Margine di contribuzione II del periodo per prodotto">
          <Bars data={[...rows].sort((a, b) => b.mc2 - a.mc2).map(r => ({ key: r.id, label: r.name, value: r.mc2 / 1000, color: r.mc2 < 0 ? 'var(--crit)' : r.id === cur?.id ? 'var(--maize)' : 'var(--s1)' }))} unit="mila €" decimals={0} onClick={x => go('economia', 'margini', x.key)} ariaLabel="Margine di contribuzione per prodotto" />
        </Panel>
      </div>
      <Panel title="Prodotti" sub="Clic per la cascata · esportabile" flush>
        <Table rows={rows} exportName="margini-effettivi" selected={cur?.id} onRow={r => go('economia', 'margini', r.id)} initialSort={{ key: 'mc2', dir: 'desc' }} cols={[
          { key: 'name', label: 'Prodotto', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.packaging}</span></>, csv: r => r.name },
          { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes), csv: r => r.tonnes },
          { key: 'priceT', label: colUp('Prezzo netto'), align: 'r', render: r => <>{cellUp(r.priceT, P(r), 1)}{r.below && <span className="sub" style={{ color: 'var(--warn-ink)' }}>sotto il minimo {cellUp(r.minPrice, P(r))}</span>}</>, csv: r => up(r.priceT, P(r)) },
          { key: 'varT', label: colUp('Costo variabile'), align: 'r', render: r => cellUp(r.varT, P(r), 1), csv: r => up(r.varT, P(r)) },
          { key: 'mc2T', label: colUp('MdC II'), align: 'r', render: r => <span className={r.mc2T < 0 ? 'chip crit' : r.below ? 'chip warn' : ''}>{cellUp(r.mc2T, P(r), 1)}</span>, csv: r => up(r.mc2T, P(r)) },
          { key: 'fullT', label: colUp('Margine pieno'), align: 'r', render: r => cellUp(r.fullT, P(r), 1), csv: r => up(r.fullT, P(r)) },
          { key: 'mc2', label: 'MdC II', align: 'r', render: r => nf(r.mc2 / 1000, 1) + ' mila €', csv: r => r.mc2 },
        ]} />
      </Panel>
    </>
  );
}

function MarginiOggi({ d, sel }) {
  const rows = useProductEconomics(d);
  const sigs = signals(d).filter(s => s.area === 'economia');
  const cur = rows.find(r => r.id === sel) || [...rows].sort((a, b) => b.vol - a.vol)[0];
  const T = sum(rows, r => r.vol);
  const steps = cur ? [{ label: 'Prezzo incassato', value: up(cur.real, cur), kind: 'total' }, ...cur.c.parts.filter(p => p.v > 0.005).map(p => ({ label: p.k, value: -up(p.v, cur) })), { label: 'Margine', value: up(cur.margin, cur), kind: 'total', color: cur.margin >= 0 ? 'var(--s3)' : 'var(--crit)' }] : [];
  return (
    <>
      <div className="kpis">
        <Kpi label="Margine annuo stimato" value={nf(sum(rows, r => r.annual) / 1000)} unit="mila €" foot="stimato: prezzi netti di 90 giorni × volumi annui, costi pieni di oggi" />
        <Kpi label="Margine medio" value={nfPm(sum(rows, r => r.annual) / Math.max(1, T), 1)} unit={PM_LABEL} foot={`su ${nf(T)} t/anno`} />
        <Kpi label="Materie prime sul prezzo" value={nf(sum(rows, r => r.c.raw * r.vol) / Math.max(1, sum(rows, r => r.real * r.vol)) * 100, 1)} unit="%" foot="la leva principale del costo" />
        <Kpi label="Prodotti sotto il prezzo minimo" value={rows.filter(r => r.below).length} foot={`sul prezzo netto incassato · sconto medio ${nf(sum(rows, r => (r.discount || 0) * r.vol) / Math.max(1, T) * 100, 1)}%`} onClick={() => go('commerciale', 'listino')} />
      </div>
      {sigs.length > 0 && <Panel title="Da decidere" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="split">
        <Panel title={`Dal prezzo al margine · ${cur?.name}`} sub={`${SMALL_UNITS ? `Per ${unitOf(cur) === 'L' ? 'litro' : 'kg'}` : 'Per tonnellata'}, prezzo medio incassato negli ultimi 90 giorni (listino ${fmtUp(cur?.listPrice, cur)}, sconto medio ${nf((cur?.discount || 0) * 100, 1)}%)`} id="eco-waterfall">
          <Waterfall steps={steps} height={280} unit={upLabel(cur)} decimals={upDec(2)} ariaLabel={`Cascata del margine di ${cur?.name}`} />
        </Panel>
        <Panel title="Dove si guadagna" sub="Contributo al margine annuo per prodotto">
          <Bars data={[...rows].sort((a, b) => b.annual - a.annual).map(r => ({ key: r.id, label: r.name, value: r.annual / 1000, color: r.annual < 0 ? 'var(--crit)' : r.id === cur?.id ? 'var(--maize)' : 'var(--s1)' }))} unit="mila €" decimals={0} onClick={x => go('economia', 'margini', x.key)} ariaLabel="Margine annuo per prodotto" />
        </Panel>
      </div>
      <Panel title="Prodotti" sub="Clic per la cascata del margine" flush>
        <Table rows={rows} selected={cur?.id} onRow={r => go('economia', 'margini', r.id)} initialSort={{ key: 'annual', dir: 'desc' }} cols={[
          { key: 'name', label: 'Prodotto', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.packaging}</span></> },
          { key: 'vol', label: 't/anno', align: 'r', render: r => nf(r.vol) },
          { key: 'real', label: colUp('Prezzo incassato'), align: 'r', render: r => <>{cellUp(r.real, r, 1)}<span className="sub">listino {cellUp(r.listPrice, r)}</span></> },
          { key: 'raw', label: colUp('Materie prime'), align: 'r', sort: r => r.c.raw, render: r => cellUp(r.c.raw, r, 1) },
          { key: 'total', label: colUp('Costo pieno'), align: 'r', sort: r => r.c.total, render: r => cellUp(r.c.total, r, 1) },
          { key: 'margin', label: colUp('Margine'), align: 'r', render: r => <span className={r.margin < 0 ? 'chip crit' : r.below ? 'chip warn' : ''} title={r.below ? 'Prezzo netto incassato sotto il prezzo minimo' : undefined}>{cellUp(r.margin, r, 1)}</span> },
          { key: 'marginPct', label: '%', align: 'r', render: r => nf(r.marginPct * 100, 1) },
          { key: 'annual', label: 'Margine annuo', align: 'r', render: r => nf(r.annual / 1000, 1) + ' mila €' },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- E se… ---------------- */
const EMPTY = { byCategory: {}, byIngredient: {}, kwhPricePct: 0, gplPricePct: 0, volumePct: 0, listPricePct: 0, reoptimize: true, carbonPrice: 0, swapSoy: false };
const PRESETS = [
  { name: 'Mais +10%', byIngredient: { mais: 10 } },
  { name: 'Proteici +15%', byCategory: { proteico: 15 } },
  { name: 'Energia +25%', kwhPricePct: 25, gplPricePct: 25 },
  { name: 'Soia senza deforestazione', swapSoy: true },
  { name: 'Carbonio 100 €/t', carbonPrice: 100 },
  { name: 'Volumi −10%', volumePct: -10 },
];

function Scenari({ d }) {
  const seed = useUi(s => s.scenarioSeed);
  const [sc, setSc] = useState(EMPTY);
  const [name, setName] = useState('');
  const [ing, setIng] = useState('soia44');
  // uno scenario pronto, salvato o arrivato dalla barra comandi: la materia prima mostrata è la prima con una variazione
  const apply = x => { setSc({ ...EMPTY, ...x, id: undefined, name: undefined }); const k = Object.entries(x.byIngredient || {}).find(([, v]) => v)?.[0]; if (k) setIng(k); };
  useEffect(() => { if (seed) { apply(seed); setName(''); uiStore.set({ scenarioSeed: null }); } }, [seed]);
  const I = idx(d); const actx = ctxOf(d);
  // base del simulatore: prezzi netti incassati (90 giorni), MdC e costi fissi degli ultimi 12 mesi, come Margini e Pareggio
  const ctx = useMemo(() => ({ ...scenarioBase(d, actx), contaminant: f => contaminantFor(d, f) }), [d, actx]);
  const base0 = useMemo(() => runScenario(ctx, { reoptimize: true }), [ctx]);
  const R = useMemo(() => runScenario(ctx, sc), [ctx, sc]);
  const Rfix = useMemo(() => sc.reoptimize ? runScenario(ctx, { ...sc, reoptimize: false }) : R, [ctx, sc, R]);
  // effetto dello scenario a ricetta fissa e con ri-ottimizzazione, al netto dell'efficienza già disponibile oggi
  const fixedDelta = sum(Rfix.rows, r => r.deltaFixed * r.volumeSc);
  const reDelta = sc.reoptimize ? sum(R.rows, r => { const b = base0.rows.find(x => x.productId === r.productId); return ((r.reopt || r.fixed).total - (b?.reopt || b?.base).total) * r.volumeSc; }) : null;
  const available = sum(base0.rows, r => r.saving * r.volume);
  // riferimento: con la ri-ottimizzazione, le formule ri-ottimizzate ai prezzi di oggi; senza, le formule in uso
  const ref = r => { const b = base0.rows.find(x => x.productId === r.productId); return sc.reoptimize ? (b?.reopt || b?.base) : r.base; };
  const refCO2 = r => { const b = base0.rows.find(x => x.productId === r.productId); return sc.reoptimize ? b?.co2Sc ?? r.co2Base : r.co2Base; };
  const marginBase = sum(R.rows, r => ref(r).margin * r.volume), marginSc = sum(R.rows, r => r.scen.margin * r.volumeSc);
  const co2Ref = sum(R.rows, r => refCO2(r) * r.volume) / 1000, co2Sc = R.co2ScT;
  // EBIT e pareggio contro lo stesso riferimento del margine: con la ri-ottimizzazione, le formule già ottimizzate ai prezzi di oggi
  const refEbit = sc.reoptimize ? base0.ebitSc : R.ebitBase, refBep = sc.reoptimize ? base0.bepTSc : R.bepTBase;
  const dEbit = R.ebitSc != null && refEbit != null ? R.ebitSc - refEbit : null, dBep = R.bepTSc != null && refBep != null ? R.bepTSc - refBep : null;
  const set = patch => setSc(s => ({ ...s, ...patch }));
  const setCat = (k, v) => setSc(s => ({ ...s, byCategory: { ...s.byCategory, [k]: v } }));
  const save = () => {
    const n = name.trim() || describe(sc, I) || 'Scenario';
    store.add('scenarios', { name: n, ...sc }, `Scenario salvato: ${n}`); toast('Scenario salvato'); setName('');
  };
  const changed = JSON.stringify(sc) !== JSON.stringify(EMPTY);
  return (
    <>
      <div className="row gap-s" id="eco-presets">
        <span className="small muted">Scenari pronti:</span>
        {PRESETS.map(p => <button key={p.name} className="chip outline pick" onClick={() => apply(p)}>{p.name}</button>)}
        {d.scenarios.length > 0 && <span className="small muted" style={{ marginLeft: 8 }}>Salvati:</span>}
        {d.scenarios.map(s => <span key={s.id} className="chip accent">{<button className="linkish" onClick={() => apply(s)}>{s.name}</button>}<button className="linkish" title="Elimina" aria-label={`Elimina ${s.name}`} onClick={() => { store.remove('scenarios', s.id, `Scenario eliminato: ${s.name}`); toast('Scenario eliminato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }}><LuX /></button></span>)}
      </div>
      <div className="split r">
        <Panel title="Ipotesi" sub="Variazioni rispetto a oggi" id="eco-controls" actions={<Btn small kind="ghost" icon={LuRotateCcw} onClick={() => setSc(EMPTY)} disabled={!changed}>Azzera</Btn>}>
          <div className="stack" style={{ gap: 16 }}>
            <div className="eyebrow">Prezzi delle materie prime</div>
            {CAT.map(([k, l]) => <Slider key={k} label={l} value={sc.byCategory[k] || 0} onChange={v => setCat(k, v)} min={-30} max={30} unit="%" />)}
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
              <Field label="Una materia prima"><Select value={ing} onChange={setIng} options={d.ingredients.map(i => ({ id: i.id, label: i.name }))} /></Field>
              <span className="num" style={{ paddingBottom: 8, fontWeight: 600 }}>{sf(sc.byIngredient[ing] || 0)}%</span>
            </div>
            <input type="range" className="range" min={-40} max={40} step={1} value={sc.byIngredient[ing] || 0} onChange={e => setSc(s => ({ ...s, byIngredient: { ...s.byIngredient, [ing]: +e.target.value } }))} aria-label="Variazione della materia prima scelta" />
            {Object.entries(sc.byIngredient || {}).some(([, v]) => v) && <div className="row gap-s">{Object.entries(sc.byIngredient).filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="chip accent"><button className="linkish" onClick={() => setIng(k)}>{I.ing[k]?.name || k} {sf(v)}%</button><button className="linkish" title="Togli questa variazione" aria-label={`Togli la variazione di ${I.ing[k]?.name || k}`} onClick={() => setSc(s => { const b = { ...s.byIngredient }; delete b[k]; return { ...s, byIngredient: b }; })}><LuX /></button></span>))}</div>}
            <div className="eyebrow">Energia, volumi e prezzi</div>
            <Slider label="Elettricità" value={sc.kwhPricePct} onChange={v => set({ kwhPricePct: v })} min={-40} max={60} unit="%" />
            <Slider label="GPL" value={sc.gplPricePct} onChange={v => set({ gplPricePct: v })} min={-40} max={60} unit="%" />
            <Slider label="Volumi venduti" value={sc.volumePct} onChange={v => set({ volumePct: v })} min={-30} max={30} unit="%" />
            <Slider label="Listino" value={sc.listPricePct} onChange={v => set({ listPricePct: v })} min={-10} max={10} unit="%" />
            {sc.listPricePct !== 0 && <Slider label="Elasticità dei volumi al prezzo" value={sc.elasticity ?? ctx.elasticity ?? 0} onChange={v => set({ elasticity: v })} min={-3} max={0} step={0.1} unit="" />}
            <div className="eyebrow">Scelte</div>
            <label className="check"><input type="checkbox" checked={sc.reoptimize} onChange={e => set({ reoptimize: e.target.checked })} /> Ri-ottimizzare le formule con i nuovi prezzi</label>
            <label className="check"><input type="checkbox" checked={!!sc.swapSoy} onChange={e => set({ swapSoy: e.target.checked })} /> Solo soia certificata senza deforestazione</label>
            <Slider label="Prezzo interno del carbonio (€/t CO₂e)" value={sc.carbonPrice || 0} onChange={v => set({ carbonPrice: v })} min={0} max={200} step={10} unit="" disabled={!sc.reoptimize} />
            <div className="row" style={{ flexWrap: 'nowrap' }}><input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder={describe(sc, I) || 'Nome dello scenario'} aria-label="Nome dello scenario" /><Btn icon={LuSave} onClick={save} disabled={!changed}>Salva</Btn></div>
          </div>
        </Panel>
        <div className="stack">
          <div className="kpis two" id="eco-results">
            <Kpi label="Costi annui a formule invariate" value={sf(fixedDelta / 1000)} unit="mila €" foot={`${sf(fixedDelta / Math.max(1, sum(R.rows, r => r.volumeSc)), 2)} €/t in media`} />
            <Kpi label="Con le formule ri-ottimizzate" value={reDelta == null ? '—' : sf(reDelta / 1000)} unit={reDelta == null ? '' : 'mila €'} foot={reDelta == null ? 'ri-ottimizzazione esclusa' : `la ri-ottimizzazione assorbe ${nf(Math.max(0, fixedDelta - reDelta) / 1000)} mila €`} />
            <Kpi label="Margine annuo" value={sf((marginSc - marginBase) / 1000)} unit="mila €" foot={`${nf(marginSc / 1000)} mila € contro ${nf(marginBase / 1000)} di riferimento (prezzi netti incassati)`} />
            <Kpi label="EBIT annuo" value={dEbit == null ? '—' : sf(dEbit / 1000)} unit={dEbit == null ? '' : 'mila €'} foot={dEbit == null ? 'servono i costi fissi (Direzione › Costi fissi)' : `${nf(R.ebitSc / 1000)} mila € contro ${nf(refEbit / 1000)} di riferimento${refEbit ? ` (${sf(dEbit / Math.abs(refEbit) * 100)}%)` : ''}`} />
            <Kpi label="Punto di pareggio" value={R.bepTSc == null ? '—' : nf(R.bepTSc)} unit={R.bepTSc == null ? '' : 't/anno'} foot={dBep == null ? 'servono i costi fissi' : `${sf(dBep)} t rispetto al riferimento${R.breakEvenVolumePct != null ? ` · volumi a margine invariato ${sf(R.breakEvenVolumePct * 100, 1)}%` : ''}`} />
            <Kpi label="CO₂e delle materie prime" value={sf(co2Sc - co2Ref)} unit="t/anno" foot={`${nf(co2Sc)} t nello scenario`} />
          </div>
          <div className="note maize"><b>Efficienza già disponibile oggi:</b> ri-ottimizzando le formule ai prezzi attuali, senza nessuna variazione, si risparmierebbero circa {nf(available / 1000)} mila € l’anno. {sc.reoptimize ? 'Per non attribuire allo scenario un risparmio che esiste già, il confronto parte dalle formule già ri-ottimizzate.' : 'Questo importo non è compreso nei risultati a formule invariate.'}</div>
          <Panel title="Che cosa pesa di più" sub="Contributo annuo dei fattori, a formule invariate">
            {Rfix.drivers.length ? <Bars data={Rfix.drivers.slice(0, 8).map(x => ({ key: x.key, label: x.label, value: x.annual / 1000, color: x.annual > 0 ? 'var(--s2)' : 'var(--s3)' }))} unit="mila €" decimals={1} ariaLabel="Fattori dello scenario" /> : <p className="small muted">Nessuna variazione di prezzo: muovi un cursore o scegli uno scenario pronto.</p>}
          </Panel>
          <Panel title="Effetto per prodotto" sub="€/t rispetto a oggi" flush>
            <Table rows={R.rows} rowKey={r => r.productId} onRow={r => openDrawer('product', r.productId)} initialSort={{ key: 'deltaFixed', dir: 'desc' }} cols={[
              { key: 'p', label: 'Prodotto', sort: r => I.prod[r.productId]?.name, render: r => <b>{I.prod[r.productId]?.name}</b> },
              { key: 'deltaFixed', label: 'A formula fissa', align: 'r', render: r => sf(Rfix.rows.find(x => x.productId === r.productId)?.deltaFixed, 2) },
              { key: 'delta', label: 'Ri-ottimizzata', align: 'r', sort: r => { const b = base0.rows.find(x => x.productId === r.productId); return sc.reoptimize ? (r.reopt || r.fixed).total - (b?.reopt || b?.base).total : null; }, render: r => { if (!sc.reoptimize) return '—'; const b = base0.rows.find(x => x.productId === r.productId); return sf((r.reopt || r.fixed).total - (b?.reopt || b?.base).total, 2); } },
              { key: 'marginSc', label: 'Margine €/t', align: 'r', render: r => <span className={r.scen.price < r.scen.minPrice ? 'chip crit' : ''}>{nf(r.scen.margin, 1)}</span> },
              { key: 'co2', label: 'CO₂e kg/t', align: 'r', sort: r => r.co2Sc - refCO2(r), render: r => sf(r.co2Sc - refCO2(r)) },
            ]} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, unit = '%', disabled }) {
  return (
    <div className="slider">
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>{label}</span><span className="num" style={{ fontWeight: 600 }}>{unit === '%' ? sf(value) + '%' : nf(value)}</span></div>
      <input type="range" className="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(+e.target.value)} aria-label={label} />
    </div>
  );
}
function describe(sc, I) {
  const p = [];
  for (const [k, v] of Object.entries(sc.byCategory || {})) if (v) p.push(`${(CAT.find(c => c[0] === k) || [k, k])[1]} ${sf(v)}%`);
  for (const [k, v] of Object.entries(sc.byIngredient || {})) if (v) p.push(`${I.ing[k]?.short || I.ing[k]?.name} ${sf(v)}%`);
  if (sc.kwhPricePct) p.push(`elettricità ${sf(sc.kwhPricePct)}%`);
  if (sc.gplPricePct) p.push(`GPL ${sf(sc.gplPricePct)}%`);
  if (sc.volumePct) p.push(`volumi ${sf(sc.volumePct)}%`);
  if (sc.listPricePct) p.push(`listino ${sf(sc.listPricePct)}%`);
  if (sc.swapSoy) p.push('soia certificata');
  if (sc.carbonPrice) p.push(`carbonio ${nf(sc.carbonPrice)} €/t`);
  return p.join(', ');
}

/* ---------------- previsioni ---------------- */
function Previsioni({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  const W = weekly(d);
  const data = useMemo(() => {
    const w0 = W.weeks[0];
    const byP = Object.fromEntries(d.products.map(p => [p.id, W.weeks.map(() => 0)]));
    for (const s of d.shipments) { const k = W.weeks.indexOf(mondayOf(s.date)); if (k >= 0 && byP[s.productId]) byP[s.productId][k] += s.tonnes; }
    const cw = mondayOf(today);
    return d.products.map(p => {
      const y = byP[p.id].slice(0, -1); // l'ultima settimana è in corso: esclusa dall'adattamento
      // scelta automatica del modello (ingenuo, media mobile, livellamento semplice o con tendenza smorzata, stagionale con 2 anni)
      // sull'errore a un passo con origine mobile; le ultime 4 settimane restano fuori dalla scelta e misurano l'errore «a scatola chiusa»
      const fa = y.filter(v => v > 0).length >= 8 ? forecastAuto(y, 8, { m: 52, holdout: 4, minTrain: 12 }) : null;
      const fc = fa && fa.points.length ? fa : null;
      const planW = Array.from({ length: 8 }, (_, k) => sum(d.plan.filter(x => x.productId === p.id && x.week === addDays(cw, 7 * k)), x => x.tonnes));
      const fc8 = fc ? sum(fc.points, x => x.value) : null;
      const sh = d.shipments.filter(x => x.productId === p.id && x.date > addDays(today, -90));
      const price = sum(sh, x => x.tonnes) ? sum(sh, x => x.tonnes * x.price) / sum(sh, x => x.tonnes) : p.listPrice;
      const gapT = fc8 != null ? sum(planW) - fc8 : null;
      return { p, y, fc, planW, fc8, plan8: sum(planW), gap: fc8 ? sum(planW) / fc8 - 1 : null, gapT, gapEur: gapT != null ? gapT * (price || 0) : null };
    });
  }, [W, d.plan, d.products, today]);
  const cur = data.find(x => x.p.id === sel) || data.find(x => x.fc) || null;
  if (!cur || !cur.fc) return <Empty title="Serve almeno un prodotto con qualche settimana di consegne" />;
  const n = cur.y.length;
  const labels = [...W.weeks.slice(0, n), ...cur.fc.points.map(x => addDays(W.weeks[n - 1], 7 * x.k))];
  const nul = k => Array(k).fill(null);
  return (
    <>
      <Panel title="Domanda prevista e piano" sub="Consegne settimanali delle ultime 51 settimane complete · previsione a 8 settimane con banda P10–P90 · il piano è quello inserito in Produzione" flush>
        <Table rows={data} rowKey={x => x.p.id} selected={cur.p.id} onRow={x => go('economia', 'previsioni', x.p.id)} initialSort={{ key: 'gap', dir: 'desc' }} cols={[
          { key: 'p', label: 'Prodotto', sort: x => x.p.name, render: x => <b>{x.p.name}</b> },
          { key: 'last', label: 'Ultime 4 sett.', align: 'r', sort: x => sum(x.y.slice(-4)), render: x => nf(sum(x.y.slice(-4))) + ' t' },
          { key: 'fc8', label: 'Previsione 8 sett.', align: 'r', render: x => nf(x.fc8) + ' t' },
          { key: 'plan8', label: 'Piano 8 sett.', align: 'r', render: x => nf(x.plan8) + ' t' },
          { key: 'gap', label: 'Piano vs previsione', align: 'r', render: x => x.gap == null ? '—' : <><span className={Math.abs(x.gap) > 0.1 ? 'chip warn' : ''}>{sf(x.gap * 100)}%</span><span className="sub">{sf(x.gapT)} t · {sf((x.gapEur || 0) / 1000, 0)} k€</span></> },
          { key: 'model', label: 'Modello', sort: x => x.fc?.model || '', render: x => (x.fc ? MODEL_LABEL[x.fc.model] || x.fc.model : '—') },
          { key: 'mape', label: 'Errore storico', align: 'r', sort: x => x.fc?.mape, render: x => (x.fc?.mape != null ? <>{nf(x.fc.mape * 100, 1)}%<span className="sub">media mobile {x.fc.benchmarkMape != null ? nf(x.fc.benchmarkMape * 100, 1) + '%' : '—'}</span></> : '—') },
        ]} />
      </Panel>
      <div className="split">
        <Panel title={cur.p.name} sub="Tonnellate consegnate per settimana, previsione e piano" id="eco-forecast">
          <LineChart labels={labels} height={260} unit="t" decimals={0} formatX={x => dateIt(x, 'dm')} xEvery={6} markLast={false}
            series={[{ key: 'h', label: 'Consegne', color: 'var(--s1)', values: [...cur.y, ...nul(8)] }, { key: 'f', label: 'Previsione', color: 'var(--s2)', dashed: true, values: [...nul(n - 1), cur.y[n - 1], ...cur.fc.points.map(x => x.value)] }, { key: 'p', label: 'Piano', color: 'var(--s3)', values: [...nul(n), ...cur.planW] }]}
            band={{ lo: [...nul(n - 1), cur.y[n - 1], ...cur.fc.points.map(x => x.lo)], hi: [...nul(n - 1), cur.y[n - 1], ...cur.fc.points.map(x => x.hi)], label: 'Banda P10–P90', color: 'var(--s2)' }} ariaLabel={`Previsione della domanda di ${cur.p.name}`} />
          <Legend items={[{ label: 'Consegne', color: 'var(--s1)', line: true }, { label: 'Previsione', color: 'var(--s2)', line: true }, { label: 'Piano', color: 'var(--s3)', line: true }]} />
        </Panel>
        <Panel title="Lettura" sub="Metodo classico e verificabile, non una scatola nera">
          <div className="stack" style={{ gap: 16 }}>
            <Kv items={[['Modello scelto', MODEL_LABEL[cur.fc.model] || cur.fc.model], ['Previsione 8 settimane', `${nf(cur.fc8)} t`], ['Piano 8 settimane', `${nf(cur.plan8)} t (${sf(cur.gap * 100)}%, ${sf((cur.gapEur || 0) / 1000, 0)} k€ ai prezzi netti)`], ['Errore a un passo (selezione)', cur.fc.mape != null ? `${nf(cur.fc.mape * 100, 1)}% contro ${cur.fc.benchmarkMape != null ? nf(cur.fc.benchmarkMape * 100, 1) + '%' : '—'} della media mobile a 4 settimane` : '—'], ['Errore sulle ultime 4 settimane', cur.fc.holdoutMape != null ? `${nf(cur.fc.holdoutMape * 100, 1)}% (escluse dalla scelta)` : '—']]} />
            <div className={`note ${Math.abs(cur.gap) > 0.1 ? 'maize' : 'good'}`}>{Math.abs(cur.gap) > 0.1 ? `Il piano è ${cur.gap > 0 ? 'sopra' : 'sotto'} la previsione del ${nf(Math.abs(cur.gap) * 100)}%: ${cur.gap > 0 ? 'rischio di scorte di prodotto finito e di acquisti anticipati' : 'rischio di mancate consegne'}. Verificare con il commerciale.` : 'Piano e previsione sono coerenti (differenza entro il 10%).'}</div>
            <p className="small muted">FeedOS confronta metodo ingenuo, media mobile, livellamento esponenziale semplice e con tendenza smorzata, e sceglie quello con l’errore minore sulle settimane passate; la banda P10–P90 viene dagli errori osservati e non scende sotto zero. La stagionalità si attiva con almeno due anni di storico settimanale.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
