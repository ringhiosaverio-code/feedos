/* FeedOS 18 · Persone e sicurezza (pacchetto WP5): prove del motore su dati sintetici, sul demo del mangimificio e su quello di DifesaOS.
 * Indici UNI 7249 e VS B9, ore stimate, soppressione dei gruppi piccoli, divario (media, mediana, quartili), obblighi per fascia,
 * pesi della UNI/PdR 125, scadenze della formazione, datapoint B8-B10 e C5, archivi vuoti, scadenze OT23 non duplicate dalla governance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { demoData as agroDemo } from '../../src/editions/agrofarmaci/demo/index.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { rng } from '../../src/core/util.js';
import { currentPeriod, periodByKey } from '../../src/engine/esg-years.js';
import { kpiValue } from '../../src/engine/kpis.js';
import { VS_DP } from '../../src/data/vsme-datapoints.js';
import { headcount as govHeadcount, obligationsFor } from '../../src/engine/esg-governance.js';
import * as E from '../../src/engine/esg-persone.js';
import { personeMarkdown, biennialRows } from '../../src/engine/esg-persone-text.js';
import { demoPersone } from '../../src/data/demo/esg-persone.js';
import { PACK_PERSONE } from '../../src/data/pack-persone.js';

const today = '2026-10-16';
const D = demoData(today);
const AG = agroDemo(today);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const P25 = { key: 'anno-2025', from: '2025-01-01', to: '2025-12-31' };
/** Archivio sintetico: 12 mesi di ore, una fotografia e gli eventi indicati. */
function synth({ hours = 10000, months = 12, injuries = [], fte = 10, extra = {} } = {}) {
  const d = emptyData();
  d.hoursWorked = Array.from({ length: months }, (_, i) => ({ id: `2025-${String(i + 1).padStart(2, '0')}`, month: `2025-${String(i + 1).padStart(2, '0')}`, hours }));
  d.hrSnapshots = [{ id: 'hr-1', date: '2025-12-31', rows: [{ gender: 'M', category: 'operai', contract: 'indeterminato', fullTime: true, headcount: fte, fte }] }];
  d.injuries = injuries.map((x, i) => ({ id: 'i' + i, date: '2025-06-10', kind: 'infortunio', recordable: true, lostDays: 0, fatal: false, ...x }));
  return Object.assign(d, extra);
}

test('persone: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [D, AG, emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), P = currentPeriod(d);
    assert.ok(Array.isArray(E.personeSignals(d, { today, ...ctx })));
    const s = E.personeReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.personeDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    assert.ok(Array.isArray(E.personeCalendarItems(d, today)));
    assert.ok(E.workforce(d, P.key) === null || typeof E.workforce(d, P.key) === 'object');
    assert.ok(E.safetyRates(d, P) === null || typeof E.safetyRates(d, P) === 'object');
  }
  assert.ok(Array.isArray(E.PERSONE_KPIS) && Array.isArray(E.PERSONE_RULES));
  assert.ok(E.PERSONE_METHOD.it && E.PERSONE_METHOD.en);
});

test('archivio vuoto: nessun dato inventato (null, elenchi e oggetti vuoti)', () => {
  const d = emptyData(), P = currentPeriod(d), ctx = makeCtx(d, today);
  assert.equal(E.workforce(d, P.key), null);
  assert.equal(E.safetyRates(d, P), null);
  assert.equal(E.trainingStats(d, P), null);
  assert.equal(E.payGapFor(d, P), null);
  assert.deepEqual(E.personeDatapoints(d, P), {});
  assert.deepEqual(E.personeSignals(d, { today, ...ctx }), []);
  assert.deepEqual(E.personeCalendarItems(d, today), []);
  assert.equal(E.personeReportSection(d, ctx, P, null), null);
  for (const k of E.PERSONE_KPIS) assert.equal(k.compute(d, ctx, P), null, k.id);
  for (const r of E.PERSONE_RULES) assert.equal(r.check(d, ctx, {}).fails.length, 0, r.id);
});

