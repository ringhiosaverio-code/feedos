/* FeedOS 17 · Estensore del demo: salesHistory, budget e costi fissi di budget, chiusure dei mesi (pacchetto WP1).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Tutti i numeri sono inventati e deterministici (R = rng(seme + 201)). */
import { rng, addMonths, endOfMonth, round, dateIt, monthLabel } from '../../core/util.js';
import { makeCtx, aggregateFacts, fixedFor, FACT_SUMS } from '../../engine/actuals.js';
import { pnl, fixedSplit, firstFactDate } from '../../engine/pnl.js';
import { basis } from '../../engine/pvm.js';
import { snapshotMonth } from '../../engine/closing.js';
import { runRules } from '../../engine/dataquality.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const p2 = n => String(n).padStart(2, '0');
const whole = m => ({ from: m + '-01', to: endOfMonth(m) });

/** Indice di mercato del mese: media delle quotazioni di tutte le materie prime nel mese (null se non ci sono). */
function marketIndex(d) {
  const acc = {};
  for (const q of d.market || []) { const m = String(q.date || '').slice(0, 7); if (!m || !Number.isFinite(+q.price)) continue; (acc[m] ||= [0, 0]); acc[m][0] += +q.price; acc[m][1]++; }
  const out = {};
  for (const [m, [s, n]] of Object.entries(acc)) out[m] = s / n;
  return m => out[m] ?? null;
}

