/* FeedOS 17 · Chiusura del mese (pacchetto WP1): lista di controllo, congelamento dei numeri, riapertura con nota.
 * Una chiusura (raccolta closings, id = 'YYYY-MM') conserva le somme dei fatti, il conto economico, il conto per prodotto,
 * i costi fissi per centro, gli indicatori, il punteggio della qualità dei dati e i commenti per sezione del report.
 * settings.closedThrough = ultimo mese chiuso: consegne, lavorazioni, costi fissi, fatture e incassi di quei mesi sono bloccati.
 * Puro: usabile nei test in node. */
import { addMonths, endOfMonth, addDays, daysBetween, todayLocal, monthLabel } from '../core/util.js';
import { aggregateFacts, fixedFor, makeCtx, FACT_SUMS } from './actuals.js';
import { runRules } from './dataquality.js';
import { pnl, pnlBy, fixedSplit, frozenFor, closingOf, fixedRows } from './pnl.js';
import { budgetStatus, hasBudget } from './budget.js';

export { frozenFor, closingOf };

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const EMPTY = [];
const todayOf = (d, ctx) => ctx?.today || (d?.settings?.dataset === 'demo' && d.settings.demoAnchor) || todayLocal();
const ym = s => String(s ?? '').slice(0, 7);

/** Chiusura del mese, qualunque sia lo stato (chiuso, riaperto, aperto con soli commenti), o null. */
export function closingRecord(d, month) { return (d.closings || EMPTY).find(c => (c.month || c.id) === month) || null; }
/** Ultimo mese chiuso ('YYYY-MM') o null. */
export const closedThrough = d => (d?.settings?.closedThrough ? ym(d.settings.closedThrough) : null);
/** Mese successivo all'ultimo chiuso: il primo da chiudere. */
export function nextToClose(d, ctx) {
  const ct = closedThrough(d);
  if (ct) return addMonths(ct, 1);
  const f = (ctx?.facts || EMPTY).reduce((m, x) => (!m || x.month < m ? x.month : m), null);
  return f || null;
}

/** Punteggio della qualità dei dati (contratto runRules) senza fermarsi se il motore manca o si interrompe. */
function dqOf(d, ctx, opts) {
  try { return runRules(d, ctx, opts) || null; } catch { return null; }
}
const critFails = r => (r?.rules || EMPTY).filter(x => x && x.severity === 'critico' && (Array.isArray(x.fails) ? x.fails.length > 0 : x.ok === false || n0(x.fails) > 0 || n0(x.failCount) > 0));

/**
 * Fotografia del mese: somme dei fatti, conto economico, conto per prodotto, costi fissi per centro, indicatori e qualità dei dati.
 * opts.dq: punteggio già calcolato (per non ripetere le regole).
 */
export function snapshotMonth(d, ctx, month, { by = null, at = null, comments = {}, dq } = {}) {
  ctx = ctx?.facts ? ctx : makeCtx(d);
  const P = { from: month + '-01', to: endOfMonth(month) };
  const a = aggregateFacts(ctx.facts, d.salesHistory || EMPTY, P).total;
  const fixed = fixedFor(fixedRows(d), d.costCenters || EMPTY, P);
  const split = fixedSplit(fixed, d.costCenters || EMPTY);
  const p = pnl(a, { ...fixed, split });
  const sums = Object.fromEntries([...FACT_SUMS, 'n'].map(k => [k, n0(a[k])]));
  const score = dq !== undefined ? dq : dqOf(d, ctx, { scope: 'closing' })?.score ?? null;
  return {
    id: month, month, status: 'chiuso', source: 'feedos',
    pnl: sums,
    lines: p.lines.map(l => ({ id: l.id, value: l.value })),
    byProduct: pnlBy(d, ctx, P, 'productId').map(r => ({ key: r.key, label: r.label, tonnes: r.tonnes, revenue: r.revenue, mdc1: r.mdc1, mdc2: r.mdc2, mdc2T: r.mdc2T, share: r.share })),
    fixed: { total: fixed.total, cash: fixed.cash, nonCash: fixed.nonCash, byCenter: { ...fixed.byCenter }, byGroup: { ...fixed.byGroup }, split, estimatedMonths: fixed.estimatedMonths },
    kpis: { tonnes: a.tonnes, mdc2T: a.tonnes > 0 ? a.mc2 / a.tonnes : null, ebitPct: a.revenue > 0 ? p.by.ebit / a.revenue : null, ebit: p.by.ebit },
    dq: score,
    comments: { ...(comments || {}) },
    closedAt: at || new Date().toISOString(),
    closedBy: by || 'Direzione',
  };
}

