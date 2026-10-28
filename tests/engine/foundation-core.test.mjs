/* FeedOS 17 · fondamenta (F1, F2, F6, F12): schema 17 e migrazioni, avvio sicuro, preferenze, operazioni
 * dello store con blocco dei mesi chiusi e annulla/ripeti, numerazione dei documenti, utilità di data e CSV. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { todayLocal, endOfMonth, addMonths, monthStart, quarterOf, iso } from '../../src/core/util.js';
import { num, toCSV } from '../../src/core/io.js';
import { SCHEMA_VERSION, COLLECTIONS, DEFAULT_SETTINGS, MIGRATIONS, emptyData, migrateData, validateShape, isClosedMonth, schemaOf } from '../../src/core/schema.js';
import { applyOpsTo, revertOp, reapplyOp, CLOSABLE, CLOSED_MSG } from '../../src/core/ops.js';
import { nextCode, nextCodes, parseCode } from '../../src/core/codes.js';
import { getPrefs, setPrefs, seedPrefs, subscribePrefs, PREF_DEFAULTS } from '../../src/core/prefs.js';
import { generateDemo, DEMO_VERSION } from '../../src/data/demo/generator.js';
import { upgradeDemo, demoData, starterData } from '../../src/data/demo/index.js';

const idb = fakeIndexedDB();
globalThis.indexedDB = idb; // prima di qualsiasi apertura di core/persist.js

/** Archivio come lo salvava FeedOS 16 (il generatore ora produce lo schema 17): senza raccolte e impostazioni del 17. */
function asSchema16(g) {
  const d = { ...g, settings: { ...g.settings, schema: 16, company: { ...g.settings.company } } };
  for (const c of COLLECTIONS.slice(23)) delete d[c];
  for (const k of Object.keys(DEFAULT_SETTINGS)) delete d.settings[k];
  delete d.settings.company.lat; delete d.settings.company.lon;
  return d;
}

