/* FeedOS 17 · Provvigioni degli agenti ed estratto conto trimestrale (pacchetto WP4).
 * Una riga per consegna, attribuita all'agente della consegna (shipments.agentId, non quello assegnato oggi):
 * percentuale per prodotto, per scaglione di fatturato da inizio esercizio o di base; ridotta sotto il prezzo minimo
 * al costo pieno EFFETTIVO; maturata al fatturato (fattura emessa o mese chiuso) o all'incasso (quota pagata della fattura).
 * Enasarco e FIRR sono valori precompilati da verificare con il consulente. Funzioni pure. */
import { addDays, endOfMonth, addMonths, byId, sum, quarterOf } from '../core/util.js';
import { minPrice } from './costing.js';
import { creditSummary } from './credit.js';
import { winRate, funnel, realization } from './pricing.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];
const inP = (date, P) => !!date && date >= P.from && date <= P.to;

/** Regole di base (settings.agentRules le sostituisce): Enasarco 17% metà a carico dell'agente, FIRR a scaglioni annui. */
export const DEFAULT_AGENT_RULES = Object.freeze({
  enasarcoPct: 17,
  massimale: { mono: null, pluri: null },
  firr: { mono: [[6200, 4], [9300, 2], [null, 1]], pluri: [[12400, 4], [18600, 2], [null, 1]] },
});
/** Regole provvigionali dell'archivio con i valori di base dove mancano. */
export function agentRules(d) {
  const r = d?.settings?.agentRules || {};
  return {
    ...DEFAULT_AGENT_RULES, ...r,
    enasarcoPct: has(r.enasarcoPct) ? +r.enasarcoPct : DEFAULT_AGENT_RULES.enasarcoPct,
    massimale: { ...DEFAULT_AGENT_RULES.massimale, ...(r.massimale || {}) },
    firr: { ...DEFAULT_AGENT_RULES.firr, ...(r.firr || {}) },
  };
}

/**
 * Schema provvigionale dell'agente: agent.scheme con i valori di base
 * {basePct: commissionPct, tiers: [], byProduct: {}, belowMinFactor: 0,5, accrual: 'fatturato', mandate: 'mono'}.
 * tiers = [{from: € fatturato da inizio esercizio, pct}]; byProduct = {codice o id prodotto: pct}.
 */
export function schemeOf(agent) {
  const s = agent?.scheme || {};
  const tiers = (Array.isArray(s.tiers) ? s.tiers : EMPTY).filter(t => has(t?.from) && has(t?.pct)).map(t => ({ from: +t.from, pct: +t.pct })).sort((a, b) => a.from - b.from);
  return {
    basePct: has(s.basePct) ? +s.basePct : n0(agent?.commissionPct),
    tiers,
    byProduct: s.byProduct && typeof s.byProduct === 'object' ? { ...s.byProduct } : {},
    belowMinFactor: has(s.belowMinFactor) ? +s.belowMinFactor : 0.5,
    accrual: s.accrual === 'incasso' ? 'incasso' : 'fatturato',
    mandate: s.mandate === 'pluri' ? 'pluri' : 'mono',
  };
}
/** Percentuale dello scaglione per il fatturato da inizio esercizio ytd (null senza scaglioni applicabili). */
export function tierPct(scheme, ytd) {
  let pct = null;
  for (const t of scheme.tiers || EMPTY) if (ytd >= t.from) pct = t.pct;
  return pct;
}

/** FIRR a scaglioni sul totale annuo delle provvigioni: brackets [[fino a €, %], …, [null, %]]. */
export function firrOf(total, brackets = DEFAULT_AGENT_RULES.firr.mono) {
  let out = 0, prev = 0;
  const x = Math.max(0, n0(total));
  for (const [cap, pct] of brackets || EMPTY) {
    const top = cap == null ? Infinity : +cap;
    if (x > prev) out += (Math.min(x, top) - prev) * n0(pct) / 100;
    prev = top;
    if (x <= top) break;
  }
  return out;
}

