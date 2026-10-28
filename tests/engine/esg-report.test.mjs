/* FeedOS 18 · Report e questionari (pacchetto WP4 «report»): catalogo VS, copertura rigorosa, raccolta uguale al registro,
 * testi IT/EN, chiusura con impronta e quattro occhi, storico, questionari (collegamento, oltre il VS, CSV), materialità,
 * segnali, sezione, KPI, regole, dati dimostrativi, archivio vuoto. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { currentPeriod, reportingPeriods, periodByKey } from '../../src/engine/esg-years.js';
import { resolvePeriod } from '../../src/core/period.js';
import { collectDatapoints } from '../../src/engine/esg-registry.js';
import { sha256HexSync, canonicalJson } from '../../src/core/hash.js';
import * as E from '../../src/engine/esg-report.js';
import { narratives, vsmeCsv, vsmeJson, efragCsv, vsmeMarkdown, bankMarkdown } from '../../src/engine/esg-report-text.js';
import { suggestMapping, fillQuestionnaire, parseQuestionnaireCsv, questionnaireOps, answersCsv, materialityMatrix, iroLibrary, scoreIro, templateItems, pmiStatus } from '../../src/engine/esg-report-q.js';
import { VS_DATAPOINTS, VS_DP, VS_PROVIDERS } from '../../src/data/vsme-datapoints.js';
import { PACK_REPORT_IRO } from '../../src/data/pack-report.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P = currentPeriod(D);
const run = (d, ops) => applyOpsTo(d, ops).data;

/** Raccolta finta con un valore plausibile per ogni datapoint del catalogo (come se tutti i pacchetti fossero completi). */
function fullCollected(over = {}) {
  const datapoints = {};
  for (const c of VS_DATAPOINTS) {
    const value = c.type === 'num' ? 12.5 : c.type === 'bool' ? true : c.type === 'table' ? { donne: 7, uomini: 24 } : c.type === 'enum' ? Object.keys(c.options)[1] : `Testo dimostrativo per ${c.id}`;
    datapoints[c.id] = { value, unit: c.unit, quality: 'calcolato', source: `${c.provider}.prova`, pkg: c.provider };
  }
  return { datapoints: { ...datapoints, ...over }, errors: [], duplicates: [] };
}
const withSettings = (d, report) => ({ ...d, settings: { ...d.settings, esg18: { ...(d.settings.esg18 || {}), report: { ...(d.settings.esg18?.report || {}), ...report } } } });

test('catalogo VS: id del contratto presenti e unici, ogni datapoint ha un pacchetto fornitore e una scheda dove si completa', () => {
  const ids = VS_DATAPOINTS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['B1.legal-form', 'B3.s1', 'B3.s2-lb', 'B3.s2-mb', 'B3.mwh', 'B3.mwh-ren-el', 'B3.intensity', 'B4.pollutants', 'B5.sites-sensitive', 'B6.withdrawal', 'B6.consumption', 'B7.waste-haz', 'B7.waste-nonhaz',
    'B7.diverted', 'B7.mass-flow', 'B8.by-contract', 'B8.by-gender', 'B8.turnover', 'B9.recordable-rate', 'B9.fatalities', 'B10.min-wage', 'B10.pay-gap', 'B10.ccnl', 'B10.training-h', 'B11.convictions', 'B11.fines', 'C9.board-ratio']) assert.ok(VS_DP[id], id);
  for (const c of VS_DATAPOINTS) {
    assert.ok(VS_PROVIDERS[c.provider], `${c.id}: fornitore ${c.provider}`);
    assert.match(c.id, /^[BC]\d{1,2}\.[a-z0-9-]+$/);
    assert.ok(c.label.it && c.label.en, c.id);
    const l = E.linkFor(c);
    assert.equal(l.area, 'esg');
  }
  for (const m of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) assert.ok(VS_DATAPOINTS.some(x => x.disc === m), m);
});

