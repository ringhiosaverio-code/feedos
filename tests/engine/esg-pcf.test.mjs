/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): prove del motore. Ordine di risoluzione dei fattori, somma delle componenti,
 * energia del pellet, Monte Carlo, continuità con il vecchio passaporto, dichiarazione per cliente, PACT, frontiera a basso carbonio,
 * allarmi di ricalcolo, imballaggi, importazione GFLI, leve, dati dimostrativi, archivi vuoti e di partenza. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod, previousPeriod } from '../../src/engine/esg-years.js';
import { formulaCO2 } from '../../src/engine/formulation.js';
import { parseCSV } from '../../src/core/io.js';
import { rng } from '../../src/core/util.js';
import { patchViolations } from '../../src/data/demo/extend.js';
import { demoPcf } from '../../src/data/demo/esg-pcf.js';
import * as E from '../../src/engine/esg-pcf.js';
import * as C from '../../src/engine/esg-pcf-core.js';
import { pcfMonteCarlo, triangular } from '../../src/engine/esg-pcf-mc.js';
import { lowCarbonFrontier, pointForCut, frontierAt, productMacc } from '../../src/engine/esg-pcf-formula.js';
import { customerStatement, statementLines, statementMarkdown, statementCsvRows, pactExport, pactImport, gfliPreview, mi57Package, greenFeedSheet, uuidFrom } from '../../src/engine/esg-pcf-exchange.js';
import { inventory } from '../../src/engine/esg-clima.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P = currentPeriod(D);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (±${tol})`);
const ING = Object.fromEntries(D.ingredients.map(i => [i.id, i]));
const with_ = (patch) => ({ ...D, ...patch });

test('ordine di risoluzione dei fattori: fornitore > origine+schema+custodia > origine > generica > anagrafica > letteratura', () => {
  // 1 impronta del fornitore valida oggi (lisina, «Additivi (demo)» copre tutti gli arrivi)
  const lys = E.ingredientEf(D, 'lisina', {});
  assert.equal(lys.source, 'fornitore'); assert.equal(lys.step, 1); assert.equal(lys.total, 4300);
  // prima del periodo di validità vale il registro
  assert.equal(E.ingredientEf(D, 'lisina', { date: '2026-03-01' }).source, 'registro');
  // 2 origine + schema + catena di custodia; 3 origine; 4 generica
  assert.deepEqual([E.ingredientEf(D, 'soiadf', { origin: 'BR', scheme: 'ProTerra', coc: 'segregato' }).step, E.ingredientEf(D, 'soiadf', { origin: 'BR', scheme: 'ProTerra', coc: 'segregato' }).rowId], [2, 'ef-soiadf-br-proterra']);
  const us = E.ingredientEf(D, 'soia44', { origin: 'US', components: true });
  assert.deepEqual([us.step, us.total, us.luc], [3, 560, 50]);
  assert.deepEqual([E.ingredientEf(D, 'soia44', { origin: 'AR' }).step, E.ingredientEf(D, 'soia44', { origin: 'AR' }).total], [4, 1450]);
  // dal lotto di arrivo (registro EUDR) solo con fromLot
  const lot = D.eudrLots.find(e => e.ingId === 'soia44' && e.country === 'US').ingLotId;
  assert.equal(E.ingredientEf(D, 'soia44', { ingLotId: lot }).total, 1450, 'senza fromLot l’origine del lotto non cambia il totale');
  assert.equal(E.ingredientEf(D, 'soia44', { ingLotId: lot, fromLot: true }).total, 560);
  // senza components: le componenti restano null come nello stub (stessi totali per chi chiama)
  const plain = E.ingredientEf(D, 'soia44', {});
  assert.deepEqual([plain.luc, plain.landMgmt, plain.fossil, plain.landM2a], [null, null, null, null]);
  const full = E.ingredientEf(D, 'soia44', { components: true });
  close(full.fossil + full.landMgmt + full.luc + (full.biogenic || 0), full.total, 1e-6, 'componenti = totale');
  // 5 anagrafica, 6 letteratura del pacchetto (solo mangimi), mancante
  const noReg = with_({ efIngredients: [], supplierPcfs: [] });
  assert.deepEqual([E.ingredientEf(noReg, 'mais', {}).source, E.ingredientEf(noReg, 'mais', {}).dqr, E.ingredientEf(noReg, 'mais', {}).total], ['anagrafica', 5, 380]);
  const noEf = { ...noReg, ingredients: D.ingredients.map(i => (i.id === 'soia44' ? { ...i, ef: null } : i)) };
  const lit = E.ingredientEf(noEf, 'soia44', { origin: 'US', components: true });
  assert.deepEqual([lit.source, lit.total, lit.luc], ['letteratura', 550, 50]);
  assert.equal(E.ingredientEf(noEf, 'soia44', {}).rowId, 'soia-farina-nd', 'senza origine: valore prudente «origine non nota»');
  const agro = { ...noEf, settings: { ...noEf.settings, esg18: { ...noEf.settings.esg18, sector: 'agrofarmaci' } } };
  assert.equal(E.ingredientEf(agro, 'soia44', {}).source, 'mancante', 'i valori della soia non valgono per gli agrofarmaci');
  assert.equal(E.ingredientEf(D, 'inesistente', {}).total, null);
});

