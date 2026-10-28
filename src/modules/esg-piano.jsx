/* FeedOS 18 · ESG › Obiettivi e piano (pacchetto WP7 «piano»): sottosezioni obiettivi · misure · macc · roadmap · incentivi ·
 * finanziamenti · ets2 · piano (#esg.piano.<id>). Visibile in FeedOS e in DifesaOS: testi neutri, misure del settore dell'archivio.
 * Contratto: PianoPage({ d, route }) disegna la scheda (titolo e schede li disegna esg.jsx); PianoCard({ d }) è il riquadro del
 * cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Prefisso CSS e DOM epi-. Ogni scrittura è un solo
 * store.batch con un'etichetta italiana. */
import React, { useMemo, useState } from 'react';
import { LuTarget, LuPlus, LuImport, LuTrash2, LuPencil, LuPrinter, LuDownload, LuFileText, LuLink, LuSave } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { dateIt } from '../core/util.js';
import { currentPeriod, periodByKey } from '../engine/esg-years.js';
import { planModel, pianoSignals, progressSeries, roadmap, ets2Plan, transitionPlan, planMarkdown, referenceTarget, kpiTargets, metricsFor, METRICS, PIANO_METHOD,
  esgThresholds, pianoSettings, reductionPct, ESG_THRESHOLDS } from '../engine/esg-piano.js';
import { baseYearStatus } from '../engine/esg-clima.js';
import { Panel, Kpi, Table, Btn, Field, NumInput, Select, Seg, Empty, Kv, Chip, confirm } from '../ui/ui.jsx';
import { LineChart, Columns, Legend } from '../ui/charts.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, QualityChip, StatusChip, MethodNote, Disclaimer, EsgCard, setEsgSettings } from './esg-shared.jsx';
import { Misure, Macc, Incentivi, Finanziamenti } from './esg-piano-misure.jsx';
import { n, eurTxt, pctTxt, withUnit, fin, downloadCsv, downloadText, TargetState, MeasureState, ProgressBar, authorNow } from './esg-piano-ui.jsx';

const SECTIONS = [['obiettivi', 'Obiettivi'], ['misure', 'Misure'], ['macc', 'Curva dei costi'], ['roadmap', 'Tabella di marcia'], ['incentivi', 'Incentivi'],
  ['finanziamenti', 'Finanziamenti'], ['ets2', 'ETS2'], ['piano', 'Piano di transizione']];
const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
const GHG = new Set(['s12-abs', 's12-t', 's3-t', 'flag-abs']);

/** Scheda ESG › Obiettivi e piano. */
export function PianoPage({ d, route }) {
  const sub = SECTIONS.some(([id]) => id === route?.id) ? route.id : 'obiettivi';
  const { P, prev, setKey } = useEsgPeriod(d);
  const model = useMemo(() => planModel(d, P), [d, P.key]);
  const today = appToday(d);
  const sig = useMemo(() => pianoSignals(d, { today }), [d, today]);
  const badge = id => { const k = sig.filter(s => s.link?.id === id && s.severity !== 'info').length; return k || null; };
  const props = { d, P, prev, model, today, sig };
  return (
    <div className="epi" id="epi-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge(id) }))} value={sub} tab="piano" label="Sezioni di Obiettivi e piano" />
      {!model ? <Panel title="Obiettivi e piano"><Empty icon={LuTarget} title="Periodo non valido">Scegli un esercizio ESG.</Empty></Panel> : <>
        {sub === 'obiettivi' && <Obiettivi {...props} />}
        {sub === 'misure' && <Misure {...props} />}
        {sub === 'macc' && <Macc {...props} />}
        {sub === 'roadmap' && <Roadmap {...props} />}
        {sub === 'incentivi' && <Incentivi {...props} />}
        {sub === 'finanziamenti' && <Finanziamenti {...props} />}
        {sub === 'ets2' && <Ets2 {...props} />}
        {sub === 'piano' && <Piano {...props} />}
      </>}
    </div>
  );
}

/** Riquadro del cruscotto ESG: obiettivo principale, avanzamento e copertura del piano. */
export function PianoCard({ d }) {
  const P = currentPeriod(d);
  const m = planModel(d, P);
  const t = m?.primary, g = t?.progress;
  if (!t) return <EsgCard title="Obiettivi e piano" tab="piano" icon={LuTarget} value="—" sub="Registra un obiettivo con anno base e traiettoria, poi le misure del piano." />;
  const sig = pianoSignals(d, { today: appToday(d) });
  const top = sig.find(x => x.severity === 'attenzione') || null;
  return (
    <EsgCard title="Obiettivi e piano" tab="piano" icon={LuTarget} value={g?.actual != null ? n(g.actual, t.M?.dec ?? 1) : '—'} unit={t.M?.unit}
      sub={`${t.label}: obiettivo ${withUnit(t.targetValue, t.M?.unit, t.M?.dec ?? 1)} nel ${t.targetYear}, ${g?.state === 'offTrack' ? 'in ritardo' : g?.state === 'unknown' ? 'valore attuale non disponibile' : g?.state === 'achieved' ? 'raggiunto' : 'in linea'}${m.coverage?.ratio != null ? ` · il piano copre il ${pctTxt(m.coverage.ratio)} della riduzione` : ''}`}>
      {top && <p className="epi-card-sig">{top.title}</p>}
    </EsgCard>
  );
}