test('raccolta interna: stesso risultato di collectDatapoints del registro su demo, archivio vuoto e di partenza', () => {
  for (const d of [D, emptyData(), starterData()]) {
    const p = currentPeriod(d);
    assert.deepEqual(E.collectAll(d, p), collectDatapoints(d, p));
  }
});

test('copertura rigorosa: un valore mancante non copre, un’omissione copre solo se motivata, l’applicabilità segue il profilo', () => {
  const base = withSettings(D, { option: 'basic+comprehensive' });
  const full = E.vsmeReport(base, P, { collected: fullCollected() });
  assert.equal(full.coverage.B.covered, full.coverage.B.required);
  assert.equal(full.coverage.total.pct, 1);
  const col = fullCollected();
  delete col.datapoints['B3.s1'];
  const miss = E.vsmeReport(base, P, { collected: col });
  assert.equal(miss.byId['B3.s1'].status, 'mancante');
  assert.equal(miss.coverage.B.covered, full.coverage.B.covered - 1);
  assert.deepEqual(miss.gaps.map(g => g.id), ['B3.s1']);
  assert.deepEqual(miss.gaps[0].link, { area: 'esg', tab: 'clima' });
  // omissione senza motivazione: non conta; con motivazione: conta
  const noNote = run(base, [{ kind: 'add', coll: 'esgAnswers', obj: { id: `${P.key}:B3.s1`, periodKey: P.key, dpId: 'B3.s1', value: null, omission: 'non-disponibile', omissionNote: '' } }]);
  assert.equal(E.vsmeReport(noNote, P, { collected: col }).byId['B3.s1'].status, 'da-motivare');
  const r = E.answerOps(base, P.key, 'B3.s1', { omission: 'non-disponibile', omissionNote: 'Contatore del gas installato a metà esercizio' });
  assert.equal(r.ok, true);
  const omitted = E.vsmeReport(run(base, r.ops), P, { collected: col });
  assert.equal(omitted.byId['B3.s1'].status, 'omesso');
  assert.equal(omitted.coverage.B.covered, full.coverage.B.covered);
  // una risposta copre un datapoint senza valore del pacchetto; il valore del pacchetto prevale se la risposta non lo sostituisce
  const a = E.answerOps(base, P.key, 'B3.s1', { value: '301,5', quality: 'stimato' });
  const ans = E.vsmeReport(run(base, a.ops), P, { collected: col });
  assert.deepEqual([ans.byId['B3.s1'].value, ans.byId['B3.s1'].quality, ans.byId['B3.s1'].origin], [301.5, 'stimato', 'risposta']);
  assert.equal(E.vsmeReport(run(base, a.ops), P, { collected: fullCollected() }).byId['B3.s1'].origin, 'pacchetto');
  // applicabilità: sotto i 150 dipendenti il divario retributivo è facoltativo; senza consiglio il C9 non si applica
  const small = E.vsmeReport(base, P, { collected: fullCollected({ 'B1.employees': { value: 31, unit: 'persone', quality: 'misurato', source: 'persone.prova' }, 'B10.pay-gap': { value: null, quality: 'mancante', source: 'persone.prova' } }) });
  assert.equal(small.byId['B10.pay-gap'].required, false);
  assert.equal(small.byId['B10.pay-gap'].status, 'facoltativo');
  assert.equal(E.answerOps(base, P.key, 'B3.s1', { value: 'abc' }).ok, false, 'un numero non valido si rifiuta');
  assert.equal(E.answerOps(base, P.key, 'B3.s1', { omission: 'riservato', omissionNote: '' }).ok, false, 'omissione senza motivazione rifiutata');
});

