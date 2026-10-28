/* FeedOS 18 · Report e questionari (pacchetto WP4 «report», scheda «vsme»): rapporto VS/VSME B1-B11 e C1-C9 con copertura
 * rigorosa, chiusura annuale dell'esercizio con impronta SHA-256 e quattro occhi, storico di tre esercizi, pacchetto per la
 * banca, sintesi ESG per il CdA, segnali, KPI, regole della qualità dei dati, scadenze.
 * Copertura rigorosa: per modulo = datapoint obbligatori applicabili con un valore (dai pacchetti o risposta nel report) o con
 * un'omissione motivata ÷ datapoint obbligatori applicabili. Un'applicabilità non nota conta come obbligatoria.
 * Precedenza dei valori: chiusura approvata (valori congelati) → valore del pacchetto → risposta nel report (o la risposta
 * marcata «sostituisce» al posto del valore del pacchetto) → omissione motivata.
 * Il motore non importa il registro (esg-registry.js): la raccolta passa da esg-report-collect.js con le stesse regole.
 * Funzioni pure: nessun orologio (ctx.today o esgToday), nessuna eccezione su archivio vuoto o di partenza. */
import { currentPeriod, periodByKey, previousPeriod, reportingPeriods, esgToday, naceOf, sectorOf, dataRange, rowMatches } from './esg-years.js';
import { packStatus } from './esg-packs.js';
import { T, deltaPhrase } from './esg-nlg.js';
import { sha256HexSync, canonicalJson } from '../core/hash.js';
import { addDays, daysBetween, monthsIn, sum, nf, dateIt, round } from '../core/util.js';
import { frozenFor } from './pnl.js';
import { evidenceFor } from './esg-governance.js';
import { computeKpis } from './esg.js';
import { overview } from './sustainability.js';
import { CLIMA_METHOD } from './esg-clima.js';
import { PCF_METHOD } from './esg-pcf.js';
import { FILIERA_METHOD } from './esg-filiera.js';
import { PERSONE_METHOD } from './esg-persone.js';
import { GOVERNANCE_METHOD } from './esg-governance.js';
import { PIANO_METHOD } from './esg-piano.js';
import { RISCHI_METHOD } from './esg-rischi.js';
import { AMBIENTE_METHOD } from './esg-ambiente.js';
import { VS_DATAPOINTS, VS_DP, VS_ALIAS, VS_DISCLOSURES, VS_PROVIDERS, OMISSION_REASONS } from '../data/vsme-datapoints.js';
import { PACK_REPORT, PACK_REPORT_PMI, PACK_REPORT_IRO } from '../data/pack-report.js';
import { PACK_CLIMA } from '../data/pack-clima.js';
import { ownDatapoints, reportSettings, answersFor, answerDatapoint, isEmpty, hasValue, withComprehensive, QUALITIES } from './esg-report-own.js';
import { collectAll, calendarAll, memo } from './esg-report-collect.js';
import { itemText, dpLabel, sourceText, condWhy } from './esg-report-text.js';
import { fillQuestionnaire, overrideConflicts, pmiStatus, Q_OPEN, materialityRows, materialityMatrix, iroLibrary } from './esg-report-q.js';

export { reportSettings, answersFor, collectAll };
const EMPTY = [];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const copy = x => (x == null ? null : JSON.parse(JSON.stringify(x)));
const pctTxt = (x, d = 0) => (x == null ? '—' : `${nf(x * 100, d)}%`);

/** Ruoli che firmano la chiusura (gli stessi di core/roles.js, senza la vista agente). Non sono permessi di accesso. */
export const SIGN_ROLES = { direzione: 'Direzione', qualita: 'Qualità e sicurezza alimentare', produzione: 'Produzione', acquisti: 'Acquisti e magazzino', commerciale: 'Commerciale', formulazione: 'Formulazione e nutrizione' };
/** Datapoint propri del report che si impostano nella sezione Esercizio (gli altri si rispondono nella lista). */
const SETTINGS_IDS = new Set(['B1.option', 'B1.basis', 'B1.legal-form', 'B1.nace', 'B1.country', 'B1.omitted']);
const OPTIONAL_WHEN_FALSE = new Set(['dip50', 'dip150']);

/** Nota metodologica del pacchetto. */
export const REPORT_METHOD = {
  it: 'Il rapporto segue il Voluntary Standard (VS) per le PMI (Raccomandazione (UE) 2025/1710, Regolamento delegato (UE) 2026/1560): modulo Basic B1-B11 e, se scelto, modulo Comprehensive C1-C9. Ogni datapoint viene dal pacchetto di FeedOS che lo calcola dai registri (clima, persone, ambiente, governance, rischi, piano, impronta, filiera) oppure da una risposta inserita nel report; per ogni valore sono indicate qualità (misurato, calcolato, stimato, dichiarato, predefinito) e fonte.\n\nLa copertura è rigorosa: per ogni modulo, datapoint obbligatori applicabili con un valore o con un’omissione motivata, diviso i datapoint obbligatori applicabili. I datapoint «se applicabile» dipendono dal profilo dell’impresa (dipendenti, organo di amministrazione, settore NACE, obiettivi, siti); quando l’applicabilità non è nota contano come obbligatori.\n\nLa chiusura dell’esercizio congela i datapoint, gli indicatori, le versioni dei pacchetti di contenuti e una copia del questionario ESG in un’istantanea con impronta SHA-256 del JSON canonico (chiavi ordinate). Revisione e approvazione devono venire da ruoli diversi da chi ha preparato i dati; la riapertura richiede una nota e conserva lo storico. I ruoli indicano chi firma e non sono permessi di accesso.\n\nI questionari di clienti e banche si compilano dagli stessi datapoint; le voci senza datapoint del VS sono segnalate «oltre il VS»: dall’esercizio 2027 le richieste fatte ai fini della CSRD alle imprese con non più di 1.000 dipendenti si fermano al VS, ma FeedOS non rifiuta mai da solo. La tavola di raccordo del Documento PMI-Banche va trascritta dal testo pubblico (stato «da trascrivere»).',
  en: 'The report follows the Voluntary Standard (VS) for SMEs (Recommendation (EU) 2025/1710, Delegated Regulation (EU) 2026/1560): Basic module B1-B11 and, if chosen, Comprehensive module C1-C9. Each datapoint comes from the FeedOS package that calculates it from the registers (climate, people, environment, governance, risks, plan, footprint, supply chain) or from an answer entered in the report; every value shows its quality (measured, calculated, estimated, declared, default) and source.\n\nCoverage is strict: for each module, required applicable datapoints with a value or a justified omission, divided by required applicable datapoints. «If applicable» datapoints depend on the company profile (employees, governance body, NACE sector, targets, sites); when applicability is unknown they count as required.\n\nClosing the reporting period freezes datapoints, indicators, content-pack versions and a copy of the ESG questionnaire in a snapshot fingerprinted with SHA-256 over canonical JSON (sorted keys). Review and approval must come from roles other than the preparer; reopening requires a note and keeps the history. Roles identify who signs and are not access permissions.\n\nCustomer and bank questionnaires are filled from the same datapoints; items without a VS datapoint are flagged «beyond the VS»: from the 2027 financial year, requests made for CSRD purposes to undertakings with no more than 1,000 employees are capped at the VS, but FeedOS never refuses automatically. The crosswalk of the SME-Bank document has to be transcribed from the public text (status «to be transcribed»).',
};
/** Note metodologiche di tutti i pacchetti (per la nota consolidata del rapporto). */
export const METHODS = { clima: CLIMA_METHOD, pcf: PCF_METHOD, filiera: FILIERA_METHOD, report: REPORT_METHOD, persone: PERSONE_METHOD, governance: GOVERNANCE_METHOD, piano: PIANO_METHOD, rischi: RISCHI_METHOD, ambiente: AMBIENTE_METHOD };

/* ---------------- periodi ---------------- */
const PKEY = /^(12m-\d{4}-\d{2}|anno-\d{4})$/;
/** Esercizio ESG per un periodo qualsiasi: chiave ESG valida → quel periodo; periodo globale → l'esercizio che ne contiene la fine (o il corrente). */
export function esgPeriodFor(d, P) {
  if (typeof P === 'string') return periodByKey(d, P) || currentPeriod(d);
  if (P && typeof P.key === 'string' && PKEY.test(P.key)) return periodByKey(d, P.key) || currentPeriod(d);
  const list = reportingPeriods(d), to = P?.to || P?.from;
  if (to) { const hit = list.find(x => to >= x.from && to <= x.to); if (hit) return hit; }
  return list[0];
}
/** Chiusura dell'esercizio (riga di esgClosings) o null. */
export const closingRow = (d, key) => (Array.isArray(d?.esgClosings) ? d.esgClosings.find(c => c?.id === key) : null) || null;
/** Esercizi da mostrare: quelli con dati più quelli con una chiusura (anche se fuori dall'elenco mobile dei 12 mesi). */
export function reportPeriods(d) {
  const list = reportingPeriods(d), keys = new Set(list.map(p => p.key));
  const extra = (Array.isArray(d?.esgClosings) ? d.esgClosings : EMPTY).map(c => !keys.has(c?.id) && periodByKey(d, c?.id)).filter(Boolean);
  return [...list, ...extra].sort((a, b) => (a.to < b.to ? 1 : -1));
}

