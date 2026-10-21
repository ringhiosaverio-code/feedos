/* FeedOS 17 · Moduli generati dai campi delle anagrafiche (core/fields.js): un campo per tipo, validazione al salvataggio
 * con i messaggi accanto ai campi, riferimenti come elenchi delle voci esistenti. */
import React, { useState } from 'react';
import { LuSave, LuX } from 'react-icons/lu';
import { FIELDS, validateRecord, recLabel } from '../core/fields.js';
import { Field, NumInput, Select, Btn } from './ui.jsx';

/** Stato del modulo: valori, errori, set e validate. */
export function useForm(coll, initial, d) {
  const [v, setV] = useState(initial || {});
  const [errors, setErrors] = useState([]);
  const set = (k, x) => { setV(o => ({ ...o, [k]: x })); setErrors(es => es.filter(e => e.field !== k)); };
  const validate = () => { const es = validateRecord(coll, v, d); setErrors(es); return es.length === 0; };
  return { v, set, errors, validate, setV };
}

/** Un campo del modulo secondo il suo tipo. */
export function FieldInput({ f, value, onChange, d }) {
  if (f.type === 'number') return <NumInput value={value ?? null} onChange={onChange} decimals={f.decimals ?? 2} />;
  if (f.type === 'date') return <input type="date" className="input" value={value || ''} onChange={e => onChange(e.target.value)} />;
  if (f.type === 'month') return <input type="month" className="input" value={value || ''} onChange={e => onChange(e.target.value)} />;
  if (f.type === 'bool') return <label className="row small" style={{ gap: 6, minHeight: 34 }}><input type="checkbox" checked={value !== false} onChange={e => onChange(e.target.checked)} /> sì</label>;
  if (f.type === 'enum') return <Select value={value ?? ''} onChange={onChange} options={[{ id: '', label: '—' }, ...f.options.map(o => ({ id: o, label: o }))]} />;
  if (f.type === 'ref') {
    const rows = [...(d?.[f.ref] || [])].sort((a, b) => String(recLabel(f.ref, a)).localeCompare(String(recLabel(f.ref, b)), 'it'));
    return <Select value={value ?? ''} onChange={onChange} options={[{ id: '', label: '—' }, ...rows.slice(0, 500).map(r => ({ id: r.id, label: recLabel(f.ref, r) }))]} />;
  }
  return <input className="input" value={value ?? ''} maxLength={f.maxLen} onChange={e => onChange(e.target.value)} />;
}

/** Modulo di un record: onSave(valori) riceve i valori validati. */
export function EntityForm({ coll, rec, d, onSave, onCancel, saveLabel = 'Salva' }) {
  const F = useForm(coll, rec, d);
  const save = () => { if (F.validate()) onSave(F.v); };
  const err = k => F.errors.find(e => e.field === k)?.msg;
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="form">
        {(FIELDS[coll] || []).map(f => (
          <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={err(f.key) ? <span style={{ color: 'var(--crit-ink)' }}>{err(f.key)}</span> : ''}>
            <FieldInput f={f} value={F.v[f.key]} onChange={x => F.set(f.key, x)} d={d} />
          </Field>
        ))}
      </div>
      {F.errors.length > 0 && <div className="note crit small">{F.errors.length === 1 ? 'Un campo da correggere' : `${F.errors.length} campi da correggere`}.</div>}
      <div className="row"><Btn kind="primary" type="submit" icon={LuSave}>{saveLabel}</Btn>{onCancel && <Btn kind="ghost" icon={LuX} onClick={onCancel}>Annulla</Btn>}</div>
    </form>
  );
}
