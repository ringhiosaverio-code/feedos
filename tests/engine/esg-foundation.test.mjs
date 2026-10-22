/* FeedOS 18 · contratti dei nove pacchetti ESG (fondazione 18, 07-contract §1-§7): nomi e tipi delle esportazioni,
 * forme dei risultati su demo, archivio vuoto e archivio di partenza, registrazione negli elenchi condivisi, dati dimostrativi
 * (solo aggiunte, idempotenti, deterministici), campi e testi, regole di dipendenza. Vale con gli stub della fondazione e con
 * le implementazioni reali dei pacchetti: si controllano le forme, non i valori. File del coordinatore: i pacchetti non lo modificano. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoData, starterData, upgradeDemo } from '../../src/data/demo/index.js';
import { generateDemo } from '../../src/data/demo/generator.js';
import { EXTENDERS, ESG18_EXTENDERS, patchViolations, applyPatch, applyDemoExtenders } from '../../src/data/demo/extend.js';
import { emptyData, COLLECTIONS, validateShape } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { resolvePeriod } from '../../src/core/period.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import { ESG_PACKAGES, ESG_KPI_IDS, DATAPOINT_PROVIDERS, CALENDAR_PROVIDERS, METHOD_NOTES, QUALITIES, CALENDAR_KINDS, collectDatapoints, collectCalendar } from '../../src/engine/esg-registry.js';
import { SIGNAL_PROVIDERS, REPORT_SECTIONS } from '../../src/engine/providers.js';
import { KPIS, kpiValue } from '../../src/engine/kpis.js';
import { RULES, DQ_AREAS, runRules } from '../../src/engine/dataquality.js';
import { REPORT_TEMPLATES, TEMPLATE_LABELS, SECTION_TITLES, buildReport } from '../../src/engine/report.js';
import { computeSignals } from '../../src/engine/signals.js';
import { FIELDS, COLL_LABEL } from '../../src/core/fields.js';
import { TYPES } from '../../src/core/importers.js';
import { I18N } from '../../src/data/esg-i18n.js';
import { AREA_IDS } from '../../src/core/areaIds.js';
import { rng } from '../../src/core/util.js';

const today = '2026-10-16';
const D = demoData(today);
const ARCHIVES = [['demo', D], ['vuoto', emptyData()], ['partenza', starterData()]];
const CTX = new Map(ARCHIVES.map(([, d]) => [d, makeCtx(d, today)]));
const P12 = resolvePeriod({ preset: '12m' }, today);
const cap = s => s[0].toUpperCase() + s.slice(1);
const ROLES = ['direzione', 'formulazione', 'acquisti', 'produzione', 'qualita', 'commerciale', 'agente'];
const SEV = ['critico', 'attenzione', 'info'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DP_ID = /^[BC]\d{1,2}\.[A-Za-z0-9][A-Za-z0-9.*_-]*$/;
const ESG_TABS = ['cruscotto', 'clima', 'energia', 'passaporto', 'filiera', 'ambiente', 'acqua', 'rifiuti', 'persone', 'governance', 'piano', 'rischi', 'vsme', 'indicatori', 'questionario'];
const isPlain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const ROOT = new URL('../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const exists = rel => fs.existsSync(new URL(rel, ROOT));

const ENG = {}, DEMO = {}, FLD = {}, TXT = {};
for (const p of ESG_PACKAGES) {
  ENG[p.id] = await import(`../../src/engine/esg-${p.id}.js`);
  DEMO[p.id] = await import(`../../src/data/demo/esg-${p.id}.js`);
  FLD[p.id] = await import(`../../src/data/fields-${p.id}.js`);
  TXT[p.id] = await import(`../../src/data/i18n-${p.id}.js`);
}
// helper tra pacchetti (§4): proprietario → nomi
const HELPERS = { clima: ['factor', 'inventory', 'fgasDue'], pcf: ['ingredientEf', 'pcf', 'packagingFactor'], filiera: ['soyShares', 'refsForShipments'], rischi: ['plantCoords'],
  governance: ['checkClaim', 'evidenceFor'], persone: ['workforce', 'safetyRates'], piano: ['carbonPrice', 'esgThresholds'], report: [], ambiente: [] };

/* ---------------- forme ---------------- */
function isSignal(s, p, who) {
  assert.ok(isPlain(s), who + ': segnale come oggetto');
  assert.ok(typeof s.key === 'string' && s.key.startsWith(p.signal), `${who}: chiave con il prefisso «${p.signal}» (${s.key})`);
  assert.equal(s.area, 'esg', who + ': area esg');
  assert.ok(Array.isArray(s.roles) && s.roles.length && s.roles.every(r => ROLES.includes(r)), who + ': ruoli noti');
  assert.ok(SEV.includes(s.severity), who + ': gravità ' + s.severity);
  assert.ok(typeof s.title === 'string' && s.title.trim(), who + ': titolo');
  assert.ok(typeof s.why === 'string' && typeof s.action === 'string', who + ': why e action');
  assert.ok(Number.isFinite(s.impact), who + ': impatto numerico');
  assert.ok(isPlain(s.link) && AREA_IDS.includes(s.link.area), who + ': collegamento');
  if (s.link.area === 'esg') assert.ok(ESG_TABS.includes(s.link.tab), who + ': scheda ESG esistente ' + s.link.tab);
}
function isSection(x, p, who) {
  if (x == null) return;
  assert.ok(isPlain(x), who + ': sezione come oggetto');
  assert.ok(typeof x.title === 'string' && x.title.trim(), who + ': titolo');
  if (x.id != null) assert.equal(x.id, p.section, who + ': id della sezione');
  if (x.order != null) assert.equal(x.order, p.order, who + ': ordine della sezione');
  assert.ok(Array.isArray(x.kpis ?? []), who + ': kpis');
  for (const k of x.kpis || []) assert.ok(isPlain(k) && k.label != null, who + ': indicatore con etichetta');
  if (x.table != null) assert.ok(Array.isArray(x.table.cols) && Array.isArray(x.table.rows), who + ': tabella');
  if (x.narrative != null) assert.ok(Array.isArray(x.narrative) || typeof x.narrative === 'string', who + ': narrativa');
}
function isDatapoints(o, p, who) {
  assert.ok(isPlain(o), who + ': {dpId: datapoint}');
  for (const [id, dp] of Object.entries(o)) {
    assert.ok(DP_ID.test(id), `${who}: id del datapoint «${id}» (Bn./Cn.)`);
    assert.ok(isPlain(dp) && 'value' in dp, `${who}: ${id} con value`);
    assert.ok('unit' in dp && (dp.unit == null || typeof dp.unit === 'string'), `${who}: ${id} con unit`);
    assert.ok(QUALITIES.includes(dp.quality), `${who}: ${id} qualità ${dp.quality}`);
    assert.ok(typeof dp.source === 'string' && dp.source.startsWith(p.id + '.'), `${who}: ${id} source «${p.id}.…»`);
    if (dp.evidence != null) assert.ok(Array.isArray(dp.evidence), `${who}: ${id} evidence`);
    if (dp.note != null) assert.equal(typeof dp.note, 'string', `${who}: ${id} note`);
    if (dp.method != null) assert.equal(typeof dp.method, 'string', `${who}: ${id} method`);
  }
}
function isCalendar(xs, p, who) {
  assert.ok(Array.isArray(xs), who + ': elenco di scadenze');
  const keys = new Set();
  for (const it of xs) {
    assert.ok(isPlain(it) && typeof it.key === 'string' && it.key, who + ': chiave');
    assert.ok(!keys.has(it.key), who + ': chiave ripetuta ' + it.key); keys.add(it.key);
    assert.ok(typeof it.date === 'string' && ISO.test(it.date), `${who}: data di ${it.key}`);
    assert.ok(typeof it.title === 'string' && it.title.trim(), `${who}: titolo di ${it.key}`);
    assert.equal(it.area, 'esg', `${who}: area di ${it.key}`);
    assert.equal(it.pkg, p.id, `${who}: pacchetto di ${it.key}`);
    assert.ok(CALENDAR_KINDS.includes(it.kind), `${who}: tipo di ${it.key}`);
    assert.ok(isPlain(it.link) && it.link.area === 'esg' && ESG_TABS.includes(it.link.tab), `${who}: collegamento di ${it.key}`);
    if (it.validAsOf != null) assert.ok(ISO.test(it.validAsOf), `${who}: valido al di ${it.key}`);
    for (const k of ['law', 'source', 'owner']) if (it[k] != null) assert.equal(typeof it[k], 'string', `${who}: ${k} di ${it.key}`);
  }
}
function isKpi(k, p, who) {
  assert.ok(isPlain(k) && typeof k.id === 'string', who + ': KPI con id');
  assert.ok(p.kpis.includes(k.id), `${who}: id ${k.id} tra quelli riservati al pacchetto (${p.kpis.join(', ')})`);
  assert.ok(typeof k.label === 'string' && k.label.trim() && typeof k.unit === 'string', `${who}: ${k.id} etichetta e unità`);
  assert.ok(['flow', 'ratio'].includes(k.kind) && ['up', 'down', 'range'].includes(k.dir), `${who}: ${k.id} kind e dir`);
  assert.equal(k.area, 'esg', `${who}: ${k.id} area esg`);
  assert.ok(isPlain(k.link) && k.link.area === 'esg' && ESG_TABS.includes(k.link.tab), `${who}: ${k.id} collegamento a una scheda ESG`);
  assert.ok(typeof k.def === 'string' && k.def.trim(), `${who}: ${k.id} definizione in italiano`);
  assert.ok(k.decimals == null || Number.isInteger(k.decimals), `${who}: ${k.id} decimali`);
  assert.equal(typeof k.compute, 'function', `${who}: ${k.id} compute`);
  assert.ok(COLLECTIONS.includes(k.src) || k.src === 'snapshot', `${who}: ${k.id} src = raccolta con date o month (non «${k.src}»)`);
}
function isRule(r, p, who) {
  assert.ok(isPlain(r) && p.rules.includes(r.id), `${who}: id ${r?.id} tra quelli riservati (${p.rules[0]}-${p.rules.at(-1)})`);
  assert.equal(r.area, 'esg', `${who}: ${r.id} area esg`);
  assert.ok(SEV.includes(r.severity), `${who}: ${r.id} gravità`);
  assert.ok(Number.isFinite(r.weight) && r.weight >= 1 && r.weight <= 10, `${who}: ${r.id} peso 1-10`);
  assert.ok(Array.isArray(r.scope) && r.scope.length && r.scope.every(s => ['all', 'closing', 'import'].includes(s)), `${who}: ${r.id} scope`);
  assert.ok(typeof r.label === 'string' && r.label.trim(), `${who}: ${r.id} etichetta`);
  assert.equal(typeof r.check, 'function', `${who}: ${r.id} check`);
}

