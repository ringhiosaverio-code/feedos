/* FeedOS 18 · Obiettivi e piano (pacchetto WP7 «piano»): obiettivi con anno base e traiettoria, misure con stima dai dati
 * dell'archivio, curva dei costi di abbattimento al prezzo interno del carbonio, incentivi italiani (stima indicativa), tabella di
 * marcia degli investimenti, finanziamenti legati alla sostenibilità, esposizione all'ETS2 e piano di transizione (VS C3).
 * Contratto della fondazione 18 (07-contract §2 e §4): segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null
 * · datapoint (d, P) → {dpId: Datapoint} · scadenze (d, today) → CalendarItem[] · riepilogo (d, P) → oggetto | null · PIANO_KPIS,
 * PIANO_RULES, PIANO_METHOD · funzioni per gli altri pacchetti: carbonPrice(d), esgThresholds(d), planVerified(d) (governance).
 * Moduli: esg-piano-calc.js (calcoli puri), esg-piano-text.js (piano di transizione in italiano e inglese).
 * Due edizioni: la libreria delle misure e le metriche hanno i settori; le leve di formulazione vengono dal pacchetto impronta solo nel
 * mangimificio; nell'edizione agrofarmaci solventi e COV, essiccatore della linea granuli, imballi e programmi di riduzione del rame.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. Funzioni pure, senza orologio, eccezioni o console. */
import { nf, dateIt, addMonths, addDays, daysBetween, round, sum } from '../core/util.js';
import { esgToday, esgSettings, currentPeriod, reportingPeriods, periodByKey, rowMatches, sectorOf } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { T, fmtNum, listJoin } from './esg-nlg.js';
import { inventory, ets2Exposure, factor, plantLocation } from './esg-clima.js';
import { productMacc, pcfOn } from './esg-pcf.js';
import { soyShares } from './esg-filiera.js';
import { safetyRates } from './esg-persone.js';
import { waterStats, wasteStats } from './sustainability.js';
import { programmeCo2 } from './agro-co2.js';
import { PACK_PIANO, LEVERS, INCENTIVES } from '../data/pack-piano.js';
import { META } from '../editions/meta.js';
import { finite, num, economics, maccCurve, pathAt, trajectory, reductionPct, referenceTarget, requiredRate, sbtiCategory, flagCheck, iperUplift, iperTaxValue, greenTest, teeToe, ratchetEur, sptOutcome, crf, annuityFactor } from './esg-piano-calc.js';
import { planText, planMarkdown } from './esg-piano-text.js';

export { economics, maccCurve, pathAt, trajectory, reductionPct, referenceTarget, requiredRate, sbtiCategory, flagCheck, iperUplift, iperTaxValue, greenTest, teeToe, ratchetEur, sptOutcome, crf, annuityFactor };
export { planMarkdown, PACK_PIANO, LEVERS, INCENTIVES };

const EMPTY = Object.freeze([]);
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const has = v => v != null && String(v).trim() !== '';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = s => typeof s === 'string' && ISO.test(s.slice(0, 10));
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch { return fb; } };
const todayOf = (d, ctx) => (ctx && typeof ctx.today === 'string' && ISO.test(ctx.today) ? ctx.today : esgToday(d));
const LINK = id => ({ area: 'esg', tab: 'piano', ...(id ? { id } : {}) });
const FEED = ['mangimi'], AGRO = ['agrofarmaci'], BOTH = ['mangimi', 'agrofarmaci'];

/** La scheda «Obiettivi e piano» esiste in questa edizione? (se un'edizione la nasconde: niente segnali, sezione o scadenze). */
export const PIANO_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('piano'));

/* ---------------- impostazioni e funzioni condivise (contratto §4) ---------------- */
/** Soglie di base dei criteri ESG (quota fotovoltaica, recupero dei rifiuti, ore di formazione, aumento dell'acqua per tonnellata). */
export const ESG_THRESHOLDS = Object.freeze({ pvShare: 0.40, recovery: 0.50, trainingH: 20, waterDrift: 0.12 });
/** Impostazioni di base del pacchetto (settings.esg18.piano). */
export const PIANO_DEFAULTS = Object.freeze({
  carbonPrice: 80, discountRate: 0.06, ires: 0.24, horizon: 10, ets2Prices: [45, 60, 100], targets: { ...ESG_THRESHOLDS },
  withIncentives: false, teePrice: null, primaryTarget: null, sbtiSubmission: null,
  planVerified: false, verifier: '', verifiedAt: null, planApprovedAt: null, planApprover: '', planOwner: '', planNote: '',
});
export function pianoSettings(d) {
  const s = esgSettings(d, 'piano', PIANO_DEFAULTS);
  return { ...s, carbonPrice: carbonPrice(d), discountRate: clampNum(s.discountRate, 0, 0.3, 0.06), ires: clampNum(s.ires, 0, 0.6, 0.24), horizon: Math.round(clampNum(s.horizon, 1, 40, 10)),
    ets2Prices: A(s.ets2Prices).map(num).filter(x => x != null && x >= 0).slice(0, 5) };
}
const clampNum = (v, lo, hi, fb) => { const x = num(v); return x == null ? fb : Math.max(lo, Math.min(hi, x)); };
/** Prezzo interno del carbonio in € per t CO₂e: settings.esg18.piano.carbonPrice, di base 80. */
export function carbonPrice(d) {
  const v = d?.settings?.esg18?.piano?.carbonPrice;
  return v != null && v !== '' && Number.isFinite(+v) && +v > 0 ? +v : 80;
}
/** Soglie dei criteri ESG: valori di base fusi con settings.esg18.piano.targets (solo numeri validi). */
export function esgThresholds(d) {
  const t = d?.settings?.esg18?.piano?.targets;
  const out = { ...ESG_THRESHOLDS };
  if (t && typeof t === 'object') for (const k of Object.keys(out)) if (t[k] != null && t[k] !== '' && Number.isFinite(+t[k])) out[k] = +t[k];
  return out;
}
/**
 * Il piano di transizione è verificato da terzi? (lo legge il controllo delle dichiarazioni del pacchetto governance: impegni futuri
 * solo con un piano verificato). Vero solo con la spunta, il nome del verificatore e almeno un obiettivo approvato.
 */
export function planVerified(d) {
  const s = d?.settings?.esg18?.piano;
  if (!isObj(s) || s.planVerified !== true || !has(s.verifier)) return false;
  return A(d?.esgTargets).some(t => t && t.status === 'approvato');
}

/* ---------------- metriche degli obiettivi ---------------- */
/**
 * Metriche ammesse negli obiettivi: unità, direzione favorevole, tipo, KPI del catalogo collegato, settori.
 * Le quote sono in punti percentuali (55 = 55%).
 */
export const METRICS = {
  's12-abs': { label: 'Scope 1 + 2', unit: 't CO₂e', dir: 'down', type: 'assoluto', scope: 'Scope 1 + 2 location-based', kpi: 'esg-s12', dec: 0, ghg: 's12', sectors: BOTH },
  's12-t': { label: 'Scope 1 + 2 per tonnellata', unit: 'kg CO₂e/t', dir: 'down', type: 'intensità', scope: 'Scope 1 + 2 location-based per tonnellata prodotta', kpi: 'esg-s12-t', dec: 1, ghg: 's12', sectors: BOTH },
  's3-t': { label: 'Scope 3 per tonnellata', unit: 'kg CO₂e/t', dir: 'down', type: 'intensità', scope: 'Scope 3 delle categorie incluse', kpi: 'esg-s3-t', dec: 0, ghg: 's3', sectors: BOTH },
  'flag-abs': { label: 'Emissioni FLAG', unit: 't CO₂e', dir: 'down', type: 'assoluto', scope: 'FLAG: cambio d’uso e gestione del suolo delle materie prime', dec: 0, ghg: 'flag', sectors: BOTH },
  'ren-el': { label: 'Elettricità rinnovabile', unit: '%', dir: 'up', type: 'quota', scope: 'Quota rinnovabile dell’elettricità consumata', kpi: 'esg-ren-el', dec: 0, sectors: BOTH },
  'soia-dcf': { label: 'Soia senza deforestazione', unit: '%', dir: 'up', type: 'quota', scope: 'Soia DCF fisica sul consumo di soia', kpi: 'esg-soia-dcf', dec: 0, sectors: FEED },
  if: { label: 'Indice di frequenza degli infortuni', unit: 'per milione di ore', dir: 'down', type: 'intensità', scope: 'Infortuni registrabili per milione di ore lavorate', kpi: 'esg-if', dec: 1, sectors: BOTH },
  'acqua-lt': { label: 'Acqua per tonnellata', unit: 'l/t', dir: 'down', type: 'intensità', scope: 'Prelievo d’acqua per tonnellata prodotta', kpi: 'esg-acqua-lt', dec: 0, sectors: BOTH },
  recupero: { label: 'Rifiuti avviati a recupero', unit: '%', dir: 'up', type: 'quota', scope: 'Rifiuti a recupero sul totale', kpi: 'esg-recupero-finale', dec: 0, sectors: BOTH },
  'rame-ha': { label: 'Rame per ettaro nei programmi consigliati', unit: 'kg/ha', dir: 'down', type: 'intensità', scope: 'Rame metallo per ettaro all’anno, media dei programmi di difesa consigliati', dec: 2, sectors: AGRO },
};
export const metricsFor = d => Object.entries(METRICS).filter(([, m]) => m.sectors.includes(sectorOf(d))).map(([id, m]) => ({ id, ...m }));
export const TARGET_STATUS = ['proposto', 'approvato', 'ritirato'];
export const MEASURE_STATUS = ['idea', 'approvata', 'in corso', 'completata', 'scartata'];
const ACTIVE = new Set(['approvata', 'in corso']);
/** Anno di un periodo: l'anno in cui finisce (12 mesi a settembre 2026 → 2026). */
export const periodYear = P => (P && isIso(P.to) ? +P.to.slice(0, 4) : null);

/** Riga dello storico dichiarato (esgHistory) per il periodo P: per chiave, per date o per anno. */
export function declaredRow(d, P) {
  if (!P) return null;
  return A(d?.esgHistory).find(r => r && (r.periodKey === P.key || r.id === P.key || (r.from === P.from && r.to === P.to) || rowMatches(r.id, P))) || null;
}
/** Valore di una metrica in una riga dello storico dichiarato. */
function fromRow(r, metric) {
  if (!r) return null;
  const n = k => num(r[k]);
  const s12 = n('s1') != null && n('s2lb') != null ? n('s1') + n('s2lb') : null;
  switch (metric) {
    case 's12-abs': return s12;
    case 's12-t': return s12 != null && n('tonnes') > 0 ? s12 * 1000 / n('tonnes') : null;
    case 's3-t': return n('s3') != null && n('tonnes') > 0 ? n('s3') * 1000 / n('tonnes') : null;
    case 'flag-abs': return n('flag');
    case 'ren-el': return n('renElPct') ?? (n('mwhRen') != null && n('mwhEl') > 0 ? n('mwhRen') / n('mwhEl') * 100 : null);
    case 'soia-dcf': return n('soyDcfPct');
    case 'if': return n('recordable') != null && n('hours') > 0 ? n('recordable') / n('hours') * 1e6 : null;
    case 'acqua-lt': return n('waterM3') != null && n('tonnes') > 0 ? n('waterM3') * 1000 / n('tonnes') : null;
    case 'recupero': return n('recoveryPct');
    default: return null;
  }
}
const invOk = inv => !!(inv && inv.hasData && inv.coverage?.comparable);

