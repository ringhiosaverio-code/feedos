/* DifesaOS · Estensori del demo dell'azienda di agrofarmaci inventata «Arvale Dimostrativa S.p.A.».
 * Stessi estensori di FeedOS dove il dominio è comune (costi, commerciale, acquisti, produzione, finanza, redditività,
 * direzione, obiettivi, ESG), con la configurazione dell'edizione; gli estensori propri (regolatorio, campagne, programmi
 * di difesa, prove di campo e prezzi della concorrenza) aggiungono le raccolte dell'edizione. Contratto e regola «solo aggiunte» come in data/demo/extend.js. */
import { costsDemo } from '../../../data/demo/costs.js';
import { commercialeDemo } from '../../../data/demo/commerciale.js';
import { acquistiDemo } from '../../../data/demo/acquisti.js';
import { produzioneDemo } from '../../../data/demo/produzione.js';
import { finanzaDemo } from '../../../data/demo/finanza.js';
import { redditivitaDemo } from '../../../data/demo/redditivita.js';
import { direzioneDemo } from '../../../data/demo/direzione.js';
import { piattaformaDemo } from '../../../data/demo/piattaforma.js';
import { demoClima } from '../../../data/demo/esg-clima.js';
import { demoAmbiente } from '../../../data/demo/esg-ambiente.js';
import { demoPersone } from '../../../data/demo/esg-persone.js';
import { demoGovernance } from '../../../data/demo/esg-governance.js';
import { demoRischi } from '../../../data/demo/esg-rischi.js';
import { demoPiano } from '../../../data/demo/esg-piano.js';
import { reportDemo } from '../../../data/demo/esg-report.js';
import { RIVALS_AGRO } from './catalog.js';
import { demoRegolatorio } from './regolatorio.js';
import { demoCampagne } from './campagne.js';
import { demoProgrammi } from './programmi.js';
import { demoProve } from './prove.js';

/* ---------- costi: centri e costi annui (totale circa 14,6 M€) ---------- */
const COST_CENTERS = [
  { id: 'cc-pers', code: 'CDC-01', name: 'Personale di stabilimento', group: 'stabilimento', cash: true, driver: 'ore' },
  { id: 'cc-man', code: 'CDC-02', name: 'Manutenzione', group: 'stabilimento', cash: true, driver: 'ore' },
  { id: 'cc-qual', code: 'CDC-03', name: 'Controllo qualità e laboratorio', group: 'stabilimento', cash: true, driver: 'lotti' },
  { id: 'cc-log', code: 'CDC-04', name: 'Magazzino ADR e logistica interna', group: 'stabilimento', cash: true, driver: 'tonnellate' },
  { id: 'cc-hse', code: 'CDC-05', name: 'Sicurezza, ambiente e Seveso', group: 'stabilimento', cash: true, driver: null },
  { id: 'cc-amm', code: 'CDC-06', name: 'Ammortamenti', group: 'stabilimento', cash: false, driver: 'ore' },
  { id: 'cc-reg', code: 'CDC-07', name: 'Regolatorio e registrazioni', group: 'struttura', cash: true, driver: null },
  { id: 'cc-rd', code: 'CDC-08', name: 'Sviluppo e prove di campo', group: 'struttura', cash: true, driver: null },
  { id: 'cc-dir', code: 'CDC-09', name: 'Amministrazione e direzione', group: 'struttura', cash: true, driver: null },
  { id: 'cc-serv', code: 'CDC-10', name: 'Servizi e assicurazioni', group: 'struttura', cash: true, driver: null },
  { id: 'cc-comm', code: 'CDC-11', name: 'Commerciale e assistenza tecnica', group: 'commerciale', cash: true, driver: 'ricavi' },
  { id: 'cc-mkt', code: 'CDC-12', name: 'Marketing e campagne', group: 'commerciale', cash: true, driver: 'ricavi' },
];
const ANNUAL = { 'cc-pers': 2650000, 'cc-man': 640000, 'cc-qual': 560000, 'cc-log': 720000, 'cc-hse': 430000, 'cc-amm': 1550000,
  'cc-reg': 1850000, 'cc-rd': 880000, 'cc-dir': 1480000, 'cc-serv': 520000, 'cc-comm': 2150000, 'cc-mkt': 860000 };
