/* FeedOS 16 · Questionario ESG per il settore mangimistico (struttura dei dati richiesti da CSRD/ESRS e VSME).
 * Le domande ricalcano lo schema del questionario usato nella tesi; le risposte restano nell'archivio locale
 * (d.survey) e alimentano gli indicatori del registro (campo kpi) e i KPI richiesti.
 * Tipi: yn (sì/no) · one (scelta singola) · many (scelta multipla) · num (numero) · text · grid (numeri per riga)
 *       auto (valore calcolato dai dati di FeedOS, nessuna risposta da dare).
 * when: la domanda compare solo se un'altra ha una certa risposta. suggest: valore proposto dai dati. */

export const SURVEY_SECTIONS = [
  {
    id: 'generale', pillar: 'G', icon: 'building', title: 'Informazioni generali', lead: 'Chi siete e che cosa producete.',
    questions: [
      { id: 'gen-emp', type: 'one', q: 'Numero di dipendenti', options: ['1-10', '11-50', '51-250', '>250'], suggest: 'empBand' },
      { id: 'gen-rev', type: 'auto', q: 'Fatturato annuo', auto: 'revenue', kpi: 'C1' },
      { id: 'gen-feed', type: 'many', q: 'Principali tipologie di mangimi prodotti', options: ['Bovini', 'Suini', 'Avicoli', 'Ovicaprini', 'Equini', 'Conigli', 'Acquacoltura', 'Pet food'] },
    ],
  },
  {
    id: 'materie', pillar: 'E', icon: 'wheat', title: 'Materie prime', lead: 'Quanto si consuma e da quali filiere arriva.',
    questions: [
      { id: 'mp-qty', type: 'auto', q: 'Consumo annuo delle principali materie prime', auto: 'rawMaterials' },
      { id: 'mp-cert', type: 'one', q: 'Quota delle materie prime da fornitori certificati', options: ['<25%', '25-50%', '51-75%', '>75%'], kpi: 'E14' },
      { id: 'mp-schemes', type: 'many', q: 'Materie prime con certificazione di sostenibilità', options: ['RTRS', 'ProTerra', 'ISCC', 'GMP+', 'Nessuna'], exclusive: 'Nessuna' },
    ],
  },
  {
    id: 'energia', pillar: 'E', icon: 'zap', title: 'Energia', lead: 'Elettricità e GPL arrivano dalle letture; aggiungi gli altri combustibili.',
    questions: [
      { id: 'en-auto', type: 'auto', q: 'Consumo energetico annuale (elettricità e GPL)', auto: 'energy', kpi: 'E1' },
      { id: 'en-gas', type: 'num', q: 'Gas naturale', unit: 'Smc/anno', decimals: 0, hint: 'Lascia vuoto se non usato: entra nello Scope 1.' },
      { id: 'en-diesel', type: 'num', q: 'Gasolio (mezzi interni, generatori)', unit: 'litri/anno', decimals: 0, hint: 'Entra nello Scope 1.' },
      { id: 'en-ren', type: 'many', q: 'Impianti per la produzione di energia rinnovabile', options: ['Fotovoltaico', 'Biogas', 'Cogenerazione', 'Nessuno'], exclusive: 'Nessuno', suggest: 'renewables' },
      { id: 'en-renpct', type: 'auto', q: 'Quota di energia elettrica da fonti rinnovabili', auto: 'renewablePct', kpi: 'E3' },
    ],
  },
  {
    id: 'emissioni', pillar: 'E', icon: 'cloud', title: 'Emissioni e clima', lead: 'Scope 1, 2 e 3 calcolati dai dati; obiettivi di riduzione.',
    questions: [
      { id: 'em-measure', type: 'yn', q: 'L’azienda misura le proprie emissioni di CO₂?', good: 'si' },
      { id: 'em-scopes', type: 'auto', q: 'Emissioni Scope 1, Scope 2 e Scope 3', auto: 'ghg' },
      { id: 'em-target', type: 'yn', q: 'Esistono obiettivi di riduzione delle emissioni?', good: 'si' },
      { id: 'em-target-desc', type: 'text', q: 'Descrivi gli obiettivi e le azioni', when: { q: 'em-target', is: 'si' }, placeholder: 'Es. fotovoltaico al 50% dell’elettricità entro il 2028' },
      { id: 'em-target-pct', type: 'num', q: 'Riduzione prevista', unit: '%', decimals: 0, when: { q: 'em-target', is: 'si' } },
      { id: 'em-target-year', type: 'num', q: 'Anno obiettivo', decimals: 0, plain: true, when: { q: 'em-target', is: 'si' } },
    ],
  },
  {
    id: 'acqua', pillar: 'E', icon: 'droplet', title: 'Acqua', lead: 'Il consumo arriva dal registro delle letture (scheda Acqua).',
    questions: [
      { id: 'wa-auto', type: 'auto', q: 'Consumo annuo di acqua', auto: 'water', kpi: 'E9' },
      { id: 'wa-src', type: 'many', q: 'Fonte di approvvigionamento', options: ['Acquedotto', 'Pozzo', 'Altro'], suggest: 'waterSources' },
      { id: 'wa-disch', type: 'yn', q: 'L’azienda monitora gli scarichi idrici?', good: 'si' },
      { id: 'wa-reuse', type: 'yn', q: 'Si recupera o riutilizza acqua (condense, acque piovane)?', good: 'si' },
    ],
  },
  {
    id: 'rifiuti', pillar: 'E', icon: 'recycle', title: 'Rifiuti e circolarità', lead: 'Quantità e recupero arrivano dal registro dei rifiuti (scheda Rifiuti).',
    questions: [
      { id: 'wt-auto', type: 'auto', q: 'Rifiuti prodotti e quota avviata a recupero', auto: 'waste', kpi: 'E10' },
      { id: 'wt-reduce', type: 'yn', q: 'Esistono programmi di riduzione degli sprechi produttivi?', good: 'si' },
      { id: 'wt-reduce-desc', type: 'text', q: 'Descrivi il programma', when: { q: 'wt-reduce', is: 'si' }, placeholder: 'Es. recupero delle spazzature di linea come materia prima per mangimi' },
    ],
  },
  {
    id: 'persone', pillar: 'S', icon: 'users', title: 'Persone', lead: 'Organico, parità di genere e turnover.',
    questions: [
      { id: 'pe-cat', type: 'grid', q: 'Numero di dipendenti per categoria', rows: ['Dirigenti', 'Quadri', 'Impiegati', 'Operai'], kpi: 'S1' },
      { id: 'pe-women', type: 'num', q: 'Donne sul totale dei dipendenti', unit: '%', decimals: 1 },
      { id: 'pe-women-mgmt', type: 'num', q: 'Donne in ruoli di responsabilità', unit: '%', decimals: 1, kpi: 'S7' },
      { id: 'pe-turnover', type: 'num', q: 'Turnover del personale', unit: '%', decimals: 1, kpi: 'S6' },
      { id: 'pe-gap', type: 'num', q: 'Divario retributivo di genere', unit: '%', decimals: 1, kpi: 'S5' },
    ],
  },
  {
    id: 'sicurezza', pillar: 'S', icon: 'helmet', title: 'Salute e sicurezza', lead: 'Infortuni, giornate perse e ore lavorate per gli indici.',
    questions: [
      { id: 'hs-inj', type: 'num', q: 'Infortuni registrati nell’ultimo anno', decimals: 0, kpi: 'S2' },
      { id: 'hs-days', type: 'num', q: 'Giornate perse per infortuni', decimals: 0, kpi: 'S3' },
      { id: 'hs-hours', type: 'num', q: 'Ore lavorate nell’anno', unit: 'h', decimals: 0, suggest: 'hours', hint: 'Servono per gli indici di frequenza e di gravità; se manca si stimano 1.720 h per addetto.' },
      { id: 'hs-iso', type: 'yn', q: 'È presente una certificazione ISO 45001?', good: 'si' },
    ],
  },
  {
    id: 'formazione', pillar: 'S', icon: 'book', title: 'Formazione', lead: 'Ore e temi della formazione.',
    questions: [
      { id: 'tr-hours', type: 'num', q: 'Ore medie di formazione per dipendente all’anno', unit: 'h', decimals: 1, kpi: 'S4' },
      { id: 'tr-topics', type: 'many', q: 'Tematiche trattate', options: ['Sicurezza', 'Ambiente', 'Qualità', 'Anticorruzione', 'Sostenibilità'] },
      { id: 'tr-ethics', type: 'num', q: 'Dipendenti formati su etica e compliance', unit: '%', decimals: 0, kpi: 'G8' },
    ],
  },
  {
    id: 'territorio', pillar: 'S', icon: 'heart', title: 'Territorio', lead: 'Iniziative sociali e rapporti con la comunità.',
    questions: [
      { id: 'te-init', type: 'yn', q: 'L’azienda sostiene iniziative sociali o territoriali?', good: 'si' },
      { id: 'te-desc', type: 'text', q: 'Descrivi le iniziative', when: { q: 'te-init', is: 'si' }, placeholder: 'Es. borse di studio con l’istituto agrario, sponsorizzazioni sportive' },
    ],
  },
  {
    id: 'governance', pillar: 'G', icon: 'landmark', title: 'Governance', lead: 'Organo amministrativo e responsabilità sulla sostenibilità.',
    questions: [
      { id: 'gv-board', type: 'yn', q: 'Esiste un Consiglio di Amministrazione?', good: 'si', kpi: 'G1' },
      { id: 'gv-board-n', type: 'num', q: 'Componenti del Consiglio', decimals: 0, when: { q: 'gv-board', is: 'si' } },
      { id: 'gv-board-w', type: 'num', q: 'di cui donne', decimals: 0, when: { q: 'gv-board', is: 'si' } },
      { id: 'gv-esg-lead', type: 'yn', q: 'È presente una figura responsabile della sostenibilità?', good: 'si', kpi: 'G12' },
      { id: 'gv-esg-role', type: 'text', q: 'Ruolo', when: { q: 'gv-esg-lead', is: 'si' }, placeholder: 'Es. responsabile qualità e sostenibilità' },
    ],
  },
  {
    id: 'etica', pillar: 'G', icon: 'scale', title: 'Etica e compliance', lead: 'Codice etico, Modello 231, anticorruzione, certificazioni.',
    questions: [
      { id: 'et-code', type: 'yn', q: 'L’azienda dispone di un Codice Etico?', good: 'si', kpi: 'G9' },
      { id: 'et-231', type: 'yn', q: 'L’azienda possiede un Modello Organizzativo 231?', good: 'si', kpi: 'G2' },
      { id: 'et-anticorr', type: 'yn', q: 'È presente una procedura anticorruzione formalizzata?', good: 'si', kpi: 'G3' },
      { id: 'et-cases', type: 'num', q: 'Episodi di corruzione o non conformità negli ultimi 3 anni', decimals: 0, kpi: 'G4' },
      { id: 'et-whistle', type: 'num', q: 'Segnalazioni whistleblowing ricevute nell’anno', decimals: 0 },
      { id: 'et-certs', type: 'many', q: 'Certificazioni possedute', options: ['ISO 9001', 'ISO 14001', 'ISO 22000', 'ISO 50001', 'GMP+', 'Biologico'], kpi: 'G5' },
    ],
  },
  {
    id: 'rischi', pillar: 'G', icon: 'shield', title: 'Gestione dei rischi', lead: 'Rischi ESG e climatici sulla filiera agricola.',
    questions: [
      { id: 'rk-esg', type: 'yn', q: 'L’azienda effettua una valutazione periodica dei rischi ESG?', good: 'si' },
      { id: 'rk-climate', type: 'yn', q: 'Sono stati identificati rischi climatici sulla filiera agricola?', good: 'si' },
      { id: 'rk-mitig', type: 'yn', q: 'Sono presenti piani di mitigazione?', good: 'si' },
    ],
  },
  {
    id: 'biodiversita', pillar: 'E', icon: 'sprout', title: 'Biodiversità', lead: 'Siti, materie prime a rischio deforestazione e iniziative.',
    questions: [
      { id: 'bd-protected', type: 'yn', q: 'Gli stabilimenti sono vicini ad aree protette o di valore naturalistico?' },
      { id: 'bd-area', type: 'text', q: 'Nome dell’area', when: { q: 'bd-protected', is: 'si' } },
      { id: 'bd-dist', type: 'num', q: 'Distanza dallo stabilimento', unit: 'km', decimals: 1, when: { q: 'bd-protected', is: 'si' } },
      { id: 'bd-assess', type: 'yn', q: 'È stata fatta una valutazione degli impatti sulla biodiversità?', good: 'si' },
      { id: 'bd-impacts', type: 'yn', q: 'Sono stati identificati impatti su habitat, fauna o flora locali?' },
      { id: 'bd-commod', type: 'many', q: 'Materie prime associate a rischio di deforestazione', options: ['Soia', 'Olio di palma', 'Mais', 'Cacao', 'Altre commodity', 'Nessuna'], exclusive: 'Nessuna', suggest: 'commodities' },
      { id: 'bd-trace', type: 'one', q: 'Tracciabilità di queste materie prime fino all’origine', options: ['Nessuna', 'Parziale', 'Completa'] },
      { id: 'bd-traced-pct', type: 'num', q: 'Materie prime completamente tracciate', unit: '%', decimals: 0 },
      { id: 'bd-soy', type: 'auto', q: 'Soia certificata «deforestation-free»', auto: 'soyDf', kpi: 'E15' },
      { id: 'bd-policy', type: 'yn', q: 'L’azienda ha una politica formalizzata sulla biodiversità?', good: 'si' },
      { id: 'bd-programs', type: 'many', q: 'Programmi o investimenti a favore della biodiversità', options: ['Ripristino habitat', 'Riforestazione', 'Agricoltura rigenerativa', 'Riduzione impatti agricoli', 'Tutela impollinatori', 'Nessuna iniziativa'], exclusive: 'Nessuna iniziativa' },
      { id: 'bd-target', type: 'yn', q: 'È stato definito un obiettivo quantitativo sulla biodiversità?', good: 'si' },
      { id: 'bd-ha', type: 'num', q: 'Ettari interessati da programmi di ripristino o compensazione', unit: 'ha', decimals: 1 },
    ],
  },
  {
    id: 'filiera', pillar: 'S', icon: 'truck', title: 'Filiera', lead: 'Fornitori, valutazioni ESG, audit e diritti umani.',
    questions: [
      { id: 'sc-n', type: 'num', q: 'Numero totale di fornitori attivi', decimals: 0, suggest: 'suppliers' },
      { id: 'sc-geo', type: 'auto', q: 'Acquisti per provenienza geografica', auto: 'supplierGeo', kpi: 'C10' },
      { id: 'sc-top80', type: 'num', q: 'Fornitori che fanno l’80% del volume degli acquisti', decimals: 0, suggest: 'top80' },
      { id: 'sc-qual', type: 'yn', q: 'Esiste una procedura di qualifica dei fornitori con criteri ESG?', good: 'si' },
      { id: 'sc-aspects', type: 'many', q: 'Aspetti valutati sui fornitori', options: ['Diritti umani', 'Condizioni di lavoro', 'Sicurezza', 'Emissioni GHG', 'Gestione ambientale', 'Benessere animale', 'Anticorruzione', 'Biodiversità'] },
      { id: 'sc-eval', type: 'num', q: 'Fornitori sottoposti a valutazione ESG', unit: '%', decimals: 0, kpi: 'G11' },
      { id: 'sc-spend', type: 'num', q: 'Spesa coperta da valutazioni ESG', unit: '%', decimals: 0 },
      { id: 'sc-audits', type: 'num', q: 'Audit presso i fornitori nell’ultimo anno', decimals: 0, kpi: 'G6' },
      { id: 'sc-nc', type: 'num', q: 'Non conformità ESG rilevate presso i fornitori', decimals: 0, kpi: 'G7' },
      { id: 'sc-coc', type: 'yn', q: 'È stato adottato un Codice di Condotta per i fornitori?', good: 'si', kpi: 'G10' },
      { id: 'sc-coc-pct', type: 'num', q: 'Fornitori che hanno sottoscritto il Codice', unit: '%', decimals: 0, when: { q: 'sc-coc', is: 'si' } },
      { id: 'sc-clauses', type: 'yn', q: 'I contratti con i fornitori includono clausole ESG?', good: 'si' },
      { id: 'sc-risk', type: 'many', q: 'Verifiche svolte sul rischio di', options: ['Lavoro minorile', 'Lavoro forzato', 'Discriminazione', 'Violazioni dei diritti umani', 'Corruzione'] },
      { id: 'sc-critical', type: 'yn', q: 'Sono state identificate materie prime ad alto rischio ESG?' },
      { id: 'sc-certreq', type: 'many', q: 'Certificazioni richieste ai fornitori delle commodity agricole', options: ['RTRS', 'ProTerra', 'ISCC', 'GMP+', 'FEFAC SSG'] },
      { id: 'sc-certpct', type: 'num', q: 'Fornitori certificati (RTRS, ISCC, GMP+…)', unit: '%', decimals: 0 },
      { id: 'sc-highrisk', type: 'num', q: 'Fornitori ad alto rischio monitorati', unit: '%', decimals: 0 },
    ],
  },
  {
    id: 'documenti', pillar: 'G', icon: 'folder', title: 'Documenti', lead: 'Che cosa è già pronto da allegare al report.',
    questions: [
      { id: 'doc-list', type: 'many', q: 'Documentazione disponibile', options: ['Visura camerale', 'Organigramma', 'Bilanci degli ultimi 3 anni', 'Certificazioni', 'Registro consumi energetici', 'Registro consumi idrici', 'Registro rifiuti', 'Inventario emissioni GHG', 'Codice Etico', 'Modello 231', 'Policy ESG'], suggest: 'documents' },
    ],
  },
];

export const SURVEY_QUESTIONS = SURVEY_SECTIONS.flatMap(s => s.questions.map(q => ({ ...q, section: s.id })));
export const QUESTION = Object.fromEntries(SURVEY_QUESTIONS.map(q => [q.id, q]));

/** Una domanda è visibile se non ha condizioni o se la condizione è soddisfatta. */
export function visible(q, answers = {}) { return !q.when || answers[q.when.q] === q.when.is; }

/** Risposta data? (le domande «auto» non chiedono nulla e non entrano nel conteggio). */
export function answered(q, v) {
  if (q.type === 'auto') return false;
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (q.type === 'grid') return Object.values(v || {}).some(x => x != null && x !== '');
  return true;
}
