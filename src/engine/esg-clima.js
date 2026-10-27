/* FeedOS 18 · Clima e GHG (pacchetto WP1 «clima»): inventario GHG per esercizio, registro dei fattori, F-gas, ponte delle
 * emissioni, esposizione ETS2, anno base. Contratto della fondazione 18 (07-contract §2 e §4): firme e nomi fissi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null · factor(d, id, year) · inventory(d, P)
 * · fgasDue(d, today).
 * Moduli: esg-clima-factors.js (registro dei fattori e impostazioni), esg-clima-inventory.js (Scope 1-2, inventario, F-gas, ETS2,
 * anno base, ponte), esg-clima-scope3.js (Scope 3 per categoria, FLAG, logistica).
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. Funzioni pure, senza orologio, eccezioni o console. */
import { esgToday, currentPeriod, previousPeriod, naceOf, sectorOf, SECTORS } from './esg-years.js';
import { fmtNum, deltaPhrase, listJoin, T } from './esg-nlg.js';
import { carbonPrice } from './esg-piano.js';
import { factor, num, climaSettings, gridFactorInUse, gplFactorInUse, newerGridFactor, climaPackInfo, factorRegistry, overrideOps, resetOps, fuelSpec, toNatural, refGwp, CLIMA_DEFAULTS, GRID_CHOICE_LABEL, FUEL_LABEL, USE_LABEL } from './esg-clima-factors.js';
import { inventory, fgasDue, ets2Exposure, baseYearCheck, baseYearStatus, baseSnapshotOf, ghgBridge, bridgeFor, comparableInv, windowOf, leakCheckMonths, netRevenue, BRIDGE_STEPS } from './esg-clima-inventory.js';
import { customerDistances, deliveryModeOf, haversineKm, plantLocation, profileFor, legsKgPerT, screeningOf, wasteFactorId } from './esg-clima-scope3.js';
import { PACK_CLIMA, CLIMA_FACTOR_GROUPS, SCOPE3_SCREENING } from '../data/pack-clima.js';
import { nf, dateIt, addMonths, addDays, median, daysBetween, daysInMonth, monthLabel } from '../core/util.js';

// funzioni condivise (contratto §4) e quelle che servono alla pagina
export { factor, inventory, fgasDue };
export { climaSettings, gridFactorInUse, gplFactorInUse, newerGridFactor, climaPackInfo, factorRegistry, overrideOps, resetOps, fuelSpec, toNatural, refGwp, CLIMA_DEFAULTS, GRID_CHOICE_LABEL, FUEL_LABEL, USE_LABEL };
export { ets2Exposure, baseYearCheck, baseYearStatus, baseSnapshotOf, ghgBridge, bridgeFor, comparableInv, windowOf, leakCheckMonths, netRevenue, BRIDGE_STEPS };
export { customerDistances, deliveryModeOf, haversineKm, plantLocation, profileFor, legsKgPerT, screeningOf, wasteFactorId };
export { PACK_CLIMA, CLIMA_FACTOR_GROUPS, SCOPE3_SCREENING };

const EMPTY = [];
const LINK = id => ({ area: 'esg', tab: 'clima', ...(id ? { id } : {}) });
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch { return fb; } };
const r2 = v => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 100) / 100);
const tFmt = v => nf(v, Math.abs(v) < 10 ? 1 : 0);

/** Nota metodologica (italiano e inglese), paragrafi separati da una riga vuota. */
export const CLIMA_METHOD = {
  it: [
    'Inventario dei gas a effetto serra dell’esercizio secondo il GHG Protocol (Corporate Standard, Scope 2 Guidance, Scope 3 Standard), con la struttura della ISO 14064-1: confini, scope, esclusioni motivate, fattori con fonte, anno e stato, qualità dei dati e anno base. È una stima interna, non verificata da terzi.',
    'Confini e periodo: controllo operativo dello stabilimento; i mesi chiusi dell’esercizio scelto, con registri giornalieri e mensili letti sugli stessi mesi. Potenziali di riscaldamento IPCC AR6 a 100 anni.',
    'Scope 1: combustibili per mese, combustibile e uso (fatture, contatori, carte carburante) × fattori di CO₂ più CH₄ e N₂O di combustione; GPL dal registro dell’energia, salvo i mesi con righe di GPL nei consumi; refrigeranti con il metodo delle ricariche (kg reintegrati × GWP). La CO₂ di biocarburanti e biomassa è riportata a parte, fuori dagli scope. Senza consumi registrati si usa il questionario, con qualità «stimato».',
    'Scope 2: location-based con il fattore della rete nazionale (ISPRA) sui kWh prelevati; market-based con garanzie d’origine e PPA dedotti e il mix residuo sul resto. Senza un mix residuo verificato il market-based resta «non calcolato». Il fotovoltaico autoconsumato vale zero in entrambi i metodi.',
    'Scope 3: categoria 1 sulle tonnellate acquistate (lotti ricevuti, esclusi i respinti) × fattore della materia prima, più imballaggi e materiali di consumo; quota FLAG (cambio d’uso del suolo e gestione del suolo) dalle componenti dei fattori o, in mancanza, da una stima per categoria dichiarata come tale; categorie 3, 4, 5, 9 e 12 da combustibili, profili logistici, consegne, rifiuti e imballaggi. Ogni categoria esclusa riporta la motivazione; le emissioni enteriche degli animali (categoria 11) restano fuori dal totale.',
    'Intensità: Scope 1 + 2 per tonnellata prodotta e per milione di euro di ricavi netti del conto economico. Anno base: si ricalcola quando cambi strutturali, di metodo o correzioni spostano il totale di almeno la soglia scelta (di base 5%). Nessuna compensazione o credito è sottratto dalle emissioni.',
  ].join('\n\n'),
  en: [
    'Greenhouse gas inventory for the reporting period following the GHG Protocol (Corporate Standard, Scope 2 Guidance, Scope 3 Standard) with the ISO 14064-1 structure: boundaries, scopes, justified exclusions, factors with source, year and status, data quality and base year. It is an internal estimate, not verified by a third party.',
    'Boundaries and period: operational control of the site; the closed months of the selected period, with daily and monthly registers read over the same months. IPCC AR6 100-year global warming potentials.',
    'Scope 1: fuels by month, fuel and use (invoices, meters, fuel cards) × CO₂ factors plus combustion CH₄ and N₂O; LPG from the energy register except in months with LPG rows in the fuel log; refrigerants with the refill method (kg topped up × GWP). CO₂ from biofuels and biomass is reported separately, outside the scopes. Without recorded fuel use the ESG questionnaire is used, flagged as estimated.',
    'Scope 2: location-based with the national grid factor (ISPRA) on the kWh drawn from the grid; market-based with guarantees of origin and PPAs deducted and the residual mix applied to the rest. Without a verified residual mix the market-based figure stays «not calculated». Self-consumed solar power counts as zero in both methods.',
    'Scope 3: category 1 on purchased tonnes (lots received, rejected lots excluded) × raw-material factor, plus packaging and consumables; FLAG share (land-use change and land management) from factor components or, where missing, from a declared category-based estimate; categories 3, 4, 5, 9 and 12 from fuels, logistics profiles, deliveries, waste and packaging. Each excluded category carries its justification; enteric emissions of the animals fed (category 11) stay outside the total.',
    'Intensity: Scope 1 + 2 per tonne produced and per million euro of net revenue from the income statement. Base year: recalculated when structural or method changes or corrections move the total by at least the chosen threshold (5% by default). No offsets or credits are deducted from emissions.',
  ].join('\n\n'),
};

