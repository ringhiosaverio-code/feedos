/* FeedOS 17 · Qualità dei dati: regole, punteggio e segnali (pacchetto WP7).
 * Ogni regola conta i record controllati (base) e quelli che non la rispettano (fails, con il collegamento per correggerli).
 * Punteggio = 100 × Σ peso × (1 − min(1, errori ÷ base)) ÷ Σ pesi, anche per area; una regola critica (tracciabilità e bilancio
 * di massa dei lotti) perde tutto il suo peso al primo errore. Le stesse regole valgono per l'archivio, la chiusura del mese
 * e le importazioni (scope).
 * Contratto della fondazione: runRules(d, ctx, opts) → {score, byArea, rules}, dqSignals(d, ctx), dqReportSection(d, ctx, P, C). */
import { sum, addDays, mondayOf, byId, nf, dateIt } from '../core/util.js';
import { calendarHours } from './lines.js';
import { integrity } from './massbalance.js';
// fondazione 18: regole dei nove pacchetti ESG (id riservati R21-R56, area 'esg')
import { CLIMA_RULES } from './esg-clima.js';
import { PCF_RULES } from './esg-pcf.js';
import { FILIERA_RULES } from './esg-filiera.js';
import { REPORT_RULES } from './esg-report.js';
import { PERSONE_RULES } from './esg-persone.js';
import { GOVERNANCE_RULES } from './esg-governance.js';
import { PIANO_RULES } from './esg-piano.js';
import { RISCHI_RULES } from './esg-rischi.js';
import { AMBIENTE_RULES } from './esg-ambiente.js';

const EMPTY = [];
const n0 = v => (Number.isFinite(+v) ? +v : 0);
const todayOf = (d, ctx) => ctx?.today || d?.settings?.demoAnchor || new Date().toISOString().slice(0, 10);
export const DQ_AREAS = { tracciabilita: 'Tracciabilità', anagrafiche: 'Anagrafiche', produzione: 'Produzione', commerciale: 'Commerciale', amministrazione: 'Amministrazione', sistema: 'Archivio', esg: 'ESG' };

/** Prezzo di listino di un prodotto alla data (righe di listino, altrimenti il prezzo del prodotto). */
function listAt(d) {
  const by = {};
  for (const r of d.priceLists || EMPTY) (by[r.productId] ||= []).push(r);
  const prod = byId(d.products || EMPTY);
  return (pid, date) => {
    const r = (by[pid] || EMPTY).filter(x => x.validFrom <= date && (!x.validTo || x.validTo >= date)).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
    return r ? n0(r.price) : n0(prod[pid]?.listPrice) || null;
  };
}
const dupes = (rows, keyOf) => {
  const seen = new Map(), out = [];
  for (const r of rows) { const k = keyOf(r); if (!k) continue; if (seen.has(k)) out.push([r, seen.get(k)]); else seen.set(k, r); }
  return out;
};

