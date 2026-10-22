/* FeedOS 18 · primitive della fondazione 18: esercizi ESG, registro dei datapoint e delle scadenze, testi automatici e bilingui,
 * pacchetti di contenuti, impronte SHA-256 e JSON canonico, archivi ZIP, correzioni F1, F3, F4, F5, F9 e F10. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { emptyData } from '../../src/core/schema.js';
import { reportingPeriods, currentPeriod, periodByKey, previousPeriod, historySeries, periodMode, fyStartMonth, esgSettings, esgSettingsOp, deepMerge, dataRange, rowMatches } from '../../src/engine/esg-years.js';
import { collectDatapoints, collectCalendar, DATAPOINT_PROVIDERS, CALENDAR_PROVIDERS, METHOD_NOTES, ESG_PACKAGES } from '../../src/engine/esg-registry.js';
import { fmtNum, deltaPhrase, listJoin, T } from '../../src/engine/esg-nlg.js';
import { I18N } from '../../src/data/esg-i18n.js';
import { packItems, activePack, packStatus, validatePack, applyPackOps, compareVersions, packDiff } from '../../src/engine/esg-packs.js';
import { sha256Hex, sha256HexSync, canonicalJson } from '../../src/core/hash.js';
import { crc32, zipStore, readZipEntries, zipName } from '../../src/core/zip.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { DEFAULTS, scope1PerKg } from '../../src/engine/energy.js';
import { computeKpis } from '../../src/engine/esg.js';
import { waterStats, registerMonths, esgScore, overview } from '../../src/engine/sustainability.js';
import { WASTE_OPS, defaultWasteOp } from '../../src/data/eer.js';
import { ESG_REGISTRY } from '../../src/data/esgRegistry.js';

const today = '2026-10-21';
const D = demoData(today);
const withSettings = (d, esg18) => ({ ...d, settings: { ...d.settings, esg18 } });

/* ---------------- esercizi ESG ---------------- */
test('esercizi: demo in «12 mesi chiusi» (01/10/2025 – 30/09/2026), forma del periodo, chiavi e precedente', () => {
  assert.equal(periodMode(D), '12m-chiusi');
  const P = currentPeriod(D);
  assert.deepEqual(Object.keys(P).sort(), ['days', 'from', 'key', 'label', 'mode', 'months', 'short', 'to']);
  assert.deepEqual([P.key, P.from, P.to, P.days, P.months.length, P.mode], ['12m-2026-09', '2025-10-01', '2026-09-30', 365, 12, '12m-chiusi']);
  assert.equal(P.label, '12 mesi a settembre 2026');
  assert.deepEqual(reportingPeriods(D).map(p => p.key), ['12m-2026-09'], 'il demo ha dati per un solo esercizio');
  assert.deepEqual(periodByKey(D, '12m-2026-09'), P);
  const prev = previousPeriod(D, P.key);
  assert.deepEqual([prev.key, prev.from, prev.to], ['12m-2025-09', '2024-10-01', '2025-09-30']);
  assert.equal(periodByKey(D, 'nonsense'), null);
  assert.equal(periodByKey(D, '12m-2026-13'), null);
  assert.equal(previousPeriod(D, 'x'), null);
  // anno solare e esercizio a cavallo d'anno
  const A = withSettings(D, { report: { periodMode: 'anno' } });
  assert.equal(periodMode(A), 'anno');
  assert.deepEqual([currentPeriod(A).key, currentPeriod(A).from, currentPeriod(A).to, currentPeriod(A).label], ['anno-2025', '2025-01-01', '2025-12-31', 'anno 2025']);
  const J = withSettings(D, { report: { periodMode: 'anno', fyStartMonth: 7 } });
  assert.equal(fyStartMonth(J), 7);
  assert.deepEqual([currentPeriod(J).key, currentPeriod(J).from, currentPeriod(J).to, currentPeriod(J).short], ['anno-2025', '2025-07-01', '2026-06-30', '2025/26']);
  assert.equal(previousPeriod(J, 'anno-2025').from, '2024-07-01');
  // l'esercizio di ottobre chiude a settembre: a fine ottobre il 2025/26 (ott–set) è già chiuso
  const O = withSettings(D, { report: { periodMode: 'anno', fyStartMonth: 10 } });
  assert.deepEqual([currentPeriod(O).from, currentPeriod(O).to], ['2025-10-01', '2026-09-30']);
});

