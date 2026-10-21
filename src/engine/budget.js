/* FeedOS 17 · Budget, stima di chiusura e segnali di budget (pacchetto WP1).
 * Righe di budget (raccolta budget): {id, year, version, month 'YYYY-MM', productId, species, tonnes, price, list, rawCostT,
 * energyT, kwhT, gplT, kwhPrice, gplPrice, varConvT, packT, logisticsT, commissionPct}; costi fissi di budget in fixedCosts
 * (kind 'budget', con version). Stato della versione in settings.finance.budget (e per anno in settings.finance.budgetStatus).
 * Puro: usabile nei test in node. */
import { addDays, addMonths, monthsIn, monthFraction, endOfMonth, daysBetween, daysInMonth, mondayOf, round, todayLocal, nf } from '../core/util.js';
import { aggregateFacts, fixedFor, listAt, makeCtx, makeIndex, costsOf } from './actuals.js';
import { forecastAuto } from './forecast.js';
import { pnl, fixedSplit, closingOf, firstFactDate, fixedRows, statusVersion } from './pnl.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];
const p2 = n => String(n).padStart(2, '0');
const kEur = v => nf(v / 1000, 1) + ' k€';
const monthName = m => ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);

const todayOf = (d, ctx) => ctx?.today || (d?.settings?.dataset === 'demo' && d.settings.demoAnchor) || todayLocal();

/**
 * Stato del budget di riferimento dell'anno: {year, version, status: 'bozza'|'approvato', approvedAt, approvedBy} o null.
 * È la versione approvata (o, senza approvazioni, l'ultima bozza): quella dei confronti «vs budget».
 */
export function budgetStatus(d, year) {
  const fin = d?.settings?.finance || {};
  const s = fin.budgetStatus?.[year];
  if (s) return s;
  return fin.budget && +fin.budget.year === +year ? fin.budget : null;
}
/** Stato di una singola versione (settings.finance.budgetVersions, altrimenti lo stato dell'anno se è la stessa versione). */
export function versionStatus(d, year, version) {
  const v = d?.settings?.finance?.budgetVersions?.[year]?.[version];
  if (v) return v;
  const s = budgetStatus(d, year);
  return s && (s.version || 'B') === version ? s : null;
}
/** Vero se la versione è approvata (bloccata: non si rigenera, i suoi costi fissi non si modificano). */
export const isLocked = (d, year, version) => versionStatus(d, year, version)?.status === 'approvato';
/** Versioni di budget presenti per l'anno (in ordine di creazione). */
export function budgetVersions(d, year) {
  const seen = [];
  for (const r of d?.budget || EMPTY) if (+r.year === +year || String(r.month || '').startsWith(year + '-')) { const v = r.version || 'B'; if (!seen.includes(v)) seen.push(v); }
  // B, poi le revisioni R1, R2… in ordine, poi le altre (le righe nuove possono stare in testa alla raccolta)
  const rank = v => (v === 'B' ? [0, 0] : /^R(\d+)$/.test(v) ? [1, +v.slice(1)] : [2, 0]);
  return seen.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || (a < b ? -1 : a > b ? 1 : 0); });
}
/** Versione attiva dell'anno: quella dello stato, altrimenti l'ultima presente, altrimenti 'B'. */
export function activeVersion(d, year) {
  const st = budgetStatus(d, year);
  if (st?.version) return st.version;
  const v = budgetVersions(d, year);
  return v.length ? v[v.length - 1] : 'B';
}
/** Vero se per l'anno esiste un budget (righe di prodotto o costi fissi di budget). */
export function hasBudget(d, year, version) {
  const y = String(year);
  return (d?.budget || EMPTY).some(r => (version == null || (r.version || 'B') === version) && String(r.month || '').startsWith(y + '-'))
    || (d?.fixedCosts || EMPTY).some(r => r.kind === 'budget' && String(r.month || '').startsWith(y + '-'));
}

const normMonth = (year, month) => (typeof month === 'number' || /^\d{1,2}$/.test(String(month)) ? `${year}-${p2(+month)}` : String(month).slice(0, 7));

/** Percentuale media di provvigione degli agenti (ripiego quando la riga non la porta). */
function agentsPct(d) {
  const a = (d.agents || EMPTY).filter(x => has(x.commissionPct));
  return a.length ? a.reduce((s, x) => s + +x.commissionPct, 0) / a.length : 0;
}

/**
 * Budget di un mese: {tonnes, revenue, listRevenue, discount, raw, shrink, energy, varConv, pack, varCost, logistics, commission,
 * mc1, mc2, fixed, fixedDetail, ebit, total (somme come i fatti), byProduct, rows}.
 * varCost = Σ t × (rawCostT × (1 + s/(1 − s)) + energyT + trasformazione variabile + imballo); provvigioni = ricavi × % della riga.
 */
