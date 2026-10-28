/* FeedOS 18 · ESG › Impronta mangimi: registri del pacchetto.
 * fattori (#esg.passaporto.fattori): fattori delle materie prime per origine, schema e catena di custodia, valori di letteratura da
 *   adottare, importazione CSV con le colonne dell'esportazione GFLI, circolarità delle materie prime;
 * imballaggi (#esg.passaporto.imballaggi): schede per confezione (materiali, peso, riciclato, riciclabilità), imballaggi immessi sul
 *   mercato, riepilogo per materiale (CONAI), scadenze del regolamento imballaggi (PPWR);
 * scambio (#esg.passaporto.scambio): esportazione in forma PACT v3, importazione delle impronte dei fornitori (PACT, TfS, moduli),
 *   registro delle impronte dichiarate, pacchetto dati MI5.7. Prefisso epc-. Scritture con store.batch ed etichetta italiana. */
import React, { useMemo, useState } from 'react';
import { LuUpload, LuDownload, LuPlus, LuTrash2, LuSave, LuX, LuBookOpen, LuPackage, LuArrowRightLeft, LuCheck } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { parseCSV, readFile } from '../core/io.js';
import { nf, dateIt, slug } from '../core/util.js';
import { sha256HexSync } from '../core/hash.js';
import { ingredientsInUse, pcfSettings } from '../engine/esg-pcf.js';
import { packRowsFor, familyOf, circOf, packList, packInfo, originLabel, matKey, packagingSpecFor } from '../engine/esg-pcf-core.js';
import { pactExport, pactImport, pendingReplies, importReply, gfliPreview, mi57Package, PACT_LABEL, MI57_LABEL } from '../engine/esg-pcf-exchange.js';
import { CO_CLASSES, PACK_MATERIALS } from '../data/pack-pcf.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, Kv, NumInput, confirm } from '../ui/ui.jsx';
import { StackBar, Legend } from '../ui/charts.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { StatusChip, Disclaimer } from './esg-shared.jsx';
import { kgTxt, tTxt, pctTxt, undoToast, downloadCsv, downloadJson, SourceChip, DqrChip, shortName } from './esg-pcf-ui.jsx';

const A = x => (Array.isArray(x) ? x : []);
const ingName = (d, id) => A(d.ingredients).find(i => i.id === id)?.name || id;
const newId = (d, coll, base) => { let id = base, n = 2; const ids = new Set(A(d[coll]).map(r => r.id)); while (ids.has(id)) id = `${base}-${n++}`; return id; };

