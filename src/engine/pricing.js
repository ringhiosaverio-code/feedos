/* FeedOS 17 · Listini versionati, realizzazione del prezzo, offerte e segnali commerciali (pacchetto WP4).
 * Funzioni pure: leggono l'archivio d e il contesto dei motori ctx = {today, ix, costs, facts, volumes}
 * (derived.ctxOf nell'interfaccia, actuals.makeCtx nei test). Nessuna scrittura: le modifiche escono come ops per store.batch. */
import { addDays, sum, byId, round, nf, dateIt, pct as pctTxt } from '../core/util.js';
import { listAt, aggregateFacts } from './actuals.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const EMPTY = [];
const inP = (date, P) => !!date && date >= P.from && date <= P.to;

/* ---------------- offerte ---------------- */
/** Stati aperti di un'offerta (ancora in trattativa). */
export const OPEN_STATES = ['bozza', 'inviata'];
/** Etichette e colori degli stati (scaduta = aperta oltre la validità). */
export const OFFER_STATES = {
  bozza: { label: 'bozza', kind: '' }, inviata: { label: 'inviata', kind: 'accent' }, scaduta: { label: 'scaduta', kind: 'warn' },
  accettata: { label: 'accettata', kind: 'good' }, persa: { label: 'persa', kind: 'crit' },
};
/** Motivi strutturati di un'offerta persa. */
export const LOSS_REASONS = [
  { id: 'prezzo', label: 'Prezzo' }, { id: 'concorrente', label: 'Concorrente' }, { id: 'servizio', label: 'Servizio e consegne' },
  { id: 'qualita', label: 'Qualità' }, { id: 'credito', label: 'Credito' }, { id: 'altro', label: 'Altro' },
];
export const lossLabel = id => LOSS_REASONS.find(r => r.id === id)?.label || (id ? String(id) : '—');
/** Probabilità di chiusura di base per la pipeline pesata (settings.commercial.prob le sostituisce). */
export const DEFAULT_PROB = Object.freeze({ bozza: 0.2, inviata: 0.5 });

/** Stato di un'offerta alla data: 'scaduta' se è ancora bozza o inviata oltre validUntil, altrimenti lo stato salvato. */
export function offerState(o, today) {
  if (!o) return null;
  return OPEN_STATES.includes(o.status) && o.validUntil && today && o.validUntil < today ? 'scaduta' : o.status;
}
/** Offerta ancora in trattativa (bozza o inviata, non scaduta). */
export const isOpen = (o, today) => OPEN_STATES.includes(offerState(o, today));
/** Agente dell'offerta: quello registrato, altrimenti quello del cliente. */
export function offerAgent(d, o, cust = null) {
  if (o?.agentId) return o.agentId;
  const c = cust || (d.customers || EMPTY).find(x => x.id === o?.customerId);
  return c?.agentId ?? null;
}
/** Valore dell'offerta (€) = t × prezzo. */
export const offerValue = o => n0(o?.tonnes) * n0(o?.price);
/** Data della decisione (accettata/persa): decidedAt, altrimenti la data dell'offerta. */
export const decidedOn = o => o?.decidedAt || o?.date || null;
const agentFilter = (d, agentId) => {
  if (!agentId) return () => true;
  const cust = byId(d.customers || EMPTY);
  return o => offerAgent(d, o, cust[o.customerId]) === agentId;
};

/**
 * Tasso di successo a VALORE nel periodo: Σ t × prezzo delle accettate / Σ t × prezzo delle decise (accettate + perse),
 * con la data della decisione in P. → {rate, won, lost, decided, wonValue, lostValue, decidedValue}
 */
export function winStats(d, P, { agentId } = {}) {
  const ok = agentFilter(d, agentId);
  let won = 0, lost = 0, wonValue = 0, lostValue = 0;
  for (const o of d.offers || EMPTY) {
    if ((o.status !== 'accettata' && o.status !== 'persa') || !ok(o) || !inP(decidedOn(o), P)) continue;
    if (o.status === 'accettata') { won++; wonValue += offerValue(o); } else { lost++; lostValue += offerValue(o); }
  }
  const decidedValue = wonValue + lostValue;
  return { rate: decidedValue > 0 ? wonValue / decidedValue : null, won, lost, decided: won + lost, wonValue, lostValue, decidedValue };
}
/** Tasso di successo a valore (0…1) o null se nel periodo non ci sono offerte decise. */
export function winRate(d, P, opts) { return winStats(d, P, opts).rate; }

/** Probabilità di chiusura per stato (settings.commercial.prob, altrimenti 0,2 bozza e 0,5 inviata). */
export function probOf(d) { return { ...DEFAULT_PROB, ...(d.settings?.commercial?.prob || {}) }; }

/**
 * Pipeline delle offerte aperte (non scadute) alla data: valore pieno e pesato per la probabilità dello stato.
 * → {weighted, value, tonnes, n, byState: {bozza: {n, value}, inviata: {...}}, expired: {n, value, tonnes}}
 */