/* ---------------- registro dei pacchetti ---------------- */
test('registro: i nove pacchetti della tabella fissa (id, schede, prefissi, sezioni, regole, semi, CSS, KPI, raccolte)', async () => {
  assert.deepEqual(ESG_PACKAGES.map(p => [p.id, p.tab, p.signal, p.section, p.order, p.rules[0], p.rules.at(-1), p.seed, p.css]), [
    ['clima', 'clima', 'clima:', 'esg-clima', 81, 'R21', 'R25', 901, 'ecl-'],
    ['pcf', 'passaporto', 'pcf:', 'esg-impronta', 82, 'R26', 'R29', 1001, 'epc-'],
    ['filiera', 'filiera', 'eudr:', 'esg-filiera', 83, 'R30', 'R34', 1101, 'efl-'],
    ['report', 'vsme', 'report:', 'esg-sintesi', 80, 'R35', 'R37', 1201, 'erp-'],
    ['persone', 'persone', 'persone:', 'esg-persone', 85, 'R38', 'R41', 1301, 'epe-'],
    ['governance', 'governance', 'gov:', 'esg-governance', 86, 'R42', 'R45', 1401, 'ego-'],
    ['piano', 'piano', 'piano:', 'esg-piano', 87, 'R46', 'R48', 1501, 'epi-'],
    ['rischi', 'rischi', 'rischi:', 'esg-rischi', 88, 'R49', 'R51', 1601, 'eri-'],
    ['ambiente', 'ambiente', 'amb:', 'esg-ambiente', 84, 'R52', 'R56', 1701, 'eam-'],
  ]);
  assert.equal(ESG_KPI_IDS.length, 31);
  assert.equal(new Set(ESG_KPI_IDS).size, 31, 'KPI riservati unici');
  assert.ok(ESG_KPI_IDS.every(id => id.startsWith('esg-')));
  // raccolte: le 63 dello schema in coda, ciascuna di un solo pacchetto
  const added = COLLECTIONS.slice(37), owned = ESG_PACKAGES.flatMap(p => p.colls);
  assert.equal(added.length, 63);
  assert.deepEqual([...added].sort(), [...owned].sort());
  assert.equal(new Set(owned).size, 63);
  // schede ESG nell'ordine del percorso (versione pubblica: niente «tesi»)
  const { AREA } = await import('../../src/app/areas.js');
  assert.deepEqual(AREA.esg.tabs.map(t => t.id), ESG_TABS);
  assert.equal(AREA.esg.period, false);
  for (const p of ESG_PACKAGES) assert.ok(ESG_TABS.includes(p.tab), p.id);
  // estensori del demo: ordine e semi del contratto
  assert.deepEqual(ESG18_EXTENDERS, ['clima', 'pcf', 'filiera', 'ambiente', 'persone', 'governance', 'rischi', 'piano', 'report']);
  for (const p of ESG_PACKAGES) assert.deepEqual(EXTENDERS.find(e => e[0] === p.id)?.slice(1), [DEMO[p.id][`demo${cap(p.id)}`], p.seed], 'estensore ' + p.id);
});

