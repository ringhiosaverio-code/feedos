/* FeedOS 18 · Pacchetto di contenuti «piano» integrato (WP7 Obiettivi e piano): libreria delle misure di riduzione, regole degli
 * incentivi, criteri di riferimento SBTi e principi dei finanziamenti legati alla sostenibilità. File senza dipendenze: un pacchetto
 * importato con versione più recente lo sostituisce (src/engine/esg-packs.js).
 * Voce «misura»: { id, kind:'misura', sectors, title, titleBy?, lever, scopeHit, effect, capex, lifeYears, incentive, note, source, status }
 *   - sectors: edizioni a cui si applica ('mangimi' = FeedOS, 'agrofarmaci' = DifesaOS); il motore filtra con sectorOf(d).
 *   - effect.kind: 'el' (quota dell'elettricità × risparmio) · 'fuel' (quota del combustibile di processo × risparmio) · 'pv' (kWp ×
 *     producibilità × autoconsumo) · 'fleet' (quota del gasolio della flotta × riduzione, maggior costo al litro) · 'switch' (cambio del
 *     combustibile di processo) · 'go' (garanzie d'origine: solo market-based) · 'pcf' (leva di formulazione del pacchetto impronta)
 *     · 'ing' (meno acquisti di una materia prima) · 'pack' (plastica riciclata negli imballi) · 'cov' (abbattimento dei COV, nessuna CO₂).
 *   - capex: { lo, hi, per?, n? } € indicativi (per unità × numero di unità); i valori di base sono da confermare con preventivi o diagnosi.
 * Voci «regola» (kind:'regola'): parametri di incentivi, SBTi, ETS2 e SLL, con legge, fonte, «valido al» e stato.
 * Stato: 'verificato' | 'da verificare' (sempre visibile nell'interfaccia). Valori indicativi: non sono consulenza fiscale. */

const BOTH = ['mangimi', 'agrofarmaci'];
const FEED = ['mangimi'];
const AGRO = ['agrofarmaci'];
const V = '2026-10-21';
const LIB = 'Libreria FeedOS delle misure (intervalli indicativi da diagnosi energetiche e schede tecniche di settore, 2024-2026)';