/* ---------------- profilo e applicabilità ---------------- */
const SECTIONS = [[1, 3, 'A'], [5, 9, 'B'], [10, 33, 'C'], [35, 35, 'D'], [36, 39, 'E'], [41, 43, 'F'], [45, 47, 'G'], [49, 53, 'H'], [55, 56, 'I'], [58, 63, 'J'], [64, 66, 'K'], [68, 68, 'L'], [69, 75, 'M'], [77, 82, 'N'], [84, 84, 'O'], [85, 85, 'P'], [86, 88, 'Q'], [90, 93, 'R'], [94, 96, 'S'], [97, 98, 'T'], [99, 99, 'U']];
/** Sezione NACE di un codice ('10.91' → 'C'). */
export function naceSection(code) { const n = parseInt(String(code || ''), 10); const s = SECTIONS.find(([a, b]) => n >= a && n <= b); return s ? s[2] : null; }
const sumObj = v => (isObj(v) ? (Object.values(v).every(x => Number.isFinite(+x)) && Object.keys(v).length ? sum(Object.entries(v).filter(([k]) => !/^(total|totale)$/i.test(k)), ([, x]) => +x) : null) : null);
const yn = (v, yes = 'si', no = 'no') => (v === yes ? true : v === no ? false : null);

function profileOf(d, P, val, st) {
  const sv = isObj(d?.survey) ? d.survey : {};
  const cats = isObj(sv['pe-cat']) ? sum(Object.values(sv['pe-cat']), v => +v || 0) : 0;
  const emp = num(val('B1.employees')) ?? sumObj(val('B8.by-contract')) ?? sumObj(val('B8.by-gender'));
  const sec = naceSection(naceOf(d));
  const b5 = num(val('B5.sites-sensitive'));
  const c6 = val('C6.code');
  const inP = m => typeof m === 'string' && m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7);
  return {
    employees: emp ?? (cats || null), employeesSrc: emp != null ? 'datapoint' : cats ? 'questionario ESG' : null, sector: sectorOf(d), naceSection: sec,
    consolidated: st.basis === 'consolidato', countries: Number.isFinite(+st.countries) && +st.countries >= 1 ? +st.countries : 1,
    hasBoard: val('C9.board-ratio') != null ? true : typeof st.hasBoard === 'boolean' ? st.hasBoard : yn(sv['gv-board']),
    highImpact: sec ? 'ABCDEFGHL'.includes(sec) : null, manufacturing: sec ? sec === 'C' : null,
    hasTargets: val('C3.targets') != null ? true : yn(sv['em-target']),
    hasCode: c6 === true ? true : c6 === false ? false : yn(sv['et-code']),
    pollutants: typeof st.pollutantsReporting === 'boolean' ? st.pollutantsReporting : val('B4.pollutants') != null ? true : null,
    waterSignificant: typeof st.waterSignificant === 'boolean' ? st.waterSignificant : val('B6.consumption') != null ? true : null,
    waterStress: typeof st.waterStress === 'boolean' ? st.waterStress : val('B6.withdrawal-stress') != null ? true : null,
    sensitiveSites: b5 == null ? null : b5 > 0,
    hasCerts: val('B1.certifications') != null ? true : Array.isArray(sv['et-certs']) && sv['et-certs'].length ? true : null,
    energyDetail: typeof st.energyDetail === 'boolean' ? st.energyDetail : val('B3.mwh') != null || (Array.isArray(d?.energy) && d.energy.some(e => inP(e?.month))) ? true : null,
  };
}
const COND = {
  consolidato: p => p.consolidated, 'ha-certificazioni': p => p.hasCerts, 'dettaglio-energia': p => p.energyDetail, inquinanti: p => p.pollutants,
  'siti-sensibili': p => p.sensitiveSites, 'stress-idrico': p => p.waterStress, 'consumo-acqua': p => p.waterSignificant, 'flussi-materiali': p => p.manufacturing,
  'piu-paesi': p => p.countries > 1, dip50: p => (p.employees == null ? null : p.employees >= 50), dip150: p => (p.employees == null ? null : p.employees >= 150),
  'ha-obiettivi': p => p.hasTargets, 'alto-impatto': p => p.highImpact, 'ha-codice': p => p.hasCode, 'ha-cda': p => p.hasBoard,
};
/** Dove si completa un datapoint: la scheda del pacchetto che lo fornisce (per il report: lista o impostazioni). */
export function linkFor(c) {
  if (!c) return { area: 'esg', tab: 'vsme', id: 'vsme' };
  if (c.provider === 'report') return { area: 'esg', tab: 'vsme', id: SETTINGS_IDS.has(c.id) ? 'esercizio' : 'vsme' };
  const p = VS_PROVIDERS[c.provider];
  return p ? { area: 'esg', tab: p.tab } : { area: 'esg', tab: 'vsme', id: 'vsme' };
}

/* ---------------- rapporto VS ---------------- */
function resolveItem(c, x) {
  const inScope = c.module === 'B' || x.withC;
  const cv = c.cond ? (COND[c.cond] ? COND[c.cond](x.profile) : null) : true;
  const applies = c.req === 'se-applicabile' ? (cv == null ? null : !!cv) : true;
  const required = inScope && (c.req === 'sempre' || (c.req === 'se-applicabile' && applies !== false));
  const a = x.answers[c.id] || null;
  const prov = x.pick(c);
  let base = null, origin = null, omission = null;
  if (x.frozen) {
    const fz = x.dps[c.id];
    if (fz?.omitted) omission = fz.omitted;
    else if (hasValue(fz)) { base = fz; origin = 'chiusura'; }
  } else {
    const ansDp = answerDatapoint(a, c.id);
    const ansOmit = a && OMISSION_REASONS[a.omission] ? { reason: a.omission, note: String(a.omissionNote || '').trim() } : null;
    if (hasValue(prov) && !(a?.override && (ansDp || ansOmit))) { base = prov; origin = prov.origin === 'risposta' ? 'risposta' : 'pacchetto'; }
    else if (ansOmit) omission = ansOmit;
    else if (ansDp) { base = { ...ansDp, pkg: 'report' }; origin = 'risposta'; }
    else if (x.st.omitted.includes(c.id)) omission = { reason: 'riservato', note: String(x.st.omissionNotes[c.id] || '').trim() };
  }
  const has = !!base, justified = !!omission && !!omission.note;
  const status = has ? 'coperto' : omission ? (justified ? 'omesso' : 'da-motivare') : !inScope ? 'fuori-ambito' : c.req === 'facoltativo' ? 'facoltativo'
    : applies === false ? (OPTIONAL_WHEN_FALSE.has(c.cond) ? 'facoltativo' : 'non-applicabile') : 'mancante';
  return {
    id: c.id, disc: c.disc, module: c.module, order: c.order, label: c.label, type: c.type, req: c.req, cond: c.cond || null, provider: c.provider,
    inScope, applies, required, condText: c.cond ? condWhy(c.cond, applies !== false) : '',
    hasValue: has, value: has ? base.value : null, unit: has ? base.unit ?? c.unit : c.unit, quality: has ? base.quality : 'mancante',
    source: has ? base.source || null : prov?.source || null, pkg: has ? base.pkg || null : prov?.pkg || null, method: has ? base.method : undefined,
    note: has ? base.note : prov?.note, evidence: has && Array.isArray(base.evidence) ? base.evidence : [], prev: has ? base.prev : undefined, alias: base?.alias || null,
    origin, omission, covered: required && (has || justified), status, answer: a, link: linkFor(c),
  };
}

/**
 * Rapporto VS dell'esercizio (P: periodo ESG, chiave o periodo globale). opts.live: dati di oggi anche se l'esercizio è approvato;
 * opts.collected: raccolta già fatta (per esempio collectDatapoints del registro). → {period, option, withC, frozen, closing,
 * items, byId, disclosures, coverage {B, C, total}, measured, quality, gaps, extras, profile, texts, meta, errors}
 */
