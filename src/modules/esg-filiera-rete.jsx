/* FeedOS 18 · ESG › EUDR e fornitori: valutazione ESG dei fornitori (matrice del rischio, tabella, codici di condotta, azioni
 * correttive), moduli autonomi per i fornitori (generazione, stato delle richieste, importazione della risposta con verifica
 * dell'impronta e differenze) e lettere EUDR ai clienti (IT/EN, stampa, testo, Markdown, CSV dei riferimenti). Prefisso CSS efl-. */
import React, { useMemo, useState } from 'react';
import { LuFileDown, LuUpload, LuSave, LuPrinter, LuDownload, LuCopy, LuShieldCheck, LuShieldAlert, LuBellRing, LuCheck, LuX, LuFileText, LuUsers } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { nf, dateIt, addDays, sum } from '../core/util.js';
import { readFile, download } from '../core/io.js';
import { supplierEsgTable, supplierRequestsView, eudrRegister, customerEudrLetter, REQUEST_KINDS } from '../engine/esg-filiera.js';
import { requestPayload, formHash, supplierForm, importReply } from '../engine/esg-filiera-forms.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, Kv, confirm } from '../ui/ui.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { pctTxt, tTxt, eurTxt, undoToast, downloadCsv, downloadText, BandChip, ReqChip, slugName, shortName } from './esg-filiera-ui.jsx';

