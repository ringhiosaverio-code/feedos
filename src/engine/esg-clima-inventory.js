/* FeedOS 18 · Clima e GHG (pacchetto WP1): inventario GHG dell'esercizio (GHG Protocol / struttura ISO 14064-1).
 * Finestra: i mesi chiusi del periodo (registerMonths, come energia e acqua, F5); i registri giornalieri (produzione, lotti,
 * consegne, rifiuti, interventi F-gas) si leggono negli stessi mesi interi.
 * Scope 1: GPL del registro dell'energia (sostituito mese per mese dalle righe di GPL di fuelUse), consumi di combustibili per
 *   combustibile e uso (CO₂ + CH₄ e N₂O; CO₂ biogenica a parte), refrigeranti ricaricati × GWP AR6; senza consumi registrati,
 *   stima dal questionario (gas e gasolio dell'anno ripartiti sui mesi) con qualità «stimato».
 * Scope 2: location-based = kWh di rete × fattore di rete; market-based = (kWh di rete − garanzie d'origine − PPA) × mix residuo,
 *   null con il motivo se il mix residuo non è impostato. Il fotovoltaico autoconsumato vale zero in entrambi.
 * Intensità per milione di euro sui RICAVI NETTI del conto economico (F6). Quote di qualità pesate sulle t CO₂e.
 * Funzioni pure, memorizzate per archivio e periodo; nessuna eccezione verso l'esterno, nessun messaggio in console. */
import { registerMonths } from './sustainability.js';
import { pnlFor } from './pnl.js';
import { esgToday, sectorOf, periodByKey } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { carbonPrice } from './esg-piano.js';
import { PACK_CLIMA } from '../data/pack-clima.js';
import { factor, num, climaSettings, gridFactorInUse, fuelSpec, toNatural, refGwp, FUEL_LABEL, USE_LABEL, MOBILE_USES } from './esg-clima-factors.js';
import { scope3 } from './esg-clima-scope3.js';
import { endOfMonth, addMonths, addDays, daysBetween, monthLabel } from '../core/util.js';

const EMPTY = [];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const fLite = f => (f ? { id: f.id, value: f.value, unit: f.unit, source: f.source, year: f.year, status: f.status, overridden: !!f.overridden } : null);
const r6 = v => Math.round(v * 1e6) / 1e6;

/** Finestra dell'inventario: mesi chiusi del periodo e date del primo e dell'ultimo giorno. */
export function windowOf(P) {
  const months = P?.from && P?.to ? registerMonths(P) : [];
  if (!months.length) return { from: P?.from || null, to: P?.to || null, months: [], set: new Set(), empty: true };
  return { from: months[0] + '-01', to: endOfMonth(months[months.length - 1]), months, set: new Set(months), empty: false };
}

/* ---------------- ricavi netti (F6) ---------------- */
const factsCache = new WeakMap();
/** Fatti minimi di vendita (come quelli del conto economico: consegne di prodotti noti, tonnellate × prezzo applicato). */
function miniFacts(d) {
  const sh = Array.isArray(d?.shipments) ? d.shipments : EMPTY;
  let f = factsCache.get(sh);
  if (f && f.products === d.products) return f.facts;
  const prod = new Set((d.products || EMPTY).map(p => p.id));
  const facts = [];
  for (const s of sh) if (s && prod.has(s.productId) && typeof s.date === 'string') { const t = num(s.tonnes) || 0; facts.push({ id: s.id, date: s.date, month: s.date.slice(0, 7), tonnes: t, revenue: t * (num(s.price) || 0) }); }
  factsCache.set(sh, { products: d.products, facts });
  return facts;
}
/** Ricavi netti del conto economico nella finestra: {value, frozen, source}. Con ctx.facts usa i fatti del conto economico. */
export function netRevenue(d, W, ctx) {
  if (W.empty) return { value: null, frozen: false, source: '' };
  try {
    const p = pnlFor(d, ctx?.facts ? ctx : { facts: miniFacts(d) }, { from: W.from, to: W.to });
    const v = num(p?.revenueNet);
    return { value: v, frozen: !!p?.frozen, source: p?.frozen ? 'conto economico, mesi chiusi' : 'conto economico (ricavi netti)' };
  } catch { return { value: null, frozen: false, source: '' }; }
}

