/* FeedOS 18 · ESG › Governance ed evidenze: registro delle evidenze (impronta SHA-256 calcolata nel browser, allegati facoltativi in
 * IndexedDB con budget 200 MB / 15 MB per file tramite core/blobs.js, collegamenti a datapoint e record, copertura dei datapoint del VS,
 * verifica di un file, pacchetto ZIP per il revisore) e registro delle dichiarazioni ambientali con il controllo in tempo reale.
 * Gli allegati non entrano nel backup JSON. Prefisso CSS ego-. Scritture con store.batch e un'etichetta italiana. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuUpload, LuFileSearch, LuDownload, LuPackage, LuPlus, LuX, LuHardDrive, LuCopy, LuSave, LuSearchCheck } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { go } from '../core/router.js';
import { nf, dateIt, addDays, uid, daysBetween } from '../core/util.js';
import { download, stamp } from '../core/io.js';
import { sha256Hex } from '../core/hash.js';
import { putBlob, getBlob, deleteBlob, blobUsage, BLOB_MAX_FILE, BLOB_MAX_TOTAL } from '../core/blobs.js';
import { META as EDITION } from '../editions/meta.js';
import { packStatus } from '../engine/esg-packs.js';
import { collectDatapoints, collectCalendar, METHOD_NOTES } from '../engine/esg-registry.js';
import { factorRegistry } from '../engine/esg-clima-factors.js';
import { T } from '../engine/esg-nlg.js';
import { evidenceState, evidenceCoverage, evidenceTargets, claimsView, claimCheck, checkClaim, duplicateHashes } from '../engine/esg-governance.js';
import { auditPackZip } from '../engine/esg-governance-audit.js';
import { VS_DATAPOINTS, VS_DP, VS_PROVIDERS } from '../data/vsme-datapoints.js';
import { PACK_CLIMA } from '../data/pack-clima.js';
import { PACK_FILIERA } from '../data/pack-filiera.js';
import { PACK_REPORT } from '../data/pack-report.js';
import { PACK_GOVERNANCE } from '../data/pack-governance.js';
import { EVIDENCE_KINDS, CLAIM_CHANNELS } from '../data/fields-governance.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Kv, SearchBox, filterRows } from '../ui/ui.jsx';
import { Disclaimer } from './esg-shared.jsx';
import { pctTxt, mbTxt, undoToast, ExpChip, VerdictChip, FindingChip, RecordDrawer, dt, dayTxt } from './esg-governance-ui.jsx';

const DP_OPTIONS = VS_DATAPOINTS.map(c => ({ id: c.id, label: `${c.id} · ${c.label.it}` }));
const REC_TYPES = { companyCerts: 'Certificazione', permits: 'Autorizzazione', policies: 'Politica', claims: 'Dichiarazione', complianceItems: 'Adempimento', odvReports: 'Relazione dell’OdV', eudrLots: 'Lotto EUDR', registrations: 'Registrazione', sdsDocs: 'Scheda di sicurezza' };
const recLabel = (d, type, r) => {
  if (!r) return '';
  if (type === 'companyCerts') return `${r.scheme}${r.number ? ' ' + r.number : ''}`;
  if (type === 'permits') return `${r.kind}${r.number ? ' ' + r.number : ''}`;
  if (type === 'policies') return r.title;
  if (type === 'claims') return String(r.text || '').slice(0, 60);
  if (type === 'complianceItems') return r.title || PACK_GOVERNANCE.items.find(x => x.id === r.obligationId)?.title || r.id;
  if (type === 'odvReports') return `relazione del ${dateIt(r.date)}`;
  if (type === 'registrations' || type === 'sdsDocs') return `${(d.products || []).find(p => p.id === r.productId)?.name || r.productId}${r.version ? ` v${r.version}` : ''}`;
  return r.id;
};
const linkText = (d, l) => (l.type === 'datapoint' || l.type === 'vs' ? l.ref : `${REC_TYPES[l.type] || l.type}: ${recLabel(d, l.type, (d[l.type] || []).find(x => x.id === l.ref)) || l.ref}`);
const guessKind = name => {
  const n = String(name).toLowerCase();
  if (/fattur|bollett|invoice/.test(n)) return 'fattura';
  if (/fir|formular|rifiut|rentri|mud/.test(n)) return 'FIR';
  if (/certific|iso|attestat/.test(n)) return 'certificato';
  if (/politic|codice|procedur|policy/.test(n)) return 'politica';
  if (/verbal|riunion|relazion/.test(n)) return 'verbale';
  if (/analis|rapporto di prova|laborator/.test(n)) return 'analisi';
  if (/contratt|polizz|ccnl/.test(n)) return 'contratto';
  if (/\.geojson$/.test(n)) return 'GeoJSON';
  if (/\.(jpe?g|png|heic)$/.test(n)) return 'foto';
  return 'altro';
};
const isoOf = ms => { try { const x = new Date(ms); return Number.isFinite(x.getTime()) ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : ''; } catch { return ''; } };
async function hashFile(f) { const buf = new Uint8Array(await f.arrayBuffer()); return { sha256: await sha256Hex(buf), bytes: buf }; }

/* ================= evidenze ================= */
export function Evidenze({ d, P, today }) {
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);
  const [ed, setEd] = useState(null);
  const [f, setF] = useState('attive');
  const [q, setQ] = useState('');
  const [check, setCheck] = useState(null);
  const cov = useMemo(() => evidenceCoverage(d, P), [d.evidence, d.settings, P.key]);
  const dup = duplicateHashes(d);
  const rows0 = (d.evidence || []).map(e => ({ ...e, state: evidenceState(e, today), days: e.expiresAt ? daysBetween(today, e.expiresAt) : null }));
  const rows = filterRows(rows0.filter(e => (f === 'attive' ? e.state !== 'sostituita' : f === 'scadenza' ? ['in scadenza', 'scaduta'].includes(e.state) : f === 'allegati' ? e.storage === 'archivio' : true)), q, ['title', 'kind', 'issuer', 'fileName', 'sha256', e => (e.links || []).map(l => l.ref).join(' ')]);
  useEffect(() => { let on = true; blobUsage().then(u => { if (on) setUsage(u); }).catch(() => {}); return () => { on = false; }; }, [d.evidence]);
  const onFiles = async files => {
    const list = [...(files || [])].slice(0, 20);
    if (!list.length) return;
    setBusy(true);
    const out = [];
    for (const file of list) {
      try {
        const h = await hashFile(file);
        out.push({ key: uid('q'), name: file.name, size: file.size, mime: file.type || 'application/octet-stream', lastModified: isoOf(file.lastModified), ...h, dup: (d.evidence || []).find(e => e.sha256 === h.sha256) || null });
      } catch { toast(`${file.name}: file non leggibile`, 'err'); }
    }
    setBusy(false);
    setQueue(x => [...x, ...out]);
  };
  const verify = async file => {
    if (!file) return;
    try { const h = await hashFile(file); setCheck({ name: file.name, sha256: h.sha256, hit: (d.evidence || []).filter(e => e.sha256 === h.sha256) }); } catch { toast('File non leggibile', 'err'); }
  };
  const onDrop = e => { e.preventDefault(); onFiles(e.dataTransfer?.files); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Documenti registrati" value={nf(rows0.filter(e => e.state !== 'sostituita').length)} foot={(n => `${n} ${n === 1 ? 'versione precedente conservata' : 'versioni precedenti conservate'}`)(rows0.filter(e => e.state === 'sostituita').length)} />
        <Kpi label="Datapoint del VS con evidenza" value={pctTxt(cov.share)} status={cov.share == null ? undefined : cov.share >= 0.8 ? 'ok' : cov.share >= 0.6 ? 'warn' : 'bad'} target="80%" foot={`${cov.covered.length} di ${cov.ids.length} obbligatori`} />
        <Kpi label="In scadenza o scaduti" value={nf(rows0.filter(e => ['in scadenza', 'scaduta'].includes(e.state)).length)} status={rows0.some(e => e.state === 'scaduta') ? 'warn' : 'ok'} foot="entro 60 giorni" />
        <Kpi label="Allegati nel browser" value={usage ? mbTxt(usage.used) : '—'} foot={`su ${nf(BLOB_MAX_TOTAL / 1048576)} MB · ${usage ? `${usage.files} file` : 'lettura…'}`} />
      </div>
      <div className="split">
        <Panel title="Registra documenti" sub="L’impronta SHA-256 si calcola nel browser: il file non esce dal computer" id="ego-evidence-form">
          <label className={`ego-drop${busy ? ' ego-busy' : ''}`} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <LuUpload aria-hidden="true" />
            <b>{busy ? 'Calcolo delle impronte…' : 'Trascina qui i documenti o scegli i file'}</b>
            <span className="xs muted">Fatture, formulari, certificati, verbali, analisi, polizze · fino a 20 file per volta · allegati al massimo {nf(BLOB_MAX_FILE / 1048576)} MB</span>
            <input type="file" multiple className="sr" onChange={e => { onFiles(e.target.files); e.target.value = ''; }} aria-label="Scegli i documenti" />
          </label>
          {queue.length > 0 && <NewEvidence key={queue[0].key} d={d} item={queue[0]} rest={queue.length - 1} today={today} usage={usage} onDone={() => setQueue(x => x.slice(1))} onSkipAll={() => setQueue([])} />}
        </Panel>
        <div className="stack">
          <Panel title="Verifica un documento" sub="Calcola l’impronta di un file e la cerca nel registro: utile per il revisore">
            <label className="btn small"><LuFileSearch aria-hidden="true" />Scegli il file da verificare<input type="file" className="sr" onChange={e => { verify(e.target.files?.[0]); e.target.value = ''; }} /></label>
            {check && (
              <div className={`note small ego-mt ${check.hit.length ? 'good' : 'maize'}`}>
                <b>{check.name}</b>: {check.hit.length ? <>corrisponde a {check.hit.map(e => `«${e.title}»`).join(', ')} (registrato il {dateIt(check.hit[0].addedAt)})</> : 'nessun documento del registro ha questa impronta'}.
                <div className="mono xs ego-hash">{check.sha256}</div>
              </div>
            )}
          </Panel>
          <Panel title="Spazio degli allegati" sub={usage?.mode === 'memoria' ? 'Questo browser non salva gli allegati: restano finché la pagina è aperta' : 'Nel database del browser, fuori dal backup JSON'}>
            <div className="ego-meter" role="meter" aria-valuemin={0} aria-valuemax={BLOB_MAX_TOTAL} aria-valuenow={usage?.used || 0} aria-label="Spazio usato dagli allegati"><i style={{ width: `${Math.min(100, ((usage?.used || 0) / BLOB_MAX_TOTAL) * 100)}%` }} /></div>
            <p className="small ego-mt"><LuHardDrive aria-hidden="true" /> {mbTxt(usage?.used || 0)} usati su {nf(BLOB_MAX_TOTAL / 1048576)} MB · {usage?.files || 0} {usage?.files === 1 ? 'allegato' : 'allegati'}</p>
            <p className="xs muted">{T('governance.evidence.local').replace('FeedOS', EDITION.product)}</p>
          </Panel>
        </div>
      </div>
      {dup.length > 0 && <div className="note maize small">Stesso file registrato più volte: {dup.map(x => x.ids.join(' = ')).join(' · ')} (regola R43).</div>}
      <Panel title="Registro delle evidenze" sub="Documenti con impronta, scadenza e collegamenti ai datapoint e ai registri" flush
        actions={<><Seg value={f} onChange={setF} label="Filtro" options={[{ id: 'attive', label: 'In uso' }, { id: 'scadenza', label: 'In scadenza' }, { id: 'allegati', label: 'Con allegato' }, { id: 'tutte', label: 'Tutte' }]} /><SearchBox value={q} onChange={setQ} placeholder="Cerca documento o impronta" /></>}>
        <Table rows={rows} pageSize={20} exportName="evidenze" onRow={e => setEd(e)} cols={[
          { key: 'title', label: 'Documento', render: e => <span className="ego-wrap"><b>{e.title}</b><span className="sub">{e.kind}{e.fileName ? ` · ${e.fileName}` : ''}</span></span>, csv: e => e.title },
          { key: 'issuer', label: 'Emesso', render: e => <span className="ego-wrap">{e.issuer || '—'}<span className="sub">{dt(e.issuedAt)}</span></span>, csv: e => `${e.issuer || ''} ${e.issuedAt || ''}` },
          { key: 'state', label: 'Validità', render: e => <ExpChip state={e.state} days={e.state === 'valida' ? null : e.days} />, sort: e => e.expiresAt || '9999' },
          { key: 'links', label: 'Collegamenti', render: e => <span className="ego-chips">{(e.links || []).slice(0, 3).map((l, i) => <Chip key={i} kind={l.type === 'datapoint' ? 'accent' : 'outline'}>{l.type === 'datapoint' ? l.ref : REC_TYPES[l.type] || l.type}</Chip>)}{(e.links || []).length > 3 && <Chip kind="outline">+{e.links.length - 3}</Chip>}</span>, csv: e => (e.links || []).map(l => `${l.type}:${l.ref}`).join(' '), sort: e => (e.links || []).length },
          { key: 'sha256', label: 'SHA-256', render: e => <span className="mono xs">{String(e.sha256 || '').slice(0, 12)}…</span>, csv: e => e.sha256 },
          { key: 'storage', label: 'File', render: e => (e.storage === 'archivio' ? <Chip kind="good">allegato</Chip> : <Chip kind="outline">percorso</Chip>), csv: e => (e.storage === 'archivio' ? 'allegato nel browser' : e.path || '') },
        ]} />
      </Panel>
      <Copertura d={d} P={P} cov={cov} />
      <AuditPack d={d} P={P} today={today} />
      {ed && <EvidenceDrawer key={ed.id} d={d} e={(d.evidence || []).find(x => x.id === ed.id) || ed} today={today} onClose={() => setEd(null)} />}
    </>
  );
}