/* ================= fornitori: valutazione ESG ================= */
const SPEND = s => (s >= 0.1 ? 'alta' : s >= 0.02 ? 'media' : 'bassa');
export function Fornitori({ d, P, S, today }) {
  const rows = useMemo(() => supplierEsgTable(d, P, today), [d, P.key, today]);
  if (!rows.length) return <Panel title="Fornitori"><Empty icon={LuUsers} title="Nessun fornitore in anagrafica">Crea i fornitori in Acquisti › Fornitori: qui compaiono con la valutazione ESG.</Empty></Panel>;
  const capa = rows.flatMap(r => (r.capa?.items || []).filter(c => c.status !== 'chiusa').map(c => ({ ...c, supplierId: r.id, name: r.name, key: `${r.id}-${c.i}` })));
  const close = c => {
    const cur = (d.supplierEsg || []).find(x => x.id === c.supplierId);
    if (!cur) return;
    store.update('supplierEsg', c.supplierId, x => ({ ...x, capa: (x.capa || []).map((y, i) => (i === c.i ? { ...y, status: 'chiusa', closedAt: today } : y)) }), `Azione correttiva chiusa: ${shortName(c.name)}`);
    undoToast('Azione correttiva chiusa');
  };
  const bands = ['alto', 'medio', 'basso'], spends = ['alta', 'media', 'bassa'];
  return (
    <>
      <div className="kpis">
        <Kpi label="Spesa con fornitori valutati" value={pctTxt(S.suppliers.spendAssessed)} foot="valutazione negli ultimi 36 mesi" status={S.suppliers.spendAssessed == null ? undefined : S.suppliers.spendAssessed >= 0.8 ? 'ok' : 'warn'} target="80%" />
        <Kpi label="Fornitori valutati" value={`${S.suppliers.assessed} / ${S.suppliers.n}`} foot={`${S.suppliers.highRisk} a rischio alto`} />
        <Kpi label="Codici di condotta firmati" value={nf(S.suppliers.cocSigned)} foot={`su ${S.suppliers.n} fornitori`} />
        <Kpi label="Azioni correttive aperte" value={nf(S.suppliers.capaOpen)} status={S.suppliers.capaOverdue ? 'bad' : S.suppliers.capaOpen ? 'warn' : 'ok'} foot={S.suppliers.capaOverdue ? `${S.suppliers.capaOverdue} scadute` : 'nessuna scaduta'} />
        <Kpi label="Revisioni scadute" value={nf(S.suppliers.reviewsDue)} status={S.suppliers.reviewsDue ? 'warn' : 'ok'} foot="rivalutazione ogni 12 mesi" />
      </div>
      <div className="split">
        <Panel title="Matrice del rischio" sub="Rischio interno del fornitore (righe) contro quota della spesa del periodo (colonne) · clic per la scheda">
          <div className="efl-matrix" role="table" aria-label="Matrice del rischio dei fornitori">
            <div className="efl-mx-h" role="row"><span role="columnheader" />{spends.map(s => <span key={s} role="columnheader">spesa {s}</span>)}</div>
            {bands.map(b => (
              <div key={b} className="efl-mx-r" role="row">
                <span role="rowheader" className={`efl-mx-l efl-mx-${b}`}>rischio {b}</span>
                {spends.map(s => {
                  const xs = rows.filter(r => r.risk?.band === b && SPEND(r.spendShare) === s);
                  return <div key={s} role="cell" className={`efl-mx-c efl-mx-${b}${(b === 'alto' && s !== 'bassa') || (b === 'medio' && s === 'alta') ? ' efl-mx-hot' : ''}`}>
                    {xs.length ? xs.map(r => <button key={r.id} type="button" className="efl-mx-s" onClick={() => openDrawer('supplier', r.id)} title={`${r.name}: rischio ${r.risk.score}`}>{shortName(r.name)}</button>) : <span className="muted xs">—</span>}
                  </div>;
                })}
              </div>
            ))}
          </div>
          <p className="xs muted">Punteggio interno 0–100: 40 valutazione ESG, 15 rischio paese, 15 lotti senza DDS, 10 diritti umani, 10 azioni correttive, 10 codice di condotta. Si affianca alla classifica di Acquisti › Fornitori senza modificarla.</p>
        </Panel>
        <Panel title="Azioni correttive aperte" sub="Dalle valutazioni e dagli audit dei fornitori" flush>
          {capa.length ? <div className="efl-capa">{capa.sort((a, b) => String(a.due).localeCompare(String(b.due))).map(c => (
            <div key={c.key} className="efl-capa-r">
              <span><b>{shortName(c.name)}</b><span className="sub">{c.text}</span></span>
              <span className="row gap-s efl-nowrap"><Chip kind={c.due < today ? 'crit' : 'warn'}>{c.due < today ? 'scaduta il ' : 'entro il '}{dateIt(c.due)}</Chip><Btn small kind="ghost" icon={LuCheck} title="Segna come chiusa" onClick={() => close(c)} /></span>
            </div>))}</div> : <p className="small muted efl-pad">Nessuna azione aperta.</p>}
        </Panel>
      </div>
      <Panel title="Valutazione ESG dei fornitori" sub={`${P.label} · spesa dai lotti ricevuti · clic per la scheda del fornitore (valutazione, codice, azioni)`} flush>
        <Table rows={rows} pageSize={30} exportName="fornitori-esg" onRow={r => openDrawer('supplier', r.id)} cols={[
          { key: 'name', label: 'Fornitore', render: r => <span><b>{shortName(r.name)}</b>{r.approval && r.approval !== 'qualificato' && <> <Chip kind="warn">{r.approval}</Chip></>}</span>, csv: r => r.name },
          { key: 'spend', label: 'Spesa', align: 'r', render: r => eurTxt(r.spend), csv: r => Math.round(r.spend) },
          { key: 'eudr', label: 'In ambito EUDR', align: 'r', render: r => (r.eudr?.lots ? <span>{tTxt(r.eudr.t)} t<span className="sub">{pctTxt(r.eudr.refShare)} con DDS</span></span> : '—'), sort: r => r.eudr?.t || 0, csv: r => r.eudr?.t || 0 },
          { key: 'esg', label: 'ESG', align: 'r', render: r => (r.esg != null ? <span>{r.esg}<span className="sub">E {r.E ?? '—'} · S {r.S ?? '—'} · G {r.G ?? '—'}</span></span> : <span className="muted">non valutato</span>), sort: r => r.esg ?? -1, csv: r => r.esg ?? '' },
          { key: 'risk', label: 'Rischio', align: 'r', render: r => <BandChip band={r.risk?.band} score={r.risk?.score} />, sort: r => r.risk?.score ?? 0, csv: r => r.risk?.score ?? '' },
          { key: 'coc', label: 'Codice di condotta', render: r => (r.coc?.signed ? dateIt(r.coc.at) : <Chip kind="outline">non firmato</Chip>), csv: r => r.coc?.at || '', sort: r => r.coc?.at || '' },
          { key: 'nextReview', label: 'Revisione', render: r => (r.nextReview ? <Chip kind={r.reviewDue ? 'warn' : 'outline'}>{dateIt(r.nextReview)}</Chip> : '—'), csv: r => r.nextReview || '' },
          { key: 'capa', label: 'Azioni', align: 'r', render: r => (r.capa?.open ? <Chip kind={r.capa.overdue ? 'crit' : 'warn'}>{r.capa.open}</Chip> : '0'), sort: r => r.capa?.open || 0, csv: r => r.capa?.open || 0 },
        ]} />
      </Panel>
    </>
  );
}

