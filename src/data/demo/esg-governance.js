/* FeedOS 18 · Dati dimostrativi · Governance ed evidenze (pacchetto WP6, seme 1401). Dati INVENTATI.
 * Contratto: demoGovernance(d, { today, R }) → { add, settings }, solo aggiunte, idempotente (se il registro esiste già restituisce {}),
 * deterministico (R = rng del seme + offset, nessun orologio: tutte le date sono relative a oggi del demo); impostazioni solo in
 * settings.esg18.governance. Due edizioni con lo stesso estensore: sectorOf(d) sceglie i contenuti.
 * Mangimificio di Valle Verde (FeedOS): 12 politiche (una in bozza: «politica soia responsabile»), CdA di 3 (1 donna, come nel
 * questionario), Modello 231 del 2023 con 2 relazioni dell'OdV e nessuna segnalazione, ISO 9001, GMP+ FC (in scadenza tra circa
 * 75 giorni) e biologico, AUA del 2019, CPI e concessione del pozzo, 25 evidenze con impronta di un testo segnaposto (nessun file),
 * 4 dichiarazioni (due bocciate in bozza), adempimenti con lo storico dei completamenti (uno in ritardo, nessuno scaduto).
 * Azienda di agrofarmaci «Arvale Dimostrativa» (DifesaOS): stesse raccolte con obblighi Seveso, ADR, REACH/CLP, registrazioni e
 * rame; registrazioni e schede di sicurezza restano nell'area Regolatorio (qui solo i collegamenti). Nessuna parola del mangimificio. */
import { addDays, addMonths, rng } from '../../core/util.js';
import { sha256HexSync } from '../../core/hash.js';
import { sectorOf } from '../../engine/esg-years.js';
import { governanceProfile, obligationApplies } from '../../engine/esg-governance.js';
import { PACK_GOVERNANCE } from '../pack-governance.js';

const ALL6 = ['lavoro minorile', 'lavoro forzato', 'tratta', 'discriminazione', 'prevenzione infortuni'];
const OWNERS = {
  Qualità: 'Resp. qualità', Direzione: 'Amministratore delegato', RSPP: 'RSPP (consulente esterno)', Amministrazione: 'Resp. amministrazione', 'Risorse umane': 'Ufficio del personale',
  Commerciale: 'Direttore commerciale', Acquisti: 'Resp. acquisti', Manutenzione: 'Resp. manutenzione', 'Organismo di vigilanza': 'Organismo di vigilanza', Regolatorio: 'Resp. regolatorio', Logistica: 'Consulente ADR (esterno)',
};
/* giorni da oggi alla prossima scadenza delle ricorrenze a intervalli (lo storico si ricava all'indietro) */
const NEXT_IN = { dvr: 24, whistleblowing: 236, 'odv-relazione': 118, 'feed-haccp': 95, 'aua-campionamenti': 203, 'seveso-ppir': 410, 'seveso-pei': 296, 'seveso-rapporto': 980 };
/* evidenze per completamento (id dell'adempimento → evidenze) */
const DONE_EV = { mud: ['ev-11'], 'odv-relazione': ['ev-21'], dvr: ['ev-23'], whistleblowing: ['ev-20'], ecgt: ['ev-24'] };