test('impronta: le componenti sommano al totale; LUC + gestione del suolo + non FLAG = totale; banda P10 ≤ P50 ≤ P90', () => {
  for (const p of D.products) {
    const r = E.pcf(D, p.id, { P });
    assert.ok(r && r.total > 0, p.id);
    const c = r.components;
    close(c.raw + c.loss + c.inbound + c.mill + c.packaging + (c.outbound || 0), r.total, 1e-6, `${p.id} componenti`);
    close(r.luc + r.landMgmt + r.nonFlag, r.total, 1e-6, `${p.id} FLAG`);
    close(r.lines.reduce((s, l) => s + l.raw, 0), c.raw, 1e-6, `${p.id} righe`);
    close(r.lines.reduce((s, l) => s + l.kg, 0), 1000, 1e-6, `${p.id} kg per t`);
    assert.ok(r.mc.p10 <= r.mc.p50 && r.mc.p50 <= r.mc.p90, `${p.id} banda`);
    assert.ok(r.dqr >= 1 && r.dqr <= 5 && r.primaryShare >= 0 && r.primaryShare <= 1);
    assert.match(r.hash, /^[0-9a-f]{64}$/);
    // modalità leggera (medie ponderate): stessi conti senza Monte Carlo né impronta digitale
    const L = E.pcf(D, p.id, { P, light: true });
    close(L.total, r.total, 1e-9, `${p.id} leggera`); assert.equal(L.mc.n, 0);
  }
  // perdite: calo del prodotto × materie prime
  const lt18 = E.pcf(D, 'p-lt18', { P });
  close(lt18.components.loss, lt18.components.raw * 0.006, 1e-9, 'calo 0,6% di Latte 18');
  assert.ok(lt18.lucShare > 0.15 && lt18.lucShare < 0.4, `quota LUC ${lt18.lucShare}`);
});

test('energia di stabilimento: il pellet pesa solo sui prodotti in pellet; la linea farina dà la quota comune', () => {
  const me = E.millEnergy(D, P);
  assert.ok(me.pvShare > 0 && me.pvShare < 1);
  close(me.efEl, me.efLB * (1 - me.pvShare), 1e-12, 'rete meno fotovoltaico');
  assert.equal(me.lines.L3.pellet, false); assert.equal(me.lines.L3.pelletKgT, 0);
  assert.ok(me.lines.L1.pelletKgT > 0 && me.lines.L2.pelletKgT > 0);
  close(me.commonKwhT, me.lines.L3.kwhT, 1e-9, 'quota comune = intensità della linea farina');
  for (const p of D.products) {
    const r = E.pcf(D, p.id, { P });
    if (p.lineId === 'L3') { assert.equal(r.components.millPellet, 0, p.id + ' in farina'); close(r.components.mill, me.commonKgT, 1e-9); }
    else assert.ok(r.components.millPellet > 0, p.id + ' in pellet');
  }
  // l'elettricità tutta da rete (senza sottrarre il fotovoltaico) aumenta la quota comune
  const lb = { ...D, settings: { ...D.settings, esg18: { ...D.settings.esg18, pcf: { ...D.settings.esg18.pcf, elModel: 'rete-LB' } } } };
  assert.ok(E.millEnergy(lb, P).commonKgT > me.commonKgT);
});

