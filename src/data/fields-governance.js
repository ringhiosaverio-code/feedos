/* FeedOS 18 · Campi e importazioni · Governance ed evidenze (pacchetto WP6). File senza dipendenze.
 * FIELDS_GOVERNANCE = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_GOVERNANCE = { raccolta: 'Nome italiano' }
 * · IMPORT_TYPES_GOVERNANCE = { tipo: {coll, label, key, altKey?, synonyms, defaults} } come TYPES in core/importers.js
 * · IMPORT_DESC_GOVERNANCE = { tipo: 'testo di aiuto' }. Il registro li unisce a quelli di base.
 * Testi neutri rispetto al settore («prodotti», «stabilimento»): le stesse raccolte servono a FeedOS e a DifesaOS.
 * Le segnalazioni (whistleblowing) sono solo conteggi annuali: FeedOS non è un canale di segnalazione. */

/** Temi delle politiche (corrispondono ai temi del B2 del VS). */
export const POLICY_MATTERS = ['clima', 'inquinamento', 'acqua', 'biodiversita', 'circolarita', 'lavoratori', 'filiera', 'comunita', 'consumatori', 'condotta'];
export const POLICY_KINDS = ['pratica', 'politica', 'iniziativa'];
export const POLICY_STATUS = ['bozza', 'approvata', 'ritirata'];
/** Temi dei diritti umani coperti da un codice o da una politica (C6 del VS). */
export const C6_TOPICS = ['lavoro minorile', 'lavoro forzato', 'tratta', 'discriminazione', 'prevenzione infortuni'];
export const GENDERS = ['donna', 'uomo', 'altro'];
export const CERT_SCHEMES = ['ISO 9001', 'ISO 14001', 'ISO 45001', 'ISO 50001', 'EMAS', 'GMP+ FC', 'FAMI-QS', 'RTRS CoC', 'ProTerra CoC', 'Biologico', 'UNI/PdR 125', 'Rating di legalità', 'EcoVadis', 'Consulente ADR', 'altro'];
export const PERMIT_KINDS = ['AUA', 'AIA', 'scarico', 'concessione pozzo', 'CPI', 'riconoscimento mangimi', 'autorizzazione fitosanitari', 'Seveso', 'altro'];
export const M231_OUTCOMES = ['efficace', 'da migliorare', 'non efficace', 'non testato'];
export const CASE_KINDS = ['corruzione', 'ambientale', 'sicurezza', 'diritti-umani', 'privacy', 'concorrenza'];
export const CASE_SCOPES = ['impresa', 'forza lavoro propria', 'catena del valore', 'comunità', 'consumatori'];
export const CASE_STATUS = ['aperto', 'chiuso', 'archiviato'];
export const EVIDENCE_KINDS = ['fattura', 'FIR', 'certificato', 'politica', 'verbale', 'analisi', 'contratto', 'DDS', 'GeoJSON', 'foto', 'altro'];
export const CLAIM_CHANNELS = ['etichetta', 'scheda tecnica', 'sito', 'offerta', 'passaporto', 'lettera'];
export const CLAIM_STATUS = ['bozza', 'verificato', 'pubblicato', 'ritirato'];
export const ITEM_STATUS = ['aperto', 'fatto', 'non applicabile'];

