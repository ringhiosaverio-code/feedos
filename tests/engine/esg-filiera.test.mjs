/* FeedOS 18 · EUDR e fornitori (pacchetto WP3 «filiera»): ruolo, rischio paese, tre indicatori, punteggio di rischio, GeoJSON,
 * registro DCF, quote della soia, lettera ai clienti dalla tracciabilità, moduli autonomi con impronta SHA-256, importazioni, archivi vuoti, demo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { sha256HexSync, canonicalJson } from '../../src/core/hash.js';
import { rng } from '../../src/core/util.js';
import { patchViolations } from '../../src/data/demo/extend.js';
import { preview, toOps, autoMap } from '../../src/core/importers.js';
import { currentPeriod, previousPeriod } from '../../src/engine/esg-years.js';
import { buildIndex } from '../../src/engine/trace.js';
import * as E from '../../src/engine/esg-filiera.js';
import * as G from '../../src/engine/esg-filiera-geo.js';
import * as F from '../../src/engine/esg-filiera-forms.js';
import { demoFiliera } from '../../src/data/demo/esg-filiera.js';

const today = '2026-10-16';
const D = demoData(today);
const ctx = makeCtx(D, today);
const P = currentPeriod(D);
const M = 6371008.8 * Math.PI / 180;
const square = (lat, lon, side) => { const dLat = side / M, dLon = side / (M * Math.cos(lat * Math.PI / 180)); return [[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]].map(p => p.map(x => Math.round(x * 1e7) / 1e7)); };
const fc = (...features) => JSON.stringify({ type: 'FeatureCollection', features: features.map(([geometry, properties = {}]) => ({ type: 'Feature', properties, geometry })) });

test('ruolo EUDR: albero decisionale, obblighi e data di applicazione per dimensione', () => {
  assert.equal(E.eudrRole({ imports: 'abituale' }).role, 'operatore');
  assert.equal(E.eudrRole({ imports: 'mai', resellsAsSuch: true, firstDownstream: true }).role, 'primo-a-valle');
  assert.equal(E.eudrRole({ imports: 'mai', resellsAsSuch: true, firstDownstream: false }).role, 'commerciante');
  const fa = E.eudrRole({ imports: 'mai', resellsAsSuch: false });
  assert.equal(fa.role, 'fuori-ambito');
  assert.equal(fa.refsRequired, false);
  assert.equal(fa.applicableFrom, '2026-12-30');
  assert.ok(fa.duties.some(x => /2309/.test(x.text)), 'il trasformatore sa che il mangime NC 2309 è fuori dall’allegato I');
  const occ = E.eudrRole({ imports: 'occasionale' }, { size: 'micro-piccola' });
  assert.equal(occ.role, 'fuori-ambito');
  assert.equal(occ.alsoOperator, true);
  assert.equal(occ.legal, true);
  assert.equal(occ.applicableFrom, '2027-06-30');
  assert.ok(occ.duties.some(x => /importati direttamente/.test(x.text) && /DDS/.test(x.text)));
  assert.ok(E.eudrRole({ imports: 'abituale' }).duties.some(x => /5 anni/.test(x.text)));
  // ruolo confermato del demo e proposta
  const cr = E.companyRole(D);
  assert.equal(cr.role, 'fuori-ambito');
  assert.equal(cr.confirmed, true);
  assert.equal(cr.alsoOperator, true);
});

test('rischio paese per paese e per data (Reg. di esecuzione 2025/1093, prima tutti standard)', () => {
  assert.equal(E.countryRisk(D, 'BR', '2026-03-01').tier, 'standard');
  assert.equal(E.countryRisk(D, 'US', '2026-03-01').tier, 'basso');
  assert.equal(E.countryRisk(D, 'US', '2025-01-10').tier, 'standard', 'prima della classificazione tutti standard');
  assert.equal(E.countryRisk(D, 'RU', '2026-03-01').tier, 'alto');
  assert.equal(E.countryRisk(D, 'IT', '2026-03-01').tier, 'basso');
  assert.equal(E.countryRisk(D, 'XK', '2026-03-01').tier, 'standard', 'paese non elencato → standard');
  assert.equal(E.countryRisk(D, 'Brasile', '2026-03-01').country, 'BR');
  assert.equal(E.countryRisk(D, 'United States', '2026-03-01').tier, 'basso');
  assert.equal(E.countryRisk(D, '', '2026-03-01').tier, null);
  assert.ok(E.countryRisk(D, 'RU', '2026-03-01').source.includes('2025/1093'));
});

test('tre indicatori separati: EUDR sì ma non DCF, DCF solo in bilancio di massa, operatore con geolocalizzazione', () => {
  const soy = { inScope: true, commodity: 'soia' };
  const a = E.lotStatus({ ddsRef: '26ITABCDEF1234', country: 'BR', riskTier: 'standard', scheme: 'nessuno', coc: 'nessuno' }, soy, 'primo-a-valle', today);
  assert.equal(a.eudrOk, true); assert.equal(a.dcf, false); assert.equal(a.dcfMB, false); assert.equal(a.ssg, false);
  const mb = E.lotStatus({ ddsRef: '26ITABCDEF1234', country: 'BR', riskTier: 'standard', scheme: 'RTRS', coc: 'bilancio-di-massa', cutoff: '2016-06-01', conversionFree: true, ssgBenchmark: '2023' }, soy, 'primo-a-valle', today);
  assert.equal(mb.dcf, false, 'il bilancio di massa non è DCF fisica');
  assert.equal(mb.dcfMB, true); assert.equal(mb.ssg, true); assert.equal(mb.eudrOk, true);
  const seg = E.lotStatus({ country: 'BR', riskTier: 'standard', coc: 'segregato', cutoff: '2008-01-01', conversionFree: true }, soy, 'fuori-ambito', today);
  assert.equal(seg.dcf, true); assert.equal(seg.eudrOk, true, 'fuori ambito: il riferimento non è un obbligo');
  assert.equal(seg.state, 'incompleto', 'senza riferimento il lotto resta incompleto per i clienti');
  const late = E.lotStatus({ country: 'BR', coc: 'segregato', cutoff: '2021-06-01', conversionFree: true }, soy, 'fuori-ambito', today);
  assert.equal(late.dcf, false, 'data limite dopo il 31/12/2020');
  const op = E.lotStatus({ directImport: true, ddsRef: '26ITABCDEF1234', country: 'BR', riskTier: 'standard' }, soy, 'fuori-ambito', today);
  assert.equal(op.effRole, 'operatore'); assert.equal(op.eudrOk, false, 'operatore senza geolocalizzazione');
  assert.equal(E.lotStatus({ directImport: true, ddsRef: '26ITABCDEF1234', country: 'BR', geoValid: true }, soy, 'fuori-ambito', today).eudrOk, true);
  const hi = E.lotStatus({ ddsRef: '26ITABCDEF1234', country: 'RU', riskTier: 'alto' }, soy, 'primo-a-valle', today);
  assert.equal(hi.eudrOk, false);
  assert.equal(E.lotStatus({ ddsRef: '26ITABCDEF1234', country: 'RU', riskTier: 'alto', mitigation: 'audit in loco' }, soy, 'primo-a-valle', today).eudrOk, true);
  assert.equal(E.lotStatus({ certExpiry: '2026-01-01', receivedAt: '2026-02-01' }, soy, 'fuori-ambito', today).certValid, false);
});

test('punteggio di rischio interno: componenti, fasce e pesi modificabili', () => {
  const r = E.riskScore({ country: 'BR', riskTier: 'standard', ddsRef: '26ITABCDEF1234', scheme: 'nessuno', coc: 'nessuno' });
  assert.equal(r.score, 70); assert.equal(r.band, 'medio');
  assert.deepEqual(r.components.map(c => c.key), ['country', 'commodity', 'coc', 'cert', 'missing']);
  assert.equal(r.components.reduce((s, c) => s + c.points, 0), 70);
  const ok = E.riskScore({ country: 'IT', riskTier: 'basso', ddsRef: '26ITABCDEF1234', scheme: 'Europe Soya', coc: 'IP', ssgBenchmark: '2023' });
  assert.equal(ok.score, 20); assert.equal(ok.band, 'trascurabile');
  const worst = E.riskScore({});
  assert.equal(worst.score, 100); assert.equal(worst.band, 'alto');
  assert.ok(worst.components.find(c => c.key === 'missing').why.includes('paese'));
  assert.match(worst.label, /non sostituisce/);
  // pesi diversi: il punteggio resta su 100
  assert.equal(E.riskScore({}, { weights: { country: 80, commodity: 0, coc: 0, cert: 0, missing: 20 } }).score, 100);
  assert.equal(E.riskScore({ riskTier: 'basso', country: 'IT', ddsRef: 'x', scheme: 'a', coc: 'IP' }, { weights: { country: 100, commodity: 0, coc: 0, cert: 0, missing: 0 } }).score, 0);
});

test('GeoJSON: anello chiuso, auto-intersezione, quadrato di 1 km ≈ 100 ha (±1%), regola del punto, doppioni, decimali', () => {
  const sq = square(45.1, 9.2, 1000);
  const v = G.validateGeoJSON(fc([{ type: 'Polygon', coordinates: [sq] }]));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  assert.ok(Math.abs(v.features[0].areaHa - 100) / 100 < 0.01, `area ${v.features[0].areaHa}`);
  const open = G.validateGeoJSON(fc([{ type: 'Polygon', coordinates: [sq.slice(0, 4)] }]));
  assert.equal(open.ok, false); assert.ok(open.issues.some(x => /non chiuso/.test(x.msg)));
  const bow = [[9, 45], [9.01, 45.01], [9.01, 45], [9, 45.01], [9, 45]].map(p => p.map(x => +x.toFixed(6)));
  const bt = G.validateGeoJSON(fc([{ type: 'Polygon', coordinates: [bow] }]));
  assert.equal(bt.ok, false); assert.ok(bt.issues.some(x => /interseca/.test(x.msg)));
  const big = G.validateGeoJSON(fc([{ type: 'Point', coordinates: [9.123456, 45.123456] }, { Area: 5 }]));
  assert.equal(big.ok, false, 'punto con 5 ha dichiarati'); assert.ok(big.issues.some(x => /poligono/.test(x.msg)));
  const small = G.validateGeoJSON(fc([{ type: 'Point', coordinates: [9.123456, 45.123456] }, { Area: 2.5 }]));
  assert.equal(small.ok, true); assert.equal(small.features[0].areaHa, 2.5);
  const dup = G.validateGeoJSON(fc([{ type: 'Polygon', coordinates: [sq] }], [{ type: 'Polygon', coordinates: [sq] }]));
  assert.equal(dup.ok, false); assert.ok(dup.issues.some(x => /uguale all’appezzamento 1/.test(x.msg)));
  const coarse = G.validateGeoJSON(fc([{ type: 'Point', coordinates: [9.12, 45.12] }, { Area: 1 }]));
  assert.ok(coarse.ok && coarse.issues.some(x => x.level === 'avviso' && /decimali/.test(x.msg)));
  assert.equal(G.validateGeoJSON('{"type":"Feature"}').ok, false);
  assert.equal(G.validateGeoJSON('non è json').ok, false);
  const swapped = G.validateGeoJSON(fc([{ type: 'Point', coordinates: [45.123456, 120.123456] }, { Area: 1 }]));
  assert.ok(swapped.issues.some(x => /invertite/.test(x.msg)));
  // limite dei vertici della prova delle intersezioni
  assert.equal(G.validateGeoJSON(fc([{ type: 'Polygon', coordinates: [sq] }]), { maxVertices: 3 }).intersectionsChecked, false);
  // mappa senza sfondo, un solo riferimento esterno ammesso: lo spazio dei nomi SVG
  const m = G.plotMapModel(v.features, { width: 400, height: 240 });
  assert.equal(m.shapes.length, 1); assert.ok(m.scale.px > 10 && /m|km/.test(m.scale.label));
  const svg = G.plotMapSvg(v.features);
  assert.ok(svg.startsWith('<svg') && svg.includes('var(--accent'));
  assert.equal((svg.match(/https?:/g) || []).length, 1);
});

test('registro della soia DCF: saldo, allarme quando va in negativo, lettera senza frase DCF', () => {
  const b = E.dcfBalance(D);
  assert.ok(b.n > 5 && b.balance > 0 && !b.negative && b.firstNegativeAt === null, 'mai negativo nel demo');
  assert.ok(E.dcfClaimCheck(D).ok);
  const neg = { ...D, dcfLedger: [...D.dcfLedger, { id: 'x-out', date: '2026-10-10', kind: 'uscita', tSoy: b.balance + 50, scheme: 'ProTerra' }] };
  const nb = E.dcfBalance(neg);
  assert.equal(nb.negative, true); assert.equal(nb.negativeSince, '2026-10-10');
  assert.equal(E.dcfClaimCheck(neg).ok, false);
  const sig = E.filieraSignals(neg, { ...ctx, today }).find(s => s.key === 'eudr:dcf-negative:2026-10-10');
  assert.ok(sig && sig.severity === 'critico' && sig.roles.includes('commerciale'));
  // la lettera del cliente con soia DCF non dichiara il DCF quando il registro è negativo
  const cust = D.shipments.find(s => (D.lots.find(l => l.id === s.lotId)?.comp || []).some(c => c.ing === 'soiadf') && s.date >= P.from && s.date <= P.to).customerId;
  const ok = E.customerEudrLetter(D, cust, P.key, 'it'), blocked = E.customerEudrLetter(neg, cust, P.key, 'it');
  assert.ok(ok.dcf.t > 0 && ok.paragraphs.some(p => /senza deforestazione/.test(p)));
  assert.ok(!blocked.paragraphs.some(p => /senza deforestazione e senza conversione/.test(p)));
  assert.ok(blocked.warnings.some(w => /bloccate/.test(w)));
});

test('quote della soia: olio contato a parte, consumo e acquisti, classificazione al posto della ricerca di «soia»', () => {
  const s = E.soyShares(D, P);
  assert.equal(s.basis, 'consumo');
  assert.ok(s.oilT > 0, 'olio di soia separato');
  assert.ok(!s.consumption.byItem.some(x => x.ingId === 'olio') && !s.purchase.byItem.some(x => x.ingId === 'olio'));
  assert.ok(s.oil.purchase.byItem.every(x => x.ingId === 'olio'));
  for (const k of ['dcf', 'dcfMB', 'ssg', 'dds', 'highRisk', 'creditsShare']) assert.ok(s[k] >= 0 && s[k] <= 1, k);
  assert.ok(s.dds > 0.85 && s.dds < 0.97, `quota con DDS ${s.dds}`);
  assert.ok(s.soyPerTFeed > 50 && s.soyPerTFeed < 300);
  const br = s.purchase.origins.find(o => o.country === 'BR').share, ar = s.purchase.origins.find(o => o.country === 'AR').share;
  assert.ok(br > 0.48 && br < 0.62 && ar > 0.18 && ar < 0.32, `origini BR ${br} AR ${ar}`);
  assert.ok(Math.abs(s.credits.t - (1000 * 92 / 365 + 1200 * 273 / 365)) < 2, 'crediti pro quota dei giorni');
  // suggerimenti dal nome
  const sug = name => E.suggestClassification(D, { name });
  assert.equal(sug('Olio di soia raffinato').hs, '1507');
  assert.equal(sug('Farina di estrazione di soia 44%').hs, '2304 00');
  assert.equal(sug('Soia integrale tostata').hs, '1201 90');
  assert.equal(sug('Panello di palmisto').hs, '2306 60');
  assert.equal(sug('Lecitina di soia').inScope, false);
  assert.equal(sug('Mais granella'), null);
  assert.equal(E.isOilItem({ hs: '1507 90' }), true);
});

test('riferimenti per le consegne e lettera al cliente: solo lotti tracciati, IT/EN, avvertenza e bozza da verificare', () => {
  const cust = 'c-r5';
  const ships = D.shipments.filter(s => s.customerId === cust && s.date >= P.from && s.date <= P.to);
  const ix = buildIndex(D);
  const traced = new Set(ships.flatMap(s => (ix.lotById.get(s.lotId)?.comp || []).map(c => c.l)));
  const refs = E.refsForShipments(D, ships.map(s => s.id));
  assert.ok(refs.length > 0);
  for (const r of refs) { assert.ok(traced.has(r.ingLotId), r.ingLotId); assert.ok(r.shipmentIds.every(id => ships.some(s => s.id === id))); }
  const L = E.customerEudrLetter(D, cust, P.key, 'it');
  assert.deepEqual(new Set(L.rows.map(r => r.ingLotId)), new Set(refs.map(r => r.ingLotId)));
  assert.ok(L.paragraphs.some(p => p.includes('NC 2309')));
  assert.equal(L.disclaimer, 'FeedOS organizza dati e calcoli; non sostituisce consulenza legale, fiscale o la verifica di un ente terzo.');
  assert.match(L.draftNote, /consulente legale/);
  assert.ok(L.text.includes(L.disclaimer) && L.markdown.includes('| '));
  assert.ok(!/conforme EUDR/i.test(L.text), 'mai «mangime conforme EUDR»');
  assert.ok(L.rows.filter(r => r.missing).every(r => r.ref === 'in acquisizione'));
  const en = E.customerEudrLetter(D, cust, P.key, 'en');
  assert.ok(en.paragraphs.some(p => p.includes('CN 2309')) && /legal adviser/.test(en.draftNote));
  assert.equal(E.customerEudrLetter(D, 'cliente-inesistente', P.key), null);
  assert.deepEqual(E.refsForShipments(D, []), []);
});

test('modulo per il fornitore: HTML autonomo senza indirizzi esterni, testi protetti, impronta del modulo stabile', () => {
  for (const kind of ['eudr', 'esg', 'pcf', 'certificati']) {
    const req = { id: 'rq-t-' + kind, supplierId: 'sup-trader-proteici', kind, lang: kind === 'pcf' ? 'en' : 'it', sentAt: '2026-10-10', dueAt: '2026-10-24', lots: ['il-1000', 'il-1011'] };
    const html = F.supplierForm(F.requestPayload(D, req));
    assert.ok(html.startsWith('<!doctype html>') && html.includes('</html>'));
    assert.ok(!/https?:/i.test(html), kind + ': nessun http');
    assert.ok(!/\ssrc\s*=/i.test(html), kind + ': nessun src=');
    assert.ok(!/<[^>]+\shref\s*=/i.test(html) && !/href=/.test(html), kind + ': nessun href=');
    assert.ok(!/@import|url\(/i.test(html.match(/<style>([\s\S]*?)<\/style>/)[1]), kind + ': nessuna risorsa esterna nello stile');
    assert.ok(html.includes('fo-save') && html.includes('fsha256'));
  }
  const p = F.requestPayload(D, { id: 'rq-x', supplierId: 'sup-trader-proteici', kind: 'eudr', lots: ['il-1000'] });
  assert.equal(p.lots.length, 1); assert.equal(p.lots[0].prefill.country != null, true);
  assert.equal(F.formHash(p), F.formHash(JSON.parse(JSON.stringify(p))));
  const evil = { ...D, suppliers: D.suppliers.map(s => (s.id === 'sup-trader-proteici' ? { ...s, name: '</script><img src=x onerror=alert(1)>' } : s)) };
  const html = F.supplierForm(F.requestPayload(evil, { id: 'rq-y', supplierId: 'sup-trader-proteici', kind: 'eudr', lots: ['il-1000'] }));
  assert.ok(!html.includes('<img'), 'nomi protetti nell’HTML e nel JSON incorporato');
});

test('codice in linea del modulo: SHA-256 e JSON canonico identici a src/core/hash.js', () => {
  const { fsha256, fcanon } = new Function(F.FORM_HASH_JS + '\nreturn { fsha256, fcanon };')();
  const samples = [{}, { b: 1, a: [1, 'x', null, true, { z: 'è', y: 0.1 }] }, { emoji: '🌱 soia', n: -12.5e3, nested: { k: [[], {}] }, u: undefined }, 'testo', ''];
  for (const s of samples) {
    assert.equal(fcanon(s), canonicalJson(s));
    assert.equal(fsha256(fcanon(s)), sha256HexSync(canonicalJson(s)));
  }
  assert.equal(fsha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('risposta del fornitore: impronta con WebCrypto di node, importazione in un passo, lotto completo; risposta alterata rifiutata', async () => {
  const req = D.supplierRequests.find(r => r.kind === 'eudr');
  assert.ok(req && req.lots.length && req.formHash === F.formHash(req.payload));
  const lot = req.lots[0];
  assert.equal(E.eudrRegister(D).byId.get(lot).status.state, 'incompleto');
  const core = { format: F.REPLY_FORMAT, v: 1, requestId: req.id, supplierId: req.supplierId, kind: 'eudr', lang: 'it', formHash: req.formHash, answeredAt: '2026-10-15', respondent: { name: 'Ufficio qualità', email: null },
    lots: [{ ingLotId: lot, ddsRef: '26nl a1b2c3d4e5', country: 'Brasile', region: 'Paraná', scheme: 'rtrs', coc: 'mass balance', certNo: 'RTRS-CoC-IT-0093', certExpiry: '2027-05-01',
      geojson: fc([{ type: 'Polygon', coordinates: [square(-24.5, -51.5, 600)] }, { Area: 36 }]), geojsonName: 'campi.geojson' }] };
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(core)));
  const reply = { ...core, hash: Buffer.from(buf).toString('hex') };
  const text = JSON.stringify(reply, null, 1);
  const res = F.importReply(text, D, { today });
  assert.equal(res.hashOk, true); assert.equal(res.formOk, true); assert.ok(res.ok, res.errors.join('; '));
  assert.ok(res.changes.some(c => c.field === 'ddsRef' && c.to === '26NLA1B2C3D4E5'));
  assert.ok(res.changes.some(c => c.field === 'status' && c.to === 'completo'));
  const { data, refused } = applyOpsTo(D, res.ops);
  assert.ok(!refused);
  const row = E.eudrRegister(data).byId.get(lot);
  assert.equal(row.status.state, 'completo');
  assert.equal(row.e.coc, 'bilancio-di-massa'); assert.equal(row.e.ssgBenchmark, '2023'); assert.equal(row.country, 'BR');
  assert.equal(row.plots.length, 1); assert.equal(row.e.geoValid, true);
  assert.equal(data.supplierRequests.find(r => r.id === req.id).status, 'ricevuto');
  assert.equal(data.supplierRequests.find(r => r.id === req.id).replyHash, reply.hash);
  // risposta alterata dopo il salvataggio
  const bad = F.importReply(JSON.stringify({ ...reply, lots: [{ ...reply.lots[0], ddsRef: '26ITZZZZZZZZZZ' }] }), D, { today });
  assert.equal(bad.ok, false); assert.equal(bad.hashOk, false); assert.deepEqual(bad.ops, []);
  assert.equal(F.importReply('{"format":"altro"}', D).ok, false);
  assert.equal(F.verifyReplyHash(reply), true);
});

test('risposte ESG e certificati: punteggi dichiarati e certificati del fornitore in un solo passo', () => {
  const sup = 'sup-oleificio';
  const mk = (kind, extra) => { const core = { format: F.REPLY_FORMAT, v: 1, requestId: 'rq-libera', supplierId: sup, kind, lang: 'it', formHash: 'x', answeredAt: '2026-10-01', respondent: { name: 'Qualità', email: null }, ...extra }; return { ...core, hash: sha256HexSync(canonicalJson(core)) }; };
  const esg = F.importReply(mk('esg', { answers: { coc: 'si', hrPolicy: 'si', hrDueDiligence: 'no', safety: 'si', envPolicy: 'si', deforestation: 'si', anticorruption: 'si', grievance: 'no', ghg: 1200, renewable: 40, rating: 55 } }), D, { today });
  assert.ok(esg.ok, esg.errors.join('; '));
  assert.ok(esg.warnings.some(w => /non trovata/.test(w)), 'richiesta non registrata: solo un avviso');
  const after = applyOpsTo(D, esg.ops).data.supplierEsg.find(x => x.id === sup);
  assert.deepEqual([after.scoreE, after.scoreS, after.scoreG], [88, 55, 91]);
  assert.equal(after.assessedAt, '2026-10-01');
  const cert = F.importReply(mk('certificati', { certs: [{ type: 'RTRS', number: 'RTRS-CoC-IT-0555', expiry: '2028-01-31' }, { type: '', number: 'x' }] }), D, { today });
  const s2 = applyOpsTo(D, cert.ops).data.suppliers.find(x => x.id === sup);
  assert.ok(s2.cert.some(c => c.type === 'RTRS' && c.expiry === '2028-01-31') && s2.cert.some(c => c.type === 'GMP+'));
  const pcf = mk('pcf', { pcf: [{ productId: 'olio', product: 'Olio di soia', declaredUnit: 'kilogram', pcfExcl: 2.31, luc: 0.9, country: 'IT' }] });
  const pr = F.pcfReplyToPact(pcf);
  assert.equal(pr.length, 1); assert.equal(pr[0].pcf.pCfExcludingBiogenic, 2.31); assert.equal(pr[0].pcf.dLucGhgEmissions, 0.9);
});

test('importazione CSV «dds»: il lotto si indica con il codice o il DDT e la chiave è il lotto (nessun doppione)', () => {
  const il = D.ingLots.find(l => l.id === 'il-1011');
  const rows = [{ Lotto: il.code, 'Riferimento DDS': '26IT9X8Y7Z6W5V', Paese: 'BR' }, { Lotto: il.ddt, 'Riferimento DDS': '26ITAAAAAAAAAA', Paese: 'AR' }];
  const map = autoMap(['Lotto', 'Riferimento DDS', 'Paese'], 'dds');
  assert.equal(map.ingLotId.col, 'Lotto'); assert.equal(map.ddsRef.col, 'Riferimento DDS'); assert.equal(map.country.col, 'Paese');
  const pv = preview(D, 'dds', rows.slice(0, 1), map);
  assert.equal(pv.rows[0].status, 'changed'); assert.equal(pv.rows[0].rec.ingLotId, 'il-1011');
  const out = applyOpsTo(D, toOps(pv)).data;
  assert.equal(out.eudrLots.length, D.eudrLots.length, 'aggiorna invece di duplicare');
  assert.equal(out.eudrLots.find(e => e.ingLotId === 'il-1011').ddsRef, '26IT9X8Y7Z6W5V');
});

test('archivio vuoto e di partenza: nessuna eccezione, risultati vuoti; R34 segnala la soia non classificata', () => {
  for (const d of [emptyData(), starterData()]) {
    const c = makeCtx(d, today), PP = currentPeriod(d);
    assert.deepEqual(E.filieraSignals(d, c), []);
    assert.equal(E.filieraReportSection(d, c, PP, null), null);
    assert.deepEqual(E.eudrRegister(d).rows, []);
    assert.equal(E.dcfBalance(d).n, 0);
    assert.ok(E.soyShares(d, PP).tSoy === 0);
    assert.equal(E.customerEudrLetter(d, 'x', PP.key), null);
    assert.deepEqual(E.refsForShipments(d, ['x']), []);
    assert.ok(E.filieraSummary(d, PP) && typeof E.filieraSummary(d, PP) === 'object');
    for (const k of E.FILIERA_KPIS) assert.equal(k.compute(d, c, PP), null);
    for (const r of E.FILIERA_RULES) assert.ok(Array.isArray(r.check(d, c, {}).fails));
    assert.deepEqual(demoFiliera(d, { today, R: rng(1) }), {});
  }
  const st = starterData();
  const r34 = E.FILIERA_RULES.find(r => r.id === 'R34').check(st, makeCtx(st, today), {});
  assert.ok(r34.fails.some(f => /soia/.test(f.msg)), 'le materie prime di soia del catalogo vanno confermate');
});

test('demo: segnali attesi, KPI, regole senza errori, deterministico e idempotente', () => {
  const keys = E.filieraSignals(D, { ...ctx, today }).map(s => s.key);
  assert.equal(keys.filter(k => k.startsWith('eudr:dds-missing:')).length, 3, '3 lotti recenti senza riferimento');
  for (const p of ['eudr:cert-expiry:', 'eudr:request-overdue:', 'eudr:review-due:']) assert.ok(keys.some(k => k.startsWith(p)), p);
  assert.ok(!keys.some(k => k.startsWith('eudr:dcf-negative') || k.startsWith('eudr:high-risk')));
  for (const k of E.FILIERA_KPIS) { const v = k.compute(D, ctx, P); assert.ok(v > 0 && v <= 1, `${k.id} ${v}`); }
  for (const r of E.FILIERA_RULES) assert.equal(r.check(D, ctx, {}).fails.length, 0, r.id);
  const S = E.filieraSummary(D, P);
  assert.equal(S.suppliers.assessed, 9); assert.equal(S.suppliers.cocSigned, 6); assert.equal(S.suppliers.capaOpen, 2);
  assert.equal(S.requests.open, 2); assert.equal(S.requests.received, 1);
  assert.equal(S.lots.recentMissing, 3);
  const direct = E.eudrRegister(D).rows.find(r => r.directImport);
  assert.ok(direct && direct.status.eudrOk && direct.plots.length === 3);
  assert.deepEqual(direct.plots.map(p => [p.geom, Math.round(p.areaHa * 10) / 10]), [['Polygon', 12], ['Polygon', 35], ['Point', 2.5]]);
  assert.deepEqual(patchViolations(D, demoFiliera(D, { today, R: rng(16 + 1101) })), []);
  assert.deepEqual(demoFiliera(D, { today, R: rng(16 + 1101) }), {}, 'idempotente');
  assert.equal(JSON.stringify(demoData(today).eudrLots), JSON.stringify(D.eudrLots), 'deterministico');
  // sezione del report con confronto e datapoint con il periodo precedente
  const prev = previousPeriod(D, P.key);
  const sec = E.filieraReportSection(D, ctx, P, prev);
  assert.equal(sec.id, 'esg-filiera'); assert.equal(sec.order, 83); assert.ok(sec.table.rows.length >= 3);
  const dp = E.filieraDatapoints(D, P);
  assert.equal(dp['B2.soy-dds'].unit, '%'); assert.ok(dp['B2.soy-dds'].value > 85);
  assert.ok(Object.values(dp).every(x => x.source.startsWith('filiera.')));
  const cal = E.filieraCalendarItems(D, today);
  assert.ok(cal.some(c => c.date === '2026-12-30' && c.kind === 'scadenza' && c.validAsOf));
});
