/* FeedOS 18 · Registri ambientali (pacchetto WP9): prove dei calcoli (giorni lavorativi, RENTRI, MUD, acqua, camini, ENPI, anomalie),
 * dei datapoint, delle scadenze e del demo nelle due edizioni. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { demoData as agroDemoData } from '../../src/editions/agrofarmaci/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import { demoAmbiente } from '../../src/data/demo/esg-ambiente.js';
import * as E from '../../src/engine/esg-ambiente.js';
import * as C from '../../src/engine/esg-ambiente-calc.js';
import * as S from '../../src/engine/esg-ambiente-stats.js';

const today = '2026-10-16';
const D = demoData(today);
const AGRO = agroDemoData(today);
const P = currentPeriod(D);

/** Archivio minimo costruito a mano: righe di rifiuti, registrazioni, acqua, camini, energia e produzione. */
function handmade(over = {}) {
  return { ...emptyData(), settings: { ...emptyData().settings, dataset: 'demo', demoAnchor: today, esg18: { ambiente: { waterStress: 'basso' } } },
    lines: [{ id: 'L1', kind: 'pellet' }, { id: 'L3', kind: 'farina' }], ...over };
}
const wrow = (id, date, kg, extra = {}) => ({ id, date, eer: '15 01 02', name: 'Imballaggi in plastica', kg, dest: 'recupero', op: 'R13', fir: 'FIR ' + id, ...extra });

test('festività e giorni lavorativi: Pasquetta, fine settimana, ponte del 2 aprile 2026', () => {
  assert.equal(C.easterSunday(2026), '2026-04-05');
  assert.equal(C.easterSunday(2027), '2027-03-28');
  assert.equal(C.easterSunday(2025), '2025-04-20');
  assert.ok(C.italianHolidays(2026).has('2026-04-06'), 'Pasquetta');
  assert.ok(C.italianHolidays(2026).has('2026-12-26'), 'Santo Stefano');
  assert.equal(C.isWorkingDay('2026-04-06'), false);
  assert.equal(C.isWorkingDay('2026-04-04'), false, 'sabato');
  assert.equal(C.isWorkingDay('2026-04-07'), true);
  // 2 aprile (giovedì) + 10 giorni lavorativi: 3, 7, 8, 9, 10, 13, 14, 15, 16, 17 aprile → 17 aprile
  assert.equal(C.addWorkingDays('2026-04-02', 10), '2026-04-17');
  assert.equal(C.workingDaysBetween('2026-04-02', '2026-04-17'), 10);
});

test('RENTRI: registrazione nei termini, in ritardo, non registrata, xFIR mancante dopo il 15/09/2026', () => {
  const d = handmade({
    waste: [
      wrow('w1', '2026-09-01', 100), // registrato in tempo
      wrow('w2', '2026-09-02', 200), // registrato oltre i 10 giorni lavorativi
      wrow('w3', '2026-09-03', 300), // mai registrato, termine passato
      wrow('w4', '2026-09-16', 400, { eer: '15 01 06' }), // dopo il 15/09 e registrato senza xFIR
    ],
    wasteRentri: [
      { id: 'w1', registeredAt: '2026-09-03', xfirId: undefined },
      { id: 'w2', registeredAt: '2026-09-25' },
      { id: 'w4', registeredAt: '2026-09-18' },
    ],
  });
  const R = C.rentriSummary(d, '2026-10-16', null);
  const st = Object.fromEntries(R.rows.map(r => [r.id, r.status]));
  assert.equal(st.w1, 'regolare');
  assert.equal(st.w2, 'in ritardo');
  assert.equal(st.w3, 'in ritardo');
  assert.equal(st.w4, 'xFIR mancante');
  assert.equal(R.total, 4);
  assert.equal(R.registered, 3);
  assert.equal(R.completeness, 0.75);
  assert.equal(R.xfirMissing, 1, 'solo il movimento dopo il 15/09 senza xFIR');
});

