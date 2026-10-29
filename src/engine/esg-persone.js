/* FeedOS 18 · Persone e sicurezza (pacchetto WP5 «persone»): segnali, sezione del report, KPI, regole della qualità dei dati,
 * datapoint del VS (B1 dipendenti, B8, B9, B10, C5), scadenze per il calendario e riepilogo della pagina. I calcoli stanno in
 * esg-persone-calc.js (organico, ore, indici, formazione, divario, obblighi, PdR 125, OT23), i testi esportati in esg-persone-text.js.
 * Contratto (07-contract §2 e §4): firme fisse; funzioni pure (oggi da ctx.today o esgToday), nessuna eccezione su archivi vuoti.
 * Non importa i registri (kpis, dataquality, providers, signals, report, esg-registry, derived, store): sono loro a importarlo.
 * Due edizioni: la scheda è visibile in FeedOS e in DifesaOS; testi neutri («stabilimento», «linea»), temi di formazione e
 * riferimenti di settore filtrati con sectorOf(d); se un'edizione nasconde la scheda, niente segnali, sezione né scadenze. */
import { addDays, addMonths, daysBetween, dateIt, nf, endOfMonth } from '../core/util.js';
import { esgToday, currentPeriod, previousPeriod, sectorOf } from './esg-years.js';
import { T, deltaPhrase, listJoin } from './esg-nlg.js';
import { evidenceFor } from './esg-governance.js';
import { esgThresholds } from './esg-piano.js';
import { META } from '../editions/meta.js';
import { CATEGORIES, CATEGORY_LABEL } from '../data/pack-persone.js';
import {
  A, isObj, fin, isIso, inP, cached, personeSettings, personePack, packItem, sectorBand, workforce, snapshots, snapshotStats, hoursFor, safetyRates,
  trainingStats, trainingExpiries, payGapFor, payTransparencyDuties, biennialReportDue, pdr125Score, ot23Total, ot23Year, ot23Reduction, actionsState,
  monthsWithoutHours, isRecordable,
} from './esg-persone-calc.js';

export * from './esg-persone-calc.js';

/** La scheda «Persone e sicurezza» esiste in questa edizione? */
export const PERSONE_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('persone'));
const LINK = id => ({ area: 'esg', tab: 'persone', ...(id ? { id } : {}) });
const todayOf = (d, ctx) => (ctx && typeof ctx.today === 'string' && isIso(ctx.today) ? ctx.today.slice(0, 10) : esgToday(d));
const pctTxt = (v, k = 1) => (v == null || !Number.isFinite(+v) ? 'n.d.' : `${nf(v * 100, k)}%`);
const num = (v, k = 1) => (v == null || !Number.isFinite(+v) ? 'n.d.' : nf(v, k));
const pl = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
/** Il pacchetto ha dati nell'archivio? (senza dati non si producono segnali né scadenze generiche) */
export const inUse = d => ['hrSnapshots', 'hoursWorked', 'injuries', 'trainings', 'payData', 'pdr125', 'ot23', 'safetyActions'].some(c => A(d?.[c]).length > 0);

/* ---------------- riepilogo per la pagina ---------------- */
/** Modello di lettura della scheda per il periodo P (esercizio ESG) con il periodo precedente per i confronti. */
export function personeSummary(d, P) {
  if (!isObj(d)) return null;
  const PP = P && isIso(P.from) ? P : currentPeriod(d);
  const prev = PP.key ? previousPeriod(d, PP.key) : null;
  const today = esgToday(d);
  const st = personeSettings(d);
  const wf = workforce(d, PP), wfPrev = prev ? workforce(d, prev) : null;
  const rates = safetyRates(d, PP), ratesPrev = prev ? safetyRates(d, prev) : null;
  const training = trainingStats(d, PP, wf), trainingPrev = prev ? trainingStats(d, prev, wfPrev) : null;
  const pay = payGapFor(d, PP);
  const avg = wf?.avgHeadcount ?? wf?.headcount ?? null;
  const yr = A(d.pdr125).filter(r => r && fin(r.year)).sort((a, b) => b.year - a.year)[0] || null;
  const otY = ot23Year(today);
  const ot = A(d.ot23).find(r => r && +r.year === otY) || null;
  return {
    period: { key: PP.key || null, from: PP.from, to: PP.to, label: PP.label || '', short: PP.short || '' }, prev: prev ? { key: prev.key, label: prev.label, short: prev.short, from: prev.from, to: prev.to } : null,
    today, sector: sectorOf(d), settings: st, pack: personePack(d), band: sectorBand(d),
    wf, wfPrev, rates, ratesPrev, training, trainingPrev, trainingTarget: esgThresholds(d).trainingH,
    expiries: trainingExpiries(d, today), actions: actionsState(d, today), pay,
    duties: payTransparencyDuties(d, avg, today), biennial: biennialReportDue(d, wf?.headcount ?? null),
    pdr: yr ? { row: yr, ...pdr125Score(yr.scores, packItem(d, 'pdr125') || undefined) } : null,
    ot23: { year: otY, due: `${otY + 1}-02-28`, row: ot, ...ot23Total(ot, packItem(d, 'ot23') || undefined), reduction: ot23Reduction(d, wf?.fte ?? null) },
    missingHours: monthsWithoutHours(d, PP, today), inUse: inUse(d),
  };
}

