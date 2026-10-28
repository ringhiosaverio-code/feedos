/* FeedOS 18 · Obiettivi e piano (pacchetto WP7 «piano»): testo del piano di transizione climatica (VS C3) in italiano e inglese.
 * planText(d, modello, lingua, extra) → { lang, title, sub, sections: [{id, title, lines}], complete, missing, c3Text } dal modello di
 * esg-piano.js (planModel); planMarkdown(piano) → testo Markdown con l'avvertenza. Regole fisse e deterministiche, nessuna IA.
 * Non importa esg-piano.js (riceve il modello già calcolato). Funzioni pure, senza orologio, eccezioni o console. */
import { T, fmtNum } from './esg-nlg.js';
import { dateIt } from '../core/util.js';

const A = x => (Array.isArray(x) ? x : []);
const has = v => v != null && String(v).trim() !== '';
const L = lang => (lang === 'en' ? 'en' : 'it');
const dateTxt = (s, lang) => (has(s) ? (L(lang) === 'en' ? String(s).slice(0, 10) : dateIt(String(s).slice(0, 10))) : '');
const GHG = new Set(['s12-abs', 's12-t', 's3-t', 'flag-abs']);

/** Riga di un obiettivo nella lingua scelta. */
const UNIT_EN = { 'per milione di ore': 'per million hours' };
const unitL = (u, lang) => (L(lang) === 'en' ? UNIT_EN[u] || u : u) || '';
/** Riga di un obiettivo nella lingua scelta. */
export function targetLine(t, lang = 'it') {
  const M = t.M || {}, dec = M.dec ?? 1, unit = unitL(M.unit, lang);
  const red = t.baseValue != null && t.targetValue != null && t.baseValue !== 0 ? (t.baseValue - t.targetValue) / Math.abs(t.baseValue) : null;
  const pct = M.dir === 'up'
    ? T('piano.pct.up', { pct: fmtNum(t.targetValue != null && t.baseValue != null ? t.targetValue - t.baseValue : null, '', lang, 0) }, lang)
    : T('piano.pct.down', { pct: fmtNum(red != null ? red * 100 : null, '%', lang, 1) }, lang);
  const typeKey = M.type === 'intensità' ? 'intensita' : M.type === 'quota' ? 'quota' : 'assoluto';
  const mk = 'piano.metric.' + t.metric, mName = T(mk, {}, lang);
  const base = T('piano.plan.target', {
    metric: mName === mk ? t.label : mName, base: fmtNum(t.baseValue, unit, lang, dec), baseLabel: `${L(lang) === 'en' ? 'base year' : 'anno base'} ${t.baseYear ?? '—'}`,
    target: fmtNum(t.targetValue, unit, lang, dec), targetYear: String(t.targetYear ?? '—'), pct, type: T('piano.type.' + typeKey, {}, lang),
    reference: T(t.reference && t.reference !== 'interno' ? 'piano.ref.sbti' : 'piano.ref.interno', {}, lang), status: T('piano.status.' + (t.status || 'proposto'), {}, lang),
  }, lang);
  const g = t.progress;
  if (!g) return base;
  const prog = g.actual == null ? T('piano.plan.noCurrent', {}, lang)
    : T('piano.plan.progress', { actual: fmtNum(g.actual, unit, lang, dec), period: String(g.year ?? ''), path: fmtNum(g.path, unit, lang, dec), state: T('piano.state.' + g.state, {}, lang) }, lang);
  return `${base} ${prog}`;
}

/**
 * Piano di transizione dal modello del piano. extra: {ets (esposizione ETS2 di ets2Plan), roles (esgRoles della governance)}.
 * complete: {targets, actions, governance, verified}; missing: elenco in italiano di cosa manca per un C3 completo.
 */
