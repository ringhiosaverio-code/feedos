/* FeedOS 17 · fondamenta (F7, F9, F10, F11): aree e ruoli, contratti dei pacchetti, segnali corretti,
 * demo con estensori (solo aggiunte), rettifiche inventariali e bilancio di massa chiuso, identità dei margini sul demo completo.
 * Le parti già coperte da foundation-core (schema, migrazioni, CSV, codici) e foundation-economics (fatti, periodi) non si ripetono. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo, DEMO_VERSION } from '../../src/data/demo/generator.js';
import { demoData, upgradeDemo, closingAdjustments } from '../../src/data/demo/index.js';
import { EXTENDERS, applyDemoExtenders, applyPatch, patchViolations, OVERWRITE_OK } from '../../src/data/demo/extend.js';
import { COLLECTIONS, DEFAULT_SETTINGS, validateShape, migrateData } from '../../src/core/schema.js';
import { makeCtx, aggregateFacts, FACT_SUMS } from '../../src/engine/actuals.js';
import { computeSignals } from '../../src/engine/signals.js';
import { SIGNAL_PROVIDERS, REPORT_SECTIONS } from '../../src/engine/providers.js';
import { buildIndex, recall } from '../../src/engine/trace.js';
import { registerRunOps } from '../../src/engine/operations.js';
import { resolvePeriod } from '../../src/core/period.js';
import { AREA_IDS } from '../../src/core/areaIds.js';
import { AREAS } from '../../src/core/router.js';
import { rng, sum, byId, addDays, daysBetween } from '../../src/core/util.js';
import * as budget from '../../src/engine/budget.js';
import * as pnl from '../../src/engine/pnl.js';
import * as credit from '../../src/engine/credit.js';
import * as inventory from '../../src/engine/inventory.js';
import * as cash from '../../src/engine/cash.js';
import * as profitability from '../../src/engine/profitability.js';
import * as breakeven from '../../src/engine/breakeven.js';
import * as forecast from '../../src/engine/forecast.js';
import * as pricing from '../../src/engine/pricing.js';
import * as commissions from '../../src/engine/commissions.js';
import * as suppliers from '../../src/engine/suppliers.js';
import * as purchaseVariance from '../../src/engine/purchaseVariance.js';
import * as oee from '../../src/engine/oee.js';
import * as massbalance from '../../src/engine/massbalance.js';
import * as kpis from '../../src/engine/kpis.js';
import * as dataquality from '../../src/engine/dataquality.js';

const today = '2026-10-16';
const g = generateDemo({ today });
const D = demoData(today);
const ctx = makeCtx(D, today);
const P12 = resolvePeriod({ preset: '12m' }, today);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

/* ---------------- generatore e demo completo ---------------- */
test('generatore: schema 17 con le impostazioni di base, tutte le raccolte, niente campi interni', () => {
  assert.equal(DEMO_VERSION, 5);
  assert.equal(g.settings.schema, 17); assert.equal(g.settings.demoVersion, 5);
  for (const k of Object.keys(DEFAULT_SETTINGS)) assert.ok(k in g.settings, 'impostazione ' + k);
  assert.deepEqual(g.settings.finance, DEFAULT_SETTINGS.finance);
  assert.equal(g.settings.company.lat, null);
  for (const c of COLLECTIONS) assert.ok(Array.isArray(g[c]), c);
  assert.ok(g.customers.every(c => !('stopAfterWeek' in c)), 'stopAfterWeek non entra nei dati');
  assert.deepEqual(migrateData(g).applied, [], 'nessuna migrazione da fare');
  assert.ok(validateShape(D).ok, validateShape(D).errors.join('; '));
  assert.equal(D.settings.dataset, 'demo');
  // senza __FULL__ (versione pubblica e test) i testi del demo non citano la tesi
  assert.ok(!/\btesi\b/i.test(JSON.stringify(g.tasks)), 'attività del demo senza riferimenti alla tesi');
});

