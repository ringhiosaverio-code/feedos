/* FeedOS 18 · Governance ed evidenze (pacchetto WP6 «governance»): profilo dell'impresa per l'applicabilità degli obblighi,
 * calendario degli adempimenti dal pacchetto di contenuti (con ricorrenze, permessi e scadenze di certificati, evidenze,
 * politiche e controlli 231), matrice B2 e C2/C6 delle politiche, organo amministrativo (C9), registro delle evidenze con
 * impronta SHA-256 e copertura dei datapoint, B11/C7/C8, controllo delle dichiarazioni ambientali (esg-governance-claims.js),
 * segnali, sezione del report, KPI, regole della qualità dei dati, datapoint e scadenze per il registro.
 * Contratto (07-contract §2 e §4): firme fisse; funzioni pure (oggi da ctx.today o esgToday), nessuna eccezione su archivi vuoti.
 * Non importa i registri (kpis, dataquality, providers, signals, report, esg-registry, derived, store): sono loro a importarlo.
 * Due edizioni: gli obblighi del pacchetto hanno sectors ('mangimi', 'agrofarmaci') e si filtrano con sectorOf(d); i testi sono
 * neutri («prodotti», «stabilimento»); in DifesaOS registrazioni, schede di sicurezza e Seveso restano nell'area Regolatorio
 * (qui solo collegamento e stato, ricavati da agro-reg.js senza copiare i dati). */
import { sum, byId, addDays, addMonths, daysBetween, round, nf, dateIt, slug } from '../core/util.js';
import { esgSettings, esgToday, sectorOf, naceOf, currentPeriod, previousPeriod, SECTORS } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { T, deltaPhrase, listJoin } from './esg-nlg.js';
import { PACK_GOVERNANCE } from '../data/pack-governance.js';
import { POLICY_MATTERS, C6_TOPICS } from '../data/fields-governance.js';
import { VS_DATAPOINTS } from '../data/vsme-datapoints.js';
import { companyRole, filieraCalendarItems } from './esg-filiera.js';
import { climaCalendarItems } from './esg-clima.js';
import * as PERSONE from './esg-persone.js';
import * as PIANO from './esg-piano.js';
import * as RISCHI from './esg-rischi.js';
import * as AMBIENTE from './esg-ambiente.js';
import { art43Due, sdsGaps, sevesoIndex } from './agro-reg.js';
import { programmeCo2 } from './agro-co2.js';
import { checkClaim } from './esg-governance-claims.js';
import { META } from '../editions/meta.js';

export { checkClaim };

const EMPTY = Object.freeze([]);
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const has = v => v != null && String(v).trim() !== '';
const fin = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = s => typeof s === 'string' && ISO.test(s.slice(0, 10)) && s.length >= 10;
const d10 = s => String(s).slice(0, 10);
const inP = (x, P) => isIso(x) && d10(x) >= P.from && d10(x) <= P.to;
const todayOf = (d, ctx) => (ctx && typeof ctx.today === 'string' && ISO.test(ctx.today) ? ctx.today : esgToday(d));
const pctTxt = (v, k = 0) => (v == null || !Number.isFinite(v) ? '—' : `${nf(v * 100, k)}%`);
const cut = (t, n) => { const x = String(t || '').trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; };
const pl = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;
const LINK = id => ({ area: 'esg', tab: 'governance', ...(id ? { id } : {}) });
/** La scheda «Governance ed evidenze» esiste in questa edizione? (visibile in FeedOS e in DifesaOS; se un'edizione la nasconde, niente segnali né scadenze). */
export const GOV_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('governance'));

/* memoria per identità degli argomenti: pagina, cruscotto e segnali chiedono gli stessi conti più volte */
const CACHE = new Map();
function cached(name, deps, fn, max = 6) {
  let list = CACHE.get(name);
  if (!list) CACHE.set(name, (list = []));
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/* ---------------- impostazioni e pacchetto ---------------- */
export const GOV_DEFAULTS = Object.freeze({
  employees: null, accountable: '', flags: {},
  model231: { adopted: null, lastUpdate: null, odv: '' },
  whistle: { channel: false, provider: '', since: null },
  grievance: null,
  c8: { weapons: 0, tobacco: 0, fossil: 0, chemicals: null }, ungcViolation: false,
  windowDays: 180, coverageTarget: 0.8,
});
/** Impostazioni del pacchetto: settings.esg18.governance fuse con i valori di base. */
export function governanceSettings(d) { return esgSettings(d, 'governance', GOV_DEFAULTS); }
/** Pacchetto di contenuti in uso (integrato o importato più recente). */
export function governancePack(d) { return activePack(d, 'governance', PACK_GOVERNANCE) || { ...PACK_GOVERNANCE, origin: 'integrato' }; }

/* ---------------- profilo dell'impresa ---------------- */
export const FLAG_LABEL = {
  packer: 'confeziona prodotti in imballaggi di vendita', wasteProducer: 'produce rifiuti speciali', hazWaste: 'produce rifiuti pericolosi', fgas: 'apparecchiature con gas fluorurati',
  aua: 'autorizzazione unica ambientale', aia: 'autorizzazione integrata ambientale', cpi: 'attività soggetta a prevenzione incendi', wells: 'prelievo da pozzo in concessione',
  model231: 'Modello 231 adottato', emp50: 'almeno 50 dipendenti', large: 'grande impresa', energyIntensive: 'impresa energivora', b2c: 'vende anche al consumatore',
  iperammortamento: 'investimenti con iperammortamento', medicated: 'produce mangimi medicati', seveso: 'stabilimento soggetto alla Seveso', sevesoUpper: 'Seveso di soglia superiore',
  adr: 'spedisce merci pericolose (ADR)', ppp: 'prodotti fitosanitari registrati', copper: 'prodotti a base di rame', chemImports: 'importa sostanze chimiche', claims: 'usa dichiarazioni ambientali',
};
const yes = v => v === true || v === 'si' || v === 'sì';

/** Dipendenti: Persone e sicurezza (quando c'è), impostazioni, questionario ESG (somma per categoria), fascia del questionario. */
export function headcount(d) {
  try {
    const w = typeof PERSONE.workforce === 'function' ? PERSONE.workforce(d, currentPeriod(d).key) : null;
    const h = isObj(w) ? w.headcount ?? w.total ?? w.employees : null;
    if (fin(h) && +h > 0) return { value: +h, src: 'Persone e sicurezza' };
  } catch { /* il pacchetto persone risponde come può */ }
  const st = governanceSettings(d);
  if (fin(st.employees) && +st.employees > 0) return { value: +st.employees, src: 'impostazioni della governance' };
  const sv = isObj(d?.survey) ? d.survey : {};
  const cat = isObj(sv['pe-cat']) ? sum(Object.values(sv['pe-cat']), v => +v || 0) : 0;
  if (cat > 0) return { value: cat, src: 'questionario ESG (dipendenti per categoria)' };
  const band = { '1-10': 8, '11-50': 30, '51-250': 120, '>250': 300 }[sv['gen-emp']];
  return band ? { value: band, src: 'fascia del questionario ESG (stima)' } : { value: null, src: null };
}

/** Ricavi delle consegne in un intervallo (t × prezzo, € come nei motori). */
export function revenueIn(d, from, to, filter = null) {
  return sum(A(d?.shipments).filter(s => s && isIso(s.date) && s.date >= from && s.date <= to && (!filter || filter(s))), s => (fin(s.tonnes) ? +s.tonnes : 0) * (fin(s.price) ? +s.price : 0));
}

/**
 * Profilo per l'applicabilità: {sector, nace, employees, employeesSrc, revenue12, flags: {…}, eudrRole, sevesoTier, flagSrc}.
 * I flag si ricavano dai dati (prodotti, permessi, rifiuti, F-gas, registrazioni) e si possono forzare in settings.esg18.governance.flags.
 */
export function governanceProfile(d, today) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  return cached('profile|' + t, [d?.settings, d?.survey, d?.products, d?.permits, d?.fgasEquipment, d?.waste, d?.wasteRentri, d?.registrations, d?.activeSubstances, d?.claims, d?.shipments, d?.water, d?.hrSnapshots, d?.lots], () => {
    const st = governanceSettings(d), sector = sectorOf(d);
    const hc = headcount(d);
    const emp = hc.value;
    const revenue12 = revenueIn(d, addDays(t, -364), t);
    const permits = A(d?.permits).filter(p => p && has(p.kind));
    const kinds = new Set(permits.map(p => p.kind));
    const prods = A(d?.products).filter(p => p && p.active !== false);
    const reg = A(d?.registrations);
    let seveso = null;
    if (sector === 'agrofarmaci' && reg.length) { try { seveso = sevesoIndex(d)?.tier || null; } catch { seveso = null; } }
    let eudrRole = null;
    if (sector === 'mangimi') { try { eudrRole = companyRole(d)?.role || null; } catch { eudrRole = null; } }
    const bs = +(d?.settings?.esg18?.report?.balanceSheet ?? 0) || 0;
    const auto = {
      packer: prods.some(p => has(p.packaging) && !/sfus/i.test(p.packaging)),
      wasteProducer: A(d?.waste).length > 0 || A(d?.wasteRentri).length > 0 || (emp != null && emp > 10),
      hazWaste: A(d?.waste).some(w => w && w.hazardous) || A(d?.wasteRentri).some(w => w && w.hazardous),
      fgas: A(d?.fgasEquipment).length > 0,
      aua: kinds.has('AUA'), aia: kinds.has('AIA'), cpi: kinds.has('CPI'),
      wells: kinds.has('concessione pozzo') || A(d?.water).some(w => /pozz/i.test(String(w?.source || ''))),
      model231: !!st.model231?.adopted || yes(d?.survey?.['et-231']),
      emp50: emp != null && emp >= 50,
      large: emp != null && emp >= 250 && (revenue12 > 50e6 || bs > 43e6),
      energyIntensive: false, b2c: prods.some(p => /pet/i.test(String(p.species || ''))), iperammortamento: false, medicated: false,
      seveso: !!seveso && seveso !== 'non soggetto' || kinds.has('Seveso'), sevesoUpper: seveso === 'superiore',
      adr: prods.some(p => isObj(p.hazard?.adr) && has(p.hazard.adr.un)),
      ppp: reg.length > 0,
      copper: A(d?.activeSubstances).some(a => a && (a.id === 'rame' || /rame|copper/i.test(String(a.name || '')))) || prods.some(p => A(p.actives).some(x => x?.as === 'rame')),
      chemImports: sector === 'agrofarmaci' && reg.length > 0,
      claims: A(d?.claims).length > 0,
    };
    const flags = { ...auto }, flagSrc = {};
    for (const [k, v] of Object.entries(isObj(st.flags) ? st.flags : {})) if (typeof v === 'boolean') { flags[k] = v; flagSrc[k] = 'impostazione'; }
    return { sector, sectorLabel: SECTORS[sector]?.label || sector, nace: naceOf(d), employees: emp, employeesSrc: hc.src, revenue12, flags, flagSrc, eudrRole, sevesoTier: seveso, today: t };
  }, 4);
}