/* ---------------- contenuti per settore ---------------- */
function feedContent(t, co) {
  const y = +t.slice(0, 4);
  const policies = [
    ['pol-codice-etico', 'Codice etico', 'condotta', 'politica', true, false, '', -1290, 'Consiglio di amministrazione', 24, 'Presidente del CdA', ALL6.filter(x => x !== 'tratta'), 'ev-04', 'Principi di comportamento verso dipendenti, clienti, fornitori e pubblica amministrazione; parte del Modello 231.'],
    ['pol-anticorruzione', 'Politica anticorruzione', 'condotta', 'politica', false, false, '', -1270, 'Consiglio di amministrazione', 24, 'Amministratore delegato', [], null, 'Omaggi, rapporti con autorità di controllo e veterinari, scelta dei fornitori e pagamenti tracciati.'],
    ['pol-sicurezza', 'Politica per la salute e la sicurezza', 'lavoratori', 'politica', true, true, 'Nessun infortunio con più di 3 giorni di assenza; indice di frequenza sotto 10 entro il 2027', -560, 'Consiglio di amministrazione', 12, 'Amministratore delegato', ['prevenzione infortuni'], null, 'Valutazione dei rischi (polveri e ATEX, rumore, movimentazione), formazione e quasi incidenti.'],
    ['pol-ambiente', 'Politica ambientale ed energetica', 'clima', 'politica', true, true, '−25% di CO₂e per tonnellata (Scope 1 e 2) entro il 2030 rispetto al 2024', -410, 'Consiglio di amministrazione', 24, 'Amministratore delegato', [], null, 'Fotovoltaico, efficienza della pellettatura e del vapore, recupero di calore; misura mensile dei consumi.'],
    ['pol-polveri', 'Gestione delle emissioni di polveri', 'inquinamento', 'pratica', false, false, '', -900, 'Resp. qualità', 24, 'Resp. qualità', [], null, 'Manutenzione dei filtri a maniche, campionamenti ai camini previsti dall’AUA, registro delle anomalie.'],
    ['pol-acqua', 'Uso dell’acqua del pozzo e dell’acquedotto', 'acqua', 'pratica', false, false, '', -700, 'Resp. manutenzione', 24, 'Resp. manutenzione', [], null, 'Letture mensili dei contatori, recupero delle condense del vapore, controllo delle perdite.'],
    ['pol-rifiuti', 'Rifiuti e imballaggi', 'circolarita', 'pratica', false, true, 'Almeno 80% dei rifiuti avviati a recupero', -620, 'Resp. qualità', 24, 'Resp. qualità', [], null, 'Raccolta separata, pallet a rendere con i fornitori principali, sacchi con quota di polietilene riciclato.'],
    ['pol-parita', 'Parità di genere e conciliazione', 'lavoratori', 'politica', false, false, '', -380, 'Consiglio di amministrazione', 24, 'Amministratore delegato', ['discriminazione'], null, 'Criteri di selezione e retribuzione neutri, orari flessibili per gli impiegati.'],
    ['pol-fornitori', 'Codice di condotta dei fornitori', 'filiera', 'politica', true, false, '', -480, 'Consiglio di amministrazione', 24, 'Resp. acquisti', ALL6, null, 'Diritti umani e del lavoro, ambiente, anticorruzione: firmato dai fornitori di materie prime.'],
    ['pol-prodotti', 'Sicurezza dei prodotti e tracciabilità', 'consumatori', 'politica', false, false, '', -840, 'Consiglio di amministrazione', 24, 'Resp. qualità', [], null, 'Piano HACCP, analisi dei contaminanti, prova annuale di richiamo dei lotti.'],
    ['pol-comunita', 'Borse di studio con l’istituto agrario', 'comunita', 'iniziativa', true, false, '', -300, 'Amministratore delegato', 12, 'Amministratore delegato', [], null, 'Due borse di studio all’anno e stage estivi nello stabilimento (dati dimostrativi).'],
  ];
  const draft = ['pol-soia', 'Politica soia responsabile', 'filiera', 'politica', true, true, '100% della soia senza deforestazione e conversione entro il 2028', null, '', 24, 'Resp. acquisti', [], null, 'Bozza in discussione: soglie per schema di certificazione e catena di custodia.'];
  const certs = [
    { id: 'cert-iso9001', scheme: 'ISO 9001', issuer: 'Ente di certificazione Alfa (demo)', number: 'Q-1187-IT', scope: 'Produzione di mangimi composti', from: addMonths(t, -20), to: addMonths(t, 16), evidenceId: 'ev-01' },
    { id: 'cert-gmp', scheme: 'GMP+ FC', issuer: 'Ente di certificazione Alfa (demo)', number: 'GMP-0042871', scope: 'Produzione di mangimi composti e trasporto', from: addDays(t, -1020), to: addDays(t, 75), evidenceId: 'ev-02' },
    { id: 'cert-bio', scheme: 'Biologico', issuer: 'Organismo di controllo Beta (demo)', number: 'BIO-IT-0937', scope: 'Mangimi per la zootecnia biologica', from: addMonths(t, -4), to: addMonths(t, 8), evidenceId: 'ev-03' },
  ];
  const permits = [
    { id: 'per-aua', kind: 'AUA', authority: 'Provincia di Valle Verde (demo)', number: 'AUA 214/2019', from: `${y - 7}-03-18`, to: `${y + 8}-03-17`, conditionsText: 'Emissioni in atmosfera da 4 punti (polveri ≤ 10 mg/Nm³), campionamento annuale; scarico delle acque meteoriche', conditions: ['polveri ≤ 10 mg/Nm³', 'campionamento annuale ai camini', 'registro delle manutenzioni dei filtri'], evidenceId: 'ev-17' },
    { id: 'per-cpi', kind: 'CPI', authority: 'Comando dei Vigili del fuoco (demo)', number: 'Pratica VV.F. 33871', from: addDays(t, -1621), to: addDays(t, 205), conditionsText: 'Silos e depositi di farine, centrale termica a GPL', conditions: [], evidenceId: null },
    { id: 'per-pozzo', kind: 'concessione pozzo', authority: 'Regione (demo)', number: 'Concessione 1182', from: addDays(t, -2760), to: addDays(t, 560), conditionsText: 'Prelievo massimo 9.000 m³/anno, contatore sigillato', conditions: [], evidenceId: null },
    { id: 'per-ricon', kind: 'riconoscimento mangimi', authority: 'ASL (demo)', number: co.approval || 'αIT000000CS', from: `${y - 12}-05-10`, to: null, conditionsText: 'Riconoscimento ai sensi del Reg. (CE) 183/2005 (additivi e premiscele)', conditions: [], evidenceId: null },
  ];
  const board = [
    ['bm-presidente', 'Presidente del CdA', 'uomo', true, false, false, -2900],
    ['bm-ad', 'Amministratore delegato', 'uomo', true, false, true, -1650],
    ['bm-consigliera', 'Consigliera', 'donna', false, false, true, -830],
  ];
  const roles = [
    ['clima-energia', 'Clima ed energia', 'Resp. manutenzione', 'Resp. qualità', 'Amministratore delegato'],
    ['ambiente', 'Ambiente, acqua e rifiuti', 'Resp. qualità', 'Resp. manutenzione', 'Amministratore delegato'],
    ['persone', 'Persone e sicurezza', 'Ufficio del personale', 'RSPP (consulente esterno)', 'Amministratore delegato'],
    ['filiera', 'Filiera e fornitori', 'Resp. acquisti', 'Resp. qualità', 'Amministratore delegato'],
    ['governance', 'Governance, 231 ed evidenze', 'Resp. amministrazione', 'Organismo di vigilanza', 'Consiglio di amministrazione'],
    ['report', 'Rapporto VS e questionari', 'Resp. qualità', 'Resp. amministrazione', 'Consiglio di amministrazione'],
  ];
  const controls = [
    ['m231-rifiuti', 'Ambiente', 'Gestione illecita di rifiuti (art. 256 D.Lgs. 152/2006)', 'Verifica mensile di formulari, registro RENTRI e autorizzazioni dei trasportatori', 'Resp. qualità', -40, 'efficace', 12],
    ['m231-emissioni', 'Ambiente', 'Superamento dei limiti di emissione (art. 279 D.Lgs. 152/2006)', 'Piano di manutenzione dei filtri a maniche e confronto degli esiti dei campionamenti con i limiti', 'Resp. manutenzione', -95, 'efficace', 12],
    ['m231-sicurezza', 'Salute e sicurezza', 'Lesioni colpose (art. 25-septies)', 'Formazione obbligatoria, dispositivi di protezione e verifica delle zone ATEX', 'RSPP (consulente esterno)', -60, 'da migliorare', 6],
    ['m231-pa', 'Rapporti con la pubblica amministrazione', 'Corruzione (art. 25)', 'Registro degli incontri con autorità e organi di controllo, doppia firma sugli omaggi', 'Amministratore delegato', -150, 'efficace', 12],
    ['m231-acquisti', 'Acquisti', 'Corruzione tra privati (art. 25-ter)', 'Albo dei fornitori qualificati e confronto di almeno tre offerte sopra 20.000 €', 'Resp. acquisti', -120, 'efficace', 12],
    ['m231-etichette', 'Prodotti', 'Frode nell’esercizio del commercio (art. 25-bis.1)', 'Controllo di etichette e cartellini contro la formula registrata a ogni nuova versione', 'Resp. qualità', -70, 'efficace', 12],
    ['m231-fisco', 'Amministrazione', 'Reati tributari (art. 25-quinquiesdecies)', 'Riconciliazione tra documenti di trasporto, fatture e pesate', 'Resp. amministrazione', -200, 'efficace', 12],
    ['m231-pagamenti', 'Finanza', 'Riciclaggio e autoriciclaggio (art. 25-octies)', 'Pagamenti solo tracciati e verifica dei conti dei fornitori nuovi', 'Resp. amministrazione', -180, 'efficace', 12],
  ];
  const cases = [{ id: 'lc-rifiuti', date: addDays(t, -860), kind: 'ambientale', scope: 'impresa', description: 'Sanzione amministrativa per annotazione tardiva nel registro dei rifiuti', authority: 'Provincia (demo)', conviction: false, fineEur: 1200, status: 'chiuso' }];
  const claims = [
    ['cl-ecologico', 'Mangime ecologico', 'scheda tecnica', 'bozza', [], 'Direttore commerciale'],
    ['cl-proterra', 'Formula con soia ProTerra segregata', 'scheda tecnica', 'verificato', ['ev-25'], 'Resp. qualità'],
    ['cl-co2', '−9% CO₂e/t rispetto alla versione 2025, stima interna metodo PEFCR Feed', 'offerta', 'pubblicato', ['ev-24'], 'Direttore commerciale'],
    ['cl-neutral', 'Carbon neutral', 'sito', 'bozza', [], 'Direttore commerciale'],
  ];
  // evidenze: [id, titolo, tipo, emesso da, giorni dalla data (o null), scadenza (o null), file, collegamenti]
  const ev = [
    ['ev-01', 'Certificato ISO 9001', 'certificato', 'Ente di certificazione Alfa (demo)', -600, addMonths(t, 16), 'iso9001-certificato.pdf', [['companyCerts', 'cert-iso9001'], ['datapoint', 'B1.certifications']]],
    ['ev-02', 'Certificato GMP+ FC', 'certificato', 'Ente di certificazione Alfa (demo)', -1020, addDays(t, 75), 'gmp-fc-certificato.pdf', [['companyCerts', 'cert-gmp'], ['datapoint', 'B1.certifications']]],
    ['ev-03', 'Certificato di conformità biologica', 'certificato', 'Organismo di controllo Beta (demo)', -120, addMonths(t, 8), 'certificato-biologico.pdf', [['companyCerts', 'cert-bio'], ['datapoint', 'B1.certifications']]],
    ['ev-04', 'Codice etico approvato dal CdA', 'politica', co.name || 'Azienda', -1290, null, 'codice-etico.pdf', [['policies', 'pol-codice-etico'], ['datapoint', 'C6.code']]],
    ['ev-05', 'Certificato dei carichi pendenti e del casellario dell’ente', 'certificato', 'Tribunale (demo)', -45, null, 'casellario-ente.pdf', [['datapoint', 'B11.convictions'], ['datapoint', 'B11.fines']]],
    ['ev-06', 'Fatture del GPL dei 12 mesi', 'fattura', 'Fornitore del GPL (demo)', -20, null, 'fatture-gpl.zip', [['datapoint', 'B3.s1'], ['datapoint', 'B3.mwh']]],
    ['ev-07', 'Bollette dell’energia elettrica dei 12 mesi', 'fattura', 'Energia Valle Verde S.p.A. (fornitore dimostrativo)', -18, null, 'bollette-energia.zip', [['datapoint', 'B3.s2-lb'], ['datapoint', 'B3.mwh']]],
    ['ev-08', 'Letture del contatore del fotovoltaico', 'altro', 'Resp. manutenzione', -16, null, 'letture-fotovoltaico.csv', [['datapoint', 'B3.mwh']]],
    ['ev-09', 'Letture dei contatori dell’acqua (pozzo e acquedotto)', 'altro', 'Resp. manutenzione', -16, null, 'letture-acqua.csv', [['datapoint', 'B6.withdrawal']]],
    ['ev-10', 'Registro di carico e scarico dei rifiuti (estratto RENTRI)', 'FIR', 'RENTRI', -14, null, 'registro-rifiuti.pdf', [['datapoint', 'B7.waste-haz'], ['datapoint', 'B7.waste-nonhaz'], ['datapoint', 'B7.diverted']]],
    ['ev-11', 'Ricevuta di presentazione del MUD', 'altro', 'Camera di commercio (demo)', -110, null, 'mud-ricevuta.pdf', [['complianceItems', 'ci-mud'], ['datapoint', 'B7.diverted']]],
    ['ev-12', 'Libro unico del lavoro: estratto dell’organico', 'altro', 'Consulente del lavoro (demo)', -12, null, 'organico-lul.xlsx', [['datapoint', 'B1.employees'], ['datapoint', 'B8.by-contract'], ['datapoint', 'B8.by-gender']]],
    ['ev-13', 'Registro degli infortuni e ore lavorate', 'altro', 'RSPP (consulente esterno)', -12, null, 'registro-infortuni.pdf', [['datapoint', 'B9.recordable'], ['datapoint', 'B9.recordable-rate'], ['datapoint', 'B9.fatalities']]],
    ['ev-14', 'Contratto collettivo applicato e tabelle retributive', 'contratto', 'Associazione di categoria (demo)', -400, addMonths(t, 14), 'ccnl-tabelle.pdf', [['datapoint', 'B10.ccnl'], ['datapoint', 'B10.min-wage']]],
    ['ev-15', 'Registro della formazione', 'verbale', 'Ufficio del personale', -10, null, 'registro-formazione.xlsx', [['datapoint', 'B10.training-h']]],
    ['ev-16', 'Visura camerale con codice di attività', 'altro', 'Registro delle imprese (demo)', -60, null, 'visura.pdf', [['datapoint', 'C8.revenue-sectors'], ['datapoint', 'B1.legal-form']]],
    ['ev-17', 'Autorizzazione unica ambientale', 'altro', 'Provincia di Valle Verde (demo)', -2770, null, 'aua-214-2019.pdf', [['permits', 'per-aua']]],
    ['ev-18', 'Rapporto di prova delle emissioni ai camini', 'analisi', 'Laboratorio Gamma (demo)', -162, null, 'rapporto-emissioni.pdf', [['permits', 'per-aua'], ['datapoint', 'B4.pollutants'], ['complianceItems', 'ci-aua-campionamenti']]],
    ['ev-19', 'Polizza contro le catastrofi naturali', 'contratto', 'Compagnia assicurativa (demo)', -320, addDays(t, 45), 'polizza-catastrofali.pdf', [['complianceItems', 'ci-catastrofali']]],
    ['ev-20', 'Procedura di segnalazione (whistleblowing)', 'politica', 'Organismo di vigilanza', -130, null, 'procedura-segnalazioni.pdf', [['datapoint', 'C6.grievance'], ['complianceItems', 'ci-whistleblowing']]],
    ['ev-21', 'Relazione semestrale dell’Organismo di vigilanza', 'verbale', 'Organismo di vigilanza', -62, null, 'relazione-odv.pdf', [['odvReports', 'odv-2'], ['complianceItems', 'ci-odv-relazione']]],
    ['ev-22', 'Verbale del CdA sulla composizione dell’organo', 'verbale', 'Consiglio di amministrazione', -830, null, 'verbale-cda-nomine.pdf', [['datapoint', 'C9.board-ratio']]],
    ['ev-23', 'Verbale della riunione periodica di prevenzione', 'verbale', 'RSPP (consulente esterno)', -323, null, 'riunione-periodica.pdf', [['complianceItems', 'ci-dvr']]],
    ['ev-24', 'Calcolo dell’impronta di prodotto (metodo PEFCR Feed, versione 2026)', 'analisi', 'Resp. qualità', -40, null, 'impronta-prodotto.pdf', [['claims', 'cl-co2']]],
    ['ev-25', 'Certificato ProTerra del fornitore della soia segregata', 'certificato', 'ProTerra (fornitore dimostrativo)', -210, addMonths(t, 7), 'proterra-fornitore.pdf', [['claims', 'cl-proterra']]],
  ];
  return { policies, draft, certs, permits, board, roles, controls, cases, claims, ev, odvOwner: 'Organismo di vigilanza (monocratico, esterno)' };
}