test('esercizi: modalità di base secondo i mesi di dati, periodi indietro finché ci sono dati (1-5), archivi vuoti', () => {
  for (const d of [emptyData(), starterData()]) {
    const ps = reportingPeriods(d);
    assert.equal(ps.length, 1, 'almeno un periodo anche senza dati');
    assert.equal(periodMode(d), '12m-chiusi');
    assert.equal(dataRange(d), null);
  }
  // 30 mesi di dati → anno; con lo storico dichiarato si va indietro fino a 5 periodi
  const runs = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, date: `${2024 + Math.floor((i + 3) / 12)}-${String(((i + 3) % 12) + 1).padStart(2, '0')}-15`, tonnes: 100 }));
  const d = { ...emptyData(), runs, settings: { ...emptyData().settings, dataset: 'demo', demoAnchor: '2026-10-21' } };
  assert.equal(periodMode(d), 'anno');
  assert.deepEqual(reportingPeriods(d).map(p => p.key), ['anno-2025', 'anno-2024']);
  const h = { ...d, esgHistory: [{ id: '2023', s1: 10 }, { id: 'anno-2022', s1: 11 }, { id: '2021', s1: 12 }, { id: '2020', s1: 13 }] };
  assert.deepEqual(reportingPeriods(h).map(p => p.key), ['anno-2025', 'anno-2024', 'anno-2023', 'anno-2022', 'anno-2021'], 'al massimo 5');
  assert.ok(rowMatches('2025', periodByKey(D, '12m-2025-09')) && !rowMatches('2024', periodByKey(D, '12m-2025-09')));
});

test('serie storiche: chiusura approvata > storico dichiarato > valore calcolato > chiusura non approvata', () => {
  const d = { ...D, esgHistory: [{ id: '12m-2025-09', s1: 790, tonnes: 46200 }], esgClosings: [{ id: '12m-2026-09', status: 'in revisione', datapoints: { 'B3.s1': { value: 801, unit: 't CO₂e', quality: 'calcolato', source: 'clima.climaDatapoints' } }, kpis: { 'esg-s12': 950 } }] };
  const periods = [periodByKey(d, '12m-2026-09'), periodByKey(d, '12m-2025-09'), periodByKey(d, '12m-2024-09')];
  const s = historySeries(d, 'B3.s1', { periods, live: P => (P.key === '12m-2026-09' ? 812 : null) });
  assert.deepEqual(s.map(x => [x.key, x.value, x.source]), [['12m-2024-09', null, null], ['12m-2025-09', 790, 'storico dichiarato'], ['12m-2026-09', 812, 'calcolato']]);
  const ap = { ...d, esgClosings: [{ ...d.esgClosings[0], status: 'approvato' }] };
  assert.deepEqual(historySeries(ap, 'B3.s1', { periods, live: () => 812 }).at(-1), { key: '12m-2026-09', label: '12 mesi a settembre 2026', short: 'ott 25 – set 26', from: '2025-10-01', to: '2026-09-30', value: 801, source: 'chiusura' });
  assert.equal(historySeries(d, 'esg-s12', { periods }).at(-1).value, 950, 'senza valore calcolato vale la chiusura non approvata');
  assert.equal(historySeries(d, 'tonnes', { periods })[1].value, 46200);
  assert.deepEqual(historySeries(d, 's1', { periods, live: () => { throw new Error('x'); } }).map(x => x.value), [null, 790, null], 'un errore del valore calcolato vale null');
  assert.ok(Array.isArray(historySeries(emptyData(), 'B3.s1')));
});

