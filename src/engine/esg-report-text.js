/* FeedOS 18 · Report e questionari (pacchetto WP4): testi del rapporto VS senza intelligenza artificiale, in italiano o inglese.
 * fmtValue (valori con unità, sì/no, tabelle), narratives (paragrafi a regole per informativa, con le variazioni sull'esercizio
 * precedente e i segnaposto «[da completare: …]» solo per i datapoint obbligatori mancanti), esportazioni: vsmeMarkdown, vsmeCsv
 * (dpId; datapoint; valore; unità; qualità; fonte; evidenze), vsmeJson ({meta, datapoints}), efragCsv (ordine del modello EFRAG),
 * bankMarkdown / bankCsv (pacchetto per la banca), historyCsv (tre esercizi). Funzioni pure sul risultato di vsmeReport. */
import { T, fmtNum, deltaPhrase, listJoin } from './esg-nlg.js';
import { toCSV } from '../core/io.js';
import { dateIt } from '../core/util.js';
import { VS_DP, VS_DISCLOSURES, VS_MODULES, VS_PROVIDERS, VS_CONDITIONS, OMISSION_REASONS, VS_SOURCE } from '../data/vsme-datapoints.js';

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const L = lang => (lang === 'en' ? 'en' : 'it');
const EMPTY = [];

/* ---------------- valori ---------------- */
const UNIT_EN = { persone: 'people', siti: 'sites', rapporto: 'ratio', 'per 200.000 h': 'per 200,000 h', n: '' };
const UNIT_IT = { n: '' };
/** Unità nella lingua del documento. */
export const unitText = (unit, lang = 'it') => (unit == null ? '' : (L(lang) === 'en' ? UNIT_EN : UNIT_IT)[unit] ?? unit);
const DEC = { '€': 0, '%': 1, rapporto: 2, 't CO₂e/M€': 2, 'per 200.000 h': 2, 'm³': 0, h: 1, persone: 0, siti: 0, n: 0, ha: 1, 'm²': 0, kg: 0 };
const decFor = (v, unit) => (DEC[unit] != null ? DEC[unit] : ['MWh', 't CO₂e', 't'].includes(unit) ? (Math.abs(v) >= 100 ? 0 : 1) : undefined);

const KEYS = {
  female: ['donne', 'women'], donne: ['donne', 'women'], women: ['donne', 'women'], f: ['donne', 'women'],
  male: ['uomini', 'men'], uomini: ['uomini', 'men'], men: ['uomini', 'men'], m: ['uomini', 'men'],
  other: ['altro', 'other'], altro: ['altro', 'other'], altri: ['altri', 'others'], nonbinary: ['non binario', 'non-binary'],
  permanent: ['tempo indeterminato', 'permanent'], indeterminato: ['tempo indeterminato', 'permanent'], 'tempo-indeterminato': ['tempo indeterminato', 'permanent'],
  temporary: ['tempo determinato', 'temporary'], determinato: ['tempo determinato', 'temporary'], 'tempo-determinato': ['tempo determinato', 'temporary'],
  total: ['totale', 'total'], totale: ['totale', 'total'],
  practices: ['pratiche', 'practices'], pratiche: ['pratiche', 'practices'], policies: ['politiche', 'policies'], politiche: ['politiche', 'policies'],
  initiatives: ['iniziative future', 'future initiatives'], iniziative: ['iniziative future', 'future initiatives'], public: ['pubbliche', 'public'], pubbliche: ['pubbliche', 'public'],
  targets: ['obiettivi', 'targets'], obiettivi: ['obiettivi', 'targets'],
  childlabour: ['lavoro minorile', 'child labour'], 'child-labour': ['lavoro minorile', 'child labour'], forcedlabour: ['lavoro forzato', 'forced labour'], 'forced-labour': ['lavoro forzato', 'forced labour'],
  trafficking: ['tratta di esseri umani', 'human trafficking'], discrimination: ['discriminazione', 'discrimination'], accidents: ['prevenzione degli infortuni', 'accident prevention'],
  it: ['Italia', 'Italy'], italia: ['Italia', 'Italy'],
};
const keyLabel = (k, lang) => { const e = KEYS[String(k).toLowerCase()]; return e ? e[L(lang) === 'en' ? 1 : 0] : String(k); };

/** Numero con unità e decimali adatti all'unità. */
export function fmtNumber(v, unit, lang = 'it') {
  if (v == null || !Number.isFinite(+v)) return T('na', {}, lang);
  return fmtNum(+v, unitText(unit, lang), lang, decFor(+v, unit)).trim();
}

