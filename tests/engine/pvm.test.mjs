/* FeedOS 17 · WP1 ponte del margine: quadratura esatta su casi sintetici e sul demo, scomposizione di materie prime ed energia,
 * confronto con l'anno prima dallo storico mensile e con il budget, lettura in italiano. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { basis, pvm, narrative, emptyRow, STIMA } from '../../src/engine/pvm.js';
import { budgetBasis } from '../../src/engine/budget.js';
import { pnlFor } from '../../src/engine/pnl.js';
import { sum, endOfMonth } from '../../src/core/util.js';

const today = '2026-10-16';
const d = demoData(today);
const ctx = makeCtx(d, today);
const whole = m => ({ from: m + '-01', to: endOfMonth(m) });
const ok = (r, msg = '') => assert.ok(Math.abs(r.check) < 1e-6 * Math.max(1, Math.abs(r.end)), `${msg} check ${r.check}`);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const step = (r, k) => r.steps.find(s => s.key === k)?.value ?? 0;

/** Riga sintetica: t, prezzo, listino, ingredienti {id: [kg/t, €/kg]}, energia [kWh/t, €/kWh, GPL/t, €/kg], altri costi per t. */
function row(key, t, { p = 360, L = 370, ing = { mais: [600, 0.24], soia: [250, 0.42] }, en = [20, 0.19, 2.5, 0.98], shrinkT = 1.5, varT = 12, packT = 4, logT = 21, commT = 9 } = {}) {
  const r = emptyRow(key);
  r.t = t; r.rev = p * t; r.list = L * t; r.shrink = shrinkT * t; r.varConv = varT * t; r.pack = packT * t; r.logistics = logT * t; r.commission = commT * t;
  for (const [id, [q, pi]] of Object.entries(ing)) { r.ing[id] = { kg: q * t, eur: q * pi * t }; r.raw += q * pi * t; }
  r.kwh = en[0] * t; r.kwhEur = en[0] * en[1] * t; r.gplKg = en[2] * t; r.gplEur = en[2] * en[3] * t; r.energy = r.kwhEur + r.gplEur;
  return r;
}
const base = (rows, fixed = 0) => ({ rows: Object.fromEntries(rows.map(r => [r.key, r])), fixed });

test('quadratura su casi sintetici: prodotto nuovo, prodotto uscito, A vuoto, prodotto unico, tutti i livelli', () => {
  const A = base([row('x', 100), row('y', 50, { p: 420, L: 430, ing: { mais: [500, 0.24], orzo: [300, 0.2] } })], 40000);
  const B = base([row('x', 120, { p: 365, ing: { mais: [620, 0.26], soia: [230, 0.45] }, en: [21, 0.21, 2.4, 1.02] }), row('z', 30, { p: 500, L: 520 })], 42000);
  for (const level of ['mc1', 'mc2', 'ebit']) {
    ok(pvm(A, B, { level }), 'nuovo/uscito ' + level);
    ok(pvm(base([]), B, { level }), 'A vuoto ' + level);
    ok(pvm(A, base([]), { level }), 'B vuoto ' + level);
    ok(pvm(base([row('x', 100)]), base([row('x', 90, { p: 355, ing: { mais: [610, 0.25], soia: [240, 0.4] } })]), { level }), 'prodotto unico ' + level);
  }
  // A vuoto: tutto nel mix, niente volume
  const r0 = pvm(base([]), B, { level: 'mc2' });
  close(step(r0, 'volume'), 0); close(step(r0, 'mix'), r0.end, 1e-6, 'tutto nel mix');
  // un solo prodotto con le stesse unità: solo volume
  const r1 = pvm(base([row('x', 100)]), base([row('x', 130)]), { level: 'mc2' });
  close(step(r1, 'volume'), r1.end - r1.start, 1e-6); close(step(r1, 'mix'), 0, 1e-9); close(step(r1, 'mpPrezzo'), 0, 1e-9);
  // EBIT: i fissi sono un passo a parte
  const r2 = pvm(A, B, { level: 'ebit' });
  close(step(r2, 'fissi'), -2000, 1e-9);
  assert.ok(!pvm(A, B, { level: 'mc1' }).steps.some(s => s.key === 'logistica' || s.key === 'fissi'));
  // prodotto nuovo: entra nel mix col suo margine; prodotto uscito: esce dal mix
  const rz = r2.rows.find(x => x.key === 'z'), ry = r2.rows.find(x => x.key === 'y');
  assert.ok(rz.onlyB && ry.onlyA);
});

test('materie prime: prezzo + ricetta = −Σ t_B Δ costo MP per t; energia: efficienza + tariffa = −Σ t_B Δ energia per t (sintetico)', () => {
  const A = base([row('x', 100), row('y', 60, { ing: { mais: [500, 0.24], orzo: [300, 0.2] } })]);
  const B = base([row('x', 110, { ing: { mais: [640, 0.27], soia: [200, 0.44], olio: [10, 1.1] }, en: [22, 0.2, 2.2, 1.0] }), row('y', 70, { ing: { mais: [520, 0.25] }, en: [18, 0.18, 0, 0.98] })]);
  const r = pvm(A, B, { level: 'mc2' });
  ok(r);
  let raw = 0, en = 0;
  for (const k of ['x', 'y']) { const a = A.rows[k], b = B.rows[k]; raw += -b.t * (b.raw / b.t - a.raw / a.t); en += -b.t * (b.energy / b.t - a.energy / a.t); }
  close(step(r, 'mpPrezzo') + step(r, 'mpRicetta'), raw, 1e-6, 'MP');
  close(step(r, 'energiaEfficienza') + step(r, 'energiaTariffa'), en, 1e-6, 'energia');
  // solo prezzi diversi (stesse quantità): tutto nel prezzo
  const r2 = pvm(base([row('x', 100)]), base([row('x', 100, { ing: { mais: [600, 0.3], soia: [250, 0.5] } })]));
  close(step(r2, 'mpRicetta'), 0, 1e-9); close(step(r2, 'mpPrezzo'), -100 * (600 * 0.06 + 250 * 0.08), 1e-6);
});

