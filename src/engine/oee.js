/* FeedOS 17 · OEE delle linee, fermi e segnali di produzione (pacchetto WP6).
 * Tempi: calendario (24 h) → ore di turno (calendario delle linee) → ore pianificate (turno − fermi programmati)
 * → ore di marcia (registrazioni) + fermi non programmati + ore non registrate.
 * OEE = disponibilità (marcia ÷ pianificate) × prestazioni (t ÷ t/h ideale ÷ marcia) × qualità (t buone ÷ t).
 * Le perdite in € valgono il margine di contribuzione perso sulle linee sature, il costo orario sulle altre. */
import { addDays, sum, nf, dateIt, mondayOf, byId, median, stdev } from '../core/util.js';
import { capWeek, calendarHours, weeksIn, lineDrift } from './lines.js';

/** Fattore della trafila sulla portata di targa: le matrici fini rallentano la pressa. */
export const DIE_FACTOR = { 'Pellet 3 mm': 0.70, 'Pellet 4 mm': 0.80, 'Pellet 6 mm': 1.00, 'Pellet 8 mm': 1.08, Sbriciolato: 0.95, Farina: 1.00 };

/** Cause di fermo: le programmate riducono le ore pianificate, le altre la disponibilità. */
export const STOP_REASONS = [
  { id: 'guasto', label: 'Guasto', planned: false },
  { id: 'cambio', label: 'Cambio prodotto', planned: false },
  { id: 'pulizia', label: 'Pulizia e lavaggio', planned: false },
  { id: 'attesa-mp', label: 'Attesa materie prime', planned: false },
  { id: 'attesa-personale', label: 'Attesa personale', planned: false },
  { id: 'micro', label: 'Micro-fermi', planned: false },
  { id: 'manutenzione', label: 'Manutenzione programmata', planned: true },
  { id: 'ordini', label: 'Mancanza ordini', planned: true },
  { id: 'festivo', label: 'Festivo o chiusura', planned: true },
];
export const REASON = Object.fromEntries(STOP_REASONS.map(r => [r.id, r]));
const isPlanned = s => !!REASON[s.reason]?.planned;

/** t/h ideali di un prodotto su una linea: percorso del prodotto, altrimenti targa × fattore della trafila. */
export function idealTph(product, line) {
  const r = (product?.routes || []).find(x => x.lineId === line?.id);
  if (r && +r.idealTph > 0) return +r.idealTph;
  return (+line?.capacityTph || 0) * (DIE_FACTOR[product?.form] ?? 1);
}

/** Cambi prodotto: campagne consecutive sulla stessa linea con prodotto diverso. → [{lineId, from, to, date}] */
export function changeovers(runs) {
  const out = [];
  const byLine = {};
  for (const r of runs) (byLine[r.lineId] ||= []).push(r);
  for (const [lineId, rs] of Object.entries(byLine)) {
    rs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id), 'it', { numeric: true })));
    for (let i = 1; i < rs.length; i++) if (rs[i].productId !== rs[i - 1].productId) out.push({ lineId, from: rs[i - 1].productId, to: rs[i].productId, date: rs[i].date });
  }
  return out;
}

const inP = (x, P) => x >= P.from && x <= P.to;
const hoursOk = r => !(r.estimated && r.estimated.hours) && r.hours > 0;

/**
 * Tempi e OEE di una linea (o dello stabilimento, lineId null) nel periodo P.
 * → {Tcal, Tturno, Tpian, Trun, planned, unplanned, byReason {id: ore}, residual, A, P: perf, Q, oee, teep, tonnes, good, idealH, warnPerf, lossTree}
 */