export function budgetMonth(d, year, month, version = 'B') {
  const m = normMonth(year, month);
  const prod = {};
  for (const p of d.products || EMPTY) prod[p.id] = p;
  const rows = (d.budget || EMPTY).filter(r => r.month === m && (r.version || 'B') === version);
  const fb = agentsPct(d);
  const o = { month: m, tonnes: 0, revenue: 0, listRevenue: 0, raw: 0, shrink: 0, energy: 0, varConv: 0, pack: 0, logistics: 0, commission: 0, byProduct: {}, rows: rows.length };
  for (const r of rows) {
    const p = prod[r.productId] || {};
    const t = n0(r.tonnes), s = n0(p.shrinkPct) / 100;
    const rev = t * n0(r.price), list = t * (has(r.list) ? +r.list : n0(r.price));
    const raw = t * n0(r.rawCostT), shrink = s > 0 && s < 1 ? raw * s / (1 - s) : 0;
    const energy = t * n0(r.energyT);
    const varConv = t * (has(r.varConvT) ? +r.varConvT : has(p.varProcessCost) ? +p.varProcessCost : n0(p.processCost));
    const pack = t * (has(r.packT) ? +r.packT : n0(p.packCost));
    const logistics = t * (has(r.logisticsT) ? +r.logisticsT : n0(p.logisticsCost));
    const commission = rev * (has(r.commissionPct) ? +r.commissionPct : fb) / 100;
    o.tonnes += t; o.revenue += rev; o.listRevenue += list; o.raw += raw; o.shrink += shrink; o.energy += energy; o.varConv += varConv; o.pack += pack;
    o.logistics += logistics; o.commission += commission;
    const bp = (o.byProduct[r.productId] ||= { productId: r.productId, tonnes: 0, revenue: 0, mc2: 0 });
    bp.tonnes += t; bp.revenue += rev; bp.mc2 += rev - raw - shrink - energy - varConv - pack - logistics - commission;
  }
  o.discount = o.listRevenue - o.revenue;
  o.varCost = o.raw + o.shrink + o.energy + o.varConv + o.pack;
  o.mc1 = o.revenue - o.varCost;
  o.mc2 = o.mc1 - o.logistics - o.commission;
  // costi fissi di budget del mese (della versione; altrimenti quelli presenti senza versione o di un'altra versione)
  const fr = (d.fixedCosts || EMPTY).filter(r => r.kind === 'budget' && String(r.month || '').slice(0, 7) === m);
  const mine = fr.filter(r => (r.version || 'B') === version);
  // versione senza costi fissi propri: quelli della versione di riferimento (mai la somma di più versioni)
  const ref = statusVersion(d, m.slice(0, 4)), refRows = fr.filter(r => (r.version || 'B') === ref);
  const use = mine.length ? mine : refRows.length ? refRows : fr.filter(r => (r.version || 'B') === (fr[0]?.version || 'B'));
  const fixed = fixedFor(use, d.costCenters || EMPTY, { from: m + '-01', to: endOfMonth(m) }, { kind: 'budget', openMonthFallback: null });
  fixed.split = fixedSplit(fixed, d.costCenters || EMPTY);
  o.fixed = fixed.total; o.fixedDetail = fixed;
  o.ebitda = o.mc2 - fixed.cash;
  o.ebit = o.mc2 - fixed.total;
  o.has = rows.length > 0 || use.length > 0;
  o.total = { tonnes: o.tonnes, revenue: o.revenue, listRevenue: o.listRevenue, discount: o.discount, raw: o.raw, shrink: o.shrink, energy: o.energy, varConv: o.varConv,
    pack: o.pack, fixConv: 0, logistics: o.logistics, commission: o.commission, finCost: 0, mc1: o.mc1, mc2: o.mc2, fullCost: 0, marginFull: 0, replVar: o.varCost, n: rows.length };
  return o;
}

const SUMS = ['tonnes', 'revenue', 'listRevenue', 'discount', 'raw', 'shrink', 'energy', 'varConv', 'pack', 'varCost', 'logistics', 'commission', 'mc1', 'mc2', 'fixed', 'ebitda', 'ebit'];

/**
 * Totali di budget del periodo P (Σ mesi × quota del mese dentro P) per la versione indicata; null senza budget.
 * → {…somme, months: [{month, fraction}], total (forma dei fatti), fixedDetail (forma di fixedFor), pnl, coverage}
 */
