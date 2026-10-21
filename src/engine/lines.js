/* FeedOS 17 · Capacità e calendario delle linee, deriva energetica (pacchetto WP6).
 * Una sola definizione della deriva, usata dalla scheda Energia e linee e dal segnale su «Oggi». */
import { addDays, sum, mondayOf, median } from '../core/util.js';

/** Capacità utile settimanale in t: t/h di targa × ore di turno × fattore di utilizzo delle impostazioni. */
export const capOf = (line, settings) => (+line?.capacityTph || 0) * (+line?.hoursWeek || 0) * (settings?.ops?.utilFactor ?? 0.9);

/** Capacità utile di una settimana precisa (lunedì `week`): come capOf, con festivi e straordinari del calendario della linea. */
export const capWeek = (line, week, settings) => (+line?.capacityTph || 0) * calendarHours(line, week, settings) * (settings?.ops?.utilFactor ?? 0.9);

const isHoliday = (settings, date) => (settings?.calendar?.holidays || []).includes(date);

/** Ore di turno di una linea nella settimana `week` (lunedì): giorni feriali non festivi × ore/5 + straordinari;
 * con il periodo P conta solo i giorni che vi cadono (gli straordinari in proporzione). */
export function calendarHours(line, week, settings, P = null) {
  const base = +line?.hoursWeek || 0;
  let inP = 0, work = 0;
  for (let i = 0; i < 5; i++) {
    const x = addDays(week, i);
    if (P && (x < P.from || x > P.to)) continue;
    inP++;
    if (!isHoliday(settings, x)) work++;
  }
  const extra = +(settings?.calendar?.extraHours?.[line?.id]?.[week] || 0);
  return Math.max(0, base * work / 5 + extra * inP / 5);
}

/** Settimane (lunedì) che toccano il periodo P. */
export function weeksIn(P) {
  const out = [];
  for (let w = mondayOf(P.from); w <= P.to; w = addDays(w, 7)) out.push(w);
  return out;
}

const measuredKwh = r => !(r.estimated && r.estimated.kwh) && r.kwh > 0 && r.tonnes > 0;

/**
 * Deriva energetica di una linea: riferimento = mediana dei kWh/t settimanali delle settimane da −30 a −5,
 * attuale = kWh/t aggregato delle ultime 4 settimane; costo annuo = (attuale − riferimento) × t degli ultimi 12 mesi × €/kWh.
 * Le campagne con kWh stimati sono escluse. → {base, cur, drift, costYear, tYear} oppure null senza dati sufficienti.
 */
export function lineDrift(d, today, lineId) {
  const runs = (d.runs || []).filter(r => r.lineId === lineId && r.date <= today && measuredKwh(r));
  if (!runs.length) return null;
  const w0 = mondayOf(today);
  const byW = {};
  for (const r of runs) { const w = mondayOf(r.date); const o = (byW[w] ||= { t: 0, kwh: 0 }); o.t += r.tonnes; o.kwh += r.kwh; }
  const baseVals = [];
  for (let k = 30; k >= 5; k--) { const o = byW[addDays(w0, -7 * k)]; if (o && o.t > 0) baseVals.push(o.kwh / o.t); }
  const last = runs.filter(r => r.date > addDays(today, -28));
  if (baseVals.length < 6 || last.length < 3) return null;
  const base = median(baseVals), cur = sum(last, r => r.kwh) / sum(last, r => r.tonnes);
  const tYear = sum((d.runs || []).filter(r => r.lineId === lineId && r.date > addDays(today, -365) && r.date <= today), r => r.tonnes);
  const kwhPrice = +d.settings?.energy?.kwhPrice || 0;
  return { base, cur, drift: base > 0 ? cur / base - 1 : null, costYear: Math.max(0, (cur - base) * tYear * kwhPrice), tYear, kwhPrice };
}
