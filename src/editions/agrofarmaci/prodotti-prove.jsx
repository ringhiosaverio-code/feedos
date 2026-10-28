/* DifesaOS · Prodotti › Prove di campo: archivio delle prove (protocollo, tesi, rilievi per ripetizione), analisi della varianza con
 * le lettere di significatività, efficacia di Abbott, resa, foto e conclusioni. I calcoli stanno in engine/agro-prove.js. */
import React, { useMemo, useState } from 'react';
import { LuSprout, LuPlus, LuCheck, LuRotateCcw, LuTrash2, LuFileText, LuClipboardList } from 'react-icons/lu';
import { store, toast } from '../../core/store.js';
import { go } from '../../core/router.js';
import { nf, dateIt, byId, uid, slug } from '../../core/util.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Select, Field, NumInput, Drawer, Kv, Empty, confirm } from '../../ui/ui.jsx';
import { Bars } from '../../ui/charts.jsx';
import { TRIAL_VARS, THESIS_KIND, TRIAL_STATUS, VERDICT, trialAnalysis, trialSummary, trialStatus, trialKpis, ilPct } from '../../engine/agro-prove.js';
import { labelDose } from '../../engine/agro-risparmi.js';
import { PhotoGrid, AddPhotos } from './photos.jsx';

const ST_KIND = { pianificata: 'outline', 'in corso': 'warn', conclusa: 'good' };
const V_KIND = { superiore: 'good', equivalente: 'accent', inferiore: 'crit' };
const TH_COLOR = { testimone: 'var(--muted)', proprio: 'var(--s3)', altro: 'var(--s4)', riferimento: 'var(--s1)' };
const FILTERS = [{ id: 'tutte', label: 'Tutte' }, { id: 'conclusa', label: 'Concluse' }, { id: 'in corso', label: 'In corso' }, { id: 'pianificata', label: 'Pianificate' }];
const pctTxt = v => (v == null ? '—' : `${nf(v)}%`);
const varTxt = (v, x) => (x == null ? '—' : `${nf(x, v.unit === 't/ha' ? 1 : x < 10 ? 1 : 0)}${v.unit === '%' ? '%' : ` ${v.unit}`}`);
const assessLabel = a => `${dateIt(a.date, 'dm')} · ${a.v?.short || a.variable}${a.organ ? ` ${a.organ}` : ''}${a.bbch ? ` (${a.bbch})` : ''}`;

