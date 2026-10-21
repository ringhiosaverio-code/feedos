/* FeedOS 17 · Dati › Importa: importazione guidata da CSV (pacchetto WP7). Cinque passi: tipo di dati → file → colonne
 * (abbinate in automatico, con la fiducia dell'abbinamento) → anteprima con nuovi, modificati, invariati ed errori per cella →
 * conferma. Le righe con errori restano fuori; tutto il resto entra in un solo passo annullabile; gli abbinamenti si ricordano. */
import React, { useMemo, useState } from 'react';
import { LuUpload, LuFileSpreadsheet, LuCheck, LuArrowLeft, LuArrowRight, LuTriangleAlert } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { isClosedMonth } from '../core/schema.js';
import { nf, dateIt } from '../core/util.js';
import { download, parseCSV, readFile } from '../core/io.js';
import { FIELDS, COLL_LABEL } from '../core/fields.js';
import { TYPES, autoMap, preview, toOps, template } from '../core/importers.js';
import { Panel, Btn, Chip, Select, Field } from '../ui/ui.jsx';

const STEPS = ['Tipo di dati', 'File', 'Colonne', 'Anteprima', 'Conferma'];
const DESC = {
  clienti: 'Ragione sociale, comune, provincia, agente, giorni di pagamento, fido e coordinate. Si aggiornano per codice (o per nome).',
  agenti: 'Nome, zona e provvigione. Si aggiornano per nome.',
  prodotti: 'Codice, nome, formula, linea, forma, confezione e listino. Si aggiornano per codice.',
  consegne: 'Data, cliente, prodotto, lotto, quantità (t o kg), prezzo e DDT. Ogni consegna deve indicare un lotto dello stesso prodotto.',
  'costi-fissi': 'Mese, centro di costo, tipo (consuntivo o budget) e importo. Si aggiornano per mese, centro e tipo.',
  fatture: 'Numero, cliente, data, imponibile, IVA, totale, scadenza e stato. Si aggiornano per numero.',
  incassi: 'Data, cliente, fattura, importo e modalità.',
  energia: 'Mese, tonnellate prodotte, kWh dalla rete, fotovoltaico e ceduti, GPL.',
};
const STATUS = { new: { kind: 'good', label: 'nuovo', plural: 'nuovi' }, changed: { kind: 'accent', label: 'modificato', plural: 'modificati' }, same: { kind: '', label: 'invariato', plural: 'invariati' }, error: { kind: 'crit', label: 'errore', plural: 'con errori' } };
const DATE_FIELD = { shipments: 'date', invoices: 'date', payments: 'date', fixedCosts: 'month' };

