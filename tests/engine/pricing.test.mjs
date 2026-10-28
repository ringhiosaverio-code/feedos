/* FeedOS 17 · WP4 listini versionati, realizzazione del prezzo, offerte e segnali commerciali.
 * Demo completo (generatore + estensori) al 16/10/2026 e piccoli archivi costruiti a mano per i casi limite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { demoCommerciale } from '../../src/data/demo/commerciale.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { applyPatch, patchViolations } from '../../src/data/demo/extend.js';
import { makeCtx, listAt, aggregateFacts } from '../../src/engine/actuals.js';
import { applyOpsTo, revertOp } from '../../src/core/ops.js';
import { resolvePeriod } from '../../src/core/period.js';
import { addDays, mondayOf, rng, sum, byId } from '../../src/core/util.js';
import {
  offerState, isOpen, newPriceListOps, bulkRevisionOps, priceHistory, realization, pocketWaterfall, passThrough, passThroughDetail,
  requiredList, revisionSim, authorizedDiscount, winRate, winStats, pipeline, funnel, lossBreakdown, commercialSignals,
  commercialReportSection, priceListRows, listOn, syncListOps,
} from '../../src/engine/pricing.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = resolvePeriod({ preset: '12m' }, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const apply = (d, ops) => { const r = applyOpsTo(d, ops); assert.equal(r.refused, null); return r; };

/* ---------------- demo ---------------- */
test('demo: estensore commerciale deterministico, solo aggiunte, due versioni di listino coerenti con le consegne', () => {
  const g = generateDemo({ today });
  const p1 = demoCommerciale(g, { today, R: rng(16 + 501) }), p2 = demoCommerciale(g, { today, R: rng(16 + 501) });
  assert.deepEqual(p1, p2);
  assert.deepEqual(patchViolations(g, p1), []);
  const w26 = addDays(mondayOf(today), -25 * 7);
  assert.equal(w26, '2026-04-20'); // la revisione di primavera (aprile)
  assert.equal(D.priceLists.length, D.products.length * 2);
  for (const p of D.products) {
    const h = priceHistory(D, p.id);
    assert.equal(h.length, 2, p.code);
    assert.equal(h[0].price, Math.round(p.listPrice * 0.97));
    assert.equal(h[0].validTo, addDays(w26, -1));
    assert.equal(h[1].validFrom, w26); assert.equal(h[1].validTo, null); assert.equal(h[1].price, p.listPrice);
    assert.equal(h[1].reason, 'Revisione di primavera');
    const first = D.shipments.filter(s => s.productId === p.id).reduce((m, s) => (s.date < m ? s.date : m), '9999');
    assert.equal(h[0].validFrom, addDays(first, -1));
  }
  // schemi, storico assegnazioni (un cliente riassegnato), esiti delle offerte, scadenze dei prossimi passi, regole
  assert.deepEqual(D.agents.find(a => a.id === 'ag-1').scheme.tiers, [{ from: 0, pct: 2.3 }, { from: 3000000, pct: 2.7 }]);
  assert.equal(D.agents.find(a => a.id === 'ag-2').scheme.byProduct.EQ12, 3.5);
  assert.equal(D.agents.find(a => a.id === 'ag-3').scheme.accrual, 'incasso');
  assert.deepEqual(D.agents.map(a => a.scheme.mandate), ['mono', 'mono', 'mono', 'pluri']);
  assert.ok(D.agents.every(a => a.scheme.belowMinFactor === 0.5));
  assert.ok(D.customers.every(c => Array.isArray(c.agentHistory) && c.agentHistory.at(-1).agentId === c.agentId));
  assert.equal(D.customers.filter(c => c.agentHistory.length === 2).length, 1);
  for (const o of D.offers) {
    if (o.status === 'accettata' || o.status === 'persa') { assert.ok(o.decidedAt >= o.date && o.decidedAt <= today, o.code); }
    assert.ok(o.costAtOffer > 0);
    if (o.status === 'persa') assert.ok(o.lossReason);
  }
  assert.ok(D.visits.filter(v => v.nextActionDue).every(v => v.nextActionDue > v.date && v.nextAction !== 'Nessuna'));
  assert.equal(D.settings.agentRules.enasarcoPct, 17);
  assert.equal(D.settings.commercial.extraDiscountPts, 2);
});

