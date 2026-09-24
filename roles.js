/* FeedOS 16 · Ruoli: cambiano l'ordine del menu e ciò che la pagina «Oggi» mette in primo piano.
 * Non sono permessi di sicurezza: nella versione locale chiunque usi il browser vede tutti i dati. */
export const ROLES = [
  { id: 'direzione', label: 'Direzione', short: 'Direzione', areas: ['oggi', 'economia', 'gemello', 'commerciale', 'acquisti', 'produzione', 'qualita', 'formulazione', 'esg', 'dati'] },
  { id: 'formulazione', label: 'Formulazione e nutrizione', short: 'Formulazione', areas: ['oggi', 'formulazione', 'acquisti', 'qualita', 'economia', 'produzione', 'esg', 'gemello', 'commerciale', 'dati'] },
  { id: 'acquisti', label: 'Acquisti e magazzino', short: 'Acquisti', areas: ['oggi', 'acquisti', 'formulazione', 'produzione', 'economia', 'qualita', 'gemello', 'commerciale', 'esg', 'dati'] },
  { id: 'produzione', label: 'Produzione', short: 'Produzione', areas: ['oggi', 'produzione', 'gemello', 'acquisti', 'qualita', 'formulazione', 'esg', 'economia', 'commerciale', 'dati'] },
  { id: 'qualita', label: 'Qualità e sicurezza alimentare', short: 'Qualità', areas: ['oggi', 'qualita', 'produzione', 'formulazione', 'acquisti', 'commerciale', 'esg', 'gemello', 'economia', 'dati'] },
  { id: 'commerciale', label: 'Commerciale', short: 'Commerciale', areas: ['oggi', 'commerciale', 'economia', 'qualita', 'produzione', 'gemello', 'formulazione', 'acquisti', 'esg', 'dati'] },
  { id: 'agente', label: 'Agente di zona', short: 'Agente', areas: ['oggi', 'commerciale', 'qualita', 'esg', 'gemello'] },
];
export const ROLE = Object.fromEntries(ROLES.map(r => [r.id, r]));

export const AREA_META = {
  oggi: { label: 'Oggi', lead: 'Quello che richiede una decisione, spiegato con i numeri.' },
  gemello: { label: 'Gemello digitale', lead: 'Lo stabilimento in un solo disegno: flussi di materia, energia, costo e CO₂ dell’ultimo mese.' },
  formulazione: { label: 'Formulazione', lead: 'Formule a costo minimo con prezzi ombra, controllo contaminanti, CO₂ e cartellino.' },
  acquisti: { label: 'Acquisti e mercati', lead: 'Dal piano di produzione ai fabbisogni di materie prime, con scorte, ordini e quotazioni.' },
  produzione: { label: 'Produzione', lead: 'Piano delle linee, registrazioni di produzione ed energia per tonnellata.' },
  qualita: { label: 'Qualità e tracciabilità', lead: 'Lotti, analisi, contaminanti, reclami e richiamo con bilancio di massa.' },
  commerciale: { label: 'Commerciale', lead: 'Clienti, offerte con margine in tempo reale, listino, visite e rete agenti.' },
  economia: { label: 'Economia', lead: 'Costo pieno e margine per tonnellata, previsioni verificate e simulatore «E se…».' },
  esg: { label: 'ESG e tesi', lead: 'I 49 indicatori della tesi alimentati dai dati di ogni giorno, energia e CO₂, VSME e report.' },
  dati: { label: 'Dati', lead: 'Archivio, salvataggi, importazioni, registro delle modifiche e impostazioni.' },
};