test('testi: completo senza «[da completare»; in inglese senza titoli italiani; i mancanti hanno il segnaposto', () => {
  const base = withSettings(D, { option: 'basic+comprehensive' });
  const rep = E.vsmeReport(base, P, { collected: fullCollected() });
  const it = narratives(rep, 'it');
  assert.equal(it.length, 20);
  assert.ok(!JSON.stringify(it).includes('[da completare'), 'nessun segnaposto con i dati completi');
  const en = narratives(rep, 'en');
  const enText = JSON.stringify(en);
  assert.ok(!/Criteri di redazione|Energia ed emissioni|Forza lavoro|\[to be completed/.test(enText), 'nessun titolo italiano né segnaposto');
  assert.match(en.find(n => n.id === 'B3').title, /Energy and greenhouse gas emissions/);
  const col = fullCollected(); delete col.datapoints['B6.withdrawal'];
  const miss = narratives(E.vsmeReport(base, P, { collected: col }), 'it').find(n => n.id === 'B6');
  assert.match(miss.paragraphs.join(' '), /\[da completare: Prelievo idrico totale\]/);
  assert.deepEqual(miss.missing, ['B6.withdrawal']);
  const md = vsmeMarkdown(rep, 'en', { methods: E.METHODS });
  assert.match(md, /Sustainability report under the Voluntary Standard/);
  assert.match(md, /FeedOS organises data and calculations/);
});

test('chiusura: impronta deterministica sul JSON canonico, quattro occhi, revisione prima dell’approvazione, riapertura con nota, differenze', () => {
  const d0 = { ...D, esgClosings: [] };
  const a = E.closeOpsSync(d0, P, { role: 'qualita', name: 'Resp. qualità' }, { at: '2026-10-10' });
  const b = E.closeOpsSync(d0, P, { role: 'qualita', name: 'Resp. qualità' }, { at: '2026-10-10' });
  assert.equal(a.ok, true);
  assert.equal(a.record.hash, b.record.hash, 'stesso contenuto, stessa impronta');
  assert.equal(a.record.hash, sha256HexSync(canonicalJson(E.closingPayload(a.record))));
  const reordered = Object.fromEntries(Object.entries(E.closingPayload(a.record)).reverse());
  assert.equal(sha256HexSync(canonicalJson(reordered)), a.record.hash, 'l’ordine delle chiavi non conta');
  let d1 = run(d0, a.ops);
  assert.equal(E.verifyClosing(E.closingRow(d1, P.key)).ok, true);
  assert.equal(E.approveOps(d1, P.key, { role: 'direzione' }).ok, false, 'prima serve la revisione');
  assert.match(E.reviewOps(d1, P.key, { role: 'qualita' }).error, /diverso/);
  d1 = run(d1, E.reviewOps(d1, P.key, { role: 'acquisti' }, 'controllati i valori').ops);
  assert.match(E.approveOps(d1, P.key, { role: 'qualita', name: 'Resp. qualità' }).error, /diverso/);
  const ap = E.approveOps(d1, P.key, { role: 'direzione' });
  d1 = run(d1, ap.ops);
  assert.equal(E.closingRow(d1, P.key).status, 'approvato');
  assert.equal(E.frozenVsLive(d1, P.key).n, 0, 'subito dopo l’approvazione nessuna differenza');
  assert.equal(E.closeOps(d1, P, { role: 'qualita' }).ok, false, 'un esercizio approvato non si ricongela');
  // un dato cambia dopo l'approvazione: differenza, segnale, regola R36; il rapporto resta congelato
  const r = E.answerOps(d1, P.key, 'B1.balance-sheet', { value: 12500000 });
  const d2 = run(d1, r.ops);
  const diff = E.frozenVsLive(d2, P.key);
  assert.deepEqual(diff.changes.map(c => [c.id, c.frozen, c.live]), [['B1.balance-sheet', 11840000, 12500000]]);
  assert.equal(E.vsmeReport(d2, P).byId['B1.balance-sheet'].value, 11840000);
  assert.ok(E.reportSignals(d2, ctx).some(s => s.key === `report:changed-after-close:${P.key}`));
  assert.equal(E.REPORT_RULES.find(x => x.id === 'R36').check(d2, ctx).fails.length, 1);
  // riapertura: serve una nota, lo storico conserva impronta e valori
  assert.equal(E.reopenOps(d2, P.key, { role: 'direzione' }, '').ok, false);
  const ro = E.reopenOps(d2, P.key, { role: 'direzione' }, 'Correzione del totale di bilancio dopo la revisione legale');
  const d3 = run(d2, ro.ops);
  const c3 = E.closingRow(d3, P.key);
  assert.equal(c3.status, 'riaperto');
  assert.equal(c3.history[0].hash, a.record.hash);
  assert.equal(c3.history[0].values['B1.balance-sheet'], 11840000);
  assert.equal(E.vsmeReport(d3, P).byId['B1.balance-sheet'].value, 12500000, 'riaperto: dati di oggi');
});

test('collegamento delle domande: Scope 1, acqua in inglese, codice di condotta; deterministico', () => {
  assert.equal(suggestMapping('Emissioni Scope 1 (tCO2e)')[0].dpId, 'B3.s1');
  assert.equal(suggestMapping('Scope 2 emissions, location-based (tCO2e)')[0].dpId, 'B3.s2-lb');
  assert.equal(suggestMapping('Total water withdrawal in m3')[0].dpId, 'B6.withdrawal');
  assert.equal(suggestMapping('Numero di dipendenti a fine anno')[0].dpId, 'B1.employees');
  assert.equal(suggestMapping('Avete un codice etico o una politica sui diritti umani?')[0].dpId, 'C6.code');
  assert.deepEqual(suggestMapping('Emissioni Scope 1 (tCO2e)'), suggestMapping('Emissioni Scope 1 (tCO2e)'));
  assert.deepEqual(suggestMapping('Qual è il colore del vostro logo?'), []);
});

test('questionari: importazione CSV, collegamento automatico, voci oltre il VS con il testo sul limite (senza rifiuto), CSV sicuro', () => {
  const csv = 'Codice;Domanda;Sezione\nQ1;Emissioni Scope 1 (tCO2e);Clima\nQ2;Prelievo idrico totale (m3);Acqua\nQ3;Quota di soia certificata RTRS nei vostri acquisti;Filiera\nQ4;=SOMMA(A1:A2) infortuni mortali;Sicurezza';
  const p = parseQuestionnaireCsv(csv);
  assert.deepEqual(p.items.map(x => x.qid), ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual([p.columns.id, p.columns.text], ['Codice', 'Domanda']);
  const r = questionnaireOps(D, { title: 'Questionario cliente', kind: 'cliente', requester: 'Cliente di prova', dueAt: '2026-11-01', periodKey: P.key }, p.items);
  assert.equal(r.ok, true);
  const items = r.record.items;
  assert.deepEqual(items[0].dpIds, ['B3.s1']);
  assert.deepEqual(items[1].dpIds, ['B6.withdrawal']);
  assert.equal(items[2].beyondVs, true, 'la soia certificata non è un datapoint del VS');
  const rep = E.vsmeReport(D, P, { collected: fullCollected() });
  const f = fillQuestionnaire(r.record, rep);
  assert.deepEqual(f.items.map(x => x.status), ['risposto', 'risposto', 'oltre', 'risposto']);
  assert.match(f.items[2].answer, /oltre i datapoint del Voluntary Standard/);
  assert.match(f.items[2].answer, /decide se e come rispondere/);
  assert.match(fillQuestionnaire(r.record, rep, { lang: 'en' }).items[2].answer, /goes beyond the datapoints/);
  const out = answersCsv(f);
  assert.ok(out.includes("'=SOMMA(A1:A2) infortuni mortali"), 'formula neutralizzata con l’apice');
  assert.ok(!/;=SOMMA/.test(out));
  assert.equal(questionnaireOps(D, { title: '' }, []).ok, false);
  // voce senza testo (struttura PMI-Banche): da trascrivere
  const pmi = templateItems(D, 'pmi-banche');
  assert.equal(pmi.length, 40);
  assert.equal(fillQuestionnaire({ items: pmi }, rep).stats.transcribe, 40);
  assert.equal(pmiStatus(D).status, 'da trascrivere');
});

test('esportazioni: CSV con i campi del contratto e formule neutralizzate, JSON {meta, datapoints}, CSV nell’ordine EFRAG', () => {
  const rep = E.vsmeReport(withSettings(D, { option: 'basic+comprehensive' }), P, { collected: fullCollected({ 'C1.strategy': { value: '+39 crescita', unit: null, quality: 'dichiarato', source: 'report.prova' } }) });
  const csv = vsmeCsv(rep);
  const head = csv.replace(/^﻿/, '').split('\r\n')[0];
  assert.equal(head, 'Codice;Datapoint;Valore;Unità;Qualità;Fonte;Evidenze;Stato;Modulo;Nota');
  assert.ok(csv.includes("'+39 crescita"), 'testo che sembra una formula neutralizzato');
  const js = vsmeJson(rep);
  assert.ok(js.meta && Array.isArray(js.datapoints));
  assert.equal(js.datapoints.length, VS_DATAPOINTS.length);
  assert.ok(js.datapoints.every(x => 'value' in x && 'quality' in x && 'source' in x));
  const ef = efragCsv(rep).replace(/^﻿/, '').split('\r\n');
  assert.match(ef[1], /B1\.option/);
  const codes = ef.slice(1).map(l => l.split(';')[3]).filter(x => /^[BC]\d/.test(x));
  assert.deepEqual(codes, VS_DATAPOINTS.map(x => x.id), 'ordine del catalogo (modello EFRAG)');
});

test('storico di tre esercizi: storico dichiarato del demo, chiusure del gestionale, valori dell’esercizio; il demo resta con un solo esercizio selezionabile', () => {
  const D21 = demoData('2026-10-21');
  assert.deepEqual(reportingPeriods(D21).map(p => p.key), ['12m-2026-09'], 'lo storico dichiarato non aggiunge esercizi');
  const h = E.threeYear(D, P);
  assert.deepEqual(h.periods.map(p => p.key), ['12m-2024-09', '12m-2025-09', '12m-2026-09']);
  const row = k => h.rows.find(r => r.key === k);
  assert.deepEqual(row('tonnes').values.map(v => v.source), ['storico', 'storico', 'calcolato']);
  assert.equal(row('s1').values[0].source, 'storico');
  assert.ok(row('s1').values[0].value > row('s1').values[1].value, 'scope 1 in calo negli anni dichiarati');
  assert.ok(row('revenueNet').values[1].value > 15e6);
  // dichiarare un esercizio con id = chiave del periodo
  const X = periodByKey(D, '12m-2023-09');
  const r = E.historyOps(D, X, { tonnes: '43000', s1: 330 });
  assert.equal(r.ok, true);
  assert.equal(r.ops[0].obj.id, '12m-2023-09');
  assert.equal(E.historyOps(D, X, { tonnes: -5 }).ok, false);
});

test('materialità: libreria filtrata per settore, punteggi ESRS, 11 temi materiali sul demo, mappa verso le informative', () => {
  const lib = iroLibrary(D);
  assert.equal(lib.length, 35);
  assert.ok(lib.every(x => x.sectors.includes('mangimi')));
  const agro = iroLibrary({ settings: { company: { sector: 'agrofarmaci' } } });
  assert.ok(agro.some(x => x.id === 'iro-a-seveso') && !agro.some(x => x.id === 'iro-e4-deforestazione'));
  assert.deepEqual(scoreIro({ scale: 5, scope: 4, irremediability: 5, likelihood: 4, magnitude: 3, actual: false }), { impact: 3.73, financial: 2.4, score: 3.73 });
  const rows = D.materiality.filter(r => r.periodKey === P.key);
  assert.equal(rows.length, 35);
  const mx = materialityMatrix(rows, 3, PACK_REPORT_IRO.items);
  assert.equal(mx.material, 11);
  assert.ok(mx.materialTopics.some(t => t.id === 'E1') && mx.recommendC);
  assert.ok(mx.disclosures.includes('B3') && mx.disclosures.includes('C3'));
});

test('demo: esercizio in revisione con impronta valida, questionari, segnali, sezione, KPI e regole senza errori critici', () => {
  const c = E.closingRow(D, P.key);
  assert.equal(c.status, 'in revisione');
  assert.equal(c.preparedBy, 'qualita');
  assert.equal(E.verifyClosing(c).ok, true);
  assert.equal(E.frozenVsLive(D, P.key).n, 0, 'istantanea uguale ai dati di oggi');
  const cs = D.questionnaires.find(q => q.id === 'q-caseificio-sila');
  assert.equal(cs.items.length, 25);
  assert.equal(cs.items.filter(i => i.beyondVs).length, 4);
  assert.equal(D.questionnaires.length, 3);
  const sig = E.reportSignals(D, ctx);
  assert.ok(sig.every(s => s.key.startsWith('report:') && s.area === 'esg' && s.link.tab === 'vsme'));
  assert.ok(sig.some(s => s.key === `report:approval-pending:${P.key}`));
  assert.ok(sig.some(s => s.key === 'report:questionnaire-due:q-banca-alfa' && s.severity === 'attenzione'));
  const sec = E.reportReportSection(D, ctx, resolvePeriod({ preset: '12m' }, today), null);
  assert.equal(sec.id, 'esg-sintesi');
  assert.ok(sec.kpis.length >= 4 && sec.narrative.length >= 2);
  for (const k of E.REPORT_KPIS) { const v = k.compute(D, ctx, P); assert.ok(v > 0 && v <= 1, k.id); }
  for (const r of E.REPORT_RULES) assert.deepEqual(r.check(D, ctx).fails, [], r.id);
  assert.equal(D.settings.esg18.report.option, 'basic+comprehensive');
  const bp = E.bankPack(D, P);
  assert.ok(bp.sections.find(s => s.id === 'energia').table.rows.some(r => r.key === 's12'));
  assert.match(bankMarkdown(bp), /Pacchetto ESG per la banca/);
  assert.ok(E.reportCalendarItems(D, today).some(i => i.key === `report:chiusura:${P.key}` && i.date === '2026-11-29'));
});

test('archivio vuoto e di partenza: nessuna eccezione, sezione nulla, nessun segnale, rapporto con tutte le lacune', () => {
  for (const d of [emptyData(), starterData()]) {
    const p = currentPeriod(d);
    const rep = E.vsmeReport(d, p);
    assert.ok(rep.coverage.B.required > 40 && rep.gaps.length > 30);
    assert.deepEqual(E.reportSignals(d, makeCtx(d, today)), []);
    assert.equal(E.reportReportSection(d, makeCtx(d, today), p, null), null);
    for (const k of E.REPORT_KPIS) assert.equal(k.compute(d, {}, p), null);
    assert.ok(Array.isArray(E.reportCalendarItems(d, today)));
    assert.ok(E.reportSummary(d, p).gaps > 0);
    assert.equal(narratives(rep, 'it').length, 11);
    assert.ok(vsmeMarkdown(rep, 'it').length > 500);
    assert.ok(Array.isArray(E.threeYear(d, p).rows));
    assert.equal(E.closeOps(d, p, { role: 'nessuno' }).ok, false);
  }
});

test('periodi: un periodo globale porta all’esercizio che ne contiene la fine; esercizi con chiusura restano selezionabili', () => {
  assert.equal(E.esgPeriodFor(D, resolvePeriod({ preset: '12m' }, today)).key, P.key);
  assert.equal(E.esgPeriodFor(D, '12m-2025-06').key, '12m-2025-06');
  const d = { ...D, esgClosings: [...D.esgClosings, { id: '12m-2024-06', status: 'approvato', datapoints: {} }] };
  assert.ok(E.reportPeriods(d).some(p => p.key === '12m-2024-06'));
});
