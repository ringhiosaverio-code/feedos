/* FeedOS 18 · Clima e GHG (pacchetto WP1): Scope 3 per categoria (GHG Protocol, Scope 3 Standard).
 * c1  materie prime ACQUISTATE (lotti ricevuti × fattore della materia prima, ingredientEf del pacchetto pcf), più imballaggi
 *     e materiali di consumo; quota FLAG (LUC + gestione del suolo) e occupazione di suolo; confronto con i consumi.
 * c2  beni strumentali (a valore) · c3 filiera dei combustibili e perdite di rete · c4 trasporti in ingresso non compresi nel
 *     fattore + consegne con vettori pagati dall'azienda · c5 rifiuti per destinazione · c6/c7 viaggi e pendolarismo (dati
 *     inseriti) · c9 ritiri dei clienti · c12 fine vita degli imballaggi venduti. c8, c10, c11, c13-c15: non applicabili o
 *     escluse con motivazione (screening modificabile).
 * Distanze: linea d'aria (haversine) tra stabilimento e cliente × fattore stradale (settings.logistics.roadFactor, di base 1,3).
 * Unità: fattori delle materie prime in kg CO₂e per t; risultati in t CO₂e. Funzioni pure, senza eccezioni né console. */
import { ingredientEf, packagingFactor } from './esg-pcf.js';
import { plantCoords } from './esg-rischi.js';
import { factor, num, climaSettings, flagDefaults } from './esg-clima-factors.js';
import { SCOPE3_SCREENING } from '../data/pack-clima.js';
import { byId } from '../core/util.js';

const EMPTY = [];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