/* ---------------- Scope 1 ---------------- */
function fuelLine(spec, fuel, use, qty, quality, records, origin) {
  const co2 = num(spec.co2?.value) || 0, non = num(spec.nonco2?.value) || 0, bio = num(spec.bio?.value) || 0, ncv = num(spec.ncv?.value) || 0;
  const fossil = qty * co2 / 1000, nonco2 = qty * non / 1000;
  const mobile = MOBILE_USES.has(use);
  const lbl = `${FUEL_LABEL[fuel] || fuel} · ${USE_LABEL[use] || use}`;
  return {
    id: `s1-${fuel}-${use}-${quality}`, scope: 1, cat: mobile ? 'mobile' : 'stazionaria', group: mobile ? 'mobile' : 'stationary', fuel, use, label: lbl, activity: qty, unit: spec.unit,
    factor: fLite(spec.co2) || fLite(spec.nonco2), extraFactor: spec.co2 && spec.nonco2 ? fLite(spec.nonco2) : null, tco2e: fossil + nonco2, fossil, nonco2, biogenic: qty * bio / 1000,
    mwh: qty * ncv / 1000, renewable: !!spec.renewable, ets2: !!spec.ets2, quality, records, source: origin,
    method: spec.co2 && spec.nonco2 ? 'Quantità × (fattore di CO₂ + CH₄ e N₂O di combustione)' : spec.co2 ? 'Quantità × fattore di emissione (CO₂e)' : 'Quantità × CH₄ e N₂O di combustione (CO₂ biogenica fuori dagli scope)',
    formula: `${spec.unit} × ${spec.co2 ? 'fattore' : '0'}${spec.nonco2 ? ' + CH₄/N₂O' : ''} ÷ 1.000`, link: { tab: 'clima', id: 'combustibili' },
  };
}
function scope1(d, W, P) {
  const lines = [], fuels = new Map(), warnings = [];
  const fuelRows = (d.fuelUse || EMPTY).filter(r => r && W.set.has(String(r.month || '').slice(0, 7)));
  const gplMonths = new Set(fuelRows.filter(r => r.fuel === 'gpl').map(r => String(r.month).slice(0, 7)));
  const addFuel = (fuel, use, qty, quality, records, origin, spec) => {
    const key = `${fuel}|${use}|${quality}`;
    const g = fuels.get(key) || { fuel, use, quality, qty: 0, records: 0, origin, spec };
    g.qty += qty; g.records += records;
    fuels.set(key, g);
  };
  // GPL del registro dell'energia (mesi senza righe di GPL in fuelUse)
  const gplSpec = fuelSpec(d, 'gpl');
  let gplKg = 0, gplN = 0;
  for (const e of d.energy || EMPTY) {
    if (!e || !W.set.has(e.month) || gplMonths.has(e.month)) continue;
    const kg = num(e.gplKg);
    if (kg > 0) { gplKg += kg; gplN++; }
  }
  if (gplKg > 0 && gplSpec) addFuel('gpl', 'vapore', gplKg, 'misurato', gplN, 'Registro dell’energia (letture del GPL)', gplSpec);
  // consumi registrati
  for (const r of fuelRows) {
    const spec = fuelSpec(d, r.fuel);
    if (!spec) { warnings.push(`Combustibile non riconosciuto: ${r.fuel}`); continue; }
    const q = toNatural(spec, r.qty, r.unit);
    if (q == null) { warnings.push(`${monthLabel(String(r.month).slice(0, 7))}: ${r.qty} ${r.unit || ''} di ${FUEL_LABEL[r.fuel] || r.fuel} non convertibili in ${spec.unit}`); continue; }
    if (q <= 0) continue;
    addFuel(r.fuel, r.use || 'altro', q, r.source === 'stima' ? 'stimato' : 'misurato', 1, 'Registro dei consumi di combustibili', spec);
  }
  // stima dal questionario se nella finestra non ci sono consumi registrati
  let fromSurvey = false;
  if (!fuelRows.length && W.months.length) {
    const a = d.survey || {};
    const share = W.months.length / 12;
    const gas = num(a['en-gas']), diesel = num(a['en-diesel']);
    if (gas > 0) { const sp = fuelSpec(d, 'gas'); if (sp) { addFuel('gas', 'vapore', gas * share, 'stimato', 1, 'Questionario ESG (consumo annuo ripartito sui mesi)', sp); fromSurvey = true; } }
    if (diesel > 0) { const sp = fuelSpec(d, 'gasolio'); if (sp) { addFuel('gasolio', 'carrelli', diesel * share, 'stimato', 1, 'Questionario ESG (consumo annuo ripartito sui mesi)', sp); fromSurvey = true; } }
  }
  const fuelList = [];
  for (const g of fuels.values()) {
    const l = fuelLine(g.spec, g.fuel, g.use, g.qty, g.quality, g.records, g.origin);
    lines.push(l);
    fuelList.push({ fuel: g.fuel, use: g.use, label: FUEL_LABEL[g.fuel] || g.fuel, qty: g.qty, spec: g.spec, quality: g.quality, records: g.records });
  }
  // emissioni fuggitive: ricariche di refrigerante × GWP
  const eqById = new Map((d.fgasEquipment || EMPTY).filter(e => e && e.id).map(e => [e.id, e]));
  const byEq = new Map();
  for (const ev of d.fgasEvents || EMPTY) {
    if (!ev || ev.type !== 'ricarica' || typeof ev.date !== 'string' || ev.date < W.from || ev.date > W.to) continue;
    const kg = num(ev.kg);
    if (!kg || kg <= 0) continue;
    const g = byEq.get(ev.equipmentId) || { kg: 0, n: 0 };
    g.kg += kg; g.n++;
    byEq.set(ev.equipmentId, g);
  }
  for (const [eqId, g] of byEq) {
    const eq = eqById.get(eqId);
    const gwp = eq ? refGwp(d, eq.gas, eq.gwpOverride) : null;
    if (!gwp) { warnings.push(`Ricarica di ${g.kg} kg senza gas o GWP noto (${eq?.name || eqId})`); continue; }
    lines.push({ id: `s1-fgas-${eqId}`, scope: 1, cat: 'fuggitive', group: 'fugitive', label: `Refrigerante ${eq.gas} · ${eq.name}`, activity: g.kg, unit: 'kg', factor: { id: gwp.id || 'gwp', value: gwp.value, unit: 'kg CO₂e/kg', source: gwp.source, year: gwp.year ?? null, status: gwp.status || '', overridden: !!gwp.overridden },
      tco2e: g.kg * gwp.value / 1000, fossil: 0, nonco2: g.kg * gwp.value / 1000, biogenic: 0, mwh: 0, quality: 'misurato', records: g.n, source: 'Registro degli interventi F-gas',
      method: 'Metodo delle ricariche: kg di refrigerante reintegrato × GWP a 100 anni (AR6)', formula: 'kg ricaricati × GWP ÷ 1.000', link: { tab: 'clima', id: 'fgas' } });
  }
  const sumG = g => lines.filter(l => l.group === g).reduce((s, l) => s + l.tco2e, 0);
  const stationary = sumG('stationary'), mobile = sumG('mobile'), fugitive = sumG('fugitive');
  return { stationary, mobile, fugitive, process: 0, total: stationary + mobile + fugitive, lines, fuels: fuelList, fromSurvey, records: fuelRows.length, warnings,
    biogenic: lines.reduce((s, l) => s + (l.biogenic || 0), 0) };
}

