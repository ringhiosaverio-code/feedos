/* FeedOS 18 · Rischi climatici (pacchetto WP8 «rischi»): calcoli puri su siti, pericoli fisici, copertura contro le catastrofi
 * naturali (L. 213/2023, commi 101-111), esposizione climatica della filiera (acquisti del periodo × origine × livello di rischio),
 * prova di stress con runScenario (sola lettura) ed esposizione di transizione. Nessun orologio: il giorno di riferimento arriva
 * dal chiamante (ctx.today o esgToday). Nessun import dai registri. Funzioni senza eccezioni e senza messaggi in console. */
import { runScenario } from './scenario.js';
import { volumesOf } from './actuals.js';
import { esgSettings, esgToday, sectorOf } from './esg-years.js';
import { carbonPrice } from './esg-piano.js';
import { inventory, ets2Exposure } from './esg-clima.js';
import { addMonths, daysBetween } from '../core/util.js';

const EMPTY = [];
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch { return fb; } };
const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Pericoli fisici del catalogo (chiave → nome). */
export const HAZARDS = { alluvione: 'alluvione', frana: 'frana', sisma: 'sisma', caldo: 'caldo', siccita: 'siccità', 'grandine-vento': 'grandine e vento', incendio: 'incendio', mare: 'mareggiate e innalzamento del mare' };
/** Chiave canonica di un pericolo o di un rischio assicurato («inondazione», «esondazione» → alluvione). */
export function hazardKey(h) {
  const s = strip(h);
  if (/inond|esond|alluv/.test(s)) return 'alluvione';
  if (/frana|smottam/.test(s)) return 'frana';
  if (/sism|terrem/.test(s)) return 'sisma';
  if (/sicc/.test(s)) return 'siccita';
  if (/caldo|calore/.test(s)) return 'caldo';
  if (/grandin|vento/.test(s)) return 'grandine-vento';
  if (/incend/.test(s)) return 'incendio';
  if (/mare|mareg/.test(s)) return 'mare';
  return s;
}
/** Scala del livello di rischio, da 0 a 4. */
export const LEVEL_LABEL = ['trascurabile', 'basso', 'medio', 'alto', 'molto alto'];
/** Rischi che la polizza catastrofale deve coprire (L. 213/2023, commi 101-111). */
export const REQUIRED_PERILS = ['sisma', 'alluvione', 'frana'];
export const KIND_LABEL = { catastrofale: 'Catastrofale', 'all-risks': 'All risks', RC: 'Responsabilità civile', trasporti: 'Trasporti' };
export const ACTION_STATUS = ['pianificata', 'in corso', 'fatta', 'sospesa'];
export const SITE_KINDS = ['stabilimento', 'magazzino', 'deposito', 'ufficio'];
export const CBAM_THRESHOLD_T = 50;

/** Impostazioni di base del pacchetto (settings.esg18.rischi, fuse in profondità). */
export const RISCHI_BASE = {
  horizons: { breve: '≤ 1 anno', medio: '1–5 anni', lungo: '> 5 anni' },
  natura2000NearKm: 10,          // «vicino» alle aree sensibili: entro questa distanza (soglia dell’azienda, da confermare)
  hazardMaxAgeMonths: 24,        // una verifica dei pericoli più vecchia di così va ripetuta
  concentrationPct: 60,          // quota da una sola origine a rischio standard che segnala la concentrazione
  policyWarnDays: 60,            // preavviso per la scadenza delle polizze
  originByIngredient: {},        // origine di base per materia prima (codice paese o testo), se la filiera non la dà
  stress: null,                  // shock in % per commodity (o «energia»); se vuoto: valori del settore
};
const STRESS_BASE = { mangimi: { mais: 25, soia: 20, energia: 30 }, agrofarmaci: { rame: 25, energia: 30 } };

/** Impostazioni del pacchetto con gli shock di stress del settore se non scelti. */
export function rischiSettings(d) {
  const s = esgSettings(d, 'rischi', RISCHI_BASE);
  const stress = isObj(s.stress) ? s.stress : STRESS_BASE[sectorOf(d)] || STRESS_BASE.mangimi;
  return { ...s, stress };
}

