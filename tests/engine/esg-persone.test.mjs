/* FeedOS 18 · Persone e sicurezza (pacchetto WP5): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-persone.js';

const today = '2026-10-16';

test('persone: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.personeSignals(d, ctx)));
    const s = E.personeReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.personeDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.personeCalendarItems(d, today)));
    assert.ok(E.workforce(d, P.key) === null || typeof E.workforce(d, P.key) === 'object');
    assert.ok(E.safetyRates(d, P) === null || typeof E.safetyRates(d, P) === 'object');
  }
  assert.ok(Array.isArray(E.PERSONE_KPIS) && Array.isArray(E.PERSONE_RULES));
  assert.ok(E.PERSONE_METHOD.it && E.PERSONE_METHOD.en);
});
