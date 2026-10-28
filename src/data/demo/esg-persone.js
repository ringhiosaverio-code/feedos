/* FeedOS 18 · Dati dimostrativi · Persone e sicurezza (pacchetto WP5).
 * Contratto: demoPersone(d, { today, R }) → { add }, solo aggiunte, idempotente (se i dati ci sono già restituisce {}),
 * deterministico (R = rng del seme + offset, niente orologio); nessuna impostazione (valori di base del pacchetto).
 * Due edizioni con lo stesso estensore: sectorOf(d) sceglie i contenuti.
 * - Mangimificio dimostrativo di Valle Verde: 31 dipendenti coerenti con il questionario ESG (dirigenti 2, quadri 4, impiegati 9,
 *   operai 16; donne 22%; turnover 6,4%; divario 6,5%; 1 infortunio con 12 giorni; circa 52.000 ore; 18 ore di formazione a testa).
 * - Azienda di agrofarmaci dimostrativa «Arvale» (DifesaOS): 58 dipendenti, rischio chimico, ADR, Seveso, DPI di terza categoria.
 * Dati inventati e pseudonimi: nessun nome di persona. */
import { addDays, addMonths, endOfMonth, round, sum } from '../../core/util.js';

const r10 = v => Math.round(v / 10) * 10;
import { sectorOf } from '../../engine/esg-years.js';

const COLLS = ['hrSnapshots', 'hoursWorked', 'injuries', 'trainings', 'payData', 'pdr125', 'ot23', 'safetyActions'];
const A = x => (Array.isArray(x) ? x : []);
const p2 = n => String(n).padStart(2, '0');

