/* FeedOS 17 · Catalogo dei KPI con obiettivi e semafori (pacchetto WP7).
 * Un solo catalogo: formula dichiarata, unità, direzione buona, area e pagina di dettaglio. I valori vengono dai motori delle aree
 * (conto economico al costo effettivo, fatti di vendita, credito, rimanenze, OEE, fornitori, varianze, bilancio di massa, ESG):
 * il cruscotto, i segnali e il report mostrano gli stessi numeri delle pagine.
 * Obiettivi in settings.targets[id] = {target, warn, min?, max?, monthly?: {'MM': valore}}: i flussi hanno un obiettivo annuo
 * proporzionato ai mesi del periodo, i rapporti la media dei mesi pesata sulle tonnellate.
 * Contratto della fondazione: KPIS, kpiValues(d, ctx, P), statusFor(d, kpiId, value), kpiSignals(d, ctx), kpiReportSection(d, ctx, P, C). */
import { sum, median, addDays, daysBetween, monthsIn, monthFraction, nf, byId, mondayOf } from '../core/util.js';
import { aggregateFacts, fixedFor } from './actuals.js';
import { pnlFor } from './pnl.js';
import { creditSummary } from './credit.js';
import { inventorySummary } from './inventory.js';
import { customerProfit } from './profitability.js';
import { winRate } from './pricing.js';
import { oeeSummary } from './oee.js';
import { calendarHours, weeksIn } from './lines.js';
import { scorecard } from './suppliers.js';
import { ppv } from './purchaseVariance.js';
import { shrinkSummary } from './massbalance.js';
import { computeKpis } from './esg.js';

const EMPTY = [];
const inP = (x, P) => x >= P.from && x <= P.to;
const div = (a, b) => (b ? a / b : null);
const todayOf = (d, ctx) => ctx?.today || d?.settings?.demoAnchor || new Date().toISOString().slice(0, 10);

// memoria per identità (archivio, fatti) e periodo: il cruscotto chiede molti KPI dello stesso periodo
const caches = new Map();
function cached(name, deps, fn, max = 24) {
  let list = caches.get(name);
  if (!list) caches.set(name, (list = []));
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}
const key = P => P.from + '|' + P.to;
const pnl = (d, ctx, P) => cached('pnl|' + key(P), [d, ctx?.facts], () => pnlFor(d, ctx, P));
const facts = (d, ctx, P) => cached('agg|' + key(P), [d, ctx?.facts], () => aggregateFacts(ctx?.facts || EMPTY, d.salesHistory || EMPTY, P).total);
const runsIn = (d, P) => (d.runs || EMPTY).filter(r => inP(r.date, P));
const at = (d, ctx, P) => { const t = todayOf(d, ctx); return P.to < t ? P.to : t; };
const credit = (d, ctx, P) => cached('cs|' + at(d, ctx, P), [d], () => creditSummary(d, at(d, ctx, P)));
const inv = (d, ctx, P) => cached('inv|' + key(P), [d, ctx?.facts], () => inventorySummary(d, ctx, P));
const cust = (d, ctx, P) => cached('cp|' + key(P), [d, ctx?.facts], () => customerProfit(d, ctx, P));
const oeeOf = (d, ctx, P) => cached('oee|' + key(P), [d, ctx?.facts], () => oeeSummary(d, ctx, P));
const esg = (d, P) => cached('esg|' + key(P), [d], () => computeKpis(d, P));

