/* FeedOS 16 · Economia: costo pieno e margine per prodotto (prezzi realizzati), simulatore «E se…» che propaga
 * uno scenario su formule, costi, margini e CO₂ separando l'efficienza già disponibile, previsioni della domanda
 * verificate sul passato e confrontate con il piano. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuSave, LuTrash2, LuRotateCcw, LuSparkles, LuLeaf, LuX } from 'react-icons/lu';
import { useData, store, toast, useUi, uiStore, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, costs, volumes, contaminantFor, weekly, signals } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, mondayOf, mean } from '../core/util.js';
import { runScenario } from '../engine/scenario.js';
import { forecast, backtest } from '../engine/forecast.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, Empty, Seg, Kv } from '../ui/ui.jsx';
import { Waterfall, Bars, LineChart, Legend, StackBar } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

const CAT = [['cereale', 'Cereali'], ['proteico', 'Proteici'], ['coprodotto', 'Co-prodotti'], ['grasso', 'Grassi'], ['minerale', 'Minerali'], ['aminoacido', 'Aminoacidi'], ['premix', 'Premiscele']];

export function Economia({ route }) {
  const d = useData();
  const tab = route.tab || 'margini';
  return (
    <>
      <PageHead title="Economia" lead="Quanto rende ogni tonnellata: costo pieno ai prezzi di oggi, margine sui prezzi realmente incassati, simulatore «E se…» sulle materie prime e sull’energia, previsioni della domanda verificate sul passato."
        tabs={NAV.economia.tabs} tab={tab} onTab={t => go('economia', t)} />
      {tab === 'margini' && <Margini d={d} sel={route.id} />}
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
    return d.products.map(p => {
      const c = C[p.id]; const real = t[p.id] ? rev[p.id] / t[p.id] : c.price;
      const m = real - c.total;
      return { ...p, c, real, margin: m, marginPct: real ? m / real : null, vol: V[p.id] || 0, annual: m * (V[p.id] || 0), discount: p.listPrice ? 1 - real / p.listPrice : null, below: p.listPrice < c.minPrice - 1e-9 };
    });
  }, [C, V, d.products, d.shipments, today]);
}

function Margini({ d, sel }) {
  const rows = useProductEconomics(d);
  const sigs = signals(d).filter(s => s.area === 'economia');
  const cur = rows.find(r => r.id === sel) || [...rows].sort((a, b) => b.vol - a.vol)[0];
  const T = sum(rows, r => r.vol);
  const steps = cur ? [{ label: 'Prezzo incassato', value: cur.real, kind: 'total' }, ...cur.c.parts.filter(p => p.v > 0.005).map(p => ({ label: p.k, value: -p.v })), { label: 'Margine', value: cur.margin, kind: 'total', color: cur.margin >= 0 ? 'var(--s3)' : 'var(--crit)' }] : [];
  return (
    <>
      <div className="kpis">
        <Kpi label="Margine annuo stimato" value={nf(sum(rows, r => r.annual) / 1000)} unit="mila €" foot="prezzi degli ultimi 90 giorni × volumi annui, costi di oggi" />
        <Kpi label="Margine medio" value={nf(sum(rows, r => r.annual) / Math.max(1, T), 1)} unit="€/t" foot={`su ${nf(T)} t/anno`} />
        <Kpi label="Materie prime sul prezzo" value={nf(sum(rows, r => r.c.raw * r.vol) / Math.max(1, sum(rows, r => r.real * r.vol)) * 100, 1)} unit="%" foot="la leva principale del costo" />
        <Kpi label="Listini sotto il margine minimo" value={rows.filter(r => r.below).length} foot={`sconto medio sul listino ${nf(sum(rows, r => (r.discount || 0) * r.vol) / Math.max(1, T) * 100, 1)}%`} onClick={() => go('commerciale', 'listino')} />
      </div>
      {sigs.length > 0 && <Panel title="Da decidere" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="split">
        <Panel title={`Dal prezzo al margine · ${cur?.name}`} sub={`Per tonnellata, prezzo medio incassato negli ultimi 90 giorni (listino ${nf(cur?.listPrice)} €/t, sconto medio ${nf((cur?.discount || 0) * 100, 1)}%)`} id="eco-waterfall">
          <Waterfall steps={steps} height={280} ariaLabel={`Cascata del margine di ${cur?.name}`} />
        </Panel>
        <Panel title="Dove si guadagna" sub="Contributo al margine annuo per prodotto">
          <Bars data={[...rows].sort((a, b) => b.annual - a.annual).map(r => ({ key: r.id, label: r.name, value: r.annual / 1000, color: r.annual < 0 ? 'var(--crit)' : r.id === cur?.id ? 'var(--maize)' : 'var(--s1)' }))} unit="mila €" decimals={0} onClick={x => go('economia', 'margini', x.key)} ariaLabel="Margine annuo per prodotto" />
        </Panel>
      </div>
      <Panel title="Prodotti" sub="Clic per la cascata del margine" flush>
        <Table rows={rows} selected={cur?.id} onRow={r => go('economia', 'margini', r.id)} initialSort={{ key: 'annual', dir: 'desc' }} cols={[
          { key: 'name', label: 'Prodotto', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.packaging}</span></> },
          { key: 'vol', label: 't/anno', align: 'r', render: r => nf(r.vol) },
          { key: 'real', label: 'Prezzo incassato', align: 'r', render: r => <>{nf(r.real, 1)}<span className="sub">listino {nf(r.listPrice)}</span></> },
          { key: 'raw', label: 'Materie prime', align: 'r', sort: r => r.c.raw, render: r => nf(r.c.raw, 1) },
          { key: 'total', label: 'Costo pieno', align: 'r', sort: r => r.c.total, render: r => nf(r.c.total, 1) },
          { key: 'margin', label: 'Margine €/t', align: 'r', render: r => <span className={r.margin < 0 ? 'chip crit' : r.below ? 'chip warn' : ''} title={r.below ? 'Listino sotto il margine minimo' : undefined}>{nf(r.margin, 1)}</span> },
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
  useEffect(() => { if (seed) { setSc({ ...EMPTY, ...seed }); setName(''); uiStore.set({ scenarioSeed: null }); } }, [seed]);
  const V = volumes(d); const I = idx(d);
  const ctx = useMemo(() => ({ ...d, energy: d.settings?.energy || {}, volumes: V, contaminant: f => contaminantFor(d, f) }), [d.ingredients, d.formulas, d.products, d.specs, d.lines, d.settings, V]);
  const base0 = useMemo(() => runScenario(ctx, { reoptimize: true }), [ctx]);
  const R = useMemo(() => runScenario(ctx, sc), [ctx, sc]);
  const Rfix = useMemo(() => sc.reoptimize ? runScenario(ctx, { ...sc, reoptimize: false }) : R, [ctx, sc, R]);
  const volF = 1 + (sc.volumePct || 0) / 100;
  // effetto dello scenario a ricetta fissa e con ri-ottimizzazione, al netto dell'efficienza già disponibile oggi
  const fixedDelta = sum(Rfix.rows, r => r.deltaFixed * r.volumeSc);
  const reDelta = sc.reoptimize ? sum(R.rows, r => { const b = base0.rows.find(x => x.productId === r.productId); return ((r.reopt || r.fixed).total - (b?.reopt || b?.base).total) * r.volumeSc; }) : null;
  const available = sum(base0.rows, r => r.saving * r.volume);
  // riferimento: con la ri-ottimizzazione, le formule ri-ottimizzate ai prezzi di oggi; senza, le formule in uso
  const ref = r => { const b = base0.rows.find(x => x.productId === r.productId); return sc.reoptimize ? (b?.reopt || b?.base) : r.base; };
  const refCO2 = r => { const b = base0.rows.find(x => x.productId === r.productId); return sc.reoptimize ? b?.co2Sc ?? r.co2Base : r.co2Base; };
  const marginBase = sum(R.rows, r => ref(r).margin * r.volume), marginSc = sum(R.rows, r => r.scen.margin * r.volumeSc);
  const co2Ref = sum(R.rows, r => refCO2(r) * r.volume) / 1000, co2Sc = R.co2ScT;
  const set = patch => setSc(s => ({ ...s, ...patch }));
  const setCat = (k, v) => setSc(s => ({ ...s, byCategory: { ...s.byCategory, [k]: v } }));
  const [ing, setIng] = useState('soia44');
  useEffect(() => { const k = Object.entries(sc.byIngredient || {}).find(([, v]) => v)?.[0]; if (k && k !== ing) setIng(k); }, [sc.byIngredient]);
  const save = () => {
    const n = name.trim() || describe(sc, I) || 'Scenario';
    store.add('scenarios', { name: n, ...sc }, `Scenario salvato: ${n}`); toast('Scenario salvato'); setName('');
  };
  const changed = JSON.stringify(sc) !== JSON.stringify(EMPTY);
  return (
    <>
      <div className="row gap-s" id="eco-presets">
        <span className="small muted">Scenari pronti:</span>
        {PRESETS.map(p => <button key={p.name} className="chip outline pick" onClick={() => setSc({ ...EMPTY, ...p, name: undefined })}>{p.name}</button>)}
        {d.scenarios.length > 0 && <span className="small muted" style={{ marginLeft: 8 }}>Salvati:</span>}
        {d.scenarios.map(s => <span key={s.id} className="chip accent">{<button className="linkish" onClick={() => setSc({ ...EMPTY, ...s, id: undefined, name: undefined })}>{s.name}</button>}<button className="linkish" title="Elimina" aria-label={`Elimina ${s.name}`} onClick={() => { store.remove('scenarios', s.id, `Scenario eliminato: ${s.name}`); toast('Scenario eliminato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }}><LuX /></button></span>)}
      </div>
      <div className="split r">
        <Panel title="Ipotesi" sub="Variazioni rispetto a oggi" id="eco-controls" actions={<Btn small kind="ghost" icon={LuRotateCcw} onClick={() => setSc(EMPTY)} disabled={!changed}>Azzera</Btn>}>
          <div className="stack" style={{ gap: 14 }}>
            <div className="eyebrow">Prezzi delle materie prime</div>
            {CAT.slice(0, 5).map(([k, l]) => <Slider key={k} label={l} value={sc.byCategory[k] || 0} onChange={v => setCat(k, v)} min={-30} max={30} unit="%" />)}
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
              <Field label="Una materia prima"><Select value={ing} onChange={setIng} options={d.ingredients.map(i => ({ id: i.id, label: i.name }))} /></Field>
              <span className="num" style={{ paddingBottom: 8, fontWeight: 700 }}>{sf(sc.byIngredient[ing] || 0)}%</span>
            </div>
            <input type="range" className="range" min={-40} max={40} step={1} value={sc.byIngredient[ing] || 0} onChange={e => setSc(s => ({ ...s, byIngredient: { ...s.byIngredient, [ing]: +e.target.value } }))} aria-label="Variazione della materia prima scelta" />
            <div className="eyebrow">Energia, volumi e prezzi</div>
            <Slider label="Elettricità" value={sc.kwhPricePct} onChange={v => set({ kwhPricePct: v })} min={-40} max={60} unit="%" />
            <Slider label="GPL" value={sc.gplPricePct} onChange={v => set({ gplPricePct: v })} min={-40} max={60} unit="%" />
            <Slider label="Volumi venduti" value={sc.volumePct} onChange={v => set({ volumePct: v })} min={-30} max={30} unit="%" />
            <Slider label="Listino" value={sc.listPricePct} onChange={v => set({ listPricePct: v })} min={-10} max={10} unit="%" />
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
            <Kpi label="Margine annuo" value={sf((marginSc - marginBase) / 1000)} unit="mila €" foot={`${nf(marginSc / 1000)} mila € contro ${nf(marginBase / 1000)} di riferimento`} />
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
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>{label}</span><span className="num" style={{ fontWeight: 700 }}>{unit === '%' ? sf(value) + '%' : nf(value)}</span></div>
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
      const fc = forecast(y, 8, 1);
      const bt = backtest(y, 4, 1, 26);
      const naive = []; for (let t = 26; t + 4 <= y.length; t++) { const m4 = mean(y.slice(t - 4, t)); naive.push(Math.abs(m4 - y[t + 3]) / Math.max(1, y[t + 3])); }
      const planW = Array.from({ length: 8 }, (_, k) => sum(d.plan.filter(x => x.productId === p.id && x.week === addDays(cw, 7 * k)), x => x.tonnes));
      const fc8 = fc ? sum(fc.points, x => x.value) : null;
      return { p, y, fc, bt, naive: naive.length ? mean(naive) : null, planW, fc8, plan8: sum(planW), gap: fc8 ? sum(planW) / fc8 - 1 : null };
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
          { key: 'gap', label: 'Piano vs previsione', align: 'r', render: x => x.gap == null ? '—' : <span className={Math.abs(x.gap) > 0.1 ? 'chip warn' : ''}>{sf(x.gap * 100)}%</span> },
          { key: 'mape', label: 'Errore storico', align: 'r', sort: x => x.bt.mape, render: x => <>{nf(x.bt.mape * 100, 1)}%<span className="sub">media mobile {nf(x.naive * 100, 1)}%</span></> },
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
          <div className="stack" style={{ gap: 12 }}>
            <Kv items={[['Previsione 8 settimane', `${nf(cur.fc8)} t`], ['Piano 8 settimane', `${nf(cur.plan8)} t (${sf(cur.gap * 100)}%)`], ['Errore storico a 4 settimane', `${nf(cur.bt.mape * 100, 1)}% (media mobile a 4 settimane: ${nf(cur.naive * 100, 1)}%)`], ['Consegne reali dentro la banda', `${nf(cur.bt.coverage * 100)}%`]]} />
            <div className={`note ${Math.abs(cur.gap) > 0.1 ? 'maize' : 'good'}`}>{Math.abs(cur.gap) > 0.1 ? `Il piano è ${cur.gap > 0 ? 'sopra' : 'sotto'} la previsione del ${nf(Math.abs(cur.gap) * 100)}%: ${cur.gap > 0 ? 'rischio di scorte di prodotto finito e di acquisti anticipati' : 'rischio di mancate consegne'}. Verificare con il commerciale.` : 'Piano e previsione sono coerenti (differenza entro il 10%).'}</div>
            <p className="small muted">Livellamento esponenziale con tendenza (Holt), parametri scelti sui dati; la banda viene dagli errori a un passo osservati. Con più di due anni di storia si attiva anche la stagionalità.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
