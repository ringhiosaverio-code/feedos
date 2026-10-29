/* FeedOS 18 · Report e questionari (pacchetto WP4): questionari di clienti, banche e piattaforme di rating (importazione CSV,
 * modelli per tema, collegamento ai datapoint, risposte automatiche, correzioni, voci oltre il VS, CSV delle risposte e
 * delle evidenze) e analisi di materialità leggera (libreria del settore, punteggi, matrice, temi materiali). */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuUpload, LuDownload, LuArrowLeft, LuScale, LuSave, LuClipboardList } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { go } from '../core/router.js';
import { dateIt, nf, relDays, addDays } from '../core/util.js';
import { readFile } from '../core/io.js';
import { esgToday } from '../engine/esg-years.js';
import { questionnaireList } from '../engine/esg-report.js';
import { Q_KINDS, Q_STATUS, parseQuestionnaireCsv, questionnaireOps, templateItems, answersCsv, evidenceIndex, evidenceIndexCsv, suggestMapping,
  materialityRows, materialityMatrix, iroLibrary, seedMateriality, lastAssessed, rescoreRow, scoreIro } from '../engine/esg-report-q.js';
import { VS_DATAPOINTS, VS_DP } from '../data/vsme-datapoints.js';
import { ESRS_TOPICS, PACK_REPORT_IRO } from '../data/pack-report.js';
import { Panel, Btn, Chip, Kpi, Seg, Select, Empty, Table, Drawer, NumInput } from '../ui/ui.jsx';
import { Legend } from '../ui/charts.jsx';
import { QualityChip, StatusChip } from './esg-shared.jsx';
import { save, pc } from './esg-report-ui.jsx';

const QST = { risposto: ['good', 'risposto dai dati'], parziale: ['warn', 'parziale'], manuale: ['accent', 'risposta manuale'], oltre: ['violet', 'oltre il VS'], 'da-completare': ['crit', 'da completare'],
  'da-mappare': ['warn', 'da collegare'], 'da-trascrivere': ['outline', 'da trascrivere'] };
const QChip = ({ s }) => { const [k, l] = QST[s] || ['outline', s]; return <Chip kind={k}>{l}</Chip>; };
const TEMPLATES = [{ id: 'cliente', label: 'Cliente della filiera (per temi)' }, { id: 'ecovadis-temi', label: 'EcoVadis (4 temi)' }, { id: 'synesgy', label: 'Rating ESG bancario (per temi)' },
  { id: 'open-es', label: 'Open-es (4 dimensioni)' }, { id: 'pmi-banche', label: 'Documento PMI-Banche (struttura)' }];
const DP_OPTS = [{ id: '', label: 'Nessun datapoint (oltre il VS)' }, ...VS_DATAPOINTS.map(c => ({ id: c.id, label: `${c.id} · ${c.label.it}` }))];

/* ---------------- questionari ---------------- */
export function Questionari({ d, P, qid }) {
  const today = esgToday(d);
  const list = useMemo(() => questionnaireList(d, today), [d, today]);
  const q = qid ? list.find(x => x.id === qid) : null;
  if (q) return <QDetail d={d} q={q} today={today} />;
  return (
    <>
      <Panel title="Questionari ESG" sub="Clienti, banche e piattaforme di rating: le risposte vengono dai datapoint dell’esercizio (approvati, se chiuso)" flush>
        <Table rows={list} rowKey={x => x.id} onRow={x => go('esg', 'vsme', `questionari.${x.id}`)} empty="Nessun questionario: importane uno da CSV o crealo da un modello" exportName="questionari-esg" cols={[
          { key: 'title', label: 'Questionario', render: x => <><b>{x.title}</b><span className="sub">{x.requester || '—'} · {Q_KINDS[x.kind] || x.kind}</span></> },
          { key: 'dueAt', label: 'Scadenza', render: x => x.dueAt ? <>{dateIt(x.dueAt)}<span className="sub">{x.open ? relDays(x.dueAt, today) : ''}</span></> : '—', csv: x => x.dueAt },
          { key: 'status', label: 'Stato', render: x => <Chip kind={x.open ? (x.days != null && x.days <= 7 ? 'warn' : 'outline') : 'good'}>{x.status}</Chip> },
          { key: 'pct', label: 'Risposte', align: 'r', sort: x => x.stats.pct, csv: x => x.stats.answered, render: x => <>{x.stats.answered} di {x.stats.total}<span className="sub">{x.stats.beyond ? `${x.stats.beyond} oltre il VS` : ''}{x.stats.transcribe ? `${x.stats.transcribe} da trascrivere` : ''}</span></> },
        ]} />
      </Panel>
      <NewQuestionnaire d={d} P={P} today={today} />
    </>
  );
}

