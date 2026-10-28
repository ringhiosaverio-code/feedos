/* FeedOS 18 · Persone e sicurezza (pacchetto WP5 «persone»): calcoli puri.
 * Organico dalle fotografie pseudonime (hrSnapshots), ore lavorate (hoursWorked, con ripiego ETP × 1.720 h segnalato «stimato»),
 * indici di sicurezza (UNI 7249: IF × 10⁶ e IG × 10³; VS B9: registrabili × 200.000 sulle ore), formazione per genere e scadenze,
 * divario retributivo (media, mediana, componenti variabili, quartili) con soppressione dei gruppi sotto 5 persone, obblighi della
 * trasparenza retributiva, rapporto biennale, autovalutazione UNI/PdR 125 (solo aree e pesi) e INAIL OT23.
 * Nessun nome di persona: genere, categoria, contratto e codici pseudonimi. Funzioni pure, nessuna eccezione su archivi vuoti.
 * Non importa i registri (kpis, dataquality, providers, signals, report, esg-registry, derived, store). */
import { sum, median, addDays, addMonths, daysBetween, endOfMonth, monthsIn, monthFraction, round, norm, nf } from '../core/util.js';
import { esgSettings, esgToday, sectorOf, currentPeriod, periodByKey } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { PACK_PERSONE, CATEGORIES, CONTRACTS, TRAINING_TOPICS } from '../data/pack-persone.js';

const EMPTY = Object.freeze([]);
export const A = x => (Array.isArray(x) ? x : EMPTY);
export const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const fin = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = s => typeof s === 'string' && s.length >= 10 && ISO.test(s.slice(0, 10));
const d10 = s => String(s).slice(0, 10);
export const inP = (x, P) => isIso(x) && d10(x) >= P.from && d10(x) <= P.to;
const n0 = v => (fin(v) ? +v : 0);
const div = (a, b) => (fin(a) && fin(b) && +b > 0 ? +a / +b : null);

