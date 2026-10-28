/* FeedOS 18 · Pacchetto di contenuti «pcf» (impronta dei mangimi, pacchetto WP2): valori di letteratura modificabili, con fonte,
 * anno e stato. File di dati senza dipendenze. Le voci con sectors: ['mangimi'] valgono solo per i mangimifici.
 * NESSUN VALORE GFLI È INCLUSO: la banca dati GFLI richiede la registrazione e i termini di ridistribuzione non sono noti. I valori
 * qui sono ordini di grandezza pubblicati o stime (stato «da verificare»): vanno sostituiti con i valori GFLI 3.0 dell'utente
 * (importazione CSV con le colonne dell'esportazione GFLI nella scheda Impronta mangimi › Fattori).
 * Unità: fattori delle materie prime in kg CO₂e per t di materia prima; occupazione di suolo in m²·anno per t; imballaggi in
 * kg CO₂e per kg di materiale; trasporti in kg CO₂e per t·km (stessi valori del pacchetto clima, che ha la precedenza).
 * kind: 'materia' (fattore di una materia prima, abbinato per parole chiave), 'materiale' (imballaggio), 'confezione' (imballaggio
 * di base per tipo di confezione), 'tratta' (trasporto in ingresso di base per origine), 'circolarita' (classe e frazione edibile
 * delle proteine), 'scadenza' (calendario). Un pacchetto più recente importato (settings.esg18.packs.pcf) prende il posto di questo. */

const S = { agri: 'Agri-footprint 6 tramite il rapporto ambientale ProTerra 2024; GFLI 3.0 −43% per il Brasile (All About Feed, 2026)',
  ussec: 'USSEC / Blonk 2025 (studio finanziato dal settore statunitense)', proterra: 'ProTerra Foundation, Environmental Footprint Report 2024',
  donau: 'Donau Soja, scheda della farina di soia 2025 (fonte di settore)', wwf: 'WWF, impronta media della farina di soia; Donau Soja «media UE» 1,99 kg/kg',
  aau: 'Università di Aalborg, LCA dell’olio di palma certificato e non certificato', anim15: 'Animal (2015), supplemento LCA dei mangimi per suini',
  dgtc: 'DGTC 2022 (borlande di distilleria)', k: 'Stima FeedOS da letteratura di settore (valore indicativo)', climatiq: 'Banche dati generiche (ordine di grandezza)' };

/* materia prima: id, etichetta, parole chiave (tutte richieste; '!x' = parola esclusa), origine, schema, catena di custodia, totale,
   di cui LUC, di cui gestione del suolo, intervallo, suolo m²·anno/t, trasporto incluso fino a, fonte, anno, nota */
const M = (id, label, match, origin, scheme, coc, total, luc, lm, low, high, landM2a, incl, source, year, note = '', extra = {}) => ({
  id, kind: 'materia', label, match, origin, scheme, coc, total, luc, landMgmt: lm, fossil: Math.max(0, total - luc - lm), low, high, landM2a, includesTransportTo: incl,
  db: 'Letteratura FeedOS', dbVersion: '2026.1', year, source, status: 'da verificare', note, sectors: ['mangimi'], allocation: 'economica', ...extra,
});

const F = (family, circ, it) => ({ ...it, family, circ });