/* ================= fattori delle materie prime ================= */
export function Fattori({ d, today, S }) {
  const inUse = ingredientsInUse(d);
  const [open, setOpen] = useState(null);
  const generic = inUse.filter(x => x.ef.source === 'anagrafica' || x.ef.source === 'mancante');
  const adoptable = generic.filter(x => packRowsFor(d, A(d.ingredients).find(i => i.id === x.ingId)).length);
  const year = +String(today).slice(0, 4);
  const adopt = () => {
    const objs = [];
    for (const x of adoptable) for (const it of packRowsFor(d, A(d.ingredients).find(i => i.id === x.ingId))) {
      objs.push({ id: newId({ efIngredients: [...A(d.efIngredients), ...objs] }, 'efIngredients', `ef-${x.ingId}-${slug(it.id)}`), ingId: x.ingId, origin: it.origin, scheme: it.scheme || null, coc: it.coc || null, total: it.total, fossil: it.fossil, landMgmt: it.landMgmt, luc: it.luc, biogenic: 0,
        landM2a: it.landM2a, low: it.low, high: it.high, allocation: it.allocation || 'economica', includesTransportTo: it.includesTransportTo, db: it.db, dbVersion: it.dbVersion, year: it.year, dqr: 4, status: it.status, source: it.source, note: it.note || it.label });
    }
    if (objs.length && store.batch([{ kind: 'addMany', coll: 'efIngredients', objs }], `Fattori di letteratura adottati (${objs.length})`)) undoToast(`${objs.length} fattori di letteratura aggiunti al registro`);
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Materie prime nelle formule attive" value={nf(inUse.length)} foot={`${nf(S.registry.rows)} righe nel registro`} />
        <Kpi label="Con fattore del registro" value={nf(inUse.filter(x => x.ef.source === 'registro').length)} foot="origine, banca dati e anno" />
        <Kpi label="Dichiarate dal fornitore" value={nf(S.registry.supplier)} foot={`${nf(S.registry.validPcfs)} impronte valide oggi`} />
        <Kpi label="Solo anagrafica" value={nf(generic.length)} status={generic.length ? 'warn' : 'ok'} foot="valore senza fonte (qualità 5)" />
        <Kpi label="Banche dati" value={nf(S.registry.dbs.length)} foot={S.registry.dbs.slice(0, 2).join(' · ') || 'nessuna'} />
      </div>
      <Panel title="Materie prime delle formule attive" sub="Fattore usato oggi (kg CO₂e per t) secondo l’ordine: fornitore, registro per origine e schema, riga generica, anagrafica, letteratura · clic per i fattori della materia prima" flush id="epc-fattori"
        actions={adoptable.length ? <Btn small icon={LuBookOpen} onClick={() => confirm('Adottare i valori di letteratura?', `Per ${adoptable.length} materie prime con il solo valore dell’anagrafica si aggiungono al registro i valori di letteratura del pacchetto (con fonte, anno e stato «da verificare»), per ogni origine disponibile. Restano modificabili e vanno sostituiti con la banca dati GFLI quando disponibile.`, adopt, { ok: 'Adotta' })}>Adotta i valori di letteratura ({adoptable.length})</Btn> : null}>
        <Table rows={inUse.map(x => ({ ...x, id: x.ingId }))} onRow={x => setOpen(o => (o === x.ingId ? null : x.ingId))} selected={open} pageSize={40} exportName="impronta-fattori-in-uso" cols={[
          { key: 'name', label: 'Materia prima', render: x => <><b>{x.name}</b><span className="sub">{x.formulas.length} formule · fino a {nf(x.kgT)} kg/t</span></> },
          { key: 'total', label: 'kg CO₂e/t', align: 'r', sort: x => x.ef.total, csv: x => x.ef.total, render: x => (x.ef.total == null ? <Chip kind="crit">mancante</Chip> : <b>{nf(x.ef.total)}</b>) },
          { key: 'source', label: 'Fonte', sort: x => x.ef.step, csv: x => x.ef.source, render: x => <span className="row gap-s epc-nowrap"><SourceChip source={x.ef.source} /><DqrChip q={x.ef.dqr} /></span> },
          { key: 'origin', label: 'Origine', csv: x => x.ef.origin || '*', render: x => <span className="small">{x.ef.origin && x.ef.origin !== '*' ? originLabel(x.ef.origin) : 'generica'}{x.ef.scheme ? ` · ${x.ef.scheme}` : ''}</span> },
          { key: 'db', label: 'Banca dati', csv: x => `${x.ef.db || ''} ${x.ef.dbVersion || ''}`.trim(), render: x => <span className="small epc-wrap">{x.ef.db ? `${x.ef.db}${x.ef.dbVersion ? ' ' + x.ef.dbVersion : ''}${x.ef.year ? ` (${x.ef.year})` : ''}` : <span className="muted">{x.ef.ref || '—'}</span>}</span> },
          { key: 'stato', label: 'Stato', csv: x => x.ef.status || '', render: x => <StatusChip status={x.ef.status} /> },
        ]} />
      </Panel>
      {open && <Registro d={d} ingId={open} year={year} onClose={() => setOpen(null)} />}
      <ImportGfli d={d} year={year} />
      <Circolarita d={d} inUse={inUse} />
      <p className="small muted">Pacchetto di letteratura «pcf» {packInfo(d).version} valido al {dateIt(packInfo(d).validAsOf)}: nessun valore GFLI è incluso nel programma (registrazione e termini di ridistribuzione della banca dati). I valori con stato «da verificare» vanno sostituiti con quelli della banca dati usata.</p>
    </>
  );
}

