/* FeedOS 18 · Report e questionari (pacchetto WP4): datapoint del VS di cui il report è il fornitore, impostazioni del report,
 * risposte dell'esercizio (esgAnswers).
 * Il report fornisce solo i datapoint propri (profilo B1, mercati e relazioni del C1, testi dichiarati): gli altri arrivano dai
 * pacchetti che li calcolano. Un datapoint senza valore non si emette, così non copre quello di un pacchetto successivo
 * nell'ordine del registro (persone, governance, piano, rischi, ambiente vengono dopo il report).
 * Testi neutri rispetto al settore: il nome della famiglia di prodotti e il codice NACE vengono da esg-years (sectorOf, naceOf).
 * Funzioni pure: nessun orologio, nessuna eccezione su archivio vuoto o di partenza. */
import { esgSettings, sectorOf, naceOf, SECTORS } from './esg-years.js';
import { frozenFor } from './pnl.js';
import { SPECIES } from './nutrients.js';
import { sum, monthsIn, endOfMonth, daysBetween, nf, round } from '../core/util.js';
import { VS_DP, VS_DATAPOINTS } from '../data/vsme-datapoints.js';

export const REPORT_DEFAULTS = Object.freeze({
  option: 'basic', basis: 'individuale', legalForm: '', country: '', countries: 1, omitted: [], omissionNotes: {}, lang: 'it', threshold: 3,
  pollutantsReporting: null, waterSignificant: null, waterStress: null, energyDetail: null, hasBoard: null, balanceSheet: null,
});
export const QUALITIES = ['misurato', 'calcolato', 'stimato', 'dichiarato', 'default', 'mancante'];
export const ANSWER_STATUS = ['bozza', 'rivisto', 'approvato'];

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const EMPTY = [];
/** Valore vuoto: null, testo vuoto, elenco vuoto, oggetto senza chiavi. */
export const isEmpty = v => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length) || (typeof v === 'number' && !Number.isFinite(v));
/** Un datapoint ha un valore utilizzabile (non «mancante», non vuoto). */
export const hasValue = dp => !!dp && dp.quality !== 'mancante' && !isEmpty(dp.value);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Impostazioni del report (settings.esg18.report fuse con i valori di base). */
export function reportSettings(d) {
  const s = esgSettings(d, 'report', REPORT_DEFAULTS);
  return { ...s, option: s.option === 'basic+comprehensive' ? 'basic+comprehensive' : 'basic', basis: s.basis === 'consolidato' ? 'consolidato' : 'individuale', lang: s.lang === 'en' ? 'en' : 'it',
    threshold: Number.isFinite(+s.threshold) && +s.threshold >= 1 && +s.threshold <= 5 ? +s.threshold : 3, omitted: Array.isArray(s.omitted) ? s.omitted : [], omissionNotes: isObj(s.omissionNotes) ? s.omissionNotes : {} };
}
/** L'opzione comprende il modulo Comprehensive? */
export const withComprehensive = option => option === 'basic+comprehensive';

/** Risposte dell'esercizio: {dpId: riga di esgAnswers} (id = '<periodo>:<dpId>'). */
export function answersFor(d, periodKey) {
  const out = {};
  if (!periodKey) return out;
  for (const a of Array.isArray(d?.esgAnswers) ? d.esgAnswers : EMPTY) if (a && a.periodKey === periodKey && typeof a.dpId === 'string') out[a.dpId] = a;
  return out;
}

/** Datapoint da una risposta (valore dichiarato o inserito a mano), o null. */
export function answerDatapoint(a, id) {
  if (!a || isEmpty(a.value)) return null;
  return clean({ value: a.value, unit: a.unit ?? VS_DP[id]?.unit ?? null, quality: QUALITIES.includes(a.quality) && a.quality !== 'mancante' ? a.quality : 'dichiarato', source: 'report.risposta',
    method: typeof a.method === 'string' && a.method ? a.method : undefined, note: typeof a.note === 'string' && a.note ? a.note : undefined,
    evidence: Array.isArray(a.evidenceIds) && a.evidenceIds.length ? a.evidenceIds.map(String) : undefined, origin: 'risposta' });
}

