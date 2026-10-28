/* FeedOS 18 · Report e questionari (pacchetto WP4): questionari di clienti, banche e piattaforme di rating, e analisi di materialità.
 * Questionari: importazione da CSV, collegamento automatico delle domande ai datapoint del VS (punteggio deterministico su parole
 * chiave e sinonimi in italiano e in inglese, più indizi dalle unità), compilazione dalle risposte del report con le correzioni
 * manuali, segnalazione delle voci oltre il VS con il testo sul limite della catena del valore (dal 2027, solo per richieste
 * ai fini CSRD: non rifiuta mai da solo), CSV delle risposte e indice delle evidenze.
 * Materialità: libreria di impatti, rischi e opportunità filtrata per settore, punteggi secondo ESRS 1 (gravità = scala,
 * estensione, irrimediabilità; probabilità per gli impatti potenziali; rilevanza finanziaria = entità × probabilità), matrice
 * e mappa dei temi materiali verso le informative del VS. Funzioni pure. */
import { parseCSV, toCSV, num } from '../core/io.js';
import { norm, slug } from '../core/util.js';
import { T } from './esg-nlg.js';
import { packItems } from './esg-packs.js';
import { sectorOf } from './esg-years.js';
import { VS_DP, VS_DATAPOINTS, VS_DISCLOSURES } from '../data/vsme-datapoints.js';
import { PACK_REPORT, PACK_REPORT_PMI, PACK_REPORT_IRO, ESRS_TOPICS } from '../data/pack-report.js';
import { itemText, dpLabel } from './esg-report-text.js';

const EMPTY = [];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const L = lang => (lang === 'en' ? 'en' : 'it');

/** Tipi di questionario. */
export const Q_KINDS = {
  'pmi-banche': 'Documento PMI-Banche', cliente: 'Questionario di un cliente', 'ecovadis-temi': 'EcoVadis (per temi)', synesgy: 'Rating ESG bancario (per temi)',
  'open-es': 'Open-es (per temi)', sdp: 'Filiera del latte (per temi)', altro: 'Altro questionario',
};
export const Q_STATUS = ['ricevuto', 'in compilazione', 'inviato', 'chiuso'];
export const Q_OPEN = new Set(['ricevuto', 'in compilazione']);

