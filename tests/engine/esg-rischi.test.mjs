/* FeedOS 18 · Rischi climatici (pacchetto WP8): prove del motore. Coprono la logica delle polizze catastrofali (L. 213/2023), la
 * ripartizione della somma assicurata, l’esposizione della filiera e l’origine dei lotti, lo stress (runScenario, sola lettura),
 * l’esposizione di transizione, i datapoint VSME, le scadenze (chiave «polizza»), i segnali, le regole R49-R51, i KPI, la sezione
 * del report e il demo sui due settori (nessuna parola del mangimificio in DifesaOS). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { demoData as agroDemo } from '../../src/editions/agrofarmaci/demo/index.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { applyDemoExtenders, patchViolations } from '../../src/data/demo/extend.js';
import { demoRischi } from '../../src/data/demo/esg-rischi.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import { computeSignals } from '../../src/engine/signals.js';
import * as R from '../../src/engine/esg-rischi.js';

const today = '2026-10-16';
const D = demoData(today);
const P = currentPeriod(D);
const ctx = makeCtx(D, today);
const A = (d, c) => (d[c] || []);

/** Archivio minimo: due siti di proprietà e una polizza, per provare una regola alla volta. */
const mini = (over = {}) => ({
  ...emptyData(),
  settings: { ...emptyData().settings, company: { lat: null, lon: null } },
  sites: [
    { id: 's1', name: 'Stabilimento', kind: 'stabilimento', owned: true, main: true, lat: 44.7, lon: 11.9, valFabbricati: 1000000, valImpianti: 500000 },
    { id: 's2', name: 'Magazzino', kind: 'magazzino', owned: true, lat: 44.8, lon: 12.0, valFabbricati: 500000 },
  ],
  insurancePolicies: [],
  ...over,
});
const POL = (over = {}) => ({ id: 'p1', kind: 'catastrofale', insurer: 'Compagnia', number: 'N1', perils: 'sisma, alluvione, frana', insuredSum: 2000000, from: '2026-01-01', to: '2027-12-31', ...over });

test('plantCoords: anagrafica dell’azienda, poi sito principale, poi impostazioni del clima, poi null', () => {
  const base = mini();
  assert.deepEqual(R.plantCoords({ ...base, settings: { ...base.settings, company: { lat: 39.45, lon: 16.25 } } }).lat, 39.45);
  const noCo = { ...base, settings: { ...base.settings, company: { lat: null, lon: null } } };
  assert.equal(R.plantCoords(noCo).lat, 44.7, 'sito principale');
  assert.equal(R.plantCoords(noCo).source.startsWith('sito'), true);
  const noSites = { ...noCo, sites: [] };
  assert.equal(R.plantCoords(noSites), null);
  const withClima = { ...noSites, settings: { ...noSites.settings, esg18: { clima: { plantLat: 39.55, plantLon: 16.3 } } } };
  assert.deepEqual([R.plantCoords(withClima).lat, R.plantCoords(withClima).lon], [39.55, 16.3]);
  assert.equal(R.plantCoords(emptyData()), null);
});

test('copertura catastrofale: rischi richiesti, sinonimi (inondazione, esondazione) e stati della polizza', () => {
  const sitesOnly = { ...mini(), insurancePolicies: [] };
  assert.equal(R.insuranceCheck(sitesOnly, today).rows.every(r => r.status === 'assente'), true, 'nessuna polizza');
  const ok = mini({ insurancePolicies: [POL({ perils: 'sisma, inondazione, esondazione, frana', insuredSum: 3000000 })] });
  assert.equal(R.insuranceCheck(ok, today).compliant, true, 'inondazione ed esondazione valgono alluvione');
  const noFlood = mini({ insurancePolicies: [POL({ perils: 'sisma, frana' })] });
  assert.equal(R.insuranceCheck(noFlood, today).rows[0].status, 'rischi-mancanti');
  assert.deepEqual(R.insuranceCheck(noFlood, today).rows[0].missing, ['alluvione']);
  const expired = mini({ insurancePolicies: [POL({ to: '2026-06-30' })] });
  assert.equal(R.insuranceCheck(expired, today).rows[0].status, 'scaduta');
  const notYet = mini({ insurancePolicies: [POL({ from: '2027-01-01' })] });
  assert.equal(R.insuranceCheck(notYet, today).rows[0].status, 'scaduta', 'non ancora in vigore non vale');
});