/* nuovo documento dalla coda: metadati, conservazione, collegamenti */
function NewEvidence({ d, item, rest, today, usage, onDone, onSkipAll }) {
  const canStore = item.size <= BLOB_MAX_FILE && (usage ? usage.used + item.size <= BLOB_MAX_TOTAL : true);
  const [v, setV] = useState({ title: item.name.replace(/\.[^.]+$/, ''), kind: guessKind(item.name), issuer: '', issuedAt: item.lastModified || today, expiresAt: '', storage: canStore ? 'archivio' : 'percorso', path: '', note: '' });
  const [links, setLinks] = useState([]);
  const set = p => setV(o => ({ ...o, ...p }));
  const save = async () => {
    if (!v.title.trim()) { toast('Serve un titolo', 'err'); return; }
    const id = uid('ev');
    let storage = v.storage;
    if (storage === 'archivio') {
      const r = await putBlob(id, item.bytes, { mime: item.mime, name: item.name, sha256: item.sha256, at: today });
      if (!r.ok) { toast(`${r.error}: registrato con il solo percorso`, 'err'); storage = 'percorso'; }
    }
    const obj = { id, title: v.title.trim(), kind: v.kind, issuer: v.issuer.trim(), issuedAt: v.issuedAt || null, expiresAt: v.expiresAt || null, sha256: item.sha256, size: item.size, mime: item.mime, fileName: item.name,
      storage, path: storage === 'percorso' ? v.path.trim() : '', links, addedBy: 'utente', addedAt: today, supersededBy: null, note: v.note.trim() };
    store.batch([{ kind: 'add', coll: 'evidence', obj }], `Evidenza registrata: ${obj.title}`);
    undoToast(`Registrata con impronta ${item.sha256.slice(0, 10)}…`);
    onDone();
  };
  return (
    <div className="ego-new">
      <div className="row between"><b className="ego-wrap">{item.name}</b><span className="xs muted">{mbTxt(item.size)}{rest ? ` · altri ${rest} in coda` : ''}</span></div>
      <div className="mono xs ego-hash">SHA-256 {item.sha256}</div>
      {item.dup && <div className="note maize small">Stesso file già registrato come «{item.dup.title}» il {dateIt(item.dup.addedAt)}.</div>}
      <div className="form">
        <Field label="Titolo"><input className="input" value={v.title} maxLength={160} onChange={e => set({ title: e.target.value })} /></Field>
        <Field label="Tipo"><Select value={v.kind} onChange={x => set({ kind: x })} options={EVIDENCE_KINDS} ariaLabel="Tipo di documento" /></Field>
        <Field label="Emesso da"><input className="input" value={v.issuer} maxLength={80} onChange={e => set({ issuer: e.target.value })} /></Field>
        <Field label="Data del documento"><input className="input" type="date" value={v.issuedAt} onChange={e => set({ issuedAt: e.target.value })} /></Field>
        <Field label="Scade il"><input className="input" type="date" value={v.expiresAt} onChange={e => set({ expiresAt: e.target.value })} /></Field>
      </div>
      <div className="row gap-s ego-mt">
        <Seg label="Conservazione" value={v.storage} onChange={x => set({ storage: x })} options={[{ id: 'archivio', label: 'Allegato nel browser', title: canStore ? 'Il file resta in questo browser' : 'Troppo grande o spazio esaurito' }, { id: 'percorso', label: 'Solo impronta e percorso' }]} />
        {v.storage === 'archivio' && !canStore && <Chip kind="warn">oltre il limite: si registra il percorso</Chip>}
      </div>
      {v.storage === 'percorso' && <Field label="Dove si trova il file"><input className="input" value={v.path} maxLength={200} onChange={e => set({ path: e.target.value })} placeholder="Cartella di rete o archivio documentale" /></Field>}
      <LinkEditor d={d} links={links} onChange={setLinks} />
      <div className="row gap-s ego-mt">
        <Btn kind="primary" icon={LuSave} onClick={save}>Registra</Btn>
        <Btn kind="ghost" onClick={onDone}>Salta</Btn>
        {rest > 0 && <Btn kind="ghost" icon={LuX} onClick={onSkipAll}>Svuota la coda</Btn>}
      </div>
    </div>
  );
}

