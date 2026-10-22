/* FeedOS 17 · Redditività netta per cliente, prodotto e agente con costo di servizio (pacchetto WP3).
 * Margine netto = MdC I (ricavi − materie prime, calo, energia, trasformazione variabile, imballo, al costo effettivo dei lotti)
 *   − logistica (standard del prodotto, oppure modello a distanza: per consegna + km andata e ritorno, riscalato sul totale contabile)
 *   − provvigioni − onere della dilazione (termini + ritardo medio d'incasso + 15 giorni) − reclami − visite × costo visita.
 * Ogni costo del cliente si ripartisce sulle sue consegne, così le viste per cliente, prodotto e agente sommano allo stesso totale.
 * Concentrazione: curva della balena, HHI, quote dei primi clienti, N80; rischio di abbandono; «E se perdiamo…». */
import { addDays, byId, median, nf, eur, pct, sum } from '../core/util.js';
import { aggregateFacts, fixedFor } from './actuals.js';
import { productCost } from './costing.js';
import { creditSummary } from './credit.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];
const inP = (f, P) => f.date >= P.from && f.date <= P.to;

/** Valori di base delle impostazioni di redditività e concentrazione (letti sempre con ripiego). */
export const PROFIT_DEFAULTS = Object.freeze({ targetNetT: 20 });
export const CONC_DEFAULTS = Object.freeze({ hhiWarn: 1500, hhiBad: 2500, top1: 0.10, top10: 0.5, agentShare: 0.30, lossRate: 0.3 });
export const QUADRANTS = {
  Difendere: 'Molto volume e buon margine netto: proteggere servizio e relazione.',
  Sviluppare: 'Poco volume ma buon margine netto: far crescere i volumi.',
  'Rinegoziare prezzo': 'Molto volume con margine netto sotto l’obiettivo: rivedere prezzo e sconti.',
  'Ristrutturare servizio': 'Poco volume e margine netto basso: consegne più grandi, meno visite, pagamenti più brevi.',
};

export const targetNetT = d => (has(d.settings?.profit?.targetNetT) ? +d.settings.profit.targetNetT : PROFIT_DEFAULTS.targetNetT);
export const concentrationOf = d => ({ ...CONC_DEFAULTS, ...(d.settings?.concentration || {}) });
const finOf = d => { const f = d.settings?.finance || {}; return { vat: has(f.vatPct) ? +f.vatPct : 10, rate: has(f.rate) ? +f.rate : 5 }; };
const visitCostOf = d => (has(d.settings?.visitCost) ? +d.settings.visitCost : 40);
const P12of = today => ({ from: addDays(today, -364), to: today });

/** Distanza in linea d'aria (km) tra due punti (formula dell'emisenoverso). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(has)) return null;
  const R = 6371, r = Math.PI / 180;
  const dl = (lat2 - lat1) * r, dn = (lon2 - lon1) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Consegne per cliente: una consegna è una coppia distinta (cliente, data). → {[custId]: {n, tonnes, avgDrop}} */
export function drops(facts) {
  const seen = new Set(), out = {};
  for (const f of facts || EMPTY) {
    const o = (out[f.customerId] ||= { n: 0, tonnes: 0, avgDrop: 0 });
    o.tonnes += n0(f.tonnes);
    const k = f.customerId + '|' + f.date;
    if (!seen.has(k)) { seen.add(k); o.n++; }
  }
  for (const o of Object.values(out)) o.avgDrop = o.n ? o.tonnes / o.n : 0;
  return out;
}

/** Parametri del modello logistico con ripiego: ok = modo 'distanza' con le coordinate dello stabilimento. */
export function logisticsSettings(d) {
  const L = d.settings?.logistics || {}, c = d.settings?.company || {};
  const plant = has(c.lat) && has(c.lon) ? { lat: +c.lat, lon: +c.lon } : null;
  const mode = L.mode === 'distanza' ? 'distanza' : 'standard';
  return { mode, perDrop: has(L.perDrop) ? +L.perDrop : 35, perKm: has(L.perKm) ? +L.perKm : 1.8, roadFactor: has(L.roadFactor) ? +L.roadFactor : 1.3, plant, ok: mode === 'distanza' && !!plant };
}

/**
 * Costo di servizio logistico per cliente nel periodo P.
 * Modo 'distanza': km = linea d'aria × fattore strada; costo grezzo = Σ consegne (per consegna + 2 × km × €/km);
 * k = logistica contabile dei fatti / Σ costi grezzi, così il totale resta quello del conto economico; logistica cliente = k × grezzo.
 * Modo 'standard' (o senza coordinate dello stabilimento): la logistica standard dei prodotti consegnati.
 * → {k, mode, byCustomer: {[id]: {km, drops, avgDrop, tonnes, raw, logistics, standard, perDrop}}, total, params}
 */
