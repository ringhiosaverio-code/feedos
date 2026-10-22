/* FeedOS 18 · EUDR e fornitori (pacchetto WP3): prova di base sullo stub della fondazione 18 (il pacchetto la sostituisce con i suoi test). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-filiera.js';

const today = '2026-10-16';

test('filiera: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [demoData(today), emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.filieraSignals(d, ctx)));
    const s = E.filieraReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.filieraDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.filieraCalendarItems(d, today)));
    assert.ok(Array.isArray(E.refsForShipments(d, [])));
    assert.ok(E.soyShares(d, P) === null || typeof E.soyShares(d, P) === 'object');
  }
  assert.ok(Array.isArray(E.FILIERA_KPIS) && Array.isArray(E.FILIERA_RULES));
  assert.ok(E.FILIERA_METHOD.it && E.FILIERA_METHOD.en);
});
