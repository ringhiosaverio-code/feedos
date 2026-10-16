/* FeedOS 16 · Dati: archivio (backup, ripristino, istantanee, demo), importazioni CSV e da FeedOS 15,
 * registro delle modifiche, impostazioni dell'impresa, dell'energia e dell'aspetto. */
import React, { useEffect, useRef, useState } from 'react';
import { LuDownload, LuUpload, LuRefreshCw, LuDatabase, LuCamera, LuTrash2, LuRotateCcw, LuFileSpreadsheet, LuShieldCheck, LuTriangleAlert, LuCheck, LuInfo } from 'react-icons/lu';
import { useData, useStore, store, toast, getState } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday } from '../core/derived.js';
import { ROLES, ROLE } from '../core/roles.js';
import { nf, sf, dateIt, round, norm } from '../core/util.js';
import { download, toCSV, parseCSV, num, readFile, stamp } from '../core/io.js';
import { listSnapshots, getSnapshot, deleteSnapshot, saveSnapshot, quota, storageMode } from '../core/persist.js';
import { demoData, starterData } from '../data/demo/index.js';
import { migrateF15, detectF15 } from '../core/migrate.js';
import { GRID_FACTORS } from '../engine/energy.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv } from '../ui/ui.jsx';
import { NAV } from '../app/nav.js';
import { VERSION } from '../app/version.js';

export function Dati({ route }) {
  const d = useData();
  const tab = route.tab || 'archivio';
  return (
    <>
      <PageHead title="Dati" lead="I dati restano in questo browser: nessun invio a server. Da qui si salvano e si ripristinano, si importano listini, giacenze, quotazioni e i dati di FeedOS 15, si consulta il registro delle modifiche e si impostano impresa ed energia."
        tabs={NAV.dati.tabs} tab={tab} onTab={t => go('dati', t)} />
      {tab === 'archivio' && <Archivio d={d} hi={route.id} />}
      {tab === 'importa' && <Importa d={d} />}
      {tab === 'registro' && <Registro d={d} />}
      {tab === 'impostazioni' && <Impostazioni d={d} />}
    </>
  );
}

