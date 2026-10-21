/* FeedOS 17 · WP5 acquisti: MRP (quarantena, ritardi, annullati, ordine minimo, scorta statistica, versioni di formula),
 * arrivi parziali e storni, causa del respingimento, varianze di prezzo e di materiale, punteggio dei fornitori e segnali. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo, revertOp } from '../../src/core/ops.js';
import { sum, addDays, mondayOf } from '../../src/core/util.js';
import { requirements, safetyStock, historicUse, coverage, openQty } from '../../src/engine/mrp.js';
import { receivePurchaseOps, acceptIngLotOps, reverseReceiptOps } from '../../src/engine/operations.js';
import { ppv, materialVariance, stdPrice, marketPremium } from '../../src/engine/purchaseVariance.js';
import { scorecard, purchasingSignals, purchasingReportSection, abcOfIngredients } from '../../src/engine/suppliers.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = { from: addDays(today, -364), to: today };
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const apply = (d, ops) => { const r = applyOpsTo(d, ops); assert.ok(!r.refused, 'rifiutato'); return r; };
const req = d => requirements({ today, weeks: 8, plan: d.plan, products: d.products, formulas: d.formulas, ingredients: d.ingredients, purchases: d.purchases, runs: d.runs, ingLots: d.ingLots, suppliers: d.suppliers, settings: d.settings });
const rowOf = (M, id) => M.rows.find(r => r.ingId === id);

/* archivio minimo: un prodotto con 1 t/t di «x» pianificato a 70 t/settimana, scorta 50 t, consegna 7 giorni */
function mini({ purchases = [], ingLots = [], suppliers = [], stock = 50 } = {}) {
  const w0 = mondayOf(today);
  return {
    today, weeks: 4,
    plan: [0, 1, 2, 3].map(k => ({ week: addDays(w0, 7 * k), productId: 'p', tonnes: 70 })),
    products: [{ id: 'p', formulaId: 'f' }], formulas: [{ id: 'f', lines: [{ ing: 'x', kg: 1000 }] }],
    ingredients: [{ id: 'x', name: 'X', category: 'cereale', stock, leadDays: 7, safetyDays: 7, price: 200, supplier: 'S' }],
    purchases, ingLots, suppliers, settings: { ops: { releaseDays: 2 } },
  };
}

test('MRP: l’arrivo registrato di OA-2601 non crea più un ordine pianificato in più', () => {
  const before = sum(rowOf(req(D), 'mais').planned, p => p.qty);
  const po = D.purchases.find(p => p.code === 'OA-2601');
  const r = apply(D, receivePurchaseOps(D, po, { date: today, tonnes: po.tonnes }));
  const M = req(r.data);
  assert.ok(sum(rowOf(M, 'mais').planned, p => p.qty) <= before, 'nessun ordine in più per il mais');
  assert.ok(rowOf(M, 'mais').cells.some(c => c.conditional >= po.tonnes - 0.01), 'il lotto in quarantena è un arrivo condizionato');
  // il lotto di sorgo in quarantena del demo
  assert.ok(rowOf(req(D), 'sorgo').conditional > 0);
});

test('MRP: ordini in ritardo nella settimana in corso, annullati ignorati, parziali per il residuo, ordine minimo', () => {
  const w0 = mondayOf(today);
  const late = requirements(mini({ purchases: [{ id: 'o1', code: 'OA-1', ingId: 'x', tonnes: 30, deliveryDate: addDays(today, -4), status: 'confermato' }] }));
  const r = late.rows[0];
  assert.equal(r.cells[0].in, 30); assert.equal(r.cells[0].overdue, 30);
  assert.deepEqual(r.overdue.map(o => o.days), [4]);
  const canc = requirements(mini({ purchases: [{ id: 'o1', ingId: 'x', tonnes: 30, deliveryDate: addDays(w0, 7), status: 'annullato' }] }));
  assert.equal(sum(canc.rows[0].cells, c => c.in), 0);
  const part = requirements(mini({ purchases: [{ id: 'o1', ingId: 'x', tonnes: 30, receivedT: 20, deliveryDate: addDays(w0, 7), status: 'parziale' }] }));
  assert.equal(sum(part.rows[0].cells, c => c.in), 10);
  assert.equal(openQty({ tonnes: 30, receivedT: 20, status: 'parziale' }), 10);
  const big = requirements(mini({ suppliers: [{ id: 's', name: 'S', ingIds: ['x'], approval: 'qualificato', minOrderT: 60 }] }));
  assert.ok(big.rows[0].planned.length && big.rows[0].planned.every(p => p.qty >= 60), 'ordine minimo del fornitore');
});

