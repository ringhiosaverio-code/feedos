/* FeedOS 18 · Catalogo dei datapoint del VS/VSME (pacchetto WP4 «report»): modulo Basic (B1-B11) e modulo Comprehensive
 * (C1-C9), nell'ordine del modello digitale EFRAG. File di dati senza dipendenze: lo leggono il motore del report, i fornitori
 * dei pacchetti (che usano questi id) e le esportazioni.
 * Ogni datapoint: { id, disc, label {it,en}, type 'num'|'bool'|'text'|'table'|'enum', unit, req 'sempre'|'se-applicabile'|'facoltativo',
 * cond? (condizione di applicabilità), provider (pacchetto che lo calcola), aliases? (id alternativi accettati), hint?, options? }.
 * Le etichette riassumono il testo della Raccomandazione (UE) 2025/1710 e del Reg. delegato (UE) 2026/1560: formulazione da
 * verificare sul portale EFRAG prima della pubblicazione (stato «da verificare», visibile nell'interfaccia). */

export const VS_SOURCE = {
  it: 'Raccomandazione (UE) 2025/1710 (VSME, testo EFRAG di dicembre 2024) e Regolamento delegato (UE) 2026/1560 (Voluntary Standard, in vigore dal 24/09/2026)',
  en: 'Recommendation (EU) 2025/1710 (VSME, EFRAG text of December 2024) and Delegated Regulation (EU) 2026/1560 (Voluntary Standard, in force since 24/09/2026)',
  validAsOf: '2026-10-21',
  status: 'da verificare',
  note: 'Etichette riassunte da FeedOS: verificare la formulazione sul portale EFRAG (knowledgehub.efrag.org) prima di pubblicare il rapporto.',
};

/** Moduli del VS. */
export const VS_MODULES = {
  B: { it: 'Modulo Basic', en: 'Basic module' },
  C: { it: 'Modulo Comprehensive', en: 'Comprehensive module' },
};

/** Informative (disclosure) nell'ordine dello standard. */
export const VS_DISCLOSURES = [
  { id: 'B1', module: 'B', title: { it: 'Criteri di redazione', en: 'Basis for preparation' }, about: 'Opzione scelta, perimetro, profilo dell’impresa, siti e certificazioni.' },
  { id: 'B2', module: 'B', title: { it: 'Pratiche, politiche e iniziative future per la transizione', en: 'Practices, policies and future initiatives for transitioning towards a more sustainable economy' }, about: 'Per ogni tema di sostenibilità: pratiche, politiche, iniziative, se sono pubbliche e se hanno obiettivi.' },
  { id: 'B3', module: 'B', title: { it: 'Energia ed emissioni di gas serra', en: 'Energy and greenhouse gas emissions' }, about: 'Consumo di energia in MWh, Scope 1, Scope 2 location-based, intensità sui ricavi.' },
  { id: 'B4', module: 'B', title: { it: 'Inquinamento di aria, acqua e suolo', en: 'Pollution of air, water and soil' }, about: 'Inquinanti e quantità, se già comunicati per legge o in un sistema di gestione ambientale.' },
  { id: 'B5', module: 'B', title: { it: 'Biodiversità', en: 'Biodiversity' }, about: 'Siti in o vicino ad aree sensibili; uso del suolo (facoltativo).' },
  { id: 'B6', module: 'B', title: { it: 'Acqua', en: 'Water' }, about: 'Prelievo totale, prelievo in aree ad alto stress idrico, consumo.' },
  { id: 'B7', module: 'B', title: { it: 'Uso delle risorse, economia circolare e rifiuti', en: 'Resource use, circular economy and waste management' }, about: 'Principi di economia circolare, rifiuti per pericolosità, recupero, flusso di massa dei materiali.' },
  { id: 'B8', module: 'B', title: { it: 'Forza lavoro: caratteristiche generali', en: 'Workforce – General characteristics' }, about: 'Dipendenti per contratto, genere e paese; turnover sopra i 50 dipendenti.' },
  { id: 'B9', module: 'B', title: { it: 'Forza lavoro: salute e sicurezza', en: 'Workforce – Health and safety' }, about: 'Infortuni registrabili, tasso ogni 200.000 ore, decessi.' },
  { id: 'B10', module: 'B', title: { it: 'Forza lavoro: retribuzione, contrattazione collettiva e formazione', en: 'Workforce – Remuneration, collective bargaining and training' }, about: 'Salario minimo, divario retributivo di genere, contratti collettivi, ore di formazione per genere.' },
  { id: 'B11', module: 'B', title: { it: 'Condanne e sanzioni per corruzione', en: 'Convictions and fines for corruption and bribery' }, about: 'Numero di condanne e importo delle sanzioni.' },
  { id: 'C1', module: 'C', title: { it: 'Strategia: modello di business e iniziative di sostenibilità', en: 'Strategy: business model and sustainability-related initiatives' }, about: 'Prodotti, mercati, relazioni commerciali principali, strategia.' },
  { id: 'C2', module: 'C', title: { it: 'Descrizione di pratiche, politiche e iniziative', en: 'Description of practices, policies and future initiatives' }, about: 'Descrizione delle voci del B2 e livello più alto responsabile.' },
  { id: 'C3', module: 'C', title: { it: 'Obiettivi di riduzione dei gas serra e transizione climatica', en: 'GHG reduction targets and climate transition' }, about: 'Obiettivi Scope 1 e 2, azioni, piano di transizione nei settori ad alto impatto climatico.' },
  { id: 'C4', module: 'C', title: { it: 'Rischi climatici', en: 'Climate risks' }, about: 'Pericoli ed eventi di transizione, esposizione, orizzonti temporali, adattamento.' },
  { id: 'C5', module: 'C', title: { it: 'Altre caratteristiche della forza lavoro', en: 'Additional (general) workforce characteristics' }, about: 'Rapporto donne/uomini nella dirigenza, autonomi, somministrati.' },
  { id: 'C6', module: 'C', title: { it: 'Diritti umani: politiche e processi per la forza lavoro', en: 'Additional own workforce information – Human rights policies and processes' }, about: 'Codice di condotta o politica sui diritti umani, temi coperti, meccanismo di reclamo.' },
  { id: 'C7', module: 'C', title: { it: 'Gravi incidenti sui diritti umani', en: 'Severe negative human rights incidents' }, about: 'Incidenti confermati nella forza lavoro e nella catena del valore.' },
  { id: 'C8', module: 'C', title: { it: 'Ricavi da determinati settori ed esclusione dagli indici UE', en: 'Revenues from certain sectors and exclusion from EU reference benchmarks' }, about: 'Ricavi da armi controverse, tabacco, combustibili fossili, prodotti chimici; esclusione dagli indici allineati a Parigi.' },
  { id: 'C9', module: 'C', title: { it: 'Diversità di genere nell’organo di governo', en: 'Gender diversity ratio in the governance body' }, about: 'Rapporto donne/uomini nel consiglio, se esiste.' },
];
export const VS_DISCLOSURE = Object.fromEntries(VS_DISCLOSURES.map(x => [x.id, x]));

