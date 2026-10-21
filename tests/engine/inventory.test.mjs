/* FeedOS 17 · WP2 rimanenze: valorizzazione a una data (FIFO, CMP, sostituzione), classi ABC/XYZ, lenti ed eccedenze,
 * andamento mensile e sintesi (contratto). Valori del demo con seme 16 e oggi 16/10/2026. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx, inventoryValuation } from '../../src/engine/actuals.js';
import { valuationAt, abcXyz, slowMovers, stockHistory, inventorySummary, finishedAt, cogs12 } from '../../src/engine/inventory.js';
import { resolvePeriod } from '../../src/core/period.js';
import { sum } from '../../src/core/util.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P = resolvePeriod({ preset: '12m' }, today);
const IV = inventoryValuation(D, { ix: ctx.ix, costsToday: ctx.costs });
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} contro ${b} (tolleranza ${tol})`);

test('valorizzazione a oggi: FIFO = inventoryValuation (± 1 €); sostituzione e CMP coerenti', () => {
  const f = valuationAt(D, today, 'fifo');
  console.log(`MP al ${today}: FIFO ${Math.round(f.value)} · CMP ${Math.round(valuationAt(D, today, 'cmp').value)} · sostituzione ${Math.round(valuationAt(D, today, 'sostituzione').value)} · PF ${Math.round(IV.fg.t)} t ${Math.round(IV.fg.valueFull)} €`);
  close(f.value, IV.mp.fifo, 1, 'FIFO');
  close(f.value, 880569, 1, 'FIFO del demo');
  close(f.t, sum(IV.mp.byIng, r => r.t), 1e-6, 'tonnellate');
  const s = valuationAt(D, today, 'sostituzione');
  close(s.value, IV.mp.replacement, IV.mp.replacement * 0.001, 'sostituzione ≈ scorta × prezzo di oggi');
  assert.ok(s.value > 880000 && s.value < 884000, 'sostituzione ≈ 881,8 mila');
  const c = valuationAt(D, today, 'cmp');
  for (const r of c.byIng) assert.ok(r.price > 0);
  close(c.t, f.t, 1e-9, 'stesse quantità con ogni metodo');
});

test('valorizzazione a una data passata = ricevuto − consumato − rettificato fino a quella data', () => {
  for (const date of ['2026-03-31', '2026-06-30', '2026-09-30']) {
    const used = {}, adj = {};
    for (const l of D.lots) if (l.date <= date) for (const c of l.comp) used[c.l] = (used[c.l] || 0) + c.kg / 1000;
    for (const a of D.adjustments) if (a.date <= date) adj[a.ingLotId] = (adj[a.ingLotId] || 0) + a.tonnes;
    let v = 0;
    for (const l of D.ingLots) if (l.status === 'accettato' && l.date <= date) { const t = l.tonnes - (used[l.id] || 0) + (adj[l.id] || 0); if (t > 1e-9) v += t * l.price; }
    close(valuationAt(D, date, 'fifo').value, v, 50, 'FIFO al ' + date);
  }
});

test('ABC: quote cumulate monotone, la A si ferma alla prima voce che supera l’80%; insieme A del demo', () => {
  const a = abcXyz(D, ctx, P);
  const rows = Object.entries(a).sort((x, y) => y[1].value - x[1].value);
  console.log('ABC/XYZ: ' + rows.slice(0, 14).map(([k, v]) => `${k} ${v.abc}${v.xyz || '-'} ${(v.share * 100).toFixed(1)}%`).join(' · '));
  let prev = 0;
  for (const [, v] of rows) { assert.ok(v.cumShare >= prev - 1e-12); prev = v.cumShare; }
  close(rows[rows.length - 1][1].cumShare, 1, 1e-9, 'cumulato finale');
  close(sum(rows, ([, v]) => v.share), 1, 1e-9, 'quote');
  const firstOver = rows.findIndex(([, v]) => v.cumShare > 0.8);
  assert.ok(rows.slice(0, firstOver).every(([, v]) => v.abc === 'A'), 'A fino all’80%');
  assert.notEqual(rows[firstOver][1].abc, 'A', 'la prima voce oltre l’80% è già B');
  assert.ok(rows.every(([, v]) => v.abc !== 'B' || v.cumShare <= 0.95 + 1e-12));
  const A = rows.filter(([, v]) => v.abc === 'A').map(([k]) => k).sort();
  assert.deepEqual(A, ['colza', 'farinaccio', 'mais', 'premix', 'soia44', 'sorgo']);
  // valore consumato = Σ kg dei lotti di prodotto nel periodo × prezzo del lotto MP
  const il = Object.fromEntries(D.ingLots.map(l => [l.id, l]));
  const mais = sum(D.lots.filter(l => l.date >= P.from && l.date <= P.to).flatMap(l => l.comp.filter(c => c.ing === 'mais')), c => c.kg / 1000 * il[c.l].price);
  close(a.mais.value, mais, 1e-6, 'valore del mais');
});

test('XYZ: mais X; glutine, soia48 e DDGS Z', () => {
  const a = abcXyz(D, ctx, P);
  assert.equal(a.mais.xyz, 'X');
  for (const id of ['glutine', 'soia48', 'ddgs']) assert.equal(a[id].xyz, 'Z', id);
  for (const v of Object.values(a)) if (v.cv != null) assert.equal(v.xyz, v.cv < 0.25 ? 'X' : v.cv <= 0.75 ? 'Y' : 'Z');
});

test('lenti ed eccedenze: soiadf senza fabbisogno, frumento oltre 600 giorni, lotto di fosfato di 128 giorni', () => {
  const s = slowMovers(D, ctx);
  for (const r of s) console.log(`lento: ${r.ingId} ${r.t.toFixed(1)} t · copertura ${r.coverDays == null ? '—' : Math.round(r.coverDays)} gg · lotto più vecchio ${r.oldestLotDays} gg · eccesso ${Math.round(r.excessValue)} € · ${r.action}`);
  const by = Object.fromEntries(s.map(r => [r.ingId, r]));
  assert.ok(by.soiadf?.flags.noNeed, 'soiadf: nessun fabbisogno a 8 settimane');
  assert.ok(by.frumento?.coverDays > 600, 'frumento: copertura oltre 600 giorni');
  assert.equal(by.fosfato?.oldestLotDays, 128);
  for (const r of s) {
    close(r.excessT, Math.max(0, r.t - (r.needT8w + r.safetyT)), 1e-9, 'eccesso ' + r.ingId);
    assert.ok(r.excessValue <= r.value + 1e-6);
    close(r.carryingCost, r.value * 0.08, 1e-9, 'costo di mantenimento');
    assert.ok(r.flagged && r.action);
  }
  assert.ok(slowMovers(D, ctx, { all: true }).length > s.length);
});

test('andamento mensile e sintesi: ultimo mese = valori di oggi; DIO e costo di mantenimento', () => {
  const h = stockHistory(D, 12, ctx);
  assert.equal(h.length, 12);
  const last = h[h.length - 1];
  assert.equal(last.date, today);
  close(last.mp, IV.mp.fifo, 1, 'MP'); close(last.fg, IV.fg.valueFull, 1, 'PF');
  for (const x of h.slice(0, -1)) assert.ok(x.date.slice(0, 7) === x.month && x.mp > 0);
  const f = finishedAt(D, ctx, today);
  close(f.t, IV.fg.t, 1e-6, 'PF t'); close(f.valueVar, IV.fg.valueVar, 1e-6, 'PF variabile');
  assert.ok(f.t > 1500 && f.t < 1570, 'PF ≈ 1.536 t'); assert.ok(f.valueFull > 480000 && f.valueFull < 510000, 'PF ≈ 495 mila €');
  const s = inventorySummary(D, ctx, P);
  close(s.mpFifo, IV.mp.fifo, 1e-6, 'contratto mpFifo'); close(s.fgValue, IV.fg.valueFull, 1e-6, 'contratto fgValue');
  close(s.dio, (s.mpFifo + s.fgValue) / (cogs12(D, ctx) / 365), 1e-9, 'DIO');
  close(s.carryingCost, (s.mpFifo + s.fgValue) * 0.08, 1e-6, 'mantenimento al tasso di settings.ops');
  close(s.excessValue, sum(slowMovers(D, ctx), r => r.excessValue), 1e-6, 'eccesso');
  // giorni di consumo coperti dalle sole MP (≈ 27 giorni del collaudo): MP al FIFO ÷ (materie prime + calo dei 12 mesi ÷ 365)
  const raw = sum(ctx.facts.filter(f => f.date >= P.from && f.date <= today), f => f.raw + f.shrink);
  close(s.dioMp, s.mpFifo / (raw / 365), 1e-9, 'DIO materie prime');
  assert.ok(s.dioMp > 25 && s.dioMp < 31, 'DIO MP ≈ 27–28 giorni');
  close(s.dioMpShare + s.dioFgShare, s.dio, 1e-9, 'quote MP + PF = DIO');
  console.log(`DIO ${s.dio.toFixed(1)} giorni · rotazione ${s.turnover.toFixed(1)} · eccesso ${Math.round(s.excessValue)} € · mantenimento ${Math.round(s.carryingCost)} €/anno`);
  // archivio vuoto
  const e = inventorySummary({ settings: {}, ingLots: [], lots: [], shipments: [], ingredients: [], products: [] }, null, P);
  assert.equal(e.mpFifo, 0); assert.equal(e.dio, null);
  assert.deepEqual(abcXyz({ lots: [], ingLots: [], ingredients: [], settings: {} }, { today }, P), {});
});
