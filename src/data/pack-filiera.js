/* FeedOS 18 · Pacchetto di contenuti «filiera» integrato (WP3 EUDR e fornitori). File senza dipendenze.
 * Voci (kind): 'rischio-paesi' (classificazione dei paesi per il rischio di deforestazione), 'nc' (codici NC dell'allegato I con
 * le parole chiave per suggerire la classificazione delle materie prime), 'schema' (schemi di certificazione: data limite,
 * senza conversione, benchmark FEFAC SSG, catene di custodia), 'scadenza' e 'controllo' (date di applicazione), 'obbligo'
 * (obblighi per ruolo). Ogni voce porta fonte e stato ('verificato' | 'da verificare'); il pacchetto la data «valido al».
 * sectors: edizioni a cui si applica la voce ('mangimi' = FeedOS mangimifici, 'agrofarmaci' = seconda edizione).
 * Un pacchetto importato con versione più recente (settings.esg18.packs.filiera) sostituisce questo (src/engine/esg-packs.js). */

const EU27 = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
const BOTH = ['mangimi', 'agrofarmaci'];
const FEED = ['mangimi'];
const EUDR = 'Reg. (UE) 2023/1115 come modificato dal Reg. (UE) 2025/2650';
const ANNEX = 'Reg. (UE) 2023/1115, allegato I';

