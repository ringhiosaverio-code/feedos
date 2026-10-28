/* FeedOS 18 · Campi e importazioni · Impronta mangimi (pacchetto WP2). File senza dipendenze.
 * FIELDS_PCF = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_PCF = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_PCF = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_PCF = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Unità: fattori e impronte in kg CO₂e per tonnellata (l'esportazione GFLI, per kg, si importa dalla scheda Impronta mangimi ›
 * Fattori, che converte l'unità); occupazione di suolo in m²·anno per tonnellata. */

export const ORIGIN_HINT = 'Codice ISO del paese (BR, US, IT…), UE, EXTRA oppure * per la riga generica';
export const COC_PCF_OPTIONS = ['IP', 'segregato', 'bilancio-di-massa'];
export const ALLOCATION_OPTIONS = ['economica', 'massa', 'energia'];
export const TRANSPORT_INCL_OPTIONS = ['cancello-fornitore', 'mercato-UE', 'mangimificio'];
export const CO_CLASS_OPTIONS = ['residuo', 'farina-oleosa', 'primario', 'ex-food', 'minerale-additivo'];
export const SNAPSHOT_STATUS_OPTIONS = ['attiva', 'superata'];
export const DESIGN_STATUS_OPTIONS = ['proposta', 'inviata a formulazione', 'scartata'];

