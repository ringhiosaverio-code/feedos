/* FeedOS 18 · Report e questionari (pacchetto WP4): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-report.js';

const today = '2026-10-16';

test('report: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.reportSignals(d, ctx)));
    const s = E.reportReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.reportDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.reportCalendarItems(d, today)));
  
  }
  assert.ok(Array.isArray(E.REPORT_KPIS) && Array.isArray(E.REPORT_RULES));
  assert.ok(E.REPORT_METHOD.it && E.REPORT_METHOD.en);
});
