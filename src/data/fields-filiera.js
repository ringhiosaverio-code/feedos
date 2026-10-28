/* FeedOS 18 · Campi e importazioni · EUDR e fornitori (pacchetto WP3). File senza dipendenze.
 * FIELDS_FILIERA = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_FILIERA = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_FILIERA = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_FILIERA = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Importazione «dds»: il lotto si indica con il codice del lotto di arrivo o con il documento di trasporto (il riferimento si
 * risolve come negli altri tipi) e la chiave è il lotto, così un secondo invio aggiorna invece di duplicare. */

export const EUDR_COMMODITY_OPTIONS = ['soia', 'palma', 'legno', 'cacao', 'caffe', 'bovini', 'gomma'];
export const COC_OPTIONS = ['IP', 'segregato', 'bilancio-di-massa', 'crediti', 'nessuno'];
export const SCHEME_OPTIONS = ['RTRS', 'ProTerra', 'ISCC', 'Cefetra CRS', 'Amaggi ORIGINS', 'COFCO', 'Caramuru Sustentar', 'LDC', 'US SSAP', 'Europe Soya', 'RSPO', 'altro', 'nessuno'];
export const LOT_STATUS_OPTIONS = ['completo', 'incompleto', 'in verifica', 'respinto'];
export const REQUEST_STATUS_OPTIONS = ['inviato', 'sollecitato', 'ricevuto', 'accettato', 'respinto'];