function Registro({ d, ingId, year, onClose }) {
  const [form, setForm] = useState(false);
  const ing = A(d.ingredients).find(i => i.id === ingId);
  const rows = A(d.efIngredients).filter(r => r.ingId === ingId);
  const lit = packRowsFor(d, ing);
  const add = v => {
    const total = +v.total, parts = ['fossil', 'biogenic', 'landMgmt', 'luc'].reduce((s, k) => s + (+v[k] || 0), 0);
    if (parts > total + 0.5) { toast('Le componenti superano il totale: controllare fossile, gestione del suolo e cambio d’uso del suolo', 'err'); return; }
    const id = newId(d, 'efIngredients', `ef-${ingId}-${slug(v.origin || 'x')}${v.scheme ? '-' + slug(v.scheme) : ''}`);
    if (store.batch([{ kind: 'add', coll: 'efIngredients', obj: { ...v, id, ingId, origin: String(v.origin || '*').trim() || '*', status: v.status || 'inserito' } }], `Fattore di ${ing?.name || ingId} (${v.origin || '*'})`)) { setForm(false); undoToast('Fattore aggiunto al registro'); }
  };
  const del = r => confirm('Eliminare il fattore?', `${ing?.name}: ${r.origin}${r.scheme ? ' · ' + r.scheme : ''}, ${nf(r.total)} kg CO₂e/t.`, () => { if (store.batch([{ kind: 'remove', coll: 'efIngredients', id: r.id }], `Fattore eliminato: ${ing?.name}`)) undoToast('Fattore eliminato'); }, { ok: 'Elimina', danger: true });
  const useLit = it => add({ origin: it.origin, scheme: it.scheme, coc: it.coc, total: it.total, fossil: it.fossil, landMgmt: it.landMgmt, luc: it.luc, biogenic: 0, landM2a: it.landM2a, low: it.low, high: it.high, allocation: it.allocation, includesTransportTo: it.includesTransportTo, db: it.db, dbVersion: it.dbVersion, year: it.year, dqr: 4, source: it.source, note: it.note || it.label, status: it.status });
  return (
    <Panel title={`Fattori di ${ing?.name || ingId}`} sub={`Anagrafica: ${ing?.ef != null ? `${nf(ing.ef)} kg CO₂e/t` : 'nessun valore'} · origine ${ing?.origin || 'n.d.'}${familyOf(d, ing) ? ` · famiglia di letteratura «${familyOf(d, ing)}»` : ''}`} flush
      actions={<><Btn small icon={LuPlus} onClick={() => setForm(f => !f)}>{form ? 'Chiudi il modulo' : 'Aggiungi un fattore'}</Btn><Btn small kind="ghost" icon={LuX} onClick={onClose} title="Chiudi">Chiudi</Btn></>}>
      {rows.length ? <Table rows={rows} pageSize={20} cols={[
        { key: 'origin', label: 'Origine', render: r => <b>{r.origin === '*' ? 'generica' : originLabel(r.origin)}</b> },
        { key: 'scheme', label: 'Schema e custodia', render: r => <span className="small">{r.scheme || '—'}{r.coc ? ` (${r.coc})` : ''}</span> },
        { key: 'total', label: 'Totale', align: 'r', render: r => <b>{nf(r.total)}</b> },
        { key: 'fossil', label: 'Fossile', align: 'r', render: r => (r.fossil == null ? '—' : nf(r.fossil)) },
        { key: 'landMgmt', label: 'Gest. suolo', align: 'r', render: r => (r.landMgmt == null ? '—' : nf(r.landMgmt)) },
        { key: 'luc', label: 'LUC', align: 'r', render: r => (r.luc == null ? '—' : nf(r.luc)) },
        { key: 'landM2a', label: 'm²·a/t', align: 'r', render: r => (r.landM2a == null ? '—' : nf(r.landM2a)) },
        { key: 'db', label: 'Banca dati', render: r => <span className="small epc-wrap">{r.db}{r.dbVersion ? ' ' + r.dbVersion : ''}{r.year ? ` (${r.year})` : ''}</span> },
        { key: 'dqr', label: 'DQR', render: r => <DqrChip q={r.dqr} /> },
        { key: 'x', label: '', nosort: true, render: r => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il fattore" onClick={() => del(r)} /> },
      ]} /> : <div className="epc-pad"><p className="small muted epc-m0">Nessuna riga nel registro: si usa {ing?.ef != null ? 'il valore dell’anagrafica' : 'il valore di letteratura, se esiste'}.</p></div>}
      {form && <div className="epc-pad"><EntityForm coll="efIngredients" d={d} rec={{ ingId, origin: '*', allocation: 'economica', includesTransportTo: 'cancello-fornitore', dqr: 3, year, db: '', dbVersion: '' }} onSave={add} onCancel={() => setForm(false)} saveLabel="Aggiungi al registro" /></div>}
      {lit.length > 0 && <div className="epc-pad">
        <h3 className="epc-h3">Valori di letteratura per questa materia prima</h3>
        <div className="tw"><table className="t"><thead><tr><th>Voce</th><th className="r">kg CO₂e/t</th><th className="r">LUC</th><th>Fonte</th><th /></tr></thead>
          <tbody>{lit.map(it => <tr key={it.id}><td>{it.label}<span className="sub"><StatusChip status={it.status} /></span></td><td className="r">{nf(it.total)}</td><td className="r">{nf(it.luc)}</td><td className="small epc-wrap">{it.source} ({it.year})</td>
            <td><Btn small kind="ghost" icon={LuPlus} onClick={() => useLit(it)} disabled={rows.some(r => r.origin === it.origin && (r.scheme || null) === (it.scheme || null))}>Usa</Btn></td></tr>)}</tbody></table></div>
      </div>}
    </Panel>
  );
}

function ImportGfli({ d, year }) {
  const [st, setSt] = useState(null);
  const [meta, setMeta] = useState({ db: 'GFLI', dbVersion: '3.0', year: year - 1, allocation: 'economica' });
  const pv = useMemo(() => (st ? gfliPreview(d, st.parsed, { mapping: st.mapping, ...meta }) : null), [d, st, meta]);
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const txt = await readFile(f); const parsed = parseCSV(txt); if (!parsed.header.length) { toast('Il file non contiene righe', 'err'); return; } setSt({ name: f.name, parsed, mapping: {} }); }
    catch { toast('Il file non si è potuto leggere', 'err'); }
  };
  const ings = [...A(useMemo(() => d.ingredients, [d.ingredients]))].sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
  const apply = () => { if (pv?.ops.length && store.batch(pv.ops, `Fattori importati da CSV (${pv.counts.ready})`)) { undoToast(`${pv.counts.ready} fattori importati`); setSt(null); } };
  return (
    <Panel title="Importa i fattori da CSV (colonne dell’esportazione GFLI)" sub="Climate change, fossile, biogenico, cambio d’uso del suolo e uso del suolo, per paese: i valori per kg diventano per tonnellata" id="epc-gfli">
      <div className="row gap-s">
        <label className="btn small"><LuUpload aria-hidden="true" /> Scegli il file CSV<input type="file" accept=".csv,.txt,text/csv" onChange={onFile} className="sr" /></label>
        {st && <span className="small muted">{st.name} · {nf(st.parsed.rows.length)} righe</span>}
      </div>
      {pv && <>
        <div className="form epc-mt">
          <Field label="Banca dati"><input className="input" value={meta.db} maxLength={40} onChange={e => setMeta(m => ({ ...m, db: e.target.value }))} /></Field>
          <Field label="Versione"><input className="input" value={meta.dbVersion} maxLength={20} onChange={e => setMeta(m => ({ ...m, dbVersion: e.target.value }))} /></Field>
          <Field label="Anno dei dati"><NumInput value={meta.year} decimals={0} onChange={v => setMeta(m => ({ ...m, year: v }))} /></Field>
          <Field label="Allocazione"><Select value={meta.allocation} onChange={v => setMeta(m => ({ ...m, allocation: v }))} options={['economica', 'massa', 'energia']} /></Field>
        </div>
        <p className="small">Colonne riconosciute: {Object.entries(pv.map).map(([k, v]) => `${k} → «${v}»`).join(' · ') || 'nessuna'}</p>
        <div className="tw"><table className="t"><thead><tr><th>Riga del file</th><th>Paese</th><th className="r">kg CO₂e/t</th><th className="r">di cui LUC</th><th>Materia prima</th><th>Stato</th></tr></thead>
          <tbody>{pv.rows.slice(0, 60).map(r => (
            <tr key={r.i}><td>{r.product || '—'}</td><td>{r.rec.origin}</td><td className="r">{r.rec.total == null ? '—' : nf(r.rec.total)}</td><td className="r">{r.rec.luc == null ? '—' : nf(r.rec.luc)}</td>
              <td><Select value={r.rec.ingId || ''} onChange={v => setSt(s => ({ ...s, mapping: { ...s.mapping, [r.i]: v } }))} options={[{ id: '', label: '— da abbinare —' }, ...ings.map(i => ({ id: i.id, label: i.name }))]} ariaLabel={`Materia prima per ${r.product}`} /></td>
              <td>{r.status === 'pronta' ? <Chip kind="good">pronta</Chip> : <Chip kind="warn">{r.errors.join(', ')}</Chip>}</td></tr>))}</tbody></table></div>
        <div className="row gap-s epc-mt"><Btn small kind="primary" icon={LuSave} onClick={apply} disabled={!pv.counts.ready}>Importa {nf(pv.counts.ready)} fattori (un passo annullabile)</Btn><Btn small kind="ghost" onClick={() => setSt(null)}>Annulla</Btn></div>
      </>}
      {!pv && <p className="small muted epc-mt">Il file resta sul computer: FeedOS legge solo le colonne e non contiene valori GFLI. Una riga già presente (stessa materia prima, origine e banca dati) si aggiorna invece di duplicarsi.</p>}
    </Panel>
  );
}