test('indici: IF × 10⁶ e IG × 10³ (UNI 7249), tasso VS B9 × 200.000, in itinere e quasi infortuni fuori dagli indici', () => {
  const d = synth({ injuries: [{ lostDays: 10 }, { lostDays: 5 }, { lostDays: 0 }, { kind: 'quasi-infortunio', recordable: false }, { kind: 'in-itinere', recordable: false, lostDays: 30 }] });
  const r = E.safetyRates(d, P25);
  assert.equal(r.hours, 120000);
  assert.equal(r.hoursQuality, 'misurato');
  assert.equal(r.lti, 2);
  assert.equal(r.recordable, 3);
  near(r.ifr, 2 * 1e6 / 120000);
  near(r.igr, 15 * 1e3 / 120000);
  near(r.b9, 3 * 2e5 / 120000);
  assert.equal(r.nearMiss, 1);
  assert.equal(r.inItinere, 1);
  assert.equal(r.lostDays, 15, 'le giornate dell’in itinere non entrano');
  // un decesso: giornate convenzionali del pacchetto nell'IG, decessi contati
  const f = E.safetyRates(synth({ injuries: [{ lostDays: 0, fatal: true }] }), P25);
  assert.equal(f.fatalities, 1);
  assert.equal(f.lti, 1);
  near(f.igr, 7500 * 1e3 / 120000);
});