export const AGRO_COSTS = { centers: COST_CENTERS, annual: ANNUAL, extraRepair: 46000, repairCenter: 'cc-man', repairNote: 'Comprende la sostituzione straordinaria delle maniche filtranti dell’essiccatore WG (46.000 €)', noisy: ['cc-man', 'cc-serv', 'cc-reg'], varShare: 0.35 };

/* ---------- produzione: componenti delle linee di formulazione ---------- */
// [id, codice, nome, linea, tipo, vita in t, piano, costo di sostituzione, quota del piano già usata, note]
const ASSETS = [
  ['as-wg-gran', 'GR-WG', 'Granulatore a letto fluido', 'L1', 'granulatore', null, { every: 2000, unit: 'h' }, 0, 0.55, 'Aria di processo a 70–90 °C'],
  ['as-wg-man', 'MF-WG', 'Maniche filtranti dell’essiccatore', 'L1', 'maniche filtranti', 900, { every: 900, unit: 't' }, 14500, 0.62],
  ['as-wg-jet', 'JM-WG', 'Mulino ad aria (jet mill)', 'L1', 'ugelli jet mill', 1200, { every: 1200, unit: 't' }, 6800, 0.48, 'Micronizzazione dei tecnici prima dell’impasto'],
  ['as-lq-perle', 'MP-LQ', 'Microsfere del mulino a perle', 'L2', 'microsfere', 600, { every: 600, unit: 't' }, 9200, 0.88, 'Macinazione a umido delle sospensioni (SC)'],
  ['as-lq-rie', 'RI-LQ', 'Riempitrice di flaconi e taniche', 'L2', 'riempitrice', null, { every: 1200, unit: 'h' }, 0, 0.7],
  ['as-lq-mix', 'MX-LQ', 'Reattore di miscelazione da 6 m³', 'L2', 'miscelatore', null, { every: 1500, unit: 'h' }, 0, 0.35],
  ['as-po-mix', 'MX-PO', 'Miscelatore a vomeri delle polveri', 'L3', 'miscelatore', null, { every: 1500, unit: 'h' }, 0, 0.4],
  ['as-po-ins', 'IN-PO', 'Insaccatrice a valvola', 'L3', 'insaccatrice', null, { every: 1200, unit: 'h' }, 0, 0.66],
  ['as-po-fil', 'FP-PO', 'Filtro di abbattimento delle polveri', 'L3', 'filtro polveri', null, { every: 180, unit: 'giorni' }, 0, 0.5],
  ['as-gen', 'GC-01', 'Generatore di aria calda a GPL', null, 'generatore', null, { every: 365, unit: 'giorni' }, 0, 0.6, 'Alimenta l’essiccatore della linea WG'],
  ['as-scrub', 'SC-01', 'Scrubber degli sfiati dei solventi', null, 'scrubber', null, { every: 180, unit: 'giorni' }, 0, 0.45, 'Emissioni in atmosfera autorizzate (dato dimostrativo)'],
];
export const AGRO_PRODUZIONE = {
  assets: ASSETS, shrink: { zolfo: 0.002, caolino: 0.0025, cuoh: 0.001, cuocl: 0.001 },
  cleanKinds: ['granulazione', 'liquidi', 'polveri'], // ogni cambio prodotto richiede una pulizia (bonifica della linea)
  wearLine: 'L2', wearKinds: ['microsfere'], swapKinds: ['maniche filtranti', 'ugelli jet mill', 'microsfere'],
  fastSwapKind: 'ugelli jet mill', openWo: 'as-lq-perle', maintNote: 'Ispezione di tenute, filtri e microsfere; prova di pulizia della linea',
};

