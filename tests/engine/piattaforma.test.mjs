/* FeedOS 17 · WP7 piattaforma: catalogo dei KPI (valori, obiettivi, semafori, segnali, perdite), regole della qualità dei dati
 * e importazione guidata (abbinamento delle colonne, numeri all'italiana, anteprima, aggiornamento per chiave, controlli di tracciabilità). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { makeCtx, aggregateFacts } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { emptyData } from '../../src/core/schema.js';
import { KPIS, kpiValues, kpiValue, targetFor, statusFor, kpiSignals, topLosses, kpiHistory, kpiCoverage } from '../../src/engine/kpis.js';
import { RULES, runRules, dqSignals } from '../../src/engine/dataquality.js';
import { validateRecord, referencesTo } from '../../src/core/fields.js';
import { parseNum, parseDate, parseMonth, autoMap, preview, toOps } from '../../src/core/importers.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = { from: '2025-10-17', to: today };
const close = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

test('KPI: margine e incidenza delle materie prime coerenti con il conto economico', () => {
  const V = kpiValues(D, ctx, P12);
  const agg = aggregateFacts(ctx.facts, D.salesHistory, P12).total;
  close(V['mdc-t'], agg.mc2 / agg.tonnes, 1e-6, 'MdC II per tonnellata');
  assert.ok(Math.abs(V['quota-mp'] - 0.688) < 0.005, `incidenza delle materie prime ${V['quota-mp']}`);
  for (const k of KPIS) assert.ok(V[k.id] === null || Number.isFinite(V[k.id]), k.id);
  assert.ok(KPIS.filter(k => V[k.id] != null).length >= 20, 'almeno 20 indicatori con un valore sul demo');
});

test('KPI: nessun indicatore si interrompe su un archivio vuoto o appena avviato', () => {
  for (const d of [emptyData(), starterData()]) {
    const c = makeCtx(d, today);
    const V = kpiValues(d, c, P12);
    for (const k of KPIS) assert.ok(V[k.id] === null || Number.isFinite(V[k.id]), `${k.id} su archivio ${d.settings?.dataset}`);
    assert.ok(Array.isArray(topLosses(d, c, P12)) && Array.isArray(kpiSignals(d, c)));
  }
});

test('obiettivi: flussi proporzionati al periodo, rapporti con la media dei mesi; semafori su, giù e intervallo', () => {
  const d = { settings: { targets: { 'ricavi-netti': { target: 12e6, warn: 10e6 }, 'mdc-t': { target: 50, warn: 45 }, dso: { target: 75, warn: 85 }, 'copertura-mp-gg': { min: 10, max: 30, warn: 5 } } }, runs: [] };
  const half = targetFor(d, 'ricavi-netti', { from: '2026-03-01', to: '2026-03-16' });
  close(half.target, 1e6 * 16 / 31, 1e-9, 'mezzo marzo');
  close(targetFor(d, 'ricavi-netti', { from: '2026-01-01', to: '2026-12-31' }).target, 12e6);
  assert.equal(statusFor(d, 'mdc-t', 51), 'ok'); assert.equal(statusFor(d, 'mdc-t', 47), 'warn'); assert.equal(statusFor(d, 'mdc-t', 40), 'bad');
  assert.equal(statusFor(d, 'dso', 70), 'ok'); assert.equal(statusFor(d, 'dso', 80), 'warn'); assert.equal(statusFor(d, 'dso', 90), 'bad');
  assert.equal(statusFor(d, 'copertura-mp-gg', 20), 'ok'); assert.equal(statusFor(d, 'copertura-mp-gg', 33), 'warn'); assert.equal(statusFor(d, 'copertura-mp-gg', 40), 'bad');
  assert.equal(statusFor(d, 'hhi', 2000), null, 'senza obiettivo nessun semaforo');
  const mo = { settings: { targets: { 'mdc-t': { target: 50, monthly: { '01': 40, '02': 60 } } } }, runs: [{ date: '2026-01-10', tonnes: 300 }, { date: '2026-02-10', tonnes: 100 }] };
  close(targetFor(mo, 'mdc-t', { from: '2026-01-01', to: '2026-02-28' }).target, (40 * 300 + 60 * 100) / 400, 1e-9, 'media pesata sulle tonnellate');
});

test('KPI: un periodo senza dati operativi dà «non disponibile», non zero', () => {
  const C = { from: '2024-10-17', to: '2025-10-16' };
  assert.ok(kpiCoverage(D, ctx, 'oee', C) < 0.5);
  assert.equal(kpiValue(D, ctx, 'oee', C), null);
  assert.equal(kpiValue(D, ctx, 'utilizzo-linee', C), null);
  assert.ok(kpiValue(D, ctx, 'ricavi-netti', C) > 0, 'il venduto ha lo storico mensile');
  const h = kpiHistory(D, ctx, 'mdc-t', 13);
  assert.equal(h.length, 13); assert.ok(h.filter(x => x.value != null).length >= 12);
});

test('segnali dei KPI: due mesi chiusi fuori obiettivo; perdite in euro da almeno 4 fonti', () => {
  const s = kpiSignals(D, ctx);
  assert.ok(s.length > 0 && s.every(x => x.key.startsWith('kpi:') && x.link && x.why));
  // con obiettivi raggiungibili nessun segnale
  const easy = { ...D, settings: { ...D.settings, targets: Object.fromEntries(Object.entries(D.settings.targets).map(([k, t]) => [k, KPIS.find(x => x.id === k)?.dir === 'down' ? { target: 1e9, warn: 1e9 } : KPIS.find(x => x.id === k)?.dir === 'range' ? { min: -1e9, max: 1e9 } : { target: -1e9, warn: -1e9 }])) } };
  assert.equal(kpiSignals(easy, ctx).length, 0);
  const L = topLosses(D, ctx, P12);
  assert.ok(L.length >= 4, `fonti di perdita ${L.length}`);
  assert.ok(L.every((x, i) => x.eur > 0 && x.link && (i === 0 || L[i - 1].eur >= x.eur)));
});

test('qualità dei dati: ogni regola trova l’errore inserito e nessuno nel pulito; il demo è sopra 85', () => {
  const R = runRules(D, ctx);
  for (const id of ['R1', 'R2', 'R3', 'R8']) assert.equal(R.rules.find(r => r.id === id).failCount, 0, id);
  const expired = D.offers.filter(o => (o.status === 'bozza' || o.status === 'inviata') && o.validUntil < today).length;
  assert.equal(R.rules.find(r => r.id === 'R17').failCount, expired);
  assert.ok(R.score >= 85, `punteggio ${R.score}`);
  // errori inseriti uno per volta in una copia del demo
  const lot = D.lots[0], ship = D.shipments.find(s => s.lotId === lot.id) || D.shipments[0];
  const cases = {
    R1: d => ({ ...d, shipments: [{ ...ship, id: 'x1', lotId: 'nessuno' }, ...d.shipments] }),
    R2: d => ({ ...d, shipments: [{ ...ship, id: 'x2', productId: D.products.find(p => p.id !== lot.productId).id, lotId: lot.id }, ...d.shipments] }),
    R3: d => ({ ...d, shipments: [{ ...ship, id: 'x3', lotId: lot.id, productId: lot.productId, tonnes: lot.tonnes + 5 }, ...d.shipments] }),
    R7: d => ({ ...d, ingLots: d.ingLots.map((l, i) => (i === 0 ? { ...l, remaining: -1 } : l)) }),
    R9: d => ({ ...d, ingredients: d.ingredients.map((x, i) => (i === 0 ? { ...x, stock: -3 } : x)) }),
    R12: d => ({ ...d, specs: [{ id: 'sx', name: 'Specifica errata', constraints: [{ nut: 'PG', min: 20, max: 18 }] }, ...d.specs] }),
    R13: d => ({ ...d, offers: [{ ...d.offers[0], id: 'dup' }, ...d.offers] }),
    R14: d => ({ ...d, runs: [{ ...d.runs[0], id: 'rx', date: '2027-01-01' }, ...d.runs] }),
    R15: d => ({ ...d, customers: d.customers.map((c, i) => (i === 0 ? { ...c, agentId: null } : c)) }),
  };
  for (const [id, mk] of Object.entries(cases)) {
    const r = runRules(mk(D), ctx, { only: [id] }).rules[0];
    assert.ok(r.failCount >= 1, `${id} trova l’errore`);
    if (RULES.find(x => x.id === id).severity === 'critico') assert.equal(r.points, 0, `${id} critica azzera il peso`);
  }
  // R20: backup
  assert.equal(runRules(D, ctx, { only: ['R20'], lastBackupAt: null }).rules[0].failCount, 1);
  assert.equal(runRules(D, ctx, { only: ['R20'], lastBackupAt: '2026-10-15T10:00:00Z' }).rules[0].failCount, 0);
  assert.equal(dqSignals(D, ctx).length, 0, 'nessun errore critico sul demo');
});

test('anagrafiche: validazione dei campi e riferimenti che impediscono la cancellazione', () => {
  assert.deepEqual(validateRecord('customers', { name: 'Az. Agr. Prova', paymentDays: 60 }, D), []);
  const e = validateRecord('customers', { paymentDays: 400, agentId: 'nessuno' }, D).map(x => x.field).sort();
  assert.deepEqual(e, ['agentId', 'name', 'paymentDays']);
  assert.ok(referencesTo(D, 'customers', D.customers[0].id).some(r => r.coll === 'shipments'));
  assert.ok(referencesTo(D, 'agents', D.agents[0].id).some(r => r.coll === 'customers'));
});

test('importazione: numeri e date all’italiana, abbinamento delle colonne, aggiornamento per chiave', () => {
  assert.equal(parseNum('1.234,5'), 1234.5); assert.equal(parseNum('0.19'), 0.19); assert.equal(parseNum('1.234'), 1234); assert.equal(parseNum('12,3 %'), 12.3); assert.equal(parseNum('−5'), -5);
  assert.equal(parseDate('05/03/2026'), '2026-03-05'); assert.equal(parseDate('31/02/2026'), null); assert.equal(parseMonth('03/2026'), '2026-03'); assert.equal(parseMonth('marzo 2026'), '2026-03');
  const header = ['Ragione sociale', 'Comune', 'Provincia', 'Gg pagamento', 'Agente'];
  const m = autoMap(header, 'clienti');
  assert.deepEqual(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.col])), { name: 'Ragione sociale', city: 'Comune', province: 'Provincia', paymentDays: 'Gg pagamento', agentId: 'Agente' });
  assert.ok(Object.values(m).every(v => v.confidence >= 0.8));
  // un cliente esistente si aggiorna (per nome, senza codice) e uno nuovo si aggiunge
  const c0 = D.customers[0], ag = D.agents.find(a => a.id !== c0.agentId);
  const rows = [{ 'Ragione sociale': c0.name, Comune: c0.city, Provincia: c0.province, 'Gg pagamento': '90', Agente: ag.name }, { 'Ragione sociale': 'Az. Agr. Nuova', Comune: 'Rende', Provincia: 'CS', 'Gg pagamento': '60', Agente: ag.name }];
  const pv = preview(D, 'clienti', rows, m);
  assert.deepEqual(pv.rows.map(r => r.status), ['changed', 'new']);
  const r = applyOpsTo(D, toOps(pv));
  assert.equal(r.data.customers.length, D.customers.length + 1);
  const upd = r.data.customers.find(c => c.id === c0.id);
  assert.equal(upd.paymentDays, 90); assert.equal(upd.agentId, ag.id); assert.equal(upd.name, c0.name);
});

test('importazione delle consegne: 1.000 righe in un passo, lotti mancanti o di altri prodotti respinti per cella', () => {
  const lots = D.lots.filter(l => (D.shipments || []).filter(s => s.lotId === l.id).reduce((a, s) => a + s.tonnes, 0) < l.tonnes - 5).slice(0, 2);
  const cust = D.customers[0], prod = D.products.find(p => p.id === lots[0].productId);
  const header = ['Data', 'Cliente', 'Prodotto', 'Lotto', 'Quantità kg', 'Prezzo €/t', 'N. DDT'];
  const rows = Array.from({ length: 1000 }, (_, i) => ({ Data: '10/10/2026', Cliente: cust.code, Prodotto: prod.code, Lotto: i === 0 ? 'L-INESISTENTE' : lots[0].code, 'Quantità kg': '1,0', 'Prezzo €/t': '365,00', 'N. DDT': 'DDT-T' + i }));
  rows[1] = { ...rows[1], Lotto: D.lots.find(l => l.productId !== prod.id).code };
  const m = autoMap(header, 'consegne');
  assert.equal(m.tonnes.col, 'Quantità kg');
  const t0 = Date.now();
  const pv = preview(D, 'consegne', rows, m);
  const ops = toOps(pv);
  const r = applyOpsTo(D, ops);
  assert.ok(Date.now() - t0 < 1000, 'meno di un secondo');
  assert.equal(ops.length, 1, 'un solo passo');
  assert.ok(pv.rows[0].errors.some(e => e.field === 'lotId'), 'lotto inesistente');
  assert.ok(pv.rows[1].errors.some(e => e.field === 'lotId' && /altro prodotto/.test(e.msg)), 'lotto di un altro prodotto');
  const added = r.data.shipments.filter(s => /^DDT-T/.test(s.ddt));
  assert.equal(added.length, pv.counts.new);
  close(added[0].tonnes, 0.001); assert.equal(added[0].price, 365);
  // la stessa importazione rifatta non duplica
  const again = preview(r.data, 'consegne', rows.slice(2, 10), m);
  assert.ok(again.rows.every(x => x.status === 'same'));
});
