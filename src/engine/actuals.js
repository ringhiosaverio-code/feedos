/* FeedOS 17 · Fonte economica unica: un fatto per spedizione al costo EFFETTIVO.
 * Materie prime = lots.comp × prezzo dei lotti MP usati; energia = consumi misurati del lotto (runs) ai prezzi del mese;
 * trasformazione variabile/fissa, imballo e logistica standard del prodotto; listino alla data; provvigione dell'agente
 * della spedizione; onere figurativo della dilazione. Tutto puro (usabile nei test in node). */
import { byId, sum, addDays, daysBetween, monthOf, monthsIn, monthFraction, todayLocal } from '../core/util.js';
import { productCost } from './costing.js';
import { requirements } from './mrp.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];

/** Prezzi dell'energia validi nel mese: ultima voce di settings.finance.energyPrices con from ≤ mese-01, altrimenti settings.energy. */
export function energyPriceAt(settings, month) {
  const base = settings?.energy || {}, day = String(month).slice(0, 7) + '-01';
  let best = null;
  for (const e of settings?.finance?.energyPrices || EMPTY) if (e?.from && e.from <= day && (!best || e.from >= best.from)) best = e;
  return { kwhPrice: n0(has(best?.kwhPrice) ? best.kwhPrice : base.kwhPrice), gplPrice: n0(has(best?.gplPrice) ? best.gplPrice : base.gplPrice) };
}

/** Listino €/t del prodotto alla data: versione di priceLists valida (validFrom ≤ data ≤ validTo) più recente, altrimenti product.listPrice. */
export function listAt(priceLists, product, date) {
  let best = null;
  for (const r of priceLists || EMPTY) {
    if (r.productId !== product?.id || !r.validFrom || r.validFrom > date || (r.validTo && date > r.validTo)) continue;
    if (!best || r.validFrom >= best.validFrom) best = r;
  }
  return best ? n0(best.price) : n0(product?.listPrice);
}

/** Indici per id (stessa forma di derived.idx). */
export function makeIndex(d) {
  return {
    ing: byId(d.ingredients || EMPTY), prod: byId(d.products || EMPTY), form: byId(d.formulas || EMPTY), spec: byId(d.specs || EMPTY), line: byId(d.lines || EMPTY),
    cust: byId(d.customers || EMPTY), agent: byId(d.agents || EMPTY), lot: byId(d.lots || EMPTY), ingLot: byId(d.ingLots || EMPTY), run: byId(d.runs || EMPTY),
    runByLot: Object.fromEntries((d.runs || EMPTY).map(r => [r.lotId, r])),
  };
}

/** Costo pieno di OGGI per prodotto (costing.productCost): il riferimento «a costi di oggi» e il ripiego dei lotti senza composizione. */
export function costsOf(d, ix = makeIndex(d)) {
  const out = {};
  for (const p of d.products || EMPTY) out[p.id] = productCost(p, ix.form[p.formulaId], ix.ing, ix.line[p.lineId], d.settings?.energy);
  return out;
}

/** Tonnellate consegnate per prodotto negli ultimi 365 giorni (come signals.annualVolumes). */
export function volumesOf(d, today) {
  const from = addDays(today, -365), v = {};
  for (const s of d.shipments || EMPTY) if (s.date > from) v[s.productId] = (v[s.productId] || 0) + s.tonnes;
  return v;
}

/**
 * Costo unitario effettivo di un lotto di prodotto (€/t).
 * rawT = Σ comp (kg/1000 × prezzo del lotto MP) / t del lotto; senza composizione o con un lotto MP mancante: costo di oggi (actual false).
 * energyT = (kWh × €/kWh + kg GPL × €/kg) / t della lavorazione, ai prezzi del suo mese; senza misura: standard della linea.
 */