/* memoria per identità degli argomenti: pagina, cruscotto, segnali e KPI chiedono gli stessi conti più volte */
const CACHE = new Map();
export function cached(name, deps, fn, max = 8) {
  let list = CACHE.get(name);
  if (!list) CACHE.set(name, (list = []));
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/* ---------------- impostazioni e pacchetto ---------------- */
export const PERSONE_DEFAULTS = Object.freeze({ hoursPerFteFallback: 1720, smallCell: 5, gapThresholdPct: 5, expiryDays: 60, signalDays: 30 });
/** Impostazioni: settings.esg18.persone fuse con i valori di base (ore per ETP, soglia dei gruppi piccoli, soglia del divario). */
export function personeSettings(d) {
  const s = esgSettings(d, 'persone', PERSONE_DEFAULTS);
  return {
    ...s,
    hoursPerFteFallback: fin(s.hoursPerFteFallback) && +s.hoursPerFteFallback > 0 ? +s.hoursPerFteFallback : 1720,
    smallCell: fin(s.smallCell) && +s.smallCell >= 2 ? Math.round(+s.smallCell) : 5,
    gapThresholdPct: fin(s.gapThresholdPct) && +s.gapThresholdPct > 0 ? +s.gapThresholdPct : 5,
  };
}
/** Pacchetto di contenuti in uso (integrato o importato più recente). */
export function personePack(d) { return activePack(d, 'persone', PACK_PERSONE) || { ...PACK_PERSONE, origin: 'integrato' }; }
/** Voce del pacchetto per id (null se manca). */
export function packItem(d, id) { return A(personePack(d).items).find(x => x && x.id === id) || null; }
const forSector = (x, sector) => !A(x?.sectors).length || x.sectors.includes(sector);
/** Riferimento di settore per l'indice di frequenza (null se il pacchetto non ne ha uno per il settore dell'archivio). */
export function sectorBand(d) {
  const s = sectorOf(d);
  return A(personePack(d).items).find(x => x && x.kind === 'riferimento' && A(x.sectors).includes(s)) || null;
}
/** Temi della formazione per il settore dell'archivio. */
export function topicsFor(d) { const s = sectorOf(d); return TRAINING_TOPICS.filter(t => forSector(t, s)); }
export const topicLabel = id => TRAINING_TOPICS.find(t => t.id === id)?.label || id || '—';
/** Periodicità di base di un tema obbligatorio (mesi) dal pacchetto, con la norma e lo stato. */
export function topicRule(d, topic) {
  const s = sectorOf(d);
  return A(personePack(d).items).find(x => x && x.kind === 'formazione' && x.topic === topic && forSector(x, s)) || null;
}

/* ---------------- organico ---------------- */
const snapDate = s => (isIso(s?.date) ? d10(s.date) : null);
/** Fotografie dell'organico valide, dalla più vecchia. */
export function snapshots(d) {
  return cached('snaps', [d?.hrSnapshots], () => A(d?.hrSnapshots).filter(s => s && snapDate(s) && Array.isArray(s.rows)).sort((a, b) => (snapDate(a) < snapDate(b) ? -1 : 1)), 4);
}
/** Ultima fotografia con data ≤ date (null se non c'è). */
export function snapshotAt(d, date, minDate = null) {
  const xs = snapshots(d).filter(s => snapDate(s) <= date && (!minDate || snapDate(s) >= minDate));
  return xs.length ? xs[xs.length - 1] : null;
}
/** Fotografia più vicina a una data (per stimare le ore dei mesi senza registrazione). */
function nearestSnapshot(d, date) {
  let best = null, bd = Infinity;
  for (const s of snapshots(d)) { const x = Math.abs(daysBetween(date, snapDate(s))); if (x < bd) { bd = x; best = s; } }
  return best;
}
/** Fotografia del periodo: l'ultima con data dentro il periodo P. */
export function snapshotFor(d, P) { return P && isIso(P.from) ? snapshotAt(d, P.to, P.from) : null; }

/** Totali di una fotografia: persone ed ETP per genere, contratto, categoria; dirigenza (dirigenti e quadri); tempo parziale. */
export function snapshotStats(s) {
  const rows = A(s?.rows).filter(r => r && fin(r.headcount) && +r.headcount > 0);
  const g = () => ({ F: 0, M: 0, nd: 0, total: 0, fte: 0 });
  const byGender = { F: 0, M: 0, nd: 0 }, byContract = Object.fromEntries(CONTRACTS.map(c => [c, 0])), byCategory = Object.fromEntries(CATEGORIES.map(c => [c, g()]));
  let headcount = 0, fte = 0, partTime = 0;
  const contractGender = Object.fromEntries(CONTRACTS.map(c => [c, { F: 0, M: 0, nd: 0 }]));
  for (const r of rows) {
    const n = +r.headcount, gd = ['F', 'M'].includes(r.gender) ? r.gender : 'nd';
    const e = fin(r.fte) ? +r.fte : r.fullTime === false ? n * 0.5 : n;
    headcount += n; fte += e; byGender[gd] += n;
    const c = CONTRACTS.includes(r.contract) ? r.contract : 'indeterminato';
    byContract[c] += n; contractGender[c][gd] += n;
    const cat = CATEGORIES.includes(r.category) ? r.category : 'operai';
    byCategory[cat][gd] += n; byCategory[cat].total += n; byCategory[cat].fte += e;
    if (r.fullTime === false) partTime += n;
  }
  const mF = byCategory.dirigenti.F + byCategory.quadri.F, mM = byCategory.dirigenti.M + byCategory.quadri.M, mT = byCategory.dirigenti.total + byCategory.quadri.total;
  return {
    headcount, fte: round(fte, 2), byGender, byContract, contractGender, byCategory, partTime,
    permanent: byContract.indeterminato + byContract.apprendistato, temporary: byContract.determinato,
    womenShare: div(byGender.F, headcount),
    mgmt: { F: mF, M: mM, total: mT, womenShare: div(mF, mT), ratio: mM > 0 ? mF / mM : null },
  };
}

/** Periodo da una chiave o da un oggetto periodo. */
export function periodOf(d, key) {
  if (isObj(key) && isIso(key.from) && isIso(key.to)) return key;
  return periodByKey(d, key) || currentPeriod(d);
}

/**
 * Organico dell'esercizio (helper tra pacchetti, contratto §4): fotografia alla fine del periodo, media tra inizio e fine per il
 * turnover, contratti, genere, categoria, dirigenza, somministrati e autonomi, CCNL e salario minimo. null senza fotografia nel periodo.
 * → { periodKey, date, snapshotId, headcount, fte, byGender, byContract, byCategory, partTime, permanent, temporary, womenShare, mgmt,
 *     agency, selfEmployed, hires, leavers, avgHeadcount, avgSrc, turnover, ccnl, ccnlCoveragePct, minWageOk, country, countries, quality, source }
 */
export function workforce(d, periodKey) {
  if (!isObj(d)) return null;
  const P = periodOf(d, periodKey);
  if (!P) return null;
  return cached('wf|' + P.from + '|' + P.to, [d.hrSnapshots], () => {
    const s = snapshotFor(d, P);
    if (!s) return null;
    const st = snapshotStats(s);
    const start = snapshotAt(d, addDays(P.from, -1), addDays(P.from, -92));
    const st0 = start ? snapshotStats(start) : null;
    const avgHeadcount = st0 ? (st0.headcount + st.headcount) / 2 : st.headcount;
    const hires = { F: n0(s.hiresF), M: n0(s.hiresM), total: n0(s.hiresF) + n0(s.hiresM) + n0(s.hiresNd) };
    const leavers = { F: n0(s.leaversF), M: n0(s.leaversM), total: n0(s.leaversF) + n0(s.leaversM) + n0(s.leaversNd) };
    const country = typeof s.country === 'string' && s.country.trim() ? s.country.trim().toUpperCase() : 'IT';
    return {
      periodKey: P.key || null, date: snapDate(s), snapshotId: s.id, ...st,
      agency: fin(s.agency) ? +s.agency : null, selfEmployed: fin(s.selfEmployed) ? +s.selfEmployed : null,
      hires, leavers, avgHeadcount, avgSrc: st0 ? `media tra ${st0.headcount} al ${snapDate(start)} e ${st.headcount} al ${snapDate(s)}` : `organico al ${snapDate(s)} (manca la fotografia di inizio periodo)`,
      turnover: avgHeadcount > 0 && (fin(s.leaversF) || fin(s.leaversM) || fin(s.leaversNd)) ? leavers.total / avgHeadcount : null,
      ccnl: typeof s.ccnl === 'string' ? s.ccnl : '', ccnlCoveragePct: fin(s.ccnlCoveragePct) ? +s.ccnlCoveragePct : null,
      minWageOk: typeof s.minWageOk === 'boolean' ? s.minWageOk : null,
      parental: { F: n0(s.parentalF), M: n0(s.parentalM) },
      country, countries: { [country]: st.headcount }, start: st0 ? { date: snapDate(start), headcount: st0.headcount } : null,
      quality: 'misurato', source: `fotografia dell’organico al ${snapDate(s)}`,
    };
  }, 12);
}

/* ---------------- ore lavorate ---------------- */
/**
 * Ore lavorate dai dipendenti nel periodo P: registro mensile (hoursWorked), mesi tagliati in proporzione; i mesi senza registrazione
 * si stimano con ETP della fotografia più vicina × ore annue per ETP ÷ 12 (qualità «stimato», mesi elencati).
 * → { hours, months: [{month, hours, src}], measured, estimated: [mese], missing: [mese], quality, perFte, agencyHours, overtime }
 */
export function hoursFor(d, P) {
  if (!isObj(d) || !P || !isIso(P.from)) return { hours: null, months: [], measured: 0, estimated: [], missing: [], quality: 'mancante', perFte: 1720, agencyHours: 0, overtime: 0 };
  const st = personeSettings(d);
  return cached(`h|${P.from}|${P.to}|${st.hoursPerFteFallback}`, [d.hoursWorked, d.hrSnapshots], () => {
    const by = new Map();
    for (const r of A(d.hoursWorked)) { const m = typeof r?.month === 'string' ? r.month.slice(0, 7) : typeof r?.id === 'string' && /^\d{4}-\d{2}$/.test(r.id) ? r.id : null; if (m && fin(r.hours)) by.set(m, r); }
    const months = [], estimated = [], missing = [];
    let hours = 0, measured = 0, agencyHours = 0, overtime = 0, any = false;
    for (const m of monthsIn(P.from, P.to)) {
      const f = monthFraction(m, P);
      if (f <= 0) continue;
      const r = by.get(m);
      if (r) { const h = +r.hours * f; hours += h; measured++; any = true; agencyHours += n0(r.agencyHours) * f; overtime += n0(r.overtime) * f; months.push({ month: m, hours: h, src: 'misurato', frac: f }); continue; }
      const s = nearestSnapshot(d, endOfMonth(m));
      const fte = s ? snapshotStats(s).fte : null;
      if (fte) { const h = fte * st.hoursPerFteFallback / 12 * f; hours += h; any = true; estimated.push(m); months.push({ month: m, hours: h, src: 'stimato', frac: f }); }
      else { missing.push(m); months.push({ month: m, hours: null, src: 'mancante', frac: f }); }
    }
    const quality = !any ? 'mancante' : estimated.length ? 'stimato' : 'misurato';
    return { hours: any ? hours : null, months, measured, estimated, missing, quality, perFte: st.hoursPerFteFallback, agencyHours, overtime };
  }, 24);
}

/* ---------------- infortuni e indici ---------------- */
/** Infortunio registrabile: indicato nel registro; se non indicato, conta quando ci sono giorni di assenza o un decesso. */
export const isRecordable = i => i?.kind === 'infortunio' && (i.recordable === true || (i.recordable == null && (n0(i.lostDays) >= 1 || i.fatal === true)));
/** Infortunio con assenza (UNI 7249): almeno un giorno oltre quello dell'evento, o decesso. */
export const isLti = i => i?.kind === 'infortunio' && (n0(i.lostDays) >= 1 || i.fatal === true);
const causeOf = i => (typeof i?.cause === 'string' && i.cause.trim() ? i.cause.trim() : 'altro');

/**
 * Indici di sicurezza del periodo (helper tra pacchetti, contratto §4). null se non ci sono né eventi né ore.
 * IF = infortuni con assenza × 10⁶ ÷ ore; IG = (giornate perse + convenzionali) × 10³ ÷ ore (UNI 7249);
 * B9 = infortuni registrabili × 200.000 ÷ ore (VS). Gli infortuni in itinere restano fuori dagli indici (contati a parte).
 */
export function safetyRates(d, P) {
  if (!isObj(d) || !P || !isIso(P.from)) return null;
  return cached(`sr|${P.from}|${P.to}`, [d.injuries, d.hoursWorked, d.hrSnapshots, d.settings], () => {
    const H = hoursFor(d, P);
    const ev = A(d.injuries).filter(i => i && inP(i.date, P));
    if (!ev.length && H.hours == null && !A(d.injuries).length) return null;
    const fatalDays = fin(packItem(d, 'idx-fatal-days')?.value) ? +packItem(d, 'idx-fatal-days').value : 7500;
    const work = ev.filter(i => i.kind === 'infortunio');
    const lti = work.filter(isLti), rec = work.filter(isRecordable);
    const nearMiss = ev.filter(i => i.kind === 'quasi-infortunio').length;
    const diseases = ev.filter(i => i.kind === 'malattia-professionale');
    const inItinere = ev.filter(i => i.kind === 'in-itinere');
    const fatalities = work.filter(i => i.fatal === true).length + diseases.filter(i => i.fatal === true).length;
    const lostDays = sum(lti, i => n0(i.lostDays));
    const convDays = sum(lti, i => n0(i.convDays) + (i.fatal === true ? fatalDays : 0));
    const h = H.hours;
    const rate = (n, k) => (h != null && h > 0 ? n * k / h : null);
    const group = key => {
      const m = new Map();
      for (const i of ev.filter(x => x.kind !== 'in-itinere')) {
        const k = key(i);
        const x = m.get(k) || { key: k, events: 0, injuries: 0, nearMiss: 0, lostDays: 0 };
        x.events++; if (i.kind === 'infortunio') x.injuries++; if (i.kind === 'quasi-infortunio') x.nearMiss++; if (isLti(i)) x.lostDays += n0(i.lostDays);
        m.set(k, x);
      }
      return [...m.values()].sort((a, b) => b.events - a.events || b.injuries - a.injuries || a.key.localeCompare(b.key, 'it'));
    };
    const lineName = id => A(d.lines).find(l => l.id === id)?.name;
    return {
      hours: h, hoursQuality: H.quality, hoursMeasured: H.measured, hoursEstimated: H.estimated, hoursMissing: H.missing, perFte: H.perFte,
      events: ev.length, injuries: work.length, lti: lti.length, recordable: rec.length, fatalities, nearMiss, diseases: diseases.length, inItinere: inItinere.length,
      lostDays, convDays, ifr: rate(lti.length, 1e6), igr: rate(lostDays + convDays, 1e3), b9: rate(rec.length, 2e5),
      nearMissRatio: rec.length ? nearMiss / rec.length : null,
      byCause: group(causeOf), byArea: group(i => lineName(i.lineId) || (typeof i.area === 'string' && i.area.trim() ? i.area.trim() : 'non indicato')),
      unknownRecordable: work.filter(i => i.recordable == null || !fin(i.lostDays)).length,
      formulas: {
        ifr: `${lti.length} infortuni con assenza × 1.000.000 ÷ ${h == null ? 'ore n.d.' : nf(h, 0) + ' h'}`,
        igr: `(${lostDays} giornate perse${convDays ? ` + ${convDays} convenzionali` : ''}) × 1.000 ÷ ${h == null ? 'ore n.d.' : nf(h, 0) + ' h'}`,
        b9: `${rec.length} infortuni registrabili × 200.000 ÷ ${h == null ? 'ore n.d.' : nf(h, 0) + ' h'}`,
      },
      quality: h == null ? 'mancante' : H.quality === 'stimato' ? 'stimato' : 'calcolato',
    };
  }, 32);
}

/** Valori mensili per i grafici: ore, eventi e indice di frequenza sui 12 mesi che finiscono in quel mese. */
export function monthlySafety(d, months) {
  return A(months).map(m => {
    const P = { from: m + '-01', to: endOfMonth(m) };
    const H = hoursFor(d, P);
    const ev = A(d?.injuries).filter(i => i && inP(i.date, P));
    const R12 = { from: addMonths(m, -11) + '-01', to: endOfMonth(m) };
    const r = safetyRates(d, R12);
    return { month: m, hours: H.hours, src: H.quality, injuries: ev.filter(i => i.kind === 'infortunio').length, lti: ev.filter(isLti).length, nearMiss: ev.filter(i => i.kind === 'quasi-infortunio').length, if12: r?.ifr ?? null };
  });
}

/** Azioni correttive: aperte, in ritardo (scadenza passata e non chiuse), chiuse. */
export function actionsState(d, today) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  const rows = A(d?.safetyActions).filter(a => a && a.id);
  const open = rows.filter(a => a.status !== 'chiusa');
  const late = open.filter(a => isIso(a.due) && d10(a.due) < t);
  return { rows, open, late, closed: rows.length - open.length };
}

