/* DifesaOS · Generatore dell'azienda di agrofarmaci dimostrativa «Arvale Dimostrativa S.p.A.» (dati SINTETICI e deterministici).
 * Stessa forma dei dati del mangimificio (stesse raccolte), così direzione, finanza, commerciale, acquisti, produzione e qualità
 * funzionano senza modifiche: ricette per tonnellata di prodotto, lotti di materia prima consumati in ordine di arrivo (FIFO),
 * lotti di prodotto esauriti dalle spedizioni, energia, acqua e rifiuti derivati dalla produzione.
 * Stagionalità per categoria: rameici a fine inverno e in autunno, zolfo in estate, erbicidi a marzo e a settembre. */
import { INGREDIENTS_AGRO, PRODUCTS_AGRO, LINES_AGRO, AGENTS_AGRO, TOWNS_AGRO, customerNames } from './catalog.js';
import { PV_PROFILE } from '../../../engine/energy.js';
import { rng, iso, addDays, mondayOf, monthOf, parse, round, byId, sum, dayOfYear } from '../../../core/util.js';
import { COLLECTIONS, DEFAULT_SETTINGS } from '../../../core/schema.js';

export const AGRO_DEMO_VERSION = 2; // 2: prove di campo, illustrazioni e prezzi della concorrenza

/* Stagionalità: somma di campane sul giorno dell'anno (distanza circolare), normalizzata a media 1 sull'anno. */
const bump = (doy, c, w) => { const x = Math.min(Math.abs(doy - c), 365 - Math.abs(doy - c)); return Math.exp(-0.5 * (x / w) ** 2); };
const SEASON_RAW = {
  rameico: doy => 0.35 + 1.3 * bump(doy, 50, 38) + 1.0 * bump(doy, 318, 32) + 0.35 * bump(doy, 125, 28),
  zolfo: doy => 0.2 + 1.9 * bump(doy, 165, 42),
  fungicida: doy => 0.25 + 1.6 * bump(doy, 140, 48),
  insetticida: doy => 0.25 + 1.5 * bump(doy, 170, 48),
  erbicida: doy => 0.2 + 1.5 * bump(doy, 78, 28) + 0.9 * bump(doy, 268, 24),
  biologico: doy => 0.3 + 1.5 * bump(doy, 140, 55),
  biostimolante: doy => 0.3 + 1.5 * bump(doy, 112, 45),
};
const SEASON_MEAN = Object.fromEntries(Object.entries(SEASON_RAW).map(([k, f]) => [k, Array.from({ length: 365 }, (_, i) => f(i + 1)).reduce((a, b) => a + b, 0) / 365]));
/** Fattore stagionale della categoria al giorno dell'anno (media annua 1). */
export const seasonOf = (cat, doy) => (SEASON_RAW[cat] ? SEASON_RAW[cat](doy) / SEASON_MEAN[cat] : 1);

const SIZE = { rivendita: [0.8, 3.2], consorzio: [4, 8], cooperativa: [1, 3.5], distributore: [3, 6] };
const PAY = { rivendita: [90, 120, 120, 150, 180], consorzio: [90, 120], cooperativa: [60, 90, 120], distributore: [60, 90] };
// colture servite dalle cooperative per nome
const coopCrops = n => (/Cantina/.test(n) ? ['vite'] : /Frutticola|Agrumi/.test(n) ? ['frutta'] : /Oleificio|Frantoio/.test(n) ? ['olivo'] : /Orticola/.test(n) ? ['orticole'] : /Cerealicola/.test(n) ? ['cereali'] : ['vite']);