/** Testo di un valore: numeri con unità, sì/no, voci di elenco, tabelle chiave → valore. null se vuoto. */
export function fmtValue(v, unit = null, lang = 'it', c = null) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return T(v ? 'report.yes' : 'report.no', {}, lang);
  if (typeof v === 'number') return fmtNumber(v, unit, lang);
  if (typeof v === 'string') { const o = c?.options?.[v]; return o ? o[L(lang)] || o.it : v; }
  if (Array.isArray(v)) { const xs = v.map(x => (isObj(x) ? objText(x, unit, lang) : fmtValue(x, unit, lang))).filter(Boolean); return xs.length ? xs.join('; ') : null; }
  if (isObj(v)) return objText(v, unit, lang);
  return String(v);
}
function objText(o, unit, lang) {
  if ('value' in o && Object.keys(o).every(k => ['value', 'unit', 'label', 'note'].includes(k))) {
    const t = fmtValue(o.value, o.unit ?? unit, lang);
    return t == null ? null : o.label ? `${o.label} ${t}` : t;
  }
  const parts = [];
  for (const [k, x] of Object.entries(o)) {
    if (x == null || x === '') continue;
    const t = typeof x === 'number' ? fmtNumber(x, unit === 'persone' ? null : unit, lang) : fmtValue(x, null, lang);
    if (t != null) parts.push(`${keyLabel(k, lang)} ${t}`);
  }
  return parts.length ? parts.join(', ') : null;
}

/** Valore di un elemento del report nella lingua, con la stima segnalata; null se manca. */
export function itemText(x, lang = 'it') {
  if (!x?.hasValue) return null;
  const t = fmtValue(x.value, x.unit, lang, VS_DP[x.id]);
  if (t == null) return null;
  return x.quality === 'stimato' ? `${t} (${T('estimate', {}, lang)})` : x.quality === 'default' ? `${t} (${T('quality.default', {}, lang)})` : t;
}
/** Etichetta di un datapoint nella lingua. */
export const dpLabel = (id, lang = 'it') => VS_DP[id]?.label?.[L(lang)] || VS_DP[id]?.label?.it || id;
/** Titolo di un'informativa. */
export const discTitle = (id, lang = 'it') => { const x = VS_DISCLOSURES.find(z => z.id === id); return x ? x.title[L(lang)] : id; };
/** Fonte leggibile: pacchetto, risposta o chiusura. */
export function sourceText(x, lang = 'it') {
  if (!x) return '';
  if (x.origin === 'chiusura') return L(lang) === 'en' ? 'approved snapshot' : 'istantanea approvata';
  if (x.origin === 'risposta') return L(lang) === 'en' ? 'answer in the report' : 'risposta nel report';
  const p = VS_PROVIDERS[x.pkg];
  return p ? p.title[L(lang)] : x.source || '';
}
/** Stato di un datapoint nella lingua. */
export const statusText = (st, lang = 'it') => T(`report.dp.${st}`, {}, lang);
const dot = s => { const t = String(s || '').trim(); return !t ? '' : /[.!?…]$/.test(t) ? t : t + '.'; };
const OPT = { basic: { it: 'il solo modulo Basic', en: 'Basic module only' }, 'basic+comprehensive': { it: 'i moduli Basic e Comprehensive', en: 'Basic and Comprehensive modules' } };
const BASIS = { individuale: { it: 'individuale', en: 'an individual' }, consolidato: { it: 'consolidata', en: 'a consolidated' } };

/* ---------------- paragrafi automatici ---------------- */
/**
 * Paragrafi per informativa: [{id, module, title, paragraphs, auto, edited, missing}].
 * opts.history: risultato di threeYear (variazioni sull'esercizio precedente); i testi modificati arrivano da report.texts.
 */