/* ---------------- formazione ---------------- */
const people = t => n0(t?.partF) + n0(t?.partM) + n0(t?.partNd);
/** Scadenza di una sessione: data indicata, altrimenti data + validità del corso, altrimenti periodicità di base del tema. */
export function sessionDue(d, t) {
  if (isIso(t?.nextDue)) return d10(t.nextDue);
  if (!isIso(t?.date)) return null;
  const m = fin(t.validMonths) && +t.validMonths > 0 ? Math.round(+t.validMonths) : t.mandatory ? topicRule(d, t.topic)?.months : null;
  return m ? addMonths(d10(t.date), m) : null;
}

/**
 * Formazione del periodo: ore-persona totali e per genere, ore medie per dipendente (VS B10) con soppressione dei gruppi < smallCell,
 * ore per tema, quota obbligatoria. wf: organico del periodo (per i denominatori).
 */
export function trainingStats(d, P, wf = null) {
  if (!isObj(d) || !P || !isIso(P.from)) return null;
  const st = personeSettings(d);
  const W = wf === null ? workforce(d, P) : wf;
  const rows = A(d.trainings).filter(t => t && inP(t.date, P));
  if (!rows.length && !A(d.trainings).length) return null;
  const total = sum(rows, t => n0(t.hours) * people(t));
  const hF = sum(rows, t => n0(t.hours) * n0(t.partF)), hM = sum(rows, t => n0(t.hours) * n0(t.partM));
  const mand = sum(rows.filter(t => t.mandatory), t => n0(t.hours) * people(t));
  const byTopic = new Map();
  for (const t of rows) byTopic.set(t.topic || 'altro', (byTopic.get(t.topic || 'altro') || 0) + n0(t.hours) * people(t));
  const nF = W?.byGender?.F ?? null, nM = W?.byGender?.M ?? null;
  const per = (h, n) => (n == null || n <= 0 ? { value: null, note: 'organico non disponibile' } : n < st.smallCell ? { value: null, note: `gruppo < ${st.smallCell}`, suppressed: true } : { value: h / n });
  return {
    sessions: rows.length, total, hoursF: hF, hoursM: hM, participants: sum(rows, people), mandatoryShare: total ? mand / total : null,
    perEmployee: W?.headcount ? total / W.headcount : null, perF: per(hF, nF), perM: per(hM, nM), nF, nM,
    byTopic: [...byTopic.entries()].map(([topic, hours]) => ({ topic, label: topicLabel(topic), hours })).sort((a, b) => b.hours - a.hours),
  };
}