/* ---------------- materie prime: commodity, origine ---------------- */
const ING_COMMODITY = { mais: 'mais', ddgs: 'mais', glutine: 'mais', orzo: 'orzo', frumento: 'frumento', crusca: 'frumento', farinaccio: 'frumento',
  sorgo: 'sorgo', soia44: 'soia', soia48: 'soia', soiadf: 'soia', soiaint: 'soia', olio: 'soia', girasole: 'girasole', colza: 'colza' };
/** Commodity di una materia prima (per l’esposizione): mais, soia…; per gli agrofarmaci il gruppo delle sostanze attive. */
export function commodityOf(ing) {
  if (ing?.id && ING_COMMODITY[ing.id]) return ING_COMMODITY[ing.id];
  if (ing?.category === 'sostanza attiva') return 'sostanze attive';
  return ing?.category || 'altre materie';
}
/** Una materia prima risponde a uno shock dello stress (commodity, identificativo o sostanza attiva). */
const stressMatch = (ing, key) => key === commodityOf(ing) || key === ing?.id || (!!ing?.asId && key === ing.asId);
const COUNTRY_NAME = { IT: 'Italia', AT: 'Austria', FR: 'Francia', DE: 'Germania', ES: 'Spagna', BR: 'Brasile', AR: 'Argentina', US: 'Stati Uniti', UA: 'Ucraina' };
const LOW_RISK = new Set(['it', 'italia', 'at', 'austria', 'fr', 'francia', 'de', 'germania', 'es', 'spagna', 'ue', 'produzione interna']);
/** Origine a rischio basso: Italia, altri paesi UE, produzione interna. Il resto (extra-UE, paesi noti per il rischio) è a rischio standard. */
export const isLowRiskOrigin = o => LOW_RISK.has(strip(o));
/** Nome leggibile di un’origine (codice paese o testo). */
export function originName(code) {
  const c = String(code ?? '').trim();
  return COUNTRY_NAME[c.toUpperCase()] || c || 'non indicata';
}
/** Origine di un lotto: paese della filiera (lotto EUDR), poi quella di base per materia, poi quella dell’anagrafica. */
export function originOf(lot, ing, { eudrByLot, map }) {
  const c = eudrByLot?.get(lot?.id)?.country;
  if (c) return originName(c);
  const m = map?.[ing?.id ?? lot?.ingId];
  if (m) return originName(m);
  if (ing?.origin) return originName(ing.origin);
  return 'non indicata';
}

/** Acquisti del periodo per commodity e origine: [{commodity, origin, t}] e totale in t. Lotti senza data o senza tonnellate si saltano. */
export function purchases(d, P) {
  const ings = new Map(A(d?.ingredients).filter(Boolean).map(i => [i.id, i]));
  const eudrByLot = new Map(A(d?.eudrLots).filter(e => e?.ingLotId).map(e => [e.ingLotId, e]));
  const map = rischiSettings(d).originByIngredient || {};
  const rows = new Map();
  let total = 0;
  if (!P?.from || !P?.to) return { rows: [], total: 0 };
  for (const l of A(d?.ingLots)) {
    if (!l || typeof l.date !== 'string' || l.date < P.from || l.date > P.to) continue;
    const t = num(l.tonnes);
    if (!t || t <= 0) continue;
    const ing = ings.get(l.ingId) || { id: l.ingId };
    const commodity = commodityOf(ing), origin = originOf(l, ing, { eudrByLot, map });
    const k = commodity + '\u0001' + origin;
    const r = rows.get(k) || { commodity, origin, t: 0 };
    r.t += t; rows.set(k, r); total += t;
  }
  return { rows: [...rows.values()], total };
}