function Circolarita({ d, inUse }) {
  const [edit, setEdit] = useState(null);
  const ingById = new Map(A(d.ingredients).map(i => [i.id, i]));
  const rows = inUse.map(x => { const c = circOf(d, ingById.get(x.ingId)); return { id: x.ingId, name: x.name, ...c }; });
  const save = v => { const exists = A(d.ingCircular).some(r => r.id === edit); if (store.batch([exists ? { kind: 'update', coll: 'ingCircular', id: edit, patch: v } : { kind: 'add', coll: 'ingCircular', obj: { ...v, id: edit } }], `Circolarità di ${ingName(d, edit)}`)) { setEdit(null); undoToast('Circolarità aggiornata'); } };
  return (
    <Panel title="Circolarità delle materie prime" sub="Classe (residuo dell’agroindustria, farina di estrazione, coltura primaria, ex prodotto alimentare, minerale) e frazione delle proteine edibili dall’uomo in tre scenari" flush>
      <Table rows={rows} onRow={r => setEdit(e => (e === r.id ? null : r.id))} selected={edit} pageSize={40} exportName="impronta-circolarita" cols={[
        { key: 'name', label: 'Materia prima', render: r => <b>{r.name}</b> },
        { key: 'coClass', label: 'Classe', render: r => CO_CLASSES[r.coClass] || r.coClass },
        { key: 'hef', label: 'Proteine edibili (basso · medio · alto)', nosort: true, csv: r => `${r.hefLow}/${r.hefMed}/${r.hefHigh}`, render: r => `${pctTxt(r.hefLow)} · ${pctTxt(r.hefMed)} · ${pctTxt(r.hefHigh)}` },
        { key: 'source', label: 'Fonte', render: r => <Chip kind={r.source === 'registro' ? 'accent' : 'outline'}>{r.source}</Chip> },
      ]} />
      {edit && <div className="epc-pad"><h3 className="epc-h3">{ingName(d, edit)}</h3><EntityForm coll="ingCircular" d={d} rec={(() => { const c = rows.find(r => r.id === edit) || {}; return { coClass: c.coClass, hefLow: c.hefLow, hefMed: c.hefMed, hefHigh: c.hefHigh }; })()} onSave={save} onCancel={() => setEdit(null)} saveLabel="Salva" /></div>}
    </Panel>
  );
}