/** Valore calcolato dai registri per il periodo P: {value, quality, source, method} o null. */
function liveValue(d, metric, P) {
  const isCur = () => { const c = safe(() => currentPeriod(d), null); return !!c && c.from === P.from && c.to === P.to; };
  switch (metric) {
    case 's12-abs': case 's12-t': case 's3-t': case 'flag-abs': case 'ren-el': {
      const inv = safe(() => inventory(d, P), null);
      if (!invOk(inv)) return null;
      const v = metric === 's12-abs' ? inv.s1 + inv.s2.lb : metric === 's12-t' ? inv.intensity.opsPerT : metric === 's3-t' ? inv.intensity.s3PerT
        : metric === 'flag-abs' ? inv.s3.flag : inv.energy.renElShare != null ? inv.energy.renElShare * 100 : null;
      return v == null ? null : { value: v, quality: 'calcolato', source: 'clima.inventory', method: 'Inventario GHG della scheda Clima sui mesi chiusi del periodo' };
    }
    case 'soia-dcf': {
      const s = safe(() => soyShares(d, P), null);
      return s && s.tSoy > 0 && s.dcf != null ? { value: s.dcf * 100, quality: 'calcolato', source: 'filiera.soyShares', method: `Soia DCF fisica sul consumo di soia (${nf(s.tSoy)} t); con i crediti a bilancio di massa ${nf((s.dcfMB ?? s.dcf) * 100)}%` } : null;
    }
    case 'if': {
      const r = safe(() => safetyRates(d, P), null);
      const v = num(r?.if ?? r?.ifRate ?? r?.frequency);
      if (v != null) return { value: v, quality: 'calcolato', source: 'persone.safetyRates', method: 'Infortuni registrabili × 1.000.000 ÷ ore lavorate (scheda Persone)' };
      const sv = d?.survey || {}, inj = num(sv['hs-inj']), h = num(sv['hs-hours']);
      return isCur() && inj != null && h > 0 ? { value: inj / h * 1e6, quality: 'dichiarato', source: 'questionario ESG', method: `${nf(inj)} infortuni su ${nf(h)} ore dichiarati nel questionario` } : null;
    }
    case 'acqua-lt': {
      const w = safe(() => waterStats(d, P), null);
      return w && w.intensity != null && w.nMonths >= 9 ? { value: w.intensity * 1000, quality: 'calcolato', source: 'registro dell’acqua', method: 'm³ prelevati × 1.000 ÷ tonnellate prodotte nei mesi confrontabili' } : null;
    }
    case 'recupero': {
      const w = safe(() => wasteStats(d, P), null);
      return w && w.n > 0 && w.recovery != null ? { value: w.recovery * 100, quality: 'calcolato', source: 'registro dei rifiuti', method: 'kg a recupero ÷ kg di rifiuti del periodo' } : null;
    }
    case 'rame-ha': {
      if (!isCur()) return null;
      const progs = A(d?.cropProgrammes).filter(p => p && !p.baseline).map(p => safe(() => programmeCo2(d, p), null)).filter(x => x && finite(x.copperKgHa));
      return progs.length ? { value: sum(progs, p => +p.copperKgHa) / progs.length, quality: 'calcolato', source: 'programmi di difesa', method: `Media del rame metallo per ettaro di ${progs.length} programmi consigliati` } : null;
    }
    default: return null;
  }
}
/** Valore di una metrica nel periodo P: dai registri, altrimenti dallo storico dichiarato. → {value, quality, source, method} (value null se manca). */
export function metricValue(d, metric, P) {
  if (!P || !METRICS[metric]) return { value: null, quality: 'mancante', source: null, method: null };
  const live = safe(() => liveValue(d, metric, P), null);
  if (live && finite(live.value)) return live;
  const r = declaredRow(d, P), v = fromRow(r, metric);
  if (v != null) return { value: v, quality: 'dichiarato', source: 'storico dichiarato', method: r.note || 'Valori dichiarati dallo storico del report' };
  return { value: null, quality: 'mancante', source: null, method: null };
}
/** Storico annuo di una metrica: righe dichiarate più i periodi di rendicontazione → [{year, value, quality, label}] dal più vecchio. */
export function metricHistory(d, metric) {
  const out = new Map();
  for (const r of A(d?.esgHistory)) {
    if (!r || !isIso(r.to)) continue;
    const v = fromRow(r, metric);
    if (v != null) out.set(+r.to.slice(0, 4), { year: +r.to.slice(0, 4), value: v, quality: 'dichiarato', label: r.label || r.periodKey || r.id });
  }
  for (const P of safe(() => reportingPeriods(d), EMPTY)) {
    const y = periodYear(P), m = metricValue(d, metric, P);
    if (y != null && m.value != null && (!out.has(y) || m.quality !== 'dichiarato')) out.set(y, { year: y, value: m.value, quality: m.quality, label: P.label });
  }
  return [...out.values()].sort((a, b) => a.year - b.year);
}

/* ---------------- obiettivi e avanzamento ---------------- */
const baseYearOf = (d, t) => num(t?.baseYear) ?? (typeof t?.baseKey === 'string' ? num((t.baseKey.match(/(\d{4})/g) || []).at(-1)) : null);
/** Obiettivo normalizzato: anni numerici, metrica, etichette. */
export function normTarget(d, t) {
  const M = METRICS[t?.metric] || null;
  // valore base: quello inserito, altrimenti dall'esercizio base (registri o storico dichiarato); obiettivo: inserito o dalla riduzione %
  let baseValue = num(t?.baseValue), baseFrom = baseValue != null ? 'inserito' : null;
  if (baseValue == null && M && typeof t?.baseKey === 'string') {
    const BP = periodByKey(d, t.baseKey), v = BP ? metricValue(d, t.metric, BP) : null;
    if (v?.value != null) { baseValue = v.value; baseFrom = v.quality === 'dichiarato' ? 'storico dichiarato' : 'registri'; }
  }
  let targetValue = num(t?.targetValue), targetFrom = targetValue != null ? 'inserito' : null;
  const rp = num(t?.reductionPct);
  if (targetValue == null && rp != null && baseValue != null) { targetValue = baseValue * (1 - rp / 100); targetFrom = `riduzione del ${nf(rp, rp % 1 ? 1 : 0)}%`; }
  return { ...t, M, baseYear: baseYearOf(d, t), targetYear: num(t?.targetYear), baseValue, baseFrom, targetValue, targetFrom, label: t?.title || M?.label || t?.metric || 'Obiettivo' };
}
/**
 * Avanzamento di un obiettivo nel periodo P: valore attuale, traiettoria nell'anno del periodo, scarto (positivo = in ritardo, frazione
 * della traiettoria), in linea entro il 2%, raggiunto, tasso annuo necessario da qui all'anno obiettivo.
 */
export function progress(d, t0, P) {
  const t = normTarget(d, t0);
  const year = periodYear(P);
  const a = metricValue(d, t.metric, P);
  const path = pathAt(t, year);
  const dir = t.M?.dir || 'down';
  const gap = a.value != null && path != null && path !== 0 ? (dir === 'up' ? (path - a.value) : (a.value - path)) / Math.abs(path) : null;
  const achieved = a.value != null && t.targetValue != null ? (dir === 'up' ? a.value >= t.targetValue : a.value <= t.targetValue) : false;
  const onTrack = gap == null ? null : achieved || gap <= 0.02;
  const yearsLeft = t.targetYear != null && year != null ? t.targetYear - year : null;
  const needRate = yearsLeft > 0 ? requiredRate(a.value, t.targetValue, yearsLeft) : null;
  const done = t.baseValue != null && t.targetValue != null && a.value != null && t.baseValue !== t.targetValue ? (t.baseValue - a.value) / (t.baseValue - t.targetValue) : null;
  return { target: t, year, actual: a.value, quality: a.quality, source: a.source, method: a.method, path, gap, onTrack, achieved, yearsLeft, needRate, done,
    state: a.value == null ? 'unknown' : achieved ? 'achieved' : onTrack ? 'onTrack' : 'offTrack' };
}
/** Serie per il grafico: anni dall'anno base all'anno obiettivo, valori effettivi (storico e periodi) e traiettoria. */
export function progressSeries(d, t0) {
  const t = normTarget(d, t0);
  if (t.baseYear == null || t.targetYear == null) return { years: [], actual: [], path: [] };
  const hist = new Map(metricHistory(d, t.metric).map(h => [h.year, h.value]));
  if (t.baseValue != null && !hist.has(t.baseYear)) hist.set(t.baseYear, t.baseValue);
  const from = Math.min(t.baseYear, ...[...hist.keys()].filter(y => y >= t.baseYear - 2)), to = Math.max(t.targetYear, ...hist.keys());
  const years = [];
  for (let y = from; y <= to && years.length < 40; y++) years.push(y);
  return { years, actual: years.map(y => hist.get(y) ?? null), path: years.map(y => (y >= t.baseYear ? pathAt(t, y) : null)) };
}
/** Obiettivo principale: quello scelto nelle impostazioni, altrimenti il primo approvato su Scope 1 + 2 (intensità, poi assoluto). */
export function primaryTarget(d) {
  const ts = A(d?.esgTargets).filter(t => t && t.status !== 'ritirato' && METRICS[t.metric]);
  const id = d?.settings?.esg18?.piano?.primaryTarget;
  const pick = ts.find(t => t.id === id);
  if (pick) return pick;
  const appr = ts.filter(t => t.status === 'approvato');
  for (const m of ['s12-t', 's12-abs', 's3-t', 'flag-abs']) { const x = appr.find(t => t.metric === m) || ts.find(t => t.metric === m); if (x) return x; }
  return appr[0] || ts[0] || null;
}