test('esportazioni: nomi e tipi fissati del contratto (motore, demo, campi, testi)', () => {
  for (const p of ESG_PACKAGES) {
    const E = ENG[p.id], U = p.id.toUpperCase();
    for (const f of ['Signals', 'ReportSection', 'Datapoints', 'CalendarItems', 'Summary']) {
      assert.equal(typeof E[p.id + f], 'function', `${p.id}${f}`);
      assert.equal(E[p.id + f].name, p.id + f, `${p.id}${f}: funzione con nome`);
    }
    assert.ok(Array.isArray(E[`${U}_KPIS`]), `${U}_KPIS`);
    assert.ok(Array.isArray(E[`${U}_RULES`]), `${U}_RULES`);
    const M = E[`${U}_METHOD`];
    assert.ok(isPlain(M) && typeof M.it === 'string' && M.it.trim() && typeof M.en === 'string' && M.en.trim(), `${U}_METHOD {it, en}`);
    for (const h of HELPERS[p.id]) assert.equal(typeof E[h], 'function', `${p.id}.${h}`);
    assert.equal(typeof DEMO[p.id][`demo${cap(p.id)}`], 'function', `demo${cap(p.id)}`);
    for (const k of ['FIELDS', 'COLL_LABEL', 'IMPORT_TYPES', 'IMPORT_DESC']) assert.ok(isPlain(FLD[p.id][`${k}_${U}`]), `${k}_${U}`);
    assert.ok(isPlain(TXT[p.id][`I18N_${U}`]), `I18N_${U}`);
  }
});