export function costToServe(d, ctx, P) {
  const L = logisticsSettings(d);
  const facts = (ctx.facts || EMPTY).filter(f => inP(f, P));
  const dr = drops(facts);
  const std = {};
  for (const f of facts) std[f.customerId] = (std[f.customerId] || 0) + n0(f.logistics);
  const cust = byId(d.customers || EMPTY);
  const byCustomer = {};
  let total = 0, rawSum = 0, stdGeo = 0;
  for (const [id, o] of Object.entries(dr)) {
    const c = cust[id];
    const air = L.plant && c ? haversineKm(L.plant.lat, L.plant.lon, c.lat, c.lon) : null;
    const km = air == null ? null : air * L.roadFactor;
    const raw = km == null ? null : o.n * (L.perDrop + 2 * km * L.perKm);
    byCustomer[id] = { km, drops: o.n, avgDrop: o.avgDrop, tonnes: o.tonnes, raw, standard: std[id] || 0, logistics: std[id] || 0, perDrop: null };
    total += std[id] || 0;
    if (L.ok && raw != null) { rawSum += raw; stdGeo += std[id] || 0; }
  }
  // k riporta i costi del modello al totale contabile dei clienti con coordinate (gli altri restano allo standard)
  const k = L.ok && rawSum > 0 ? stdGeo / rawSum : 1;
  if (L.ok && rawSum > 0) for (const o of Object.values(byCustomer)) if (o.raw != null) { o.logistics = k * o.raw; o.perDrop = k * (L.perDrop + 2 * o.km * L.perKm); }
  return { k, mode: L.ok ? 'distanza' : 'standard', requested: L.mode, byCustomer, total, params: L };
}

/** Sintesi dei crediti (contratto WP2) protetta e memorizzata: ritardo medio d'incasso e scaduto per cliente. */
const creditCache = new WeakMap();
function creditOf(d, today) {
  let m = creditCache.get(d);
  if (!m) { m = new Map(); creditCache.set(d, m); }
  if (!m.has(today)) { let cs = null; try { cs = creditSummary(d, today) || null; } catch { cs = null; } m.set(today, cs); }
  return m.get(today);
}

/**
 * Base della redditività nel periodo P: per ogni fatto i costi del cliente ripartiti (logistica per t, ritardo per ricavi,
 * reclami sulle consegne dello stesso prodotto o del cliente, visite per ricavi) e il margine netto. Memorizzata per archivio e periodo.
 */
const baseCache = new WeakMap();
function netBase(d, ctx, P) {
  let m = baseCache.get(d);
  if (!m) { m = new Map(); baseCache.set(d, m); }
  const key = P.from + '|' + P.to;
  const hit = m.get(key);
  if (hit && hit.facts === ctx.facts) return hit.v;
  const v = buildBase(d, ctx, P);
  m.set(key, { facts: ctx.facts, v });
  return v;
}
function buildBase(d, ctx, P) {
  const today = ctx.today;
  const facts = (ctx.facts || EMPTY).filter(f => inP(f, P));
  const cts = costToServe(d, ctx, P);
  const cs = creditOf(d, today);
  const { vat, rate } = finOf(d);
  const vc = visitCostOf(d);
  const cust = byId(d.customers || EMPTY);
  const byC = {};
  for (const f of facts) (byC[f.customerId] ||= { facts: [], t: 0, rev: 0 }).facts.push(f);
  for (const g of Object.values(byC)) for (const f of g.facts) { g.t += n0(f.tonnes); g.rev += n0(f.revenue); }
  const alloc = new Map(); // fatto → costi ripartiti
  const A = f => { let a = alloc.get(f); if (!a) { a = { log: 0, delay: 0, compl: 0, visits: 0 }; alloc.set(f, a); } return a; };
  // logistica (per t) e ritardo d'incasso (per ricavi)
  for (const [id, g] of Object.entries(byC)) {
    const L = cts.byCustomer[id]?.logistics ?? sum(g.facts, f => f.logistics);
    const delay = Math.max(0, n0(cs?.byCustomer?.[id]?.avgDelay));
    for (const f of g.facts) {
      const a = A(f);
      a.log = g.t > 0 ? L * n0(f.tonnes) / g.t : n0(f.logistics);
      a.delay = n0(f.revenue) * (1 + vat / 100) * rate / 100 * delay / 365;
    }
  }
  // reclami del periodo: sulle consegne dello stesso prodotto al cliente, altrimenti su tutte le consegne del cliente
  const unalloc = { complaints: 0, visits: 0, nComplaints: 0, nVisits: 0 };
  const compl = {}, nCompl = {};
  for (const c of d.complaints || EMPTY) {
    if (!c.date || c.date < P.from || c.date > P.to || !has(c.cost) || !(+c.cost)) continue;
    const g = byC[c.customerId];
    if (!g) { unalloc.complaints += +c.cost; unalloc.nComplaints++; continue; }
    compl[c.customerId] = (compl[c.customerId] || 0) + +c.cost; nCompl[c.customerId] = (nCompl[c.customerId] || 0) + 1;
    let pool = c.productId ? g.facts.filter(f => f.productId === c.productId) : EMPTY;
    if (!pool.length) pool = g.facts;
    spread(pool, +c.cost, (f, v) => { A(f).compl += v; });
  }
  // visite del periodo × costo per visita, sui ricavi del cliente
  const nVis = {};
  for (const v of d.visits || EMPTY) {
    if (!v.date || v.date < P.from || v.date > P.to) continue;
    if (!byC[v.customerId]) { unalloc.visits += vc; unalloc.nVisits++; continue; }
    nVis[v.customerId] = (nVis[v.customerId] || 0) + 1;
  }
  for (const [id, n] of Object.entries(nVis)) spread(byC[id].facts, n * vc, (f, v) => { A(f).visits += v; });
  const rows = facts.map(f => {
    const a = alloc.get(f) || { log: n0(f.logistics), delay: 0, compl: 0, visits: 0 };
    const finCost = n0(f.finCost) + a.delay;
    return { f, logistics: a.log, delay: a.delay, finCost, complaints: a.compl, visits: a.visits, net: n0(f.mc1) - a.log - n0(f.commission) - finCost - a.compl - a.visits };
  });
  return { facts, rows, cts, cs, byC, cust, nCompl, compl, nVis, unalloc, vat, rate, vc };
}