/* ---------------- collegamento domanda → datapoint ---------------- */
/** Parole chiave per datapoint (normalizzate: minuscole, senza accenti). */
export const KEYWORDS = {
  'B1.legal-form': ['forma giuridica', 'ragione sociale', 'legal form'],
  'B1.nace': ['nace', 'ateco', 'codice attivita', 'settore di attivita', 'sector code'],
  'B1.turnover': ['fatturato', 'ricavi', 'turnover', 'revenue', 'volume d affari'],
  'B1.balance-sheet': ['stato patrimoniale', 'totale attivo', 'balance sheet', 'total assets'],
  'B1.employees': ['numero di dipendenti', 'dipendenti', 'addetti', 'organico', 'employees', 'headcount', 'workforce size', 'forza lavoro'],
  'B1.country': ['paese', 'sede', 'country', 'location'],
  'B1.sites-geo': ['siti produttivi', 'stabilimenti', 'geolocalizzazione', 'coordinate', 'sites', 'plants', 'geolocation', 'ubicazione'],
  'B1.certifications': ['certificazioni', 'certificazione', 'iso 14001', 'iso 50001', 'iso 45001', 'emas', 'certification', 'certifications', 'marchi'],
  'B2.climate': ['politica climatica', 'politica sul clima', 'climate policy', 'politica ambientale', 'environmental policy'],
  'B2.own-workforce': ['politica del personale', 'politiche per i dipendenti', 'hr policy', 'workforce policy'],
  'B2.business-conduct': ['politica anticorruzione', 'anti corruption policy', 'condotta aziendale'],
  'B3.mwh': ['consumo di energia', 'consumi energetici', 'energia consumata', 'consumo energetico', 'energy consumption', 'energia totale', 'total energy'],
  'B3.mwh-el': ['energia elettrica', 'elettricita', 'electricity consumption', 'electricity'],
  'B3.mwh-ren-el': ['energia rinnovabile', 'elettricita rinnovabile', 'fonti rinnovabili', 'fotovoltaico', 'renewable energy', 'renewable electricity', 'garanzie di origine'],
  'B3.mwh-fuel': ['combustibili', 'gas naturale', 'gasolio', 'gpl', 'fuels', 'fuel consumption'],
  'B3.s1': ['scope 1', 'emissioni dirette', 'direct emissions', 'scope 1 e 2', 'scope 1 and 2'],
  'B3.s2-lb': ['scope 2', 'location based', 'emissioni indirette', 'indirect emissions', 'scope 1 e 2', 'scope 1 and 2'],
  'B3.s2-mb': ['market based', 'scope 2 market'],
  'B3.s3': ['scope 3', 'catena del valore', 'value chain emissions', 'emissioni indirette della catena'],
  'B3.intensity': ['intensita', 'intensity', 'per milione di euro', 'per fatturato', 'per revenue', 'carbon intensity'],
  'B4.pollutants': ['inquinanti', 'emissioni in atmosfera', 'polveri', 'pollutants', 'air emissions', 'scarichi'],
  'B5.sites-sensitive': ['biodiversita', 'aree protette', 'natura 2000', 'aree sensibili', 'biodiversity', 'protected areas'],
  'B6.withdrawal': ['prelievo idrico', 'prelievi idrici', 'acqua prelevata', 'consumo di acqua', 'consumi idrici', 'water withdrawal', 'water consumption', 'acqua'],
  'B6.withdrawal-stress': ['stress idrico', 'water stress'],
  'B6.consumption': ['consumo idrico netto', 'acqua consumata', 'water consumed'],
  'B7.circular': ['economia circolare', 'circular economy', 'circolarita', 'riciclo dei materiali', 'coprodotti'],
  'B7.waste-haz': ['rifiuti pericolosi', 'hazardous waste'],
  'B7.waste-nonhaz': ['rifiuti non pericolosi', 'rifiuti prodotti', 'rifiuti totali', 'non hazardous waste', 'waste generated', 'rifiuti'],
  'B7.diverted': ['recupero', 'riciclo', 'riutilizzo', 'recycling', 'recycled', 'diverted', 'avviati a recupero'],
  'B7.mass-flow': ['flusso di massa', 'materiali utilizzati', 'materie prime utilizzate', 'mass flow', 'materials used'],
  'B8.by-contract': ['tempo indeterminato', 'tempo determinato', 'tipo di contratto', 'permanent', 'temporary', 'contratti'],
  'B8.by-gender': ['donne', 'genere', 'gender', 'women', 'female', 'uomini'],
  'B8.turnover': ['turnover', 'rotazione del personale', 'tasso di uscita', 'employee turnover'],
  'B9.recordable': ['infortuni', 'incidenti sul lavoro', 'injuries', 'accidents', 'numero di infortuni'],
  'B9.recordable-rate': ['tasso di infortuni', 'indice di frequenza', 'injury rate', 'ltifr', 'trir', 'frequenza degli infortuni', 'accident rate'],
  'B9.fatalities': ['decessi', 'infortuni mortali', 'fatalities', 'fatal'],
  'B10.min-wage': ['salario minimo', 'retribuzione minima', 'minimum wage'],
  'B10.pay-gap': ['divario retributivo', 'gender pay gap', 'pay gap', 'differenza retributiva'],
  'B10.ccnl': ['contratto collettivo', 'contrattazione collettiva', 'ccnl', 'collective bargaining', 'collective agreement'],
  'B10.training-h': ['ore di formazione', 'formazione', 'training hours', 'training'],
  'B11.convictions': ['condanne', 'corruzione', 'convictions', 'bribery', 'corruption'],
  'B11.fines': ['sanzioni', 'multe', 'fines', 'penalties'],
  'C1.products': ['prodotti', 'servizi', 'products', 'portfolio'],
  'C1.markets': ['mercati', 'markets', 'clienti principali per area'],
  'C1.relationships': ['clienti principali', 'fornitori principali', 'key customers', 'key suppliers', 'relazioni commerciali'],
  'C1.strategy': ['strategia', 'strategy', 'piano di sostenibilita', 'sustainability strategy'],
  'C2.accountable': ['responsabile della sostenibilita', 'responsabilita della sostenibilita', 'sustainability manager', 'accountable', 'chi e responsabile'],
  'C2.description': ['descrizione delle politiche', 'description of policies'],
  'C3.targets': ['obiettivi di riduzione', 'target di riduzione', 'obiettivi climatici', 'reduction targets', 'reduction target', 'sbti', 'net zero', 'anno base', 'base year'],
  'C3.actions': ['azioni di riduzione', 'piano di decarbonizzazione', 'decarbonisation', 'decarbonization', 'reduction actions'],
  'C3.transition-plan': ['piano di transizione', 'transition plan'],
  'C4.hazards': ['rischi climatici', 'rischio climatico', 'rischi fisici', 'climate risks', 'physical risks', 'alluvione', 'siccita'],
  'C4.adaptation': ['adattamento', 'adaptation'],
  'C5.mgmt-ratio': ['donne in posizioni', 'donne dirigenti', 'women in management', 'female managers', 'dirigenza'],
  'C5.agency': ['somministrati', 'interinali', 'agency workers', 'temporary agency'],
  'C5.self-employed': ['autonomi', 'collaboratori', 'self employed', 'freelance'],
  'C6.code': ['codice di condotta', 'codice etico', 'code of conduct', 'diritti umani', 'human rights', 'code of ethics'],
  'C6.grievance': ['meccanismo di reclamo', 'reclami dei dipendenti', 'whistleblowing', 'segnalazioni', 'grievance', 'complaints mechanism'],
  'C7.own-incidents': ['violazioni dei diritti umani', 'lavoro minorile', 'lavoro forzato', 'human rights incidents', 'child labour', 'forced labour'],
  'C7.value-chain': ['diritti umani nella catena di fornitura', 'supply chain human rights'],
  'C8.revenue-sectors': ['armi', 'tabacco', 'combustibili fossili', 'weapons', 'tobacco', 'fossil fuels'],
  'C9.board-ratio': ['consiglio di amministrazione', 'cda', 'board', 'donne nel consiglio', 'women on the board'],
};
const HINTS = [
  { re: /\bt ?co2 ?e?q?\b|\btco2e?\b|\bco2e\b|\bco2eq\b|\bghg\b|\bgas serra\b/, add: { 'B3.s1': 1.5, 'B3.s2-lb': 1.5, 'B3.s2-mb': 1, 'B3.s3': 1, 'B3.intensity': 0.5 } },
  { re: /\bmwh\b|\bkwh\b|\bgj\b|\btep\b/, add: { 'B3.mwh': 2, 'B3.mwh-el': 1, 'B3.mwh-ren-el': 0.5, 'B3.mwh-fuel': 0.5 } },
  { re: /\bm3\b|\bmc\b|\blitri\b|\bmegalitri\b/, add: { 'B6.withdrawal': 2, 'B6.consumption': 0.5 } },
  { re: /\bore\b|\bhours\b/, add: { 'B10.training-h': 0.5, 'B9.recordable-rate': 0.3 } },
];
const qnorm = s => ` ${norm(s).replace(/₂/g, '2').replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const KW = Object.entries(KEYWORDS).map(([id, ps]) => [id, ps.map(p => ({ p: ` ${qnorm(p).trim()} `, w: 2 + 2 * (qnorm(p).trim().split(' ').length - 1) }))]);

/**
 * Datapoint più probabili per una domanda: [{dpId, score, confidence, label}] (al massimo n, punteggio > 0, dal più alto).
 * confidence = punteggio ÷ (punteggio + 4): 0,5 con una frase di due parole, di più con l'unità coerente.
 */
export function suggestMapping(question, n = 3) {
  const q = qnorm(question);
  if (q.trim().length < 2) return [];
  const score = {};
  for (const [id, ps] of KW) for (const { p, w } of ps) if (q.includes(p)) score[id] = (score[id] || 0) + w;
  for (const h of HINTS) if (h.re.test(q)) for (const [id, w] of Object.entries(h.add)) if (score[id] || w >= 2) score[id] = (score[id] || 0) + w;
  return Object.entries(score).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || (VS_DP[a[0]]?.order ?? 999) - (VS_DP[b[0]]?.order ?? 999))
    .slice(0, n).map(([dpId, s]) => ({ dpId, score: Math.round(s * 10) / 10, confidence: Math.round((s / (s + 4)) * 100) / 100, label: dpLabel(dpId) }));
}
export const AUTO_MAP = 0.5;   // collegamento automatico all'importazione
export const SUGGEST_MIN = 0.3; // sotto questa soglia la domanda è proposta come «oltre il VS»

/* ---------------- importazione e modelli ---------------- */
const pick = (header, names) => header.find(h => names.includes(norm(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()));
/** Domande da un CSV (colonne riconosciute: id/codice, domanda/question, sezione/tema, unità). → {items, errors, columns} */
export function parseQuestionnaireCsv(text) {
  const { header, rows } = parseCSV(String(text || ''));
  if (!header.length) return { items: [], errors: ['Il file non contiene righe'], columns: {} };
  const cId = pick(header, ['id', 'codice', 'n', 'nr', 'numero', 'qid', 'question id', 'rif', 'riferimento', 'item']);
  let cText = pick(header, ['domanda', 'domande', 'question', 'questions', 'testo', 'richiesta', 'descrizione', 'quesito', 'text', 'item text', 'requisito']);
  const cSec = pick(header, ['sezione', 'section', 'tema', 'theme', 'categoria', 'category', 'area']);
  const cUnit = pick(header, ['unita', 'unit', 'unita di misura', 'udm', 'um']);
  let list = rows;
  if (!cText) {
    // senza intestazione riconosciuta: la colonna più lunga è la domanda e anche la prima riga è una domanda
    const others = header.filter(h => h !== cId && h !== cSec && h !== cUnit);
    cText = others.sort((a, b) => String(b).length - String(a).length)[0] || header[0];
    if (!cId && header.length === 1) list = [{ [cText]: header[0] }, ...rows];
  }
  const seen = new Set(), items = [];
  list.forEach((r, i) => {
    const textQ = String(r[cText] ?? '').trim();
    if (!textQ) return;
    let qid = String((cId ? r[cId] : '') || items.length + 1).trim().slice(0, 24) || String(i + 1);
    while (seen.has(qid)) qid += '·';
    seen.add(qid);
    items.push({ qid, text: textQ.slice(0, 600), section: cSec ? String(r[cSec] || '').trim().slice(0, 80) : '', unit: cUnit ? String(r[cUnit] || '').trim().slice(0, 24) : '' });
  });
  return { items, errors: items.length ? [] : ['Nessuna domanda riconosciuta: serve una colonna «domanda» o «question»'], columns: { id: cId || null, text: cText || null, section: cSec || null, unit: cUnit || null } };
}

/** Voce di questionario con il collegamento proposto: dpIds se la fiducia è alta, altrimenti suggerimenti o «oltre il VS». */
export function mapItem(it) {
  if (Array.isArray(it.dpIds) && it.dpIds.length) return { ...it, dpIds: it.dpIds.filter(id => VS_DP[id]) };
  const s = suggestMapping(`${it.text || ''} ${it.unit || ''}`);
  const best = s[0];
  if (best && best.confidence >= AUTO_MAP) return { ...it, dpIds: [best.dpId], suggested: s, beyondVs: false };
  if (best && best.confidence >= SUGGEST_MIN) return { ...it, dpIds: [], suggested: s, beyondVs: false };
  return { ...it, dpIds: [], suggested: s, beyondVs: it.beyondVs ?? true };
}

const uniqueId = (d, base) => { const ids = new Set((d?.questionnaires || EMPTY).map(q => q.id)); let i = 1, id = `${base}-${i}`; while (ids.has(id)) id = `${base}-${++i}`; return id; };

/** Operazione che aggiunge un questionario: meta = {title, kind, requester, customerId, receivedAt, dueAt, periodKey, note}. */
export function questionnaireOps(d, meta, items) {
  const title = String(meta?.title || '').trim();
  if (!title) return { ok: false, error: 'Serve un titolo per il questionario', ops: [] };
  const kind = Q_KINDS[meta?.kind] ? meta.kind : 'altro';
  const id = uniqueId(d, `q-${slug(meta?.requester || title).slice(0, 20) || 'questionario'}`);
  const rec = { id, kind, title: title.slice(0, 160), requester: String(meta?.requester || '').trim().slice(0, 120), customerId: meta?.customerId || null, receivedAt: meta?.receivedAt || null,
    dueAt: meta?.dueAt || null, periodKey: meta?.periodKey || null, status: 'in compilazione', note: String(meta?.note || ''), items: (items || EMPTY).map(it => {
      const m = mapItem(it);
      return { qid: String(m.qid), text: m.text ?? null, section: m.section || '', unit: m.unit || '', dpIds: m.dpIds || [], beyondVs: m.beyondVs ?? null, override: null, evidenceIds: [], status: m.status || undefined };
    }) };
  return { ok: true, id, record: rec, ops: [{ kind: 'add', coll: 'questionnaires', obj: rec }] };
}

/** Voci di un modello per tema (EcoVadis, rating bancario, Open-es, cliente) o della struttura PMI-Banche, filtrate per settore. */
export function templateItems(d, framework, lang = 'it') {
  const lg = L(lang), sec = sectorOf(d);
  if (framework === 'pmi-banche') {
    return packItems(d, 'report-pmi-banche', PACK_REPORT_PMI).map(x => ({ qid: x.id, text: x.text || null, section: x.section || '', dpIds: Array.isArray(x.dpIds) ? x.dpIds.filter(id => VS_DP[id]) : [], beyondVs: x.match === 'specifico banca' ? true : x.text ? !(x.dpIds || []).length : null, status: x.text ? undefined : 'da trascrivere' }));
  }
  return packItems(d, 'report', PACK_REPORT).filter(t => t.framework === framework && (!t.sectors || t.sectors.includes(sec)))
    .map(t => ({ qid: t.id, text: `${t.theme?.[lg] || t.theme?.it}: ${t.text?.[lg] || t.text?.it}`, section: t.theme?.[lg] || t.theme?.it || '', dpIds: t.dpIds || [], beyondVs: !!t.beyondVs }));
}
/** Stato della tavola PMI-Banche: voci trascritte su 40 e origine (integrata «da trascrivere» o importata). */
export function pmiStatus(d) {
  const items = packItems(d, 'report-pmi-banche', PACK_REPORT_PMI);
  const done = items.filter(x => x && x.text).length;
  const imported = d?.settings?.esg18?.packs?.['report-pmi-banche'];
  return { total: Math.max(40, items.length), transcribed: done, mapped: items.filter(x => (x.dpIds || []).length).length, status: done >= 40 ? 'trascritto' : done ? 'trascritto in parte' : 'da trascrivere',
    origin: imported ? 'importato' : 'integrato', version: imported?.version || PACK_REPORT_PMI.version, validAsOf: imported?.validAsOf || PACK_REPORT_PMI.validAsOf, sections: PACK_REPORT_PMI.sections, source: PACK_REPORT_PMI.source };
}
/** Modello CSV per trascrivere la tavola PMI-Banche (40 righe). */
export function pmiTemplateCsv(d) {
  const items = packItems(d, 'report-pmi-banche', PACK_REPORT_PMI);
  return toCSV(items, [{ label: 'numero', value: x => x.n }, { label: 'sezione', value: x => x.section || '' }, { label: 'testo della voce', value: x => x.text || '' },
    { label: 'datapoint VS', value: x => (x.dpIds || []).join(', ') }, { label: 'corrispondenza', value: x => x.match || '' }]);
}
/** Pacchetto PMI-Banche da un CSV trascritto (stesse colonne del modello) → {ok, errors, pack}; il pacchetto si importa con applyPackOps. */
export function pmiPackFromCsv(text, today) {
  const { header, rows } = parseCSV(String(text || ''));
  const cN = pick(header, ['numero', 'n', 'nr', 'id']), cS = pick(header, ['sezione', 'section']), cT = pick(header, ['testo della voce', 'testo', 'voce', 'domanda', 'text']);
  const cD = pick(header, ['datapoint vs', 'datapoint', 'dpids', 'vs']), cM = pick(header, ['corrispondenza', 'match', 'tipo']);
  if (!cT) return { ok: false, errors: ['Manca la colonna «testo della voce»'], pack: null };
  const secIds = new Set(PACK_REPORT_PMI.sections.map(s => s.id));
  const errors = [], items = [];
  rows.forEach((r, i) => {
    const n = Math.round(num(cN ? r[cN] : i + 1) ?? i + 1);
    if (!(n >= 1 && n <= 60)) { errors.push(`riga ${i + 2}: numero non valido`); return; }
    const sec = norm(cS ? r[cS] : '').trim();
    const dp = String(cD ? r[cD] : '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    const bad = dp.filter(id => !VS_DP[id]);
    if (bad.length) errors.push(`voce ${n}: datapoint sconosciuti ${bad.join(', ')}`);
    items.push({ id: `PB${String(n).padStart(2, '0')}`, n, section: secIds.has(sec) ? sec : null, text: String(r[cT] || '').trim() || null, dpIds: dp.filter(id => VS_DP[id]),
      match: ['vs', 'da adattare', 'specifico banca'].includes(norm(cM ? r[cM] : '').trim()) ? norm(r[cM]).trim() : null, status: String(r[cT] || '').trim() ? 'trascritto' : 'da trascrivere' });
  });
  if (!items.length) errors.push('Nessuna voce nel file');
  const v = String(today || '').replace(/-/g, '.').replace(/\.0/g, '.') || '2026.1';
  return { ok: !errors.length, errors: errors.slice(0, 12), pack: { pack: 'report-pmi-banche', version: v, validAsOf: today || PACK_REPORT_PMI.validAsOf, source: 'Trascrizione dell’utente dal documento pubblico', items } };
}

/* ---------------- compilazione ---------------- */
const QRANK = { misurato: 0, calcolato: 1, dichiarato: 2, stimato: 3, default: 4, mancante: 5 };
/**
 * Risposte di un questionario dal report: [{...voce, status, answer, values, quality, evidence}] e il riepilogo.
 * status: risposto | parziale | manuale | oltre | da-completare | da-mappare | da-trascrivere.
 */
export function fillQuestionnaire(q, report, opts = {}) {
  const lg = L(opts.lang);
  const items = (Array.isArray(q?.items) ? q.items : EMPTY).map(it => {
    if (!it || !it.text) return { ...it, status: 'da-trascrivere', answer: '', values: [], evidence: [], quality: null };
    const dpIds = (it.dpIds || []).filter(id => VS_DP[id] || report?.byId?.[id]);
    const vals = dpIds.map(id => report?.byId?.[id]).filter(Boolean);
    const ok = vals.filter(x => x.hasValue);
    const override = typeof it.override === 'string' && it.override.trim() ? it.override.trim() : null;
    const beyond = !dpIds.length && it.beyondVs !== false;
    const autoText = ok.map(x => (dpIds.length === 1 ? itemText(x, lg) : `${dpLabel(x.id, lg)}: ${itemText(x, lg)}`)).join('; ');
    const status = override ? 'manuale' : beyond ? 'oltre' : !dpIds.length ? 'da-mappare' : ok.length === vals.length && ok.length ? 'risposto' : ok.length ? 'parziale' : 'da-completare';
    const evidence = [...new Set([...ok.flatMap(x => (Array.isArray(x.evidence) ? x.evidence : EMPTY)), ...(Array.isArray(it.evidenceIds) ? it.evidenceIds : EMPTY)].map(String))];
    const quality = ok.length ? ok.map(x => x.quality).sort((a, b) => QRANK[b] - QRANK[a])[0] : null;
    return { ...it, dpIds, status, answer: override || (beyond ? T('report.beyond', {}, lg) : autoText), auto: autoText, values: vals, evidence, quality, beyondVs: beyond };
  });
  const c = k => items.filter(x => x.status === k).length;
  const total = items.length, answered = c('risposto') + c('manuale');
  return { items, stats: { total, answered, partial: c('parziale'), beyond: c('oltre'), todo: c('da-completare') + c('da-mappare'), transcribe: c('da-trascrivere'), pct: total ? answered / total : 0 } };
}

/** CSV delle risposte (domanda, risposta, datapoint, stato, qualità, evidenze, oltre il VS). */
export function answersCsv(filled, lang = 'it') {
  const lg = L(lang);
  return toCSV(filled.items, [
    { label: T('report.q.col.qid', {}, lg), value: x => x.qid }, { label: T('report.q.col.question', {}, lg), value: x => x.text || T('report.q.st.da-trascrivere', {}, lg) },
    { label: T('report.q.col.answer', {}, lg), value: x => x.answer }, { label: T('report.q.col.dp', {}, lg), value: x => (x.dpIds || []).join(' ') },
    { label: T('report.q.col.status', {}, lg), value: x => T(`report.q.st.${x.status}`, {}, lg) }, { label: T('report.col.quality', {}, lg), value: x => (x.quality ? T(`quality.${x.quality}`, {}, lg) : '') },
    { label: T('report.q.col.evidence', {}, lg), value: x => (x.evidence || []).join(' ') }, { label: T('report.q.col.beyond', {}, lg), value: x => (x.beyondVs ? T('report.yes', {}, lg) : '') },
  ]);
}
/** Indice delle evidenze del questionario: una riga per evidenza con le voci che la usano. */
export function evidenceIndex(filled, d) {
  const ev = Object.fromEntries((Array.isArray(d?.evidence) ? d.evidence : EMPTY).map(e => [String(e.id), e]));
  const by = new Map();
  for (const it of filled.items) for (const id of it.evidence || EMPTY) { if (!by.has(id)) by.set(id, []); by.get(id).push(it.qid); }
  return [...by.entries()].map(([id, qids]) => { const e = ev[id] || {}; return { id, title: e.title || e.name || id, kind: e.kind || e.type || '', date: e.date || e.issuedAt || '', expiry: e.expiry || e.expiresAt || e.validTo || '', sha256: e.sha256 || e.hash || '', qids }; });
}
export function evidenceIndexCsv(rows) {
  return toCSV(rows, [{ label: 'Evidenza', value: r => r.id }, { label: 'Titolo', value: r => r.title }, { label: 'Tipo', value: r => r.kind }, { label: 'Data', value: r => r.date },
    { label: 'Scadenza', value: r => r.expiry }, { label: 'SHA-256', value: r => r.sha256 }, { label: 'Voci', value: r => r.qids.join(' ') }]);
}

/** Risposte manuali che differiscono dal valore approvato (numeri oltre l'1%). → [{qid, dpId, override, approved}] */
export function overrideConflicts(q, closing) {
  if (!closing || closing.status !== 'approvato' || !isObj(closing.datapoints)) return [];
  const out = [];
  for (const it of Array.isArray(q?.items) ? q.items : EMPTY) {
    if (!it || typeof it.override !== 'string' || !it.override.trim() || (it.dpIds || []).length !== 1) continue;
    const dp = closing.datapoints[it.dpIds[0]];
    const a = typeof dp?.value === 'number' ? dp.value : null, o = num(it.override.replace(/[^\d.,+-]/g, ' ').trim().split(/\s+/)[0]);
    if (a == null || o == null) continue;
    if (Math.abs(o - a) > Math.max(1e-9, Math.abs(a) * 0.01)) out.push({ qid: it.qid, dpId: it.dpIds[0], override: o, approved: a });
  }
  return out;
}

/* ---------------- materialità ---------------- */
/** Voci della libreria per il settore dell'archivio (pacchetto integrato o importato più recente). */
export function iroLibrary(d) {
  const sec = sectorOf(d);
  return packItems(d, 'report-iro', PACK_REPORT_IRO).filter(x => x && (!Array.isArray(x.sectors) || x.sectors.includes(sec)));
}
const clamp15 = v => { const n = +v; return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 1; };
/**
 * Punteggi di una voce (scala 1-5): impatto = gravità (media di scala, estensione e irrimediabilità; per gli impatti positivi
 * scala ed estensione) × probabilità/5 se potenziale; finanziario = entità × probabilità/5; punteggio = il maggiore dei due.
 */
export function scoreIro(r) {
  const s = { scale: clamp15(r?.scale), scope: clamp15(r?.scope), irr: clamp15(r?.irremediability), lik: clamp15(r?.likelihood), mag: clamp15(r?.magnitude) };
  const sev = r?.positive ? (s.scale + s.scope) / 2 : (s.scale + s.scope + s.irr) / 3;
  const impact = Math.round((r?.actual === false ? sev * (s.lik / 5) : sev) * 100) / 100;
  const financial = Math.round(s.mag * (s.lik / 5) * 100) / 100;
  return { impact, financial, score: Math.max(impact, financial) };
}
/** Righe di materialità dell'esercizio (id '<periodo>:<iro>'); null se l'esercizio non è ancora valutato. */
export function materialityRows(d, periodKey) {
  const rows = (Array.isArray(d?.materiality) ? d.materiality : EMPTY).filter(r => r && r.id && String(r.id).startsWith(periodKey + ':'));
  return rows.length ? rows : null;
}
/** Ultimo esercizio valutato prima di quello indicato (per riportare i punteggi). */
export function lastAssessed(d, periodKey) {
  const keys = [...new Set((Array.isArray(d?.materiality) ? d.materiality : EMPTY).map(r => String(r?.id || '').split(':')[0]).filter(k => k && k !== periodKey))];
  return keys.sort().at(-1) || null;
}
/** Righe nuove per l'esercizio: dalla libreria (punteggi di base) o copiate da un altro esercizio. */
export function seedMateriality(d, periodKey, fromKey = null, threshold = 3) {
  const lib = iroLibrary(d);
  const old = fromKey ? Object.fromEntries((materialityRows(d, fromKey) || EMPTY).map(r => [r.iroId, r])) : {};
  return lib.map(it => {
    const o = old[it.id];
    const base = o ? { scale: o.scale, scope: o.scope, irremediability: o.irremediability, likelihood: o.likelihood, magnitude: o.magnitude, rationale: o.rationale } : { ...it.defaults, rationale: it.rationale?.it || '' };
    const row = { id: `${periodKey}:${it.id}`, periodKey, iroId: it.id, topic: it.topic, kind: it.kind, positive: !!it.positive, actual: it.actual, horizon: it.horizon, ...base };
    const sc = scoreIro(row);
    return { ...row, score: sc.score, material: sc.score >= threshold };
  });
}
/** Riga aggiornata con i punteggi ricalcolati. */
export function rescoreRow(row, threshold = 3) { const sc = scoreIro(row); return { ...row, score: sc.score, material: sc.score >= threshold }; }

/**
 * Matrice di materialità: punti {id, x: finanziario, y: impatto, material, kind, topic, title}, temi ESRS materiali con le
 * informative del VS da curare, e la raccomandazione sul modulo Comprehensive (temi E1 o S1 materiali, o richieste esterne).
 */
export function materialityMatrix(rows, threshold = 3, lib = PACK_REPORT_IRO.items, lang = 'it') {
  const lg = L(lang);
  const byIro = Object.fromEntries((lib || EMPTY).map(x => [x.id, x]));
  const points = (rows || EMPTY).map(r => {
    const sc = scoreIro({ ...r, positive: r.positive ?? byIro[r.iroId]?.positive });
    const meta = byIro[r.iroId];
    return { id: r.iroId, rowId: r.id, x: sc.financial, y: sc.impact, score: sc.score, material: sc.score >= threshold, kind: r.kind || meta?.kind || 'impatto', topic: r.topic || meta?.topic || '', title: meta?.title?.[lg] || r.title || r.iroId };
  });
  const topics = Object.entries(ESRS_TOPICS).map(([id, t]) => {
    const ps = points.filter(p => p.topic === id);
    const mat = ps.filter(p => p.material);
    const vs = t.vs;
    return { id, label: t.label[lg], material: mat.length > 0, iros: ps.length, materialIros: mat.map(p => p.id), vs, datapoints: VS_DATAPOINTS.filter(x => vs.includes(x.disc)).map(x => x.id), top: ps.reduce((m, p) => Math.max(m, p.score), 0) };
  });
  const mt = topics.filter(t => t.material);
  return { points, topics, materialTopics: mt, material: points.filter(p => p.material).length, threshold, recommendC: mt.some(t => t.id === 'E1' || t.id === 'S1'), disclosures: [...new Set(mt.flatMap(t => t.vs))].sort((a, b) => VS_DISCLOSURES.findIndex(x => x.id === a) - VS_DISCLOSURES.findIndex(x => x.id === b)) };
}
