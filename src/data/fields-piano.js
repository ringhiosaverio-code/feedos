/* FeedOS 18 · Campi e importazioni · Obiettivi e piano (pacchetto WP7). File senza dipendenze.
 * FIELDS_PIANO = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_PIANO = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_PIANO = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_PIANO = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Le stesse definizioni guidano i moduli della scheda Obiettivi e piano, la validazione dei record e l'importazione da CSV.
 * Campi non modificabili da modulo (si gestiscono nella scheda): measures.params, measures.products, measures.evidenceIds,
 * sllLoans.kpis [{metric, dir?, spt: {anno: valore}}], sllLoans.testDates [AAAA-MM-GG]. */

export const PIANO_METRICS = ['s12-abs', 's12-t', 's3-t', 'flag-abs', 'ren-el', 'soia-dcf', 'if', 'acqua-lt', 'recupero', 'rame-ha'];
export const PIANO_TARGET_TYPES = ['assoluto', 'intensità', 'quota'];
export const PIANO_REFERENCES = ['interno', 'traiettoria SBTi (riferimento)'];
export const PIANO_TARGET_STATUS = ['proposto', 'approvato', 'ritirato'];
export const PIANO_LEVERS = ['efficienza', 'rinnovabili', 'combustibili', 'flotta', 'logistica', 'formulazione', 'acquisti', 'imballaggi', 'emissioni'];
export const PIANO_SCOPES = ['S1', 'S2', 'S1+S2', 'S2-MB', 'S3-c1', 'S3-c4', 'S3-c9', 'S3', 'FLAG', 'COV'];
export const PIANO_INCENTIVES = ['iper-green', 'iper-base', 'TEE', 'conto-termico', 'sabatini'];
export const PIANO_MEASURE_STATUS = ['idea', 'approvata', 'in corso', 'completata', 'scartata'];

