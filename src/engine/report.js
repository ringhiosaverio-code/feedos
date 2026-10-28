/* FeedOS 17 · Report per il consiglio di amministrazione (pacchetto WP1).
 * Sezioni proprie della Direzione (sintesi, conto economico, scostamenti, budget) più le sezioni degli altri pacchetti
 * registrate in providers.js (REPORT_SECTIONS), in ordine; una sezione nulla si salta. Esportazione in Markdown e CSV.
 * Section = {id, title, order, kpis: [{label, value, unit, decimals, cmp?, status?}], table?: {cols, rows}, narrative: [testo]}. */
import { nf, sf, dateIt, monthsIn, endOfMonth, todayLocal, addMonths } from '../core/util.js';
import { pm, pmDec, PM_LABEL, fmtPm } from '../core/units.js';
import { toCSV } from '../core/io.js';
import { REPORT_SECTIONS, SIGNAL_PROVIDERS } from './providers.js';
import { pnlFor, compareLines, effectiveCoverage } from './pnl.js';
import { basis, pvm, narrative } from './pvm.js';
import { budgetTotals, budgetBasis, budgetVsActual, landing, activeVersion, hasBudget, budgetMonth } from './budget.js';
import { closingOf, closingRecord } from './closing.js';
import { runRules } from './dataquality.js';

const EMPTY = [];
const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);

/** Sezioni dei modelli di report, in ordine. */
export const REPORT_TEMPLATES = {
  cda: ['sintesi', 'conto', 'ponte', 'budget', 'kpi', 'agro-regolatorio', 'redditivita', 'commerciale', 'finanza', 'acquisti', 'produzione', 'esg-sintesi', 'dati'],
  commerciale: ['sintesi', 'conto', 'redditivita', 'commerciale'],
  operations: ['sintesi', 'kpi', 'acquisti', 'produzione', 'dati'],
  esg: ['esg-sintesi', 'esg-clima', 'esg-impronta', 'esg-filiera', 'esg-ambiente', 'esg-persone', 'esg-governance', 'esg-piano', 'esg-rischi'],
};
export const TEMPLATE_LABELS = { cda: 'Consiglio di amministrazione', commerciale: 'Commerciale', operations: 'Operations', esg: 'Rapporto ESG' };
export const SECTION_TITLES = {
  sintesi: 'Sintesi', conto: 'Conto economico', ponte: 'Scostamenti del margine', budget: 'Budget e stima di chiusura',
  kpi: 'Indicatori', redditivita: 'Redditività', commerciale: 'Commerciale', finanza: 'Finanza', acquisti: 'Acquisti', produzione: 'Produzione', dati: 'Qualità dei dati',
  'esg-sintesi': 'Sintesi ESG', 'esg-clima': 'Clima e GHG', 'esg-impronta': 'Impronta dei mangimi', 'esg-filiera': 'EUDR e fornitori', 'esg-ambiente': 'Registri ambientali',
  'agro-regolatorio': 'Regolatorio',
  'esg-persone': 'Persone e sicurezza', 'esg-governance': 'Governance ed evidenze', 'esg-piano': 'Obiettivi e piano', 'esg-rischi': 'Rischi climatici',
};

/** Copertura dei dati del confronto: il minimo tra periodo e confronto (budget: quota del periodo coperta dal budget). */
function pairCoverage(d, ctx, P, C) {
  if (!C) return 1;
  const cP = effectiveCoverage(d, ctx, P) ?? 1;
  const cC = C.budget ? (budgetTotals(d, P, activeVersion(d, +P.to.slice(0, 4)))?.coverage ?? 0) : effectiveCoverage(d, ctx, C) ?? 1;
  return Math.min(cP, cC);
}

const vsText = C => (!C ? 'senza confronto' : C.budget ? 'sul budget' : C.compare === 'ap' ? 'sull’anno prima'
  : C.months?.length === 1 && C.from?.slice(8) === '01' && C.to === endOfMonth(C.to) ? 'sul mese prima' : 'sul periodo prima');