/**
 * Scadenze della formazione obbligatoria: per ogni serie di corsi (campo series, altrimenti il tema) l'ultima sessione e la sua scadenza.
 * → [{id, key, topic, label, course, date, due, days, status: 'scaduta'|'in scadenza'|'valida'|'senza scadenza', participants, law, ruleStatus}]
 */
export function trainingExpiries(d, today, days = null) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  const win = fin(days) ? +days : personeSettings(d).expiryDays;
  return cached(`exp|${t}|${win}`, [d?.trainings, d?.settings], () => {
    const last = new Map();
    for (const s of A(d?.trainings)) {
      if (!s || !s.mandatory || !isIso(s.date)) continue;
      const key = (typeof s.series === 'string' && s.series.trim()) ? norm(s.series) : s.topic || norm(s.course || '');
      const cur = last.get(key);
      if (!cur || d10(s.date) > d10(cur.date)) last.set(key, s);
    }
    const out = [];
    for (const [key, s] of last) {
      const due = sessionDue(d, s), rule = topicRule(d, s.topic);
      const dd = due ? daysBetween(t, due) : null;
      out.push({ id: s.id, key, topic: s.topic, label: topicLabel(s.topic), course: s.course || topicLabel(s.topic), date: d10(s.date), due, days: dd,
        status: !due ? 'senza scadenza' : dd < 0 ? 'scaduta' : dd <= win ? 'in scadenza' : 'valida', participants: people(s), law: rule?.law || '', ruleStatus: rule?.status || null,
        validMonths: fin(s.validMonths) ? +s.validMonths : rule?.months ?? null, validSrc: fin(s.validMonths) ? 'corso' : rule ? 'pacchetto' : null });
    }
    return out.sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
  }, 6);
}

