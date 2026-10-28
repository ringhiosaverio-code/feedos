import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo, DEMO_VERSION } from '../../src/data/demo/generator.js';
import { upgradeDemo, starterData } from '../../src/data/demo/index.js';
import { computeKpis } from '../../src/engine/esg.js';
import { computeSignals } from '../../src/engine/signals.js';
import { waterStats, wasteStats, ghgInventory, surveyKpis, surveyProgress, overview, closedMonths, HOURS_PER_FTE } from '../../src/engine/sustainability.js';
import { SURVEY_QUESTIONS, QUESTION } from '../../src/data/survey.js';
import { EER, isHazardous } from '../../src/data/eer.js';
import { DEFAULTS } from '../../src/engine/energy.js';

const today = '2026-10-16';
const P = { from: '2025-10-17', to: today };
const d = generateDemo({ today });

test('acqua: dodici mesi chiusi, intensità plausibile, perdita degli ultimi tre mesi', () => {
  const W = waterStats(d, P);
  assert.equal(W.nMonths, 12);
  assert.deepEqual(W.months.map(m => m.month), closedMonths(today, 12));
  assert.ok(W.intensity > 0.03 && W.intensity < 0.08, `intensità ${W.intensity} m³/t`);
  assert.ok(W.drift > 0.12, `aumento ${W.drift}`);
  assert.ok(W.sourceDrift.Acquedotto > 0.3 && Math.abs(W.sourceDrift.Pozzo) < 0.1);
  assert.equal(Math.round(W.m3), Math.round(W.months.reduce((s, m) => s + m.m3, 0)));
});

test('acqua: un mese con la produzione registrata solo in parte non entra nei litri per tonnellata', () => {
  const W = waterStats(d, P);
  assert.deepEqual(W.partial, ['2025-10'], 'nel demo le lavorazioni sono registrate dal 20 ottobre 2025');
  assert.equal(W.months[0].perT, null);
  assert.ok(W.months[0].m3 > 0, 'la lettura del contatore resta nel prelievo');
  const full = W.months.filter(m => !m.partial), tot = k => full.reduce((s, m) => s + m[k], 0);
  assert.ok(Math.abs(W.intensity - tot('m3') / tot('tonnes')) < 1e-12);
  // registro sintetico: lavorazioni dal 2 marzo al 18 maggio, letture di marzo, aprile e maggio
  const runs = ['2026-03-02', '2026-04-15', '2026-05-18'].map((date, i) => ({ id: 'r' + i, date, tonnes: 1000 }));
  const water = ['2026-03', '2026-04', '2026-05'].map(month => ({ id: 'w' + month, month, source: 'Pozzo', m3: 50 }));
  const S = waterStats({ runs, water }, { from: '2026-03-01', to: '2026-06-30' });
  assert.deepEqual(S.partial, ['2026-05'], 'maggio: lavorazioni registrate solo fino al 18');
  assert.deepEqual(S.months.map(m => m.perT), [0.05, 0.05, null]);
  assert.equal(S.m3, 150);
  assert.equal(S.intensity, 0.05);
});

test('rifiuti: pericolosi dal codice EER, recupero, opportunità', () => {
  assert.ok(isHazardous('15 01 10*') && !isHazardous('15 01 01'));
  assert.equal(new Set(EER.map(e => e.code)).size, EER.length);
  const S = wasteStats(d, P);
  assert.ok(S.recovery > 0.7 && S.recovery < 0.9, `recupero ${S.recovery}`);
  assert.equal(Math.round(S.recKg + S.disposedKg), Math.round(S.kg));
  assert.ok(S.hazKg > 0 && S.hazKg < S.kg * 0.1);
  assert.ok(S.missed.some(c => c.code === '15 01 06'), 'imballaggi misti smaltiti tra le opportunità');
  assert.ok(!S.missed.some(c => c.code === '20 03 01'), 'i rifiuti urbani indifferenziati non sono un’opportunità');
});

test('Scope 1-2-3: combustibili aggiuntivi e intensità', () => {
  const b = { scope1: 100, scope2: 50 };
  const g = ghgInventory({ energy: b, survey: { 'en-gas': 1000, 'en-diesel': 1000 }, ingCO2Kg: 2e6, tonnes: 10000, revenue: 20e6, factors: DEFAULTS });
  assert.ok(Math.abs(g.s1Gas - 1.975) < 1e-9 && Math.abs(g.s1Diesel - 2.65) < 1e-9);
  assert.ok(Math.abs(g.scope1 - 104.625) < 1e-9);
  assert.equal(g.scope3, 2000);
  assert.ok(Math.abs(g.perT - (104.625 + 50 + 2000) * 1000 / 10000) < 1e-9);
  assert.ok(Math.abs(g.perMEur - 154.625 / 20) < 1e-9);
});

