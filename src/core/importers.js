/* FeedOS 17 · Importazione guidata da CSV (pacchetto WP7): per ogni tipo di dati la raccolta, i campi, la chiave che aggiorna
 * invece di duplicare, i sinonimi delle intestazioni italiane e le conversioni (numeri all'italiana, date gg/mm/aaaa, kg → t).
 * autoMap → preview (nuovi, modificati, invariati, errori per cella, controlli di tracciabilità sulle consegne) → toOps
 * (un solo upsertMany: un passo annullabile). Funzioni pure, usabili nei test. */
import { norm, byId } from './util.js';
import { FIELDS, validateRecord } from './fields.js';

/** Numero da testo italiano: «1.234,5» → 1234,5 · «1.234» → 1234 · «0.19» → 0,19 · «12,3 %» → 12,3 · «−5» → −5. */
export function parseNum(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let x = String(s).trim().replace(/[€%\s]/g, '').replace(/^−/, '-');
  if (!x) return null;
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); // punti delle migliaia senza decimali
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
/** Data da «gg/mm/aaaa», «gg-mm-aa», «gg.mm.aaaa» o «aaaa-mm-gg» → 'aaaa-mm-gg' (null se non valida). */
export function parseDate(s) {
  const t = String(s ?? '').trim();
  let y, m, d;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [, y, m, d] = r;
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) { [, d, m, y] = r; if (y.length === 2) y = '20' + y; }
  else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== +d ? null : iso;
}
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
/** Mese da «aaaa-mm», «mm/aaaa», «gennaio 2026», «gen-26» → 'aaaa-mm'. */
export function parseMonth(s) {
  const t = norm(String(s ?? '')).trim();
  let r = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (r) return `${r[1]}-${r[2].padStart(2, '0')}`;
  if ((r = /^(\d{1,2})[/.-](\d{4})$/.exec(t))) return `${r[2]}-${r[1].padStart(2, '0')}`;
  if ((r = /^([a-z]{3})[a-z]*[\s/.-]+(\d{2,4})$/.exec(t))) { const i = MESI.indexOf(r[1]); if (i >= 0) return `${r[2].length === 2 ? '20' + r[2] : r[2]}-${String(i + 1).padStart(2, '0')}`; }
  const dd = parseDate(s);
  return dd ? dd.slice(0, 7) : null;
}

/** Tipi importabili: raccolta, chiave di aggiornamento, campi, sinonimi delle intestazioni, valori di base. */
export const TYPES = {
  clienti: { coll: 'customers', label: 'Clienti', key: ['code'], altKey: ['name'],
    synonyms: { code: ['codice', 'cod cliente', 'codice cliente'], name: ['ragione sociale', 'rag sociale', 'cliente', 'denominazione', 'nome'], type: ['tipo', 'tipologia'], city: ['comune', 'citta', 'localita'], province: ['provincia', 'prov'],
      agentId: ['agente', 'venditore'], paymentDays: ['gg pagamento', 'giorni pagamento', 'giorni di pagamento', 'pagamento gg', 'termini'], creditLimit: ['fido', 'affidamento', 'fido euro'], lat: ['latitudine', 'lat'], lon: ['longitudine', 'lon', 'lng'], status: ['stato'] },
    defaults: { status: 'attivo', species: [], products: [] } },
  agenti: { coll: 'agents', label: 'Agenti', key: ['name'], synonyms: { name: ['agente', 'nome', 'nominativo'], zone: ['zona', 'area'], commissionPct: ['provvigione', 'provvigione %', 'percentuale provvigione'] }, defaults: { commissionPct: 2.5 } },
  prodotti: { coll: 'products', label: 'Prodotti', key: ['code'], synonyms: { code: ['codice', 'codice prodotto', 'articolo'], name: ['nome', 'descrizione', 'prodotto'], formulaId: ['formula'], lineId: ['linea'], form: ['forma'], packaging: ['confezione', 'imballo'], listPrice: ['listino', 'prezzo di listino', 'prezzo'], processCost: ['trasformazione'], logisticsCost: ['trasporto'], minMarginPct: ['margine minimo'] }, defaults: { active: true } },
  consegne: { coll: 'shipments', label: 'Consegne', key: ['ddt', 'productId'],
    synonyms: { date: ['data', 'data ddt', 'data consegna', 'data documento'], customerId: ['cliente', 'codice cliente', 'ragione sociale'], productId: ['prodotto', 'articolo', 'codice prodotto', 'codice articolo'], lotId: ['lotto', 'n lotto', 'numero lotto'],
      tonnes: ['tonnellate', 'quantita', 'qta', 'quantita t', 't', 'quantita kg', 'kg', 'peso netto kg'], price: ['prezzo', 'prezzo t', 'prezzo unitario', 'prezzo euro t', 'euro t'], ddt: ['ddt', 'n ddt', 'numero ddt', 'documento', 'bolla', 'n bolla'] } },
  'costi-fissi': { coll: 'fixedCosts', label: 'Costi fissi', key: ['month', 'centerId', 'kind'], synonyms: { month: ['mese', 'periodo', 'competenza'], centerId: ['centro di costo', 'centro', 'cdc', 'conto'], kind: ['tipo', 'natura'], amount: ['importo', 'importo euro', 'valore', 'costo'] }, defaults: { kind: 'consuntivo', source: 'importazione' } },
  fatture: { coll: 'invoices', label: 'Fatture', key: ['number'], synonyms: { number: ['numero', 'n fattura', 'numero fattura', 'documento'], customerId: ['cliente', 'codice cliente', 'ragione sociale'], date: ['data', 'data fattura', 'data documento'], taxable: ['imponibile'], vat: ['iva', 'imposta'], total: ['totale', 'totale documento'], dueDate: ['scadenza', 'data scadenza'], status: ['stato'] }, defaults: { status: 'aperta', source: 'importazione' } },
  incassi: { coll: 'payments', label: 'Incassi', key: ['date', 'customerId', 'amount'], synonyms: { date: ['data', 'data incasso', 'valuta'], customerId: ['cliente', 'codice cliente', 'ragione sociale'], invoiceId: ['fattura', 'n fattura', 'numero fattura', 'documento'], amount: ['importo', 'incassato', 'importo euro'], method: ['modalita', 'mezzo', 'tipo pagamento'] }, defaults: { method: 'bonifico' } },
  energia: { coll: 'energy', label: 'Energia', key: ['month'], synonyms: { month: ['mese', 'periodo'], tonnes: ['tonnellate', 'produzione t'], kwhGrid: ['kwh rete', 'prelievo', 'energia prelevata'], kwhPV: ['kwh fotovoltaico', 'fotovoltaico', 'produzione fv'], kwhExport: ['kwh ceduti', 'immessa', 'ceduta'], gplKg: ['gpl kg', 'gpl'] }, defaults: { source: 'importazione' } },
};

