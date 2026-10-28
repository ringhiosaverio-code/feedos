/* DifesaOS · Estensore del demo: campagne commerciali (stagione da ottobre a settembre), ordini anticipati, obiettivi e premi
 * dei clienti, resi. Dati inventati e deterministici, coerenti con le consegne del generatore: la campagna chiusa ha i premi
 * da liquidare, quella aperta raccoglie ordini anticipati più lenti dell'anno prima (segnale «Oggi»). */
import { addDays, round, byId } from '../../../core/util.js';

const EARLY = [['10-31', 5], ['11-30', 4], ['12-31', 3], ['01-31', 2]];
const REBATE = [{ fromPct: 90, pct: 1 }, { fromPct: 100, pct: 2.5 }, { fromPct: 115, pct: 4 }];

function campaign(season, today) {
  const y0 = season - 1;
  const tiers = EARLY.map(([md, pct]) => ({ until: `${md.startsWith('01') ? season : y0}-${md}`, pct }));
  return { id: `camp-${season}`, season, name: `Campagna ${season}`, from: `${y0}-10-01`, to: `${season}-09-30`, earlyFrom: `${y0}-10-01`, earlyTo: `${season}-01-31`,
    earlyTiers: tiers, paymentDate: `${season}-08-31`, rebateTiers: REBATE.map(t => ({ ...t })), returnsCapPct: 5, settleBy: `${season}-12-15`, rebatesSettledAt: null,
    status: `${season}-09-30` < today ? 'chiusa' : 'in corso', targets: [], note: 'Ordini anticipati con sconto a scaglioni di data, pagamento a data fissa, premio sul fatturato netto dei resi (condizioni dimostrative)' };
}