export function oee(d, P, { lineId = null } = {}) {
  const lines = (d.lines || []).filter(l => !lineId || l.id === lineId);
  const prod = byId(d.products || []), lot = byId(d.lots || []);
  const days = Math.max(1, Math.round((Date.parse(P.to) - Date.parse(P.from)) / 864e5) + 1);
  let Tturno = 0;
  for (const l of lines) for (const w of weeksIn(P)) Tturno += calendarHours(l, w, d.settings, P);
  const ids = new Set(lines.map(l => l.id));
  const stops = (d.stops || []).filter(s => ids.has(s.lineId) && inP(s.date, P));
  const byReason = {};
  for (const s of stops) byReason[s.reason] = (byReason[s.reason] || 0) + (+s.minutes || 0) / 60;
  const planned = sum(stops.filter(isPlanned), s => +s.minutes || 0) / 60;
  const unplanned = sum(stops.filter(s => !isPlanned(s)), s => +s.minutes || 0) / 60;
  const runs = (d.runs || []).filter(r => ids.has(r.lineId) && inP(r.date, P));
  const timed = runs.filter(hoursOk);
  const Trun = sum(timed, r => r.hours);
  const lineOf = byId(d.lines || []);
  let idealH = 0, tonnes = 0, good = 0, goodH = 0;
  for (const r of timed) {
    const ip = idealTph(prod[r.productId], lineOf[r.lineId]) || 1;
    const bad = (+r.waste || 0) + (lot[r.lotId]?.status === 'bloccato' ? r.tonnes : 0);
    const g = Math.max(0, r.tonnes - Math.min(r.tonnes, bad));
    idealH += r.tonnes / ip; tonnes += r.tonnes; good += g; goodH += g / ip;
  }
  const Tpian = Math.max(0, Tturno - planned);
  const residual = Tpian - Trun - unplanned;
  const A = Tpian > 0 ? Math.min(1, Trun / Tpian) : null;
  const perf = Trun > 0 ? idealH / Trun : null;
  const Q = tonnes > 0 ? good / tonnes : null;
  const o = A != null && perf != null && Q != null ? A * Math.min(perf, 1.05) * Q : null;
  const Tcal = days * 24 * lines.length;
  const lossTree = [
    { key: 'pian', label: 'Ore pianificate', value: Tpian, kind: 'total' },
    ...STOP_REASONS.filter(r => !r.planned && byReason[r.id] > 0).map(r => ({ key: r.id, label: r.label, value: -byReason[r.id] })),
    ...(Math.abs(residual) > 0.05 ? [{ key: 'residuo', label: 'Ore non registrate', value: -residual, def: 'Ore pianificate senza marcia né fermo registrato: registrare i fermi rende l’analisi completa.' }] : []),
    { key: 'run', label: 'Ore di marcia', value: Trun, kind: 'total' },
    { key: 'speed', label: 'Perdita di velocità', value: -(Trun - idealH), def: 'Ore di marcia oltre quelle necessarie alla velocità ideale del prodotto (t/h di targa × fattore della trafila).' },
    { key: 'quality', label: 'Perdita di qualità', value: -(idealH - goodH), def: 'Ore spese per tonnellate scartate o lotti bloccati.' },
    { key: 'va', label: 'Ore a valore', value: goodH, kind: 'total' },
  ];
  return { lineId, Tcal, Tturno, Tpian, Trun, planned, unplanned, byReason, residual, residualPct: Tpian > 0 ? residual / Tpian : null, A, P: perf, Q, oee: o, teep: o != null && Tcal ? o * Tpian / Tcal : null, tonnes, good, idealH, goodH, warnPerf: perf != null && perf > 1.05, stops: stops.length, lossTree };
}

/** Obiettivo di OEE (settings.ops.oeeTarget, di base 85%: il riferimento internazionale per impianti eccellenti). */
export const oeeTarget = d => { const v = +d?.settings?.ops?.oeeTarget; return v > 0 && v < 1 ? v : 0.85; };

/** Margine di contribuzione I per tonnellata (90 giorni) e quota di carico pianificato delle prossime 8 settimane per linea. */
function lossBasis(d, ctx) {
  const today = ctx?.today || d.settings?.demoAnchor;
  const f90 = (ctx?.facts || []).filter(f => f.date > addDays(today, -90) && f.date <= today);
  const mc1T = sum(f90, f => f.mc1) / Math.max(1, sum(f90, f => f.tonnes));
  const load = {};
  const w0 = mondayOf(today);
  for (const p of d.plan || []) if (p.week >= w0 && p.week < addDays(w0, 56)) load[p.lineId] = (load[p.lineId] || 0) + p.tonnes;
  const sat = {};
  for (const l of d.lines || []) { let cap = 0; for (let k = 0; k < 8; k++) cap += capWeek(l, addDays(w0, 7 * k), d.settings); sat[l.id] = cap > 0 ? (load[l.id] || 0) / cap : 0; }
  return { mc1T, sat };
}

