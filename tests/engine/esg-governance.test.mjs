/* FeedOS 18 · Governance ed evidenze (pacchetto WP6): prove del motore. Applicabilità per soglie di dipendenti e profilo,
 * ricorrenze delle scadenze, formato iCalendar, controllo delle dichiarazioni (accenti, negazioni, parole composte, filiera DCF solo
 * nei mangimi), CRC-32 e ZIP del pacchetto per il revisore rileggibile, SHA-256 in JavaScript uguale a node, matrice B2, C6, C9, C8,
 * evidenze e regole della qualità dei dati, demo delle due edizioni, archivio vuoto. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { demoData, starterData } from '../../src/data/demo/index.js';
import { demoData as agroDemo } from '../../src/editions/agrofarmaci/demo/index.js';
import { emptyData } from '../../src/core/schema.js';
import { makeCtx } from '../../src/engine/actuals.js';
import { applyOpsTo } from '../../src/core/ops.js';
import { currentPeriod } from '../../src/engine/esg-years.js';
import { crc32, readZipEntries } from '../../src/core/zip.js';
import { sha256HexSync, sha256Hex, canonicalJson } from '../../src/core/hash.js';
import { collectDatapoints, collectCalendar, METHOD_NOTES } from '../../src/engine/esg-registry.js';
import { checkBudget, putBlob, getBlob, deleteBlob, blobUsage, blobMode, BLOB_MAX_FILE } from '../../src/core/blobs.js';
import { PACK_GOVERNANCE } from '../../src/data/pack-governance.js';
import * as E from '../../src/engine/esg-governance.js';
import { icsExport, icsEscape, icsFold, icsUnfold, icsUid } from '../../src/engine/esg-governance-ics.js';
import { auditPackFiles, auditPackZip } from '../../src/engine/esg-governance-audit.js';
import { checkClaim, normClaim } from '../../src/engine/esg-governance-claims.js';

const today = '2026-10-16';
const D = demoData(today);
const AG = agroDemo(today);
const ctxOf = d => ({ today, ...makeCtx(d, today) });
const pack = id => PACK_GOVERNANCE.items.find(x => x.id === id);
const prof = (employees, flags = {}) => ({ employees, flags: { model231: false, emp50: employees >= 50, ...flags } });

test('governance: le funzioni del contratto rispondono su demo, archivio vuoto e archivio di partenza', () => {
  for (const d of [D, AG, emptyData(), starterData()]) {
    const ctx = ctxOf(d), P = currentPeriod(d);
    assert.ok(Array.isArray(E.governanceSignals(d, ctx)));
    const s = E.governanceReportSection(d, ctx, P, null);
    assert.ok(s === null || (typeof s === 'object' && typeof s.title === 'string'));
    const dp = E.governanceDatapoints(d, P);
    assert.ok(dp && typeof dp === 'object' && !Array.isArray(dp));
    for (const [id, x] of Object.entries(dp)) assert.ok(/^[BC]\d{1,2}\./.test(id) && x.source.startsWith('governance.'), id);
    assert.ok(Array.isArray(E.governanceCalendarItems(d, today)));
    assert.equal(typeof E.checkClaim('testo', {}).ok, 'boolean');
    assert.ok(Array.isArray(E.evidenceFor(d, 'shipments', 'x')));
    assert.ok(E.governanceSummary(d, P) && typeof E.governanceSummary(d, P) === 'object');
    for (const k of E.GOVERNANCE_KPIS) { const v = k.compute(d, ctx, P); assert.ok(v === null || Number.isFinite(v), k.id); }
  }
  assert.ok(E.GOVERNANCE_METHOD.it.includes('SHA-256') && E.GOVERNANCE_METHOD.en.includes('SHA-256'));
});

test('applicabilità: soglie di dipendenti (segnalazioni, rapporto biennale, trasparenza retributiva) e flag del profilo', () => {
  const A = (id, p) => E.obligationApplies(pack(id), p).applies;
  // segnalazioni: 50 dipendenti o Modello 231 a qualsiasi dimensione
  assert.equal(A('whistleblowing', prof(31)), false);
  assert.equal(A('whistleblowing', prof(31, { model231: true })), true);
  assert.equal(A('whistleblowing', prof(50)), true);
  // rapporto biennale: oltre 50
  assert.equal(A('rapporto-biennale', prof(50)), false);
  assert.equal(A('rapporto-biennale', prof(51)), true);
  // trasparenza retributiva: 100-149 al 2031, 150 e oltre al 2027
  assert.equal(A('trasparenza-100', prof(99)), false);
  assert.equal(A('trasparenza-100', prof(120)), true);
  assert.equal(A('trasparenza-100', prof(160)), false);
  assert.equal(A('trasparenza-150', prof(160)), true);
  assert.equal(A('trasparenza-150', prof(149)), false);
  // dipendenti non noti: non si presume l'obbligo e lo si dice
  const u = E.obligationApplies(pack('rapporto-biennale'), prof(null));
  assert.equal(u.applies, false); assert.match(u.reason, /non noto/);
  // flag: PPWR solo per chi confeziona, AUA solo con l'autorizzazione
  assert.equal(A('ppwr', prof(31, { packer: false })), false);
  assert.equal(A('ppwr', prof(31, { packer: true })), true);
  assert.equal(A('aua-rinnovo', prof(31)), false);
  // il demo: 31 dipendenti dal questionario, Modello 231 → segnalazioni sì, rapporto biennale no
  const pr = E.governanceProfile(D, today);
  assert.equal(pr.employees, 31);
  assert.equal(pr.flags.model231, true);
  const o = Object.fromEntries(E.obligationsFor(D, today).map(x => [x.id, x]));
  assert.equal(o.whistleblowing.applies, true);
  assert.equal(o['rapporto-biennale'].applies, false);
  // l'azienda può escludere un obbligo: l'esclusione prevale sulla regola
  const ci = { id: 'ci-x', obligationId: 'mud', applies: false, done: [] };
  const x = E.obligationsFor({ ...D, complianceItems: [ci, ...D.complianceItems.filter(c => c.obligationId !== 'mud')] }, today).find(r => r.id === 'mud');
  assert.equal(x.applies, false); assert.equal(x.status, 'non applicabile'); assert.match(x.reason, /escluso/);
});

test('ricorrenze: data fissa, annuale (con storico, solo con l’ultimo completamento, senza storico), intervalli, permessi, eventi', () => {
  const nd = (rule, ci, d = { permits: [] }) => E.nextDue(rule, ci, d, today);
  // data fissa: aperta finché non c'è il completamento per quella data
  assert.equal(nd({ type: 'fixed', date: '2026-12-31' }, null).date, '2026-12-31');
  assert.equal(nd({ type: 'fixed', date: '2026-09-27' }, { done: [{ due: '2026-09-27', at: '2026-09-20' }] }).done, true);
  // annuale: dopo l'ultima scadenza completata
  assert.equal(nd({ type: 'annual', md: '02-28' }, { done: [{ due: '2026-02-28', at: '2026-02-10' }] }).date, '2027-02-28');
  // solo l'ultimo completamento: fatto in ritardo il 10/03 vale per la scadenza del 28/02 dello stesso anno
  assert.equal(nd({ type: 'annual', md: '02-28' }, { lastDoneAt: '2026-03-10' }).date, '2027-02-28');
  // fatto con molto anticipo (novembre) vale per l'anno dopo
  assert.equal(nd({ type: 'annual', md: '02-28' }, { lastDoneAt: '2026-11-20' }).date, '2028-02-28');
  // senza storico: la prossima da oggi (compresa)
  assert.equal(nd({ type: 'annual', md: '04-30' }, null).date, '2027-04-30');
  assert.equal(nd({ type: 'annual', md: '10-16' }, null).date, '2026-10-16');
  // intervallo: ultima scadenza + mesi; senza storico serve una data (da pianificare)
  assert.equal(nd({ type: 'every', months: 6 }, { done: [{ due: '2026-08-31', at: '2026-08-20' }] }).date, '2027-02-28');
  assert.ok(nd({ type: 'every', months: 12 }, null).missing);
  assert.equal(nd({ type: 'every', months: 12, anchor: '2024-03-01' }, null).date, '2027-03-01');
  // permesso: scadenza meno l'anticipo; la domanda registrata chiude il ciclo
  const permits = [{ id: 'p1', kind: 'AUA', to: '2034-03-17' }, { id: 'p0', kind: 'AUA', to: '2019-03-17' }];
  assert.equal(nd({ type: 'permit', kind: 'AUA', monthsBefore: 6 }, null, { permits }).date, '2033-09-17');
  assert.equal(nd({ type: 'permit', kind: 'AUA', monthsBefore: 6 }, { done: [{ due: '2033-09-17', at: '2033-08-01' }] }, { permits }).done, true);
  assert.match(nd({ type: 'permit', kind: 'CPI', monthsBefore: 1 }, null, { permits }).missing, /manca il permesso/);
  // evento: nessuna data; manuale: la data indicata
  assert.equal(nd({ type: 'event' }, null).date, null);
  assert.equal(nd({ type: 'manual' }, { due: '2026-11-30' }).date, '2026-11-30');
});

test('iCalendar (RFC 5545): CRLF, righe di al massimo 75 ottetti, testo protetto, UID stabili, eventi di un giorno con promemoria', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'Scadenza è «importante» ' + 'x'.repeat(40) + ' àèìòù€ '.repeat(12);
  const folded = icsFold('SUMMARY:' + long);
  for (const l of folded.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `riga di ${Buffer.byteLength(l, 'utf8')} ottetti`);
  assert.equal(icsUnfold(folded), 'SUMMARY:' + long, 'la piegatura non spezza i caratteri e si riapre identica');
  const items = [{ key: 'gov:obl:mud:2027-04-30', date: '2027-04-30', title: 'MUD: dichiarazione; rifiuti, anno 2026', kind: 'scadenza', law: 'L. 70/1994', owner: 'Resp. qualità', validAsOf: '2026-10-21', status: 'da verificare' },
    { key: 'gov:obl:mud:2027-04-30', date: '2027-04-30', title: 'doppione' }, { key: 'x', date: 'non-una-data', title: 'scartata' }];
  const ics = icsExport(items, { name: 'Adempimenti, prova', stamp: today });
  assert.ok(ics.endsWith('\r\n') && !/[^\r]\n/.test(ics), 'solo CRLF');
  for (const l of ics.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
  const un = icsUnfold(ics);
  assert.equal((un.match(/BEGIN:VEVENT/g) || []).length, 1, 'doppioni e date non valide scartati');
  assert.match(un, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:/);
  assert.match(un, /DTSTART;VALUE=DATE:20270430\r\nDTEND;VALUE=DATE:20270501/);
  assert.match(un, /SUMMARY:MUD: dichiarazione\\; rifiuti\\, anno 2026/);
  assert.match(un, /DESCRIPTION:.*Valido al: 21\/10\/2026\\nStato: da verificare/);
  assert.match(un, /DTSTAMP:20261016T000000Z/);
  assert.match(un, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:[^\r]*\r\nTRIGGER:-P7D\r\nEND:VALARM/);
  assert.match(un, /X-WR-CALNAME:Adempimenti\\, prova/);
  assert.equal(icsUid('gov:obl:mud:2027-04-30'), 'gov-obl-mud-2027-04-30@feedos.local');
  assert.equal(icsExport(items, { stamp: today }), icsExport(items, { stamp: today }), 'stesso calendario, stesso file');
  // il calendario del demo diventa un file valido con tutte le voci
  const cal = collectCalendar(D, today);
  const all = icsUnfold(icsExport(cal, { stamp: today }));
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, new Set(cal.map(c => icsUid(c.key))).size);
});

test('dichiarazioni: neutralità sempre bloccata, accenti e CO₂, negazioni, parole composte, impegni futuri, confronti, eccellenza riconosciuta', () => {
  const v = (t, c = {}) => checkClaim(t, c).verdict;
  // compensazione: bloccata in ogni forma, anche con evidenze e piano verificato
  for (const t of ['Carbon neutral', 'Mangime carbon-neutral', 'Prodotto a impatto zero', 'Imballo CO₂ neutro', 'CO2-neutrale', 'Climate positive', 'Emissioni compensate con crediti', 'Ad impatto ambientale zero'])
    assert.equal(v(t, { evidence: [{ title: 'Certificato Ecolabel UE' }], planVerified: true }), 'bloccata', t);
  assert.equal(checkClaim('carbon neutral', {}).findings[0].severity, 'blocco');
  // normalizzazione: accenti, pedici, maiuscole
  assert.equal(normClaim('CO₂ NEUTRALITÀ  climatica'), 'co2 neutralita climatica');
  // negazione: non vietata ma da rivedere
  const n = checkClaim('Il prodotto non è carbon neutral', {});
  assert.equal(n.verdict, 'da rivedere'); assert.equal(n.findings[0].severity, 'medio');
  // parole composte: eco-sostenibile, ecosostenibile, eco sostenibile; «economico» no
  for (const t of ['Linea eco-sostenibile', 'Linea ecosostenibile', 'Linea eco sostenibile', 'Imballo green', 'Formula ecologica', 'Prodotto rispettoso dell’ambiente']) assert.equal(v(t), 'bloccata', t);
  for (const t of ['Prezzo economico e consegna rapida', 'Report di sostenibilità 2025', 'Prodotto ammesso in agricoltura biologica']) assert.equal(v(t), 'ammessa', t);
  // asserzione generica con eccellenza riconosciuta tra le evidenze
  assert.equal(v('Prodotto ecologico', { evidence: [{ title: 'Licenza EU Ecolabel n. IT/123' }] }), 'ammessa');
  // impegno futuro: solo con piano verificato
  assert.equal(v('Net zero entro il 2040', { today }), 'bloccata');
  assert.equal(v('Net zero entro il 2040', { today, planVerified: true }), 'ammessa');
  // confronti: metodo e termine di paragone
  assert.equal(v('−9% CO₂e/t rispetto alla versione 2025, stima interna metodo PEFCR Feed'), 'ammessa');
  assert.equal(v('−9% di CO₂'), 'da rivedere');
  // biodegradabile solo con la norma
  assert.equal(v('Sacco biodegradabile'), 'bloccata');
  assert.equal(v('Sacco biodegradabile secondo EN 13432'), 'ammessa');
  // testo vuoto
  assert.deepEqual(checkClaim('', {}).findings, []);
});

test('dichiarazioni: «senza deforestazione» segue il registro DCF della filiera nei mangimi e non si blocca mai su questo in DifesaOS', () => {
  const ok = checkClaim('Soia senza deforestazione', { d: D });
  assert.equal(ok.verdict, 'ammessa');
  assert.ok(ok.findings.some(f => f.id === 'dcf' && f.severity === 'info'));
  // registro DCF negativo: dichiarazione bloccata
  const neg = { ...D, dcfLedger: [...D.dcfLedger, { id: 'dcf-neg', date: '2026-10-01', kind: 'uscita', tSoy: 1e6, scheme: 'ProTerra' }] };
  const ko = checkClaim('Soia senza deforestazione', { d: neg });
  assert.equal(ko.verdict, 'bloccata');
  assert.ok(ko.findings.some(f => f.id === 'dcf' && f.severity === 'alto'));
  // DifesaOS: nessun registro DCF da consultare, mai un blocco per questa regola
  const ag = checkClaim('Coformulanti senza deforestazione', { d: { ...AG, dcfLedger: neg.dcfLedger } });
  assert.notEqual(ag.verdict, 'bloccata');
  assert.ok(!ag.findings.some(f => f.id === 'dcf' && ['blocco', 'alto'].includes(f.severity)));
  // la lettera EUDR della filiera resta senza avvisi del controllo sul demo
  assert.ok(E.claimsView(D).length === 4);
});

test('CRC-32, SHA-256 in JavaScript come node e pacchetto per il revisore leggibile come ZIP con il manifesto delle impronte', async () => {
  assert.equal(crc32('hello'), 0x3610a686);
  for (const s of ['', 'abc', 'FeedOS · governance ed evidenze · àèìòù €', 'x'.repeat(1000)]) {
    const ref = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(sha256HexSync(s), ref, s.slice(0, 20));
    assert.equal(await sha256Hex(s), ref);
  }
  const bin = new Uint8Array(300).map((_, i) => (i * 37) & 255);
  assert.equal(sha256HexSync(bin), crypto.createHash('sha256').update(bin).digest('hex'));
  const P = currentPeriod(D);
  const dps = collectDatapoints(D, P).datapoints;
  const inputs = { datapoints: dps, calendar: collectCalendar(D, today), methodNotes: METHOD_NOTES, factors: [{ id: 'f1', label: 'GPL', value: 2.985, unit: 'kg CO₂/kg', source: 'IPCC 2006', year: 2006 }],
    packs: [{ pack: 'clima', version: '2026.4', validAsOf: '2026-10-21', origin: 'integrato' }], today, attachments: [{ id: 'ev-01', name: 'iso9001-certificato.pdf', bytes: new Uint8Array([37, 80, 68, 70, 45]) }] };
  const z = auditPackZip(D, P, inputs);
  const entries = readZipEntries(z.bytes);
  const names = entries.map(e => e.name);
  for (const n of ['LEGGIMI.txt', 'evidenze/indice-evidenze.csv', 'datapoint.csv', 'fattori.csv', 'pacchetti-di-contenuti.csv', 'scadenze.csv', 'politiche.csv', 'certificati-e-permessi.csv', 'dichiarazioni-ambientali.csv', 'note-metodologiche.md', 'istantanea-datapoint.json', 'MANIFEST-SHA256.txt'])
    assert.ok(names.includes(n), n);
  assert.ok(names.some(n => /^allegati\/ev-01-.*\.pdf$/.test(n)), 'allegato con il nome del registro');
  assert.ok(entries.every(e => e.ok), 'CRC di ogni file verificato');
  // ogni impronta del manifesto corrisponde al file
  const dec = new TextDecoder();
  const man = dec.decode(entries.find(e => e.name === 'MANIFEST-SHA256.txt').data).trim().split('\n').map(l => l.split('  '));
  assert.equal(man.length, entries.length - 1);
  for (const [h, n] of man) assert.equal(crypto.createHash('sha256').update(entries.find(e => e.name === n).data).digest('hex'), h, n);
  // istantanea: impronta del JSON canonico
  const snap = dec.decode(entries.find(e => e.name === 'istantanea-datapoint.json').data);
  assert.ok(dec.decode(entries.find(e => e.name === 'istantanea-datapoint.sha256.txt').data).startsWith(sha256HexSync(snap)));
  assert.equal(snap, canonicalJson(JSON.parse(snap)));
  // stesso contenuto, stesso archivio
  assert.deepEqual(auditPackZip(D, P, inputs).bytes, z.bytes);
  const csv = dec.decode(entries.find(e => e.name === 'evidenze/indice-evidenze.csv').data);
  assert.ok(csv.includes('ev-25') && csv.includes(D.evidence[0].sha256));
  assert.equal(auditPackFiles(emptyData(), currentPeriod(emptyData()), {}).counts.evidence, 0);
});

test('politiche: matrice B2 (le bozze non contano), C2, C6 con i temi coperti e il meccanismo di reclamo', () => {
  const P = currentPeriod(D);
  const m = Object.fromEntries(E.b2Matrix(D, P.to).map(x => [x.matter, x]));
  assert.equal(m.clima.policies, true); assert.equal(m.clima.public, true); assert.equal(m.clima.targets, true);
  assert.equal(m.inquinamento.practices, true); assert.equal(m.inquinamento.policies, false);
  assert.equal(m.biodiversita.covered, false);
  assert.equal(m.comunita.initiatives, true);
  // la politica soia responsabile è in bozza: non entra nella matrice ma resta elencata
  assert.ok(!m.filiera.items.some(p => p.id === 'pol-soia'));
  assert.ok(m.filiera.drafts.some(p => p.id === 'pol-soia'));
  assert.equal(E.b2Share(D, P.to), 0.9);
  const dp = E.governanceDatapoints(D, P);
  assert.deepEqual(dp['B2.climate'].value, { practices: false, policies: true, initiatives: false, public: true, targets: true });
  assert.equal(dp['B2.biodiversity'].value.policies, false);
  assert.match(dp['C2.description'].value, /Codice etico/);
  assert.equal(dp['C2.accountable'].value, 'Amministratore delegato');
  // C6: il codice etico del demo non copre la tratta
  const c6 = E.c6Coverage(D, P.to);
  assert.equal(c6.code, true); assert.equal(c6.grievance, true);
  assert.deepEqual(c6.topics, { childLabour: true, forcedLabour: true, trafficking: false, discrimination: true, accidents: true });
  assert.equal(dp['C6.coverage'].value.trafficking, false);
  // una politica ritirata o futura non conta
  const d2 = { ...D, policies: D.policies.map(p => (p.id === 'pol-ambiente' ? { ...p, status: 'ritirata' } : p)) };
  assert.equal(E.b2Matrix(d2, P.to).find(x => x.matter === 'clima').covered, false);
});

test('C9: rapporto donne/uomini nell’organo di amministrazione alla data, con ingressi e uscite', () => {
  const P = currentPeriod(D);
  const b = E.boardStats(D, P.to);
  assert.equal(b.members, 3); assert.equal(b.women, 1); assert.equal(b.men, 2); assert.equal(b.ratio, 0.5);
  assert.equal(E.governanceDatapoints(D, P)['C9.board-ratio'].value, 0.5);
  // coerente con il questionario ESG del demo (3 componenti, 1 donna)
  assert.equal(D.survey['gv-board-n'], b.members); assert.equal(D.survey['gv-board-w'], b.women);
  const d2 = { ...D, boardMembers: [...D.boardMembers.map(m => (m.id === 'bm-presidente' ? { ...m, until: '2026-06-30' } : m)), { id: 'bm-nuova', role: 'Presidente', gender: 'donna', since: '2026-07-01' }] };
  assert.equal(E.boardStats(d2, '2026-09-30').ratio, 2);
  assert.equal(E.boardStats(d2, '2026-06-30').ratio, 0.5);
  assert.equal(E.boardStats({ boardMembers: [{ id: 'a', gender: 'donna' }] }, today).ratio, null, 'nessun uomo: rapporto non definito');
  assert.equal(E.boardStats(AG, currentPeriod(AG).to).ratio, 0.67);
});

test('evidenze: collegamenti, sostituzioni, copertura dei datapoint, impronte ripetute e regole R42-R45', () => {
  const ctx = ctxOf(D);
  assert.equal(E.evidenceFor(D, 'companyCerts', 'cert-gmp').length, 1, 'il certificato precedente sostituito non conta');
  assert.ok(E.evidenceFor(D, 'datapoint', 'B3.s1').length >= 1);
  const P = currentPeriod(D);
  const cov = E.evidenceCoverage(D, P);
  assert.equal(cov.ids.length, 27); assert.equal(cov.covered.length, 21);
  assert.ok(cov.missing.includes('B1.sites-geo') && !cov.missing.includes('B3.s1'));
  assert.ok(Math.abs(E.GOVERNANCE_KPIS.find(k => k.id === 'esg-evidenze').compute(D, ctx, P) - 21 / 27) < 1e-9);
  // datapoint raccolti dal registro senza evidenze
  const miss = E.missingEvidence(D, collectDatapoints(D, P).datapoints);
  assert.ok(Array.isArray(miss) && !miss.includes('B3.s1'));
  const rule = id => E.GOVERNANCE_RULES.find(r => r.id === id);
  for (const id of ['R42', 'R43', 'R44', 'R45']) assert.equal(rule(id).check(D, ctx, {}).fails.length, 0, id + ' pulita sul demo');
  // R42: evidenza scaduta collegata a un datapoint
  const exp = { ...D, evidence: D.evidence.map(e => (e.id === 'ev-06' ? { ...e, expiresAt: '2026-01-31' } : e)) };
  assert.equal(rule('R42').check(exp, ctx, {}).fails.length, 1);
  // R43: stessa impronta
  const dup = { ...D, evidence: [...D.evidence, { ...D.evidence[0], id: 'ev-copia' }] };
  assert.equal(E.duplicateHashes(dup).length, 1);
  assert.equal(rule('R43').check(dup, ctx, {}).fails[0].id, 'ev-copia');
  // R44: adempimento senza responsabile
  const noOwner = { ...D, complianceItems: D.complianceItems.map(c => (c.obligationId === 'mud' ? { ...c, owner: '' } : c)) };
  const mudPack = PACK_GOVERNANCE.items.find(x => x.id === 'mud');
  assert.equal(rule('R44').check(noOwner, ctx, {}).fails.length, mudPack.owner ? 0 : 1, 'il responsabile del pacchetto vale come ripiego');
  const custom = { ...D, complianceItems: [...D.complianceItems, { id: 'ci-nuovo', title: 'Adempimento nuovo', due: '2026-12-01', owner: '' }] };
  assert.equal(rule('R44').check(custom, ctx, {}).fails.length, 1);
  // R45: dichiarazione pubblicata senza evidenze
  const pub = { ...D, claims: D.claims.map(c => (c.id === 'cl-co2' ? { ...c, evidenceIds: [] } : c)) };
  assert.equal(rule('R45').check(pub, ctx, {}).fails.length, 1);
});

test('adempimenti nei tempi, operazioni «fatto» e segnali: un completamento in ritardo conta, la scadenza passa al ciclo dopo', () => {
  const ctx = ctxOf(D), P = currentPeriod(D);
  const v = E.onTimeShare(D, P, today);
  assert.ok(v > 0.85 && v < 1, `quota nei tempi ${v}`);
  // nessun adempimento scaduto sul demo
  assert.ok(!E.obligationsFor(D, today).some(o => o.applies && o.status === 'scaduto'));
  // segnali attesi: riunione periodica in scadenza, certificato GMP+ in scadenza, evidenze mancanti, due dichiarazioni bloccate in bozza
  const keys = E.governanceSignals(D, ctx).map(s => s.key);
  for (const k of ['gov:cert-expiry:cert-gmp', 'gov:claim-risk:cl-ecologico', 'gov:claim-risk:cl-neutral', `gov:evidence-missing:${P.key}`]) assert.ok(keys.includes(k), k);
  assert.ok(keys.some(k => k.startsWith('gov:deadline:dvr:')));
  assert.ok(!E.governanceSignals(D, ctx).some(s => s.severity === 'critico'), 'nessun segnale critico sul demo');
  // «fatto» sulla riunione periodica: la scadenza passa all'anno dopo e il segnale sparisce
  const o = E.obligationsFor(D, today).find(x => x.id === 'dvr');
  const r = applyOpsTo(D, E.markDoneOps(D, o, { at: today, by: 'prova', evidenceIds: ['ev-23'] }));
  const o2 = E.obligationsFor(r.data, today).find(x => x.id === 'dvr');
  assert.equal(o2.date, `${+o.date.slice(0, 4) + 1}${o.date.slice(4)}`, 'ricorrenza annuale dalla scadenza completata');
  assert.equal(o2.status, 'pianificato');
  assert.ok(!E.governanceSignals(r.data, ctx).some(s => s.key.startsWith('gov:deadline:dvr:')));
  // scadenza passata senza completamento: critico e conteggiata nel KPI
  const late = { ...D, complianceItems: D.complianceItems.map(c => (c.obligationId === 'dvr' ? { ...c, done: c.done.map(x => ({ ...x, due: '2025-09-30' })) } : c)) };
  const sig = E.governanceSignals(late, ctx).find(s => s.key.startsWith('gov:deadline:dvr:'));
  assert.equal(sig.severity, 'critico');
  // responsabile e applicabilità su un obbligo senza riga: si crea la riga
  const nuovo = E.obligationsFor({ ...D, complianceItems: [] }, today).find(x => x.id === 'mud');
  const ops = E.obligationPatchOps(D, nuovo, { owner: 'Resp. ambiente' });
  assert.equal(ops[0].kind, 'add'); assert.equal(ops[0].obj.obligationId, 'mud');
});

test('C8 e B11: agrofarmaci della NACE 20.2 dalle consegne in DifesaOS, zero nel mangimificio; esclusione dagli indici allineati a Parigi', () => {
  const P = currentPeriod(D), PA = currentPeriod(AG);
  const f = E.c8(D, P);
  assert.equal(f.rows.find(r => r.key === 'chemicals').value, 0);
  assert.equal(f.excluded, false);
  const a = E.c8(AG, PA);
  const chem = a.rows.find(r => r.key === 'chemicals').value;
  assert.ok(chem > 0 && chem <= a.total + 1, 'ricavi dei prodotti con sostanze attive');
  const noActives = E.revenueIn(AG, PA.from, PA.to, s => !(AG.products.find(p => p.id === s.productId)?.actives || []).length);
  assert.ok(Math.abs(a.total - chem - noActives) < 2, 'biostimolanti esclusi dalla NACE 20.2');
  assert.equal(a.excluded, false, 'gli agrofarmaci non escludono dagli indici allineati a Parigi');
  const w = { ...AG, settings: { ...AG.settings, esg18: { ...AG.settings.esg18, governance: { ...AG.settings.esg18.governance, c8: { weapons: 1000 } } } } };
  assert.equal(E.c8(w, PA).excluded, true);
  // B11: condanne per corruzione nel periodo
  const b = { ...D, legalCases: [...D.legalCases, { id: 'lc-c', date: '2026-03-01', kind: 'corruzione', conviction: true, fineEur: 25000 }, { id: 'lc-v', date: '2023-03-01', kind: 'corruzione', conviction: true, fineEur: 9000 }] };
  assert.deepEqual([E.b11(b, P).convictions, E.b11(b, P).fines], [1, 25000]);
  assert.equal(E.governanceDatapoints(D, P)['B11.convictions'].value, 0);
});

test('DifesaOS: obblighi degli agrofarmaci (Seveso, ADR, REACH/CLP, registrazioni, rame) collegati all’area Regolatorio, nessun obbligo dei mangimi', () => {
  const rows = E.obligationsFor(AG, today);
  const on = Object.fromEntries(rows.filter(o => o.applies).map(o => [o.id, o]));
  for (const id of ['seveso-notifica', 'seveso-ppir', 'seveso-pei', 'adr-consulente', 'reach-sds', 'clp-pcn', 'reach-volumi', 'ppp-rinnovi', 'ppp-etichette', 'ppp-vendite', 'ppp-abilitazioni', 'rame-limiti']) assert.ok(on[id], id);
  assert.ok(!rows.some(o => ['eudr', 'feed-stabilimento', 'feed-haccp', 'feed-medicati'].includes(o.id)), 'nessun obbligo solo dei mangimi');
  assert.equal(on['ppp-rinnovi'].ext.area, 'regolatorio');
  assert.equal(on['ppp-rinnovi'].ext.tab, 'registrazioni');
  assert.ok(on['ppp-rinnovi'].extState && /rinnovo/.test(on['ppp-rinnovi'].extState.text), 'stato letto dall’area Regolatorio');
  assert.equal(on['reach-sds'].ext.tab, 'sds');
  // nel calendario: le domande dell'art. 43 dall'area Regolatorio con il collegamento
  const cal = E.governanceCalendarItems(AG, today);
  assert.ok(cal.some(c => c.key.startsWith('gov:agro:art43:') && c.goto?.area === 'regolatorio'));
  // FeedOS: nessun obbligo degli agrofarmaci
  assert.ok(!E.obligationsFor(D, today).some(o => /^(seveso|adr|reach|clp|ppp|rame)-/.test(o.id)));
  // catalogo completo su richiesta (filtro «tutti»): le voci dell'altro settore restano non applicabili
  const all = E.obligationsFor(D, today, { sector: 'tutti' });
  assert.ok(all.some(o => o.id === 'seveso-notifica' && !o.applies && !o.sectorMatch));
  // il demo DifesaOS non usa parole del mangimificio nelle raccolte della governance
  const json = JSON.stringify(['policies', 'complianceItems', 'evidence', 'claims', 'companyCerts', 'permits', 'm231Controls', 'odvReports', 'boardMembers', 'esgRoles', 'legalCases'].map(c => AG[c]));
  assert.ok(!/mangim|soia|pellet|GMP\+|FAMI|aflatossin/i.test(json));
  assert.equal(AG.settings.esg18.governance.employees, 58);
});

test('demo FeedOS: almeno 15 scadenze con norma, fonte e «valido al»; nessuna scaduta; pacchetto importato più recente in uso', () => {
  const cal = E.governanceCalendarItems(D, today);
  const obl = cal.filter(c => c.key.startsWith('gov:obl:') && !c.key.startsWith('gov:obl:ci:')); // gli adempimenti propri dell'azienda non hanno «valido al»
  assert.ok(cal.length >= 15, `${cal.length} scadenze`);
  assert.ok(obl.length >= 11, `${obl.length} adempimenti nel calendario`); // le scadenze già in un'altra scheda (ambiente «stack», persone «ot23», piano «iper») sono «altrove»
  assert.ok(E.obligationsFor(D, today).some(o => o.via?.key === 'stack' && o.status === 'altrove'), 'il controllo al camino è nel calendario dell’ambiente');
  for (const c of obl) { assert.ok(c.law && c.source && /^\d{4}-\d{2}-\d{2}$/.test(c.validAsOf), c.key); assert.equal(c.link.tab, 'governance'); }
  assert.ok(!cal.some(c => c.govStatus === 'scaduto'));
  // niente doppioni con le schede che hanno già la data (F-gas nel clima, EUDR nella filiera)
  assert.ok(!cal.some(c => /gov:obl:(fgas|eudr):/.test(c.key)));
  const all = collectCalendar(D, today);
  assert.ok(all.some(c => c.pkg === 'clima' && /fgas/.test(c.key)) && all.some(c => c.pkg === 'filiera'));
  // un pacchetto importato con versione più recente sostituisce quello integrato
  const newer = { ...PACK_GOVERNANCE, version: '2026.9', validAsOf: '2026-12-01', items: [...PACK_GOVERNANCE.items, { id: 'nuovo-obbligo', title: 'Nuovo obbligo di prova', sectors: ['mangimi'], when: {}, due: { type: 'fixed', date: '2027-01-15' }, kind: 'scadenza', law: 'Norma di prova', source: 'prova', status: 'verificato' }] };
  const d2 = { ...D, settings: { ...D.settings, esg18: { ...D.settings.esg18, packs: { governance: newer } } } };
  assert.equal(E.governancePack(d2).version, '2026.9');
  const x = E.governanceCalendarItems(d2, today).find(c => c.obligationId === 'nuovo-obbligo');
  assert.equal(x.date, '2027-01-15'); assert.equal(x.validAsOf, '2026-12-01');
});

test('allegati: budget di 15 MB per file e 200 MB in tutto, ripiego in memoria senza IndexedDB', async () => {
  assert.equal(checkBudget(BLOB_MAX_FILE + 1, 0).ok, false);
  assert.equal(checkBudget(10, 200 * 1024 * 1024 - 5).ok, false);
  assert.equal(checkBudget(10, 200 * 1024 * 1024 - 5, 10).ok, true, 'sostituire un allegato libera il suo spazio');
  const r = await putBlob('ev-prova', new Uint8Array([1, 2, 3]), { mime: 'text/plain', name: 'prova.txt' });
  assert.equal(r.ok, true);
  assert.equal(blobMode(), 'memoria');
  assert.deepEqual(Array.from((await getBlob('ev-prova')).bytes), [1, 2, 3]);
  assert.equal((await blobUsage()).used, 3);
  assert.equal((await putBlob('ev-grande', new Uint8Array(BLOB_MAX_FILE + 1))).ok, false);
  await deleteBlob('ev-prova');
  assert.equal(await getBlob('ev-prova'), null);
  assert.equal((await blobUsage()).files, 0);
});

test('archivio vuoto: nessun segnale, nessun datapoint inventato, KPI nulli, obblighi generali elencati senza errori', () => {
  const e = emptyData(), ctx = ctxOf(e), P = currentPeriod(e);
  assert.deepEqual(E.governanceSignals(e, ctx), []);
  assert.deepEqual(E.governanceDatapoints(e, P), {});
  assert.equal(E.governanceReportSection(e, ctx, P, null), null);
  for (const k of E.GOVERNANCE_KPIS) assert.equal(k.compute(e, ctx, P), null, k.id);
  const rows = E.obligationsFor(e, today);
  assert.ok(rows.length > 10 && rows.every(o => typeof o.status === 'string'));
  assert.ok(rows.some(o => o.id === 'ecgt' && o.status === 'in vigore'), 'le regole già in vigore si confermano, non risultano «scadute»');
  assert.equal(E.boardStats(e, today).ratio, null);
  assert.equal(E.evidenceCoverage(e, P).covered.length, 0);
});