/* ---------------- divario retributivo ---------------- */
const stat = xs => ({ n: xs.length, mean: xs.length ? sum(xs) / xs.length : null, median: xs.length ? median(xs) : null });
/** Retribuzione annua lorda riportata al tempo pieno (fisso + variabile) ÷ ETP; null se i dati non bastano. */
export const ftePay = r => (r && fin(r.fte) && +r.fte > 0 && fin(r.baseAnnual) ? (+r.baseAnnual + n0(r.variableAnnual)) / +r.fte : null);

/**
 * Divario retributivo di genere su righe pseudonime {gender:'F'|'M', category, fte, baseAnnual, variableAnnual}:
 * divario = (uomini − donne) ÷ uomini, sulla media e sulla mediana della retribuzione annua riportata al tempo pieno;
 * per categoria; componenti variabili; distribuzione per quartili. Ogni gruppo con meno di smallCell persone per genere è
 * soppresso (value null, note «gruppo < 5»). flag5: categorie confrontabili con divario medio ≥ soglia.
 */
export function payGap(rows, { smallCell = 5, threshold = 5 } = {}) {
  const ok = A(rows).filter(r => r && ['F', 'M'].includes(r.gender) && ftePay(r) != null);
  const sc = Math.max(2, Math.round(+smallCell || 5)), thr = (+threshold || 5) / 100;
  const suppressed = [];
  const cell = (xs, label) => {
    const F = stat(xs.filter(r => r.gender === 'F').map(ftePay)), M = stat(xs.filter(r => r.gender === 'M').map(ftePay));
    if (F.n < sc || M.n < sc) {
      if (F.n || M.n) { if (F.n < sc) suppressed.push({ group: label, gender: 'F', n: F.n }); if (M.n < sc) suppressed.push({ group: label, gender: 'M', n: M.n }); }
      return { label, nF: F.n, nM: M.n, suppressed: true, meanGap: null, medianGap: null, meanF: null, meanM: null, medianF: null, medianM: null, note: F.n === 0 || M.n === 0 ? 'un solo genere nel gruppo' : `gruppo < ${sc}` };
    }
    return { label, nF: F.n, nM: M.n, suppressed: false, meanF: F.mean, meanM: M.mean, medianF: F.median, medianM: M.median,
      meanGap: M.mean > 0 ? (M.mean - F.mean) / M.mean : null, medianGap: M.median > 0 ? (M.median - F.median) / M.median : null };
  };
  const overall = cell(ok, 'totale');
  const cats = [...new Set(ok.map(r => CATEGORIES.includes(r.category) ? r.category : 'altro'))].sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  const byCategory = cats.map(c => ({ category: c, ...cell(ok.filter(r => (CATEGORIES.includes(r.category) ? r.category : 'altro') === c), c) }));
  // componenti variabili: media annua riportata al tempo pieno (zeri compresi) e quota di chi le riceve
  const vF = ok.filter(r => r.gender === 'F'), vM = ok.filter(r => r.gender === 'M');
  const vpay = r => n0(r.variableAnnual) / +r.fte;
  const variable = vF.length >= sc && vM.length >= sc ? (() => {
    const mF = sum(vF, vpay) / vF.length, mM = sum(vM, vpay) / vM.length;
    return { suppressed: false, meanF: mF, meanM: mM, gap: mM > 0 ? (mM - mF) / mM : null, shareF: vF.filter(r => n0(r.variableAnnual) > 0).length / vF.length, shareM: vM.filter(r => n0(r.variableAnnual) > 0).length / vM.length };
  })() : { suppressed: true, gap: null, note: `gruppo < ${sc}` };
  // quartili della retribuzione: quattro fasce con lo stesso numero di persone, quota di donne e uomini in ciascuna
  const sorted = [...ok].sort((a, b) => ftePay(a) - ftePay(b));
  const n = sorted.length;
  const quartiles = [0, 1, 2, 3].map(q => {
    const xs = sorted.slice(Math.round(n * q / 4), Math.round(n * (q + 1) / 4));
    const F = xs.filter(r => r.gender === 'F').length, M = xs.length - F;
    return xs.length < sc ? { q: q + 1, n: xs.length, suppressed: true, F: null, M: null, shareF: null } : { q: q + 1, n: xs.length, suppressed: false, F, M, shareF: F / xs.length };
  });
  const flag = byCategory.filter(c => !c.suppressed && c.meanGap != null && Math.abs(c.meanGap) >= thr);
  return { n, nF: vF.length, nM: vM.length, smallCell: sc, threshold: thr, overall, byCategory, variable, quartiles, flag5: flag.length > 0, flagged: flag.map(c => c.category),
    overallOver: !overall.suppressed && overall.meanGap != null && Math.abs(overall.meanGap) >= thr, suppressed };
}