export const FIELDS_GOVERNANCE = {
  policies: [
    { key: 'title', label: 'Titolo', type: 'text', required: true, maxLen: 120 },
    { key: 'matter', label: 'Tema', type: 'enum', options: POLICY_MATTERS, required: true },
    { key: 'kind', label: 'Tipo', type: 'enum', options: POLICY_KINDS, required: true },
    { key: 'status', label: 'Stato', type: 'enum', options: POLICY_STATUS },
    { key: 'public', label: 'Pubblica (sul sito o consegnata a chi la chiede)', type: 'bool' },
    { key: 'hasTarget', label: 'Ha un obiettivo misurabile', type: 'bool' },
    { key: 'target', label: 'Obiettivo', type: 'text', maxLen: 200 },
    { key: 'approvedAt', label: 'Approvata il', type: 'date' },
    { key: 'approver', label: 'Approvata da', type: 'text', maxLen: 80 },
    { key: 'reviewMonths', label: 'Riesame ogni (mesi)', type: 'number', min: 1, max: 60, decimals: 0 },
    { key: 'seniorAccountable', label: 'Responsabile di livello più alto', type: 'text', maxLen: 80 },
    { key: 'description', label: 'Descrizione (per il C2 del VS)', type: 'text', maxLen: 600 },
  ],
  boardMembers: [
    { key: 'role', label: 'Ruolo (senza nome)', type: 'text', required: true, maxLen: 80 },
    { key: 'gender', label: 'Genere', type: 'enum', options: GENDERS, required: true },
    { key: 'executive', label: 'Esecutivo', type: 'bool' },
    { key: 'independent', label: 'Indipendente', type: 'bool' },
    { key: 'esgSkill', label: 'Competenze di sostenibilità', type: 'bool' },
    { key: 'since', label: 'In carica dal', type: 'date' },
    { key: 'until', label: 'Fino al', type: 'date' },
  ],
  esgRoles: [
    { key: 'area', label: 'Ambito', type: 'text', required: true, maxLen: 80 },
    { key: 'responsible', label: 'Prepara i dati (R)', type: 'text', maxLen: 80 },
    { key: 'reviewer', label: 'Rivede (C)', type: 'text', maxLen: 80 },
    { key: 'approver', label: 'Approva (A)', type: 'text', maxLen: 80 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 200 },
  ],
  complianceItems: [
    { key: 'title', label: 'Adempimento', type: 'text', required: true, maxLen: 160 },
    { key: 'law', label: 'Norma', type: 'text', maxLen: 160 },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'due', label: 'Prossima scadenza', type: 'date' },
    { key: 'recurrenceMonths', label: 'Si ripete ogni (mesi, vuoto = una volta)', type: 'number', min: 1, max: 120, decimals: 0 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  companyCerts: [
    { key: 'scheme', label: 'Schema', type: 'enum', options: CERT_SCHEMES, required: true },
    { key: 'issuer', label: 'Ente', type: 'text', maxLen: 80 },
    { key: 'number', label: 'Numero', type: 'text', maxLen: 40 },
    { key: 'scope', label: 'Campo di applicazione', type: 'text', maxLen: 160 },
    { key: 'from', label: 'Valido dal', type: 'date' },
    { key: 'to', label: 'Valido fino al', type: 'date' },
    { key: 'score', label: 'Punteggio (se previsto)', type: 'number', min: 0, max: 100, decimals: 0 },
  ],
  permits: [
    { key: 'kind', label: 'Tipo', type: 'enum', options: PERMIT_KINDS, required: true },
    { key: 'authority', label: 'Autorità', type: 'text', maxLen: 80 },
    { key: 'number', label: 'Numero o protocollo', type: 'text', maxLen: 40 },
    { key: 'from', label: 'Rilasciato il', type: 'date' },
    { key: 'to', label: 'Scade il', type: 'date' },
    { key: 'conditionsText', label: 'Prescrizioni principali', type: 'text', maxLen: 300 },
  ],
  m231Controls: [
    { key: 'area', label: 'Area a rischio', type: 'text', required: true, maxLen: 80 },
    { key: 'risk', label: 'Reato o rischio', type: 'text', maxLen: 120 },
    { key: 'control', label: 'Controllo', type: 'text', required: true, maxLen: 200 },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'lastTest', label: 'Ultima verifica', type: 'date' },
    { key: 'outcome', label: 'Esito', type: 'enum', options: M231_OUTCOMES },
    { key: 'testMonths', label: 'Verifica ogni (mesi)', type: 'number', min: 1, max: 36, decimals: 0 },
  ],
  odvReports: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'period', label: 'Periodo', type: 'text', maxLen: 40 },
    { key: 'summary', label: 'Sintesi', type: 'text', maxLen: 400 },
    { key: 'findings', label: 'Rilievi', type: 'number', min: 0, decimals: 0 },
  ],
  whistleStats: [
    { key: 'year', label: 'Anno', type: 'number', required: true, min: 2023, max: 2100, decimals: 0 },
    { key: 'received', label: 'Segnalazioni ricevute', type: 'number', min: 0, decimals: 0 },
    { key: 'acknowledged7d', label: 'Con avviso di ricevimento entro 7 giorni', type: 'number', min: 0, decimals: 0 },
    { key: 'feedback3m', label: 'Con riscontro entro 3 mesi', type: 'number', min: 0, decimals: 0 },
    { key: 'substantiated', label: 'Fondate', type: 'number', min: 0, decimals: 0 },
    { key: 'retaliation', label: 'Casi di ritorsione', type: 'number', min: 0, decimals: 0 },
  ],
  legalCases: [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'kind', label: 'Materia', type: 'enum', options: CASE_KINDS, required: true },
    { key: 'scope', label: 'Chi riguarda', type: 'enum', options: CASE_SCOPES },
    { key: 'description', label: 'Descrizione', type: 'text', maxLen: 300 },
    { key: 'authority', label: 'Autorità', type: 'text', maxLen: 80 },
    { key: 'conviction', label: 'Condanna o fatto confermato', type: 'bool' },
    { key: 'fineEur', label: 'Sanzione (€)', type: 'number', min: 0, decimals: 0 },
    { key: 'status', label: 'Stato', type: 'enum', options: CASE_STATUS },
  ],
  evidence: [
    { key: 'title', label: 'Titolo', type: 'text', required: true, maxLen: 160 },
    { key: 'kind', label: 'Tipo', type: 'enum', options: EVIDENCE_KINDS, required: true },
    { key: 'issuer', label: 'Emesso da', type: 'text', maxLen: 80 },
    { key: 'issuedAt', label: 'Data del documento', type: 'date' },
    { key: 'expiresAt', label: 'Scade il', type: 'date' },
    { key: 'path', label: 'Dove si trova (percorso o archivio)', type: 'text', maxLen: 200 },
    { key: 'note', label: 'Nota', type: 'text', maxLen: 240 },
  ],
  claims: [
    { key: 'text', label: 'Testo della dichiarazione', type: 'text', required: true, maxLen: 400 },
    { key: 'channel', label: 'Dove compare', type: 'enum', options: CLAIM_CHANNELS, required: true },
    { key: 'productId', label: 'Prodotto', type: 'ref', ref: 'products' },
    { key: 'status', label: 'Stato', type: 'enum', options: CLAIM_STATUS },
    { key: 'owner', label: 'Responsabile', type: 'text', maxLen: 80 },
    { key: 'reviewAt', label: 'Da rivedere entro', type: 'date' },
  ],
};

