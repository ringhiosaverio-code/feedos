/* FeedOS 18 · Clima e GHG (pacchetto WP1): registro dei fattori di emissione e impostazioni del pacchetto.
 * Precedenza di un fattore: sostituzione dell'utente (raccolta factorOverrides, con fonte, anno e motivo) > pacchetto importato
 * più recente (settings.esg18.packs.clima) > pacchetto integrato (src/data/pack-clima.js). Le voci con sectors valgono solo per
 * quel settore (sectorOf). Il fattore di rete e quello del GPL seguono di base le impostazioni della scheda Energia, così lo
 * stesso numero compare in ogni scheda; dalla scheda Clima si può scegliere un altro fattore del registro.
 * Funzioni pure: nessun orologio, nessuna eccezione, nessun messaggio in console. */
import { packItems, activePack, compareVersions } from './esg-packs.js';
import { esgSettings, esgToday, sectorOf } from './esg-years.js';
import { GRID_FACTORS } from './energy.js';
import { PACK_CLIMA } from '../data/pack-clima.js';
import { addMonths } from '../core/util.js';

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const EMPTY = [];

/** Impostazioni di base del pacchetto (settings.esg18.clima le completa). */
export const CLIMA_DEFAULTS = Object.freeze({
  boundary: 'controllo-operativo',
  baseYearKey: null,
  baseSnapshot: null,
  recalcThresholdPct: 5,
  gwp: 'AR6',
  include: { c1: true, c2: false, c3: true, c4: true, c5: true, c6: false, c7: false, c8: false, c9: true, c10: false, c11: false, c12: true, c13: false, c14: false, c15: false },
  relevance: {},
  gridFactor: 'energia',
  defaultDelivery: 'flotta-propria',
  plantLat: null,
  plantLon: null,
  ets2Prices: [45, 60, 100],
  ets2Start: 2028,
});
/** Impostazioni del pacchetto clima fuse con quelle di base. */
export function climaSettings(d) {
  const s = esgSettings(d, 'clima', CLIMA_DEFAULTS);
  return { ...s, include: { ...CLIMA_DEFAULTS.include, ...(isObj(s.include) ? s.include : {}) }, relevance: isObj(s.relevance) ? s.relevance : {} };
}

/* ---------------- voci del pacchetto in uso ---------------- */
const listCache = new WeakMap(); // elenco di voci → {sector, list, byId}
function itemsOf(d) {
  const items = packItems(d, 'clima', PACK_CLIMA);
  const sector = sectorOf(d);
  let c = listCache.get(items);
  if (!c || c.sector !== sector) {
    const list = items.filter(it => isObj(it) && typeof it.id === 'string' && (!Array.isArray(it.sectors) || !it.sectors.length || it.sectors.includes(sector)));
    c = { sector, list, byId: new Map(list.map(it => [it.id, it])) };
    listCache.set(items, c);
  }
  return c;
}
/** Pacchetto clima in uso: {version, validAsOf, origin, builtinVersion, stale}. */
export function climaPackInfo(d, today = esgToday(d)) {
  const a = activePack(d, 'clima', PACK_CLIMA) || PACK_CLIMA;
  const limit = addMonths(today, -6);
  return { version: a.version, validAsOf: a.validAsOf, origin: a.origin || 'integrato', builtinVersion: PACK_CLIMA.version, source: a.source || '', stale: !!(a.validAsOf && a.validAsOf < limit),
    newerThanBuiltin: compareVersions(a.version, PACK_CLIMA.version) > 0 };
}

const rank = s => (s === 'verificato' ? 0 : s === 'preliminare' ? 1 : 2);
/** Voce del pacchetto per id; con un id di «famiglia» (es. 'el.lb.it') la voce con l'anno più recente non oltre year. */
export function packItem(d, id, year) {
  const { list, byId } = itemsOf(d);
  if (byId.has(id)) return byId.get(id);
  const fam = list.filter(it => it.id.startsWith(id + '.') && num(it.year) != null && num(it.value) != null);
  if (!fam.length) return null;
  const y = num(year);
  const ok = y != null ? fam.filter(it => +it.year <= y) : fam;
  const pool = ok.length ? ok : fam;
  return [...pool].sort((a, b) => b.year - a.year || rank(a.status) - rank(b.status))[0] || null;
}
/** Sostituzione dell'utente di un fattore (riga di factorOverrides con id = id del fattore) o null. */
export function overrideOf(d, id) {
  const rows = Array.isArray(d?.factorOverrides) ? d.factorOverrides : EMPTY;
  return rows.find(r => r && r.id === id) || null;
}