/** Abbinamento automatico delle colonne: {campo: {col, confidence}} (1 nome identico, 0,9 sinonimo identico, 0,7 contenuto). */
export function autoMap(header, typeId) {
  const T = TYPES[typeId];
  if (!T) return {};
  const cols = header.map(h => ({ h, n: norm(h).replace(/[^a-z0-9]+/g, ' ').trim() }));
  const out = {}, used = new Set();
  const fields = FIELDS[T.coll];
  const cand = [];
  for (const f of fields) {
    const names = [norm(f.label).replace(/[^a-z0-9]+/g, ' ').trim(), f.key.toLowerCase()];
    const syn = (T.synonyms[f.key] || []).map(s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim());
    for (const c of cols) {
      let conf = 0;
      if (names.includes(c.n)) conf = 1;
      else if (syn.includes(c.n)) conf = 0.9;
      else if (syn.some(s => s.length > 3 && (c.n.startsWith(s) || c.n.includes(' ' + s) || (c.n.length > 3 && s.startsWith(c.n))))) conf = 0.7;
      if (conf) cand.push({ field: f.key, col: c.h, conf });
    }
  }
  cand.sort((a, b) => b.conf - a.conf);
  for (const c of cand) if (!out[c.field] && !used.has(c.col)) { out[c.field] = { col: c.col, confidence: c.conf }; used.add(c.col); }
  return out;
}

/** Risolve un riferimento scritto come id, codice, numero o nome. */
function resolver(d, coll) {
  const rows = d[coll] || [];
  const m = new Map();
  for (const r of rows) for (const k of [r.id, r.code, r.number, r.name, r.ddt]) if (k != null && k !== '') { const n = norm(String(k)).trim(); if (!m.has(n)) m.set(n, r.id); }
  return v => (v == null || v === '' ? null : m.get(norm(String(v)).trim()) ?? null);
}
const keyOf = (keys, r) => (keys.every(k => r[k] != null && r[k] !== '') ? keys.map(k => String(r[k])).join('|') : null);

/**
 * Anteprima dell'importazione: righe convertite e controllate, confrontate con l'archivio per chiave.
 * → {type, coll, key, rows: [{i, rec, status: 'new'|'changed'|'same'|'error', diffs, errors, existingId}], counts}
 */
