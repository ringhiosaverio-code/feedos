/* FeedOS 18 · EUDR e fornitori (pacchetto WP3 «filiera»): ruolo EUDR, classificazione delle materie prime (codici NC),
 * registro dei lotti in ambito con riferimenti DDS, rischio paese e i tre indicatori EUDR / DCF / SSG (mai fusi), punteggio di
 * rischio interno con le sue componenti, quote della soia per consumo e per acquisti, registro della soia DCF e crediti,
 * riferimenti per le consegne dalla tracciabilità, lettera EUDR ai clienti, valutazione ESG dei fornitori, richieste ai fornitori,
 * segnali, sezione del report, KPI, regole della qualità dei dati, datapoint e scadenze.
 * Contratto (07-contract §2 e §4): firme fisse; funzioni pure (oggi da ctx.today o esgToday), nessuna eccezione su archivi vuoti.
 * Non importa i registri (kpis, dataquality, providers, signals, report, esg-registry, derived, store): sono loro a importarlo.
 * Due edizioni: ruolo, registro dei lotti, rischio, moduli e lettere valgono per ogni settore (sectorOf); le quote della soia,
 * il registro DCF e l'«Indagine soia» sono specifici dei mangimi (soia nei mangimi composti) e lo dicono nel nome. */
import { sum, byId, addDays, addMonths, daysBetween, round, norm, dateIt, nf, slug, relDays } from '../core/util.js';
import { esgSettings, esgToday, sectorOf, periodByKey, previousPeriod, currentPeriod } from './esg-years.js';
import { activePack } from './esg-packs.js';
import { T, fmtNum, listJoin, deltaPhrase } from './esg-nlg.js';
import { buildIndex } from './trace.js';
import { checkClaim } from './esg-governance.js';
import { PACK_FILIERA, COUNTRY_NAMES } from '../data/pack-filiera.js';
import { META } from '../editions/meta.js';

