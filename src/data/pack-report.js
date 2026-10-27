/* FeedOS 18 · Pacchetti di contenuti del report (pacchetto WP4 «report»), senza dipendenze, con «valido al».
 * PACK_REPORT: tabelle di raccordo per tema (EcoVadis, piattaforma di rating bancario tipo Synesgy, Open-es, questionari dei
 *   clienti) verso i datapoint del VS: solo temi e datapoint, nessun testo proprietario di domande.
 * PACK_REPORT_PMI: struttura del Documento «Il dialogo di sostenibilità tra PMI e banche» (40 voci in 5 sezioni) con la tavola
 *   di interoperabilità VSME del 22/12/2025 DA TRASCRIVERE: le voci restano vuote finché una persona non le trascrive dal testo
 *   pubblico e le importa (stato «da trascrivere», visibile).
 * PACK_REPORT_IRO: libreria di impatti, rischi e opportunità per l'analisi di materialità, filtrabile per settore
 *   (sectors: ['mangimi'] solo mangimifici, ['agrofarmaci'] solo agrofarmaci, entrambi quando vale per tutti).
 * Un pacchetto più recente importato (settings.esg18.packs[id]) prende il posto di quello integrato (esg-packs.js). */

const L = (it, en) => ({ it, en });
const T = (id, framework, theme, text, dpIds, extra = {}) => ({ id, framework, theme, text, dpIds, ...extra });