/**
 * Fattore di emissione: {id, value, unit, source, year, status, overridden, label, kind, group, …} o null.
 * Precedenza: sostituzione > pacchetto importato > pacchetto integrato. Con un id di famiglia sceglie per anno.
 */
export function factor(d, id, year) {
  if (typeof id !== 'string' || !id) return null;
  const it = packItem(d, id, year);
  const ov = overrideOf(d, id) || (it && it.id !== id ? overrideOf(d, it.id) : null);
  if (ov && num(ov.value) != null) {
    return { id: ov.id, value: +ov.value, unit: ov.unit || it?.unit || '', source: ov.source || '', year: num(ov.year), status: ov.status || 'sostituito', overridden: true,
      label: it?.label || ov.label || ov.id, kind: it?.kind || 'annuale', group: it?.group || null, reason: ov.reason || '', by: ov.by || '', at: ov.at || '',
      prev: isObj(ov.prev) ? ov.prev : null, packValue: num(it?.value), packSource: it?.source || '' };
  }
  if (!it || num(it.value) == null) return null;
  return { id: it.id, value: +it.value, unit: it.unit || '', source: it.source || '', year: it.year ?? null, status: it.status || 'da verificare', overridden: false,
    label: it.label || it.id, kind: it.kind || 'annuale', group: it.group || null, note: it.note || '' };
}
const val = (d, id, year, fb = null) => factor(d, id, year)?.value ?? fb;

/* ---------------- fattori in uso per rete e GPL (coerenti con la scheda Energia) ---------------- */
export const GRID_MAP = Object.freeze({ ita23: 'el.lb.it.2023', ita24p: 'el.lb.it.2024p', ita24c: 'el.lb.it.2024', ita25p: 'el.lb.it.2025p' });
const yearIn = s => { const m = String(s || '').match(/(19|20)\d{2}/); return m ? +m[0] : null; };

/**
 * Fattore di rete location-based usato dall'inventario. Scelta (settings.esg18.clima.gridFactor): 'energia' (di base: lo stesso
 * della scheda Energia), 'auto' (il più recente del registro non oltre l'anno dell'esercizio) oppure l'id di una voce del registro.
 * → fattore con choice: 'energia' | 'anno' | 'clima'.
 */
export function gridFactorInUse(d, P) {
  const s = climaSettings(d);
  const y = P?.to ? +String(P.to).slice(0, 4) : null;
  const choice = s.gridFactor || 'energia';
  if (choice !== 'energia' && choice !== 'auto') { const f = factor(d, choice, y); if (f) return { ...f, choice: 'clima' }; }
  if (choice === 'auto') { const f = factor(d, 'el.lb.it', y); if (f) return { ...f, choice: 'anno' }; }
  const en = d?.settings?.energy || {};
  const id = GRID_MAP[en.gridFactor];
  if (id) { const f = factor(d, id, y); if (f) return { ...f, choice: 'energia' }; }
  const v = num(en.feGrid);
  if (v != null && v > 0) {
    const g = GRID_FACTORS.find(x => x.id === en.gridFactor);
    return { id: 'el.lb.energia', value: v, unit: 'kg CO₂/kWh', source: g ? g.src : 'Impostazioni › Energia (valore inserito a mano)', year: g ? yearIn(g.label) : null,
      status: g ? 'verificato' : 'da verificare', overridden: true, custom: true, label: g ? `Rete elettrica · ${g.label}` : 'Rete elettrica · valore inserito nelle impostazioni', kind: 'annuale', group: 'elettricita', choice: 'energia' };
  }
  const f = factor(d, 'el.lb.it', y);
  return f ? { ...f, choice: 'anno' } : null;
}
/** Un fattore di rete del registro più recente di quello in uso (per suggerirlo), o null. */
export function newerGridFactor(d, inUse) {
  if (!inUse) return null;
  const { list } = itemsOf(d);
  const y = num(inUse.year) ?? 0;
  const c = list.filter(it => it.group === 'elettricita' && it.id.startsWith('el.lb.it.') && num(it.value) != null && num(it.year) > y && it.id !== inUse.id);
  return c.sort((a, b) => b.year - a.year || rank(a.status) - rank(b.status))[0] || null;
}
/** CO₂ del GPL in uso: sostituzione > valore della scheda Energia se diverso dal registro > registro. */
export function gplFactorInUse(d) {
  const pk = factor(d, 'gpl.co2');
  if (pk?.overridden) return pk;
  const en = num(d?.settings?.energy?.feGpl);
  if (en != null && en > 0 && pk && Math.abs(en - pk.value) > 1e-6) {
    return { id: 'gpl.co2.energia', value: en, unit: 'kg CO₂/kg', source: 'Impostazioni › Energia (valore inserito a mano)', year: null, status: 'da verificare', overridden: true, custom: true,
      label: 'GPL, CO₂ da combustione · valore delle impostazioni', kind: 'parametro', group: 'combustibili' };
  }
  return pk;
}