export function narratives(report, lang = 'it', opts = {}) {
  const lg = L(lang);
  const by = report?.byId || {};
  const hist = opts.history || report?.history || null;
  const out = [];
  for (const disc of VS_DISCLOSURES) {
    if (disc.module === 'C' && !report?.withC) continue;
    const missing = [];
    const it = id => by[id];
    const val = id => itemText(it(id), lg);
    const mark = id => { missing.push(id); return T('report.missing', { label: dpLabel(id, lg) }, lg); };
    const omit = x => T('report.omitted', { reason: OMISSION_REASONS[x.omission?.reason]?.[lg] || x.omission?.reason || '', note: x.omission?.note || '' }, lg);
    /** Valore, omissione motivata, «non applicabile» o segnaposto (solo se obbligatorio); null se facoltativo e assente. */
    const need = id => {
      const x = it(id);
      if (!x) return null;
      const v = val(id);
      if (v != null) return v;
      if (x.status === 'omesso') return omit(x);
      if (x.status === 'non-applicabile') return T('report.notApplicable', {}, lg);
      return x.required ? mark(id) : null;
    };
    const applies = id => { const x = it(id); return !!x && x.status !== 'non-applicabile'; };
    const na = id => { const x = it(id); return T('report.n.na', { label: dpLabel(id, lg), why: x?.condText || T('report.notApplicable', {}, lg) }, lg); };
    const delta = (key, good, unit) => {
      const row = hist?.rows?.find(r => r.key === key);
      const cur = row?.values?.[2]?.value, prev = row?.values?.[1]?.value;
      return cur != null && prev != null ? deltaPhrase(cur, prev, { good, unit, lang: lg }) : null;
    };
    const P = [];
    const b = BUILD[disc.id];
    if (b) b({ P, it, val, need, mark, applies, na, delta, lg, report, dot, missing });
    else for (const x of (report?.disclosures?.find(z => z.id === disc.id)?.items || EMPTY)) { const v = need(x.id); if (v != null) P.push(T('report.n.generic', { label: dpLabel(x.id, lg), value: v }, lg)); }
    // datapoint in più forniti dai pacchetti (fuori catalogo): una frase ciascuno
    for (const x of (report?.extras || EMPTY).filter(e => e.disc === disc.id)) { const v = itemText(x, lg); if (v != null) P.push(T('report.n.generic', { label: x.label || x.id, value: v }, lg)); }
    const auto = P.filter(Boolean).map(dot);
    const ed = report?.texts?.[`${disc.id}.testo-${lg}`];
    const edited = !!(ed && typeof ed.value === 'string' && ed.value.trim());
    out.push({ id: disc.id, module: disc.module, title: disc.title[lg], paragraphs: edited ? ed.value.trim().split(/\n\s*\n/).map(s => s.trim()) : auto, auto, edited, missing: [...new Set(missing)] });
  }
  return out;
}