/** Righe retributive del periodo: stessa chiave di periodo, oppure il gruppo più recente che finisce dentro il periodo o prima. */
export function payRowsFor(d, P) {
  const rows = A(d?.payData).filter(r => r && typeof r.periodKey === 'string');
  if (!rows.length || !P) return { key: null, rows: [] };
  const keys = [...new Set(rows.map(r => r.periodKey))];
  if (P.key && keys.includes(P.key)) return { key: P.key, rows: rows.filter(r => r.periodKey === P.key) };
  const ends = keys.map(k => ({ k, to: periodByKey(d, k)?.to || null })).filter(x => x.to && x.to <= P.to).sort((a, b) => (a.to < b.to ? 1 : -1));
  const hit = ends.find(x => x.to >= P.from) || null;
  return hit ? { key: hit.k, rows: rows.filter(r => r.periodKey === hit.k) } : { key: null, rows: [] };
}
/** Divario del periodo (null senza righe retributive). */
export function payGapFor(d, P) {
  if (!isObj(d) || !P) return null;
  const st = personeSettings(d);
  return cached(`pg|${P.key || ''}|${P.from}|${P.to}|${st.smallCell}|${st.gapThresholdPct}`, [d.payData], () => {
    const { key, rows } = payRowsFor(d, P);
    if (!rows.length) return null;
    return { periodKey: key, ...payGap(rows, { smallCell: st.smallCell, threshold: st.gapThresholdPct }) };
  }, 12);
}

