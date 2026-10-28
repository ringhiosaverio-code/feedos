/* FeedOS 17 · WP2 crediti: anzianità, DSO a ritroso, incassi parziali e fatture stimate, punteggio di rischio,
 * fatture stimate dalle consegne, scadenze «fine mese», sollecito, segnali e report; obiettivi del demo (seme 16). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../../src/data/demo/index.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { demoFinanza } from '../../src/data/demo/finanza.js';
import { patchViolations, applyPatch, EXTENDERS } from '../../src/data/demo/extend.js';
import { makeCtx } from '../../src/engine/actuals.js';
import {
  aging, dsoCountBack, dsoContract, creditSummary, openItems, invoicesOf, invoicesFromShipments, registerPaymentOps, allocatePaymentOps,
  riskScore, dueDateFor, dunningOps, financeSignals, financeReportSection, exposure, writeDownSuggestion, AGING_BUCKETS, ledger,
} from '../../src/engine/credit.js';
import { applyOpsTo, revertOp } from '../../src/core/ops.js';
import { resolvePeriod } from '../../src/core/period.js';
import { rng, sum, addDays } from '../../src/core/util.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} contro ${b} (tolleranza ${tol})`);
const bucketsSum = a => sum(Object.values(a.aScadere)) + sum(Object.values(a.scaduto));

test('anzianità: le fasce sommano il totale dei crediti aperti (demo e casi limite)', () => {
  const open = openItems(D, today);
  const a = aging(open, today);
  close(bucketsSum(a), a.total, 1e-6, 'somma delle fasce');
  close(a.total, sum(open, i => i.residual), 1e-6, 'totale = Σ residui');
  close(a.total, creditSummary(D, today).open, 1e-6, 'totale = crediti aperti della sintesi');
  // confini: scade oggi → a scadere 0–30; 30 giorni di scaduto → 1–30; 31 → 31–60; 91 → oltre 90; 61 giorni a scadere → oltre 60
  const x = aging([
    { residual: 1, dueDate: today }, { residual: 2, dueDate: addDays(today, -30) }, { residual: 4, dueDate: addDays(today, -31) },
    { residual: 8, dueDate: addDays(today, -91) }, { residual: 16, dueDate: addDays(today, 61) }, { residual: 32, dueDate: addDays(today, 31) },
  ], today);
  assert.deepEqual(x, { aScadere: { b0_30: 1, b31_60: 32, oltre60: 16 }, scaduto: { b1_30: 2, b31_60: 4, b61_90: 0, oltre90: 8 }, total: 63 });
  assert.equal(AGING_BUCKETS.length, 7);
  close(writeDownSuggestion(x), 2 * 0.01 + 4 * 0.05 + 8 * 0.5, 1e-12, 'svalutazione per fasce');
});

test('DSO a ritroso: caso sintetico di 3 mesi calcolato a mano', () => {
  // 10 marzo: 250 di crediti; vendite lorde marzo (10 giorni) 100, febbraio 120 (28 giorni), gennaio 90 (31 giorni)
  // marzo e febbraio si consumano interi (10 + 28 giorni), restano 30 su 90 di gennaio → 31 × 30/90
  close(dsoCountBack(250, [100, 120, 90], '2026-03-10'), 10 + 28 + 31 * 30 / 90, 1e-9, 'DSO');
  close(dsoCountBack(250, [{ month: '2026-03', gross: 100 }, { month: '2026-02', gross: 120 }, { month: '2026-01', gross: 90 }], '2026-03-10'), 48 + 1 / 3, 1e-9, 'forma con i mesi');
  close(dsoCountBack(60, [100], '2026-03-10'), 6, 1e-9, 'quota del mese in corso');
  assert.equal(dsoCountBack(0, [100], '2026-03-10'), 0);
  close(dsoCountBack(500, [100, 0, 50], '2026-03-10'), 10 + 28 + 31, 1e-9, 'serie esaurita: somma dei giorni (minimo)');
});

test('incasso parziale: stato «parziale», residuo, anzianità e DSO aggiornati; annullabile', () => {
  const inv = openItems(D, today).find(i => i.status === 'aperta' && i.daysOverdue === 0 && i.residual > 5000);
  assert.ok(inv, 'una fattura aperta non scaduta');
  const cs0 = creditSummary(D, today);
  const ops = registerPaymentOps(D, inv.id, { date: today, amount: 1000, method: 'bonifico' }, today);
  assert.deepEqual(ops.map(o => o.kind + ':' + o.coll), ['add:payments', 'update:invoices']);
  const r = applyOpsTo(D, ops);
  assert.equal(r.refused, null);
  const d1 = r.data;
  const after = d1.invoices.find(i => i.id === inv.id);
  assert.equal(after.status, 'parziale');
  close(after.paidAmount, 1000, 1e-9, 'pagato');
  const it = openItems(d1, today).find(i => i.id === inv.id);
  close(it.residual, inv.residual - 1000, 1e-6, 'residuo');
  const cs1 = creditSummary(d1, today);
  close(cs1.open, cs0.open - 1000, 1e-6, 'crediti aperti');
  close(bucketsSum(cs1.aging), cs1.open, 1e-6, 'fasce = totale dopo l’incasso');
  assert.ok(cs1.dso < cs0.dso, 'il DSO scende');
  close(cs1.byCustomer[inv.customerId].open, cs0.byCustomer[inv.customerId].open - 1000, 1e-6, 'estratto conto del cliente');
  // saldo del residuo → «pagata» e la partita sparisce
  const d2 = applyOpsTo(d1, registerPaymentOps(d1, inv.id, { date: today, amount: it.residual }, today)).data;
  assert.equal(d2.invoices.find(i => i.id === inv.id).status, 'pagata');
  assert.ok(!openItems(d2, today).some(i => i.id === inv.id));
  // annulla: un solo passo riporta l'archivio di partenza
  let back = d1;
  for (const step of [...r.done].reverse()) back = revertOp(back, step);
  assert.deepEqual(back.invoices, D.invoices); assert.deepEqual(back.payments, D.payments);
  assert.deepEqual(registerPaymentOps(D, 'non-esiste', { amount: 10 }), []);
  assert.deepEqual(registerPaymentOps(D, inv.id, { amount: 0 }), []);
});

test('fatture stimate: incasso su una stimata la registra con il numero FT e lascia stimate le altre', () => {
  const g = { ...D, invoices: [], payments: [], settings: { ...D.settings, counters: {} } };
  const est = invoicesOf(g, today);
  assert.ok(est.length > 400 && est.every(i => i.estimated && i.source === 'stimata'));
  const cs = creditSummary(g, today);
  assert.equal(cs.source, 'stimato'); assert.equal(cs.overdue, 0, 'stimate scadute = incassate per ipotesi');
  const inv = openItems(g, today).find(i => i.residual > 5000);
  const ops = registerPaymentOps(g, inv.id, { date: today, amount: 500 }, today);
  assert.deepEqual(ops.map(o => o.kind + (o.coll ? ':' + o.coll : '')), ['settings', 'add:invoices', 'add:payments']);
  const d1 = applyOpsTo(g, ops, { force: true }).data;
  assert.equal(d1.invoices.length, 1);
  const m = d1.invoices[0];
  assert.match(m.number, /^FT-26-001$/); assert.equal(m.status, 'parziale'); assert.equal(m.source, 'stimata'); assert.equal(m.estimated, undefined);
  assert.equal(d1.settings.counters['FT-2026'], 1);
  const all = invoicesOf(d1, today);
  assert.equal(all.length, est.length, 'stesse fatture: una registrata, le altre ancora stimate');
  close(creditSummary(d1, today).open, cs.open - 500, 1e-6, 'crediti aperti');
  // ripartizione FIFO su più fatture stimate del cliente: numeri consecutivi, un solo elenco di operazioni
  const cust = openItems(g, today).find(i => (creditSummary(g, today).byCustomer[i.customerId].nOpen || 0) >= 2).customerId;
  const res = allocatePaymentOps(g, cust, { date: today, amount: creditSummary(g, today).byCustomer[cust].open }, today);
  assert.ok(res.n >= 2); close(res.rest, 0, 0.01, 'tutto ripartito');
  const d2 = applyOpsTo(g, res.ops, { force: true }).data;
  assert.deepEqual(d2.invoices.map(i => i.number).sort(), Array.from({ length: res.n }, (_, i) => `FT-26-${String(i + 1).padStart(3, '0')}`));
  assert.equal(creditSummary(d2, today).byCustomer[cust].open, 0);
});

test('mese chiuso: registrare una fattura stimata o un incasso datato nel mese chiuso richiede force; nient’altro cambia', () => {
  // senza fatture registrate e con settembre chiuso: la fattura stimata di fine agosto cade in un mese chiuso
  const g = { ...D, invoices: [], payments: [], settings: { ...D.settings, counters: {}, closedThrough: '2026-09' } };
  const inv = openItems(g, today).find(i => i.date <= '2026-09-30' && i.residual > 5000);
  assert.ok(inv, 'una fattura stimata di un mese chiuso ancora da incassare');
  const ops = registerPaymentOps(g, inv.id, { date: today, amount: 1000 }, today);
  const no = applyOpsTo(g, ops);
  assert.ok(no.refused && no.refused.coll === 'invoices', 'senza force la registrazione nel mese chiuso è rifiutata');
  assert.equal(no.data, g, 'tutto o niente: archivio invariato');
  const ok = applyOpsTo(g, ops, { force: true });
  assert.equal(ok.refused, null);
  const m = ok.data.invoices[0];
  assert.equal(m.status, 'parziale'); close(m.total, inv.total, 1e-9, 'stesso importo della stimata');
  for (const k of ['shipments', 'lots', 'runs', 'fixedCosts', 'customers']) assert.equal(ok.data[k], g[k], k + ' invariati: nessun valore economico cambia');
  close(creditSummary(ok.data, today).open, creditSummary(g, today).open - 1000, 1e-6, 'crediti aperti');
  // fattura vera: l'incasso datato in un mese aperto aggiorna solo campi non protetti (nessun rifiuto);
  // datato in un mese chiuso serve force, come fa la finestra «Registra incasso»
  const real = { ...D, settings: { ...D.settings, closedThrough: '2026-09' } };
  const it = openItems(real, today).find(i => !i.estimated && i.date <= '2026-08-31' && i.residual > 5000);
  assert.ok(it);
  assert.equal(applyOpsTo(real, registerPaymentOps(real, it.id, { date: today, amount: 500 }, today)).refused, null);
  const back = registerPaymentOps(real, it.id, { date: '2026-09-28', amount: 500 }, today);
  assert.ok(applyOpsTo(real, back).refused, 'incasso datato nel mese chiuso: rifiutato senza force');
  assert.equal(applyOpsTo(real, back, { force: true }).refused, null);
});

test('fatture importate incomplete e senza consegne: scadenza dai termini, totale da imponibile + IVA, DSO dalle fatture', () => {
  const customers = [{ id: 'k1', name: 'Cliente uno', paymentDays: 60 }, { id: 'k2', name: 'Cliente due', terms: { days: 30, endOfMonth: false } }];
  const invoices = [
    { id: 'i1', number: 'FT-26-001', customerId: 'k1', date: '2026-07-31', taxable: 10000 },
    { id: 'i2', number: 'FT-26-002', customerId: 'k1', date: '2026-08-31', taxable: 20000, vat: 2000 },
    { id: 'i3', number: 'FT-26-003', customerId: 'k2', date: '2026-09-10', total: 5500, dueDate: '2026-10-10' },
  ];
  const g = { settings: { finance: { vatPct: 10 } }, customers, invoices, payments: [], shipments: [] };
  assert.deepEqual(openItems(g, today).map(i => [i.id, i.dueDate, i.total]), [['i1', '2026-09-30', 11000], ['i3', '2026-10-10', 5500], ['i2', '2026-10-31', 22000]]);
  const cs = creditSummary(g, today);
  close(cs.open, 38500, 1e-9, 'aperti'); close(cs.overdue, 16500, 1e-9, 'scaduto');
  close(bucketsSum(cs.aging), cs.open, 1e-9, 'fasce = totale');
  // a ritroso sulle fatture: ottobre 0 € (16 gg), settembre 5.500 (30), agosto 22.000 (31), luglio 11.000 consumato per intero (31)
  close(cs.dso, 108, 1e-9, 'DSO dalle fatture');
  close(cs.dsoContract, (10000 * 60 + 20000 * 60 + 5500 * 30) / 35500, 1e-9, 'DSO contrattuale dagli imponibili');
  const ops = registerPaymentOps(g, 'i1', { date: today, amount: 11000 }, today);
  assert.equal(ops.find(o => o.kind === 'update').patch.status, 'pagata', 'saldo sul totale calcolato');
});

test('punteggio di rischio: componenti sommate e classe attesa', () => {
  const r = riskScore({ exposure: 100000, overdue60: 40000, avgDelay: 30, delay3: 40, delay12: 30, util: 1.2, insoluta: true });
  assert.deepEqual(r.parts.map(p => Math.round(p.points * 100) / 100), [14, 12.5, 15, 15, 10]);
  close(r.score, sum(r.parts, p => p.points), 1e-12, 'somma');
  close(r.score, 66.5, 1e-9, 'punteggio'); assert.equal(r.cls, 'D');
  const r2 = riskScore({ exposure: 100000, overdue60: 40000, avgDelay: 30, delay3: 33, delay12: 30, util: 1.2, insoluta: true });
  assert.equal(r2.parts[2].points, 0, 'peggioramento entro 5 giorni: nessun punto'); assert.equal(r2.cls, 'C');
  assert.equal(riskScore({ exposure: 50000, avgDelay: 1, util: 0.8 }).cls, 'A');
  assert.equal(riskScore({ exposure: 50000, avgDelay: 30, util: 1 }).cls, 'B'); // 12,5 + 15
  assert.equal(riskScore({}).score, 0);
});

test('fatture stimate: imponibile = Σ consegne del cliente nel mese; IVA e scadenza dai termini', () => {
  const g = generateDemo({ today });
  const invs = invoicesFromShipments(g, { today });
  const inv = invs.find(i => i.customerId === 'c-r3' && i.month === '2026-09');
  const ships = g.shipments.filter(s => s.customerId === 'c-r3' && s.date.startsWith('2026-09'));
  assert.ok(ships.length > 2);
  close(inv.taxable, sum(ships, s => s.tonnes * s.price), 0.006, 'imponibile');
  assert.deepEqual([...inv.ddts].sort(), ships.map(s => s.id).sort());
  close(inv.vat, inv.taxable * 0.1, 0.006, 'IVA 10%'); close(inv.total, inv.taxable + inv.vat, 1e-9, 'totale');
  assert.equal(inv.date, '2026-09-30');
  assert.equal(inv.dueDate, dueDateFor('2026-09-30', { days: g.customers.find(c => c.id === 'c-r3').paymentDays, endOfMonth: true }));
  assert.equal(inv.method, 'bonifico', 'rivendita: bonifico');
  assert.ok(!invs.some(i => i.month === '2026-10'), 'il mese in corso resta da fatturare');
  assert.ok(invoicesFromShipments(g, { today, months: ['2026-09'] }).every(i => i.month === '2026-09'));
});

test('scadenza «data fattura fine mese»: mesi interi per 30/60/90, altrimenti data + giorni e fine mese', () => {
  assert.equal(dueDateFor('2026-01-31', { days: 60, endOfMonth: true }), '2026-03-31');
  assert.equal(dueDateFor('2026-01-31', { days: 30 }), '2026-02-28');
  assert.equal(dueDateFor('2028-01-31', { days: 30 }), '2028-02-29');
  assert.equal(dueDateFor('2026-08-31', { days: 120 }), '2026-12-31');
  assert.equal(dueDateFor('2026-01-15', { days: 45 }), '2026-03-31'); // 15/01 + 45 = 01/03 → fine mese
  assert.equal(dueDateFor('2026-01-31', { days: 60, endOfMonth: false }), '2026-04-01');
  assert.equal(dueDateFor('2026-12-31', { days: 60 }), '2027-02-28');
});

test('demo: obiettivi del seme 16 (crediti, scaduto, DSO, fidi, classe D con insoluto)', () => {
  const cs = creditSummary(D, today);
  console.log(`crediti aperti ${Math.round(cs.open)} · scaduto ${Math.round(cs.overdue)} · DSO ${cs.dso.toFixed(1)} contro ${cs.dsoContract.toFixed(1)} · oltre fido ${cs.overLimit} · classi ${JSON.stringify(cs.classes)}`);
  assert.ok(cs.open > 4.4e6 && cs.open < 4.6e6, 'crediti aperti 4,4–4,6 M€');
  assert.ok(cs.overdue > 0.55e6 && cs.overdue < 0.75e6, 'scaduto ≈ 0,6 M€');
  assert.ok(cs.dso >= 85 && cs.dso <= 90, 'DSO a ritroso 85–90');
  assert.ok(cs.dsoContract >= 74 && cs.dsoContract <= 76, 'DSO contrattuale 74–76');
  close(cs.dsoContract, dsoContract(D, { from: addDays(today, -364), to: today }), 1e-9, 'contrattuale sui 12 mesi');
  const rows = Object.values(cs.byCustomer);
  assert.ok(rows.filter(b => b.util != null && b.util >= 1).length >= 2, 'almeno 2 clienti oltre il fido');
  // oltre il fido col solo credito (senza le offerte da consegnare): esattamente i 2 clienti cresciuti di più, fido a 0,85 × credito
  const credOver = rows.filter(b => b.creditLimit && b.open + b.uninvoiced >= b.creditLimit);
  assert.equal(credOver.length, 2, 'due clienti oltre il fido col solo credito');
  for (const b of credOver) assert.equal(b.creditLimit, Math.floor(0.85 * (b.open + b.uninvoiced) / 5000) * 5000);
  assert.ok(D.customers.every(c => c.creditLimit == null || (c.creditLimit >= 5000 && c.creditLimit % 5000 === 0)), 'fidi a multipli di 5.000 €');
  assert.ok(rows.some(b => b.riskClass === 'D' && b.insoluta), 'almeno un cliente di classe D con insoluto');
  assert.equal(D.invoices.filter(i => i.status === 'insoluta').length, 3);
  assert.ok(D.invoices.every(i => i.source === 'demo' && /^FT-\d{2}-\d{3}$/.test(i.number)));
  assert.equal(D.settings.counters['FT-2026'], D.invoices.filter(i => i.number.startsWith('FT-26-')).length);
  assert.equal(cs.source, 'fatture');
  // esposizione del cliente = aperti + da fatturare + offerte accettate da consegnare
  for (const [id, b] of Object.entries(cs.byCustomer).slice(0, 10)) close(exposure(D, id, today), b.exposure, 1e-6, 'esposizione ' + id);
  for (const b of rows) close(b.exposure, b.open + b.uninvoiced + b.offers, 1e-6, 'componenti dell’esposizione');
});

test('partitario a una data passata: le consegne del mese sono «da fatturare» finché la fattura di fine mese non esiste', () => {
  const at = '2026-09-15';
  const L = ledger(D, at);
  assert.ok(!L.open.some(i => i.date > at), 'nessuna fattura successiva alla data');
  assert.equal(invoicesOf(D, at).filter(i => i.estimated).length, 0, 'i mesi chiusi sono coperti da fatture vere');
  const [id] = Object.entries(L.byCust).find(([, b]) => b.uninvN > 2);
  const ships = D.shipments.filter(s => s.customerId === id && s.date >= '2026-09-01' && s.date <= at);
  close(L.byCust[id].uninvGross, sum(ships, s => s.tonnes * s.price) * 1.1, 1e-6, 'da fatturare al 15/09');
  // a fine mese la fattura esiste: niente più da fatturare per quel mese
  assert.ok(!ledger(D, '2026-09-30').uninvoiced.list.some(g => g.month === '2026-09'));
});

test('estensore del demo: deterministico, solo aggiunte, insoluti anche con un’ancora di inizio anno', () => {
  // archivio cumulativo come in extend.js: generatore + estensori che precedono la finanza
  let g = generateDemo({ today });
  for (const [name, fn, off] of EXTENDERS) { if (name === 'finanza') break; g = applyPatch(g, fn(g, { today, R: rng(16 + off) })); }
  const p1 = demoFinanza(g, { today, R: rng(16 + 301) }), p2 = demoFinanza(g, { today, R: rng(16 + 301) });
  assert.equal(JSON.stringify(p1), JSON.stringify(p2));
  assert.deepEqual(patchViolations(g, p1), []);
  assert.equal(p1.settings.finance.cash.balance, 620000);
  assert.deepEqual(p1.settings.finance.creditLines.map(l => l.limit), [800000, 700000]);
  assert.deepEqual(demoFinanza({ customers: [], shipments: [] }, { today }), {});
  assert.equal(JSON.stringify(p1.add.invoices), JSON.stringify(D.invoices), 'lo stesso estensore di demoData');
  // profili: 3 insoluti (giugno), metodo per tipo di cliente, termini come i giorni di pagamento
  assert.equal(p1.add.invoices.filter(i => i.status === 'insoluta').length, 3);
  assert.ok(p1.add.invoices.filter(i => i.status === 'insoluta').every(i => i.dueDate.slice(0, 7) === '2026-06'));
  const typ = Object.fromEntries(g.customers.map(c => [c.id, c.type]));
  assert.ok(p1.add.invoices.every(i => i.method === (typ[i.customerId] === 'rivendita' ? 'bonifico' : 'riba')));
  assert.ok(p1.update.customers.every(u => u.terms.days === g.customers.find(c => c.id === u.id).paymentDays && u.terms.endOfMonth === true));
  assert.ok(!p1.add.invoices.some(i => i.month === today.slice(0, 7)), 'il mese in corso resta da fatturare');
  // ancora a marzo: l'insoluto è quello di giugno dell'anno prima
  const t2 = '2027-03-03', g2 = generateDemo({ today: t2 });
  const ins2 = demoFinanza(g2, { today: t2, R: rng(16 + 301) }).add.invoices.filter(i => i.status === 'insoluta');
  assert.equal(ins2.length, 3); assert.ok(ins2.every(i => i.dueDate >= '2026-06-01' && i.dueDate < '2026-09-01'), ins2.map(i => i.dueDate).join());
});

test('sollecito: attività dell’Amministrazione con lo scaduto; nulla senza scaduto', () => {
  const cs = creditSummary(D, today);
  const [id] = Object.entries(cs.byCustomer).find(([, b]) => b.overdue > 1000);
  const ops = dunningOps(D, id, today);
  assert.equal(ops.length, 1);
  const t = ops[0].obj;
  assert.equal(ops[0].coll, 'tasks'); assert.equal(t.area, 'finanza'); assert.equal(t.owner, 'Amministrazione');
  close(t.amount, cs.byCustomer[id].overdue, 0.01, 'importo');
  assert.deepEqual(t.link, { area: 'finanza', tab: 'crediti', id });
  const [ok] = Object.entries(cs.byCustomer).find(([, b]) => b.overdue === 0 && b.open > 0);
  assert.deepEqual(dunningOps(D, ok, today), []);
});

test('segnali di finanza e sezione del report', () => {
  const s = financeSignals(D, { ...ctx, today });
  assert.ok(s.length > 0);
  assert.equal(new Set(s.map(x => x.key)).size, s.length, 'chiavi uniche');
  for (const x of s) { assert.equal(x.area, 'finanza'); assert.ok(['critico', 'attenzione', 'info'].includes(x.severity)); assert.ok(x.title && x.why && x.action && x.link); }
  assert.ok(s.some(x => x.key.startsWith('scaduto:')));
  // credito oltre il fido (senza offerte) → critico; cassa oltre le linee → critico
  const cs = creditSummary(D, today);
  const [id, b] = Object.entries(cs.byCustomer).find(([, x]) => x.open > 50000);
  const tight = { ...D, customers: D.customers.map(c => (c.id === id ? { ...c, creditLimit: Math.round(b.open / 2) } : c)), settings: { ...D.settings, finance: { ...D.settings.finance, cash: { date: today, balance: -3e6 } } } };
  const s2 = financeSignals(tight, { ...ctx, today });
  assert.ok(s2.some(x => x.key === `fido:${id}` && x.severity === 'critico'));
  assert.ok(s2.some(x => x.key.startsWith('cassa:linee') && x.severity === 'critico'));
  // archivio vuoto: nessun segnale
  assert.deepEqual(financeSignals({ settings: {}, customers: [], shipments: [], invoices: [], ingredients: [], ingLots: [] }, { today }), []);
  const P = resolvePeriod({ preset: '12m' }, today), C = resolvePeriod({ preset: 'mese-chiuso' }, today);
  const sec = financeReportSection(D, ctx, P, C);
  assert.equal(sec.id, 'finanza'); assert.equal(sec.order, 50);
  assert.ok(sec.kpis.length >= 5 && sec.narrative.length >= 3);
  const rows = sec.table.rows;
  close(sum(rows.slice(0, -1), r => r.amount), rows[rows.length - 1].amount, 1e-6, 'righe dell’anzianità = totale');
  assert.equal(financeReportSection({ settings: {}, shipments: [], invoices: [] }, { today }, P, null), null);
});