test('impostazioni dei pacchetti: fusione profonda, operazione «settings» che non tocca il resto', () => {
  assert.deepEqual(esgSettings(D, 'piano', { carbonPrice: 80, targets: { pvShare: 0.4, recovery: 0.5 } }), { carbonPrice: 80, targets: { pvShare: 0.4, recovery: 0.5 }, ...(D.settings.esg18?.piano || {}) });
  const x = withSettings(D, { piano: { targets: { recovery: 0.6 } }, clima: { gwp: 'AR6' } });
  assert.deepEqual(esgSettings(x, 'piano', { carbonPrice: 80, targets: { pvShare: 0.4, recovery: 0.5 } }), { carbonPrice: 80, targets: { pvShare: 0.4, recovery: 0.6 } });
  assert.deepEqual(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2], d: 3 } }), { a: { b: 1, c: [2], d: 3 } });
  const r = applyOpsTo(x, [esgSettingsOp('piano', { targets: { pvShare: 0.5 } })]);
  assert.deepEqual(r.data.settings.esg18, { piano: { targets: { recovery: 0.6, pvShare: 0.5 } }, clima: { gwp: 'AR6' } });
  assert.equal(r.data.settings.energy, x.settings.energy, 'le altre impostazioni restano le stesse');
  const r2 = applyOpsTo(x, [esgSettingsOp('piano', cur => ({ ...cur, carbonPrice: 100 }))]);
  assert.deepEqual(r2.data.settings.esg18.piano, { targets: { recovery: 0.6 }, carbonPrice: 100 });
  const r3 = applyOpsTo(emptyData(), [esgSettingsOp('report', { periodMode: 'anno' })]);
  assert.deepEqual(r3.data.settings.esg18, { report: { periodMode: 'anno' } });
});

/* ---------------- registro ---------------- */
test('registro: datapoint e scadenze dei nove pacchetti; un fornitore che si interrompe non ferma gli altri e non scrive in console', () => {
  assert.equal(DATAPOINT_PROVIDERS.length, 9); assert.equal(CALENDAR_PROVIDERS.length, 9);
  assert.deepEqual(Object.keys(METHOD_NOTES), ESG_PACKAGES.map(p => p.id));
  const P = currentPeriod(D);
  const base = collectDatapoints(D, P);
  assert.ok(base.datapoints && Array.isArray(base.errors) && Array.isArray(base.duplicates));
  const warn = console.warn, err = console.error, log = console.log; let said = 0;
  console.warn = console.error = console.log = () => { said++; };
  try {
    const provs = [() => { throw new Error('rotto'); }, () => ({ 'B3.s1': { value: 1, unit: 't CO₂e', quality: 'misurato', source: 'pcf.prova' }, 'B3.bad': 5 }), () => ({ 'B3.s1': { value: 2, unit: 't', quality: 'boh' }, 'B6.withdrawal': { value: 3, unit: 'm³', quality: 'boh' } }), () => null, () => 'x'];
    const r = collectDatapoints(D, P, provs);
    assert.deepEqual(r.errors.map(e => [e.pkg, e.error.slice(0, 5)]), [['clima', 'rotto'], ['pcf', 'datap'], ['persone', 'risul']]);
    assert.equal(r.datapoints['B3.s1'].value, 1, 'a parità di id vince il primo pacchetto');
    assert.equal(r.datapoints['B3.s1'].pkg, 'pcf');
    assert.deepEqual(r.duplicates, [{ dpId: 'B3.s1', pkg: 'filiera', kept: 'pcf' }]);
    assert.deepEqual(r.datapoints['B6.withdrawal'], { value: 3, unit: 'm³', quality: 'mancante', source: 'filiera.datapoint', pkg: 'filiera' });
    const cal = collectCalendar(D, today, { withErrors: true }, [
      () => [{ key: 'b', date: '2026-12-30', title: 'Due', kind: 'scadenza', link: { area: 'esg', tab: 'filiera' } }, { key: 'x', date: 'non-data', title: 'scartata' }],
      () => { throw new Error('rotto'); },
      () => [{ key: 'a', date: '2026-11-15', title: 'Uno', kind: 'controllo', link: { area: 'esg', tab: 'clima' } }, { key: 'b', date: '2026-01-01', title: 'ripetuta' }],
    ]);
    assert.deepEqual(cal.items.map(i => [i.key, i.date, i.pkg, i.area]), [['a', '2026-11-15', 'filiera', 'esg'], ['b', '2026-12-30', 'clima', 'esg']]);
    assert.equal(cal.errors.length, 1);
    assert.ok(Array.isArray(collectCalendar(D, today)));
  } finally { console.warn = warn; console.error = err; console.log = log; }
  assert.equal(said, 0, 'nessun messaggio in console');
});

