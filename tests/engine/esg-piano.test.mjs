/* FeedOS 18 · Obiettivi e piano (pacchetto WP7): calcoli economici, curva dei costi, traiettorie, SBTi e FLAG, incentivi,
 * finanziamenti legati alla sostenibilità, piano di transizione (C3), segnali e scadenze, demo FeedOS e DifesaOS, archivi vuoti. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { demoData as agroDemo, starterData as agroStarter } from '../../src/editions/agrofarmaci/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import * as E from '../../src/engine/esg-piano.js';
import { PACK_PIANO } from '../../src/data/pack-piano.js';
import { validatePack } from '../../src/engine/esg-packs.js';

const today = '2026-10-16';
const D = demoData(today), G = agroDemo(today);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

test('piano: CRF, valore attuale netto e tempo di ritorno come nel calcolo a mano', () => {
  // r = 6%, n = 10: CRF = 0,06 · 1,06^10 / (1,06^10 − 1) = 0,135868
  near(E.crf(0.06, 10), 0.06 * 1.06 ** 10 / (1.06 ** 10 - 1));
  near(E.crf(0.06, 10), 0.1358680, 1e-6);
  near(E.crf(0, 4), 0.25);
  near(E.annuityFactor(0.06, 10) * E.crf(0.06, 10), 1);
  const m = { capex: 100000, opexDelta: 2000, savingsEur: 17000, tco2Year: 50, lifeYears: 10 };
  const x = E.economics(m, { carbonPrice: 80, rate: 0.06 });
  let npv = -100000;
  for (let t = 1; t <= 10; t++) npv += (17000 - 2000 + 80 * 50) / 1.06 ** t;
  near(x.npv, npv, 1e-9);
  near(x.payback, 100000 / 15000);
  near(x.annualCost, 100000 * E.crf(0.06, 10) + 2000 - 17000);
  near(x.mac, x.annualCost / 50);
  // l'incentivo riduce l'investimento netto
  const y = E.economics(m, { carbonPrice: 80, rate: 0.06, incentiveValue: 30000 });
  near(y.capexNet, 70000); near(y.npv - x.npv, 30000);
});

test('piano: costo di abbattimento negativo e cambio di segno del VAN al prezzo del carbonio uguale al costo', () => {
  const save = E.economics({ capex: 20000, savingsEur: 9000, tco2Year: 10, lifeYears: 10 }, { rate: 0.06, carbonPrice: 0 });
  assert.ok(save.mac < 0, 'una misura che fa risparmiare ha costo di abbattimento negativo');
  assert.ok(save.npvNoCarbon > 0);
  const cost = E.economics({ capex: 300000, savingsEur: 5000, opexDelta: 1000, tco2Year: 40, lifeYears: 15 }, { rate: 0.06, carbonPrice: 80 });
  assert.ok(cost.mac > 80, 'misura costosa');
  near(cost.npvAt(cost.mac), 0, 1e-7);
  assert.ok(cost.npvAt(cost.mac - 1) < 0 && cost.npvAt(cost.mac + 1) > 0, 'il VAN cambia segno al costo di abbattimento');
  assert.equal(E.economics({ capex: 1000, savingsEur: 0, opexDelta: 500 }, {}).payback, null, 'nessun ritorno senza flusso positivo');
});

test('piano: curva dei costi ordinata per €/t con larghezze cumulate; senza t CO₂e fuori dalla curva', () => {
  const c = E.maccCurve([{ id: 'a', tco2: 10, mac: 50 }, { id: 'b', tco2: 5, mac: -20 }, { id: 'c', tco2: 0, mac: 10 }, { id: 'd', tco2: 20, mac: 120 }, { id: 'e', tco2: 3, mac: null }]);
  assert.deepEqual(c.bars.map(b => b.id), ['b', 'a', 'd']);
  assert.deepEqual(c.bars.map(b => [b.x0, b.x1]), [[0, 5], [5, 15], [15, 35]]);
  assert.equal(c.total, 35); assert.equal(c.saving, 5);
  assert.deepEqual(c.excluded.map(x => x.id).sort(), ['c', 'e']);
  // sul demo: almeno 6 misure nella curva, in ordine crescente
  const m = E.planModel(D, currentPeriod(D));
  assert.ok(m.macc.bars.length >= 6, `${m.macc.bars.length} misure nella curva`);
  for (let i = 1; i < m.macc.bars.length; i++) assert.ok(m.macc.bars[i - 1].mac <= m.macc.bars[i].mac);
});

test('piano: traiettorie lineari e riferimenti ispirati ai criteri SBTi (−4,2% e −3,03% l’anno)', () => {
  const t = { baseYear: 2025, baseValue: 100, targetYear: 2030, targetValue: 79 };
  assert.equal(E.pathAt(t, 2025), 100); near(E.pathAt(t, 2027), 91.6); assert.equal(E.pathAt(t, 2032), 79); assert.equal(E.pathAt(t, 2020), 100);
  assert.deepEqual(E.trajectory(t).map(p => p.year), [2025, 2026, 2027, 2028, 2029, 2030]);
  near(E.referenceTarget({ baseValue: 1000, baseYear: 2025, targetYear: 2030, kind: 's12' }).value, 790);
  near(E.referenceTarget({ baseValue: 1000, baseYear: 2025, targetYear: 2030, kind: 'flag' }).value, 848.5);
  assert.equal(E.referenceTarget({ baseValue: 10, baseYear: 2025, targetYear: 2060 }).value, 0, 'mai sotto zero');
  near(E.requiredRate(100, 81, 2), -0.1);
});

test('piano: categoria SBTi (demo FeedOS B, demo DifesaOS A) e controllo FLAG', () => {
  assert.equal(E.sbtiCategory({ s12: 12000 }).category, 'A');
  assert.equal(E.sbtiCategory({ s12: 500, balanceSheet: 30e6, turnover: 60e6, fte: 40 }).category, 'A');
  const b = E.sbtiCategory({ s12: 500, balanceSheet: 30e6, turnover: 20e6, fte: 40 });
  assert.equal(b.category, 'B'); assert.equal(b.met, 1);
  assert.equal(E.sbtiCategory({ s12: 500, turnover: 60e6 }).provisional, true, 'con dati mancanti la B è provvisoria');
  const P = currentPeriod(D);
  assert.equal(E.planModel(D, P).sbti.category, 'B');
  assert.equal(E.planModel(G, currentPeriod(G)).sbti.category, 'A', 'l’azienda di agrofarmaci supera stato patrimoniale e ricavi');
  const f = E.flagCheck({ flag: 300, total: 1000 }, {}, '2027-03-15');
  assert.equal(f.required, true); assert.equal(f.deadline, '2029-03-15');
  assert.equal(E.flagCheck({ flag: 300, total: 1000 }, {}, '2029-06-01').deadline, '2030-12-31');
  assert.equal(E.flagCheck({ flag: 100, total: 1000 }).required, false);
  assert.ok(E.planModel(D, P).flag.required, 'mangimificio: FLAG oltre il 20%');
});

test('piano: iperammortamento per scaglioni, maggiorazione green e prova del risparmio', () => {
  const bands = PACK_PIANO.items.find(x => x.id === 'iper').bands;
  near(E.iperUplift(2e6, false, bands).amount, 3.6e6);
  near(E.iperUplift(3e6, false, bands).amount, 2.5e6 * 1.8 + 0.5e6 * 1.0);
  near(E.iperUplift(3e6, true, bands).amount, 2.5e6 * 2.2 + 0.5e6 * 1.4);
  near(E.iperUplift(12e6, true, bands).amount, 2.5e6 * 2.2 + 7.5e6 * 1.4 + 2e6 * 0.9);
  const tv = E.iperTaxValue(100000, { ires: 0.24, rate: 0, years: 5 });
  near(tv.nominal, 24000); near(tv.present, 24000);
  assert.ok(E.iperTaxValue(100000, { ires: 0.24, rate: 0.06, years: 5 }).present < 24000, 'valore scontato');
  assert.equal(E.greenTest({ savedMWh: 90, unitMWh: 2600 }).pass, true, '3,5% dell’unità locale');
  assert.equal(E.greenTest({ savedMWh: 30, unitMWh: 2600, processMWh: 500 }).pass, true, '6% del processo');
  assert.equal(E.greenTest({ savedMWh: 20, unitMWh: 2600, processMWh: 500 }).pass, false);
  // sul demo: misure iper ammesse con valore fiscale positivo, scadenze con «iper» nella chiave
  const m = E.planModel(D, currentPeriod(D));
  const fv = m.measures.find(x => x.id === 'pi-m-fv');
  assert.equal(fv.incentiveCalc.kind, 'iper'); assert.ok(fv.incentiveCalc.value > 0 && fv.incentiveCalc.value < fv.values.capex);
  const cal = E.pianoCalendarItems(D, today).filter(c => c.key.includes('iper'));
  assert.ok(cal.length >= 1 && cal.every(c => c.pkg === 'piano' && c.link.tab === 'piano'));
});

test('piano: certificati bianchi in tep e soglia di 10 tep', () => {
  near(E.teeToe({ mwhEl: 100 }), 18.7);
  near(E.teeToe({ mwhEl: 10, kSmcGas: 5, tGpl: 2 }), 1.87 + 4.1 + 2.2);
  const m = E.planModel(D, currentPeriod(D));
  const eco = m.measures.find(x => x.id === 'pi-m-eco');
  assert.equal(eco.incentiveCalc.kind, 'TEE');
  assert.equal(eco.incentiveCalc.eligible, eco.incentiveCalc.toe >= 10);
  assert.equal(eco.incentiveCalc.value, 0, 'senza prezzo dei TEE nessun valore');
});

test('piano: scatto del margine dei finanziamenti (segno, importo, storico)', () => {
  assert.equal(E.ratchetEur(3000000, 7.5), 2250);
  assert.deepEqual(E.sptOutcome(11, 11.5, 'down', 3.75).bps, -3.75);
  assert.deepEqual(E.sptOutcome(12, 11.5, 'down', 3.75).bps, 3.75);
  assert.equal(E.sptOutcome(40, 55, 'up', 5).met, false);
  assert.equal(E.sptOutcome(null, 55, 'up', 5).missing, true);
  const s = E.planModel(D, currentPeriod(D)).sll[0];
  assert.equal(s.amount, 3000000);
  assert.equal(s.kpis.length, 2);
  const k = s.kpis.find(x => x.metric === 's12-t');
  assert.ok(k.years >= 3 && k.enoughHistory, 'Scope 1 + 2 per tonnellata con 3 anni di storico');
  assert.equal(s.kpis.find(x => x.metric === 'soia-dcf').enoughHistory, false);
  near(s.bps, s.kpis.reduce((a, x) => a + x.bps, 0));
  assert.ok(Math.abs(s.eur) <= s.maxEur + 1e-9);
});

test('piano: stima delle misure dai registri (elettricità × quota × risparmio × fattore di rete)', () => {
  const P = currentPeriod(D), B = E.plantBasis(D, P);
  assert.ok(B.ok && B.kwhElec > 0 && B.efGrid > 0);
  const e = E.estimateEffect(D, { libId: 'led' }, B);
  near(e.tco2Year, B.kwhElec * 0.03 * 0.55 * B.efGrid / 1000, 1e-9);
  near(e.savingsEur, B.kwhElec * 0.03 * 0.55 * B.kwhPrice, 1e-9);
  assert.equal(e.quality, 'stimato');
  const go = E.estimateEffect(D, { libId: 'go' }, B);
  assert.equal(go.tco2Year, 0, 'le garanzie d’origine non riducono il location-based');
  // valore inserito prevale sulla stima
  const m = E.planModel(D, P).measures.find(x => x.id === 'pi-m-fv');
  assert.equal(m.values.capex, 486000); assert.equal(m.from.capex, 'inserito'); assert.equal(m.from.tco2Year, 'stima');
});

test('piano: avanzamento degli obiettivi sul demo, segnali e indicatori', () => {
  const P = currentPeriod(D), m = E.planModel(D, P);
  const s12 = m.targets.find(t => t.id === 'pi-t-s12t');
  assert.equal(s12.baseFrom, 'storico dichiarato');
  near(s12.targetValue, s12.baseValue * 0.85);
  assert.ok(s12.progress.actual > 0 && s12.progress.path > 0);
  assert.equal(m.primary.id, 'pi-t-s12t');
  const soy = m.targets.find(t => t.id === 'pi-t-soia');
  assert.equal(soy.progress.onTrack, false, 'soia DCF in ritardo sulla traiettoria');
  const sig = E.pianoSignals(D, { ...makeCtx(D, today), today });
  assert.ok(sig.some(s => s.key === `piano:off-track:pi-t-soia:${P.key}`));
  assert.ok(sig.some(s => s.key === 'piano:measure-late:pi-m-vfd'));
  assert.ok(sig.some(s => s.key.startsWith('piano:incentive-deadline:')));
  assert.equal(new Set(sig.map(s => s.key)).size, sig.length);
  const gap = E.PIANO_KPIS.find(k => k.id === 'esg-target-gap').compute(D, makeCtx(D, today), P);
  near(gap, s12.progress.gap);
  const cov = E.PIANO_KPIS.find(k => k.id === 'esg-abbattimento-piano').compute(D, makeCtx(D, today), P);
  assert.ok(cov > 0);
  const kt = E.kpiTargets(D, 2026);
  assert.ok(kt['esg-s12-t'] && kt['esg-ren-el'], 'obiettivi per i KPI esg-s12-t ed esg-ren-el');
  assert.ok(kt['esg-ren-el'].target > 0 && kt['esg-ren-el'].target < 1, 'quota in frazione come nel catalogo');
  // nessuna regola R46-R48 critica in errore
  for (const r of E.PIANO_RULES) assert.notEqual(r.severity, 'critico');
});

test('piano: il piano di transizione contiene ogni elemento del C3, in italiano e in inglese', () => {
  const P = currentPeriod(D);
  for (const lang of ['it', 'en']) {
    const tp = E.transitionPlan(D, P, lang);
    assert.deepEqual(tp.sections.map(s => s.id), ['targets', 'actions', 'capex', 'governance', 'verification', 'risks']);
    assert.ok(tp.complete.targets && tp.complete.actions && tp.complete.governance);
    assert.equal(tp.complete.verified, false);
    const md = E.planMarkdown(tp);
    assert.match(md, lang === 'it' ? /anno base 20\d\d/ : /base year 20\d\d/);
    assert.match(md, lang === 'it' ? /verificato da terzi: no/ : /verified by a third party: no/);
    assert.match(md, lang === 'it' ? /stima indicativa, non consulenza fiscale/ : /not tax advice/);
    assert.match(md, lang === 'it' ? /non una validazione/ : /not a validation/);
  }
  const dp = E.pianoDatapoints(D, P);
  assert.ok(Array.isArray(dp['C3.targets'].value) && dp['C3.targets'].value[0].baseYear && dp['C3.targets'].value[0].reductionPct > 0);
  assert.ok(dp['C3.actions'].value.length > 20 && dp['C3.transition-plan'].value.includes('Verificato da terzi: no'));
  for (const v of Object.values(dp)) assert.ok(v.source.startsWith('piano.'));
  assert.equal(E.planVerified(D), false);
  const V = { ...D, settings: { ...D.settings, esg18: { ...D.settings.esg18, piano: { ...D.settings.esg18.piano, planVerified: true, verifier: 'Ente terzo (fantasia)', verifiedAt: '2026-10-01' } } } };
  assert.equal(E.planVerified(V), true);
  assert.equal(E.planVerified({ ...V, esgTargets: [] }), false, 'senza obiettivi approvati nessun piano verificato');
});

test('piano: DifesaOS con misure di un impianto di agrofarmaci e senza parole da mangimificio', () => {
  const lib = E.measureLibrary(G).map(x => x.id);
  for (const id of ['solventi-recupero', 'cov-carboni', 'essiccatore-recupero', 'imballi-pcr', 'rame-basso-dosaggio']) assert.ok(lib.includes(id), id);
  for (const id of ['soia-dcf', 'sost-soia', 'coprodotti', 'economizzatore', 'recupero-raffreddatori']) assert.ok(!lib.includes(id), id);
  const txt = JSON.stringify([G.esgTargets, G.measures, G.sllLoans, G.settings.esg18.piano, E.measureLibrary(G).map(x => [x.title, x.note, x.effect?.basis])]);
  assert.doesNotMatch(txt, /mangim|soia|pellet|zootecn|premiscel/i);
  const P = currentPeriod(G), m = E.planModel(G, P);
  assert.ok(m.measures.length >= 8 && m.macc.bars.length >= 5);
  assert.ok(m.targets.some(t => t.metric === 'rame-ha' && t.progress.actual != null), 'rame per ettaro dai programmi di difesa');
  assert.ok(E.pianoReportSection(G, makeCtx(G, today), P, null));
  const sig = E.pianoSignals(G, { ...makeCtx(G, today), today });
  assert.doesNotMatch(JSON.stringify(sig), /mangim|soia|pellet/i);
  // le misure COV non hanno CO₂ e restano fuori dalla curva
  assert.ok(!m.macc.bars.some(b => b.id === 'pi-m-cov'));
});

test('piano: archivio vuoto e di partenza (FeedOS e DifesaOS) senza eccezioni; pacchetto valido', () => {
  for (const d of [emptyData(), starterData(), agroStarter()]) {
    const P = currentPeriod(d), ctx = { ...makeCtx(d, today), today };
    assert.deepEqual(E.pianoSignals(d, ctx), []);
    assert.equal(E.pianoReportSection(d, ctx, P, null), null);
    assert.deepEqual(E.pianoDatapoints(d, P), {});
    assert.deepEqual(E.pianoCalendarItems(d, today), []);
    const m = E.planModel(d, P);
    assert.ok(m && m.targets.length === 0 && m.macc.bars.length === 0 && m.coverage === null);
    assert.equal(E.roadmap(m), null);
    for (const k of E.PIANO_KPIS) assert.equal(k.compute(d, ctx, P), null);
    for (const r of E.PIANO_RULES) assert.deepEqual(r.check(d, ctx, {}).fails, []);
    assert.equal(E.carbonPrice(d), 80);
    assert.equal(E.esgThresholds(d).recovery, 0.5);
    assert.equal(E.planVerified(d), false);
    const tp = E.transitionPlan(d, P, 'it');
    assert.ok(tp.missing.length >= 3);
    for (const lib of E.measureLibrary(d)) assert.doesNotThrow(() => E.estimateEffect(d, { libId: lib.id }, E.plantBasis(d, P)));
  }
  const v = validatePack(PACK_PIANO);
  assert.ok(v.ok, v.errors.join('; '));
  for (const it of PACK_PIANO.items) assert.ok(['verificato', 'da verificare'].includes(it.status), it.id);
});