/* ================= imballaggi ================= */
export function Imballaggi({ d, P, S, pick }) {
  const sum = S.packaging;
  const [edit, setEdit] = useState(pick ? decodeURIComponent(pick) : null);
  if (!sum) return <Panel title="Imballaggi"><Empty icon={LuPackage} title="Nessun dato" /></Panel>;
  const mats = Object.entries(sum.byMaterial).sort((a, b) => b[1] - a[1]);
  const COL = { carta: 'var(--s4)', PE: 'var(--s1)', 'film-LDPE': 'var(--s7)', PP: 'var(--s2)', legno: 'var(--s6)' };
  const ppwr = packList(d, 'scadenza');
  const pk = packInfo(d);
  return (
    <>
      <div className="kpis">
        <Kpi label="Imballaggi immessi sul mercato" value={tTxt(sum.kg / 1000)} unit="t" foot={P.label} />
        <Kpi label="Per tonnellata venduta" value={nf(sum.kgPerTSold, 2)} unit="kg/t" foot={`${nf(sum.tSold)} t vendute`} />
        <Kpi label="Prodotti sfusi" value={pctTxt(sum.bulkShare)} foot="senza imballaggio" />
        <Kpi label="Contenuto riciclato" value={pctTxt(sum.recycledPct == null ? null : sum.recycledPct / 100, 1)} foot="dichiarato dai fornitori, sul peso" />
        <Kpi label="Emissioni degli imballaggi" value={tTxt(sum.tco2e)} unit="t CO₂e" foot="inclusi pallet" />
        <Kpi label="Confezioni senza scheda" value={nf(sum.missing.length)} status={sum.missing.length ? 'warn' : 'ok'} foot="regolamento imballaggi (PPWR)" />
      </div>
      <Panel title="Schede per confezione" sub="Una scheda per ogni tipo di confezione usato dai prodotti: materiali, peso per confezione, riciclato, riciclabilità, dichiarazione di conformità · clic per modificare" flush>
        <Table rows={sum.rows.map(r => ({ ...r, id: r.packaging }))} onRow={r => setEdit(e => (e === r.packaging ? null : r.packaging))} selected={edit} exportName="imballaggi-confezioni" cols={[
          { key: 'packaging', label: 'Confezione', render: r => <><b>{r.packaging}</b><span className="sub">{r.products.length} prodotti attivi</span></> },
          { key: 't', label: 't vendute', align: 'r', render: r => nf(r.t) },
          { key: 'kgPerT', label: 'kg/t', align: 'r', render: r => nf(r.kgPerT, 2) },
          { key: 'kg', label: 'kg immessi', align: 'r', render: r => nf(r.kg) },
          { key: 'recycledPct', label: 'Riciclato', align: 'r', render: r => (r.recycledPct == null ? '—' : `${nf(r.recycledPct)}%`) },
          { key: 'recyclability', label: 'Riciclabilità', render: r => r.recyclability || '—' },
          { key: 'stato', label: 'Scheda', csv: r => (r.bulk ? 'sfuso' : r.spec ? 'registro' : 'peso di base'), render: r => (r.bulk && !r.missing ? <Chip kind="outline">sfuso</Chip> : r.spec ? <Chip kind="good">registro</Chip> : <Chip kind="warn">peso di base</Chip>) },
        ]} />
      </Panel>
      {edit && <SpecEditor key={edit} d={d} packaging={edit} onClose={() => setEdit(null)} />}
      <div className="split">
        <Panel title="Imballaggi per materiale" sub="kg immessi sul mercato nel periodo · per la dichiarazione CONAI, se dovuta">
          {mats.length ? <><StackBar parts={mats.map(([m, v]) => ({ key: m, label: m, value: v, color: COL[m] || 'var(--s3)' }))} ariaLabel="Imballaggi per materiale" />
            <Kv items={mats.map(([m, v]) => [m, `${nf(v)} kg`])} /></> : <p className="small muted">Nessun imballaggio nel periodo.</p>}
          <p className="small muted">Il contributo ambientale CONAI sugli imballaggi vuoti di solito lo applica il fornitore alla prima cessione: verificare con il consulente se l’azienda deve dichiarare (importazioni di imballaggi pieni o vuoti). <StatusChip status="da verificare" /></p>
        </Panel>
        <Panel title="Regolamento imballaggi (UE) 2025/40" sub={`Scadenze del pacchetto «pcf» · valido al ${dateIt(pk.validAsOf)}`}>
          <ul className="epc-dates">{ppwr.map(x => <li key={x.id}><b>{dateIt(x.date)}</b><span>{x.title}</span><span className="small muted">{x.source} <StatusChip status={x.status} /></span></li>)}</ul>
        </Panel>
      </div>
      <Disclaimer />
    </>
  );
}

