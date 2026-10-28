/* Unità dei prezzi per edizione. I motori lavorano sempre in € per tonnellata di massa (i liquidi si convertono con la
 * densità); l'interfaccia mostra e fa inserire i prezzi nell'unità del settore:
 * - FeedOS (mangimi): € per tonnellata, come oggi;
 * - DifesaOS (agrofarmaci): € per kg o per litro secondo l'unità di vendita del prodotto, e i valori medi per massa in €/kg.
 * Le funzioni pm* trattano i valori medi per massa, le funzioni up* i prezzi di un prodotto. */
import { META } from '../editions/meta.js';
import { nf } from './util.js';

export const SMALL_UNITS = META.priceUnit === 'unit';
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/** Valori medi per massa (margine medio, prezzo medio): «€/t» oppure «€/kg». */
export const PM_LABEL = SMALL_UNITS ? '€/kg' : '€/t';
export const pm = v => (num(v) == null ? null : SMALL_UNITS ? +v / 1000 : +v);
export const pmDec = d => (SMALL_UNITS ? Math.max(2, d) : d);
export const fmtPm = (v, d = 1) => (num(v) == null ? '—' : `${nf(pm(v), pmDec(d))} ${PM_LABEL}`);
/** Numero senza unità (per le celle con l'unità nell'intestazione). */
export const nfPm = (v, d = 1) => (num(v) == null ? '—' : nf(pm(v), pmDec(d)));
/** Valore per massa inserito dall'utente (€/t o €/kg) → € per tonnellata. */
export const pmIn = v => (num(v) == null ? null : SMALL_UNITS ? +v * 1000 : +v);
/** Intestazione di una colonna di valori per massa. */
export const colPm = label => `${label} ${PM_LABEL}`;

/** Unità di vendita di un prodotto: 't' (mangimi), 'kg' o 'L' (agrofarmaci). */
export const unitOf = p => (SMALL_UNITS ? (p?.uom === 'L' ? 'L' : 'kg') : 't');
export const upLabel = p => `€/${unitOf(p)}`;
/** € per tonnellata → € per unità di vendita del prodotto. */
export function up(v, p) {
  if (num(v) == null) return null;
  if (!SMALL_UNITS) return +v;
  return p?.uom === 'L' ? (+v * (+p.density || 1)) / 1000 : +v / 1000;
}
/** € per unità di vendita del prodotto → € per tonnellata (per salvare quello che si inserisce). */
export function upIn(v, p) {
  if (num(v) == null) return null;
  if (!SMALL_UNITS) return +v;
  return p?.uom === 'L' ? (+v * 1000) / (+p.density || 1) : +v * 1000;
}
export const upDec = (d = 0) => (SMALL_UNITS ? 2 : d);
/** Prezzo di un prodotto con la sua unità: «343 €/t» oppure «9,40 €/kg». */
export const fmtUp = (v, p, d = 0) => (num(v) == null ? '—' : `${nf(up(v, p), upDec(d))} ${upLabel(p)}`);
/** Prezzo senza unità nell'edizione a tonnellate, con l'unità in quella a kg o L (le colonne mescolano prodotti in kg e in L). */
export const cellUp = (v, p, d = 0) => (num(v) == null ? '—' : SMALL_UNITS ? fmtUp(v, p, d) : nf(v, d));
/** Intestazione di una colonna di prezzi di prodotti diversi. */
export const colUp = label => (SMALL_UNITS ? label : `${label} €/t`);
/** Passo dell'inserimento: 5 €/t, 0,05 € per kg o L. */
export const upStep = SMALL_UNITS ? 0.05 : 5;
