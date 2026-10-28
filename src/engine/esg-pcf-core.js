/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): nucleo di calcolo. Registro dei fattori delle materie prime e ordine di
 * risoluzione, energia di stabilimento per linea (pellet e farina), imballaggi per articolo, impronta del prodotto per formula,
 * versione e lotto, dichiarazione annuale per cliente, fotografie pubblicate e allarmi di ricalcolo, circolarità.
 * Unità: fattori delle materie prime in kg CO₂e per t di materia prima; impronte in kg CO₂e per t di prodotto al cancello;
 * occupazione di suolo in m²·anno per t. Funzioni pure: nessun orologio (oggi da esgToday), nessuna eccezione su archivi vuoti,
 * nessun messaggio in console. Non importa i registri (kpis, dataquality, providers, signals, report, esg-registry, derived, store).
 * Due edizioni: il registro dei fattori, l'impronta e gli imballaggi funzionano per ogni settore (sectorOf); i valori di
 * letteratura del pacchetto (soia, cereali, coprodotti…), il pellet e la circolarità delle proteine sono specifici dei mangimi. */
import { sum, byId, addDays, round, norm, slug } from '../core/util.js';
import { esgSettings, esgToday, sectorOf, periodByKey, currentPeriod } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { factor as climaFactor, gridFactorInUse, gplFactorInUse, flagDefaults } from './esg-clima-factors.js';
import { DEFAULTS as ENERGY_DEFAULTS, scope1PerKg, balance, aggregate } from './energy.js';
import { sha256HexSync, canonicalJson } from '../core/hash.js';
import { pcfMonteCarlo, spreadByDqr } from './esg-pcf-mc.js';
import { PACK_PCF, CO_CLASSES, MODES } from '../data/pack-pcf.js';
import { META } from '../editions/meta.js';

export const EMPTY = Object.freeze([]);
export const A = x => (Array.isArray(x) ? x : EMPTY);
export const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const has = v => v != null && String(v).trim() !== '';
export const fin = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
export const num = v => (fin(v) ? +v : null);
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const inP = (x, P) => typeof x === 'string' && x.slice(0, 10) >= P.from && x.slice(0, 10) <= P.to;
export const LINK = id => ({ area: 'esg', tab: 'passaporto', ...(id ? { id } : {}) });
/** La scheda «Impronta mangimi» esiste in questa edizione? (DifesaOS la nasconde: niente segnali, sezioni o scadenze che vi portano). */
export const PCF_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('passaporto'));