/* ---------------- utilità di data, numeri e CSV ---------------- */
test('todayLocal usa il giorno locale, iso resta in UTC', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Rome';
  try {
    const t = new Date('2026-10-15T22:30:00Z'); // 00:30 del 16/10 a Roma
    assert.equal(todayLocal(t), '2026-10-16');
    assert.equal(iso(t), '2026-10-15');
    assert.equal(todayLocal(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
    assert.match(todayLocal(), /^\d{4}-\d{2}-\d{2}$/);
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});

test('endOfMonth, monthStart, addMonths e quarterOf ai bordi', () => {
  assert.equal(endOfMonth('2028-02-03'), '2028-02-29');
  assert.equal(endOfMonth('2026-02'), '2026-02-28');
  assert.equal(endOfMonth('2100-02-10'), '2100-02-28', 'il 2100 non è bisestile');
  assert.equal(endOfMonth('2026-12-31'), '2026-12-31');
  assert.equal(endOfMonth('2026-04-01'), '2026-04-30');
  assert.equal(monthStart('2026-02-17'), '2026-02-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  assert.equal(addMonths('2026-01-15', -13), '2024-12-15');
  assert.equal(addMonths('2026-05-31', 0), '2026-05-31');
  assert.equal(addMonths('2026-10', -12), '2025-10');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(quarterOf('2026-08-14'), '2026-Q3');
  assert.equal(quarterOf('2026-01-01'), '2026-Q1');
  assert.equal(quarterOf('2026-12'), '2026-Q4');
});

test('io.num legge i formati italiano e internazionale', () => {
  assert.equal(num('0.19'), 0.19);
  assert.equal(num('0,19'), 0.19);
  assert.equal(num('12.5'), 12.5);
  assert.equal(num('1.234,5'), 1234.5);
  assert.equal(num('1,234.5'), 1234.5);
  assert.equal(num('12,3 %'), 12.3);
  assert.equal(num(''), null);
  assert.equal(num('abc'), null);
});

test('toCSV neutralizza le celle che sembrano formule', () => {
  const rows = [
    { a: '=SOMMA(A1:A9)', b: -5 }, { a: '+39 333 1234567', b: 0.19 }, { a: '-2+3', b: '-12,5' },
    { a: '@cmd', b: '+7' }, { a: 'normale', b: 'a=b' }, { a: '\tTAB', b: null },
  ];
  const lines = toCSV(rows, [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]).replace(/^﻿/, '').split('\r\n');
  assert.deepEqual(lines, ['A;B', "'=SOMMA(A1:A9);-5", "'+39 333 1234567;0,19", "'-2+3;-12,5", "'@cmd;+7", 'normale;a=b', "'\tTAB;"]);
});

/* ---------------- schema 17 ---------------- */
test('schema 17: raccolte, impostazioni di base, archivio vuoto', () => {
  assert.equal(SCHEMA_VERSION, 17);
  assert.equal(COLLECTIONS.length, 113, '23 di base + 14 dello schema 17 + 63 della fondazione 18 + 13 dell’edizione agrofarmaci');
  for (const c of ['costCenters', 'fixedCosts', 'budget', 'closings', 'salesHistory', 'invoices', 'payments', 'suppliers', 'priceLists', 'stops', 'assets', 'stockCounts', 'adjustments', 'standards']) assert.ok(COLLECTIONS.includes(c), c);
  const e = emptyData();
  assert.equal(e.settings.schema, 17);
  for (const k of ['theme', 'size', 'role']) assert.ok(!(k in e.settings), 'niente ' + k + ' nei dati');
  assert.equal(e.settings.finance.vatPct, 10);
  assert.equal(e.settings.ops.utilFactor, 0.9);
  assert.equal(e.settings.closedThrough, null);
  assert.equal(e.settings.visitCost, 40);
  assert.equal(e.settings.company.lat, null);
  assert.ok(validateShape(e).ok);
  e.settings.finance.loans.push({ name: 'x' });
  assert.equal(DEFAULT_SETTINGS.finance.loans.length, 0, 'le impostazioni di base non sono condivise');
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.finance));
  assert.equal(MIGRATIONS[0].from, 16);
});

test('migrazione 16 → 17: aggiunge, fonde, sposta le preferenze e non tocca l’originale', () => {
  const g = asSchema16(generateDemo({ today: '2026-09-23' }));
  const old = { ...g, settings: { ...g.settings, theme: 'dark', size: 'aula', role: 'acquisti', finance: { rate: 7 }, ops: { utilFactor: 0.85 } } };
  const m = migrateData(old);
  assert.equal(m.from, 16); assert.equal(m.to, 17);
  assert.deepEqual(m.applied, ['Schema 17: controllo di gestione, finanza e operations']);
  assert.deepEqual(m.prefsSeed, { theme: 'dark', size: 'aula', role: 'acquisti' });
  const s = m.data.settings;
  assert.equal(s.schema, 17);
  for (const k of ['theme', 'size', 'role']) assert.ok(!(k in s), k + ' tolto dai dati');
  assert.equal(s.finance.rate, 7, 'valore esistente conservato');
  assert.equal(s.finance.vatPct, 10, 'valore mancante aggiunto');
  assert.deepEqual(s.finance.materiality, { pct: 2, abs: 5000 });
  assert.equal(s.ops.utilFactor, 0.85); assert.equal(s.ops.releaseDays, 2);
  assert.deepEqual(s.logistics, { mode: 'standard', perDrop: 35, perKm: 1.8, roadFactor: 1.3 });
  assert.deepEqual(s.calendar, { holidays: [], extraHours: {} });
  assert.equal(s.closedThrough, null); assert.deepEqual(s.counters, {});
  assert.equal(s.company.lat, null); assert.equal(s.company.name, g.settings.company.name);
  for (const c of COLLECTIONS) assert.ok(Array.isArray(m.data[c]), c);
  assert.equal(m.data.shipments, old.shipments, 'le raccolte esistenti restano le stesse');
  assert.equal(old.settings.theme, 'dark', 'originale intatto');
  assert.equal(old.settings.schema, 16);
  assert.equal(old.costCenters, undefined);
  assert.ok(validateShape(m.data).ok, validateShape(m.data).errors.join('; '));
  const again = migrateData(m.data);
  assert.deepEqual(again.applied, [], 'idempotente');
  assert.equal(again.data.settings.finance, m.data.settings.finance);
});

test('migrazione: senza settings.schema ma con le formule vale 16; schemi sconosciuti o futuri rifiutati', () => {
  assert.equal(schemaOf({ formulas: [] }), 16);
  const m = migrateData({ formulas: [{ id: 'f1' }], settings: { company: { name: 'X' } } });
  assert.equal(m.from, 16); assert.equal(m.data.settings.schema, 17); assert.equal(m.data.settings.company.name, 'X');
  assert.throws(() => migrateData({ settings: { schema: 99 }, formulas: [] }), /SCHEMA_FUTURO/);
  assert.throws(() => migrateData({ settings: { schema: 18 } }), /SCHEMA_FUTURO/);
  assert.throws(() => migrateData({ foo: 1 }), /FORMATO_SCONOSCIUTO/);
  assert.throws(() => migrateData(null), /FORMATO_SCONOSCIUTO/);
  assert.throws(() => migrateData({ settings: { schema: 15 }, formulas: [] }), /SCHEMA_NON_SUPPORTATO/);
  const e = emptyData();
  const same = migrateData(e);
  assert.deepEqual(same.applied, []); assert.equal(same.from, 17);
});

test('il demo (schema 17) e l’aggiornamento di un demo salvato da una versione precedente', () => {
  const d = demoData('2026-09-23');
  assert.equal(d.settings.schema, 17);
  assert.ok(!('theme' in d.settings) && !('role' in d.settings), 'il demo non porta preferenze');
  const m = migrateData(d);
  assert.deepEqual(m.applied, [], 'il demo è già allo schema corrente');
  assert.equal(m.data.settings.schema, 17);
  assert.ok(validateShape(m.data).ok);
  // archivio dimostrativo salvato da una versione precedente (schema 16, demo 1): migrazione, poi passi del demo
  const old = { ...asSchema16(d), water: [], waste: [], survey: {} }; old.settings = { ...old.settings, demoVersion: 1, theme: 'light' };
  const up = upgradeDemo(migrateData(old).data);
  assert.equal(up.settings.demoVersion, DEMO_VERSION);
  assert.equal(up.settings.schema, 17);
  assert.ok(up.water.length > 0 && up.waste.length > 0);
  assert.ok(Array.isArray(up.costCenters));
  assert.equal(up.costCenters.length, 8, 'estensori applicati all’aggiornamento');
  assert.ok(up.adjustments.length > 0, 'rettifiche che chiudono il bilancio di massa');
  const mine = migrateData(starterData()).data;
  assert.equal(upgradeDemo(mine), mine);
  assert.equal(starterData().settings.schema, 17);
});

test('validateShape segnala oggetti, id e duplicati', () => {
  const d = emptyData();
  d.settings = [];
  d.customers = [{ id: 'c1' }, { id: 'c1' }, { name: 'senza id' }, { id: 7 }, 'x'];
  d.lots = {};
  const r = validateShape(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.startsWith('settings')));
  assert.ok(r.errors.some(e => e.includes('customers') && e.includes('duplicato')));
  assert.ok(r.errors.some(e => e === 'customers[2]: id mancante o non testuale'));
  assert.ok(r.errors.some(e => e === 'customers[3]: id mancante o non testuale'));
  assert.ok(r.errors.some(e => e === 'customers[4]: non è un oggetto'));
  assert.ok(r.errors.some(e => e === 'lots: deve essere un elenco'));
  assert.deepEqual(validateShape('x'), { ok: false, errors: ['L’archivio non è un oggetto'] });
  const many = emptyData(); many.events = Array.from({ length: 150 }, () => ({}));
  assert.equal(validateShape(many).errors.length, 101, 'elenco troncato');
});