/* ---------------- libreria delle misure e stima dai dati ---------------- */
export function pianoPack(d) { return activePack(d, 'piano', PACK_PIANO) || { ...PACK_PIANO, origin: 'integrato' }; }
const packItem = (d, id) => A(pianoPack(d).items).find(x => x && x.id === id) || PACK_PIANO.items.find(x => x.id === id) || null;
/** Voci della libreria per il settore dell'archivio, con il titolo del settore. */
export function measureLibrary(d) {
  const sector = sectorOf(d);
  return A(pianoPack(d).items).filter(x => x && x.kind === 'misura' && (!A(x.sectors).length || x.sectors.includes(sector)))
    .filter(x => x.effect?.kind !== 'pcf' || safe(() => pcfOn(d), false))
    .map(x => ({ ...x, title: x.titleBy?.[sector] || x.title }));
}
export const libItem = (d, libId) => measureLibrary(d).find(x => x.id === libId) || null;
const pctTxt = v => nf(v * 100, Math.abs(v * 100 - Math.round(v * 100)) < 0.05 ? 0 : 1);
const mid = r => (Array.isArray(r) && r.length ? (num(r[0]) + num(r[r.length - 1])) / 2 : num(r));
const fuelPrice = (d, fuel, P) => {
  const pr = packItem(d, 'prezzi') || {}, en = d?.settings?.energy || {};
  if (fuel === 'gpl') return { value: num(en.gplPrice) ?? num(pr.gplEurPerKg) ?? 0.98, unit: '€/kg' };
  if (fuel === 'gas') return { value: num(pr.gasEurPerSmc) ?? 0.48, unit: '€/Smc' };
  if (fuel === 'gasolio' || fuel === 'hvo') return { value: num(pr.dieselEurPerL) ?? 1.55, unit: '€/l' };
  return { value: 0, unit: '' };
};

/**
 * Base dello stabilimento per le stime (periodo P, annualizzata): elettricità, rete e fattore di rete, combustibili per uso,
 * gasolio della flotta, energia dell'unità locale, tonnellate, emissioni per scope, prezzi. Dall'inventario del pacchetto clima.
 */
export function plantBasis(d, P) {
  const inv = P ? safe(() => inventory(d, P), null) : null;
  if (!inv || !inv.hasData) return { ok: false, comparable: false, months: 0 };
  const n = inv.window?.months?.length || 12, k = 12 / Math.max(1, n);
  const en = d?.settings?.energy || {}, pr = packItem(d, 'prezzi') || {};
  const lines = A(inv.scope1?.lines).filter(l => l && !l.excluded);
  const loc = safe(() => plantLocation(d), null);
  const rm = num(inv.s2?.efRm?.value) ?? num(safe(() => factor(d, 'el.rm.it'), null)?.value);
  return {
    ok: true, comparable: invOk(inv), months: n, period: P, inv,
    kwhElec: (inv.s2.kwhElec || 0) * k, kwhGrid: (inv.s2.kwhGrid || 0) * k, kwhSelf: (inv.s2.kwhSelf || 0) * k,
    efGrid: num(inv.drivers?.efLb) ?? num(inv.s2?.efLb?.value) ?? 0, gridSource: inv.meta?.grid?.source || inv.s2?.efLb?.source || '', efRm: rm,
    mwhUnit: (inv.energy?.mwh || 0) * k, tonnes: (inv.intensity?.tonnes || 0) * k,
    s1: inv.s1 * k, s2: inv.s2.lb * k, s3: inv.s3.total * k, flag: inv.s3.flag * k, c1: (inv.s3.c1 || 0) * k,
    fuel: use => lines.filter(l => l.scope === 1 && l.use === use && (l.group === 'stationary' || l.group === 'mobile')).map(l => ({ fuel: l.fuel, unit: l.unit, activity: (num(l.activity) || 0) * k, tco2e: (l.tco2e || 0) * k, mwh: (l.mwh || 0) * k, fossil: (l.fossil || 0) * k, ets2: !!l.ets2 })),
    kwhPrice: num(en.kwhPrice) ?? num(pr.kwhEur) ?? 0.19, lat: loc?.lat ?? null,
  };
}
const lineCost = (d, l) => l.activity * (fuelPrice(d, l.fuel).value || 0);

/** Prodotti per le leve di formulazione: quelli indicati nella misura, altrimenti i 4 con più volume (solo mangimificio). */
function pcfProducts(d, m) {
  const ids = A(m?.products).filter(has);
  if (ids.length) return ids.slice(0, 8);
  const vol = {};
  const today = esgToday(d), from = addDays(today, -365);
  for (const s of A(d?.shipments)) if (s && s.productId && String(s.date || '') > from && String(s.date || '') <= today) vol[s.productId] = (vol[s.productId] || 0) + (num(s.tonnes) || 0);
  return A(d?.products).filter(p => p && p.active !== false && p.formulaId && vol[p.id] > 0).sort((a, b) => vol[b.id] - vol[a.id]).slice(0, 4).map(p => p.id);
}

/**
 * Stima dell'effetto di una misura dai dati dell'archivio (libreria × base dello stabilimento). Valori annui.
 * → {tco2Year, tco2Mb?, savingsEur, opexDelta, capex, mwhSaved, processMWh, tee: {mwhEl, kSmcGas, tGpl, kLDiesel}, vocKg?, basis (testo),
 *    formula, quality, source, products?} oppure null se la libreria o i dati mancano.
 */