/**
 * Valore di un'ora persa su una linea: su una linea satura (carico ≥ 85% della capacità utile) è il margine di contribuzione I
 * delle tonnellate che non si producono (t/h ideali × MdC I/t); altrimenti il costo orario della linea (settings.ops.lineCostH, di base 120 €/h).
 */
export function hourValue(d, line, basis, idealTph) {
  const saturated = (basis.sat[line.id] || 0) >= 0.85;
  return { saturated, eurH: saturated ? (idealTph || +line.capacityTph || 0) * basis.mc1T : (+d.settings?.ops?.lineCostH?.[line.id] || 120) };
}

/**
 * OEE dello stabilimento e per linea nel periodo P {plant, byLine, target}.
 * Per linea: lossH = ore pianificate − ore a valore (tutte le perdite rispetto all'ideale); gapH = ore da recuperare per arrivare
 * all'obiettivo; gapEur e eurPerPoint (valore di un punto di OEE nel periodo) secondo hourValue.
 */
export function oeeSummary(d, ctx, P) {
  if (!(d.lines || []).length || !P) return { plant: null, byLine: {}, target: oeeTarget(d) };
  const basis = lossBasis(d, ctx), target = oeeTarget(d);
  const byLine = {};
  for (const l of d.lines) {
    const o = oee(d, P, { lineId: l.id });
    const ideal = o.idealH > 0 ? o.tonnes / o.idealH : +l.capacityTph || 0;
    const { saturated, eurH } = hourValue(d, l, basis, ideal);
    const lossH = Math.max(0, o.Tpian - o.goodH);
    const gapH = o.oee != null ? Math.max(0, (target - o.oee) * o.Tpian) : 0;
    const dr = lineDrift(d, ctx?.today || P.to, l.id);
    byLine[l.id] = { oee: o.oee, A: o.A, P: o.P, Q: o.Q, teep: o.teep, lossH, lossEur: lossH * eurH, gapH, gapEur: gapH * eurH, eurPerPoint: 0.01 * o.Tpian * eurH, eurH,
      driftEur: dr?.costYear ?? 0, residualPct: o.residualPct, tonnes: o.tonnes, Trun: o.Trun, Tpian: o.Tpian, saturated };
  }
  const pl = oee(d, P, {});
  return { plant: pl.oee == null ? null : { oee: pl.oee, A: pl.A, P: pl.P, Q: pl.Q, teep: pl.teep }, byLine, target };
}

/** OEE settimanale di una linea per le ultime n settimane complete (grafico dell'andamento). */
export function oeeWeekly(d, lineId, today, n = 26) {
  const w0 = mondayOf(today);
  const out = [];
  for (let k = n; k >= 1; k--) {
    const w = addDays(w0, -7 * k);
    const o = oee(d, { from: w, to: addDays(w, 6) }, { lineId });
    out.push({ week: w, oee: o.oee, A: o.A, P: o.P, Q: o.Q });
  }
  return out;
}

/** Turni a confronto: tonnellate, ore, t/h, prestazioni e qualità per turno nel periodo. */
export function byShift(d, P, lineId = null) {
  const prod = byId(d.products || []), line = byId(d.lines || []), lot = byId(d.lots || []);
  const acc = {};
  for (const r of d.runs || []) {
    if (!inP(r.date, P) || (lineId && r.lineId !== lineId) || !hoursOk(r)) continue;
    const o = (acc[r.shift || '—'] ||= { shift: r.shift || '—', tonnes: 0, hours: 0, idealH: 0, good: 0, n: 0 });
    const bad = (+r.waste || 0) + (lot[r.lotId]?.status === 'bloccato' ? r.tonnes : 0);
    o.tonnes += r.tonnes; o.hours += r.hours; o.idealH += r.tonnes / (idealTph(prod[r.productId], line[r.lineId]) || 1); o.good += Math.max(0, r.tonnes - bad); o.n++;
  }
  return Object.values(acc).sort((a, b) => a.shift.localeCompare(b.shift)).map(o => ({ ...o, tph: o.hours ? o.tonnes / o.hours : null, P: o.hours ? o.idealH / o.hours : null, Q: o.tonnes ? o.good / o.tonnes : null }));
}

