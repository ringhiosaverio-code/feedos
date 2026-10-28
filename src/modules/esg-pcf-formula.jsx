/* FeedOS 18 · ESG › Impronta mangimi › Formulazione a basso carbonio (#esg.passaporto.formulazione[.<prodotto>]).
 * Frontiera costo–emissioni sulla specifica nutrizionale della formula (programmazione lineare di Formulazione, senza modificarla):
 * obiettivo impronta totale, cambio d'uso e gestione del suolo o occupazione di suolo; scelta dell'origine e dello schema per le
 * materie prime con più fattori nel registro; solo soia senza deforestazione; tetto alle proteine edibili dall'uomo; € per kg CO₂e
 * di ogni scelta; leve di riduzione del prodotto (MACC); proposte salvate da inviare a Formulazione. Prefisso epc-. */
import React, { useMemo, useState } from 'react';
import { LuSave, LuSend, LuX, LuArrowRight, LuFlaskConical, LuLeaf } from 'react-icons/lu';
import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { NAV } from '../app/nav.js';
import { nf, dateIt } from '../core/util.js';
import { fmtPm, nfPm, PM_LABEL } from '../core/units.js';
import { pcf } from '../engine/esg-pcf.js';
import { lowCarbonFrontier, frontierAt, designOps, productMacc, efChoices, conventionalSoy, OBJECTIVES, LEVERS } from '../engine/esg-pcf-formula.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, NumInput, confirm } from '../ui/ui.jsx';
import { Frontier, Bars } from '../ui/charts.jsx';
import { MethodNote, Disclaimer } from './esg-shared.jsx';
import { kgTxt, pctTxt, undoToast } from './esg-pcf-ui.jsx';

const A = x => (Array.isArray(x) ? x : []);
const UNIT = { co2: 'kg CO₂e/t', luc: 'kg CO₂e/t', land: 'm²·anno/t' };
const STATUS = { proposta: 'accent', 'inviata a formulazione': 'good', scartata: 'outline' };