/* ---------------- combustibili: unità, fattori, conversioni ---------------- */
export const FUEL_LABEL = { gas: 'Gas naturale', gpl: 'GPL', gasolio: 'Gasolio', hvo: 'HVO 100', benzina: 'Benzina', biomassa: 'Biomassa legnosa', biometano: 'Biometano' };
export const USE_LABEL = { vapore: 'Vapore di processo', riscaldamento: 'Riscaldamento', flotta: 'Flotta di consegna', carrelli: 'Carrelli elevatori', 'gruppo-elettrogeno': 'Gruppo elettrogeno', altro: 'Altri usi' };
export const MOBILE_USES = new Set(['flotta', 'carrelli']);
const NATURAL = { gas: 'Smc', gpl: 'kg', gasolio: 'l', hvo: 'l', benzina: 'l', biomassa: 'kg', biometano: 'Smc' };
const DENSITY = { gasolio: 0.835, hvo: 0.78, benzina: 0.745 };

/**
 * Specifica di un combustibile per il calcolo: unità naturale, fattori (fossile, CH₄+N₂O, biogenico, a monte, potere calorifico),
 * rinnovabile, soggetto all'ETS2. I fattori sono quelli in uso (con le sostituzioni).
 */
export function fuelSpec(d, fuel) {
  const F = id => factor(d, id);
  switch (fuel) {
    case 'gas': return { fuel, unit: 'Smc', co2: F('gas.co2'), nonco2: F('gas.nonco2'), bio: null, ncv: F('gas.ncv'), wtt: F('wtt.gas'), wttPerUnit: 1, renewable: false, ets2: true };
    case 'gpl': { const dens = val(d, 'gpl.density', null, 0.51); return { fuel, unit: 'kg', co2: gplFactorInUse(d), nonco2: F('gpl.nonco2'), bio: null, ncv: F('gpl.ncv'), wtt: F('wtt.gpl'), wttPerUnit: dens > 0 ? 1 / dens : 0, density: dens, renewable: false, ets2: true }; }
    case 'gasolio': return { fuel, unit: 'l', co2: F('diesel.co2e'), nonco2: null, bio: null, ncv: F('diesel.ncv'), wtt: F('wtt.diesel'), wttPerUnit: 1, density: DENSITY.gasolio, renewable: false, ets2: true };
    case 'hvo': return { fuel, unit: 'l', co2: F('hvo.co2'), nonco2: F('diesel.mob.nonco2'), bio: F('hvo.bio'), ncv: F('hvo.ncv'), wtt: F('wtt.hvo'), wttPerUnit: 1, density: DENSITY.hvo, renewable: true, ets2: false };
    case 'benzina': return { fuel, unit: 'l', co2: F('benzina.co2e'), nonco2: null, bio: null, ncv: F('benzina.ncv'), wtt: F('wtt.benzina'), wttPerUnit: 1, density: DENSITY.benzina, renewable: false, ets2: true };
    case 'biomassa': return { fuel, unit: 'kg', co2: null, nonco2: F('biomassa.nonco2'), bio: F('biomassa.bio'), ncv: F('biomassa.ncv'), wtt: null, wttPerUnit: 1, renewable: true, ets2: false };
    case 'biometano': return { fuel, unit: 'Smc', co2: null, nonco2: F('biometano.nonco2'), bio: F('biometano.bio'), ncv: F('gas.ncv'), wtt: null, wttPerUnit: 1, renewable: true, ets2: false };
    default: return null;
  }
}
/** Unità naturale di un combustibile (quella dei fattori). */
export const naturalUnit = fuel => NATURAL[fuel] || null;
/**
 * Quantità nell'unità naturale del combustibile: kg↔l con la densità, t → kg, kWh con il potere calorifico.
 * Senza unità vale quella naturale. → numero o null se la conversione non è possibile (es. litri di gas).
 */
