/* FeedOS 18 · Obiettivi e piano (pacchetto WP7): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-piano.js';

const today = '2026-10-16';

test('piano: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.pianoSignals(d, ctx)));
    const s = E.pianoReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.pianoDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.pianoCalendarItems(d, today)));
    assert.ok(E.carbonPrice(d) > 0);
    assert.ok(Number.isFinite(E.esgThresholds(d).recovery));
  }
  assert.ok(Array.isArray(E.PIANO_KPIS) && Array.isArray(E.PIANO_RULES));
  assert.ok(E.PIANO_METHOD.it && E.PIANO_METHOD.en);
});