function SpecEditor({ d, packaging, onClose }) {
  const cur = packagingSpecFor(d, packaging);
  const [v, setV] = useState(() => ({ unitsPerT: cur?.unitsPerT ?? (/sacc/i.test(packaging) ? 40 : 0), palletsPerT: cur?.palletsPerT ?? 0.8, palletReusable: cur?.palletReusable ?? true, conaiClass: cur?.conaiClass || '', declaration: cur?.declaration || '', note: cur?.note || '',
    components: A(cur?.components).length ? cur.components.map(c => ({ ...c })) : /sacc/i.test(packaging) ? [{ material: 'carta', kgPerUnit: 0.14, recycledPct: 0, recyclability: '' }] : [] }));
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  const setC = (i, k, x) => setV(o => ({ ...o, components: o.components.map((c, j) => (j === i ? { ...c, [k]: x } : c)) }));
  const kgT = A(v.components).reduce((s, c) => s + (+c.kgPerUnit || 0) * (+v.unitsPerT || 0), 0);
  const save = () => {
    const obj = { packaging, unitsPerT: +v.unitsPerT || 0, palletsPerT: +v.palletsPerT || 0, palletReusable: !!v.palletReusable, conaiClass: v.conaiClass || null, declaration: v.declaration || '', note: v.note || '',
      components: v.components.filter(c => matKey(c.material) && +c.kgPerUnit > 0).map(c => ({ material: matKey(c.material), kgPerUnit: +c.kgPerUnit, recycledPct: Math.max(0, Math.min(100, +c.recycledPct || 0)), recyclability: c.recyclability || null, supplierId: c.supplierId || null, docEvidenceId: c.docEvidenceId || null })) };
    const op = cur ? { kind: 'update', coll: 'packagingSpecs', id: cur.id, patch: obj } : { kind: 'add', coll: 'packagingSpecs', obj: { ...obj, id: newId(d, 'packagingSpecs', `pk-${slug(packaging)}`) } };
    if (store.batch([op], `Scheda dell’imballaggio «${packaging}»`)) { undoToast('Scheda dell’imballaggio salvata'); onClose(); }
  };
  return (
    <Panel title={`Scheda dell’imballaggio «${packaging}»`} sub={`${cur ? 'Scheda del registro' : 'Nuova scheda (oggi vale il peso di base)'} · ${nf(kgT, 2)} kg di materiali per t, pallet esclusi`} actions={<Btn small kind="ghost" icon={LuX} onClick={onClose}>Chiudi</Btn>}>
      <div className="form">
        <Field label="Confezioni per tonnellata"><NumInput value={v.unitsPerT} decimals={1} min={0} onChange={x => set('unitsPerT', x)} /></Field>
        <Field label="Pallet per tonnellata"><NumInput value={v.palletsPerT} decimals={2} min={0} onChange={x => set('palletsPerT', x)} /></Field>
        <Field label="Pallet"><Seg options={[{ id: 'si', label: 'A rendere' }, { id: 'no', label: 'A perdere' }]} value={v.palletReusable ? 'si' : 'no'} onChange={x => set('palletReusable', x === 'si')} label="Pallet a rendere" /></Field>
        <Field label="Materiale prevalente (CONAI)"><Select value={v.conaiClass} onChange={x => set('conaiClass', x)} options={[{ id: '', label: '—' }, 'carta', 'plastica', 'legno', 'acciaio', 'alluminio', 'vetro'].map(o => (typeof o === 'string' ? { id: o, label: o } : o))} /></Field>
        <Field label="Dichiarazione di conformità"><input className="input" value={v.declaration} maxLength={160} onChange={e => set('declaration', e.target.value)} placeholder="riferimento del documento del fornitore" /></Field>
        <Field label="Nota"><input className="input" value={v.note} maxLength={240} onChange={e => set('note', e.target.value)} /></Field>
      </div>
      <h3 className="epc-h3">Materiali di una confezione</h3>
      <div className="tw"><table className="t"><thead><tr><th>Materiale</th><th className="r">kg per confezione</th><th className="r">Riciclato %</th><th>Riciclabilità</th><th /></tr></thead>
        <tbody>{v.components.map((c, i) => (
          <tr key={i}>
            <td><Select value={matKey(c.material) || ''} onChange={x => setC(i, 'material', x)} options={[{ id: '', label: '—' }, ...PACK_MATERIALS.map(m => ({ id: m, label: m }))]} ariaLabel="Materiale" /></td>
            <td className="r"><NumInput slim value={c.kgPerUnit} decimals={3} min={0} onChange={x => setC(i, 'kgPerUnit', x)} ariaLabel="kg per confezione" /></td>
            <td className="r"><NumInput slim value={c.recycledPct} decimals={0} min={0} max={100} onChange={x => setC(i, 'recycledPct', x)} ariaLabel="Riciclato %" /></td>
            <td><Select value={c.recyclability || ''} onChange={x => setC(i, 'recyclability', x)} options={[{ id: '', label: '—' }, ...['A', 'B', 'C', 'D', 'E'].map(g => ({ id: g, label: g }))]} ariaLabel="Riciclabilità" /></td>
            <td><Btn small kind="ghost" icon={LuTrash2} title="Togli il materiale" onClick={() => setV(o => ({ ...o, components: o.components.filter((_, j) => j !== i) }))} /></td>
          </tr>))}</tbody></table></div>
      <div className="row gap-s epc-mt">
        <Btn small icon={LuPlus} onClick={() => setV(o => ({ ...o, components: [...o.components, { material: 'carta', kgPerUnit: null, recycledPct: 0, recyclability: '' }] }))}>Aggiungi un materiale</Btn>
        <Btn small kind="primary" icon={LuSave} onClick={save}>Salva la scheda</Btn>
      </div>
      <p className="small muted epc-mt">Riciclabilità A–E secondo il regolamento imballaggi (grado minimo C dal 2030). Il contenuto riciclato si riporta: il fattore del materiale resta quello del materiale vergine.</p>
    </Panel>
  );
}