export function budgetTotals(d, P, version = 'B') {
  if (!d || !P?.from || !P?.to) return null;
  const out = Object.fromEntries(SUMS.map(k => [k, 0]));
  const fixedDetail = { total: 0, cash: 0, nonCash: 0, byCenter: {}, byGroup: { stabilimento: 0, struttura: 0, commerciale: 0 }, split: { stabilimento: 0, commerciale: 0, struttura: 0, nonCash: 0 }, estimatedMonths: [], missingMonths: [] };
  const months = [];
  let any = false, covered = 0, all = 0;
  for (const m of monthsIn(P)) {
    const f = monthFraction(m, P);
    if (f <= 0) continue;
    all += f;
    const b = budgetMonth(d, m.slice(0, 4), m, version);
    months.push({ month: m, fraction: f, has: b.has });
    if (!b.has) continue;
    any = true; covered += f;
    for (const k of SUMS) out[k] += n0(b[k]) * f;
    const fd = b.fixedDetail;
    fixedDetail.total += fd.total * f; fixedDetail.cash += fd.cash * f; fixedDetail.nonCash += fd.nonCash * f;
    for (const [id, v] of Object.entries(fd.byCenter)) fixedDetail.byCenter[id] = (fixedDetail.byCenter[id] || 0) + v * f;
    for (const g of Object.keys(fixedDetail.byGroup)) fixedDetail.byGroup[g] += n0(fd.byGroup[g]) * f;
    for (const g of Object.keys(fixedDetail.split)) fixedDetail.split[g] += n0(fd.split[g]) * f;
  }
  if (!any) return null;
  const total = { tonnes: out.tonnes, revenue: out.revenue, listRevenue: out.listRevenue, discount: out.discount, raw: out.raw, shrink: out.shrink, energy: out.energy,
    varConv: out.varConv, pack: out.pack, fixConv: 0, logistics: out.logistics, commission: out.commission, finCost: 0, mc1: out.mc1, mc2: out.mc2, fullCost: 0, marginFull: 0, replVar: out.varCost, n: 0 };
  return { ...out, version, months, total, fixedDetail, pnl: { ...pnl(total, fixedDetail), budget: true, fixed: fixedDetail, estimatedMonths: [] }, coverage: all > 0 ? covered / all : 0 };
}

/**
 * Base del ponte dal budget (stessa forma di pvm.basis) per prodotto o specie: materie prime in '_stima',
 * energia in kWh e GPL quando le righe li portano.
 */
export function budgetBasis(d, P, version = 'B', by = 'productId') {
  const prod = {};
  for (const p of d.products || EMPTY) prod[p.id] = p;
  const fb = agentsPct(d);
  const rows = {};
  for (const m of monthsIn(P)) {
    const f = monthFraction(m, P);
    if (f <= 0) continue;
    for (const r of d.budget || EMPTY) {
      if (r.month !== m || (r.version || 'B') !== version) continue;
      const p = prod[r.productId] || {};
      const k = by === 'species' ? (r.species || p.species || '_') : (r.productId || '_');
      const o = (rows[k] ||= { key: k, t: 0, rev: 0, list: 0, raw: 0, shrink: 0, energy: 0, varConv: 0, pack: 0, logistics: 0, commission: 0, kwh: 0, gplKg: 0, kwhEur: 0, gplEur: 0, estEnergy: 0, ing: {}, n: 0 });
      const t = n0(r.tonnes) * f, s = n0(p.shrinkPct) / 100;
      const rev = t * n0(r.price), raw = t * n0(r.rawCostT);
      o.t += t; o.rev += rev; o.list += t * (has(r.list) ? +r.list : n0(r.price)); o.raw += raw;
      o.shrink += s > 0 && s < 1 ? raw * s / (1 - s) : 0;
      const ing = (o.ing._stima ||= { kg: 0, eur: 0 }); ing.kg += 1000 * t; ing.eur += raw;
      const energy = t * n0(r.energyT);
      if (has(r.kwhT) && has(r.kwhPrice)) {
        const kwh = t * +r.kwhT, gpl = t * n0(r.gplT), ke = kwh * +r.kwhPrice, ge = gpl * n0(r.gplPrice);
        o.kwh += kwh; o.gplKg += gpl; o.kwhEur += ke; o.gplEur += ge; o.estEnergy += energy - ke - ge;
      } else o.estEnergy += energy;
      o.energy += energy;
      o.varConv += t * (has(r.varConvT) ? +r.varConvT : has(p.varProcessCost) ? +p.varProcessCost : n0(p.processCost));
      o.pack += t * (has(r.packT) ? +r.packT : n0(p.packCost));
      o.logistics += t * (has(r.logisticsT) ? +r.logisticsT : n0(p.logisticsCost));
      o.commission += rev * (has(r.commissionPct) ? +r.commissionPct : fb) / 100;
      o.n++;
    }
  }
  const bt = budgetTotals(d, P, version);
  return { rows, fixed: bt ? bt.fixed : 0, fixedDetail: bt?.fixedDetail || null, by, P, budget: true };
}

// ---------------- consuntivo per mese ----------------
/** Consuntivo del mese (o del periodo fino a oggi nel mese in corso): numeri congelati se il mese è chiuso. */
export function actualMonth(d, ctx, month) {
  const today = todayOf(d, ctx), tm = today.slice(0, 7);
  if (month > tm) return null;
  const open = month === tm;
  const P = { from: month + '-01', to: open ? today : endOfMonth(month) };
  const c = !open ? closingOf(d, month) : null;
  if (c?.pnl) {
    const t = n0(c.pnl.tonnes), mc2 = n0(c.pnl.mc2), fixed = n0(c.fixed?.total);
    return { month, tonnes: t, revenue: n0(c.pnl.revenue), mc1: n0(c.pnl.mc1), mc2, fixed, ebit: mc2 - fixed, frozen: true, open: false, estimatedFixed: false };
  }
  const a = aggregateFacts(ctx?.facts || makeCtx(d, today).facts, d.salesHistory || EMPTY, P).total;
  const f = fixedFor(fixedRows(d), d.costCenters || EMPTY, P);
  return { month, tonnes: a.tonnes, revenue: a.revenue, mc1: a.mc1, mc2: a.mc2, fixed: f.total, ebit: a.mc2 - f.total, frozen: false, open, estimatedFixed: f.estimatedMonths.length > 0 };
}

