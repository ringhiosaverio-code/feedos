/* FeedOS 18 · ESG › Registri ambientali (pacchetto WP9 «ambiente»): RENTRI e MUD, emissioni dai camini, scarichi e bilancio idrico,
 * ENPI energetico, diagnosi energetica, anomalie e flusso di massa (VS B4, B6, B7). Contratto della fondazione 18 (07-contract §2 e §4):
 * segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint} · scadenze
 * (d, today) → CalendarItem[] · riepilogo (d, P) → oggetto | null · AMBIENTE_KPIS, AMBIENTE_RULES, AMBIENTE_METHOD.
 * Moduli: esg-ambiente-calc.js (RENTRI, MUD, acqua, camini, diagnosi), esg-ambiente-stats.js (ENPI, anomalie, flusso di massa).
 * Due edizioni: il pacchetto è visibile in entrambe. Le soglie di confronto del modello energetico (33 + 32 kWh/t, pellet) valgono
 * solo per il mangimificio; nell’edizione agrofarmaci non ci sono riferimenti di settore e il confronto resta da impostare.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. Funzioni pure: nessun orologio, nessuna eccezione, nessun console. */
import { dateIt, daysBetween, round, monthLabel } from '../core/util.js';
import { T, fmtNum } from './esg-nlg.js';
import { esgSettings, esgToday, currentPeriod, sectorOf } from './esg-years.js';
import { packItems } from './esg-packs.js';
import { workforce } from './esg-persone.js';
import { META } from '../editions/meta.js';
import { PACK_AMBIENTE } from '../data/pack-ambiente.js';
import { rentriRows, rentriSummary, mudSummary, waterBalance, stackEmissions, auditDuty, isPrelim, isFinalRecovery, ymd, inRange, XFIR_FROM, STACK_DUE_DAYS, WATER_STRESS, ENERGY_AUDIT_TYPES } from './esg-ambiente-calc.js';
import { enpiForPeriod, anomalyList, massFlow, madScores } from './esg-ambiente-stats.js';

export { rentriRows, rentriSummary, mudSummary, waterBalance, stackEmissions, auditDuty, massFlow, enpiForPeriod, anomalyList, XFIR_FROM, WATER_STRESS, ENERGY_AUDIT_TYPES, isFinalRecovery };
export { enpiModel, anomalySeries, olsFit, cusumUp, madScores, solveLinear, coverageFn } from './esg-ambiente-stats.js';
export { STACK_POLLUTANTS, STACK_ORIGINS, RECEPTORS, STACK_DUE_DAYS, RENTRI_DAYS, KWH_PER_KG_GPL, dueDate, dueState, finalOpOf, easterSunday, italianHolidays, isWorkingDay, addWorkingDays, workingDaysBetween } from './esg-ambiente-calc.js';

/** La scheda «Registri ambientali» esiste in questa edizione? (se un’edizione la nasconde: niente segnali, sezione o scadenze). */
export const AMB_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('ambiente'));
const LINK = id => ({ area: 'esg', tab: 'ambiente', ...(id ? { id } : {}) });
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = x => (Array.isArray(x) ? x : []);
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const todayOf = (d, ctx) => (ymd(ctx?.today) ? ctx.today : esgToday(d));
const it = (v, unit = '', dec) => fmtNum(v, unit, 'it', dec);
const pc = v => (v == null || !Number.isFinite(+v) ? '—' : `${it(+v * 100, '%', 0)}`);
const POLLUTANT = { polveri: 'Polveri', NOx: 'Ossidi di azoto (NOx)', CO: 'Monossido di carbonio (CO)', COV: 'Composti organici volatili (COV)' };
export const pollutantLabel = p => POLLUTANT[p] || p || 'Inquinante';

