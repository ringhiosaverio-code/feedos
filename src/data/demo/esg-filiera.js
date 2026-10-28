/* FeedOS 18 · Dati dimostrativi · EUDR e fornitori (pacchetto WP3, seme 1101). Dati INVENTATI per il mangimificio di Valle Verde.
 * Contratto: demoFiliera(d, { today, R }) → { add, settings }, solo aggiunte, idempotente (se il registro esiste già restituisce {}),
 * deterministico (R = rng del seme + offset, nessun orologio); impostazioni solo in settings.esg18.filiera.
 * Storia: trasformatore a valle che compra la soia da commercianti dell'UE (ruolo «fuori ambito» per il mangime) con un lotto
 * importato direttamente come esempio (3 appezzamenti in Brasile); circa il 90% dei lotti di soia con riferimento DDS, gli ultimi
 * 3 arrivi senza riferimento (richiesta inviata), origini BR 55%, AR 25%, US 12%, UA/UE 8%; soia DCF segregata ProTerra per
 * l'Ovilatte; registro DCF positivo; 1.200 t di crediti RTRS; 9 fornitori valutati su 17, 6 codici firmati, 2 azioni aperte. */
import { addDays, byId, rng, endOfMonth } from '../../core/util.js';
import { sha256HexSync, canonicalJson } from '../../core/hash.js';
import { countryRisk } from '../../engine/esg-filiera.js';
import { requestPayload, formHash } from '../../engine/esg-filiera-forms.js';
import { ringAreaM2, validateGeoJSON } from '../../engine/esg-filiera-geo.js';

const SOY = ['soia44', 'soia48', 'soiadf', 'soiaint', 'olio'];
const MEAL = ['soia44', 'soia48'];
const ITEMS = {
  soia44: { commodity: 'soia', hs: '2304 00', note: 'Farina di estrazione di soia (allegato I del Reg. (UE) 2023/1115)' },
  soia48: { commodity: 'soia', hs: '2304 00', note: 'Farina di estrazione di soia decorticata' },
  soiadf: { commodity: 'soia', hs: '2304 00', note: 'Farina di estrazione certificata senza deforestazione (ProTerra, segregata)' },
  soiaint: { commodity: 'soia', hs: '1201 90', note: 'Semi di soia tostati di origine europea' },
  olio: { commodity: 'soia', hs: '1507 90', note: 'Olio di soia raffinato: in ambito, contato a parte nelle quote della soia' },
};
const REGIONS = { BR: ['Mato Grosso', 'Paraná', 'Goiás', 'Rio Grande do Sul', 'Mato Grosso do Sul'], AR: ['Santa Fe', 'Buenos Aires', 'Córdoba'], US: ['Illinois', 'Iowa', 'Indiana', 'Ohio'],
  UA: ['Poltava', 'Khmelnytskyi', 'Vinnytsia'], IT: ['Friuli Venezia Giulia', 'Veneto'], AT: ['Niederösterreich', 'Burgenland'] };
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const TRADER = 'sup-trader-proteici', ADRIATICHE = 'sup-proteine-adriatiche-s-r-';