test('isClosedMonth', () => {
  const d = { settings: { closedThrough: '2026-08' } };
  assert.equal(isClosedMonth(d, '2026-08-31'), true);
  assert.equal(isClosedMonth(d, '2026-01-10'), true);
  assert.equal(isClosedMonth(d, '2026-08'), true);
  assert.equal(isClosedMonth(d, '2026-09-01'), false);
  assert.equal(isClosedMonth(d, null), false);
  assert.equal(isClosedMonth(d, undefined), false);
  assert.equal(isClosedMonth({ settings: { closedThrough: null } }, '2020-01-01'), false);
  assert.equal(isClosedMonth({ settings: {} }, '2020-01-01'), false);
});

/* ---------------- operazioni e mesi chiusi ---------------- */
const base = () => {
  const d = emptyData();
  d.settings.closedThrough = '2026-08';
  d.shipments = [
    { id: 's1', date: '2026-08-10', tonnes: 10, price: 400, customerId: 'c1', note: '' },
    { id: 's2', date: '2026-09-05', tonnes: 12, price: 410, customerId: 'c2', note: '' },
  ];
  d.fixedCosts = [{ id: 'fc1', month: '2026-07', centerId: 'cc-pers', amount: 50000 }];
  d.offers = [{ id: 'o1', date: '2026-08-01', code: 'OF-26-101' }];
  return d;
};