/* collegamenti a datapoint del VS e a record dei registri */
function LinkEditor({ d, links, onChange }) {
  const [type, setType] = useState('datapoint');
  const types = Object.keys(REC_TYPES).filter(t => (d[t] || []).length);
  const recs = type === 'datapoint' ? DP_OPTIONS : (d[type] || []).slice(0, 300).map(r => ({ id: r.id, label: recLabel(d, type, r) }));
  const add = ref => { if (!ref || links.some(l => l.type === type && l.ref === ref)) return; onChange([...links, { type, ref }]); };
  return (
    <fieldset className="ego-fs">
      <legend>Collegamenti</legend>
      <div className="row gap-s">
        <Select value={type} onChange={setType} ariaLabel="Tipo di collegamento" options={[{ id: 'datapoint', label: 'Datapoint del VS' }, ...types.map(t => ({ id: t, label: REC_TYPES[t] }))]} />
        <Select value="" onChange={add} ariaLabel="Collega" options={[{ id: '', label: '— scegli —' }, ...recs]} className="grow" />
      </div>
      {links.length > 0 ? <div className="ego-chips ego-mt">{links.map((l, i) => <Chip key={`${l.type}|${l.ref}|${i}`} kind={l.type === 'datapoint' ? 'accent' : 'outline'}>{linkText(d, l)} <button type="button" className="linkish" aria-label="Togli il collegamento" onClick={() => onChange(links.filter((_, j) => j !== i))}>×</button></Chip>)}</div>
        : <p className="xs muted ego-mt">Nessun collegamento: il documento resta nel registro ma non copre nessun datapoint.</p>}
    </fieldset>
  );
}

