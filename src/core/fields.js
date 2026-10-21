/* FeedOS 17 · Campi delle anagrafiche e dei movimenti importabili (pacchetto WP7): un'unica descrizione per i moduli di
 * inserimento, la validazione dei record e l'importazione da CSV. Tipi: text, number, date (AAAA-MM-GG), month (AAAA-MM),
 * enum (options), ref (id di un'altra raccolta), bool. */
import { byId } from './util.js';

const FORMS = ['Pellet 3 mm', 'Pellet 4 mm', 'Pellet 6 mm', 'Pellet 8 mm', 'Sbriciolato', 'Farina'];
export const FIELDS = {
  customers: [
    { key: 'code', label: 'Codice', type: 'text' },
    { key: 'name', label: 'Ragione sociale', type: 'text', required: true },
    { key: 'type', label: 'Tipo', type: 'enum', options: ['allevamento', 'rivenditore', 'cooperativa', 'altro'] },
    { key: 'city', label: 'Comune', type: 'text' },
    { key: 'province', label: 'Provincia', type: 'text', maxLen: 2 },
    { key: 'agentId', label: 'Agente', type: 'ref', ref: 'agents' },
    { key: 'paymentDays', label: 'Giorni di pagamento', type: 'number', min: 0, max: 365 },
    { key: 'creditLimit', label: 'Fido €', type: 'number', min: 0 },
    { key: 'lat', label: 'Latitudine', type: 'number', min: -90, max: 90 },
    { key: 'lon', label: 'Longitudine', type: 'number', min: -180, max: 180 },
    { key: 'status', label: 'Stato', type: 'enum', options: ['attivo', 'cessato'] },
  ],
  agents: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'zone', label: 'Zona', type: 'text' },
    { key: 'commissionPct', label: 'Provvigione %', type: 'number', min: 0, max: 20 },
  ],
  products: [
    { key: 'code', label: 'Codice', type: 'text', required: true },
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'formulaId', label: 'Formula', type: 'ref', ref: 'formulas', required: true },
    { key: 'lineId', label: 'Linea', type: 'ref', ref: 'lines', required: true },
    { key: 'form', label: 'Forma', type: 'enum', options: FORMS },
    { key: 'packaging', label: 'Confezione', type: 'enum', options: ['Sfuso', 'Sacchi', 'Big bag'] },
    { key: 'listPrice', label: 'Listino €/t', type: 'number', min: 0 },
    { key: 'processCost', label: 'Trasformazione €/t', type: 'number', min: 0 },
    { key: 'logisticsCost', label: 'Trasporto €/t', type: 'number', min: 0 },
    { key: 'minMarginPct', label: 'Margine minimo %', type: 'number', min: 0, max: 50 },
    { key: 'active', label: 'Attivo', type: 'bool' },
  ],
  lines: [
    { key: 'code', label: 'Codice', type: 'text', required: true },
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'kind', label: 'Tipo', type: 'enum', options: ['pellet', 'farina'] },
    { key: 'capacityTph', label: 'Portata t/h', type: 'number', min: 0.1, required: true },
    { key: 'hoursWeek', label: 'Ore di turno a settimana', type: 'number', min: 1, max: 168, required: true },
    { key: 'kwhPerT', label: 'kWh/t tipici', type: 'number', min: 0 },
    { key: 'gplKgPerT', label: 'GPL kg/t tipici', type: 'number', min: 0 },
  ],
  ingredients: [
    { key: 'code', label: 'Codice', type: 'text', required: true },
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'category', label: 'Categoria', type: 'enum', options: ['cereale', 'coprodotto', 'proteico', 'foraggio', 'grasso', 'minerale', 'aminoacido', 'premix'] },
    { key: 'price', label: 'Prezzo €/t', type: 'number', min: 0, required: true },
    { key: 'dm', label: 'Sostanza secca %', type: 'number', min: 0, max: 100 },
    { key: 'leadDays', label: 'Consegna (giorni)', type: 'number', min: 0, max: 120 },
    { key: 'safetyDays', label: 'Scorta di sicurezza (giorni)', type: 'number', min: 0, max: 120 },
    { key: 'supplier', label: 'Fornitore abituale', type: 'text' },
    { key: 'active', label: 'Attiva', type: 'bool' },
  ],
  suppliers: [
    { key: 'code', label: 'Codice', type: 'text' },
    { key: 'name', label: 'Ragione sociale', type: 'text', required: true },
    { key: 'approval', label: 'Qualifica', type: 'enum', options: ['qualificato', 'condizionato', 'sospeso'] },
    { key: 'paymentDays', label: 'Giorni di pagamento', type: 'number', min: 0, max: 365 },
    { key: 'minOrderT', label: 'Ordine minimo t', type: 'number', min: 0 },
  ],
  costCenters: [
    { key: 'code', label: 'Codice', type: 'text' },
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'group', label: 'Gruppo', type: 'enum', options: ['stabilimento', 'struttura', 'commerciale'], required: true },
    { key: 'cash', label: 'Monetario (no ammortamenti)', type: 'bool' },
    { key: 'driver', label: 'Base di ripartizione', type: 'enum', options: ['ore', 'tonnellate', 'ricavi'] },
  ],
  shipments: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'customerId', label: 'Cliente', type: 'ref', ref: 'customers', required: true },
    { key: 'productId', label: 'Prodotto', type: 'ref', ref: 'products', required: true },
    { key: 'lotId', label: 'Lotto', type: 'ref', ref: 'lots' },
    { key: 'tonnes', label: 'Tonnellate', type: 'number', min: 0.001, required: true },
    { key: 'price', label: 'Prezzo €/t', type: 'number', min: 0.01, required: true },
    { key: 'ddt', label: 'Documento di trasporto', type: 'text', required: true },
  ],
  invoices: [
    { key: 'number', label: 'Numero', type: 'text', required: true },
    { key: 'customerId', label: 'Cliente', type: 'ref', ref: 'customers', required: true },
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'taxable', label: 'Imponibile €', type: 'number', required: true },
    { key: 'vat', label: 'IVA €', type: 'number' },
    { key: 'total', label: 'Totale €', type: 'number' },
    { key: 'dueDate', label: 'Scadenza', type: 'date', required: true },
    { key: 'status', label: 'Stato', type: 'enum', options: ['aperta', 'pagata', 'insoluta', 'contestata'] },
  ],
  payments: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'customerId', label: 'Cliente', type: 'ref', ref: 'customers', required: true },
    { key: 'invoiceId', label: 'Fattura', type: 'ref', ref: 'invoices' },
    { key: 'amount', label: 'Importo €', type: 'number', min: 0.01, required: true },
    { key: 'method', label: 'Modalità', type: 'enum', options: ['bonifico', 'riba', 'assegno', 'contanti', 'compensazione'] },
  ],
  fixedCosts: [
    { key: 'month', label: 'Mese', type: 'month', required: true },
    { key: 'centerId', label: 'Centro di costo', type: 'ref', ref: 'costCenters', required: true },
    { key: 'kind', label: 'Tipo', type: 'enum', options: ['consuntivo', 'budget'], required: true },
    { key: 'amount', label: 'Importo €', type: 'number', required: true },
  ],
  energy: [
    { key: 'month', label: 'Mese', type: 'month', required: true },
    { key: 'tonnes', label: 'Tonnellate prodotte', type: 'number', min: 0 },
    { key: 'kwhGrid', label: 'kWh dalla rete', type: 'number', min: 0 },
    { key: 'kwhPV', label: 'kWh fotovoltaico', type: 'number', min: 0 },
    { key: 'kwhExport', label: 'kWh ceduti', type: 'number', min: 0 },
    { key: 'gplKg', label: 'GPL kg', type: 'number', min: 0 },
  ],
};
/** Nome della raccolta per l'interfaccia. */
export const COLL_LABEL = { customers: 'Clienti', agents: 'Agenti', products: 'Prodotti', lines: 'Linee', ingredients: 'Materie prime', suppliers: 'Fornitori', costCenters: 'Centri di costo', shipments: 'Consegne', invoices: 'Fatture', payments: 'Incassi', fixedCosts: 'Costi fissi', energy: 'Energia', formulas: 'Formule', lots: 'Lotti' };
/** Etichetta di un record di una raccolta (per i riferimenti). */
export const recLabel = (coll, r) => (!r ? '' : coll === 'invoices' ? r.number : coll === 'lots' ? r.code : r.name || r.code || r.id);