const EMPTY = Object.freeze([]);
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const has = v => v != null && String(v).trim() !== '';
const fin = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
const inP = (x, P) => typeof x === 'string' && x.slice(0, 10) >= P.from && x.slice(0, 10) <= P.to;
const pctTxt = (v, k = 0) => (v == null || !Number.isFinite(v) ? '—' : `${nf(v * 100, k)}%`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const todayOf = (d, ctx) => (ctx && typeof ctx.today === 'string' && ISO.test(ctx.today) ? ctx.today : esgToday(d));
const LINK = id => ({ area: 'esg', tab: 'filiera', ...(id ? { id } : {}) });
/** La scheda «EUDR e fornitori» esiste in questa edizione? (FitoOS la nasconde: niente segnali, sezioni o scadenze che vi portano). */
export const FILIERA_TAB = !(Array.isArray(META?.hiddenTabs?.esg) && META.hiddenTabs.esg.includes('filiera'));

/* memoria per identità degli argomenti (come kpis.js): il cruscotto e la pagina chiedono gli stessi conti molte volte */
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

/* ---------------- impostazioni e pacchetto di contenuti ---------------- */
export const DEFAULT_RISK_WEIGHTS = Object.freeze({ country: 40, commodity: 20, coc: 15, cert: 15, missing: 10 });
export const FILIERA_DEFAULTS = Object.freeze({
  role: null, size: 'grande-media', answers: { imports: 'mai', resellsAsSuch: false, firstDownstream: false },
  riskWeights: { ...DEFAULT_RISK_WEIGHTS }, ssgRequired: '2023', reviewMonths: 12, assessmentValidMonths: 36, signalWindowDays: 45,
});
/** Impostazioni del pacchetto: settings.esg18.filiera fuse con i valori di base. */
export function filieraSettings(d) { return esgSettings(d, 'filiera', FILIERA_DEFAULTS); }

/** Pacchetto di contenuti in uso: il più recente tra quello integrato e uno importato (settings.esg18.packs.filiera). */
export function filieraPack(d) { return activePack(d, 'filiera', PACK_FILIERA) || { ...PACK_FILIERA, origin: 'integrato' }; }
function packIndex(d) {
  return cached('pack', [d?.settings?.esg18?.packs?.filiera], () => {
    const p = filieraPack(d);
    const items = A(p.items).filter(isObj);
    const byKind = {};
    for (const it of items) (byKind[it.kind] ||= []).push(it);
    if (byKind.nc) byKind.nc = [...byKind.nc].sort((a, b) => (+a.priority || 0) - (+b.priority || 0));
    return { ...p, items, byKind };
  }, 4);
}
/** Voci del pacchetto di un tipo ('rischio-paesi', 'nc', 'schema', 'scadenza', 'controllo', 'obbligo'). */
export function packList(d, kind) { return packIndex(d).byKind[kind] || EMPTY; }
/** Schema di certificazione per codice (RTRS, ProTerra…) o null. */
export function schemeOf(d, code) { return has(code) ? packList(d, 'schema').find(s => s.code === code || s.id === code) || null : null; }

/* ---------------- paesi e rischio paese ---------------- */
const NAME_TO_ISO = Object.fromEntries(Object.entries(COUNTRY_NAMES).map(([k, v]) => [norm(v), k]));
const EN_TO_ISO = { brazil: 'BR', argentina: 'AR', 'united states': 'US', usa: 'US', 'united states of america': 'US', paraguay: 'PY', uruguay: 'UY', ukraine: 'UA', canada: 'CA', italy: 'IT',
  france: 'FR', germany: 'DE', austria: 'AT', hungary: 'HU', romania: 'RO', serbia: 'RS', croatia: 'HR', india: 'IN', china: 'CN', russia: 'RU', belarus: 'BY', indonesia: 'ID', malaysia: 'MY',
  netherlands: 'NL', spain: 'ES', bolivia: 'BO', 'united kingdom': 'GB', myanmar: 'MM' };
/** Codice ISO alfa-2 da codice o nome (italiano o inglese) del paese; null se non riconosciuto. */
export function normCountry(c) {
  if (!has(c)) return null;
  const s = String(c).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const n = norm(s).replace(/\s+/g, ' ');
  return NAME_TO_ISO[n] || EN_TO_ISO[n] || null;
}
/** Nome italiano del paese (o il codice se non è nell'elenco). */
export function countryName(c) { const k = normCountry(c); return k ? COUNTRY_NAMES[k] || k : 'non noto'; }

const TIER_ORDER = { alto: 0, basso: 1, standard: 2 };
/**
 * Rischio di un paese a una data secondo la classificazione del pacchetto (Reg. di esecuzione (UE) 2025/1093):
 * { tier: 'basso'|'standard'|'alto'|null, country, name, source, status, entryId, validAsOf }. Paese non elencato → standard.
 */
export function countryRisk(d, country, date) {
  const c = normCountry(country);
  const pack = packIndex(d);
  if (!c) return { tier: null, country: null, name: 'non noto', source: null, status: null, entryId: null, validAsOf: pack.validAsOf || null };
  const day = String(has(date) ? date : esgToday(d)).slice(0, 10);
  let hit = null;
  for (const e of pack.byKind['rischio-paesi'] || EMPTY) {
    if ((e.from && day < e.from) || (e.to && day > e.to)) continue;
    const listed = Array.isArray(e.countries) && e.countries.includes(c);
    if (!listed && !e.all) continue;
    if (!hit || (listed && hit.all) || (listed === !hit.all && (TIER_ORDER[e.tier] ?? 9) < (TIER_ORDER[hit.tier] ?? 9))) hit = e;
  }
  const tier = hit && TIER_ORDER[hit.tier] != null ? hit.tier : 'standard';
  return { tier, country: c, name: countryName(c), source: hit?.source || 'Paese non elencato: rischio standard (Reg. di esecuzione (UE) 2025/1093)',
    status: hit?.status || 'verificato', entryId: hit?.id || null, validAsOf: pack.validAsOf || null };
}

/* ---------------- ruolo EUDR ---------------- */
export const EUDR_ROLES = {
  operatore: { label: 'Operatore', desc: 'Importa da paesi extra-UE (è il dichiarante in dogana) o immette per primo sul mercato UE soia, palma o legno.' },
  'primo-a-valle': { label: 'Primo operatore a valle o commerciante', desc: 'Compra nell’UE direttamente dall’operatore e rivende la materia prima tal quale: raccoglie e trasmette i riferimenti DDS ricevuti.' },
  commerciante: { label: 'Operatore a valle o commerciante, non il primo', desc: 'Rivende tal quale materie prime già passate da altri operatori a valle: conserva i dati di fornitori e clienti.' },
  'fuori-ambito': { label: 'Trasformatore: prodotto fuori ambito', desc: 'Trasforma le materie prime in prodotti non elencati nell’allegato I (per i mangimi composti: NC 2309).' },
};
/** Ruoli per cui la legge chiede i riferimenti DDS dei lotti (proprio o ricevuto a monte). */
export const ROLE_REFS_REQUIRED = { operatore: true, 'primo-a-valle': true, commerciante: false, 'fuori-ambito': false };
const lowerFirst = s => (s ? s[0].toLowerCase() + s.slice(1) : s);
function dutiesFor(items, role, alsoOperator, sector) {
  const of = r => items.filter(x => x.kind === 'obbligo' && x.role === r && (!Array.isArray(x.sectors) || x.sectors.includes(sector)));
  return [...of(role), ...(alsoOperator ? of('operatore').map(x => ({ ...x, id: x.id + '-diretti', text: 'Per i lotti importati direttamente: ' + lowerFirst(x.text) })) : [])];
}

/**
 * Albero decisionale del ruolo (03 §3.2): importa da solo → operatore; rivende tal quale comprando nell'UE → primo a valle
 * (se compra direttamente dall'operatore) o commerciante; trasforma soltanto in prodotti fuori dall'allegato I → fuori ambito
 * per il prodotto. answers = {imports: 'mai'|'occasionale'|'abituale', resellsAsSuch, firstDownstream, size?};
 * opts = {size: 'grande-media'|'micro-piccola', pack, sector}. → {role, label, alsoOperator, size, applicableFrom, duties, path, …}
 */
export function eudrRole(answers = {}, opts = {}) {
  const a = { imports: 'mai', resellsAsSuch: false, firstDownstream: false, ...(isObj(answers) ? answers : {}) };
  const size = opts.size === 'micro-piccola' || (!opts.size && a.size === 'micro-piccola') ? 'micro-piccola' : 'grande-media';
  const imports = a.imports === true ? 'abituale' : ['mai', 'occasionale', 'abituale'].includes(a.imports) ? a.imports : 'mai';
  const path = [];
  let role;
  if (imports === 'abituale') { role = 'operatore'; path.push('importa direttamente da paesi extra-UE: è il primo a immettere la materia prima sul mercato'); }
  else if (a.resellsAsSuch) {
    role = a.firstDownstream ? 'primo-a-valle' : 'commerciante';
    path.push('rivende tal quale materie prime comprate nell’UE', a.firstDownstream ? 'compra direttamente dall’operatore che le ha immesse sul mercato' : 'compra da altri operatori a valle o commercianti');
  } else { role = 'fuori-ambito'; path.push('compra nell’UE e trasforma le materie prime in prodotti fuori dall’allegato I'); }
  const alsoOperator = role !== 'operatore' && imports === 'occasionale';
  if (alsoOperator) path.push('importa occasionalmente: per quei lotti è operatore');
  const items = isObj(opts.pack) && Array.isArray(opts.pack.items) ? opts.pack.items : PACK_FILIERA.items;
  const sector = opts.sector || 'mangimi';
  const deadline = items.find(x => x.kind === 'scadenza' && x.size === size) || null;
  return {
    role, label: EUDR_ROLES[role].label, desc: EUDR_ROLES[role].desc, refsRequired: ROLE_REFS_REQUIRED[role], legal: ROLE_REFS_REQUIRED[role] || alsoOperator, alsoOperator, imports, size,
    applicableFrom: deadline?.date || (size === 'micro-piccola' ? '2027-06-30' : '2026-12-30'), deadline, duties: dutiesFor(items, role, alsoOperator, sector), path,
    source: 'Reg. (UE) 2023/1115 come modificato dal Reg. (UE) 2025/2650', status: 'da verificare',
  };
}

/** Ruolo dell'azienda: quello confermato nelle impostazioni, altrimenti la proposta dell'albero sulle risposte salvate. */
export function companyRole(d) {
  const st = filieraSettings(d);
  const pack = packIndex(d), sector = sectorOf(d);
  const proposal = eudrRole(st.answers, { size: st.size, pack, sector });
  const confirmed = has(st.role) && EUDR_ROLES[st.role] ? st.role : null;
  const role = confirmed || proposal.role;
  return { ...proposal, role, label: EUDR_ROLES[role].label, desc: EUDR_ROLES[role].desc, refsRequired: ROLE_REFS_REQUIRED[role], legal: ROLE_REFS_REQUIRED[role] || proposal.alsoOperator,
    duties: dutiesFor(pack.items, role, proposal.alsoOperator, sector), confirmed: !!confirmed, confirmedAt: st.roleConfirmedAt || null, proposal: proposal.role, note: has(st.roleNote) ? String(st.roleNote) : '' };
}

/* ---------------- classificazione delle materie prime ---------------- */
const ingText = ing => norm([ing?.name, ing?.label, ing?.short, ing?.code].filter(has).join(' '));
/** Suggerimento di classificazione dal nome della materia prima (parole chiave del pacchetto, prima le priorità basse). */
export function suggestClassification(d, ing) {
  const txt = ingText(ing);
  if (!txt) return null;
  const sector = sectorOf(d);
  for (const it of packList(d, 'nc')) {
    if (Array.isArray(it.sectors) && !it.sectors.includes(sector)) continue;
    const k = A(it.keywords).find(w => has(w) && txt.includes(norm(w)));
    if (k) return { itemId: it.id, commodity: it.commodity ?? null, hs: it.hs ?? null, inScope: it.inScope !== false && !!it.commodity, from: it.from || null, label: it.label, keyword: k, status: it.status || null, note: it.note || null };
  }
  return null;
}
/**
 * Classificazione di ogni materia prima: Map ingId → {ingId, ing, commodity, hs, inScope, confirmed, source, suggestion, row, futureFrom}.
 * La riga di eudrItems (confermata dall'utente) vince sul suggerimento; senza riga vale il suggerimento, segnato «da confermare».
 */
export function classification(d) {
  return cached('cls', [d?.ingredients, d?.eudrItems, d?.settings?.esg18?.packs?.filiera, sectorOf(d), esgToday(d)], () => {
    const rows = byId(A(d?.eudrItems).filter(r => r && has(r.id)));
    const today = esgToday(d), out = new Map();
    for (const ing of A(d?.ingredients)) {
      if (!ing || !has(ing.id)) continue;
      const row = rows[ing.id] || null, sug = suggestClassification(d, ing);
      if (row) out.set(ing.id, { ingId: ing.id, ing, commodity: row.commodity || null, hs: row.hs || sug?.hs || null, inScope: row.inScope === true || (row.inScope == null && !!row.commodity), confirmed: true, source: 'confermato', suggestion: sug, row, futureFrom: null });
      else if (sug) {
        const future = sug.from && today < sug.from ? sug.from : null;
        out.set(ing.id, { ingId: ing.id, ing, commodity: sug.commodity, hs: sug.hs, inScope: sug.inScope && !future, confirmed: false, source: 'suggerito', suggestion: sug, row: null, futureFrom: future });
      } else out.set(ing.id, { ingId: ing.id, ing, commodity: null, hs: null, inScope: false, confirmed: false, source: 'nessuna corrispondenza', suggestion: null, row: null, futureFrom: null });
    }
    return out;
  }, 4);
}
/** La voce classificata è un olio o un grasso (NC 1507, 1511, 1513): nelle quote della soia si conta a parte. */
export const isOilItem = k => /^(1507|1511|1513)/.test(String(k?.hs || '').replace(/\s/g, '')) || k?.ing?.category === 'grasso';

/* ---------------- stato del lotto e punteggio di rischio ---------------- */
export const DDS_PATTERN = /^\d{2}[A-Z]{2}[A-Z0-9]{10}$/;
/** Riferimento DDS normalizzato (maiuscole, senza spazi né trattini) e conforme al formato atteso (AA + paese + 10 caratteri). */
export function normDdsRef(s) { return has(s) ? String(s).toUpperCase().replace(/[\s-]/g, '') : ''; }
export const validDdsRef = s => DDS_PATTERN.test(normDdsRef(s));
const refsOf = lot => [lot?.ddsRef, ...A(lot?.upstreamRefs)].filter(has).map(normDdsRef);

/**
 * Stato di un lotto in ambito: tre indicatori separati e mai fusi.
 * eudrOk = (ruolo ≠ fuori ambito ? riferimento DDS proprio o a monte : vero) ∧ paese ∧ (rischio ≠ alto ∨ attenuazione) ∧ (operatore ⇒ geolocalizzazione valida);
 * dcf = senza conversione ∧ data limite ≤ 31/12/2020 ∧ catena IP o segregata; dcfMB = lo stesso con bilancio di massa; ssg = benchmark FEFAC SSG.
 * lot: riga di eudrLots (con riskTier e receivedAt facoltativi); item: classificazione; role: ruolo dell'azienda (un lotto
 * importato direttamente vale come operatore). → {effRole, refs, hasRef, checks, eudrOk, dcf, dcfMB, ssg, certValid, missing, state}
 */
export function lotStatus(lot = {}, item = {}, role = 'fuori-ambito', today) {
  const L = isObj(lot) ? lot : {};
  const effRole = L.directImport ? 'operatore' : EUDR_ROLES[role] ? role : 'fuori-ambito';
  const refs = refsOf(L), hasRef = refs.length > 0;
  const refRequired = effRole !== 'fuori-ambito';
  const country = normCountry(L.country);
  const tier = L.riskTier || null;
  const mitigated = has(L.mitigation);
  const geoRequired = effRole === 'operatore';
  const checks = [
    { key: 'ref', label: 'Riferimento DDS (proprio o a monte)', ok: refRequired ? hasRef : true, required: refRequired, note: refRequired ? (hasRef ? refs.join(', ') : 'mancante') : hasRef ? refs.join(', ') : 'non obbligatorio per questo ruolo' },
    { key: 'country', label: 'Paese di produzione', ok: !!country, required: true, note: country ? countryName(country) : 'mancante' },
    { key: 'risk', label: 'Rischio paese non alto, o attenuato', ok: tier !== 'alto' || mitigated, required: true, note: tier === 'alto' ? (mitigated ? 'alto, attenuato' : 'alto, senza attenuazione') : tier || 'non noto' },
    { key: 'geo', label: 'Geolocalizzazione valida (operatore)', ok: !geoRequired || L.geoValid === true, required: geoRequired, note: geoRequired ? (L.geoValid === true ? `${L.plotsCount || 0} appezzamenti validi` : 'mancante o non valida') : 'non richiesta' },
  ];
  const applicable = item?.inScope !== false;
  const eudrOk = !applicable || checks.every(c => c.ok);
  const cutoffOk = has(L.cutoff) && String(L.cutoff).slice(0, 10) <= '2020-12-31';
  const conv = L.conversionFree === true;
  const dcf = conv && cutoffOk && (L.coc === 'IP' || L.coc === 'segregato');
  const dcfMB = conv && cutoffOk && L.coc === 'bilancio-di-massa';
  const ssg = L.ssgBenchmark === '2021' || L.ssgBenchmark === '2023';
  const at = String(L.receivedAt || today || '').slice(0, 10);
  const certValid = !has(L.certExpiry) || !at ? null : String(L.certExpiry).slice(0, 10) >= at;
  const missing = [];
  if (!hasRef) missing.push('riferimento DDS');
  if (!country) missing.push('paese');
  if (!has(L.scheme)) missing.push('schema');
  if (!has(L.coc)) missing.push('catena di custodia');
  if (geoRequired && L.geoValid !== true) missing.push('geolocalizzazione');
  const state = L.status === 'respinto' ? 'respinto' : L.status === 'in verifica' ? 'in verifica' : hasRef && country && eudrOk ? 'completo' : 'incompleto';
  return { applicable, effRole, refs, hasRef, refRequired, checks, eudrOk, dcf, dcfMB, ssg, dcfChecks: { conversionFree: conv, cutoff: cutoffOk, coc: L.coc || null }, certValid, missing, state };
}

export const RISK_BANDS = [[25, 'trascurabile'], [50, 'basso'], [75, 'medio'], [Infinity, 'alto']];
const bandOf = s => RISK_BANDS.find(([lim]) => s < lim)[1];
/**
 * Punteggio di rischio interno 0–100 (punteggio interno: non sostituisce la valutazione dell'art. 10):
 * 40·paese (basso 0, standard 0,5, alto 1) + 20·materia in ambito + 15·catena (IP 0, segregata 0,2, bilancio di massa 0,6, nessuna 1)
 * + 15·certificazione (SSG 2023 0, SSG 2021 0,3, altro schema 0,5, nessuno 1) + 10·quota dei dati mancanti (paese, riferimento, schema, catena).
 * Pesi modificabili (opts.weights). Fasce: < 25 trascurabile, < 50 basso, < 75 medio, altrimenti alto. → {score, band, components, label}
 */
export function riskScore(lot = {}, opts = {}) {
  const L = isObj(lot) ? lot : {};
  const w0 = { ...DEFAULT_RISK_WEIGHTS, ...(isObj(opts.weights) ? opts.weights : {}) };
  const w = Object.fromEntries(Object.entries(w0).map(([k, v]) => [k, fin(v) && +v >= 0 ? +v : DEFAULT_RISK_WEIGHTS[k] ?? 0]));
  const tier = opts.tier ?? L.riskTier ?? null;
  const fCountry = tier === 'basso' ? 0 : tier === 'standard' ? 0.5 : 1;
  const fCommodity = opts.inScope === false ? 0 : 1;
  const fCoc = { IP: 0, segregato: 0.2, 'bilancio-di-massa': 0.6 }[L.coc] ?? 1;
  const schemeSet = has(L.scheme) && L.scheme !== 'nessuno';
  const fCert = L.ssgBenchmark === '2023' ? 0 : L.ssgBenchmark === '2021' ? 0.3 : schemeSet ? 0.5 : 1;
  const fields = [['paese', has(L.country)], ['riferimento DDS', refsOf(L).length > 0], ['schema', has(L.scheme)], ['catena di custodia', has(L.coc)]];
  const miss = fields.filter(f => !f[1]).map(f => f[0]);
  const fMissing = miss.length / fields.length;
  const tot = sum(Object.values(w)) || 1;
  const scale = 100 / tot; // con pesi modificati il punteggio resta su 100
  const components = [
    { key: 'country', label: 'Rischio paese', weight: w.country, factor: fCountry, why: tier ? `${countryName(L.country)}: rischio ${tier}` : 'paese non indicato: rischio massimo' },
    { key: 'commodity', label: 'Materia prima in ambito', weight: w.commodity, factor: fCommodity, why: fCommodity ? 'materia prima dell’allegato I' : 'fuori ambito' },
    { key: 'coc', label: 'Catena di custodia', weight: w.coc, factor: fCoc, why: has(L.coc) ? L.coc : 'non indicata' },
    { key: 'cert', label: 'Certificazione', weight: w.cert, factor: fCert, why: L.ssgBenchmark ? `FEFAC SSG ${L.ssgBenchmark}${schemeSet ? ' · ' + L.scheme : ''}` : schemeSet ? `${L.scheme}, senza benchmark SSG` : 'nessuna' },
    { key: 'missing', label: 'Dati mancanti', weight: w.missing, factor: fMissing, why: miss.length ? miss.join(', ') : 'nessuno' },
  ].map(c => ({ ...c, points: round(c.weight * c.factor * scale, 1) }));
  const score = Math.round(sum(components, c => c.points));
  return { score, band: bandOf(score), components, label: 'punteggio interno: non sostituisce la valutazione del rischio dell’art. 10' };
}

/* ---------------- registro dei lotti in ambito ---------------- */
/**
 * Registro EUDR: un elemento per ogni lotto di arrivo di una materia prima in ambito (confermata o suggerita), unito alla riga di
 * eudrLots (per ingLotId) e agli appezzamenti. → {rows (dal più recente), byId: Map, role, cls, settings}
 */
export function eudrRegister(d) {
  return cached('reg', [d?.ingLots, d?.eudrLots, d?.eudrItems, d?.ingredients, d?.suppliers, d?.eudrPlots, d?.settings?.esg18?.filiera, d?.settings?.esg18?.packs?.filiera, sectorOf(d), esgToday(d)], () => {
    const cls = classification(d), role = companyRole(d), st = filieraSettings(d), today = esgToday(d);
    const sup = byId(A(d?.suppliers).filter(s => s && has(s.id)));
    const supByName = new Map(A(d?.suppliers).filter(s => s && has(s.name)).map(s => [norm(s.name), s]));
    const byLot = new Map();
    for (const r of A(d?.eudrLots)) if (r && has(r.ingLotId) && !byLot.has(r.ingLotId)) byLot.set(r.ingLotId, r);
    const plotsBy = new Map();
    for (const p of A(d?.eudrPlots)) if (p && has(p.eudrLotId)) { if (!plotsBy.has(p.eudrLotId)) plotsBy.set(p.eudrLotId, []); plotsBy.get(p.eudrLotId).push(p); }
    const rows = [];
    for (const il of A(d?.ingLots)) {
      if (!il || !has(il.id)) continue;
      const k = cls.get(il.ingId);
      if (!k || !k.inScope) continue;
      const e = byLot.get(il.id) || null;
      const s = (il.supplierId && sup[il.supplierId]) || (e?.supplierId && sup[e.supplierId]) || (has(il.supplier) && supByName.get(norm(il.supplier))) || null;
      const date = String(il.date || '').slice(0, 10);
      const cr = countryRisk(d, e?.country, date || today);
      const lot = { ...(e || {}), receivedAt: date, riskTier: cr.tier };
      const status = lotStatus(lot, k, role.role, today);
      const risk = riskScore(lot, { weights: st.riskWeights, inScope: true, tier: cr.tier });
      const plots = e ? plotsBy.get(e.id) || EMPTY : EMPTY;
      const t = fin(il.tonnes) ? +il.tonnes : 0, price = fin(il.price) ? +il.price : 0;
      rows.push({ id: il.id, ingLot: il, e, ingId: il.ingId, ing: k.ing, item: k, commodity: k.commodity, hs: k.hs, oil: isOilItem(k), supplierId: s?.id || il.supplierId || null,
        supplierName: s?.name || il.supplier || '—', date, t, price, value: t * price, code: il.code || il.id, ddt: il.ddt || '', country: normCountry(e?.country), countryName: countryName(e?.country),
        tier: cr.tier, tierInfo: cr, status, risk, refs: status.refs, plots, plotsCount: fin(e?.plotsCount) ? +e.plotsCount : plots.length, directImport: !!e?.directImport });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(a.id).localeCompare(String(b.id))));
    return { rows, byId: new Map(rows.map(r => [r.id, r])), role, cls, settings: st };
  }, 4);
}