/* dettaglio e modifica di un'evidenza */
function EvidenceDrawer({ d, e, today, onClose }) {
  const [links, setLinks] = useState(e.links || []);
  const [sup, setSup] = useState(e.supersededBy || '');
  const [check, setCheck] = useState(null);
  const others = (d.evidence || []).filter(x => x.id !== e.id && !x.supersededBy);
  const fetchFile = async () => {
    const b = await getBlob(e.id);
    if (!b) { toast('Allegato non presente in questo browser', 'err'); return; }
    download(e.fileName || `${e.id}.bin`, new Blob([b.bytes], { type: b.mime || e.mime || 'application/octet-stream' }), b.mime || e.mime);
  };
  const verify = async file => { if (!file) return; try { const h = await hashFile(file); setCheck(h.sha256 === e.sha256); } catch { setCheck(null); } };
  const copy = () => { try { navigator.clipboard?.writeText(e.sha256); toast('Impronta copiata'); } catch { toast('Copia non disponibile', 'err'); } };
  return (
    <RecordDrawer d={d} coll="evidence" rec={e} onClose={onClose} labelOf={x => x.title} extra={{ links, supersededBy: sup || null }} onRemoved={x => { if (x.storage === 'archivio') deleteBlob(x.id); }}>
      <Kv items={[['Validità', <ExpChip state={evidenceState(e, today)} days={e.expiresAt ? daysBetween(today, e.expiresAt) : null} />], ['File', `${e.fileName || '—'}${e.size ? ` · ${mbTxt(e.size)}` : ''}${e.mime ? ` · ${e.mime}` : ''}`],
        ['Conservazione', e.storage === 'archivio' ? 'allegato nel browser' : e.path || 'solo impronta'], ['Registrato', `${dt(e.addedAt)}${e.addedBy ? ` · ${e.addedBy}` : ''}`],
        ['SHA-256', <span className="mono xs ego-hash">{e.sha256}</span>]]} />
      <div className="row gap-s">
        <Btn small kind="ghost" icon={LuCopy} onClick={copy}>Copia l’impronta</Btn>
        {e.storage === 'archivio' && <Btn small icon={LuDownload} onClick={fetchFile}>Scarica l’allegato</Btn>}
        <label className="btn small ghost"><LuSearchCheck aria-hidden="true" />Verifica il file<input type="file" className="sr" onChange={x => { verify(x.target.files?.[0]); x.target.value = ''; }} /></label>
        {check != null && <Chip kind={check ? 'good' : 'crit'}>{check ? 'il file corrisponde' : 'il file è diverso'}</Chip>}
      </div>
      <LinkEditor d={d} links={links} onChange={setLinks} />
      <Field label="Sostituita da (versione più recente)"><Select value={sup} onChange={setSup} ariaLabel="Sostituita da" options={[{ id: '', label: '— in uso —' }, ...others.map(x => ({ id: x.id, label: x.title }))]} /></Field>
      <p className="xs muted">I collegamenti e la sostituzione si salvano con il pulsante «Salva» del modulo.</p>
    </RecordDrawer>
  );
}