/* ---------------- Scope 2 ---------------- */
function scope2(d, W, grid, P) {
  const rows = (d.energy || EMPTY).filter(e => e && W.set.has(e.month));
  const byMonth = new Map();
  for (const e of rows) {
    const m = byMonth.get(e.month) || { month: e.month, grid: 0, pv: 0, exp: 0 };
    m.grid += num(e.kwhGrid) || 0; m.pv += num(e.kwhPV) || 0; m.exp += num(e.kwhExport) || 0;
    byMonth.set(e.month, m);
  }
  const months = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  for (const m of months) m.self = Math.max(0, m.pv - m.exp);
  const kwhGrid = months.reduce((s, m) => s + m.grid, 0), kwhSelf = months.reduce((s, m) => s + m.self, 0);
  const kwhPV = months.reduce((s, m) => s + m.pv, 0), kwhExport = months.reduce((s, m) => s + m.exp, 0);
  const lb = grid ? kwhGrid * grid.value / 1000 : 0;
  // garanzie d'origine e PPA: per anno di contratto, ripartite sui mesi dell'anno in proporzione ai kWh di rete del registro
  const contracts = (d.elecContracts || EMPTY).filter(c => c && num(c.year) != null);
  const yearGrid = {};
  for (const e of d.energy || EMPTY) if (e && typeof e.month === 'string') { const y = +e.month.slice(0, 4); yearGrid[y] = (yearGrid[y] || 0) + (num(e.kwhGrid) || 0); }
  const byYear = {};
  for (const c of contracts) {
    const y = +c.year, g = byYear[y] || (byYear[y] = { goKwh: 0, ppaKwh: 0, residual: null, suppliers: [], countries: new Set() });
    g.goKwh += (num(c.goMWh) || 0) * 1000; g.ppaKwh += (num(c.ppaMWh) || 0) * 1000;
    if (g.residual == null && num(c.residualOverride) != null) g.residual = { value: +c.residualOverride, source: `Contratto ${c.supplier || ''} ${y}`.trim(), year: y };
    if (c.supplier) g.suppliers.push(c.supplier);
    if (c.goCountry) g.countries.add(c.goCountry);
  }
  const rmPack = factor(d, 'el.rm.it');
  let mb = 0, mbMissing = [], instrKwh = 0, mbKwh = 0, resUsed = null;
  for (const m of months) {
    const y = +m.month.slice(0, 4), c = byYear[y];
    const alloc = c && yearGrid[y] > 0 ? Math.min(m.grid, (c.goKwh + c.ppaKwh) * m.grid / yearGrid[y]) : 0;
    instrKwh += alloc;
    const resKwh = Math.max(0, m.grid - alloc);
    mbKwh += resKwh;
    const ef = c?.residual || (rmPack ? { value: rmPack.value, source: rmPack.source, year: rmPack.year, status: rmPack.status, overridden: rmPack.overridden, id: rmPack.id } : null);
    if (resKwh > 0 && !ef) { mbMissing.push(m.month); continue; }
    if (ef) { mb += resKwh * ef.value / 1000; resUsed = resUsed || ef; }
  }
  const missingYears = [...new Set(mbMissing.map(m => m.slice(0, 4)))];
  const reason = mbMissing.length ? `Mix residuo non impostato per ${missingYears.join(', ')}: lo Scope 2 market-based resta non calcolato (si imposta nel registro dei fattori, voce «Mix residuo Italia», dopo averlo verificato sulla tabella AIB).` : null;
  const lines = [];
  if (kwhGrid > 0 && grid) lines.push({ id: 's2-lb', scope: 2, cat: 'lb', group: 'electricity', label: 'Elettricità acquistata dalla rete (location-based)', activity: kwhGrid, unit: 'kWh', factor: fLite(grid), tco2e: lb, quality: 'misurato', records: months.length,
    source: 'Registro dell’energia (letture dei contatori)', method: 'kWh prelevati dalla rete × fattore medio della rete nazionale; fotovoltaico autoconsumato a zero', formula: 'kWh di rete × fattore ÷ 1.000', link: { tab: 'clima', id: 'elettricita' } });
  return {
    lb, mb: reason ? null : mb, reason, kwhGrid, kwhSelf, kwhPV, kwhExport, kwhElec: kwhGrid + kwhSelf, instrKwh, mbKwh, months, lines,
    efLb: fLite(grid), efRm: resUsed ? { value: resUsed.value, source: resUsed.source, year: resUsed.year ?? null, status: resUsed.status || 'contratto', overridden: !!resUsed.overridden } : null,
    contracts: Object.entries(byYear).map(([y, c]) => ({ year: +y, goMWh: c.goKwh / 1000, ppaMWh: c.ppaKwh / 1000, suppliers: c.suppliers, countries: [...c.countries], residual: c.residual })),
  };
}

/* ---------------- inventario ---------------- */
const invCache = new WeakMap();
const keyOf = (P, W) => `${W.months.join(',')}|${P?.key || ''}|${P?.from || ''}|${P?.to || ''}`;