const B2_IDS = ['B2.climate', 'B2.pollution', 'B2.water', 'B2.biodiversity', 'B2.circular', 'B2.own-workforce', 'B2.value-chain-workers', 'B2.communities', 'B2.consumers', 'B2.business-conduct'];
const flag = (o, ...ks) => ks.some(k => o?.[k] === true || o?.[k] === 'si' || o?.[k] === 'sì' || o?.[k] === 'yes');
const BUILD = {
  B1({ P, need, val, applies, lg, report }) {
    const m = report.meta || {};
    P.push(T('report.n.B1.intro', { company: m.company || '—', legalForm: need('B1.legal-form') || '—', option: OPT[report.option]?.[lg] || report.option, basis: BASIS[report.settings?.basis]?.[lg] || BASIS.individuale[lg] }, lg));
    P.push(T('report.n.B1.profile', { nace: need('B1.nace') || '—', country: need('B1.country') || '—' }, lg));
    P.push(T('report.n.B1.size', { turnover: need('B1.turnover') || '—', bs: need('B1.balance-sheet') || '—', employees: need('B1.employees') || '—' }, lg));
    if (applies('B1.subsidiaries')) { const v = need('B1.subsidiaries'); if (v) P.push(T('report.n.B1.subs', { v }, lg)); }
    const s = need('B1.sites-geo'); if (s) P.push(T('report.n.B1.sites', { v: s }, lg));
    const c = applies('B1.certifications') ? need('B1.certifications') : val('B1.certifications'); if (c) P.push(T('report.n.B1.certs', { v: c }, lg));
    const o = val('B1.omitted'); if (o) P.push(T('report.n.B1.omitted', { v: o }, lg));
  },
  B2({ P, it, mark, lg }) {
    const has = [], none = [], pub = [], tgt = [], txt = [], miss = [];
    for (const id of B2_IDS) {
      const x = it(id); if (!x) continue;
      const name = dpLabel(id, lg).toLowerCase();
      if (!x.hasValue) { if (x.status === 'omesso') continue; if (x.required) miss.push(id); continue; }
      const v = x.value;
      if (isObj(v)) {
        if (flag(v, 'practices', 'pratiche', 'policies', 'politiche', 'initiatives', 'iniziative')) has.push(name); else none.push(name);
        if (flag(v, 'public', 'pubbliche')) pub.push(name);
        if (flag(v, 'targets', 'obiettivi')) tgt.push(name);
      } else if (v === true) has.push(name);
      else if (v === false) none.push(name);
      else txt.push(`${dpLabel(id, lg)}: ${fmtValue(v, null, lg)}`);
    }
    if (has.length) P.push(T('report.n.B2.has', { list: listJoin(has, lg) }, lg));
    if (none.length) P.push(T('report.n.B2.none', { list: listJoin(none, lg) }, lg));
    if (pub.length) P.push(T('report.n.B2.public', { list: listJoin(pub, lg) }, lg));
    if (tgt.length) P.push(T('report.n.B2.targets', { list: listJoin(tgt, lg) }, lg));
    P.push(...txt);
    if (miss.length) { miss.forEach(id => mark(id)); P.push(T('report.missing', { label: listJoin(miss.map(id => dpLabel(id, lg).toLowerCase()), lg) }, lg)); }
  },
  B3({ P, it, val, need, mark, delta, lg }) {
    const parts = [['B3.mwh-el', 'report.n.B3.el'], ['B3.mwh-ren-el', 'report.n.B3.ren'], ['B3.mwh-fuel', 'report.n.B3.fuel']].map(([id, k]) => { const v = val(id); return v ? T(k, { v }, lg) : null; }).filter(Boolean);
    P.push(T('report.n.B3.energy', { mwh: need('B3.mwh') || '—', split: parts.length ? T('report.n.B3.split', { parts: listJoin(parts, lg) }, lg) : '' }, lg));
    const det = ['B3.mwh-el', 'B3.mwh-ren-el', 'B3.mwh-nonren-el', 'B3.mwh-fuel', 'B3.mwh-ren-fuel', 'B3.mwh-nonren-fuel'].filter(id => { const x = it(id); return x && x.required && !x.covered; });
    if (det.length) { det.forEach(id => mark(id)); P.push(T('report.missing', { label: listJoin(det.map(id => dpLabel(id, lg)), lg) }, lg)); }
    const mb = val('B3.s2-mb'), s3 = val('B3.s3');
    P.push(T('report.n.B3.ghg', { s1: need('B3.s1') || '—', s2: need('B3.s2-lb') || '—', extra: (mb ? T('report.n.B3.mb', { v: mb }, lg) : '') + (s3 ? T('report.n.B3.s3', { v: s3 }, lg) : '') }, lg));
    P.push(T('report.n.B3.int', { v: need('B3.intensity') || '—' }, lg));
    const dl = delta('s12', 'down', 't CO₂e'); if (dl) P.push(T('report.n.B3.delta', { delta: dl }, lg));
  },
  B4({ P, need, applies, na, lg }) { if (!applies('B4.pollutants')) P.push(na('B4.pollutants')); else { const v = need('B4.pollutants'); if (v) P.push(T('report.n.B4.list', { v }, lg)); } },
  B5({ P, val, need, applies, lg }) {
    const area = applies('B5.area-sensitive') ? need('B5.area-sensitive') : val('B5.area-sensitive');
    P.push(T('report.n.B5.sites', { n: need('B5.sites-sensitive') || '—', area: area ? T('report.n.B5.area', { v: area }, lg) : '' }, lg));
    const land = ['B5.land-total', 'B5.land-sealed', 'B5.nature-on', 'B5.nature-off'].map(id => { const v = val(id); return v ? `${dpLabel(id, lg).toLowerCase()} ${v}` : null; }).filter(Boolean);
    if (land.length) P.push(T('report.n.B5.land', { v: land.join('; ') }, lg));
  },
  B6({ P, val, need, applies, delta, lg }) {
    const st = applies('B6.withdrawal-stress') ? need('B6.withdrawal-stress') : val('B6.withdrawal-stress');
    const co = applies('B6.consumption') ? need('B6.consumption') : val('B6.consumption');
    P.push(T('report.n.B6', { w: need('B6.withdrawal') || '—', stress: st ? T('report.n.B6.stress', { v: st }, lg) : '', cons: co ? T('report.n.B6.cons', { v: co }, lg) : '' }, lg));
    const dl = delta('waterM3', 'down', 'm³'); if (dl) P.push(T('report.n.B6.delta', { delta: dl }, lg));
  },
  B7({ P, it, need, applies, val, lg }) {
    const c = need('B7.circular'); if (c) P.push(T('report.n.B7.circ', { v: c }, lg));
    const h = it('B7.waste-haz'), n = it('B7.waste-nonhaz'), dv = it('B7.diverted');
    const tot = h?.hasValue && n?.hasValue && typeof h.value === 'number' && typeof n.value === 'number' ? h.value + n.value : null;
    const pct = tot > 0 && dv?.hasValue && typeof dv.value === 'number' ? T('report.n.B7.pct', { v: fmtNumber((dv.value / tot) * 100, '%', lg) }, lg) : '';
    P.push(T('report.n.B7.waste', { haz: need('B7.waste-haz') || '—', non: need('B7.waste-nonhaz') || '—', div: need('B7.diverted') || '—', pct }, lg));
    const f = applies('B7.mass-flow') ? need('B7.mass-flow') : val('B7.mass-flow'); if (f) P.push(T('report.n.B7.flow', { v: f }, lg));
  },
  B8({ P, need, val, applies, lg }) {
    const cn = applies('B8.by-country') ? need('B8.by-country') : val('B8.by-country');
    const tu = applies('B8.turnover') ? need('B8.turnover') : val('B8.turnover');
    P.push(T('report.n.B8', { c: need('B8.by-contract') || '—', g: need('B8.by-gender') || '—', extra: (cn ? T('report.n.B8.country', { v: cn }, lg) : '') + (tu ? T('report.n.B8.turn', { v: tu }, lg) : '') }, lg));
  },
  B9({ P, need, lg }) { P.push(T('report.n.B9', { n: need('B9.recordable') || '—', rate: need('B9.recordable-rate') || '—', f: need('B9.fatalities') || '—' }, lg)); },
  B10({ P, need, val, applies, lg }) {
    P.push(T('report.n.B10', { mw: need('B10.min-wage') || '—', ccnl: need('B10.ccnl') || '—', tr: need('B10.training-h') || '—' }, lg));
    const g = applies('B10.pay-gap') ? need('B10.pay-gap') : val('B10.pay-gap'); if (g) P.push(T('report.n.B10.gap', { v: g }, lg));
  },
  B11({ P, need, lg }) { P.push(T('report.n.B11', { n: need('B11.convictions') || '—', f: need('B11.fines') || '—' }, lg)); },
  C1({ P, need, lg }) {
    for (const [id, k] of [['C1.products', 'report.n.C1.products'], ['C1.markets', 'report.n.C1.markets'], ['C1.relationships', 'report.n.C1.rel'], ['C1.strategy', 'report.n.C1.strategy']]) { const v = need(id); if (v) P.push(T(k, { v }, lg)); }
  },
  C2({ P, need, lg }) { const d = need('C2.description'); if (d) P.push(d); const a = need('C2.accountable'); if (a) P.push(T('report.n.C2.acc', { v: a }, lg)); },
  C3({ P, need, applies, na, lg }) {
    for (const [id, k] of [['C3.targets', 'report.n.C3.targets'], ['C3.actions', 'report.n.C3.actions'], ['C3.transition-plan', 'report.n.C3.plan']]) {
      if (!applies(id)) { P.push(na(id)); continue; }
      const v = need(id); if (v) P.push(T(k, { v }, lg));
    }
  },
  C4({ P, need, val, lg }) {
    for (const [id, k] of [['C4.hazards', 'report.n.C4.hazards'], ['C4.exposure', 'report.n.C4.exposure'], ['C4.horizons', 'report.n.C4.horizons'], ['C4.adaptation', 'report.n.C4.adaptation']]) { const v = need(id); if (v) P.push(T(k, { v }, lg)); }
    const f = val('C4.financial'); if (f) P.push(T('report.n.C4.financial', { v: f }, lg));
  },
  C5({ P, need, val, applies, lg }) { P.push(T('report.n.C5', { r: (applies('C5.mgmt-ratio') ? need('C5.mgmt-ratio') : val('C5.mgmt-ratio')) || T('report.notApplicable', {}, lg), s: need('C5.self-employed') || '—', a: need('C5.agency') || '—' }, lg)); },
  C6({ P, need, val, applies, lg }) {
    const cov = applies('C6.coverage') ? need('C6.coverage') : val('C6.coverage');
    P.push(T('report.n.C6', { c: need('C6.code') || '—', cov: cov ? T('report.n.C6.cov', { v: cov }, lg) : '', g: need('C6.grievance') || '—' }, lg));
  },
  C7({ P, need, lg }) { P.push(T('report.n.C7', { o: need('C7.own-incidents') || '—', v: need('C7.value-chain') || '—' }, lg)); },
  C8({ P, need, lg }) { P.push(T('report.n.C8', { r: need('C8.revenue-sectors') || '—', e: need('C8.benchmark-excluded') || '—' }, lg)); },
  C9({ P, need, applies, na, lg }) { if (!applies('C9.board-ratio')) P.push(na('C9.board-ratio')); else { const v = need('C9.board-ratio'); if (v) P.push(T('report.n.C9', { v }, lg)); } },
};
/* ---------------- intestazione e righe comuni delle esportazioni ---------------- */
/** Intestazione del rapporto nella lingua: titolo, periodo, stato e copertura. */
export function reportHeader(report, lang = 'it') {
  const lg = L(lang), m = report?.meta || {}, c = report?.coverage || {};
  const pct = x => (x && x.required ? fmtNum((x.covered / x.required) * 100, '%', lg, 0) : T('na', {}, lg));
  const cl = report?.closing;
  const date = cl?.approvedAt || cl?.reopenedAt || cl?.frozenAt || '';
  const status = T(`report.status.${cl ? cl.status.replace(' ', '-') : 'aperto'}`, { date: date ? dateIt(String(date).slice(0, 10)) : '—' }, lg);
  return {
    title: T('report.title', {}, lg),
    company: [m.company, m.site].filter(Boolean).join(' · '),
    period: T('report.period', { period: report?.period?.label || '', from: dateIt(report?.period?.from), to: dateIt(report?.period?.to) }, lg),
    status, hash: cl?.hash ? T('report.hash', { hash: cl.hash }, lg) : '',
    coverage: T('report.coverage', { b: pct(c.B), c: report?.withC ? T('report.coverage.c', { c: pct(c.C) }, lg) : '', m: report?.measured?.n ? fmtNum(report.measured.pct * 100, '%', lg, 0) : T('na', {}, lg) }, lg),
  };
}
/** Righe di tutti i datapoint nell'ordine del catalogo (più quelli in più forniti dai pacchetti). */
export function exportRows(report, lang = 'it') {
  const lg = L(lang);
  const rows = (report?.items || EMPTY).filter(x => x.inScope);
  return [...rows, ...(report?.extras || EMPTY)].map(x => ({
    id: x.id, module: x.module || x.disc?.[0] || '', disc: x.disc, order: VS_DP[x.id]?.order ?? '', label: x.label?.[lg] || x.label?.it || (typeof x.label === 'string' ? x.label : dpLabel(x.id, lg)),
    value: x.hasValue ? (typeof x.value === 'number' ? x.value : fmtValue(x.value, x.unit, lg, VS_DP[x.id])) : x.status === 'omesso' ? T('report.omitted', { reason: OMISSION_REASONS[x.omission?.reason]?.[lg] || '', note: x.omission?.note || '' }, lg) : null,
    unit: x.hasValue ? unitText(x.unit, lg) : '', quality: x.hasValue ? T(`quality.${x.quality}`, {}, lg) : '', source: x.hasValue ? sourceText(x, lg) : '',
    evidence: Array.isArray(x.evidence) ? x.evidence.length : 0, evidenceIds: Array.isArray(x.evidence) ? x.evidence.join(' ') : '', status: statusText(x.status, lg),
    note: [x.note, x.method].filter(Boolean).join(' · '),
  }));
}