const pick = b => ({ tonnes: b.tonnes, revenue: b.revenue, mc1: b.mc1, mc2: b.mc2, fixed: b.fixed, ebit: b.ebit });

/**
 * Budget e consuntivo mese per mese e da inizio anno.
 * → {year, version, months: [{month, bud, act|null, open}], ytd: {bud, act, delta, fraction}}
 * Nel mese in corso il budget da inizio anno conta la quota dei giorni trascorsi.
 */
export function budgetVsActual(d, ctx, year, version = activeVersion(d, year)) {
  const today = todayOf(d, ctx), tm = today.slice(0, 7);
  const months = [];
  const ytdB = { tonnes: 0, revenue: 0, mc1: 0, mc2: 0, fixed: 0, ebit: 0 }, ytdA = { tonnes: 0, revenue: 0, mc1: 0, mc2: 0, fixed: 0, ebit: 0 };
  for (let i = 1; i <= 12; i++) {
    const m = `${year}-${p2(i)}`;
    const bud = pick(budgetMonth(d, year, m, version));
    const act = actualMonth(d, ctx, m);
    const open = m === tm;
    months.push({ month: m, bud, act: act ? pick(act) : null, open, frozen: !!act?.frozen, estimatedFixed: !!act?.estimatedFixed });
    if (m < tm || open) {
      const f = open ? (daysBetween(m + '-01', today) + 1) / daysInMonth(m) : 1;
      for (const k of Object.keys(ytdB)) { ytdB[k] += bud[k] * f; ytdA[k] += act ? act[k] : 0; }
    }
  }
  const delta = Object.fromEntries(Object.keys(ytdB).map(k => [k, ytdA[k] - ytdB[k]]));
  return { year: +year, version, months, ytd: { bud: ytdB, act: ytdA, delta } };
}

/** Prezzo netto, provvigione e listino per t degli ultimi 90 giorni per prodotto (dai fatti). */
function last90(facts, today) {
  const from = addDays(today, -90), out = {};
  for (const f of facts || EMPTY) {
    if (f.date <= from || f.date > today) continue;
    const o = (out[f.productId] ||= { t: 0, rev: 0, list: 0, comm: 0 });
    o.t += f.tonnes; o.rev += f.revenue; o.list += f.listRevenue; o.comm += f.commission;
  }
  return out;
}

/** Consegne settimanali per prodotto nelle 52 settimane intere prima di quella di oggi. */
function weeklyByProduct(facts, today) {
  const w0 = addDays(mondayOf(today), -7 * 52), wEnd = addDays(mondayOf(today), -1);
  const out = {};
  for (const f of facts || EMPTY) {
    if (f.date < w0 || f.date > wEnd) continue;
    const k = Math.floor(daysBetween(w0, f.date) / 7);
    (out[f.productId] ||= Array(52).fill(0))[k] += f.tonnes;
  }
  return { w0, series: out };
}

/**
 * Stima di chiusura dell'anno: EBIT da inizio anno + MdC II previsto per il resto dell'anno − costi fissi del resto dell'anno.
 * Volumi del resto dell'anno: previsione settimanale (forecastAuto) di ogni prodotto sulle consegne delle ultime 52 settimane;
 * MdC II unitario = prezzo netto degli ultimi 90 giorni − (costo variabile di sostituzione di oggi + logistica + provvigione).
 * La banda P10–P90 somma i limiti dei singoli prodotti (le settimane di un prodotto si combinano come errori indipendenti): è approssimata.
 * → {ebitYtd, restMc2, restFixed, landing, p10, p90, budgetEbit, gap, gapPerMonth, requiredPerT, restT, restMonths, byMonth, approx: true}
 */