export function vsmeReport(d, Pin, opts = {}) {
  const P = esgPeriodFor(d, Pin);
  if (opts.collected) return buildReport(d, P, opts);
  return memo(d, `rep|${P.key}|${opts.live ? 'L' : 'F'}`, () => buildReport(d, P, opts));
}
function buildReport(d, P, opts) {
  const st = reportSettings(d);
  const closing = closingRow(d, P.key);
  const frozen = !opts.live && closing?.status === 'approvato' && isObj(closing.datapoints);
  const col = frozen ? { datapoints: closing.datapoints, errors: [], duplicates: [] } : opts.collected || collectAll(d, P);
  const dps = col.datapoints || {};
  const answers = answersFor(d, P.key);
  const option = frozen && closing.option ? closing.option : st.option;
  const withC = withComprehensive(option);
  const pick = c => { if (hasValue(dps[c.id])) return dps[c.id]; for (const a of c.aliases || EMPTY) if (hasValue(dps[a])) return { ...dps[a], alias: a }; return dps[c.id] || null; };
  const val = id => { const c = VS_DP[id]; const dp = c ? pick(c) : dps[id]; if (hasValue(dp)) return dp.value; const a = answers[id]; return a && !isEmpty(a.value) ? a.value : null; };
  const profile = profileOf(d, P, val, st);
  const ctx = { dps, pick, answers, frozen, st, profile, withC };
  const items = VS_DATAPOINTS.map(c => resolveItem(c, ctx));
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const known = new Set([...Object.keys(VS_DP), ...Object.keys(VS_ALIAS)]);
  const extras = Object.entries(dps).filter(([id, dp]) => !known.has(id) && /^[BC]\d{1,2}\./.test(id) && hasValue(dp)).map(([id, dp]) => ({
    id, disc: id.split('.')[0], module: id[0], label: typeof dp.label === 'string' ? dp.label : id, value: dp.value, unit: dp.unit ?? null, quality: dp.quality, source: dp.source || null,
    pkg: dp.pkg || null, method: dp.method, note: dp.note, evidence: Array.isArray(dp.evidence) ? dp.evidence : [], hasValue: true, status: 'coperto', extra: true,
    inScope: id[0] === 'B' || withC, required: false, covered: false, origin: frozen ? 'chiusura' : 'pacchetto' }));
  for (const e of extras) byId[e.id] = e;
  const disclosures = VS_DISCLOSURES.map(x => {
    const its = items.filter(i => i.disc === x.id), req = its.filter(i => i.required), cov = req.filter(i => i.covered);
    return { id: x.id, module: x.module, title: x.title, about: x.about, inScope: x.module === 'B' || withC, items: its, extras: extras.filter(e => e.disc === x.id),
      required: req.length, covered: cov.length, pct: req.length ? cov.length / req.length : null, gaps: req.filter(i => !i.covered).map(i => i.id) };
  });
  const mod = m => { const req = items.filter(i => i.module === m && i.required); const c = req.filter(i => i.covered).length; return { required: req.length, covered: c, pct: req.length ? c / req.length : null }; };
  const B = mod('B'), C = withC ? mod('C') : null;
  const tr = B.required + (C?.required || 0), tc = B.covered + (C?.covered || 0);
  const withVal = [...items, ...extras].filter(i => i.hasValue && i.inScope);
  const mm = withVal.filter(i => i.quality === 'misurato' || i.quality === 'calcolato').length;
  const quality = Object.fromEntries(QUALITIES.map(q => [q, withVal.filter(i => i.quality === q).length]));
  const texts = {};
  for (const a of Object.values(answers)) if (/\.testo-(it|en)$/.test(a.dpId)) texts[a.dpId] = a;
  const co = d?.settings?.company || {};
  return {
    period: P, key: P.key, option, withC, frozen, settings: st, profile,
    closing: closing ? closingSummary(closing) : null,
    items, byId, extras, disclosures, coverage: { B, C, total: { required: tr, covered: tc, pct: tr ? tc / tr : null } },
    measured: { n: withVal.length, measured: mm, pct: withVal.length ? mm / withVal.length : null }, quality,
    gaps: items.filter(i => i.required && !i.covered).map(i => ({ id: i.id, disc: i.disc, label: i.label, provider: i.provider, status: i.status, link: i.link })),
    texts, errors: col.errors || [], duplicates: col.duplicates || [],
    meta: { company: co.name || '', site: co.site || '', address: co.address || '', sector: sectorOf(d), nace: naceOf(d), today: esgToday(d) },
  };
}
function closingSummary(c) {
  return { id: c.id, status: c.status || 'aperto', label: c.label || '', frozenAt: c.frozenAt || null, preparedBy: c.preparedBy || null, preparedName: c.preparedName || '', preparedAt: c.preparedAt || null,
    reviewedBy: c.reviewedBy || null, reviewedName: c.reviewedName || '', reviewedAt: c.reviewedAt || null, reviewNote: c.reviewNote || '', approvedBy: c.approvedBy || null, approvedName: c.approvedName || '',
    approvedAt: c.approvedAt || null, reopenedAt: c.reopenedAt || null, reopenedBy: c.reopenedBy || null, reopenNote: c.reopenNote || '', hash: c.hash || null, history: Array.isArray(c.history) ? c.history : [] };
}

/* ---------------- chiusura dell'esercizio ---------------- */
/** Contenuto impronta di una chiusura: tutto ciò che si congela (non le firme successive né l'impronta stessa). */
export function closingPayload(rec) {
  return { id: rec?.id ?? null, from: rec?.from ?? null, to: rec?.to ?? null, label: rec?.label || '', option: rec?.option || 'basic', datapoints: rec?.datapoints || {}, kpis: rec?.kpis || {},
    coverage: rec?.coverage || null, packVersions: rec?.packVersions || {}, survey: rec?.survey ?? null, esgManual: rec?.esgManual ?? null, preparedBy: rec?.preparedBy || null,
    preparedName: rec?.preparedName || '', frozenAt: rec?.frozenAt || null };
}
/** Impronta SHA-256 (sincrona, JSON canonico) di una chiusura. */
export const closingHash = rec => sha256HexSync(canonicalJson(closingPayload(rec)));
/** Controllo dell'impronta salvata: {ok, expected, actual}. */
export function verifyClosing(rec) { const actual = closingHash(rec); return { ok: !!rec?.hash && rec.hash === actual, expected: rec?.hash || null, actual }; }
/** Versioni dei pacchetti di contenuti in uso. */
export function packVersions(d) {
  return Object.fromEntries(packStatus(d, [PACK_REPORT, PACK_REPORT_PMI, PACK_REPORT_IRO, PACK_CLIMA]).map(p => [p.pack, p.version]));
}
/** Datapoint da congelare: valore, unità, qualità, fonte, metodo, nota, evidenze; le omissioni con il motivo. */
export function snapshotDatapoints(rep) {
  const out = {};
  for (const x of rep.items) {
    if (x.hasValue) out[x.id] = clean({ value: x.value, unit: x.unit ?? null, quality: x.quality, source: x.source || null, pkg: x.pkg || null, method: x.method || undefined, note: typeof x.note === 'string' && x.note ? x.note : undefined, evidence: x.evidence.length ? x.evidence : undefined });
    else if (x.omission) out[x.id] = { value: null, unit: x.unit ?? null, quality: 'mancante', omitted: x.omission };
  }
  for (const e of rep.extras) out[e.id] = clean({ value: e.value, unit: e.unit ?? null, quality: e.quality, source: e.source || null, pkg: e.pkg || null, label: e.label !== e.id ? e.label : undefined });
  return out;
}
const fail = error => ({ ok: false, error, ops: [] });
const who_ = w => ({ role: SIGN_ROLES[w?.role] ? w.role : null, name: String(w?.name || '').trim().slice(0, 80) });
const sameSigner = (a, aName, b) => a === b.role && (!aName || !b.name || aName.toLowerCase() === b.name.toLowerCase());

/**
 * Preparazione (congelamento) della chiusura: → {ok, ops, record, payload, label}. L'impronta si calcola nell'interfaccia
 * (sha256Hex asincrona sul payload) e si salva con hashOp nello stesso store.batch. opts: {today, at, kpis, collected}.
 */