test('MRP: scorta di sicurezza statistica e consumi con la versione di formula usata', () => {
  close(safetyStock({ dailyUse: [10, 10, 10, 10], LT: 4, sdLT: 1, z: 2 }), 2 * Math.sqrt(0 + 100 * 1));
  const u = [8, 12, 8, 12];
  const sd = Math.sqrt(sum(u, x => (x - 10) ** 2) / 3);
  close(safetyStock({ dailyUse: u, LT: 4, sdLT: 0, z: 1.65 }), 1.65 * Math.sqrt(4 * sd * sd));
  const m = rowOf(req(D), 'mais');
  assert.ok(m.cls === 'A' && m.ssStat > 0 && m.ssStatDays > 1 && m.ssStatDays < m.ssConfigured / m.daily, `scorta statistica del mais ${m.ssStatDays} giorni`);
  close(m.releasable, (m.ssConfigured - m.ssStat) * m.price, 1e-9);
  // campagne vecchie con la versione 1 della formula, nuove con la 2
  const f = { id: 'f', version: 2, lines: [{ ing: 'b', kg: 1000 }], history: [{ version: 1, date: '2026-01-01', lines: [{ ing: 'a', kg: 1000 }] }, { version: 2, date: '2026-06-01', lines: [{ ing: 'b', kg: 1000 }] }] };
  const use = historicUse([{ productId: 'p', date: '2026-02-01', tonnes: 10, formulaVersion: 1 }, { productId: 'p', date: '2026-07-01', tonnes: 10, formulaVersion: 2 }], { p: f }, '2026-01-01', '2026-12-31');
  assert.ok(use.a > 0 && use.b > 0 && Math.abs(use.a - use.b) < 1e-12);
});

test('copertura e rischio di prezzo delle materie prime A', () => {
  const c13 = coverage(D, ctx, { weeks: 13 }), c4 = coverage(D, ctx, { weeks: 4 });
  const m13 = c13.find(x => x.ingId === 'mais'), m4 = c4.find(x => x.ingId === 'mais');
  assert.ok(m13 && m4 && m13.needT > m4.needT && m13.openT >= m4.openT);
  close(m13.coveredT, m13.stock + m13.quarantine + m13.pos, 1e-9);
  if (m13.openT > 0) close(m13.p90RiskEur, m13.openT * m13.price * m13.sigma13 * 1.28, 1e-9);
  const abc = abcOfIngredients(D, today);
  assert.ok(c13.every(x => abc[x.ingId] === 'A'));
});

test('arrivi parziali, storno e causa del respingimento', () => {
  const po = D.purchases.find(p => p.code === 'OA-2601');
  const r1 = apply(D, receivePurchaseOps(D, po, { date: today, tonnes: 200 }));
  const p1 = r1.data.purchases.find(p => p.id === po.id);
  assert.equal(p1.status, 'parziale'); assert.equal(p1.receivedT, 200); close(openQty(p1), po.tonnes - 200);
  const lot = r1.data.ingLots.find(l => l.poId === po.id && l.tonnes === 200);
  assert.ok(lot && lot.status === 'in attesa' && lot.supplierId);
  const r2 = apply(r1.data, receivePurchaseOps(r1.data, p1, { date: today }));
  const p2 = r2.data.purchases.find(p => p.id === po.id);
  assert.equal(p2.status, 'ricevuto'); close(p2.receivedT, po.tonnes);
  // storno del secondo arrivo: l'ordine torna parziale con 200 t ricevute
  const lot2 = r2.data.ingLots.find(l => l.poId === po.id && l.id !== lot.id);
  const st = reverseReceiptOps(r2.data, lot2.id);
  const r3 = apply(r2.data, st.ops);
  const p3 = r3.data.purchases.find(p => p.id === po.id);
  assert.equal(p3.status, 'parziale'); close(p3.receivedT, 200);
  assert.ok(!r3.data.ingLots.some(l => l.id === lot2.id));
  // un lotto già usato non si storna
  const usedLot = D.ingLots.find(l => l.status === 'accettato' && l.remaining < l.tonnes - 1);
  assert.ok(reverseReceiptOps(D, usedLot.id).error);
  // respingimento con la causa
  const r4 = apply(r1.data, acceptIngLotOps(r1.data, lot, { analyses: { UM: 16 }, accept: false, reason: 'umidità' }));
  const l4 = r4.data.ingLots.find(l => l.id === lot.id);
  assert.equal(l4.status, 'bloccato'); assert.equal(l4.rejectReason, 'umidità');
});