/* ---------------- quote della soia nei mangimi (specifico del settore mangimi) ---------------- */
const newAcc = () => ({ t: 0, dcf: 0, dcfMB: 0, ssg: 0, dds: 0, high: 0, riskMH: 0, unknown: 0, origins: new Map(), items: new Map() });
function addTo(a, row, t, ingId) {
  if (!(t > 0)) return;
  a.t += t;
  a.items.set(ingId, (a.items.get(ingId) || 0) + t);
  if (!row) { a.unknown += t; a.riskMH += t; a.origins.set('', (a.origins.get('') || 0) + t); return; }
  const f = row.status;
  if (f.dcf) a.dcf += t;
  if (f.dcfMB) a.dcfMB += t;
  if (f.ssg) a.ssg += t;
  if (f.hasRef) a.dds += t;
  if (row.tier === 'alto') a.high += t;
  if (row.risk.band === 'medio' || row.risk.band === 'alto') a.riskMH += t;
  const c = row.country || '';
  if (!c) a.unknown += t;
  a.origins.set(c, (a.origins.get(c) || 0) + t);
}
function finishAcc(a, ings, creditsT = 0) {
  const sh = x => (a.t > 0 ? x / a.t : null);
  return {
    tSoy: round(a.t, 2), tDcf: round(a.dcf, 2), tDcfMB: round(a.dcfMB, 2), tSsg: round(a.ssg, 2), tDds: round(a.dds, 2),
    dcf: sh(a.dcf), dcfMB: sh(a.dcfMB), ssg: sh(a.ssg), dds: sh(a.dds), highRisk: sh(a.high), riskMedHigh: sh(a.riskMH), unknownOrigin: sh(a.unknown),
    creditsT: round(creditsT, 1), credits: a.t > 0 ? Math.min(1, creditsT / a.t) : null,
    origins: [...a.origins].map(([c, t]) => ({ country: c || null, name: c ? countryName(c) : 'non noto', t: round(t, 2), share: a.t ? t / a.t : 0 })).sort((x, y) => y.t - x.t),
    byItem: [...a.items].map(([id, t]) => ({ ingId: id, name: ings[id]?.name || id, t: round(t, 2) })).sort((x, y) => y.t - x.t),
  };
}
/** Crediti «book and claim» attribuiti al periodo (pro quota dei giorni dell'anno); commodity 'soia' esclude RSPO, 'palma' tiene solo RSPO. */
export function creditsInPeriod(d, P, commodity = 'soia') {
  const out = { t: 0, schemes: [], rows: [] };
  if (!P?.from || !P?.to) return out;
  const schemes = new Set();
  for (const c of A(d?.soyCredits)) {
    if (!c || !fin(c.year) || !fin(c.tCovered)) continue;
    const isPalm = c.scheme === 'RSPO';
    if ((commodity === 'soia' && isPalm) || (commodity === 'palma' && !isPalm)) continue;
    const y = Math.round(+c.year), y0 = `${y}-01-01`, y1 = `${y}-12-31`;
    const lo = P.from > y0 ? P.from : y0, hi = P.to < y1 ? P.to : y1;
    if (lo > hi) continue;
    const f = (daysBetween(lo, hi) + 1) / (daysBetween(y0, y1) + 1);
    const t = +c.tCovered * f;
    out.t += t;
    if (has(c.scheme)) schemes.add(c.scheme);
    out.rows.push({ id: c.id, year: y, scheme: c.scheme, tCovered: +c.tCovered, share: f, t: round(t, 1), certId: c.certId || null });
  }
  out.t = round(out.t, 1);
  out.schemes = [...schemes];
  return out;
}
const emptyShares = () => finishAcc(newAcc(), {}, 0);
/**
 * Quote della soia nel periodo P (sostituisce la ricerca di «soia» nei nomi, F11): per consumo (composizione dei lotti prodotti,
 * o formula × produzione se mancano le composizioni) e per acquisti (lotti di arrivo). L'olio di soia (NC 1507) si conta a parte.
 * → {period, basis, consumption, purchase, oil: {consumption, purchase}, tFeed, soyPerTFeed (kg/t), credits, tSoy, dcf, dcfMB, ssg,
 *   dds, highRisk, riskMedHigh, creditsShare, origins, oilT} con le quote come frazioni 0–1 (null senza soia).
 */
export function soyShares(d, P) {
  if (!d || !P || !has(P.from) || !has(P.to)) return null;
  const reg = eudrRegister(d);
  return cached('soy|' + P.from + '|' + P.to, [reg, d.lots, d.runs, d.formulas, d.soyCredits], () => {
    const cls = reg.cls, ings = byId(A(d.ingredients).filter(i => i && has(i.id)));
    const soy = new Set([...cls.values()].filter(k => k.inScope && k.commodity === 'soia').map(k => k.ingId));
    const oilIds = new Set([...soy].filter(id => isOilItem(cls.get(id))));
    const credits = creditsInPeriod(d, P, 'soia');
    const pur = newAcc(), purOil = newAcc(), con = newAcc(), conOil = newAcc();
    let tFeed = 0, withComp = 0;
    if (soy.size) {
      for (const il of A(d.ingLots)) if (il && soy.has(il.ingId) && inP(il.date, P)) addTo(oilIds.has(il.ingId) ? purOil : pur, reg.byId.get(il.id), fin(il.tonnes) ? +il.tonnes : 0, il.ingId);
      const ilById = new Map(A(d.ingLots).filter(Boolean).map(l => [l.id, l]));
      for (const lot of A(d.lots)) {
        if (!lot || !inP(lot.date, P)) continue;
        tFeed += fin(lot.tonnes) ? +lot.tonnes : 0;
        if (!A(lot.comp).length) continue;
        withComp++;
        for (const c of lot.comp) {
          const ingId = c?.ing || ilById.get(c?.l)?.ingId;
          if (!soy.has(ingId)) continue;
          addTo(oilIds.has(ingId) ? conOil : con, reg.byId.get(c.l), (fin(c.kg) ? +c.kg : 0) / 1000, ingId);
        }
      }
      if (!withComp) {
        // senza composizioni dei lotti: formula (versione della produzione) × tonnellate prodotte, origine non nota
        tFeed = 0;
        const forms = byId(A(d.formulas).filter(f => f && has(f.id)));
        for (const r of A(d.runs)) {
          if (!r || !inP(r.date, P) || !fin(r.tonnes)) continue;
          tFeed += +r.tonnes;
          const f = forms[r.formulaId];
          const lines = (A(f?.history).find(h => h?.version === r.formulaVersion)?.lines) || f?.lines || EMPTY;
          for (const l of A(lines)) if (soy.has(l?.ing) && fin(l.kg)) addTo(oilIds.has(l.ing) ? conOil : con, null, (+l.kg / 1000) * +r.tonnes, l.ing);
        }
      }
    }
    const consumption = finishAcc(con, ings, credits.t), purchase = finishAcc(pur, ings, credits.t);
    const basis = con.t > 0 ? 'consumo' : pur.t > 0 ? 'acquisti' : null;
    const main = basis === 'acquisti' ? purchase : consumption;
    return {
      period: { from: P.from, to: P.to, key: P.key || null, label: P.label || null }, basis, compositionBased: withComp > 0,
      consumption, purchase, oil: { consumption: finishAcc(conOil, ings), purchase: finishAcc(purOil, ings) },
      tFeed: round(tFeed, 1), soyPerTFeed: tFeed > 0 ? round((con.t * 1000) / tFeed, 1) : null, credits,
      tSoy: main.tSoy, dcf: main.dcf, dcfMB: main.dcfMB, ssg: main.ssg, dds: main.dds, highRisk: main.highRisk, riskMedHigh: main.riskMedHigh, creditsShare: main.credits,
      origins: main.origins, oilT: round(basis === 'acquisti' ? purOil.t : conOil.t, 2),
    };
  }, 16);
}

/* ---------------- registro della soia DCF (bilancio di massa delle dichiarazioni) ---------------- */
const KIND_ORDER = { entrata: 0, rettifica: 1, uscita: 2 };
/**
 * Saldo del registro DCF: Σ entrate − Σ uscite ± rettifiche, in ordine di data. Negativo → allarme e dichiarazioni «DCF» bloccate.
 * → {balance, in, out, adj, n, series: [{date, balance}], negative, negativeSince, firstNegativeAt, minBalance, byScheme, claimsAllowed}
 */
export function dcfBalance(d, opts = {}) {
  const to = has(opts.to) ? String(opts.to).slice(0, 10) : '';
  return cached('dcf|' + to, [d?.dcfLedger], () => {
    const rows = A(d?.dcfLedger).filter(r => r && ISO.test(String(r.date || '').slice(0, 10)) && fin(r.tSoy) && (!to || r.date <= to))
      .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1) || String(a.id).localeCompare(String(b.id))));
    let bal = 0, inT = 0, outT = 0, adjT = 0, minBal = 0, firstNeg = null, negSince = null;
    const series = [], byScheme = {};
    for (const r of rows) {
      const t = +r.tSoy, sc = has(r.scheme) ? r.scheme : '—';
      const s = (byScheme[sc] ||= { in: 0, out: 0, adj: 0, balance: 0 });
      if (r.kind === 'entrata') { bal += Math.abs(t); inT += Math.abs(t); s.in += Math.abs(t); s.balance += Math.abs(t); }
      else if (r.kind === 'uscita') { bal -= Math.abs(t); outT += Math.abs(t); s.out += Math.abs(t); s.balance -= Math.abs(t); }
      else { bal += t; adjT += t; s.adj += t; s.balance += t; }
      if (bal < -1e-9) { if (!firstNeg) firstNeg = r.date; if (!negSince) negSince = r.date; } else negSince = null;
      minBal = Math.min(minBal, bal);
      series.push({ date: r.date, balance: round(bal, 3), id: r.id, kind: r.kind, t });
    }
    const negative = bal < -1e-9;
    return { balance: round(bal, 3), in: round(inT, 3), out: round(outT, 3), adj: round(adjT, 3), n: rows.length, series, negative, negativeSince: negative ? negSince : null,
      firstNegativeAt: firstNeg, minBalance: round(minBal, 3), lastDate: rows.length ? rows[rows.length - 1].date : null, byScheme, claimsAllowed: !negative };
  }, 4);
}
/** Le dichiarazioni «DCF» sono ammesse? No se il registro DCF è negativo (usato da lettere e, nell'integrazione, dal controllo delle dichiarazioni). */
export function dcfClaimCheck(d) {
  const b = dcfBalance(d);
  return b.negative
    ? { ok: false, balance: b.balance, reason: `Registro della soia DCF negativo (${nf(b.balance, 1)} t dal ${dateIt(b.negativeSince)}): le dichiarazioni «senza deforestazione» sono bloccate finché il saldo non torna positivo.` }
    : { ok: true, balance: b.balance, reason: null };
}