/* ---------------- offerte ---------------- */
test('offerState: le offerte aperte oltre la validità (come OF-26-112) risultano «scaduta»', () => {
  const o112 = D.offers.find(o => o.code === 'OF-26-112');
  assert.equal(o112.status, 'inviata'); assert.ok(o112.validUntil < today);
  assert.equal(offerState(o112, today), 'scaduta');
  assert.equal(isOpen(o112, today), false);
  assert.deepEqual(D.offers.filter(o => offerState(o, today) === 'scaduta').map(o => o.code).sort(), ['OF-26-103', 'OF-26-112', 'OF-26-113', 'OF-26-115', 'OF-26-122']);
  assert.equal(offerState({ status: 'bozza', validUntil: '2026-01-31' }, '2026-02-01'), 'scaduta');
  assert.equal(offerState({ status: 'bozza', validUntil: '2026-02-01' }, '2026-02-01'), 'bozza'); // valida fino a oggi compreso
  assert.equal(offerState({ status: 'accettata', validUntil: '2026-01-01' }, '2026-02-01'), 'accettata');
  assert.equal(offerState({ status: 'persa', validUntil: '2026-01-01' }, '2026-02-01'), 'persa');
  // il segnale critico «sotto il prezzo minimo» non riguarda più le scadute; il segnale commerciale le chiede di chiudere
  const sig = commercialSignals(D, ctx);
  const exp = sig.filter(s => s.key.startsWith('offer-exp:'));
  assert.equal(exp.length, 5);
  assert.ok(exp.every(s => s.severity === 'attenzione' && s.agentId && s.link.tab === 'offerte'));
  assert.ok(!sig.some(s => s.severity === 'critico'));
});

test('winRate pesa le offerte per valore (t × prezzo) e conta solo le decisioni nel periodo', () => {
  const P = { from: '2026-01-01', to: '2026-03-31' };
  const d = { customers: [{ id: 'c1', agentId: 'a1' }], offers: [
    { id: 'o1', customerId: 'c1', status: 'accettata', tonnes: 100, price: 400, date: '2026-01-10', decidedAt: '2026-01-20' },
    { id: 'o2', customerId: 'c1', status: 'persa', tonnes: 10, price: 400, date: '2026-01-10', decidedAt: '2026-02-01' },
    { id: 'o3', customerId: 'c1', status: 'persa', tonnes: 10, price: 400, date: '2026-01-10', decidedAt: '2026-02-02' },
    { id: 'o4', customerId: 'c1', status: 'persa', tonnes: 10, price: 400, date: '2026-01-10', decidedAt: '2026-03-02' },
    { id: 'o5', customerId: 'c1', status: 'persa', tonnes: 500, price: 400, date: '2025-11-10', decidedAt: '2025-12-20' }, // fuori periodo
    { id: 'o6', customerId: 'c1', status: 'inviata', tonnes: 500, price: 400, date: '2026-01-10', validUntil: '2026-12-31' },
  ] };
  const w = winStats(d, P);
  assert.equal(w.won, 1); assert.equal(w.lost, 3);
  close(winRate(d, P), 40000 / 52000); // a conteggio sarebbe il 25%
  assert.notEqual(Math.round(winRate(d, P) * 100), 25);
  assert.equal(winRate(d, P, { agentId: 'a2' }), null);
  // pipeline pesata: inviata × 0,5 (o settings.commercial.prob)
  assert.equal(pipeline(d, '2026-02-01').weighted, 500 * 400 * 0.5);
  assert.equal(pipeline({ ...d, settings: { commercial: { prob: { inviata: 0.3 } } } }, '2026-02-01').weighted, 500 * 400 * 0.3);
  assert.equal(pipeline(d, '2027-01-01').n, 0); // scaduta: fuori dalla pipeline
  assert.equal(pipeline(d, '2027-01-01').expired.n, 1);
});

test('pipeline, imbuto visite → offerte → accettate e motivi di perdita sul demo', () => {
  const pp = pipeline(D, today);
  assert.equal(pp.n, D.offers.filter(o => isOpen(o, today)).length);
  close(pp.weighted, sum(D.offers.filter(o => isOpen(o, today)), o => o.tonnes * o.price * (o.status === 'bozza' ? 0.2 : 0.5)));
  assert.equal(pp.expired.n, 5);
  const f = funnel(D, P12);
  assert.equal(f.visits, D.visits.filter(v => v.date >= P12.from && v.date <= P12.to).length);
  assert.ok(f.visitsWithOffer <= f.visits && f.accepted <= f.offers && f.offers > 0);
  const lb = lossBreakdown(D, P12);
  assert.equal(sum(lb, r => r.n), D.offers.filter(o => o.status === 'persa').length);
  assert.ok(lb.find(r => r.reason === 'prezzo').competitorGap > 0);
});

