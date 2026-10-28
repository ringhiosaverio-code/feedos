/* DifesaOS · Area Prodotti: statistica delle prove (t, F, analisi della varianza a blocchi, lettere, Abbott), demo delle prove e dei
 * prezzi della concorrenza, leve di risparmio, confronto a ettaro, strategia di prezzo, segnali, lettura EXIF delle foto,
 * aggiornamento di un demo salvato con la versione precedente. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../../src/core/schema.js';
import { addDays } from '../../src/core/util.js';
import { tInv, fInv, tCdf } from '../../src/engine/stats.js';
import * as PR from '../../src/engine/agro-prove.js';
import * as RS from '../../src/engine/agro-risparmi.js';
import { makeIndex, costsOf, shipmentFacts } from '../../src/engine/actuals.js';
import { readExif } from '../../src/core/images.js';
import { demoData, upgradeDemo, AGRO_DEMO_VERSION } from '../../src/editions/agrofarmaci/demo/index.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} ± ${tol}`);

test('t di Student e F di Fisher contro le tavole', () => {
  for (const [p, df, v] of [[0.975, 1, 12.706], [0.975, 3, 3.182], [0.975, 9, 2.262], [0.975, 12, 2.179], [0.975, 30, 2.042], [0.995, 10, 3.169]]) near(tInv(p, df), v, 0.0015, `t(${p}, ${df})`);
  for (const [p, a, b, v] of [[0.95, 3, 9, 3.863], [0.95, 2, 6, 5.143], [0.95, 4, 12, 3.259], [0.99, 3, 9, 6.992]]) near(fInv(p, a, b), v, 0.002, `F(${p}, ${a}, ${b})`);
  near(tCdf(0, 5), 0.5, 1e-12);
});

test('analisi della varianza a blocchi randomizzati: valori calcolati a mano', () => {
  const g = [{ id: 'T1', values: [42, 47, 39, 51] }, { id: 'T2', values: [6, 5, 8, 4] }, { id: 'T3', values: [7, 9, 6, 10] }, { id: 'T4', values: [5, 4, 6, 5] }];
  const a = PR.anova(g);
  assert.equal(a.design, 'blocchi randomizzati');
  assert.equal(a.dfT, 3); assert.equal(a.dfE, 9);
  near(a.mse, 86.25 / 9, 1e-9, 'MSE'); near(a.F, 1488.75 / (86.25 / 9), 1e-6, 'F');
  near(a.lsd, 2.2622 * Math.sqrt(2 * (86.25 / 9) / 4), 0.002, 'LSD'); near(a.cv, Math.sqrt(86.25 / 9) / 15.875 * 100, 1e-6, 'CV');
  assert.ok(a.p < 1e-6 && a.significant);
  assert.deepEqual(a.letters, { T1: 'a', T3: 'b', T2: 'b', T4: 'b' });
  // dati mancanti: completamente randomizzato, gradi di libertà dai valori presenti
  const b = PR.anova([{ id: 'A', values: [10, 12, null, 11] }, { id: 'B', values: [20, 22, 21, 23] }]);
  assert.equal(b.design, 'completamente randomizzato'); assert.equal(b.dfE, 5);
  // F non significativo: tutte le tesi con la stessa lettera (LSD protetta)
  const c = PR.anova([{ id: 'A', values: [10, 14, 9, 13] }, { id: 'B', values: [11, 12, 13, 10] }]);
  assert.ok(!c.significant); assert.deepEqual(Object.values(c.letters), ['a', 'a']);
  assert.equal(PR.anova([{ id: 'A', values: [1, 2] }]), null, 'una sola tesi: niente analisi');
});

test('lettere di significatività (inserisci e assorbi) e efficacia di Abbott', () => {
  const sig = new Set(['A|C', 'A|D', 'B|D']);
  assert.deepEqual(PR.letters(['A', 'B', 'C', 'D'], (x, y) => sig.has(`${x}|${y}`) || sig.has(`${y}|${x}`)), { A: 'a', B: 'ab', C: 'bc', D: 'c' });
  assert.deepEqual(PR.letters(['A', 'B', 'C'], () => true), { A: 'a', B: 'b', C: 'c' });
  near(PR.abbott(40, 4), 90, 1e-9); assert.equal(PR.abbott(0, 4), null);
  assert.equal(PR.ilPct(83), 'l’83%'); assert.equal(PR.ilPct(92), 'il 92%'); assert.equal(PR.delPct(11), 'dell’11%');
});

const D = demoData('2026-10-28');
const T = D.settings.demoAnchor;
const ix = makeIndex(D), C = costsOf(D, ix);
const ctx = { today: T, ix, costs: C, facts: shipmentFacts(D, { ix, costsToday: C }) };
const P = { from: addDays(T, -364), to: T };

test('demo: prove coerenti con le conclusioni, illustrazioni marcate, nessun nome reale', () => {
  assert.equal(AGRO_DEMO_VERSION, 2);
  assert.equal(D.fieldTrials.length, 8);
  const by = Object.fromEntries(D.fieldTrials.map(t => [t.code, t]));
  const st = Object.fromEntries(D.fieldTrials.map(t => [t.code, PR.trialStatus(t, T)]));
  assert.equal(st['PC-26-07'], 'in corso'); assert.equal(st['PC-27-08'], 'pianificata');
  for (const t of D.fieldTrials) {
    const s = PR.trialSummary(t);
    if (/almeno|senza differenze/.test(t.conclusions)) assert.ok(['superiore', 'equivalente'].includes(s.verdict), `${t.code}: ${s.verdict}`);
    if (t.status === 'conclusa' && t.code !== 'PC-26-06') assert.ok(t.conclusions, `${t.code} senza conclusioni`);
    for (const a of t.assessments) for (const v of Object.values(a.values)) assert.equal(v.length, t.reps);
  }
  assert.equal(PR.trialSummary(by['PC-26-05']).verdict, 'inferiore', 'il biologico resta sotto il chimico');
  assert.ok(D.photos.length >= 15 && D.photos.every(p => p.kind === 'illustrazione' && p.art?.kind));
  const txt = JSON.stringify([D.fieldTrials, D.photos, D.competitorPrices]);
  for (const w of ['Gowan', 'Isagro', 'Syngenta', 'Bayer', 'BASF', 'Corteva', 'UPL']) assert.ok(!txt.includes(w), w);
  assert.ok(D.competitorPrices.every(o => /\(fantasia\)/.test(o.competitor)));
  const ev = PR.productEvidence(D, 'p-cu30wg');
  assert.equal(ev.n, 3); assert.deepEqual(ev.crops.sort(), ['Olivo', 'Vite']);
  assert.match(PR.evidenceText(ev, 'Cuprarvo 30 WG'), /^Cuprarvo 30 WG è stato provato in 3 prove/);
});

test('leve di risparmio: valori positivi, id unici, dati e stime separati', () => {
  const L = RS.savingsLevers(D, ctx, 'p-cu30wg', P);
  assert.ok(L.length >= 5);
  assert.equal(new Set(L.map(x => x.id)).size, L.length);
  assert.ok(L.every(x => x.perT > 0 && x.year >= 0 && ['dati', 'stima'].includes(x.basis) && x.how && x.detail));
  assert.ok(L.some(x => x.id === 'acq-lotti-cuoh'), 'ordini di rame idrossido sotto lo scaglione da 40 t');
  const port = RS.savingsPortfolio(D, ctx, P);
  assert.ok(port.length >= 15);
  const tot = port.reduce((s, r) => s + r.saveYear, 0), rev = port.reduce((s, r) => s + r.revenue, 0);
  assert.ok(tot > 0 && tot < rev * 0.05, `risparmio plausibile: ${tot} su ${rev}`);
  const e = RS.unitEconomics(D, ctx, 'p-cu30wg', P);
  near(e.perT.pocket - e.perT.full, e.perT.margin, 1e-6);
  near(e.steps.filter(s => s.kind !== 'total').reduce((s, x) => s + x.value, 0) + e.perT.list, e.perT.margin, 1e-6, 'la cascata torna');
});

test('concorrenza a ettaro: il generico costa meno, il rame costa meno a ettaro anche se di più al kg', () => {
  const te = RS.competitorBoard(D, ctx, 'p-te100ec', P);
  near(te.gap, 0.19, 0.04, 'Tetrion più caro a ettaro');
  const cu = RS.competitorBoard(D, ctx, 'p-cu30wg', P);
  const vite = cu.groups.find(g => g.crop === 'vite');
  assert.ok(vite.gap < 0 && vite.gapKg > 0, 'più caro al kg, più conveniente a ettaro');
  assert.equal(vite.cropName, 'Vite');
  const econ = RS.unitEconomics(D, ctx, 'p-te100ec', P);
  const keep = RS.priceStrategy(econ, 100, 0, te), all = RS.priceStrategy(econ, 100, 1, te);
  near(keep.newPrice, keep.price, 1e-9); near(keep.newMargin - keep.margin, 100, 1e-9);
  near(all.newMargin, all.margin, 1e-9); assert.ok(all.newPrice < all.price);
  assert.ok(keep.parity.price < keep.price && keep.parity.marginPctAfter > keep.parity.marginPct);
});

test('segnali: relazione da scrivere e concorrente più conveniente a ettaro', () => {
  const ps = PR.proveSignals(D, { today: T });
  assert.deepEqual(ps.map(s => s.key), ['prove:relazione:tr-2026-06']);
  const rs = RS.risparmiSignals(D, ctx);
  const te = rs.find(s => s.key.startsWith('prodotti:concorrenza:p-te100ec'));
  assert.ok(te && te.severity === 'attenzione');
  assert.ok(rs.every(s => s.link.area === 'prodotti' && s.title && s.why && s.action));
});

test('archivio senza prove, prezzi né vendite: niente errori', () => {
  const e = emptyData();
  assert.deepEqual(PR.proveSignals(e, { today: T }), []);
  assert.deepEqual(RS.risparmiSignals(e, { today: T, facts: [] }), []);
  assert.equal(PR.productEvidence(e, 'x').n, 0);
  const K = PR.trialKpis(e, T); assert.equal(K.n, 0); assert.equal(K.effOwn, null);
  const e2 = { ...e, products: [{ id: 'p', code: 'P', name: 'P', uom: 'kg', listPrice: 5000, actives: [] }] };
  const c2 = { today: T, ix: makeIndex(e2), costs: costsOf(e2, makeIndex(e2)), facts: [] };
  const u = RS.unitEconomics(e2, c2, 'p', P);
  assert.ok(u.std); assert.equal(u.perT.full, null); assert.equal(u.marginPct, null);
  assert.deepEqual(RS.savingsLevers(e2, c2, 'p', P), []);
  assert.equal(RS.priceStrategy(u, 10, 0.5, null), null);
});

/** JPEG minima con EXIF: data dello scatto e posizione GPS (45° 30' 0" N, 9° 12' 36" E). */
function jpegWithExif() {
  const b = [];
  const u16 = v => b.push(v & 255, v >> 8), u32 = v => b.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  // TIFF (little endian): IFD0 a 8 con due voci (ExifIFD, GPS), ExifIFD a 38, GPS IFD a 56, dati da 110
  b.push(0x49, 0x49); u16(42); u32(8);
  u16(2); u16(0x8769); u16(4); u32(1); u32(38); u16(0x8825); u16(4); u32(1); u32(56); u32(0);
  u16(1); u16(0x9003); u16(2); u32(20); u32(110); u32(0);
  u16(4); u16(1); u16(2); u32(2); b.push(78, 0, 0, 0); u16(2); u16(5); u32(3); u32(130); u16(3); u16(2); u32(2); b.push(69, 0, 0, 0); u16(4); u16(5); u32(3); u32(154); u32(0);
  while (b.length < 110) b.push(0);
  for (const ch of '2025:07:04 10:32:05') b.push(ch.charCodeAt(0));
  b.push(0);
  for (const [n, d] of [[45, 1], [30, 1], [0, 1], [9, 1], [12, 1], [36, 1]]) { u32(n); u32(d); }
  const tiff = Uint8Array.from(b);
  const app1 = [0xff, 0xe1, ((tiff.length + 8) >> 8) & 255, (tiff.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0];
  return Uint8Array.from([0xff, 0xd8, ...app1, ...tiff, 0xff, 0xd9]).buffer;
}

test('EXIF delle foto: data e posizione; file non JPEG senza errori', () => {
  const x = readExif(jpegWithExif());
  assert.equal(x.date, '2025-07-04T10:32:05');
  near(x.lat, 45.5, 1e-9); near(x.lon, 9.21, 1e-9);
  assert.deepEqual(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), {});
  assert.deepEqual(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4]).buffer), {});
});

test('un demo salvato con la versione 1 riceve prove, illustrazioni e prezzi una volta sola', () => {
  const old = { ...D, fieldTrials: [], photos: [], competitorPrices: [], settings: { ...D.settings, demoVersion: 1 } };
  const up = upgradeDemo(old);
  assert.equal(up.settings.demoVersion, 2);
  assert.equal(up.fieldTrials.length, D.fieldTrials.length);
  assert.deepEqual(up.competitorPrices.map(x => x.price), D.competitorPrices.map(x => x.price), 'stesso seme, stessi valori');
  assert.equal(upgradeDemo(up), up, 'già aggiornato: niente da fare');
  const own = { ...old, settings: { ...old.settings, dataset: 'proprio' } };
  assert.equal(upgradeDemo(own), own, 'un archivio aziendale non riceve dati dimostrativi');
});