test('registri condivisi: segnali, sezioni, modelli di report, KPI, regole, datapoint, scadenze e note metodologiche', () => {
  for (const p of ESG_PACKAGES) {
    const E = ENG[p.id], U = p.id.toUpperCase();
    assert.ok(SIGNAL_PROVIDERS.includes(E[p.id + 'Signals']), `${p.id}Signals tra i fornitori di segnali`);
    const sec = REPORT_SECTIONS.find(s => s.id === p.section);
    assert.ok(sec && sec.order === p.order && sec.build === E[p.id + 'ReportSection'], `sezione ${p.section}`);
    assert.ok(REPORT_TEMPLATES.esg.includes(p.section) && SECTION_TITLES[p.section], `${p.section} nel Rapporto ESG con il titolo`);
    for (const k of E[`${U}_KPIS`]) assert.ok(KPIS.includes(k), `KPI ${k.id} nel catalogo`);
    for (const r of E[`${U}_RULES`]) assert.ok(RULES.includes(r), `regola ${r.id} nell'elenco`);
    assert.ok(DATAPOINT_PROVIDERS.includes(E[p.id + 'Datapoints']), `${p.id}Datapoints registrato`);
    assert.ok(CALENDAR_PROVIDERS.includes(E[p.id + 'CalendarItems']), `${p.id}CalendarItems registrato`);
    assert.equal(METHOD_NOTES[p.id], E[`${U}_METHOD`], `nota metodologica ${p.id}`);
  }
  assert.deepEqual(REPORT_TEMPLATES.esg, ['esg-sintesi', 'esg-clima', 'esg-impronta', 'esg-filiera', 'esg-ambiente', 'esg-persone', 'esg-governance', 'esg-piano', 'esg-rischi']);
  assert.equal(TEMPLATE_LABELS.esg, 'Rapporto ESG');
  assert.ok(REPORT_TEMPLATES.cda.indexOf('esg-sintesi') > REPORT_TEMPLATES.cda.indexOf('produzione') && REPORT_TEMPLATES.cda.indexOf('esg-sintesi') < REPORT_TEMPLATES.cda.indexOf('dati'));
  assert.equal(DQ_AREAS.esg, 'ESG');
  // id unici in tutto il catalogo e in tutte le regole
  assert.equal(new Set(KPIS.map(k => k.id)).size, KPIS.length, 'id dei KPI unici');
  assert.equal(new Set(RULES.map(r => r.id)).size, RULES.length, 'id delle regole unici');
});

