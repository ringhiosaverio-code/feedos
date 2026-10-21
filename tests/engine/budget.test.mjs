/* FeedOS 17 · WP1 budget: creazione deterministica, totali = somma delle righe, consuntivo vs budget, stima di chiusura,
 * approvazione, segnali (scostamento da inizio anno, stima di chiusura, budget dell'anno dopo, mese da chiudere). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx, aggregateFacts, fixedFor } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { seedBudget, seedBudgetRows, budgetMonth, budgetTotals, budgetVsActual, landing, approveBudgetOps, budgetSignals, budgetStatus, versionStatus, isLocked, budgetVersions, activeVersion, nextRevision, hasBudget } from '../../src/engine/budget.js';
import { pnlFor, fixedRows } from '../../src/engine/pnl.js';
import { resolvePeriod } from '../../src/core/period.js';
import { sum } from '../../src/core/util.js';

const today = '2026-10-16';
const d = demoData(today);
const ctx = makeCtx(d, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (tolleranza ${tol})`);
const strip = ops => JSON.stringify(ops.map(o => (o.kind === 'settings' ? { kind: 'settings' } : o)));

test('demo: budget 2026 versione B approvato il 15/12/2025, fissi di budget ≈ 1,78 M€, chiuso fino a settembre', () => {
  const st = budgetStatus(d, 2026);
  assert.equal(st.status, 'approvato'); assert.equal(st.version, 'B'); assert.equal(st.approvedAt, '2025-12-15');
  assert.equal(d.settings.finance.budget.status, 'approvato');
  assert.equal(activeVersion(d, 2026), 'B');
  assert.equal(d.budget.filter(r => r.year === 2026).length % 12, 0);
  const fb = sum(d.fixedCosts.filter(f => f.kind === 'budget' && f.month.startsWith('2026-')), f => f.amount);
  close(fb, 1.78e6, 0.02e6, 'fissi di budget');
  assert.equal(d.settings.closedThrough, '2026-09');
  // la materia prima del budget viene dal costo effettivo di dicembre 2025 (≈ 244 €/t)
  const bt = budgetTotals(d, { from: '2026-01-01', to: '2026-12-31' }, 'B');
  close(bt.raw / bt.tonnes, 244, 10, 'MP €/t di budget');
});

test('seedBudget è deterministico e scrive righe e fissi in un solo passo annullabile', () => {
  const opts = { year: 2027, growthPct: { 'bovini-latte': 3 }, listDeltaPct: 2, mpDeltaPct: 1 };
  const a = seedBudget(d, ctx, opts), b = seedBudget(d, ctx, opts);
  assert.equal(strip(a), strip(b));
  const add = a.find(o => o.kind === 'addMany' && o.coll === 'budget'), fx = a.find(o => o.kind === 'addMany' && o.coll === 'fixedCosts');
  assert.ok(add.objs.length >= 12 * 8, 'righe di budget');
  assert.ok(fx.objs.every(f => f.kind === 'budget' && f.month.startsWith('2027-')));
  assert.equal(new Set(add.objs.map(r => r.id)).size, add.objs.length);
  // il listino sale dal mese 3
  const lt = add.objs.filter(r => r.productId === 'p-lt18');
  close(lt.find(r => r.month === '2027-03').list, lt.find(r => r.month === '2027-02').list * 1.02, 0.02);
  // applicato all'archivio: anche con i mesi chiusi (il budget non è un movimento)
  const r = applyOpsTo(d, a);
  assert.equal(r.refused, null);
  assert.ok(hasBudget(r.data, 2027, 'B'));
  assert.equal(budgetStatus(r.data, 2027).status, 'bozza');
  assert.equal(budgetStatus(r.data, 2026).status, 'approvato', 'il budget 2026 resta approvato');
  // rigenerare la stessa versione sostituisce, non duplica
  const r2 = applyOpsTo(r.data, seedBudget(r.data, ctx, opts));
  assert.equal(r2.data.budget.length, r.data.budget.length);
  assert.equal(r2.data.fixedCosts.length, r.data.fixedCosts.length);
  // inflazione dei fissi per centro
  const s0 = seedBudgetRows(d, ctx, { year: 2027, fixedInflPct: 0 }), s5 = seedBudgetRows(d, ctx, { year: 2027, fixedInflPct: 0, centerPct: { 'cc-pers': 5 } });
  const tot = (s, cc) => sum(s.fixed.filter(f => f.centerId === cc), f => f.amount);
  close(tot(s5, 'cc-pers'), tot(s0, 'cc-pers') * 1.05, 12);
  close(tot(s5, 'cc-dir'), tot(s0, 'cc-dir'), 0);
  assert.equal(nextRevision(d, 2026), 'R1');
});

test('i totali di budget sono la somma delle righe (mese, anno, quota di mese)', () => {
  const rows = d.budget.filter(r => r.month === '2026-05' && r.version === 'B');
  const m = budgetMonth(d, 2026, 5, 'B');
  close(m.tonnes, sum(rows, r => r.tonnes), 1e-9, 't');
  close(m.revenue, sum(rows, r => r.tonnes * r.price), 1e-6, 'ricavi');
  close(m.fixed, sum(d.fixedCosts.filter(f => f.kind === 'budget' && f.month === '2026-05'), f => f.amount), 1e-9, 'fissi');
  close(m.mc2, m.revenue - m.varCost - m.logistics - m.commission, 1e-6);
  close(m.ebit, m.mc2 - m.fixed, 1e-9);
  const y = budgetTotals(d, { from: '2026-01-01', to: '2026-12-31' }, 'B');
  close(y.tonnes, sum(d.budget.filter(r => r.year === 2026 && r.version === 'B'), r => r.tonnes), 1e-6);
  let e = 0; for (let i = 1; i <= 12; i++) e += budgetMonth(d, 2026, i, 'B').ebit;
  close(y.ebit, e, 1e-4, 'EBIT annuo');
  close(y.pnl.by.ebit, y.ebit, 1e-4, 'conto economico di budget');
  // mezzo mese: metà del budget del mese
  const h = budgetTotals(d, { from: '2026-04-01', to: '2026-04-15' }, 'B');
  close(h.revenue, budgetMonth(d, 2026, 4, 'B').revenue / 2, 1e-6);
  assert.equal(budgetTotals(d, { from: '2030-01-01', to: '2030-12-31' }), null);
});

test('consuntivo vs budget: da inizio anno = somma dei mesi chiusi + mese in corso', () => {
  const bva = budgetVsActual(d, ctx, 2026);
  assert.equal(bva.months.length, 12);
  const oct = bva.months.find(m => m.month === '2026-10');
  assert.ok(oct.open && oct.act);
  assert.equal(bva.months.find(m => m.month === '2026-11').act, null);
  const a = aggregateFacts(ctx.facts, d.salesHistory, { from: '2026-01-01', to: today }).total;
  close(bva.ytd.act.mc2, a.mc2, 1e-3, 'MdC II da inizio anno');
  close(bva.ytd.act.ebit, sum(bva.months.filter(m => m.act), m => m.act.ebit), 1e-3);
  close(bva.ytd.bud.ebit, sum(bva.months.filter(m => m.month < '2026-10'), m => m.bud.ebit) + oct.bud.ebit * 16 / 31, 1e-3, 'budget pro quota');
});

test('stima di chiusura = EBIT da inizio anno + MdC II del resto dell’anno − fissi del resto dell’anno, sotto il budget sul demo', () => {
  const L = landing(d, ctx, 2026);
  close(L.landing, L.ebitYtd + L.restMc2 - L.restFixed, 1e-6);
  const f = fixedFor(d.fixedCosts, d.costCenters, { from: '2026-01-01', to: today }).total;
  close(L.ebitYtd, aggregateFacts(ctx.facts, d.salesHistory, { from: '2026-01-01', to: today }).total.mc2 - f, 1e-4);
  assert.ok(L.p10 <= L.landing + 1e-6 && L.landing <= L.p90 + 1e-6, 'banda attorno alla stima');
  assert.ok(L.budgetEbit > 0 && L.landing < L.budgetEbit, `stima ${L.landing} sotto budget ${L.budgetEbit}`);
  close(L.gap, L.landing - L.budgetEbit, 1e-6);
  close(L.gapPerMonth * L.restMonths, L.gap, 1e-6);
  close(L.requiredPerT * L.restT, -L.gap, 1e-6);
  close(sum(L.byMonth, m => m.mc2), L.restMc2, 1e-6); close(sum(L.byMonth, m => m.fixed), L.restFixed, 1e-6);
  assert.equal(L.restFrom, '2026-10-17');
});

test('approvazione: stato «approvato» con data e nome, in settings.finance.budget', () => {
  const ops = approveBudgetOps(d, 2027, 'B', 'Mario Rossi', '2026-12-10');
  const r = applyOpsTo(d, ops).data;
  assert.deepEqual(r.settings.finance.budget, { year: 2027, version: 'B', status: 'approvato', approvedAt: '2026-12-10', approvedBy: 'Mario Rossi' });
  assert.equal(budgetStatus(r, 2027).approvedBy, 'Mario Rossi');
  assert.equal(budgetStatus(r, 2026).status, 'approvato');
});

test('segnali di budget: scostamento oltre la materialità, stima di chiusura, budget dell’anno dopo, mese da chiudere', () => {
  const s = budgetSignals(d, ctx);
  const ytd = s.find(x => x.key.startsWith('budget-ytd:'));
  assert.ok(ytd && ytd.severity === 'attenzione' && ytd.impact > 0);
  const bva = budgetVsActual(d, ctx, 2026);
  close(ytd.impact, bva.ytd.bud.ebit - bva.ytd.act.ebit, 1e-6, 'impatto = scostamento');
  assert.ok(s.find(x => x.key.startsWith('budget-landing:') && x.severity === 'critico'));
  assert.ok(s.every(x => x.area === 'direzione' && x.link?.area === 'direzione' && x.title && x.why));
  // sintetico: budget più basso del consuntivo → nessuno scostamento; materialità enorme → nessun segnale
  const low = { ...d, budget: d.budget.map(r => ({ ...r, price: r.price * 0.9 })) };
  assert.ok(!budgetSignals(low, ctx).some(x => x.key.startsWith('budget-ytd:')));
  const mat = { ...d, settings: { ...d.settings, finance: { ...d.settings.finance, materiality: { abs: 1e9, pct: 0 } } } };
  assert.ok(!budgetSignals(mat, ctx).some(x => x.key.startsWith('budget-ytd:')));
  // dopo il 15 novembre senza budget dell'anno dopo
  const nov = { ...ctx, today: '2026-11-20' };
  assert.ok(budgetSignals(d, nov).some(x => x.key === 'budget-next:2027' && x.severity === 'info'));
  assert.ok(!budgetSignals(d, ctx).some(x => x.key.startsWith('budget-next')));
  // mese precedente non chiuso dopo il giorno 5
  assert.ok(!budgetSignals(d, ctx).some(x => x.key.startsWith('close:')));
  const open = { ...d, settings: { ...d.settings, closedThrough: '2026-08' } };
  const c = budgetSignals(open, ctx).find(x => x.key === 'close:2026-09');
  assert.ok(c && c.severity === 'attenzione' && c.link.tab === 'chiusura');
  assert.ok(!budgetSignals(open, { ...ctx, today: '2026-10-04' }).some(x => x.key.startsWith('close:')));
  // archivio vuoto: nessun errore, nessun segnale
  assert.deepEqual(budgetSignals({ settings: {}, products: [], shipments: [] }, { today, facts: [] }), []);
});

test('revisione: nuova versione in bozza, il budget approvato resta il riferimento e i fissi non si sommano', () => {
  const Y = { from: '2026-01-01', to: '2026-12-31' }, P12 = resolvePeriod({ preset: '12m' }, today);
  const v = nextRevision(d, 2026);
  assert.equal(v, 'R1');
  const ops = seedBudget(d, ctx, { year: 2026, version: v, mpDeltaPct: 8, fixedInflPct: 4 });
  const r = applyOpsTo(d, ops).data;
  assert.equal(activeVersion(r, 2026), 'B'); assert.equal(budgetStatus(r, 2026).status, 'approvato');
  assert.equal(versionStatus(r, 2026, v).status, 'bozza'); assert.ok(isLocked(r, 2026, 'B') && !isLocked(r, 2026, v));
  assert.deepEqual(budgetVersions(r, 2026), ['B', v]);
  assert.equal(r.settings.finance.budget.version, 'B', 'settings.finance.budget resta la versione approvata');
  // il budget B (righe e costi fissi) non cambia
  close(budgetTotals(r, Y, 'B').ebit, budgetTotals(d, Y, 'B').ebit, 1e-6, 'EBIT di budget B');
  close(budgetTotals(r, Y, 'B').fixed, budgetTotals(d, Y, 'B').fixed, 1e-6, 'fissi di budget B');
  assert.ok(Math.abs(budgetTotals(r, Y, v).fixed - budgetTotals(r, Y, 'B').fixed) > 1000, 'R1 ha i suoi fissi');
  // ottobre (aperto) stima i fissi dal budget di riferimento, non da B + R1
  close(pnlFor(r, ctx, P12).fixedTotal, pnlFor(d, ctx, P12).fixedTotal, 1e-6, 'fissi del periodo con due versioni');
  assert.ok(fixedRows(r).filter(f => f.kind === 'budget' && f.month.startsWith('2026-')).every(f => (f.version || 'B') === 'B'));
  // la versione approvata non si rigenera
  assert.equal(seedBudget(r, ctx, { year: 2026, version: 'B' }), null);
  // approvare la revisione la rende il riferimento; B resta approvato ma superato
  const r2 = applyOpsTo(r, approveBudgetOps(r, 2026, v, 'Consiglio', '2026-10-20')).data;
  assert.equal(activeVersion(r2, 2026), v);
  assert.equal(versionStatus(r2, 2026, 'B').status, 'approvato'); assert.equal(versionStatus(r2, 2026, 'B').supersededAt, '2026-10-20');
  assert.ok(fixedRows(r2).filter(f => f.kind === 'budget' && f.month.startsWith('2026-')).every(f => f.version === v));
  const ref = r2.fixedCosts.filter(f => f.kind !== 'budget' || f.version === v);
  close(pnlFor(r2, ctx, P12).fixedTotal, fixedFor(ref, r2.costCenters, P12).total, 1e-6, 'fissi stimati dalla revisione approvata');
});