/** Raccordi per tema verso i datapoint del VS. */
export const PACK_REPORT = {
  pack: 'report', version: '2026.1', validAsOf: '2026-10-21',
  source: 'FeedOS: temi pubblici delle metodologie (EcoVadis: 4 temi; piattaforme di autovalutazione per rating bancari; Open-es) e richieste tipiche dei clienti della filiera; nessun testo proprietario.',
  items: [
    // EcoVadis: i 4 temi pubblici della metodologia (Environment, Labour & Human Rights, Ethics, Sustainable Procurement)
    T('ev-ambiente', 'ecovadis-temi', L('Ambiente', 'Environment'), L('Energia e gas serra, acqua, biodiversità, inquinamento, materiali e rifiuti: politiche, azioni, indicatori e certificazioni.', 'Energy and GHG, water, biodiversity, pollution, materials and waste: policies, actions, indicators and certifications.'),
      ['B2.climate', 'B3.mwh', 'B3.mwh-ren-el', 'B3.s1', 'B3.s2-lb', 'B6.withdrawal', 'B7.waste-haz', 'B7.waste-nonhaz', 'B7.diverted', 'B4.pollutants', 'C3.targets'], { status: 'verificato', evidence: 'politica ambientale, certificazioni ISO 14001 o 50001, registri di energia, acqua e rifiuti' }),
    T('ev-lavoro', 'ecovadis-temi', L('Lavoro e diritti umani', 'Labour and human rights'), L('Salute e sicurezza, condizioni di lavoro, dialogo sociale, formazione, diversità e diritti umani.', 'Health and safety, working conditions, social dialogue, training, diversity and human rights.'),
      ['B2.own-workforce', 'B8.by-contract', 'B8.by-gender', 'B9.recordable-rate', 'B9.fatalities', 'B10.ccnl', 'B10.training-h', 'B10.pay-gap', 'C6.code', 'C6.grievance', 'C7.own-incidents'], { status: 'verificato', evidence: 'documento di valutazione dei rischi, registro infortuni, piano di formazione, codice etico' }),
    T('ev-etica', 'ecovadis-temi', L('Etica', 'Ethics'), L('Anticorruzione, concorrenza leale, gestione responsabile delle informazioni.', 'Anti-corruption, fair competition, responsible information management.'),
      ['B2.business-conduct', 'B11.convictions', 'B11.fines', 'C2.description', 'C2.accountable'], { status: 'verificato', evidence: 'Modello 231, procedura anticorruzione, canale di segnalazione' }),
    T('ev-acquisti', 'ecovadis-temi', L('Acquisti sostenibili', 'Sustainable procurement'), L('Pratiche ambientali e sociali dei fornitori, codice di condotta, valutazioni e audit.', 'Suppliers’ environmental and social practices, code of conduct, assessments and audits.'),
      ['B2.value-chain-workers', 'C7.value-chain', 'C1.relationships'], { status: 'verificato', evidence: 'codice di condotta dei fornitori, questionari e audit dei fornitori' }),
    // Piattaforme di autovalutazione usate dalle banche (tipo CRIF Synesgy): struttura per pilastri ESG di FeedOS
    T('sy-generale', 'synesgy', L('Informazioni generali', 'General information'), L('Profilo, settore, dimensione, siti e certificazioni.', 'Profile, sector, size, sites and certifications.'),
      ['B1.legal-form', 'B1.nace', 'B1.turnover', 'B1.employees', 'B1.country', 'B1.sites-geo', 'B1.certifications'], { status: 'da verificare' }),
    T('sy-ambiente', 'synesgy', L('Ambiente', 'Environment'), L('Energia, emissioni, obiettivi, acqua, rifiuti, biodiversità.', 'Energy, emissions, targets, water, waste, biodiversity.'),
      ['B3.mwh', 'B3.mwh-ren-el', 'B3.s1', 'B3.s2-lb', 'B3.intensity', 'C3.targets', 'B6.withdrawal', 'B7.diverted', 'B5.sites-sensitive'], { status: 'da verificare' }),
    T('sy-sociale', 'synesgy', L('Sociale', 'Social'), L('Organico, contratti, sicurezza, formazione, parità.', 'Workforce, contracts, safety, training, equality.'),
      ['B8.by-contract', 'B8.by-gender', 'B9.recordable-rate', 'B10.training-h', 'B10.ccnl', 'C5.mgmt-ratio'], { status: 'da verificare' }),
    T('sy-governance', 'synesgy', L('Governance', 'Governance'), L('Organo di amministrazione, etica, anticorruzione, rischi climatici.', 'Governance body, ethics, anti-corruption, climate risks.'),
      ['C9.board-ratio', 'C6.code', 'B11.convictions', 'C4.hazards', 'C2.accountable'], { status: 'da verificare' }),
    // Open-es: quattro dimensioni (governance, persone, pianeta, prosperità)
    T('oe-governance', 'open-es', L('Governance', 'Governance'), L('Organo di governo, responsabilità sulla sostenibilità, etica.', 'Governance body, sustainability accountability, ethics.'),
      ['C9.board-ratio', 'C2.accountable', 'B11.convictions', 'C6.code'], { status: 'da verificare' }),
    T('oe-persone', 'open-es', L('Persone', 'People'), L('Organico, salute e sicurezza, formazione, parità.', 'Workforce, health and safety, training, equality.'),
      ['B8.by-gender', 'B9.recordable-rate', 'B9.fatalities', 'B10.training-h', 'B10.pay-gap'], { status: 'da verificare' }),
    T('oe-pianeta', 'open-es', L('Pianeta', 'Planet'), L('Emissioni, energia, acqua, rifiuti, biodiversità.', 'Emissions, energy, water, waste, biodiversity.'),
      ['B3.s1', 'B3.s2-lb', 'B3.mwh', 'B3.mwh-ren-el', 'B6.withdrawal', 'B7.diverted', 'C3.targets'], { status: 'da verificare' }),
    T('oe-prosperita', 'open-es', L('Prosperità', 'Prosperity'), L('Ricavi, occupazione, filiera e territorio.', 'Revenue, employment, supply chain and community.'),
      ['B1.turnover', 'B1.employees', 'C1.markets', 'C1.relationships'], { status: 'da verificare' }),
    // Questionari dei clienti della filiera (latterie, integratori, distribuzione): temi ricorrenti
    T('cl-inventario', 'cliente', L('Inventario GHG aziendale', 'Corporate GHG inventory'), L('Scope 1, Scope 2 e, se disponibile, Scope 3 con il metodo.', 'Scope 1, Scope 2 and, where available, Scope 3 with the method.'), ['B3.s1', 'B3.s2-lb', 'B3.s2-mb', 'B3.s3']),
    T('cl-obiettivi', 'cliente', L('Obiettivi climatici', 'Climate targets'), L('Obiettivi di riduzione, anno base, stato di validazione.', 'Reduction targets, base year, validation status.'), ['C3.targets', 'C3.actions']),
    T('cl-energia', 'cliente', L('Energia rinnovabile', 'Renewable energy'), L('Quota di elettricità rinnovabile e autoproduzione.', 'Share of renewable electricity and self-generation.'), ['B3.mwh-ren-el', 'B3.mwh-el']),
    T('cl-acqua-rifiuti', 'cliente', L('Acqua e rifiuti', 'Water and waste'), L('Prelievo idrico, rifiuti e recupero.', 'Water withdrawal, waste and recovery.'), ['B6.withdrawal', 'B7.waste-nonhaz', 'B7.diverted']),
    T('cl-diritti', 'cliente', L('Codice di condotta e diritti umani', 'Code of conduct and human rights'), L('Codice etico, politica sui diritti umani, reclami.', 'Code of ethics, human rights policy, grievances.'), ['C6.code', 'C6.coverage', 'C6.grievance']),
    T('cl-sicurezza', 'cliente', L('Sicurezza sul lavoro', 'Workplace safety'), L('Infortuni e tasso, decessi.', 'Accidents and rate, fatalities.'), ['B9.recordable', 'B9.recordable-rate', 'B9.fatalities']),
    T('cl-impronta', 'cliente', L('Impronta di prodotto', 'Product carbon footprint'), L('kg CO₂e per kg di prodotto, metodo e banca dati: va oltre il VS.', 'kg CO₂e per kg of product, method and database: beyond the VS.'), [], { beyondVs: true, sectors: ['mangimi', 'agrofarmaci'] }),
    T('cl-soia', 'cliente', L('Soia e deforestazione', 'Soy and deforestation'), L('Quota di soia senza deforestazione, schemi, riferimenti EUDR: va oltre il VS.', 'Share of deforestation-free soy, schemes, EUDR references: beyond the VS.'), [], { beyondVs: true, sectors: ['mangimi'] }),
    T('cl-sicurezza-prodotto', 'cliente', L('Sicurezza dei prodotti', 'Product safety'), L('Certificazioni di sicurezza dei mangimi, piano di controllo: va oltre il VS.', 'Feed-safety certifications, control plan: beyond the VS.'), [], { beyondVs: true, sectors: ['mangimi'] }),
  ],
};