export function Prove({ d, route, today }) {
  const [flt, setFlt] = useState('tutte');
  const [creating, setCreating] = useState(false);
  const prods = byId(d.products || []);
  const K = useMemo(() => trialKpis(d, today), [d, today]);
  const all = useMemo(() => (d.fieldTrials || []).map(t => ({ ...t, st: trialStatus(t, today), s: trialSummary(t), nPh: (d.photos || []).filter(x => x.trialId === t.id).length })), [d, today]);
  const rows = all.filter(r => flt === 'tutte' || r.st === flt);
  const sel = (d.fieldTrials || []).find(t => t.id === route.id);
  return (
    <>
      <div className="kpis">
        <Kpi label="Prove in archivio" value={nf(K.n)} foot={`${nf(K.concluded)} concluse, ${nf(K.running)} in corso, ${nf(K.planned)} pianificate`} />
        <Kpi label="Efficacia media dei prodotti aziendali" value={K.effOwn == null ? '—' : nf(K.effOwn)} unit={K.effOwn == null ? '' : '%'} foot="Abbott sul testimone, rilievo principale" />
        <Kpi label="Pari o migliori del riferimento" value={K.withRef ? `${nf(K.okVsRef)}/${nf(K.withRef)}` : '—'} foot="LSD protetta al 5%" status={K.withRef ? (K.okVsRef === K.withRef ? 'ok' : 'warn') : null} />
        <Kpi label="Foto delle prove" value={nf(K.photos)} foot="si stampano nel report del prodotto" />
      </div>
      <Panel title="Prove di campo" sub="Clic su una prova per protocollo, rilievi con statistica, foto e conclusioni" id="prove-list" flush
        actions={<div className="row gap-s"><Seg options={FILTERS} value={flt} onChange={setFlt} label="Stato delle prove" /><Btn small kind="primary" icon={LuPlus} onClick={() => setCreating(true)}>Nuova prova</Btn></div>}>
        <Table rows={rows} selected={sel?.id} onRow={r => go('prodotti', 'prove', r.id)} initialSort={{ key: 'season', dir: 'desc' }} exportName="prove-di-campo" empty="Nessuna prova con questo stato" cols={[
          { key: 'code', label: 'Prova', render: r => <span><b>{r.code}</b><div className="muted small">{r.site?.place}{r.site?.region ? `, ${r.site.region}` : ''}</div></span> },
          { key: 'season', label: 'Stagione', align: 'r' },
          { key: 'cropName', label: 'Coltura e avversità', render: r => <span>{r.cropName}<div className="muted small">{String(r.pest || '').split(' (')[0]}</div></span>, csv: r => `${r.cropName} · ${r.pest}` },
          { key: 'product', label: 'Prodotto', sort: r => prods[r.productId]?.name, render: r => prods[r.productId]?.name || '—', csv: r => prods[r.productId]?.name || '' },
          { key: 'st', label: 'Stato', render: r => <Chip kind={ST_KIND[r.st]}>{TRIAL_STATUS[r.st] || r.st}</Chip> },
          { key: 'effOwn', label: 'Efficacia', align: 'r', sort: r => r.s.effOwn ?? -1, render: r => pctTxt(r.s.effOwn), csv: r => r.s.effOwn },
          { key: 'effRef', label: 'Riferimento', align: 'r', sort: r => r.s.effRef ?? -1, render: r => pctTxt(r.s.effRef), csv: r => r.s.effRef },
          { key: 'verdict', label: 'Esito', sort: r => r.s.verdict || '', render: r => (r.s.verdict ? <Chip kind={V_KIND[r.s.verdict]}>{VERDICT[r.s.verdict]}</Chip> : '—'), csv: r => r.s.verdict || '' },
          { key: 'nPh', label: 'Foto', align: 'r' },
        ]} />
      </Panel>
      {sel && <TrialDrawer d={d} t={sel} today={today} />}
      {creating && <NewTrial d={d} today={today} onClose={() => setCreating(false)} />}
    </>
  );
}

