/* FeedOS 17 · Manutenzione leggera (pacchetto WP6): cespiti delle linee con contatori alimentati dalle campagne,
 * scadenze del piano preventivo, guasti (MTBF/MTTR dai fermi), costo per tonnellata e rientro della sostituzione
 * della trafila (energia e portata perse a causa dell'usura). Ordini di lavoro = attività con assetId. */
import { addDays, sum, uid } from '../core/util.js';
import { assetDue } from './oee.js';
import { lineDrift } from './lines.js';

export const ASSET_KINDS = { trafila: 'Trafila', rulli: 'Rulli', 'griglie mulino': 'Griglie del mulino', condizionatore: 'Condizionatore', caldaia: 'Caldaia', miscelatore: 'Miscelatore', insaccatrice: 'Insaccatrice' };
/** Ordine di lavoro: attività della manutenzione o con un componente collegato. */
export const isWorkOrder = t => !!t && (t.source === 'manutenzione' || !!t.assetId);
/** Ordine di lavoro ancora da eseguire. */
export const isOpenWo = t => isWorkOrder(t) && t.status !== 'fatto' && t.status !== 'scartato';

/** Manutenzione dello stabilimento negli ultimi 12 mesi: guasti, ore di fermo, MTBF, costo (e €/t) degli interventi eseguiti. */
export function maintenanceSummary(d, today) {
  const from = addDays(today, -365);
  const br = (d.stops || []).filter(s => s.reason === 'guasto' && s.date > from && s.date <= today);
  const runs = (d.runs || []).filter(r => r.date > from && r.date <= today);
  const wo = (d.tasks || []).filter(t => isWorkOrder(t) && t.status === 'fatto' && (t.doneAt || t.due || '') > from && (t.doneAt || t.due || '') <= today);
  const runH = sum(runs, r => +r.hours || 0), tonnes = sum(runs, r => r.tonnes), cost = sum(wo, x => +x.cost || 0);
  const prev = wo.filter(x => x.kind !== 'correttiva').length, corr = wo.filter(x => x.kind === 'correttiva').length;
  return { failures: br.length, downH: sum(br, s => +s.minutes || 0) / 60, mtbf: br.length ? runH / br.length : null, cost, perT: tonnes ? cost / tonnes : null, prev, corr, preventiveShare: prev + corr ? prev / (prev + corr) : null };
}

/** Contatore e scadenza del piano (vedi oee.assetDue), più quota di vita usata. */
export function assetStatus(d, a, today) {
  const due = assetDue(d, a, today) || {};
  const since = a.lastServiceAt || '0000-01-01';
  const t = sum((d.runs || []).filter(r => (!a.lineId || r.lineId === a.lineId) && r.date > since && r.date <= today), r => r.tonnes);
  return { ...due, tonnesSince: t, lifeUsed: a.lifeT ? t / a.lifeT : null };
}

/** Guasti dai fermi con il cespite: MTBF = ore di marcia della linea ÷ guasti, MTTR = minuti medi di riparazione (12 mesi). */
export function reliability(d, a, today) {
  const from = addDays(today, -365);
  const br = (d.stops || []).filter(s => s.assetId === a.id && s.reason === 'guasto' && s.date > from && s.date <= today);
  const run = sum((d.runs || []).filter(r => (!a.lineId || r.lineId === a.lineId) && r.date > from && r.date <= today), r => +r.hours || 0);
  return { failures: br.length, downH: sum(br, s => +s.minutes || 0) / 60, mtbf: br.length ? run / br.length : null, mttr: br.length ? sum(br, s => +s.minutes || 0) / br.length : null };
}

/** Costo di manutenzione per tonnellata della linea del cespite negli ultimi 12 mesi (ordini di lavoro chiusi). */
export function maintenanceCost(d, a, today) {
  const from = addDays(today, -365);
  const wo = (d.tasks || []).filter(t => t.assetId === a.id && t.status === 'fatto' && (t.doneAt || t.due || '') > from);
  const cost = sum(wo, t => +t.cost || 0);
  const tonnes = sum((d.runs || []).filter(r => (!a.lineId || r.lineId === a.lineId) && r.date > from && r.date <= today), r => r.tonnes);
  return { cost, n: wo.length, perT: tonnes ? cost / tonnes : null };
}

/**
 * Rientro della sostituzione di una trafila: risparmio annuo = (kWh/t attuali − riferimento) × €/kWh × t annue
 * + ore di marcia perse per la minore portata × costo orario della linea. Rientro in mesi = costo ÷ risparmio mensile.
 */
export function dieReplacement(d, a, today) {
  if (a.kind !== 'trafila' || !a.lineId) return null;
  const dr = lineDrift(d, today, a.lineId);
  if (!dr || !(dr.cur > dr.base)) return null;
  const energy = (dr.cur - dr.base) * dr.kwhPrice * dr.tYear;
  const from = addDays(today, -365), recent = addDays(today, -28), ref = addDays(today, -210);
  const rs = (d.runs || []).filter(r => r.lineId === a.lineId && r.hours > 0 && !(r.estimated && r.estimated.hours));
  const tph = list => { const h = sum(list, r => r.hours); return h ? sum(list, r => r.tonnes) / h : null; };
  const cur = tph(rs.filter(r => r.date > recent && r.date <= today)), base = tph(rs.filter(r => r.date > ref && r.date <= addDays(today, -35)));
  const hoursLost = cur && base && cur < base ? dr.tYear / cur - dr.tYear / base : 0;
  const lineCostH = +d.settings?.ops?.lineCostH?.[a.lineId] || 120;
  const speed = hoursLost * lineCostH;
  const saving = energy + speed;
  return { energy, speed, saving, hoursLost, tphCur: cur, tphBase: base, kwhCur: dr.cur, kwhBase: dr.base, months: saving > 0 && a.replaceCost ? a.replaceCost / (saving / 12) : null, cost: +a.replaceCost || 0, since: from };
}

/** Ordine di lavoro come attività dell'area produzione con il cespite collegato. → ops */
export function workOrderOps(d, { assetId, kind = 'preventiva', due, cost = null, downMin = null, title, owner = 'Manutenzione', today }) {
  const a = (d.assets || []).find(x => x.id === assetId);
  return [{ kind: 'add', coll: 'tasks', obj: { id: uid('t'), createdAt: today, title: title || `${kind === 'correttiva' ? 'Riparazione' : 'Manutenzione preventiva'}: ${a?.name || 'cespite'}`, area: 'produzione', owner, due: due || today, status: 'aperto', priority: kind === 'correttiva' ? 'alta' : 'media', source: 'manutenzione', detail: a ? `${a.name} · linea ${a.lineId || 'stabilimento'}` : '', assetId, kind, cost, downMin, link: { area: 'produzione', tab: 'manutenzione', id: assetId } } }];
}

/** Chiusura di un ordine di lavoro: costo, minuti di fermo e, per la preventiva o la sostituzione, azzeramento del contatore. → ops */
export function completeWorkOrderOps(d, taskId, { date, cost, downMin, resetCounter = true }) {
  const t = (d.tasks || []).find(x => x.id === taskId);
  if (!t) return [];
  const ops = [{ kind: 'update', coll: 'tasks', id: taskId, patch: { status: 'fatto', doneAt: date, cost: cost ?? t.cost ?? null, downMin: downMin ?? t.downMin ?? null } }];
  if (resetCounter && t.assetId && (d.assets || []).some(a => a.id === t.assetId)) ops.push({ kind: 'update', coll: 'assets', id: t.assetId, patch: { lastServiceAt: date } });
  return ops;
}