export const FIELDS_PIANO = {
  esgTargets: [
    { key: 'title', label: 'Titolo', type: 'text', maxLen: 120 },
    { key: 'metric', label: 'Metrica', type: 'enum', options: PIANO_METRICS, required: true },
    { key: 'baseKey', label: 'Esercizio base (chiave, es. 12m-2025-09)', type: 'text', maxLen: 20 },
    { key: 'baseYear', label: 'Anno base', type: 'number', min: 2000, max: 2100, decimals: 0 },
    { key: 'baseValue', label: 'Valore base', type: 'number', decimals: 3 },
    { key: 'targetYear', label: 'Anno obiettivo', type: 'number', min: 2000, max: 2100, required: true, decimals: 0 },
    { key: 'targetValue', label: 'Valore obiettivo', type: 'number', decimals: 3 },
    { key: 'reductionPct', label: 'Riduzione rispetto alla base (%)', type: 'number', min: -100, max: 100, decimals: 1 },
    { key: 'type', label: 'Tipo', type: 'enum', options: PIANO_TARGET_TYPES },
    { key: 'reference', label: 'Riferimento', type: 'enum', options: PIANO_REFERENCES },
    { key: 'status', label: 'Stato', type: 'enum', options: PIANO_TARGET_STATUS, required: true },
    { key: 'approvedAt', label: 'Approvato il', type: 'date' },
    { key: 'approvedBy', label: 'Approvato da', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  measures: [
    { key: 'title', label: 'Misura', type: 'text', required: true, maxLen: 120 },
    { key: 'lever', label: 'Leva', type: 'enum', options: PIANO_LEVERS },
    { key: 'scopeHit', label: 'Su quali emissioni agisce', type: 'enum', options: PIANO_SCOPES },
    { key: 'status', label: 'Stato', type: 'enum', options: PIANO_MEASURE_STATUS, required: true },
    { key: 'startYear', label: 'Anno di avvio', type: 'number', min: 2000, max: 2100, decimals: 0 },
    { key: 'dueDate', label: 'Da completare entro', type: 'date' },
    { key: 'completedAt', label: 'Completata il', type: 'date' },
    { key: 'capex', label: 'Investimento (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'opexDelta', label: 'Maggior costo annuo (€)', type: 'number', decimals: 0 },
    { key: 'savingsEur', label: 'Risparmio annuo (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'tco2Year', label: 'Riduzione (t CO₂e l’anno)', type: 'number', min: 0, decimals: 1 },
    { key: 'mwhSaved', label: 'Energia risparmiata (MWh l’anno)', type: 'number', min: 0, decimals: 1 },
    { key: 'lifeYears', label: 'Vita utile (anni)', type: 'number', min: 1, max: 40, decimals: 0 },
    { key: 'incentive', label: 'Incentivo', type: 'enum', options: PIANO_INCENTIVES },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota o fonte dei valori (preventivo, diagnosi)', type: 'text', maxLen: 300 },
  ],
  sllLoans: [
    { key: 'bank', label: 'Banca', type: 'text', required: true, maxLen: 80 },
    { key: 'amount', label: 'Importo (€)', type: 'number', min: 0, required: true, decimals: 0 },
    { key: 'marginBps', label: 'Margine di base (punti base)', type: 'number', min: 0, max: 2000, decimals: 1 },
    { key: 'ratchetBps', label: 'Scatto del margine (± punti base)', type: 'number', min: 0, max: 100, required: true, decimals: 1 },
    { key: 'startDate', label: 'Data di stipula', type: 'date' },
    { key: 'endDate', label: 'Scadenza', type: 'date' },
    { key: 'verifier', label: 'Verificatore esterno', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
};

export const COLL_LABEL_PIANO = { esgTargets: 'Obiettivi ESG', measures: 'Misure del piano', sllLoans: 'Finanziamenti legati alla sostenibilità', taxonomyDossiers: 'Fascicoli della Tassonomia' };

export const IMPORT_TYPES_PIANO = {
  misure: {
    coll: 'measures', label: 'Misure del piano di riduzione', key: 'title',
    synonyms: {
      title: ['misura', 'intervento', 'azione', 'descrizione', 'titolo'], lever: ['leva', 'categoria', 'tipo di intervento'], scopeHit: ['scope', 'ambito', 'emissioni'],
      status: ['stato', 'fase'], startYear: ['anno', 'anno di avvio', 'avvio'], dueDate: ['scadenza', 'entro', 'data prevista'], capex: ['investimento', 'capex', 'costo', 'importo'],
      opexDelta: ['maggior costo annuo', 'opex', 'costo annuo'], savingsEur: ['risparmio', 'risparmio annuo', 'risparmio euro'], tco2Year: ['t co2', 'tco2', 'riduzione', 'co2 evitata', 't co2e anno'],
      mwhSaved: ['mwh', 'energia risparmiata'], lifeYears: ['vita utile', 'durata', 'anni di vita'], incentive: ['incentivo', 'agevolazione'], owner: ['responsabile', 'referente'], note: ['note', 'nota', 'fonte'],
    },
    defaults: { status: 'idea' },
  },
  obiettivi: {
    coll: 'esgTargets', label: 'Obiettivi ESG', key: ['metric', 'targetYear'],
    synonyms: {
      title: ['titolo', 'obiettivo', 'descrizione'], metric: ['metrica', 'indicatore', 'kpi'], baseYear: ['anno base', 'anno di riferimento'], baseValue: ['valore base', 'base'],
      targetYear: ['anno obiettivo', 'entro', 'anno target'], targetValue: ['valore obiettivo', 'target', 'obiettivo valore'], reductionPct: ['riduzione', 'riduzione %', 'percentuale'],
      type: ['tipo'], reference: ['riferimento'], status: ['stato'], approvedAt: ['approvato il', 'data di approvazione'], note: ['note', 'nota'],
    },
    defaults: { status: 'proposto', reference: 'interno' },
  },
};

export const IMPORT_DESC_PIANO = {
  misure: 'Misure di riduzione da una diagnosi energetica o da un piano esistente: titolo, leva, stato, anno di avvio, investimento, maggior costo e risparmio annui, t CO₂e l’anno, vita utile e incentivo. Una riga per misura (stesso titolo = stessa misura). I valori lasciati vuoti si stimano dai dati dell’archivio quando la misura viene dalla libreria.',
  obiettivi: 'Obiettivi con metrica (s12-t, s12-abs, ren-el, soia-dcf, if, acqua-lt, recupero…), anno e valore base, anno e valore obiettivo (oppure la riduzione in %), stato e data di approvazione. Una riga per metrica e anno obiettivo.',
};