export const FIELDS_PCF = {
  efIngredients: [
    { key: 'ingId', label: 'Materia prima', type: 'ref', ref: 'ingredients', required: true },
    { key: 'origin', label: 'Origine', type: 'text', maxLen: 12, required: true },
    { key: 'scheme', label: 'Schema di certificazione', type: 'text', maxLen: 40 },
    { key: 'coc', label: 'Catena di custodia', type: 'enum', options: COC_PCF_OPTIONS },
    { key: 'total', label: 'Impronta totale (kg CO₂e/t)', type: 'number', min: 0, max: 100000, required: true },
    { key: 'fossil', label: 'di cui fossile (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'biogenic', label: 'di cui biogenica (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'landMgmt', label: 'di cui gestione del suolo (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'luc', label: 'di cui cambio d’uso del suolo (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'landM2a', label: 'Occupazione di suolo (m²·anno/t)', type: 'number', min: 0, max: 1000000 },
    { key: 'low', label: 'Valore minimo plausibile (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'high', label: 'Valore massimo plausibile (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'allocation', label: 'Allocazione', type: 'enum', options: ALLOCATION_OPTIONS },
    { key: 'includesTransportTo', label: 'Trasporto incluso fino a', type: 'enum', options: TRANSPORT_INCL_OPTIONS },
    { key: 'db', label: 'Banca dati', type: 'text', maxLen: 60 },
    { key: 'dbVersion', label: 'Versione della banca dati', type: 'text', maxLen: 30 },
    { key: 'year', label: 'Anno del dato', type: 'number', min: 1990, max: 2100 },
    { key: 'dqr', label: 'Qualità del dato (1 ottima – 5 scarsa)', type: 'number', min: 1, max: 5 },
    { key: 'source', label: 'Fonte', type: 'text', maxLen: 240 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  supplierPcfs: [
    { key: 'supplierId', label: 'Fornitore', type: 'ref', ref: 'suppliers', required: true },
    { key: 'ingId', label: 'Materia prima', type: 'ref', ref: 'ingredients', required: true },
    { key: 'pfId', label: 'Identificativo dell’impronta (PACT)', type: 'text', maxLen: 60 },
    { key: 'pcfExcl', label: 'Impronta senza assorbimento biogenico (kg CO₂e/t)', type: 'number', min: 0, max: 100000, required: true },
    { key: 'pcfIncl', label: 'Impronta con assorbimento biogenico (kg CO₂e/t)', type: 'number', min: -100000, max: 100000 },
    { key: 'fossil', label: 'di cui fossile (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'luc', label: 'di cui cambio d’uso del suolo (kg CO₂e/t)', type: 'number', min: 0, max: 100000 },
    { key: 'landMgmt', label: 'di cui gestione del suolo (kg CO₂e/t)', type: 'number', min: -100000, max: 100000 },
    { key: 'periodStart', label: 'Valida dal', type: 'date', required: true },
    { key: 'periodEnd', label: 'Valida fino al', type: 'date', required: true },
    { key: 'primaryDataShare', label: 'Quota di dati primari (%)', type: 'number', min: 0, max: 100 },
    { key: 'dqi', label: 'Qualità del dato (1 ottima – 5 scarsa)', type: 'number', min: 1, max: 5 },
    { key: 'specVersion', label: 'Versione delle specifiche', type: 'text', maxLen: 20 },
  ],
  ingCircular: [
    { key: 'coClass', label: 'Classe di circolarità', type: 'enum', options: CO_CLASS_OPTIONS, required: true },
    { key: 'hefLow', label: 'Proteine edibili dall’uomo · scenario basso (0–1)', type: 'number', min: 0, max: 1 },
    { key: 'hefMed', label: 'Proteine edibili dall’uomo · scenario medio (0–1)', type: 'number', min: 0, max: 1 },
    { key: 'hefHigh', label: 'Proteine edibili dall’uomo · scenario alto (0–1)', type: 'number', min: 0, max: 1 },
  ],
  packagingSpecs: [
    { key: 'packaging', label: 'Confezione (come nel prodotto)', type: 'text', maxLen: 60, required: true },
    { key: 'unitsPerT', label: 'Confezioni per tonnellata', type: 'number', min: 0, max: 100000 },
    { key: 'palletsPerT', label: 'Pallet per tonnellata', type: 'number', min: 0, max: 100 },
    { key: 'palletReusable', label: 'Pallet a rendere', type: 'bool' },
    { key: 'conaiClass', label: 'Materiale prevalente (CONAI)', type: 'enum', options: ['carta', 'plastica', 'legno', 'acciaio', 'alluminio', 'vetro'] },
    { key: 'declaration', label: 'Dichiarazione di conformità', type: 'text', maxLen: 160 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  pcfSnapshots: [
    { key: 'productId', label: 'Prodotto', type: 'ref', ref: 'products', required: true },
    { key: 'formulaVersion', label: 'Versione della formula', type: 'number', min: 0 },
    { key: 'total', label: 'Impronta (kg CO₂e/t)', type: 'number', min: 0 },
    { key: 'publishedAt', label: 'Pubblicata il', type: 'date', required: true },
    { key: 'status', label: 'Stato', type: 'enum', options: SNAPSHOT_STATUS_OPTIONS },
  ],
  lowCarbonDesigns: [
    { key: 'productId', label: 'Prodotto', type: 'ref', ref: 'products', required: true },
    { key: 'status', label: 'Stato', type: 'enum', options: DESIGN_STATUS_OPTIONS },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
};

export const COLL_LABEL_PCF = {
  efIngredients: 'Fattori delle materie prime', supplierPcfs: 'Impronte dichiarate dai fornitori', ingCircular: 'Circolarità delle materie prime',
  packagingSpecs: 'Schede degli imballaggi', pcfSnapshots: 'Impronte pubblicate', lowCarbonDesigns: 'Proposte di formule a basso carbonio', methaneDeliveries: 'Consegne di additivi antimetano',
};

export const IMPORT_TYPES_PCF = {
  'fattori-materie': { coll: 'efIngredients', label: 'Fattori delle materie prime (kg CO₂e/t)', key: ['ingId', 'origin', 'scheme'], altKey: ['ingId', 'origin'],
    synonyms: { ingId: ['materia prima', 'codice materia prima', 'ingrediente', 'mp', 'prodotto', 'ingredient', 'feed ingredient'],
      origin: ['origine', 'paese', 'paese di origine', 'country', 'geography', 'iso'], scheme: ['schema', 'certificazione', 'scheme', 'standard'], coc: ['catena di custodia', 'coc', 'chain of custody'],
      total: ['impronta', 'totale', 'kg co2e t', 'fattore', 'climate change', 'gwp', 'ef'], fossil: ['fossile', 'fossil', 'climate change fossil'], biogenic: ['biogenica', 'biogenic'],
      landMgmt: ['gestione del suolo', 'land management'], luc: ['luc', 'cambio uso suolo', 'cambio d uso del suolo', 'land use change', 'luluc'], landM2a: ['suolo', 'occupazione di suolo', 'land use', 'land occupation'],
      low: ['minimo', 'min', 'low'], high: ['massimo', 'max', 'high'], allocation: ['allocazione', 'allocation'], includesTransportTo: ['trasporto incluso', 'trasporto'],
      db: ['banca dati', 'database', 'fonte dati'], dbVersion: ['versione', 'versione banca dati', 'version'], year: ['anno', 'year'], dqr: ['dqr', 'qualita', 'qualita del dato'], source: ['fonte', 'source', 'riferimento'], note: ['nota', 'note'] },
    defaults: { origin: '*', allocation: 'economica', includesTransportTo: 'cancello-fornitore', dqr: 3, status: 'importato' } },
  'imballaggi-confezioni': { coll: 'packagingSpecs', label: 'Schede degli imballaggi (per confezione)', key: ['packaging'],
    synonyms: { packaging: ['confezione', 'imballaggio', 'packaging', 'articolo'], unitsPerT: ['confezioni per t', 'sacchi per t', 'pezzi per tonnellata', 'units per t'], palletsPerT: ['pallet per t', 'pallet per tonnellata'],
      palletReusable: ['pallet a rendere', 'pallet riutilizzabile', 'epal'], conaiClass: ['conai', 'materiale', 'materiale prevalente'], declaration: ['dichiarazione di conformita', 'dichiarazione', 'doc'], note: ['nota', 'note'] },
    defaults: { components: [] } },
};

export const IMPORT_DESC_PCF = {
  'fattori-materie': 'Fattori di emissione delle materie prime in kg CO₂e per tonnellata, per origine (codice del paese, UE, EXTRA o * per la riga generica), schema e catena di custodia, con le componenti (fossile, gestione del suolo, cambio d’uso del suolo), l’occupazione di suolo, la banca dati, la versione e l’anno. Per l’esportazione della banca dati GFLI (valori per kg) usare l’importazione della scheda ESG › Impronta mangimi › Fattori, che converte l’unità.',
  'imballaggi-confezioni': 'Una riga per tipo di confezione (lo stesso testo del campo «Confezione» dei prodotti, per esempio «Sacchi 25 kg»): confezioni e pallet per tonnellata, pallet a rendere, materiale prevalente e dichiarazione di conformità. I materiali di ogni confezione si completano nella scheda ESG › Impronta mangimi › Imballaggi.',
};