/** Impostazioni del pacchetto (settings.esg18.ambiente): stress idrico, soglia delle anomalie, riferimento energetico. */
export const AMBIENTE_DEFAULTS = Object.freeze({ waterStress: 'n.d.', anomalyK: 3.5, benchmark: { elPellet: 33, thPellet: 32 } });
export function ambienteSettings(d) {
  const s = esgSettings(d, 'ambiente', AMBIENTE_DEFAULTS);
  const k = num(s.anomalyK);
  return { ...s, waterStress: WATER_STRESS.includes(s.waterStress) ? s.waterStress : 'n.d.', anomalyK: k == null ? 3.5 : Math.max(2, Math.min(6, k)),
    benchmark: sectorOf(d) === 'mangimi' && isObj(s.benchmark) ? { elPellet: num(s.benchmark.elPellet), thPellet: num(s.benchmark.thPellet) } : null };
}
/** Ci sono registri ambientali nell’archivio? (altrimenti niente segnali, sezione o datapoint). */
export const inUse = d => ['waste', 'water', 'waterDischarges', 'stacks', 'stackSamples', 'energy', 'wasteRentri'].some(c => arr(d?.[c]).length > 0);
/** Voce del pacchetto integrato per id (norma, stato, valido al). */
export function packItem(d, id) { return packItems(d, 'ambiente', PACK_AMBIENTE).find(x => x && x.id === id) || null; }
const PACK_VALID = PACK_AMBIENTE.validAsOf;
/** Acque per mese: prelievo (tutte le fonti) e scarico (tutti i punti), per l’R54. */
export function waterMonths(d) {
  const m = new Map();
  for (const w of arr(d?.water)) { if (!w?.month) continue; const x = m.get(w.month) || { month: w.month, withdrawal: 0, discharge: null }; x.withdrawal += +w.m3 || 0; m.set(w.month, x); }
  for (const s of arr(d?.waterDischarges)) { if (!s?.month) continue; const x = m.get(s.month) || { month: s.month, withdrawal: 0, discharge: null }; x.discharge = (x.discharge || 0) + (+s.m3 || 0); m.set(s.month, x); }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
/** Periodo di riferimento: l’esercizio ESG corrente (chi non lo passa usa questo). */
const periodOf = (d, P) => P || (() => { try { return currentPeriod(d); } catch { return null; } })();
const headcountOf = (d, P) => { try { return num(workforce(d, P)?.headcount); } catch { return null; } };

/* ---------------- segnali di «Oggi» ---------------- */
/** Segnali del pacchetto: campionamenti in scadenza, superamenti, RENTRI in ritardo o senza xFIR, anomalie, deriva dell’ENPI, diagnosi. */
export function ambienteSignals(d, ctx) {
  if (!AMB_TAB || !d || !inUse(d)) return [];
  const today = todayOf(d, ctx), P = periodOf(d, null), out = [];
  const S = stackEmissions(d, P, today), st = ambienteSettings(d);
  for (const s of S.stacks) {
    if (!['scaduto', 'entro 30 giorni', 'mancante'].includes(s.dueState)) continue;
    const when = s.dueState === 'mancante' ? 'nessun campionamento registrato' : s.dueState === 'scaduto' ? `scaduto il ${dateIt(s.nextDue)}` : `entro il ${dateIt(s.nextDue)}`;
    out.push({ key: `amb:stack-due:${s.id}`, area: 'esg', roles: ['produzione', 'qualita'], severity: 'attenzione',
      title: `Campionamento al camino ${s.code} da fare`, why: `${pollutantLabel(s.pollutant)}: ${when}${s.last ? ` (ultimo campionamento il ${dateIt(s.last.date)})` : ''}. Limite ${it(s.limitMgNm3, 'mg/Nm³')}.`,
      action: 'Prenotare il campionamento con il laboratorio e registrare il risultato nel registro dei camini.', impact: 20, link: LINK('aria') });
  }
  for (const smp of S.exceed.filter(x => inRange(x.date, P))) {
    const s = S.stacks.find(x => x.id === smp.stackId);
    out.push({ key: `amb:stack-exceed:${smp.id}`, area: 'esg', roles: ['produzione', 'direzione'], severity: 'critico',
      title: `Superamento del limite al camino ${s?.code || ''}`.trim(), why: `Campionamento del ${dateIt(smp.date)}: ${it(smp.valueMgNm3, 'mg/Nm³')} contro un limite di ${it(s?.limitMgNm3, 'mg/Nm³')}.`,
      action: 'Avvisare la direzione e il responsabile dell’autorizzazione; verificare filtri e portata e ripetere il campionamento.', impact: 100, link: LINK('aria') });
  }
  const R = rentriRows(d, today);
  for (const r of R.filter(x => x.late && daysBetween(x.date, today) <= 90)) {
    out.push({ key: `amb:rentri-late:${r.id}`, area: 'esg', roles: ['qualita'], severity: 'attenzione',
      title: `Movimento del ${dateIt(r.date)} oltre il termine RENTRI`, why: `${r.eer} · ${it(r.kg, 'kg')}: ${r.registeredAt ? `registrato il ${dateIt(r.registeredAt)}` : 'non ancora registrato'}; il termine di 10 giorni lavorativi era il ${dateIt(r.deadline)}.`,
      action: 'Registrare il movimento sul registro digitale e annotare il motivo del ritardo.', impact: 15, link: LINK('rentri') });
  }
  for (const r of R.filter(x => x.xfirMissing && daysBetween(x.date, today) <= 90)) {
    out.push({ key: `amb:xfir-missing:${r.id}`, area: 'esg', roles: ['qualita'], severity: 'attenzione',
      title: `xFIR mancante per il movimento del ${dateIt(r.date)}`, why: `Dal ${dateIt(XFIR_FROM)} il movimento va documentato con il FIR digitale (xFIR): ${r.eer} · ${it(r.kg, 'kg')}.`,
      action: 'Recuperare l’identificativo xFIR dal trasportatore o dall’impianto e registrarlo sul movimento.', impact: 15, link: LINK('rentri') });
  }
  for (const a of anomalyList(d, today, { K: st.anomalyK, P }).slice(0, 5)) {
    out.push({ key: `amb:anomaly:${a.metric}:${a.month}`, area: 'esg', roles: ['produzione'], severity: 'attenzione',
      title: `Valore anomalo: ${a.label.toLowerCase()} (${a.month})`, why: `${it(a.value, a.unit, 1)} contro una mediana di ${it(a.median, a.unit, 1)} (${a.unitError ? 'errore di unità probabile' : `z robusto ${it(a.z, '', 1)}`}); ${a.records.length} registrazioni di origine.`,
      action: 'Controllare le registrazioni di origine e le letture del contatore prima della verifica esterna.', impact: Math.round(Math.abs(a.z) * 5), link: LINK('anomalie') });
  }
  const E = enpiForPeriod(d, today, P);
  for (const m of (E.model?.alarms || []).slice(-2)) {
    const row = E.model.rows.find(r => r.month === m);
    out.push({ key: `amb:enpi-drift:${m}`, area: 'esg', roles: ['produzione'], severity: 'attenzione',
      title: `Consumo elettrico sopra il modello a ${monthLabel(m, false)}`, why: `Scostamento di ${it(row?.dev != null ? row.dev * 100 : null, '%', 1)} rispetto al modello dei mesi precedenti (z ${it(row?.z, '', 1)}).`,
      action: 'Confrontare i consumi per linea e per mese e cercare perdite d’aria compressa, motori o fermate anomale.', impact: 25, link: LINK('energia-prestazioni') });
  }
  for (const a of arr(d?.energyAudits)) {
    const due = ymd(a?.nextDue);
    if (!due || due < today || daysBetween(today, due) > 180) continue;
    out.push({ key: `amb:audit-due:${due}`, area: 'esg', roles: ['direzione'], severity: 'info', title: 'Diagnosi energetica in scadenza', why: `${a.type || 'Audit energetico'} da ripetere entro il ${dateIt(due)}.`,
      action: 'Pianificare l’audit con il fornitore o l’auditor, prima della scadenza.', impact: 5, link: LINK('energia-prestazioni') });
  }
  return out.filter(x => x && typeof x.key === 'string');
}

/* ---------------- sezione del report (CdA e Rapporto ESG) ---------------- */
/** Sezione «Registri ambientali» del report: acqua, rifiuti, camini, energia e RENTRI, con le frasi di lettura. */
export function ambienteReportSection(d, ctx, P, C) {
  if (!AMB_TAB || !inUse(d) || !P) return null;
  const today = todayOf(d, ctx);
  const W = waterBalance(d, P), R = rentriSummary(d, today, P), S = stackEmissions(d, P, today), E = enpiForPeriod(d, today, P);
  const kpis = [
    W.withdrawal != null ? { label: 'Prelievo idrico', value: round(W.withdrawal, 0), unit: 'm³', decimals: 0 } : null,
    W.withdrawalLt != null ? { label: 'Prelievo idrico per tonnellata', value: round(W.withdrawalLt, 0), unit: 'l/t', decimals: 0 } : null,
    R.total ? { label: 'Rifiuti avviati a recupero finale (R1–R12)', value: round((R.finalRecoveryPct || 0) * 100, 0), unit: '%', decimals: 0 } : null,
    S.dustKg != null ? { label: 'Polveri dai camini', value: round(S.dustKg, 0), unit: 'kg/anno', decimals: 0, status: S.exceed.length ? 'bad' : 'ok' } : null,
    E.devPct != null ? { label: 'Scostamento ENPI dal modello', value: round(E.devPct, 1), unit: '%', decimals: 1 } : null,
    R.completeness != null ? { label: 'Movimenti registrati su RENTRI', value: round(R.completeness * 100, 0), unit: '%', decimals: 0 } : null,
  ].filter(Boolean);
  const rows = S.stacks.filter(s => s.kgYr != null || s.last).map(s => ({ id: s.id, code: s.code, pollutant: pollutantLabel(s.pollutant), mean: s.mean, limit: s.limitMgNm3, kgYr: s.kgYr, last: s.last ? dateIt(s.last.date) : '—' }));
  const narrative = [];
  if (W.withdrawal != null) narrative.push(`Prelievi idrici per ${it(W.withdrawal, 'm³', 0)} nel periodo${W.withdrawalLt != null ? `, ${it(W.withdrawalLt, 'l/t', 0)} di prodotto` : ''}${W.discharge != null ? `; scarichi registrati per ${it(W.discharge, 'm³', 0)}` : ''}.`);
  if (R.total) narrative.push(`Rifiuti avviati a recupero finale (R1–R12): ${pc(R.finalRecoveryPct)} del totale. Le R13 e le D15 senza operazione finale sono indicate a parte (${it(R.pendingKg / 1000, 't', 1)}).`);
  if (S.dustKg != null) narrative.push(`Polveri dai camini: circa ${it(S.dustKg, 'kg/anno', 0)} dai camini con campionamento nel periodo${S.exceed.length ? `; ${S.exceed.length} superamento dei limiti da verificare` : ', nei limiti'}.`);
  if (R.completeness != null) narrative.push(`RENTRI: ${it(R.completeness * 100, '%', 0)} dei movimenti registrati; ${R.late} oltre il termine di 10 giorni lavorativi e ${R.xfirMissing} senza xFIR.`);
  return {
    id: 'esg-ambiente', title: 'Registri ambientali', order: 84, kpis,
    table: rows.length ? { cols: [{ key: 'code', label: 'Camino' }, { key: 'pollutant', label: 'Inquinante' }, { key: 'mean', label: 'Media mg/Nm³', align: 'r', fmt: 'num' }, { key: 'limit', label: 'Limite mg/Nm³', align: 'r', fmt: 'num' }, { key: 'kgYr', label: 'kg/anno', align: 'r', fmt: 'num' }, { key: 'last', label: 'Ultimo campionamento' }], rows } : undefined,
    narrative,
  };
}

/* ---------------- indicatori del catalogo ---------------- */
const kpiCompute = fn => (d, ctx, P) => { try { return fn(d, todayOf(d, ctx), P); } catch { return null; } };
/** Indicatori (esg-acqua-lt, esg-recupero-finale, esg-polveri-kg, esg-enpi-scost): src = raccolta con date o month. */
export const AMBIENTE_KPIS = [
  { id: 'esg-acqua-lt', label: 'Prelievo idrico per tonnellata', unit: 'l/t', kind: 'ratio', dir: 'down', area: 'esg', link: LINK('acqua-scarichi'), decimals: 0, hist: true, src: 'water',
    def: 'Metri cubi prelevati (pozzo e acquedotto) per tonnellata prodotta, in litri, sui mesi con produzione completa del periodo.',
    compute: kpiCompute((d, t, P) => { const v = waterBalance(d, P).withdrawalLt; return v == null ? null : v; }) },
  { id: 'esg-recupero-finale', label: 'Rifiuti avviati a recupero finale', unit: '%', kind: 'ratio', dir: 'up', area: 'esg', link: LINK('rentri'), decimals: 0, hist: true, src: 'waste',
    def: 'Quota dei kg di rifiuti del periodo con operazione finale di recupero R1–R12. Le R13 (messa in riserva) non contano finché non è indicata l’operazione finale.',
    compute: kpiCompute((d, t, P) => { const R = rentriSummary(d, t, P); return R.total && R.finalRecoveryPct != null ? R.finalRecoveryPct * 100 : null; }) },
  { id: 'esg-polveri-kg', label: 'Polveri dai camini', unit: 'kg/anno', kind: 'flow', dir: 'down', area: 'esg', link: LINK('aria'), decimals: 0, hist: true, src: 'stackSamples',
    def: 'Polveri annue dai camini: media dei campionamenti del periodo (mg/Nm³) × portata (Nm³/h) × ore di funzionamento annue, sommata sui camini a polveri.',
    compute: kpiCompute((d, t, P) => stackEmissions(d, P, t).dustKg) },
  { id: 'esg-enpi-scost', label: 'Scostamento ENPI dal modello', unit: '%', kind: 'ratio', dir: 'down', area: 'esg', link: LINK('energia-prestazioni'), decimals: 1, hist: true, src: 'energy',
    def: 'Elettricità del periodo rispetto al valore atteso dal modello dei mesi precedenti (kWh = a + b·t linea principale + c·t altre linee). Positivo: consumi sopra il modello.',
    compute: kpiCompute((d, t, P) => enpiForPeriod(d, t, P).devPct) },
];

/* ---------------- regole della qualità dei dati (R52–R56) ---------------- */
const ruleLink = (id, msg) => ({ id, msg, link: LINK(id) });
/** Regole R52–R56 (area esg): FIR e xFIR, operazione finale, scarico oltre il prelievo, campionamenti, errori di unità. */
export const AMBIENTE_RULES = [
  { id: 'R52', area: 'esg', severity: 'attenzione', weight: 5, scope: ['all', 'closing'], label: 'Movimenti di rifiuti senza numero FIR o senza xFIR dal 15/09/2026',
    check: (d, ctx) => {
      const rows = rentriRows(d, todayOf(d, ctx));
      return { base: Math.max(1, rows.length), fails: rows.filter(r => !r.fir || r.xfirMissing).map(r => ({ id: r.id, coll: 'waste', msg: `Movimento del ${dateIt(r.date)} (${r.eer}): ${!r.fir ? 'numero FIR assente' : 'xFIR da registrare'}`, link: LINK('rentri') })) };
    } },
  { id: 'R53', area: 'esg', severity: 'info', weight: 2, scope: ['all', 'closing'], label: 'Rifiuti in riserva o in deposito senza operazione finale dopo 90 giorni',
    check: (d, ctx) => {
      const today = todayOf(d, ctx), rows = rentriRows(d, today).filter(r => r.prelim);
      return { base: Math.max(1, rows.length), fails: rows.filter(r => daysBetween(r.date, today) > 90).map(r => ({ id: r.id, coll: 'waste', msg: `Movimento del ${dateIt(r.date)} (${r.eer}): operazione finale ancora da indicare`, link: LINK('rentri') })) };
    } },
  { id: 'R54', area: 'esg', severity: 'attenzione', weight: 5, scope: ['all', 'closing'], label: 'Scarico idrico maggiore del prelievo nello stesso mese',
    check: d => {
      const ms = waterMonths(d).filter(m => m.discharge != null);
      return { base: Math.max(1, ms.length), fails: ms.filter(m => m.withdrawal > 0 && m.discharge > m.withdrawal).map(m => ({ id: m.month, coll: 'waterDischarges', msg: `${m.month}: scarico di ${it(m.discharge, 'm³', 0)} oltre il prelievo di ${it(m.withdrawal, 'm³', 0)}`, link: LINK('acqua-scarichi') })) };
    } },
  { id: 'R55', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing'], label: 'Camino senza campionamento nei termini',
    check: (d, ctx) => {
      const S = stackEmissions(d, null, todayOf(d, ctx));
      return { base: Math.max(1, S.stacks.length), fails: S.stacks.filter(s => s.dueState === 'scaduto' || s.dueState === 'mancante').map(s => ({ id: s.id, coll: 'stacks', msg: `Camino ${s.code}: ${s.dueState === 'mancante' ? 'nessun campionamento registrato' : `campionamento scaduto il ${dateIt(s.nextDue)}`}`, link: LINK('aria') })) };
    } },
  { id: 'R56', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Errore di unità probabile (valore 500 volte la mediana della serie)',
    check: d => {
      const groups = new Map();
      const add = (k, v, id, label) => { if (num(v) == null) return; const g = groups.get(k) || { items: [], label }; g.items.push({ id, v: +v }); groups.set(k, g); };
      for (const s of arr(d?.stackSamples)) add('camino:' + s.stackId, s.valueMgNm3, s.id, `camino ${s.stackId}`);
      for (const w of arr(d?.waterDischarges)) for (const a of arr(w?.analyses)) add('analisi:' + a.param, a.value, w.id, `analisi «${a.param}»`);
      let base = 0; const fails = [];
      for (const g of groups.values()) {
        base += g.items.length;
        const med = madScores(g.items.map(x => x.v)).med;
        if (!(med > 0) || g.items.length < 3) continue;
        for (const x of g.items) if (x.v >= 500 * med) fails.push({ id: x.id, coll: 'stackSamples', msg: `Valore ${it(x.v, '', 1)} in ${g.label}: circa 500 volte la mediana, controllare l’unità`, link: LINK('aria') });
      }
      return { base: Math.max(1, base), fails };
    } },
];

/* ---------------- datapoint del VSME (B4, B6, B7) ---------------- */
const dp = (value, unit, quality, fn, extra = {}) => ({ value, unit, quality, source: `ambiente.${fn}`, ...extra });
/** Datapoint del pacchetto per il periodo P: B6 (prelievo, stress idrico, consumo), B7 (rifiuti per pericolosità, recupero, flussi), B4 (inquinanti dai camini). */
export function ambienteDatapoints(d, P) {
  if (!AMB_TAB || !isObj(d) || !P || !inUse(d)) return {};
  const today = esgToday(d), out = {};
  const W = waterBalance(d, P);
  if (W.withdrawal != null) out['B6.withdrawal'] = dp(round(W.withdrawal, 0), 'm³', 'misurato', 'waterBalance', { method: 'Somma dei prelievi del registro dell’acqua (pozzo e acquedotto) nei mesi del periodo', note: W.coverageMonths < W.months.length ? 'Lo scarico è registrato solo per alcuni mesi' : undefined });
  if (W.highStress && W.withdrawalStress != null) out['B6.withdrawal-stress'] = dp(round(W.withdrawalStress, 0), 'm³', 'misurato', 'waterBalance', { method: `Prelievo in siti con stress idrico ${W.stress} (impostazione del registro)` });
  if (W.consumption != null) out['B6.consumption'] = dp(round(W.consumption, 0), 'm³', 'calcolato', 'waterBalance', { method: 'Prelievo meno scarico (fognatura o corpo idrico) nei mesi con lo scarico registrato' });
  const R = rentriSummary(d, today, P);
  if (R.total) {
    out['B7.waste-haz'] = dp(round(R.hazKg / 1000, 2), 't', 'misurato', 'rentriSummary', { method: 'Rifiuti pericolosi (codice EER con asterisco) del registro di carico e scarico nel periodo' });
    out['B7.waste-nonhaz'] = dp(round(R.nonHazKg / 1000, 2), 't', 'misurato', 'rentriSummary', { method: 'Rifiuti non pericolosi del registro di carico e scarico nel periodo' });
    out['B7.diverted'] = dp(round(R.finalKg / 1000, 2), 't', 'calcolato', 'rentriSummary', { method: 'Rifiuti con operazione finale R1–R12. Le R13 e le D15 senza operazione finale non entrano nel totale.', note: `${it(R.pendingKg / 1000, 't', 1)} in attesa dell’operazione finale` });
  }
  const S = stackEmissions(d, P, today);
  const polls = Object.entries(S.byPollutant);
  if (polls.length) out['B4.pollutants'] = dp(polls.map(([p, kg]) => ({ label: pollutantLabel(p), value: round(kg, 1), unit: 'kg/anno' })), 'kg', 'calcolato', 'stackEmissions', { method: 'Media dei campionamenti del periodo × portata × ore annue, per inquinante (kg/anno)' });
  const M = massFlow(d, P);
  if (M && M.top.length) out['B7.mass-flow'] = dp(M.top.map(x => ({ label: x.label, value: round(x.t, 1), unit: 't' })), 't', 'calcolato', 'massFlow', { method: 'Consumo di materie prime dell’impianto nel periodo (bilancio dell’impianto), prime sei voci' });
  return out;
}

/* ---------------- scadenze del calendario (chiavi con «stack», come richiede il registro della governance) ---------------- */
/** Campionamenti dei camini, MUD, diagnosi energetica e audit in scadenza. Tutte le chiavi contengono «stack». */
export function ambienteCalendarItems(d, today) {
  if (!AMB_TAB || !isObj(d) || !inUse(d)) return [];
  const t0 = ymd(today) || esgToday(d), out = [];
  const S = stackEmissions(d, null, t0);
  for (const s of S.stacks) {
    const date = s.dueState === 'mancante' ? t0 : s.nextDue;
    if (!date || daysBetween(t0, date) > 365 || daysBetween(t0, date) < -30) continue;
    const p = packItem(d, 'aua-campionamento');
    out.push({ key: `ambiente:stack:${s.id}:${date}`, date, title: `Campionamento al camino ${s.code} (${pollutantLabel(s.pollutant)}, limite ${it(s.limitMgNm3, 'mg/Nm³')})`,
      area: 'esg', pkg: 'ambiente', kind: 'controllo', law: p?.law || 'D.Lgs. 152/2006 art. 269', source: p?.source, validAsOf: PACK_VALID, owner: 'Produzione', link: LINK('aria') });
  }
  const mud = packItem(d, 'mud-2027');
  if (daysBetween(t0, '2027-04-30') >= 0) out.push({ key: 'ambiente:stack:mud:2027', date: '2027-04-30', title: 'MUD 2027 (dati del 2026): da presentare, data da confermare con il DPCM', area: 'esg', pkg: 'ambiente', kind: 'scadenza',
    law: mud?.law || 'MUD', source: mud?.source, validAsOf: PACK_VALID, owner: 'Qualità', link: LINK('rentri') });
  const dia = packItem(d, 'diagnosi-102-2014');
  if (daysBetween(t0, '2027-12-05') >= 0) out.push({ key: 'ambiente:stack:diagnosi-102-2014:2027-12-05', date: '2027-12-05', title: 'Diagnosi energetica quadriennale, se l’azienda è obbligata', area: 'esg', pkg: 'ambiente', kind: 'scadenza',
    law: dia?.law || 'D.Lgs. 102/2014 art. 8', source: dia?.source, validAsOf: PACK_VALID, owner: 'Direzione', link: LINK('energia-prestazioni') });
  for (const a of arr(d.energyAudits)) {
    const due = ymd(a?.nextDue);
    if (due && daysBetween(t0, due) >= 0) out.push({ key: `ambiente:stack:audit:${a.id}:${due}`, date: due, title: `Audit energetico da ripetere (${a.type || 'interno'})`, area: 'esg', pkg: 'ambiente', kind: 'controllo',
      law: 'D.Lgs. 102/2014 art. 8', validAsOf: PACK_VALID, owner: 'Direzione', link: LINK('energia-prestazioni') });
  }
  return out;
}

/* ---------------- riepilogo, nota metodologica ---------------- */
/** Modello di lettura della pagina: periodo, registri e indicatori principali. */
export function ambienteSummary(d, P) {
  if (!AMB_TAB || !isObj(d)) return null;
  const today = esgToday(d), per = periodOf(d, P);
  if (!inUse(d) || !per) return { inUse: false, period: per || null };
  const W = waterBalance(d, per), R = rentriSummary(d, today, per), S = stackEmissions(d, per, today), E = enpiForPeriod(d, today, per), A = auditDuty(d, per, headcountOf(d, per));
  return { inUse: true, period: per, water: W, rentri: R, mud: mudSummary(d, today, +per.to.slice(0, 4)), stacks: S, enpi: E, audit: A,
    anomalies: anomalyList(d, today, { K: ambienteSettings(d).anomalyK, P: per }).length, mass: massFlow(d, per), dq: R.rows.length };
}

/** Nota metodologica del pacchetto (italiano e inglese). */
export const AMBIENTE_METHOD = {
  it: `I registri ambientali leggono i registri dell’archivio (rifiuti, acqua, produzione, energia) e i dati inseriti per camini, scarichi, RENTRI e audit energetici.
RENTRI: il movimento va registrato entro 10 giorni lavorativi (lunedì–venerdì, esclusi festività nazionali e Pasquetta); dal 15 settembre 2026 serve l’xFIR. Il recupero finale conta solo le operazioni R1–R12: la R13 (messa in riserva) e la D15 restano in attesa finché non è indicata l’operazione finale.
Emissioni dai camini: kg/anno = media dei campionamenti (mg/Nm³) × portata (Nm³/h) × ore annue ÷ 10⁶. La media usa i campionamenti del periodo.
Acqua: consumo = prelievo − scarico, sui mesi in cui lo scarico è registrato.
ENPI: minimi quadrati mensili dell’elettricità (prelievo più fotovoltaico autoconsumato) su tonnellate della linea principale e delle altre linee; base sui mesi precedenti gli ultimi tre, che si confrontano con il modello (z = residuo ÷ errore standard; CUSUM).
Anomalie: z robusto con la mediana e lo scarto mediano (MAD) per linea e mese; errore di unità quando il valore supera 500 volte la mediana.
Stato delle voci: normativa e date sono sintesi di ricerca «da verificare» finché la fonte ufficiale non le conferma.`,
  en: `The environmental registers read the archive's registers (waste, water, production, energy) and the data entered for stacks, discharges, RENTRI and energy audits.
RENTRI: a movement must be registered within 10 working days (Monday to Friday, excluding national holidays and Easter Monday); from 15 September 2026 the xFIR is required. Final recovery counts only R1–R12 operations: R13 (storage pending recovery) and D15 stay pending until the final operation is stated.
Stack emissions: kg/year = average of the samples (mg/Nm³) × flow (Nm³/h) × annual hours ÷ 10⁶. The average uses the samples of the period.
Water: consumption = withdrawal − discharge, on the months where the discharge is recorded.
ENPI: monthly least squares of electricity (grid plus self-consumed PV) on the tonnes of the main line and of the other lines; the baseline is the months before the last three, which are checked against the model (z = residual ÷ standard error; CUSUM).
Anomalies: robust z with the median and the median absolute deviation (MAD) per line and month; a unit error is flagged when a value exceeds 500 times the median.
Status of items: regulatory dates and rules are research summaries marked «da verificare» until the official source confirms them.`,
};