export function ImportWizard({ d }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState('clienti');
  const [file, setFile] = useState(null); // {name, header, rows}
  const [map, setMap] = useState({});
  const [force, setForce] = useState(false), [note, setNote] = useState('');
  const T = TYPES[type], fields = FIELDS[T.coll];
  const pv = useMemo(() => (file && step >= 3 ? preview(d, type, file.rows, map) : null), [d, type, file, map, step]);
  const closedRows = pv && DATE_FIELD[T.coll] ? pv.rows.filter(r => (r.status === 'new' || r.status === 'changed') && isClosedMonth(d, r.rec[DATE_FIELD[T.coll]])) : [];
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { header, rows } = parseCSV(await readFile(f));
      if (!header.length || !rows.length) { toast('Il file non contiene righe', 'err'); return; }
      const saved = d.settings?.importMaps?.[type];
      const auto = autoMap(header, type);
      // un abbinamento salvato vale se le sue colonne ci sono ancora
      const m = saved && Object.values(saved).every(c => header.includes(c)) ? Object.fromEntries(Object.entries(saved).map(([k, c]) => [k, { col: c, confidence: 1, saved: true }])) : auto;
      setFile({ name: f.name, header, rows }); setMap(m); setStep(2);
    } catch (err) { toast('Lettura non riuscita: ' + err.message, 'err'); }
  };
  const apply = () => {
    const ops = toOps(pv);
    if (!ops.length) { toast('Niente da importare: nessuna riga nuova o modificata', 'err'); return; }
    if (closedRows.length && !force) { toast('Alcune righe cadono in mesi chiusi: conferma l’importazione nei mesi chiusi con una nota', 'err'); return; }
    const mapCols = Object.fromEntries(Object.entries(map).filter(([, v]) => v?.col).map(([k, v]) => [k, v.col]));
    const n = pv.counts.new + pv.counts.changed;
    const label = `Importazione ${T.label.toLowerCase()}: ${n} righe da ${file.name}${force && closedRows.length ? ` (mesi chiusi: ${note.trim() || 'senza nota'})` : ''}`;
    const res = store.batch([...ops, { kind: 'settings', value: st => ({ ...st, importMaps: { ...(st.importMaps || {}), [type]: mapCols } }) }], label, { force: force && closedRows.length > 0 });
    if (res) { toast(`${n} righe importate in ${COLL_LABEL[T.coll].toLowerCase()}`, 'ok', { label: 'Annulla', fn: () => store.undo() }); setStep(0); setFile(null); setMap({}); setForce(false); setNote(''); }
  };
  const missingReq = fields.filter(f => f.required && !map[f.key]?.col && !(T.defaults || {})[f.key]);
  return (
    <Panel title="Importazione guidata" sub="Da un foglio di calcolo esportato dal gestionale (CSV con «;» o «,»): numeri e date all’italiana, quantità in tonnellate o chili" id="imp-wizard">
      <ol className="imp-steps" aria-label="Passi dell’importazione">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><span>{i + 1}</span>{s}</li>)}
      </ol>
      {step === 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="grid g4" style={{ gap: 8 }}>
            {Object.entries(TYPES).map(([id, t]) => (
              <button key={id} className={`imp-type ${type === id ? 'on' : ''}`} onClick={() => setType(id)} aria-pressed={type === id}><b>{t.label}</b><span className="small muted">{DESC[id]}</span></button>
            ))}
          </div>
          <div className="row">
            <Btn kind="primary" icon={LuArrowRight} onClick={() => setStep(1)}>Avanti</Btn>
            <Btn icon={LuFileSpreadsheet} onClick={() => download(`modello-${type}.csv`, '﻿' + template(d, type).map(r => r.map(c => (/[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\r\n'), 'text/csv;charset=utf-8')}>Scarica il modello</Btn>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="small">{DESC[type]} Colonne riconosciute: {fields.map(f => f.label + (f.required ? ' *' : '')).join(', ')}.</p>
          <div className="row">
            <label className="btn primary"><LuUpload aria-hidden="true" />Scegli il file CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={onFile} /></label>
            <Btn kind="ghost" icon={LuArrowLeft} onClick={() => setStep(0)}>Indietro</Btn>
          </div>
        </div>
      )}
      {step === 2 && file && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="small">{file.name}: {nf(file.rows.length)} righe, {file.header.length} colonne. Controlla gli abbinamenti proposti.</p>
          <div className="tw"><table className="t">
            <thead><tr><th>Campo di FeedOS</th><th>Colonna del file</th><th>Abbinamento</th><th>Esempio</th></tr></thead>
            <tbody>{fields.map(f => {
              const m = map[f.key];
              return (
                <tr key={f.key}>
                  <td><b>{f.label}</b>{f.required && <span className="muted"> *</span>}</td>
                  <td><Select value={m?.col || ''} onChange={v => setMap(x => ({ ...x, [f.key]: v ? { col: v, confidence: 1, manual: true } : null }))} options={[{ id: '', label: '— non importare —' }, ...file.header.map(h => ({ id: h, label: h }))]} ariaLabel={`Colonna per ${f.label}`} /></td>
                  <td>{m?.col ? <Chip kind={m.saved || m.manual || m.confidence >= 0.9 ? 'good' : 'warn'}>{m.saved ? 'salvato' : m.manual ? 'scelto' : m.confidence >= 0.9 ? 'sicuro' : 'probabile'}</Chip> : f.required && !(T.defaults || {})[f.key] ? <Chip kind="crit">manca</Chip> : '—'}</td>
                  <td className="small muted">{m?.col ? String(file.rows[0]?.[m.col] ?? '') : ''}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {missingReq.length > 0 && <div className="note warn small">Campi obbligatori senza colonna: {missingReq.map(f => f.label).join(', ')}. Le righe risulteranno con errori.</div>}
          <div className="row"><Btn kind="primary" icon={LuArrowRight} onClick={() => setStep(3)}>Anteprima</Btn><Btn kind="ghost" icon={LuArrowLeft} onClick={() => setStep(1)}>Altro file</Btn></div>
        </div>
      )}
      {step >= 3 && pv && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row gap-s" style={{ flexWrap: 'wrap' }}>
            {Object.entries(pv.counts).map(([k, n]) => <Chip key={k} kind={STATUS[k].kind}>{nf(n)} {n === 1 ? STATUS[k].label : STATUS[k].plural}</Chip>)}
            <span className="small muted">chiave: {pv.key.map(k => fields.find(f => f.key === k)?.label || k).join(' + ')}</span>
          </div>
          <div className="tw tall"><table className="t">
            <thead><tr><th>Riga</th><th>Esito</th>{fields.filter(f => map[f.key]?.col).map(f => <th key={f.key}>{f.label}</th>)}<th>Dettaglio</th></tr></thead>
            <tbody>{pv.rows.slice(0, 200).map(r => (
              <tr key={r.i}>
                <td className="num">{r.i + 2}</td>
                <td><Chip kind={STATUS[r.status].kind}>{STATUS[r.status].label}</Chip></td>
                {fields.filter(f => map[f.key]?.col).map(f => {
                  const err = r.errors.find(e => e.field === f.key), ch = r.diffs.find(x => x.field === f.key);
                  return <td key={f.key} className={err ? 'imp-err' : ch ? 'imp-ch' : ''} title={err?.msg || (ch ? `prima: ${ch.from ?? '—'}` : '')}>{file.rows[r.i]?.[map[f.key].col]}</td>;
                })}
                <td className="small">{r.errors.length ? <span style={{ color: 'var(--crit-ink)' }}>{r.errors.map(e => e.msg).join('; ')}</span> : r.diffs.length ? r.diffs.slice(0, 3).map(x => `${fields.find(f => f.key === x.field)?.label || x.field}: ${fmtV(x.from)} → ${fmtV(x.to)}`).join(' · ') : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {pv.rows.length > 200 && <p className="small muted">Mostrate le prime 200 righe di {nf(pv.rows.length)}.</p>}
          {closedRows.length > 0 && (
            <div className="note warn">
              <b>{closedRows.length} righe cadono in mesi chiusi.</b> Importarle cambia numeri già consegnati alla direzione.
              <label className="row small" style={{ gap: 6, marginTop: 6 }}><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> Importa anche nei mesi chiusi</label>
              {force && <Field label="Motivo (resta nel registro)"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Es. fatture di settembre arrivate in ritardo" /></Field>}
            </div>
          )}
          <div className="row">
            <Btn kind="primary" icon={LuCheck} disabled={!(pv.counts.new + pv.counts.changed) || (closedRows.length > 0 && !force)} onClick={apply}>Importa {nf(pv.counts.new + pv.counts.changed)} righe</Btn>
            <Btn kind="ghost" icon={LuArrowLeft} onClick={() => setStep(2)}>Colonne</Btn>
            {pv.counts.error > 0 && <span className="small muted"><LuTriangleAlert aria-hidden="true" /> {nf(pv.counts.error)} righe con errori restano fuori: correggile nel file e reimportalo.</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}
const fmtV = v => (v == null || v === '' ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dateIt(v) : typeof v === 'number' ? nf(v, Number.isInteger(v) ? 0 : 2) : String(v));