/** Regole di base: {id, area, severity, weight, scope, label, fix, check(d, ctx, opts) → {base, fails: [{id, coll, msg, link}]}}. */
const CORE_RULES = [
  { id: 'R1', area: 'tracciabilita', severity: 'critico', weight: 10, scope: ['all', 'closing', 'import'], label: 'Consegne con un lotto inesistente',
    check: d => { const lots = new Set((d.lots || EMPTY).map(l => l.id)); const s = d.shipments || EMPTY; return { base: s.length, fails: s.filter(x => !x.lotId || !lots.has(x.lotId)).map(x => ({ id: x.id, coll: 'shipments', msg: `Consegna ${x.ddt || x.id} del ${dateIt(x.date)}: lotto ${x.lotId || 'mancante'} non trovato`, link: { drawer: ['customer', x.customerId] } })) }; } },
  { id: 'R2', area: 'tracciabilita', severity: 'critico', weight: 8, scope: ['all', 'closing', 'import'], label: 'Consegne di un prodotto diverso da quello del lotto',
    check: d => { const lot = byId(d.lots || EMPTY); const s = (d.shipments || EMPTY).filter(x => lot[x.lotId]); return { base: s.length, fails: s.filter(x => lot[x.lotId].productId !== x.productId).map(x => ({ id: x.id, coll: 'shipments', msg: `Consegna ${x.ddt || x.id}: prodotto diverso dal lotto ${lot[x.lotId].code}`, link: { drawer: ['lot', x.lotId] } })) }; } },
  { id: 'R3', area: 'tracciabilita', severity: 'critico', weight: 8, scope: ['all', 'closing', 'import'], label: 'Lotti consegnati più di quanto prodotto',
    check: d => { const sh = {}; for (const s of d.shipments || EMPTY) sh[s.lotId] = (sh[s.lotId] || 0) + n0(s.tonnes); const ls = (d.lots || EMPTY).filter(l => sh[l.id]); return { base: ls.length, fails: ls.filter(l => sh[l.id] > n0(l.tonnes) + 0.05).map(l => ({ id: l.id, coll: 'lots', msg: `Lotto ${l.code}: consegnate ${nf(sh[l.id], 2)} t su ${nf(l.tonnes, 2)} prodotte`, link: { drawer: ['lot', l.id] } })) }; } },
  { id: 'R4', area: 'produzione', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Lotti di prodotto senza registrazione di produzione',
    check: d => { const runs = new Set((d.runs || EMPTY).map(r => r.id)); const ls = d.lots || EMPTY; return { base: ls.length, fails: ls.filter(l => !l.runId || !runs.has(l.runId)).map(l => ({ id: l.id, coll: 'lots', msg: `Lotto ${l.code} senza campagna`, link: { drawer: ['lot', l.id] } })) }; } },
  { id: 'R5', area: 'anagrafiche', severity: 'attenzione', weight: 5, scope: ['all'], label: 'Formule con materie prime mancanti o che non fanno 1.000 kg',
    check: d => { const ing = byId(d.ingredients || EMPTY); const fs = (d.formulas || EMPTY).filter(f => (f.lines || EMPTY).length); return { base: fs.length, fails: fs.filter(f => f.lines.some(l => !ing[l.ing]) || Math.abs(sum(f.lines, l => n0(l.kg)) - 1000) > 0.5).map(f => ({ id: f.id, coll: 'formulas', msg: `Formula ${f.code || f.name}: ${f.lines.some(l => !ing[l.ing]) ? 'materia prima non in anagrafica' : `${nf(sum(f.lines, l => n0(l.kg)), 1)} kg per tonnellata`}`, link: { area: 'formulazione', tab: 'formule', id: f.id } })) }; } },
  { id: 'R6', area: 'anagrafiche', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Prodotti attivi senza formula o linea',
    check: d => { const fs = new Set((d.formulas || EMPTY).map(f => f.id)), ls = new Set((d.lines || EMPTY).map(l => l.id)); const ps = (d.products || EMPTY).filter(p => p.active !== false); return { base: ps.length, fails: ps.filter(p => !fs.has(p.formulaId) || !ls.has(p.lineId)).map(p => ({ id: p.id, coll: 'products', msg: `${p.name}: ${!fs.has(p.formulaId) ? 'formula' : 'linea'} mancante`, link: { drawer: ['product', p.id] } })) }; } },
  { id: 'R7', area: 'tracciabilita', severity: 'attenzione', weight: 4, scope: ['all', 'closing', 'import'], label: 'Lotti di materia prima con residuo negativo o oltre la quantità',
    check: d => { const ls = d.ingLots || EMPTY; return { base: ls.length, fails: ls.filter(l => n0(l.remaining) < -0.001 || n0(l.remaining) > n0(l.tonnes) + 0.001).map(l => ({ id: l.id, coll: 'ingLots', msg: `Lotto ${l.code}: residuo ${nf(l.remaining, 2)} t su ${nf(l.tonnes, 2)}`, link: { drawer: ['ingLot', l.id] } })) }; } },
  { id: 'R8', area: 'tracciabilita', severity: 'critico', weight: 8, scope: ['all', 'closing'], label: 'Lotti di materia prima che non quadrano (ricevuto − prelevato + rettifiche ≠ residuo)',
    check: d => { const bad = integrity(d); const ix = byId(d.ingLots || EMPTY); return { base: (d.ingLots || EMPTY).length, fails: bad.map(x => ({ id: x.id, coll: 'ingLots', msg: `Lotto ${x.code}: scarto di ${nf(x.gap, 3)} t`, link: { drawer: ['ingLot', x.id] }, ingId: ix[x.id]?.ingId })) }; } },
  { id: 'R9', area: 'anagrafiche', severity: 'attenzione', weight: 2, scope: ['all', 'import'], label: 'Scorte negative',
    check: d => { const is = d.ingredients || EMPTY; return { base: is.length, fails: is.filter(i => n0(i.stock) < -0.001).map(i => ({ id: i.id, coll: 'ingredients', msg: `${i.name}: scorta ${nf(i.stock, 1)} t`, link: { drawer: ['ingredient', i.id] } })) }; } },
  { id: 'R10', area: 'anagrafiche', severity: 'info', weight: 2, scope: ['all'], label: 'Prezzi di materie prime vecchi mentre il mercato si è mosso',
    check: (d, ctx) => {
      const today = todayOf(d, ctx), q = {};
      for (const m of d.market || EMPTY) if (m.date <= today) (q[m.commodity] ||= []).push(m);
      for (const l of Object.values(q)) l.sort((a, b) => (a.date < b.date ? -1 : 1));
      const quoteAt = (c, date) => { let p = null; for (const m of q[c] || EMPTY) { if (m.date > date) break; p = m.price; } return p; };
      const is = (d.ingredients || EMPTY).filter(i => i.priceDate && q[i.id]);
      return { base: is.length, fails: is.filter(i => { if (i.priceDate > addDays(today, -30)) return false; const a = quoteAt(i.id, i.priceDate), b = quoteAt(i.id, today); return a && b && Math.abs(b / a - 1) > 0.03; })
        .map(i => ({ id: i.id, coll: 'ingredients', msg: `${i.name}: prezzo del ${dateIt(i.priceDate)}, quotazione cambiata di oltre il 3%`, link: { drawer: ['ingredient', i.id] } })) };
    } },
  { id: 'R11', area: 'amministrazione', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Mesi chiusi senza letture di energia o acqua',
    check: (d, ctx) => {
      const ct = d.settings?.closedThrough; if (!ct) return { base: 0, fails: [] };
      const today = todayOf(d, ctx), from = addDays(today, -365).slice(0, 7);
      const months = []; let [y, m] = from.split('-').map(Number);
      for (let k = 0; k < 13; k++) { const mo = `${y}-${String(m).padStart(2, '0')}`; if (mo <= ct.slice(0, 7) && mo >= from) months.push(mo); m++; if (m > 12) { m = 1; y++; } }
      const en = new Set((d.energy || EMPTY).map(e => e.month)), wa = new Set((d.water || EMPTY).map(w => w.month));
      const hasWater = (d.water || EMPTY).length > 0;
      return { base: months.length, fails: months.filter(mo => !en.has(mo) || (hasWater && !wa.has(mo))).map(mo => ({ id: mo, coll: 'energy', msg: `${mo}: ${!en.has(mo) ? 'energia' : 'acqua'} non registrata`, link: { area: 'esg', tab: !en.has(mo) ? 'energia' : 'acqua' } })) };
    } },
  { id: 'R12', area: 'anagrafiche', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Specifiche con minimo maggiore del massimo',
    check: d => { const cs = (d.specs || EMPTY).flatMap(s => (s.constraints || EMPTY).map(c => ({ s, c }))); return { base: cs.length, fails: cs.filter(x => x.c.min != null && x.c.max != null && +x.c.min > +x.c.max).map(x => ({ id: x.s.id + x.c.nut, coll: 'specs', msg: `${x.s.name}: ${x.c.nut} minimo ${x.c.min} oltre il massimo ${x.c.max}`, link: { area: 'formulazione', tab: 'specifiche', id: x.s.id } })) }; } },
  { id: 'R13', area: 'amministrazione', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Codici o numeri di documento duplicati',
    check: d => {
      const sets = [['offers', 'Offerta', x => x.code], ['purchases', 'Ordine', x => x.code], ['complaints', 'Reclamo', x => x.code], ['lots', 'Lotto', x => x.code], ['invoices', 'Fattura', x => x.number], ['shipments', 'DDT', x => (x.ddt ? x.ddt + '|' + x.productId + '|' + x.date : null)]];
      let base = 0; const fails = [];
      for (const [coll, label, k] of sets) { const rows = d[coll] || EMPTY; base += rows.length; for (const [a] of dupes(rows, k)) fails.push({ id: a.id, coll, msg: `${label} ${String(k(a)).split('|')[0]} duplicato`, link: null }); }
      return { base, fails };
    } },
  { id: 'R14', area: 'produzione', severity: 'attenzione', weight: 3, scope: ['all', 'closing', 'import'], label: 'Date nel futuro',
    check: (d, ctx) => { const today = todayOf(d, ctx); const rows = [...(d.runs || EMPTY).map(x => ['runs', x]), ...(d.shipments || EMPTY).map(x => ['shipments', x]), ...(d.lots || EMPTY).map(x => ['lots', x])]; return { base: rows.length, fails: rows.filter(([, x]) => x.date > today).map(([coll, x]) => ({ id: x.id, coll, msg: `${coll === 'runs' ? 'Campagna' : coll === 'lots' ? 'Lotto' : 'Consegna'} del ${dateIt(x.date)}`, link: null })) }; } },
  { id: 'R15', area: 'commerciale', severity: 'info', weight: 2, scope: ['all', 'import'], label: 'Clienti senza agente, termini di pagamento o coordinate',
    check: d => { const cs = (d.customers || EMPTY).filter(c => c.status !== 'cessato'); return { base: cs.length, fails: cs.filter(c => !c.agentId || !(c.terms?.days || c.paymentDays) || c.lat == null || c.lon == null).map(c => ({ id: c.id, coll: 'customers', msg: `${c.name}: ${!c.agentId ? 'agente' : !(c.terms?.days || c.paymentDays) ? 'termini di pagamento' : 'coordinate'} mancanti`, link: { drawer: ['customer', c.id] } })) }; } },
  { id: 'R16', area: 'produzione', severity: 'attenzione', weight: 2, scope: ['all', 'closing'], label: 'Settimane con più ore di marcia che ore di turno',
    check: d => {
      const h = {};
      for (const r of d.runs || EMPTY) { const k = r.lineId + '|' + mondayOf(r.date); h[k] = (h[k] || 0) + n0(r.hours); }
      const line = byId(d.lines || EMPTY), keys = Object.keys(h).filter(k => line[k.split('|')[0]]);
      return { base: keys.length, fails: keys.filter(k => { const [l, w] = k.split('|'); return h[k] > calendarHours(line[l], w, d.settings) + 0.5; }).map(k => { const [l, w] = k.split('|'); return { id: k, coll: 'runs', msg: `${line[l].name}, settimana del ${dateIt(w, 'dm')}: ${nf(h[k], 1)} ore di marcia su ${nf(calendarHours(line[l], w, d.settings), 1)} di turno`, link: { area: 'produzione', tab: 'oee', id: l } }; }) };
    } },
  { id: 'R17', area: 'commerciale', severity: 'attenzione', weight: 2, scope: ['all'], label: 'Offerte aperte oltre la validità',
    check: (d, ctx) => { const today = todayOf(d, ctx); const os = (d.offers || EMPTY).filter(o => o.status === 'bozza' || o.status === 'inviata'); return { base: os.length, fails: os.filter(o => o.validUntil && o.validUntil < today).map(o => ({ id: o.id, coll: 'offers', msg: `Offerta ${o.code} scaduta il ${dateIt(o.validUntil)}`, link: { drawer: ['offer', o.id] } })) }; } },
  { id: 'R18', area: 'commerciale', severity: 'attenzione', weight: 2, scope: ['all', 'import'], label: 'Consegne con prezzo lontano dal listino (sotto metà o oltre una volta e mezza)',
    check: d => { const L = listAt(d); const s = (d.shipments || EMPTY).filter(x => x.price != null); return { base: s.length, fails: s.filter(x => { const l = L(x.productId, x.date); return l && (x.price < 0.5 * l || x.price > 1.5 * l); }).map(x => ({ id: x.id, coll: 'shipments', msg: `Consegna ${x.ddt || x.id}: ${nf(x.price)} €/t`, link: { drawer: ['customer', x.customerId] } })) }; } },
  { id: 'R19', area: 'amministrazione', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Consegne non fatturate dopo 31 giorni',
    check: (d, ctx) => {
      if (!(d.invoices || EMPTY).length) return { base: 0, fails: [] };
      const today = todayOf(d, ctx), first = (d.invoices || EMPTY).reduce((a, i) => (i.date < a ? i.date : a), '9999');
      const inv = new Set((d.invoices || EMPTY).flatMap(i => i.ddts || EMPTY));
      const s = (d.shipments || EMPTY).filter(x => x.date >= first.slice(0, 7) + '-01' && x.date < addDays(today, -31));
      return { base: s.length, fails: s.filter(x => !inv.has(x.id)).map(x => ({ id: x.id, coll: 'shipments', msg: `Consegna ${x.ddt || x.id} del ${dateIt(x.date)} non fatturata`, link: { area: 'finanza', tab: 'crediti' } })) };
    } },
  { id: 'R20', area: 'sistema', severity: 'attenzione', weight: 3, scope: ['all'], label: 'Ultimo backup esportato più di 7 giorni fa',
    check: (d, ctx, opts) => { if (opts.lastBackupAt === undefined) return { base: 0, fails: [] }; const today = todayOf(d, ctx); const at = opts.lastBackupAt ? String(opts.lastBackupAt).slice(0, 10) : null; return { base: 1, fails: !at || at < addDays(today, -7) ? [{ id: 'backup', coll: 'settings', msg: at ? `Ultimo backup del ${dateIt(at)}` : 'Nessun backup esportato', link: { area: 'dati', tab: 'archivio' } }] : [] }; } },
];
/** Tutte le regole: quelle di base più quelle dei pacchetti ESG. */
export const RULES = [...CORE_RULES, ...CLIMA_RULES, ...PCF_RULES, ...FILIERA_RULES, ...REPORT_RULES, ...PERSONE_RULES, ...GOVERNANCE_RULES, ...PIANO_RULES, ...RISCHI_RULES, ...AMBIENTE_RULES];
export const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));