/** Catalogo dei KPI. value in unità grezze (frazioni per le percentuali); scale e decimals servono a mostrarli. */
export const KPIS = [
  { id: 'ricavi-netti', label: 'Ricavi netti', unit: '€', kind: 'flow', dir: 'up', area: 'direzione', link: { area: 'direzione', tab: 'conto' }, decimals: 0, hist: true,
    def: 'Σ tonnellate consegnate × prezzo netto (listino meno sconti), come nel conto economico.', compute: (d, ctx, P) => pnl(d, ctx, P)?.revenueNet ?? null },
  { id: 'volume-t', label: 'Volumi consegnati', unit: 't', kind: 'flow', dir: 'up', area: 'commerciale', link: { area: 'commerciale', tab: 'clienti' }, decimals: 0, hist: true,
    def: 'Σ tonnellate consegnate nel periodo.', compute: (d, ctx, P) => pnl(d, ctx, P)?.tonnes ?? null },
  { id: 'prezzo-netto-t', label: 'Prezzo netto medio', unit: '€/t', kind: 'ratio', dir: 'up', area: 'commerciale', link: { area: 'commerciale', tab: 'listini' }, decimals: 1, hist: true,
    def: 'Ricavi netti ÷ tonnellate consegnate.', compute: (d, ctx, P) => { const p = pnl(d, ctx, P); return p ? div(p.revenueNet, p.tonnes) : null; } },
  { id: 'mdc-t', label: 'Margine di contribuzione II', unit: '€/t', kind: 'ratio', dir: 'up', area: 'economia', link: { area: 'economia', tab: 'margini' }, decimals: 1, hist: true,
    def: 'MdC II (ricavi netti − costi variabili al costo effettivo dei lotti − trasporti − provvigioni) ÷ tonnellate.', compute: (d, ctx, P) => { const p = pnl(d, ctx, P); return p ? div(p.by.mdc2, p.tonnes) : null; } },
  { id: 'margine-pieno-t', label: 'Margine sul costo pieno', unit: '€/t', kind: 'ratio', dir: 'up', area: 'economia', link: { area: 'economia', tab: 'redditivita' }, decimals: 1, hist: true,
    def: 'Σ (prezzo − costo pieno effettivo del lotto consegnato) ÷ tonnellate.', compute: (d, ctx, P) => { const a = facts(d, ctx, P); return div(a.marginFull, a.tonnes); } },
  { id: 'quota-mp', label: 'Incidenza delle materie prime', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'economia', link: { area: 'direzione', tab: 'conto' }, decimals: 1, hist: true,
    def: 'Costo delle materie prime dei lotti consegnati ÷ ricavi netti.', compute: (d, ctx, P) => { const p = pnl(d, ctx, P); return p ? div(-p.by.materiePrime, p.revenueNet) : null; } },
  { id: 'ebitda-pct', label: 'EBITDA sui ricavi', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'direzione', link: { area: 'direzione', tab: 'conto' }, decimals: 1, hist: true,
    def: '(MdC II − costi fissi monetari) ÷ ricavi netti.', compute: (d, ctx, P) => { const p = pnl(d, ctx, P); return p ? div(p.by.ebitda, p.revenueNet) : null; } },
  { id: 'kwh-t', label: 'Elettricità per tonnellata', unit: 'kWh/t', kind: 'ratio', dir: 'down', area: 'produzione', link: { area: 'produzione', tab: 'energia' }, decimals: 1, hist: true,
    def: 'Σ kWh misurati delle campagne ÷ Σ tonnellate delle stesse campagne (esclusi i kWh stimati).',
    compute: (d, ctx, P) => { const rs = runsIn(d, P).filter(r => !(r.estimated && r.estimated.kwh) && r.kwh > 0); return div(sum(rs, r => r.kwh), sum(rs, r => r.tonnes)); } },
  { id: 'utilizzo-linee', label: 'Utilizzo delle linee', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'produzione', link: { area: 'produzione', tab: 'oee' }, decimals: 0, hist: true,
    def: 'Σ ore di marcia ÷ Σ ore di turno del calendario delle linee (festivi e straordinari compresi).',
    compute: (d, ctx, P) => { let cal = 0; for (const l of d.lines || EMPTY) for (const w of weeksIn(P)) cal += calendarHours(l, w, d.settings, P); return div(sum(runsIn(d, P), r => +r.hours || 0), cal); } },
  { id: 'scarto-pct', label: 'Scarti di produzione', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'produzione', link: { area: 'produzione', tab: 'registro' }, decimals: 2, hist: true,
    def: 'Σ tonnellate scartate ÷ Σ tonnellate prodotte.', compute: (d, ctx, P) => { const rs = runsIn(d, P); return div(sum(rs, r => +r.waste || 0), sum(rs, r => r.tonnes)); } },
  { id: 'lotti-bloccati-pct', label: 'Lotti bloccati', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'qualita', link: { area: 'qualita', tab: 'lotti' }, decimals: 1, hist: true,
    def: 'Lotti di prodotto del periodo bloccati ÷ lotti prodotti.', compute: (d, ctx, P) => { const ls = (d.lots || EMPTY).filter(l => inP(l.date, P)); return ls.length ? ls.filter(l => l.status === 'bloccato').length / ls.length : null; } },
  { id: 'reclami-1000t', label: 'Reclami ogni 1.000 t', unit: 'n', kind: 'ratio', dir: 'down', area: 'qualita', link: { area: 'qualita', tab: 'reclami' }, decimals: 2, hist: true,
    def: 'Reclami ricevuti nel periodo ÷ tonnellate consegnate × 1.000.', compute: (d, ctx, P) => { const t = pnl(d, ctx, P)?.tonnes; return t ? ((d.complaints || EMPTY).filter(c => inP(c.date, P)).length / t) * 1000 : null; } },
  { id: 'copertura-mp-gg', label: 'Copertura delle materie prime', unit: 'giorni', kind: 'ratio', dir: 'range', area: 'acquisti', link: { area: 'acquisti', tab: 'fabbisogni' }, decimals: 0, hist: false,
    def: 'Mediana dei giorni di copertura delle materie prime usate nel piano (scorta ÷ consumo medio del piano a 8 settimane), a oggi.',
    compute: (d, ctx) => { const xs = (ctx?.mrp?.rows || EMPTY).filter(r => r.cover != null && r.daily > 0).map(r => r.cover); return xs.length ? median(xs) : null; } },
  { id: 'dso', label: 'Giorni medi d’incasso (DSO)', unit: 'giorni', kind: 'ratio', dir: 'down', area: 'finanza', link: { area: 'finanza', tab: 'crediti' }, decimals: 0, hist: false,
    def: 'Crediti aperti ricondotti ai giorni di fatturato (metodo a ritroso), alla fine del periodo.', compute: (d, ctx, P) => credit(d, ctx, P)?.dso ?? null },
  { id: 'scaduto-pct', label: 'Crediti scaduti', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'finanza', link: { area: 'finanza', tab: 'crediti' }, decimals: 1, hist: false,
    def: 'Crediti scaduti ÷ crediti aperti, alla fine del periodo.', compute: (d, ctx, P) => { const c = credit(d, ctx, P); return c ? div(c.overdue, c.open) : null; } },
  { id: 'dio', label: 'Giorni di magazzino MP', unit: 'giorni', kind: 'ratio', dir: 'down', area: 'finanza', link: { area: 'finanza', tab: 'rimanenze' }, decimals: 0, hist: false,
    def: 'Materie prime al FIFO ÷ consumo medio giornaliero dei 12 mesi.', compute: (d, ctx, P) => inv(d, ctx, P)?.dio ?? null },
  { id: 'eccedenze-eur', label: 'Scorte in eccesso', unit: '€', kind: 'ratio', dir: 'down', area: 'finanza', link: { area: 'finanza', tab: 'rimanenze' }, decimals: 0, hist: false,
    def: 'Valore delle materie prime lente o oltre il fabbisogno del piano.', compute: (d, ctx, P) => inv(d, ctx, P)?.excessValue ?? null },
  { id: 'hhi', label: 'Concentrazione dei clienti (HHI)', unit: 'punti', kind: 'ratio', dir: 'down', area: 'economia', link: { area: 'economia', tab: 'redditivita' }, decimals: 0, hist: false,
    def: 'Indice di Herfindahl-Hirschman: Σ quote di fatturato² (in punti, 10.000 = un solo cliente).', compute: (d, ctx, P) => cust(d, ctx, P)?.hhi ?? null },
  { id: 'top10-pct', label: 'Quota dei primi 10 clienti', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'economia', link: { area: 'economia', tab: 'redditivita' }, decimals: 0, hist: false,
    def: 'Fatturato dei primi 10 clienti ÷ fatturato totale.', compute: (d, ctx, P) => cust(d, ctx, P)?.top10 ?? null },
  { id: 'successo-offerte-valore', label: 'Offerte vinte (a valore)', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'commerciale', link: { area: 'commerciale', tab: 'offerte' }, decimals: 0, hist: true,
    def: 'Valore delle offerte accettate ÷ valore delle offerte decise (accettate o perse) nel periodo.', compute: (d, ctx, P) => winRate(d, P) },
  { id: 'oee', label: 'OEE dello stabilimento', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'produzione', link: { area: 'produzione', tab: 'oee' }, decimals: 1, hist: true,
    def: 'Disponibilità × prestazioni × qualità delle linee: ore a valore ÷ ore pianificate.', compute: (d, ctx, P) => oeeOf(d, ctx, P)?.plant?.oee ?? null },
  { id: 'otif', label: 'Consegne puntuali dei fornitori', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'acquisti', link: { area: 'acquisti', tab: 'fornitori' }, decimals: 0, hist: true,
    def: 'Ordini arrivati entro un giorno dalla data promessa e con quantità entro il 2%, pesati sulla spesa dei fornitori.',
    compute: (d, ctx, P) => { const rs = scorecard(d, ctx, P).filter(r => r.otif != null && r.spend > 0); return rs.length ? sum(rs, r => r.otif * r.spend) / sum(rs, r => r.spend) : null; } },
  { id: 'ppv-pct', label: 'Varianza di prezzo d’acquisto', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'acquisti', link: { area: 'acquisti', tab: 'varianze' }, decimals: 1, hist: true,
    def: 'Σ (prezzo dei lotti ricevuti − standard dell’anno) × t ÷ Σ standard × t.', compute: (d, ctx, P) => ppv(d, ctx, P).pct },
  { id: 'calo-effettivo', label: 'Calo effettivo di magazzino', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'produzione', link: { area: 'produzione', tab: 'bilancio' }, decimals: 2, hist: false,
    def: 'Differenza fra conte fisiche consecutive ÷ prelievi dello stesso intervallo.', compute: (d, ctx, P) => shrinkSummary(d, ctx, P).shrinkPct },
  { id: 'co2-t', label: 'CO₂ per tonnellata', unit: 'kg CO₂e/t', kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'energia' }, decimals: 0, hist: false,
    def: 'Stima indicativa: fattori di emissione delle materie prime + energia di stabilimento, per tonnellata prodotta (indicatore E8).',
    compute: (d, ctx, P) => esg(d, P)?.kpis?.find(k => k.code === 'E8')?.value ?? null },
];
// fonte dei dati di ogni KPI: un periodo coperto per meno della metà dalla sua fonte dà null (non zero), così un confronto
// con un anno senza registrazioni operative non mostra variazioni inventate; «snapshot» vale solo a oggi
const SRC = { 'kwh-t': 'runs', 'utilizzo-linee': 'runs', 'scarto-pct': 'runs', oee: 'runs', 'co2-t': 'runs', 'reclami-1000t': 'runs', 'lotti-bloccati-pct': 'lots',
  'copertura-mp-gg': 'snapshot', dso: 'invoices', 'scaduto-pct': 'invoices', dio: 'ingLots', 'eccedenze-eur': 'ingLots', otif: 'ingLots', 'ppv-pct': 'ingLots', 'calo-effettivo': 'ingLots',
  hhi: 'shipments', 'top10-pct': 'shipments' }; // le offerte sono eventi rari: il tasso di successo vale con quelle che ci sono
