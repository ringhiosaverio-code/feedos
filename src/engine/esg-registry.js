/* FeedOS 18 · Registro dei pacchetti ESG (fondazione 18): tabella fissa dei nove pacchetti (07-contract §1), fornitori di
 * datapoint del VSME e di scadenze, note metodologiche. Ogni pacchetto contribuisce senza conoscere gli altri.
 * collectDatapoints(d, P) → {datapoints, errors, duplicates}: un fornitore che si interrompe non dà datapoint e finisce in errors;
 * a parità di id vince il primo fornitore nell'ordine dei pacchetti (gli altri in duplicates). collectCalendar(d, today) →
 * scadenze ordinate per data. Nessuna eccezione, nessun messaggio in console.
 * I file dei pacchetti non importano questo registro (lo importa chi li usa tutti insieme). */
import { climaDatapoints, climaCalendarItems, CLIMA_METHOD } from './esg-clima.js';
import { pcfDatapoints, pcfCalendarItems, PCF_METHOD } from './esg-pcf.js';
import { filieraDatapoints, filieraCalendarItems, FILIERA_METHOD } from './esg-filiera.js';
import { reportDatapoints, reportCalendarItems, REPORT_METHOD } from './esg-report.js';
import { personeDatapoints, personeCalendarItems, PERSONE_METHOD } from './esg-persone.js';
import { governanceDatapoints, governanceCalendarItems, GOVERNANCE_METHOD } from './esg-governance.js';
import { pianoDatapoints, pianoCalendarItems, PIANO_METHOD } from './esg-piano.js';
import { rischiDatapoints, rischiCalendarItems, RISCHI_METHOD } from './esg-rischi.js';
import { ambienteDatapoints, ambienteCalendarItems, AMBIENTE_METHOD } from './esg-ambiente.js';

const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'R' + (a + i));

/**
 * I nove pacchetti nell'ordine WP1…WP9 (id, scheda, titolo, prefisso dei segnali, sezione del report e ordine, regole riservate,
 * offset del seme del demo, prefisso CSS/DOM, KPI riservati, raccolte di proprietà).
 */
export const ESG_PACKAGES = [
  { id: 'clima', wp: 'WP1', tab: 'clima', title: 'Clima e GHG', signal: 'clima:', section: 'esg-clima', order: 81, rules: R(21, 25), seed: 901, css: 'ecl-',
    kpis: ['esg-s12', 'esg-s12-t', 'esg-s3-t', 'esg-flag-share', 'esg-ren-el'],
    colls: ['fuelUse', 'vehicles', 'fgasEquipment', 'fgasEvents', 'elecContracts', 'logisticsProfiles', 'customerLogistics', 'scope3Inputs', 'factorOverrides'] },
  { id: 'pcf', wp: 'WP2', tab: 'passaporto', title: 'Impronta mangimi', signal: 'pcf:', section: 'esg-impronta', order: 82, rules: R(26, 29), seed: 1001, css: 'epc-',
    kpis: ['esg-pcf-media', 'esg-pcf-luc', 'esg-pcf-primari'],
    colls: ['efIngredients', 'supplierPcfs', 'ingCircular', 'packagingSpecs', 'pcfSnapshots', 'lowCarbonDesigns', 'methaneDeliveries'] },
  { id: 'filiera', wp: 'WP3', tab: 'filiera', title: 'EUDR e fornitori', signal: 'eudr:', section: 'esg-filiera', order: 83, rules: R(30, 34), seed: 1101, css: 'efl-',
    kpis: ['esg-soia-dcf', 'esg-soia-dds', 'esg-fornitori-esg', 'esg-soia-rischio'],
    colls: ['eudrItems', 'eudrLots', 'eudrPlots', 'dcfLedger', 'soyCredits', 'supplierEsg', 'supplierRequests'] },
  { id: 'report', wp: 'WP4', tab: 'vsme', title: 'Report e questionari', signal: 'report:', section: 'esg-sintesi', order: 80, rules: R(35, 37), seed: 1201, css: 'erp-',
    kpis: ['esg-vsme-copertura', 'esg-dati-misurati'],
    colls: ['esgAnswers', 'esgClosings', 'esgHistory', 'questionnaires', 'materiality'] },
  { id: 'persone', wp: 'WP5', tab: 'persone', title: 'Persone e sicurezza', signal: 'persone:', section: 'esg-persone', order: 85, rules: R(38, 41), seed: 1301, css: 'epe-',
    kpis: ['esg-if', 'esg-b9', 'esg-formazione-h', 'esg-gap-genere', 'esg-donne-resp'],
    colls: ['hrSnapshots', 'hoursWorked', 'injuries', 'trainings', 'payData', 'pdr125', 'ot23', 'safetyActions'] },
  { id: 'governance', wp: 'WP6', tab: 'governance', title: 'Governance ed evidenze', signal: 'gov:', section: 'esg-governance', order: 86, rules: R(42, 45), seed: 1401, css: 'ego-',
    kpis: ['esg-scadenze-ok', 'esg-evidenze', 'esg-politiche'],
    colls: ['policies', 'boardMembers', 'complianceItems', 'companyCerts', 'permits', 'm231Controls', 'odvReports', 'whistleStats', 'legalCases', 'evidence', 'claims', 'esgRoles'] },
  { id: 'piano', wp: 'WP7', tab: 'piano', title: 'Obiettivi e piano', signal: 'piano:', section: 'esg-piano', order: 87, rules: R(46, 48), seed: 1501, css: 'epi-',
    kpis: ['esg-target-gap', 'esg-abbattimento-piano'],
    colls: ['esgTargets', 'measures', 'sllLoans', 'taxonomyDossiers'] },
  { id: 'rischi', wp: 'WP8', tab: 'rischi', title: 'Rischi climatici', signal: 'rischi:', section: 'esg-rischi', order: 88, rules: R(49, 51), seed: 1601, css: 'eri-',
    kpis: ['esg-rischio-siti', 'esg-copertura-ass', 'esg-esposizione-filiera'],
    colls: ['sites', 'siteHazards', 'sourcingRisks', 'insurancePolicies', 'adaptationActions', 'riskRegister'] },
  { id: 'ambiente', wp: 'WP9', tab: 'ambiente', title: 'Registri ambientali', signal: 'amb:', section: 'esg-ambiente', order: 84, rules: R(52, 56), seed: 1701, css: 'eam-',
    kpis: ['esg-acqua-lt', 'esg-recupero-finale', 'esg-polveri-kg', 'esg-enpi-scost'],
    colls: ['waterDischarges', 'wasteRentri', 'stacks', 'stackSamples', 'energyAudits'] },
];
export const ESG_PACKAGE = Object.fromEntries(ESG_PACKAGES.map(p => [p.id, p]));
/** Id dei KPI riservati ai pacchetti, nell'ordine dei pacchetti. */
export const ESG_KPI_IDS = ESG_PACKAGES.flatMap(p => p.kpis);