/* allocazione deterministica dei paesi: ogni lotto va al paese più indietro rispetto alla quota obiettivo (con un poco di varietà) */
function allocator(R, targets) {
  const assigned = {}; let total = 0;
  return t => {
    total += t;
    let best = null, bestScore = -Infinity;
    for (const [c, share] of Object.entries(targets)) {
      const score = share * total - (assigned[c] || 0) + R.range(0, 0.3) * t;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    assigned[best] = (assigned[best] || 0) + t;
    return best;
  };
}
const refOf = (R, date, ms) => `${String(date).slice(2, 4)}${ms}${Array.from({ length: 10 }, () => ALNUM[R.int(0, ALNUM.length - 1)]).join('')}`;
const verOf = R => Array.from({ length: 8 }, () => ALNUM[R.int(0, 23)]).join('');

/* appezzamenti dimostrativi (Paraná, Brasile): due poligoni da 12 e 35 ha e un punto da 2,5 ha */
const M_DEG = 6371008.8 * Math.PI / 180;
function polygonAt(lat0, lon0, offsets, targetHa) {
  const toDeg = (pts, k) => pts.map(([e, n]) => [lon0 + (e * k) / (M_DEG * Math.cos((lat0 * Math.PI) / 180)), lat0 + (n * k) / M_DEG]);
  const close = r => [...r, r[0]];
  const a = ringAreaM2(close(toDeg(offsets, 1)));
  const k = Math.sqrt((targetHa * 10000) / a);
  return close(toDeg(offsets, k).map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]));
}
function demoPlots() {
  const lat0 = -24.6213, lon0 = -51.4627;
  const p1 = polygonAt(lat0, lon0, [[0, 0], [300, 10], [292, 410], [-8, 396]], 12);
  const p2 = polygonAt(lat0 - 300 / M_DEG, lon0 + 900 / (M_DEG * Math.cos((lat0 * Math.PI) / 180)), [[0, 0], [560, -20], [600, 420], [260, 640], [-30, 450]], 35);
  const pt = [Math.round((lon0 + 420 / (M_DEG * Math.cos((lat0 * Math.PI) / 180))) * 1e6) / 1e6, Math.round((lat0 + 950 / M_DEG) * 1e6) / 1e6];
  const props = (place, area) => ({ ProducerName: 'Cooperativa Agrícola Serra Verde (fittizia)', ProducerCountry: 'BR', ProductionPlace: place, Area: area });
  return JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: props('Talhão 1 (dati dimostrativi)', 12), geometry: { type: 'Polygon', coordinates: [p1] } },
    { type: 'Feature', properties: props('Talhão 2 (dati dimostrativi)', 35), geometry: { type: 'Polygon', coordinates: [p2] } },
    { type: 'Feature', properties: props('Talhão 3 (dati dimostrativi)', 2.5), geometry: { type: 'Point', coordinates: pt } },
  ] }, null, 1);
}

