/* FeedOS 18 · Impronta mangimi e formulazione a basso carbonio (pacchetto WP2 «pcf», scheda «passaporto»).
 * Contratto della fondazione 18 (07-contract §2 e §4): segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null
 * · datapoint (d, P) → {dpId: Datapoint} · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto | null
 * · PCF_KPIS, PCF_RULES, PCF_METHOD · funzioni per gli altri pacchetti: ingredientEf(d, ingId, opts), pcf(d, productId, opts),
 * packagingFactor(material), più packagingFor(d, prodotto) e landM2a(d, ingId) chieste dal pacchetto clima.
 * Moduli: esg-pcf-core.js (registro dei fattori, energia per linea, imballaggi, impronta, dichiarazioni, fotografie), esg-pcf-mc.js
 * (incertezza Monte Carlo), esg-pcf-formula.js (frontiera a basso carbonio e leve), esg-pcf-exchange.js (scheda Green Feed,
 * dichiarazioni ai clienti, PACT, MI5.7, CSV GFLI).
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. Funzioni pure, senza orologio, eccezioni o console.
 * Due edizioni: nell'edizione agrofarmaci la scheda è nascosta (META.hiddenTabs) → niente segnali, sezione, scadenze né regole;
 * restano i fattori per l'inventario del pacchetto clima e i gruppi di prodotti del VS (C1). */
import { nf, dateIt, addDays, addMonths, daysBetween, round, slug, sum } from '../core/util.js';
import { esgToday, currentPeriod, previousPeriod, periodByKey, sectorOf } from './esg-years.js';
import { T, fmtNum, listJoin, deltaPhrase } from './esg-nlg.js';
import {
  PCF_TAB, LINK, A, has, fin, num, isObj, inP, ISO, cached, pcfSettings, PCF_DEFAULTS, pcfPack, packInfo, packList, ingredientEf, pcf, packagingFactor, packagingFor, landM2a,
  millEnergy, weightedPcf, customerTotals, recalcAlerts, activeSnapshots, packagingSummary, isBulk, versionLines, originLabel, BOUNDARY_LABEL,
} from './esg-pcf-core.js';
import { productMacc, annualVolume } from './esg-pcf-formula.js';
import { CO_CLASSES } from '../data/pack-pcf.js';

// funzioni condivise (contratto §4) e quelle che servono alla pagina
export { ingredientEf, pcf, packagingFactor, packagingFor, landM2a, millEnergy, weightedPcf, customerTotals, recalcAlerts, packagingSummary, pcfSettings, PCF_DEFAULTS, pcfPack, PCF_TAB };

const pctTxt = (v, k = 0) => (v == null || !Number.isFinite(v) ? '—' : `${nf(v * 100, k)}%`);
const todayOf = (d, ctx) => (ctx && typeof ctx.today === 'string' && ISO.test(ctx.today) ? ctx.today : esgToday(d));
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch { return fb; } };
/** Il pacchetto è attivo per questo archivio? Scheda visibile nell'edizione e settore mangimi (l'impronta qui è quella dei mangimi). */
export const pcfOn = d => PCF_TAB && sectorOf(d) === 'mangimi';