export function lotUnitCost(lot, ix, settings, costsToday = {}) {
  const p = ix.prod[lot?.productId];
  if (!p) return { rawT: 0, shrinkT: 0, energyT: 0, varConvT: 0, fixConvT: 0, packT: 0, actual: false, rawActual: false, energyActual: false };
  // materie prime
  let rawT = null;
  const comp = lot.comp || EMPTY, t = n0(lot.tonnes);
  if (comp.length && t > 0) {
    let eur = 0;
    for (const c of comp) {
      const il = ix.ingLot[c.l];
      if (!il || !has(il.price)) { eur = null; break; }
      eur += n0(c.kg) / 1000 * +il.price;
    }
    if (eur != null) rawT = eur / t;
  }
  const rawActual = rawT != null;
  if (!rawActual) rawT = n0(costsToday[p.id]?.raw);
  const s = n0(p.shrinkPct) / 100;
  const shrinkT = s > 0 && s < 1 ? rawT * s / (1 - s) : 0;
  // energia
  const run = ix.run[lot.runId] || ix.runByLot[lot.id];
  const line = ix.line[run?.lineId] || ix.line[p.lineId];
  let energyT, energyActual = false;
  if (run && n0(run.tonnes) > 0 && has(run.kwh)) {
    const pr = energyPriceAt(settings, monthOf(run.date));
    const gpl = has(run.gplKg) ? +run.gplKg : n0(line?.gplKgPerT) * run.tonnes;
    energyT = (+run.kwh * pr.kwhPrice + gpl * pr.gplPrice) / run.tonnes;
    energyActual = !run.estimated?.kwh;
  } else {
    const pr = energyPriceAt(settings, monthOf(run?.date || lot.date || ''));
    energyT = n0(line?.kwhPerT) * pr.kwhPrice + n0(line?.gplKgPerT) * pr.gplPrice;
  }
  // trasformazione (variabile + fissa), imballo
  const proc = n0(p.processCost);
  const varConvT = has(p.varProcessCost) ? +p.varProcessCost : proc;
  return { rawT, shrinkT, energyT, varConvT, fixConvT: proc - varConvT, packT: n0(p.packCost), actual: rawActual && energyActual, rawActual, energyActual };
}

/** Campi sommabili di un fatto (stesso ordine nei totali). */
export const FACT_SUMS = ['tonnes', 'revenue', 'listRevenue', 'discount', 'raw', 'shrink', 'energy', 'varConv', 'pack', 'fixConv', 'logistics', 'commission', 'finCost', 'mc1', 'mc2', 'fullCost', 'marginFull', 'replVar'];

/**
 * Un fatto per spedizione con prodotto noto. mc1 = ricavi − costi variabili industriali; mc2 = mc1 − logistica − provvigioni;
 * marginFull = ricavi − costo pieno − provvigioni; replVar = costo variabile ai prezzi di oggi (per l'«effetto scorte»).
 */
export function shipmentFacts(d, { ix = makeIndex(d), costsToday = costsOf(d, ix) } = {}) {
  const st = d.settings || {}, fin = st.finance || {};
  const vat = has(fin.vatPct) ? +fin.vatPct : 10, rate = has(fin.rate) ? +fin.rate : 5;
  const plBy = {};
  for (const r of d.priceLists || EMPTY) (plBy[r.productId] ||= []).push(r);
  const unit = new Map();
  const out = [];
  for (const s of d.shipments || EMPTY) {
    const p = ix.prod[s.productId];
    if (!p) continue;
    const lot = ix.lot[s.lotId];
    const key = lot ? lot.id : `~${p.id}|${monthOf(s.date)}`; // senza lotto: costo di oggi ed energia standard del mese
    let u = unit.get(key);
    if (!u) { u = lotUnitCost(lot || { productId: p.id, comp: EMPTY, tonnes: 0, date: s.date }, ix, st, costsToday); unit.set(key, u); }
    const t = n0(s.tonnes), revenue = t * n0(s.price);
    const listRevenue = t * listAt(plBy[p.id], p, s.date);
    const cust = ix.cust[s.customerId];
    const agentId = s.agentId || cust?.agentId || null;
    const raw = t * u.rawT, shrink = t * u.shrinkT, energy = t * u.energyT, varConv = t * u.varConvT, pack = t * u.packT, fixConv = t * u.fixConvT;
    const logistics = t * n0(p.logisticsCost);
    const commission = revenue * n0(ix.agent[agentId]?.commissionPct) / 100;
    const days = has(cust?.terms?.days) ? +cust.terms.days : has(cust?.paymentDays) ? +cust.paymentDays : 60;
    const finCost = revenue * (1 + vat / 100) * rate / 100 * (days + 15) / 365;
    const mc1 = revenue - raw - shrink - energy - varConv - pack;
    const mc2 = mc1 - logistics - commission;
    const fullCost = raw + shrink + energy + varConv + fixConv + pack + logistics;
    const ct = costsToday[p.id] || {};
    out.push({
      id: s.id, date: s.date, month: monthOf(s.date), customerId: s.customerId, productId: p.id, agentId, lotId: s.lotId ?? null, species: p.species ?? null,
      tonnes: t, revenue, listRevenue, discount: listRevenue - revenue,
      raw, shrink, energy, varConv, pack, fixConv, logistics, commission, finCost,
      mc1, mc2, fullCost, marginFull: revenue - fullCost - commission,
      replVar: t * (n0(ct.raw) + n0(ct.shrink) + n0(ct.energy) + u.varConvT + u.packT),
      actual: u.actual,
    });
  }
  return out;
}