test('Monte Carlo: stesso seme stesso risultato, quantili ordinati, triangolare dentro gli estremi, al massimo 2.000 iterazioni', () => {
  const inputs = [{ central: 300, low: 200, high: 450 }, { central: 120, low: 100, high: 160 }, { central: 10, low: 9, high: 11 }];
  const a = pcfMonteCarlo(inputs, 2000, 18), b = pcfMonteCarlo(inputs, 2000, 18), c = pcfMonteCarlo(inputs, 2000, 19);
  assert.deepEqual(a, b);
  assert.notEqual(a.p50, c.p50);
  assert.ok(a.p10 <= a.p50 && a.p50 <= a.p90 && a.p10 >= 309 && a.p90 <= 621);
  assert.equal(pcfMonteCarlo(inputs, 50000, 1).n, 2000);
  assert.deepEqual(pcfMonteCarlo([], 100, 1).n, 0);
  const R = rng(5);
  for (let i = 0; i < 500; i++) { const x = triangular(R.next(), 1, 2, 5); assert.ok(x >= 1 && x <= 5); }
});

test('continuità con il vecchio passaporto: la componente «materie prime» del demo = formulaCO2 della formula in vigore (±0,5%)', () => {
  for (const p of D.products) {
    const f = D.formulas.find(x => x.id === p.formulaId);
    const legacy = formulaCO2(f.lines, ING);
    const r = E.pcf(D, p.id, {});
    assert.ok(Math.abs(r.components.raw - legacy) <= 0.005 * legacy, `${p.id}: ${r.components.raw} contro ${legacy}`);
  }
});

test('dichiarazione per cliente: Σ consegne × impronta della versione del lotto; nessuna materia prima nelle esportazioni', () => {
  const cust = 'c-1';
  const ships = D.shipments.filter(s => s.customerId === cust && s.date >= P.from && s.date <= P.to);
  const lots = new Map(D.lots.map(l => [l.id, l])), runs = new Map(D.runs.map(r => [r.id, r]));
  let exp = 0, t = 0;
  for (const s of ships) {
    const v = runs.get(lots.get(s.lotId)?.runId)?.formulaVersion;
    const r = E.pcf(D, s.productId, { P, formulaVersion: v });
    exp += s.tonnes * r.total / 1000; t += s.tonnes;
  }
  const st = customerStatement(D, cust, P.key);
  close(st.totals.tco2e, exp, 0.1, 't CO₂e'); close(st.totals.t, t, 0.1, 't');
  close(st.totals.lucT + st.totals.landMgmtT + st.totals.nonFlagT, st.totals.tco2e, 0.2, 'ripartizione');
  assert.ok(st.eudr.n > 0, 'riferimenti EUDR dalle consegne');
  assert.match(st.hash, /^[0-9a-f]{64}$/);
  // nessuna materia prima (nome o codice) nei testi, nel JSON e nel CSV per il cliente
  const texts = [JSON.stringify(st), statementMarkdown(st), JSON.stringify(statementCsvRows(st)), ...statementLines(customerStatement(D, cust, P.key, 'en'))].join('\n').toLowerCase();
  for (const i of D.ingredients) for (const w of [i.name, i.code, i.short].filter(Boolean)) assert.ok(!texts.includes(String(w).toLowerCase()), `«${w}» nella dichiarazione`);
  for (const bad of ['carbon neutral', 'impatto zero', 'co₂ neutro', 'iso 14067', 'pact-conformant', 'conforme eudr']) assert.ok(!texts.includes(bad), bad);
  assert.ok(statementLines(st).some(l => l.includes('non sostituisce consulenza')), 'avvertenza');
  assert.equal(customerStatement(D, 'cliente-inesistente', P.key), null);
});