/* ---------------- qualità dei dati per i datapoint ---------------- */
const worstQ = lines => {
  const ok = lines.filter(l => !l.excluded && l.tco2e > 0);
  if (!ok.length) return 'mancante';
  const w = {}; for (const l of ok) w[l.quality] = (w[l.quality] || 0) + l.tco2e;
  return Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
};
const sharePct = (v, t) => (t > 0 && v != null ? v / t : null);

/* ---------------- elenco dei fattori usati (anche quelli delle impostazioni) ---------------- */
/** Fattori usati da un inventario: [{id, label, value, unit, source, year, status, overridden, kind, group}]. */
export function usedFactors(d, inv, P) {
  if (!inv?.usedFactors) return [];
  const out = [];
  const grid = gridFactorInUse(d, P || inv.period), gpl = gplFactorInUse(d);
  for (const id of inv.usedFactors) {
    let f = factor(d, id);
    if (!f && grid && grid.id === id) f = grid;
    if (!f && gpl && gpl.id === id) f = gpl;
    if (!f && id === 'gwp') continue;
    if (f) out.push({ id: f.id, label: f.label || id, value: f.value, unit: f.unit, source: f.source, year: f.year, status: f.status, overridden: !!f.overridden, kind: f.kind, group: f.group });
  }
  const ord = Object.fromEntries(CLIMA_FACTOR_GROUPS.map(([g], i) => [g, i]));
  return out.sort((a, b) => (ord[a.group] ?? 99) - (ord[b.group] ?? 99) || String(a.id).localeCompare(String(b.id)));
}

/* ---------------- testi automatici (ponte) ---------------- */
/** Frasi del ponte {sentence, drivers, perT, text} nella lingua (it | en). */
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monEn = ym => `${MON_EN[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
const perLabel = (P, L) => (!P ? '' : L === 'en' && P.from && P.to ? `${monEn(P.from.slice(0, 7))} – ${monEn(P.to.slice(0, 7))}` : P.label || '');
export function bridgeText(br, lang = 'it') {
  if (!br?.bridge) return null;
  const b = br.bridge, L = lang === 'en' ? 'en' : 'it';
  const pct = b.start > 0 ? (b.end - b.start) / b.start * 100 : null;
  const flat = pct != null && Math.abs(pct) < 0.5;
  const sentence = T('clima.bridge.sentence', { pa: perLabel(br.A?.period, L), pb: perLabel(br.B?.period, L), a: fmtNum(b.start, '', L, 0), b: fmtNum(b.end, '', L, 0),
    pct: pct == null ? T('na', {}, L) : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${fmtNum(Math.abs(pct), '%', L, 1)}`, judge: pct == null || flat ? '' : T(pct < 0 ? 'clima.bridge.better' : 'clima.bridge.worse', {}, L) }, L);
  const top = [...b.steps].filter(s => Math.abs(s.value) >= 0.5).sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 3);
  const sign = v => (v > 0 ? '+' : '−') + fmtNum(Math.abs(v), '', L, 0);
  const lbl = id => { const t = T('clima.bridge.' + id, {}, L); return L === 'it' ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
  const drivers = top.length && !flat ? T('clima.bridge.drivers', { list: listJoin(top.map(s => `${lbl(s.id)} ${sign(s.value)} t`), L) }, L) : T('clima.bridge.flat', {}, L);
  const perT = b.perT?.a != null && b.perT?.b != null ? T('clima.bridge.perT', { a: fmtNum(b.perT.a, '', L, 0), b: fmtNum(b.perT.b, '', L, 0) }, L) : '';
  return { sentence, drivers, perT, text: [sentence, drivers, perT].filter(Boolean).join(' ') };
}