/* ---------------- regioni italiane dalle sigle di provincia (per i mercati del C1) ---------------- */
const REGIONS = {
  Abruzzo: 'AQ CH PE TE', Basilicata: 'MT PZ', Calabria: 'CS CZ KR RC VV', Campania: 'AV BN CE NA SA', 'Emilia-Romagna': 'BO FC FE MO PC PR RA RE RN', 'Friuli-Venezia Giulia': 'GO PN TS UD',
  Lazio: 'FR LT RI RM VT', Liguria: 'GE IM SP SV', Lombardia: 'BG BS CO CR LC LO MB MI MN PV SO VA', Marche: 'AN AP FM MC PU', Molise: 'CB IS', Piemonte: 'AL AT BI CN NO TO VB VC',
  Puglia: 'BA BR BT FG LE TA', Sardegna: 'CA NU OR SS SU CI VS OG OT', Sicilia: 'AG CL CT EN ME PA RG SR TP', Toscana: 'AR FI GR LI LU MS PI PO PT SI', 'Trentino-Alto Adige': 'BZ TN',
  Umbria: 'PG TR', 'Valle d’Aosta': 'AO', Veneto: 'BL PD RO TV VE VI VR',
};
const PROV = Object.fromEntries(Object.entries(REGIONS).flatMap(([r, s]) => s.split(' ').map(p => [p, r])));
const TYPE_PLURAL = { allevamento: 'allevamenti', rivendita: 'rivenditori', cooperativa: 'cooperative', industria: 'industrie', distributore: 'distributori', consorzio: 'consorzi' };
const pctTxt = (x, tot) => (tot > 0 ? `${nf((x / tot) * 100, 0)}%` : '—');

const inP = (x, P) => typeof x === 'string' && x.slice(0, 10) >= P.from && x.slice(0, 10) <= P.to;
const shipsIn = (d, P) => (Array.isArray(d?.shipments) ? d.shipments : EMPTY).filter(s => inP(s.date, P));

/** Fatturato del periodo: chiusure mensili del gestionale se il periodo è fatto di mesi tutti chiusi, altrimenti consegne × prezzo. */
export function turnoverOf(d, P) {
  if (!d || !P?.from || !P?.to) return null;
  const whole = P.from.slice(8) === '01' && P.to === endOfMonth(P.to);
  if (whole) {
    let fr = null;
    try { fr = frozenFor(d, monthsIn(P)); } catch { fr = null; }
    if (fr && fr.revenueNet > 0) return { value: round(fr.revenueNet), quality: 'calcolato', method: `Somma dei ricavi netti delle ${monthsIn(P).length} chiusure mensili del gestionale (listino meno sconti), dati non revisionati.` };
  }
  const ships = shipsIn(d, P);
  if (!ships.length) return null;
  const rev = sum(ships, s => (+s.tonnes || 0) * (+s.price || 0));
  if (!(rev > 0)) return null;
  const all = (d.shipments || EMPTY).map(s => String(s.date || '').slice(0, 10)).filter(Boolean).sort();
  const first = all[0] > P.from ? all[0] : P.from;
  const cov = (daysBetween(first, P.to) + 1) / (daysBetween(P.from, P.to) + 1);
  return { value: round(rev), quality: cov >= 0.95 ? 'calcolato' : 'stimato', method: 'Consegne del periodo × prezzo applicato in bolla (ricavi netti gestionali, non revisionati).',
    note: cov >= 0.95 ? undefined : `Consegne registrate in FeedOS solo dal ${first.split('-').reverse().join('/')}: valore parziale.` };
}

/** Gruppi di prodotti del periodo (C1): per specie o categoria, con le quote sulle tonnellate consegnate. */
export function productsText(d, P) {
  const products = Array.isArray(d?.products) ? d.products : EMPTY;
  if (!products.length) return null;
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const ships = shipsIn(d, P);
  const t = {}, pack = {};
  let tot = 0;
  for (const s of ships) {
    const p = byId[s.productId];
    const g = p?.species ? SPECIES[p.species]?.name || p.species : p?.category || p?.family || 'altri prodotti';
    t[g] = (t[g] || 0) + (+s.tonnes || 0); tot += +s.tonnes || 0;
    const k = /sfus/i.test(p?.packaging || '') ? 'sfuso' : p?.packaging ? 'confezionato' : null;
    if (k) pack[k] = (pack[k] || 0) + (+s.tonnes || 0);
  }
  const family = SECTORS[sectorOf(d)]?.label || 'Prodotti';
  const active = products.filter(p => p.active !== false).length;
  if (!tot) return `${family}: ${active} prodotti a catalogo; nessuna consegna nel periodo.`;
  const groups = Object.entries(t).sort((a, b) => b[1] - a[1]);
  const head = groups.slice(0, 6).map(([g, v]) => `${g.toLowerCase()} ${pctTxt(v, tot)}`).join(', ');
  const rest = groups.length > 6 ? `, altri gruppi ${pctTxt(sum(groups.slice(6), x => x[1]), tot)}` : '';
  const pk = pack.sfuso || pack.confezionato ? `; ${pctTxt(pack.sfuso || 0, tot)} sfuso e ${pctTxt(pack.confezionato || 0, tot)} confezionato` : '';
  return `${family}: ${active} prodotti in ${groups.length} gruppi; quote sulle ${nf(tot)} t consegnate: ${head}${rest}${pk}.`;
}

