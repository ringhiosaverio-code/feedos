/* FeedOS 17 · WP6 produzione: tempi e OEE, calendario delle linee, valore delle perdite, segnali di produzione,
 * manutenzione (contatori, guasti, ordini di lavoro, rientro della trafila), bilancio di massa e inventari fisici. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo, revertOp } from '../../src/core/ops.js';
import { sum, addDays } from '../../src/core/util.js';
import { calendarHours, capWeek, lineDrift } from '../../src/engine/lines.js';
import { oee, oeeSummary, productionSignals, opsReportSection, idealTph, assetDue, changeovers, oeeTarget } from '../../src/engine/oee.js';
import { assetStatus, reliability, maintenanceCost, dieReplacement, workOrderOps, completeWorkOrderOps, maintenanceSummary, isOpenWo } from '../../src/engine/maintenance.js';
import { bookAt, usedBetween, integrity, countHistory, plantBalance, shrinkSummary, adjustStockOps, countOps } from '../../src/engine/massbalance.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = { from: addDays(today, -364), to: today };
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const apply = (d, ops) => { const r = applyOpsTo(d, ops); assert.ok(!r.refused, 'operazioni rifiutate'); return r; };

/* una linea da 40 h a settimana, una settimana (lun 2026-03-02): 300 t in 30 h a 12 t/h ideali, 3 t scartate */
const WEEK = { from: '2026-03-02', to: '2026-03-08' };
function mini(extra = {}) {
  return {
    lines: [{ id: 'L', name: 'Linea', capacityTph: 12, hoursWeek: 40 }],
    products: [{ id: 'p', form: 'Pellet 6 mm' }],
    lots: [{ id: 'lt', status: 'rilasciato' }],
    runs: [{ id: 'r1', date: '2026-03-03', lineId: 'L', productId: 'p', lotId: 'lt', tonnes: 300, hours: 30, waste: 3 }],
    stops: [
      { id: 's1', date: '2026-03-04', lineId: 'L', reason: 'guasto', minutes: 180 },
      { id: 's2', date: '2026-03-05', lineId: 'L', reason: 'cambio', minutes: 120 },
      { id: 's3', date: '2026-03-06', lineId: 'L', reason: 'ordini', minutes: 300 },
    ],
    settings: {}, ...extra,
  };
}

test('oee: tempi, disponibilità, prestazioni, qualità e albero delle perdite', () => {
  const o = oee(mini(), WEEK, { lineId: 'L' });
  close(o.Tturno, 40); close(o.planned, 5); close(o.Tpian, 35); close(o.Trun, 30); close(o.unplanned, 5); close(o.residual, 0);
  close(o.A, 30 / 35); close(o.P, 25 / 30); close(o.Q, 297 / 300); close(o.oee, (30 / 35) * (25 / 30) * (297 / 300));
  close(o.goodH, 297 / 12); close(o.oee, o.goodH / o.Tpian, 1e-9, 'OEE = ore a valore ÷ ore pianificate');
  // l'albero: dalle ore pianificate, togliendo le perdite, si arriva alle ore di marcia e poi alle ore a valore
  const t = o.lossTree, at = k => t.find(x => x.key === k).value;
  const toRun = t.slice(1, t.findIndex(x => x.key === 'run'));
  close(at('pian') + sum(toRun, x => x.value), at('run'));
  close(at('run') + at('speed') + at('quality'), at('va'));
  assert.ok(!o.warnPerf);
  // senza percorso la velocità ideale è la targa × fattore della trafila; con il percorso vale quello
  close(idealTph({ form: 'Pellet 3 mm' }, { id: 'L', capacityTph: 10 }), 7);
  close(idealTph({ form: 'Pellet 3 mm', routes: [{ lineId: 'L', idealTph: 8.5 }] }, { id: 'L', capacityTph: 10 }), 8.5);
});