/* ---------------- righe dell'inventario per CSV e JSON ---------------- */
const SCOPE_LABEL = { 1: 'Scope 1', 2: 'Scope 2', 3: 'Scope 3' };
const CAT_LABEL = { stazionaria: 'Combustione stazionaria', mobile: 'Combustione mobile', fuggitive: 'Emissioni fuggitive', lb: 'Elettricità (location-based)' };
/** Righe di calcolo dell'inventario (una per fonte): per il CSV di dettaglio e il JSON. */
export function inventoryRows(inv) {
  return (inv?.lines || EMPTY).map(l => ({
    scope: SCOPE_LABEL[l.scope] || '', category: l.scope === 3 ? `Cat. ${String(l.cat).slice(1)} · ${T('clima.cat.' + String(l.cat).slice(1))}` : CAT_LABEL[l.cat] || l.cat || '', label: l.label,
    activity: r2(l.activity), unit: l.unit || '', factor: l.factor?.value ?? null, factorUnit: l.factor?.unit || '', factorSource: l.factor?.source || '', factorYear: l.factor?.year ?? null, factorStatus: l.factor?.status || '',
    tco2e: r2(l.tco2e), biogenic: l.biogenic ? r2(l.biogenic) : null, quality: l.quality, included: l.excluded ? 'no' : 'sì', method: l.method || '', records: l.records ?? null,
  }));
}
/** Riepilogo per categoria (scope 1, 2 e le 15 categorie dello Scope 3) per tabella, CSV e report. */
export function categoryRows(inv) {
  if (!inv) return [];
  const tot = inv.totals.lb || 0;
  const q1 = g => worstQ(inv.scope1.lines.filter(l => l.group === g));
  const rows = [
    { id: 's1-stat', scope: 1, label: T('clima.stationary'), value: inv.scope1.stationary, quality: q1('stationary'), method: 'Combustibili × fattori di CO₂, CH₄ e N₂O', included: true },
    { id: 's1-mob', scope: 1, label: T('clima.mobile'), value: inv.scope1.mobile, quality: q1('mobile'), method: 'Gasolio e altri carburanti dei mezzi × fattori', included: true },
    { id: 's1-fug', scope: 1, label: T('clima.fugitive'), value: inv.scope1.fugitive, quality: q1('fugitive'), method: 'Ricariche di refrigerante × GWP AR6', included: true },
    { id: 's2-lb', scope: 2, label: T('clima.s2lb'), value: inv.s2.lb, quality: inv.s2.lb > 0 ? 'misurato' : 'mancante', method: 'kWh di rete × fattore della rete nazionale', included: true },
    { id: 's2-mb', scope: 2, label: T('clima.s2mb'), value: inv.s2.mb, quality: inv.s2.mb == null ? 'mancante' : inv.s2.efRm?.status === 'dimostrativo' ? 'stimato' : 'calcolato', method: inv.s2.reason || 'kWh di rete − garanzie d’origine e PPA, × mix residuo', included: false, info: true },
    ...inv.s3.cats.map(c => ({ id: c.id, scope: 3, n: c.n, label: `${c.n}. ${c.label}`, value: c.included ? c.value : null, computedValue: c.computedValue, quality: c.included ? c.quality || (c.computed ? 'stimato' : 'mancante') : null,
      method: c.included ? c.method || c.reason : c.reason, status: c.status, included: c.included })),
  ];
  return rows.map(r => ({ ...r, share: r.included && r.value != null ? sharePct(r.value, tot) : null }));
}
/** Inventario completo in JSON (per l'esportazione e per altri strumenti): nessun dato di formula o di ricetta. */
export function inventoryJson(d, P) {
  const inv = inventory(d, P);
  if (!inv) return null;
  const co = d?.settings?.company || {};
  const pack = climaPackInfo(d);
  return {
    schema: 'feedos.clima.inventario/1', generatedAt: esgToday(d), company: { name: co.name || '', site: co.site || '', nace: naceOf(d), sector: sectorOf(d) },
    period: { key: inv.period.key, label: inv.period.label, from: inv.window.from, to: inv.window.to, months: inv.window.months },
    method: { standard: 'GHG Protocol; struttura ISO 14064-1', boundary: inv.meta?.boundary, gwp: inv.meta?.gwp, factorPack: { version: pack.version, validAsOf: pack.validAsOf, origin: pack.origin }, verified: false },
    totals: { s1: r2(inv.s1), s2lb: r2(inv.s2.lb), s2mb: r2(inv.s2.mb), s2mbReason: inv.s2.reason, s3: r2(inv.s3.total), totalLb: r2(inv.totals.lb), totalMb: r2(inv.totals.mb), biogenicCO2: r2(inv.biogenicCO2), unit: 't CO₂e' },
    scope1: { stationary: r2(inv.scope1.stationary), mobile: r2(inv.scope1.mobile), fugitive: r2(inv.scope1.fugitive) },
    scope3: inv.s3.cats.map(c => ({ category: c.n, label: c.label, included: c.included, status: c.status, value: r2(c.value), computedValue: r2(c.computedValue), reason: c.reason })),
    flag: { flag: r2(inv.s3.flag), nonFlag: r2(inv.s3.nonFlag), luc: r2(inv.s3.luc), landManagement: r2(inv.s3.landMgmt), landHa: r2(inv.s3.landHa), method: inv.s3.flagMethod },
    energy: Object.fromEntries(Object.entries(inv.energy).map(([k, v]) => [k, r2(v)])), intensity: Object.fromEntries(Object.entries(inv.intensity).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])),
    quality: Object.fromEntries(['misurato', 'calcolato', 'stimato', 'default', 'mancante'].map(k => [k, r2(inv.quality[k])])),
    lines: inventoryRows(inv), factors: usedFactors(d, inv, P), disclaimer: T('disclaimer'),
  };
}