/* righe dell'organico: [categoria, genere, contratto, tempo pieno, persone, ETP] */
const FEED = {
  cur: [['dirigenti', 'M', 'indeterminato', true, 2, 2], ['quadri', 'M', 'indeterminato', true, 3, 3], ['quadri', 'F', 'indeterminato', true, 1, 1],
    ['impiegati', 'M', 'indeterminato', true, 4, 4], ['impiegati', 'F', 'indeterminato', true, 3, 3], ['impiegati', 'F', 'indeterminato', false, 2, 1.5],
    ['operai', 'M', 'indeterminato', true, 10, 10], ['operai', 'M', 'apprendistato', true, 2, 2], ['operai', 'M', 'determinato', true, 3, 3], ['operai', 'F', 'indeterminato', true, 1, 1]],
  prev: [['dirigenti', 'M', 'indeterminato', true, 2, 2], ['quadri', 'M', 'indeterminato', true, 3, 3], ['quadri', 'F', 'indeterminato', true, 1, 1],
    ['impiegati', 'M', 'indeterminato', true, 5, 5], ['impiegati', 'F', 'indeterminato', true, 2, 2], ['impiegati', 'F', 'indeterminato', false, 2, 1.5],
    ['operai', 'M', 'indeterminato', true, 10, 10], ['operai', 'M', 'apprendistato', true, 2, 2], ['operai', 'M', 'determinato', true, 3, 3], ['operai', 'F', 'indeterminato', true, 1, 1]],
  head: { cur: { hiresF: 1, hiresM: 4, leaversF: 0, leaversM: 2, parentalF: 1, parentalM: 1, agency: 2, selfEmployed: 0 }, prev: { hiresF: 0, hiresM: 4, leaversF: 1, leaversM: 1, parentalF: 1, parentalM: 0, agency: 2, selfEmployed: 0 } },
  ccnl: 'CCNL Industria alimentare; dirigenti: CCNL Dirigenti industria',
  hours: { cur: 52000, prev: 51200 },
  // stagionalità delle ore (gennaio…dicembre) e mesi dei lavoratori a termine (raccolta dei cereali)
  season: [0.97, 1.0, 1.05, 0.98, 1.04, 1.02, 1.0, 0.62, 1.05, 1.07, 1.03, 0.86], seasonal: [7, 8, 9, 10],
  pay: { dirigenti: [89000, 0.13], quadri: [51500, 0.05], impiegati: [34000, 0.035], operai: [29400, 0.035] }, payGap: 0.065,
};
const AGRO = {
  cur: [['dirigenti', 'M', 'indeterminato', true, 3, 3], ['dirigenti', 'F', 'indeterminato', true, 1, 1], ['quadri', 'M', 'indeterminato', true, 4, 4], ['quadri', 'F', 'indeterminato', true, 3, 3],
    ['impiegati', 'M', 'indeterminato', true, 8, 8], ['impiegati', 'F', 'indeterminato', true, 9, 9], ['impiegati', 'F', 'indeterminato', false, 2, 1.6],
    ['operai', 'M', 'indeterminato', true, 20, 20], ['operai', 'M', 'apprendistato', true, 2, 2], ['operai', 'M', 'determinato', true, 2, 2], ['operai', 'F', 'indeterminato', true, 3, 3], ['operai', 'F', 'determinato', true, 1, 1]],
  prev: [['dirigenti', 'M', 'indeterminato', true, 3, 3], ['dirigenti', 'F', 'indeterminato', true, 1, 1], ['quadri', 'M', 'indeterminato', true, 4, 4], ['quadri', 'F', 'indeterminato', true, 2, 2],
    ['impiegati', 'M', 'indeterminato', true, 8, 8], ['impiegati', 'F', 'indeterminato', true, 8, 8], ['impiegati', 'F', 'indeterminato', false, 2, 1.6],
    ['operai', 'M', 'indeterminato', true, 19, 19], ['operai', 'M', 'apprendistato', true, 2, 2], ['operai', 'M', 'determinato', true, 3, 3], ['operai', 'F', 'indeterminato', true, 3, 3], ['operai', 'F', 'determinato', true, 1, 1]],
  head: { cur: { hiresF: 2, hiresM: 5, leaversF: 1, leaversM: 2, parentalF: 2, parentalM: 1, agency: 4, selfEmployed: 1 }, prev: { hiresF: 1, hiresM: 5, leaversF: 0, leaversM: 3, parentalF: 1, parentalM: 1, agency: 3, selfEmployed: 1 } },
  ccnl: 'CCNL Chimico-farmaceutico; dirigenti: CCNL Dirigenti industria',
  hours: { cur: 96500, prev: 93800 },
  // picco di confezionamento a fine inverno e in primavera (rameici, erbicidi), lavoratori a termine da febbraio a giugno
  season: [1.0, 1.08, 1.1, 1.06, 1.03, 1.0, 0.96, 0.64, 1.0, 1.02, 1.01, 0.85], seasonal: [2, 3, 4, 5, 6],
  pay: { dirigenti: [98000, 0.14], quadri: [58000, 0.06], impiegati: [37500, 0.04], operai: [31000, 0.04] }, payGap: null, womenFactor: { dirigenti: 0.96, quadri: 0.97, impiegati: 0.925, operai: 0.97 },
};

