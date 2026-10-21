/* FeedOS 17 · WP1 chiusura del mese: blocco dei movimenti del mese chiuso (come lo store), riapertura con nota,
 * lista di controllo bloccante, numeri congelati che non cambiano dopo una correzione, chiusure del demo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { isClosedMonth } from '../../src/core/schema.js';
import { closeMonthOps, reopenMonthOps, reopenLabel, checklist, frozenFor, snapshotMonth, frozenVsLive, closingRecord, nextToClose } from '../../src/engine/closing.js';
import { pnlFor, PNL_LINES } from '../../src/engine/pnl.js';
import { buildReport, reportMarkdown, reportCsv, commentOps, reportComments, normSection, cellValue, kpiText, REPORT_TEMPLATES } from '../../src/engine/report.js';
import { makePeriod, comparePeriod } from '../../src/core/period.js';

const today = '2026-10-16';
const d = demoData(today);
const ctx = makeCtx(d, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
// consegne di prova da un lotto di prova da 40 t: nel demo i lotti sono già tutti spediti e la regola critica di tracciabilità
// (lotto consegnato oltre il prodotto) bloccherebbe giustamente la chiusura del mese
const testLot = { kind: 'add', coll: 'lots', obj: { id: 'lt-test', code: 'L-TEST', productId: 'p-lt18', date: '2026-09-14', tonnes: 40, comp: [], status: 'rilasciato', analyses: [] } };
const ship = (date, id = 's-test') => ({ kind: 'add', coll: 'shipments', obj: { id, date, customerId: 'c-1', productId: 'p-lt18', lotId: 'lt-test', tonnes: 10, price: 360, agentId: 'ag-4' } });

test('demo: 12 chiusure dallo storico, 12 di FeedOS, il primo mese parziale annotato, chiuso fino a settembre 2026', () => {
  const st = d.closings.filter(c => c.source === 'storico'), fe = d.closings.filter(c => c.source === 'feedos');
  assert.equal(st.length, 12); assert.equal(fe.length, 12);
  assert.ok(d.closings.every(c => c.status === 'chiuso' && c.id === c.month && c.pnl && c.lines?.length === PNL_LINES.length));
  assert.equal(fe[0].month, '2025-10');
  assert.match(fe[0].note, /^Mese parziale: consegne dal 21\/10\/2025/);
  assert.equal(fe.at(-1).month, '2026-09');
  assert.equal(nextToClose(d, ctx), '2026-10');
  assert.ok(isClosedMonth(d, '2026-09-30') && !isClosedMonth(d, '2026-10-01'));
});

test('chiudere un mese blocca i movimenti di quel mese (salvo force); riaprirlo con una nota li sblocca', () => {
  // riapertura di settembre: la nota è obbligatoria e finisce nell'etichetta del registro
  assert.equal(reopenMonthOps(d, '2026-09', { note: '  ' }), null);
  const ro = reopenMonthOps(d, '2026-09', { by: 'Test', note: 'Nota di credito tardiva', at: '2026-10-16T10:00:00Z' });
  const d1 = applyOpsTo(d, ro).data;
  assert.equal(d1.settings.closedThrough, '2026-08');
  assert.equal(closingRecord(d1, '2026-09').status, 'riaperto');
  assert.equal(closingRecord(d1, '2026-09').reopenNote, 'Nota di credito tardiva');
  assert.match(reopenLabel('2026-09', 'Nota di credito tardiva'), /settembre 2026.*Nota di credito tardiva/);
  assert.equal(frozenFor(d1, ['2026-09']), null, 'riaperto: niente numeri congelati');
  // mese riaperto: si può registrare una consegna
  const r1 = applyOpsTo(d1, [testLot, ship('2026-09-15', 's-x1')]);
  assert.equal(r1.refused, null);
  // si richiude: la lista di controllo è superata
  const d2 = r1.data, ctx2 = makeCtx(d2, today);
  const items = checklist(d2, ctx2, '2026-09');
  assert.ok(items.filter(i => i.blocking).every(i => i.ok), JSON.stringify(items.filter(i => i.blocking && !i.ok)));
  const ops = closeMonthOps(d2, ctx2, '2026-09', { by: 'Test', comments: { sintesi: 'ok' }, at: '2026-10-16T11:00:00Z' });
  assert.ok(Array.isArray(ops));
  const d3 = applyOpsTo(d2, ops).data;
  assert.equal(d3.settings.closedThrough, '2026-09');
  const c = closingRecord(d3, '2026-09');
  assert.equal(c.status, 'chiuso'); assert.equal(c.comments.sintesi, 'ok'); assert.equal(c.history?.[0]?.note, 'Nota di credito tardiva');
  // la nuova consegna è nei numeri congelati
  close(c.pnl.tonnes, closingRecord(d, '2026-09').pnl.tonnes + 10, 1e-9);
  // il mese chiuso rifiuta consegne, lavorazioni e costi fissi a consuntivo; force li ammette; il budget resta modificabile
  assert.ok(applyOpsTo(d3, [ship('2026-09-20', 's-x2')]).refused);
  assert.equal(applyOpsTo(d3, [ship('2026-09-20', 's-x2')], { force: true }).refused, null);
  assert.ok(applyOpsTo(d3, [{ kind: 'add', coll: 'runs', obj: { id: 'r-x', date: '2026-09-03', tonnes: 5 } }]).refused);
  assert.ok(applyOpsTo(d3, [{ kind: 'add', coll: 'fixedCosts', obj: { id: 'fc-x', month: '2026-09', centerId: 'cc-man', kind: 'consuntivo', amount: 100 } }]).refused);
  assert.equal(applyOpsTo(d3, [{ kind: 'add', coll: 'fixedCosts', obj: { id: 'fb-x', month: '2026-09', centerId: 'cc-man', kind: 'budget', amount: 100 } }]).refused, null);
  assert.equal(applyOpsTo(d3, [ship('2026-10-02', 's-x3')]).refused, null, 'ottobre aperto');
  // il rilascio o il blocco di un lotto resta possibile (non è un movimento economico)
  assert.equal(applyOpsTo(d3, [{ kind: 'update', coll: 'lots', id: 'lt-1', patch: { status: 'bloccato' } }]).refused, null);
});

test('riaprire un mese riapre anche i successivi; la richiusura conserva origine e nota del mese', () => {
  const first = '2025-10';
  const d1 = applyOpsTo(d, reopenMonthOps(d, first, { by: 'Test', note: 'Correzione del primo mese', at: '2026-10-16T10:00:00Z' })).data;
  assert.equal(d1.settings.closedThrough, '2025-09');
  assert.ok(d1.closings.filter(c => c.month >= first).every(c => c.status === 'riaperto'), 'mesi successivi riaperti');
  assert.ok(d1.closings.filter(c => c.month < first).every(c => c.status === 'chiuso'), 'storico ancora chiuso');
  const ops = closeMonthOps(d1, makeCtx(d1, today), first, { by: 'Test', at: '2026-10-16T11:00:00Z' });
  assert.ok(Array.isArray(ops), 'il mese si richiude');
  const c = closingRecord(applyOpsTo(d1, ops).data, first);
  assert.match(c.note || '', /parziale/i); assert.equal(c.source, 'feedos');
  // un mese dello storico richiuso resta «storico»
  const h = '2025-09';
  const d2 = applyOpsTo(d, reopenMonthOps(d, h, { note: 'verifica' })).data;
  const c2 = closingRecord(applyOpsTo(d2, closeMonthOps(d2, makeCtx(d2, today), h, { by: 'Test', force: true, note: 'storico' })).data, h);
  assert.equal(c2.source, 'storico'); assert.equal(c2.status, 'chiuso');
});

test('una voce bloccante della lista di controllo impedisce la chiusura (salvo force con nota)', () => {
  const d1 = applyOpsTo(d, reopenMonthOps(d, '2026-09', { note: 'prova' })).data;
  // manca il consuntivo di un centro
  const d2 = { ...d1, fixedCosts: d1.fixedCosts.filter(f => !(f.month === '2026-09' && f.centerId === 'cc-serv' && f.kind === 'consuntivo')) };
  const ctx2 = makeCtx(d2, today);
  const it = checklist(d2, ctx2, '2026-09').find(i => i.id === 'fissi');
  assert.equal(it.ok, false); assert.equal(it.blocking, true); assert.match(it.detail, /Servizi e assicurazioni/);
  assert.equal(closeMonthOps(d2, ctx2, '2026-09'), null);
  const forced = closeMonthOps(d2, ctx2, '2026-09', { force: true, note: 'Fattura assicurazione in arrivo' });
  const snap = forced.find(o => o.coll === 'closings').objs[0];
  assert.deepEqual(snap.forced, { note: 'Fattura assicurazione in arrivo', items: ['fissi'] });
  // i mesi si chiudono in ordine e solo a mese finito
  const d3 = applyOpsTo(d, reopenMonthOps(d, '2026-08', { note: 'prova' })).data;
  assert.equal(d3.settings.closedThrough, '2026-07');
  assert.equal(closingRecord(d3, '2026-09').status, 'riaperto', 'anche i mesi dopo tornano aperti');
  assert.equal(checklist(d3, makeCtx(d3, today), '2026-09').find(i => i.id === 'prev').ok, false);
  assert.equal(closeMonthOps(d3, makeCtx(d3, today), '2026-09'), null);
  assert.equal(checklist(d, ctx, '2026-10').find(i => i.id === 'fine').ok, false, 'ottobre non è finito');
  assert.equal(closeMonthOps(d, ctx, '2026-10'), null);
});

test('i numeri congelati restano quelli della chiusura anche dopo una correzione dei costi fissi', () => {
  const before = frozenFor(d, ['2026-08']);
  assert.ok(before?.frozen);
  // correzione forzata del consuntivo di manutenzione di agosto
  const fc = d.fixedCosts.find(f => f.month === '2026-08' && f.centerId === 'cc-man' && f.kind === 'consuntivo');
  const d2 = applyOpsTo(d, [{ kind: 'update', coll: 'fixedCosts', id: fc.id, patch: { amount: fc.amount + 5000 } }], { force: true }).data;
  const after = frozenFor(d2, ['2026-08']);
  for (const l of before.lines) close(after.by[l.id], l.value, 1e-9, l.id);
  close(pnlFor(d2, ctx, { from: '2026-08-01', to: '2026-08-31' }).by.ebit, before.by.ebit, 1e-9, 'pnlFor usa i numeri congelati');
  const diff = frozenVsLive(d2, ctx, '2026-08');
  const e = diff.find(x => x.id === 'ebit');
  close(e.delta, -5000, 1e-6, 'differenza congelato / dal vivo');
});

test('fotografia del mese: forma completa e coerente con il conto economico', () => {
  const s = snapshotMonth(d, ctx, '2026-09', { by: 'Test', at: '2026-10-05T10:00:00Z', dq: 88 });
  assert.equal(s.id, '2026-09'); assert.equal(s.status, 'chiuso'); assert.equal(s.source, 'feedos'); assert.equal(s.dq, 88);
  assert.equal(s.closedBy, 'Test'); assert.equal(s.closedAt, '2026-10-05T10:00:00Z');
  const p = pnlFor({ ...d, closings: [] }, ctx, { from: '2026-09-01', to: '2026-09-30' });
  close(s.pnl.revenue, p.revenueNet, 1e-6); close(s.kpis.mdc2T, p.by.mdc2 / p.tonnes, 1e-9); close(s.kpis.ebitPct, p.by.ebit / p.revenueNet, 1e-12);
  close(s.byProduct.reduce((a, r) => a + r.mdc2, 0), p.by.mdc2, 1e-6);
  close(Object.values(s.fixed.byCenter).reduce((a, v) => a + v, 0), s.fixed.total, 1e-6);
  assert.equal(s.lines.find(l => l.id === 'ebit').value, p.by.ebit);
});

test('report CdA: sezioni nell’ordine del modello, intestazione, ponte che quadra, commenti dalla chiusura, Markdown e CSV', () => {
  const P = makePeriod('2026-09-01', '2026-09-30', { preset: 'custom', today }), C = comparePeriod(P, 'prec', today);
  // un commento salvato nella chiusura del mese compare nella sezione
  const d1 = applyOpsTo(d, commentOps(d, '2026-09', 'conto', 'Prezzi delle materie prime in salita')).data;
  assert.equal(reportComments(d1, '2026-09').conto, 'Prezzi delle materie prime in salita');
  assert.equal(closingRecord(d1, '2026-09').status, 'chiuso', 'il commento non riapre il mese');
  const r = buildReport(d1, ctx, P, C, 'cda', { comments: reportComments(d1, '2026-09') });
  const ids = r.sections.map(s => s.id);
  assert.deepEqual(ids.slice(0, 4), ['sintesi', 'conto', 'ponte', 'budget']);
  assert.deepEqual(ids, REPORT_TEMPLATES.cda.filter(id => ids.includes(id)), 'ordine del modello; le sezioni nulle si saltano');
  assert.equal(r.header.company, d.settings.company.name); assert.equal(r.header.closed, true);
  assert.equal(r.header.periodLabel, P.label); assert.equal(r.header.issuedAt, today);
  const ponte = r.sections.find(s => s.id === 'ponte');
  assert.ok(Math.abs(ponte.check) < 1e-6 * Math.max(1, Math.abs(ponte.end)));
  close(ponte.end, pnlFor(d, ctx, P).by.mdc2, 1e-4);
  const conto = r.sections.find(s => s.id === 'conto');
  assert.equal(conto.table.rows.length, PNL_LINES.length); assert.equal(conto.comment, 'Prezzi delle materie prime in salita');
  assert.ok(r.sections.every(s => Array.isArray(s.kpis) && Array.isArray(s.narrative) && s.title));
  // modello commerciale: solo le sue sezioni
  assert.ok(buildReport(d, ctx, P, C, 'commerciale').sections.every(s => REPORT_TEMPLATES.commerciale.includes(s.id)));
  const md = reportMarkdown(r);
  assert.match(md, /^# Report consiglio di amministrazione · /); assert.match(md, /## Conto economico/); assert.match(md, /> Prezzi delle materie prime in salita/);
  const csv = reportCsv(r);
  assert.ok(csv.startsWith('﻿')); assert.match(csv, /Ricavi netti/);
  // senza confronto: niente ponte
  assert.ok(!buildReport(d, ctx, P, null, 'cda').sections.some(s => s.id === 'ponte'));
});

test('report CdA: le sezioni di altri pacchetti si leggono anche con valori già formattati e colonne a funzione', () => {
  const ext = { title: 'Crediti', kpis: [{ label: 'DSO', value: '62 gg' }, { label: 'Scaduto', value: 0.184, unit: '%', decimals: 1, status: 'warn' }, null],
    table: { cols: [{ label: 'Cliente', value: r => r.n }, { key: 'eur', label: 'Scaduto', align: 'r', fmt: 'eur' }], rows: [{ n: 'Rossi; Bianchi', eur: 1200.5 }, { n: '=SOMMA(A1)', eur: 0 }] }, note: 'Fonte: partitario' };
  const s = normSection(ext, 'finanza');
  assert.equal(s.id, 'finanza'); assert.equal(s.kpis.length, 2); assert.deepEqual(s.narrative, ['Fonte: partitario']);
  assert.equal(s.table.cols[0].key, 'c0'); assert.equal(cellValue(s.table.rows[0], s.table.cols[0]), 'Rossi; Bianchi');
  assert.equal(kpiText(s.kpis[0]), '62 gg'); assert.equal(kpiText(s.kpis[1]), '18,4%');
  const r = { header: { company: 'Mangimificio; prova', periodLabel: 'settembre 2026', compareLabel: null, issuedAt: today, closed: true, dqScore: null }, sections: [{ ...s, comment: '' }] };
  const md = reportMarkdown(r);
  assert.match(md, /\| Rossi; Bianchi \| 1\.?201 € \|/); assert.match(md, /- \*\*DSO\*\*: 62 gg/);
  const csv = reportCsv(r);
  assert.match(csv, /"Mangimificio; prova"/, 'intestazione con il separatore tra virgolette');
  assert.match(csv, /'=SOMMA\(A1\)/, 'formula neutralizzata');
  assert.match(csv, /Crediti · Cliente/);
});