test('sconto autorizzato = sconto abituale + punti extra (di base 2)', () => {
  assert.equal(authorizedDiscount({ settings: {} }, { discountPct: 3.5 }), 5.5);
  assert.equal(authorizedDiscount({ settings: { commercial: { extraDiscountPts: 1 } } }, { discountPct: 3.5 }), 4.5);
  assert.equal(authorizedDiscount({ settings: { commercial: { extraDiscountPts: 0 } } }, { discountPct: 0 }), 0);
});

/* ---------------- listini versionati ---------------- */
test('newPriceListOps: chiude la versione in vigore, il futuro non cambia il prezzo di oggi, oggi aggiorna listPrice; tutto annullabile', () => {
  const p = D.products.find(x => x.code === 'LT18');
  const v2 = priceHistory(D, p.id)[1];
  // versione futura
  const r1 = apply(D, newPriceListOps(D, { productId: p.id, price: 380, validFrom: '2026-11-01', reason: 'Revisione d’autunno', approvedBy: 'Direzione', today }));
  const d1 = r1.data, p1 = d1.products.find(x => x.id === p.id);
  assert.equal(p1.listPrice, p.listPrice); // oggi non cambia
  assert.equal(d1.priceLists.find(x => x.id === v2.id).validTo, '2026-10-31');
  assert.equal(listAt(d1.priceLists, p1, '2026-10-20'), p.listPrice);
  assert.equal(listAt(d1.priceLists, p1, '2026-11-05'), 380);
  assert.equal(listAt(d1.priceLists, p1, '2026-01-10'), Math.round(p.listPrice * 0.97)); // lo storico resta
  // versione da oggi, prima di quella futura: listPrice aggiornato, chiude fino alla futura
  const r2 = apply(d1, newPriceListOps(d1, { productId: p.id, price: 370, validFrom: today, reason: 'Correzione', today }));
  const d2 = r2.data, p2 = d2.products.find(x => x.id === p.id);
  assert.equal(p2.listPrice, 370); assert.equal(p2.listUpdatedAt, today);
  assert.equal(listAt(d2.priceLists, p2, '2026-10-15'), p.listPrice);
  assert.equal(listAt(d2.priceLists, p2, today), 370);
  assert.equal(listAt(d2.priceLists, p2, '2026-11-01'), 380);
  assert.equal(priceHistory(d2, p.id).find(h => h.validFrom === today).validTo, '2026-10-31');
  // annullare entrambe riporta l'archivio di partenza
  let back = d2;
  for (const op of [...r2.done].reverse()) back = revertOp(back, op);
  for (const op of [...r1.done].reverse()) back = revertOp(back, op);
  assert.deepEqual(back.priceLists, D.priceLists);
  assert.deepEqual(back.products, D.products);
  // listino senza storico: la prima revisione registra anche il prezzo precedente (realizzazione passata invariata)
  const d0 = { products: [{ id: 'p-x', code: 'X', listPrice: 300 }], priceLists: [], shipments: [{ id: 's1', productId: 'p-x', date: '2026-02-10' }] };
  const r3 = apply(d0, newPriceListOps(d0, { productId: 'p-x', price: 320, validFrom: '2026-06-01', today: '2026-07-01' }));
  assert.equal(r3.data.priceLists.length, 2);
  assert.equal(listAt(r3.data.priceLists, r3.data.products[0], '2026-03-01'), 300);
  assert.equal(listAt(r3.data.priceLists, r3.data.products[0], '2026-07-01'), 320);
  assert.equal(r3.data.products[0].listPrice, 320);
  // revisione in blocco: salta i prezzi invariati; una revisione futura entrata in vigore si allinea con syncListOps
  const bulk = bulkRevisionOps(D, { byProduct: { [p.id]: p.listPrice, 'p-si15': 315 }, validFrom: '2026-11-01', today });
  assert.ok(bulk.every(o => o.id !== p.id && o.obj?.productId !== p.id));
  const later = apply(D, bulk).data;
  assert.deepEqual(syncListOps(later, '2026-11-02').map(o => [o.id, o.patch.listPrice]), [['p-si15', 315]]);
  assert.equal(listOn(D, p, '2020-01-01'), Math.round(p.listPrice * 0.97));
});