function agroContent(t, co) {
  const y = +t.slice(0, 4);
  const policies = [
    ['pol-codice-etico', 'Codice etico', 'condotta', 'politica', true, false, '', -1180, 'Consiglio di amministrazione', 24, 'Presidente del CdA', ALL6, 'ev-04', 'Principi di comportamento verso dipendenti, rivenditori, fornitori e pubblica amministrazione; parte del Modello 231.'],
    ['pol-anticorruzione', 'Politica anticorruzione', 'condotta', 'politica', false, false, '', -1150, 'Consiglio di amministrazione', 24, 'Amministratore delegato', [], null, 'Omaggi, rapporti con il Ministero e gli enti di controllo, scelta dei fornitori, pagamenti tracciati.'],
    ['pol-sicurezza', 'Politica per la salute e la sicurezza', 'lavoratori', 'politica', true, true, 'Nessun infortunio con più di 3 giorni di assenza entro il 2027', -520, 'Consiglio di amministrazione', 12, 'Amministratore delegato', ['prevenzione infortuni'], null, 'Esposizione a sostanze pericolose, solventi e polveri, atmosfere esplosive, movimentazione.'],
    ['pol-ambiente', 'Politica ambientale ed energetica', 'clima', 'politica', true, true, '−20% di CO₂e per tonnellata (Scope 1 e 2) entro il 2030 rispetto al 2024', -430, 'Consiglio di amministrazione', 24, 'Amministratore delegato', [], null, 'Efficienza dell’essiccatore della linea WG, fotovoltaico sul magazzino, misura mensile dei consumi.'],
    ['pol-ppir', 'Politica di prevenzione degli incidenti rilevanti', 'inquinamento', 'politica', true, false, '', -610, 'Consiglio di amministrazione', 24, 'Amministratore delegato', [], null, 'Sistema di gestione della sicurezza dello stabilimento soggetto alla Seveso: scenari, prevenzione, emergenza.'],
    ['pol-acque', 'Acque di lavaggio delle linee', 'acqua', 'pratica', false, false, '', -700, 'Resp. qualità', 24, 'Resp. qualità', [], null, 'Ricircolo delle acque di lavaggio nei lotti successivi dello stesso prodotto e smaltimento del resto come rifiuto.'],
    ['pol-imballi', 'Imballaggi e contenitori vuoti', 'circolarita', 'pratica', false, true, 'Taniche con almeno 30% di polietilene riciclato entro il 2027', -560, 'Resp. qualità', 24, 'Resp. qualità', [], null, 'Adesione alla raccolta dei contenitori bonificati, pallet a rendere con i fornitori principali.'],
    ['pol-parita', 'Parità di genere e conciliazione', 'lavoratori', 'politica', false, false, '', -360, 'Consiglio di amministrazione', 24, 'Amministratore delegato', ['discriminazione'], null, 'Criteri di selezione e retribuzione neutri, orari flessibili per gli impiegati.'],
    ['pol-fornitori', 'Codice di condotta dei fornitori', 'filiera', 'politica', true, false, '', -450, 'Consiglio di amministrazione', 24, 'Resp. acquisti', ALL6, null, 'Diritti umani e del lavoro, ambiente, anticorruzione: firmato dai fornitori di sostanze tecniche e coformulanti.'],
    ['pol-uso-sicuro', 'Uso sicuro dei prodotti e formazione degli utilizzatori', 'consumatori', 'politica', true, false, '', -800, 'Consiglio di amministrazione', 24, 'Direttore commerciale', [], null, 'Etichette chiare, schede di sicurezza aggiornate, incontri tecnici con rivenditori e agricoltori.'],
    ['pol-rame', 'Riduzione del rame per ettaro nei programmi consigliati', 'biodiversita', 'iniziativa', true, true, '−20% di rame per ettaro nei programmi consigliati entro il 2028', -280, 'Amministratore delegato', 12, 'Resp. regolatorio', [], null, 'Formulazioni a basso dosaggio e programmi misti con prodotti biologici per vite, olivo e frutta.'],
  ];
  const draft = ['pol-cfs', 'Piano di uscita dalle sostanze candidate alla sostituzione', 'consumatori', 'politica', false, true, 'Alternative registrate per ogni prodotto con sostanze candidate entro il 2029', null, '', 24, 'Resp. regolatorio', [], null, 'Bozza in discussione con il regolatorio e il commerciale.'];
  const certs = [
    { id: 'cert-iso9001', scheme: 'ISO 9001', issuer: 'Ente di certificazione Alfa (demo)', number: 'Q-2291-IT', scope: 'Formulazione e confezionamento di agrofarmaci e biostimolanti', from: addMonths(t, -14), to: addMonths(t, 22), evidenceId: 'ev-01' },
    { id: 'cert-iso14001', scheme: 'ISO 14001', issuer: 'Ente di certificazione Alfa (demo)', number: 'E-0912-IT', scope: 'Stabilimento di Campolongo', from: addDays(t, -1015), to: addDays(t, 80), evidenceId: 'ev-02' },
    { id: 'cert-iso45001', scheme: 'ISO 45001', issuer: 'Ente di certificazione Alfa (demo)', number: 'S-0455-IT', scope: 'Stabilimento di Campolongo', from: addMonths(t, -9), to: addMonths(t, 27), evidenceId: 'ev-03' },
    { id: 'cert-adr', scheme: 'Consulente ADR', issuer: 'Motorizzazione civile (demo)', number: 'CSA-7731', scope: 'Certificato del consulente per la sicurezza dei trasporti (classi 3, 6.1, 8, 9)', from: addMonths(t, -31), to: addMonths(t, 29), evidenceId: null },
  ];
  const permits = [
    { id: 'per-aua', kind: 'AUA', authority: 'Provincia (demo)', number: 'AUA 88/2018', from: `${y - 8}-06-04`, to: `${y + 7}-06-03`, conditionsText: 'Emissioni dallo scrubber dei solventi e dal filtro delle polveri, campionamento annuale; scarico in fognatura', conditions: ['COV ≤ 50 mg/Nm³', 'polveri ≤ 10 mg/Nm³', 'campionamento annuale'], evidenceId: 'ev-17' },
    { id: 'per-cpi', kind: 'CPI', authority: 'Comando dei Vigili del fuoco (demo)', number: 'Pratica VV.F. 41102', from: addDays(t, -1590), to: addDays(t, 236), conditionsText: 'Depositi di liquidi infiammabili, magazzino di prodotti finiti, centrale a GPL', conditions: [], evidenceId: null },
    { id: 'per-seveso', kind: 'Seveso', authority: 'Ministero dell’ambiente e Regione (demo)', number: 'Notifica art. 13 n. 5521', from: addDays(t, -540), to: null, conditionsText: 'Quantità massime notificate per categoria di pericolo (E1, E2, P5c); classificazione e indici nell’area Regolatorio', conditions: [], evidenceId: 'ev-22' },
    { id: 'per-fitosanitari', kind: 'autorizzazione fitosanitari', authority: 'Ministero della salute (demo)', number: 'Officina n. 1123', from: `${y - 15}-02-11`, to: null, conditionsText: 'Produzione e confezionamento di prodotti fitosanitari (polveri, granuli, liquidi)', conditions: [], evidenceId: 'ev-23' },
  ];
  const board = [
    ['bm-presidente', 'Presidente del CdA', 'uomo', true, false, false, -3100],
    ['bm-ad', 'Amministratore delegato', 'uomo', true, false, true, -1700],
    ['bm-consigliera-1', 'Consigliera indipendente', 'donna', false, true, true, -900],
    ['bm-consigliere', 'Consigliere indipendente', 'uomo', false, true, false, -900],
    ['bm-consigliera-2', 'Consigliera', 'donna', false, false, false, -420],
  ];
  const roles = [
    ['clima-energia', 'Clima ed energia', 'Resp. manutenzione', 'Resp. qualità', 'Amministratore delegato'],
    ['ambiente', 'Ambiente, Seveso e rifiuti', 'Resp. qualità', 'RSPP (consulente esterno)', 'Amministratore delegato'],
    ['persone', 'Persone e sicurezza', 'Ufficio del personale', 'RSPP (consulente esterno)', 'Amministratore delegato'],
    ['regolatorio', 'Registrazioni, schede di sicurezza e rame', 'Resp. regolatorio', 'Resp. qualità', 'Amministratore delegato'],
    ['governance', 'Governance, 231 ed evidenze', 'Resp. amministrazione', 'Organismo di vigilanza', 'Consiglio di amministrazione'],
    ['report', 'Rapporto VS e questionari', 'Resp. qualità', 'Resp. amministrazione', 'Consiglio di amministrazione'],
  ];
  const controls = [
    ['m231-rifiuti', 'Ambiente', 'Gestione illecita di rifiuti pericolosi (art. 256 D.Lgs. 152/2006)', 'Verifica mensile di formulari, registro RENTRI e autorizzazioni dei trasportatori', 'Resp. qualità', -35, 'efficace', 12],
    ['m231-emissioni', 'Ambiente', 'Superamento dei limiti di emissione (art. 279 D.Lgs. 152/2006)', 'Manutenzione dello scrubber e confronto degli esiti dei campionamenti con i limiti', 'Resp. manutenzione', -90, 'efficace', 12],
    ['m231-seveso', 'Incidenti rilevanti', 'Reati ambientali e lesioni colpose collegati alla Seveso', 'Controllo settimanale delle giacenze per categoria contro le quantità notificate', 'Amministratore delegato', -20, 'da migliorare', 6],
    ['m231-sicurezza', 'Salute e sicurezza', 'Lesioni colpose (art. 25-septies)', 'Formazione sulle sostanze pericolose, dispositivi di protezione, prove di emergenza', 'RSPP (consulente esterno)', -75, 'efficace', 6],
    ['m231-pa', 'Rapporti con la pubblica amministrazione', 'Corruzione (art. 25)', 'Registro dei contatti con Ministero ed enti di controllo, doppia firma sugli omaggi', 'Amministratore delegato', -160, 'efficace', 12],
    ['m231-acquisti', 'Acquisti', 'Corruzione tra privati (art. 25-ter)', 'Albo dei fornitori qualificati e confronto di almeno tre offerte sopra 20.000 €', 'Resp. acquisti', -130, 'efficace', 12],
    ['m231-etichette', 'Prodotti', 'Frode nell’esercizio del commercio (art. 25-bis.1)', 'Controllo di etichette e titoli dichiarati contro il decreto di autorizzazione a ogni nuova versione', 'Resp. regolatorio', -55, 'efficace', 12],
    ['m231-fisco', 'Amministrazione', 'Reati tributari (art. 25-quinquiesdecies)', 'Riconciliazione tra documenti di trasporto, fatture e premi di fine campagna', 'Resp. amministrazione', -210, 'efficace', 12],
  ];
  const cases = [{ id: 'lc-adr', date: addDays(t, -780), kind: 'sicurezza', scope: 'impresa', description: 'Verbale per documento di trasporto ADR incompleto durante un controllo su strada', authority: 'Polizia stradale (demo)', conviction: false, fineEur: 1600, status: 'chiuso' }];
  const claims = [
    ['cl-ecologico', 'Prodotto ecologico per la difesa del vigneto', 'scheda tecnica', 'bozza', [], 'Direttore commerciale'],
    ['cl-bio', 'Ammesso in agricoltura biologica secondo il Reg. (UE) 2018/848', 'etichetta', 'verificato', ['ev-25'], 'Resp. regolatorio'],
    ['cl-rame', '−20% di rame per ettaro rispetto al programma 2024, metodo di calcolo interno sui programmi consigliati', 'offerta', 'pubblicato', ['ev-24'], 'Direttore commerciale'],
    ['cl-neutral', 'Carbon neutral', 'sito', 'bozza', [], 'Direttore commerciale'],
  ];
  const ev = [
    ['ev-01', 'Certificato ISO 9001', 'certificato', 'Ente di certificazione Alfa (demo)', -420, addMonths(t, 22), 'iso9001-certificato.pdf', [['companyCerts', 'cert-iso9001'], ['datapoint', 'B1.certifications']]],
    ['ev-02', 'Certificato ISO 14001', 'certificato', 'Ente di certificazione Alfa (demo)', -1015, addDays(t, 80), 'iso14001-certificato.pdf', [['companyCerts', 'cert-iso14001'], ['datapoint', 'B1.certifications']]],
    ['ev-03', 'Certificato ISO 45001', 'certificato', 'Ente di certificazione Alfa (demo)', -270, addMonths(t, 27), 'iso45001-certificato.pdf', [['companyCerts', 'cert-iso45001'], ['datapoint', 'B1.certifications']]],
    ['ev-04', 'Codice etico approvato dal CdA', 'politica', co.name || 'Azienda', -1180, null, 'codice-etico.pdf', [['policies', 'pol-codice-etico'], ['datapoint', 'C6.code']]],
    ['ev-05', 'Certificato dei carichi pendenti e del casellario dell’ente', 'certificato', 'Tribunale (demo)', -50, null, 'casellario-ente.pdf', [['datapoint', 'B11.convictions'], ['datapoint', 'B11.fines']]],
    ['ev-06', 'Fatture del GPL dei 12 mesi', 'fattura', 'Fornitore del GPL (demo)', -20, null, 'fatture-gpl.zip', [['datapoint', 'B3.s1'], ['datapoint', 'B3.mwh']]],
    ['ev-07', 'Bollette dell’energia elettrica dei 12 mesi', 'fattura', 'Energia Padana S.p.A. (fornitore dimostrativo)', -18, null, 'bollette-energia.zip', [['datapoint', 'B3.s2-lb'], ['datapoint', 'B3.mwh']]],
    ['ev-08', 'Letture del contatore del fotovoltaico', 'altro', 'Resp. manutenzione', -16, null, 'letture-fotovoltaico.csv', [['datapoint', 'B3.mwh']]],
    ['ev-09', 'Letture del contatore dell’acqua', 'altro', 'Resp. manutenzione', -16, null, 'letture-acqua.csv', [['datapoint', 'B6.withdrawal']]],
    ['ev-10', 'Registro di carico e scarico dei rifiuti pericolosi (estratto RENTRI)', 'FIR', 'RENTRI', -14, null, 'registro-rifiuti.pdf', [['datapoint', 'B7.waste-haz'], ['datapoint', 'B7.waste-nonhaz'], ['datapoint', 'B7.diverted']]],
    ['ev-11', 'Ricevuta di presentazione del MUD', 'altro', 'Camera di commercio (demo)', -110, null, 'mud-ricevuta.pdf', [['complianceItems', 'ci-mud'], ['datapoint', 'B7.diverted']]],
    ['ev-12', 'Libro unico del lavoro: estratto dell’organico', 'altro', 'Consulente del lavoro (demo)', -12, null, 'organico-lul.xlsx', [['datapoint', 'B1.employees'], ['datapoint', 'B8.by-contract'], ['datapoint', 'B8.by-gender']]],
    ['ev-13', 'Registro degli infortuni e ore lavorate', 'altro', 'RSPP (consulente esterno)', -12, null, 'registro-infortuni.pdf', [['datapoint', 'B9.recordable'], ['datapoint', 'B9.recordable-rate'], ['datapoint', 'B9.fatalities']]],
    ['ev-14', 'Contratto collettivo dei chimici applicato e tabelle retributive', 'contratto', 'Associazione di categoria (demo)', -380, addMonths(t, 14), 'ccnl-tabelle.pdf', [['datapoint', 'B10.ccnl'], ['datapoint', 'B10.min-wage']]],
    ['ev-15', 'Registro della formazione', 'verbale', 'Ufficio del personale', -10, null, 'registro-formazione.xlsx', [['datapoint', 'B10.training-h']]],
    ['ev-16', 'Visura camerale con codice di attività', 'altro', 'Registro delle imprese (demo)', -60, null, 'visura.pdf', [['datapoint', 'C8.revenue-sectors'], ['datapoint', 'B1.legal-form']]],
    ['ev-17', 'Autorizzazione unica ambientale', 'altro', 'Provincia (demo)', -3060, null, 'aua-88-2018.pdf', [['permits', 'per-aua']]],
    ['ev-18', 'Rapporto di prova delle emissioni dello scrubber', 'analisi', 'Laboratorio Gamma (demo)', -162, null, 'rapporto-emissioni.pdf', [['permits', 'per-aua'], ['datapoint', 'B4.pollutants'], ['complianceItems', 'ci-aua-campionamenti']]],
    ['ev-19', 'Polizza contro le catastrofi naturali', 'contratto', 'Compagnia assicurativa (demo)', -320, addDays(t, 45), 'polizza-catastrofali.pdf', [['complianceItems', 'ci-catastrofali']]],
    ['ev-20', 'Procedura di segnalazione (whistleblowing)', 'politica', 'Organismo di vigilanza', -130, null, 'procedura-segnalazioni.pdf', [['datapoint', 'C6.grievance'], ['complianceItems', 'ci-whistleblowing']]],
    ['ev-21', 'Relazione semestrale dell’Organismo di vigilanza', 'verbale', 'Organismo di vigilanza', -62, null, 'relazione-odv.pdf', [['odvReports', 'odv-2'], ['complianceItems', 'ci-odv-relazione']]],
    ['ev-22', 'Notifica Seveso (art. 13) con le quantità massime per categoria', 'altro', 'Ministero dell’ambiente (demo)', -540, null, 'notifica-seveso.pdf', [['permits', 'per-seveso'], ['complianceItems', 'ci-seveso-notifica']]],
    ['ev-23', 'Decreto di autorizzazione dell’officina di produzione', 'altro', 'Ministero della salute (demo)', -5400, null, 'decreto-officina.pdf', [['permits', 'per-fitosanitari']]],
    ['ev-24', 'Calcolo del rame per ettaro dei programmi di difesa consigliati', 'analisi', 'Resp. regolatorio', -40, null, 'rame-programmi.xlsx', [['claims', 'cl-rame']]],
    ['ev-25', 'Elenco delle registrazioni ammesse in agricoltura biologica', 'certificato', 'Resp. regolatorio', -90, null, 'registrazioni-bio.pdf', [['claims', 'cl-bio']]],
  ];
  return { policies, draft, certs, permits, board, roles, controls, cases, claims, ev, odvOwner: 'Organismo di vigilanza (collegiale, due esterni)' };
}

