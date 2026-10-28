/* DifesaOS · Edizione «agrofarmaci» (difesa delle colture): metadati senza dipendenze.
 * Stesso codice di FeedOS: le aree comuni restano, si aggiungono le aree Regolatorio e Prodotti, si nascondono le parti solo da mangimificio
 * (formulazione a costo minimo, gemello del mangimificio, impronta dei mangimi, EUDR della soia, questionario e registro della tesi).
 * Nome «DifesaOS» scelto il 28/10/2026 dopo una ricerca sul web senza omonimi (lontano da «Fitos», FitoFarma, FitoAid, FitoSER);
 * prima della vendita resta da fare la ricerca di anteriorità nei registri dei marchi (UIBM, EUIPO). */
export const META = {
  id: 'agrofarmaci',
  product: 'DifesaOS',
  version: '1.0',
  storageKey: 'difesaos1',
  priceUnit: 'unit',            // prezzi in € per kg o per litro (unità di vendita del prodotto), medie in €/kg         // archivio separato da FeedOS anche quando i due file si aprono dallo stesso computer
  sector: 'agrofarmaci',
  companyFallback: 'Agrofarmaci',
  areaIds: ['oggi', 'direzione', 'finanza', 'regolatorio', 'prodotti', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia', 'esg', 'dati'],
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
    { id: 'direzione', label: 'Direzione', short: 'Direzione', top: 3, areas: ['oggi', 'direzione', 'finanza', 'economia', 'commerciale', 'prodotti', 'regolatorio', 'acquisti', 'produzione', 'qualita', 'esg', 'dati'] },
    { id: 'formulazione', label: 'Regolatorio e tecnico', short: 'Regolatorio', areas: ['oggi', 'regolatorio', 'prodotti', 'qualita', 'produzione', 'esg', 'acquisti', 'commerciale', 'economia', 'direzione', 'finanza', 'dati'] },
    { id: 'acquisti', label: 'Acquisti e magazzino', short: 'Acquisti', areas: ['oggi', 'acquisti', 'produzione', 'regolatorio', 'prodotti', 'economia', 'qualita', 'commerciale', 'esg', 'direzione', 'finanza', 'dati'] },
    { id: 'produzione', label: 'Produzione e HSE', short: 'Produzione', areas: ['oggi', 'produzione', 'regolatorio', 'prodotti', 'acquisti', 'qualita', 'esg', 'economia', 'commerciale', 'direzione', 'finanza', 'dati'] },
    { id: 'qualita', label: 'Qualità', short: 'Qualità', areas: ['oggi', 'qualita', 'regolatorio', 'prodotti', 'produzione', 'acquisti', 'commerciale', 'esg', 'economia', 'direzione', 'finanza', 'dati'] },
    { id: 'commerciale', label: 'Commerciale', short: 'Commerciale', areas: ['oggi', 'commerciale', 'prodotti', 'economia', 'regolatorio', 'qualita', 'produzione', 'acquisti', 'esg', 'direzione', 'finanza', 'dati'] },
    { id: 'agente', label: 'Agente di zona', short: 'Agente', areas: ['oggi', 'commerciale', 'prodotti', 'regolatorio', 'qualita', 'esg'] },
  ],
};
