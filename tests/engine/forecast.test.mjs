/* FeedOS 17 · previsioni (WP3): tendenza smorzata, bande mai negative, stagionalità solo con due cicli,
 * scelta automatica del modello mai peggiore della media mobile a 4, forma di forecast() invariata per Acquisti › Mercati. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, backtest, forecastAuto, fit, PHI_GRID, MODELS } from '../../src/engine/forecast.js';
import { rng } from '../../src/core/util.js';

const sine = n => Array.from({ length: n }, (_, i) => 100 + 10 * Math.sin(i / 52 * 2 * Math.PI));
const walk = (n, seed) => { const R = rng(seed); let x = 100; return Array.from({ length: n }, () => (x += R.normal(0, 4))); };

test('forecast(y, 8, 1): forma invariata (punti k/value/lo/hi, parametri, residui)', () => {
  const y = walk(51, 3);
  const f = forecast(y, 8, 1);
  assert.deepEqual(Object.keys(f), ['points', 'params', 'residuals']);
  assert.equal(f.points.length, 8);
  for (const [i, p] of f.points.entries()) { assert.deepEqual(Object.keys(p), ['k', 'value', 'lo', 'hi']); assert.equal(p.k, i + 1); }
  for (const k of ['alpha', 'beta', 'gamma', 'seasonal']) assert.ok(k in f.params, k);
  assert.ok(PHI_GRID.includes(f.params.phi), 'tendenza smorzata scelta dalla griglia');
  assert.equal(f.residuals.length, y.length - 1);
  assert.equal(forecast([1, 2, 3], 4, 1), null, 'serie troppo corta');
  const bt = backtest(y, 4, 1, 26);
  for (const k of ['n', 'mape', 'bias', 'within10', 'coverage', 'points']) assert.ok(k in bt, k);
  assert.ok(bt.n > 0 && bt.mape > 0);
});

test('bande e valori mai sotto zero, anche con una tendenza in discesa', () => {
  const y = Array.from({ length: 40 }, (_, i) => Math.max(0, 60 - 1.6 * i + (i % 3) * 2));
  const f = forecast(y, 12, 1);
  for (const p of f.points) { assert.ok(p.lo >= 0 && p.hi >= 0 && p.value >= 0, JSON.stringify(p)); }
  const a = forecastAuto(y, 12);
  for (const p of a.points) assert.ok(p.lo >= 0 && p.hi >= 0 && p.value >= 0);
  for (const s of [3, 5, 9]) for (const p of forecastAuto(walk(50, s).map(v => v - 95), 8).points) assert.ok(p.lo >= 0);
});

test('tendenza smorzata: inizializzata dalla media delle prime differenze, incrementi decrescenti', () => {
  const y = Array.from({ length: 30 }, (_, i) => 5 + 2 * i);
  const b = fit(y, 1);
  for (let t = 1; t < y.length; t++) assert.ok(Math.abs(y[t] - b.r.fitted[t]) < 0.6, 'retta seguita quasi esattamente');
  const f = forecast(y, 20, 1);
  const inc = f.points.slice(1).map((p, i) => p.value - f.points[i].value);
  for (let i = 1; i < inc.length; i++) assert.ok(inc[i] <= inc[i - 1] + 1e-9, 'la tendenza si smorza');
  assert.ok(inc[inc.length - 1] < inc[0], 'incremento finale minore del primo');
});

test('stagionalità: assente con 52 punti, attiva con 104 punti sinusoidali e m = 52', () => {
  assert.equal(forecast(sine(52), 8, 52).params.seasonal, false);
  assert.equal(forecast(sine(104), 8, 52).params.seasonal, true);
  assert.equal(forecast(sine(104), 8, 1).params.seasonal, false, 'con m = 1 mai');
  const f = forecast(sine(104), 26, 52);
  const peak = f.points.reduce((a, p) => (p.value > a.value ? p : a));
  assert.ok(peak.value > 105, 'la previsione segue il ciclo');
});

test('forecastAuto: sceglie per errore a un passo con origine mobile, mai peggio della media mobile a 4', () => {
  for (const seed of [1, 2, 7, 11, 23]) {
    const y = walk(60, seed);
    const a = forecastAuto(y, 8);
    assert.ok(MODELS.some(m => m.id === a.model));
    assert.ok(a.mape != null && a.benchmarkMape != null);
    assert.ok(a.mape <= a.benchmarkMape + 1e-12, `seme ${seed}: ${a.model} ${a.mape} > ma4 ${a.benchmarkMape}`);
    assert.equal(a.mape, Math.min(...a.candidates.map(c => c.mape)));
    assert.ok(a.holdoutMape != null, 'verifica sugli ultimi 4 punti');
    assert.equal(a.selection.holdout, 4);
    assert.equal(a.points.length, 8);
    assert.ok(!a.candidates.some(c => c.model === 'holtWinters'), 'Holt-Winters solo con almeno due cicli');
  }
  // passeggiata casuale: il modello scelto è la media mobile a 4 o uno migliore di essa
  const rw = walk(80, 5), a = forecastAuto(rw, 8);
  assert.ok(['naive', 'ma4', 'ses', 'holtDamped'].includes(a.model));
  // serie corte
  assert.deepEqual(forecastAuto([1, 2], 3).points, []);
  assert.equal(forecastAuto([10, 12, 11, 13, 12, 14, 13, 15], 3).points.length, 3);
});