/* ---------------- infortuni e quasi infortuni: [mese del periodo (0 = primo, negativo = periodo prima), giorno, tipo, linea, reparto, causa, registrabile, giorni, nota] ---------------- */
const FEED_EV = [
  [3, 14, 'infortunio', 'L2', 'Reparto pellettatura', 'macchine in movimento', true, 12, 'Contusione alla mano durante la pulizia del raffreddatore: blocco della macchina non completo'],
  [7, 9, 'infortunio', 'L3', 'Insacco', 'taglio', true, 0, 'Taglio alla mano sul bordo della pinza dell’insaccatrice: punti di sutura, rientro il giorno dopo'],
  [1, 21, 'quasi-infortunio', null, 'Piazzale di carico', 'carrelli e mezzi', false, 0, 'Carrello in retromarcia a un metro da un autista a piedi'],
  [5, 3, 'quasi-infortunio', null, 'Magazzino materie prime', 'scivolamento o caduta in piano', false, 0, 'Farina sparsa sul pavimento vicino alla fossa di scarico'],
  [8, 17, 'quasi-infortunio', null, 'Torre di macinazione', 'polveri o esplosione', false, 0, 'Accumulo di polvere sul piede dell’elevatore a tazze trovato al controllo ATEX'],
  [10, 26, 'quasi-infortunio', null, 'Silos', 'caduta dall’alto', false, 0, 'Salita sulla scala del silo senza imbracatura agganciata'],
  [4, 8, 'in-itinere', null, 'Tragitto casa-lavoro', 'altro', false, 5, 'Incidente stradale nel tragitto casa-lavoro (fuori dagli indici)'],
  [-9, 11, 'infortunio', 'L1', 'Reparto pellettatura', 'movimentazione manuale', true, 9, 'Lombalgia sollevando sacchi di additivo da 25 kg'],
  [-4, 22, 'infortunio', null, 'Magazzino prodotti finiti', 'scivolamento o caduta in piano', true, 21, 'Caduta su pavimento bagnato dopo il lavaggio'],
  [-6, 5, 'infortunio', 'L3', 'Insacco', 'urto o schiacciamento', true, 0, 'Urto del ginocchio contro un pallet: medicazione in pronto soccorso'],
  [-10, 14, 'quasi-infortunio', null, 'Piazzale di carico', 'carrelli e mezzi', false, 0, 'Camion in manovra senza moviere'],
  [-7, 2, 'quasi-infortunio', 'L1', 'Reparto pellettatura', 'macchine in movimento', false, 0, 'Carter della pellettatrice aperto durante la marcia'],
  [-2, 19, 'quasi-infortunio', null, 'Magazzino materie prime', 'polveri o esplosione', false, 0, 'Lampada senza protezione vicino alla fossa di scarico'],
];
const AGRO_EV = [
  [2, 12, 'infortunio', 'L2', 'Reparto liquidi', 'sostanze chimiche', true, 0, 'Schizzo di formulato sul polso durante il travaso: lavaggio immediato e visita medica, nessuna assenza'],
  [5, 20, 'infortunio', 'L3', 'Magazzino ADR', 'movimentazione manuale', true, 9, 'Lombalgia movimentando un fusto da 200 litri senza il ribaltafusti'],
  [8, 7, 'infortunio', 'L1', 'Linea granuli WG', 'scivolamento o caduta in piano', true, 0, 'Caduta sulla pedana del granulatore bagnata di condensa: contusione medicata, rientro al lavoro lo stesso giorno'],
  [1, 9, 'quasi-infortunio', 'L2', 'Reparto liquidi', 'sostanze chimiche', false, 0, 'Sversamento di 20 litri trattenuto dal bacino di contenimento'],
  [3, 27, 'quasi-infortunio', null, 'Magazzino ADR', 'carrelli e mezzi', false, 0, 'Carrello a contatto con il montante di una scaffalatura'],
  [6, 15, 'quasi-infortunio', 'L2', 'Reparto liquidi', 'sostanze chimiche', false, 0, 'Rilevatore di vapori in allarme durante la pulizia del reattore'],
  [9, 4, 'quasi-infortunio', 'L3', 'Linea polveri e rameici', 'polveri o esplosione', false, 0, 'Maschera con filtro scaduto trovata in uso'],
  [10, 23, 'quasi-infortunio', null, 'Parco serbatoi', 'sostanze chimiche', false, 0, 'Valvola di fondo del serbatoio non chiusa dopo il carico'],
  [7, 3, 'in-itinere', null, 'Tragitto casa-lavoro', 'altro', false, 6, 'Incidente stradale nel tragitto casa-lavoro (fuori dagli indici)'],
  [-8, 16, 'infortunio', 'L2', 'Reparto liquidi', 'sostanze chimiche', true, 6, 'Irritazione agli occhi durante il campionamento senza visiera'],
  [-5, 2, 'infortunio', null, 'Magazzino ADR', 'carrelli e mezzi', true, 14, 'Piede schiacciato da un pallet durante il carico'],
  [-3, 25, 'infortunio', 'L1', 'Linea granuli WG', 'macchine in movimento', true, 8, 'Mano urtata dalla coclea durante lo sblocco'],
  [-6, 11, 'quasi-infortunio', 'L2', 'Reparto liquidi', 'sostanze chimiche', false, 0, 'Tubo flessibile di travaso fessurato'],
  [-1, 30, 'quasi-infortunio', null, 'Magazzino ADR', 'incendio', false, 0, 'Bancale di imballi vicino al quadro elettrico'],
];