/* ---------------- obblighi: trasparenza retributiva e rapporto biennale ---------------- */
/** Fascia della trasparenza retributiva (D.Lgs. 96/2026) per i dipendenti medi: prima relazione, ricorrenza, stato della fonte. */
export function payTransparencyDuties(d, avgHeadcount, today = null) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  const bands = A(personePack(d).items).filter(x => x && x.kind === 'trasparenza').sort((a, b) => b.min - a.min);
  const n = fin(avgHeadcount) ? +avgHeadcount : null;
  const band = n == null ? null : bands.find(b => n >= b.min) || null;
  return { headcount: n, band, bands: [...bands].reverse(), report: !!band?.firstReport, firstReport: band?.firstReport || null, every: band?.every || null,
    days: band?.firstReport ? daysBetween(t, band.firstReport) : null, joint: packItem(d, 'pt-joint') };
}
/** Rapporto biennale M/F (art. 46 D.Lgs. 198/2006): oltre 50 dipendenti. */
export function biennialReportDue(d, headcount) {
  const it = packItem(d, 'biennale');
  const n = fin(headcount) ? +headcount : null;
  if (!it) return { applies: false, item: null };
  return { applies: n != null && n >= (it.min || 51), headcount: n, item: it, biennium: it.biennium, due: it.due, status: it.status };
}