export function estimateEffect(d, m, B) {
  const lib = m?.libId ? (libItem(d, m.libId) || packItem(d, m.libId)) : null;
  if (!lib || !lib.effect) return null;
  const e = lib.effect, p = isObj(m.params) ? m.params : {}, sector = sectorOf(d);
  const capexOf = () => { const c = lib.capex || {}; const u = num(p.capexUnit) ?? mid([c.lo, c.hi]); const nU = num(p.n) ?? num(c.n) ?? 1; return u == null ? null : u * nU; };
  const out = { tco2Year: null, savingsEur: 0, opexDelta: num(e.opexPerYear) ?? 0, capex: capexOf(), mwhSaved: null, processMWh: null, tee: {}, basis: '', formula: '', quality: 'stimato', source: `piano.${lib.id}` };
  const b = B?.ok ? B : null;
  switch (e.kind) {
    case 'el': {
      if (!b) return null;
      const share = num(p.share) ?? num(e.shareBy?.[sector]) ?? num(e.share) ?? 0, sav = num(p.saving) ?? mid(e.saving) ?? 0;
      const kwh = b.kwhElec * share * sav;
      Object.assign(out, { tco2Year: kwh * b.efGrid / 1000, savingsEur: kwh * b.kwhPrice, mwhSaved: kwh / 1000, processMWh: b.kwhElec * share / 1000, tee: { mwhEl: kwh / 1000 },
        basis: `${nf(b.kwhElec / 1000)} MWh di elettricità × ${pctTxt(share)}% (${e.basis}) × ${pctTxt(sav)}% di risparmio = ${nf(kwh / 1000, 1)} MWh l’anno`,
        formula: `MWh risparmiati × ${nf(b.efGrid, 4)} kg CO₂/kWh (rete, location-based) · ${nf(b.kwhPrice, 2)} €/kWh` });
      return out;
    }
    case 'fuel': case 'switch': {
      if (!b) return null;
      const ls = b.fuel(e.use || 'vapore').filter(l => l.tco2e > 0);
      if (!ls.length) return null;
      const t = sum(ls, l => l.tco2e), mwh = sum(ls, l => l.mwh), cost = sum(ls, l => lineCost(d, l));
      if (e.kind === 'fuel') {
        const sav = num(p.saving) ?? mid(e.saving) ?? 0;
        const tee = {}; for (const l of ls) { if (l.fuel === 'gpl') tee.tGpl = (tee.tGpl || 0) + l.activity / 1000 * sav; if (l.fuel === 'gas') tee.kSmcGas = (tee.kSmcGas || 0) + l.activity / 1000 * sav; }
        Object.assign(out, { tco2Year: t * sav, savingsEur: cost * sav, mwhSaved: mwh * sav, processMWh: mwh, tee,
          basis: `${nf(mwh)} MWh di ${listJoin([...new Set(ls.map(l => l.fuel === 'gpl' ? 'GPL' : l.fuel))])} (${e.basis}) × ${pctTxt(sav)}% = ${nf(mwh * sav)} MWh l’anno`,
          formula: `${nf(t, 1)} t CO₂e del combustibile × ${pctTxt(sav)}%; costo del combustibile ${nf(cost)} € l’anno × ${pctTxt(sav)}%` });
      } else {
        const cut = num(p.cut) ?? num(e.cut) ?? 0.8, prem = num(p.fuelPremium) ?? num(e.fuelPremium) ?? 0;
        Object.assign(out, { tco2Year: t * cut, opexDelta: cost * prem, processMWh: mwh,
          basis: `${nf(t, 1)} t CO₂e del calore di processo (${nf(mwh)} MWh) × ${nf(cut * 100)}% di riduzione`, formula: `maggior costo dell’energia ${nf(prem * 100)}% di ${nf(cost)} € l’anno` });
      }
      return out;
    }
    case 'pv': {
      if (!b) return null;
      const kWp = num(p.kWp) ?? num(e.kWpBy?.[sector]) ?? num(e.kWp) ?? 0, y = num(p.yield) ?? (b.lat != null && b.lat >= 42 ? num(e.yieldNorth) : num(e.yieldSouth)) ?? 1350;
      const self = num(p.selfUse) ?? num(e.selfUse) ?? 0.8, bess = num(p.bessKwh) ?? num(e.bessKwh) ?? 0;
      const kwh = Math.min(kWp * y * self, b.kwhGrid);
      const c = lib.capex || {};
      Object.assign(out, { tco2Year: kwh * b.efGrid / 1000, savingsEur: kwh * b.kwhPrice, mwhSaved: kwh / 1000, processMWh: b.kwhElec / 1000, selfGen: true,
        capex: num(p.capexUnit) != null ? kWp * num(p.capexUnit) + bess * (num(c.bessPerKwh) ?? 500) : kWp * (mid([c.lo, c.hi]) ?? 1000) + bess * (num(c.bessPerKwh) ?? 500),
        basis: `${nf(kWp)} kWp × ${nf(y)} kWh/kWp × ${nf(self * 100)}% autoconsumato${bess ? ` (accumulo ${nf(bess)} kWh)` : ''} = ${nf(kwh / 1000)} MWh di rete evitati`,
        formula: `MWh evitati × ${nf(b.efGrid, 4)} kg CO₂/kWh · ${nf(b.kwhPrice, 2)} €/kWh; producibilità del ${b.lat != null && b.lat >= 42 ? 'Nord' : 'Sud'} Italia` });
      return out;
    }
    case 'fleet': {
      if (!b) return null;
      const ls = b.fuel('flotta').filter(l => l.tco2e > 0 && (l.fuel === 'gasolio' || l.fuel === 'benzina'));
      if (!ls.length) return null;
      const t = sum(ls, l => l.tco2e), litres = sum(ls.filter(l => l.unit === 'l'), l => l.activity);
      const share = num(p.share) ?? num(e.share) ?? 1, cut = num(p.cut) ?? num(e.cut) ?? 0;
      const dp = fuelPrice(d, 'gasolio').value;
      Object.assign(out, { tco2Year: t * share * cut, mwhSaved: e.saveFuel ? sum(ls, l => l.mwh) * share * cut : null, processMWh: sum(ls, l => l.mwh),
        savingsEur: e.saveFuel ? litres * share * cut * dp : 0, opexDelta: (num(e.opexPerYear) ?? 0) + (e.saveFuel ? 0 : litres * share * (num(p.extraEurPerL) ?? num(e.extraEurPerL) ?? 0)),
        tee: e.saveFuel ? { kLDiesel: litres * share * cut / 1000 } : {},
        basis: `${nf(litres)} litri di gasolio della flotta (${nf(t, 1)} t CO₂e) × ${pctTxt(share)}% × ${pctTxt(cut)}% di riduzione`,
        formula: e.saveFuel ? `litri risparmiati × ${nf(dp, 2)} €/l` : `maggior costo ${nf(num(p.extraEurPerL) ?? e.extraEurPerL, 2)} €/l sui litri sostituiti` });
      return out;
    }
    case 'go': {
      if (!b) return null;
      const mwh = b.kwhGrid / 1000, eurMWh = num(p.eurPerMWh) ?? num(e.eurPerMWh) ?? 1.5;
      Object.assign(out, { tco2Year: 0, tco2Mb: b.efRm != null ? mwh * b.efRm : null, opexDelta: mwh * eurMWh, mbOnly: true,
        basis: `${nf(mwh)} MWh di rete coperti da garanzie d’origine`, formula: `${nf(eurMWh, 2)} €/MWh; riduce solo il market-based${b.efRm != null ? ` (mix residuo ${nf(b.efRm, 3)} kg CO₂/kWh)` : ''}` });
      return out;
    }
    case 'pcf': {
      if (!safe(() => pcfOn(d), false)) return null;
      const share = num(p.share) ?? num(e.share) ?? 1, prods = pcfProducts(d, m);
      let t = 0, eur = 0, used = [], lvLabel = p.lever || e.lever;
      for (const pid of prods) {
        const mc = safe(() => productMacc(d, pid), null);
        const lv = A(mc?.levers).find(x => x.id === (p.lever || e.lever));
        if (!lv || !lv.feasible || !lv.reduces) continue;
        t += lv.annualT || 0; eur += lv.annualEur || 0; used.push(mc.name || pid); lvLabel = lv.short || lv.label || lvLabel;
      }
      if (!used.length) return { ...out, tco2Year: null, capex: 0, basis: 'Nessun prodotto con la leva applicabile nella formulazione a basso carbonio', products: prods };
      Object.assign(out, { tco2Year: t * share, opexDelta: Math.max(0, eur) * share, savingsEur: Math.max(0, -eur) * share, capex: num(p.capexUnit) ?? 0, quality: 'calcolato', source: 'pcf.productMacc', products: prods,
        basis: `Leva «${lvLabel}» della formulazione a basso carbonio su ${listJoin(used)}: ${nf(t, 1)} t CO₂e e ${nf(eur)} € l’anno sui volumi venduti × ${pctTxt(share)}% del volume`,
        formula: 'Programmazione lineare a parità di specifica nutrizionale (scheda Impronta, leve per prodotto)' });
      return out;
    }
    case 'ing': {
      const re = e.match === 'rame' ? /rame|^cu|copper/i : new RegExp(e.match || '^$', 'i');
      const ings = A(d?.ingredients).filter(i => i && (re.test(String(i.category || '')) || re.test(String(i.id || '')) || re.test(String(i.name || ''))));
      if (!ings.length || !b) return null;
      const P = b.period;
      const tByIng = {};
      for (const l of A(d?.ingLots)) if (l && ings.some(i => i.id === l.ingId) && isIso(l.date) && l.date >= P.from && l.date <= P.to && l.status !== 'respinto') tByIng[l.ingId] = (tByIng[l.ingId] || 0) + (num(l.tonnes) || 0);
      const k = 12 / Math.max(1, b.months);
      const tons = sum(ings, i => (tByIng[i.id] || 0) * k);
      if (!(tons > 0)) return null;
      const cut = num(p.cut) ?? num(e.cut) ?? 0;
      const co2 = sum(ings, i => (tByIng[i.id] || 0) * k * (num(i.ef) || 0) / 1000), eur = sum(ings, i => (tByIng[i.id] || 0) * k * (num(i.price) || 0));
      Object.assign(out, { tco2Year: co2 * cut, savingsEur: e.match === 'rame' ? 0 : eur * cut, vocKg: num(e.vocShare) ? tons * 1000 * num(e.vocShare) : null,
        basis: `${nf(tons)} t l’anno di ${listJoin(ings.filter(i => tByIng[i.id]).map(i => i.name))} × ${pctTxt(cut)}% (${e.basis})`,
        formula: `t evitate × fattore della materia prima (${nf(co2 / tons, 0)} kg CO₂e/t in media)${e.match === 'rame' ? '; ricavi invariati: cambia la composizione del portafoglio' : ` · ${nf(eur / tons)} €/t`}` });
      return out;
    }
    case 'pack': {
      if (!b) return null;
      const P = b.period, prods = new Map(A(d?.products).filter(x => x && x.uom === 'L').map(x => [x.id, x]));
      const litres = sum(A(d?.shipments).filter(s => s && prods.has(s.productId) && isIso(s.date) && s.date >= P.from && s.date <= P.to), s => (num(s.tonnes) || 0) * 1000) * 12 / Math.max(1, b.months);
      if (!(litres > 0)) return null;
      const kg = litres * (num(e.kgPerL) ?? 0.045), pcr = num(p.pcr) ?? num(e.pcr) ?? 0.3;
      Object.assign(out, { tco2Year: kg * pcr * (num(e.saveKgPerKg) ?? 1.4) / 1000, opexDelta: kg * pcr * (num(e.extraEurPerKg) ?? 0.15),
        basis: `${nf(litres)} litri venduti l’anno × ${nf(num(e.kgPerL) ?? 0.045, 3)} kg di plastica per litro = ${nf(kg)} kg; ${nf(pcr * 100)}% riciclato`,
        formula: `kg di plastica vergine sostituita × ${nf(num(e.saveKgPerKg) ?? 1.4, 1)} kg CO₂e/kg; maggior costo ${nf(num(e.extraEurPerKg) ?? 0.15, 2)} €/kg` });
      return out;
    }
    case 'cov':
      Object.assign(out, { tco2Year: 0, vocKg: num(p.vocKg) ?? num(e.vocKg), noCo2: true, basis: e.basis || '', formula: 'Nessuna riduzione di CO₂: beneficio sulle emissioni di composti organici volatili' });
      return out;
    default: return null;
  }
}

/* ---------------- modello del piano ---------------- */
const MODEL = new WeakMap();
const FIELDS_NUM = ['tco2Year', 'savingsEur', 'opexDelta', 'capex'];
/** Misura con i valori in uso: quelli inseriti (preventivi, misure) o, dove mancano, la stima dai dati. Ogni valore dice da dove viene. */
function resolveMeasure(d, m, B) {
  const est = safe(() => estimateEffect(d, m, B), null);
  const lib = m.libId ? (libItem(d, m.libId) || packItem(d, m.libId)) : null;
  const v = {}, from = {};
  for (const k of FIELDS_NUM) {
    const own = num(m[k]);
    if (own != null) { v[k] = own; from[k] = 'inserito'; } else if (est && num(est[k]) != null) { v[k] = +est[k]; from[k] = 'stima'; } else { v[k] = null; from[k] = 'mancante'; }
  }
  if (v.opexDelta == null) v.opexDelta = 0;
  if (v.savingsEur == null) v.savingsEur = 0;
  const life = num(m.lifeYears) ?? num(lib?.lifeYears) ?? null;
  const mwhSaved = num(m.mwhSaved) ?? est?.mwhSaved ?? null;
  const quality = from.tco2Year === 'inserito' ? 'dichiarato' : from.tco2Year === 'stima' ? est.quality : 'mancante';
  return { ...m, title: m.title || lib?.title || 'Misura', lever: m.lever || lib?.lever || null, scopeHit: m.scopeHit || lib?.scopeHit || null, incentive: m.incentive === undefined ? lib?.incentive ?? null : m.incentive,
    lifeYears: life, values: v, from, est, lib, mwhSaved, processMWh: num(m.processMWh) ?? est?.processMWh ?? null, quality,
    tco2Mb: est?.tco2Mb ?? null, vocKg: num(m.vocKg) ?? est?.vocKg ?? null, noCo2: !!est?.noCo2 || m.scopeHit === 'COV', mbOnly: !!est?.mbOnly || m.scopeHit === 'S2-MB',
    startYear: num(m.startYear), tee: est?.tee || {} };
}
const scopeOf = s => (typeof s === 'string' ? (s.startsWith('S3') || s === 'FLAG' ? 's3' : s === 'S1' || s === 'S2' || s === 'S1+S2' ? 's12' : s === 'S2-MB' ? 'mb' : 'other') : 'other');

/** Incentivi del piano: iperammortamento per scaglioni sull'investimento complessivo, certificati bianchi, schede di ammissibilità. */
function incentivesFor(d, ms, S, B) {
  const iper = packItem(d, 'iper') || {}, tee = packItem(d, 'tee') || {};
  const win = iper.dates || {};
  const fromY = num(String(win.from || '2026').slice(0, 4)) ?? 2026, toY = num(String(win.investBy || '2028').slice(0, 4)) ?? 2028;
  const elig = ms.filter(m => (m.incentive === 'iper-green' || m.incentive === 'iper-base') && m.status !== 'scartata' && m.startYear != null && m.startYear >= fromY && m.startYear <= toY
    && !(m.status === 'completata' && isIso(m.completedAt) && m.completedAt < (win.from || '2026-01-01')) && (m.values.capex || 0) > 0);
  const out = new Map();
  for (const m of elig) {
    const g = greenTest({ savedMWh: m.mwhSaved, unitMWh: B?.mwhUnit, processMWh: m.processMWh }, iper.greenTest || {});
    const green = m.incentive === 'iper-green' && (g.pass || !!m.est?.selfGen);
    out.set(m.id, { kind: 'iper', green, test: g, selfGen: !!m.est?.selfGen });
  }
  const total = sum(elig, m => m.values.capex);
  const gTot = iperUplift(total, true, iper.bands || []), bTot = iperUplift(total, false, iper.bands || []);
  for (const m of elig) {
    const x = out.get(m.id), rate = (x.green ? gTot : bTot).rate;
    const uplift = m.values.capex * rate;
    const tv = iperTaxValue(uplift, { ires: S.ires, rate: S.discountRate, years: iper.deprYears || 5 });
    Object.assign(x, { rate, uplift, value: tv.present, nominal: tv.nominal });
  }
  for (const m of ms) {
    if (m.incentive !== 'TEE' || out.has(m.id)) continue;
    const toe = teeToe(m.tee, tee.toe || undefined);
    const min = num(tee.minToe?.PC) ?? 10, price = num(S.teePrice);
    const yrs = num(tee.years) ?? 5;
    out.set(m.id, { kind: 'TEE', toe, eligible: toe >= min, min, price, value: price != null && toe >= min ? toe * price * annuityFactor(S.discountRate, yrs) : 0, annual: price != null ? toe * price : null, years: yrs });
  }
  for (const m of ms) if ((m.incentive === 'conto-termico' || m.incentive === 'sabatini') && !out.has(m.id)) out.set(m.id, { kind: m.incentive, value: 0, checklist: A(packItem(d, m.incentive)?.checklist) });
  for (const m of ms) if ((m.incentive === 'iper-green' || m.incentive === 'iper-base') && !out.has(m.id)) out.set(m.id, { kind: 'iper', value: 0, ineligible: true,
    reason: m.startYear == null ? 'anno di avvio non indicato' : m.startYear < fromY || m.startYear > toY ? `investimento fuori dalla finestra ${fromY}-${toY}` : !(m.values.capex > 0) ? 'investimento non indicato' : 'misura completata prima del 2026' });
  return { byId: out, iper: { total, green: gTot, base: bTot, eligible: elig.map(m => m.id), rule: iper }, tee };
}