/* ---------------- testi automatici ---------------- */
test('testi: numeri con unità, variazioni con giudizio, elenchi, chiavi bilingui con ripiego', () => {
  assert.equal(fmtNum(1234.56, 't CO₂e'), '1235 t CO₂e', 'come nf: in italiano il punto delle migliaia da 5 cifre');
  assert.equal(fmtNum(12345.6, 't'), '12.346 t');
  assert.equal(fmtNum(1234.56, 't CO₂e', 'en'), '1,235 t CO₂e');
  assert.equal(fmtNum(12.345, '%'), '12,3%');
  assert.equal(fmtNum(0.1926, 'kg CO₂/kWh'), '0,193 kg CO₂/kWh');
  assert.equal(fmtNum(5), '5');
  assert.equal(fmtNum(2.5, '', 'it', 2), '2,5');
  assert.equal(fmtNum(null, 't'), 'n.d.');
  assert.equal(fmtNum(undefined, 't', 'en'), 'n/a');
  assert.equal(deltaPhrase(778, 812, { good: 'down', unit: 't CO₂e' }), 'in calo del 4,2% (da 812 a 778 t CO₂e), un miglioramento');
  assert.equal(deltaPhrase(778, 812, { good: 'down', unit: 't CO₂e', lang: 'en' }), 'down 4.2% (from 812 to 778 t CO₂e), an improvement');
  assert.equal(deltaPhrase(850, 812, { good: 'down', unit: 't' }), 'in aumento del 4,7% (da 812 a 850 t), un peggioramento');
  assert.equal(deltaPhrase(42.1, 40, { good: 'up', unit: '%' }), 'in aumento di 2,1 punti (da 40% a 42,1%), un miglioramento');
  assert.equal(deltaPhrase(41, 40, { unit: '%', lang: 'en' }), 'up 1 point (from 40% to 41%)');
  assert.equal(deltaPhrase(812.5, 812, { good: 'down', unit: 't' }), 'stabile (da 812 a 813 t)');
  assert.equal(deltaPhrase(10, 0, { unit: 't' }), 'in aumento di 10 t (da 0 a 10 t)');
  assert.equal(deltaPhrase(null, 5), 'non confrontabile con il periodo precedente');
  assert.equal(listJoin(['acqua', 'rifiuti', 'energia']), 'acqua, rifiuti e energia');
  assert.equal(listJoin(['water', 'waste'], 'en'), 'water and waste');
  assert.equal(listJoin(['solo', '', null]), 'solo');
  assert.equal(listJoin([]), '');
  assert.equal(T('disclaimer'), 'FeedOS organizza dati e calcoli; non sostituisce consulenza legale, fiscale o la verifica di un ente terzo.');
  assert.match(T('disclaimer', {}, 'en'), /^FeedOS organises data/);
  assert.equal(T('nlg.fromTo', { prev: 'a', cur: 'b' }, 'en'), 'from a to b');
  assert.equal(T('nlg.points', { n: 2.5 }), '2,5 punti');
  assert.equal(T('chiave-inesistente'), 'chiave-inesistente');
  assert.equal(T('nlg.fromTo', { prev: 'a' }), 'da a a {cur}', 'valore mancante: segnaposto lasciato');
  for (const k of ['disclaimer', 'validAsOf', 'source', 'status.da-verificare', 'quality.misurato', 'quality.calcolato', 'quality.stimato', 'quality.dichiarato', 'quality.default', 'quality.mancante']) {
    assert.ok(I18N[k]?.it && I18N[k]?.en, 'chiave di base ' + k);
  }
  for (const [k, v] of Object.entries(I18N)) assert.ok(typeof v.it === 'string' && typeof v.en === 'string', k);
});