export function generateAgroDemo({ today = iso(new Date()), seed = 26 } = {}) {
  const R = rng(seed);
  const start = addDays(mondayOf(today), -51 * 7);
  const weekFrac = Math.min(1, (Math.round((parse(today) - parse(mondayOf(today))) / 864e5) + 1) / 5);
  const weeks = Array.from({ length: 52 }, (_, k) => addDays(start, 7 * k));

  // ---------- prezzi delle materie prime: serie settimanale (il rame segue il mercato del metallo) ----------
  const priceIdx = {};
  for (const i of INGREDIENTS_AGRO) {
    const vol = i.asId === 'rame' ? 0.02 : i.category === 'sostanza attiva' ? 0.007 : 0.005;
    const drift = i.asId === 'rame' ? 0.0022 : 0.0006;
    const s = new Array(104).fill(1);
    for (let k = 102; k >= 0; k--) s[k] = s[k + 1] / (1 + R.normal(drift, vol));
    priceIdx[i.id] = s;
  }
  const priceAt = (ingId, w) => round(INGREDIENTS_AGRO.find(i => i.id === ingId).price * priceIdx[ingId][52 + Math.max(-52, Math.min(51, w))], 1);

  // ---------- materie prime, ricette (versioni) e prodotti ----------
  const ingredients = INGREDIENTS_AGRO.map(i => ({ ...i, nutr: {}, contam: {} }));
  const formulas = [], products = [];
  for (const [code, name, cat, form, uom, density, pack, lineId, share, proc, packCost, logi, minM, tgtM, price, crops, actives, recipe] of PRODUCTS_AGRO) {
    const lines = Object.entries(recipe).map(([ing, kg]) => ({ ing, kg }));
    const baseCode = code.replace(/(\d)$/, '').replace(/WG1$|WG5$/, 'WG');
    let f = formulas.find(x => x.code === 'R-' + baseCode);
    if (!f) {
      const history = [];
      const nVer = ['CU30WG', 'FL50SC', 'AC20SL'].includes(code) ? 2 : 1;
      for (let v = 1; v <= nVer; v++) {
        const wIdx = v === nVer ? R.int(30, 46) : R.int(0, 10);
        const lv = v < nVer ? lines.map(l => (l.ing === 'lignosolf' || l.ing === 'tensio' ? { ...l, kg: l.kg + 5 } : l.ing === 'caolino' || l.ing === 'acqua' ? { ...l, kg: l.kg - 5 * lines.filter(x => x.ing === 'lignosolf' || x.ing === 'tensio').length } : l)) : lines;
        history.push({ version: v, date: weeks[wIdx], lines: lv, cost: round(sum(lv, l => priceAt(l.ing, wIdx) * l.kg / 1000), 2),
          note: v === 1 ? 'Ricetta registrata' : 'Ottimizzazione dei coformulanti (composizione autorizzata invariata)', author: 'Laboratorio formulazione', approvedBy: 'Direzione tecnica' });
      }
      const last = history[history.length - 1];
      f = { id: 'f-' + baseCode.toLowerCase(), code: 'R-' + baseCode, name: name.replace(/ \d+ (kg|L)$/, ''), specId: null, species: cat, status: 'approvata',
        version: last.version, lines: last.lines, approvedAt: last.date, approvedCost: last.cost, history, notes: 'Composizione conforme alla registrazione (dati dimostrativi)' };
      formulas.push(f);
    }
    products.push({
      id: 'p-' + code.toLowerCase(), code, name, formulaId: f.id, form, formulation: form, packaging: pack, lineId, share, uom, density,
      processCost: proc, packCost, logisticsCost: logi, shrinkPct: 0.3, minMarginPct: minM, targetMarginPct: tgtM,
      listPrice: Math.round(price / density * 1000 / 10) * 10, unitPrice: price, active: true, species: cat, category: cat, crops, actives: actives.map(([as, g]) => ({ as, g, unit: uom === 'L' ? 'g/L' : 'g/kg' })),
    });
  }
  const prodByCode = byId(products.map(p => ({ ...p, id: p.code })));

  // ---------- agenti e clienti ----------
  const agents = AGENTS_AGRO.map(a => ({ ...a }));
  const names = customerNames(R);
  const customers = [];
  let cn = 0;
  for (const [type, list] of Object.entries(names)) {
    for (const nm of list) {
      cn++;
      const town = R.pick(TOWNS_AGRO);
      const crops = type === 'cooperativa' ? coopCrops(nm) : type === 'rivendita' ? town[5] : ['vite', 'frutta', 'olivo', 'orticole', 'cereali'];
      const fits = products.filter(p => p.crops.some(c => crops.includes(c)));
      const take = type === 'rivendita' ? R.shuffle(fits).slice(0, Math.max(5, Math.round(fits.length * R.range(0.55, 0.85)))) : fits;
      const [lo, hi] = SIZE[type];
      customers.push({ id: 'c-' + cn, code: 'C' + String(100 + cn), name: nm, type, species: crops, products: take.map(p => p.code),
        city: town[0], province: town[1], lat: town[2] + R.range(-0.05, 0.05), lon: town[3] + R.range(-0.05, 0.05), agentId: town[4],
        paymentDays: R.pick(PAY[type]), since: String(R.int(1990, 2023)), weekly: round(R.range(lo, hi), 2), discountPct: round(type === 'consorzio' ? R.range(4, 7) : type === 'distributore' ? R.range(5, 8) : R.range(1, 4.5), 1),
        status: 'attivo', heads: null, licence: type === 'rivendita' || type === 'consorzio' ? `Autorizzazione alla vendita n. ${R.int(100, 999)}/${R.int(2015, 2024)} (demo)` : '' });
    }
  }
  const sleeping = customers.find(c => c.type === 'rivendita');
  if (sleeping) sleeping.stopAfterWeek = 40;

  // ---------- domanda settimanale: ogni cliente ordina 1-3 prodotti di stagione ----------
  const orders = [];
  for (let w = 0; w < 52; w++) {
    const doy = dayOfYear(weeks[w]);
    for (const c of customers) {
      if (c.stopAfterWeek && w > c.stopAfterWeek) continue;
      const cand = c.products.map(code => prodByCode[code]).filter(Boolean).map(p => ({ p, wgt: p.share * seasonOf(p.category, doy) }));
      const tot = sum(cand, x => x.wgt);
      if (tot <= 0) continue;
      const n = Math.min(cand.length, R.int(1, 3));
      const picked = new Set();
      for (let k = 0; k < n; k++) picked.add(R.weighted(cand, cand.map(x => x.wgt)).p.code);
      const weekT = c.weekly * (sum(cand, x => x.wgt) / sum(cand, x => x.p.share)) * (1 + 0.04 * w / 52) * R.range(0.75, 1.25) * (w === 51 ? weekFrac : 1);
      const pw = [...picked].map(code => cand.find(x => x.p.code === code)), pwT = sum(pw, x => x.wgt);
      for (const x of pw) {
        const t = round(weekT * x.wgt / pwT, 2);
        if (t >= 0.08) orders.push({ w, customerId: c.id, productId: 'p-' + x.p.code.toLowerCase(), tonnes: t });
      }
    }
  }

  // ---------- lotti di materie prime (FIFO), produzione e lotti di prodotto ----------
  const ingById = byId(ingredients), formById = byId(formulas), lineById = byId(LINES_AGRO), prodById = byId(products);
  const queue = Object.fromEntries(ingredients.map(i => [i.id, []]));
  const ingLots = [];
  let ilId = 0;
  const makeIngLot = (ingId, date, tonnes, wIdx, forced = {}) => {
    const ing = ingById[ingId];
    ilId++;
    const code = `${ing.code.replace('MP', 'M')}-${date.slice(2, 4)}${String(dayOfYear(date)).padStart(3, '0')}-${String(ilId % 100).padStart(2, '0')}`;
    const assay = ing.assay ? round(ing.assay * R.range(0.995, 1.012), 2) : null;
    const lot = { id: 'il-' + ilId, code, ingId, supplier: ing.supplier, date, tonnes: round(tonnes, 2), remaining: round(tonnes, 2), price: priceAt(ingId, wIdx),
      ddt: 'DDT ' + R.int(1000, 9999), analyses: assay != null ? { titolo: assay } : {}, status: forced.status || 'accettato', note: forced.note || '' };
    ingLots.push(lot);
    if (lot.status === 'accettato') queue[ingId].push(lot);
    return lot;
  };
  const minLot = ing => (ing.category === 'acqua' ? 60 : ing.asId === 'rame' ? 20 : ing.category === 'sostanza attiva' ? (ing.price > 50000 ? 0.5 : 4) : ing.category === 'solvente' ? 18 : 6);
  const linesAt = (f, date) => { let cur = f.history[0]; for (const h of f.history) if (h.date <= date) cur = h; return cur; };
  // scorte iniziali per due settimane di consumo della prima settimana
  {
    const use0 = {};
    for (const o of orders.filter(o => o.w === 0)) for (const l of linesAt(formById[prodById[o.productId].formulaId], weeks[0]).lines) use0[l.ing] = (use0[l.ing] || 0) + o.tonnes * l.kg / 1000;
    for (const i of ingredients) makeIngLot(i.id, addDays(start, -R.int(3, 20)), Math.max(minLot(i), (use0[i.id] || 0) * R.range(2.5, 4)), 0);
  }
  const alloc = (ingId, kg, date, w) => {
    const out = [];
    let need = kg;
    while (need > 1e-6) {
      let lot = queue[ingId].find(l => l.remaining > 1e-6 && l.date <= date);
      if (!lot) lot = makeIngLot(ingId, addDays(date, -1), Math.max(minLot(ingById[ingId]), need / 1000 * 1.5), w, { note: 'Consegna urgente' });
      const take = Math.min(need, lot.remaining * 1000);
      lot.remaining = round(lot.remaining - take / 1000, 4);
      out.push({ l: lot.id, kg: round(take, 2) });
      need -= take;
      if (lot.remaining <= 1e-6) queue[ingId].splice(queue[ingId].indexOf(lot), 1);
    }
    return out;
  };

  const runs = [], lots = [], shipments = [], productStock = [];
  let runId = 0, shId = 0;
  const offSpecWeek = 33; // un lotto fuori titolo (riprocessato) per la storia della qualità
  for (let w = 0; w < 52; w++) {
    const monday = weeks[w];
    const weekOrders = orders.filter(o => o.w === w);
    const demand = {};
    for (const o of weekOrders) demand[o.productId] = (demand[o.productId] || 0) + o.tonnes;
    // ricevimenti: copertura di giorni di sicurezza + consegna sul consumo previsto della settimana
    const use = {};
    for (const p of products) for (const l of linesAt(formById[p.formulaId], monday).lines) use[l.ing] = (use[l.ing] || 0) + (demand[p.id] || 0) * l.kg / 1000;
    for (const i of ingredients) {
      const u = use[i.id] || 0;
      if (u <= 0) continue;
      const onHand = sum(queue[i.id], l => l.remaining);
      const target = u / 7 * (Math.min(60, +i.safetyDays || 15) + 7);
      if (onHand < target) {
        const qty = Math.max(minLot(i), target - onHand + u * 0.4);
        const parts = Math.max(1, Math.ceil(qty / (i.asId === 'rame' ? 24 : 40)));
        for (let k = 0; k < parts; k++) makeIngLot(i.id, addDays(monday, Math.min(4, k + R.int(0, 1))), qty / parts, w);
      }
    }
    if (w === 22) makeIngLot('acetam', addDays(monday, 2), 1.5, w, { status: 'bloccato', note: 'Respinto: titolo sotto specifica (97,1% contro ≥ 98,5%)' });
    // produzione: una o due campagne per prodotto nella settimana
    for (const p of products) {
      const t = demand[p.id] || 0;
      if (t <= 0) continue;
      const f = formById[p.formulaId], ver = linesAt(f, monday), line = lineById[p.lineId];
      const nRuns = t > 30 ? 2 : 1;
      for (let k = 0; k < nRuns; k++) {
        let date = addDays(monday, Math.min(4, Math.floor((k + R.next()) * 5 / nRuns)));
        if (date > today) date = addDays(today, -R.int(0, 2));
        const tons = round(t / nRuns * R.range(1.0, 1.06), 2);
        const hours = round(tons / (line.capacityTph * R.range(0.78, 0.92)) + 0.75, 1); // + pulizia e cambio formato
        const kwh = round(tons * line.kwhPerT * R.range(0.93, 1.07), 0);
        const gpl = round(tons * line.gplKgPerT * R.range(0.92, 1.08), 0);
        runId++;
        const lotCode = `${p.code.slice(0, 4)}-${date.slice(2, 4)}${String(dayOfYear(date)).padStart(3, '0')}-${String(runId % 100).padStart(2, '0')}`;
        const comp = [];
        for (const l of ver.lines) comp.push(...alloc(l.ing, tons * l.kg, date, w).map(x => ({ ...x, ing: l.ing })));
        runs.push({ id: 'r-' + runId, date, lineId: line.id, productId: p.id, formulaId: f.id, formulaVersion: ver.version, tonnes: tons, hours, kwh, gplKg: gpl, waste: round(tons * R.range(0.002, 0.007), 3), lotId: 'lt-' + runId, shift: R.pick(['1°', '2°']) });
        const act = p.actives[0];
        const declared = act ? act.g : null;
        let found = declared != null ? round(declared * R.range(0.985, 1.025), 1) : null;
        if (w === offSpecWeek && p.code === 'CU30WG' && k === 0 && found != null) found = round(declared * 0.93, 1);
        lots.push({ id: 'lt-' + runId, code: lotCode, runId: 'r-' + runId, productId: p.id, date, tonnes: tons, comp, status: 'rilasciato',
          analyses: found != null ? [{ date: addDays(date, 1), method: p.form === 'EC' || p.form === 'SL' || p.form === 'SC' ? 'HPLC' : 'Titolazione', values: { titolo: found, dichiarato: declared, unita: act.unit } }] : [] });
        productStock.push({ lot: lots[lots.length - 1], left: tons });
      }
    }
    // spedizioni FIFO dai lotti disponibili
    for (const o of weekOrders) {
      let need = o.tonnes;
      const c = customers.find(x => x.id === o.customerId), p = prodById[o.productId];
      let date = addDays(monday, R.int(1, 5));
      if (date > today) date = addDays(monday, R.int(0, Math.max(0, Math.round((parse(today) - parse(monday)) / 864e5))));
      while (need > 0.01) {
        const s = productStock.find(x => x.lot.productId === o.productId && x.left > 0.01 && x.lot.date <= date);
        if (!s) break;
        const take = Math.min(need, s.left);
        s.left = round(s.left - take, 3); need = round(need - take, 3);
        shId++;
        shipments.push({ id: 's-' + shId, date, customerId: c.id, productId: p.id, lotId: s.lot.id, tonnes: round(take, 3), price: Math.round(p.listPrice * (w < 20 ? 0.98 : 1) * (1 - c.discountPct / 100)), agentId: c.agentId, ddt: 'DDT ' + (6000 + shId) });
      }
    }
    for (let k = productStock.length - 1; k >= 0; k--) if (productStock[k].left <= 0.01) productStock.splice(k, 1);
  }
  // lotto fuori titolo: rilavorato (resta tracciato)
  for (const l of lots) if (l.analyses[0] && l.analyses[0].values.titolo < l.analyses[0].values.dichiarato * 0.95) { l.status = 'bloccato'; l.note = 'Titolo di rame sotto la tolleranza: lotto da rilavorare'; }
  for (const l of lots.filter(l => l.date >= addDays(today, -3)).slice(0, 2)) l.status = 'in attesa';

  // ---------- reclami ----------
  const kinds = [
    ['Confezione', 'Sacco rotto alla consegna', 'servizio', 1], ['Prodotto', 'Granuli che non si disperdono bene in botte', 'prodotto', 2],
    ['Prodotto', 'Sedimentazione nella tanica dopo il magazzino invernale', 'prodotto', 2], ['Etichetta', 'Etichetta non aggiornata all’ultima autorizzazione', 'etichetta', 2],
    ['Consegna', 'Consegna in ritardo in piena campagna', 'servizio', 2], ['Efficacia', 'Efficacia ridotta segnalata dal tecnico del cliente', 'prestazioni', 3],
    ['Fitotossicità', 'Sospetta fitotossicità su orticole in serra', 'prestazioni', 3], ['Quantità', 'Colli consegnati inferiori al DDT', 'servizio', 1],
  ];
  const complaints = [];
  const shipIn = (fromW, toW) => shipments.filter(s => s.date >= weeks[fromW] && s.date < addDays(weeks[Math.min(51, toW)], 7));
  for (let k = 0; k < 14; k++) {
    const sh = R.pick(shipIn(2, 49)); if (!sh) continue;
    const kind = R.pick(kinds), d = addDays(sh.date, R.int(2, 15)), done = d < addDays(today, -15);
    complaints.push({ id: 'rc-' + (k + 1), code: 'RC-' + d.slice(2, 4) + '-' + String(k + 1).padStart(3, '0'), date: d, customerId: sh.customerId, productId: sh.productId, lotId: sh.lotId,
      category: kind[0], description: kind[1], kind: kind[2], severity: kind[3], source: 'cliente', status: done ? 'chiuso' : R.chance(0.5) ? 'analisi' : 'aperto', owner: 'Qualità',
      rootCause: done ? R.pick(['Umidità dei granuli fuori specifica', 'Movimentazione del vettore', 'Nessuna non conformità riscontrata', 'Etichetta di vecchia stampa ancora a magazzino']) : '',
      action: done ? R.pick(['Controllo dell’essiccatore', 'Richiamo al vettore', 'Nessuna azione: reclamo non fondato', 'Ritiro e rietichettatura delle giacenze']) : '',
      closedAt: done ? addDays(d, R.int(5, 25)) : null, cost: done ? R.int(0, 2500) : null });
  }

  // ---------- giacenze, ordini aperti, piano ----------
  for (const i of ingredients) i.stock = round(sum(queue[i.id], l => l.remaining), 2);
  const purchases = [];
  let poId = 0;
  const po = (ingId, tonnes, days, extra = {}) => { const ing = ingById[ingId]; poId++; purchases.push({ id: 'po-' + poId, code: 'OA-' + String(2600 + poId), ingId, supplier: ing.supplier, date: addDays(today, days - R.int(10, 25)), tonnes, price: ing.price, deliveryDate: addDays(today, days), status: 'confermato', ...extra }); };
  po('cuoh', 48, 6, { contract: 'Contratto annuale con prezzo legato al rame' }); po('cuocl', 24, 12); po('zolfo', 60, 9); po('caolino', 40, 5);
  po('pendi', 8, 18, { mode: 'nave' }); po('solvente', 20, 7); po('lignosolf', 12, 10);
  const plan = [];
  const w0 = mondayOf(today);
  for (let k = 0; k < 8; k++) {
    const week = addDays(w0, 7 * k), doy = dayOfYear(week);
    for (const p of products) {
      const base = sum(orders.filter(o => o.productId === p.id), o => o.tonnes) / 52;
      const t = round(base * seasonOf(p.category, doy) * R.range(0.92, 1.08), 1);
      if (t >= 0.5) plan.push({ id: `pl-${k}-${p.code}`, week, productId: p.id, lineId: p.lineId, tonnes: t, status: k === 0 ? 'confermato' : 'previsto' });
    }
  }

  // ---------- energia, acqua, rifiuti mensili ----------
  const energy = [], water = [], waste = [];
  const months = [...new Set(runs.map(r => monthOf(r.date)))].sort();
  let readP = 31250, fir = 52100;
  months.forEach((m, k) => {
    const rs = runs.filter(r => monthOf(r.date) === m), tonnes = sum(rs, r => r.tonnes);
    const pv = round(400 * 1420 * PV_PROFILE[+m.slice(5, 7) - 1] * R.range(0.92, 1.05), 0), exp = round(pv * R.range(0.05, 0.14), 0);
    energy.push({ id: 'en-' + m, month: m, tonnes: round(tonnes, 1), kwhGrid: Math.max(0, round(sum(rs, r => r.kwh) + 42000 - (pv - exp), 0)), kwhPV: pv, kwhExport: exp, gplKg: round(sum(rs, r => r.gplKg), 0), source: 'Letture contatori (dati dimostrativi)', measuredPV: true });
    if (m >= monthOf(today)) return;
    const inProducts = sum(rs, r => (formById[r.formulaId]?.lines.find(l => l.ing === 'acqua')?.kg || 0) * r.tonnes / 1000);
    const washes = rs.filter(r => r.lineId === 'L2').length * 2.2 + rs.filter(r => r.lineId === 'L1').length * 1.1;
    const proc = round(inProducts + washes, 0), serv = round(160 * R.range(0.9, 1.1), 0);
    readP += proc + serv;
    water.push({ id: 'wa-' + m + '-a', month: m, source: 'Acquedotto', m3: proc + serv, reading: readP, note: 'Acqua nei prodotti liquidi, lavaggi delle linee e servizi (dati dimostrativi)' });
    const day = n => `${m}-${String(n).padStart(2, '0')}`, t = Math.max(0.3, tonnes / 650);
    const put = (n, eer, name, kg, dest, op, note = '') => waste.push({ id: 'rf-' + (waste.length + 1), date: day(n), eer, name, kg: round(kg, 0), hazardous: eer.endsWith('*'), dest, op, fir: 'FIR ' + (++fir), note });
    put(R.int(5, 10), '07 04 01*', 'Soluzioni acquose di lavaggio ed acque madri', 5200 * t * R.range(0.85, 1.15), 'smaltimento', 'D9');
    put(R.int(5, 10), '15 01 10*', 'Imballaggi contenenti residui di sostanze pericolose', 1300 * t * R.range(0.8, 1.2), R.chance(0.7) ? 'recupero' : 'smaltimento', R.chance(0.7) ? 'R13' : 'D15');
    put(R.int(11, 18), '07 04 13*', 'Rifiuti solidi contenenti sostanze pericolose', 650 * t * R.range(0.7, 1.3), 'smaltimento', 'D10');
    put(R.int(11, 18), '15 01 01', 'Imballaggi di carta e cartone', 2600 * t * R.range(0.85, 1.15), 'recupero', 'R3');
    put(R.int(19, 26), '15 01 02', 'Imballaggi di plastica', 1500 * t * R.range(0.85, 1.15), 'recupero', 'R3');
    put(R.int(19, 26), '15 01 03', 'Imballaggi in legno (pallet)', 2100 * t * R.range(0.85, 1.15), 'recupero', 'R3');
    if (k % 2) put(R.int(20, 27), '20 03 01', 'Rifiuti urbani non differenziati', 380 * R.range(0.8, 1.2), 'smaltimento', 'D15', 'Ufficio e mensa');
  });

  // ---------- visite, offerte, attività ----------
  const visits = [];
  let vId = 0;
  for (let w = 26; w < 52; w++) for (const ag of agents) {
    const mine = customers.filter(c => c.agentId === ag.id);
    for (let k = 0; k < R.int(2, 4) && mine.length; k++) {
      const c = R.pick(mine);
      visits.push({ id: 'v-' + (++vId), date: addDays(weeks[w], R.int(0, 4)), customerId: c.id, agentId: ag.id, kind: R.chance(0.45) ? 'tecnica' : 'commerciale',
        notes: R.pick(['Presentazione del programma di difesa della vite', 'Prova di campo su melo con Bacillon WG', 'Verifica delle giacenze e dei possibili resi', 'Assistenza su peronospora dopo le piogge', 'Raccolta dei preordini per la prossima campagna', 'Formazione ai rivenditori sulle nuove etichette']),
        nextAction: R.pick(['Inviare offerta', 'Richiamare tra 15 giorni', 'Organizzare prova di campo', 'Nessuna', 'Mandare le nuove schede di sicurezza']) });
    }
  }
  const offers = [];
  for (let k = 0; k < 26; k++) {
    const c = R.pick(customers), p = prodByCode[R.pick(c.products)];
    if (!p) continue;
    const date = addDays(today, -R.int(0, 75)), disc = R.chance(0.12) ? R.range(0.08, 0.12) : R.range(0, 0.05);
    const status = date > addDays(today, -12) ? R.pick(['bozza', 'inviata', 'inviata']) : R.pick(['accettata', 'accettata', 'persa', 'inviata']);
    offers.push({ id: 'of-' + (k + 1), code: 'OF-' + today.slice(2, 4) + '-' + String(k + 101), date, customerId: c.id, productId: 'p-' + p.code.toLowerCase(), tonnes: round(R.range(0.6, 9), 1),
      price: Math.round(p.listPrice * (1 - disc - c.discountPct / 100) / 10) * 10, validUntil: addDays(date, 30), status, agentId: c.agentId,
      note: status === 'persa' ? R.pick(['Prezzo del concorrente più basso', 'Il cliente ha scelto un prodotto biologico', 'Tempi di consegna in campagna']) : '' });
  }
  const tasks = [
    { id: 't-1', createdAt: addDays(today, -18), title: 'Piano di smaltimento delle giacenze di Flufendo 500 SC dopo la revoca', area: 'regolatorio', owner: 'Regolatorio', due: addDays(today, 20), status: 'in corso', priority: 'alta', source: 'manuale', detail: 'Coordinare vendite residue entro il termine di vendita e ritiro dai rivenditori (dati dimostrativi).' },
    { id: 't-2', createdAt: addDays(today, -9), title: 'Contratto rame idrossido per il primo semestre', area: 'acquisti', owner: 'Acquisti', due: addDays(today, 14), status: 'aperto', priority: 'media', source: 'manuale', detail: 'Prezzo indicizzato al metallo.' },
    { id: 't-3', createdAt: addDays(today, -40), title: 'Taratura dell’essiccatore della linea WG', area: 'produzione', owner: 'Produzione', due: addDays(today, -25), status: 'fatto', priority: 'media', source: 'manuale', detail: '', doneAt: addDays(today, -27) },
  ];

  const settings = {
    schema: 17, dataset: 'demo', demoVersion: AGRO_DEMO_VERSION, demoAnchor: today,
    company: { name: 'Arvale Dimostrativa S.p.A.', short: 'Arvale Demo', site: 'Stabilimento di Campolongo', approval: '', address: 'Zona industriale, Campolongo (dati di fantasia)', lat: null, lon: null, sector: 'agrofarmaci' },
    energy: { kwhPrice: 0.19, gplPrice: 0.98, feGrid: 0.1926, feGpl: 2.985, gridFactor: 'ita24c' },
    milkPrice: 0, priceUnit: 't',
    ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
  for (const c of customers) delete c.stopAfterWeek;
  const out = {
    settings, ingredients, specs: [], formulas, products, lines: LINES_AGRO.map(l => ({ ...l })), customers, agents,
    ingLots, lots, runs, shipments, complaints, market: [], purchases, plan, energy, water, waste, visits, offers, tasks, adjustments: [],
    esgManual: {}, survey: {}, scenarios: [], events: [],
  };
  for (const c of COLLECTIONS) if (!Array.isArray(out[c])) out[c] = [];
  return out;
}