export const PACK_PIANO = {
  pack: 'piano',
  version: '2026.1',
  validAsOf: V,
  source: 'Sintesi FeedOS al 21/10/2026: L. 199/2025, DM MASE 21/07/2025, DM 07/08/2025, SBTi Corporate Net-Zero Standard V2 e FLAG Guidance v1.2, LMA Sustainability-Linked Loan Principles 2025',
  items: [
    /* ---------------- efficienza elettrica ---------------- */
    { id: 'vfd', kind: 'misura', sectors: BOTH, lever: 'efficienza', scopeHit: 'S2',
      title: 'Inverter sui motori principali',
      titleBy: { mangimi: 'Inverter sui motori delle presse e dei mulini a martelli', agrofarmaci: 'Inverter su mulini, agitatori e ventilatori dell’essiccatore' },
      effect: { kind: 'el', shareBy: { mangimi: 0.45, agrofarmaci: 0.35 }, saving: [0.05, 0.10], basis: 'consumo elettrico dei motori interessati' },
      capex: { lo: 15000, hi: 40000, per: 'azionamento', n: 3 }, lifeYears: 12, incentive: 'iper-green',
      note: 'Risparmio dal 5 al 10% dei kWh dei motori interessati (presse, mulini, ventilatori); verificare con misure prima e dopo.', source: LIB, status: 'da verificare' },
    { id: 'aria-compressa', kind: 'misura', sectors: BOTH, lever: 'efficienza', scopeHit: 'S2',
      title: 'Programma contro le perdite di aria compressa',
      effect: { kind: 'el', share: 0.10, saving: [0.20, 0.30], basis: 'elettricità dei compressori, circa il 10% dello stabilimento', opexPerYear: 7500 },
      capex: { lo: 2000, hi: 4000 }, lifeYears: 5, incentive: null,
      note: 'Ricerca delle perdite con ultrasuoni due volte l’anno e riparazioni (5.000-10.000 € l’anno), pressione di rete ridotta.', source: LIB, status: 'da verificare' },
    { id: 'led', kind: 'misura', sectors: BOTH, lever: 'efficienza', scopeHit: 'S2',
      title: 'Illuminazione a LED con sensori',
      effect: { kind: 'el', share: 0.03, saving: [0.50, 0.60], basis: 'elettricità dell’illuminazione, circa il 3% dello stabilimento' },
      capex: { lo: 20000, hi: 50000 }, lifeYears: 15, incentive: 'sabatini',
      note: 'Risparmio dal 50 al 60% dei kWh dell’illuminazione.', source: LIB, status: 'da verificare' },
    /* ---------------- calore di processo ---------------- */
    { id: 'economizzatore', kind: 'misura', sectors: FEED, lever: 'efficienza', scopeHit: 'S1',
      title: 'Economizzatore della caldaia e recupero delle condense',
      effect: { kind: 'fuel', use: 'vapore', saving: [0.05, 0.08], basis: 'combustibile del generatore di vapore' },
      capex: { lo: 20000, hi: 60000 }, lifeYears: 15, incentive: 'TEE',
      note: 'Dal 5 all’8% del combustibile del vapore di condizionamento.', source: LIB, status: 'da verificare' },
    { id: 'recupero-raffreddatori', kind: 'misura', sectors: FEED, lever: 'efficienza', scopeHit: 'S1',
      title: 'Recupero di calore dai raffreddatori al condizionamento',
      effect: { kind: 'fuel', use: 'vapore', saving: [0.05, 0.10], basis: 'combustibile del generatore di vapore' },
      capex: { lo: 40000, hi: 120000 }, lifeYears: 15, incentive: 'iper-green',
      note: 'Aria calda dei raffreddatori del pellet per preriscaldare acqua e aria del condizionamento.', source: LIB, status: 'da verificare' },
    { id: 'essiccatore-recupero', kind: 'misura', sectors: AGRO, lever: 'efficienza', scopeHit: 'S1',
      title: 'Recupero di calore sull’aria esausta dell’essiccatore della linea granuli',
      effect: { kind: 'fuel', use: 'vapore', saving: [0.15, 0.25], basis: 'GPL del generatore di aria calda dell’essiccatore a letto fluido' },
      capex: { lo: 60000, hi: 150000 }, lifeYears: 15, incentive: 'iper-green',
      note: 'Scambiatore aria-aria a valle delle maniche filtranti; controllare il punto di rugiada e la pulizia delle superfici.', source: LIB, status: 'da verificare' },
    { id: 'vapore-elettrico', kind: 'misura', sectors: BOTH, lever: 'combustibili', scopeHit: 'S1',
      title: 'Calore di processo da fonte rinnovabile',
      titleBy: { mangimi: 'Vapore da biometano, biomassa o pompa di calore', agrofarmaci: 'Pompa di calore per l’aria dell’essiccatore' },
      effect: { kind: 'switch', use: 'vapore', cut: 0.8, fuelPremium: 0.3, basis: 'emissioni del combustibile di processo' },
      capex: { lo: 150000, hi: 400000 }, lifeYears: 20, incentive: 'iper-green',
      note: 'Valori da progetto: il costo dipende dalla soluzione (biometano in rete, caldaia a biomassa, pompa di calore ad alta temperatura).', source: LIB, status: 'da verificare' },
    /* ---------------- rinnovabili ---------------- */
    { id: 'fv-bess', kind: 'misura', sectors: BOTH, lever: 'rinnovabili', scopeHit: 'S2',
      title: 'Ampliamento del fotovoltaico con accumulo',
      effect: { kind: 'pv', kWpBy: { mangimi: 300, agrofarmaci: 250 }, yieldSouth: 1450, yieldNorth: 1250, selfUse: 0.85, bessKwh: 400, basis: 'kWp × producibilità × quota autoconsumata' },
      capex: { lo: 900, hi: 1100, per: 'kWp', bessPerKwh: 500 }, lifeYears: 20, incentive: 'iper-green',
      note: 'Producibilità 1.400-1.500 kWh/kWp al Sud, 1.200-1.300 al Nord; accumulo 400-600 €/kWh. Gli impianti di autoproduzione rientrano nell’iperammortamento fino al 105% del fabbisogno.', source: LIB, status: 'da verificare' },
    { id: 'go', kind: 'misura', sectors: BOTH, lever: 'rinnovabili', scopeHit: 'S2-MB',
      title: 'Garanzie d’origine per l’elettricità di rete residua',
      effect: { kind: 'go', eurPerMWh: 1.5, basis: 'elettricità prelevata dalla rete' },
      capex: { lo: 0, hi: 0 }, lifeYears: 1, incentive: null,
      note: 'Riduce solo lo Scope 2 market-based: lo Scope 2 location-based e l’obiettivo per tonnellata non cambiano.', source: LIB, status: 'da verificare' },
    /* ---------------- flotta e logistica ---------------- */
    { id: 'hvo', kind: 'misura', sectors: BOTH, lever: 'flotta', scopeHit: 'S1',
      title: 'HVO per una parte della flotta',
      effect: { kind: 'fleet', share: 0.3, cut: 0.9, extraEurPerL: 0.25, basis: 'gasolio della flotta di consegna' },
      capex: { lo: 0, hi: 0 }, lifeYears: 5, incentive: null,
      note: 'Riduzione dell’85-90% dal pozzo alla ruota; maggior costo 0,20-0,30 €/l; verificare la compatibilità dei motori.', source: LIB, status: 'da verificare' },
    { id: 'rotte', kind: 'misura', sectors: BOTH, lever: 'logistica', scopeHit: 'S1',
      title: 'Ottimizzazione dei giri di consegna',
      effect: { kind: 'fleet', share: 1, cut: 0.075, extraEurPerL: 0, saveFuel: true, opexPerYear: 3000, basis: 'gasolio della flotta di consegna' },
      capex: { lo: 5000, hi: 12000 }, lifeYears: 5, incentive: 'sabatini',
      note: 'Dal 5 al 10% dei litri con giri pianificati e più consegne sfuse.', source: LIB, status: 'da verificare' },
    /* ---------------- materie prime e formulazione (mangimi) ---------------- */
    { id: 'soia-dcf', kind: 'misura', sectors: FEED, lever: 'acquisti', scopeHit: 'S3-c1',
      title: 'Soia senza deforestazione al posto di quella convenzionale',
      effect: { kind: 'pcf', lever: 'dcf', share: 0.6, basis: 't di soia × (fattore convenzionale − fattore DCF), dalle leve del pacchetto impronta' },
      capex: { lo: 0, hi: 0 }, lifeYears: 5, incentive: null,
      note: 'Premio di prezzo dalla formulazione a basso carbonio (scheda Impronta); quota della soia che passa a DCF.', source: LIB, status: 'da verificare' },
    { id: 'sost-soia', kind: 'misura', sectors: FEED, lever: 'formulazione', scopeHit: 'S3-c1',
      title: 'Sostituzione parziale della farina di soia (girasole, colza, leguminose)',
      effect: { kind: 'pcf', lever: 'colza-girasole', share: 0.3, basis: 'leva «colza e girasole» della formulazione a basso carbonio' },
      capex: { lo: 0, hi: 0 }, lifeYears: 5, incentive: null,
      note: 'Stessa specifica nutrizionale; costo e riduzione dalla programmazione lineare dei prodotti scelti.', source: LIB, status: 'da verificare' },
    { id: 'coprodotti', kind: 'misura', sectors: FEED, lever: 'formulazione', scopeHit: 'S3-c1',
      title: 'Più coprodotti e alimenti ex prodotti alimentari',
      effect: { kind: 'pcf', lever: 'coprodotti', share: 0.5, basis: 'leva «coprodotti» della formulazione a basso carbonio' },
      capex: { lo: 0, hi: 0 }, lifeYears: 5, incentive: null,
      note: 'Coprodotti dell’agroindustria con allocazione economica; verificare la disponibilità locale.', source: LIB, status: 'da verificare' },
    /* ---------------- solventi, imballi e rame (agrofarmaci) ---------------- */
    { id: 'solventi-recupero', kind: 'misura', sectors: AGRO, lever: 'acquisti', scopeHit: 'S3-c1',
      title: 'Recupero dei solventi per condensazione sugli sfiati della linea liquidi',
      effect: { kind: 'ing', match: 'solvent', cut: 0.04, vocShare: 0.005, basis: 'solvente acquistato × quota recuperata' },
      capex: { lo: 80000, hi: 160000 }, lifeYears: 12, incentive: 'iper-green',
      note: 'Meno solvente acquistato e meno composti organici volatili (COV) al camino; verificare con il gestore dell’autorizzazione alle emissioni.', source: LIB, status: 'da verificare' },
    { id: 'cov-carboni', kind: 'misura', sectors: AGRO, lever: 'emissioni', scopeHit: 'COV',
      title: 'Abbattimento dei COV a carboni attivi sugli sfiati dei miscelatori',
      effect: { kind: 'cov', vocKg: 900, opexPerYear: 6000, basis: 'COV degli sfiati dei miscelatori della linea liquidi' },
      capex: { lo: 40000, hi: 90000 }, lifeYears: 10, incentive: null,
      note: 'Nessuna riduzione di CO₂: beneficio sui limiti di emissione dell’autorizzazione e sugli odori. Fuori dalla curva dei costi di abbattimento.', source: LIB, status: 'da verificare' },
    { id: 'imballi-pcr', kind: 'misura', sectors: AGRO, lever: 'imballaggi', scopeHit: 'S3-c1',
      title: 'Taniche e flaconi con il 30% di polietilene riciclato',
      effect: { kind: 'pack', kgPerL: 0.045, pcr: 0.3, saveKgPerKg: 1.4, extraEurPerKg: 0.15, basis: 'litri venduti × kg di HDPE per litro × quota riciclata' },
      capex: { lo: 5000, hi: 15000 }, lifeYears: 5, incentive: null,
      note: 'Prove di compatibilità dei formulati e omologazione dell’imballo ADR; 1,2-1,6 kg CO₂e risparmiati per kg di plastica vergine sostituita.', source: LIB, status: 'da verificare' },
    { id: 'rame-basso-dosaggio', kind: 'misura', sectors: AGRO, lever: 'formulazione', scopeHit: 'S3-c1',
      title: 'Programma di riduzione del rame: formulati a basso dosaggio',
      effect: { kind: 'ing', match: 'rame', cut: 0.08, basis: 'rame tecnico acquistato: 20% dei volumi spostati su formulati con il 40% di rame in meno' },
      capex: { lo: 100000, hi: 200000 }, lifeYears: 8, incentive: null,
      note: 'Sviluppo, prove di campo e registrazione di formulati con meno rame per ettaro; beneficio anche sul limite di 28 kg/ha in 7 anni.', source: LIB, status: 'da verificare' },

    /* ---------------- regole e parametri ---------------- */
    { id: 'iper', kind: 'regola', title: 'Iperammortamento 2026-2028', law: 'L. 30 dicembre 2025, n. 199, art. 1 commi 427-436; DL 38/2026',
      bands: [{ upTo: 2500000, base: 1.8, green: 2.2 }, { upTo: 10000000, base: 1.0, green: 1.4 }, { upTo: 20000000, base: 0.5, green: 0.9 }],
      greenTest: { unit: 0.03, process: 0.05 }, selfGenMax: 1.05, deprYears: 5,
      dates: { orderBy: '2026-12-31', depositPct: 0.2, deliverBy: '2027-06-30', investBy: '2028-09-30', from: '2026-01-01' },
      note: 'Maggiorazione del costo ammortizzabile per beni 4.0 per scaglioni di investimento; la maggiorazione «green» richiede un risparmio di almeno il 3% dei consumi dell’unità locale o del 5% dei processi interessati, certificato ex ante ed ex post da un EGE o una ESCo; comunicazioni al GSE. Metrica del risparmio da confermare nel decreto attuativo.',
      source: 'https://www.reteagevolazioni.it/iperammortamento-2026/ · https://www.teamsystem.com/magazine/fatturazione-e-normativa/iper-ammortamento-investimenti-green/', validAsOf: V, status: 'da verificare' },
    { id: 'tee', kind: 'regola', title: 'Certificati bianchi (TEE)', law: 'DM MASE 21 luglio 2025 (GU 11/09/2025); guida operativa GSE, DD n. 203 del 28/07/2026',
      toe: { mwhEl: 0.187, kSmcGas: 0.82, tGpl: 1.10, kLDiesel: 0.86 }, minToe: { PC: 10, PS: 5 }, years: 5,
      note: 'Progetti a consuntivo (PC) da almeno 10 tep nel primo anno, standardizzati (PS) da 5 tep. Il prezzo dei TEE si indica a mano: nessun valore di base.',
      source: 'https://www.lavoripubblici.it/news/certificati-bianchi-nuovo-decreto-mase-gazzetta-ufficiale-36342', validAsOf: V, status: 'da verificare' },
    { id: 'conto-termico', kind: 'regola', title: 'Conto Termico 3.0', law: 'DM 7 agosto 2025 (GU 26/09/2025)',
      checklist: ['Intervento su edifici del terziario (uffici, mensa, spogliatoi) o piccoli impianti di calore rinnovabile', 'Attestato di prestazione energetica prima e dopo l’intervento', 'Domanda al GSE (accesso diretto dal 13/04/2026) o valutazione preliminare prima dei lavori', 'Caldaie a condensazione escluse'],
      note: 'Contributo fino al 65% delle spese; per le imprese 150 M€ l’anno. Da verificare se gli edifici produttivi rientrano per il calore rinnovabile.',
      source: 'https://ance.it/2026/04/conto-termico-3-0-riapertura-del-portale-per-la-richiesta-dellincentivo/', validAsOf: V, status: 'da verificare' },
    { id: 'sabatini', kind: 'regola', title: 'Nuova Sabatini', law: 'DL 69/2013, art. 2; rifinanziamento 2026-2027 (650 M€)',
      checklist: ['Macchinari, impianti e attrezzature nuovi di fabbrica, anche «green» a basso impatto', 'Finanziamento bancario o leasing deliberato prima dell’ordine', 'Domanda tramite la banca o l’intermediario', 'PMI con sede operativa in Italia'],
      note: 'Contributo in conto interessi sul finanziamento.', source: 'https://www.mimit.gov.it/it/normativa/notifiche-e-avvisi/nuova-sabatini-rifinanziamento-per-650-milioni-di-euro', validAsOf: V, status: 'da verificare' },
    { id: 'sbti', kind: 'regola', title: 'Riferimenti SBTi (Corporate Net-Zero Standard V2, FLAG Guidance v1.2)', law: 'Standard volontario',
      rates: { s12: 0.042, flag: 0.0303 }, categoryA: { s12: 10000, balanceSheet: 25000000, turnover: 50000000, fte: 250, minTests: 2 },
      flag: { share: 0.20, maxYears: 2, latest: '2030-12-31', commodities: ['bovini', 'cacao', 'caffè', 'palma da olio', 'gomma', 'soia', 'legno'] },
      v2From: '2027-02-01', v1Until: '2028-01-31',
      note: 'Traiettorie lineari di riferimento ispirate ai criteri SBTi (−4,2% l’anno Scope 1 + 2, −3,03% l’anno FLAG): non sono una validazione. Categoria A se Scope 1 + 2 ≥ 10.000 t oppure se si superano 2 soglie su 3 (stato patrimoniale ≥ 25 M€, ricavi ≥ 50 M€, ≥ 250 dipendenti a tempo pieno); da verificare sui criteri V2.',
      source: 'https://sciencebasedtargets.org/blog/the-corporate-net-zero-standard-v2-0-is-here-what-comes-next · https://www.zevero.earth/blog/sbti-flag-guidance-v1-2', validAsOf: V, status: 'da verificare' },
    { id: 'sll', kind: 'regola', title: 'Sustainability-Linked Loan Principles', law: 'LMA/APLMA/LSTA, 26 marzo 2025 (aggiornamento dei testi LMA di agosto 2026)',
      minHistoryYears: 3, note: 'KPI rilevanti e materiali, obiettivi (SPT) annuali calibrati, almeno 3 anni di storico raccomandati, verifica esterna annuale.',
      source: 'https://lma.eu.com/application/files/6317/4298/0865/Sustainability-Linked_Loan_Principles_-_26_March_2025.pdf', validAsOf: V, status: 'verificato' },
    { id: 'ets2', kind: 'regola', title: 'ETS2: carbonio su combustibili per edifici, trasporto e piccola industria', law: 'Dir. (UE) 2023/959',
      start: 2028, prices: [45, 60, 100], note: 'Il costo arriva attraverso il prezzo dei combustibili; meccanismo di contenimento sopra circa 45 €/t.', source: 'https://www.rabobank.com/knowledge/d011467712-ets2-what-is-it-and-what-impact-will-it-have-on-households-and-businesses', validAsOf: V, status: 'da verificare' },
    { id: 'prezzi', kind: 'regola', title: 'Prezzi di base per le stime delle misure', law: '—',
      dieselEurPerL: 1.55, gasEurPerSmc: 0.48, gplEurPerKg: 0.98, kwhEur: 0.19, solventEurPerKg: null,
      note: 'Si usano solo quando le impostazioni dell’energia non hanno il prezzo; modificabili nelle misure.', source: 'Stima FeedOS (medie 2025-2026)', validAsOf: V, status: 'da verificare' },
  ],
};

/** Leve delle misure (etichette italiane). */
export const LEVERS = { efficienza: 'Efficienza energetica', rinnovabili: 'Rinnovabili', combustibili: 'Cambio di combustibile', flotta: 'Flotta', logistica: 'Logistica',
  formulazione: 'Formulazione', acquisti: 'Acquisti', imballaggi: 'Imballaggi', emissioni: 'Emissioni in atmosfera' };
/** Incentivi (etichette italiane). */
export const INCENTIVES = { 'iper-green': 'Iperammortamento green', 'iper-base': 'Iperammortamento', TEE: 'Certificati bianchi', 'conto-termico': 'Conto Termico 3.0', sabatini: 'Nuova Sabatini' };
