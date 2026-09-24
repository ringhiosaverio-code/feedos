/* FeedOS 16 · Generatore del mangimificio dimostrativo.
 * Dati SINTETICI, deterministici (stesso seme → stessi dati), coerenti tra loro:
 * le formule sono calcolate dal motore di formulazione, i lotti di prodotto contengono lotti di materia prima
 * assegnati in ordine di arrivo (FIFO), le spedizioni esauriscono i lotti, l'energia deriva dalla produzione. */
import { INGREDIENTS, SPECS } from './catalog.js';
import { AGENTS, TOWNS, FARM_NAMES, RETAIL_NAMES } from './people.js';
import { optimize } from '../../engine/formulation.js';
import { profile, SPECIES, AFB1_LIMITS } from '../../engine/nutrients.js';
import { PV_PROFILE } from '../../engine/energy.js';
import { productCost } from '../../engine/costing.js';
import { rng, iso, addDays, mondayOf, monthOf, parse, round, byId, sum, dayOfYear } from '../../core/util.js';

export const DEMO_VERSION = 1;

const PRODUCTS = [
  // code, name, spec, form, packaging, line, share, processCost, packCost, logistics, minMargin, targetMargin
  ['LT18', 'Latte 18 Pellet', 'sp-vl18', 'Pellet 6 mm', 'Sfuso', 'L1', 0.18, 38, 0, 21, 6, 10],
  ['LT18S', 'Latte 18 Sacco', 'sp-vl18', 'Pellet 6 mm', 'Sacchi 25 kg', 'L1', 0.07, 38, 24, 26, 8, 12],
  ['LT22', 'Latte Top 22', 'sp-vl22', 'Pellet 6 mm', 'Sfuso', 'L1', 0.08, 38, 0, 21, 7, 11],
  ['BC14', 'Vitellone Finish 14', 'sp-bc14', 'Pellet 8 mm', 'Sfuso', 'L2', 0.12, 36, 0, 21, 5, 9],
  ['VT20', 'Vitello Start 20', 'sp-vt20', 'Pellet 4 mm', 'Sacchi 25 kg', 'L2', 0.04, 41, 24, 26, 9, 13],
  ['OC18', 'Ovilatte 18', 'sp-oc18', 'Pellet 4 mm', 'Sacchi 25 kg', 'L2', 0.06, 41, 24, 26, 8, 12],
  ['SI15', 'Suino Pesante 15', 'sp-si15', 'Farina', 'Sfuso', 'L3', 0.14, 28, 0, 21, 5, 8],
  ['SW19', 'Suinetto Start 19', 'sp-sw19', 'Pellet 3 mm', 'Sacchi 25 kg', 'L2', 0.03, 42, 24, 26, 10, 14],
  ['OV17', 'Ovaiola 17', 'sp-ov17', 'Farina', 'Sacchi 25 kg', 'L3', 0.09, 30, 24, 26, 7, 11],
  ['BR21', 'Broiler Grower 21', 'sp-br21', 'Sbriciolato', 'Sfuso', 'L1', 0.08, 39, 0, 21, 5, 8],
  ['CO16', 'Coniglio 16', 'sp-co16', 'Pellet 3 mm', 'Sacchi 25 kg', 'L2', 0.06, 41, 24, 26, 9, 13],
  ['EQ12', 'Cavallo Relax 12', 'sp-eq12', 'Pellet 6 mm', 'Sacchi 25 kg', 'L2', 0.05, 41, 24, 26, 12, 16],
];
const LINES = [
  { id: 'L1', code: 'P1', name: 'Linea pellet 1', kind: 'pellet', capacityTph: 14, hoursWeek: 40, kwhPerT: 21.0, gplKgPerT: 2.5, color: 1 },
  { id: 'L2', code: 'P2', name: 'Linea pellet 2', kind: 'pellet', capacityTph: 9, hoursWeek: 56, kwhPerT: 24.0, gplKgPerT: 2.8, color: 2 },
  { id: 'L3', code: 'F1', name: 'Linea farine e insacco', kind: 'farina', capacityTph: 16, hoursWeek: 24, kwhPerT: 7.5, gplKgPerT: 0, color: 3 },
];
// specie servite per tipo di cliente
const FARM_TYPES = [
  { species: ['bovini-latte'], products: ['LT18', 'LT22', 'VT20'], w: 0.34, size: [14, 42] },
  { species: ['bovini-carne'], products: ['BC14', 'VT20'], w: 0.2, size: [12, 36] },
  { species: ['suini-ingrasso'], products: ['SI15', 'SW19'], w: 0.16, size: [22, 60] },
  { species: ['ovaiole'], products: ['OV17'], w: 0.08, size: [10, 26] },
  { species: ['broiler'], products: ['BR21'], w: 0.08, size: [16, 44] },
  { species: ['ovicaprini-latte'], products: ['OC18'], w: 0.08, size: [4, 10] },
  { species: ['conigli'], products: ['CO16'], w: 0.06, size: [4, 9] },
];
const MARKET = [['mais', 'Mais nazionale'], ['orzo', 'Orzo nazionale'], ['frumento', 'Frumento tenero'], ['sorgo', 'Sorgo'], ['soia44', 'Farina di soia 44%'], ['girasole', 'Farina di girasole'], ['crusca', 'Crusca di frumento'], ['ddgs', 'DDGS di mais'], ['olio', 'Olio di soia']];