/* ---------------- rapporto dell'inventario in Markdown (IT/EN) ---------------- */
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** Rapporto dell'inventario (struttura ISO 14064-1) in Markdown, in italiano o in inglese. */
export function methodMarkdown(d, P, lang = 'it') {
  const L = lang === 'en' ? 'en' : 'it', t = (k, v) => T(k, v, L), f = (v, dec) => fmtNum(v, '', L, dec);
  const inv = inventory(d, P);
  const co = d?.settings?.company || {};
  const out = [`# ${t('clima.title')} · ${co.name || 'FeedOS'}`, '', `_${t('clima.subtitle')}_`, ''];
  if (!inv?.hasData) return [...out, t('nlg.notComparable'), '', `_${t('disclaimer')}_`].join('\n');
  const pack = climaPackInfo(d);
  out.push(`## 1. ${t('clima.md.org')}`, '',
    `- **${t('clima.md.company')}**: ${co.name || '—'}`, `- **${t('clima.md.site')}**: ${co.site || co.address || '—'}`,
    `- **${t('clima.md.nace')}**: ${naceOf(d)} (${SECTORS[sectorOf(d)]?.label || sectorOf(d)})`, `- **${t('clima.md.boundary')}**: ${t('clima.md.boundaryValue')}`,
    `- **${t('clima.md.period')}**: ${inv.period.label} (${dateIt(inv.window.from)} – ${dateIt(inv.window.to)})`, `- **${t('clima.md.standard')}**: ${t('clima.md.standardValue')}`, '');
  const tot = inv.totals.lb;
  const row = (label, v, q) => `| ${esc(label)} | ${v == null ? t('na') : f(v, 1)} | ${v == null || !tot ? '' : f(v / tot * 100, 1) + '%'} | ${q ? t('quality.' + q) : ''} |`;
  out.push(`## 2. ${t('clima.md.results')}`, '', `| ${t('clima.md.colScope')} | ${t('clima.md.colValue')} | ${t('clima.md.colShare')} | ${t('clima.md.colQuality')} |`, '|---|---:|---:|---|',
    row(t('clima.stationary'), inv.scope1.stationary, worstQ(inv.scope1.lines.filter(l => l.group === 'stationary'))),
    row(t('clima.mobile'), inv.scope1.mobile, worstQ(inv.scope1.lines.filter(l => l.group === 'mobile'))),
    row(t('clima.fugitive'), inv.scope1.fugitive, worstQ(inv.scope1.lines.filter(l => l.group === 'fugitive'))),
    row(`**${t('clima.s1')}**`, inv.s1, null), row(`**${t('clima.s2lb')}**`, inv.s2.lb, 'misurato'), row(`**${t('clima.s3')}**`, inv.s3.total, worstQ(inv.s3.lines)),
    row(`**${t('clima.total')}**`, tot, null), '',
    `- ${t('clima.s2mb')}: ${inv.s2.mb == null ? t('clima.mbMissing') : f(inv.s2.mb, 1) + ' t CO₂e'}`,
    `- ${t('clima.flag')}: ${f(inv.s3.flag, 1)} t CO₂e (${tot ? f(inv.s3.flag / tot * 100, 1) : '—'}%) · ${t('clima.land')}: ${f(inv.s3.landHa, 0)} ha`,
    `- ${t('clima.perT')}: ${f(inv.intensity.opsPerT, 1)} kg CO₂e/t · ${t('clima.totalPerT')}: ${f(inv.intensity.perT, 0)} kg CO₂e/t · ${t('clima.perMEur')}: ${f(inv.intensity.perMEurNet, 1)} t CO₂e/M€`, '');
  out.push(`## 3. ${t('clima.md.scope3')}`, '', `| # | ${t('clima.md.colScope')} | ${t('clima.md.colStatus')} | ${t('clima.md.colValue')} | ${t('clima.md.colReason')} |`, '|---:|---|---|---:|---|',
    ...inv.s3.cats.map(c => `| ${c.n} | ${esc(t('clima.cat.' + c.n))} | ${t('clima.status.' + c.status)} | ${c.included ? f(c.value, 1) : '—'} | ${esc(c.included ? c.method || c.reason : c.reason)} |`), '');
  const fl = usedFactors(d, inv, P);
  out.push(`## 4. ${t('clima.md.factors')}`, '', `| ${t('clima.md.colFactor')} | ${t('value')} | ${t('clima.md.colUnit')} | ${t('clima.md.colSource')} | ${t('clima.md.colYear')} | ${t('clima.md.colStatus')} |`, '|---|---:|---|---|---:|---|',
    ...fl.map(x => `| ${esc(x.label)} | ${f(x.value, Math.abs(x.value) < 1 ? 4 : 2)} | ${esc(x.unit)} | ${esc(x.source)} | ${x.year ?? '—'} | ${esc(x.status)}${x.overridden ? ' *' : ''} |`), '');
  out.push(`## 5. ${t('clima.md.quality')}`, '', t('clima.md.qualityText', { m: f((inv.quality.misurato + inv.quality.calcolato) * 100, 1) + '%', s: f(inv.quality.stimato * 100, 1) + '%', f: f(inv.quality.default * 100, 1) + '%' }), '');
  const by = baseYearStatus(d);
  out.push(`## 6. ${t('clima.md.base')}`, '', by.set ? t('clima.md.baseText', { base: by.period?.label || by.key, pct: climaSettings(d).recalcThresholdPct }) : t('clima.md.baseNone'), '');
  if (by.check?.reasons?.length) out.push(...by.check.reasons.map(r => `- ${r}`), '');
  out.push(`## 7. ${t('clima.md.biogenic')}`, '', t('clima.md.biogenicText', { v: f(inv.biogenicCO2, 1) }), '');
  const e = ets2Exposure(d, P);
  out.push(`## 8. ${t('clima.md.ets2', { year: e.start })}`, '', t('clima.md.ets2Text', { t: f(e.annualTCO2, 1), rows: e.rows.map(x => `${f(x.price, 0)} €/t → ${f(x.cost, 0)} €`).join('; ') }), '');
  out.push(`## 9. ${t('clima.md.method')}`, '', CLIMA_METHOD[L], '', '---', '', `_${t('disclaimer')}_`, '', `_${t('clima.md.issued', { date: dateIt(esgToday(d)), pack: pack.version })}_`, '');
  return out.join('\n');
}