const landingCache = new WeakMap();
export function landing(d, ctx, year, version = activeVersion(d, year)) {
  const today = todayOf(d, ctx);
  ctx = ctx?.facts ? ctx : makeCtx(d, today);
  // stesso archivio e stessi fatti: si riusa il calcolo (segnali e pagine lo chiedono più volte)
  let byD = landingCache.get(d);
  if (!byD) { byD = new Map(); landingCache.set(d, byD); }
  const ck = `${year}|${version}|${today}`, hit = byD.get(ck);
  if (hit && hit.facts === ctx.facts) return hit.value;
  const value = landingCalc(d, ctx, year, version, today);
  byD.set(ck, { facts: ctx.facts, value });
  return value;
}
function landingCalc(d, ctx, year, version, today) {
  const ix = ctx.ix || makeIndex(d), costs = ctx.costs || costsOf(d, ix);
  const y0 = `${year}-01-01`, y1 = `${year}-12-31`;
  const ytdTo = today < y1 ? today : y1;
  let ebitYtd = 0, mc2Ytd = 0, fixedYtd = 0;
  if (ytdTo >= y0) {
    const a = aggregateFacts(ctx.facts, d.salesHistory || EMPTY, { from: y0, to: ytdTo }).total;
    const f = fixedFor(fixedRows(d), d.costCenters || EMPTY, { from: y0, to: ytdTo });
    mc2Ytd = a.mc2; fixedYtd = f.total; ebitYtd = a.mc2 - f.total;
  }
  const restFrom = addDays(today, 1) > y0 ? addDays(today, 1) : y0;
  const byMonth = {};
  for (const m of monthsIn(restFrom, y1)) byMonth[m] = { month: m, t: 0, rev: 0, mc2: 0, lo: 0, hi: 0, fixed: 0 };
  let restMc2 = 0, restLo = 0, restHi = 0, restT = 0, restFixed = 0;
  if (restFrom <= y1) {
    const p90 = last90(ctx.facts, today);
    const { series } = weeklyByProduct(ctx.facts, today);
    const wk0 = mondayOf(today); // prima settimana prevista = quella in corso
    const h = Math.max(1, Math.ceil((daysBetween(wk0, y1) + 1) / 7));
    for (const p of d.products || EMPTY) {
      const y = series[p.id];
      if (!y || y.every(v => !v)) continue;
      let pts = forecastAuto(y, h)?.points || [];
      if (!pts.length) { const avg = y.slice(-8).reduce((s, v) => s + v, 0) / 8; pts = Array.from({ length: h }, (_, k) => ({ k: k + 1, value: avg, lo: avg * 0.8, hi: avg * 1.2 })); }
      const q = p90[p.id];
      const price = q?.t > 0 ? q.rev / q.t : listAt(d.priceLists, p, today);
      const commT = q?.t > 0 ? q.comm / q.t : price * agentsPct(d) / 100;
      const c = costs[p.id] || {};
      const varConvT = has(p.varProcessCost) ? +p.varProcessCost : n0(p.processCost);
      const costT = n0(c.raw) + n0(c.shrink) + n0(c.energy) + varConvT + n0(p.packCost) + n0(p.logisticsCost) + commT;
      const uM = price - costT;
      // giorni del resto dell'anno: tonnellate e scarti P10/P90 per mese (settimane combinate come errori indipendenti)
      const acc = {}, tot = { v: 0, lo2: 0, hi2: 0 };
      for (const pt of pts) {
        const ws = addDays(wk0, 7 * (pt.k - 1));
        const v = Math.max(0, n0(pt.value)), dLo = Math.max(0, v - Math.max(0, n0(pt.lo ?? pt.value))), dHi = Math.max(0, Math.max(0, n0(pt.hi ?? pt.value)) - v);
        const inM = {};
        for (let i = 0; i < 7; i++) { const day = addDays(ws, i); if (day >= restFrom && day <= y1) inM[day.slice(0, 7)] = (inM[day.slice(0, 7)] || 0) + 1 / 7; }
        for (const [m, f] of Object.entries(inM)) {
          const a = (acc[m] ||= { v: 0, lo2: 0, hi2: 0 });
          a.v += v * f; a.lo2 += (dLo * f) ** 2; a.hi2 += (dHi * f) ** 2;
          tot.v += v * f; tot.lo2 += (dLo * f) ** 2; tot.hi2 += (dHi * f) ** 2;
        }
      }
      const band = a => { const lo = Math.max(0, a.v - Math.sqrt(a.lo2)) * uM, hi = (a.v + Math.sqrt(a.hi2)) * uM; return [Math.min(lo, hi), Math.max(lo, hi)]; };
      for (const [m, a] of Object.entries(acc)) {
        const bm = byMonth[m], [lo, hi] = band(a);
        bm.t += a.v; bm.rev += a.v * price; bm.mc2 += a.v * uM; bm.lo += lo; bm.hi += hi;
      }
      const [lo, hi] = band(tot);
      restT += tot.v; restMc2 += tot.v * uM; restLo += lo; restHi += hi;
    }
    for (const m of Object.keys(byMonth)) {
      const P = { from: m + '-01' < restFrom ? restFrom : m + '-01', to: endOfMonth(m) > y1 ? y1 : endOfMonth(m) };
      const f = fixedFor(fixedRows(d), d.costCenters || EMPTY, P).total;
      byMonth[m].fixed = f; byMonth[m].ebit = byMonth[m].mc2 - f; restFixed += f;
    }
  }
  const land = ebitYtd + restMc2 - restFixed;
  const hb = hasBudget(d, year, version);
  let budgetEbit = null;
  if (hb) { budgetEbit = 0; for (let i = 1; i <= 12; i++) budgetEbit += budgetMonth(d, year, i, version).ebit; }
  const restDays = restFrom <= y1 ? daysBetween(restFrom, y1) + 1 : 0;
  const restMonths = restDays / (365 / 12);
  const gap = budgetEbit == null ? null : land - budgetEbit;
  return {
    year: +year, version, ebitYtd, mc2Ytd, fixedYtd, restMc2, restFixed, landing: land, p10: ebitYtd + restLo - restFixed, p90: ebitYtd + restHi - restFixed,
    budgetEbit, gap, gapPerMonth: gap == null || restMonths <= 0 ? null : gap / restMonths, requiredPerT: gap == null || restT <= 0 ? null : -gap / restT,
    restT, restDays, restMonths, restFrom, byMonth: Object.values(byMonth), approx: true,
  };
}

