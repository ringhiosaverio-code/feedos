/* FeedOS 18 · Persone e sicurezza (pacchetto WP5): testi ed elenchi esportati, senza intelligenza artificiale.
 * personeMarkdown(riepilogo, lingua): scheda in italiano o inglese per clienti e banche; biennialRows(riepilogo): tabelle di
 * appoggio per il rapporto biennale M/F (solo conteggi e medie di gruppi con almeno 5 persone); datapointRows(datapoint).
 * Funzioni pure sul risultato di personeSummary e personeDatapoints. */
import { T, fmtNum } from './esg-nlg.js';
import { dateIt } from '../core/util.js';
import { CATEGORIES, CATEGORY_LABEL } from '../data/pack-persone.js';
import { PERSONE_METHOD } from './esg-persone.js';

const L = lang => (lang === 'en' ? 'en' : 'it');
const pct = (v, lang, k = 1) => (v == null || !Number.isFinite(+v) ? T('na', {}, lang) : fmtNum(v * 100, '%', lang, k));
const n = (v, lang, k) => (v == null || !Number.isFinite(+v) ? T('na', {}, lang) : fmtNum(v, '', lang, k));
const yn = (v, lang) => (v == null ? T('na', {}, lang) : T(v ? 'persone.yes' : 'persone.no', {}, lang));

/** Scheda «Persone e sicurezza» in Markdown nella lingua indicata (dati pseudonimi, gruppi piccoli non mostrati). */
export function personeMarkdown(S, lang = 'it', company = '') {
  const lg = L(lang), out = [];
  if (!S) return '';
  const P = S.period, sc = S.settings?.smallCell ?? 5;
  out.push(`# ${T('persone.md.title', {}, lg)}${company ? ` · ${company}` : ''}`, '', T('persone.md.period', { label: P.label || P.key || '', from: dateIt(P.from), to: dateIt(P.to) }, lg), '');
  const w = S.wf;
  if (w) {
    out.push(`## ${T('persone.md.workforce', {}, lg)}`, '');
    out.push(T('persone.md.wf', { date: dateIt(w.date), n: w.headcount, fte: n(w.fte, lg, 1), f: w.byGender.F, m: w.byGender.M, perm: w.permanent, temp: w.temporary, agency: n(w.agency, lg, 0), self: n(w.selfEmployed, lg, 0) }, lg));
    if (w.turnover != null) out.push('', T('persone.md.turnover', { v: pct(w.turnover, lg) }, lg));
    if (w.mgmt.total) out.push('', T('persone.md.mgmt', { share: pct(w.mgmt.womenShare, lg, 0), ratio: w.mgmt.ratio == null ? T('na', {}, lg) : fmtNum(w.mgmt.ratio, '', lg, 2) }, lg));
    out.push('', T('persone.md.ccnl', { pct: w.ccnlCoveragePct == null ? T('na', {}, lg) : fmtNum(w.ccnlCoveragePct, '%', lg, 0), ccnl: w.ccnl || T('na', {}, lg), mw: yn(w.minWageOk, lg) }, lg), '');
  }
  const r = S.rates;
  if (r) {
    out.push(`## ${T('persone.md.safety', {}, lg)}`, '');
    out.push(T('persone.md.hours', { h: n(r.hours, lg, 0), q: T('quality.' + r.hoursQuality, {}, lg) }, lg));
    out.push('', T('persone.md.events', { lti: r.lti, rec: r.recordable, fat: r.fatalities, nm: r.nearMiss, iti: r.inItinere }, lg));
    out.push('', T('persone.md.rates', { if: n(r.ifr, lg, 1), ig: n(r.igr, lg, 2), b9: n(r.b9, lg, 1) }, lg), '');
  }
  const t = S.training;
  if (t) {
    const g = x => (x?.value == null ? T('persone.md.notShown', {}, lg) : n(x.value, lg, 1));
    out.push(`## ${T('persone.md.training', {}, lg)}`, '', T('persone.md.training.line', { total: n(t.total, lg, 0), per: n(t.perEmployee, lg, 1), f: g(t.perF), m: g(t.perM) }, lg), '');
  }
  const pg = S.pay;
  if (pg) {
    out.push(`## ${T('persone.md.pay', {}, lg)}`, '');
    out.push(pg.overall.suppressed ? T('persone.md.pay.none', { n: sc }, lg) : T('persone.md.pay.line', { mean: pct(pg.overall.meanGap, lg), median: pct(pg.overall.medianGap, lg), nf: pg.nF, nm: pg.nM }, lg));
    out.push('', T('persone.md.suppressed', { n: sc }, lg), '');
  }
  const m = PERSONE_METHOD[lg] || PERSONE_METHOD.it;
  out.push(`## ${T('persone.md.method', {}, lg)}`, '', ...m.split(/\n\s*\n/).flatMap(p => [p.trim(), '']), `_${T('disclaimer', {}, lg)}_`, '');
  return out.join('\n');
}