/** Rapporto in Markdown (paragrafi, tabelle dei datapoint, lacune, nota metodologica, avvertenza). */
export function vsmeMarkdown(report, lang = 'it', opts = {}) {
  const lg = L(lang), h = reportHeader(report, lg), out = [];
  const narr = opts.narratives || narratives(report, lg, opts);
  const rows = exportRows(report, lg);
  out.push(`# ${h.title}`, '', `**${h.company}**`, '', `- ${h.period}`, `- ${h.status}`);
  if (h.hash) out.push(`- ${h.hash}`);
  out.push(`- ${h.coverage}`, '');
  for (const mod of ['B', 'C']) {
    const ds = narr.filter(n => n.module === mod);
    if (!ds.length) continue;
    out.push(`## ${VS_MODULES[mod][lg]}`, '');
    for (const n of ds) {
      out.push(`### ${n.id} · ${n.title}`, '');
      for (const p of n.paragraphs) out.push(p, '');
      if (n.edited) out.push(`_${T('report.edited', {}, lg)}_`, '');
      const rs = rows.filter(r => r.disc === n.id);
      if (rs.length) {
        out.push(`| ${T('report.col.id', {}, lg)} | ${T('report.col.label', {}, lg)} | ${T('report.col.value', {}, lg)} | ${T('report.col.quality', {}, lg)} | ${T('report.col.source', {}, lg)} |`, '| --- | --- | --- | --- | --- |');
        for (const r of rs) {
          const v = r.value == null ? `— (${r.status})` : typeof r.value === 'number' ? fmtNumber(r.value, VS_DP[r.id]?.unit ?? null, lg) : `${r.value}${r.unit && typeof r.value !== 'string' ? ' ' + r.unit : ''}`;
          out.push(`| ${r.id} | ${cellMd(r.label)} | ${cellMd(v)} | ${r.quality || '—'} | ${cellMd(r.source || '—')} |`);
        }
        out.push('');
      }
    }
  }
  out.push(`## ${T('report.gaps', {}, lg)}`, '');
  const gaps = report?.gaps || EMPTY;
  if (!gaps.length) out.push(T('report.gaps.none', {}, lg), '');
  else { for (const g of gaps) out.push(`- **${g.id}** ${dpLabel(g.id, lg)} · ${T('report.gaps.where', { where: VS_PROVIDERS[g.provider]?.title?.[lg] || g.provider }, lg)}`); out.push(''); }
  out.push(`## ${T('method', {}, lg)}`, '', T('report.qualityNote', {}, lg), '', T('report.labelsNote', {}, lg), '');
  for (const [pkg, m] of Object.entries(opts.methods || {})) { const s = m && typeof m === 'object' ? m[lg] || m.it : m; if (s) out.push(`**${VS_PROVIDERS[pkg]?.title?.[lg] || pkg}.** ${String(s).replace(/\n\s*\n/g, ' ')}`, ''); }
  out.push(`${VS_SOURCE[lg]} · ${T('validAsOf', {}, lg)} ${dateIt(VS_SOURCE.validAsOf)} · ${T('status.da-verificare', {}, lg)}.`, '', '---', '', `_${T('disclaimer', {}, lg)}_`);
  return out.join('\n');
}
const cellMd = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