/** Coppie di cambio prodotto nel periodo con il tempo medio di cambio della linea (dai fermi «cambio»). */
export function changeoverPairs(d, P, lineId = null) {
  const runs = (d.runs || []).filter(r => inP(r.date, P) && (!lineId || r.lineId === lineId));
  const co = changeovers(runs);
  const avgMin = {};
  for (const l of d.lines || []) {
    const s = (d.stops || []).filter(x => x.lineId === l.id && x.reason === 'cambio' && inP(x.date, P));
    avgMin[l.id] = s.length ? sum(s, x => +x.minutes || 0) / s.length : null;
  }
  const acc = {};
  for (const c of co) { const k = `${c.lineId}|${c.from}|${c.to}`; const o = (acc[k] ||= { key: k, lineId: c.lineId, from: c.from, to: c.to, n: 0 }); o.n++; }
  const weeks = Math.max(1, weeksIn(P).length);
  return { pairs: Object.values(acc).map(o => ({ ...o, avgMin: avgMin[o.lineId] })).sort((a, b) => b.n - a.n), perWeek: Object.fromEntries((d.lines || []).map(l => [l.id, co.filter(c => c.lineId === l.id).length / weeks])), avgMin };
}

/** Segnali di produzione: deriva energetica, carico oltre la capacità, OEE in calo, fermi non registrati, manutenzione. → Signal[] */
export function productionSignals(d, ctx) {
  const out = [];
  const add = s => out.push(s);
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!today) return out;
  const lineById = byId(d.lines || []);
  // reclami recenti sul pellet, per linea (legati alla deriva energetica)
  const recent = (d.complaints || []).filter(c => c.date >= addDays(today, -35) && c.category === 'Qualità del pellet');
  const runByLot = {};
  for (const r of d.runs || []) runByLot[r.lotId] = r;
  const byLine = {};
  for (const c of recent) { const run = runByLot[c.lotId]; if (run) (byLine[run.lineId] ||= []).push(c); }

  // deriva energetica per linea (stessa definizione della scheda Energia e linee)
  for (const line of d.lines || []) {
    const dr = lineDrift(d, today, line.id);
    if (!dr || dr.drift == null || dr.drift <= 0.07) continue;
    const cl = byLine[line.id] || [];
    add({ key: `drift:${line.id}:${Math.round(dr.cur)}`, area: 'produzione', roles: ['produzione', 'direzione', 'qualita'], severity: cl.length ? 'critico' : 'attenzione',
      title: `${line.name}: +${nf(dr.drift * 100)}% di energia per tonnellata`,
      why: `Ultime 4 settimane ${nf(dr.cur, 1)} kWh/t contro ${nf(dr.base, 1)} kWh/t di riferimento (mediana delle settimane precedenti): circa ${nf(dr.costYear / 1000, 1)} mila € l’anno di energia in più.${cl.length ? ` Nello stesso periodo ${cl.length} reclami su pellet friabile da lotti di questa linea.` : ''}`,
      action: 'Controllare trafila, rulli e condizionamento a vapore; valutare la sostituzione della trafila (Produzione › Manutenzione).', impact: 2e5 + dr.drift * 1e5 + dr.costYear,
      link: { area: 'produzione', tab: 'energia', id: line.id } });
  }

  // carico del piano oltre la capacità utile
  const util = d.settings?.ops?.utilFactor ?? 0.9;
  const load = {};
  for (const p of d.plan || []) { const k = p.week + '|' + p.lineId; load[k] = (load[k] || 0) + p.tonnes; }
  for (const [k, t] of Object.entries(load)) {
    const [week, lineId] = k.split('|'); const line = lineById[lineId]; if (!line) continue;
    const cap = capWeek(line, week, d.settings), h = calendarHours(line, week, d.settings);
    const u = cap > 0 ? t / cap : 0;
    if (t - cap > 1 && week >= mondayOf(today)) add({ key: `cap:${k}`, area: 'produzione', roles: ['produzione', 'direzione'], severity: u > 1.1 ? 'critico' : 'attenzione',
      title: `Settimana del ${dateIt(week, 'dm')}: ${line.name} al ${nf(u * 100)}%`,
      why: `Pianificate ${nf(t)} t contro una capacità utile di ${nf(cap)} t (${line.capacityTph} t/h × ${nf(h)} h${h < line.hoursWeek ? ', settimana con festivi' : ''} al ${nf(util * 100)}%).`,
      action: 'Spostare volumi su un’altra linea o aggiungere un turno.', impact: 2e5 + u * 1e3, link: { area: 'produzione', tab: 'piano' } });
  }

  // OEE delle ultime 4 settimane sotto quello abituale (mediana delle settimane da −30 a −5) di almeno 4 punti
  // e oltre la variabilità normale della linea (1,2 deviazioni standard settimanali: la media di 4 settimane oscilla meno);
  // ore non registrate oltre il 10%
  const w0 = mondayOf(today);
  for (const line of d.lines || []) {
    const cur = oee(d, { from: addDays(w0, -28), to: addDays(w0, -1) }, { lineId: line.id });
    const prev = [];
    for (let k = 5; k <= 30; k++) { const w = addDays(w0, -7 * k); const o = oee(d, { from: w, to: addDays(w, 6) }, { lineId: line.id }); if (o.oee != null) prev.push(o.oee); }
    const base = prev.length >= 8 ? median(prev) : null, sd = prev.length >= 8 ? stdev(prev) : null;
    const drop = cur.oee != null && base != null ? base - cur.oee : null;
    if (drop != null && drop > 0.04 && drop > 1.2 * sd) add({ key: `oee:${line.id}:${w0}`, area: 'produzione', roles: ['produzione', 'direzione'], severity: 'attenzione',
      title: `${line.name}: OEE al ${nf(cur.oee * 100)}% (−${nf(drop * 100)} punti)`,
      why: `Ultime 4 settimane: disponibilità ${nf(cur.A * 100)}%, prestazioni ${nf(cur.P * 100)}%, qualità ${nf(cur.Q * 100, 1)}%, contro un OEE abituale del ${nf(base * 100)}% (oscillazione tipica di una settimana ±${nf(sd * 100)} punti).`,
      action: 'Aprire l’albero delle perdite della linea e la classifica dei fermi.', impact: 1.5e5 + drop * 1e5, link: { area: 'produzione', tab: 'oee', id: line.id } });
    if ((d.stops || []).some(s => s.lineId === line.id) && cur.residualPct != null && cur.residualPct > 0.1) add({ key: `stops:${line.id}:${w0}`, area: 'produzione', roles: ['produzione'], severity: 'info',
      title: `${line.name}: ${nf(cur.residualPct * 100)}% delle ore pianificate senza registrazione`,
      why: `Nelle ultime 4 settimane ${nf(cur.residual, 1)} ore pianificate non hanno né marcia né fermo registrato: l’OEE ne risulta incerto.`,
      action: 'Registrare i fermi del turno con la causa (Produzione › OEE e fermi).', impact: 3e4, link: { area: 'produzione', tab: 'oee', id: line.id } });
  }

  // manutenzione: interventi preventivi in scadenza entro 7 giorni (contatore o data)
  const planned = new Set((d.tasks || []).filter(t => t.assetId && t.status !== 'fatto' && t.status !== 'scartato').map(t => t.assetId));
  for (const a of d.assets || []) {
    if (planned.has(a.id)) continue; // c'è già un ordine di lavoro aperto
    const due = assetDue(d, a, today);
    if (due && due.dueDate && due.dueDate <= addDays(today, 7)) add({ key: `maint:${a.id}:${due.dueDate}`, area: 'produzione', roles: ['produzione'], severity: 'attenzione',
      title: `Manutenzione di ${a.name} in scadenza ${due.dueDate <= today ? 'superata' : `il ${dateIt(due.dueDate, 'dm')}`}`,
      why: `Contatore ${nf(due.counter)} ${due.unit} su ${nf(due.every)} previsti dal piano (${nf(due.used * 100)}%).`,
      action: 'Programmare l’intervento in un fermo pianificato.', impact: 1e5, link: { area: 'produzione', tab: 'manutenzione', id: a.id } });
  }
  return out;
}