/* ---------------- forme dei risultati ---------------- */
test('segnali, sezioni, KPI, regole, datapoint, scadenze e riepilogo: forme su demo, archivio vuoto e archivio di partenza', () => {
  const allKeys = new Set();
  for (const [name, d] of ARCHIVES) {
    const ctx = CTX.get(d), E8 = currentPeriod(d);
    for (const p of ESG_PACKAGES) {
      const E = ENG[p.id], U = p.id.toUpperCase(), who = `${p.id} (${name})`;
      const sig = E[p.id + 'Signals'](d, { today, ...ctx });
      assert.ok(Array.isArray(sig), who + ': segnali');
      for (const s of sig) { isSignal(s, p, who); if (name === 'demo') { assert.ok(!allKeys.has(s.key), who + ': chiave ripetuta ' + s.key); allKeys.add(s.key); } }
      for (const P of [E8, P12]) {
        isSection(E[p.id + 'ReportSection'](d, ctx, P, null), p, who);
        isSection(E[p.id + 'ReportSection'](d, ctx, P, { ...P12, from: '2024-10-17', to: '2025-10-16' }), p, who + ' con confronto');
        isDatapoints(E[p.id + 'Datapoints'](d, P), p, who);
        const sm = E[p.id + 'Summary'](d, P);
        assert.ok(sm === null || isPlain(sm), who + ': riepilogo null o oggetto');
      }
      isCalendar(E[p.id + 'CalendarItems'](d, today), p, who);
      for (const k of E[`${U}_KPIS`]) {
        isKpi(k, p, who);
        const v = k.compute(d, ctx, P12);
        assert.ok(v === null || Number.isFinite(v), `${who}: ${k.id} null o numero (${v})`);
        const kv = kpiValue(d, ctx, k.id, E8);
        assert.ok(kv === null || Number.isFinite(kv), `${who}: kpiValue ${k.id}`);
      }
      for (const r of E[`${U}_RULES`]) {
        isRule(r, p, who);
        const res = r.check(d, ctx, {});
        assert.ok(isPlain(res) && Number.isFinite(res.base) && res.base >= 0 && Array.isArray(res.fails), `${who}: ${r.id} → {base, fails}`);
        for (const f of res.fails) assert.ok(isPlain(f) && f.id != null && typeof f.coll === 'string' && typeof f.msg === 'string' && isPlain(f.link), `${who}: ${r.id} errore ben formato`);
        if (name === 'demo' && r.severity === 'critico') assert.equal(res.fails.length, 0, `${who}: regola critica ${r.id} senza errori sul demo`);
      }
    }
    // raccolta dal registro: nessun fornitore si interrompe, scadenze ordinate
    const dp = collectDatapoints(d, E8);
    assert.deepEqual(dp.errors, [], `${name}: nessun fornitore di datapoint in errore`);
    const cal = collectCalendar(d, today, { withErrors: true });
    assert.deepEqual(cal.errors, [], `${name}: nessun fornitore di scadenze in errore`);
    for (let i = 1; i < cal.items.length; i++) assert.ok(cal.items[i - 1].date <= cal.items[i].date, `${name}: scadenze in ordine di data`);
    // il demo resta sopra 85 punti di qualità dei dati, senza regole ESG critiche in errore
    if (name === 'demo') {
      const R = runRules(d, ctx, { scope: 'all' });
      assert.ok(R.score >= 85, `punteggio ${R.score}`);
      assert.ok(!R.rules.some(r => r.area === 'esg' && r.severity === 'critico' && r.failCount > 0));
    }
  }
});

