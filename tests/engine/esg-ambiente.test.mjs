/* FeedOS 18 · Registri ambientali (pacchetto WP9): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-ambiente.js';

const today = '2026-10-16';

test('ambiente: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.ambienteSignals(d, ctx)));
    const s = E.ambienteReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.ambienteDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.ambienteCalendarItems(d, today)));
  
  }
  assert.ok(Array.isArray(E.AMBIENTE_KPIS) && Array.isArray(E.AMBIENTE_RULES));
  assert.ok(E.AMBIENTE_METHOD.it && E.AMBIENTE_METHOD.en);
});
