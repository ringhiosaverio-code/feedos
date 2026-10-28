/* FeedOS 18 · Pacchetto di contenuti · Persone e sicurezza (pacchetto WP5): moltiplicatori degli indici, riferimenti di settore,
 * scadenze della trasparenza retributiva, rapporto biennale, aree della UNI/PdR 125 (solo nomi e pesi: i testi degli indicatori
 * sono della norma e non si copiano), INAIL OT23, periodicità della formazione obbligatoria. File di dati senza dipendenze.
 * Ogni voce ha fonte, stato («verificato» o «da verificare») e la data «valido al» del pacchetto; le voci di un solo settore
 * hanno sectors: ['mangimi'] o ['agrofarmaci'] (le altre valgono per entrambe le edizioni). */

export const PACK_PERSONE = {
  pack: 'persone',
  version: '2026.1',
  validAsOf: '2026-10-21',
  items: [
    /* ---------------- indici di sicurezza ---------------- */
    { id: 'idx-if', kind: 'indice', label: 'Indice di frequenza (IF)', multiplier: 1e6, unit: 'per 10⁶ h',
      formula: 'infortuni con almeno un giorno di assenza oltre quello dell’evento × 1.000.000 ÷ ore lavorate', law: 'UNI 7249:2007', source: 'UNI 7249:2007 «Statistiche degli infortuni sul lavoro»', status: 'verificato' },
    { id: 'idx-ig', kind: 'indice', label: 'Indice di gravità (IG)', multiplier: 1e3, unit: 'per 10³ h',
      formula: '(giornate perse + giornate convenzionali di invalidità permanente e decesso) × 1.000 ÷ ore lavorate', law: 'UNI 7249:2007', source: 'UNI 7249:2007', status: 'verificato' },
    { id: 'idx-fatal-days', kind: 'costante', label: 'Giornate convenzionali per un decesso', value: 7500, law: 'UNI 7249:2007', source: 'UNI 7249:2007, tabella delle giornate convenzionali', status: 'da verificare',
      note: 'Controllare il valore sulla copia della norma in uso; per l’invalidità permanente indicare le giornate convenzionali nel singolo evento.' },
    { id: 'idx-b9', kind: 'indice', label: 'Tasso di infortuni registrabili (VS B9)', multiplier: 2e5, unit: 'per 200.000 h',
      formula: 'infortuni sul lavoro registrabili × 200.000 ÷ ore lavorate dai dipendenti', law: 'Raccomandazione (UE) 2025/1710, VSME B9 · Reg. delegato (UE) 2026/1560', source: 'EFRAG VSME, dicembre 2024, paragrafo B9', status: 'verificato',
      note: '200.000 ore = 100 persone a tempo pieno per un anno di 50 settimane da 40 ore.' },
    { id: 'hours-fallback', kind: 'costante', label: 'Ore annue per ETP quando mancano le ore registrate', value: 1720, law: '—', source: 'Ipotesi di calcolo: 43 settimane × 40 ore', status: 'da verificare',
      note: 'Si usa solo per i mesi senza ore registrate; il dato risulta «stimato».' },

    /* ---------------- riferimenti di settore (stime derivate, nessun dato di aziende) ---------------- */
    { id: 'band-c10', kind: 'riferimento', sectors: ['mangimi'], label: 'Industria alimentare (ATECO C10): denunce di infortunio per milione di ore', lo: 14, hi: 17, unit: 'per 10⁶ h',
      source: 'Stima derivata da dati INAIL 2024 (11.281 denunce, circa 426.000 addetti, circa 1.600 h per addetto), via PuntoSicuro', url: 'https://www.puntosicuro.it/dati-statistiche-C-54/l-industria-alimentare-al-centro-dell-analisi-di-dati-inail-AR-25731/',
      status: 'da verificare', note: 'Stima derivata dalle denunce, non dagli infortuni riconosciuti: serve solo come ordine di grandezza.' },

    /* ---------------- trasparenza retributiva e parità ---------------- */
    { id: 'pt-250', kind: 'trasparenza', min: 250, max: null, firstReport: '2027-06-07', every: 'ogni anno', label: '250 dipendenti e oltre', law: 'D.Lgs. 7 maggio 2026, n. 96 (dir. (UE) 2023/970)',
      source: 'https://www.ecnews.it/lavoro/rapporto-di-lavoro/gestione-del-rapporto/gender-pay-gap-reporting-e-tutele-gli-adempimenti-previsti-dal-d-lgs-n-96-2026/', status: 'verificato' },
    { id: 'pt-150', kind: 'trasparenza', min: 150, max: 249, firstReport: '2027-06-07', every: 'poi ogni tre anni', label: 'da 150 a 249 dipendenti', law: 'D.Lgs. 96/2026',
      source: 'https://www.coverflex.com/it/blog/scadenze-della-trasparenza-salariale', status: 'da verificare', note: 'Una fonte indica il 7 gennaio 2027 per questa fascia.' },
    { id: 'pt-100', kind: 'trasparenza', min: 100, max: 149, firstReport: '2031-06-07', every: 'poi ogni tre anni', label: 'da 100 a 149 dipendenti', law: 'D.Lgs. 96/2026',
      source: 'https://www.coverflex.com/it/blog/scadenze-della-trasparenza-salariale', status: 'verificato' },
    { id: 'pt-info', kind: 'trasparenza', min: 0, max: 99, firstReport: null, every: null, label: 'meno di 100 dipendenti', law: 'D.Lgs. 96/2026',
      source: 'https://www.ecnews.it/lavoro/rapporto-di-lavoro/gestione-del-rapporto/gender-pay-gap-reporting-e-tutele-gli-adempimenti-previsti-dal-d-lgs-n-96-2026/', status: 'verificato',
      note: 'Nessuna relazione sul divario; valgono per tutti i datori di lavoro la retribuzione o la fascia prima dell’assunzione, il divieto di chiedere la retribuzione precedente e il diritto di informazione dei lavoratori (in vigore dal 7 giugno 2026).' },
    { id: 'pt-joint', kind: 'soglia', label: 'Valutazione congiunta delle retribuzioni', value: 5, unit: '%', law: 'D.Lgs. 96/2026 (art. 10 della dir. (UE) 2023/970)',
      source: 'https://www.dottrinalavoro.it/notizie-c/articolo-trasparenza-retributiva-tra-valutazione-congiunta-e-possibile-contenzioso', status: 'verificato',
      note: 'Per chi deve presentare la relazione: un divario medio di almeno il 5% in una categoria di lavoratori, non giustificato da criteri oggettivi e neutri e non corretto entro sei mesi, richiede la valutazione congiunta con le rappresentanze.' },
    { id: 'biennale', kind: 'biennale', min: 51, biennium: '2026-2027', due: '2028-04-30', label: 'Rapporto biennale sulla situazione del personale maschile e femminile', law: 'D.Lgs. 198/2006, art. 46',
      source: 'https://www.informazionefiscale.it/Rapporto-sul-personale-maschile-e-femminile-2026-scadenza-aziende', status: 'da verificare',
      note: 'Obbligatorio oltre 50 dipendenti. Il biennio 2024-2025 scadeva il 15/05/2026; la data del prossimo va confermata dal decreto.' },
    { id: 'pdr125', kind: 'pdr125', label: 'UNI/PdR 125:2022 · certificazione della parità di genere', threshold: 60, law: 'UNI/PdR 125:2022 · L. 162/2021',
      areas: [
        { id: 'cultura', label: 'Cultura e strategia', weight: 15 },
        { id: 'governance', label: 'Governance', weight: 15 },
        { id: 'processiHR', label: 'Processi HR', weight: 10 },
        { id: 'crescita', label: 'Opportunità di crescita e inclusione delle donne', weight: 20 },
        { id: 'equita', label: 'Equità remunerativa per genere', weight: 20 },
        { id: 'genitorialita', label: 'Tutela della genitorialità e conciliazione vita-lavoro', weight: 20 },
      ],
      benefits: 'Esonero contributivo dell’1% fino a 50.000 € l’anno (L. 162/2021) e punteggio premiale nelle gare pubbliche (D.Lgs. 36/2023).',
      source: 'https://www.assolombarda.it/servizi/lavoro-e-previdenza/informazioni/certificazione-parita-di-genere-esonero-contributivo-per-i-datori-di-lavoro', status: 'verificato',
      note: 'Qui si riportano solo i nomi delle aree e i pesi: i testi dei 33 indicatori sono nella prassi di riferimento UNI. La soglia per micro e piccole imprese può contare meno indicatori.' },

    /* ---------------- INAIL ---------------- */
    { id: 'ot23', kind: 'ot23', label: 'INAIL OT23: riduzione del tasso medio per interventi di prevenzione', due: '02-28', threshold: 100, law: 'Modulo OT23 INAIL dell’anno (interventi dell’anno precedente)',
      source: 'https://www.informazionefiscale.it/riduzione-premi-inail-aliquote-bonus-infortuni-novita', status: 'da verificare',
      note: 'Verificare sul modello INAIL dell’anno il punteggio minimo, i codici e i punti degli interventi e la documentazione richiesta.' },
    { id: 'ot23-reduction', kind: 'ot23', label: 'Riduzione del tasso per dimensione (lavoratori-anno)', law: 'Modulo OT23 INAIL', status: 'da verificare',
      bands: [{ max: 10, pct: 28 }, { max: 50, pct: 18 }, { max: 200, pct: 10 }, { max: null, pct: 5 }],
      source: 'Tabella delle riduzioni del modulo OT (valori storici: verificare quelli dell’anno)' },

    /* ---------------- formazione obbligatoria: periodicità di base dei corsi (si possono cambiare nel singolo corso) ---------------- */
    { id: 'tr-sicurezza', kind: 'formazione', topic: 'sicurezza', label: 'Formazione dei lavoratori (generale e specifica): aggiornamento', months: 60, law: 'D.Lgs. 81/2008, art. 37 · Accordo Stato-Regioni del 17/04/2025', source: 'Accordo Stato-Regioni 17 aprile 2025', status: 'da verificare' },
    { id: 'tr-preposti', kind: 'formazione', topic: 'preposti', label: 'Preposti: aggiornamento', months: 24, law: 'D.Lgs. 81/2008, art. 37 c. 7-ter · Accordo Stato-Regioni del 17/04/2025', source: 'Accordo Stato-Regioni 17 aprile 2025', status: 'da verificare' },
    { id: 'tr-carrelli', kind: 'formazione', topic: 'carrelli', label: 'Carrelli elevatori: aggiornamento', months: 60, law: 'D.Lgs. 81/2008, art. 73 · Accordo Stato-Regioni del 22/02/2012', source: 'Accordo Stato-Regioni 22 febbraio 2012', status: 'da verificare' },
    { id: 'tr-primo-soccorso', kind: 'formazione', topic: 'primo-soccorso', label: 'Addetti al primo soccorso: aggiornamento', months: 36, law: 'DM 388/2003, art. 3', source: 'DM 15 luglio 2003, n. 388', status: 'da verificare' },
    { id: 'tr-antincendio', kind: 'formazione', topic: 'antincendio', label: 'Addetti antincendio: aggiornamento', months: 60, law: 'DM 2 settembre 2021, allegato III', source: 'DM 2 settembre 2021', status: 'da verificare' },
    { id: 'tr-rls', kind: 'formazione', topic: 'RLS', label: 'Rappresentante dei lavoratori per la sicurezza: aggiornamento', months: 12, law: 'D.Lgs. 81/2008, art. 37 c. 11', source: 'D.Lgs. 81/2008', status: 'da verificare' },
    { id: 'tr-atex', kind: 'formazione', topic: 'ATEX', sectors: ['mangimi', 'agrofarmaci'], label: 'Atmosfere esplosive (polveri e vapori): aggiornamento', months: 36, law: 'D.Lgs. 81/2008, titolo XI', source: 'Periodicità fissata dal documento di valutazione dei rischi', status: 'da verificare' },
    { id: 'tr-spazi', kind: 'formazione', topic: 'spazi-confinati', label: 'Spazi confinati (silos, serbatoi): aggiornamento', months: 36, law: 'DPR 177/2011', source: 'Periodicità fissata dal documento di valutazione dei rischi', status: 'da verificare' },
    { id: 'tr-chimico', kind: 'formazione', topic: 'rischio-chimico', sectors: ['agrofarmaci'], label: 'Rischio chimico e schede di sicurezza: aggiornamento', months: 36, law: 'D.Lgs. 81/2008, titolo IX', source: 'Periodicità fissata dal documento di valutazione dei rischi', status: 'da verificare' },
    { id: 'tr-dpi', kind: 'formazione', topic: 'DPI-3', sectors: ['agrofarmaci'], label: 'DPI di terza categoria (protezione delle vie respiratorie): addestramento', months: 12, law: 'D.Lgs. 81/2008, art. 77 c. 5', source: 'D.Lgs. 81/2008', status: 'da verificare' },
    { id: 'tr-adr', kind: 'formazione', topic: 'ADR', sectors: ['agrofarmaci'], label: 'Merci pericolose su strada (ADR, capitolo 1.3): aggiornamento', months: 36, law: 'ADR 2025, capitolo 1.3', source: 'Accordo ADR: aggiornamento periodico secondo le modifiche delle regole', status: 'da verificare' },
    { id: 'tr-seveso', kind: 'formazione', topic: 'Seveso', sectors: ['agrofarmaci'], label: 'Seveso: informazione, formazione e addestramento sul piano di emergenza', months: 12, law: 'D.Lgs. 105/2015, art. 14 e allegato B', source: 'D.Lgs. 26 giugno 2015, n. 105', status: 'da verificare' },
  ],
};