export function pipeline(d, today, { agentId } = {}) {
  const ok = agentFilter(d, agentId), prob = probOf(d);
  const out = { weighted: 0, value: 0, tonnes: 0, n: 0, byState: { bozza: { n: 0, value: 0 }, inviata: { n: 0, value: 0 } }, expired: { n: 0, value: 0, tonnes: 0 } };
  for (const o of d.offers || EMPTY) {
    if (!ok(o)) continue;
    const st = offerState(o, today), v = offerValue(o);
    if (st === 'scaduta') { out.expired.n++; out.expired.value += v; out.expired.tonnes += n0(o.tonnes); continue; }
    if (!OPEN_STATES.includes(st)) continue;
    out.n++; out.value += v; out.tonnes += n0(o.tonnes); out.weighted += v * n0(prob[st]);
    out.byState[st].n++; out.byState[st].value += v;
  }
  return out;
}

/**
 * Imbuto commerciale del periodo: visite in P → offerte create entro 30 giorni da una visita allo stesso cliente → accettate.
 * → {visits, visitsWithOffer, offers, accepted, acceptedValue, toOffer (quota visite con offerta), toWin (quota offerte accettate)}
 */
export function funnel(d, P, { agentId } = {}) {
  const okO = agentFilter(d, agentId);
  const visits = (d.visits || EMPTY).filter(v => inP(v.date, P) && (!agentId || v.agentId === agentId));
  const offersBy = {};
  for (const o of d.offers || EMPTY) if (okO(o)) (offersBy[o.customerId] ||= []).push(o);
  const linked = new Set();
  let withOffer = 0;
  for (const v of visits) {
    const end = addDays(v.date, 30);
    const hits = (offersBy[v.customerId] || EMPTY).filter(o => o.date >= v.date && o.date <= end);
    if (hits.length) withOffer++;
    for (const o of hits) linked.add(o);
  }
  const acc = [...linked].filter(o => o.status === 'accettata');
  return {
    visits: visits.length, visitsWithOffer: withOffer, offers: linked.size, accepted: acc.length, acceptedValue: sum(acc, offerValue),
    toOffer: visits.length ? withOffer / visits.length : null, toWin: linked.size ? acc.length / linked.size : null,
  };
}

/** Offerte perse con decisione in P per motivo: [{reason, label, n, value, tonnes, competitors: {nome: n}}], ordinate per valore. */
export function lossBreakdown(d, P, { agentId } = {}) {
  const ok = agentFilter(d, agentId), by = {};
  for (const o of d.offers || EMPTY) {
    if (o.status !== 'persa' || !ok(o) || !inP(decidedOn(o), P)) continue;
    const k = o.lossReason || 'altro';
    const r = (by[k] ||= { reason: k, label: lossLabel(k), n: 0, value: 0, tonnes: 0, competitors: {}, gapSum: 0, gapT: 0 });
    r.n++; r.value += offerValue(o); r.tonnes += n0(o.tonnes);
    if (o.competitor) r.competitors[o.competitor] = (r.competitors[o.competitor] || 0) + 1;
    if (has(o.competitorPrice) && n0(o.price) > 0) { r.gapSum += (n0(o.price) - +o.competitorPrice) * n0(o.tonnes); r.gapT += n0(o.tonnes); }
  }
  return Object.values(by).map(r => ({ ...r, competitorGap: r.gapT > 0 ? r.gapSum / r.gapT : null })).sort((a, b) => b.value - a.value);
}

/** Sconto massimo autorizzato per il cliente (punti %) = sconto abituale + settings.commercial.extraDiscountPts (di base 2). */
export function authorizedDiscount(d, customer) {
  const extra = d.settings?.commercial?.extraDiscountPts;
  return n0(customer?.discountPct) + (has(extra) ? +extra : 2);
}

/* ---------------- listini versionati ---------------- */
/** Versioni del listino di un prodotto in ordine di decorrenza. */
export function priceHistory(d, productId) {
  return (d.priceLists || EMPTY).filter(r => r.productId === productId).sort((a, b) => (a.validFrom < b.validFrom ? -1 : a.validFrom > b.validFrom ? 1 : 0));
}
/** Listino in vigore oggi (versione valida, altrimenti product.listPrice). */
export const listToday = (d, p, today) => listAt(d.priceLists, p, today);
/** Listino alla data; prima della prima versione registrata vale quella (il listino di oggi non era ancora in vigore). */
export function listOn(d, p, date) {
  const h = priceHistory(d, p?.id);
  return h.length && date < h[0].validFrom ? n0(h[0].price) : listAt(d.priceLists, p, date);
}

function freshId(d, productId, validFrom, taken) {
  const base = `pl-${String(productId).replace(/^p-/, '')}-${validFrom.replace(/-/g, '')}`;
  let id = base, k = 1;
  while (taken.has(id)) id = `${base}-${++k}`;
  taken.add(id);
  return id;
}

/**
 * Nuova versione di listino → ops per store.batch (un solo passo annullabile).
 * Chiude la versione in vigore alla decorrenza (validTo = giorno prima), aggiunge la nuova (fino alla versione successiva, se c'è),
 * e se la decorrenza è oggi o passata (e nessuna versione successiva è già in vigore) aggiorna product.listPrice e listUpdatedAt.
 * Senza storico, la prima revisione registra anche il prezzo in vigore fino al giorno prima: la realizzazione passata non cambia.
 */