/* ---------------- azioni correttive: [evento (indice) o null, testo, responsabile, scadenza (giorni da oggi o [mese, giorno]), stato] ---------------- */
const FEED_ACT = [
  [0, 'Procedura di blocco e cartellinatura (LOTO) con lucchetti personali sul raffreddatore e sulla pellettatrice', 'RSPP', [4, 28], 'chiusa'],
  [1, 'Carter di protezione sul bordo della pinza dell’insaccatrice', 'Manutenzione', [8, 27], 'chiusa'],
  [2, 'Percorsi pedonali segnati e specchi parabolici nel piazzale di carico', 'Responsabile logistica', 45, 'in corso'],
  [4, 'Pulizia programmata settimanale degli elevatori e verifica della messa a terra dei nastri', 'Manutenzione', -12, 'in corso'],
  [5, 'Linea vita sulla scala dei silos e addestramento all’uso dell’imbracatura', 'RSPP', 75, 'aperta'],
];
const AGRO_ACT = [
  [0, 'Visiere e guanti lunghi obbligatori al travaso; cartello con le istruzioni della scheda di sicurezza', 'RSPP', [3, 10], 'chiusa'],
  [1, 'Ribaltafusti e carrello per fusti nel magazzino ADR; addestramento alla movimentazione', 'Responsabile magazzino', [7, 15], 'chiusa'],
  [2, 'Grigliato antiscivolo sulla pedana del granulatore e raccolta della condensa', 'Manutenzione', [10, 20], 'chiusa'],
  [6, 'Registro delle scadenze dei filtri delle maschere con controllo settimanale del preposto', 'RSPP', -9, 'in corso'],
  [7, 'Lista di controllo della chiusura delle valvole dopo il carico, firmata dall’addetto', 'Responsabile logistica', 30, 'aperta'],
];

