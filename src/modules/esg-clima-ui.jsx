/* FeedOS 18 · ESG › Clima e GHG: piccoli elementi condivisi dalle sottosezioni (numeri, esportazioni, autore delle modifiche).
 * Prefisso CSS ecl-. Nessuno stato proprio. */
import React from 'react';
import { nf } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { getPrefs } from '../core/prefs.js';
import { ROLES } from '../core/roles.js';
import { Chip } from '../ui/ui.jsx';

/** Tonnellate di CO₂e leggibili: 1 decimale sotto 100, intere sopra. */
export const tco2 = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, Math.abs(v) < 100 ? 1 : 0));
export const pctTxt = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v * 100, d) + '%');
export const numTxt = (v, d) => (v == null || !Number.isFinite(+v) ? '—' : nf(v, d ?? (Math.abs(v) < 1 ? 4 : Math.abs(v) < 10 ? 3 : Math.abs(v) < 100 ? 2 : 0)));
/** Autore di una modifica: il ruolo scelto nella testata (FeedOS non ha utenti con password). */
export const authorNow = () => { const r = getPrefs().role; return ROLES.find(x => x.id === r)?.short || 'Direzione'; };
/** Scarica righe in CSV (separatore punto e virgola, virgola decimale). cols: [{key|value, label}] */
export function downloadCsv(name, rows, cols) { download(`feedos-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime) { download(`feedos-${name}-${stamp()}.${ext}`, text, mime); }

const SCOPE_KIND = { 1: 'accent', 2: 'violet', 3: 'maize' };
/** Etichetta dello scope. */
export function ScopeChip({ s }) { return <Chip kind={SCOPE_KIND[s] || 'outline'}>{`Scope ${s}`}</Chip>; }
const CAT_STATUS = { calcolata: 'good', stimata: 'warn', 'non-rilevante': 'outline', 'non-applicabile': 'outline', esclusa: 'outline' };
const CAT_LABEL = { calcolata: 'calcolata', stimata: 'stimata', 'non-rilevante': 'non rilevante', 'non-applicabile': 'non applicabile', esclusa: 'esclusa' };
/** Stato di una categoria dello Scope 3 nello screening. */
export function CatStatus({ s }) { return <Chip kind={CAT_STATUS[s] || 'outline'}>{CAT_LABEL[s] || s}</Chip>; }
const FG_STATUS = { scaduto: 'crit', 'in scadenza': 'warn', 'in regola': 'good', esente: 'outline', 'da programmare': 'warn', 'da verificare': 'warn' };
/** Stato di un controllo F-gas. */
export function FgasStatus({ s }) { return <Chip kind={FG_STATUS[s] || 'outline'}>{s}</Chip>; }
