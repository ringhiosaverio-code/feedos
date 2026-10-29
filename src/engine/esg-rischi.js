/* FeedOS 18 · Rischi climatici (pacchetto WP8 «rischi»): siti e pericoli fisici, copertura catastrofale (L. 213/2023), esposizione
 * della filiera, stress di prezzo, rischi di transizione. Contratto della fondazione 18 (07-contract §2 e §4): firme e nomi fissi.
 * Firme: segnali (d, ctx) → Signal[] · sezione del report (d, ctx, P, C) → Section | null · datapoint (d, P) → {dpId: Datapoint}
 * · scadenze (d, today) → CalendarItem[] · riepilogo per la pagina (d, P) → oggetto · plantCoords(d) (usata dal pacchetto clima).
 * I calcoli stanno in esg-rischi-calc.js, che lo legge e lo riespone.
 * Regola: questo file non importa i registri (kpis.js, dataquality.js, providers.js, signals.js, report.js, esg-registry.js,
 * core/derived.js), perché i registri importano lui. Funzioni pure, senza orologio, eccezioni o console. */
import { esgToday, currentPeriod } from './esg-years.js';
import { fmtNum, listJoin } from './esg-nlg.js';
import { addMonths, daysBetween } from '../core/util.js';
import {
  HAZARDS, LEVEL_LABEL, REQUIRED_PERILS, KIND_LABEL, ACTION_STATUS, SITE_KINDS, hazardKey, rischiSettings, purchases, sourcingExposure,
  assetsOf, ownedSites, hazardsOf, siteRisk, oldestCheck, checkDue, perilsOf, inForce, insuranceCheck, stressTest, riskRows,
  transitionExposure, daysToExpiry, actionOpen, isLowRiskOrigin, commodityOf, originName, originOf, RISCHI_BASE,
} from './esg-rischi-calc.js';

export {
  HAZARDS, LEVEL_LABEL, REQUIRED_PERILS, KIND_LABEL, ACTION_STATUS, SITE_KINDS, hazardKey, rischiSettings, purchases, sourcingExposure,
  assetsOf, ownedSites, hazardsOf, siteRisk, oldestCheck, checkDue, perilsOf, inForce, insuranceCheck, stressTest, riskRows,
  transitionExposure, daysToExpiry, actionOpen, isLowRiskOrigin, commodityOf, originName, originOf, RISCHI_BASE,
};