test('ore mancanti: stima ETP × 1.720 h ÷ 12 per i soli mesi senza registrazione, dato «stimato» anche nel datapoint B9', () => {
  const d = synth({ months: 6, hours: 1500, fte: 10, injuries: [{ lostDays: 3 }] });
  const H = E.hoursFor(d, P25);
  assert.equal(H.quality, 'stimato');
  assert.deepEqual(H.estimated, ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12']);
  near(H.hours, 6 * 1500 + 6 * 10 * 1720 / 12);
  const dp = E.personeDatapoints(d, P25);
  assert.equal(dp['B9.recordable-rate'].quality, 'stimato');
  assert.match(dp['B9.recordable-rate'].note, /stimate per 6 mesi/);
  assert.equal(dp['B9.hours'].quality, 'stimato');
  // la base delle ore per ETP si cambia nelle impostazioni del pacchetto
  const d2 = { ...d, settings: { ...d.settings, esg18: { persone: { hoursPerFteFallback: 1600 } } } };
  near(E.hoursFor(d2, P25).hours, 6 * 1500 + 6 * 10 * 1600 / 12);
});

test('divario retributivo: media, mediana, quartili, componenti variabili e tempo parziale riportato al tempo pieno', () => {
  const rows = [30, 32, 34, 36, 38].map((k, i) => ({ gender: 'F', category: 'impiegati', fte: 1, baseAnnual: k * 1000, variableAnnual: i === 0 ? 0 : 1000 }))
    .concat([35, 40, 45, 50, 55].map(k => ({ gender: 'M', category: 'impiegati', fte: 1, baseAnnual: k * 1000, variableAnnual: 2000 })));
  const g = E.payGap(rows, { smallCell: 2 });
  near(g.overall.meanF, 34800);
  near(g.overall.meanM, 47000);
  near(g.overall.meanGap, (47000 - 34800) / 47000);
  near(g.overall.medianGap, (47000 - 35000) / 47000);
  assert.deepEqual(g.quartiles.map(q => q.n), [3, 2, 3, 2]);
  assert.equal(g.quartiles[3].shareF, 0, 'il quartile più alto è tutto maschile');
  near(g.variable.gap, (2000 - 800) / 2000);
  near(g.variable.shareF, 0.8);
  assert.equal(g.flag5, true);
  assert.deepEqual(g.flagged, ['impiegati']);
  // tempo parziale: 15.000 € con ETP 0,5 valgono 30.000 € a tempo pieno
  assert.equal(E.ftePay({ fte: 0.5, baseAnnual: 15000, variableAnnual: 0 }), 30000);
});

test('soppressione dei gruppi con meno di 5 persone: valori nulli con nota, elenco dei gruppi soppressi', () => {
  const mk = (g, n, pay, cat = 'operai') => Array.from({ length: n }, () => ({ gender: g, category: cat, fte: 1, baseAnnual: pay }));
  const small = E.payGap([...mk('F', 4, 30000), ...mk('M', 10, 32000)]);
  assert.equal(small.overall.suppressed, true);
  assert.equal(small.overall.meanGap, null);
  assert.equal(small.overall.meanF, null, 'nessuna media del gruppo piccolo');
  assert.match(small.overall.note, /gruppo < 5/);
  assert.ok(small.suppressed.some(s => s.gender === 'F' && s.n === 4));
  const ok = E.payGap([...mk('F', 5, 30000), ...mk('M', 5, 32000)]);
  assert.equal(ok.overall.suppressed, false);
  near(ok.overall.meanGap, 2000 / 32000);
  // nel demo: quadri con una sola donna non mostrati, divario complessivo come nel questionario (6,5%)
  const pg = E.payGapFor(D, currentPeriod(D));
  assert.equal(pg.byCategory.find(c => c.category === 'quadri').suppressed, true);
  near(pg.overall.meanGap, D.survey['pe-gap'] / 100, 0.002);
  // e la media della formazione per genere sparisce sotto 5 persone
  const w = { headcount: 10, byGender: { F: 3, M: 7 } };
  const t = E.trainingStats({ ...synth(), trainings: [{ id: 't', date: '2025-05-05', hours: 4, partF: 3, partM: 7, topic: 'sicurezza' }] }, P25, w);
  assert.equal(t.perF.value, null);
  assert.equal(t.perF.suppressed, true);
  near(t.perM.value, 4);
});

test('trasparenza retributiva e rapporto biennale: obblighi per fascia di dipendenti (D.Lgs. 96/2026, art. 46 D.Lgs. 198/2006)', () => {
  const d = emptyData();
  const at = n => E.payTransparencyDuties(d, n, '2026-10-16');
  assert.equal(at(260).firstReport, '2027-06-07');
  assert.equal(at(260).every, 'ogni anno');
  assert.equal(at(180).firstReport, '2027-06-07');
  assert.equal(at(180).band.status, 'da verificare');
  assert.equal(at(120).firstReport, '2031-06-07');
  assert.equal(at(40).report, false);
  assert.match(at(40).band.note, /diritto di informazione/);
  assert.equal(E.biennialReportDue(d, 51).applies, true);
  assert.equal(E.biennialReportDue(d, 50).applies, false);
  assert.equal(E.biennialReportDue(d, 51).due, '2028-04-30');
});

test('UNI/PdR 125: pesi 15/15/10/20/20/20, soglia del 60%, nessun testo degli indicatori nel pacchetto', () => {
  const it = PACK_PERSONE.items.find(x => x.id === 'pdr125');
  assert.deepEqual(it.areas.map(a => a.weight), [15, 15, 10, 20, 20, 20]);
  assert.equal(it.areas.reduce((s, a) => s + a.weight, 0), 100);
  assert.ok(it.areas.every(a => Object.keys(a).sort().join() === 'id,label,weight'), 'solo id, nome e peso delle aree');
  const all = E.pdr125Score({ cultura: 100, governance: 100, processiHR: 100, crescita: 100, equita: 100, genitorialita: 100 });
  assert.equal(all.total, 100);
  const s = E.pdr125Score({ cultura: 60, governance: 45, processiHR: 70, crescita: 40, equita: 55, genitorialita: 50 });
  near(s.total, 51.75);
  assert.equal(s.pass, false);
  assert.equal(s.weakest.id, 'crescita');
  assert.equal(E.pdr125Score({ cultura: 80 }).complete, false);
});

test('formazione: scadenza dalla validità del corso o dal pacchetto, ultima sessione della serie, segnale entro 30 giorni', () => {
  const d = synth({ extra: { trainings: [
    { id: 'c1', date: '2016-11-10', course: 'Carrelli', topic: 'carrelli', hours: 4, partM: 5, mandatory: true, validMonths: 60 },
    { id: 'c2', date: '2021-11-10', course: 'Carrelli', topic: 'carrelli', hours: 4, partM: 5, mandatory: true },
    { id: 'p1', date: '2024-01-15', course: 'Primo soccorso', topic: 'primo-soccorso', hours: 4, partF: 1, partM: 2, mandatory: true, validMonths: 36 },
    { id: 'x', date: '2024-03-01', course: 'Excel', topic: 'tecnica', hours: 6, partF: 2, mandatory: false },
  ] } });
  const xs = E.trainingExpiries(d, today);
  const car = xs.find(x => x.topic === 'carrelli');
  assert.equal(car.id, 'c2', 'vale l’ultima sessione');
  assert.equal(car.due, '2026-11-10', 'periodicità di base del pacchetto (60 mesi)');
  assert.equal(car.validSrc, 'pacchetto');
  assert.equal(car.status, 'in scadenza');
  assert.equal(xs.find(x => x.topic === 'primo-soccorso').due, '2027-01-15');
  assert.ok(!xs.some(x => x.topic === 'tecnica'), 'solo i corsi obbligatori');
  const sig = E.personeSignals(d, { today });
  assert.ok(sig.some(s => s.key === 'persone:training-expiry:c2:2026-11-10' && s.severity === 'attenzione'));
  assert.ok(E.personeCalendarItems(d, today).some(c => c.key === 'persone:formazione:c2:2026-11-10' && c.kind === 'rinnovo'));
});

test('organico e helper per la governance: turnover sulla media, dirigenza, headcount letto dalla governance', () => {
  const P = currentPeriod(D);
  const w = E.workforce(D, P.key);
  assert.equal(w.headcount, 31);
  const cat = D.survey['pe-cat'];
  assert.deepEqual([w.byCategory.dirigenti.total, w.byCategory.quadri.total, w.byCategory.impiegati.total, w.byCategory.operai.total], [cat.Dirigenti, cat.Quadri, cat.Impiegati, cat.Operai]);
  near(w.womenShare * 100, D.survey['pe-women'], 1);
  near(w.turnover, w.leavers.total / ((w.start.headcount + w.headcount) / 2));
  near(w.turnover * 100, D.survey['pe-turnover'], 0.1);
  assert.equal(w.mgmt.F, 1);
  near(w.mgmt.ratio, 1 / 5);
  assert.deepEqual(govHeadcount(D), { value: 31, src: 'Persone e sicurezza' });
  assert.equal(E.workforce(D, P).headcount, 31, 'accetta anche il periodo come oggetto');
});

test('datapoint B1, B8, B9, B10 e C5 sul demo: id del catalogo VS, valori coerenti, fonte persone.*', () => {
  const P = currentPeriod(D);
  const dp = E.personeDatapoints(D, P), r = E.safetyRates(D, P);
  for (const id of ['B1.employees', 'B8.by-contract', 'B8.by-gender', 'B8.turnover', 'B9.recordable', 'B9.recordable-rate', 'B9.fatalities', 'B10.min-wage', 'B10.ccnl', 'B10.training-h', 'B10.pay-gap', 'C5.mgmt-ratio', 'C5.self-employed', 'C5.agency']) {
    assert.ok(dp[id], 'manca ' + id);
    assert.ok(VS_DP[id], id + ' nel catalogo VS');
    assert.ok(dp[id].source.startsWith('persone.'));
  }
  assert.equal(dp['B1.employees'].value, 31);
  assert.deepEqual(dp['B8.by-gender'].value, { donne: 7, uomini: 24 });
  assert.equal(dp['B8.by-contract'].value.indeterminato + dp['B8.by-contract'].value.determinato, 31);
  near(dp['B9.recordable-rate'].value, Math.round(r.recordable * 2e5 / r.hours * 100) / 100);
  assert.equal(dp['B9.fatalities'].value, 0);
  assert.ok(dp['B10.training-h'].value.donne > 0 && dp['B10.training-h'].value.uomini > 0);
  near(dp['B10.pay-gap'].value, 6.5, 0.15);
  assert.ok(dp['B9.recordable-rate'].evidence?.length, 'evidenze collegate dal registro della governance');
  // infortuni del demo coerenti con il questionario (1 infortunio con assenza, 12 giorni) e ore vicine a 52.000
  assert.equal(r.lti, D.survey['hs-inj']);
  assert.equal(r.lostDays, D.survey['hs-days']);
  near(r.hours, D.survey['hs-hours'], 1);
});

test('KPI: stessi valori del motore, null senza dati, kpiValue dal catalogo', () => {
  const P = currentPeriod(D), ctx = makeCtx(D, today);
  const K = Object.fromEntries(E.PERSONE_KPIS.map(k => [k.id, k]));
  near(K['esg-if'].compute(D, ctx, P), E.safetyRates(D, P).ifr);
  near(K['esg-b9'].compute(D, ctx, P), E.safetyRates(D, P).b9);
  near(K['esg-donne-resp'].compute(D, ctx, P), 1 / 6);
  near(kpiValue(D, ctx, 'esg-gap-genere', P), 0.065, 0.002);
  assert.ok(kpiValue(D, ctx, 'esg-formazione-h', P) > 15);
});

test('scadenze: chiave OT23 con «ot23» (la governance la segna «altrove»), niente doppioni, segnali del demo', () => {
  const cal = E.personeCalendarItems(D, today);
  const ot = cal.find(c => c.key.includes('ot23'));
  assert.equal(ot.date, '2027-02-28');
  assert.equal(new Set(cal.map(c => c.key)).size, cal.length);
  const o = obligationsFor(D, today).find(x => x.id === 'ot23');
  assert.equal(o.status, 'altrove');
  const sig = E.personeSignals(D, { today, ...makeCtx(D, today) });
  assert.ok(sig.some(s => s.key.startsWith('persone:training-expiry:tr-carrelli')));
  assert.ok(sig.some(s => s.key === 'persone:action-late:sa-04'));
  assert.ok(sig.every(s => s.key.startsWith('persone:') && s.link.tab === 'persone'));
  // a gennaio il promemoria OT23 per l'anno prima (domanda non presentata)
  assert.ok(E.personeSignals(D, { today: '2027-01-20' }).some(s => s.key === 'persone:ot23:2026' && s.severity === 'info'));
});

test('DifesaOS: organico di 58 persone, formazione su Seveso, ADR, rischio chimico e DPI, nessuna parola del mangimificio', () => {
  const P = currentPeriod(AG);
  assert.equal(E.workforce(AG, P).headcount, 58);
  const topics = new Set(AG.trainings.map(t => t.topic));
  for (const t of ['Seveso', 'ADR', 'rischio-chimico', 'DPI-3']) assert.ok(topics.has(t), t);
  const txt = JSON.stringify(['hrSnapshots', 'hoursWorked', 'injuries', 'trainings', 'payData', 'pdr125', 'ot23', 'safetyActions'].map(c => AG[c]));
  assert.ok(!/mangim|soia|pellet|silo|insacc|HACCP/i.test(txt), 'contenuti del settore agrofarmaci');
  assert.equal(E.sectorBand(AG), null, 'nessun riferimento di settore inventato per gli agrofarmaci');
  assert.equal(E.sectorBand(D).lo, 14);
  // divario per categoria oltre il 5% tra gli impiegati: segnale per categoria anche con divario complessivo basso
  const pg = E.payGapFor(AG, P);
  assert.equal(pg.flag5, true);
  assert.ok(E.personeSignals(AG, { today }).some(s => s.key.startsWith('persone:paygap:') && /impiegati/.test(s.title)));
});

test('esportazioni: scheda in inglese, tabelle del rapporto biennale senza valori di gruppi piccoli', () => {
  const S = E.personeSummary(D, currentPeriod(D));
  const en = personeMarkdown(S, 'en', 'Demo');
  assert.match(en, /Frequency rate \(UNI 7249/);
  assert.match(en, /fewer than 5 people/);
  assert.match(personeMarkdown(S, 'it'), /Indice di frequenza/);
  const rows = biennialRows(S);
  const q = rows.find(r => /Retribuzione/.test(r.sezione) && r.voce === 'Quadri');
  assert.equal(q.donne, null);
  assert.match(q.nota, /non mostrata/);
  assert.equal(rows.filter(r => /Organico al/.test(r.sezione)).reduce((s, r) => s + r.totale, 0), 31);
});

test('dati dimostrativi: deterministici, idempotenti sul demo completo, solo raccolte del pacchetto', () => {
  const g = generateDemo({ today });
  const a = demoPersone(g, { today, R: rng(16 + 1301) }), b = demoPersone(g, { today, R: rng(16 + 1301) });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a), ['add']);
  assert.deepEqual(Object.keys(a.add).sort(), ['hoursWorked', 'hrSnapshots', 'injuries', 'ot23', 'payData', 'pdr125', 'safetyActions', 'trainings']);
  assert.deepEqual(demoPersone(D, { today, R: rng(1) }), {});
  // nessun nome di persona: solo codici pseudonimi
  assert.ok(D.payData.every(r => /^P\d{3}$/.test(r.code) && !('name' in r)));
  assert.ok(periodByKey(D, D.payData[0].periodKey));
});
