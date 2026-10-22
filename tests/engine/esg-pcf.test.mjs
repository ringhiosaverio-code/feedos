/* FeedOS 18 · Impronta mangimi (pacchetto WP2): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-pcf.js';

const today = '2026-10-16';

test('pcf: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.pcfSignals(d, ctx)));
    const s = E.pcfReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.pcfDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.pcfCalendarItems(d, today)));
    assert.ok('total' in E.ingredientEf(d, d.ingredients[0]?.id || 'x'));
    assert.ok(E.pcf(d, d.products[0]?.id || 'x') === null || typeof E.pcf(d, d.products[0]?.id || 'x') === 'object');
  }
  assert.ok(Array.isArray(E.PCF_KPIS) && Array.isArray(E.PCF_RULES));
  assert.ok(E.PCF_METHOD.it && E.PCF_METHOD.en);
});
