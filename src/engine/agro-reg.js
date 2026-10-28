/* DifesaOS · Motore dell'area Regolatorio (edizione agrofarmaci): registrazioni e usi in etichetta, sostanze attive e rinnovi,
 * schede di sicurezza, Seveso e ADR. Funzioni pure (niente orologio: la data arriva da fuori), mai eccezioni: un archivio
 * senza queste raccolte (FeedOS, archivio vuoto) dà risultati vuoti.
 * Ogni regola ha riferimento, fonte e data di verifica in data/agro-rules.js; le stime dell'azienda (probabilità, orizzonte,
 * domanda dopo una revoca, costo di smaltimento) si leggono da settings.agro.rules con rulesOf(d). */
import { addDays, addMonths, daysBetween, round, sum, byId, dateIt, nf, eur } from '../core/util.js';
import { makeIndex, costsOf } from './actuals.js';

/* ---------------- pacchetto di regole (fonti in data/agro-rules.js) ---------------- */
export const AGRO_RULES = {
  version: '2026.1',
  art43Months: 3,              // domanda di rinnovo del prodotto entro 3 mesi dal rinnovo della sostanza attiva
  art46SaleMonths: 6,          // periodo di tolleranza massimo per la vendita dopo la revoca
  art46UseMonths: 12,          // ulteriore periodo massimo per l'impiego
  art53Days: 120,              // autorizzazione di emergenza: al massimo 120 giorni
  sdsLookbackDays: 365,        // REACH art. 31(9): la scheda aggiornata va ai destinatari degli ultimi 12 mesi
  disposalEurT: 1800,          // smaltimento come rifiuto pericoloso, €/t (stima dimostrativa)
  graceDemandFactor: 0.5,      // dopo l'annuncio della revoca i rivenditori non rifanno scorte: domanda dimezzata (stima)
  // probabilità di mancato rinnovo per classe (stime modificabili, non fatti)
  pNonRenewal: { 'non rinnovata': 1, revocata: 1, cfs: 0.35, 'in rinnovo': 0.15, standard: 0.1, 'basso rischio': 0.05 },
  horizonMonths: 36,
  // D.Lgs. 105/2015, allegato 1, parte 1: soglie in tonnellate [inferiore, superiore]
  seveso: {
    H1: { label: 'H1 · Tossicità acuta cat. 1', group: 'salute', q: [5, 20] },
    H2: { label: 'H2 · Tossicità acuta cat. 2 e cat. 3 per inalazione', group: 'salute', q: [50, 200] },
    H3: { label: 'H3 · Tossicità specifica per organi bersaglio (STOT SE 1)', group: 'salute', q: [50, 200] },
    P5c: { label: 'P5c · Liquidi infiammabili cat. 2 o 3', group: 'fisici', q: [5000, 50000] },
    E1: { label: 'E1 · Pericoloso per l’ambiente acquatico, acuto 1 o cronico 1', group: 'ambiente', q: [100, 200] },
    E2: { label: 'E2 · Pericoloso per l’ambiente acquatico, cronico 2', group: 'ambiente', q: [200, 500] },
  },
  adrFactor: { 0: 0, 1: 50, 2: 3, 3: 1, 4: 0 }, // ADR 1.1.3.6.4: moltiplicatori per categoria di trasporto
  adrLimit: 1000,
};
/** Regole con le stime dell'azienda salvate in settings.agro.rules (solo i parametri di AGRO_ESTIMATES). */
export function rulesOf(d) {
  const o = d?.settings?.agro?.rules || {};
  const num = v => (v != null && v !== '' && Number.isFinite(+v) ? +v : null);
  const p = {};
  for (const [k, v] of Object.entries(o.pNonRenewal || {})) if (num(v) != null && k in AGRO_RULES.pNonRenewal) p[k] = Math.min(1, Math.max(0, num(v)));
  const pick = (k, lo, hi) => (num(o[k]) == null ? AGRO_RULES[k] : Math.min(hi, Math.max(lo, num(o[k]))));
  return { ...AGRO_RULES, pNonRenewal: { ...AGRO_RULES.pNonRenewal, ...p }, horizonMonths: Math.round(pick('horizonMonths', 6, 120)), graceDemandFactor: pick('graceDemandFactor', 0, 1.5), disposalEurT: pick('disposalEurT', 0, 20000) };
}
export const SEVESO_GROUPS = { salute: 'Pericoli per la salute', fisici: 'Pericoli fisici', ambiente: 'Pericoli per l’ambiente' };

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const lastYear = (d, today) => (d.shipments || []).filter(s => s.date > addDays(today, -365) && s.date <= today);
const plural = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;

/* ================= registrazioni ================= */