/**
 * Modello del piano per il periodo P (cache per archivio): impostazioni, base dello stabilimento, obiettivi con avanzamento, misure con
 * valori, economia e incentivi, curva dei costi, copertura dell'obiettivo principale, tabella di marcia, finanziamenti, ETS2, SBTi e FLAG.
 */
export function planModel(d, P) {
  if (!d || !P || !isIso(P.from) || !isIso(P.to)) return null;
  let m = MODEL.get(d);
  if (!m) { m = new Map(); MODEL.set(d, m); }
  const key = `${P.key || ''}|${P.from}|${P.to}`;
  if (m.has(key)) return m.get(key);
  const out = buildModel(d, P);
  m.set(key, out);
  if (m.size > 12) m.delete(m.keys().next().value);
  return out;
}
function buildModel(d, P) {
  const S = pianoSettings(d), sector = sectorOf(d);
  const B = plantBasis(d, P);
  const targets = A(d.esgTargets).filter(t => t && has(t.id)).map(t => ({ ...normTarget(d, t), progress: progress(d, t, P) }));
  const prim = primaryTarget(d);
  const primary = prim ? targets.find(t => t.id === prim.id) || null : null;
  const raw = A(d.measures).filter(x => x && has(x.id)).map(x => resolveMeasure(d, x, B));
  const inc = incentivesFor(d, raw, S, B);
  const measures = raw.map(x => {
    const ic = inc.byId.get(x.id) || null;
    const base = { capex: x.values.capex, opexDelta: x.values.opexDelta, savingsEur: x.values.savingsEur, tco2Year: x.values.tco2Year, lifeYears: x.lifeYears };
    const prm = { carbonPrice: S.carbonPrice, rate: S.discountRate, horizon: S.horizon };
    const econ = economics(base, prm), econInc = economics(base, { ...prm, incentiveValue: ic?.value || 0 });
    return { ...x, incentiveCalc: ic, econ, econInc, use: S.withIncentives ? econInc : econ, scope: scopeOf(x.scopeHit) };
  });
  const live = measures.filter(x => x.status !== 'scartata');
  const maccRows = live.filter(x => x.status !== 'completata' && !x.noCo2 && !x.mbOnly).map(x => ({ id: x.id, label: x.title, tco2: x.values.tco2Year, mac: x.use.mac, status: x.status, lever: x.lever, npv: x.use.npv, scope: x.scope }));
  const macc = maccCurve(maccRows);
  const cov = coverage(d, primary, live, B, P);
  return {
    P, sector, S, B, targets, primary, measures, live, inc, macc, coverage: cov,
    capexByYear: capexByYear(live), sll: A(d.sllLoans).filter(l => l && has(l.id)).map(l => sllStatus(d, l, P)),
    sbti: sbtiFor(d, B), flag: flagFor(d, B, S),
  };
}

/** Investimenti per anno di avvio (misure non scartate e non ancora completate prima dell'anno). */
function capexByYear(ms) {
  const by = {};
  for (const m of ms) { if (m.startYear == null || !(m.values.capex > 0)) continue; const y = m.startYear; by[y] = by[y] || { year: y, capex: 0, active: 0, idea: 0, done: 0 }; by[y].capex += m.values.capex; by[y][m.status === 'idea' ? 'idea' : m.status === 'completata' ? 'done' : 'active'] += m.values.capex; }
  return Object.values(by).sort((a, b) => a.year - b.year);
}
/** Le misure che agiscono sulla metrica di un obiettivo (Scope 1 + 2, Scope 3, FLAG). */
const hits = (t, m) => {
  const g = t?.M?.ghg;
  if (!g || m.noCo2 || m.mbOnly) return false;
  if (g === 's12') return m.scope === 's12';
  if (g === 's3') return m.scope === 's3';
  if (g === 'flag') return m.scope === 's3' && (m.lever === 'acquisti' || m.lever === 'formulazione');
  return false;
};
/** Da t CO₂e/anno all'unità dell'obiettivo (intensità: kg per tonnellata prodotta). */
const toUnit = (t, B, tco2) => (t?.M?.type === 'intensità' ? (B?.tonnes > 0 ? tco2 * 1000 / B.tonnes : null) : tco2);
/**
 * Copertura dell'obiettivo principale: t CO₂e/anno delle misure approvate o in corso (avvio entro l'anno obiettivo) ÷ t CO₂e/anno ancora
 * necessarie (valore attuale − obiettivo, in tonnellate). → {needed, planned, withIdeas, ratio, ratioIdeas, unitPlanned, ...}
 */
function coverage(d, t, ms, B, P) {
  if (!t || !t.M?.ghg || !t.progress || t.progress.actual == null || t.targetValue == null) return null;
  const a = t.progress.actual, tv = t.targetValue;
  const neededUnit = a - tv;
  const needed = t.M.type === 'intensità' ? (B?.tonnes > 0 ? neededUnit * B.tonnes / 1000 : null) : neededUnit;
  const rel = ms.filter(m => hits(t, m) && m.status !== 'completata' && (m.startYear == null || t.targetYear == null || m.startYear <= t.targetYear));
  const planned = sum(rel.filter(m => ACTIVE.has(m.status)), m => m.values.tco2Year || 0), withIdeas = planned + sum(rel.filter(m => m.status === 'idea'), m => m.values.tco2Year || 0);
  const ratio = needed == null ? null : needed <= 0 ? 1 : planned / needed;
  return { needed, neededUnit, planned, withIdeas, ratio, ratioIdeas: needed == null ? null : needed <= 0 ? 1 : withIdeas / needed, n: rel.length, unitPlanned: toUnit(t, B, planned), unitIdeas: toUnit(t, B, withIdeas) };
}
/**
 * Tabella di marcia verso un obiettivo sulle emissioni: per anno, investimenti, riduzione cumulata delle misure (approvate e in corso;
 * con le idee) e valore atteso contro la traiettoria. → {years: [{year, capex, path, planned, withIdeas}], gapClosed, gapClosedIdeas} | null
 */
export function roadmap(model, targetId) {
  if (!model) return null;
  const t = model.targets.find(x => x.id === targetId) || model.primary;
  if (!t || !t.M?.ghg || t.progress?.actual == null || t.targetYear == null) return null;
  const B = model.B, y0 = t.progress.year, a = t.progress.actual;
  const rel = model.live.filter(m => hits(t, m) && m.status !== 'completata');
  const years = [];
  const end = Math.max(t.targetYear, y0 + 1);
  // una misura vale per intero dall'anno dopo l'avvio (senza anno di avvio: dall'anno dopo il periodo attuale)
  const on = (m, y) => y > y0 && (m.startYear == null ? true : m.startYear < y);
  for (let y = y0; y <= end && years.length < 30; y++) {
    const act = sum(rel.filter(m => ACTIVE.has(m.status) && on(m, y)), m => m.values.tco2Year || 0);
    const all = act + sum(rel.filter(m => m.status === 'idea' && on(m, y)), m => m.values.tco2Year || 0);
    const cap = sum(model.live.filter(m => m.startYear === y && m.status !== 'completata'), m => m.values.capex || 0);
    years.push({ year: y, capex: cap, path: pathAt(t, y), planned: y === y0 ? a : a - (toUnit(t, B, act) ?? 0), withIdeas: y === y0 ? a : a - (toUnit(t, B, all) ?? 0), cutPlanned: act, cutIdeas: all });
  }
  const last = years[years.length - 1], need = a - t.targetValue;
  return { target: t, years, gapClosed: need > 0 ? (a - last.planned) / need : 1, gapClosedIdeas: need > 0 ? (a - last.withIdeas) / need : 1, endPlanned: last.planned, endIdeas: last.withIdeas };
}

/* ---------------- SBTi e FLAG ---------------- */
function sbtiFor(d, B) {
  const r = packItem(d, 'sbti') || {};
  const rep = d?.settings?.esg18?.report || {}, gov = d?.settings?.esg18?.governance || {};
  const turnover = num(rep.turnover) ?? safe(() => { const inv = B?.inv; return inv?.intensity?.revenueNet != null ? inv.intensity.revenueNet * 12 / Math.max(1, B.months) : null; }, null);
  const sv = d?.survey || {};
  const emp = num(rep.fte) ?? num(gov.employees) ?? (isObj(sv['pe-cat']) ? sum(Object.values(sv['pe-cat']), v => num(v) || 0) : null);
  const ans = A(d?.esgAnswers).filter(a => a && a.dpId === 'B1.balance-sheet' && num(a.value) != null).sort((a, b) => String(b.periodKey || '').localeCompare(String(a.periodKey || '')))[0];
  const balanceSheet = num(rep.balanceSheet) ?? num(ans?.value);
  const res = sbtiCategory({ s12: B?.ok ? B.s1 + B.s2 : null, balanceSheet, turnover, fte: emp }, r.categoryA || {});
  return { ...res, rule: r, inputs: { turnover, balanceSheet, fte: emp } };
}
function flagFor(d, B, S) {
  const r = packItem(d, 'sbti') || {};
  if (!B?.ok) return null;
  const total = B.s1 + B.s2 + B.s3;
  return { ...flagCheck({ flag: B.flag, total }, r.flag || {}, S.sbtiSubmission), flag: B.flag, total, hasTarget: A(d.esgTargets).some(t => t && t.metric === 'flag-abs' && t.status !== 'ritirato') };
}

/* ---------------- finanziamenti legati alla sostenibilità ---------------- */
/**
 * Stato di un finanziamento: per KPI storico (anni con un valore), valore attuale, obiettivo dell'anno (SPT), esito e scatto del margine;
 * prossima data di verifica; effetto annuo totale in €. Lo scatto si divide in parti uguali tra i KPI.
 */
