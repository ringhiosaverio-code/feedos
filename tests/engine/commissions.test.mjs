/* FeedOS 17 · WP4 provvigioni ed estratto conto: scaglioni, prodotto, prezzo minimo, maturazione al fatturato e all'incasso,
 * insoluti, Enasarco e FIRR, attribuzione all'agente della consegna, quadratura con il conto economico. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { resolvePeriod, comparePeriod } from '../../src/core/period.js';
import { sum, byId } from '../../src/core/util.js';
import { minPrice } from '../../src/engine/costing.js';
import {
  schemeOf, tierPct, firrOf, commissionRows, commissionTotals, statement, statementHistory, agentPerformance, quarterRange, quartersIn,
  lastClosedQuarter, paidShare, agentRules, DEFAULT_AGENT_RULES,
} from '../../src/engine/commissions.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = resolvePeriod({ preset: '12m' }, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

/* archivio minimo: un prodotto (prezzo minimo 400 €/t al costo pieno di 360 e margine minimo 10%), consegne da 10 t */
function mini({ scheme, invoices = [], payments = [], ships }) {
  const prod = { id: 'p-1', code: 'EQ12', minMarginPct: 10 }, other = { id: 'p-2', code: 'LT18', minMarginPct: 10 };
  const d = { agents: [{ id: 'a1', name: 'Agente Uno', commissionPct: 2.5, scheme }], customers: [{ id: 'c1', agentId: 'a1', paymentDays: 60 }], products: [prod, other], invoices, payments, settings: {} };
  const facts = ships.map((s, i) => ({ id: s.id || 's' + i, date: s.date, month: s.date.slice(0, 7), agentId: s.agentId || 'a1', customerId: 'c1', productId: s.productId || 'p-1',
    tonnes: 10, revenue: 10 * s.price, fullCost: 10 * 360, commission: 10 * s.price * 0.025 }));
  return { d, ctx: { today: s0(ships), ix: { prod: byId(d.products), cust: byId(d.customers) }, facts } };
}
const s0 = () => '2026-06-30';
const Y = { from: '2026-01-01', to: '2026-12-31' };

test('schema di base: commissionPct, nessuno scaglione, metà sotto il minimo, al fatturato, monomandatario', () => {
  assert.deepEqual(schemeOf({ commissionPct: 2.6 }), { basePct: 2.6, tiers: [], byProduct: {}, belowMinFactor: 0.5, accrual: 'fatturato', mandate: 'mono' });
  assert.equal(tierPct({ tiers: [{ from: 0, pct: 2 }, { from: 1000, pct: 3 }] }, 999.99), 2);
  assert.equal(tierPct({ tiers: [{ from: 0, pct: 2 }, { from: 1000, pct: 3 }] }, 1000), 3);
  assert.equal(tierPct({ tiers: [] }, 5000), null);
});

test('scaglione: la percentuale cambia quando il fatturato da inizio esercizio PRIMA della consegna supera la soglia', () => {
  const { d, ctx: c } = mini({ scheme: { tiers: [{ from: 0, pct: 2 }, { from: 9000, pct: 3 }] }, ships: [
    { date: '2026-01-10', price: 450 }, { date: '2026-02-10', price: 450 }, { date: '2026-03-10', price: 450 }, { date: '2027-01-10', price: 450 } ] });
  const r = commissionRows(d, c, { from: '2026-01-01', to: '2027-12-31' }, 'a1');
  assert.deepEqual(r.map(x => x.ytdBefore), [0, 4500, 9000, 0]); // il nuovo esercizio riparte da zero
  assert.deepEqual(r.map(x => x.pct), [2, 2, 3, 2]);
  assert.deepEqual(r.map(x => x.source), ['scaglione', 'scaglione', 'scaglione', 'scaglione']);
  close(r[2].amount, 4500 * 0.03);
  // sul demo: per ag-1 il 2,7% parte alla prima consegna dopo 3 milioni di fatturato dell'anno
  const a1 = commissionRows(D, ctx, Y, 'ag-1');
  const k = a1.findIndex(x => x.pctBase === 2.7);
  assert.ok(k > 0 && a1[k].ytdBefore >= 3e6 && a1[k - 1].ytdBefore < 3e6);
  assert.ok(a1.slice(0, k).every(x => x.pctBase === 2.3));
});