test('recupero finale: contano solo le R1–R12; la R13 e la D15 restano in attesa dell’operazione finale', () => {
  const d = handmade({
    waste: [wrow('a', '2026-05-01', 1000, { op: 'R3' }), wrow('b', '2026-05-02', 500, { op: 'R13' }), wrow('c', '2026-05-03', 200, { op: 'R13' }),
      wrow('e', '2026-05-04', 100, { op: 'D15', dest: 'smaltimento' })],
    wasteRentri: [{ id: 'b', registeredAt: '2026-05-05', opFinal: 'R13' }, { id: 'c', registeredAt: '2026-05-05', opFinal: 'R12' }, { id: 'e', registeredAt: '2026-05-05', opFinal: 'D15' }],
  });
  const R = C.rentriSummary(d, '2026-10-16', null);
  assert.equal(R.kg, 1800);
  assert.equal(R.finalKg, 1000 + 200, 'R3 e R12 entrano, la R13 no');
  assert.equal(R.pendingKg, 500 + 100, 'R13 senza operazione finale e D15');
  assert.ok(Math.abs(R.finalRecoveryPct - 1200 / 1800) < 1e-9);
  const K = E.AMBIENTE_KPIS.find(k => k.id === 'esg-recupero-finale');
  assert.ok(Math.abs(K.compute(d, { today: '2026-10-16' }, { from: '2026-05-01', to: '2026-05-31', key: 'x' }) - 1200 / 1800 * 100) < 1e-9);
});

test('MUD: le somme per EER, operazione e destinazione coincidono con il registro dell’anno', () => {
  const d = handmade({
    waste: [wrow('m1', '2026-02-10', 300, { op: 'R3' }), wrow('m2', '2026-03-10', 120, { op: 'R3', eer: '07 04 01*', dest: 'smaltimento' }), wrow('m3', '2025-12-31', 999, { op: 'R3' })],
    wasteRentri: [{ id: 'm1', registeredAt: '2026-02-12' }],
  });
  const M = C.mudSummary(d, '2026-10-16', 2026);
  assert.equal(M.n, 2, 'il movimento del 2025 è escluso');
  assert.equal(M.kg, 420);
  assert.equal(M.lines.reduce((s, x) => s + x.kg, 0), M.kg, 'le righe sommano il totale');
  assert.equal(M.hazKg, 120, 'il codice con asterisco è pericoloso');
});

test('acqua: consumo = prelievo − scarico per mese; scarico maggiore del prelievo segnalato (R54)', () => {
  const d = handmade({
    water: [{ id: 'a1', month: '2026-05', source: 'Acquedotto', m3: 100 }, { id: 'a2', month: '2026-05', source: 'Pozzo', m3: 50 }, { id: 'a3', month: '2026-06', source: 'Pozzo', m3: 80 }],
    waterDischarges: [{ id: 's1', month: '2026-05', point: 'Fognatura', receptor: 'fognatura', m3: 90, analyses: [] }, { id: 's2', month: '2026-06', point: 'Fognatura', receptor: 'fognatura', m3: 100, analyses: [] }],
  });
  const W = C.waterBalance(d, { from: '2026-05-01', to: '2026-06-30', key: '12m-2026-06' });
  const m5 = W.months.find(m => m.month === '2026-05'), m6 = W.months.find(m => m.month === '2026-06');
  assert.equal(m5.consumption, 150 - 90);
  assert.equal(m6.consumption, -20, 'il consumo negativo è l’anomalia che la regola R54 segnala');
  assert.deepEqual(W.over, ['2026-06']);
  const rule = E.AMBIENTE_RULES.find(r => r.id === 'R54').check(d, { today: '2026-10-16' });
  assert.equal(rule.fails.length, 1);
  assert.equal(W.highStress, false, 'stress «basso»: nessun prelievo in aree ad alto stress');
});