const EMPTY = [];
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch { return fb; } };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LINK = id => ({ area: 'esg', tab: 'rischi', ...(id ? { id } : {}) });
const pct = (v, d = 0) => (num(v) == null ? '—' : `${fmtNum(v * 100, '', 'it', d)}%`);
const eur = v => (num(v) == null ? '—' : `${fmtNum(v, '', 'it', 0)} €`);
const dmy = s => (ISO.test(String(s || '')) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const coordsOf = s => { const a = num(s?.lat), b = num(s?.lon); return a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null; };

/**
 * Coordinate dello stabilimento (contratto §4): anagrafica dell’azienda → sito principale (main, o il primo stabilimento con
 * coordinate) → impostazioni della scheda Clima (plantLat/plantLon) → null. → {lat, lon, source} o null.
 */
export function plantCoords(d) {
  const c = coordsOf(d?.settings?.company);
  if (c) return { ...c, source: 'anagrafica dell’azienda' };
  const sites = A(d?.sites).filter(Boolean);
  const main = sites.find(s => s.main && coordsOf(s)) || sites.find(s => s.kind === 'stabilimento' && coordsOf(s));
  if (main) return { ...coordsOf(main), source: `sito «${main.name || 'principale'}»` };
  const k = d?.settings?.esg18?.clima;
  const cl = coordsOf({ lat: k?.plantLat, lon: k?.plantLon });
  return cl ? { ...cl, source: 'impostazioni della scheda Clima' } : null;
}

/* ---------------- frasi e riepiloghi ---------------- */
const kindOf = k => KIND_LABEL[k] || k || 'polizza';
/** Pericoli di un sito con livello ≥ 2, in una frase: «alluvione (2), caldo (4)». */
function hazardPhrase(h) {
  return h.filter(x => (num(x.level) ?? 0) >= 2).sort((a, b) => (num(b.level) ?? 0) - (num(a.level) ?? 0))
    .map(x => `${HAZARDS[hazardKey(x.hazard)] || x.hazard} (${num(x.level)})`);
}

/** Ripartizione dei rischi del registro per orizzonte: {breve, medio, lungo} come conteggi. */
export function horizonCounts(d) {
  const c = { breve: 0, medio: 0, lungo: 0 };
  for (const r of riskRows(d)) if (c[r.horizon] != null) c[r.horizon]++;
  return c;
}
/** Sito di riferimento dell’azienda, con la sua etichetta. */
const siteName = (d, id) => A(d?.sites).find(s => s && s.id === id)?.name || 'sito';

/* ---------------- segnali di «Oggi» ---------------- */
/**
 * Segnali del pacchetto (chiavi «rischi:…»): polizza catastrofale non conforme (critico), polizza in scadenza o scaduta,
 * pericoli da verificare, azioni di adattamento in ritardo, concentrazione della filiera.
 */
export function rischiSignals(d, ctx) {
  const out = [];
  if (!d) return out;
  const today = typeof ctx?.today === 'string' ? ctx.today : esgToday(d);
  const S = rischiSettings(d);
  const P = safe(() => currentPeriod(d), null);
  // copertura catastrofale: lacune per sito di proprietà
  const ins = safe(() => insuranceCheck(d, today), null);
  for (const g of ins?.gaps || []) {
    const why = g.status === 'assente' ? 'Nessuna polizza catastrofale registrata per questo sito.'
      : g.status === 'scaduta' ? 'La polizza catastrofale non è più in vigore.'
      : g.status === 'rischi-mancanti' ? `La polizza non copre: ${g.missing.join(', ')}.`
      : `La somma assicurata è di ${eur(g.insured)} contro ${eur(g.assets)} di beni: ${eur(g.gap)} non coperti.`;
    out.push({ key: `rischi:catastrofale-gap:${g.site.id}`, area: 'esg', roles: ['direzione'], severity: 'critico',
      title: `Copertura catastrofale non conforme: ${g.site.name || 'sito'}`,
      why: `${why} Senza la polizza obbligatoria si perdono contributi e agevolazioni pubbliche (L. 213/2023).`,
      action: 'Adeguare la polizza (sisma, alluvione, frana e somma pari al valore dei beni) con il broker, prima della prossima scadenza.',
      impact: Math.round(g.gap || g.assets || 0), link: LINK('assicurazioni') });
  }
  // polizze in scadenza o scadute
  for (const p of A(d.insurancePolicies)) {
    if (!p || !(p.kind === 'catastrofale' || p.kind === 'all-risks')) continue;
    const days = daysToExpiry(p, today);
    if (days == null || days > S.policyWarnDays) continue;
    const over = days < 0;
    out.push({ key: `rischi:policy-expiry:${p.id}`, area: 'esg', roles: ['direzione'], severity: over && p.kind === 'catastrofale' ? 'critico' : 'attenzione',
      title: over ? `Polizza ${kindOf(p.kind).toLowerCase()} scaduta il ${dmy(p.to)}` : `Polizza ${kindOf(p.kind).toLowerCase()} in scadenza tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`,
      why: `${p.insurer || 'Compagnia da indicare'}, somma assicurata ${eur(p.insuredSum)}, scadenza ${dmy(p.to)}${perilsOf(p).length ? `; rischi: ${perilsOf(p).join(', ')}` : ''}.`,
      action: 'Confermare il rinnovo o la proroga con la compagnia e aggiornare la data nel registro delle polizze.', impact: Math.round(num(p.insuredSum) || 0), link: LINK('assicurazioni') });
  }
  // pericoli fisici da verificare (più vecchi di 24 mesi o senza data)
  for (const s of ownedSites(d).concat(A(d.sites).filter(x => x && x.owned === false))) {
    const hz = hazardsOf(d, s.id);
    const due = checkDue(hz, today, S.hazardMaxAgeMonths);
    if (!due.due) continue;
    out.push({ key: `rischi:hazard-unchecked:${s.id}`, area: 'esg', roles: ['direzione'], severity: 'info',
      title: `Pericoli fisici da verificare: ${s.name || 'sito'}`,
      why: hz.length ? `Ultima verifica dei pericoli: ${dmy(oldestCheck(hz))}; oltre ${S.hazardMaxAgeMonths} mesi o senza data.` : 'Nessuna valutazione dei pericoli per questo sito.',
      action: 'Ripetere la verifica con la mappa ISPRA IdroGEO (hazard check) e registrare il livello e la data.', impact: 800, link: LINK('fisici') });
  }
  // azioni di adattamento in ritardo
  for (const a of A(d.adaptationActions)) {
    if (!a || !actionOpen(a) || !ISO.test(String(a.due || '')) || String(a.due) >= today) continue;
    out.push({ key: `rischi:adaptation-late:${a.id}`, area: 'esg', roles: ['direzione'], severity: 'attenzione',
      title: `Azione di adattamento in ritardo: ${a.action || a.id}`,
      why: `Scadenza ${dmy(a.due)}, stato «${a.status || 'da definire'}»${a.siteId ? `, sito ${siteName(d, a.siteId)}` : ''}.`,
      action: 'Aggiornare lo stato o la nuova data nel registro delle azioni, con il responsabile indicato.', impact: Math.round(num(a.cost) || 0), link: LINK('assicurazioni') });
  }
  // concentrazione della filiera su un’origine a rischio standard
  const ex = safe(() => sourcingExposure(d, P), null);
  for (const c of ex?.concentration || []) {
    if (c.topShare == null || c.topShare * 100 <= S.concentrationPct || isLowRiskOrigin(c.topOrigin)) continue;
    out.push({ key: `rischi:concentration:${c.commodity}`, area: 'esg', roles: ['acquisti'], severity: 'info',
      title: `Acquisti concentrati su ${c.topOrigin}: ${c.commodity}`,
      why: `Il ${pct(c.topShare)} delle tonnellate del periodo arriva da un’unica origine a rischio standard (indice HHI ${c.hhi}).`,
      action: 'Valutare un secondo fornitore o un’origine diversa, o documentare le misure di attenuazione nella scheda Filiera.',
      impact: Math.round(c.t * 10), link: LINK('filiera') });
  }
  return out;
}

/* ---------------- sezione del report CdA / Rapporto ESG ---------------- */
/** Sezione «Rischi climatici» (88): siti e pericoli, copertura, esposizione della filiera, prime cinque voci di transizione, stress. */
export function rischiReportSection(d, ctx, P, C) {
  if (!d) return null;
  const hasAny = A(d.sites).length || A(d.insurancePolicies).length || A(d.riskRegister).length || A(d.sourcingRisks).length;
  if (!hasAny) return null;
  const today = typeof ctx?.today === 'string' ? ctx.today : esgToday(d);
  const sites = A(d.sites).filter(Boolean);
  const hot = sites.filter(s => (siteRisk(s, hazardsOf(d, s.id)).max ?? 0) >= 3).length;
  const ins = insuranceCheck(d, today);
  const ex = sourcingExposure(d, P);
  const cmpEx = C && !C.budget && C.from && C.to ? sourcingExposure(d, C) : null;
  const st = safe(() => stressTest(d, null, today), null);
  const tr = riskRows(d);
  const kpis = [
    { label: 'Siti con un pericolo fisico di livello 3 o 4', value: sites.length ? hot : null, unit: 'siti', decimals: 0 },
    { label: 'Copertura catastrofale', value: ins.ratio, unit: '%', scale: 100, decimals: 0, status: ins.compliant ? 'ok' : ins.ratio == null ? undefined : 'bad',
      note: ins.compliant ? 'conforme' : 'valore assicurato ÷ valore dei beni di proprietà' },
    { label: 'Esposizione climatica della filiera', value: ex.value, unit: 'livello 0–4', decimals: 1,
      cmp: cmpEx && cmpEx.value != null && ex.value != null ? { value: cmpEx.value, kind: 'ratio', good: 'down', label: C.label || 'periodo precedente' } : undefined },
    { label: 'Stress di prezzo: margine di contribuzione', value: st ? st.dMargin : null, unit: '€/anno', decimals: 0, note: st ? 'a formule invariate' : undefined },
  ];
  const narrative = [];
  const hz = sites.map(s => { const p = hazardPhrase(hazardsOf(d, s.id)); return p.length ? `${s.name || 'Sito'}: ${listJoin(p, 'it')}` : null; }).filter(Boolean);
  if (hz.length) narrative.push(`Pericoli fisici (autovalutazione o verifica IdroGEO, scala 0–4): ${hz.join('; ')}.`);
  if (ins.rows.some(r => r.assets > 0)) narrative.push(ins.compliant
    ? `Copertura catastrofale conforme alla L. 213/2023: sisma, alluvione e frana su tutti i siti di proprietà, somma assicurata pari o superiore ai beni (${eur(ins.assets)}). Scadenza della polizza ${dmy(ins.policies[0]?.to)}.`
    : `Copertura catastrofale non conforme su ${ins.gaps.length} ${ins.gaps.length === 1 ? 'sito' : 'siti'}: senza la polizza si perdono contributi e agevolazioni pubbliche.`);
  if (ex.value != null) narrative.push(`Esposizione climatica della filiera: livello medio ${fmtNum(ex.value, '', 'it', 1)} su 4 sulle tonnellate valutate (${pct(ex.assessedShare)} del periodo); da origini a rischio standard ${pct(ex.standardShare)}.`);
  if (st) narrative.push(`Stress di prezzo (${Object.entries(st.shock || {}).map(([k, v]) => `${k} +${v}%`).join(', ')}): margine di contribuzione ${st.dMargin >= 0 ? '+' : ''}${eur(st.dMargin)} all’anno${st.perT != null ? `, ${fmtNum(st.perT, '', 'it', 1)} €/t` : ''}.`);
  narrative.push('Il registro dei rischi di transizione è nella scheda Rischi climatici › Transizione.');
  narrative.push('Disclaimer: FeedOS organizza dati e calcoli; non sostituisce consulenza legale, fiscale o la verifica di un ente terzo.');
  return {
    id: 'esg-rischi', title: 'Rischi climatici', order: 88, kpis,
    table: tr.length ? { cols: [{ key: 'driver', label: 'Rischio di transizione', fmt: 'text' }, { key: 'horizon', label: 'Orizzonte', fmt: 'text' },
      { key: 'score', label: 'Probabilità × impatto', align: 'r', fmt: 'num' }, { key: 'response', label: 'Risposta', fmt: 'text' }],
      rows: tr.slice(0, 5).map(r => ({ driver: r.driver, horizon: RISCHI_BASE.horizons[r.horizon] || r.horizon, score: r.score, response: r.response || '—' })) } : undefined,
    narrative,
  };
}

/* ---------------- indicatori del catalogo KPI ---------------- */
export const RISCHI_KPIS = [
  { id: 'esg-rischio-siti', label: 'Siti ad alto rischio fisico', unit: 'siti', kind: 'flow', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'rischi', id: 'fisici' }, decimals: 0, hist: false, src: 'snapshot',
    def: 'Siti di proprietà o in gestione con almeno un pericolo fisico di livello 3 o 4 (scala 0–4) nell’ultima verifica registrata.',
    compute: (d, ctx, P) => { const sites = A(d?.sites).filter(Boolean); if (!sites.length) return null; const n = sites.filter(s => (siteRisk(s, hazardsOf(d, s.id)).max ?? -1) >= 3).length; return sites.some(s => hazardsOf(d, s.id).length) ? n : null; } },
  { id: 'esg-copertura-ass', label: 'Copertura catastrofale', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'rischi', id: 'assicurazioni' }, decimals: 0, hist: false, src: 'snapshot',
    def: 'Somma assicurata dalle polizze catastrofali in vigore (sisma, alluvione, frana) ÷ valore dei beni di proprietà, per sito e con tetto al valore del sito.',
    compute: (d, ctx) => insuranceCheck(d, ctx?.today || esgToday(d)).ratio },
  { id: 'esg-esposizione-filiera', label: 'Esposizione climatica della filiera', unit: 'livello 0–4', kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'rischi', id: 'filiera' }, decimals: 1, hist: false, src: 'ingLots',
    def: 'Media dei livelli di rischio (0–4) delle origini, pesata sulle tonnellate acquistate nel periodo; si calcola sulle tonnellate con una valutazione.',
    compute: (d, ctx, P) => sourcingExposure(d, P).value },
];