/**
 * Esegue le regole (contratto). opts.scope 'all' | 'closing' | 'import'; opts.only: elenco di id; opts.lastBackupAt per R20 (preferenza del browser).
 * → {score, byArea: {area: punteggio}, rules: [{id, area, severity, weight, label, base, fails, failCount, rate, ok, points}]}
 */
export function runRules(d, ctx, opts = {}) {
  const scope = opts.scope || 'all';
  const rules = [];
  for (const r of RULES) {
    if (!r.scope.includes(scope) || (opts.only && !opts.only.includes(r.id))) continue;
    let res;
    try { res = r.check(d, ctx, opts); } catch (e) { res = { base: 0, fails: [], error: String(e?.message || e) }; }
    const n = res.fails.length, base = Math.max(res.base, n);
    const rate = base ? Math.min(1, n / base) : 0;
    const keep = r.severity === 'critico' ? (n ? 0 : 1) : 1 - rate;
    rules.push({ id: r.id, area: r.area, severity: r.severity, weight: r.weight, label: r.label, base, fails: res.fails, failCount: n, rate, ok: n === 0, points: base ? r.weight * keep : null, error: res.error || null });
  }
  const scored = rules.filter(r => r.points != null);
  const score = scored.length ? (100 * sum(scored, r => r.points)) / sum(scored, r => r.weight) : null;
  const byArea = {};
  for (const a of Object.keys(DQ_AREAS)) { const rs = scored.filter(r => r.area === a); if (rs.length) byArea[a] = (100 * sum(rs, r => r.points)) / sum(rs, r => r.weight); }
  return { score, byArea, rules };
}

