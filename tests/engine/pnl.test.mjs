/* FeedOS 17 · WP1 conto economico gestionale: identità del conto, conti per chiave, serie mensile, effetto scorte,
 * numeri congelati dei mesi chiusi e valori del demo del 16/10/2026 (ultimi 12 mesi). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx, aggregateFacts, fixedFor } from '../../src/engine/actuals.js';
import { resolvePeriod } from '../../src/core/period.js';
import { pnl, pnlFor, pnlBy, PNL_LINES, compareLines, monthlySeries, stockEffect, frozenFor, effectiveCoverage, lastMonths, fixedSplit } from '../../src/engine/pnl.js';
import { sum, endOfMonth } from '../../src/core/util.js';

const today = '2026-10-16';
const d = demoData(today);
const ctx = makeCtx(d, today);
const P12 = resolvePeriod({ preset: '12m' }, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (tolleranza ${tol})`);
const rel = (a, b, r, msg) => close(a, b, Math.abs(b) * r, msg);
const whole = m => ({ from: m + '-01', to: endOfMonth(m) });

test('righe nell’ordine previsto, totali come somme progressive', () => {
  assert.deepEqual(PNL_LINES.map(l => l.id), ['ricaviLordi', 'sconti', 'ricaviNetti', 'materiePrime', 'calo', 'energia', 'trasformazioneVar', 'imballi', 'mdc1',
    'trasporti', 'provvigioni', 'mdc2', 'fissiStabilimento', 'fissiCommerciali', 'fissiStruttura', 'ebitda', 'ammortamenti', 'ebit', 'oneriCircolante', 'ebitDopoCircolante']);
  assert.deepEqual(PNL_LINES.filter(l => l.total).map(l => l.id), ['ricaviNetti', 'mdc1', 'mdc2', 'ebitda', 'ebit', 'ebitDopoCircolante']);
  const p = pnlFor(d, ctx, P12);
  let run = 0;
  for (const l of p.lines) { if (l.total) close(l.value, run, 1e-6, l.id); else run += l.value; }
});

test('12 mesi: MdC II = ricavi − costi variabili, e il conto per prodotto = cliente = agente = totale', () => {
  const p = pnlFor(d, ctx, P12);
  const t = aggregateFacts(ctx.facts, d.salesHistory, P12).total;
  assert.equal(p.frozen, false);
  close(p.by.mdc2, t.revenue - t.raw - t.shrink - t.energy - t.varConv - t.pack - t.logistics - t.commission, 1e-6, 'MdC II');
  close(p.by.mdc1, t.revenue - t.raw - t.shrink - t.energy - t.varConv - t.pack, 1e-6, 'MdC I');
  close(p.by.ricaviNetti, t.revenue, 1e-6); close(p.by.ricaviLordi + p.by.sconti, t.revenue, 1e-6, 'lordi − sconti');
  for (const key of ['productId', 'customerId', 'agentId', 'species']) {
    const rows = pnlBy(d, ctx, P12, key);
    close(sum(rows, r => r.revenue), t.revenue, 1e-6, key + ' ricavi');
    close(sum(rows, r => r.mdc2), p.by.mdc2, 1e-6, key + ' MdC II');
    close(sum(rows, r => r.mdc1), p.by.mdc1, 1e-6, key + ' MdC I');
    close(sum(rows, r => r.tonnes), p.tonnes, 1e-6, key + ' t');
    close(sum(rows, r => r.share), 1, 1e-9, key + ' quote');
    assert.ok(rows.every(r => typeof r.label === 'string' && r.label));
  }
  // costi fissi: gruppi monetari + ammortamenti = totale di fixedFor
  const f = fixedFor(d.fixedCosts, d.costCenters, P12);
  close(-(p.by.fissiStabilimento + p.by.fissiCommerciali + p.by.fissiStruttura + p.by.ammortamenti), f.total, 1e-6, 'fissi');
  close(-p.by.ammortamenti, f.nonCash, 1e-6, 'ammortamenti = non monetari');
  close(p.by.ebit, p.by.mdc2 - f.total, 1e-6, 'EBIT');
  close(p.by.ebitda, p.by.mdc2 - f.cash, 1e-6, 'EBITDA');
  close(p.by.ebitDopoCircolante, p.by.ebit - t.finCost, 1e-6, 'dopo circolante');
});

test('demo, ultimi 12 mesi: valori attesi del collaudo', () => {
  const p = pnlFor(d, ctx, P12);
  rel(p.revenueNet, 16.75e6, 0.01, 'ricavi netti');
  close(-p.by.materiePrime / p.revenueNet * 100, 68.8, 0.5, 'materie prime % ricavi');
  rel(-p.by.materiePrime, 11.5e6, 0.02, 'materie prime');
  rel(-p.by.energia, 0.26e6, 0.05, 'energia');
  rel(-p.by.provvigioni, 447e3, 0.03, 'provvigioni');
  rel(p.by.mdc2, 2.28e6, 0.05, 'MdC II');
  rel(p.by.mdc2 / p.tonnes, 49.7, 0.05, 'MdC II €/t');
  rel(p.fixedTotal, 1.81e6, 0.02, 'costi fissi');
  rel(p.by.ebit, 0.47e6, 0.15, 'EBIT');
  // ottobre 2026 è aperto: fissi dal budget, segnati come stimati
  assert.deepEqual(p.estimatedMonths, ['2026-10']);
});

test('senza costi fissi EBIT = MdC II (e nessun mese stimato)', () => {
  const d0 = { ...d, fixedCosts: [], closings: [] };
  const p = pnlFor(d0, ctx, P12);
  close(p.by.ebit, p.by.mdc2, 1e-9); close(p.by.ebitda, p.by.mdc2, 1e-9);
  assert.equal(p.fixedTotal, 0);
  assert.deepEqual(p.estimatedMonths, []);
  // pnl() senza fissi e senza anagrafica dei centri
  const q = pnl(aggregateFacts(ctx.facts, [], P12).total, null);
  close(q.by.ebit, q.by.mdc2, 1e-9);
});

test('consuntivo dei costi fissi solo per alcuni centri: il mese è segnalato come parziale', () => {
  assert.deepEqual(pnlFor(d, ctx, P12).partialFixedMonths, [], 'demo: consuntivi completi');
  const d1 = { ...d, closings: [], fixedCosts: [...d.fixedCosts, { id: 'fc-x', month: '2026-10', centerId: 'cc-pers', kind: 'consuntivo', amount: 50000 }] };
  const p = pnlFor(d1, ctx, P12);
  assert.deepEqual(p.partialFixedMonths, ['2026-10']);
  assert.ok(!p.estimatedMonths.includes('2026-10'), 'con un consuntivo il mese non è più stimato');
});

test('serie mensile: 12 mesi interi sommano al conto dello stesso intervallo (congelato e dal vivo)', () => {
  const months = lastMonths('2026-09-15', 12);
  assert.equal(months[0], '2025-10'); assert.equal(months.at(-1), '2026-09');
  const span = { from: '2025-10-01', to: '2026-09-30' };
  for (const dd of [d, { ...d, closings: [] }]) {
    const ser = monthlySeries(dd, ctx, months);
    const p = pnlFor(dd, ctx, span);
    for (const k of [['revenue', 'ricaviNetti'], ['mdc2', 'mdc2'], ['ebit', 'ebit'], ['ebitda', 'ebitda']]) close(sum(ser, m => m[k[0]]), p.by[k[1]], 1e-4, k[0]);
    close(sum(ser, m => m.tonnes), p.tonnes, 1e-6, 't');
    close(sum(ser, m => m.fixed), p.fixedTotal, 1e-4, 'fissi');
    assert.ok(ser.every(m => m.bepT == null || Math.abs(m.bepT - m.fixed / m.mdc2T) < 1e-6));
  }
  assert.equal(pnlFor(d, ctx, span).frozen, true, 'mesi tutti chiusi: numeri congelati');
});

test('serie mensile del demo: MdC €/t in calo da novembre 2025 a settembre 2026, pareggio in salita, ottobre in corso', () => {
  const ser = monthlySeries(d, ctx, lastMonths(today, 13));
  assert.equal(ser.length, 13);
  const m = Object.fromEntries(ser.map(x => [x.month, x]));
  assert.ok(m['2026-09'].mdc2T < m['2025-11'].mdc2T - 10, `MdC €/t ${m['2025-11'].mdc2T} → ${m['2026-09'].mdc2T}`);
  assert.ok(m['2026-09'].bepT > m['2025-11'].bepT * 1.2, `pareggio ${m['2025-11'].bepT} → ${m['2026-09'].bepT}`);
  assert.equal(m['2026-10'].open, true); assert.equal(m['2026-10'].frozen, false);
  assert.equal(m['2026-09'].frozen, true);
  assert.ok(m['2026-10'].estimatedFixed, 'ottobre: fissi dal budget');
});

test('effetto scorte positivo sul demo (costo di sostituzione > costo effettivo)', () => {
  const t = aggregateFacts(ctx.facts, d.salesHistory, P12).total;
  const se = stockEffect(t);
  assert.ok(se > 0, 'effetto scorte ' + se);
  close(se, t.replVar - (t.raw + t.shrink + t.energy + t.varConv + t.pack), 1e-6);
});

test('confronto riga per riga e copertura del primo mese parziale', () => {
  const cur = pnlFor(d, ctx, whole('2026-09')), prev = pnlFor(d, ctx, whole('2026-08'));
  const c = compareLines(cur, prev);
  const e = c.find(l => l.id === 'ebit');
  close(e.delta, cur.by.ebit - prev.by.ebit, 1e-9);
  close(e.deltaPct, (cur.by.ebit - prev.by.ebit) / Math.abs(prev.by.ebit), 1e-12);
  close(c.find(l => l.id === 'mdc2').deltaPerT, cur.by.mdc2 / cur.tonnes - prev.by.mdc2 / prev.tonnes, 1e-9);
  assert.ok(effectiveCoverage(d, ctx, whole('2025-10')) < 0.9, 'ottobre 2025 parziale');
  assert.equal(effectiveCoverage(d, ctx, whole('2025-09')), 1, 'settembre 2025 dallo storico');
  assert.equal(effectiveCoverage(d, ctx, whole('2026-09')), 1);
});

test('mesi chiusi: numeri congelati uguali a quelli dal vivo, null se un mese non è chiuso', () => {
  const fr = frozenFor(d, ['2026-08', '2026-09']);
  assert.ok(fr && fr.frozen);
  const live = pnlFor({ ...d, closings: [] }, ctx, { from: '2026-08-01', to: '2026-09-30' });
  for (const l of live.lines) close(fr.by[l.id], l.value, 1e-4, l.id);
  assert.equal(frozenFor(d, ['2026-09', '2026-10']), null);
  // anno precedente: storico (gen–set) e FeedOS (ott–dic), tutto congelato
  const y = pnlFor(d, ctx, { from: '2025-01-01', to: '2025-12-31' });
  assert.equal(y.frozen, true);
  assert.deepEqual([...y.sources].sort(), ['feedos', 'storico']);
  // split dei fissi coerente con l'anagrafica
  const sp = fixedSplit(fixedFor(d.fixedCosts, d.costCenters, P12), d.costCenters);
  close(sp.nonCash, fixedFor(d.fixedCosts, d.costCenters, P12).nonCash, 1e-9);
});
