/* FeedOS 17 · Punto di pareggio e leva operativa (pacchetto WP3).
 * Dal consuntivo: margine di contribuzione (MdC II = ricavi − costi variabili al costo effettivo, trasporti e provvigioni)
 * e costi fissi reali per centro di costo (fixedFor). Pareggio in t = CF / MdC per t; in € = CF / MdC %;
 * margine di sicurezza = (t − pareggio) / t; leva operativa = MdC II / EBIT (= 1 / margine di sicurezza).
 * Assorbimento dei costi fissi di stabilimento per linea: tariffa oraria a capacità normale × ore lavorate contro i costi reali. */
import { aggregateFacts, fixedFor, dataStart, coverage } from './actuals.js';
import { addDays, byId, daysBetween, endOfMonth, monthFraction, sum } from '../core/util.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];

/**
 * Struttura dei costi del periodo P (contratto) o null se non ci sono né consegne né costi fissi.
 * → {tonnes, revenue, variable, mc1, mc2, mcT, mcPct, cf, cfCash, cfNonCash, ebit, ebitda, bepT, bepEur, mos, mosT, dol, fixedT, priceT, varT,
 *    variableParts, byCenter, byGroup, estimatedMonths, missingMonths}
 */
export function costStructure(d, ctx, P) {
  const A = aggregateFacts(ctx.facts || EMPTY, d.salesHistory || EMPTY, P).total;
  const hasFixed = (d.fixedCosts || EMPTY).length > 0;
  if (!(A.tonnes > 0) && !hasFixed) return null;
  const F = fixedFor(d.fixedCosts || EMPTY, d.costCenters || EMPTY, P);
  const t = A.tonnes, revenue = A.revenue, mc2 = A.mc2, cf = F.total;
  const variable = revenue - mc2;
  const mcT = t > 0 ? mc2 / t : null, mcPct = revenue > 0 ? mc2 / revenue : null;
  const ebit = mc2 - cf;
  const bepT = mcT > 0 ? cf / mcT : null, bepEur = mcPct > 0 ? cf / mcPct : null;
  return {
    from: P.from, to: P.to, tonnes: t, revenue, variable, mc1: A.mc1, mc2, mcT, mcPct,
    cf, cfCash: F.cash, cfNonCash: F.nonCash, ebit, ebitda: mc2 - F.cash,
    bepT, bepEur, mos: t > 0 && bepT != null ? (t - bepT) / t : null, mosT: bepT != null ? t - bepT : null, mosEur: bepEur != null ? revenue - bepEur : null,
    dol: Math.abs(ebit) > 1e-9 ? mc2 / ebit : null, fixedT: t > 0 ? cf / t : null, priceT: t > 0 ? revenue / t : null, varT: t > 0 ? variable / t : null,
    variableParts: { raw: A.raw, shrink: A.shrink, energy: A.energy, varConv: A.varConv, pack: A.pack, logistics: A.logistics, commission: A.commission },
    byCenter: F.byCenter, byGroup: F.byGroup, estimatedMonths: F.estimatedMonths, missingMonths: F.missingMonths, months: F.months,
  };
}

/**
 * Pareggio mese per mese (mesi 'YYYY-MM'); il mese in corso arriva a oggi.
 * fixed 'competenza' (di base): costi fissi del mese = costi dei 12 mesi fino a fine mese × giorni / 365, così tredicesima,
 * quattordicesima e manutenzioni straordinarie non deformano il singolo mese; 'mese': costi registrati nel mese (cfBooked).
 * cov = quota del mese coperta dai dati di vendita (sotto 0,9 il mese non è confrontabile).
 */
export function bepSeries(d, ctx, months, { fixed = 'competenza' } = {}) {
  const today = ctx.today;
  const start = dataStart(ctx.facts || EMPTY, d.salesHistory || EMPTY);
  return (months || EMPTY).map(m => {
    const from = m + '-01', end = endOfMonth(m), to = today && end > today ? today : end;
    const P = { from, to };
    const cs = from <= to ? costStructure(d, ctx, P) : null;
    const base = { month: m, from, to, open: to < end, fraction: monthFraction(m, P), cov: coverage({ ...P, days: daysBetween(from, to) + 1 }, start) ?? 0 };
    if (!cs) return { ...base, tonnes: 0, mc2: 0, cf: 0, cfBooked: 0, mos: null, bepT: null, ebit: null, estimated: false };
    let cf = cs.cf;
    if (fixed === 'competenza' && (d.fixedCosts || EMPTY).length) {
      const year = fixedFor(d.fixedCosts, d.costCenters || EMPTY, { from: addDays(end, -364), to: end }).total;
      cf = year * (daysBetween(from, to) + 1) / 365;
    }
    const bepT = cs.mcT > 0 ? cf / cs.mcT : null;
    return { ...base, ...cs, cfBooked: cs.cf, cf, ebit: cs.mc2 - cf, ebitBooked: cs.ebit, bepT, mos: cs.tonnes > 0 && bepT != null ? (cs.tonnes - bepT) / cs.tonnes : null,
      mosBooked: cs.mos, dol: Math.abs(cs.mc2 - cf) > 1e-9 ? cs.mc2 / (cs.mc2 - cf) : null, estimated: !!cs.estimatedMonths?.length };
  });
}