/* ---------------- UNI/PdR 125 e OT23 ---------------- */
/** Punteggio dell'autovalutazione: Σ punteggio d'area (0-100) × peso ÷ 100; soglia 60%. Solo aree e pesi, nessun testo degli indicatori. */
export function pdr125Score(scores, item = PACK_PERSONE.items.find(x => x.id === 'pdr125')) {
  const areas = A(item?.areas).map(a => {
    const v = isObj(scores) && fin(scores[a.id]) ? Math.max(0, Math.min(100, +scores[a.id])) : null;
    return { ...a, score: v, points: v == null ? null : v * a.weight / 100 };
  });
  const filled = areas.filter(a => a.score != null);
  const total = filled.length ? sum(filled, a => a.points) : null;
  const threshold = fin(item?.threshold) ? +item.threshold : 60;
  return { areas, total, complete: filled.length === areas.length && areas.length > 0, threshold, pass: total != null && filled.length === areas.length ? total >= threshold : null,
    weakest: filled.length ? [...filled].sort((a, b) => a.score - b.score)[0] : null };
}
/** Domanda OT23: punti degli interventi fatti, punti previsti, soglia del pacchetto (da verificare sul modello INAIL dell'anno). */
export function ot23Total(row, item = PACK_PERSONE.items.find(x => x.id === 'ot23')) {
  const ms = A(row?.measures).filter(isObj);
  const done = ms.filter(m => m.done !== false);
  const points = sum(done, m => n0(m.points)), planned = sum(ms, m => n0(m.points));
  const threshold = fin(item?.threshold) ? +item.threshold : 100;
  return { measures: ms.length, done: done.length, points, planned, threshold, ok: points >= threshold, missing: Math.max(0, threshold - points), status: item?.status || 'da verificare' };
}
/** Riduzione del tasso OT23 per lavoratori-anno (tabella del pacchetto, da verificare). */
export function ot23Reduction(d, workersYear) {
  const it = packItem(d, 'ot23-reduction');
  if (!it || !fin(workersYear)) return null;
  const b = A(it.bands).find(x => x.max == null || +workersYear <= x.max);
  return b ? { pct: b.pct, status: it.status, source: it.source } : null;
}
/** Anno degli interventi della prossima domanda OT23 (scadenza il 28/02 dell'anno dopo, valida fino a 30 giorni dopo la scadenza). */
export function ot23Year(today) {
  const y = +String(today).slice(0, 4);
  return String(today).slice(5, 10) <= '03-30' ? y - 1 : y;
}

/** Età dei dati: mesi chiusi del periodo con produzione e senza ore registrate. */
export function monthsWithoutHours(d, P, today) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  const lastClosed = addMonths(t.slice(0, 7), -1);
  const prod = new Set(A(d?.runs).filter(r => r && inP(r.date, P)).map(r => r.date.slice(0, 7)));
  const have = new Set(A(d?.hoursWorked).filter(r => r && fin(r.hours)).map(r => (typeof r.month === 'string' ? r.month.slice(0, 7) : String(r.id).slice(0, 7))));
  return [...prod].filter(m => m <= lastClosed && !have.has(m)).sort();
}