function NewQuestionnaire({ d, P, today }) {
  const [m, setM] = useState({ template: 'cliente', title: '', requester: '', dueAt: addDays(today, 30) });
  const [imp, setImp] = useState(null);
  const set = (k, v) => setM(o => ({ ...o, [k]: v }));
  const create = items => {
    const r = questionnaireOps(d, { title: m.title || (imp ? imp.name : TEMPLATES.find(t => t.id === m.template)?.label), kind: imp ? 'altro' : m.template, requester: m.requester, dueAt: m.dueAt, receivedAt: today, periodKey: P.key }, items);
    if (!r.ok) { toast(r.error, 'err'); return; }
    store.batch(r.ops, `Questionario «${r.record.title}» aggiunto (${r.record.items.length} voci)`);
    setImp(null); go('esg', 'vsme', `questionari.${r.id}`);
  };
  const onFile = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const p = parseQuestionnaireCsv(await readFile(file));
    if (p.errors.length) { toast(p.errors[0], 'err'); return; }
    const mapped = p.items.map(it => ({ ...it, top: suggestMapping(it.text)[0] || null }));
    setImp({ name: file.name.replace(/\.[^.]+$/, ''), items: p.items, auto: mapped.filter(x => x.top?.confidence >= 0.5).length, columns: p.columns });
  };
  return (
    <Panel title="Nuovo questionario" sub="Da un modello per temi (nessun testo proprietario) oppure da un file CSV con una domanda per riga">
      <div className="erp-form">
        <label className="field"><span>Titolo</span><input className="input" value={m.title} onChange={e => set('title', e.target.value)} placeholder="Per esempio Questionario fornitori 2026" /></label>
        <label className="field"><span>Richiedente</span><input className="input" value={m.requester} onChange={e => set('requester', e.target.value)} placeholder="Cliente, banca o piattaforma" /></label>
        <label className="field"><span>Scadenza</span><input type="date" className="input" value={m.dueAt} onChange={e => set('dueAt', e.target.value)} /></label>
        <label className="field"><span>Modello</span><Select value={m.template} onChange={v => set('template', v)} options={TEMPLATES} ariaLabel="Modello" /></label>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <Btn kind="primary" icon={LuPlus} onClick={() => create(templateItems(d, m.template))}>Crea dal modello</Btn>
        <label className="btn"><LuUpload aria-hidden="true" />Importa da CSV<input type="file" accept=".csv,.txt,text/csv" className="erp-file" onChange={onFile} /></label>
      </div>
      {imp && <div className="note" style={{ marginTop: 16 }}>
        «{imp.name}»: {imp.items.length} domande lette (colonna «{imp.columns.text}»); {imp.auto} collegate in automatico a un datapoint, le altre da controllare o oltre il VS.
        <div className="row" style={{ marginTop: 8 }}><Btn small kind="primary" icon={LuSave} onClick={() => create(imp.items)}>Aggiungi il questionario</Btn><Btn small kind="ghost" onClick={() => setImp(null)}>Annulla</Btn></div>
      </div>}
    </Panel>
  );
}