/* ---------------- pacchetti di contenuti ---------------- */
test('pacchetti di contenuti: versione più recente, controllo, importazione come operazione di impostazioni, stato', () => {
  const B = { pack: 'prova', version: '2026.4', validAsOf: '2026-10-21', items: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] };
  assert.ok(compareVersions('2026.10', '2026.4') > 0 && compareVersions('2026.4', '2026.4.0') === 0 && compareVersions('2025.12', '2026.1') < 0);
  assert.ok(compareVersions('2026.1', 'x') > 0);
  assert.equal(packItems(emptyData(), 'prova', B), B.items);
  assert.deepEqual(packItems(emptyData(), 'prova', null), []);
  assert.deepEqual(validatePack('{non json').errors, ['Il file non è un JSON valido']);
  const bad = validatePack({ pack: 'Prova!', version: 'v1', validAsOf: '21/10/2026', items: [{ id: 'a' }, { id: 'a' }, 3] });
  assert.equal(bad.ok, false); assert.equal(bad.errors.length, 5);
  const newer = { pack: 'prova', version: '2026.10', validAsOf: '2026-12-01', items: [{ id: 'a', value: 1 }, { id: 'b', value: 3 }, { id: 'c', value: 4 }] };
  const imp = applyPackOps(emptyData(), JSON.stringify(newer), B);
  assert.equal(imp.ok, true);
  assert.deepEqual(imp.diff, { added: ['c'], removed: [], changed: ['b'] });
  const after = applyOpsTo(emptyData(), imp.ops).data;
  assert.equal(after.settings.esg18.packs.prova.version, '2026.10');
  assert.deepEqual(packItems(after, 'prova', B), newer.items, 'vince il pacchetto importato più recente');
  assert.equal(activePack(after, 'prova', B).origin, 'importato');
  assert.equal(activePack(after, 'prova', { ...B, version: '2027.1' }).origin, 'integrato', 'un pacchetto integrato più recente torna a vincere');
  const st = packStatus(after, [B]);
  assert.deepEqual(st.map(s => [s.pack, s.version, s.origin, s.builtinVersion, s.importedVersion, s.items]), [['prova', '2026.10', 'importato', '2026.4', '2026.10', 3]]);
  assert.equal(packStatus(D, [{ ...B, validAsOf: '2025-01-01' }])[0].stale, true);
  assert.deepEqual(applyPackOps(emptyData(), { pack: 'x' }).ops, []);
  assert.deepEqual(packDiff([{ id: 'a', v: 1 }], [{ id: 'b' }]), { added: ['b'], removed: ['a'], changed: [] });
});