/** Stato di vendita di una registrazione alla data: vendibile, vendibile in smaltimento scorte, solo impiego, non vendibile. */
export function saleStatus(reg, date) {
  if (!reg) return 'non-registrato';
  if (['valida', 'in-rinnovo', 'in-revoca'].includes(reg.status) && (!reg.expiryDate || date <= reg.expiryDate)) return 'vendibile';
  if (reg.status === 'in-domanda') return 'non-vendibile';
  if (reg.saleUntil && date <= reg.saleUntil) return 'vendibile-smaltimento';
  if (reg.useUntil && date <= reg.useUntil) return 'solo-impiego';
  return 'non-vendibile';
}
export const SALE_LABEL = { vendibile: 'Vendibile', 'vendibile-smaltimento': 'In smaltimento scorte', 'solo-impiego': 'Solo impiego', 'non-vendibile': 'Non vendibile', 'non-registrato': 'Senza registrazione' };

/** Date massime dell'art. 46 da usare per pianificare prima del decreto: vendita +6 mesi, impiego +12 mesi dopo la vendita. */
export function graceDefaults(withdrawalDate, R = AGRO_RULES) {
  const saleUntil = addMonths(withdrawalDate, R.art46SaleMonths);
  return { saleUntil, useUntil: addMonths(saleUntil, R.art46UseMonths), basis: 'stima-max-art46' };
}