/**
 * Esposizione climatica della filiera nel periodo: media dei livelli di rischio (0–4) pesata sulle tonnellate, con le
 * tonnellate senza valutazione, la concentrazione per materia (indice HHI sulle origini, quota della prima origine) e la quota
 * da origini a rischio standard. value = null senza acquisti valutati.
 */
export function sourcingExposure(d, P) {
  const pu = purchases(d, P);
  const risks = A(d?.sourcingRisks).filter(r => r && num(r.level) != null);
  const levelOf = (commodity, origin) => {
    const xs = risks.filter(r => r.commodity === commodity && strip(originName(r.origin)) === strip(origin));
    return xs.length ? { level: Math.max(...xs.map(r => +r.level)), hazards: xs.map(r => r.hazard).filter(Boolean) } : null;
  };
  let assessedT = 0, wsum = 0, unassessedT = 0;
  const rows = pu.rows.map(r => {
    const lv = levelOf(r.commodity, r.origin);
    if (lv) { assessedT += r.t; wsum += r.t * lv.level; } else unassessedT += r.t;
    return { ...r, level: lv ? lv.level : null, hazards: lv ? lv.hazards : [] };
  }).sort((a, b) => b.t - a.t);
  const byC = new Map();
  for (const r of pu.rows) { const c = byC.get(r.commodity) || { commodity: r.commodity, t: 0, origins: [] }; c.t += r.t; c.origins.push(r); byC.set(r.commodity, c); }
  const concentration = [...byC.values()].map(c => {
    const top = c.origins.slice().sort((a, b) => b.t - a.t)[0];
    const std = c.origins.filter(r => !isLowRiskOrigin(r.origin)).reduce((s, r) => s + r.t, 0);
    return { commodity: c.commodity, t: c.t, hhi: c.t ? Math.round(c.origins.reduce((s, r) => s + (r.t / c.t) ** 2, 0) * 10000) : null,
      topOrigin: top ? top.origin : null, topShare: top && c.t ? top.t / c.t : null, standardShare: c.t ? std / c.t : null };
  }).sort((a, b) => b.t - a.t);
  const stdT = pu.rows.filter(r => !isLowRiskOrigin(r.origin)).reduce((s, r) => s + r.t, 0);
  return {
    total: pu.total, assessedT, unassessedT, value: assessedT > 0 ? wsum / assessedT : null,
    assessedShare: pu.total ? assessedT / pu.total : null, standardShare: pu.total ? stdT / pu.total : null, rows, concentration,
  };
}

/* ---------------- siti e pericoli ---------------- */
/** Valore dei beni di un sito (terreni, fabbricati, impianti, attrezzature: art. 2424 c.c., voce B.II 1-3), 0 se non inseriti. */
export const assetsOf = s => ['valTerreni', 'valFabbricati', 'valImpianti', 'valAttrezzature'].reduce((a, k) => a + (num(s?.[k]) || 0), 0);
/** Siti di proprietà (in locazione o in gestione non entrano nel valore dei beni assicurabili del bilancio). */
export const ownedSites = d => A(d?.sites).filter(s => s && s.owned !== false);
/** Pericoli di un sito. */
export const hazardsOf = (d, siteId) => A(d?.siteHazards).filter(h => h && h.siteId === siteId);

/** Sintesi dei pericoli di un sito: livello massimo e medio, quanti pericoli sono ≥ 3, quelli non valutati. */
export function siteRisk(site, hazards = []) {
  const ls = hazards.map(h => num(h.level)).filter(x => x != null);
  const missing = Object.keys(HAZARDS).filter(k => !hazards.some(h => hazardKey(h.hazard) === k));
  return {
    site, count: ls.length, max: ls.length ? Math.max(...ls) : null, mean: ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null,
    high: ls.filter(x => x >= 3).length, missing, rows: hazards,
  };
}