/** Scadenza di un cespite secondo il suo piano (t, ore o giorni dall'ultimo intervento); proiezione con il ritmo delle ultime 8 settimane. */
export function assetDue(d, a, today) {
  if (!a?.plan?.every) return null;
  const since = a.lastServiceAt || '0000-01-01';
  const unit = a.plan.unit || 't';
  const runs = (d.runs || []).filter(r => (!a.lineId || r.lineId === a.lineId) && r.date > since && r.date <= today);
  const counter = unit === 'giorni' ? Math.max(0, Math.round((Date.parse(today) - Date.parse(since)) / 864e5)) : unit === 'h' ? sum(runs, r => +r.hours || 0) : sum(runs, r => r.tonnes);
  const every = +a.plan.every;
  const rest = every - counter;
  let dueDate = null;
  if (rest <= 0) dueDate = today;
  else if (unit === 'giorni') dueDate = addDays(today, Math.ceil(rest));
  else {
    const rec = (d.runs || []).filter(r => (!a.lineId || r.lineId === a.lineId) && r.date > addDays(today, -56) && r.date <= today);
    const perDay = sum(rec, r => (unit === 'h' ? +r.hours || 0 : r.tonnes)) / 56;
    if (perDay > 0) dueDate = addDays(today, Math.ceil(rest / perDay));
  }
  return { counter, every, unit: unit === 'giorni' ? 'giorni' : unit === 'h' ? 'h' : 't', used: every ? counter / every : null, rest, dueDate };
}

