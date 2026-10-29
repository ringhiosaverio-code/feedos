/* FeedOS 18 · Dati dimostrativi · Rischi climatici (pacchetto WP8).
 * Contratto: demoRischi(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (nessun numero casuale: i valori sono fissi e le date dipendono solo da today); impostazioni solo
 * in settings.esg18.rischi. Dati inventati: mangimificio dimostrativo di Valle Verde (FeedOS) o azienda di agrofarmaci dimostrativa
 * (DifesaOS), secondo il settore dell'archivio. I livelli dei pericoli sono autovalutazione dimostrativa, non la mappa ISPRA.
 * Coordinate del sito principale = coordinate dell'anagrafica (impostate dal pacchetto redditività), così mappa e clima coincidono. */
import { sectorOf } from '../../engine/esg-years.js';
import { addDays, addMonths } from '../../core/util.js';

const SRC = 'autovalutazione dimostrativa';
const FALLBACK = { mangimi: { lat: 39.45, lon: 16.25 }, agrofarmaci: { lat: 44.71, lon: 11.95 } };

/** Dati di un’azienda: siti, pericoli, rischi di fornitura, polizze, azioni e registro dei rischi. */
function feedRows(today, c) {
  const sites = [
    { id: 'rs-stab', name: 'Stabilimento di Valle Verde', kind: 'stabilimento', address: 'Zona industriale, Valle Verde (dati di fantasia)', comune: 'Valle Verde', provincia: 'CS',
      lat: c.lat, lon: c.lon, areaM2: 38000, sealedM2: 21000, natureOnSiteM2: 4500, natureOffSiteM2: 2500, owned: true, ape: 'classe C (dimostrativa)',
      valTerreni: 1800000, valFabbricati: 6400000, valImpianti: 7200000, valAttrezzature: 2600000, natura2000Km: 6.5, sensitive: false, main: true, heatDays: 28,
      note: 'Linee di formulazione L1-L3, magazzino delle materie prime e silos' },
    { id: 'rs-mag', name: 'Magazzino esterno', kind: 'magazzino', address: 'Area logistica, Valle Verde (dati di fantasia)', comune: 'Valle Verde', provincia: 'CS',
      lat: +(c.lat + 0.03).toFixed(4), lon: +(c.lon - 0.02).toFixed(4), areaM2: 6000, sealedM2: 5200, natureOnSiteM2: 300, natureOffSiteM2: 0, owned: false, ape: 'non di proprietà',
      natura2000Km: 3.1, sensitive: false, heatDays: 14, note: 'Locato: sacchi e scorte di sicurezza, non nel valore dei beni assicurati' },
  ];
  const hz = (site, rows) => rows.map(([hazard, level, days]) => ({ id: `rh-${site}-${hazard}`, siteId: site, hazard, level, source: SRC, checkedAt: days }));
  const hazards = [
    ...hz('rs-stab', [['alluvione', 2, addDays(today, -95)], ['frana', 0, addDays(today, -95)], ['sisma', 3, addDays(today, -95)], ['caldo', 4, addDays(today, -95)],
      ['siccita', 3, addDays(today, -95)], ['grandine-vento', 2, addDays(today, -95)], ['incendio', 1, addDays(today, -95)]]),
    ...hz('rs-mag', [['alluvione', 1, addMonths(today, -30)], ['frana', 1, addMonths(today, -30)], ['sisma', 3, addMonths(today, -30)], ['caldo', 3, addMonths(today, -30)], ['siccita', 2, addMonths(today, -30)]]),
  ];
  const sourcingRisks = [
    { id: 'rq-mais-it-s', commodity: 'mais', origin: 'Italia', hazard: 'siccita', level: 3, note: 'Mais nazionale: siccità estiva nelle aree di coltivazione' },
    { id: 'rq-mais-it-c', commodity: 'mais', origin: 'Italia', hazard: 'caldo', level: 2, note: 'Ondate di calore durante la fioritura' },
    { id: 'rq-orzo-it', commodity: 'orzo', origin: 'Italia', hazard: 'siccita', level: 2, note: 'Cereali autunno-vernini: siccità di primavera' },
    { id: 'rq-soia-br-c', commodity: 'soia', origin: 'Brasile', hazard: 'caldo', level: 2, note: 'Stagione secca e caldo nel Mato Grosso' },
    { id: 'rq-soia-br-s', commodity: 'soia', origin: 'Brasile', hazard: 'siccita', level: 2, note: 'Siccità di fine stagione nelle aree di produzione' },
    { id: 'rq-soia-ar-s', commodity: 'soia', origin: 'Argentina', hazard: 'siccita', level: 2, note: 'Deficit idrico nella provincia di Santa Fe' },
    { id: 'rq-soia-us-s', commodity: 'soia', origin: 'Stati Uniti', hazard: 'siccita', level: 2, note: 'Siccità estiva nel Midwest (dato dimostrativo)' },
    { id: 'rq-soia-ua-s', commodity: 'soia', origin: 'Ucraina', hazard: 'siccita', level: 1, note: 'Rischio residuo dopo l’analisi del fornitore' },
    { id: 'rq-sorgo-it-s', commodity: 'sorgo', origin: 'Italia', hazard: 'siccita', level: 3, note: 'Sorgo nazionale: stress idrico estivo nelle aree di coltivazione' },
    { id: 'rq-frumento-it-s', commodity: 'frumento', origin: 'Italia', hazard: 'siccita', level: 2, note: 'Frumento tenero: siccità di primavera' },
    { id: 'rq-colza-ue-s', commodity: 'colza', origin: 'UE', hazard: 'siccita', level: 2, note: 'Colza europea: siccità autunnale e rese instabili' },
    { id: 'rq-coprod-ue', commodity: 'coprodotto', origin: 'UE', hazard: 'siccita', level: 2, note: 'Co-prodotti dell’industria alimentare: legati alle rese delle colture' },
    { id: 'rq-minerale-it', commodity: 'minerale', origin: 'Italia', hazard: 'siccita', level: 0, note: 'Minerali di cava: rischio trascurabile' },
    { id: 'rq-amino-ex', commodity: 'aminoacido', origin: 'Extra-UE', hazard: 'caldo', level: 1, note: 'Sintesi chimica nei paesi di produzione: rischio residuo' },
  ];
  const insuredSum = 18000000;
  const insurancePolicies = [
    { id: 'rp-cat', kind: 'catastrofale', insurer: 'Assicurazioni Dimostrative S.p.A. (fantasia)', number: 'CAT-2025-0417', perils: 'sisma, alluvione, frana', insuredSum,
      deductible: 50000, from: '2026-04-01', to: '2027-03-31', note: 'Polizza unica per gli stabilimenti di proprietà (dato dimostrativo)' },
    { id: 'rp-ar', kind: 'all-risks', insurer: 'Assicurazioni Dimostrative S.p.A. (fantasia)', number: 'AR-2026-0091', perils: 'incendio, alluvione, furto', insuredSum: 6000000,
      deductible: 10000, from: '2026-01-01', to: '2027-06-30' },
    { id: 'rp-rc', kind: 'RC', insurer: 'Broker Dimostrativo S.r.l. (fantasia)', number: 'RC-2026-0338', perils: '', insuredSum: 5000000, deductible: 5000, from: '2026-01-01', to: '2027-01-31' },
  ];
  const adaptationActions = [
    { id: 'ra-1', siteId: 'rs-stab', hazard: 'caldo', action: 'Ventilazione e zone ombreggiate per il personale ai carichi di lavoro estivi', cost: 85000, owner: 'Produzione', due: addDays(today, 150), status: 'pianificata' },
    { id: 'ra-2', siteId: 'rs-stab', hazard: 'alluvione', action: 'Quadri elettrici e sala controllo sopra la quota di piena del canale', cost: 140000, owner: 'Manutenzione', due: addDays(today, 240), status: 'in corso' },
    { id: 'ra-3', siteId: 'rs-mag', hazard: 'alluvione', action: 'Scaffalature alte e prodotto su pallet rialzati nel magazzino esterno', cost: 22000, owner: 'Logistica', due: addDays(today, -20), status: 'in corso' },
  ];
  const riskRegister = [
    { id: 'rr-1', type: 'transizione', driver: 'Prezzo del carbonio: ETS2 sui combustibili dal 2028', horizon: 'medio', likelihood: 4, impact: 3, financialLow: 120000, financialHigh: 260000, response: 'Efficienza termica, combustibili a basso carbonio e prezzo interno nel piano' },
    { id: 'rr-2', type: 'transizione', driver: 'Capitolati dei clienti con impronta di CO₂ dei mangimi', horizon: 'breve', likelihood: 4, impact: 3, financialLow: 80000, financialHigh: 200000, response: 'Impronta con dati misurati e formulazione a basso carbonio' },
    { id: 'rr-3', type: 'transizione', driver: 'Soia non conforme all’EUDR esclusa dal mercato UE', horizon: 'breve', likelihood: 3, impact: 5, financialLow: 300000, financialHigh: 900000, response: 'Lotti con riferimento DDS e segregazione della soia senza deforestazione' },
    { id: 'rr-4', type: 'transizione', driver: 'Costo del gas per vapore ed essiccazione', horizon: 'medio', likelihood: 3, impact: 3, financialLow: 90000, financialHigh: 180000, response: 'Fotovoltaico e recupero del calore dai raffreddatori' },
    { id: 'rr-5', type: 'transizione', driver: 'Richieste di informativa VSME dalle banche e dai clienti', horizon: 'breve', likelihood: 4, impact: 2, financialLow: 20000, financialHigh: 60000, response: 'Report VSME con i dati del registro' },
    { id: 'rr-6', type: 'transizione', driver: 'Finanziamenti legati alla sostenibilità con obiettivi verificati', horizon: 'medio', likelihood: 2, impact: 3, financialLow: 40000, financialHigh: 120000, response: 'Obiettivi con traiettoria approvata (scheda Obiettivi e piano)' },
    { id: 'rr-7', type: 'transizione', driver: 'Vincoli autorizzativi più severi sulle emissioni in atmosfera', horizon: 'lungo', likelihood: 2, impact: 4, financialLow: 150000, financialHigh: 400000, response: 'Monitoraggio delle emissioni e piano di investimento sugli impianti' },
    { id: 'rr-8', type: 'transizione', driver: 'Dazi e CBAM sulle materie prime importate', horizon: 'lungo', likelihood: 1, impact: 2, financialLow: 0, financialHigh: 40000, response: 'Monitoraggio dei codici doganali; nessun acquisto soggetto nel periodo' },
    { id: 'rr-9', type: 'fisico', driver: 'Siccità: minore resa e prezzi più alti del mais nazionale', horizon: 'breve', likelihood: 3, impact: 4, financialLow: 200000, financialHigh: 450000, response: 'Contratti con più areali e scorta di sicurezza' },
    { id: 'rr-10', type: 'fisico', driver: 'Caldo: fermi di linea e rischi per il personale nei mesi estivi', horizon: 'breve', likelihood: 3, impact: 3, financialLow: 30000, financialHigh: 90000, response: 'Turni, ventilazione e azione di adattamento ra-1' },
  ];
  return { sites, hazards, sourcingRisks, insurancePolicies, adaptationActions, riskRegister, insuredSum };
}