for (const k of KPIS) k.src = SRC[k.id] || 'sales';
export const KPI = Object.fromEntries(KPIS.map(k => [k.id, k]));

/** Primo giorno con dati della fonte di un KPI (null se la fonte è vuota o è il venduto, che ha anche lo storico mensile). */
function srcStart(d, src) {
  const coll = { runs: d.runs, lots: d.lots, invoices: d.invoices, ingLots: d.ingLots, shipments: d.shipments, offers: d.offers }[src];
  if (!coll) return null;
  return cached('start|' + src, [coll], () => { let m = null; for (const r of coll) if (r.date && (m == null || r.date < m)) m = r.date; return m || '9999-12-31'; }, 2);
}
/** Quota del periodo P coperta dalla fonte del KPI (1 per il venduto; per «snapshot» 1 solo se il periodo arriva a oggi). */
export function kpiCoverage(d, ctx, kpiId, P) {
  const k = KPI[kpiId];
  if (!k || k.src === 'sales') return 1;
  if (k.src === 'snapshot') return P.to >= addDays(todayOf(d, ctx), -7) ? 1 : 0;
  const start = srcStart(d, k.src);
  if (!start) return 1;
  const days = daysBetween(P.from, P.to) + 1, lo = start > P.from ? start : P.from;
  return lo > P.to ? 0 : (daysBetween(lo, P.to) + 1) / days;
}
/** Valore di un KPI nel periodo, null se il motore si interrompe o la fonte copre meno di metà del periodo. */
export function kpiValue(d, ctx, kpiId, P) {
  const k = KPI[kpiId];
  if (!k || kpiCoverage(d, ctx, kpiId, P) < 0.5) return null;
  let v = null;
  try { v = k.compute(d, ctx, P); } catch { v = null; }
  return v == null || !Number.isFinite(+v) ? null : +v;
}

