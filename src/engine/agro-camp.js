/* FitoOS · Motore delle campagne commerciali (edizione agrofarmaci): ordini anticipati con sconto a scaglioni di data,
 * premi di fine campagna sugli obiettivi dei clienti, resi con tetto. Funzioni pure, mai eccezioni, date da fuori. */
import { addDays, daysBetween, sum, byId, dateIt, nf, eur } from '../core/util.js';

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const lineValue = o => sum(o.lines || [], l => (+l.tonnes || 0) * (+l.price || 0)) * (1 - (+o.discountPct || 0) / 100);

/** Campagna in corso alla data (la stagione la contiene) e quella precedente. */
export function campaignsAt(d, today) {
  const cs = [...(d.campaigns || [])].sort((a, b) => (a.from < b.from ? -1 : 1));
  const cur = cs.find(c => c.from <= today && today <= c.to) || cs.at(-1) || null;
  const prev = cur ? cs.filter(c => c.to < cur.from).at(-1) || null : null;
  return { cur, prev, all: cs };
}

/** Sconto per ordine anticipato alla data dell'ordine (primo scaglione con until ≥ data). */
export function earlyDiscount(camp, date) {
  const t = (camp?.earlyTiers || []).filter(x => date <= x.until).sort((a, b) => (a.until < b.until ? -1 : 1))[0];
  return t ? +t.pct : 0;
}

/** Ricavi della stagione per cliente (consegne fra from e min(to, oggi)) meno i resi accettati. */
export function seasonRevenue(d, camp, today) {
  const to = camp.to < today ? camp.to : today;
  const out = {};
  for (const s of d.shipments || []) if (s.date >= camp.from && s.date <= to) out[s.customerId] = (out[s.customerId] || 0) + (+s.tonnes || 0) * (+s.price || 0);
  for (const r of d.returns || []) if (r.campaignId === camp.id && r.status === 'accettato') out[r.customerId] = (out[r.customerId] || 0) - (+r.value || 0);
  return out;
}

/** Premi di fine campagna: per cliente obiettivo, fatturato, quota, scaglione raggiunto, premio, distanza dal prossimo. */
export function rebateAccrual(d, camp, today) {
  if (!camp) return { rows: [], total: 0, n: 0 };
  const rev = seasonRevenue(d, camp, today), custs = byId(d.customers || []);
  const tiers = [...(camp.rebateTiers || [])].sort((a, b) => a.fromPct - b.fromPct);
  const elapsed = Math.min(1, Math.max(0, daysBetween(camp.from, today) / Math.max(1, daysBetween(camp.from, camp.to))));
  const rows = (camp.targets || []).map(t => {
    const actual = Math.max(0, rev[t.customerId] || 0), target = +t.target || 0;
    const q = target > 0 ? actual / target : null;
    const reached = tiers.filter(x => q != null && q * 100 >= x.fromPct).at(-1) || null;
    const next = tiers.find(x => q == null || q * 100 < x.fromPct) || null;
    const rebate = reached ? actual * reached.pct / 100 : 0;
    const gap = next && target > 0 ? Math.max(0, target * next.fromPct / 100 - actual) : null;
    const gain = next ? (actual + (gap || 0)) * next.pct / 100 - rebate : null;
    return { customerId: t.customerId, customer: custs[t.customerId]?.name || t.customerId, agentId: custs[t.customerId]?.agentId || null, target, actual, q, tier: reached?.pct ?? 0, rebate, next: next?.pct ?? null, nextFrom: next?.fromPct ?? null, gap, gain };
  }).sort((a, b) => b.actual - a.actual);
  return { rows, total: sum(rows, r => r.rebate), n: rows.filter(r => r.rebate > 0).length, elapsed, settled: !!camp.rebatesSettledAt, settleBy: camp.settleBy || null };
}

/**
 * Ordini anticipati: valore cumulato della campagna corrente e della precedente allo stesso giorno dall'apertura,
 * per settimana, per agente e per categoria di prodotto.
 */
