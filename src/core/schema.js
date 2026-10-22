/* FeedOS 17 · struttura dell'archivio, versioni e migrazioni (senza dipendenze: usabile anche nei test). */
export const SCHEMA_VERSION = 17;

const BASE = ['ingredients', 'specs', 'formulas', 'products', 'lines', 'customers', 'agents', 'ingLots', 'lots', 'runs', 'shipments',
  'complaints', 'market', 'purchases', 'plan', 'energy', 'water', 'waste', 'visits', 'offers', 'tasks', 'scenarios', 'events'];
// schema 17: controllo di gestione, finanza e operations
const ADDED_17 = ['costCenters', 'fixedCosts', 'budget', 'closings', 'salesHistory', 'invoices', 'payments', 'suppliers', 'priceLists',
  'stops', 'assets', 'stockCounts', 'adjustments', 'standards'];
// fondazione 18 (ESG): raccolte dei nove pacchetti, in coda (nessun cambio di schema: un archivio vecchio le riceve vuote)
const ADDED_18 = [
  'fuelUse', 'vehicles', 'fgasEquipment', 'fgasEvents', 'elecContracts', 'logisticsProfiles', 'customerLogistics', 'scope3Inputs', 'factorOverrides', // clima
  'efIngredients', 'supplierPcfs', 'ingCircular', 'packagingSpecs', 'pcfSnapshots', 'lowCarbonDesigns', 'methaneDeliveries', // pcf
  'eudrItems', 'eudrLots', 'eudrPlots', 'dcfLedger', 'soyCredits', 'supplierEsg', 'supplierRequests', // filiera
  'waterDischarges', 'wasteRentri', 'stacks', 'stackSamples', 'energyAudits', // ambiente
  'hrSnapshots', 'hoursWorked', 'injuries', 'trainings', 'payData', 'pdr125', 'ot23', 'safetyActions', // persone
  'policies', 'boardMembers', 'complianceItems', 'companyCerts', 'permits', 'm231Controls', 'odvReports', 'whistleStats', 'legalCases', 'evidence', 'claims', 'esgRoles', // governance
  'sites', 'siteHazards', 'sourcingRisks', 'insurancePolicies', 'adaptationActions', 'riskRegister', // rischi
  'esgTargets', 'measures', 'sllLoans', 'taxonomyDossiers', // piano
  'esgAnswers', 'esgClosings', 'esgHistory', 'questionnaires', 'materiality', // report
];
export const COLLECTIONS = [...BASE, ...ADDED_17, ...ADDED_18];

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = o => (o == null || typeof o !== 'object' ? o : JSON.parse(JSON.stringify(o)));
const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

/** Impostazioni di base dello schema 17: si leggono sempre con un ripiego (settings.x?.y ?? DEFAULT_SETTINGS.x.y). */
export const DEFAULT_SETTINGS = deepFreeze({
  finance: { fiscalYearStartMonth: 1, vatPct: 10, rate: 5, energyPrices: [], cash: { date: null, balance: 0 }, creditLines: [], loans: [], defaultSupplierDays: 60, elasticity: 0, materiality: { pct: 2, abs: 5000 }, budget: null },
  logistics: { mode: 'standard', perDrop: 35, perKm: 1.8, roadFactor: 1.3 },
  ops: { utilFactor: 0.9, estUtilFactor: 0.88, carryRatePct: 8, releaseDays: 2, orderCost: 60, serviceLevel: 0.95, lineCostH: {} },
  targets: {}, counters: {}, calendar: { holidays: [], extraHours: {} }, closedThrough: null, visitCost: 40,
});
// gruppi fusi a un livello con i valori di base (le chiavi già presenti vincono)
const MERGED = ['finance', 'logistics', 'ops', 'calendar'];
// preferenze d'interfaccia che fino allo schema 16 stavano nei dati (ora in core/prefs.js)
export const PREF_KEYS = ['theme', 'size', 'role'];