const L = (it, en) => ({ it, en });
const B2M = (id, it, en, aliases) => ({ id: 'B2.' + id, disc: 'B2', label: L(it, en), type: 'table', unit: null, req: 'sempre', provider: 'governance', aliases,
  hint: 'Pratiche, politiche e iniziative future: sì o no, se sono pubbliche e se hanno obiettivi (registro delle politiche).' });

/** Datapoint del VS, nell'ordine del modello EFRAG (B1 … C9). */
export const VS_DATAPOINTS = [
  // ---------------- B1 · Criteri di redazione ----------------
  { id: 'B1.option', disc: 'B1', label: L('Opzione scelta: solo Basic o Basic e Comprehensive', 'Option selected: Basic only, or Basic and Comprehensive'), type: 'enum', unit: null, req: 'sempre', provider: 'report',
    options: { basic: L('solo modulo Basic', 'Basic module only'), 'basic+comprehensive': L('moduli Basic e Comprehensive', 'Basic and Comprehensive modules') }, hint: 'Si sceglie nelle impostazioni del report (sezione Esercizio).' },
  { id: 'B1.omitted', disc: 'B1', label: L('Informazioni omesse perché riservate o sensibili', 'Information omitted as classified or sensitive'), type: 'text', unit: null, req: 'sempre', provider: 'report',
    hint: 'Si compila da solo con le omissioni motivate «riservato» dei singoli datapoint.' },
  { id: 'B1.basis', disc: 'B1', label: L('Base individuale o consolidata', 'Individual or consolidated basis'), type: 'enum', unit: null, req: 'sempre', provider: 'report',
    options: { individuale: L('individuale', 'individual'), consolidato: L('consolidata', 'consolidated') } },
  { id: 'B1.subsidiaries', disc: 'B1', label: L('Controllate incluse e loro sede legale', 'Subsidiaries included and their registered address'), type: 'text', unit: null, req: 'se-applicabile', cond: 'consolidato', provider: 'report' },
  { id: 'B1.legal-form', disc: 'B1', label: L('Forma giuridica', 'Legal form'), type: 'text', unit: null, req: 'sempre', provider: 'report', aliases: ['B1.legalform'], hint: 'Si indica nelle impostazioni del report.' },
  { id: 'B1.nace', disc: 'B1', label: L('Codice NACE delle attività', 'NACE sector classification code(s)'), type: 'text', unit: null, req: 'sempre', provider: 'report', aliases: ['B1.nace-code'] },
  { id: 'B1.balance-sheet', disc: 'B1', label: L('Totale dello stato patrimoniale', 'Balance sheet total'), type: 'num', unit: '€', req: 'sempre', provider: 'report', aliases: ['B1.balance'], hint: 'Dal bilancio d’esercizio approvato.' },
  { id: 'B1.turnover', disc: 'B1', label: L('Fatturato (ricavi netti)', 'Turnover (net revenue)'), type: 'num', unit: '€', req: 'sempre', provider: 'report', aliases: ['B1.revenue'] },
  { id: 'B1.employees', disc: 'B1', label: L('Numero di dipendenti (persone o ETP)', 'Number of employees (headcount or FTE)'), type: 'num', unit: 'persone', req: 'sempre', provider: 'persone',
    aliases: ['B1.headcount', 'B8.headcount', 'B8.total', 'B1.fte'] },
  { id: 'B1.country', disc: 'B1', label: L('Paese delle attività principali e sede dei beni significativi', 'Country of primary operations and location of significant assets'), type: 'text', unit: null, req: 'sempre', provider: 'report' },
  { id: 'B1.sites-geo', disc: 'B1', label: L('Geolocalizzazione dei siti di proprietà, in locazione o gestiti', 'Geolocation of sites owned, leased or managed'), type: 'table', unit: null, req: 'sempre', provider: 'rischi',
    aliases: ['B1.sites', 'B1.geolocation', 'B1.sites-geolocation', 'B1.geo'] },
  { id: 'B1.certifications', disc: 'B1', label: L('Certificazioni o marchi di sostenibilità (emittente, data, punteggio)', 'Sustainability-related certifications or labels (issuer, date, score)'), type: 'table', unit: null, req: 'se-applicabile', cond: 'ha-certificazioni', provider: 'governance',
    aliases: ['B1.certs', 'B1.labels'] },

  // ---------------- B2 · Pratiche, politiche e iniziative ----------------
  B2M('climate', 'Cambiamenti climatici', 'Climate change', ['B2.clima', 'B2.climate-change']),
  B2M('pollution', 'Inquinamento', 'Pollution', ['B2.inquinamento']),
  B2M('water', 'Acque e risorse marine', 'Water and marine resources', ['B2.acqua', 'B2.water-marine']),
  B2M('biodiversity', 'Biodiversità ed ecosistemi', 'Biodiversity and ecosystems', ['B2.biodiversita']),
  B2M('circular', 'Economia circolare', 'Circular economy', ['B2.circular-economy', 'B2.economia-circolare']),
  B2M('own-workforce', 'Forza lavoro propria', 'Own workforce', ['B2.workforce', 'B2.forza-lavoro']),
  B2M('value-chain-workers', 'Lavoratori nella catena del valore', 'Workers in the value chain', ['B2.value-chain', 'B2.workers-value-chain']),
  B2M('communities', 'Comunità interessate', 'Affected communities', ['B2.affected-communities', 'B2.comunita']),
  B2M('consumers', 'Consumatori e utilizzatori finali', 'Consumers and end-users', ['B2.consumers-end-users', 'B2.consumatori']),
  B2M('business-conduct', 'Condotta delle imprese', 'Business conduct', ['B2.conduct', 'B2.condotta']),

  // ---------------- B3 · Energia ed emissioni ----------------
  { id: 'B3.mwh', disc: 'B3', label: L('Consumo totale di energia', 'Total energy consumption'), type: 'num', unit: 'MWh', req: 'sempre', provider: 'clima', aliases: ['B3.energy', 'B3.mwh-total', 'B3.energy-total'] },
  { id: 'B3.mwh-el', disc: 'B3', label: L('di cui elettricità', 'of which electricity'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-elec', 'B3.mwh-electricity', 'B3.electricity'] },
  { id: 'B3.mwh-ren-el', disc: 'B3', label: L('elettricità da fonti rinnovabili', 'electricity from renewable sources'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-el-ren'] },
  { id: 'B3.mwh-nonren-el', disc: 'B3', label: L('elettricità da fonti non rinnovabili', 'electricity from non-renewable sources'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-el-nonren', 'B3.mwh-nren-el', 'B3.mwh-fossil-el'] },
  { id: 'B3.mwh-fuel', disc: 'B3', label: L('di cui combustibili', 'of which fuels'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-fuels', 'B3.fuels'] },
  { id: 'B3.mwh-ren-fuel', disc: 'B3', label: L('combustibili rinnovabili', 'renewable fuels'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-ren-fuels', 'B3.mwh-fuel-ren'] },
  { id: 'B3.mwh-nonren-fuel', disc: 'B3', label: L('combustibili non rinnovabili', 'non-renewable fuels'), type: 'num', unit: 'MWh', req: 'se-applicabile', cond: 'dettaglio-energia', provider: 'clima', aliases: ['B3.mwh-nonren-fuels', 'B3.mwh-fuel-nonren', 'B3.mwh-fossil', 'B3.mwh-fossil-fuel'] },
  { id: 'B3.s1', disc: 'B3', label: L('Emissioni lorde di Scope 1', 'Gross Scope 1 GHG emissions'), type: 'num', unit: 't CO₂e', req: 'sempre', provider: 'clima', aliases: ['B3.scope1'] },
  { id: 'B3.s2-lb', disc: 'B3', label: L('Emissioni lorde di Scope 2 (location-based)', 'Gross location-based Scope 2 GHG emissions'), type: 'num', unit: 't CO₂e', req: 'sempre', provider: 'clima', aliases: ['B3.s2', 'B3.scope2-lb'] },
  { id: 'B3.s2-mb', disc: 'B3', label: L('Emissioni di Scope 2 (market-based)', 'Market-based Scope 2 GHG emissions'), type: 'num', unit: 't CO₂e', req: 'facoltativo', provider: 'clima', aliases: ['B3.scope2-mb'] },
  { id: 'B3.s3', disc: 'B3', label: L('Emissioni di Scope 3', 'Scope 3 GHG emissions'), type: 'num', unit: 't CO₂e', req: 'facoltativo', provider: 'clima', aliases: ['B3.scope3', 'B3.s3-total'] },
  { id: 'B3.intensity', disc: 'B3', label: L('Intensità GHG sui ricavi (Scope 1 e 2 location-based)', 'GHG intensity per turnover (Scope 1 and location-based Scope 2)'), type: 'num', unit: 't CO₂e/M€', req: 'sempre', provider: 'clima', aliases: ['B3.intensity-revenue', 'B3.ghg-intensity'] },

  // ---------------- B4 · Inquinamento ----------------
  { id: 'B4.pollutants', disc: 'B4', label: L('Inquinanti emessi in aria, acqua e suolo, con le quantità', 'Pollutants emitted to air, water and soil, with amounts'), type: 'table', unit: 'kg', req: 'se-applicabile', cond: 'inquinanti', provider: 'ambiente', aliases: ['B4.air', 'B4.pollutants-air'] },

  // ---------------- B5 · Biodiversità ----------------
  { id: 'B5.sites-sensitive', disc: 'B5', label: L('Siti in o vicino ad aree sensibili per la biodiversità (numero)', 'Sites in or near biodiversity-sensitive areas (number)'), type: 'num', unit: 'siti', req: 'sempre', provider: 'rischi' },
  { id: 'B5.area-sensitive', disc: 'B5', label: L('Superficie di quei siti', 'Area of those sites'), type: 'num', unit: 'ha', req: 'se-applicabile', cond: 'siti-sensibili', provider: 'rischi', aliases: ['B5.area', 'B5.sites-sensitive-ha'] },
  { id: 'B5.land-total', disc: 'B5', label: L('Uso totale del suolo', 'Total use of land'), type: 'num', unit: 'm²', req: 'facoltativo', provider: 'rischi', aliases: ['B5.land-use', 'B5.land'] },
  { id: 'B5.land-sealed', disc: 'B5', label: L('Superficie impermeabilizzata', 'Total sealed area'), type: 'num', unit: 'm²', req: 'facoltativo', provider: 'rischi', aliases: ['B5.sealed', 'B5.sealed-area'] },
  { id: 'B5.nature-on', disc: 'B5', label: L('Superficie orientata alla natura nel sito', 'Total nature-oriented area on site'), type: 'num', unit: 'm²', req: 'facoltativo', provider: 'rischi', aliases: ['B5.nature-onsite', 'B5.nature-on-site'] },
  { id: 'B5.nature-off', disc: 'B5', label: L('Superficie orientata alla natura fuori dal sito', 'Total nature-oriented area off site'), type: 'num', unit: 'm²', req: 'facoltativo', provider: 'rischi', aliases: ['B5.nature-offsite', 'B5.nature-off-site'] },

  // ---------------- B6 · Acqua ----------------
  { id: 'B6.withdrawal', disc: 'B6', label: L('Prelievo idrico totale', 'Total water withdrawal'), type: 'num', unit: 'm³', req: 'sempre', provider: 'ambiente' },
  { id: 'B6.withdrawal-stress', disc: 'B6', label: L('Prelievo nei siti in aree ad alto stress idrico', 'Water withdrawal at sites in areas of high water stress'), type: 'num', unit: 'm³', req: 'se-applicabile', cond: 'stress-idrico', provider: 'ambiente',
    aliases: ['B6.stress', 'B6.withdrawal-high-stress', 'B6.high-stress'] },
  { id: 'B6.consumption', disc: 'B6', label: L('Consumo idrico (prelievo meno scarico)', 'Water consumption (withdrawal minus discharge)'), type: 'num', unit: 'm³', req: 'se-applicabile', cond: 'consumo-acqua', provider: 'ambiente' },

  // ---------------- B7 · Risorse ed economia circolare ----------------
  { id: 'B7.circular', disc: 'B7', label: L('Principi di economia circolare applicati e come', 'Circular economy principles applied and how'), type: 'text', unit: null, req: 'sempre', provider: 'pcf',
    aliases: ['B7.circular-economy', 'B7.circularity', 'B7.principles'], hint: 'Per esempio uso di coprodotti, recupero delle spazzature di linea, imballaggi riutilizzabili.' },
  { id: 'B7.waste-haz', disc: 'B7', label: L('Rifiuti pericolosi prodotti', 'Hazardous waste generated'), type: 'num', unit: 't', req: 'sempre', provider: 'ambiente' },
  { id: 'B7.waste-nonhaz', disc: 'B7', label: L('Rifiuti non pericolosi prodotti', 'Non-hazardous waste generated'), type: 'num', unit: 't', req: 'sempre', provider: 'ambiente' },
  { id: 'B7.diverted', disc: 'B7', label: L('Rifiuti avviati a riciclo o riutilizzo', 'Waste diverted to recycling or reuse'), type: 'num', unit: 't', req: 'sempre', provider: 'ambiente', aliases: ['B7.recycled', 'B7.waste-diverted'] },
  { id: 'B7.mass-flow', disc: 'B7', label: L('Flusso di massa annuo dei materiali rilevanti', 'Annual mass flow of relevant materials used'), type: 'table', unit: 't', req: 'se-applicabile', cond: 'flussi-materiali', provider: 'ambiente' },

  // ---------------- B8 · Forza lavoro ----------------
  { id: 'B8.by-contract', disc: 'B8', label: L('Dipendenti per tipo di contratto (indeterminato, determinato)', 'Employees by type of employment contract (permanent, temporary)'), type: 'table', unit: 'persone', req: 'sempre', provider: 'persone' },
  { id: 'B8.by-gender', disc: 'B8', label: L('Dipendenti per genere', 'Employees by gender'), type: 'table', unit: 'persone', req: 'sempre', provider: 'persone' },
  { id: 'B8.by-country', disc: 'B8', label: L('Dipendenti per paese del contratto', 'Employees by country of employment contract'), type: 'table', unit: 'persone', req: 'se-applicabile', cond: 'piu-paesi', provider: 'persone', aliases: ['B8.country'] },
  { id: 'B8.turnover', disc: 'B8', label: L('Tasso di turnover dei dipendenti', 'Rate of employee turnover'), type: 'num', unit: '%', req: 'se-applicabile', cond: 'dip50', provider: 'persone' },

  // ---------------- B9 · Salute e sicurezza ----------------
  { id: 'B9.recordable', disc: 'B9', label: L('Infortuni sul lavoro registrabili (numero)', 'Recordable work-related accidents (number)'), type: 'num', unit: 'n', req: 'sempre', provider: 'persone', aliases: ['B9.accidents', 'B9.recordable-n', 'B9.injuries'] },
  { id: 'B9.recordable-rate', disc: 'B9', label: L('Tasso di infortuni registrabili (ogni 200.000 ore lavorate)', 'Rate of recordable work-related accidents (per 200,000 hours worked)'), type: 'num', unit: 'per 200.000 h', req: 'sempre', provider: 'persone' },
  { id: 'B9.fatalities', disc: 'B9', label: L('Decessi per infortuni o malattie professionali', 'Fatalities from work-related injuries and ill health'), type: 'num', unit: 'n', req: 'sempre', provider: 'persone' },
  { id: 'B9.hours', disc: 'B9', label: L('Ore lavorate (base del tasso)', 'Hours worked (rate basis)'), type: 'num', unit: 'h', req: 'facoltativo', provider: 'persone', aliases: ['B9.hours-worked'] },

  // ---------------- B10 · Retribuzione e formazione ----------------
  { id: 'B10.min-wage', disc: 'B10', label: L('Retribuzioni pari o superiori al salario minimo applicabile', 'Employees paid at least the applicable minimum wage'), type: 'bool', unit: null, req: 'sempre', provider: 'persone' },
  { id: 'B10.pay-gap', disc: 'B10', label: L('Divario retributivo di genere', 'Gender pay gap'), type: 'num', unit: '%', req: 'se-applicabile', cond: 'dip150', provider: 'persone' },
  { id: 'B10.ccnl', disc: 'B10', label: L('Dipendenti coperti da contratti collettivi', 'Employees covered by collective bargaining agreements'), type: 'num', unit: '%', req: 'sempre', provider: 'persone' },
  { id: 'B10.training-h', disc: 'B10', label: L('Ore medie di formazione per dipendente, per genere', 'Average training hours per employee, by gender'), type: 'table', unit: 'h', req: 'sempre', provider: 'persone', aliases: ['B10.training'] },

  // ---------------- B11 · Corruzione ----------------
  { id: 'B11.convictions', disc: 'B11', label: L('Condanne per violazione delle leggi anticorruzione', 'Convictions for violation of anti-corruption and anti-bribery laws'), type: 'num', unit: 'n', req: 'sempre', provider: 'governance' },
  { id: 'B11.fines', disc: 'B11', label: L('Importo delle sanzioni per corruzione', 'Total amount of fines for corruption and bribery'), type: 'num', unit: '€', req: 'sempre', provider: 'governance' },

  // ---------------- C1 · Modello di business ----------------
  { id: 'C1.products', disc: 'C1', label: L('Principali gruppi di prodotti o servizi', 'Significant groups of products and/or services'), type: 'text', unit: null, req: 'sempre', provider: 'pcf', aliases: ['C1.products-services'] },
  { id: 'C1.markets', disc: 'C1', label: L('Mercati significativi', 'Significant markets'), type: 'text', unit: null, req: 'sempre', provider: 'report', aliases: ['C1.market'] },
  { id: 'C1.relationships', disc: 'C1', label: L('Principali relazioni commerciali (clienti e fornitori chiave)', 'Main business relationships (key customers and suppliers)'), type: 'text', unit: null, req: 'sempre', provider: 'report',
    aliases: ['C1.business-relationships', 'C1.relations'] },
  { id: 'C1.strategy', disc: 'C1', label: L('Elementi della strategia legati alla sostenibilità', 'Key elements of the strategy that relate to sustainability'), type: 'text', unit: null, req: 'sempre', provider: 'report' },

  // ---------------- C2 · Descrizione di pratiche e politiche ----------------
  { id: 'C2.description', disc: 'C2', label: L('Descrizione di pratiche, politiche e iniziative del B2', 'Description of the practices, policies and initiatives reported in B2'), type: 'text', unit: null, req: 'sempre', provider: 'governance', aliases: ['C2.practices', 'C2.descriptions'] },
  { id: 'C2.accountable', disc: 'C2', label: L('Livello più alto responsabile dell’attuazione', 'Most senior level accountable for implementation'), type: 'text', unit: null, req: 'sempre', provider: 'governance', aliases: ['C2.senior', 'C2.responsible', 'C2.senior-accountable'] },

  // ---------------- C3 · Obiettivi e transizione ----------------
  { id: 'C3.targets', disc: 'C3', label: L('Obiettivi di riduzione Scope 1 e 2: anno e valore base, anno e valore obiettivo, unità, riduzione %', 'Scope 1 and 2 reduction targets: base year and value, target year and value, units, % reduction'), type: 'table', unit: null, req: 'se-applicabile', cond: 'ha-obiettivi', provider: 'piano',
    aliases: ['C3.target', 'C3.ghg-targets'] },
  { id: 'C3.actions', disc: 'C3', label: L('Principali azioni per raggiungere gli obiettivi', 'Main actions to achieve the targets'), type: 'text', unit: null, req: 'se-applicabile', cond: 'ha-obiettivi', provider: 'piano', aliases: ['C3.main-actions'] },
  { id: 'C3.transition-plan', disc: 'C3', label: L('Piano di transizione per la mitigazione (settori ad alto impatto climatico)', 'Transition plan for climate change mitigation (high climate impact sectors)'), type: 'text', unit: null, req: 'se-applicabile', cond: 'alto-impatto', provider: 'piano',
    aliases: ['C3.plan', 'C3.transition'] },

  // ---------------- C4 · Rischi climatici ----------------
  { id: 'C4.hazards', disc: 'C4', label: L('Pericoli climatici ed eventi di transizione individuati', 'Climate-related hazards and transition events identified'), type: 'text', unit: null, req: 'sempre', provider: 'rischi', aliases: ['C4.risks', 'C4.climate-hazards'] },
  { id: 'C4.exposure', disc: 'C4', label: L('Esposizione e sensibilità di beni, attività e catena del valore', 'Exposure and sensitivity of assets, activities and value chain'), type: 'text', unit: null, req: 'sempre', provider: 'rischi' },
  { id: 'C4.horizons', disc: 'C4', label: L('Orizzonti temporali considerati', 'Time horizons considered'), type: 'text', unit: null, req: 'sempre', provider: 'rischi' },
  { id: 'C4.adaptation', disc: 'C4', label: L('Azioni di adattamento intraprese', 'Adaptation actions taken'), type: 'text', unit: null, req: 'sempre', provider: 'rischi', aliases: ['C4.adaptation-actions'] },
  { id: 'C4.financial', disc: 'C4', label: L('Possibili effetti finanziari', 'Potential financial effects'), type: 'text', unit: null, req: 'facoltativo', provider: 'rischi', aliases: ['C4.financial-effects'] },

  // ---------------- C5 · Altre caratteristiche della forza lavoro ----------------
  { id: 'C5.mgmt-ratio', disc: 'C5', label: L('Rapporto donne/uomini nella dirigenza', 'Female-to-male ratio at management level'), type: 'num', unit: 'rapporto', req: 'se-applicabile', cond: 'dip50', provider: 'persone',
    aliases: ['C5.female-male-mgmt', 'C5.management-ratio', 'C5.gender-mgmt'] },
  { id: 'C5.self-employed', disc: 'C5', label: L('Lavoratori autonomi senza dipendenti che lavorano in esclusiva', 'Self-employed people without personnel working exclusively for the undertaking'), type: 'num', unit: 'persone', req: 'sempre', provider: 'persone', aliases: ['C5.selfemployed', 'C5.self'] },
  { id: 'C5.agency', disc: 'C5', label: L('Lavoratori somministrati da agenzie', 'Temporary workers provided by employment agencies'), type: 'num', unit: 'persone', req: 'sempre', provider: 'persone', aliases: ['C5.agency-workers', 'C5.temporary-agency'] },

  // ---------------- C6 · Diritti umani: politiche ----------------
  { id: 'C6.code', disc: 'C6', label: L('Codice di condotta o politica sui diritti umani per la forza lavoro', 'Code of conduct or human rights policy for own workforce'), type: 'bool', unit: null, req: 'sempre', provider: 'governance',
    aliases: ['C6.policy', 'C6.code-of-conduct', 'C6.human-rights-policy'] },
  { id: 'C6.coverage', disc: 'C6', label: L('Temi coperti: lavoro minorile, forzato, tratta, discriminazione, prevenzione degli infortuni, altro', 'Topics covered: child labour, forced labour, trafficking, discrimination, accident prevention, other'), type: 'table', unit: null, req: 'se-applicabile', cond: 'ha-codice', provider: 'governance',
    aliases: ['C6.topics', 'C6.scope'] },
  { id: 'C6.grievance', disc: 'C6', label: L('Meccanismo di reclamo per la forza lavoro', 'Complaints-handling mechanism for own workforce'), type: 'bool', unit: null, req: 'sempre', provider: 'governance', aliases: ['C6.complaints', 'C6.complaint-mechanism'] },

  // ---------------- C7 · Incidenti sui diritti umani ----------------
  { id: 'C7.own-incidents', disc: 'C7', label: L('Incidenti confermati nella forza lavoro propria e azioni intraprese', 'Confirmed incidents in own workforce and actions taken'), type: 'text', unit: null, req: 'sempre', provider: 'governance',
    aliases: ['C7.own', 'C7.incidents', 'C7.own-workforce'] },
  { id: 'C7.value-chain', disc: 'C7', label: L('Incidenti confermati nella catena del valore, nelle comunità o tra i consumatori', 'Confirmed incidents involving value-chain workers, communities or consumers'), type: 'text', unit: null, req: 'sempre', provider: 'governance',
    aliases: ['C7.valuechain', 'C7.value-chain-incidents'] },

  // ---------------- C8 · Ricavi da determinati settori ----------------
  { id: 'C8.revenue-sectors', disc: 'C8', label: L('Ricavi da armi controverse, tabacco, combustibili fossili e prodotti chimici (NACE 20.2)', 'Revenues from controversial weapons, tobacco, fossil fuels and chemicals (NACE 20.2)'), type: 'table', unit: '€', req: 'sempre', provider: 'governance',
    aliases: ['C8.revenues', 'C8.revenue', 'C8.sectors'] },
  { id: 'C8.benchmark-excluded', disc: 'C8', label: L('Esclusione dagli indici di riferimento UE allineati a Parigi', 'Exclusion from EU Paris-aligned benchmarks'), type: 'bool', unit: null, req: 'sempre', provider: 'governance',
    aliases: ['C8.excluded', 'C8.paris-excluded', 'C8.benchmark'] },

  // ---------------- C9 · Diversità di genere nel consiglio ----------------
  { id: 'C9.board-ratio', disc: 'C9', label: L('Rapporto donne/uomini nell’organo di amministrazione', 'Female-to-male ratio in the governance body'), type: 'num', unit: 'rapporto', req: 'se-applicabile', cond: 'ha-cda', provider: 'governance', aliases: ['C9.ratio', 'C9.board'] },
].map((x, i) => ({ ...x, module: x.disc[0], order: i + 1 }));

export const VS_DP = Object.fromEntries(VS_DATAPOINTS.map(x => [x.id, x]));
/** id alternativo → id del catalogo. */
export const VS_ALIAS = Object.fromEntries(VS_DATAPOINTS.flatMap(x => (x.aliases || []).map(a => [a, x.id])));

/** Condizioni di applicabilità dei datapoint «se applicabile»: testo quando vale e quando non vale. */
export const VS_CONDITIONS = {
  consolidato: { yes: 'rendiconto consolidato', no: 'non applicabile: rendiconto su base individuale' },
  'ha-certificazioni': { yes: 'l’impresa ha certificazioni o marchi', no: 'non applicabile: nessuna certificazione o marchio di sostenibilità' },
  'dettaglio-energia': { yes: 'dettaglio richiesto quando i dati sono disponibili', no: 'non applicabile: dettaglio non ottenibile' },
  inquinanti: { yes: 'emissioni già comunicate per legge (AUA/AIA) o in un sistema di gestione', no: 'non applicabile: nessun obbligo di comunicare inquinanti' },
  'siti-sensibili': { yes: 'ci sono siti in o vicino ad aree sensibili', no: 'non applicabile: nessun sito in aree sensibili' },
  'stress-idrico': { yes: 'siti in aree ad alto stress idrico', no: 'non applicabile: nessun sito in aree ad alto stress idrico' },
  'consumo-acqua': { yes: 'processi con consumo d’acqua significativo (per esempio il vapore)', no: 'non applicabile: consumo d’acqua non significativo' },
  'flussi-materiali': { yes: 'settore con flussi di materiali significativi (manifattura)', no: 'non applicabile: flussi di materiali non significativi' },
  'piu-paesi': { yes: 'dipendenti in più paesi', no: 'non applicabile: dipendenti in un solo paese' },
  dip50: { yes: 'impresa con almeno 50 dipendenti', no: 'non richiesto sotto i 50 dipendenti' },
  dip150: { yes: 'impresa con almeno 150 dipendenti', no: 'facoltativo sotto i 150 dipendenti' },
  'ha-obiettivi': { yes: 'l’impresa ha obiettivi di riduzione', no: 'non applicabile: nessun obiettivo di riduzione' },
  'alto-impatto': { yes: 'settore ad alto impatto climatico (sezioni NACE A-H e L)', no: 'non applicabile: settore non ad alto impatto climatico' },
  'ha-codice': { yes: 'esiste un codice di condotta', no: 'non applicabile: nessun codice di condotta' },
  'ha-cda': { yes: 'esiste un organo di amministrazione collegiale', no: 'non applicabile: nessun consiglio' },
};

/** Pacchetti che forniscono i datapoint: titolo (neutro rispetto al settore) e scheda ESG dove si completano. */
export const VS_PROVIDERS = {
  clima: { tab: 'clima', title: L('Clima e GHG', 'Climate and GHG') },
  pcf: { tab: 'passaporto', title: L('Impronta dei prodotti', 'Product footprint') },
  filiera: { tab: 'filiera', title: L('EUDR e fornitori', 'EUDR and suppliers') },
  report: { tab: 'vsme', id: 'esercizio', title: L('Report e questionari', 'Reports and questionnaires') },
  persone: { tab: 'persone', title: L('Persone e sicurezza', 'People and safety') },
  governance: { tab: 'governance', title: L('Governance ed evidenze', 'Governance and evidence') },
  piano: { tab: 'piano', title: L('Obiettivi e piano', 'Targets and plan') },
  rischi: { tab: 'rischi', title: L('Rischi climatici', 'Climate risks') },
  ambiente: { tab: 'ambiente', title: L('Registri ambientali', 'Environmental registers') },
};

/** Motivi di omissione ammessi (un'omissione conta come coperta solo con una motivazione scritta). */
export const OMISSION_REASONS = {
  'non-applicabile': L('non applicabile all’impresa', 'not applicable to the undertaking'),
  riservato: L('informazione riservata o sensibile', 'classified or sensitive information'),
  'non-disponibile': L('dato non ottenibile per questo esercizio', 'information not obtainable for this period'),
};