export function closeOps(d, Pin, who, opts = {}) {
  const P = esgPeriodFor(d, Pin), w = who_(who);
  if (!w.role) return fail('Indica il ruolo di chi prepara la chiusura.');
  const cur = closingRow(d, P.key);
  if (cur?.status === 'approvato') return fail('L’esercizio è approvato: per cambiarlo va riaperto con una nota.');
  const rep = vsmeReport(d, P, { live: true, collected: opts.collected });
  const at = opts.at || opts.today || esgToday(d);
  const rec = { id: P.key, from: P.from, to: P.to, label: P.label, option: rep.option, status: 'in revisione', preparedBy: w.role, preparedName: w.name, preparedAt: at, frozenAt: at,
    reviewedBy: null, reviewedName: '', reviewedAt: null, reviewNote: '', approvedBy: null, approvedName: '', approvedAt: null,
    datapoints: snapshotDatapoints(rep), kpis: { 'esg-vsme-copertura': rep.coverage.total.pct, 'esg-dati-misurati': rep.measured.pct, ...(isObj(opts.kpis) ? opts.kpis : {}) },
    coverage: { B: rep.coverage.B, C: rep.coverage.C, total: rep.coverage.total }, packVersions: packVersions(d), survey: copy(d?.survey), esgManual: copy(d?.esgManual),
    hash: null, history: Array.isArray(cur?.history) ? cur.history : [], reopenNote: cur?.reopenNote || '', reopenedAt: cur?.reopenedAt || null, reopenedBy: cur?.reopenedBy || null };
  const ops = cur ? [{ kind: 'update', coll: 'esgClosings', id: P.key, patch: () => rec }] : [{ kind: 'add', coll: 'esgClosings', obj: rec }];
  return { ok: true, ops, record: rec, payload: closingPayload(rec), label: `Esercizio ESG «${P.label}»: dati congelati per la revisione` };
}
/** Operazione che salva l'impronta calcolata (secondo passo della stessa azione). */
export const hashOp = (id, hash) => ({ kind: 'update', coll: 'esgClosings', id, patch: { hash } });
/** Come closeOps ma con l'impronta calcolata subito (dati dimostrativi e prove). */
export function closeOpsSync(d, Pin, who, opts = {}) {
  const r = closeOps(d, Pin, who, opts);
  if (!r.ok) return r;
  const hash = closingHash(r.record);
  return { ...r, record: { ...r.record, hash }, ops: [...r.ops, hashOp(r.record.id, hash)] };
}
/** Revisione: serve una chiusura in revisione e un ruolo diverso da chi l'ha preparata. */
export function reviewOps(d, key, who, note = '') {
  const c = closingRow(d, key), w = who_(who);
  if (!c || c.status !== 'in revisione') return fail('Non c’è una chiusura in revisione per questo esercizio.');
  if (!w.role) return fail('Indica il ruolo di chi rivede i dati.');
  if (sameSigner(c.preparedBy, c.preparedName, w)) return fail('La revisione deve farla un ruolo diverso da chi ha preparato i dati (quattro occhi).');
  return { ok: true, ops: [{ kind: 'update', coll: 'esgClosings', id: key, patch: { reviewedBy: w.role, reviewedName: w.name, reviewedAt: who?.at || esgToday(d), reviewNote: String(note || '').trim() } }], label: `Esercizio ESG «${c.label || key}»: dati rivisti` };
}
/** Approvazione: dopo la revisione, da un ruolo diverso da chi ha preparato i dati. */
export function approveOps(d, key, who) {
  const c = closingRow(d, key), w = who_(who);
  if (!c || c.status !== 'in revisione') return fail('Non c’è una chiusura in revisione da approvare.');
  if (!c.hash) return fail('Manca l’impronta dell’istantanea: preparare di nuovo la chiusura.');
  if (!c.reviewedBy) return fail('Prima dell’approvazione serve la revisione.');
  if (!w.role) return fail('Indica il ruolo di chi approva.');
  if (sameSigner(c.preparedBy, c.preparedName, w)) return fail('L’approvazione deve venire da un ruolo diverso da chi ha preparato i dati (quattro occhi).');
  return { ok: true, ops: [{ kind: 'update', coll: 'esgClosings', id: key, patch: { status: 'approvato', approvedBy: w.role, approvedName: w.name, approvedAt: who?.at || esgToday(d) } }], label: `Esercizio ESG «${c.label || key}»: approvato` };
}
/** Riapertura di un esercizio approvato: serve una nota; lo storico conserva impronta, firme e valori approvati. */
export function reopenOps(d, key, who, note) {
  const c = closingRow(d, key), w = who_(who), n = String(note || '').trim();
  if (!c || c.status !== 'approvato') return fail('Si riapre solo un esercizio approvato.');
  if (!w.role) return fail('Indica il ruolo di chi riapre l’esercizio.');
  if (n.length < 5) return fail('Serve una nota che spieghi perché si riapre l’esercizio.');
  const at = who?.at || esgToday(d);
  const values = Object.fromEntries(Object.entries(c.datapoints || {}).map(([id, dp]) => [id, dp?.value ?? null]));
  const hist = [...(Array.isArray(c.history) ? c.history : []), { hash: c.hash || null, frozenAt: c.frozenAt || null, preparedBy: c.preparedBy, reviewedBy: c.reviewedBy, approvedBy: c.approvedBy, approvedAt: c.approvedAt, reopenedAt: at, reopenedBy: w.role, note: n, values }];
  return { ok: true, ops: [{ kind: 'update', coll: 'esgClosings', id: key, patch: { status: 'riaperto', reopenNote: n, reopenedAt: at, reopenedBy: w.role, history: hist, approvedBy: null, approvedName: '', approvedAt: null, reviewedBy: null, reviewedName: '', reviewedAt: null } }],
    label: `Esercizio ESG «${c.label || key}»: riaperto (${n.slice(0, 60)})` };
}
const same = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  return canonicalJson(a ?? null) === canonicalJson(b ?? null);
};
/** Differenze tra i valori congelati della chiusura e i dati di oggi: {closing, changes: [{id, label, unit, frozen, live, kind}], n}. */
export function frozenVsLive(d, key, opts = {}) {
  const c = closingRow(d, key);
  if (!c || !isObj(c.datapoints)) return { closing: null, changes: [], n: 0 };
  const live = vsmeReport(d, key, { live: true, collected: opts.collected });
  const changes = [];
  const fz = c.datapoints;
  const ids = new Set([...Object.keys(fz), ...live.items.filter(i => i.hasValue || i.omission).map(i => i.id), ...live.extras.map(e => e.id)]);
  for (const id of ids) {
    const f = fz[id], l = live.byId[id];
    const fv = f && !f.omitted ? f.value ?? null : null, lv = l?.hasValue ? l.value : null;
    const fo = f?.omitted ? `${f.omitted.reason}` : null, lo = l && !l.hasValue && l.omission ? `${l.omission.reason}` : null;
    if (same(fv, lv) && fo === lo) continue;
    changes.push({ id, label: dpLabel(id), unit: l?.unit ?? f?.unit ?? null, frozen: fo ? `omesso (${fo})` : fv, live: lo ? `omesso (${lo})` : lv, kind: !f ? 'nuovo' : !l || (!l.hasValue && !l.omission) ? 'rimosso' : 'modificato' });
  }
  changes.sort((a, b) => (VS_DP[a.id]?.order ?? 999) - (VS_DP[b.id]?.order ?? 999));
  return { closing: closingSummary(c), changes, n: changes.length };
}

/* ---------------- risposte nel report ---------------- */
/**
 * Risposta a un datapoint per l'esercizio (valore, qualità, nota, evidenze, omissione motivata, «sostituisce il valore del
 * pacchetto», stato bozza/rivisto/approvato). patch null → la risposta si toglie. → {ok, ops, label}
 */