export function sllStatus(d, loan, P) {
  const today = esgToday(d);
  const kpis = A(loan?.kpis).filter(k => k && METRICS[k.metric]);
  const per = kpis.length ? (num(loan.ratchetBps) ?? 0) / kpis.length : 0;
  const year = periodYear(P);
  const rule = packItem(d, 'sll') || {};
  const rows = kpis.map((k, i) => {
    const M = METRICS[k.metric];
    const hist = metricHistory(d, k.metric);
    const cur = metricValue(d, k.metric, P);
    const spts = isObj(k.spt) ? Object.entries(k.spt).map(([y, v]) => ({ year: +y, value: num(v) })).filter(x => x.value != null && Number.isFinite(x.year)).sort((a, b) => a.year - b.year) : [];
    const spt = spts.find(s => s.year === year) || spts.filter(s => s.year <= year).at(-1) || null;
    const nextSpt = spts.find(s => s.year > year) || null;
    const o = sptOutcome(cur.value, spt?.value, k.dir || M.dir, per);
    const oNext = nextSpt ? sptOutcome(cur.value, nextSpt.value, k.dir || M.dir, per) : null;
    return { i, metric: k.metric, M, label: k.label || M.label, unit: M.unit, dir: k.dir || M.dir, history: hist, years: hist.length, enoughHistory: hist.length >= (num(rule.minHistoryYears) ?? 3),
      current: cur.value, quality: cur.quality, spt, nextSpt, spts, outcome: o, nextOutcome: oNext, eur: ratchetEur(loan.amount, o.bps), bps: o.bps, atRisk: !!(oNext && oNext.met === false) || o.met === false };
  });
  const tests = A(loan?.testDates).filter(isIso).map(s => s.slice(0, 10)).sort();
  const next = tests.find(s => s >= today) || null;
  const bpsTot = sum(rows, r => r.bps);
  return { loan, id: loan?.id, bank: loan?.bank || '', amount: num(loan?.amount), marginBps: num(loan?.marginBps), ratchetBps: num(loan?.ratchetBps), kpis: rows, nextTest: next, daysToTest: next ? daysBetween(today, next) : null,
    bps: bpsTot, eur: ratchetEur(loan?.amount, bpsTot), maxEur: ratchetEur(loan?.amount, num(loan?.ratchetBps) ?? 0), atRisk: rows.some(r => r.atRisk), shortHistory: rows.filter(r => !r.enoughHistory) };
}

/* ---------------- ETS2 ---------------- */
/** Esposizione all'ETS2 dal 2028 con e senza le misure sui combustibili (approvate e in corso; con le idee): {start, years, prices, measures, …}. */
export function ets2Plan(d, P) {
  const model = planModel(d, P);
  const S = model?.S || pianoSettings(d);
  const r = packItem(d, 'ets2') || {};
  const prices = S.ets2Prices.length ? S.ets2Prices : A(r.prices);
  const ex = safe(() => ets2Exposure(d, P, prices), null);
  if (!ex) return null;
  const fuelMs = A(model?.live).filter(m => m.scope === 's12' && ['S1'].includes(m.scopeHit) && m.status !== 'completata' && ['fuel', 'switch', 'fleet'].includes(m.est?.kind || m.lib?.effect?.kind));
  const cutOf = (y, ideas) => sum(fuelMs.filter(m => m.startYear != null && m.startYear < y && (ideas ? m.status !== 'scartata' : ACTIVE.has(m.status))), m => Math.min(m.values.tco2Year || 0, ex.annualTCO2));
  const start = num(ex.start) ?? 2028;
  const years = [start, start + 1, start + 2];
  const rows = years.map(y => {
    const cut = Math.min(ex.annualTCO2, cutOf(y, false)), cutI = Math.min(ex.annualTCO2, cutOf(y, true));
    return { year: y, tCO2: ex.annualTCO2, cut, cutIdeas: cutI, scenarios: ex.rows.map(x => ({ price: x.price, base: ex.annualTCO2 * x.price, plan: (ex.annualTCO2 - cut) * x.price, ideas: (ex.annualTCO2 - cutI) * x.price })),
      internal: { price: S.carbonPrice, base: ex.annualTCO2 * S.carbonPrice, plan: (ex.annualTCO2 - cut) * S.carbonPrice } };
  });
  return { ...ex, start, years: rows, prices: ex.rows.map(x => x.price), rule: r, measures: fuelMs };
}

/** Piano di transizione (VS C3) nella lingua scelta: sezioni, completezza, testo per il datapoint e Markdown (planMarkdown). */
export function transitionPlan(d, P, lang = 'it') {
  const model = planModel(d, P);
  if (!model) return null;
  return planText(d, model, lang, { ets: safe(() => ets2Plan(d, P), null), roles: A(d?.esgRoles) });
}

/* ---------------- riepilogo, segnali, sezione ---------------- */
/** Riepilogo per la pagina e il cruscotto: modello del piano più ETS2 e piano di transizione. */
export function pianoSummary(d, P) {
  const model = P ? safe(() => planModel(d, P), null) : null;
  if (!model) return null;
  return { model, hasPlan: model.targets.length > 0 || model.measures.length > 0, primary: model.primary, coverage: model.coverage, macc: model.macc, sbti: model.sbti, flag: model.flag, sll: model.sll };
}

