/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): scambio dei dati d'impronta.
 * - Scheda ambientale del mangime (struttura del codice europeo «Green Feed Labelling»: clima totale, di cui LUC, metodo, versioni
 *   delle banche dati, data, confini; le altre 15 categorie dell'impronta ambientale risultano «non calcolato», mai inventate).
 * - Dichiarazione annuale per cliente (Scope 3 categoria 1 del cliente): stampa, CSV, JSON, Markdown, archivio ZIP per tutti i clienti.
 *   Mai le materie prime della formula: solo totali e ripartizioni per prodotto.
 * - JSON nella forma dei dati PACT v3 (ProductFootprint) dalle fotografie pubblicate, «non testato per la conformità»; importazione
 *   delle impronte dei fornitori (PACT v2/v3, TfS, risposte ai moduli del pacchetto filiera) con errori in italiano.
 * - Pacchetto dati per gli strumenti riconosciuti GMP+ MI5.7 (FeedOS non è uno strumento riconosciuto).
 * - Importazione CSV di fattori con le colonne dell'esportazione GFLI (nessun valore GFLI è incluso nel programma).
 * Funzioni pure: identificativi derivati dall'impronta digitale dei dati (stabili), nessun orologio, nessuna console. */
import { sha256HexSync, canonicalJson } from '../core/hash.js';
import { norm, round, slug, dateIt } from '../core/util.js';
import { parseNum, parseDate } from '../core/importers.js';
import { T, fmtNum, listJoin } from './esg-nlg.js';
import { esgToday, periodByKey, currentPeriod } from './esg-years.js';
import { refsForShipments } from './esg-filiera.js';
import { pcf, customerTotals, pcfSettings, packagingFor, activeSnapshots, originKey, BOUNDARY_LABEL, A, has, fin, num, isObj, ISO } from './esg-pcf-core.js';

const r0 = v => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const r1 = v => (v == null || !Number.isFinite(+v) ? null : round(+v, 1));
const r3 = v => (v == null || !Number.isFinite(+v) ? null : round(+v, 3));
const L = lang => (lang === 'en' ? 'en' : 'it');
export const PACT_LABEL = { it: 'forma dati PACT v3, non testata per la conformità', en: 'PACT v3 data shape, not tested for conformance' };
export const MI57_LABEL = { it: 'pacchetto dati per strumenti riconosciuti GMP+ MI5.7, FeedOS non è uno strumento riconosciuto', en: 'data package for GMP+ MI5.7 recognised tools; FeedOS is not a recognised tool' };

/** Identificativo in forma UUID v4 derivato da un testo (stabile: stessa fotografia, stesso id). */
export function uuidFrom(seed) {
  const h = sha256HexSync(String(seed));
  const v = (parseInt(h[16], 16) & 0x3) | 0x8;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v.toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* ---------------- scheda ambientale del mangime (Green Feed Labelling) ---------------- */
const EF_CATEGORIES = ['Riduzione dello strato di ozono', 'Radiazioni ionizzanti', 'Formazione di ozono fotochimico', 'Particolato', 'Tossicità umana, effetti cancerogeni',
  'Tossicità umana, effetti non cancerogeni', 'Acidificazione', 'Eutrofizzazione delle acque dolci', 'Eutrofizzazione marina', 'Eutrofizzazione terrestre', 'Ecotossicità delle acque dolci',
  'Uso del suolo (indice di qualità)', 'Uso dell’acqua', 'Uso delle risorse fossili', 'Uso delle risorse minerali e metalliche'];
/** Scheda ambientale di un'impronta calcolata o di una fotografia: categorie dell'impronta ambientale, solo il clima calcolato. */
export function greenFeedSheet(x) {
  if (!isObj(x)) return null;
  const isRes = isObj(x.components) && 'raw' in x.components && x.mc;
  const total = num(x.total), luc = num(x.luc), lm = num(x.landMgmt);
  return {
    climate: { total: r0(total), luc: r0(luc), landMgmt: r0(lm), nonFlag: total == null ? null : r0(total - (luc || 0) - (lm || 0)), unit: 'kg CO₂e/t', p10: r0(isRes ? x.mc.p10 : x.p10), p90: r0(isRes ? x.mc.p90 : x.p90) },
    others: EF_CATEGORIES.map(name => ({ name, value: null, status: 'non calcolato' })),
    method: x.method || 'PEFCR Feed · stima interna', boundary: BOUNDARY_LABEL[x.boundary] || x.boundary || '', dbVersions: A(x.dbVersions), date: x.date || x.publishedAt || null,
    note: 'Impronta climatica calcolata da FeedOS; le altre categorie dell’impronta ambientale non sono calcolate.',
  };
}

/* ---------------- dichiarazione per cliente ---------------- */
/**
 * Dichiarazione annuale d'impronta per un cliente (Scope 3 cat. 1 del cliente): totali per prodotto, quota LUC, gestione del suolo,
 * non FLAG, ettari, soia senza deforestazione (dalle consegne tracciate, altrimenti stimata dalle formule), riferimenti EUDR delle
 * consegne (solo numeri di riferimento, paese e materia prima, senza quantità). Nessuna materia prima della formula.
 * → oggetto della dichiarazione | null se il cliente non esiste.
 */
export function customerStatement(d, customerId, periodKey, lang = 'it') {
  const P = isObj(periodKey) && has(periodKey.from) ? periodKey : periodByKey(d, periodKey) || currentPeriod(d);
  const ct = customerTotals(d, customerId, P);
  if (!ct) return null;
  const s = pcfSettings(d);
  let refs = [];
  try { refs = refsForShipments(d, ct.shipmentIds); } catch { refs = []; }
  const soy = refs.filter(r => r.commodity === 'soia');
  const soyKg = soy.reduce((a, r) => a + (+r.kg || 0), 0), soyDcfKg = soy.filter(r => r.dcf).reduce((a, r) => a + (+r.kg || 0), 0);
  const inScopeKg = refs.reduce((a, r) => a + (+r.kg || 0), 0), withRefKg = refs.filter(r => has(r.ddsRef) || A(r.upstreamRefs).length).reduce((a, r) => a + (+r.kg || 0), 0);
  const refList = [];
  const seen = new Set();
  for (const r of refs) for (const ref of [r.ddsRef, ...A(r.upstreamRefs)].filter(has)) { if (seen.has(ref)) continue; seen.add(ref); refList.push({ ref, commodity: r.commodity, country: r.country || null }); }
  const dbs = new Set(), methods = new Set();
  for (const row of ct.rows) for (const v of row.versions) { const r = pcf(d, row.productId, { P, formulaVersion: v }); if (r) { r.dbVersions.forEach(x => dbs.add(x)); methods.add(r.method); } }
  const company = d?.settings?.company || {};
  const st = {
    kind: 'feedos-dichiarazione-impronta', v: 1, lang: L(lang), company: { name: company.name || '', site: company.site || '', approval: company.approval || '' },
    customer: ct.customer, period: ct.period, issuedAt: esgToday(d),
    rows: ct.rows.map(r => ({ productId: r.productId, code: r.code, name: r.name, t: r1(r.t), kgPerT: r0(r.kgPerT), tco2e: r1(r.tco2e), lucT: r1(r.luc), landMgmtT: r1(r.lm), nonFlagT: r1(r.nonFlag), ha: r1(r.ha), versions: r.versions.length })),
    totals: { t: r1(ct.totals.t), tco2e: r1(ct.totals.tco2e), kgPerT: r0(ct.totals.kgPerT), lucT: r1(ct.totals.luc), landMgmtT: r1(ct.totals.lm), nonFlagT: r1(ct.totals.nonFlag), lucShare: r3(ct.totals.lucShare), flagShare: r3(ct.totals.flagShare), ha: r1(ct.totals.ha), primaryShare: r3(ct.totals.primaryShare) },
    soy: soyKg > 0 ? { dcfShare: r3(soyDcfKg / soyKg), basis: 'consegne tracciate' } : ct.dcfEstimate != null ? { dcfShare: r3(ct.dcfEstimate), basis: 'stima dalle formule' } : { dcfShare: null, basis: 'nessuna soia' },
    eudr: { refs: refList.slice(0, 200), n: refList.length, coverage: inScopeKg > 0 ? r3(withRefKg / inScopeKg) : null },
    traceability: { tracedShare: r3(ct.tracedShare), note: ct.fallbackT > 0 ? 'Per le consegne senza lotto tracciato si usa l’impronta della formula in vigore.' : null },
    method: [...methods][0] || s.method, boundary: s.includeOutbound ? 'culla-cliente' : s.boundary, dbVersions: [...dbs].sort(),
  };
  st.hash = sha256HexSync(canonicalJson(st));
  return st;
}

/** Testo (righe) della dichiarazione, in italiano o inglese: usato da stampa, Markdown e controllo delle dichiarazioni. */
export function statementLines(st) {
  if (!st) return [];
  const lang = st.lang, t = st.totals;
  const en = lang === 'en';
  const out = [];
  out.push(en ? `Product carbon footprint statement · ${st.customer.name}` : `Dichiarazione d’impronta dei prodotti · ${st.customer.name}`);
  out.push(en ? `Period ${st.period.from} – ${st.period.to}. Supplier: ${st.company.name}${st.company.site ? ', ' + st.company.site : ''}.` : `Periodo dal ${dateIt(st.period.from)} al ${dateIt(st.period.to)}. Fornitore: ${st.company.name}${st.company.site ? ', ' + st.company.site : ''}.`);
  out.push(en
    ? `Feed delivered: ${fmtNum(t.t, 't', 'en', 1)}; footprint ${fmtNum(t.tco2e, 't CO₂e', 'en', 1)} (${fmtNum(t.kgPerT, 'kg CO₂e/t', 'en', 0)}), of which land-use change ${fmtNum(t.lucT, 't CO₂e', 'en', 1)} and land management ${fmtNum(t.landMgmtT, 't CO₂e', 'en', 1)}; non-FLAG ${fmtNum(t.nonFlagT, 't CO₂e', 'en', 1)}. Land occupation ${fmtNum(t.ha, 'ha·year', 'en', 1)}.`
    : `Mangime consegnato: ${fmtNum(t.t, 't', 'it', 1)}; impronta ${fmtNum(t.tco2e, 't CO₂e', 'it', 1)} (${fmtNum(t.kgPerT, 'kg CO₂e/t', 'it', 0)}), di cui cambio d’uso del suolo ${fmtNum(t.lucT, 't CO₂e', 'it', 1)} e gestione del suolo ${fmtNum(t.landMgmtT, 't CO₂e', 'it', 1)}; parte non FLAG ${fmtNum(t.nonFlagT, 't CO₂e', 'it', 1)}. Occupazione di suolo ${fmtNum(t.ha, 'ha·anno', 'it', 1)}.`);
  if (st.soy.dcfShare != null) out.push(en ? `Soy free from deforestation and conversion: ${fmtNum(st.soy.dcfShare * 100, '%', 'en', 1)} of the soy (${st.soy.basis === 'stima dalle formule' ? 'estimate from the formulas' : 'from traced deliveries'}).` : `Soia senza deforestazione e conversione: ${fmtNum(st.soy.dcfShare * 100, '%', 'it', 1)} della soia (${st.soy.basis === 'stima dalle formule' ? 'stima dalle formule' : 'dalle consegne tracciate'}).`);
  if (st.eudr.n) out.push(en ? `EUDR reference numbers of the raw-material lots in your deliveries: ${st.eudr.n}${st.eudr.coverage != null ? ` (${fmtNum(st.eudr.coverage * 100, '%', 'en', 0)} of the in-scope quantities)` : ''}.` : `Numeri di riferimento EUDR dei lotti di materia prima nelle consegne: ${st.eudr.n}${st.eudr.coverage != null ? ` (${fmtNum(st.eudr.coverage * 100, '%', 'it', 0)} delle quantità in ambito)` : ''}.`);
  out.push(en ? `Method: ${st.method}; boundary ${st.boundary === 'culla-cliente' ? 'cradle to customer' : 'cradle to mill gate'}; databases ${listJoin(st.dbVersions, 'en') || 'n/a'}. Values are an internal estimate, not verified by a third party; ingredient-level formulas are not disclosed.`
    : `Metodo: ${st.method}; confini ${BOUNDARY_LABEL[st.boundary] || st.boundary}; banche dati ${listJoin(st.dbVersions, 'it') || 'n.d.'}. Valori stimati internamente, non verificati da terzi; le formule non sono comunicate.`);
  out.push(T('disclaimer', {}, lang));
  return out;
}
/** Dichiarazione in Markdown. */
export function statementMarkdown(st) {
  if (!st) return '';
  const en = st.lang === 'en';
  const lines = statementLines(st);
  const head = en ? '| Product | t | kg CO₂e/t | t CO₂e | of which LUC | land mgmt | non-FLAG |' : '| Prodotto | t | kg CO₂e/t | t CO₂e | di cui LUC | gestione suolo | non FLAG |';
  const rows = st.rows.map(r => `| ${r.name} | ${fmtNum(r.t, '', st.lang, 1)} | ${fmtNum(r.kgPerT, '', st.lang, 0)} | ${fmtNum(r.tco2e, '', st.lang, 1)} | ${fmtNum(r.lucT, '', st.lang, 1)} | ${fmtNum(r.landMgmtT, '', st.lang, 1)} | ${fmtNum(r.nonFlagT, '', st.lang, 1)} |`);
  return [`# ${lines[0]}`, '', lines[1], '', head, '|---|---:|---:|---:|---:|---:|---:|', ...rows, '', ...lines.slice(2).map(x => x), '', `${en ? 'Fingerprint' : 'Impronta digitale'} SHA-256: \`${st.hash}\``, ''].join('\n');
}
/** Righe per il CSV della dichiarazione (per prodotto più il totale): [{…}] con colonne in statementCsvCols(lang). */
export function statementCsvRows(st) {
  if (!st) return [];
  return [...st.rows.map(r => ({ ...r, kind: 'prodotto' })), { kind: 'totale', name: st.lang === 'en' ? 'Total' : 'Totale', t: st.totals.t, kgPerT: st.totals.kgPerT, tco2e: st.totals.tco2e, lucT: st.totals.lucT, landMgmtT: st.totals.landMgmtT, nonFlagT: st.totals.nonFlagT, ha: st.totals.ha }];
}
export function statementCsvCols(lang = 'it') {
  const en = lang === 'en';
  return [{ key: 'name', label: en ? 'Product' : 'Prodotto' }, { key: 't', label: en ? 'Tonnes delivered' : 'Tonnellate consegnate' }, { key: 'kgPerT', label: 'kg CO₂e/t' }, { key: 'tco2e', label: 't CO₂e' },
    { key: 'lucT', label: en ? 'of which land-use change (t CO₂e)' : 'di cui cambio d’uso del suolo (t CO₂e)' }, { key: 'landMgmtT', label: en ? 'land management (t CO₂e)' : 'gestione del suolo (t CO₂e)' },
    { key: 'nonFlagT', label: en ? 'non-FLAG (t CO₂e)' : 'non FLAG (t CO₂e)' }, { key: 'ha', label: en ? 'land occupation (ha·year)' : 'occupazione di suolo (ha·anno)' }];
}
/** Nomi di file sicuri per la dichiarazione di un cliente. */
export const statementFileBase = st => `impronta-${slug(st.customer.code || st.customer.name || st.customer.id)}-${st.period.key || st.period.to}`;

/* ---------------- PACT v3 (forma dei dati) ---------------- */
const companyUrn = co => (has(co?.vat) ? `urn:pathfinder:company:customcode:vendor-assigned:vat-${slug(co.vat)}` : `urn:pathfinder:company:customcode:vendor-assigned:${slug(co?.name || 'azienda')}`);
/**
 * Impronte in forma PACT v3 (ProductFootprint) dalle fotografie pubblicate. snapshots: elenco di righe di pcfSnapshots.
 * Dichiarato per tonnellata (declaredUnitOfMeasurement «kilogram», declaredUnitAmount 1000). Estensione FeedOS con specie, metodo
 * LUC, quota di soia DCF, coprodotti e impronta del pacchetto MI5.7. Nessuna materia prima della formula.
 */
export function pactExport(d, snapshots, lang = 'it') {
  const co = d?.settings?.company || {};
  const list = A(snapshots).filter(s => s && has(s.productId));
  const prods = new Map(A(d?.products).map(p => [p?.id, p]));
  const all = A(d?.pcfSnapshots);
  const data = list.map(s => {
    const p = prods.get(s.productId) || {};
    const pre = A(s.precedingIds).length ? A(s.precedingIds) : has(s.precedingId) ? [s.precedingId] : [];
    const pk = packagingFor(d, p);
    const P = periodByKey(d, s.periodKey) || currentPeriod(d);
    const valEnd = s.validUntil || addYear(s.publishedAt);
    const mi57 = mi57Package(d, s.productId, P);
    return {
      id: uuidFrom('pcf|' + s.id + '|' + s.hash), specVersion: '3.0.0', precedingPfIds: pre.map(id => { const x = all.find(y => y && y.id === id); return x ? uuidFrom('pcf|' + x.id + '|' + x.hash) : null; }).filter(Boolean),
      version: pre.length + 1, created: `${s.publishedAt || esgToday(d)}T00:00:00Z`, status: s.status === 'attiva' ? 'Active' : 'Deprecated', validityPeriodStart: `${s.publishedAt || esgToday(d)}T00:00:00Z`, validityPeriodEnd: `${valEnd}T00:00:00Z`,
      companyName: co.name || '', companyIds: [companyUrn(co)], productDescription: `${p.name || s.productId}${p.form ? ' · ' + p.form : ''}${p.packaging ? ' · ' + p.packaging : ''}`,
      productIds: [`urn:pathfinder:product:customcode:vendor-assigned:${slug(p.code || s.productId)}`], productClassifications: ['urn:pathfinder:product:id:cn:2309.90'], productNameCompany: p.name || s.productId,
      comment: PACT_LABEL[L(lang)],
      pcf: {
        declaredUnitOfMeasurement: 'kilogram', declaredUnitAmount: 1000, productMassPerDeclaredUnit: 1000, exemptedEmissionsPercent: 0,
        exemptedEmissionsDescription: lang === 'en' ? 'Animal use, manure and end of life of the feed are outside the boundary.' : 'Uso da parte degli animali, effluenti e fine vita del mangime sono fuori dai confini.',
        boundaryProcessesDescription: lang === 'en' ? 'Cradle to mill gate: cultivation, land-use change, processing of feed materials, transport to the mill, feed-mill processes (energy), packaging, losses.' : 'Dalla culla al cancello del mangimificio: coltivazione, cambio d’uso del suolo, trasformazione delle materie prime, trasporto al mangimificio, processi del mangimificio (energia), imballaggio, perdite.',
        referencePeriodStart: `${P.from}T00:00:00Z`, referencePeriodEnd: `${addDay(P.to)}T00:00:00Z`, geographyCountry: 'IT',
        pcfExcludingBiogenicUptake: r1(s.total), pcfIncludingBiogenicUptake: r1(s.total), fossilGhgEmissions: s.total != null ? r1(s.total - (s.luc || 0) - (s.landMgmt || 0)) : null,
        dLucGhgEmissions: r1(s.luc), landManagementGhgEmissions: r1(s.landMgmt), landAreaOccupation: r0(s.land), biogenicCarbonContent: null,
        packagingEmissionsIncluded: true, packagingGhgEmissions: r1(s.components?.packaging), ipccCharacterizationFactors: ['AR6'],
        crossSectoralStandards: ['GHG Protocol Product standard'], productOrSectorSpecificRules: [{ operator: 'Other', otherOperatorName: 'FEFAC', ruleNames: ['PEFCR Feed for Food-Producing Animals (stima interna, non verificata)'] }],
        allocationRulesDescription: lang === 'en' ? 'Economic allocation for feed materials (as in PEFCR Feed); feed-mill energy by line (pelleting only to pelleted products).' : 'Allocazione economica per le materie prime (come nella PEFCR Feed); energia del mangimificio per linea (pellettatura solo ai prodotti in pellet).',
        secondaryEmissionFactorSources: A(s.dbVersions).map(x => ({ name: String(x).replace(/\s+[\d.]+$/, ''), version: (String(x).match(/([\d.]+)$/) || [])[1] || '' })),
        primaryDataShare: s.primaryShare ?? null, dqi: { coveragePercent: 100, overallDQR: s.dqr ?? null },
        uncertaintyAssessmentDescription: s.p10 != null ? `Monte Carlo, P10 ${r0(s.p10)} – P90 ${r0(s.p90)} kg CO₂e/t` : null,
        assurance: { assurance: false },
      },
      extensions: [{ specVersion: '2.0.0', dataSchema: 'feedos:estensione-mangimi/1', data: {
        species: p.species || null, form: p.form || null, packaging: p.packaging || null, lucMethod: 'dLUC/sLUC secondo il fattore del registro', dcfSoyPercent: s.dcfShare ?? null,
        bulk: pk.bulk, method: s.method, boundary: s.boundary, formulaVersion: s.formulaVersion, snapshotHash: s.hash, mi57PackageHash: mi57?.hash || null, label: PACT_LABEL[L(lang)],
      } }],
    };
  });
  return { format: 'feedos-pact-export', note: PACT_LABEL[L(lang)], data };
}
const addDay = s => { const x = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const addYear = s => (ISO.test(String(s || '')) ? `${+String(s).slice(0, 4) + 1}${String(s).slice(4, 10)}` : null);

/* ---------------- importazione delle impronte dei fornitori ---------------- */
const NUMK = (o, ...ks) => { for (const k of ks) { const v = o?.[k]; if (fin(v)) return +v; if (typeof v === 'string' && parseNum(v) != null) return parseNum(v); } return null; };
/**
 * Lettura di impronte di fornitori (PACT v2/v3 o TfS ProductFootprint, elenco, {data: [...]}, oppure le risposte «pcf» dei moduli
 * del pacchetto filiera) → {ok, errors (italiano), warnings, rows: righe di supplierPcfs in kg CO₂e per t, ops}. ctx: {supplierId,
 * ingId, fileHash} indicano fornitore e materia prima quando il file non li permette di riconoscere. Le righe con lo stesso pfId
 * si aggiornano invece di duplicarsi.
 */
export function pactImport(d, json, ctx = {}) {
  const errors = [], warnings = [];
  let x = json;
  if (typeof json === 'string') { try { x = JSON.parse(json); } catch { return { ok: false, errors: ['Il file non è un JSON valido.'], warnings, rows: [], ops: [] }; } }
  const items = Array.isArray(x) ? x : isObj(x) && Array.isArray(x.data) ? x.data : isObj(x) && Array.isArray(x.pcf) && x.kind === 'pcf' ? x.pcf.map(r => ({ _reply: r })) : isObj(x) ? [x] : [];
  if (!items.length) return { ok: false, errors: ['Nessuna impronta trovata: serve un oggetto ProductFootprint, un elenco o {"data": [...]}.'], warnings, rows: [], ops: [] };
  const sups = A(d?.suppliers), ings = A(d?.ingredients);
  const findSup = (name, ids) => { const n = norm(name || '').trim(); return sups.find(s => s && ((n && norm(s.name || '').trim() === n) || A(ids).some(u => String(u).includes(slug(s.name || '')) || (s.vat && String(u).includes(slug(s.vat)))))) || null; };
  const findIng = (name, ids) => { const n = norm(name || '').trim(); return ings.find(i => i && (A(ids).some(u => { const t = String(u).toLowerCase(); return t.endsWith(':' + String(i.id).toLowerCase()) || (i.code && t.endsWith(':' + String(i.code).toLowerCase())); }) || (n && (norm(i.name || '').trim() === n || norm(i.code || '').trim() === n)))) || null; };
  const fh = has(ctx.fileHash) ? ctx.fileHash : sha256HexSync(typeof json === 'string' ? json : canonicalJson(json));
  const rows = [];
  items.forEach((it, i) => {
    const who = `impronta ${i + 1}`;
    if (!isObj(it)) { errors.push(`${who}: non è un oggetto`); return; }
    const reply = it._reply;
    const pf = reply ? null : it;
    const p = reply ? { declaredUnit: reply.declaredUnit, unitaryProductAmount: 1, pCfExcludingBiogenic: reply.pcfExcl, fossilGhgEmissions: reply.fossil, dLucGhgEmissions: reply.luc, referencePeriodStart: reply.periodStart, referencePeriodEnd: reply.periodEnd, primaryDataShare: reply.primaryShare } : isObj(it.pcf) ? it.pcf : null;
    if (!p) { errors.push(`${who}: manca il blocco «pcf»`); return; }
    const unit = String(p.declaredUnitOfMeasurement || p.declaredUnit || '').toLowerCase();
    const amount = NUMK(p, 'declaredUnitAmount', 'unitaryProductAmount') ?? 1;
    let perT;
    if (['kilogram', 'kg'].includes(unit)) perT = 1000 / amount;
    else if (['ton', 'tonne', 't', 'metric ton'].includes(unit)) perT = 1 / amount;
    else { errors.push(`${who}: unità dichiarata «${p.declaredUnitOfMeasurement || p.declaredUnit || '—'}» non gestita (servono chilogrammi o tonnellate)`); return; }
    if (!(amount > 0)) { errors.push(`${who}: quantità dichiarata non valida`); return; }
    const excl = NUMK(p, 'pcfExcludingBiogenicUptake', 'pCfExcludingBiogenic', 'pcfExcludingBiogenic');
    if (excl == null || excl < 0) { errors.push(`${who}: manca l’impronta (pcfExcludingBiogenicUptake) o è negativa`); return; }
    const incl = NUMK(p, 'pcfIncludingBiogenicUptake', 'pCfIncludingBiogenic', 'pcfIncludingBiogenic');
    const start = parseDate(String(p.referencePeriodStart || '').slice(0, 10)), end0 = parseDate(String(p.referencePeriodEnd || '').slice(0, 10));
    if (!start || !end0) { errors.push(`${who}: periodo di riferimento mancante o non valido (referencePeriodStart / End)`); return; }
    const end = /T00:00:00/.test(String(p.referencePeriodEnd || '')) && end0 > start ? prevDay(end0) : end0;
    if (end < start) { errors.push(`${who}: il periodo finisce prima di iniziare`); return; }
    const sup = has(ctx.supplierId) ? sups.find(s => s?.id === ctx.supplierId) : findSup(pf?.companyName, pf?.companyIds);
    const ing = has(ctx.ingId) ? ings.find(g => g?.id === ctx.ingId) : findIng(pf?.productNameCompany || reply?.product, reply ? [reply.productId] : pf?.productIds);
    if (!sup) { errors.push(`${who}: fornitore non riconosciuto${pf?.companyName ? ` («${pf.companyName}»)` : ''}: sceglierlo prima di importare`); return; }
    if (!ing) { errors.push(`${who}: materia prima non riconosciuta${pf?.productNameCompany || reply?.product ? ` («${pf?.productNameCompany || reply?.product}»)` : ''}: sceglierla prima di importare`); return; }
    if (A(sup.ingIds).length && !A(sup.ingIds).includes(ing.id)) warnings.push(`${who}: ${ing.name} non è tra le materie prime di ${sup.name} in anagrafica`);
    const today = esgToday(d);
    if (end < today) warnings.push(`${who}: periodo di validità già concluso il ${end}`);
    const pfId = has(pf?.id) ? String(pf.id) : uuidFrom(`${sup.id}|${ing.id}|${start}|${excl}`);
    const luc = NUMK(p, 'dLucGhgEmissions', 'landUseChangeGhgEmissions'), lm = NUMK(p, 'landManagementGhgEmissions', 'landManagementBiogenicCO2Emissions'), fos = NUMK(p, 'fossilGhgEmissions');
    const prim = NUMK(p, 'primaryDataShare');
    const dqr = isObj(p.dqi) ? NUMK(p.dqi, 'overallDQR', 'technologicalDQR', 'reliabilityDQR') : NUMK(p, 'dataQualityRating');
    const conv = v => (v == null ? null : round(v * perT, 1));
    rows.push({ id: `spcf-${slug(pfId).slice(0, 36)}`, supplierId: sup.id, supplierName: sup.name, ingId: ing.id, pfId, specVersion: String(pf?.specVersion || (reply ? 'modulo FeedOS' : '')), pcfExcl: conv(excl), pcfIncl: conv(incl ?? excl),
      fossil: conv(fos), luc: conv(luc), landMgmt: conv(lm), periodStart: start, periodEnd: end, primaryDataShare: prim, dqi: dqr != null && dqr >= 1 && dqr <= 5 ? dqr : null, fileHash: fh, evidenceId: ctx.evidenceId || null,
      verified: isObj(p.assurance) ? !!p.assurance.assurance : p.assurance === true, status: 'valida', importedAt: today, source: reply ? 'modulo fornitore' : 'file PACT' });
  });
  const dupes = rows.filter((r, i) => rows.findIndex(x => x.pfId === r.pfId) !== i);
  if (dupes.length) warnings.push(`${dupes.length} impronte con lo stesso identificativo nel file: si tiene l’ultima`);
  const uniq = [...new Map(rows.map(r => [r.pfId, r])).values()];
  const ok = !errors.length && uniq.length > 0;
  return { ok, errors: errors.slice(0, 20), warnings: warnings.slice(0, 20), rows: uniq, ops: ok ? [{ kind: 'upsertMany', coll: 'supplierPcfs', objs: uniq, key: 'pfId' }] : [] };
}
const prevDay = s => { const x = new Date(s + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
/** Impronte ricevute con i moduli «pcf» del pacchetto filiera (supplierRequests[kind='pcf'].pcf) pronte da registrare. */
export function pendingReplies(d) {
  const have = new Set(A(d?.supplierPcfs).map(r => r?.fileHash).filter(has));
  return A(d?.supplierRequests).filter(r => r && r.kind === 'pcf' && A(r.pcf).length && !have.has(r.replyHash || r.id)).map(r => ({ request: r, rows: A(r.pcf) }));
}
/** Importazione delle impronte di una risposta «pcf» del modulo fornitore (stessa validazione dei file PACT). */
export function importReply(d, req) {
  return pactImport(d, { kind: 'pcf', pcf: A(req?.pcf) }, { supplierId: req?.supplierId, fileHash: req?.replyHash || req?.id });
}

/* ---------------- pacchetto MI5.7 ---------------- */
/**
 * Dati di attività per uno strumento riconosciuto GMP+ MI5.7 (uso interno e del certificatore: contiene la formula).
 * → {json, csv: [{sezione, voce, valore, unita, nota}], hash, label}
 */
export function mi57Package(d, productId, P) {
  const r = pcf(d, productId, { P });
  if (!r) return null;
  const ings = new Map(A(d?.ingredients).map(i => [i?.id, i]));
  const json = {
    format: 'feedos-mi57-dati', v: 1, label: MI57_LABEL.it, company: d?.settings?.company?.name || '', product: r.product, formula: r.formula, period: r.period,
    composition: r.lines.map(l => ({ ingredient: l.name, code: ings.get(l.ing)?.code || l.ing, kgPerT: r1(l.kg), origin: l.origin || null, scheme: l.scheme || null, coc: l.coc || null, factorKgCO2ePerT: r0(l.ef), factorSource: l.ref || l.efSource, db: l.db, dbVersion: l.dbVersion,
      pricePerT: num(ings.get(l.ing)?.price), coProduct: l.coClass })),
    energy: { kwhPerT: r1(r.energy.kwhT), lpgKgPerT: r3(r.energy.fuelT), gridFactor: r3(r.energy.efLB), pvShare: r3(r.energy.pvShare), pelleted: r.energy.pelletShare > 0, source: r.energySource },
    transport: r.lines.filter(l => l.tinLegs.length).map(l => ({ ingredient: l.name, legs: l.tinLegs.map(g => ({ mode: g.mode, km: g.km })) })),
    packaging: { packaging: r.packaging.packaging, kgPerT: r1(r.packaging.kgPerT), components: r.packaging.components.map(c => ({ material: c.material, kgPerT: r3(c.kgPerT), recycledPct: c.recycledPct })) },
    losses: { pct: r1(r.lossPct) }, method: r.method, boundary: r.boundary,
  };
  const csv = [
    ...json.composition.map(c => ({ sezione: 'composizione', voce: c.ingredient, valore: c.kgPerT, unita: 'kg/t', nota: [c.origin, c.scheme, c.coc, c.factorKgCO2ePerT != null ? `${c.factorKgCO2ePerT} kg CO₂e/t` : null, c.pricePerT != null ? `${c.pricePerT} €/t` : null].filter(has).join(' · ') })),
    { sezione: 'energia', voce: 'Elettricità', valore: json.energy.kwhPerT, unita: 'kWh/t', nota: `quota fotovoltaica ${round((json.energy.pvShare || 0) * 100, 1)}%` },
    { sezione: 'energia', voce: 'GPL (vapore)', valore: json.energy.lpgKgPerT, unita: 'kg/t', nota: json.energy.pelleted ? 'prodotto in pellet' : 'prodotto in farina' },
    ...json.transport.flatMap(t => t.legs.map(g => ({ sezione: 'trasporto', voce: t.ingredient, valore: g.km, unita: 'km', nota: g.mode }))),
    ...json.packaging.components.map(c => ({ sezione: 'imballaggio', voce: c.material, valore: c.kgPerT, unita: 'kg/t', nota: c.recycledPct != null ? `riciclato ${c.recycledPct}%` : '' })),
    { sezione: 'perdite', voce: 'Calo di lavorazione', valore: json.losses.pct, unita: '%', nota: '' },
  ];
  const hash = sha256HexSync(canonicalJson(json));
  return { json: { ...json, hash }, csv, hash, label: MI57_LABEL.it };
}

/* ---------------- importazione CSV con le colonne dell'esportazione GFLI ---------------- */
const GFLI_COLS = {
  product: ['product', 'product name', 'feed ingredient', 'ingredient', 'name', 'prodotto', 'materia prima', 'nome'],
  country: ['country', 'geography', 'origin', 'region', 'country of origin', 'paese', 'origine'],
  total: ['climate change', 'climate change total', 'gwp', 'gwp100', 'cc total', 'impronta', 'totale', 'kg co2e'],
  fossil: ['climate change fossil', 'climate change - fossil', 'fossil', 'cc fossil', 'fossile'],
  biogenic: ['climate change biogenic', 'climate change - biogenic', 'biogenic', 'cc biogenic', 'biogenico'],
  luc: ['climate change land use and land use change', 'climate change - land use and lu change', 'climate change land use and lu change', 'luluc', 'land use change', 'luc', 'cambio uso suolo'],
  land: ['land use', 'land occupation', 'land use m2a', 'suolo', 'occupazione suolo'],
  allocation: ['allocation', 'allocazione'], unit: ['unit', 'unita', 'reference unit', 'functional unit'], version: ['version', 'database version', 'versione'], year: ['year', 'anno'],
};
const nk = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
/** Abbinamento delle colonne di un CSV di fattori (esportazione GFLI o simile): {campo: colonna}. */
export function gfliMap(header) {
  const out = {}, used = new Set();
  const cols = A(header).map(h => ({ h, n: nk(h) }));
  for (const exactPass of [true, false]) for (const [f, syn] of Object.entries(GFLI_COLS)) {
    if (out[f]) continue;
    const ns = syn.map(nk);
    const c = cols.find(c => !used.has(c.h) && (exactPass ? ns.includes(c.n) : ns.some(s => s.length > 3 && c.n.startsWith(s))));
    if (c) { out[f] = c.h; used.add(c.h); }
  }
  return out;
}
/**
 * Anteprima dell'importazione di fattori da CSV (colonne GFLI): valori per kg convertiti in kg per t (se l'unità dice kg o i valori
 * sono sotto 20), origine dal paese, abbinamento alle materie prime per nome (o con mapping {riga: ingId}).
 * → {map, rows: [{i, ingId, ingName, origin, total, fossil, biogenic, luc, landM2a, status, errors}], ops (un upsertMany su efIngredients)}
 */
export function gfliPreview(d, parsed, { mapping = {}, db = 'GFLI', dbVersion = '3.0', year = null, allocation = 'economica' } = {}) {
  const header = A(parsed?.header), raw = A(parsed?.rows);
  const map = gfliMap(header);
  const ings = A(d?.ingredients).filter(i => i && has(i.id));
  const guess = name => { const n = nk(name); if (!n) return null; return ings.find(i => nk(i.name) === n || nk(i.label || '') === n) || ings.find(i => n.includes(nk(i.short || i.name)) || nk(i.name).includes(n)) || null; };
  const rows = raw.map((r, i) => {
    const errors = [];
    const product = map.product ? String(r[map.product] || '').trim() : '';
    const ingId = has(mapping[i]) ? mapping[i] : guess(product)?.id || null;
    const unitTxt = map.unit ? nk(r[map.unit]) : nk(map.total || '');
    const totalRaw = map.total ? parseNum(r[map.total]) : null;
    if (totalRaw == null) errors.push('impronta mancante');
    const perKg = /\bkg\b/.test(unitTxt) && !/\bt\b|tonne|ton\b/.test(unitTxt) ? true : /\bt\b|tonne|ton\b/.test(unitTxt) ? false : totalRaw != null && totalRaw < 20;
    const k = perKg ? 1000 : 1;
    const v = c => (map[c] ? (parseNum(r[map[c]]) == null ? null : round(parseNum(r[map[c]]) * k, 1)) : null);
    const landRaw = map.land ? parseNum(r[map.land]) : null;
    const origin = map.country ? originKey(r[map.country]) || '*' : '*';
    if (!ingId) errors.push('materia prima da abbinare');
    const rec = { id: ingId ? `ef-${ingId}-${slug(origin)}-gfli` : null, ingId, origin, scheme: null, coc: null, total: totalRaw == null ? null : round(totalRaw * k, 1), fossil: v('fossil'), biogenic: v('biogenic'), luc: v('luc'),
      landMgmt: null, landM2a: landRaw == null ? null : round(landRaw * (perKg ? 1000 : 1), 0), allocation: map.allocation ? String(r[map.allocation] || allocation).toLowerCase().startsWith('mass') ? 'massa' : String(r[map.allocation] || '').toLowerCase().startsWith('energ') ? 'energia' : 'economica' : allocation,
      db, dbVersion: map.version ? String(r[map.version] || dbVersion) : dbVersion, year: map.year ? +parseNum(r[map.year]) || year : year, dqr: 3, includesTransportTo: 'mercato-UE', status: 'importato', source: `${db} ${dbVersion} (importazione CSV)`, note: product };
    if (rec.total != null && rec.fossil != null && rec.luc != null) rec.landMgmt = round(Math.max(0, rec.total - rec.fossil - rec.luc - (rec.biogenic || 0)), 1);
    return { i, product, ingName: ings.find(x => x.id === ingId)?.name || null, perKg, rec, errors, status: errors.length ? 'errore' : 'pronta' };
  });
  const good = rows.filter(r => r.status === 'pronta').map(r => r.rec);
  return { map, rows, counts: { ready: good.length, errors: rows.length - good.length }, ops: good.length ? [{ kind: 'upsertMany', coll: 'efIngredients', objs: good, key: ['ingId', 'origin', 'db'] }] : [] };
}

/** Testi prodotti dal pacchetto da sottoporre al controllo delle dichiarazioni (governance): titoli e frasi esportate. */
export function exportTexts(d, productId, customerId, P) {
  const out = [];
  const r = pcf(d, productId, { P });
  if (r) { const g = greenFeedSheet(r); out.push(g.method, g.note, `${r.product.name}: ${r0(r.total)} kg CO₂e/t`); }
  if (customerId) { const st = customerStatement(d, customerId, P); if (st) out.push(...statementLines(st)); }
  for (const s of activeSnapshots(d).slice(0, 3)) out.push(pactExport(d, [s]).note);
  return out;
}