/* memoria per identità degli argomenti: pagina, segnali, KPI e report chiedono gli stessi conti molte volte */
const CACHE = new Map();
export function cached(name, deps, fn, max = 3) {
  let list = CACHE.get(name);
  if (!list) CACHE.set(name, (list = []));
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/* ---------------- impostazioni e pacchetto ---------------- */
export const PCF_DEFAULTS = Object.freeze({
  method: 'PEFCR Feed · stima interna', boundary: 'culla-cancello', elModel: 'rete-LB-meno-FV', mcN: 2000, seed: 18, includeOutbound: false,
  hepScenario: 'med', lossDefault: 0.5, commonKwhT: null, recalcOriginPp: 10, recalcEnergyPct: 10, validityMonths: 12, sent: [],
});
/** Impostazioni del pacchetto: settings.esg18.pcf fuse con i valori di base. */
export function pcfSettings(d) {
  const s = esgSettings(d, 'pcf', PCF_DEFAULTS);
  return { ...s, mcN: Math.max(100, Math.min(2000, Math.round(num(s.mcN) ?? 2000))), lossDefault: num(s.lossDefault) ?? 0.5, sent: A(s.sent) };
}
export const BOUNDARY_LABEL = { 'culla-cancello': 'dalla culla al cancello del mangimificio', 'culla-cliente': 'dalla culla alla consegna al cliente' };
export const EL_MODEL_LABEL = { 'rete-LB-meno-FV': 'rete (location-based) sulla quota non coperta dal fotovoltaico', 'rete-LB': 'rete (location-based) su tutta l’elettricità' };
export const HEP_LABEL = { low: 'basso', med: 'medio', high: 'alto' };
/** Pacchetto di contenuti in uso: il più recente tra integrato e importato (settings.esg18.packs.pcf). */
export function pcfPack(d) { return activePack(d, 'pcf', PACK_PCF) || { ...PACK_PCF, origin: 'integrato' }; }
function packIndex(d) {
  return cached('pack', [d?.settings?.esg18?.packs?.pcf], () => {
    const p = pcfPack(d);
    const items = A(p.items).filter(isObj);
    const byKind = {};
    for (const it of items) (byKind[it.kind] ||= []).push(it);
    const materie = A(byKind.materia).map(it => ({ ...it, pos: A(it.match).filter(x => !String(x).startsWith('!')).map(x => safeRe(x)), neg: A(it.match).filter(x => String(x).startsWith('!')).map(x => safeRe(String(x).slice(1))) }));
    const conf = A(byKind.confezione).map(it => ({ ...it, re: A(it.match).map(safeRe) }));
    return { pack: p, byKind, materie, conf, version: p.version, validAsOf: p.validAsOf, origin: p.origin || 'integrato' };
  }, 2);
}
const safeRe = s => { try { return new RegExp(String(s), 'i'); } catch { return /$^/; } };
export const packList = (d, kind) => A(packIndex(d).byKind[kind]);
export const packInfo = d => { const x = packIndex(d); return { version: x.version, validAsOf: x.validAsOf, origin: x.origin, builtinVersion: PACK_PCF.version }; };

/* ---------------- origini ---------------- */
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
/** Chiave d'origine: codice ISO a due lettere, 'UE', 'EXTRA' o '*'; dai testi dell'anagrafica (Italia, UE, Extra-UE). */
export function originKey(x) {
  if (!has(x)) return null;
  const s = String(x).trim(), n = norm(s);
  if (s === '*') return '*';
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase() === 'EU' ? 'UE' : s.toUpperCase();
  if (n === 'italia' || n === 'italy' || n === 'nazionale') return 'IT';
  if (/extra/.test(n)) return 'EXTRA';
  if (n === 'ue' || n === 'eu' || n.startsWith('unione europea') || n === 'europa') return 'UE';
  return s.toUpperCase().slice(0, 12);
}
/** Classe di un'origine per il trasporto: 'IT' | 'UE' | 'EXTRA' | null. */
export const originClass = o => (!o || o === '*' ? null : o === 'IT' ? 'IT' : o === 'UE' || EU.has(o) ? 'UE' : 'EXTRA');
const ORIGIN_TXT = { IT: 'Italia', UE: 'UE', EXTRA: 'extra-UE', '*': 'qualsiasi origine' };
export const originLabel = o => ORIGIN_TXT[o] || o || '—';

/* ---------------- registro dei fattori ---------------- */
function regIndex(d) {
  return cached('reg', [d?.efIngredients, d?.supplierPcfs, d?.ingredients, d?.ingLots, d?.settings?.esg18?.packs?.pcf, sectorOf(d)], () => {
    const ings = new Map(A(d?.ingredients).filter(i => i && has(i.id)).map(i => [i.id, i]));
    const rows = new Map(), sup = new Map();
    for (const r of A(d?.efIngredients)) if (r && has(r.ingId) && fin(r.total)) (rows.get(r.ingId) || rows.set(r.ingId, []).get(r.ingId)).push(r);
    for (const r of A(d?.supplierPcfs)) if (r && has(r.ingId) && fin(r.pcfExcl) && r.status !== 'respinto') (sup.get(r.ingId) || sup.set(r.ingId, []).get(r.ingId)).push(r);
    for (const l of sup.values()) l.sort((a, b) => String(b.periodStart || '').localeCompare(String(a.periodStart || '')));
    return { ings, rows, sup, feed: sectorOf(d) === 'mangimi', fam: new Map(), mainSup: null };
  }, 2);
}
/** Famiglia del pacchetto di letteratura di una materia prima (solo mangimi): voce della prima famiglia che corrisponde al nome. */
export function familyOf(d, ingOrId) {
  const ix = regIndex(d);
  const ing = typeof ingOrId === 'string' ? ix.ings.get(ingOrId) : ingOrId;
  if (!ing || !ix.feed) return null;
  if (ix.fam.has(ing.id)) return ix.fam.get(ing.id);
  const txt = norm(`${ing.name || ''} ${ing.label || ''}`);
  const hit = packIndex(d).materie.find(it => it.pos.length && it.pos.every(r => r.test(txt)) && !it.neg.some(r => r.test(txt)));
  const f = hit ? hit.family || hit.id : null;
  ix.fam.set(ing.id, f);
  return f;
}
/** Voci di letteratura della famiglia di una materia prima (per l'origine scelta si usa la stessa regola del registro). */
export function packRowsFor(d, ing) {
  const f = familyOf(d, ing);
  return f ? packIndex(d).materie.filter(it => (it.family || it.id) === f) : [];
}

/** Fornitore principale di ogni materia prima negli ultimi 365 giorni (quota delle tonnellate ricevute). */
function mainSuppliers(d) {
  return cached('mainsup', [d?.ingLots, d?.suppliers], () => {
    const today = esgToday(d), from = addDays(today, -365);
    const acc = new Map();
    for (const l of A(d?.ingLots)) {
      if (!l || !has(l.ingId) || !fin(l.tonnes) || String(l.date || '') < from || l.status === 'bloccato') continue;
      const k = l.supplierId || l.supplier || '';
      const m = acc.get(l.ingId) || acc.set(l.ingId, new Map()).get(l.ingId);
      m.set(k, (m.get(k) || 0) + +l.tonnes);
    }
    const out = new Map();
    for (const [ingId, m] of acc) { const tot = sum([...m.values()]); out.set(ingId, new Map([...m].map(([k, v]) => [k, tot ? v / tot : 0]))); }
    for (const s of A(d?.suppliers)) for (const id of A(s?.ingIds)) if (!out.has(id)) out.set(id, new Map([[s.id, 1 / Math.max(1, A(d.suppliers).filter(x => A(x?.ingIds).includes(id)).length)]]));
    return out;
  }, 2);
}

function supplierPcfFor(d, ix, ingId, supplierId, date) {
  const list = ix.sup.get(ingId);
  if (!list || !list.length) return null;
  const ok = list.filter(r => (!has(r.periodStart) || String(r.periodStart) <= date) && (!has(r.periodEnd) || String(r.periodEnd) >= date));
  if (!ok.length) return null;
  if (has(supplierId)) return ok.find(r => !has(r.supplierId) || r.supplierId === supplierId) || null;
  // senza fornitore indicato (impronta da formula): vale se il fornitore che l'ha dichiarata copre almeno metà degli arrivi
  const share = mainSuppliers(d).get(ingId);
  return ok.find(r => !has(r.supplierId) || (share?.get(r.supplierId) ?? 0) >= 0.5) || null;
}

function pickRow(rows, o, scheme, coc, ingOrigin) {
  if (!rows || !rows.length) return null;
  const sc = has(scheme) && scheme !== 'nessuno' ? scheme : null, cc = has(coc) && coc !== 'nessuno' ? coc : null;
  const byO = k => rows.filter(r => originKey(r.origin) === k);
  const plain = list => list.find(r => !has(r.scheme) || r.scheme === 'nessuno') || null;
  const exact = list => (sc ? list.find(r => r.scheme === sc && (!cc || !has(r.coc) || r.coc === cc)) : null);
  const chainOf = x => { if (!x || x === '*') return []; const c = originClass(x); return c === 'IT' ? ['IT', 'UE'] : c && c !== x ? [x, c] : [x]; };
  for (const k of chainOf(o)) {
    const list = byO(k);
    if (!list.length) continue;
    const ex = exact(list); if (ex) return { row: ex, step: 2 };
    const p = plain(list); if (p) return { row: p, step: 3 };
  }
  if (sc) { const ex = exact(rows.filter(r => !o || originKey(r.origin) === '*')); if (ex) return { row: ex, step: 2 }; }
  const star = plain(byO('*')) || (o ? null : byO('*')[0]);
  if (star) return { row: star, step: 4 };
  if (!o) for (const k of chainOf(originKey(ingOrigin))) { const p = plain(byO(k)) || byO(k)[0]; if (p) return { row: p, step: 4 }; }
  return null;
}

const LOT_IX = d => cached('eulots', [d?.eudrLots, d?.ingLots], () => ({
  eu: new Map(A(d?.eudrLots).filter(e => e && has(e.ingLotId)).map(e => [e.ingLotId, e])),
  il: new Map(A(d?.ingLots).filter(l => l && has(l.id)).map(l => [l.id, l])),
}), 2);
/** Origine, schema e catena di custodia di un lotto di arrivo (registro EUDR del pacchetto filiera, altrimenti l'anagrafica). */
export function lotOrigin(d, ingLotId) {
  const { eu, il } = LOT_IX(d);
  const e = eu.get(ingLotId), l = il.get(ingLotId);
  return { origin: originKey(e?.country) || null, scheme: has(e?.scheme) && e.scheme !== 'nessuno' ? e.scheme : null, coc: has(e?.coc) && e.coc !== 'nessuno' ? e.coc : null,
    supplierId: l?.supplierId || e?.supplierId || null, date: l?.date || null, ingId: l?.ingId || e?.ingId || null };
}

const nullComps = { fossil: null, biogenic: null, luc: null, landMgmt: null, landM2a: null };
function comps(r) {
  const total = +r.total, luc = num(r.luc), lm = num(r.landMgmt);
  const fossil = num(r.fossil) ?? (luc != null || lm != null ? Math.max(0, total - (luc || 0) - (lm || 0) - (num(r.biogenic) || 0)) : null);
  return { fossil, biogenic: num(r.biogenic), luc, landMgmt: lm, landM2a: num(r.landM2a) };
}

/**
 * Fattore di emissione di una materia prima in kg CO₂e per t (contratto §4). Ordine di risoluzione:
 * 1 impronta dichiarata dal fornitore (supplierPcfs) valida alla data (del fornitore indicato; senza fornitore, di quello che copre
 *   almeno metà degli arrivi) · 2 registro (efIngredients) per origine + schema + catena di custodia · 3 registro per origine (poi per
 *   UE / extra-UE) · 4 riga generica (origine '*') · 5 valore dell'anagrafica (ingredients.ef) · 6 valore di letteratura del pacchetto
 *   (solo mangimi, abbinato per nome, se l'anagrafica non ha il fattore).
 * opts: {origin, scheme, coc, supplierId, date, ingLotId, fromLot, components}. Con fromLot: true l'origine, lo schema e la catena di
 * custodia si leggono dal lotto di arrivo (ingLotId). Le componenti (fossile, LUC, gestione del suolo, suolo) si restituiscono con
 * components: true; senza, restano null come nello stub della fondazione, così chi chiama riceve gli stessi totali di prima.
 * → {total, fossil, biogenic, luc, landMgmt, landM2a, dqr (1 ottimo … 5 scarso), source: 'fornitore'|'registro'|'anagrafica'|'letteratura'|'mancante',
 *    step, rowId, db, dbVersion, year, low, high, origin, scheme, coc, includesTransportTo, status, ref, note, supplierPcfId}
 */
export function ingredientEf(d, ingId, opts = {}) {
  const o = isObj(opts) ? opts : {};
  const ix = regIndex(d);
  const ing = ix.ings.get(ingId) || null;
  let origin = originKey(o.origin), scheme = o.scheme || null, coc = o.coc || null, supplierId = o.supplierId || null, date = ISO.test(String(o.date || '').slice(0, 10)) ? String(o.date).slice(0, 10) : null;
  if (o.fromLot && has(o.ingLotId)) {
    const lo = lotOrigin(d, o.ingLotId);
    origin = origin || lo.origin; scheme = scheme || lo.scheme; coc = coc || lo.coc; supplierId = supplierId || lo.supplierId; date = date || lo.date;
  }
  date = date || esgToday(d);
  const withComps = o.components === true;
  const base = { origin: origin || null, scheme, coc, supplierPcfId: null, rowId: null, db: null, dbVersion: null, year: null, low: null, high: null, includesTransportTo: null, status: null, ref: null, note: null, allocation: null };
  // 1 impronta del fornitore
  const sp = supplierPcfFor(d, ix, ingId, supplierId, date);
  if (sp) {
    const c = withComps ? { fossil: num(sp.fossil), biogenic: null, luc: num(sp.luc), landMgmt: num(sp.landMgmt), landM2a: null } : nullComps;
    if (withComps && c.fossil == null && (c.luc != null || c.landMgmt != null)) c.fossil = Math.max(0, +sp.pcfExcl - (c.luc || 0) - (c.landMgmt || 0));
    return { ...base, total: +sp.pcfExcl, ...c, dqr: num(sp.dqi) ?? 2, source: 'fornitore', step: 1, supplierPcfId: sp.id, db: 'fornitore', dbVersion: sp.specVersion || null,
      year: has(sp.periodStart) ? +String(sp.periodStart).slice(0, 4) : null, low: +sp.pcfExcl * 0.9, high: +sp.pcfExcl * 1.1, includesTransportTo: sp.includesTransportTo || 'cancello-fornitore',
      status: sp.verified ? 'verificato' : 'dichiarato', ref: `Impronta dichiarata dal fornitore${sp.supplierName ? ' ' + sp.supplierName : ''}${has(sp.pfId) ? ` (id ${String(sp.pfId).slice(0, 8)}…)` : ''}`, primaryShare: num(sp.primaryDataShare) };
  }
  // 2-4 registro
  const pick = pickRow(ix.rows.get(ingId), origin, scheme, coc, ing?.origin);
  if (pick) {
    const r = pick.row;
    return { ...base, total: +r.total, ...(withComps ? comps(r) : nullComps), dqr: num(r.dqr) ?? 3, source: 'registro', step: pick.step, rowId: r.id, db: r.db || null, dbVersion: r.dbVersion || null,
      year: num(r.year), low: num(r.low), high: num(r.high), includesTransportTo: r.includesTransportTo || 'cancello-fornitore', status: r.status || (r.db === 'dimostrativo' ? 'dimostrativo' : 'da verificare'),
      ref: r.source || r.db || 'registro dei fattori', note: r.note || null, allocation: r.allocation || null, origin: originKey(r.origin) || origin, scheme: r.scheme || scheme, coc: r.coc || coc };
  }
  // 5 anagrafica
  if (ing && fin(ing.ef)) {
    return { ...base, total: +ing.ef, ...nullComps, dqr: 5, source: 'anagrafica', step: 5, includesTransportTo: 'mangimificio', status: 'da verificare', ref: 'Anagrafica delle materie prime (valore senza fonte)' };
  }
  // 6 letteratura del pacchetto (solo mangimi)
  if (ing) {
    const lit = pickRow(packRowsFor(d, ing), origin, scheme, coc, ing.origin);
    if (lit) {
      const r = lit.row;
      return { ...base, total: +r.total, ...(withComps ? comps(r) : nullComps), dqr: 4, source: 'letteratura', step: 6, rowId: r.id, db: r.db, dbVersion: r.dbVersion, year: num(r.year), low: num(r.low), high: num(r.high),
        includesTransportTo: r.includesTransportTo || 'cancello-fornitore', status: r.status || 'da verificare', ref: r.source, note: r.note || null, allocation: r.allocation || null, origin: originKey(r.origin) || origin };
    }
  }
  return { ...base, total: null, ...nullComps, dqr: 5, source: 'mancante', step: null };
}

/** Occupazione di suolo di una materia prima in m²·anno per t: dal registro, altrimenti la stima per categoria del pacchetto clima. */
export function landM2a(d, ingId, opts = {}) {
  const ef = ingredientEf(d, ingId, { ...opts, components: true });
  if (ef.landM2a != null) return { value: ef.landM2a, source: ef.ref || ef.source, quality: ef.source === 'fornitore' ? 'misurato' : 'stimato', estimated: false };
  const ing = regIndex(d).ings.get(ingId);
  const f = ing ? flagDefaults(d, ing).land : null;
  return f ? { value: f.value * 1000, source: f.source, quality: 'default', estimated: true } : { value: null, source: null, quality: 'mancante', estimated: true };
}

/* ---------------- imballaggi ---------------- */
const MAT_ALIAS = { carta: 'carta', paper: 'carta', pe: 'PE', polietilene: 'PE', 'film-ldpe': 'film-LDPE', film: 'film-LDPE', ldpe: 'film-LDPE', pp: 'PP', polipropilene: 'PP', legno: 'legno', wood: 'legno', 'pallet-riutilizzabile': 'pallet-riutilizzabile' };
const CLIMA_MAT = { carta: 'pk.carta', PE: 'pk.pe', 'film-LDPE': 'pk.pe' };
export const matKey = m => MAT_ALIAS[norm(String(m || '')).trim()] || (has(m) ? String(m) : null);
/** Fattore di un materiale d'imballaggio in kg CO₂e per kg, dal pacchetto integrato (contratto §4: senza archivio). null se ignoto. */
export function packagingFactor(material) {
  const k = matKey(material);
  const it = PACK_PCF.items.find(x => x.kind === 'materiale' && x.material === k);
  return it && fin(it.value) ? +it.value : null;
}
/** Fattore di un materiale con l'archivio: sostituzione o pacchetto clima (stesso numero della scheda Clima) > pacchetto pcf. */
export function materialFactor(d, material) {
  const k = matKey(material);
  const cid = CLIMA_MAT[k];
  const cf = cid ? climaFactor(d, cid) : null;
  if (cf && fin(cf.value)) return { value: cf.value, source: cf.source, status: cf.status, id: cf.id };
  const it = packList(d, 'materiale').find(x => x.material === k);
  return it && fin(it.value) ? { value: +it.value, source: it.source, status: it.status, id: it.id, low: num(it.low), high: num(it.high) } : null;
}
const isBagged = label => /sacc|big ?bag|bigbag/i.test(String(label || ''));
export const isBulk = label => /sfus|rinfus|cistern/i.test(String(label || ''));
/** Scheda d'imballaggio per tipo di confezione (packagingSpecs.packaging = product.packaging), o null. */
export function packagingSpecFor(d, label) {
  if (!has(label)) return null;
  const n = norm(label).trim();
  return A(d?.packagingSpecs).find(s => s && (norm(s.packaging || '').trim() === n || s.id === slug(label))) || null;
}
/**
 * Imballaggio di un prodotto per tonnellata: scheda del registro (packagingSpecs) o imballaggio di base del pacchetto per tipo di
 * confezione. → {packaging, spec, isDefault, bagged, bulk, unitsPerT, kgPerT, byMaterial {materiale: kg/t}, components, co2PerT,
 *   palletCo2PerT, recycledPct, recyclability, source}
 */
export function packagingFor(d, prodOrId) {
  const prod = typeof prodOrId === 'string' ? A(d?.products).find(p => p && p.id === prodOrId) : prodOrId;
  const label = prod?.packaging || '';
  const spec = packagingSpecFor(d, label);
  const def = spec ? null : packIndex(d).conf.find(c => c.re.some(r => r.test(label))) || null;
  const src = spec || def;
  const bulk = isBulk(label) || (src && (num(src.unitsPerT) ?? 0) === 0 && !A(src.components).length);
  if (!src) return { packaging: label, spec: null, isDefault: true, bagged: isBagged(label), bulk, unitsPerT: 0, kgPerT: 0, byMaterial: {}, components: [], co2PerT: 0, palletCo2PerT: 0, recycledPct: null, recyclability: null, source: 'nessuna scheda', missing: isBagged(label) };
  const units = num(src.unitsPerT) ?? 0;
  const byMaterial = {}, components = [];
  let kg = 0, co2 = 0, rec = 0;
  for (const c of A(src.components)) {
    const m = matKey(c?.material);
    const kgT = (num(c?.kgPerUnit) ?? 0) * units + (num(c?.kgPerT) ?? 0);
    if (!m || !(kgT > 0)) continue;
    const f = materialFactor(d, m);
    byMaterial[m] = (byMaterial[m] || 0) + kgT;
    kg += kgT; co2 += kgT * (f?.value ?? 0); rec += kgT * Math.max(0, Math.min(100, num(c.recycledPct) ?? 0)) / 100;
    components.push({ material: m, kgPerUnit: num(c.kgPerUnit), kgPerT: kgT, recycledPct: num(c.recycledPct), recyclability: c.recyclability || null, factor: f?.value ?? null, factorSource: f?.source || null, co2PerT: kgT * (f?.value ?? 0), supplierId: c.supplierId || null, docEvidenceId: c.docEvidenceId || null });
  }
  const pallets = num(src.palletsPerT) ?? (units > 0 ? 0.8 : 0);
  let pal = 0;
  if (pallets > 0) {
    if (src.palletReusable) pal = pallets * (materialFactor(d, 'pallet-riutilizzabile')?.value ?? 2);
    else { const pkg = num(src.palletKg) ?? 20; pal = pallets * pkg * (materialFactor(d, 'legno')?.value ?? 0.4); byMaterial.legno = (byMaterial.legno || 0) + pallets * pkg; kg += pallets * pkg; }
  }
  const grades = components.map(c => c.recyclability).filter(has).sort();
  return { packaging: label, spec: spec || null, specId: spec?.id || null, isDefault: !spec, bagged: isBagged(label), bulk, unitsPerT: units, kgPerT: kg, byMaterial, components, co2PerT: co2 + pal, palletCo2PerT: pal,
    palletsPerT: pallets, palletReusable: !!src.palletReusable, recycledPct: kg > 0 ? rec / kg * 100 : null, recyclability: grades.length ? grades[grades.length - 1] : null, conaiClass: src.conaiClass || null,
    source: spec ? 'Registro degli imballaggi' : src.source || src.label, missing: !spec && isBagged(label) };
}

/* ---------------- energia di stabilimento ---------------- */
function resolveP(d, x) {
  if (isObj(x) && has(x.from) && has(x.to)) return x;
  if (typeof x === 'string') return periodByKey(d, x) || currentPeriod(d);
  return currentPeriod(d);
}
/**
 * Energia del mangimificio nel periodo, per linea: elettricità e combustibile per t dai registri di produzione; quota comune
 * (ricevimento, macinazione, dosaggio e miscelazione: l'intensità della linea farina) e quota del pellet (vapore e pellettatrice)
 * solo per le linee pellet. Fattore dell'elettricità = (1 − quota fotovoltaica autoconsumata) × fattore di rete location-based.
 * → {period, efEl, efLB, pvShare, efFuel, grid, commonKwhT, commonFuelT, commonKgT, lines: {id: {…, pelletKgT, totalKgT}}, T, kwh, fuel, quality}
 */
export function millEnergy(d, Pin) {
  const P = resolveP(d, Pin);
  return cached('mill|' + P.from + '|' + P.to, [d?.runs, d?.lines, d?.energy, d?.settings, d?.factorOverrides], () => {
    const s = pcfSettings(d);
    const lines = A(d?.lines).filter(l => l && has(l.id));
    const acc = new Map(lines.map(l => [l.id, { id: l.id, name: l.name || l.id, kind: l.kind || 'pellet', t: 0, kwh: 0, fuel: 0, runs: 0 }]));
    for (const r of A(d?.runs)) {
      if (!r || !inP(r.date, P) || !fin(r.tonnes) || +r.tonnes <= 0) continue;
      const x = acc.get(r.lineId) || acc.set(r.lineId, { id: r.lineId, name: r.lineId, kind: 'pellet', t: 0, kwh: 0, fuel: 0, runs: 0 }).get(r.lineId);
      x.t += +r.tonnes; x.kwh += num(r.kwh) ?? 0; x.fuel += num(r.gplKg) ?? 0; x.runs++;
    }
    const L = [...acc.values()];
    const std = id => lines.find(l => l.id === id) || {};
    for (const x of L) { // senza produzione nel periodo: valori standard della linea
      x.measured = x.t > 0 && x.kwh > 0;
      x.kwhT = x.measured ? x.kwh / x.t : num(std(x.id).kwhPerT) ?? null;
      x.fuelT = x.measured ? x.fuel / x.t : num(std(x.id).gplKgPerT) ?? 0;
    }
    const mash = L.filter(x => x.kind !== 'pellet' && x.kwhT != null);
    const mashT = sum(mash, x => x.t || 1);
    const commonKwhT = num(s.commonKwhT) ?? (mash.length ? sum(mash, x => x.kwhT * (x.t || 1)) / mashT : 8);
    const commonFuelT = mash.length ? sum(mash, x => x.fuelT * (x.t || 1)) / mashT : 0;
    const grid = gridFactorInUse(d, P);
    const efLB = num(grid?.value) ?? num(d?.settings?.energy?.feGrid) ?? ENERGY_DEFAULTS.feGrid;
    const months = new Set(P.months || []);
    const recs = A(d?.energy).filter(e => e && (months.size ? months.has(String(e.month)) : inP(String(e.month) + '-15', P)));
    const bal = recs.length ? balance(aggregate(recs), ENERGY_DEFAULTS) : null;
    const pvShare = s.elModel === 'rete-LB' ? 0 : bal?.coverage ?? 0;
    const efEl = efLB * (1 - pvShare);
    const gpl = gplFactorInUse(d);
    const efFuel = scope1PerKg({ ...ENERGY_DEFAULTS, feGpl: num(gpl?.value) ?? num(d?.settings?.energy?.feGpl) ?? ENERGY_DEFAULTS.feGpl });
    const commonKgT = commonKwhT * efEl + commonFuelT * efFuel;
    const out = {};
    for (const x of L) {
      const pellet = x.kind === 'pellet';
      const pk = pellet ? Math.max(0, (x.kwhT ?? commonKwhT) - commonKwhT) : 0, pf = pellet ? Math.max(0, x.fuelT - commonFuelT) : 0;
      out[x.id] = { ...x, pellet, pelletKwhT: pk, steamFuelT: pf, pelletKgT: pk * efEl + pf * efFuel, commonKgT, totalKgT: commonKgT + pk * efEl + pf * efFuel };
    }
    const T = sum(L, x => x.t);
    return { period: { key: P.key || null, from: P.from, to: P.to, label: P.label || null }, efEl, efLB, pvShare, efFuel, grid: grid ? { id: grid.id, value: grid.value, source: grid.source, year: grid.year, label: grid.label } : null,
      gplFactor: gpl ? { id: gpl.id, value: gpl.value, source: gpl.source } : null, commonKwhT, commonFuelT, commonKgT, lines: out, T, kwh: sum(L, x => x.kwh), fuel: sum(L, x => x.fuel),
      quality: L.some(x => x.measured) ? 'misurato' : 'stimato', elModel: s.elModel };
  }, 4);
}
/** Energia di stabilimento di un prodotto (kg CO₂e/t): quota comune + quota del pellet delle linee dove è stato prodotto nel periodo. */
const prodLines = (d, P) => cached('plines|' + P.from + '|' + P.to, [d?.runs], () => {
  const m = new Map();
  for (const r of A(d?.runs)) {
    if (!r || !inP(r.date, P) || !fin(r.tonnes) || !has(r.productId)) continue;
    const x = m.get(r.productId) || m.set(r.productId, new Map()).get(r.productId);
    x.set(r.lineId, (x.get(r.lineId) || 0) + +r.tonnes);
  }
  return m;
}, 4);
export function productMill(d, prod, P, me = millEnergy(d, P)) {
  const byLine = new Map(prodLines(d, P).get(prod.id) || []);
  if (!byLine.size && has(prod.lineId)) byLine.set(prod.lineId, 1);
  const tot = sum([...byLine.values()]);
  let pellet = 0, kwhT = 0, fuelT = 0, pelletShare = 0;
  for (const [id, t] of byLine) {
    const l = me.lines[id]; if (!l) continue;
    const w = tot ? t / tot : 0;
    pellet += w * l.pelletKgT; kwhT += w * ((l.kwhT ?? me.commonKwhT)); fuelT += w * l.fuelT; if (l.pellet) pelletShare += w;
  }
  return { common: me.commonKgT, pellet, total: me.commonKgT + pellet, kwhT, fuelT, pelletShare, lines: [...byLine.keys()], measured: tot > 0 && [...byLine.keys()].some(id => me.lines[id]?.measured) };
}

/* ---------------- trasporto in ingresso e consegna ---------------- */
function modeFactor(d, mode) {
  const m = MODES[mode] || MODES.camion;
  const f = climaFactor(d, m.climaId);
  return fin(f?.value) ? +f.value : m.value;
}
/** Trasporto in ingresso per t di materia prima (kg CO₂e/t) dopo il punto incluso nel fattore. */
export function inboundPerT(d, ef, ing) {
  const incl = ef?.includesTransportTo || 'cancello-fornitore';
  if (incl === 'mangimificio') return { value: 0, legs: [], note: 'trasporto incluso nel fattore' };
  const o = originClass(originKey(ef?.origin && ef.origin !== '*' ? ef.origin : null) || originKey(ing?.origin)) || 'UE';
  const tr = packList(d, 'tratta');
  const t = o === 'EXTRA' ? tr.find(x => x.origin === 'EXTRA' && x.from === (incl === 'mercato-UE' ? 'mercato-UE' : 'cancello-fornitore')) : incl === 'mercato-UE' && o !== 'IT' ? tr.find(x => x.origin === 'IT') : tr.find(x => x.origin === o);
  if (!t) return { value: 0, legs: [], note: 'nessuna tratta di base' };
  const legs = A(t.legs).map(l => ({ mode: l.mode, km: +l.km || 0, factor: modeFactor(d, l.mode) }));
  return { value: sum(legs, l => l.km * l.factor), legs, note: t.label };
}
const R_EARTH = 6371;
const hav = (a, b) => { const r = x => (+x * Math.PI) / 180; const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h))); };
function plantPoint(d) {
  const c = d?.settings?.company, k = d?.settings?.esg18?.clima;
  if (fin(c?.lat) && fin(c?.lon)) return { lat: +c.lat, lon: +c.lon };
  if (fin(k?.plantLat) && fin(k?.plantLon)) return { lat: +k.plantLat, lon: +k.plantLon };
  return null;
}
/** Consegna al cliente (kg CO₂e/t): distanza media in linea d'aria × fattore stradale × fattore del camion; null senza coordinate. */
export function outboundPerT(d, prodId, P) {
  const pl = plantPoint(d);
  if (!pl) return null;
  const cust = byId(A(d?.customers).filter(c => c && has(c.id)));
  const rf = num(d?.settings?.logistics?.roadFactor) ?? 1.3;
  let t = 0, tkm = 0;
  for (const s of A(d?.shipments)) {
    if (!s || s.productId !== prodId || !inP(s.date, P) || !fin(s.tonnes)) continue;
    const c = cust[s.customerId];
    if (!c || !fin(c.lat) || !fin(c.lon)) continue;
    t += +s.tonnes; tkm += +s.tonnes * hav(pl, { lat: +c.lat, lon: +c.lon }) * rf;
  }
  return t > 0 ? { value: (tkm / t) * modeFactor(d, 'camion'), km: tkm / t } : null;
}