/* ---------------- storico dei completamenti di un obbligo ---------------- */
function history(it, t, R) {
  const r = it.due || {};
  const early = () => R.int(4, 26);
  if (r.type === 'fixed') return r.date < t ? [{ due: r.date, at: addDays(r.date, -early()), by: OWNERS[it.owner] || it.owner || '', evidenceIds: DONE_EV[it.id] || [], note: '' }] : [];
  if (r.type === 'annual') {
    const out = [];
    for (let yy = +t.slice(0, 4) - 2; yy <= +t.slice(0, 4); yy++) {
      const due = `${yy}-${r.md}`;
      if (due < t && due > addDays(t, -730)) out.push({ due, at: addDays(due, -early()), by: OWNERS[it.owner] || '', evidenceIds: due > addDays(t, -365) ? DONE_EV[it.id] || [] : [], note: '' });
    }
    return out;
  }
  if (r.type === 'every') {
    const m = Math.max(1, +r.months || 12), nx = addDays(t, NEXT_IN[it.id] ?? 120), last = addMonths(nx, -m), prev = addMonths(last, -m);
    const late = it.id === 'dvr'; // la riunione periodica dell'anno scorso si è tenuta con 18 giorni di ritardo
    const out = [];
    if (prev > addDays(t, -800)) out.push({ due: prev, at: addDays(prev, -early()), by: OWNERS[it.owner] || '', evidenceIds: [], note: '' });
    out.push({ due: last, at: late ? addDays(last, 18) : addDays(last, -early()), by: OWNERS[it.owner] || '', evidenceIds: DONE_EV[it.id] || [], note: late ? 'Riunione rinviata per l’assenza del medico competente' : '' });
    return out.filter(x => x.at <= t);
  }
  return [];
}