/** Dati di un’azienda di agrofarmaci: sostanze attive da poche origini, deposito di sostanze pericolose vicino a un canale, magazzino del prodotto confezionato. */
function agroRows(today, c) {
  const sites = [
    { id: 'rs-stab', name: 'Stabilimento di Campolongo', kind: 'stabilimento', address: 'Zona industriale, Campolongo (dati di fantasia)', comune: 'Campolongo', provincia: '',
      lat: c.lat, lon: c.lon, areaM2: 26000, sealedM2: 14000, natureOnSiteM2: 3000, natureOffSiteM2: 0, owned: true, ape: 'classe D (dimostrativa)',
      valTerreni: 1500000, valFabbricati: 5200000, valImpianti: 6400000, valAttrezzature: 1900000, natura2000Km: 2.4, sensitive: false, main: true, heatDays: 26,
      note: 'Linee di formulazione: granulazione, liquidi e polveri' },
    { id: 'rs-dep', name: 'Deposito sostanze pericolose', kind: 'deposito', address: 'Lato nord del sito (dati di fantasia)', comune: 'Campolongo', provincia: '',
      lat: +(c.lat + 0.004).toFixed(4), lon: +(c.lon + 0.006).toFixed(4), areaM2: 1800, sealedM2: 1500, natureOnSiteM2: 0, natureOffSiteM2: 0, owned: true, ape: 'non residenziale',
      valTerreni: 0, valFabbricati: 900000, valImpianti: 350000, valAttrezzature: 0, natura2000Km: 2.4, sensitive: false, heatDays: 26,
      note: 'Solventi e sostanze attive in bacino di contenimento, a circa 150 m dal canale di scolo' },
    { id: 'rs-mag', name: 'Magazzino prodotto confezionato', kind: 'magazzino', address: 'Area logistica, Campolongo (dati di fantasia)', comune: 'Campolongo', provincia: '',
      lat: +(c.lat - 0.02).toFixed(4), lon: +(c.lon + 0.03).toFixed(4), areaM2: 7200, sealedM2: 6100, natureOnSiteM2: 400, natureOffSiteM2: 0, owned: true, ape: 'classe C (dimostrativa)',
      valTerreni: 0, valFabbricati: 2400000, valImpianti: 300000, valAttrezzature: 0, natura2000Km: 7.5, sensitive: false, heatDays: 34,
      note: 'Taniche, flaconi e sacchi pronti per la consegna' },
  ];
  const hz = (site, rows, days) => rows.map(([hazard, level, note]) => ({ id: `rh-${site}-${hazard}`, siteId: site, hazard, level, source: SRC, checkedAt: days, ...(note ? { note } : {}) }));
  const hazards = [
    ...hz('rs-stab', [['alluvione', 2], ['sisma', 2], ['caldo', 3], ['siccita', 2], ['grandine-vento', 3], ['incendio', 3]], addDays(today, -95)),
    ...hz('rs-dep', [['alluvione', 3, 'Vicino al canale di scolo: il livello alto dipende dalla quota di piena'], ['incendio', 4, 'Solventi infiammabili'], ['sisma', 2], ['caldo', 2]], addDays(today, -60)),
    ...hz('rs-mag', [['alluvione', 3], ['caldo', 4, 'Stoccaggio in copertura senza ventilazione forzata'], ['sisma', 2], ['siccita', 1]], addDays(today, -60)),
  ];
  const sourcingRisks = [
    { id: 'rq-sa-ex-f', commodity: 'sostanze attive', origin: 'Extra-UE', hazard: 'alluvione', level: 3, note: 'Stabilimenti del fornitore principale in area di esondazione: dato del fornitore, da verificare' },
    { id: 'rq-sa-ex-c', commodity: 'sostanze attive', origin: 'Extra-UE', hazard: 'caldo', level: 2, note: 'Ondate di calore nei siti di sintesi' },
    { id: 'rq-sa-ue-c', commodity: 'sostanze attive', origin: 'UE', hazard: 'caldo', level: 1, note: 'Rischio residuo nei produttori europei' },
    { id: 'rq-sa-it-f', commodity: 'sostanze attive', origin: 'Italia', hazard: 'alluvione', level: 1, note: 'Produzione nazionale fuori dalle aree di esondazione' },
    { id: 'rq-acqua-s', commodity: 'acqua', origin: 'Italia', hazard: 'siccita', level: 2, note: 'Approvvigionamento idrico in periodi di siccità' },
  ];
  const insuredSum = 19000000;
  const insurancePolicies = [
    { id: 'rp-cat', kind: 'catastrofale', insurer: 'Assicurazioni Dimostrative S.p.A. (fantasia)', number: 'CAT-2025-0612', perils: 'sisma, alluvione, frana', insuredSum,
      deductible: 60000, from: '2026-04-01', to: '2027-03-31', note: 'Polizza unica per i siti di proprietà (dato dimostrativo)' },
    { id: 'rp-ar', kind: 'all-risks', insurer: 'Assicurazioni Dimostrative S.p.A. (fantasia)', number: 'AR-2026-0233', perils: 'incendio, alluvione, furto', insuredSum: 8000000,
      deductible: 15000, from: '2026-01-01', to: '2027-06-30' },
    { id: 'rp-rc', kind: 'RC', insurer: 'Broker Dimostrativo S.r.l. (fantasia)', number: 'RC-2026-0519', perils: '', insuredSum: 5000000, deductible: 5000, from: '2026-01-01', to: '2027-01-31' },
  ];
  const adaptationActions = [
    { id: 'ra-1', siteId: 'rs-mag', hazard: 'caldo', action: 'Ventilazione forzata e isolamento della copertura del magazzino prodotto', cost: 120000, owner: 'Produzione', due: addDays(today, 120), status: 'pianificata' },
    { id: 'ra-2', siteId: 'rs-dep', hazard: 'alluvione', action: 'Soglia rialzata e bacino di contenimento nel deposito sostanze pericolose', cost: 260000, owner: 'Produzione', due: addDays(today, 200), status: 'in corso' },
    { id: 'ra-3', siteId: 'rs-mag', hazard: 'alluvione', action: 'Scaffalature e pallet rialzati per il prodotto confezionato', cost: 25000, owner: 'Logistica', due: addDays(today, -20), status: 'in corso' },
  ];
  const riskRegister = [
    { id: 'rr-1', type: 'transizione', driver: 'Revoche e mancati rinnovi di sostanze attive', horizon: 'breve', likelihood: 4, impact: 5, financialLow: 500000, financialHigh: 2000000, response: 'Piano di sostituzione e registrazioni (scheda Regolatorio)' },
    { id: 'rr-2', type: 'transizione', driver: 'Rivenditori che chiedono la CO₂ dei programmi di difesa', horizon: 'breve', likelihood: 4, impact: 3, financialLow: 60000, financialHigh: 180000, response: 'Scheda CO₂ dei programmi con fattori da verificare' },
    { id: 'rr-3', type: 'transizione', driver: 'Limiti all’uso del rame per ettaro', horizon: 'medio', likelihood: 3, impact: 4, financialLow: 300000, financialHigh: 800000, response: 'Formulazioni a basso dosaggio e biostimolanti' },
    { id: 'rr-4', type: 'transizione', driver: 'Prezzo del carbonio: ETS2 sui combustibili di processo', horizon: 'medio', likelihood: 3, impact: 2, financialLow: 40000, financialHigh: 110000, response: 'Efficienza dell’essiccatore e combustibile alternativo' },
    { id: 'rr-5', type: 'transizione', driver: 'Obblighi di sicurezza e Seveso sui depositi', horizon: 'breve', likelihood: 2, impact: 4, financialLow: 100000, financialHigh: 300000, response: 'Verifiche periodiche e bacini di contenimento' },
    { id: 'rr-6', type: 'transizione', driver: 'Dazi e CBAM sulle materie importate', horizon: 'lungo', likelihood: 2, impact: 2, financialLow: 20000, financialHigh: 80000, response: 'Monitoraggio dei codici doganali' },
    { id: 'rr-7', type: 'transizione', driver: 'Vincoli sulle emissioni dei solventi', horizon: 'lungo', likelihood: 2, impact: 3, financialLow: 50000, financialHigh: 150000, response: 'Scrubber e monitoraggio' },
    { id: 'rr-8', type: 'transizione', driver: 'Clienti che chiedono il report VSME e l’informativa sui rischi climatici', horizon: 'breve', likelihood: 4, impact: 2, financialLow: 20000, financialHigh: 50000, response: 'Report VSME dal registro' },
    { id: 'rr-9', type: 'fisico', driver: 'Piogge intense: allagamento del deposito sostanze pericolose', horizon: 'breve', likelihood: 2, impact: 5, financialLow: 250000, financialHigh: 700000, response: 'Quota di sicurezza, bacino di contenimento e piano di emergenza' },
    { id: 'rr-10', type: 'fisico', driver: 'Ondate di calore nel magazzino del prodotto confezionato', horizon: 'breve', likelihood: 3, impact: 3, financialLow: 40000, financialHigh: 120000, response: 'Ventilazione e stoccaggio in quota (azione ra-1)' },
  ];
  return { sites, hazards, sourcingRisks, insurancePolicies, adaptationActions, riskRegister, insuredSum };
}

