/* FeedOS 17 · OEE delle linee, fermi e segnali di produzione (pacchetto WP6).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto.
 * productionSignals contiene per ora le regole 9 (deriva energetica) e 10 (capacità nel piano) spostate da signals.js:
 * il pacchetto le sostituisce con lineDrift e capOf. */
import { addDays, sum, nf, dateIt, mondayOf, byId } from '../core/util.js';

/** OEE dello stabilimento e per linea nel periodo P {plant, byLine}. */
export function oeeSummary(d, ctx, P) { return { plant: null, byLine: {} }; }

/** Segnali di produzione: deriva energetica per linea e capacità delle linee nel piano. → Signal[] */
export function productionSignals(d, ctx) {
  const out = [];
  const add = s => out.push(s);
  const today = ctx.today;
  const lineById = byId(d.lines || []);
  // reclami recenti sul pellet, per linea (legati alla deriva energetica)
  const recent = (d.complaints || []).filter(c => c.date >= addDays(today, -35) && c.category === 'Qualità del pellet');
  const byLine = {};
  for (const c of recent) { const run = d.runs.find(r => r.lotId === c.lotId); if (run) (byLine[run.lineId] ||= []).push(c); }

  // 9 · derive energetiche per linea (ultime 4 settimane contro le 12 precedenti)
  for (const line of d.lines || []) {
    const rs = d.runs.filter(r => r.lineId === line.id);
    const last = rs.filter(r => r.date > addDays(today, -28)), prev = rs.filter(r => r.date <= addDays(today, -28) && r.date > addDays(today, -112));
    const k = a => sum(a, r => r.kwh) / Math.max(1, sum(a, r => r.tonnes));
    if (last.length < 3 || prev.length < 6) continue;
    const a = k(last), b = k(prev), dlt = a / b - 1;
    if (dlt > 0.07) {
      const cl = byLine[line.id] || [];
      add({ key: `drift:${line.id}:${Math.round(a)}`, area: 'produzione', roles: ['produzione', 'direzione', 'qualita'], severity: cl.length ? 'critico' : 'attenzione',
        title: `${line.name}: +${nf(dlt * 100)}% di energia per tonnellata`,
        why: `Ultime 4 settimane ${nf(a, 1)} kWh/t contro ${nf(b, 1)} kWh/t delle 12 precedenti.${cl.length ? ` Nello stesso periodo ${cl.length} reclami su pellet friabile da lotti di questa linea.` : ''}`,
        action: 'Controllare matrice, rulli e condizionamento a vapore; confrontare con le ore di fermo.', impact: 2e5 + dlt * 1e5,
        link: { area: 'produzione', tab: 'energia', id: line.id } });
    }
  }

  // 10 · capacità delle linee nel piano
  const util = d.settings?.ops?.utilFactor ?? 0.9;
  const load = {};
  for (const p of d.plan || []) { const k = p.week + '|' + p.lineId; load[k] = (load[k] || 0) + p.tonnes; }
  for (const [k, t] of Object.entries(load)) {
    const [week, lineId] = k.split('|'); const line = lineById[lineId]; if (!line) continue;
    const cap = line.capacityTph * line.hoursWeek * util;
    const u = t / cap;
    if (t - cap > 1 && week >= mondayOf(today)) add({ key: `cap:${k}`, area: 'produzione', roles: ['produzione', 'direzione'], severity: u > 1.1 ? 'critico' : 'attenzione',
      title: `Settimana del ${dateIt(week, 'dm')}: ${line.name} al ${nf(u * 100)}%`,
      why: `Pianificate ${nf(t)} t contro una capacità utile di ${nf(cap)} t (${line.capacityTph} t/h × ${line.hoursWeek} h al ${nf(util * 100)}%).`,
      action: 'Spostare volumi su un’altra linea o aggiungere un turno.', impact: 2e5 + u * 1e3, link: { area: 'produzione', tab: 'piano' } });
  }
  return out;
}

/** Sezione «Produzione» del report CdA, o null. */
export function opsReportSection(d, ctx, P, C) { return null; }