/* ---------------- tracciabilità: riferimenti per le consegne ---------------- */
const traceIx = d => cached('trace', [d?.lots, d?.shipments, d?.ingLots, d?.adjustments], () => buildIndex({ lots: A(d?.lots), shipments: A(d?.shipments), ingLots: A(d?.ingLots), adjustments: A(d?.adjustments) }), 2);
const shipIx = d => cached('ship', [d?.shipments], () => new Map(A(d?.shipments).filter(s => s && has(s.id)).map(s => [s.id, s])), 2);
/**
 * Riferimenti DDS delle consegne indicate (contratto per il pacchetto pcf): consegna → lotto prodotto → lotti di materia prima
 * consumati (trace.js) → righe di eudrLots. Una riga per lotto di arrivo in ambito, con i kg attribuiti alle consegne (quota delle t
 * della consegna sul lotto prodotto). → [{ingLotId, ingLotCode, ingId, ingName, commodity, hs, supplierId, supplierName, receivedAt,
 *   ddsRef, upstreamRefs, refs, country, riskTier, scheme, coc, dcf, dcfMB, ssg, eudrOk, state, directImport, kg, shipmentIds, lotIds}]
 */
export function refsForShipments(d, shipmentIds) {
  const ids = A(shipmentIds).filter(has);
  if (!ids.length || !A(d?.shipments).length) return [];
  const ix = traceIx(d), ships = shipIx(d), reg = eudrRegister(d), cls = reg.cls;
  const acc = new Map();
  for (const sid of ids) {
    const s = ships.get(sid);
    if (!s || !has(s.lotId)) continue;
    const lot = ix.lotById.get(s.lotId);
    if (!lot || !(+lot.tonnes > 0)) continue;
    const f = Math.min(1, (fin(s.tonnes) ? +s.tonnes : 0) / +lot.tonnes);
    for (const c of A(lot.comp)) {
      const il = ix.ingLotById.get(c?.l);
      const ingId = c?.ing || il?.ingId;
      const k = cls.get(ingId);
      if (!k || !k.inScope) continue;
      const r = reg.byId.get(c.l) || null;
      let row = acc.get(c.l);
      if (!row) {
        const e = r?.e || {};
        acc.set(c.l, row = { ingLotId: c.l, ingLotCode: il?.code || c.l, ingId, ingName: k.ing?.name || ingId, commodity: k.commodity, hs: k.hs || null,
          supplierId: r?.supplierId || il?.supplierId || null, supplierName: r?.supplierName || il?.supplier || '—', receivedAt: il?.date || null,
          ddsRef: has(e.ddsRef) ? normDdsRef(e.ddsRef) : null, upstreamRefs: A(e.upstreamRefs).filter(has).map(normDdsRef), refs: r ? r.refs : [], country: r?.country || null,
          riskTier: r?.tier || null, scheme: e.scheme || null, coc: e.coc || null, dcf: !!r?.status.dcf, dcfMB: !!r?.status.dcfMB, ssg: !!r?.status.ssg, eudrOk: r ? r.status.eudrOk : false,
          state: r ? r.status.state : 'incompleto', directImport: !!e.directImport, kg: 0, shipmentIds: [], lotIds: [] });
      }
      row.kg += (fin(c.kg) ? +c.kg : 0) * f;
      if (!row.shipmentIds.includes(sid)) row.shipmentIds.push(sid);
      if (!row.lotIds.includes(lot.id)) row.lotIds.push(lot.id);
    }
  }
  return [...acc.values()].map(r => ({ ...r, kg: round(r.kg, 1) })).sort((a, b) => b.kg - a.kg || String(a.ingLotId).localeCompare(String(b.ingLotId)));
}

/* ---------------- lettera EUDR ai clienti ---------------- */
/**
 * Lettera EUDR per un cliente e un periodo (chiave dell'esercizio ESG o periodo {from, to}), in italiano o inglese: testo di base
 * («il mangime composto (NC 2309) non rientra nell'allegato I…»), tabella dei riferimenti dei soli lotti tracciati nelle sue
 * consegne, lotti senza riferimento dichiarati come «in acquisizione», soia DCF solo se il registro DCF lo consente, crediti
 * riportati a parte; chiude con l'avvertenza e la nota «da verificare con il consulente legale». null se il cliente non esiste.
 */
export function customerEudrLetter(d, customerId, periodKey, lang = 'it') {
  const L = lang === 'en' ? 'en' : 'it';
  const cust = A(d?.customers).find(c => c && c.id === customerId);
  if (!cust) return null;
  const P = isObj(periodKey) && has(periodKey.from) ? periodKey : periodByKey(d, periodKey) || currentPeriod(d);
  const ships = A(d.shipments).filter(s => s && s.customerId === customerId && inP(s.date, P));
  const refs = refsForShipments(d, ships.map(s => s.id));
  const tShip = sum(ships, s => (fin(s.tonnes) ? +s.tonnes : 0));
  const tIn = sum(refs, r => r.kg) / 1000;
  const missing = refs.filter(r => !r.refs.length);
  const tMissing = sum(missing, r => r.kg) / 1000;
  const shareMissing = tIn > 0 ? tMissing / tIn : 0;
  const claim = dcfClaimCheck(d);
  const dcfRows = refs.filter(r => r.dcf && r.commodity === 'soia');
  const tDcf = sum(dcfRows, r => r.kg) / 1000;
  const dcfSchemes = [...new Set(dcfRows.map(r => r.scheme).filter(has))];
  const credits = creditsInPeriod(d, P, 'soia');
  const co = d.settings?.company || {};
  const periodTxt = `${dateIt(P.from)} – ${dateIt(P.to)}`;
  const paragraphs = [T('filiera.letter.deliveries', { period: periodTxt, t: fmtNum(tShip, '', L, 1), n: ships.length }, L)];
  if (!refs.length) paragraphs.push(T('filiera.letter.noScope', {}, L));
  else {
    paragraphs.push(T(sectorOf(d) === 'mangimi' ? 'filiera.letter.scope.mangimi' : 'filiera.letter.scope.generic', {}, L));
    const qty = T('filiera.letter.quantity', { tIn: fmtNum(tIn, '', L, 1), nLots: String(refs.length) }, L);
    paragraphs.push(tDcf >= 0.05 && claim.ok ? `${qty} ${T('filiera.letter.dcf', { t: fmtNum(tDcf, '', L, 1), schemes: listJoin(dcfSchemes, L) || '—' }, L)}` : qty);
    paragraphs.push(missing.length ? T('filiera.letter.partial', { nMissing: String(missing.length), share: fmtNum(shareMissing * 100, '%', L, 1) }, L) : T('filiera.letter.allCovered', {}, L));
  }
  if (credits.t >= 0.5) paragraphs.push(T('filiera.letter.credits', { t: fmtNum(credits.t, '', L, 0), schemes: listJoin(credits.schemes, L) || '—' }, L));
  paragraphs.push(T('filiera.letter.closing', {}, L));
  const rows = refs.map(r => ({
    ingLotId: r.ingLotId, missing: !r.refs.length, ref: r.refs.length ? r.refs.join(', ') : T('filiera.ref.missing', {}, L),
    refKind: r.refs.length ? T(r.directImport ? 'filiera.ref.own' : 'filiera.ref.upstream', {}, L) : '',
    material: r.ingName, hs: r.hs || '—', country: r.country ? (L === 'en' ? r.country : `${countryName(r.country)} (${r.country})`) : '—', supplier: r.supplierName, lot: r.ingLotCode, t: round(r.kg / 1000, 2),
  }));
  const letter = {
    lang: L, customer: { id: cust.id, name: cust.name || cust.id, code: cust.code || '' }, period: { key: P.key || null, label: periodTxt, from: P.from, to: P.to }, issuedAt: esgToday(d),
    company: co.name || 'FeedOS', site: co.site || co.address || '', title: T('filiera.letter.title', {}, L), subject: T('filiera.letter.subject', { period: periodTxt }, L),
    salutation: T('filiera.letter.salutation', { customer: cust.name || cust.id }, L), paragraphs, regards: T('filiera.letter.regards', {}, L), signature: co.name || '',
    tableTitle: T('filiera.letter.tableTitle', {}, L), cols: ['ref', 'material', 'hs', 'country', 'supplier', 'lot', 't'].map(k => ({ key: k, label: T(`filiera.col.${k === 't' ? 'qty' : k}`, {}, L) })),
    rows, totals: { nShip: ships.length, tShip: round(tShip, 1), tIn: round(tIn, 2), nLots: refs.length, nMissing: missing.length, tMissing: round(tMissing, 2), shareMissing, shareWithRef: tIn > 0 ? 1 - shareMissing : null },
    dcf: { t: round(tDcf, 2), schemes: dcfSchemes, allowed: claim.ok, reason: claim.reason }, credits, disclaimer: T('disclaimer', {}, L), draftNote: T('filiera.letter.draft', {}, L), warnings: [],
  };
  letter.text = letterText(letter);
  letter.markdown = letterMarkdown(letter);
  if (!claim.ok && tDcf >= 0.05) letter.warnings.push(claim.reason);
  let cc = null;
  try { cc = checkClaim(letter.text, { d, lang: L, kind: 'lettera-eudr' }); } catch { cc = null; }
  if (cc && cc.ok === false) letter.warnings.push(...A(cc.findings).map(f => (typeof f === 'string' ? f : f?.msg || f?.text || 'dichiarazione da rivedere')));
  return letter;
}
/** Testo semplice della lettera (per la copia e il file .txt). */
export function letterText(l) {
  const lines = [l.company, l.site, '', `${dateIt(l.issuedAt)}`, '', l.title, l.subject, '', l.salutation, ...l.paragraphs.flatMap(p => [p, '']), `${l.tableTitle}:`];
  for (const r of l.rows) lines.push(`- ${r.ref}${r.refKind ? ` (${r.refKind})` : ''} · ${r.material} · NC ${r.hs} · ${r.country} · ${r.supplier} · ${r.lot} · ${fmtNum(r.t, 't', l.lang, 2)}`);
  if (!l.rows.length) lines.push('—');
  lines.push('', l.regards, l.signature, '', l.disclaimer, l.draftNote);
  return lines.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}
/** Lettera in Markdown (con la tabella dei riferimenti). */
export function letterMarkdown(l) {
  const esc = s => String(s ?? '').replace(/\|/g, '/');
  const out = [`**${esc(l.company)}**${l.site ? ' · ' + esc(l.site) : ''}`, '', dateIt(l.issuedAt), '', `# ${esc(l.title)}`, '', `**${esc(l.subject)}**`, '', l.salutation, '', ...l.paragraphs.flatMap(p => [p, '']), `## ${esc(l.tableTitle)}`, ''];
  out.push('| ' + l.cols.map(c => esc(c.label)).join(' | ') + ' |', '| ' + l.cols.map(c => (c.key === 't' ? '---:' : '---')).join(' | ') + ' |');
  for (const r of l.rows) out.push('| ' + l.cols.map(c => esc(c.key === 't' ? fmtNum(r.t, '', l.lang, 2) : r[c.key])).join(' | ') + ' |');
  out.push('', l.regards, '', l.signature, '', `_${l.disclaimer}_`, '', `> ${l.draftNote}`);
  return out.join('\n');
}

/* ---------------- fornitori: valutazione ESG, richieste ---------------- */
const clamp100 = v => Math.max(0, Math.min(100, +v));
/**
 * Valutazione ESG di un fornitore (affianca la classifica di suppliers.js senza modificarla): punteggi E/S/G 0–100 dell'ultima
 * valutazione e rischio interno 0–100 = 40·(1 − ESG/100, 0,6 se non valutato o scaduto) + 15·rischio paese + 15·quota senza DDS dei lotti
 * in ambito degli ultimi 12 mesi + 10·segnalazioni sui diritti umani (3 o più = 1) + 10·azioni correttive (scadute 1, aperte 0,5)
 * + 10·codice di condotta non firmato. Fasce: < 25 basso, < 50 medio, altrimenti alto. null se il fornitore non esiste.
 */