/** Basi del ponte per P e per il confronto C (budget o periodo). */
export function bridgeFor(d, ctx, P, C, { level = 'mc2', by = 'productId' } = {}) {
  if (!C) return null;
  const B = basis(d, ctx, P, by);
  const A = C.budget ? budgetBasis(d, P, activeVersion(d, +P.to.slice(0, 4)), by === 'species' ? 'species' : 'productId') : basis(d, ctx, C, by);
  return pvm(A, B, { level });
}

/** Pnl di confronto: budget del periodo o periodo C. */
export function comparePnl(d, ctx, P, C) {
  if (!C) return null;
  if (C.budget) return budgetTotals(d, P, activeVersion(d, +P.to.slice(0, 4)))?.pnl || null;
  return pnlFor(d, ctx, C);
}

const SEV_LABEL = { critico: 'Critico', attenzione: 'Attenzione', info: 'Informazione' };
const AREA_LABEL = { oggi: 'Oggi', direzione: 'Direzione', finanza: 'Finanza', gemello: 'Gemello', formulazione: 'Formulazione', acquisti: 'Acquisti', produzione: 'Produzione', qualita: 'Qualità', commerciale: 'Commerciale', economia: 'Economia', esg: 'ESG', dati: 'Dati' };

function sintesi(d, ctx, P, C, cur, cmp, signals) {
  const by = cur.by, cb = cmp?.by;
  const cov = pairCoverage(d, ctx, P, C);
  const k = (label, value, unit, decimals, cv, kind = 'flow', good = 'up', scale = 1) => ({ label, value, unit, decimals, cmp: cv == null ? null : { value: cv, kind, good, scale, cov, label: C?.short || (C?.budget ? 'budget' : '') } });
  const year = +P.to.slice(0, 4);
  const kpis = [
    k('Ricavi netti', by.ricaviNetti, '€', 0, cb?.ricaviNetti),
    k('Margine di contribuzione', cur.tonnes > 0 ? pm(by.mdc2 / cur.tonnes) : null, PM_LABEL, pmDec(2), cmp && cmp.tonnes > 0 ? pm(cb.mdc2 / cmp.tonnes) : null, 'ratio'),
    k('EBITDA', cur.revenueNet ? by.ebitda / cur.revenueNet : null, '%', 1, cmp?.revenueNet ? cb.ebitda / cmp.revenueNet : null, 'ratio', 'up', 100),
    k('EBIT', by.ebit, '€', 0, cb?.ebit),
  ];
  const narr = [];
  if (hasBudget(d, year)) {
    const L = landing(d, ctx, year);
    kpis.push({ label: `Stima di chiusura ${year}`, value: L.landing, unit: '€', decimals: 0, cmp: L.budgetEbit == null ? null : { value: L.budgetEbit, kind: 'flow', good: 'up', label: 'budget' },
      status: L.budgetEbit == null ? null : L.landing >= L.budgetEbit ? 'ok' : L.landing >= L.budgetEbit * 0.9 ? 'warn' : 'bad', note: `P10–P90 approssimata ${nf(L.p10 / 1000)}–${nf(L.p90 / 1000)} k€` });
  }
  const br = bridgeFor(d, ctx, P, C);
  if (br && cov >= 0.9) narr.push(...narrative(br, d.settings?.finance?.materiality, { vs: vsText(C) }));
  else if (C && cov < 0.9) narr.push('Uno dei due periodi non ha dati completi (per esempio il primo mese, parziale): gli scostamenti non sono confrontabili.');
  // decisioni principali: segnali già calcolati (opts.signals) o i fornitori dei pacchetti; per gravità e impatto
  let sig = signals;
  if (!sig) { sig = []; for (const p of SIGNAL_PROVIDERS) { try { for (const s of p(d, ctx) || EMPTY) sig.push(s); } catch { /* fornitore isolato */ } } }
  const SEV = { critico: 3, attenzione: 2, info: 1 };
  const top = [...sig].sort((a, b) => (SEV[b.severity] || 0) - (SEV[a.severity] || 0) || n0(b.impact) - n0(a.impact)).slice(0, 5);
  return { id: 'sintesi', title: SECTION_TITLES.sintesi, order: 0, kpis, narrative: narr,
    table: top.length ? { cols: [{ key: 'severity', label: 'Livello', fmt: 'text' }, { key: 'title', label: 'Decisione', fmt: 'text' }, { key: 'area', label: 'Area', fmt: 'text' }],
      rows: top.map(s => ({ severity: SEV_LABEL[s.severity] || s.severity, title: s.title, area: AREA_LABEL[s.area] || s.area })) } : null };
}