/* ---------------- segnali di «Oggi» ---------------- */
/** Segnali del pacchetto (chiavi «clima:…»): controlli F-gas, consumi mancanti, fattori vecchi, market-based, anno base. */
export function climaSignals(d, ctx) {
  const out = [];
  if (!d) return out;
  const today = typeof ctx?.today === 'string' ? ctx.today : esgToday(d);
  const price = safe(() => carbonPrice(d), 80);
  // controlli delle perdite F-gas
  for (const x of safe(() => fgasDue(d, today), EMPTY)) {
    if (x.status !== 'scaduto' && x.status !== 'in scadenza') continue;
    const over = x.status === 'scaduto';
    out.push({ key: `clima:fgas-due:${x.equipmentId}:${x.due}`, area: 'esg', roles: ['produzione'], severity: over ? 'critico' : 'attenzione',
      title: over ? `Controllo F-gas scaduto: ${x.name}` : `Controllo F-gas ${x.daysLeft === 0 ? 'oggi' : `tra ${x.daysLeft} ${x.daysLeft === 1 ? 'giorno' : 'giorni'}`}: ${x.name}`,
      why: `${x.gas}, ${nf(x.chargeKg, 1)} kg pari a ${nf(x.chargeT, 1)} t CO₂e: ${x.followUp ? 'verifica della riparazione entro un mese dalla ricarica' : `controllo ogni ${x.months} mesi`}. Ultimo controllo ${x.lastCheck ? dateIt(x.lastCheck) : 'non registrato'}, scadenza ${dateIt(x.due)}.`,
      action: 'Programmare il controllo con un tecnico certificato, registrarlo nella scheda F-gas e comunicarlo alla Banca Dati FGAS.',
      impact: Math.round((x.chargeT || 0) * price), link: LINK('fgas') });
  }
  const P = safe(() => currentPeriod(d), null);
  const inv = P ? safe(() => inventory(d, P), null) : null;
  // consumi di combustibili mancanti negli ultimi mesi chiusi
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const fuel = Array.isArray(d.fuelUse) ? d.fuelUse : EMPTY;
  const tracked = fuel.some(r => r && String(r.month) >= addMonths(lastClosed, -12) && String(r.month) <= lastClosed);
  if (tracked) {
    const fm = new Set(fuel.map(r => String(r?.month || '').slice(0, 7)));
    const pm = new Set((d.runs || EMPTY).filter(r => r && num(r.tonnes) > 0).map(r => String(r.date).slice(0, 7)));
    const perMonth = inv?.hasData ? (inv.scope1.stationary + inv.scope1.mobile) / Math.max(1, inv.window.months.length) : 0;
    for (let i = 0; i < 3; i++) {
      const m = addMonths(lastClosed, -i);
      if (!pm.has(m) || fm.has(m)) continue;
      out.push({ key: `clima:fuel-missing:${m}`, area: 'esg', roles: ['produzione', 'direzione'], severity: 'attenzione', title: `Consumi di combustibili di ${monthLabel(m, false)} da registrare`,
        why: `Nel mese c’è stata produzione ma nessun consumo di gasolio, GPL o gas è registrato: lo Scope 1 del mese risulterebbe sottostimato${perMonth > 0 ? ` (in media ${nf(perMonth, 1)} t CO₂e al mese)` : ''}.`,
        action: 'Registrare le fatture del carburante e le letture dei contatori del mese (o importarle da CSV) nella scheda Clima › Combustibili.', impact: Math.round(1000 + perMonth * price), link: LINK('combustibili') });
    }
  }
  if (inv?.hasData) {
    // fattori annuali vecchi
    const ty = +today.slice(0, 4);
    const seen = new Set();
    for (const x of usedFactors(d, inv, P)) {
      if (x.kind !== 'annuale' || num(x.year) == null || ty - x.year <= 3 || seen.has(x.id)) continue;
      seen.add(x.id);
      out.push({ key: `clima:factor-stale:${x.id}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `Fattore di emissione del ${x.year} da aggiornare: ${x.label}`,
        why: `L’inventario usa ${nf(x.value, Math.abs(x.value) < 1 ? 4 : 2)} ${x.unit} (${x.source}, ${x.year}): più di tre anni rispetto al ${ty}.`, action: 'Aggiornare il pacchetto dei fattori o sostituire il valore nel registro dei fattori indicando fonte e anno.',
        impact: 500, link: LINK('fattori') });
    }
    // market-based non calcolato
    if (inv.s2.mb == null && inv.s2.kwhGrid > 0) out.push({ key: `clima:mb-missing:${P.key}`, area: 'esg', roles: ['direzione'], severity: 'info', title: 'Scope 2 market-based non calcolato',
      why: inv.s2.reason || 'Manca il mix residuo verificato.', action: 'Trascrivere nel registro dei fattori il mix residuo AIB dell’anno (con fonte e anno) o il dato del fornitore di energia, oppure registrare le garanzie d’origine nei contratti.',
      impact: 400, link: LINK('elettricita') });
  }
  const pk = safe(() => climaPackInfo(d, today), null);
  if (pk?.stale) out.push({ key: `clima:factor-stale:pacchetto-${pk.version}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `Pacchetto dei fattori clima valido al ${dateIt(pk.validAsOf)}: da aggiornare`,
    why: `Il pacchetto ${pk.version} ha più di sei mesi: fattori di rete, mix residuo e fattori annuali potrebbero avere valori più recenti.`, action: 'Importare il pacchetto aggiornato (file JSON) dal registro dei fattori: FeedOS mostra le differenze prima di applicarlo.', impact: 450, link: LINK('fattori') });
  // anno base da ricalcolare
  const by = safe(() => baseYearStatus(d), null);
  if (by?.check?.needed) out.push({ key: `clima:base-recalc:${by.key}`, area: 'esg', roles: ['direzione'], severity: 'attenzione', title: `Anno base da ricalcolare (${by.period?.label || by.key})`,
    why: by.check.reasons.join(' '), action: 'Verificare i cambiamenti, ricongelare l’anno base nella scheda Clima › Metodo e annotare il motivo del ricalcolo.', impact: 2500 + Math.round(Math.abs(by.check.delta || 0) * price), link: LINK('metodo') });
  return out;
}

/* ---------------- sezione del report CdA / Rapporto ESG ---------------- */
/** Sezione «Clima e GHG» (81): indicatori con confronto, categorie con metodo e qualità, frase del ponte. */
export function climaReportSection(d, ctx, P, C) {
  if (!d || !P?.from || !P?.to) return null;
  const inv = inventory(d, P);
  if (!inv?.hasData) return null;
  const cmpP = C && !C.budget && C.from && C.to ? C : null;
  const ci = cmpP ? inventory(d, cmpP) : null;
  const ok = comparableInv(ci);
  const cmp = (v, kind = 'flow') => (ok && v != null ? { value: v, kind, good: 'down', label: cmpP.label || 'confronto' } : undefined);
  const tot = inv.totals.lb;
  const flagShare = tot > 0 ? inv.s3.flag / tot : null;
  const kpis = [
    { label: 'Scope 1', value: r2(inv.s1), unit: 't CO₂e', decimals: 0, cmp: cmp(ci?.s1) },
    { label: 'Scope 2 location-based', value: r2(inv.s2.lb), unit: 't CO₂e', decimals: 0, cmp: cmp(ci?.s2?.lb) },
    { label: 'Scope 3', value: r2(inv.s3.total), unit: 't CO₂e', decimals: 0, cmp: cmp(ci?.s3?.total) },
    { label: 'Totale', value: r2(tot), unit: 't CO₂e', decimals: 0, cmp: cmp(ci?.totals?.lb) },
    { label: 'Scope 1 + 2 per tonnellata', value: r2(inv.intensity.opsPerT), unit: 'kg CO₂e/t', decimals: 1, cmp: cmp(ci?.intensity?.opsPerT, 'ratio') },
    { label: 'Quota FLAG', value: flagShare, unit: '%', decimals: 0, note: inv.s3.flagMethod === 'categoria' ? 'stima per categoria' : undefined },
  ];
  const rows = categoryRows(inv).filter(r => r.scope !== 3 || r.included || (r.computedValue > 0)).map(r => ({ voce: r.label, metodo: r.included === false && r.scope === 3 ? `Esclusa: ${r.method}` : r.method,
    value: r.value, share: r.share, qualita: r.quality ? T('quality.' + r.quality) : '—' }));
  const br = safe(() => bridgeFor(d, P, cmpP || previousPeriod(d, P.key) || null), null);
  const bt = br ? bridgeText(br, 'it') : null;
  const narrative = [];
  if (bt) narrative.push(bt.text + (br.mode === 'semestri' ? ' (confronto tra le due metà del periodo)' : ''));
  narrative.push(inv.s2.mb == null ? T('clima.mbMissing') : T('clima.report.narrMb', { v: fmtNum(inv.s2.mb, '', 'it', 0), lb: fmtNum(inv.s2.lb, '', 'it', 0) }));
  if (inv.s3.flag > 0) narrative.push(T('clima.report.narrFlag', { v: fmtNum(inv.s3.flag, '', 'it', 0), pct: fmtNum((flagShare || 0) * 100, '%', 'it', 0), method: T(inv.s3.flagMethod === 'componenti' ? 'clima.report.flagComp' : 'clima.report.flagCat') }));
  narrative.push(T('disclaimer'));
  return {
    id: 'esg-clima', title: 'Clima e GHG', order: 81, kpis,
    table: { cols: [{ key: 'voce', label: 'Voce', fmt: 'text' }, { key: 'metodo', label: 'Metodo', fmt: 'text' }, { key: 'value', label: 't CO₂e', align: 'r', fmt: 'num' }, { key: 'share', label: '% del totale', align: 'r', fmt: 'pct' }, { key: 'qualita', label: 'Qualità', fmt: 'text' }], rows },
    narrative,
  };
}

/* ---------------- indicatori del catalogo KPI ---------------- */
const invOf = (d, P) => { const i = inventory(d, P); return i && i.hasData ? i : null; };
export const CLIMA_KPIS = [
  { id: 'esg-s12', label: 'Emissioni Scope 1 + 2', unit: 't CO₂e', kind: 'flow', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'clima' }, decimals: 0, hist: true, src: 'energy',
    def: 'Scope 1 (combustibili, flotta, refrigeranti) + Scope 2 location-based sui mesi chiusi del periodo: registri di energia, combustibili e F-gas × fattori del registro dei fattori.',
    compute: (d, ctx, P) => { const i = invOf(d, P); return i && i.coverage.energyMonths > 0 ? i.s1 + i.s2.lb : null; } },
  { id: 'esg-s12-t', label: 'Scope 1 + 2 per tonnellata', unit: 'kg CO₂e/t', kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'clima' }, decimals: 1, hist: true, src: 'energy',
    def: '(Scope 1 + Scope 2 location-based) × 1.000 ÷ tonnellate prodotte negli stessi mesi chiusi.',
    compute: (d, ctx, P) => { const i = invOf(d, P); return i && i.coverage.energyMonths > 0 ? i.intensity.opsPerT : null; } },
  { id: 'esg-s3-t', label: 'Scope 3 per tonnellata', unit: 'kg CO₂e/t', kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'clima', id: 'scope3' }, decimals: 0, hist: false, src: 'ingLots',
    def: 'Scope 3 delle categorie incluse (materie prime acquistate, imballaggi, combustibili a monte, trasporti, rifiuti, fine vita) × 1.000 ÷ tonnellate prodotte.',
    compute: (d, ctx, P) => invOf(d, P)?.intensity?.s3PerT ?? null },
  { id: 'esg-flag-share', label: 'Quota FLAG delle emissioni', unit: '%', scale: 100, kind: 'ratio', dir: 'range', area: 'esg', link: { area: 'esg', tab: 'clima', id: 'scope3' }, decimals: 0, hist: false, src: 'ingLots',
    def: 'Emissioni FLAG delle materie prime (cambio d’uso del suolo e gestione del suolo) ÷ totale dell’inventario location-based; stima per categoria finché i fattori non hanno le componenti.',
    compute: (d, ctx, P) => { const i = invOf(d, P); return i && i.totals.lb > 0 && i.s3.flagMethod ? i.s3.flag / i.totals.lb : null; } },
  { id: 'esg-ren-el', label: 'Elettricità rinnovabile', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'clima', id: 'elettricita' }, decimals: 0, hist: true, src: 'energy',
    def: '(Fotovoltaico autoconsumato + garanzie d’origine + PPA rinnovabili) ÷ elettricità consumata (rete + autoconsumo), sui mesi chiusi.',
    compute: (d, ctx, P) => invOf(d, P)?.energy?.renElShare ?? null },
];