/* ---------------- realizzazione e cascata ---------------- */
test('realizzazione sul listino alla data: lo sconto realizzato è lo sconto del cliente (niente 3% di inizio anno)', () => {
  const R = realization(D, ctx, P12, 'customerId');
  const cust = byId(D.customers);
  let worst = 0;
  for (const r of R.rows) worst = Math.max(worst, Math.abs(r.discountPct * 100 - cust[r.customerId].discountPct));
  assert.ok(worst < 0.25, `scarto massimo ${worst} punti`);
  // totale = media degli sconti cliente pesata sul listino; prima della revisione di primavera il listino era al 97%
  const exp = sum(R.rows, r => r.list * cust[r.customerId].discountPct / 100) / sum(R.rows, r => r.list);
  close(R.total.discountPct, exp, 2e-3);
  const H1 = realization(D, ctx, { from: P12.from, to: '2026-04-19' }, null).total;
  assert.ok(H1.discountPct < 0.035, `sconto della prima metà ${H1.discountPct}`);
  // identità: somme per prodotto = per agente = totale
  const byP = realization(D, ctx, P12, 'productId'), byA = realization(D, ctx, P12, 'agentId');
  close(sum(byP.rows, r => r.net), byP.total.net); close(sum(byA.rows, r => r.list), byP.total.list);
  close(byP.total.net, aggregateFacts(ctx.facts, D.salesHistory, P12).total.revenue);
});

test('cascata pocket: i passi sommano dal listino al prezzo pocket e al margine pocket', () => {
  for (const opt of [{}, { productId: 'p-lt18' }, { customerId: D.customers[3].id }]) {
    const W = pocketWaterfall(D, ctx, P12, opt);
    assert.ok(W.tonnes > 0);
    const s = Object.fromEntries(W.steps.map(x => [x.key, x]));
    close(s.list.value + s.custDisc.value + s.extraDisc.value + s.rebate.value + s.commission.value + s.finCost.value + s.logistics.value, s.pocket.value, 1e-9);
    close(s.pocket.value + s.industrial.value, s.margin.value, 1e-9);
    close(s.list.eur + s.custDisc.eur + s.extraDisc.eur, W.totals.net, 1e-9); // sconti = listino − ricavi
  }
  // margine pocket = MdC2 − premi − dilazione (stessi fatti)
  const W = pocketWaterfall(D, ctx, P12), T = aggregateFacts(ctx.facts, D.salesHistory, P12).total;
  close(W.totals.margin, T.mc2 - W.totals.rebate - T.finCost, 1e-9);
  assert.ok(W.totals.rebate > 0); // premi di fine anno delle rivendite
});

/* ---------------- pass-through, listino necessario, simulazione ---------------- */
test('passThrough: null con materie prime piatte, rapporto Δlistino/Δmaterie prime altrimenti', () => {
  const prod = { 'p-1': { id: 'p-1' } };
  const facts = ['2026-01-15', '2026-02-15', '2026-03-15'].map((date, i) => ({ id: 'f' + i, date, month: date.slice(0, 7), productId: 'p-1', tonnes: 10, raw: 2500 + (i === 2 ? 5 : 0) }));
  const d = { products: [{ id: 'p-1', listPrice: 320 }], priceLists: [{ id: 'a', productId: 'p-1', price: 300, validFrom: '2025-01-01', validTo: '2026-02-28' }, { id: 'b', productId: 'p-1', price: 320, validFrom: '2026-03-01', validTo: null }] };
  const flat = { today: '2026-03-20', ix: { prod }, facts };
  assert.equal(passThrough(d, flat, 'p-1', '2026-01-01'), null); // +0,5 €/t di materie prime: sotto la soglia di 1 €/t
  const moved = { ...flat, facts: facts.map((f, i) => ({ ...f, raw: 2500 + i * 200 })) }; // 250 → 290 €/t
  const pt = passThroughDetail(d, moved, 'p-1', '2026-01-01');
  close(pt.value, (320 - 300) / (290 - 250)); assert.equal(pt.monthFrom, '2026-01'); assert.equal(pt.monthNow, '2026-03');
  // sul demo: valori finiti e plausibili (listino +3% in aprile, materie prime in aumento)
  for (const p of D.products) { const v = passThrough(D, ctx, p.id, P12.from); assert.ok(v == null || (Number.isFinite(v) && v > 0 && v < 3), p.code + ' ' + v); }
});