/* ================= moduli per i fornitori ================= */
export function Moduli({ d, today, pick }) {
  const reqs = supplierRequestsView(d, today);
  const [res, setRes] = useState(null);
  const [paste, setPaste] = useState('');
  const redownload = r => {
    const payload = r.payload || requestPayload(d, r);
    download(`feedos-modulo-${r.kind}-${slugName(r.supplierName)}-${r.id}.html`, supplierForm(payload), 'text/html;charset=utf-8');
  };
  const setStatus = (r, status, extra = {}) => { store.update('supplierRequests', r.id, { status, ...extra }, `Richiesta ${r.id} a ${shortName(r.supplierName)}: ${status}`); undoToast(`Richiesta ${status}`); };
  const check = text => setRes(importReply(text, d, { today }));
  const onFile = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) check(await readFile(f)); };
  const apply = () => { store.batch(res.ops, res.label); undoToast('Risposta importata'); setRes(null); setPaste(''); };
  return (
    <>
      <NuovoModulo d={d} today={today} pick={pick} reqs={reqs} />
      <Panel title="Richieste ai fornitori" sub="Ogni modulo porta l’impronta SHA-256 del suo contenuto: la risposta la ripete e si verifica all’importazione" flush>
        <Table rows={reqs} pageSize={20} exportName="richieste-fornitori" empty="Nessuna richiesta inviata" cols={[
          { key: 'id', label: 'Richiesta', render: r => <span className="mono">{r.id}</span> },
          { key: 'supplierName', label: 'Fornitore', render: r => shortName(r.supplierName) },
          { key: 'kind', label: 'Modulo', render: r => <span className="efl-wrap">{r.kindLabel}{r.kind === 'eudr' && r.lots?.length ? <span className="sub">{r.lots.length} lotti</span> : null}</span>, csv: r => r.kindLabel },
          { key: 'sentAt', label: 'Inviata', render: r => dateIt(r.sentAt) },
          { key: 'dueAt', label: 'Entro', render: r => dateIt(r.dueAt) },
          { key: 'status', label: 'Stato', render: r => <ReqChip status={r.status} overdue={r.overdue} />, csv: r => r.status },
          { key: 'formHash', label: 'Impronta del modulo', render: r => <span className="mono xs" title={r.formHash}>{String(r.formHash || '').slice(0, 12)}…</span> },
          { key: 'act', label: '', nosort: true, csv: false, render: r => (
            <span className="row gap-s efl-nowrap">
              <Btn small kind="ghost" icon={LuFileDown} title="Scarica di nuovo il modulo" onClick={() => redownload(r)} />
              {r.open && <Btn small kind="ghost" icon={LuBellRing} title="Segna come sollecitata" onClick={() => setStatus(r, 'sollecitato', { remindedAt: today })} />}
              {r.status === 'ricevuto' && <Btn small kind="ghost" icon={LuCheck} title="Accetta la risposta" onClick={() => setStatus(r, 'accettato')} />}
              {(r.open || r.status === 'ricevuto') && <Btn small kind="ghost" icon={LuX} title="Respingi" onClick={() => confirm('Respingere la richiesta?', <p>La richiesta {r.id} a {r.supplierName} risulterà respinta.</p>, () => setStatus(r, 'respinto'), { ok: 'Respingi', danger: true })} />}
            </span>) },
        ]} />
      </Panel>
      <Panel title="Importa la risposta di un fornitore" sub="File JSON salvato dal modulo con «Salva risposta»: si controllano formato, impronta, richiesta e fornitore, poi si mostrano le differenze"
        actions={<label className="btn small primary"><LuUpload aria-hidden="true" />Scegli il file di risposta<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>}>
        <details className="esh-lin"><summary>Incolla il testo della risposta</summary>
          <textarea className="input efl-ta efl-mt" rows={4} value={paste} onChange={e => setPaste(e.target.value)} aria-label="Testo della risposta" />
          <div className="row gap-s efl-mt"><Btn small disabled={!paste.trim()} onClick={() => check(paste)}>Controlla</Btn></div>
        </details>
        {res && <EsitoRisposta res={res} onApply={apply} onCancel={() => setRes(null)} />}
      </Panel>
    </>
  );
}
function NuovoModulo({ d, today, pick, reqs }) {
  const sups = (d.suppliers || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
  const reg = eudrRegister(d);
  const [v, setV] = useState({ supplierId: sups.some(s => s.id === pick) ? pick : sups.find(s => reg.rows.some(r => r.supplierId === s.id && !r.status.hasRef))?.id || sups[0]?.id || '', kind: 'eudr', lang: 'it', dueAt: addDays(today, 14) });
  const set = p => setV(x => ({ ...x, ...p }));
  const lots = reg.rows.filter(r => r.supplierId === v.supplierId && r.date >= addDays(today, -180)).slice(0, 40);
  const [sel, setSel] = useState(null);
  const chosen = sel || lots.filter(r => r.status.state !== 'completo').map(r => r.id);
  const toggle = id => setSel((sel || chosen).includes(id) ? (sel || chosen).filter(x => x !== id) : [...(sel || chosen), id]);
  if (!sups.length) return null;
  const make = () => {
    let n = reqs.length + 1; const ids = new Set(reqs.map(r => r.id)); while (ids.has(`rq-${n}`)) n++;
    const req = { id: `rq-${n}`, supplierId: v.supplierId, kind: v.kind, lang: v.lang, sentAt: today, dueAt: v.dueAt, status: 'inviato', ...(v.kind === 'eudr' ? { lots: chosen } : {}) };
    const payload = requestPayload(d, req);
    const h = formHash(payload);
    store.batch([{ kind: 'add', coll: 'supplierRequests', obj: { ...req, payload, formHash: h } }], `Modulo «${REQUEST_KINDS[v.kind]}» per ${shortName(sups.find(s => s.id === v.supplierId)?.name)}`);
    download(`feedos-modulo-${v.kind}-${slugName(sups.find(s => s.id === v.supplierId)?.name)}-${req.id}.html`, supplierForm(payload), 'text/html;charset=utf-8');
    toast('Modulo generato: invialo al fornitore (posta elettronica o PEC)', 'ok', { label: 'Annulla', fn: () => store.undo() });
    setSel(null);
  };
  return (
    <Panel title="Nuovo modulo per un fornitore" sub="File HTML autonomo: si apre senza connessione, non contiene collegamenti esterni né ricette, e restituisce un JSON con impronta SHA-256">
      <div className="form">
        <Field label="Fornitore"><Select value={v.supplierId} onChange={x => { set({ supplierId: x }); setSel(null); }} options={sups.map(s => ({ id: s.id, label: shortName(s.name) }))} /></Field>
        <Field label="Modulo"><Select value={v.kind} onChange={x => set({ kind: x })} options={Object.entries(REQUEST_KINDS).map(([id, label]) => ({ id, label }))} /></Field>
        <Field label="Lingua"><Seg options={[{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }]} value={v.lang} onChange={x => set({ lang: x })} label="Lingua del modulo" /></Field>
        <Field label="Risposta entro"><input type="date" className="input" value={v.dueAt} min={today} onChange={e => set({ dueAt: e.target.value })} /></Field>
      </div>
      {v.kind === 'eudr' && (lots.length ? (
        <div className="efl-lotpick">
          <p className="small">Lotti in ambito degli ultimi 180 giorni ({chosen.length} scelti; di base quelli con dati incompleti):</p>
          <div className="efl-chiplist">{lots.map(r => <label key={r.id} className={`efl-pickl${chosen.includes(r.id) ? ' on' : ''}`}><input type="checkbox" checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} /> {r.code} · {dateIt(r.date, 'dm')} · {tTxt(r.t)} t{r.status.hasRef ? '' : ' · senza DDS'}</label>)}</div>
        </div>) : <p className="small muted efl-mt">Nessun lotto in ambito di questo fornitore negli ultimi 180 giorni: il modulo EUDR serve per i fornitori di soia e palma.</p>)}
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuFileDown} disabled={!v.supplierId || (v.kind === 'eudr' && !chosen.length)} onClick={make}>Genera e scarica il modulo</Btn></div>
    </Panel>
  );
}
function EsitoRisposta({ res, onApply, onCancel }) {
  return (
    <div className="efl-esito">
      <div className="row gap-s">
        {res.hashOk ? <Chip kind="good" icon={LuShieldCheck}>impronta verificata</Chip> : <Chip kind="crit" icon={LuShieldAlert}>impronta non valida</Chip>}
        {res.formOk === true && <Chip kind="good">stesso modulo inviato</Chip>}
        {res.formOk === false && <Chip kind="warn">modulo diverso</Chip>}
        {res.supplier && <Chip kind="outline">{shortName(res.supplier.name)}</Chip>}
        {res.kind && <Chip kind="outline">{REQUEST_KINDS[res.kind]}</Chip>}
      </div>
      {res.errors.length > 0 && <div className="note crit small efl-mt">{res.errors.map((x, i) => <div key={i}>{x}</div>)}</div>}
      {res.warnings.length > 0 && <div className="note small efl-mt">{res.warnings.slice(0, 12).map((x, i) => <div key={i}>{x}</div>)}</div>}
      {res.ok && (res.changes.length ? (
        <div className="tw efl-mt"><table className="t"><thead><tr><th>Dove</th><th>Campo</th><th>Prima</th><th>Dopo</th></tr></thead>
          <tbody>{res.changes.slice(0, 80).map((c, i) => <tr key={i}><td>{c.target}</td><td>{c.label}</td><td className="muted">{fmtVal(c.from)}</td><td><b>{fmtVal(c.to)}</b></td></tr>)}</tbody></table></div>
      ) : <p className="small muted efl-mt">Nessuna differenza con i dati attuali.</p>)}
      {res.ok && res.plots?.length > 0 && <p className="small efl-mt">Appezzamenti: {res.plots.map(p => `${p.lot}: ${p.count} (${nf(p.areaHa, 1)} ha${p.ok ? '' : ', con errori'})`).join(' · ')}</p>}
      <div className="row gap-s efl-mt">{res.ok && <Btn small kind="primary" icon={LuSave} onClick={onApply}>Applica (un solo passo annullabile)</Btn>}<Btn small kind="ghost" onClick={onCancel}>Chiudi</Btn></div>
    </div>
  );
}
const fmtVal = v => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v));