/** Valore come si mostra (percentuali in punti). */
export const shown = (k, v) => (v == null || !Number.isFinite(+v) ? null : +v * (k?.scale || 1));

/**
 * Obiettivo di un KPI per il periodo P: {target, warn, min, max} o null.
 * Flussi: obiettivo annuo × quota dei mesi (o Σ obiettivi mensili × quota); rapporti: media dei mesi pesata sulle tonnellate.
 */
export function targetFor(d, kpiId, P) {
  const t = d?.settings?.targets?.[kpiId];
  const k = KPI[kpiId];
  if (!t || !k) return null;
  const monthly = t.monthly && typeof t.monthly === 'object' ? t.monthly : null;
  const valOf = m => { const v = monthly?.[m] ?? monthly?.[m.slice(5, 7)]; return v != null && Number.isFinite(+v) ? +v : null; };
  if (!P) return { target: num(t.target), warn: num(t.warn), min: num(t.min), max: num(t.max) };
  const months = monthsIn(P).map(m => ({ m, f: monthFraction(m, P) })).filter(x => x.f > 0);
  if (k.kind === 'flow') {
    const tg = months.length ? sum(months, x => (valOf(x.m) ?? (num(t.target) ?? 0) / 12) * x.f) : null;
    const scale = num(t.target) ? tg / num(t.target) : null;
    return { target: tg, warn: num(t.warn) != null && scale != null ? num(t.warn) * scale : null, min: null, max: null };
  }
  if (!monthly) return { target: num(t.target), warn: num(t.warn), min: num(t.min), max: num(t.max) };
  // rapporto con obiettivi mensili: media pesata sulle tonnellate dei mesi (a pesi uguali senza dati)
  const tons = {};
  for (const r of d.runs || EMPTY) if (inP(r.date, P)) tons[r.date.slice(0, 7)] = (tons[r.date.slice(0, 7)] || 0) + (+r.tonnes || 0);
  const w = months.map(x => ({ v: valOf(x.m) ?? num(t.target), w: (tons[x.m] || 0) * x.f || x.f })).filter(x => x.v != null);
  const tg = w.length ? sum(w, x => x.v * x.w) / sum(w, x => x.w) : num(t.target);
  return { target: tg, warn: num(t.warn), min: num(t.min), max: num(t.max) };
}
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/**
 * Semaforo (contratto): 'ok' | 'warn' | 'bad' | null. Direzione «up»: ok se v ≥ obiettivo, warn se v ≥ soglia, altrimenti bad;
 * «down» speculare; «range»: ok dentro [min, max], warn entro la soglia. Con P i flussi usano l'obiettivo proporzionato al periodo.
 */