/* ---------------- circolarità ---------------- */
const CAT_CIRC = { cereale: 'cereale', coprodotto: 'residuo', proteico: 'leguminose', foraggio: 'foraggio', grasso: 'grasso', minerale: 'minerale-additivo', aminoacido: 'minerale-additivo', premix: 'minerale-additivo' };
/** Classe di circolarità e frazione edibile delle proteine (scenari) di una materia prima: ingCircular, poi pacchetto, poi categoria. */
export function circOf(d, ing) {
  const row = A(d?.ingCircular).find(r => r && r.id === ing?.id);
  const fam = familyOf(d, ing);
  const famItem = fam ? packIndex(d).materie.find(it => (it.family || it.id) === fam) : null;
  const key = famItem?.circ || CAT_CIRC[ing?.category] || 'cereale';
  const def = packList(d, 'circolarita').find(x => x.key === key) || { coClass: 'primario', hefLow: 0, hefMed: 0, hefHigh: 0 };
  const coClass = row?.coClass || (ing?.category === 'coprodotto' && def.coClass === 'primario' ? 'residuo' : def.coClass);
  return { coClass, hefLow: num(row?.hefLow) ?? def.hefLow, hefMed: num(row?.hefMed) ?? def.hefMed, hefHigh: num(row?.hefHigh) ?? def.hefHigh, source: row ? 'registro' : 'pacchetto' };
}