test('mese chiuso: aggiunte, modifiche e cancellazioni rifiutate se non forzate', () => {
  const d = base();
  assert.deepEqual(Object.keys(CLOSABLE), ['shipments', 'runs', 'fixedCosts', 'invoices', 'payments', 'adjustments']);
  let r = applyOpsTo(d, [{ kind: 'add', coll: 'shipments', obj: { id: 's3', date: '2026-08-20', tonnes: 5, price: 400 } }]);
  assert.ok(r.refused); assert.equal(r.refused.month, '2026-08'); assert.equal(r.data, d); assert.equal(r.done.length, 0);
  r = applyOpsTo(d, [{ kind: 'add', coll: 'shipments', obj: { id: 's3', date: '2026-08-20', tonnes: 5, price: 400 } }], { force: true });
  assert.equal(r.refused, null); assert.equal(r.data.shipments.length, 3);
  assert.equal(applyOpsTo(d, [{ kind: 'add', coll: 'shipments', obj: { date: '2026-09-20', tonnes: 5 } }]).refused, null, 'mese aperto');
  assert.equal(applyOpsTo(d, [{ kind: 'update', coll: 'shipments', id: 's1', patch: { note: 'consegna con ritardo' } }]).refused, null, 'campo non protetto');
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'shipments', id: 's1', patch: { tonnes: 11 } }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'shipments', id: 's1', patch: x => ({ ...x, price: 1 }) }]).refused, 'patch come funzione');
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'shipments', id: 's2', patch: { date: '2026-08-30' } }]).refused, 'spostare dentro un mese chiuso');
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'fixedCosts', id: 'fc1', patch: { amount: 1 } }]).refused, 'costi fissi per mese');
  assert.ok(applyOpsTo(d, [{ kind: 'remove', coll: 'shipments', id: 's1' }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'removeMany', coll: 'shipments', ids: ['s2', 's1'] }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'addMany', coll: 'shipments', objs: [{ date: '2026-09-01' }, { date: '2026-08-01' }] }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'upsertMany', coll: 'shipments', objs: [{ id: 's1', price: 390 }] }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'upsertMany', coll: 'shipments', objs: [{ id: 'new', date: '2026-07-01', tonnes: 1 }] }]).refused);
  assert.equal(applyOpsTo(d, [{ kind: 'upsertMany', coll: 'shipments', objs: [{ id: 's2', price: 420 }] }]).refused, null);
  assert.ok(applyOpsTo(d, [{ kind: 'replace', coll: 'shipments', value: [d.shipments[1]] }]).refused, 'replace che toglie un record chiuso');
  assert.equal(applyOpsTo(d, [{ kind: 'replace', coll: 'shipments', value: [d.shipments[0], { ...d.shipments[1], tonnes: 1 }] }]).refused, null);
  assert.equal(applyOpsTo(d, [{ kind: 'update', coll: 'offers', id: 'o1', patch: { price: 1 } }]).refused, null, 'le offerte non sono movimenti chiusi');
  assert.equal(CLOSED_MSG, 'Il mese è chiuso: riaprilo da Direzione › Chiusura del mese');
});

test('mese chiuso: tutto o niente, in sequenza (chiudere e riaprire nello stesso passo)', () => {
  const d = base();
  const r = applyOpsTo(d, [{ kind: 'add', coll: 'shipments', obj: { id: 'ok', date: '2026-09-10' } }, { kind: 'remove', coll: 'shipments', id: 's1' }]);
  assert.ok(r.refused); assert.equal(r.data, d, 'nemmeno la prima operazione resta');
  // riapertura e correzione nello stesso passo: ammesse
  const reopen = applyOpsTo(d, [{ kind: 'settings', value: { closedThrough: '2026-07' } }, { kind: 'update', coll: 'shipments', id: 's1', patch: { tonnes: 9 } }]);
  assert.equal(reopen.refused, null); assert.equal(reopen.data.shipments[0].tonnes, 9);
  // chiusura di settembre e poi una consegna di settembre: rifiutata (come closeMonthOps + consegna)
  const close = applyOpsTo(d, [{ kind: 'settings', value: st => ({ ...st, closedThrough: '2026-09' }) }, { kind: 'add', coll: 'shipments', obj: { date: '2026-09-15', tonnes: 3 } }]);
  assert.ok(close.refused);
  const closed = applyOpsTo(d, [{ kind: 'settings', value: { closedThrough: '2026-09' } }]).data;
  assert.ok(applyOpsTo(closed, [{ kind: 'add', coll: 'shipments', obj: { date: '2026-09-15', tonnes: 3 } }]).refused);
  assert.equal(applyOpsTo(closed, [{ kind: 'add', coll: 'shipments', obj: { date: '2026-09-15', tonnes: 3 } }], { force: true }).refused, null);
});

test('mese chiuso: i costi fissi di budget restano modificabili, il consuntivo no', () => {
  const d = { ...base(), fixedCosts: [...base().fixedCosts, { id: 'fb1', month: '2026-03', centerId: 'cc-man', kind: 'budget', amount: 100 }] };
  // revisione del budget dell'anno: righe di budget anche per i mesi già chiusi
  assert.equal(applyOpsTo(d, [{ kind: 'addMany', coll: 'fixedCosts', objs: [{ month: '2026-02', centerId: 'cc-pers', kind: 'budget', version: 'R1', amount: 5 }] }]).refused, null);
  assert.equal(applyOpsTo(d, [{ kind: 'update', coll: 'fixedCosts', id: 'fb1', patch: { amount: 120 } }]).refused, null);
  assert.equal(applyOpsTo(d, [{ kind: 'remove', coll: 'fixedCosts', id: 'fb1' }]).refused, null);
  // il consuntivo (kind assente o 'consuntivo') resta bloccato, e il budget non può diventare consuntivo
  assert.ok(applyOpsTo(d, [{ kind: 'add', coll: 'fixedCosts', obj: { month: '2026-02', centerId: 'cc-pers', kind: 'consuntivo', amount: 5 } }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'fixedCosts', id: 'fb1', patch: { kind: 'consuntivo' } }]).refused);
  assert.ok(applyOpsTo(d, [{ kind: 'update', coll: 'fixedCosts', id: 'fc1', patch: { kind: 'budget' } }]).refused);
});