/**
 * Inventario GHG del periodo P (periodo ESG o globale; si usano i mesi chiusi). → {period, window, hasData, s1, scope1, s2: {lb, mb,
 * reason, …}, s3: {c1…c15, total, flag, nonFlag, landHa, cats, …}, biogenicCO2, totals: {lb, mb}, intensity: {perT, perMEurNet,
 * opsPerT, …}, quality: {misurato, stimato, default, calcolato, mancante}, energy: {mwh, mwhEl, mwhRenEl, mwhFuel, mwhRenFuel,
 * renElShare}, lines, drivers, coverage, warnings}. t CO₂e salvo indicazione.
 */
export function inventory(d, P, ctx) {
  if (!d || !P || typeof P !== 'object') return null;
  const W = windowOf(P);
  const k = keyOf(P, W);
  let m = invCache.get(d);
  if (!m) { m = new Map(); invCache.set(d, m); }
  if (m.has(k)) return m.get(k);
  let inv;
  try { inv = computeInventory(d, P, W, ctx); } catch (e) { inv = emptyInventory(P, W, String(e?.message || e)); }
  m.set(k, inv);
  if (m.size > 48) m.delete(m.keys().next().value);
  return inv;
}
function emptyInventory(P, W, error = null) {
  const s3 = { total: 0, flag: 0, nonFlag: 0, luc: 0, landMgmt: 0, landHa: 0, cats: [], lines: [], flagMethod: null };
  for (let n = 1; n <= 15; n++) s3['c' + n] = 0;
  return { period: { key: P?.key || null, from: P?.from || null, to: P?.to || null, label: P?.label || '' }, window: { from: W.from, to: W.to, months: W.months }, hasData: false, error,
    s1: 0, scope1: { stationary: 0, mobile: 0, fugitive: 0, process: 0, total: 0, lines: [], fuels: [], warnings: [] }, s2: { lb: 0, mb: null, reason: null, kwhGrid: 0, kwhSelf: 0, kwhElec: 0, lines: [], months: [] }, s3,
    biogenicCO2: 0, totals: { lb: 0, mb: null }, intensity: { tonnes: 0, revenueNet: null, perT: null, opsPerT: null, opsPerTMb: null, s3PerT: null, perMEurNet: null },
    quality: { misurato: 0, stimato: 0, default: 0, calcolato: 0, mancante: 0 }, energy: { mwh: 0, mwhEl: 0, mwhRenEl: 0, mwhFuel: 0, mwhRenFuel: 0, renElShare: null }, lines: [], drivers: null,
    coverage: { months: W.months.length, energyMonths: 0, productionMonths: 0, fuelMonths: 0, comparable: false }, warnings: error ? [error] : [] };
}
function computeInventory(d, P, W, ctx) {
  if (W.empty) return emptyInventory(P, W);
  const S = climaSettings(d), sector = sectorOf(d);
  const grid = gridFactorInUse(d, P);
  let tonnes = 0;
  const prodMonths = new Set();
  for (const r of d.runs || EMPTY) { if (!r) continue; const mo = String(r.date || '').slice(0, 7); if (!W.set.has(mo)) continue; const t = num(r.tonnes) || 0; tonnes += t; if (t > 0) prodMonths.add(mo); }
  const s1 = scope1(d, W, P);
  const s2 = scope2(d, W, grid, P);
  const s3 = scope3(d, W, { fuels: s1.fuels, kwhGrid: s2.kwhGrid, grid, S, sector });
  const energyMonths = s2.months.length;
  const fuelMonths = new Set((d.fuelUse || EMPTY).filter(r => r && W.set.has(String(r.month || '').slice(0, 7))).map(r => String(r.month).slice(0, 7))).size;
  const hasData = energyMonths > 0 || s1.records > 0 || tonnes > 0 || s3.c1detail.nLots > 0;
  const totals = { lb: s1.total + s2.lb + s3.total, mb: s2.mb == null ? null : s1.total + s2.mb + s3.total };
  const rev = netRevenue(d, W, ctx);
  const ops = s1.total + s2.lb;
  const intensity = {
    tonnes, revenueNet: rev.value, revenueSource: rev.source, revenueFrozen: rev.frozen,
    perT: tonnes > 0 ? totals.lb * 1000 / tonnes : null, opsPerT: tonnes > 0 ? ops * 1000 / tonnes : null,
    opsPerTMb: tonnes > 0 && s2.mb != null ? (s1.total + s2.mb) * 1000 / tonnes : null, s3PerT: tonnes > 0 ? s3.total * 1000 / tonnes : null,
    perMEurNet: rev.value > 0 ? ops / (rev.value / 1e6) : null, totalPerMEurNet: rev.value > 0 ? totals.lb / (rev.value / 1e6) : null,
  };
  const lines = [...s1.lines, ...s2.lines, ...s3.lines];
  const q = { misurato: 0, stimato: 0, default: 0, calcolato: 0, mancante: 0 };
  for (const l of lines) if (!l.excluded && l.tco2e > 0) q[l.quality in q ? l.quality : 'stimato'] += l.tco2e;
  const qt = Object.values(q).reduce((a, b) => a + b, 0);
  const quality = Object.fromEntries(Object.entries(q).map(([k2, v]) => [k2, qt > 0 ? v / qt : 0]));
  quality.tco2e = q;
  const mwhEl = s2.kwhElec / 1000, mwhRenEl = (s2.kwhSelf + Math.min(s2.instrKwh, s2.kwhGrid)) / 1000;
  const fuelLines = s1.lines.filter(l => l.group !== 'fugitive');
  const mwhFuel = fuelLines.reduce((s, l) => s + (l.mwh || 0), 0), mwhRenFuel = fuelLines.filter(l => l.renewable).reduce((s, l) => s + (l.mwh || 0), 0);
  const energy = { mwh: mwhEl + mwhFuel, mwhEl, mwhRenEl, mwhFuel, mwhRenFuel, mwhGrid: s2.kwhGrid / 1000, mwhSelf: s2.kwhSelf / 1000, renElShare: mwhEl > 0 ? mwhRenEl / mwhEl : null,
    renShare: mwhEl + mwhFuel > 0 ? (mwhRenEl + mwhRenFuel) / (mwhEl + mwhFuel) : null };
  const c1 = s3.c1detail;
  const drivers = { T: tonnes, byProduct: c1.byProduct, c1cons: c1.c1cons, c1ing: c1.ingT, c1other: c1.packT + c1.consT, kwhElec: s2.kwhElec, kwhGrid: s2.kwhGrid, efLb: grid ? grid.value : 0,
    s2lb: s2.lb, fuelMwh: mwhFuel, s1fuel: s1.stationary + s1.mobile, fugitive: s1.fugitive, s3other: s3.total - s3.c1 };
  const used = new Set();
  for (const l of lines) if (!l.excluded) { if (l.factor?.id) used.add(l.factor.id); if (l.extraFactor?.id) used.add(l.extraFactor.id); }
  for (const f of s1.fuels) for (const x of [f.spec?.co2, f.spec?.nonco2, f.spec?.ncv, f.spec?.bio]) if (x?.id) used.add(x.id);
  if (s2.efRm && s2.mb != null) used.add('el.rm.it');
  return {
    period: { key: P.key || null, from: P.from, to: P.to, label: P.label || `${W.months.length} mesi` }, window: { from: W.from, to: W.to, months: W.months }, hasData,
    s1: s1.total, scope1: s1, s2, s3, biogenicCO2: s1.biogenic, totals, intensity, quality, energy, lines, drivers, usedFactors: used,
    meta: { boundary: S.boundary, gwp: S.gwp, sector, include: S.include, pack: (activePack(d, 'clima', PACK_CLIMA) || PACK_CLIMA).version, grid: fLite(grid), gridChoice: grid?.choice || null },
    coverage: { months: W.months.length, energyMonths, productionMonths: prodMonths.size, fuelMonths, comparable: W.months.length > 0 && energyMonths / W.months.length >= 0.9 && prodMonths.size / W.months.length >= 0.9 },
    warnings: [...s1.warnings, ...(s3.c1detail.missing.length ? [`Materie prime senza fattore di emissione: ${s3.c1detail.missing.map(x => x.name).join(', ')}`] : [])],
  };
}
/** L'inventario è confrontabile (energia e produzione registrate per almeno il 90% dei mesi)? */
export const comparableInv = inv => !!(inv && inv.hasData && inv.coverage?.comparable);