/* ================= obiettivi ================= */
function Obiettivi({ d, P, prev, model, today }) {
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null); // null | 'nuovo' | id
  const ts = model.targets;
  const t = ts.find(x => x.id === sel) || model.primary || ts[0] || null;
  const g = t?.progress;
  const metrics = metricsFor(d);
  const sv = d.survey || {};
  const save = (v, rec) => {
    const obj = { ...v, type: v.type || METRICS[v.metric]?.type, pathway: 'lineare', reference: v.reference || 'interno' };
    if (rec?.id) store.batch([{ kind: 'update', coll: 'esgTargets', id: rec.id, patch: obj }], `Piano · obiettivo modificato: ${obj.title || METRICS[obj.metric]?.label}`);
    else store.batch([{ kind: 'add', coll: 'esgTargets', obj }], `Piano · nuovo obiettivo: ${obj.title || METRICS[obj.metric]?.label}`);
    setForm(null); undoToast(rec?.id ? 'Obiettivo aggiornato' : 'Obiettivo aggiunto');
  };
  const remove = x => confirm('Eliminare l’obiettivo?', `«${x.label}» non comparirà più nel piano né nel VS C3.`, () => { store.batch([{ kind: 'remove', coll: 'esgTargets', id: x.id }], `Piano · obiettivo eliminato: ${x.label}`); undoToast('Obiettivo eliminato'); }, { danger: true, ok: 'Elimina' });
  // importazione dal questionario ESG: riduzione % e anno, quota di fotovoltaico se citata nella descrizione
  const fromSurvey = () => {
    const pct = +sv['em-target-pct'], yr = Math.round(+sv['em-target-year']);
    const ops = [];
    const by = +P.to.slice(0, 4);
    if (pct > 0 && yr > by && !ts.some(x => x.metric === 's12-t')) ops.push({ kind: 'add', coll: 'esgTargets', obj: { title: `Scope 1 + 2 per tonnellata: −${pct}% entro il ${yr}`, metric: 's12-t', type: 'intensità', pathway: 'lineare', reference: 'interno', status: 'proposto', baseKey: P.key, baseYear: by, reductionPct: pct, targetYear: yr, note: 'Importato dal questionario ESG' } });
    const m = String(sv['em-target-desc'] || '').match(/(\d{1,3})\s*%[^.]*?(elettric|fotovolt)|fotovolt[^.]*?(\d{1,3})\s*%/i);
    const share = m ? +(m[1] || m[3]) : null;
    if (share > 0 && share <= 100 && yr > by && !ts.some(x => x.metric === 'ren-el')) ops.push({ kind: 'add', coll: 'esgTargets', obj: { title: `Elettricità rinnovabile al ${share}%`, metric: 'ren-el', type: 'quota', pathway: 'lineare', reference: 'interno', status: 'proposto', baseKey: P.key, baseYear: by, targetValue: share, targetYear: yr, note: 'Importato dal questionario ESG' } });
    if (!ops.length) { toast('Nel questionario non ci sono obiettivi nuovi da importare', 'err'); return; }
    store.batch(ops, 'Piano · obiettivi importati dal questionario ESG'); undoToast(`${ops.length === 1 ? 'Un obiettivo importato' : `${ops.length} obiettivi importati`}: indica il valore base se manca`);
  };
  const series = t ? progressSeries(d, t) : null;
  const cy = +P.to.slice(0, 4);
  const B = model.B;
  const refS12 = B.ok ? referenceTarget({ baseValue: B.s1 + B.s2, baseYear: cy, targetYear: cy + 5, kind: 's12' }) : null;
  const refFlag = B.ok && model.flag?.required ? referenceTarget({ baseValue: B.flag, baseYear: cy, targetYear: cy + 5, kind: 'flag' }) : null;
  const addRef = (metric, value, base, label) => { store.batch([{ kind: 'add', coll: 'esgTargets', obj: { title: label, metric, type: 'assoluto', pathway: 'lineare', reference: 'traiettoria SBTi (riferimento)', status: 'proposto', baseKey: P.key, baseYear: cy, baseValue: Math.round(base * 10) / 10, targetYear: cy + 5, targetValue: Math.round(value * 10) / 10, note: 'Traiettoria di riferimento ispirata ai criteri SBTi, non una validazione' } }], `Piano · proposta di riferimento: ${label}`); undoToast('Proposta aggiunta tra gli obiettivi'); };
  const kt = kpiTargets(d, cy);
  const linkKpi = x => {
    const k = x.M?.kpi, v = kt[k];
    if (!k || !v) return;
    store.batch([{ kind: 'settings', value: st => ({ ...st, targets: { ...(st?.targets || {}), [k]: { target: v.target, warn: v.warn } } }) }], `Piano · obiettivo del KPI ${x.M.label} dalla traiettoria ${cy}`);
    undoToast('Obiettivo del cruscotto aggiornato');
  };
  const clima = baseYearStatus(d);
  return (
    <>
      <div className="kpis" id="epi-kpis">
        <Kpi label={t ? t.label : 'Obiettivo principale'} value={g?.actual != null ? n(g.actual, t.M?.dec ?? 1) : '—'} unit={t?.M?.unit} foot={t ? `traiettoria ${withUnit(g?.path, t.M?.unit, t.M?.dec ?? 1)} · obiettivo ${withUnit(t.targetValue, t.M?.unit, t.M?.dec ?? 1)} nel ${t.targetYear}` : 'nessun obiettivo registrato'} />
        <Kpi label="Copertura del piano" value={model.coverage?.ratio != null ? n(model.coverage.ratio * 100) : '—'} unit="%" foot={model.coverage ? `misure approvate ${n(model.coverage.planned, 1)} t/anno su ${n(Math.max(0, model.coverage.needed), 1)} necessarie` : 'serve un obiettivo sulle emissioni con valore attuale'} />
        <Kpi label="Categoria SBTi stimata" value={model.sbti?.category || '—'} foot={model.sbti?.reason || ''} />
        <Kpi label="Quota FLAG" value={model.flag?.share != null ? n(model.flag.share * 100) : '—'} unit="%" foot={model.flag?.required ? 'serve un obiettivo FLAG' : 'sotto la soglia del 20%'} />
      </div>
      <Panel title="Obiettivi" sub={`${P.label} · valore attuale dai registri, traiettoria lineare dall’anno base all’anno obiettivo`} flush id="epi-targets"
        actions={<>{sv['em-target'] === 'si' && <Btn small kind="ghost" icon={LuImport} onClick={fromSurvey}>Importa dal questionario</Btn>}<Btn small kind="primary" icon={LuPlus} onClick={() => setForm('nuovo')}>Nuovo obiettivo</Btn></>}>
        {form === 'nuovo' && <div className="epi-pad"><EntityForm coll="esgTargets" d={d} rec={{ metric: metrics[0]?.id, status: 'proposto', reference: 'interno', baseKey: prev?.key || P.key, baseYear: prev ? +prev.to.slice(0, 4) : cy, targetYear: cy + 3 }} saveLabel="Aggiungi l’obiettivo" onSave={v => save(v)} onCancel={() => setForm(null)} /></div>}
        {form && form !== 'nuovo' && ts.find(x => x.id === form) && <div className="epi-pad"><EntityForm coll="esgTargets" d={d} rec={d.esgTargets.find(x => x.id === form)} saveLabel="Salva" onSave={v => save(v, { id: form })} onCancel={() => setForm(null)} /></div>}
        {!ts.length ? <Empty icon={LuTarget} title="Nessun obiettivo registrato">Un obiettivo ha una metrica (per esempio Scope 1 + 2 per tonnellata), un anno e un valore base, un anno e un valore obiettivo. {sv['em-target'] === 'si' ? 'Il questionario ESG ne cita già uno: usa «Importa dal questionario».' : ''}</Empty>
          : <Table rows={ts} onRow={r => setSel(r.id)} selected={t?.id} exportName="feedos-obiettivi" pageSize={20} cols={[
            { key: 'label', label: 'Obiettivo', render: r => <><span className="epi-strong">{r.label}</span><span className="sub">{r.M?.scope || r.metric}{r.status !== 'approvato' ? ` · ${r.status}` : ''}</span></>, csv: r => r.label },
            { key: 'base', label: 'Base', align: 'r', render: r => <>{withUnit(r.baseValue, r.M?.unit, r.M?.dec ?? 1)}<span className="sub">{r.baseYear ?? '—'}{r.baseFrom && r.baseFrom !== 'inserito' ? ` · ${r.baseFrom}` : ''}</span></>, csv: r => r.baseValue, sort: r => r.baseValue },
            { key: 'target', label: 'Obiettivo', align: 'r', render: r => <>{withUnit(r.targetValue, r.M?.unit, r.M?.dec ?? 1)}<span className="sub">{r.targetYear ?? '—'}</span></>, csv: r => r.targetValue, sort: r => r.targetYear },
            { key: 'actual', label: 'Attuale', align: 'r', render: r => <>{withUnit(r.progress.actual, r.M?.unit, r.M?.dec ?? 1)}<span className="sub">{r.progress.quality !== 'mancante' ? r.progress.quality : 'nessun dato'}</span></>, csv: r => r.progress.actual, sort: r => r.progress.actual },
            { key: 'path', label: 'Traiettoria', align: 'r', render: r => withUnit(r.progress.path, r.M?.unit, r.M?.dec ?? 1), csv: r => r.progress.path, sort: r => r.progress.path },
            { key: 'state', label: 'Stato', render: r => <TargetState s={r.progress.state} />, csv: r => r.progress.state, sort: r => r.progress.state },
            { key: 'done', label: 'Fatto', render: r => <ProgressBar value={r.progress.done} />, csv: r => r.progress.done, sort: r => r.progress.done },
            { key: 'act', label: '', nosort: true, csv: false, render: r => <span className="epi-row-act"><Btn small kind="ghost" icon={LuPencil} title="Modifica" onClick={e => { e.stopPropagation(); setForm(r.id); }} /><Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={e => { e.stopPropagation(); remove(r); }} /></span> },
          ]} />}
      </Panel>
      {t && series && <div className="split">
        <Panel title={`Andamento e traiettoria · ${t.label}`} sub={`${t.M?.unit || ''} · anno = anno di fine dell’esercizio · traiettoria ${t.reference && t.reference !== 'interno' ? 'di riferimento ispirata ai criteri SBTi, non una validazione' : 'lineare'}`}>
          {series.years.length > 1
            ? <LineChart labels={series.years.map(String)} unit={t.M?.unit} decimals={t.M?.dec ?? 1} markLast={false} area={false} ariaLabel={`Valori effettivi e traiettoria di ${t.label}`}
              series={[{ key: 'act', label: 'Effettivo', color: 'var(--s1)', values: series.actual }, { key: 'path', label: 'Traiettoria', color: 'var(--ink-2)', values: series.path, dashed: true }]}
              refs={t.targetValue != null ? [{ y: t.targetValue, label: `obiettivo ${n(t.targetValue, t.M?.dec ?? 1)}`, kind: 'muted' }] : []} />
            : <p className="small muted">Servono anno base e anno obiettivo per disegnare la traiettoria.</p>}
          <Legend items={[{ label: 'Effettivo (registri o storico dichiarato)', color: 'var(--s1)' }, { label: 'Traiettoria lineare', color: 'var(--ink-2)' }]} line />
        </Panel>
        <Panel title="Dettaglio dell’obiettivo">
          <Kv items={[
            ['Metrica', `${t.M?.label || t.metric} (${t.M?.unit || ''})`],
            ['Base', `${withUnit(t.baseValue, t.M?.unit, t.M?.dec ?? 1)} nel ${t.baseYear ?? '—'}${t.baseFrom ? ` (${t.baseFrom})` : ''}`],
            ['Obiettivo', `${withUnit(t.targetValue, t.M?.unit, t.M?.dec ?? 1)} nel ${t.targetYear ?? '—'}${t.targetFrom && t.targetFrom !== 'inserito' ? ` (${t.targetFrom})` : reductionPct(t) != null && t.M?.dir === 'down' ? ` (−${n(reductionPct(t) * 100, 1)}%)` : ''}`],
            ['Valore attuale', g?.actual != null ? <span>{withUnit(g.actual, t.M?.unit, t.M?.dec ?? 1)} <QualityChip q={g.quality} /></span> : 'non disponibile per il periodo'],
            ['Da dove viene', g?.method || '—'],
            ['Scarto dalla traiettoria', g?.gap != null ? `${g.gap > 0 ? '+' : '−'}${n(Math.abs(g.gap) * 100, 1)}% ${g.gap > 0.02 ? '(in ritardo)' : g.gap > 0 ? '(entro la tolleranza del 2%)' : '(in anticipo)'}` : '—'],
            ['Ritmo necessario', g?.needRate != null ? `${g.needRate > 0 ? '+' : '−'}${n(Math.abs(g.needRate) * 100, 1)}% l’anno per ${g.yearsLeft} ${g.yearsLeft === 1 ? 'anno' : 'anni'}` : '—'],
            ['Stato', `${t.status || 'proposto'}${t.approvedAt ? ` il ${dateIt(t.approvedAt)}` : ''}${t.approvedBy ? ` da ${t.approvedBy}` : ''}`],
            t.note ? ['Nota', t.note] : null,
          ]} />
          {GHG.has(t.metric) && clima.set && t.baseYear != null && clima.period && +clima.period.to.slice(0, 4) !== t.baseYear && <p className="note small epi-mt">L’anno base dell’inventario della scheda Clima è {clima.period.label}: l’obiettivo usa il {t.baseYear}. Se si ricalcola l’anno base dell’inventario, rivedere anche il valore base dell’obiettivo.</p>}
          {t.M?.kpi && kt[t.M.kpi] && <div className="epi-btns epi-mt"><Btn small kind="ghost" icon={LuLink} onClick={() => linkKpi(t)}>Usa la traiettoria {cy} come obiettivo del KPI nel cruscotto</Btn></div>}
        </Panel>
      </div>}
      <div className="split">
        <Panel title="Categoria SBTi" sub="Corporate Net-Zero Standard V2: stima dai dati, da verificare sui criteri pubblicati">
          {model.sbti ? <>
            <p className="epi-lead">Categoria stimata <span className="epi-strong">{model.sbti.category}</span>: {model.sbti.reason}{model.sbti.provisional ? '; mancano dati per escludere la categoria A' : ''}.</p>
            <Table rows={model.sbti.tests} rowKey={r => r.id} pageSize={10} cols={[
              { key: 'label', label: 'Soglia', nosort: true },
              { key: 'value', label: 'Valore', align: 'r', nosort: true, render: r => (r.value == null ? 'non noto' : r.id === 'fte' ? n(r.value) : r.id === 's12' ? `${n(r.value)} t` : eurTxt(r.value)) },
              { key: 'met', label: 'Superata', nosort: true, render: r => (r.value == null ? '—' : r.met ? 'sì' : 'no') },
            ]} />
            <p className="small muted epi-mt">{model.sbti.category === 'A' ? 'Categoria A: obiettivi anche sullo Scope 3, piano di transizione pubblicato e verifica dell’anno base.' : 'Categoria B: obiettivi Scope 1 + 2 e impegno sulle principali voci dello Scope 3, con requisiti semplificati.'} Valida dal {dateIt(model.sbti.rule?.v2From || '2027-02-01')}; fino al {dateIt(model.sbti.rule?.v1Until || '2028-01-31')} si può usare la versione 1. <StatusChip status={model.sbti.rule?.status || 'da verificare'} /></p>
          </> : <Empty title="Servono i dati dell’inventario" />}
        </Panel>
        <Panel title="FLAG e zero deforestazione" sub="Emissioni dei terreni agricoli: cambio d’uso e gestione del suolo delle materie prime">
          {model.flag ? <Kv items={[
            ['Quota FLAG', `${pctTxt(model.flag.share)} del totale (${n(model.flag.flag)} t CO₂e su ${n(model.flag.total)})`],
            ['Obiettivo FLAG', model.flag.required ? (model.flag.hasTarget ? 'registrato' : 'necessario, non ancora registrato') : 'non necessario (sotto il 20%)'],
            ['Impegno di zero deforestazione', model.flag.required ? `entro il ${dateIt(model.flag.deadline)}${model.flag.fromSubmission ? ' (2 anni dalla presentazione)' : ' (al più tardi)'}` : '—'],
            ['Materie prime interessate', (model.sbti?.rule?.flag?.commodities || []).join(', ')],
          ]} /> : <Empty title="Servono i dati dell’inventario" />}
          <p className="small muted epi-mt">{model.sbti?.rule?.source?.split(' · ')[1] || ''} · valido al {dateIt(model.sbti?.rule?.validAsOf || '2026-10-21')}</p>
        </Panel>
      </div>
      <Panel title="Proposte di riferimento" sub="Traiettorie lineari ispirate ai criteri SBTi sul periodo attuale come base, a cinque anni: non sono una validazione">
        {B.ok ? <div className="epi-refs">
          {refS12 && <div className="epi-ref"><span className="epi-strong">Scope 1 + 2 assoluto</span><span className="small">{n(B.s1 + B.s2)} t CO₂e nel {cy} → {n(refS12.value)} t nel {cy + 5} (−{n(refS12.rate * 100, 1)}% l’anno sul valore base)</span>
            <Btn small kind="ghost" icon={LuPlus} onClick={() => addRef('s12-abs', refS12.value, B.s1 + B.s2, `Scope 1 + 2: −${n(refS12.reduction * 100)}% al ${cy + 5} (riferimento)`)}>Aggiungi come proposta</Btn></div>}
          {refFlag && <div className="epi-ref"><span className="epi-strong">FLAG assoluto</span><span className="small">{n(B.flag)} t CO₂e nel {cy} → {n(refFlag.value)} t nel {cy + 5} (−{n(refFlag.rate * 100, 2)}% l’anno)</span>
            <Btn small kind="ghost" icon={LuPlus} onClick={() => addRef('flag-abs', refFlag.value, B.flag, `FLAG: −${n(refFlag.reduction * 100, 1)}% al ${cy + 5} (riferimento)`)}>Aggiungi come proposta</Btn></div>}
        </div> : <Empty title="Servono i dati dell’inventario del periodo" />}
      </Panel>
      <Soglie d={d} />
      <MethodNote text={PIANO_METHOD} />
    </>
  );
}