export function generateDemo({ today = iso(new Date()), seed = 16 } = {}) {
  const R = rng(seed);
  const start = addDays(mondayOf(today), -51 * 7);        // 52 settimane di storia, l'ultima è quella in corso
  const weekFrac = Math.min(1, (Math.round((parse(today) - parse(mondayOf(today))) / 864e5) + 1) / 5); // quota della settimana in corso già lavorata
  const weeks = Array.from({ length: 52 }, (_, k) => addDays(start, 7 * k));
  const lastWeek = weeks[weeks.length - 1];

  // ---------- prezzi: serie settimanale per ogni materia prima, che termina al prezzo corrente ----------
  const priceIdx = {};
  for (const i of INGREDIENTS) {
    const vol = ['cereale', 'proteico', 'coprodotto', 'grasso'].includes(i.category) ? 0.022 : 0.008;
    const s = new Array(104).fill(1);
    for (let k = 102; k >= 0; k--) s[k] = s[k + 1] / (1 + R.normal(0.0012, vol) + (i.id === 'soia44' || i.id === 'soia48' ? (k > 90 ? -0.004 : 0) : 0));
    priceIdx[i.id] = s; // 104 settimane: le ultime 52 coincidono con la storia
  }
  // prezzo della settimana w (0 = prima settimana di storia, 51 = settimana corrente; valori negativi = anno precedente)
  const basePrice = Object.fromEntries(INGREDIENTS.map(i => [i.id, i.price]));
  const priceAt = (ingId, w) => round(basePrice[ingId] * priceIdx[ingId][52 + Math.max(-52, Math.min(51, w))], 1);

  // ---------- formule: approvate a date diverse con i prezzi di quel momento ----------
  const ingredients = INGREDIENTS.map(i => ({ ...i, nutr: { ...i.nutr }, contam: { ...i.contam } }));
  const specs = SPECS.map(s => ({ ...s }));
  const formulas = [];
  const products = [];
  for (const [code, name, specId, form, pack, lineId, share, proc, packCost, logi, minM, tgtM] of PRODUCTS) {
    const spec = specs.find(s => s.id === specId);
    let f = formulas.find(x => x.specId === specId);
    if (!f) {
      const history = [];
      const nVer = R.int(2, 4);
      const stale = specId === 'sp-vl18' || specId === 'sp-br21';
      const lastW = stale ? R.int(30, 35) : R.int(46, 50);
      let lines = null;
      for (let v = 1; v <= nVer; v++) {
        const wIdx = v === nVer ? lastW : Math.round(((v - 1) / nVer) * (lastW - 6) + R.int(0, 4));
        const prices = Object.fromEntries(ingredients.map(i => [i.id, priceAt(i.id, wIdx)]));
        const r = optimize({ ingredients, spec, lines: lines || [], options: { priceOverrides: prices, contaminant: { AFB1: AFB1_LIMITS[SPECIES[spec.species].afb1] }, maxChange: lines && v < nVer ? 60 : null } });
        if (r.status !== 'optimal') continue;
        lines = r.lines.map(l => ({ ing: l.ing, kg: round(l.kg, 1) }));
        fixTotal(lines);
        const cost = sum(lines, l => prices[l.ing] * l.kg / 1000);
        history.push({ version: v, date: weeks[wIdx], lines, cost: round(cost, 2), note: v === 1 ? 'Prima versione' : 'Aggiornamento prezzi e disponibilità', author: v % 2 ? 'Ufficio formulazione' : 'Nutrizionista', approvedBy: 'Direzione tecnica' });
      }
      const last = history[history.length - 1];
      f = {
        id: 'f-' + specId.slice(3), code: 'F-' + specId.slice(3).toUpperCase(), name: spec.name, specId, species: spec.species,
        status: 'approvata', version: last.version, lines: last.lines, approvedAt: last.date, approvedCost: last.cost,
        history, notes: '',
      };
      formulas.push(f);
    }
    products.push({
      id: 'p-' + code.toLowerCase(), code, name, formulaId: f.id, form, packaging: pack, lineId, share,
      processCost: proc, packCost: packCost, logisticsCost: logi, shrinkPct: 0.6, minMarginPct: minM, targetMarginPct: tgtM,
      listPrice: 0, active: true, species: spec.species,
    });
  }
  // listino: costo pieno ai prezzi di 8 settimane fa + margine obiettivo, arrotondato a 5 €/t
  const energySet = { kwhPrice: 0.19, gplPrice: 0.98 };
  for (const p of products) {
    const f = formulas.find(x => x.id === p.formulaId);
    const line = LINES.find(l => l.id === p.lineId);
    const raw = sum(f.lines, l => priceAt(l.ing, 51) * l.kg / 1000);
    const cost = raw * 1.006 + line.kwhPerT * energySet.kwhPrice + line.gplKgPerT * energySet.gplPrice + p.processCost + p.packCost + p.logisticsCost;
    const tight = p.code === 'BR21' || p.code === 'SI15';
    const m = tight ? p.minMarginPct - R.range(0.6, 1.4) : p.targetMarginPct - R.range(0, 2.5);
    p.listPrice = Math.round(cost / (1 - m / 100) / 5) * 5;
  }

  // ---------- clienti e agenti ----------
  const customers = [];
  const farmNames = R.shuffle(FARM_NAMES), retailNames = R.shuffle(RETAIL_NAMES);
  for (let k = 0; k < farmNames.length; k++) {
    const t = R.weighted(FARM_TYPES, FARM_TYPES.map(x => x.w));
    const town = R.pick(TOWNS);
    const weekly = round(R.range(t.size[0], t.size[1]), 1);
    customers.push({ id: 'c-' + (k + 1), code: 'C' + String(101 + k), name: farmNames[k], type: 'allevamento', species: t.species, products: t.products,
      city: town[0], province: town[1], lat: town[2] + R.range(-0.04, 0.04), lon: town[3] + R.range(-0.04, 0.04), agentId: town[4],
      heads: t.species[0] === 'bovini-latte' ? R.int(60, 420) : t.species[0] === 'suini-ingrasso' ? R.int(400, 2800) : t.species[0].startsWith('ov') || t.species[0] === 'broiler' ? R.int(8000, 45000) : R.int(80, 900),
      paymentDays: R.pick([30, 60, 60, 90]), since: String(R.int(1998, 2024)), weekly, discountPct: round(R.range(0, 3.5), 1), status: 'attivo' });
  }
  for (let k = 0; k < retailNames.length; k++) {
    const town = R.pick(TOWNS);
    customers.push({ id: 'c-r' + (k + 1), code: 'R' + String(201 + k), name: retailNames[k], type: 'rivendita', species: ['misto'],
      products: R.shuffle(['LT18S', 'OC18', 'VT20', 'OV17', 'CO16', 'EQ12', 'SW19']).slice(0, R.int(3, 6)),
      city: town[0], province: town[1], lat: town[2] + R.range(-0.04, 0.04), lon: town[3] + R.range(-0.04, 0.04), agentId: town[4],
      heads: null, paymentDays: R.pick([60, 90, 90, 120]), since: String(R.int(1995, 2023)), weekly: round(R.range(16, 44), 1), discountPct: round(R.range(3, 7), 1), status: 'attivo' });
  }
  // un cliente che si è fermato (segnale commerciale)
  const sleeping = customers.find(c => c.type === 'allevamento' && c.products.includes('LT18'));
  if (sleeping) sleeping.stopAfterWeek = 44;

  // ---------- domanda settimanale per prodotto (stagionalità + tendenza) ----------
  const prodByCode = Object.fromEntries(products.map(p => [p.code, p]));
  const season = (code, w) => {
    const doy = dayOfYear(weeks[w]);
    const s = Math.sin(2 * Math.PI * (doy - 20) / 365);
    if (code.startsWith('LT') || code === 'OC18') return 1 + 0.07 * s;            // più latte in inverno-primavera
    if (code === 'BC14') return 1 - 0.05 * s;
    if (code === 'EQ12' || code === 'CO16') return 1 + 0.04 * Math.cos(2 * Math.PI * doy / 365);
    return 1;
  };
  const shipments = [];
  const orders = []; // domanda per settimana e prodotto
  let shId = 0;
  for (let w = 0; w < 52; w++) {
    for (const c of customers) {
      if (c.stopAfterWeek && w > c.stopAfterWeek) continue;
      for (const pc of c.products) {
        const p = prodByCode[pc];
        if (!p) continue;
        const every = c.type === 'rivendita' ? 1 : (c.weekly < 8 ? 2 : 1);
        if ((w + c.code.charCodeAt(2)) % every !== 0) continue;
        const shareInCustomer = 1 / c.products.length * (pc === 'LT18' ? 1.4 : pc === 'VT20' || pc === 'SW19' ? 0.35 : 1);
        const t = Math.max(1, round(c.weekly * every * shareInCustomer * season(pc, w) * (1 + 0.03 * w / 52) * R.range(0.8, 1.2) * (w === 51 ? weekFrac : 1), 1));
        orders.push({ w, customerId: c.id, productId: p.id, tonnes: t });
      }
    }
  }

  // ---------- ricevimenti materie prime (lotti) e produzione (FIFO) ----------
  const ingById = byId(ingredients);
  const formById = byId(formulas);
  const lineById = byId(LINES);
  const queue = Object.fromEntries(ingredients.map(i => [i.id, []]));
  const ingLots = [];
  const stock = Object.fromEntries(ingredients.map(i => [i.id, (+i.stock || 20) * 0.9]));
  let ilId = 0;
  const makeIngLot = (ingId, date, tonnes, wIdx, forced = {}) => {
    const ing = ingById[ingId];
    ilId++;
    const yy = date.slice(2, 4), doy = String(dayOfYear(date)).padStart(3, '0');
    const code = `${ing.code.replace('MP', 'M')}-${yy}${doy}-${String(ilId % 100).padStart(2, '0')}`;
    const cereal = ['cereale', 'coprodotto'].includes(ing.category) || ingId === 'ddgs';
    let afb1 = null;
    if (['mais', 'sorgo', 'ddgs', 'glutine'].includes(ingId)) afb1 = round(R.logn(ingId === 'mais' ? 2.4 : 1.8, 0.75), 1);
    else if (cereal) afb1 = round(R.logn(0.5, 0.5), 1);
    if (forced.afb1 != null) afb1 = forced.afb1;
    const lot = {
      id: 'il-' + ilId, code, ingId, supplier: ing.supplier, date, tonnes: round(tonnes, 1), remaining: round(tonnes, 1),
      price: priceAt(ingId, wIdx), ddt: 'DDT ' + R.int(1000, 9999),
      analyses: { PG: ing.nutr.PG ? round(ing.nutr.PG * R.range(0.96, 1.04), 1) : null, UM: round(100 - ing.dm + R.normal(0, 0.5), 1), AFB1: afb1 },
      status: afb1 != null && afb1 > AFB1_LIMITS.materia_prima ? 'bloccato' : 'accettato',
      note: forced.note || '',
    };
    ingLots.push(lot);
    if (lot.status === 'accettato') queue[ingId].push(lot);
    return lot;
  };
  // scorte iniziali come lotti
  // scorte iniziali proporzionate al consumo della prima settimana: una materia prima non usata non ha giacenza
  {
    const firstLines = f => { let cur = f.history[0]; for (const h of f.history) if (h.date <= weeks[0]) cur = h; return cur.lines; };
    const use0 = {};
    for (const o of orders.filter(o => o.w === 0)) { const f = formById[prodByCode[products.find(p => p.id === o.productId).code].formulaId]; for (const l of firstLines(f)) use0[l.ing] = (use0[l.ing] || 0) + o.tonnes * l.kg / 1000; }
    for (const i of ingredients) { const t = (use0[i.id] || 0) / 7 * ((+i.safetyDays || 10) + R.int(4, 12)); if (t > 0.05) makeIngLot(i.id, addDays(start, -R.int(3, 20)), Math.max(t, 0.5), 0); }
  }

  const runs = [], lots = [];
  let runId = 0;
  const alloc = (ingId, kg, date) => {
    const out = [];
    let need = kg;
    const q = queue[ingId];
    while (need > 1e-6) {
      let lot = q.find(l => l.remaining > 1e-6 && l.date <= date);
      if (!lot) lot = makeIngLot(ingId, addDays(date, -1), Math.max(25, need / 1000 * 1.5), weeks.indexOf(mondayOf(date)) >= 0 ? weeks.indexOf(mondayOf(date)) : 51, { note: 'Consegna urgente' });
      const take = Math.min(need, lot.remaining * 1000);
      lot.remaining = round(lot.remaining - take / 1000, 4);
      out.push({ l: lot.id, kg: round(take, 1) });
      need -= take;
      if (lot.remaining <= 1e-6) q.splice(q.indexOf(lot), 1);
    }
    return out;
  };
  // formula in vigore a una data (versioni storiche)
  const linesAt = (f, date) => { let cur = f.history[0]; for (const h of f.history) if (h.date <= date) cur = h; return cur; };
  const productStock = []; // lotti disponibili alla spedizione
  // un lotto di mais con aflatossina alta ma entro il limite delle materie prime (storia di richiamo)
  const specialMaisWeek = 45;
  // deriva energetica della linea 2 nelle ultime 5 settimane
  const lineDrift = (lineId, w) => lineId === 'L2' && w >= 47 ? 1.1 + 0.01 * (w - 47) : 1;

  for (let w = 0; w < 52; w++) {
    const monday = weeks[w];
    // ricevimenti: riporta la scorta al livello obiettivo (consumo previsto × giorni di copertura)
    const weekOrders = orders.filter(o => o.w === w);
    const demand = {};
    for (const o of weekOrders) demand[o.productId] = (demand[o.productId] || 0) + o.tonnes;
    const use = {};
    for (const p of products) {
      const t = demand[p.id] || 0;
      const f = formById[p.formulaId];
      for (const l of linesAt(f, monday).lines) use[l.ing] = (use[l.ing] || 0) + t * l.kg / 1000;
    }
    for (const i of ingredients) {
      const u = use[i.id] || 0;
      if (u <= 0) continue;
      const onHand = queue[i.id].reduce((s, l) => s + l.remaining, 0);
      const target = u / 7 * ((+i.safetyDays || 10) + 9);
      if (onHand < target) {
        const qty = Math.max(i.category === 'aminoacido' || i.category === 'premix' ? 1 : 25, target - onHand + u * 0.3);
        const d = addDays(monday, R.int(0, 2));
        const forced = (i.id === 'mais' && w === specialMaisWeek) ? { afb1: 13.4, note: 'Aflatossina B1 sopra la media: ammesso come materia prima (limite 20 µg/kg)' } : {};
        const parts = Math.max(1, Math.ceil(qty / 90));
        for (let k = 0; k < parts; k++) makeIngLot(i.id, addDays(d, Math.min(4, k)), qty / parts, w, k === 0 ? forced : {});
      }
    }
    if (w === 38) makeIngLot('mais', addDays(monday, 1), 28, w, { afb1: 24.6, note: 'Respinto: aflatossina B1 oltre 20 µg/kg' });
    // produzione: campagne per prodotto nella settimana
    for (const p of products) {
      const t = demand[p.id] || 0;
      if (t <= 0) continue;
      const f = formById[p.formulaId];
      const ver = linesAt(f, monday);
      const nRuns = t > 150 ? 3 : t > 60 ? 2 : 1;
      for (let k = 0; k < nRuns; k++) {
        let date = addDays(monday, Math.min(4, Math.floor((k + R.next()) * 5 / nRuns))); // campagne distribuite da lunedì a venerdì
        if (date > today) date = addDays(today, -R.int(0, 2)); // nessuna registrazione futura
        const tons = round(t / nRuns * R.range(1.0, 1.04), 1);
        const line = lineById[p.lineId];
        const drift = lineDrift(line.id, w);
        const hours = round(tons / (line.capacityTph * R.range(0.82, 0.95)) * (drift > 1 ? 1.06 : 1), 1);
        const kwh = round(tons * line.kwhPerT * R.range(0.94, 1.06) * drift, 0);
        const gpl = round(tons * line.gplKgPerT * R.range(0.93, 1.07) * (drift > 1 ? 1.05 : 1), 0);
        const waste = round(tons * R.range(0.002, 0.008), 2);
        runId++;
        const yy = date.slice(2, 4), doy = String(dayOfYear(date)).padStart(3, '0');
        const lotCode = `L${yy}${doy}-${line.code}-${String(runId % 100).padStart(2, '0')}`;
        const comp = [];
        for (const l of ver.lines) comp.push(...alloc(l.ing, tons * l.kg, date).map(x => ({ ...x, ing: l.ing })));
        const run = { id: 'r-' + runId, date, lineId: line.id, productId: p.id, formulaId: f.id, formulaVersion: ver.version, tonnes: tons, hours, kwh, gplKg: gpl, waste, lotId: 'lt-' + runId, shift: R.pick(['1°', '2°']) };
        runs.push(run);
        const prof = profile(ver.lines, ingById);
        const nir = (k2, sd) => prof[k2] == null ? null : round(prof[k2] + R.normal(0, sd), 2);
        const lot = { id: 'lt-' + runId, code: lotCode, runId: run.id, productId: p.id, date, tonnes: tons, comp, status: 'rilasciato',
          analyses: R.chance(0.6) ? [{ date: addDays(date, 1), method: 'NIR', values: { PG: nir('PG', 0.28), GG: nir('GG', 0.18), FG: nir('FG', 0.3), CE: nir('CE', 0.22), UM: round(100 - (prof.SS || 88) + R.normal(0, 0.5), 2) } }] : [] };
        lots.push(lot);
        productStock.push({ lot, left: tons });
      }
    }
    // spedizioni della settimana: FIFO sui lotti disponibili
    for (const o of weekOrders) {
      let need = o.tonnes;
      const c = customers.find(x => x.id === o.customerId);
      const p = products.find(x => x.id === o.productId);
      let date = addDays(monday, R.int(1, 5));
      if (date > today) date = addDays(monday, R.int(0, Math.max(0, Math.round((parse(today) - parse(monday)) / 864e5)))); // settimana in corso: consegne da lunedì a oggi
      while (need > 0.05) {
        const s = productStock.find(x => x.lot.productId === o.productId && x.left > 0.05 && x.lot.date <= date);
        if (!s) break;
        const take = Math.min(need, s.left);
        s.left = round(s.left - take, 3); need = round(need - take, 3);
        shId++;
        const listW = p.listPrice * (w < 26 ? 0.97 : 1);
        shipments.push({ id: 's-' + shId, date, customerId: c.id, productId: p.id, lotId: s.lot.id, tonnes: round(take, 2), price: Math.round(listW * (1 - c.discountPct / 100)), agentId: c.agentId, ddt: 'DDT ' + (4000 + shId) });
      }
    }
    // prodotto vecchio non spedito resta a magazzino
    for (let k = productStock.length - 1; k >= 0; k--) if (productStock[k].left <= 0.05) productStock.splice(k, 1);
  }

  // ---------- anomalie di qualità ----------
  const byLot = byId(lots);
  const outOfTol = R.shuffle(lots.filter(l => l.analyses.length)).slice(0, 3);
  for (const l of outOfTol) { const a = l.analyses[0]; a.values.PG = round(a.values.PG - R.range(2.4, 3.2), 2); }
  // lotti recenti in quarantena in attesa di analisi
  for (const l of lots.filter(l => l.date >= addDays(today, -3)).slice(0, 3)) l.status = 'in attesa';

  // ---------- reclami e non conformità ----------
  const complaintKinds = [
    ['Qualità del pellet', 'Pellet friabile, molta polvere nel silo', 'prodotto', 2],
    ['Qualità del pellet', 'Pellet troppo duro per i vitelli', 'prodotto', 1],
    ['Consegna', 'Consegna in ritardo di due giorni', 'servizio', 1],
    ['Consegna', 'Quantità consegnata inferiore al DDT', 'servizio', 2],
    ['Etichetta', 'Cartellino mancante su un bancale', 'etichetta', 1],
    ['Prestazioni', 'Calo di latte dopo il cambio di lotto', 'prestazioni', 3],
    ['Qualità', 'Odore anomalo del mangime', 'prodotto', 2],
    ['Qualità', 'Presenza di corpi estranei (spago)', 'prodotto', 2],
  ];
  const complaints = [];
  const pickShip = (fromW, toW, filter = () => true) => R.pick(shipments.filter(s => s.date >= weeks[fromW] && s.date < addDays(weeks[Math.min(51, toW)], 7) && filter(s)));
  for (let k = 0; k < 13; k++) {
    const kind = R.pick(complaintKinds);
    const sh = pickShip(2, 49);
    if (!sh) continue;
    const d = addDays(sh.date, R.int(2, 12));
    complaints.push(mkComplaint(k, d, sh, kind, true));
  }
  // due reclami recenti sulla durezza del pellet della linea 2 (collegati alla deriva energetica)
  for (let k = 0; k < 2; k++) {
    const sh = pickShip(48, 51, s => runs.find(r => r.lotId === s.lotId)?.lineId === 'L2');
    if (sh) complaints.push(mkComplaint(20 + k, addDays(sh.date, R.int(1, 4)), sh, complaintKinds[0], false));
  }
  function mkComplaint(k, d, sh, kind, closed) {
    const done = closed && d < addDays(today, -15);
    return { id: 'rc-' + (k + 1), code: 'RC-' + d.slice(2, 4) + '-' + String(k + 1).padStart(3, '0'), date: d, customerId: sh.customerId, productId: sh.productId, lotId: sh.lotId,
      category: kind[0], description: kind[1], kind: kind[2], severity: kind[3], source: 'cliente',
      status: done ? 'chiuso' : (R.chance(0.5) ? 'analisi' : 'aperto'), owner: 'Qualità',
      rootCause: done ? R.pick(['Umidità di condizionamento bassa', 'Errore di carico', 'Trasportatore', 'Variazione di lotto della materia prima', 'Nessuna non conformità riscontrata']) : '',
      action: done ? R.pick(['Taratura del condizionatore', 'Formazione carico', 'Richiamo al trasportatore', 'Nessuna azione: reclamo non fondato']) : '',
      closedAt: done ? addDays(d, R.int(5, 20)) : null, cost: done ? R.int(0, 900) : null };
  }

  // ---------- quotazioni di mercato (104 settimane) ----------
  const market = [];
  for (const [ingId, label] of MARKET) {
    const ing = ingById[ingId];
    for (let k = 0; k < 104; k++) {
      const date = addDays(start, 7 * (k - 52) + 3);
      market.push({ id: `q-${ingId}-${k}`, commodity: ingId, label, date, price: round(ing.price * priceIdx[ingId][k] * (ingId === 'olio' ? 0.97 : 0.975), 1), source: 'Borsa merci (dati dimostrativi)' });
    }
  }

  // ---------- scorte correnti, ordini aperti ----------
  for (const i of ingredients) i.stock = round(queue[i.id].reduce((s, l) => s + l.remaining, 0), 1);
  // alcune materie prime lasciate volutamente basse per mostrare il calcolo dei fabbisogni
  const low = { soia48: 0.35, lisina: 0.3, orzo: 0.5 };
  const prodById2 = byId(products);
  for (const [id, f] of Object.entries(low)) {
    const q = queue[id];
    for (const l of q) l.remaining = round(l.remaining * f, 2);
    ingById[id].stock = round(q.reduce((s, l) => s + l.remaining, 0), 1);
  }
  const purchases = [];
  let poId = 0;
  const po = (ingId, tonnes, delivery, status, extra = {}) => { poId++; purchases.push({ id: 'po-' + poId, code: 'OA-' + String(2600 + poId), ingId, supplier: ingById[ingId].supplier, date: addDays(delivery, -R.int(6, 15)), tonnes, price: ingById[ingId].price, deliveryDate: delivery, status, ...extra }); };
  po('mais', 280, addDays(today, 3), 'confermato'); po('mais', 280, addDays(today, 10), 'confermato');
  po('soia44', 90, addDays(today, 6), 'confermato', { contract: 'Contratto trimestrale ott–dic', mode: 'nave' });
  po('crusca', 60, addDays(today, 4), 'confermato'); po('farinaccio', 60, addDays(today, 5), 'confermato');
  po('ddgs', 50, addDays(today, 12), 'confermato', { mode: 'ferrovia' }); po('carbonato', 25, addDays(today, 8), 'confermato');
  po('medica', 40, addDays(today, 9), 'confermato'); po('glutine', 50, addDays(today, 14), 'confermato', { mode: 'nave' });
  po('sorgo', 168, addDays(today, 5), 'confermato'); po('olio', 25, addDays(today, 6), 'confermato');

  // ---------- piano di produzione: prossime 8 settimane ----------
  const plan = [];
  const w0 = mondayOf(addDays(today, 7 * 0));
  for (let k = 0; k < 8; k++) {
    const week = addDays(w0, 7 * k);
    for (const p of products) {
      const hist = orders.filter(o => o.productId === p.id && o.w >= 44).reduce((s, o) => s + o.tonnes, 0) / 8;
      const t = Math.round(hist * season(p.code, 51) * (1 + (k === 2 ? 0.08 : 0)) * R.range(0.95, 1.06));
      if (t > 0) plan.push({ id: `pl-${k}-${p.code}`, week, productId: p.id, lineId: p.lineId, tonnes: t, status: k === 0 ? 'confermato' : 'previsto' });
    }
  }
  // ordine straordinario di un grande allevamento da carne: satura la linea pellet 2 nella quarta settimana
  { const x = plan.find(p => p.id === 'pl-3-BC14'); if (x) { x.tonnes += 90; x.note = 'Ordine straordinario (+90 t)'; } }

  // ---------- scorte correnti coerenti con il piano: consegne di inizio settimana dove servono ----------
  {
    const need = {};
    for (const pl of plan.filter(x => x.week === plan[0].week)) {
      const f = formById[prodById2[pl.productId].formulaId];
      for (const l of f.lines) need[l.ing] = (need[l.ing] || 0) + pl.tonnes * l.kg / 1000 / 7;
    }
    for (const i of ingredients) {
      const daily = need[i.id] || 0;
      if (daily <= 0) continue;
      if (low[i.id]) continue;
      const target = daily * ((+i.safetyDays || 10) + (+i.leadDays || 7) + R.int(3, 12)); // copre sicurezza + tempo di consegna
      const q = queue[i.id];
      const onHand = q.reduce((s2, l) => s2 + l.remaining, 0);
      if (onHand < target) {
        const lot = makeIngLot(i.id, addDays(mondayOf(today), R.int(0, 1)), target - onHand, 51);
        if (lot.status !== 'accettato') lot.status = 'accettato';
      }
      i.stock = round(q.reduce((s2, l) => s2 + l.remaining, 0), 1);
    }
    // consegna di mais di questa settimana con aflatossina B1 sopra la media (ammessa come materia prima)
    makeIngLot('mais', addDays(mondayOf(today), 1), 84, 51, { afb1: 12.2, note: 'Aflatossina B1 sopra la media: preferire le formule per animali adulti' });
    ingById.mais.stock = round(queue.mais.reduce((s2, l) => s2 + l.remaining, 0), 1);
  }

  // ---------- energia mensile (derivata dalla produzione) ----------
  const energy = [];
  const months = [...new Set(runs.map(r => monthOf(r.date)))].sort();
  for (const m of months) {
    const rs = runs.filter(r => monthOf(r.date) === m);
    const tonnes = sum(rs, r => r.tonnes);
    const kwhProc = sum(rs, r => r.kwh);
    const base = 15000; // servizi generali, uffici, aria compressa
    const kwhElec = kwhProc + base;
    const mi = +m.slice(5, 7) - 1;
    const pv = round(360 * 1480 * PV_PROFILE[mi] * R.range(0.92, 1.05), 0);
    const exportK = round(pv * R.range(0.06, 0.16), 0);
    const self = pv - exportK;
    energy.push({ id: 'en-' + m, month: m, tonnes: round(tonnes, 1), kwhGrid: Math.max(0, round(kwhElec - self, 0)), kwhPV: pv, kwhExport: exportK, gplKg: round(sum(rs, r => r.gplKg), 0), source: 'Letture contatori (dati dimostrativi)', measuredPV: true });
  }

  // ---------- visite tecniche e commerciali ----------
  const visits = [];
  let vId = 0;
  for (let w = 26; w < 52; w++) {
    for (const ag of AGENTS) {
      const nv = R.int(2, 4);
      const mine = customers.filter(c => c.agentId === ag.id);
      for (let k = 0; k < nv && mine.length; k++) {
        const c = R.pick(mine);
        const date = addDays(weeks[w], R.int(0, 4));
        vId++;
        const dairy = c.species.includes('bovini-latte');
        const milk = dairy ? round(R.range(24, 35), 1) : null;
        const feedCost = dairy ? round(R.range(6.2, 8.4), 2) : null;
        visits.push({ id: 'v-' + vId, date, customerId: c.id, agentId: ag.id, kind: dairy && R.chance(0.6) ? 'tecnica' : 'commerciale',
          notes: R.pick(['Verifica consumi e razione', 'Presentazione nuovo listino', 'Controllo condizione corporea', 'Richiesta offerta per il prossimo trimestre', 'Verifica silo e consegne', 'Consulenza su svezzamento']),
          milkKg: milk, feedCostHead: feedCost, milkPrice: dairy ? 0.54 : null, iofc: dairy ? round(milk * 0.54 - feedCost, 2) : null,
          nextAction: R.pick(['Inviare offerta', 'Richiamare tra 15 giorni', 'Prova prodotto', 'Nessuna', 'Analisi del fieno']) });
      }
    }
  }

  // ---------- offerte ----------
  const offers = [];
  for (let k = 0; k < 26; k++) {
    const c = R.pick(customers);
    const pc = R.pick(c.products);
    const p = prodByCode[pc];
    const date = addDays(today, -R.int(0, 75));
    const disc = R.chance(0.12) ? R.range(0.05, 0.08) : R.range(-0.01, 0.03);
    const price = Math.round(p.listPrice * (1 - disc) / 5) * 5;
    const status = date > addDays(today, -12) ? R.pick(['bozza', 'inviata', 'inviata']) : R.pick(['accettata', 'accettata', 'persa', 'inviata']);
    offers.push({ id: 'of-' + (k + 1), code: 'OF-' + today.slice(2, 4) + '-' + String(k + 101), date, customerId: c.id, productId: p.id, tonnes: Math.round(R.range(20, 160)), price, validUntil: addDays(date, 30), status, agentId: c.agentId, note: status === 'persa' ? R.pick(['Prezzo concorrente più basso', 'Cliente ha ridotto i capi', 'Tempi di consegna']) : '' });
  }

  // al massimo due offerte aperte sotto il prezzo minimo (le più recenti): le altre sono state già corrette dagli agenti
  {
    let below = 0;
    for (const o of [...offers].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (o.status !== 'bozza' && o.status !== 'inviata') continue;
      const p = products.find(x => x.id === o.productId), f = formulas.find(x => x.id === p.formulaId);
      const c = productCost(p, f, ingById, lineById[p.lineId], energySet);
      const minP = c.total / (1 - p.minMarginPct / 100);
      if (o.price < minP && ++below > 2) o.price = Math.ceil(minP * 1.015 / 5) * 5;
    }
  }

  // ---------- attività e decisioni già registrate ----------
  const tasks = [
    { id: 't-1', createdAt: addDays(today, -20), title: 'Installare un contatore dedicato dell’autoconsumo fotovoltaico', area: 'esg', owner: 'Manutenzione', due: addDays(today, 25), status: 'in corso', priority: 'alta', source: 'manuale', detail: 'Senza la misura dell’autoconsumo la CO₂ per tonnellata resta un intervallo (lezione della tesi).' },
    { id: 't-2', createdAt: addDays(today, -9), title: 'Rinnovare il contratto soia per il primo trimestre', area: 'acquisti', owner: 'Acquisti', due: addDays(today, 12), status: 'aperto', priority: 'media', source: 'manuale', detail: 'Copertura attuale fino a dicembre.' },
    { id: 't-3', createdAt: addDays(today, -40), title: 'Taratura del condizionatore linea pellet 1', area: 'produzione', owner: 'Produzione', due: addDays(today, -25), status: 'fatto', priority: 'media', source: 'manuale', detail: '', doneAt: addDays(today, -26) },
  ];

  // ---------- valori ESG inseriti a mano (dati dimostrativi) ----------
  const esgManual = {
    S1: 31, S2: 19.2, S3: 0.31, S4: 18, S5: 6.5, S6: 6.4, S7: 25, E9: 2150, E10: 186, E11: 78, E16: 4.2,
    C2: null, C4: 3.8, C5: 2.4, C6: 420000, C7: 36, G1: '3 consiglieri (1 donna)', G2: 'Sì', G3: 'Sì', G4: 0, G5: 'ISO 9001; biologico (Reg. UE 2018/848)', G6: 6, G7: 1, G8: 60, G9: 'Sì', G10: 'No', G11: 25, G12: 'No',
  };

  const settings = {
    schema: 16, dataset: 'demo', demoVersion: DEMO_VERSION, demoAnchor: today,
    company: { name: 'Mangimificio Dimostrativo S.p.A.', short: 'Mangimificio Demo', site: 'Stabilimento di Valle Verde', approval: 'αIT000000CS', address: 'Zona industriale, Valle Verde (dati di fantasia)' },
    energy: { ...energySet, feGrid: 0.2347, feGpl: 3.0115, gridFactor: 'ita23' }, // mix nazionale ISPRA 2023 (location-based)
    milkPrice: 0.54,
    priceUnit: 't',
  };
  return {
    settings, ingredients, specs, formulas, products, lines: LINES.map(l => ({ ...l })), customers, agents: AGENTS.map(a => ({ ...a })),
    ingLots, lots, runs, shipments, complaints, market, purchases, plan, energy, visits, offers, tasks,
    esgManual, scenarios: [
      { id: 'sc-1', name: 'Mais +10%', byIngredient: { mais: 10 }, byCategory: {}, reoptimize: true },
      { id: 'sc-2', name: 'Tutta la soia senza deforestazione', byIngredient: {}, byCategory: {}, reoptimize: true, swapSoy: true },
    ],
    events: [],
  };
}

function fixTotal(lines) {
  const t = lines.reduce((s, l) => s + l.kg, 0);
  if (lines.length) lines[0].kg = round(lines[0].kg + (1000 - t), 1);
}
