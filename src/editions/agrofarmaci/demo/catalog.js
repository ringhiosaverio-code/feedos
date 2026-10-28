/* DifesaOS · Catalogo dell'azienda di agrofarmaci dimostrativa «Arvale Dimostrativa S.p.A.» (TUTTO INVENTATO).
 * Nomi commerciali, clienti, fornitori e numeri di registrazione sono di fantasia; le sostanze attive hanno il solo nome comune
 * ISO. Stati regolatori, date, dosi e prezzi sono dati dimostrativi: non usarli come riferimento.
 * Unità dei motori: tonnellate di massa (i prodotti liquidi si convertono con la densità), prezzi in €/t. */

// [id, codice, nome, categoria, prezzo €/t, kg CO₂e/t (indicativo), fornitore, giorni di sicurezza, giorni di consegna, origine, sostanza attiva (id), titolo %]
const RM = [
  ['cuoh', 'MP01', 'Rame idrossido tecnico (Cu 57%)', 'sostanza attiva', 9400, 4800, 'Cuprum Italia S.r.l. (fantasia)', 20, 21, 'UE', 'rame', 57],
  ['cuocl', 'MP02', 'Ossicloruro di rame tecnico (Cu 57%)', 'sostanza attiva', 8700, 4600, 'Cuprum Italia S.r.l. (fantasia)', 20, 21, 'UE', 'rame', 57],
  ['zolfo', 'MP03', 'Zolfo tecnico ventilato 99,5%', 'sostanza attiva', 430, 160, 'Zolfi Mediterranei S.p.A. (fantasia)', 15, 10, 'Italia', 'zolfo', 99.5],
  ['tetra', 'MP04', 'Tetraconazolo tecnico 95%', 'sostanza attiva', 120000, 15000, 'Sintesi Fine S.r.l. (fantasia)', 30, 45, 'UE', 'tetraconazolo', 95],
  ['fosetil', 'MP05', 'Fosetil-alluminio tecnico 97%', 'sostanza attiva', 7600, 6000, 'Chimica Orientale Ltd. (fantasia)', 30, 60, 'Extra-UE', 'fosetil', 97],
  ['acetam', 'MP06', 'Acetamiprid tecnico 99%', 'sostanza attiva', 55000, 18000, 'Chimica Orientale Ltd. (fantasia)', 30, 60, 'Extra-UE', 'acetamiprid', 99],
  ['delta', 'MP07', 'Deltametrina tecnica 98%', 'sostanza attiva', 180000, 25000, 'Sintesi Fine S.r.l. (fantasia)', 30, 45, 'UE', 'deltametrina', 98],
  ['pendi', 'MP08', 'Pendimetalin tecnico 95%', 'sostanza attiva', 6600, 9000, 'Chimica Orientale Ltd. (fantasia)', 30, 60, 'Extra-UE', 'pendimetalin', 95],
  ['flufen', 'MP09', 'Flufenacet tecnico 95%', 'sostanza attiva', 22500, 14000, 'Sintesi Fine S.r.l. (fantasia)', 30, 45, 'UE', 'flufenacet', 95],
  ['bacillus', 'MP10', 'Bacillus amyloliquefaciens, concentrato di spore', 'sostanza attiva', 60000, 3000, 'BioAgro Fermentazioni S.r.l. (fantasia)', 20, 30, 'UE', 'bacillus', 100],
  ['arancio', 'MP11', 'Olio essenziale di arancio dolce', 'sostanza attiva', 12500, 2000, 'Essenze del Sud S.r.l. (fantasia)', 20, 20, 'Italia', 'arancio', 100],
  ['alghe', 'MP12', 'Estratto di alghe brune (Ascophyllum)', 'biostimolante', 3500, 800, 'BioAgro Fermentazioni S.r.l. (fantasia)', 20, 30, 'UE', null, null],
  ['aminoac', 'MP13', 'Idrolizzato proteico vegetale (aminoacidi)', 'biostimolante', 2800, 1200, 'BioAgro Fermentazioni S.r.l. (fantasia)', 20, 30, 'UE', null, null],
  ['caolino', 'MP14', 'Caolino micronizzato', 'coformulante', 190, 80, 'Minerali Industriali S.r.l. (fantasia)', 15, 10, 'Italia', null, null],
  ['lignosolf', 'MP15', 'Lignosolfonato di sodio (disperdente)', 'coformulante', 950, 900, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['tensio', 'MP16', 'Tensioattivo non ionico', 'coformulante', 2600, 2500, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['glicole', 'MP17', 'Glicole propilenico (antigelo)', 'coformulante', 1650, 1800, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['xantano', 'MP18', 'Gomma xantana (addensante)', 'coformulante', 6200, 3000, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['antisch', 'MP19', 'Antischiuma siliconico', 'coformulante', 4600, 3500, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['biocida', 'MP20', 'Conservante (benzisotiazolinone)', 'coformulante', 5200, 3000, 'Additivi Tecnici S.r.l. (fantasia)', 20, 15, 'UE', null, null],
  ['solvente', 'MP21', 'Solvente aromatico a basso naftalene', 'solvente', 1450, 3200, 'Solventi Padani S.p.A. (fantasia)', 15, 10, 'Italia', null, null],
  ['acqua', 'MP22', 'Acqua demineralizzata', 'acqua', 3, 1, 'Produzione interna', 999, 1, 'Italia', null, null],
];
export const INGREDIENTS_AGRO = RM.map(([id, code, name, category, price, ef, supplier, safetyDays, leadDays, origin, asId, assay]) => ({
  id, code, name, label: name.split(' (')[0].split(',')[0], category, dm: 100, nutr: {}, contam: {}, price, ef, supplier,
  stock: 0, safetyDays, leadDays, origin, asId, assay, coProduct: false, certified: false, active: true, min: null, max: null,
  efSource: 'indicativo (dati dimostrativi)',
}));

/* Sostanze attive (nome comune ISO). Stati e date INVENTATI per il demo, relativi alla data di oggi (giorni): non sono lo stato reale. */
// [id, nome, gruppo, giorni alla scadenza dell'approvazione, stato, candidata alla sostituzione, basso rischio, nota]
export const ACTIVES_AGRO = [
  ['rame', 'Composti del rame', 'fungicida', 430, 'in rinnovo', true, false, 'Limite d’uso di 28 kg di rame per ettaro in 7 anni (dato dimostrativo, da verificare)'],
  ['zolfo', 'Zolfo', 'fungicida', 2400, 'approvata', false, false, ''],
  ['tetraconazolo', 'Tetraconazolo', 'fungicida', 150, 'in rinnovo', false, false, 'Domanda di rinnovo presentata: approvazione prorogata in attesa della decisione (dato dimostrativo)'],
  ['fosetil', 'Fosetil', 'fungicida', 1800, 'approvata', false, false, ''],
  ['acetamiprid', 'Acetamiprid', 'insetticida', 1100, 'approvata', false, false, 'Limiti massimi di residuo rivisti: etichette da aggiornare (dato dimostrativo)'],
  ['deltametrina', 'Deltametrina', 'insetticida', 900, 'approvata', true, false, ''],
  ['pendimetalin', 'Pendimetalin', 'erbicida', 1300, 'approvata', true, false, ''],
  ['flufenacet', 'Flufenacet', 'erbicida', -40, 'non rinnovata', false, false, 'Approvazione non rinnovata: revoca dei prodotti con periodi di tolleranza per vendita e uso (dato dimostrativo)'],
  ['bacillus', 'Bacillus amyloliquefaciens', 'biologico', 3000, 'approvata', false, true, 'Sostanza a basso rischio (dato dimostrativo)'],
  ['arancio', 'Olio di arancio', 'biologico', 2100, 'approvata', false, false, ''],
];

export const LINES_AGRO = [
  { id: 'L1', code: 'WG', name: 'Linea granuli WG (letto fluido)', kind: 'granulazione', capacityTph: 2.2, hoursWeek: 80, kwhPerT: 120, gplKgPerT: 18, color: 1 },
  { id: 'L2', code: 'LQ', name: 'Linea liquidi SC, SL, EC', kind: 'liquidi', capacityTph: 2.0, hoursWeek: 80, kwhPerT: 38, gplKgPerT: 0, color: 2 },
  { id: 'L3', code: 'PO', name: 'Linea polveri e rameici', kind: 'polveri', capacityTph: 3.0, hoursWeek: 40, kwhPerT: 45, gplKgPerT: 0, color: 3 },
];

/* Prodotti (nomi commerciali INVENTATI). Ricetta: kg di materia prima per tonnellata di prodotto (somma 1000).
 * attivi: [sostanza, g/kg o g/L nel prodotto]; prezzo di listino in € per kg o per L (convertito in €/t con la densità). */
// [codice, nome, categoria, formulazione, unità, densità, confezione, linea, quota in t, costo trasformazione €/t, costo imballo €/t, logistica €/t, margine min %, obiettivo %, prezzo €/unità, colture, attivi, ricetta]
export const PRODUCTS_AGRO = [
  ['CU30WG', 'Cuprarvo 30 WG', 'rameico', 'WG', 'kg', 1, 'Sacco 10 kg', 'L1', 0.13, 450, 380, 140, 22, 32, 9.4, ['vite', 'olivo', 'frutta', 'orticole'], [['rame', 300]], { cuoh: 526, lignosolf: 80, tensio: 30, caolino: 364 }],
  ['CU30WG1', 'Cuprarvo 30 WG 1 kg', 'rameico', 'WG', 'kg', 1, 'Scatola 1 kg', 'L1', 0.03, 450, 1150, 160, 26, 36, 11.2, ['vite', 'olivo', 'frutta', 'orticole'], [['rame', 300]], { cuoh: 526, lignosolf: 80, tensio: 30, caolino: 364 }],
  ['CU20WG', 'Ramelia 20 WG', 'rameico', 'WG', 'kg', 1, 'Sacco 10 kg', 'L1', 0.07, 430, 380, 140, 20, 30, 6.8, ['vite', 'olivo', 'frutta'], [['rame', 200]], { cuocl: 351, lignosolf: 70, tensio: 25, caolino: 554 }],
  ['CU35WP', 'Ramelia 35 WP', 'rameico', 'WP', 'kg', 1, 'Sacco 25 kg', 'L3', 0.06, 160, 170, 130, 18, 27, 8.2, ['vite', 'olivo'], [['rame', 350]], { cuocl: 614, lignosolf: 60, tensio: 30, caolino: 296 }],
  ['CU24SC', 'Cuprofluo SC', 'rameico', 'SC', 'L', 1.3, 'Tanica 5 L', 'L2', 0.05, 380, 520, 150, 24, 34, 8.9, ['vite', 'olivo', 'orticole'], [['rame', 240]], { cuoh: 324, glicole: 50, xantano: 3, tensio: 35, antisch: 2, biocida: 1, acqua: 585 }],
  ['ZO80WG', 'Solfarvo 80 WG', 'zolfo', 'WG', 'kg', 1, 'Sacco 25 kg', 'L1', 0.13, 380, 170, 130, 18, 28, 1.9, ['vite', 'frutta', 'orticole'], [['zolfo', 800]], { zolfo: 804, lignosolf: 120, tensio: 30, caolino: 46 }],
  ['ZODP', 'Solfarvo Polvere', 'zolfo', 'DP', 'kg', 1, 'Sacco 25 kg', 'L3', 0.17, 120, 160, 120, 14, 22, 0.99, ['vite'], [['zolfo', 975]], { zolfo: 980, caolino: 20 }],
  ['TE100EC', 'Tetrion 100 EC', 'fungicida', 'EC', 'L', 1.0, 'Flacone 1 L', 'L2', 0.03, 420, 1300, 170, 30, 42, 30, ['vite', 'frutta', 'cereali'], [['tetraconazolo', 100]], { tetra: 105, tensio: 120, solvente: 775 }],
  ['FO80WG', 'Fosetal 80 WG', 'fungicida', 'WG', 'kg', 1, 'Sacco 5 kg', 'L1', 0.05, 450, 520, 150, 26, 36, 11.5, ['vite', 'frutta', 'orticole'], [['fosetil', 800]], { fosetil: 825, lignosolf: 100, tensio: 30, caolino: 45 }],
  ['AC20SL', 'Acetrix 20 SL', 'insetticida', 'SL', 'L', 1.05, 'Flacone 1 L', 'L2', 0.03, 400, 1300, 170, 32, 45, 24, ['frutta', 'orticole', 'vite'], [['acetamiprid', 200]], { acetam: 192, glicole: 100, tensio: 60, acqua: 648 }],
  ['DE25EC', 'Deltarva 25 EC', 'insetticida', 'EC', 'L', 0.92, 'Flacone 1 L', 'L2', 0.03, 400, 1300, 170, 28, 40, 14, ['olivo', 'frutta', 'orticole', 'cereali'], [['deltametrina', 25]], { delta: 28, tensio: 100, solvente: 872 }],
  ['PE33EC', 'Pendimar 330 EC', 'erbicida', 'EC', 'L', 1.03, 'Tanica 5 L', 'L2', 0.07, 380, 520, 150, 20, 30, 7.6, ['cereali', 'orticole'], [['pendimetalin', 330]], { pendi: 337, tensio: 90, solvente: 573 }],
  ['FL50SC', 'Flufendo 500 SC', 'erbicida', 'SC', 'L', 1.18, 'Tanica 5 L', 'L2', 0.04, 400, 520, 150, 26, 36, 22, ['cereali'], [['flufenacet', 500]], { flufen: 446, glicole: 60, xantano: 2, tensio: 45, antisch: 2, biocida: 1, acqua: 444 }],
  ['BA25WG', 'Bacillon WG', 'biologico', 'WG', 'kg', 1, 'Scatola 1 kg', 'L1', 0.02, 520, 1150, 160, 34, 46, 28, ['vite', 'frutta', 'orticole'], [['bacillus', 250]], { bacillus: 250, lignosolf: 100, tensio: 20, caolino: 630 }],
  ['AR60SL', 'Citrinova SL', 'biologico', 'SL', 'L', 0.98, 'Tanica 5 L', 'L2', 0.03, 380, 520, 150, 28, 40, 4.6, ['vite', 'frutta', 'orticole'], [['arancio', 60]], { arancio: 61, tensio: 120, glicole: 60, acqua: 759 }],
  ['BS40', 'Algavita', 'biostimolante', 'SL', 'L', 1.15, 'Tanica 5 L', 'L2', 0.05, 300, 520, 150, 30, 42, 5.4, ['vite', 'olivo', 'frutta', 'orticole'], [], { alghe: 400, aminoac: 50, biocida: 1, acqua: 549 }],
  ['BS60', 'Aminoverde', 'biostimolante', 'SL', 'L', 1.2, 'Tanica 20 L', 'L2', 0.05, 300, 260, 140, 28, 40, 4.6, ['vite', 'olivo', 'frutta', 'orticole'], [], { aminoac: 600, alghe: 50, biocida: 1, acqua: 349 }],
  ['ZO80WG5', 'Solfarvo 80 WG 5 kg', 'zolfo', 'WG', 'kg', 1, 'Sacco 5 kg', 'L1', 0.03, 380, 520, 140, 22, 32, 2.5, ['vite', 'frutta', 'orticole'], [['zolfo', 800]], { zolfo: 804, lignosolf: 120, tensio: 30, caolino: 46 }],
];

/* Classificazione CLP indicativa per famiglia di prodotto (dati dimostrativi, non una classificazione): categorie Seveso e ADR. */
export const HAZARD_AGRO = {
  CU30WG: { h: ['H302', 'H318', 'H410'], pict: ['GHS05', 'GHS07', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3077', cls: '9', pg: 'III', cat: 3 } },
  CU30WG1: { h: ['H302', 'H318', 'H410'], pict: ['GHS05', 'GHS07', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3077', cls: '9', pg: 'III', cat: 3 } },
  CU20WG: { h: ['H302', 'H410'], pict: ['GHS07', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3077', cls: '9', pg: 'III', cat: 3 } },
  CU35WP: { h: ['H302', 'H332', 'H410'], pict: ['GHS07', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3077', cls: '9', pg: 'III', cat: 3 } },
  CU24SC: { h: ['H302', 'H410'], pict: ['GHS07', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3082', cls: '9', pg: 'III', cat: 3 } },
  ZO80WG: { h: ['H315'], pict: ['GHS07'], seveso: [], adr: null },
  ZODP: { h: ['H228', 'H315'], pict: ['GHS02', 'GHS07'], seveso: [], adr: { un: 'UN1350', cls: '4.1', pg: 'III', cat: 3 } },
  TE100EC: { h: ['H226', 'H304', 'H361d', 'H411'], pict: ['GHS02', 'GHS08', 'GHS09'], seveso: ['P5c', 'E2'], adr: { un: 'UN1993', cls: '3', pg: 'III', cat: 3 } },
  FO80WG: { h: ['H318'], pict: ['GHS05'], seveso: [], adr: null },
  AC20SL: { h: ['H302', 'H412'], pict: ['GHS07'], seveso: [], adr: null },
  DE25EC: { h: ['H226', 'H301', 'H304', 'H400', 'H410'], pict: ['GHS02', 'GHS06', 'GHS08', 'GHS09'], seveso: ['P5c', 'E1'], adr: { un: 'UN1992', cls: '3', pg: 'III', cat: 3 } },
  PE33EC: { h: ['H226', 'H304', 'H317', 'H410'], pict: ['GHS02', 'GHS07', 'GHS08', 'GHS09'], seveso: ['P5c', 'E1'], adr: { un: 'UN1993', cls: '3', pg: 'III', cat: 3 } },
  FL50SC: { h: ['H302', 'H373', 'H410'], pict: ['GHS07', 'GHS08', 'GHS09'], seveso: ['E1'], adr: { un: 'UN3082', cls: '9', pg: 'III', cat: 3 } },
  BA25WG: { h: [], pict: [], seveso: [], adr: null },
  AR60SL: { h: ['H315', 'H317', 'H411'], pict: ['GHS07', 'GHS09'], seveso: ['E2'], adr: { un: 'UN3082', cls: '9', pg: 'III', cat: 3 } },
  BS40: { h: [], pict: [], seveso: [], adr: null },
  BS60: { h: [], pict: [], seveso: [], adr: null },
  ZO80WG5: { h: ['H315'], pict: ['GHS07'], seveso: [], adr: null },
};
/* Materie prime con categorie Seveso (stoccate in stabilimento). */
export const RM_SEVESO = { cuoh: ['E1'], cuocl: ['E1'], delta: ['H2', 'E1'], pendi: ['E1'], flufen: ['E1'], tetra: ['E2'], acetam: ['E2'], solvente: ['P5c'] };

export const AGENTS_AGRO = [
  { id: 'ag-1', name: 'Luca Benedetti', zone: 'Nord-Est (Veneto, Trentino, Friuli)', commissionPct: 2.2 },
  { id: 'ag-2', name: 'Chiara Montanari', zone: 'Emilia-Romagna e Lombardia', commissionPct: 2.2 },
  { id: 'ag-3', name: 'Paolo Ferretti', zone: 'Piemonte e Liguria', commissionPct: 2.4 },
  { id: 'ag-4', name: 'Elena Russo', zone: 'Centro (Toscana, Marche, Lazio)', commissionPct: 2.4 },
  { id: 'ag-5', name: 'Giuseppe Carbone', zone: 'Sud (Puglia, Campania, Basilicata)', commissionPct: 2.6 },
  { id: 'ag-6', name: 'Francesca Messina', zone: 'Sicilia e Calabria', commissionPct: 2.6 },
];
// [comune, provincia, lat, lon, agente, colture prevalenti]
export const TOWNS_AGRO = [
  ['Verona', 'VR', 45.44, 10.99, 'ag-1', ['vite', 'frutta']], ['Treviso', 'TV', 45.67, 12.24, 'ag-1', ['vite']], ['Padova', 'PD', 45.41, 11.88, 'ag-1', ['orticole', 'cereali']],
  ['Trento', 'TN', 46.07, 11.12, 'ag-1', ['frutta', 'vite']], ['Udine', 'UD', 46.06, 13.24, 'ag-1', ['vite', 'cereali']],
  ['Ferrara', 'FE', 44.84, 11.62, 'ag-2', ['frutta', 'cereali']], ['Ravenna', 'RA', 44.42, 12.2, 'ag-2', ['frutta', 'vite']], ['Forlì', 'FC', 44.22, 12.04, 'ag-2', ['frutta']],
  ['Modena', 'MO', 44.65, 10.93, 'ag-2', ['vite', 'frutta']], ['Mantova', 'MN', 45.16, 10.79, 'ag-2', ['cereali', 'orticole']], ['Cremona', 'CR', 45.13, 10.02, 'ag-2', ['cereali']],
  ['Asti', 'AT', 44.9, 8.21, 'ag-3', ['vite']], ['Cuneo', 'CN', 44.38, 7.54, 'ag-3', ['frutta', 'vite']], ['Alessandria', 'AL', 44.91, 8.61, 'ag-3', ['cereali', 'vite']],
  ['Siena', 'SI', 43.32, 11.33, 'ag-4', ['vite', 'olivo']], ['Grosseto', 'GR', 42.76, 11.11, 'ag-4', ['olivo', 'cereali']], ['Macerata', 'MC', 43.3, 13.45, 'ag-4', ['cereali', 'vite']],
  ['Latina', 'LT', 41.47, 12.9, 'ag-4', ['orticole']], ['Viterbo', 'VT', 42.42, 12.11, 'ag-4', ['olivo', 'orticole']],
  ['Foggia', 'FG', 41.46, 15.55, 'ag-5', ['cereali', 'orticole', 'olivo']], ['Bari', 'BA', 41.12, 16.87, 'ag-5', ['olivo', 'vite']], ['Lecce', 'LE', 40.35, 18.17, 'ag-5', ['olivo']],
  ['Salerno', 'SA', 40.68, 14.77, 'ag-5', ['orticole']], ['Caserta', 'CE', 41.07, 14.33, 'ag-5', ['orticole', 'frutta']], ['Matera', 'MT', 40.67, 16.6, 'ag-5', ['cereali', 'orticole']],
  ['Catania', 'CT', 37.5, 15.09, 'ag-6', ['frutta', 'orticole']], ['Ragusa', 'RG', 36.93, 14.73, 'ag-6', ['orticole']], ['Trapani', 'TP', 38.02, 12.51, 'ag-6', ['vite', 'olivo']],
  ['Cosenza', 'CS', 39.3, 16.25, 'ag-6', ['olivo', 'frutta']], ['Reggio Calabria', 'RC', 38.11, 15.65, 'ag-6', ['frutta', 'olivo']],
];
const RIV_A = ['Agraria', 'Agri', 'Verde', 'Campo', 'Terra', 'Semina', 'Raccolto', 'Difesa', 'Natura', 'Sole'];
const RIV_B = ['Servizi', 'Forniture', 'Center', 'Market', 'Point', 'Store', 'Tecnica', 'Sud', 'Nord', 'Valle'];
/** Nomi inventati dei clienti per tipo: rivendita, consorzio, cooperativa, distributore. */
export function customerNames(R) {
  const riv = [];
  for (const a of RIV_A) for (const b of RIV_B) riv.push(`${a} ${b} S.r.l.`);
  return {
    rivendita: R.shuffle(riv).slice(0, 44),
    consorzio: ['Consorzio Agrario del Nord-Est (demo)', 'Consorzio Agrario Emiliano (demo)', 'Consorzio Agrario Tirrenico (demo)', 'Consorzio Agrario Adriatico (demo)', 'Consorzio Agrario delle Isole (demo)', 'Consorzio Agrario Subalpino (demo)'],
    cooperativa: ['Cantina Sociale Colli Verdi (demo)', 'Cooperativa Frutticola del Delta (demo)', 'Oleificio Cooperativo Ulivi Antichi (demo)', 'Cooperativa Orticola Piana del Sele (demo)', 'Cantina Cooperativa Terre Alte (demo)', 'Cooperativa Cerealicola Pianura (demo)', 'Frantoio Sociale Collina Grande (demo)', 'Cooperativa Agrumi di Sicilia (demo)'],
    distributore: ['Distribuzione Agrotecnica Alpina (demo)', 'Grossisti Riuniti Difesa (demo)'],
  };
}
export const RIVALS_AGRO = ['Difesa Verde S.r.l. (fantasia)', 'Agrochimica Peninsulare S.p.A. (fantasia)', 'Fitoservizi Tirreno S.r.l. (fantasia)'];
