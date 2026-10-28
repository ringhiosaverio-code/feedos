/* FeedOS 18 · ESG › Report e questionari (pacchetto WP4 «report», scheda «vsme»).
 * Sezioni (route.id): esercizio (chiusura con impronta e quattro occhi, impostazioni), vsme (datapoint B1-B11 e C1-C9 con
 * copertura, qualità, fonte, risposte e omissioni motivate; #esg-vsme), bozza (rapporto IT/EN, stampa ed esportazioni),
 * banche (pacchetto per la banca, tavola PMI-Banche), questionari, materialita, storico (tre esercizi).
 * Contratto: ReportPage({ d, route }), ReportCard({ d }). Il periodo è l'esercizio ESG (mai usePeriod in quest'area). */
import React, { useMemo, useState } from 'react';
import { LuFileText, LuSnowflake, LuCircleCheck, LuShieldCheck, LuLockOpen, LuFingerprint, LuPencil, LuTrash2, LuSave, LuDownload, LuArrowRight } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { href } from '../core/router.js';
import { dateIt, nf } from '../core/util.js';
import { sha256Hex, canonicalJson } from '../core/hash.js';
import { naceOf, SECTORS, sectorOf, esgToday } from '../engine/esg-years.js';
import { vsmeReport, closeOps, hashOp, reviewOps, approveOps, reopenOps, frozenVsLive, closingPayload, closingRow, answerOps, reportSummary, SIGN_ROLES, REPORT_METHOD } from '../engine/esg-report.js';
import { itemText, sourceText, vsmeCsv } from '../engine/esg-report-text.js';
import { VS_DP, VS_SOURCE, OMISSION_REASONS } from '../data/vsme-datapoints.js';
import { Panel, Btn, Chip, Seg, Select, SearchBox, Empty, NumInput, Drawer, Kv, filterRows } from '../ui/ui.jsx';
import { EsgPeriodBar, EsgSubNav, QualityChip, StatusChip, Lineage, MethodNote, Disclaimer, EsgCard, setEsgSettings } from './esg-shared.jsx';
import { useReportPeriod, CovRing, DpStatus, ClosingChip, SignFields, tabLabel, save, pc } from './esg-report-ui.jsx';
import { Bozza, Banche, Storico } from './esg-report-docs.jsx';
import { Questionari, Materialita } from './esg-report-q.jsx';

const SUBS = [{ id: 'vsme', label: 'Datapoint VS' }, { id: 'esercizio', label: 'Esercizio e chiusura' }, { id: 'bozza', label: 'Rapporto' }, { id: 'banche', label: 'Banche' },
  { id: 'questionari', label: 'Questionari' }, { id: 'materialita', label: 'Materialità' }, { id: 'storico', label: 'Storico' }];