/**
 * Tabelle di appoggio per il rapporto biennale sulla situazione del personale (art. 46 D.Lgs. 198/2006): organico per categoria
 * e genere, entrate e uscite, formazione per genere, retribuzione media per categoria e genere solo per gruppi con almeno 5 persone.
 * → [{sezione, voce, donne, uomini, totale, nota}] (si esporta in CSV; i valori si ricopiano sul portale del Ministero).
 */
export function biennialRows(S) {
  const rows = [];
  const w = S?.wf;
  if (!w) return rows;
  const sc = S.settings?.smallCell ?? 5;
  for (const c of CATEGORIES) {
    const x = w.byCategory[c];
    if (x.total) rows.push({ sezione: 'Organico al ' + dateIt(w.date), voce: CATEGORY_LABEL[c], donne: x.F, uomini: x.M, totale: x.total, nota: '' });
  }
  for (const [k, label] of [['indeterminato', 'Tempo indeterminato'], ['apprendistato', 'Apprendistato'], ['determinato', 'Tempo determinato']]) {
    const x = w.contractGender[k];
    if (x.F + x.M + x.nd) rows.push({ sezione: 'Organico per contratto', voce: label, donne: x.F, uomini: x.M, totale: x.F + x.M + x.nd, nota: '' });
  }
  rows.push({ sezione: 'Movimenti del periodo', voce: 'Entrate', donne: w.hires.F, uomini: w.hires.M, totale: w.hires.total, nota: '' });
  rows.push({ sezione: 'Movimenti del periodo', voce: 'Uscite (escluse le scadenze dei contratti a termine)', donne: w.leavers.F, uomini: w.leavers.M, totale: w.leavers.total, nota: '' });
  rows.push({ sezione: 'Movimenti del periodo', voce: 'Congedi parentali usati', donne: w.parental.F, uomini: w.parental.M, totale: w.parental.F + w.parental.M, nota: '' });
  const t = S.training;
  if (t) rows.push({ sezione: 'Formazione', voce: 'Ore-persona di formazione', donne: Math.round(t.hoursF), uomini: Math.round(t.hoursM), totale: Math.round(t.total), nota: '' });
  const pg = S.pay;
  if (pg) for (const c of pg.byCategory) rows.push({ sezione: 'Retribuzione media annua riportata al tempo pieno (€)', voce: CATEGORY_LABEL[c.category] || c.category,
    donne: c.suppressed ? null : Math.round(c.meanF), uomini: c.suppressed ? null : Math.round(c.meanM), totale: null, nota: c.suppressed ? `non mostrata: ${c.note} (meno di ${sc} persone per genere)` : '' });
  return rows;
}
export const BIENNIAL_COLS = [{ key: 'sezione', label: 'Sezione' }, { key: 'voce', label: 'Voce' }, { key: 'donne', label: 'Donne' }, { key: 'uomini', label: 'Uomini' }, { key: 'totale', label: 'Totale' }, { key: 'nota', label: 'Nota' }];
