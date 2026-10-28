/* FeedOS 17 · costo pieno di oggi (WP3): prodotti senza formula incompleti, calo sul peso uscito, quota fissa della trasformazione,
 * offerte del demo con lo stesso esito di prima. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { productCost, minPrice, offerCheck, shrinkFactor } from '../../src/engine/costing.js';
import { formulaCost } from '../../src/engine/formulation.js';
import { byId } from '../../src/core/util.js';

const today = '2026-10-16';
const D = demoData(today);
const ing = byId(D.ingredients), form = byId(D.formulas), line = byId(D.lines);
const en = D.settings.energy;
const costOf = p => productCost(p, form[p.formulaId], ing, line[p.lineId], en);

test('prodotto senza formula: costo incompleto, nessun margine fasullo', () => {
  const p = { ...D.products[0], formulaId: 'manca' };
  const c = productCost(p, null, ing, line[p.lineId], en);
  assert.equal(c.incomplete, true);
  assert.equal(c.raw, null); assert.equal(c.total, null); assert.equal(c.margin, null);
  assert.equal(c.marginPct, null); assert.equal(c.minPrice, null); assert.equal(c.targetPrice, null);
  assert.ok(c.energy > 0, 'le voci note restano');
  const o = offerCheck({ price: 400, tonnes: 10 }, c, p);
  assert.equal(o.margin, null); assert.equal(o.total, null); assert.equal(o.incomplete, true); assert.equal(o.status, 'ok');
  assert.equal(minPrice(null, 8), null);
});

test('calo di lavorazione sul peso uscito: MP × s/(1 − s)', () => {
  for (const p of D.products) {
    const c = costOf(p);
    const s = p.shrinkPct / 100;
    const raw = formulaCost(form[p.formulaId].lines, ing);
    assert.ok(Math.abs(c.raw - raw) < 1e-9);
    assert.ok(Math.abs(c.shrink - raw * s / (1 - s)) < 1e-9, p.code);
    assert.ok(Math.abs(shrinkFactor(p) - s / (1 - s)) < 1e-12);
    assert.ok(Math.abs(c.total - (c.raw + c.shrink + c.energy + c.processing + c.packaging + c.logistics)) < 1e-9);
    assert.ok(Math.abs(c.minPrice - c.total / (1 - p.minMarginPct / 100)) < 1e-9);
  }
  assert.equal(shrinkFactor({ shrinkPct: 0 }), 0);
  assert.equal(shrinkFactor({ shrinkPct: 100 }), 0, 'fuori scala: nessun calo');
});

test('overrides.fixConv divide la trasformazione in variabile e fissa senza cambiare il totale', () => {
  const p = D.products[0];
  const a = costOf(p), b = productCost(p, form[p.formulaId], ing, line[p.lineId], en, { fixConv: true });
  assert.ok(Math.abs(a.total - b.total) < 1e-9);
  assert.equal(b.processingVar, p.varProcessCost); assert.equal(b.processingFix, p.processCost - p.varProcessCost);
  assert.deepEqual(b.parts.map(x => x.k), ['Materie prime', 'Calo di lavorazione', 'Energia', 'Trasformazione', 'Trasformazione fissa', 'Imballo', 'Logistica']);
  assert.equal(b.parts.find(x => x.k === 'Trasformazione').v, p.varProcessCost);
  assert.ok(!a.parts.some(x => x.k === 'Trasformazione fissa'), 'senza opzione una sola voce');
  const c = productCost(p, form[p.formulaId], ing, line[p.lineId], en, { fixConv: 20 });
  assert.equal(c.processingFix, 20); assert.equal(c.processingVar, p.processCost - 20);
  // i prezzi dello scenario passano ancora insieme all'opzione
  const m = productCost(p, form[p.formulaId], ing, line[p.lineId], en, { fixConv: true, mais: ing.mais.price * 1.1 });
  assert.ok(m.raw > a.raw);
});

test('offerte del demo: stesso esito del calcolo precedente (calo raw × s)', () => {
  const prod = byId(D.products);
  let n = 0;
  for (const o of D.offers) {
    const p = prod[o.productId]; if (!p) continue;
    const c = costOf(p);
    const legacyTotal = c.total - c.shrink + c.raw * p.shrinkPct / 100;
    const legacy = offerCheck(o, { ...c, total: legacyTotal, minPrice: minPrice(legacyTotal, p.minMarginPct) }, p);
    const now = offerCheck(o, c, p);
    assert.equal(now.status, legacy.status, o.code);
    assert.ok(Math.abs(now.margin - legacy.margin) < 0.05, `${o.code}: ${now.margin} vs ${legacy.margin}`);
    n++;
  }
  assert.ok(n >= 20);
});