const roundTrip = (d, ops) => {
  const r = applyOpsTo(d, ops);
  assert.equal(r.refused, null);
  let back = r.data; for (const op of [...r.done].reverse()) back = revertOp(back, op);
  let fwd = back; for (const op of r.done) fwd = reapplyOp(fwd, op);
  return { r, back, fwd };
};

test('addMany, upsertMany, removeMany: una copia della raccolta, annulla e ripeti esatti', () => {
  const d = emptyData();
  d.customers = Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, code: 'K' + i, name: 'Cliente ' + i }));
  // addMany
  let t = roundTrip(d, [{ kind: 'addMany', coll: 'customers', objs: [{ name: 'Nuovo A' }, { id: 'cx', name: 'Nuovo B' }] }]);
  assert.equal(t.r.data.customers.length, 10); assert.equal(t.r.data.customers[0].name, 'Nuovo A'); assert.ok(t.r.data.customers[0].id);
  assert.deepEqual(t.back.customers, d.customers); assert.deepEqual(t.fwd.customers, t.r.data.customers);
  // upsertMany per codice: due aggiornamenti, un'aggiunta, una riga identica ignorata, un doppione fuso
  t = roundTrip(d, [{ kind: 'upsertMany', coll: 'customers', key: 'code', objs: [{ code: 'K2', name: 'Due' }, { code: 'K9', name: 'Nove' }, { code: 'K5', name: 'Cliente 5' }, { code: 'K9', city: 'Bari' }, { code: 'K2', city: 'Lecce' }] }]);
  const after = t.r.data.customers;
  assert.equal(after.length, 9);
  assert.deepEqual(after[0].name + after[0].city, 'NoveBari');
  assert.deepEqual(after.find(c => c.code === 'K2'), { id: 'c2', code: 'K2', name: 'Due', city: 'Lecce' });
  assert.equal(t.r.done[0].updated.length, 1, 'K5 identico: non conta');
  assert.equal(t.r.done[0].added.length, 1);
  assert.deepEqual(t.back.customers, d.customers);
  t.back.customers.forEach((c, i) => assert.equal(c, d.customers[i], 'stessi oggetti dopo l’annullamento'));
  assert.deepEqual(t.fwd.customers, after);
  // chiave composta
  const s = emptyData(); s.shipments = [{ id: 's1', ddt: 'D1', productId: 'p1', tonnes: 3, date: '2026-01-02' }, { id: 's2', ddt: 'D1', productId: 'p2', tonnes: 4, date: '2026-01-02' }];
  t = roundTrip(s, [{ kind: 'upsertMany', coll: 'shipments', key: ['ddt', 'productId'], objs: [{ ddt: 'D1', productId: 'p2', tonnes: 5 }, { ddt: 'D2', productId: 'p1', tonnes: 1, date: '2026-01-03' }] }]);
  assert.equal(t.r.data.shipments.length, 3); assert.equal(t.r.data.shipments.find(x => x.id === 's2').tonnes, 5);
  assert.deepEqual(t.back.shipments, s.shipments);
  // niente da fare: nessun passo
  assert.equal(applyOpsTo(d, [{ kind: 'upsertMany', coll: 'customers', key: 'code', objs: [{ code: 'K1', name: 'Cliente 1' }] }]).done.length, 0);
  // removeMany con posizioni sparse: l'ordine torna identico
  t = roundTrip(d, [{ kind: 'removeMany', coll: 'customers', ids: ['c6', 'c0', 'c3', 'assente'] }]);
  assert.deepEqual(t.r.data.customers.map(c => c.id), ['c1', 'c2', 'c4', 'c5', 'c7']);
  assert.deepEqual(t.back.customers, d.customers);
  assert.deepEqual(t.fwd.customers, t.r.data.customers);
  // passo misto
  t = roundTrip(d, [{ kind: 'remove', coll: 'customers', id: 'c4' }, { kind: 'addMany', coll: 'customers', objs: [{ id: 'z', name: 'Z' }] }, { kind: 'update', coll: 'customers', id: 'c1', patch: { name: 'Uno' } }, { kind: 'settings', value: { visitCost: 55 } }]);
  assert.deepEqual(t.back.customers, d.customers); assert.equal(t.back.settings.visitCost, 40);
  assert.deepEqual(t.fwd, t.r.data);
});

