/* FeedOS 17 · WP2 cassa e capitale circolante: invarianti della previsione a 13 settimane, saldo iniziale, termini dei fornitori,
 * ordini pianificati dai fabbisogni, liquidazione IVA, identità del capitale circolante. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { makeCtx, inventoryValuation } from '../../src/engine/actuals.js';
import { cashForecast, cashLowPoint, payables, supplierTerms, dueDateFor, workingCapital, workingCapitalHistory, CASH_IN, CASH_OUT, ledger } from '../../src/engine/cash.js';
import { creditSummary } from '../../src/engine/credit.js';
import { addDays, daysBetween, mondayOf, sum } from '../../src/core/util.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} contro ${b} (tolleranza ${tol})`);

test('previsione: chiusura = apertura + entrate − uscite e apertura successiva = chiusura, per 13 settimane', () => {
  const f = cashForecast(D, ctx);
  assert.equal(f.weeks.length, 13);
  console.log('cassa: ' + f.weeks.map(w => `${w.from.slice(5)} ${Math.round(w.closing / 1000)}k`).join(' · ') + ` · minimo ${Math.round(f.lowPoint.closing)} nella settimana ${f.lowPoint.week}`);
  for (let i = 0; i < f.weeks.length; i++) {
    const w = f.weeks[i];
    close(w.closing, w.opening + sum(Object.values(w.in)) - sum(Object.values(w.out)), 1e-6, 'settimana ' + i);
    close(w.headroom, w.closing + f.lines, 1e-6, 'margine');
    if (i) close(w.opening, f.weeks[i - 1].closing, 1e-9, 'apertura ' + i);
    assert.deepEqual(Object.keys(w.in), CASH_IN.map(c => c.id)); assert.deepEqual(Object.keys(w.out), CASH_OUT.map(c => c.id));
  }
  // le voci di dettaglio sommano le celle
  for (const w of f.weeks) for (const c of [...CASH_IN, ...CASH_OUT]) close(sum(f.items.filter(x => x.week === w.week && x.cat === c.id), x => x.amount), (w.in[c.id] ?? w.out[c.id]), 1e-6, `${c.id} settimana ${w.week}`);
  // settimane contigue: 0 dal giorno del saldo alla domenica, poi lunedì–domenica
  assert.equal(f.weeks[0].from, today); assert.equal(f.weeks[0].to, addDays(mondayOf(today), 6));
  for (let i = 1; i < 13; i++) assert.equal(f.weeks[i].from, addDays(f.weeks[i - 1].to, 1));
  const low = f.weeks.reduce((a, w) => (w.closing < a.closing ? w : a));
  assert.equal(f.lowPoint.week, low.week); close(f.lowPoint.closing, low.closing, 1e-9, 'punto più basso');
  assert.deepEqual(cashLowPoint(D, ctx), f.lowPoint);
  assert.ok(f.items.every(x => x.date >= f.start && x.date <= f.end), 'nessuna voce fuori dall’orizzonte');
});

test('previsione: apertura della settimana 0 = saldo impostato; senza saldo parte da zero e cashLowPoint è null', () => {
  const f = cashForecast(D, ctx);
  assert.equal(f.weeks[0].opening, D.settings.finance.cash.balance);
  assert.equal(f.weeks[0].opening, 620000);
  assert.equal(f.lines, 1500000);
  const g = { ...D, settings: { ...D.settings, finance: { ...D.settings.finance, cash: { date: null, balance: 0 } } } };
  const f0 = cashForecast(g, ctx);
  assert.equal(f0.weeks[0].opening, 0); assert.equal(f0.start, today); assert.equal(f0.balanceSet, false);
  assert.equal(cashLowPoint(g, ctx), null);
  // saldo a una data passata: la previsione parte da quella data
  const h = { ...D, settings: { ...D.settings, finance: { ...D.settings.finance, cash: { date: '2026-10-12', balance: 100000 } } } };
  const fh = cashForecast(h, ctx);
  assert.equal(fh.weeks[0].from, '2026-10-12'); assert.equal(fh.weeks[0].opening, 100000);
});

test('debiti: la scadenza segue i termini del fornitore (o quelli di base)', () => {
  const lot = D.ingLots.filter(l => l.status === 'accettato' && l.date > addDays(today, -60)).find(l => l.supplier);
  // senza anagrafica fornitori: 60 giorni data fattura fine mese (impostazioni)
  const def = supplierTerms({ ...D, suppliers: [] }, lot);
  assert.deepEqual([def.days, def.endOfMonth], [D.settings.finance.defaultSupplierDays ?? 60, true]);
  const row0 = payables({ ...D, suppliers: [] }, today).find(x => x.id === lot.id);
  assert.equal(row0.dueDate, dueDateFor(lot.date, { days: 60, endOfMonth: true }));
  close(row0.amount, lot.tonnes * lot.price * 1.1, 1e-6, 'lordo IVA');
  // con un fornitore in anagrafica: 30 giorni data consegna
  const S = { ...D, suppliers: [{ id: 'sup-x', name: lot.supplier, terms: { days: 30, endOfMonth: false } }] };
  const row = payables(S, today).find(x => x.id === lot.id);
  assert.equal(row.dueDate, addDays(lot.date, 30)); assert.equal(row.terms.source, 'fornitore');
  assert.equal(row.paid, row.dueDate < today);
  // per id del fornitore e per i giorni di base cambiati nelle impostazioni
  assert.equal(supplierTerms({ ...S, suppliers: [{ id: 'sup-y', name: 'altro', paymentDays: 90 }] }, { supplierId: 'sup-y' }).days, 90);
  assert.equal(supplierTerms({ settings: { finance: { defaultSupplierDays: 45, defaultSupplierEom: false } } }, lot).days, 45);
  // i lotti respinti non si pagano; gli ordini aperti sì, alla consegna + termini
  assert.ok(!payables(D, today).some(x => D.ingLots.find(l => l.id === x.id)?.status === 'bloccato'));
  const po = D.purchases.find(p => p.status === 'confermato');
  const rp = payables(D, today).find(x => x.id === po.id);
  assert.equal(rp.kind, 'ordine'); assert.equal(rp.dueDate, dueDateFor(po.deliveryDate, supplierTerms(D, po)));
});

test('ordini pianificati dai fabbisogni: nella settimana di data utile + consegna + termini', () => {
  const f = cashForecast(D, ctx);
  const m0 = mondayOf(f.start);
  let checked = 0;
  for (const r of ctx.mrp.rows) for (const p of r.planned) {
    const ing = D.ingredients.find(i => i.id === r.ingId);
    const due = dueDateFor(addDays(p.orderBy, p.lead), supplierTerms(D, { ingId: ing.id, supplier: ing.supplier }));
    const amount = p.qty * ing.price * 1.1;
    if (due > f.end) { continue; }
    const week = due <= f.weeks[0].to ? 0 : Math.floor(daysBetween(m0, due) / 7);
    assert.ok(f.items.some(x => x.cat === 'pianificati' && x.ingId === ing.id && x.date === due && x.week === week && Math.abs(x.amount - amount) < 1e-6), `${ing.id} ${due}`);
    checked++;
  }
  assert.ok(checked > 0, 'almeno un ordine pianificato dentro l’orizzonte');
  const out = sum(f.weeks, w => w.out.pianificati) + (f.beyond.pianificati || 0);
  close(out, sum(ctx.mrp.rows.flatMap(r => r.planned.map(p => p.qty * D.ingredients.find(i => i.id === r.ingId).price * 1.1))), 1e-3, 'tutti gli ordini pianificati, dentro o oltre l’orizzonte');
});

test('previsione: incassi esclusi insoluti e contestati; IVA solo se attivata; rate dei finanziamenti al giorno indicato', () => {
  const f = cashForecast(D, ctx);
  const L = ledger(D, f.start);
  const excl = L.open.filter(i => i.status === 'insoluta' || i.status === 'contestata');
  close(f.excluded.insolute + f.excluded.contestate, sum(excl, i => i.residual), 1e-6, 'esclusi');
  assert.ok(!f.items.some(x => x.cat === 'incassi' && excl.some(i => i.number === x.ref)));
  assert.equal(sum(f.weeks, w => w.out.iva), 0, 'IVA spenta di base');
  const v = { ...D, settings: { ...D.settings, finance: { ...D.settings.finance, vatSettlement: 'mensile' } } };
  const fv = cashForecast(v, ctx);
  assert.ok(sum(fv.weeks, w => w.out.iva) > 0, 'liquidazione mensile');
  assert.ok(fv.items.filter(x => x.cat === 'iva').every(x => x.date.endsWith('-16')));
  const rate = f.items.filter(x => x.cat === 'rate');
  assert.ok(rate.length >= 2 && rate.every(x => x.amount === 18500 && x.date.endsWith('-30')));
  assert.ok(f.items.filter(x => x.cat === 'personale').every(x => x.date.endsWith('-27')));
  assert.ok(f.items.filter(x => x.cat === 'f24').every(x => x.date.endsWith('-16')));
});

test('capitale circolante: identità e componenti', () => {
  const w = workingCapital(D, ctx, today);
  console.log(`capitale circolante ${Math.round(w.nwc)} · crediti ${Math.round(w.ar)} · MP ${Math.round(w.mp)} · PF ${Math.round(w.fg)} · debiti ${Math.round(w.ap)} · DSO ${w.dso.toFixed(1)} DIO ${w.dio.toFixed(1)} DPO ${w.dpo.toFixed(1)} CCC ${w.ccc.toFixed(1)}`);
  close(w.nwc, w.ar + w.mp + w.fg - w.ap, 1e-6, 'capitale = crediti + rimanenze − debiti');
  close(w.ccc, w.dso + w.dio - w.dpo, 1e-9, 'ciclo di cassa');
  close(w.costPerYear, w.nwc * 0.05, 1e-6, 'costo annuo al 5%');
  const cs = creditSummary(D, today);
  close(w.arInvoiced, cs.open, 1e-6, 'crediti fatturati'); close(w.arUninvoiced, cs.uninvoiced.gross, 1e-6, 'da fatturare');
  close(w.dso, cs.dso, 1e-9, 'stesso DSO dei crediti');
  const iv = inventoryValuation(D, {});
  close(w.mp, iv.mp.fifo + iv.mp.quarantine, 1, 'MP al FIFO'); close(w.fg, iv.fg.valueFull, 1, 'PF al costo pieno');
  close(w.ap, sum(payables(D, today).filter(x => x.kind === 'lotto' && !x.paid), x => x.amount), 1e-6, 'debiti non scaduti');
  close(w.dio, (w.mp + w.fg) / (w.cogs12 / 365), 1e-9, 'DIO'); close(w.dpo, w.ap / w.purchases12 * 365, 1e-9, 'DPO');
  const h = workingCapitalHistory(D, ctx, 12);
  assert.equal(h.length, 12); assert.equal(h[11].date, today);
  close(h[11].nwc, w.nwc, 1, 'ultimo mese = oggi');
  for (const x of h) close(x.nwc, x.ar + x.mp + x.fg - x.ap, 1e-6, x.month);
});
