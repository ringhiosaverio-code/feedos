/* FeedOS 18 · Governance ed evidenze (pacchetto WP6): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-governance.js';

const today = '2026-10-16';

test('governance: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.governanceSignals(d, ctx)));
    const s = E.governanceReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.governanceDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.governanceCalendarItems(d, today)));
    assert.equal(typeof E.checkClaim('testo', {}).ok, 'boolean');
    assert.ok(Array.isArray(E.evidenceFor(d, 'shipments', 'x')));
  }
  assert.ok(Array.isArray(E.GOVERNANCE_KPIS) && Array.isArray(E.GOVERNANCE_RULES));
  assert.ok(E.GOVERNANCE_METHOD.it && E.GOVERNANCE_METHOD.en);
});