/** Struttura del Documento PMI-Banche (versione finale 6/12/2024) e tavola di raccordo VSME del 22/12/2025: da trascrivere. */
export const PACK_REPORT_PMI = {
  pack: 'report-pmi-banche', version: '2026.0', validAsOf: '2026-10-21', status: 'da trascrivere',
  source: 'Tavolo per la finanza sostenibile (MEF, MASE, MIMIT, Banca d’Italia, Consob, IVASS, COVIP): «Il dialogo di sostenibilità tra PMI e banche», versione finale del 6/12/2024; tavola di interoperabilità con il VSME del 22/12/2025.',
  note: 'Il documento ha 40 voci in 5 sezioni. Il testo delle voci e la loro corrispondenza con il VS non sono riportati da FeedOS: vanno trascritti dal documento pubblico (modello CSV nella sezione Banche) e importati.',
  sections: [
    { id: 'generale', label: L('Informazioni generali', 'General information') },
    { id: 'clima', label: L('Clima', 'Climate') },
    { id: 'ambiente', label: L('Ambiente', 'Environment') },
    { id: 'sociale', label: L('Sociale', 'Social') },
    { id: 'governance', label: L('Governance', 'Governance') },
  ],
  items: Array.from({ length: 40 }, (_, i) => ({ id: `PB${String(i + 1).padStart(2, '0')}`, n: i + 1, section: null, text: null, dpIds: [], match: null, status: 'da trascrivere' })),
};