export function supplierEsgScore(d, supplierId, opts = {}) {
  const today = has(opts.today) ? opts.today : esgToday(d);
  const s = A(d?.suppliers).find(x => x && x.id === supplierId) || null;
  const a = A(d?.supplierEsg).find(x => x && x.id === supplierId) || null;
  if (!s && !a) return null;
  const st = filieraSettings(d);
  const assessed = has(a?.assessedAt);
  const valid = assessed && a.assessedAt >= addMonths(today, -(fin(st.assessmentValidMonths) ? +st.assessmentValidMonths : 36)) && a.assessedAt <= today;
  const E = fin(a?.scoreE) ? clamp100(a.scoreE) : null, S = fin(a?.scoreS) ? clamp100(a.scoreS) : null, G = fin(a?.scoreG) ? clamp100(a.scoreG) : null;
  const parts = [E, S, G].filter(v => v != null);
  const esg = parts.length ? Math.round(sum(parts) / parts.length) : null;
  const lots = eudrRegister(d).rows.filter(r => r.supplierId === supplierId && r.date >= addDays(today, -365) && r.date <= today);
  const tIn = sum(lots, r => r.t), tRef = sum(lots.filter(r => r.status.hasRef), r => r.t);
  const refShare = tIn > 0 ? tRef / tIn : null;
  const lotTier = lots.some(r => r.tier === 'alto') ? 'alto' : lots.some(r => r.tier === 'standard') ? 'standard' : lots.length ? 'basso' : null;
  const tier = ['basso', 'standard', 'alto'].includes(a?.countryRisk) ? a.countryRisk : lotTier;
  const flags = A(a?.hrFlags).map(f => (typeof f === 'string' ? { text: f, kind: 'rischio' } : isObj(f) ? { text: String(f.text || ''), kind: f.kind || 'rischio', date: f.date || null } : null)).filter(f => f && has(f.text));
  const capa = A(a?.capa).filter(isObj).map((c, i) => ({ ...c, i, overdue: c.status !== 'chiusa' && has(c.due) && c.due < today }));
  const open = capa.filter(c => c.status !== 'chiusa'), overdue = open.filter(c => c.overdue);
  const cocSigned = has(a?.cocSignedAt);
  const W = { esg: 40, country: 15, eudr: 15, hr: 10, capa: 10, coc: 10 };
  const components = [
    { key: 'esg', label: 'Valutazione ESG', weight: W.esg, factor: esg != null && valid ? 1 - esg / 100 : 0.6, why: esg == null ? 'nessuna valutazione' : valid ? `${esg}/100 (${dateIt(a.assessedAt)})` : `${esg}/100, valutazione scaduta` },
    { key: 'country', label: 'Rischio paese delle forniture', weight: W.country, factor: { basso: 0, standard: 0.5, alto: 1 }[tier] ?? 0.5, why: tier || 'non noto' },
    { key: 'eudr', label: 'Lotti in ambito senza DDS (12 mesi)', weight: W.eudr, factor: tIn > 0 ? 1 - (refShare ?? 0) : 0, why: tIn > 0 ? `${pctTxt(1 - refShare)} di ${nf(tIn, 0)} t` : 'nessun lotto in ambito' },
    { key: 'hr', label: 'Segnalazioni sui diritti umani', weight: W.hr, factor: Math.min(1, flags.length / 3), why: flags.length ? flags.map(f => f.text).join('; ') : 'nessuna' },
    { key: 'capa', label: 'Azioni correttive', weight: W.capa, factor: overdue.length ? 1 : open.length ? 0.5 : 0, why: overdue.length ? `${overdue.length} scadute` : open.length ? `${open.length} aperte` : 'nessuna aperta' },
    { key: 'coc', label: 'Codice di condotta', weight: W.coc, factor: cocSigned ? 0 : 1, why: cocSigned ? `firmato il ${dateIt(a.cocSignedAt)}` : 'non firmato' },
  ].map(c => ({ ...c, points: round(c.weight * c.factor, 1) }));
  const score = Math.round(sum(components, c => c.points));
  const audits = A(a?.audits).filter(isObj).slice().sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
  const nextReview = has(a?.nextReview) ? a.nextReview : assessed ? addMonths(a.assessedAt, fin(st.reviewMonths) ? +st.reviewMonths : 12) : null;
  return {
    supplierId, name: s?.name || supplierId, approval: s?.approval || null, assessed, valid, assessedAt: a?.assessedAt || null, E, S, G, esg,
    risk: { score, band: score < 25 ? 'basso' : score < 50 ? 'medio' : 'alto', components, label: 'punteggio interno di rischio del fornitore' },
    coc: { signed: cocSigned, at: a?.cocSignedAt || null, evidenceId: a?.cocEvidenceId || null }, capa: { items: capa, open: open.length, overdue: overdue.length },
    audits, lastAudit: audits[0] || null, flags, nextReview, reviewDue: !!nextReview && nextReview < today, eudr: { t: round(tIn, 1), refShare, lots: lots.length }, countryRisk: tier, source: a?.source || null,
  };
}
/** Spesa per materie prime nel periodo per fornitore (lotti di arrivo × prezzo): Map supplierId → €. */
function spendBySupplier(d, P) {
  const sup = A(d?.suppliers), byName = new Map(sup.filter(s => s && has(s.name)).map(s => [norm(s.name), s.id]));
  const out = new Map();
  for (const il of A(d?.ingLots)) {
    if (!il || !inP(il.date, P) || !fin(il.tonnes) || !fin(il.price)) continue;
    const id = il.supplierId || (has(il.supplier) ? byName.get(norm(il.supplier)) : null);
    if (!id) continue;
    out.set(id, (out.get(id) || 0) + +il.tonnes * +il.price);
  }
  return out;
}
/** Tabella ESG dei fornitori per il periodo: spesa, esposizione EUDR, punteggi, rischio, codice, revisione, azioni (spesa decrescente). */
export function supplierEsgTable(d, P, today) {
  const t = has(today) ? today : esgToday(d);
  const PP = P?.from ? P : currentPeriod(d);
  const spend = spendBySupplier(d, PP);
  const total = sum([...spend.values()]);
  return A(d?.suppliers).filter(s => s && has(s.id)).map(s => {
    const sc = supplierEsgScore(d, s.id, { today: t });
    const sp = spend.get(s.id) || 0;
    return { id: s.id, name: s.name || s.id, approval: s.approval || null, spend: sp, spendShare: total ? sp / total : 0, ...sc, spendKey: sp };
  }).sort((a, b) => b.spend - a.spend || String(a.name).localeCompare(String(b.name), 'it'));
}
/** Quota della spesa del periodo verso fornitori con una valutazione ESG valida alla fine del periodo (KPI esg-fornitori-esg). */
export function assessedSpendShare(d, P) {
  if (!P?.from) return null;
  const spend = spendBySupplier(d, P);
  const total = sum([...spend.values()]);
  if (!(total > 0)) return null;
  const st = filieraSettings(d), months = fin(st.assessmentValidMonths) ? +st.assessmentValidMonths : 36;
  const lo = addMonths(P.to, -months);
  const ok = new Set(A(d?.supplierEsg).filter(a => a && has(a.assessedAt) && a.assessedAt <= P.to && a.assessedAt >= lo).map(a => a.id));
  return sum([...spend].filter(([id]) => ok.has(id)), ([, v]) => v) / total;
}
export const REQUEST_KINDS = { eudr: 'EUDR: riferimenti DDS e origine dei lotti', esg: 'Questionario ESG', pcf: 'Impronta dei prodotti (campi PACT)', certificati: 'Certificati' };
const OPEN_REQ = ['inviato', 'sollecitato'];
/** Richieste ai fornitori con nome, aperta e scaduta, dalla più recente. */
export function supplierRequestsView(d, today) {
  const t = has(today) ? today : esgToday(d);
  const sup = byId(A(d?.suppliers).filter(s => s && has(s.id)));
  return A(d?.supplierRequests).filter(r => r && has(r.id)).map(r => ({ ...r, supplierName: sup[r.supplierId]?.name || r.supplierId || '—', kindLabel: REQUEST_KINDS[r.kind] || r.kind,
    open: OPEN_REQ.includes(r.status), overdue: OPEN_REQ.includes(r.status) && has(r.dueAt) && r.dueAt < t, daysLeft: has(r.dueAt) ? daysBetween(t, r.dueAt) : null }))
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')) || String(a.id).localeCompare(String(b.id)));
}