test('varianze: effettivo − standard = prezzo + quantità; standard uguale all’effettivo dà zero', () => {
  const mv = materialVariance(D, ctx, P12);
  close(mv.total.actual - mv.total.std, mv.total.price + mv.total.quantity, 1e-6);
  for (const x of mv.byLot.slice(0, 200)) close(x.actual - x.std, x.price + x.quantity, 1e-6);
  close(sum(mv.byProduct, x => x.actual), mv.total.actual, 1e-9);
  // standard = prezzo del lotto e consumi = formula: nessuna varianza
  const d = {
    ingLots: [{ id: 'l1', ingId: 'a', date: '2026-01-02', tonnes: 100, price: 200, status: 'accettato' }],
    lots: [{ id: 'p1', productId: 'p', runId: 'r1', date: '2026-02-01', tonnes: 10, comp: [{ l: 'l1', ing: 'a', kg: 10000 }] }],
    runs: [{ id: 'r1', formulaId: 'f', formulaVersion: 1 }], products: [{ id: 'p', formulaId: 'f' }], formulas: [{ id: 'f', version: 1, lines: [{ ing: 'a', kg: 1000 }] }],
    standards: [{ year: 2026, ingId: 'a', price: 200 }],
  };
  const z = materialVariance(d, null, { from: '2026-01-01', to: '2026-12-31' }).total;
  close(z.actual, 2000); close(z.std, 2000); close(z.price, 0); close(z.quantity, 0); close(z.formula, 0);
  assert.equal(stdPrice(d, 'a', 2026), 200);
  close(ppv(d, null, { from: '2026-01-01', to: '2026-12-31' }).total, 0);
});

test('PPV del demo sugli standard d’inizio anno: positiva, guidata dalla soia', () => {
  const pv = ppv(D, ctx, P12);
  assert.ok(pv.total > 0, `PPV ${pv.total}`);
  const top = [...pv.byIng].sort((a, b) => b.ppv - a.ppv)[0];
  assert.equal(top.ingId, 'soia44');
  close(sum(pv.byIng, x => x.ppv), pv.total, 1e-9);
  close(sum(pv.byMonth, x => x.ppv), pv.total, 1e-9);
  const mp = marketPremium(D, P12);
  assert.ok(mp.median > 0.01 && mp.median < 0.05, `premio mediano ${mp.median}`);
});

test('fornitori: OTIF, punteggio fra 0 e 100, almeno due fornitori per materia prima A, il condizionato ha respinti', () => {
  const d = {
    suppliers: [{ id: 's', name: 'S', ingIds: ['x'], cert: [{ type: 'GMP+', expiry: '2027-01-01' }], lastAudit: '2026-03-01', approval: 'qualificato' }],
    ingredients: [{ id: 'x', name: 'X', dm: 88, nutr: { PG: 10 } }],
    ingLots: [{ id: 'l1', ingId: 'x', supplierId: 's', supplier: 'S', date: '2026-05-02', tonnes: 28, price: 200, status: 'accettato', analyses: { PG: 10, UM: 12 } }],
    purchases: [
      { id: 'a', supplierId: 's', supplier: 'S', ingId: 'x', date: '2026-04-20', deliveryDate: '2026-05-01', receivedAt: '2026-05-02', tonnes: 28, receivedT: 28, status: 'ricevuto' }, // puntuale (1 giorno di tolleranza)
      { id: 'b', supplierId: 's', supplier: 'S', ingId: 'x', date: '2026-05-20', deliveryDate: '2026-06-01', receivedAt: '2026-06-05', tonnes: 28, receivedT: 28, status: 'ricevuto' }, // in ritardo
      { id: 'c', supplierId: 's', supplier: 'S', ingId: 'x', date: '2026-06-20', deliveryDate: '2026-07-01', receivedAt: '2026-07-01', tonnes: 28, receivedT: 26, status: 'ricevuto' }, // corto (−7%)
    ],
    lots: [], complaints: [], market: [], settings: {},
  };
  const [r] = scorecard(d, { today: '2026-07-10' }, { from: '2026-01-01', to: '2026-07-10' });
  close(r.otif, 1 / 3); close(r.avgDelay, 5 / 3); assert.equal(r.docs, 100);
  const S = scorecard(D, ctx, P12);
  assert.ok(S.every(x => x.score == null || (x.score >= 0 && x.score <= 100)));
  for (const id of ['mais', 'soia44', 'sorgo', 'colza', 'premix', 'farinaccio']) assert.ok(S.filter(x => x.ingIds.includes(id)).length >= 2, `due fornitori per ${id}`);
  const cond = D.suppliers.find(s => s.approval === 'condizionato');
  assert.ok(S.find(x => x.id === cond.id).rejectRate > 0);
  const best = S.find(x => x.name.startsWith('Agricola Tavoliere')), worst = S.find(x => x.id === cond.id);
  assert.ok(best.score > worst.score && best.otif > worst.otif, 'profili distinti');
});

test('segnali degli acquisti e sezione del report', () => {
  const s = purchasingSignals(D, ctx);
  const keys = s.map(x => x.key);
  assert.ok(keys.some(k => k.startsWith('cert:')), 'certificato in scadenza');
  assert.ok(keys.some(k => k.startsWith('po-late:')), 'ordine in ritardo');
  assert.ok(keys.some(k => k.startsWith('otif:') && k.includes('cereali')), 'OTIF basso del fornitore condizionato');
  assert.equal(new Set(keys).size, keys.length);
  for (const x of s) assert.ok(x.area === 'acquisti' && x.title && x.why && x.link);
  const sec = purchasingReportSection(D, ctx, P12, null);
  assert.equal(sec.id, 'acquisti'); assert.ok(sec.kpis.length >= 4 && sec.table.rows.length > 0);
});
