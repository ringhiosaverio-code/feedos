/* FeedOS 17 · fondamenta economiche (F3, F4, F5): fatti al costo effettivo, aggregazioni, costi fissi, rimanenze,
 * periodo globale e confronti, margine per cliente al costo effettivo. Demo del 16/10/2026 con la struttura dei costi applicata a mano. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../../src/data/demo/generator.js';
import { demoCosts, COST_CENTERS } from '../../src/data/demo/costs.js';
import {
  makeCtx, makeIndex, costsOf, shipmentFacts, aggregateFacts, fixedFor, inventoryValuation, lotUnitCost, energyPriceAt, listAt,
  dataStart, coverage, FACT_SUMS,
} from '../../src/engine/actuals.js';
import {
  resolvePeriod, comparePeriod, serializeSpec, parseSpec, deltaInfo, periodLabel, PRESETS, COMPARES, DEFAULT_SPEC,
  getPeriodSpec, setPeriodSpec, subscribePeriod, monthsIn, monthFraction, daysInMonth,
} from '../../src/core/period.js';
import { getPrefs } from '../../src/core/prefs.js';
import { customerStats, ctxOf, facts as factsSel, agg, fixedP, inventory, period12, appToday } from '../../src/core/derived.js';
import { parseHash, href } from '../../src/core/router.js';
import { rng, sum, addDays, todayLocal } from '../../src/core/util.js';

const today = '2026-10-16';
const d0 = generateDemo({ today });
/** Applica una patch di estensore {add, update} senza toccare l'originale. */
function applyPatch(d, patch) {
  const out = { ...d };
  for (const [c, rows] of Object.entries(patch.add || {})) out[c] = [...(d[c] || []), ...rows];
  for (const [c, ups] of Object.entries(patch.update || {})) { const m = Object.fromEntries(ups.map(u => [u.id, u])); out[c] = (d[c] || []).map(r => (m[r.id] ? { ...r, ...m[r.id] } : r)); }
  return out;
}
const patch = demoCosts(d0, { today, R: rng(16 + 101) });
const d = applyPatch(d0, patch);
const ctx = makeCtx(d, today);
const P12 = resolvePeriod({ preset: '12m' }, today);
const close = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (tolleranza ${tol})`);

/* ---------------- struttura dei costi del demo ---------------- */
test('demoCosts: 8 centri, 24 mesi di consuntivo, 1,81 M€ negli ultimi 12 mesi, quota variabile della trasformazione', () => {
  assert.equal(patch.add.costCenters.length, 8);
  assert.deepEqual(patch.add.costCenters.map(c => c.id), ['cc-pers', 'cc-man', 'cc-qual', 'cc-log', 'cc-amm', 'cc-dir', 'cc-serv', 'cc-comm']);
  assert.equal(patch.add.costCenters.find(c => c.id === 'cc-amm').cash, false);
  const fc = patch.add.fixedCosts;
  assert.equal(fc.length, 24 * 8);
  const months = [...new Set(fc.map(r => r.month))].sort();
  assert.equal(months.length, 24); assert.equal(months[0], '2024-10'); assert.equal(months.at(-1), '2026-09');
  assert.ok(fc.every(r => r.kind === 'consuntivo' && r.source === 'demo' && Number.isInteger(r.amount) && r.amount > 0));
  assert.equal(new Set(fc.map(r => r.id)).size, fc.length, 'id univoci');
  const recent = fc.filter(r => r.month >= '2025-10'), earlier = fc.filter(r => r.month < '2025-10');
  const by = (rows, cc) => sum(rows.filter(r => r.centerId === cc), r => r.amount);
  assert.equal(sum(recent, r => r.amount), 1810000);
  const exp = { 'cc-pers': 620000, 'cc-man': 170000, 'cc-amm': 300000, 'cc-qual': 90000, 'cc-log': 110000, 'cc-dir': 330000, 'cc-comm': 120000, 'cc-serv': 70000 };
  for (const [cc, v] of Object.entries(exp)) { assert.equal(by(recent, cc), v, cc); assert.equal(by(earlier, cc), Math.round(v * 0.97), cc + ' anno prima'); }
  // 14 mensilità: giugno e dicembre doppi
  const pers = m => recent.find(r => r.centerId === 'cc-pers' && r.month === m).amount;
  close(pers('2025-12'), 2 * pers('2025-11'), 1); close(pers('2026-06'), 2 * pers('2026-05'), 1);
  // riparazione straordinaria di febbraio
  const man = recent.filter(r => r.centerId === 'cc-man');
  const feb = man.find(r => r.month === '2026-02').amount, others = man.filter(r => r.month !== '2026-02').map(r => r.amount);
  assert.ok(feb > Math.max(...others) + 25000, 'febbraio con la riparazione');
  // rumore solo su manutenzione e servizi
  assert.equal(new Set(recent.filter(r => r.centerId === 'cc-amm').map(r => r.amount)).size, 1);
  assert.ok(new Set(recent.filter(r => r.centerId === 'cc-serv').map(r => r.amount)).size > 3);
  // trasformazione variabile = 32% arrotondato; solo campi nuovi
  for (const u of patch.update.products) { const p = d0.products.find(x => x.id === u.id); assert.equal(u.varProcessCost, Math.round(p.processCost * 0.32)); assert.equal(p.varProcessCost, undefined); assert.deepEqual(Object.keys(u), ['id', 'varProcessCost']); }
  // deterministico, e l'archivio di partenza non cambia
  assert.deepEqual(demoCosts(d0, { today, R: rng(117) }), patch);
  assert.deepEqual(d0.costCenters, [], 'il generatore porta la raccolta vuota: i centri li aggiunge l’estensore');
  assert.deepEqual(COST_CENTERS.map(c => c.id), patch.add.costCenters.map(c => c.id));
});

/* ---------------- fatti al costo effettivo ---------------- */
test('energyPriceAt e listAt: voce valida più recente, altrimenti i valori di base', () => {
  const st = { energy: { kwhPrice: 0.19, gplPrice: 0.98 }, finance: { energyPrices: [{ from: '2026-03-01', kwhPrice: 0.22 }, { from: '2026-07-15', kwhPrice: 0.25, gplPrice: 1.1 }, { from: '2025-01-01', kwhPrice: 0.15, gplPrice: 0.9 }] } };
  assert.deepEqual(energyPriceAt(st, '2024-12'), { kwhPrice: 0.19, gplPrice: 0.98 });
  assert.deepEqual(energyPriceAt(st, '2025-06'), { kwhPrice: 0.15, gplPrice: 0.9 });
  assert.deepEqual(energyPriceAt(st, '2026-03'), { kwhPrice: 0.22, gplPrice: 0.98 }, 'GPL mancante: valore di base');
  assert.deepEqual(energyPriceAt(st, '2026-07'), { kwhPrice: 0.22, gplPrice: 0.98 }, 'dal 15/07 vale da agosto');
  assert.deepEqual(energyPriceAt(st, '2026-08'), { kwhPrice: 0.25, gplPrice: 1.1 });
  assert.deepEqual(energyPriceAt({}, '2026-08'), { kwhPrice: 0, gplPrice: 0 });
  const p = { id: 'p-x', listPrice: 400 };
  const pl = [{ productId: 'p-x', price: 380, validFrom: '2026-01-01', validTo: '2026-03-31' }, { productId: 'p-x', price: 395, validFrom: '2026-04-01', validTo: null }, { productId: 'p-y', price: 1, validFrom: '2020-01-01' }];
  assert.equal(listAt(pl, p, '2025-12-31'), 400);
  assert.equal(listAt(pl, p, '2026-03-31'), 380);
  assert.equal(listAt(pl, p, '2026-04-01'), 395);
  assert.equal(listAt([], p, '2026-04-01'), 400);
});

test('shipmentFacts: un fatto per spedizione, formule di ogni campo e costo del lotto da lots.comp', () => {
  const F = ctx.facts, ix = ctx.ix, vat = 10, rate = 5;
  assert.equal(F.length, d.shipments.length);
  assert.ok(F.every(f => f.actual), 'nel demo ogni lotto ha composizione e lavorazione misurata');
  for (const f of F) {
    const s = ix.lot[f.lotId] && d.shipments.find(x => x.id === f.id);
    close(f.revenue, f.tonnes * s.price, 1e-9);
    close(f.discount, f.listRevenue - f.revenue, 1e-9);
    close(f.mc1, f.revenue - f.raw - f.shrink - f.energy - f.varConv - f.pack, 1e-6);
    close(f.mc2, f.mc1 - f.logistics - f.commission, 1e-6);
    close(f.fullCost, f.raw + f.shrink + f.energy + f.varConv + f.fixConv + f.pack + f.logistics, 1e-6);
    close(f.marginFull, f.revenue - f.fullCost - f.commission, 1e-6);
    const p = ix.prod[f.productId], c = ix.cust[f.customerId];
    close(f.commission, f.revenue * ix.agent[s.agentId].commissionPct / 100, 1e-9);
    close(f.logistics, f.tonnes * p.logisticsCost, 1e-9);
    close(f.varConv + f.fixConv, f.tonnes * p.processCost, 1e-6);
    close(f.finCost, f.revenue * (1 + vat / 100) * rate / 100 * (c.paymentDays + 15) / 365, 1e-6);
    assert.equal(f.month, f.date.slice(0, 7));
  }
  // un fatto ricalcolato a mano
  const f = F[Math.floor(F.length / 2)], lot = ix.lot[f.lotId], run = ix.runByLot[lot.id], p = ix.prod[f.productId];
  const rawT = sum(lot.comp, c => c.kg / 1000 * ix.ingLot[c.l].price) / lot.tonnes;
  close(f.raw, f.tonnes * rawT, 1e-6, 'materie prime');
  close(f.shrink, f.tonnes * rawT * 0.006 / (1 - 0.006), 1e-6, 'calo');
  close(f.energy, f.tonnes * (run.kwh * 0.19 + run.gplKg * 0.98) / run.tonnes, 1e-6, 'energia misurata');
  close(f.varConv, f.tonnes * p.varProcessCost, 1e-9, 'trasformazione variabile');
  const ct = ctx.costs[p.id];
  close(f.replVar, f.tonnes * (ct.raw + ct.shrink + ct.energy + p.varProcessCost + p.packCost), 1e-6, 'costo variabile di oggi');
});

test('lotUnitCost: senza composizione ripiega sul costo di oggi; senza lavorazione sullo standard della linea', () => {
  const ix = ctx.ix, lot = d.lots[10], p = ix.prod[lot.productId], line = ix.line[p.lineId];
  const u = lotUnitCost(lot, ix, d.settings, ctx.costs);
  assert.equal(u.actual, true);
  const noComp = lotUnitCost({ ...lot, comp: [] }, ix, d.settings, ctx.costs);
  assert.equal(noComp.actual, false); assert.equal(noComp.rawActual, false);
  close(noComp.rawT, ctx.costs[p.id].raw, 1e-9);
  const lostLot = lotUnitCost({ ...lot, comp: [...lot.comp, { l: 'il-inesistente', kg: 10 }] }, ix, d.settings, ctx.costs);
  assert.equal(lostLot.rawActual, false);
  const noRun = lotUnitCost({ ...lot, id: 'lt-x', runId: 'r-x' }, ix, d.settings, ctx.costs);
  assert.equal(noRun.energyActual, false);
  close(noRun.energyT, line.kwhPerT * 0.19 + line.gplKgPerT * 0.98, 1e-9);
  close(u.fixConvT, p.processCost - p.varProcessCost, 1e-9);
  // spedizione senza lotto: costo di oggi, fatto comunque presente
  const F = shipmentFacts({ ...d, shipments: [{ ...d.shipments[0], lotId: null }] }, { ix, costsToday: ctx.costs });
  assert.equal(F.length, 1); assert.equal(F[0].actual, false);
});

test('aggregateFacts: Σ mc2 per prodotto = per cliente = per agente = totale; somme del periodo', () => {
  const byP = aggregateFacts(ctx.facts, [], P12, ['productId']), byC = aggregateFacts(ctx.facts, [], P12, ['customerId']);
  const byA = aggregateFacts(ctx.facts, [], P12, ['agentId']), byMP = aggregateFacts(ctx.facts, [], P12, ['month', 'productId']);
  const T = byP.total;
  for (const k of FACT_SUMS) {
    close(sum(byP.rows, r => r[k]), T[k], 1e-6, 'prodotti ' + k);
    close(sum(byC.rows, r => r[k]), T[k], 1e-6, 'clienti ' + k);
    close(sum(byA.rows, r => r[k]), T[k], 1e-6, 'agenti ' + k);
    close(sum(byMP.rows, r => r[k]), T[k], 1e-6, 'mese×prodotto ' + k);
  }
  const inP = ctx.facts.filter(f => f.date >= P12.from && f.date <= P12.to);
  assert.equal(T.n, inP.length);
  close(T.mc2, sum(inP, f => f.mc2), 1e-6);
  close(T.mc2, T.revenue - T.raw - T.shrink - T.energy - T.varConv - T.pack - T.logistics - T.commission, 1e-6);
  assert.equal(byP.rows.length, d.products.length);
  assert.deepEqual(Object.keys(byMP.rows[0]).slice(0, 2), ['month', 'productId']);
  assert.ok(byMP.rows.every((r, i) => i === 0 || byMP.rows[i - 1].month <= r.month), 'righe ordinate per chiave');
  // ordini di grandezza del demo (P = 12 mesi)
  assert.ok(Math.abs(T.revenue / 16.75e6 - 1) < 0.01, 'ricavi netti ≈ 16,75 M€: ' + T.revenue);
  assert.ok(Math.abs(T.raw / T.revenue - 0.688) < 0.005, 'materie prime ≈ 68,8% dei ricavi');
  assert.ok(Math.abs(T.mc2 / T.tonnes / 49.7 - 1) < 0.05, 'MdC ≈ 49,7 €/t: ' + T.mc2 / T.tonnes);
  // un periodo più corto
  const Ps = resolvePeriod({ preset: 'mese-chiuso' }, today);
  const S = aggregateFacts(ctx.facts, [], Ps).total;
  close(S.tonnes, sum(ctx.facts.filter(f => f.month === '2026-09'), f => f.tonnes), 1e-9);
  assert.deepEqual(aggregateFacts(ctx.facts, [], { from: '2030-01-01', to: '2030-12-31' }).total.n, 0);
});

test('aggregateFacts: lo storico mensile entra solo per mesi interi dentro P e prima del primo mese con fatti', () => {
  const first = ctx.facts.reduce((m, f) => (f.month < m ? f.month : m), '9999');
  assert.equal(first, '2025-10');
  const H = [
    { id: 'h1', month: '2025-09', customerId: 'c-1', productId: d.products[0].id, tonnes: 100, revenue: 36000, listRevenue: 37000, raw: 25000, energy: 600, varConv: 1200, pack: 0, logistics: 2100, commission: 900 },
    { id: 'h2', month: '2025-08', customerId: 'c-2', productId: d.products[1].id, tonnes: 50, revenue: 18000 },
    { id: 'h3', month: '2025-10', customerId: 'c-1', productId: d.products[0].id, tonnes: 999, revenue: 999999 }, // mese con fatti: escluso
  ];
  const P = { from: '2025-08-15', to: '2026-09-30' }; // agosto solo in parte: escluso
  const base = aggregateFacts(ctx.facts, [], P).total, withH = aggregateFacts(ctx.facts, H, P, ['customerId']);
  assert.deepEqual(withH.historyMonths, ['2025-09']);
  close(withH.total.tonnes, base.tonnes + 100, 1e-9);
  close(withH.total.revenue, base.revenue + 36000, 1e-6);
  close(withH.total.discount, base.discount + 1000, 1e-6);
  close(withH.total.mc1, base.mc1 + (36000 - 25000 - 600 - 1200), 1e-6);
  close(withH.total.mc2, base.mc2 + (36000 - 25000 - 600 - 1200 - 2100 - 900), 1e-6);
  close(withH.total.fixConv, base.fixConv, 1e-9);
  close(withH.total.replVar - base.replVar, 25000 + 600 + 1200, 1e-6, 'senza dato: nessun effetto scorte');
  close(sum(withH.rows, r => r.mc2), withH.total.mc2, 1e-6);
  const P2 = { from: '2025-08-01', to: '2026-09-30' };
  const w2 = aggregateFacts(ctx.facts, H, P2);
  assert.deepEqual(w2.historyMonths, ['2025-08', '2025-09']);
  close(w2.total.discount - base.discount, 1000, 1e-6, 'storico senza listino: sconto 0');
  assert.equal(dataStart(ctx.facts, []), ctx.facts.reduce((m, f) => (f.date < m ? f.date : m), '9999'));
  assert.equal(dataStart(ctx.facts, H), '2025-08-01');
  assert.equal(dataStart([], []), null);
});

test('coverage: quota del periodo dopo l’inizio dei dati', () => {
  const start = dataStart(ctx.facts, []);
  assert.equal(start, '2025-10-21', 'prima consegna del demo');
  close(coverage(P12, start), (365 - 4) / 365, 1e-12); // dal 17/10 al 20/10 senza dati
  assert.equal(coverage(resolvePeriod({ preset: 'ytd' }, today), start), 1);
  const C = comparePeriod(P12, 'ap', today);
  assert.ok(coverage(C, start) < 0.1, 'anno prima senza dati');
  assert.equal(coverage({ from: '2026-01-01', to: '2026-01-10', days: 10 }, '2026-01-06'), 0.5);
  assert.equal(coverage({ from: '2026-01-01', to: '2026-01-10', days: 10 }, '2026-02-01'), 0);
  assert.equal(coverage({ from: '2026-01-01', to: '2026-01-10' }, null), 0);
  assert.equal(coverage(null, start), null);
});

/* ---------------- costi fissi ---------------- */
test('fixedFor: somme per centro e gruppo, quota dei mesi, mesi aperti stimati', () => {
  const FY = fixedFor(d.fixedCosts, d.costCenters, { from: '2025-10-01', to: '2026-09-30' });
  assert.equal(FY.total, 1810000);
  assert.deepEqual(FY.estimatedMonths, []);
  assert.equal(FY.nonCash, 300000); assert.equal(FY.cash, 1510000);
  assert.deepEqual(FY.byGroup, { stabilimento: 1290000, struttura: 400000, commerciale: 120000 });
  assert.equal(FY.byCenter['cc-pers'], 620000);
  close(sum(Object.values(FY.byCenter)), FY.total, 1e-6);
  assert.equal(fixedFor(d.fixedCosts, d.costCenters, { from: '2024-10-01', to: '2025-09-30' }).total, 1755700);
  // mese tagliato: quota dei giorni
  const half = fixedFor(d.fixedCosts, d.costCenters, { from: '2026-09-01', to: '2026-09-15' });
  const sep = sum(d.fixedCosts.filter(r => r.month === '2026-09'), r => r.amount);
  close(half.total, sep * 15 / 30, 1e-6);
  // ultimi 12 mesi: ottobre 2026 senza consuntivo → media degli ultimi 12 mesi, elencato tra gli stimati
  const F = fixedFor(d.fixedCosts, d.costCenters, P12);
  assert.deepEqual(F.estimatedMonths, ['2026-10']);
  const oct25 = sum(d.fixedCosts.filter(r => r.month === '2025-10'), r => r.amount);
  close(F.total, 1810000 - oct25 + oct25 * 15 / 31 + 1810000 / 12 * 16 / 31, 1e-6);
  close(F.cash + F.nonCash, F.total, 1e-9);
  close(sum(Object.values(F.byGroup)), F.total, 1e-6);
  close(sum(F.months, m => m.amount), F.total, 1e-6);
  assert.equal(F.months.find(m => m.month === '2026-10').source, 'media');
  // con il budget del mese aperto si usa quello
  const bud = d.costCenters.map(c => ({ id: 'b-' + c.id, month: '2026-10', centerId: c.id, kind: 'budget', amount: 10000 }));
  const FB = fixedFor([...d.fixedCosts, ...bud], d.costCenters, P12);
  assert.deepEqual(FB.estimatedMonths, ['2026-10']);
  close(FB.total, 1810000 - oct25 + oct25 * 15 / 31 + 80000 * 16 / 31, 1e-6);
  assert.equal(fixedFor([...d.fixedCosts, ...bud], d.costCenters, P12, { openMonthFallback: 'media' }).total, F.total);
  // budget come tipo principale; nessun dato → zero, mesi mancanti
  assert.equal(fixedFor(bud, d.costCenters, { from: '2026-10-01', to: '2026-10-31' }, { kind: 'budget' }).total, 80000);
  const none = fixedFor([], d.costCenters, P12);
  assert.equal(none.total, 0); assert.deepEqual(none.estimatedMonths, []); assert.equal(none.missingMonths.length, 13);
  assert.deepEqual(fixedFor(d.fixedCosts, d.costCenters, P12, { openMonthFallback: null }).missingMonths, ['2026-10']);
});

/* ---------------- rimanenze ---------------- */
test('inventoryValuation: MP al costo dei lotti (FIFO) = Σ lotti accettati, prodotto finito al costo effettivo', () => {
  const inv = inventoryValuation(d, { ix: ctx.ix, costsToday: ctx.costs });
  const fifo = sum(d.ingLots.filter(l => l.status === 'accettato'), l => l.remaining * l.price);
  close(inv.mp.fifo, fifo, 1e-6);
  close(inv.mp.fifo, 880569, 1, 'valore FIFO del demo');
  close(inv.mp.replacement, sum(d.ingredients, i => i.stock * i.price), 1e-6);
  close(inv.mp.quarantine, sum(d.ingLots.filter(l => l.status === 'in attesa'), l => l.remaining * l.price), 1e-9);
  close(sum(inv.mp.byIng, r => r.fifo), inv.mp.fifo, 1e-6);
  // prodotto finito: resto dei lotti non bloccati oltre 0,05 t
  const shipped = {}; for (const s of d.shipments) shipped[s.lotId] = (shipped[s.lotId] || 0) + s.tonnes;
  const rest = d.lots.filter(l => l.status !== 'bloccato').map(l => l.tonnes - (shipped[l.id] || 0)).filter(x => x > 0.05);
  close(inv.fg.t, sum(rest), 1e-6);
  assert.ok(Math.abs(inv.fg.t - 1536) < 2, 'circa 1.536 t di prodotto finito: ' + inv.fg.t);
  assert.ok(Math.abs(inv.fg.valueFull / 495e3 - 1) < 0.02, 'circa 495 k€ al costo pieno: ' + inv.fg.valueFull);
  assert.ok(inv.fg.valueVar < inv.fg.valueFull);
  const fix = sum(inv.fg.byProduct, r => r.t * (ctx.ix.prod[r.productId].processCost - ctx.ix.prod[r.productId].varProcessCost));
  close(inv.fg.valueFull - inv.fg.valueVar, fix, 1e-6, 'differenza = trasformazione fissa');
  // senza mappa delle spedizioni la calcola da sé
  close(inventoryValuation(d).fg.valueFull, inv.fg.valueFull, 1e-6);
});

/* ---------------- periodo globale ---------------- */
test('resolvePeriod: preset alla data di oggi', () => {
  const r = (preset, t = today, o) => resolvePeriod({ preset }, t, o);
  assert.deepEqual([r('12m').from, r('12m').to, r('12m').days, r('12m').open], ['2025-10-17', today, 365, true]);
  assert.equal(r('12m').months.length, 13);
  assert.deepEqual([r('ytd').from, r('ytd').to, r('ytd').days], ['2026-01-01', today, 289]);
  assert.deepEqual([r('mese').from, r('mese').to, r('mese').days], ['2026-10-01', today, 16]);
  assert.deepEqual([r('mese-chiuso').from, r('mese-chiuso').to, r('mese-chiuso').open], ['2026-09-01', '2026-09-30', false]);
  assert.equal(r('mese-chiuso').label, 'settembre 2026');
  assert.deepEqual([r('trimestre').from, r('trimestre', '2026-08-14').from], ['2026-10-01', '2026-07-01']);
  assert.deepEqual([r('anno-prec').from, r('anno-prec').to, r('anno-prec').label], ['2025-01-01', '2025-12-31', 'anno 2025']);
  assert.deepEqual([r('mese-chiuso', '2026-01-05').from, r('mese-chiuso', '2026-01-05').to], ['2025-12-01', '2025-12-31']);
  // esercizio da luglio
  assert.equal(r('ytd', today, { fyStart: 7 }).from, '2026-07-01');
  assert.equal(r('ytd', '2026-03-10', { fyStart: 7 }).from, '2025-07-01');
  assert.deepEqual([r('anno-prec', today, { fyStart: 7 }).from, r('anno-prec', today, { fyStart: 7 }).to], ['2025-07-01', '2026-06-30']);
  assert.equal(r('trimestre', today, { fyStart: 2 }).from, '2026-08-01');
  // date a scelta (invertite si raddrizzano; incomplete tornano al preset di base)
  const c = resolvePeriod({ preset: 'custom', from: '2026-09-30', to: '2026-01-01' }, today);
  assert.deepEqual([c.from, c.to, c.days, c.open, c.key], ['2026-01-01', '2026-09-30', 273, false, '2026-01-01_2026-09-30']);
  assert.equal(c.label, 'gennaio – settembre 2026');
  assert.equal(resolvePeriod({ preset: 'custom', from: '2026-01-01' }, today).preset, 'mese-chiuso');
  assert.equal(resolvePeriod({ preset: 'boh' }, today).preset, 'mese-chiuso');
  assert.equal(resolvePeriod(null, today).days, 30, 'di base l’ultimo mese chiuso (settembre)');
  // 29/02
  const L = r('12m', '2028-02-29');
  assert.deepEqual([L.from, L.to, L.days], ['2027-03-02', '2028-02-29', 365]);
  assert.deepEqual([r('mese', '2028-02-29').days, r('ytd', '2028-02-29').days], [29, 60]);
  assert.equal(periodLabel({ from: '2026-10-01', to: '2026-10-16' }), '1 – 16 ottobre 2026');
  assert.equal(periodLabel({ from: '2025-10-17', to: '2026-10-16' }), '17/10/2025 – 16/10/2026');
  assert.equal(periodLabel({ from: '2025-10-01', to: '2026-09-30' }), 'ottobre 2025 – settembre 2026');
  assert.equal(PRESETS.length, 7); assert.deepEqual(COMPARES.map(x => x.id), ['prec', 'ap', 'budget', 'nessuno']);
  assert.deepEqual(DEFAULT_SPEC, { preset: 'mese-chiuso', from: null, to: null, compare: 'prec' }, 'ultimo mese chiuso contro il mese prima');
});

test('comparePeriod: «prec» sui mesi interi sposta di mesi, altrimenti di giorni; «ap» con il 29/02 e gli stessi giorni', () => {
  const R = (preset, t = today) => resolvePeriod({ preset }, t);
  const cmp = (P, m, t = today) => { const C = comparePeriod(P, m, t); return [C.from, C.to, C.days]; };
  // prec
  assert.deepEqual(cmp(R('mese-chiuso'), 'prec'), ['2026-08-01', '2026-08-31', 31]);
  assert.deepEqual(cmp(resolvePeriod({ preset: 'custom', from: '2026-04-01', to: '2026-06-30' }, today), 'prec'), ['2026-01-01', '2026-03-31', 90]);
  assert.deepEqual(cmp(resolvePeriod({ preset: 'custom', from: '2028-02-01', to: '2028-02-29' }, today), 'prec'), ['2028-01-01', '2028-01-31', 31]);
  assert.deepEqual(cmp(R('anno-prec'), 'prec'), ['2024-01-01', '2024-12-31', 366]);
  assert.deepEqual(cmp(R('12m'), 'prec'), ['2024-10-17', '2025-10-16', 365]);
  assert.deepEqual(cmp(R('mese'), 'prec'), ['2026-09-15', '2026-09-30', 16]);
  // ap
  assert.deepEqual(cmp(R('mese-chiuso'), 'ap'), ['2025-09-01', '2025-09-30', 30]);
  assert.deepEqual(cmp(R('ytd'), 'ap'), ['2025-01-01', '2025-10-16', 289]);
  assert.deepEqual(cmp(R('mese'), 'ap'), ['2025-10-01', '2025-10-16', 16]);
  // 29/02: ultimi 12 mesi fino al 29/02 → fino al 28/02 dell'anno prima, stessi giorni
  const L = R('12m', '2028-02-29');
  assert.deepEqual(cmp(L, 'ap', '2028-02-29'), ['2026-03-01', '2027-02-28', 365]);
  // periodo aperto con il 29/02 dentro: stessi giorni
  const open = resolvePeriod({ preset: 'custom', from: '2028-02-10', to: '2028-03-05' }, '2028-03-05');
  assert.equal(open.open, true); assert.equal(open.days, 25);
  assert.deepEqual(cmp(open, 'ap', '2028-03-05'), ['2027-02-09', '2027-03-05', 25]);
  assert.deepEqual(cmp(R('ytd', '2028-10-16'), 'ap', '2028-10-16'), ['2027-01-01', '2027-10-17', 290]);
  // febbraio intero del bisestile: mesi interi
  assert.deepEqual(cmp(R('mese', '2028-02-29'), 'ap', '2028-02-29'), ['2027-02-01', '2027-02-28', 28]);
  // periodo chiuso con 29/02 iniziale
  assert.deepEqual(cmp(resolvePeriod({ preset: 'custom', from: '2028-02-29', to: '2028-03-31' }, today), 'ap').slice(0, 2), ['2027-02-28', '2027-03-31']);
  // budget e nessuno
  const B = comparePeriod(R('ytd'), 'budget', today);
  assert.equal(B.budget, true); assert.equal(B.from, '2026-01-01');
  assert.equal(comparePeriod(R('ytd'), 'nessuno', today), null);
  assert.equal(comparePeriod(R('ytd'), 'prec', today).open, false);
});

test('serializeSpec / parseSpec: andata e ritorno; il periodo di base non va nell’indirizzo', () => {
  assert.equal(serializeSpec(DEFAULT_SPEC), '');
  assert.equal(serializeSpec({ preset: 'ytd', compare: 'ap' }), 'ytd~ap');
  assert.equal(serializeSpec({ preset: '12m', compare: 'ap' }), '12m~ap');
  assert.equal(serializeSpec({ preset: 'custom', from: '2026-01-01', to: '2026-09-30', compare: 'prec' }), 'c2026-01-01_2026-09-30~prec');
  for (const p of PRESETS) for (const c of COMPARES) {
    const s = p.id === 'custom' ? { preset: 'custom', from: '2026-02-03', to: '2026-05-31', compare: c.id } : { preset: p.id, from: null, to: null, compare: c.id };
    const t = serializeSpec(s);
    if (!t) { assert.deepEqual(s, { ...DEFAULT_SPEC }); continue; }
    assert.deepEqual(parseSpec(t), s, t);
    assert.deepEqual(parseSpec('~' + t), s);
  }
  assert.deepEqual(parseSpec('ytd'), { preset: 'ytd', from: null, to: null, compare: 'prec' });
  assert.equal(parseSpec(''), null); assert.equal(parseSpec('boh~ap'), null); assert.equal(parseSpec('custom~ap'), null);
  assert.equal(parseSpec('c2026-13-01_2026-09-30~prec'), null);
  assert.equal(parseSpec('ytd~xyz').compare, 'prec');
});

test('deltaInfo: flussi in %, rapporti in punti o unità', () => {
  assert.deepEqual(deltaInfo(110, 100), { abs: 10, pct: 0.1, good: true, sign: 1, text: '+10,0%' });
  assert.equal(deltaInfo(110, 100, { good: 'down' }).good, false);
  assert.equal(deltaInfo(90, 100, { good: 'down' }).good, true);
  const r = deltaInfo(24.4, 26.1, { kind: 'ratio', unit: '€/t' });
  assert.equal(r.pct, null); assert.equal(r.text, '−1,7 €/t'); assert.equal(r.good, false);
  assert.equal(deltaInfo(0.052, 0.061, { kind: 'ratio', unit: '%', scale: 100 }).text, '−0,9 pt');
  assert.equal(deltaInfo(5.2, 6.1, { kind: 'ratio', unit: '%' }).text, '−0,9 pt');
  assert.equal(deltaInfo(30, 35, { kind: 'ratio', unit: 'giorni', good: 'down', decimals: 0 }).text, '−5 giorni');
  assert.equal(deltaInfo(50, 0, { unit: 't', decimals: 0 }).text, '+50 t', 'confronto a zero: in unità');
  const z = deltaInfo(100.01, 100);
  assert.equal(z.sign, 0); assert.equal(z.good, null);
  assert.deepEqual(deltaInfo(null, 100), { abs: null, pct: null, good: null, sign: 0, text: '—' });
  assert.equal(deltaInfo(1, 2, { good: null }).good, null);
});

test('calendario: mesi, giorni del mese, quota di un mese nel periodo', () => {
  assert.deepEqual(monthsIn('2025-11-20', '2026-02-03'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsIn(P12).length, 13);
  assert.deepEqual(monthsIn('2026-03-01', '2026-02-01'), []);
  assert.equal(daysInMonth('2028-02'), 29); assert.equal(daysInMonth('2100-02-10'), 28);
  assert.equal(monthFraction('2026-10', P12), 16 / 31);
  assert.equal(monthFraction('2025-10', P12), 15 / 31);
  assert.equal(monthFraction('2026-03', P12), 1);
  assert.equal(monthFraction('2024-03', P12), 0);
  close(sum(monthsIn(P12), m => monthFraction(m, P12)), 12, 1e-12, '12 mesi esatti');
});

test('stato del periodo: setPeriodSpec salva in prefs.period e avvisa; le ancore <a href> non portano il periodo', () => {
  const seen = [];
  const off = subscribePeriod((s, o) => seen.push([s.preset, s.compare, o.silent]));
  setPeriodSpec({ preset: 'ytd' });
  assert.deepEqual(getPeriodSpec(), { preset: 'ytd', from: null, to: null, compare: 'prec' });
  assert.deepEqual(getPrefs().period, getPeriodSpec());
  setPeriodSpec({ compare: 'ap' }, { silent: true });
  assert.equal(getPeriodSpec().preset, 'ytd');
  setPeriodSpec({ compare: 'ap' }); // uguale: niente avviso
  assert.deepEqual(seen, [['ytd', 'prec', false], ['ytd', 'ap', true]]);
  // un'ancora disegnata con il periodo di allora lo reimposterebbe al clic: href resta senza suffisso (lo rimette il router)
  assert.equal(href('commerciale', 'offerte', 'nuova.c-12'), '#commerciale.offerte.nuova.c-12');
  setPeriodSpec({ preset: 'custom', from: '2026-01-01', to: '2026-03-31' });
  assert.equal(serializeSpec(getPeriodSpec()), 'c2026-01-01_2026-03-31~ap', 'il suffisso che go() e il router scrivono');
  assert.equal(href('economia', 'margini'), '#economia.margini');
  setPeriodSpec(DEFAULT_SPEC);
  assert.equal(href('economia', 'margini'), '#economia.margini');
  assert.equal(href('commerciale', 'offerte', 'a b~c'), '#commerciale.offerte.a-b-c', 'niente «~» negli identificativi');
  off();
  // lettura dell'ancora
  assert.deepEqual(parseHash('#commerciale.offerte.nuova.c-12~ytd~ap'), { area: 'commerciale', tab: 'offerte', id: 'nuova.c-12', period: 'ytd~ap' });
  assert.deepEqual(parseHash('#economia'), { area: 'economia', tab: null, id: null, period: null });
  assert.deepEqual(parseHash('#/boh.x~c2026-01-01_2026-09-30~prec'), { area: 'oggi', tab: 'x', id: null, period: 'c2026-01-01_2026-09-30~prec' });
  assert.equal(parseHash('#dati.%E0').area, 'dati', 'ancora non decodificabile');
});

/* ---------------- selettori derivati ---------------- */
test('derived: ctxOf stabile e uguale a makeCtx; agg, fixedP e inventory memorizzati', () => {
  assert.equal(appToday(d), today);
  assert.equal(appToday({ settings: {} }), todayLocal());
  const c1 = ctxOf(d), c2 = ctxOf(d);
  assert.equal(c1, c2);
  assert.equal(c1.facts, factsSel(d));
  assert.deepEqual(Object.keys(c1).sort(), Object.keys(ctx).sort());
  assert.equal(c1.facts.length, ctx.facts.length);
  for (const k of FACT_SUMS) close(sum(c1.facts, f => f[k]), sum(ctx.facts, f => f[k]), 1e-6, k);
  assert.deepEqual(c1.volumes, ctx.volumes);
  assert.equal(c1.mrp.rows.length, ctx.mrp.rows.length);
  assert.equal(agg(d, P12, ['productId']), agg(d, P12, ['productId']));
  close(agg(d, P12).total.mc2, aggregateFacts(ctx.facts, [], P12).total.mc2, 1e-6);
  assert.equal(fixedP(d, P12), fixedP(d, P12));
  close(fixedP(d, P12).total, fixedFor(d.fixedCosts, d.costCenters, P12).total, 1e-9);
  // ripiego spento (null) e ripiego di base (undefined) sono calcoli diversi: non devono condividere la voce della memoria
  const Popen = { from: '2026-09-01', to: today };
  assert.deepEqual(fixedP(d, Popen).estimatedMonths, ['2026-10']);
  assert.deepEqual(fixedP(d, Popen, { openMonthFallback: null }).estimatedMonths, []);
  assert.deepEqual(fixedP(d, Popen, { openMonthFallback: null }).missingMonths, ['2026-10']);
  assert.ok(fixedP(d, Popen, { openMonthFallback: false }).total < fixedP(d, Popen).total);
  close(inventory(d).mp.fifo, 880569, 1);
  // un cambio di prezzo dell'energia ricalcola i fatti
  const d2 = { ...d, settings: { ...d.settings, energy: { ...d.settings.energy, kwhPrice: 0.3 } } };
  assert.notEqual(factsSel(d2), factsSel(d));
  assert.ok(sum(factsSel(d2), f => f.energy) > sum(factsSel(d), f => f.energy));
  assert.deepEqual(makeIndex(d).runByLot['lt-1']?.id, d.runs.find(r => r.lotId === 'lt-1')?.id);
  assert.equal(Object.keys(costsOf(d)).length, d.products.length);
});

test('customerStats: margine al costo effettivo dopo le provvigioni; i clienti «in perdita» a costi di oggi non lo sono', () => {
  const S = customerStats(d);
  assert.equal(customerStats(d), S, 'memorizzato');
  const P = period12(d);
  assert.deepEqual([P.from, P.to], [P12.from, P12.to]);
  // clienti che la formula di prima mostra in perdita
  const neg = Object.entries(S).filter(([, s]) => s.tonnes > 0 && s.marginToday < 0).map(([id]) => id).sort();
  assert.ok(neg.includes('c-21') && neg.includes('c-22'), 'in perdita a costi di oggi: ' + neg.join(', '));
  for (const id of neg) {
    const fs = ctx.facts.filter(f => f.customerId === id && f.date >= P.from && f.date <= P.to);
    close(S[id].margin, sum(fs, f => f.marginFull), 1e-6, id + ' margine');
    close(S[id].mc2, sum(fs, f => f.mc2), 1e-6, id + ' mc2');
    close(S[id].marginToday, sum(fs, f => f.revenue - f.tonnes * ctx.costs[f.productId].total), 1e-6, id + ' formula di prima');
    assert.ok(S[id].margin > 0, `${id}: ${S[id].margin / S[id].tonnes} €/t al costo effettivo`);
  }
  assert.ok(S['c-21'].margin / S['c-21'].tonnes > 10 && S['c-22'].margin / S['c-22'].tonnes > 10);
  // somme: Σ clienti = Σ fatti del periodo
  const inP = ctx.facts.filter(f => f.date >= P.from && f.date <= P.to);
  close(sum(Object.values(S), s => s.margin), sum(inP, f => f.marginFull), 1e-6);
  close(sum(Object.values(S), s => s.tonnes), sum(inP, f => f.tonnes), 1e-6);
  assert.equal(sum(Object.values(S), s => s.n), inP.length);
  // last su tutta la storia, lastInP dentro il periodo
  const Pq = { from: '2026-01-01', to: '2026-03-31' };
  const Sq = customerStats(d, Pq);
  const c = Object.keys(Sq).find(id => Sq[id].lastInP && Sq[id].last > Pq.to);
  assert.ok(c, 'un cliente con consegne dopo marzo');
  assert.ok(Sq[c].lastInP <= Pq.to && Sq[c].lastInP >= Pq.from);
  assert.equal(Sq[c].last, S[c].last);
  close(sum(Object.values(Sq[c].byProduct)), Sq[c].tonnes, 1e-9);
});