/* ---------------- formazione: [chiave, mese del periodo o {due: giorni da oggi, months}, giorno, corso, tema, ore, donne, uomini, obbligatorio, validità, serie] ---------------- */
const FEED_TR = [
  ['atex', { due: 40, months: 36 }, 0, 'Atmosfere esplosive da polveri: aggiornamento', 'ATEX', 4, 0, 14, true, 36],
  ['carrelli', { due: 21, months: 60 }, 0, 'Carrelli elevatori: aggiornamento', 'carrelli', 4, 0, 8, true, 60],
  ['ps', 2, 15, 'Primo soccorso, gruppo B: aggiornamento', 'primo-soccorso', 4, 1, 3, true, 36],
  ['anti', 6, 11, 'Antincendio, livello 2: aggiornamento', 'antincendio', 5, 1, 5, true, 60],
  ['sic', 9, 23, 'Formazione specifica dei lavoratori, rischio medio: aggiornamento', 'sicurezza', 6, 3, 13, true, 60],
  ['neo', 9, 2, 'Formazione generale e specifica dei nuovi assunti', 'sicurezza', 12, 1, 4, true, 60, 'sicurezza-neoassunti'],
  ['spazi', 1, 18, 'Lavori in spazi confinati (silos)', 'spazi-confinati', 8, 0, 6, true, 36],
  ['rls', 3, 7, 'Rappresentante dei lavoratori per la sicurezza: aggiornamento', 'RLS', 8, 0, 1, true, 12],
  ['prep', 5, 20, 'Preposti: aggiornamento', 'preposti', 6, 1, 4, true, 24],
  ['231', 4, 16, 'Codice etico e Modello 231', '231', 2, 7, 24, false, null],
  ['haccp', 7, 13, 'Sicurezza dei mangimi e HACCP', 'qualita', 4, 3, 14, false, null],
  ['esg', 10, 6, 'Dati ESG e questionari dei clienti', 'ESG', 3, 4, 3, false, null],
  ['pellet', 8, 25, 'Conduzione della pellettatrice e risparmio di vapore', 'tecnica', 8, 0, 6, false, null],
  ['excel', 11, 4, 'Fogli di calcolo e cruscotti', 'tecnica', 6, 4, 2, false, null],
  ['en', 6, 1, 'Inglese tecnico per l’ufficio commerciale', 'tecnica', 20, 1, 1, false, null],
  ['sic-p', -7, 14, 'Formazione specifica dei lavoratori, rischio medio: aggiornamento', 'sicurezza', 6, 2, 10, true, 60, 'sicurezza-agg-1'],
  ['231-p', -3, 9, 'Codice etico e Modello 231', '231', 2, 6, 24, false, null],
  ['haccp-p', -9, 21, 'Sicurezza dei mangimi e HACCP', 'qualita', 4, 3, 12, false, null],
  ['neo-p', -2, 3, 'Formazione generale e specifica dei nuovi assunti', 'sicurezza', 12, 0, 4, true, 60, 'sicurezza-neoassunti-p'],
];
const AGRO_TR = [
  ['dpi', { due: 25, months: 12 }, 0, 'Respiratori e DPI di terza categoria: addestramento con prova di tenuta', 'DPI-3', 2, 4, 22, true, 12],
  ['seveso', { due: 130, months: 12 }, 0, 'Seveso: esercitazione del piano di emergenza interno', 'Seveso', 3, 19, 39, true, 12],
  ['chim', 3, 17, 'Rischio chimico e schede di sicurezza: aggiornamento', 'rischio-chimico', 4, 6, 24, true, 36],
  ['adr', 6, 9, 'Merci pericolose su strada (ADR 1.3): aggiornamento degli addetti al carico', 'ADR', 4, 1, 7, true, 36],
  ['anti', 4, 22, 'Antincendio, livello 3: aggiornamento', 'antincendio', 8, 2, 6, true, 60],
  ['ps', 2, 5, 'Primo soccorso, gruppo A: aggiornamento', 'primo-soccorso', 6, 2, 4, true, 36],
  ['carrelli', { due: 210, months: 60 }, 0, 'Carrelli elevatori: aggiornamento', 'carrelli', 4, 0, 10, true, 60],
  ['atex', 8, 12, 'Atmosfere esplosive (vapori di solvente e polveri): aggiornamento', 'ATEX', 4, 0, 12, true, 36],
  ['sic', 9, 19, 'Formazione specifica dei lavoratori, rischio alto: aggiornamento', 'sicurezza', 6, 5, 15, true, 60],
  ['neo', 1, 28, 'Formazione generale e specifica dei nuovi assunti (rischio alto)', 'sicurezza', 16, 2, 5, true, 60, 'sicurezza-neoassunti'],
  ['prep', 5, 14, 'Preposti: aggiornamento', 'preposti', 6, 2, 6, true, 24],
  ['rls', 7, 2, 'Rappresentante dei lavoratori per la sicurezza: aggiornamento', 'RLS', 8, 1, 1, true, 12],
  ['reg', 2, 26, 'Regolamento (CE) 1107/2009 ed etichette dei prodotti fitosanitari', 'qualita', 8, 4, 2, false, null],
  ['231', 4, 6, 'Codice etico e Modello 231', '231', 2, 19, 39, false, null],
  ['glp', 10, 13, 'Buone pratiche di laboratorio per il controllo qualità', 'qualita', 8, 3, 2, false, null],
  ['esg', 11, 10, 'Dati ESG, CO₂ dei programmi di difesa e questionari dei clienti', 'ESG', 3, 6, 4, false, null],
  ['tec', 7, 27, 'Conduzione del granulatore a letto fluido', 'tecnica', 8, 0, 6, false, null],
  ['sic-p', -6, 8, 'Formazione specifica dei lavoratori, rischio alto: aggiornamento', 'sicurezza', 6, 4, 14, true, 60, 'sicurezza-agg-1'],
  ['231-p', -4, 15, 'Codice etico e Modello 231', '231', 2, 18, 37, false, null],
  ['chim-p', -9, 3, 'Rischio chimico per i nuovi assunti', 'rischio-chimico', 8, 1, 4, false, null],
];