/* ---------------- regole della qualità dei dati (R21-R25) ---------------- */
const lastMonths = (today, n = 12) => { const last = addMonths(String(today).slice(0, 7), -1); return Array.from({ length: n }, (_, i) => addMonths(last, i - n + 1)); };
const prodByMonth = d => { const m = {}; for (const r of d.runs || EMPTY) { if (!r) continue; const k = String(r.date || '').slice(0, 7), t = num(r.tonnes) || 0; if (t > 0) m[k] = (m[k] || 0) + t; } return m; };
export const CLIMA_RULES = [
  { id: 'R21', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing'], label: 'Mese chiuso con produzione ma senza energia o combustibili',
    check: (d, ctx) => {
      const months = lastMonths(ctx?.today || esgToday(d)), prod = prodByMonth(d);
      const energy = new Set((d.energy || EMPTY).map(e => e?.month));
      const fuel = new Set((d.fuelUse || EMPTY).map(r => String(r?.month || '').slice(0, 7)));
      const tracked = months.some(m => fuel.has(m));
      const fails = [];
      let base = 0;
      for (const m of months) {
        if (!prod[m]) continue;
        base++;
        if (!energy.has(m)) fails.push({ id: m, coll: 'energy', msg: `${monthLabel(m, false)}: produzione registrata ma nessuna lettura dell’energia`, link: { area: 'esg', tab: 'energia' } });
        else if (tracked && !fuel.has(m)) fails.push({ id: m, coll: 'fuelUse', msg: `${monthLabel(m, false)}: produzione registrata ma nessun consumo di combustibili`, link: LINK('combustibili') });
      }
      return { base, fails };
    } },
  { id: 'R22', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'GPL registrato due volte (energia e consumi di combustibili)',
    check: d => {
      const gpl = new Set((d.fuelUse || EMPTY).filter(r => r && r.fuel === 'gpl').map(r => String(r.month || '').slice(0, 7)));
      const fails = [];
      for (const e of d.energy || EMPTY) if (e && gpl.has(e.month) && num(e.gplKg) > 0) fails.push({ id: e.id || e.month, coll: 'energy', msg: `${monthLabel(e.month, false)}: GPL sia nel registro dell’energia (${nf(e.gplKg)} kg) sia nei consumi di combustibili; l’inventario usa i consumi`, link: LINK('combustibili') });
      return { base: Math.max(gpl.size, fails.length), fails };
    } },
  { id: 'R23', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all'], label: 'Fattore di emissione senza fonte o anno',
    check: d => {
      const rows = factorRegistry(d).filter(r => r.overridden || r.custom);
      const fails = rows.filter(r => !String(r.source || '').trim() || r.year == null).map(r => ({ id: r.id, coll: 'factorOverrides', msg: `${r.label}: ${!String(r.source || '').trim() ? 'fonte mancante' : 'anno mancante'}`, link: LINK('fattori') }));
      return { base: rows.length, fails };
    } },
  { id: 'R24', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Apparecchiatura F-gas senza carica o gas',
    check: d => {
      const eqs = (d.fgasEquipment || EMPTY).filter(e => e && e.id);
      const fails = eqs.filter(e => num(e.chargeKg) == null || num(e.chargeKg) <= 0 || !e.gas || (e.gas === 'altro' && num(e.gwpOverride) == null) || !refGwp(d, e.gas, e.gwpOverride))
        .map(e => ({ id: e.id, coll: 'fgasEquipment', msg: `${e.name || e.id}: ${!e.gas ? 'gas refrigerante mancante' : num(e.chargeKg) > 0 ? 'GWP del gas non noto (indicarlo dalla targa)' : 'carica in kg mancante'}`, link: LINK('fgas') }));
      return { base: eqs.length, fails };
    } },
  { id: 'R25', area: 'esg', severity: 'info', weight: 2, scope: ['all'], label: 'Combustibili per tonnellata fuori dall’andamento (oltre 3,5 deviazioni robuste)',
    check: (d, ctx) => {
      const months = lastMonths(ctx?.today || esgToday(d)), prod = prodByMonth(d);
      // mesi con la produzione registrata per intero (il primo e l'ultimo mese del registro possono essere parziali)
      let first = null, last = null;
      for (const r of d.runs || EMPTY) { if (!r?.date) continue; if (!first || r.date < first) first = r.date; if (!last || r.date > last) last = r.date; }
      const full = m => first && m > first.slice(0, 7) && (m < last.slice(0, 7) || +last.slice(8, 10) >= daysInMonth(m) - 2);
      const byM = {};
      // MWh di combustibile per mese: GPL del registro dell'energia + righe dei consumi
      const gplM = new Set((d.fuelUse || EMPTY).filter(r => r?.fuel === 'gpl').map(r => String(r.month).slice(0, 7)));
      const ncvG = factor(d, 'gpl.ncv')?.value || 13.14;
      for (const e of d.energy || EMPTY) if (e && months.includes(e.month) && !gplM.has(e.month) && num(e.gplKg) > 0) byM[e.month] = (byM[e.month] || 0) + e.gplKg * ncvG / 1000;
      const specs = {};
      for (const r of d.fuelUse || EMPTY) {
        const m = String(r?.month || '').slice(0, 7);
        if (!months.includes(m)) continue;
        const sp = specs[r.fuel] || (specs[r.fuel] = fuelSpec(d, r.fuel));
        const nat = sp ? toNatural(sp, r.qty, r.unit) : null;
        if (nat > 0) byM[m] = (byM[m] || 0) + nat * (sp.ncv?.value || 0) / 1000;
      }
      const xs = months.filter(m => prod[m] > 0 && full(m) && byM[m] > 0).map(m => ({ m, v: byM[m] * 1000 / prod[m] }));
      if (xs.length < 6) return { base: xs.length, fails: [] };
      const med = median(xs.map(x => x.v)), mad = median(xs.map(x => Math.abs(x.v - med))) * 1.4826;
      const fails = mad > 0 ? xs.filter(x => Math.abs(x.v - med) / mad > 3.5).map(x => ({ id: x.m, coll: 'fuelUse', msg: `${monthLabel(x.m, false)}: ${nf(x.v, 1)} kWh di combustibile per t contro una mediana di ${nf(med, 1)}`, link: LINK('combustibili') })) : [];
      return { base: xs.length, fails };
    } },
];