/** CSV dei datapoint: codice; datapoint; valore; unità; qualità; fonte; evidenze (+ stato, modulo, nota). */
export function vsmeCsv(report, lang = 'it') {
  const lg = L(lang);
  return toCSV(exportRows(report, lg), [
    { label: T('report.col.id', {}, lg), value: r => r.id }, { label: T('report.col.label', {}, lg), value: r => r.label }, { label: T('report.col.value', {}, lg), value: r => r.value },
    { label: T('report.col.unit', {}, lg), value: r => r.unit }, { label: T('report.col.quality', {}, lg), value: r => r.quality }, { label: T('report.col.source', {}, lg), value: r => r.source },
    { label: T('report.col.evidence', {}, lg), value: r => r.evidenceIds }, { label: T('report.col.status', {}, lg), value: r => r.status }, { label: T('report.col.module', {}, lg), value: r => r.module },
    { label: T('report.col.note', {}, lg), value: r => r.note },
  ]);
}

/** JSON del rapporto: {meta, datapoints} con i valori grezzi (numeri, sì/no come booleani, tabelle come oggetti). */
export function vsmeJson(report, lang = 'it') {
  const lg = L(lang), h = reportHeader(report, lg), c = report?.coverage || {};
  const share = x => (x && x.required ? Math.round((x.covered / x.required) * 10000) / 10000 : null);
  return {
    meta: { standard: 'VS/VSME', source: VS_SOURCE[lg], labels: VS_SOURCE.status, generator: 'FeedOS', company: report?.meta?.company || '', site: report?.meta?.site || '', nace: report?.byId?.['B1.nace']?.value ?? null,
      period: { key: report?.period?.key, label: report?.period?.label, from: report?.period?.from, to: report?.period?.to }, option: report?.option, basis: report?.settings?.basis,
      status: report?.closing?.status || 'aperto', frozen: !!report?.frozen, hash: report?.closing?.hash || null, preparedBy: report?.closing?.preparedBy || null, approvedBy: report?.closing?.approvedBy || null,
      approvedAt: report?.closing?.approvedAt || null, coverage: { basic: share(c.B), comprehensive: report?.withC ? share(c.C) : null, measured: report?.measured?.n ? Math.round(report.measured.pct * 10000) / 10000 : null },
      language: lg, disclaimer: T('disclaimer', {}, lg), statusText: h.status },
    datapoints: [...(report?.items || EMPTY).filter(x => x.inScope), ...(report?.extras || EMPTY)].map(x => ({
      id: x.id, disclosure: x.disc, label: x.label?.[lg] || x.label?.it || x.label || x.id, value: x.hasValue ? x.value : null, unit: x.unit ?? null, quality: x.hasValue ? x.quality : 'mancante',
      source: x.source || null, package: x.pkg || null, evidence: Array.isArray(x.evidence) ? x.evidence : [], status: x.status, required: !!x.required,
      ...(x.omission ? { omission: x.omission } : {}), ...(x.note ? { note: x.note } : {}), ...(x.method ? { method: x.method } : {}),
    })),
  };
}