/* ---------------- F-gas: controlli delle perdite ---------------- */
/** Intervallo dei controlli in mesi secondo il Reg. (UE) 2024/573: 12 da 5 t CO₂e, 6 da 50 t, 3 da 500 t; doppio con il rilevatore. */
export function leakCheckMonths(chargeT, { hermetic = false, leakDetection = false } = {}) {
  const t = num(chargeT);
  if (t == null || t < 5) return { months: null, exempt: true, reason: 'sotto 5 t CO₂e: nessun controllo periodico' };
  if (hermetic && t < 10) return { months: null, exempt: true, reason: 'ermeticamente sigillata sotto 10 t CO₂e: esente' };
  const base = t >= 500 ? 3 : t >= 50 ? 6 : 12;
  return { months: leakDetection ? base * 2 : base, exempt: false, base, reason: `${t >= 500 ? 'da 500' : t >= 50 ? 'da 50' : 'da 5'} t CO₂e: ogni ${base} mesi${leakDetection ? ', raddoppiato con il rilevatore di perdite' : ''}`,
    detectorRequired: t >= 500 && !leakDetection };
}
/**
 * Controlli delle perdite in scadenza (contratto §4): una voce per apparecchiatura in servizio, ordinata per scadenza.
 * → [{equipmentId, name, location, gas, chargeKg, gwp, chargeT, months, exempt, reason, lastCheck, lastRefill, followUp, due,
 *     daysLeft, status: 'scaduto'|'in scadenza'|'in regola'|'da programmare'|'esente', refills12Kg, leakRatePct, detectorRequired}]
 */
