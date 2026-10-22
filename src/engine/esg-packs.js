/* FeedOS 18 · Pacchetti di contenuti ESG (fondazione 18): fattori, scadenze, tabelle di raccordo con «valido al».
 * Un pacchetto è { pack, version, validAsOf, items: [...] }. Quello integrato è un file di dati del pacchetto (src/data/pack-<pkg>.js);
 * un JSON più recente importato dall'utente sta in settings.esg18.packs[packId] e vince quando la sua versione è più alta.
 * Versioni a numeri separati da punti ('2026.4' < '2026.10'). Funzioni pure: nessuna eccezione, nessun messaggio in console. */
import { esgToday } from './esg-years.js';
import { addMonths } from '../core/util.js';

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const VERSION = /^\d+(\.\d+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PACK_ITEMS = 20000;

/** Confronto di versioni: < 0 se a è più vecchia di b, 0 se uguali, > 0 se più recente. Versioni non valide valgono meno di tutte. */
export function compareVersions(a, b) {
  const ok = v => typeof v === 'string' && VERSION.test(v);
  if (!ok(a) || !ok(b)) return ok(a) ? 1 : ok(b) ? -1 : 0;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

const imported = (d, packId) => { const p = d?.settings?.esg18?.packs?.[packId]; return isObj(p) && Array.isArray(p.items) ? p : null; };

/** Pacchetto in uso: il più recente tra integrato e importato, con origin 'integrato' | 'importato' (null se nessuno dei due). */
export function activePack(d, packId, builtin) {
  const b = isObj(builtin) && Array.isArray(builtin.items) ? builtin : null;
  const i = imported(d, packId);
  if (i && (!b || compareVersions(i.version, b.version) > 0)) return { ...i, pack: packId, origin: 'importato' };
  return b ? { ...b, origin: 'integrato' } : null;
}

/** Voci del pacchetto in uso (il più recente tra integrato e settings.esg18.packs[packId]); [] se non ce n'è nessuno. */
export function packItems(d, packId, builtin) {
  const p = activePack(d, packId, builtin);
  return p && Array.isArray(p.items) ? p.items : [];
}

/**
 * Stato dei pacchetti: builtins = elenco di pacchetti integrati (o {packId: pacchetto}); più quelli solo importati.
 * → [{pack, version, validAsOf, origin, builtinVersion, importedVersion, items, stale}] (stale = valido al più di 6 mesi fa).
 */
export function packStatus(d, builtins = []) {
  const list = Array.isArray(builtins) ? builtins.filter(isObj) : isObj(builtins) ? Object.entries(builtins).map(([k, v]) => ({ pack: k, ...v })) : [];
  const ids = [...new Set([...list.map(p => p.pack), ...Object.keys(isObj(d?.settings?.esg18?.packs) ? d.settings.esg18.packs : {})])].filter(Boolean);
  const limit = addMonths(esgToday(d), -6);
  return ids.map(id => {
    const b = list.find(p => p.pack === id) || null, i = imported(d, id), a = activePack(d, id, b);
    return { pack: id, version: a?.version ?? null, validAsOf: a?.validAsOf ?? null, origin: a?.origin ?? null, builtinVersion: b?.version ?? null, importedVersion: i?.version ?? null,
      items: Array.isArray(a?.items) ? a.items.length : 0, stale: !!(a?.validAsOf && a.validAsOf < limit) };
  });
}

/** Controllo di un pacchetto (oggetto o testo JSON) → {ok, errors: [testo], pack}. */
export function validatePack(json) {
  let p = json;
  if (typeof json === 'string') { try { p = JSON.parse(json); } catch { return { ok: false, errors: ['Il file non è un JSON valido'], pack: null }; } }
  const errors = [];
  if (!isObj(p)) return { ok: false, errors: ['Il pacchetto deve essere un oggetto { pack, version, validAsOf, items }'], pack: null };
  if (typeof p.pack !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(p.pack)) errors.push('«pack»: identificativo mancante o non valido (lettere minuscole, cifre e trattini)');
  if (typeof p.version !== 'string' || !VERSION.test(p.version)) errors.push('«version»: serve un numero di versione come 2026.4');
  if (typeof p.validAsOf !== 'string' || !ISO.test(p.validAsOf)) errors.push('«validAsOf»: serve una data AAAA-MM-GG');
  if (!Array.isArray(p.items)) errors.push('«items»: serve un elenco');
  else {
    if (p.items.length > MAX_PACK_ITEMS) errors.push(`«items»: al massimo ${MAX_PACK_ITEMS} voci`);
    const seen = new Set();
    p.items.forEach((it, i) => {
      if (!isObj(it)) { errors.push(`voce ${i + 1}: non è un oggetto`); return; }
      if (it.id != null) { const k = String(it.id); if (seen.has(k)) errors.push(`voce ${i + 1}: id ripetuto «${k}»`); seen.add(k); }
    });
  }
  return { ok: !errors.length, errors: errors.slice(0, 20), pack: errors.length ? null : p };
}

/** Differenze per id tra le voci di due pacchetti: {added, removed, changed} (elenchi di id). */
export function packDiff(oldItems = [], newItems = []) {
  const key = (x, i) => (x && x.id != null ? String(x.id) : `#${i}`);
  const a = new Map(oldItems.map((x, i) => [key(x, i), x])), b = new Map(newItems.map((x, i) => [key(x, i), x]));
  const added = [], removed = [], changed = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(k); else if (JSON.stringify(a.get(k)) !== JSON.stringify(v)) changed.push(k); }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k);
  return { added, removed, changed };
}

/**
 * Importazione di un pacchetto più recente → {ok, errors, ops, pack, diff}. ops = [operazione 'settings'] da passare a
 * store.batch(ops, etichetta): scrive settings.esg18.packs[pack] senza toccare il resto. builtin (facoltativo) serve
 * solo per le differenze rispetto al pacchetto in uso. Un pacchetto non valido dà ops vuoto.
 */
export function applyPackOps(d, json, builtin = null) {
  const v = validatePack(json);
  if (!v.ok) return { ok: false, errors: v.errors, ops: [], pack: null, diff: null };
  const p = v.pack;
  const cur = activePack(d, p.pack, builtin);
  const diff = packDiff(cur?.items || [], p.items);
  const rec = { pack: p.pack, version: p.version, validAsOf: p.validAsOf, items: p.items, importedAt: esgToday(d), ...(typeof p.source === 'string' ? { source: p.source } : {}) };
  const op = { kind: 'settings', value: st => { const e = isObj(st?.esg18) ? st.esg18 : {}; const packs = isObj(e.packs) ? e.packs : {}; return { ...st, esg18: { ...e, packs: { ...packs, [p.pack]: rec } } }; } };
  return { ok: true, errors: [], ops: [op], pack: rec, diff };
}