/** Domande di rinnovo dei prodotti (art. 43): entro 3 mesi dal rinnovo di ogni sostanza attiva dichiarata. */
export function art43Due(d, today, R = rulesOf(d)) {
  const as = byId(d.activeSubstances || []);
  const out = [];
  for (const reg of d.registrations || []) {
    if (!['valida', 'in-rinnovo'].includes(reg.status)) continue;
    for (const x of reg.declared || []) {
      const a = as[x.asId];
      if (!a || !isDate(a.renewedOn)) continue;
      const due = addMonths(a.renewedOn, R.art43Months);
      const ev = (d.regEvents || []).find(e => e.registrationId === reg.id && e.kind === 'rinnovo-art43' && e.asId === x.asId);
      out.push({ registrationId: reg.id, productId: reg.productId, asId: x.asId, asName: a.name, renewedOn: a.renewedOn, due, daysLeft: daysBetween(today, due), done: !!ev?.submittedDate, event: ev || null });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

/** Ricavi e margini degli ultimi 12 mesi per prodotto (t, €, margine di contribuzione al costo standard). */
export function productRevenue(d, today) {
  let C = {};
  try { C = costsOf(d, makeIndex(d)); } catch { C = {}; }
  const out = {};
  for (const s of lastYear(d, today)) {
    const o = (out[s.productId] ||= { tonnes: 0, revenue: 0, cm: 0 });
    const t = +s.tonnes || 0, rev = t * (+s.price || 0);
    o.tonnes += t; o.revenue += rev; o.cm += rev - t * (C[s.productId]?.total || 0);
  }
  return out;
}

/** Classe di rischio di mancato rinnovo di una sostanza attiva entro l'orizzonte. */
export function asRiskClass(a, today, R = AGRO_RULES) {
  if (!a) return null;
  if (a.status === 'non rinnovata' || a.status === 'revocata') return a.status;
  const exp = a.approvalExpiry;
  if (isDate(exp) && exp > addMonths(today, R.horizonMonths)) return null;
  if (a.lowRisk) return 'basso rischio';
  if (a.cfs) return 'cfs';
  if (a.status === 'in rinnovo') return 'in rinnovo';
  return 'standard';
}

/**
 * Ricavi a rischio a 36 mesi: per prodotto r = 1 − Π(1 − r(sostanza)); 1 se la registrazione scade nell'orizzonte senza rinnovo.
 * Le probabilità sono stime dell'azienda (AGRO_RULES.pNonRenewal), da presentare come tali.
 */
export function revenueAtRisk(d, today, R = rulesOf(d)) {
  const as = byId(d.activeSubstances || []);
  const rev = productRevenue(d, today);
  const prods = byId(d.products || []);
  const hz = addMonths(today, R.horizonMonths);
  const rows = [];
  for (const reg of d.registrations || []) {
    const p = prods[reg.productId];
    if (!p) continue;
    const parts = (reg.declared || []).map(x => { const a = as[x.asId]; const cls = asRiskClass(a, today, R); return { asId: x.asId, name: a?.name || x.asId, cls, r: cls ? R.pNonRenewal[cls] ?? 0 : 0 }; });
    let r = 1 - parts.reduce((k, x) => k * (1 - x.r), 1);
    const renewing = reg.status === 'in-rinnovo' || (d.regEvents || []).some(e => e.registrationId === reg.id && /^rinnovo/.test(e.kind) && e.submittedDate);
    if (reg.status === 'revocata' || reg.status === 'in-revoca' || (isDate(reg.expiryDate) && reg.expiryDate <= hz && !renewing && reg.kind !== 'CE-fertilizzante')) r = 1;
    const x = rev[p.id] || { revenue: 0, cm: 0, tonnes: 0 };
    rows.push({ registrationId: reg.id, productId: p.id, code: p.code, name: p.name, r: round(r, 4), parts, revenue: x.revenue, cm: x.cm, rar: x.revenue * r, cmar: x.cm * r });
  }
  rows.sort((a, b) => b.rar - a.rar);
  const totalRev = sum(Object.values(rev), x => x.revenue);
  return { rows, rar: sum(rows, x => x.rar), cmar: sum(rows, x => x.cm * x.r), totalRev, share: totalRev > 0 ? sum(rows, x => x.rar) / totalRev : null };
}

/** Giacenze di prodotto finito per prodotto (t): lotti meno consegne. */
export function finishedStock(d) {
  const shipped = {};
  for (const s of d.shipments || []) if (s.lotId) shipped[s.lotId] = (shipped[s.lotId] || 0) + (+s.tonnes || 0);
  const out = {};
  for (const l of d.lots || []) {
    if (l.status === 'bloccato' || l.status === 'distrutto') continue;
    const left = (+l.tonnes || 0) - (shipped[l.id] || 0);
    if (left > 0.0005) out[l.productId] = (out[l.productId] || 0) + left;
  }
  return out;
}
/** Giacenze di materie prime per ingrediente (t). */
export function rawStock(d) {
  const out = {};
  for (const l of d.ingLots || []) if (l.status !== 'bloccato' && l.status !== 'respinto' && +l.remaining > 0) out[l.ingId] = (out[l.ingId] || 0) + +l.remaining;
  return out;
}

/**
 * Piano di smaltimento delle scorte di un prodotto revocato o in revoca (art. 46): domanda stimata fino alla fine della vendita
 * (stesso periodo dell'anno prima per AGRO_RULES.graceDemandFactor), prodotto finito in eccesso, produzione ancora possibile prima della revoca con la
 * sostanza tecnica in magazzino, sostanza tecnica che avanza; accantonamento = eccedenze al costo più lo smaltimento.
 */
export function disposalPlan(d, today, registrationId, R = rulesOf(d)) {
  const reg = (d.registrations || []).find(r => r.id === registrationId);
  if (!reg || !reg.saleUntil) return null;
  const p = (d.products || []).find(x => x.id === reg.productId);
  if (!p) return null;
  let C = {};
  try { C = costsOf(d, makeIndex(d)); } catch { C = {}; }
  const unitCost = C[p.id]?.total || 0;
  const stockT = finishedStock(d)[p.id] || 0;
  // materie prime dedicate: sostanze attive tecniche usate solo da prodotti con questa sostanza
  const asIds = new Set((reg.declared || []).map(x => x.asId));
  const ings = (d.ingredients || []).filter(i => i.asId && asIds.has(i.asId));
  const raw = rawStock(d);
  const f = (d.formulas || []).find(x => x.id === p.formulaId);
  const kgPerT = id => +(f?.lines || []).find(l => l.ing === id)?.kg || 0;
  const withdrawal = ['in-revoca', 'revocata'].includes(reg.status) ? reg.expiryDate : null;
  const canProduce = !!withdrawal && today < withdrawal;
  const from = addDays(today, -365), to = addDays(reg.saleUntil, -365);
  const histT = sum((d.shipments || []).filter(s => s.productId === p.id && s.date > from && s.date <= to), s => +s.tonnes || 0);
  const demandT = Math.max(0, today <= reg.saleUntil ? histT * R.graceDemandFactor : 0);
  const sellT = Math.min(stockT, demandT), finUnsoldT = stockT - sellT;
  let prodNeedT = canProduce ? Math.max(0, demandT - stockT) : 0;
  const rawRows = ings.map(i => {
    const t = raw[i.id] || 0, k = kgPerT(i.id) / 1000;
    const need = k > 0 ? Math.min(t, prodNeedT * k) : 0;
    if (k > 0) prodNeedT = Math.max(0, prodNeedT - need / k);
    const left = t - need;
    return { ingId: i.id, name: i.name, tonnes: t, usedT: need, leftT: left, leftValue: left * (+i.price || 0), productT: k > 0 ? left / k : null, value: t * (+i.price || 0) };
  }).filter(x => x.tonnes > 0);
  const makeT = canProduce ? Math.max(0, demandT - stockT) - prodNeedT : 0; // produzione ancora utile prima della revoca
  const unsoldT = finUnsoldT + sum(rawRows, x => x.productT || 0);
  const provision = finUnsoldT * (unitCost + R.disposalEurT) + sum(rawRows, x => x.leftValue + x.leftT * R.disposalEurT);
  // andamento settimanale: consumo lineare fino alla fine della vendita
  const weeks = Math.max(1, Math.ceil(daysBetween(today, reg.saleUntil) / 7));
  const burn = Array.from({ length: Math.min(weeks, 52) + 1 }, (_, i) => ({ week: addDays(today, i * 7), stockT: round(Math.max(stockT - (sellT * i) / weeks, unsoldT), 2) }));
  const actions = [
    ...(canProduce ? [{ id: 'acquisti', label: `Fermare gli acquisti di sostanza tecnica e programmare l’ultima produzione (${nf(makeT, 1)} t) prima della revoca del ${dateIt(withdrawal)}`, valueEur: null }] : []),
    { id: 'campagna', label: 'Spingere la vendita ai rivenditori con un premio di campagna dedicato', valueEur: sellT * (+p.listPrice || 0) },
    { id: 'export', label: 'Vendere all’estero dove il prodotto è ancora autorizzato (da verificare paese per paese)', valueEur: null },
    { id: 'rilavorazione', label: 'Rilavorare la sostanza tecnica in un prodotto autorizzato, solo se la ricetta registrata lo consente', valueEur: null },
    { id: 'smaltimento', label: 'Smaltire l’invenduto come rifiuto pericoloso entro la fine dell’impiego', valueEur: -(finUnsoldT + sum(rawRows, x => x.leftT)) * R.disposalEurT },
  ];
  return { reg, product: p, unitCost, stockT, rawRows, histT, demandT, sellT, finUnsoldT, unsoldT, makeT, withdrawal, canProduce, provision, burn, actions, basis: reg.graceBasis || 'decreto', saleUntil: reg.saleUntil, useUntil: reg.useUntil, daysLeft: daysBetween(today, reg.saleUntil) };
}

/** Matrice degli usi autorizzati: righe {coltura, avversità, prodotto, dosi, trattamenti, carenza}, filtrabile per coltura. */
export function usesMatrix(d, { crop = null, today = null } = {}) {
  const regs = byId(d.registrations || []), prods = byId(d.products || []);
  return (d.regUses || []).filter(u => !crop || u.crop === crop).map(u => {
    const reg = regs[u.registrationId], p = reg && prods[reg.productId];
    return { ...u, productId: p?.id || null, code: p?.code || '', product: p?.name || '', sale: today ? saleStatus(reg, today) : null, organic: !!reg?.organic };
  }).sort((a, b) => (a.crop + a.pest + a.product < b.crop + b.pest + b.product ? -1 : 1));
}

/** Dose per ettaro da una dose per ettolitro con un volume d'acqua standard (15 hl/ha arboree e vite espansa, 10 hl/ha erbacee). */
export const doseHa = (perHl, hlHa) => (perHl == null || hlHa == null ? null : (perHl * hlHa) / 1000);

/** Rame metallo per ettaro di un programma: Σ dose (kg o L/ha) × trattamenti × contenuto (g/kg o g/L) / 1000. */
export function copperBudget(apps, d) {
  const prods = byId(d.products || []);
  let kg = 0;
  for (const a of apps || []) {
    const p = prods[a.productId];
    const cu = (p?.actives || []).find(x => x.as === 'rame');
    if (cu) kg += (+a.dose || 0) * (+a.n || 1) * (+cu.g || 0) / 1000;
  }
  return round(kg, 3);
}

/* ================= sostanze attive ================= */

/** Sostanze attive con prodotti che le contengono, ricavi esposti e prossima scadenza. */
export function substanceBoard(d, today) {
  const rev = productRevenue(d, today);
  const prods = d.products || [];
  return (d.activeSubstances || []).map(a => {
    const ps = prods.filter(p => (p.actives || []).some(x => x.as === a.id));
    const revenue = sum(ps, p => rev[p.id]?.revenue || 0);
    const days = isDate(a.approvalExpiry) ? daysBetween(today, a.approvalExpiry) : null;
    return { ...a, products: ps.map(p => ({ id: p.id, code: p.code, name: p.name })), revenue, days, riskClass: asRiskClass(a, today, rulesOf(d)) };
  }).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
}

/* ================= schede di sicurezza ================= */

const hazardOf = p => p?.hazard || { h: [], pict: [], seveso: [], adr: null };
/** Pericoli per la salute o fisici: servono UFI in etichetta e notifica PCN (CLP allegato VIII); i soli pericoli ambientali no. */
export const needsUfi = p => (hazardOf(p).h || []).some(h => /^H[23]/.test(h));

/**
 * Invii mancanti della scheda di sicurezza in vigore: ogni cliente servito nei 12 mesi prima della revisione e ogni
 * cliente servito dopo deve avere la versione corrente (REACH art. 31(9)); più i prodotti pericolosi senza UFI o PCN.
 */
export function sdsGaps(d, today, R = rulesOf(d)) {
  const latest = {};
  for (const s of d.sdsDocs || []) if (!latest[s.productId] || +s.version > +latest[s.productId].version) latest[s.productId] = s;
  const sent = {};
  for (const x of d.sdsDispatches || []) { const k = x.customerId + '|' + x.productId; sent[k] = Math.max(sent[k] || 0, +x.version || 0); }
  const custs = byId(d.customers || []), prods = byId(d.products || []);
  const gaps = [], byProduct = {};
  const seen = new Set();
  for (const s of d.shipments || []) {
    const doc = latest[s.productId];
    if (!doc || s.date > today || s.date < addDays(doc.date, -R.sdsLookbackDays)) continue;
    const k = s.customerId + '|' + s.productId;
    if (seen.has(k)) continue;
    seen.add(k);
    const have = sent[k] || 0;
    const o = (byProduct[s.productId] ||= { productId: s.productId, version: doc.version, date: doc.date, recipients: 0, missing: 0 });
    o.recipients++;
    if (have < +doc.version) {
      o.missing++;
      gaps.push({ id: k, customerId: s.customerId, customer: custs[s.customerId]?.name || s.customerId, productId: s.productId, product: prods[s.productId]?.name || s.productId,
        version: doc.version, have: have || null, since: doc.date, days: daysBetween(doc.date, today) });
    }
  }
  const ufi = (d.products || []).filter(p => needsUfi(p)).map(p => { const doc = latest[p.id]; return { productId: p.id, code: p.code, name: p.name, ufi: doc?.ufi || '', pcnDate: doc?.pcnDate || null, ok: !!(doc?.ufi && doc?.pcnDate) }; });
  const rows = Object.values(byProduct);
  const recipients = sum(rows, x => x.recipients), missing = sum(rows, x => x.missing);
  return { gaps: gaps.sort((a, b) => b.days - a.days), byProduct: rows, coverage: recipients ? 1 - missing / recipients : null, recipients, missing, ufi, latest };
}

/* ================= Seveso ================= */

/**
 * Indici di sommatoria Seveso per gruppo (salute, fisici, ambiente) sulle giacenze presenti: Σ q / Q (soglia inferiore e superiore).
 * Le categorie vengono da products[].hazard.seveso e ingredients[].seveso (classificazione indicativa da verificare).
 */
export function sevesoIndex(d, R = rulesOf(d), override = null) {
  const fin = override?.finished || finishedStock(d), raw = override?.raw || rawStock(d);
  const byCat = {}, items = [];
  for (const p of d.products || []) for (const c of hazardOf(p).seveso || []) if (fin[p.id] > 0 && R.seveso[c]) { byCat[c] = (byCat[c] || 0) + fin[p.id]; items.push({ kind: 'prodotto', id: p.id, name: p.name, cat: c, tonnes: fin[p.id] }); }
  for (const i of d.ingredients || []) for (const c of i.seveso || []) if (raw[i.id] > 0 && R.seveso[c]) { byCat[c] = (byCat[c] || 0) + raw[i.id]; items.push({ kind: 'materia prima', id: i.id, name: i.name, cat: c, tonnes: raw[i.id] }); }
  const cats = Object.entries(R.seveso).map(([id, s]) => ({ id, ...s, tonnes: round(byCat[id] || 0, 2), lo: (byCat[id] || 0) / s.q[0], hi: (byCat[id] || 0) / s.q[1] }));
  const groups = Object.keys(SEVESO_GROUPS).map(g => {
    const cs = cats.filter(c => c.group === g);
    return { id: g, label: SEVESO_GROUPS[g], lo: sum(cs, c => c.lo), hi: sum(cs, c => c.hi) };
  });
  const tier = groups.some(g => g.hi >= 1) ? 'superiore' : groups.some(g => g.lo >= 1) ? 'inferiore' : 'non soggetto';
  const notified = d.settings?.agro?.seveso?.notified || {};
  const over = cats.filter(c => notified[c.id] != null && c.tonnes > +notified[c.id]).map(c => ({ ...c, notified: +notified[c.id] }));
  // margine: tonnellate di E1 che si possono ancora stoccare prima della soglia superiore del gruppo ambiente
  const env = groups.find(g => g.id === 'ambiente');
  const headE1 = env ? Math.max(0, (1 - env.hi) * R.seveso.E1.q[1]) : null;
  return { cats, groups, tier, items: items.sort((a, b) => b.tonnes - a.tonnes), notified, over, headE1, declaredTier: d.settings?.agro?.seveso?.tier || null };
}

/* ================= ADR ================= */

/** Confezione: «Tanica 5 L» → {size: 5, unit: 'L'}. */
export function packOf(p) {
  const m = String(p?.packaging || '').match(/([\d.,]+)\s*(kg|L)\b/i);
  return m ? { size: +m[1].replace(',', '.'), unit: m[2].toLowerCase() === 'l' ? 'L' : 'kg' } : { size: null, unit: p?.uom === 'L' ? 'L' : 'kg' };
}

/**
 * Punti ADR 1.1.3.6 di un'unità di trasporto: Σ quantità (kg o L) × moltiplicatore della categoria di trasporto.
 * UN3077 e UN3082 in imballaggi fino a 5 kg o 5 L sono esclusi dall'ADR (disposizione speciale 375).
 */
export function adrPoints(items, d, R = AGRO_RULES) {
  const prods = byId(d.products || []);
  let points = 0, exemptQty = 0, adrQty = 0;
  const lines = [];
  for (const it of items) {
    const p = prods[it.productId], adr = hazardOf(p).adr;
    const pk = packOf(p);
    const qty = pk.unit === 'L' ? ((+it.tonnes || 0) * 1000) / (+p?.density || 1) : (+it.tonnes || 0) * 1000;
    if (!adr) { lines.push({ ...it, qty, unit: pk.unit, status: 'non pericoloso', points: 0 }); continue; }
    if (['UN3077', 'UN3082'].includes(adr.un) && pk.size != null && pk.size <= 5) { exemptQty += qty; lines.push({ ...it, qty, unit: pk.unit, un: adr.un, status: 'DS 375', points: 0 }); continue; }
    const pts = qty * (R.adrFactor[adr.cat] ?? 1);
    points += pts; adrQty += qty;
    lines.push({ ...it, qty, unit: pk.unit, un: adr.un, cls: adr.cls, cat: adr.cat, status: 'ADR', points: pts });
  }
  return { points: round(points, 0), full: points > R.adrLimit, exemptQty, adrQty, lines };
}

/** Unità di trasporto degli ultimi giorni (consegne dello stesso giorno allo stesso cliente) con i punti ADR. */
export function transportUnits(d, today, days = 30, R = rulesOf(d)) {
  const from = addDays(today, -days);
  const groups = {};
  for (const s of d.shipments || []) if (s.date > from && s.date <= today) (groups[s.date + '|' + s.customerId] ||= []).push(s);
  const custs = byId(d.customers || []);
  return Object.entries(groups).map(([k, items]) => {
    const [date, customerId] = k.split('|');
    return { id: k, date, customerId, customer: custs[customerId]?.name || customerId, tonnes: sum(items, s => +s.tonnes || 0), ...adrPoints(items, d, R) };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.points - a.points));
}

/* ================= segnali, KPI e sezione del report ================= */

const L = (tab, id) => ({ area: 'regolatorio', tab, ...(id ? { id } : {}) });
const hasAgro = d => (d.registrations || []).length > 0;

/** Segnali dell'area Regolatorio per «Oggi» (prefissi reg:, sost:, sds:, seveso:, adr:). */
export function agroSignals(d, ctx) {
  const out = [];
  if (!d || !hasAgro(d)) return out;
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!isDate(today)) return out;
  const prods = byId(d.products || []), regs = byId(d.registrations || []);
  const rev = productRevenue(d, today);
  const R = ['direzione', 'formulazione', 'qualita'];
  // art. 43
  for (const x of art43Due(d, today)) {
    if (x.done || x.daysLeft > 90) continue;
    const p = prods[x.productId];
    out.push({ key: `reg:art43:${x.registrationId}:${x.asId}`, area: 'regolatorio', roles: R, severity: x.daysLeft <= 30 ? 'critico' : 'attenzione',
      title: `Rinnovo di ${p?.name || x.productId} da presentare entro il ${dateIt(x.due)}`,
      why: `La sostanza attiva ${x.asName} è stata rinnovata il ${dateIt(x.renewedOn)}: la domanda di rinnovo del prodotto va presentata entro ${AGRO_RULES.art43Months} mesi (Reg. CE 1107/2009, art. 43). Mancano ${plural(x.daysLeft, 'giorno', 'giorni')}; il prodotto vale ${eur(rev[x.productId]?.revenue || 0)} di ricavi in 12 mesi.`,
      action: 'Preparare il dossier di rinnovo e registrare la presentazione in Regolatorio › Registrazioni.', impact: (rev[x.productId]?.revenue || 0) + 1e5, link: L('registrazioni', x.registrationId) });
  }
  // revoche in smaltimento
  for (const reg of d.registrations || []) {
    if (!reg.saleUntil || today > reg.saleUntil) continue;
    const plan = disposalPlan(d, today, reg.id);
    if (!plan || plan.provision <= 0) continue;
    const tech = sum(plan.rawRows, x => x.leftT);
    out.push({ key: `reg:smaltimento:${reg.id}`, area: 'regolatorio', roles: ['direzione', 'formulazione', 'commerciale', 'acquisti'], severity: plan.provision > 5e4 ? 'critico' : 'attenzione',
      title: `${plan.product.name}: ${nf(plan.unsoldT, 1)} t equivalenti rischiano di restare invendute ${plan.canProduce ? 'con la revoca' : 'dopo la revoca'}`,
      why: `${plan.canProduce ? `Revoca dal ${dateIt(plan.withdrawal)}; ` : ''}vendita fino al ${dateIt(plan.saleUntil)}${plan.basis !== 'decreto' ? ' (data stimata sul massimo dell’art. 46)' : ''}, impiego fino al ${dateIt(plan.useUntil)}. Domanda stimata ${nf(plan.demandT, 1)} t contro ${nf(plan.stockT, 1)} t di prodotto${tech > 0 ? ` e ${nf(tech, 1)} t di sostanza tecnica che avanzano` : ''}: accantonamento ${eur(plan.provision)}.`,
      action: plan.canProduce ? 'Fermare gli acquisti della sostanza tecnica, programmare l’ultima produzione e offrire l’eccedenza ad altri formulatori o all’estero.' : 'Aprire il piano di smaltimento: premio di campagna dedicato ai rivenditori, vendite all’estero, smaltimento del resto.',
      impact: plan.provision + 2e5, link: L('registrazioni', reg.id) });
  }
  // scadenze senza rinnovo
  for (const reg of d.registrations || []) {
    if (!isDate(reg.expiryDate) || reg.status !== 'valida') continue;
    const days = daysBetween(today, reg.expiryDate);
    if (days < 0 || days > 180) continue;
    if ((d.regEvents || []).some(e => e.registrationId === reg.id && /^rinnovo/.test(e.kind) && e.submittedDate)) continue;
    const p = prods[reg.productId];
    out.push({ key: `reg:scadenza:${reg.id}`, area: 'regolatorio', roles: R, severity: days <= 60 ? 'critico' : 'attenzione', title: `Registrazione di ${p?.name || reg.productId} in scadenza il ${dateIt(reg.expiryDate)}`,
      why: `Nessuna domanda di rinnovo registrata; ricavi in 12 mesi ${eur(rev[reg.productId]?.revenue || 0)}.`, action: 'Verificare il procedimento di rinnovo o pianificare l’uscita del prodotto.', impact: (rev[reg.productId]?.revenue || 0) + 5e4, link: L('registrazioni', reg.id) });
  }
  // etichette da aggiornare
  for (const reg of d.registrations || []) {
    if (!isDate(reg.relabelDeadline) || !(+reg.oldLabelUnits > 0)) continue;
    const days = daysBetween(today, reg.relabelDeadline);
    if (days < 0 || days > 60) continue;
    const p = prods[reg.productId];
    out.push({ key: `reg:etichetta:${reg.id}:${reg.labelVersion}`, area: 'regolatorio', roles: ['formulazione', 'produzione', 'qualita'], severity: 'attenzione',
      title: `${nf(reg.oldLabelUnits)} confezioni di ${p?.name || reg.productId} con l’etichetta precedente`, why: `La nuova etichetta (versione ${reg.labelVersion}) va applicata entro il ${dateIt(reg.relabelDeadline)}: mancano ${plural(days, 'giorno', 'giorni')}.`,
      action: 'Programmare la rietichettatura in magazzino e nei depositi dei rivenditori.', impact: 4e4 + +reg.oldLabelUnits * 2, link: L('registrazioni', reg.id) });
  }
  // sostanze in scadenza
  for (const a of substanceBoard(d, today)) {
    if (a.days == null || a.days < 0 || a.days > 365 || a.status === 'non rinnovata') continue;
    out.push({ key: `sost:scadenza:${a.id}`, area: 'regolatorio', roles: R, severity: a.days <= 180 ? 'attenzione' : 'info',
      title: `${a.name}: approvazione in scadenza il ${dateIt(a.approvalExpiry)}`, why: `${a.status === 'in rinnovo' ? 'Rinnovo in corso. ' : ''}${plural(a.products.length, 'prodotto', 'prodotti')} del portafoglio con ${eur(a.revenue)} di ricavi in 12 mesi.${a.cfs ? ' Sostanza candidata alla sostituzione.' : ''}`,
      action: 'Seguire la decisione e preparare il piano di uscita o di rinnovo dei prodotti.', impact: a.revenue * 0.2 + 3e4, link: L('sostanze', a.id) });
  }
  // schede di sicurezza
  const g = sdsGaps(d, today);
  for (const r of g.byProduct) {
    if (!r.missing) continue;
    const p = prods[r.productId];
    out.push({ key: `sds:invio:${r.productId}:${r.version}`, area: 'regolatorio', roles: ['qualita', 'formulazione', 'commerciale'], severity: 'attenzione',
      title: `Scheda di sicurezza di ${p?.name || r.productId}: ${plural(r.missing, 'cliente', 'clienti')} senza la versione ${r.version}`,
      why: `La revisione del ${dateIt(r.date)} va inviata a tutti i destinatari degli ultimi 12 mesi (REACH art. 31, par. 9): ${nf(r.recipients - r.missing)} di ${nf(r.recipients)} l’hanno ricevuta.`,
      action: 'Inviare la scheda aggiornata e registrare gli invii in Regolatorio › Schede di sicurezza.', impact: 3e4 + r.missing * 1500, link: L('sds', r.productId) });
  }
  for (const u of g.ufi) if (!u.ok) out.push({ key: `sds:ufi:${u.productId}`, area: 'regolatorio', roles: ['qualita', 'formulazione'], severity: 'critico',
    title: `${u.name}: ${u.ufi ? 'notifica PCN non registrata' : 'manca il codice UFI'}`, why: 'Miscela classificata per pericoli per la salute o fisici: UFI in etichetta e notifica ai centri antiveleni (CLP, allegato VIII) prima dell’immissione sul mercato.',
    action: 'Generare l’UFI, presentare la notifica PCN e aggiornare etichetta e scheda.', impact: 9e4, link: L('sds', u.productId) });
  // Seveso
  const sv = sevesoIndex(d);
  for (const c of sv.over) out.push({ key: `seveso:notifica:${c.id}`, area: 'regolatorio', roles: ['direzione', 'produzione', 'qualita'], severity: 'critico',
    title: `Seveso ${c.id}: ${nf(c.tonnes, 1)} t presenti, notificate ${nf(c.notified, 1)} t`, why: `La quantità massima notificata della categoria «${c.label}» è superata. Gli indici di sommatoria restano sotto la soglia superiore, ma la notifica va aggiornata prima di superarla.`,
    action: 'Ridurre le giacenze della categoria (spedizioni, conto deposito) o aggiornare la notifica.', impact: 1.5e5, link: L('seveso') });
  for (const gr of sv.groups) if (gr.hi >= 0.8 && gr.hi < 1) out.push({ key: `seveso:soglia:${gr.id}`, area: 'regolatorio', roles: ['direzione', 'produzione'], severity: 'attenzione',
    title: `Indice Seveso «${gr.label.toLowerCase()}» a ${nf(gr.hi * 100)}% della soglia superiore`, why: `Sommatoria delle categorie del gruppo rispetto alle soglie superiori. Oltre il 100% lo stabilimento passa di soglia${gr.id === 'ambiente' && sv.headE1 != null ? `: restano circa ${nf(sv.headE1)} t di categoria E1` : ''}.`,
    action: 'Programmare produzione e spedizioni della stagione per restare sotto la soglia.', impact: 1.2e5, link: L('seveso') });
  return out;
}

/** KPI dell'area (per i cruscotti dell'edizione). */
export function agroKpis(d, today) {
  if (!hasAgro(d)) return null;
  const rar = revenueAtRisk(d, today), sds = sdsGaps(d, today), sv = sevesoIndex(d);
  return {
    valid: (d.registrations || []).filter(r => saleStatus(r, today) === 'vendibile').length,
    grace: (d.registrations || []).filter(r => saleStatus(r, today) === 'vendibile-smaltimento').length,
    rarShare: rar.share, rar: rar.rar, sdsCoverage: sds.coverage, sevesoHi: Math.max(...sv.groups.map(g => g.hi)), sevesoTier: sv.tier,
  };
}

/** Sezione del report per il CdA: stato regolatorio in quattro righe. */
export function agroReportSection(d, ctx) {
  if (!hasAgro(d)) return null;
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!isDate(today)) return null;
  const k = agroKpis(d, today), rar = revenueAtRisk(d, today);
  const top = rar.rows.filter(r => r.rar > 0).slice(0, 3).map(r => `${r.name} (${eur(r.rar)})`).join(', ');
  return {
    id: 'agro-regolatorio', title: 'Regolatorio', order: 35,
    kpis: [
      { label: 'Registrazioni vendibili', value: k.valid, unit: '', decimals: 0 },
      { label: 'Ricavi a rischio a 36 mesi (stima)', value: k.rarShare, unit: '%', decimals: 1, status: k.rarShare == null ? null : k.rarShare < 0.1 ? 'ok' : k.rarShare < 0.2 ? 'warn' : 'bad' },
      { label: 'Schede di sicurezza aggiornate', value: k.sdsCoverage, unit: '%', decimals: 0, status: k.sdsCoverage == null ? null : k.sdsCoverage >= 0.98 ? 'ok' : k.sdsCoverage >= 0.9 ? 'warn' : 'bad' },
    ],
    narrative: [
      `${plural(k.valid, 'registrazione vendibile', 'registrazioni vendibili')}${k.grace ? `, ${plural(k.grace, 'prodotto', 'prodotti')} in smaltimento scorte dopo la revoca` : ''}.`,
      `Ricavi a rischio a ${rulesOf(d).horizonMonths} mesi ${eur(rar.rar)} (${nf((k.rarShare || 0) * 100, 1)}% dei ricavi, stima): ${top || 'nessun prodotto esposto'}.`,
      `Schede di sicurezza aggiornate presso il ${nf((k.sdsCoverage ?? 1) * 100)}% dei destinatari degli ultimi 12 mesi.`,
      `Seveso: stabilimento di soglia ${k.sevesoTier}; indice più alto ${nf(k.sevesoHi * 100)}% della soglia superiore.`,
    ],
  };
}