/** 'YYYY-Qn' → {from, to, label}. */
export function quarterRange(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(q || ''));
  if (!m) return null;
  const y = m[1], k = +m[2], m0 = String(3 * k - 2).padStart(2, '0'), m1 = `${y}-${String(3 * k).padStart(2, '0')}`;
  return { from: `${y}-${m0}-01`, to: endOfMonth(m1), label: `${k}° trimestre ${y}`, key: q };
}
/** Trimestri che toccano il periodo P, dal più recente: ['2026-Q4', '2026-Q3', …]. */
export function quartersIn(P) {
  const out = [];
  let q = quarterOf(P.to);
  for (let i = 0; i < 12; i++) {
    const r = quarterRange(q);
    if (!r || r.to < P.from) break;
    out.push(q);
    q = quarterOf(addDays(r.from, -1));
  }
  return out;
}
/** Ultimo trimestre chiuso alla data (quello prima del trimestre in corso). */
export const lastClosedQuarter = today => quarterOf(addDays(quarterRange(quarterOf(today)).from, -1));

// fatture e incassi per consegna (WP2: invoices.ddts = [shipmentId]); con l'archivio senza fatture la maturazione è stimata
function invoiceIndex(d, today) {
  const byShip = new Map(), paid = {};
  for (const p of d.payments || EMPTY) if (p.invoiceId && (!p.date || p.date <= today)) paid[p.invoiceId] = (paid[p.invoiceId] || 0) + n0(p.amount);
  for (const inv of d.invoices || EMPTY) for (const s of inv.ddts || EMPTY) byShip.set(s, inv);
  return { byShip, paid, none: !(d.invoices || EMPTY).length };
}
/** Quota pagata della fattura (0…1): incassi registrati fino a oggi, altrimenti paidAmount; 'pagata' vale 1. */
export function paidShare(inv, paidByInvoice = {}) {
  if (!inv) return 0;
  if (inv.status === 'pagata') return 1;
  const total = n0(inv.total) || n0(inv.taxable);
  const paid = has(paidByInvoice[inv.id]) ? paidByInvoice[inv.id] : n0(inv.paidAmount);
  return total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
}

// righe di tutte le consegne (servono gli scaglioni da inizio esercizio anche fuori dal periodo), memorizzate per fatti
const cache = new WeakMap();
function allRows(d, ctx) {
  const facts = ctx?.facts || EMPTY, today = ctx?.today;
  const deps = [d.agents, d.invoices, d.payments, d.customers, d.products, d.settings?.finance?.fiscalYearStartMonth, today];
  const hit = cache.get(facts);
  if (hit && hit.deps.length === deps.length && hit.deps.every((x, i) => x === deps[i])) return hit.rows;
  const agents = byId(d.agents || EMPTY), prod = ctx.ix?.prod || byId(d.products || EMPTY), cust = ctx.ix?.cust || byId(d.customers || EMPTY);
  const fy = Math.min(12, Math.max(1, Math.round(n0(d.settings?.finance?.fiscalYearStartMonth)) || 1));
  const fyKey = date => { const y = +date.slice(0, 4), m = +date.slice(5, 7); return m >= fy ? y : y - 1; };
  const inv = invoiceIndex(d, today);
  const sorted = facts.filter(f => f.agentId && f.tonnes > 0).sort((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id), 'it', { numeric: true })));
  const rows = [];
  let curAgent = null, curFy = null, ytd = 0, scheme = null;
  for (const f of sorted) {
    if (f.agentId !== curAgent) { curAgent = f.agentId; curFy = null; scheme = schemeOf(agents[f.agentId]); }
    const k = fyKey(f.date);
    if (k !== curFy) { curFy = k; ytd = 0; }
    const p = prod[f.productId], price = f.revenue / f.tonnes, fullT = f.fullCost / f.tonnes;
    const minP = p ? minPrice(fullT, p.minMarginPct) : null;
    const belowMin = minP != null && price < minP - 1e-9;
    const bp = p ? (scheme.byProduct[p.code] ?? scheme.byProduct[p.id]) : null;
    const tp = has(bp) ? null : tierPct(scheme, ytd);
    const pctBase = has(bp) ? +bp : tp ?? scheme.basePct;
    const source = has(bp) ? 'prodotto' : tp != null ? 'scaglione' : 'base';
    const pct = pctBase * (belowMin ? scheme.belowMinFactor : 1);
    const amount = f.revenue * pct / 100;
    // maturazione alla data di oggi
    const invoice = inv.byShip.get(f.id) || null;
    let share, state, estimated = false;
    if (invoice?.status === 'insoluta') { share = 0; state = 'stornata'; }
    else if (scheme.accrual === 'incasso') {
      if (invoice) share = paidShare(invoice, inv.paid);
      else if (inv.none) { // senza fatture: pagata se la scadenza contrattuale (fine mese) è passata
        const c = cust[f.customerId], days = has(c?.terms?.days) ? +c.terms.days : has(c?.paymentDays) ? +c.paymentDays : 60;
        share = endOfMonth(addDays(endOfMonth(f.date), days)) <= today ? 1 : 0; estimated = true;
      } else share = 0;
      state = share >= 1 - 1e-9 ? 'maturata' : share > 0 ? 'parziale' : 'da maturare';
    } else {
      share = invoice || endOfMonth(f.date) < today ? 1 : 0;
      state = share ? 'maturata' : 'da maturare';
      estimated = !invoice && inv.none && !!share;
    }
    rows.push({
      id: f.id, date: f.date, month: f.month, agentId: f.agentId, customerId: f.customerId, productId: f.productId,
      tonnes: f.tonnes, revenue: f.revenue, price, fullT, minPrice: minP, belowMin, ytdBefore: ytd,
      pctBase, pct, source, amount, accrued: amount * share, pending: amount * (1 - share), share, state, estimated,
      standard: f.commission, invoice: invoice?.number || invoice?.code || null, accrual: scheme.accrual,
    });
    ytd += f.revenue;
  }
  cache.set(facts, { deps, rows });
  return rows;
}