/* ---------------- PdR 125 e OT23 ---------------- */
const FEED_PDR = { scores: { cultura: 60, governance: 45, processiHR: 70, crescita: 40, equita: 55, genitorialita: 50 }, certified: false, note: 'Autovalutazione interna: punti deboli nella governance della parità e nelle opportunità di crescita delle donne.' };
const AGRO_PDR = { scores: { cultura: 75, governance: 70, processiHR: 72, crescita: 60, equita: 62, genitorialita: 74 }, certified: true, certBody: 'Organismo di certificazione Beta (demo)', months: 26, note: 'Certificazione ottenuta dopo l’audit di prima parte; sorveglianza annuale.' };
const FEED_OT = {
  prev: [['M-1', 'Manutenzione straordinaria dei dispositivi di sicurezza delle macchine con verifica documentata', 40], ['M-2', 'Formazione aggiuntiva sui rischi da polveri per tutti gli operai', 30], ['M-3', 'Aspirazione localizzata nella zona di insacco', 40]],
  cur: [['M-1', 'Procedura di blocco e cartellinatura (LOTO) con lucchetti personali e formazione degli addetti', 40, true], ['M-2', 'Linea vita sulla scala dei silos e addestramento all’uso dell’imbracatura', 30, false]],
};
const AGRO_OT = {
  prev: [['M-1', 'Ribaltafusti e carrelli per fusti nel magazzino ADR', 30], ['M-2', 'Formazione aggiuntiva sul rischio chimico per tutto il personale di reparto', 40], ['M-3', 'Docce di emergenza supplementari in reparto liquidi', 40]],
  cur: [['M-1', 'Docce di emergenza e lavaocchi alla stazione di travaso', 30, true], ['M-2', 'Rilevatori di vapori di solvente con allarme nel reparto liquidi', 40, true], ['M-3', 'Addestramento ai respiratori con prova di tenuta per tutti gli addetti', 30, false]],
};