/** Punti delle rette di ricavi e costi totali da 0 a maxPct × max(volume, pareggio). → {points: [{t, revenue, cost, variable, fixed}], xMax} */
export function bepCurve(cs, maxPct = 1.3, steps = 27) {
  if (!cs || !(cs.tonnes > 0)) return { points: [], xMax: 0 };
  const xMax = maxPct * Math.max(cs.tonnes, cs.bepT || 0);
  const n = Math.max(2, steps);
  const points = Array.from({ length: n }, (_, i) => {
    const t = xMax * i / (n - 1);
    return { t, revenue: t * cs.priceT, variable: t * cs.varT, fixed: cs.cf, cost: cs.cf + t * cs.varT };
  });
  return { points, xMax };
}

/**
 * Assorbimento dei costi fissi di stabilimento per linea nel periodo P.
 * Costi reali: centri del gruppo stabilimento; quelli con lineId vanno alla linea, gli altri si ripartiscono col loro driver
 * (ore lavorate di base; 'tonnellate' per t prodotte, 'lotti' per numero di lavorazioni).
 * Tariffa €/h: settings.ops.lineCostH[linea] se impostata, altrimenti costi dei 12 mesi fino a P.to / ore a capacità normale
 * (ore settimanali × 52 × fattore di utilizzo); senza ore settimanali, costi / ore lavorate dei 12 mesi.
 * Assorbito = tariffa × ore lavorate in P; sotto/sopra assorbimento = assorbito − costi reali (negativo: capacità non usata o costi oltre la tariffa).
 */
export function absorption(d, ctx, P) {
  const lines = d.lines || EMPTY;
  const util = has(d.settings?.ops?.utilFactor) ? +d.settings.ops.utilFactor : 0.9;
  const over = d.settings?.ops?.lineCostH || {};
  const centers = (d.costCenters || EMPTY).filter(c => c.group === 'stabilimento');
  const alloc = (Q) => {
    const drv = {};
    for (const l of lines) drv[l.id] = { hours: 0, tonnes: 0, runs: 0 };
    for (const r of d.runs || EMPTY) {
      if (!r.date || r.date < Q.from || r.date > Q.to || !drv[r.lineId]) continue;
      const o = drv[r.lineId]; o.hours += n0(r.hours); o.tonnes += n0(r.tonnes); o.runs++;
    }
    const F = fixedFor(d.fixedCosts || EMPTY, d.costCenters || EMPTY, Q);
    const tot = { hours: sum(Object.values(drv), o => o.hours), tonnes: sum(Object.values(drv), o => o.tonnes), runs: sum(Object.values(drv), o => o.runs) };
    const cost = {}, byC = {};
    for (const l of lines) { cost[l.id] = 0; byC[l.id] = {}; }
    let unassigned = 0;
    for (const c of centers) {
      const amt = n0(F.byCenter[c.id]);
      if (!amt) continue;
      if (c.lineId && cost[c.lineId] != null) { cost[c.lineId] += amt; byC[c.lineId][c.id] = amt; continue; }
      const k = c.driver === 'tonnellate' ? 'tonnes' : c.driver === 'lotti' ? 'runs' : 'hours';
      if (!tot[k]) { unassigned += amt; continue; }
      for (const l of lines) { const v = amt * drv[l.id][k] / tot[k]; cost[l.id] += v; byC[l.id][c.id] = v; }
    }
    return { drv, cost, byC, unassigned, F };
  };
  const cur = alloc(P);
  const P12 = { from: addDays(P.to, -364), to: P.to };
  const ref = alloc(P12);
  const rows = lines.map(l => {
    const dv = cur.drv[l.id], actual = cur.cost[l.id];
    const normalH = n0(l.hoursWeek) * 52 * util;
    let rate, rateSource;
    if (has(over[l.id])) { rate = +over[l.id]; rateSource = 'impostazione'; }
    else if (normalH > 0) { rate = ref.cost[l.id] / normalH; rateSource = 'capacità'; }
    else { rate = ref.drv[l.id].hours > 0 ? ref.cost[l.id] / ref.drv[l.id].hours : null; rateSource = 'consuntivo'; }
    const days = Math.round((Date.parse(P.to) - Date.parse(P.from)) / 864e5) + 1;
    const capacityHours = normalH * days / 364;
    const absorbed = rate != null ? rate * dv.hours : null;
    return {
      lineId: l.id, name: l.name, code: l.code, hours: dv.hours, tonnes: dv.tonnes, runs: dv.runs,
      capacityHours, util: capacityHours > 0 ? dv.hours / capacityHours : null,
      actual, rateActual: dv.hours > 0 ? actual / dv.hours : null, rate, rateSource, absorbed,
      underOver: absorbed != null ? absorbed - actual : null, byCenter: cur.byC[l.id],
    };
  });
  const T = k => sum(rows, r => r[k] || 0);
  return { rows, totals: { hours: T('hours'), tonnes: T('tonnes'), actual: T('actual'), absorbed: T('absorbed'), underOver: T('underOver') }, unassigned: cur.unassigned, centers: byId(centers), utilFactor: util };
}