const sep = basis(d, ctx, whole('2026-09')), aug = basis(d, ctx, whole('2026-08'));

test('demo agosto → settembre 2026 (MdC II): quadra, e il prezzo delle materie prime è il passo più pesante e negativo', () => {
  const r = pvm(aug, sep, { level: 'mc2' });
  ok(r, 'ago→set');
  // margini di partenza e arrivo = MdC II del conto economico dei due mesi
  close(r.start, pnlFor(d, ctx, whole('2026-08')).by.mdc2, 1e-4, 'M_A');
  close(r.end, pnlFor(d, ctx, whole('2026-09')).by.mdc2, 1e-4, 'M_B');
  const mp = step(r, 'mpPrezzo');
  assert.ok(mp < 0, 'prezzo MP negativo ' + mp);
  const biggest = [...r.steps].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  assert.equal(biggest.key, 'mpPrezzo');
  for (const level of ['mc1', 'ebit']) ok(pvm(aug, sep, { level }), level);
  // per specie, cliente e agente
  for (const by of ['species', 'customerId', 'agentId']) ok(pvm(basis(d, ctx, whole('2026-08'), by), basis(d, ctx, whole('2026-09'), by)), by);
  // dettaglio per cliente di un prodotto
  const f = x => x.productId === 'p-lt18';
  ok(pvm(basis(d, ctx, whole('2026-08'), 'customerId', { filter: f }), basis(d, ctx, whole('2026-09'), 'customerId', { filter: f })), 'dettaglio');
});

test('demo: prezzo + ricetta = −Σ t_B Δ costo MP per t e efficienza + tariffa = −Σ t_B Δ energia per t, sui prodotti presenti nei due mesi', () => {
  const r = pvm(aug, sep, { level: 'mc2' });
  let raw = 0, en = 0;
  for (const k of Object.keys(sep.rows)) {
    const a = aug.rows[k], b = sep.rows[k];
    if (!a || !(a.t > 0) || !(b.t > 0)) continue;
    raw += -b.t * (b.raw / b.t - a.raw / a.t); en += -b.t * (b.energy / b.t - a.energy / a.t);
  }
  close(step(r, 'mpPrezzo') + step(r, 'mpRicetta'), raw, 1e-6, 'MP');
  close(step(r, 'energiaEfficienza') + step(r, 'energiaTariffa'), en, 1e-6, 'energia');
  // le materie prime della base = quelle dei fatti; il dettaglio per ingrediente le copre per intero
  close(sum(Object.values(sep.rows), x => x.raw), pnlFor({ ...d, closings: [] }, ctx, whole('2026-09')).sums.raw, 1e-4);
  assert.ok(Object.values(sep.rows).every(x => !(x.ing[STIMA]?.eur > 1)), 'nessuna stima con lotti completi');
});

test('demo anno su anno con lo storico mensile: settembre 2026 vs settembre 2025, ogni mese dello storico quadra', () => {
  const A = basis(d, ctx, whole('2025-09'));
  assert.ok(Object.values(A.rows).length > 5 && Object.values(A.rows).every(x => x.ing[STIMA]), 'storico in _stima');
  const r = pvm(A, sep, { level: 'mc2' });
  ok(r, 'set/set');
  assert.ok(r.collapsed > 0, 'MP confrontate come voce unica');
  close(step(r, 'mpRicetta'), 0, 1e-6);
  close(r.start, pnlFor(d, ctx, whole('2025-09')).by.mdc2, 1e-4);
  for (const m of [...new Set(d.salesHistory.map(h => h.month))]) {
    const b = m.replace(/^(\d{4})/, y => String(+y + 1));
    ok(pvm(basis(d, ctx, whole(m)), basis(d, ctx, whole(b)), { level: 'ebit' }), m);
  }
});

test('demo contro il budget (EBIT): quadra con i costi fissi di budget', () => {
  const P = whole('2026-09');
  const A = budgetBasis(d, P, 'B');
  assert.ok(Object.keys(A.rows).length > 5 && A.fixed > 0);
  const r = pvm(A, sep, { level: 'ebit' });
  ok(r, 'budget');
  close(step(r, 'fissi'), -(sep.fixed - A.fixed), 1e-6);
  ok(pvm(budgetBasis(d, P, 'B', 'species'), basis(d, ctx, P, 'species'), { level: 'mc2' }), 'per specie');
});

test('lettura: al più tre frasi in italiano sui fattori sopra la materialità', () => {
  const r = pvm(aug, sep, { level: 'mc2' });
  const n = narrative(r, { abs: 5000, pct: 2 }, { vs: 'sul mese prima' });
  assert.ok(n.length >= 1 && n.length <= 3);
  assert.match(n[0], /^Margine di contribuzione [\d.,]+ k€ \([−+][\d.,]+ k€ sul mese prima\): pesa il prezzo delle materie prime \(−[\d.,]+ k€\)\.$/);
  const none = narrative(r, { abs: 1e9, pct: 0 }, { vs: 'sul mese prima' });
  assert.equal(none.length, 1); assert.match(none[0], /nessun effetto supera la soglia/);
  assert.match(narrative(pvm(base([]), sep))[0], /non ci sono dati/);
});