function conto(d, ctx, P, C, cur, cmp) {
  const rows = compareLines(cur, cmp).map(l => ({ voce: l.label, total: l.total, value: l.value, perT: pm(l.perT), pctRev: l.pctRev, cmp: l.cmp, delta: l.delta, deltaPct: l.deltaPct }));
  const cols = [{ key: 'voce', label: 'Voce', fmt: 'text' }, { key: 'value', label: '€', align: 'r', fmt: 'eur' }, { key: 'perT', label: PM_LABEL, align: 'r', fmt: 'num2' }, { key: 'pctRev', label: '% ricavi', align: 'r', fmt: 'pct' }];
  if (cmp) cols.push({ key: 'cmp', label: C?.budget ? 'Budget' : 'Confronto', align: 'r', fmt: 'eur' }, { key: 'delta', label: 'Δ', align: 'r', fmt: 'eurs' }, { key: 'deltaPct', label: 'Δ%', align: 'r', fmt: 'pcts' });
  const narr = [`Volumi ${nf(cur.tonnes)} t · ricavi netti ${nf(cur.revenueNet / 1e6, 2)} M€ · MdC II ${fmtPm(cur.tonnes ? cur.by.mdc2 / cur.tonnes : null, 1)} · EBIT ${nf(cur.by.ebit / 1000, 1)} k€.`];
  if (cur.estimatedMonths?.length) narr.push(`Costi fissi stimati (budget o media) per ${cur.estimatedMonths.join(', ')}.`);
  if (cur.frozen) narr.push('Numeri congelati alla chiusura del mese.');
  return { id: 'conto', title: SECTION_TITLES.conto, order: 20, kpis: [], table: { cols, rows }, narrative: narr };
}

function ponte(d, ctx, P, C) {
  if (!C) return null;
  const br = bridgeFor(d, ctx, P, C);
  if (!br) return null;
  const cov = pairCoverage(d, ctx, P, C);
  const rows = [{ voce: C.budget ? 'Budget' : `Partenza (${C.short || 'confronto'})`, value: br.start, kind: 'total' }, ...br.steps.filter(s => Math.abs(s.value) >= 0.5).map(s => ({ voce: s.label, value: s.value, kind: 'step' })), { voce: `Arrivo (${P.short || 'periodo'})`, value: br.end, kind: 'total' }];
  return { id: 'ponte', title: SECTION_TITLES.ponte, order: 25, kpis: [
    { label: 'Margine di partenza', value: br.start, unit: '€', decimals: 0 }, { label: 'Margine di arrivo', value: br.end, unit: '€', decimals: 0 }, { label: 'Differenza', value: br.end - br.start, unit: '€', decimals: 0 },
  ], table: { cols: [{ key: 'voce', label: 'Effetto', fmt: 'text' }, { key: 'value', label: '€', align: 'r', fmt: 'eur', fmtOf: r => (r.kind === 'step' ? 'eurs' : 'eur') }], rows },
  narrative: cov < 0.9 ? ['Uno dei due periodi ha dati incompleti: non confrontabile.'] : narrative(br, d.settings?.finance?.materiality, { vs: vsText(C) }), steps: br.steps, start: br.start, end: br.end, check: br.check };
}