/* copertura dei datapoint obbligatori */
function Copertura({ d, P, cov }) {
  const [only, setOnly] = useState('mancanti');
  const [link, setLink] = useState(null);
  const ev = (d.evidence || []).filter(e => !e.supersededBy);
  const rows = evidenceTargets(d).map(id => {
    const c = VS_DP[id], docs = ev.filter(e => (e.links || []).some(l => (l.type === 'datapoint' || l.type === 'vs') && l.ref === id));
    return { id, label: c?.label?.it || id, pkg: VS_PROVIDERS[c?.provider]?.title?.it || c?.provider || '', tab: VS_PROVIDERS[c?.provider]?.tab, docs, ok: cov.covered.includes(id) };
  }).filter(r => only === 'tutti' || !r.ok);
  const doLink = (dpId, evId) => {
    const e = ev.find(x => x.id === evId); if (!e) return;
    store.update('evidence', e.id, { links: [...(e.links || []), { type: 'datapoint', ref: dpId }] }, `Evidenza «${e.title}» collegata a ${dpId}`);
    undoToast('Collegamento salvato'); setLink(null);
  };
  return (
    <Panel title="Copertura dei datapoint del VS" sub={`${cov.covered.length} di ${cov.ids.length} datapoint obbligatori calcolati dalle schede hanno un documento valido collegato (${P.label})`} flush
      actions={<Seg value={only} onChange={setOnly} label="Quali" options={[{ id: 'mancanti', label: `Senza evidenza (${cov.missing.length})` }, { id: 'tutti', label: 'Tutti' }]} />}>
      <Table rows={rows} pageSize={30} exportName="copertura-evidenze" empty="Tutti i datapoint obbligatori hanno un’evidenza" cols={[
        { key: 'id', label: 'Datapoint', render: r => <span className="ego-wrap"><b>{r.id}</b><span className="sub">{r.label}</span></span>, csv: r => `${r.id} ${r.label}` },
        { key: 'pkg', label: 'Scheda', render: r => (r.tab ? <button type="button" className="linkish small" onClick={() => go('esg', r.tab)}>{r.pkg}</button> : r.pkg), csv: r => r.pkg },
        { key: 'docs', label: 'Documenti', render: r => (r.docs.length ? r.docs.map(e => e.title).join(' · ') : <span className="muted">nessuno</span>), csv: r => r.docs.map(e => e.title).join(' · '), sort: r => r.docs.length },
        { key: 'ok', label: 'Stato', render: r => <Chip kind={r.ok ? 'good' : 'warn'}>{r.ok ? 'coperto' : 'senza evidenza'}</Chip>, csv: r => (r.ok ? 'coperto' : 'senza evidenza') },
        { key: 'act', label: '', nosort: true, csv: false, render: r => (link === r.id
          ? <Select value="" onChange={x => doLink(r.id, x)} ariaLabel={`Collega a ${r.id}`} options={[{ id: '', label: '— documento —' }, ...ev.map(e => ({ id: e.id, label: e.title }))]} />
          : <Btn small kind="ghost" icon={LuPlus} onClick={() => setLink(r.id)} disabled={!ev.length}>Collega</Btn>) },
      ]} />
    </Panel>
  );
}