/** Formule attive: quelle dei prodotti attivi (versione in vigore). → Map formulaId → {formula, products} */
function activeFormulas(d) {
  return cached('actf', [d?.formulas, d?.products], () => {
    const m = new Map();
    const fs = new Map(A(d?.formulas).filter(f => f && has(f.id)).map(f => [f.id, f]));
    for (const p of A(d?.products)) {
      if (!p || p.active === false || !fs.has(p.formulaId)) continue;
      const x = m.get(p.formulaId) || m.set(p.formulaId, { formula: fs.get(p.formulaId), products: [] }).get(p.formulaId);
      x.products.push(p);
    }
    return m;
  }, 2);
}
/** Materie prime usate nelle formule attive con il fattore che le risolve. → [{ingId, name, kgT (max kg/t), formulas, ef}] */
export function ingredientsInUse(d) {
  return cached('inuse', [d?.formulas, d?.products, d?.ingredients, d?.efIngredients, d?.supplierPcfs, d?.ingLots, d?.settings?.esg18?.packs?.pcf], () => {
    const m = new Map();
    for (const { formula } of activeFormulas(d).values()) for (const l of A(formula.lines)) {
      if (!l || !has(l.ing) || !(+l.kg > 0)) continue;
      const x = m.get(l.ing) || m.set(l.ing, { ingId: l.ing, kgT: 0, formulas: [] }).get(l.ing);
      x.kgT = Math.max(x.kgT, +l.kg); if (!x.formulas.includes(formula.id)) x.formulas.push(formula.id);
    }
    const ings = new Map(A(d?.ingredients).map(i => [i?.id, i]));
    return [...m.values()].map(x => ({ ...x, name: ings.get(x.ingId)?.name || x.ingId, ef: ingredientEf(d, x.ingId, {}) })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, 2);
}

/* ---------------- riepilogo per la pagina e il riquadro ---------------- */
/**
 * Riepilogo del portafoglio per l'esercizio P: impronta in vigore di ogni prodotto attivo (con banda P10-P90), produzione e
 * t CO₂e del periodo, media ponderata, fotografie e allarmi, registro dei fattori, imballaggi, dichiarazioni inviate.
 */
export function pcfSummary(d, P) {
  if (!d || !isObj(d)) return null;
  const PP = P && has(P.from) && has(P.to) ? P : currentPeriod(d);
  const today = esgToday(d);
  const w = safe(() => weightedPcf(d, PP), null);
  const snaps = activeSnapshots(d);
  const alerts = safe(() => recalcAlerts(d), []);
  const products = A(d.products).filter(p => p && has(p.id) && p.active !== false).map(p => {
    const r = safe(() => pcf(d, p.id, { P: PP }), null);
    const bp = w?.byProduct?.[p.id];
    return { productId: p.id, code: p.code || '', name: p.name || p.id, species: p.species || null, form: p.form || '', packaging: p.packaging || '', r,
      t: bp?.t || 0, tco2e: bp?.tco2e || 0, snapshot: snaps.find(s => s.productId === p.id) || null, alert: alerts.find(a => a.product.id === p.id) || null };
  }).filter(x => x.r);
  const inUse = ingredientsInUse(d);
  const sups = A(d.supplierPcfs).filter(s => s && fin(s.pcfExcl));
  const s = pcfSettings(d);
  const sent = A(s.sent).filter(x => x && x.periodKey === PP.key);
  const custT = new Map();
  for (const sh of A(d.shipments)) if (sh && inP(sh.date, PP) && fin(sh.tonnes)) custT.set(sh.customerId, (custT.get(sh.customerId) || 0) + +sh.tonnes);
  const top3 = [...products].sort((a, b) => b.tco2e - a.tco2e).slice(0, 3);
  return {
    period: { key: PP.key || null, from: PP.from, to: PP.to, label: PP.label || `${dateIt(PP.from)} – ${dateIt(PP.to)}`, short: PP.short || null }, today, products, weighted: w, top3,
    snapshots: { active: snaps.length, total: A(d.pcfSnapshots).length, outdated: alerts.length, alerts },
    registry: { rows: A(d.efIngredients).length, inUse: inUse.length, generic: inUse.filter(x => x.ef.source === 'anagrafica' || x.ef.source === 'mancante').length,
      supplier: inUse.filter(x => x.ef.source === 'fornitore').length, literature: inUse.filter(x => x.ef.source === 'letteratura').length,
      supplierPcfs: sups.length, validPcfs: sups.filter(x => (!has(x.periodStart) || x.periodStart <= today) && (!has(x.periodEnd) || x.periodEnd >= today)).length,
      expiredPcfs: sups.filter(x => has(x.periodEnd) && x.periodEnd < today).length, dbs: [...new Set(A(d.efIngredients).map(r => `${r?.db || '—'}${r?.dbVersion ? ' ' + r.dbVersion : ''}`))].sort() },
    packaging: safe(() => packagingSummary(d, PP), null),
    statements: { sent: sent.length, customers: custT.size, sentIds: sent.map(x => x.customerId) },
    designs: { total: A(d.lowCarbonDesigns).length, open: A(d.lowCarbonDesigns).filter(x => x && x.status === 'proposta').length },
    pack: packInfo(d), settings: s, energy: safe(() => millEnergy(d, PP), null),
  };
}

/* ---------------- segnali ---------------- */
/** Segnali di «Oggi»: fotografie da ricalcolare, fattori senza fonte, impronte dei fornitori scadute, imballaggi senza scheda. */
export function pcfSignals(d, ctx) {
  if (!d || !isObj(d) || !pcfOn(d) || !A(d.products).length) return [];
  const today = todayOf(d, ctx);
  const out = [];
  for (const a of safe(() => recalcAlerts(d), [])) {
    const s = a.snapshot, vol = annualVolume(d, a.product.id);
    out.push({ key: `pcf:recalc:${a.product.id}:${s.id}`, area: 'esg', roles: ['formulazione', 'commerciale'], severity: 'attenzione',
      title: `Impronta di ${a.product.name} da ricalcolare`,
      why: `Pubblicata il ${dateIt(s.publishedAt)} con ${nf(s.total)} kg CO₂e/t; nel frattempo: ${listJoin(a.reasons.map(r => r.text))}. Oggi il calcolo dà ${nf(a.current.total)} kg CO₂e/t (${a.delta >= 0 ? '+' : ''}${nf(a.delta)}). Le dichiarazioni ai clienti si basano sulla fotografia pubblicata.`,
      action: 'Controllare la scheda del prodotto e pubblicare la nuova impronta (ESG › Impronta mangimi), poi aggiornare le dichiarazioni ai clienti.',
      impact: Math.round(3000 + vol * Math.abs(a.delta) / 100), link: LINK(a.product.id) });
  }
  for (const x of ingredientsInUse(d)) {
    if (x.ef.source !== 'anagrafica' && x.ef.source !== 'mancante') continue;
    out.push({ key: `pcf:ef-generic:${x.ingId}`, area: 'esg', roles: ['formulazione'], severity: 'info', title: `Fattore di ${x.name} senza fonte`,
      why: x.ef.total == null ? `${x.name} entra in ${x.formulas.length} formule attive (fino a ${nf(x.kgT)} kg/t) ma non ha un fattore di emissione: l’impronta dei prodotti la conta zero.`
        : `${x.name} entra in ${x.formulas.length} formule attive (fino a ${nf(x.kgT)} kg/t) con ${nf(x.ef.total)} kg CO₂e/t presi dall’anagrafica, senza origine, banca dati né anno (qualità 5 su 5).`,
      action: 'Inserire il fattore nel registro con origine, banca dati e anno, oppure importare il CSV della banca dati (ESG › Impronta mangimi › Fattori).',
      impact: Math.round(500 + x.kgT * 10), link: LINK('fattori') });
  }
  const sups = A(d.supplierPcfs).filter(s => s && fin(s.pcfExcl) && has(s.periodEnd));
  const supName = id => A(d.suppliers).find(s => s && s.id === id)?.name || id || 'fornitore';
  const ingName = id => A(d.ingredients).find(i => i && i.id === id)?.name || id;
  for (const r of sups) {
    if (r.periodEnd >= today) continue;
    if (sups.some(o => o !== r && o.ingId === r.ingId && o.supplierId === r.supplierId && o.periodEnd >= today && (!has(o.periodStart) || o.periodStart <= today))) continue;
    out.push({ key: `pcf:pact-expired:${r.id}`, area: 'esg', roles: ['acquisti'], severity: 'info', title: `Impronta di ${ingName(r.ingId)} di ${supName(r.supplierId)} scaduta`,
      why: `L’impronta dichiarata (${nf(r.pcfExcl)} kg CO₂e/t, periodo ${dateIt(r.periodStart)} – ${dateIt(r.periodEnd)}) non vale più dal ${dateIt(addDays(r.periodEnd, 1))}: per gli acquisti successivi si usa il fattore del registro.`,
      action: 'Chiedere al fornitore l’impronta aggiornata (modulo «Impronta dei prodotti») e importarla in ESG › Impronta mangimi › Scambio dati.',
      impact: 800, link: LINK('scambio') });
  }
  const from = addDays(today, -365);
  const tBy = new Map();
  for (const s of A(d.shipments)) if (s && String(s.date || '') > from && String(s.date || '') <= today && fin(s.tonnes)) tBy.set(s.productId, (tBy.get(s.productId) || 0) + +s.tonnes);
  const miss = new Map();
  for (const p of A(d.products)) {
    if (!p || p.active === false) continue;
    const pk = packagingFor(d, p);
    if (!pk.missing) continue;
    const x = miss.get(pk.packaging) || miss.set(pk.packaging, { names: [], t: 0 }).get(pk.packaging);
    x.names.push(p.name || p.id); x.t += tBy.get(p.id) || 0;
  }
  for (const [k, x] of miss) {
    out.push({ key: `pcf:pkg-missing:${slug(k) || 'confezione'}`, area: 'esg', roles: ['qualita'], severity: 'attenzione', title: `Imballaggio «${k}» senza scheda`,
      why: `${x.names.length} ${x.names.length === 1 ? 'prodotto' : 'prodotti'} (${listJoin(x.names.slice(0, 3))}${x.names.length > 3 ? '…' : ''}, ${nf(x.t)} t vendute in 12 mesi) usano il peso di base del sacco. Dal 12/08/2026 il regolamento imballaggi (PPWR) chiede documentazione tecnica e dichiarazione di conformità.`,
      action: 'Compilare la scheda dell’imballaggio (materiali, peso, riciclato, riciclabilità, dichiarazione del fornitore) in ESG › Impronta mangimi › Imballaggi.',
      impact: Math.round(2000 + x.t / 10), link: LINK('imballaggi') });
  }
  return out;
}

/* ---------------- sezione del report «Impronta dei mangimi» (82) ---------------- */
/** Sezione del report CdA / Rapporto ESG: impronta media ponderata, quota LUC, dati primari, soia DCF, leva più economica, dichiarazioni. */
export function pcfReportSection(d, ctx, P, C) {
  if (!d || !P || !has(P.from) || !pcfOn(d)) return null;
  const w = safe(() => weightedPcf(d, P), null);
  if (!w) return null;
  const wc = C && has(C.from) && !C.budget ? safe(() => weightedPcf(d, C), null) : null;
  const cmp = (v, good, kind = 'ratio') => (v != null ? { value: v, kind, good, label: C?.label || 'periodo di confronto' } : undefined);
  const s = pcfSettings(d);
  const custT = new Set();
  for (const sh of A(d.shipments)) if (sh && inP(sh.date, P)) custT.add(sh.customerId);
  const sentKeys = new Set(A(s.sent).filter(x => x && (x.periodKey === P.key || (has(x.at) && inP(x.at, { from: P.from, to: addMonths(P.to, 3) })))).map(x => x.customerId));
  const top = Object.values(w.byProduct).sort((a, b) => b.tco2e - a.tco2e).slice(0, 3);
  const levers = top.map(t => safe(() => productMacc(d, t.productId), null)).filter(Boolean).map(m => m.cheapest ? { ...m.cheapest, product: m.name } : null).filter(Boolean).sort((a, b) => a.eurPerT - b.eurPerT);
  const lever = levers[0] || null;
  const alerts = safe(() => recalcAlerts(d), []);
  const kpis = [
    { label: 'Impronta media dei mangimi prodotti', value: w.pcf, unit: 'kg CO₂e/t', decimals: 0, cmp: cmp(wc?.pcf, 'down'), note: `${nf(w.t)} t prodotte · ${nf(w.tco2e)} t CO₂e` },
    { label: 'Quota da cambio d’uso del suolo', value: w.lucShare, unit: '%', decimals: 1, cmp: cmp(wc?.lucShare, 'down') },
    { label: 'Dati primari nell’impronta', value: w.primary, unit: '%', decimals: 1, cmp: cmp(wc?.primary, 'up'), note: 'energia misurata e impronte dei fornitori' },
    { label: 'Soia senza deforestazione nelle formule', value: w.dcfSoy, unit: '%', decimals: 1, cmp: cmp(wc?.dcfSoy, 'up'), note: 'stima da schema e catena di custodia' },
    { label: 'Leva di riduzione più economica', value: lever ? lever.eurPerT : null, unit: '€/t CO₂e', decimals: 0, note: lever ? `${lever.short} in ${lever.product}` : 'nessuna leva calcolabile' },
    { label: 'Clienti con la dichiarazione d’impronta', value: sentKeys.size, unit: '', decimals: 0, note: `su ${nf(custT.size)} clienti serviti nel periodo`, status: alerts.length ? 'warn' : undefined },
  ];
  const rows = top.map(t => ({ prodotto: t.name, t: round(t.t, 1), kgT: t.t ? round(t.tco2e * 1000 / t.t, 0) : null, tco2e: round(t.tco2e, 1), luc: t.tco2e ? t.luc / t.tco2e : null }));
  const narrative = [];
  narrative.push(`Nel periodo ${P.label || ''} sono state prodotte ${nf(w.t)} t di mangimi con un’impronta stimata di ${nf(w.tco2e)} t CO₂e, in media ${nf(w.pcf)} kg CO₂e per tonnellata dalla culla al cancello${wc ? `: ${deltaPhrase(w.pcf, wc.pcf, { good: 'down', unit: 'kg CO₂e/t' })}` : ''}.`);
  narrative.push(`Il cambio d’uso del suolo pesa il ${pctTxt(w.lucShare, 1)} dell’impronta${w.dcfSoy != null ? `; la soia senza deforestazione nelle formule è il ${pctTxt(w.dcfSoy, 1)} (stima dalle formule)` : ''}. I dati primari (energia misurata e impronte dei fornitori) coprono il ${pctTxt(w.primary, 1)}.`);
  if (top.length) narrative.push(`I prodotti con più emissioni sono ${listJoin(top.map(t => `${t.name} (${nf(t.tco2e)} t CO₂e)`))}.`);
  if (lever) narrative.push(`La leva più economica è «${lever.label}» in ${lever.product}: ${nf(lever.dCo2)} kg CO₂e/t in meno per ${lever.dCost >= 0 ? '+' : ''}${nf(lever.dCost, 2)} €/t, cioè ${nf(lever.eurPerT)} € per t CO₂e evitata.`);
  if (alerts.length) narrative.push(`${alerts.length === 1 ? 'Una fotografia pubblicata va ricalcolata' : `${alerts.length} fotografie pubblicate vanno ricalcolate`} (${listJoin(alerts.map(a => a.product.name))}).`);
  narrative.push(T('disclaimer'));
  return {
    id: 'esg-impronta', title: 'Impronta dei mangimi', order: 82, kpis,
    table: { cols: [{ key: 'prodotto', label: 'Prodotto', fmt: 'text' }, { key: 't', label: 'Prodotte', align: 'r', fmt: 't' }, { key: 'kgT', label: 'kg CO₂e/t', align: 'r', fmt: 'num' }, { key: 'tco2e', label: 't CO₂e', align: 'r', fmt: 'num' }, { key: 'luc', label: 'Quota LUC', align: 'r', fmt: 'pct' }], rows },
    narrative,
  };
}

/* ---------------- KPI ---------------- */
const wv = (d, P, k) => (pcfOn(d) ? safe(() => weightedPcf(d, P)?.[k] ?? null, null) : null);
export const PCF_KPIS = [
  { id: 'esg-pcf-media', label: 'Impronta media dei mangimi', unit: 'kg CO₂e/t', kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'passaporto', id: 'prodotti' }, decimals: 0, hist: true, src: 'runs',
    def: 'Impronta dalla culla al cancello dei mangimi prodotti nel periodo, ponderata sulle tonnellate di ogni versione della formula: Σ t × impronta ÷ Σ t. L’impronta somma materie prime (registro dei fattori), perdite, trasporto in ingresso, energia di stabilimento per linea e imballaggio.',
    compute: (d, ctx, P) => wv(d, P, 'pcf') },
  { id: 'esg-pcf-luc', label: 'Quota LUC dell’impronta dei mangimi', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'passaporto', id: 'prodotti' }, decimals: 1, hist: false, src: 'runs',
    def: 'Emissioni da cambio d’uso del suolo (LUC) delle materie prime dei mangimi prodotti nel periodo ÷ impronta totale degli stessi mangimi. Solo i fattori con le componenti (registro o fornitore) contribuiscono al LUC.',
    compute: (d, ctx, P) => wv(d, P, 'lucShare') },
  { id: 'esg-pcf-primari', label: 'Dati primari nell’impronta dei mangimi', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'passaporto', id: 'fattori' }, decimals: 1, hist: false, src: 'runs',
    def: 'Quota dell’impronta dei mangimi prodotti nel periodo calcolata con dati primari: energia di stabilimento misurata più materie prime con l’impronta dichiarata dal fornitore, ÷ impronta totale.',
    compute: (d, ctx, P) => wv(d, P, 'primary') },
];