/** Temi della formazione (registro). sectors assente = entrambe le edizioni. */
export const TRAINING_TOPICS = [
  { id: 'sicurezza', label: 'Sicurezza dei lavoratori' },
  { id: 'preposti', label: 'Preposti e dirigenti' },
  { id: 'carrelli', label: 'Carrelli elevatori' },
  { id: 'primo-soccorso', label: 'Primo soccorso' },
  { id: 'antincendio', label: 'Antincendio ed emergenze' },
  { id: 'RLS', label: 'RLS' },
  { id: 'ATEX', label: 'Atmosfere esplosive (ATEX)' },
  { id: 'spazi-confinati', label: 'Spazi confinati' },
  { id: 'rischio-chimico', label: 'Rischio chimico', sectors: ['agrofarmaci'] },
  { id: 'DPI-3', label: 'DPI di terza categoria', sectors: ['agrofarmaci'] },
  { id: 'ADR', label: 'Merci pericolose (ADR)', sectors: ['agrofarmaci'] },
  { id: 'Seveso', label: 'Seveso e piano di emergenza', sectors: ['agrofarmaci'] },
  { id: 'qualita', label: 'Qualità e sicurezza dei prodotti' },
  { id: '231', label: 'Modello 231 e codice etico' },
  { id: 'ESG', label: 'Sostenibilità (ESG)' },
  { id: 'tecnica', label: 'Competenze tecniche' },
  { id: 'altro', label: 'Altro' },
];

/** Categorie di causa degli eventi (neutre rispetto al settore; le ultime due tipiche delle sostanze chimiche). */
export const INJURY_CAUSES = ['macchine in movimento', 'urto o schiacciamento', 'scivolamento o caduta in piano', 'caduta dall’alto', 'movimentazione manuale', 'carrelli e mezzi', 'taglio', 'polveri o esplosione', 'sostanze chimiche', 'incendio', 'altro'];
export const INJURY_KINDS = ['infortunio', 'quasi-infortunio', 'malattia-professionale', 'in-itinere'];
export const CATEGORIES = ['dirigenti', 'quadri', 'impiegati', 'operai'];
export const CATEGORY_LABEL = { dirigenti: 'Dirigenti', quadri: 'Quadri', impiegati: 'Impiegati', operai: 'Operai' };
export const CONTRACTS = ['indeterminato', 'determinato', 'apprendistato'];
export const CONTRACT_LABEL = { indeterminato: 'Tempo indeterminato', determinato: 'Tempo determinato', apprendistato: 'Apprendistato' };
export const GENDERS = ['F', 'M', 'nd'];
export const GENDER_LABEL = { F: 'Donne', M: 'Uomini', nd: 'Non indicato' };
