/* FeedOS 17 · simulatore «E se…» (WP3): driver che sommano al Δ costi, soia certificata visibile, prodotti inattivi esclusi,
 * volumi che spostano il costo fisso per tonnellata e l'EBIT con la leva operativa, margine di riferimento uguale a Margini. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { resolvePeriod } from '../../src/core/period.js';
import { runScenario, scenarioBase, scenarioPrices, CATEGORIES } from '../../src/engine/scenario.js';
import { productProfit } from '../../src/engine/profitability.js';
import { costStructure } from '../../src/engine/breakeven.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const B = scenarioBase(D, ctx);
const P12 = resolvePeriod({ preset: '12m' }, today);
const sumDrv = r => r.drivers.reduce((s, x) => s + x.annual, 0);
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);

test('Mais +10%: Σ driver = Δ costi annui a formule invariate (calo compreso)', () => {
  const r = runScenario(B, { byIngredient: { mais: 10 } });
  assert.ok(r.annualCostDelta > 250000 && r.annualCostDelta < 350000, String(r.annualCostDelta));
  close(sumDrv(r), r.annualCostDelta, 1e-6);
  assert.equal(r.drivers[0].key, 'mais');
  // con la ri-ottimizzazione i driver restano quelli a formule invariate
  const re = runScenario(B, { byIngredient: { mais: 10 }, reoptimize: true });
  close(sumDrv(re), re.annualCostDelta, 1e-6);
  assert.ok(re.annualCostDeltaReopt < re.annualCostDelta, 'la ri-ottimizzazione assorbe parte dell’aumento');
  assert.ok(re.savingAvailable > 50000, 'efficienza già disponibile separata');
});

test('Soia certificata: driver non vuoto ≈ +100 k€/anno, somma esatta', () => {
  const r = runScenario(B, { swapSoy: true });
  assert.ok(r.drivers.length > 0);
  const s = r.drivers.find(x => x.key === 'swapSoy');
  assert.ok(s && s.label === 'Soia certificata');
  assert.ok(s.annual > 80000 && s.annual < 125000, String(s.annual));
  close(sumDrv(r), r.annualCostDelta, 1e-6);
  const mix = runScenario(B, { swapSoy: true, byCategory: { proteico: 15 }, kwhPricePct: 25, gplPricePct: 10 });
  close(sumDrv(mix), mix.annualCostDelta, 1e-6, 'mix di fattori');
  assert.ok(mix.drivers.some(x => x.key === 'kwh') && mix.drivers.some(x => x.key === 'gpl'));
});

test('prodotti inattivi esclusi da righe, volumi e driver', () => {
  const off = D.products[0];
  const B2 = scenarioBase({ ...D, products: D.products.map(p => (p.id === off.id ? { ...p, active: false } : p)) }, ctx);
  const r = runScenario(B2, { byIngredient: { mais: 10 } }), all = runScenario(B, { byIngredient: { mais: 10 } });
  assert.ok(!r.rows.some(x => x.productId === off.id));
  close(r.volumeBase, all.volumeBase - (ctx.volumes[off.id] || 0), 1e-6);
  assert.ok(sumDrv(r) < sumDrv(all));
  close(sumDrv(r), r.annualCostDelta, 1e-6);
});

test('Volumi −10% con i costi fissi: cambia il costo per tonnellata, EBIT con la leva operativa', () => {
  assert.ok(B.fixedAnnual > 1.7e6 && B.fixedAnnual < 1.9e6);
  const r = runScenario(B, { volumePct: -10 });
  assert.ok(Math.abs(r.unit.delta) > 1, 'costo unitario cambiato: ' + r.unit.delta);
  close(r.unit.fixedSc, B.fixedAnnual / (r.volumeBase * 0.9), 1e-6);
  close(r.unit.dFixed, B.fixedAnnual / (r.volumeBase * 0.9) - B.fixedAnnual / r.volumeBase, 1e-6);
  assert.ok(r.dEbit < -0.1 * r.ebitBase, `ΔEBIT ${r.dEbit} contro EBIT ${r.ebitBase}`);
  close(r.dEbit, -0.1 * r.contribBase, 1e-6);
  // la base dell'EBIT è il consuntivo degli ultimi 12 mesi: leva ≈ 4,9
  const cs = costStructure(D, ctx, P12);
  close(r.ebitBase, cs.ebit, 1, 'EBIT di base = consuntivo');
  close(r.dEbitPct / -0.1, cs.dol, 0.05, 'ΔEBIT% / Δvolume% = leva operativa');
  assert.ok(Math.abs(r.dBepT) < 1e-6, 'il pareggio non si sposta con i soli volumi');
  assert.equal(runScenario({ ...B, fixedAnnual: null }, { volumePct: -10 }).dEbit, null, 'senza costi fissi niente EBIT');
});

test('margine di riferimento uguale a Margini (prezzi netti incassati, costi di oggi) entro l’1%', () => {
  const r = runScenario(B, {});
  const m = productProfit(D, ctx, P12).totals.annual;
  assert.ok(Math.abs(r.annualMarginBase - m) <= 0.01 * Math.abs(m), `${r.annualMarginBase} vs ${m}`);
  assert.equal(r.annualCostDelta, 0); assert.equal(r.drivers.length, 0); assert.equal(r.dEbit, 0);
});

test('listino con elasticità: volumi, pareggio di volume e fattore', () => {
  const r = runScenario(B, { listPricePct: 4, elasticity: -1.5 });
  close(r.volumeFactor, 1 - 1.5 * 0.04, 1e-12);
  close(r.breakEvenVolumePct, -r.priceDeltaT / (r.mcTBase + r.priceDeltaT), 1e-12);
  assert.ok(r.breakEvenVolumePct < 0 && r.dBepT < 0);
  const z = runScenario({ ...B, elasticity: -1 }, { listPricePct: 4 });
  close(z.volumeFactor, 0.96, 1e-12, 'elasticità dalle impostazioni');
});

test('tutte e 7 le categorie accettate; ri-ottimizzazione memorizzata per formula', () => {
  assert.equal(CATEGORIES.length, 7);
  for (const [k] of CATEGORIES) {
    const ids = D.ingredients.filter(i => i.category === k).map(i => i.id);
    const o = scenarioPrices(D.ingredients, { byCategory: { [k]: 10 } });
    assert.deepEqual(Object.keys(o).sort(), ids.sort(), k);
  }
  const r = runScenario(B, { byCategory: { aminoacido: 20, premix: 10 }, reoptimize: true });
  const a = r.rows.find(x => x.productId === 'p-lt18'), b = r.rows.find(x => x.productId === 'p-lt18s');
  assert.ok(a.lines && a.lines === b.lines, 'stessa formula: una sola ottimizzazione');
});