/** Prezzo più recente di una materia prima: data dell'ultimo lotto ricevuto con prezzo (o del campo priceDate). */
function lastPriceDate(d, ingId) {
  let best = null;
  const ing = (d.ingredients || EMPTY).find(i => i.id === ingId);
  for (const k of ['priceDate', 'priceAt', 'updatedAt']) if (ing?.[k] && (!best || ing[k] > best)) best = String(ing[k]).slice(0, 10);
  for (const l of d.ingLots || EMPTY) if (l.ingId === ingId && l.price != null && l.date && (!best || l.date > best)) best = l.date;
  return best;
}

/**
 * Lista di controllo del mese: [{id, label, ok, blocking, detail, link}].
 * Bloccanti: mese terminato, mese precedente chiuso, costi fissi a consuntivo per ogni centro, nessuna anomalia critica della qualità dei dati.
 */
export function checklist(d, ctx, month) {
  ctx = ctx?.facts ? ctx : makeCtx(d);
  const out = [];
  const end = endOfMonth(month), today = todayOf(d, ctx);
  // il mese deve essere finito
  const ended = today > end;
  out.push({ id: 'fine', label: 'Mese terminato', ok: ended, blocking: true,
    detail: ended ? `Finito il ${end.split('-').reverse().join('/')}` : `Il mese finisce il ${end.split('-').reverse().join('/')}: si chiude dal giorno dopo`, link: null });
  // mese precedente
  const ct = closedThrough(d), prev = addMonths(month, -1);
  const dataBefore = (ctx.facts || EMPTY).some(f => f.month < month) || (d.salesHistory || EMPTY).some(h => ym(h.month) < month);
  const prevOk = !dataBefore || (ct != null && ct >= prev);
  out.push({ id: 'prev', label: 'Mese precedente chiuso', ok: prevOk, blocking: true,
    detail: prevOk ? (ct && ct >= prev ? `Chiuso fino a ${monthLabel(ct, false)}` : 'Nessun dato nei mesi precedenti') : `Chiudere prima ${monthLabel(ct ? addMonths(ct, 1) : prev, false)}: i mesi si chiudono in ordine`,
    link: { area: 'direzione', tab: 'chiusura', id: ct ? addMonths(ct, 1) : prev } });
  // costi fissi a consuntivo per ogni centro
  const centers = d.costCenters || EMPTY;
  const have = new Set((d.fixedCosts || EMPTY).filter(r => (r.kind || 'consuntivo') === 'consuntivo' && ym(r.month) === month).map(r => r.centerId));
  const miss = centers.filter(c => !have.has(c.id));
  out.push({ id: 'fissi', label: 'Costi fissi a consuntivo per tutti i centri', ok: centers.length > 0 && !miss.length, blocking: true,
    detail: !centers.length ? 'Nessun centro di costo: definirli in Costi fissi' : miss.length ? `Mancano: ${miss.map(c => c.name).join(', ')}` : `${centers.length} centri registrati`,
    link: { area: 'direzione', tab: 'costi' } });
  // lettura dell'energia
  const en = (d.energy || EMPTY).find(e => ym(e.month || e.date) === month);
  out.push({ id: 'energia', label: 'Letture dell’energia del mese', ok: !!en, blocking: false,
    detail: en ? 'Lettura dei contatori registrata' : 'Nessuna lettura dei contatori per il mese', link: { area: 'esg', tab: 'energia' } });
  // lotti in attesa
  const wait = (d.lots || EMPTY).filter(l => l.status === 'in attesa' && ym(l.date) === month);
  out.push({ id: 'lotti', label: 'Nessun lotto di prodotto in attesa di rilascio', ok: !wait.length, blocking: false,
    detail: wait.length ? `${wait.length} lott${wait.length === 1 ? 'o' : 'i'} in attesa: ${wait.slice(0, 4).map(l => l.code || l.id).join(', ')}${wait.length > 4 ? '…' : ''}` : 'Tutti i lotti del mese sono rilasciati o bloccati',
    link: { area: 'qualita', tab: 'lotti' } });
  // prezzi delle materie prime aggiornati
  const used = new Set();
  for (const f of d.formulas || EMPTY) for (const l of f.lines || EMPTY) if (n0(l.kg) > 0) used.add(l.ing || l.ingId || l.id);
  const limit = addDays(end, -35);
  const stale = (d.ingredients || EMPTY).filter(i => i.active !== false && used.has(i.id)).filter(i => { const p = lastPriceDate(d, i.id); return !p || p < limit; });
  out.push({ id: 'prezzi', label: 'Prezzi delle materie prime aggiornati (entro 35 giorni)', ok: !stale.length, blocking: false,
    detail: stale.length ? `Da aggiornare: ${stale.slice(0, 5).map(i => i.name).join(', ')}${stale.length > 5 ? ` e altre ${stale.length - 5}` : ''}` : 'Ogni materia prima in formula ha un prezzo recente',
    link: { area: 'formulazione', tab: 'materie' } });
  // budget approvato
  const year = +month.slice(0, 4), st = budgetStatus(d, year);
  out.push({ id: 'budget', label: `Budget ${year} approvato`, ok: st?.status === 'approvato', blocking: false,
    detail: st?.status === 'approvato' ? `Versione ${st.version}, approvata${st.approvedBy ? ' da ' + st.approvedBy : ''}` : hasBudget(d, year) ? 'Budget presente ma non ancora approvato' : 'Nessun budget per l’anno',
    link: { area: 'direzione', tab: 'budget' } });
  // qualità dei dati
  const dq = dqOf(d, ctx, { scope: 'closing' });
  const crit = critFails(dq);
  out.push({ id: 'dati', label: 'Nessuna anomalia critica nei dati', ok: !crit.length, blocking: true,
    detail: dq?.score == null && !crit.length ? 'Controlli della qualità dei dati senza anomalie critiche' : crit.length ? `${crit.length} regol${crit.length === 1 ? 'a critica' : 'e critiche'} non rispettat${crit.length === 1 ? 'a' : 'e'}: ${crit.slice(0, 3).map(r => r.label || r.id).join(', ')}` : `Punteggio ${Math.round(dq.score)}/100, nessuna anomalia critica`,
    link: { area: 'dati', tab: 'qualita' } });
  return out;
}

