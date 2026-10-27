/* FeedOS 18 · Clima e GHG (pacchetto WP1): aritmetica dei combustibili, CO₂ biogenica, Scope 2 location e market-based,
 * F-gas, categoria 1 sugli acquisti, trasporti, FLAG, GPL non contato due volte, ponte, precedenza dei fattori, demo plausibile,
 * datapoint B3, segnali, rapporto, archivi vuoti. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { currentPeriod, previousPeriod } from '../../src/engine/esg-years.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { applyPackOps } from '../../src/engine/esg-packs.js';
import * as E from '../../src/engine/esg-clima.js';

const today = '2026-10-16';
const D = demoData(today);
const P = currentPeriod(D);
const Y = { from: '2025-10-01', to: '2026-09-30', key: '12m-2026-09', label: '12 mesi a settembre 2026' };
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);
// archivio minimo con una riga di energia e i dati passati
const base = (extra = {}) => {
  const d = emptyData();
  return { ...d, settings: { ...d.settings, energy: { ...d.settings.energy } }, energy: [{ id: 'en-1', month: '2026-03', kwhGrid: 0, kwhPV: 0, kwhExport: 0, gplKg: 0 }], ...extra };
};

test('clima: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [D, emptyData(), starterData()]) {
    const ctx = makeCtx(d, today), p = currentPeriod(d);
    assert.ok(Array.isArray(E.climaSignals(d, { today, ...ctx })));
    const s = E.climaReportSection(d, ctx, p, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    assert.ok(E.climaDatapoints(d, p) && typeof E.climaDatapoints(d, p) === 'object');
    assert.ok(Array.isArray(E.climaCalendarItems(d, today)));
    const inv = E.inventory(d, p);
    assert.ok(inv && typeof inv === 'object' && !inv.error, 'inventario senza errori');
    assert.ok(Array.isArray(E.fgasDue(d, today)));
    for (const r of E.CLIMA_RULES) { const x = r.check(d, ctx, {}); assert.ok(Number.isFinite(x.base) && Array.isArray(x.fails)); }
    assert.equal(typeof E.methodMarkdown(d, p, 'en'), 'string');
  }
  for (const d of [emptyData(), starterData()]) {
    const inv = E.inventory(d, currentPeriod(d));
    assert.equal(inv.hasData, false);
    assert.deepEqual([inv.s1, inv.s2.lb, inv.s3.total, inv.totals.lb], [0, 0, 0, 0]);
    assert.equal(inv.intensity.perT, null);
    for (const k of E.CLIMA_KPIS) assert.equal(k.compute(d, makeCtx(d, today), currentPeriod(d)), null, k.id);
    assert.deepEqual(E.climaDatapoints(d, currentPeriod(d)), {});
  }
});

test('combustibili: 1.000 Sm³ di gas = 1,975 t CO₂ più CH₄ e N₂O; unità convertite; stima dal questionario', () => {
  const d = base({ fuelUse: [{ id: 'f1', month: '2026-03', fuel: 'gas', use: 'vapore', qty: 1000, unit: 'Smc', source: 'contatore' }] });
  const inv = E.inventory(d, Y);
  const l = inv.scope1.lines.find(x => x.fuel === 'gas');
  close(l.fossil, 1.975, 1e-9, 'CO₂'); close(l.nonco2, 0.0019, 1e-9, 'CH₄+N₂O'); close(inv.s1, 1.9769, 1e-9);
  assert.equal(inv.scope1.stationary, inv.s1); assert.equal(l.quality, 'misurato');
  close(inv.energy.mwhFuel, 9.72, 1e-9, 'MWh al PCI');
  // 9.720 kWh di gas = 1.000 Sm³; 2 t di GPL = 2.000 kg; litri di gas non convertibili → avviso
  const sp = E.fuelSpec(d, 'gas');
  close(E.toNatural(sp, 9720, 'kWh'), 1000, 1e-9); close(E.toNatural(E.fuelSpec(d, 'gpl'), 2, 't'), 2000, 1e-9);
  assert.equal(E.toNatural(sp, 10, 'l'), null);
  const bad = E.inventory(base({ fuelUse: [{ id: 'f2', month: '2026-03', fuel: 'gas', use: 'vapore', qty: 10, unit: 'l' }] }), Y);
  assert.equal(bad.s1, 0); assert.ok(bad.warnings.some(w => /non convertibili/.test(w)));
  // senza consumi registrati: gasolio del questionario ripartito sui mesi, qualità «stimato»
  const s = E.inventory(base({ survey: { 'en-diesel': 1200 } }), Y);
  const g = s.scope1.lines.find(x => x.fuel === 'gasolio');
  close(g.activity, 1200, 1e-9); close(g.tco2e, 1200 * 2.66 / 1000, 1e-9); assert.equal(g.quality, 'stimato'); assert.ok(s.scope1.fromSurvey);
});

test('HVO: CO₂ fossile zero, CH₄ e N₂O nello Scope 1, CO₂ biogenica fuori dagli scope; energia rinnovabile', () => {
  const inv = E.inventory(base({ fuelUse: [{ id: 'h', month: '2026-02', fuel: 'hvo', use: 'flotta', qty: 1000, unit: 'l', source: 'fattura' }] }), Y);
  const l = inv.scope1.lines[0];
  assert.equal(l.fossil, 0); close(l.nonco2, 0.042, 1e-9); close(inv.scope1.mobile, 0.042, 1e-9);
  close(inv.biogenicCO2, 2.5, 1e-9); close(inv.energy.mwhRenFuel, 9.53, 1e-9);
  assert.equal(E.ets2Exposure(base({ fuelUse: [{ id: 'h', month: '2026-02', fuel: 'hvo', use: 'flotta', qty: 1000, unit: 'l' }] }), Y).tCO2, 0, 'HVO fuori dall’ETS2');
});

test('Scope 2: location-based, market-based con garanzie d’origine, null con il motivo senza mix residuo', () => {
  const energy = [{ id: 'e1', month: '2026-01', kwhGrid: 100000, kwhPV: 30000, kwhExport: 5000, gplKg: 0 }, { id: 'e2', month: '2026-02', kwhGrid: 100000, kwhPV: 30000, kwhExport: 5000, gplKg: 0 }];
  const d0 = base({ energy });
  const a = E.inventory(d0, Y);
  close(a.s2.lb, 200000 * 0.1926 / 1000, 1e-9, 'rete 2024 consolidato degli archivi nuovi');
  assert.equal(a.s2.mb, null); assert.match(a.s2.reason, /Mix residuo non impostato/);
  close(a.energy.mwhRenEl, 50, 1e-9, 'fotovoltaico autoconsumato'); close(a.energy.renElShare, 50 / 250, 1e-9);
  // garanzie d'origine 80 MWh nel 2026 e mix residuo 0,45 → (200.000 − 80.000) × 0,45
  const d1 = { ...d0, elecContracts: [{ id: 'c', year: 2026, supplier: 'X', goMWh: 80, ppaMWh: 0 }], factorOverrides: [{ id: 'el.rm.it', value: 0.45, unit: 'kg CO₂/kWh', source: 'prova', year: 2025, reason: 'prova' }] };
  const b = E.inventory(d1, Y);
  close(b.s2.mb, 120000 * 0.45 / 1000, 1e-9); close(b.energy.mwhRenEl, 50 + 80, 1e-9);
  assert.equal(b.s2.reason, null); assert.ok(b.s2.mb > 0);
  // mix residuo indicato nel contratto del fornitore
  const c = E.inventory({ ...d0, elecContracts: [{ id: 'c', year: 2026, supplier: 'X', goMWh: 0, residualOverride: 0.4 }] }, Y);
  close(c.s2.mb, 200000 * 0.4 / 1000, 1e-9);
  // segnale «market-based mancante» quando c'è elettricità di rete
  assert.ok(E.climaSignals({ ...d0, settings: { ...d0.settings, dataset: 'demo', demoAnchor: '2026-10-16' } }, { today }).some(s => s.key.startsWith('clima:mb-missing:')));
});

test('F-gas: frequenze dei controlli, raddoppio con il rilevatore, esenzioni, verifica dopo la ricarica, perdite nello Scope 1', () => {
  assert.equal(E.leakCheckMonths(4.9).exempt, true);
  assert.equal(E.leakCheckMonths(14.7).months, 12);
  assert.equal(E.leakCheckMonths(56.7).months, 6);
  assert.equal(E.leakCheckMonths(600).months, 3);
  assert.equal(E.leakCheckMonths(600).detectorRequired, true);
  assert.equal(E.leakCheckMonths(56.7, { leakDetection: true }).months, 12);
  assert.equal(E.leakCheckMonths(8, { hermetic: true }).exempt, true);
  assert.equal(E.leakCheckMonths(12, { hermetic: true }).months, 12);
  const due = E.fgasDue(D, today);
  const cella = due.find(x => x.gas === 'R-404A'), uff = due.find(x => x.gas === 'R-32');
  close(cella.chargeT, 12 * 4728 / 1000, 1e-9); assert.equal(cella.months, 6); assert.equal(cella.status, 'in scadenza'); assert.equal(cella.daysLeft, 20);
  assert.equal(uff.status, 'esente');
  close(E.inventory(D, P).scope1.fugitive, 1.8 * 4728 / 1000, 1e-9, 'ricarica di 1,8 kg di R-404A');
  // ricarica dopo l'ultimo controllo: verifica entro un mese
  const d = { ...D, fgasEvents: [...D.fgasEvents, { id: 'x', equipmentId: cella.equipmentId, date: '2026-10-01', type: 'ricarica', kg: 0.5 }] };
  const c2 = E.fgasDue(d, today).find(x => x.gas === 'R-404A');
  assert.equal(c2.followUp, true); assert.equal(c2.due, '2026-11-01');
  // composizione delle miscele coerente con i GWP AR6 dei componenti
  for (const id of ['ref.R-410A', 'ref.R-404A', 'ref.R-407C', 'ref.R-449A']) {
    const it = E.PACK_CLIMA.items.find(x => x.id === id);
    const v = it.comp.reduce((s, [g, w]) => s + w * E.PACK_CLIMA.items.find(x => x.id === 'ref.' + g).value, 0);
    assert.ok(Math.abs(v - it.value) <= 1, `${id}: ${v} contro ${it.value}`);
  }
});

test('categoria 1 sulle tonnellate acquistate: Σ lotti accettati × fattore; FLAG + non FLAG = categoria 1', () => {
  const inv = E.inventory(D, P);
  const ing = Object.fromEntries(D.ingredients.map(i => [i.id, i]));
  const exp = D.ingLots.filter(l => l.date >= '2025-10-01' && l.date <= '2026-09-30' && l.status !== 'bloccato').reduce((s, l) => s + l.tonnes * ing[l.ingId].ef / 1000, 0);
  close(inv.s3.c1detail.ingT, exp, 1e-6);
  close(inv.s3.flag + inv.s3.nonFlag, inv.s3.c1, 1e-6);
  assert.ok(inv.s3.flag > 0 && inv.s3.flag < inv.s3.c1);
  assert.equal(inv.s3.flagMethod, 'categoria', 'senza componenti dei fattori: stima per categoria');
  assert.ok(inv.s3.landHa > 0);
  // componenti dal registro delle materie prime: valgono le componenti
  const one = base({ ingredients: [{ id: 'm', name: 'Mais', category: 'cereale', origin: 'Italia', ef: 400 }], ingLots: [{ id: 'l', ingId: 'm', date: '2026-01-10', tonnes: 100, status: 'accettato' }] });
  const i1 = E.inventory(one, Y);
  close(i1.s3.c1, 40, 1e-9); close(i1.s3.flag, 40 * 0.45, 1e-9); close(i1.s3.landHa, 100 * 1000 * 1.4 / 1e4, 1e-9);
  assert.equal(E.inventory({ ...one, ingLots: [{ ...one.ingLots[0], status: 'bloccato' }] }, Y).s3.c1, 0, 'lotto respinto escluso');
});

test('trasporti: distanza in linea d’aria × fattore stradale per vettori (cat. 4) e ritiri (cat. 9); profili in ingresso', () => {
  close(E.haversineKm({ lat: 39, lon: 16 }, { lat: 40, lon: 16 }), 111.195, 1e-3);
  const d = base({
    settings: { ...emptyData().settings, company: { name: 'X', lat: 39, lon: 16 }, logistics: { roadFactor: 1.3 } },
    customers: [{ id: 'c1', lat: 40, lon: 16 }, { id: 'c2', lat: 39.5, lon: 16 }], products: [{ id: 'p', packaging: 'Sfuso' }],
    customerLogistics: [{ id: 'c1', mode: 'vettore' }, { id: 'c2', mode: 'ritiro-cliente' }],
    shipments: [{ id: 's1', date: '2026-02-01', customerId: 'c1', productId: 'p', tonnes: 10, price: 300 }, { id: 's2', date: '2026-02-02', customerId: 'c2', productId: 'p', tonnes: 20, price: 300 }],
    ingredients: [{ id: 's', name: 'Soia', category: 'proteico', origin: 'Extra-UE', ef: 1000 }], ingLots: [{ id: 'l', ingId: 's', date: '2026-01-10', tonnes: 50, status: 'accettato' }],
    logisticsProfiles: [{ id: 'lp', origin: 'Extra-UE', legs: [{ mode: 'nave', km: 10000 }, { mode: 'camion', km: 100 }], includedInEf: false }],
  });
  const inv = E.inventory(d, Y);
  const km1 = E.haversineKm({ lat: 39, lon: 16 }, { lat: 40, lon: 16 }) * 1.3, km2 = E.haversineKm({ lat: 39, lon: 16 }, { lat: 39.5, lon: 16 }) * 1.3;
  close(inv.s3.c9, 20 * km2 * 0.105 / 1000, 1e-9, 'ritiri');
  close(inv.s3.c4, 10 * km1 * 0.105 / 1000 + 50 * (10000 * 0.006 + 100 * 0.105) / 1000, 1e-9, 'vettori + ingresso');
  close(E.netRevenue(d, E.windowOf(Y)).value, 9000, 1e-9, 'ricavi netti dal conto economico');
  close(inv.intensity.revenueNet, 9000, 1e-9);
  // profilo già compreso nel fattore: nessun trasporto in più
  const inc = E.inventory({ ...d, logisticsProfiles: [{ ...d.logisticsProfiles[0], includedInEf: true }] }, Y);
  close(inc.s3.c4, 10 * km1 * 0.105 / 1000, 1e-9);
});

test('GPL non contato due volte: le righe di GPL dei consumi sostituiscono il registro dell’energia nel mese; R22 lo segnala', () => {
  const d = base({ energy: [{ id: 'e', month: '2026-03', kwhGrid: 0, gplKg: 1000 }, { id: 'e2', month: '2026-04', kwhGrid: 0, gplKg: 500 }],
    fuelUse: [{ id: 'g', month: '2026-03', fuel: 'gpl', use: 'vapore', qty: 800, unit: 'kg', source: 'fattura' }] });
  const inv = E.inventory(d, Y);
  const gpl = inv.scope1.lines.filter(l => l.fuel === 'gpl').reduce((s, l) => s + l.activity, 0);
  close(gpl, 800 + 500, 1e-9);
  close(inv.s1, 1300 * (2.985 + 0.0026) / 1000, 1e-9);
  const r22 = E.CLIMA_RULES.find(r => r.id === 'R22').check(d, { today });
  assert.equal(r22.fails.length, 1); assert.equal(r22.fails[0].id, 'e');
});

test('fattori: sostituzione > pacchetto importato > integrato; operazioni di sostituzione e ripristino; fattore di rete della scheda Energia', () => {
  const d0 = emptyData();
  assert.equal(E.factor(d0, 'gas.co2').value, 1.975);
  assert.equal(E.factor(d0, 'fattore-inesistente'), null);
  assert.equal(E.factor(d0, 'el.rm.it'), null, 'mix residuo senza valore di base');
  assert.equal(E.factor(d0, 'el.lb.it', 2024).id, 'el.lb.it.2024', 'famiglia per anno, consolidato prima del preliminare');
  assert.equal(E.factor(d0, 'el.lb.it', 2025).id, 'el.lb.it.2025p');
  const imp = applyPackOps(d0, { pack: 'clima', version: '2027.1', validAsOf: '2027-01-15', items: [{ id: 'gas.co2', value: 1.99, unit: 'kg CO₂/Sm³', source: 'MASE 2026', year: 2026, status: 'verificato' }] });
  const d1 = applyOpsTo(d0, imp.ops).data;
  assert.equal(E.factor(d1, 'gas.co2').value, 1.99); assert.equal(E.climaPackInfo(d1).origin, 'importato');
  const ops = E.overrideOps(d1, 'gas.co2', { value: 2.01, source: 'Analisi del distributore', year: 2026, reason: 'gas a PCI più alto' }, { by: 'Qualità', at: '2026-10-16' });
  const d2 = applyOpsTo(d1, ops).data;
  const f = E.factor(d2, 'gas.co2');
  assert.deepEqual([f.value, f.overridden, f.prev.value, f.by], [2.01, true, 1.99, 'Qualità']);
  assert.deepEqual(E.overrideOps(d2, 'gas.co2', { value: 2, source: '', reason: 'x' }), [], 'serve la fonte');
  assert.equal(E.factor(applyOpsTo(d2, E.resetOps(d2, 'gas.co2')).data, 'gas.co2').value, 1.99);
  // rete: segue la scheda Energia (demo: Italia 2023), scelta per anno, valore personalizzato documentato
  assert.equal(E.gridFactorInUse(D, P).id, 'el.lb.it.2023');
  assert.equal(E.gridFactorInUse({ ...D, settings: { ...D.settings, esg18: { ...D.settings.esg18, clima: { ...D.settings.esg18.clima, gridFactor: 'auto' } } } }, P).id, 'el.lb.it.2025p');
  const cust = E.gridFactorInUse({ ...d0, settings: { ...d0.settings, energy: { feGrid: 0.3, gridFactor: '' } } }, Y);
  assert.deepEqual([cust.value, cust.custom], [0.3, true]);
  // settore agrofarmaci: niente stime FLAG del settore mangimi
  assert.equal(E.factor({ ...d0, settings: { ...d0.settings, esg18: { sector: 'agrofarmaci' } } }, 'flag.cereale'), null);
  assert.ok(E.factor(d0, 'flag.cereale'));
});

test('ponte delle emissioni: la somma dei passi è esattamente la differenza dei totali', () => {
  const br = E.bridgeFor(D, P, previousPeriod(D, P.key));
  assert.equal(br.mode, 'semestri', 'nel demo l’esercizio precedente non ha dati: si confrontano le due metà');
  const b = br.bridge;
  close(b.steps.reduce((s, x) => s + x.value, 0), b.end - b.start, 1e-6);
  assert.ok(b.check);
  close(b.start, br.A.inv.totals.lb, 1e-9); close(b.end, br.B.inv.totals.lb, 1e-9);
  // ogni passo è contenuto (nessuna coppia di effetti enormi che si compensano)
  for (const s of b.steps) assert.ok(Math.abs(s.value) < Math.max(b.start, b.end) * 0.5, `${s.id} ${s.value}`);
  // più fotovoltaico a parità di resto → passo «fotovoltaico» negativo, il resto quasi zero
  const A = E.inventory(D, P);
  const more = { ...D, energy: D.energy.map(e => ({ ...e, kwhGrid: Math.max(0, e.kwhGrid - 10000), kwhPV: e.kwhPV + 10000 })) };
  const g = E.ghgBridge(A, E.inventory(more, P));
  close(g.steps.reduce((s, x) => s + x.value, 0), g.delta, 1e-6);
  assert.ok(g.steps.find(s => s.id === 'fotovoltaico').value < 0);
  const t = E.bridgeText(br, 'en');
  assert.match(t.sentence, /^Between Oct 25 – Mar 26 and Apr 26 – Sep 26/);
  assert.match(E.bridgeText(br, 'it').text, /Tra .* le emissioni totali passano da/);
});

test('demo: valori plausibili, totale = somma delle categorie, quote di qualità, datapoint B3 completi', () => {
  const inv = E.inventory(D, P);
  assert.ok(inv.hasData && inv.coverage.comparable);
  assert.ok(inv.intensity.opsPerT >= 8 && inv.intensity.opsPerT <= 25, `S1+S2 ${inv.intensity.opsPerT} kg/t`);
  assert.ok(inv.intensity.s3PerT >= 300 && inv.intensity.s3PerT <= 1000, `S3 ${inv.intensity.s3PerT} kg/t`);
  assert.ok(inv.s2.mb > inv.s2.lb, 'senza garanzie d’origine il market-based supera il location-based');
  const cats = inv.s3.cats.reduce((s, c) => s + c.value, 0);
  close(inv.s3.total, cats, 0.01);
  close(inv.totals.lb, inv.scope1.stationary + inv.scope1.mobile + inv.scope1.fugitive + inv.s2.lb + cats, 0.01);
  close(['misurato', 'calcolato', 'stimato', 'default', 'mancante'].reduce((s, k) => s + inv.quality[k], 0), 1, 1e-9);
  const share = inv.s3.flag / inv.totals.lb;
  assert.ok(share > 0.3 && share < 0.9, `FLAG ${share}`);
  close(inv.intensity.revenueNet, makeCtx(D, today) && E.netRevenue(D, E.windowOf(P), makeCtx(D, today)).value, 1e-6, 'stessi ricavi netti del conto economico');
  const dp = E.climaDatapoints(D, P);
  for (const id of ['B3.s1', 'B3.s2-lb', 'B3.s2-mb', 'B3.mwh', 'B3.mwh-ren-el', 'B3.intensity']) assert.ok(dp[id] && dp[id].value != null && dp[id].quality !== 'mancante', id);
  assert.equal(dp['B3.s2-mb'].quality, 'stimato', 'mix residuo dimostrativo');
  assert.equal(dp['C3.base-year'].value, P.label);
  for (const k of E.CLIMA_KPIS) { const v = k.compute(D, makeCtx(D, today), P); assert.ok(v != null && Number.isFinite(v), k.id); }
});

test('segnali, scadenze e regole: chiavi uniche con il prefisso, F-gas in scadenza, nessuna regola in errore sul demo', () => {
  const ctx = makeCtx(D, today);
  const sig = E.climaSignals(D, { today, ...ctx });
  assert.equal(new Set(sig.map(s => s.key)).size, sig.length);
  assert.ok(sig.every(s => s.key.startsWith('clima:') && Number.isFinite(s.impact) && s.link.tab === 'clima'));
  const f = sig.find(s => s.key.startsWith('clima:fgas-due:'));
  assert.ok(f && f.severity === 'attenzione' && f.impact > 0);
  // controllo scaduto → critico
  const late = E.climaSignals(D, { today: '2026-12-01' }).find(s => s.key.startsWith('clima:fgas-due:'));
  assert.equal(late.severity, 'critico');
  // mese chiuso senza consumi registrati → segnale e regola R21
  const d = { ...D, fuelUse: D.fuelUse.filter(r => r.month !== '2026-09') };
  assert.ok(E.climaSignals(d, { today }).some(s => s.key === 'clima:fuel-missing:2026-09'));
  assert.ok(E.CLIMA_RULES.find(r => r.id === 'R21').check(d, { today }).fails.some(x => x.id === '2026-09'));
  for (const r of E.CLIMA_RULES) assert.equal(r.check(D, ctx, {}).fails.length, 0, r.id);
  // apparecchiatura senza carica → R24
  assert.equal(E.CLIMA_RULES.find(r => r.id === 'R24').check({ ...D, fgasEquipment: [{ id: 'z', name: 'Z', gas: 'R-32' }] }, ctx).fails.length, 1);
  const cal = E.climaCalendarItems(D, today);
  assert.equal(new Set(cal.map(x => x.key)).size, cal.length);
  assert.ok(cal.some(x => x.kind === 'controllo' && x.date === '2026-11-05'));
});

test('rapporto e sezione: struttura ISO 14064-1 in italiano e inglese, avvertenza, nessuna dichiarazione vietata', () => {
  const it = E.methodMarkdown(D, P, 'it'), en = E.methodMarkdown(D, P, 'en');
  for (const h of ['## 1. Organizzazione e confini', '## 3. Scope 3 per categoria', '## 4. Fattori di emissione usati', '## 6. Anno base']) assert.ok(it.includes(h), h);
  assert.ok(en.includes('## 2. Results') && en.includes('Scope 2 market-based') && en.includes('Emission factors used'));
  assert.ok(it.includes('non sostituisce consulenza'));
  for (const s of [it, en]) assert.ok(!/carbon neutral|impatto zero|CO₂ neutro|ISO 14067|SBTi validated/i.test(s));
  const sec = E.climaReportSection(D, makeCtx(D, today), P, null);
  assert.equal(sec.id, 'esg-clima'); assert.equal(sec.order, 81);
  assert.ok(sec.table.rows.length >= 6 && sec.narrative.some(n => /passano da/.test(n)));
  const j = E.inventoryJson(D, P);
  close(j.totals.totalLb, E.inventory(D, P).totals.lb, 0.01);
  assert.ok(j.lines.length > 5 && j.factors.some(f => f.id === 'el.lb.it.2023'));
  const ets = E.ets2Exposure(D, P);
  assert.deepEqual(ets.rows.map(r => r.price), [45, 60, 100]);
  close(ets.rows[0].cost, ets.annualTCO2 * 45, 1e-6);
});