const ISO = /^\d{4}-\d{2}-\d{2}$/, YM = /^\d{4}-\d{2}$/;
const empty = v => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));

/** Errori di un record rispetto ai campi della raccolta: [{field, msg}]. */
export function validateRecord(coll, rec, d) {
  const out = [];
  for (const f of FIELDS[coll] || []) {
    const v = rec?.[f.key];
    if (empty(v)) { if (f.required) out.push({ field: f.key, msg: `${f.label}: obbligatorio` }); continue; }
    if (f.type === 'number') {
      if (!Number.isFinite(+v)) { out.push({ field: f.key, msg: `${f.label}: non è un numero` }); continue; }
      if (f.min != null && +v < f.min) out.push({ field: f.key, msg: `${f.label}: almeno ${f.min}` });
      if (f.max != null && +v > f.max) out.push({ field: f.key, msg: `${f.label}: al massimo ${f.max}` });
    } else if (f.type === 'date' && !ISO.test(String(v))) out.push({ field: f.key, msg: `${f.label}: data non valida (AAAA-MM-GG)` });
    else if (f.type === 'month' && !YM.test(String(v))) out.push({ field: f.key, msg: `${f.label}: mese non valido (AAAA-MM)` });
    else if (f.type === 'enum' && f.options && !f.options.includes(v)) out.push({ field: f.key, msg: `${f.label}: valore non ammesso «${v}»` });
    else if (f.type === 'ref' && d && !byId(d[f.ref] || [])[v]) out.push({ field: f.key, msg: `${f.label}: «${v}» non trovato` });
    else if (f.maxLen && String(v).length > f.maxLen) out.push({ field: f.key, msg: `${f.label}: al massimo ${f.maxLen} caratteri` });
  }
  return out;
}