function budgetSec(d, ctx, P) {
  const year = +P.to.slice(0, 4);
  const ver = activeVersion(d, year);
  if (!hasBudget(d, year, ver)) return { id: 'budget', title: SECTION_TITLES.budget, order: 30, kpis: [], narrative: [`Nessun budget ${year}.`] };
  const months = monthsIn(P);
  const lastM = months[months.length - 1];
  const bva = budgetVsActual(d, ctx, year, ver);
  const mRow = bva.months.find(x => x.month === lastM);
  const L = landing(d, ctx, year, ver);
  const f = (label, key, act, bud) => ({ voce: label, mese: act?.[key] ?? null, budgetMese: bud?.[key] ?? null, ytd: bva.ytd.act[key], budgetYtd: bva.ytd.bud[key] });
  const rows = [['Tonnellate', 'tonnes'], ['Ricavi netti', 'revenue'], ['MdC II', 'mc2'], ['Costi fissi', 'fixed'], ['EBIT', 'ebit']].map(([l, k]) => f(l, k, mRow?.act, mRow?.bud));
  return { id: 'budget', title: SECTION_TITLES.budget, order: 30, kpis: [
    { label: 'EBIT da inizio anno', value: bva.ytd.act.ebit, unit: '€', decimals: 0, cmp: { value: bva.ytd.bud.ebit, kind: 'flow', good: 'up', label: 'budget' } },
    { label: `Stima di chiusura ${year}`, value: L.landing, unit: '€', decimals: 0, cmp: L.budgetEbit == null ? null : { value: L.budgetEbit, kind: 'flow', good: 'up', label: 'budget' } },
    { label: 'Gap al mese', value: L.gapPerMonth, unit: '€', decimals: 0 },
  ], table: { cols: [{ key: 'voce', label: 'Voce', fmt: 'text' }, { key: 'mese', label: 'Mese', align: 'r', fmt: 'num' }, { key: 'budgetMese', label: 'Budget mese', align: 'r', fmt: 'num' }, { key: 'ytd', label: 'Da inizio anno', align: 'r', fmt: 'num' }, { key: 'budgetYtd', label: 'Budget da inizio anno', align: 'r', fmt: 'num' }], rows },
  narrative: [`Versione ${ver}. Stima di chiusura ${nf(L.landing / 1000)} k€ (banda approssimata ${nf(L.p10 / 1000)}–${nf(L.p90 / 1000)} k€)${L.budgetEbit != null ? ` contro ${nf(L.budgetEbit / 1000)} k€ di budget` : ''}.`] };
}

/**
 * Report del periodo P con confronto C secondo il modello (cda, commerciale, operations, esg).
 * opts.comments: commenti per sezione · opts.signals: segnali già calcolati (derived.signals), altrimenti i fornitori dei pacchetti.
 * → {header: {company, periodLabel, compareLabel, issuedAt, closed, dqScore, template}, sections: [Section]}
 */
export function buildReport(d, ctx, P, C, templateId = 'cda', { comments = {}, signals = null } = {}) {
  const ids = REPORT_TEMPLATES[templateId] || REPORT_TEMPLATES.cda;
  const cur = pnlFor(d, ctx, P);
  const cmp = comparePnl(d, ctx, P, C);
  let dqScore = null;
  try { dqScore = runRules(d, ctx, { scope: 'all' })?.score ?? null; } catch { /* motore assente */ }
  const months = monthsIn(P);
  const closed = P.from.slice(8) === '01' && P.to === endOfMonth(P.to) && months.every(m => !!closingOf(d, m));
  const own = { sintesi: () => sintesi(d, ctx, P, C, cur, cmp, signals), conto: () => conto(d, ctx, P, C, cur, cmp), ponte: () => ponte(d, ctx, P, C), budget: () => budgetSec(d, ctx, P) };
  const ext = Object.fromEntries(REPORT_SECTIONS.map(s => [s.id, s]));
  const sections = [], failed = [];
  for (const id of ids) {
    let s = null;
    // una sezione che si interrompe si salta (e si segnala nell'intestazione), le altre restano
    try { s = own[id] ? own[id]() : ext[id]?.build ? ext[id].build(d, ctx, P, C) : null; } catch (e) { s = null; failed.push({ id, title: SECTION_TITLES[id] || id, error: String(e?.message || e) }); }
    if (!s) continue;
    sections.push({ ...normSection(s, id), comment: comments?.[id] || '' });
  }
  return {
    header: { company: d.settings?.company?.name || 'FeedOS', site: d.settings?.company?.site || '', periodLabel: P.label || `${dateIt(P.from)} – ${dateIt(P.to)}`, compareLabel: !C ? null : C.budget ? 'Budget' : C.label || '',
      issuedAt: ctx?.today || todayLocal(), closed, dqScore, template: templateId, templateLabel: TEMPLATE_LABELS[templateId] || templateId, failed },
    sections,
  };
}