test('rettifiche inventariali: il taglio delle scorte basse è registrato e ogni lotto MP chiude entro 0,01 t', () => {
  assert.equal(D.adjustments.length, 8);
  assert.deepEqual([...new Set(D.adjustments.map(a => a.ingId))].sort(), ['lisina', 'orzo', 'soia48']);
  const lotById = byId(D.ingLots);
  for (const a of D.adjustments) {
    assert.ok(a.tonnes < 0 && a.reason === 'inventario' && a.date === today && /dimostrativo/.test(a.note));
    assert.equal(lotById[a.ingLotId].ingId, a.ingId);
  }
  const used = {}, adj = {};
  for (const l of D.lots) for (const c of l.comp) used[c.l] = (used[c.l] || 0) + c.kg / 1000;
  for (const a of D.adjustments) adj[a.ingLotId] = (adj[a.ingLotId] || 0) + a.tonnes;
  for (const l of D.ingLots) {
    // tutte le rettifiche del demo tolgono giacenza: Σ |rettifiche| = −Σ rettifiche
    const gap = l.tonnes - l.remaining - (used[l.id] || 0) - Math.abs(adj[l.id] || 0);
    assert.ok(Math.abs(gap) <= 0.01, `${l.code}: tonnellate ${l.tonnes} ≠ residuo ${l.remaining} + usato + rettifiche (scarto ${gap.toFixed(4)})`);
  }
  // la scorta dell'ingrediente resta la somma dei residui accettati (rettifiche già applicate)
  for (const id of ['soia48', 'lisina', 'orzo']) close(D.ingredients.find(i => i.id === id).stock, sum(D.ingLots.filter(l => l.ingId === id && l.status === 'accettato'), l => l.remaining), 0.06, id);
  assert.deepEqual(closingAdjustments(D, today), [], 'niente da rettificare sul demo corrente');
});

test('richiamo: il bilancio di massa del lotto considera le rettifiche', () => {
  const ix = buildIndex(D);
  const a = D.adjustments.find(x => x.tonnes < -20);
  const r = recall(ix, { ingLots: [a.ingLotId] });
  close(r.massBalance.adjusted, -a.tonnes, 1e-9);
  assert.ok(Math.abs(r.massBalance.gap) < 0.05, 'bilancio chiuso: ' + r.massBalance.gap);
  close(r.massBalance.received, r.massBalance.used + r.massBalance.remaining + r.massBalance.adjusted + r.massBalance.gap, 1e-9);
  // un archivio senza rettifiche (vecchio demo) mostra lo scarto come «da verificare»
  const r0 = recall(buildIndex({ ...D, adjustments: [] }), { ingLots: [a.ingLotId] });
  close(r0.massBalance.gap, -a.tonnes, 1e-6);
});