export function answerOps(d, key, dpId, patch, who = {}) {
  const id = `${key}:${dpId}`;
  const cur = (Array.isArray(d?.esgAnswers) ? d.esgAnswers : EMPTY).find(a => a.id === id);
  const lbl = VS_DP[dpId] ? `${dpId} ${VS_DP[dpId].label.it}` : dpId;
  if (patch == null) return cur ? { ok: true, ops: [{ kind: 'remove', coll: 'esgAnswers', id }], label: `Risposta tolta: ${lbl}` } : { ok: true, ops: [], label: '' };
  const c = VS_DP[dpId];
  let value = patch.value ?? null;
  if (c?.type === 'num' && value != null && value !== '') { const n = num(String(value).replace(',', '.')); if (n == null) return fail('Serve un numero.'); value = n; }
  if (typeof value === 'string') value = value.trim();
  if (patch.omission && !OMISSION_REASONS[patch.omission]) return fail('Motivo di omissione non valido.');
  if (patch.omission && String(patch.omissionNote || '').trim().length < 5) return fail('Un’omissione conta solo con una motivazione scritta.');
  if (!patch.omission && isEmpty(value) && !/\.testo-(it|en)$/.test(dpId)) return fail('Inserisci un valore oppure indica un’omissione motivata.');
  const row = clean({ id, periodKey: key, dpId, value: patch.omission ? null : value, unit: patch.unit ?? c?.unit ?? null, quality: QUALITIES.includes(patch.quality) && patch.quality !== 'mancante' ? patch.quality : 'dichiarato',
    note: String(patch.note || '').trim(), method: patch.method ? String(patch.method) : undefined, evidenceIds: Array.isArray(patch.evidenceIds) ? patch.evidenceIds.map(String) : [],
    override: !!patch.override, omission: patch.omission || null, omissionNote: patch.omission ? String(patch.omissionNote).trim() : '', status: ['bozza', 'rivisto', 'approvato'].includes(patch.status) ? patch.status : 'bozza',
    by: who?.role || null, at: who?.at || esgToday(d) });
  return { ok: true, ops: [{ kind: 'upsertMany', coll: 'esgAnswers', objs: [row], key: 'id' }], label: patch.omission ? `Omissione motivata: ${lbl}` : `Risposta nel report: ${lbl}` };
}
/** Testo modificato di un'informativa (lingua it/en); text vuoto → torna il testo automatico. */
export function textEditOps(d, key, disc, lang, text) {
  const dpId = `${disc}.testo-${lang === 'en' ? 'en' : 'it'}`;
  const t = String(text || '').trim();
  if (!t) return answerOps(d, key, dpId, null);
  return { ok: true, ops: [{ kind: 'upsertMany', coll: 'esgAnswers', objs: [{ id: `${key}:${dpId}`, periodKey: key, dpId, value: t, quality: 'dichiarato', note: 'testo modificato', status: 'bozza', at: esgToday(d) }], key: 'id' }], label: `Testo del rapporto modificato: ${disc} (${lang})` };
}

/* ---------------- storico di tre esercizi ---------------- */
const H = (key, unit, good, dp, extra = {}) => ({ key, unit, good, dp, ...extra });
export const HISTORY_METRICS = [
  H('tonnes', 't', null), H('revenueNet', '€', null, 'B1.turnover'), H('mwh', 'MWh', 'down', 'B3.mwh'), H('mwhRen', 'MWh', 'up', 'B3.mwh-ren-el'),
  H('s1', 't CO₂e', 'down', 'B3.s1'), H('s2lb', 't CO₂e', 'down', 'B3.s2-lb'), H('s2mb', 't CO₂e', 'down', 'B3.s2-mb'), H('s3', 't CO₂e', 'down', 'B3.s3'),
  H('waterM3', 'm³', 'down', 'B6.withdrawal'), H('wasteT', 't', 'down', null, { dps: ['B7.waste-haz', 'B7.waste-nonhaz'] }), H('wasteHazT', 't', 'down', 'B7.waste-haz'),
  H('diverted', 't', 'up', 'B7.diverted', { hidden: true }), H('recoveryPct', '%', 'up', null), H('headcount', 'persone', null, 'B1.employees'), H('hours', 'h', null, 'B9.hours'),
  H('recordable', 'n', 'down', 'B9.recordable'), H('fatalities', 'n', 'down', 'B9.fatalities'),
];
const DERIVED = [
  { key: 's12', unit: 't CO₂e', good: 'down', f: v => (v.s1 != null && v.s2lb != null ? v.s1 + v.s2lb : null) },
  { key: 'intT', unit: 'kg CO₂e/t', good: 'down', f: v => (v.s12 != null && v.tonnes > 0 ? (v.s12 * 1000) / v.tonnes : null) },
  { key: 'intRev', unit: 't CO₂e/M€', good: 'down', f: v => (v.s12 != null && v.revenueNet > 0 ? v.s12 / (v.revenueNet / 1e6) : null) },
  { key: 'waterLt', unit: 'L/t', good: 'down', f: v => (v.waterM3 != null && v.tonnes > 0 ? (v.waterM3 * 1000) / v.tonnes : null) },
  { key: 'rate', unit: 'per 200.000 h', good: 'down', f: v => (v.recordable != null && v.hours > 0 ? (v.recordable * 200000) / v.hours : null) },
];
const ROW_ORDER = ['tonnes', 'revenueNet', 'mwh', 'mwhRen', 's1', 's2lb', 's2mb', 's3', 's12', 'intT', 'intRev', 'waterM3', 'waterLt', 'wasteT', 'wasteHazT', 'recoveryPct', 'headcount', 'hours', 'recordable', 'rate', 'fatalities'];
/** Riga dello storico dichiarato per un esercizio: per id (anno o chiave), per periodKey o per date di inizio e fine. */
export function historyRowFor(d, X) {
  return (Array.isArray(d?.esgHistory) ? d.esgHistory : EMPTY).find(r => r && (rowMatches(r.id, X) || r.periodKey === X.key || (r.from === X.from && r.to === X.to))) || null;
}
/** I registri operativi coprono almeno metà del periodo? */
function registerCoverage(d, X) {
  const r = dataRange(d);
  if (!r) return 0;
  const lo = r.first > X.from ? r.first : X.from, hi = r.last < X.to ? r.last : X.to;
  return lo > hi ? 0 : (daysBetween(lo, hi) + 1) / (daysBetween(X.from, X.to) + 1);
}
const dpVal = (dps, m) => {
  if (m.dps) { const xs = m.dps.map(id => num(dps?.[id]?.value)); return xs.every(x => x != null) ? sum(xs) : null; }
  return m.dp ? num(dps?.[m.dp]?.value) : null;
};
function periodColumn(d, X, isSel) {
  const c = closingRow(d, X.key), h = historyRowFor(d, X);
  const live = isSel || registerCoverage(d, X) >= 0.5 ? vsmeReport(d, X) : null;
  const liveDps = live ? Object.fromEntries(live.items.filter(i => i.hasValue).map(i => [i.id, i])) : null;
  let fin = null;
  if (X.from.slice(8) === '01') { try { fin = frozenFor(d, monthsIn(X)); } catch { fin = null; } }
  const runsT = live ? sum((d.runs || EMPTY).filter(r => r.date >= X.from && r.date <= X.to), r => +r.tonnes || 0) : 0;
  const v = {}, src = {};
  for (const m of HISTORY_METRICS) {
    let x = null, s = null;
    if (c?.status === 'approvato') { x = m.key === 'tonnes' ? num(c.kpis?.tonnes) : dpVal(c.datapoints, m); if (x != null) s = 'chiusura'; }
    if (x == null && h && num(h[m.key]) != null) { x = num(h[m.key]); s = 'storico'; }
    if (x == null && live) {
      x = m.key === 'tonnes' ? (runsT > 0 ? round(runsT, 1) : null) : dpVal(liveDps, m);
      if (x != null) s = live.frozen ? 'chiusura' : 'calcolato';
    }
    if (x == null && fin && (m.key === 'revenueNet' || m.key === 'tonnes')) { x = m.key === 'revenueNet' ? round(fin.revenueNet) : round(fin.tonnes, 1); if (x) s = 'gestionale'; else x = null; }
    if (x == null && c && isObj(c.datapoints)) { x = dpVal(c.datapoints, m); if (x != null) s = 'istantanea'; }
    v[m.key] = x; src[m.key] = s;
  }
  if (v.recoveryPct == null && v.diverted != null && v.wasteT > 0) { v.recoveryPct = (v.diverted / v.wasteT) * 100; src.recoveryPct = src.diverted; }
  for (const k of DERIVED) { v[k.key] = k.f(v); src[k.key] = v[k.key] == null ? null : src.s1 || src.tonnes || src.recordable || null; }
  return { v, src };
}
/** Tre esercizi (dal più vecchio): {periods, rows: [{key, label, unit, good, values: [{value, source}] ×3, delta}], hasHistory}. */
export function threeYear(d, Pin) {
  const P = esgPeriodFor(d, Pin);
  return memo(d, `hist|${P.key}`, () => {
    const p1 = previousPeriod(d, P.key), p2 = p1 ? previousPeriod(d, p1.key) : null;
    const periods = [p2, p1, P].filter(Boolean);
    const cols = periods.map(X => periodColumn(d, X, X.key === P.key));
    const all = [...HISTORY_METRICS.filter(m => !m.hidden), ...DERIVED];
    const rows = ROW_ORDER.map(k => all.find(m => m.key === k)).filter(Boolean).map(m => {
      const values = cols.map(c => ({ value: c.v[m.key] ?? null, source: c.src[m.key] ?? null }));
      const cur = values.at(-1)?.value, prev = values.at(-2)?.value;
      return { key: m.key, label: { it: T(`report.h.${m.key}`, {}, 'it'), en: T(`report.h.${m.key}`, {}, 'en') }, unit: m.unit, good: m.good, values,
        delta: cur != null && prev != null ? { abs: cur - prev, pct: prev ? (cur - prev) / Math.abs(prev) : null } : null };
    });
    return { periods, rows, hasHistory: periods.some(X => historyRowFor(d, X)), live: rows.some(r => r.values.at(-1)?.value != null) };
  });
}
/** Storico dichiarato di un esercizio passato (valori ≥ 0): aggiorna la riga esistente o ne aggiunge una con id = chiave del periodo. */
export function historyOps(d, Xin, values, note = '') {
  const X = typeof Xin === 'string' ? periodByKey(d, Xin) : Xin;
  if (!X?.key) return fail('Esercizio non valido.');
  const keys = HISTORY_METRICS.map(m => m.key).filter(k => k !== 'diverted');
  const clean_ = {};
  for (const k of keys) {
    const x = values?.[k];
    if (x == null || x === '') continue;
    const n = num(x);
    if (n == null || n < 0) return fail(`Valore non valido per ${T(`report.h.${k}`)}.`);
    clean_[k] = n;
  }
  if (!Object.keys(clean_).length) return fail('Inserisci almeno un valore.');
  const cur = historyRowFor(d, X);
  const patch = { ...clean_, source: 'storico dichiarato', note: String(note || cur?.note || '').trim() };
  return cur ? { ok: true, ops: [{ kind: 'update', coll: 'esgHistory', id: cur.id, patch }], label: `Storico ESG «${X.label}» aggiornato` }
    : { ok: true, ops: [{ kind: 'add', coll: 'esgHistory', obj: { id: X.key, periodKey: X.key, from: X.from, to: X.to, label: X.label, ...patch } }], label: `Storico ESG «${X.label}» dichiarato` };
}