/** L'obbligo si applica al profilo? → {applies, reason}. */
export function obligationApplies(item, pr) {
  const w = isObj(item?.when) ? item.when : {};
  const e = pr?.employees;
  if (fin(w.employeesMin) && !(e != null && e >= +w.employeesMin)) return { applies: false, reason: e == null ? 'numero di dipendenti non noto' : `${nf(e)} dipendenti: sotto la soglia di ${w.employeesMin}` };
  if (fin(w.employeesMax) && e != null && e > +w.employeesMax) return { applies: false, reason: `${nf(e)} dipendenti: oltre ${w.employeesMax}` };
  for (const f of A(w.flags)) if (!pr?.flags?.[f]) return { applies: false, reason: `non pertinente (${FLAG_LABEL[f] || f}: no)` };
  if (A(w.anyFlags).length && !w.anyFlags.some(f => pr?.flags?.[f])) return { applies: false, reason: `non pertinente (${w.anyFlags.map(f => FLAG_LABEL[f] || f).join(' o ')}: no)` };
  if (A(w.eudrRoles).length && !w.eudrRoles.includes(pr?.eudrRole)) return { applies: false, reason: 'ruolo EUDR non interessato' };
  const why = [...A(w.flags), ...A(w.anyFlags).filter(f => pr?.flags?.[f])].map(f => FLAG_LABEL[f] || f);
  if (fin(w.employeesMin)) why.push(`${nf(e)} dipendenti`);
  return { applies: true, reason: why.length ? listJoin(why) : 'tutte le imprese' };
}

/* ---------------- ricorrenze ---------------- */
const lastDueOf = ci => A(ci?.done).map(x => x?.due).filter(isIso).map(d10).sort().at(-1) || null;
const lastDoneOf = ci => [...A(ci?.done).map(x => x?.at), ci?.lastDoneAt].filter(isIso).map(d10).sort().at(-1) || null;
const isDoneFor = (ci, date) => A(ci?.done).some(x => x && d10(String(x.due || '')) === date);
function annualAfter(md, after, inclusive) {
  let y = +after.slice(0, 4);
  for (let k = 0; k < 3; k++, y++) { const c = `${y}-${md}`; if (inclusive ? c >= after : c > after) return c; }
  return `${y}-${md}`;
}
/** Permesso più recente di un tipo (scadenza più lontana). */
export function permitOf(d, kind) {
  return A(d?.permits).filter(p => p && p.kind === kind && isIso(p.to)).sort((a, b) => (a.to < b.to ? 1 : -1))[0] || null;
}

/**
 * Prossima scadenza di un obbligo: {date, basis, done, lastDue, lastDone, missing}.
 * fixed: una volta (fatto = completamento registrato per quella data) · annual: dopo l'ultima scadenza completata (o, con la sola
 * data dell'ultimo completamento, l'ultima ricorrenza entro 120 giorni da quella data), altrimenti la prima da oggi · every: ultima
 * scadenza + mesi (o data indicata, o ultimo completamento + mesi) · permit: scadenza del permesso − anticipo · manual: data indicata.
 */
export function nextDue(rule, ci, d, today) {
  const r = isObj(rule) ? rule : { type: 'manual' };
  const lastDue = lastDueOf(ci), lastDone = lastDoneOf(ci);
  const out = { date: null, basis: r.type, done: false, lastDue, lastDone, missing: null };
  const own = isIso(ci?.due) ? d10(ci.due) : null;
  switch (r.type) {
    case 'fixed':
      if (!isIso(r.date)) { out.missing = 'data mancante nel pacchetto'; break; }
      if (isDoneFor(ci, r.date) || ci?.status === 'fatto') { out.done = true; break; }
      out.date = r.date; break;
    case 'annual': {
      if (!/^\d{2}-\d{2}$/.test(String(r.md || ''))) { out.missing = 'ricorrenza non valida'; break; }
      let ref = lastDue;
      if (!ref && lastDone) { const lim = addDays(lastDone, 120); let y = +lim.slice(0, 4); let c = `${y}-${r.md}`; if (c > lim) c = `${y - 1}-${r.md}`; ref = c; }
      out.date = ref ? annualAfter(r.md, ref, false) : own && own >= addDays(today, -366) ? own : annualAfter(r.md, today, true);
      break;
    }
    case 'every': {
      const m = Math.max(1, Math.round(+r.months || 12));
      if (lastDue) out.date = addMonths(lastDue, m);
      else if (own) out.date = own;
      else if (lastDone) out.date = addMonths(lastDone, m);
      else if (isIso(r.anchor)) { let x = d10(r.anchor); for (let k = 0; k < 240 && x < today; k++) x = addMonths(x, m); out.date = x; }
      else out.missing = 'da pianificare: indica la prima scadenza o l’ultimo completamento';
      break;
    }
    case 'permit': {
      const p = permitOf(d, r.kind);
      if (!p) { out.missing = `manca il permesso «${r.kind}» nel registro`; break; }
      const dt = addMonths(p.to, -Math.max(0, Math.round(+r.monthsBefore || 0)));
      if (isDoneFor(ci, dt)) { out.done = true; out.missing = 'domanda di rinnovo registrata'; break; }
      out.date = dt; out.permitId = p.id; out.permitTo = p.to; break;
    }
    case 'event': out.missing = 'si fa quando succede (nessuna data fissa)'; if (own) out.date = own; break;
    default: if (own && !isDoneFor(ci, own)) out.date = own; else if (own) out.done = true; else out.missing = 'indica la data della prossima scadenza';
  }
  return out;
}

/* ---------------- calendari degli altri pacchetti (per non duplicare le date) ---------------- */
const VIA_FNS = () => ({ clima: climaCalendarItems, filiera: filieraCalendarItems, persone: PERSONE.personeCalendarItems, rischi: RISCHI.rischiCalendarItems, piano: PIANO.pianoCalendarItems, ambiente: AMBIENTE.ambienteCalendarItems });
function viaKeys(d, today) {
  return cached('via|' + today, [d], () => {
    const out = [];
    for (const [pkg, fn] of Object.entries(VIA_FNS())) {
      if (typeof fn !== 'function') continue;
      let xs = [];
      try { xs = fn(d, today); } catch { xs = []; }
      for (const x of A(xs)) if (x && typeof x.key === 'string') out.push(pkg + '|' + x.key);
    }
    return out;
  }, 3);
}
const viaHit = (keys, via) => !!(isObj(via) && has(via.pkg) && keys.some(k => k.startsWith(via.pkg + '|') && (!has(via.key) || k.includes(via.key))));

/* ---------------- stato «esterno» (area Regolatorio di DifesaOS, scheda CO₂): letto, non copiato ---------------- */
export function extStatus(d, ext, today) {
  if (!isObj(ext) || !has(ext.status)) return null;
  try {
    if (ext.status === 'art43') { const xs = art43Due(d, today).filter(x => !x.done); const nx = xs[0]; return { n: xs.length, text: xs.length ? `${pl(xs.length, 'domanda di rinnovo da presentare', 'domande di rinnovo da presentare')}; ${xs.length === 1 ? 'entro' : 'la prima entro'} il ${dateIt(nx.due)}` : 'nessuna domanda di rinnovo in sospeso', bad: xs.some(x => x.daysLeft < 0) }; }
    if (ext.status === 'labels') { const xs = A(d?.registrations).filter(r => isIso(r?.relabelDeadline) && +r.oldLabelUnits > 0 && r.relabelDeadline >= today); return { n: xs.length, text: xs.length ? `${pl(xs.length, 'prodotto da rietichettare', 'prodotti da rietichettare')} ${xs.length === 1 ? 'entro' : 'a partire dal'} il ${dateIt(xs.map(r => r.relabelDeadline).sort()[0])}`.replace('a partire dal il', 'a partire dal') : 'nessuna rietichettatura in corso', bad: false }; }
    if (ext.status === 'sds') { const g = sdsGaps(d, today); return { n: g.missing, text: g.recipients ? `schede aggiornate presso il ${pctTxt(g.coverage)} dei destinatari (${pl(g.missing, 'invio mancante', 'invii mancanti')})` : 'nessun invio da controllare', bad: g.missing > 0 }; }
    if (ext.status === 'ufi') { const g = sdsGaps(d, today); const ko = g.ufi.filter(u => !u.ok); return { n: ko.length, text: ko.length ? `${pl(ko.length, 'prodotto', 'prodotti')} senza UFI o notifica PCN` : `UFI e notifica presenti per ${pl(g.ufi.length, 'prodotto pericoloso', 'prodotti pericolosi')}`, bad: ko.length > 0 }; }
    if (ext.status === 'seveso') { const s = sevesoIndex(d); const hi = Math.max(0, ...A(s.groups).map(g => g.hi)); return { n: A(s.over).length, text: `stabilimento di soglia ${s.tier}; indice più alto ${nf(hi * 100)}% della soglia superiore${A(s.over).length ? `; ${pl(s.over.length, 'categoria', 'categorie')} oltre la quantità notificata` : ''}`, bad: A(s.over).length > 0 }; }
    if (ext.status === 'copper') {
      const progs = A(d?.cropProgrammes).filter(p => p && !p.baseline).map(p => programmeCo2(d, p)).filter(Boolean);
      const over = progs.filter(p => !p.copperOk);
      const max = progs.length ? Math.max(...progs.map(p => +p.copperKgHa || 0)) : null;
      return { n: over.length, text: progs.length ? `rame nei programmi consigliati fino a ${nf(max, 1)} kg/ha all’anno${over.length ? `: ${pl(over.length, 'programma', 'programmi')} sopra la media di 4 kg/ha` : ', entro la media di 4 kg/ha'}` : 'nessun programma di difesa registrato', bad: over.length > 0 };
    }
  } catch { return null; }
  return null;
}