/* ---------------- distanze ---------------- */
/** Distanza in linea d'aria tra due punti {lat, lon}, in km. */
export function haversineKm(a, b) {
  if (!a || !b || [a.lat, a.lon, b.lat, b.lon].some(v => !Number.isFinite(+v))) return null;
  const R = 6371, r = x => (+x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Coordinate dello stabilimento: plantCoords (pacchetto rischi) → settings.esg18.clima.plantLat/Lon → null. */
export function plantLocation(d) {
  let p = null;
  try { p = plantCoords(d); } catch { p = null; }
  if (p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) return { lat: +p.lat, lon: +p.lon, source: p.source || 'anagrafica dell’azienda' };
  const s = climaSettings(d), lat = num(s.plantLat), lon = num(s.plantLon);
  return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, source: 'impostazioni della scheda Clima' } : null;
}
export const roadFactorOf = d => { const v = num(d?.settings?.logistics?.roadFactor); return v != null && v >= 1 && v <= 3 ? v : 1.3; };

const distCache = new WeakMap(); // elenco clienti → {key, out}
/**
 * Distanza stradale stimata stabilimento → cliente: {plant, roadFactor, byCustomer: Map(id → {km, estimated}), avgKm, known}.
 * Clienti senza coordinate: distanza media dei clienti noti (stimata). Senza coordinate dello stabilimento: byCustomer vuoto.
 */
export function customerDistances(d) {
  const custs = Array.isArray(d?.customers) ? d.customers : EMPTY;
  const plant = plantLocation(d), rf = roadFactorOf(d);
  const key = plant ? `${plant.lat}|${plant.lon}|${rf}` : 'none';
  const hit = distCache.get(custs);
  if (hit && hit.key === key) return hit.out;
  const byCustomer = new Map();
  let sum = 0, n = 0;
  if (plant) for (const c of custs) { const k = haversineKm(plant, c); if (k != null) { byCustomer.set(c.id, { km: k * rf, estimated: false }); sum += k * rf; n++; } }
  const avgKm = n ? sum / n : null;
  if (plant && avgKm != null) for (const c of custs) if (!byCustomer.has(c.id)) byCustomer.set(c.id, { km: avgKm, estimated: true });
  const out = { plant, roadFactor: rf, byCustomer, avgKm, known: n };
  distCache.set(custs, { key, out });
  return out;
}
/** Modalità di consegna di un cliente: riga di customerLogistics (id = cliente) o quella di base delle impostazioni. */
export function deliveryModeOf(d, customerId, S = climaSettings(d)) {
  const r = (Array.isArray(d?.customerLogistics) ? d.customerLogistics : EMPTY).find(x => x && x.id === customerId);
  return r?.mode || S.defaultDelivery || 'flotta-propria';
}

/* ---------------- qualità ---------------- */
/** Qualità del fattore di una materia prima: misurato (DQR ≤ 2), stimato (DQR 3), default (anagrafica o DQR ≥ 4). */
export function efQuality(ef) {
  const q = num(ef?.dqr);
  if (!ef || ef.source === 'anagrafica' || q == null || q >= 4) return 'default';
  return q <= 2 ? 'misurato' : 'stimato';
}
const fLite = f => (f ? { id: f.id, value: f.value, unit: f.unit, source: f.source, year: f.year, status: f.status, overridden: !!f.overridden } : null);

/* ---------------- screening ---------------- */
const INCLUDED_STATUS = new Set(['calcolata', 'stimata']);
/** Screening della categoria n: {n, id, label, included, status, reason, defaultReason}. */
export function screeningOf(d, n, S = climaSettings(d), sector) {
  const sc = SCOPE3_SCREENING.find(x => x.cat === n) || { cat: n, label: `Categoria ${n}`, status: 'non-applicabile', text: '' };
  const id = 'c' + n;
  const included = n === 1 ? true : S.include?.[id] === true;
  const rel = isObj(S.relevance?.[id]) ? S.relevance[id] : {};
  const defaultReason = (sc.bySector && sector && sc.bySector[sector]) || sc.text || '';
  let status = rel.status && typeof rel.status === 'string' ? rel.status : sc.status;
  if (included && !INCLUDED_STATUS.has(status)) status = 'calcolata';
  if (!included && INCLUDED_STATUS.has(status)) status = 'esclusa';
  return { n, id, label: sc.label, included, status, reason: typeof rel.reason === 'string' && rel.reason.trim() ? rel.reason.trim() : defaultReason, defaultReason, custom: !!(rel.reason || rel.status) };
}

/* ---------------- dati inseriti (scope3Inputs) ---------------- */
const INPUT_DEFAULT = { '1-consumabili': 'sp.consumabili', 2: 'sp.capex', 6: 'tr.aereo', 7: 'tr.auto' };
function inputsOf(d, W, cat) {
  const rows = Array.isArray(d?.scope3Inputs) ? d.scope3Inputs : EMPTY;
  const out = [];
  for (const r of rows) {
    if (!r || String(r.cat) !== String(cat)) continue;
    const y = num(r.year), q = num(r.qty);
    if (y == null || q == null) continue;
    const m = W.months.filter(x => +x.slice(0, 4) === y).length;
    if (!m) continue;
    const fid = r.factorId || (String(cat) === '6' && r.unit === 'km' ? 'tr.auto' : INPUT_DEFAULT[cat]);
    const f = factor(d, fid);
    const share = m / 12;
    out.push({ row: r, share, qty: q * share, factor: f, tco2e: f ? q * share * f.value / 1000 : 0, missingFactor: !f });
  }
  return out;
}
function inputLine(cat, label, list, link) {
  const tco2e = list.reduce((s, x) => s + x.tco2e, 0);
  const qty = list.reduce((s, x) => s + x.qty, 0);
  const f = list.find(x => x.factor)?.factor || null;
  return { id: `s3-${cat}-dati`, scope: 3, cat, label, activity: qty, unit: list[0]?.row?.unit || '€', factor: fLite(f), tco2e, quality: 'stimato',
    method: 'Dati inseriti a valore o in chilometri, ripartiti sui mesi del periodo × fattore medio', formula: 'Σ quantità × (mesi dell’anno nel periodo ÷ 12) × fattore ÷ 1.000',
    records: list.length, link, note: list.some(x => x.missingFactor) ? 'Alcune righe non hanno un fattore valido.' : '' };
}

/* ---------------- categoria 1 ---------------- */
const isBagged = p => /sacc|big ?bag/i.test(String(p?.packaging || ''));
function versionLines(f, version) { if (!f) return null; const h = (f.history || EMPTY).find(x => x.version === version); return (h || f).lines || null; }

function cat1(d, W, sector) {
  const ingById = byId(d.ingredients || EMPTY);
  const lines = [];
  const byIng = new Map();
  const missing = new Map();
  const fdCache = new Map();
  const fd = ing => { if (!fdCache.has(ing?.id)) fdCache.set(ing?.id, flagDefaults(d, ing)); return fdCache.get(ing?.id); };
  let purchT = 0, nLots = 0;
  for (const l of d.ingLots || EMPTY) {
    if (!l || typeof l.date !== 'string' || l.date < W.from || l.date > W.to || l.status === 'bloccato') continue;
    const t = num(l.tonnes);
    if (!t || t <= 0) continue;
    nLots++; purchT += t;
    const ing = ingById[l.ingId];
    let ef = null;
    try { ef = ingredientEf(d, l.ingId, { supplierId: l.supplierId || null, date: l.date, ingLotId: l.id }); } catch { ef = null; }
    const total = num(ef?.total);
    let g = byIng.get(l.ingId);
    if (!g) {
      g = { ingId: l.ingId, name: ing?.name || l.ingId, category: ing?.category || '', origin: ing?.origin || '', t: 0, tco2e: 0, flag: 0, luc: 0, landMgmt: 0, landHa: 0, lots: 0,
        flagComp: 0, flagCat: 0, landComp: 0, landCat: 0, q: { misurato: 0, stimato: 0, default: 0 }, sources: new Set(), efMin: null, efMax: null, noEfT: 0 };
      byIng.set(l.ingId, g);
    }
    g.t += t; g.lots++;
    if (total == null) { g.noEfT += t; missing.set(l.ingId, (missing.get(l.ingId) || 0) + t); continue; }
    const e = t * total / 1000;
    g.tco2e += e;
    g.efMin = g.efMin == null ? total : Math.min(g.efMin, total); g.efMax = g.efMax == null ? total : Math.max(g.efMax, total);
    if (ef.source) g.sources.add(ef.source);
    g.q[efQuality(ef)] += e;
    const luc = num(ef.luc), lm = num(ef.landMgmt);
    if (luc != null || lm != null) { g.luc += t * (luc || 0) / 1000; g.landMgmt += t * (lm || 0) / 1000; g.flag += t * ((luc || 0) + (lm || 0)) / 1000; g.flagComp += e; }
    else { const f = fd(ing).flag; if (f) { g.flag += e * Math.max(0, Math.min(1, f.value)); g.flagCat += e; } }
    const m2a = num(ef.landM2a); // m²·anno per t di materia prima (stessa base «per tonnellata» dei fattori)
    if (m2a != null) { g.landHa += t * m2a / 1e4; g.landComp += t; }
    else { const f = fd(ing).land; if (f) { g.landHa += t * 1000 * f.value / 1e4; g.landCat += t; } }
  }
  const ingredients = [...byIng.values()].map(g => {
    const qual = g.q.misurato >= g.q.default && g.q.misurato >= g.q.stimato ? 'misurato' : g.q.stimato > g.q.default ? 'stimato' : 'default';
    return { ...g, sources: [...g.sources], quality: g.tco2e > 0 ? qual : g.noEfT > 0 ? 'mancante' : 'default', ef: g.t > g.noEfT ? g.tco2e * 1000 / (g.t - g.noEfT) : null,
      flagMethod: g.flagComp > 0 && g.flagCat > 0 ? 'misto' : g.flagComp > 0 ? 'componenti' : g.flagCat > 0 ? 'categoria' : null };
  }).sort((a, b) => b.tco2e - a.tco2e);
  const ingT = ingredients.reduce((s, g) => s + g.tco2e, 0);
  const qIng = { misurato: 0, stimato: 0, default: 0 };
  for (const g of ingredients) for (const k of Object.keys(qIng)) qIng[k] += g.q[k];
  for (const k of Object.keys(qIng)) if (qIng[k] > 0) lines.push({
    id: `s3-c1-mp-${k}`, scope: 3, cat: 'c1', group: 'materie-prime', label: `Materie prime acquistate${k === 'default' ? ' (fattori di base)' : k === 'misurato' ? ' (fattori specifici)' : ' (fattori stimati)'}`,
    activity: ingredients.reduce((s, g) => s + (g.tco2e > 0 ? g.t * (g.q[k] / g.tco2e) : 0), 0), unit: 't', factor: null, tco2e: qIng[k], quality: k,
    method: 'Base acquisti: tonnellate dei lotti ricevuti (esclusi i lotti respinti) × fattore della materia prima (kg CO₂e/t)',
    formula: 'Σ lotti t × fattore ÷ 1.000', records: nLots, source: 'Lotti di materie prime · fattori del registro delle materie prime', link: { tab: 'clima', id: 'scope3' },
  });

  // consumi (per il confronto con gli acquisti e per il ponte): produzione × formula in vigore × fattore della materia prima
  const formById = byId(d.formulas || EMPTY), prodById = byId(d.products || EMPTY);
  const efCache = new Map();
  const efOf = id => { if (!efCache.has(id)) { let e = null; try { e = ingredientEf(d, id, {}); } catch { e = null; } efCache.set(id, num(e?.total)); } return efCache.get(id); };
  const byProduct = {};
  let consT = 0, c1cons = 0, baggedProdT = 0;
  for (const r of d.runs || EMPTY) {
    if (!r || !W.set.has(String(r.date).slice(0, 7))) continue;
    const t = num(r.tonnes) || 0;
    if (t <= 0) continue;
    const ls = versionLines(formById[r.formulaId], r.formulaVersion) || EMPTY;
    let kgT = 0, perT = 0;
    for (const x of ls) { const kg = num(x.kg) || 0; kgT += kg; const ef = efOf(x.ing); if (ef != null) perT += kg / 1000 * ef; }
    consT += t * kgT / 1000;
    const e = t * perT / 1000;
    c1cons += e;
    const p = byProduct[r.productId] || (byProduct[r.productId] = { t: 0, c1: 0 });
    p.t += t; p.c1 += e;
    if (isBagged(prodById[r.productId])) baggedProdT += t;
  }

  // imballaggi acquistati (settore mangimi: peso di base dei sacchi finché il registro degli imballaggi non dà il peso reale)
  const kgT = factor(d, 'pk.sacco.kgt');
  let pf = null;
  try { const v = num(packagingFactor('carta')); if (v != null) pf = { id: 'pcf.carta', value: v, unit: 'kg CO₂e/kg', source: 'Registro degli imballaggi (pacchetto impronta)', year: null, status: 'calcolato' }; } catch { pf = null; }
  if (!pf) pf = factor(d, 'pk.carta');
  let packKg = 0, packT = 0;
  if (kgT && pf && baggedProdT > 0) {
    packKg = baggedProdT * kgT.value;
    packT = packKg * pf.value / 1000;
    lines.push({ id: 's3-c1-imballaggi', scope: 3, cat: 'c1', group: 'imballaggi', label: 'Imballaggi acquistati (sacchi)', activity: packKg, unit: 'kg', factor: fLite(pf), tco2e: packT, quality: 'stimato',
      method: `Produzione dei prodotti in sacchi × ${kgT.value} kg di imballaggio per t (peso di base) × fattore della carta`, formula: 't prodotte in sacchi × kg/t × fattore ÷ 1.000',
      records: null, link: { tab: 'clima', id: 'scope3' }, note: 'Peso dei sacchi di base: sostituirlo con il registro degli imballaggi per articolo.' });
  }
  // materiali di consumo (a valore)
  const cons = inputsOf(d, W, '1-consumabili');
  const consTco2 = cons.reduce((s, x) => s + x.tco2e, 0);
  if (cons.length) lines.push(inputLine('c1', 'Materiali di consumo e servizi (a valore)', cons, { tab: 'clima', id: 'scope3' }));

  const flag = ingredients.reduce((s, g) => s + g.flag, 0);
  const value = ingT + packT + consTco2;
  const flagComp = ingredients.reduce((s, g) => s + g.flagComp, 0), flagCat = ingredients.reduce((s, g) => s + g.flagCat, 0);
  return {
    value, lines, ingredients, ingT, packT, packKg, consT: consTco2, purchT, consumedT: consT, c1cons, byProduct, baggedProdT, nLots,
    flag, nonFlag: value - flag, luc: ingredients.reduce((s, g) => s + g.luc, 0), landMgmt: ingredients.reduce((s, g) => s + g.landMgmt, 0),
    landHa: ingredients.reduce((s, g) => s + g.landHa, 0), flagMethod: flagComp > 0 && flagCat > 0 ? 'misto' : flagComp > 0 ? 'componenti' : flagCat > 0 ? 'categoria' : null,
    missing: [...missing.entries()].map(([ingId, t]) => ({ ingId, name: ingById[ingId]?.name || ingId, t })),
  };
}

/* ---------------- categoria 3 ---------------- */
function cat3(d, fuels, kwhGrid, grid) {
  const lines = [];
  for (const f of fuels) {
    if (!f.spec?.wtt || !(f.qty > 0)) continue;
    const per = f.spec.wtt.value * (f.spec.wttPerUnit || 1);
    const t = f.qty * per / 1000;
    if (!(t > 0)) continue;
    lines.push({ id: `s3-c3-${f.fuel}`, scope: 3, cat: 'c3', group: 'wtt', label: `Filiera a monte · ${f.label}`, activity: f.qty, unit: f.spec.unit, factor: fLite(f.spec.wtt), tco2e: t, quality: f.quality === 'misurato' ? 'misurato' : 'stimato',
      method: 'Quantità consumata × fattore dal pozzo al serbatoio (estrazione, raffinazione, trasporto del combustibile)', formula: f.spec.wttPerUnit && f.spec.wttPerUnit !== 1 ? 'kg × (fattore per litro ÷ densità) ÷ 1.000' : 'quantità × fattore ÷ 1.000', records: f.records, link: { tab: 'clima', id: 'combustibili' } });
  }
  const td = factor(d, 'el.td');
  if (td && grid && kwhGrid > 0) {
    const t = kwhGrid * td.value * grid.value / 1000;
    lines.push({ id: 's3-c3-perdite', scope: 3, cat: 'c3', group: 'wtt', label: 'Perdite di rete dell’elettricità acquistata', activity: kwhGrid * td.value, unit: 'kWh', factor: fLite(grid), tco2e: t, quality: 'stimato',
      method: `kWh prelevati × quota di perdite (${Math.round(td.value * 100)}%) × fattore di rete location-based`, formula: 'kWh di rete × perdite × fattore ÷ 1.000', records: null, link: { tab: 'clima', id: 'elettricita' }, note: `Quota di perdite: ${td.source}.` });
  }
  return { value: lines.reduce((s, l) => s + l.tco2e, 0), lines };
}

/* ---------------- categorie 4 e 9: trasporti ---------------- */
/** Profilo logistico di un lotto: per materia prima, poi per fornitore, poi per provenienza. */
export function profileFor(profiles, lot, ing) {
  let byOrigin = null, bySup = null;
  for (const p of profiles) {
    if (!p) continue;
    if (p.ingId && p.ingId === lot.ingId) return p;
    if (!bySup && p.supplierId && !p.ingId && p.supplierId === lot.supplierId) bySup = p;
    if (!byOrigin && p.origin && !p.ingId && !p.supplierId && p.origin === ing?.origin) byOrigin = p;
  }
  return bySup || byOrigin;
}
/** kg CO₂e per tonnella trasportata lungo le tratte di un profilo: Σ km × fattore del mezzo. */
export function legsKgPerT(d, legs) {
  let kg = 0, km = 0;
  const parts = [];
  for (const l of Array.isArray(legs) ? legs : EMPTY) {
    const k = num(l?.km), f = factor(d, 'tr.' + (l?.mode || 'camion'));
    if (k == null || k <= 0 || !f) continue;
    kg += k * f.value; km += k; parts.push({ mode: l.mode, km: k, factor: f });
  }
  return { kg, km, parts };
}
function cat4and9(d, W, S) {
  const profiles = Array.isArray(d.logisticsProfiles) ? d.logisticsProfiles : EMPTY;
  const ingById = byId(d.ingredients || EMPTY);
  const inbound = new Map();
  let lotsNoProfile = 0, tNoProfile = 0;
  for (const l of d.ingLots || EMPTY) {
    if (!l || typeof l.date !== 'string' || l.date < W.from || l.date > W.to || l.status === 'bloccato') continue;
    const t = num(l.tonnes);
    if (!t || t <= 0) continue;
    const p = profiles.length ? profileFor(profiles, l, ingById[l.ingId]) : null;
    if (!p) { lotsNoProfile++; tNoProfile += t; continue; }
    let g = inbound.get(p.id);
    if (!g) { const lk = legsKgPerT(d, p.legs); g = { profile: p, kgPerT: p.includedInEf ? 0 : lk.kg, km: lk.km, parts: lk.parts, t: 0, tkm: 0, tco2e: 0, lots: 0, included: !!p.includedInEf }; inbound.set(p.id, g); }
    g.t += t; g.lots++; g.tkm += t * g.km;
    g.tco2e += t * g.kgPerT / 1000;
  }
  const inList = [...inbound.values()].sort((a, b) => b.tco2e - a.tco2e);
  const D = customerDistances(d);
  const out = { vettore: { t: 0, tkm: 0, n: 0, est: 0 }, 'ritiro-cliente': { t: 0, tkm: 0, n: 0, est: 0 }, 'flotta-propria': { t: 0, tkm: 0, n: 0, est: 0 } };
  let noKm = 0;
  const modeCache = new Map();
  for (const s of d.shipments || EMPTY) {
    if (!s || typeof s.date !== 'string' || s.date < W.from || s.date > W.to) continue;
    const t = num(s.tonnes);
    if (!t || t <= 0) continue;
    let mode = modeCache.get(s.customerId);
    if (!mode) { mode = deliveryModeOf(d, s.customerId, S); modeCache.set(s.customerId, mode); }
    const g = out[mode] || out['flotta-propria'];
    g.t += t; g.n++;
    const k = D.byCustomer.get(s.customerId);
    if (!k) { noKm += t; continue; }
    g.tkm += t * k.km;
    if (k.estimated) g.est += t;
  }
  const truck = factor(d, 'tr.camion');
  const lines4 = [], lines9 = [];
  const inT = inList.reduce((s, g) => s + g.tco2e, 0);
  if (inList.some(g => !g.included)) lines4.push({ id: 's3-c4-ingresso', scope: 3, cat: 'c4', group: 'trasporti', label: 'Trasporti in ingresso non compresi nel fattore', activity: inList.filter(g => !g.included).reduce((s, g) => s + g.tkm, 0), unit: 't·km',
    factor: null, tco2e: inT, quality: 'stimato', method: 'Tonnellate dei lotti × tratte del profilo logistico (nave, treno, camion, chiatta) × fattore del mezzo, solo per i profili non già compresi nel fattore della materia prima',
    formula: 'Σ lotti t × Σ tratte km × fattore ÷ 1.000', records: inList.reduce((s, g) => s + g.lots, 0), link: { tab: 'clima', id: 'scope3' } });
  const mk = (mode, label, cat, arr) => {
    const g = out[mode];
    if (!(g.t > 0)) return 0;
    const t = truck && g.tkm > 0 ? g.tkm * truck.value / 1000 : 0;
    arr.push({ id: `s3-${cat}-${mode}`, scope: 3, cat, group: 'trasporti', label, activity: g.tkm, unit: 't·km', factor: fLite(truck), tco2e: t, quality: 'stimato',
      method: `Consegne del periodo × distanza stradale stimata (linea d’aria × ${D.roadFactor}) × fattore del camion`, formula: 'Σ consegne t × km × fattore ÷ 1.000', records: g.n, link: { tab: 'clima', id: 'flotta' },
      note: !D.plant ? 'Mancano le coordinate dello stabilimento: distanze non calcolate.' : g.est > 0 ? 'Alcuni clienti senza coordinate: distanza media stimata.' : '' });
    return t;
  };
  const c4out = mk('vettore', 'Consegne ai clienti con vettori pagati dall’azienda', 'c4', lines4);
  const c9 = mk('ritiro-cliente', 'Ritiri dei clienti con mezzi propri', 'c9', lines9);
  return {
    c4: { value: inT + c4out, lines: lines4 }, c9: { value: c9, lines: lines9 },
    logistics: { inbound: inList.map(g => ({ id: g.profile.id, ingId: g.profile.ingId || null, supplierId: g.profile.supplierId || null, origin: g.profile.origin || null, legs: g.parts.map(x => ({ mode: x.mode, km: x.km, factor: x.factor.value })),
      included: g.included, kgPerT: g.kgPerT, t: g.t, tkm: g.tkm, tco2e: g.tco2e, lots: g.lots, note: g.profile.note || '' })), lotsNoProfile, tNoProfile, byMode: out, plant: D.plant, roadFactor: D.roadFactor, avgKm: D.avgKm, noKmT: noKm, truck: fLite(truck) },
  };
}

/* ---------------- categoria 5: rifiuti ---------------- */
/** Fattore dei rifiuti secondo l'operazione dichiarata: R1 e D10 recupero energetico, R2-R13 riciclo, D discarica (prudenziale). */
export function wasteFactorId(w) {
  const op = String(w?.op || '').toUpperCase().replace(/\s+/g, '');
  if (op === 'R1' || op === 'D10') return 'rf.termo';
  if (/^R\d+$/.test(op)) return 'rf.riciclo';
  if (/^D\d+$/.test(op)) return 'rf.discarica';
  return w?.dest === 'recupero' ? 'rf.riciclo' : 'rf.discarica';
}
const WASTE_LABEL = { 'rf.riciclo': 'Rifiuti a riciclo (R2–R13)', 'rf.termo': 'Rifiuti a recupero energetico (R1, D10)', 'rf.discarica': 'Rifiuti a smaltimento (D, ipotesi discarica)' };
function cat5(d, W) {
  const g = new Map();
  for (const w of d.waste || EMPTY) {
    if (!w || typeof w.date !== 'string' || w.date < W.from || w.date > W.to) continue;
    const kg = num(w.kg);
    if (!kg || kg <= 0) continue;
    const id = wasteFactorId(w);
    const x = g.get(id) || { kg: 0, n: 0 };
    x.kg += kg; x.n++;
    g.set(id, x);
  }
  const lines = [];
  for (const [id, x] of g) {
    const f = factor(d, id);
    if (!f) continue;
    lines.push({ id: `s3-c5-${id}`, scope: 3, cat: 'c5', group: 'rifiuti', label: WASTE_LABEL[id] || id, activity: x.kg, unit: 'kg', factor: fLite(f), tco2e: x.kg * f.value / 1000, quality: 'stimato',
      method: 'Registro dei rifiuti: kg per operazione dichiarata × fattore della destinazione; R13 e D15 (deposito) attribuiti alla destinazione più probabile', formula: 'kg × fattore ÷ 1.000', records: x.n, link: { tab: 'rifiuti' } });
  }
  return { value: lines.reduce((s, l) => s + l.tco2e, 0), lines };
}

/* ---------------- categoria 12: fine vita degli imballaggi venduti ---------------- */
function cat12(d, W) {
  const kgT = factor(d, 'pk.sacco.kgt'), eol = factor(d, 'eol.imballaggi');
  if (!kgT || !eol) return { value: 0, lines: [], kg: 0 };
  const prodById = byId(d.products || EMPTY);
  let t = 0, n = 0;
  for (const s of d.shipments || EMPTY) {
    if (!s || typeof s.date !== 'string' || s.date < W.from || s.date > W.to) continue;
    if (!isBagged(prodById[s.productId])) continue;
    const x = num(s.tonnes);
    if (x > 0) { t += x; n++; }
  }
  if (!(t > 0)) return { value: 0, lines: [], kg: 0 };
  const kg = t * kgT.value;
  const v = kg * eol.value / 1000;
  return { value: v, kg, lines: [{ id: 's3-c12-imballaggi', scope: 3, cat: 'c12', group: 'imballaggi', label: 'Fine vita dei sacchi venduti con i prodotti', activity: kg, unit: 'kg', factor: fLite(eol), tco2e: v, quality: 'stimato',
    method: `Prodotti in sacchi consegnati × ${kgT.value} kg/t × fattore di fine vita (scenario medio)`, formula: 't consegnate in sacchi × kg/t × fattore ÷ 1.000', records: n, link: { tab: 'clima', id: 'scope3' } }] };
}

/**
 * Scope 3 del periodo (finestra di mesi W): categorie 1-15 con screening, righe di calcolo, quota FLAG, uso del suolo, logistica.
 * x = {fuels: [{fuel, label, qty, spec, quality, records}], kwhGrid, grid (fattore di rete in uso), S (impostazioni), sector}
 */
export function scope3(d, W, x) {
  const S = x.S || climaSettings(d), sector = x.sector;
  const c1 = cat1(d, W, sector);
  const c3 = cat3(d, x.fuels || EMPTY, x.kwhGrid || 0, x.grid);
  const c49 = cat4and9(d, W, S);
  const c5 = cat5(d, W);
  const c12 = cat12(d, W);
  const in2 = inputsOf(d, W, '2'), in6 = inputsOf(d, W, '6'), in7 = inputsOf(d, W, '7');
  const vals = {
    1: { value: c1.value, lines: c1.lines }, 2: { value: in2.reduce((s, r) => s + r.tco2e, 0), lines: in2.length ? [inputLine('c2', 'Beni strumentali (a valore)', in2, { tab: 'clima', id: 'scope3' })] : [] },
    3: c3, 4: c49.c4, 5: c5,
    6: { value: in6.reduce((s, r) => s + r.tco2e, 0), lines: in6.length ? [inputLine('c6', 'Viaggi di lavoro', in6, { tab: 'clima', id: 'scope3' })] : [] },
    7: { value: in7.reduce((s, r) => s + r.tco2e, 0), lines: in7.length ? [inputLine('c7', 'Pendolarismo dei dipendenti', in7, { tab: 'clima', id: 'scope3' })] : [] },
    9: c49.c9, 12: c12,
  };
  const out = { cats: [], total: 0, lines: [] };
  for (let n = 1; n <= 15; n++) {
    const sc = screeningOf(d, n, S, sector);
    const v = vals[n] || { value: 0, lines: [] };
    const computed = v.value > 0 || v.lines.length > 0;
    const q = {};
    for (const l of v.lines) q[l.quality] = (q[l.quality] || 0) + l.tco2e;
    const quality = Object.entries(q).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const value = sc.included ? v.value : 0;
    out['c' + n] = value;
    out.total += value;
    for (const l of v.lines) out.lines.push({ ...l, excluded: !sc.included });
    out.cats.push({ ...sc, value, computedValue: v.value, computed, quality, lines: v.lines.length,
      method: v.lines[0]?.method || '', status: sc.included && n !== 1 && v.lines.every(l => l.quality === 'stimato') && computed ? 'stimata' : sc.status });
  }
  out.flag = c1.flag;
  out.nonFlag = c1.value - c1.flag;
  out.luc = c1.luc; out.landMgmt = c1.landMgmt; out.landHa = c1.landHa; out.flagMethod = c1.flagMethod;
  out.c1detail = c1;
  out.logistics = c49.logistics;
  out.packagingSoldKg = c12.kg || 0;
  return out;
}