/* ---------------- impronta del prodotto ---------------- */
export function versionLines(f, version) {
  if (!f) return null;
  if (version == null || +version === +f.version) return A(f.lines);
  const h = A(f.history).find(x => x && +x.version === +version);
  return h ? A(h.lines) : null;
}
const isSoy = (d, ing) => { const f = familyOf(d, ing); return f ? f.startsWith('soia') && f !== 'soia-olio' : /soia|soy/i.test(`${ing?.name || ''}`) && !/olio|oil/i.test(`${ing?.name || ''}`); };
const DCF_COC = new Set(['segregato', 'IP']);
const isDcf = (ef, ing) => (ef?.source === 'fornitore' && ef.luc === 0) || (has(ef?.scheme) && DCF_COC.has(ef?.coc) && (ef.luc == null || ef.luc === 0)) || /senza deforest|deforestation.?free|dcf/i.test(`${ing?.certified || ''} ${ing?.name || ''}`);

/** Data dei fattori: oggi per l'esercizio in corso, la fine dell'esercizio per quelli chiusi. */
export function factorDate(d, P) {
  const today = esgToday(d), cur = currentPeriod(d);
  return !P || P.key === cur.key || P.to >= today ? today : P.to;
}

/**
 * Impronta di un prodotto (kg CO₂e per t al cancello) per una versione della formula (di base quella in vigore) o per un lotto
 * prodotto (composizione reale con origine dei lotti di arrivo), con l'energia del periodo ESG.
 * PCF = Σ x_i·EF_i (materie prime) + Σ x_i·loss·EF_i (perdite) + T_in + E_mill + imballaggio [+ consegna]
 * FLAG_LUC = Σ x_i(1+loss)·LUC_i · FLAG_LM = Σ x_i(1+loss)·LM_i · nonFLAG = PCF − LUC − LM · suolo = Σ x_i·m²a_i
 * opts: {P | periodKey, formulaVersion, lotId, date}. → oggetto con componenti, righe (riservate: non vanno ai clienti), quote, incertezza; null se manca la formula.
 */
