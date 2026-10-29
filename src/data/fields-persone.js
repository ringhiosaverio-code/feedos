/* FeedOS 18 · Campi e importazioni · Persone e sicurezza (pacchetto WP5). File senza dipendenze.
 * FIELDS_PERSONE = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_PERSONE = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_PERSONE = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_PERSONE = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Dati pseudonimi: nessun nome di persona, nessun dato sanitario oltre a tipo di evento, giorni di assenza e categoria della causa.
 * Le righe dell'organico (genere × categoria × contratto) si modificano nella griglia della scheda Organico. */

const CATEGORIES = ['dirigenti', 'quadri', 'impiegati', 'operai'];
const KINDS = ['infortunio', 'quasi-infortunio', 'malattia-professionale', 'in-itinere'];
const CAUSES = ['macchine in movimento', 'urto o schiacciamento', 'scivolamento o caduta in piano', 'caduta dall’alto', 'movimentazione manuale', 'carrelli e mezzi', 'taglio', 'polveri o esplosione', 'sostanze chimiche', 'incendio', 'altro'];
const TOPICS = ['sicurezza', 'preposti', 'carrelli', 'primo-soccorso', 'antincendio', 'RLS', 'ATEX', 'spazi-confinati', 'rischio-chimico', 'DPI-3', 'ADR', 'Seveso', 'qualita', '231', 'ESG', 'tecnica', 'altro'];