/** Soglie dei criteri ESG usate dalla maturità e dai segnali (quota fotovoltaica, recupero, formazione, aumento dell'acqua). */
function Soglie({ d }) {
  const th = esgThresholds(d);
  const [v, setV] = useState(th);
  const changed = Object.keys(th).some(k => th[k] !== v[k]);
  const save = () => { setEsgSettings('piano', { targets: { pvShare: v.pvShare, recovery: v.recovery, trainingH: v.trainingH, waterDrift: v.waterDrift } }, 'Piano · soglie dei criteri ESG'); undoToast('Soglie salvate'); };
  const F = (k, label, scale, dec) => <Field label={label}><NumInput value={v[k] != null ? v[k] * scale : null} decimals={dec} onChange={x => setV(o => ({ ...o, [k]: x == null ? ESG_THRESHOLDS[k] : x / scale }))} /></Field>;
  return (
    <Panel title="Soglie dei criteri ESG" sub="Usate dalla maturità del Cruscotto ESG e dai segnali sull’acqua: valgono per tutto l’archivio">
      <div className="form">
        {F('pvShare', 'Quota di elettricità rinnovabile (%)', 100, 0)}
        {F('recovery', 'Rifiuti avviati a recupero (%)', 100, 0)}
        {F('trainingH', 'Ore di formazione per dipendente', 1, 0)}
        {F('waterDrift', 'Aumento dell’acqua per tonnellata che fa scattare il segnale (%)', 100, 0)}
      </div>
      <div className="epi-btns epi-mt"><Btn small kind="primary" icon={LuSave} disabled={!changed} onClick={save}>Salva le soglie</Btn></div>
    </Panel>
  );
}

