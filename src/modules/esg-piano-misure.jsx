/* FeedOS 18 · ESG › Obiettivi e piano: misure (libreria con stima dai dati, registro, economia), curva dei costi di abbattimento con
 * il cursore del prezzo del carbonio, incentivi (stima indicativa, non consulenza fiscale) e finanziamenti legati alla sostenibilità.
 * Prefisso CSS epi-. Ogni scrittura è un solo store.batch con un'etichetta italiana. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuPencil, LuTrash2, LuSave, LuDownload, LuLibrary, LuCheck, LuLandmark } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { dateIt, daysBetween } from '../core/util.js';
import { measureLibrary, estimateEffect, maccCurve, metricsFor, METRICS, LEVERS, INCENTIVES, iperUplift, pianoPack, PACK_PIANO } from '../engine/esg-piano.js';
import { Panel, Kpi, Table, Btn, Field, NumInput, Select, Seg, Empty, Kv, confirm } from '../ui/ui.jsx';
import { LineChart, Legend } from '../ui/charts.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { QualityChip, StatusChip, Lineage, EvidenceCount, Disclaimer, setEsgSettings } from './esg-shared.jsx';
import { n, eurTxt, pctTxt, withUnit, fin, downloadCsv, downloadText, MeasureState, MaccChart, ProgressBar } from './esg-piano-ui.jsx';

const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
const ORDER = { 'in corso': 0, approvata: 1, idea: 2, completata: 3, scartata: 4 };
const FROM = { inserito: 'inserito', stima: 'stimato dai dati', mancante: 'mancante' };
const incLabel = k => INCENTIVES[k] || '—';

/* ================= misure ================= */
export function Misure({ d, P, model, today }) {
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null); // 'nuova' | id
  const [lever, setLever] = useState('tutte');
  const ms = [...model.measures].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (b.values.tco2Year || 0) - (a.values.tco2Year || 0));
  const m = ms.find(x => x.id === sel) || null;
  const active = model.live.filter(x => x.status === 'approvata' || x.status === 'in corso');
  const lib = measureLibrary(d);
  const cy = +P.to.slice(0, 4);
  const add = it => {
    const obj = { libId: it.id, title: it.title, lever: it.lever, scopeHit: it.scopeHit, status: 'idea', startYear: cy + 1, incentive: it.incentive ?? null, lifeYears: it.lifeYears ?? null, params: {}, evidenceIds: [] };
    store.batch([{ kind: 'add', coll: 'measures', obj }], `Piano · misura dalla libreria: ${it.title}`); undoToast('Misura aggiunta come idea');
  };
  const save = (v, id) => {
    const clean = { ...v }; for (const k of Object.keys(clean)) if (clean[k] === '') clean[k] = null;
    if (id) store.batch([{ kind: 'update', coll: 'measures', id, patch: clean }], `Piano · misura modificata: ${clean.title}`);
    else store.batch([{ kind: 'add', coll: 'measures', obj: { ...clean, params: {}, evidenceIds: [] } }], `Piano · nuova misura: ${clean.title}`);
    setForm(null); undoToast(id ? 'Misura aggiornata' : 'Misura aggiunta');
  };
  const setStatus = (x, status) => {
    const patch = { status, ...(status === 'completata' && !x.completedAt ? { completedAt: today } : {}) };
    store.batch([{ kind: 'update', coll: 'measures', id: x.id, patch }], `Piano · ${x.title}: ${status}`); undoToast(`Stato: ${status}`);
  };
  const fix = x => {
    const patch = {};
    for (const k of ['tco2Year', 'savingsEur', 'opexDelta', 'capex']) if (x.from[k] === 'stima' && fin(x.values[k])) patch[k] = Math.round(x.values[k] * 10) / 10;
    if (!Object.keys(patch).length) return;
    store.batch([{ kind: 'update', coll: 'measures', id: x.id, patch: { ...patch, note: [x.note, `Valori fissati dalla stima del ${dateIt(P.to)}`].filter(Boolean).join(' · ') } }], `Piano · valori stimati fissati: ${x.title}`); undoToast('Valori fissati');
  };
  const remove = x => confirm('Eliminare la misura?', `«${x.title}» esce dal piano, dalla curva dei costi e dal VS C3.`, () => { store.batch([{ kind: 'remove', coll: 'measures', id: x.id }], `Piano · misura eliminata: ${x.title}`); setSel(null); undoToast('Misura eliminata'); }, { danger: true, ok: 'Elimina' });
  const levers = [...new Set(lib.map(x => x.lever))];
  const libShown = lib.filter(x => lever === 'tutte' || x.lever === lever);
  return (
    <>
      <div className="kpis">
        <Kpi label="Misure approvate o in corso" value={n(active.length)} foot={`${n(model.measures.filter(x => x.status === 'idea').length)} idee, ${n(model.measures.filter(x => x.status === 'completata').length)} completate`} />
        <Kpi label="Riduzione pianificata" value={n(active.reduce((s, x) => s + (x.values.tco2Year || 0), 0), 1)} unit="t CO₂e/anno" foot="misure approvate o in corso" />
        <Kpi label="Investimento" value={n(active.reduce((s, x) => s + (x.values.capex || 0), 0))} unit="€" foot="misure approvate o in corso" />
        <Kpi label="Risparmio annuo" value={n(active.reduce((s, x) => s + (x.values.savingsEur || 0) - (x.values.opexDelta || 0), 0))} unit="€" foot="risparmi meno maggiori costi" />
      </div>
      <Panel title="Misure del piano" sub={`Valori annui · stime dai registri del periodo (${P.label}) dove non ci sono preventivi o misure · prezzo del carbonio ${n(model.S.carbonPrice)} €/t`} flush id="epi-measures"
        actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setForm('nuova')}>Nuova misura</Btn>}>
        {form === 'nuova' && <div className="epi-pad"><EntityForm coll="measures" d={d} rec={{ status: 'idea', startYear: cy + 1 }} saveLabel="Aggiungi la misura" onSave={v => save(v)} onCancel={() => setForm(null)} /></div>}
        {!ms.length ? <Empty icon={LuLibrary} title="Nessuna misura nel piano">Aggiungi le misure dalla libreria qui sotto: FeedOS stima riduzione, risparmio e investimento dai dati dello stabilimento.</Empty>
          : <Table rows={ms} onRow={r => setSel(r.id === sel ? null : r.id)} selected={m?.id} exportName="feedos-piano-misure" pageSize={30} cols={[
            { key: 'title', label: 'Misura', render: r => <><span className="epi-strong epi-wrap">{r.title}</span><span className="sub">{LEVERS[r.lever] || r.lever || '—'} · {r.scopeHit || '—'}{r.startYear ? ` · ${r.startYear}` : ''}</span></>, csv: r => r.title },
            { key: 'status', label: 'Stato', render: r => <MeasureState s={r.status} />, csv: r => r.status, sort: r => ORDER[r.status] },
            { key: 't', label: 't CO₂e/anno', align: 'r', render: r => <>{r.noCo2 ? '0' : n(r.values.tco2Year, 1)}<span className="sub">{r.mbOnly ? `market-based ${n(r.tco2Mb, 0)}` : FROM[r.from.tco2Year]}</span></>, csv: r => r.values.tco2Year, sort: r => r.values.tco2Year },
            { key: 'capex', label: 'Investimento', align: 'r', className: 'epi-nw', render: r => eurTxt(r.values.capex), csv: r => r.values.capex, sort: r => r.values.capex },
            { key: 'net', label: 'Flusso annuo', align: 'r', className: 'epi-nw', render: r => eurTxt(r.econ.net), csv: r => r.econ.net, sort: r => r.econ.net },
            { key: 'mac', label: '€/t CO₂e', align: 'r', render: r => n(r.use.mac), csv: r => r.use.mac, sort: r => r.use.mac },
            { key: 'payback', label: 'Ritorno', align: 'r', className: 'epi-nw', render: r => (r.use.payback != null ? `${n(r.use.payback, 1)} anni` : '—'), csv: r => r.use.payback, sort: r => r.use.payback },
            { key: 'npv', label: 'VAN', align: 'r', className: 'epi-nw', render: r => eurTxt(r.use.npv), csv: r => r.use.npv, sort: r => r.use.npv },
            { key: 'inc', label: 'Incentivo', render: r => <>{incLabel(r.incentive)}{r.incentiveCalc?.value > 0 && <span className="sub">{eurTxt(r.incentiveCalc.value)} stimati</span>}</>, csv: r => incLabel(r.incentive) },
          ]} />}
      </Panel>
      {m && <MeasureDetail d={d} P={P} m={m} model={model} onEdit={() => setForm(m.id)} onFix={() => fix(m)} onRemove={() => remove(m)} onStatus={s => setStatus(m, s)} editing={form === m.id}
        onSave={v => save(v, m.id)} onCancel={() => setForm(null)} />}
      <Panel title="Libreria delle misure" sub={`Valori indicativi da confermare con preventivi o diagnosi energetica · stima sui dati del periodo (${P.label}) · pacchetto ${model.S && (d.settings?.esg18?.packs?.piano?.version || '2026.1')}`}
        actions={<Select className="slim auto" value={lever} onChange={setLever} options={[{ id: 'tutte', label: 'Tutte le leve' }, ...levers.map(l => ({ id: l, label: LEVERS[l] || l }))]} ariaLabel="Leva" />}>
        <div className="epi-lib">
          {libShown.map(it => {
            const e = estimateEffect(d, { libId: it.id }, model.B);
            const inPlan = model.measures.some(x => x.libId === it.id && x.status !== 'scartata');
            return (
              <article key={it.id} className="epi-lib-it">
                <span className="epi-strong">{it.title}</span>
                <span className="small muted">{LEVERS[it.lever] || it.lever} · {it.scopeHit}{it.incentive ? ` · ${incLabel(it.incentive)}` : ''}</span>
                <span className="small">{e ? (e.noCo2 ? `nessuna CO₂; COV ${n(e.vocKg)} kg l’anno` : e.mbOnly ? `solo market-based: ${n(e.tco2Mb)} t CO₂e l’anno` : `${n(e.tco2Year, 1)} t CO₂e l’anno · ${eurTxt(e.savingsEur - e.opexDelta)} l’anno · investimento ${eurTxt(e.capex)}`) : 'dati dello stabilimento insufficienti per la stima'}</span>
                {e?.basis && <span className="xs muted">{e.basis}</span>}
                <span className="xs muted">{it.note} <StatusChip status={it.status} /></span>
                <span className="epi-lib-go">{inPlan ? <span className="small muted">già nel piano</span> : <Btn small kind="ghost" icon={LuPlus} onClick={() => add(it)}>Aggiungi al piano</Btn>}</span>
              </article>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function MeasureDetail({ d, P, m, model, onEdit, onFix, onRemove, onStatus, editing, onSave, onCancel }) {
  const e = m.econ, ei = m.econInc, ic = m.incentiveCalc;
  const lin = { method: m.est?.basis || m.note || null, formula: m.est?.formula || null, source: m.from.tco2Year === 'stima' ? (m.est?.source?.startsWith('pcf.') ? 'Formulazione a basso carbonio (scheda Impronta)' : 'Inventario della scheda Clima e libreria delle misure') : 'valori inseriti', quality: m.quality };
  const hasEst = Object.values(m.from).includes('stima');
  return (
    <Panel title={m.title} sub={`${LEVERS[m.lever] || m.lever || '—'} · ${m.scopeHit || '—'} · ${m.status}${m.owner ? ` · ${m.owner}` : ''}`} id="epi-measure"
      actions={<><Select className="slim auto" value={m.status} onChange={onStatus} options={['idea', 'approvata', 'in corso', 'completata', 'scartata'].map(s => ({ id: s, label: s }))} ariaLabel="Stato della misura" />
        {hasEst && <Btn small kind="ghost" icon={LuCheck} onClick={onFix} title="Copia le stime nei campi della misura">Fissa le stime</Btn>}
        <Btn small kind="ghost" icon={LuPencil} onClick={onEdit}>Modifica</Btn><Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={onRemove} /></>}>
      {editing ? <EntityForm coll="measures" d={d} rec={d.measures.find(x => x.id === m.id)} saveLabel="Salva" onSave={onSave} onCancel={onCancel} /> : <div className="split">
        <div>
          <Kv items={[
            ['Riduzione', <span>{m.noCo2 ? 'nessuna CO₂' : `${n(m.values.tco2Year, 1)} t CO₂e l’anno`} · {FROM[m.from.tco2Year]} <QualityChip q={m.quality} /></span>],
            m.mbOnly ? ['Market-based', `${n(m.tco2Mb)} t CO₂e l’anno (il location-based non cambia)`] : null,
            m.vocKg != null ? ['COV evitati', `${n(m.vocKg)} kg l’anno (stima)`] : null,
            ['Investimento', `${eurTxt(m.values.capex)} · ${FROM[m.from.capex]}`],
            ['Risparmio annuo', `${eurTxt(m.values.savingsEur)} · ${FROM[m.from.savingsEur]}`],
            ['Maggior costo annuo', `${eurTxt(m.values.opexDelta)} · ${FROM[m.from.opexDelta]}`],
            m.mwhSaved != null ? ['Energia risparmiata', `${n(m.mwhSaved, 1)} MWh l’anno`] : null,
            ['Vita utile', m.lifeYears ? `${m.lifeYears} anni` : `${model.S.horizon} anni (orizzonte di base)`],
            ['Avvio', `${m.startYear ?? '—'}${m.dueDate ? ` · entro il ${dateIt(m.dueDate)}` : ''}${m.completedAt ? ` · completata il ${dateIt(m.completedAt)}` : ''}`],
            m.note ? ['Nota', m.note] : null,
            ['Evidenze', <EvidenceCount d={d} type="measures" refId={m.id} />],
          ]} />
          <Lineage item={lin} label="Come è stimata" />
        </div>
        <div>
          <Kv items={[
            ['Costo annuo equivalente', `${eurTxt(e.annualCost)} (CRF ${n(e.crf, 4)} su ${e.life} anni al ${n(e.rate * 100, 1)}%)`],
            ['Costo di abbattimento', e.mac != null ? `${n(e.mac)} €/t CO₂e${ic?.value > 0 ? `; con l’incentivo ${n(ei.mac)} €/t` : ''}` : '—'],
            ['Tempo di ritorno', e.payback != null ? `${n(e.payback, 1)} anni${ic?.value > 0 && ei.payback != null ? `; con l’incentivo ${n(ei.payback, 1)} anni` : ''}` : 'nessun ritorno economico diretto'],
            ['VAN senza prezzo del carbonio', eurTxt(e.npvNoCarbon)],
            ['VAN al prezzo interno', `${eurTxt(e.npv)} a ${n(model.S.carbonPrice)} €/t${ic?.value > 0 ? `; con l’incentivo ${eurTxt(ei.npv)}` : ''}`],
            ['Incentivo', ic ? incentiveText(ic, m) : incLabel(m.incentive)],
          ]} />
          {ic && (ic.kind === 'iper' || ic.kind === 'TEE') && <p className="xs muted epi-mt">Stima indicativa, non consulenza fiscale.</p>}
        </div>
      </div>}
    </Panel>
  );
}
function incentiveText(ic, m) {
  if (ic.kind === 'iper') {
    if (ic.ineligible) return `${incLabel(m.incentive)}: non applicabile (${ic.reason})`;
    return `${ic.green ? 'Iperammortamento green' : 'Iperammortamento'} ${n(ic.rate * 100)}% → maggiorazione ${eurTxt(ic.uplift)}, valore fiscale attuale ${eurTxt(ic.value)}${m.incentive === 'iper-green' && !ic.green ? ' (prova del risparmio non superata o non calcolabile)' : ''}`;
  }
  if (ic.kind === 'TEE') return `${n(ic.toe, 1)} tep l’anno: ${ic.eligible ? 'sopra' : 'sotto'} la soglia di ${ic.min} tep${ic.price != null ? `; ${eurTxt(ic.annual)} l’anno` : '; prezzo dei TEE da indicare'}`;
  return `${incLabel(ic.kind)}: scheda di ammissibilità nella sezione Incentivi`;
}

/* ================= curva dei costi ================= */
export function Macc({ d, P, model }) {
  const S = model.S;
  const [price, setPrice] = useState(S.carbonPrice);
  const [inc, setInc] = useState(S.withIncentives ? 'si' : 'no');
  const rows = model.live.filter(x => x.status !== 'completata' && !x.noCo2 && !x.mbOnly).map(x => { const ec = inc === 'si' ? x.econInc : x.econ; return { id: x.id, label: x.title, tco2: x.values.tco2Year, mac: ec.mac, status: x.status, ec, m: x }; });
  const c = useMemo(() => maccCurve(rows), [model, inc]);
  const pos = c.bars.filter(b => b.ec.npvAt(price) > 0);
  const savePrice = () => { setEsgSettings('piano', { carbonPrice: price }, `Piano · prezzo interno del carbonio ${price} €/t`); undoToast('Prezzo interno salvato'); };
  return (
    <>
      <Panel title="Curva dei costi di abbattimento" sub="Larghezza = t CO₂e l’anno, altezza = € per t CO₂e; sotto il prezzo del carbonio il VAN è positivo · misure non completate"
        actions={<Seg options={[{ id: 'no', label: 'Senza incentivi' }, { id: 'si', label: 'Con incentivi' }]} value={inc} onChange={setInc} label="Incentivi" />}>
        <div className="epi-slider no-print">
          <label htmlFor="epi-price" className="small">Prezzo del carbonio</label>
          <input id="epi-price" type="range" min="0" max="300" step="5" value={price} onChange={e => setPrice(+e.target.value)} />
          <span className="epi-strong">{n(price)} €/t</span>
          {price !== S.carbonPrice && <Btn small kind="ghost" icon={LuSave} onClick={savePrice}>Usa come prezzo interno</Btn>}
        </div>
        {c.bars.length ? <>
          <MaccChart bars={c.bars} price={price} />
          <div className="epi-legend"><span><i className="epi-sw epi-bar-ok" />sotto il prezzo: VAN positivo</span><span><i className="epi-sw epi-bar-ko" />sopra il prezzo</span><span><i className="epi-sw-l" />prezzo del carbonio {n(price)} €/t</span></div>
          <p className="small epi-mt">A {n(price)} €/t: {pos.length} {pos.length === 1 ? 'misura' : 'misure'} su {c.bars.length} con VAN positivo, {n(pos.reduce((s, b) => s + b.tco2, 0), 1)} t CO₂e l’anno su {n(c.total, 1)}; {n(c.saving, 1)} t CO₂e l’anno fanno anche risparmiare.</p>
        </> : <Empty title="Nessuna misura con riduzione e costo">Aggiungi misure con t CO₂e l’anno e investimento (o stimate dalla libreria).</Empty>}
        {c.excluded.length > 0 && <p className="xs muted">Fuori dalla curva: {c.excluded.map(x => x.label).join(', ')} (riduzione o costo mancanti).</p>}
      </Panel>
      {c.bars.length > 0 && <Panel title="Misure in ordine di costo" flush>
        <Table rows={c.bars.map((b, i) => ({ ...b, rank: i + 1 }))} exportName="feedos-piano-curva-costi" pageSize={30} cols={[
          { key: 'rank', label: 'N.', align: 'r' },
          { key: 'label', label: 'Misura', render: r => <span className="epi-wrap">{r.label}</span> },
          { key: 'status', label: 'Stato', render: r => <MeasureState s={r.status} /> },
          { key: 'tco2', label: 't CO₂e/anno', align: 'r', render: r => n(r.tco2, 1) },
          { key: 'mac', label: '€/t CO₂e', align: 'r', render: r => n(r.mac) },
          { key: 'npv', label: `VAN a ${n(price)} €/t`, csvLabel: 'VAN al prezzo scelto', align: 'r', render: r => eurTxt(r.ec.npvAt(price)), csv: r => r.ec.npvAt(price), sort: r => r.ec.npvAt(price) },
          { key: 'payback', label: 'Ritorno', align: 'r', render: r => (r.ec.payback != null ? `${n(r.ec.payback, 1)} anni` : '—'), csv: r => r.ec.payback, sort: r => r.ec.payback },
        ]} />
      </Panel>}
      <Parametri d={d} S={S} />
      <Disclaimer />
    </>
  );
}

function Parametri({ d, S }) {
  const [v, setV] = useState({ carbonPrice: S.carbonPrice, discountRate: S.discountRate * 100, horizon: S.horizon, ires: S.ires * 100, ets: S.ets2Prices.join(', '), withIncentives: S.withIncentives === true });
  const save = () => {
    const ets = String(v.ets).split(/[;,\s]+/).map(x => +x.replace(',', '.')).filter(x => Number.isFinite(x) && x >= 0).slice(0, 5);
    setEsgSettings('piano', { carbonPrice: v.carbonPrice, discountRate: (v.discountRate ?? 6) / 100, horizon: v.horizon, ires: (v.ires ?? 24) / 100, ets2Prices: ets.length ? ets : [45, 60, 100], withIncentives: !!v.withIncentives }, 'Piano · parametri economici');
    undoToast('Parametri salvati');
  };
  return (
    <Panel title="Parametri economici" sub="Valgono per tutte le misure, la curva dei costi, l’ETS2 e il piano; il prezzo interno è usato anche dalla scheda Clima">
      <div className="form">
        <Field label="Prezzo interno del carbonio (€/t CO₂e)"><NumInput value={v.carbonPrice} decimals={0} min={1} onChange={x => setV(o => ({ ...o, carbonPrice: x ?? 80 }))} /></Field>
        <Field label="Tasso di sconto (%)"><NumInput value={v.discountRate} decimals={1} min={0} max={30} onChange={x => setV(o => ({ ...o, discountRate: x }))} /></Field>
        <Field label="Orizzonte se manca la vita utile (anni)"><NumInput value={v.horizon} decimals={0} min={1} max={40} onChange={x => setV(o => ({ ...o, horizon: x ?? 10 }))} /></Field>
        <Field label="Aliquota IRES (%)"><NumInput value={v.ires} decimals={1} min={0} max={60} onChange={x => setV(o => ({ ...o, ires: x }))} /></Field>
        <Field label="Prezzi di scenario ETS2 (€/t)"><input className="input" value={v.ets} onChange={e => setV(o => ({ ...o, ets: e.target.value }))} /></Field>
        <Field label="Economia delle misure"><label className="row small epi-check-l"><input type="checkbox" checked={!!v.withIncentives} onChange={e => setV(o => ({ ...o, withIncentives: e.target.checked }))} /> con gli incentivi stimati</label></Field>
      </div>
      <div className="epi-btns epi-mt"><Btn small kind="primary" icon={LuSave} onClick={save}>Salva i parametri</Btn></div>
    </Panel>
  );
}

/* ================= incentivi ================= */
export function Incentivi({ d, P, model, today }) {
  const ip = model.inc.iper, r = ip.rule || {}, dt = r.dates || {};
  const ms = model.measures.filter(m => m.incentiveCalc?.kind === 'iper' && !m.incentiveCalc.ineligible);
  const notOk = model.measures.filter(m => m.incentiveCalc?.ineligible);
  const tees = model.measures.filter(m => m.incentiveCalc?.kind === 'TEE');
  const others = model.measures.filter(m => m.incentive === 'conto-termico' || m.incentive === 'sabatini');
  const tee = model.inc.tee || {};
  const [teePrice, setTeePrice] = useState(model.S.teePrice);
  const totVal = ms.reduce((s, m) => s + (m.incentiveCalc.value || 0), 0);
  const bandsG = iperUplift(ip.total, true, r.bands || []);
  const dates = [['Ordine accettato e acconto del 20%', dt.orderBy], ['Consegna dei beni ordinati con acconto', dt.deliverBy], ['Ultimo termine per gli investimenti', dt.investBy]].filter(x => x[1]);
  const Src = ({ rule }) => <p className="xs muted epi-mt">{rule?.law} · {String(rule?.source || '').split(' · ')[0]} · valido al {dateIt(rule?.validAsOf || '2026-10-21')} <StatusChip status={rule?.status} /></p>;
  return (
    <>
      <p className="note small">Stima indicativa, non consulenza fiscale: importi e ammissibilità vanno confermati con il consulente fiscale e, per la maggiorazione green, con un EGE o una ESCo.</p>
      <div className="kpis">
        <Kpi label="Investimenti con iperammortamento" value={n(ip.total)} unit="€" foot={`${ms.length} ${ms.length === 1 ? 'misura' : 'misure'} tra il 2026 e il 2028`} />
        <Kpi label="Valore fiscale stimato" value={n(totVal)} unit="€" foot={`attuale, IRES ${n(model.S.ires * 100)}% su ${r.deprYears || 5} anni`} />
        <Kpi label="Prossima scadenza" value={dates.find(x => x[1] >= today) ? dateIt(dates.find(x => x[1] >= today)[1]) : '—'} foot={dates.find(x => x[1] >= today)?.[0] || 'nessuna scadenza aperta'} />
      </div>
      <Panel title="Iperammortamento 2026-2028" sub={r.note} flush>
        {ms.length ? <Table rows={ms} exportName="feedos-piano-iperammortamento" pageSize={20} cols={[
          { key: 'title', label: 'Misura', render: m => <span className="epi-wrap">{m.title}</span> },
          { key: 'startYear', label: 'Avvio' },
          { key: 'capex', label: 'Investimento', align: 'r', className: 'epi-nw', render: m => eurTxt(m.values.capex), csv: m => m.values.capex },
          { key: 'test', label: 'Prova del risparmio', render: m => { const g = m.incentiveCalc.test; return m.incentiveCalc.selfGen ? 'autoproduzione (fino al 105% del fabbisogno)' : g?.known ? `${pctTxt(g.pctUnit, 1)} dell’unità locale${g.pctProcess != null ? `, ${pctTxt(g.pctProcess, 1)} del processo` : ''}: ${g.pass ? 'superata' : 'non superata'}` : 'non calcolabile'; }, csv: m => (m.incentiveCalc.test?.pass ? 'superata' : 'no') },
          { key: 'rate', label: 'Maggiorazione', align: 'r', render: m => `${n(m.incentiveCalc.rate * 100)}%${m.incentiveCalc.green ? ' green' : ''}`, csv: m => m.incentiveCalc.rate },
          { key: 'value', label: 'Valore fiscale', align: 'r', render: m => eurTxt(m.incentiveCalc.value), csv: m => m.incentiveCalc.value, sort: m => m.incentiveCalc.value },
        ]} /> : <Empty title="Nessuna misura con iperammortamento">Indica l’incentivo «iper-green» o «iper-base» sulle misure con beni 4.0 avviate tra il 2026 e il 2028.</Empty>}
        <div className="epi-pad epi-pad-b">
          <div className="split">
            <div>
              <h3 className="epi-h3">Scaglioni sull’investimento complessivo</h3>
              <Table rows={bandsG.rows.map((b, i) => ({ ...b, id: i, base: (r.bands || [])[i]?.base }))} pageSize={10} cols={[
                { key: 'to', label: 'Scaglione', nosort: true, render: b => `${n(b.from / 1e6, 1)}-${n(b.to / 1e6, 1)} M€` },
                { key: 'base', label: 'Base', align: 'r', nosort: true, render: b => `${n(b.base * 100)}%` },
                { key: 'rateApplied', label: 'Green', align: 'r', nosort: true, render: b => `${n(b.rateApplied * 100)}%` },
                { key: 'part', label: 'Investimento nello scaglione', align: 'r', nosort: true, render: b => eurTxt(b.part) },
              ]} />
            </div>
            <div>
              <h3 className="epi-h3">Scadenze</h3>
              <Kv items={dates.map(([l, x]) => [l, `${dateIt(x)}${x >= today ? ` · tra ${daysBetween(today, x)} giorni` : ' · passata'}`])} />
              {notOk.length > 0 && <p className="small muted epi-mt">Non ammesse: {notOk.map(m => `${m.title} (${m.incentiveCalc.reason})`).join('; ')}.</p>}
            </div>
          </div>
          <Src rule={r} />
        </div>
      </Panel>
      <Panel title="Certificati bianchi (TEE)" sub={tee.note}>
        <div className="epi-btns epi-inline">
          <Field label="Prezzo dei TEE (€ per certificato)"><NumInput value={teePrice} decimals={0} min={0} onChange={setTeePrice} /></Field>
          <Btn small kind="ghost" icon={LuSave} disabled={teePrice === model.S.teePrice} onClick={() => { setEsgSettings('piano', { teePrice: teePrice ?? null }, 'Piano · prezzo dei certificati bianchi'); undoToast('Prezzo dei TEE salvato'); }}>Salva il prezzo</Btn>
        </div>
        {tees.length ? <Table rows={tees} pageSize={10} cols={[
          { key: 'title', label: 'Misura', render: m => <span className="epi-wrap">{m.title}</span> },
          { key: 'toe', label: 'tep l’anno', align: 'r', render: m => n(m.incentiveCalc.toe, 1) },
          { key: 'el', label: 'Soglia', render: m => `${m.incentiveCalc.eligible ? 'sopra' : 'sotto'} ${m.incentiveCalc.min} tep` },
          { key: 'v', label: 'Valore attuale', align: 'r', render: m => (m.incentiveCalc.price != null ? eurTxt(m.incentiveCalc.value) : 'prezzo da indicare') },
        ]} /> : <p className="small muted">Nessuna misura con i certificati bianchi.</p>}
        <p className="xs muted">tep = MWh elettrici × {tee.toe?.mwhEl ?? 0.187} + migliaia di Sm³ di gas × {tee.toe?.kSmcGas ?? 0.82} + t di GPL × {tee.toe?.tGpl ?? 1.1}; fattori da verificare nella guida GSE.</p>
        <Src rule={tee} />
      </Panel>
      <div className="split">
        {['conto-termico', 'sabatini'].map(id => {
          const R = ruleOf(d, id);
          const mm = others.filter(m => m.incentive === id);
          return (
            <Panel key={id} title={R?.title || incLabel(id)} sub={R?.note}>
              <ul className="epi-list">{(R?.checklist || []).map(c => <li key={c}>{c}</li>)}</ul>
              <p className="small epi-mt">{mm.length ? `Misure interessate: ${mm.map(m => m.title).join('; ')}.` : 'Nessuna misura con questo incentivo.'}</p>
              <Src rule={R} />
            </Panel>
          );
        })}
      </div>
      <Disclaimer />
    </>
  );
}
const ruleOf = (d, id) => pianoPack(d).items.find(x => x && x.id === id) || PACK_PIANO.items.find(x => x.id === id) || null;

/* ================= finanziamenti ================= */
export function Finanziamenti({ d, P, model, today }) {
  const [form, setForm] = useState(null);
  const [kpiFor, setKpiFor] = useState(null);
  const loans = model.sll;
  const save = (v, id) => {
    if (id) store.batch([{ kind: 'update', coll: 'sllLoans', id, patch: v }], `Piano · finanziamento modificato: ${v.bank}`);
    else store.batch([{ kind: 'add', coll: 'sllLoans', obj: { ...v, kpis: [], testDates: [] } }], `Piano · nuovo finanziamento: ${v.bank}`);
    setForm(null); undoToast(id ? 'Finanziamento aggiornato' : 'Finanziamento aggiunto: aggiungi i KPI');
  };
  const remove = s => confirm('Eliminare il finanziamento?', `${s.bank}: i KPI e le date di verifica non saranno più seguiti.`, () => { store.batch([{ kind: 'remove', coll: 'sllLoans', id: s.id }], `Piano · finanziamento eliminato: ${s.bank}`); undoToast('Finanziamento eliminato'); }, { danger: true, ok: 'Elimina' });
  const pack = s => downloadText(`finanziamento-${s.id}`, 'json', JSON.stringify({ loan: { bank: s.bank, amount: s.amount, marginBps: s.marginBps, ratchetBps: s.ratchetBps, testDates: s.loan.testDates, verifier: s.loan.verifier || '' }, period: { key: P.key, from: P.from, to: P.to },
    kpis: s.kpis.map(k => ({ metric: k.metric, label: k.label, unit: k.unit, current: k.current, quality: k.quality, history: k.history, spt: k.spt, nextSpt: k.nextSpt, met: k.outcome.met, bps: k.bps, eur: k.eur })), totalBps: s.bps, totalEur: s.eur, rule: 'LMA Sustainability-Linked Loan Principles 2025' }, null, 2), 'application/json');
  return (
    <>
      <div className="epi-btns"><Btn small kind="primary" icon={LuPlus} onClick={() => setForm('nuovo')}>Nuovo finanziamento</Btn></div>
      {form === 'nuovo' && <Panel title="Nuovo finanziamento legato alla sostenibilità"><EntityForm coll="sllLoans" d={d} rec={{ ratchetBps: 5 }} saveLabel="Aggiungi" onSave={v => save(v)} onCancel={() => setForm(null)} /></Panel>}
      {!loans.length && form !== 'nuovo' && <Panel title="Finanziamenti legati alla sostenibilità"><Empty icon={LuLandmark} title="Nessun finanziamento registrato">Un finanziamento legato alla sostenibilità ha KPI con un obiettivo annuo (SPT) e uno scatto del margine: FeedOS segue i valori, le date di verifica e l’effetto in euro.</Empty></Panel>}
      {loans.map(s => (
        <Panel key={s.id} title={`${s.bank} · ${eurTxt(s.amount)}`} sub={`Margine ${n(s.marginBps, 0)} punti base, scatto ± ${n(s.ratchetBps, 1)} punti base ripartito sui KPI · prossima verifica ${s.nextTest ? dateIt(s.nextTest) : '—'}${s.daysToTest != null ? ` (tra ${s.daysToTest} giorni)` : ''}`}
          actions={<><Btn small kind="ghost" icon={LuDownload} onClick={() => pack(s)}>Pacchetto per il verificatore</Btn><Btn small kind="ghost" icon={LuPencil} title="Modifica" onClick={() => setForm(s.id)} /><Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={() => remove(s)} /></>} flush>
          {form === s.id && <div className="epi-pad"><EntityForm coll="sllLoans" d={d} rec={d.sllLoans.find(x => x.id === s.id)} saveLabel="Salva" onSave={v => save(v, s.id)} onCancel={() => setForm(null)} /></div>}
          <div className="kpis epi-pad">
            <Kpi label="Effetto sul margine" value={n(s.eur)} unit="€/anno" foot={`${s.bps > 0 ? '+' : s.bps < 0 ? '−' : ''}${n(Math.abs(s.bps), 2)} punti base sui valori del ${P.label}`} />
            <Kpi label="Effetto massimo" value={n(s.maxEur)} unit="€/anno" foot="tutti i KPI mancati o tutti raggiunti" />
          </div>
          <Table rows={s.kpis} rowKey={k => k.metric} pageSize={10} exportName={`feedos-finanziamento-${s.id}`} cols={[
            { key: 'label', label: 'KPI', render: k => <><span className="epi-strong">{k.label}</span><span className="sub">{k.unit}</span></>, csv: k => k.label },
            { key: 'years', label: 'Storico', render: k => <>{k.years} {k.years === 1 ? 'anno' : 'anni'}{!k.enoughHistory && <span className="sub">ne servono almeno 3</span>}</>, csv: k => k.years },
            { key: 'current', label: 'Attuale', align: 'r', render: k => <>{withUnit(k.current, k.unit, k.M.dec)}<span className="sub">{k.quality}</span></>, csv: k => k.current },
            { key: 'spt', label: 'Obiettivo dell’anno', align: 'r', render: k => (k.spt ? `${withUnit(k.spt.value, k.unit, k.M.dec)} (${k.spt.year})` : '—'), csv: k => k.spt?.value },
            { key: 'met', label: 'Esito', render: k => (k.outcome.met == null ? 'non valutabile' : k.outcome.met ? 'raggiunto' : 'mancato'), csv: k => k.outcome.met },
            { key: 'eur', label: '€/anno', align: 'r', render: k => n(k.eur), csv: k => k.eur },
            { key: 'next', label: 'Prossimo obiettivo', align: 'r', render: k => (k.nextSpt ? `${withUnit(k.nextSpt.value, k.unit, k.M.dec)} (${k.nextSpt.year})${k.nextOutcome?.met === false ? ' · a rischio' : ''}` : '—'), csv: k => k.nextSpt?.value },
          ]} />
          <div className="epi-pad">
            <div className="epi-charts">{s.kpis.map(k => <KpiChart key={k.metric} k={k} />)}</div>
            <KpiEditor d={d} P={P} s={s} open={kpiFor === s.id} onToggle={() => setKpiFor(kpiFor === s.id ? null : s.id)} />
          </div>
        </Panel>
      ))}
      <p className="xs muted">Principi LMA per i finanziamenti legati alla sostenibilità (marzo 2025): KPI rilevanti, obiettivi annuali calibrati, almeno 3 anni di storico raccomandati, verifica esterna annuale.</p>
    </>
  );
}

function KpiChart({ k }) {
  const years = [...new Set([...k.history.map(h => h.year), ...k.spts.map(s => s.year)])].sort((a, b) => a - b);
  if (years.length < 2) return null;
  const hv = new Map(k.history.map(h => [h.year, h.value])), sv = new Map(k.spts.map(s => [s.year, s.value]));
  return (
    <div className="epi-chart">
      <span className="small muted">{k.label} · {k.unit}</span>
      <LineChart height={160} labels={years.map(String)} unit={k.unit} decimals={k.M.dec} area={false} markLast ariaLabel={`${k.label}: storico e obiettivi annui`}
        series={[{ key: 'h', label: 'Valore', color: 'var(--s1)', values: years.map(y => hv.get(y) ?? null) }, { key: 's', label: 'Obiettivo (SPT)', color: 'var(--ink-2)', values: years.map(y => sv.get(y) ?? null), dashed: true }]} />
      <Legend items={[{ label: 'Valore', color: 'var(--s1)' }, { label: 'Obiettivo dell’anno', color: 'var(--ink-2)' }]} line />
    </div>
  );
}

/** KPI e date di verifica di un finanziamento: aggiunta e rimozione (un passo annullabile per azione). */
function KpiEditor({ d, P, s, open, onToggle }) {
  const metrics = metricsFor(d);
  const base = s.kpis[0]?.spts?.[0]?.year ?? +P.to.slice(0, 4);
  const [metric, setMetric] = useState(metrics[0]?.id);
  const [spt, setSpt] = useState([null, null, null]);
  const [date, setDate] = useState('');
  const loan = d.sllLoans.find(x => x.id === s.id);
  if (!loan) return null;
  const addKpi = () => {
    const sp = Object.fromEntries(spt.map((v, i) => [base + i, v]).filter(([, v]) => v != null));
    store.batch([{ kind: 'update', coll: 'sllLoans', id: s.id, patch: { kpis: [...(loan.kpis || []).filter(k => k.metric !== metric), { metric, spt: sp }] } }], `Piano · KPI del finanziamento ${s.bank}: ${METRICS[metric]?.label}`);
    setSpt([null, null, null]); undoToast('KPI aggiunto');
  };
  const delKpi = m => { store.batch([{ kind: 'update', coll: 'sllLoans', id: s.id, patch: { kpis: (loan.kpis || []).filter(k => k.metric !== m) } }], `Piano · KPI tolto dal finanziamento ${s.bank}`); undoToast('KPI tolto'); };
  const addDate = () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; store.batch([{ kind: 'update', coll: 'sllLoans', id: s.id, patch: { testDates: [...new Set([...(loan.testDates || []), date])].sort() } }], `Piano · data di verifica ${dateIt(date)} (${s.bank})`); setDate(''); undoToast('Data aggiunta'); };
  const delDate = x => { store.batch([{ kind: 'update', coll: 'sllLoans', id: s.id, patch: { testDates: (loan.testDates || []).filter(t => t !== x) } }], `Piano · data di verifica tolta (${s.bank})`); undoToast('Data tolta'); };
  return (
    <details className="epi-edit" open={open} onToggle={e => { if (e.currentTarget.open !== open) onToggle(); }}>
      <summary>KPI e date di verifica</summary>
      <div className="epi-edit-b">
        <ul className="epi-list">{(loan.kpis || []).map(k => <li key={k.metric}>{METRICS[k.metric]?.label || k.metric}: {Object.entries(k.spt || {}).map(([y, v]) => `${y} ${withUnit(v, METRICS[k.metric]?.unit, METRICS[k.metric]?.dec ?? 1)}`).join(' · ') || 'nessun obiettivo annuo'} <Btn small kind="ghost" icon={LuTrash2} title="Togli il KPI" onClick={() => delKpi(k.metric)} /></li>)}</ul>
        <div className="form">
          <Field label="KPI"><Select value={metric} onChange={setMetric} options={metrics.map(x => ({ id: x.id, label: `${x.label} (${x.unit})` }))} /></Field>
          {[0, 1, 2].map(i => <Field key={i} label={`Obiettivo ${base + i}`}><NumInput value={spt[i]} decimals={2} onChange={x => setSpt(a => a.map((y, j) => (j === i ? x : y)))} /></Field>)}
        </div>
        <div className="epi-btns epi-mt"><Btn small kind="ghost" icon={LuPlus} onClick={addKpi} disabled={!metric}>Aggiungi o sostituisci il KPI</Btn></div>
        <ul className="epi-list epi-mt">{(loan.testDates || []).map(x => <li key={x}>{dateIt(x)} <Btn small kind="ghost" icon={LuTrash2} title="Togli la data" onClick={() => delDate(x)} /></li>)}</ul>
        <div className="epi-btns"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} aria-label="Data di verifica" /><Btn small kind="ghost" icon={LuPlus} onClick={addDate} disabled={!date}>Aggiungi la data</Btn></div>
      </div>
    </details>
  );
}
