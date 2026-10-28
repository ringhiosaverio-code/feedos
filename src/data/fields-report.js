/* FeedOS 18 · Campi e importazioni · Report e questionari (pacchetto WP4 «report»). File senza dipendenze.
 * FIELDS_REPORT: campi dello storico ESG dichiarato (esgHistory), usati dal modulo della sezione Storico e dall'importazione CSV
 * in Dati › Importa (tipo «storico-esg»). L'id è l'esercizio: anno (2024) o chiave del periodo (anno-2024, 12m-2025-09).
 * Le altre raccolte del pacchetto (risposte, chiusure, questionari, materialità) si scrivono dalla scheda Report e questionari. */
const N = (key, label, decimals = 0) => ({ key, label, type: 'number', min: 0, decimals });

export const FIELDS_REPORT = {
  esgHistory: [
    { key: 'id', label: 'Esercizio (anno o chiave del periodo)', type: 'text', required: true, maxLen: 20 },
    { key: 'label', label: 'Descrizione dell’esercizio', type: 'text', maxLen: 80 },
    N('tonnes', 'Produzione (t)'), N('revenueNet', 'Ricavi netti (€)'), N('mwh', 'Energia consumata (MWh)', 1), N('mwhRen', 'Elettricità rinnovabile (MWh)', 1),
    N('s1', 'Scope 1 (t CO₂e)', 1), N('s2lb', 'Scope 2 location-based (t CO₂e)', 1), N('s2mb', 'Scope 2 market-based (t CO₂e)', 1), N('s3', 'Scope 3 (t CO₂e)', 0),
    N('waterM3', 'Prelievo idrico (m³)'), N('wasteT', 'Rifiuti prodotti (t)', 2), N('wasteHazT', 'Rifiuti pericolosi (t)', 3), N('recoveryPct', 'Rifiuti a riciclo o riutilizzo (%)', 1),
    N('headcount', 'Dipendenti'), N('hours', 'Ore lavorate'), N('recordable', 'Infortuni registrabili'), N('fatalities', 'Decessi sul lavoro'),
    { key: 'note', label: 'Nota sulla fonte', type: 'text', maxLen: 300 },
  ],
};
export const COLL_LABEL_REPORT = {
  esgAnswers: 'Risposte del report VS', esgClosings: 'Chiusure degli esercizi ESG', esgHistory: 'Storico ESG dichiarato', questionnaires: 'Questionari ESG', materiality: 'Analisi di materialità',
};
export const IMPORT_TYPES_REPORT = {
  'storico-esg': { coll: 'esgHistory', label: 'Storico ESG (esercizi passati)', key: ['id'],
    synonyms: { id: ['esercizio', 'anno', 'periodo', 'year'], label: ['descrizione'], tonnes: ['produzione', 'tonnellate', 'tonnes', 't prodotte'], revenueNet: ['ricavi', 'ricavi netti', 'fatturato', 'turnover'],
      mwh: ['energia', 'mwh', 'energia consumata'], mwhRen: ['rinnovabile', 'mwh rinnovabili', 'elettricita rinnovabile'], s1: ['scope 1', 'scope1'], s2lb: ['scope 2', 'scope 2 location', 'scope2'],
      s2mb: ['scope 2 market', 'market based'], s3: ['scope 3', 'scope3'], waterM3: ['acqua', 'prelievo idrico', 'm3'], wasteT: ['rifiuti', 'rifiuti t'], wasteHazT: ['rifiuti pericolosi'],
      recoveryPct: ['recupero', 'recupero %'], headcount: ['dipendenti', 'organico'], hours: ['ore lavorate', 'ore'], recordable: ['infortuni'], fatalities: ['decessi', 'mortali'], note: ['nota', 'fonte'] },
    defaults: { source: 'storico dichiarato' } },
};
export const IMPORT_DESC_REPORT = {
  'storico-esg': 'Valori annuali degli esercizi passati (produzione, ricavi, energia, Scope 1-3, acqua, rifiuti, dipendenti, infortuni) per il confronto di tre anni del report VS e del pacchetto per la banca. Una riga per esercizio: anno (2024) o chiave del periodo.',
};