/* ---------------- regole della qualità dei dati (R49-R51) ---------------- */
const hasCoords = s => !!coordsOf(s);
export const RISCHI_RULES = [
  { id: 'R49', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing'], label: 'Sito senza coordinate',
    check: d => { const sites = A(d?.sites).filter(Boolean); return { base: sites.length, fails: sites.filter(s => !hasCoords(s)).map(s => ({ id: s.id, coll: 'sites', msg: `${s.name || 'Sito'}: coordinate mancanti (servono per la mappa e le distanze)`, link: LINK('siti') })) }; } },
  { id: 'R50', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Polizza senza rischi assicurati',
    check: d => { const ps = A(d?.insurancePolicies).filter(p => p && (p.kind === 'catastrofale' || p.kind === 'all-risks')); return { base: ps.length, fails: ps.filter(p => perilsOf(p).length === 0).map(p => ({ id: p.id, coll: 'insurancePolicies', msg: `${p.insurer || 'Polizza'}: rischi assicurati non indicati`, link: LINK('assicurazioni') })) }; } },
  { id: 'R51', area: 'esg', severity: 'info', weight: 2, scope: ['all'], label: 'Livello di pericolo senza fonte o data',
    check: d => { const hs = A(d?.siteHazards).filter(h => h && num(h.level) != null); return { base: hs.length, fails: hs.filter(h => !String(h.source || '').trim() || !ISO.test(String(h.checkedAt || ''))).map(h => ({ id: h.id, coll: 'siteHazards', msg: `${HAZARDS[hazardKey(h.hazard)] || h.hazard}: fonte o data della verifica mancante`, link: LINK('fisici') })) }; } },
];