/* ---------------- datapoint del VS (B3, C3) ---------------- */
/** Datapoint del pacchetto: B3 (energia, Scope 1, 2 LB e MB, intensità), Scope 3, CO₂ biogenica e dati dell'anno base per C3. */
export function climaDatapoints(d, P) {
  const inv = d && P ? inventory(d, P) : null;
  if (!inv?.hasData) return {};
  const prevP = P.key ? safe(() => previousPeriod(d, P.key), null) : null;
  const pi = prevP ? inventory(d, prevP) : null;
  const pv = fn => (comparableInv(pi) ? r2(fn(pi)) : undefined);
  const dp = (value, unit, quality, method, extra = {}) => {
    const o = { value: value == null ? null : typeof value === 'number' ? r2(value) : value, unit, quality: value == null && quality !== 'dichiarato' ? 'mancante' : quality, source: 'clima.inventory', method };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') o[k] = v;
    return o;
  };
  const q1 = inv.scope1.fromSurvey ? 'stimato' : inv.scope1.lines.some(l => l.quality === 'stimato') ? 'stimato' : 'misurato';
  const out = {
    'B3.s1': dp(inv.s1, 't CO₂e', q1, 'Combustibili × fattori (CO₂ + CH₄ e N₂O), ricariche di refrigerante × GWP AR6', { prev: pv(x => x.s1), note: inv.scope1.fromSurvey ? 'Consumi stimati dal questionario ESG' : undefined }),
    'B3.s2-lb': dp(inv.s2.lb, 't CO₂e', inv.s2.kwhGrid > 0 ? 'misurato' : 'mancante', `kWh di rete × ${nf(inv.meta?.grid?.value, 4)} kg CO₂/kWh (${inv.meta?.grid?.source || 'fattore di rete'})`, { prev: pv(x => x.s2.lb) }),
    'B3.s2-mb': dp(inv.s2.mb, 't CO₂e', inv.s2.efRm?.status === 'dimostrativo' ? 'stimato' : 'calcolato', '(kWh di rete − garanzie d’origine − PPA) × mix residuo', { note: inv.s2.reason || (inv.s2.efRm ? `Mix residuo ${nf(inv.s2.efRm.value, 4)} kg CO₂/kWh (${inv.s2.efRm.source})` : undefined), prev: pv(x => x.s2.mb) }),
    'B3.s3': dp(inv.s3.total, 't CO₂e', worstQ(inv.s3.lines), 'Categorie incluse dello Scope 3 (screening con motivazioni)', { prev: pv(x => x.s3.total) }),
    'B3.mwh': dp(inv.energy.mwh, 'MWh', 'misurato', 'Elettricità consumata (rete + fotovoltaico autoconsumato) + combustibili al potere calorifico inferiore', { prev: pv(x => x.energy.mwh) }),
    'B3.mwh-el': dp(inv.energy.mwhEl, 'MWh', 'misurato', 'Elettricità di rete + fotovoltaico autoconsumato'),
    'B3.mwh-ren-el': dp(inv.energy.mwhRenEl, 'MWh', 'misurato', 'Fotovoltaico autoconsumato + garanzie d’origine + PPA rinnovabili', { prev: pv(x => x.energy.mwhRenEl) }),
    'B3.mwh-fuel': dp(inv.energy.mwhFuel, 'MWh', q1, 'Combustibili al potere calorifico inferiore'),
    'B3.mwh-ren-fuel': dp(inv.energy.mwhRenFuel, 'MWh', q1, 'HVO, biomassa e biometano al potere calorifico inferiore'),
    'B3.intensity': dp(inv.intensity.perMEurNet, 't CO₂e/M€', inv.intensity.revenueNet > 0 ? 'calcolato' : 'mancante', '(Scope 1 + Scope 2 location-based) ÷ ricavi netti del conto economico in milioni di euro', { note: inv.intensity.revenueNet > 0 ? `Ricavi netti ${nf(inv.intensity.revenueNet / 1e6, 2)} M€ (${inv.intensity.revenueSource})` : 'Ricavi netti non disponibili', prev: pv(x => x.intensity.perMEurNet) }),
    'B3.intensity-t': dp(inv.intensity.opsPerT, 'kg CO₂e/t', 'calcolato', '(Scope 1 + Scope 2 location-based) × 1.000 ÷ tonnellate prodotte', { prev: pv(x => x.intensity.opsPerT) }),
    'B3.biogenic': dp(inv.biogenicCO2, 't CO₂', q1, 'CO₂ da biocarburanti e biomassa, riportata fuori dagli scope'),
  };
  const by = safe(() => baseYearStatus(d), null);
  if (by?.set && by.inv?.hasData) {
    const snap = by.snapshot;
    out['C3.base-year'] = { value: by.period?.label || by.key, unit: null, quality: 'dichiarato', source: 'clima.baseYear', method: 'Anno base scelto nella scheda Clima', note: snap ? `Fotografia congelata il ${dateIt(snap.at)}` : 'Anno base non ancora congelato' };
    out['C3.base-s12'] = dp(snap ? snap.totals.s1 + snap.totals.s2lb : by.inv.s1 + by.inv.s2.lb, 't CO₂e', 'calcolato', 'Scope 1 + Scope 2 location-based dell’anno base', { note: snap ? 'Valore congelato' : 'Valore ricalcolato con i dati di oggi' });
    out['C3.base-s3'] = dp(snap ? snap.totals.s3 : by.inv.s3.total, 't CO₂e', worstQ(by.inv.s3.lines), 'Scope 3 dell’anno base (categorie incluse)');
  }
  out['C3.s12'] = dp(inv.s1 + inv.s2.lb, 't CO₂e', q1, 'Scope 1 + Scope 2 location-based dell’esercizio');
  out['C3.s3'] = dp(inv.s3.total, 't CO₂e', worstQ(inv.s3.lines), 'Scope 3 dell’esercizio (categorie incluse)');
  return out;
}