/* pacchetto per il revisore */
function AuditPack({ d, P, today }) {
  const [lang, setLang] = useState('it');
  const [att, setAtt] = useState(false);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const nAtt = (d.evidence || []).filter(e => e.storage === 'archivio' && !e.supersededBy).length;
  const build = async () => {
    setBusy(true);
    try {
      const datapoints = collectDatapoints(d, P).datapoints;
      const calendar = collectCalendar(d, today).filter(c => c.date >= addDays(P.from, 0) && c.date <= addDays(today, 365));
      let factors = [];
      try { factors = factorRegistry(d); } catch { factors = []; }
      const packs = packStatus(d, [PACK_CLIMA, PACK_FILIERA, PACK_REPORT, PACK_GOVERNANCE]);
      const attachments = [];
      if (att) for (const e of (d.evidence || []).filter(x => x.storage === 'archivio' && !x.supersededBy)) { const b = await getBlob(e.id); if (b?.bytes) attachments.push({ id: e.id, name: e.fileName || e.id, bytes: b.bytes }); }
      const closing = (d.esgClosings || []).find(c => c.id === P.key) || null;
      const z = auditPackZip(d, P, { datapoints, calendar, methodNotes: METHOD_NOTES, factors, packs, closing, lang, today, attachments });
      const name = `${EDITION.product.toLowerCase()}-pacchetto-revisore-${P.key || 'esercizio'}-${stamp()}.zip`;
      await download(name, new Blob([z.bytes], { type: 'application/zip' }), 'application/zip');
      setRes({ ...z.counts, hash: z.hash, size: z.bytes.length });
    } catch (err) { toast(`Pacchetto non preparato: ${err?.message || err}`, 'err'); }
    setBusy(false);
  };
  return (
    <Panel title={T('governance.audit.title')} sub={`Archivio ZIP per l’esercizio ${P.label}: indice delle evidenze, datapoint con provenienza, fattori, versioni dei pacchetti, note metodologiche, chiusura con impronta e manifesto SHA-256`} id="ego-audit">
      <div className="row gap-s">
        <Seg label="Lingua" value={lang} onChange={setLang} options={[{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }]} />
        <label className="check small"><input type="checkbox" checked={att} onChange={e => setAtt(e.target.checked)} disabled={!nAtt} /> includi gli allegati salvati nel browser ({nAtt})</label>
        <Btn kind="primary" icon={LuPackage} onClick={build} disabled={busy}>{busy ? 'Preparazione…' : 'Prepara il pacchetto (.zip)'}</Btn>
      </div>
      {res && <p className="small ego-mt">Pronto: {res.files} file, {res.evidence} evidenze, {res.datapoints} datapoint{res.attachments ? `, ${res.attachments} allegati` : ''} · {mbTxt(res.size)} · impronta del manifesto <span className="mono xs">{res.hash.slice(0, 16)}…</span></p>}
      <p className="xs muted">Si apre con qualsiasi programma per archivi ZIP; il file MANIFEST-SHA256.txt permette al revisore di verificare ogni file con «sha256sum -c».</p>
      <Disclaimer />
    </Panel>
  );
}