export function statusFor(d, kpiId, value, P = null) {
  const k = KPI[kpiId];
  const t = targetFor(d, kpiId, P);
  if (!k || !t || value == null || !Number.isFinite(+value)) return null;
  const v = +value;
  if (k.dir === 'range') {
    if (t.min == null && t.max == null) return null;
    if ((t.min == null || v >= t.min) && (t.max == null || v <= t.max)) return 'ok';
    const w = t.warn ?? 0;
    return (t.min != null && v < t.min && v >= t.min - w) || (t.max != null && v > t.max && v <= t.max + w) ? 'warn' : 'bad';
  }
  if (t.target == null) return null;
  if (k.dir === 'down') return v <= t.target ? 'ok' : t.warn != null && v <= t.warn ? 'warn' : 'bad';
  return v >= t.target ? 'ok' : t.warn != null && v >= t.warn ? 'warn' : 'bad';
}

/** Valori dei KPI nel periodo P (contratto): {kpiId: number|null}; un motore che si interrompe dà null. */
export function kpiValues(d, ctx, P) {
  const out = {};
  for (const k of KPIS) out[k.id] = kpiValue(d, ctx, k.id, P);
  return out;
}

/** Proiezione a fine periodo di un flusso: effettivo + ritmo degli ultimi 28 giorni × giorni rimanenti (solo periodi in corso). */
export function projection(d, ctx, kpiId, P) {
  const k = KPI[kpiId], today = todayOf(d, ctx);
  if (!k || k.kind !== 'flow' || P.to <= today) return null;
  const cur = kpiValue(d, ctx, kpiId, { from: P.from, to: today });
  const pace = kpiValue(d, ctx, kpiId, { from: addDays(today, -27), to: today });
  if (cur == null || pace == null) return null;
  return cur + (pace / 28) * daysBetween(today, P.to);
}