/** Temi ESRS (per la mappa dei temi materiali verso le informative del VS). */
export const ESRS_TOPICS = {
  E1: { label: L('Cambiamenti climatici', 'Climate change'), vs: ['B3', 'C3', 'C4'] },
  E2: { label: L('Inquinamento', 'Pollution'), vs: ['B4'] },
  E3: { label: L('Acque e risorse marine', 'Water and marine resources'), vs: ['B6'] },
  E4: { label: L('Biodiversità ed ecosistemi', 'Biodiversity and ecosystems'), vs: ['B5'] },
  E5: { label: L('Uso delle risorse ed economia circolare', 'Resource use and circular economy'), vs: ['B7'] },
  S1: { label: L('Forza lavoro propria', 'Own workforce'), vs: ['B8', 'B9', 'B10', 'C5', 'C6', 'C7'] },
  S2: { label: L('Lavoratori nella catena del valore', 'Workers in the value chain'), vs: ['C7'] },
  S3: { label: L('Comunità interessate', 'Affected communities'), vs: ['C7'] },
  S4: { label: L('Consumatori e utilizzatori finali', 'Consumers and end-users'), vs: ['C7'] },
  G1: { label: L('Condotta delle imprese', 'Business conduct'), vs: ['B11', 'C8'] },
};

const M = 'mangimi', A = 'agrofarmaci';
/* voce: id, tema ESRS, titolo, natura (impatto | rischio | opportunità), positivo (impatto positivo), effettivo o potenziale, orizzonte,
 * punteggi di base 1-5 (scale = gravità, scope = estensione, irr = irrimediabilità, lik = probabilità, mag = rilevanza finanziaria),
 * motivazione, settori. */
const I = (id, topic, title, kind, s, why, sectors, extra = {}) => ({ id, topic, title, kind, actual: s.actual !== false, horizon: s.h || 'medio',
  defaults: { scale: s.scale ?? 1, scope: s.scope ?? 1, irremediability: s.irr ?? 1, likelihood: s.lik ?? 3, magnitude: s.mag ?? 1 }, rationale: why, sectors, ...extra });