/** Data della verifica più vecchia di un sito (o null se una riga non ha data). */
export function oldestCheck(hazards) {
  if (!hazards.length) return null;
  let min = null;
  for (const h of hazards) { if (!ISO.test(String(h.checkedAt || '').slice(0, 10))) return null; const x = String(h.checkedAt).slice(0, 10); if (!min || x < min) min = x; }
  return min;
}
/** Verifica dei pericoli da ripetere? (più vecchia di hazardMaxAgeMonths o senza data). */
export function checkDue(hazards, today, months) {
  if (!hazards.length) return { due: true, reason: 'nessuna verifica' };
  const o = oldestCheck(hazards);
  if (!o) return { due: true, reason: 'data della verifica mancante' };
  const limit = addMonths(o, months);
  return { due: today >= limit, reason: today >= limit ? `verifica del ${o}` : null, date: limit };
}

/* ---------------- copertura catastrofale (L. 213/2023) ---------------- */
/** Rischi assicurati di una polizza (testo separato da virgole o elenco), normalizzati. */
export function perilsOf(p) {
  const xs = Array.isArray(p?.perils) ? p.perils : String(p?.perils ?? '').split(/[,;]+/);
  return [...new Set(xs.map(x => hazardKey(String(x).trim())).filter(x => x && x !== ''))];
}
/** Polizza in vigore alla data: dal (se c’è) fino al (obbligatorio) inclusi. */
export const inForce = (p, today) => !!p && !!ISO.test(String(p.to || '')) && (!p.from || String(p.from) <= today) && String(p.to) >= today;

/**
 * Controllo della copertura catastrofale per sito di proprietà: polizza catastrofale in vigore, con sisma, alluvione (anche
 * inondazione ed esondazione) e frana, e somma assicurata non inferiore al valore dei beni del sito.
 * → {rows: [{site, assets, insured, policyId, missing, status, gap}], assets, insured (capped per sito), ratio, compliant, gaps}
 * status: conforme | sottoassicurato | rischi-mancanti | scaduta | assente | valori-mancanti.
 */
export function insuranceCheck(d, today) {
  const cat = A(d?.insurancePolicies).filter(p => p && p.kind === 'catastrofale');
  const cover = cat.map(p => ({ p, live: inForce(p, today), perils: perilsOf(p), insured: num(p.insuredSum) || 0 }));
  // la polizza in vigore con tutti i rischi richiesti, la più ampia; altrimenti la più vicina alla conformità (per dire cosa manca)
  const ok = cover.filter(c => c.live && REQUIRED_PERILS.every(r => c.perils.includes(r)));
  const best = ok.slice().sort((a, b) => b.insured - a.insured)[0] || null;
  const near = cover.slice().sort((a, b) => (b.live - a.live) || (b.perils.length - a.perils.length))[0] || null;
  const owned = ownedSites(d).map(site => ({ site, assets: assetsOf(site) }));
  const assets = owned.reduce((a, r) => a + r.assets, 0);
  const insuredTotal = best ? best.insured : 0;
  // la somma assicurata copre l’insieme dei siti: la quota di ogni sito è pro rata sul valore dei suoi beni
  const rows = owned.map(({ site, assets: a }) => {
    let status;
    if (!a) status = 'valori-mancanti';
    else if (!best) status = !cover.length ? 'assente' : !cover.some(c => c.live) ? 'scaduta' : 'rischi-mancanti';
    else status = insuredTotal >= assets ? 'conforme' : 'sottoassicurato';
    const share = best && assets ? insuredTotal * a / assets : 0;
    return { site, assets: a, insured: a ? Math.min(a, share) : 0, policyId: (best || near)?.p.id ?? null,
      missing: best ? [] : REQUIRED_PERILS.filter(r => !(near?.perils || []).includes(r)), status, gap: a ? Math.max(0, a - share) : null };
  });
  const withA = rows.filter(r => r.assets > 0);
  const insured = withA.reduce((a, r) => a + r.insured, 0);
  return {
    rows, assets, insured, ratio: assets ? insured / assets : null,
    compliant: withA.length > 0 && withA.every(r => r.status === 'conforme'),
    gaps: withA.filter(r => r.status !== 'conforme'), policies: cat,
  };
}