/* ================= lettere ai clienti ================= */
export function Clienti({ d, P, pick }) {
  const tons = useMemo(() => { const m = new Map(); for (const s of d.shipments || []) if (s.date >= P.from && s.date <= P.to) m.set(s.customerId, (m.get(s.customerId) || 0) + (+s.tonnes || 0)); return m; }, [d, P.key]);
  const custs = (d.customers || []).filter(c => tons.has(c.id)).sort((a, b) => tons.get(b.id) - tons.get(a.id));
  const [cid, setCid] = useState(custs.some(c => c.id === pick) ? pick : custs[0]?.id || '');
  const [lang, setLang] = useState('it');
  const L = useMemo(() => (cid ? customerEudrLetter(d, cid, P, lang) : null), [d, cid, P.key, lang]);
  if (!custs.length) return <Panel title="Lettere EUDR ai clienti"><Empty icon={LuFileText} title="Nessuna consegna nel periodo">La lettera nasce dalle consegne del cliente e dalla tracciabilità dei lotti.</Empty></Panel>;
  const csv = () => downloadCsv(`lettera-eudr-${slugName(L.customer.name)}`, L.rows, L.cols.map(c => ({ label: c.label, value: r => r[c.key] })));
  const copy = () => { try { navigator.clipboard.writeText(L.text).then(() => toast('Testo copiato', 'ok')); } catch { toast('Copia non disponibile: usa «Testo»', 'err'); } };
  return (
    <>
      <Panel title="Lettera EUDR per un cliente" sub="Dalle consegne del periodo ai lotti prodotti e ai lotti di materie prime in ambito: solo riferimenti tracciati" id="efl-lettera"
        actions={<>
          <Select value={cid} onChange={setCid} ariaLabel="Cliente" options={custs.map(c => ({ id: c.id, label: `${c.name} · ${nf(tons.get(c.id), 0)} t` }))} />
          <Seg options={[{ id: 'it', label: 'IT' }, { id: 'en', label: 'EN' }]} value={lang} onChange={setLang} label="Lingua della lettera" />
        </>}>
        {L && <div className="kpis">
          <Kpi label="Consegne nel periodo" value={nf(L.totals.nShip)} foot={`${tTxt(L.totals.tShip)} t`} />
          <Kpi label="Materie prime in ambito" value={tTxt(L.totals.tIn)} unit="t" foot={`${nf(L.totals.nLots)} lotti di arrivo`} />
          <Kpi label="Con riferimento DDS" value={pctTxt(L.totals.shareWithRef)} status={L.totals.shareWithRef == null ? undefined : L.totals.shareWithRef >= 0.95 ? 'ok' : 'warn'} foot={L.totals.nMissing ? `${L.totals.nMissing} lotti in acquisizione` : 'tutti i lotti'} />
          <Kpi label="Soia DCF fisica nei lotti" value={tTxt(L.dcf.t)} unit="t" foot={L.dcf.allowed ? (L.dcf.schemes.join(', ') || '—') : 'dichiarazione bloccata'} status={L.dcf.allowed ? undefined : 'bad'} />
        </div>}
        {L?.warnings.length > 0 && <div className="note crit small">{L.warnings.join(' · ')}</div>}
        <div className="row gap-s efl-mt">
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuDownload} onClick={() => downloadText(`lettera-eudr-${slugName(L.customer.name)}`, 'txt', L.text)}>Testo</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={() => downloadText(`lettera-eudr-${slugName(L.customer.name)}`, 'md', L.markdown, 'text/markdown;charset=utf-8')}>Markdown</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={csv}>CSV dei riferimenti</Btn>
          <Btn small kind="ghost" icon={LuCopy} onClick={copy}>Copia</Btn>
        </div>
      </Panel>
      {L && (
        <PrintPage title={L.title} period={L.period.label} issued={L.issuedAt} className="efl-letter" footer={L.lang === 'en' ? 'Letter generated with FeedOS from traceability data' : 'Lettera generata con FeedOS dai dati di tracciabilità'}>
          <p className="efl-l-to"><b>{L.customer.name}</b></p>
          <p><b>{L.subject}</b></p>
          <p>{L.salutation}</p>
          {L.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          <h3>{L.tableTitle}</h3>
          <div className="tw"><table className="t efl-l-t"><thead><tr>{L.cols.map(c => <th key={c.key} className={c.key === 't' ? 'r' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{L.rows.map(r => <tr key={r.ingLotId} className={r.missing ? 'efl-l-miss' : ''}>{L.cols.map(c => <td key={c.key} className={c.key === 't' ? 'r' : c.key === 'ref' ? 'mono' : ''}>{c.key === 't' ? nf(r.t, 2) : r[c.key]}</td>)}</tr>)}</tbody></table></div>
          <p className="efl-l-sign">{L.regards}<br /><b>{L.signature}</b></p>
          <p className="xs">{L.disclaimer}</p>
          <p className="xs no-print efl-l-draft">{L.draftNote}</p>
        </PrintPage>
      )}
    </>
  );
}