/* ---------- acquisti ---------- */
const AGRO_ACQUISTI = {
  extra: {
    cuoh: ['Metalli Agricoli S.p.A. (fantasia)'],
    acetam: ['Agrochem Trading GmbH (fantasia)'],
    pendi: ['Agrochem Trading GmbH (fantasia)'],
    solvente: ['Chimica Lombarda S.r.l. (fantasia)'],
  },
  ladder: {
    cuoh: ['Metalli Agricoli S.p.A. (fantasia)', 'Cuprum Italia S.r.l. (fantasia)'],
    acetam: ['Chimica Orientale Ltd. (fantasia)', 'Agrochem Trading GmbH (fantasia)'],
    pendi: ['Chimica Orientale Ltd. (fantasia)', 'Agrochem Trading GmbH (fantasia)'],
    solvente: ['Chimica Lombarda S.r.l. (fantasia)', 'Solventi Padani S.p.A. (fantasia)'],
  },
  sink: 'Chimica Orientale Ltd. (fantasia)',
  sinkScore: () => null, // al fornitore condizionato vanno solo i lotti respinti
  sinkNote: 'Condizionato dopo il lotto di acetamiprid tecnico respinto per titolo sotto specifica: audit documentale e nuovo certificato di analisi da chiedere',
  profile: {
    'Chimica Orientale Ltd. (fantasia)': { late: 0.22, short: 0.04, lt: 7 },
    'Agrochem Trading GmbH (fantasia)': { late: 0.08, short: 0.02, lt: 3 },
    'Cuprum Italia S.r.l. (fantasia)': { late: 0.06, short: 0.02, lt: 2 },
    'Metalli Agricoli S.p.A. (fantasia)': { late: 0.12, short: 0.03, lt: 2 },
  },
  certTypes: cat => (cat === 'sostanza attiva' ? ['ISO 9001', 'Equivalenza tecnica (dossier)'] : cat === 'coformulante' || cat === 'solvente' ? ['ISO 9001', 'Registrazione REACH'] : ['ISO 9001']),
  minOrderT: cat => (cat === 'sostanza attiva' ? 1 : cat === 'solvente' ? 20 : cat === 'acqua' ? 0 : 2),
  supplierNote: 'Fornitore inventato per l’azienda di agrofarmaci dimostrativa',
  expiringCert: 'Sintesi Fine S.r.l. (fantasia)',
  breaks: { 'Cuprum Italia S.r.l. (fantasia)': [{ fromT: 20, discountPct: 1 }, { fromT: 40, discountPct: 2 }], 'Zolfi Mediterranei S.p.A. (fantasia)': [{ fromT: 60, discountPct: 1.5 }] },
  expiryDays: { 'sostanza attiva': 730, biostimolante: 365, coformulante: 540 }, expiringIng: 'tensio',
  quarantine: { ingId: 'pendi', tonnes: 12, analyses: () => ({ titolo: null }), note: 'Arrivo in attesa del certificato di analisi e del titolo della sostanza attiva' },
  late: { supplier: 'Chimica Orientale Ltd. (fantasia)', ingId: 'fosetil', tonnes: 8 },
};

/* ---------- commerciale ---------- */
const AGRO_COMMERCIALE = {
  schemes: {
    'ag-1': { tiers: [{ from: 0, pct: 2.0 }, { from: 6000000, pct: 2.4 }], byProduct: {}, accrual: 'fatturato', mandate: 'mono' },
    'ag-2': { basePct: 2.2, tiers: [], byProduct: { BA25WG: 3.5, AR60SL: 3 }, accrual: 'fatturato', mandate: 'mono' },
    'ag-5': { basePct: 2.6, tiers: [], byProduct: {}, accrual: 'incasso', mandate: 'mono' },
    'ag-6': { basePct: 2.6, tiers: [], byProduct: {}, accrual: 'incasso', mandate: 'pluri' },
  },
  rivals: RIVALS_AGRO,
  reason: { 'Prezzo del concorrente più basso': 'prezzo', 'Tempi di consegna in campagna': 'servizio', 'Il cliente ha scelto un prodotto biologico': 'prodotto' },
  movedType: 'rivendita', rebateType: 'rivendita', rebates: [1.5, 2, 3],
};