/* ---------------- obblighi applicabili e adempimenti ---------------- */
const RANK = { scaduto: 0, 'in scadenza': 1, 'in vigore': 2, 'da pianificare': 3, pianificato: 4, 'su evento': 5, altrove: 6, fatto: 7, 'non applicabile': 8 };
/** Adempimento collegato a un obbligo del pacchetto (una riga di complianceItems per obbligo). */
export const itemFor = (d, obligationId) => A(d?.complianceItems).find(c => c && c.obligationId === obligationId) || null;
const customRule = ci => (fin(ci?.recurrenceMonths) && +ci.recurrenceMonths > 0 ? { type: 'every', months: +ci.recurrenceMonths } : { type: 'manual' });

/**
 * Obblighi del pacchetto (filtrati per settore) più gli adempimenti propri dell'azienda, con applicabilità, prossima scadenza e stato.
 * opts.sector: 'tutti' per il catalogo completo (con sectorMatch). → [{id, item, ci, title, law, applies, reason, auto, owner, next, status, days, lead, via, ext, extState, sectorMatch, custom}]
 */
export function obligationsFor(d, today, opts = {}) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  const sector = opts.sector || sectorOf(d);
  return cached(`obl|${t}|${sector}`, [d?.complianceItems, d?.permits, d?.settings, d?.registrations, d?.survey, d?.products, d?.waste, d?.fgasEquipment, d?.claims, d?.cropProgrammes, d?.sdsDocs, d?.sdsDispatches, d?.lots, d?.shipments, d?.dcfLedger], () => {
    const pr = governanceProfile(d, t);
    const pack = governancePack(d);
    const via = viaKeys(d, t);
    const mySector = sectorOf(d);
    const rows = [];
    for (const it of A(pack.items).filter(isObj)) {
      const sectors = A(it.sectors).length ? it.sectors : ['mangimi', 'agrofarmaci'];
      const sectorMatch = sectors.includes(mySector);
      if (sector !== 'tutti' && !sectors.includes(sector)) continue;
      const ci = itemFor(d, it.id);
      const auto = obligationApplies(it, pr);
      const applies = !sectorMatch ? false : ci?.applies === true ? true : ci?.applies === false ? false : auto.applies;
      const reason = !sectorMatch ? `solo per il settore ${sectors.map(s => SECTORS[s]?.label || s).join(', ')}` : ci?.applies === false ? 'escluso dall’azienda' : ci?.applies === true && !auto.applies ? 'incluso dall’azienda' : auto.reason;
      const viaOn = applies && viaHit(via, it.via);
      const next = nextDue(it.due, ci, d, t);
      const lead = fin(it.lead) ? +it.lead : 30;
      let status;
      if (!applies) status = 'non applicabile';
      else if (viaOn) status = 'altrove';
      else if (next.done && !next.date) status = 'fatto';
      else if (!next.date) status = it.due?.type === 'event' ? 'su evento' : 'da pianificare';
      else if (next.date < t) status = it.kind === 'traguardo' ? 'in vigore' : 'scaduto';
      else if (daysBetween(t, next.date) <= lead) status = 'in scadenza';
      else status = 'pianificato';
      const extState = applies && it.ext ? extStatus(d, it.ext, t) : null;
      rows.push({ id: it.id, item: it, ci, title: it.title, law: it.law, topic: it.topic, kind: it.kind || 'scadenza', applies, auto: auto.applies, reason, owner: has(ci?.owner) ? ci.owner : it.owner || '', ownerSet: has(ci?.owner),
        next, date: next.date, days: next.date ? daysBetween(t, next.date) : null, lead, status, via: viaOn ? it.via : null, ext: it.ext || null, extState, sectorMatch, sectors, custom: false,
        source: it.source, validAsOf: it.validAsOf || pack.validAsOf, statusText: it.status, what: it.what, evidence: it.evidence, note: it.note, link: it.link || null });
    }
    // adempimenti propri (senza obbligo del pacchetto)
    const ids = new Set(A(pack.items).map(x => x?.id));
    for (const ci of A(d?.complianceItems)) {
      if (!ci || !has(ci.id) || (has(ci.obligationId) && ids.has(ci.obligationId))) continue;
      const rule = customRule(ci);
      const next = nextDue(rule, ci, d, t);
      const applies = ci.applies !== false && ci.status !== 'non applicabile';
      const status = !applies ? 'non applicabile' : next.done && !next.date ? 'fatto' : !next.date ? 'da pianificare' : next.date < t ? 'scaduto' : daysBetween(t, next.date) <= 30 ? 'in scadenza' : 'pianificato';
      rows.push({ id: 'ci:' + ci.id, item: { id: 'ci:' + ci.id, title: ci.title, law: ci.law, due: rule, kind: 'scadenza', owner: ci.owner }, ci, title: ci.title || 'Adempimento', law: ci.law || '', topic: 'governance', kind: 'scadenza',
        applies, auto: true, reason: 'adempimento dell’azienda', owner: ci.owner || '', ownerSet: has(ci.owner), next, date: next.date, days: next.date ? daysBetween(t, next.date) : null, lead: 30, status, via: null, ext: null, extState: null,
        sectorMatch: true, sectors: [mySector], custom: true, source: 'registro dell’azienda', validAsOf: null, statusText: null, what: ci.note || '', evidence: '', note: ci.note || '', link: null });
    }
    return rows.sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || String(a.date || '9999').localeCompare(String(b.date || '9999')) || a.title.localeCompare(b.title, 'it'));
  }, 4);
}

/* ---------------- scadenze di certificati, permessi, evidenze, politiche, controlli ---------------- */
/** Stato di un documento con scadenza: 'scaduto' | 'in scadenza' (entro days) | 'valido' | 'senza scadenza'. */
export function expiryState(to, today, days = 90) {
  if (!isIso(to)) return 'senza scadenza';
  return d10(to) < today ? 'scaduto' : daysBetween(today, d10(to)) <= days ? 'in scadenza' : 'valido';
}
/** Certificati, permessi ed evidenze in scadenza entro days (o scaduti): [{coll, id, title, to, days, state}]. */
export function expiries(d, today, days = 90) {
  const out = [];
  for (const c of A(d?.companyCerts)) if (c && isIso(c.to) && !c.supersededBy) { const st = expiryState(c.to, today, days); if (st !== 'valido') out.push({ coll: 'companyCerts', id: c.id, title: `${c.scheme}${c.number ? ' ' + c.number : ''}`, to: c.to, days: daysBetween(today, c.to), state: st }); }
  for (const p of A(d?.permits)) if (p && isIso(p.to) && !p.supersededBy) { const st = expiryState(p.to, today, Math.max(days, 180)); if (st !== 'valido') out.push({ coll: 'permits', id: p.id, title: `${p.kind}${p.number ? ' ' + p.number : ''}`, to: p.to, days: daysBetween(today, p.to), state: st }); }
  for (const e of A(d?.evidence)) if (e && isIso(e.expiresAt) && !e.supersededBy) { const st = expiryState(e.expiresAt, today, days); if (st !== 'valido') out.push({ coll: 'evidence', id: e.id, title: e.title || e.id, to: e.expiresAt, days: daysBetween(today, e.expiresAt), state: st }); }
  return out.sort((a, b) => (a.to < b.to ? -1 : 1));
}
/** Stato di una politica: {active, nextReview, reviewOverdue}. */
export function policyState(p, today) {
  const active = !!p && p.status !== 'bozza' && p.status !== 'ritirata' && (isIso(p.approvedAt) ? d10(p.approvedAt) <= today : p.status === 'approvata');
  const base = isIso(p?.reviewedAt) ? d10(p.reviewedAt) : isIso(p?.approvedAt) ? d10(p.approvedAt) : null;
  const nextReview = active && base && fin(p.reviewMonths) ? addMonths(base, Math.max(1, Math.round(+p.reviewMonths))) : null;
  return { active, nextReview, reviewOverdue: !!(nextReview && nextReview < today) };
}