// primo mese con fatti (memorizzato per array)
const firstMonthCache = new WeakMap();
function firstFactMonth(facts) {
  if (firstMonthCache.has(facts)) return firstMonthCache.get(facts);
  let m = null;
  for (const f of facts) if (f.month && (m == null || f.month < m)) m = f.month;
  firstMonthCache.set(facts, m);
  return m;
}

/** Riga dello storico mensile (salesHistory) come fatto: costi mancanti = 0, margini con le stesse formule. */
function historyFact(h) {
  const revenue = n0(h.revenue), listRevenue = has(h.listRevenue) ? +h.listRevenue : revenue;
  const raw = n0(h.raw), shrink = n0(h.shrink), energy = n0(h.energy), varConv = n0(h.varConv), pack = n0(h.pack), fixConv = n0(h.fixConv);
  const logistics = n0(h.logistics), commission = n0(h.commission);
  const mc1 = revenue - raw - shrink - energy - varConv - pack, fullCost = raw + shrink + energy + varConv + fixConv + pack + logistics;
  return {
    id: h.id, date: h.date || h.month + '-01', month: String(h.month).slice(0, 7), customerId: h.customerId ?? null, productId: h.productId ?? null, agentId: h.agentId ?? null,
    lotId: null, species: h.species ?? null, source: 'storico', n: has(h.n) ? +h.n : 1,
    tonnes: n0(h.tonnes), revenue, listRevenue, discount: has(h.discount) ? +h.discount : listRevenue - revenue,
    raw, shrink, energy, varConv, pack, fixConv, logistics, commission, finCost: n0(h.finCost),
    mc1, mc2: mc1 - logistics - commission, fullCost, marginFull: revenue - fullCost - commission,
    replVar: has(h.replVar) ? +h.replVar : raw + shrink + energy + varConv + pack, // senza dato: nessun effetto scorte
    actual: false,
  };
}

const zero = () => { const o = {}; for (const k of FACT_SUMS) o[k] = 0; o.n = 0; return o; };
function addTo(o, f) { for (const k of FACT_SUMS) o[k] += f[k] || 0; o.n += f.n ?? 1; }

/**
 * Somme dei fatti nel periodo P (P.from ≤ data ≤ P.to), raggruppate per keys (es. ['productId'] o ['month', 'customerId']).
 * Lo storico mensile entra solo per i mesi interi dentro P e precedenti al primo mese con fatti (source 'storico').
 * → {rows: [{...chiavi, ...somme, n}], total: {...somme, n}, historyMonths}
 */
export function aggregateFacts(facts, salesHistory, P, keys = []) {
  const groups = new Map(), total = zero();
  const take = f => {
    addTo(total, f);
    if (!keys.length) return;
    const k = keys.map(x => f[x] ?? '').join('\u0001');
    let g = groups.get(k);
    if (!g) { g = { ...Object.fromEntries(keys.map(x => [x, f[x] ?? null])), ...zero() }; groups.set(k, g); }
    addTo(g, f);
  };
  for (const f of facts || EMPTY) if (f.date >= P.from && f.date <= P.to) take(f);
  const historyMonths = new Set();
  if (salesHistory?.length) {
    const first = firstFactMonth(facts || EMPTY);
    for (const h of salesHistory) {
      const m = String(h.month || '').slice(0, 7);
      if (!m || (first && m >= first) || monthFraction(m, P) < 1) continue;
      take(historyFact(h)); historyMonths.add(m);
    }
  }
  const rows = [...groups.values()].sort((a, b) => { for (const x of keys) { const u = String(a[x] ?? ''), v = String(b[x] ?? ''); if (u !== v) return u < v ? -1 : 1; } return 0; });
  return { rows, total, historyMonths: [...historyMonths].sort() };
}