// ripartisce un importo sulle consegne in proporzione ai ricavi (alle t se i ricavi sono nulli)
function spread(pool, amount, put) {
  const byRev = sum(pool, f => f.revenue) > 0;
  const R = byRev ? sum(pool, f => f.revenue) : sum(pool, f => f.tonnes);
  if (!R) { if (pool.length) put(pool[0], amount); return; }
  for (const f of pool) put(f, amount * n0(byRev ? f.revenue : f.tonnes) / R);
}

const SUMS = ['tonnes', 'revenue', 'listRevenue', 'discount', 'raw', 'shrink', 'energy', 'varConv', 'pack', 'fixConv', 'mc1', 'mc2', 'marginFull', 'commission'];
function group(base, keyOf) {
  const out = new Map();
  for (const r of base.rows) {
    const k = keyOf(r.f) ?? '';
    let g = out.get(k);
    if (!g) { g = { key: k, n: 0, logistics: 0, logisticsStd: 0, delay: 0, finCost: 0, complaints: 0, visits: 0, net: 0 }; for (const s of SUMS) g[s] = 0; out.set(k, g); }
    for (const s of SUMS) g[s] += n0(r.f[s]);
    g.logisticsStd += n0(r.f.logistics); g.logistics += r.logistics; g.delay += r.delay; g.finCost += r.finCost; g.complaints += r.complaints; g.visits += r.visits; g.net += r.net; g.n++;
  }
  return out;
}
function totalsOf(list) {
  const t = { n: list.length, logistics: 0, logisticsStd: 0, delay: 0, finCost: 0, complaints: 0, visits: 0, net: 0 };
  for (const s of SUMS) t[s] = 0;
  for (const g of list) { for (const s of SUMS) t[s] += g[s]; for (const s of ['logistics', 'logisticsStd', 'delay', 'finCost', 'complaints', 'visits', 'net']) t[s] += g[s]; }
  return t;
}
/** Classi ABC: A finché la quota cumulata precedente è sotto l'80%, B fino al 95%, poi C; valori ≤ 0 sempre C. → Map(id → classe) */
function abcOf(items, val) {
  const pos = items.filter(x => val(x) > 0).sort((a, b) => val(b) - val(a));
  const T = sum(pos, val), out = new Map();
  let cum = 0;
  for (const x of pos) { const s = T ? cum / T : 1; out.set(x, s < 0.8 ? 'A' : s < 0.95 ? 'B' : 'C'); cum += val(x); }
  for (const x of items) if (!out.has(x)) out.set(x, 'C');
  return out;
}
/** Concentrazione dei ricavi: HHI (Σ quote² in punti), quota dei primi 1/5/10, N80 (clienti minimi per l'80% dei ricavi). */
export function concentration(values) {
  const v = values.filter(x => x > 0).sort((a, b) => b - a), T = sum(v);
  if (!T) return { hhi: null, top1: null, top5: null, top10: null, n80: null, n: 0 };
  const share = k => sum(v.slice(0, k)) / T;
  let cum = 0, n80 = 0;
  for (const x of v) { cum += x; n80++; if (cum / T >= 0.8 - 1e-12) break; }
  return { hhi: sum(v, x => (100 * x / T) ** 2), top1: share(1), top5: share(5), top10: share(10), n80, n: v.length };
}