test('annullare un’impostazione non cancella una scrittura silenziosa successiva su un’altra chiave', () => {
  const d = emptyData();
  const a = applyOpsTo(d, [{ kind: 'settings', value: st => ({ ...st, signalState: { k: { status: 'ignorato' } } }) }]);
  const b = applyOpsTo(a.data, [{ kind: 'settings', value: { dq: { history: [{ day: '2026-10-16', score: 91 }] } } }]);
  const undone = revertOp(b.data, a.done[0]);
  assert.deepEqual(undone.settings.signalState, {});
  assert.equal(undone.settings.dq.history[0].score, 91);
  const redone = reapplyOp(undone, a.done[0]);
  assert.equal(redone.settings.signalState.k.status, 'ignorato');
  assert.equal(redone.settings.dq.history.length, 1);
});

/* ---------------- numerazione dei documenti ---------------- */
test('nextCode: formati storici, anno, contatore che non riusa i numeri cancellati', () => {
  assert.deepEqual(parseCode('OF-26-112'), { prefix: 'OF', yy: '26', n: 112 });
  assert.deepEqual(parseCode('OA-2601'), { prefix: 'OA', yy: '26', n: 1 });
  assert.equal(parseCode('lotto 12'), null);
  let d = emptyData();
  assert.equal(nextCode(d, 'OF', '2026-03-01').code, 'OF-26-001');
  d.offers = [{ id: 'a', code: 'OF-26-101' }, { id: 'b', code: 'OF-26-126' }, { id: 'c', code: 'OF-25-300' }];
  d.purchases = Array.from({ length: 11 }, (_, i) => ({ id: 'po' + i, code: 'OA-' + (2601 + i) }));
  const of = nextCode(d, 'OF', '2026-10-16');
  assert.equal(of.code, 'OF-26-127'); assert.equal(of.key, 'OF-2026');
  assert.equal(nextCode(d, 'OA', '2026-10-16').code, 'OA-26-012');
  assert.equal(nextCode(d, 'OF', '2025-12-31').code, 'OF-25-301');
  assert.equal(nextCode(d, 'RC', '2027-01-02').code, 'RC-27-001');
  // si crea l'offerta 127 con il suo contatore, poi la si cancella: il numero non torna
  let r = applyOpsTo(d, [{ kind: 'add', coll: 'offers', obj: { id: 'n1', code: of.code } }, of.op]);
  d = r.data;
  assert.equal(d.settings.counters['OF-2026'], 127);
  d = applyOpsTo(d, [{ kind: 'remove', coll: 'offers', id: 'n1' }]).data;
  d = applyOpsTo(d, [{ kind: 'remove', coll: 'offers', id: 'b' }]).data;
  const again = nextCode(d, 'OF', '2026-10-17');
  assert.equal(again.code, 'OF-26-128', 'dopo le cancellazioni non si duplica');
  // più codici in una volta
  const many = nextCodes(d, 'FT', 3, '2026-05-31');
  assert.deepEqual(many.codes, ['FT-26-001', 'FT-26-002', 'FT-26-003']);
  r = applyOpsTo(d, [many.op]);
  assert.equal(r.data.settings.counters['FT-2026'], 3);
  assert.equal(nextCode(r.data, 'FT', '2026-06-30').code, 'FT-26-004');
  // l'operazione non abbassa mai un contatore già più avanti
  const stale = nextCode(emptyData(), 'FT', '2026-01-01').op;
  assert.equal(applyOpsTo(r.data, [stale]).data.settings.counters['FT-2026'], 3);
  assert.match(nextCode(emptyData(), 'OF').code, /^OF-\d{2}-001$/);
  // fatture importate: il numero sta in «number» (forma delle fatture di WP2) e il contatore non lo conosce ancora
  const inv = { ...emptyData(), invoices: [{ id: 'i1', number: 'FT-26-040' }, { id: 'i2', number: 'FT-26-007' }] };
  assert.equal(nextCode(inv, 'FT', '2026-10-31').code, 'FT-26-041', 'niente numeri di fattura duplicati');
  assert.deepEqual(nextCodes(inv, 'FT', 2, '2026-10-31').codes, ['FT-26-041', 'FT-26-042']);
});

