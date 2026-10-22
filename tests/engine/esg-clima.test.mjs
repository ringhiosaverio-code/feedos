/* FeedOS 18 · Clima e GHG (pacchetto WP1): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-clima.js';

const today = '2026-10-16';

test('clima: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.climaSignals(d, ctx)));
    const s = E.climaReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.climaDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.climaCalendarItems(d, today)));
    assert.ok(E.factor(d, 'el.lb.it.2024', 2024) === null || Number.isFinite(E.factor(d, 'el.lb.it.2024', 2024).value));
    assert.ok(E.inventory(d, P) === null || typeof E.inventory(d, P) === 'object');
    assert.ok(Array.isArray(E.fgasDue(d, today)));
  }
  assert.ok(Array.isArray(E.CLIMA_KPIS) && Array.isArray(E.CLIMA_RULES));
  assert.ok(E.CLIMA_METHOD.it && E.CLIMA_METHOD.en);
});