export function emptyData() {
  const d = {
    settings: {
      schema: SCHEMA_VERSION, dataset: 'vuoto', company: { name: 'Il mio mangimificio', short: 'Mangimificio', site: '', approval: '', address: '', lat: null, lon: null },
      // fattori di base (F1, F3): rete Italia 2024 consolidato ISPRA 0,1926 kg CO₂/kWh; GPL IPCC 2006 2,985 kg CO₂/kg
      energy: { kwhPrice: 0.19, gplPrice: 0.98, feGrid: 0.1926, feGpl: 2.985, gridFactor: 'ita24c' }, milkPrice: 0.54, signalState: {}, ...clone(DEFAULT_SETTINGS),
    },
    esgManual: {}, survey: {},
  };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

/** Copia superficiale con tutte le raccolte e le radici presenti (non tocca l'originale). */
export function ensureCollections(d) {
  const out = { ...d, settings: isObj(d?.settings) ? { ...d.settings } : {} };
  for (const c of COLLECTIONS) if (!Array.isArray(out[c])) out[c] = [];
  out.settings.signalState = isObj(out.settings.signalState) ? out.settings.signalState : {};
  if (!isObj(out.esgManual)) out.esgManual = {};
  if (!isObj(out.survey)) out.survey = {};
  return out;
}

/** Passi di migrazione in ordine. up(d) modifica la copia di lavoro e restituisce le preferenze da seminare. */
export const MIGRATIONS = [
  {
    from: 16, to: 17, label: 'Schema 17: controllo di gestione, finanza e operations',
    up(d) {
      for (const c of COLLECTIONS) if (!Array.isArray(d[c])) d[c] = [];
      const s = d.settings;
      for (const k of MERGED) s[k] = { ...clone(DEFAULT_SETTINGS[k]), ...(isObj(s[k]) ? s[k] : {}) };
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (s[k] === undefined) s[k] = clone(v);
      s.company = { lat: null, lon: null, ...(isObj(s.company) ? s.company : {}) };
      const prefsSeed = {};
      for (const k of PREF_KEYS) if (k in s) { if (s[k] != null && s[k] !== '') prefsSeed[k] = s[k]; delete s[k]; }
      s.schema = 17;
      return prefsSeed;
    },
  },
];

/** Versione dello schema di un archivio: senza settings.schema ma con le formule è un archivio 16; null se non riconosciuto. */
export function schemaOf(d) {
  if (!isObj(d)) return null;
  const v = d.settings?.schema;
  if (v == null) return Array.isArray(d.formulas) ? 16 : null;
  return Number.isFinite(+v) ? +v : null;
}

export const SCHEMA_ERRORS = {
  SCHEMA_FUTURO: 'Archivio creato da una versione più recente di FeedOS: aggiorna FeedOS per aprirlo.',
  SCHEMA_NON_SUPPORTATO: 'Versione dell’archivio non supportata da questa versione di FeedOS.',
  FORMATO_SCONOSCIUTO: 'Formato non riconosciuto: serve un archivio o un backup di FeedOS.',
};
export const schemaErrorText = e => SCHEMA_ERRORS[e?.message] || e?.message || 'Archivio non valido';

/**
 * Porta un archivio allo schema corrente senza modificare l'originale.
 * → {data, from, to, applied: [etichette], prefsSeed}. Errori: 'SCHEMA_FUTURO', 'SCHEMA_NON_SUPPORTATO', 'FORMATO_SCONOSCIUTO'.
 */
export function migrateData(d) {
  const from = schemaOf(d);
  if (from == null) throw new Error('FORMATO_SCONOSCIUTO');
  if (from > SCHEMA_VERSION) throw new Error('SCHEMA_FUTURO');
  const data = { ...d, settings: isObj(d.settings) ? { ...d.settings } : {} };
  const applied = [], prefsSeed = {};
  let v = from;
  for (const m of MIGRATIONS) if (m.from === v) { Object.assign(prefsSeed, m.up(data) || {}); applied.push(m.label); v = m.to; }
  if (v !== SCHEMA_VERSION) throw new Error('SCHEMA_NON_SUPPORTATO');
  return { data: ensureCollections(data), from, to: v, applied, prefsSeed };
}

/** Controllo di forma: settings oggetto; ogni raccolta un elenco di oggetti con id testuale, senza duplicati. */
export function validateShape(d) {
  const errors = [];
  if (!isObj(d)) return { ok: false, errors: ['L’archivio non è un oggetto'] };
  if (!isObj(d.settings)) errors.push('settings: deve essere un oggetto');
  for (const c of COLLECTIONS) {
    const a = d[c];
    if (!Array.isArray(a)) { errors.push(`${c}: deve essere un elenco`); continue; }
    const seen = new Set();
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!isObj(x)) errors.push(`${c}[${i}]: non è un oggetto`);
      else if (typeof x.id !== 'string' || !x.id) errors.push(`${c}[${i}]: id mancante o non testuale`);
      else if (seen.has(x.id)) errors.push(`${c}: id duplicato «${x.id}»`);
      else seen.add(x.id);
    }
  }
  const n = errors.length;
  return { ok: !n, errors: n > 100 ? [...errors.slice(0, 100), `… e altre ${n - 100} anomalie`] : errors };
}

/** Vero se la data ('YYYY-MM-DD') o il mese ('YYYY-MM') cade in un mese chiuso (settings.closedThrough). */
export function isClosedMonth(d, dateOrMonth) {
  const ct = d?.settings?.closedThrough;
  if (!ct || dateOrMonth == null || dateOrMonth === '') return false;
  return String(dateOrMonth).slice(0, 7) <= String(ct).slice(0, 7);
}