/** Mercati del periodo (C1): regioni e tipi di cliente, con le quote dei ricavi. */
export function marketsText(d, P) {
  const ships = shipsIn(d, P);
  if (!ships.length) return null;
  const cust = Object.fromEntries((d.customers || EMPTY).map(c => [c.id, c]));
  const byReg = {}, byType = {}, ids = new Set();
  let tot = 0;
  for (const s of ships) {
    const c = cust[s.customerId], v = (+s.tonnes || 0) * (+s.price || 0);
    tot += v; ids.add(s.customerId);
    const reg = PROV[String(c?.province || '').toUpperCase()] || (c?.region || 'altre aree');
    byReg[reg] = (byReg[reg] || 0) + v;
    const ty = c?.type || 'altro';
    byType[ty] = byType[ty] || { v: 0, n: new Set() }; byType[ty].v += v; byType[ty].n.add(s.customerId);
  }
  if (!(tot > 0)) return null;
  const regs = Object.entries(byReg).sort((a, b) => b[1] - a[1]).map(([r, v]) => `${r} ${pctTxt(v, tot)}`).join(', ');
  const types = Object.entries(byType).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => `${x.n.size} ${TYPE_PLURAL[k] || k} (${pctTxt(x.v, tot)})`).join(', ');
  const country = d.settings?.esg18?.report?.country || d.settings?.company?.country || 'Italia';
  return `${country}; ricavi per regione: ${regs}. ${ids.size} clienti con consegne nel periodo: ${types}.`;
}