export function fgasDue(d, today = esgToday(d)) {
  const eqs = Array.isArray(d?.fgasEquipment) ? d.fgasEquipment : EMPTY;
  const events = Array.isArray(d?.fgasEvents) ? d.fgasEvents : EMPTY;
  const t0 = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}/.test(today) ? today.slice(0, 10) : esgToday(d);
  const out = [];
  for (const e of eqs) {
    if (!e || !e.id) continue;
    const evs = events.filter(x => x && x.equipmentId === e.id && typeof x.date === 'string' && x.date <= t0).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (evs.some(x => x.type === 'dismissione')) continue;
    const gwp = refGwp(d, e.gas, e.gwpOverride), kg = num(e.chargeKg);
    const chargeT = gwp && kg != null ? kg * gwp.value / 1000 : null;
    const rule = chargeT == null ? { months: null, exempt: false, reason: 'carica o gas mancanti: impossibile stabilire la frequenza' } : leakCheckMonths(chargeT, { hermetic: !!e.hermetic, leakDetection: !!e.leakDetection });
    const lastCheck = [...evs].reverse().find(x => x.type === 'controllo')?.date || null;
    const lastRefill = [...evs].reverse().find(x => x.type === 'ricarica')?.date || null;
    const start = lastCheck || evs.find(x => x.type === 'installazione')?.date || e.installedAt || null;
    let due = null, followUp = false;
    if (rule.months) due = start ? addMonths(start, rule.months) : t0;
    // dopo una ricarica per perdita: verifica della riparazione entro un mese
    if (rule.months && lastRefill && (!lastCheck || lastRefill > lastCheck)) { const f = addMonths(lastRefill, 1); if (!due || f < due) { due = f; followUp = true; } }
    const daysLeft = due ? daysBetween(t0, due) : null;
    const status = rule.exempt ? 'esente' : !rule.months ? 'da verificare' : !start && !lastRefill ? 'da programmare' : daysLeft < 0 ? 'scaduto' : daysLeft <= 30 ? 'in scadenza' : 'in regola';
    const from12 = addDays(t0, -365);
    const refills12Kg = evs.filter(x => x.type === 'ricarica' && x.date > from12).reduce((s, x) => s + (num(x.kg) || 0), 0);
    out.push({ equipmentId: e.id, name: e.name || e.id, location: e.location || '', gas: e.gas || '', chargeKg: kg, gwp: gwp?.value ?? null, gwpSource: gwp?.source || '', chargeT, months: rule.months, exempt: !!rule.exempt,
      reason: followUp ? 'verifica della riparazione entro un mese dalla ricarica' : rule.reason, lastCheck, lastRefill, followUp, due, daysLeft, status, refills12Kg,
      leakRatePct: kg > 0 ? refills12Kg / kg * 100 : null, detectorRequired: !!rule.detectorRequired, hermetic: !!e.hermetic, leakDetection: !!e.leakDetection, fgasDbRef: e.fgasDbRef || '' });
  }
  const ord = x => (x.due ? x.due : '9999');
  return out.sort((a, b) => (ord(a) < ord(b) ? -1 : ord(a) > ord(b) ? 1 : String(a.name).localeCompare(String(b.name), 'it')));
}

/* ---------------- ETS2 ---------------- */
/**
 * Esposizione all'ETS2 dal 2028 (Dir. (UE) 2023/959): CO₂ fossile di gas, GPL, gasolio e benzina × prezzi (di base 45, 60, 100 €/t)
 * e prezzo interno del carbonio (pacchetto piano). Le caldaie sotto 20 MWth si assumono fuori dall'ETS1. Valori annui.
 */
export function ets2Exposure(d, P, prices) {
  const inv = inventory(d, P);
  const S = climaSettings(d);
  const ps = (Array.isArray(prices) && prices.length ? prices : Array.isArray(S.ets2Prices) ? S.ets2Prices : [45, 60, 100]).map(num).filter(x => x != null && x >= 0);
  const byFuel = {};
  for (const l of inv?.scope1?.lines || EMPTY) if (l.ets2 && l.fossil > 0) byFuel[l.fuel] = (byFuel[l.fuel] || 0) + l.fossil;
  const tCO2 = Object.values(byFuel).reduce((a, b) => a + b, 0);
  const n = inv?.window?.months?.length || 0;
  const annual = n ? tCO2 * 12 / n : 0;
  const tAnnual = n && inv?.intensity?.tonnes ? inv.intensity.tonnes * 12 / n : null;
  const row = price => ({ price, cost: annual * price, perT: tAnnual ? annual * price / tAnnual : null });
  let internal = null;
  try { internal = row(carbonPrice(d)); } catch { internal = null; }
  return { start: num(S.ets2Start) || 2028, tCO2, annualTCO2: annual, byFuel, rows: ps.map(row), internal, months: n,
    note: 'Stima: il costo arriva attraverso il prezzo dei combustibili dal 2028; caldaie sotto 20 MWth assunte fuori dall’ETS1; i biocarburanti sostenibili (HVO, biometano) hanno fattore zero.' };
}

/* ---------------- anno base e ricalcolo ---------------- */
/**
 * Controllo dell'anno base: base = fotografia congelata {totals, include, gwp, boundary, pack, grid}, cur = inventario dello stesso
 * periodo ricalcolato oggi. Ricalcolo necessario quando la differenza sul totale (cambi strutturali, di metodo o correzioni) arriva
 * alla soglia (di base 5%). → {needed, deltaPct, delta, threshold, reasons: [testo], changes}
 */