/* ---------- finanza, direzione, redditività, obiettivi ---------- */
const AGRO_FINANZA = {
  cash: 2400000,
  creditLines: [
    { id: 'cl-1', bank: 'Banca Alfa (fantasia)', type: 'fido di cassa', limit: 3000000 },
    { id: 'cl-2', bank: 'Banca Beta (fantasia)', type: 'anticipo fatture', limit: 6000000 },
    { id: 'cl-3', bank: 'Banca Gamma (fantasia)', type: 'finanziamento di campagna', limit: 4000000 },
  ],
  loans: [{ id: 'ln-1', name: 'Mutuo della linea liquidi e del magazzino ADR', instalment: 64000, day: 30 }],
};
const AGRO_DIREZIONE = {
  sintesi: mese => `In ${mese}, fuori stagione, il margine per tonnellata scende: il rame tecnico costa il 15% più dello standard e il rincaro non è passato sui listini dei rameici; gli incassi dei rivenditori arrivano con i pagamenti a data fissa. Proposta: listino rameici aggiornato per la nuova campagna, ordini anticipati entro il 30 novembre e coperture sul rame tecnico per il primo semestre.`,
  budget: 'La stima di chiusura è in linea con il budget sui ricavi; pesano lo smaltimento delle giacenze di Flufendo dopo la revoca e il costo dei rinnovi del rame.',
  product: 'DifesaOS',
};
const AGRO_REDDITIVITA = {
  company: { lat: 44.71, lon: 11.95 },
  logistics: { mode: 'distanza', perDrop: 60, perKm: 0.35, roadFactor: 1.3 }, // consegne a collettame ADR: costo a pallet più che a chilometro
  profit: { targetNetT: 900 },
  concentration: { hhiWarn: 1500, hhiBad: 2500, top1: 0.10, top10: 0.5, agentShare: 0.30, lossRate: 0.3 },
};
const AGRO_TARGETS = {
  oee: { target: 0.6, warn: 0.45 },
  'utilizzo-linee': { target: 0.5, warn: 0.3 }, // stagionale: fuori campagna le linee lavorano meno
  'kwh-t': { target: 75, warn: 90 },
  'scarto-pct': { target: 0.004, warn: 0.007 },
  'reclami-1000t': { target: 2, warn: 3 },
  dso: { target: 150, warn: 175 },
  'scaduto-pct': { target: 0.08, warn: 0.12 },
  otif: { target: 0.95, warn: 0.9 },
  dio: { target: 120, warn: 150 },
  'calo-effettivo': { target: 0.002, warn: 0.004 },
  'mdc-t': { target: 2200, warn: 1800 },
  'quota-mp': { target: 0.55, warn: 0.6 },
  hhi: { target: 1500, warn: 2500 },
  'top10-pct': { target: 0.45, warn: 0.55 },
  'successo-offerte-valore': { target: 0.55, warn: 0.45 },
  'ebitda-pct': { target: 0.12, warn: 0.08 },
  'margine-pieno-t': { target: 900, warn: 500 },
  'ppv-pct': { target: 0.03, warn: 0.06 },
  'copertura-mp-gg': { min: 45, max: 120, warn: 30 },
};