/* ---------------- preferenze ---------------- */
test('preferenze: valori di base, seme solo per le chiavi mancanti, notifiche', () => {
  assert.deepEqual(getPrefs().period, { preset: '12m', from: null, to: null, compare: 'prec' });
  assert.equal(getPrefs().agentId, null);
  assert.deepEqual(getPrefs().tableViews, {});
  assert.equal(PREF_DEFAULTS.role, 'direzione');
  let calls = 0;
  const off = subscribePrefs(() => calls++);
  setPrefs({ agentId: 'ag-2' });
  assert.equal(getPrefs().agentId, 'ag-2'); assert.equal(calls, 1);
  setPrefs({ agentId: 'ag-2' });
  assert.equal(calls, 1, 'nessun cambio, nessuna notifica');
  setPrefs(p => ({ tableViews: { ...p.tableViews, clienti: { sort: 'name' } } }));
  assert.equal(getPrefs().tableViews.clienti.sort, 'name');
  seedPrefs({ agentId: 'ag-9', lastSeenAt: '2026-10-01' });
  assert.equal(getPrefs().agentId, 'ag-2', 'una scelta già fatta non si sovrascrive');
  assert.equal(getPrefs().lastSeenAt, '2026-10-01');
  off();
});

/* ---------------- avvio sicuro, istantanee, store ---------------- */
const KV = 'kv';
// versione 1 (prima apertura, con aggiornamento) o 2 (connessione già aperta dai test precedenti)
function seedDb(data, snaps = [], version = 2) {
  const stores = { kv: { rows: data ? { data } : {} }, snap: { keyPath: 'id', rows: Object.fromEntries(snaps.map(s => [s.id, s])) } };
  if (version >= 2) stores.snapmeta = { keyPath: 'id', rows: {} };
  idb._seed('feedos16', version, stores);
}
const savedData = () => idb._rows('feedos16', KV)?.get('data');
let inst = 0;
const freshStore = () => import('../../src/core/store.js?i=' + (++inst));

test('avvio con un archivio 16: istantanea prima di migrare, migrazione, preferenze seminate, mai il demo', async () => {
  const g = asSchema16(generateDemo({ today: '2026-09-23' }));
  const old = { ...g, settings: { ...g.settings, dataset: 'proprio', theme: 'dark', size: 'aula' } };
  seedDb(old, [{ id: '2026-10-01T08:00:00.000Z', label: 'Istantanea manuale', auto: false, size: 123, data: { x: 1 } }], 1);
  const S = await freshStore();
  let demoCalls = 0;
  await S.initStore(() => { demoCalls++; return emptyData(); });
  const st = S.getState();
  assert.equal(demoCalls, 0, 'il demo non sostituisce un archivio salvato');
  assert.equal(st.ready, true); assert.equal(st.readOnly, false);
  assert.equal(st.data.settings.schema, 17);
  assert.equal(st.data.settings.dataset, 'proprio');
  assert.equal(st.data.shipments.length, g.shipments.length);
  assert.ok(st.data.events[0].label.startsWith('Archivio aggiornato'));
  assert.equal(getPrefs().theme, 'dark'); assert.equal(getPrefs().size, 'aula');
  const P = await import('../../src/core/persist.js');
  const list = await P.listSnapshots();
  assert.equal(idb._version('feedos16'), 3, 'versione 3: archivio delle foto («media»)');
  assert.ok(list.some(s => s.label === 'Istantanea manuale' && s.size === 123), 'metadati delle istantanee della versione 1 ricostruiti');
  const pre = list.find(s => s.label === 'Prima della migrazione allo schema 17');
  assert.ok(pre && !pre.auto && pre.size > 1000);
  const full = await P.getSnapshot(pre.id);
  assert.equal(full.data.settings.schema, 16, 'l’istantanea contiene l’archivio prima della migrazione');
  assert.equal(savedData().settings.schema, 16, 'non ancora riscritto');
  assert.equal(await S.flushSave(), 'idb');
  assert.equal(savedData().settings.schema, 17, 'archivio migrato salvato');
  assert.ok(!('theme' in savedData().settings));
  // istantanea automatica del giorno: una sola anche con più salvataggi
  await new Promise(r => setTimeout(r, 20));
  S.store.settings({ visitCost: 41 }, 'Costo visita'); await S.flushSave();
  S.store.settings({ visitCost: 42 }, 'Costo visita'); await S.flushSave();
  await new Promise(r => setTimeout(r, 20));
  const autos = (await P.listSnapshots()).filter(s => s.auto);
  assert.equal(autos.length, 1);
  await P.deleteSnapshot(pre.id);
  assert.ok(!(await P.listSnapshots()).some(s => s.id === pre.id));
  assert.equal(await P.getSnapshot(pre.id), undefined, 'cancellata da entrambi gli archivi');
  P.markBackup();
  assert.ok(Date.now() - Date.parse(getPrefs().lastBackupAt) < 5000);
});