test('camini: kg/anno = media mg/Nm³ × Nm³/h × ore ÷ 10⁶; superamenti; prossimo campionamento', () => {
  const d = handmade({
    stacks: [{ id: 'k1', code: 'E1', origin: 'ricevimento', pollutant: 'polveri', flowNm3h: 10000, hoursYear: 1000, limitMgNm3: 10, freqMonths: 6 }],
    stackSamples: [{ id: 'q1', stackId: 'k1', date: '2026-01-10', valueMgNm3: 4 }, { id: 'q2', stackId: 'k1', date: '2026-06-10', valueMgNm3: 6 }],
  });
  const Pm = { from: '2025-10-01', to: '2026-09-30', key: '12m-2026-09' };
  const SE = C.stackEmissions(d, Pm, '2026-10-16');
  assert.equal(SE.stacks[0].mean, 5);
  assert.equal(SE.stacks[0].kgYr, 50, '5 × 10000 × 1000 ÷ 10⁶ = 50 kg/anno');
  assert.equal(C.dueDate('2026-06-10', 6), '2026-12-10');
  assert.equal(C.dueDate('2026-08-31', 6), '2027-02-28', 'il giorno si ferma all’ultimo del mese');
  assert.equal(C.dueState('2026-12-10', '2026-10-16'), 'in regola');
  assert.equal(C.dueState('2026-10-20', '2026-10-16'), 'entro 30 giorni');
  const hot = handmade({ stacks: d.stacks, stackSamples: [...d.stackSamples, { id: 'q3', stackId: 'k1', date: '2026-07-01', valueMgNm3: 14 }] });
  const sig = E.ambienteSignals(hot, { today: '2026-10-16' });
  assert.ok(sig.some(s => s.key === 'amb:stack-exceed:q3' && s.severity === 'critico'), 'un campione sopra il limite è critico');
});

test('ENPI: su dati sintetici esatti il modello ha R² = 1 e recupera i coefficienti', () => {
  const xs = [[1, 100, 20], [1, 120, 25], [1, 90, 30], [1, 150, 10], [1, 110, 40], [1, 130, 15], [1, 95, 22], [1, 160, 35], [1, 105, 28]];
  const y = xs.map(([a, t1, t2]) => 15000 + 22 * t1 + 6 * t2);
  const fit = S.olsFit(xs, y);
  assert.ok(Math.abs(fit.beta[0] - 15000) < 1e-6 && Math.abs(fit.beta[1] - 22) < 1e-9 && Math.abs(fit.beta[2] - 6) < 1e-9, JSON.stringify(fit.beta));
  assert.ok(Math.abs(fit.r2 - 1) < 1e-9, 'R² = 1');
  assert.equal(S.olsFit([[1, 1, 2], [1, 2, 3]], [1, 2]), null, 'due mesi non bastano per tre coefficienti');
});

test('MAD: un errore di unità ×1000 viene riconosciuto e l’anomalia rimanda ai record di origine', () => {
  const xs = [10, 11, 9, 10.5, 9.8, 10.2, 10000, 10.1];
  const sc = S.madScores(xs);
  assert.ok(sc.z[6] > 1000, 'z robusto enorme per il valore ×1000');
  assert.ok(Math.abs(sc.z[0]) < 2, 'i valori normali restano nella norma');
  // registro con una linea di produzione: il mese con kWh/t ×1000 diventa un’anomalia con i suoi record
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  const runs = months.map((m, i) => ({ id: `r-${m}`, date: `${m}-01`, lineId: 'L1', tonnes: 100, kwh: 2000 * (i === 6 ? 1000 : 1) }));
  const d = handmade({ runs, energy: [], waste: [], water: [] });
  const an = S.anomalyList(d, '2026-10-16', { K: 3.5, P: null }).find(a => a.metric === 'kwh-t-L1' && a.month === '2026-05');
  assert.ok(an, 'anomalia trovata');
  assert.equal(an.unitError, true);
  assert.deepEqual(an.records, ['r-2026-05']);
});

test('ENPI sull’archivio dimostrativo: modello stabile, R² alto, nessuna deriva nei mesi precedenti al controllo', () => {
  const M = S.enpiModel(D, '2026-10-16');
  assert.equal(M.ok, true);
  assert.ok(M.r2 > 0.9, `R² ${M.r2}`);
  assert.ok(M.beta.b > 10 && M.beta.b < 40, 'kWh per tonnellata della linea principale');
  assert.ok(M.monitorMonths.length === 3 && M.rows.filter(r => r.monitor).length === 3);
});