/* ---------------- datapoint del VSME (B1, B5, C4) ---------------- */
/** Datapoint del pacchetto: B1 siti con coordinate, B5 aree sensibili e uso del suolo, C4 rischi climatici e adattamento. */
export function rischiDatapoints(d, P) {
  const out = {};
  const sites = A(d?.sites).filter(Boolean);
  const S = rischiSettings(d);
  const withC = sites.filter(hasCoords);
  const sens = sites.filter(s => s.sensitive === true || (num(s.natura2000Km) != null && num(s.natura2000Km) <= S.natura2000NearKm));
  const sum = k => sites.reduce((a, s) => a + (num(s[k]) || 0), 0);
  const put = (id, value, unit, quality, extra = {}) => { out[id] = { value, unit, quality, source: 'rischi.' + id.split('.')[1], ...extra }; };
  put('B1.sites-geo', withC.length ? withC.map(s => `${s.name || 'Sito'} (${s.comune || '—'}${s.provincia ? ' ' + s.provincia : ''}): ${fmtNum(coordsOf(s).lat, '', 'it', 4)}, ${fmtNum(coordsOf(s).lon, '', 'it', 4)}`) : null,
    null, withC.length ? 'dichiarato' : 'mancante', { method: 'Coordinate del registro dei siti; siti di proprietà, in locazione o gestiti.' });
  put('B5.sites-sensitive', sites.length ? sens.length : null, 'siti', sites.length ? 'calcolato' : 'mancante',
    { method: `Siti sensibili o con un’area Natura 2000 entro ${fmtNum(S.natura2000NearKm, '', 'it', 0)} km (soglia dell’azienda).` });
  put('B5.area-sensitive', sens.length ? sens.reduce((a, s) => a + (num(s.areaM2) || 0), 0) / 10000 : null, 'ha', sens.length ? 'calcolato' : 'mancante');
  put('B5.land-total', sites.length ? sum('areaM2') : null, 'm²', sites.length ? 'dichiarato' : 'mancante');
  put('B5.land-sealed', sites.length ? sum('sealedM2') : null, 'm²', sites.length ? 'dichiarato' : 'mancante');
  put('B5.nature-on', sites.length ? sum('natureOnSiteM2') : null, 'm²', sites.length ? 'dichiarato' : 'mancante');
  put('B5.nature-off', sites.length ? sum('natureOffSiteM2') : null, 'm²', sites.length ? 'dichiarato' : 'mancante');
  // C4: pericoli e transizione
  const hz = sites.map(s => { const p = hazardPhrase(hazardsOf(d, s.id)); return p.length ? `${s.name || 'sito'}: ${listJoin(p, 'it')}` : null; }).filter(Boolean);
  const tr = riskRows(d).filter(r => r.type === 'transizione').slice(0, 3).map(r => r.driver);
  const hzText = [hz.length ? `pericoli fisici per sito, livelli 2–4 (${hz.join('; ')})` : null, tr.length ? `rischi di transizione prioritari: ${listJoin(tr, 'it')}` : null].filter(Boolean).join('; ');
  put('C4.hazards', hzText || null, null, hz.length || tr.length ? 'stimato' : 'mancante', { method: 'Autovalutazione o verifica IdroGEO, scala 0–4, e registro dei rischi di transizione.' });
  const ex = sourcingExposure(d, P);
  const insC = insuranceCheck(d, esgToday(d));
  const exText = [sites.length ? `${sites.length} ${sites.length === 1 ? 'sito' : 'siti'}, beni di proprietà ${eur(insC.assets)}` : null,
    ex.value != null ? `esposizione media della filiera ${fmtNum(ex.value, '', 'it', 1)} su 4 (${pct(ex.assessedShare)} delle tonnellate valutate); da origini a rischio standard ${pct(ex.standardShare)}` : null,
    insC.ratio != null ? `copertura catastrofale ${pct(insC.ratio)}` : null].filter(Boolean).join('; ');
  put('C4.exposure', exText || null, null, exText ? 'calcolato' : 'mancante');
  const hc = horizonCounts(d), nR = riskRows(d).length;
  put('C4.horizons', nR ? `breve (${RISCHI_BASE.horizons.breve}): ${hc.breve} rischi; medio (${RISCHI_BASE.horizons.medio}): ${hc.medio}; lungo (${RISCHI_BASE.horizons.lungo}): ${hc.lungo}` : null, null, nR ? 'dichiarato' : 'mancante');
  const acts = A(d.adaptationActions).filter(a => a && a.action);
  put('C4.adaptation', acts.length ? acts.map(a => `${a.action}${a.siteId ? ` (${siteName(d, a.siteId)})` : ''}, ${a.status || 'da definire'}`).join('; ') : null, null, acts.length ? 'dichiarato' : 'mancante');
  const fl = riskRows(d).filter(r => num(r.financialLow) != null || num(r.financialHigh) != null);
  put('C4.financial', fl.length ? `da ${eur(fl.reduce((a, r) => a + (num(r.financialLow) || 0), 0))} a ${eur(fl.reduce((a, r) => a + (num(r.financialHigh) ?? num(r.financialLow) ?? 0), 0))} (stime per i rischi del registro)` : null,
    null, fl.length ? 'stimato' : 'mancante');
  return out;
}