/** Estensore: organico, ore, infortuni, azioni, formazione, retribuzioni pseudonime, PdR 125 e OT23 (solo se le raccolte sono vuote). */
export function demoPersone(d, { today, R } = {}) {
  if (!d || !today || !R) return {};
  if (COLLS.some(c => A(d[c]).length)) return {};
  const agro = sectorOf(d) === 'agrofarmaci';
  const C = agro ? AGRO : FEED;
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const first = addMonths(lastClosed, -11);                  // primo mese del periodo corrente (12 mesi chiusi)
  const monthAt = i => addMonths(first, i);
  const dateAt = (i, day) => { const m = monthAt(i); const x = `${m}-${p2(day)}`; return x > endOfMonth(m) ? endOfMonth(m) : x; };
  const endCur = endOfMonth(lastClosed), endPrev = endOfMonth(addMonths(lastClosed, -12));

  // ---------- organico: fotografia alla fine del periodo corrente e del precedente ----------
  const rowsOf = list => list.map(([category, gender, contract, fullTime, headcount, fte]) => ({ gender, category, contract, fullTime, headcount, fte }));
  const snap = (date, list, h) => ({ id: `hr-${date}`, date, rows: rowsOf(list), country: 'IT', ccnl: C.ccnl, ccnlCoveragePct: 100, minWageOk: true, ...h,
    note: 'Fotografia dal libro unico del lavoro (dato dimostrativo)' });
  const hrSnapshots = [snap(endPrev, C.prev, C.head.prev), snap(endCur, C.cur, C.head.cur)];

  // ---------- ore lavorate: 24 mesi, stagionalità e lavoratori a termine, totali dei due periodi come indicato ----------
  const fteOf = list => sum(list.filter(r => r[2] !== 'determinato'), r => r[5]);
  const tempOf = list => sum(list.filter(r => r[2] === 'determinato'), r => r[4]);
  const raw = [];
  for (let i = -12; i < 12; i++) {
    const m = monthAt(i), mo = +m.slice(5, 7), list = i < 0 ? C.prev : C.cur;
    const base = fteOf(list) * 1690 / 12 * C.season[mo - 1] * (1 + R.normal(0, 0.012));
    const temp = C.seasonal.includes(mo) ? tempOf(list) * 152 * C.season[mo - 1] : 0;
    raw.push({ m, i, h: base + temp });
  }
  const scale = (from, to, target) => { const xs = raw.filter(x => x.i >= from && x.i < to); const k = target / sum(xs, x => x.h); for (const x of xs) x.h *= k; };
  scale(-12, 0, C.hours.prev); scale(0, 12, C.hours.cur);
  const agencyN = h => (h.i < 0 ? C.head.prev.agency : C.head.cur.agency);
  const hoursWorked = raw.map(x => {
    const mo = +x.m.slice(5, 7);
    return { id: x.m, month: x.m, hours: r10(x.h), overtime: r10(x.h * (0.022 + 0.01 * R.next())), agencyHours: r10(agencyN(x) * 140 * C.season[mo - 1]),
      absenceHours: r10(x.h * (0.055 + 0.03 * R.next())), note: 'Dal libro unico del lavoro (dato dimostrativo)' };
  });
  // la somma dei mesi arrotondati torna al totale indicato (correzione sull'ultimo mese di ogni periodo)
  for (const [from, to, target] of [[0, 12, C.hours.prev], [12, 24, C.hours.cur]]) {
    const xs = hoursWorked.slice(from, to), diff = target - sum(xs, x => x.hours);
    xs[xs.length - 1].hours += diff;
  }

  // ---------- infortuni e quasi infortuni ----------
  const EV = agro ? AGRO_EV : FEED_EV;
  const yearOf = s => s.slice(0, 4);
  let nInail = 0;
  const injuries = EV.map(([i, day, kind, lineId, area, cause, recordable, lostDays, note], k) => {
    const date = dateAt(i, day);
    const den = kind === 'infortunio' && lostDays >= 1 || kind === 'in-itinere';
    return { id: `inj-${p2(k + 1)}`, date, kind, lineId: lineId || null, area, cause, recordable: kind === 'infortunio' ? recordable : false, lostDays, convDays: 0, fatal: false,
      inailRef: den ? `${yearOf(date)}/DEMO-${p2(++nInail)}` : '', status: 'chiuso', note };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
  const evId = k => `inj-${p2(k + 1)}`;
  const ACT = agro ? AGRO_ACT : FEED_ACT;
  const safetyActions = ACT.map(([k, text, owner, due, status], j) => {
    const dueD = Array.isArray(due) ? dateAt(due[0], due[1]) : addDays(today, due);
    return { id: `sa-${p2(j + 1)}`, injuryId: k == null ? null : evId(k), text, owner, due: dueD, status, closedAt: status === 'chiusa' ? addDays(dueD, -5) : null, note: '' };
  });

  // ---------- formazione ----------
  const TR = agro ? AGRO_TR : FEED_TR;
  const trainings = TR.map(([key, when, day, course, topic, hours, partF, partM, mandatory, validMonths, series]) => {
    const date = typeof when === 'object' ? addMonths(addDays(today, when.due), -when.months) : dateAt(when, day);
    return { id: `tr-${key}`, date, course, topic, hours, partF, partM, mandatory, validMonths: validMonths || null, nextDue: null, series: series || null,
      provider: mandatory ? 'Ente di formazione accreditato (demo)' : 'Formazione interna (demo)', note: '' };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---------- retribuzioni pseudonime del periodo corrente ----------
  const periodKey = `12m-${lastClosed}`;
  const rows = [];
  for (const [category, gender, contract, fullTime, headcount, fte] of C.cur) {
    const [base, varShare] = C.pay[category];
    for (let k = 0; k < headcount; k++) {
      const e = fullTime ? 1 : round(fte / headcount, 2);
      const lvl = contract === 'apprendistato' ? 0.8 : contract === 'determinato' ? 0.9 : 1;
      const wf = gender === 'F' && C.womenFactor ? C.womenFactor[category] : 1;
      const rate = base * lvl * wf * (1 + R.normal(0, category === 'dirigenti' ? 0.06 : 0.045));
      const variable = contract === 'determinato' ? 0 : rate * varShare * (0.8 + 0.4 * R.next());
      rows.push({ category, gender, contract, fte: e, rate, variable });
    }
  }
  if (C.payGap != null) {
    // tara la media delle donne sul divario dichiarato nel questionario
    const pay = r => r.rate + r.variable;
    const mM = sum(rows.filter(r => r.gender === 'M'), pay) / rows.filter(r => r.gender === 'M').length;
    const mF = sum(rows.filter(r => r.gender === 'F'), pay) / rows.filter(r => r.gender === 'F').length;
    const k = mM * (1 - C.payGap) / mF;
    for (const r of rows) if (r.gender === 'F') { r.rate *= k; r.variable *= k; }
  }
  const LEVEL = agro ? { dirigenti: 'D', quadri: 'A1', impiegati: 'C1', operai: 'E1' } : { dirigenti: 'D', quadri: 'Q', impiegati: '2°', operai: '4°' };
  const order = R.shuffle(rows.map((_, i) => i));
  const payData = order.map((i, n) => {
    const r = rows[i];
    return { id: `pay-${periodKey}-${p2(n + 1)}`, periodKey, code: `P${String(n + 101)}`, gender: r.gender, category: r.category, level: r.contract === 'apprendistato' ? 'appr.' : LEVEL[r.category],
      fte: r.fte, baseAnnual: r10(r.rate * r.fte), variableAnnual: r10(r.variable * r.fte) };
  });

  // ---------- PdR 125 e OT23 ----------
  const y = +today.slice(0, 4);
  const P = agro ? AGRO_PDR : FEED_PDR;
  const pdr125 = [{ id: `pdr-${y}`, year: y, scores: { ...P.scores }, certified: P.certified, certBody: P.certBody || '', certExpiry: P.certified ? addMonths(today, P.months) : null, note: P.note }];
  const oy = today.slice(5, 10) <= '03-30' ? y - 1 : y;
  const O = agro ? AGRO_OT : FEED_OT;
  const ms = (list, yr, allDone) => list.map(([code, title, points, done], k) => ({ code, title, points, done: allDone ? true : done, date: `${yr}-${p2(3 + k * 3)}-15`, evidenceIds: [] }));
  const ot23 = [
    { id: `ot23-${oy - 1}`, year: oy - 1, measures: ms(O.prev, oy - 1, true), submittedAt: `${oy}-02-24`, outcome: 'accolta', note: 'Riduzione del tasso applicata all’autoliquidazione (dato dimostrativo)' },
    { id: `ot23-${oy}`, year: oy, measures: ms(O.cur, oy, false), submittedAt: null, outcome: 'in preparazione', note: '' },
  ];

  return { add: { hrSnapshots, hoursWorked, injuries, safetyActions, trainings, payData, pdr125, ot23 } };
}
