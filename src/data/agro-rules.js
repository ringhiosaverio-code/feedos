/* DifesaOS · Registro delle regole usate dai motori dell'area Regolatorio, con riferimento normativo, fonte consultata,
 * data di verifica e stato. File senza dipendenze.
 * Stato: 'verificato' (testo o guida ufficiale, o più autorità nazionali concordi), 'parziale' (solo una parte del valore
 * trovata in una fonte ufficiale: il resto va controllato sul testo), 'stima' (parametro dell'azienda, non una regola).
 * Le stime si modificano dall'app (Regolatorio › Regole e fonti) e si salvano in settings.agro.rules. */

export const RULES_CHECKED_AT = '2026-10-28';

export const AGRO_RULE_SOURCES = [
  { id: 'art43', area: 'Registrazioni', rule: 'Domanda di rinnovo del prodotto entro 3 mesi dal rinnovo di ciascuna sostanza attiva che contiene', value: '3 mesi',
    law: 'Reg. (CE) 1107/2009, art. 43; guida SANCO/2010/13170 rev. 14', status: 'verificato',
    sources: ['https://food.ec.europa.eu/system/files/2016-11/pesticides_aas_guidance_renewal_1107-2009.pdf', 'https://www.hse.gov.uk/pesticides/applicant-guide/product-authorisation-renewal.htm'],
    note: 'Lo Stato membro decide sul rinnovo entro 12 mesi dal rinnovo della sostanza (art. 43, par. 5).' },
  { id: 'art46', area: 'Registrazioni', rule: 'Periodo di tolleranza dopo revoca o mancato rinnovo: vendita e distribuzione al massimo 6 mesi, poi impiego, stoccaggio e smaltimento al massimo 12 mesi', value: '6 + 12 mesi',
    law: 'Reg. (CE) 1107/2009, art. 46', status: 'verificato',
    sources: ['https://english.ctgb.nl/plant-protection/assessment-framework/registration-manual/grace-period-ppp', 'https://mattilsynet.no/en/plants/authorisation-of-plant-protection-products/grace-periods'],
    note: 'Sono massimi: il regolamento europeo sulla sostanza o il decreto nazionale possono fissare periodi più brevi, e allora vale la data del decreto. Finché il decreto non c’è, l’app usa i massimi e lo segna come stima.' },
  { id: 'art53', area: 'Registrazioni', rule: 'Autorizzazione per situazioni di emergenza fitosanitaria: immissione sul mercato per un uso limitato e controllato', value: 'al massimo 120 giorni',
    law: 'Reg. (CE) 1107/2009, art. 53', status: 'verificato',
    sources: ['https://www.hse.gov.uk/pesticides/applicant-guide/article-53-emergency-authorisation.htm', 'https://english.ctgb.nl/plant-protection/applicationtypes-plant-protection-products/120-day-derogation-for-an-emergency-situation'], note: '' },
  { id: 'rame', area: 'Sostanze attive', rule: 'Composti del rame: autorizzati solo gli usi che portano al massimo a 28 kg di rame per ettaro in 7 anni; gli Stati membri possono fissare un massimo annuo di 4 kg/ha', value: '28 kg/ha in 7 anni',
    law: 'Reg. di esecuzione (UE) 2018/1981; scadenza prorogata dal Reg. (UE) 2025/1489', status: 'verificato',
    sources: ['https://eur-lex.europa.eu/eli/reg_impl/2018/1981/oj/eng', 'https://meteo.regione.marche.it/assets/files/comunicato-rame-2026-proroga.pdf'],
    note: 'Il rame resta candidato alla sostituzione; la nuova data di scadenza dell’approvazione va presa dal Reg. (UE) 2025/1489.' },
  { id: 'reach319', area: 'Schede di sicurezza', rule: 'Scheda di sicurezza aggiornata senza ritardo e fornita gratuitamente a tutti i destinatari serviti nei 12 mesi precedenti', value: '12 mesi',
    law: 'Reg. (CE) 1907/2006 (REACH), art. 31, par. 9', status: 'verificato',
    sources: ['https://reachonline.eu/reach/en/title-iv-article-31.html'], note: 'Va consegnata (file o carta), non basta un collegamento pubblicato; l’obbligo resta anche dopo aver smesso di vendere il prodotto.' },
  { id: 'clp-ufi', area: 'Schede di sicurezza', rule: 'Miscele classificate per pericoli per la salute o fisici: notifica ai centri antiveleni e UFI in etichetta; le miscele con soli pericoli ambientali sono escluse (notifica volontaria)', value: 'UFI + notifica PCN',
    law: 'Reg. (CE) 1272/2008 (CLP), art. 45 e allegato VIII', status: 'verificato',
    sources: ['https://www.bfr.bund.de/en/chemical-safety/product-notifications-and-poisonings/notification-of-hazardous-products/', 'https://hsa.ie/media/a3fndb4r/105901-hsa-pcn-information-sheet_7.pdf'],
    note: 'Per l’uso solo industriale l’UFI può stare nella sezione 1.1 della scheda; serve un nuovo UFI quando cambia la composizione oltre gli intervalli notificati. Periodo transitorio finito il 1° gennaio 2025.' },
  { id: 'seveso', area: 'Seveso', rule: 'Soglie in tonnellate (inferiore / superiore): E1 100/200, E2 200/500, H1 5/20, H2 50/200, P5c 5.000/50.000; regola della sommatoria per gruppo (nota 4)', value: 'allegato 1, parte 1',
    law: 'D.Lgs. 105/2015, allegato 1 (direttiva 2012/18/UE)', status: 'verificato',
    sources: ['https://www.governo.it/sites/governo.it/files/78784-10240.pdf', 'https://legislation.gov.uk/uksi/2015/483/schedules/made/data.html'],
    note: 'Le sostanze classificate in più categorie contano in ciascun gruppo.' },
  { id: 'seveso-h3', area: 'Seveso', rule: 'H3 · Tossicità specifica per organi bersaglio, esposizione singola, categoria 1', value: '50 / 200 t',
    law: 'D.Lgs. 105/2015, allegato 1', status: 'parziale', sources: ['https://www.governo.it/sites/governo.it/files/78784-10240.pdf'], note: 'Valore non letto direttamente nella fonte consultata: controllare la tabella dell’allegato 1.' },
  { id: 'adr1136', area: 'ADR', rule: 'Esenzione per quantità trasportate per unità di trasporto: Σ quantità × 50 (categoria 1), × 3 (categoria 2), × 1 (categoria 3), × 0 (categoria 4); esente fino a 1.000 punti', value: '≤ 1.000 punti',
    law: 'ADR 1.1.3.6.3 e 1.1.3.6.4', status: 'verificato',
    sources: ['https://certifico.com/id/20433', 'https://www.evofenedex.nl/api/v1/sharepoint/file/Shared%20Documents/Download%20Gevaarlijke%20Stoffen/1000-puntentabel%202021.pdf'],
    note: 'Alcune merci della categoria 1 (nota a) usano il moltiplicatore 20; non riguardano gli agrofarmaci del demo.' },
  { id: 'ds375', area: 'ADR', rule: 'UN 3077 e UN 3082 in imballaggi singoli o interni fino a 5 L o 5 kg non sono soggetti alle altre disposizioni dell’ADR, se rispettano le disposizioni generali sugli imballaggi (4.1.1.1, 4.1.1.2, 4.1.1.4–4.1.1.8)', value: '≤ 5 kg o 5 L',
    law: 'ADR, capitolo 3.3, disposizione speciale 375', status: 'verificato',
    sources: ['https://www.certifico.com/merci-pericolose/documenti-merci-pericolose/documenti-riservati-trasporto-adr/disposizione-speciale-375-adr', 'https://news.wko.at/oe/transport-verkehr/sondervorschrift-375-un-3077-un-3082-adr-2019.pdf'],
    note: 'È una facoltà, non un obbligo: chi spedisce può scegliere di applicare comunque l’ADR.' },
  { id: 'fao-tol', area: 'Qualità', rule: 'Tolleranze sul contenuto dichiarato di sostanza attiva (g/kg o g/L): fino a 25 ±15% (omogenee) o ±25% (eterogenee); oltre 25 fino a 100 ±10%; oltre 100 fino a 250 ±6%; oltre 250 fino a 500 ±5%; oltre 500 ±25 g', value: 'per fasce',
    law: 'Manuale FAO/OMS sulle specifiche degli agrofarmaci', status: 'parziale',
    sources: ['https://www.fao.org/fileadmin/templates/agphome/documents/Pests_Pesticides/Particpant_Guide_pesticide_Specifications.pdf', 'https://www.fao.org/fileadmin/templates/agphome/documents/Pests_Pesticides/Specs/Thiamethoxam2014.pdf'],
    note: 'Confermate nelle fonti FAO le fasce fino a 25 (omogenee), 100–250 e 250–500; le altre vanno controllate nel manuale. Vale sempre la specifica del prodotto registrato.' },
  { id: 'volumi', area: 'Usi in etichetta', rule: 'Volume d’acqua standard per passare dalla dose per ettolitro alla dose per ettaro: circa 15 hl/ha per fruttiferi e vite a forme espanse, 10 hl/ha per erbacee e vite a forme ridotte', value: '10–15 hl/ha',
    law: 'Indicazione tecnica dei cataloghi dei produttori, non una norma', status: 'verificato', sources: [], note: 'Vale l’etichetta del prodotto.' },
];

/** Parametri che sono stime dell'azienda: si modificano in Regolatorio › Regole e fonti. */
export const AGRO_ESTIMATES = [
  { key: 'pNonRenewal.cfs', label: 'Mancato rinnovo · candidata alla sostituzione', unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'pNonRenewal.in rinnovo', label: 'Mancato rinnovo · rinnovo in corso', unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'pNonRenewal.standard', label: 'Mancato rinnovo · scadenza nell’orizzonte', unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'pNonRenewal.basso rischio', label: 'Mancato rinnovo · basso rischio', unit: '%', scale: 100, min: 0, max: 100 },
  { key: 'horizonMonths', label: 'Orizzonte dei ricavi a rischio', unit: 'mesi', scale: 1, min: 6, max: 120 },
  { key: 'graceDemandFactor', label: 'Domanda dopo l’annuncio di una revoca, rispetto all’anno prima', unit: '%', scale: 100, min: 0, max: 150 },
  { key: 'disposalEurT', label: 'Costo di smaltimento come rifiuto pericoloso', unit: '€/t', scale: 1, min: 0, max: 20000 },
];
