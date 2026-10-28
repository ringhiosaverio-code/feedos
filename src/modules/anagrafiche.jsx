/* FeedOS 17 · Dati › Anagrafiche (pacchetto WP7): clienti, agenti, prodotti, linee, materie prime, fornitori e centri di costo;
 * inserimento e modifica con i controlli dei campi, cancellazione bloccata se il record è usato altrove (con l'elenco dei riferimenti).
 * Ogni modifica è un passo annullabile. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuPencil } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { nf, uid, slug } from '../core/util.js';
import { FIELDS, COLL_LABEL, referencesTo, recLabel } from '../core/fields.js';
import { Panel, Table, Btn, Seg, SearchBox, filterRows, confirm, Chip } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';

const COLLS = ['customers', 'agents', 'products', 'lines', 'ingredients', 'suppliers', 'costCenters'];
const DRAWER = { customers: 'customer', agents: 'agent', products: 'product', ingredients: 'ingredient', suppliers: 'supplier' };
// colonne mostrate in tabella: i primi campi della raccolta
const SHOWN = { customers: ['code', 'name', 'city', 'agentId', 'paymentDays'], agents: ['name', 'zone', 'commissionPct'], products: ['code', 'name', 'formulaId', 'lineId', 'listPrice'],
  lines: ['code', 'name', 'capacityTph', 'hoursWeek'], ingredients: ['code', 'name', 'category', 'price', 'leadDays'], suppliers: ['code', 'name', 'approval', 'paymentDays'], costCenters: ['code', 'name', 'group', 'driver'] };
/** Valori iniziali di un nuovo record (campi necessari ai motori che il modulo non chiede). */
const NEW = {
  customers: d => ({ status: 'attivo', type: 'allevamento', paymentDays: 60, species: [], products: [] }),
  agents: () => ({ commissionPct: 2.5 }),
  products: d => ({ active: true, form: 'Pellet 6 mm', packaging: 'Sfuso', processCost: 38, logisticsCost: 20, minMarginPct: 6, lineId: d.lines?.[0]?.id }),
  lines: d => ({ kind: 'pellet', hoursWeek: 40, color: (d.lines?.length || 0) + 1 }),
  ingredients: () => ({ category: 'cereale', active: true, leadDays: 7, safetyDays: 10, stock: 0, nutr: {}, dm: 88 }),
  suppliers: () => ({ approval: 'qualificato', paymentDays: 60, ingIds: [], cert: [], priceBreaks: [] }),
  costCenters: () => ({ group: 'stabilimento', cash: true, driver: 'tonnellate' }),
};