/**
 * Redditività per cliente nel periodo P (contratto).
 * → {rows, totals, whale: {points: [{x, y}], peakPct}, hhi, top1, top5, top10, n80, peakPct, target, median, cts: {k, mode}, unallocated}
 */
export function customerProfit(d, ctx, P) {
  const base = netBase(d, ctx, P);
  const target = targetNetT(d);
  const L = base.cts.params;
  const cs = base.cs;
  const G = group(base, f => f.customerId);
  const rows = [];
  for (const g of G.values()) {
    if (!(g.tonnes > 0)) continue;
    const c = base.cust[g.key] || {};
    const o = base.cts.byCustomer[g.key] || {};
    const t = g.tonnes;
    const days = has(c.terms?.days) ? +c.terms.days : has(c.paymentDays) ? +c.paymentDays : 60;
    const delay = Math.max(0, n0(cs?.byCustomer?.[g.key]?.avgDelay));
    const netT = g.net / t, mc1T = g.mc1 / t;
    const gapT = Math.max(0, target - netT);
    // il prezzo in più porta con sé provvigione e onere finanziario: Δprezzo = gap / (1 − quota provvigione − quota onere)
    const commRate = g.revenue ? g.commission / g.revenue : 0, finRate = g.revenue ? g.finCost / g.revenue : 0;
    const priceNeededT = gapT > 0 ? gapT / Math.max(0.5, 1 - commRate - finRate) : 0;
    rows.push({
      id: g.key, customerId: g.key, name: c.name || g.key, code: c.code || '', type: c.type || '', agentId: c.agentId ?? null, city: c.city || '',
      ...Object.fromEntries(SUMS.map(s => [s, g[s]])), logistics: g.logistics, logisticsStd: g.logisticsStd, delayCost: g.delay, finCost: g.finCost,
      complaints: g.complaints, nComplaints: base.nCompl[g.key] || 0, visits: g.visits, nVisits: base.nVis[g.key] || 0, net: g.net, n: g.n,
      price: g.revenue / t, netT, mc1T, mc2T: g.mc2 / t, logT: g.logistics / t, km: o.km ?? null, drops: o.drops || 0, avgDrop: o.avgDrop || null,
      days, delay, termsDays: days + delay,
      gapT, priceNeededT, priceNeeded: gapT > 0 ? g.revenue / t + priceNeededT : null,
      minDropT: o.perDrop != null && mc1T > 0 ? o.perDrop / mc1T : null,
    });
  }
  const T = sum(rows, r => r.revenue), NET = sum(rows, r => r.net);
  const med = median(rows.map(r => r.tonnes)) ?? 0;
  const abcR = abcOf(rows, r => r.revenue), abcN = abcOf(rows, r => r.net);
  for (const r of rows) {
    r.share = T ? r.revenue / T : 0;
    r.abcRev = abcR.get(r); r.abcNet = abcN.get(r);
    const big = r.tonnes >= med, good = r.netT >= target;
    r.quadrant = big ? (good ? 'Difendere' : 'Rinegoziare prezzo') : (good ? 'Sviluppare' : 'Ristrutturare servizio');
  }
  rows.sort((a, b) => b.net - a.net);
  // curva della balena: clienti dal più al meno redditizio, % cumulata del margine netto
  const points = [{ x: 0, y: 0 }];
  let cum = 0, peak = 0;
  rows.forEach((r, i) => { cum += r.net; peak = Math.max(peak, cum); points.push({ x: (i + 1) / rows.length, y: NET ? cum / NET : 0, id: r.id }); });
  const peakPct = NET > 0 ? peak / NET : null;
  const conc = concentration(rows.map(r => r.revenue));
  const totals = totalsOf(rows);
  const neg = rows.filter(r => r.net < 0);
  Object.assign(totals, { negN: neg.length, negNet: sum(neg, r => r.net), negTonnes: sum(neg, r => r.tonnes), netT: totals.tonnes ? totals.net / totals.tonnes : null });
  return {
    rows, totals, whale: { points, peakPct }, peakPct, hhi: conc.hhi, top1: conc.top1, top5: conc.top5, top10: conc.top10, n80: conc.n80,
    target, median: med, cts: { k: base.cts.k, mode: base.cts.mode, requested: base.cts.requested, params: L }, unallocated: base.unalloc, credit: !!cs && Object.keys(cs.byCustomer || {}).length > 0,
  };
}

/** Classi ABC dei clienti nel periodo P per ricavi e per margine netto (contratto). → {custId: {abcRev, abcNet}} */
export function abcCustomers(d, ctx, P) {
  const out = {};
  for (const r of customerProfit(d, ctx, P).rows) out[r.id] = { abcRev: r.abcRev, abcNet: r.abcNet };
  return out;
}