test('somma assicurata: sottoassicurazione ripartita pro rata sui siti, percentuale di copertura', () => {
  const x = mini({ insurancePolicies: [POL({ insuredSum: 1500000 })] }); // beni: 1,5 M€ + 0,5 M€ = 2 M€
  const c = R.insuranceCheck(x, today);
  assert.equal(c.assets, 2000000);
  assert.equal(c.compliant, false);
  assert.equal(c.gaps.length, 2, 'ogni sito è sotto la quota');
  assert.ok(Math.abs(c.ratio - 0.75) < 1e-9, 'copertura 75%');
  assert.ok(Math.abs(c.rows[0].insured - 1125000) < 1e-6, 'quota del sito più grande pro rata');
  // sul demo di FeedOS la polizza da 18 M€ copre i beni di proprietà e il magazzino locato resta fuori
  const dc = R.insuranceCheck(D, today);
  assert.equal(dc.compliant, true);
  assert.equal(dc.assets, 18000000);
  assert.equal(dc.rows.some(r => r.site.id === 'rs-mag'), false, 'il magazzino locato non entra nel controllo dei beni di proprietà');
});

test('esposizione della filiera: media pesata sulle tonnellate valutate, tonnellate senza valutazione escluse, HHI', () => {
  const P2 = { from: '2026-01-01', to: '2026-12-31' };
  const d = {
    ...emptyData(),
    ingredients: [{ id: 'mais', category: 'cereale' }, { id: 'soia44', category: 'proteico' }, { id: 'sconosciuta', category: 'premix' }],
    ingLots: [
      { id: 'l1', ingId: 'mais', date: '2026-03-01', tonnes: 100 },
      { id: 'l2', ingId: 'mais', date: '2026-04-01', tonnes: 100 },
      { id: 'l3', ingId: 'soia44', date: '2026-05-01', tonnes: 200 },
      { id: 'l4', ingId: 'sconosciuta', date: '2026-06-01', tonnes: 50 },
      { id: 'l5', ingId: 'mais', date: '2025-06-01', tonnes: 999 },
    ],
    eudrLots: [{ id: 'e1', ingLotId: 'l3', country: 'BR' }],
    sourcingRisks: [
      { id: 'r1', commodity: 'mais', origin: 'Italia', hazard: 'siccita', level: 3 },
      { id: 'r2', commodity: 'mais', origin: 'Italia', hazard: 'caldo', level: 1 },
      { id: 'r3', commodity: 'soia', origin: 'Brasile', hazard: 'caldo', level: 2 },
    ],
    settings: { ...emptyData().settings, esg18: { rischi: { originByIngredient: { mais: 'IT' } } } },
  };
  const e = R.sourcingExposure(d, P2);
  // mais: 200 t a livello 3 (il massimo tra i pericoli); soia dal paese EUDR (Brasile): 200 t a livello 2; premix senza rischi
  assert.ok(Math.abs(e.value - (200 * 3 + 200 * 2) / 400) < 1e-9, 'media pesata sulle tonnellate valutate');
  assert.equal(e.assessedT, 400);
  assert.equal(e.unassessedT, 50, 'la materia senza valutazione non entra nella media');
  assert.equal(e.total, 450, 'il lotto del 2025 è fuori dal periodo');
  const mais = e.concentration.find(c => c.commodity === 'mais');
  assert.equal(mais.hhi, 10000, 'un’unica origine');
  assert.equal(R.isLowRiskOrigin('Italia') && !R.isLowRiskOrigin('Brasile'), true);
});

test('origine dei lotti: paese EUDR, poi impostazione per materia, poi anagrafica, altrimenti «non indicata»', () => {
  const ing = { id: 'x', origin: 'Extra-UE' };
  const map = new Map([['L1', { country: 'AR' }]]);
  assert.equal(R.originOf({ id: 'L1' }, ing, { eudrByLot: map, map: { x: 'IT' } }), 'Argentina');
  assert.equal(R.originOf({ id: 'L2' }, ing, { eudrByLot: map, map: { x: 'IT' } }), 'Italia');
  assert.equal(R.originOf({ id: 'L2' }, ing, { eudrByLot: map, map: {} }), 'Extra-UE');
  assert.equal(R.originOf({ id: 'L2' }, { id: 'y' }, { eudrByLot: map, map: {} }), 'non indicata');
});

test('stress di prezzo: finito sul demo e nullo (zero) sull’archivio vuoto, senza ricalcolare le formule', () => {
  const s = R.stressTest(D, null, today);
  assert.ok(Number.isFinite(s.dMargin) && Number.isFinite(s.marginBase) && Number.isFinite(s.marginSc));
  assert.deepEqual(s.matched.sort(), ['energia', 'mais', 'soia'].sort());
  assert.ok(s.dMargin < 0, 'rincari di materia ed energia riducono il margine');
  assert.equal(Math.round(s.marginBase - s.marginSc), Math.round(-s.dMargin), 'differenza coerente');
  const z = R.stressTest(emptyData(), { mais: 25, energia: 30 }, today);
  assert.equal(z.dMargin, 0);
  const st0 = R.stressTest(starterData(), null, today);
  assert.ok(Number.isFinite(st0.dMargin), 'anche con l’archivio di partenza');
});