/** Segnali della qualità dei dati: regole critiche con errori (e il backup, se la preferenza è nota). → Signal[] */
export function dqSignals(d, ctx) {
  const R = runRules(d, ctx, { lastBackupAt: ctx?.lastBackupAt });
  const out = [];
  for (const r of R.rules) {
    if (r.ok || (r.severity !== 'critico' && r.id !== 'R20')) continue;
    out.push({ key: `dq:${r.id}:${r.failCount}`, area: 'dati', roles: ['direzione', 'qualita'], severity: r.severity === 'critico' ? 'critico' : 'attenzione',
      title: `Dati da correggere: ${r.label.toLowerCase()} (${r.failCount})`,
      why: `${r.fails.slice(0, 3).map(f => f.msg).join('; ')}${r.failCount > 3 ? '…' : ''}. Finché restano, tracciabilità e bilancio di massa non sono affidabili.`,
      action: 'Aprire Dati › Qualità dei dati e correggere i record indicati.', impact: r.severity === 'critico' ? 2.2e5 : 6e4, link: { area: 'dati', tab: 'qualita', id: r.id } });
  }
  return out;
}

/** Sezione «Qualità dei dati» del report CdA. */
export function dqReportSection(d, ctx, P, C) {
  const R = runRules(d, ctx);
  if (R.score == null) return null;
  const bad = R.rules.filter(r => !r.ok).sort((a, b) => (a.severity === 'critico' ? -1 : 0) - (b.severity === 'critico' ? -1 : 0) || b.failCount - a.failCount);
  return {
    id: 'dati', title: 'Qualità dei dati', order: 90,
    kpis: [{ label: 'Punteggio della qualità dei dati', value: R.score, unit: '/100', decimals: 0 }, { label: 'Regole rispettate', value: R.rules.filter(r => r.ok).length, unit: `su ${R.rules.length}`, decimals: 0 }],
    table: { cols: [{ key: 'label', label: 'Regola', fmt: 'text' }, { key: 'failCount', label: 'Record da correggere', fmt: 'num' }, { key: 'severity', label: 'Gravità', fmt: 'text' }], rows: bad.map(r => ({ label: r.label, failCount: r.failCount, severity: r.severity })) },
    narrative: [bad.some(r => r.severity === 'critico') ? 'Ci sono errori critici di tracciabilità: i numeri del report vanno letti con cautela.' : 'Nessun errore critico di tracciabilità o di bilancio di massa.'],
  };
}