/* ---------------- regole della qualità dei dati R26-R29 ---------------- */
const NOFAIL = { base: 0, fails: [] };
export const PCF_RULES = [
  { id: 'R26', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing'], label: 'Materia prima delle formule attive senza fattore con fonte',
    check: d => {
      if (!pcfOn(d)) return NOFAIL;
      const xs = ingredientsInUse(d);
      return { base: xs.length, fails: xs.filter(x => x.ef.source === 'anagrafica' || x.ef.source === 'mancante').map(x => ({ id: x.ingId, coll: 'ingredients', msg: `${x.name}: ${x.ef.total == null ? 'nessun fattore di emissione' : `${nf(x.ef.total)} kg CO₂e/t dall’anagrafica, senza origine né banca dati`} (usata in ${x.formulas.length} formule attive)`, link: LINK('fattori') })) };
    } },
  { id: 'R27', area: 'esg', severity: 'info', weight: 2, scope: ['all', 'import'], label: 'Fattore fuori dal suo intervallo o banca dati più vecchia di 3 anni',
    check: d => {
      if (!pcfOn(d)) return NOFAIL;
      const rows = A(d.efIngredients).filter(r => r && fin(r.total));
      const y = +esgToday(d).slice(0, 4);
      const ing = id => A(d.ingredients).find(i => i && i.id === id)?.name || id;
      return { base: rows.length, fails: rows.filter(r => (fin(r.low) && +r.total < +r.low) || (fin(r.high) && +r.total > +r.high) || (fin(r.year) && y - +r.year > 3)).map(r => ({ id: r.id, coll: 'efIngredients',
        msg: `${ing(r.ingId)} (${originLabel(r.origin)}): ${(fin(r.year) && y - +r.year > 3) ? `banca dati del ${r.year}, più vecchia di 3 anni` : `${nf(r.total)} kg CO₂e/t fuori dall’intervallo ${nf(r.low)}–${nf(r.high)}`}`, link: LINK('fattori') })) };
    } },
  { id: 'R28', area: 'esg', severity: 'info', weight: 1, scope: ['all', 'import'], label: 'Impronta di un fornitore ripetuta o scaduta',
    check: d => {
      if (!pcfOn(d)) return NOFAIL;
      const rows = A(d.supplierPcfs).filter(r => r && fin(r.pcfExcl));
      const today = esgToday(d);
      const dup = new Set(rows.filter((r, i) => has(r.pfId) && rows.findIndex(x => x.pfId === r.pfId) !== i).map(r => r.pfId));
      const ing = id => A(d.ingredients).find(i => i && i.id === id)?.name || id;
      return { base: rows.length, fails: rows.filter(r => dup.has(r.pfId) || (has(r.periodEnd) && r.periodEnd < today)).map(r => ({ id: r.id, coll: 'supplierPcfs',
        msg: dup.has(r.pfId) ? `${ing(r.ingId)}: identificativo PACT ${String(r.pfId).slice(0, 8)}… ripetuto` : `${ing(r.ingId)} di ${r.supplierName || r.supplierId}: impronta scaduta il ${dateIt(r.periodEnd)}`, link: LINK('scambio') })) };
    } },
  { id: 'R29', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Prodotto in sacchi senza scheda dell’imballaggio',
    check: d => {
      if (!pcfOn(d)) return NOFAIL;
      const ps = A(d.products).filter(p => p && p.active !== false && /sacc|big ?bag/i.test(p.packaging || ''));
      return { base: ps.length, fails: ps.filter(p => packagingFor(d, p).missing).map(p => ({ id: p.id, coll: 'products', msg: `${p.name}: confezione «${p.packaging}» senza scheda (materiali, peso, riciclato)`, link: LINK('imballaggi') })) };
    } },
];