/** Scheda ESG › Report e questionari (id della scheda «vsme»). */
export function ReportPage({ d, route }) {
  const parts = String(route?.id || '').split('.');
  const sub = SUBS.some(s => s.id === parts[0]) ? parts[0] : 'vsme';
  const { P, setKey } = useReportPeriod(d);
  const rep = useMemo(() => vsmeReport(d, P), [d, P.key]);
  const sm = useMemo(() => reportSummary(d, P), [d, P.key]);
  const items = SUBS.map(s => ({ ...s, badge: s.id === 'vsme' ? (rep.gaps.length || null) : s.id === 'questionari' ? (sm.questionnaires.open || null) : null }));
  return (
    <div className="erp">
      <div className="erp-top">
        <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
        <div className="erp-strip" aria-label="Stato del rapporto">
          <ClosingChip status={rep.closing?.status} />
          <Chip kind="outline">Basic {pc(rep.coverage.B.pct)}</Chip>
          {rep.withC && <Chip kind="outline">Comprehensive {pc(rep.coverage.C.pct)}</Chip>}
          <Chip kind="outline">misurati o calcolati {pc(rep.measured.pct)}</Chip>
        </div>
      </div>
      <EsgSubNav items={items} value={sub} tab="vsme" label="Sezioni del report" />
      {sub === 'vsme' && <Datapoints d={d} P={P} rep={rep} />}
      {sub === 'esercizio' && <Esercizio d={d} P={P} rep={rep} />}
      {sub === 'bozza' && <Bozza d={d} P={P} rep={rep} />}
      {sub === 'banche' && <Banche d={d} P={P} />}
      {sub === 'questionari' && <Questionari d={d} P={P} qid={parts.slice(1).join('.') || null} />}
      {sub === 'materialita' && <Materialita d={d} P={P} rep={rep} />}
      {sub === 'storico' && <Storico d={d} P={P} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: copertura del rapporto, stato della chiusura, questionari aperti. */
export function ReportCard({ d }) {
  const s = useMemo(() => reportSummary(d), [d]);
  if (!s?.operational) return <EsgCard title="Report e questionari" tab="vsme" icon={LuFileText} sub="Il rapporto VS si compone dai dati dei registri: servono campagne e consegne." />;
  const p = s.coverage.total.pct;
  const q = s.questionnaires;
  return (
    <EsgCard title="Report e questionari" tab="vsme" id="vsme" icon={LuFileText} value={p == null ? '—' : nf(p * 100)} unit="% copertura VS"
      status={p >= 0.9 && s.status === 'approvato' ? 'ok' : p >= 0.7 ? 'warn' : 'bad'} chip={<ClosingChip status={s.status} />}
      sub={`${s.label}: ${s.gaps} datapoint da completare${q.open ? ` · ${q.open} questionari aperti${q.dueSoon ? `, ${q.dueSoon} in scadenza` : ''}` : ''}`} />
  );
}

/* ---------------- datapoint del VS ---------------- */
function Datapoints({ d, P, rep }) {
  const [flt, setFlt] = useState('tutti');
  const [mod, setMod] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const groups = rep.disclosures.filter(g => (!mod || g.module === mod) && (g.inScope || mod === 'C')).map(g => {
    let its = g.items.filter(i => flt === 'tutti' || (flt === 'aperti' ? i.required && !i.covered : i.hasValue || i.status === 'omesso'));
    its = filterRows(its, q, [i => i.id, i => i.label.it, i => i.hasValue ? itemText(i) : '']);
    return { ...g, shown: its, extras: flt === 'aperti' ? [] : g.extras };
  }).filter(g => g.shown.length || g.extras.length);
  const cur = open && rep.byId[open];
  return (
    <>
      <div className="erp-rings">
        <CovRing value={rep.coverage.B.pct} label="Modulo Basic" sub={`${rep.coverage.B.covered} di ${rep.coverage.B.required} obbligatori`} />
        {rep.withC ? <CovRing value={rep.coverage.C.pct} label="Modulo Comprehensive" sub={`${rep.coverage.C.covered} di ${rep.coverage.C.required} obbligatori`} />
          : <div className="erp-ring-off small muted">Modulo Comprehensive non scelto: si attiva nelle impostazioni (sezione Esercizio e chiusura).</div>}
        <CovRing value={rep.measured.pct} label="Misurati o calcolati" sub={`${rep.measured.measured} di ${rep.measured.n} valori`} />
        <div className="erp-ring-note small">
          <b>Copertura rigorosa.</b> Conta un datapoint obbligatorio solo se ha un valore o un’omissione motivata. I valori arrivano dalle schede che li calcolano; qui si risponde a ciò che manca o si motiva l’omissione.
          {rep.frozen && <div className="note good" style={{ marginTop: 8 }}><LuSnowflake aria-hidden="true" /> Esercizio approvato: si vedono i valori congelati il {dateIt(String(rep.closing.frozenAt).slice(0, 10))}.</div>}
          {rep.errors.length > 0 && <div className="note warn" style={{ marginTop: 8 }}>Un pacchetto non ha fornito i suoi datapoint: {rep.errors.map(e => e.pkg).join(', ')}.</div>}
        </div>
      </div>
      <Panel title="Datapoint del Voluntary Standard" sub={`${rep.period.label} · ${rep.gaps.length} obbligatori da completare · etichette ${VS_SOURCE.status} sul testo EFRAG`} flush id="esg-vsme"
        actions={<>
          <Seg label="Filtro" value={flt} onChange={setFlt} options={[{ id: 'tutti', label: 'Tutti' }, { id: 'aperti', label: 'Da completare' }, { id: 'coperti', label: 'Coperti' }]} />
          <Seg label="Modulo" value={mod} onChange={setMod} options={[{ id: '', label: 'B e C' }, { id: 'B', label: 'Basic' }, { id: 'C', label: 'Comprehensive' }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Cerca datapoint" id="erp-dp-search" />
          <Btn small icon={LuDownload} onClick={() => save(`vsme-datapoint-${P.key}`, 'csv', vsmeCsv(rep))} title="Esporta i datapoint in CSV">CSV</Btn>
        </>}>
        {!groups.length && <Empty title="Nessun datapoint con questi filtri" />}
        {groups.map(g => (
          <section key={g.id} className="erp-g" aria-label={`${g.id} ${g.title.it}`}>
            <header className="erp-g-hd">
              <span className="code">{g.id}</span><b>{g.title.it}</b>
              {g.required > 0 && <span className="erp-g-cov small"><span className="erp-bar" aria-hidden="true"><i style={{ width: `${Math.round((g.pct || 0) * 100)}%` }} /></span>{g.covered}/{g.required}</span>}
              {!g.inScope && <Chip kind="outline">fuori ambito</Chip>}
            </header>
            {g.shown.map(i => <DpRow key={i.id} i={i} onEdit={() => setOpen(i.id)} />)}
            {g.extras.map(e => (
              <div key={e.id} className="erp-dp">
                <div className="erp-dp-l"><span className="code">{e.id}</span> {e.label}<span className="sub">datapoint in più fornito da {tabLabel(e.link?.tab) || e.pkg}</span></div>
                <div className="erp-dp-v">{itemText(e)}</div>
                <div className="erp-dp-c"><QualityChip q={e.quality} /></div>
              </div>
            ))}
          </section>
        ))}
      </Panel>
      {cur && <AnswerDrawer d={d} P={P} i={cur} frozen={rep.frozen} onClose={() => setOpen(null)} />}
    </>
  );
}

function DpRow({ i, onEdit }) {
  const ext = i.provider !== 'report';
  return (
    <div className={`erp-dp ${i.required && !i.covered ? 'erp-dp-gap' : ''}`}>
      <div className="erp-dp-l">
        <span className="code">{i.id}</span> {i.label.it}
        <span className="sub">{i.status === 'non-applicabile' || (i.status === 'facoltativo' && i.cond) ? i.condText : i.req === 'facoltativo' ? 'facoltativo' : i.applies == null && i.cond ? `applicabilità da confermare (${i.condText})` : `fornito da ${ext ? tabLabel(i.link.tab) : 'questo report'}`}</span>
      </div>
      <div className="erp-dp-v">
        {i.hasValue ? <>{itemText(i)}{i.origin === 'risposta' && <span className="sub">risposta nel report</span>}</> : i.omission ? <span className="small">{OMISSION_REASONS[i.omission.reason]?.it}{i.omission.note ? `: ${i.omission.note}` : ''}</span> : <span className="muted">—</span>}
        {!i.hasValue && i.note && <span className="sub">{i.note}</span>}
      </div>
      <div className="erp-dp-c">
        {i.hasValue && <QualityChip q={i.quality} />}
        <DpStatus status={i.status} />
      </div>
      <div className="erp-dp-a no-print">
        {ext && !i.hasValue && i.inScope && <a className="btn small ghost" href={href(i.link.area, i.link.tab, i.link.id)} title={`Apri ${tabLabel(i.link.tab)}`}>{tabLabel(i.link.tab)}<LuArrowRight aria-hidden="true" /></a>}
        {i.inScope && <Btn small kind={i.required && !i.covered && !ext ? 'primary' : 'ghost'} icon={LuPencil} onClick={onEdit} title="Rispondi, correggi o motiva l’omissione">{i.answer ? 'Modifica' : i.hasValue ? 'Dettagli' : 'Rispondi'}</Btn>}
      </div>
    </div>
  );
}

function ValueInput({ c, value, onChange }) {
  if (c?.type === 'num') return <NumInput value={value ?? null} onChange={onChange} decimals={4} ariaLabel="Valore" />;
  if (c?.type === 'bool') return <Seg label="Valore" value={value === true ? 'si' : value === false ? 'no' : ''} onChange={x => onChange(x === 'si')} options={[{ id: 'si', label: 'Sì' }, { id: 'no', label: 'No' }]} />;
  if (c?.type === 'enum') return <Select value={value ?? ''} onChange={onChange} options={[{ id: '', label: '—' }, ...Object.entries(c.options).map(([id, o]) => ({ id, label: o.it }))]} ariaLabel="Valore" />;
  return <textarea className="input erp-ta" rows={4} value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label="Valore" />;
}

function AnswerDrawer({ d, P, i, frozen, onClose }) {
  const c = VS_DP[i.id];
  const a = i.answer || {};
  const [f, setF] = useState({ value: a.value ?? (i.origin === 'risposta' ? i.value : null), quality: a.quality || 'dichiarato', note: a.note || '', override: !!a.override, omission: a.omission || '', omissionNote: a.omissionNote || '', status: a.status || 'bozza', evidenceIds: a.evidenceIds || [] });
  const [err, setErr] = useState('');
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const ev = Array.isArray(d.evidence) ? d.evidence.slice(0, 40) : [];
  const providerValue = i.hasValue && i.origin === 'pacchetto';
  const submit = () => {
    const r = answerOps(d, P.key, i.id, { ...f, omission: f.omission || null }, { role: null, at: esgToday(d) });
    if (!r.ok) { setErr(r.error); return; }
    store.batch(r.ops, r.label); toast('Risposta salvata'); onClose();
  };
  const remove = () => { const r = answerOps(d, P.key, i.id, null); if (r.ops.length) { store.batch(r.ops, r.label); toast('Risposta tolta'); } onClose(); };
  return (
    <Drawer title={`${i.id} · ${i.label.it}`} sub={`Datapoint del VS · ${i.disc}`} onClose={onClose} wide
      actions={!frozen && <><Btn kind="primary" icon={LuSave} onClick={submit}>Salva</Btn>{i.answer && <Btn kind="danger" icon={LuTrash2} onClick={remove}>Togli la risposta</Btn>}<Btn kind="ghost" onClick={onClose}>Chiudi</Btn></>}>
      <div className="stack">
        <Kv items={[['Valore attuale', i.hasValue ? itemText(i) : '—'], ['Stato', <DpStatus status={i.status} />], ['Fornito da', i.provider === 'report' ? 'questo report' : <a href={href(i.link.area, i.link.tab, i.link.id)}>{tabLabel(i.link.tab)}</a>],
          i.hasValue ? ['Qualità', <QualityChip q={i.quality} />] : null, i.hasValue ? ['Fonte', sourceText(i)] : null, i.cond ? ['Applicabilità', i.condText || '—'] : null, c?.hint ? ['Come si compila', c.hint] : null]} />
        <Lineage item={{ method: i.method, source: i.source, quality: i.hasValue ? i.quality : null, note: i.note, evidence: i.evidence }} />
        {frozen ? <div className="note">Esercizio approvato: le risposte non si modificano. Per correggere, riaprire l’esercizio con una nota.</div> : <>
          {providerValue && <label className="check small"><input type="checkbox" checked={f.override} onChange={e => set('override', e.target.checked)} /> La risposta sostituisce il valore calcolato dalla scheda (resta tracciato)</label>}
          <div className="erp-form">
            <label className="field"><span>Valore{c?.unit ? ` (${c.unit})` : ''}</span><ValueInput c={c} value={f.value} onChange={v => set('value', v)} /></label>
            <label className="field"><span>Qualità del dato</span><Select value={f.quality} onChange={v => set('quality', v)} options={[['dichiarato', 'dichiarato'], ['misurato', 'misurato'], ['calcolato', 'calcolato'], ['stimato', 'stimato']].map(([id, label]) => ({ id, label }))} ariaLabel="Qualità del dato" /></label>
            <label className="field"><span>Stato della risposta</span><Seg label="Stato della risposta" value={f.status} onChange={v => set('status', v)} options={[{ id: 'bozza', label: 'Bozza' }, { id: 'rivisto', label: 'Rivista' }, { id: 'approvato', label: 'Approvata' }]} /></label>
          </div>
          <label className="field"><span>Nota o fonte del valore</span><input className="input" value={f.note} onChange={e => set('note', e.target.value)} placeholder="Per esempio: bilancio 2025 approvato il 28/04/2026" /></label>
          <fieldset className="erp-fs">
            <legend>Oppure: omissione motivata</legend>
            <div className="erp-form">
              <label className="field"><span>Motivo</span><Select value={f.omission} onChange={v => set('omission', v)} options={[{ id: '', label: 'Nessuna omissione' }, ...Object.entries(OMISSION_REASONS).map(([id, o]) => ({ id, label: o.it }))]} ariaLabel="Motivo dell’omissione" /></label>
              <label className="field"><span>Motivazione (obbligatoria)</span><input className="input" value={f.omissionNote} onChange={e => set('omissionNote', e.target.value)} disabled={!f.omission} /></label>
            </div>
          </fieldset>
          <fieldset className="erp-fs">
            <legend>Evidenze collegate</legend>
            {ev.length ? <div className="erp-ev">{ev.map(e => (
              <label key={e.id} className="check small"><input type="checkbox" checked={f.evidenceIds.includes(String(e.id))} onChange={x => set('evidenceIds', x.target.checked ? [...f.evidenceIds, String(e.id)] : f.evidenceIds.filter(z => z !== String(e.id)))} /> {e.title || e.name || e.id}</label>
            ))}</div> : <p className="small muted">Il registro delle evidenze (scheda {tabLabel('governance')}) è vuoto: i documenti caricati lì si collegano qui.</p>}
          </fieldset>
          {err && <div className="note crit">{err}</div>}
        </>}
      </div>
    </Drawer>
  );
}

/* ---------------- esercizio e chiusura ---------------- */
function Esercizio({ d, P, rep }) {
  const c = closingRow(d, P.key);
  const [who, setWho] = useState({ role: '', name: '' });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [chk, setChk] = useState(null);
  const diff = useMemo(() => (c ? frozenVsLive(d, P.key) : null), [d, P.key, c]);
  const st = c?.status || 'aperto';
  const run = r => { if (!r.ok) { setMsg({ kind: 'crit', text: r.error }); return false; } store.batch(r.ops, r.label); setMsg({ kind: 'good', text: r.label }); setNote(''); return true; };
  const freeze = async () => {
    const r = closeOps(d, P, who, { at: new Date().toISOString().slice(0, 19) });
    if (!r.ok) { setMsg({ kind: 'crit', text: r.error }); return; }
    const h = await sha256Hex(canonicalJson(r.payload));
    store.batch([...r.ops, hashOp(r.record.id, h)], r.label);
    setMsg({ kind: 'good', text: `${r.label}. Impronta ${h.slice(0, 16)}…` }); setChk(null);
  };
  const verify = async () => { const h = await sha256Hex(canonicalJson(closingPayload(c))); setChk({ ok: !!c.hash && h === c.hash, h }); };
  const steps = [
    { id: 'p', label: 'Preparazione', done: !!c && st !== 'riaperto', who: c?.preparedBy, name: c?.preparedName, at: c?.frozenAt, text: 'Congela datapoint, indicatori, versioni dei pacchetti e questionario ESG' },
    { id: 'r', label: 'Revisione', done: !!c?.reviewedBy, who: c?.reviewedBy, name: c?.reviewedName, at: c?.reviewedAt, text: 'Controllo dei valori da parte di un altro ruolo' },
    { id: 'a', label: 'Approvazione', done: st === 'approvato', who: c?.approvedBy, name: c?.approvedName, at: c?.approvedAt, text: 'Firma di un ruolo diverso da chi ha preparato i dati' },
  ];
  return (
    <div className="grid erp-ex">
      <Panel title="Chiusura dell’esercizio" sub={`${P.label} · ${dateIt(P.from)} – ${dateIt(P.to)}`} actions={<ClosingChip status={st} />}>
        <ol className="erp-steps">
          {steps.map((s, k) => (
            <li key={s.id} className={s.done ? 'done' : ''}>
              <span className="erp-step-n" aria-hidden="true">{s.done ? <LuCircleCheck /> : k + 1}</span>
              <div><b>{s.label}</b><span className="small">{s.done ? `${SIGN_ROLES[s.who] || s.who || '—'}${s.name ? ` · ${s.name}` : ''} · ${dateIt(String(s.at || '').slice(0, 10))}` : s.text}</span></div>
            </li>
          ))}
        </ol>
        {c?.hash && <div className="erp-hash"><LuFingerprint aria-hidden="true" /><span className="mono">{c.hash}</span>
          <Btn small kind="ghost" icon={LuShieldCheck} onClick={verify} title="Ricalcola l’impronta dell’istantanea salvata">Verifica</Btn>
          {chk && <Chip kind={chk.ok ? 'good' : 'crit'}>{chk.ok ? 'istantanea integra' : 'l’impronta non corrisponde'}</Chip>}</div>}
        {st === 'riaperto' && <div className="note warn">Riaperto il {dateIt(String(c.reopenedAt).slice(0, 10))}: «{c.reopenNote}». Preparare di nuovo la chiusura quando i dati sono corretti.</div>}
        <div className="erp-actions">
          <SignFields value={who} onChange={setWho} />
          {(st === 'approvato' || st === 'in revisione') && <label className="field"><span>{st === 'approvato' ? 'Nota per la riapertura (obbligatoria)' : 'Nota della revisione'}</span><input className="input" value={note} onChange={e => setNote(e.target.value)} /></label>}
          <div className="row">
            {st !== 'approvato' && <Btn kind={st === 'in revisione' ? '' : 'primary'} icon={LuSnowflake} onClick={freeze}>{st === 'in revisione' ? 'Aggiorna l’istantanea' : 'Congela i dati e manda in revisione'}</Btn>}
            {st === 'in revisione' && !c.reviewedBy && <Btn kind="primary" icon={LuCircleCheck} onClick={() => run(reviewOps(d, P.key, { ...who, at: new Date().toISOString().slice(0, 19) }, note))}>Segna come rivisto</Btn>}
            {st === 'in revisione' && c.reviewedBy && <Btn kind="primary" icon={LuShieldCheck} onClick={() => run(approveOps(d, P.key, { ...who, at: new Date().toISOString().slice(0, 19) }))}>Approva l’esercizio</Btn>}
            {st === 'approvato' && <Btn kind="danger" icon={LuLockOpen} onClick={() => run(reopenOps(d, P.key, { ...who, at: new Date().toISOString().slice(0, 19) }, note))}>Riapri con la nota</Btn>}
          </div>
          {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}
          <p className="small muted">I ruoli dicono chi firma e non sono permessi di accesso: in FeedOS locale chiunque usi il computer può firmare. Revisione e approvazione devono venire da un ruolo diverso da chi ha preparato i dati.</p>
        </div>
      </Panel>
      <Panel title="Istantanea e dati di oggi" sub={c ? `Valori congelati il ${dateIt(String(c.frozenAt).slice(0, 10))} confrontati con i registri` : 'Nessuna istantanea per questo esercizio'} flush>
        {!c ? <Empty icon={LuSnowflake} title="Esercizio non ancora congelato">Con «Congela i dati» i valori del rapporto restano fissati con la loro impronta, pronti per revisione e approvazione.</Empty>
          : !diff?.n ? <Empty icon={LuCircleCheck} title="Nessuna differenza">I dati di oggi coincidono con l’istantanea.</Empty>
          : <div className="tw"><table className="t"><thead><tr><th>Datapoint</th><th className="r">Istantanea</th><th className="r">Oggi</th><th>Tipo</th></tr></thead>
            <tbody>{diff.changes.map(x => <tr key={x.id}><td><span className="code">{x.id}</span> {x.label}</td><td className="r">{fmtV(x.frozen)}</td><td className="r">{fmtV(x.live)}</td><td>{x.kind}</td></tr>)}</tbody></table></div>}
        {c?.history?.length > 0 && <div className="erp-hist small">{c.history.map((h, k) => <div key={k}>Riaperto il {dateIt(String(h.reopenedAt).slice(0, 10))} da {SIGN_ROLES[h.reopenedBy] || h.reopenedBy}: «{h.note}» · impronta precedente <span className="mono">{String(h.hash || '').slice(0, 16)}…</span></div>)}</div>}
      </Panel>
      <Settings d={d} rep={rep} />
    </div>
  );
}
const fmtV = v => (v == null ? '—' : typeof v === 'number' ? nf(v, Math.abs(v) < 100 ? 2 : 0) : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60));

const YN = [{ id: '', label: 'Non so' }, { id: 'si', label: 'Sì' }, { id: 'no', label: 'No' }];
const ynv = v => (v === true ? 'si' : v === false ? 'no' : '');
function Settings({ d, rep }) {
  const s = rep.settings, raw = d.settings?.esg18?.report || {};
  const sec = SECTORS[sectorOf(d)];
  const [f, setF] = useState({ option: s.option, basis: s.basis, legalForm: raw.legalForm || '', nace: raw.nace || '', country: raw.country || '', countries: s.countries, pollutantsReporting: ynv(s.pollutantsReporting),
    waterSignificant: ynv(s.waterSignificant), waterStress: ynv(s.waterStress), lang: s.lang, threshold: s.threshold, periodMode: raw.periodMode || '', fyStartMonth: raw.fyStartMonth || '' });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const yb = v => (v === 'si' ? true : v === 'no' ? false : null);
  const submit = () => {
    const nace = String(f.nace || '').trim();
    if (nace && !/^\d{2}(\.\d{1,2}){0,2}$/.test(nace)) { toast('Codice NACE non valido (per esempio 10.91)', 'err'); return; }
    setEsgSettings('report', cur => ({ ...cur, option: f.option, basis: f.basis, legalForm: f.legalForm.trim(), nace, country: f.country.trim(), countries: Math.max(1, Math.round(+f.countries || 1)),
      pollutantsReporting: yb(f.pollutantsReporting), waterSignificant: yb(f.waterSignificant), waterStress: yb(f.waterStress), lang: f.lang, threshold: Math.min(5, Math.max(1, +f.threshold || 3)),
      periodMode: f.periodMode || undefined, fyStartMonth: f.fyStartMonth ? +f.fyStartMonth : undefined }), 'Impostazioni del report VS');
    toast('Impostazioni del report salvate');
  };
  const legalHint = /s\.?\s*p\.?\s*a\.?$/i.test(d.settings?.company?.name || '') ? 'Società per azioni (S.p.A.)' : /s\.?\s*r\.?\s*l\.?$/i.test(d.settings?.company?.name || '') ? 'Società a responsabilità limitata (S.r.l.)' : 'Per esempio Società per azioni';
  return (
    <Panel title="Impostazioni del report" sub="Profilo B1 e regole di applicabilità: valgono per tutti gli esercizi" actions={<Btn small kind="primary" icon={LuSave} onClick={submit}>Salva</Btn>}>
      <div className="erp-form">
        <label className="field"><span>Moduli del rapporto</span><Seg label="Moduli" value={f.option} onChange={v => set('option', v)} options={[{ id: 'basic', label: 'Solo Basic' }, { id: 'basic+comprehensive', label: 'Basic e Comprehensive' }]} /></label>
        <label className="field"><span>Base</span><Seg label="Base" value={f.basis} onChange={v => set('basis', v)} options={[{ id: 'individuale', label: 'Individuale' }, { id: 'consolidato', label: 'Consolidata' }]} /></label>
        <label className="field"><span>Forma giuridica</span><input className="input" value={f.legalForm} onChange={e => set('legalForm', e.target.value)} placeholder={legalHint} /></label>
        <label className="field"><span>Codice NACE</span><input className="input" value={f.nace} onChange={e => set('nace', e.target.value)} placeholder={`${naceOf(d)} · ${sec.naceLabel}`} /></label>
        <label className="field"><span>Paese delle attività principali</span><input className="input" value={f.country} onChange={e => set('country', e.target.value)} placeholder="Italia" /></label>
        <label className="field"><span>Paesi con dipendenti</span><NumInput value={f.countries} onChange={v => set('countries', v)} decimals={0} min={1} ariaLabel="Paesi con dipendenti" /></label>
        <label className="field"><span>Emissioni comunicate per legge (AUA/AIA)</span><Seg label="Inquinanti" value={f.pollutantsReporting} onChange={v => set('pollutantsReporting', v)} options={YN} /></label>
        <label className="field"><span>Consumo d’acqua significativo</span><Seg label="Consumo d’acqua" value={f.waterSignificant} onChange={v => set('waterSignificant', v)} options={YN} /></label>
        <label className="field"><span>Siti in aree ad alto stress idrico</span><Seg label="Stress idrico" value={f.waterStress} onChange={v => set('waterStress', v)} options={YN} /></label>
        <label className="field"><span>Lingua di base delle esportazioni</span><Seg label="Lingua" value={f.lang} onChange={v => set('lang', v)} options={[{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }]} /></label>
        <label className="field"><span>Esercizio ESG</span><Select value={f.periodMode} onChange={v => set('periodMode', v)} options={[{ id: '', label: 'Automatico (12 mesi chiusi finché i dati coprono meno di 2 anni)' }, { id: '12m-chiusi', label: 'Ultimi 12 mesi chiusi' }, { id: 'anno', label: 'Esercizio annuale' }]} ariaLabel="Esercizio ESG" /></label>
        <label className="field"><span>Mese di inizio dell’esercizio annuale</span><Select value={String(f.fyStartMonth)} onChange={v => set('fyStartMonth', v)} options={[{ id: '', label: 'Come l’esercizio finanziario' }, ...['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'].map((m, k) => ({ id: String(k + 1), label: m }))]} ariaLabel="Mese di inizio" /></label>
        <label className="field"><span>Soglia di materialità (1-5)</span><NumInput value={f.threshold} onChange={v => set('threshold', v)} decimals={1} min={1} max={5} ariaLabel="Soglia di materialità" /></label>
      </div>
      <MethodNote text={REPORT_METHOD} title="Nota metodologica del report" />
      <p className="small muted">{VS_SOURCE.it} · valido al {dateIt(VS_SOURCE.validAsOf)} <StatusChip status={VS_SOURCE.status} /></p>
      <Disclaimer />
    </Panel>
  );
}