/**
 * Forma comune delle sezioni (anche di altri pacchetti): kpis come elenco, narrativa come elenco di frasi (anche da note),
 * colonne della tabella con chiave (o funzione value(row), come per toCSV).
 */
export function normSection(s, id) {
  const txt = x => (x == null || x === '' ? [] : Array.isArray(x) ? x.filter(t => t != null && t !== '').map(String) : [String(x)]);
  const kpis = (Array.isArray(s.kpis) ? s.kpis : []).filter(k => k && k.label != null);
  let table = null;
  if (s.table && Array.isArray(s.table.cols) && Array.isArray(s.table.rows)) {
    table = { ...s.table, cols: s.table.cols.filter(Boolean).map((c, i) => ({ ...c, key: c.key ?? `c${i}`, label: c.label ?? '' })) };
  }
  return { ...s, id: s.id || id, title: s.title || SECTION_TITLES[id] || id, kpis, table, narrative: [...txt(s.narrative), ...txt(s.note)] };
}
/** Valore di una cella: funzione value(row) della colonna, altrimenti row[key]. */
export const cellValue = (row, col) => (typeof col.value === 'function' ? col.value(row) : row?.[col.key]);
/** Testo di una cella: formato della colonna, o della riga (fmtOf) quando cambia riga per riga (totali e passi del ponte). */
export const cellText = (row, col) => fmtCell(cellValue(row, col), typeof col.fmtOf === 'function' ? col.fmtOf(row) : col.fmt);

/** Testo di una cella secondo il formato della colonna. */
export function fmtCell(v, fmt) {
  if (v == null || v === '') return '—';
  if (typeof v !== 'number') return String(v);
  switch (fmt) {
    case 'eur': return nf(v) + ' €';
    case 't': return nf(v, Math.abs(v) < 10 ? 1 : 0) + ' t';
    case 'pct': return nf(v * 100, 1) + '%';
    case 'eurs': return sf(v, 0) + ' €'; // scostamenti con segno
    case 'pcts': return sf(v * 100, 1) + '%';
    case 'num2': return nf(v, 2);
    case 'num': return nf(v, Math.abs(v) < 10 ? 2 : 0);
    default: return nf(v, Math.abs(v) < 10 ? 2 : 0);
  }
}
/** Testo di un indicatore: valore, unità e scostamento. */
export function kpiText(k) {
  const scale = k.unit === '%' ? 100 : 1;
  // valore già formattato (sezioni di altri pacchetti): si riporta così com'è
  if (typeof k.value === 'string' && k.value.trim() && !Number.isFinite(+k.value)) return k.value + (k.unit && !k.value.includes(k.unit) ? ' ' + k.unit : '');
  const v = k.value == null || k.value === '' || !Number.isFinite(+k.value) ? '—' : nf(+k.value * scale, k.decimals ?? 0) + (k.unit ? (k.unit === '%' ? '%' : ' ' + k.unit) : '');
  if (!k.cmp || k.cmp.value == null || k.value == null || !Number.isFinite(+k.value) || !Number.isFinite(+k.cmp.value)) return v;
  const dv = +k.value - +k.cmp.value;
  const d = k.cmp.kind === 'ratio' ? sf(dv * scale, k.decimals ?? 1) + (k.unit === '%' ? ' pt' : k.unit ? ' ' + k.unit : '') : Math.abs(k.cmp.value) >= 0.5 ? sf(dv / Math.abs(k.cmp.value) * 100, 1) + '%' : sf(dv);
  return `${v} (${d}${k.cmp.label ? ' vs ' + k.cmp.label : ''})`;
}