export const COLL_LABEL_GOVERNANCE = {
  policies: 'Politiche e pratiche', boardMembers: 'Organo amministrativo', esgRoles: 'Ruoli ESG', complianceItems: 'Adempimenti', companyCerts: 'Certificazioni dell’azienda',
  permits: 'Autorizzazioni e permessi', m231Controls: 'Controlli del Modello 231', odvReports: 'Relazioni dell’Organismo di vigilanza', whistleStats: 'Segnalazioni (conteggi)',
  legalCases: 'Procedimenti e sanzioni', evidence: 'Evidenze', claims: 'Dichiarazioni ambientali',
};

export const IMPORT_TYPES_GOVERNANCE = {
  politiche: { coll: 'policies', label: 'Politiche e pratiche ESG', key: ['title'],
    synonyms: { title: ['titolo', 'politica', 'nome', 'documento'], matter: ['tema', 'argomento', 'materia'], kind: ['tipo'], status: ['stato'], public: ['pubblica', 'pubblicata'],
      hasTarget: ['obiettivo misurabile', 'con obiettivo'], target: ['obiettivo', 'target'], approvedAt: ['approvata il', 'data approvazione', 'approvazione'], approver: ['approvata da', 'approvatore'],
      reviewMonths: ['riesame mesi', 'revisione mesi', 'riesame'], seniorAccountable: ['responsabile', 'responsabile di vertice'], description: ['descrizione', 'contenuto'] },
    defaults: { status: 'approvata', kind: 'politica', public: false, hasTarget: false, reviewMonths: 24, covers: [] } },
  'certificati-azienda': { coll: 'companyCerts', label: 'Certificazioni dell’azienda', key: ['scheme', 'number'], altKey: ['scheme'],
    synonyms: { scheme: ['schema', 'certificazione', 'norma', 'standard'], issuer: ['ente', 'organismo', 'ente di certificazione'], number: ['numero', 'n certificato', 'numero certificato'],
      scope: ['campo di applicazione', 'scopo'], from: ['valido dal', 'emissione', 'data emissione'], to: ['valido fino al', 'scadenza', 'data scadenza'], score: ['punteggio', 'score'] },
    defaults: {} },
  permessi: { coll: 'permits', label: 'Autorizzazioni e permessi', key: ['kind', 'number'], altKey: ['kind'],
    synonyms: { kind: ['tipo', 'autorizzazione', 'permesso'], authority: ['autorita', 'ente', 'rilasciata da'], number: ['numero', 'protocollo', 'n atto'], from: ['rilasciata il', 'data rilascio', 'dal'],
      to: ['scadenza', 'scade il', 'valida fino al'], conditionsText: ['prescrizioni', 'condizioni'] },
    defaults: { conditions: [] } },
  evidenze: { coll: 'evidence', label: 'Evidenze (solo metadati)', key: ['sha256'], altKey: ['title'],
    synonyms: { title: ['titolo', 'documento', 'nome file', 'file'], kind: ['tipo', 'categoria'], issuer: ['emesso da', 'emittente', 'ente'], issuedAt: ['data', 'data documento', 'emesso il'],
      expiresAt: ['scadenza', 'scade il', 'valido fino al'], sha256: ['sha256', 'sha-256', 'impronta', 'hash'], path: ['percorso', 'posizione', 'cartella'], note: ['nota', 'note'] },
    defaults: { storage: 'percorso', links: [], addedBy: 'importazione' } },
};

export const IMPORT_DESC_GOVERNANCE = {
  politiche: 'Elenco delle politiche, pratiche e iniziative ESG: titolo, tema (clima, inquinamento, acqua, biodiversita, circolarita, lavoratori, filiera, comunita, consumatori, condotta), tipo, data di approvazione, chi l’ha approvata e se è pubblica. Alimenta la matrice B2 e il C2 del VS.',
  'certificati-azienda': 'Certificazioni dello stabilimento (ISO, schemi di settore, biologico, rating): schema, ente, numero, validità e punteggio. Le scadenze entrano nel calendario degli adempimenti.',
  permessi: 'Autorizzazioni (AUA, AIA, scarichi, pozzi, prevenzione incendi, riconoscimenti): autorità, numero, rilascio e scadenza. Le domande di rinnovo entrano nel calendario con l’anticipo previsto.',
  evidenze: 'Indice di documenti già archiviati altrove (percorso di rete o archivio documentale) con la loro impronta SHA-256: i file non si caricano, si registrano i metadati per collegarli ai datapoint.',
};
