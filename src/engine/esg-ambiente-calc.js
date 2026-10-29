/* FeedOS 18 · Registri ambientali (pacchetto WP9 «ambiente»): calcoli dei registri, senza interfaccia.
 * Giorni lavorativi (lun–ven, esclusi festività nazionali e Pasquetta), RENTRI (registrazione entro 10 giorni lavorativi, xFIR dal
 * 15/09/2026, operazione finale: contano come recupero solo le R1–R12, la R13 resta in attesa), MUD (somme per EER, operazione,
 * destinazione), bilancio dell’acqua (prelievo meno scarico), emissioni dai camini (media mg/Nm³ × Nm³/h × ore ÷ 10⁶ = kg/anno),
 * diagnosi energetica (TJ/anno). Funzioni pure: nessun orologio (il chiamante passa oggi), nessuna eccezione, nessun console.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano il pacchetto. */
import { addDays, addMonths, daysInMonth, daysBetween, parse, round, sum, monthOf } from '../core/util.js';
import { isHazardous } from '../data/eer.js';
import { registerMonths, waterStats } from './sustainability.js';
import { esgSettings } from './esg-years.js';

/** Inizio dell’obbligo di xFIR (FIR digitale), come da calendario RENTRI (Milleproroghe 2026). */
export const XFIR_FROM = '2026-09-15';
/** Giorni lavorativi entro cui il movimento va registrato sul registro di carico e scarico digitale. */
export const RENTRI_DAYS = 10;
/** Operazioni preliminari: non sono recupero finale. */
export const PRELIM_OPS = ['R13', 'D15'];
/** Potere calorifico inferiore del GPL (47,3 MJ/kg, IPCC 2006) in kWh per kg. */
export const KWH_PER_KG_GPL = 47.3 / 3.6;
/** Inquinanti dei camini e origini ammesse (liste aperte: il registro accetta anche altri valori). */
export const STACK_POLLUTANTS = ['polveri', 'NOx', 'CO', 'COV'];
export const STACK_ORIGINS = ['ricevimento', 'macinazione', 'raffreddamento', 'insacco', 'caldaia', 'essiccazione', 'solventi'];
export const RECEPTORS = ['fognatura', 'corpo idrico', 'suolo'];
export const ENERGY_AUDIT_TYPES = ['diagnosi 102/2014', 'ISO 50001', 'interno'];
export const WATER_STRESS = ['n.d.', 'basso', 'medio', 'alto'];
/** Giorni entro cui un campionamento in scadenza si segnala. */
export const STACK_DUE_DAYS = 30;

export const ymd = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
export const inRange = (x, P) => !P || (x != null && x >= P.from && x <= P.to);
export const isFinalRecovery = op => /^R(1[0-2]|[1-9])$/.test(String(op || ''));
export const isPrelim = op => PRELIM_OPS.includes(String(op || ''));
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const arr = x => (Array.isArray(x) ? x : []);

/* ---------------- festività e giorni lavorativi ---------------- */
/** Pasqua (algoritmo anonimo gregoriano), in ISO. */
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const holidayCache = new Map();
/** Festività nazionali italiane di un anno: fisse, più la Pasquetta (lunedì dopo Pasqua). */
export function italianHolidays(y) {
  if (!holidayCache.has(y)) {
    holidayCache.set(y, new Set([`${y}-01-01`, `${y}-01-06`, `${y}-04-25`, `${y}-05-01`, `${y}-06-02`, `${y}-08-15`, `${y}-11-01`, `${y}-12-08`, `${y}-12-25`, `${y}-12-26`, addDays(easterSunday(y), 1)]));
  }
  return holidayCache.get(y);
}
export const isHoliday = iso => italianHolidays(+iso.slice(0, 4)).has(iso.slice(0, 10));
/** Giorno lavorativo: dal lunedì al venerdì, non festivo. */
export const isWorkingDay = iso => { const wd = parse(iso).getUTCDay(); return wd !== 0 && wd !== 6 && !isHoliday(iso); };
/** Data del n-esimo giorno lavorativo dopo `iso`. */
export function addWorkingDays(iso, n) {
  let x = iso.slice(0, 10), k = 0;
  while (k < n) { x = addDays(x, 1); if (isWorkingDay(x)) k++; }
  return x;
}
/** Giorni lavorativi dopo `from` fino a `to` compreso. */
export function workingDaysBetween(from, to) {
  if (!ymd(from) || !ymd(to) || to <= from) return 0;
  let x = from.slice(0, 10), n = 0;
  while (x < to) { x = addDays(x, 1); if (x <= to && isWorkingDay(x)) n++; }
  return n;
}

