/* FeedOS 17 · Estensore del demo: listini versionati, schemi provvigionali, esiti e prossimi passi (pacchetto WP4).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Tutto inventato e deterministico (R = rng(seme + 501)): stesse date e stesso seme → stessi dati. */
import { addDays, mondayOf, monthStart, round } from '../../core/util.js';
import { makeIndex, costsOf } from '../../engine/actuals.js';

// schemi provvigionali dimostrativi (basePct ricade su commissionPct se manca)
const SCHEMES = {
  'ag-1': { tiers: [{ from: 0, pct: 2.3 }, { from: 3000000, pct: 2.7 }], byProduct: {}, accrual: 'fatturato', mandate: 'mono' },
  // nel portafoglio di ag-2 non c'è chi compra EQ12: BC14 (il suo prodotto principale) rende visibile la percentuale per prodotto
  'ag-2': { basePct: 2.5, tiers: [], byProduct: { EQ12: 3.5, BC14: 3 }, accrual: 'fatturato', mandate: 'mono' },
  'ag-3': { basePct: 2.8, tiers: [], byProduct: {}, accrual: 'incasso', mandate: 'mono' },
  'ag-4': { basePct: 2.8, tiers: [], byProduct: {}, accrual: 'fatturato', mandate: 'pluri' },
};
// concorrenti di fantasia per le offerte perse
const RIVALS = ['Mangimi Valle del Crati (fantasia)', 'Nutrizione Ionica (fantasia)', 'Agrimangimi del Pollino (fantasia)'];
// nota libera del generatore → motivo strutturato
const REASON = { 'Prezzo concorrente più basso': 'prezzo', 'Tempi di consegna': 'servizio', 'Cliente ha ridotto i capi': 'altro' };
const isNone = s => !s || /^nessun[ao]?$/i.test(String(s).trim());

/* Configurazione del mangimificio; l'edizione agrofarmaci passa la sua. */
export const FEED_COMMERCIALE = { schemes: SCHEMES, rivals: RIVALS, reason: REASON, movedType: 'allevamento', rebateType: 'rivendita', rebates: [1, 1.5, 2] };
export function demoCommerciale(d, opts = {}) { return commercialeDemo(d, opts, FEED_COMMERCIALE); }
/** Estensore commerciale con la configurazione dell'azienda (cfg, vedi FEED_COMMERCIALE). */
export function commercialeDemo(d, { today, R } = {}, cfg = FEED_COMMERCIALE) {
  if (!d?.products?.length || !today || !R) return {};
  const { schemes: SCHEMES, rivals: RIVALS, reason: REASON } = cfg;
  const add = {}, update = {};

  // listini: apertura al 97% del listino attuale fino alla revisione di primavera (lunedì della settimana 26 del demo)
  const w26 = addDays(mondayOf(today), -25 * 7);
  const first = {};
  for (const s of d.shipments || []) if (!first[s.productId] || s.date < first[s.productId]) first[s.productId] = s.date;
  const priced = new Set((d.priceLists || []).map(r => r.productId));
  add.priceLists = [];
  for (const p of d.products) {
    if (priced.has(p.id) || !(+p.listPrice > 0)) continue;
    const open = first[p.id] ? addDays(first[p.id], -1) : addDays(w26, -182);
    if (open < w26) add.priceLists.push({ id: `pl-${p.id}-1`, productId: p.id, price: Math.round(p.listPrice * 0.97), validFrom: open, validTo: addDays(w26, -1), reason: 'Listino d’apertura', approvedBy: 'Direzione commerciale', createdAt: open });
    add.priceLists.push({ id: `pl-${p.id}-2`, productId: p.id, price: +p.listPrice, validFrom: w26, validTo: null, reason: 'Revisione di primavera', approvedBy: 'Direzione commerciale', createdAt: addDays(w26, -10) });
  }

  // schemi provvigionali degli agenti (solo dove manca)
  update.agents = (d.agents || []).filter(a => SCHEMES[a.id] && !a.scheme).map(a => ({ id: a.id, scheme: { basePct: +a.commissionPct || 0, ...SCHEMES[a.id], belowMinFactor: 0.5 } }));

  // storico delle assegnazioni: un cliente cambia agente a metà anno (agentId e consegne restano come sono)
  const custs = [...(d.customers || [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const farms = custs.filter(c => c.type === cfg.movedType && !c.agentHistory);
  const moved = farms.length ? farms[R.int(0, farms.length - 1)] : null;
  const agents = (d.agents || []).map(a => a.id);
  const change = monthStart(addDays(today, -120));
  update.customers = [];
  for (const c of custs) {
    const u = { id: c.id };
    if (!c.agentHistory) {
      const since = /^\d{4}$/.test(String(c.since)) ? `${c.since}-01-01` : addDays(today, -730);
      if (c === moved && agents.length > 1) {
        const others = agents.filter(x => x !== c.agentId);
        u.agentHistory = [{ agentId: others[R.int(0, others.length - 1)], from: since }, { agentId: c.agentId, from: change, note: 'Riassegnazione di zona' }];
      } else u.agentHistory = [{ agentId: c.agentId, from: since }];
    }
    // premio di fine anno delle rivendite (maturato sul fatturato): entra nella cascata del prezzo pocket
    if (c.type === cfg.rebateType && c.rebatePct == null) u.rebatePct = R.pick(cfg.rebates);
    if (Object.keys(u).length > 1) update.customers.push(u);
  }

  // offerte: data della decisione, costo pieno fotografato all'offerta, motivo strutturato delle perse
  const C = costsOf(d, makeIndex(d));
  update.offers = [];
  for (const o of d.offers || []) {
    const u = { id: o.id };
    if ((o.status === 'accettata' || o.status === 'persa') && !o.decidedAt) { const dd = addDays(o.date, R.int(3, 20)); u.decidedAt = dd > today ? today : dd; }
    if (o.costAtOffer == null && C[o.productId]) u.costAtOffer = round(C[o.productId].total * 0.98, 2);
    if (o.status === 'persa' && !o.lossReason) {
      u.lossReason = REASON[o.note] || 'altro';
      if (u.lossReason === 'prezzo') { u.competitor = RIVALS[R.int(0, RIVALS.length - 1)]; u.competitorPrice = Math.round(o.price * R.range(0.95, 0.98) / 5) * 5; }
    }
    if (Object.keys(u).length > 1) update.offers.push(u);
  }

  // visite: scadenza del prossimo passo concordato
  update.visits = (d.visits || []).filter(v => !isNone(v.nextAction) && !v.nextActionDue).map(v => ({ id: v.id, nextActionDue: addDays(v.date, R.int(7, 21)) }));

  return {
    add, update,
    settings: {
      agentRules: { year: +today.slice(0, 4), enasarcoPct: 17, massimale: { mono: null, pluri: null }, firr: { mono: [[6200, 4], [9300, 2], [null, 1]], pluri: [[12400, 4], [18600, 2], [null, 1]] } },
      commercial: { extraDiscountPts: 2, prob: { bozza: 0.2, inviata: 0.5 } },
    },
  };
}