/**
 * Redditività per prodotto: consuntivo nel periodo P (fatti al costo effettivo e costi di servizio ripartiti) e confronto
 * «a costi di oggi» (prezzo netto degli ultimi 90 giorni − costo pieno di oggi, volumi degli ultimi 12 mesi).
 * below: prezzo netto a 90 giorni sotto il prezzo minimo; belowList: listino sotto il prezzo minimo.
 */
export function productProfit(d, ctx, P) {
  const base = netBase(d, ctx, P);
  const G = group(base, f => f.productId);
  const today = ctx.today, from90 = addDays(today, -90);
  const n90 = {};
  for (const f of ctx.facts || EMPTY) if (f.date > from90 && f.date <= today) { const o = (n90[f.productId] ||= { t: 0, r: 0, l: 0 }); o.t += f.tonnes; o.r += f.revenue; o.l += f.listRevenue; }
  const ix = ctx.ix;
  const costs = ctx.costs || {};
  const rows = [];
  for (const p of d.products || EMPTY) {
    const g = G.get(p.id);
    if (p.active === false && !g) continue;
    const c = costs[p.id] || productCost(p, ix?.form?.[p.formulaId], ix?.ing || {}, ix?.line?.[p.lineId], d.settings?.energy);
    const t = g?.tonnes || 0;
    const o = n90[p.id];
    const real = o?.t > 0 ? o.r / o.t : n0(p.listPrice);
    const vol = n0(ctx.volumes?.[p.id]);
    const marginToday = c.total == null ? null : real - c.total;
    const row = {
      id: p.id, productId: p.id, name: p.name, code: p.code, packaging: p.packaging, active: p.active !== false, listPrice: n0(p.listPrice),
      ...Object.fromEntries(SUMS.map(s => [s, g?.[s] || 0])), logistics: g?.logistics || 0, logisticsStd: g?.logisticsStd || 0, finCost: g?.finCost || 0,
      complaints: g?.complaints || 0, visits: g?.visits || 0, net: g?.net || 0, n: g?.n || 0,
      price: t ? g.revenue / t : null, discountPct: g?.listRevenue ? g.discount / g.listRevenue : null,
      mc1T: t ? g.mc1 / t : null, mc2T: t ? g.mc2 / t : null, netT: t ? g.net / t : null, fullT: t ? g.marginFull / t : null, rawPct: g?.revenue ? (g.raw + g.shrink) / g.revenue : null,
      // a costi di oggi
      c, net90: o?.t > 0 ? real : null, t90: o?.t || 0, real, marginToday, marginPctToday: marginToday != null && real ? marginToday / real : null,
      vol, annual: marginToday == null ? null : marginToday * vol, discount90: p.listPrice && o?.l ? 1 - o.r / o.l : p.listPrice ? 1 - real / p.listPrice : null,
      minPrice: c.minPrice, below: c.minPrice != null && real > 0 && real < c.minPrice, belowList: c.minPrice != null && n0(p.listPrice) < c.minPrice - 1e-9, incomplete: !!c.incomplete,
    };
    rows.push(row);
  }
  const totals = totalsOf(rows);
  const act = rows.filter(r => r.active);
  Object.assign(totals, {
    annual: sum(act, r => r.annual), vol: sum(act, r => r.vol), belowN: act.filter(r => r.below).length,
    rawToday: sum(act, r => (r.c.raw || 0) * r.vol), revToday: sum(act, r => r.real * r.vol), discToday: sum(act, r => (r.discount90 || 0) * r.vol),
  });
  return { rows, totals };
}

/** Redditività per agente nel periodo P: ricavi e quota, MdC II, provvigioni, margine netto dopo il costo di servizio, quota del primo agente. */
export function agentProfit(d, ctx, P) {
  const base = netBase(d, ctx, P);
  const G = group(base, f => f.agentId || '');
  const ag = byId(d.agents || EMPTY);
  const custNet = {};
  for (const r of base.rows) custNet[r.f.customerId] = (custNet[r.f.customerId] || 0) + r.net;
  const rows = [];
  for (const g of G.values()) {
    const a = ag[g.key] || {};
    const cust = new Set(base.rows.filter(r => (r.f.agentId || '') === g.key).map(r => r.f.customerId));
    rows.push({ id: g.key || '—', agentId: g.key || null, name: a.name || 'Senza agente', zone: a.zone || '', commissionPct: a.commissionPct ?? null,
      ...Object.fromEntries(SUMS.map(s => [s, g[s]])), logistics: g.logistics, finCost: g.finCost, complaints: g.complaints, visits: g.visits, net: g.net,
      netT: g.tonnes ? g.net / g.tonnes : null, mc2T: g.tonnes ? g.mc2 / g.tonnes : null, customers: cust.size, lossCustomers: [...cust].filter(c => custNet[c] < 0).length });
  }
  const T = sum(rows, r => r.revenue);
  for (const r of rows) r.share = T ? r.revenue / T : 0;
  rows.sort((a, b) => b.revenue - a.revenue);
  return { rows, totals: totalsOf(rows), topShare: rows[0]?.share ?? null, topAgentId: rows[0]?.agentId ?? null };
}