/* ---------------- scadenze, riepilogo ---------------- */
/** Scadenze EUDR applicabili all'azienda (dimensione, palma solo se presente), con i giorni mancanti. */
export function eudrDeadlines(d, today) {
  const t = has(today) ? today : esgToday(d);
  const role = companyRole(d);
  const palm = [...classification(d).values()].some(k => k.commodity === 'palma' && (k.inScope || k.futureFrom));
  return packList(d, 'scadenza').filter(x => ISO.test(String(x.date || '')) && (!x.size || x.size === role.size) && (!x.commodity || (x.commodity === 'palma' && palm)))
    .map(x => ({ ...x, days: daysBetween(t, x.date), past: x.date < t })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Modello di lettura della pagina e del riquadro: ruolo, scadenze, lotti del periodo, quote della soia, registro DCF, fornitori,
 * richieste, classificazione, prontezza (quota delle t in ambito con dati completi) e pacchetto di contenuti.
 */
export function filieraSummary(d, P) {
  if (!d || !isObj(d)) return null;
  const today = esgToday(d);
  const PP = P && has(P.from) && has(P.to) ? P : currentPeriod(d);
  const reg = eudrRegister(d), st = reg.settings;
  const rowsP = reg.rows.filter(r => inP(r.date, PP));
  const tP = sum(rowsP, r => r.t);
  const withRef = rowsP.filter(r => r.status.hasRef), complete = rowsP.filter(r => r.status.state === 'completo');
  const win = fin(st.signalWindowDays) ? +st.signalWindowDays : 45;
  const recentMissing = reg.rows.filter(r => !r.status.hasRef && r.status.state !== 'respinto' && r.date >= addDays(today, -win) && r.date <= today);
  const deadlines = eudrDeadlines(d, today);
  const deadline = deadlines.find(x => !x.past) || deadlines[deadlines.length - 1] || null;
  const cls = [...reg.cls.values()];
  const reqs = supplierRequestsView(d, today);
  const supRows = A(d.suppliers).filter(s => s && has(s.id));
  const esgRows = supRows.map(s => supplierEsgScore(d, s.id, { today })).filter(Boolean);
  const pack = packIndex(d);
  return {
    period: { key: PP.key || null, from: PP.from, to: PP.to, label: PP.label || `${dateIt(PP.from)} – ${dateIt(PP.to)}` }, today,
    role: { role: reg.role.role, label: reg.role.label, confirmed: reg.role.confirmed, alsoOperator: reg.role.alsoOperator, refsRequired: reg.role.refsRequired, size: reg.role.size, applicableFrom: reg.role.applicableFrom },
    deadline: deadline ? { date: deadline.date, days: deadline.days, past: deadline.past, label: deadline.label, status: deadline.status } : null, deadlines,
    lots: { n: rowsP.length, t: round(tP, 1), nWithRef: withRef.length, tWithRef: round(sum(withRef, r => r.t), 1), refShare: tP > 0 ? sum(withRef, r => r.t) / tP : null,
      nComplete: complete.length, readiness: tP > 0 ? sum(complete, r => r.t) / tP : null, nIncomplete: rowsP.filter(r => r.status.state === 'incompleto').length,
      nHighRisk: rowsP.filter(r => r.tier === 'alto').length, nInReview: rowsP.filter(r => r.status.state === 'in verifica').length, recentMissing: recentMissing.length,
      recentMissingT: round(sum(recentMissing, r => r.t), 1), all: reg.rows.length },
    soy: soyShares(d, PP), dcf: dcfBalance(d), credits: creditsInPeriod(d, PP, 'soia'),
    suppliers: { n: supRows.length, assessed: esgRows.filter(r => r.valid).length, cocSigned: esgRows.filter(r => r.coc.signed).length, capaOpen: sum(esgRows, r => r.capa.open), capaOverdue: sum(esgRows, r => r.capa.overdue),
      reviewsDue: esgRows.filter(r => r.reviewDue).length, highRisk: esgRows.filter(r => r.risk.band === 'alto').length, spendAssessed: assessedSpendShare(d, PP) },
    requests: { n: reqs.length, open: reqs.filter(r => r.open).length, overdue: reqs.filter(r => r.overdue).length, received: reqs.filter(r => r.status === 'ricevuto' || r.status === 'accettato').length },
    classification: { inScope: cls.filter(k => k.inScope).length, confirmed: cls.filter(k => k.confirmed).length, toConfirm: cls.filter(k => !k.confirmed && k.suggestion && k.suggestion.commodity).length },
    pack: { version: pack.version || null, validAsOf: pack.validAsOf || null, origin: pack.origin || 'integrato' },
  };
}

/* ---------------- segnali di «Oggi» ---------------- */
/** Segnali: DDS mancante sui lotti recenti, conto alla rovescia, lotto ad alto rischio, registro DCF negativo, certificato in scadenza, richiesta scaduta, revisione del fornitore. */
export function filieraSignals(d, ctx) {
  if (!FILIERA_TAB) return [];
  if (!d || !A(d.ingLots).length && !A(d.supplierRequests).length && !A(d.supplierEsg).length && !A(d.dcfLedger).length) return [];
  const today = todayOf(d, ctx);
  const reg = eudrRegister(d), role = reg.role, st = reg.settings, out = [];
  const win = fin(st.signalWindowDays) ? +st.signalWindowDays : 45;
  for (const r of reg.rows) {
    if (r.date > today || r.date < addDays(today, -win) || r.status.hasRef || r.status.state === 'respinto') continue;
    const legal = r.status.effRole === 'operatore' || role.refsRequired;
    const crit = legal && today >= role.applicableFrom;
    out.push({ key: `eudr:dds-missing:${r.id}`, area: 'esg', roles: ['acquisti', 'qualita'], severity: crit ? 'critico' : 'attenzione',
      title: `Lotto ${r.code} senza riferimento DDS`,
      why: `${nf(r.t, 1)} t di ${r.ing?.name || r.ingId} da ${r.supplierName}, arrivate il ${dateIt(r.date)}: manca il numero di riferimento della dichiarazione di dovuta diligenza. ${legal ? `Per il ruolo «${r.status.effRole === 'operatore' ? 'Operatore' : role.label}» il riferimento è obbligatorio dal ${dateIt(role.applicableFrom)}.` : 'Non è un obbligo per chi trasforma in mangime, ma i clienti lo chiedono nelle lettere EUDR.'}`,
      action: 'Chiedere il riferimento al fornitore (ESG › EUDR e fornitori › Moduli) e registrarlo nel lotto.', impact: Math.round(r.value), link: LINK(`lotto.${r.id}`) });
  }
  const recent = reg.rows.filter(r => r.date >= addDays(today, -90) && r.date <= today);
  const tRecent = sum(recent, r => r.t), tMiss = sum(recent.filter(r => !r.status.hasRef), r => r.t);
  for (const x of eudrDeadlines(d, today)) {
    if (x.days < 0 || x.days > 60) continue;
    const band = x.days <= 7 ? 7 : x.days <= 30 ? 30 : 60;
    out.push({ key: `eudr:deadline:${x.date}:${band}`, area: 'esg', roles: ['direzione', 'acquisti'], severity: 'info',
      title: `EUDR: ${x.days === 0 ? 'si applica da oggi' : `${x.days} giorni al ${dateIt(x.date)}`}`,
      why: `${x.label}. Ruolo dell’azienda: ${role.label}${role.confirmed ? '' : ' (proposto, da confermare)'}. Lotti in ambito degli ultimi 90 giorni senza riferimento DDS: ${recent.filter(r => !r.status.hasRef).length} (${pctTxt(tRecent ? tMiss / tRecent : 0)} delle tonnellate).`,
      action: 'Confermare il ruolo e completare i riferimenti dei lotti in ESG › EUDR e fornitori.', impact: 5000 + (60 - x.days) * 100, link: LINK('ruolo') });
  }
  for (const r of reg.rows) {
    if (r.tier !== 'alto' || has(r.e?.mitigation) || r.status.state === 'respinto' || r.date < addDays(today, -365) || r.date > today) continue;
    out.push({ key: `eudr:high-risk:${r.id}`, area: 'esg', roles: ['acquisti'], severity: 'attenzione', title: `Lotto ${r.code} da un paese ad alto rischio`,
      why: `${nf(r.t, 1)} t di ${r.ing?.name || r.ingId} con paese di produzione ${r.countryName}, classificato ad alto rischio (${r.tierInfo.source}). Non è registrata alcuna misura di attenuazione.`,
      action: 'Registrare nel lotto le misure di attenuazione (verifiche, analisi satellitare del fornitore, audit) o respingere il lotto.', impact: Math.round(r.value), link: LINK(`lotto.${r.id}`) });
  }
  const dcf = dcfBalance(d);
  if (dcf.negative) out.push({ key: `eudr:dcf-negative:${dcf.negativeSince}`, area: 'esg', roles: ['commerciale', 'qualita'], severity: 'critico', title: 'Registro della soia DCF negativo',
    why: `Saldo ${nf(dcf.balance, 1)} t dal ${dateIt(dcf.negativeSince)}: le vendite dichiarate «con soia senza deforestazione» superano la soia certificata entrata. Le dichiarazioni DCF sono bloccate.`,
    action: 'Registrare gli arrivi certificati mancanti o correggere le uscite in ESG › EUDR e fornitori › Bilancio DCF.', impact: 2e5, link: LINK('bilancio-dcf') });
  const certs = new Map();
  const sup = byId(A(d.suppliers).filter(s => s && has(s.id)));
  for (const r of reg.rows) {
    const e = r.e;
    if (!e || !has(e.certNo) || !has(e.certExpiry) || !r.supplierId || r.date < addDays(today, -365)) continue;
    const k = `${r.supplierId}|${normDdsRef(e.certNo)}`;
    if (!certs.has(k)) certs.set(k, { supplierId: r.supplierId, certNo: e.certNo, scheme: e.scheme || '', expiry: e.certExpiry, supplierName: r.supplierName });
  }
  const schemeCodes = new Set(packList(d, 'schema').map(s => s.code).filter(c => c && c !== 'altro' && c !== 'nessuno'));
  for (const s of Object.values(sup)) for (const c of A(s.cert)) if (c && schemeCodes.has(c.type) && has(c.expiry)) {
    const k = `${s.id}|${normDdsRef(c.number || c.type)}`;
    if (!certs.has(k)) certs.set(k, { supplierId: s.id, certNo: c.number || c.type, scheme: c.type, expiry: c.expiry, supplierName: s.name });
  }
  for (const c of certs.values()) {
    const days = daysBetween(today, c.expiry);
    if (days < -30 || days > 30) continue;
    out.push({ key: `eudr:cert-expiry:${c.supplierId}:${slug(c.certNo) || 'certificato'}`, area: 'esg', roles: ['acquisti'], severity: 'attenzione',
      title: `Certificato ${c.scheme || ''} di ${c.supplierName} ${days < 0 ? 'scaduto' : 'in scadenza'}`.replace(/\s+/g, ' '),
      why: `Il certificato ${c.certNo}${c.scheme ? ` (${c.scheme})` : ''} ${days < 0 ? 'è scaduto il' : 'scade il'} ${dateIt(c.expiry)} (${relDays(c.expiry, today)}): i lotti arrivati dopo la scadenza non risultano certificati.`,
      action: 'Chiedere al fornitore il certificato rinnovato (modulo «Certificati» in ESG › EUDR e fornitori › Moduli).', impact: 1e4, link: LINK('fornitori') });
  }
  for (const r of supplierRequestsView(d, today)) {
    if (!r.overdue) continue;
    out.push({ key: `eudr:request-overdue:${r.id}`, area: 'esg', roles: ['acquisti'], severity: 'attenzione', title: `Risposta di ${r.supplierName} in ritardo`,
      why: `Richiesta «${r.kindLabel}» inviata il ${dateIt(r.sentAt)}, risposta attesa entro il ${dateIt(r.dueAt)} (${relDays(r.dueAt, today)}).`,
      action: 'Sollecitare il fornitore e rinviare il modulo (ESG › EUDR e fornitori › Moduli).', impact: 8000, link: LINK('moduli') });
  }
  for (const s of Object.values(sup)) {
    const sc = supplierEsgScore(d, s.id, { today });
    if (!sc || !sc.assessed || !sc.reviewDue) continue;
    out.push({ key: `eudr:review-due:${s.id}`, area: 'esg', roles: ['acquisti'], severity: 'info', title: `Revisione ESG di ${s.name} scaduta`,
      why: `Ultima valutazione del ${dateIt(sc.assessedAt)}, revisione prevista entro il ${dateIt(sc.nextReview)}: punteggio ESG ${sc.esg ?? '—'}/100, rischio ${sc.risk.band}.`,
      action: 'Inviare il questionario ESG al fornitore e aggiornare la valutazione.', impact: 3000, link: LINK('fornitori') });
  }
  return out;
}

/* ---------------- sezione del report «EUDR e fornitori» (83) ---------------- */
/** Sezione del report CdA / Rapporto ESG: quote della soia con DDS, DCF fisica, SSG, origine ad alto rischio, richieste aperte; tabella per fornitore. */
export function filieraReportSection(d, ctx, P, C) {
  if (!FILIERA_TAB) return null;
  if (!d || !P || !has(P.from)) return null;
  const reg = eudrRegister(d);
  const rows = reg.rows.filter(r => inP(r.date, P));
  if (!rows.length && !A(d.supplierEsg).length) return null;
  const today = todayOf(d, ctx);
  const sh = soyShares(d, P), shC = C && has(C.from) && !C.budget ? soyShares(d, C) : null;
  const cur = sh?.purchase, prev = shC?.purchase && shC.purchase.tSoy > 0 ? shC.purchase : null;
  const cmp = (key, good) => (prev && prev[key] != null ? { value: prev[key], kind: 'ratio', good, label: C.label || 'periodo di confronto' } : undefined);
  const reqs = supplierRequestsView(d, today);
  const role = reg.role, dl = eudrDeadlines(d, today).find(x => !x.past);
  const tAll = sum(rows, r => r.t), tRef = sum(rows.filter(r => r.status.hasRef), r => r.t);
  const kpis = [
    { label: 'Materie prime in ambito con riferimento DDS', value: tAll > 0 ? tRef / tAll : null, unit: '%', decimals: 0, status: tAll > 0 ? (tRef / tAll >= 0.95 ? 'ok' : tRef / tAll >= 0.8 ? 'warn' : 'bad') : undefined, note: `${nf(tAll, 0)} t in ambito ricevute` },
    { label: 'Soia senza deforestazione (DCF fisica)', value: cur?.dcf ?? null, unit: '%', decimals: 1, cmp: cmp('dcf', 'up'), note: cur?.dcfMB ? `più ${pctTxt(cur.dcfMB, 1)} in bilancio di massa` : undefined },
    { label: 'Soia conforme FEFAC SSG', value: cur?.ssg ?? null, unit: '%', decimals: 0, cmp: cmp('ssg', 'up') },
    { label: 'Soia da paesi ad alto rischio', value: cur?.highRisk ?? null, unit: '%', decimals: 1, cmp: cmp('highRisk', 'down') },
    { label: 'Richieste ai fornitori aperte', value: reqs.filter(r => r.open).length, unit: '', decimals: 0, status: reqs.some(r => r.overdue) ? 'warn' : 'ok', note: reqs.some(r => r.overdue) ? `${reqs.filter(r => r.overdue).length} in ritardo` : undefined },
  ];
  const bySup = new Map();
  for (const r of rows) {
    const k = r.supplierId || r.supplierName;
    if (!bySup.has(k)) bySup.set(k, { id: k, name: r.supplierName, t: 0, ref: 0, dcf: 0, ssg: 0, risk: 0 });
    const x = bySup.get(k);
    x.t += r.t; if (r.status.hasRef) x.ref += r.t; if (r.status.dcf) x.dcf += r.t; if (r.status.ssg) x.ssg += r.t; x.risk += r.risk.score * r.t;
  }
  const tableRows = [...bySup.values()].sort((a, b) => b.t - a.t).map(x => {
    const sc = A(d.suppliers).some(s => s.id === x.id) ? supplierEsgScore(d, x.id, { today }) : null;
    const avg = x.t ? x.risk / x.t : null;
    return { fornitore: x.name, t: round(x.t, 1), dds: x.t ? x.ref / x.t : null, dcf: x.t ? x.dcf / x.t : null, ssg: x.t ? x.ssg / x.t : null, rischio: avg == null ? '—' : `${Math.round(avg)} · ${bandOf(avg)}`, esg: sc?.esg != null && sc.valid ? `${sc.esg}/100` : 'non valutato' };
  });
  const narrative = [];
  narrative.push(`Ruolo EUDR: ${role.label}${role.confirmed ? '' : ' (proposto dalle risposte, da confermare)'}${role.alsoOperator ? '; per i lotti importati direttamente l’azienda è operatore' : ''}.${dl ? ` Il regolamento si applica dal ${dateIt(dl.date)} (${dl.days >= 0 ? `tra ${dl.days} giorni` : 'già in vigore'}).` : ''}`);
  if (tAll > 0) narrative.push(`Nel periodo sono arrivati ${rows.length} lotti in ambito (${nf(tAll, 0)} t): il ${pctTxt(tRef / tAll)} delle tonnellate ha il riferimento DDS${prev ? `; la soia con DDS è ${deltaPhrase((cur?.dds ?? 0) * 100, prev.dds * 100, { good: 'up', unit: '%' })}` : ''}.`);
  if (cur && cur.tSoy > 0) narrative.push(`Soia ricevuta: ${nf(cur.tSoy, 0)} t, di cui DCF fisica ${pctTxt(cur.dcf, 1)}, DCF in bilancio di massa ${pctTxt(cur.dcfMB, 1)}, conforme FEFAC SSG ${pctTxt(cur.ssg)}; origini: ${listJoin(cur.origins.slice(0, 4).map(o => `${o.name} ${pctTxt(o.share)}`))}. I tre indicatori restano separati.`);
  if (sh?.credits?.t > 0) narrative.push(`Crediti «book and claim» attribuiti al periodo: ${nf(sh.credits.t, 0)} t (${listJoin(sh.credits.schemes)}), riportati a parte: non cambiano l’origine fisica della soia.`);
  const dcf = dcfBalance(d);
  if (dcf.n) narrative.push(dcf.negative ? `Registro della soia DCF negativo (${nf(dcf.balance, 1)} t): dichiarazioni DCF bloccate.` : `Registro della soia DCF in equilibrio: saldo ${nf(dcf.balance, 1)} t.`);
  const sAss = assessedSpendShare(d, P);
  if (sAss != null) narrative.push(`Fornitori con valutazione ESG valida: ${pctTxt(sAss)} della spesa per materie prime del periodo.`);
  narrative.push(T('disclaimer'));
  return {
    id: 'esg-filiera', title: 'EUDR e fornitori', order: 83, kpis,
    table: { cols: [{ key: 'fornitore', label: 'Fornitore', fmt: 'text' }, { key: 't', label: 'In ambito', align: 'r', fmt: 't' }, { key: 'dds', label: 'Con DDS', align: 'r', fmt: 'pct' },
      { key: 'dcf', label: 'DCF fisica', align: 'r', fmt: 'pct' }, { key: 'ssg', label: 'FEFAC SSG', align: 'r', fmt: 'pct' }, { key: 'rischio', label: 'Rischio interno', fmt: 'text' }, { key: 'esg', label: 'Valutazione ESG', fmt: 'text' }],
      rows: tableRows },
    narrative,
  };
}

/* ---------------- KPI (catalogo, area esg, src = raccolta della copertura) ---------------- */
const purchaseShare = (d, P, key) => { const s = soyShares(d, P); return s?.purchase && s.purchase.tSoy > 0 ? s.purchase[key] : null; };
export const FILIERA_KPIS = [
  { id: 'esg-soia-dds', label: 'Soia con riferimento DDS', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'filiera', id: 'lotti' }, decimals: 0, hist: false, src: 'ingLots',
    def: 'Tonnellate di soia in ambito EUDR (farina di estrazione e semi; olio di soia a parte) ricevute nel periodo con il riferimento della dichiarazione di dovuta diligenza, proprio o a monte ÷ tonnellate di soia ricevute.',
    compute: (d, ctx, P) => purchaseShare(d, P, 'dds') },
  { id: 'esg-soia-dcf', label: 'Soia senza deforestazione (DCF fisica)', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'filiera', id: 'soia' }, decimals: 1, hist: true, src: 'ingLots',
    def: 'Tonnellate di soia ricevute senza conversione di ecosistemi, con data limite entro il 31/12/2020 e catena di custodia a identità preservata o segregata ÷ tonnellate di soia ricevute. Bilancio di massa e crediti sono esclusi e mostrati a parte.',
    compute: (d, ctx, P) => purchaseShare(d, P, 'dcf') },
  { id: 'esg-fornitori-esg', label: 'Spesa con fornitori valutati ESG', unit: '%', scale: 100, kind: 'ratio', dir: 'up', area: 'esg', link: { area: 'esg', tab: 'filiera', id: 'fornitori' }, decimals: 0, hist: false, src: 'ingLots',
    def: 'Spesa per materie prime del periodo (lotti ricevuti × prezzo) verso fornitori con una valutazione ESG negli ultimi 36 mesi ÷ spesa totale per materie prime.',
    compute: (d, ctx, P) => assessedSpendShare(d, P) },
  { id: 'esg-soia-rischio', label: 'Soia a rischio medio o alto', unit: '%', scale: 100, kind: 'ratio', dir: 'down', area: 'esg', link: { area: 'esg', tab: 'filiera', id: 'lotti' }, decimals: 0, hist: false, src: 'ingLots',
    def: 'Tonnellate di soia ricevute con punteggio di rischio interno di almeno 50 su 100 (paese, catena di custodia, certificazione, dati mancanti) ÷ tonnellate di soia ricevute. Punteggio interno: non sostituisce la valutazione del rischio dell’art. 10 del Reg. (UE) 2023/1115.',
    compute: (d, ctx, P) => purchaseShare(d, P, 'riskMedHigh') },
];