export function pcf(d, productId, opts = {}) {
  if (!d || !isObj(d)) return null;
  const o = isObj(opts) ? opts : {};
  const prod = A(d.products).find(p => p && p.id === productId);
  if (!prod) return null;
  const P = resolveP(d, o.P || o.periodKey);
  const date = ISO.test(String(o.date || '')) ? o.date : factorDate(d, P);
  const lot = has(o.lotId) ? A(d.lots).find(l => l && l.id === o.lotId && l.productId === productId) : null;
  const run = lot ? A(d.runs).find(r => r && (r.id === lot.runId || r.lotId === lot.id)) : null;
  const f = A(d.formulas).find(x => x && x.id === (run?.formulaId || prod.formulaId));
  const version = fin(o.formulaVersion) ? +o.formulaVersion : fin(run?.formulaVersion) ? +run.formulaVersion : f ? +f.version || 0 : null;
  const light = o.light === true;
  const key = `pcf|${productId}|${version}|${P.from}|${P.to}|${date}|${lot ? lot.id : ''}${light ? '|L' : ''}`;
  return cached(key, [d.formulas, d.ingredients, d.efIngredients, d.supplierPcfs, d.ingCircular, d.packagingSpecs, d.products, d.runs, d.lines, d.energy, d.settings, d.factorOverrides, d.ingLots, d.eudrLots, d.lots, d.shipments], () => computePcf(d, prod, f, version, P, date, lot, light), 2);
}