/* ---------------- pacchetto per la banca ---------------- */
const BANK = {
  profilo: ['B1.legal-form', 'B1.nace', 'B1.country', 'B1.sites-geo', 'B1.employees', 'B1.turnover', 'B1.balance-sheet', 'B1.certifications'],
  obiettivi: ['C3.targets', 'C3.actions', 'C3.transition-plan', 'B2.climate'],
  rischi: ['C4.hazards', 'C4.exposure', 'C4.horizons', 'C4.adaptation', 'C4.financial', 'B5.sites-sensitive'],
  persone: ['B8.by-contract', 'B8.by-gender', 'B9.recordable-rate', 'B9.fatalities', 'B10.min-wage', 'B10.ccnl', 'B10.training-h'],
  ambiente: ['B6.withdrawal', 'B7.waste-haz', 'B7.waste-nonhaz', 'B7.diverted', 'B4.pollutants'],
  governance: ['C2.accountable', 'C9.board-ratio', 'C6.code', 'C6.grievance', 'B11.convictions', 'B11.fines', 'B2.business-conduct'],
};
const BANK_HIST = ['mwh', 'mwhRen', 's1', 's2lb', 's2mb', 's12', 'intT', 'intRev'];
/** Indice delle evidenze dei datapoint indicati: evidenze citate dai valori e collegate nel registro (tipo datapoint o vs). */
export function evidenceRows(d, rep, ids) {
  const reg = Object.fromEntries((Array.isArray(d?.evidence) ? d.evidence : EMPTY).map(e => [String(e.id), e]));
  const by = new Map();
  const add = (eid, dpId) => { const k = String(eid); if (!by.has(k)) by.set(k, new Set()); by.get(k).add(dpId); };
  for (const id of ids) {
    for (const e of rep.byId[id]?.evidence || EMPTY) add(e, id);
    for (const e of [...evidenceFor(d, 'datapoint', id), ...evidenceFor(d, 'vs', id)]) add(e.id, id);
  }
  return [...by.entries()].map(([id, set]) => { const e = reg[id] || {}; return { id, title: e.title || e.name || id, kind: e.kind || e.type || '', date: e.date || e.issuedAt || '', expiry: e.expiry || e.expiresAt || e.validTo || '', sha256: e.sha256 || e.hash || '', dpIds: [...set] }; });
}
/** Pacchetto ESG per la banca: profilo, energia ed emissioni su tre esercizi, obiettivi, rischi, persone, ambiente, governance, evidenze, lacune. */
export function bankPack(d, Pin, opts = {}) {
  const lg = opts.lang === 'en' ? 'en' : 'it';
  const P = esgPeriodFor(d, Pin);
  const rep = vsmeReport(d, P), hist = threeYear(d, P);
  const row = id => {
    const x = rep.byId[id];
    const text = x?.hasValue ? itemText(x, lg) : x?.status === 'omesso' ? `${T('report.dp.omesso', {}, lg)}: ${x.omission.note}` : x?.status === 'non-applicabile' ? `${T('report.notApplicable', {}, lg)} (${x.condText})` : '—';
    return { id, label: dpLabel(id, lg), text, quality: x?.hasValue ? T(`quality.${x.quality}`, {}, lg) : '', source: x?.hasValue ? sourceText(x, lg) : '', status: x?.status || 'mancante', missing: !x?.hasValue && x?.status !== 'omesso' && x?.status !== 'non-applicabile' };
  };
  const extraRisk = rep.extras.filter(e => e.disc === 'C4').map(e => e.id);
  const sec = (id, ids) => ({ id, rows: ids.map(row) });
  const usedIds = [...Object.values(BANK).flat(), ...extraRisk, 'B3.intensity'];
  const sections = [
    sec('profilo', BANK.profilo),
    { id: 'energia', table: { periods: hist.periods, rows: hist.rows.filter(r => BANK_HIST.includes(r.key)) }, rows: [row('B3.intensity')] },
    sec('obiettivi', BANK.obiettivi), { id: 'rischi', rows: [...BANK.rischi, ...extraRisk].map(id => (VS_DP[id] ? row(id) : { id, label: rep.byId[id].label, text: itemText(rep.byId[id], lg), quality: T(`quality.${rep.byId[id].quality}`, {}, lg), source: sourceText(rep.byId[id], lg), status: 'coperto' })) },
    sec('persone', BANK.persone), sec('ambiente', BANK.ambiente), sec('governance', BANK.governance),
    { id: 'evidenze', evidence: evidenceRows(d, rep, usedIds) },
    { id: 'lacune', rows: rep.gaps.filter(g => usedIds.includes(g.id)).map(g => row(g.id)) },
  ];
  const cl = rep.closing;
  const date = cl?.approvedAt || cl?.frozenAt || '';
  return { period: P, report: rep, history: hist, sections, pmi: pmiStatus(d),
    meta: { company: rep.meta.company, site: rep.meta.site, periodText: T('report.period', { period: P.label, from: dateIt(P.from), to: dateIt(P.to) }, lg),
      statusText: T(`report.status.${cl ? cl.status.replace(' ', '-') : 'aperto'}`, { date: date ? dateIt(String(date).slice(0, 10)) : '—' }, lg), hash: cl?.hash || null } };
}

/* ---------------- questionari ---------------- */
/** Questionari con le risposte dell'esercizio (risposte dai datapoint, approvate se l'esercizio è chiuso). */
export function questionnaireList(d, today = esgToday(d)) {
  return (Array.isArray(d?.questionnaires) ? d.questionnaires : EMPTY).filter(q => q && q.id).map(q => {
    const rep = vsmeReport(d, q.periodKey && PKEY.test(q.periodKey) ? q.periodKey : currentPeriod(d));
    const f = fillQuestionnaire(q, rep);
    const days = q.dueAt ? daysBetween(today, q.dueAt) : null;
    return { ...q, filled: f, stats: f.stats, days, open: Q_OPEN.has(q.status || 'in compilazione') };
  }).sort((a, b) => (a.open !== b.open ? (a.open ? -1 : 1) : String(a.dueAt || '9999') < String(b.dueAt || '9999') ? -1 : 1));
}

/* ---------------- frozen exports del contratto ---------------- */
const R_LINK = { area: 'esg', tab: 'vsme', id: 'vsme' };
const hasOperational = d => !!dataRange(d);