/* ---------------- calendario (fornitore del registro) ---------------- */
/** Scadenze del pacchetto: obblighi applicabili con data (non già nel calendario di un'altra scheda), certificati, permessi, evidenze, riesami, controlli 231, dichiarazioni e (DifesaOS) rinnovi e rietichettature dell'area Regolatorio. */
export function governanceCalendarItems(d, today) {
  if (!GOV_TAB || !isObj(d)) return [];
  const t = isIso(today) ? d10(today) : esgToday(d);
  const pack = governancePack(d), out = [], keys = new Set();
  const push = it => { if (!isIso(it.date) || keys.has(it.key)) return; keys.add(it.key); out.push({ area: 'esg', pkg: 'governance', ...it, date: d10(it.date) }); };
  for (const o of obligationsFor(d, t)) {
    if (!o.applies || o.via || !o.date || o.status === 'fatto') continue;
    push({ key: `gov:obl:${o.id}:${o.date}`, date: o.date, title: o.title, kind: o.kind, law: o.law || undefined, source: o.source || undefined, validAsOf: o.validAsOf || undefined, owner: o.owner || undefined,
      link: LINK('calendario'), obligationId: o.id, status: o.statusText || undefined, govStatus: o.status, what: o.what || undefined, goto: o.link ? { area: 'esg', ...o.link } : o.ext || undefined });
  }
  for (const c of A(d?.companyCerts)) if (c && isIso(c.to) && !c.supersededBy && c.to >= addDays(t, -365))
    push({ key: `gov:cert:${c.id}:${d10(c.to)}`, date: c.to, title: `Scadenza della certificazione ${c.scheme}${c.number ? ' n. ' + c.number : ''}${c.issuer ? ` (${c.issuer})` : ''}`, kind: 'rinnovo', owner: 'Qualità', source: 'registro delle certificazioni', link: LINK('certificati-permessi') });
  for (const p of A(d?.permits)) if (p && isIso(p.to) && !p.supersededBy && p.to >= addDays(t, -365))
    push({ key: `gov:permit:${p.id}:${d10(p.to)}`, date: p.to, title: `Scadenza: ${p.kind}${p.number ? ' n. ' + p.number : ''}${p.authority ? ` (${p.authority})` : ''}`, kind: 'rinnovo', owner: 'Direzione', source: 'registro delle autorizzazioni', link: LINK('certificati-permessi') });
  for (const e of A(d?.evidence)) if (e && isIso(e.expiresAt) && !e.supersededBy && e.expiresAt >= addDays(t, -90))
    push({ key: `gov:ev:${e.id}:${d10(e.expiresAt)}`, date: e.expiresAt, title: `Evidenza in scadenza: ${e.title || e.id}`, kind: 'controllo', owner: 'Qualità', source: 'registro delle evidenze', link: LINK('evidenze') });
  for (const p of A(d?.policies)) { const s = policyState(p, t); if (s.nextReview) push({ key: `gov:policy:${p.id}:${s.nextReview}`, date: s.nextReview, title: `Riesame della politica «${p.title}»`, kind: 'controllo', owner: p.seniorAccountable || 'Direzione', source: 'registro delle politiche', link: LINK('politiche') }); }
  for (const c of A(d?.m231Controls)) if (c && isIso(c.lastTest) && fin(c.testMonths)) { const dt = addMonths(c.lastTest, Math.max(1, Math.round(+c.testMonths))); push({ key: `gov:m231:${c.id}:${dt}`, date: dt, title: `Verifica del controllo 231 «${cut(c.control, 70)}»`, kind: 'controllo', owner: c.owner || 'Organismo di vigilanza', source: 'Modello 231', link: LINK('231') }); }
  for (const c of A(d?.claims)) if (c && isIso(c.reviewAt) && c.status !== 'ritirato') push({ key: `gov:claim:${c.id}:${d10(c.reviewAt)}`, date: c.reviewAt, title: `Riesame della dichiarazione «${cut(c.text, 60)}»`, kind: 'controllo', owner: c.owner || 'Commerciale', source: 'registro delle dichiarazioni', link: LINK('claim') });
  if (sectorOf(d) === 'agrofarmaci' && A(d?.registrations).length) {
    const prods = byId(A(d?.products).filter(p => p && has(p.id)));
    try {
      for (const x of art43Due(d, t)) if (!x.done) push({ key: `gov:agro:art43:${x.registrationId}:${x.asId}`, date: x.due, title: `Domanda di rinnovo di ${prods[x.productId]?.name || x.productId} (sostanza ${x.asName} rinnovata il ${dateIt(x.renewedOn)})`, kind: 'scadenza', law: 'Reg. (CE) 1107/2009, art. 43', owner: 'Regolatorio', source: 'area Regolatorio', link: LINK('calendario'), goto: { area: 'regolatorio', tab: 'registrazioni', id: x.registrationId } });
    } catch { /* l'area Regolatorio risponde come può */ }
    for (const r of A(d?.registrations)) if (r && isIso(r.relabelDeadline) && +r.oldLabelUnits > 0 && r.relabelDeadline >= t)
      push({ key: `gov:agro:etichetta:${r.id}:${r.labelVersion ?? ''}`, date: r.relabelDeadline, title: `Rietichettatura di ${prods[r.productId]?.name || r.productId} (${nf(+r.oldLabelUnits)} confezioni)`, kind: 'scadenza', law: 'Reg. (CE) 1107/2009 · decreto di autorizzazione', owner: 'Regolatorio', source: 'area Regolatorio', link: LINK('calendario'), goto: { area: 'regolatorio', tab: 'registrazioni', id: r.id } });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
}

/**
 * Calendario completo: elenco già raccolto da tutti i pacchetti (collectCalendar) → finestra [oggi − passato, oggi + days] con stato.
 * Le voci di governance hanno già lo stato degli obblighi; le altre si classificano per data. → [{...item, days, state}]
 */
export function calendarWindow(all, today, days = 180, pastDays = 60) {
  const to = addDays(today, days), from = addDays(today, -pastDays);
  return A(all).filter(x => x && isIso(x.date) && x.date >= from && x.date <= to).map(x => {
    const n = daysBetween(today, x.date);
    return { ...x, days: n, state: n < 0 ? 'scaduto' : n <= 7 ? 'entro 7 giorni' : n <= 30 ? 'entro 30 giorni' : 'più avanti' };
  });
}

/* ---------------- politiche: matrice B2, C2 e C6 ---------------- */
export const B2_MATTERS = [
  { matter: 'clima', dp: 'B2.climate', label: 'Cambiamenti climatici' }, { matter: 'inquinamento', dp: 'B2.pollution', label: 'Inquinamento' }, { matter: 'acqua', dp: 'B2.water', label: 'Acque e risorse marine' },
  { matter: 'biodiversita', dp: 'B2.biodiversity', label: 'Biodiversità ed ecosistemi' }, { matter: 'circolarita', dp: 'B2.circular', label: 'Economia circolare' }, { matter: 'lavoratori', dp: 'B2.own-workforce', label: 'Forza lavoro propria' },
  { matter: 'filiera', dp: 'B2.value-chain-workers', label: 'Lavoratori nella catena del valore' }, { matter: 'comunita', dp: 'B2.communities', label: 'Comunità interessate' }, { matter: 'consumatori', dp: 'B2.consumers', label: 'Consumatori e utilizzatori finali' },
  { matter: 'condotta', dp: 'B2.business-conduct', label: 'Condotta delle imprese' },
];
/** Matrice B2: per tema pratiche, politiche, iniziative, se pubbliche e con obiettivi (solo politiche attive alla data). */
export function b2Matrix(d, date) {
  const t = isIso(date) ? d10(date) : esgToday(d);
  return cached('b2|' + t, [d?.policies], () => B2_MATTERS.map(m => {
    const items = A(d?.policies).filter(p => p && p.matter === m.matter && policyState(p, t).active);
    const drafts = A(d?.policies).filter(p => p && p.matter === m.matter && p.status === 'bozza');
    const k = kind => items.some(p => (p.kind || 'politica') === kind);
    return { ...m, practices: k('pratica'), policies: k('politica'), initiatives: k('iniziativa'), public: items.some(p => p.public === true), targets: items.some(p => p.hasTarget === true),
      covered: items.length > 0, items, drafts, accountable: [...new Set(items.map(p => p.seniorAccountable).filter(has))], evidenceIds: [...new Set(items.flatMap(p => [p.evidenceId, ...A(p.evidenceIds)]).filter(has))] };
  }), 4);
}
/** Quota dei temi B2 con almeno una pratica, politica o iniziativa attiva. */
export const b2Share = (d, date) => { const m = b2Matrix(d, date); return m.length ? m.filter(x => x.covered).length / m.length : null; };
const C6_KEYS = { 'lavoro minorile': 'childLabour', 'lavoro forzato': 'forcedLabour', tratta: 'trafficking', discriminazione: 'discrimination', 'prevenzione infortuni': 'accidents' };
/** C6: codice di condotta o politica sui diritti umani per la forza lavoro, temi coperti, meccanismo di reclamo. */
export function c6Coverage(d, date) {
  const t = isIso(date) ? d10(date) : esgToday(d);
  const pols = A(d?.policies).filter(p => p && ['lavoratori', 'condotta'].includes(p.matter) && policyState(p, t).active && A(p.covers).length);
  const topics = Object.fromEntries(C6_TOPICS.map(x => [C6_KEYS[x], pols.some(p => A(p.covers).includes(x))]));
  const st = governanceSettings(d);
  const grievance = typeof st.grievance === 'boolean' ? st.grievance : !!st.whistle?.channel;
  const code = pols.length > 0 || yes(d?.survey?.['et-code']);
  return { code, codeSrc: pols.length ? 'registro delle politiche' : code ? 'questionario ESG' : null, topics, covered: Object.values(topics).filter(Boolean).length, policies: pols, grievance };
}

/* ---------------- organo amministrativo (C9) ---------------- */
/** Composizione alla data: {members, women, men, other, ratio (donne/uomini), womenShare, independent, executive, esgSkill}. */
export function boardStats(d, date) {
  const t = isIso(date) ? d10(date) : esgToday(d);
  const ms = A(d?.boardMembers).filter(m => m && (!isIso(m.since) || d10(m.since) <= t) && (!isIso(m.until) || d10(m.until) >= t));
  const women = ms.filter(m => m.gender === 'donna').length, men = ms.filter(m => m.gender === 'uomo').length;
  return { members: ms.length, women, men, other: ms.length - women - men, ratio: men > 0 ? round(women / men, 2) : null, womenShare: ms.length ? women / ms.length : null,
    independent: ms.filter(m => m.independent).length, executive: ms.filter(m => m.executive).length, esgSkill: ms.filter(m => m.esgSkill).length, list: ms };
}

/* ---------------- evidenze ---------------- */
/**
 * Evidenze collegate a un record: righe di d.evidence non sostituite con links: [{type, ref}] (o type/ref diretti) che corrispondono.
 * type = 'datapoint' (ref = id del VS, es. 'B3.s1'), 'vs' (sinonimo) o il nome di una raccolta (ref = id del record). ref assente = tutte quelle del tipo.
 */
export function evidenceFor(d, type, ref) {
  const rows = A(d?.evidence);
  const hit = l => !!l && l.type === type && (ref == null || String(l.ref) === String(ref));
  return rows.filter(e => e && !e.supersededBy && ((Array.isArray(e.links) && e.links.some(hit)) || hit(e)));
}
/** Stato di un'evidenza: 'sostituita' | 'scaduta' | 'in scadenza' | 'valida'. */
export function evidenceState(e, today) {
  if (!e) return 'valida';
  if (e.supersededBy) return 'sostituita';
  const s = expiryState(e.expiresAt, today, 60);
  return s === 'scaduto' ? 'scaduta' : s === 'in scadenza' ? 'in scadenza' : 'valida';
}
/** Datapoint del VS che chiedono un'evidenza: obbligatori, calcolati dai pacchetti (non dalle impostazioni del report), numeri, sì/no e tabelle (i testi descrittivi no). */
export function evidenceTargets(d) {
  const withC = d?.settings?.esg18?.report?.option === 'basic+comprehensive';
  return VS_DATAPOINTS.filter(c => c.req === 'sempre' && c.provider !== 'report' && (c.module === 'B' || withC) && !/^B2\./.test(c.id) && ['num', 'bool', 'table'].includes(c.type)).map(c => c.id);
}
/** Copertura delle evidenze: datapoint del VS con almeno un'evidenza valida collegata (alla fine del periodo). datapoints = elenco o oggetto per limitare ai valori presenti. */
export function evidenceCoverage(d, P, datapoints = null) {
  const at = P?.to && isIso(P.to) ? d10(P.to) : esgToday(d);
  const from = P?.from && isIso(P.from) ? d10(P.from) : addDays(at, -364);
  let ids = evidenceTargets(d);
  if (isObj(datapoints)) ids = ids.filter(id => datapoints[id] && datapoints[id].quality !== 'mancante');
  return cached('cov|' + from + '|' + at + '|' + ids.length, [d?.evidence, d?.settings, ...(isObj(datapoints) ? [datapoints] : [])], () => {
    const covered = [], missing = [];
    for (const id of ids) {
      const dpEv = isObj(datapoints) ? A(datapoints[id]?.evidence) : EMPTY;
      const ok = dpEv.length > 0 || [...evidenceFor(d, 'datapoint', id), ...evidenceFor(d, 'vs', id)].some(e => !isIso(e.expiresAt) || d10(e.expiresAt) >= from);
      (ok ? covered : missing).push(id);
    }
    return { ids, covered, missing, share: ids.length ? covered.length / ids.length : null };
  }, 6);
}
/** Datapoint (oggetto {dpId: datapoint} di collectDatapoints) con valore ma senza evidenze collegate. */
export function missingEvidence(d, datapoints) {
  if (!isObj(datapoints)) return [];
  return Object.entries(datapoints).filter(([id, dp]) => dp && dp.quality !== 'mancante' && dp.value != null && !A(dp.evidence).length && !evidenceFor(d, 'datapoint', id).length && !evidenceFor(d, 'vs', id).length).map(([id]) => id);
}
/** Impronte ripetute tra le evidenze non sostituite: [{sha256, ids}]. */
export function duplicateHashes(d) {
  const by = new Map();
  for (const e of A(d?.evidence)) if (e && !e.supersededBy && /^[0-9a-f]{64}$/.test(String(e.sha256 || ''))) { if (!by.has(e.sha256)) by.set(e.sha256, []); by.get(e.sha256).push(e.id); }
  return [...by.entries()].filter(([, ids]) => ids.length > 1).map(([sha256, ids]) => ({ sha256, ids }));
}
/** Byte degli allegati registrati nell'archivio del browser (dai metadati delle evidenze). */
export const storageUsed = d => sum(A(d?.evidence).filter(e => e && e.storage === 'archivio'), e => (fin(e.size) ? +e.size : 0));
export const STORAGE_MAX = 200 * 1024 * 1024;

/* ---------------- dichiarazioni ---------------- */
/** Esito del controllo di una dichiarazione del registro (con le sue evidenze). */
export function claimCheck(d, c) {
  const ev = A(c?.evidenceIds).map(id => A(d?.evidence).find(e => e && e.id === id)).filter(Boolean);
  return checkClaim(c?.text || '', { d, evidence: ev, channel: c?.channel, today: esgToday(d) });
}
/** Registro delle dichiarazioni con l'esito: [{...claim, check, evidence}]. */
export function claimsView(d) {
  return cached('claims', [d?.claims, d?.evidence, d?.dcfLedger, d?.settings], () => A(d?.claims).filter(c => c && has(c.id)).map(c => ({ ...c, check: claimCheck(d, c), evidence: A(c.evidenceIds).filter(id => A(d?.evidence).some(e => e?.id === id)) })), 4);
}

/* ---------------- B11, C7, C8 ---------------- */
/** B11: condanne e sanzioni per corruzione nel periodo. */
export function b11(d, P) {
  const rows = A(d?.legalCases).filter(c => c && c.kind === 'corruzione' && inP(c.date, P));
  return { convictions: rows.filter(c => c.conviction === true).length, fines: sum(rows, c => (fin(c.fineEur) ? +c.fineEur : 0)), cases: rows };
}
/** C7: incidenti confermati sui diritti umani (forza lavoro propria; catena del valore, comunità, consumatori). */
export function c7(d, P) {
  const rows = A(d?.legalCases).filter(c => c && c.kind === 'diritti-umani' && c.conviction === true && inP(c.date, P));
  const own = rows.filter(c => (c.scope || 'forza lavoro propria') === 'forza lavoro propria' || c.scope === 'impresa');
  const chain = rows.filter(c => ['catena del valore', 'comunità', 'consumatori'].includes(c.scope));
  return { own, chain };
}
/** Prodotto della NACE 20.2 (agrofarmaci): ha sostanze attive registrate; un archivio con NACE 20.2 senza dettaglio conta tutti i prodotti. */
const isChemProduct = (d, p) => A(p?.actives).length > 0 || (/^20\.2/.test(naceOf(d)) && !A(d?.products).some(x => A(x?.actives).length));
/** C8: ricavi da armi controverse, tabacco, combustibili fossili e prodotti chimici della NACE 20.2 nel periodo, esclusione dagli indici UE allineati a Parigi. */
export function c8(d, P) {
  const st = governanceSettings(d), c = isObj(st.c8) ? st.c8 : {};
  const prods = byId(A(d?.products).filter(p => p && has(p.id)));
  const total = revenueIn(d, P.from, P.to);
  const chemAuto = sectorOf(d) === 'agrofarmaci' || /^20\.2/.test(naceOf(d)) ? revenueIn(d, P.from, P.to, s => isChemProduct(d, prods[s.productId])) : 0;
  const chem = fin(c.chemicals) ? +c.chemicals : chemAuto;
  const rows = [
    { key: 'weapons', label: 'Armi controverse', value: fin(c.weapons) ? +c.weapons : 0, src: 'dichiarato' },
    { key: 'tobacco', label: 'Coltivazione e produzione di tabacco', value: fin(c.tobacco) ? +c.tobacco : 0, src: 'dichiarato' },
    { key: 'fossil', label: 'Combustibili fossili (carbone, petrolio, gas)', value: fin(c.fossil) ? +c.fossil : 0, src: 'dichiarato' },
    { key: 'chemicals', label: 'Prodotti chimici: agrofarmaci (NACE 20.2)', value: round(chem, 0), src: fin(c.chemicals) ? 'dichiarato' : 'calcolato' },
  ];
  const excluded = rows[0].value > 0 || rows[1].value > 0 || st.ungcViolation === true || (total > 0 && rows[2].value / total >= 0.01);
  return { rows, total: round(total, 0), chemShare: total > 0 ? chem / total : null, excluded, chemAuto: !fin(c.chemicals) };
}

/* ---------------- adempimenti nei tempi (KPI) ---------------- */
/** Completamenti con scadenza nel periodo fatti entro la scadenza ÷ (completamenti con scadenza nel periodo + scadenze del periodo già passate e non fatte). */
export function onTimeShare(d, P, today) {
  const t = isIso(today) ? d10(today) : esgToday(d);
  let onTime = 0, total = 0;
  for (const ci of A(d?.complianceItems)) for (const x of A(ci?.done)) if (x && isIso(x.due) && inP(x.due, P)) { total++; if (isIso(x.at) && d10(x.at) <= d10(x.due)) onTime++; }
  for (const o of obligationsFor(d, t)) if (o.applies && o.status === 'scaduto' && o.date && inP(o.date, P)) total++;
  return total ? onTime / total : null;
}

/* ---------------- riepilogo per la pagina ---------------- */
/** Modello di lettura della scheda (periodo P per i datapoint e i KPI, oggi per lo stato delle scadenze). */
export function governanceSummary(d, P) {
  if (!isObj(d)) return null;
  const PP = P && isIso(P.from) ? P : currentPeriod(d);
  const today = esgToday(d);
  const obl = obligationsFor(d, today).filter(o => o.applies);
  const by = s => obl.filter(o => o.status === s).length;
  const claims = claimsView(d);
  const board = boardStats(d, PP.to), cov = evidenceCoverage(d, PP), b2 = b2Matrix(d, PP.to);
  const ws = A(d?.whistleStats).filter(w => w && fin(w.year)).sort((a, b) => b.year - a.year);
  const ctr = A(d?.m231Controls);
  return {
    period: { key: PP.key || null, from: PP.from, to: PP.to, label: PP.label || '' }, today, profile: governanceProfile(d, today), pack: governancePack(d),
    obligations: { n: obl.length, overdue: by('scaduto'), soon: by('in scadenza'), planned: by('pianificato'), unplanned: by('da pianificare'), event: by('su evento'), elsewhere: by('altrove'), done: by('fatto'),
      onTime: onTimeShare(d, PP, today), next: obl.filter(o => o.date && o.status !== 'fatto' && o.status !== 'altrove').sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 6) },
    expiries: expiries(d, today, 90),
    b2: { rows: b2, share: b2.length ? b2.filter(x => x.covered).length / b2.length : null, drafts: A(d?.policies).filter(p => p?.status === 'bozza').length, reviewsDue: A(d?.policies).filter(p => policyState(p, today).reviewOverdue).length },
    c6: c6Coverage(d, PP.to), board,
    evidence: { n: A(d?.evidence).filter(e => e && !e.supersededBy).length, coverage: cov, duplicates: duplicateHashes(d), storage: storageUsed(d), expired: A(d?.evidence).filter(e => evidenceState(e, today) === 'scaduta').length },
    claims: { n: claims.length, blocked: claims.filter(c => c.check.verdict === 'bloccata' && c.status !== 'ritirato').length, review: claims.filter(c => c.check.verdict === 'da rivedere' && c.status !== 'ritirato').length,
      published: claims.filter(c => c.status === 'pubblicato').length, publishedBad: claims.filter(c => c.status === 'pubblicato' && !c.check.ok).length },
    m231: { adopted: governanceProfile(d, today).flags.model231, controls: ctr.length, tested: ctr.filter(c => isIso(c.lastTest) && d10(c.lastTest) >= addDays(today, -365)).length, weak: ctr.filter(c => ['da migliorare', 'non efficace'].includes(c.outcome)).length,
      odv: A(d?.odvReports).filter(r => r && inP(r.date, PP)).length },
    whistle: ws[0] || null, legal: { b11: b11(d, PP), c7: c7(d, PP), c8: c8(d, PP) },
  };
}