function computePcf(d, prod, f, version, P, date, lot, light = false) {
  const s = pcfSettings(d);
  const ings = regIndex(d).ings;
  // righe: dalla composizione del lotto (con l'origine dei lotti di arrivo) o dalla formula
  let src = [];
  if (lot && A(lot.comp).length) {
    for (const c of lot.comp) {
      const lo = lotOrigin(d, c?.l);
      const ingId = c?.ing || lo.ingId;
      if (!has(ingId) || !fin(c?.kg)) continue;
      src.push({ ing: ingId, kg: +c.kg, ingLotId: c.l, origin: lo.origin, scheme: lo.scheme, coc: lo.coc, supplierId: lo.supplierId, date: lo.date || lot.date });
    }
  } else {
    const ls = versionLines(f, version);
    if (!ls) return null;
    src = ls.filter(l => l && has(l.ing) && fin(l.kg) && +l.kg > 0).map(l => ({ ing: l.ing, kg: +l.kg }));
  }
  const kgTot = sum(src, l => l.kg);
  if (!(kgTot > 0)) return null;
  const loss = Math.max(0, Math.min(10, num(prod.shrinkPct) ?? s.lossDefault)) / 100;
  const lines = [];
  let raw = 0, lossC = 0, tin = 0, luc = 0, lm = 0, fossilKnown = 0, land = 0, landEst = 0, compRaw = 0, supRaw = 0, missingKg = 0;
  let soyKg = 0, soyDcfKg = 0, cp = 0, hepL = 0, hepM = 0, hepH = 0;
  const co = Object.fromEntries(Object.keys(CO_CLASSES).map(k => [k, 0]));
  const mcIn = [];
  for (const l of src) {
    const ing = ings.get(l.ing) || { id: l.ing, name: l.ing };
    const x = (l.kg / kgTot) * 1000, t = x / 1000;
    const ef = ingredientEf(d, l.ing, { origin: l.origin, scheme: l.scheme, coc: l.coc, supplierId: l.supplierId, date: l.date || date, components: true });
    const total = ef.total;
    const e = total != null ? t * total : 0;
    const tr = total != null ? inboundPerT(d, ef, ing) : { value: 0, legs: [] };
    const eLoss = e * loss, eTin = t * tr.value * (1 + loss);
    raw += e; lossC += eLoss; tin += eTin;
    if (total == null) missingKg += x;
    const hasComp = ef.luc != null || ef.landMgmt != null;
    const lucI = hasComp ? t * (1 + loss) * (ef.luc || 0) : 0, lmI = hasComp ? t * (1 + loss) * (ef.landMgmt || 0) : 0;
    if (hasComp) { luc += lucI; lm += lmI; compRaw += e; if (ef.fossil != null) fossilKnown += t * (1 + loss) * ef.fossil; }
    if (ef.source === 'fornitore') supRaw += e + eLoss;
    let landI = 0, landE = false;
    if (ef.landM2a != null) landI = t * ef.landM2a;
    else { const lf = flagDefaults(d, ing).land; if (lf) { landI = t * lf.value * 1000; landE = true; } }
    land += landI; if (landE) landEst += landI;
    const c = circOf(d, ing);
    co[c.coClass] = (co[c.coClass] || 0) + x;
    const pg = num(ing.nutr?.PG) ?? 0;
    cp += x * pg; hepL += x * pg * c.hefLow; hepM += x * pg * c.hefMed; hepH += x * pg * c.hefHigh;
    const soy = isSoy(d, ing), dcf = soy && isDcf(ef, ing);
    if (soy) { soyKg += x; if (dcf) soyDcfKg += x; }
    const sp = ef.low != null && ef.high != null && total ? { low: ef.low / total, high: ef.high / total } : spreadByDqr(ef.dqr);
    if (total != null) mcIn.push({ central: e + eLoss, low: (e + eLoss) * sp.low, high: (e + eLoss) * sp.high });
    lines.push({ ing: l.ing, name: ing.name || l.ing, kg: x, ingLotId: l.ingLotId || null, origin: ef.origin || originKey(ing.origin), scheme: ef.scheme || null, coc: ef.coc || null,
      ef: total, efSource: ef.source, step: ef.step, dqr: ef.dqr, db: ef.db, dbVersion: ef.dbVersion, year: ef.year, low: ef.low, high: ef.high, status: ef.status, ref: ef.ref, rowId: ef.rowId, supplierPcfId: ef.supplierPcfId,
      raw: e, loss: eLoss, tin: eTin, tinLegs: tr.legs, luc: lucI, landMgmt: lmI, hasComp, land: landI, landEstimated: landE, coClass: c.coClass, soy, dcf });
  }
  const me = millEnergy(d, P);
  const mill = productMill(d, prod, P, me);
  const pk = packagingFor(d, prod);
  const out = s.includeOutbound ? outboundPerT(d, prod.id, P) : null;
  const total = raw + lossC + tin + mill.total + pk.co2PerT + (out?.value || 0);
  mcIn.push({ central: mill.total, low: mill.total * 0.9, high: mill.total * 1.1 });
  if (pk.co2PerT > 0) mcIn.push({ central: pk.co2PerT, low: pk.co2PerT * 0.7, high: pk.co2PerT * 1.3 });
  if (tin > 0) mcIn.push({ central: tin, low: tin * 0.6, high: tin * 1.5 });
  if (out?.value) mcIn.push({ central: out.value, low: out.value * 0.7, high: out.value * 1.4 });
  const mc = light ? { p10: null, p50: null, p90: null, mean: null, n: 0, central: null } : pcfMonteCarlo(mcIn, s.mcN, s.seed);
  // qualità: media dei DQR pesata sulle emissioni (stabilimento 2 se misurato, imballaggi 3 o 4, trasporti 4)
  const dq = [...lines.filter(l => l.ef != null).map(l => [l.raw + l.loss, l.dqr ?? 5]), [mill.total, mill.measured ? 2 : 3], [pk.co2PerT, pk.isDefault ? 4 : 3], [tin, 4], [out?.value || 0, 4]];
  const dqW = sum(dq, x => x[0]);
  const dqr = dqW > 0 ? sum(dq, x => x[0] * x[1]) / dqW : null;
  const dbs = [...new Set(lines.filter(l => l.ef != null).map(l => (l.efSource === 'anagrafica' ? 'anagrafica' : l.efSource === 'fornitore' ? 'impronte dei fornitori' : `${l.db || 'registro'}${l.dbVersion ? ' ' + l.dbVersion : ''}`)))].sort();
  const energySrc = me.grid ? `${me.grid.label || me.grid.id}${me.grid.source ? ' · ' + me.grid.source : ''}` : 'fattore di rete delle impostazioni';
  const hepSc = ['low', 'med', 'high'].includes(s.hepScenario) ? s.hepScenario : 'med';
  const hep = { low: cp > 0 ? hepL / cp : null, med: cp > 0 ? hepM / cp : null, high: cp > 0 ? hepH / cp : null, scenario: hepSc };
  hep.value = hep[hepSc];
  const originMix = light ? null : originMixOf(d, src, P);
  const res = {
    productId: prod.id, product: { id: prod.id, code: prod.code || '', name: prod.name || prod.id, species: prod.species || f?.species || null, form: prod.form || '', packaging: prod.packaging || '', lineId: prod.lineId || null },
    formula: f ? { id: f.id, code: f.code || f.id, version, current: +f.version === +version, date: versionDate(f, version), specId: f.specId || null } : null,
    lot: lot ? { id: lot.id, code: lot.code || lot.id, date: lot.date, tonnes: num(lot.tonnes) } : null,
    period: { key: P.key || null, from: P.from, to: P.to, label: P.label || null }, date, basis: lot ? 'lotto' : 'formula',
    lines, components: { raw, loss: lossC, inbound: tin, mill: mill.total, millCommon: mill.common, millPellet: mill.pellet, packaging: pk.co2PerT, outbound: out?.value ?? null },
    total, luc, landMgmt: lm, flag: luc + lm, nonFlag: total - luc - lm, fossil: fossilKnown || null, lucShare: total > 0 ? luc / total : null,
    componentCoverage: raw > 0 ? compRaw / raw : null, land, landEstimatedShare: land > 0 ? landEst / land : null, missingKg,
    soy: { kg: soyKg, dcfKg: soyDcfKg, dcfShare: soyKg > 0 ? soyDcfKg / soyKg : null, basis: lot ? 'lotti di arrivo' : 'formula (schema e catena di custodia del fattore)' },
    coShares: Object.fromEntries(Object.entries(co).map(([k, v]) => [k, v / 1000])), exFood: (co['ex-food'] || 0) / 1000, hep,
    primaryShare: total > 0 ? (mill.total + supRaw) / total : null, supplierShare: total > 0 ? supRaw / total : null, dqr,
    energy: { kwhT: mill.kwhT, fuelT: mill.fuelT, efEl: me.efEl, efLB: me.efLB, pvShare: me.pvShare, efFuel: me.efFuel, pelletShare: mill.pelletShare, measured: mill.measured, source: energySrc, model: me.elModel },
    packaging: pk, outbound: out, mc, uncertainty: { p10: mc.p10, p50: mc.p50, p90: mc.p90, n: mc.n },
    method: s.method, boundary: s.includeOutbound ? 'culla-cliente' : s.boundary, dbVersions: dbs, energySource: energySrc, lossPct: loss * 100, originMix,
  };
  res.light = light;
  res.hash = light ? null : sha256HexSync(canonicalJson(snapshotCore(res)));
  return res;
}
function versionDate(f, v) {
  if (!f) return null;
  if (+f.version === +v) return f.approvedAt || A(f.history).find(h => +h?.version === +v)?.date || null;
  return A(f.history).find(h => +h?.version === +v)?.date || null;
}
/** Origine delle materie prime della formula: tonnellate ricevute nel periodo per paese (registro EUDR) pesate sui kg della formula. */
function originMixOf(d, src, P) {
  const by = new Map();
  const { eu } = LOT_IX(d);
  const kgIng = new Map();
  for (const l of src) kgIng.set(l.ing, (kgIng.get(l.ing) || 0) + l.kg);
  const tot = sum([...kgIng.values()]);
  const ings = regIndex(d).ings;
  const recv = new Map();
  for (const il of A(d?.ingLots)) {
    if (!il || !kgIng.has(il.ingId) || !inP(il.date, P) || !fin(il.tonnes)) continue;
    const o = originKey(eu.get(il.id)?.country) || originKey(ings.get(il.ingId)?.origin) || 'n.d.';
    const m = recv.get(il.ingId) || recv.set(il.ingId, new Map()).get(il.ingId);
    m.set(o, (m.get(o) || 0) + +il.tonnes);
  }
  for (const [ing, kg] of kgIng) {
    const m = recv.get(ing);
    const w = tot ? kg / tot : 0;
    if (!m || !m.size) { const o = originKey(ings.get(ing)?.origin) || 'n.d.'; by.set(o, (by.get(o) || 0) + w); continue; }
    const t = sum([...m.values()]);
    for (const [o, v] of m) by.set(o, (by.get(o) || 0) + w * v / t);
  }
  return Object.fromEntries([...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v, 4)]));
}
/** Parte stabile di un risultato (per l'impronta digitale delle fotografie e per i confronti). */
export function snapshotCore(r) {
  const c = r.components;
  const r1 = v => (v == null ? null : round(v, 1));
  return { productId: r.productId, formulaId: r.formula?.id || null, formulaVersion: r.formula?.version ?? null, periodKey: r.period?.key || null, lotId: r.lot?.id || null,
    components: { raw: r1(c.raw), loss: r1(c.loss), inbound: r1(c.inbound), mill: r1(c.mill), packaging: r1(c.packaging), outbound: r1(c.outbound) },
    total: r1(r.total), luc: r1(r.luc), landMgmt: r1(r.landMgmt), method: r.method, boundary: r.boundary, dbVersions: r.dbVersions, energyMix: energyMixOf(r), originMix: r.originMix };
}
export const energyMixOf = r => ({ mill: round(r.components.mill, 2), efEl: round(r.energy.efEl, 4), kwhT: round(r.energy.kwhT || 0, 2), fuelT: round(r.energy.fuelT || 0, 3), pvShare: round(r.energy.pvShare || 0, 3) });

