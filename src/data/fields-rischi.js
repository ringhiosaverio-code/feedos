/* FeedOS 18 · Campi e importazioni · Rischi climatici (pacchetto WP8). File senza dipendenze.
 * FIELDS_RISCHI = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_RISCHI = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_RISCHI = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_RISCHI = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Il valore dei beni è in quattro campi (terreni, fabbricati, impianti, attrezzature: voce B.II 1-3 dell’art. 2424 c.c.) e i rischi
 * assicurati sono un testo separato da virgole: così il modulo di inserimento li gestisce senza strutture annidate. */

const HAZARDS = ['alluvione', 'frana', 'sisma', 'caldo', 'siccita', 'grandine-vento', 'incendio', 'mare'];
const KINDS = ['catastrofale', 'all-risks', 'RC', 'trasporti'];
const ACTION_STATUS = ['pianificata', 'in corso', 'fatta', 'sospesa'];
const SITE_KINDS = ['stabilimento', 'magazzino', 'deposito', 'ufficio'];

export const FIELDS_RISCHI = {
  sites: [
    { key: 'name', label: 'Nome del sito', type: 'text', required: true, maxLen: 120 },
    { key: 'kind', label: 'Tipo', type: 'enum', options: SITE_KINDS, required: true },
    { key: 'address', label: 'Indirizzo', type: 'text', maxLen: 200 },
    { key: 'comune', label: 'Comune', type: 'text', maxLen: 80 },
    { key: 'provincia', label: 'Provincia (sigla)', type: 'text', maxLen: 4 },
    { key: 'lat', label: 'Latitudine', type: 'number', min: -90, max: 90, decimals: 4 },
    { key: 'lon', label: 'Longitudine', type: 'number', min: -180, max: 180, decimals: 4 },
    { key: 'owned', label: 'Di proprietà', type: 'bool' },
    { key: 'main', label: 'Sito principale', type: 'bool' },
    { key: 'areaM2', label: 'Superficie del sito (m²)', type: 'number', min: 0, decimals: 0 },
    { key: 'sealedM2', label: 'Superficie impermeabilizzata (m²)', type: 'number', min: 0, decimals: 0 },
    { key: 'natureOnSiteM2', label: 'Superficie orientata alla natura nel sito (m²)', type: 'number', min: 0, decimals: 0 },
    { key: 'natureOffSiteM2', label: 'Superficie orientata alla natura fuori dal sito (m²)', type: 'number', min: 0, decimals: 0 },
    { key: 'natura2000Km', label: 'Distanza dall’area Natura 2000 più vicina (km)', type: 'number', min: 0, decimals: 1 },
    { key: 'sensitive', label: 'Dentro un’area sensibile (vincolo)', type: 'bool' },
    { key: 'heatDays', label: 'Giorni di caldo oltre 35 °C all’anno', type: 'number', min: 0, max: 366, decimals: 0 },
    { key: 'valTerreni', label: 'Valore dei terreni (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'valFabbricati', label: 'Valore dei fabbricati (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'valImpianti', label: 'Valore di impianti e macchinari (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'valAttrezzature', label: 'Valore delle attrezzature industriali (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'ape', label: 'Classe energetica o APE', type: 'text', maxLen: 60 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  siteHazards: [
    { key: 'siteId', label: 'Sito', type: 'ref', ref: 'sites', required: true },
    { key: 'hazard', label: 'Pericolo', type: 'enum', options: HAZARDS, required: true },
    { key: 'level', label: 'Livello (0 trascurabile – 4 molto alto)', type: 'number', min: 0, max: 4, decimals: 0, required: true },
    { key: 'source', label: 'Fonte (autovalutazione, IdroGEO, classificazione sismica)', type: 'text', required: true, maxLen: 200 },
    { key: 'checkedAt', label: 'Data della verifica', type: 'date', required: true },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  sourcingRisks: [
    { key: 'commodity', label: 'Materia (mais, soia, sostanze attive…)', type: 'text', required: true, maxLen: 60 },
    { key: 'origin', label: 'Origine (paese o area)', type: 'text', required: true, maxLen: 60 },
    { key: 'hazard', label: 'Pericolo climatico', type: 'enum', options: HAZARDS, required: true },
    { key: 'level', label: 'Livello (0–4)', type: 'number', min: 0, max: 4, decimals: 0, required: true },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  insurancePolicies: [
    { key: 'kind', label: 'Tipo di polizza', type: 'enum', options: KINDS, required: true },
    { key: 'insurer', label: 'Compagnia o intermediario', type: 'text', maxLen: 120 },
    { key: 'number', label: 'Numero di polizza', type: 'text', maxLen: 60 },
    { key: 'perils', label: 'Rischi assicurati (sisma, alluvione, frana… separati da virgole)', type: 'text', maxLen: 200 },
    { key: 'insuredSum', label: 'Somma assicurata (€)', type: 'number', min: 0, decimals: 0, required: true },
    { key: 'deductible', label: 'Franchigia (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'from', label: 'In vigore dal', type: 'date' },
    { key: 'to', label: 'Scadenza', type: 'date', required: true },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  adaptationActions: [
    { key: 'action', label: 'Azione di adattamento', type: 'text', required: true, maxLen: 200 },
    { key: 'siteId', label: 'Sito', type: 'ref', ref: 'sites' },
    { key: 'hazard', label: 'Pericolo affrontato', type: 'enum', options: HAZARDS },
    { key: 'cost', label: 'Costo stimato (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'due', label: 'Scadenza', type: 'date', required: true },
    { key: 'status', label: 'Stato', type: 'enum', options: ACTION_STATUS, required: true },
  ],
  riskRegister: [
    { key: 'type', label: 'Tipo di rischio', type: 'enum', options: ['fisico', 'transizione'], required: true },
    { key: 'driver', label: 'Causa del rischio', type: 'text', required: true, maxLen: 200 },
    { key: 'horizon', label: 'Orizzonte', type: 'enum', options: ['breve', 'medio', 'lungo'], required: true },
    { key: 'likelihood', label: 'Probabilità (1–5)', type: 'number', min: 1, max: 5, decimals: 0, required: true },
    { key: 'impact', label: 'Impatto (1–5)', type: 'number', min: 1, max: 5, decimals: 0, required: true },
    { key: 'financialLow', label: 'Effetto finanziario, stima bassa (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'financialHigh', label: 'Effetto finanziario, stima alta (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'response', label: 'Risposta prevista', type: 'text', maxLen: 300 },
  ],
};

export const COLL_LABEL_RISCHI = {
  sites: 'Siti',
  siteHazards: 'Pericoli dei siti',
  sourcingRisks: 'Rischi di fornitura',
  insurancePolicies: 'Polizze assicurative',
  adaptationActions: 'Azioni di adattamento',
  riskRegister: 'Registro dei rischi',
};

export const IMPORT_TYPES_RISCHI = {
  'rischi-siti': { coll: 'sites', label: 'Siti (stabilimenti e magazzini)', key: ['name'],
    synonyms: { name: ['nome', 'sito', 'denominazione'], kind: ['tipo'], comune: ['comune', 'città'], provincia: ['provincia', 'prov'], lat: ['latitudine', 'lat'], lon: ['longitudine', 'lon', 'long'],
      areaM2: ['superficie', 'superficie m2'], sealedM2: ['impermeabilizzata', 'superficie impermeabilizzata'], natura2000Km: ['natura 2000 km', 'distanza natura 2000'], note: ['nota', 'note'] },
    defaults: { owned: true } },
  'rischi-polizze': { coll: 'insurancePolicies', label: 'Polizze assicurative', key: ['insurer', 'number'],
    synonyms: { kind: ['tipo', 'tipo polizza'], insurer: ['compagnia', 'assicuratore'], number: ['numero', 'n. polizza'], perils: ['rischi', 'rischi assicurati', 'coperture'], insuredSum: ['somma assicurata', 'massimale'], deductible: ['franchigia'], from: ['dal', 'decorrenza'], to: ['scadenza', 'al'], note: ['nota'] },
    defaults: {} },
  'rischi-registro': { coll: 'riskRegister', label: 'Registro dei rischi (transizione e fisici)', key: ['driver'],
    synonyms: { type: ['tipo'], driver: ['rischio', 'causa'], horizon: ['orizzonte'], likelihood: ['probabilità', 'probabilita'], impact: ['impatto'], financialLow: ['stima bassa', 'effetto basso'], financialHigh: ['stima alta', 'effetto alto'], response: ['risposta'] },
    defaults: { type: 'transizione', horizon: 'medio' } },
};

export const IMPORT_DESC_RISCHI = {
  'rischi-siti': 'Un sito per riga: nome, tipo, comune, coordinate in gradi decimali (lat, lon) e superfici in m². I valori dei beni (terreni, fabbricati, impianti, attrezzature) si inseriscono nella scheda del sito.',
  'rischi-polizze': 'Una polizza per riga. Per la copertura catastrofale indicare i rischi assicurati (sisma, alluvione, frana) separati da virgole, la somma assicurata e la scadenza.',
  'rischi-registro': 'Un rischio per riga: tipo (fisico o transizione), causa, orizzonte (breve, medio, lungo), probabilità e impatto da 1 a 5.',
};