/**
 * Rischio di abbandono: atteso = quota del cliente sulle t delle 52 settimane prima delle ultime 8 × t dell'azienda nelle ultime 8;
 * r = t del cliente nelle ultime 8 settimane / atteso; segnalato con r < 0,7 per i clienti di classe A, con i motivi
 * (offerte perse o reclami negli ultimi 90 giorni, scaduto dai crediti).
 */
export function churnRisk(d, ctx) {
  const today = ctx.today;
  const recentFrom = addDays(today, -55), baseTo = addDays(today, -56), baseFrom = addDays(baseTo, -363);
  const tR = {}, tB = {}, rB = {}, last = {};
  let TR = 0, TB = 0;
  for (const f of ctx.facts || EMPTY) {
    if (f.date > today) continue;
    if (!last[f.customerId] || f.date > last[f.customerId]) last[f.customerId] = f.date;
    if (f.date >= recentFrom) { tR[f.customerId] = (tR[f.customerId] || 0) + f.tonnes; TR += f.tonnes; }
    else if (f.date >= baseFrom && f.date <= baseTo) { tB[f.customerId] = (tB[f.customerId] || 0) + f.tonnes; rB[f.customerId] = (rB[f.customerId] || 0) + f.revenue; TB += f.tonnes; }
  }
  const ids = Object.keys(tB);
  const abc = abcOf(ids, id => rB[id] || 0);
  const cs = creditOf(d, today);
  const from90 = addDays(today, -90);
  const cust = byId(d.customers || EMPTY);
  const rows = [];
  for (const id of ids) {
    const expected = TB ? tB[id] / TB * TR : 0;
    if (!(expected > 0)) continue;
    const actual = tR[id] || 0, r = actual / expected;
    const reasons = [];
    const lost = (d.offers || EMPTY).filter(o => o.customerId === id && o.status === 'persa' && o.date > from90 && o.date <= today);
    if (lost.length) reasons.push(`${lost.length === 1 ? 'un’offerta persa' : lost.length + ' offerte perse'} negli ultimi 90 giorni`);
    const cmp = (d.complaints || EMPTY).filter(c => c.customerId === id && c.date > from90 && c.date <= today);
    if (cmp.length) reasons.push(`${cmp.length === 1 ? 'un reclamo' : cmp.length + ' reclami'} negli ultimi 90 giorni`);
    const od = n0(cs?.byCustomer?.[id]?.overdue);
    if (od > 0.5) reasons.push(`scaduto di ${eur(od)}`);
    const cls = abc.get(id);
    rows.push({ id, customerId: id, name: cust[id]?.name || id, agentId: cust[id]?.agentId ?? null, abc: cls, expected, actual, r, last: last[id] || null, reasons, flag: cls === 'A' && r < 0.7 });
  }
  rows.sort((a, b) => (b.flag - a.flag) || a.r - b.r);
  return { rows, flagged: rows.filter(x => x.flag), window: { recentFrom, recentTo: today, baseFrom, baseTo }, companyRecent: TR, companyBase: TB };
}

/**
 * «E se perdiamo…» un cliente o il portafoglio di un agente (quota lossRate dei volumi) nel periodo P.
 * dMc2 = −quota × MdC II perso; i costi fissi restano: dFixedPerT = CF/(T − t) − CF/T; dEbit = dMc2.
 */
export function lossImpact(d, ctx, P, { customerId = null, agentId = null, lossRate } = {}) {
  const base = netBase(d, ctx, P);
  const q = has(lossRate) ? Math.max(0, Math.min(1, +lossRate)) : concentrationOf(d).lossRate;
  const pick = customerId ? r => r.f.customerId === customerId : agentId ? r => (r.f.agentId || '') === agentId : () => false;
  let t = 0, mc2 = 0, net = 0, rev = 0, T = 0, MC2 = 0, REV = 0;
  for (const r of base.rows) {
    T += n0(r.f.tonnes); MC2 += n0(r.f.mc2); REV += n0(r.f.revenue);
    if (pick(r)) { t += n0(r.f.tonnes); mc2 += n0(r.f.mc2); net += r.net; rev += n0(r.f.revenue); }
  }
  const hasFixed = (d.fixedCosts || EMPTY).length > 0;
  const CF = hasFixed ? fixedFor(d.fixedCosts, d.costCenters || EMPTY, P).total : null;
  const lostT = q * t;
  const fixedPerT = CF != null && T > 0 ? CF / T : null;
  const dFixedPerT = CF != null && T - lostT > 0 && T > 0 ? CF / (T - lostT) - CF / T : null;
  const dMc2 = -q * mc2;
  const ebit = CF != null ? MC2 - CF : null;
  return {
    lossRate: q, customerId, agentId, tonnes: t, revenue: rev, mc2, net, share: REV ? rev / REV : 0,
    dTonnes: -lostT, dRevenue: -q * rev, dMc2, dNet: -q * net, cf: CF, fixedPerT, dFixedPerT,
    dEbit: dMc2, ebit, ebitAfter: ebit != null ? ebit + dMc2 : null, dEbitPct: ebit ? dMc2 / Math.abs(ebit) : null,
  };
}