/* ---------------- scadenze ---------------- */
/** Scadenze del pacchetto: rinnovo delle polizze (chiave con «polizza», che il calendario della governance riconosce), azioni di adattamento e ripetizione delle verifiche dei pericoli. */
export function rischiCalendarItems(d, today) {
  const out = [];
  const t = typeof today === 'string' ? today : esgToday(d);
  for (const p of A(d?.insurancePolicies)) {
    if (!p || !ISO.test(String(p.to || ''))) continue;
    out.push({ key: `rischi:polizza:${p.id}:${p.to}`, date: String(p.to).slice(0, 10), area: 'esg', pkg: 'rischi', kind: 'rinnovo',
      title: `${kindOf(p.kind)}: scadenza ${p.insurer ? `(${p.insurer})` : 'della polizza'}`,
      ...(p.kind === 'catastrofale' ? { law: 'L. 213/2023, commi 101-111' } : {}), source: p.number ? `Polizza n. ${p.number}` : 'Registro delle polizze',
      owner: 'Amministrazione', link: LINK('assicurazioni') });
  }
  for (const a of A(d?.adaptationActions)) {
    if (!a || !actionOpen(a) || !ISO.test(String(a.due || ''))) continue;
    out.push({ key: `rischi:adattamento:${a.id}`, date: String(a.due).slice(0, 10), area: 'esg', pkg: 'rischi', kind: 'traguardo',
      title: `Adattamento: ${a.action || a.id}`, owner: a.owner || 'Produzione', source: 'Registro delle azioni di adattamento', link: LINK('assicurazioni') });
  }
  for (const s of A(d?.sites).filter(Boolean)) {
    const hz = hazardsOf(d, s.id);
    const o = oldestCheck(hz);
    if (!o) continue;
    const date = addMonths(o, RISCHI_BASE.hazardMaxAgeMonths);
    if (!ISO.test(date) || daysBetween(t, date) < -365) continue;
    out.push({ key: `rischi:verifica:${s.id}`, date, area: 'esg', pkg: 'rischi', kind: 'controllo', title: `Ripetere la verifica dei pericoli: ${s.name || 'sito'}`,
      source: 'Mappa ISPRA IdroGEO (hazard check) e classificazione sismica', owner: 'Produzione', link: LINK('fisici') });
  }
  return out;
}