test('dal questionario agli indicatori: indici infortuni, organico, governance', () => {
  const k = surveyKpis({ 'pe-cat': { Dirigenti: 2, Operai: 18 }, 'hs-inj': 2, 'hs-days': 30, 'hs-hours': 40000, 'gv-board': 'si', 'gv-board-n': 4, 'gv-board-w': 1, 'et-231': 'no', 'hs-iso': 'si', 'et-certs': ['ISO 9001'] });
  assert.equal(k.S1[0], 20);
  assert.equal(k.S2[0], 2 * 1e6 / 40000);
  assert.equal(k.S3[0], 30 * 1e3 / 40000);
  assert.equal(k.G1[0], '4 consiglieri (1 donna, 25%)');
  assert.equal(k.G2[0], 'No');
  assert.equal(k.G5[0], 'ISO 9001; ISO 45001');
  const est = surveyKpis({ 'pe-cat': { Operai: 10 }, 'hs-inj': 1 });
  assert.equal(est.S2[0], 1e6 / (10 * HOURS_PER_FTE));
  assert.match(est.S2[2], /ore stimate/);
  assert.deepEqual(surveyKpis({}), {});
});

test('precedenza delle fonti: dati > questionario > inserimento manuale', () => {
  const x = { ...d, esgManual: { ...d.esgManual, E9: 1, S4: 99, G9: 'No', E16: 4.2 }, survey: { ...d.survey, 'tr-hours': 22 } };
  const K = Object.fromEntries(computeKpis(x, P).kpis.map(k => [k.code, k]));
  assert.equal(K.E9.source, 'auto'); assert.ok(K.E9.value > 1000);
  assert.equal(K.S4.source, 'questionario'); assert.equal(K.S4.value, 22);
  assert.equal(K.G9.source, 'questionario'); assert.equal(K.G9.value, 'Sì');
  assert.equal(K.E16.source, 'manuale');
  assert.equal(K.E11.source, 'auto');
});

test('questionario: id unici, condizioni, avanzamento', () => {
  assert.equal(new Set(SURVEY_QUESTIONS.map(q => q.id)).size, SURVEY_QUESTIONS.length);
  for (const q of SURVEY_QUESTIONS) if (q.when) assert.ok(QUESTION[q.when.q], `condizione di ${q.id}`);
  const p0 = surveyProgress({});
  const p1 = surveyProgress({ 'em-target': 'si' });
  assert.equal(p0.done, 0);
  assert.equal(p1.total, p0.total + 3, 'tre domande compaiono con un obiettivo di riduzione');
  assert.equal(p1.done, 1);
});

test('maturità ESG e prossimi passi', () => {
  const R = computeKpis(d, P);
  const o = overview(d, P, R);
  assert.ok(o.score.score > 40 && o.score.score < 80, `punteggio ${o.score.score}`);
  assert.ok(o.steps.length > 0 && o.steps[0].pts >= o.steps[o.steps.length - 1].pts);
  const empty = { ...d, survey: {}, water: [], waste: [] };
  const oe = overview(empty, P, computeKpis(empty, P));
  assert.ok(oe.score.score < o.score.score);
  assert.ok(oe.steps.some(s => s.unknown && s.q));
  assert.equal(o.requested.length, 32);
  assert.ok(o.suggest.suppliers > 0 && o.suggest.empBand === '11-50');
});

test('segnali di acqua e rifiuti nel mangimificio dimostrativo', () => {
  const s = computeSignals(d, today);
  assert.ok(s.some(x => x.key.startsWith('water-drift:')));
  assert.ok(s.some(x => x.key.startsWith('waste-missed:')));
  assert.ok(!s.some(x => x.key.startsWith('esg-water:')), 'la lettura del mese scorso c’è');
});

test('archivio dimostrativo di una versione precedente: aggiunge acqua, rifiuti e questionario', () => {
  const old = { ...d, water: [], waste: [], survey: {}, settings: { ...d.settings, demoVersion: 1 } };
  const up = upgradeDemo(old);
  assert.ok(up.water.length > 0 && up.waste.length > 0 && Object.keys(up.survey).length > 20);
  assert.equal(up.settings.demoVersion, DEMO_VERSION);
  assert.equal(up.runs, old.runs, 'il resto dell’archivio non cambia');
  const mine = starterData();
  assert.equal(upgradeDemo(mine), mine, 'un archivio aziendale non viene toccato');
  assert.equal(upgradeDemo(d), d, 'un archivio già aggiornato non viene toccato');
});