/** Segnali di redditività sugli ultimi 12 mesi: clienti in perdita, abbandono dei clienti A, concentrazione dei ricavi e degli agenti. */
export function profitSignals(d, ctx) {
  const today = ctx.today;
  if (!today || !(ctx.facts || EMPTY).length) return [];
  const P = P12of(today);
  const cp = customerProfit(d, ctx, P);
  const K = concentrationOf(d);
  const out = [];
  const tgt = cp.target;
  for (const r of cp.rows) {
    if (!(r.net < 0 && r.tonnes > 100)) continue;
    out.push({ key: `profit:neg:${r.id}:${Math.round(r.netT)}`, area: 'economia', roles: ['direzione', 'commerciale'], severity: 'attenzione',
      title: `${r.name}: margine netto negativo dopo il costo di servizio`,
      why: `Negli ultimi 12 mesi ${nf(r.tonnes)} t a ${nf(r.price)} €/t: margine netto ${nf(r.netT, 1)} €/t (${eur(r.net)}) dopo logistica ${nf(r.logT, 1)} €/t, provvigioni, dilazione di ${nf(r.termsDays)} giorni, reclami e visite. Per arrivare all’obiettivo di ${nf(tgt)} €/t servono ${nf(r.priceNeededT, 1)} €/t in più sul prezzo.`,
      action: r.avgDrop != null && r.minDropT != null && r.avgDrop < r.minDropT ? `Rinegoziare il prezzo e portare la consegna media da ${nf(r.avgDrop, 1)} t ad almeno ${nf(r.minDropT, 1)} t.` : 'Rinegoziare prezzo o condizioni di servizio (consegne più grandi, pagamenti più brevi).',
      impact: -r.net, link: { area: 'economia', tab: 'redditivita', id: r.id }, agentId: r.agentId });
  }
  const ch = churnRisk(d, ctx);
  for (const r of ch.flagged) {
    if (!(r.actual > 0)) continue; // cliente fermo: lo segnala già la regola «non ordina da…»
    out.push({ key: `churn:${r.id}:${today.slice(0, 7)}`, area: 'commerciale', roles: ['commerciale', 'agente', 'direzione'], severity: 'attenzione',
      title: `${r.name}: volumi in calo, rischio di abbandono`,
      why: `Nelle ultime 8 settimane ${nf(r.actual)} t contro ${nf(r.expected)} t attese dalla sua quota abituale (${pct(r.r, 0)}). Cliente di classe A per ricavi.${r.reasons.length ? ' Inoltre: ' + r.reasons.join(', ') + '.' : ''}`,
      action: 'Programmare una visita e verificare prezzi della concorrenza, servizio e reclami aperti.',
      impact: (r.expected - r.actual) * 1000, link: { area: 'commerciale', tab: 'clienti', id: r.id }, agentId: r.agentId });
  }
  const link = { area: 'economia', tab: 'redditivita' };
  if (cp.top1 != null && cp.top1 > K.top1) out.push({ key: `conc:top1:${today.slice(0, 7)}`, area: 'economia', roles: ['direzione'], severity: 'info',
    title: `Il primo cliente vale il ${pct(cp.top1, 1)} dei ricavi`, why: `Soglia di attenzione ${pct(K.top1, 0)}: la perdita di questo cliente peserebbe sui costi fissi per tonnellata.`, action: 'Valutare l’effetto con «E se perdiamo…» in Economia › Redditività.', impact: cp.top1 * 1000, link });
  if (cp.top10 != null && cp.top10 > K.top10) out.push({ key: `conc:top10:${today.slice(0, 7)}`, area: 'economia', roles: ['direzione'], severity: 'info',
    title: `I primi 10 clienti valgono il ${pct(cp.top10, 1)} dei ricavi`, why: `Soglia di attenzione ${pct(K.top10, 0)}; N80 = ${cp.n80} clienti fanno l’80% dei ricavi.`, action: 'Allargare il portafoglio clienti.', impact: cp.top10 * 1000, link });
  if (cp.hhi != null && cp.hhi > K.hhiWarn) out.push({ key: `conc:hhi:${today.slice(0, 7)}`, area: 'economia', roles: ['direzione'], severity: 'info',
    title: `Ricavi concentrati: indice HHI ${nf(cp.hhi)}`, why: `Sopra ${nf(K.hhiWarn)} la concentrazione è da seguire, sopra ${nf(K.hhiBad)} è alta.`, action: 'Allargare il portafoglio clienti.', impact: cp.hhi, link });
  const ap = agentProfit(d, ctx, P);
  const top = ap.rows[0];
  if (top?.agentId && top.share > K.agentShare) out.push({ key: `conc:agent:${top.agentId}:${today.slice(0, 7)}`, area: 'economia', roles: ['direzione'], severity: 'info',
    title: `${top.name} gestisce il ${pct(top.share, 1)} dei ricavi`, why: `Soglia di attenzione ${pct(K.agentShare, 0)}: dipendenza commerciale da un solo agente.`, action: 'Valutare l’effetto con «E se perdiamo…» per agente.', impact: top.share * 1000, link: { ...link, id: undefined } });
  return out;
}