/** Patch del pacchetto governance (solo aggiunte; idempotente). */
export function demoGovernance(d, { today, R } = {}) {
  if (!d || !Array.isArray(d.products) || !d.products.length) return {};
  if ((d.policies || []).length || (d.complianceItems || []).length || (d.evidence || []).length || d.settings?.esg18?.governance) return {};
  const t = today || d.settings?.demoAnchor;
  if (!t) return {};
  const r = R || rng(16 + 1401);
  const sector = sectorOf(d);
  const co = d.settings?.company || {};
  const C = sector === 'agrofarmaci' ? agroContent(t, co) : feedContent(t, co);
  const by = 'Resp. qualità (dati dimostrativi)';

  const policies = [...C.policies, C.draft].map(([id, title, matter, kind, pub, hasTarget, target, appr, approver, reviewMonths, senior, covers, evidenceId, description]) => ({
    id, title, matter, kind, status: appr == null ? 'bozza' : 'approvata', public: pub, hasTarget, target, approvedAt: appr == null ? null : addDays(t, appr), approver, reviewMonths,
    reviewedAt: appr != null && appr < -reviewMonths * 30 ? addDays(t, -r.int(60, 200)) : null, covers, evidenceId, evidenceIds: [], seniorAccountable: senior, description }));
  const boardMembers = C.board.map(([id, role, gender, executive, independent, esgSkill, since]) => ({ id, role, gender, executive, independent, esgSkill, since: addDays(t, since), until: null }));
  const esgRoles = C.roles.map(([id, area, responsible, reviewer, approver]) => ({ id, area, responsible, reviewer, approver, note: '' }));
  const m231Controls = C.controls.map(([id, area, risk, control, owner, last, outcome, testMonths]) => ({ id, area, risk, control, owner, lastTest: addDays(t, last), outcome, testMonths }));
  const odvReports = [
    { id: 'odv-1', date: addDays(t, -245), period: 'primo semestre', summary: 'Verifiche sui controlli ambientali e di sicurezza, formazione 231 dei nuovi assunti; nessuna segnalazione ricevuta.', findings: 1, evidenceId: null },
    { id: 'odv-2', date: addDays(t, -62), period: 'secondo semestre', summary: 'Aggiornamento sulle novità dei reati ambientali (D.Lgs. 81/2026), verifica del registro dei rifiuti; nessuna segnalazione ricevuta.', findings: 2, evidenceId: 'ev-21' },
  ];
  const y = +t.slice(0, 4);
  const whistleStats = [y - 2, y - 1, y].map(yy => ({ id: String(yy), year: yy, received: 0, acknowledged7d: 0, feedback3m: 0, substantiated: 0, retaliation: 0, note: yy === y ? 'anno in corso' : '' }));
  const claims = C.claims.map(([id, text, channel, status, evidenceIds, owner], i) => ({ id, text, channel, productId: null, status, evidenceIds, owner, reviewAt: status === 'bozza' ? addDays(t, 20 + i * 7) : addMonths(t, 5 + i), createdAt: addDays(t, -30 - i * 11), findings: [] }));
  const evidence = C.ev.map(([id, title, kind, issuer, issued, expiresAt, fileName, links]) => ({
    id, title, kind, issuer, issuedAt: addDays(t, issued), expiresAt, sha256: sha256HexSync(`FeedOS · documento dimostrativo · ${co.name || ''} · ${id} · ${title}`), size: 40000 + r.int(0, 900) * 1024,
    mime: /\.zip$/.test(fileName) ? 'application/zip' : /\.csv$/.test(fileName) ? 'text/csv' : /\.xlsx$/.test(fileName) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    storage: 'percorso', path: `Archivio documentale › ${kind === 'certificato' ? 'Certificati' : kind === 'fattura' ? 'Amministrazione' : 'Qualità e ambiente'} › ${fileName} (dimostrativo)`, fileName,
    links: links.map(([type, ref]) => ({ type, ref })), addedBy: by, addedAt: addDays(t, Math.min(-1, issued + r.int(1, 9))), supersededBy: null, note: 'Documento dimostrativo: impronta di un testo segnaposto, nessun file' }));
  // un certificato precedente sostituito (storico)
  const old = evidence.find(e => e.id === 'ev-02');
  if (old) evidence.push({ ...old, id: 'ev-02-prec', title: `${old.title} (emissione precedente)`, issuedAt: addDays(old.issuedAt, -1095), expiresAt: addDays(old.issuedAt, -1), sha256: sha256HexSync(`FeedOS · documento dimostrativo · ${co.name || ''} · ev-02-prec`), supersededBy: 'ev-02', addedAt: addDays(old.issuedAt, -1090), links: old.links.filter(l => l.type !== 'datapoint') });

  const settings = {
    employees: sector === 'agrofarmaci' ? 58 : null, accountable: 'Amministratore delegato', flags: { iperammortamento: true },
    model231: { adopted: addDays(t, -1290), lastUpdate: addDays(t, -240), odv: C.odvOwner },
    whistle: { channel: true, provider: 'Piattaforma esterna di segnalazione con canale scritto e orale (demo)', since: addDays(t, -1040) },
    grievance: true, c8: { weapons: 0, tobacco: 0, fossil: 0, chemicals: null }, ungcViolation: false, windowDays: 180, coverageTarget: 0.8,
  };
  // adempimenti: un rigo per obbligo applicabile, con responsabile e storico dei completamenti
  const d2 = { ...d, permits: C.permits, companyCerts: C.certs, policies, claims, settings: { ...d.settings, esg18: { ...(d.settings?.esg18 || {}), governance: settings } } };
  const pr = governanceProfile(d2, t);
  const complianceItems = [];
  for (const it of PACK_GOVERNANCE.items) {
    if (!(it.sectors || ['mangimi', 'agrofarmaci']).includes(sector) || !obligationApplies(it, pr).applies) continue;
    const done = it.due?.type === 'event' ? [] : history(it, t, r);
    const row = { id: `ci-${it.id}`, obligationId: it.id, applies: null, owner: OWNERS[it.owner] || it.owner || '', due: null, done, lastDoneAt: done.length ? done[done.length - 1].at : null, evidenceIds: [], status: 'aperto', note: '' };
    if (it.due?.type === 'manual') { row.due = addDays(t, 45); row.done = [{ due: addDays(t, -320), at: addDays(t, -326), by: row.owner, evidenceIds: ['ev-19'], note: 'Rinnovo annuale della polizza' }]; row.lastDoneAt = addDays(t, -326); }
    complianceItems.push(row);
  }
  complianceItems.push(
    { id: 'ci-messa-a-terra', obligationId: null, title: 'Verifica periodica dell’impianto di messa a terra', law: 'DPR 462/2001, art. 4', owner: 'Resp. manutenzione', applies: null, recurrenceMonths: 24, due: null,
      done: [{ due: addDays(t, -300), at: addDays(t, -309), by: 'Resp. manutenzione', evidenceIds: [], note: 'Verifica dell’organismo abilitato' }], lastDoneAt: addDays(t, -309), evidenceIds: [], status: 'aperto', note: 'Ogni 2 anni nei luoghi con pericolo di esplosione (zone ATEX), altrimenti ogni 5' },
    { id: 'ci-bilance', obligationId: null, title: 'Verificazione periodica delle bilance a ponte (metrologia legale)', law: 'DM 93/2017', owner: 'Resp. qualità', applies: null, recurrenceMonths: 36, due: null,
      done: [{ due: addDays(t, -700), at: addDays(t, -712), by: 'Resp. qualità', evidenceIds: [], note: '' }], lastDoneAt: addDays(t, -712), evidenceIds: [], status: 'aperto', note: 'Bilance usate per le pesate di vendita' },
  );
  return {
    add: { policies, boardMembers, esgRoles, complianceItems, companyCerts: C.certs, permits: C.permits, m231Controls, odvReports, whistleStats, legalCases: C.cases, evidence, claims },
    settings: { esg18: { governance: settings } },
  };
}