/**
 * Operazioni di chiusura: chiusura del mese (upsert) e closedThrough = max(closedThrough, mese).
 * null se la lista di controllo ha una voce bloccante non superata (salvo force, che richiede una nota).
 */
export function closeMonthOps(d, ctx, month, { by = 'Direzione', comments = {}, force = false, note = '', at = null } = {}) {
  ctx = ctx?.facts ? ctx : makeCtx(d);
  const items = checklist(d, ctx, month);
  const failed = items.filter(i => i.blocking && !i.ok);
  if (failed.length && !force) return null;
  const old = closingRecord(d, month);
  const snap = snapshotMonth(d, ctx, month, { by, at, comments: { ...(old?.comments || {}), ...(comments || {}) } });
  if (failed.length) snap.forced = { note: String(note || '').trim(), items: failed.map(i => i.id) };
  if (old?.history || old?.reopenedAt) snap.history = [...(old.history || []), ...(old.reopenedAt ? [{ reopenedAt: old.reopenedAt, reopenedBy: old.reopenedBy, note: old.reopenNote }] : [])];
  return [
    { kind: 'upsertMany', coll: 'closings', objs: [snap] },
    { kind: 'settings', value: s => ({ ...s, closedThrough: s.closedThrough && ym(s.closedThrough) > month ? s.closedThrough : month }) },
  ];
}

/**
 * Operazioni di riapertura: il mese (e i mesi chiusi dopo di lui) tornano 'riaperto'; closedThrough = mese precedente.
 * La nota è obbligatoria e va anche nell'etichetta del registro (vedi reopenLabel).
 */
export function reopenMonthOps(d, month, { by = 'Direzione', note = '', at = null } = {}) {
  const txt = String(note || '').trim();
  if (!txt) return null;
  const when = at || new Date().toISOString();
  const ups = (d.closings || EMPTY).filter(c => (c.month || c.id) >= month && c.status === 'chiuso')
    .map(c => ({ id: c.id, status: 'riaperto', reopenedAt: when, reopenedBy: by, reopenNote: txt }));
  const prev = addMonths(month, -1);
  return [
    ups.length ? { kind: 'upsertMany', coll: 'closings', objs: ups } : null,
    { kind: 'settings', value: s => ({ ...s, closedThrough: s.closedThrough && ym(s.closedThrough) >= month ? prev : s.closedThrough }) },
  ].filter(Boolean);
}
export const reopenLabel = (month, note) => `Mese riaperto: ${monthLabel(month, false)} · nota: ${String(note || '').trim()}`;
export const closeLabel = month => `Mese chiuso: ${monthLabel(month, false)}`;

/** Differenze tra i numeri congelati e quelli attuali del mese chiuso: [{id, frozen, live, delta}] (|Δ| > 1 €). */
export function frozenVsLive(d, ctx, month) {
  const c = closingOf(d, month);
  if (!c?.pnl) return [];
  ctx = ctx?.facts ? ctx : makeCtx(d);
  const P = { from: month + '-01', to: endOfMonth(month) };
  const a = aggregateFacts(ctx.facts, d.salesHistory || EMPTY, P).total;
  const fixed = fixedFor(fixedRows(d), d.costCenters || EMPTY, P);
  const live = pnl(a, { ...fixed, split: fixedSplit(fixed, d.costCenters || EMPTY) });
  const fr = frozenFor(d, [month]);
  return live.lines.map(l => ({ id: l.id, label: l.label, frozen: fr.by[l.id], live: l.value, delta: l.value - fr.by[l.id] })).filter(x => Math.abs(x.delta) > 1);
}

/** Giorni passati dalla fine del mese (per i promemoria). */
export const daysSinceEnd = (month, today) => daysBetween(endOfMonth(month), today);