test('avvio con un archivio di uno schema più recente: sola lettura, niente salvataggi', async () => {
  const future = { ...emptyData(), settings: { ...emptyData().settings, schema: 99 }, customers: [{ id: 'c1', name: 'Futuro' }] };
  seedDb(future);
  const S = await freshStore();
  let demoCalls = 0;
  await S.initStore(() => { demoCalls++; return emptyData(); });
  const st = S.getState();
  assert.equal(demoCalls, 0);
  assert.equal(st.readOnly, true);
  assert.equal(st.loadError, 'Archivio creato da una versione più recente di FeedOS: sola lettura');
  assert.equal(st.data.customers[0].name, 'Futuro');
  S.store.update('customers', 'c1', { name: 'Cambiato' }, 'Prova');
  assert.equal(S.flushSave(), null, 'nessun salvataggio in attesa');
  assert.equal(await S.store.load(emptyData(), 'Prova'), false);
  assert.equal(savedData().settings.schema, 99);
  assert.equal(savedData().customers[0].name, 'Futuro', 'archivio salvato intatto');
});

test('avvio senza archivio: il demo passa dalla migrazione e viene salvato', async () => {
  seedDb(null);
  const S = await freshStore();
  await S.initStore(async () => demoData('2026-09-23'));
  const st = S.getState();
  assert.equal(st.fresh, true);
  assert.equal(st.data.settings.schema, 17);
  assert.equal(st.data.settings.dataset, 'demo');
  assert.ok(Array.isArray(st.data.invoices));
  assert.equal(await S.flushSave(), 'idb');
  assert.equal(savedData().settings.schema, 17);
});

test('store: batch con le nuove operazioni, opzioni silent e force, annulla e ripeti', async () => {
  const S = await freshStore();
  const { store, getState } = S;
  assert.ok(await store.load({ ...emptyData(), settings: { ...emptyData().settings, closedThrough: '2026-08' } }, 'Archivio di prova'));
  const n0 = getState().data.events.length;
  const done = store.batch([{ kind: 'addMany', coll: 'shipments', objs: [{ id: 'a', date: '2026-09-01', tonnes: 1 }, { id: 'b', date: '2026-09-02', tonnes: 2 }] }], 'Consegne');
  assert.equal(done[0].kind, 'addMany');
  store.batch([{ kind: 'upsertMany', coll: 'shipments', objs: [{ id: 'a', tonnes: 5 }, { id: 'c', date: '2026-09-03', tonnes: 3 }] }], 'Importazione consegne: 2 righe');
  assert.deepEqual(getState().data.shipments.map(s => s.id + s.tonnes), ['c3', 'a5', 'b2']);
  store.batch([{ kind: 'removeMany', coll: 'shipments', ids: ['a', 'c'] }], 'Tolte');
  assert.deepEqual(getState().data.shipments.map(s => s.id), ['b']);
  assert.equal(store.undo(), 'Tolte');
  assert.deepEqual(getState().data.shipments.map(s => s.id + s.tonnes), ['c3', 'a5', 'b2']);
  assert.equal(store.undo(), 'Importazione consegne: 2 righe');
  assert.deepEqual(getState().data.shipments.map(s => s.id + s.tonnes), ['a1', 'b2']);
  assert.equal(store.redo(), 'Importazione consegne: 2 righe');
  assert.deepEqual(getState().data.shipments.map(s => s.id + s.tonnes), ['c3', 'a5', 'b2']);
  // silent: niente cronologia né registro
  const label = store.undoLabel(), evs = getState().data.events.length;
  assert.ok(store.batch([{ kind: 'settings', value: { dq: { history: [1] } } }], 'Punteggio', { silent: true }));
  assert.equal(store.undoLabel(), label); assert.equal(getState().data.events.length, evs);
  assert.deepEqual(getState().data.settings.dq, { history: [1] });
  // mese chiuso: false e nessun cambiamento; con force passa
  const before = getState().data;
  assert.equal(store.batch([{ kind: 'add', coll: 'shipments', obj: { date: '2026-08-15', tonnes: 1 } }], 'Consegna di agosto'), false);
  assert.equal(getState().data, before);
  assert.equal(store.add('shipments', { date: '2026-08-15', tonnes: 1 }, 'Consegna di agosto'), undefined);
  assert.ok(store.batch([{ kind: 'add', coll: 'shipments', obj: { id: 'f', date: '2026-08-15', tonnes: 1 } }], 'Consegna di agosto (forzata)', { force: true }));
  assert.equal(getState().data.shipments[0].id, 'f');
  assert.ok(getState().data.events.length > n0);
  assert.equal(getState().data.events[0].role, getPrefs().role, 'il registro usa la vista delle preferenze');
  await S.flushSave();
});