export function Formulazione({ d, today, pick }) {
  const prods = A(d.products).filter(p => p.active !== false && A(d.formulas).some(f => f.id === p.formulaId));
  const [pid, setPid] = useState(prods.some(p => p.id === pick) ? pick : prods[0]?.id || '');
  const [objective, setObjective] = useState('co2');
  const [hep, setHep] = useState(null);
  const [dcfOnly, setDcfOnly] = useState(false);
  const [rowChoice, setRowChoice] = useState({});
  const [sel, setSel] = useState(null);
  const p = prods.find(x => x.id === pid) || prods[0] || null;
  const formula = p ? A(d.formulas).find(f => f.id === p.formulaId) : null;
  const conv = useMemo(() => conventionalSoy(d), [d.ingredients, d.efIngredients, d.supplierPcfs]);
  const multi = useMemo(() => (formula ? [...new Set([...A(formula.lines).map(l => l.ing)])].map(id => ({ id, name: A(d.ingredients).find(i => i.id === id)?.name || id, rows: efChoices(d, id) })).filter(x => x.rows.length > 1) : []), [d.efIngredients, d.ingredients, formula]);
  const choices = useMemo(() => Object.fromEntries(Object.entries(rowChoice).map(([ing, rowId]) => { const r = A(d.efIngredients).find(x => x.id === rowId); return r ? [ing, { origin: r.origin, scheme: r.scheme, coc: r.coc }] : null; }).filter(Boolean)), [rowChoice, d.efIngredients]);
  const opts = { objective, choices, hepMax: hep == null ? null : hep / 100, exclude: dcfOnly ? conv : [] };
  const fr = useMemo(() => (formula ? lowCarbonFrontier(d, formula, opts) : null), [d, formula, objective, JSON.stringify(choices), hep, dcfOnly, conv]);
  const frAll = useMemo(() => (formula && dcfOnly ? lowCarbonFrontier(d, formula, { ...opts, exclude: [] }) : null), [d, formula, objective, JSON.stringify(choices), hep, dcfOnly]);
  const macc = useMemo(() => (p ? productMacc(d, p.id) : null), [d, p?.id]);
  const r = useMemo(() => (p ? pcf(d, p.id, {}) : null), [d, p?.id]);
  if (!p || !formula) return <Panel title="Formulazione a basso carbonio"><Empty icon={LuFlaskConical} title="Nessun prodotto con formula">Servono prodotti attivi collegati a una formula con una specifica nutrizionale.</Empty></Panel>;
  const unit = UNIT[objective];
  const pts = fr?.points || [];
  const chosen = sel != null && pts[sel] ? pts[sel] : null;
  const save = () => {
    if (!chosen) return;
    const x = designOps(d, p, fr, chosen, { at: today, note: dcfOnly ? 'Solo soia senza deforestazione' : '' });
    if (x.ops.length && store.batch(x.ops, `Proposta a basso carbonio: ${p.name}`)) undoToast('Proposta salvata: si trova in fondo alla pagina');
  };
  const dcfCmp = dcfOnly && fr?.base && frAll?.base ? { dCost: fr.base.cost - frAll.base.cost, dCo2: frAll.base.co2 - fr.base.co2 } : null;
  const designs = A(d.lowCarbonDesigns).filter(x => x.productId === p.id || prods.some(q => q.id === x.productId)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const setStatus = (x, status) => { if (store.batch([{ kind: 'update', coll: 'lowCarbonDesigns', id: x.id, patch: { status, statusAt: today } }], `Proposta a basso carbonio: ${status}`)) undoToast(`Proposta ${status}`); };
  const ingName = id => A(d.ingredients).find(i => i.id === id)?.name || id;
  return (
    <>
      <Panel title="Formulazione a basso carbonio" sub="Stessa specifica nutrizionale della formula: si cerca il costo minimo per ogni tetto dell’obiettivo (frontiera di Pareto)"
        actions={<Select value={p.id} onChange={v => { setPid(v); setSel(null); setRowChoice({}); }} options={prods.map(x => ({ id: x.id, label: x.name }))} ariaLabel="Prodotto" className="auto" />}>
        <div className="form">
          <Field label="Obiettivo"><Seg options={[{ id: 'co2', label: 'Impronta' }, { id: 'luc', label: 'Uso del suolo (FLAG)' }, { id: 'land', label: 'Superficie' }]} value={objective} onChange={v => { setObjective(v); setSel(null); }} label="Obiettivo" /></Field>
          <Field label="Soia"><Seg options={[{ id: 'tutte', label: 'Tutte le origini' }, { id: 'dcf', label: 'Solo senza deforestazione' }]} value={dcfOnly ? 'dcf' : 'tutte'} onChange={v => { setDcfOnly(v === 'dcf'); setSel(null); }} label="Soia ammessa" /></Field>
          <Field label="Proteine edibili dall’uomo, massimo %" hint="vuoto = nessun vincolo"><NumInput value={hep} decimals={0} min={0} max={100} placeholder="nessuno" onChange={v => { setHep(v); setSel(null); }} /></Field>
        </div>
        {multi.length > 0 && <div className="form epc-mt">{multi.map(m => (
          <Field key={m.id} label={`Origine di ${m.name}`}><Select value={rowChoice[m.id] || ''} onChange={v => { setRowChoice(c => ({ ...c, [m.id]: v })); setSel(null); }} options={[{ id: '', label: 'come oggi (ordine di risoluzione)' }, ...m.rows.map(x => ({ id: x.key, label: x.label }))]} /></Field>
        ))}</div>}
        {dcfCmp && <p className="note small epc-mt"><b>Solo soia senza deforestazione:</b> riformulazione a costo minimo {dcfCmp.dCost >= 0 ? '+' : ''}{nfPm(dcfCmp.dCost, 2)} {PM_LABEL} per {nf(dcfCmp.dCo2, 1)} kg CO₂e/t in meno{dcfCmp.dCo2 > 0.05 ? <> → <b>{nf(dcfCmp.dCost / dcfCmp.dCo2, 3)} € per kg CO₂e</b> ({nf(dcfCmp.dCost / dcfCmp.dCo2 * 1000)} € per t CO₂e)</> : ''}. Soia esclusa: {conv.map(ingName).join(', ') || 'nessuna'}.</p>}
      </Panel>
      {!fr?.feasible ? <Panel title="Frontiera"><Empty icon={LuFlaskConical} title="Nessuna soluzione">Con questi vincoli la specifica nutrizionale non si rispetta: allenta il tetto alle proteine edibili o ammetti altre materie prime.</Empty></Panel> : <>
        <div className="kpis">
          <Kpi label="Formula approvata" value={fmtPm(fr.current.cost, 2)} foot={`${nf(fr.current.metric)} ${unit} sulle materie prime`} />
          <Kpi label="Riformulazione a costo minimo" value={fmtPm(fr.base.cost, 2)} foot={`${nf(fr.base.metric)} ${unit} · prezzi di oggi`} />
          <Kpi label="Minimo raggiungibile" value={nf(fr.minMetric.metric)} unit={unit} foot={`${pctTxt(fr.minMetric.vsBase.pct)} per ${fmtPm(fr.minMetric.vsBase.cost, 2)}`} />
          <Kpi label="Impronta del prodotto" value={kgTxt(r?.total)} unit="kg CO₂e/t" foot="formula in vigore, energia e imballaggio inclusi" />
        </div>
        <div className="split">
          <Panel title="Frontiera costo–obiettivo" sub={`${OBJECTIVES[objective]} contro costo delle materie prime (${PM_LABEL}) · clic su un punto per sceglierlo`}>
            <Frontier points={pts.map((x, i) => ({ x: x.cost, y: x.metric, label: `Punto ${i + 1}`, active: i === sel }))} current={{ x: fr.current.cost, y: fr.current.metric, label: 'Formula approvata' }} xLabel={PM_LABEL} yLabel={unit} xDec={2} yDec={0} ariaLabel="Frontiera costo–emissioni" onPick={(pt, i) => setSel(i)} />
            <p className="small muted">Il rombo è la formula approvata; il primo punto è la riformulazione a costo minimo con i prezzi di oggi. Il costo marginale è l’euro per tonnellata in più per ogni kg CO₂e in meno.</p>
          </Panel>
          <Panel title="Punti della frontiera" sub="Variazioni rispetto alla riformulazione a costo minimo" flush>
            <Table rows={pts.map((x, i) => ({ ...x, id: i, n: i + 1 }))} onRow={x => setSel(x.id)} selected={sel} pageSize={12} cols={[
              { key: 'n', label: '#', render: x => x.n },
              { key: 'cost', label: PM_LABEL, align: 'r', render: x => nfPm(x.cost, 2) },
              { key: 'metric', label: unit, align: 'r', render: x => <b>{nf(x.metric)}</b> },
              { key: 'pct', label: 'Δ %', align: 'r', sort: x => x.vsBase.pct, render: x => pctTxt(x.vsBase.pct, 1) },
              { key: 'dc', label: `Δ ${PM_LABEL}`, align: 'r', sort: x => x.vsBase.cost, render: x => (x.vsBase.cost >= 0 ? '+' : '') + nfPm(x.vsBase.cost, 2) },
              { key: 'mc', label: '€ per kg', align: 'r', sort: x => x.eurPerKg, render: x => (x.eurPerKg == null ? '—' : nf(x.eurPerKg, 3)) },
              { key: 'hep', label: 'Prot. edibili', align: 'r', render: x => pctTxt(x.hep) },
            ]} />
          </Panel>
        </div>
        {chosen && <Panel title={`Punto ${sel + 1}: ${nf(chosen.metric)} ${unit} a ${fmtPm(chosen.cost, 2)}`} sub={`Rispetto alla riformulazione a costo minimo ${pctTxt(chosen.vsBase.pct, 1)} per ${chosen.vsBase.cost >= 0 ? '+' : ''}${fmtPm(chosen.vsBase.cost, 2)}; rispetto alla formula approvata ${nf(chosen.vsCurrent.co2, 1)} kg CO₂e/t per ${chosen.vsCurrent.cost >= 0 ? '+' : ''}${fmtPm(chosen.vsCurrent.cost, 2)}`}
          actions={<><Btn small kind="primary" icon={LuSave} onClick={save}>Salva come proposta</Btn><Btn small kind="ghost" icon={LuX} onClick={() => setSel(null)}>Chiudi</Btn></>}>
          <div className="tw"><table className="t"><thead><tr><th>Materia prima</th><th className="r">kg/t proposti</th><th className="r">kg/t nella formula</th><th className="r">Δ</th></tr></thead>
            <tbody>{[...new Set([...chosen.lines.map(l => l.ing), ...A(formula.lines).map(l => l.ing)])].map(id => { const a = chosen.lines.find(l => l.ing === id)?.kg || 0, b = A(formula.lines).find(l => l.ing === id)?.kg || 0; return { id, a, b }; })
              .sort((x, y) => y.a - x.a).map(x => <tr key={x.id}><td>{ingName(x.id)}</td><td className="r">{nf(x.a, 1)}</td><td className="r">{nf(x.b, 1)}</td><td className="r">{x.a - x.b >= 0 ? '+' : ''}{nf(x.a - x.b, 1)}</td></tr>)}</tbody></table></div>
          <p className="small muted epc-mt">Uso interno: la proposta va verificata dal nutrizionista (appetibilità, pellettabilità, disponibilità e contratti) prima di diventare una nuova versione della formula.</p>
        </Panel>}
      </>}
      {macc && <Panel title={`Leve di riduzione di ${p.name}`} sub={`Ogni leva rispetto alla riformulazione a costo minimo (${fmtPm(macc.base.cost, 2)}, ${nf(macc.base.co2)} kg CO₂e/t sulle materie prime) · annualizzate su ${nf(macc.volume)} t/anno`} flush>
        <Table rows={macc.levers.map(l => ({ ...l }))} pageSize={10} initialSort={{ key: 'eurPerT', dir: 'asc' }} exportName={`leve-${p.code || p.id}`} cols={[
          { key: 'label', label: 'Leva', render: l => <><b>{l.label}</b>{macc.cheapest?.id === l.id && <span className="sub"><Chip kind="good" icon={LuLeaf}>la più economica</Chip></span>}</> },
          { key: 'dCo2', label: 'kg CO₂e/t in meno', align: 'r', render: l => (l.feasible ? nf(l.dCo2, 1) : '—') },
          { key: 'dCost', label: `Δ ${PM_LABEL}`, align: 'r', render: l => (l.feasible ? (l.dCost >= 0 ? '+' : '') + nfPm(l.dCost, 2) : '—') },
          { key: 'eurPerT', label: '€ per t CO₂e', align: 'r', render: l => (l.feasible && l.eurPerT != null ? <b>{nf(l.eurPerT)}</b> : '—') },
          { key: 'annualT', label: 't CO₂e/anno', align: 'r', render: l => (l.feasible ? nf(l.annualT, 1) : '—') },
          { key: 'annualEur', label: '€/anno', align: 'r', render: l => (l.feasible ? nf(l.annualEur) : '—') },
          { key: 'stato', label: 'Esito', csv: l => (l.feasible ? (l.reduces ? 'riduce' : 'nessuna riduzione') : l.reason), render: l => (!l.feasible ? <span className="small muted">{l.reason}</span> : l.reduces ? <Chip kind="accent">riduce</Chip> : <span className="small muted">nessuna riduzione</span>) },
        ]} />
        {macc.levers.some(l => l.feasible && l.reduces && l.eurPerT != null) && <div className="epc-pad"><Bars data={macc.levers.filter(l => l.feasible && l.reduces && l.eurPerT != null).sort((a, b) => a.eurPerT - b.eurPerT).map(l => ({ key: l.id, label: LEVERS[l.id].short, value: Math.max(0, l.eurPerT), color: l.id === macc.cheapest?.id ? 'var(--good)' : 'var(--s1)' }))} unit="€/t CO₂e" ariaLabel="Costo delle leve per tonnellata di CO₂e evitata" /></div>}
      </Panel>}
      <Panel title="Proposte salvate" sub="Proposte di formula a basso carbonio da valutare in Formulazione" flush>
        {designs.length ? <Table rows={designs} pageSize={10} cols={[
          { key: 'productId', label: 'Prodotto', render: x => <b>{A(d.products).find(q => q.id === x.productId)?.name || x.productId}</b> },
          { key: 'createdAt', label: 'Del', render: x => dateIt(x.createdAt) },
          { key: 'co2DeltaT', label: 'kg CO₂e/t', align: 'r', render: x => `${nf(x.co2DeltaT, 1)}${x.co2DeltaPct != null ? ` (${nf(x.co2DeltaPct, 1)}%)` : ''}` },
          { key: 'costDeltaT', label: `Δ ${PM_LABEL}`, align: 'r', render: x => (x.costDeltaT >= 0 ? '+' : '') + nfPm(x.costDeltaT, 2) },
          { key: 'status', label: 'Stato', render: x => <Chip kind={STATUS[x.status] || 'outline'}>{x.status}</Chip> },
          { key: 'x', label: '', nosort: true, render: x => <span className="row gap-s epc-nowrap">
            {x.status === 'proposta' && <Btn small icon={LuSend} onClick={() => confirm('Inviare la proposta a Formulazione?', 'Il nutrizionista la trova tra le proposte della formula e decide se farne una nuova versione.', () => setStatus(x, 'inviata a formulazione'), { ok: 'Invia' })}>Invia</Btn>}
            {x.status === 'proposta' && <Btn small kind="ghost" icon={LuX} onClick={() => setStatus(x, 'scartata')}>Scarta</Btn>}
            {NAV.formulazione && <Btn small kind="ghost" icon={LuArrowRight} onClick={() => go('formulazione', 'formule', x.formulaId)} title="Apri la formula">Formula</Btn>}
          </span> },
        ]} /> : <div className="epc-pad"><p className="small muted epc-m0">Nessuna proposta: scegli un punto della frontiera e salvalo.</p></div>}
      </Panel>
      <MethodNote text={{ it: 'La frontiera usa la stessa programmazione lineare della Formulazione, con un vincolo in più sull’obiettivo (Σ valore × kg ≤ tetto): ogni punto è il costo minimo per quel tetto, rispettando specifica nutrizionale, limiti di inclusione e aflatossina. Il valore di ogni materia prima è quello del registro dei fattori per l’origine scelta. Le leve confrontano varianti della stessa programmazione (esclusioni o minimi di gruppo) con la riformulazione a costo minimo.', en: '' }} title="Come si calcola" />
      <Disclaimer />
    </>
  );
}