/** Primo giorno con dati di vendita: primo mese dello storico o prima spedizione. */
export function dataStart(facts, salesHistory) {
  let s = null;
  for (const f of facts || EMPTY) if (f.date && (s == null || f.date < s)) s = f.date;
  for (const h of salesHistory || EMPTY) { const d = String(h.month || '').slice(0, 7); if (d && (s == null || d + '-01' < s)) s = d + '-01'; }
  return s;
}

/** Quota dei giorni di P coperti da dati (dal giorno start in poi): 0…1; sotto 0,9 il confronto non è omogeneo. */
export function coverage(P, start) {
  if (!P?.from || !P?.to) return null;
  if (!start) return 0;
  const days = P.days || daysBetween(P.from, P.to) + 1;
  const lo = start > P.from ? start : P.from;
  return lo > P.to ? 0 : (daysBetween(lo, P.to) + 1) / days;
}

/** Confrontabilità di un saldo alla data (crediti, magazzino, debiti): il saldo è completo solo se sono registrati tutti i movimenti
 * che a quella data possono essere ancora aperti, cioè se i dati cominciano almeno `horizon` giorni prima. 0…1; senza dati 0. */
export function balanceCoverage(date, start, horizon) {
  if (!date) return null;
  if (!start || start > date) return 0;
  return horizon > 0 ? Math.min(1, daysBetween(start, date) / horizon) : 1;
}

/**
 * Costi fissi del periodo: Σ righe del mese × quota del mese dentro P.
 * Un mese senza consuntivo usa il budget (openMonthFallback 'budget'), altrimenti la media degli ultimi 12 mesi
 * di consuntivo, ed è elencato in estimatedMonths; senza alcun dato resta a zero (missingMonths).
 */
export function fixedFor(fixedCosts, costCenters, P, { kind = 'consuntivo', openMonthFallback = 'budget' } = {}) {
  const cc = byId(costCenters || EMPTY);
  const byKind = {};
  for (const r of fixedCosts || EMPTY) { const m = String(r.month || '').slice(0, 7); if (!m) continue; ((byKind[r.kind || 'consuntivo'] ||= {})[m] ||= []).push(r); }
  const prim = byKind[kind] || {}, bud = byKind.budget || {}, cons = byKind.consuntivo || {};
  const consMonths = Object.keys(cons).sort();
  const meanBefore = m => { // media per centro degli ultimi 12 mesi di consuntivo (prima di m, se ce ne sono)
    const before = consMonths.filter(x => x < m), use = (before.length ? before : consMonths).slice(-12);
    const acc = {};
    for (const x of use) for (const r of cons[x]) acc[r.centerId] = (acc[r.centerId] || 0) + n0(r.amount) / use.length;
    return Object.entries(acc).map(([centerId, amount]) => ({ centerId, amount }));
  };
  const out = { total: 0, cash: 0, nonCash: 0, byCenter: {}, byGroup: { stabilimento: 0, struttura: 0, commerciale: 0 }, estimatedMonths: [], missingMonths: [], months: [] };
  for (const m of monthsIn(P)) {
    const f = monthFraction(m, P);
    if (f <= 0) continue;
    let rows = prim[m], source = kind;
    if (!rows?.length && kind === 'consuntivo' && openMonthFallback) {
      if (openMonthFallback === 'budget' && bud[m]?.length) { rows = bud[m]; source = 'budget'; }
      else if (consMonths.length) { rows = meanBefore(m); source = 'media'; }
      if (rows?.length) out.estimatedMonths.push(m);
    }
    if (!rows?.length) { out.missingMonths.push(m); out.months.push({ month: m, fraction: f, source: null, amount: 0 }); continue; }
    let mAmt = 0;
    for (const r of rows) {
      const v = n0(r.amount) * f, c = cc[r.centerId];
      out.byCenter[r.centerId] = (out.byCenter[r.centerId] || 0) + v;
      if (c?.cash === false) out.nonCash += v; else out.cash += v;
      const g = c?.group || 'struttura';
      out.byGroup[g] = (out.byGroup[g] || 0) + v;
      mAmt += v;
    }
    out.months.push({ month: m, fraction: f, source, amount: mAmt });
  }
  out.total = out.cash + out.nonCash;
  return out;
}