/* ---------------- scadenze del calendario degli adempimenti ---------------- */
/** Scadenze: controlli delle perdite F-gas, comunicazioni alla Banca Dati FGAS, avvio dell'ETS2, aggiornamento del pacchetto. */
export function climaCalendarItems(d, today) {
  if (!d) return [];
  const t0 = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}/.test(today) ? today.slice(0, 10) : esgToday(d);
  const pk = climaPackInfo(d, t0);
  const out = [];
  for (const x of fgasDue(d, t0)) {
    if (!x.due || x.exempt) continue;
    out.push({ key: `clima:fgas:${x.equipmentId}:${x.due}`, date: x.due, title: `${x.followUp ? 'Verifica dopo la ricarica' : 'Controllo delle perdite'} · ${x.name} (${x.gas}, ${nf(x.chargeT, 1)} t CO₂e)`,
      area: 'esg', pkg: 'clima', kind: 'controllo', law: 'Reg. (UE) 2024/573, art. 5 (controlli delle perdite)', source: 'Regolamento (UE) 2024/573 sui gas fluorurati', validAsOf: pk.validAsOf, owner: 'Manutenzione', link: LINK('fgas') });
  }
  const eq = new Map((d.fgasEquipment || EMPTY).filter(e => e && e.id).map(e => [e.id, e]));
  for (const ev of d.fgasEvents || EMPTY) {
    if (!ev || !ev.id || ev.sentToFgasDb || typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(ev.date)) continue;
    const due = addDays(ev.date.slice(0, 10), 30);
    if (due < addDays(t0, -365)) continue;
    out.push({ key: `clima:fgasdb:${ev.id}`, date: due, title: `Comunicazione alla Banca Dati FGAS · ${ev.type} del ${dateIt(ev.date)} (${eq.get(ev.equipmentId)?.name || 'apparecchiatura'})`,
      area: 'esg', pkg: 'clima', kind: 'scadenza', law: 'DPR 146/2018, art. 16: entro 30 giorni dall’intervento (da verificare con il nuovo decreto attuativo)', source: 'Banca Dati FGAS (Camere di commercio)', validAsOf: pk.validAsOf, owner: 'Manutenzione', link: LINK('fgas') });
  }
  const s = climaSettings(d), y = num(s.ets2Start) || 2028;
  out.push({ key: `clima:ets2-avvio:${y}`, date: `${y}-01-01`, title: 'Avvio dell’ETS2: costo della CO₂ su gasolio, GPL e gas per stabilimento e flotta', area: 'esg', pkg: 'clima', kind: 'traguardo',
    law: 'Dir. (UE) 2023/959, avvio rinviato al 2028', source: 'Accordo UE sul clima 2040 (rinvio dell’ETS2)', validAsOf: pk.validAsOf, owner: 'Direzione', link: LINK('combustibili') });
  if (pk.validAsOf) out.push({ key: `clima:pacchetto:${pk.version}`, date: addMonths(pk.validAsOf, 6), title: `Aggiornare il pacchetto dei fattori clima (versione ${pk.version}, valido al ${dateIt(pk.validAsOf)})`, area: 'esg', pkg: 'clima', kind: 'rinnovo',
    source: 'FeedOS · pacchetto dei fattori clima', validAsOf: pk.validAsOf, owner: 'Direzione', link: LINK('fattori') });
  return out;
}

/* ---------------- riepilogo per la pagina e per il riquadro ---------------- */
/** Riepilogo dell'esercizio: totali, intensità, qualità, energia, F-gas, pacchetto, fattore di rete, anno base, ETS2. */
export function climaSummary(d, P) {
  if (!d || !P) return null;
  const inv = inventory(d, P);
  if (!inv) return null;
  const today = esgToday(d);
  const fg = safe(() => fgasDue(d, today), []);
  const by = safe(() => baseYearStatus(d), null);
  const grid = safe(() => gridFactorInUse(d, P), null);
  return {
    period: inv.period, hasData: inv.hasData, totals: inv.totals, s1: inv.s1, s2: { lb: inv.s2.lb, mb: inv.s2.mb, reason: inv.s2.reason }, s3: inv.s3.total,
    flag: inv.s3.flag, flagShare: inv.totals.lb > 0 ? inv.s3.flag / inv.totals.lb : null, flagMethod: inv.s3.flagMethod, landHa: inv.s3.landHa,
    intensity: inv.intensity, quality: { misurato: inv.quality.misurato, calcolato: inv.quality.calcolato, stimato: inv.quality.stimato, default: inv.quality.default, mancante: inv.quality.mancante }, energy: inv.energy,
    fgas: { equipment: fg.length, due: fg.filter(x => x.status === 'in scadenza').length, overdue: fg.filter(x => x.status === 'scaduto').length, next: fg.find(x => x.due && !x.exempt) || null },
    pack: safe(() => climaPackInfo(d, today), null), grid: grid ? { id: grid.id, value: grid.value, year: grid.year, source: grid.source, choice: grid.choice } : null, newerGrid: safe(() => newerGridFactor(d, grid), null),
    base: by ? { set: by.set, key: by.key, frozen: by.frozen, needed: !!by.check?.needed } : null, ets2: safe(() => ets2Exposure(d, P), null), warnings: inv.warnings,
  };
}