/** Segnali per «Oggi»: chiusura in ritardo, approvazione in attesa, questionari in scadenza, copertura bassa, dati cambiati dopo l'approvazione. */
export function reportSignals(d, ctx) {
  const out = [];
  if (!d || !hasOperational(d)) return out;
  const today = ctx?.today || esgToday(d);
  const P = currentPeriod(d);
  const periods = reportPeriods(d);
  // chiusure: in ritardo (fine esercizio più di 60 giorni fa, non approvata) e in attesa di revisione o approvazione
  for (const X of periods) {
    const c = closingRow(d, X.key);
    const ended = daysBetween(X.to, today);
    const annual = X.mode === 'anno' || !!c;
    if (annual && ended > 60 && c?.status !== 'approvato' && (c || X.key === P.key)) {
      out.push({ key: `report:close-due:${X.key}`, area: 'esg', roles: ['direzione', 'qualita'], severity: 'attenzione', title: `Esercizio ESG «${X.label}» non ancora approvato`,
        why: `L’esercizio è finito il ${dateIt(X.to)} (${ended} giorni fa)${c ? `; stato della chiusura: ${c.status}` : '; i dati non sono ancora stati congelati'}. Banche e clienti chiedono i numeri approvati dell’anno.`,
        action: 'Aprire Report e questionari › Esercizio: preparare l’istantanea, farla rivedere e approvare da un ruolo diverso.', impact: 7e4, link: { area: 'esg', tab: 'vsme', id: 'esercizio' } });
    } else if (c?.status === 'in revisione') {
      const step = c.reviewedBy ? 'approvazione' : 'revisione';
      out.push({ key: `report:approval-pending:${X.key}`, area: 'esg', roles: ['direzione', 'qualita'], severity: 'info', title: `Chiusura ESG «${X.label}»: in attesa di ${step}`,
        why: `Dati congelati il ${dateIt(String(c.frozenAt || '').slice(0, 10))} da ${SIGN_ROLES[c.preparedBy] || c.preparedBy}${c.reviewedBy ? `, rivisti da ${SIGN_ROLES[c.reviewedBy] || c.reviewedBy}` : ''}; manca ${step === 'revisione' ? 'la revisione' : 'l’approvazione'} di un ruolo diverso.`,
        action: `Aprire Report e questionari › Esercizio e registrare ${step === 'revisione' ? 'la revisione' : 'l’approvazione'}.`, impact: 3e4, link: { area: 'esg', tab: 'vsme', id: 'esercizio' } });
    }
    if (c?.status === 'approvato') {
      const diff = frozenVsLive(d, X.key);
      if (diff.n) out.push({ key: `report:changed-after-close:${X.key}`, area: 'esg', roles: ['direzione'], severity: 'attenzione', title: `Dati cambiati dopo l’approvazione di «${X.label}»`,
        why: `${diff.n} ${diff.n === 1 ? 'valore è diverso' : 'valori sono diversi'} dall’istantanea approvata (${diff.changes.slice(0, 3).map(x => x.id).join(', ')}${diff.n > 3 ? '…' : ''}). Il rapporto approvato resta quello congelato.`,
        action: 'Verificare le modifiche: se sono correzioni, riaprire l’esercizio con una nota e approvarlo di nuovo.', impact: 6e4, link: { area: 'esg', tab: 'vsme', id: 'esercizio' } });
    }
  }
  // questionari in scadenza (attenzione entro 7 giorni o scaduti, informazione entro 30)
  for (const q of questionnaireList(d, today)) {
    if (!q.open || q.days == null || q.days > 30) continue;
    const s = q.stats;
    out.push({ key: `report:questionnaire-due:${q.id}`, area: 'esg', roles: ['qualita', 'commerciale'], severity: q.days <= 7 ? 'attenzione' : 'info',
      title: `Questionario «${q.title}»${q.requester ? ` per ${q.requester}` : ''}: ${q.days < 0 ? `scaduto da ${-q.days} giorni` : q.days === 0 ? 'scade oggi' : `scade tra ${q.days} giorni`}`,
      why: `${s.answered} voci su ${s.total} con risposta, ${s.todo} da completare${s.beyond ? `, ${s.beyond} oltre il VS` : ''}${s.transcribe ? `, ${s.transcribe} da trascrivere` : ''}.`,
      action: 'Aprire il questionario, controllare le risposte automatiche e scaricare il CSV per l’invio.', impact: q.days <= 7 ? 5e4 : 2e4, link: { area: 'esg', tab: 'vsme', id: `questionari.${q.id}` } });
  }
  // copertura del rapporto dell'esercizio corrente
  const rep = vsmeReport(d, P);
  const cov = rep.coverage.total;
  if (cov.required && cov.pct < 0.8) {
    out.push({ key: `report:coverage:${P.key}`, area: 'esg', roles: ['qualita'], severity: 'info', title: `Rapporto VS al ${pctTxt(cov.pct)} per «${P.label}»`,
      why: `${cov.required - cov.covered} datapoint obbligatori senza valore né omissione motivata, per esempio ${rep.gaps.slice(0, 3).map(g => `${g.id} ${g.label.it.toLowerCase()}`).join('; ')}.`,
      action: 'Completare dalle schede indicate accanto a ogni datapoint, oppure rispondere o motivare l’omissione nella lista del report.', impact: 1.5e4, link: R_LINK });
  }
  return out;
}

/** Sintesi ESG per il CdA e il Rapporto ESG: copertura, qualità dei dati, stato della chiusura, maturità, variazioni, scadenze. */
export function reportReportSection(d, ctx, Pin, C) {
  if (!d || !hasOperational(d)) return null;
  const P = esgPeriodFor(d, Pin);
  const rep = vsmeReport(d, P), hist = threeYear(d, P);
  const today = ctx?.today || esgToday(d);
  const st = p => (p == null ? null : p >= 0.9 ? 'ok' : p >= 0.7 ? 'warn' : 'bad');
  const cl = rep.closing;
  let maturity = null;
  try { maturity = memo(d, `mat|${P.key}`, () => overview(d, P, computeKpis(d, P))?.score?.score ?? null); } catch { maturity = null; }
  const kpis = [
    { label: 'Copertura VS, modulo Basic', value: rep.coverage.B.pct, unit: '%', decimals: 0, status: st(rep.coverage.B.pct), note: `${rep.coverage.B.covered} di ${rep.coverage.B.required} datapoint obbligatori` },
    ...(rep.withC ? [{ label: 'Copertura VS, modulo Comprehensive', value: rep.coverage.C.pct, unit: '%', decimals: 0, status: st(rep.coverage.C.pct) }] : []),
    { label: 'Dati misurati o calcolati', value: rep.measured.pct, unit: '%', decimals: 0, status: rep.measured.pct == null ? null : rep.measured.pct >= 0.7 ? 'ok' : rep.measured.pct >= 0.5 ? 'warn' : 'bad' },
    { label: 'Chiusura dell’esercizio', value: cl ? cl.status : 'aperto', unit: '', status: cl?.status === 'approvato' ? 'ok' : cl ? 'warn' : null },
    ...(maturity != null ? [{ label: 'Maturità ESG', value: maturity, unit: 'punti', decimals: 0 }] : []),
  ];
  const keys = ['s12', 'intT', 'mwh', 'waterM3', 'recoveryPct', 'rate'];
  const rows = hist.rows.filter(r => keys.includes(r.key) && r.values.at(-1)?.value != null).slice(0, 5).map(r => ({
    voce: r.label.it, unita: r.unit, prec: r.values.at(-2)?.value ?? null, att: r.values.at(-1)?.value ?? null, var: r.delta?.pct ?? null }));
  const narrative = [];
  narrative.push(`Esercizio ESG «${P.label}»: copertura del rapporto VS ${pctTxt(rep.coverage.B.pct)} nel modulo Basic${rep.withC ? ` e ${pctTxt(rep.coverage.C.pct)} nel Comprehensive` : ''}; ${pctTxt(rep.measured.pct)} dei valori è misurato o calcolato.`);
  narrative.push(cl ? `Chiusura ${cl.status}${cl.frozenAt ? `, dati congelati il ${dateIt(String(cl.frozenAt).slice(0, 10))}` : ''}${cl.hash ? ` (impronta ${cl.hash.slice(0, 12)}…)` : ''}${cl.approvedAt ? `, approvata il ${dateIt(String(cl.approvedAt).slice(0, 10))}` : ''}.` : 'L’esercizio non è ancora chiuso: i numeri sono provvisori.');
  for (const r of hist.rows.filter(x => ['s12', 'intT'].includes(x.key))) {
    const cur = r.values.at(-1)?.value, prev = r.values.at(-2)?.value;
    if (cur != null && prev != null) narrative.push(`${r.label.it}: ${deltaPhrase(cur, prev, { good: r.good, unit: r.unit })}.`);
  }
  if (rep.gaps.length) narrative.push(`Da completare: ${rep.gaps.length} datapoint obbligatori (${rep.gaps.slice(0, 4).map(g => g.id).join(', ')}${rep.gaps.length > 4 ? '…' : ''}).`);
  const due = calendarAll(d, today, reportCalendarItems(d, today)).filter(i => i.date < today && i.kind === 'scadenza');
  const open = questionnaireList(d, today).filter(q => q.open);
  if (due.length || open.length) narrative.push(`${due.length ? `${due.length} scadenze ESG superate` : 'Nessuna scadenza ESG superata'}; ${open.length} questionari aperti${open.some(q => q.days != null && q.days <= 7) ? ', almeno uno in scadenza entro una settimana' : ''}.`);
  return { id: 'esg-sintesi', title: 'Sintesi ESG', order: 80, kpis,
    table: rows.length ? { cols: [{ key: 'voce', label: 'Indicatore', fmt: 'text' }, { key: 'prec', label: 'Esercizio precedente', align: 'r', fmt: 'num' }, { key: 'att', label: 'Esercizio', align: 'r', fmt: 'num' }, { key: 'unita', label: 'Unità', fmt: 'text' }, { key: 'var', label: 'Variazione', align: 'r', fmt: 'pcts' }], rows } : undefined,
    narrative };
}