/* ---------------- riepilogo della pagina ---------------- */
/** Riepilogo per la scheda e il riquadro: copertura, siti, filiera, stress e transizione del periodo P. */
export function rischiSummary(d, P) {
  if (!d) return null;
  const today = esgToday(d);
  const ins = insuranceCheck(d, today);
  const ex = sourcingExposure(d, P);
  const sites = A(d.sites).filter(Boolean);
  return {
    today, sites: sites.length, owned: ownedSites(d).length, hazardRows: A(d.siteHazards).length,
    insurance: { compliant: ins.compliant, ratio: ins.ratio, assets: ins.assets, insured: ins.insured, gaps: ins.gaps.length, policies: ins.policies.length },
    sourcing: { value: ex.value, assessedShare: ex.assessedShare, standardShare: ex.standardShare, total: ex.total },
    transition: transitionExposure(d, P), stress: stressTest(d, null, today), risks: riskRows(d).length, horizons: horizonCounts(d),
    actionsOpen: A(d.adaptationActions).filter(actionOpen).length,
  };
}

/* ---------------- nota metodologica ---------------- */
export const RISCHI_METHOD = {
  it: `Screening dei pericoli fisici per sito, con la scala 0–4 (0 trascurabile, 4 molto alto). I livelli sono autovalutazione dell’azienda o valori della mappa ISPRA IdroGEO (hazard check entro 500 m), con la fonte e la data della verifica: non sono una valutazione ufficiale. Il riferimento al sisma è la classificazione sismica del comune.

Copertura catastrofale: per ogni sito di proprietà si verifica una polizza in vigore con sisma, alluvione (anche inondazione ed esondazione) e frana, con somma assicurata non inferiore al valore dei beni (terreni, fabbricati, impianti, attrezzature: voce B.II 1-3 dell’art. 2424 c.c., inserita dall’azienda). Riferimento: L. 213/2023, commi 101-111, e i decreti attuativi. La mancanza della polizza comporta l’esclusione da contributi e agevolazioni pubbliche. Il controllo non sostituisce il parere del broker o del consulente.

Esposizione della filiera: media dei livelli di rischio (0–4) delle origini, pesata sulle tonnellate acquistate nel periodo (lotti di materie prime). L’origine è quella del lotto EUDR, poi quella impostata per materia prima, poi quella dell’anagrafica. Indice HHI sulle origini per materia: 10.000 significa un’unica origine.

Prova di stress: shock di prezzo per materia (o energia) calcolato con lo stesso motore dello scenario di prezzo, a formule invariate e in sola lettura. Non è una previsione di margine.

Transizione: costo del carbonio interno sulle emissioni Scope 1 + 2 al prezzo del pacchetto piano, costo ETS2 al prezzo interno (dalla scheda Clima), acquisti soggetti a CBAM contro la soglia di 50 t.`,
  en: `Physical hazard screening by site on a 0–4 scale (0 negligible, 4 very high). Levels are the company's self-assessment or values from the ISPRA IdroGEO map (hazard check within 500 m), recorded with source and check date: they are not an official assessment. Seismic reference: the municipal seismic classification.

Catastrophe cover: for each owned site a policy in force must cover earthquake, flood (including inundation and overflow) and landslide, with an insured sum not below the asset value (land, buildings, plant, equipment: Civil Code art. 2424 B.II 1-3, entered by the company). Reference: Law 213/2023, paragraphs 101-111, and implementing decrees. Without the policy, public grants and subsidies are excluded. This check does not replace the broker's or adviser's opinion.

Supply-chain exposure: weighted average of the origin risk levels (0–4) by tonnes purchased in the period. Origin is taken from the EUDR lot, then the origin set per raw material, then the master record. HHI on origins per material: 10,000 means one origin only.

Stress test: a price shock per material (or energy) run with the same engine as the price scenario, at constant formulas and read-only. It is not a margin forecast.

Transition: internal carbon cost on Scope 1 + 2 at the price in the transition plan, ETS2 cost at the internal price (from the Climate tab), purchases subject to CBAM against the 50 t threshold.`,
};
