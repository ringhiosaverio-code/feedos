/* FeedOS 18 · ESG › Persone e sicurezza: elementi condivisi dalle sottosezioni (formati, fonti del pacchetto, cassetto di modifica dei
 * registri, esportazioni, confronto con il mese prima). Prefisso CSS epe-. Scritture solo con store.batch e un'etichetta italiana.
 * Regole grafiche: spaziature multiple di 8, pesi del testo 400 e 600, niente maiuscolo, numeri senza decorazioni. */
import React from 'react';
import { LuTrash2 } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { nf, dateIt, addMonths } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { META as EDITION } from '../editions/meta.js';
import { Btn, Drawer, confirm } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { StatusChip } from './esg-shared.jsx';
import { COLL_LABEL_PERSONE } from '../data/fields-persone.js';

export const pctTxt = (v, k = 1) => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v * 100, k)}%`);
export const numTxt = (v, k = 1) => (v == null || !Number.isFinite(+v) ? '—' : nf(v, k));
export const dt = s => (s ? dateIt(s) : '—');
export const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
export const dayTxt = n => (n == null ? '' : n === 0 ? 'oggi' : n === 1 ? 'domani' : n === -1 ? 'ieri' : n > 0 ? `tra ${nf(n)} giorni` : `da ${nf(-n)} giorni`);
const FILE = () => EDITION.product.toLowerCase();
/** Scarica righe in CSV (separatore punto e virgola, virgola decimale). */
export function downloadCsv(name, rows, cols) { download(`${FILE()}-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime = 'text/plain;charset=utf-8') { download(`${FILE()}-${name}-${stamp()}.${ext}`, text, mime); }

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
/** «rispetto a settembre» / «rispetto ad agosto». */
export const vsMonth = ym => { const m = MESI[+String(ym).slice(5, 7) - 1] || ''; return `rispetto ${/^a/.test(m) ? 'ad' : 'a'} ${m}`; };
/** Variazione percentuale tra due valori mensili (null se non confrontabili). */
export const pctChange = (cur, prev) => (cur != null && prev != null && Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0 ? (cur - prev) / Math.abs(prev) * 100 : null);
/** Mese prima di un mese 'YYYY-MM'. */
export const prevMonth = ym => addMonths(ym, -1);

/** Fonte di una voce del pacchetto: norma, stato e «valido al». */
export function PackSource({ item, validAsOf, small = true }) {
  if (!item) return null;
  return (
    <span className={`epe-src ${small ? 'small' : ''}`}>
      {item.law && item.law !== '—' ? <span>{item.law}</span> : null}
      <StatusChip status={item.status} />
      {validAsOf ? <span className="muted">valido al {dateIt(validAsOf)}</span> : null}
    </span>
  );
}

/** Coppia etichetta e numero, senza decorazioni. */
export function Fig({ label, value, unit, sub }) {
  return (
    <div className="epe-fig">
      <span className="epe-fig-l">{label}</span>
      <span className="epe-fig-v">{value}{unit ? <small> {unit}</small> : null}</span>
      {sub ? <span className="epe-fig-s">{sub}</span> : null}
    </div>
  );
}

/**
 * Cassetto di modifica di un record di una raccolta del pacchetto: campi da FIELDS (EntityForm), più contenuto proprio (children).
 * Nuovo record: rec senza id (defaults per i campi); extra: valori dei campi propri (children). Elimina con conferma.
 * validate(obj) → messaggio d'errore o null.
 */
export function RecordDrawer({ d, coll, rec, title, sub, onClose, defaults = {}, extra = {}, labelOf, children, canDelete = true, validate, idOf }) {
  const isNew = !rec?.id;
  const name = COLL_LABEL_PERSONE[coll] || coll;
  const lbl = o => (labelOf ? labelOf(o) : o?.course || o?.text || o?.title || o?.id || '');
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
  const remove = () => confirm(`Eliminare «${lbl(rec)}»?`, 'La riga esce dal registro; si può annullare subito dopo.', () => {
    store.remove(coll, rec.id, `${name}: eliminato «${lbl(rec)}»`);
    undoToast('Eliminato');
    onClose();
  }, { danger: true, ok: 'Elimina' });
  return (
    <Drawer title={title || (isNew ? `Nuova riga: ${name.toLowerCase()}` : lbl(rec))} sub={sub || name} onClose={onClose} wide
      actions={!isNew && canDelete ? <Btn kind="danger" icon={LuTrash2} onClick={remove}>Elimina</Btn> : null}>
      <div className="stack">
        {children}
        <EntityForm coll={coll} rec={rec || defaults} d={d} onSave={save} onCancel={onClose} saveLabel={isNew ? 'Aggiungi' : 'Salva'} />
      </div>
    </Drawer>
  );
}

/** Avviso fisso sulla riservatezza: codici pseudonimi, gruppi piccoli non mostrati. */
export function PrivacyNote({ smallCell = 5 }) {
  return <p className="note small epe-note">Servono solo codici pseudonimi, genere, categoria e importi: mai nomi, codici fiscali o dati sanitari. I valori dei gruppi con meno di {smallCell} persone non si mostrano e non si esportano.</p>;
}