export function newPriceListOps(d, { productId, price, validFrom, reason = '', approvedBy = '', today, note = '' } = {}, taken = null) {
  const p = (d.products || EMPTY).find(x => x.id === productId);
  if (!p || !(+price > 0) || !isDate(validFrom)) return [];
  const day = today || validFrom;
  taken ||= new Set((d.priceLists || EMPTY).map(r => r.id));
  const hist = priceHistory(d, productId), ops = [];
  const before = addDays(validFrom, -1);
  if (!hist.length) {
    let first = null;
    for (const s of d.shipments || EMPTY) if (s.productId === productId && (!first || s.date < first)) first = s.date;
    const start = first ? addDays(first, -1) : (isDate(p.listUpdatedAt) ? p.listUpdatedAt : addDays(validFrom, -365));
    if (start < validFrom && n0(p.listPrice) > 0) ops.push({ kind: 'add', coll: 'priceLists', obj: { id: freshId(d, productId, start, taken), productId, price: n0(p.listPrice), validFrom: start, validTo: before, reason: 'Listino in vigore prima della revisione', approvedBy: '', createdAt: day } });
  }
  const same = hist.find(r => r.validFrom === validFrom);
  const next = hist.find(r => r.validFrom > validFrom);
  const validTo = next ? addDays(next.validFrom, -1) : null;
  for (const r of hist) if (r !== same && r.validFrom < validFrom && (!r.validTo || r.validTo >= validFrom)) ops.push({ kind: 'update', coll: 'priceLists', id: r.id, patch: { validTo: before } });
  const row = { price: round(+price, 2), validTo, reason, approvedBy, note };
  if (same) ops.push({ kind: 'update', coll: 'priceLists', id: same.id, patch: { ...row, updatedAt: day } });
  else ops.push({ kind: 'add', coll: 'priceLists', obj: { id: freshId(d, productId, validFrom, taken), productId, validFrom, ...row, createdAt: day } });
  if (today && validFrom <= today && (!next || next.validFrom > today)) ops.push({ kind: 'update', coll: 'products', id: productId, patch: { listPrice: round(+price, 2), listUpdatedAt: validFrom } });
  return ops;
}

/** Revisione di più prodotti alla stessa decorrenza: byProduct {productId: nuovo prezzo €/t} → ops (salta i prezzi invariati). */
export function bulkRevisionOps(d, { byProduct = {}, validFrom, reason = '', approvedBy = '', today } = {}) {
  const taken = new Set((d.priceLists || EMPTY).map(r => r.id)), prod = byId(d.products || EMPTY), ops = [];
  for (const [productId, price] of Object.entries(byProduct || {})) {
    const p = prod[productId];
    if (!p || !(+price > 0) || Math.abs(listAt(d.priceLists, p, validFrom) - +price) < 0.005) continue;
    ops.push(...newPriceListOps(d, { productId, price, validFrom, reason, approvedBy, today }, taken));
  }
  return ops;
}

/** Versioni con decorrenza già arrivata ma listPrice del prodotto ancora vecchio (revisione futura entrata in vigore). → ops */
export function syncListOps(d, today) {
  const ops = [];
  for (const p of d.products || EMPTY) {
    if (!priceHistory(d, p.id).length) continue;
    const cur = listAt(d.priceLists, p, today);
    if (cur > 0 && Math.abs(cur - n0(p.listPrice)) >= 0.005) ops.push({ kind: 'update', coll: 'products', id: p.id, patch: { listPrice: cur, listUpdatedAt: today } });
  }
  return ops;
}

/* ---------------- realizzazione del prezzo ---------------- */
const scopeFacts = (ctx, agentId) => (agentId ? (ctx.facts || EMPTY).filter(f => f.agentId === agentId) : ctx.facts || EMPTY);
const realRow = (x, by) => ({
  key: by ? x[by] : 'totale', ...(by ? { [by]: x[by] } : {}), tonnes: x.tonnes, n: x.n,
  list: x.listRevenue, net: x.revenue, discount: x.discount, mc2: x.mc2,
  discountPct: x.listRevenue > 0 ? 1 - x.revenue / x.listRevenue : null,
  netT: x.tonnes > 0 ? x.revenue / x.tonnes : null, listT: x.tonnes > 0 ? x.listRevenue / x.tonnes : null,
});

/**
 * Realizzazione sul listino ALLA DATA di ogni consegna, nel periodo P, per prodotto, cliente o agente.
 * list = Σ t × listino del giorno · net = Σ ricavi · discountPct = 1 − net/list. → {rows, total}
 */
export function realization(d, ctx, P, by = 'productId', { agentId } = {}) {
  const hist = agentId ? (d.salesHistory || EMPTY).filter(h => h.agentId === agentId) : d.salesHistory || EMPTY;
  const A = aggregateFacts(scopeFacts(ctx, agentId), hist, P, by ? [by] : []);
  return { rows: A.rows.map(x => realRow(x, by)), total: realRow(A.total, null) };
}