/** Righe provvigionali delle consegne di P (di un agente o di tutti). Vedi allRows per i campi. */
export function commissionRows(d, ctx, P, agentId) {
  return allRows(d, ctx).filter(r => inP(r.date, P) && (!agentId || r.agentId === agentId));
}

const totalsOf = rows => ({
  n: rows.length, revenue: sum(rows, r => r.revenue), tonnes: sum(rows, r => r.tonnes),
  amount: sum(rows, r => r.amount), accrued: sum(rows, r => r.accrued), pending: sum(rows, r => r.pending), standard: sum(rows, r => r.standard),
  belowMinT: sum(rows.filter(r => r.belowMin), r => r.tonnes), belowMinRevenue: sum(rows.filter(r => r.belowMin), r => r.revenue),
  reversed: rows.filter(r => r.state === 'stornata').length, estimated: rows.some(r => r.estimated),
});

/** Provvigioni del periodo P per agente {agentId: {amount, accrued, pending, standard, difference, revenue, tonnes, belowMinT, …}}. */
export function commissionTotals(d, ctx, P) {
  const by = {};
  for (const r of commissionRows(d, ctx, P)) (by[r.agentId] ||= []).push(r);
  const out = {};
  for (const a of d.agents || EMPTY) { const t = totalsOf(by[a.id] || EMPTY); out[a.id] = { ...t, difference: t.amount - t.standard }; }
  for (const id of Object.keys(by)) if (!out[id]) { const t = totalsOf(by[id]); out[id] = { ...t, difference: t.amount - t.standard }; }
  return out;
}

/**
 * Estratto conto trimestrale dell'agente ('YYYY-Qn'): consegne del trimestre con la provvigione maturata a oggi,
 * Enasarco (aliquota × maturate, metà agente e metà mandante, entro il massimale annuo se impostato), FIRR a scaglioni
 * (quota del trimestre = FIRR sul cumulato dell'anno − FIRR sul cumulato prima del trimestre), netto = maturate − Enasarco agente.
 * dueDate = ultimo giorno del mese dopo il trimestre; standardInCE = provvigioni al tasso standard nel conto economico.
 */