/** Sezione «Produzione» del report CdA, o null. */
export function opsReportSection(d, ctx, P, C) {
  if (!(d.lines || []).length || !P) return null;
  const S = oeeSummary(d, ctx, P);
  if (!S.plant) return null;
  const SC = C && !C.budget ? oeeSummary(d, ctx, C) : null;
  const rows = (d.lines || []).map(l => ({ name: l.name, ...S.byLine[l.id] }));
  const gap = sum(rows, r => r.gapEur || 0), drift = sum(rows, r => r.driftEur || 0);
  const worst = [...rows].sort((a, b) => (b.gapEur || 0) - (a.gapEur || 0))[0];
  return {
    id: 'produzione', title: 'Produzione', order: 70,
    kpis: [
      { label: 'OEE dello stabilimento', value: S.plant.oee * 100, unit: '%', decimals: 1, cmp: SC?.plant ? { value: SC.plant.oee * 100, kind: 'ratio', good: 'up' } : undefined },
      { label: 'Disponibilità', value: S.plant.A * 100, unit: '%', decimals: 1 },
      { label: 'Prestazioni', value: S.plant.P * 100, unit: '%', decimals: 1 },
      { label: 'Qualità', value: S.plant.Q * 100, unit: '%', decimals: 1 },
      { label: `Recuperabile con l’OEE all’${nf(S.target * 100)}%`, value: gap / 1000, unit: 'k€', decimals: 0 },
      { label: 'Energia in più per deriva', value: drift / 1000, unit: 'k€/anno', decimals: 1 },
    ],
    table: { cols: [{ key: 'name', label: 'Linea', fmt: 'text' }, { key: 'oee', label: 'OEE', fmt: 'pct' }, { key: 'A', label: 'Disponibilità', fmt: 'pct' }, { key: 'P', label: 'Prestazioni', fmt: 'pct' }, { key: 'Q', label: 'Qualità', fmt: 'pct' }, { key: 'gapEur', label: 'Recuperabile €', fmt: 'eur' }], rows },
    narrative: [worst && worst.gapEur > 0 ? `Portare ${worst.name} all’OEE obiettivo vale ${nf(worst.gapEur / 1000)} mila € nel periodo${worst.saturated ? ' (margine delle tonnellate perse: la linea è satura)' : ' (costo delle ore di marcia in più)'}; ogni punto di OEE vale ${nf(worst.eurPerPoint / 1000, 1)} mila €.` : 'Tutte le linee sono all’obiettivo di OEE.'],
  };
}
