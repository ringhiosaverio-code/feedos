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