/** Operazioni che approvano (bloccano) la versione: settings.finance.budget e budgetStatus[year]. */
export function approveBudgetOps(d, year, version, by, at) {
  const day = at || todayOf(d);
  const st = { year: +year, version: version || activeVersion(d, year), status: 'approvato', approvedAt: day, approvedBy: String(by || '').trim() || 'Direzione' };
  return [{ kind: 'settings', value: s => {
    const fin = s.finance || {}, old = fin.budgetStatus?.[year] || (fin.budget && +fin.budget.year === +year ? fin.budget : null);
    const vers = { ...(fin.budgetVersions?.[year] || {}) };
    // la versione approvata prima resta approvata ma superata (si vede ancora nello storico delle versioni)
    if (old && old.status === 'approvato' && (old.version || 'B') !== st.version) vers[old.version || 'B'] = { ...old, ...(vers[old.version || 'B'] || {}), status: 'approvato', supersededAt: day };
    vers[st.version] = { ...(vers[st.version] || {}), ...st };
    const keepCur = fin.budget && +fin.budget.year > +year && fin.budget.status === 'approvato';
    return { ...s, finance: { ...fin, budget: keepCur ? fin.budget : st, budgetStatus: { ...(fin.budgetStatus || {}), [year]: st }, budgetVersions: { ...(fin.budgetVersions || {}), [year]: vers } } };
  } }];
}

/** Mese con dati (fatti interi, storico, o primo mese parziale riportato al mese intero) per la stessa stagione. */
function seasonSource(d, ctx, month, first) {
  const P = { from: month + '-01', to: endOfMonth(month) };
  const a = aggregateFacts(ctx.facts, d.salesHistory || EMPTY, P, ['productId']);
  let scale = 1;
  if (first && first.slice(0, 7) === month && first > month + '-01') scale = daysInMonth(month) / (daysBetween(first, endOfMonth(month)) + 1);
  return { rows: a.rows, scale, empty: !a.rows.length };
}

/**
 * Righe di un nuovo budget (senza scriverle): volumi dello stesso mese degli ultimi 12 mesi × (1 + crescita della specie),
 * prezzo = listino di oggi × (1 − sconto realizzato a 90 giorni) × (1 + aumento di listino dal mese indicato),
 * materie prime ed energia ai costi di oggi (× variazione MP), fissi = stesso mese dell'anno prima × (1 + inflazione o % del centro).
 * opts: {year, version = 'B', growthPct: {specie: %}, listDeltaPct = 0, listFromMonth = 3, mpDeltaPct = 0, fixedInflPct = 2, centerPct: {centro: %}}
 * → {rows, fixed}
 */