export function demoFiliera(d, { today, R } = {}) {
  if (!d || !Array.isArray(d.ingLots) || !d.ingLots.length) return {};
  if ((d.eudrLots || []).length || (d.eudrItems || []).length || (d.supplierEsg || []).length || (d.supplierRequests || []).length || d.settings?.esg18?.filiera) return {};
  const t0 = today || d.settings?.demoAnchor;
  if (!t0) return {};
  const r = R || rng(16 + 1101);
  const ings = byId(d.ingredients || []), sups = byId(d.suppliers || []);
  const present = SOY.filter(id => ings[id]);
  if (!present.length) return {};
  const eudrItems = present.map(id => ({ id, ...ITEMS[id], inScope: true, confirmedAt: addDays(t0, -190), by: 'Ufficio acquisti (dati dimostrativi)' }));

  const soyLots = d.ingLots.filter(l => l && present.includes(l.ingId) && l.date <= t0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id))));
  const mealOf = l => MEAL.includes(l.ingId);
  // ultimi 3 arrivi di farina del Trader proteici senza riferimento (richiesta inviata); lotti di inizio campagna di Proteine Adriatiche senza riferimento
  const traderMeal = soyLots.filter(l => mealOf(l) && l.supplierId === TRADER);
  const recentMissing = new Set((traderMeal.length >= 3 ? traderMeal : soyLots.filter(mealOf)).slice(-3).map(l => l.id));
  const oldMissing = new Set(soyLots.filter(l => mealOf(l) && l.supplierId === ADRIATICHE && l.date < addDays(t0, -300)).map(l => l.id));
  const directId = soyLots.filter(l => l.ingId === 'soiadf')[2]?.id || null;
  const meal = allocator(r, { BR: 0.55, AR: 0.25, US: 0.12, UA: 0.04, IT: 0.02, AT: 0.02 });
  const eu = allocator(r, { IT: 0.6, AT: 0.4 });
  const oil = allocator(r, { US: 0.4, BR: 0.4, UA: 0.2 });
  const plotsText = demoPlots();
  const v = validateGeoJSON(plotsText);
  const eudrLots = [], eudrPlots = [];
  for (const l of soyLots) {
    const country = l.ingId === 'soiadf' ? 'BR' : l.ingId === 'soiaint' ? eu(l.tonnes) : l.ingId === 'olio' ? oil(l.tonnes) : meal(l.tonnes);
    const region = REGIONS[country][r.int(0, REGIONS[country].length - 1)];
    const missing = recentMissing.has(l.id) || oldMissing.has(l.id);
    const row = { id: `eu-${l.id}`, ingLotId: l.id, ingId: l.ingId, supplierId: l.supplierId || null, country, region, riskTier: countryRisk(d, country, l.date).tier };
    if (!missing) {
      const ms = r.weighted(['IT', 'NL', 'ES'], [5, 3, 2]);
      if (l.ingId === 'olio') row.upstreamRefs = [refOf(r, l.date, ms), refOf(r, l.date, r.weighted(['NL', 'IT'], [1, 1]))];
      else { row.ddsRef = refOf(r, l.date, ms); if (r.chance(0.7)) row.ddsVerification = verOf(r); }
    }
    if (l.ingId === 'soiadf') Object.assign(row, { scheme: 'ProTerra', coc: 'segregato', cutoff: '2008-01-01', conversionFree: true, ssgBenchmark: '2021', certNo: 'PT-CoC-IT-0417', certExpiry: addDays(t0, 210) });
    else if (l.ingId === 'soiaint') Object.assign(row, { scheme: 'Europe Soya', coc: 'IP', cutoff: '2008-01-01', conversionFree: true, ssgBenchmark: '2021', certNo: 'ES-IT-0311', certExpiry: addDays(t0, 300) });
    else if (l.ingId === 'olio' || l.ingId === 'soia48') Object.assign(row, { scheme: 'nessuno', coc: 'nessuno' });
    else if (country === 'US') Object.assign(row, { scheme: 'US SSAP', coc: 'bilancio-di-massa', ssgBenchmark: '2021' });
    else if (l.supplierId === TRADER && r.chance(0.45)) Object.assign(row, { scheme: 'RTRS', coc: 'bilancio-di-massa', cutoff: '2016-06-01', conversionFree: true, ssgBenchmark: '2023', certNo: 'RTRS-CoC-IT-0093', certExpiry: addDays(t0, 20) });
    else if (l.supplierId === ADRIATICHE && r.chance(0.3)) Object.assign(row, { scheme: 'ISCC', coc: 'bilancio-di-massa', cutoff: '2008-01-01', conversionFree: true, ssgBenchmark: '2021', certNo: 'ISCC-PLUS-IT219-00087', certExpiry: addDays(t0, 150) });
    else Object.assign(row, { scheme: 'nessuno', coc: 'nessuno' });
    if (l.id === directId) {
      const id = row.id;
      Object.assign(row, { directImport: true, ddsRef: refOf(r, l.date, 'IT'), ddsVerification: verOf(r), region: 'Paraná', plotsCount: v.features.length, areaHa: v.totalAreaHa, geoValid: v.ok,
        plotsHash: sha256HexSync(plotsText), plotsFile: 'appezzamenti-serra-verde.geojson',
        note: 'Importazione diretta (esempio dimostrativo): l’azienda è l’operatore per questo lotto e ha presentato la propria DDS. Esportatore: Cooperativa Agrícola Serra Verde (fittizia), Paraná; sdoganamento in rappresentanza diretta.' });
      v.features.forEach((f, k) => eudrPlots.push({ id: `pl-${id}-${k + 1}`, eudrLotId: id, name: f.name, geom: f.geom, coords: f.coords, areaHa: f.areaHa, declaredAreaHa: f.declaredAreaHa, lat: f.lat, lon: f.lon, valid: f.valid, issues: f.issues }));
    }
    row.status = row.ddsRef || row.upstreamRefs ? 'completo' : 'incompleto';
    row.source = 'dati dimostrativi';
    eudrLots.push(row);
  }

  // registro DCF: arrivi della soia segregata ProTerra, uscite mensili delle consegne dichiarate «con soia DCF», una rettifica inventariale
  const dcfIn = soyLots.filter(l => l.ingId === 'soiadf');
  const dcfLedger = dcfIn.map(l => ({ id: `dcf-in-${l.id}`, date: l.date, kind: 'entrata', ingLotId: l.id, tSoy: l.tonnes, scheme: 'ProTerra', note: 'Arrivo di farina di soia senza deforestazione, catena segregata (ProTerra)' }));
  const dfIds = new Set(dcfIn.map(l => l.id));
  const lots = byId((d.lots || []).filter(x => (x.comp || []).some(c => dfIds.has(c.l))));
  const prodNames = byId(d.products || []);
  const months = new Map();
  for (const s of d.shipments || []) {
    const lot = lots[s.lotId];
    if (!lot || !(lot.tonnes > 0) || s.date > t0) continue;
    const kg = (lot.comp || []).filter(c => dfIds.has(c.l)).reduce((a, c) => a + (+c.kg || 0), 0);
    const ym = s.date.slice(0, 7);
    const m = months.get(ym) || { t: 0, n: 0, last: s.date, prods: new Set() };
    m.t += (kg * Math.min(1, s.tonnes / lot.tonnes)) / 1000; m.n++; if (s.date > m.last) m.last = s.date; m.prods.add(prodNames[lot.productId]?.name || lot.productId);
    months.set(ym, m);
  }
  for (const [ym, m] of [...months].sort()) dcfLedger.push({ id: `dcf-out-${ym}`, date: m.last > endOfMonth(ym) ? endOfMonth(ym) : m.last, kind: 'uscita', tSoy: Math.round(m.t * 1000) / 1000, scheme: 'ProTerra',
    note: `Consegne di ${[...m.prods].join(', ')} dichiarate «con soia senza deforestazione» (${m.n} consegne)` });
  const adjDate = dcfIn.length ? addDays(dcfIn[dcfIn.length - 1].date, 45) : null;
  if (adjDate && adjDate <= t0) {
    const bal = dcfLedger.filter(x => x.date <= adjDate).reduce((a, x) => a + (x.kind === 'uscita' ? -x.tSoy : x.tSoy), 0);
    if (bal > 2) dcfLedger.push({ id: 'dcf-adj-1', date: adjDate, kind: 'rettifica', tSoy: -0.6, scheme: 'ProTerra', note: 'Differenza inventariale del silo dedicato alla soia segregata (conta trimestrale)' });
  }

  // crediti RTRS (book and claim): anno precedente e anno in corso
  const y = +String(t0).slice(0, 4);
  const soyCredits = [
    { id: `cr-${y - 1}`, year: y - 1, scheme: 'RTRS', tCovered: 1000, certId: `RTRS-CR-${y - 1}-00412`, purchasedAt: `${y - 1}-11-20`, evidenceId: null, note: 'Crediti di soia responsabile acquistati sulla piattaforma dello schema (dati dimostrativi)' },
    { id: `cr-${y}`, year: y, scheme: 'RTRS', tCovered: 1200, certId: `RTRS-CR-${y}-00177`, purchasedAt: `${y}-03-15` < t0 ? `${y}-03-15` : t0, evidenceId: null, note: 'Crediti di soia responsabile acquistati sulla piattaforma dello schema (dati dimostrativi)' },
  ];

  // valutazioni ESG dei fornitori: 9 su 17, 6 codici di condotta firmati, 2 azioni correttive aperte
  const D = n => addDays(t0, n);
  const ESG = [
    [TRADER, 62, 58, 71, D(-150), 'standard', D(-300), ['filiera della soia da paesi a rischio standard: diritti fondiari e condizioni di lavoro nelle aziende d’origine'],
      [{ date: D(-150), type: 'audit documentale ESG', outcome: 'conforme con osservazioni', nc: 1 }], [{ text: 'Comunicare il riferimento DDS di ogni lotto entro 5 giorni dall’arrivo', due: D(20), status: 'aperta' }]],
    [ADRIATICHE, 55, 61, 64, D(-280), 'standard', D(-280), [], [{ date: D(-285), type: 'audit documentale ESG', outcome: 'conforme con osservazioni', nc: 1 }],
      [{ text: 'Comunicare i riferimenti DDS con ogni consegna', due: D(-270), status: 'chiusa', closedAt: D(-282) }]],
    ['sup-oleificio', 68, 66, 72, D(-95), 'basso', D(-95), [], [], []],
    ['sup-consorzio-agrario', 71, 74, 78, D(-240), 'basso', D(-240), [], [{ date: D(-240), type: 'audit in sito', outcome: 'conforme', nc: 0 }], []],
    ['sup-agricola-tavoliere-s-r-l', 58, 63, 60, D(-200), 'basso', D(-200), [], [], []],
    ['sup-cereali-del-sud-s-r-l', 44, 39, 52, D(-60), 'basso', null, ['lavoro stagionale nel centro di stoccaggio: contratti e alloggi da verificare'],
      [{ date: D(-60), type: 'audit in sito', outcome: 'non conforme', nc: 2 }], [{ text: 'Piano per la sicurezza dei lavoratori stagionali nel centro di stoccaggio', due: D(-5), status: 'aperta' }]],
    ['sup-minerali', 66, 70, 75, D(-130), 'basso', D(-130), [], [], []],
    ['sup-additivi', 74, 72, 80, D(-170), 'basso', null, [], [], []],
    ['sup-molino', 60, 65, 68, D(-400), 'basso', null, [], [{ date: D(-400), type: 'audit documentale ESG', outcome: 'conforme', nc: 0 }], []],
  ];
  const supplierEsg = ESG.filter(x => sups[x[0]]).map(([id, E, S, G, at, risk, coc, flags, audits, capa]) => ({
    id, assessedAt: at, scoreE: E, scoreS: S, scoreG: G, countryRisk: risk, ...(coc ? { cocSignedAt: coc } : {}), hrFlags: flags, audits, capa, nextReview: addDays(at, 365), source: 'valutazione dimostrativa' }));

  // richieste ai fornitori: 2 inviate (una sollecitata e in ritardo), 1 ricevuta
  const dTmp = { ...d, eudrLots, eudrItems };
  const reqs = [];
  const reqLots = [...recentMissing].filter(id => d.ingLots.find(l => l.id === id)?.supplierId === TRADER);
  if (sups[TRADER] && reqLots.length) reqs.push({ id: 'rq-1', supplierId: TRADER, kind: 'eudr', sentAt: D(-6), dueAt: D(8), status: 'inviato', lang: 'it', lots: reqLots });
  if (sups[ADRIATICHE]) reqs.push({ id: 'rq-2', supplierId: ADRIATICHE, kind: 'esg', sentAt: D(-40), dueAt: D(-10), status: 'sollecitato', remindedAt: D(-8), lang: 'it' });
  if (sups['sup-oleificio']) reqs.push({ id: 'rq-3', supplierId: 'sup-oleificio', kind: 'certificati', sentAt: D(-55), dueAt: D(-41), status: 'ricevuto', receivedAt: D(-44), lang: 'it', respondent: 'Ufficio qualità (dati dimostrativi)' });
  const supplierRequests = reqs.map(q => {
    const payload = requestPayload(dTmp, q);
    const out = { ...q, payload, formHash: formHash(payload) };
    if (q.status === 'ricevuto') out.replyHash = sha256HexSync(canonicalJson({ requestId: q.id, formHash: out.formHash, dimostrativo: true }));
    return out;
  });

  return {
    add: { eudrItems, eudrLots, eudrPlots, dcfLedger, soyCredits, supplierEsg, supplierRequests },
    settings: { esg18: { filiera: {
      role: 'fuori-ambito', roleConfirmedAt: D(-120), size: 'grande-media', answers: { imports: 'occasionale', resellsAsSuch: false, firstDownstream: false },
      roleNote: 'Compra farina di soia da commercianti dell’UE e la trasforma in mangimi composti (NC 2309), senza rivenderla tal quale: non è il primo operatore a valle. Un lotto importato direttamente nel periodo (esempio) la rende operatore per quel lotto.',
    } } },
  };
}