export function planText(d, model, lang = 'it', extra = {}) {
  const lg = L(lang), S = model.S || {};
  const targets = A(model.targets).filter(t => t.status !== 'ritirato');
  const acts = A(model.live).filter(m => m.status !== 'idea' && !m.noCo2).sort((a, b) => (b.values.tco2Year || 0) - (a.values.tco2Year || 0)).slice(0, 10);
  const sections = [];
  sections.push({ id: 'targets', title: T('piano.plan.targets', {}, lg), lines: targets.length ? targets.map(t => targetLine(t, lg)) : [T('piano.plan.noTargets', {}, lg)] });
  sections.push({ id: 'actions', title: T('piano.plan.actions', {}, lg), lines: acts.length ? acts.map(m => T('piano.plan.action', {
    title: m.title, tco2: fmtNum(m.values.tco2Year, '', lg, 1), capex: fmtNum(m.values.capex, '', lg, 0), year: String(m.startYear ?? '—'), status: T('piano.mstatus.' + m.status, {}, lg) }, lg)) : [T('piano.plan.noActions', {}, lg)] });
  const y0 = model.P?.to ? +model.P.to.slice(0, 4) : null;
  const caps = A(model.capexByYear).filter(x => y0 == null || x.year >= y0).slice(0, 5);
  const capLines = caps.map(x => T('piano.plan.capexYear', { year: String(x.year), capex: fmtNum(x.active + x.idea, '', lg, 0) }, lg));
  if (model.coverage?.ratio != null) capLines.push(T('piano.plan.coverage', { pct: fmtNum(Math.min(9.99, model.coverage.ratio) * 100, '%', lg, 0) }, lg));
  sections.push({ id: 'capex', title: T('piano.plan.capex', {}, lg), lines: capLines.length ? capLines : ['—'] });
  const owner = has(S.planOwner) ? S.planOwner : A(extra.roles).find(r => r && r.id === 'clima-energia')?.responsible || '';
  const gov = [has(S.planApprovedAt) && has(S.planApprover) ? T('piano.plan.approved', { date: dateTxt(S.planApprovedAt, lg), who: S.planApprover }, lg) : T('piano.plan.notApproved', {}, lg)];
  if (owner) gov.push(T('piano.plan.owner', { who: owner }, lg));
  sections.push({ id: 'governance', title: T('piano.plan.governance', {}, lg), lines: gov });
  const verified = S.planVerified === true && has(S.verifier) && targets.some(t => t.status === 'approvato');
  sections.push({ id: 'verification', title: T('piano.plan.verification', {}, lg), lines: [verified ? T('piano.plan.verified', { who: S.verifier, date: dateTxt(S.verifiedAt, lg) || '—' }, lg) : T('piano.plan.notVerified', {}, lg)] });
  const risks = [];
  const ets = extra.ets;
  if (ets && ets.annualTCO2 > 0 && A(ets.prices).length) {
    const ps = [...ets.prices].sort((a, b) => a - b);
    risks.push(T('piano.plan.ets2', { start: String(ets.start), t: fmtNum(ets.annualTCO2, '', lg, 0), low: fmtNum(ets.annualTCO2 * ps[0], '', lg, 0), high: fmtNum(ets.annualTCO2 * ps[ps.length - 1], '', lg, 0), pLow: ps[0], pHigh: ps[ps.length - 1] }, lg));
  }
  if (model.flag?.required) risks.push(T('piano.plan.flag', { pct: fmtNum(model.flag.share * 100, '%', lg, 0), date: dateTxt(model.flag.deadline, lg) }, lg));
  risks.push(T('piano.plan.carbon', { price: fmtNum(S.carbonPrice, '', lg, 0), rate: fmtNum((S.discountRate ?? 0.06) * 100, '%', lg, 1) }, lg));
  risks.push(T('piano.plan.sbtiNote', {}, lg));
  risks.push(T('piano.plan.incentiveNote', {}, lg));
  sections.push({ id: 'risks', title: T('piano.plan.risks', {}, lg), lines: risks });

  const ghg = targets.filter(t => GHG.has(t.metric));
  const complete = {
    targets: ghg.some(t => t.baseValue != null && t.baseYear != null && t.targetValue != null && t.targetYear != null),
    actions: acts.length > 0,
    governance: has(S.planApprovedAt) && has(S.planApprover),
    verified,
  };
  const missing = [];
  if (!complete.targets) missing.push('un obiettivo Scope 1 + 2 con anno e valore base, anno e valore obiettivo');
  if (!complete.actions) missing.push('almeno un’azione approvata, in corso o completata');
  if (!complete.governance) missing.push('data e autore dell’approvazione del piano');
  const c3 = [
    gov[0],
    ghg.length ? `Obiettivi: ${ghg.map(t => targetLine({ ...t, progress: null }, 'it')).join(' ')}` : 'Nessun obiettivo sulle emissioni registrato.',
    acts.length ? `Azioni principali: ${acts.slice(0, 5).map(m => m.title).join('; ')}.` : '',
    caps.length ? `Investimenti previsti: ${caps.map(x => `${x.year} ${fmtNum(x.active + x.idea, '', 'it', 0)} €`).join(', ')}.` : '',
    verified ? `Verificato da terzi: sì (${S.verifier}).` : 'Verificato da terzi: no.',
  ].filter(Boolean).join(' ');
  return { lang: lg, title: T('piano.plan.title', {}, lg), sub: T('piano.plan.sub', {}, lg), sections, complete, missing, c3Text: c3, disclaimer: T('disclaimer', {}, lg) };
}

/** Piano di transizione in Markdown (titolo, sezioni con elenchi puntati, avvertenza). */
export function planMarkdown(plan, company = '') {
  if (!plan) return '';
  const out = [`# ${plan.title}${company ? ` · ${company}` : ''}`, '', `_${plan.sub}_`, ''];
  for (const s of A(plan.sections)) { out.push(`## ${s.title}`, ''); for (const l of A(s.lines)) out.push(`- ${l}`); out.push(''); }
  out.push(`> ${plan.disclaimer}`, '');
  return out.join('\n');
}