export function demoCampagne(d, { today, R } = {}) {
  if (!today || !R || !(d.shipments || []).length || (d.campaigns || []).length) return {};
  const season = +today.slice(0, 4) + (today.slice(5, 7) >= '10' ? 1 : 0);
  const cur = campaign(season, today), prev = campaign(season - 1, today);
  const prods = byId(d.products || []);
  const custs = [...(d.customers || [])].sort((a, b) => (a.id < b.id ? -1 : 1));

  // fatturato e prodotti di ogni cliente nella campagna chiusa (dalle consegne)
  const rev = {}, mix = {};
  for (const s of d.shipments) if (s.date >= prev.from && s.date <= prev.to) {
    rev[s.customerId] = (rev[s.customerId] || 0) + s.tonnes * s.price;
    ((mix[s.customerId] ||= {})[s.productId] ||= { t: 0, price: s.price }).t += s.tonnes;
  }
  // obiettivi: campagna chiusa distribuita fra gli scaglioni, campagna aperta con una crescita del 0–12%
  for (const c of custs) {
    const r = rev[c.id] || 0;
    if (r < 5000) continue;
    prev.targets.push({ customerId: c.id, target: Math.round(r / R.range(0.84, 1.22) / 1000) * 1000 });
    cur.targets.push({ customerId: c.id, target: Math.round(r * R.range(1.0, 1.12) / 1000) * 1000 });
  }

  // ordini anticipati: la campagna chiusa ne raccoglie circa il 42% del fatturato, concentrati prima delle scadenze degli sconti
  const earlyOrders = [];
  let no = 0;
  const pickDate = (camp, maxDay) => {
    const deadlines = camp.earlyTiers.map(t => t.until);
    for (let k = 0; k < 20; k++) {
      const dl = R.pick(deadlines), dd = addDays(dl, -Math.floor(Math.abs(R.normal(0, 9))));
      if (dd >= camp.earlyFrom && (!maxDay || dd <= maxDay)) return dd;
    }
    return camp.earlyFrom;
  };
  const order = (camp, c, date, share, k) => {
    const lines = Object.entries(mix[c.id] || {}).sort((a, b) => b[1].t - a[1].t).slice(0, R.int(2, 5)).map(([pid, x]) => ({ productId: pid, tonnes: round(x.t * share * R.range(0.8, 1.2), 2), price: round(x.price * (camp === cur ? R.range(1.0, 1.03) : 1), 0) }));
    if (!lines.length) return null;
    const discountPct = (camp.earlyTiers.filter(t => date <= t.until).sort((a, b) => (a.until < b.until ? -1 : 1))[0] || { pct: 0 }).pct;
    return { id: `eo-${++no}`, code: `OA${String(camp.season).slice(2)}-${String(k).padStart(4, '0')}`, campaignId: camp.id, customerId: c.id, agentId: c.agentId, date, lines, discountPct,
      deliveryFrom: `${camp.season}-02-15`, status: camp === prev ? 'evaso' : 'confermato', note: '' };
  };
  let k = 0;
  for (const c of custs) {
    if (!(rev[c.id] > 5000) || !R.chance(0.82)) continue;
    const n = R.int(1, 3);
    for (let i = 0; i < n; i++) { const o = order(prev, c, pickDate(prev), 0.42 / n, ++k); if (o) earlyOrders.push(o); }
  }
  // campagna aperta: stessi clienti, ma a oggi il 18% in meno rispetto alla stessa data dell'anno prima
  const dayNow = Math.round((Date.parse(today) - Date.parse(cur.earlyFrom)) / 864e5);
  const prevSameDay = earlyOrders.filter(o => o.campaignId === prev.id && Math.round((Date.parse(o.date) - Date.parse(prev.earlyFrom)) / 864e5) <= dayNow);
  k = 0;
  for (const po of prevSameDay) {
    if (!R.chance(0.93)) continue;
    const c = custs.find(x => x.id === po.customerId);
    const date = addDays(po.date, 365 + R.int(-6, 4));
    const dd = date > today ? today : date < cur.earlyFrom ? cur.earlyFrom : date;
    const o = { ...po, id: `eo-${++no}`, code: `OA${String(cur.season).slice(2)}-${String(++k).padStart(4, '0')}`, campaignId: cur.id, date: dd, status: 'confermato', deliveryFrom: `${cur.season}-02-15`,
      lines: po.lines.map(l => ({ ...l, tonnes: round(l.tonnes * R.range(0.85, 1.0), 2), price: round(l.price * R.range(1.0, 1.03), 0) })) };
    o.discountPct = (cur.earlyTiers.filter(t => dd <= t.until).sort((a, b) => (a.until < b.until ? -1 : 1))[0] || { pct: 0 }).pct;
    if (c) earlyOrders.push(o);
  }

  // resi della campagna chiusa: invenduto di fine stagione, confezioni danneggiate, prodotto revocato
  const returns = [];
  const reasons = ['invenduto', 'invenduto', 'danneggiato', 'invenduto', 'revoca'];
  const big = custs.filter(c => c.type === 'rivendita' && rev[c.id] > 30000);
  for (let i = 0; i < Math.min(12, big.length); i++) {
    const c = big[(i * 7) % big.length];
    const items = Object.entries(mix[c.id] || {});
    if (!items.length) continue;
    const reason = reasons[i % reasons.length];
    const fl = items.find(([pid]) => prods[pid]?.code === 'FL50SC');
    const [pid, x] = reason === 'revoca' && fl ? fl : R.pick(items);
    const t = round(i === 0 ? 0.07 * rev[c.id] / x.price : x.t * R.range(0.02, 0.08), 2); // il primo cliente rende il 7% del fatturato, oltre il tetto
    returns.push({ id: `rs-${i + 1}`, campaignId: prev.id, customerId: c.id, date: addDays(prev.to, R.int(-20, 25)), productId: pid, tonnes: t, value: round(t * x.price, 0), reason,
      status: i === 3 ? 'rifiutato' : i >= 9 ? 'richiesto' : 'accettato', note: reason === 'revoca' ? 'Ritiro delle giacenze del rivenditore dopo la revoca' : reason === 'danneggiato' ? 'Taniche rotte durante lo scarico' : 'Invenduto di fine stagione (confezioni integre)' });
  }

  return { add: { campaigns: [prev, cur], earlyOrders, returns } };
}
