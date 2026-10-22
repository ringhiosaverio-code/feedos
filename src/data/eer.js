/* FeedOS 16 · Codici EER più frequenti in un mangimificio (Elenco europeo dei rifiuti, Decisione 2000/532/CE).
 * L'asterisco indica un rifiuto pericoloso. «recoverable»: di norma avviabile a recupero (operazioni R). Elenco di
 * partenza da verificare con il formulario e il registro di carico e scarico: si possono registrare anche altri codici. */
export const EER = [
  { code: '02 03 04', name: 'Scarti inutilizzabili per il consumo o la trasformazione', hint: 'spazzature di linea, prodotto non conforme', recoverable: true },
  { code: '15 01 01', name: 'Imballaggi in carta e cartone', hint: 'sacchi di carta, cartoni', recoverable: true },
  { code: '15 01 02', name: 'Imballaggi in plastica', hint: 'film, sacchi in polietilene, big bag', recoverable: true },
  { code: '15 01 03', name: 'Imballaggi in legno', hint: 'pallet non riutilizzabili', recoverable: true },
  { code: '15 01 04', name: 'Imballaggi metallici', hint: 'fusti e latte vuoti non contaminati', recoverable: true },
  { code: '15 01 06', name: 'Imballaggi in materiali misti', recoverable: true },
  { code: '15 01 10*', name: 'Imballaggi contenenti residui di sostanze pericolose o contaminati', hint: 'confezioni di additivi, detergenti, oli' },
  { code: '15 02 02*', name: 'Assorbenti, materiali filtranti e stracci contaminati da sostanze pericolose', hint: 'stracci sporchi d’olio' },
  { code: '15 02 03', name: 'Assorbenti, materiali filtranti e stracci non pericolosi', hint: 'maniche dei filtri, indumenti' },
  { code: '13 02 05*', name: 'Oli minerali per motori, ingranaggi e lubrificazione, non clorurati', hint: 'oli esausti di riduttori e presse', recoverable: true },
  { code: '16 06 01*', name: 'Batterie al piombo', hint: 'carrelli elevatori', recoverable: true },
  { code: '17 04 05', name: 'Ferro e acciaio', hint: 'rottami di manutenzione, matrici usurate', recoverable: true },
  { code: '16 02 14', name: 'Apparecchiature fuori uso', recoverable: true },
  { code: '20 01 21*', name: 'Tubi fluorescenti e altri rifiuti contenenti mercurio', recoverable: true },
  { code: '08 03 18', name: 'Toner per stampa esauriti', recoverable: true },
  { code: '20 03 04', name: 'Fanghi delle fosse settiche' },
  { code: '20 03 01', name: 'Rifiuti urbani non differenziati' },
];
export const EER_BY_CODE = Object.fromEntries(EER.map(e => [e.code, e]));
export const isHazardous = code => /\*\s*$/.test(String(code || ''));

/* FeedOS 18 · Operazioni di recupero (R) e smaltimento (D) dichiarate nel formulario: allegati C e B alla parte IV del
 * D.Lgs. 152/2006 (testi abbreviati). R13 e D15 sono le operazioni preliminari (messa in riserva, deposito preliminare). */
export const WASTE_OPS = [
  { code: 'R1', dest: 'recupero', label: 'Utilizzo principale come combustibile o per produrre energia' },
  { code: 'R2', dest: 'recupero', label: 'Rigenerazione o recupero di solventi' },
  { code: 'R3', dest: 'recupero', label: 'Riciclo o recupero di sostanze organiche (compreso il compostaggio)' },
  { code: 'R4', dest: 'recupero', label: 'Riciclo o recupero di metalli e composti metallici' },
  { code: 'R5', dest: 'recupero', label: 'Riciclo o recupero di altre sostanze inorganiche' },
  { code: 'R6', dest: 'recupero', label: 'Rigenerazione di acidi o basi' },
  { code: 'R7', dest: 'recupero', label: 'Recupero di prodotti che servono a ridurre l’inquinamento' },
  { code: 'R8', dest: 'recupero', label: 'Recupero di prodotti dai catalizzatori' },
  { code: 'R9', dest: 'recupero', label: 'Rigenerazione o altri reimpieghi degli oli' },
  { code: 'R10', dest: 'recupero', label: 'Spandimento sul suolo a beneficio dell’agricoltura' },
  { code: 'R11', dest: 'recupero', label: 'Utilizzo di rifiuti ottenuti dalle operazioni da R1 a R10' },
  { code: 'R12', dest: 'recupero', label: 'Scambio di rifiuti per le operazioni da R1 a R11' },
  { code: 'R13', dest: 'recupero', label: 'Messa in riserva prima delle operazioni da R1 a R12' },
  { code: 'D1', dest: 'smaltimento', label: 'Deposito sul o nel suolo (per esempio discarica)' },
  { code: 'D2', dest: 'smaltimento', label: 'Trattamento in ambiente terrestre' },
  { code: 'D3', dest: 'smaltimento', label: 'Iniezioni in profondità' },
  { code: 'D4', dest: 'smaltimento', label: 'Lagunaggio' },
  { code: 'D5', dest: 'smaltimento', label: 'Messa in discarica specialmente allestita' },
  { code: 'D6', dest: 'smaltimento', label: 'Scarico nell’ambiente idrico (eccetto l’immersione)' },
  { code: 'D7', dest: 'smaltimento', label: 'Immersione, compreso il seppellimento nel sottosuolo marino' },
  { code: 'D8', dest: 'smaltimento', label: 'Trattamento biologico' },
  { code: 'D9', dest: 'smaltimento', label: 'Trattamento fisico-chimico' },
  { code: 'D10', dest: 'smaltimento', label: 'Incenerimento a terra' },
  { code: 'D11', dest: 'smaltimento', label: 'Incenerimento in mare (vietato)' },
  { code: 'D12', dest: 'smaltimento', label: 'Deposito permanente' },
  { code: 'D13', dest: 'smaltimento', label: 'Raggruppamento preliminare prima delle operazioni da D1 a D12' },
  { code: 'D14', dest: 'smaltimento', label: 'Ricondizionamento preliminare prima delle operazioni da D1 a D13' },
  { code: 'D15', dest: 'smaltimento', label: 'Deposito preliminare prima delle operazioni da D1 a D14' },
];
/** Operazione di base per la destinazione: R13 per il recupero, D15 per lo smaltimento. */
export const defaultWasteOp = dest => (dest === 'smaltimento' ? 'D15' : 'R13');