/**
 * Cascata del prezzo «pocket» (€/t) sulle consegne di P, eventualmente di un prodotto, cliente o agente:
 * listino → sconto cliente (t × listino × sconto abituale) → sconto extra (il resto dello sconto) → premio di fine anno
 * (rebatePct del cliente × ricavi, maturato) → provvigione → dilazione (onere finanziario) → trasporto = prezzo pocket;
 * − costo industriale effettivo (materie prime, calo, energia, trasformazione variabile, imballo) = margine pocket.
 * → {steps: [{key, label, value (€/t), eur, kind}], tonnes, totals}
 */
export function pocketWaterfall(d, ctx, P, { productId, customerId, agentId } = {}) {
  const cust = ctx.ix?.cust || byId(d.customers || EMPTY);
  const T = { tonnes: 0, list: 0, net: 0, custDisc: 0, rebate: 0, commission: 0, finCost: 0, logistics: 0, industrial: 0 };
  for (const f of ctx.facts || EMPTY) {
    if (!inP(f.date, P) || (productId && f.productId !== productId) || (customerId && f.customerId !== customerId) || (agentId && f.agentId !== agentId)) continue;
    const c = cust[f.customerId];
    T.tonnes += f.tonnes; T.list += f.listRevenue; T.net += f.revenue;
    T.custDisc += f.listRevenue * n0(c?.discountPct) / 100;
    T.rebate += f.revenue * n0(c?.rebatePct) / 100;
    T.commission += f.commission; T.finCost += f.finCost; T.logistics += f.logistics;
    T.industrial += f.raw + f.shrink + f.energy + f.varConv + f.pack;
  }
  const extra = T.list - T.net - T.custDisc;
  const pocket = T.net - T.rebate - T.commission - T.finCost - T.logistics;
  const margin = pocket - T.industrial;
  const t = T.tonnes, u = v => (t > 0 ? v / t : 0);
  const step = (key, label, eur, kind = 'neg') => ({ key, label, eur, value: u(eur), kind });
  return {
    tonnes: t,
    totals: { ...T, extra, pocket, margin },
    steps: [
      step('list', 'Listino', T.list, 'total'),
      step('custDisc', 'Sconto cliente', -T.custDisc),
      step('extraDisc', 'Sconto extra', -extra),
      step('rebate', 'Premio di fine anno', -T.rebate),
      step('commission', 'Provvigione', -T.commission),
      step('finCost', 'Dilazione', -T.finCost),
      step('logistics', 'Trasporto', -T.logistics),
      step('pocket', 'Prezzo pocket', pocket, 'total'),
      step('industrial', 'Costo industriale effettivo', -T.industrial),
      step('margin', 'Margine pocket', margin, 'total'),
    ],
  };
}

// materie prime effettive €/t per prodotto e mese (dai fatti), memorizzate per array di fatti
const rawCache = new WeakMap();
function rawByMonth(facts) {
  let m = rawCache.get(facts);
  if (m) return m;
  m = {};
  for (const f of facts) { const r = ((m[f.productId] ||= {})[f.month] ||= { t: 0, raw: 0 }); r.t += f.tonnes; r.raw += f.raw; }
  rawCache.set(facts, m);
  return m;
}

/**
 * Trasferimento sul listino delle variazioni delle materie prime da fromDate a oggi:
 * (listino oggi − listino a fromDate) / (materie prime €/t del mese più recente − del mese di fromDate), dai costi effettivi dei lotti.
 * → {value, listFrom, listNow, rawFrom, rawNow, monthFrom, monthNow} oppure null se le materie prime si sono mosse meno di 1 €/t.
 */
export function passThroughDetail(d, ctx, productId, fromDate, today = ctx?.today) {
  const p = ctx?.ix?.prod?.[productId] || (d.products || EMPTY).find(x => x.id === productId);
  if (!p || !fromDate || !today) return null;
  const months = rawByMonth(ctx.facts || EMPTY)[productId] || {};
  const keys = Object.keys(months).filter(k => months[k].t > 0).sort();
  const m0 = keys.find(k => k >= fromDate.slice(0, 7)), m1 = [...keys].reverse().find(k => k <= today.slice(0, 7));
  if (!m0 || !m1 || m0 >= m1) return null;
  const rawFrom = months[m0].raw / months[m0].t, rawNow = months[m1].raw / months[m1].t;
  const listFrom = listOn(d, p, fromDate), listNow = listAt(d.priceLists, p, today);
  if (Math.abs(rawNow - rawFrom) < 1) return null;
  return { value: (listNow - listFrom) / (rawNow - rawFrom), listFrom, listNow, rawFrom, rawNow, monthFrom: m0, monthNow: m1 };
}
/** Pass-through (frazione: 1 = variazione delle materie prime trasferita per intero) o null. */
export function passThrough(d, ctx, productId, fromDate) { return passThroughDetail(d, ctx, productId, fromDate)?.value ?? null; }

// listino e netto degli ultimi 90 giorni per prodotto (o prodotto × agente)
const d90Cache = new WeakMap();
function last90(ctx) {
  const key = ctx.today;
  let c = d90Cache.get(ctx.facts || EMPTY);
  if (c && c.key === key) return c.v;
  const v = {}, from = addDays(ctx.today, -90);
  for (const f of ctx.facts || EMPTY) {
    if (f.date <= from || f.date > ctx.today) continue;
    const r = (v[f.productId] ||= { t: 0, net: 0, list: 0 }); r.t += f.tonnes; r.net += f.revenue; r.list += f.listRevenue;
  }
  d90Cache.set(ctx.facts || EMPTY, { key, v });
  return v;
}