/* ---------------- RENTRI: registro di carico e scarico digitale ---------------- */
/** Operazione finale di un movimento: quella dichiarata nel registro RENTRI, altrimenti quella del formulario se non è preliminare. */
export function finalOpOf(w, reg) {
  const r = reg?.opFinal ? String(reg.opFinal).trim() : '';
  if (r) return r;
  const op = w?.op ? String(w.op).trim() : '';
  return op && !isPrelim(op) ? op : null;
}

/**
 * Movimenti del registro con lo stato RENTRI: registrazione entro 10 giorni lavorativi, xFIR dal 15/09/2026, operazione finale.
 * Stati: 'da registrare' (nei termini), 'in ritardo' (registrato o no oltre il termine), 'xFIR mancante', 'regolare'.
 */
export function rentriRows(d, today) {
  const regs = new Map(arr(d?.wasteRentri).filter(r => r && r.id).map(r => [r.id, r]));
  const out = [];
  for (const w of arr(d?.waste)) {
    const date = ymd(w?.date);
    if (!date) continue;
    const reg = regs.get(w.id) || null;
    const registeredAt = ymd(reg?.registeredAt);
    const deadline = addWorkingDays(date, RENTRI_DAYS);
    const late = registeredAt ? registeredAt > deadline : !!ymd(today) && today > deadline;
    const xfirRequired = date >= XFIR_FROM;
    const xfirMissing = xfirRequired && !(reg && reg.xfirId);
    const final = finalOpOf(w, reg);
    const status = late ? 'in ritardo' : !registeredAt ? 'da registrare' : xfirMissing ? 'xFIR mancante' : 'regolare';
    out.push({ id: w.id, date, month: date.slice(0, 7), eer: w.eer || '', name: w.name || '', kg: +w.kg || 0, hazardous: w.hazardous ?? isHazardous(w.eer),
      dest: w.dest || '', op: w.op || null, fir: w.fir || null, final, prelim: !final || isPrelim(final), reg, registeredAt, deadline,
      late, xfirRequired, xfirMissing, status });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Riepilogo RENTRI del periodo P (o di tutto l’archivio con P nullo). Il recupero finale conta solo le R1–R12. */
export function rentriSummary(d, today, P = null) {
  const rows = rentriRows(d, today).filter(r => inRange(r.date, P));
  const total = rows.length, registered = rows.filter(r => r.registeredAt).length;
  const kg = sum(rows, r => r.kg), finalKg = sum(rows.filter(r => isFinalRecovery(r.final)), r => r.kg);
  const haz = sum(rows.filter(r => r.hazardous), r => r.kg);
  const byMonth = new Map();
  for (const r of rows) { const x = byMonth.get(r.month) || { month: r.month, total: 0, registered: 0 }; x.total++; if (r.registeredAt) x.registered++; byMonth.set(r.month, x); }
  return {
    rows, total, registered, completeness: total ? registered / total : null,
    late: rows.filter(r => r.late).length, xfirMissing: rows.filter(r => r.xfirMissing).length, xfirRows: rows.filter(r => r.xfirRequired).length,
    kg, finalKg, finalRecoveryPct: kg > 0 ? finalKg / kg : null, pendingKg: sum(rows.filter(r => r.prelim), r => r.kg),
    recoveryDeclaredKg: sum(rows.filter(r => r.dest === 'recupero'), r => r.kg), hazKg: haz, nonHazKg: kg - haz,
    byMonth: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map(x => ({ ...x, completeness: x.total ? x.registered / x.total : null })),
  };
}

/**
 * MUD per anno di movimento: kg per EER × operazione × destinazione (l’operazione è quella finale, altrimenti la preliminare
 * segnalata come tale). Le somme coincidono con il registro dell’anno.
 */
export function mudSummary(d, today, year) {
  const rows = rentriRows(d, today).filter(r => r.date.slice(0, 4) === String(year));
  const map = new Map();
  for (const r of rows) {
    const op = r.final || r.op || '—';
    const key = [r.eer, op, r.dest].join('|');
    const x = map.get(key) || { eer: r.eer, name: r.name, hazardous: r.hazardous, op, prelim: isPrelim(op) || !r.final, dest: r.dest, kg: 0, n: 0 };
    x.kg += r.kg; x.n += 1; map.set(key, x);
  }
  const lines = [...map.values()].sort((a, b) => (a.eer < b.eer ? -1 : a.eer > b.eer ? 1 : a.op < b.op ? -1 : a.op > b.op ? 1 : a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : 0));
  const haz = sum(rows.filter(r => r.hazardous), r => r.kg);
  return { year: +year, lines, n: rows.length, kg: sum(rows, r => r.kg), hazKg: haz, nonHazKg: sum(rows, r => r.kg) - haz,
    prelimKg: sum(rows.filter(r => r.prelim), r => r.kg), partialYear: rows.length > 0 && !rows.some(r => r.date.slice(5, 7) === '01') };
}

/* ---------------- acqua: prelievo, scarico, consumo ---------------- */
/**
 * Bilancio idrico dei mesi del periodo: prelievo (registro dell’acqua), scarico (fognatura o corpo idrico) e consumo = prelievo
 * meno scarico. Litri per tonnellata sui mesi con produzione completa; R54: scarico maggiore del prelievo.
 */
export function waterBalance(d, P) {
  if (!P) return { months: [], withdrawal: null, discharge: null, consumption: null, highStress: false, withdrawalStress: null, over: [], withdrawalLt: null, consumptionLt: null, coverageMonths: 0 };
  const stress = esgSettings(d, 'ambiente', {}).waterStress;
  const ws = waterStats(d, P);
  const dis = arr(d?.waterDischarges);
  const rows = registerMonths(P).map(m => {
    const w = ws.months.find(x => x.month === m) || null;
    const dm = dis.filter(x => x.month === m);
    const discharge = dm.length ? sum(dm, x => x.m3) : null;
    const withdrawal = w ? w.m3 : null;
    return { month: m, withdrawal, discharge, consumption: withdrawal != null && discharge != null ? withdrawal - discharge : null,
      tonnes: w ? w.tonnes : 0, partial: w ? !!w.partial : false, perT: w ? w.perT : null, samples: dm };
  }).filter(r => r.withdrawal != null || r.discharge != null);
  const withdrawal = rows.some(r => r.withdrawal != null) ? sum(rows, r => r.withdrawal || 0) : null;
  const both = rows.filter(r => r.withdrawal != null && r.discharge != null);
  const discharge = both.length ? sum(both, r => r.discharge) : null;
  const consumption = both.length ? sum(both, r => r.consumption) : null;
  const withdrawalBoth = sum(both, r => r.withdrawal);
  const full = both.filter(r => !r.partial && r.tonnes > 0);
  const highStress = stress === 'medio' || stress === 'alto';
  return {
    months: rows, withdrawal, discharge, consumption, consumptionShare: withdrawalBoth > 0 ? consumption / withdrawalBoth : null,
    withdrawalLt: ws.intensity != null ? ws.intensity * 1000 : null,
    consumptionLt: full.length ? sum(full, r => r.consumption) * 1000 / sum(full, r => r.tonnes) : null,
    over: both.filter(r => r.discharge > r.withdrawal).map(r => r.month), stress, highStress,
    withdrawalStress: highStress ? withdrawal : null, coverageMonths: both.length, bySource: ws.bySource, lastMonth: rows.at(-1)?.month || null,
  };
}

/* ---------------- camini: emissioni in atmosfera ---------------- */
/** Data del prossimo campionamento: ultimo campionamento più la frequenza in mesi (stesso giorno, o l’ultimo del mese). */
export function dueDate(date, months) {
  const f = +months;
  if (!ymd(date) || !(f > 0)) return null;
  const ym = addMonths(date.slice(0, 7), f);
  return `${ym}-${String(Math.min(+date.slice(8, 10), daysInMonth(ym))).padStart(2, '0')}`;
}
/** Stato del campionamento rispetto a oggi: 'mancante', 'scaduto', 'entro 30 giorni', 'in regola'. */
export function dueState(nextDue, today) {
  if (!nextDue || !ymd(today)) return 'mancante';
  const left = daysBetween(today, nextDue);
  return left < 0 ? 'scaduto' : left <= STACK_DUE_DAYS ? 'entro 30 giorni' : 'in regola';
}
/**
 * Emissioni dei camini: per ogni camino la media dei campionamenti del periodo (o l’ultimo, se nel periodo non ce n’è) per la
 * portata e le ore annue dichiarate → kg/anno = media (mg/Nm³) × portata (Nm³/h) × ore ÷ 10⁶. Polveri e altri inquinanti.
 */
export function stackEmissions(d, P, today) {
  const samples = arr(d?.stackSamples).filter(x => ymd(x?.date));
  const stacks = arr(d?.stacks).filter(s => s && s.id).map(s => {
    const all = samples.filter(x => x.stackId === s.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const inP = all.filter(x => inRange(x.date, P));
    const use = inP.length ? inP : all.slice(-1);
    const vals = use.map(x => num(x.valueMgNm3)).filter(v => v != null);
    const mean = vals.length ? sum(vals) / vals.length : null;
    const flow = num(s.flowNm3h), hours = num(s.hoursYear), limit = num(s.limitMgNm3);
    const kgYr = mean != null && flow > 0 && hours > 0 ? mean * flow * hours / 1e6 : null;
    const last = all.at(-1) || null;
    const nextDue = last ? dueDate(last.date, s.freqMonths) : null;
    const exceed = use.filter(x => limit != null && num(x.valueMgNm3) > limit);
    return { id: s.id, code: s.code || s.id, name: s.name || '', origin: s.origin || '', pollutant: s.pollutant || '', flowNm3h: flow, hoursYear: hours, limitMgNm3: limit,
      freqMonths: num(s.freqMonths), permitRef: s.permitRef || '', filter: s.filter || '', samples: use, inPeriod: inP.length > 0, mean, kgYr,
      last, nextDue, dueState: dueState(nextDue, today), exceed };
  });
  const byPollutant = {};
  for (const s of stacks) if (s.kgYr != null) byPollutant[s.pollutant] = (byPollutant[s.pollutant] || 0) + s.kgYr;
  return { stacks, byPollutant, dustKg: byPollutant.polveri ?? null, exceed: stacks.flatMap(s => s.exceed), samples: samples.length };
}

/* ---------------- diagnosi energetica ---------------- */
/**
 * Energia del periodo (elettricità: prelievo più fotovoltaico autoconsumato; GPL in kWh) in TJ/anno e soglie della diagnosi
 * (D.Lgs. 102/2014 art. 8) e della direttiva rifusa (10 TJ audit, 85 TJ sistema di gestione dell’energia). Grande impresa:
 * almeno 250 addetti e oltre 50 M€ di fatturato o 43 M€ di totale di bilancio (settings.esg18.report); null se mancano i dati.
 */
export function auditDuty(d, P, headcount = null) {
  const months = new Set(P ? registerMonths(P) : []);
  const en = arr(d?.energy).filter(e => months.has(e.month));
  const elKwh = sum(en, e => (+e.kwhGrid || 0) + (+e.kwhPV || 0) - (+e.kwhExport || 0));
  const gplKg = sum(en, e => +e.gplKg || 0);
  const thKwh = gplKg * KWH_PER_KG_GPL;
  const tj = (elKwh + thKwh) / 1000 * 0.0036;
  const rep = d?.settings?.esg18?.report || {};
  const turnover = num(rep.turnover), balance = num(rep.balanceSheet);
  let large = null;
  if (headcount != null) large = headcount < 250 ? false : turnover == null && balance == null ? null : (turnover ?? 0) > 5e7 || (balance ?? 0) > 4.3e7;
  return { months: en.length, elKwh, thKwh, gplKg, tj: round(tj, 2), eedAudit: tj > 10, eedEnMS: tj > 85, large, headcount, nextDeadline: '2027-12-05' };
}