test('listino necessario = prezzo obiettivo / (1 − sconto medio a 90 giorni); stato sul prezzo NETTO', () => {
  for (const p of D.products) {
    const r = requiredList(D, p.id, ctx);
    close(r.required * (1 - r.discountPct), ctx.costs[p.id].targetPrice, 1e-9);
    close(r.gap, r.required - listAt(D.priceLists, p, today), 1e-9);
  }
  const rows = priceListRows(D, ctx, P12);
  // controllo sul netto realizzato a 90 giorni: gli stessi 9 prodotti del segnale «Prezzo netto sotto il margine minimo»
  assert.deepEqual(rows.filter(r => r.status === 'sotto-minimo').map(r => r.code).sort(), ['BR21', 'CO16', 'EQ12', 'LT18S', 'LT22', 'OC18', 'OV17', 'SI15', 'VT20']);
  assert.ok(rows.every(r => r.hist.length === 2));
});

test('revisionSim: senza elasticità ΔMdC = Σ volume × Δ prezzo netto; con elasticità conta anche il margine dei volumi persi', () => {
  const rows = priceListRows(D, ctx, P12);
  const byProduct = Object.fromEntries(rows.map(r => [r.id, r.listNow + 10]));
  const s0 = revisionSim(D, ctx, { byProduct, validFrom: '2026-11-01', elasticity: 0 });
  assert.equal(s0.rows.length, rows.length);
  close(s0.annualDeltaMc2, sum(s0.rows, r => r.volume * r.dNet), 1e-9);
  for (const r of s0.rows) assert.ok(r.dNet < 10 && r.dNet > 9); // +10 €/t di listino, meno lo sconto medio
  const s1 = revisionSim(D, ctx, { byProduct, validFrom: '2026-11-01', elasticity: -1 });
  for (const r of s1.rows) close(r.deltaMc2, (r.volume + r.dVolume) * r.dNet + r.dVolume * r.mc2T, 1e-9);
  assert.ok(s1.annualDeltaMc2 < s0.annualDeltaMc2);
  assert.ok(s0.customersBelowMin.length <= s0.customersBelowMinBefore.length); // listino più alto: meno clienti sotto il minimo
  const down = revisionSim(D, ctx, { byProduct: Object.fromEntries(rows.map(r => [r.id, r.listNow * 0.9])), elasticity: 0 });
  assert.ok(down.customersBelowMin.length >= s0.customersBelowMinBefore.length && down.annualDeltaMc2 < 0);
});

/* ---------------- segnali e report ---------------- */
test('segnali commerciali: chiavi uniche, area commerciale, agente sulle offerte; fuga di prezzo oltre lo sconto autorizzato', () => {
  const sig = commercialSignals(D, ctx);
  assert.equal(new Set(sig.map(s => s.key)).size, sig.length);
  assert.ok(sig.every(s => s.area === 'commerciale' && s.title && s.why && s.link));
  assert.ok(sig.some(s => s.key.startsWith('list-gap:')));
  assert.ok(!sig.some(s => s.key.startsWith('leak:'))); // nel demo i prezzi rispettano lo sconto del cliente
  // una consegna recente con il 10% di sconto oltre il listino fa scattare il segnale con l'impatto in €
  const s = D.shipments.find(x => x.date > addDays(today, -20));
  const d2 = { ...D, shipments: D.shipments.map(x => (x.id === s.id ? { ...x, price: Math.round(x.price * 0.9) } : x)) };
  const c2 = makeCtx(d2, today);
  const leak = commercialSignals(d2, c2).filter(x => x.key.startsWith('leak:'));
  assert.equal(leak.length, 1);
  assert.equal(leak[0].link.id, s.customerId);
  assert.ok(leak[0].impact > 0);
});

test('sezione del report CdA: indicatori, tabella agenti e testo', () => {
  const S = commercialReportSection(D, ctx, P12, null);
  assert.equal(S.id, 'commerciale'); assert.equal(S.order, 45);
  assert.equal(S.kpis.length, 5);
  close(S.kpis[0].value, (1 - realization(D, ctx, P12, null).total.discountPct) * 100, 1e-9);
  assert.equal(S.table.rows.length, D.agents.length);
  assert.ok(S.narrative.length >= 3);
  assert.equal(commercialReportSection({ ...D }, { ...ctx, facts: [] }, P12, null), null);
});