/* ================= tabella di marcia ================= */
function Roadmap({ d, P, model, today }) {
  const ghg = model.targets.filter(t => GHG.has(t.metric) && t.status !== 'ritirato');
  const [tid, setTid] = useState(model.primary && GHG.has(model.primary.metric) ? model.primary.id : ghg[0]?.id);
  const rm = useMemo(() => roadmap(model, tid), [model, tid]);
  const caps = model.capexByYear;
  const ms = [...model.live].filter(m => m.status !== 'completata').sort((a, b) => (a.startYear ?? 9999) - (b.startYear ?? 9999) || String(a.title).localeCompare(String(b.title), 'it'));
  const t = rm?.target;
  return (
    <>
      {rm ? <>
        <div className="kpis">
          <Kpi label="Divario chiuso dalle misure approvate" value={n(Math.min(9.99, rm.gapClosed) * 100)} unit="%" foot={`al ${t.targetYear}: ${withUnit(rm.endPlanned, t.M.unit, t.M.dec)} contro l’obiettivo ${withUnit(t.targetValue, t.M.unit, t.M.dec)}`} />
          <Kpi label="Con le idee" value={n(Math.min(9.99, rm.gapClosedIdeas) * 100)} unit="%" foot={`${withUnit(rm.endIdeas, t.M.unit, t.M.dec)} al ${t.targetYear}`} />
          <Kpi label="Investimenti previsti" value={n(rm.years.reduce((s, y) => s + y.capex, 0))} unit="€" foot={`dal ${rm.years[0].year} al ${rm.years[rm.years.length - 1].year}`} />
        </div>
        <Panel title="Emissioni attese e traiettoria" sub={`${t.label} · ${t.M.unit} · una misura vale per intero dall’anno dopo l’avvio; le misure completate sono già nel valore attuale`}
          actions={ghg.length > 1 && <Select className="slim auto" value={tid} onChange={setTid} options={ghg.map(x => ({ id: x.id, label: x.label }))} ariaLabel="Obiettivo" />}>
          <LineChart labels={rm.years.map(y => String(y.year))} unit={t.M.unit} decimals={t.M.dec} area={false} markLast={false} ariaLabel="Emissioni attese con il piano e traiettoria"
            series={[{ key: 'path', label: 'Traiettoria', color: 'var(--ink-2)', values: rm.years.map(y => y.path), dashed: true }, { key: 'plan', label: 'Con le misure approvate', color: 'var(--s1)', values: rm.years.map(y => y.planned) },
              { key: 'ideas', label: 'Con anche le idee', color: 'var(--s3)', values: rm.years.map(y => y.withIdeas), dashed: true }]} />
          <Legend items={[{ label: 'Traiettoria', color: 'var(--ink-2)' }, { label: 'Con le misure approvate o in corso', color: 'var(--s1)' }, { label: 'Con anche le idee', color: 'var(--s3)' }]} line />
        </Panel>
      </> : <Panel title="Tabella di marcia"><Empty icon={LuTarget} title="Serve un obiettivo sulle emissioni con valore attuale">Registra un obiettivo su Scope 1 + 2 o FLAG nella sezione Obiettivi: la tabella di marcia confronta le misure con la traiettoria.</Empty></Panel>}
      <Panel title="Investimenti per anno di avvio" sub="€ · misure approvate o in corso e idee; le completate restano nell’anno in cui sono state fatte">
        {caps.length ? <>
          <Columns ariaLabel="Investimenti per anno" unit="€" cols={caps.map(c => ({ label: String(c.year), parts: [{ key: 'done', value: c.done }, { key: 'active', value: c.active }, { key: 'idea', value: c.idea }] }))}
            keys={[{ key: 'done', label: 'Completate', color: 'var(--line-2)' }, { key: 'active', label: 'Approvate o in corso', color: 'var(--s1)' }, { key: 'idea', label: 'Idee', color: 'var(--s3)' }]} />
          <Legend items={[{ label: 'Completate', color: 'var(--line-2)' }, { label: 'Approvate o in corso', color: 'var(--s1)' }, { label: 'Idee', color: 'var(--s3)' }]} />
        </> : <Empty title="Nessun investimento con anno di avvio" />}
      </Panel>
      <Panel title="Calendario delle misure" flush>
        <Table rows={ms} exportName="feedos-piano-calendario" pageSize={30} cols={[
          { key: 'startYear', label: 'Avvio', render: r => r.startYear ?? '—' },
          { key: 'title', label: 'Misura', render: r => <span className="epi-wrap">{r.title}</span> },
          { key: 'status', label: 'Stato', render: r => <MeasureState s={r.status} /> },
          { key: 'dueDate', label: 'Entro', render: r => (r.dueDate ? <>{dateIt(r.dueDate)}{r.dueDate < today && (r.status === 'approvata' || r.status === 'in corso') && <span className="sub epi-late">in ritardo</span>}</> : '—'), csv: r => r.dueDate || '' },
          { key: 't', label: 't CO₂e/anno', align: 'r', render: r => n(r.values.tco2Year, 1), csv: r => r.values.tco2Year, sort: r => r.values.tco2Year },
          { key: 'capex', label: 'Investimento', align: 'r', render: r => eurTxt(r.values.capex), csv: r => r.values.capex, sort: r => r.values.capex },
          { key: 'owner', label: 'Responsabile', render: r => r.owner || '—' },
        ]} />
      </Panel>
    </>
  );
}