/* ---------------- datapoint del VS/VSME ---------------- */
const dp = (value, unit, quality, fn, extra = {}) => ({ value, unit, quality, source: `pcf.${fn}`, ...extra });
/** Datapoint: C1 (gruppi di prodotti; impronta dei prodotti per i questionari dei clienti), B7 (circolarità e imballaggi). */
export function pcfDatapoints(d, P) {
  if (!d || !P || !has(P.from)) return {};
  const out = {};
  // C1: gruppi di prodotti (vale per ogni settore)
  const tBy = new Map();
  for (const s of A(d.shipments)) if (s && inP(s.date, P) && fin(s.tonnes)) tBy.set(s.productId, (tBy.get(s.productId) || 0) + +s.tonnes);
  const groups = new Map();
  const feed = sectorOf(d) === 'mangimi';
  for (const p of A(d.products)) {
    if (!p || p.active === false) continue;
    const g = (feed ? speciesLabel(p.species) : p.category || p.species || p.form) || 'altri prodotti';
    groups.set(g, (groups.get(g) || 0) + (tBy.get(p.id) || 0));
  }
  const totT = sum([...groups.values()]);
  if (groups.size) {
    const list = [...groups].sort((a, b) => b[1] - a[1]).map(([g, t]) => (totT > 0 ? `${g} ${nf(t / totT * 100)}%` : g));
    out['C1.products'] = dp(`${feed ? 'Mangimi composti' : 'Prodotti'}: ${list.join(', ')}`, null, totT > 0 ? 'calcolato' : 'dichiarato', 'pcfDatapoints', { method: 'Prodotti attivi per gruppo, quota sulle tonnellate consegnate nel periodo', note: `${A(d.products).filter(p => p && p.active !== false).length} prodotti attivi` });
  }
  if (!pcfOn(d)) return out;
  const w = safe(() => weightedPcf(d, P), null);
  const prevP = has(P.key) ? previousPeriod(d, P.key) : null;
  const wp = prevP ? safe(() => weightedPcf(d, prevP), null) : null;
  if (w) {
    const s = pcfSettings(d);
    out['C1.pcf-mean'] = dp(round(w.pcf, 0), 'kg CO₂e/t', 'calcolato', 'weightedPcf', { method: `${s.method}; ${BOUNDARY_LABEL[s.boundary] || s.boundary}; media ponderata sulla produzione`, prev: wp ? round(wp.pcf, 0) : undefined });
    out['C1.pcf-luc'] = dp(w.lucShare == null ? null : round(w.lucShare * 100, 1), '%', 'calcolato', 'weightedPcf', { method: 'Emissioni da cambio d’uso del suolo ÷ impronta dei mangimi prodotti', prev: wp?.lucShare != null ? round(wp.lucShare * 100, 1) : undefined });
    out['C1.pcf-primary'] = dp(w.primary == null ? null : round(w.primary * 100, 1), '%', 'calcolato', 'weightedPcf', { method: 'Energia misurata e impronte dei fornitori ÷ impronta totale' });
    out['C1.pcf-method'] = dp(`${s.method}, ${BOUNDARY_LABEL[s.boundary] || s.boundary}; banche dati: ${listJoin([...new Set(A(d.efIngredients).map(r => `${r?.db || '—'}${r?.dbVersion ? ' ' + r.dbVersion : ''}`))].sort()) || 'anagrafica delle materie prime'}; incertezza Monte Carlo P10–P90`, null, 'dichiarato', 'pcfSettings');
    out['C1.pcf-land'] = dp(round(w.landHa / w.t * 1e4, 0), 'm²·anno/t', 'stimato', 'weightedPcf', { method: 'Σ kg di materia prima × occupazione di suolo del registro (o della categoria) ÷ t prodotte' });
  }
  // B7: circolarità (coprodotti, ex prodotti alimentari) e imballaggi immessi sul mercato
  const rows = [];
  let tot = 0;
  const cls = Object.fromEntries(Object.keys(CO_CLASSES).map(k => [k, 0]));
  for (const x of A(w ? Object.keys(w.byProduct) : [])) {
    const r = safe(() => pcf(d, x, { P, light: true }), null);
    const t = w.byProduct[x].t;
    if (!r) continue;
    tot += t;
    for (const [k, v] of Object.entries(r.coShares)) cls[k] = (cls[k] || 0) + t * v;
    rows.push(r);
  }
  const pk = safe(() => packagingSummary(d, P), null);
  if (tot > 0) {
    const res = cls.residuo / tot, oil = cls['farina-oleosa'] / tot, exf = cls['ex-food'] / tot;
    out['B7.circular'] = dp(`Coprodotti dell’agroindustria (crusche, borlande, polpe, melassi) pari al ${nf(res * 100, 1)}% delle materie prime dei mangimi prodotti; farine di estrazione ${nf(oil * 100, 1)}%; ex prodotti alimentari ${nf(exf * 100, 1)}%.${pk ? ` Il ${nf((pk.bulkShare || 0) * 100)}% dei mangimi viaggia sfuso, senza imballaggio${pk.kg > 0 ? `; per i sacchi ${nf(pk.recycledPct || 0, 1)}% di materiale riciclato` : ''}.` : ''}`, null, 'calcolato', 'pcf',
      { method: 'Classi di circolarità delle materie prime (registro o pacchetto) pesate sulla produzione; imballaggi dalle schede per confezione' });
    out['B7.coproducts'] = dp(round(res * 100, 1), '%', 'calcolato', 'pcf', { method: 'kg di residui dell’agroindustria ÷ kg di materie prime (farine di estrazione escluse e riportate a parte)' });
  }
  if (pk && pk.tSold > 0) {
    out['B7.packaging-t'] = dp(round(pk.kg / 1000, 1), 't', pk.rows.some(r => r.isDefault && r.kg > 0) ? 'stimato' : 'calcolato', 'packagingSummary', { method: 'Σ t vendute per confezione × kg di imballaggio per t (schede del registro, altrimenti peso di base)' });
    if (pk.kg > 0) out['B7.packaging-recycled'] = dp(round(pk.recycledPct || 0, 1), '%', 'dichiarato', 'packagingSummary', { method: 'Contenuto riciclato dichiarato dai fornitori degli imballaggi, pesato sui kg' });
  }
  return out;
}
const SPECIES_TXT = { 'bovini-latte': 'vacche da latte', 'bovini-carne': 'bovini da carne', vitelli: 'vitelli', 'ovicaprini-latte': 'ovini e caprini', 'suini-ingrasso': 'suini', suinetti: 'suinetti', ovaiole: 'ovaiole', broiler: 'polli da carne', conigli: 'conigli', equini: 'equini' };
const speciesLabel = s => SPECIES_TXT[s] || (has(s) ? String(s).replace(/-/g, ' ') : null);