/* ---------------- portafoglio, produzione e media ponderata ---------------- */
/** Produzione del periodo per prodotto e versione della formula: [{productId, version, t}]. */
export function productionByVersion(d, P) {
  return cached('prodv|' + P.from + '|' + P.to, [d?.runs, d?.formulas], () => {
    const m = new Map();
    const fv = byId(A(d?.formulas).filter(f => f && has(f.id)));
    for (const r of A(d?.runs)) {
      if (!r || !inP(r.date, P) || !fin(r.tonnes) || +r.tonnes <= 0 || !has(r.productId)) continue;
      const v = fin(r.formulaVersion) ? +r.formulaVersion : +(fv[r.formulaId]?.version || 0);
      const k = r.productId + '|' + v;
      const x = m.get(k) || m.set(k, { productId: r.productId, version: v, t: 0 }).get(k);
      x.t += +r.tonnes;
    }
    return [...m.values()];
  }, 4);
}
/**
 * Impronta media del periodo ponderata sulla produzione (versione della formula di ogni lotto): {t, tco2e, pcf, luc, lm, primary,
 * land, dcfSoy, byProduct: {id: {t, tco2e, luc, lm}}}. null senza produzione.
 */
export function weightedPcf(d, P) {
  const PP = resolveP(d, P);
  return cached('wpcf|' + PP.from + '|' + PP.to, [d?.runs, d?.formulas, d?.ingredients, d?.efIngredients, d?.supplierPcfs, d?.packagingSpecs, d?.products, d?.energy, d?.settings, d?.lines, d?.factorOverrides, d?.ingCircular, d?.ingLots, d?.eudrLots], () => {
    let t = 0, e = 0, l = 0, m = 0, pr = 0, land = 0, soy = 0, soyDcf = 0;
    const byProduct = {};
    for (const x of productionByVersion(d, PP)) {
      const r = pcf(d, x.productId, { P: PP, formulaVersion: x.version, light: true }) || pcf(d, x.productId, { P: PP, light: true });
      if (!r) continue;
      t += x.t; e += x.t * r.total; l += x.t * r.luc; m += x.t * r.landMgmt; pr += x.t * r.total * (r.primaryShare || 0); land += x.t * r.land;
      soy += x.t * r.soy.kg; soyDcf += x.t * r.soy.dcfKg;
      const b = byProduct[x.productId] || (byProduct[x.productId] = { productId: x.productId, name: r.product.name, t: 0, tco2e: 0, luc: 0, lm: 0 });
      b.t += x.t; b.tco2e += x.t * r.total / 1000; b.luc += x.t * r.luc / 1000; b.lm += x.t * r.landMgmt / 1000;
    }
    if (!(t > 0)) return null;
    return { t, tco2e: e / 1000, pcf: e / t, luc: l / t, lm: m / t, lucShare: e > 0 ? l / e : null, primary: e > 0 ? pr / e : null, land: land / t, landHa: land / 1e4, dcfSoy: soy > 0 ? soyDcf / soy : null, byProduct };
  }, 4);
}

/* ---------------- dichiarazione per cliente ---------------- */
const shipIx = d => cached('shipix', [d?.lots, d?.runs], () => ({ lot: new Map(A(d?.lots).filter(l => l && has(l.id)).map(l => [l.id, l])), run: new Map(A(d?.runs).filter(r => r && has(r.id)).map(r => [r.id, r])) }), 2);
/** Versione della formula di una consegna: consegna → lotto prodotto → registro di produzione (null se non tracciata). */
export function shipmentVersion(d, s) {
  const { lot, run } = shipIx(d);
  const l = lot.get(s?.lotId);
  const r = l ? run.get(l.runId) : null;
  return fin(r?.formulaVersion) ? +r.formulaVersion : null;
}
/**
 * Totali di un cliente nel periodo: per ogni consegna la versione della formula del lotto (con ripiego sull'impronta in vigore).
 * → {customer, period, rows: [{productId, name, t, kgPerT, tco2e, luc, lm, nonFlag, ha, versions}], totals, traced, fallbackT}
 * Solo totali e ripartizioni per prodotto: nessuna informazione sulle materie prime della formula.
 */
export function customerTotals(d, customerId, Pin) {
  const P = resolveP(d, Pin);
  const cust = A(d?.customers).find(c => c && c.id === customerId);
  if (!cust) return null;
  const rows = new Map();
  let traced = 0, fallbackT = 0, soyKg = 0, soyDcf = 0, prim = 0;
  const ids = [];
  for (const s of A(d?.shipments)) {
    if (!s || s.customerId !== customerId || !inP(s.date, P) || !fin(s.tonnes) || +s.tonnes <= 0) continue;
    const v = shipmentVersion(d, s);
    let r = v != null ? pcf(d, s.productId, { P, formulaVersion: v, light: true }) : null;
    if (r) traced += +s.tonnes;
    else { r = pcf(d, s.productId, { P, light: true }); if (r) fallbackT += +s.tonnes; }
    if (!r) continue;
    ids.push(s.id);
    const t = +s.tonnes;
    const x = rows.get(s.productId) || rows.set(s.productId, { productId: s.productId, name: r.product.name, code: r.product.code, t: 0, tco2e: 0, luc: 0, lm: 0, ha: 0, versions: new Set(), n: 0 }).get(s.productId);
    x.t += t; x.tco2e += t * r.total / 1000; x.luc += t * r.luc / 1000; x.lm += t * r.landMgmt / 1000; x.ha += t * r.land / 1e4; x.n++;
    if (r.formula) x.versions.add(r.formula.version);
    soyKg += t * r.soy.kg; soyDcf += t * r.soy.dcfKg; prim += t * r.total * (r.primaryShare || 0);
  }
  const list = [...rows.values()].map(x => ({ ...x, versions: [...x.versions].sort((a, b) => a - b), kgPerT: x.t ? x.tco2e * 1000 / x.t : null, nonFlag: x.tco2e - x.luc - x.lm })).sort((a, b) => b.tco2e - a.tco2e);
  const T = sum(list, x => x.t), E = sum(list, x => x.tco2e), Lc = sum(list, x => x.luc), Lm = sum(list, x => x.lm);
  return { customer: { id: cust.id, code: cust.code || '', name: cust.name || cust.id, type: cust.type || '' }, period: { key: P.key || null, from: P.from, to: P.to, label: P.label || null },
    rows: list, shipmentIds: ids,
    totals: { t: T, tco2e: E, kgPerT: T ? E * 1000 / T : null, luc: Lc, lm: Lm, nonFlag: E - Lc - Lm, lucShare: E ? Lc / E : null, flagShare: E ? (Lc + Lm) / E : null, ha: sum(list, x => x.ha), primaryShare: E ? prim / (E * 1000) : null },
    dcfEstimate: soyKg > 0 ? soyDcf / soyKg : null, traced, fallbackT, tracedShare: T ? traced / T : null };
}