test('helper tra pacchetti (§4): risposte compatibili con gli stub su ogni archivio', () => {
  const { clima, pcf, filiera, rischi, governance, persone, piano } = ENG;
  for (const [name, d] of ARCHIVES) {
    const P = currentPeriod(d), who = s => `${s} (${name})`;
    const f = clima.factor(d, 'el.lb.it.2024', 2024);
    assert.ok(f === null || (Number.isFinite(f.value) && typeof f.unit === 'string'), who('factor'));
    assert.equal(clima.factor(d, 'fattore-inesistente', 2024), null, who('factor inesistente'));
    const inv = clima.inventory(d, P); assert.ok(inv === null || isPlain(inv), who('inventory'));
    assert.ok(Array.isArray(clima.fgasDue(d, today)), who('fgasDue'));
    for (const id of [d.ingredients[0]?.id, 'materia-inesistente'].filter(Boolean)) {
      const ef = pcf.ingredientEf(d, id, {});
      assert.ok(isPlain(ef) && 'total' in ef && (ef.total === null || Number.isFinite(ef.total)) && 'dqr' in ef && typeof ef.source === 'string', who('ingredientEf ' + id));
    }
    const pp = pcf.pcf(d, d.products[0]?.id || 'x', {}); assert.ok(pp === null || isPlain(pp), who('pcf'));
    const pk = pcf.packagingFactor('carta'); assert.ok(pk === null || Number.isFinite(pk), who('packagingFactor'));
    const ss = filiera.soyShares(d, P); assert.ok(ss === null || isPlain(ss), who('soyShares'));
    assert.ok(Array.isArray(filiera.refsForShipments(d, (d.shipments || []).slice(0, 3).map(s => s.id))), who('refsForShipments'));
    const pc = rischi.plantCoords(d); assert.ok(pc === null || (Number.isFinite(pc.lat) && Number.isFinite(pc.lon)), who('plantCoords'));
    const cc = governance.checkClaim('Mangime prodotto con energia del nostro impianto fotovoltaico', {});
    assert.ok(isPlain(cc) && typeof cc.ok === 'boolean' && Array.isArray(cc.findings), who('checkClaim'));
    assert.ok(Array.isArray(governance.evidenceFor(d, 'shipments', 'x')), who('evidenceFor'));
    const wf = persone.workforce(d, P.key); assert.ok(wf === null || isPlain(wf), who('workforce'));
    const sr = persone.safetyRates(d, P); assert.ok(sr === null || isPlain(sr), who('safetyRates'));
    assert.ok(Number.isFinite(piano.carbonPrice(d)) && piano.carbonPrice(d) > 0, who('carbonPrice'));
    const th = piano.esgThresholds(d);
    for (const k of ['pvShare', 'recovery', 'trainingH', 'waterDrift']) assert.ok(Number.isFinite(th[k]), who('esgThresholds.' + k));
  }
  // le impostazioni dell'utente prevalgono sui valori di base
  const x = { ...D, settings: { ...D.settings, esg18: { ...(D.settings.esg18 || {}), piano: { ...(D.settings.esg18?.piano || {}), carbonPrice: 123, targets: { recovery: 0.6 } } } } };
  assert.equal(piano.carbonPrice(x), 123);
  assert.equal(piano.esgThresholds(x).recovery, 0.6);
  // una dichiarazione vietata non deve mai passare con il controllo reale; lo stub la ammette
  const cn = governance.checkClaim('mangime carbon neutral', {});
  assert.equal(typeof cn.ok, 'boolean');
});

/* ---------------- dati dimostrativi ---------------- */
test('dati dimostrativi: estensori deterministici, idempotenti, solo aggiunte, impostazioni solo in settings.esg18.<pkg>', () => {
  const g = generateDemo({ today });
  let cur = g;
  for (const [name, fn, off] of EXTENDERS) {
    const p = ESG_PACKAGES.find(x => x.id === name);
    const patch = fn(cur, { today, R: rng(16 + off) });
    if (p) {
      assert.ok(isPlain(patch), name + ': patch come oggetto');
      assert.ok(Object.keys(patch).every(k => ['add', 'update', 'settings'].includes(k)), name + ': solo add, update, settings');
      if (patch.settings != null) {
        assert.deepEqual(Object.keys(patch.settings), ['esg18'], name + ': impostazioni solo in settings.esg18');
        assert.deepEqual(Object.keys(patch.settings.esg18), [name], name + ': impostazioni solo in settings.esg18.' + name);
      }
      assert.deepEqual(patchViolations(cur, patch), [], name + ': solo aggiunte');
      assert.equal(JSON.stringify(fn(cur, { today, R: rng(16 + off) })), JSON.stringify(patch), name + ': deterministico');
    }
    cur = applyPatch(cur, patch);
  }
  assert.ok(validateShape(D).ok, validateShape(D).errors.join('; '));
  for (const p of ESG_PACKAGES) {
    // idempotente: sul demo completo non aggiunge nulla di già presente né riscrive campi
    const again = DEMO[p.id][`demo${cap(p.id)}`](D, { today, R: rng(16 + p.seed) });
    assert.deepEqual(patchViolations(D, again), [], p.id + ': idempotente sul demo completo');
    for (const c of p.colls) assert.equal(new Set(D[c].map(r => r.id)).size, D[c].length, `${p.id}: id unici in ${c}`);
  }
});