test('esposizione di transizione: carbonio interno sulle emissioni Scope 1 + 2 e acquisti CBAM contro la soglia di 50 t', () => {
  const x = { ...emptyData(), settings: { ...emptyData().settings, esg18: { piano: { carbonPrice: 100 } } },
    ingredients: [{ id: 'fert', cbam: true }, { id: 'mais' }],
    ingLots: [{ id: 'a', ingId: 'fert', date: '2026-02-01', tonnes: 30 }, { id: 'b', ingId: 'fert', date: '2026-03-01', tonnes: 25 }, { id: 'c', ingId: 'mais', date: '2026-03-01', tonnes: 500 }] };
  const t = R.transitionExposure(x, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(t.carbonPrice, 100);
  assert.equal(t.cbamT, 55, 'solo gli acquisti marcati CBAM');
  assert.equal(t.cbamThreshold, 50);
  const tD = R.transitionExposure(D, P);
  assert.ok(Number.isFinite(tD.carbonCost) && tD.carbonCost > 0, 'costo del carbonio sul demo');
  assert.ok(Math.abs(tD.carbonCost - tD.scope12T * tD.carbonPrice) < 1e-6, 'costo = emissioni × prezzo');
});

test('datapoint VSME B1, B5 e C4: identificativi del catalogo, sorgente rischi.*, qualità valide, null senza dati', () => {
  const dp = R.rischiDatapoints(D, P);
  for (const id of ['B1.sites-geo', 'B5.sites-sensitive', 'B5.area-sensitive', 'B5.land-total', 'B5.land-sealed', 'B5.nature-on', 'B5.nature-off', 'C4.hazards', 'C4.exposure', 'C4.horizons', 'C4.adaptation', 'C4.financial']) {
    assert.ok(dp[id], id);
    assert.ok(dp[id].source.startsWith('rischi.'), id + ' sorgente');
    assert.ok(['misurato', 'calcolato', 'stimato', 'dichiarato', 'default', 'mancante'].includes(dp[id].quality), id + ' qualità');
  }
  assert.equal(dp['B5.sites-sensitive'].value, 2, 'entrambi i siti entro 10 km da Natura 2000');
  assert.equal(dp['B1.sites-geo'].value.length, 2, 'un elenco con le coordinate di ogni sito');
  assert.match(dp['C4.hazards'].value, /Stabilimento di Valle Verde/);
  const e = R.rischiDatapoints(emptyData(), P);
  assert.equal(e['B1.sites-geo'].value, null);
  assert.equal(e['C4.hazards'].quality, 'mancante');
});

test('scadenze: le polizze hanno chiave con «polizza» (il calendario della governance la riconosce), le azioni e le verifiche', () => {
  const items = R.rischiCalendarItems(D, today);
  const pol = items.filter(i => i.key.includes('polizza'));
  assert.equal(pol.length, 3, 'una per polizza');
  const cat = pol.find(i => i.key.startsWith('rischi:polizza:rp-cat'));
  assert.equal(cat.date, '2027-03-31');
  assert.equal(cat.kind, 'rinnovo');
  assert.equal(cat.law, 'L. 213/2023, commi 101-111');
  assert.ok(items.some(i => i.key.startsWith('rischi:adattamento:')), 'azioni di adattamento');
  assert.ok(items.some(i => i.key.startsWith('rischi:verifica:') && i.kind === 'controllo'), 'ripetizione delle verifiche');
  assert.ok(items.every(i => i.area === 'esg' && i.pkg === 'rischi' && i.link.tab === 'rischi'));
});

test('segnali: nessun critico sul demo; polizza scaduta, adattamento in ritardo e verifica vecchia con la loro chiave', () => {
  const sig = R.rischiSignals(D, ctx);
  assert.ok(sig.every(s => s.key.startsWith('rischi:') && s.link.tab === 'rischi' && s.severity !== 'critico'), 'demo conforme: nessun critico');
  assert.ok(sig.some(s => s.key === 'rischi:adaptation-late:ra-3' && s.severity === 'attenzione'));
  assert.ok(sig.some(s => s.key === 'rischi:hazard-unchecked:rs-mag' && s.severity === 'info'), 'verifica più vecchia di 24 mesi');
  // una polizza catastrofale scaduta e un’altra senza valori coperti: il segnale critico compare
  const bad = { ...D, insurancePolicies: D.insurancePolicies.map(p => p.id === 'rp-cat' ? { ...p, insuredSum: 9000000 } : p) };
  const b = R.rischiSignals(bad, { today });
  assert.ok(b.some(s => s.key === 'rischi:catastrofale-gap:rs-stab' && s.severity === 'critico'), 'lacuna catastrofale');
  const expired = { ...D, insurancePolicies: D.insurancePolicies.map(p => p.id === 'rp-cat' ? { ...p, to: '2026-10-01' } : p) };
  assert.ok(R.rischiSignals(expired, { today }).some(s => s.key === 'rischi:policy-expiry:rp-cat' && s.severity === 'critico'), 'polizza scaduta');
  // la chiave è unica tra tutti i segnali del demo
  const all = computeSignals(D, today, ctx).map(s => s.key);
  assert.equal(new Set(all).size, all.length);
});

test('regole R49-R51: sito senza coordinate, polizza senza rischi, pericolo senza fonte; il demo non ne ha', () => {
  const noCo = { ...D, sites: D.sites.map(s => s.id === 'rs-stab' ? { ...s, lat: null } : s) };
  assert.equal(R.RISCHI_RULES[0].check(noCo, ctx, {}).fails.length, 1);
  const noPerils = { ...D, insurancePolicies: D.insurancePolicies.map(p => p.id === 'rp-cat' ? { ...p, perils: '' } : p) };
  assert.equal(R.RISCHI_RULES[1].check(noPerils, ctx, {}).fails.length, 1);
  const noSource = { ...D, siteHazards: D.siteHazards.map((h, i) => i === 0 ? { ...h, source: '' } : h) };
  assert.equal(R.RISCHI_RULES[2].check(noSource, ctx, {}).fails.length, 1);
  for (const r of R.RISCHI_RULES) assert.equal(r.check(D, ctx, {}).fails.length, 0, r.id + ' sul demo');
});

test('demo: fonti dei pericoli «autovalutazione dimostrativa», mai ISPRA; estensore solo aggiunte, deterministico, idempotente', () => {
  for (const h of A(D, 'siteHazards')) {
    assert.equal(h.source, 'autovalutazione dimostrativa');
    assert.ok(!/ispra/i.test(h.source));
  }
  const g = generateDemo({ today });
  const p1 = demoRischi(g, { today, R: null }), p2 = demoRischi(g, { today, R: null });
  assert.equal(JSON.stringify(p1), JSON.stringify(p2), 'deterministico');
  assert.deepEqual(patchViolations(g, p1), []);
  assert.deepEqual(Object.keys(p1.settings.esg18), ['rischi']);
  assert.deepEqual(demoRischi(D, { today }), {}, 'idempotente sul demo completo');
  assert.equal(applyDemoExtenders(g, today, 16, { only: ['rischi'] }).sites.length, 2);
});

test('DifesaOS: il demo ha siti, pericoli e rischi del settore agrofarmaci, senza parole del mangimificio', () => {
  const A2 = agroDemo(today);
  const rows = ['sites', 'siteHazards', 'sourcingRisks', 'insurancePolicies', 'adaptationActions', 'riskRegister'].flatMap(c => A(A2, c));
  assert.ok(rows.length > 0);
  const text = JSON.stringify(rows);
  assert.ok(!/mangim|soia|pellet/i.test(text), 'nessun termine del mangimificio');
  assert.ok(A2.sites.some(s => /deposito|sostanze pericolose/i.test(s.name)), 'deposito di sostanze pericolose');
  assert.ok(A2.siteHazards.some(h => h.hazard === 'caldo' && h.level >= 4), 'caldo sul magazzino del prodotto confezionato');
  const st = R.stressTest(A2, null, today);
  assert.ok(Number.isFinite(st.dMargin) && st.matched.includes('rame'), 'stress sul rame');
  assert.ok(Number.isFinite(R.sourcingExposure(A2, currentPeriod(A2)).value));
});

test('KPI, sezione del report e riepilogo: forme sul demo e sull’archivio vuoto', () => {
  for (const d of [D, emptyData(), starterData()]) {
    const c = makeCtx(d, today), Pd = currentPeriod(d);
    for (const k of R.RISCHI_KPIS) {
      const v = k.compute(d, c, Pd);
      assert.ok(v === null || Number.isFinite(v), `${k.id} su ${d.settings?.dataset}`);
    }
    const s = R.rischiReportSection(d, c, Pd, null);
    assert.ok(s === null || (s.id === 'esg-rischi' && s.order === 88 && s.kpis.length === 4));
    assert.ok(R.rischiSummary(d, Pd) && typeof R.rischiSummary(d, Pd) === 'object');
  }
  assert.equal(R.rischiReportSection(emptyData(), ctx, P, null), null, 'nessun dato: sezione assente');
  const kpi = Object.fromEntries(R.RISCHI_KPIS.map(k => [k.id, k.compute(D, ctx, P)]));
  assert.equal(kpi['esg-copertura-ass'], 1, 'demo conforme');
  assert.equal(kpi['esg-rischio-siti'], 2, 'due siti con un pericolo di livello 3 o più');
  assert.ok(kpi['esg-esposizione-filiera'] > 0 && kpi['esg-esposizione-filiera'] <= 4);
});