/* ---------------- fotografie pubblicate e allarmi di ricalcolo ---------------- */
export const activeSnapshots = d => A(d?.pcfSnapshots).filter(s => s && s.status === 'attiva');
/** Riga di pcfSnapshots da un'impronta calcolata (parte stabile, banda P10-P90, quote, impronta digitale). */
export function snapshotFrom(r, { id, publishedAt, by = '', status = 'attiva', precedingIds = [], validityMonths = 12 }) {
  const core = snapshotCore(r);
  const y = +String(publishedAt).slice(0, 4), m = +String(publishedAt).slice(5, 7) - 1 + validityMonths;
  const until = `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-${String(publishedAt).slice(8, 10)}`;
  return { id, productId: r.productId, formulaId: core.formulaId, formulaVersion: core.formulaVersion, periodKey: core.periodKey, components: core.components, total: core.total,
    luc: core.luc, landMgmt: core.landMgmt, land: round(r.land, 0), p10: round(r.mc.p10, 0), p90: round(r.mc.p90, 0), primaryShare: round((r.primaryShare || 0) * 100, 1), dqr: r.dqr == null ? null : round(r.dqr, 2),
    dcfShare: r.soy.dcfShare == null ? null : round(r.soy.dcfShare * 100, 1), method: r.method, boundary: r.boundary, dbVersions: r.dbVersions, energyMix: core.energyMix, originMix: core.originMix,
    hash: r.hash, publishedAt, validUntil: until, by: by || '', status, precedingId: precedingIds[0] || null, precedingIds: [...precedingIds] };
}
/** Operazioni per pubblicare l'impronta corrente di un prodotto: nuova fotografia «attiva», la precedente diventa «superata». */
export function publishOps(d, productId, { by = '', at = null } = {}) {
  const r = pcf(d, productId, {});
  if (!r) return { ops: [], snapshot: null, error: 'Impronta non calcolabile: il prodotto non ha una formula con materie prime.' };
  const day = ISO.test(String(at || '')) ? at : esgToday(d);
  const prev = activeSnapshots(d).filter(s => s.productId === productId);
  const all = A(d.pcfSnapshots).filter(s => s && s.productId === productId);
  let n = all.length + 1;
  while (all.some(s => s.id === `pcs-${slug(productId)}-${n}`)) n++;
  const snapshot = snapshotFrom(r, { id: `pcs-${slug(productId)}-${n}`, publishedAt: day, by, precedingIds: prev.map(x => x.id), validityMonths: pcfSettings(d).validityMonths });
  const ops = [...prev.map(x => ({ kind: 'update', coll: 'pcfSnapshots', id: x.id, patch: { status: 'superata', supersededAt: day } })), { kind: 'add', coll: 'pcfSnapshots', obj: snapshot }];
  return { ops, snapshot, error: null };
}
/**
 * Fotografie da ricalcolare (regola PACT v3): versione della formula cambiata, versione della banca dati cambiata, origine delle
 * materie prime spostata di oltre 10 punti, energia di stabilimento cambiata di oltre il 10%. → [{snapshot, product, reasons, current}]
 */
export function recalcAlerts(d) {
  const s = pcfSettings(d);
  const out = [];
  for (const snap of activeSnapshots(d)) {
    const prod = A(d.products).find(p => p && p.id === snap.productId);
    if (!prod || prod.active === false) continue;
    const cur = pcf(d, prod.id, {});
    if (!cur) continue;
    const reasons = [];
    if (cur.formula && snap.formulaVersion != null && +cur.formula.version !== +snap.formulaVersion) reasons.push({ kind: 'formula', text: `formula passata dalla versione ${snap.formulaVersion} alla ${cur.formula.version}` });
    const oldDb = new Set(A(snap.dbVersions)), newDb = new Set(cur.dbVersions);
    const addDb = [...newDb].filter(x => !oldDb.has(x)), delDb = [...oldDb].filter(x => !newDb.has(x));
    if (addDb.length || delDb.length) reasons.push({ kind: 'banca-dati', text: `banche dati cambiate (${[...addDb.map(x => '+ ' + x), ...delDb.map(x => '− ' + x)].join(', ')})` });
    if (isObj(snap.originMix)) {
      const keys = new Set([...Object.keys(snap.originMix), ...Object.keys(cur.originMix)]);
      let mx = 0, which = null;
      for (const k of keys) { const dlt = Math.abs((cur.originMix[k] || 0) - (snap.originMix[k] || 0)); if (dlt > mx) { mx = dlt; which = k; } }
      if (mx * 100 > s.recalcOriginPp) reasons.push({ kind: 'origine', text: `origine delle materie prime spostata di ${round(mx * 100, 1)} punti (${originLabel(which)})` });
    }
    const oldMill = num(snap.energyMix?.mill) ?? num(snap.components?.mill);
    if (oldMill != null && oldMill > 0) {
      const ch = (cur.components.mill - oldMill) / oldMill;
      if (Math.abs(ch) * 100 > s.recalcEnergyPct) reasons.push({ kind: 'energia', text: `energia di stabilimento ${ch > 0 ? 'aumentata' : 'diminuita'} del ${round(Math.abs(ch) * 100, 1)}%` });
    }
    if (reasons.length) out.push({ snapshot: snap, product: prod, reasons, current: cur, delta: cur.total - (num(snap.total) ?? cur.total) });
  }
  return out;
}

/* ---------------- imballaggi immessi sul mercato ---------------- */
/**
 * Registro degli imballaggi del periodo: t vendute per prodotto × imballaggio per t. → {rows (per confezione), byMaterial {kg},
 * kg, kgPerTSold, bulkShare, recycledPct, conai {classe: kg}, missing: [confezioni in sacchi senza scheda], tSold}
 */
export function packagingSummary(d, Pin) {
  const P = resolveP(d, Pin);
  return cached('pkg|' + P.from + '|' + P.to, [d?.shipments, d?.products, d?.packagingSpecs, d?.settings, d?.factorOverrides], () => {
    const tBy = new Map();
    for (const s of A(d?.shipments)) if (s && inP(s.date, P) && fin(s.tonnes)) tBy.set(s.productId, (tBy.get(s.productId) || 0) + +s.tonnes);
    const rows = new Map(), byMaterial = {}, conai = {};
    let kg = 0, rec = 0, tSold = 0, tBulk = 0, co2 = 0;
    const MAT_CONAI = Object.fromEntries(packList(d, 'materiale').map(x => [x.material, x.conai]));
    for (const p of A(d?.products)) {
      if (!p || !has(p.id)) continue;
      const t = tBy.get(p.id) || 0;
      const pk = packagingFor(d, p);
      tSold += t; if (pk.bulk) tBulk += t;
      const k = pk.packaging || '—';
      const r = rows.get(k) || rows.set(k, { packaging: k, spec: pk.spec, isDefault: pk.isDefault, bagged: pk.bagged, bulk: pk.bulk, products: [], t: 0, kgPerT: pk.kgPerT, co2PerT: pk.co2PerT, recycledPct: pk.recycledPct, recyclability: pk.recyclability, kg: 0, missing: pk.missing }).get(k);
      if (p.active !== false) r.products.push(p.name || p.id);
      r.t += t; r.kg += t * pk.kgPerT;
      kg += t * pk.kgPerT; co2 += t * pk.co2PerT;
      for (const [m, v] of Object.entries(pk.byMaterial)) { byMaterial[m] = (byMaterial[m] || 0) + t * v; const c = MAT_CONAI[m] || 'altro'; conai[c] = (conai[c] || 0) + t * v; }
      for (const c of pk.components) rec += t * c.kgPerT * Math.max(0, Math.min(100, c.recycledPct ?? 0)) / 100;
    }
    const list = [...rows.values()].sort((a, b) => b.kg - a.kg || b.t - a.t);
    return { period: { key: P.key || null, from: P.from, to: P.to, label: P.label || null }, rows: list, byMaterial, conai, kg, tco2e: co2 / 1000, tSold, kgPerTSold: tSold ? kg / tSold : null,
      bulkShare: tSold ? tBulk / tSold : null, recycledPct: kg > 0 ? rec / kg * 100 : null, missing: list.filter(r => r.missing && r.products.length).map(r => r.packaging) };
  }, 4);
}