/**
 * Rimanenze: materie prime al costo dei lotti (FIFO), al prezzo di oggi (sostituzione) e in quarantena;
 * prodotto finito non spedito al costo effettivo del lotto (variabile e pieno con la trasformazione fissa).
 */
export function inventoryValuation(d, { ix = makeIndex(d), costsToday = costsOf(d, ix), shipped } = {}) {
  if (!shipped) { shipped = {}; for (const s of d.shipments || EMPTY) shipped[s.lotId] = (shipped[s.lotId] || 0) + n0(s.tonnes); }
  const ing = {};
  const row = id => (ing[id] ||= { ingId: id, t: 0, stock: 0, fifo: 0, replacement: 0, quarantine: 0, quarantineT: 0 });
  for (const l of d.ingLots || EMPTY) {
    const rem = n0(l.remaining);
    if (rem <= 0) continue;
    if (l.status === 'accettato') { const r = row(l.ingId); r.t += rem; r.fifo += rem * n0(l.price); }
    else if (l.status === 'in attesa') { const r = row(l.ingId); r.quarantineT += rem; r.quarantine += rem * n0(l.price); }
  }
  for (const i of d.ingredients || EMPTY) if (n0(i.stock) > 0) { const r = row(i.id); r.stock = n0(i.stock); r.replacement = r.stock * n0(i.price); }
  const byIng = Object.values(ing).sort((a, b) => b.fifo - a.fifo);
  const prod = {};
  for (const lot of d.lots || EMPTY) {
    if (lot.status === 'bloccato') continue;
    const rest = n0(lot.tonnes) - (shipped[lot.id] || 0);
    if (rest <= 0.05) continue;
    const u = lotUnitCost(lot, ix, d.settings || {}, costsToday);
    const v = rest * (u.rawT + u.shrinkT + u.energyT + u.varConvT + u.packT);
    const r = (prod[lot.productId] ||= { productId: lot.productId, t: 0, valueVar: 0, valueFull: 0, lots: 0 });
    r.t += rest; r.valueVar += v; r.valueFull += v + rest * u.fixConvT; r.lots++;
  }
  const byProduct = Object.values(prod).sort((a, b) => b.valueFull - a.valueFull);
  return {
    mp: { fifo: sum(byIng, r => r.fifo), replacement: sum(byIng, r => r.replacement), quarantine: sum(byIng, r => r.quarantine), byIng },
    fg: { t: sum(byProduct, r => r.t), valueVar: sum(byProduct, r => r.valueVar), valueFull: sum(byProduct, r => r.valueFull), byProduct },
  };
}

/** Oggi dell'archivio: l'ancora del demo, altrimenti il giorno locale. */
const todayOf = d => (d.settings?.dataset === 'demo' && d.settings?.demoAnchor ? d.settings.demoAnchor : todayLocal());

/** Contesto di calcolo per i motori (stessa forma di derived.ctxOf, senza memoria): usato dai test in node. */
export function makeCtx(d, today = todayOf(d)) {
  const ix = makeIndex(d), costs = costsOf(d, ix);
  return {
    today, ix, costs,
    facts: shipmentFacts(d, { ix, costsToday: costs }),
    mrp: requirements({ today, weeks: 8, plan: d.plan || EMPTY, products: d.products || EMPTY, formulas: d.formulas || EMPTY, ingredients: d.ingredients || EMPTY,
      purchases: d.purchases || EMPTY, runs: d.runs || EMPTY, ingLots: d.ingLots || EMPTY, suppliers: d.suppliers || EMPTY, settings: d.settings || {} }),
    volumes: volumesOf(d, today),
  };
}