export function earlyProgress(d, cur, prev, today) {
  if (!cur) return null;
  const ords = (d.earlyOrders || []).filter(o => o.status !== 'annullato');
  const of = c => ords.filter(o => o.campaignId === c?.id);
  const day = daysBetween(cur.earlyFrom, today);
  const atDay = (c, n) => sum(of(c).filter(o => daysBetween(c.earlyFrom, o.date) <= n), lineValue);
  const curV = atDay(cur, day), prevSame = prev ? atDay(prev, day) : null, prevTot = prev ? sum(of(prev), lineValue) : null;
  const span = Math.max(7, daysBetween(cur.earlyFrom, cur.earlyTo));
  const curve = [];
  for (let n = 0; n <= span; n += 7) curve.push({ day: n, label: dateIt(addDays(cur.earlyFrom, n), 'dm'), cur: n <= day ? atDay(cur, n) : null, prev: prev ? atDay(prev, n) : null });
  const prods = byId(d.products || []), custs = byId(d.customers || []);
  const by = (list, key) => { const o = {}; for (const x of list) for (const l of x.lines || []) { const k = key(x, l); o[k] = (o[k] || 0) + (+l.tonnes || 0) * (+l.price || 0) * (1 - (+x.discountPct || 0) / 100); } return o; };
  const curOrders = of(cur).filter(o => o.date <= today);
  const prevOrdersSame = prev ? of(prev).filter(o => daysBetween(prev.earlyFrom, o.date) <= day) : [];
  const byAgentCur = by(curOrders, o => custs[o.customerId]?.agentId || '—'), byAgentPrev = by(prevOrdersSame, o => custs[o.customerId]?.agentId || '—');
  const byCatCur = by(curOrders, (o, l) => prods[l.productId]?.category || 'altro'), byCatPrev = by(prevOrdersSame, (o, l) => prods[l.productId]?.category || 'altro');
  const customers = new Set(curOrders.map(o => o.customerId)).size, prevCustomers = new Set(prevOrdersSame.map(o => o.customerId)).size;
  return { day, cur: curV, prevSame, prevTot, ratio: prevSame ? curV / prevSame : null, curve, byAgent: { cur: byAgentCur, prev: byAgentPrev }, byCat: { cur: byCatCur, prev: byCatPrev },
    orders: curOrders.length, customers, prevCustomers, discount: earlyDiscount(cur, today), nextDeadline: (cur.earlyTiers || []).map(x => x.until).filter(u => u >= today).sort()[0] || null };
}

/** Resi della campagna: valore, quota sui ricavi della stagione, per motivo e clienti oltre il tetto. */
export function returnsStats(d, camp, today) {
  if (!camp) return null;
  const rs = (d.returns || []).filter(r => r.campaignId === camp.id);
  const rev = seasonRevenue({ ...d, returns: [] }, camp, today);
  const acc = rs.filter(r => r.status !== 'rifiutato');
  const byReason = {}, byCust = {};
  for (const r of acc) { byReason[r.reason] = (byReason[r.reason] || 0) + (+r.value || 0); byCust[r.customerId] = (byCust[r.customerId] || 0) + (+r.value || 0); }
  const cap = (+camp.returnsCapPct || 5) / 100, custs = byId(d.customers || []);
  const over = Object.entries(byCust).map(([id, v]) => ({ customerId: id, customer: custs[id]?.name || id, value: v, revenue: rev[id] || 0, share: rev[id] ? v / rev[id] : null }))
    .filter(x => x.share != null && x.share > cap).sort((a, b) => b.share - a.share);
  const total = sum(acc, r => +r.value || 0), seasonRev = sum(Object.values(rev));
  return { rows: rs, total, share: seasonRev > 0 ? total / seasonRev : null, byReason, over, cap, pending: rs.filter(r => r.status === 'richiesto').length };
}