/* ================= scambio dati ================= */
export function Scambio({ d, P, today, S }) {
  const snaps = A(d.pcfSnapshots).filter(s => s.status === 'attiva');
  const prodName = id => A(d.products).find(p => p.id === id)?.name || id;
  const [txt, setTxt] = useState('');
  const [ctx, setCtx] = useState({ supplierId: '', ingId: '' });
  const [res, setRes] = useState(null);
  const [mi, setMi] = useState(snaps[0]?.productId || A(d.products).find(p => p.active !== false)?.id || '');
  const pending = pendingReplies(d);
  const sups = A(d.supplierPcfs);
  const supName = id => shortName(A(d.suppliers).find(s => s.id === id)?.name || id);
  const read = (text, fileHash) => setRes(pactImport(d, text, { supplierId: ctx.supplierId || undefined, ingId: ctx.ingId || undefined, fileHash }));
  const onFile = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const t = await readFile(f); setTxt(t.slice(0, 200000)); read(t, sha256HexSync(t)); } catch { toast('Il file non si è potuto leggere', 'err'); } };
  const apply = () => { if (res?.ops.length && store.batch(res.ops, `Impronte dei fornitori importate (${res.rows.length})`)) { undoToast(`${res.rows.length} impronte registrate`); setRes(null); setTxt(''); } };
  const regReply = req => { const r = importReply(d, req); if (!r.ok) { toast(r.errors[0] || 'Risposta non valida', 'err'); return; } if (store.batch(r.ops, `Impronte del modulo di ${supName(req.supplierId)}`)) undoToast(`${r.rows.length} impronte registrate`); };
  const delPcf = r => confirm('Eliminare l’impronta dichiarata?', `${ingName(d, r.ingId)} di ${supName(r.supplierId)}: ${nf(r.pcfExcl)} kg CO₂e/t.`, () => { if (store.batch([{ kind: 'remove', coll: 'supplierPcfs', id: r.id }], 'Impronta del fornitore eliminata')) undoToast('Impronta eliminata'); }, { ok: 'Elimina', danger: true });
  const m57 = () => { const m = mi57Package(d, mi, P); if (!m) { toast('Prodotto senza formula', 'err'); return; } downloadJson(`mi57-${slug(prodName(mi))}`, m.json); downloadCsv(`mi57-${slug(prodName(mi))}`, m.csv, [{ label: 'Sezione', key: 'sezione' }, { label: 'Voce', key: 'voce' }, { label: 'Valore', key: 'valore' }, { label: 'Unità', key: 'unita' }, { label: 'Nota', key: 'nota' }]); };
  const stateOf = r => (r.periodEnd && r.periodEnd < today ? ['warn', 'scaduta'] : r.periodStart && r.periodStart > today ? ['outline', 'futura'] : ['good', 'valida']);
  return (
    <>
      <Panel title="Impronte pubblicate in forma PACT v3" sub={`${PACT_LABEL.it}: JSON ProductFootprint per tonnellata, con le versioni precedenti e l’estensione dei mangimi (specie, soia DCF, pacchetto MI5.7)`} flush
        actions={snaps.length ? <Btn small kind="primary" icon={LuDownload} onClick={() => downloadJson('pact-impronte', pactExport(d, snaps))}>Scarica tutte ({snaps.length})</Btn> : null}>
        {snaps.length ? <Table rows={snaps} pageSize={20} cols={[
          { key: 'productId', label: 'Prodotto', render: s => <b>{prodName(s.productId)}</b> },
          { key: 'publishedAt', label: 'Pubblicata', render: s => dateIt(s.publishedAt) },
          { key: 'total', label: 'kg CO₂e/t', align: 'r', render: s => kgTxt(s.total) },
          { key: 'formulaVersion', label: 'Formula', render: s => `v. ${s.formulaVersion}` },
          { key: 'precedingIds', label: 'Versioni precedenti', align: 'r', render: s => nf(A(s.precedingIds).length) },
          { key: 'x', label: '', nosort: true, render: s => <Btn small kind="ghost" icon={LuDownload} onClick={() => downloadJson(`pact-${slug(prodName(s.productId))}`, pactExport(d, [s]))}>JSON</Btn> },
        ]} /> : <div className="epc-pad"><p className="small muted epc-m0">Nessuna impronta pubblicata: si pubblica dalla scheda del prodotto.</p></div>}
      </Panel>
      <div className="split">
        <Panel title="Importa le impronte dei fornitori" sub="File JSON PACT v2 o v3, TfS o un elenco di ProductFootprint: valori per kg o per t, convertiti in kg CO₂e per t">
          <div className="form">
            <Field label="Fornitore (se il file non lo dice)"><Select value={ctx.supplierId} onChange={x => setCtx(c => ({ ...c, supplierId: x }))} options={[{ id: '', label: 'dal file' }, ...A(d.suppliers).map(s => ({ id: s.id, label: shortName(s.name) }))]} /></Field>
            <Field label="Materia prima (se il file non la dice)"><Select value={ctx.ingId} onChange={x => setCtx(c => ({ ...c, ingId: x }))} options={[{ id: '', label: 'dal file' }, ...A(d.ingredients).map(i => ({ id: i.id, label: i.name }))]} /></Field>
          </div>
          <div className="row gap-s epc-mt">
            <label className="btn small"><LuUpload aria-hidden="true" /> Scegli il file JSON<input type="file" accept=".json,application/json" onChange={onFile} className="sr" /></label>
            <Btn small kind="ghost" onClick={() => read(txt)} disabled={!txt.trim()}>Leggi il testo incollato</Btn>
          </div>
          <textarea className="input epc-ta" value={txt} onChange={e => setTxt(e.target.value)} placeholder="…oppure incolla qui il JSON ricevuto" aria-label="JSON dell’impronta" />
          {res && <div className="epc-mt">
            {res.errors.length > 0 && <div className="note crit small">{res.errors.map((x, i) => <div key={i}>{x}</div>)}</div>}
            {res.warnings.length > 0 && <div className="note small">{res.warnings.map((x, i) => <div key={i}>{x}</div>)}</div>}
            {res.rows.length > 0 && <Kv items={res.rows.slice(0, 8).map(r => [`${ingName(d, r.ingId)} · ${supName(r.supplierId)}`, `${nf(r.pcfExcl)} kg CO₂e/t · ${dateIt(r.periodStart)} – ${dateIt(r.periodEnd)}${r.primaryDataShare != null ? ` · dati primari ${nf(r.primaryDataShare)}%` : ''}`])} />}
            <div className="row gap-s epc-mt">{res.ok && <Btn small kind="primary" icon={LuSave} onClick={apply}>Registra {res.rows.length} impronte (un passo annullabile)</Btn>}<Btn small kind="ghost" onClick={() => setRes(null)}>Chiudi</Btn></div>
          </div>}
        </Panel>
        <Panel title="Risposte ai moduli dei fornitori" sub="Impronte ricevute con il modulo «Impronta dei prodotti» (scheda EUDR e fornitori)">
          {pending.length ? <ul className="epc-list">{pending.map(p => <li key={p.request.id}><b>{supName(p.request.supplierId)}</b><span className="small">{p.rows.length} impronte · ricevuta il {dateIt(p.request.receivedAt || p.request.sentAt)}</span><Btn small icon={LuArrowRightLeft} onClick={() => regReply(p.request)}>Registra</Btn></li>)}</ul>
            : <p className="small muted">Nessuna risposta da registrare. Per chiedere l’impronta a un fornitore usa il modulo «Impronta dei prodotti (campi PACT)».</p>}
        </Panel>
      </div>
      <Panel title="Impronte dichiarate dai fornitori" sub="Dati primari: valgono nel loro periodo per gli acquisti del fornitore (e per le formule, se il fornitore copre almeno metà degli arrivi)" flush>
        {sups.length ? <Table rows={sups} pageSize={20} exportName="impronte-fornitori" cols={[
          { key: 'ingId', label: 'Materia prima', render: r => <b>{ingName(d, r.ingId)}</b> },
          { key: 'supplierId', label: 'Fornitore', render: r => supName(r.supplierId) },
          { key: 'pcfExcl', label: 'kg CO₂e/t', align: 'r', render: r => nf(r.pcfExcl) },
          { key: 'luc', label: 'di cui LUC', align: 'r', render: r => (r.luc == null ? '—' : nf(r.luc)) },
          { key: 'periodStart', label: 'Validità', render: r => <span className="small">{dateIt(r.periodStart)} – {dateIt(r.periodEnd)}</span> },
          { key: 'primaryDataShare', label: 'Dati primari', align: 'r', render: r => (r.primaryDataShare == null ? '—' : `${nf(r.primaryDataShare)}%`) },
          { key: 'stato', label: 'Stato', csv: r => stateOf(r)[1], render: r => { const [k, l] = stateOf(r); return <Chip kind={k}>{l}</Chip>; } },
          { key: 'x', label: '', nosort: true, render: r => <Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={() => delPcf(r)} /> },
        ]} /> : <div className="epc-pad"><p className="small muted epc-m0">Nessuna impronta dichiarata dai fornitori.</p></div>}
      </Panel>
      <Panel title="Pacchetto dati per GMP+ MI5.7" sub={MI57_LABEL.it}>
        <div className="row gap-s">
          <Select value={mi} onChange={setMi} options={A(d.products).filter(p => p.active !== false).map(p => ({ id: p.id, label: p.name }))} ariaLabel="Prodotto del pacchetto MI5.7" className="auto" />
          <Btn small icon={LuDownload} onClick={m57} disabled={!mi}>Scarica JSON e CSV</Btn>
        </div>
        <p className="small muted epc-mt">Contiene la formula con origini e kg per t, l’energia per t (elettricità e GPL, pellet o farina), le tratte di trasporto, l’imballaggio, il calo e i prezzi per l’allocazione: è un documento riservato per l’ente di certificazione e lo strumento riconosciuto.</p>
      </Panel>
    </>
  );
}