export function toNatural(spec, qty, unit) {
  const q = num(qty);
  if (!spec || q == null) return null;
  const u = unit || spec.unit;
  if (u === spec.unit) return q;
  const ncv = num(spec.ncv?.value);
  if (u === 'kWh') return ncv ? q / ncv : null;
  const dens = num(spec.density);
  if (spec.unit === 'kg') { if (u === 't') return q * 1000; if (u === 'l' && dens) return q * dens; return null; }
  if (spec.unit === 'l') { if (u === 'kg' && dens) return q / dens; if (u === 't' && dens) return q * 1000 / dens; return null; }
  return null; // gas e biometano: solo Smc o kWh
}

/* ---------------- refrigeranti ---------------- */
/** GWP a 100 anni (AR6) di un gas refrigerante; gwpOverride della targa se indicato. → {value, source, overridden} o null. */
export function refGwp(d, gas, gwpOverride) {
  const o = num(gwpOverride);
  if (o != null && o >= 0) return { value: o, source: 'Valore indicato dall’utente (targa dell’apparecchiatura)', overridden: true };
  const f = factor(d, 'ref.' + gas);
  return f ? { value: f.value, source: f.source, overridden: f.overridden, year: f.year, status: f.status, id: f.id } : null;
}

/* ---------------- quota FLAG e uso del suolo per categoria (settore mangimi) ---------------- */
function flagKey(ing) {
  const extra = ing?.origin === 'Extra-UE', cert = !!ing?.certified;
  switch (ing?.category) {
    case 'cereale': return ['cereale', 'cereale'];
    case 'proteico': return cert ? ['proteico.certificato', extra ? 'proteico.extra' : 'proteico'] : extra ? ['proteico.extra', 'proteico.extra'] : ['proteico', 'proteico'];
    case 'coprodotto': return ['coprodotto', 'coprodotto'];
    case 'foraggio': return ['foraggio', 'foraggio'];
    case 'grasso': return extra ? ['grasso.extra', 'grasso.extra'] : ['grasso', 'grasso'];
    case 'minerale': return ['minerale', 'minerale'];
    case 'aminoacido': return ['aminoacido', 'aminoacido'];
    case 'premix': return ['premix', 'premix'];
    default: return ['altro', 'altro'];
  }
}
/**
 * Stima per categoria della quota FLAG del fattore di una materia prima e della sua occupazione di suolo (m²·anno per kg),
 * quando il registro delle materie prime non dà le componenti. → {flag: fattore|null, land: fattore|null, key}.
 */
export function flagDefaults(d, ing) {
  const [fk, lk] = flagKey(ing);
  return { flag: factor(d, 'flag.' + fk), land: factor(d, 'land.' + lk), key: fk };
}

/* ---------------- registro per la pagina e per le esportazioni ---------------- */
/** Etichetta della scelta del fattore di rete. */
export const GRID_CHOICE_LABEL = { energia: 'come la scheda Energia', anno: 'il più recente per l’anno dell’esercizio', clima: 'scelto nella scheda Clima' };

/**
 * Registro dei fattori: tutte le voci del pacchetto in uso (per il settore) con le sostituzioni, più i valori personalizzati
 * delle impostazioni. used: insieme degli id usati dall'inventario. → [{id, group, label, value, unit, source, year, status,
 * kind, overridden, packValue, reason, by, at, prev, inUse, stale, note, custom}]
 */