test('percentuale per prodotto: prevale su scaglioni e base', () => {
  const { d, ctx: c } = mini({ scheme: { basePct: 2.5, tiers: [{ from: 0, pct: 2 }], byProduct: { EQ12: 3.5 } }, ships: [{ date: '2026-01-10', price: 450 }, { date: '2026-01-11', price: 450, productId: 'p-2' }] });
  const [eq, lt] = commissionRows(d, c, Y, 'a1');
  assert.equal(eq.pct, 3.5); assert.equal(eq.source, 'prodotto');
  assert.equal(lt.pct, 2); assert.equal(lt.source, 'scaglione');
  // sul demo: ag-2 ha EQ12 al 3,5% (nessun suo cliente lo compra) e BC14 al 3%; gli altri prodotti alla base del 2,5%
  assert.equal(schemeOf(D.agents.find(a => a.id === 'ag-2')).byProduct.EQ12, 3.5);
  const a2 = commissionRows(D, ctx, P12, 'ag-2'), code = id => D.products.find(p => p.id === id).code;
  assert.ok(a2.some(r => code(r.productId) === 'BC14'));
  assert.ok(a2.every(r => r.pctBase === (code(r.productId) === 'BC14' ? 3 : 2.5)));
});

test('sotto il prezzo minimo al costo pieno effettivo la percentuale si dimezza (belowMinFactor)', () => {
  const { d, ctx: c } = mini({ scheme: { basePct: 3 }, ships: [{ date: '2026-01-10', price: 401 }, { date: '2026-01-11', price: 399 }] });
  assert.equal(minPrice(360, 10), 400);
  const [ok, low] = commissionRows(d, c, Y, 'a1');
  assert.equal(ok.belowMin, false); assert.equal(ok.pct, 3);
  assert.equal(low.belowMin, true); assert.equal(low.pct, 1.5);
  close(low.amount, 3990 * 0.015);
  const { d: d2, ctx: c2 } = mini({ scheme: { basePct: 3, belowMinFactor: 0 }, ships: [{ date: '2026-01-11', price: 399 }] });
  assert.equal(commissionRows(d2, c2, Y, 'a1')[0].amount, 0);
});

test('maturazione all’incasso: fattura pagata al 50% → 50%; insoluta → stornata; al fatturato: fattura o mese chiuso', () => {
  const inv = { id: 'i1', number: 'FT-26-001', ddts: ['s0'], total: 4950, status: 'parziale' };
  const pays = [{ id: 'y1', invoiceId: 'i1', date: '2026-05-01', amount: 2475 }, { id: 'y2', invoiceId: 'i1', date: '2026-07-15', amount: 2475 }]; // la seconda è dopo oggi
  const { d, ctx: c } = mini({ scheme: { basePct: 2, accrual: 'incasso' }, invoices: [inv], payments: pays, ships: [{ id: 's0', date: '2026-03-10', price: 450 }, { id: 's1', date: '2026-03-11', price: 450 }] });
  const [half, none] = commissionRows(d, c, Y, 'a1');
  close(paidShare(inv, { i1: 2475 }), 0.5);
  close(half.share, 0.5); close(half.accrued, half.amount * 0.5); assert.equal(half.state, 'parziale'); assert.equal(half.invoice, 'FT-26-001');
  assert.equal(none.accrued, 0); assert.equal(none.state, 'da maturare'); // non fatturata: niente incasso
  // insoluta: storno anche se al fatturato
  const bad = { ...inv, status: 'insoluta' };
  for (const accrual of ['incasso', 'fatturato']) {
    const m = mini({ scheme: { basePct: 2, accrual }, invoices: [bad], payments: [], ships: [{ id: 's0', date: '2026-03-10', price: 450 }] });
    const [r] = commissionRows(m.d, m.ctx, Y, 'a1');
    assert.equal(r.accrued, 0); assert.equal(r.state, 'stornata'); assert.ok(r.amount > 0);
  }
  // al fatturato senza fatture: maturata a mese chiuso, da maturare nel mese in corso
  const f = mini({ scheme: { basePct: 2 }, ships: [{ date: '2026-05-31', price: 450 }, { date: '2026-06-20', price: 450 }] });
  assert.deepEqual(commissionRows(f.d, f.ctx, Y, 'a1').map(r => r.state), ['maturata', 'da maturare']);
});

test('FIRR a scaglioni sul totale annuo e quota del trimestre', () => {
  close(firrOf(5000), 200);
  close(firrOf(10000), 6200 * 0.04 + 3100 * 0.02 + 700 * 0.01); // 317
  close(firrOf(10000, DEFAULT_AGENT_RULES.firr.pluri), 400);
  close(firrOf(20000, DEFAULT_AGENT_RULES.firr.pluri), 12400 * 0.04 + 6200 * 0.02 + 1400 * 0.01); // 634
  assert.equal(firrOf(0), 0); assert.equal(firrOf(-5), 0);
  const s = statement(D, ctx, 'ag-1', '2026-Q3');
  const br = agentRules(D).firr.mono;
  close(s.totals.firr, firrOf(s.totals.ytdBefore + s.totals.maturate, br) - firrOf(s.totals.ytdBefore, br), 1e-9);
});