/** Riferimenti a un record da altre raccolte (per impedire di cancellare ciò che è in uso): [{coll, n}]. */
export function referencesTo(d, coll, id) {
  const uses = {
    customers: [['shipments', 'customerId'], ['offers', 'customerId'], ['invoices', 'customerId'], ['payments', 'customerId'], ['complaints', 'customerId'], ['visits', 'customerId']],
    agents: [['customers', 'agentId'], ['shipments', 'agentId'], ['offers', 'agentId']],
    products: [['shipments', 'productId'], ['lots', 'productId'], ['plan', 'productId'], ['offers', 'productId'], ['priceLists', 'productId']],
    lines: [['products', 'lineId'], ['runs', 'lineId'], ['plan', 'lineId'], ['stops', 'lineId']],
    ingredients: [['ingLots', 'ingId'], ['purchases', 'ingId']],
    suppliers: [['ingLots', 'supplierId'], ['purchases', 'supplierId']],
    costCenters: [['fixedCosts', 'centerId']],
    formulas: [['products', 'formulaId']],
  }[coll] || [];
  const out = uses.map(([c, k]) => ({ coll: c, n: (d[c] || []).filter(r => r[k] === id).length })).filter(x => x.n);
  if (coll === 'ingredients') { const n = (d.formulas || []).filter(f => (f.lines || []).some(l => l.ing === id)).length; if (n) out.push({ coll: 'formulas', n }); }
  return out;
}