export function baseYearCheck(d, cur, base) {
  const S = climaSettings(d);
  const threshold = num(S.recalcThresholdPct) ?? 5;
  if (!isObj(base) || !isObj(base.totals) || !cur) return { needed: false, deltaPct: null, delta: null, threshold, reasons: [], changes: [] };
  const b = num(base.totals.lb ?? base.totals.total), c = cur.totals?.lb ?? null;
  const delta = b != null && c != null ? c - b : null;
  const deltaPct = delta != null && b > 0 ? delta / b * 100 : null;
  const changes = [];
  if (base.gwp && base.gwp !== cur.meta?.gwp) changes.push(`GWP: ${base.gwp} → ${cur.meta?.gwp}`);
  if (base.boundary && base.boundary !== cur.meta?.boundary) changes.push(`confini: ${base.boundary} → ${cur.meta?.boundary}`);
  if (isObj(base.include)) for (const [k, v] of Object.entries(cur.meta?.include || {})) if (!!base.include[k] !== !!v) changes.push(`categoria ${k.slice(1)} ${v ? 'aggiunta' : 'tolta'}`);
  if (base.pack && base.pack !== cur.meta?.pack) changes.push(`pacchetto dei fattori ${base.pack} → ${cur.meta?.pack}`);
  if (base.grid?.value != null && cur.meta?.grid?.value != null && Math.abs(base.grid.value - cur.meta.grid.value) > 1e-9) changes.push(`fattore di rete ${base.grid.value} → ${cur.meta.grid.value}`);
  const needed = deltaPct != null && Math.abs(deltaPct) >= threshold;
  const reasons = [];
  if (deltaPct != null) reasons.push(`Il totale dell’anno base ricalcolato oggi differisce del ${Math.abs(deltaPct).toFixed(1).replace('.', ',')}% dalla fotografia congelata (soglia ${String(threshold).replace('.', ',')}%).`);
  if (changes.length) reasons.push(`Cambiamenti rilevati: ${changes.join('; ')}.`);
  else if (deltaPct != null && Math.abs(deltaPct) > 0.05) reasons.push('Nessun cambio di metodo: la differenza viene da correzioni o integrazioni dei dati dell’anno base.');
  return { needed, deltaPct, delta, threshold, reasons, changes };
}
/** Stato dell'anno base dalle impostazioni: {set, key, period, frozen, snapshot, inv, check}. */
export function baseYearStatus(d) {
  const S = climaSettings(d);
  if (!S.baseYearKey) return { set: false, key: null, period: null, frozen: false, snapshot: null, inv: null, check: null };
  const BP = periodByKey(d, S.baseYearKey);
  if (!BP) return { set: false, key: S.baseYearKey, period: null, frozen: false, snapshot: null, inv: null, check: null, invalid: true };
  const inv = inventory(d, BP);
  const snap = isObj(S.baseSnapshot) && S.baseSnapshot.key === S.baseYearKey ? S.baseSnapshot : null;
  return { set: true, key: S.baseYearKey, period: BP, frozen: !!snap, snapshot: snap, inv, check: snap ? baseYearCheck(d, inv, snap) : null };
}
/** Fotografia dell'anno base da congelare (settings.esg18.clima.baseSnapshot). */
export function baseSnapshotOf(d, key, { at = '', by = '' } = {}) {
  const BP = periodByKey(d, key);
  const inv = BP ? inventory(d, BP) : null;
  if (!inv || !inv.hasData) return null;
  return { key, at, by, totals: { s1: r6(inv.s1), s2lb: r6(inv.s2.lb), s2mb: inv.s2.mb == null ? null : r6(inv.s2.mb), s3: r6(inv.s3.total), lb: r6(inv.totals.lb), tonnes: r6(inv.intensity.tonnes) },
    include: { ...inv.meta.include }, gwp: inv.meta.gwp, boundary: inv.meta.boundary, pack: inv.meta.pack, grid: inv.meta.grid ? { id: inv.meta.grid.id, value: inv.meta.grid.value } : null };
}

/* ---------------- ponte delle emissioni: «cosa è cambiato e perché» ---------------- */
const EPS = 1e-12;
const Lm = (a, b) => { const x = Math.max(EPS, a), y = Math.max(EPS, b); return Math.abs(x - y) < 1e-12 * Math.max(1, x) ? x : (x - y) / (Math.log(x) - Math.log(y)); };
const lnr = (b, a) => Math.log(Math.max(EPS, b) / Math.max(EPS, a));
/** Effetti LMDI di V = Π fattori: {nome: L(VB, VA) · ln(xB/xA)}; la somma è VB − VA (il resto, per gli zeri, va all'ultimo fattore). */
function lmdi(fa, fb) {
  const names = Object.keys(fa);
  const VA = names.reduce((p, k) => p * Math.max(EPS, fa[k]), 1), VB = names.reduce((p, k) => p * Math.max(EPS, fb[k]), 1);
  const w = Lm(VB, VA);
  const out = {};
  for (const k of names) out[k] = w * lnr(fb[k], fa[k]);
  return out;
}
export const BRIDGE_STEPS = [
  ['volume', 'Volume prodotto'], ['mix', 'Mix dei prodotti'], ['formule', 'Formule e fattori delle materie prime'], ['scorte', 'Acquisti e scorte'],
  ['elettricita', 'Elettricità per tonnellata'], ['fotovoltaico', 'Quota di fotovoltaico'], ['rete', 'Fattore di rete'], ['termica', 'Combustibili per tonnellata'],
  ['combustibile', 'Cambio di combustibile'], ['refrigeranti', 'Perdite di refrigerante'], ['altre', 'Logistica e altre categorie'],
];
/**
 * Ponte tra due inventari A (prima) e B (dopo) sul totale location-based: passi che sommano esattamente alla differenza.
 * Scomposizione LMDI per blocchi: materie prime consumate (volume × mix × intensità per prodotto) più acquisti meno consumi,
 * elettricità (volume × kWh/t × quota di rete × fattore), combustibili (volume × MWh/t × t CO₂e/MWh), refrigeranti, altre categorie.
 * → {start, end, delta, steps: [{id, label, value}], check, perT: {a, b}}
 */