export function seedBudgetRows(d, ctx, opts = {}) {
  const today = todayOf(d, ctx);
  ctx = ctx?.facts ? ctx : makeCtx(d, today);
  const { year = +today.slice(0, 4) + 1, version = 'B', growthPct = {}, listDeltaPct = 0, listFromMonth = 3, mpDeltaPct = 0, fixedInflPct = 2, centerPct = {} } = opts;
  const ix = ctx.ix || makeIndex(d), costs = ctx.costs || costsOf(d, ix);
  const tm = today.slice(0, 7), last = addMonths(tm, -1);
  const window = Array.from({ length: 12 }, (_, k) => addMonths(last, k - 11));
  const first = firstFactDate(ctx.facts);
  const q90 = last90(ctx.facts, today);
  // provvigione media pesata sui ricavi degli ultimi 12 mesi
  const a12 = aggregateFacts(ctx.facts, d.salesHistory || EMPTY, { from: window[0] + '-01', to: endOfMonth(last) }).total;
  const commPct = a12.revenue > 0 ? a12.commission / a12.revenue * 100 : agentsPct(d);
  const en = d.settings?.energy || {};
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const m = `${year}-${p2(i)}`;
    const src = window.find(w => +w.slice(5, 7) === i);
    const s = src ? seasonSource(d, ctx, src, first) : { rows: [], scale: 1 };
    for (const r of s.rows) {
      const p = ix.prod[r.productId];
      if (!p || p.active === false) continue;
      const g = n0(growthPct?.[p.species]) / 100;
      const t = round(r.tonnes * s.scale * (1 + g), 1);
      if (t <= 0) continue;
      const q = q90[p.id];
      const disc = q?.list > 0 ? Math.max(0, 1 - q.rev / q.list) : 0;
      const up = i >= listFromMonth ? 1 + n0(listDeltaPct) / 100 : 1;
      const list = listAt(d.priceLists, p, today) * up;
      const c = costs[p.id] || {}, line = ix.line[p.lineId] || {};
      rows.push({
        id: `bu-${year}-${version}-${p2(i)}-${p.id}`, year: +year, version, month: m, productId: p.id, species: p.species ?? null,
        tonnes: t, list: round(list, 2), price: round(list * (1 - disc), 2), rawCostT: round(n0(c.raw) * (1 + n0(mpDeltaPct) / 100), 2), energyT: round(n0(c.energy), 2),
        kwhT: n0(line.kwhPerT), gplT: n0(line.gplKgPerT), kwhPrice: n0(en.kwhPrice), gplPrice: n0(en.gplPrice),
        varConvT: has(p.varProcessCost) ? +p.varProcessCost : n0(p.processCost), packT: n0(p.packCost), logisticsT: n0(p.logisticsCost),
        commissionPct: round(commPct, 3), source: 'seed',
      });
    }
  }
  // costi fissi: stesso mese dell'anno prima (o di due anni prima) per centro, altrimenti media degli ultimi 12 mesi
  const cons = {};
  for (const r of d.fixedCosts || EMPTY) if ((r.kind || 'consuntivo') === 'consuntivo') (cons[r.centerId] ||= {})[String(r.month).slice(0, 7)] = (cons[r.centerId]?.[String(r.month).slice(0, 7)] || 0) + n0(r.amount);
  const fixed = [];
  for (const c of d.costCenters || EMPTY) {
    const byM = cons[c.id] || {};
    const ms = Object.keys(byM).sort();
    if (!ms.length) continue;
    const mean = ms.slice(-12).reduce((s, m) => s + byM[m], 0) / Math.min(12, ms.length);
    const k = 1 + n0(centerPct?.[c.id] ?? fixedInflPct) / 100;
    for (let i = 1; i <= 12; i++) {
      const m = `${year}-${p2(i)}`;
      const base = byM[addMonths(m, -12)] ?? byM[addMonths(m, -24)] ?? mean;
      fixed.push({ id: `fb-${year}-${version}-${p2(i)}-${c.id}`, month: m, centerId: c.id, kind: 'budget', version, amount: Math.round(base * k), source: 'budget', note: '' });
    }
  }
  return { rows, fixed };
}

/**
 * Operazioni per creare (o rigenerare) il budget: sostituisce le righe della stessa versione e i costi fissi di budget dell'anno,
 * e segna lo stato 'bozza'. Un solo store.batch: si annulla con Ctrl+Z.
 */
export function seedBudget(d, ctx, opts = {}) {
  const today = todayOf(d, ctx);
  const year = opts.year ?? +today.slice(0, 4) + 1, version = opts.version || 'B';
  const { rows, fixed } = seedBudgetRows(d, ctx, { ...opts, year, version });
  return budgetWriteOps(d, year, version, rows, fixed, { by: opts.by, at: today, basedOn: opts.basedOn });
}

/** Operazioni di scrittura di un budget già calcolato (righe e fissi), con lo stato 'bozza'. */
export function budgetWriteOps(d, year, version, rows, fixed, { by = null, at = null, basedOn = null } = {}) {
  if (isLocked(d, year, version)) return null; // versione approvata: si cambia solo con una revisione
  const y = String(year);
  const inYear = r => String(r.month || '').startsWith(y + '-') && (r.version || 'B') === version;
  const oldRows = (d.budget || EMPTY).filter(inYear).map(r => r.id);
  const oldFixed = (d.fixedCosts || EMPTY).filter(r => r.kind === 'budget' && inYear(r)).map(r => r.id);
  const st = { year: +year, version, status: 'bozza', createdAt: at || todayOf(d), createdBy: by || null, basedOn: basedOn || null };
  return [
    oldRows.length ? { kind: 'removeMany', coll: 'budget', ids: oldRows } : null,
    { kind: 'addMany', coll: 'budget', objs: rows },
    oldFixed.length ? { kind: 'removeMany', coll: 'fixedCosts', ids: oldFixed } : null,
    { kind: 'addMany', coll: 'fixedCosts', objs: fixed },
    { kind: 'settings', value: s => {
      const fin = s.finance || {};
      const cur = fin.budgetStatus?.[year] || (fin.budget && +fin.budget.year === +year ? fin.budget : null);
      // una bozza non sostituisce la versione approvata dell'anno: resta il riferimento finché la revisione non è approvata
      const keepYear = cur && cur.status === 'approvato' && (cur.version || 'B') !== version;
      const keepCur = fin.budget && fin.budget.status === 'approvato' && (+fin.budget.year !== +year || keepYear);
      return { ...s, finance: { ...fin, budget: keepCur ? fin.budget : st, budgetStatus: { ...(fin.budgetStatus || {}), [year]: keepYear ? cur : st },
        budgetVersions: { ...(fin.budgetVersions || {}), [year]: { ...(fin.budgetVersions?.[year] || {}), [version]: st } } } };
    } },
  ].filter(Boolean);
}

