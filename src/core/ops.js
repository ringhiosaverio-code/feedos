/* FeedOS 17 · operazioni sull'archivio come funzioni pure: applicazione, annullamento, ripristino e blocco dei mesi chiusi.
 * Lo store le usa per la cronologia (annulla/ripeti); i test le usano senza browser.
 * Operazioni: add {coll, obj} · addMany {coll, objs} · update {coll, id, patch|fn} · upsertMany {coll, objs, key='id'}
 *   · remove {coll, id} · removeMany {coll, ids} · replace {coll, value} · settings|esg|survey {value|fn}. */
import { isClosedMonth } from './schema.js';
import { uid } from './util.js';

/** Raccolte soggette alla chiusura del mese, con il campo che ne dà la data. */
export const CLOSABLE = Object.freeze({ shipments: 'date', runs: 'date', fixedCosts: 'month', invoices: 'date', payments: 'date', adjustments: 'date' });
/** Campi che non si cambiano su un movimento di un mese chiuso. */
export const GUARDED_FIELDS = Object.freeze(['date', 'month', 'tonnes', 'price', 'amount', 'taxable', 'total', 'kwh', 'gplKg', 'hours']);
export const CLOSED_MSG = 'Il mese è chiuso: riaprilo da Direzione › Chiusura del mese';

const ROOT = { settings: 'settings', esg: 'esgManual', survey: 'survey' };
const newId = (coll, o) => o?.id || uid(coll.slice(0, 2));
// anche kind: un costo fisso di budget non può diventare consuntivo (o viceversa) in un mese chiuso
const changed = (a, b) => a?.kind !== b?.kind || GUARDED_FIELDS.some(k => a?.[k] !== b?.[k]);
/** Chiave di confronto per upsertMany: nome di campo, elenco di campi (chiave composta) o funzione. */
const keyFn = key => typeof key === 'function' ? key : Array.isArray(key) ? (o => key.every(k => o?.[k] != null && o[k] !== '') ? key.map(k => o[k]).join('|') : null) : (o => o?.[key]);
const hasKey = k => k != null && k !== '';

/** Vero se il record di una raccolta soggetta a chiusura cade in un mese chiuso.
 *  I costi fissi di budget sono un piano, non un movimento: restano modificabili (revisioni del budget dell'anno). */
export function inClosedMonth(d, coll, rec) {
  const f = CLOSABLE[coll];
  return !!(f && rec && !(coll === 'fixedCosts' && rec.kind === 'budget') && isClosedMonth(d, rec[f]));
}

/**
 * Applica le operazioni in sequenza, tutte o nessuna.
 * → {data, done, refused}: done è la cronologia per revertOp/reapplyOp; refused = {coll, id, month} se un'operazione
 * tocca un mese chiuso (senza force): in quel caso data è l'archivio di partenza e done è vuoto.
 */
export function applyOpsTo(d0, ops, { force = false } = {}) {
  let d = d0;
  const done = [];
  const refuse = (coll, rec) => ({ data: d0, done: [], refused: { coll, id: rec?.id ?? null, month: String(rec?.[CLOSABLE[coll]] ?? '').slice(0, 7) } });
  for (const op of ops || []) {
    if (!op) continue;
    const kind = op.kind;
    if (ROOT[kind]) {
      const root = ROOT[kind], before = d[root] || {};
      const after = typeof op.value === 'function' ? op.value(before) : { ...before, ...op.value };
      d = { ...d, [root]: after };
      done.push({ kind, before, after });
      continue;
    }
    const coll = op.coll;
    if (!coll) continue;
    const arr = d[coll] || [];
    const guard = !force && !!CLOSABLE[coll];
    const closed = rec => guard && inClosedMonth(d, coll, rec);
    if (kind === 'add') {
      const obj = { ...op.obj, id: newId(coll, op.obj) };
      if (closed(obj)) return refuse(coll, obj);
      d = { ...d, [coll]: [obj, ...arr] };
      done.push({ kind, coll, id: obj.id, after: obj });
    } else if (kind === 'addMany') {
      const objs = (op.objs || []).map(o => ({ ...o, id: newId(coll, o) }));
      if (!objs.length) continue;
      const bad = guard && objs.find(closed);
      if (bad) return refuse(coll, bad);
      d = { ...d, [coll]: [...objs, ...arr] };
      done.push({ kind, coll, id: objs[0].id, ids: objs.map(o => o.id), after: objs });
    } else if (kind === 'update') {
      const i = arr.findIndex(x => x.id === op.id);
      if (i < 0) continue;
      const before = arr[i];
      const after = typeof op.patch === 'function' ? op.patch(before) : { ...before, ...op.patch };
      if ((closed(before) || closed(after)) && changed(before, after)) return refuse(coll, before);
      const next = arr.slice(); next[i] = after;
      d = { ...d, [coll]: next };
      done.push({ kind, coll, id: op.id, before, after });
    } else if (kind === 'upsertMany') {
      // con la chiave esistente si fonde (l'id resta quello del record), altrimenti si aggiunge; una sola copia della raccolta
      const kf = keyFn(op.key ?? 'id');
      const next = arr.slice(), pos = new Map();
      next.forEach((x, i) => { const k = kf(x); if (hasKey(k) && !pos.has(k)) pos.set(k, i); });
      const updated = new Map(), added = [], addPos = new Map();
      for (const o of op.objs || []) {
        const k = kf(o);
        if (hasKey(k) && pos.has(k)) {
          const i = pos.get(k), cur = next[i];
          if (Object.keys(o).every(f => f === 'id' || cur[f] === o[f])) continue; // nessuna differenza
          const after = { ...cur, ...o, id: cur.id };
          if ((closed(cur) || closed(after)) && changed(cur, after)) return refuse(coll, cur);
          next[i] = after;
          const u = updated.get(cur.id);
          if (u) u.after = after; else updated.set(cur.id, { id: cur.id, before: cur, after });
        } else if (hasKey(k) && addPos.has(k)) {
          const j = addPos.get(k);
          added[j] = { ...added[j], ...o, id: added[j].id };
          if (closed(added[j])) return refuse(coll, added[j]);
        } else {
          const obj = { ...o, id: newId(coll, o) };
          if (closed(obj)) return refuse(coll, obj);
          if (hasKey(k)) addPos.set(k, added.length);
          added.push(obj);
        }
      }
      if (!added.length && !updated.size) continue;
      const upd = [...updated.values()];
      d = { ...d, [coll]: [...added, ...next] };
      done.push({ kind, coll, id: added[0]?.id ?? upd[0].id, added, updated: upd });
    } else if (kind === 'remove') {
      const i = arr.findIndex(x => x.id === op.id);
      if (i < 0) continue;
      const before = arr[i];
      if (closed(before)) return refuse(coll, before);
      d = { ...d, [coll]: arr.filter(x => x.id !== op.id) };
      done.push({ kind, coll, id: op.id, before, index: i });
    } else if (kind === 'removeMany') {
      const ids = new Set(op.ids || []), removed = [];
      arr.forEach((x, index) => { if (ids.has(x.id)) removed.push({ index, before: x }); });
      if (!removed.length) continue;
      const bad = guard && removed.find(r => closed(r.before));
      if (bad) return refuse(coll, bad.before);
      d = { ...d, [coll]: arr.filter(x => !ids.has(x.id)) };
      done.push({ kind, coll, id: removed[0].before.id, removed });
    } else if (kind === 'replace') {
      const value = op.value || [];
      if (guard) {
        // i record dei mesi chiusi devono restare identici nei campi protetti
        const prev = new Map(arr.filter(closed).map(x => [x.id, x]));
        const bad = value.find(x => { if (!closed(x)) return false; const p = prev.get(x.id); prev.delete(x.id); return !p || changed(p, x); });
        if (bad || prev.size) return refuse(coll, bad || prev.values().next().value);
      }
      d = { ...d, [coll]: value };
      done.push({ kind, coll, before: arr, after: value });
    }
  }
  return { data: d, done, refused: null };
}