test('PACT: campi obbligatori, andata e ritorno, errori in italiano su file non validi', () => {
  const snaps = D.pcfSnapshots.filter(s => s.status === 'attiva');
  const ex = pactExport(D, snaps);
  assert.equal(ex.data.length, snaps.length);
  for (const pf of ex.data) {
    for (const k of ['id', 'specVersion', 'precedingPfIds', 'created', 'status', 'companyName', 'companyIds', 'productIds', 'productNameCompany', 'pcf', 'extensions']) assert.ok(k in pf, k);
    assert.match(pf.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    for (const k of ['declaredUnitOfMeasurement', 'declaredUnitAmount', 'pcfExcludingBiogenicUptake', 'referencePeriodStart', 'referencePeriodEnd', 'primaryDataShare', 'productOrSectorSpecificRules', 'secondaryEmissionFactorSources']) assert.ok(k in pf.pcf, 'pcf.' + k);
    assert.match(pf.comment, /non testata per la conformità/);
    assert.ok(!JSON.stringify(pf).toLowerCase().includes('farina di estrazione'), 'nessuna materia prima');
  }
  // la versione superata compare tra le precedenti di quella attiva
  const lt18s = ex.data.find(x => x.productNameCompany === 'Latte 18 Sacco');
  assert.equal(lt18s.precedingPfIds.length, 1);
  assert.equal(uuidFrom('x'), uuidFrom('x'));
  // ritorno: la stessa impronta letta come impronta di un fornitore (kg CO₂e per t)
  const back = pactImport(D, JSON.stringify(lt18s), { supplierId: 'sup-additivi', ingId: 'lisina' });
  assert.ok(back.ok, back.errors.join('; '));
  close(back.rows[0].pcfExcl, lt18s.pcf.pcfExcludingBiogenicUptake, 0.1);
  assert.equal(back.rows[0].periodEnd, P.to);
  assert.equal(back.ops[0].kind, 'upsertMany');
  // per kg → per t
  const perKg = { id: 'a', specVersion: '2.3.0', companyName: 'Additivi (demo)', productNameCompany: 'L-lisina HCl', pcf: { declaredUnit: 'kilogram', unitaryProductAmount: 1, pCfExcludingBiogenic: 3.9, referencePeriodStart: '2026-01-01T00:00:00Z', referencePeriodEnd: '2027-01-01T00:00:00Z' } };
  const r2 = pactImport(D, perKg);
  assert.ok(r2.ok, r2.errors.join('; ')); assert.equal(r2.rows[0].pcfExcl, 3900); assert.equal(r2.rows[0].supplierId, 'sup-additivi'); assert.equal(r2.rows[0].ingId, 'lisina'); assert.equal(r2.rows[0].periodEnd, '2026-12-31');
  // errori
  assert.deepEqual(pactImport(D, '{non json').errors, ['Il file non è un JSON valido.']);
  const bad = pactImport(D, { ...perKg, pcf: { ...perKg.pcf, declaredUnit: 'liter' } });
  assert.equal(bad.ok, false); assert.match(bad.errors[0], /unità dichiarata/);
  assert.match(pactImport(D, { ...perKg, pcf: { ...perKg.pcf, pCfExcludingBiogenic: null } }).errors[0], /manca l’impronta/);
  assert.match(pactImport(D, { ...perKg, pcf: { ...perKg.pcf, referencePeriodStart: '2027-06-01', referencePeriodEnd: '2027-01-01' } }).errors[0], /finisce prima/);
  assert.match(pactImport(D, { ...perKg, companyName: 'Sconosciuto' }).errors[0], /fornitore non riconosciuto/);
});

test('frontiera a basso carbonio: costo che sale quando l’impronta scende, tetto rispettato, proposta del demo', () => {
  const fr = lowCarbonFrontier(D, 'f-vl18', { objective: 'co2' });
  assert.ok(fr.feasible && fr.points.length >= 5);
  for (let i = 1; i < fr.points.length; i++) {
    assert.ok(fr.points[i].metric <= fr.points[i - 1].metric + 1e-6, 'impronta decrescente');
    assert.ok(fr.points[i].cost >= fr.points[i - 1].cost - 1e-6, 'costo crescente');
    assert.ok(fr.points[i].eurPerKg >= -1e-9);
  }
  const pt = pointForCut(D, 'f-vl18', fr, 0.09);
  assert.ok(pt.metric <= fr.base.metric * 0.91 + 1e-6 && pt.cost >= fr.base.cost - 1e-9);
  close(pt.vsBase.pct, -0.09, 0.002, 'riduzione del 9%');
  assert.equal(frontierAt(D, 'f-vl18', fr, 1), null, 'tetto impossibile');
  const des = D.lowCarbonDesigns.find(x => x.productId === 'p-lt18');
  assert.ok(des && des.co2DeltaT < 0 && des.costDeltaT > 0 && des.costDeltaT < 5, JSON.stringify({ c: des?.costDeltaT, e: des?.co2DeltaT }));
  // obiettivi LUC e suolo; vincolo sulle proteine edibili dall'uomo
  const luc = lowCarbonFrontier(D, 'f-vl18', { objective: 'luc', points: 5 });
  assert.ok(luc.feasible && luc.points.at(-1).luc <= luc.points[0].luc + 1e-6);
  const hep = lowCarbonFrontier(D, 'f-vl18', { objective: 'co2', hepMax: 0.4, points: 4 });
  for (const p of hep.points) assert.ok(p.hep <= 0.4 + 1e-6, `HeP ${p.hep}`);
});

test('allarmi di ricalcolo: nuova versione della formula; energia oltre il 10%; fotografia aggiornata senza allarmi', () => {
  const al = E.recalcAlerts(D);
  assert.deepEqual(al.map(a => a.product.id), ['p-lt22']);
  assert.equal(al[0].reasons[0].kind, 'formula');
  // una nuova versione di Latte 18 fa scattare l'allarme anche per Latte 18 Sacco
  const f = D.formulas.find(x => x.id === 'f-vl18');
  const bumped = { ...D, formulas: D.formulas.map(x => (x.id === 'f-vl18' ? { ...x, version: f.version + 1, history: [...f.history, { version: f.version + 1, date: today, lines: f.lines }] } : x)) };
  assert.ok(E.recalcAlerts(bumped).some(a => a.product.id === 'p-lt18s' && a.reasons.some(r => r.kind === 'formula')));
  // energia: kWh dei registri raddoppiati
  const energy = { ...D, runs: D.runs.map(r => ({ ...r, kwh: (r.kwh || 0) * 2 })) };
  assert.ok(E.recalcAlerts(energy).some(a => a.product.id === 'p-lt18s' && a.reasons.some(r => r.kind === 'energia')));
  // segnale con chiave stabile
  const sig = E.pcfSignals(D, { today, ...ctx });
  assert.ok(sig.some(s => s.key === `pcf:recalc:p-lt22:${al[0].snapshot.id}` && s.severity === 'attenzione'));
  // pubblicare la nuova impronta: la precedente diventa superata
  const { ops, snapshot } = C.publishOps(D, 'p-lt22', { at: today });
  assert.equal(snapshot.status, 'attiva'); assert.equal(snapshot.precedingId, al[0].snapshot.id);
  assert.deepEqual(ops.map(o => o.kind), ['update', 'add']);
});

test('imballaggi: kg per t della scheda, sfuso a zero, peso di base senza scheda, fattori dei materiali', () => {
  const bag = E.packagingFor(D, D.products.find(p => p.packaging === 'Sacchi 25 kg'));
  close(bag.kgPerT, 40 * 0.12 + 40 * 0.01, 1e-9, 'kg/t');
  close(bag.recycledPct, 40 * 0.12 * 30 / bag.kgPerT, 1e-9, 'riciclato');
  close(bag.co2PerT, 4.8 * 1.1 + 0.4 * 2.5 + 0.8 * 2, 1e-9, 'kg CO₂e/t');
  assert.equal(bag.isDefault, false);
  const bulk = E.packagingFor(D, D.products.find(p => p.packaging === 'Sfuso'));
  assert.deepEqual([bulk.kgPerT, bulk.co2PerT, bulk.bulk], [0, 0, true]);
  const def = E.packagingFor({ ...D, packagingSpecs: [] }, D.products.find(p => p.packaging === 'Sacchi 25 kg'));
  assert.deepEqual([def.isDefault, def.missing], [true, true]); close(def.kgPerT, 5.6, 1e-9, 'come il pacchetto clima');
  assert.equal(E.packagingFactor('carta'), 1.1); assert.equal(E.packagingFactor('PE'), 2.5); assert.equal(E.packagingFactor('vetro'), null);
  const sum = E.packagingSummary(D, P);
  close(sum.kg, sum.rows.reduce((s, r) => s + r.kg, 0), 1e-6, 'totale');
  assert.ok(sum.bulkShare > 0 && sum.bulkShare < 1 && sum.missing.length === 0);
  // regola R29 e segnale con la scheda mancante
  const noSpec = { ...D, packagingSpecs: [] };
  assert.ok(E.PCF_RULES.find(r => r.id === 'R29').check(noSpec, ctx, {}).fails.length > 0);
  assert.ok(E.pcfSignals(noSpec, { today, ...ctx }).some(s => s.key === 'pcf:pkg-missing:sacchi-25-kg'));
});

test('importazione CSV con le colonne GFLI: abbinamento delle colonne, per kg → per t, componenti', () => {
  const csv = 'Product name;Country;Unit;Climate change;Climate change - Fossil;Climate change - Biogenic;Climate change - Land use and LU change;Land use\n'
    + 'Soybean meal;BR;kg CO2 eq/kg;2,45;0,52;0,01;1,80;2,9\nMais granella;IT;kg CO2 eq/kg;0,41;0,19;0;0;1,05\nProdotto ignoto;FR;kg CO2 eq/kg;0,3;0,2;0;0;1';
  const pv = gfliPreview(D, parseCSV(csv), { mapping: { 0: 'soia44' }, year: 2025 });
  assert.deepEqual(Object.keys(pv.map).sort(), ['biogenic', 'country', 'fossil', 'land', 'luc', 'product', 'total', 'unit']);
  const [soy, mais, ign] = pv.rows;
  assert.deepEqual([soy.rec.ingId, soy.rec.origin, soy.rec.total, soy.rec.luc, soy.rec.landM2a], ['soia44', 'BR', 2450, 1800, 2900]);
  close(soy.rec.landMgmt, 2450 - 520 - 1800 - 10, 1e-6, 'gestione del suolo per differenza');
  assert.deepEqual([mais.rec.ingId, mais.rec.total, mais.status], ['mais', 410, 'pronta']);
  assert.equal(ign.status, 'errore');
  assert.equal(pv.ops[0].objs.length, 2);
});

test('leve di riduzione: € per t CO₂e = Δ€/t ÷ Δkg CO₂e/t; soia senza deforestazione applicabile; volumi annui', () => {
  const m = productMacc(D, 'p-lt18');
  assert.ok(m && m.volume > 0);
  const dcf = m.levers.find(l => l.id === 'dcf');
  assert.ok(dcf.feasible && dcf.dCo2 > 0, 'soia DCF riduce');
  close(dcf.eurPerT, dcf.dCost / dcf.dCo2 * 1000, 1e-6);
  close(dcf.annualT, m.volume * dcf.dCo2 / 1000, 1e-6);
  assert.ok(m.cheapest && m.levers.filter(l => l.feasible && l.reduces).every(l => l.eurPerT >= m.cheapest.eurPerT - 1e-9));
  assert.ok(!dcf.lines.some(l => ['soia44', 'soia48'].includes(l.ing)), 'senza soia convenzionale');
});

test('contratto: segnali, sezione, KPI, regole, datapoint e scadenze sul demo', () => {
  const sig = E.pcfSignals(D, { today, ...ctx });
  assert.ok(sig.length >= 2 && sig.every(s => s.key.startsWith('pcf:') && s.link.tab === 'passaporto' && Number.isFinite(s.impact)));
  assert.equal(new Set(sig.map(s => s.key)).size, sig.length);
  assert.ok(sig.some(s => s.key === 'pcf:pact-expired:spcf-metionina-additivi'));
  const C2 = previousPeriod(D, P.key);
  const sec = E.pcfReportSection(D, ctx, P, C2);
  assert.equal(sec.id, 'esg-impronta'); assert.equal(sec.order, 82);
  close(sec.kpis[0].value, E.weightedPcf(D, P).pcf, 1e-9);
  assert.ok(sec.table.rows.length === 3 && sec.narrative.some(t => t.includes('non sostituisce')));
  for (const k of E.PCF_KPIS) { const v = k.compute(D, ctx, P); assert.ok(Number.isFinite(v), k.id); }
  const w = E.weightedPcf(D, P);
  assert.ok(w.pcf > 400 && w.pcf < 800, `media ${w.pcf}`);
  close(w.tco2e, Object.values(w.byProduct).reduce((s, x) => s + x.tco2e, 0), 1e-6);
  for (const r of E.PCF_RULES) { const res = r.check(D, ctx, {}); assert.ok(r.severity !== 'critico' || !res.fails.length, r.id); }
  const dp = E.pcfDatapoints(D, P);
  for (const id of ['C1.products', 'C1.pcf-mean', 'C1.pcf-luc', 'B7.circular', 'B7.packaging-t']) assert.ok(dp[id] && dp[id].value != null && dp[id].source.startsWith('pcf.'), id);
  const cal = E.pcfCalendarItems(D, today);
  assert.ok(cal.some(c => c.key === 'pcf:pact:spcf-lisina-additivi' && c.kind === 'rinnovo'));
  assert.ok(cal.some(c => c.law && c.law.includes('2025/40')));
  for (let i = 1; i < cal.length; i++) assert.ok(cal[i - 1].date <= cal[i].date);
  // scheda ambientale: solo il clima è calcolato
  const g = greenFeedSheet(E.pcf(D, 'p-lt18', {}));
  assert.ok(g.climate.total > 0 && g.others.length === 15 && g.others.every(o => o.value === null && o.status === 'non calcolato'));
  const mi = mi57Package(D, 'p-lt18', P);
  assert.match(mi.hash, /^[0-9a-f]{64}$/); assert.ok(mi.csv.some(r => r.sezione === 'energia'));
});

test('dati dimostrativi: deterministici, idempotenti, nessun dato nell’edizione agrofarmaci; il pacchetto clima riceve gli stessi totali', () => {
  const again = demoPcf(D, { today, R: rng(16 + 1001) });
  assert.deepEqual(again, {}, 'sul demo completo non aggiunge nulla');
  assert.deepEqual(patchViolations(D, again), []);
  assert.deepEqual(demoPcf({ ...D, efIngredients: [], packagingSpecs: [], pcfSnapshots: [], settings: { ...D.settings, esg18: { sector: 'agrofarmaci' } } }, { today, R: rng(1) }), {});
  // ogni riga generica ha il totale del catalogo (continuità) e componenti coerenti
  for (const r of D.efIngredients.filter(x => x.origin === '*')) {
    assert.equal(r.total, ING[r.ingId].ef, r.ingId);
    close(r.fossil + r.landMgmt + r.luc + r.biogenic, r.total, 0.5, r.ingId);
  }
  const s44 = D.efIngredients.find(r => r.id === 'ef-soia44');
  assert.deepEqual([s44.fossil, s44.landMgmt, s44.luc], [420, 130, 900]);
  // inventario del pacchetto clima: categoria 1 = Σ lotti × fattore del catalogo (le componenti si chiedono esplicitamente)
  const inv = inventory(D, P);
  const exp = D.ingLots.filter(l => l.date >= P.from && l.date <= P.to && l.status !== 'bloccato').reduce((s, l) => s + l.tonnes * ING[l.ingId].ef / 1000, 0);
  close(inv.s3.c1detail.ingT, exp, 1e-6, 'categoria 1');
});

test('archivi vuoti e di partenza: nessuna eccezione, risultati vuoti o nulli', () => {
  for (const d of [emptyData(), starterData()]) {
    const c = makeCtx(d, today), PP = currentPeriod(d);
    assert.ok(Array.isArray(E.pcfSignals(d, { today, ...c })));
    const s = E.pcfReportSection(d, c, PP, null); assert.ok(s === null || typeof s.title === 'string');
    assert.ok(typeof E.pcfDatapoints(d, PP) === 'object');
    assert.ok(Array.isArray(E.pcfCalendarItems(d, today)));
    const sm = E.pcfSummary(d, PP); assert.ok(sm === null || typeof sm === 'object');
    for (const k of E.PCF_KPIS) { const v = k.compute(d, c, PP); assert.ok(v === null || Number.isFinite(v)); }
    for (const r of E.PCF_RULES) { const res = r.check(d, c, {}); assert.ok(Number.isFinite(res.base) && Array.isArray(res.fails)); }
    const p = (d.products || [])[0];
    if (p) { const r = E.pcf(d, p.id, {}); assert.ok(r === null || Number.isFinite(r.total)); assert.ok(productMacc(d, p.id) === null || typeof productMacc(d, p.id) === 'object'); }
    assert.equal(E.pcf(d, 'nessuno', {}), null);
    assert.ok(Array.isArray(E.recalcAlerts(d)));
    assert.ok(E.packagingSummary(d, PP).kg >= 0);
    assert.equal(customerStatement(d, 'nessuno', PP.key), null);
    assert.equal(pactImport(d, '[]').ok, false);
  }
});