/**
 * Listino necessario per tornare al margine obiettivo con gli sconti di oggi:
 * required = prezzo obiettivo (costo pieno di oggi / (1 − margine obiettivo)) / (1 − sconto medio degli ultimi 90 giorni);
 * gap = required − listino in vigore. → {required, current, gap, gapPct, discountPct, net90, t90, targetPrice, minPrice, cost}
 */
export function requiredList(d, productId, ctx) {
  const p = ctx?.ix?.prod?.[productId] || (d.products || EMPTY).find(x => x.id === productId);
  const c = ctx?.costs?.[productId];
  if (!p || !c || c.targetPrice == null) return null;
  const r = last90(ctx)[productId];
  const discountPct = r?.list > 0 ? Math.max(0, 1 - r.net / r.list) : n0(avgCustomerDiscount(d, p)) / 100;
  const current = listAt(d.priceLists, p, ctx.today);
  const required = c.targetPrice / (1 - Math.min(0.9, discountPct));
  const gap = required - current;
  return { required, current, gap, gapPct: current > 0 ? gap / current : null, discountPct, net90: r?.t > 0 ? r.net / r.t : null, t90: r?.t || 0, targetPrice: c.targetPrice, minPrice: c.minPrice, cost: c.total };
}
function avgCustomerDiscount(d, p) {
  const cs = (d.customers || EMPTY).filter(c => !c.products?.length || c.products.includes(p.code));
  return cs.length ? sum(cs, c => n0(c.discountPct)) / cs.length : 0;
}

/** Controllo del prezzo NETTO: realizzato negli ultimi 90 giorni (senza consegne: listino) contro prezzo minimo e obiettivo di oggi. */
export function netStatus(net, cost) {
  if (!(net > 0) || !cost) return null;
  return cost.minPrice != null && net < cost.minPrice - 1e-9 ? 'sotto-minimo' : cost.targetPrice != null && net < cost.targetPrice - 1e-9 ? 'sotto-obiettivo' : 'ok';
}

/**
 * Righe del listino per la pagina e per i test: listino in vigore, netto e sconto realizzati in P, pass-through da P.from,
 * listino necessario e gap, controllo sul prezzo netto (90 giorni) e storico delle versioni.
 */
export function priceListRows(d, ctx, P, { agentId } = {}) {
  const R = byId(realization(d, ctx, P, 'productId', { agentId }).rows.map(r => ({ ...r, id: r.productId })));
  return (d.products || EMPTY).filter(p => p.active !== false).map(p => {
    const c = ctx.costs?.[p.id], rq = requiredList(d, p.id, ctx), re = R[p.id];
    const listNow = listAt(d.priceLists, p, ctx.today);
    const net = rq?.net90 ?? listNow;
    const pt = passThroughDetail(d, ctx, p.id, P.from);
    const hist = priceHistory(d, p.id);
    const next = hist.find(h => h.validFrom > ctx.today) || null;
    return {
      id: p.id, p, code: p.code, name: p.name, species: p.species, cost: c, listNow, listPrice: n0(p.listPrice),
      netT: re?.netT ?? null, listT: re?.listT ?? null, discountPct: re?.discountPct ?? null, tonnes: re?.tonnes || 0,
      passThrough: pt?.value ?? null, pt, required: rq?.required ?? null, gap: rq?.gap ?? null, gapPct: rq?.gapPct ?? null, discount90: rq?.discountPct ?? null,
      net90: rq?.net90 ?? null, netCheck: net, status: netStatus(net, c), hist, next, vol: n0(ctx.volumes?.[p.id]),
    };
  });
}

/**
 * Simulazione di una revisione di listino prima di confermarla.
 * Per prodotto: Δp = nuovo − listino alla decorrenza, Δnetto = Δp × (netto/listino degli ultimi 90 giorni), r = Δp/p, V = t degli ultimi 365 giorni,
 * ΔV = V × ε × r (ε = elasticità, di base settings.finance.elasticity, 0 = volumi invariati);
 * ΔMdC = (V + ΔV) × Δnetto + ΔV × MdC unitario attuale (il margine perso o guadagnato sui volumi che cambiano).
 * → {rows, annualDeltaMc2, annualDeltaRevenue, customersBelowMin, customersBelowMinBefore, openOffersBelowMin, openOffersBeyondDiscount}
 */