/* ================= ETS2 ================= */
function Ets2({ d, P, model }) {
  const e = useMemo(() => ets2Plan(d, P), [d, P.key]);
  if (!e || !(e.annualTCO2 > 0)) return <Panel title="ETS2"><Empty title="Nessun combustibile nell’ambito dell’ETS2 nel periodo">L’ETS2 riguarda gas, GPL, gasolio e benzina per edifici, trasporto e piccola industria dal {e?.start || 2028}: servono i consumi di combustibili della scheda Clima.</Empty></Panel>;
  const ps = e.prices, y0 = e.years[0];
  const mid = y0.scenarios[Math.floor((y0.scenarios.length - 1) / 2)];
  const FUEL = { gas: 'Gas naturale', gpl: 'GPL', gasolio: 'Gasolio', benzina: 'Benzina' };
  const rows = e.years.flatMap(y => y.scenarios.map(s => ({ id: `${y.year}-${s.price}`, year: y.year, price: s.price, base: s.base, plan: s.plan, ideas: s.ideas })));
  return (
    <>
      <div className="kpis">
        <Kpi label="CO₂ fossile nell’ETS2" value={n(e.annualTCO2)} unit="t/anno" foot={`dal ${e.start}, combustibili per vapore, flotta e carrelli`} />
        <Kpi label={`Costo ${e.start} a ${n(mid.price)} €/t`} value={n(mid.base)} unit="€" foot={`con il piano ${eurTxt(mid.plan)}`} />
        <Kpi label="Al prezzo interno" value={n(y0.internal.base)} unit="€" foot={`${n(y0.internal.price)} €/t CO₂e`} />
        <Kpi label="Riduzione dalle misure" value={n(y0.cut, 1)} unit="t/anno" foot={`con anche le idee ${n(y0.cutIdeas, 1)} t`} />
      </div>
      <div className="split">
        <Panel title="Costo annuo per scenario di prezzo" sub="€ l’anno · senza piano, con le misure approvate o in corso, con anche le idee">
          <Columns ariaLabel="Costo ETS2 per scenario" unit="€" cols={y0.scenarios.map(s => ({ label: `${n(s.price)} €/t`, parts: [{ key: 'plan', value: s.plan }, { key: 'cut', value: s.base - s.plan }] }))}
            keys={[{ key: 'plan', label: 'Con il piano', color: 'var(--s1)' }, { key: 'cut', label: 'Evitato dalle misure', color: 'var(--line-2)' }]} />
          <Legend items={[{ label: 'Costo con il piano', color: 'var(--s1)' }, { label: 'Evitato dalle misure', color: 'var(--line-2)' }]} />
        </Panel>
        <Panel title="Combustibili interessati">
          <Kv items={Object.entries(e.byFuel || {}).map(([f, t]) => [FUEL[f] || f, `${n(t * 12 / Math.max(1, e.months), 1)} t CO₂ l’anno`])} />
          <p className="small muted epi-mt">{e.note}</p>
          <p className="small muted">{e.rule?.law} · {e.rule?.source} · valido al {dateIt(e.rule?.validAsOf || '2026-10-21')} <StatusChip status={e.rule?.status} /></p>
        </Panel>
      </div>
      <Panel title="Esposizione dal 2028" flush>
        <Table rows={rows} exportName="feedos-piano-ets2" pageSize={20} cols={[
          { key: 'year', label: 'Anno' }, { key: 'price', label: '€/t', align: 'r', render: r => n(r.price) },
          { key: 'base', label: 'Senza piano €', align: 'r', render: r => n(r.base) }, { key: 'plan', label: 'Con il piano €', align: 'r', render: r => n(r.plan) }, { key: 'ideas', label: 'Con anche le idee €', align: 'r', render: r => n(r.ideas) },
        ]} />
      </Panel>
      {e.measures.length > 0 && <Panel title="Misure sui combustibili" flush>
        <Table rows={e.measures} pageSize={20} cols={[{ key: 'title', label: 'Misura', render: r => <span className="epi-wrap">{r.title}</span> }, { key: 'status', label: 'Stato', render: r => <MeasureState s={r.status} /> },
          { key: 'startYear', label: 'Avvio' }, { key: 't', label: 't CO₂e/anno', align: 'r', render: r => n(r.values.tco2Year, 1), sort: r => r.values.tco2Year }]} />
      </Panel>}
      <Disclaimer />
    </>
  );
}