/* Commenti della direzione all'ultimo mese chiuso; l'edizione agrofarmaci passa i suoi. */
export const FEED_DIREZIONE = {
  sintesi: mese => `In ${mese} il margine di contribuzione per tonnellata scende ancora: il rincaro di mais e farina di soia non è stato trasferito sui listini. Proposta: revisione dei listini dal 1° novembre e coperture sulle materie prime principali fino a marzo.`,
  budget: 'La stima di chiusura resta sotto il budget approvato a dicembre: si propone una revisione del budget con i nuovi prezzi delle materie prime.',
  product: 'FeedOS',
};
export function demoDirezione(d, opts = {}) { return direzioneDemo(d, opts, FEED_DIREZIONE); }
/** Estensore della direzione con la configurazione dell'azienda (cfg, vedi FEED_DIREZIONE). */
export function direzioneDemo(d, { today, R = rng(16 + 201) } = {}, cfg = FEED_DIREZIONE) {
  if (!today || !(d.shipments || []).length) return {};
  const ctx = makeCtx(d, today);
  const first = firstFactDate(ctx.facts);
  if (!first) return {};
  const firstMonth = first.slice(0, 7), tm = today.slice(0, 7);
  const MI = marketIndex(d);
  const cust = Object.fromEntries((d.customers || []).map(c => [c.id, c]));
  const prod = Object.fromEntries((d.products || []).map(p => [p.id, p]));

  // (a) storico mensile dei 12 mesi prima dei fatti, cliente × prodotto, dallo stesso mese dell'anno dopo
  const salesHistory = [];
  for (let k = 12; k >= 1; k--) {
    const h = addMonths(firstMonth, -k);
    let ref = addMonths(h, 12), season = 1;
    if (ref === firstMonth && first > firstMonth + '-01') { ref = addMonths(ref, 1); season = 0.92; } // primo mese parziale: novembre × 0,92
    const rows = aggregateFacts(ctx.facts, [], whole(ref), ['customerId', 'productId']).rows;
    const mi = MI(h) && MI(ref) ? MI(h) / MI(ref) : 1;
    for (const r of rows) {
      if (!(r.tonnes > 0)) continue;
      const t = round(r.tonnes * season * 0.97 * (1 + R.range(-0.04, 0.04)), 2);
      const perT = x => n0(x) / r.tonnes;
      const revenue = round(perT(r.revenue) * t / 1.03, 2);
      const c = cust[r.customerId] || {};
      const disc = n0(c.discountPct) / 100;
      salesHistory.push({
        id: `sh-${h}-${r.customerId}-${r.productId}`, month: h, customerId: r.customerId, productId: r.productId,
        agentId: c.agentId ?? null, species: prod[r.productId]?.species ?? null,
        tonnes: t, revenue, listRevenue: round(disc < 1 ? revenue / (1 - disc) : revenue, 2),
        raw: round(perT(r.raw) * t * mi, 2), shrink: round(perT(r.shrink) * t * mi, 2),
        energy: round(perT(r.energy) * t, 2), varConv: round(perT(r.varConv) * t, 2), pack: round(perT(r.pack) * t, 2), fixConv: round(perT(r.fixConv) * t, 2),
        logistics: round(perT(r.logistics) * t, 2),
        commission: round(r.revenue > 0 ? revenue * r.commission / r.revenue : 0, 2), // stessa % di provvigione
        finCost: round(r.revenue > 0 ? revenue * r.finCost / r.revenue : 0, 2),
        n: Math.max(1, Math.round(n0(r.n) * 0.97)), source: 'demo',
      });
    }
  }

  // (b) budget dell'anno di oggi (versione B), approvato il 15/12 dell'anno prima
  const year = +today.slice(0, 4), dec = `${year - 1}-12`, nov = `${year - 1}-11`;
  const budget = [], fixedBudget = [];
  const decB = basis(d, ctx, whole(dec), 'productId', { fixed: false }).rows;
  const novB = basis(d, ctx, whole(nov), 'productId', { fixed: false }).rows;
  const shT = {};
  for (const h of salesHistory) shT[h.month] = (shT[h.month] || 0) + h.tonnes;
  const shOf = cal => { const m = Object.keys(shT).find(x => +x.slice(5, 7) === cal); return m ? shT[m] : null; };
  const base = ((shOf(11) || 0) + (shOf(12) || 0)) / 2;
  const miRatio = MI(dec) && MI(tm) ? MI(dec) / MI(tm) : 1;
  for (const p of d.products || []) {
    if (p.active === false) continue;
    const r = decB[p.id], q = novB[p.id];
    const run = ((r?.t || 0) + (q?.t || 0)) / 2;
    if (!(run > 0)) continue;
    const c = ctx.costs[p.id] || {};
    const has = r && r.t > 0;
    const price = has ? r.rev / r.t : n0(p.listPrice) * 0.98, list = has ? r.list / r.t : n0(p.listPrice);
    const rawT = has ? r.raw / r.t : n0(c.raw) * miRatio;
    const kwhT = has ? r.kwh / r.t : null, gplT = has ? r.gplKg / r.t : null;
    for (let i = 1; i <= 12; i++) {
      const ratio = base > 0 && shOf(i) ? shOf(i) / base : 1;
      const up = i >= 3 ? 1.02 : 1;
      budget.push({
        id: `bu-${year}-B-${p2(i)}-${p.id}`, year, version: 'B', month: `${year}-${p2(i)}`, productId: p.id, species: p.species ?? null,
        tonnes: round(run * ratio * 1.02, 1), price: round(price * up, 2), list: round(list * up, 2),
        rawCostT: round(rawT, 2), energyT: round(has ? r.energy / r.t : n0(c.energy), 4),
        kwhT: kwhT == null ? null : round(kwhT, 4), gplT: gplT == null ? null : round(gplT, 4),
        kwhPrice: has && r.kwh > 0 ? round(r.kwhEur / r.kwh, 5) : null, gplPrice: has && r.gplKg > 0 ? round(r.gplEur / r.gplKg, 5) : null,
        varConvT: has ? round(r.varConv / r.t, 4) : n0(p.varProcessCost ?? p.processCost), packT: has ? round(r.pack / r.t, 4) : n0(p.packCost),
        logisticsT: has ? round(r.logistics / r.t, 4) : n0(p.logisticsCost), commissionPct: has && r.rev > 0 ? round(r.commission / r.rev * 100, 4) : null,
        source: 'demo',
      });
    }
  }
  // (c) costi fissi di budget: stesso mese dell'anno prima per centro × 1,01 (stesso andamento del consuntivo)
  const cons = {};
  for (const f of d.fixedCosts || []) if ((f.kind || 'consuntivo') === 'consuntivo') cons[`${f.month}|${f.centerId}`] = (cons[`${f.month}|${f.centerId}`] || 0) + n0(f.amount);
  for (const cc of d.costCenters || []) for (let i = 1; i <= 12; i++) {
    const m = `${year}-${p2(i)}`, prev = cons[`${addMonths(m, -12)}|${cc.id}`];
    if (prev == null) continue;
    fixedBudget.push({ id: `fb-${year}-B-${p2(i)}-${cc.id}`, month: m, centerId: cc.id, kind: 'budget', version: 'B', amount: Math.round(prev * 1.01), source: 'demo', note: '' }); // +1% di inflazione
  }
  const status = { year, version: 'B', status: 'approvato', approvedAt: `${year - 1}-12-15`, approvedBy: 'Direzione (demo)', createdAt: `${year - 1}-12-01`, basedOn: null };

  // (e) chiusure: storico (dai mesi dello storico) e FeedOS (mesi interi dal primo con fatti al mese prima di oggi)
  const closings = [];
  for (let k = 12; k >= 1; k--) {
    const h = addMonths(firstMonth, -k);
    const rows = salesHistory.filter(x => x.month === h);
    if (!rows.length) continue;
    const a = aggregateFacts([], rows, whole(h), ['productId']);
    const fixed = fixedFor(d.fixedCosts || [], d.costCenters || [], whole(h));
    const split = fixedSplit(fixed, d.costCenters || []);
    const p = pnl(a.total, { ...fixed, split });
    closings.push({
      id: h, month: h, status: 'chiuso', source: 'storico',
      pnl: Object.fromEntries([...FACT_SUMS, 'n'].map(x => [x, n0(a.total[x])])), lines: p.lines.map(l => ({ id: l.id, value: l.value })),
      byProduct: a.rows.map(r => ({ key: r.productId, label: prod[r.productId]?.name || r.productId, tonnes: r.tonnes, revenue: r.revenue, mdc1: r.mc1, mdc2: r.mc2, mdc2T: r.tonnes > 0 ? r.mc2 / r.tonnes : null, share: a.total.revenue ? r.revenue / a.total.revenue : null })),
      fixed: { total: fixed.total, cash: fixed.cash, nonCash: fixed.nonCash, byCenter: { ...fixed.byCenter }, byGroup: { ...fixed.byGroup }, split, estimatedMonths: fixed.estimatedMonths },
      kpis: { tonnes: a.total.tonnes, mdc2T: a.total.tonnes > 0 ? a.total.mc2 / a.total.tonnes : null, ebitPct: a.total.revenue > 0 ? p.by.ebit / a.total.revenue : null, ebit: p.by.ebit },
      dq: null, comments: {}, note: 'Storico mensile importato dal gestionale precedente (dati dimostrativi)',
      closedAt: `${addMonths(h, 1)}-10T17:00:00.000Z`, closedBy: 'Storico importato (demo)',
    });
  }
  let dq = null;
  try { dq = runRules(d, ctx, { scope: 'closing' })?.score ?? null; } catch { dq = null; }
  const lastClosed = addMonths(tm, -1);
  for (let m = firstMonth; m <= lastClosed; m = addMonths(m, 1)) {
    const comments = {};
    let note = '';
    if (m === firstMonth && first > m + '-01') { note = `Mese parziale: consegne dal ${dateIt(first)}`; comments.sintesi = `${note} (avvio di ${cfg.product}). I confronti con questo mese non sono omogenei.`; }
    if (m === lastClosed) {
      comments.sintesi = cfg.sintesi(monthLabel(m, false));
      comments.budget = cfg.budget;
    }
    const snap = snapshotMonth(d, ctx, m, { by: 'Direzione (demo)', at: `${addMonths(m, 1)}-05T16:30:00.000Z`, comments, dq });
    if (note) snap.note = note;
    closings.push(snap);
  }

  // solo aggiunte: niente id già presenti, niente mesi o anni che l'archivio ha già (storico, budget, chiusure),
  // impostazioni scritte solo se mancano (un demo già esteso o modificato dall'utente resta com'è)
  const ids = coll => new Set((d[coll] || []).map(x => x.id));
  const fresh = (coll, rows, skip = () => false) => { const s = ids(coll); return rows.filter(r => !s.has(r.id) && !skip(r)); };
  const histMonths = new Set((d.salesHistory || []).map(h => String(h.month || '').slice(0, 7)));
  const budYear = (d.budget || []).some(r => String(r.month || '').startsWith(`${year}-`) && (r.version || 'B') === 'B');
  const fbKeys = new Set((d.fixedCosts || []).filter(f => f.kind === 'budget' && (f.version || 'B') === 'B').map(f => `${String(f.month).slice(0, 7)}|${f.centerId}`));
  const closedMonths = new Set((d.closings || []).map(c => c.month || c.id));
  const fin = d.settings?.finance || {};
  const settings = {};
  if (!fin.budget && !fin.budgetStatus?.[year]) settings.finance = { budget: status, budgetStatus: { [year]: status } };
  if (!d.settings?.closedThrough) settings.closedThrough = lastClosed;
  return {
    add: {
      salesHistory: fresh('salesHistory', salesHistory, h => histMonths.has(h.month)),
      budget: budYear ? [] : fresh('budget', budget),
      fixedCosts: fresh('fixedCosts', fixedBudget, f => fbKeys.has(`${f.month}|${f.centerId}`)),
      closings: fresh('closings', closings, c => closedMonths.has(c.month)),
    },
    settings,
  };
}