export function revisionSim(d, ctx, { byProduct = {}, validFrom, elasticity } = {}) {
  const eps = has(elasticity) ? +elasticity : n0(d.settings?.finance?.elasticity);
  const prod = ctx.ix?.prod || byId(d.products || EMPTY), day = validFrom || ctx.today;
  const r90 = last90(ctx);
  const mc2T = {}, from365 = addDays(ctx.today, -365);
  for (const f of ctx.facts || EMPTY) if (f.date > from365 && f.date <= ctx.today) { const m = (mc2T[f.productId] ||= { t: 0, mc2: 0 }); m.t += f.tonnes; m.mc2 += f.mc2; }
  const newList = {}, rows = [];
  for (const p of Object.values(prod)) {
    const from = listAt(d.priceLists, p, day), to = has(byProduct[p.id]) ? +byProduct[p.id] : from;
    newList[p.id] = { from, to };
    if (Math.abs(to - from) < 0.005) continue;
    const dp = to - from, r = from > 0 ? dp / from : 0, k = r90[p.id]?.list > 0 ? r90[p.id].net / r90[p.id].list : 1;
    const V = n0(ctx.volumes?.[p.id]), dV = V * eps * r, unit = mc2T[p.id]?.t > 0 ? mc2T[p.id].mc2 / mc2T[p.id].t : 0;
    const dNet = dp * k;
    rows.push({ productId: p.id, from, to, dp, dPct: r, dNet, volume: V, dVolume: dV, mc2T: unit, deltaMc2: (V + dV) * dNet + dV * unit, deltaRevenue: (V + dV) * (from * k + dNet) - V * from * k });
  }
  // clienti che con il nuovo listino (meno il loro sconto abituale) scendono sotto il prezzo minimo di oggi
  const buys = {};
  for (const f of ctx.facts || EMPTY) if (f.date > from365 && f.date <= ctx.today) (buys[f.customerId] ||= new Set()).add(f.productId);
  const below = (useNew) => {
    const out = [];
    for (const c of d.customers || EMPTY) for (const pid of buys[c.id] || EMPTY) {
      const cost = ctx.costs?.[pid], L = newList[pid];
      if (!cost || !L || cost.minPrice == null) continue;
      const net = (useNew ? L.to : L.from) * (1 - n0(c.discountPct) / 100);
      if (net < cost.minPrice - 1e-9) out.push({ customerId: c.id, productId: pid, net, minPrice: cost.minPrice });
    }
    return out;
  };
  const after = below(true), before = below(false);
  const custSet = list => [...new Set(list.map(x => x.customerId))];
  // offerte aperte: sotto il prezzo minimo, o con uno sconto sul nuovo listino oltre quello autorizzato
  const cust = byId(d.customers || EMPTY), changed = new Set(rows.map(r => r.productId));
  const openOffersBelowMin = [], openOffersBeyondDiscount = [];
  for (const o of d.offers || EMPTY) {
    if (!isOpen(o, ctx.today) || !changed.has(o.productId)) continue;
    const cost = ctx.costs?.[o.productId], L = newList[o.productId];
    if (cost?.minPrice != null && n0(o.price) < cost.minPrice - 0.5) openOffersBelowMin.push(o);
    if (L && n0(o.price) < L.to * (1 - authorizedDiscount(d, cust[o.customerId]) / 100) - 0.5) openOffersBeyondDiscount.push(o);
  }
  return {
    rows, elasticity: eps,
    annualDeltaMc2: sum(rows, r => r.deltaMc2), annualDeltaRevenue: sum(rows, r => r.deltaRevenue),
    customersBelowMin: custSet(after), customersBelowMinBefore: custSet(before), pairsBelowMin: after,
    openOffersBelowMin, openOffersBeyondDiscount,
  };
}

/* ---------------- segnali e report ---------------- */
const ROLES = ['commerciale', 'agente', 'direzione'];