const dueOf = m => {
  if (!ACTIVE.has(m.status)) return null;
  const due = isIso(m.dueDate) ? m.dueDate.slice(0, 10) : m.startYear != null ? `${m.startYear}-12-31` : null;
  return due;
};
/** Segnali di «Oggi» del pacchetto (chiavi «piano:…»). */
export function pianoSignals(d, ctx) {
  const out = [];
  if (!d || !PIANO_TAB) return out;
  const today = todayOf(d, ctx);
  const P = safe(() => currentPeriod(d), null);
  const model = P ? safe(() => planModel(d, P), null) : null;
  const price = carbonPrice(d);
  if (model) {
    for (const t of model.targets) {
      const g = t.progress;
      if (t.status !== 'approvato' || !g || g.onTrack !== false) continue;
      const u = t.M?.unit || '', dec = t.M?.dec ?? 1;
      out.push({ key: `piano:off-track:${t.id}:${P.key}`, area: 'esg', roles: ['direzione'], severity: 'attenzione', title: `Obiettivo in ritardo: ${t.label}`,
        why: `${P.label}: ${nf(g.actual, dec)} ${u} contro ${nf(g.path, dec)} ${u} della traiettoria verso ${nf(t.targetValue, dec)} ${u} nel ${t.targetYear} (scarto ${nf(Math.abs(g.gap) * 100, 1)}%).`,
        action: 'Aprire la tabella di marcia: anticipare le misure approvate o approvarne di nuove dalla curva dei costi, poi aggiornare il piano.',
        impact: 3000 + Math.round(Math.abs(g.gap) * 1e4), link: LINK('obiettivi') });
    }
    for (const m of model.live) {
      const due = dueOf(m);
      if (!due || due >= today) continue;
      out.push({ key: `piano:measure-late:${m.id}`, area: 'esg', roles: ['direzione', 'produzione'], severity: 'attenzione', title: `Misura in ritardo: ${m.title}`,
        why: `Prevista entro il ${dateIt(due)} (${m.status}); ${m.values.tco2Year != null ? `vale ${nf(m.values.tco2Year, 1)} t CO₂e l’anno` : 'riduzione non stimata'}${m.owner ? `, responsabile ${m.owner}` : ''}.`,
        action: 'Aggiornare lo stato o la data prevista della misura; se è completata, registrarne la data e le evidenze.',
        impact: Math.round((m.values.tco2Year || 0) * price) + 800, link: LINK('misure') });
    }
    for (const s of model.sll) {
      if (s.nextTest && s.daysToTest != null && s.daysToTest >= 0 && s.daysToTest <= 30) out.push({ key: `piano:sll-test:${s.id}:${s.nextTest}`, area: 'esg', roles: ['direzione'], severity: 'attenzione',
        title: `Verifica dei KPI del finanziamento ${s.bank || s.id} ${s.daysToTest === 0 ? 'oggi' : `tra ${s.daysToTest} giorni`}`,
        why: `Data di verifica ${dateIt(s.nextTest)}: ${listJoin(s.kpis.map(k => k.label.toLowerCase()))}; scatto del margine fino a ${nf(s.ratchetBps, 1)} punti base (${nf(s.maxEur)} € l’anno).`,
        action: 'Preparare il pacchetto per il verificatore: valori dei KPI con la provenienza, evidenze e confronto con gli obiettivi dell’anno.', impact: 4000 + Math.round(s.maxEur || 0), link: LINK('finanziamenti') });
      if (s.atRisk) {
        const k = s.kpis.find(x => x.atRisk);
        out.push({ key: `piano:sll-risk:${s.id}`, area: 'esg', roles: ['direzione'], severity: 'attenzione', title: `Finanziamento ${s.bank || s.id}: KPI a rischio per la verifica`,
          why: `${k.label}: ${k.current == null ? 'valore non disponibile' : `${nf(k.current, k.M.dec)} ${k.unit}`} contro l’obiettivo ${nf((k.outcome.met === false ? k.spt : k.nextSpt)?.value, k.M.dec)} ${k.unit} del ${(k.outcome.met === false ? k.spt : k.nextSpt)?.year}; lo scatto vale ${nf(Math.abs(ratchetEur(s.amount, (s.ratchetBps || 0) / Math.max(1, s.kpis.length)) || 0))} € l’anno.`,
          action: 'Verificare le misure che agiscono sul KPI e, se serve, parlarne con la banca prima della data di verifica.', impact: 3500 + Math.round(s.maxEur || 0), link: LINK('finanziamenti') });
      }
    }
    // scadenze degli incentivi vicine (90 giorni) con misure ancora da ordinare
    const cal = safe(() => incentiveDates(d, model, today), EMPTY);
    for (const c of cal) {
      const days = daysBetween(today, c.date);
      if (days < 0 || days > 90 || !c.open.length) continue;
      out.push({ key: `piano:incentive-deadline:${c.date}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `${c.title}: ${days === 0 ? 'oggi' : `tra ${days} giorni`}`,
        why: `Misure con iperammortamento ancora da ordinare: ${listJoin(c.open.map(m => m.title))} (investimento ${nf(sum(c.open, m => m.values.capex || 0))} €). Stima indicativa, non consulenza fiscale.`,
        action: 'Verificare con il consulente fiscale e l’EGE la convenienza e i tempi; per consegne entro giugno 2027 servono ordine accettato e acconto del 20% entro il 31/12/2026.',
        impact: 1500 + Math.round(sum(c.open, m => m.incentiveCalc?.value || 0) / 10), link: LINK('incentivi') });
    }
  }
  if (!A(d.esgTargets).length && d?.survey?.['em-target'] === 'si') out.push({ key: 'piano:no-target', area: 'esg', roles: ['direzione'], severity: 'info', title: 'Obiettivi di riduzione dichiarati nel questionario ma non registrati',
    why: `Il questionario ESG dice che esistono obiettivi${has(d.survey['em-target-desc']) ? ` («${String(d.survey['em-target-desc']).slice(0, 140)}»)` : ''}, ma la scheda Obiettivi e piano non ne ha: il VS C3 resta vuoto.`,
    action: 'Aprire Obiettivi e piano › Obiettivi e usare «Importa dal questionario», poi indicare anno e valore base.', impact: 900, link: LINK('obiettivi') });
  return out;
}

/** Date dell'iperammortamento con le misure ancora aperte (non ordinate): [{key, date, title, kind, open}] */
function incentiveDates(d, model, today) {
  const ip = model?.inc?.iper;
  if (!ip || !ip.eligible.length) return EMPTY;
  const r = ip.rule || {}, dt = r.dates || {};
  const ms = model.live.filter(m => ip.eligible.includes(m.id));
  const open = ms.filter(m => m.status === 'idea' || m.status === 'approvata');
  const notDone = ms.filter(m => m.status !== 'completata');
  const out = [];
  if (isIso(dt.orderBy)) out.push({ key: `piano:iper-acconto:${dt.orderBy}`, date: dt.orderBy, kind: 'scadenza', title: `Iperammortamento: ordine accettato e acconto del ${nf((num(dt.depositPct) ?? 0.2) * 100)}% per consegne entro il ${dateIt(dt.deliverBy)}`, open });
  if (isIso(dt.deliverBy)) out.push({ key: `piano:iper-consegna:${dt.deliverBy}`, date: dt.deliverBy, kind: 'scadenza', title: 'Iperammortamento: consegna dei beni ordinati entro il 2026 con acconto', open: notDone.filter(m => m.startYear <= +dt.deliverBy.slice(0, 4)) });
  if (isIso(dt.investBy)) out.push({ key: `piano:iper-fine:${dt.investBy}`, date: dt.investBy, kind: 'traguardo', title: 'Iperammortamento: ultimo termine per gli investimenti', open: notDone });
  return out.filter(x => x.date >= addDays(today, -1) && x.open.length);
}

/** Scadenze per il calendario degli adempimenti: verifiche dei finanziamenti, misure, incentivi (chiavi con «iper»), anni obiettivo, riesame. */
export function pianoCalendarItems(d, today) {
  if (!d || !PIANO_TAB) return [];
  const t0 = isIso(today) ? today.slice(0, 10) : esgToday(d);
  const P = safe(() => currentPeriod(d), null);
  const model = P ? safe(() => planModel(d, P), null) : null;
  if (!model) return [];
  const out = [];
  for (const s of model.sll) for (const td of A(s.loan.testDates).filter(isIso)) {
    if (td.slice(0, 10) < t0) continue;
    out.push({ key: `piano:sll-test:${s.id}:${td.slice(0, 10)}`, date: td.slice(0, 10), title: `Verifica dei KPI del finanziamento legato alla sostenibilità (${s.bank || s.id})`, area: 'esg', pkg: 'piano', kind: 'controllo',
      law: 'Contratto di finanziamento; LMA Sustainability-Linked Loan Principles 2025', owner: 'Direzione', link: LINK('finanziamenti') });
  }
  for (const m of model.live) {
    const due = dueOf(m);
    if (!due || due < addDays(t0, -365)) continue;
    out.push({ key: `piano:misura:${m.id}`, date: due, title: `Misura del piano: ${m.title}`, area: 'esg', pkg: 'piano', kind: 'traguardo', owner: m.owner || 'Direzione', link: LINK('misure') });
  }
  const r = model.inc.iper.rule || {};
  for (const c of incentiveDates(d, model, t0)) out.push({ key: c.key, date: c.date, title: c.title, area: 'esg', pkg: 'piano', kind: c.kind, law: r.law || 'L. 199/2025', source: String(r.source || '').split(' · ')[0] || undefined, validAsOf: isIso(r.validAsOf) ? r.validAsOf : undefined, owner: 'Direzione', link: LINK('incentivi') });
  for (const t of model.targets) {
    if (t.status !== 'approvato' || t.targetYear == null || `${t.targetYear}-12-31` < t0) continue;
    out.push({ key: `piano:obiettivo:${t.id}`, date: `${t.targetYear}-12-31`, title: `Anno obiettivo: ${t.label} ${nf(t.targetValue, t.M?.dec ?? 1)} ${t.M?.unit || ''}`.trim(), area: 'esg', pkg: 'piano', kind: 'traguardo', owner: 'Direzione', link: LINK('obiettivi') });
  }
  const S = model.S;
  if (isIso(S.planApprovedAt)) {
    let rv = addMonths(S.planApprovedAt.slice(0, 10), 12);
    for (let i = 0; i < 10 && rv < t0; i++) rv = addMonths(rv, 12);
    out.push({ key: `piano:riesame:${rv}`, date: rv, title: 'Riesame annuale del piano di transizione', area: 'esg', pkg: 'piano', kind: 'controllo', owner: S.planApprover || 'Direzione', link: LINK('piano') });
  }
  for (const it of out) for (const k of Object.keys(it)) if (it[k] === undefined) delete it[k];
  return out;
}

/** Sezione del report CdA / Rapporto ESG (87): avanzamento degli obiettivi, prime 5 misure della curva, investimenti a 3 anni, finanziamenti, ETS2. */
export function pianoReportSection(d, ctx, P, C) {
  if (!d || !PIANO_TAB || !P?.from || !P?.to) return null;
  const model = safe(() => planModel(d, P), null);
  if (!model || (!model.targets.length && !model.measures.length)) return null;
  const t = model.primary, g = t?.progress, cov = model.coverage;
  const y0 = periodYear(P) ?? +todayOf(d, ctx).slice(0, 4);
  const cap3 = sum(model.capexByYear.filter(x => x.year >= y0 && x.year < y0 + 3), x => x.active + x.idea);
  const capAppr = sum(model.capexByYear.filter(x => x.year >= y0 && x.year < y0 + 3), x => x.active);
  const ets = safe(() => ets2Plan(d, P), null);
  const mid = ets?.years?.[0]?.scenarios?.[Math.floor((ets.years[0].scenarios.length - 1) / 2)] || null;
  const kpis = [];
  if (t && g) kpis.push({ label: t.label, value: g.actual, unit: t.M?.unit, decimals: t.M?.dec ?? 1, note: g.path != null ? `traiettoria ${nf(g.path, t.M?.dec ?? 1)}; obiettivo ${nf(t.targetValue, t.M?.dec ?? 1)} nel ${t.targetYear}` : undefined });
  if (cov?.ratio != null) kpis.push({ label: 'Copertura del piano', value: cov.ratio, unit: '%', decimals: 0, note: 'riduzione delle misure approvate ÷ riduzione necessaria' });
  kpis.push({ label: `Investimenti ${y0}-${y0 + 2}`, value: cap3, unit: '€', decimals: 0, note: `di cui approvati ${nf(capAppr)} €` });
  kpis.push({ label: 'Prezzo interno del carbonio', value: model.S.carbonPrice, unit: '€/t CO₂e', decimals: 0 });
  if (mid) kpis.push({ label: `ETS2 ${ets.start} (${nf(mid.price)} €/t)`, value: mid.base, unit: '€', decimals: 0, note: `con il piano ${nf(mid.plan)} €` });
  for (const s of model.sll) kpis.push({ label: `Finanziamento ${s.bank || s.id}`, value: s.eur, unit: '€/anno', decimals: 0, note: s.kpis.map(k => `${k.label}: ${k.outcome.met == null ? 'n.d.' : k.outcome.met ? 'raggiunto' : 'mancato'}`).join('; ') });
  const rows = model.macc.bars.slice(0, 5).map(b => { const m = model.measures.find(x => x.id === b.id); return { misura: b.label, stato: b.status, t: b.tco2, mac: b.mac, payback: m?.use?.payback ?? null, npv: m?.use?.npv ?? null }; });
  const narrative = [];
  for (const x of model.targets.filter(x => x.status === 'approvato')) {
    const p = x.progress;
    const f = v => fmtNum(v, x.M?.unit || '', 'it', x.M?.dec ?? 1);
    narrative.push(`${x.label}: ${p.actual == null ? 'valore attuale non disponibile' : `${f(p.actual)} (${P.label})`}; obiettivo ${f(x.targetValue)} nel ${x.targetYear}, ${T('piano.state.' + p.state)}.`);
  }
  if (cov?.ratio != null) narrative.push(T('piano.plan.coverage', { pct: fmtNum(cov.ratio * 100, '%', 'it', 0) }));
  if (model.sbti) narrative.push(`Categoria SBTi stimata: ${model.sbti.category} (${model.sbti.reason}); da verificare sui criteri V2.`);
  if (model.flag?.required) narrative.push(T('piano.plan.flag', { pct: fmtNum(model.flag.share * 100, '%', 'it', 0), date: dateIt(model.flag.deadline) }));
  narrative.push(T('piano.plan.sbtiNote'));
  narrative.push(T('piano.plan.incentiveNote'));
  narrative.push(T('disclaimer'));
  return {
    id: 'esg-piano', title: 'Obiettivi e piano', order: 87, kpis,
    table: { cols: [{ key: 'misura', label: 'Misura', fmt: 'text' }, { key: 'stato', label: 'Stato', fmt: 'text' }, { key: 't', label: 't CO₂e/anno', align: 'r', fmt: 'num' }, { key: 'mac', label: '€/t CO₂e', align: 'r', fmt: 'num' },
      { key: 'payback', label: 'Ritorno (anni)', align: 'r', fmt: 'num2' }, { key: 'npv', label: 'VAN €', align: 'r', fmt: 'eur' }], rows },
    narrative,
  };
}

/* ---------------- indicatori del catalogo KPI ---------------- */
export const PIANO_KPIS = [
  { id: 'esg-target-gap', label: 'Scarto dall’obiettivo climatico', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'piano', id: 'obiettivi' }, decimals: 1, hist: false, src: 'energy',
    def: '(Valore attuale − valore della traiettoria lineare nell’anno del periodo) ÷ traiettoria, per l’obiettivo principale (di base il primo approvato su Scope 1 + 2); negativo = in anticipo.',
    compute: (d, ctx, P) => { const t = primaryTarget(d); if (!t || !P?.to) return null; const g = progress(d, t, P); return g.gap != null && Number.isFinite(g.gap) ? g.gap : null; } },
  { id: 'esg-abbattimento-piano', label: 'Copertura del piano di riduzione', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'piano', id: 'roadmap' }, decimals: 0, hist: false, src: 'measures',
    def: 't CO₂e/anno delle misure approvate o in corso che agiscono sull’obiettivo principale ÷ t CO₂e/anno ancora necessarie per raggiungerlo.',
    compute: (d, ctx, P) => { if (!P?.from || !P?.to) return null; const m = planModel(d, P); const r = m?.coverage?.ratio; return r != null && Number.isFinite(r) ? r : null; } },
];

/* ---------------- regole della qualità dei dati (R46-R48) ---------------- */
export const PIANO_RULES = [
  { id: 'R46', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all'], label: 'Obiettivo senza anno o valore base',
    check: d => {
      const ts = A(d?.esgTargets).filter(t => t && has(t.id) && t.status !== 'ritirato').map(t => normTarget(d, t));
      const fails = ts.filter(t => t.baseValue == null || t.baseYear == null || t.targetValue == null || t.targetYear == null)
        .map(t => ({ id: t.id, coll: 'esgTargets', msg: `${t.label}: mancano ${listJoin([t.baseValue == null ? 'valore base' : '', t.baseYear == null ? 'anno base' : '', t.targetValue == null ? 'valore obiettivo' : '', t.targetYear == null ? 'anno obiettivo' : ''].filter(Boolean))}`, link: LINK('obiettivi') }));
      return { base: ts.length, fails };
    } },
  { id: 'R47', area: 'esg', severity: 'info', weight: 1, scope: ['all'], label: 'Misura senza riduzione di CO₂ o senza investimento',
    check: (d, ctx) => {
      const P = safe(() => currentPeriod(d), null);
      const model = P ? safe(() => planModel(d, P), null) : null;
      const ms = A(model?.live).filter(m => m.status !== 'completata');
      const fails = ms.filter(m => (m.values.tco2Year == null && !m.noCo2) || m.values.capex == null)
        .map(m => ({ id: m.id, coll: 'measures', msg: `${m.title}: ${m.values.tco2Year == null && !m.noCo2 ? 't CO₂e/anno' : 'investimento'} non indicato e non stimabile dai dati`, link: LINK('misure') }));
      return { base: ms.length, fails };
    } },
  { id: 'R48', area: 'esg', severity: 'info', weight: 1, scope: ['all'], label: 'KPI di un finanziamento con meno di 3 anni di storico',
    check: d => {
      const P = safe(() => currentPeriod(d), null);
      const rows = [];
      for (const l of A(d?.sllLoans)) { if (!l || !has(l.id)) continue; const s = P ? safe(() => sllStatus(d, l, P), null) : null; for (const k of A(s?.kpis)) rows.push({ l, k }); }
      const fails = rows.filter(x => !x.k.enoughHistory).map(x => ({ id: `${x.l.id}:${x.k.metric}`, coll: 'sllLoans', msg: `${x.l.bank || x.l.id} · ${x.k.label}: ${x.k.years} ${x.k.years === 1 ? 'anno' : 'anni'} di storico (ne servono almeno 3)`, link: LINK('finanziamenti') }));
      return { base: rows.length, fails };
    } },
];

/* ---------------- datapoint del VS (C3) ---------------- */
const GHG_METRICS = new Set(['s12-abs', 's12-t', 's3-t', 'flag-abs']);
/** Datapoint del VS forniti dal pacchetto: C3.targets (tabella), C3.actions, C3.transition-plan. */
export function pianoDatapoints(d, P) {
  if (!d || !P || !isIso(P.from)) return {};
  const model = safe(() => planModel(d, P), null);
  if (!model) return {};
  const out = {};
  const ts = model.targets.filter(t => t.status !== 'ritirato' && GHG_METRICS.has(t.metric));
  if (ts.length) out['C3.targets'] = {
    value: ts.map(t => ({ label: t.label, scope: t.M?.scope || '', unit: t.M?.unit || '', baseYear: t.baseYear, baseValue: t.baseValue, targetYear: t.targetYear, targetValue: t.targetValue,
      reductionPct: reductionPct(t) != null ? round(reductionPct(t) * 100, 1) : null, type: t.type || t.M?.type || '', reference: t.reference || 'interno', status: t.status || 'proposto' })),
    unit: null, quality: 'dichiarato', source: 'piano.esgTargets', method: 'Obiettivi registrati nella scheda Obiettivi e piano (anno e valore base, anno e valore obiettivo, unità, riduzione %)',
    note: ts.some(t => t.status !== 'approvato') ? 'Alcuni obiettivi sono ancora proposti e non approvati' : undefined,
  };
  const acts = model.live.filter(m => m.status !== 'idea' && !m.noCo2).sort((a, b) => (b.values.tco2Year || 0) - (a.values.tco2Year || 0)).slice(0, 8);
  if (acts.length) out['C3.actions'] = { value: acts.map(m => `${m.title} (${m.status}${m.startYear ? `, ${m.startYear}` : ''}${m.values.tco2Year != null ? `, ${nf(m.values.tco2Year, 1)} t CO₂e/anno` : ''})`).join('; '), unit: null,
    quality: acts.some(m => m.from.tco2Year === 'stima') ? 'stimato' : 'dichiarato', source: 'piano.measures', method: 'Misure approvate, in corso o completate con la riduzione annua (inserita o stimata dai dati)' };
  if (ts.length || acts.length) {
    const tp = safe(() => transitionPlan(d, P, 'it'), null);
    if (tp) out['C3.transition-plan'] = { value: tp.c3Text, unit: null, quality: 'dichiarato', source: 'piano.transitionPlan', method: 'Piano di transizione della scheda Obiettivi e piano: obiettivi, azioni, investimenti, governance, verifica' };
  }
  for (const v of Object.values(out)) for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return out;
}

/** Collegamento degli obiettivi agli obiettivi dei KPI del cruscotto: {kpiId: {target, warn}} dalla traiettoria dell'anno in corso. */
export function kpiTargets(d, year) {
  const y = num(year) ?? +esgToday(d).slice(0, 4);
  const out = {};
  for (const t0 of A(d?.esgTargets).filter(t => t && t.status === 'approvato')) {
    const t = normTarget(d, t0), M = t.M;
    if (!M?.kpi) continue;
    const v = pathAt(t, y);
    if (v == null) continue;
    const scale = M.unit === '%' ? 0.01 : 1;
    out[M.kpi] = { target: round(v * scale, 4), warn: round((M.dir === 'up' ? v * 0.95 : v * 1.05) * scale, 4), source: `piano:${t.id}` };
  }
  return out;
}

/** Nota metodologica (italiano e inglese), paragrafi separati da una riga vuota. */
export const PIANO_METHOD = {
  it: [
    'Obiettivi: metrica, anno e valore base, anno e valore obiettivo; traiettoria lineare tra base e obiettivo. Il valore attuale viene dai registri (inventario della scheda Clima, registri di acqua e rifiuti, soia della scheda EUDR) o, per gli anni senza registri, dallo storico dichiarato. Un obiettivo è in linea quando il valore attuale non supera la traiettoria dell’anno di più del 2%. Le traiettorie di riferimento (−4,2% l’anno sul valore base per Scope 1 + 2, −3,03% per il FLAG) sono ispirate ai criteri SBTi e non sono una validazione.',
    'Misure: per ogni misura della libreria FeedOS stima la riduzione dai dati dell’archivio (quota dell’elettricità o del combustibile interessata × risparmio indicativo × fattore di emissione in uso; kWp × producibilità × autoconsumo; leve di formulazione dalla programmazione lineare della scheda Impronta); i valori inseriti (preventivi, diagnosi, misure) sostituiscono la stima. Economia: CRF = r(1+r)^n / ((1+r)^n − 1); costo annuo = investimento netto × CRF + maggior costo annuo − risparmio; costo di abbattimento = costo annuo ÷ t CO₂e l’anno; VAN al prezzo interno del carbonio = −investimento netto + Σ (risparmio − maggior costo + prezzo × t CO₂e) ÷ (1 + r)^t. Il VAN cambia segno quando il prezzo del carbonio supera il costo di abbattimento.',
    'Incentivi (stima indicativa, non consulenza fiscale): iperammortamento per scaglioni dell’investimento complessivo (180%, 100%, 50%; 220%, 140%, 90% con il risparmio energetico certificato del 3% dell’unità locale o del 5% dei processi), valore fiscale = maggiorazione × IRES distribuita sugli anni di ammortamento e scontata; certificati bianchi in tep (MWh elettrici × 0,187, migliaia di Sm³ × 0,82, t di GPL × 1,10) con il prezzo indicato dall’utente; Conto Termico e Nuova Sabatini come schede di ammissibilità.',
    'Finanziamenti legati alla sostenibilità: KPI con almeno 3 anni di storico raccomandati (LMA 2025), obiettivo annuale (SPT), scatto del margine ± punti base × importo ÷ 10.000 ripartito tra i KPI. ETS2: CO₂ fossile dei combustibili per edifici, trasporto e piccola industria dal 2028 ai prezzi di scenario, con e senza le misure sui combustibili. Il piano di transizione riporta obiettivi, azioni, investimenti, governance e se è verificato da terzi; senza verifica i controlli delle dichiarazioni bloccano gli impegni futuri.',
  ].join('\n\n'),
  en: [
    'Targets: metric, base year and value, target year and value; linear pathway between base and target. The current value comes from the registers (GHG inventory of the Climate tab, water and waste registers, soy from the EUDR tab) or, for years without registers, from declared history. A target is on track when the current value does not exceed the pathway for the year by more than 2%. Reference pathways (−4.2% per year on the base value for Scope 1 + 2, −3.03% for FLAG) are inspired by SBTi criteria and are not a validation.',
    'Measures: for each measure in the FeedOS library the reduction is estimated from the archive data (share of electricity or fuel affected × indicative saving × emission factor in use; kWp × yield × self-consumption; formulation levers from the linear programming of the Footprint tab); entered values (quotes, audits, measurements) replace the estimate. Economics: CRF = r(1+r)^n / ((1+r)^n − 1); annual cost = net investment × CRF + extra annual cost − savings; abatement cost = annual cost ÷ t CO₂e per year; NPV at the internal carbon price = −net investment + Σ (savings − extra cost + price × t CO₂e) ÷ (1 + r)^t. The NPV changes sign when the carbon price exceeds the abatement cost.',
    'Incentives (indicative estimate, not tax advice): Italian «iperammortamento» by bands of total investment (180%, 100%, 50%; 220%, 140%, 90% with certified energy savings of 3% of the site or 5% of the processes), tax value = uplift × corporate tax rate spread over the depreciation years and discounted; white certificates in toe (electric MWh × 0.187, thousand Sm³ × 0.82, t of LPG × 1.10) at a user-entered price; Conto Termico and Nuova Sabatini as eligibility checklists.',
    'Sustainability-linked loans: KPIs with at least 3 years of history recommended (LMA 2025), annual sustainability performance target, margin ratchet ± basis points × amount ÷ 10,000 split across KPIs. ETS2: fossil CO₂ from fuels for buildings, transport and small industry from 2028 at scenario prices, with and without the fuel measures. The transition plan reports targets, actions, investments, governance and whether it is verified by a third party; without verification the claim checks block future commitments.',
  ].join('\n\n'),
};