/* ---------------- estensori del demo ---------------- */
test('estensori: ordine e semi, e ogni patch aggiunge soltanto (campi nuovi, id nuovi)', () => {
  assert.deepEqual(EXTENDERS.map(e => e[0]), ['costs', 'commerciale', 'acquisti', 'produzione', 'finanza', 'redditivita', 'direzione', 'piattaforma',
    'clima', 'pcf', 'filiera', 'ambiente', 'persone', 'governance', 'rischi', 'piano', 'report']);
  assert.deepEqual(EXTENDERS.map(e => e[2]), [101, 501, 601, 701, 301, 401, 201, 801, 901, 1001, 1101, 1701, 1301, 1401, 1601, 1501, 1201]);
  assert.deepEqual(OVERWRITE_OK, { ingLots: ['supplier'] });
  // ogni estensore sull'archivio cumulativo: nessuna violazione, archivio in ingresso non modificato
  let cur = g;
  for (const [name, fn, off] of EXTENDERS) {
    const before = JSON.stringify(cur);
    const patch = fn(cur, { today, R: rng(16 + off) });
    assert.deepEqual(patchViolations(cur, patch), [], name);
    assert.equal(JSON.stringify(cur), before, name + ' non modifica l’archivio che riceve');
    cur = applyPatch(cur, patch);
  }
  // il risultato coincide con demoData() (a parte signalState ed eventi) e conserva ogni campo originale
  const full = applyDemoExtenders(g, today);
  assert.equal(JSON.stringify({ ...full, events: [] }.shipments), JSON.stringify(D.shipments));
  for (const c of COLLECTIONS) {
    const after = byId(full[c] || []), ok = OVERWRITE_OK[c] || [];
    for (const r of g[c] || []) {
      const x = after[r.id];
      assert.ok(x, `${c}.${r.id} conservato`);
      for (const k of Object.keys(r)) if (!ok.includes(k)) assert.deepEqual(x[k], r[k], `${c}.${r.id}.${k} non cambia`);
    }
  }
  for (const k of Object.keys(g.settings)) if (!['finance', 'logistics', 'ops', 'calendar', 'company', 'targets', 'counters', 'closedThrough', 'visitCost'].includes(k)) assert.deepEqual(full.settings[k], g.settings[k], 'settings.' + k);
  // il demo di oggi porta la struttura dei costi
  assert.equal(D.costCenters.length, 8);
  assert.equal(D.fixedCosts.filter(r => r.kind !== 'budget').length, 192, 'consuntivo: 8 centri × 24 mesi');
  assert.equal(D.fixedCosts.filter(r => r.kind === 'budget').length, 96, 'budget dell’anno: 8 centri × 12 mesi');
  assert.ok(D.products.every(p => Number.isFinite(p.varProcessCost)));
});

test('estensori: le modifiche non consentite vengono rilevate e ignorate', () => {
  const d = { settings: { a: { x: 1 }, b: 2 }, customers: [{ id: 'c1', name: 'Uno' }], ingLots: [{ id: 'l1', supplier: 'Vecchio' }] };
  const bad = { add: { customers: [{ id: 'c1', name: 'Doppio' }, { id: 'c2' }, { id: 'c2' }] }, update: { customers: [{ id: 'c1', name: 'Altro', city: 'Acri' }, { id: 'zz', x: 1 }], ingLots: [{ id: 'l1', supplier: 'Nuovo', supplierId: 's1' }] }, settings: { a: { y: 2 }, c: 3 } };
  const v = patchViolations(d, bad);
  assert.ok(v.some(x => x.includes('id già presente c1')));
  assert.ok(v.some(x => x.includes('id già presente c2')));
  assert.ok(v.some(x => x.includes('«name»')));
  assert.ok(v.some(x => x.includes('id sconosciuto zz')));
  assert.ok(!v.some(x => x.includes('supplier')), 'ingLots.supplier è ammesso');
  const out = applyPatch(d, bad);
  assert.deepEqual(out.customers, [{ id: 'c1', name: 'Uno', city: 'Acri' }, { id: 'c2' }]);
  assert.deepEqual(out.ingLots, [{ id: 'l1', supplier: 'Nuovo', supplierId: 's1' }]);
  assert.deepEqual(out.settings, { a: { x: 1, y: 2 }, b: 2, c: 3 });
  assert.equal(d.customers[0].city, undefined, 'originale intatto');
  // un estensore che si interrompe non ferma il demo
  const warn = console.warn; console.warn = () => {};
  try {
    EXTENDERS.push(['rotto', () => { throw new Error('prova'); }, 999]);
    const r = applyDemoExtenders(g, today);
    assert.equal(r.costCenters.length, 8);
  } finally { EXTENDERS.pop(); console.warn = warn; }
});