export function factorRegistry(d, { used = null, today = esgToday(d) } = {}) {
  const { list } = itemsOf(d);
  const ty = +String(today).slice(0, 4);
  const rows = list.map(it => {
    const f = factor(d, it.id);
    const ov = overrideOf(d, it.id);
    const value = f ? f.value : num(it.value);
    const year = f ? f.year : it.year ?? null;
    const kind = it.kind || 'annuale';
    return { id: it.id, group: it.group || 'altro', label: it.label || it.id, value, unit: (f?.unit || it.unit || ''), source: f ? f.source : it.source || '', year, status: f ? f.status : it.status || 'da verificare', kind,
      overridden: !!ov, packValue: num(it.value), packSource: it.source || '', packYear: it.year ?? null, packStatus: it.status || '', reason: ov?.reason || '', by: ov?.by || '', at: ov?.at || '', prev: isObj(ov?.prev) ? ov.prev : null,
      inUse: used ? used.has(it.id) : false, stale: kind === 'annuale' && num(year) != null && ty - +year > 3, note: it.note || '', sectors: it.sectors || null };
  });
  // valori delle impostazioni (scheda Energia) diversi dal registro: righe in più, così si vedono e si documentano
  for (const f of [gridFactorInUse(d, { to: today }), gplFactorInUse(d)]) {
    if (f?.custom && !rows.some(r => r.id === f.id)) rows.push({ id: f.id, group: f.group || 'altro', label: f.label, value: f.value, unit: f.unit, source: f.source, year: f.year, status: f.status, kind: f.kind || 'annuale', overridden: true, custom: true,
      packValue: null, reason: 'Valore delle impostazioni della scheda Energia', by: '', at: '', prev: null, inUse: used ? used.has(f.id) : true, stale: false, note: '' });
  }
  // sostituzioni di id che non sono nel pacchetto (es. voci tolte da un pacchetto più recente)
  for (const ov of Array.isArray(d?.factorOverrides) ? d.factorOverrides : EMPTY) {
    if (!ov || typeof ov.id !== 'string' || rows.some(r => r.id === ov.id)) continue;
    rows.push({ id: ov.id, group: 'altro', label: ov.label || ov.id, value: num(ov.value), unit: ov.unit || '', source: ov.source || '', year: num(ov.year), status: ov.status || 'sostituito', kind: 'annuale', overridden: true,
      packValue: null, reason: ov.reason || '', by: ov.by || '', at: ov.at || '', prev: isObj(ov.prev) ? ov.prev : null, inUse: used ? used.has(ov.id) : false, stale: false, note: 'Voce non presente nel pacchetto in uso' });
  }
  return rows;
}

/**
 * Operazioni per sostituire un fattore (store.batch): una riga di factorOverrides con id = id del fattore, valore, unità, fonte,
 * anno, motivo, autore (by), data (at) e la sostituzione precedente (prev). Valore o fonte o motivo mancanti → [].
 */
export function overrideOps(d, id, { value, unit, source, year, reason, status } = {}, { by = '', at = '' } = {}) {
  const v = num(value);
  if (typeof id !== 'string' || !id || v == null || !String(source || '').trim() || !String(reason || '').trim()) return [];
  const cur = overrideOf(d, id), it = packItem(d, id);
  const prev = cur ? { value: num(cur.value), unit: cur.unit || '', source: cur.source || '', year: num(cur.year), reason: cur.reason || '', by: cur.by || '', at: cur.at || '' }
    : it ? { value: num(it.value), unit: it.unit || '', source: it.source || '', year: num(it.year), reason: 'valore del pacchetto', by: '', at: '' } : null;
  const obj = { id, value: v, unit: String(unit || it?.unit || '').trim(), source: String(source).trim(), year: num(year), reason: String(reason).trim(), status: status || 'sostituito', by, at, prev };
  return cur ? [{ kind: 'update', coll: 'factorOverrides', id, patch: obj }] : [{ kind: 'add', coll: 'factorOverrides', obj }];
}
/** Operazioni per tornare al valore del pacchetto (toglie la sostituzione; il registro delle modifiche la conserva). */
export function resetOps(d, id) { return overrideOf(d, id) ? [{ kind: 'remove', coll: 'factorOverrides', id }] : []; }
