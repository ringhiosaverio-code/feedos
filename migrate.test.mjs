import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { migrateF15, detectF15 } from '../../src/core/migrate.js';
import { starterData } from '../../src/data/demo/index.js';
import { optimize } from '../../src/engine/formulation.js';
const F15 = '/tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f15/src/FeedOS-15.0-Galtieri/tests/demo-project.json';
test('migrazione da FeedOS 15 (progetto 6.1)', () => {
  const j = JSON.parse(fs.readFileSync(F15, 'utf8'));
  assert.equal(detectF15(j), 'project');
  const r = migrateF15(j, starterData());
  console.log('report', JSON.stringify(r.report), '· non importati', JSON.stringify(r.skipped));
  const spec = r.data.specs[0];
  assert.ok(r.data.ingredients.length === j.materials.length);
  assert.ok(spec.constraints.length >= 2);
  const o = optimize({ ingredients: r.data.ingredients, spec, lines: r.data.formulas[0]?.lines || [], options: {} });
  console.log('ottimizzazione del progetto importato:', o.status, o.cost?.toFixed(2), '€/t', JSON.stringify(o.lines?.map(l => [l.ing, +l.kg.toFixed(1)])));
  assert.equal(o.status, 'optimal');
  // stessa soluzione del motore di FeedOS 15 sullo stesso progetto: 244,08 €/t di materie prime
  assert.ok(Math.abs(o.cost - 244.08) < 0.01);
});
test('migrazione da backup completo 7/8', () => {
  const j = { schema: 'feedos-workspace-7', exportedAt: '2026-01-01', workspace: { version: 7, kpis: { E4: { value: 19.56 }, S1: { value: 39 } }, products: [{ name: 'x' }], quotes: [] }, project: JSON.parse(fs.readFileSync(F15, 'utf8')), history: [], legacy: {} };
  const r = migrateF15(j, starterData());
  assert.equal(r.kind, 'backup');
  assert.equal(r.data.esgManual.E4, 19.56);
  assert.ok(r.skipped.some(s => s.includes('prodotti')));
});
test('file estraneo rifiutato', () => { assert.throws(() => migrateF15({ foo: 1 })); });