/* ---------------- scadenze ---------------- */
/** Scadenze: impronte dei fornitori in scadenza, rinnovo delle fotografie pubblicate, revisione dei fattori, date del regolamento imballaggi. */
export function pcfCalendarItems(d, today) {
  if (!d || !isObj(d) || !pcfOn(d)) return [];
  const t = has(today) && ISO.test(String(today).slice(0, 10)) ? String(today).slice(0, 10) : esgToday(d);
  const out = [], keys = new Set();
  const push = it => { if (!ISO.test(String(it.date || '')) || keys.has(it.key)) return; keys.add(it.key); out.push({ area: 'esg', pkg: 'pcf', ...it }); };
  const pk = packInfo(d);
  const hasBags = A(d.products).some(p => p && p.active !== false && /sacc|big ?bag/i.test(p.packaging || ''));
  if (hasBags) for (const x of packList(d, 'scadenza')) if (x.date >= addDays(t, -365)) push({ key: `pcf:${x.id}`, date: x.date, title: x.title, kind: 'scadenza', law: x.law, source: x.source, validAsOf: pk.validAsOf, owner: 'Qualità', link: LINK('imballaggi') });
  const ing = id => A(d.ingredients).find(i => i && i.id === id)?.name || id;
  for (const r of A(d.supplierPcfs)) if (r && ISO.test(String(r.periodEnd || '')) && r.periodEnd >= t) push({ key: `pcf:pact:${r.id}`, date: r.periodEnd, title: `Scade l’impronta di ${ing(r.ingId)} dichiarata da ${r.supplierName || r.supplierId}`, kind: 'rinnovo', owner: 'Acquisti', link: LINK('scambio') });
  for (const s of activeSnapshots(d)) {
    const until = ISO.test(String(s.validUntil || '')) ? s.validUntil : ISO.test(String(s.publishedAt || '')) ? addMonths(s.publishedAt.slice(0, 7), 12) + s.publishedAt.slice(7, 10) : null;
    if (until && ISO.test(until)) push({ key: `pcf:snap:${s.id}`, date: until, title: `Rinnovo dell’impronta pubblicata di ${A(d.products).find(p => p && p.id === s.productId)?.name || s.productId}`, kind: 'rinnovo', owner: 'Qualità', link: LINK(s.productId) });
  }
  const years = A(d.efIngredients).map(r => num(r?.year)).filter(v => v != null);
  if (years.length) push({ key: 'pcf:review-factors', date: `${Math.max(+t.slice(0, 4), Math.min(...years) + 1)}-03-31`, title: 'Revisione annuale dei fattori delle materie prime (nuove versioni delle banche dati)', kind: 'controllo', owner: 'Formulazione', source: 'Regola di ricalcolo PACT v3 e PEFCR Feed', link: LINK('fattori') });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
}