/** CSV nell'ordine del modello digitale EFRAG (modulo, informativa, ordine, codice, datapoint, valore, unità, qualità, nota). */
export function efragCsv(report, lang = 'it') {
  const lg = L(lang);
  const rows = exportRows(report, lg).filter(r => VS_DP[r.id]).sort((a, b) => a.order - b.order);
  const csv = toCSV(rows, [
    { label: T('report.col.module', {}, lg), value: r => VS_MODULES[r.module]?.[lg] || r.module }, { label: T('report.col.disclosure', {}, lg), value: r => r.disc },
    { label: T('report.col.order', {}, lg), value: r => r.order }, { label: T('report.col.id', {}, lg), value: r => r.id }, { label: T('report.col.label', {}, lg), value: r => r.label },
    { label: T('report.col.value', {}, lg), value: r => r.value }, { label: T('report.col.unit', {}, lg), value: r => r.unit }, { label: T('report.col.quality', {}, lg), value: r => r.quality },
    { label: T('report.col.note', {}, lg), value: r => r.note },
  ]);
  return csv + '\r\n' + toCSV([{ n: T('report.efragNote', {}, lg) }], [{ label: T('report.col.note', {}, lg), value: r => r.n }]).replace(/^﻿/, '');
}

/* ---------------- storico e pacchetto per la banca ---------------- */
/** Testo di una cella dello storico (valore con unità). */
export const histCell = (row, i, lang = 'it') => { const c = row?.values?.[i]; return c?.value == null ? '—' : fmtNumber(c.value, row.unit, lang); };
/** CSV dei tre esercizi. */
export function historyCsv(hist, lang = 'it') {
  const lg = L(lang), ps = hist?.periods || EMPTY;
  const cols = [{ label: T('report.col.label', {}, lg), value: r => r.label?.[lg] || r.label?.it }, { label: T('report.col.unit', {}, lg), value: r => unitText(r.unit, lg) }];
  ps.forEach((p, i) => { cols.push({ label: p.label, value: r => (r.values[i]?.value == null ? null : Math.round(r.values[i].value * 1e4) / 1e4) }, { label: `${T('report.col.source', {}, lg)} ${p.short || p.key}`, value: r => (r.values[i]?.source ? T(`report.src.${r.values[i].source}`, {}, lg) : '') }); });
  return toCSV(hist?.rows || EMPTY, cols);
}
/** Pacchetto per la banca in Markdown. */
export function bankMarkdown(pack, lang = 'it') {
  const lg = L(lang), out = [];
  out.push(`# ${T('report.bank.title', {}, lg)}`, '', `**${pack.meta.company}**${pack.meta.site ? ' · ' + pack.meta.site : ''}`, '', `- ${pack.meta.periodText}`, `- ${pack.meta.statusText}`);
  if (pack.meta.hash) out.push(`- ${T('report.hash', { hash: pack.meta.hash }, lg)}`);
  out.push('', T('report.bank.intro', {}, lg), '');
  for (const s of pack.sections) {
    out.push(`## ${T(`report.bank.${s.id}`, {}, lg)}`, '');
    if (s.table) {
      const ps = s.table.periods;
      out.push(`| ${T('report.col.label', {}, lg)} | ${ps.map(p => p.short || p.label).join(' | ')} |`, `| --- | ${ps.map(() => '---:').join(' | ')} |`);
      for (const r of s.table.rows) out.push(`| ${r.label?.[lg] || r.label?.it} | ${ps.map((p, i) => histCell(r, i, lg)).join(' | ')} |`);
      out.push('');
    }
    for (const r of s.rows || EMPTY) out.push(`- **${r.label}**: ${r.text}${r.quality ? ` _(${r.quality})_` : ''}`);
    if (s.rows?.length) out.push('');
    if (s.id === 'evidenze' && !s.evidence?.length) out.push(T('report.bank.noEvidence', {}, lg), '');
    for (const e of s.evidence || EMPTY) out.push(`- ${e.title}${e.date ? ` · ${dateIt(e.date)}` : ''}${e.expiry ? ` · scad. ${dateIt(e.expiry)}` : ''}${e.sha256 ? ` · SHA-256 ${String(e.sha256).slice(0, 16)}…` : ''} (${e.dpIds.join(', ')})`);
    if (s.evidence?.length) out.push('');
  }
  out.push(T('report.bank.pmi', { done: pack.pmi.transcribed, total: pack.pmi.total }, lg) + ` (${pack.pmi.status}).`, '', '---', '', `_${T('disclaimer', {}, lg)}_`);
  return out.join('\n');
}
/** Pacchetto per la banca in CSV: sezione; voce; valore; qualità; fonte. */
export function bankCsv(pack, lang = 'it') {
  const lg = L(lang), rows = [];
  for (const s of pack.sections) {
    const sec = T(`report.bank.${s.id}`, {}, lg);
    for (const r of s.rows || EMPTY) rows.push({ sec, label: r.label, value: r.text, quality: r.quality || '', source: r.source || '', id: r.id || '' });
    if (s.table) for (const r of s.table.rows) s.table.periods.forEach((p, i) => rows.push({ sec, label: `${r.label?.[lg] || r.label?.it} · ${p.short || p.label}`, value: r.values[i]?.value == null ? null : Math.round(r.values[i].value * 1e4) / 1e4, quality: r.values[i]?.source ? T(`report.src.${r.values[i].source}`, {}, lg) : '', source: unitText(r.unit, lg), id: r.key }));
    for (const e of s.evidence || EMPTY) rows.push({ sec, label: e.title, value: e.dpIds.join(' '), quality: e.expiry || '', source: e.sha256 || '', id: e.id });
  }
  return toCSV(rows, [{ label: 'Sezione', value: r => r.sec }, { label: T('report.col.id', {}, lg), value: r => r.id }, { label: T('report.col.label', {}, lg), value: r => r.label }, { label: T('report.col.value', {}, lg), value: r => r.value },
    { label: T('report.col.quality', {}, lg), value: r => r.quality }, { label: T('report.col.source', {}, lg), value: r => r.source }]);
}

/** Motivo per cui un datapoint non si applica (testo della condizione). */
export const condWhy = (cond, yes) => (VS_CONDITIONS[cond] ? VS_CONDITIONS[cond][yes ? 'yes' : 'no'] : '');