test('calendario delle linee: festivi, straordinari e settimane parziali', () => {
  const line = { id: 'L', hoursWeek: 40, capacityTph: 10 };
  const settings = { calendar: { holidays: ['2026-03-04'], extraHours: { L: { '2026-03-02': 6 } } }, ops: { utilFactor: 0.9 } };
  close(calendarHours(line, '2026-03-02', settings), 32 + 6);
  close(calendarHours(line, '2026-03-02', settings, { from: '2026-03-02', to: '2026-03-04' }), 16 + 6 * 3 / 5, 1e-9, 'tre giorni di cui uno festivo');
  close(capWeek(line, '2026-03-02', settings), 10 * 38 * 0.9);
  // le ore di turno dell'OEE seguono il calendario
  const o = oee(mini({ settings }), WEEK, { lineId: 'L' });
  close(o.Tturno, 38);
});

test('valore delle perdite: margine sulle linee sature, costo orario sulle altre', () => {
  const S = oeeSummary(D, ctx, P12);
  assert.ok(S.plant && S.plant.oee > 0.6 && S.plant.oee < 0.9, `OEE dello stabilimento ${S.plant?.oee}`);
  assert.equal(S.target, oeeTarget(D));
  for (const [id, x] of Object.entries(S.byLine)) {
    close(x.gapH, Math.max(0, (S.target - x.oee) * x.Tpian), 1e-9, `gap ${id}`);
    close(x.gapEur, x.gapH * x.eurH, 1e-9); close(x.eurPerPoint, 0.01 * x.Tpian * x.eurH, 1e-9);
    if (!x.saturated) close(x.eurH, +D.settings?.ops?.lineCostH?.[id] || 120);
  }
  assert.ok(S.byLine.L2.saturated, 'la pellet 2 è satura nel demo');
  assert.ok(S.byLine.L2.eurH > S.byLine.L1.eurH, 'un’ora della linea satura vale il margine perso');
  // il report CdA riporta il recuperabile all'obiettivo
  const sec = opsReportSection(D, ctx, P12, null);
  const k = sec.kpis.find(x => /Recuperabile/.test(x.label));
  close(k.value, sum(Object.values(S.byLine), x => x.gapEur) / 1000, 1e-9);
});

test('segnali di produzione nel demo: deriva, carico, OEE in calo, manutenzione; nessun doppione con un ordine aperto', () => {
  const s = productionSignals(D, ctx);
  const keys = s.map(x => x.key);
  assert.ok(keys.some(k => k.startsWith('drift:L2:')), 'deriva energetica della pellet 2');
  assert.ok(keys.some(k => k.startsWith('cap:')), 'settimana oltre la capacità');
  assert.ok(keys.some(k => k.startsWith('oee:L2:')), 'OEE della pellet 2 in calo');
  const m = keys.find(k => k.startsWith('maint:'));
  assert.ok(m, 'manutenzione in scadenza');
  assert.equal(new Set(keys).size, keys.length, 'chiavi uniche');
  // con un ordine di lavoro aperto sul componente il segnale non si ripete
  const assetId = m.split(':')[1];
  const r = apply(D, workOrderOps(D, { assetId, due: addDays(today, 3), today }));
  assert.ok(!productionSignals(r.data, ctx).some(x => x.key.startsWith(`maint:${assetId}:`)));
  // la deriva del segnale è quella del motore delle linee
  const dr = lineDrift(D, today, 'L2');
  assert.ok(dr.drift > 0.07 && dr.costYear > 0);
});

test('cambi prodotto: campagne consecutive di prodotti diversi sulla stessa linea', () => {
  const runs = [{ id: 'a', lineId: 'L', productId: 'x', date: '2026-01-01' }, { id: 'b', lineId: 'L', productId: 'x', date: '2026-01-02' }, { id: 'c', lineId: 'L', productId: 'y', date: '2026-01-03' }, { id: 'd', lineId: 'M', productId: 'y', date: '2026-01-03' }];
  assert.deepEqual(changeovers(runs).map(c => `${c.from}>${c.to}`), ['x>y']);
});

