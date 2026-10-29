/* FeedOS 18 · ESG › Registri ambientali: elementi condivisi dalle sezioni (formati, esportazioni CSV e JSON, moduli dei record con
 * i campi di FIELDS_AMBIENTE, analisi dello scarico, conferme). Prefisso CSS eam-. Scritture solo con store.batch e un’etichetta italiana.
 * Regole grafiche: spaziature multiple di 8, pesi del testo 400 e 600, niente maiuscolo, numeri senza decorazioni. */
import React, { useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { nf, dateIt } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { META as EDITION } from '../editions/meta.js';
import { Btn, Field, NumInput, Select, confirm } from '../ui/ui.jsx';
import { FIELDS_AMBIENTE, COLL_LABEL_AMBIENTE } from '../data/fields-ambiente.js';

export const numTxt = (v, k = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v, k));
export const pctTxt = (v, k = 0) => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v * 100, k)}%`);
export const dt = s => (s ? dateIt(s) : '—');
export const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
const FILE = () => EDITION.product.toLowerCase();
/** Scarica righe in CSV (punto e virgola, virgola decimale, BOM). */
export function downloadCsv(name, rows, cols) { download(`${FILE()}-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
/** Scarica un testo (JSON o Markdown). */
export function downloadText(name, ext, text, mime = 'text/plain;charset=utf-8') { download(`${FILE()}-${name}-${stamp()}.${ext}`, text, mime); }
/** Variazione percentuale tra due valori mensili (null se non confrontabili). */
export const pctChange = (cur, prev) => (cur != null && prev != null && Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0 ? (cur - prev) / Math.abs(prev) * 100 : null);
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
/** «rispetto a settembre» / «rispetto ad agosto». */
export const vsMonth = ym => { const m = MESI[+String(ym).slice(5, 7) - 1] || ''; return `rispetto ${/^a/.test(m) ? 'ad' : 'a'} ${m}`; };
/** Mese prima di un mese «AAAA-MM». */
export const prevMonth = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/** Scrive un record (aggiunta o modifica) in un solo passo annullabile. */
export function saveRecord(coll, rec, obj, label) {
  const isNew = !rec?.id;
  const ops = isNew ? [{ kind: 'add', coll, obj }] : [{ kind: 'update', coll, id: rec.id, patch: obj }];
  store.batch(ops, `${label}: ${isNew ? 'aggiunto' : 'modificato'}`);
  undoToast(isNew ? 'Aggiunto' : 'Modifiche salvate');
}
/** Elimina un record dopo conferma (si può annullare subito dopo). */
export function removeRecord(coll, id, label, text) {
  confirm(`Eliminare ${text}?`, 'La riga esce dal registro; si può annullare subito dopo.', () => {
    store.remove(coll, id, `${COLL_LABEL_AMBIENTE[coll] || coll}: eliminato`);
    undoToast('Eliminato');
  }, { danger: true, ok: 'Elimina' });
}

const clean = (fields, v) => {
  const out = {};
  for (const f of fields) {
    const x = v[f.key];
    if (x === '' || x == null) continue;
    out[f.key] = f.type === 'number' ? +x : f.type === 'bool' ? !!x : x;
  }
  return out;
};

/**
 * Modulo di un record: i campi vengono da FIELDS_AMBIENTE[coll]; children (facoltativo) è la parte propria del record (analisi).
 * onSave(valori puliti) riceve solo i valori validi; l’errore di un campo obbligatorio o fuori intervallo blocca il salvataggio.
 */
