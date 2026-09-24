/* Anagrafiche inventate per il mangimificio dimostrativo. Nomi di fantasia; comuni reali solo come riferimento territoriale. */
export const AGENTS = [
  { id: 'ag-1', name: 'Marco Rinaldi', zone: 'Cosenza nord e Sibaritide', commissionPct: 2.5 },
  { id: 'ag-2', name: 'Giulia Ferraro', zone: 'Cosenza centro e Tirreno', commissionPct: 2.5 },
  { id: 'ag-3', name: 'Antonio Mancuso', zone: 'Catanzaro, Crotone e Vibo', commissionPct: 2.8 },
  { id: 'ag-4', name: 'Sara Lombardi', zone: 'Reggio Calabria e Basilicata', commissionPct: 2.8 },
];

// [comune, provincia, lat, lon, agente]
export const TOWNS = [
  ['Bisignano', 'CS', 39.51, 16.29, 'ag-1'], ['Cassano allo Ionio', 'CS', 39.78, 16.32, 'ag-1'], ['Corigliano-Rossano', 'CS', 39.60, 16.52, 'ag-1'],
  ['Castrovillari', 'CS', 39.82, 16.20, 'ag-1'], ['Spezzano Albanese', 'CS', 39.67, 16.31, 'ag-1'], ['Acri', 'CS', 39.49, 16.38, 'ag-1'],
  ['Luzzi', 'CS', 39.45, 16.29, 'ag-2'], ['Montalto Uffugo', 'CS', 39.40, 16.16, 'ag-2'], ['San Marco Argentano', 'CS', 39.56, 16.12, 'ag-2'],
  ['Paola', 'CS', 39.36, 16.04, 'ag-2'], ['Rende', 'CS', 39.33, 16.18, 'ag-2'], ['Rogliano', 'CS', 39.18, 16.32, 'ag-2'],
  ['Lamezia Terme', 'CZ', 38.97, 16.31, 'ag-3'], ['Girifalco', 'CZ', 38.82, 16.43, 'ag-3'], ['Cutro', 'KR', 39.03, 16.99, 'ag-3'],
  ['Isola di Capo Rizzuto', 'KR', 38.96, 17.10, 'ag-3'], ['Mileto', 'VV', 38.61, 16.07, 'ag-3'], ['Serra San Bruno', 'VV', 38.58, 16.33, 'ag-3'],
  ['Gioia Tauro', 'RC', 38.43, 15.90, 'ag-4'], ['Taurianova', 'RC', 38.35, 16.01, 'ag-4'], ['Polistena', 'RC', 38.40, 16.07, 'ag-4'],
  ['Lauria', 'PZ', 40.05, 15.84, 'ag-4'], ['Senise', 'PZ', 40.14, 16.29, 'ag-4'], ['Rotonda', 'PZ', 39.95, 16.04, 'ag-4'],
];

export const FARM_NAMES = [
  'Masseria La Quercia', 'Allevamento Serra Bianca', 'Az. Agr. Colle del Vento', 'Fattoria Sant’Elia', 'Az. Agr. Valle dei Mulini',
  'Allevamento Piano Grande', 'Masseria Il Castagneto', 'Az. Zootecnica Torre Rossa', 'Fattoria Monte Cocuzzo', 'Allevamento La Sorgente',
  'Az. Agr. Le Due Querce', 'Masseria Pietra Grossa', 'Allevamento Fontana Vecchia', 'Az. Agr. Il Mandorleto', 'Fattoria Terre del Crati',
  'Az. Agr. Il Casale', 'Allevamento Santa Barbara', 'Masseria Acquaviva', 'Az. Agr. Timpone', 'Allevamento La Chiusa',
  'Fattoria Pantano', 'Az. Agr. Cerasia', 'Masseria Macchia Piana', 'Allevamento Il Frassineto', 'Az. Agr. Serralta',
  'Fattoria Donnici', 'Allevamento Vallone', 'Masseria San Vito', 'Az. Agr. Pollino Verde', 'Allevamento Le Coste',
];
export const RETAIL_NAMES = [
  'Agraria Del Sud', 'Rivendita Agricola Bruzia', 'Consorzio Allevatori Sila', 'Agrizootecnica Ionica', 'Emporio Rurale Tirreno',
  'Agraria Due Mari', 'Coop. Zootecnica Aspromonte', 'Rivendita Il Granaio', 'Agraria Lucana', 'Mangimi e Sementi Crati',
  'Agrifornitura Vibonese', 'Agrifornitura Monte Sirino',
];