export function ghgBridge(A, B) {
  if (!A?.drivers || !B?.drivers) return null;
  const a = A.drivers, b = B.drivers;
  const s = Object.fromEntries(BRIDGE_STEPS.map(([id]) => [id, 0]));
  const TA = Math.max(EPS, a.T), TB = Math.max(EPS, b.T);
  // materie prime consumate, per prodotto (un prodotto presente in un solo periodo: intensità dell'altro periodo)
  const ids = new Set([...Object.keys(a.byProduct || {}), ...Object.keys(b.byProduct || {})]);
  for (const id of ids) {
    const pa = a.byProduct?.[id] || { t: 0, c1: 0 }, pb = b.byProduct?.[id] || { t: 0, c1: 0 };
    if (!(pa.c1 > 0) && !(pb.c1 > 0)) continue;
    const ia = pa.t > 0 ? pa.c1 / pa.t : pb.c1 / Math.max(EPS, pb.t), ib = pb.t > 0 ? pb.c1 / pb.t : ia;
    const e = lmdi({ T: TA, w: pa.t / TA, i: ia }, { T: TB, w: pb.t / TB, i: ib });
    s.volume += e.T; s.mix += e.w; s.formule += e.i;
    s.formule += (pb.c1 - pa.c1) - (e.T + e.w + e.i); // resto numerico
  }
  s.scorte += (b.c1ing - b.c1cons) - (a.c1ing - a.c1cons);
  // elettricità di rete (location-based)
  if (a.s2lb > 0 || b.s2lb > 0) {
    // V = T × kWh/t × quota di rete × fattore in t CO₂ per kWh = t CO₂ (stessa unità di s2lb)
    const fa = { T: TA, e: a.kwhElec / TA, g: a.kwhElec > 0 ? a.kwhGrid / a.kwhElec : 0, f: a.efLb / 1000 }, fb = { T: TB, e: b.kwhElec / TB, g: b.kwhElec > 0 ? b.kwhGrid / b.kwhElec : 0, f: b.efLb / 1000 };
    const e = lmdi(fa, fb);
    s.volume += e.T; s.elettricita += e.e; s.fotovoltaico += e.g; s.rete += e.f;
    s.rete += (b.s2lb - a.s2lb) - (e.T + e.e + e.g + e.f);
  }
  // combustibili (stazionari e mobili)
  if (a.s1fuel > 0 || b.s1fuel > 0) {
    const fa = { T: TA, q: a.fuelMwh / TA, m: a.fuelMwh > 0 ? a.s1fuel / a.fuelMwh : 0 }, fb = { T: TB, q: b.fuelMwh / TB, m: b.fuelMwh > 0 ? b.s1fuel / b.fuelMwh : 0 };
    const e = lmdi(fa, fb);
    s.volume += e.T; s.termica += e.q; s.combustibile += e.m;
    s.combustibile += (b.s1fuel - a.s1fuel) - (e.T + e.q + e.m);
  }
  s.refrigeranti += b.fugitive - a.fugitive;
  // altre categorie dello Scope 3 e parti di c1 diverse dalle materie prime
  const oa = a.s3other + a.c1other, ob = b.s3other + b.c1other;
  if (oa > 0 || ob > 0) {
    const e = lmdi({ T: TA, o: oa / TA }, { T: TB, o: ob / TB });
    s.volume += e.T; s.altre += e.o;
    s.altre += (ob - oa) - (e.T + e.o);
  }
  const start = A.totals.lb, end = B.totals.lb, delta = end - start;
  let sum = Object.values(s).reduce((x, y) => x + y, 0);
  s.altre += delta - sum; // chiusura esatta (arrotondamenti)
  sum = Object.values(s).reduce((x, y) => x + y, 0);
  const steps = BRIDGE_STEPS.map(([id, label]) => ({ id, label, value: s[id] }));
  return { start, end, delta, steps, check: Math.abs(sum - delta) < 1e-6 * Math.max(1, Math.abs(start), Math.abs(end)), perT: { a: A.intensity.perT, b: B.intensity.perT }, opsPerT: { a: A.intensity.opsPerT, b: B.intensity.opsPerT } };
}
/** Metà di un periodo di mesi interi: {from, to, key, label}. */
function halfOf(months, first) {
  const h = Math.floor(months.length / 2);
  const ms = first ? months.slice(0, h) : months.slice(h);
  if (!ms.length) return null;
  return { from: ms[0] + '-01', to: endOfMonth(ms[ms.length - 1]), key: `mesi-${ms[0]}-${ms[ms.length - 1]}`, label: `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}` };
}
/**
 * Ponte per la pagina e per il report: con l'esercizio precedente se è confrontabile, altrimenti tra le due metà del periodo.
 * mode: 'auto' | 'precedente' | 'semestri'. → {mode, A: {period, inv}, B: {period, inv}, bridge, note}
 */
export function bridgeFor(d, P, prev, mode = 'auto') {
  const cur = inventory(d, P);
  if (!cur?.hasData) return null;
  const pinv = prev ? inventory(d, prev) : null;
  const usePrev = mode === 'precedente' ? !!pinv?.hasData : mode === 'semestri' ? false : comparableInv(pinv);
  if (usePrev) return { mode: 'precedente', A: { period: prev, inv: pinv }, B: { period: P, inv: cur }, bridge: ghgBridge(pinv, cur), note: comparableInv(pinv) ? '' : 'L’esercizio precedente non ha dati per tutti i mesi: confronto indicativo.' };
  const months = cur.window.months;
  const h1 = halfOf(months, true), h2 = halfOf(months, false);
  if (!h1 || !h2) return null;
  const A = inventory(d, h1), B = inventory(d, h2);
  return { mode: 'semestri', A: { period: h1, inv: A }, B: { period: h2, inv: B }, bridge: ghgBridge(A, B),
    note: prev && !comparableInv(pinv) ? `L’esercizio precedente (${prev.label}) non ha dati confrontabili: il ponte confronta le due metà dell’esercizio.` : 'Confronto tra le due metà dell’esercizio.' };
}