/** Fornitori di datapoint del VSME, nell'ordine dei pacchetti: (d, P) → {dpId: Datapoint}. */
export const DATAPOINT_PROVIDERS = [climaDatapoints, pcfDatapoints, filieraDatapoints, reportDatapoints, personeDatapoints, governanceDatapoints, pianoDatapoints, rischiDatapoints, ambienteDatapoints];
/** Fornitori di scadenze, nell'ordine dei pacchetti: (d, today) → CalendarItem[]. */
export const CALENDAR_PROVIDERS = [climaCalendarItems, pcfCalendarItems, filieraCalendarItems, reportCalendarItems, personeCalendarItems, governanceCalendarItems, pianoCalendarItems, rischiCalendarItems, ambienteCalendarItems];
/** Note metodologiche {it, en} per pacchetto. */
export const METHOD_NOTES = { clima: CLIMA_METHOD, pcf: PCF_METHOD, filiera: FILIERA_METHOD, report: REPORT_METHOD, persone: PERSONE_METHOD, governance: GOVERNANCE_METHOD, piano: PIANO_METHOD, rischi: RISCHI_METHOD, ambiente: AMBIENTE_METHOD };

export const QUALITIES = ['misurato', 'calcolato', 'stimato', 'dichiarato', 'default', 'mancante'];
export const CALENDAR_KINDS = ['scadenza', 'rinnovo', 'controllo', 'traguardo'];
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const pkgOf = i => ESG_PACKAGES[i]?.id || 'esg';
const errText = e => String(e?.message || e || 'errore');

/**
 * Datapoint di tutti i pacchetti per il periodo P (periodo ESG o globale).
 * → { datapoints: {dpId: {...Datapoint, pkg}}, errors: [{pkg, fn, error}], duplicates: [{dpId, pkg, kept}] }.
 * Valori che non sono oggetti si scartano (con un errore); qualità sconosciuta → 'mancante'; source mancante → '<pkg>.<funzione>'.
 */
export function collectDatapoints(d, P, providers = DATAPOINT_PROVIDERS) {
  const datapoints = {}, errors = [], duplicates = [];
  providers.forEach((fn, i) => {
    const pkg = pkgOf(i);
    let out;
    try { out = fn(d, P); } catch (e) { errors.push({ pkg, fn: fn?.name || '', error: errText(e) }); return; }
    if (out == null) return;
    if (!isObj(out)) { errors.push({ pkg, fn: fn?.name || '', error: 'risultato non valido (serve un oggetto {dpId: datapoint})' }); return; }
    for (const [id, dp] of Object.entries(out)) {
      if (!isObj(dp)) { errors.push({ pkg, fn: fn?.name || '', error: `datapoint ${id} non valido` }); continue; }
      if (datapoints[id]) { duplicates.push({ dpId: id, pkg, kept: datapoints[id].pkg }); continue; }
      datapoints[id] = { ...dp, quality: QUALITIES.includes(dp.quality) ? dp.quality : 'mancante', source: typeof dp.source === 'string' && dp.source ? dp.source : `${pkg}.${fn?.name || 'datapoint'}`, pkg };
    }
  });
  return { datapoints, errors, duplicates };
}

/**
 * Scadenze di tutti i pacchetti, ordinate per data (poi per chiave). Voci senza data valida o con chiave ripetuta si scartano.
 * opts.withErrors → { items, errors } invece del solo elenco.
 */
export function collectCalendar(d, today, opts = {}, providers = CALENDAR_PROVIDERS) {
  const items = [], errors = [], keys = new Set();
  providers.forEach((fn, i) => {
    const pkg = pkgOf(i);
    let out;
    try { out = fn(d, today); } catch (e) { errors.push({ pkg, fn: fn?.name || '', error: errText(e) }); return; }
    if (!Array.isArray(out)) { if (out != null) errors.push({ pkg, fn: fn?.name || '', error: 'risultato non valido (serve un elenco)' }); return; }
    for (const it of out) {
      if (!isObj(it) || typeof it.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(it.date)) continue;
      const key = typeof it.key === 'string' && it.key ? it.key : `${pkg}:${it.date}:${items.length}`;
      if (keys.has(key)) continue;
      keys.add(key);
      items.push({ area: 'esg', pkg, ...it, key });
    }
  });
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return opts?.withErrors ? { items, errors } : items;
}