test('manutenzione: contatori, scadenze, guasti, costo e ordini di lavoro', () => {
  const a = D.assets.find(x => x.id === 'as-p2-rul');
  const st = assetStatus(D, a, today);
  close(st.counter, sum(D.runs.filter(r => r.lineId === 'L2' && r.date > a.lastServiceAt && r.date <= today), r => r.tonnes));
  assert.ok(st.used > 0.9 && st.dueDate <= addDays(today, 30), `rulli della pellet 2 quasi a fine piano ${st.used}`);
  const days = assetDue(D, { id: 'x', plan: { every: 100, unit: 'giorni' }, lastServiceAt: addDays(today, -40) }, today);
  assert.equal(days.counter, 40); assert.equal(days.dueDate, addDays(today, 60));
  const rel = reliability(D, a, today);
  assert.equal(rel.failures, D.stops.filter(s => s.assetId === a.id && s.reason === 'guasto' && s.date > addDays(today, -365) && s.date <= today).length);
  if (rel.failures) assert.ok(rel.mtbf > 0 && rel.mttr > 0);
  const mc = maintenanceCost(D, a, today);
  assert.ok(mc.cost > 0 && mc.perT > 0);
  const ms = maintenanceSummary(D, today);
  assert.ok(ms.failures >= rel.failures && ms.cost >= mc.cost && ms.preventiveShare > 0.3, 'interventi preventivi programmati');
  // ordine di lavoro: si crea aperto, si chiude con costo e azzera il contatore (annullabile)
  const r1 = apply(D, workOrderOps(D, { assetId: a.id, kind: 'preventiva', due: addDays(today, 5), cost: 3400, today }));
  const wo = r1.data.tasks.find(t => t.assetId === a.id && isOpenWo(t));
  assert.ok(wo && wo.area === 'produzione' && wo.kind === 'preventiva');
  const r2 = apply(r1.data, completeWorkOrderOps(r1.data, wo.id, { date: today, cost: 3500, downMin: 300 }));
  const a2 = r2.data.assets.find(x => x.id === a.id);
  assert.equal(a2.lastServiceAt, today);
  assert.equal(assetStatus(r2.data, a2, today).counter, 0);
  assert.equal(r2.data.tasks.find(t => t.id === wo.id).status, 'fatto');
  let back = r2.data; for (const op of [...r2.done].reverse()) back = revertOp(back, op);
  assert.equal(back.assets.find(x => x.id === a.id).lastServiceAt, a.lastServiceAt);
});

test('rientro della sostituzione della trafila della pellet 2', () => {
  const x = dieReplacement(D, D.assets.find(a => a.id === 'as-p2-traf'), today);
  assert.ok(x && x.energy > 0 && x.saving >= x.energy, 'energia risparmiata');
  close(x.months, x.cost / (x.saving / 12), 1e-9);
  assert.ok(x.months > 0 && x.months < 12, `rientro in ${x.months} mesi`);
  assert.equal(dieReplacement(D, D.assets.find(a => a.kind === 'rulli'), today), null, 'solo le trafile');
});

test('bilancio di massa: libro coerente con i lotti, prelievi, nessun lotto fuori quadratura', () => {
  assert.deepEqual(integrity(D), []);
  for (const id of ['mais', 'soia44', 'premix']) {
    const lots = D.ingLots.filter(l => l.ingId === id && ['accettato', 'esaurito', 'in attesa'].includes(l.status));
    const unlinked = sum(D.adjustments.filter(a => a.ingId === id && !a.ingLotId), a => a.tonnes);
    close(bookAt(D, id, today), sum(lots, l => l.remaining) + unlinked, 1e-4, `libro di ${id}`); // residui dei lotti arrotondati al kg
  }
  const used = sum(D.lots.filter(l => l.date > '2026-06-30' && l.date <= '2026-09-30'), l => sum((l.comp || []).filter(c => c.ing === 'mais'), c => c.kg / 1000));
  close(usedBetween(D, 'mais', '2026-06-30', '2026-09-30'), used, 1e-9);
  const rows = plantBalance(D, P12);
  for (const r of rows) close(r.closingBook, bookAt(D, r.ingId, P12.to), 1e-6, `chiusura ${r.ingId}`);
});

