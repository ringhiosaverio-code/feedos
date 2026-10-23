/* FeedOS 18 · Report e questionari (pacchetto WP4): raccolta dei datapoint e delle scadenze di tutti i pacchetti dentro il motore.
 * I motori dei pacchetti non importano il registro (esg-registry.js importa loro: il contrario lo romperebbe al caricamento),
 * quindi il report chiama direttamente i fornitori esportati dai pacchetti, nello stesso ordine e con le stesse regole di
 * collectDatapoints / collectCalendar: un fornitore che si interrompe finisce in errors, a parità di id vince il primo,
 * qualità sconosciuta → 'mancante'. Un test confronta il risultato con quello del registro.
 * Memoria per archivio (WeakMap sull'oggetto d, immutabile) e periodo: segnali, KPI, regole e pagina leggono lo stesso calcolo. */
import { climaDatapoints, climaCalendarItems } from './esg-clima.js';
import { pcfDatapoints, pcfCalendarItems } from './esg-pcf.js';
import { filieraDatapoints, filieraCalendarItems } from './esg-filiera.js';
import { personeDatapoints, personeCalendarItems } from './esg-persone.js';
import { governanceDatapoints, governanceCalendarItems } from './esg-governance.js';
import { pianoDatapoints, pianoCalendarItems } from './esg-piano.js';
import { rischiDatapoints, rischiCalendarItems } from './esg-rischi.js';
import { ambienteDatapoints, ambienteCalendarItems } from './esg-ambiente.js';
import { ownDatapoints, QUALITIES } from './esg-report-own.js';

/** Ordine dei pacchetti del registro (07-contract §1). */
export const PKG_ORDER = ['clima', 'pcf', 'filiera', 'report', 'persone', 'governance', 'piano', 'rischi', 'ambiente'];
const DP_FNS = [climaDatapoints, pcfDatapoints, filieraDatapoints, ownDatapoints, personeDatapoints, governanceDatapoints, pianoDatapoints, rischiDatapoints, ambienteDatapoints];
const CAL_FNS = [climaCalendarItems, pcfCalendarItems, filieraCalendarItems, null, personeCalendarItems, governanceCalendarItems, pianoCalendarItems, rischiCalendarItems, ambienteCalendarItems];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const errText = e => String(e?.message || e || 'errore');

const CACHE = new WeakMap();
/** Memoria per archivio: fn() si calcola una volta per (d, chiave). Al massimo 48 voci per archivio. */
export function memo(d, key, fn) {
  if (!d || typeof d !== 'object') return fn();
  let m = CACHE.get(d);
  if (!m) { m = new Map(); CACHE.set(d, m); }
  if (m.has(key)) return m.get(key);
  const v = fn();
  if (m.size >= 48) m.delete(m.keys().next().value);
  m.set(key, v);
  return v;
}

/** Datapoint di tutti i pacchetti per il periodo P: stessa forma di collectDatapoints → {datapoints, errors, duplicates}. */
export function collectAll(d, P, fns = DP_FNS) {
  const run = () => {
    const datapoints = {}, errors = [], duplicates = [];
    if (!P?.from || !P?.to) return { datapoints, errors, duplicates };
    fns.forEach((fn, i) => {
      const pkg = PKG_ORDER[i] || 'esg';
      let out;
      try { out = fn(d, P); } catch (e) { errors.push({ pkg, fn: fn?.name || '', error: errText(e) }); return; }
      if (out == null) return;
      if (!isObj(out)) { errors.push({ pkg, fn: fn?.name || '', error: 'risultato non valido (serve un oggetto {dpId: datapoint})' }); return; }
      for (const [id, dp] of Object.entries(out)) {
        if (!isObj(dp)) { errors.push({ pkg, fn: fn?.name || '', error: `datapoint ${id} non valido` }); continue; }
        if (datapoints[id]) { duplicates.push({ dpId: id, pkg, kept: datapoints[id].pkg }); continue; }
        datapoints[id] = { ...dp, quality: QUALITIES.includes(dp.quality) ? dp.quality : 'mancante', source: typeof dp.source === 'string' && dp.source ? dp.source : `${pkg}.${fn?.name || 'datapoint'}`, pkg };
      }
    });
    return { datapoints, errors, duplicates };
  };
  return fns === DP_FNS ? memo(d, `dp|${P?.from}|${P?.to}|${P?.key || ''}`, run) : run();
}

/** Scadenze di tutti i pacchetti (own = scadenze del report, calcolate da chi chiama): ordinate per data, senza chiavi ripetute. */
export function calendarAll(d, today, own = []) {
  return memo(d, `cal|${today}|${own.length}`, () => {
    const items = [], keys = new Set();
    CAL_FNS.forEach((fn, i) => {
      const pkg = PKG_ORDER[i];
      let out;
      if (fn) { try { out = fn(d, today); } catch { return; } } else out = own;
      if (!Array.isArray(out)) return;
      for (const it of out) {
        if (!isObj(it) || typeof it.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(it.date)) continue;
        const key = typeof it.key === 'string' && it.key ? it.key : `${pkg}:${it.date}:${items.length}`;
        if (keys.has(key)) continue;
        keys.add(key);
        items.push({ area: 'esg', pkg, ...it, key });
      }
    });
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  });
}