/* ---------- ESG: report e testi del clima ---------- */
const Q_GDO = [
  ['1', 'Ragione sociale e forma giuridica', ['B1.legal-form']], ['2', 'Codice ATECO / NACE dell’attività principale', ['B1.nace']], ['3', 'Fatturato dell’ultimo esercizio (€)', ['B1.turnover']],
  ['4', 'Numero di dipendenti', ['B1.employees']], ['5', 'Certificazioni possedute (ISO 9001, ISO 14001, ISO 45001, altre)', ['B1.certifications']], ['6', 'Consumo totale di energia (MWh)', ['B3.mwh']],
  ['7', 'Energia elettrica da fonti rinnovabili (MWh)', ['B3.mwh-ren-el']], ['8', 'Emissioni Scope 1 (t CO2e)', ['B3.s1']], ['9', 'Emissioni Scope 2 location-based (t CO2e)', ['B3.s2-lb']],
  ['10', 'Emissioni Scope 3 (t CO2e), se calcolate', ['B3.s3']], ['11', 'Prelievo idrico totale (m3)', ['B6.withdrawal']],
  ['12', 'Rifiuti prodotti (pericolosi e non pericolosi) e quantità avviata a recupero', ['B7.waste-haz', 'B7.waste-nonhaz', 'B7.diverted']],
  ['13', 'Tasso di infortuni e infortuni mortali', ['B9.recordable-rate', 'B9.fatalities']], ['14', 'Codice di condotta e politica sui diritti umani', ['C6.code', 'C6.coverage']],
  ['15', 'Condanne o sanzioni per corruzione negli ultimi tre anni', ['B11.convictions', 'B11.fines']],
  ['16', 'Quota del fatturato da prodotti a basso rischio, biologici e biostimolanti', [], 'Nell’ultimo esercizio i prodotti biologici e i biostimolanti valgono una quota crescente dei ricavi: il valore puntuale è nella scheda Economia › Margini per categoria (dato dimostrativo).'],
  ['17', 'Prodotti con sostanze candidate alla sostituzione e piano di uscita', [], 'Elenco delle sostanze candidate alla sostituzione nel portafoglio con le date di scadenza dell’approvazione e il piano di sostituzione: area Regolatorio › Sostanze attive (dato dimostrativo).'],
  ['18', 'Impronta di CO₂ dei programmi di difesa consigliati per coltura (kg CO₂e per ettaro e per kg di prodotto raccolto)', [], 'Forniamo per olivo, vite e melo il calcolo della CO₂ del programma di difesa consigliato, con fattori indicati come da verificare e senza dichiarazioni di neutralità.'],
  ['19', 'Raccolta dei contenitori vuoti e programmi di uso sicuro per gli agricoltori', [], 'Adesione a un sistema di raccolta dei contenitori bonificati e formazione degli utilizzatori con i tecnici di zona (dato dimostrativo).'],
];
const AGRO_REPORT = {
  balanceSheet: 61500000,
  strategy: () => 'Spostare il portafoglio verso prodotti biologici, a basso rischio e biostimolanti, ridurre il rame per ettaro con formulazioni a basso dosaggio e documentare ai clienti la CO₂ dei programmi di difesa con dati chiusi ogni anno; efficienza dell’essiccatore della linea WG e fotovoltaico sul magazzino (dato dimostrativo).',
  circular: () => 'Ricircolo delle acque di lavaggio delle linee nei lotti successivi dello stesso prodotto, imballi in polietilene riciclato per le taniche e ritiro dei pallet a rendere con i fornitori principali (dato dimostrativo).',
  customerQ: { id: 'q-gdo-ortofrutta', title: 'Questionario di sostenibilità dei fornitori di mezzi tecnici 2026', requester: 'Ortofrutta Tirrena Cooperativa (demo)', items: Q_GDO },
};
const CLIMA_TEXT = [
  ['Energia Valle Verde S.p.A. (fornitore dimostrativo)', 'Energia Padana S.p.A. (fornitore dimostrativo)'],
  ['Cella frigorifera di additivi e premiscele', 'Cella termostatata dei formulati biologici'],
  ['Magazzino additivi', 'Magazzino biologici'],
  ['porto del Sud Italia', 'porto di Ravenna'],
];
/** Sostituisce testi del mangimificio nelle righe di una patch (solo stringhe intere o parti di stringa, nessun numero). */
function retext(patch, pairs) {
  let s = JSON.stringify(patch || {});
  for (const [a, b] of pairs) s = s.split(JSON.stringify(a).slice(1, -1)).join(JSON.stringify(b).slice(1, -1));
  return JSON.parse(s);
}
const climaAgro = (d, o) => {
  const p = retext(demoClima(d, o), CLIMA_TEXT);
  const c = p?.settings?.esg18?.clima;
  if (c) { c.plantLat = AGRO_REDDITIVITA.company.lat; c.plantLon = AGRO_REDDITIVITA.company.lon; c.defaultDelivery = 'vettore'; }
  return p;
};

/** [nome, estensore, offset del seme], nell'ordine di esecuzione (semi propri dell'edizione, da 2101). */
export const AGRO_EXTENDERS = [
  ['costs', (d, o) => costsDemo(d, o, AGRO_COSTS), 101],
  ['commerciale', (d, o) => commercialeDemo(d, o, AGRO_COMMERCIALE), 501],
  ['acquisti', (d, o) => acquistiDemo(d, o, AGRO_ACQUISTI), 601],
  ['produzione', (d, o) => produzioneDemo(d, o, AGRO_PRODUZIONE), 701],
  ['finanza', (d, o) => finanzaDemo(d, o, AGRO_FINANZA), 301],
  ['redditivita', (d, o) => redditivitaDemo(d, o, AGRO_REDDITIVITA), 401],
  ['regolatorio', demoRegolatorio, 2101],
  ['campagne', demoCampagne, 2601],
  ['direzione', (d, o) => direzioneDemo(d, o, AGRO_DIREZIONE), 201],
  ['piattaforma', (d, o) => piattaformaDemo(d, o, AGRO_TARGETS), 801],
  ['clima', climaAgro, 901],
  ['programmi', demoProgrammi, 2901],
  ['prove', demoProve, 3101],
  ['ambiente', demoAmbiente, 1701],
  ['persone', demoPersone, 1301],
  ['governance', demoGovernance, 1401],
  ['rischi', demoRischi, 1601],
  ['piano', demoPiano, 1501],
  ['report', (d, o) => reportDemo(d, o, AGRO_REPORT), 1201],
];
