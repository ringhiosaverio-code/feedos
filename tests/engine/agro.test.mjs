/* DifesaOS · Edizione agrofarmaci: regole regolatorie (art. 43 e 46, ricavi a rischio, vendibilità), tolleranze del titolo,
 * ADR 1.1.3.6 e DS 375, indici Seveso, invii delle schede di sicurezza, campagne e premi, CO₂ dei programmi, demo dell'edizione
 * (estensori senza violazioni, segnali attesi, nessun nome reale) e archivi senza dati agro. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../../src/core/schema.js';
import * as REG from '../../src/engine/agro-reg.js';
import * as CAMP from '../../src/engine/agro-camp.js';
import * as CO2 from '../../src/engine/agro-co2.js';
import { asToleranceRange, checkAnalysis } from '../../src/engine/quality.js';
import { computeSignals } from '../../src/engine/signals.js';
import { demoData as agroDemo, starterData as agroStarter } from '../../src/editions/agrofarmaci/demo/index.js';
import { demoData as feedDemo } from '../../src/data/demo/index.js';
import { AGRO_RULE_SOURCES, AGRO_ESTIMATES } from '../../src/data/agro-rules.js';

const T = '2026-10-28';
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('art. 46: periodi massimi di vendita e impiego; vendibilità ai confini', () => {
  assert.deepEqual(REG.graceDefaults('2026-10-31'), { saleUntil: '2027-04-30', useUntil: '2028-04-30', basis: 'stima-max-art46' });
  const reg = { status: 'in-revoca', expiryDate: '2026-12-17', saleUntil: '2027-06-17', useUntil: '2028-06-17' };
  assert.equal(REG.saleStatus(reg, '2026-12-17'), 'vendibile');
  assert.equal(REG.saleStatus(reg, '2026-12-18'), 'vendibile-smaltimento');
  assert.equal(REG.saleStatus(reg, '2027-06-17'), 'vendibile-smaltimento');
  assert.equal(REG.saleStatus(reg, '2027-06-18'), 'solo-impiego');
  assert.equal(REG.saleStatus(reg, '2028-06-18'), 'non-vendibile');
  assert.equal(REG.saleStatus(null, T), 'non-registrato');
  assert.equal(REG.saleStatus({ status: 'in-domanda' }, T), 'non-vendibile');
});

test('art. 43: domanda di rinnovo del prodotto entro 3 mesi dal rinnovo della sostanza', () => {
  const d = { ...emptyData(), activeSubstances: [{ id: 'x', name: 'X', renewedOn: '2026-08-01' }],
    registrations: [{ id: 'r1', productId: 'p1', status: 'valida', declared: [{ asId: 'x', content: 100, unit: 'g/kg' }] }], regEvents: [] };
  const [a] = REG.art43Due(d, '2026-10-01');
  assert.equal(a.due, '2026-11-01');
  assert.equal(a.daysLeft, 31);
  assert.equal(a.done, false);
  d.regEvents = [{ id: 'e', registrationId: 'r1', asId: 'x', kind: 'rinnovo-art43', submittedDate: '2026-09-15' }];
  assert.equal(REG.art43Due(d, '2026-10-01')[0].done, true);
});

test('ricavi a rischio: r = 1 − Π(1 − r sostanza), revoca al 100%, rinnovo in corso non conta come scadenza', () => {
  const d = { ...emptyData(), products: [{ id: 'p1', code: 'A', name: 'A' }, { id: 'p2', code: 'B', name: 'B' }],
    activeSubstances: [{ id: 'c', status: 'approvata', cfs: true, approvalExpiry: '2027-06-01' }, { id: 'l', status: 'approvata', lowRisk: true, approvalExpiry: '2027-06-01' }],
    registrations: [{ id: 'r1', productId: 'p1', status: 'in-rinnovo', expiryDate: '2028-06-01', declared: [{ asId: 'c' }, { asId: 'l' }] }, { id: 'r2', productId: 'p2', status: 'in-revoca', declared: [] }],
    shipments: [{ id: 's1', date: '2026-05-01', productId: 'p1', customerId: 'c', tonnes: 10, price: 1000 }, { id: 's2', date: '2026-05-01', productId: 'p2', customerId: 'c', tonnes: 5, price: 1000 }] };
  const R = REG.revenueAtRisk(d, T);
  const r1 = R.rows.find(r => r.productId === 'p1'), r2 = R.rows.find(r => r.productId === 'p2');
  near(r1.r, 0.3825, 1e-4);
  assert.equal(r2.r, 1);
  near(R.rar, 10000 * 0.3825 + 5000, 1);
});

test('tolleranze del titolo di sostanza attiva (schema FAO/OMS)', () => {
  assert.deepEqual(asToleranceRange(300, 'WG'), { min: 285, max: 315 });
  const lo = asToleranceRange(20, 'EC'); near(lo.min, 17); near(lo.max, 23);
  const het = asToleranceRange(20, 'WG'); near(het.min, 15); near(het.max, 25);
  assert.deepEqual(asToleranceRange(800, 'WG'), { min: 775, max: 825 });
  assert.equal(checkAnalysis('titolo', 279, 300, 'WG').status, 'difetto');
  assert.equal(checkAnalysis('titolo', 297.9, 300, 'WG').status, 'ok');
  assert.equal(asToleranceRange(null), null);
});

test('ADR 1.1.3.6: punti per categoria e disposizione speciale 375 sotto i 5 kg o 5 L', () => {
  const d = { ...emptyData(), products: [
    { id: 'big', packaging: 'Sacco 10 kg', uom: 'kg', hazard: { adr: { un: 'UN3077', cls: '9', pg: 'III', cat: 3 } } },
    { id: 'small', packaging: 'Tanica 5 L', uom: 'L', density: 1.25, hazard: { adr: { un: 'UN3082', cls: '9', pg: 'III', cat: 3 } } },
    { id: 'fl', packaging: 'Flacone 1 L', uom: 'L', density: 1, hazard: { adr: { un: 'UN1993', cls: '3', pg: 'III', cat: 3 } } },
    { id: 'none', packaging: 'Sacco 25 kg', uom: 'kg', hazard: { adr: null } }] };
  const r = REG.adrPoints([{ productId: 'big', tonnes: 0.6 }, { productId: 'small', tonnes: 1 }, { productId: 'fl', tonnes: 0.3 }, { productId: 'none', tonnes: 2 }], d);
  assert.equal(r.points, 900); // 600 kg + 300 L di infiammabile; la tanica da 5 L di UN3082 è esente
  assert.equal(r.full, false);
  near(r.exemptQty, 800);
  assert.equal(REG.adrPoints([{ productId: 'big', tonnes: 1.2 }], d).full, true);
  assert.deepEqual(REG.packOf({ packaging: 'Tanica 20 L' }), { size: 20, unit: 'L' });
});

test('Seveso: sommatoria per gruppo e soglia; quantità notificate superate', () => {
  const d = { ...emptyData(), products: [{ id: 'a', hazard: { seveso: ['E1'] } }, { id: 'b', hazard: { seveso: ['E2', 'P5c'] } }], ingredients: [{ id: 'm', seveso: ['E1'] }],
    lots: [{ id: 'l1', productId: 'a', tonnes: 90 }, { id: 'l2', productId: 'b', tonnes: 100 }], shipments: [], ingLots: [{ id: 'i1', ingId: 'm', remaining: 30, status: 'accettato' }],
    settings: { ...emptyData().settings, agro: { seveso: { tier: 'inferiore', notified: { E1: 110 } } } } };
  const s = REG.sevesoIndex(d);
  const env = s.groups.find(g => g.id === 'ambiente');
  near(env.lo, 120 / 100 + 100 / 200);
  near(env.hi, 120 / 200 + 100 / 500);
  assert.equal(s.tier, 'inferiore');
  assert.deepEqual(s.over.map(c => c.id), ['E1']);
  near(s.headE1, (1 - env.hi) * 200);
});

test('schede di sicurezza: invio ai destinatari dei 12 mesi prima della revisione; UFI solo per pericoli per salute o fisici', () => {
  const d = { ...emptyData(), customers: [{ id: 'c1', name: 'Uno' }, { id: 'c2', name: 'Due' }, { id: 'c3', name: 'Tre' }],
    products: [{ id: 'p', name: 'P', hazard: { h: ['H302', 'H410'] } }, { id: 'q', name: 'Q', hazard: { h: ['H410'] } }],
    sdsDocs: [{ id: 's1', productId: 'p', version: 1, date: '2024-01-01' }, { id: 's2', productId: 'p', version: 2, date: '2026-09-01', ufi: 'AAAA-BBBB-CCCC-DDDD', pcnDate: null }],
    sdsDispatches: [{ id: 'x', customerId: 'c1', productId: 'p', version: 2 }],
    shipments: [{ id: 'a', customerId: 'c1', productId: 'p', date: '2026-03-01' }, { id: 'b', customerId: 'c2', productId: 'p', date: '2025-10-01' }, { id: 'c', customerId: 'c3', productId: 'p', date: '2025-06-01' }] };
  const g = REG.sdsGaps(d, T);
  assert.deepEqual(g.gaps.map(x => x.customerId), ['c2']); // c3 servito più di 12 mesi prima della revisione
  near(g.coverage, 0.5);
  assert.equal(REG.needsUfi(d.products[0]), true);
  assert.equal(REG.needsUfi(d.products[1]), false);
  assert.deepEqual(g.ufi.map(u => [u.productId, u.ok]), [['p', false]]);
});

test('campagne: sconto per data, premi a scaglioni sul fatturato netto dei resi, ordini anticipati alla stessa data', () => {
  const camp = { id: 'c27', from: '2026-10-01', to: '2027-09-30', earlyFrom: '2026-10-01', earlyTo: '2027-01-31', earlyTiers: [{ until: '2026-10-31', pct: 5 }, { until: '2026-11-30', pct: 4 }],
    rebateTiers: [{ fromPct: 90, pct: 1 }, { fromPct: 100, pct: 2.5 }], returnsCapPct: 5, targets: [{ customerId: 'k', target: 100000 }] };
  assert.equal(CAMP.earlyDiscount(camp, '2026-10-31'), 5);
  assert.equal(CAMP.earlyDiscount(camp, '2026-11-01'), 4);
  assert.equal(CAMP.earlyDiscount(camp, '2027-01-10'), 0);
  const d = { ...emptyData(), customers: [{ id: 'k', name: 'K' }], campaigns: [camp],
    shipments: [{ id: 's', customerId: 'k', productId: 'p', date: '2027-03-01', tonnes: 10, price: 9800 }], returns: [{ id: 'r', campaignId: 'c27', customerId: 'k', status: 'accettato', value: 3000 }] };
  const rb = CAMP.rebateAccrual(d, camp, '2027-10-15');
  const row = rb.rows[0];
  near(row.actual, 95000); near(row.q, 0.95); assert.equal(row.tier, 1); near(row.rebate, 950); near(row.gap, 5000); assert.equal(row.next, 2.5);
  const prev = { ...camp, id: 'c26', earlyFrom: '2025-10-01' };
  const ep = CAMP.earlyProgress({ ...d, earlyOrders: [
    { id: 'a', campaignId: 'c26', customerId: 'k', date: '2025-10-10', lines: [{ productId: 'p', tonnes: 1, price: 1000 }], discountPct: 0 },
    { id: 'b', campaignId: 'c26', customerId: 'k', date: '2025-12-10', lines: [{ productId: 'p', tonnes: 5, price: 1000 }], discountPct: 0 },
    { id: 'c', campaignId: 'c27', customerId: 'k', date: '2026-10-12', lines: [{ productId: 'p', tonnes: 1, price: 900 }], discountPct: 10 }] }, camp, prev, '2026-10-28');
  near(ep.cur, 810); near(ep.prevSame, 1000); near(ep.ratio, 0.81); near(ep.prevTot, 6000);
});

test('CO₂ di un programma: prodotti dalla ricetta, gasolio, per kg di raccolto e di olio, rame per ettaro', () => {
  const d = { ...emptyData(), settings: { ...emptyData().settings, energy: { feGrid: 0.25, feGpl: 3 } },
    ingredients: [{ id: 'cu', ef: 5000 }, { id: 'k', ef: 100 }], formulas: [{ id: 'f', lines: [{ ing: 'cu', kg: 500 }, { ing: 'k', kg: 500 }] }],
    lines: [{ id: 'L', kwhPerT: 100, gplKgPerT: 10 }],
    products: [{ id: 'p', formulaId: 'f', lineId: 'L', uom: 'kg', packaging: 'Sacco 10 kg', unitPrice: 10, actives: [{ as: 'rame', g: 300 }] }] };
  const fp = CO2.productFootprint(d, 'p');
  near(fp.perUnit, (2500 + 50 + 25 + 30) / 1000 + 0.04, 1e-6); // materie prime + elettricità + GPL + sacco
  const r = CO2.programmeCo2(d, { applications: [{ productId: 'p', dose: 2, n: 3 }], passes: 3, fuelLPerPass: 5, yieldTHa: 6, oilYieldPct: 15 });
  near(r.products, 6 * fp.perUnit, 1e-6); near(r.fuel, 3 * 5 * CO2.CO2_FACTORS.dieselKgL, 1e-9);
  near(r.perKg, r.total / 6000, 1e-12); near(r.perKgOil, r.total / 900, 1e-12);
  assert.equal(r.copperKgHa, 1.8); assert.equal(r.cost, 60);
});

test('archivi senza dati agro: nessun segnale né sezione, FeedOS invariato', () => {
  const e = emptyData();
  assert.deepEqual(REG.agroSignals(e, { today: T }), []);
  assert.deepEqual(CAMP.campSignals(e, { today: T }), []);
  assert.equal(REG.agroReportSection(e, { today: T }), null);
  const f = feedDemo(T);
  assert.equal(f.registrations.length, 0);
  assert.ok(!computeSignals(f, T, {}).some(s => /^(reg|sost|sds|seveso|camp):/.test(s.key)));
  const st = agroStarter();
  assert.equal(st.settings.company.sector, 'agrofarmaci');
  assert.equal(st.lines.length, 3);
});

test('demo DifesaOS: estensori senza violazioni, segnali attesi, nessun nome reale', () => {
  const warn = console.warn, seen = [];
  console.warn = (...a) => seen.push(a.map(String).join(' '));
  let d;
  try { d = agroDemo(T); } finally { console.warn = warn; }
  assert.deepEqual(seen, [], 'nessun estensore interrotto o con modifiche non consentite');
  assert.equal(d.settings.company.sector, 'agrofarmaci');
  for (const c of ['registrations', 'regUses', 'activeSubstances', 'sdsDocs', 'sdsDispatches', 'campaigns', 'earlyOrders', 'returns', 'cropProgrammes', 'costCenters', 'closings', 'suppliers']) assert.ok(d[c].length > 0, c);
  const keys = computeSignals(d, T, {}).map(s => s.key);
  for (const k of ['reg:art43:reg-fo80wg:fosetil', 'reg:smaltimento:reg-fl50sc', 'reg:etichetta:reg-ac20sl:4', 'seveso:notifica:E1', 'sds:ufi:p-ar60sl', 'camp:premi:camp-2026']) assert.ok(keys.includes(k), k);
  assert.ok(keys.some(k => k.startsWith('sds:invio:')) && keys.some(k => k.startsWith('camp:anticipi:')));
  const json = JSON.stringify(d);
  assert.ok(!/gowan|isagro/i.test(json), 'niente nomi dell’azienda reale nel demo');
  assert.ok(!/mangimificio|aflatossin/i.test(json.replace(/"(questionnaires|materiality)":\[.*?\]\]/g, '')), 'testi del mangimificio fuori posto');
  // stessi dati alla stessa data
  assert.equal(JSON.stringify(agroDemo(T).registrations), JSON.stringify(d.registrations));
});

test('regole: ogni regola ha riferimento, stato e fonti; le stime dell’azienda cambiano i calcoli entro i limiti', () => {
  const ids = new Set();
  for (const r of AGRO_RULE_SOURCES) {
    assert.ok(r.id && !ids.has(r.id), r.id); ids.add(r.id);
    assert.ok(['verificato', 'parziale', 'stima'].includes(r.status), r.id);
    assert.ok(r.law && r.rule && r.value, r.id);
    for (const u of r.sources) assert.match(u, /^https:\/\//, r.id);
    if (r.id !== 'volumi') assert.ok(r.sources.length > 0, `${r.id}: senza fonte`); // i volumi d'acqua sono un'indicazione tecnica
  }
  for (const k of ['art43', 'art46', 'art53', 'rame', 'reach319', 'clp-ufi', 'seveso', 'adr1136', 'ds375', 'fao-tol']) assert.ok(ids.has(k), k);
  assert.equal(REG.AGRO_RULES.art43Months, 3); assert.equal(REG.AGRO_RULES.art46SaleMonths, 6); assert.equal(REG.AGRO_RULES.art46UseMonths, 12); assert.equal(REG.AGRO_RULES.art53Days, 120);
  assert.equal(REG.AGRO_RULES.adrLimit, 1000); assert.deepEqual(REG.AGRO_RULES.seveso.E1.q, [100, 200]); assert.deepEqual(REG.AGRO_RULES.seveso.E2.q, [200, 500]);
  const base = emptyData();
  assert.deepEqual(REG.rulesOf(base).pNonRenewal, REG.AGRO_RULES.pNonRenewal);
  const d = { ...base, settings: { ...base.settings, agro: { rules: { pNonRenewal: { cfs: 0.5, ignota: 1 }, horizonMonths: 999, graceDemandFactor: 'x', disposalEurT: 2500 } } } };
  const R = REG.rulesOf(d);
  assert.equal(R.pNonRenewal.cfs, 0.5); assert.ok(!('ignota' in R.pNonRenewal)); assert.equal(R.horizonMonths, 120); assert.equal(R.graceDemandFactor, REG.AGRO_RULES.graceDemandFactor); assert.equal(R.disposalEurT, 2500);
  assert.equal(R.art43Months, 3, 'le regole di legge non si cambiano dalle stime');
  assert.ok(AGRO_ESTIMATES.every(e => e.key.startsWith('pNonRenewal.') ? e.key.slice(12) in REG.AGRO_RULES.pNonRenewal : e.key in REG.AGRO_RULES));
});

test('archivio importato senza date di approvazione: rischio non stimato, solo il rinnovo in corso conta', () => {
  const today = '2026-10-28';
  const base = { id: 'x', name: 'X', status: 'da verificare', approvalExpiry: null, cfs: true, lowRisk: false };
  assert.equal(REG.asRiskClass(base, today), null, 'senza scadenza la probabilità di mancato rinnovo non si applica');
  assert.equal(REG.asRiskClass({ ...base, status: 'in rinnovo' }, today), 'in rinnovo');
  assert.equal(REG.asRiskClass({ ...base, status: 'non rinnovata' }, today), 'non rinnovata');
  assert.equal(REG.asRiskClass({ ...base, approvalExpiry: '2027-06-30' }, today), 'cfs');
  const d = emptyData();
  d.products = [{ id: 'p1', code: 'P1', name: 'P1', actives: [{ as: 'x', g: 100, unit: 'g/L' }], uom: 'L', density: 1 }];
  d.activeSubstances = [base];
  d.registrations = [{ id: 'r1', productId: 'p1', status: 'valida', kind: 'autorizzazione', expiryDate: null }];
  assert.equal(REG.revenueAtRisk(d, today).rows.find(r => r.registrationId === 'r1')?.r ?? 0, 0);
});