/* ---------------- stress e transizione ---------------- */
/**
 * Prova di stress: shock di prezzo per commodity (o «energia») con runScenario in sola lettura. shock = {mais: 25, energia: 30…}
 * (in %). → {shock, matched, dMargin (€/anno), perT (€/t), volumeBase, marginBase, marginSc} oppure null se non ci sono prodotti.
 */
export function stressTest(d, shock = null, today = esgToday(d)) {
  const sh = isObj(shock) ? shock : rischiSettings(d).stress;
  const byIngredient = {};
  let kwhPricePct = 0, gplPricePct = 0;
  const matched = [];
  for (const [key, pct] of Object.entries(sh || {})) {
    const v = num(pct);
    if (v == null) continue;
    if (key === 'energia') { kwhPricePct = v; gplPricePct = v; matched.push(key); continue; }
    const hits = A(d?.ingredients).filter(i => stressMatch(i, key));
    if (hits.length) { for (const i of hits) byIngredient[i.id] = v; matched.push(key); }
  }
  const none = { shock: sh, matched, dMargin: 0, perT: null, volumeBase: 0, marginBase: 0, marginSc: 0 };
  if (!A(d?.products).length) return none;
  // runScenario legge i volumi annui per prodotto (d.volumes): si calcolano come nel conto economico (ultimi 365 giorni)
  const dd = { ...d, volumes: safe(() => volumesOf(d, today), {}) };
  const r = safe(() => runScenario(dd, { byIngredient, kwhPricePct, gplPricePct }), null);
  if (!r || !Number.isFinite(r.dMargin)) return none;
  return { shock: sh, matched, dMargin: r.dMargin, perT: r.volumeBase ? r.dMargin / r.volumeBase : null, volumeBase: r.volumeBase,
    marginBase: r.annualMarginBase, marginSc: r.annualMarginSc };
}

/** Punteggio dei rischi del registro (probabilità × impatto) e fascia. */
export function riskRows(d) {
  return A(d?.riskRegister).filter(r => r && num(r.likelihood) != null && num(r.impact) != null).map(r => {
    const score = +r.likelihood * +r.impact;
    return { ...r, score, band: score >= 15 ? 'alto' : score >= 8 ? 'medio' : 'basso' };
  }).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
}

/**
 * Esposizione di transizione: costo del carbonio interno sulle emissioni Scope 1 + 2 (clima), costo ETS2 al prezzo interno,
 * acquisti soggetti a CBAM (materie con cbam: true) contro la soglia di 50 t, con il prezzo del carbonio in uso.
 */
export function transitionExposure(d, P) {
  const price = safe(() => carbonPrice(d), 80);
  const inv = safe(() => inventory(d, P), null);
  const s12 = inv?.hasData && Number.isFinite(inv.s1) && inv.s2 ? inv.s1 + (inv.s2.lb || 0) : null;
  const ets2 = safe(() => ets2Exposure(d, P), null);
  const cbamIds = new Set(A(d?.ingredients).filter(i => i?.cbam === true).map(i => i.id));
  const cbamT = A(d?.ingLots).filter(l => l && cbamIds.has(l.ingId) && typeof l.date === 'string' && !!P?.from && l.date >= P.from && l.date <= P.to)
    .reduce((a, l) => a + (num(l.tonnes) || 0), 0);
  return {
    carbonPrice: price, scope12T: s12, carbonCost: s12 != null ? s12 * price : null,
    ets2Cost: ets2?.internal?.cost ?? null, ets2Start: ets2?.start ?? null, cbamT, cbamThreshold: CBAM_THRESHOLD_T,
  };
}

/** Fianco di una polizza in pronta scadenza: giorni alla scadenza (negativi se scaduta). */
export const daysToExpiry = (p, today) => (ISO.test(String(p?.to || '')) ? daysBetween(today, String(p.to).slice(0, 10)) : null);
/** Un’azione di adattamento è da fare? (non fatta, non sospesa). */
export const actionOpen = a => !!a && a.status !== 'fatta' && a.status !== 'sospesa';