/* ---------------- nota metodologica ---------------- */
export const PCF_METHOD = {
  it: `Impronta di carbonio dei mangimi dalla culla al cancello del mangimificio, stimata internamente secondo l’impostazione della PEFCR Feed for Food-Producing Animals (FEFAC): unità funzionale 1 t di mangime al cancello; allocazione economica per le materie prime; energia di stabilimento per linea (la pellettatura e il vapore solo ai prodotti in pellet). Non è uno studio verificato da terzi e non è una dichiarazione di conformità a norme o programmi.

Impronta = Σ x_i·EF_i (materie prime) + Σ x_i·calo·EF_i (perdite di lavorazione) + trasporto in ingresso dopo il punto incluso nel fattore + energia di stabilimento + imballaggio [+ consegna, se inclusa]. FLAG = Σ x_i(1 + calo)·(LUC_i + gestione del suolo_i); non FLAG = impronta − FLAG; suolo = Σ x_i·m²·anno_i.

Fattori delle materie prime, nell’ordine: impronta dichiarata dal fornitore valida alla data (dati primari); registro dei fattori per origine, schema e catena di custodia; per origine; riga generica; valore dell’anagrafica (qualità 5); valori di letteratura del pacchetto con fonte e anno (nessun valore GFLI è incluso: si importano con il CSV dell’esportazione GFLI). Elettricità: fattore di rete location-based sulla quota non coperta dal fotovoltaico; GPL con CH₄ e N₂O di combustione.

Incertezza: Monte Carlo con distribuzioni triangolari (minimo, centrale, massimo di ogni fattore; senza intervallo, ampiezza secondo la qualità del dato), 2.000 iterazioni con seme fisso, P10–P90. Le fotografie pubblicate vanno ricalcolate quando cambia la formula, la banca dati, l’origine delle materie prime (oltre 10 punti) o l’energia di stabilimento (oltre il 10%).

Le dichiarazioni ai clienti riportano solo totali e ripartizioni per prodotto: le formule non sono mai comunicate. Il JSON nella forma dei dati PACT v3 non è testato per la conformità; il pacchetto dati per gli strumenti riconosciuti GMP+ MI5.7 non rende FeedOS uno strumento riconosciuto.`,
  en: `Cradle-to-gate carbon footprint of compound feed, estimated internally following the approach of the PEFCR Feed for Food-Producing Animals (FEFAC): functional unit 1 t of feed at the mill gate; economic allocation for feed materials; feed-mill energy by line (pelleting and steam only to pelleted products). It is not a third-party verified study and not a statement of conformity with any standard or programme.

Footprint = Σ x_i·EF_i (feed materials) + Σ x_i·loss·EF_i (process losses) + inbound transport after the point included in the factor + feed-mill energy + packaging [+ delivery, if included]. FLAG = Σ x_i(1 + loss)·(LUC_i + land management_i); non-FLAG = footprint − FLAG; land = Σ x_i·m²·year_i.

Feed-material factors, in order: supplier-declared footprint valid at the date (primary data); factor register by origin, scheme and chain of custody; by origin; generic row; master-data value (quality 5); literature values of the content pack with source and year (no GFLI values are embedded: they are imported from the GFLI export CSV). Electricity: location-based grid factor on the share not covered by solar PV; LPG including combustion CH₄ and N₂O.

Uncertainty: Monte Carlo with triangular distributions (minimum, central, maximum of each factor; without a range, width by data quality), 2,000 iterations with a fixed seed, P10–P90. Published snapshots must be recalculated when the formula, the database, the origin of feed materials (over 10 points) or the feed-mill energy (over 10%) change.

Customer statements only report totals and splits by product: formulas are never disclosed. The PACT v3-shaped JSON is not tested for conformance; the data package for GMP+ MI5.7 recognised tools does not make FeedOS a recognised tool.`,
};