export function RecordForm({ coll, rec, d, defaults = {}, onSave, onCancel, saveLabel = 'Salva', hidden = [], children }) {
  const fields = (FIELDS_AMBIENTE[coll] || []).filter(f => !hidden.includes(f.key));
  const [v, setV] = useState(() => ({ ...defaults, ...(rec || {}) }));
  const [err, setErr] = useState('');
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  const save = () => {
    for (const f of fields) {
      const x = v[f.key];
      const empty = x == null || x === '';
      if (f.required && empty) { setErr(`Serve «${f.label}».`); return; }
      if (!empty && f.type === 'number' && (!Number.isFinite(+x) || (f.min != null && +x < f.min) || (f.max != null && +x > f.max))) { setErr(`«${f.label}» fuori dall’intervallo ammesso.`); return; }
    }
    setErr('');
    onSave(clean(fields, v));
  };
  return (
    <form className="stack eam-form" style={{ gap: 16 }} onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="form">
        {fields.map(f => {
          const id = `eam-${coll}-${f.key}`;
          let input;
          if (f.type === 'number') input = <NumInput id={id} value={v[f.key] ?? ''} onChange={x => set(f.key, x)} decimals={f.decimals ?? 2} min={f.min} max={f.max} ariaLabel={f.label} />;
          else if (f.type === 'enum') input = <Select id={id} value={v[f.key] ?? ''} onChange={x => set(f.key, x)} options={[{ id: '', label: 'Da indicare' }, ...(f.options || []).map(o => ({ id: o, label: o }))]} ariaLabel={f.label} />;
          else if (f.type === 'ref') input = <Select id={id} value={v[f.key] ?? ''} onChange={x => set(f.key, x)} options={[{ id: '', label: 'Da indicare' }, ...(d?.[f.ref] || []).map(x => ({ id: x.id, label: x.code || x.name || x.id }))]} ariaLabel={f.label} />;
          else if (f.type === 'bool') input = <label className="check small eam-check"><input id={id} type="checkbox" checked={!!v[f.key]} onChange={e => set(f.key, e.target.checked)} /> Sì</label>;
          else input = <input id={id} className="input" type={f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : 'text'} value={v[f.key] ?? ''} maxLength={f.maxLen} onChange={e => set(f.key, e.target.value)} aria-label={f.label} />;
          return <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} className={f.type === 'text' && f.maxLen > 60 ? 'wide' : ''}>{input}</Field>;
        })}
      </div>
      {children}
      {err && <p className="note crit small eam-err" role="alert">{err}</p>}
      <div className="row" style={{ gap: 8 }}>
        <Btn kind="primary" type="submit">{saveLabel}</Btn>
        <Btn kind="ghost" onClick={onCancel}>Annulla</Btn>
      </div>
    </form>
  );
}

/** Analisi di uno scarico: parametro, valore, unità, limite (e fonte del limite). Modifica l’elenco in memoria, poi lo salva il modulo. */
export function AnalysisEditor({ rows, onChange }) {
  const set = (i, k, x) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: x } : r)));
  return (
    <fieldset className="eam-analyses">
      <legend className="small">Analisi del campione</legend>
      {rows.map((r, i) => (
        <div className="eam-an" key={i} style={{ gap: 8 }}>
          <input className="input" value={r.param ?? ''} onChange={e => set(i, 'param', e.target.value)} placeholder="Parametro (es. rame totale)" aria-label={`Parametro ${i + 1}`} />
          <NumInput value={r.value ?? ''} onChange={x => set(i, 'value', x)} decimals={3} ariaLabel={`Valore ${i + 1}`} />
          <input className="input" value={r.unit ?? ''} onChange={e => set(i, 'unit', e.target.value)} placeholder="Unità" aria-label={`Unità ${i + 1}`} />
          <NumInput value={r.limit ?? ''} onChange={x => set(i, 'limit', x)} decimals={3} ariaLabel={`Limite ${i + 1}`} placeholder="Limite" />
          <Btn small kind="ghost" icon={LuTrash2} title="Togli questa analisi" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Btn small kind="ghost" icon={LuPlus} onClick={() => onChange([...rows, { param: '', value: '', unit: 'mg/l', limit: '' }])}>Aggiungi analisi</Btn>
    </fieldset>
  );
}

/** Analisi valide di uno scarico (con parametro e valore numerico); il limite è facoltativo. */
export const cleanAnalyses = rows => rows.filter(r => r.param && num(r.value) != null).map(r => ({ param: String(r.param), value: +r.value, unit: r.unit || '', limit: num(r.limit) ?? undefined }));
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