/** Segnali «Oggi» delle campagne (prefisso camp:). */
export function campSignals(d, ctx) {
  const out = [];
  if (!d || !(d.campaigns || []).length) return out;
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!isDate(today)) return out;
  const { cur, prev } = campaignsAt(d, today);
  const link = id => ({ area: 'commerciale', tab: 'campagne', ...(id ? { id } : {}) });
  const ep = earlyProgress(d, cur, prev, today);
  if (ep && ep.prevSame > 0 && today <= cur.earlyTo && ep.ratio < 0.9) out.push({ key: `camp:anticipi:${cur.id}:${today.slice(0, 7)}`, area: 'commerciale', roles: ['direzione', 'commerciale', 'agente'], severity: ep.ratio < 0.8 ? 'critico' : 'attenzione',
    title: `Ordini anticipati ${cur.name} al ${nf(ep.ratio * 100)}% dello scorso anno`,
    why: `${eur(ep.cur)} ordinati in ${nf(ep.day)} giorni dall’apertura contro ${eur(ep.prevSame)} alla stessa data della campagna precedente; ${nf(ep.customers)} clienti hanno già ordinato (${nf(ep.prevCustomers)} l’anno scorso).${ep.nextDeadline ? ` Lo sconto del ${nf(ep.discount, 1)}% vale fino al ${dateIt(ep.nextDeadline)}.` : ''}`,
    action: 'Chiamare i clienti che l’anno scorso a quest’ora avevano già ordinato, partendo dagli agenti più indietro.', impact: Math.max(0, ep.prevSame - ep.cur) + 1e5, link: link('anticipi') });
  if (prev && prev.to < today) {
    const rb = rebateAccrual(d, prev, today);
    if (rb.total > 0 && !rb.settled) out.push({ key: `camp:premi:${prev.id}`, area: 'commerciale', roles: ['direzione', 'commerciale'], severity: rb.settleBy && daysBetween(today, rb.settleBy) <= 30 ? 'attenzione' : 'info',
      title: `Premi della ${prev.name} da liquidare: ${eur(rb.total)} a ${nf(rb.n)} clienti`, why: `Campagna chiusa il ${dateIt(prev.to)}; i premi vanno calcolati sul fatturato netto dei resi e liquidati${rb.settleBy ? ` entro il ${dateIt(rb.settleBy)}` : ''} con note di credito.`,
      action: 'Verificare l’elenco, emettere le note di credito e registrarne la liquidazione.', impact: rb.total + 5e4, link: link('premi') });
    const rs = returnsStats(d, prev, today);
    if (rs?.over.length) out.push({ key: `camp:resi:${prev.id}`, area: 'commerciale', roles: ['direzione', 'commerciale'], severity: 'attenzione',
      title: `${rs.over.length === 1 ? 'Un cliente ha' : `${nf(rs.over.length)} clienti hanno`} resi oltre il ${nf(rs.cap * 100)}% concordato`, why: `${rs.over.slice(0, 3).map(x => `${x.customer} ${nf(x.share * 100, 1)}%`).join(', ')}. I resi riducono il fatturato su cui si calcola il premio.`,
      action: 'Discutere con il cliente la quota di resi e gli ordini della nuova campagna.', impact: sum(rs.over, x => x.value) + 2e4, link: link('resi') });
  }
  if (cur) {
    const rb = rebateAccrual(d, cur, today);
    const near = rb.rows.filter(r => r.gap != null && r.gap > 0 && r.gap <= r.target * 0.05 && r.gain > 0).sort((a, b) => b.gain - a.gain);
    if (near.length && rb.elapsed > 0.5) out.push({ key: `camp:scaglione:${cur.id}:${today.slice(0, 7)}`, area: 'commerciale', roles: ['commerciale', 'agente'], severity: 'info',
      title: `${nf(near.length)} clienti vicini allo scaglione successivo del premio`, why: near.slice(0, 3).map(r => `${r.customer}: mancano ${eur(r.gap)} per il ${nf(r.next, 1)}%`).join('; ') + '.',
      action: 'Proporre un ordine di completamento prima della fine della campagna.', impact: sum(near, r => r.gap) * 0.3, link: link('premi') });
  }
  return out;
}

/** KPI delle campagne. */
export function campKpis(d, today) {
  const { cur, prev } = campaignsAt(d, today);
  if (!cur) return null;
  const ep = earlyProgress(d, cur, prev, today), rb = rebateAccrual(d, prev && prev.to < today ? prev : cur, today), rs = returnsStats(d, prev || cur, today);
  return { early: ep?.cur ?? null, earlyRatio: ep?.ratio ?? null, rebates: rb.total, returnsShare: rs?.share ?? null };
}

export { lineValue as earlyOrderValue };