test('aggiornamento di un demo salvato dalla versione 2: rettifiche e dati dei pacchetti, record esistenti intatti', () => {
  const old = { ...g, adjustments: [], settings: { ...g.settings, demoVersion: 2 } };
  old.customers = old.customers.map(c => (c.id === 'c-1' ? { ...c, name: 'Cliente rinominato' } : c));
  const up = upgradeDemo(old);
  assert.equal(up.settings.demoVersion, 5);
  assert.equal(up.adjustments.length, 8);
  close(sum(up.adjustments, a => a.tonnes), sum(g.adjustments, a => a.tonnes), 1e-6);
  assert.equal(up.customers.find(c => c.id === 'c-1').name, 'Cliente rinominato', 'modifica dell’utente conservata');
  assert.equal(up.costCenters.length, 8);
  assert.equal(up.shipments, old.shipments, 'raccolte non toccate dagli estensori restano le stesse');
  assert.equal(upgradeDemo(up), up, 'già aggiornato');
  // ogni estensore una sola volta: nessun id ripetuto tra i passi 3 e 4
  for (const c of COLLECTIONS) if (Array.isArray(up[c])) assert.equal(new Set(up[c].map(x => x.id)).size, up[c].length, 'id unici in ' + c);
  // un demo salvato con la versione 3 riceve solo i dati dei pacchetti (passi 4 e 5), senza ripetere i costi fissi
  const v3 = { ...D, settings: { ...D.settings, demoVersion: 3 } };
  const up3 = upgradeDemo(v3);
  assert.equal(up3.settings.demoVersion, 5);
  assert.equal(up3.fixedCosts.length, D.fixedCosts.length, 'costi fissi non duplicati');
  for (const c of COLLECTIONS) if (Array.isArray(up3[c])) assert.equal(new Set(up3[c].map(x => x.id)).size, up3[c].length, 'id unici dopo i passi 4 e 5 in ' + c);
});

/* ---------------- identità dei margini sul demo completo ---------------- */
test('demo completo: Σ mc2 per prodotto = per cliente = per agente = per mese×prodotto = totale', () => {
  const tot = aggregateFacts(ctx.facts, D.salesHistory, P12).total;
  assert.ok(tot.revenue > 15e6 && tot.mc2 > 0);
  close(tot.mc2, tot.revenue - tot.raw - tot.shrink - tot.energy - tot.varConv - tot.pack - tot.logistics - tot.commission, 1e-9, 'mc2');
  for (const keys of [['productId'], ['customerId'], ['agentId'], ['month', 'productId']]) {
    const r = aggregateFacts(ctx.facts, D.salesHistory, P12, keys);
    for (const k of FACT_SUMS) close(sum(r.rows, x => x[k]), tot[k], 1e-9, `${keys} ${k}`);
  }
  // varProcessCost del demo: la trasformazione si divide tra variabile e fissa senza cambiare il costo pieno
  close(tot.varConv + tot.fixConv, sum(ctx.facts.filter(f => f.date >= P12.from && f.date <= P12.to), f => f.tonnes * (D.products.find(p => p.id === f.productId).processCost)), 1e-9);
  assert.ok(tot.fixConv > 0 && tot.varConv > 0);
});

/* ---------------- segnali ---------------- */
test('segnali: prodotti sul demo completo, fornitori eseguiti, un fornitore che si interrompe non ferma gli altri', () => {
  const s = computeSignals(D, today, ctx);
  assert.ok(s.length > 10);
  assert.ok(s.some(x => x.key.startsWith('drift:L2:')), 'regola 9 dal fornitore di produzione');
  assert.ok(s.some(x => x.key.startsWith('cap:')), 'regola 10 dal fornitore di produzione');
  assert.equal(new Set(s.map(x => x.key)).size, s.length, 'chiavi univoche');
  for (const x of s) { assert.ok(['critico', 'attenzione', 'info'].includes(x.severity)); assert.ok(x.title && x.area && x.link); }
  // stesso risultato senza contesto (ricostruito con makeCtx)
  assert.deepEqual(computeSignals(D, today).map(x => x.key), s.map(x => x.key));
  const warn = console.warn; console.warn = () => {};
  try {
    SIGNAL_PROVIDERS.unshift(() => { throw new Error('prova'); });
    SIGNAL_PROVIDERS.push(() => [{ key: 'prova:1', area: 'direzione', roles: ['direzione'], severity: 'info', title: 'Prova', why: '', action: '', impact: 1, link: { area: 'direzione' } }]);
    const s2 = computeSignals(D, today, ctx);
    assert.equal(s2.length, s.length + 1);
    assert.ok(s2.some(x => x.key === 'prova:1' && x.date === today));
  } finally { SIGNAL_PROVIDERS.shift(); SIGNAL_PROVIDERS.pop(); console.warn = warn; }
});