/* ================= dichiarazioni ambientali ================= */
const STATUS_KIND = { bozza: 'outline', verificato: 'accent', pubblicato: 'good', ritirato: 'outline' };
export function Dichiarazioni({ d, today }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('scheda tecnica');
  const [ed, setEd] = useState(null);
  const live = useMemo(() => (text.trim() ? checkClaim(text, { d, today }) : null), [text, d.dcfLedger, d.settings, today]);
  const rows = claimsView(d);
  const add = () => {
    store.batch([{ kind: 'add', coll: 'claims', obj: { text: text.trim(), channel, productId: null, status: 'bozza', evidenceIds: [], owner: '', reviewAt: addDays(today, 30), createdAt: today, findings: [] } }], `Dichiarazione ambientale aggiunta: «${text.trim().slice(0, 50)}»`);
    undoToast('Aggiunta al registro'); setText('');
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Dichiarazioni nel registro" value={nf(rows.length)} foot={(n => `${n} ${n === 1 ? 'pubblicata' : 'pubblicate'}`)(rows.filter(c => c.status === 'pubblicato').length)} />
        <Kpi label="Bloccate" value={nf(rows.filter(c => c.check.verdict === 'bloccata' && c.status !== 'ritirato').length)} status={rows.some(c => c.check.verdict === 'bloccata' && c.status === 'pubblicato') ? 'bad' : rows.some(c => c.check.verdict === 'bloccata') ? 'warn' : 'ok'} foot="da riformulare prima dell’uso" />
        <Kpi label="Da rivedere" value={nf(rows.filter(c => c.check.verdict === 'da rivedere' && c.status !== 'ritirato').length)} />
        <Kpi label="Pubblicate senza evidenze" value={nf(rows.filter(c => c.status === 'pubblicato' && !(c.evidenceIds || []).length).length)} status={rows.some(c => c.status === 'pubblicato' && !(c.evidenceIds || []).length) ? 'warn' : 'ok'} foot="regola R45" />
      </div>
      <div className="split">
        <Panel title="Controlla un testo" sub={T('governance.claim.intro')} id="ego-claim-check">
          <textarea className="input ego-ta" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Incolla il testo di un’etichetta, una scheda tecnica, una pagina del sito o un’offerta" aria-label="Testo da controllare" />
          <div className="row gap-s ego-mt">
            <Select value={channel} onChange={setChannel} ariaLabel="Dove compare" options={CLAIM_CHANNELS} className="ego-sel" />
            <Btn small kind="primary" icon={LuPlus} onClick={add} disabled={!text.trim()}>Aggiungi al registro</Btn>
            {live && <VerdictChip verdict={live.verdict} />}
          </div>
          {live ? <Findings check={live} /> : <p className="small muted ego-mt">Il controllo parte mentre scrivi: niente viene inviato fuori dal computer.</p>}
        </Panel>
        <Panel title="Regole applicate" sub={`Pacchetto «governance» · valido al ${dateIt(PACK_GOVERNANCE.validAsOf)}`}>
          <ul className="ego-rules">
            <li><b>Neutralità e compensazioni</b>: «carbon neutral», «a impatto zero», «CO₂ neutro», «climate positive» sono sempre bloccate, anche con evidenze o crediti di compensazione.</li>
            <li><b>Asserzioni generiche</b> («green», «eco», «sostenibile», «rispettoso dell’ambiente»): solo con un’eccellenza ambientale riconosciuta (Ecolabel UE o marchio di tipo I).</li>
            <li><b>Marchi di sostenibilità</b>: solo se basati su uno schema di certificazione o istituiti da un’autorità pubblica.</li>
            <li><b>Impegni futuri</b> («net zero entro…»): solo con un piano pubblico, misurabile e verificato da un esperto indipendente.</li>
            <li><b>«Senza deforestazione»</b>{EDITION.sector === 'mangimi' ? ': ammessa finché il registro DCF della filiera non è negativo' : ': indicare schema, materia prima e catena di custodia'}.</li>
            <li><b>Confronti e percentuali</b>: con metodo e termine di paragone dichiarati, sullo stesso perimetro del calcolo conservato.</li>
          </ul>
          <p className="xs muted">D.Lgs. 30/2026 (dir. (UE) 2024/825) in vigore dal 27/09/2026; tra imprese D.Lgs. 145/2007. Aiuto alla revisione, non parere legale.</p>
        </Panel>
      </div>
      <Panel title="Registro delle dichiarazioni" sub="Testo, canale, stato ed esito del controllo; una dichiarazione bloccata non si pubblica" flush>
        <Table rows={rows} pageSize={20} exportName="dichiarazioni-ambientali" onRow={c => setEd(c)} empty="Nessuna dichiarazione registrata" cols={[
          { key: 'text', label: 'Dichiarazione', render: c => <span className="ego-wrap"><b>«{c.text}»</b><span className="sub">{c.channel}{c.owner ? ` · ${c.owner}` : ''}</span></span>, csv: c => c.text },
          { key: 'status', label: 'Stato', render: c => <Chip kind={STATUS_KIND[c.status] || 'outline'}>{c.status}</Chip> },
          { key: 'verdict', label: 'Esito', render: c => <VerdictChip verdict={c.check.verdict} />, csv: c => c.check.verdict, sort: c => c.check.verdict },
          { key: 'finding', label: 'Rilievo principale', render: c => <span className="ego-wrap small">{c.check.findings[0]?.msg || 'nessun rilievo'}</span>, csv: c => c.check.findings.map(f => f.msg).join(' | ') },
          { key: 'ev', label: 'Evidenze', align: 'r', render: c => nf((c.evidenceIds || []).length), csv: c => (c.evidenceIds || []).join(' ') },
          { key: 'reviewAt', label: 'Riesame', render: c => <span>{dt(c.reviewAt)}<span className="sub">{c.reviewAt ? dayTxt(daysBetween(today, c.reviewAt)) : ''}</span></span>, csv: c => c.reviewAt || '' },
        ]} />
      </Panel>
      {ed && <ClaimDrawer key={ed.id} d={d} c={rows.find(x => x.id === ed.id) || ed} today={today} onClose={() => setEd(null)} />}
    </>
  );
}
function Findings({ check }) {
  if (!check.findings.length) return <p className="small ego-mt">Nessun rilievo: conservare comunque le evidenze di ciò che il testo afferma.</p>;
  return (
    <ul className="ego-find">
      {check.findings.map((f, i) => (
        <li key={`${f.id}|${f.term}|${i}`} className={`ego-find-${f.severity}`}>
          <span className="row gap-s"><FindingChip severity={f.severity} /><span className="mono xs">«{f.term}»</span></span>
          <span className="small">{f.msg}</span>
          {f.need && <span className="xs muted">Serve: {f.need}</span>}
        </li>
      ))}
    </ul>
  );
}
function ClaimDrawer({ d, c, today, onClose }) {
  const [evIds, setEvIds] = useState(c.evidenceIds || []);
  const ev = (d.evidence || []).filter(e => !e.supersededBy);
  const chk = claimCheck(d, { ...c, evidenceIds: evIds });
  return (
    <RecordDrawer d={d} coll="claims" rec={c} onClose={onClose} labelOf={x => `«${String(x.text || '').slice(0, 50)}»`} extra={{ evidenceIds: evIds }}
      validate={o => (o.status === 'pubblicato' && claimCheck(d, { ...o, evidenceIds: evIds }).verdict === 'bloccata' ? 'Una dichiarazione bloccata non si pubblica: riformula il testo' : null)}>
      <div className="row gap-s"><VerdictChip verdict={chk.verdict} /><span className="small muted">{chk.findings.length ? `${chk.findings.length} rilievi` : 'nessun rilievo'}</span></div>
      <Findings check={chk} />
      <fieldset className="ego-fs">
        <legend>Evidenze a supporto</legend>
        <Select value="" onChange={x => x && setEvIds(o => [...new Set([...o, x])])} ariaLabel="Aggiungi un’evidenza" options={[{ id: '', label: ev.length ? '— aggiungi un documento —' : 'nessun documento nel registro' }, ...ev.map(e => ({ id: e.id, label: e.title }))]} />
        {evIds.length ? <div className="ego-chips ego-mt">{evIds.map(id => <Chip key={id} kind="accent">{ev.find(e => e.id === id)?.title || id} <button type="button" className="linkish" aria-label="Togli" onClick={() => setEvIds(o => o.filter(x => x !== id))}>×</button></Chip>)}</div> : <p className="xs muted ego-mt">Nessuna evidenza: una dichiarazione pubblicata senza documenti viola la regola R45.</p>}
      </fieldset>
    </RecordDrawer>
  );
}
