/* FeedOS 18 · Rischi climatici (pacchetto WP8): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-rischi.js';

const today = '2026-10-16';

test('rischi: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.rischiSignals(d, ctx)));
    const s = E.rischiReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.rischiDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.rischiCalendarItems(d, today)));
    const c = E.plantCoords(d); assert.ok(c === null || (Number.isFinite(c.lat) && Number.isFinite(c.lon)));
  }
  assert.ok(Array.isArray(E.RISCHI_KPIS) && Array.isArray(E.RISCHI_RULES));
  assert.ok(E.RISCHI_METHOD.it && E.RISCHI_METHOD.en);
});