/* ---------------- archivio ---------------- */
function Archivio({ d, hi }) {
  const mode = useStore(s => s.saveMode), last = useStore(s => s.lastSaved), saving = useStore(s => s.saving);
  const [snaps, setSnaps] = useState(null), [q, setQ] = useState(null);
  const fileRef = useRef(null);
  const refresh = () => listSnapshots().then(setSnaps);
  useEffect(() => { refresh(); quota().then(setQ); }, [d]);
  const counts = [['Materie prime', d.ingredients], ['Formule', d.formulas], ['Prodotti', d.products], ['Clienti', d.customers], ['Lotti di prodotto', d.lots], ['Lotti di materie prime', d.ingLots], ['Registrazioni di produzione', d.runs], ['Consegne', d.shipments], ['Reclami', d.complaints], ['Offerte', d.offers]];
  const backup = () => { download(`feedos16-backup-${stamp()}.json`, JSON.stringify({ format: 'feedos16', version: VERSION, exportedAt: new Date().toISOString(), data: getState().data }), 'application/json'); toast('Backup esportato: conservalo fuori dal browser'); };
  const restore = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      if (f.size > 60e6) throw new Error('File troppo grande (massimo 60 MB).');
      const raw = await readFile(f);
      if (/"(?:__proto__|constructor|prototype)"\s*:/.test(raw)) throw new Error('Il file contiene chiavi non ammesse.');
      const j = JSON.parse(raw);
      if (detectF15(j)) { toast('È un file di FeedOS 15: usa «Importa › Da FeedOS 15»', 'err'); go('dati', 'importa'); return; }
      const data = j.format === 'feedos16' ? j.data : j.settings?.schema === 16 ? j : null;
      if (!data || !Array.isArray(data.formulas)) throw new Error('Formato non riconosciuto: serve un backup di FeedOS 16.');
      confirm('Ripristinare il backup?', <p>L’archivio attuale verrà sostituito dal backup del {j.exportedAt ? dateIt(j.exportedAt.slice(0, 10)) : 'file scelto'}. Prima viene salvata un’istantanea dei dati attuali.</p>, async () => { await store.load(data, 'Ripristino da backup'); toast('Backup ripristinato'); refresh(); }, { ok: 'Ripristina' });
    } catch (err) { toast('Ripristino non riuscito: ' + err.message, 'err'); }
  };
  const regenerate = () => confirm('Rigenerare il mangimificio dimostrativo?', <p>Il mangimificio di fantasia viene ricreato con la data di oggi. L’archivio attuale viene prima salvato in un’istantanea.</p>, async () => { await store.load(demoData(), 'Demo rigenerata'); toast('Dati dimostrativi rigenerati'); go('oggi'); }, { ok: 'Rigenera' });
  const fresh = () => confirm('Iniziare con i tuoi dati?', <><p>L’archivio riparte vuoto, con le materie prime e le specifiche di esempio da verificare e completare. Nessun cliente, lotto o movimento.</p><p className="small muted">Prima viene salvata un’istantanea dei dati attuali: si possono sempre ripristinare.</p></>, async () => { await store.load(starterData(d.settings), 'Nuovo archivio aziendale'); toast('Archivio pronto: inizia da Formulazione › Materie prime'); go('formulazione', 'materie'); }, { ok: 'Inizia', danger: true });
  const snapshot = async () => { const ok = await saveSnapshot(getState().data, 'Istantanea manuale', false); toast(ok ? 'Istantanea salvata' : 'Istantanea non riuscita', ok ? 'ok' : 'err'); refresh(); };
  const restoreSnap = s => confirm('Ripristinare questa istantanea?', <p>«{s.label}» del {new Date(s.id).toLocaleString('it-IT')}. L’archivio attuale viene prima salvato.</p>, async () => { const x = await getSnapshot(s.id); if (!x) { toast('Istantanea non trovata', 'err'); return; } await store.load(x.data, 'Ripristino istantanea'); toast('Istantanea ripristinata'); refresh(); }, { ok: 'Ripristina' });
  return (
    <>
      <div className="kpis">
        <Kpi label="Archivio" value={d.settings?.dataset === 'demo' ? 'Dimostrativo' : d.settings?.dataset === 'vuoto' ? 'Vuoto' : 'Aziendale'} foot={d.settings?.dataset === 'demo' ? `mangimificio di fantasia al ${dateIt(d.settings.demoAnchor)}` : d.settings?.company?.name} />
        <Kpi label="Salvataggio" value={mode === 'idb' ? 'Automatico' : mode === 'local' ? 'Ridotto' : 'Solo memoria'} foot={mode === 'idb' ? `IndexedDB · ${last ? 'ultimo ' + new Date(last).toLocaleTimeString('it-IT') : saving}` : mode === 'local' ? 'localStorage: esporta spesso' : 'il browser non consente il salvataggio'} />
        <Kpi label="Spazio usato" value={q?.used != null ? nf(q.used / 1e6, 1) : '—'} unit="MB" foot={q?.total ? `disponibili circa ${nf(q.total / 1e9, 1)} GB` : 'stima non disponibile'} />
        <Kpi label="Istantanee" value={snaps ? snaps.length : '…'} foot="automatiche giornaliere e manuali" />
      </div>
      <div className="split">
        <div className="stack">
          <Panel title="Salva e ripristina" sub="Il backup è un unico file JSON con tutto l’archivio" id="dati-backup" className={hi === 'backup' ? 'hilite' : ''}>
            <div className="row">
              <Btn kind="primary" icon={LuDownload} onClick={backup}>Esporta backup completo</Btn>
              <Btn icon={LuUpload} onClick={() => fileRef.current?.click()}>Ripristina da backup</Btn>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
              <Btn icon={LuCamera} onClick={snapshot}>Crea istantanea ora</Btn>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>Consiglio: esporta un backup ogni settimana e prima di cambiare computer o browser. Svuotare i dati di navigazione cancella anche l’archivio locale.</p>
          </Panel>
          <Panel title="Istantanee" sub="Copie dell’archivio salvate in questo browser prima di ogni sostituzione e una volta al giorno" flush>
            {snaps == null ? <p className="small muted" style={{ padding: 16 }}>Lettura…</p> :
              <Table rows={snaps} rowKey={s => s.id} pageSize={12} cols={[
                { key: 'id', label: 'Quando', render: s => new Date(s.id).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) },
                { key: 'label', label: 'Descrizione', render: s => <>{s.label}{s.auto && <span className="sub">automatica</span>}</> },
                { key: 'size', label: 'Dimensione', align: 'r', render: s => nf(s.size / 1e6, 2) + ' MB' },
                { key: 'x', label: '', nosort: true, render: s => <span className="row gap-s" style={{ justifyContent: 'flex-end' }}><Btn small icon={LuRotateCcw} onClick={() => restoreSnap(s)}>Ripristina</Btn><Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={async () => { await deleteSnapshot(s.id); refresh(); }} /></span> },
              ]} empty="Nessuna istantanea ancora." />}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Contenuto dell’archivio">
            <Kv items={counts.map(([k, a]) => [k, nf(a?.length || 0)])} />
          </Panel>
          <Panel title="Cambia archivio" sub="Ogni sostituzione salva prima un’istantanea">
            <div className="stack" style={{ gap: 10 }}>
              <Btn icon={LuRefreshCw} onClick={regenerate}>Rigenera il mangimificio dimostrativo</Btn>
              <Btn icon={LuDatabase} onClick={fresh}>Inizia con i dati della tua azienda</Btn>
              <p className="small muted">Il mangimificio dimostrativo è inventato: numeri coerenti tra loro ma non riferiti a imprese reali.</p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- importa ---------------- */