test('aggiornamento di un demo salvato con la versione 4: il passo 5 aggiunge i dati ESG una volta sola, senza avvisi', () => {
  const core = EXTENDERS.map(e => e[0]).filter(n => !ESG18_EXTENDERS.includes(n));
  const g = generateDemo({ today });
  const v4 = applyDemoExtenders({ ...g, settings: { ...g.settings, demoVersion: 4 } }, today, 16, { only: core });
  const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
  let up;
  try { up = upgradeDemo(v4); } finally { console.warn = warn; }
  assert.deepEqual(seen, [], 'nessun avviso durante l’aggiornamento');
  assert.equal(up.settings.demoVersion, 5);
  for (const p of ESG_PACKAGES) for (const c of p.colls) assert.equal(JSON.stringify(up[c]), JSON.stringify(D[c]), `${p.id}: ${c} come nel demo nuovo`);
  assert.deepEqual(up.settings.esg18 ?? null, D.settings.esg18 ?? null, 'settings.esg18 come nel demo nuovo');
  for (const c of COLLECTIONS) if (Array.isArray(up[c])) assert.equal(new Set(up[c].map(x => x.id)).size, up[c].length, 'id unici in ' + c);
  assert.equal(upgradeDemo(up), up, 'già aggiornato');
});

/* ---------------- report e segnali completi ---------------- */
test('report: Rapporto ESG e CdA con la sintesi ESG si costruiscono senza sezioni in errore', () => {
  const ctx = CTX.get(D);
  const C = { ...P12, from: '2024-10-17', to: '2025-10-16' };
  for (const tpl of ['esg', 'cda']) {
    const r = buildReport(D, ctx, P12, C, tpl);
    assert.deepEqual(r.header.failed, [], tpl + ': nessuna sezione in errore');
    const ids = r.sections.map(s => s.id);
    assert.deepEqual(ids, REPORT_TEMPLATES[tpl].filter(id => ids.includes(id)), tpl + ': ordine del modello');
  }
  for (const [, d] of ARCHIVES) assert.deepEqual(buildReport(d, CTX.get(d), P12, null, 'esg').header.failed, []);
  // i segnali completi restano univoci con i fornitori ESG
  const s = computeSignals(D, today, ctx);
  assert.equal(new Set(s.map(x => x.key)).size, s.length);
});