test('cambio d’agente: la provvigione segue shipments.agentId, non l’assegnazione di oggi', () => {
  const c = D.customers.find(x => x.agentId === 'ag-1');
  const d2 = { ...D, customers: D.customers.map(x => (x.id === c.id ? { ...x, agentId: 'ag-4' } : x)) };
  const c2 = makeCtx(d2, today);
  const mine = commissionRows(d2, c2, P12).filter(r => r.customerId === c.id);
  assert.ok(mine.length > 0 && mine.every(r => r.agentId === 'ag-1'));
  assert.equal(commissionRows(d2, c2, P12, 'ag-4').filter(r => r.customerId === c.id).length, 0);
});

test('estratto del 3° trimestre: Enasarco 17% metà e metà, netto, scadenza, quadratura con il conto economico', () => {
  assert.deepEqual(quarterRange('2026-Q3'), { from: '2026-07-01', to: '2026-09-30', label: '3° trimestre 2026', key: '2026-Q3' });
  assert.equal(lastClosedQuarter(today), '2026-Q3');
  assert.deepEqual(quartersIn(P12), ['2026-Q4', '2026-Q3', '2026-Q2', '2026-Q1', '2025-Q4']);
  for (const a of D.agents) {
    const s = statement(D, ctx, a.id, '2026-Q3');
    assert.equal(s.dueDate, '2026-10-31');
    close(s.totals.maturate, sum(s.rows, r => r.accrued));
    close(s.totals.enasarco, s.totals.maturate * 0.17); // massimale non impostato
    assert.equal(s.massimaleSet, false);
    close(s.totals.enasarcoAgente, s.totals.enasarcoMandante); close(s.totals.netto, s.totals.maturate - s.totals.enasarcoAgente);
    close(s.totals.amount, s.standardInCE + s.difference); // provvigioni dello schema = standard del CE ± differenza dichiarata
    if (a.scheme.accrual === 'fatturato') {
      // trimestre chiuso: tutto maturato, Σ maturate = provvigioni del conto economico ± differenza di schema
      close(s.totals.maturate, s.standardInCE + s.difference);
      assert.equal(s.totals.pending, 0);
      const facts = ctx.facts.filter(f => f.agentId === a.id && f.date >= s.from && f.date <= s.to);
      close(s.standardInCE, sum(facts, f => f.commission));
      close(s.difference, sum(s.rows, r => r.revenue * (r.pct - a.commissionPct) / 100));
    } else {
      assert.ok(s.totals.pending > 0 && s.totals.maturate < s.totals.amount); // all'incasso: matura con i pagamenti (stimati senza fatture)
      assert.equal(s.estimated, true);
    }
  }
  // massimale annuo: l'Enasarco si ferma alla soglia
  const capped = { ...D, settings: { ...D.settings, agentRules: { ...D.settings.agentRules, massimale: { mono: 60000, pluri: null } } } };
  const s1 = statement(capped, ctx, 'ag-1', '2026-Q3');
  close(s1.totals.enasarcoBase, Math.max(0, Math.min(s1.totals.maturate, 60000 - s1.totals.ytdBefore)));
  assert.ok(s1.totals.enasarco < statement(D, ctx, 'ag-1', '2026-Q3').totals.enasarco);
  const hist = statementHistory(D, ctx, 'ag-1', 4);
  assert.deepEqual(hist.map(h => h.quarter), ['2026-Q3', '2026-Q2', '2026-Q1', '2025-Q4']);
});

test('totali e prestazioni degli agenti: somme coerenti con i fatti', () => {
  const T = commissionTotals(D, ctx, P12);
  close(sum(Object.values(T), t => t.revenue), sum(ctx.facts.filter(f => f.date >= P12.from && f.date <= P12.to), f => f.revenue));
  close(sum(Object.values(T), t => t.standard), sum(ctx.facts.filter(f => f.date >= P12.from && f.date <= P12.to), f => f.commission));
  for (const t of Object.values(T)) close(t.difference, t.amount - t.standard);
  const perf = agentPerformance(D, ctx, P12, comparePeriod(P12, 'prec', today));
  assert.equal(perf.length, D.agents.length);
  for (const r of perf) {
    const t = T[r.agentId];
    close(r.revenue, t.revenue); close(r.commission, t.amount);
    assert.ok(r.realization > 0.9 && r.realization <= 1);
    assert.ok(r.shareBelowMinT >= 0 && r.shareBelowMinT <= 1);
    assert.equal(r.overdue, null); // senza crediti (pacchetto finanza) non si inventa lo scaduto
    assert.ok(r.cmp && r.cmp.revenue === 0); // nessun dato nei 12 mesi precedenti
  }
});