/* ---------------- segnali ---------------- */
/** Segnali di «Oggi»: corsi obbligatori in scadenza, ore mancanti, azioni in ritardo, divario retributivo, OT23, indice di frequenza in salita. */
export function personeSignals(d, ctx) {
  if (!PERSONE_TAB || !isObj(d) || !inUse(d)) return [];
  const today = todayOf(d, ctx), out = [];
  const st = personeSettings(d);
  for (const x of trainingExpiries(d, today)) {
    if (x.days == null || x.days > st.signalDays || x.days < -180) continue;
    const over = x.days < 0;
    out.push({ key: `persone:training-expiry:${x.id}:${x.due}`, area: 'esg', roles: ['produzione', 'direzione'], severity: over ? 'critico' : 'attenzione',
      title: over ? `Formazione scaduta: ${x.course}` : `Formazione da rinnovare entro il ${dateIt(x.due)}: ${x.course}`,
      why: `${over ? `Scaduta da ${-x.days} giorni` : x.days === 0 ? 'Scade oggi' : `Mancano ${x.days} giorni`} per ${pl(x.participants, 'persona formata', 'persone formate')} il ${dateIt(x.date)}${x.law ? ` (${x.law})` : ''}.`,
      action: 'Fissare la sessione di aggiornamento e registrarla in ESG › Persone › Formazione.', impact: over ? 6e4 : 3e4 - x.days * 500, link: LINK('formazione') });
  }
  const P = currentPeriod(d);
  if (A(d.hoursWorked).length) for (const m of monthsWithoutHours(d, P, today).slice(-3))
    out.push({ key: `persone:hours-missing:${m}`, area: 'esg', roles: ['direzione'], severity: 'attenzione', title: `Ore lavorate di ${dateIt(m + '-01', 'month')} da registrare`,
      why: `Lo stabilimento ha prodotto nel mese ma le ore non sono nel registro: gli indici di sicurezza usano una stima di ${nf(st.hoursPerFteFallback)} h l’anno per ETP.`,
      action: 'Inserire le ore dal libro unico del lavoro in ESG › Persone › Sicurezza.', impact: 8000, link: LINK('sicurezza') });
  for (const a of actionsState(d, today).late)
    out.push({ key: `persone:action-late:${a.id}`, area: 'esg', roles: ['produzione'], severity: 'attenzione', title: `Azione di sicurezza in ritardo: ${String(a.text || '').slice(0, 70)}`,
      why: `Scadenza ${dateIt(a.due)} passata da ${daysBetween(a.due, today)} giorni; responsabile ${a.owner || 'da assegnare'}.`,
      action: 'Completare l’azione o aggiornare la scadenza con il motivo.', impact: 2e4 + daysBetween(a.due, today) * 200, link: LINK('sicurezza') });
  const pg = payGapFor(d, P);
  if (pg && (pg.overallOver || pg.flag5))
    out.push({ key: `persone:paygap:${P.key}`, area: 'esg', roles: ['direzione'], severity: 'attenzione',
      title: pg.flag5 ? `Divario retributivo di genere oltre il ${nf(st.gapThresholdPct)}% tra ${listJoin(pg.flagged.map(c => (CATEGORY_LABEL[c] || c).toLowerCase()))}` : `Divario retributivo di genere del ${pctTxt(pg.overall.meanGap)}, oltre la soglia del ${nf(st.gapThresholdPct)}%`,
      why: `${pg.flag5 ? `Nella categoria il divario medio è ${listJoin(pg.byCategory.filter(c => pg.flagged.includes(c.category)).map(c => `${pctTxt(c.meanGap)} (${c.nF} donne, ${c.nM} uomini)`))}; complessivo ${pctTxt(pg.overall.meanGap)}.` : pg.byCategory.some(c => !c.suppressed) ? 'Nelle categorie confrontabili il divario resta sotto la soglia: pesa la composizione per categoria.' : `Nessuna categoria ha almeno ${st.smallCell} donne e ${st.smallCell} uomini: il divario complessivo risente anche della composizione per categoria.`} Gruppi con meno di ${st.smallCell} persone non mostrati.`,
      action: 'Verificare le cause (categoria, livello, anzianità, variabile) e documentare i criteri oggettivi in ESG › Persone › Parità.', impact: 1.5e4, link: LINK('parita') });
  const md = today.slice(5, 10);
  if (md >= '01-01' && md <= '02-28') {
    const y = +today.slice(0, 4) - 1;
    const r = A(d.ot23).find(x => x && +x.year === y);
    if (!r?.submittedAt) out.push({ key: `persone:ot23:${y}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `INAIL OT23: domanda per gli interventi del ${y} entro il 28/02`,
      why: r ? `${ot23Total(r).points} punti registrati su una soglia di ${ot23Total(r).threshold} (da verificare sul modello dell’anno).` : 'Nessun intervento di prevenzione registrato per l’anno scorso.',
      action: 'Raccogliere le evidenze degli interventi e presentare la domanda in ESG › Persone › OT23.', impact: 1e4, link: LINK('ot23') });
  }
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const cur = safetyRates(d, { from: addMonths(lastClosed, -11) + '-01', to: endOfMonth(lastClosed) });
  const prv = safetyRates(d, { from: addMonths(lastClosed, -23) + '-01', to: endOfMonth(addMonths(lastClosed, -12)) });
  if (cur?.ifr != null && prv?.ifr != null && cur.lti >= 2 && cur.ifr > prv.ifr * 1.2)
    out.push({ key: `persone:if-up:${lastClosed}`, area: 'esg', roles: ['produzione', 'direzione'], severity: 'attenzione', title: `Indice di frequenza in salita: ${num(cur.ifr)} per milione di ore`,
      why: `Negli ultimi 12 mesi ${pl(cur.lti, 'infortunio con assenza', 'infortuni con assenza')} (${num(cur.ifr)} per 10⁶ h) contro ${num(prv.ifr)} nei 12 mesi prima.`,
      action: 'Rivedere le cause nel registro e le azioni correttive con l’RSPP.', impact: 4e4, link: LINK('sicurezza') });
  const acted = new Set(A(d.safetyActions).map(a => a?.injuryId).filter(Boolean));
  for (const i of A(d.injuries).filter(x => x && isRecordable(x) && isIso(x.date) && daysBetween(x.date, today) >= 0 && daysBetween(x.date, today) <= 120 && !acted.has(x.id)))
    out.push({ key: `persone:injury-noaction:${i.id}`, area: 'esg', roles: ['produzione'], severity: 'attenzione', title: `Infortunio del ${dateIt(i.date)} senza azione correttiva`,
      why: `${i.cause || 'Causa non indicata'}${i.area ? ` · ${i.area}` : ''}: nessuna azione collegata nel registro.`, action: 'Registrare l’azione correttiva con responsabile e scadenza.', impact: 2.5e4, link: LINK('sicurezza') });
  return out;
}

/* ---------------- sezione del report «Persone e sicurezza» (85) ---------------- */
export function personeReportSection(d, ctx, P, C) {
  if (!PERSONE_TAB || !isObj(d) || !P || !isIso(P.from) || !inUse(d)) return null;
  const wf = workforce(d, P), r = safetyRates(d, P), tr = trainingStats(d, P, wf), pg = payGapFor(d, P);
  if (!wf && !r && !tr) return null;
  const Cok = C && isIso(C.from) && !C.budget;
  const rc = Cok ? safetyRates(d, C) : null, wc = Cok ? workforce(d, C) : null, tc = Cok ? trainingStats(d, C, wc) : null;
  const acts = actionsState(d, todayOf(d, ctx));
  const cmp = (v, kind, good) => (v != null && Number.isFinite(v) ? { value: v, kind, good, label: C.label || 'periodo di confronto' } : undefined);
  const est = r?.hoursQuality === 'stimato' ? ' (ore in parte stimate)' : '';
  const kpis = [
    { label: 'Dipendenti a fine periodo', value: wf?.headcount ?? null, unit: '', decimals: 0, note: wf ? `${pctTxt(wf.womenShare, 0)} donne · ${nf(wf.fte, 1)} ETP` : undefined, cmp: Cok ? cmp(wc?.headcount, 'flow', null) : undefined },
    { label: 'Turnover', value: wf?.turnover ?? null, unit: '%', decimals: 1 },
    { label: 'Indice di frequenza (UNI 7249)', value: r?.ifr ?? null, unit: 'per 10⁶ h', decimals: 1, note: est || undefined, cmp: Cok ? cmp(rc?.ifr, 'ratio', 'down') : undefined },
    { label: 'Indice di gravità (UNI 7249)', value: r?.igr ?? null, unit: 'per 10³ h', decimals: 2, cmp: Cok ? cmp(rc?.igr, 'ratio', 'down') : undefined },
    { label: 'Infortuni registrabili (VS B9)', value: r?.b9 ?? null, unit: 'per 200.000 h', decimals: 1, note: r ? `${r.recordable} eventi, ${r.fatalities} decessi` : undefined, cmp: Cok ? cmp(rc?.b9, 'ratio', 'down') : undefined },
    { label: 'Ore di formazione per dipendente', value: tr?.perEmployee ?? null, unit: 'h', decimals: 1, cmp: Cok ? cmp(tc?.perEmployee, 'flow', 'up') : undefined },
    { label: 'Divario retributivo di genere (medio)', value: pg?.overall?.meanGap ?? null, unit: '%', decimals: 1, note: pg?.overall?.suppressed ? `non mostrato: ${pg.overall.note}` : undefined },
    { label: 'Azioni di sicurezza aperte', value: acts.open.length, unit: '', decimals: 0, note: acts.late.length ? `${acts.late.length} in ritardo` : 'nessuna in ritardo' },
  ];
  const narrative = [];
  if (wf) narrative.push(`Al ${dateIt(wf.date)} ${pl(wf.headcount, 'dipendente', 'dipendenti')} (${nf(wf.fte, 1)} ETP): ${wf.byGender.F} donne e ${wf.byGender.M} uomini; ${wf.permanent} a tempo indeterminato (apprendisti compresi) e ${wf.temporary} a termine${fin(wf.agency) ? `, più ${pl(wf.agency, 'somministrato', 'somministrati')}` : ''}. Turnover ${pctTxt(wf.turnover)}${wc ? `; organico ${deltaPhrase(wf.headcount, wc.headcount, { unit: 'persone' })}` : ''}.`);
  if (r) narrative.push(`Sicurezza: ${pl(r.lti, 'infortunio con assenza', 'infortuni con assenza')} e ${pl(r.recordable, 'infortunio registrabile', 'infortuni registrabili')} su ${num(r.hours, 0)} ore${est}; indice di frequenza ${num(r.ifr)} per milione di ore${rc?.ifr != null ? `, ${deltaPhrase(r.ifr, rc.ifr, { good: 'down', kind: 'ratio' })}` : ''}; tasso VS B9 ${num(r.b9)} ogni 200.000 ore; ${r.fatalities ? `${r.fatalities} decessi` : 'nessun decesso'}; ${pl(r.nearMiss, 'quasi infortunio segnalato', 'quasi infortuni segnalati')}.`);
  if (tr) narrative.push(`Formazione: ${num(tr.total, 0)} ore-persona, ${num(tr.perEmployee)} ore per dipendente${tr.perF.value != null && tr.perM.value != null ? ` (donne ${num(tr.perF.value)}, uomini ${num(tr.perM.value)})` : ' (dato per genere non mostrato per gruppi piccoli)'}.`);
  if (pg) narrative.push(pg.overall.suppressed ? `Divario retributivo non mostrato: ${pg.overall.note}.` : `Divario retributivo di genere medio ${pctTxt(pg.overall.meanGap)} e mediano ${pctTxt(pg.overall.medianGap)} sulla retribuzione annua riportata al tempo pieno; ${pg.suppressed.length ? `${pg.suppressed.length} gruppi sotto ${pg.smallCell} persone non mostrati` : 'nessun gruppo soppresso'}.`);
  if (acts.open.length) narrative.push(`${pl(acts.open.length, 'azione correttiva aperta', 'azioni correttive aperte')}${acts.late.length ? `, ${acts.late.length} in ritardo` : ''}.`);
  narrative.push(T('disclaimer'));
  const rows = wf ? CATEGORIES.map(c => ({ categoria: CATEGORY_LABEL[c], donne: wf.byCategory[c].F, uomini: wf.byCategory[c].M, totale: wf.byCategory[c].total, etp: wf.byCategory[c].fte })).filter(x => x.totale > 0) : [];
  return {
    id: 'esg-persone', title: 'Persone e sicurezza', order: 85, kpis,
    table: rows.length ? { cols: [{ key: 'categoria', label: 'Categoria', fmt: 'text' }, { key: 'donne', label: 'Donne', fmt: 'num', align: 'r' }, { key: 'uomini', label: 'Uomini', fmt: 'num', align: 'r' }, { key: 'totale', label: 'Totale', fmt: 'num', align: 'r' }, { key: 'etp', label: 'ETP', fmt: 'num2', align: 'r' }], rows } : undefined,
    narrative,
  };
}

/* ---------------- KPI (catalogo, area esg) ---------------- */
export const PERSONE_KPIS = [
  { id: 'esg-if', label: 'Indice di frequenza infortuni', unit: 'per 10⁶ h', kind: 'ratio', dir: 'down', area: 'esg', link: LINK('sicurezza'), decimals: 1, hist: true, src: 'hoursWorked',
    def: 'Infortuni con almeno un giorno di assenza oltre quello dell’evento × 1.000.000 ÷ ore lavorate dai dipendenti (UNI 7249). Esclusi gli infortuni in itinere; i mesi senza ore registrate si stimano con ETP × 1.720 h ÷ 12.',
    compute: (d, ctx, P) => safetyRates(d, P)?.ifr ?? null },
  { id: 'esg-b9', label: 'Infortuni registrabili ogni 200.000 ore', unit: 'per 200.000 h', kind: 'ratio', dir: 'down', area: 'esg', link: LINK('sicurezza'), decimals: 1, hist: false, src: 'hoursWorked',
    def: 'Infortuni sul lavoro registrabili × 200.000 ÷ ore lavorate dai dipendenti (VS B9): 200.000 ore sono 100 persone a tempo pieno per un anno.',
    compute: (d, ctx, P) => safetyRates(d, P)?.b9 ?? null },
  { id: 'esg-formazione-h', label: 'Ore di formazione per dipendente', unit: 'h', kind: 'flow', dir: 'up', area: 'esg', link: LINK('formazione'), decimals: 1, hist: false, src: 'trainings',
    def: 'Ore-persona di formazione con data nel periodo (durata × partecipanti) ÷ dipendenti della fotografia dell’organico del periodo (VS B10).',
    compute: (d, ctx, P) => { const w = workforce(d, P) || workforce(d, currentPeriod(d)); return trainingStats(d, P, w)?.perEmployee ?? null; } },
  { id: 'esg-gap-genere', label: 'Divario retributivo di genere', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'esg', link: LINK('parita'), decimals: 1, hist: false, src: 'payData',
    def: '(Retribuzione media degli uomini − retribuzione media delle donne) ÷ retribuzione media degli uomini, sulla retribuzione annua lorda (fissa e variabile) riportata al tempo pieno; non mostrato se uno dei due gruppi ha meno di 5 persone.',
    compute: (d, ctx, P) => payGapFor(d, P)?.overall?.meanGap ?? null },
  { id: 'esg-donne-resp', label: 'Donne in ruoli di responsabilità', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: LINK('organico'), decimals: 0, hist: false, src: 'hrSnapshots',
    def: 'Donne tra dirigenti e quadri ÷ dirigenti e quadri, alla data della fotografia dell’organico del periodo (VS C5).',
    compute: (d, ctx, P) => workforce(d, P)?.mgmt?.womenShare ?? null },
];

/* ---------------- regole della qualità dei dati R38-R41 ---------------- */
const SURVEY_CAT = { Dirigenti: 'dirigenti', Quadri: 'quadri', Impiegati: 'impiegati', Operai: 'operai' };
export const PERSONE_RULES = [
  { id: 'R38', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing', 'import'], label: 'Infortunio senza «registrabile» o senza giorni di assenza',
    check: d => {
      const rows = A(d?.injuries).filter(i => i && i.kind === 'infortunio');
      return { base: rows.length, fails: rows.filter(i => typeof i.recordable !== 'boolean' || !fin(i.lostDays)).map(i => ({ id: i.id, coll: 'injuries', msg: `Infortunio del ${isIso(i.date) ? dateIt(i.date) : 'data n.d.'}: indicare se è registrabile e i giorni di assenza (0 se nessuno)`, link: LINK('sicurezza') })) };
    } },
  { id: 'R39', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Mese con produzione e senza ore lavorate',
    check: (d, ctx) => {
      if (!A(d?.hoursWorked).length && !A(d?.hrSnapshots).length) return { base: 0, fails: [] };
      const P = currentPeriod(d), today = todayOf(d, ctx);
      const prod = [...new Set(A(d?.runs).filter(r => r && inP(r.date, P) && r.date.slice(0, 7) <= addMonths(today.slice(0, 7), -1)).map(r => r.date.slice(0, 7)))];
      const miss = monthsWithoutHours(d, P, today);
      return { base: prod.length, fails: miss.map(m => ({ id: m, coll: 'hoursWorked', msg: `${dateIt(m + '-01', 'month')}: ore lavorate non registrate (gli indici usano una stima)`, link: LINK('sicurezza') })) };
    } },
  { id: 'R40', area: 'esg', severity: 'info', weight: 1, scope: ['all'], label: 'Organico diverso dal questionario ESG',
    check: d => {
      const sv = isObj(d?.survey?.['pe-cat']) ? d.survey['pe-cat'] : null;
      const all = snapshots(d), last = all[all.length - 1];
      if (!sv || !last) return { base: 0, fails: [] };
      const st = snapshotStats(last);
      const diff = Object.entries(SURVEY_CAT).filter(([k, c]) => fin(sv[k]) && +sv[k] !== st.byCategory[c].total);
      return { base: 1, fails: diff.length ? [{ id: last.id, coll: 'hrSnapshots', msg: `Fotografia al ${dateIt(last.date)} diversa dal questionario: ${diff.map(([k, c]) => `${k.toLowerCase()} ${st.byCategory[c].total} contro ${sv[k]}`).join(', ')}`, link: LINK('organico') }] : [] };
    } },
  { id: 'R41', area: 'esg', severity: 'info', weight: 1, scope: ['all'], label: 'Gruppi con meno di 5 persone (valori non mostrati)',
    check: d => {
      const P = currentPeriod(d), pg = payGapFor(d, P), w = workforce(d, P), sc = personeSettings(d).smallCell;
      const fails = [];
      if (pg) for (const s of pg.suppressed) fails.push({ id: `${s.group}:${s.gender}`, coll: 'payData', msg: `Divario retributivo, ${s.group === 'totale' ? 'totale' : CATEGORY_LABEL[s.group] || s.group}: ${s.gender === 'F' ? 'donne' : 'uomini'} ${s.n} (< ${sc}), valore non mostrato`, link: LINK('parita') });
      if (w) for (const g of ['F', 'M']) if (w.byGender[g] > 0 && w.byGender[g] < sc) fails.push({ id: `formazione:${g}`, coll: 'trainings', msg: `Ore di formazione per genere: ${g === 'F' ? 'donne' : 'uomini'} ${w.byGender[g]} (< ${sc}), media non mostrata`, link: LINK('formazione') });
      const base = (pg ? pg.byCategory.length * 2 + 2 : 0) + (w ? 2 : 0);
      return { base, fails };
    } },
];

/* ---------------- datapoint del VS ---------------- */
const dp = (value, unit, quality, fn, extra = {}) => ({ value, unit, quality, source: `persone.${fn}`, ...extra });
const evIds = (d, id) => { try { return [...new Set([...evidenceFor(d, 'datapoint', id), ...evidenceFor(d, 'vs', id)].map(e => e.id))]; } catch { return []; } };
/** Datapoint: B1 dipendenti, B8 (contratto, genere, paese, turnover), B9 (registrabili, tasso, decessi, ore), B10 (salario minimo, divario, CCNL, formazione), C5. */
export function personeDatapoints(d, P) {
  if (!isObj(d) || !P || !isIso(P.from)) return {};
  const out = {};
  const ev = id => { const x = evIds(d, id); return x.length ? { evidence: x } : {}; };
  const wf = workforce(d, P);
  if (wf) {
    const src = wf.source;
    out['B1.employees'] = dp(wf.headcount, 'persone', 'misurato', 'workforce', { method: `Dipendenti (persone) alla fine del periodo: ${src}`, note: `${nf(wf.fte, 1)} ETP`, ...ev('B1.employees') });
    out['B8.by-contract'] = dp({ indeterminato: wf.permanent, determinato: wf.temporary }, 'persone', 'misurato', 'workforce', { method: 'Persone per tipo di contratto alla fine del periodo; l’apprendistato è un contratto a tempo indeterminato', note: wf.byContract.apprendistato ? `di cui ${wf.byContract.apprendistato} in apprendistato` : undefined, ...ev('B8.by-contract') });
    out['B8.by-gender'] = dp({ donne: wf.byGender.F, uomini: wf.byGender.M, ...(wf.byGender.nd ? { altro: wf.byGender.nd } : {}) }, 'persone', 'misurato', 'workforce', { method: 'Persone per genere alla fine del periodo', ...ev('B8.by-gender') });
    out['B8.by-country'] = dp({ [wf.country === 'IT' ? 'italia' : wf.country.toLowerCase()]: wf.headcount }, 'persone', 'misurato', 'workforce', { method: 'Paese del contratto di lavoro' });
    if (wf.turnover != null) out['B8.turnover'] = dp(wf.turnover * 100, '%', 'calcolato', 'workforce', { method: `Uscite nel periodo (dimissioni, licenziamenti, pensionamenti, decessi; escluse le scadenze dei contratti a termine) ÷ organico medio (${wf.avgSrc})`, note: `${wf.leavers.total} uscite` });
    if (typeof wf.minWageOk === 'boolean') out['B10.min-wage'] = dp(wf.minWageOk, null, 'dichiarato', 'workforce', { method: `Retribuzioni confrontate con i minimi del contratto collettivo applicato${wf.ccnl ? ` (${wf.ccnl})` : ''}`, ...ev('B10.min-wage') });
    if (wf.ccnlCoveragePct != null) out['B10.ccnl'] = dp(wf.ccnlCoveragePct, '%', 'dichiarato', 'workforce', { method: `Dipendenti coperti da contratti collettivi${wf.ccnl ? `: ${wf.ccnl}` : ''}`, ...ev('B10.ccnl') });
    if (wf.mgmt.total > 0 && wf.mgmt.M > 0) out['C5.mgmt-ratio'] = dp(Math.round(wf.mgmt.ratio * 100) / 100, 'rapporto', 'calcolato', 'workforce', { method: 'Donne ÷ uomini tra dirigenti e quadri alla fine del periodo', note: `${wf.mgmt.F} donne e ${wf.mgmt.M} uomini` });
    if (wf.selfEmployed != null) out['C5.self-employed'] = dp(wf.selfEmployed, 'persone', 'dichiarato', 'workforce', { method: 'Lavoratori autonomi senza dipendenti che lavorano in esclusiva per l’impresa, alla fine del periodo' });
    if (wf.agency != null) out['C5.agency'] = dp(wf.agency, 'persone', 'dichiarato', 'workforce', { method: 'Lavoratori somministrati da agenzie alla fine del periodo' });
  }
  const r = safetyRates(d, P);
  if (r && r.hours != null) {
    const q = r.hoursQuality === 'stimato' ? 'stimato' : 'calcolato';
    const estNote = r.hoursEstimated.length ? `ore stimate per ${r.hoursEstimated.length} mesi (ETP × ${nf(r.perFte)} h ÷ 12)` : undefined;
    out['B9.recordable'] = dp(r.recordable, 'n', 'misurato', 'safetyRates', { method: 'Infortuni sul lavoro registrabili con data nel periodo (registro degli infortuni; esclusi in itinere e quasi infortuni)', ...ev('B9.recordable') });
    out['B9.recordable-rate'] = dp(Math.round(r.b9 * 100) / 100, 'per 200.000 h', q, 'safetyRates', { method: `Infortuni registrabili × 200.000 ÷ ore lavorate: ${r.formulas.b9}`, note: estNote, ...ev('B9.recordable-rate') });
    out['B9.fatalities'] = dp(r.fatalities, 'n', 'misurato', 'safetyRates', { method: 'Decessi per infortuni sul lavoro o malattie professionali nel periodo', ...ev('B9.fatalities') });
    out['B9.hours'] = dp(Math.round(r.hours), 'h', r.hoursQuality === 'stimato' ? 'stimato' : 'misurato', 'hoursFor', { method: 'Ore lavorate dai dipendenti (registro mensile delle ore)', note: estNote });
  }
  const tr = trainingStats(d, P, wf);
  if (tr && wf) {
    const v = { totale: Math.round(tr.perEmployee * 10) / 10 };
    if (tr.perF.value != null) v.donne = Math.round(tr.perF.value * 10) / 10;
    if (tr.perM.value != null) v.uomini = Math.round(tr.perM.value * 10) / 10;
    const sup = [tr.perF.suppressed ? 'donne' : null, tr.perM.suppressed ? 'uomini' : null].filter(Boolean);
    out['B10.training-h'] = dp(v, 'h', 'misurato', 'trainingStats', { method: 'Ore-persona di formazione nel periodo ÷ dipendenti, totale e per genere', note: sup.length ? `media non mostrata per ${sup.join(' e ')} (gruppo con meno di ${personeSettings(d).smallCell} persone)` : undefined, ...ev('B10.training-h') });
  }
  const pg = payGapFor(d, P);
  if (pg && !pg.overall.suppressed && pg.overall.meanGap != null)
    out['B10.pay-gap'] = dp(Math.round(pg.overall.meanGap * 1000) / 10, '%', 'calcolato', 'payGap', { method: '(media uomini − media donne) ÷ media uomini sulla retribuzione annua lorda riportata al tempo pieno (dati pseudonimi)', note: `mediana ${pctTxt(pg.overall.medianGap)}; ${pg.nF} donne e ${pg.nM} uomini`, ...ev('B10.pay-gap') });
  return out;
}

/* ---------------- scadenze per il calendario degli adempimenti ---------------- */
/** Scadenze: aggiornamenti della formazione obbligatoria, domanda INAIL OT23 (chiave con «ot23»), azioni di sicurezza, rinnovo UNI/PdR 125. */
export function personeCalendarItems(d, today) {
  if (!PERSONE_TAB || !isObj(d) || !inUse(d)) return [];
  const t = isIso(today) ? today.slice(0, 10) : esgToday(d);
  return cached('cal|' + t, [d.trainings, d.ot23, d.safetyActions, d.pdr125, d.companyCerts, d.settings, d.hrSnapshots, d.injuries], () => {
    const pack = personePack(d), out = [];
    for (const x of trainingExpiries(d, t)) {
      if (!x.due || x.days < -90 || x.days > 400) continue;
      out.push({ key: `persone:formazione:${x.id}:${x.due}`, date: x.due, title: `Aggiornamento della formazione: ${x.course}`, area: 'esg', pkg: 'persone', kind: 'rinnovo',
        ...(x.law ? { law: x.law } : {}), source: x.validSrc === 'corso' ? 'registro della formazione' : 'pacchetto persone', validAsOf: pack.validAsOf, owner: 'RSPP', link: LINK('formazione') });
    }
    const it = packItem(d, 'ot23'), y = ot23Year(t), row = A(d.ot23).find(r => r && +r.year === y);
    if (!row?.submittedAt) out.push({ key: `persone:ot23:${y}`, date: `${y + 1}-${it?.due || '02-28'}`, title: `INAIL OT23: domanda per gli interventi di prevenzione del ${y}`, area: 'esg', pkg: 'persone', kind: 'scadenza',
      law: it?.law || 'Modulo OT23 INAIL', source: it?.source || 'INAIL', validAsOf: pack.validAsOf, owner: 'RSPP', link: LINK('ot23') });
    for (const a of actionsState(d, t).open) if (isIso(a.due) && daysBetween(t, a.due) <= 400)
      out.push({ key: `persone:azione:${a.id}`, date: a.due.slice(0, 10), title: `Azione di sicurezza: ${String(a.text || '').slice(0, 80)}`, area: 'esg', pkg: 'persone', kind: 'controllo', owner: a.owner || 'RSPP', link: LINK('sicurezza') });
    const hasCert = A(d.companyCerts).some(c => c && /PdR\s*125/i.test(String(c.scheme || '')));
    for (const p of A(d.pdr125)) if (p && p.certified && isIso(p.certExpiry) && !hasCert && daysBetween(t, p.certExpiry) >= -60)
      out.push({ key: `persone:pdr125:${p.id}`, date: p.certExpiry.slice(0, 10), title: 'Rinnovo della certificazione della parità di genere (UNI/PdR 125)', area: 'esg', pkg: 'persone', kind: 'rinnovo', law: 'UNI/PdR 125:2022', validAsOf: pack.validAsOf, owner: 'Risorse umane', link: LINK('parita') });
    return out;
  }, 4);
}

/* ---------------- nota metodologica ---------------- */
export const PERSONE_METHOD = {
  it: [
    'Organico: fotografie alla fine del periodo, con persone ed equivalenti a tempo pieno (ETP) per genere, categoria (dirigenti, quadri, impiegati, operai) e contratto; l’apprendistato è un contratto a tempo indeterminato. Turnover = uscite del periodo (dimissioni, licenziamenti, pensionamenti, decessi; escluse le scadenze dei contratti a termine) ÷ media tra l’organico di inizio e di fine periodo. Donne in ruoli di responsabilità e rapporto donne/uomini (VS C5) su dirigenti e quadri.',
    'Sicurezza: indice di frequenza IF = infortuni con almeno un giorno di assenza oltre quello dell’evento × 1.000.000 ÷ ore lavorate; indice di gravità IG = (giornate perse + giornate convenzionali di invalidità permanente e decesso) × 1.000 ÷ ore lavorate (UNI 7249). Tasso del VS B9 = infortuni registrabili × 200.000 ÷ ore lavorate dai dipendenti. Gli infortuni in itinere e i quasi infortuni restano fuori dagli indici e si contano a parte. Le ore vengono dal registro mensile; un mese senza ore si stima con ETP × 1.720 h ÷ 12 e il dato risulta «stimato».',
    'Formazione: ore-persona (durata × partecipanti) per genere e per tema; ore medie per dipendente sull’organico del periodo (VS B10). Le scadenze dei corsi obbligatori vengono dalla validità indicata nel corso o, se manca, dalla periodicità di base del pacchetto (stato «da verificare» con l’RSPP).',
    'Retribuzioni: righe pseudonime (codice, genere, categoria, livello, ETP, fisso e variabile annui), mai nomi. Divario = (uomini − donne) ÷ uomini sulla media e sulla mediana della retribuzione annua lorda riportata al tempo pieno; per categoria, componenti variabili e quartili. Ogni gruppo con meno di 5 persone per genere non viene mostrato né esportato. Obblighi della trasparenza retributiva (D.Lgs. 96/2026) e del rapporto biennale (D.Lgs. 198/2006, art. 46) secondo i dipendenti medi; UNI/PdR 125: solo nomi delle aree e pesi (15, 15, 10, 20, 20, 20), soglia del 60%. INAIL OT23: punti degli interventi contro la soglia del modello dell’anno (da verificare).',
    'Fonti e date «valido al» nel pacchetto «persone»; i riferimenti di settore sono stime derivate da dati pubblici, non dati di aziende.',
  ].join('\n\n'),
  en: [
    'Workforce: snapshots at the end of the period with headcount and full-time equivalents (FTE) by gender, category (executives, middle managers, white-collar, blue-collar) and contract; apprenticeships are permanent contracts. Turnover = leavers in the period (resignations, dismissals, retirements, deaths; expiry of fixed-term contracts excluded) ÷ average of opening and closing headcount. Women in management and female-to-male ratio (VS C5) over executives and middle managers.',
    'Safety: frequency rate IF = injuries with at least one day of absence besides the day of the event × 1,000,000 ÷ hours worked; severity rate IG = (days lost + conventional days for permanent disability and death) × 1,000 ÷ hours worked (UNI 7249). VS B9 rate = recordable work-related accidents × 200,000 ÷ hours worked by employees. Commuting accidents and near misses are counted separately and kept out of the rates. Hours come from the monthly register; a month without hours is estimated as FTE × 1,720 h ÷ 12 and flagged «estimated».',
    'Training: person-hours (duration × participants) by gender and topic; average hours per employee over the period headcount (VS B10). Due dates of mandatory courses use the validity set on the course or, failing that, the default periodicity of the content pack (status «to be verified» with the safety officer).',
    'Pay: pseudonymous rows (code, gender, category, grade, FTE, annual fixed and variable pay), never names. Gap = (men − women) ÷ men on the mean and median annual gross pay converted to full time; by category, variable pay and quartiles. Any group with fewer than 5 people per gender is neither shown nor exported. Pay-transparency duties (Legislative Decree 96/2026) and the biennial report (Legislative Decree 198/2006, art. 46) depend on average headcount; UNI/PdR 125: area names and weights only (15, 15, 10, 20, 20, 20), 60% threshold. INAIL OT23: points of the measures against the threshold of the year’s form (to be verified).',
    'Sources and «valid as of» dates are in the «persone» content pack; sector references are estimates derived from public data, not company data.',
  ].join('\n\n'),
};