/* ---------------- scheda della prova ---------------- */
function TrialDrawer({ d, t, today }) {
  const prods = byId(d.products || []);
  const rows = useMemo(() => trialAnalysis(t), [t]);
  const s = useMemo(() => trialSummary(t), [t]);
  const [aid, setAid] = useState(null);
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState(t.conclusions || '');
  const [phThesis, setPhThesis] = useState('');
  const cur = rows.find(r => r.id === aid) || s.main || rows[rows.length - 1] || null;
  const st = trialStatus(t, today);
  const photos = (d.photos || []).filter(x => x.trialId === t.id);
  const p = prods[t.productId];
  const close = () => go('prodotti', 'prove');
  const setStatus = status => { store.update('fieldTrials', t.id, { status }, `Prova ${t.code}: ${TRIAL_STATUS[status].toLowerCase()}`); toast(`Prova ${TRIAL_STATUS[status].toLowerCase()}`, 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const saveNotes = () => { store.update('fieldTrials', t.id, { conclusions: notes.trim() }, `Conclusioni della prova ${t.code}`); toast('Conclusioni salvate', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const remove = () => confirm(`Eliminare la prova ${t.code}?`, <p>Si eliminano protocollo, rilievi e le schede delle sue {nf(photos.length)} foto. Si può annullare subito dopo.</p>, () => {
    store.batch([{ kind: 'remove', coll: 'fieldTrials', id: t.id }, ...photos.map(x => ({ kind: 'remove', coll: 'photos', id: x.id }))], `Prova ${t.code} eliminata`);
    toast('Prova eliminata', 'ok', { label: 'Annulla', fn: () => store.undo() }); close();
  }, { ok: 'Elimina', danger: true });
  return (
    <Drawer title={`${t.code} · ${t.cropName}`} sub={`Prova di campo · ${String(t.pest || '').split(' (')[0]}`} icon={<LuSprout />} wide onClose={close}
      actions={<>
        {p && <Btn icon={LuFileText} onClick={() => go('prodotti', 'report', p.id)}>Report del prodotto</Btn>}
        {st !== 'conclusa' ? <Btn icon={LuCheck} onClick={() => setStatus('conclusa')}>Segna conclusa</Btn> : <Btn icon={LuRotateCcw} onClick={() => setStatus('in corso')}>Riapri</Btn>}
        <Btn kind="ghost" icon={LuTrash2} title="Elimina la prova" onClick={remove} />
      </>}>
      {s.effOwn != null && (
        <div className={`note ${s.verdict === 'inferiore' ? 'warn' : ''}`}>
          <b>{s.own?.label}</b>: efficacia {pctTxt(s.effOwn)} sul testimone{s.pressure != null ? ` (pressione: ${varTxt(s.main.v, s.pressure)} sul non trattato)` : ''}{s.effRef != null ? `, contro ${ilPct(s.effRef)} del riferimento` : ''}.
          {s.verdict && <> Esito: <b>{VERDICT[s.verdict].toLowerCase()}</b>.</>}
          {s.yield?.gainCtl != null && <> Resa {s.yield.gainCtl >= 0 ? '+' : ''}{nf(s.yield.gainCtl * 100)}% sul testimone.</>}
        </div>
      )}
      <Kv items={[
        ['Stato', TRIAL_STATUS[st] || st], ['Prodotto', p?.name || '—'], ['Coltura', t.cropName], ['Avversità', t.pest],
        ['Luogo', [t.site?.place, t.site?.region, t.site?.farm].filter(Boolean).join(' · ') || '—'],
        ['Periodo', `${dateIt(t.start)} – ${dateIt(t.end)}`],
        ['Disegno', `${t.design || 'blocchi randomizzati'}, ${nf(t.reps || 4)} ripetizioni${t.plotM2 ? `, parcelle da ${nf(t.plotM2)} m²` : ''}${t.volumeLHa ? `, ${nf(t.volumeLHa)} L d’acqua per ettaro` : ''}`],
        ['Linee guida', t.guideline || '—'], ['Centro di saggio', `${t.center || '—'}${t.gep ? ' · buone pratiche sperimentali (GEP)' : ''}`],
      ]} />
      <div className="dsec"><div className="eyebrow">Tesi</div>
        <Table rows={t.theses || []} pageSize={20} cols={[
          { key: 'id', label: 'Tesi' },
          { key: 'label', label: 'Trattamento', render: x => <span>{x.label}{x.competitor ? <div className="muted small">{x.competitor}</div> : null}</span> },
          { key: 'kind', label: 'Tipo', render: x => <Chip kind={x.kind === 'proprio' ? 'good' : x.kind === 'riferimento' ? 'accent' : 'outline'}>{THESIS_KIND[x.kind] || x.kind}</Chip> },
          { key: 'dose', label: 'Dose', align: 'r', render: x => (x.dose == null ? '—' : `${nf(x.dose, x.dose < 1 ? 2 : 1)} ${x.doseUnit || ''}`) },
          { key: 'apps', label: 'Trattamenti', align: 'r', render: x => (x.apps ? nf(x.apps) : '—') },
        ]} />
      </div>
      <div className="dsec">
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div className="eyebrow">Rilievi</div>
          <div className="row gap-s">
            {rows.length > 1 && <Select value={cur?.id || ''} onChange={setAid} options={rows.map(r => ({ id: r.id, label: assessLabel(r) }))} ariaLabel="Rilievo" />}
            <Btn small icon={LuClipboardList} onClick={() => setAdding(x => !x)}>{adding ? 'Chiudi il modulo' : 'Aggiungi rilievo'}</Btn>
          </div>
        </div>
        {adding && <AssessmentForm t={t} today={today} onDone={() => setAdding(false)} />}
        {cur ? <AssessmentView t={t} a={cur} /> : <p className="small muted">Nessun rilievo registrato: si aggiungono con i valori di ogni ripetizione.</p>}
      </div>
      <div className="dsec">
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div className="eyebrow">Foto ({nf(photos.length)})</div>
          <div className="row gap-s">
            <Select value={phThesis} onChange={setPhThesis} options={[{ id: '', label: 'Foto generale della prova' }, ...(t.theses || []).map(x => ({ id: x.id, label: `${x.id} · ${x.label}` }))]} ariaLabel="Tesi della foto" />
            <AddPhotos meta={{ trialId: t.id, thesisId: phThesis || null, productId: (t.theses || []).find(x => x.id === phThesis)?.productId || null, role: 'prova', date: today, caption: phThesis ? `${(t.theses || []).find(x => x.id === phThesis)?.label} (${t.code})` : `Prova ${t.code}` }} />
          </div>
        </div>
        <PhotoGrid photos={photos} editable empty="Nessuna foto: si caricano dal telefono o dal computer, con data e posizione dello scatto quando la foto le contiene." />
      </div>
      <div className="dsec"><div className="eyebrow">Conclusioni</div>
        <textarea className="input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Risultato e indicazione d’uso (entra nella scheda per i clienti)" aria-label="Conclusioni della prova" />
        <div className="row gap-s" style={{ justifyContent: 'flex-end', marginTop: 6 }}><Btn small kind="primary" disabled={notes.trim() === (t.conclusions || '')} onClick={saveNotes}>Salva le conclusioni</Btn></div>
        {t.author && <p className="small muted">Responsabile: {t.author}</p>}
      </div>
    </Drawer>
  );
}

/** Un rilievo: medie per tesi con le lettere, efficacia e statistica. */
function AssessmentView({ t, a }) {
  const an = a.an, v = a.v;
  const theses = (t.theses || []).filter(x => an?.means?.[x.id] != null);
  if (!an) return <p className="small muted">Servono almeno due tesi con valori e gradi di libertà per l’errore.</p>;
  return (
    <>
      <Bars data={theses.map(x => ({ key: x.id, label: `${x.id} ${x.label} · ${an.letters[x.id]}`, value: an.means[x.id], color: TH_COLOR[x.kind] || 'var(--s1)' }))}
        unit={v.unit === '%' ? '%' : v.unit} decimals={1} ariaLabel={`Medie del rilievo: ${v.label}`} labelW={260} />
      <Table rows={theses.map(x => ({ ...x, mean: an.means[x.id], sd: an.sd[x.id], eff: a.efficacy[x.id], vals: (a.values?.[x.id] || []).map(y => (y == null ? '—' : nf(y, 1))).join(' · ') }))} pageSize={20} cols={[
        { key: 'id', label: 'Tesi', render: x => <span><b>{x.id}</b> {x.label}</span> },
        { key: 'vals', label: 'Ripetizioni' },
        { key: 'mean', label: `Media ${v.unit === '%' ? '%' : v.unit}`, align: 'r', render: x => <span>{nf(x.mean, 1)} <b>{an.letters[x.id]}</b></span> },
        { key: 'sd', label: 'Dev. st.', align: 'r', render: x => (x.sd == null ? '—' : nf(x.sd, 1)) },
        ...(v.lower && !v.phyto ? [{ key: 'eff', label: 'Efficacia', align: 'r', render: x => (x.eff == null ? '—' : `${nf(x.eff)}%`) }] : []),
      ]} />
      <p className="small muted">{v.label}{a.organ ? ` su ${a.organ}` : ''}, {dateIt(a.date)}{a.bbch ? ` (${a.bbch})` : ''}. Analisi della varianza a {an.design}{an.transform === 'asin' ? ' sui dati trasformati (angolare)' : ''}:
        F = {nf(an.F, 1)} con {nf(an.dfT)} e {nf(an.dfE)} gradi di libertà, p {an.p < 0.001 ? '< 0,001' : `= ${nf(an.p, 3)}`}{an.lsd != null ? `; differenza minima significativa (5%) ${nf(an.lsd, 2)}${an.transform === 'asin' ? ' gradi' : ''}` : ''}; CV {nf(an.cv, 1)}%.
        Lettere uguali: differenza non significativa; con F non significativo tutte le tesi hanno la stessa lettera (LSD protetta).</p>
    </>
  );
}

/** Nuovo rilievo: valori per tesi e ripetizione. */
function AssessmentForm({ t, today, onDone }) {
  const reps = Math.max(2, +t.reps || 4);
  const [f, setF] = useState({ date: today, bbch: '', organ: '', variable: 'severita', main: false });
  const [vals, setVals] = useState(() => Object.fromEntries((t.theses || []).map(x => [x.id, Array(reps).fill(null)])));
  const set = (th, i, v) => setVals(o => ({ ...o, [th]: o[th].map((y, k) => (k === i ? v : y)) }));
  const filled = Object.values(vals).filter(a => a.some(v => v != null)).length;
  const save = () => {
    const values = Object.fromEntries(Object.entries(vals).filter(([, a]) => a.some(v => v != null)));
    const a = { id: uid('ril'), date: f.date, bbch: f.bbch.trim(), organ: f.organ.trim(), variable: f.variable, values, ...(f.main ? { main: true } : {}) };
    const assessments = [...(t.assessments || []).map(x => (f.main ? { ...x, main: false } : x)), a];
    store.update('fieldTrials', t.id, { assessments, ...(t.status === 'pianificata' ? { status: 'in corso' } : {}) }, `Rilievo della prova ${t.code}`);
    toast('Rilievo salvato', 'ok', { label: 'Annulla', fn: () => store.undo() });
    onDone();
  };
  return (
    <div className="pr-form">
      <div className="pr-form-grid">
        <Field label="Data"><input className="input" type="date" value={f.date} onChange={e => setF(x => ({ ...x, date: e.target.value }))} /></Field>
        <Field label="Variabile"><Select value={f.variable} onChange={v => setF(x => ({ ...x, variable: v }))} options={Object.entries(TRIAL_VARS).map(([id, v]) => ({ id, label: `${v.label} (${v.unit})` }))} /></Field>
        <Field label="Organo"><input className="input" value={f.organ} onChange={e => setF(x => ({ ...x, organ: e.target.value }))} placeholder="foglie, grappoli, frutti…" /></Field>
        <Field label="Stadio"><input className="input" value={f.bbch} onChange={e => setF(x => ({ ...x, bbch: e.target.value }))} placeholder="BBCH 75" /></Field>
      </div>
      <div className="tw"><table className="t pr-values">
        <thead><tr><th>Tesi</th>{Array.from({ length: reps }, (_, i) => <th key={i} className="r">Ripetizione {i + 1}</th>)}</tr></thead>
        <tbody>{(t.theses || []).map(x => (
          <tr key={x.id}><td><b>{x.id}</b> {x.label}</td>{vals[x.id].map((v, i) => <td key={i} className="r"><NumInput value={v} onChange={y => set(x.id, i, y)} decimals={1} slim min={0} ariaLabel={`${x.label}, ripetizione ${i + 1}`} /></td>)}</tr>
        ))}</tbody>
      </table></div>
      <label className="row gap-s small"><input type="checkbox" checked={f.main} onChange={e => setF(x => ({ ...x, main: e.target.checked }))} /> Rilievo principale della prova (quello che entra nel report)</label>
      <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
        <Btn small onClick={onDone}>Annulla</Btn>
        <Btn small kind="primary" disabled={filled < 2 || !f.date} onClick={save}>Salva il rilievo</Btn>
      </div>
    </div>
  );
}

/* ---------------- nuova prova ---------------- */
function NewTrial({ d, today, onClose }) {
  const own = (d.products || []).filter(p => p.active !== false && (p.actives || []).length);
  const year = +today.slice(0, 4);
  const [f, setF] = useState(() => ({ productId: own[0]?.id || '', cropName: '', pest: '', season: year, place: '', region: '', farm: '', start: today, end: `${year}-09-30`, reps: '4', plotM2: 40,
    dose: null, doseUnit: own[0]?.uom === 'L' ? 'L/ha' : 'kg/ha', apps: null, refLabel: '', refDose: null, competitor: '', guideline: 'EPPO PP 1/152, PP 1/181', gep: true }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const p = own.find(x => x.id === f.productId);
  const crops = [...new Set((d.regUses || []).filter(u => (d.registrations || []).some(r => r.id === u.registrationId && r.productId === f.productId)).map(u => u.cropName))];
  const save = () => {
    const yy = String(f.season).slice(2);
    const n = (d.fieldTrials || []).filter(t => String(t.season) === String(f.season)).length + 1;
    let code = `PC-${yy}-${String(n).padStart(2, '0')}`;
    for (let k = n + 1; (d.fieldTrials || []).some(t => t.code === code); k++) code = `PC-${yy}-${String(k).padStart(2, '0')}`;
    const crop = slug(String(f.cropName).split(/[\s(]/)[0] || 'coltura');
    const use = (d.regUses || []).find(u => u.cropName === f.cropName);
    const dose = f.dose ?? labelDose(d, f.productId, use?.crop) ?? null;
    const theses = [
      { id: 'T1', kind: 'testimone', productId: null, label: 'Testimone non trattato', dose: null, doseUnit: '', apps: 0 },
      { id: 'T2', kind: 'proprio', productId: f.productId, label: p?.name || 'Prodotto', dose, doseUnit: f.doseUnit, apps: f.apps, main: true },
      ...(f.refLabel.trim() ? [{ id: 'T3', kind: 'riferimento', productId: null, label: f.refLabel.trim(), dose: f.refDose, doseUnit: f.doseUnit, apps: f.apps, ...(f.competitor.trim() ? { competitor: f.competitor.trim() } : {}) }] : []),
    ];
    const id = uid('tr');
    store.add('fieldTrials', {
      id, code, season: +f.season, status: f.start > today ? 'pianificata' : 'in corso', productId: f.productId, crop, cropName: f.cropName.trim(), pest: f.pest.trim(),
      title: `${f.pest.trim().split(' (')[0]} su ${f.cropName.trim().split(' (')[0].toLowerCase()}: ${p?.name || ''}`, site: { place: f.place.trim(), region: f.region.trim(), farm: f.farm.trim() },
      design: 'blocchi randomizzati', reps: +f.reps, plotM2: f.plotM2, guideline: f.guideline.trim(), gep: !!f.gep, center: '', start: f.start, end: f.end, theses, assessments: [], conclusions: '', author: '',
    }, `Nuova prova ${code}`);
    toast(`Prova ${code} creata`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    onClose();
    go('prodotti', 'prove', id);
  };
  const ok = f.productId && f.cropName.trim() && f.pest.trim() && f.start && f.end && f.end >= f.start;
  return (
    <Drawer title="Nuova prova di campo" sub="Protocollo e tesi: testimone, prodotto e riferimento di mercato" icon={<LuSprout />} wide onClose={onClose}
      actions={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Crea la prova</Btn></>}>
      <div className="pr-form-grid">
        <Field label="Prodotto"><Select value={f.productId} onChange={v => set('productId', v)} options={own.map(x => ({ id: x.id, label: x.name }))} /></Field>
        <Field label="Coltura (e varietà)" hint={crops.length ? `In etichetta: ${crops.slice(0, 6).join(', ')}` : ''}><input className="input" list="pr-crops" value={f.cropName} onChange={e => set('cropName', e.target.value)} placeholder="Vite (Glera)" /><datalist id="pr-crops">{crops.map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Avversità"><input className="input" value={f.pest} onChange={e => set('pest', e.target.value)} placeholder="Peronospora (Plasmopara viticola)" /></Field>
        <Field label="Stagione"><NumInput value={f.season} onChange={v => set('season', v)} decimals={0} /></Field>
        <Field label="Luogo"><input className="input" value={f.place} onChange={e => set('place', e.target.value)} placeholder="Comune (provincia)" /></Field>
        <Field label="Regione"><input className="input" value={f.region} onChange={e => set('region', e.target.value)} /></Field>
        <Field label="Azienda agricola o centro"><input className="input" value={f.farm} onChange={e => set('farm', e.target.value)} /></Field>
        <Field label="Inizio"><input className="input" type="date" value={f.start} onChange={e => set('start', e.target.value)} /></Field>
        <Field label="Fine prevista"><input className="input" type="date" value={f.end} onChange={e => set('end', e.target.value)} /></Field>
        <Field label="Ripetizioni (blocchi)"><Seg options={['3', '4', '5', '6'].map(x => ({ id: x, label: x }))} value={f.reps} onChange={v => set('reps', v)} label="Ripetizioni" /></Field>
        <Field label="Parcella (m²)"><NumInput value={f.plotM2} onChange={v => set('plotM2', v)} decimals={0} /></Field>
        <Field label="Dose del prodotto" hint="Vuota: la dose media di etichetta della coltura"><div className="row gap-s"><NumInput value={f.dose} onChange={v => set('dose', v)} decimals={2} /><Select value={f.doseUnit} onChange={v => set('doseUnit', v)} options={['kg/ha', 'L/ha', 'g/hl', 'ml/hl'].map(x => ({ id: x, label: x }))} /></div></Field>
        <Field label="Trattamenti"><NumInput value={f.apps} onChange={v => set('apps', v)} decimals={0} /></Field>
        <Field label="Riferimento di mercato" hint="Vuoto: prova senza riferimento"><input className="input" value={f.refLabel} onChange={e => set('refLabel', e.target.value)} placeholder="Prodotto di confronto (sostanza e formulazione)" /></Field>
        <Field label="Dose del riferimento"><NumInput value={f.refDose} onChange={v => set('refDose', v)} decimals={2} /></Field>
        <Field label="Concorrente"><input className="input" value={f.competitor} onChange={e => set('competitor', e.target.value)} /></Field>
        <Field label="Linee guida"><input className="input" value={f.guideline} onChange={e => set('guideline', e.target.value)} /></Field>
        <Field label="Buone pratiche sperimentali"><label className="row gap-s small"><input type="checkbox" checked={f.gep} onChange={e => set('gep', e.target.checked)} /> prova GEP (centro di saggio riconosciuto)</label></Field>
      </div>
      <p className="small muted">Il disegno è a blocchi randomizzati; i rilievi si aggiungono dalla scheda della prova con un valore per ripetizione.</p>
    </Drawer>
  );
}

/** Pagina vuota guidata (archivio senza prove). */
export const NoTrials = () => <Empty icon={LuSprout} title="Nessuna prova di campo">Una prova ha protocollo, tesi (testimone, prodotto, riferimento) e rilievi per ripetizione: «Nuova prova» la crea.</Empty>;