test('segnali corretti: prezzo netto, offerte scadute, clienti fermi, quotazioni future, agente', () => {
  const s = computeSignals(D, today, ctx);
  // #3 prezzo netto a 90 giorni sotto il minimo: i 9 prodotti con sconti oltre il margine
  const low = s.filter(x => x.key.startsWith('margin:')).map(x => D.products.find(p => x.key.startsWith('margin:' + p.id + ':')).code).sort();
  for (const c of ['LT18S', 'LT22', 'VT20', 'OC18', 'SI15', 'OV17', 'BR21', 'CO16', 'EQ12']) assert.ok(low.includes(c), c);
  assert.ok(s.filter(x => x.key.startsWith('margin:')).every(x => x.title.startsWith('Prezzo netto')));
  // #4 nessuna offerta scaduta tra i segnali; agentId presente
  const offers = byId(D.offers);
  const off = s.filter(x => x.key.startsWith('offer:'));
  for (const x of off) { const o = offers[x.link.id]; assert.ok(!(o.validUntil < today), o.code + ' scaduta'); assert.equal(x.agentId, o.agentId); }
  const expired = D.offers.filter(o => ['bozza', 'inviata'].includes(o.status) && o.validUntil < today);
  assert.ok(expired.length >= 1, 'il demo ha offerte aperte scadute');
  // #11 cliente fermo: frequenza dai giorni di consegna distinti, soglia max(30, 3 intervalli), con agente
  const idle = s.filter(x => x.key.startsWith('idle:'));
  assert.ok(idle.length >= 1);
  for (const x of idle) {
    const c = D.customers.find(y => y.id === x.link.id);
    assert.equal(x.agentId, c.agentId);
    const ds = [...new Set(D.shipments.filter(y => y.customerId === c.id).map(y => y.date))].sort();
    const f = ds.length / Math.max(30, daysBetween(ds[0], today));
    assert.ok(daysBetween(ds.at(-1), today) > Math.max(30, 3 / f));
  }
  // quotazioni future ignorate: una quotazione «di domani» +50% non genera segnali
  const fut = { ...D, market: [...D.market, { id: 'q-fut', commodity: 'mais', label: 'Mais nazionale', date: addDays(today, 1), price: 9999, source: 'prova' }] };
  const sf = computeSignals(fut, today, { ...ctx });
  assert.ok(!sf.some(x => x.key.includes(addDays(today, 1))));
  assert.deepEqual(sf.filter(x => x.key.startsWith('mkt:mais')).map(x => x.key), s.filter(x => x.key.startsWith('mkt:mais')).map(x => x.key));
});

/* ---------------- contratti dei pacchetti ---------------- */
// I contratti tra pacchetti: nomi, firme e forme dei risultati. Vale sia con gli stub sia con le implementazioni reali.
const SEV = new Set(['critico', 'attenzione', 'info']);
function isSignalList(x, who) {
  assert.ok(Array.isArray(x), who + ': elenco di segnali');
  for (const s of x) {
    assert.ok(s && typeof s.key === 'string' && s.key, who + ': chiave');
    assert.ok(SEV.has(s.severity), who + ': gravità ' + s.severity);
    assert.ok(typeof s.title === 'string' && s.title && typeof s.area === 'string', who + ': titolo e area');
    assert.ok(Number.isFinite(s.impact ?? 0), who + ': impatto numerico');
  }
}
function isSection(x, who) {
  if (x == null) return;
  assert.ok(typeof x.title === 'string' && x.title, who + ': titolo');
  assert.ok(Array.isArray(x.kpis ?? []), who + ': kpis');
  if (x.table) assert.ok(Array.isArray(x.table.cols) && Array.isArray(x.table.rows), who + ': tabella');
}
const hasKeys = (o, keys, who) => { assert.ok(o && typeof o === 'object', who); for (const k of keys) assert.ok(k in o, who + ': ' + k); };