// impostazioni, ESG e questionario: si ripristinano solo le chiavi cambiate (le scritture silenziose intermedie restano)
function swapKeys(cur, from, to) {
  const out = { ...(cur || {}) };
  for (const k of new Set([...Object.keys(from || {}), ...Object.keys(to || {})])) {
    if (from?.[k] === to?.[k]) continue;
    if (to && k in to) out[k] = to[k]; else delete out[k];
  }
  return out;
}

/** Annulla un passo registrato da applyOpsTo. */
export function revertOp(d, op) {
  if (ROOT[op.kind]) return { ...d, [ROOT[op.kind]]: swapKeys(d[ROOT[op.kind]], op.after, op.before) };
  const c = op.coll, arr = d[c] || [];
  switch (op.kind) {
    case 'add': return { ...d, [c]: arr.filter(x => x.id !== op.id) };
    case 'addMany': { const ids = new Set(op.ids); return { ...d, [c]: arr.filter(x => !ids.has(x.id)) }; }
    case 'update': return { ...d, [c]: arr.map(x => x.id === op.id ? op.before : x) };
    case 'upsertMany': {
      const ids = new Set(op.added.map(x => x.id)), back = new Map(op.updated.map(u => [u.id, u.before]));
      return { ...d, [c]: arr.filter(x => !ids.has(x.id)).map(x => back.get(x.id) ?? x) };
    }
    case 'remove': { const next = arr.slice(); next.splice(Math.min(op.index, next.length), 0, op.before); return { ...d, [c]: next }; }
    case 'removeMany': { const next = arr.slice(); for (const r of op.removed) next.splice(Math.min(r.index, next.length), 0, r.before); return { ...d, [c]: next }; }
    case 'replace': return { ...d, [c]: op.before };
    default: return d;
  }
}

/** Ripete un passo annullato. */
export function reapplyOp(d, op) {
  if (ROOT[op.kind]) return { ...d, [ROOT[op.kind]]: swapKeys(d[ROOT[op.kind]], op.before, op.after) };
  const c = op.coll, arr = d[c] || [];
  switch (op.kind) {
    case 'add': return { ...d, [c]: [op.after, ...arr] };
    case 'addMany': return { ...d, [c]: [...op.after, ...arr] };
    case 'update': return { ...d, [c]: arr.map(x => x.id === op.id ? op.after : x) };
    case 'upsertMany': { const fwd = new Map(op.updated.map(u => [u.id, u.after])); return { ...d, [c]: [...op.added, ...arr.map(x => fwd.get(x.id) ?? x)] }; }
    case 'remove': return { ...d, [c]: arr.filter(x => x.id !== op.id) };
    case 'removeMany': { const ids = new Set(op.removed.map(r => r.before.id)); return { ...d, [c]: arr.filter(x => !ids.has(x.id)) }; }
    case 'replace': return { ...d, [c]: op.after };
    default: return d;
  }
}