export function Anagrafiche({ d }) {
  const [coll, setColl] = useState('customers');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null); // {rec} o {new: true}
  const rows = filterRows(d[coll] || [], q, ['name', 'code', 'city', 'zone']);
  const fields = FIELDS[coll];
  const shown = SHOWN[coll].map(k => fields.find(f => f.key === k)).filter(Boolean);
  const refLabel = useMemo(() => {
    const m = {};
    for (const f of fields.filter(x => x.type === 'ref')) m[f.key] = Object.fromEntries((d[f.ref] || []).map(r => [r.id, recLabel(f.ref, r)]));
    return m;
  }, [d, coll]);
  const save = v => {
    const label = recLabel(coll, v);
    if (edit?.rec) {
      store.update(coll, edit.rec.id, v, `${COLL_LABEL[coll]}: modificato ${label}`);
      toast(`${label} aggiornato`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    } else {
      const dup = (d[coll] || []).find(r => (v.code && r.code === v.code) || (!v.code && r.name === v.name));
      if (dup) { toast(`Esiste già: ${recLabel(coll, dup)}`, 'err'); return; }
      const id = coll === 'lines' ? 'L' + ((d.lines?.length || 0) + 1) : coll === 'suppliers' ? 'sup-' + slug(v.name).slice(0, 24) : uid(coll.slice(0, 2));
      store.add(coll, { ...NEW[coll](d), ...v, id }, `${COLL_LABEL[coll]}: nuovo ${label}`);
      toast(`${label} aggiunto`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    }
    setEdit(null);
  };
  const remove = r => {
    const refs = referencesTo(d, coll, r.id);
    if (refs.length) { toast(`${recLabel(coll, r)} è usato in ${refs.map(x => `${x.n} ${COLL_LABEL[x.coll]?.toLowerCase() || x.coll}`).join(', ')}: non si può eliminare`, 'err'); return; }
    confirm(`Eliminare ${recLabel(coll, r)}?`, 'Il record non è usato altrove. L’operazione si può annullare.', () => { store.remove(coll, r.id, `${COLL_LABEL[coll]}: eliminato ${recLabel(coll, r)}`); toast('Eliminato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }, { ok: 'Elimina', danger: true });
  };
  const fmt = (f, r) => {
    const v = r[f.key];
    if (v == null || v === '') return <span className="muted">—</span>;
    if (f.type === 'ref') return refLabel[f.key]?.[v] || <Chip kind="warn">{v}</Chip>;
    if (f.type === 'number') return nf(v, Math.abs(v) < 10 && !Number.isInteger(+v) ? 1 : 0);
    if (f.type === 'bool') return v === false ? 'no' : 'sì';
    return String(v);
  };
  return (
    <div className="split">
      <Panel title={COLL_LABEL[coll]} sub={`${nf((d[coll] || []).length)} record · clic su una riga per modificarla`} flush id="ana-table"
        actions={<><SearchBox value={q} onChange={setQ} placeholder="Cerca" /><Btn small kind="primary" icon={LuPlus} onClick={() => setEdit({ new: true })}>Nuovo</Btn></>}>
        <div style={{ padding: '8px 16px' }}><Seg label="Anagrafica" value={coll} onChange={c => { setColl(c); setEdit(null); setQ(''); }} options={COLLS.map(c => ({ id: c, label: COLL_LABEL[c] }))} /></div>
        <Table rows={rows} onRow={r => setEdit({ rec: r })} selected={edit?.rec?.id} pageSize={20} exportName={`anagrafica-${coll}`} cols={[
          ...shown.map(f => ({ key: f.key, label: f.label, align: f.type === 'number' ? 'r' : undefined, render: r => fmt(f, r), csv: r => (f.type === 'ref' ? refLabel[f.key]?.[r[f.key]] ?? r[f.key] : r[f.key]) })),
          { key: 'x', label: '', nosort: true, csv: false, render: r => <span className="row gap-s" style={{ flexWrap: 'nowrap' }}>{DRAWER[coll] && <Btn small kind="ghost" icon={LuPencil} title="Apri la scheda" onClick={e => { e.stopPropagation(); openDrawer(DRAWER[coll], r.id); }} />}<Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={e => { e.stopPropagation(); remove(r); }} /></span> },
        ]} />
      </Panel>
      <Panel title={edit?.rec ? `Modifica: ${recLabel(coll, edit.rec)}` : edit?.new ? `Nuovo: ${COLL_LABEL[coll].toLowerCase()}` : 'Modulo'} sub={edit ? 'I campi con * sono obbligatori; i controlli sono gli stessi dell’importazione' : 'Scegli una riga o «Nuovo»'} id="ana-form">
        {edit ? <EntityForm key={(edit.rec?.id || 'new') + coll} coll={coll} rec={edit.rec || NEW[coll](d)} d={d} onSave={save} onCancel={() => setEdit(null)} saveLabel={edit.rec ? 'Salva le modifiche' : 'Aggiungi'} />
          : <p className="small muted">Le anagrafiche alimentano formule, costi, fabbisogni, margini e crediti: un cliente senza agente o senza termini di pagamento, o un prodotto senza formula, compaiono in Dati › Qualità dei dati.</p>}
      </Panel>
    </div>
  );
}
