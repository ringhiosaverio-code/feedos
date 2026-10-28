/* FeedOS 18 · Campi e importazioni · Clima e GHG (pacchetto WP1). File senza dipendenze.
 * FIELDS_CLIMA = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_CLIMA = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_CLIMA = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_CLIMA = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Le stesse definizioni guidano i moduli della scheda Clima, la validazione dei record e l'importazione da CSV. */

export const CLIMA_FUELS = ['gas', 'gpl', 'gasolio', 'hvo', 'benzina', 'biomassa', 'biometano'];
export const CLIMA_FUEL_USES = ['vapore', 'riscaldamento', 'flotta', 'carrelli', 'gruppo-elettrogeno', 'altro'];
export const CLIMA_FUEL_UNITS = ['Smc', 'kg', 'l', 't', 'kWh'];
export const CLIMA_FUEL_SOURCES = ['fattura', 'contatore', 'carta carburante', 'stima'];
export const CLIMA_VEHICLE_KINDS = ['autoarticolato', 'motrice', 'furgone', 'auto', 'carrello'];
export const CLIMA_REFRIGERANTS = ['R-32', 'R-125', 'R-134a', 'R-143a', 'R-410A', 'R-404A', 'R-407C', 'R-449A', 'R-1234yf', 'R-744', 'R-290', 'R-717', 'altro'];
export const CLIMA_FGAS_EVENTS = ['controllo', 'ricarica', 'recupero', 'installazione', 'dismissione'];
export const CLIMA_DELIVERY_MODES = ['flotta-propria', 'vettore', 'ritiro-cliente'];
export const CLIMA_LEG_MODES = ['nave', 'treno', 'camion', 'chiatta'];
export const CLIMA_S3_INPUT_CATS = ['1-consumabili', '2', '6', '7'];