/** Report in Markdown (tabelle con barre verticali). */
export function reportMarkdown(r) {
  const h = r.header, out = [];
  out.push(`# Report ${h.templateLabel ? h.templateLabel.toLowerCase() : 'CdA'} · ${h.company}`, '');
  out.push(`- Periodo: **${h.periodLabel}**${h.compareLabel ? ` · confronto: ${h.compareLabel}` : ''}`, `- Emesso il ${dateIt(h.issuedAt)}${h.closed ? ' · mese chiuso, numeri congelati' : ' · numeri provvisori'}`);
  if (h.dqScore != null) out.push(`- Qualità dei dati: ${nf(h.dqScore)}/100`);
  out.push('');
  for (const s of r.sections) {
    out.push(`## ${s.title}`, '');
    for (const k of s.kpis || EMPTY) out.push(`- **${k.label}**: ${kpiText(k)}${k.note ? ` · ${k.note}` : ''}`);
    if (s.kpis?.length) out.push('');
    if (s.table?.rows?.length) {
      const cols = s.table.cols;
      out.push('| ' + cols.map(c => c.label).join(' | ') + ' |', '| ' + cols.map(c => (c.align === 'r' ? '---:' : '---')).join(' | ') + ' |');
      for (const row of s.table.rows) out.push('| ' + cols.map(c => String(cellText(row, c)).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |');
      out.push('');
    }
    for (const t of s.narrative || EMPTY) out.push(t);
    if (s.narrative?.length) out.push('');
    if (s.comment) out.push(`> ${String(s.comment).replace(/\n/g, '\n> ')}`, '');
  }
  return out.join('\n');
}

/** Report in CSV: una tabella per sezione (toCSV), separate da una riga vuota e dal titolo della sezione. */
export function reportCsv(r) {
  const parts = [];
  for (const s of r.sections) {
    const rows = [...(s.kpis || EMPTY).map(k => ({ a: k.label, b: k.value, c: k.cmp?.value ?? null, d: k.unit || '' }))];
    if (rows.length) parts.push(toCSV(rows, [{ label: `${s.title} · indicatore`, value: x => x.a }, { label: 'Valore', value: x => (typeof x.b === 'number' ? Math.round(x.b * 1e4) / 1e4 : x.b) }, { label: 'Confronto', value: x => (typeof x.c === 'number' ? Math.round(x.c * 1e4) / 1e4 : x.c) }, { label: 'Unità', value: x => x.d }]));
    const num4 = v => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
    if (s.table?.rows?.length) parts.push(toCSV(s.table.rows, s.table.cols.map((c, i) => ({ label: i === 0 ? `${s.title} · ${c.label}` : `${c.label}`, value: row => num4(cellValue(row, c)) }))));
  }
  const strip = t => t.replace(/^﻿/, '');
  const h = r.header;
  // intestazione anch'essa attraverso toCSV (separatori e formule neutralizzati)
  const head = toCSV([h], [{ label: 'Azienda', value: x => x.company }, { label: 'Periodo', value: x => x.periodLabel }, { label: 'Confronto', value: x => x.compareLabel || '' }, { label: 'Emesso il', value: x => dateIt(x.issuedAt) }]);
  return '﻿' + [head, ...parts].map(strip).join('\r\n\r\n');
}

/** Commenti salvati nella chiusura del mese (anche aperta). */
export function reportComments(d, month) { return closingRecord(d, month)?.comments || {}; }
/** Operazione che salva il commento di una sezione nella chiusura del mese (la crea «aperta» se non c'è). */
export function commentOps(d, month, sectionId, text) {
  const old = closingRecord(d, month);
  const comments = { ...(old?.comments || {}), [sectionId]: String(text || '') };
  return [{ kind: 'upsertMany', coll: 'closings', objs: [old ? { id: old.id, comments } : { id: month, month, status: 'aperto', comments }] }];
}
/** Mese da proporre nel report: l'ultimo chiuso, altrimenti il mese prima di oggi. */
export function defaultReportMonth(d, today) {
  const ct = d.settings?.closedThrough;
  return ct ? String(ct).slice(0, 7) : addMonths(String(today).slice(0, 7), -1);
}
export { budgetMonth };