test('contratti: esportazioni e forme dei risultati dei pacchetti', () => {
  const P = P12, C = null;
  isSignalList(budget.budgetSignals(D, ctx), 'budgetSignals');
  const bt = budget.budgetTotals(D, P); assert.ok(bt === null || typeof bt === 'object');
  const pl = pnl.pnlFor(D, ctx, P); assert.ok(pl === null || Array.isArray(pl.lines), 'pnlFor');
  hasKeys(credit.creditSummary(D, today), ['open', 'overdue', 'overdue30', 'dso', 'dsoContract', 'byCustomer'], 'creditSummary');
  isSignalList(credit.financeSignals(D, ctx), 'financeSignals');
  isSection(credit.financeReportSection(D, ctx, P, C), 'financeReportSection');
  const inv = inventory.inventorySummary(D, ctx, P);
  hasKeys(inv, ['mpFifo', 'fgValue', 'dio', 'excessValue', 'carryingCost'], 'inventorySummary');
  close(inv.mpFifo, 880569, 1 / 880569, 'MP al FIFO');
  assert.ok(inv.fgValue > 400000);
  const ax = inventory.abcXyz(D, ctx, P); assert.ok(ax && typeof ax === 'object' && !Array.isArray(ax));
  const lp = cash.cashLowPoint(D, ctx); assert.ok(lp === null || typeof lp === 'object');
  hasKeys(profitability.customerProfit(D, ctx, P), ['rows', 'hhi', 'top1', 'top5', 'top10', 'n80', 'peakPct'], 'customerProfit');
  const ac = profitability.abcCustomers(D, ctx, P); assert.ok(ac && typeof ac === 'object');
  isSignalList(profitability.profitSignals(D, ctx), 'profitSignals');
  isSection(profitability.profitReportSection(D, ctx, P, C), 'profitReportSection');
  const cs = breakeven.costStructure(D, ctx, P); assert.ok(cs === null || Number.isFinite(cs.cf ?? 0));
  const fa = forecast.forecastAuto([10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18], 3);
  assert.ok(typeof fa.model === 'string' && fa.points.length === 3, 'forecastAuto');
  for (const pt of fa.points) assert.ok(Number.isFinite(pt.value), 'forecastAuto: valori');
  assert.equal(typeof pricing.offerState({ status: 'inviata', validUntil: '2020-01-01' }, today), 'string');
  isSignalList(pricing.commercialSignals(D, ctx), 'commercialSignals');
  isSection(pricing.commercialReportSection(D, ctx, P, C), 'commercialReportSection');
  const ct = commissions.commissionTotals(D, ctx, P); assert.ok(ct && typeof ct === 'object');
  assert.ok(Array.isArray(suppliers.scorecard(D, ctx, P)), 'scorecard');
  isSignalList(suppliers.purchasingSignals(D, ctx), 'purchasingSignals');
  isSection(suppliers.purchasingReportSection(D, ctx, P, C), 'purchasingReportSection');
  const pv = purchaseVariance.ppv(D, ctx, P);
  assert.ok(Number.isFinite(pv.total) && Array.isArray(pv.byIng) && Array.isArray(pv.byMonth), 'ppv');
  hasKeys(oee.oeeSummary(D, ctx, P), ['plant', 'byLine'], 'oeeSummary');
  isSection(oee.opsReportSection(D, ctx, P, C), 'opsReportSection');
  hasKeys(massbalance.shrinkSummary(D, ctx, P), ['shrinkPct', 'unexplainedEur'], 'shrinkSummary');
  assert.ok(Array.isArray(kpis.KPIS), 'KPIS');
  const kv = kpis.kpiValues(D, ctx, P); assert.ok(kv && typeof kv === 'object', 'kpiValues');
  const st = kpis.statusFor(D, 'oee', 0.7); assert.ok(st === null || ['ok', 'warn', 'bad'].includes(st), 'statusFor');
  isSignalList(kpis.kpiSignals(D, ctx), 'kpiSignals');
  isSection(kpis.kpiReportSection(D, ctx, P, C), 'kpiReportSection');
  hasKeys(dataquality.runRules(D, ctx, { scope: 'all' }), ['score', 'byArea', 'rules'], 'runRules');
  isSignalList(dataquality.dqSignals(D, ctx), 'dqSignals');
  isSection(dataquality.dqReportSection(D, ctx, P, C), 'dqReportSection');
  // registri: ordine fisso, ogni sezione è null o ben formata
  assert.deepEqual(SIGNAL_PROVIDERS.map(f => f.name), ['budgetSignals', 'financeSignals', 'profitSignals', 'commercialSignals', 'purchasingSignals', 'productionSignals', 'kpiSignals', 'dqSignals',
    'climaSignals', 'pcfSignals', 'filieraSignals', 'reportSignals', 'personeSignals', 'governanceSignals', 'pianoSignals', 'rischiSignals', 'ambienteSignals', 'agroSignals', 'campSignals']);
  assert.deepEqual(REPORT_SECTIONS.map(r => [r.id, r.order]), [['kpi', 10], ['agro-regolatorio', 35], ['redditivita', 40], ['commerciale', 45], ['finanza', 50], ['acquisti', 60], ['produzione', 70],
    ['esg-sintesi', 80], ['esg-clima', 81], ['esg-impronta', 82], ['esg-filiera', 83], ['esg-ambiente', 84], ['esg-persone', 85], ['esg-governance', 86], ['esg-piano', 87], ['esg-rischi', 88], ['dati', 90]]);
  for (const r of REPORT_SECTIONS) isSection(r.build(D, ctx, P, C), r.id);
  // ogni fornitore di segnali, preso da solo, non rompe e restituisce segnali ben formati
  for (const f of SIGNAL_PROVIDERS) isSignalList(f(D, { today, ...ctx }) || [], f.name);
});