/** Segnali commerciali: offerte in scadenza o scadute, sconti oltre l'autorizzato, prossimi passi scaduti, listini da rivedere. → Signal[] */
export function commercialSignals(d, ctx) {
  const today = ctx?.today;
  if (!today) return [];
  const out = [], cust = ctx.ix?.cust || byId(d.customers || EMPTY), prod = ctx.ix?.prod || byId(d.products || EMPTY);
  const agentName = id => (d.agents || EMPTY).find(a => a.id === id)?.name || 'agente non indicato';
  // offerte in scadenza entro 7 giorni (info) e scadute ancora aperte (attenzione)
  for (const o of d.offers || EMPTY) {
    if (!OPEN_STATES.includes(o.status) || !o.validUntil) continue;
    const c = cust[o.customerId], p = prod[o.productId], ag = offerAgent(d, o, c);
    if (o.validUntil < today) {
      out.push({ key: `offer-exp:${o.id}:${o.validUntil}`, area: 'commerciale', roles: ROLES, severity: 'attenzione',
        title: `Offerta ${o.code} scaduta senza esito`,
        why: `${c?.name || 'Cliente'} · ${nf(o.tonnes)} t di ${p?.name || 'prodotto'} a ${nf(o.price)} €/t, valida fino al ${dateIt(o.validUntil, 'dm')}: risulta ancora «${o.status}».`,
        action: 'Rinnovare la validità con un nuovo prezzo o chiuderla come persa indicando il motivo.',
        impact: 2e4 + offerValue(o) / 100, link: { area: 'commerciale', tab: 'offerte', id: o.id }, agentId: ag });
    } else if (o.validUntil <= addDays(today, 7)) {
      out.push({ key: `offer-due:${o.id}:${o.validUntil}`, area: 'commerciale', roles: ROLES, severity: 'info',
        title: `Offerta ${o.code} in scadenza il ${dateIt(o.validUntil, 'dm')}`,
        why: `${c?.name || 'Cliente'} · ${nf(o.tonnes)} t di ${p?.name || 'prodotto'} (${nf(offerValue(o) / 1000, 1)} mila €), stato «${o.status}».`,
        action: 'Richiamare il cliente prima della scadenza.', impact: offerValue(o) / 100, link: { area: 'commerciale', tab: 'offerte', id: o.id }, agentId: ag });
    }
  }
  // consegne degli ultimi 30 giorni sotto il listino oltre lo sconto autorizzato: fuga di prezzo per cliente
  const from30 = addDays(today, -30), leak = {};
  for (const f of ctx.facts || EMPTY) {
    if (f.date <= from30 || f.date > today || !(f.tonnes > 0)) continue;
    const c = cust[f.customerId]; if (!c) continue;
    const floor = f.listRevenue / f.tonnes * (1 - authorizedDiscount(d, c) / 100), price = f.revenue / f.tonnes;
    if (price < floor - 0.5) { const l = (leak[c.id] ||= { eur: 0, t: 0, n: 0 }); l.eur += (floor - price) * f.tonnes; l.t += f.tonnes; l.n++; }
  }
  for (const [id, l] of Object.entries(leak)) {
    const c = cust[id];
    if (l.eur < 1) continue;
    out.push({ key: `leak:${id}:${today.slice(0, 7)}`, area: 'commerciale', roles: ROLES, severity: 'attenzione',
      title: `${c.name}: prezzi sotto lo sconto autorizzato`,
      why: `Negli ultimi 30 giorni ${l.n} consegne (${nf(l.t, 1)} t) hanno uno sconto sul listino oltre il ${nf(authorizedDiscount(d, c), 1)}% autorizzato (sconto abituale ${nf(c.discountPct, 1)}% + margine di trattativa): ${nf(l.eur)} € di prezzo perso.`,
      action: 'Verificare i prezzi applicati in bolla o aggiornare lo sconto concordato.', impact: l.eur, link: { area: 'commerciale', tab: 'clienti', id }, agentId: c.agentId ?? null });
  }
  // prossimi passi delle visite scaduti (ultimi 60 giorni, senza visite o offerte successive), uno per agente
  const lastTouch = {};
  for (const v of d.visits || EMPTY) if (!lastTouch[v.customerId] || v.date > lastTouch[v.customerId]) lastTouch[v.customerId] = v.date;
  for (const o of d.offers || EMPTY) if (!lastTouch[o.customerId] || o.date > lastTouch[o.customerId]) lastTouch[o.customerId] = o.date;
  const taskDone = new Set((d.tasks || EMPTY).filter(t => t.status === 'fatto' || t.status === 'scartato').map(t => t.id));
  const late = {};
  for (const v of d.visits || EMPTY) {
    if (!hasNextAction(v) || !v.nextActionDue || v.nextActionDue >= today || v.nextActionDue < addDays(today, -60)) continue;
    if ((v.taskId && taskDone.has(v.taskId)) || lastTouch[v.customerId] > v.date) continue;
    (late[v.agentId || ''] ||= []).push(v);
  }
  for (const [ag, vs] of Object.entries(late)) {
    vs.sort((a, b) => (a.nextActionDue < b.nextActionDue ? -1 : 1));
    out.push({ key: `visit-next:${ag}:${vs.map(v => v.id).join(',')}`, area: 'commerciale', roles: ROLES, severity: 'info',
      title: vs.length === 1 ? `Prossimo passo scaduto: ${cust[vs[0].customerId]?.name || 'cliente'}` : `${vs.length} prossimi passi delle visite scaduti (${agentName(ag)})`,
      why: vs.slice(0, 3).map(v => `${cust[v.customerId]?.name || 'cliente'}: «${v.nextAction}» entro il ${dateIt(v.nextActionDue, 'dm')}`).join(' · ') + (vs.length > 3 ? ` e altri ${vs.length - 3}.` : '.'),
      action: 'Fare il passo concordato o registrare una nuova visita.', impact: 1e4 + vs.length, link: { area: 'commerciale', tab: 'visite' }, agentId: ag || null });
  }
  // listini sotto il necessario per il margine obiettivo (oltre il 3%): un solo segnale con l'elenco
  const gaps = [];
  for (const p of d.products || EMPTY) {
    if (p.active === false) continue;
    const r = requiredList(d, p.id, ctx);
    if (r && r.gapPct != null && r.gapPct > 0.03) gaps.push({ p, r });
  }
  if (gaps.length) {
    gaps.sort((a, b) => b.r.gapPct - a.r.gapPct);
    const eur = sum(gaps, g => g.r.gap * (1 - g.r.discountPct) * n0(ctx.volumes?.[g.p.id]));
    out.push({ key: `list-gap:${gaps.map(g => g.p.id + Math.round(g.r.required)).join(',')}`, area: 'commerciale', roles: ['commerciale', 'direzione'], severity: 'attenzione',
      title: gaps.length === 1 ? `Listino di ${gaps[0].p.name} sotto il necessario` : `${gaps.length} listini sotto il prezzo necessario per il margine obiettivo`,
      why: `${gaps.slice(0, 4).map(g => `${g.p.name} ${nf(g.r.current)} → ${nf(g.r.required)} €/t (+${nf(g.r.gapPct * 100, 1)}%)`).join(' · ')}${gaps.length > 4 ? ` e altri ${gaps.length - 4}` : ''}. Necessario = prezzo obiettivo ai costi di oggi / (1 − sconto medio degli ultimi 90 giorni).`,
      action: 'Preparare un nuovo listino con decorrenza e simularne l’effetto su margini, clienti e offerte aperte.', impact: eur,
      link: { area: 'commerciale', tab: 'listino', id: gaps[0].p.id } });
  }
  return out;
}
/** Prossimo passo concordato (escluso «Nessuna»). */
export const hasNextAction = v => !!v?.nextAction && !/^nessun[ao]?$/i.test(String(v.nextAction).trim());