export const PACK_FILIERA = {
  pack: 'filiera',
  version: '2026.1',
  validAsOf: '2026-10-21',
  source: 'Reg. (UE) 2023/1115 (EUDR), Reg. (UE) 2025/2650, Reg. di esecuzione (UE) 2025/1093, FEFAC Soy Sourcing Guidelines',
  items: [
    /* ---------- classificazione dei paesi (rischio di deforestazione) ---------- */
    { id: 'paesi-pre-2025', kind: 'rischio-paesi', tier: 'standard', all: true, from: '2023-06-29', to: '2025-06-11',
      label: 'Prima della classificazione: tutti i paesi a rischio standard', source: 'Reg. (UE) 2023/1115, art. 29', status: 'da verificare' },
    { id: 'paesi-alto-2025', kind: 'rischio-paesi', tier: 'alto', countries: ['BY', 'KP', 'MM', 'RU'], from: '2025-06-12',
      label: 'Paesi ad alto rischio: Bielorussia, Corea del Nord, Myanmar, Russia', source: 'Reg. di esecuzione (UE) 2025/1093 della Commissione', status: 'verificato',
      note: 'Revisione dell’elenco prevista nel 2026; data di entrata in vigore da verificare sulla Gazzetta ufficiale.' },
    { id: 'paesi-basso-ue', kind: 'rischio-paesi', tier: 'basso', countries: EU27, from: '2025-06-12',
      label: 'Stati membri dell’UE a basso rischio', source: 'Reg. di esecuzione (UE) 2025/1093 della Commissione', status: 'da verificare' },
    { id: 'paesi-basso-uy', kind: 'rischio-paesi', tier: 'basso', countries: ['UY'], from: '2025-06-12',
      label: 'Uruguay a basso rischio', source: 'Reg. di esecuzione (UE) 2025/1093 della Commissione', status: 'verificato' },
    { id: 'paesi-basso-altri', kind: 'rischio-paesi', tier: 'basso', countries: ['US', 'CA', 'GB', 'NO', 'CH', 'IS', 'AU', 'NZ', 'JP', 'CN'], from: '2025-06-12',
      label: 'Altri paesi a basso rischio (elenco parziale)', source: 'Reg. di esecuzione (UE) 2025/1093 della Commissione', status: 'da verificare',
      note: 'Elenco parziale dei circa 140 paesi a basso rischio: un paese non elencato resta a rischio standard (scelta prudente).' },
    { id: 'paesi-standard-2025', kind: 'rischio-paesi', tier: 'standard', countries: ['BR', 'AR', 'PY', 'BO', 'ID', 'MY'], from: '2025-06-12',
      label: 'Paesi a rischio standard (tra cui Brasile, Argentina, Paraguay, Indonesia, Malaysia)', source: 'Reg. di esecuzione (UE) 2025/1093 della Commissione', status: 'verificato',
      note: 'I paesi non elencati sono a rischio standard.' },

    /* ---------- codici NC dell'allegato I e parole chiave (priorità bassa = controllata prima) ---------- */
    { id: 'nc-escl-lecitina', kind: 'nc', commodity: null, hs: '2923 20', inScope: false, priority: 0, label: 'Lecitina (NC 2923): non compresa nell’allegato I',
      keywords: ['lecitina', 'lecithin'], sectors: BOTH, source: ANNEX, status: 'da verificare' },
    { id: 'nc-escl-proteine-soia', kind: 'nc', commodity: null, hs: '2106 10', inScope: false, priority: 0, label: 'Concentrati e isolati proteici di soia (NC 2106): non compresi nell’allegato I',
      keywords: ['concentrato proteico di soia', 'proteine di soia concentrate', 'isolato proteico di soia', 'soy protein concentrate', 'soy protein isolate'], sectors: FEED, source: ANNEX, status: 'da verificare' },
    { id: 'nc-1507', kind: 'nc', commodity: 'soia', hs: '1507', inScope: true, priority: 1, label: 'Olio di soia e sue frazioni',
      keywords: ['olio di soia', 'olio soia', 'olio di semi di soia', 'oleina di soia', 'soybean oil', 'soya oil', 'soy oil', 'soya bean oil'], sectors: BOTH, source: ANNEX, status: 'verificato' },
    { id: 'nc-2304', kind: 'nc', commodity: 'soia', hs: '2304 00', inScope: true, priority: 2, label: 'Panelli e altri residui solidi dell’estrazione dell’olio di soia (farina di estrazione)',
      keywords: ['estrazione di soia', 'farina di soia', 'panello di soia', 'expeller di soia', 'soia decorticata', 'soia 44', 'soia 46', 'soia 48', 'soybean meal', 'soya bean meal', 'soya meal', 'soymeal', 'sojaschrot'], sectors: FEED, source: ANNEX, status: 'verificato' },
    { id: 'nc-1208', kind: 'nc', commodity: 'soia', hs: '1208 10', inScope: true, priority: 2, label: 'Farina di fave di soia',
      keywords: ['farina di fave di soia', 'soy flour', 'soya flour'], sectors: FEED, source: ANNEX, status: 'verificato' },
    { id: 'nc-1201', kind: 'nc', commodity: 'soia', hs: '1201 90', inScope: true, priority: 3, label: 'Fave (semi) di soia, anche frantumate, tostate o estruse',
      keywords: ['soia integrale', 'semi di soia', 'seme di soia', 'fave di soia', 'soia tostata', 'soia estrusa', 'soybeans', 'soya beans', 'full fat soy', 'full-fat soy'], sectors: FEED, source: ANNEX, status: 'verificato',
      note: 'Per i semi tostati o estrusi verificare il codice NC con lo spedizioniere.' },
    { id: 'nc-soia', kind: 'nc', commodity: 'soia', hs: null, inScope: true, priority: 9, label: 'Prodotto a base di soia: codice NC da verificare',
      keywords: ['soia', 'soya', 'soja', 'soybean'], sectors: BOTH, source: ANNEX, status: 'da verificare' },
    { id: 'nc-2306-60', kind: 'nc', commodity: 'palma', hs: '2306 60', inScope: true, priority: 1, label: 'Panelli di noci o di mandorle di palmisto (farina o expeller di palmisto)',
      keywords: ['panello di palmist', 'farina di palmist', 'expeller di palmist', 'palm kernel expeller', 'palm kernel meal', 'palm kernel cake', 'pke'], sectors: FEED, source: ANNEX, status: 'verificato' },
    { id: 'nc-3823', kind: 'nc', commodity: 'palma', hs: '3823', inScope: true, priority: 1, label: 'Acidi grassi monocarbossilici industriali di palma (es. PFAD)',
      keywords: ['acidi grassi di palma', 'acidi grassi distillati di palma', 'pfad', 'palm fatty acid'], sectors: BOTH, source: ANNEX, status: 'da verificare' },
    { id: 'nc-saponi-calcio', kind: 'nc', commodity: 'palma', hs: '2915 70', inScope: true, from: '2027-12-30', priority: 1, label: 'Saponi di calcio di acidi grassi di palma (nuovi derivati, dal 30/12/2027)',
      keywords: ['saponi di calcio', 'sapone di calcio', 'calcium soap'], sectors: FEED, source: 'Atto delegato della Commissione del 13/07/2026 sull’allegato I', status: 'da verificare',
      note: 'Non verificato se i saponi di calcio degli acidi grassi di palma rientrano tra i derivati aggiunti dal 2027.' },
    { id: 'nc-1513', kind: 'nc', commodity: 'palma', hs: '1513 21', inScope: true, priority: 2, label: 'Olio di palmisto e sue frazioni',
      keywords: ['olio di palmist', 'palm kernel oil', 'palmisto'], sectors: BOTH, source: ANNEX, status: 'verificato' },
    { id: 'nc-1511', kind: 'nc', commodity: 'palma', hs: '1511', inScope: true, priority: 2, label: 'Olio di palma e sue frazioni (oleina, stearina)',
      keywords: ['olio di palma', 'oleina di palma', 'stearina di palma', 'grasso di palma', 'palm oil', 'palm olein', 'palm stearin'], sectors: BOTH, source: ANNEX, status: 'verificato' },
    { id: 'nc-2905-45', kind: 'nc', commodity: 'palma', hs: '2905 45', inScope: true, priority: 3, label: 'Glicerolo (in ambito se derivato dalla palma da olio)',
      keywords: ['glicerina', 'glicerolo', 'glycerol', 'glycerin'], sectors: BOTH, source: ANNEX, status: 'da verificare' },
    { id: 'nc-palma', kind: 'nc', commodity: 'palma', hs: null, inScope: true, priority: 9, label: 'Prodotto a base di palma: codice NC da verificare',
      keywords: ['palma', 'palm'], sectors: BOTH, source: ANNEX, status: 'da verificare' },
    { id: 'nc-1802', kind: 'nc', commodity: 'cacao', hs: '1802 00', inScope: true, priority: 3, label: 'Gusci, pellicole e altri residui di cacao',
      keywords: ['buccette di cacao', 'gusci di cacao', 'cascami di cacao', 'cocoa shell', 'cocoa husk'], sectors: FEED, source: ANNEX, status: 'da verificare' },
    { id: 'nc-0901', kind: 'nc', commodity: 'caffe', hs: '0901 90', inScope: true, priority: 4, label: 'Pellicole e bucce di caffè',
      keywords: ['pellicole di caffe', 'bucce di caffe', 'coffee husk', 'coffee silverskin'], sectors: FEED, source: ANNEX, status: 'da verificare' },
    { id: 'nc-44', kind: 'nc', commodity: 'legno', hs: '44', inScope: true, priority: 4, label: 'Legno e prodotti del legno (es. farina di legno, lignocellulosa)',
      keywords: ['farina di legno', 'lignocellulosa', 'segatura', 'trucioli di legno', 'wood flour', 'sawdust', 'lignocellulose'], sectors: BOTH, source: ANNEX, status: 'da verificare',
      note: 'Gli imballaggi di legno usati solo come imballaggio sono esclusi (atto delegato del 13/07/2026).' },

    /* ---------- schemi di certificazione ---------- */
    { id: 'schema-rtrs', kind: 'schema', code: 'RTRS', label: 'RTRS (Round Table on Responsible Soy)', commodities: ['soia'], cutoff: '2016-06-01', conversionFree: true, ssg: '2023',
      coc: ['IP', 'segregato', 'bilancio-di-massa', 'crediti'], source: 'FEFAC, esito del benchmark SSG 2023 (aprile 2024)', status: 'da verificare',
      note: 'Data limite di zero deforestazione e zero conversione (giugno 2016) da verificare sul certificato.' },
    { id: 'schema-proterra', kind: 'schema', code: 'ProTerra', label: 'ProTerra', commodities: ['soia'], cutoff: '2008-01-01', conversionFree: true, ssg: '2021',
      coc: ['IP', 'segregato', 'bilancio-di-massa'], source: 'ProTerra Foundation, Environmental Footprint Report 2024; benchmark FEFAC SSG', status: 'da verificare' },
    { id: 'schema-iscc', kind: 'schema', code: 'ISCC', label: 'ISCC EU / ISCC PLUS', commodities: ['soia', 'palma'], cutoff: '2008-01-01', conversionFree: true, ssg: '2021',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, schemi conformi alle SSG 2021', status: 'da verificare',
      note: 'Criteri RED sui terreni ad alto stock di carbonio e ad alta biodiversità: verificare la copertura degli ecosistemi non forestali.' },
    { id: 'schema-cefetra', kind: 'schema', code: 'Cefetra CRS', label: 'Cefetra Certified Responsible Soya', commodities: ['soia'], cutoff: null, conversionFree: true, ssg: '2023',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, esito del benchmark SSG 2023 (aprile 2024)', status: 'da verificare', note: 'Data limite non verificata.' },
    { id: 'schema-amaggi', kind: 'schema', code: 'Amaggi ORIGINS', label: 'Amaggi ORIGINS Field', commodities: ['soia'], cutoff: null, conversionFree: true, ssg: '2023',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, esito del benchmark SSG 2023 (aprile 2024)', status: 'da verificare', note: 'Di solito data limite 2020 (AFi): da verificare sul certificato.' },
    { id: 'schema-cofco', kind: 'schema', code: 'COFCO', label: 'COFCO International, soia responsabile', commodities: ['soia'], cutoff: null, conversionFree: true, ssg: '2023',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, esito del benchmark SSG 2023 (aprile 2024)', status: 'da verificare' },
    { id: 'schema-caramuru', kind: 'schema', code: 'Caramuru Sustentar', label: 'Caramuru Sustentar', commodities: ['soia'], cutoff: null, conversionFree: true, ssg: '2023',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, esito del benchmark SSG 2023 (aprile 2024)', status: 'da verificare' },
    { id: 'schema-ldc', kind: 'schema', code: 'LDC', label: 'Louis Dreyfus Company, soia sostenibile', commodities: ['soia'], cutoff: null, conversionFree: null, ssg: '2021',
      coc: ['segregato', 'bilancio-di-massa'], source: 'FEFAC, schemi conformi alle SSG 2021', status: 'da verificare' },
    { id: 'schema-ssap', kind: 'schema', code: 'US SSAP', label: 'U.S. Soybean Sustainability Assurance Protocol', commodities: ['soia'], cutoff: null, conversionFree: null, ssg: '2021',
      coc: ['bilancio-di-massa'], source: 'FEFAC, schemi conformi alle SSG 2021', status: 'da verificare', note: 'Senza conversione non dimostrato dal protocollo: serve la prova sul lotto.' },
    { id: 'schema-europe-soya', kind: 'schema', code: 'Europe Soya', label: 'Europe Soya / Donau Soja', commodities: ['soia'], cutoff: '2008-01-01', conversionFree: true, ssg: '2021',
      coc: ['IP', 'segregato'], source: 'Donau Soja, standard Europe Soya', status: 'da verificare' },
    { id: 'schema-rspo', kind: 'schema', code: 'RSPO', label: 'RSPO (Roundtable on Sustainable Palm Oil)', commodities: ['palma'], cutoff: '2018-11-15', conversionFree: true, ssg: null,
      coc: ['IP', 'segregato', 'bilancio-di-massa', 'crediti'], source: 'RSPO, Principi e criteri 2018', status: 'da verificare' },
    { id: 'schema-altro', kind: 'schema', code: 'altro', label: 'Altro schema (indicare nella nota)', commodities: ['soia', 'palma'], cutoff: null, conversionFree: null, ssg: null, coc: [], source: '—', status: 'da verificare' },
    { id: 'schema-nessuno', kind: 'schema', code: 'nessuno', label: 'Nessuna certificazione', commodities: ['soia', 'palma'], cutoff: null, conversionFree: null, ssg: null, coc: ['nessuno'], source: '—', status: 'verificato' },

    /* ---------- scadenze e controlli ---------- */
    { id: 'scad-grande-media', kind: 'scadenza', date: '2026-12-30', size: 'grande-media', label: 'EUDR in applicazione per operatori e commercianti grandi e medi',
      law: EUDR, source: 'Reg. (UE) 2025/2650 (GU del 23/12/2025)', status: 'verificato' },
    { id: 'scad-micro-piccola', kind: 'scadenza', date: '2027-06-30', size: 'micro-piccola', label: 'EUDR in applicazione per micro e piccole imprese',
      law: EUDR, source: 'Reg. (UE) 2025/2650 (GU del 23/12/2025)', status: 'verificato' },
    { id: 'scad-palma-derivati', kind: 'scadenza', date: '2027-12-30', commodity: 'palma', label: 'Nuovi derivati della palma da olio nell’allegato I',
      law: 'Atto delegato della Commissione del 13/07/2026 sull’allegato I', source: 'Linklaters, 07/2026', status: 'da verificare', note: 'Pubblicazione in Gazzetta ufficiale non verificata.' },
    { id: 'ctrl-revisione-paesi', kind: 'controllo', date: '2026-12-31', label: 'Revisione prevista della classificazione dei paesi',
      law: 'Reg. di esecuzione (UE) 2025/1093', source: 'Commissione europea: revisione annunciata per il 2026', status: 'da verificare' },

    /* ---------- obblighi per ruolo ---------- */
    { id: 'obb-op-info', kind: 'obbligo', role: 'operatore', text: 'Raccogliere per ogni lotto quantità, paese di produzione e geolocalizzazione di tutti gli appezzamenti (punto sotto i 4 ha, poligono da 4 ha), con la prova di legalità e di assenza di deforestazione dopo il 31/12/2020.',
      law: 'Reg. (UE) 2023/1115, artt. 2 e 9', status: 'da verificare' },
    { id: 'obb-op-rischio', kind: 'obbligo', role: 'operatore', text: 'Valutare il rischio e, se non è trascurabile, attenuarlo prima di immettere il lotto sul mercato; per i paesi a basso rischio vale la dovuta diligenza semplificata.',
      law: 'Reg. (UE) 2023/1115, artt. 10, 11 e 13', status: 'da verificare' },
    { id: 'obb-op-dds', kind: 'obbligo', role: 'operatore', text: 'Presentare la dichiarazione di dovuta diligenza (DDS) nel sistema d’informazione prima dell’immissione sul mercato o dell’esportazione e indicarne il riferimento nella dichiarazione doganale.',
      law: 'Reg. (UE) 2023/1115, art. 4', status: 'da verificare' },
    { id: 'obb-op-archivio', kind: 'obbligo', role: 'operatore', text: 'Conservare la documentazione della dovuta diligenza per 5 anni.', law: 'Reg. (UE) 2023/1115, art. 12', status: 'da verificare' },
    { id: 'obb-pv-rif', kind: 'obbligo', role: 'primo-a-valle', text: 'Raccogliere e conservare i numeri di riferimento delle DDS ricevuti a monte e trasmetterli ai clienti con la merce.', law: EUDR, status: 'verificato' },
    { id: 'obb-pv-info', kind: 'obbligo', role: 'primo-a-valle', text: 'Conservare le informazioni sui fornitori diretti e sui clienti.', law: EUDR, status: 'verificato' },
    { id: 'obb-pv-registro', kind: 'obbligo', role: 'primo-a-valle', text: 'Registrarsi nel sistema d’informazione (imprese che non sono PMI).', law: EUDR, status: 'verificato' },
    { id: 'obb-pv-segnala', kind: 'obbligo', role: 'primo-a-valle', text: 'Segnalare alle autorità competenti le preoccupazioni circostanziate su prodotti non conformi.', law: EUDR, status: 'verificato' },
    { id: 'obb-co-info', kind: 'obbligo', role: 'commerciante', text: 'Conservare le informazioni sui fornitori diretti e sui clienti; nessuna DDS propria e nessun obbligo di raccogliere i riferimenti (orientamenti della Commissione, maggio 2026).', law: EUDR, status: 'da verificare' },
    { id: 'obb-co-segnala', kind: 'obbligo', role: 'commerciante', text: 'Segnalare alle autorità competenti le preoccupazioni circostanziate su prodotti non conformi.', law: EUDR, status: 'verificato' },
    { id: 'obb-fa-ambito', kind: 'obbligo', role: 'fuori-ambito', sectors: FEED, text: 'Nessun obbligo EUDR sul mangime composto: il codice NC 2309 non è nell’allegato I.', law: ANNEX, status: 'verificato' },
    { id: 'obb-fa-ambito-gen', kind: 'obbligo', role: 'fuori-ambito', sectors: ['agrofarmaci'], text: 'Nessun obbligo EUDR sui prodotti venduti se i loro codici NC non sono nell’allegato I.', law: ANNEX, status: 'verificato' },
    { id: 'obb-fa-clienti', kind: 'obbligo', role: 'fuori-ambito', practice: true, text: 'Raccogliere comunque i riferimenti DDS e i certificati delle materie prime in ambito: li chiedono clienti e catene di fornitura (latte, carne, distribuzione).', law: 'Buona pratica (FEFAC, richieste dei clienti)', status: 'verificato' },
    { id: 'obb-fa-claim', kind: 'obbligo', role: 'fuori-ambito', practice: true, text: 'Non dichiarare «prodotto conforme EUDR»: la dichiarazione corretta riguarda le materie prime e i loro riferimenti.', law: 'D.Lgs. 30/2026 (pratiche commerciali e dichiarazioni ambientali)', status: 'verificato' },
  ],
};

/** Nomi italiani dei paesi più frequenti nelle filiere di soia, palma e cereali (codici ISO 3166-1 alfa-2). */
export const COUNTRY_NAMES = {
  AR: 'Argentina', AT: 'Austria', AU: 'Australia', BE: 'Belgio', BG: 'Bulgaria', BO: 'Bolivia', BR: 'Brasile', BY: 'Bielorussia', CA: 'Canada', CH: 'Svizzera', CI: 'Costa d’Avorio',
  CL: 'Cile', CN: 'Cina', CO: 'Colombia', CY: 'Cipro', CZ: 'Cechia', DE: 'Germania', DK: 'Danimarca', EE: 'Estonia', ES: 'Spagna', FI: 'Finlandia', FR: 'Francia', GB: 'Regno Unito',
  GH: 'Ghana', GR: 'Grecia', HR: 'Croazia', HU: 'Ungheria', ID: 'Indonesia', IE: 'Irlanda', IN: 'India', IS: 'Islanda', IT: 'Italia', JP: 'Giappone', KP: 'Corea del Nord', LT: 'Lituania',
  LU: 'Lussemburgo', LV: 'Lettonia', MD: 'Moldavia', MM: 'Myanmar', MT: 'Malta', MY: 'Malaysia', NG: 'Nigeria', NL: 'Paesi Bassi', NO: 'Norvegia', NZ: 'Nuova Zelanda', PE: 'Perù',
  PG: 'Papua Nuova Guinea', PL: 'Polonia', PT: 'Portogallo', PY: 'Paraguay', RO: 'Romania', RS: 'Serbia', RU: 'Russia', SE: 'Svezia', SI: 'Slovenia', SK: 'Slovacchia', TH: 'Thailandia',
  TR: 'Turchia', UA: 'Ucraina', US: 'Stati Uniti', UY: 'Uruguay', ZA: 'Sudafrica',
};