test('productionSignals: deriva energetica della linea pellet 2 e carico oltre la capacità utile', () => {
  const base = oee.productionSignals(D, { today, ...ctx });
  isSignalList(base, 'productionSignals');
  const drift = base.find(x => x.key.startsWith('drift:L2'));
  assert.ok(drift && /energia per tonnellata/.test(drift.title), 'deriva L2');
  const caps = base.filter(x => x.key.startsWith('cap:'));
  assert.ok(caps.length >= 1, 'almeno una settimana oltre la capacità utile');
  // con un fattore di utilizzo più alto la capacità utile cresce: meno settimane oltre il limite
  const loose = oee.productionSignals({ ...D, settings: { ...D.settings, ops: { ...D.settings.ops, utilFactor: 1.5 } } }, { today, ...ctx });
  assert.ok(loose.filter(x => x.key.startsWith('cap:')).length < caps.length);
  assert.ok(loose.some(x => x.key.startsWith('drift:L2')));
});

/* ---------------- operazioni e aree ---------------- */
test('registerRunOps copia i valori stimati (oggetto o null)', () => {
  const p = D.products[0];
  const r = registerRunOps(D, { productId: p.id, lineId: p.lineId, date: today, tonnes: 2, hours: null, kwh: null, estimated: { hours: true, kwh: true, gpl: false } });
  const run = r.ops.find(o => o.coll === 'runs').obj;
  assert.deepEqual(run.estimated, { hours: true, kwh: true, gpl: false });
  const r2 = registerRunOps(D, { productId: p.id, lineId: p.lineId, date: today, tonnes: 2, hours: 1, kwh: 40 });
  assert.equal(r2.ops.find(o => o.coll === 'runs').obj.estimated, null);
});