/** Estensore del pacchetto rischi: siti, pericoli, filiera, assicurazioni, azioni e registro dei rischi (settore dell'archivio). */
export function demoRischi(d, { today, R } = {}) {
  if (!d || !today) return {};
  for (const c of ['sites', 'siteHazards', 'sourcingRisks', 'insurancePolicies', 'adaptationActions', 'riskRegister']) if (Array.isArray(d[c]) && d[c].length) return {};
  if (d.settings?.esg18?.rischi) return {};
  const agro = sectorOf(d) === 'agrofarmaci';
  const co = d.settings?.company || {};
  const c = typeof co.lat === 'number' && typeof co.lon === 'number' ? { lat: co.lat, lon: co.lon } : FALLBACK[agro ? 'agrofarmaci' : 'mangimi'];
  const X = agro ? agroRows(today, c) : feedRows(today, c);
  const settings = agro
    ? { stress: { rame: 25, energia: 30 }, natura2000NearKm: 10, concentrationPct: 60 }
    : { stress: { mais: 25, soia: 20, energia: 30 }, natura2000NearKm: 10, concentrationPct: 60,
        originByIngredient: { mais: 'IT', orzo: 'IT', frumento: 'IT', sorgo: 'IT', crusca: 'IT', farinaccio: 'IT', ddgs: 'IT', glutine: 'IT' } };
  return {
    add: { sites: X.sites, siteHazards: X.hazards, sourcingRisks: X.sourcingRisks, insurancePolicies: X.insurancePolicies, adaptationActions: X.adaptationActions, riskRegister: X.riskRegister },
    settings: { esg18: { rischi: settings } },
  };
}
