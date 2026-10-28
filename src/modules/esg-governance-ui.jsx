/* FeedOS 18 · ESG › Governance ed evidenze: elementi condivisi dalle sottosezioni (numeri, etichette di stato, cassetto di modifica
 * dei registri, esportazioni). Prefisso CSS ego-. Scritture solo con store.batch / store.remove e un'etichetta italiana. */
import React from 'react';
import { LuTrash2, LuCheck, LuX, LuMinus } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { nf, dateIt } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { Chip, Btn, Drawer, confirm } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { COLL_LABEL_GOVERNANCE } from '../data/fields-governance.js';

export const pctTxt = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v * 100, d)}%`);
export const eurTxt = v => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v, 0)} €`);
export const mbTxt = b => (b == null || !Number.isFinite(+b) ? '—' : b >= 1048576 ? `${nf(b / 1048576, 1)} MB` : `${nf(Math.max(1, b / 1024), 0)} KB`);
export const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
export const dayTxt = n => (n == null ? '' : n === 0 ? 'oggi' : n === 1 ? 'domani' : n === -1 ? 'ieri' : n > 0 ? `tra ${nf(n)} giorni` : `da ${nf(-n)} giorni`);
/** Scarica righe in CSV (separatore punto e virgola, virgola decimale). */
export function downloadCsv(name, rows, cols) { download(`feedos-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime = 'text/plain;charset=utf-8') { download(`feedos-${name}-${stamp()}.${ext}`, text, mime); }

const OBL = { scaduto: 'crit', 'in scadenza': 'warn', 'in vigore': 'maize', 'da pianificare': 'outline', pianificato: 'accent', 'su evento': 'outline', altrove: 'violet', fatto: 'good', 'non applicabile': 'outline' };
const OBL_TITLE = { 'in vigore': 'Regola già in vigore: confermare l’adeguamento con «Fatto»', altrove: 'La data la gestisce un’altra scheda', 'su evento': 'Si fa quando succede: nessuna data fissa', 'da pianificare': 'Manca la data: indica la prossima scadenza o l’ultimo completamento' };
/** Stato di un obbligo o di una scadenza. */
export function OblChip({ status }) { return <Chip kind={OBL[status] || 'outline'} title={OBL_TITLE[status]}>{status || '—'}</Chip>; }
const EXP = { scaduto: 'crit', 'in scadenza': 'warn', valido: 'good', 'senza scadenza': 'outline', scaduta: 'crit', valida: 'good', sostituita: 'outline' };
/** Stato di un documento con scadenza. */
export function ExpChip({ state, days }) { return <Chip kind={EXP[state] || 'outline'}>{state}{days != null && state !== 'senza scadenza' && state !== 'sostituita' ? ` · ${dayTxt(days)}` : ''}</Chip>; }
const VERD = { ammessa: 'good', 'da rivedere': 'warn', bloccata: 'crit' };
/** Esito del controllo di una dichiarazione. */
export function VerdictChip({ verdict }) { return <Chip kind={VERD[verdict] || 'outline'}>{verdict}</Chip>; }
const SEVF = { blocco: ['crit', 'vietata'], alto: ['crit', 'non ammessa'], medio: ['warn', 'da rivedere'], info: ['accent', 'condizione'] };
/** Gravità di un rilievo del controllo. */
export function FindingChip({ severity }) { const [k, l] = SEVF[severity] || ['outline', severity]; return <Chip kind={k}>{l}</Chip>; }
/** Sì, no o non indicato (matrici). */
export function Tick({ on, label }) {
  if (on == null) return <span className="ego-tick ego-na" title="non indicato"><LuMinus aria-label="non indicato" /></span>;
  return on ? <span className="ego-tick ego-yes" title={label || 'sì'}><LuCheck aria-label={label || 'sì'} /></span> : <span className="ego-tick ego-no" title="no"><LuX aria-label="no" /></span>;
}

/**
 * Cassetto di modifica di un record di una raccolta del pacchetto: campi da FIELDS (EntityForm), più campi propri (children) i cui
 * valori arrivano con extra. Nuovo record: rec senza id (defaults per i campi non nel modulo). Elimina con conferma.
 */
export function RecordDrawer({ d, coll, rec, title, sub, onClose, defaults = {}, extra = {}, labelOf, children, canDelete = true, onRemoved, idOf, validate }) {
  const isNew = !rec?.id;
  const name = COLL_LABEL_GOVERNANCE[coll] || coll;
  const lbl = o => (labelOf ? labelOf(o) : o?.title || o?.name || o?.id || '');
  const save = v => {
    const obj = { ...defaults, ...(rec || {}), ...v, ...extra };
    const err = validate ? validate(obj) : null;
    if (err) { toast(err, 'err'); return; }
    if (isNew && idOf) {
      obj.id = String(idOf(obj) || '').trim() || undefined;
      if (obj.id && (d[coll] || []).some(x => x.id === obj.id)) { toast(`Esiste già una riga «${obj.id}»: aprila per modificarla`, 'err'); return; }
    }
    const ops = isNew ? [{ kind: 'add', coll, obj }] : [{ kind: 'update', coll, id: rec.id, patch: { ...v, ...extra } }];
    store.batch(ops, `${name}: ${isNew ? 'aggiunto' : 'modificato'} «${lbl(obj)}»`);
    undoToast(isNew ? 'Aggiunto' : 'Modifiche salvate');
    onClose();
  };
  const remove = () => confirm(`Eliminare «${lbl(rec)}»?`, 'Il record esce dal registro; si può annullare subito dopo.', () => {
    store.remove(coll, rec.id, `${name}: eliminato «${lbl(rec)}»`);
    onRemoved?.(rec);
    undoToast('Eliminato');
    onClose();
  }, { danger: true, ok: 'Elimina' });
  return (
    <Drawer title={title || (isNew ? `Nuovo: ${name.toLowerCase()}` : lbl(rec))} sub={sub || name} onClose={onClose} wide
      actions={!isNew && canDelete ? <Btn kind="danger" icon={LuTrash2} onClick={remove}>Elimina</Btn> : null}>
      <div className="stack">
        {children}
        <EntityForm coll={coll} rec={rec || defaults} d={d} onSave={save} onCancel={onClose} saveLabel={isNew ? 'Aggiungi' : 'Salva'} />
      </div>
    </Drawer>
  );
}

/** Data breve o trattino. */
export const dt = s => (s ? dateIt(s) : '—');