/** Sezione «Commerciale» del report CdA: realizzazione, pass-through, pipeline, successo a valore e tabella agenti. */
export function commercialReportSection(d, ctx, P, C) {
  if (!ctx?.facts?.length || !P) return null;
  const R = realization(d, ctx, P, null).total, RC = C && !C.budget ? realization(d, ctx, C, null).total : null;
  if (!(R.tonnes > 0)) return null;
  const W = winStats(d, P), WC = C && !C.budget ? winStats(d, C) : null, pipe = pipeline(d, ctx.today);
  // pass-through medio pesato per volume (prodotti con variazione delle materie prime misurabile)
  let ptN = 0, ptW = 0;
  for (const p of d.products || EMPTY) { const v = passThrough(d, ctx, p.id, P.from), w = n0(ctx.volumes?.[p.id]); if (v != null && w > 0) { ptN += v * w; ptW += w; } }
  const pt = ptW > 0 ? ptN / ptW : null;
  const rows = (d.agents || EMPTY).map(a => {
    const r = realization(d, ctx, P, null, { agentId: a.id }).total, w = winStats(d, P, { agentId: a.id }), pp = pipeline(d, ctx.today, { agentId: a.id });
    return { agent: a.name, revenue: r.net, tonnes: r.tonnes, mc2T: r.tonnes > 0 ? r.mc2 / r.tonnes : null, realization: r.list > 0 ? r.net / r.list : null, winRate: w.rate, pipeline: pp.weighted };
  }).filter(r => r.tonnes > 0 || r.pipeline > 0);
  const narrative = [
    `Realizzazione sul listino del giorno ${pctTxt(R.list > 0 ? R.net / R.list : null, 1)} (sconto medio ${pctTxt(R.discountPct, 1)}${RC?.discountPct != null ? `, contro ${pctTxt(RC.discountPct, 1)} nel periodo di confronto` : ''}).`,
    pt != null ? `Le variazioni delle materie prime da inizio periodo sono passate sul listino per il ${nf(pt * 100)}% (media pesata sui volumi).` : 'Materie prime stabili nel periodo: pass-through non calcolabile.',
    `Pipeline pesata ${nf(pipe.weighted / 1000)} mila € su ${pipe.n} offerte aperte${pipe.expired.n ? `; ${pipe.expired.n} offerte scadute senza esito da chiudere` : ''}.`,
    W.rate != null ? `Successo a valore ${pctTxt(W.rate, 0)} su ${W.decided} offerte decise (${nf(W.decidedValue / 1000)} mila €).` : 'Nessuna offerta decisa nel periodo.',
  ];
  return {
    id: 'commerciale', title: 'Commerciale', order: 45,
    kpis: [
      { label: 'Realizzazione sul listino', value: R.list > 0 ? R.net / R.list * 100 : null, unit: '%', decimals: 1, cmp: RC?.list > 0 ? { value: RC.net / RC.list * 100, kind: 'ratio', good: 'up', unit: 'pt' } : undefined },
      { label: 'Prezzo netto medio', value: R.netT, unit: '€/t', decimals: 1, cmp: RC?.netT != null ? { value: RC.netT, kind: 'ratio', good: 'up', unit: '€/t' } : undefined },
      { label: 'Pass-through materie prime', value: pt != null ? pt * 100 : null, unit: '%', decimals: 0 },
      { label: 'Pipeline pesata', value: pipe.weighted, unit: '€', decimals: 0 },
      { label: 'Successo a valore', value: W.rate != null ? W.rate * 100 : null, unit: '%', decimals: 0, cmp: WC?.rate != null ? { value: WC.rate * 100, kind: 'ratio', good: 'up', unit: 'pt' } : undefined },
    ],
    table: {
      cols: [{ key: 'agent', label: 'Agente', fmt: 'text' }, { key: 'tonnes', label: 't', align: 'r', fmt: 't' }, { key: 'revenue', label: 'Ricavi', align: 'r', fmt: 'eur' },
        { key: 'mc2T', label: 'MdC €/t', align: 'r', fmt: 'num' }, { key: 'realization', label: 'Realizzazione', align: 'r', fmt: 'pct' }, { key: 'winRate', label: 'Successo a valore', align: 'r', fmt: 'pct' },
        { key: 'pipeline', label: 'Pipeline pesata', align: 'r', fmt: 'eur' }],
      rows,
    },
    narrative,
  };
}