/* ---------------- impronte e archivi ---------------- */
test('SHA-256: stesso risultato di node:crypto (testo UTF-8 e byte), WebCrypto e JavaScript coincidono', async () => {
  const cases = ['', 'abc', 'hello', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Mangimificio Dimostrativo · CO₂ ≤ 0,19 €'.repeat(9)];
  for (const s of cases) {
    const ref = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(sha256HexSync(s), ref, `sync ${s.length}`);
    assert.equal(await sha256Hex(s), ref, `async ${s.length}`);
  }
  assert.equal(sha256HexSync('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const bytes = new Uint8Array(300).map((_, i) => (i * 7) & 255);
  assert.equal(sha256HexSync(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(sha256HexSync(bytes.buffer), sha256HexSync(bytes));
  // senza WebCrypto si usa il calcolo in JavaScript
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally { if (desc) Object.defineProperty(globalThis, 'crypto', desc); }
  // un oggetto si impronta sul suo JSON canonico
  assert.equal(sha256HexSync({ b: 1, a: 2 }), sha256HexSync('{"a":2,"b":1}'));
});

test('JSON canonico: chiavi ordinate, nessuno spazio, numeri e campi assenti come JSON.stringify', () => {
  assert.equal(canonicalJson({ b: 1, a: [3, { d: 'x', c: null }], e: undefined, f: () => 1 }), '{"a":[3,{"c":null,"d":"x"}],"b":1}');
  assert.equal(canonicalJson({ z: NaN, y: Infinity, x: -0, w: 1e21, v: 0.1 + 0.2 }), '{"v":0.30000000000000004,"w":1e+21,"x":0,"y":null,"z":null}');
  assert.equal(canonicalJson([undefined, 'è€😀']), '[null,"è€😀"]');
  assert.equal(canonicalJson({ d: { toJSON: () => '2026-10-21' } }), '{"d":"2026-10-21"}');
  assert.equal(canonicalJson(new Uint8Array([1, 2])), '[1,2]');
  assert.equal(canonicalJson(undefined), 'null');
  const a = { k2: { y: 1, x: 2 }, k1: [1, 2] }, b = { k1: [1, 2], k2: { x: 2, y: 1 } };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.deepEqual(JSON.parse(canonicalJson(a)), b);
});

test('ZIP senza compressione: CRC-32, intestazioni e directory centrale rilette, nomi UTF-8, date fisse', () => {
  assert.equal(crc32('hello'), 0x3610A686);
  assert.equal(crc32(''), 0);
  assert.equal(crc32('123456789'), 0xCBF43926);
  const files = [{ name: 'leggimi.txt', data: 'Pacchetto per il revisore' }, { name: 'dati/emissioni è.json', data: canonicalJson({ s1: 1 }), date: '2026-10-21T10:30:00' }, { name: '../fuori/../x.bin', data: new Uint8Array([0, 1, 2, 255]) }, { name: 'leggimi.txt', data: 'bis' }];
  const z = zipStore(files);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50, 'prima intestazione locale');
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'fine della directory centrale');
  assert.equal(dv.getUint16(eocd + 10, true), 4, 'numero di voci');
  const cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  assert.equal(cdOff + cdSize, eocd, 'directory centrale subito prima della fine');
  assert.equal(dv.getUint32(cdOff, true), 0x02014b50, 'prima voce della directory centrale');
  assert.equal(dv.getUint16(cdOff + 8, true) & 0x0800, 0x0800, 'nomi in UTF-8');
  assert.equal(dv.getUint16(cdOff + 10, true), 0, 'metodo store');
  const back = readZipEntries(z);
  assert.deepEqual(back.map(e => [e.name, e.size, e.ok, e.method]), [['leggimi.txt', 25, true, 0], ['dati/emissioni è.json', 8, true, 0], ['fuori/x.bin', 4, true, 0], ['leggimi (2).txt', 3, true, 0]]);
  assert.equal(new TextDecoder().decode(back[0].data), 'Pacchetto per il revisore');
  assert.deepEqual([...back[2].data], [0, 1, 2, 255]);
  assert.equal(back[1].crc, crc32('{"s1":1}'));
  // data DOS: 21/10/2026 10:30 nella seconda voce, 01/01/1980 nelle altre
  let p = cdOff; const dates = [];
  for (let i = 0; i < 4; i++) { dates.push([dv.getUint16(p + 14, true), dv.getUint16(p + 12, true)]); p += 46 + dv.getUint16(p + 28, true); }
  assert.deepEqual(dates[0], [33, 0]);
  assert.deepEqual(dates[1], [((2026 - 1980) << 9) | (10 << 5) | 21, (10 << 11) | (30 << 5)]);
  assert.equal(JSON.stringify([...zipStore(files)]), JSON.stringify([...z]), 'stesso contenuto, stesso archivio');
  assert.deepEqual(readZipEntries(zipStore([])), []);
  assert.deepEqual(readZipEntries(new Uint8Array(10)), []);
  assert.equal(zipName('\\a\\b/../c.txt'), 'a/b/c.txt');
});

/* ---------------- correzioni F1, F3, F4, F5, F9, F10 ---------------- */
test('F1, F3: fattori di base per un archivio nuovo (rete Italia 2024 consolidato, GPL IPCC); il demo conserva i suoi', () => {
  assert.equal(DEFAULTS.feGrid, 0.1926);
  assert.equal(DEFAULTS.feGpl, 2.985);
  assert.ok(Math.abs(63.1 * 47.3 / 1000 - DEFAULTS.feGpl) < 0.001, 'IPCC 2006: 63,1 t CO₂/TJ × 47,3 MJ/kg');
  const e = emptyData();
  assert.deepEqual([e.settings.energy.feGrid, e.settings.energy.feGpl, e.settings.energy.gridFactor], [0.1926, 2.985, 'ita24c']);
  assert.deepEqual([D.settings.energy.feGrid, D.settings.energy.feGpl, D.settings.energy.gridFactor], [0.2347, 3.0115, 'ita23']);
  assert.ok(scope1PerKg(DEFAULTS) > DEFAULTS.feGpl);
});

test('F4: E8 coincide con l’intensità dell’inventario (tutti i combustibili); unità di E7 e formula di C3 come il calcolo', () => {
  const P = { from: '2025-10-22', to: today };
  const R = computeKpis(D, P);
  const E8 = R.kpis.find(k => k.code === 'E8');
  assert.equal(E8.value, R.ghg.perT);
  assert.ok(R.ghg.dieselL > 0, 'il demo dichiara il gasolio');
  assert.ok(Math.abs(E8.value - (R.ghg.scope1 + R.ghg.scope2 + R.ghg.scope3) * 1000 / R.tonnes) < 1e-9);
  assert.equal(ESG_REGISTRY.find(k => k.code === 'E7').unit, 't CO₂/anno');
  assert.match(ESG_REGISTRY.find(k => k.code === 'C3').formula, /ricavi/);
});

test('F5: energia e acqua sugli stessi mesi chiusi; mesi dei registri per periodi a mesi interi, in corso e mobili', () => {
  assert.deepEqual(registerMonths({ from: '2025-10-22', to: '2026-10-21' }), ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(registerMonths({ from: '2025-10-01', to: '2026-09-30' }).length, 12);
  assert.deepEqual(registerMonths({ from: '2026-01-01', to: '2026-10-21' }), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(registerMonths({ from: '2026-10-01', to: '2026-10-21' }), [], 'mese in corso: nessuna lettura ancora');
  assert.deepEqual(registerMonths({ from: '2026-09-01', to: '2026-09-30' }), ['2026-09']);
  assert.deepEqual(registerMonths(null), []);
  const P = { from: '2025-10-22', to: today };
  const W = waterStats(D, P);
  const months = registerMonths(P);
  assert.deepEqual(W.months.map(m => m.month), months);
  const R = computeKpis(D, P);
  const en = D.energy.filter(e => months.includes(e.month));
  assert.equal(R.kpis.find(k => k.code === 'E1').value, en.reduce((s, e) => s + e.kwhGrid, 0), 'E1 sui mesi chiusi');
  assert.ok(!D.energy.some(e => e.month === '2026-10') || !months.includes('2026-10'), 'il mese in corso resta fuori');
});

test('F9: operazioni di recupero e smaltimento dichiarate (R1…R13, D1…D15)', () => {
  assert.deepEqual(WASTE_OPS.filter(o => o.dest === 'recupero').map(o => o.code), Array.from({ length: 13 }, (_, i) => 'R' + (i + 1)));
  assert.deepEqual(WASTE_OPS.filter(o => o.dest === 'smaltimento').map(o => o.code), Array.from({ length: 15 }, (_, i) => 'D' + (i + 1)));
  assert.equal(defaultWasteOp('recupero'), 'R13'); assert.equal(defaultWasteOp('smaltimento'), 'D15');
  assert.ok(WASTE_OPS.every(o => o.label && o.label.length > 5));
});

test('F10: criteri di maturità con valori plausibili e soglie da esgThresholds', () => {
  const g = generateDemo({ today });
  const P = { from: '2025-10-22', to: today };
  const R = computeKpis(g, P);
  const item = (o, id) => o.score.items.find(x => x.id === id);
  const o = overview(g, P, R);
  for (const id of ['gender', 'paygap', 'injmon']) assert.equal(item(o, id).result, true, id + ' plausibile sul demo');
  const bad = { ...g, survey: { ...g.survey, 'pe-women-mgmt': 140, 'pe-gap': 250, 'hs-inj': 0, 'hs-days': 400 } };
  const ob = overview(bad, P, computeKpis(bad, P));
  for (const id of ['gender', 'paygap', 'injmon']) { assert.equal(item(ob, id).result, false, id + ' non plausibile'); assert.match(item(ob, id).action, /plausibil/); }
  assert.ok(ob.score.score < o.score.score);
  // soglie configurabili: con l'obiettivo di recupero al 95% il criterio non è più soddisfatto
  assert.equal(item(o, 'recovery').result, true);
  const strict = { ...g, settings: { ...g.settings, esg18: { piano: { targets: { recovery: 0.95, trainingH: 10 } } } } };
  const os = overview(strict, P, computeKpis(strict, P));
  assert.equal(item(os, 'recovery').result, false);
  assert.equal(item(os, 'recovery').label, 'Almeno il 95% dei rifiuti avviato a recupero');
  assert.equal(item(os, 'training').result, true, '18 ore bastano con la soglia a 10');
  assert.equal(item(os, 'training').label, 'Almeno 10 ore di formazione per addetto');
  assert.equal(item(o, 'training').label, 'Almeno 20 ore di formazione per addetto');
  // senza contesto delle soglie valgono i valori di sempre
  assert.equal(esgScore({ ...o.ctx, th: undefined }).items.find(x => x.id === 'recovery').label, 'Almeno metà dei rifiuti avviata a recupero');
});

test('settore e codice NACE: mangimi di base, agrofarmaci per la seconda edizione', async () => {
  const { sectorOf, naceOf, SECTORS } = await import('../../src/engine/esg-years.js');
  assert.equal(sectorOf({}), 'mangimi');
  assert.equal(sectorOf(null), 'mangimi');
  assert.equal(naceOf({}), '10.91');
  const agro = { settings: { company: { sector: 'agrofarmaci' } } };
  assert.equal(sectorOf(agro), 'agrofarmaci');
  assert.equal(naceOf(agro), SECTORS.agrofarmaci.nace);
  assert.equal(sectorOf({ settings: { esg18: { sector: 'mangimi' }, company: { sector: 'agrofarmaci' } } }), 'mangimi', 'esg18 prevale');
  assert.equal(sectorOf({ settings: { company: { sector: 'toString' } } }), 'mangimi', 'solo settori noti');
  assert.equal(naceOf({ settings: { esg18: { report: { nace: ' 10.91 ' } }, company: { sector: 'agrofarmaci' } } }), '10.91');
  assert.equal(naceOf({ settings: { esg18: { report: { nace: 'abc' } } } }), '10.91', 'codice non valido → quello del settore');
});