/* ================= piano di transizione ================= */
function Piano({ d, P, model }) {
  const [lang, setLang] = useState('it');
  const S = pianoSettings(d);
  const tp = useMemo(() => transitionPlan(d, P, lang), [d, P.key, lang]);
  const [f, setF] = useState({ planApprovedAt: S.planApprovedAt || '', planApprover: S.planApprover || '', planOwner: S.planOwner || '', verifier: S.verifier || '', verifiedAt: S.verifiedAt || '', planVerified: S.planVerified === true });
  const dirty = ['planApprovedAt', 'planApprover', 'planOwner', 'verifier', 'verifiedAt'].some(k => (f[k] || '') !== (S[k] || '')) || f.planVerified !== (S.planVerified === true);
  const save = () => {
    if (f.planVerified && !f.verifier.trim()) { toast('Per segnare il piano come verificato serve il nome del verificatore', 'err'); return; }
    setEsgSettings('piano', { planApprovedAt: f.planApprovedAt || null, planApprover: f.planApprover.trim(), planOwner: f.planOwner.trim(), verifier: f.verifier.trim(), verifiedAt: f.verifiedAt || null, planVerified: !!f.planVerified }, `Piano · approvazione e verifica del piano (${authorNow()})`);
    undoToast('Piano aggiornato');
  };
  const co = d.settings?.company?.name || '';
  const md = () => downloadText(`piano-transizione-${lang}`, 'md', planMarkdown(tp, co), 'text/markdown');
  const json = () => downloadText('piano-transizione', 'json', JSON.stringify({ period: { key: P.key, from: P.from, to: P.to, label: P.label }, plan: tp, targets: model.targets.map(t => ({ id: t.id, metric: t.metric, baseYear: t.baseYear, baseValue: t.baseValue, targetYear: t.targetYear, targetValue: t.targetValue, actual: t.progress.actual, path: t.progress.path, state: t.progress.state })),
    measures: model.measures.map(m => ({ id: m.id, title: m.title, status: m.status, startYear: m.startYear, tco2Year: m.values.tco2Year, capex: m.values.capex, savingsEur: m.values.savingsEur, opexDelta: m.values.opexDelta, mac: m.econ.mac, npv: m.econ.npv, from: m.from })), settings: { carbonPrice: S.carbonPrice, discountRate: S.discountRate } }, null, 2), 'application/json');
  const C = tp.complete;
  return (
    <>
      <Panel title="Completezza del piano (VS C3)" sub="Obiettivi con base e anno, azioni, approvazione; la verifica di terzi serve per gli impegni futuri nelle dichiarazioni ambientali">
        <ul className="epi-check">
          {[['Obiettivo Scope 1 + 2 con base e anno obiettivo', C.targets], ['Almeno un’azione approvata, in corso o completata', C.actions], ['Piano approvato (data e organo)', C.governance], ['Piano verificato da terzi', C.verified]].map(([l, ok]) => <li key={l} className={ok ? 'epi-ok' : 'epi-ko'}>{ok ? 'Sì' : 'No'} · {l}</li>)}
        </ul>
        {!C.verified && <p className="small muted epi-mt">Senza verifica di terzi il controllo delle dichiarazioni (scheda Governance) blocca frasi come «ridurremo del 30% entro il 2030».</p>}
      </Panel>
      <Panel title="Approvazione e verifica">
        <div className="form">
          <Field label="Approvato il"><input type="date" className="input" value={f.planApprovedAt || ''} onChange={e => setF(o => ({ ...o, planApprovedAt: e.target.value }))} /></Field>
          <Field label="Approvato da"><input className="input" value={f.planApprover} maxLength={80} onChange={e => setF(o => ({ ...o, planApprover: e.target.value }))} placeholder="Consiglio di amministrazione" /></Field>
          <Field label="Responsabile dell’attuazione"><input className="input" value={f.planOwner} maxLength={80} onChange={e => setF(o => ({ ...o, planOwner: e.target.value }))} /></Field>
          <Field label="Verificatore esterno"><input className="input" value={f.verifier} maxLength={80} onChange={e => setF(o => ({ ...o, verifier: e.target.value }))} /></Field>
          <Field label="Verificato il"><input type="date" className="input" value={f.verifiedAt || ''} onChange={e => setF(o => ({ ...o, verifiedAt: e.target.value }))} /></Field>
          <Field label="Verifica di terzi"><label className="row small epi-check-l"><input type="checkbox" checked={!!f.planVerified} onChange={e => setF(o => ({ ...o, planVerified: e.target.checked }))} /> piano verificato</label></Field>
        </div>
        <div className="epi-btns epi-mt"><Btn small kind="primary" icon={LuSave} disabled={!dirty} onClick={save}>Salva</Btn></div>
      </Panel>
      <div className="epi-btns no-print">
        <Seg options={[{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }]} value={lang} onChange={setLang} label="Lingua del piano" />
        <Btn small icon={LuPrinter} onClick={printNow}>Stampa o PDF</Btn>
        <Btn small kind="ghost" icon={LuFileText} onClick={md}>Markdown</Btn>
        <Btn small kind="ghost" icon={LuDownload} onClick={json}>JSON</Btn>
      </div>
      <PrintPage title={tp.title} period={P} className="epi-sheet" footer={tp.disclaimer}>
        <div className="epi-print" id="epi-plan">
          <p className="epi-lead">{tp.sub}</p>
          {tp.sections.map(s => <section key={s.id}><h3>{s.title}</h3><ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></section>)}
        </div>
      </PrintPage>
      <MethodNote text={PIANO_METHOD} lang={lang} />
    </>
  );
}