/** Libreria di impatti, rischi e opportunità (punteggi di base modificabili per ogni esercizio). */
export const PACK_REPORT_IRO = {
  pack: 'report-iro', version: '2026.1', validAsOf: '2026-10-21',
  source: 'FeedOS: libreria di partenza costruita su ESRS 1 (scala, estensione, irrimediabilità, probabilità; rilevanza finanziaria) e sulle pratiche del settore; i punteggi sono proposte da rivedere.',
  items: [
    I('iro-e1-materie', 'E1', L('Emissioni di Scope 3 dalle materie prime agricole, compreso il cambio d’uso del suolo', 'Scope 3 emissions from agricultural raw materials, including land-use change'), 'impatto',
      { scale: 5, scope: 4, irr: 4, lik: 5, mag: 3, h: 'breve' }, L('È di gran lunga la quota maggiore dell’impronta dei prodotti; i clienti la chiedono per i propri inventari.', 'By far the largest share of the product footprint; customers ask for it for their own inventories.'), [M]),
    I('iro-e1-stabilimento', 'E1', L('Emissioni dello stabilimento: vapore, elettricità, mezzi', 'Plant emissions: steam, electricity, vehicles'), 'impatto',
      { scale: 3, scope: 3, irr: 3, lik: 5, mag: 2, h: 'breve' }, L('Scope 1 e 2 sotto il controllo diretto dell’impresa.', 'Scope 1 and 2 under the direct control of the undertaking.'), [M, A]),
    I('iro-e1-ets2', 'E1', L('Costo del carbonio sui combustibili dal 2028 (ETS2)', 'Carbon cost on fuels from 2028 (ETS2)'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 4, mag: 3, actual: false, h: 'medio' }, L('Aumento del costo di GPL, gas e gasolio con il nuovo sistema di scambio.', 'Higher cost of LPG, gas and diesel under the new trading system.'), [M, A]),
    I('iro-e1-domanda', 'E1', L('Domanda di prodotti a bassa impronta da parte dei clienti della filiera', 'Demand for low-footprint products from value-chain customers'), 'opportunità',
      { scale: 2, scope: 2, irr: 1, lik: 4, mag: 4, actual: false, h: 'medio' }, L('Latterie e integratori chiedono riduzioni per tonnellata di mangime.', 'Dairies and integrators ask for reductions per tonne of feed.'), [M], { positive: true }),
    I('iro-e1-fisico-filiera', 'E1', L('Rischio fisico sulla disponibilità di cereali e soia (siccità, eventi estremi)', 'Physical risk on cereal and soy availability (drought, extreme events)'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 4, mag: 4, actual: false, h: 'medio' }, L('Raccolti ridotti e prezzi più volatili per le materie prime principali.', 'Lower harvests and more volatile prices for key raw materials.'), [M]),
    I('iro-e1-enterico', 'E1', L('Emissioni enteriche e delle deiezioni degli allevamenti clienti, influenzate dalla dieta', 'Enteric and manure emissions at customer farms, influenced by the diet'), 'impatto',
      { scale: 4, scope: 4, irr: 3, lik: 4, mag: 2, actual: false, h: 'medio' }, L('Scope 3 dei clienti; la formulazione può ridurle, ma restano fuori dai totali dell’impresa.', 'Customers’ Scope 3; formulation can reduce them, but they stay outside the undertaking’s totals.'), [M]),
    I('iro-e1-fotovoltaico', 'E1', L('Costo dell’energia e autoproduzione fotovoltaica', 'Energy cost and photovoltaic self-generation'), 'opportunità',
      { scale: 2, scope: 1, irr: 1, lik: 4, mag: 3, h: 'breve' }, L('Più autoconsumo riduce costo ed emissioni di Scope 2.', 'More self-consumption cuts cost and Scope 2 emissions.'), [M, A], { positive: true }),
    I('iro-e1-sito', 'E1', L('Rischi fisici del sito: allagamento, calore estremo', 'Physical risks at the site: flooding, extreme heat'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 2, mag: 3, actual: false, h: 'lungo' }, L('Danni agli impianti e fermi; legati alla polizza catastrofale obbligatoria.', 'Damage to equipment and downtime; linked to the mandatory catastrophe policy.'), [M, A]),
    I('iro-e2-polveri', 'E2', L('Emissioni di polveri dallo stabilimento', 'Dust emissions from the plant'), 'impatto',
      { scale: 2, scope: 2, irr: 2, lik: 5, mag: 1, h: 'breve' }, L('Punti di emissione autorizzati; limiti e campionamenti periodici.', 'Authorised emission points; limits and periodic sampling.'), [M, A]),
    I('iro-e2-azoto', 'E2', L('Escrezione di azoto e fosforo negli allevamenti (nitrati, ammoniaca)', 'Nitrogen and phosphorus excretion at farms (nitrates, ammonia)'), 'impatto',
      { scale: 4, scope: 4, irr: 3, lik: 5, mag: 2, h: 'breve' }, L('La proteina e il fosforo della dieta determinano l’escrezione; diete a basso tenore la riducono.', 'Dietary protein and phosphorus drive excretion; low-level diets reduce it.'), [M]),
    I('iro-e2-farmaci', 'E2', L('Mangimi medicati e resistenza agli antimicrobici', 'Medicated feed and antimicrobial resistance'), 'impatto',
      { scale: 4, scope: 4, irr: 4, lik: 3, mag: 2, actual: false, h: 'medio' }, L('Contaminazioni crociate e uso prudente degli antimicrobici.', 'Cross-contamination and prudent use of antimicrobials.'), [M]),
    I('iro-e3-prelievi', 'E3', L('Prelievi idrici dello stabilimento', 'Plant water withdrawals'), 'impatto',
      { scale: 2, scope: 1, irr: 2, lik: 5, mag: 1, h: 'breve' }, L('Acqua per il vapore e i servizi; volumi contenuti.', 'Water for steam and services; limited volumes.'), [M, A]),
    I('iro-e3-filiera', 'E3', L('Stress idrico nelle aree di coltivazione delle materie prime', 'Water stress in raw-material growing areas'), 'rischio',
      { scale: 3, scope: 3, irr: 3, lik: 3, mag: 3, actual: false, h: 'lungo' }, L('Disponibilità e prezzo delle colture irrigue.', 'Availability and price of irrigated crops.'), [M, A]),
    I('iro-e4-deforestazione', 'E4', L('Deforestazione e conversione legate a soia e palma', 'Deforestation and conversion linked to soy and palm'), 'impatto',
      { scale: 5, scope: 4, irr: 5, lik: 4, mag: 3, actual: false, h: 'breve' }, L('Rischio nella catena di fornitura della soia importata.', 'Risk in the imported soy supply chain.'), [M]),
    I('iro-e4-eudr', 'E4', L('Accesso al mercato e obblighi EUDR per soia e derivati', 'Market access and EUDR duties for soy and derivatives'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 4, mag: 4, actual: false, h: 'breve' }, L('Dal 30/12/2026 per le imprese grandi e medie: dichiarazioni di dovuta diligenza e prove per lotto.', 'From 30/12/2026 for large and medium undertakings: due-diligence statements and lot evidence.'), [M]),
    I('iro-e4-suolo', 'E4', L('Uso del suolo e impatti agricoli delle colture acquistate', 'Land use and agricultural impacts of purchased crops'), 'impatto',
      { scale: 3, scope: 3, irr: 2, lik: 5, mag: 1, h: 'medio' }, L('Occupazione di suolo per tonnellata di prodotto.', 'Land occupation per tonne of product.'), [M]),
    I('iro-e5-coprodotti', 'E5', L('Uso di coprodotti agroindustriali ed ex prodotti alimentari', 'Use of agro-industrial co-products and former foodstuffs'), 'opportunità',
      { scale: 3, scope: 3, irr: 1, lik: 4, mag: 3, h: 'breve' }, L('Valorizza residui di altre filiere e riduce l’impronta.', 'Adds value to residues from other chains and lowers the footprint.'), [M], { positive: true }),
    I('iro-e5-imballaggi', 'E5', L('Imballaggi dei prodotti in sacchi (regolamento imballaggi)', 'Packaging of bagged products (packaging regulation)'), 'rischio',
      { scale: 2, scope: 2, irr: 2, lik: 5, mag: 2, h: 'medio' }, L('Obblighi di registro, etichetta e contenuto riciclato.', 'Register, label and recycled-content duties.'), [M, A]),
    I('iro-e5-rifiuti', 'E5', L('Rifiuti dello stabilimento e recupero', 'Plant waste and recovery'), 'impatto',
      { scale: 2, scope: 1, irr: 1, lik: 5, mag: 1, h: 'breve' }, L('Imballaggi delle materie prime, filtri, spazzature.', 'Raw-material packaging, filters, sweepings.'), [M, A]),
    I('iro-e5-legumi', 'E5', L('Leguminose locali in sostituzione della soia importata', 'Local legumes replacing imported soy'), 'opportunità',
      { scale: 3, scope: 2, irr: 1, lik: 3, mag: 3, actual: false, h: 'lungo' }, L('Riduce dipendenza e impronta, con vincoli di formulazione.', 'Reduces dependence and footprint, within formulation limits.'), [M], { positive: true }),
    I('iro-s1-sicurezza', 'S1', L('Sicurezza dei lavoratori nello stabilimento: polveri esplosive, spazi confinati, macchine', 'Worker safety at the plant: explosive dust, confined spaces, machinery'), 'impatto',
      { scale: 5, scope: 2, irr: 5, lik: 4, mag: 3, actual: false, h: 'breve' }, L('Rischi gravi tipici di silos, presse e trasporti interni.', 'Severe risks typical of silos, presses and internal transport.'), [M, A]),
    I('iro-s1-condizioni', 'S1', L('Condizioni di lavoro, turni e lavoro stagionale', 'Working conditions, shifts and seasonal work'), 'impatto',
      { scale: 2, scope: 2, irr: 1, lik: 5, mag: 1, h: 'breve' }, L('Picchi di attività nei periodi di raccolta.', 'Activity peaks in harvest periods.'), [M, A]),
    I('iro-s1-competenze', 'S1', L('Formazione e competenze tecniche', 'Training and technical skills'), 'opportunità',
      { scale: 2, scope: 2, irr: 1, lik: 4, mag: 2, h: 'medio' }, L('Competenze per impianti più automatizzati.', 'Skills for more automated plants.'), [M, A], { positive: true }),
    I('iro-s1-parita', 'S1', L('Parità di genere e trasparenza retributiva', 'Gender equality and pay transparency'), 'impatto',
      { scale: 2, scope: 2, irr: 1, lik: 5, mag: 2, h: 'medio' }, L('Obblighi della legge sulla trasparenza retributiva.', 'Duties under the pay-transparency law.'), [M, A]),
    I('iro-s2-filiera', 'S2', L('Diritti dei lavoratori nella filiera agricola importata', 'Workers’ rights in the imported agricultural supply chain'), 'impatto',
      { scale: 4, scope: 3, irr: 4, lik: 3, mag: 2, actual: false, h: 'medio' }, L('Rischi di lavoro forzato o minorile nelle filiere extra UE.', 'Risks of forced or child labour in non-EU chains.'), [M]),
    I('iro-s3-traffico', 'S3', L('Traffico di mezzi pesanti, rumore e odori per la comunità locale', 'Heavy traffic, noise and odours for the local community'), 'impatto',
      { scale: 2, scope: 2, irr: 1, lik: 5, mag: 1, h: 'breve' }, L('Consegne e ritiri quotidiani.', 'Daily deliveries and collections.'), [M, A]),
    I('iro-s3-territorio', 'S3', L('Ruolo economico per gli allevamenti e le imprese del territorio', 'Economic role for local farms and businesses'), 'opportunità',
      { scale: 3, scope: 2, irr: 1, lik: 5, mag: 2, h: 'medio' }, L('Fornitore di riferimento per la zootecnia locale.', 'Reference supplier for local livestock farming.'), [M, A], { positive: true }),
    I('iro-s4-sicurezza', 'S4', L('Sicurezza dei mangimi: micotossine, diossine, contaminazioni crociate', 'Feed safety: mycotoxins, dioxins, cross-contamination'), 'rischio',
      { scale: 5, scope: 4, irr: 4, lik: 3, mag: 5, actual: false, h: 'breve' }, L('Un’allerta può fermare clienti e filiere del latte e della carne.', 'An alert can stop customers and dairy and meat chains.'), [M]),
    I('iro-s4-benessere', 'S4', L('Benessere e salute degli animali allevati', 'Welfare and health of farmed animals'), 'impatto',
      { scale: 3, scope: 3, irr: 2, lik: 4, mag: 2, actual: false, h: 'medio' }, L('La nutrizione influisce su salute e benessere.', 'Nutrition affects health and welfare.'), [M]),
    I('iro-s4-dichiarazioni', 'S4', L('Dichiarazioni ambientali sui prodotti (pratiche commerciali sleali)', 'Environmental claims on products (unfair commercial practices)'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 3, mag: 3, actual: false, h: 'breve' }, L('Vietate le dichiarazioni generiche o non dimostrate dal 27/09/2026.', 'Generic or unsubstantiated claims banned since 27/09/2026.'), [M, A]),
    I('iro-g1-prezzi', 'G1', L('Volatilità dei prezzi delle materie prime', 'Raw-material price volatility'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 5, mag: 5, h: 'breve' }, L('Le materie prime sono la voce principale del costo del prodotto.', 'Raw materials are the main item of product cost.'), [M, A]),
    I('iro-g1-clienti', 'G1', L('Concentrazione dei clienti e rischio di credito', 'Customer concentration and credit risk'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 3, mag: 3, h: 'medio' }, L('Pochi clienti grandi pesano su ricavi e incassi.', 'A few large customers weigh on revenue and collections.'), [M, A]),
    I('iro-g1-corruzione', 'G1', L('Corruzione e concorrenza leale', 'Corruption and fair competition'), 'impatto',
      { scale: 3, scope: 2, irr: 2, lik: 2, mag: 2, actual: false, h: 'medio' }, L('Presidiata dal Modello 231 e dal codice etico.', 'Covered by the 231 model and the code of ethics.'), [M, A]),
    I('iro-g1-fornitori', 'G1', L('Gestione dei fornitori e termini di pagamento', 'Supplier management and payment terms'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 3, mag: 2, h: 'medio' }, L('Continuità delle forniture e rapporti equi.', 'Continuity of supply and fair relationships.'), [M, A]),
    I('iro-g1-trasporti', 'E1', L('Trasporto su strada con flotta propria e vettori', 'Road transport with own fleet and carriers'), 'impatto',
      { scale: 2, scope: 2, irr: 2, lik: 5, mag: 2, h: 'breve' }, L('Gasolio dei mezzi di consegna e dei vettori.', 'Diesel for delivery vehicles and carriers.'), [M, A]),
    // seconda edizione (agrofarmaci): voci filtrate dal settore, non visibili al mangimificio
    I('iro-a-seveso', 'S3', L('Rischio di incidente rilevante (Seveso III)', 'Major-accident hazard (Seveso III)'), 'impatto',
      { scale: 5, scope: 4, irr: 5, lik: 2, mag: 4, actual: false, h: 'lungo' }, L('Stoccaggio di sostanze pericolose sopra le soglie.', 'Storage of hazardous substances above thresholds.'), [A]),
    I('iro-a-reach', 'S4', L('Classificazione, etichettatura e registrazione delle sostanze (REACH, CLP)', 'Classification, labelling and registration of substances (REACH, CLP)'), 'rischio',
      { scale: 1, scope: 1, irr: 1, lik: 4, mag: 4, h: 'breve' }, L('Obblighi su sostanze e miscele.', 'Duties on substances and mixtures.'), [A]),
    I('iro-a-adr', 'S3', L('Trasporto di merci pericolose (ADR)', 'Transport of dangerous goods (ADR)'), 'rischio',
      { scale: 4, scope: 3, irr: 4, lik: 2, mag: 3, actual: false, h: 'medio' }, L('Incidenti nel trasporto di prodotti classificati.', 'Accidents when transporting classified products.'), [A]),
    I('iro-a-acque', 'E4', L('Effetti dei prodotti fitosanitari su impollinatori e acque', 'Effects of plant-protection products on pollinators and water'), 'impatto',
      { scale: 4, scope: 4, irr: 3, lik: 3, mag: 3, actual: false, h: 'medio' }, L('Uso dei prodotti in campo da parte dei clienti.', 'Use of the products in the field by customers.'), [A]),
  ],
};