export const PACK_PCF = {
  pack: 'pcf', version: '2026.1', validAsOf: '2026-10-22',
  source: 'FeedOS: valori di letteratura con fonte e anno (nessun valore GFLI incluso); fattori dei materiali d’imballaggio e dei trasporti allineati al pacchetto clima.',
  items: [
    // ---------- soia e derivati (il cambio d'uso del suolo è la voce che pesa di più) ----------
    F('soia-farina', 'soia-farina', M('soia-farina-br', 'Farina di estrazione di soia · Brasile, convenzionale', ['soia', 'farina|estraz'], 'BR', null, null, 3000, 2400, 150, 2400, 4300, 2600, 'mercato-UE', S.agri, 2024, 'Da sostituire con GFLI 3.0: la revisione ha ridotto il valore del Brasile di circa il 43%.')),
    F('soia-farina', 'soia-farina', M('soia-farina-ar', 'Farina di estrazione di soia · Argentina, convenzionale', ['soia', 'farina|estraz'], 'AR', null, null, 1300, 800, 120, 1200, 4300, 2400, 'mercato-UE', S.ussec, 2025, 'GFLI 3.0: −71% rispetto alla versione 2.2.')),
    F('soia-farina', 'soia-farina', M('soia-farina-us', 'Farina di estrazione di soia · Stati Uniti', ['soia', 'farina|estraz'], 'US', null, null, 550, 50, 120, 450, 650, 2200, 'mercato-UE', S.ussec, 2025)),
    F('soia-farina', 'soia-farina', M('soia-farina-br-dcf', 'Farina di estrazione di soia · Brasile, senza deforestazione, segregata', ['soia', 'farina|estraz'], 'BR', 'ProTerra', 'segregato', 550, 0, 150, 400, 900, 2600, 'mercato-UE', S.proterra, 2024, 'Solo con catena di custodia fisica (segregata o a identità preservata).')),
    F('soia-farina', 'soia-farina', M('soia-farina-ue', 'Farina di estrazione di soia · UE, certificata Europe Soya / Donau Soja', ['soia', 'farina|estraz'], 'UE', 'Europe Soya', 'segregato', 400, 0, 140, 300, 600, 2300, 'cancello-fornitore', S.donau, 2025, 'Fonte di settore.')),
    F('soia-farina', 'soia-farina', M('soia-farina-nd', 'Farina di estrazione di soia · origine non nota', ['soia', 'farina|estraz'], '*', null, null, 2000, 1400, 150, 160, 12000, 2500, 'mercato-UE', S.wwf, 2023, 'Valore prudente quando l’origine manca.')),
    F('soia-integrale', 'soia-integrale', M('soia-integrale', 'Soia integrale tostata · origine non nota', ['soia', 'integral|tostat|seme'], '*', null, null, 1800, 1200, 200, 500, 6000, 2800, 'mercato-UE', S.k, 2025, 'Non verificato.')),
    F('soia-olio', 'grasso', M('soia-olio', 'Olio di soia · Brasile o Argentina, convenzionale', ['soia', 'olio'], '*', null, null, 4500, 3500, 300, 2000, 8000, 3000, 'mercato-UE', 'USSEC 2024 (dati Agri-footprint precedenti a GFLI 3)', 2024, 'Intervallo molto ampio: sostituire con GFLI.')),
    // ---------- palma ----------
    F('palma-olio', 'grasso', M('palma-olio', 'Olio di palma · non certificato', ['palma', 'olio|grasso', '!palmist'], '*', null, null, 5300, 3000, 500, 3300, 8200, 2600, 'mercato-UE', S.aau, 2023, 'Fino a 20 t/t su torbiera.')),
    F('palma-olio', 'grasso', M('palma-olio-rspo', 'Olio di palma · certificato RSPO', ['palma', 'olio|grasso', '!palmist'], '*', 'RSPO', null, 3400, 1500, 500, 2250, 4500, 2600, 'mercato-UE', S.aau, 2023)),
    F('palmisto', 'farina-oleosa', M('palmisto', 'Panello di palmisto', ['palmist'], '*', null, null, 700, 300, 100, 400, 1500, 900, 'mercato-UE', S.k, 2025, 'In ambito EUDR (NC 2306 60). Non verificato.')),
    // ---------- cereali ----------
    F('mais', 'mais', M('mais-it', 'Mais granella · Italia', ['mais|granoturco', '!glutin', '!borland', '!ddgs', '!olio'], 'IT', null, null, 400, 0, 210, 300, 550, 1100, 'cancello-fornitore', S.climatiq + '; irrigazione ed essiccazione italiane (stima); GFLI 3.0 UE +23%', 2025)),
    F('mais', 'mais', M('mais-ue', 'Mais granella · UE', ['mais|granoturco', '!glutin', '!borland', '!ddgs', '!olio'], 'UE', null, null, 400, 0, 200, 300, 550, 1100, 'cancello-fornitore', S.climatiq, 2025)),
    F('mais', 'mais', M('mais-sa', 'Mais granella · Sud America', ['mais|granoturco', '!glutin', '!borland', '!ddgs', '!olio'], 'EXTRA', null, null, 600, 200, 150, 400, 1500, 1300, 'mercato-UE', S.k + '; GFLI 3.0 −57/−61% per il Sud America', 2025, 'Non verificato.')),
    F('frumento', 'frumento', M('frumento', 'Frumento · UE', ['frument|grano tenero|grano duro'], '*', null, null, 400, 0, 200, 300, 550, 1500, 'cancello-fornitore', S.anim15 + '; GFLI 3.0 UE +9%', 2015)),
    F('orzo', 'cereale', M('orzo', 'Orzo · UE', ['orzo'], '*', null, null, 380, 0, 190, 300, 500, 1700, 'cancello-fornitore', S.anim15, 2015)),
    F('sorgo', 'cereale', M('sorgo', 'Sorgo · UE', ['sorgo'], '*', null, null, 380, 0, 190, 290, 500, 1600, 'cancello-fornitore', S.k, 2025, 'Come l’orzo: non verificato.')),
    F('crusca', 'residuo', M('crusca', 'Crusca e farinaccio di frumento', ['crusca|farinacc|cruschell'], '*', null, null, 250, 0, 120, 150, 350, 600, 'cancello-fornitore', S.anim15, 2015, 'L’allocazione economica tiene basso il valore.')),
    // ---------- farine proteiche e leguminose ----------
    F('colza', 'farina-oleosa', M('colza', 'Farina di estrazione di colza · UE', ['colza'], '*', null, null, 500, 0, 240, 400, 700, 1500, 'cancello-fornitore', S.anim15, 2015)),
    F('girasole', 'farina-oleosa', M('girasole', 'Farina di estrazione di girasole · UA/UE', ['girasol'], '*', null, null, 450, 30, 200, 300, 650, 2000, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('leguminose', 'leguminose', M('leguminose', 'Leguminose da granella (favino, pisello)', ['favin|fava|pisell|lupin'], '*', null, null, 350, 0, 150, 250, 500, 2600, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('medica', 'foraggio', M('medica', 'Erba medica disidratata', ['medica|erba'], '*', null, null, 400, 0, 160, 250, 600, 900, 'cancello-fornitore', S.k, 2025, 'L’essiccazione pesa più della coltura. Non verificato.')),
    // ---------- coprodotti dell'agroindustria ----------
    F('ddgs', 'residuo', M('ddgs', 'Borlande di mais essiccate (DDGS)', ['borland|ddgs|distiller'], '*', null, null, 900, 0, 200, 660, 1100, 700, 'cancello-fornitore', S.dgtc, 2022, 'Il gas naturale dell’essiccazione domina.')),
    F('glutine', 'residuo', M('glutine', 'Glutine di mais (corn gluten feed)', ['glutin'], '*', null, null, 500, 0, 150, 300, 800, 600, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('polpe', 'residuo', M('polpe', 'Polpe di bietola essiccate', ['polp', 'biet|barbab'], '*', null, null, 250, 0, 80, 150, 400, 300, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('melasso', 'residuo', M('melasso', 'Melasso di barbabietola', ['melass'], '*', null, null, 300, 0, 90, 150, 500, 200, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('exfood', 'ex-food', M('exfood', 'Ex prodotti alimentari (farina di prodotti da forno)', ['ex prodott|ex alimentar|prodotti da forno|biscott|panific'], '*', null, null, 250, 0, 30, 100, 500, 100, 'cancello-fornitore', S.k, 2025, 'Dipende dall’allocazione.')),
    // ---------- minerali, amminoacidi, premiscele ----------
    F('carbonato', 'minerale-additivo', M('carbonato', 'Carbonato di calcio', ['carbonat', 'calci'], '*', null, null, 10, 0, 0, 2, 50, 0, 'cancello-fornitore', S.climatiq + ' più trasporto', 2025)),
    F('fosfato', 'minerale-additivo', M('fosfato', 'Fosfato bicalcico o monocalcico', ['fosfat'], '*', null, null, 1300, 0, 0, 800, 2000, 0, 'cancello-fornitore', S.k + '; i fosfati pesano l’1,7-4% dell’impronta di un mangime', 2025, 'Non verificato.')),
    F('sale', 'minerale-additivo', M('sale', 'Cloruro di sodio', ['\\bsale\\b|cloruro di sodio'], '*', null, null, 150, 0, 0, 50, 300, 0, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('bicarbonato', 'minerale-additivo', M('bicarbonato', 'Bicarbonato di sodio', ['bicarbonat'], '*', null, null, 600, 0, 0, 400, 1000, 0, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('ossmg', 'minerale-additivo', M('ossmg', 'Ossido di magnesio', ['magnes'], '*', null, null, 1500, 0, 0, 1000, 2500, 0, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),
    F('lisina', 'minerale-additivo', M('lisina', 'L-lisina HCl', ['lisin'], '*', null, null, 4000, 150, 250, 2500, 6000, 300, 'mercato-UE', S.k + '; fermentazione da zuccheri o amidi', 2025, 'Preferire l’impronta dichiarata dal fornitore (PACT).')),
    F('metionina', 'minerale-additivo', M('metionina', 'DL-metionina', ['metionin'], '*', null, null, 3500, 0, 0, 2500, 5000, 0, 'mercato-UE', S.k, 2025, 'Preferire l’impronta dichiarata dal fornitore (PACT).')),
    F('treonina', 'minerale-additivo', M('treonina', 'L-treonina', ['treonin'], '*', null, null, 4500, 150, 250, 3000, 7000, 300, 'mercato-UE', S.k, 2025, 'Preferire l’impronta dichiarata dal fornitore (PACT).')),
    F('premix', 'minerale-additivo', M('premix', 'Premiscela vitaminico-minerale', ['premisc|premix|integrator'], '*', null, null, 2000, 0, 100, 1000, 5000, 100, 'cancello-fornitore', S.k + '; vitamine alte, veicolante basso', 2025, 'Non verificato.')),
    F('grasso', 'grasso', M('grasso', 'Altri grassi e oli vegetali UE', ['olio|grass', '!soia', '!palma', '!palmist'], '*', null, null, 2500, 300, 500, 1500, 4500, 2400, 'cancello-fornitore', S.k, 2025, 'Non verificato.')),

    // ---------- materiali d'imballaggio (kg CO₂e per kg; stessi valori del pacchetto clima) ----------
    { id: 'mat-carta', kind: 'materiale', material: 'carta', label: 'Carta per sacchi multistrato', value: 1.1, low: 0.7, high: 1.5, unit: 'kg CO₂e/kg', conai: 'carta', source: S.k, year: 2025, status: 'da verificare' },
    { id: 'mat-pe', kind: 'materiale', material: 'PE', label: 'Polietilene (sacchi e film)', value: 2.5, low: 2.0, high: 3.5, unit: 'kg CO₂e/kg', conai: 'plastica', source: S.k, year: 2025, status: 'da verificare' },
    { id: 'mat-film', kind: 'materiale', material: 'film-LDPE', label: 'Film estensibile o termoretraibile LDPE', value: 2.5, low: 2.0, high: 3.5, unit: 'kg CO₂e/kg', conai: 'plastica', source: S.k, year: 2025, status: 'da verificare' },
    { id: 'mat-pp', kind: 'materiale', material: 'PP', label: 'Polipropilene tessuto (big bag)', value: 2.2, low: 1.6, high: 3.0, unit: 'kg CO₂e/kg', conai: 'plastica', source: S.k, year: 2025, status: 'da verificare' },
    { id: 'mat-legno', kind: 'materiale', material: 'legno', label: 'Legno (pallet a perdere)', value: 0.4, low: 0.2, high: 0.8, unit: 'kg CO₂e/kg', conai: 'legno', source: S.k, year: 2025, status: 'da verificare' },
    { id: 'mat-pallet-viaggio', kind: 'materiale', material: 'pallet-riutilizzabile', label: 'Pallet riutilizzabile (per viaggio)', value: 2, low: 1, high: 3, unit: 'kg CO₂e per viaggio', conai: 'legno', source: S.k, year: 2025, status: 'da verificare' },

    // ---------- imballaggi di base per tipo di confezione (finché il registro non ha la scheda dell'articolo) ----------
    { id: 'conf-sacco', kind: 'confezione', match: ['sacc'], label: 'Sacco di carta da 25 kg (di base)', unitsPerT: 40, components: [{ material: 'carta', kgPerUnit: 0.14, recycledPct: 0 }], palletsPerT: 0.8, palletReusable: true, palletKg: 20,
      source: 'Stima FeedOS: sacco da 25 kg di circa 0,14 kg, 40 sacchi per tonnellata (come il pacchetto clima)', status: 'da verificare' },
    { id: 'conf-bigbag', kind: 'confezione', match: ['big ?bag|bigbag'], label: 'Big bag da 1 t (di base)', unitsPerT: 1, components: [{ material: 'PP', kgPerUnit: 2.5, recycledPct: 0 }], palletsPerT: 1, palletReusable: true,
      source: S.k, status: 'da verificare' },
    { id: 'conf-sfuso', kind: 'confezione', match: ['sfus|rinfus|cisterna'], label: 'Sfuso (autocisterna)', unitsPerT: 0, components: [], palletsPerT: 0, source: 'Nessun imballaggio', status: 'verificato' },

    // ---------- trasporto in ingresso di base (tratte dopo il punto incluso nel fattore) ----------
    { id: 'tratta-it', kind: 'tratta', origin: 'IT', label: 'Materie prime nazionali', legs: [{ mode: 'camion', km: 150 }], source: S.k, status: 'da verificare' },
    { id: 'tratta-ue', kind: 'tratta', origin: 'UE', label: 'Materie prime dell’UE', legs: [{ mode: 'camion', km: 300 }, { mode: 'treno', km: 700 }], source: S.k, status: 'da verificare' },
    { id: 'tratta-extra-porto', kind: 'tratta', origin: 'EXTRA', from: 'mercato-UE', label: 'Importazioni: dal porto UE al mangimificio', legs: [{ mode: 'camion', km: 250 }], source: S.k, status: 'da verificare' },
    { id: 'tratta-extra', kind: 'tratta', origin: 'EXTRA', from: 'cancello-fornitore', label: 'Importazioni: dal paese d’origine al mangimificio', legs: [{ mode: 'nave', km: 10000 }, { mode: 'camion', km: 250 }], source: S.k, status: 'da verificare' },

    // ---------- circolarità: classe del coprodotto e frazione edibile delle proteine (scenari basso / medio / alto, stile Ertl 2015) ----------
    ...[['cereale', 'primario', 0.4, 0.6, 0.8], ['mais', 'primario', 0.7, 0.8, 0.9], ['frumento', 'primario', 0.6, 0.8, 1.0], ['soia-farina', 'farina-oleosa', 0.5, 0.7, 0.92],
      ['soia-integrale', 'primario', 0.5, 0.7, 0.92], ['farina-oleosa', 'farina-oleosa', 0, 0.3, 0.59], ['leguminose', 'primario', 0.5, 0.7, 0.9], ['residuo', 'residuo', 0, 0.1, 0.2],
      ['foraggio', 'primario', 0, 0, 0], ['grasso', 'primario', 0, 0, 0], ['minerale-additivo', 'minerale-additivo', 0, 0, 0], ['ex-food', 'ex-food', 0, 0.2, 0.5]]
      .map(([key, coClass, hefLow, hefMed, hefHigh]) => ({ id: 'circ-' + key, kind: 'circolarita', key, coClass, hefLow, hefMed, hefHigh, source: 'Scenari di frazione edibile delle proteine in stile Ertl et al. (2015); valori indicativi', status: 'da verificare' })),

    // ---------- scadenze (imballaggi, metodo) ----------
    { id: 'ppwr-applicazione', kind: 'scadenza', date: '2026-08-12', title: 'PPWR: dichiarazione di conformità UE e documentazione tecnica degli imballaggi', law: 'Reg. (UE) 2025/40 (PPWR)', source: 'Heuking, PPWR Factsheet; Assolombarda 2026', status: 'verificato' },
    { id: 'ppwr-etichette', kind: 'scadenza', date: '2028-08-12', title: 'PPWR: etichette armonizzate sulla composizione dei materiali', law: 'Reg. (UE) 2025/40 (PPWR)', source: 'Heuking, PPWR Factsheet (o 24 mesi dopo l’atto di esecuzione, se più tardi)', status: 'da verificare' },
    { id: 'ppwr-riciclabilita', kind: 'scadenza', date: '2030-08-12', title: 'PPWR: grado di riciclabilità minimo C e contenuto riciclato nella plastica', law: 'Reg. (UE) 2025/40 (PPWR)', source: 'Heuking, PPWR Factsheet; Regsurance', status: 'da verificare' },
  ],
};

/** Classi di circolarità (per le quote nella scheda del prodotto). */
export const CO_CLASSES = {
  residuo: 'Residui dell’agroindustria',
  'farina-oleosa': 'Farine di estrazione',
  primario: 'Colture primarie',
  'ex-food': 'Ex prodotti alimentari',
  'minerale-additivo': 'Minerali e additivi',
};
/** Materiali d'imballaggio ammessi nel registro. */
export const PACK_MATERIALS = ['carta', 'PE', 'PP', 'film-LDPE', 'legno'];
/** Mezzi di trasporto e fattore di riserva (kg CO₂e/t·km) se il pacchetto clima non risponde. */
export const MODES = { camion: { label: 'camion', climaId: 'tr.camion', value: 0.105 }, treno: { label: 'treno', climaId: 'tr.treno', value: 0.025 }, nave: { label: 'nave', climaId: 'tr.nave', value: 0.006 }, chiatta: { label: 'chiatta', climaId: 'tr.chiatta', value: 0.03 } };
/** Banche dati riconosciute nelle importazioni (nome mostrato). */
export const KNOWN_DBS = ['GFLI', 'Agri-footprint', 'ecoinvent', 'Blonk', 'USSEC', 'ProTerra', 'Donau Soja', 'fornitore', 'dimostrativo', 'Letteratura FeedOS'];