test('conte fisiche: differenza maturata fra due conte, registrata o no', () => {
  const base = { ingredients: [{ id: 'm', name: 'Mais' }], ingLots: [{ id: 'l1', ingId: 'm', date: '2026-01-01', tonnes: 100, remaining: 40, status: 'accettato', price: 200 }],
    lots: [{ id: 'p1', date: '2026-01-15', comp: [{ l: 'l1', ing: 'm', kg: 30000 }] }, { id: 'p2', date: '2026-02-15', comp: [{ l: 'l1', ing: 'm', kg: 30000 }] }], adjustments: [], settings: {} };
  const counts = applied => [{ id: 'c1', ingId: 'm', date: '2026-01-31', measuredT: 69, bookT: 70, applied }, { id: 'c2', ingId: 'm', date: '2026-02-28', measuredT: 37.5, bookT: applied ? 39 : 40, applied: false }];
  const h1 = countHistory({ ...base, stockCounts: counts(false) }, 'm');
  close(h1[0].diff, -1); assert.equal(h1[0].incr, null);
  close(h1[1].diff, -2.5); close(h1[1].incr, -1.5, 1e-9, 'la conta non registrata resta nel libro'); close(h1[1].used, 30); close(h1[1].pct, 0.05);
  const h2 = countHistory({ ...base, stockCounts: counts(true) }, 'm');
  close(h2[1].diff, -1.5); close(h2[1].incr, -1.5, 1e-9, 'dopo la registrazione il libro riparte dal fisico');
});

test('registrazione di un inventario del demo: libro al fisico, lotti FIFO, annullabile', () => {
  const S = shrinkSummary(D, ctx, P12);
  assert.ok(S.shrinkPct > 0.0015 && S.shrinkPct < 0.005, `calo effettivo ${S.shrinkPct}`);
  assert.ok(S.unexplainedEur < 0 && S.pending > 0);
  const row = plantBalance(D, P12).find(r => r.ingId === 'mais');
  const c = D.stockCounts.find(x => x.id === row.countId);
  assert.ok(row.deltaT < 0 && !row.applied);
  // la conta di fine settembre cade in un mese chiuso: la rettifica va a oggi con la stessa differenza
  const date = today, physicalT = bookAt(D, 'mais', today) + row.deltaT;
  const ops = adjustStockOps(D, { ingId: 'mais', physicalT, date, countId: c.id });
  const r = apply(D, ops);
  close(bookAt(r.data, 'mais', today), physicalT, 1e-6);
  assert.deepEqual(integrity(r.data), [], 'i lotti restano in quadratura');
  const c2 = r.data.stockCounts.find(x => x.id === c.id);
  assert.equal(c2.applied, true); close(c2.bookT, c.bookT);
  close(sum(r.data.adjustments.filter(a => a.countId === c.id), a => a.tonnes), row.deltaT, 1e-6);
  // dopo la registrazione la materia prima non ha più differenze da registrare e il calo storico non cambia
  const after = plantBalance(r.data, P12).find(x => x.ingId === 'mais');
  assert.equal(after.pendingT, 0); close(after.lossT, row.lossT, 1e-9);
  let back = r.data; for (const op of [...r.done].reverse()) back = revertOp(back, op);
  close(bookAt(back, 'mais', today), bookAt(D, 'mais', today), 1e-9);
  // una nuova conta registra il libro del momento
  const n = apply(D, countOps(D, { ingId: 'soia44', date: today, measuredT: 100 }));
  const nc = n.data.stockCounts.find(x => x.ingId === 'soia44' && x.date === today);
  close(nc.bookT, bookAt(D, 'soia44', today), 1e-3);
});