function QDetail({ d, q, today }) {
  const f = q.filled;
  const upd = (patch, label) => store.update('questionnaires', q.id, patch, label);
  const setItem = (qidx, patch, label) => upd({ items: q.items.map((it, k) => (k === qidx ? { ...it, ...patch } : it)) }, label);
  const ev = evidenceIndex(f, d);
  return (
    <>
      <div className="row between erp-qhead no-print">
        <Btn small kind="ghost" icon={LuArrowLeft} onClick={() => go('esg', 'vsme', 'questionari')}>Tutti i questionari</Btn>
        <div className="row gap-s">
          <Btn small icon={LuDownload} onClick={() => save(`risposte-${q.id}`, 'csv', answersCsv(f))}>Risposte CSV</Btn>
          <Btn small icon={LuDownload} onClick={() => save(`evidenze-${q.id}`, 'csv', evidenceIndexCsv(ev))} disabled={!ev.length}>Indice delle evidenze</Btn>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Risposte" value={`${f.stats.answered} / ${f.stats.total}`} foot={pc(f.stats.pct)} />
        <Kpi label="Da completare" value={f.stats.todo + f.stats.partial} foot="datapoint mancanti o da collegare" />
        <Kpi label="Oltre il VS" value={f.stats.beyond} foot="testo standard sul limite della catena del valore" />
        <Kpi label="Scadenza" value={q.dueAt ? dateIt(q.dueAt) : '—'} foot={q.dueAt && q.open ? relDays(q.dueAt, today) : q.status} />
      </div>
      <Panel title={q.title} sub={`${q.requester || '—'} · ${Q_KINDS[q.kind] || q.kind} · esercizio ${q.periodKey || '—'}`}
        actions={<Select value={q.status || 'in compilazione'} onChange={v => upd({ status: v, ...(v === 'inviato' ? { sentAt: today } : {}) }, `Questionario «${q.title}»: ${v}`)} options={Q_STATUS} ariaLabel="Stato del questionario" />}>
        {q.note && <p className="small muted">{q.note}</p>}
        {f.stats.transcribe > 0 && <div className="note" style={{ marginBottom: 8 }}>Voci da trascrivere: il testo delle voci del Documento PMI-Banche va importato nella sezione Banche (modello CSV) <StatusChip status="da trascrivere" />.</div>}
        <div className="erp-q">
          {f.items.map((it, k) => (
            <article key={`${it.qid}-${k}`} className="erp-qi">
              <header><span className="code">{it.qid}</span><b>{it.text || 'Voce da trascrivere'}</b><QChip s={it.status} /></header>
              {it.text && <>
                <div className="erp-qi-a">{it.answer ? <p className={it.status === 'oltre' ? 'small' : ''}>{it.answer}</p> : <p className="muted small">Nessun valore: completare i datapoint collegati.</p>}
                  {it.quality && <QualityChip q={it.quality} />}{it.evidence?.length > 0 && <Chip kind="outline">{it.evidence.length} evidenze</Chip>}</div>
                <div className="erp-qi-f no-print">
                  <label className="field"><span>Datapoint VS</span><Select value={it.dpIds?.[0] || ''} onChange={v => setItem(k, { dpIds: v ? [v] : [], beyondVs: !v }, `Questionario «${q.title}», voce ${it.qid}: collegamento`)} options={DP_OPTS} ariaLabel={`Datapoint della voce ${it.qid}`} /></label>
                  <label className="field"><span>Risposta manuale (sostituisce quella automatica)</span>
                    <input className="input" defaultValue={it.override || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (it.override || '')) setItem(k, { override: v || null }, `Questionario «${q.title}», voce ${it.qid}: risposta manuale`); }} /></label>
                </div>
                {it.dpIds?.length > 1 && <p className="xs muted">Collegata anche a: {it.dpIds.slice(1).map(id => VS_DP[id] ? id : '').join(', ')}</p>}
                {!it.dpIds?.length && it.suggested?.length > 0 && <p className="xs muted">Suggerimenti: {it.suggested.map(s => `${s.dpId} (${nf(s.confidence * 100)}%)`).join(', ')}</p>}
              </>}
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}

/* ---------------- materialità ---------------- */
const KIND_COLOR = { impatto: 'var(--s1)', rischio: 'var(--s2)', opportunità: 'var(--s3)' };
function Matrix({ points, threshold }) {
  const W = 360, H = 300, x0 = 42, x1 = 346, y0 = 266, y1 = 12;
  const sx = v => x0 + ((v - 0) / 5) * (x1 - x0), sy = v => y0 - ((v - 0) / 5) * (y0 - y1);
  const seen = {}, count = {};
  for (const p of points) count[`${p.x}|${p.y}`] = (count[`${p.x}|${p.y}`] || 0) + 1;
  return (
    <svg className="erp-matrix" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Matrice di materialità: ${points.filter(p => p.material).length} voci materiali su ${points.length}`}>
      <rect x={sx(threshold)} y={y1} width={x1 - sx(threshold)} height={y0 - y1} className="erp-mz" />
      <rect x={x0} y={y1} width={sx(threshold) - x0} height={sy(threshold) - y1} className="erp-mz" />
      {[0, 1, 2, 3, 4, 5].map(v => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={y1} y2={y0} className="erp-grid" /><line x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} className="erp-grid" />
        <text x={sx(v)} y={y0 + 14} className="erp-tick" textAnchor="middle">{v}</text><text x={x0 - 8} y={sy(v) + 4} className="erp-tick" textAnchor="end">{v}</text></g>)}
      <line x1={sx(threshold)} x2={sx(threshold)} y1={y1} y2={y0} className="erp-thr" /><line x1={x0} x2={x1} y1={sy(threshold)} y2={sy(threshold)} className="erp-thr" />
      <text x={(x0 + x1) / 2} y={H - 2} className="erp-ax" textAnchor="middle">rilevanza finanziaria</text>
      <text x={12} y={(y0 + y1) / 2} className="erp-ax" textAnchor="middle" transform={`rotate(-90 12 ${(y0 + y1) / 2})`}>rilevanza d’impatto</text>
      {points.map((p, i) => {
        const k = `${p.x}|${p.y}`; const n = (seen[k] = (seen[k] || 0) + 1) - 1;
        const cx = sx(p.x) + [0, 9, -9][n % 3], cy = sy(p.y) - Math.floor(n / 3) * 9;
        // un'etichetta sola per coordinata, con i numeri di tutte le voci materiali che vi cadono
        const lbl = n === 0 ? points.map((q, j) => (q.material && q.x === p.x && q.y === p.y ? j + 1 : null)).filter(Boolean).join(', ') : '';
        return <g key={p.id}><circle cx={cx} cy={cy} r={p.material ? 6 : 4.5} fill={KIND_COLOR[p.kind] || 'var(--s4)'} className={p.material ? 'erp-pt-m' : 'erp-pt'}><title>{`${i + 1}. ${p.title}: impatto ${nf(p.y, 1)}, finanziaria ${nf(p.x, 1)}`}</title></circle>
          {lbl && (cx > x1 - 40 ? <text x={cx - 9} y={cy + 4} className="erp-pl" textAnchor="end">{lbl}</text> : <text x={cx + (count[k] > 1 ? 17 : 8)} y={cy + 4} className="erp-pl">{lbl}</text>)}</g>;
      })}
    </svg>
  );
}

export function Materialita({ d, P, rep }) {
  const rows = materialityRows(d, P.key);
  const lib = useMemo(() => iroLibrary(d), [d]);
  const th = rep.settings.threshold;
  const [open, setOpen] = useState(null);
  const prev = lastAssessed(d, P.key);
  const seed = from => { const rs = seedMateriality(d, P.key, from, th); store.batch([{ kind: 'upsertMany', coll: 'materiality', objs: rs, key: 'id' }], `Analisi di materialità «${P.label}»: ${rs.length} voci${from ? ' riportate' : ' dalla libreria'}`); };
  if (!rows) return (
    <Panel title="Analisi di materialità">
      <Empty icon={LuScale} title={`Nessuna valutazione per «${P.label}»`}>
        La libreria del settore propone {lib.length} impatti, rischi e opportunità con punteggi di partenza da rivedere (gravità, estensione, irrimediabilità, probabilità, rilevanza finanziaria).
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Btn kind="primary" icon={LuScale} onClick={() => seed(null)}>Valuta con la libreria</Btn>{prev && <Btn onClick={() => seed(prev)}>Riporta da {prev}</Btn>}</div>
      </Empty>
    </Panel>
  );
  const mx = materialityMatrix(rows, th, PACK_REPORT_IRO.items);
  const byId = Object.fromEntries(lib.map(x => [x.id, x]));
  const cur = open && rows.find(r => r.id === open);
  return (
    <>
      <div className="grid g2 erp-mat">
        <Panel title="Matrice di doppia materialità" sub={`${mx.material} voci materiali su ${mx.points.length} · soglia ${nf(th, 1)} su 5`}>
          <Matrix points={mx.points} threshold={th} />
          <Legend items={[{ label: 'impatto', color: KIND_COLOR.impatto }, { label: 'rischio', color: KIND_COLOR.rischio }, { label: 'opportunità', color: KIND_COLOR['opportunità'] }]} />
          <ol className="erp-ul small erp-mlist">{mx.points.map((p, i) => p.material && <li key={p.id} value={i + 1}>{p.title}</li>)}</ol>
        </Panel>
        <Panel title="Temi materiali e informative del VS" sub="Dove il rapporto deve essere più curato">
          <ul className="erp-topics">
            {mx.topics.map(t => <li key={t.id} className={t.material ? 'on' : ''}><span className="code">{t.id}</span><b>{t.label}</b>{t.material ? <Chip kind="accent">materiale</Chip> : <Chip kind="outline">non materiale</Chip>}<span className="small muted">{t.vs.join(', ')}</span></li>)}
          </ul>
          {mx.recommendC && !rep.withC && <div className="note warn">Clima o forza lavoro sono materiali: banche e clienti chiedono di solito anche il modulo Comprehensive (C3, C4, C5, C6). Si attiva nella sezione Esercizio e chiusura.</div>}
          {mx.recommendC && rep.withC && <div className="note good">Il rapporto comprende già il modulo Comprehensive richiesto dai temi materiali.</div>}
        </Panel>
      </div>
      <Panel title="Impatti, rischi e opportunità" sub="Punteggi 1-5 secondo ESRS 1: gravità per l’impatto (per gli impatti potenziali × probabilità), entità × probabilità per la rilevanza finanziaria" flush>
        <Table rows={rows} rowKey={r => r.id} onRow={r => setOpen(r.id)} pageSize={40} exportName={`materialita-${P.key}`} initialSort={{ key: 'score', dir: 'desc' }} cols={[
          { key: 'title', label: 'Voce', csv: r => byId[r.iroId]?.title?.it || r.iroId, render: r => <><b>{byId[r.iroId]?.title?.it || r.iroId}</b><span className="sub">{ESRS_TOPICS[r.topic]?.label.it} · {r.kind} · {r.actual === false ? 'potenziale' : 'effettivo'}</span></> },
          { key: 'impact', label: 'Impatto', align: 'r', sort: r => scoreIro(r).impact, csv: r => scoreIro(r).impact, render: r => nf(scoreIro(r).impact, 1) },
          { key: 'fin', label: 'Finanziaria', align: 'r', sort: r => scoreIro(r).financial, csv: r => scoreIro(r).financial, render: r => nf(scoreIro(r).financial, 1) },
          { key: 'score', label: 'Esito', sort: r => scoreIro(r).score, csv: r => (scoreIro(r).score >= th ? 'materiale' : 'non materiale'), render: r => scoreIro(r).score >= th ? <Chip kind="accent">materiale</Chip> : <Chip kind="outline">no</Chip> },
        ]} />
      </Panel>
      {cur && <IroDrawer row={cur} meta={byId[cur.iroId]} th={th} onClose={() => setOpen(null)} />}
    </>
  );
}

function IroDrawer({ row, meta, th, onClose }) {
  const [f, setF] = useState({ scale: row.scale, scope: row.scope, irremediability: row.irremediability, likelihood: row.likelihood, magnitude: row.magnitude, actual: row.actual !== false, rationale: row.rationale || '' });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const sc = scoreIro({ ...row, ...f });
  const N = (k, l) => <label className="field"><span>{l}</span><NumInput value={f[k]} onChange={v => set(k, v)} decimals={0} min={1} max={5} step={1} ariaLabel={l} /></label>;
  const submit = () => { store.update('materiality', row.id, rescoreRow({ ...row, ...f }, th), `Materialità: ${meta?.title?.it || row.iroId}`); toast('Valutazione salvata'); onClose(); };
  return (
    <Drawer title={meta?.title?.it || row.iroId} sub={`${ESRS_TOPICS[row.topic]?.label.it} · ${row.kind}`} onClose={onClose}
      actions={<><Btn kind="primary" icon={LuSave} onClick={submit}>Salva</Btn><Btn kind="ghost" onClick={onClose}>Annulla</Btn></>}>
      <div className="stack">
        <p className="small">{meta?.rationale?.it}</p>
        <div className="erp-form">
          {N('scale', 'Scala (gravità)')}{N('scope', 'Estensione')}{!row.positive && N('irremediability', 'Irrimediabilità')}{N('likelihood', 'Probabilità')}{N('magnitude', 'Rilevanza finanziaria')}
          <label className="field"><span>Natura</span><Seg label="Natura" value={f.actual ? 'eff' : 'pot'} onChange={v => set('actual', v === 'eff')} options={[{ id: 'eff', label: 'Effettivo' }, { id: 'pot', label: 'Potenziale' }]} /></label>
        </div>
        <label className="field"><span>Motivazione</span><textarea className="input erp-ta" rows={3} value={f.rationale} onChange={e => set('rationale', e.target.value)} /></label>
        <div className="note">Impatto {nf(sc.impact, 2)} · finanziaria {nf(sc.financial, 2)} → {sc.score >= th ? 'materiale' : 'non materiale'} (soglia {nf(th, 1)}).</div>
      </div>
    </Drawer>
  );
}