export const FIELDS_PERSONE = {
  hrSnapshots: [
    { key: 'date', label: 'Data della fotografia', type: 'date', required: true },
    { key: 'country', label: 'Paese del contratto (codice ISO)', type: 'text', maxLen: 2 },
    { key: 'ccnl', label: 'Contratto collettivo applicato', type: 'text', maxLen: 120 },
    { key: 'ccnlCoveragePct', label: 'Dipendenti coperti da contratti collettivi %', type: 'number', min: 0, max: 100, decimals: 0 },
    { key: 'minWageOk', label: 'Retribuzioni pari o superiori ai minimi applicabili', type: 'bool' },
    { key: 'agency', label: 'Lavoratori somministrati', type: 'number', min: 0, decimals: 0 },
    { key: 'selfEmployed', label: 'Autonomi in esclusiva (senza dipendenti)', type: 'number', min: 0, decimals: 0 },
    { key: 'hiresF', label: 'Entrate nel periodo: donne', type: 'number', min: 0, decimals: 0 },
    { key: 'hiresM', label: 'Entrate nel periodo: uomini', type: 'number', min: 0, decimals: 0 },
    { key: 'leaversF', label: 'Uscite nel periodo: donne (senza scadenze dei contratti a termine)', type: 'number', min: 0, decimals: 0 },
    { key: 'leaversM', label: 'Uscite nel periodo: uomini (senza scadenze dei contratti a termine)', type: 'number', min: 0, decimals: 0 },
    { key: 'parentalF', label: 'Congedi parentali usati: donne', type: 'number', min: 0, decimals: 0 },
    { key: 'parentalM', label: 'Congedi parentali usati: uomini', type: 'number', min: 0, decimals: 0 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  hoursWorked: [
    { key: 'month', label: 'Mese', type: 'month', required: true },
    { key: 'hours', label: 'Ore lavorate dai dipendenti', type: 'number', min: 0, required: true, decimals: 0 },
    { key: 'overtime', label: 'di cui straordinari', type: 'number', min: 0, decimals: 0 },
    { key: 'agencyHours', label: 'Ore dei somministrati (a parte)', type: 'number', min: 0, decimals: 0 },
    { key: 'absenceHours', label: 'Ore di assenza', type: 'number', min: 0, decimals: 0 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  injuries: [
    { key: 'date', label: 'Data dell’evento', type: 'date', required: true },
    { key: 'kind', label: 'Tipo di evento', type: 'enum', options: KINDS, required: true },
    { key: 'lineId', label: 'Linea', type: 'ref', ref: 'lines' },
    { key: 'area', label: 'Reparto o zona', type: 'text', maxLen: 80 },
    { key: 'cause', label: 'Categoria della causa', type: 'enum', options: CAUSES },
    { key: 'recordable', label: 'Registrabile (cure oltre il primo soccorso, assenza o limitazioni)', type: 'bool' },
    { key: 'lostDays', label: 'Giorni di assenza (oltre quello dell’evento)', type: 'number', min: 0, decimals: 0 },
    { key: 'convDays', label: 'Giornate convenzionali di invalidità permanente', type: 'number', min: 0, decimals: 0 },
    { key: 'fatal', label: 'Decesso', type: 'bool' },
    { key: 'inailRef', label: 'Riferimento della denuncia INAIL', type: 'text', maxLen: 40 },
    { key: 'status', label: 'Stato', type: 'enum', options: ['aperto', 'chiuso'] },
    { key: 'note', label: 'Descrizione (senza nomi né dati sanitari)', type: 'text', maxLen: 300 },
  ],
  trainings: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'course', label: 'Corso', type: 'text', required: true, maxLen: 120 },
    { key: 'topic', label: 'Tema', type: 'enum', options: TOPICS, required: true },
    { key: 'hours', label: 'Durata (ore)', type: 'number', min: 0, max: 200, required: true, decimals: 1 },
    { key: 'partF', label: 'Partecipanti donne', type: 'number', min: 0, decimals: 0 },
    { key: 'partM', label: 'Partecipanti uomini', type: 'number', min: 0, decimals: 0 },
    { key: 'mandatory', label: 'Obbligatorio per legge', type: 'bool' },
    { key: 'validMonths', label: 'Validità (mesi)', type: 'number', min: 1, max: 120, decimals: 0 },
    { key: 'nextDue', label: 'Prossimo aggiornamento entro', type: 'date' },
    { key: 'series', label: 'Serie di corsi (per le scadenze)', type: 'text', maxLen: 60 },
    { key: 'provider', label: 'Ente formatore', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  payData: [
    { key: 'periodKey', label: 'Esercizio (chiave, es. 12m-2026-09)', type: 'text', required: true, maxLen: 20 },
    { key: 'code', label: 'Codice pseudonimo', type: 'text', required: true, maxLen: 20 },
    { key: 'gender', label: 'Genere', type: 'enum', options: ['F', 'M'], required: true },
    { key: 'category', label: 'Categoria', type: 'enum', options: CATEGORIES, required: true },
    { key: 'level', label: 'Livello del contratto', type: 'text', maxLen: 20 },
    { key: 'fte', label: 'ETP (1 = tempo pieno)', type: 'number', min: 0.05, max: 1.5, required: true, decimals: 2 },
    { key: 'baseAnnual', label: 'Retribuzione fissa annua lorda €', type: 'number', min: 0, required: true, decimals: 0 },
    { key: 'variableAnnual', label: 'Componenti variabili annue €', type: 'number', min: 0, decimals: 0 },
  ],
  pdr125: [
    { key: 'year', label: 'Anno', type: 'number', min: 2022, max: 2100, required: true, decimals: 0 },
    { key: 'certified', label: 'Certificata', type: 'bool' },
    { key: 'certBody', label: 'Organismo di certificazione', type: 'text', maxLen: 80 },
    { key: 'certExpiry', label: 'Certificato valido fino al', type: 'date' },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  ot23: [
    { key: 'year', label: 'Anno degli interventi', type: 'number', min: 2020, max: 2100, required: true, decimals: 0 },
    { key: 'submittedAt', label: 'Domanda presentata il', type: 'date' },
    { key: 'outcome', label: 'Esito', type: 'enum', options: ['in preparazione', 'presentata', 'accolta', 'respinta'] },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 300 },
  ],
  safetyActions: [
    { key: 'text', label: 'Azione', type: 'text', required: true, maxLen: 200 },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'due', label: 'Entro il', type: 'date' },
    { key: 'status', label: 'Stato', type: 'enum', options: ['aperta', 'in corso', 'chiusa'], required: true },
    { key: 'closedAt', label: 'Chiusa il', type: 'date' },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
};

export const COLL_LABEL_PERSONE = {
  hrSnapshots: 'Fotografie dell’organico', hoursWorked: 'Ore lavorate', injuries: 'Registro degli infortuni', trainings: 'Registro della formazione',
  payData: 'Retribuzioni pseudonime', pdr125: 'Autovalutazione UNI/PdR 125', ot23: 'Domande INAIL OT23', safetyActions: 'Azioni di sicurezza',
};

export const IMPORT_TYPES_PERSONE = {
  'ore-lavorate': { coll: 'hoursWorked', label: 'Ore lavorate per mese', key: ['month'],
    synonyms: { month: ['mese', 'periodo', 'competenza'], hours: ['ore', 'ore lavorate', 'ore ordinarie', 'totale ore'], overtime: ['straordinari', 'ore straordinarie'], agencyHours: ['ore somministrati', 'ore interinali'], absenceHours: ['assenze', 'ore assenza'], note: ['nota', 'note'] },
    defaults: {} },
  infortuni: { coll: 'injuries', label: 'Registro degli infortuni', key: ['date', 'kind', 'inailRef'], altKey: ['date', 'kind'],
    synonyms: { date: ['data', 'data evento', 'data infortunio'], kind: ['tipo', 'tipo evento'], area: ['reparto', 'zona', 'area'], cause: ['causa', 'categoria causa'], recordable: ['registrabile'], lostDays: ['giorni', 'giorni assenza', 'giorni persi', 'prognosi'],
      convDays: ['giornate convenzionali'], fatal: ['decesso', 'mortale'], inailRef: ['denuncia', 'n denuncia', 'riferimento inail'], status: ['stato'], note: ['descrizione', 'nota'] },
    defaults: { kind: 'infortunio', status: 'chiuso', fatal: false } },
  formazione: { coll: 'trainings', label: 'Registro della formazione', key: ['date', 'course'],
    synonyms: { date: ['data', 'data corso'], course: ['corso', 'titolo', 'argomento'], topic: ['tema', 'area'], hours: ['ore', 'durata', 'durata ore'], partF: ['donne', 'partecipanti donne'], partM: ['uomini', 'partecipanti uomini'], mandatory: ['obbligatorio'],
      validMonths: ['validita', 'validita mesi'], nextDue: ['scadenza', 'prossimo aggiornamento'], series: ['serie'], provider: ['ente', 'docente', 'formatore'], note: ['nota'] },
    defaults: { mandatory: false, topic: 'altro', partF: 0, partM: 0 } },
  retribuzioni: { coll: 'payData', label: 'Retribuzioni pseudonime', key: ['periodKey', 'code'],
    synonyms: { periodKey: ['esercizio', 'periodo'], code: ['codice', 'matricola pseudonima', 'id'], gender: ['genere', 'sesso'], category: ['categoria', 'qualifica'], level: ['livello'], fte: ['etp', 'fte', 'percentuale part time'], baseAnnual: ['fisso', 'retribuzione fissa', 'ral'], variableAnnual: ['variabile', 'premi', 'componenti variabili'] },
    defaults: { variableAnnual: 0 } },
};

export const IMPORT_DESC_PERSONE = {
  'ore-lavorate': 'Ore lavorate dai dipendenti per mese (dal libro unico del lavoro o dalla rilevazione presenze): ore, straordinari, ore dei somministrati e assenze. Sono la base degli indici di frequenza, di gravità e del tasso del VS B9.',
  infortuni: 'Eventi del registro: data, tipo (infortunio, quasi-infortunio, malattia-professionale, in-itinere), reparto, categoria della causa, registrabile, giorni di assenza, decesso, riferimento della denuncia. Senza nomi né dati sanitari.',
  formazione: 'Sessioni di formazione: data, corso, tema, durata, partecipanti per genere, obbligatorio, validità o prossimo aggiornamento. Alimenta le ore per dipendente del VS B10 e le scadenze.',
  retribuzioni: 'Retribuzioni pseudonime per il divario di genere: esercizio, codice (mai il nome), genere, categoria, livello, ETP, fisso e variabile annui. I gruppi con meno di 5 persone non vengono mostrati.',
};