export const FIELDS_CLIMA = {
  fuelUse: [
    { key: 'month', label: 'Mese', type: 'month', required: true },
    { key: 'fuel', label: 'Combustibile', type: 'enum', options: CLIMA_FUELS, required: true },
    { key: 'use', label: 'Uso', type: 'enum', options: CLIMA_FUEL_USES, required: true },
    { key: 'qty', label: 'Quantità', type: 'number', min: 0, required: true, decimals: 1 },
    { key: 'unit', label: 'Unità', type: 'enum', options: CLIMA_FUEL_UNITS },
    { key: 'vehicleId', label: 'Mezzo', type: 'ref', ref: 'vehicles' },
    { key: 'source', label: 'Fonte del dato', type: 'enum', options: CLIMA_FUEL_SOURCES },
    { key: 'docRef', label: 'Documento', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  vehicles: [
    { key: 'code', label: 'Targa o codice', type: 'text', required: true, maxLen: 20 },
    { key: 'kind', label: 'Tipo di mezzo', type: 'enum', options: CLIMA_VEHICLE_KINDS, required: true },
    { key: 'fuel', label: 'Alimentazione', type: 'enum', options: [...CLIMA_FUELS, 'elettrico'] },
    { key: 'euro', label: 'Classe ambientale', type: 'text', maxLen: 12 },
    { key: 'owned', label: 'Di proprietà', type: 'bool' },
    { key: 'payloadT', label: 'Portata (t)', type: 'number', min: 0, max: 60, decimals: 1 },
  ],
  fgasEquipment: [
    { key: 'name', label: 'Apparecchiatura', type: 'text', required: true, maxLen: 80 },
    { key: 'location', label: 'Posizione', type: 'text', maxLen: 80 },
    { key: 'gas', label: 'Gas refrigerante', type: 'enum', options: CLIMA_REFRIGERANTS, required: true },
    { key: 'chargeKg', label: 'Carica (kg)', type: 'number', min: 0, max: 5000, required: true, decimals: 2 },
    { key: 'gwpOverride', label: 'GWP indicato in targa (se diverso)', type: 'number', min: 0, max: 30000, decimals: 0 },
    { key: 'hermetic', label: 'Ermeticamente sigillata', type: 'bool' },
    { key: 'leakDetection', label: 'Sistema di rilevamento delle perdite', type: 'bool' },
    { key: 'installedAt', label: 'Data di installazione', type: 'date' },
    { key: 'fgasDbRef', label: 'Riferimento Banca Dati FGAS', type: 'text', maxLen: 40 },
  ],
  fgasEvents: [
    { key: 'equipmentId', label: 'Apparecchiatura', type: 'ref', ref: 'fgasEquipment', required: true },
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'type', label: 'Intervento', type: 'enum', options: CLIMA_FGAS_EVENTS, required: true },
    { key: 'kg', label: 'Gas (kg)', type: 'number', min: 0, max: 5000, decimals: 2 },
    { key: 'technicianCert', label: 'Certificato del tecnico', type: 'text', maxLen: 40 },
    { key: 'sentToFgasDb', label: 'Comunicato alla Banca Dati FGAS', type: 'bool' },
  ],
  elecContracts: [
    { key: 'year', label: 'Anno', type: 'number', min: 2000, max: 2100, required: true, decimals: 0 },
    { key: 'supplier', label: 'Fornitore di energia', type: 'text', required: true, maxLen: 80 },
    { key: 'goMWh', label: 'Garanzie d’origine (MWh)', type: 'number', min: 0, decimals: 1 },
    { key: 'goCountry', label: 'Paese delle garanzie', type: 'text', maxLen: 40 },
    { key: 'ppaMWh', label: 'Contratto PPA rinnovabile (MWh)', type: 'number', min: 0, decimals: 1 },
    { key: 'residualOverride', label: 'Mix residuo del fornitore (kg CO₂/kWh)', type: 'number', min: 0, max: 2, decimals: 4 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  logisticsProfiles: [
    { key: 'ingId', label: 'Materia prima', type: 'ref', ref: 'ingredients' },
    { key: 'supplierId', label: 'Fornitore', type: 'ref', ref: 'suppliers' },
    { key: 'origin', label: 'Provenienza (per tutte le materie prime)', type: 'enum', options: ['Italia', 'UE', 'Extra-UE'] },
    { key: 'includedInEf', label: 'Trasporto già compreso nel fattore', type: 'bool' },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  customerLogistics: [
    { key: 'mode', label: 'Consegna', type: 'enum', options: CLIMA_DELIVERY_MODES, required: true },
  ],
  scope3Inputs: [
    { key: 'year', label: 'Anno', type: 'number', min: 2000, max: 2100, required: true, decimals: 0 },
    { key: 'cat', label: 'Categoria', type: 'enum', options: CLIMA_S3_INPUT_CATS, required: true },
    { key: 'qty', label: 'Quantità', type: 'number', min: 0, required: true, decimals: 0 },
    { key: 'unit', label: 'Unità', type: 'enum', options: ['€', 'km', 'pkm'], required: true },
    { key: 'factorId', label: 'Fattore', type: 'text', maxLen: 40 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  factorOverrides: [
    { key: 'value', label: 'Valore', type: 'number', required: true, decimals: 4 },
    { key: 'unit', label: 'Unità', type: 'text', maxLen: 30 },
    { key: 'source', label: 'Fonte', type: 'text', required: true, maxLen: 200 },
    { key: 'year', label: 'Anno del fattore', type: 'number', min: 1990, max: 2100, decimals: 0 },
    { key: 'reason', label: 'Motivo della sostituzione', type: 'text', required: true, maxLen: 300 },
  ],
};

export const COLL_LABEL_CLIMA = {
  fuelUse: 'Consumi di combustibili',
  vehicles: 'Mezzi',
  fgasEquipment: 'Apparecchiature con gas fluorurati',
  fgasEvents: 'Interventi sugli impianti F-gas',
  elecContracts: 'Contratti di energia elettrica',
  logisticsProfiles: 'Profili logistici in ingresso',
  customerLogistics: 'Modalità di consegna ai clienti',
  scope3Inputs: 'Altri dati dello Scope 3',
  factorOverrides: 'Fattori di emissione sostituiti',
};

export const IMPORT_TYPES_CLIMA = {
  combustibili: {
    coll: 'fuelUse', label: 'Consumi di combustibili', key: ['docRef', 'month', 'fuel', 'use'], altKey: ['month', 'fuel', 'use'],
    synonyms: {
      month: ['mese', 'periodo', 'competenza', 'mese di competenza'], fuel: ['combustibile', 'carburante', 'vettore energetico', 'prodotto'],
      use: ['uso', 'impiego', 'destinazione', 'utilizzo'], qty: ['quantita', 'qta', 'consumo', 'litri', 'quantita consumata'],
      unit: ['unita', 'um', 'unita di misura'], vehicleId: ['mezzo', 'veicolo', 'targa', 'automezzo'], source: ['fonte', 'origine del dato'],
      docRef: ['documento', 'fattura', 'n fattura', 'numero fattura', 'riferimento', 'estratto', 'n documento'], note: ['note', 'nota', 'descrizione'],
    },
    defaults: { source: 'fattura' },
  },
};

export const IMPORT_DESC_CLIMA = {
  combustibili: 'Gasolio, GPL, gas naturale, HVO e altri combustibili per mese, uso (vapore, riscaldamento, flotta, carrelli…) e quantità, da fatture, contatori o carte carburante. Con la colonna «Documento» una riga per documento si aggiorna invece di duplicarsi; senza, si aggiorna una riga per mese, combustibile e uso. Il GPL qui sostituisce quello del registro dell’energia per lo stesso mese.',
};