export function statement(d, ctx, agentId, quarter) {
  const Q = quarterRange(quarter);
  const agent = (d.agents || EMPTY).find(a => a.id === agentId);
  if (!Q || !agent) return null;
  const scheme = schemeOf(agent), rules = agentRules(d), mandate = scheme.mandate;
  const rows = commissionRows(d, ctx, Q, agentId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t = totalsOf(rows);
  const yearFrom = Q.from.slice(0, 4) + '-01-01';
  const ytdBefore = Q.from > yearFrom ? sum(commissionRows(d, ctx, { from: yearFrom, to: addDays(Q.from, -1) }, agentId), r => r.accrued) : 0;
  const mass = rules.massimale?.[mandate];
  const massimaleSet = has(mass) && +mass > 0;
  const base = massimaleSet ? Math.max(0, Math.min(t.accrued, +mass - ytdBefore)) : t.accrued;
  const enasarco = base * rules.enasarcoPct / 100;
  const brackets = rules.firr?.[mandate] || DEFAULT_AGENT_RULES.firr[mandate];
  const firr = firrOf(ytdBefore + t.accrued, brackets) - firrOf(ytdBefore, brackets);
  const standardInCE = t.standard;
  return {
    agentId, agent, quarter, from: Q.from, to: Q.to, label: Q.label, scheme, mandate, rows,
    totals: { ...t, maturate: t.accrued, enasarcoBase: base, enasarco, enasarcoAgente: enasarco / 2, enasarcoMandante: enasarco / 2, firr, netto: t.accrued - enasarco / 2, ytdBefore },
    dueDate: endOfMonth(addMonths(Q.to.slice(0, 7), 1)),
    standardInCE, difference: t.amount - standardInCE,
    enasarcoPct: rules.enasarcoPct, massimale: massimaleSet ? +mass : null, massimaleSet, firrBrackets: brackets,
    estimated: t.estimated,
  };
}

/** Totali degli ultimi n trimestri chiusi (dal più recente) per la scheda agente. */
export function statementHistory(d, ctx, agentId, n = 4) {
  const out = [];
  let q = lastClosedQuarter(ctx.today);
  for (let i = 0; i < n; i++) {
    const s = statement(d, ctx, agentId, q);
    if (s) out.push({ quarter: q, label: s.label, revenue: s.totals.revenue, maturate: s.totals.maturate, pending: s.totals.pending, netto: s.totals.netto, firr: s.totals.firr, dueDate: s.dueDate, n: s.totals.n });
    q = quarterOf(addDays(quarterRange(q).from, -1));
  }
  return out;
}

/**
 * Prestazioni degli agenti nel periodo P (e, se c'è, nel confronto C): ricavi, MdC €/t dopo la provvigione dello schema,
 * realizzazione sul listino, quota di tonnellate sotto il prezzo minimo, successo a valore, visite per cliente, imbuto,
 * clienti fermi da oltre 30 giorni, scaduto dei clienti (creditSummary). → righe con i campi e cmp {…} del periodo C.
 */
export function agentPerformance(d, ctx, P, C = null) {
  const credit = (() => { try { return creditSummary(d, ctx.today)?.byCustomer || {}; } catch { return {}; } })();
  const hasCredit = Object.keys(credit).length > 0;
  const core = (a, Q) => {
    const rows = commissionRows(d, ctx, Q, a.id), t = totalsOf(rows);
    const R = realization(d, ctx, Q, null, { agentId: a.id }).total;
    const mc2 = R.mc2 + t.standard - t.amount; // MdC con la provvigione dello schema al posto di quella standard
    return {
      revenue: R.net, tonnes: R.tonnes, mc2, mc2T: R.tonnes > 0 ? mc2 / R.tonnes : null,
      realization: R.list > 0 ? R.net / R.list : null, shareBelowMinT: t.tonnes > 0 ? t.belowMinT / t.tonnes : null,
      winRateValue: winRate(d, Q, { agentId: a.id }), commission: t.amount, accrued: t.accrued,
    };
  };
  const lastBy = {};
  for (const f of ctx.facts || EMPTY) if (f.date <= P.to && (!lastBy[f.customerId] || f.date > lastBy[f.customerId])) lastBy[f.customerId] = f.date;
  const from365 = addDays(P.to, -365), idleFrom = addDays(P.to, -30);
  return (d.agents || EMPTY).map(a => {
    const mine = (d.customers || EMPTY).filter(c => c.agentId === a.id);
    const cur = core(a, P), cmp = C && !C.budget ? core(a, C) : null;
    const visits = (d.visits || EMPTY).filter(v => v.agentId === a.id && inP(v.date, P));
    const idle = mine.filter(c => lastBy[c.id] && lastBy[c.id] > from365 && lastBy[c.id] < idleFrom);
    return {
      id: a.id, agentId: a.id, name: a.name, zone: a.zone, scheme: schemeOf(a), customers: mine.length,
      ...cur,
      visits: visits.length, visitsPerCustomer: mine.length ? visits.length / mine.length : null,
      funnel: funnel(d, P, { agentId: a.id }), idleCustomers: idle.length, idleIds: idle.map(c => c.id),
      overdue: hasCredit ? sum(mine, c => n0(credit[c.id]?.overdue)) : null,
      cmp,
    };
  });
}
