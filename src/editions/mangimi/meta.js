/* FeedOS · Edizione «mangimi» (mangimificio): metadati senza dipendenze (li usano router, ruoli e salvataggio anche in node).
 * Un solo codice, due edizioni: la build sceglie i metadati con editions/meta.js (vedi build.mjs). */
export const META = {
  id: 'mangimi',
  product: 'FeedOS',
  version: null,                 // null = la versione dell'app (src/app/version.js)
  storageKey: 'feedos16',        // database e chiavi del browser: invariati per gli archivi già salvati
  sector: 'mangimi',
  companyFallback: 'Mangimificio',
  areaIds: ['oggi', 'direzione', 'finanza', 'gemello', 'formulazione', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia', 'esg', 'dati'],
  hiddenTabs: {},                // { area: [tabId…] } schede da non mostrare in questa edizione
  extraTabs: {},                 // { area: [{id, label, after}] } schede in più (pagine in editions/<id>/app.js · TAB_PAGES)
  areaOverrides: {},             // { area: {label?, lead?} }
  labels: { species: 'Specie', unitT: 't', demoCompany: 'Mangimificio di fantasia', search: 'Cerca una formula, un lotto, un cliente o un comando…', palette: '«margine suino», «scorte mais», «richiamo M01», «e se mais +10%»', paletteEmpty: '«scorte mais»' },
  roles: null,                   // null = i ruoli di base (core/roles.js)
};