/* ---------------- regole della qualità dei dati R30-R34 ---------------- */
const lotFail = (r, msg) => ({ id: r.id, coll: 'eudrLots', msg, link: LINK(`lotto.${r.id}`) });
export const FILIERA_RULES = [
  { id: 'R30', area: 'esg', severity: 'attenzione', weight: 4, scope: ['all', 'closing', 'import'], label: 'Lotto in ambito EUDR senza paese di produzione',
    check: d => { const rows = eudrRegister(d).rows.filter(r => r.status.state !== 'respinto'); return { base: rows.length, fails: rows.filter(r => !r.country).map(r => lotFail(r, `${r.code} (${r.ing?.name || r.ingId}, ${dateIt(r.date)}): paese di produzione mancante`)) }; } },
  { id: 'R31', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Riferimento DDS con formato non valido',
    check: d => { const rows = eudrRegister(d).rows.filter(r => r.refs.length); return { base: rows.length, fails: rows.filter(r => r.refs.some(x => !DDS_PATTERN.test(x))).map(r => lotFail(r, `${r.code}: riferimento «${r.refs.find(x => !DDS_PATTERN.test(x))}» fuori formato (atteso AA + paese + 10 caratteri, es. 26IT…)`)) }; } },
  { id: 'R32', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'closing'], label: 'Certificato scaduto alla data di arrivo del lotto',
    check: d => { const rows = eudrRegister(d).rows.filter(r => has(r.e?.certExpiry)); return { base: rows.length, fails: rows.filter(r => r.status.certValid === false).map(r => lotFail(r, `${r.code}: certificato ${r.e.certNo || ''} scaduto il ${dateIt(r.e.certExpiry)}, lotto arrivato il ${dateIt(r.date)}`)) }; } },
  { id: 'R33', area: 'esg', severity: 'attenzione', weight: 3, scope: ['all', 'import'], label: 'Geolocalizzazione (GeoJSON) non valida',
    check: d => { const rows = eudrRegister(d).rows.filter(r => r.plotsCount > 0 || r.plots.length || r.e?.geoValid === false); return { base: rows.length, fails: rows.filter(r => r.e?.geoValid === false || r.plots.some(p => p.valid === false)).map(r => lotFail(r, `${r.code}: appezzamenti con errori di geolocalizzazione`)) }; } },
  { id: 'R34', area: 'esg', severity: 'info', weight: 1, scope: ['all'], label: 'Materia prima simile a soia o palma non classificata',
    check: d => { const all = [...classification(d).values()]; const like = all.filter(k => !k.confirmed && k.suggestion?.commodity); return { base: all.length, fails: like.map(k => ({ id: k.ingId, coll: 'ingredients', msg: `${k.ing?.name || k.ingId}: sembra ${k.suggestion.commodity} (parola «${k.suggestion.keyword}»), classificazione EUDR da confermare`, link: LINK('materie') })) }; } },
];

/* ---------------- datapoint del VS/VSME ---------------- */
const dp = (value, unit, quality, fn, extra = {}) => ({ value, unit, quality, source: `filiera.${fn}`, ...extra });
const pct1 = v => (v == null ? null : round(v * 100, 1));
/** Datapoint: B2 (pratiche di approvvigionamento responsabile, blocco soia e palma per i questionari dei clienti, fornitori), C6/C7 (catena del valore). */
export function filieraDatapoints(d, P) {
  if (!d || !P || !has(P.from)) return {};
  const reg = eudrRegister(d);
  const out = {};
  const prevP = has(P.key) ? previousPeriod(d, P.key) : null;
  const role = reg.role;
  if (reg.rows.length || role.confirmed) out['B2.eudr-role'] = dp(role.label, null, role.confirmed ? 'dichiarato' : 'stimato', 'companyRole', { method: 'Albero decisionale del Reg. (UE) 2023/1115 come modificato dal Reg. (UE) 2025/2650', note: role.confirmed ? `confermato${role.confirmedAt ? ' il ' + dateIt(role.confirmedAt) : ''}` : 'proposto dalle risposte, da confermare' });
  const sh = soyShares(d, P), shp = prevP ? soyShares(d, prevP) : null;
  const pur = sh?.purchase, prv = shp?.purchase && shp.purchase.tSoy > 0 ? shp.purchase : null;
  if (pur && pur.tSoy > 0) {
    const m = 'Lotti di arrivo del periodo uniti al registro EUDR (riferimenti DDS, paese, schema, catena di custodia)';
    out['B2.soy-t'] = dp(pur.tSoy, 't', 'misurato', 'soyShares', { method: 'Σ tonnellate dei lotti di soia (farina e semi) ricevuti nel periodo', prev: prv?.tSoy ?? undefined });
    out['B2.soy-dds'] = dp(pct1(pur.dds), '%', 'calcolato', 'soyShares', { method: m, prev: pct1(prv?.dds) ?? undefined });
    out['B2.soy-dcf'] = dp(pct1(pur.dcf), '%', 'calcolato', 'soyShares', { method: 'Senza conversione, data limite ≤ 31/12/2020, catena IP o segregata', prev: pct1(prv?.dcf) ?? undefined });
    out['B2.soy-dcf-mb'] = dp(pct1(pur.dcfMB), '%', 'calcolato', 'soyShares', { method: 'Come DCF, con catena di custodia a bilancio di massa (riportata a parte)' });
    out['B2.soy-ssg'] = dp(pct1(pur.ssg), '%', 'calcolato', 'soyShares', { method: 'Schema che supera il benchmark FEFAC SSG 2021 o 2023', prev: pct1(prv?.ssg) ?? undefined });
    out['B2.soy-credits'] = dp(pct1(pur.credits), '%', 'dichiarato', 'creditsInPeriod', { method: 'Crediti «book and claim» attribuiti al periodo ÷ soia ricevuta; non cambiano l’origine fisica', note: `${nf(sh.credits.t, 0)} t di crediti` });
    out['B2.soy-high-risk'] = dp(pct1(pur.highRisk), '%', 'calcolato', 'countryRisk', { method: 'Paesi ad alto rischio secondo il Reg. di esecuzione (UE) 2025/1093', prev: pct1(prv?.highRisk) ?? undefined });
    out['B2.soy-origins'] = dp(pur.origins.slice(0, 6).map(o => `${o.name} ${nf(o.share * 100, 0)}%`).join(', '), null, 'calcolato', 'soyShares', { method: 'Paese di produzione dei lotti ricevuti, quota sulle tonnellate' });
    if (sh.soyPerTFeed != null) out['B2.soy-per-t-feed'] = dp(sh.soyPerTFeed, 'kg/t', 'calcolato', 'soyShares', { method: 'Soia nelle composizioni dei lotti prodotti ÷ tonnellate prodotte' });
    if (sh.oilT > 0) out['B2.soy-oil-t'] = dp(sh.oilT, 't', 'misurato', 'soyShares', { method: 'Olio di soia (NC 1507), contato a parte' });
  }
  const palmRows = reg.rows.filter(r => r.commodity === 'palma' && inP(r.date, P));
  if (palmRows.length) {
    const tp = sum(palmRows, r => r.t);
    out['B2.palm-t'] = dp(round(tp, 1), 't', 'misurato', 'eudrRegister', { method: 'Lotti di prodotti della palma da olio ricevuti nel periodo' });
    out['B2.palm-certified'] = dp(pct1(sum(palmRows.filter(r => has(r.e?.scheme) && r.e.scheme !== 'nessuno'), r => r.t) / tp), '%', 'calcolato', 'eudrRegister', { method: 'Lotti con schema (RSPO o altro) ÷ tonnellate di palma' });
  }
  const dcf = dcfBalance(d, { to: P.to });
  if (dcf.n) out['B2.dcf-balance'] = dp(dcf.balance, 't', 'calcolato', 'dcfBalance', { method: 'Σ entrate certificate − Σ uscite dichiarate DCF ± rettifiche, fino alla fine del periodo', note: dcf.negative ? 'saldo negativo: dichiarazioni DCF bloccate' : undefined });
  const sAss = assessedSpendShare(d, P);
  if (sAss != null && A(d.supplierEsg).length) out['B2.supplier-assessed'] = dp(pct1(sAss), '%', 'calcolato', 'assessedSpendShare', { method: 'Spesa verso fornitori con valutazione ESG negli ultimi 36 mesi ÷ spesa per materie prime' });
  const sup = A(d.suppliers).filter(s => s && has(s.id));
  if (sup.length && A(d.supplierEsg).length) {
    const signed = new Set(A(d.supplierEsg).filter(a => a && has(a.cocSignedAt) && a.cocSignedAt <= P.to).map(a => a.id));
    const spend = spendBySupplier(d, P), tot = sum([...spend.values()]);
    if (tot > 0) out['B2.supplier-code'] = dp(pct1(sum([...spend].filter(([id]) => signed.has(id)), ([, v]) => v) / tot), '%', 'calcolato', 'supplierEsg', { method: 'Spesa verso fornitori che hanno firmato il codice di condotta ÷ spesa per materie prime' });
    out['C6.value-chain-code'] = dp(pct1(sup.filter(s => signed.has(s.id)).length / sup.length), '%', 'calcolato', 'supplierEsg', { method: 'Fornitori con codice di condotta firmato (diritti umani, lavoro, ambiente) ÷ fornitori in anagrafica' });
    const inc = A(d.supplierEsg).flatMap(a => A(a?.hrFlags)).filter(f => isObj(f) && f.kind === 'incidente' && (!has(f.date) || inP(f.date, P))).length;
    out['C7.value-chain-incidents'] = dp(inc, 'n', 'dichiarato', 'supplierEsg', { method: 'Incidenti gravi sui diritti umani nella catena di fornitura emersi dalle valutazioni dei fornitori', note: inc ? undefined : 'nessun incidente grave emerso dalle valutazioni dei fornitori' });
  }
  return out;
}