/* ---------------- segnali di «Oggi» ---------------- */
const OWNER_ROLE = [[/qualit/i, 'qualita'], [/commerc/i, 'commerciale'], [/acquist/i, 'acquisti'], [/produz|manutenz|rspp|logistic/i, 'produzione'], [/regolator/i, 'formulazione']];
const roleOf = owner => OWNER_ROLE.find(([re]) => re.test(String(owner || '')))?.[1] || null;
/** Segnali: scadenze entro 30 giorni o scadute, certificati e permessi in scadenza, riesami delle politiche, evidenze mancanti, dichiarazioni a rischio, spazio degli allegati. */
export function governanceSignals(d, ctx) {
  if (!GOV_TAB || !isObj(d)) return [];
  const has231 = A(d.complianceItems).length || A(d.policies).length || A(d.companyCerts).length || A(d.permits).length || A(d.claims).length || A(d.evidence).length;
  if (!has231) return [];
  const today = todayOf(d, ctx), out = [];
  for (const o of obligationsFor(d, today)) {
    if (!o.applies || o.via || !o.date || !['scaduto', 'in scadenza'].includes(o.status) || o.days > 30) continue;
    const over = o.days < 0;
    const r = roleOf(o.owner);
    out.push({ key: `gov:deadline:${o.id}:${o.date}`, area: 'esg', roles: [...new Set(['direzione', 'qualita', ...(r ? [r] : [])])], severity: over ? 'critico' : 'attenzione',
      title: over ? `Scaduto: ${o.title}` : `${o.title}: entro il ${dateIt(o.date)}`,
      why: `${over ? `Scadenza del ${dateIt(o.date)} passata da ${-o.days} giorni` : o.days === 0 ? 'Scade oggi' : `Mancano ${o.days} giorni`}. ${o.law ? `Norma: ${o.law}. ` : ''}Responsabile: ${o.owner || 'da assegnare'}.${o.statusText === 'da verificare' ? ' Data da verificare con il consulente.' : ''}`,
      action: `${o.what || 'Completare l’adempimento'} Poi segnarlo come fatto con l’evidenza in ESG › Governance › Calendario.`, impact: over ? 9e4 : o.days <= 7 ? 6e4 : 3e4 - o.days * 300, link: LINK('calendario') });
  }
  for (const x of expiries(d, today, 90)) {
    if (x.coll === 'evidence') continue;
    const cert = x.coll === 'companyCerts';
    if (!cert && x.state === 'in scadenza' && x.days > 180) continue;
    out.push({ key: `gov:${cert ? 'cert' : 'permit'}-expiry:${x.id}`, area: 'esg', roles: cert ? ['qualita'] : ['qualita', 'direzione'], severity: 'attenzione',
      title: `${cert ? 'Certificazione' : 'Autorizzazione'} ${x.title} ${x.days < 0 ? 'scaduta' : `in scadenza il ${dateIt(x.to)}`}`,
      why: x.days < 0 ? `Scaduta da ${-x.days} giorni: clienti, banche e questionari la chiedono valida.` : `Mancano ${x.days} giorni${cert ? ': l’audit di rinnovo va fissato con l’ente prima della scadenza' : ': la domanda di rinnovo richiede un anticipo (per l’AUA almeno 6 mesi)'}.`,
      action: cert ? 'Fissare l’audit di rinnovo e caricare il nuovo certificato tra le evidenze.' : 'Preparare la domanda di rinnovo e registrare la ricevuta.', impact: x.days < 0 ? 5e4 : 2.5e4, link: LINK('certificati-permessi') });
  }
  for (const p of A(d.policies)) {
    const s = policyState(p, today);
    if (s.reviewOverdue) out.push({ key: `gov:policy-review:${p.id}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `Politica da riesaminare: «${p.title}»`,
      why: `Il riesame era previsto entro il ${dateIt(s.nextReview)} (ogni ${p.reviewMonths} mesi).`, action: 'Riesaminare la politica, aggiornarla se serve e registrare la nuova approvazione.', impact: 5000, link: LINK('politiche') });
  }
  const P = currentPeriod(d), cov = evidenceCoverage(d, P), st = governanceSettings(d);
  const target = fin(st.coverageTarget) ? +st.coverageTarget : 0.8;
  if (A(d.evidence).length && cov.share != null && cov.share < target && cov.missing.length)
    out.push({ key: `gov:evidence-missing:${P.key}`, area: 'esg', roles: ['qualita'], severity: 'attenzione', title: `${cov.missing.length} datapoint del VS senza evidenza`,
      why: `Evidenze collegate al ${pctTxt(cov.share)} dei datapoint obbligatori dell’esercizio ${P.label} (obiettivo ${pctTxt(target)}); mancano tra gli altri ${listJoin(cov.missing.slice(0, 4))}.`,
      action: 'Collegare fatture, letture, registri o certificati ai datapoint in ESG › Governance › Evidenze.', impact: 2e4 + cov.missing.length * 500, link: LINK('evidenze') });
  for (const c of claimsView(d)) {
    if (c.status === 'ritirato' || c.check.ok) continue;
    const pub = c.status === 'pubblicato';
    if (!pub && c.check.verdict !== 'bloccata') continue;
    out.push({ key: `gov:claim-risk:${c.id}`, area: 'esg', roles: ['commerciale', 'direzione'], severity: pub && c.check.verdict === 'bloccata' ? 'critico' : 'attenzione',
      title: `Dichiarazione ${c.check.verdict}${pub ? ' già pubblicata' : ' in bozza'}: «${cut(c.text, 60)}»`,
      why: `${c.check.findings[0]?.msg || 'Dichiarazione da rivedere'} (${c.channel || 'canale non indicato'}). Dal 27/09/2026 valgono le regole contro il greenwashing.`,
      action: pub ? 'Ritirare o correggere il testo dove è pubblicato e registrare la correzione.' : 'Riformulare il testo prima di pubblicarlo: nel registro il controllo indica cosa cambiare.', impact: pub ? 1.2e5 : 2e4, link: LINK('claim') });
  }
  const used = storageUsed(d);
  if (used > 0.8 * STORAGE_MAX) { const pct = Math.round(used / STORAGE_MAX * 100); out.push({ key: `gov:storage:${pct}`, area: 'esg', roles: ['direzione'], severity: 'info', title: `Allegati delle evidenze al ${pct}% dello spazio`, why: `${nf(used / 1048576, 0)} MB su ${nf(STORAGE_MAX / 1048576)} MB disponibili nel browser.`, action: 'Togliere gli allegati sostituiti o tenerli solo con percorso e impronta.', impact: 1000, link: LINK('evidenze') }); }
  return out;
}

/* ---------------- sezione del report «Governance ed evidenze» (86) ---------------- */
export function governanceReportSection(d, ctx, P, C) {
  if (!GOV_TAB || !isObj(d) || !P || !isIso(P.from)) return null;
  if (!A(d.complianceItems).length && !A(d.policies).length && !A(d.companyCerts).length && !A(d.evidence).length && !A(d.claims).length) return null;
  const today = todayOf(d, ctx);
  const obl = obligationsFor(d, today).filter(o => o.applies);
  const overdue = obl.filter(o => o.status === 'scaduto');
  const on = onTimeShare(d, P, today), onC = C && isIso(C.from) && !C.budget ? onTimeShare(d, C, today) : null;
  const exp = expiries(d, today, 90).filter(x => x.coll !== 'evidence');
  const b2 = b2Matrix(d, P.to), b2s = b2.filter(x => x.covered).length / b2.length;
  const cov = evidenceCoverage(d, P);
  const cl = claimsView(d).filter(c => c.status !== 'ritirato');
  const next = obl.filter(o => o.date && o.date >= today && daysBetween(today, o.date) <= 90 && !o.via && o.status !== 'fatto').sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 8);
  const kpis = [
    { label: 'Adempimenti fatti nei tempi', value: on, unit: '%', decimals: 0, status: on == null ? undefined : on >= 0.95 ? 'ok' : on >= 0.85 ? 'warn' : 'bad', cmp: onC != null ? { value: onC, kind: 'ratio', good: 'up', label: C.label || 'periodo di confronto' } : undefined },
    { label: 'Adempimenti scaduti', value: overdue.length, unit: '', decimals: 0, status: overdue.length ? 'bad' : 'ok' },
    { label: 'Scadenze nei prossimi 90 giorni', value: next.length, unit: '', decimals: 0, note: exp.length ? `più ${exp.length} certificati o permessi in scadenza` : undefined },
    { label: 'Temi B2 con una politica o pratica', value: b2s, unit: '%', decimals: 0, status: b2s >= 0.8 ? 'ok' : b2s >= 0.5 ? 'warn' : 'bad' },
    { label: 'Datapoint con evidenza', value: cov.share, unit: '%', decimals: 0, status: cov.share == null ? undefined : cov.share >= 0.8 ? 'ok' : cov.share >= 0.6 ? 'warn' : 'bad' },
    { label: 'Dichiarazioni ambientali bloccate', value: cl.filter(c => c.check.verdict === 'bloccata').length, unit: '', decimals: 0, note: `${cl.length} controllate` },
  ];
  const narrative = [];
  narrative.push(`${obl.length} obblighi applicabili all’impresa (${governanceProfile(d, today).sectorLabel.toLowerCase()}, ${governanceProfile(d, today).employees ?? 'n.d.'} dipendenti): ${overdue.length ? `${overdue.length} scaduti (${listJoin(overdue.slice(0, 3).map(o => `«${o.title}»`))})` : 'nessuno scaduto'}${on != null ? `; adempimenti del periodo fatti nei tempi: ${pctTxt(on)}${onC != null ? `, ${deltaPhrase(on * 100, onC * 100, { good: 'up', unit: '%' })}` : ''}` : ''}.`);
  if (next.length) narrative.push(`Prossime scadenze: ${listJoin(next.slice(0, 3).map(o => `«${o.title}» (${dateIt(o.date)})`))}.`);
  if (exp.length) narrative.push(`In scadenza entro 90 giorni: ${listJoin(exp.map(x => `${x.title} (${dateIt(x.to)})`))}.`);
  narrative.push(`Politiche: ${b2.filter(x => x.covered).length} temi del B2 su ${b2.length} con pratiche, politiche o iniziative${b2.some(x => !x.covered) ? `; scoperti ${listJoin(b2.filter(x => !x.covered).map(x => x.label.toLowerCase()))}` : ''}.`);
  const blocked = cl.filter(c => c.check.verdict === 'bloccata'), blockedPub = blocked.filter(c => c.status === 'pubblicato');
  narrative.push(`Evidenze collegate al ${pctTxt(cov.share)} dei datapoint obbligatori del VS; ${cl.length} dichiarazioni ambientali controllate${blocked.length ? `, ${blocked.length} bloccate (${blockedPub.length ? `${blockedPub.length} già pubblicate: da ritirare` : 'nessuna pubblicata'})` : ''}.`);
  narrative.push(T('disclaimer'));
  return {
    id: 'esg-governance', title: 'Governance ed evidenze', order: 86, kpis,
    table: { cols: [{ key: 'data', label: 'Scadenza', fmt: 'text' }, { key: 'adempimento', label: 'Adempimento', fmt: 'text' }, { key: 'norma', label: 'Norma', fmt: 'text' }, { key: 'responsabile', label: 'Responsabile', fmt: 'text' }, { key: 'stato', label: 'Stato', fmt: 'text' }],
      rows: next.map(o => ({ data: dateIt(o.date), adempimento: o.title, norma: o.law || '—', responsabile: o.owner || '—', stato: o.status + (o.statusText === 'da verificare' ? ' (data da verificare)' : '') })) },
    narrative,
  };
}

/* ---------------- KPI (catalogo, area esg) ---------------- */
export const GOVERNANCE_KPIS = [
  { id: 'esg-scadenze-ok', label: 'Adempimenti fatti nei tempi', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'governance', id: 'calendario' }, decimals: 0, hist: false, src: 'complianceItems',
    def: 'Adempimenti con scadenza nel periodo completati entro la scadenza ÷ (adempimenti con scadenza nel periodo completati + scadenze del periodo già passate e non completate). Obblighi dal pacchetto di contenuti «governance» filtrati per settore e profilo dell’impresa.',
    compute: (d, ctx, P) => onTimeShare(d, P, todayOf(d, ctx)) },
  { id: 'esg-evidenze', label: 'Datapoint del VS con evidenza', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'governance', id: 'evidenze' }, decimals: 0, hist: false, src: 'evidence',
    def: 'Datapoint obbligatori del VS calcolati dai pacchetti (B e, se scelto, C) con almeno un documento valido collegato nel registro delle evidenze ÷ datapoint obbligatori.',
    compute: (d, ctx, P) => (A(d?.evidence).length ? evidenceCoverage(d, P).share : null) },
  { id: 'esg-politiche', label: 'Temi B2 coperti da politiche', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'governance', id: 'politiche' }, decimals: 0, hist: false, src: 'policies',
    def: 'Temi di sostenibilità del B2 del VS (dieci) con almeno una pratica, politica o iniziativa approvata e attiva alla fine del periodo ÷ 10.',
    compute: (d, ctx, P) => (A(d?.policies).length ? b2Share(d, P.to) : null) },
];

/* ---------------- regole della qualità dei dati R42-R45 ---------------- */
export const GOVERNANCE_RULES = [
  { id: 'R42', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Evidenza scaduta collegata a un datapoint',
    check: (d, ctx) => {
      const t = todayOf(d, ctx);
      const rows = A(d?.evidence).filter(e => e && !e.supersededBy && A(e.links).some(l => l && (l.type === 'datapoint' || l.type === 'vs')));
      return { base: rows.length, fails: rows.filter(e => isIso(e.expiresAt) && d10(e.expiresAt) < t).map(e => ({ id: e.id, coll: 'evidence', msg: `«${e.title || e.id}» scaduta il ${dateIt(e.expiresAt)} ma collegata a ${A(e.links).filter(l => l.type === 'datapoint' || l.type === 'vs').map(l => l.ref).join(', ')}`, link: LINK('evidenze') })) };
    } },
  { id: 'R43', area: 'esg', severity: 'info', weight: 1, scope: ['all', 'import'], label: 'Evidenze con la stessa impronta',
    check: d => { const dup = duplicateHashes(d); return { base: A(d?.evidence).length, fails: dup.flatMap(x => x.ids.slice(1).map(id => ({ id, coll: 'evidence', msg: `Stesso file (SHA-256 ${x.sha256.slice(0, 12)}…) di ${x.ids[0]}`, link: LINK('evidenze') }))) }; } },
  { id: 'R44', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all'], label: 'Adempimento senza responsabile',
    check: (d, ctx) => {
      const rows = obligationsFor(d, todayOf(d, ctx)).filter(o => o.applies && o.status !== 'fatto' && o.status !== 'altrove');
      return { base: rows.length, fails: rows.filter(o => !has(o.owner)).map(o => ({ id: o.ci?.id || o.id, coll: 'complianceItems', msg: `«${o.title}»: nessun responsabile assegnato`, link: LINK('calendario') })) };
    } },
  { id: 'R45', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Dichiarazione pubblicata senza evidenze',
    check: d => { const rows = A(d?.claims).filter(c => c && c.status === 'pubblicato'); return { base: rows.length, fails: rows.filter(c => !A(c.evidenceIds).length).map(c => ({ id: c.id, coll: 'claims', msg: `«${String(c.text || '').slice(0, 60)}» pubblicata senza documenti a supporto`, link: LINK('claim') })) }; } },
];

/* ---------------- datapoint del VS/VSME ---------------- */
const dp = (value, unit, quality, fn, extra = {}) => ({ value, unit, quality, source: `governance.${fn}`, ...extra });
const evIds = (d, id) => [...new Set([...evidenceFor(d, 'datapoint', id), ...evidenceFor(d, 'vs', id)].map(e => e.id))];
/** Datapoint: B1 (certificazioni), B2 (matrice delle politiche), B11, C2, C6, C7, C8, C9. */
export function governanceDatapoints(d, P) {
  if (!isObj(d) || !P || !isIso(P.from)) return {};
  const out = {};
  const ev = id => { const x = evIds(d, id); return x.length ? { evidence: x } : {}; };
  const certs = A(d.companyCerts).filter(c => c && has(c.scheme) && (!isIso(c.from) || d10(c.from) <= P.to) && (!isIso(c.to) || d10(c.to) >= P.to) && !c.supersededBy);
  if (certs.length) out['B1.certifications'] = dp(certs.map(c => `${c.scheme}${c.issuer ? ` · ${c.issuer}` : ''}${c.number ? ` · n. ${c.number}` : ''}${isIso(c.to) ? ` · valida fino al ${dateIt(c.to)}` : ''}${fin(c.score) ? ` · punteggio ${c.score}` : ''}`), null, 'dichiarato', 'companyCerts',
    { method: 'Certificazioni valide alla fine del periodo (registro delle certificazioni)', evidence: [...new Set([...certs.map(c => c.evidenceId).filter(has), ...evIds(d, 'B1.certifications')])] });
  if (A(d.policies).length) {
    for (const m of b2Matrix(d, P.to)) out[m.dp] = dp({ practices: m.practices, policies: m.policies, initiatives: m.initiatives, public: m.public, targets: m.targets }, null, 'dichiarato', 'b2Matrix',
      { method: 'Politiche approvate e attive alla fine del periodo, per tema (registro delle politiche)', note: m.items.length ? listJoin(m.items.map(p => p.title)) : 'nessuna politica attiva sul tema', ...(m.evidenceIds.length ? { evidence: m.evidenceIds } : ev(m.dp)) });
    const act = A(d.policies).filter(p => policyState(p, P.to).active);
    if (act.length) out['C2.description'] = dp(act.map(p => `${p.title} (${p.kind || 'politica'}${p.hasTarget && p.target ? `; obiettivo: ${p.target}` : ''}${p.public ? '; pubblica' : ''})${p.description ? ': ' + p.description : ''}`).join(' · '), null, 'dichiarato', 'policies', { method: 'Descrizione delle pratiche, politiche e iniziative attive' });
    const st = governanceSettings(d);
    const acc = has(st.accountable) ? st.accountable : [...new Set(act.map(p => p.seniorAccountable).filter(has))][0];
    if (acc) out['C2.accountable'] = dp(acc, null, 'dichiarato', 'policies', { method: 'Livello più alto responsabile dell’attuazione (impostazioni o politiche)' });
  }
  const c6 = c6Coverage(d, P.to);
  if (c6.code || A(d.policies).length) {
    out['C6.code'] = dp(!!c6.code, null, 'dichiarato', 'c6Coverage', { method: c6.codeSrc ? `Codice o politica dei diritti umani (${c6.codeSrc})` : 'Nessun codice registrato', ...ev('C6.code') });
    if (c6.code && c6.policies.length) out['C6.coverage'] = dp(c6.topics, null, 'dichiarato', 'c6Coverage', { method: 'Temi coperti dalle politiche sulla forza lavoro e sulla condotta' });
    out['C6.grievance'] = dp(!!c6.grievance, null, 'dichiarato', 'c6Coverage', { method: 'Canale di segnalazione o meccanismo di reclamo attivo (impostazioni della governance)' });
  }
  if (A(d.legalCases).length || A(d.policies).length || A(d.complianceItems).length) {
    const b = b11(d, P);
    out['B11.convictions'] = dp(b.convictions, 'n', 'dichiarato', 'b11', { method: 'Condanne per corruzione con data nel periodo (registro dei procedimenti)', ...ev('B11.convictions') });
    out['B11.fines'] = dp(b.fines, '€', 'dichiarato', 'b11', { method: 'Somma delle sanzioni per corruzione nel periodo', ...ev('B11.fines') });
    const c = c7(d, P);
    out['C7.own-incidents'] = dp(c.own.length ? c.own.map(x => `${dateIt(x.date)}: ${x.description || x.kind}${x.status ? ` (${x.status})` : ''}`).join(' · ') : 'Nessun incidente confermato nella forza lavoro propria nel periodo', null, 'dichiarato', 'c7', { method: 'Registro dei procedimenti: casi sui diritti umani confermati' });
    out['C7.value-chain'] = dp(c.chain.length ? c.chain.map(x => `${dateIt(x.date)}: ${x.description || x.kind}`).join(' · ') : 'Nessun incidente confermato nella catena del valore, nelle comunità o tra i consumatori nel periodo', null, 'dichiarato', 'c7', { method: 'Registro dei procedimenti; le segnalazioni dei fornitori sono nella scheda EUDR e fornitori' });
    const s8 = c8(d, P);
    out['C8.revenue-sectors'] = dp(s8.rows.map(r => ({ label: r.label, value: r.value, unit: '€' })), '€', s8.chemAuto && s8.rows[3].value > 0 ? 'calcolato' : 'dichiarato', 'c8',
      { method: `Ricavi del periodo per settore; prodotti chimici della NACE 20.2 calcolati dalle consegne dei prodotti con sostanze attive (codice NACE dell’impresa ${naceOf(d)})` });
    out['C8.benchmark-excluded'] = dp(!!s8.excluded, null, 'dichiarato', 'c8', { method: 'Criteri del Reg. delegato (UE) 2020/1818, art. 12: armi controverse, tabacco, violazioni dei principi del Global Compact, soglie sui combustibili fossili' });
  }
  const bs = boardStats(d, P.to);
  if (bs.members) out['C9.board-ratio'] = dp(bs.ratio, 'rapporto', 'dichiarato', 'boardStats', { method: 'Donne ÷ uomini nell’organo di amministrazione alla fine del periodo', note: `${bs.women} donne e ${bs.men} uomini su ${bs.members} componenti`, ...ev('C9.board-ratio') });
  return out;
}

/* ---------------- operazioni per l'interfaccia (store.batch) ---------------- */
/** Segna come fatto un adempimento (riga di obligationsFor): aggiunge {due, at, by, evidenceIds, note} e crea la riga se manca. */
export function markDoneOps(d, o, { at, by = '', evidenceIds = [], note = '' } = {}) {
  if (!o || !isIso(at)) return [];
  const due = o.date || d10(at);
  const entry = { due, at: d10(at), by, evidenceIds: A(evidenceIds), note };
  if (o.ci) return [{ kind: 'update', coll: 'complianceItems', id: o.ci.id, patch: { done: [...A(o.ci.done).filter(x => x?.due !== due), entry], lastDoneAt: d10(at), ...(o.custom && o.ci.due === due && !fin(o.ci.recurrenceMonths) ? { status: 'fatto' } : {}) } }];
  return [{ kind: 'add', coll: 'complianceItems', obj: { id: `ci-${slug(o.id)}`, obligationId: o.id, applies: null, owner: '', due: null, done: [entry], lastDoneAt: d10(at), evidenceIds: [], status: 'aperto', note: '' } }];
}
/** Imposta responsabile, applicabilità o data di un obbligo (crea la riga dell'adempimento se manca). */
export function obligationPatchOps(d, o, patch) {
  if (!o || !isObj(patch)) return [];
  if (o.ci) return [{ kind: 'update', coll: 'complianceItems', id: o.ci.id, patch }];
  return [{ kind: 'add', coll: 'complianceItems', obj: { id: `ci-${slug(o.id)}`, obligationId: o.id, applies: null, owner: '', due: null, done: [], lastDoneAt: null, evidenceIds: [], status: 'aperto', note: '', ...patch } }];
}

/* ---------------- nota metodologica ---------------- */
export const GOVERNANCE_METHOD = {
  it: [
    'Calendario degli adempimenti. Gli obblighi vengono da un pacchetto di contenuti con versione e data «valido al» (norma, fonte, stato «verificato» o «da verificare»): ognuno ha i settori a cui si applica (mangimi, agrofarmaci), una regola di applicabilità sul profilo dell’impresa (dipendenti dai dati delle persone o dal questionario ESG, prodotti confezionati, permessi, rifiuti, apparecchiature con gas fluorurati, Modello 231, Seveso, ADR, registrazioni) e una regola di scadenza: data fissa, ricorrenza annuale, intervallo in mesi dall’ultima scadenza completata, anticipo sulla scadenza di un permesso, evento senza data. L’azienda può includere o escludere un obbligo, assegnare il responsabile e segnare i completamenti con le evidenze. Le date che un’altra scheda già calcola (controlli F-gas, scadenze EUDR, polizze) non si duplicano: il calendario le raccoglie da tutte le schede.',
    'Adempimenti nei tempi = completamenti con scadenza nel periodo fatti entro la scadenza ÷ (completamenti con scadenza nel periodo + scadenze del periodo passate senza completamento). Il calendario si esporta in formato iCalendar (RFC 5545: eventi di un giorno, identificativo stabile, righe piegate a 75 ottetti, promemoria 7 giorni prima).',
    'Politiche e organi. La matrice B2 del VS considera solo le politiche approvate e attive alla fine del periodo (una bozza non conta), per i dieci temi; il C6 richiede un codice o una politica sui diritti umani con i temi coperti e un meccanismo di reclamo. Il C9 è il rapporto donne/uomini nell’organo di amministrazione alla fine del periodo (componenti senza nomi). Le segnalazioni (D.Lgs. 24/2023) sono solo conteggi annuali: l’applicazione non è un canale di segnalazione.',
    'Evidenze. Ogni documento è registrato con l’impronta SHA-256 del file calcolata nel browser (il file può restare dov’è, con il solo percorso, oppure essere salvato come allegato nel browser: al massimo 15 MB per file e 200 MB in tutto, fuori dal backup JSON). La copertura è la quota dei datapoint obbligatori del VS calcolati dai pacchetti con almeno un documento valido collegato. Il pacchetto per il revisore è un archivio ZIP con indice delle evidenze, datapoint con provenienza, fattori, versioni dei pacchetti, note metodologiche, chiusura con impronta ed elenco delle impronte di tutti i file.',
    'Dichiarazioni ambientali. Il controllo applica le regole del D.Lgs. 30/2026 (dir. (UE) 2024/825), in vigore dal 27/09/2026, anche alla comunicazione tra imprese (D.Lgs. 145/2007): la neutralità basata su compensazioni («carbon neutral», «a impatto zero», «CO₂ neutro», «climate positive») è sempre bloccata; le asserzioni generiche («green», «eco», «sostenibile») richiedono un’eccellenza ambientale riconosciuta; gli impegni futuri un piano verificato; «senza deforestazione» nei mangimi il registro DCF non negativo; confronti e percentuali metodo e termine di paragone dichiarati. È un aiuto alla revisione, non un parere legale.',
    'B11, C7 e C8. Condanne e sanzioni per corruzione e incidenti sui diritti umani vengono dal registro dei procedimenti; il C8 calcola i ricavi del periodo da prodotti chimici della NACE 20.2 (agrofarmaci) dalle consegne dei prodotti con sostanze attive, mentre armi, tabacco e combustibili fossili sono dichiarati (0 di base per un mangimificio, NACE 10.91).',
  ].join('\n\n'),
  en: [
    'Compliance calendar. Obligations come from a versioned content pack with a «valid as of» date (law, source, status «verified» or «to be verified»): each one carries the sectors it applies to (feed, crop protection), an applicability rule on the company profile (employees from the workforce data or the ESG questionnaire, packed products, permits, waste, fluorinated-gas equipment, 231 model, Seveso, ADR, registrations) and a due-date rule: fixed date, yearly recurrence, interval in months from the last completed deadline, lead time before a permit expiry, event without a date. The company can include or exclude an obligation, assign the owner and record completions with evidence. Dates already computed by another tab (F-gas checks, EUDR deadlines, insurance) are not duplicated: the calendar collects them from every tab.',
    'On-time compliance = completions due in the period done by the due date ÷ (completions due in the period + deadlines of the period passed without completion). The calendar exports to iCalendar (RFC 5545: all-day events, stable identifier, lines folded at 75 octets, reminder 7 days before).',
    'Policies and bodies. The VS B2 matrix only counts policies approved and active at the end of the period (drafts do not count), for the ten topics; C6 needs a code of conduct or human-rights policy with the topics covered and a grievance mechanism. C9 is the female-to-male ratio in the governance body at the end of the period (members without names). Whistleblowing reports (Legislative Decree 24/2023) are yearly counts only: the application is not a reporting channel.',
    'Evidence. Each document is registered with the SHA-256 fingerprint of the file computed in the browser (the file can stay where it is, with its path only, or be stored as an attachment in the browser: at most 15 MB per file and 200 MB in total, outside the JSON backup). Coverage is the share of required VS datapoints computed by the packages with at least one valid document linked. The audit pack is a ZIP archive with the evidence index, datapoints with lineage, factors, content-pack versions, methodology notes, the closing with its fingerprint and the list of fingerprints of every file.',
    'Environmental claims. The checker applies Legislative Decree 30/2026 (Directive (EU) 2024/825), in force since 27/09/2026, also to business-to-business communication (Legislative Decree 145/2007): neutrality based on offsetting («carbon neutral», «zero impact», «CO₂ neutral», «climate positive») is always blocked; generic claims («green», «eco», «sustainable») require recognised excellent environmental performance; future commitments a verified plan; «deforestation-free» in feed a non-negative DCF ledger; comparisons and percentages a stated method and baseline. It supports the review; it is not legal advice.',
    'B11, C7 and C8. Corruption convictions and fines and human-rights incidents come from the register of proceedings; C8 computes the period revenue from NACE 20.2 chemicals (crop protection) from deliveries of products with active substances, while weapons, tobacco and fossil fuels are declared (0 by default for a feed mill, NACE 10.91).',
  ].join('\n\n'),
};