/** Prossima versione di revisione dell'anno: 'R1', 'R2'… */
export function nextRevision(d, year) {
  const n = budgetVersions(d, year).map(v => /^R(\d+)$/.exec(v)?.[1]).filter(Boolean).map(Number);
  return 'R' + ((n.length ? Math.max(...n) : 0) + 1);
}

/**
 * Segnali del budget: EBIT da inizio anno sotto budget oltre la materialità (attenzione), stima di chiusura oltre il 10% sotto
 * il budget (critico), budget dell'anno successivo mancante dopo il 15 novembre (info), mese precedente ancora da chiudere dopo il 5 (attenzione).
 */
export function budgetSignals(d, ctx) {
  const out = [];
  try {
    const today = todayOf(d, ctx), year = +today.slice(0, 4), tm = today.slice(0, 7);
    const mat = d.settings?.finance?.materiality || {};
    const ver = activeVersion(d, year);
    if ((ctx?.facts?.length || d.shipments?.length) && hasBudget(d, year, ver)) {
      const bva = budgetVsActual(d, ctx, year, ver);
      const gap = bva.ytd.act.ebit - bva.ytd.bud.ebit;
      const thr = Math.max(n0(mat.abs ?? 5000), n0(mat.pct ?? 2) / 100 * Math.abs(bva.ytd.bud.ebit));
      if (gap < -thr) out.push({
        key: `budget-ytd:${year}:${tm}`, area: 'direzione', roles: ['direzione'], severity: 'attenzione',
        title: `EBIT da inizio anno sotto il budget di ${kEur(-gap)}`,
        why: `Da gennaio a oggi l’EBIT è ${kEur(bva.ytd.act.ebit)} contro ${kEur(bva.ytd.bud.ebit)} di budget (versione ${ver}); la soglia di materialità è ${kEur(thr)}. MdC II ${kEur(bva.ytd.act.mc2)} contro ${kEur(bva.ytd.bud.mc2)}.`,
        action: 'Aprire gli scostamenti «vs budget» per vedere quanto pesano prezzi, volumi, mix e costi, e decidere le azioni sui listini e sugli acquisti.',
        impact: -gap, link: { area: 'direzione', tab: 'budget' },
      });
      const L = landing(d, ctx, year, ver);
      if (L.budgetEbit != null && L.budgetEbit > 0 && L.landing < L.budgetEbit * 0.9) out.push({
        key: `budget-landing:${year}:${tm}`, area: 'direzione', roles: ['direzione'], severity: 'critico',
        title: `Stima di chiusura ${year} sotto il budget del ${Math.round((1 - L.landing / L.budgetEbit) * 100)}%`,
        why: `EBIT stimato a fine anno ${kEur(L.landing)} (banda approssimata ${kEur(L.p10)} – ${kEur(L.p90)}) contro ${kEur(L.budgetEbit)} di budget. Per recuperare servono ${kEur(-L.gapPerMonth)} al mese, cioè ${nf(L.requiredPerT, 1)} €/t in più sulle ${nf(L.restT)} t previste.`,
        action: 'Rivedere listini e sconti, coprire le materie prime principali e valutare una revisione del budget.',
        impact: Math.max(0, L.budgetEbit - L.landing), link: { area: 'direzione', tab: 'budget' },
      });
    }
    if (today.slice(5) > '11-15' && !hasBudget(d, year + 1)) out.push({
      key: `budget-next:${year + 1}`, area: 'direzione', roles: ['direzione'], severity: 'info',
      title: `Budget ${year + 1} da preparare`,
      why: `Siamo dopo il 15 novembre e per il ${year + 1} non c’è ancora un budget: senza, i confronti e la stima di chiusura dell’anno nuovo non sono disponibili.`,
      action: `Creare il budget ${year + 1} dalla scheda Budget (parte dai volumi degli ultimi 12 mesi e dai costi di oggi).`,
      impact: 1e4, link: { area: 'direzione', tab: 'budget' },
    });
    const prev = addMonths(tm, -1), ct = d.settings?.closedThrough;
    const hasPrev = (ctx?.facts || EMPTY).some(f => f.month === prev) || (d.shipments || EMPTY).some(s => String(s.date).startsWith(prev));
    if (hasPrev && (!ct || String(ct).slice(0, 7) < prev) && +today.slice(8, 10) > 5) out.push({
      key: `close:${prev}`, area: 'direzione', roles: ['direzione'], severity: 'attenzione',
      title: `Chiudere il mese di ${monthName(prev)}`,
      why: `Il mese è finito da ${+today.slice(8, 10)} giorni ma non è ancora chiuso${ct ? ` (ultimo mese chiuso: ${monthName(String(ct).slice(0, 7))})` : ''}: i numeri possono ancora cambiare e il report del consiglio non è definitivo.`,
      action: 'Completare la lista di controllo (costi fissi, letture energia, lotti in attesa) e chiudere il mese.',
      impact: 2e4, link: { area: 'direzione', tab: 'chiusura', id: prev },
    });
  } catch { /* un errore nel budget non deve fermare gli altri segnali */ }
  return out;
}