test('aree: identificativi condivisi dal router, schede e periodo come da specifica, ruoli', async () => {
  assert.deepEqual(AREAS, AREA_IDS);
  assert.deepEqual(AREA_IDS, ['oggi', 'direzione', 'finanza', 'gemello', 'formulazione', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia', 'esg', 'dati']);
  const { AREA_DEFS } = await import('../../src/app/areas.js');
  const { ROLES, ROLE, AREA_META, AGENT_HIDDEN } = await import('../../src/core/roles.js');
  const { NAV } = await import('../../src/app/nav.js');
  assert.deepEqual(AREA_DEFS.map(a => a.id), AREA_IDS);
  const A = Object.fromEntries(AREA_DEFS.map(a => [a.id, a]));
  const tabs = id => A[id].tabs.map(t => t.id);
  assert.deepEqual(tabs('oggi'), ['decisioni', 'cruscotto', 'attivita', 'registro']);
  assert.deepEqual(tabs('direzione'), ['sintesi', 'conto', 'ponte', 'budget', 'costi', 'chiusura', 'report']);
  assert.deepEqual(A.direzione.tabs.map(t => t.label), ['Sintesi', 'Conto economico', 'Scostamenti', 'Budget', 'Costi fissi', 'Chiusura del mese', 'Report CdA']);
  assert.deepEqual(tabs('finanza'), ['crediti', 'cassa', 'circolante', 'rimanenze', 'parametri']);
  assert.deepEqual(tabs('acquisti'), ['fabbisogni', 'scorte', 'ordini', 'fornitori', 'varianze', 'mercati']);
  assert.deepEqual(tabs('produzione'), ['piano', 'registro', 'oee', 'energia', 'manutenzione', 'bilancio']);
  assert.deepEqual(tabs('commerciale'), ['clienti', 'offerte', 'listino', 'visite', 'rete']);
  assert.deepEqual(tabs('economia'), ['margini', 'redditivita', 'pareggio', 'scenari', 'previsioni']);
  assert.deepEqual(tabs('dati'), ['archivio', 'importa', 'anagrafiche', 'qualita', 'registro', 'impostazioni']);
  assert.deepEqual(tabs('formulazione'), ['formule', 'materie', 'specifiche']);
  assert.deepEqual(tabs('qualita'), ['lotti', 'lotti-mp', 'analisi', 'reclami', 'richiamo']);
  assert.ok(!tabs('esg').includes('tesi'), 'fuori dalla versione completa niente scheda «tesi»');
  assert.equal(A.esg.label, 'ESG'); assert.ok(!/tesi/i.test(A.esg.lead));
  const period = Object.fromEntries(AREA_DEFS.map(a => [a.id, a.period]));
  assert.deepEqual(period, { oggi: true, direzione: true, finanza: true, gemello: true, formulazione: false, acquisti: true, produzione: true, qualita: true, commerciale: true, economia: true, esg: false, dati: false });
  assert.equal(A.direzione.label, 'Direzione'); assert.equal(A.finanza.label, 'Finanza');
  assert.equal(NAV.finanza.tabs, A.finanza.tabs); assert.equal(AREA_META.direzione.label, 'Direzione');
  assert.deepEqual(ROLE.direzione.areas, ['oggi', 'direzione', 'finanza', 'economia', 'commerciale', 'acquisti', 'produzione', 'qualita', 'gemello', 'formulazione', 'esg', 'dati']);
  for (const r of ROLES) {
    assert.ok(r.areas.every(a => AREA_IDS.includes(a)), r.id);
    if (r.id === 'agente') { for (const a of AGENT_HIDDEN) assert.ok(!r.areas.includes(a)); continue; }
    assert.deepEqual([...r.areas].sort(), [...AREA_IDS].sort(), r.id + ' vede tutte le aree');
    if (r.id !== 'direzione') assert.deepEqual(r.areas.slice(-3), ['direzione', 'finanza', 'dati'], r.id + ': direzione e finanza in fondo');
  }
  assert.deepEqual(AGENT_HIDDEN, ['direzione', 'finanza', 'economia']);
});