/** Sezione «Redditività» del report CdA: migliori e peggiori 10 clienti, picco della curva, HHI, clienti in perdita. */
export function profitReportSection(d, ctx, P, C) {
  if (!(ctx.facts || EMPTY).some(f => inP(f, P))) return null;
  const cp = customerProfit(d, ctx, P);
  if (!cp.rows.length) return null;
  const K = concentrationOf(d);
  const cmpOk = C && !C.budget && (ctx.facts || EMPTY).some(f => inP(f, C));
  const cc = cmpOk ? customerProfit(d, ctx, C) : null;
  const top = cp.rows.slice(0, 10), bottom = cp.rows.slice(-10).reverse().filter(r => !top.includes(r));
  const row = (r, g) => ({ group: g, name: r.name, tonnes: r.tonnes, netT: r.netT, net: r.net, logT: r.logT, abc: `${r.abcRev}/${r.abcNet}` });
  const neg = cp.rows.filter(r => r.net < 0);
  const narrative = [
    `Margine netto dopo il costo di servizio ${eur(cp.totals.net)} (${nf(cp.totals.netT, 1)} €/t) su ${nf(cp.totals.tonnes)} t e ${cp.rows.length} clienti; logistica ${cp.cts.mode === 'distanza' ? 'modellata sulla distanza e sulla dimensione delle consegne' : 'standard dei prodotti'}.`,
    cp.peakPct != null ? `Curva della balena: i clienti redditizi arrivano al ${pct(cp.peakPct, 0)} del margine netto totale; ${neg.length ? `${neg.length} clienti in perdita ne consumano ${eur(-sum(neg, r => r.net))}.` : 'nessun cliente in perdita.'}` : 'Margine netto totale non positivo: la curva della balena non è significativa.',
    `Concentrazione dei ricavi: HHI ${nf(cp.hhi)} (attenzione sopra ${nf(K.hhiWarn)}), primi 10 clienti ${pct(cp.top10, 1)}, ${cp.n80} clienti fanno l’80% dei ricavi.`,
  ];
  return {
    id: 'redditivita', title: 'Redditività per cliente', order: 40,
    kpis: [
      { label: 'Margine netto', value: cp.totals.net, unit: '€', decimals: 0, cmp: cc ? { value: cc.totals.net, kind: 'flow', good: 'up', label: C.short } : null },
      { label: 'Picco della curva della balena', value: cp.peakPct, unit: "%", decimals: 0 },
      { label: 'Clienti in perdita', value: neg.length, unit: '', decimals: 0, status: neg.length ? 'warn' : 'ok', note: neg.length ? `costano ${eur(-sum(neg, r => r.net))}` : undefined },
      { label: 'Indice HHI', value: cp.hhi, unit: '', decimals: 0, status: cp.hhi > K.hhiBad ? 'bad' : cp.hhi > K.hhiWarn ? 'warn' : 'ok' },
      { label: 'Quota dei primi 10 clienti', value: cp.top10, unit: "%", decimals: 1 },
    ],
    table: {
      cols: [{ key: 'group', label: 'Gruppo', fmt: 'text' }, { key: 'name', label: 'Cliente', fmt: 'text' }, { key: 'tonnes', label: 't', align: 'r', fmt: 't' }, { key: 'netT', label: 'Netto €/t', align: 'r', fmt: 'num' }, { key: 'net', label: 'Margine netto', align: 'r', fmt: 'eur' }, { key: 'abc', label: 'ABC ricavi/netto', fmt: 'text' }],
      rows: [...top.map(r => row(r, 'Migliori')), ...bottom.map(r => row(r, 'Peggiori'))],
    },
    narrative,
  };
}