/* ---------------- scadenze per il calendario degli adempimenti ---------------- */
/** Scadenze: applicazione dell'EUDR (per dimensione), revisione della classificazione dei paesi, risposte attese, certificati, revisioni e azioni correttive dei fornitori. */
export function filieraCalendarItems(d, today) {
  if (!FILIERA_TAB) return [];
  if (!d || !isObj(d)) return [];
  const t = has(today) ? String(today).slice(0, 10) : esgToday(d);
  const pack = packIndex(d), out = [], keys = new Set();
  const push = it => { if (!ISO.test(it.date) || keys.has(it.key)) return; keys.add(it.key); out.push({ area: 'esg', pkg: 'filiera', ...it }); };
  for (const x of eudrDeadlines(d, t)) if (x.date >= addDays(t, -365)) push({ key: `filiera:${x.id}`, date: x.date, title: x.label, kind: 'scadenza', law: x.law, source: x.source, validAsOf: pack.validAsOf, owner: 'Acquisti', link: LINK('ruolo') });
  for (const x of packList(d, 'controllo')) if (ISO.test(String(x.date || '')) && x.date >= addDays(t, -365)) push({ key: `filiera:${x.id}`, date: x.date, title: x.label, kind: 'controllo', law: x.law, source: x.source, validAsOf: pack.validAsOf, owner: 'Acquisti', link: LINK('ruolo') });
  for (const r of supplierRequestsView(d, t)) if (r.open && ISO.test(String(r.dueAt || ''))) push({ key: `filiera:richiesta:${r.id}`, date: r.dueAt, title: `Risposta attesa da ${r.supplierName} (${r.kindLabel})`, kind: 'scadenza', owner: 'Acquisti', link: LINK('moduli') });
  const sup = byId(A(d.suppliers).filter(s => s && has(s.id)));
  const seen = new Set();
  for (const r of eudrRegister(d).rows) {
    const e = r.e;
    if (!e || !has(e.certNo) || !ISO.test(String(e.certExpiry || '')) || e.certExpiry < t || !r.supplierId) continue;
    const k = `${r.supplierId}:${slug(e.certNo)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    push({ key: `filiera:certificato:${k}`, date: e.certExpiry, title: `Scadenza del certificato ${e.scheme || ''} ${e.certNo} di ${r.supplierName}`.replace(/\s+/g, ' '), kind: 'rinnovo', owner: 'Acquisti', link: LINK('fornitori') });
  }
  for (const a of A(d.supplierEsg)) {
    if (!a || !sup[a.id]) continue;
    const sc = supplierEsgScore(d, a.id, { today: t });
    if (sc?.nextReview && ISO.test(sc.nextReview)) push({ key: `filiera:revisione:${a.id}`, date: sc.nextReview, title: `Revisione ESG del fornitore ${sup[a.id].name}`, kind: 'controllo', owner: 'Acquisti', link: LINK('fornitori') });
    for (const c of sc?.capa.items || EMPTY) if (c.status !== 'chiusa' && ISO.test(String(c.due || ''))) push({ key: `filiera:capa:${a.id}:${c.i}`, date: c.due, title: `Azione correttiva di ${sup[a.id].name}: ${String(c.text || '').slice(0, 80)}`, kind: 'controllo', owner: 'Qualità', link: LINK('fornitori') });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
}

/* ---------------- «Indagine soia» (stile FEFAC/DVT, specifica dei mangimi) ---------------- */
const productOf = hs => { const h = String(hs || '').replace(/\s/g, ''); return h.startsWith('2304') ? 'Farina di estrazione' : h.startsWith('1201') ? 'Semi' : h.startsWith('1208') ? 'Farina di fave' : h.startsWith('1507') ? 'Olio' : 'Altro'; };
/** Righe dell'indagine annuale sulla soia per prodotto, paese, catena di custodia, schema, SSG e DCF (t e quota), più i crediti. */
export function soySurvey(d, P) {
  const PP = P?.from ? P : currentPeriod(d);
  const reg = eudrRegister(d), m = new Map();
  for (const r of reg.rows) {
    if (r.commodity !== 'soia' || !inP(r.date, PP)) continue;
    const e = r.e || {};
    const key = [productOf(r.hs), r.country || '', e.coc || 'non nota', e.scheme || 'non indicato', e.ssgBenchmark || 'no', r.status.dcf ? 'sì' : r.status.dcfMB ? 'bilancio di massa' : 'no', r.status.hasRef ? 'sì' : 'no'].join('|');
    if (!m.has(key)) { const [prodotto, paese, catena, schema, ssg, dcf, dds] = key.split('|'); m.set(key, { prodotto, nc: r.hs || '', paese, nomePaese: paese ? countryName(paese) : 'non noto', catena, schema, ssg, dcf, dds, t: 0, lotti: 0 }); }
    const x = m.get(key); x.t += r.t; x.lotti++;
  }
  const rows = [...m.values()].sort((a, b) => a.prodotto.localeCompare(b.prodotto) || b.t - a.t);
  const tot = sum(rows, r => r.t);
  const cr = creditsInPeriod(d, PP, 'soia');
  return { period: { from: PP.from, to: PP.to, label: PP.label || '' }, rows: rows.map(r => ({ ...r, t: round(r.t, 2), quota: tot ? r.t / tot : 0 })), total: round(tot, 2), credits: cr };
}

/* ---------------- nota metodologica ---------------- */
export const FILIERA_METHOD = {
  it: [
    'Ambito e ruolo. FeedOS classifica le materie prime per codice NC dell’allegato I del Reg. (UE) 2023/1115 (soia 1201, 1208 10, 1507, 2304; palma 1511, 1513, 2306 60, 3823, 2905 45; legno; cacao) partendo da parole chiave del pacchetto di contenuti, confermate dall’utente. Il ruolo (operatore, primo operatore a valle, commerciante, trasformatore fuori ambito) viene proposto da un albero decisionale sulle risposte dell’azienda secondo il Reg. (UE) 2025/2650; l’utente lo conferma. Il mangime composto (NC 2309) non è nell’allegato I. Date di applicazione: 30/12/2026 per le imprese grandi e medie, 30/06/2027 per micro e piccole.',
    'Lotti e tre indicatori separati. Per ogni lotto di arrivo in ambito il registro unisce riferimento DDS (proprio o a monte), paese e regione di produzione, rischio paese alla data di arrivo (Reg. di esecuzione (UE) 2025/1093, valido al giorno indicato nel pacchetto; paesi non elencati a rischio standard), schema, catena di custodia, data limite, certificato e geolocalizzazione. EUDR = riferimento (se il ruolo lo richiede), paese, rischio non alto o attenuato, geolocalizzazione valida per l’operatore. DCF = senza conversione, data limite entro il 31/12/2020 e catena a identità preservata o segregata; il bilancio di massa è un indicatore a parte; SSG = schema che supera il benchmark FEFAC. Prima del 30/12/2026 i riferimenti DDS sono depositati su base volontaria dai fornitori.',
    'Rischio interno. Punteggio 0–100 = 40·paese (basso 0, standard 0,5, alto 1) + 20·materia in ambito + 15·catena (IP 0, segregata 0,2, bilancio di massa 0,6, nessuna 1) + 15·certificazione (SSG 2023 0, SSG 2021 0,3, altro schema 0,5, nessuno 1) + 10·quota dei dati mancanti; fasce trascurabile < 25, basso < 50, medio < 75, alto. Pesi modificabili. È un punteggio interno: non sostituisce la valutazione del rischio dell’art. 10.',
    'Soia nei mangimi. Le quote si calcolano per consumo (composizione dei lotti prodotti, attribuita ai lotti di arrivo dalla tracciabilità; senza composizioni, formula × produzione con origine non nota) e per acquisti (lotti ricevuti). L’olio di soia si conta a parte. I crediti «book and claim» sono attribuiti pro quota ai giorni dell’anno e riportati separatamente: non riducono l’impronta e non rendono «senza deforestazione» la soia. Il registro DCF somma le entrate certificate, sottrae le uscite vendute come DCF e applica le rettifiche: se il saldo è negativo le dichiarazioni DCF sono bloccate.',
    'Clienti e fornitori. La lettera EUDR elenca solo i riferimenti dei lotti di arrivo tracciati nelle consegne del cliente (consegna → lotto prodotto → lotti di materia prima) e dichiara «in acquisizione» quelli mancanti. La geolocalizzazione si controlla sul file GeoJSON (WGS-84, almeno 6 decimali, anelli chiusi, nessuna auto-intersezione fino a 5.000 vertici, superficie sulla sfera con R = 6.371.008,8 m, punto solo sotto i 4 ha). La valutazione ESG dei fornitori affianca la classifica degli acquisti senza modificarla. I moduli per i fornitori sono file HTML autonomi senza collegamenti esterni; la risposta porta l’impronta SHA-256 del suo contenuto in JSON canonico, verificata all’importazione.',
    'Limiti. FeedOS non deposita dichiarazioni nel sistema d’informazione TRACES, non esegue verifiche satellitari (importa come evidenza il risultato di un fornitore) e non decide il ruolo legale dell’azienda. Le voci «da verificare» del pacchetto di contenuti vanno controllate sulle fonti ufficiali.',
  ].join('\n\n'),
  en: [
    'Scope and role. FeedOS classifies raw materials by the CN codes of Annex I of Regulation (EU) 2023/1115 (soy 1201, 1208 10, 1507, 2304; oil palm 1511, 1513, 2306 60, 3823, 2905 45; wood; cocoa) from content-pack keywords confirmed by the user. The role (operator, first downstream operator, trader, processor out of scope) is proposed by a decision tree on the company’s answers under Regulation (EU) 2025/2650 and confirmed by the user. Compound feed (CN 2309) is not in Annex I. Application dates: 30/12/2026 for large and medium companies, 30/06/2027 for micro and small ones.',
    'Lots and three separate flags. For each in-scope incoming lot the register joins the DDS reference (own or upstream), country and region of production, country risk at the receipt date (Implementing Regulation (EU) 2025/1093, valid as of the date shown in the content pack; unlisted countries are standard risk), scheme, chain of custody, cut-off date, certificate and geolocation. EUDR = reference (when the role requires it), country, risk not high or mitigated, valid geolocation for operators. DCF = conversion-free, cut-off no later than 31/12/2020 and identity-preserved or segregated chain of custody; mass balance is a separate flag; SSG = scheme passing the FEFAC benchmark. Before 30/12/2026 DDS references are filed voluntarily by suppliers.',
    'Internal risk. Score 0–100 = 40·country (low 0, standard 0.5, high 1) + 20·in-scope commodity + 15·chain of custody (IP 0, segregated 0.2, mass balance 0.6, none 1) + 15·certification (SSG 2023 0, SSG 2021 0.3, other scheme 0.5, none 1) + 10·share of missing data; bands negligible < 25, low < 50, medium < 75, high. Weights are editable. It is an internal score and does not replace the Article 10 risk assessment.',
    'Soy in feed. Shares are computed by consumption (composition of the produced lots, attributed to incoming lots through traceability; without compositions, formula × production with unknown origin) and by purchases (received lots). Soy oil is counted separately. Book-and-claim credits are allocated pro rata to the days of the year and reported separately: they do not reduce the footprint nor make the soy deforestation-free. The DCF ledger adds certified inputs, subtracts outputs sold as DCF and applies adjustments: a negative balance blocks DCF claims.',
    'Customers and suppliers. The EUDR letter lists only the references of incoming lots traced into the customer’s deliveries (delivery → produced lot → raw-material lots) and marks missing ones as «being obtained». Geolocation is checked on the GeoJSON file (WGS-84, at least 6 decimals, closed rings, no self-intersection up to 5,000 vertices, spherical area with R = 6,371,008.8 m, points only below 4 ha). The supplier ESG assessment sits next to the purchasing scorecard without changing it. Supplier forms are self-contained HTML files with no external links; the reply carries the SHA-256 fingerprint of its canonical JSON content, verified on import.',
    'Limits. FeedOS does not file statements in the TRACES information system, does not run satellite checks (it imports a provider’s result as evidence) and does not decide the company’s legal role. Content-pack items marked «to be verified» must be checked against official sources.',
  ].join('\n\n'),
};
