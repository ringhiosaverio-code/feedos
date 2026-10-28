/* FitoOS · Edizione «agrofarmaci» (difesa delle colture): metadati senza dipendenze.
 * Stesso codice di FeedOS: le aree comuni restano, si aggiunge l'area Regolatorio, si nascondono le parti solo da mangimificio
 * (formulazione a costo minimo, gemello del mangimificio, impronta dei mangimi, EUDR della soia, questionario e registro della tesi).
 * Nome del prodotto provvisorio («FitoOS»), da verificare prima di un uso commerciale. */
export const META = {
  id: 'agrofarmaci',
  product: 'FitoOS',
  version: '1.0',
  storageKey: 'fitoos1',         // archivio separato da FeedOS anche quando i due file si aprono dallo stesso computer
  sector: 'agrofarmaci',
  companyFallback: 'Agrofarmaci',
  areaIds: ['oggi', 'direzione', 'finanza', 'regolatorio', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia', 'esg', 'dati'],
  hiddenTabs: {
    esg: ['cruscotto', 'passaporto', 'filiera', 'indicatori', 'questionario'],
    economia: ['scenari'],
    qualita: ['analisi'],
    acquisti: ['mercati'],
  },
  extraTabs: {
    commerciale: [{ id: 'campagne', label: 'Campagne e premi', after: 'offerte' }],
    esg: [{ id: 'co2', label: 'CO₂ dei programmi di difesa', after: 'clima' }],
  },
  areaOverrides: {
    acquisti: { lead: 'Dal piano di produzione ai fabbisogni di sostanze attive tecniche, coformulanti e imballi, con magazzino, ordini, fornitori e varianze di prezzo.' },
    produzione: { lead: 'Piano delle linee di formulazione e confezionamento, registro dei lotti, OEE e fermi, energia per tonnellata, manutenzione e bilancio di massa.' },
    qualita: { lead: 'Lotti di prodotto e di materie prime, reclami e richiamo con bilancio di massa.' },
    commerciale: { lead: 'Rivenditori, consorzi e cooperative: offerte con margine in tempo reale, listino, campagne con ordini anticipati e premi di fine stagione, visite, agenti e provvigioni.' },
    economia: { lead: 'Margini al costo effettivo, redditività per cliente, prodotto e agente, punto di pareggio e previsioni verificate sul passato.' },
    esg: { lead: 'Clima, CO₂ dei programmi di difesa consigliati ai clienti, registri ambientali, persone, governance, obiettivi, rischi e report VSME, con il punto C8 per il codice NACE 20.20.' },
  },
  labels: { species: 'Categoria', unitT: 't eq.', demoCompany: 'Azienda di fantasia', search: 'Cerca un prodotto, un lotto, un cliente o un comando…', palette: '«margine cuprarvo», «scorte rame», «richiamo CU30», «dove è finito CU30»', paletteEmpty: '«scorte rame»' },
  roles: [
    { id: 'direzione', label: 'Direzione', short: 'Direzione', top: 3, areas: ['oggi', 'direzione', 'finanza', 'economia', 'commerciale', 'regolatorio', 'acquisti', 'produzione', 'qualita', 'esg', 'dati'] },
    { id: 'formulazione', label: 'Regolatorio e tecnico', short: 'Regolatorio', areas: ['oggi', 'regolatorio', 'qualita', 'produzione', 'esg', 'acquisti', 'commerciale', 'economia', 'direzione', 'finanza', 'dati'] },
    { id: 'acquisti', label: 'Acquisti e magazzino', short: 'Acquisti', areas: ['oggi', 'acquisti', 'produzione', 'regolatorio', 'economia', 'qualita', 'commerciale', 'esg', 'direzione', 'finanza', 'dati'] },
    { id: 'produzione', label: 'Produzione e HSE', short: 'Produzione', areas: ['oggi', 'produzione', 'regolatorio', 'acquisti', 'qualita', 'esg', 'economia', 'commerciale', 'direzione', 'finanza', 'dati'] },
    { id: 'qualita', label: 'Qualità', short: 'Qualità', areas: ['oggi', 'qualita', 'regolatorio', 'produzione', 'acquisti', 'commerciale', 'esg', 'economia', 'direzione', 'finanza', 'dati'] },
    { id: 'commerciale', label: 'Commerciale', short: 'Commerciale', areas: ['oggi', 'commerciale', 'economia', 'regolatorio', 'qualita', 'produzione', 'acquisti', 'esg', 'direzione', 'finanza', 'dati'] },
    { id: 'agente', label: 'Agente di zona', short: 'Agente', areas: ['oggi', 'commerciale', 'regolatorio', 'qualita', 'esg'] },
  ],
};