const KINDS = {
  prezzi: { label: 'Prezzi delle materie prime', cols: ['codice', 'prezzo'], hint: 'codice (es. MP01) o nome; prezzo in €/t', template: [['codice', 'nome', 'prezzo'], ['MP01', 'Mais granella', '231,50'], ['MP07', 'Farina di estrazione di soia 44%', '392']] },
  giacenze: { label: 'Giacenze delle materie prime', cols: ['codice', 'scorta'], hint: 'codice o nome; scorta in tonnellate', template: [['codice', 'nome', 'scorta'], ['MP01', 'Mais granella', '812,4'], ['MP02', 'Orzo', '64']] },
  quotazioni: { label: 'Quotazioni di mercato', cols: ['data', 'prodotto', 'prezzo'], hint: 'data (gg/mm/aaaa o aaaa-mm-gg); prodotto come nell’elenco dei mercati; prezzo €/t', template: [['data', 'prodotto', 'prezzo'], ['2026-09-17', 'Mais nazionale', '224']] },
};
function Importa({ d }) {
  const I = idx(d);
  const [kind, setKind] = useState('prezzi');
  const [rows, setRows] = useState(null), [fname, setFname] = useState('');
  const [mig, setMig] = useState(null);
  const K = KINDS[kind];
  const findIng = r => { const c = norm(r.codice || r.code || ''), n = norm(r.nome || r.name || r.materia || ''); return d.ingredients.find(i => (c && norm(i.code) === c) || (n && norm(i.name) === n)) || (c ? d.ingredients.find(i => norm(i.name) === c) : null); };
  const commodities = [...new Map(d.market.map(m => [m.commodity, m.label])).entries()];
  const parseDate = s => { const t = String(s || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { rows: rs } = parseCSV(await readFile(f));
      const low = rs.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k).replace(/[^a-z]/g, ''), v])));
      const out = low.map(r => {
        if (kind === 'quotazioni') { const date = parseDate(r.data), p = num(r.prezzo), com = commodities.find(([id, l]) => norm(l) === norm(r.prodotto) || id === norm(r.prodotto)); return { r, ok: !!(date && p && com), date, price: p, com: com?.[0], label: com?.[1] || r.prodotto }; }
        const ing = findIng(r), v = num(kind === 'prezzi' ? r.prezzo : r.scorta);
        return { r, ok: !!ing && v != null && v >= 0, ing, v, old: ing ? (kind === 'prezzi' ? ing.price : ing.stock) : null };
      });
      setRows(out); setFname(f.name);
    } catch (err) { toast('Lettura non riuscita: ' + err.message, 'err'); }
  };
  const apply = () => {
    const ok = rows.filter(x => x.ok);
    if (!ok.length) return;
    if (kind === 'quotazioni') store.batch(ok.map(x => ({ kind: 'add', coll: 'market', obj: { commodity: x.com, label: x.label, date: x.date, price: x.price, source: 'Importazione ' + fname } })), `Importate ${ok.length} quotazioni`);
    else store.batch(ok.map(x => ({ kind: 'update', coll: 'ingredients', id: x.ing.id, patch: kind === 'prezzi' ? { price: x.v, priceDate: appToday(d) } : { stock: x.v } })), `Importati ${ok.length} ${kind === 'prezzi' ? 'prezzi' : 'valori di giacenza'} da ${fname}`);
    toast(`${ok.length} righe applicate: formule, costi e segnali ricalcolati`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    setRows(null);
  };
  const onF15 = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const raw = await readFile(f);
      if (/"(?:__proto__|constructor|prototype)"\s*:/.test(raw)) throw new Error('Il file contiene chiavi non ammesse.');
      const r = migrateF15(JSON.parse(raw), starterData(d.settings));
      setMig({ ...r, fname: f.name });
    } catch (err) { toast(err.message, 'err'); }
  };
  return (
    <div className="split">
      <Panel title="Importa da un foglio di calcolo" sub="File CSV con separatore «;» (Excel in italiano) o «,»: prima si vede l’anteprima, poi si applica" id="dati-csv">
        <div className="stack" style={{ gap: 12 }}>
          <Seg options={Object.entries(KINDS).map(([k, v]) => ({ id: k, label: v.label }))} value={kind} onChange={k => { setKind(k); setRows(null); }} label="Tipo di dati" />
          <p className="small muted">Colonne: {K.hint}.</p>
          <div className="row">
            <label className="btn primary"><LuUpload aria-hidden="true" />Scegli il file CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={onFile} /></label>
            <Btn icon={LuFileSpreadsheet} onClick={() => download(`modello-${kind}.csv`, '﻿' + K.template.map(r => r.join(';')).join('\r\n'), 'text/csv;charset=utf-8')}>Scarica il modello</Btn>
          </div>
          {rows && (
            <>
              <div className={`note ${rows.every(x => x.ok) ? 'good' : 'maize'}`}>{fname}: {rows.filter(x => x.ok).length} righe riconosciute su {rows.length}. Le righe non riconosciute non vengono applicate.</div>
              <div className="tw tall"><table className="t">
                <thead><tr>{kind === 'quotazioni' ? <><th>Data</th><th>Prodotto</th><th className="r">€/t</th></> : <><th>Materia prima</th><th className="r">Attuale</th><th className="r">Nuovo</th><th className="r">Variazione</th></>}<th>Esito</th></tr></thead>
                <tbody>{rows.slice(0, 200).map((x, i) => <tr key={i}>
                  {kind === 'quotazioni' ? <><td>{x.date ? dateIt(x.date) : x.r.data}</td><td>{x.label}</td><td className="r">{nf(x.price, 1)}</td></> :
                    <><td>{x.ing ? <><span className="code">{x.ing.code}</span> {x.ing.name}</> : (x.r.codice || x.r.nome)}</td><td className="r">{nf(x.old, 1)}</td><td className="r"><b>{nf(x.v, 1)}</b></td><td className="r">{x.old ? sf((x.v / x.old - 1) * 100, 1) + '%' : '—'}</td></>}
                  <td>{x.ok ? <Chip kind="good" icon={LuCheck}>ok</Chip> : <Chip kind="warn">non riconosciuta</Chip>}</td></tr>)}</tbody>
              </table></div>
              <div className="row"><Btn kind="primary" icon={LuCheck} onClick={apply} disabled={!rows.some(x => x.ok)}>Applica {rows.filter(x => x.ok).length} righe</Btn><Btn kind="ghost" onClick={() => setRows(null)}>Annulla</Btn></div>
            </>
          )}
        </div>
      </Panel>
      <Panel title="Da FeedOS 15" sub="Backup completo («feedos-7-backup-….json») o progetto di formulazione («feedos-6.1-progetto.json»)" id="dati-f15">
        <div className="stack" style={{ gap: 12 }}>
          <p className="small">Si importano materie prime con i valori nutrizionali riconosciuti, la specifica del progetto, la composizione come formula in bozza e i valori degli indicatori ESG. Prodotti, preventivi e registrazioni di FeedOS 15 non hanno un corrispondente sicuro e vengono elencati senza essere inventati.</p>
          <label className="btn"><LuUpload aria-hidden="true" />Scegli il file di FeedOS 15<input type="file" accept="application/json,.json" hidden onChange={onF15} /></label>
          {mig && (
            <>
              <div className="note good"><b>{mig.fname}</b> ({mig.kind === 'backup' ? 'backup completo' : 'progetto di formulazione'}): {mig.report.length ? mig.report.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ') : 'nessun dato importabile'}.</div>
              {mig.skipped.length > 0 && <div className="note maize">Non importati: {mig.skipped.join('; ')}.</div>}
              <div className="row"><Btn kind="primary" icon={LuDatabase} onClick={() => confirm('Creare un archivio con i dati di FeedOS 15?', <p>L’archivio attuale viene salvato in un’istantanea e sostituito. Le formule importate restano in bozza finché non le approvi.</p>, async () => { await store.load(mig.data, 'Importazione da FeedOS 15'); setMig(null); toast('Dati di FeedOS 15 importati'); go('formulazione', 'formule'); }, { ok: 'Importa' })}>Crea l’archivio</Btn><Btn kind="ghost" onClick={() => setMig(null)}>Annulla</Btn></div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- registro ---------------- */
function Registro({ d }) {
  const [q, setQ] = useState('');
  const view = filterRows(d.events, q, ['label', 'role', 'coll']);
  return (
    <Panel title="Registro delle modifiche" sub="Ultime 800 modifiche con data, vista usata e descrizione (le viste non sono utenti: servono a organizzare il lavoro)" flush
      actions={<><SearchBox value={q} onChange={setQ} placeholder="Cerca nel registro" id="log-search" /><Btn small icon={LuDownload} onClick={() => download(`registro-${stamp()}.csv`, toCSV(view, [{ label: 'Quando', value: e => e.at }, { label: 'Vista', value: e => ROLE[e.role]?.label || e.role }, { key: 'label', label: 'Modifica' }, { key: 'coll', label: 'Archivio' }]), 'text/csv;charset=utf-8')}>CSV</Btn></>}>
      <Table rows={view} rowKey={e => e.id} pageSize={50} cols={[
        { key: 'at', label: 'Quando', render: e => <span className="nowrap">{new Date(e.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' })}</span> },
        { key: 'role', label: 'Vista', render: e => ROLE[e.role]?.short || e.role },
        { key: 'label', label: 'Modifica' },
        { key: 'coll', label: 'Archivio', render: e => <span className="small muted">{e.coll}</span> },
      ]} empty="Nessuna modifica registrata." />
    </Panel>
  );
}

/* ---------------- impostazioni ---------------- */
function Impostazioni({ d }) {
  const s = d.settings || {}; const c = s.company || {}; const en = s.energy || {};
  const setC = patch => store.settings(st => ({ ...st, company: { ...st.company, ...patch } }), 'Impostazioni dell’impresa');
  const setE = patch => store.settings(st => ({ ...st, energy: { ...st.energy, ...patch } }), 'Impostazioni dell’energia');
  const Txt = ({ label, k, hint }) => <Field label={label} hint={hint}><input className="input" defaultValue={c[k] || ''} onBlur={e => e.target.value !== (c[k] || '') && setC({ [k]: e.target.value })} /></Field>;
  return (
    <div className="split">
      <div className="stack">
        <Panel title="Impresa" sub="Compare su cartellini, passaporti di prodotto e report">
          <div className="form">
            <Txt label="Ragione sociale" k="name" /><Txt label="Nome breve" k="short" /><Txt label="Stabilimento" k="site" /><Txt label="Numero di riconoscimento" k="approval" hint="Reg. (CE) 183/2005" />
          </div>
          <div style={{ marginTop: 12 }}><Txt label="Indirizzo" k="address" /></div>
        </Panel>
        <Panel title="Energia ed emissioni" sub="Usati per il costo pieno, la CO₂ e gli indicatori ESG">
          <div className="form">
            <Field label="Prezzo elettricità €/kWh"><NumInput value={en.kwhPrice} decimals={4} onChange={v => v != null && setE({ kwhPrice: v })} /></Field>
            <Field label="Prezzo GPL €/kg"><NumInput value={en.gplPrice} decimals={3} onChange={v => v != null && setE({ gplPrice: v })} /></Field>
            <Field label="Fattore di rete kg CO₂/kWh" hint={GRID_FACTORS.find(g => g.id === en.gridFactor)?.label || 'personalizzato'}><NumInput value={en.feGrid} decimals={4} onChange={v => v != null && setE({ feGrid: v, gridFactor: GRID_FACTORS.find(g => g.value === v)?.id || '' })} /></Field>
            <Field label="Fattore GPL kg CO₂/kg"><NumInput value={en.feGpl} decimals={4} onChange={v => v != null && setE({ feGpl: v })} /></Field>
            <Field label="Prezzo del latte €/kg" hint="per il reddito sul costo alimentare"><NumInput value={s.milkPrice} decimals={3} onChange={v => v != null && store.settings({ milkPrice: v }, 'Prezzo del latte')} /></Field>
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Aspetto">
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Tema"><Seg options={[{ id: 'auto', label: 'Automatico' }, { id: 'light', label: 'Chiaro' }, { id: 'dark', label: 'Scuro' }]} value={s.theme || 'auto'} onChange={v => store.settings({ theme: v })} label="Tema" /></Field>
            <Field label="Dimensione del testo" hint="«Aula» ingrandisce tutto per proiettore e seduta di laurea"><Seg options={[{ id: 'normale', label: 'Normale' }, { id: 'aula', label: 'Aula' }]} value={s.size || 'normale'} onChange={v => store.settings({ size: v })} label="Dimensione" /></Field>
            <Field label="Vista per ruolo"><Select value={s.role || 'direzione'} onChange={v => store.settings({ role: v }, 'Vista: ' + ROLE[v]?.label)} options={ROLES.map(r => ({ id: r.id, label: r.label }))} /></Field>
          </div>
        </Panel>
        <Panel title="Come funziona FeedOS 16">
          <ul className="steplist">
            <li><span><b>Locale e privato:</b> un solo file HTML, funziona anche senza rete; i dati restano in questo browser (IndexedDB) finché non esporti un backup.</span></li>
            <li><span><b>Le viste non sono permessi:</b> cambiano ordine del menu e priorità di «Oggi»; chiunque usi questo browser vede tutti i dati.</span></li>
            <li><span><b>Ogni modifica è annullabile</b> (Ctrl Z) e resta nel registro; le sostituzioni dell’archivio salvano prima un’istantanea.</span></li>
            <li><span><b>Calcoli trasparenti:</b> programmazione lineare con prezzi ombra per le formule, tolleranze di legge, metodo della tesi per energia e CO₂; nessuna scatola nera.</span></li>
          </ul>
          <p className="xs muted" style={{ marginTop: 10 }}>FeedOS {VERSION} · archivio schema {s.schema} · salvataggio {storageMode()}</p>
        </Panel>
      </div>
    </div>
  );
}