test('datapoint B4, B6 e B7 con le fonti del pacchetto; archivio vuoto e di partenza senza errori', () => {
  const dps = E.ambienteDatapoints(D, P);
  assert.equal(typeof dps['B6.withdrawal'].value, 'number');
  assert.equal(dps['B6.withdrawal'].unit, 'm³');
  assert.ok(Array.isArray(dps['B4.pollutants'].value) && dps['B4.pollutants'].value.some(x => /Polveri/.test(x.label)));
  assert.ok(dps['B7.diverted'].value <= dps['B7.waste-haz'].value + dps['B7.waste-nonhaz'].value, 'il recupero non supera i rifiuti');
  for (const dp of Object.values(dps)) assert.ok(dp.source.startsWith('ambiente.'), dp.source);
  const e = emptyData(), ectx = makeCtx(e, today), eP = currentPeriod(e);
  assert.deepEqual(E.ambienteSignals(e, ectx), [], 'archivio vuoto: nessun segnale');
  assert.equal(E.ambienteReportSection(e, ectx, eP, null), null, 'archivio vuoto: nessuna sezione');
  assert.deepEqual(E.ambienteDatapoints(e, eP), {});
  assert.deepEqual(E.ambienteCalendarItems(e, today), []);
  for (const k of E.AMBIENTE_KPIS) { const v = k.compute(e, ectx, eP); assert.ok(v == null || Number.isFinite(v), k.id); }
  for (const r of E.AMBIENTE_RULES) { const out = r.check(e, ectx, {}); assert.ok(out.base >= 1 && Array.isArray(out.fails), r.id); }
  const s = starterData(), sctx = makeCtx(s, today), sP = currentPeriod(s);
  assert.ok(E.ambienteSignals(s, sctx).every(x => x.key.startsWith('amb:')), 'archivio di partenza: segnali validi');
  const sec = E.ambienteReportSection(s, sctx, sP, null);
  assert.ok(sec === null || typeof sec.title === 'string');
  assert.ok(E.ambienteCalendarItems(s, today).every(x => x.key.includes('stack')));
  for (const k of E.AMBIENTE_KPIS) { const v = k.compute(s, sctx, sP); assert.ok(v == null || Number.isFinite(v), k.id); }
});

test('scadenze: chiavi con «stack» (governance le abbina così), uniche e con norma e «valido al»', () => {
  const items = E.ambienteCalendarItems(D, today);
  assert.ok(items.length >= 4);
  const keys = items.map(x => x.key);
  assert.equal(new Set(keys).size, keys.length, 'chiavi uniche');
  assert.ok(keys.every(k => k.includes('stack')), keys.join(', '));
  assert.ok(items.every(x => x.area === 'esg' && x.pkg === 'ambiente' && x.link.tab === 'ambiente' && /^\d{4}-\d{2}-\d{2}$/.test(x.date)));
  const mud = items.find(x => x.key === 'ambiente:stack:mud:2027');
  assert.equal(mud.validAsOf, '2026-10-21');
});

test('demo: idempotente e deterministico; DifesaOS senza parole del mangimificio', () => {
  const rng = seed => { let s = seed; return { range: (a, b) => a + (b - a) * ((s = (s * 16807) % 2147483647) / 2147483647), int: (a, b) => a + Math.floor(((s = (s * 16807) % 2147483647) / 2147483647) * (b - a + 1)) }; };
  const dd = demoData(today);
  const again = demoAmbiente(dd, { today, R: rng(1) });
  assert.deepEqual(again, {}, 'con i dati già presenti non aggiunge nulla');
  const agroAdd = AGRO.stacks.length ? JSON.stringify([AGRO.stacks, AGRO.waterDischarges, AGRO.wasteRentri]) : '';
  const WORDS = /mangim|soia|pellet|suin|bovin|avicol|ruminant/i;
  assert.ok(agroAdd && !WORDS.test(agroAdd), 'nessuna parola del mangimificio nei dati dell’azienda di agrofarmaci');
  const agroSig = E.ambienteSignals(AGRO, { today }).map(x => `${x.title} ${x.why} ${x.action}`).join(' ');
  const agroText = E.ambienteReportSection(AGRO, { today }, currentPeriod(AGRO), null);
  assert.ok(!WORDS.test(agroSig) && !WORDS.test(JSON.stringify(agroText)), 'segnali e sezione senza parole del mangimificio');
  assert.ok(AGRO.stacks.some(s => /essiccatore/i.test(s.name)) && AGRO.stacks.some(s => /solvent/i.test(s.name)), 'camini dell’essiccatore e dello scrubber');
  assert.equal(E.ambienteSettings(AGRO).benchmark, null, 'nessun riferimento di settore per gli agrofarmaci');
  assert.ok(E.ambienteSettings(D).benchmark && E.ambienteSettings(D).benchmark.elPellet === 33, 'mangimificio: 33 kWh/t di riferimento');
});