/** Valori mensili degli ultimi n mesi (completi più quello in corso) per le serie dei KPI leggeri: [{month, value}] o [] per i pesanti. */
export function kpiHistory(d, ctx, kpiId, months = 13) {
  const k = KPI[kpiId];
  if (!k || !k.hist) return [];
  const today = todayOf(d, ctx);
  const out = [];
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const list = [];
  for (let i = 0; i < months; i++) { list.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
  for (const mo of list) {
    const P = { from: mo + '-01', to: mo + '-31' < today ? lastDay(mo) : today };
    out.push({ month: mo, value: kpiValue(d, ctx, kpiId, P), open: P.to === today });
  }
  return out;
}
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

/**
 * Prime perdite in euro del periodo, ordinate: OEE sotto l'obiettivo, deriva energetica, prezzi d'acquisto sopra lo standard,
 * differenze inventariali da registrare, mantenimento delle scorte in eccesso, clienti in perdita, crediti scaduti.
 * → [{id, label, eur, link, def}]
 */
export function topLosses(d, ctx, P) {
  const days = daysBetween(P.from, P.to) + 1, f = days / 365;
  const out = [];
  const add = (id, label, eur, link, def) => { if (eur != null && Number.isFinite(eur) && eur > 1) out.push({ id, label, eur, link, def }); };
  const safe = fn => { try { return fn(); } catch { return null; } };
  const O = safe(() => oeeOf(d, ctx, P));
  if (O?.byLine) {
    add('oee', 'Efficienza delle linee sotto l’obiettivo di OEE', sum(Object.values(O.byLine), x => x.gapEur || 0), { area: 'produzione', tab: 'oee' }, 'Margine delle tonnellate perse sulle linee sature, costo delle ore in più sulle altre, per arrivare all’OEE obiettivo.');
    add('drift', 'Deriva energetica delle linee', sum(Object.values(O.byLine), x => x.driftEur || 0) * f, { area: 'produzione', tab: 'energia' }, 'Elettricità in più rispetto al consumo di riferimento delle linee, nel periodo.');
  }
  const pv = safe(() => ppv(d, ctx, P));
  if (pv) add('ppv', 'Prezzi d’acquisto sopra lo standard', sum(pv.byIng.filter(x => x.ppv > 0), x => x.ppv), { area: 'acquisti', tab: 'varianze' }, 'Varianza sfavorevole di prezzo delle materie prime arrivate nel periodo.');
  const sh = safe(() => shrinkSummary(d, ctx, P));
  if (sh) add('shrink', 'Differenze inventariali da registrare', -Math.min(0, sh.unexplainedEur || 0), { area: 'produzione', tab: 'bilancio' }, 'Materie prime che il libro conta e le conte fisiche non trovano, al prezzo FIFO.');
  const iv = safe(() => inv(d, ctx, P));
  if (iv) add('excess', 'Mantenimento delle scorte in eccesso', (iv.excessCarryingCost || 0) * f, { area: 'finanza', tab: 'rimanenze' }, 'Costo del capitale e della conservazione delle scorte oltre il fabbisogno, nel periodo.');
  const cp = safe(() => cust(d, ctx, P));
  if (cp?.rows) add('customers', 'Clienti in perdita sul costo pieno', -sum(cp.rows.filter(r => r.net < 0), r => r.net), { area: 'economia', tab: 'redditivita' }, 'Margine netto negativo dei clienti che non coprono il costo pieno, logistica e incasso.');
  const cs = safe(() => credit(d, ctx, P));
  if (cs) {
    const rate = (+d.settings?.finance?.rate || 5) / 100;
    const o = cs.overdue || 0, o30 = cs.overdue30 || 0, o60 = cs.overdue60 || 0;
    add('overdue', 'Costo finanziario dei crediti scaduti', ((o - o30) * 15 + (o30 - o60) * 45 + o60 * 90) * rate / 365, { area: 'finanza', tab: 'crediti' }, 'Interessi sul capitale fermo nei crediti scaduti (15, 45 o 90 giorni secondo l’anzianità) al tasso delle impostazioni.');
  }
  return out.sort((a, b) => b.eur - a.eur);
}

/** Impatto in € di un KPI fuori obiettivo nel mese (stima per ordinare i segnali). */
function gapEur(d, ctx, k, v, t, P) {
  const tons = pnl(d, ctx, P)?.tonnes || 0;
  const gap = k.dir === 'down' ? v - t : t - v;
  if (!(gap > 0)) return 0;
  if (k.id === 'mdc-t' || k.id === 'margine-pieno-t' || k.id === 'prezzo-netto-t') return gap * tons;
  if (k.id === 'kwh-t') return gap * tons * (+d.settings?.energy?.kwhPrice || 0.2);
  if (k.id === 'dso') return gap * ((pnl(d, ctx, P)?.revenueNet || 0) / 30) * ((+d.settings?.finance?.rate || 5) / 100);
  if (k.unit === '%' && (k.id === 'quota-mp' || k.id === 'ebitda-pct')) return gap * (pnl(d, ctx, P)?.revenueNet || 0);
  return 0;
}

/** Segnali dei KPI fuori obiettivo negli ultimi 2 mesi chiusi: attenzione, critico se peggiora. → Signal[] */
export function kpiSignals(d, ctx) {
  const today = todayOf(d, ctx);
  const targets = d.settings?.targets || {};
  const out = [];
  let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  if (!m) { m = 12; y--; }
  const m1 = `${y}-${String(m).padStart(2, '0')}`;
  m--; if (!m) { m = 12; y--; }
  const m0 = `${y}-${String(m).padStart(2, '0')}`;
  for (const k of KPIS) {
    if (!targets[k.id] || k.kind === 'flow') continue;
    const P0 = { from: m0 + '-01', to: lastDay(m0) }, P1 = { from: m1 + '-01', to: lastDay(m1) };
    const v0 = kpiValue(d, ctx, k.id, P0), v1 = kpiValue(d, ctx, k.id, P1);
    if (v0 == null || v1 == null) continue;
    if (statusFor(d, k.id, v0, P0) !== 'bad' || statusFor(d, k.id, v1, P1) !== 'bad') continue;
    const worse = k.dir === 'down' ? v1 > v0 : v1 < v0;
    const t = targetFor(d, k.id, P1);
    const fmt = v => `${nf(shown(k, v), k.decimals ?? 1)}${k.unit === '%' ? '%' : ' ' + k.unit}`;
    const eur = gapEur(d, ctx, k, v1, t.target ?? t.min ?? t.max, P1);
    out.push({ key: `kpi:${k.id}:${m1}`, area: k.area === 'esg' ? 'esg' : k.area, roles: ['direzione', k.area], severity: worse ? 'critico' : 'attenzione',
      title: `${k.label}: fuori obiettivo da due mesi (${fmt(v1)})`,
      why: `${monthName(m0)} ${fmt(v0)}, ${monthName(m1)} ${fmt(v1)} contro un obiettivo di ${t.target != null ? fmt(t.target) : `${fmt(t.min)}–${fmt(t.max)}`}${worse ? ', in peggioramento' : ''}.${eur > 0 ? ` Vale circa ${nf(eur / 1000, 1)} mila € al mese.` : ''}`,
      action: 'Aprire la pagina dell’indicatore e la scomposizione; se l’obiettivo non è più realistico, rivederlo in Dati › Impostazioni.', impact: 1.2e5 + eur, link: k.link });
  }
  return out;
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const monthName = ym => MESI[+ym.slice(5, 7) - 1];

/** Sezione «Indicatori chiave» del report CdA: i KPI con obiettivo, valore e semaforo. */
export function kpiReportSection(d, ctx, P, C) {
  const V = kpiValues(d, ctx, P);
  const withT = KPIS.filter(k => d.settings?.targets?.[k.id] && V[k.id] != null);
  const list = withT.length ? withT : KPIS.filter(k => V[k.id] != null).slice(0, 8);
  if (!list.length) return null;
  const VC = C && !C.budget ? kpiValues(d, ctx, C) : null;
  const rows = list.map(k => {
    const t = targetFor(d, k.id, P), st = statusFor(d, k.id, V[k.id], P);
    return { name: k.label, value: shown(k, V[k.id]), target: t?.target != null ? shown(k, t.target) : null, unit: k.unit, status: st === 'ok' ? 'in linea' : st === 'warn' ? 'vicino alla soglia' : st === 'bad' ? 'fuori obiettivo' : '—' };
  });
  const bad = list.filter(k => statusFor(d, k.id, V[k.id], P) === 'bad');
  return {
    id: 'kpi', title: 'Indicatori chiave', order: 10,
    kpis: list.slice(0, 6).map(k => ({ label: k.label, value: shown(k, V[k.id]), unit: k.unit === '€' ? '€' : k.unit, decimals: k.decimals ?? 1, status: statusFor(d, k.id, V[k.id], P),
      cmp: VC && VC[k.id] != null ? { value: shown(k, VC[k.id]), kind: k.kind === 'flow' ? 'flow' : 'ratio', good: k.dir === 'down' ? 'down' : 'up' } : undefined })),
    table: { cols: [{ key: 'name', label: 'Indicatore', fmt: 'text' }, { key: 'value', label: 'Valore', fmt: 'num' }, { key: 'target', label: 'Obiettivo', fmt: 'num' }, { key: 'unit', label: 'Unità', fmt: 'text' }, { key: 'status', label: 'Stato', fmt: 'text' }], rows },
    narrative: [bad.length ? `Fuori obiettivo: ${bad.map(k => k.label.toLowerCase()).join(', ')}.` : 'Tutti gli indicatori con un obiettivo sono in linea o vicini alla soglia.'],
  };
}
