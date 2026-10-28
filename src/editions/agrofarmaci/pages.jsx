/* DifesaOS · pagine dell'edizione agrofarmaci: aree Regolatorio e Prodotti, Commerciale › Campagne e premi, ESG › CO₂ dei programmi
 * di difesa, e la presentazione guidata dell'edizione. */
import { Regolatorio } from './regolatorio.jsx';
import { Campagne } from './campagne.jsx';
import { Co2Programmi } from './co2.jsx';
import { Prodotti } from './prodotti.jsx';

export const PAGES = { regolatorio: Regolatorio, prodotti: Prodotti };
export const TAB_PAGES = { 'commerciale.campagne': Campagne, 'esg.co2': Co2Programmi };

/** Passi della presentazione guidata (stesso formato di app/Tour.jsx). */
export const TOUR_STEPS = [
  { to: ['oggi', 'decisioni'], sel: '#oggi-decisioni', title: 'Le decisioni del giorno', text: 'Ogni mattina DifesaOS mette in ordine ciò che va deciso: rinnovi da presentare, schede di sicurezza da inviare, Seveso, ordini anticipati, crediti e margini. Ogni voce dice perché e cosa fare.' },
  { to: ['regolatorio', 'registrazioni'], sel: '#reg-deadlines', title: 'Scadenze regolatorie', text: 'Rinnovi dell’art. 43, revoche con le date di vendita e impiego, nuove etichette e scadenze delle sostanze attive in un’unica lista, con i ricavi a rischio per prodotto.' },
  { to: ['regolatorio', 'registrazioni'], sel: '#reg-uses', title: 'Usi in etichetta', text: 'Per coltura: avversità, dosi per ettolitro e per ettaro, trattamenti e carenza dei prodotti registrati. Si esporta per i tecnici e per i registri dei clienti.' },
  { to: ['regolatorio', 'sds'], sel: '#sds-gaps', title: 'Schede di sicurezza', text: 'Quando una scheda cambia, DifesaOS sa a quali clienti va mandata (quelli serviti negli ultimi 12 mesi) e controlla UFI e notifica ai centri antiveleni.' },
  { to: ['regolatorio', 'seveso'], sel: '#sev-index', title: 'Seveso e ADR', text: 'Indici di sommatoria calcolati sulle giacenze di oggi, simulazione prima di produrre per la campagna e punti ADR di ogni spedizione.' },
  { to: ['prodotti', 'report'], sel: '.pr-report', title: 'Report prodotto', text: 'Una scheda stampabile per ogni prodotto: usi in etichetta, prove di campo con foto e statistica, vendite, prezzi della concorrenza a ettaro, costi e leve di risparmio. La versione per i clienti toglie costi e margini.' },
  { to: ['prodotti', 'risparmi'], sel: '#ris-strategia', title: 'Più margine o prezzo più basso', text: 'Le leve di risparmio misurate sui dati (fornitori, lotti d’acquisto, titolo, scarti) e quelle stimate; poi si sceglie quanto tenerne come margine e quanto passarne al prezzo, con il confronto a ettaro contro i concorrenti.' },
  { to: ['commerciale', 'campagne'], sel: '#camp-curve', title: 'Campagne e premi', text: 'Ordini anticipati contro l’anno prima alla stessa data, per agente e categoria; premi di fine campagna sugli obiettivi e resi con tetto.' },
  { to: ['esg', 'co2', 'olivo'], sel: '#co2-summary', title: 'CO₂ dei programmi di difesa', text: 'Per olivo, vite e melo: kg di CO₂ per ettaro e per kg di raccolto o di olio del programma consigliato e dell’alternativa, con il rame per ettaro. Un argomento di vendita misurabile per cooperative e frantoi.' },
];