/** Relazioni commerciali principali (C1): concentrazione dei clienti e dei fornitori di materie prime. */
export function relationshipsText(d, P) {
  const ships = shipsIn(d, P);
  const lots = (Array.isArray(d?.ingLots) ? d.ingLots : EMPTY).filter(l => inP(l.date, P) && l.status !== 'bloccato');
  if (!ships.length && !lots.length) return null;
  const parts = [];
  if (ships.length) {
    const rev = {};
    let tot = 0;
    for (const s of ships) { const v = (+s.tonnes || 0) * (+s.price || 0); rev[s.customerId] = (rev[s.customerId] || 0) + v; tot += v; }
    const top = Object.values(rev).sort((a, b) => b - a);
    parts.push(`clienti: ${top.length} attivi, i primi 5 valgono il ${pctTxt(sum(top.slice(0, 5)), tot)} dei ricavi e il primo il ${pctTxt(top[0] || 0, tot)}`);
  }
  if (lots.length) {
    const val = {};
    let tot = 0;
    for (const l of lots) { const k = l.supplierId || l.supplier || '—'; const v = (+l.tonnes || 0) * (+l.price || 0); val[k] = (val[k] || 0) + v; tot += v; }
    const top = Object.values(val).sort((a, b) => b - a);
    parts.push(`fornitori di materie prime: ${top.length} con consegne nel periodo, i primi 5 coprono il ${pctTxt(sum(top.slice(0, 5)), tot)} del valore degli acquisti`);
  }
  const s = parts.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** Paese delle attività principali e sede dei beni significativi (B1). */
function countryText(d) {
  const r = d.settings?.esg18?.report || {}, c = d.settings?.company || {};
  const country = r.country || c.country || '';
  const site = [c.site, c.address].filter(Boolean).join(', ');
  if (!country && !site) return null;
  return { value: `${country || 'Italia'}${site ? `; ${site}` : ''}`, quality: country ? 'dichiarato' : 'default', note: country ? undefined : 'Paese di base: confermarlo nelle impostazioni del report.' };
}

/** Omissioni con motivo «riservato» (B1): dalle risposte dell'esercizio e dall'elenco permanente delle impostazioni. */
export function confidentialOmissions(d, periodKey, st = reportSettings(d)) {
  const ans = answersFor(d, periodKey);
  const ids = new Set(st.omitted.filter(id => typeof id === 'string'));
  for (const a of Object.values(ans)) if (a.omission === 'riservato') ids.add(a.dpId);
  return [...ids].filter(id => VS_DP[id]).sort((a, b) => VS_DP[a].order - VS_DP[b].order);
}

/** Datapoint propri del report per il periodo P (ESG o globale): solo quelli con un valore. */
export function ownDatapoints(d, P) {
  const out = {};
  if (!d || !P?.from || !P?.to) return out;
  const st = reportSettings(d), raw = isObj(d.settings?.esg18?.report) ? d.settings.esg18.report : {};
  const ans = answersFor(d, P.key);
  const put = (id, dp) => { if (dp && !isEmpty(dp.value)) out[id] = clean({ unit: VS_DP[id]?.unit ?? null, source: 'report.reportDatapoints', ...dp }); };
  const fromAns = id => answerDatapoint(ans[id], id);

  put('B1.option', { value: st.option, quality: raw.option ? 'dichiarato' : 'default', source: 'report.impostazioni', method: 'Opzione scelta nelle impostazioni del report.',
    note: raw.option ? undefined : 'Opzione di base: confermarla nelle impostazioni del report.' });
  const conf = confidentialOmissions(d, P.key, st);
  put('B1.omitted', { value: conf.length ? conf.map(id => `${id} ${VS_DP[id].label.it}`).join('; ') : 'nessuna informazione omessa', quality: 'dichiarato', source: 'report.omissioni',
    method: 'Elenco dei datapoint omessi con il motivo «informazione riservata o sensibile».' });
  put('B1.basis', { value: st.basis, quality: raw.basis ? 'dichiarato' : 'default', source: 'report.impostazioni', note: raw.basis ? undefined : 'Base di partenza: confermarla nelle impostazioni del report.' });
  if (st.basis === 'consolidato') put('B1.subsidiaries', fromAns('B1.subsidiaries'));
  const lf = fromAns('B1.legal-form') || (st.legalForm ? { value: st.legalForm, quality: 'dichiarato', source: 'report.impostazioni' } : d.settings?.company?.legalForm ? { value: d.settings.company.legalForm, quality: 'dichiarato', source: 'report.anagrafica' } : null);
  put('B1.legal-form', lf);
  const nace = naceOf(d), sec = SECTORS[sectorOf(d)];
  const naceSet = typeof raw.nace === 'string' && raw.nace.trim() === nace;
  put('B1.nace', { value: nace, quality: naceSet ? 'dichiarato' : 'default', source: 'report.impostazioni',
    note: nace === sec.nace ? `${sec.naceLabel}${naceSet ? '' : ' (codice di base del settore: confermarlo nelle impostazioni)'}` : undefined });
  put('B1.balance-sheet', fromAns('B1.balance-sheet') || (Number.isFinite(+st.balanceSheet) && +st.balanceSheet > 0 ? { value: +st.balanceSheet, quality: 'dichiarato', source: 'report.impostazioni', method: 'Totale dello stato patrimoniale del bilancio approvato.' } : null));
  const tv = fromAns('B1.turnover') || turnoverOf(d, P);
  put('B1.turnover', tv && { source: 'report.ricavi', ...tv });
  put('B1.country', fromAns('B1.country') || countryText(d));
  // C1: testi calcolati dai dati (i prodotti li può dare anche il pacchetto impronta, che viene prima nell'ordine)
  const mk = fromAns('C1.markets') || (() => { const v = marketsText(d, P); return v && { value: v, quality: 'calcolato', source: 'report.mercati', method: 'Ricavi delle consegne del periodo per regione (sigla di provincia del cliente) e per tipo di cliente.' }; })();
  put('C1.markets', mk);
  const rl = fromAns('C1.relationships') || (() => { const v = relationshipsText(d, P); return v && { value: v, quality: 'calcolato', source: 'report.relazioni', method: 'Concentrazione dei ricavi per cliente (consegne) e del valore degli acquisti per fornitore (lotti di materie prime accettati).' }; })();
  put('C1.relationships', rl);
  const pr = fromAns('C1.products') || (() => { const v = productsText(d, P); return v && { value: v, quality: 'calcolato', source: 'report.prodotti', method: 'Tonnellate consegnate nel periodo per gruppo di prodotti e per confezione.' }; })();
  put('C1.products', pr);
  put('C1.strategy', fromAns('C1.strategy'));
  // altri datapoint propri del report dichiarati come risposta
  for (const c of VS_DATAPOINTS) if (c.provider === 'report' && !out[c.id] && !(c.id === 'B1.subsidiaries' && st.basis !== 'consolidato')) put(c.id, fromAns(c.id));
  return out;
}