export function preview(d, typeId, rows, map) {
  const T = TYPES[typeId], fields = FIELDS[T.coll];
  const refs = Object.fromEntries(fields.filter(f => f.type === 'ref').map(f => [f.key, resolver(d, f.ref)]));
  const keys = map[T.key[0]] || !T.altKey ? T.key : T.altKey;
  const existing = new Map();
  for (const r of d[T.coll] || []) { const k = keyOf(keys, r); if (k && !existing.has(k)) existing.set(k, r); }
  // controlli di tracciabilità delle consegne: lotto esistente, dello stesso prodotto, non oltre le tonnellate prodotte
  const lots = byId(d.lots || []);
  const shipped = {};
  if (T.coll === 'shipments') for (const s of d.shipments || []) shipped[s.lotId] = (shipped[s.lotId] || 0) + (+s.tonnes || 0);
  const kgCol = map.tonnes && /\bkg\b|chil/i.test(norm(map.tonnes.col)) ? 1000 : 1;
  const seen = new Set();
  const out = rows.map((row, i) => {
    const rec = { ...(T.defaults || {}) }, errors = [];
    for (const f of fields) {
      const m = map[f.key];
      if (!m || m.col == null || m.col === '') continue;
      const raw = row[m.col];
      if (raw == null || String(raw).trim() === '') continue;
      let v;
      if (f.type === 'number') { v = parseNum(raw); if (v != null && f.key === 'tonnes') v /= kgCol; if (v == null) errors.push({ field: f.key, msg: `«${raw}» non è un numero` }); }
      else if (f.type === 'date') { v = parseDate(raw); if (!v) errors.push({ field: f.key, msg: `«${raw}» non è una data` }); }
      else if (f.type === 'month') { v = parseMonth(raw); if (!v) errors.push({ field: f.key, msg: `«${raw}» non è un mese` }); }
      else if (f.type === 'ref') { v = refs[f.key](raw); if (!v) errors.push({ field: f.key, msg: `«${raw}» non trovato in ${f.label.toLowerCase()}` }); }
      else if (f.type === 'enum') { v = f.options.find(o => norm(o) === norm(String(raw))) ?? null; if (!v) errors.push({ field: f.key, msg: `«${raw}» non ammesso` }); }
      else if (f.type === 'bool') v = !/^(no|n|false|0)$/i.test(String(raw).trim());
      else v = String(raw).trim();
      if (v != null) rec[f.key] = v;
    }
    for (const e of validateRecord(T.coll, rec, d)) if (!errors.some(x => x.field === e.field)) errors.push(e);
    if (T.coll === 'shipments' && !errors.some(e => e.field === 'lotId')) {
      const lot = lots[rec.lotId];
      if (!rec.lotId) errors.push({ field: 'lotId', msg: 'lotto mancante: senza lotto la consegna non è tracciabile' });
      else if (lot && rec.productId && lot.productId !== rec.productId) errors.push({ field: 'lotId', msg: `il lotto ${lot.code} è di un altro prodotto` });
      else if (lot && rec.tonnes) { shipped[rec.lotId] = (shipped[rec.lotId] || 0) + rec.tonnes; if (shipped[rec.lotId] > (+lot.tonnes || 0) + 0.05) errors.push({ field: 'tonnes', msg: `il lotto ${lot.code} supera le ${lot.tonnes} t prodotte` }); }
    }
    const k = keyOf(keys, rec);
    if (k && seen.has(k)) errors.push({ field: keys[0], msg: 'riga ripetuta nel file' });
    if (k) seen.add(k);
    const ex = k ? existing.get(k) : null;
    let status = errors.length ? 'error' : ex ? 'changed' : 'new', diffs = [];
    if (!errors.length && ex) {
      diffs = Object.keys(rec).filter(f => f !== 'id' && JSON.stringify(ex[f]) !== JSON.stringify(rec[f]) && !(f in (T.defaults || {}) && ex[f] != null && !(map[f]?.col))).map(f => ({ field: f, from: ex[f], to: rec[f] }));
      if (!diffs.length) status = 'same';
    }
    return { i, rec, status, diffs, errors, existingId: ex?.id || null };
  });
  const counts = { new: 0, changed: 0, same: 0, error: 0 };
  for (const r of out) counts[r.status]++;
  return { type: typeId, coll: T.coll, key: keys, rows: out, counts };
}

/** Operazioni dell'importazione: un solo upsertMany con i nuovi e i modificati (le righe con errori restano fuori). */
export function toOps(pv) {
  const objs = pv.rows.filter(r => r.status === 'new' || r.status === 'changed').map(r => (r.status === 'changed' ? { ...Object.fromEntries(r.diffs.map(x => [x.field, x.to])), ...Object.fromEntries(pv.key.map(k => [k, r.rec[k]])) } : r.rec));
  return objs.length ? [{ kind: 'upsertMany', coll: pv.coll, key: pv.key.length === 1 ? pv.key[0] : pv.key, objs }] : [];
}

/** Modello CSV di un tipo: intestazioni italiane e, se l'archivio ne ha, due righe d'esempio dai suoi dati. */
export function template(d, typeId) {
  const T = TYPES[typeId], fields = FIELDS[T.coll];
  const head = fields.map(f => f.label);
  const sample = (d[T.coll] || []).slice(0, 2).map(r => fields.map(f => {
    const v = r[f.key];
    if (v == null) return '';
    if (f.type === 'ref') { const x = (d[f.ref] || []).find(y => y.id === v); return x?.code || x?.number || x?.name || v; }
    if (f.type === 'number') return String(v).replace('.', ',');
    if (f.type === 'date') return String(v).split('-').reverse().join('/');
    return String(v);
  }));
  return [head, ...sample];
}