/* ---------------- file dei pacchetti ---------------- */
test('file dei pacchetti: pagine, riquadri, sezioni delle schede, stile, test e percorsi del collaudo', () => {
  for (const p of ESG_PACKAGES) {
    const P = cap(p.id);
    for (const f of [`src/engine/esg-${p.id}.js`, `src/modules/esg-${p.id}.jsx`, `src/data/demo/esg-${p.id}.js`, `src/data/fields-${p.id}.js`, `src/data/i18n-${p.id}.js`,
      `src/styles/esg-${p.id}.css`, `tests/engine/esg-${p.id}.test.mjs`, `tests/e2e/routes-${p.id}.txt`]) assert.ok(exists(f), f);
    const ui = read(`src/modules/esg-${p.id}.jsx`);
    assert.match(ui, new RegExp(`export function ${P}Page\\s*\\(`), `${P}Page`);
    assert.match(ui, new RegExp(`export function ${P}Card\\s*\\(`), `${P}Card`);
    for (const line of read(`tests/e2e/routes-${p.id}.txt`).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
      assert.match(line, /^esg(\.[A-Za-z0-9_-]+){1,2}(\.[A-Za-z0-9_.-]+)?$/, `${p.id}: percorso ${line}`);
      assert.ok(ESG_TABS.includes(line.split('.')[1]), `${p.id}: scheda del percorso ${line}`);
    }
  }
  assert.match(read('src/modules/esg-pcf.jsx'), /export function CustomerEsg\s*\(/);
  assert.match(read('src/modules/esg-pcf.jsx'), /export function ProductPcf\s*\(/);
  assert.match(read('src/modules/esg-filiera.jsx'), /export function SupplierEsg\s*\(/);
  assert.match(read('src/modules/esg-pcf.jsx'), /id="esg-passport"/, 'il passaporto conserva #esg-passport');
  assert.match(read('src/modules/esg-report.jsx'), /id="esg-vsme"/, 'il VSME conserva #esg-vsme');
  const pages = read('src/modules/esg-pages.jsx');
  for (const p of ESG_PACKAGES) assert.match(pages, new RegExp(`${p.tab}: ${cap(p.id)}Page`), 'ESG_PAGES.' + p.tab);
  const cards = read('src/modules/esg-slots.jsx');
  assert.match(cards, new RegExp(`ESG_DASHBOARD_CARDS = \\[${ESG_PACKAGES.map(p => cap(p.id) + 'Card').join(', ')}\\]`), 'riquadri nell’ordine dei pacchetti');
});

test('regole di dipendenza: i motori dei pacchetti non importano i registri, l’interfaccia o i dati riservati', () => {
  const FORBIDDEN = /from\s+['"](\.\/(kpis|dataquality|providers|signals|report|esg-registry)\.js|\.\.\/core\/(derived|store)\.js|\.\.\/data\/thesis\.js|[^'"]*\.jsx|react[^'"]*)['"]/;
  const files = fs.readdirSync(new URL('src/engine/', ROOT)).filter(f => ESG_PACKAGES.some(p => f === `esg-${p.id}.js` || f.startsWith(`esg-${p.id}-`)));
  assert.ok(files.length >= 9);
  for (const f of files) {
    const src = read('src/engine/' + f);
    const bad = src.split('\n').filter(l => /^\s*import\b/.test(l) && FORBIDDEN.test(l));
    assert.deepEqual(bad, [], `${f}: import non ammessi (i registri importano i pacchetti, non il contrario)`);
    assert.ok(!/\bMath\.random\s*\(|\bDate\.now\s*\(|new Date\(\s*\)/.test(src), `${f}: niente orologio né caso (usare ctx.today, appToday o rng)`);
    assert.ok(!/console\.(log|warn|error|info)\s*\(/.test(src), `${f}: niente console`);
  }
  for (const p of ESG_PACKAGES) {
    const src = read(`src/data/demo/esg-${p.id}.js`);
    assert.ok(!/\bMath\.random\s*\(|\bDate\.now\s*\(|new Date\(\s*\)/.test(src), `demo ${p.id}: deterministico`);
    for (const f of [`src/data/fields-${p.id}.js`, `src/data/i18n-${p.id}.js`]) assert.ok(!/^\s*import\b/m.test(read(f)), `${f}: senza dipendenze`);
    // nessun riferimento alla tesi nei testi dei pacchetti
    for (const f of [`src/engine/esg-${p.id}.js`, `src/modules/esg-${p.id}.jsx`, `src/data/demo/esg-${p.id}.js`, `src/data/i18n-${p.id}.js`]) assert.ok(!/\btesi\b/i.test(read(f)), `${f}: niente «tesi»`);
  }
});

/* ---------------- campi e testi ---------------- */
test('campi, importazioni e testi dei pacchetti: forme e registrazione', () => {
  const TYPES_OK = ['text', 'number', 'date', 'month', 'enum', 'ref', 'bool'];
  for (const p of ESG_PACKAGES) {
    const U = p.id.toUpperCase(), F = FLD[p.id];
    for (const [coll, defs] of Object.entries(F[`FIELDS_${U}`])) {
      assert.ok(p.colls.includes(coll), `${p.id}: campi di una raccolta propria (${coll})`);
      assert.ok(Array.isArray(defs) && defs.length, `${p.id}: campi di ${coll}`);
      for (const f of defs) assert.ok(typeof f.key === 'string' && typeof f.label === 'string' && TYPES_OK.includes(f.type), `${p.id}: campo ${coll}.${f.key}`);
      assert.equal(FIELDS[coll], defs, `${p.id}: ${coll} nei campi di base`);
    }
    for (const [coll, label] of Object.entries(F[`COLL_LABEL_${U}`])) {
      assert.ok(p.colls.includes(coll) && typeof label === 'string' && label.trim(), `${p.id}: nome di ${coll}`);
      assert.equal(COLL_LABEL[coll], label);
    }
    for (const [id, t] of Object.entries(F[`IMPORT_TYPES_${U}`])) {
      assert.ok(p.colls.includes(t.coll), `${p.id}: importazione ${id} in una raccolta propria`);
      assert.ok(typeof t.label === 'string' && (Array.isArray(t.key) || typeof t.key === 'string') && isPlain(t.synonyms), `${p.id}: tipo ${id}`);
      assert.equal(TYPES[id], t, `${p.id}: ${id} tra i tipi importabili`);
      assert.equal(typeof F[`IMPORT_DESC_${U}`][id], 'string', `${p.id}: descrizione di ${id}`);
    }
    for (const [k, v] of Object.entries(TXT[p.id][`I18N_${U}`])) {
      assert.ok(k.startsWith(p.id + '.'), `${p.id}: chiave ${k} con il prefisso del pacchetto`);
      assert.ok(isPlain(v) && typeof v.it === 'string' && typeof v.en === 'string', `${p.id}: ${k} in italiano e inglese`);
      assert.equal(I18N[k], v);
    }
  }
});