export const FIELDS_FILIERA = {
  eudrItems: [
    { key: 'commodity', label: 'Materia prima EUDR', type: 'enum', options: EUDR_COMMODITY_OPTIONS },
    { key: 'hs', label: 'Codice NC', type: 'text', maxLen: 12 },
    { key: 'inScope', label: 'In ambito EUDR', type: 'bool' },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  eudrLots: [
    { key: 'ingLotId', label: 'Lotto materia prima', type: 'ref', ref: 'ingLots', required: true },
    { key: 'ddsRef', label: 'Riferimento DDS', type: 'text', maxLen: 40 },
    { key: 'ddsVerification', label: 'Codice di verifica DDS', type: 'text', maxLen: 24 },
    { key: 'country', label: 'Paese di produzione (codice ISO)', type: 'text', maxLen: 2 },
    { key: 'region', label: 'Regione di produzione', type: 'text', maxLen: 80 },
    { key: 'scheme', label: 'Schema di certificazione', type: 'enum', options: SCHEME_OPTIONS },
    { key: 'coc', label: 'Catena di custodia', type: 'enum', options: COC_OPTIONS },
    { key: 'cutoff', label: 'Data limite (cut-off)', type: 'date' },
    { key: 'conversionFree', label: 'Senza conversione di ecosistemi', type: 'bool' },
    { key: 'ssgBenchmark', label: 'Benchmark FEFAC SSG', type: 'enum', options: ['2023', '2021'] },
    { key: 'certNo', label: 'Numero del certificato', type: 'text', maxLen: 60 },
    { key: 'certExpiry', label: 'Scadenza del certificato', type: 'date' },
    { key: 'mitigation', label: 'Misure di attenuazione del rischio', type: 'text', maxLen: 400 },
    { key: 'status', label: 'Stato', type: 'enum', options: LOT_STATUS_OPTIONS },
  ],
  eudrPlots: [
    { key: 'eudrLotId', label: 'Lotto EUDR', type: 'ref', ref: 'eudrLots', required: true },
    { key: 'name', label: 'Appezzamento', type: 'text', maxLen: 80 },
    { key: 'geom', label: 'Geometria', type: 'enum', options: ['Point', 'Polygon', 'MultiPolygon', 'MultiPoint'] },
    { key: 'areaHa', label: 'Superficie (ha)', type: 'number', min: 0 },
    { key: 'lat', label: 'Latitudine', type: 'number', min: -90, max: 90 },
    { key: 'lon', label: 'Longitudine', type: 'number', min: -180, max: 180 },
    { key: 'valid', label: 'Valido', type: 'bool' },
  ],
  dcfLedger: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'kind', label: 'Movimento', type: 'enum', options: ['entrata', 'uscita', 'rettifica'], required: true },
    { key: 'tSoy', label: 'Soia (t)', type: 'number', required: true },
    { key: 'scheme', label: 'Schema', type: 'enum', options: SCHEME_OPTIONS },
    { key: 'ingLotId', label: 'Lotto materia prima', type: 'ref', ref: 'ingLots' },
    { key: 'shipmentId', label: 'Consegna', type: 'ref', ref: 'shipments' },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  soyCredits: [
    { key: 'year', label: 'Anno', type: 'number', min: 2000, max: 2100, required: true },
    { key: 'scheme', label: 'Schema', type: 'enum', options: ['RTRS', 'ProTerra', 'RSPO', 'altro'], required: true },
    { key: 'tCovered', label: 'Quantità coperta (t)', type: 'number', min: 0, required: true },
    { key: 'certId', label: 'Identificativo dei crediti', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  supplierEsg: [
    { key: 'assessedAt', label: 'Data della valutazione', type: 'date' },
    { key: 'scoreE', label: 'Punteggio ambiente (0–100)', type: 'number', min: 0, max: 100 },
    { key: 'scoreS', label: 'Punteggio sociale (0–100)', type: 'number', min: 0, max: 100 },
    { key: 'scoreG', label: 'Punteggio governance (0–100)', type: 'number', min: 0, max: 100 },
    { key: 'countryRisk', label: 'Rischio paese', type: 'enum', options: ['basso', 'standard', 'alto'] },
    { key: 'cocSignedAt', label: 'Codice di condotta firmato il', type: 'date' },
    { key: 'nextReview', label: 'Prossima revisione', type: 'date' },
  ],
  supplierRequests: [
    { key: 'supplierId', label: 'Fornitore', type: 'ref', ref: 'suppliers', required: true },
    { key: 'kind', label: 'Tipo di richiesta', type: 'enum', options: ['eudr', 'esg', 'pcf', 'certificati'], required: true },
    { key: 'sentAt', label: 'Inviata il', type: 'date' },
    { key: 'dueAt', label: 'Risposta entro', type: 'date' },
    { key: 'status', label: 'Stato', type: 'enum', options: REQUEST_STATUS_OPTIONS },
    { key: 'lang', label: 'Lingua', type: 'enum', options: ['it', 'en'] },
  ],
};

export const COLL_LABEL_FILIERA = {
  eudrItems: 'Classificazione EUDR delle materie prime', eudrLots: 'Lotti EUDR', eudrPlots: 'Appezzamenti EUDR', dcfLedger: 'Registro della soia DCF',
  soyCredits: 'Crediti di soia e palma responsabili', supplierEsg: 'Valutazioni ESG dei fornitori', supplierRequests: 'Richieste ai fornitori',
};

export const IMPORT_TYPES_FILIERA = {
  dds: { coll: 'eudrLots', label: 'Riferimenti DDS (EUDR)', key: ['ingLotId'],
    synonyms: { ingLotId: ['lotto', 'lotto mp', 'lotto materia prima', 'codice lotto', 'n lotto', 'numero lotto', 'ddt', 'n ddt', 'documento di trasporto', 'bolla', 'lot', 'batch'],
      ddsRef: ['dds', 'riferimento dds', 'rif dds', 'numero di riferimento', 'n riferimento', 'reference number', 'dds reference', 'riferimento'],
      ddsVerification: ['codice di verifica', 'verifica', 'verification number', 'verification code'],
      country: ['paese', 'paese di produzione', 'paese di origine', 'origine', 'country', 'country of production', 'iso'],
      region: ['regione', 'stato', 'region', 'provincia di produzione'], scheme: ['schema', 'certificazione', 'standard', 'scheme'],
      coc: ['catena di custodia', 'chain of custody', 'coc', 'modello'], cutoff: ['data limite', 'cut off', 'cutoff'], ssgBenchmark: ['fefac', 'ssg', 'fefac ssg'],
      certNo: ['certificato', 'n certificato', 'numero certificato', 'certificate'], certExpiry: ['scadenza certificato', 'scadenza', 'valido fino al', 'expiry'],
      mitigation: ['attenuazione', 'mitigazione', 'misure'], status: ['stato'] },
    defaults: { source: 'importazione' } },
  'crediti-soia': { coll: 'soyCredits', label: 'Crediti di soia e palma (book and claim)', key: ['certId'], altKey: ['year', 'scheme'],
    synonyms: { year: ['anno', 'year', 'anno di riferimento'], scheme: ['schema', 'standard', 'scheme'], tCovered: ['tonnellate', 't coperte', 'quantita', 'volume', 'crediti', 'tonnes'],
      certId: ['identificativo', 'id crediti', 'certificato', 'numero', 'certificate id'], note: ['nota', 'note'] },
    defaults: { source: 'importazione' } },
};

export const IMPORT_DESC_FILIERA = {
  dds: 'Riferimenti delle dichiarazioni di dovuta diligenza (DDS) dei lotti di soia e palma, dal foglio del fornitore: lotto (codice del lotto di arrivo o documento di trasporto), riferimento DDS, codice di verifica, paese e regione di produzione, schema, catena di custodia e certificato. Aggiorna il registro EUDR senza duplicare i lotti.',
  'crediti-soia': 'Crediti «book and claim» acquistati (RTRS, ProTerra, RSPO): anno, schema, tonnellate coperte e identificativo. Si riportano a parte: non rendono «senza deforestazione» la soia impiegata.',
};