/** Indicatori del catalogo: copertura del rapporto VS e quota di dati misurati o calcolati (fonte di copertura: le campagne). */
export const REPORT_KPIS = [
  { id: 'esg-vsme-copertura', label: 'Copertura del rapporto VS', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'vsme', id: 'vsme' }, decimals: 0, hist: false, src: 'runs',
    def: 'Datapoint obbligatori del VS (B1-B11, più C1-C9 se si rendiconta anche il modulo Comprehensive) con un valore o un’omissione motivata ÷ datapoint obbligatori applicabili, nell’esercizio ESG che contiene il periodo.',
    compute: (d, ctx, P) => (hasOperational(d) ? vsmeReport(d, P).coverage.total.pct : null) },
  { id: 'esg-dati-misurati', label: 'Dati ESG misurati o calcolati', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'vsme', id: 'vsme' }, decimals: 0, hist: false, src: 'runs',
    def: 'Datapoint del VS con un valore di qualità «misurato» o «calcolato» ÷ datapoint con un valore (gli altri sono stimati, dichiarati o predefiniti).',
    compute: (d, ctx, P) => (hasOperational(d) ? vsmeReport(d, P).measured.pct : null) },
];

/** Regole della qualità dei dati R35-R37. */
export const REPORT_RULES = [
  { id: 'R35', area: 'esg', severity: 'info', weight: 2, scope: ['all', 'closing'], label: 'Energia ed emissioni del rapporto VS stimate per più del 30%',
    check: d => {
      if (!d || !hasOperational(d)) return { base: 0, fails: [] };
      const rep = vsmeReport(d, currentPeriod(d));
      const b3 = rep.items.filter(i => i.disc === 'B3' && i.hasValue);
      const est = b3.filter(i => i.quality === 'stimato' || i.quality === 'default');
      return { base: b3.length, fails: b3.length && est.length / b3.length > 0.3 ? est.map(i => ({ id: i.id, coll: 'esgAnswers', msg: `${i.id} ${i.label.it}: valore ${i.quality === 'default' ? 'predefinito' : 'stimato'}`, link: { area: 'esg', tab: i.link.tab, id: i.link.id } })) : [] };
    } },
  { id: 'R36', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing'], label: 'Esercizio ESG approvato con dati cambiati dopo l’approvazione',
    check: d => {
      const ap = (Array.isArray(d?.esgClosings) ? d.esgClosings : EMPTY).filter(c => c?.status === 'approvato');
      const fails = [];
      for (const c of ap) { const x = frozenVsLive(d, c.id); if (x.n) fails.push({ id: c.id, coll: 'esgClosings', msg: `Esercizio ${c.label || c.id}: ${x.n} valori cambiati dopo l’approvazione`, link: { area: 'esg', tab: 'vsme', id: 'esercizio' } }); }
      return { base: ap.length, fails };
    } },
  { id: 'R37', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all'], label: 'Risposta a un questionario diversa dal valore approvato',
    check: d => {
      let base = 0;
      const fails = [];
      for (const q of Array.isArray(d?.questionnaires) ? d.questionnaires : EMPTY) {
        const c = closingRow(d, q?.periodKey);
        if (!c || c.status !== 'approvato') continue;
        base += (q.items || EMPTY).filter(it => it && typeof it.override === 'string' && it.override.trim() && (it.dpIds || EMPTY).length === 1).length;
        for (const x of overrideConflicts(q, c)) fails.push({ id: `${q.id}:${x.qid}`, coll: 'questionnaires', msg: `Questionario «${q.title}», voce ${x.qid}: risposta ${nf(x.override, 2)} diversa dal valore approvato ${nf(x.approved, 2)} (${x.dpId})`, link: { area: 'esg', tab: 'vsme', id: `questionari.${q.id}` } });
      }
      return { base, fails };
    } },
];

/** Datapoint del VS forniti dal report (profilo B1, mercati e relazioni del C1, risposte ai datapoint propri). */
export function reportDatapoints(d, P) { return ownDatapoints(d, P); }

/** Scadenze: chiusura dell'esercizio (60 giorni dopo la fine), questionari aperti, rinnovi dei rating, tetto della catena del valore. */
export function reportCalendarItems(d, today) {
  const out = [];
  if (!d) return out;
  const P = currentPeriod(d);
  const seen = new Set();
  for (const X of [P, ...(Array.isArray(d.esgClosings) ? d.esgClosings : EMPTY).map(c => periodByKey(d, c?.id)).filter(Boolean)]) {
    if (seen.has(X.key)) continue;
    seen.add(X.key);
    const c = closingRow(d, X.key);
    if (c?.status === 'approvato' || (!c && !hasOperational(d))) continue;
    out.push({ key: `report:chiusura:${X.key}`, date: addDays(X.to, 60), title: `Chiusura ESG «${X.label}»: preparazione, revisione e approvazione`, area: 'esg', pkg: 'report', kind: 'scadenza',
      owner: 'Qualità e sicurezza alimentare', source: 'Procedura interna di FeedOS (quattro occhi)', link: { area: 'esg', tab: 'vsme', id: 'esercizio' } });
  }
  for (const q of Array.isArray(d.questionnaires) ? d.questionnaires : EMPTY) {
    if (!q?.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(q.dueAt || ''))) continue;
    if (Q_OPEN.has(q.status || 'in compilazione')) out.push({ key: `report:questionario:${q.id}`, date: q.dueAt, title: `Risposta al questionario «${q.title}»${q.requester ? ` (${q.requester})` : ''}`, area: 'esg', pkg: 'report', kind: 'scadenza', owner: 'Qualità e sicurezza alimentare', link: { area: 'esg', tab: 'vsme', id: `questionari.${q.id}` } });
    else if (['ecovadis-temi', 'synesgy', 'open-es'].includes(q.kind) && q.sentAt && /^\d{4}-\d{2}-\d{2}/.test(q.sentAt)) out.push({ key: `report:rinnovo:${q.id}`, date: addDays(String(q.sentAt).slice(0, 10), 365), title: `Rinnovo annuale: ${q.title}`, area: 'esg', pkg: 'report', kind: 'rinnovo', link: { area: 'esg', tab: 'vsme', id: 'questionari' } });
  }
  out.push({ key: 'report:vs-tetto-2027', date: '2027-01-01', title: 'Dall’esercizio 2027 le richieste CSRD alla catena del valore (imprese fino a 1.000 dipendenti) si fermano al VS', area: 'esg', pkg: 'report', kind: 'traguardo',
    law: 'Direttiva (UE) 2026/470 (Omnibus I); Regolamento delegato (UE) 2026/1560', source: 'Gazzetta ufficiale dell’Unione europea', validAsOf: '2026-10-21', link: { area: 'esg', tab: 'vsme', id: 'questionari' } });
  return out;
}

/** Riepilogo per la pagina e il riquadro del cruscotto. */
export function reportSummary(d, Pin) {
  if (!d) return null;
  const P = esgPeriodFor(d, Pin);
  const rep = vsmeReport(d, P);
  const today = esgToday(d);
  const qs = questionnaireList(d, today);
  const mrows = materialityRows(d, P.key);
  const mx = mrows ? materialityMatrix(mrows, rep.settings.threshold, iroLibrary(d)) : null;
  return { period: P, key: P.key, label: P.label, option: rep.option, status: rep.closing?.status || 'aperto', closing: rep.closing, coverage: rep.coverage, measured: rep.measured, quality: rep.quality,
    gaps: rep.gaps.length, topGaps: rep.gaps.slice(0, 5), operational: hasOperational(d),
    questionnaires: { total: qs.length, open: qs.filter(q => q.open).length, dueSoon: qs.filter(q => q.open && q.days != null && q.days >= 0 && q.days <= 7).length, overdue: qs.filter(q => q.open && q.days != null && q.days < 0).length },
    materiality: mx ? { assessed: mx.points.length, material: mx.material } : null, history: threeYear(d, P).hasHistory };
}
