/* FeedOS 17 · Cassa a 13 settimane, debiti verso fornitori e capitale circolante (pacchetto WP2).
 * Qui sta anche il partitario clienti (fatture, incassi, scadenze, ritardi), perché serve sia alla cassa sia ai crediti:
 * credit.js lo riesporta e ci costruisce sopra fidi, rischio e segnali. Grafo dei motori aciclico:
 * actuals ← inventory ← cash ← credit. Tutto puro (usabile nei test in node).
 * Contratto della fondazione: cashLowPoint(d, ctx) → {week, closing, headroom, …} | null. */
import { energyPriceAt } from './actuals.js';
import { requirements } from './mrp.js';
import { valuationAt, finishedAt, costBase12, coveredDays, todayOf } from './inventory.js';
import { addDays, addMonths, endOfMonth, daysBetween, daysInMonth, mondayOf, monthsIn, quarterOf, sum, byId, norm } from '../core/util.js';

export { todayOf };
const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const r2 = v => Math.round(v * 100) / 100;
const EMPTY = [];

// piccola memoria per identità degli argomenti (poche voci per nome)
const caches = new Map();
function cached(name, deps, fn, max = 8) {
  let list = caches.get(name);
  if (!list) caches.set(name, list = []);
  const hit = list.find(c => c.deps.length === deps.length && c.deps.every((x, i) => x === deps[i]));
  if (hit) return hit.value;
  const value = fn();
  list.unshift({ deps, value });
  if (list.length > max) list.pop();
  return value;
}

/* ---------- impostazioni (lette con ripiego) ---------- */
export const finOf = d => d?.settings?.finance || {};
/** IVA sulle vendite (%): settings.finance.vatPct, di base 10 (mangimi). */
export const vatOf = d => (has(finOf(d).vatPct) ? +finOf(d).vatPct : 10);
/** IVA sugli acquisti di materie prime (%): settings.finance.purchaseVatPct, altrimenti come le vendite. */
export const purchaseVatOf = d => (has(finOf(d).purchaseVatPct) ? +finOf(d).purchaseVatPct : vatOf(d));
/** Costo del denaro (% annuo): settings.finance.rate, di base 5. */
export const rateOf = d => (has(finOf(d).rate) ? +finOf(d).rate : 5);
/** Giorni di ritardo oltre i quali uno scaduto si considera incassabile solo dopo un sollecito (previsione di cassa). */
export const OVERDUE_LAG = 14;

/* ---------- termini di pagamento ---------- */
/**
 * Scadenza dai termini. Con «data fattura fine mese» e giorni multipli di 30 si contano mesi interi, come per le Ri.Ba.
 * (31/01 + 60 gg d.f.f.m. → 31/03); con altri giorni si somma e si va a fine mese (15/01 + 45 → 28/02 → 28/02).
 * Senza fine mese: data + giorni.
 */
export function dueDateFor(date, { days = 60, endOfMonth: eom = true } = {}) {
  const g = Math.max(0, Math.round(n0(days)));
  if (eom === false) return addDays(date, g);
  return g % 30 === 0 ? endOfMonth(addMonths(String(date).slice(0, 10), g / 30)) : endOfMonth(addDays(date, g));
}
/** Termini del cliente: giorni (terms.days, paymentDays, 60), fine mese (di base sì), mezzo (Ri.Ba. per gli allevamenti, bonifico per le rivendite). */
export function customerTerms(c, settings) {
  const t = c?.terms || {};
  const days = has(t.days) ? +t.days : has(c?.paymentDays) ? +c.paymentDays : has(settings?.finance?.defaultCustomerDays) ? +settings.finance.defaultCustomerDays : 60;
  return { days, endOfMonth: t.endOfMonth !== false, method: t.method || (c?.type === 'rivendita' ? 'bonifico' : 'riba') };
}
/**
 * Termini del fornitore di un lotto MP o di un ordine: da d.suppliers (per supplierId, per nome o per materia prima in ingIds;
 * campi paymentDays ed endOfMonth, o terms {days, endOfMonth}), altrimenti
 * settings.finance.defaultSupplierDays (di base 60) con fine mese settings.finance.defaultSupplierEom (di base sì).
 */
export function supplierTerms(d, x) {
  const f = finOf(d);
  const def = { days: has(f.defaultSupplierDays) ? +f.defaultSupplierDays : 60, endOfMonth: f.defaultSupplierEom !== false, source: 'impostazioni' };
  const list = Array.isArray(d?.suppliers) ? d.suppliers : EMPTY;
  if (!list.length || !x) return def;
  let s = x.supplierId ? list.find(y => y.id === x.supplierId) : null;
  if (!s && x.supplier) { const k = norm(x.supplier).trim(); s = list.find(y => norm(y.name).trim() === k); }
  // ordini pianificati e lotti senza fornitore riconosciuto: il primo fornitore qualificato per quella materia prima
  if (!s && x.ingId) s = list.find(y => Array.isArray(y.ingIds) && y.ingIds.includes(x.ingId) && y.approval !== 'sospeso');
  if (!s) return def;
  const t = s.terms || s.paymentTerms || {};
  const days = has(t.days) ? +t.days : has(s.paymentDays) ? +s.paymentDays : def.days;
  const eom = t.endOfMonth ?? s.endOfMonth;
  return { days, endOfMonth: eom == null ? def.endOfMonth : eom !== false, source: 'fornitore' };
}

/* ---------- fatture ---------- */
// consegne coperte da fatture registrate: id della consegna (ddts) o cliente|mese → data della prima fattura che le copre
const covers = d => cached('covers', [d.invoices], () => {
  const ddt = new Map(), cm = new Map();
  const put = (m, k, dt) => { if (!m.has(k) || dt < m.get(k)) m.set(k, dt); };
  for (const inv of d.invoices || EMPTY) {
    const dt = inv.date || '0000-00-00'; // senza data: copre sempre
    if (Array.isArray(inv.ddts) && inv.ddts.length) for (const s of inv.ddts) put(ddt, s, dt);
    else if (inv.customerId && (inv.month || inv.date)) put(cm, inv.customerId + '|' + String(inv.month || inv.date).slice(0, 7), dt);
  }
  return { ddt, cm };
});
/** Consegna già fatturata alla data asOf: c'è una fattura che la copre datata entro asOf (a una data passata la fattura di fine mese non esiste ancora). */
const isCovered = (C, s, asOf) => {
  const a = C.ddt.get(s.id), b = C.cm.get(s.customerId + '|' + String(s.date).slice(0, 7));
  const dt = a == null ? b : b == null ? a : a < b ? a : b;
  return dt != null && dt <= asOf;
};

/**
 * Fatture stimate dalle consegne: una fattura differita per cliente × mese, datata a fine mese (solo i mesi già chiusi alla data),
 * imponibile = Σ t × prezzo, IVA = imponibile × vatPct, scadenza dai termini del cliente.
 * Una fattura stimata già scaduta alla data si considera incassata alla scadenza finché non si importano fatture e incassi.
 * opts.months limita ai mesi indicati; opts.covered esclude le consegne già coperte da fatture vere.
 */
export function invoicesFromShipments(d, { months, today = todayOf(d), covered = null } = {}) {
  const vat = vatOf(d), cust = byId(d.customers || EMPTY), only = months ? new Set(months) : null;
  const groups = new Map();
  for (const s of d.shipments || EMPTY) {
    if (!s?.date || !s.customerId || s.date > today) continue;
    const m = s.date.slice(0, 7);
    if (only && !only.has(m)) continue;
    if (endOfMonth(m) > today) continue; // mese in corso: da fatturare
    if (covered && isCovered(covered, s, today)) continue;
    const k = s.customerId + '|' + m;
    let g = groups.get(k); if (!g) groups.set(k, g = { customerId: s.customerId, month: m, ddts: [], taxable: 0 });
    g.ddts.push(s.id); g.taxable += n0(s.tonnes) * n0(s.price);
  }
  const out = [];
  for (const g of groups.values()) {
    const c = cust[g.customerId], t = customerTerms(c, d.settings), date = endOfMonth(g.month);
    const taxable = r2(g.taxable), iva = r2(taxable * vat / 100), total = r2(taxable + iva);
    const dueDate = dueDateFor(date, t), paid = dueDate < today;
    out.push({ id: `est-${g.customerId}-${g.month}`, number: null, customerId: g.customerId, month: g.month, date, ddts: g.ddts, taxable, vat: iva, total, dueDate,
      method: t.method, status: paid ? 'pagata' : 'aperta', paidAt: paid ? dueDate : null, paidAmount: paid ? total : 0, source: 'stimata', estimated: true, assumedPaid: paid });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.customerId < b.customerId ? -1 : 1));
  return out;
}

/**
 * Fattura registrata con i campi che il partitario usa: se mancano (fatture importate incomplete) la scadenza si calcola
 * dai termini del cliente e il totale da imponibile + IVA. Le fatture complete restano lo stesso oggetto.
 */
function normInvoice(inv, cust, d, vat) {
  const noDue = !inv.dueDate && !!inv.date, noTot = !has(inv.total) && has(inv.taxable);
  if (!noDue && !noTot) return inv;
  const out = { ...inv };
  if (noDue) out.dueDate = dueDateFor(inv.date, customerTerms(cust[inv.customerId], d.settings));
  if (noTot) out.total = r2(+inv.taxable + (has(inv.vat) ? +inv.vat : +inv.taxable * vat / 100));
  return out;
}

/** Fatture alla data: quelle registrate (d.invoices) più quelle stimate per le consegne che nessuna fattura copre ancora. */
export function invoicesOf(d, today = todayOf(d)) {
  return cached('inv|' + today, [d.invoices, d.shipments, d.customers, d.settings?.finance], () => {
    const cust = byId(d.customers || EMPTY), vat = vatOf(d);
    const real = (d.invoices || EMPTY).map(inv => normInvoice(inv, cust, d, vat));
    const est = invoicesFromShipments(d, { today, covered: real.length ? covers(d) : null });
    return real.length ? [...real, ...est] : est;
  });
}

const paysBy = d => cached('pays', [d.payments], () => {
  const m = new Map();
  for (const p of d.payments || EMPTY) { if (!p?.invoiceId) continue; let a = m.get(p.invoiceId); if (!a) m.set(p.invoiceId, a = []); a.push(p); }
  return m;
});
/** Incassato su una fattura fino alla data: incassi registrati; senza incassi, stato e importo pagato della fattura. */
function paidOn(inv, pays, asOf) {
  if (inv.estimated) return inv.dueDate < asOf ? n0(inv.total) : 0;
  if (pays?.length) { let s = 0; for (const p of pays) if (!p.date || p.date <= asOf) s += n0(p.amount); return s; }
  if (inv.paidAt && inv.paidAt > asOf) return 0;
  if (inv.status === 'pagata') return n0(inv.total);
  return n0(inv.paidAmount);
}
/** Totale incassato su una fattura (tutti gli incassi registrati, a qualunque data). */
export function paidSoFar(d, inv) {
  const pays = paysBy(d).get(inv.id);
  if (pays?.length) return sum(pays, p => p.amount);
  return inv.estimated ? 0 : inv.status === 'pagata' ? n0(inv.total) : n0(inv.paidAmount);
}

/**
 * Partitario alla data (memorizzato): fatture, partite aperte con residuo e giorni di scaduto, ritardi medi per cliente
 * (incassi degli ultimi 12 e 3 mesi, ponderati per importo), insoluti, consegne da fatturare.
 */
export function ledger(d, today = todayOf(d)) {
  return cached('ledger|' + today, [d.invoices, d.payments, d.shipments, d.customers, d.settings?.finance], () => {
    const vat = vatOf(d), P = paysBy(d), invs = invoicesOf(d, today);
    const byCust = {};
    const C = id => (byCust[id] ||= { open: 0, overdue: 0, overdue30: 0, overdue60: 0, nOpen: 0, oldestDue: null, items: [], w12: 0, a12: 0, w3: 0, a3: 0, nPaid12: 0, insoluta12: false, uninvTaxable: 0, uninvGross: 0, uninvN: 0, uninvMonths: [], lastPayment: null });
    const open = [];
    const tot = { open: 0, overdue: 0, overdue30: 0, overdue60: 0, nOpen: 0, estimatedOpen: 0, excluded: 0 };
    const from12 = addDays(today, -365), from3 = addDays(today, -90);
    let hasReal = false, hasEst = false;
    for (const inv of invs) {
      if (inv.estimated) hasEst = true; else hasReal = true;
      if (!inv.date || inv.date > today) continue;
      const c = C(inv.customerId);
      if (!inv.estimated && inv.status === 'insoluta' && (inv.dueDate || inv.date) > from12) c.insoluta12 = true;
      const pays = P.get(inv.id);
      const paid = paidOn(inv, pays, today);
      // ritardi: incassi delle fatture vere (o data di pagamento della fattura senza incassi registrati)
      if (!inv.estimated && inv.dueDate) {
        const ev = pays?.length ? pays.map(p => [p.date, n0(p.amount)]) : inv.paidAt ? [[inv.paidAt, n0(inv.paidAmount) || n0(inv.total)]] : [];
        for (const [dt, amt] of ev) {
          if (!dt || dt > today || dt <= from12) continue;
          const dl = daysBetween(inv.dueDate, dt), w = Math.abs(amt);
          c.a12 += w * dl; c.w12 += w; c.nPaid12++;
          if (dt > from3) { c.a3 += w * dl; c.w3 += w; }
          if (!c.lastPayment || dt > c.lastPayment) c.lastPayment = dt;
        }
      }
      const residual = r2(n0(inv.total) - paid);
      if (Math.abs(residual) < 0.005) continue;
      const daysOverdue = inv.dueDate && inv.dueDate < today ? daysBetween(inv.dueDate, today) : 0;
      const item = { ...inv, paid: r2(paid), residual, daysOverdue, daysToDue: inv.dueDate ? daysBetween(today, inv.dueDate) : null };
      open.push(item); c.items.push(item);
      c.open += residual; c.nOpen++; tot.open += residual; tot.nOpen++;
      if (inv.estimated) tot.estimatedOpen += residual;
      if (daysOverdue > 0) { c.overdue += residual; tot.overdue += residual; }
      if (daysOverdue > 30) { c.overdue30 += residual; tot.overdue30 += residual; }
      if (daysOverdue > 60) { c.overdue60 += residual; tot.overdue60 += residual; }
      if (inv.dueDate && (!c.oldestDue || inv.dueDate < c.oldestDue)) c.oldestDue = inv.dueDate;
    }
    // consegne non ancora fatturate (mese in corso, o non coperte da fatture vere)
    const cov = (d.invoices || EMPTY).length ? covers(d) : null;
    const uninv = { taxable: 0, gross: 0, n: 0, list: [] };
    const um = new Map();
    for (const s of d.shipments || EMPTY) {
      if (!s?.date || s.date > today || endOfMonth(s.date) <= today) continue;
      if (cov && isCovered(cov, s, today)) continue;
      const v = n0(s.tonnes) * n0(s.price);
      const c = C(s.customerId);
      c.uninvTaxable += v; c.uninvGross += v * (1 + vat / 100); c.uninvN++;
      uninv.taxable += v; uninv.gross += v * (1 + vat / 100); uninv.n++;
      const k = s.customerId + '|' + s.date.slice(0, 7);
      let g = um.get(k); if (!g) um.set(k, g = { customerId: s.customerId, month: s.date.slice(0, 7), taxable: 0, gross: 0, n: 0, last: s.date });
      g.taxable += v; g.gross += v * (1 + vat / 100); g.n++; if (s.date > g.last) g.last = s.date;
    }
    uninv.list = [...um.values()];
    for (const c of Object.values(byCust)) {
      c.delay12 = c.w12 > 0 ? c.a12 / c.w12 : 0;
      c.delay3 = c.w3 > 0 ? c.a3 / c.w3 : null;
      c.items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
      for (const g of uninv.list) if (byCust[g.customerId] === c) c.uninvMonths.push(g.month);
    }
    open.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    return { today, vat, invoices: invs, open, byCust, totals: tot, uninvoiced: uninv, hasReal, hasEstimated: hasEst, estimatedOnly: !hasReal };
  });
}

/** Partite aperte alla data: [{...fattura, paid, residual = totale − incassi fino alla data, daysOverdue, daysToDue}]. */
export function openItems(d, today = todayOf(d)) { return ledger(d, today).open; }

/** Ritardo medio d'incasso del cliente (giorni dopo la scadenza, ponderato per importo) sugli incassi degli ultimi 12 mesi; 0 senza incassi. */
export function avgDelay(d, custId, today = todayOf(d)) { return ledger(d, today).byCust[custId]?.delay12 ?? 0; }

/**
 * Vendite lorde (consegnato × (1 + IVA)) per mese, dal mese in corso indietro: [{month, gross, days}] (il mese in corso conta
 * i giorni fino a oggi). Senza consegne (solo fatture importate) si usano i totali delle fatture per mese di emissione.
 */
export function monthlyGross(d, today = todayOf(d), n = 24) {
  return cached('mg|' + today + '|' + n, [d.shipments, d.invoices, d.settings?.finance], () => {
    const vat = vatOf(d), m0 = today.slice(0, 7), by = {};
    let any = false;
    for (const s of d.shipments || EMPTY) if (s?.date && s.date <= today) { any = true; const m = s.date.slice(0, 7); by[m] = (by[m] || 0) + n0(s.tonnes) * n0(s.price) * (1 + vat / 100); }
    if (!any) for (const inv of invoicesOf(d, today)) if (inv.date && inv.date <= today) { const m = inv.date.slice(0, 7); by[m] = (by[m] || 0) + n0(inv.total); }
    return Array.from({ length: n }, (_, i) => { const m = addMonths(m0, -i); return { month: m, gross: by[m] || 0, days: i === 0 ? +today.slice(8, 10) : daysInMonth(m) }; });
  });
}

/**
 * DSO con il metodo a ritroso (count-back): si consumano i crediti aperti con le vendite lorde dei mesi più recenti,
 * dal mese in corso indietro, sommando i giorni dei mesi consumati per intero e la quota del mese in cui si esauriscono.
 * monthlyGross: numeri o {month, gross}, dal più recente. Se i crediti superano tutta la serie si restituisce la somma dei giorni (minimo).
 */
export function dsoCountBack(openTotal, monthlyGross, today) {
  let rest = n0(openTotal);
  if (rest <= 0 || !monthlyGross?.length) return rest <= 0 ? 0 : null;
  const m0 = String(today).slice(0, 7);
  let dso = 0;
  for (let i = 0; i < monthlyGross.length; i++) {
    const x = monthlyGross[i], g = typeof x === 'number' ? x : n0(x?.gross);
    const m = (typeof x === 'object' && x?.month) || addMonths(m0, -i);
    const days = m === m0 ? +String(today).slice(8, 10) : daysInMonth(m);
    if (g <= 0) { dso += days; continue; }
    if (rest > g) { dso += days; rest -= g; } else return dso + days * rest / g;
  }
  return dso;
}

/**
 * DSO contrattuale del periodo: Σ ricavi × giorni di pagamento concordati / Σ ricavi (senza il ritardo dell'emissione a fine mese).
 * Ricavi dalle consegne; senza consegne nel periodo, dagli imponibili delle fatture registrate.
 */
export function dsoContract(d, P) {
  const cust = byId(d.customers || EMPTY);
  let w = 0, a = 0;
  for (const s of d.shipments || EMPTY) {
    if (!s?.date || s.date < P.from || s.date > P.to) continue;
    const v = n0(s.tonnes) * n0(s.price);
    w += v; a += v * customerTerms(cust[s.customerId], d.settings).days;
  }
  if (!(w > 0)) for (const inv of d.invoices || EMPTY) {
    if (!inv?.date || inv.date < P.from || inv.date > P.to) continue;
    const v = has(inv.taxable) ? +inv.taxable : n0(inv.total);
    w += v; a += v * customerTerms(cust[inv.customerId], d.settings).days;
  }
  return w > 0 ? a / w : null;
}

/* ---------- debiti verso fornitori ---------- */
const OPEN_PO = new Set(['confermato', 'emesso', 'inviato']);
/**
 * Debiti verso fornitori (stimati, lordi d'IVA): lotti MP ricevuti negli ultimi 180 giorni (i respinti non si pagano) con
 * scadenza dai termini del fornitore, più gli ordini confermati alla consegna + termini. paid = scadenza già passata.
 * → [{kind: 'lotto'|'ordine', supplier, ref, ingId, date, amount, dueDate, paid, source: 'stimato'}]
 */
export function payables(d, today = todayOf(d)) {
  return cached('ap|' + today, [d.ingLots, d.purchases, d.suppliers, d.settings?.finance], () => {
    const pv = purchaseVatOf(d), from = addDays(today, -180), out = [];
    for (const l of d.ingLots || EMPTY) {
      if (l.status === 'bloccato' || !l.date || l.date < from || l.date > today) continue;
      const t = supplierTerms(d, l), dueDate = dueDateFor(l.date, t);
      out.push({ kind: 'lotto', supplier: l.supplier || '—', ref: l.code || l.id, id: l.id, ingId: l.ingId, date: l.date, tonnes: n0(l.tonnes), amount: n0(l.tonnes) * n0(l.price) * (1 + pv / 100), dueDate, paid: dueDate < today, terms: t, source: 'stimato' });
    }
    for (const p of d.purchases || EMPTY) {
      if (!OPEN_PO.has(p.status)) continue;
      const delivery = p.deliveryDate && p.deliveryDate > today ? p.deliveryDate : today;
      const t = supplierTerms(d, p), dueDate = dueDateFor(delivery, t);
      out.push({ kind: 'ordine', supplier: p.supplier || '—', ref: p.code || p.id, id: p.id, ingId: p.ingId, date: delivery, tonnes: n0(p.tonnes), amount: n0(p.tonnes) * n0(p.price) * (1 + pv / 100), dueDate, paid: false, terms: t, source: 'stimato' });
    }
    out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    return out;
  });
}
/** Acquisti di materie prime dei 365 giorni alla data, lordi d'IVA (base del DPO), e i giorni con dati della finestra. → {sum, days} */
function purchases12(d, today) {
  const pv = purchaseVatOf(d), from = addDays(today, -365);
  let s = 0, first = null;
  for (const l of d.ingLots || EMPTY) {
    if (l.status === 'bloccato' || !l.date || l.date > today) continue;
    if (!first || l.date < first) first = l.date;
    if (l.date > from) s += n0(l.tonnes) * n0(l.price) * (1 + pv / 100);
  }
  return { sum: s, days: coveredDays(first, addDays(from, 1), today) };
}

/* ---------- capitale circolante ---------- */
/**
 * Capitale circolante gestionale alla data.
 * crediti = partite aperte + consegne da fatturare (lordi) · MP al FIFO (con quelle in quarantena) · PF al costo pieno ·
 * debiti = fatture fornitori stimate non ancora scadute. DSO a ritroso; DIO = (MP + PF) / (costo del venduto 12 mesi / giorni);
 * DPO = debiti / acquisti lordi 12 mesi × giorni; giorni = 365, o quelli con dati se l'archivio ha meno di un anno; ciclo di cassa = DSO + DIO − DPO; costo annuo = capitale × costo del denaro.
 */
export function workingCapital(d, ctx, today) {
  const T = today || ctx?.today || todayOf(d);
  const L = ledger(d, T);
  const mpV = valuationAt(d, T, 'fifo', { today: ctx?.today || todayOf(d) });
  const fgV = finishedAt(d, ctx, T);
  const mp = mpV.value + mpV.quarantine, fg = fgV.valueFull;
  const ap = sum(payables(d, T).filter(x => x.kind === 'lotto' && !x.paid), x => x.amount);
  const arInvoiced = L.totals.open, arUninvoiced = L.uninvoiced.gross, ar = arInvoiced + arUninvoiced;
  const dso = dsoCountBack(arInvoiced, monthlyGross(d, T), T);
  // medie giornaliere sui giorni con dati della finestra di 12 mesi (365 con un anno di storico)
  const cb = costBase12(d, ctx, T), c12 = cb.cogs, pb = purchases12(d, T), p12 = pb.sum;
  const dio = c12 > 0 ? (mp + fg) / (c12 / cb.days) : null;
  const dpo = p12 > 0 ? ap / p12 * pb.days : null;
  const nwc = ar + mp + fg - ap, rate = rateOf(d);
  const mg = monthlyGross(d, T, 13).slice(1); // 12 mesi chiusi
  const gross12 = sum(mg, m => m.gross);
  const firstSale = mg.reduce((k, m, i) => (m.gross > 0 ? i : k), -1); // il mese chiuso più vecchio con vendite
  const gDays = firstSale >= 0 ? sum(mg.slice(0, firstSale + 1), m => m.days) : 365;
  return {
    today: T, ar, arInvoiced, arUninvoiced, mp, mpQuarantine: mpV.quarantine, fg, fgVar: fgV.valueVar, ap, nwc,
    dso, dio, dpo, ccc: dso != null && dio != null && dpo != null ? dso + dio - dpo : null,
    costPerYear: nwc * rate / 100, rate, cogs12: c12, purchases12: p12, gross12, days: { dio: cb.days, dpo: pb.days, dso: gDays },
    // quanto vale un giorno di ciascun indice (leve)
    perDay: { dso: gross12 / gDays, dio: c12 / cb.days, dpo: p12 / pb.days },
    estimated: L.hasEstimated,
  };
}

/** Capitale circolante a fine mese degli n mesi fino a `to` (di base oggi; l'ultimo mese alla data): [{month, date, ar, mp, fg, ap, nwc}]. */
export function workingCapitalHistory(d, ctx, months = 12, to = null) {
  const today = ctx?.today || todayOf(d), end = to && to < today ? to : today;
  return monthsIn(addMonths(end.slice(0, 7), -(months - 1)), end.slice(0, 7)).map(m => {
    const date = endOfMonth(m) < end ? endOfMonth(m) : end;
    const L = ledger(d, date);
    const mpV = valuationAt(d, date, 'fifo', { today });
    const fg = finishedAt(d, ctx, date).valueFull;
    const ap = sum(payables(d, date).filter(x => x.kind === 'lotto' && !x.paid), x => x.amount);
    const ar = L.totals.open + L.uninvoiced.gross, mp = mpV.value + mpV.quarantine;
    return { month: m, date, ar, mp, fg, ap, nwc: ar + mp + fg - ap };
  });
}

/* ---------- cassa a 13 settimane ---------- */
export const CASH_IN = [
  { id: 'incassi', label: 'Incassi da clienti', hint: 'Partite aperte alla scadenza più il ritardo medio del cliente; consegne del mese fatturate a fine mese. Insoluti e contestati esclusi.' },
  { id: 'previsti', label: 'Incassi dal piano', hint: 'Tonnellate del piano × prezzo netto degli ultimi 90 giorni × (1 + IVA), fatturate a fine mese e incassate con i termini dei clienti che comprano quel prodotto.' },
];
export const CASH_OUT = [
  { id: 'fornitori', label: 'Fornitori materie prime', hint: 'Lotti ricevuti negli ultimi 180 giorni non ancora scaduti: t × prezzo × (1 + IVA acquisti) alla scadenza dei termini del fornitore.' },
  { id: 'ordini', label: 'Ordini confermati', hint: 'Ordini d’acquisto aperti: consegna + termini del fornitore.' },
  { id: 'pianificati', label: 'Ordini pianificati (fabbisogni)', hint: 'Ordini proposti dai fabbisogni: data utile + tempo di consegna + termini del fornitore, ai prezzi di oggi.' },
  { id: 'personale', label: 'Stipendi', hint: 'Costo del personale di stabilimento (budget del mese, altrimenti consuntivo dello stesso mese dell’anno prima) al netto della quota F24, il 27 del mese.' },
  { id: 'f24', label: 'F24 ritenute e contributi', hint: 'Quota F24 (di base 30%) del costo del personale del mese precedente, il 16.' },
  { id: 'energia', label: 'Energia', hint: 'Bolletta del mese (kWh dalla rete × prezzo + GPL × prezzo, IVA 22%) pagata 30 giorni dopo la fine del mese; i mesi futuri come l’ultimo mese chiuso.' },
  { id: 'provvigioni', label: 'Provvigioni agenti', hint: 'Provvigioni maturate nel trimestre precedente, pagate a fine del mese successivo al trimestre.' },
  { id: 'rate', label: 'Rate dei finanziamenti', hint: 'Rate mensili dei finanziamenti indicati qui sotto, al giorno stabilito.' },
  { id: 'iva', label: 'Liquidazione IVA', hint: 'Solo se attivata nei parametri: IVA delle fatture emesse − IVA degli acquisti di materie prime ed energia del mese, il 16 del mese dopo (credito riportato).' },
  { id: 'altri', label: 'Altri costi operativi', hint: 'Centri di costo monetari diversi dal personale (budget o consuntivo del mese) più logistica, imballi e trasformazione variabile al ritmo degli ultimi 90 giorni, pagati a fine mese.' },
];

const isPersonnel = c => c.id === 'cc-pers' || /personale/i.test(c.name || '') || c.driver === 'ore';

/** Costo mensile di un gruppo di centri: budget del mese, consuntivo del mese, stesso mese dell'anno prima × crescita, media degli ultimi 12 mesi. */
function monthlyCostFn(d) {
  const by = {}; // kind|month → {centerId: amount}
  for (const r of d.fixedCosts || EMPTY) { const m = String(r.month || '').slice(0, 7); if (!m) continue; const k = (r.kind || 'consuntivo') + '|' + m; (by[k] ||= {})[r.centerId] = ((by[k] ||= {})[r.centerId] || 0) + n0(r.amount); }
  const consMonths = Object.keys(by).filter(k => k.startsWith('consuntivo|')).map(k => k.slice(11)).sort();
  const tot = (k, ids) => { const o = by[k]; if (!o) return null; let s = 0, any = false; for (const id of ids) if (id in o) { s += o[id]; any = true; } return any ? s : null; };
  const last12 = consMonths.slice(-12), prev12 = consMonths.slice(-24, -12);
  return ids => {
    const s12 = sum(last12, m => tot('consuntivo|' + m, ids) || 0), sp = sum(prev12, m => tot('consuntivo|' + m, ids) || 0);
    const growth = prev12.length === 12 && sp > 0 ? s12 / sp : 1;
    const mean12 = last12.length ? s12 / last12.length : 0;
    return m => {
      const b = tot('budget|' + m, ids); if (b != null) return { amount: b, source: 'budget' };
      const c = tot('consuntivo|' + m, ids); if (c != null) return { amount: c, source: 'consuntivo' };
      const y = tot('consuntivo|' + addMonths(m, -12), ids); if (y != null) return { amount: y * growth, source: 'anno prima' };
      return { amount: mean12, source: 'media' };
    };
  };
}

/**
 * Previsione di cassa settimanale (stimata). Settimana 0 = dal giorno del saldo alla domenica; poi settimane lun–dom.
 * Invarianti: chiusura = apertura + Σ entrate − Σ uscite; apertura della settimana successiva = chiusura; apertura 0 = saldo impostato.
 * margine (headroom) = chiusura + linee di credito. → {start, end, opening, lines, weeks, lowPoint, items, excluded, beyond, assumptions}
 */
export function cashForecast(d, ctx, { weeks = 13, today } = {}) {
  const T = today || ctx?.today || todayOf(d);
  const M = ctx?.mrp || null;
  return cached('cf|' + T + '|' + weeks, [d.invoices, d.payments, d.shipments, d.customers, d.settings, d.plan, d.purchases, d.ingLots, d.fixedCosts, d.costCenters, d.energy, d.ingredients, d.products, d.suppliers, d.agents, d.formulas, d.runs, M, ctx?.facts], () =>
    buildForecast(d, ctx, T, weeks));
}

function buildForecast(d, ctx, T, nW) {
  const f = finOf(d), vat = vatOf(d), pv = purchaseVatOf(d);
  const start = f.cash?.date || T, opening = n0(f.cash?.balance);
  const lines = sum(f.creditLines || EMPTY, l => n0(l.limit));
  const m0 = mondayOf(start);
  const W = Array.from({ length: Math.max(1, nW) }, (_, k) => ({ week: k, from: k ? addDays(m0, 7 * k) : start, to: addDays(m0, 7 * k + 6) }));
  const end = W[W.length - 1].to;
  const cust = byId(d.customers || EMPTY), prod = byId(d.products || EMPTY), ing = byId(d.ingredients || EMPTY);
  const items = [], beyond = {};
  const add = (cat, date, amount, label, extra) => {
    if (!date || !Number.isFinite(amount) || Math.abs(amount) < 0.005) return;
    if (date > end) { beyond[cat] = (beyond[cat] || 0) + amount; return; }
    if (date < start) return; // già avvenuto: è nel saldo iniziale
    const week = date <= W[0].to ? 0 : Math.floor(daysBetween(m0, date) / 7);
    items.push({ cat, date, amount, label, week, ...extra });
  };
  const assumptions = [];

  // --- entrate: partite aperte e consegne da fatturare
  const L = ledger(d, start);
  const excluded = { insolute: 0, contestate: 0, n: 0 };
  for (const it of L.open) {
    if (it.status === 'insoluta' || it.status === 'contestata') { excluded[it.status === 'insoluta' ? 'insolute' : 'contestate'] += it.residual; excluded.n++; continue; }
    const delay = Math.round(L.byCust[it.customerId]?.delay12 || 0);
    let exp = addDays(it.dueDate || it.date, delay), late = false;
    if (exp < start) { exp = addDays(start, OVERDUE_LAG); late = true; }
    add('incassi', exp, it.residual, cust[it.customerId]?.name || it.customerId, { ref: it.number || 'fattura stimata', customerId: it.customerId, kind: late ? 'scaduto' : 'fattura' });
  }
  for (const g of L.uninvoiced.list) {
    const c = cust[g.customerId], t = customerTerms(c, d.settings);
    const exp = addDays(dueDateFor(endOfMonth(g.month), t), Math.round(L.byCust[g.customerId]?.delay12 || 0));
    add('incassi', exp, g.gross, c?.name || g.customerId, { ref: 'da fatturare', customerId: g.customerId, kind: 'da fatturare' });
  }

  // --- entrate dal piano: prezzo netto a 90 giorni e termini dei clienti di ogni prodotto
  const from90 = addDays(T, -90), wkT = mondayOf(T);
  const pp = {}, mixAll = new Map();
  const shippedWeek = {};
  for (const s of d.shipments || EMPTY) {
    if (!s?.date || s.date > T) continue;
    if (s.date >= wkT) shippedWeek[s.productId] = (shippedWeek[s.productId] || 0) + n0(s.tonnes);
    if (s.date <= from90) continue;
    const v = n0(s.tonnes) * n0(s.price), p = (pp[s.productId] ||= { t: 0, rev: 0, mix: new Map() });
    p.t += n0(s.tonnes); p.rev += v;
    const t = customerTerms(cust[s.customerId], d.settings), dl = Math.round((L.byCust[s.customerId]?.delay12 || 0) / 5) * 5;
    const k = t.days + '|' + t.endOfMonth + '|' + dl;
    for (const mm of [p.mix, mixAll]) { const e = mm.get(k) || { days: t.days, endOfMonth: t.endOfMonth, delay: dl, v: 0 }; e.v += v; mm.set(k, e); }
  }
  const shares = mm => { const tot = sum([...mm.values()], e => e.v); return tot > 0 ? [...mm.values()].map(e => ({ ...e, share: e.v / tot })) : [{ days: 60, endOfMonth: true, delay: 0, share: 1 }]; };
  const mixDefault = shares(mixAll);
  for (const pl of d.plan || EMPTY) {
    if (!pl?.week || pl.week < mondayOf(start) || pl.week > end) continue;
    const p = prod[pl.productId]; if (!p) continue;
    let t = n0(pl.tonnes);
    if (pl.week === wkT) t = Math.max(0, t - (shippedWeek[pl.productId] || 0));
    if (t <= 0) continue;
    let delivery = addDays(pl.week, 2);
    if (delivery < T) delivery = T;
    if (delivery < start) delivery = start;
    const st = pp[pl.productId];
    const price = st?.t > 0 ? st.rev / st.t : n0(p.listPrice);
    const amount = t * price * (1 + vat / 100), invDate = endOfMonth(delivery);
    for (const m of st ? shares(st.mix) : mixDefault) add('previsti', addDays(dueDateFor(invDate, m), m.delay), amount * m.share, p.name, { ref: `${Math.round(t)} t · sett. ${pl.week.slice(8, 10)}/${pl.week.slice(5, 7)}`, productId: p.id, kind: 'piano' });
  }

  // --- uscite: fornitori e ordini
  for (const x of payables(d, start)) {
    if (x.paid) continue;
    add(x.kind === 'ordine' ? 'ordini' : 'fornitori', x.dueDate, x.amount, x.supplier, { ref: x.ref, ingId: x.ingId, kind: x.kind });
  }
  // ordini pianificati dai fabbisogni
  const mrp = ctx?.mrp || requirements({ today: T, weeks: 8, plan: d.plan || EMPTY, products: d.products || EMPTY, formulas: d.formulas || EMPTY, ingredients: d.ingredients || EMPTY,
    purchases: d.purchases || EMPTY, runs: d.runs || EMPTY, ingLots: d.ingLots || EMPTY, suppliers: d.suppliers || EMPTY, settings: d.settings || {} });
  for (const r of mrp?.rows || EMPTY) {
    const i = ing[r.ingId]; if (!i) continue;
    for (const p of r.planned || EMPTY) {
      const arrival = addDays(p.orderBy, n0(p.lead ?? r.lead ?? i.leadDays));
      const due = dueDateFor(arrival, supplierTerms(d, { ingId: i.id, supplier: i.supplier, supplierId: i.supplierId }));
      add('pianificati', due, n0(p.qty) * n0(i.price) * (1 + pv / 100), i.name, { ref: `${p.qty} t entro il ${p.orderBy.slice(8, 10)}/${p.orderBy.slice(5, 7)}`, ingId: i.id, kind: 'pianificato' });
    }
  }

  // --- personale, F24, altri costi fissi (centri di costo)
  const centres = d.costCenters || EMPTY;
  let pers = centres.filter(isPersonnel).map(c => c.id);
  if (!pers.length && (d.fixedCosts || EMPTY).some(r => r.centerId === 'cc-pers')) pers = ['cc-pers'];
  const others = centres.filter(c => c.cash !== false && !pers.includes(c.id)).map(c => c.id);
  const mc = monthlyCostFn(d), persOf = mc(pers), othOf = mc(others);
  const f24 = has(f.payrollF24Pct) ? +f.payrollF24Pct / 100 : 0.3;
  const months = monthsIn(addMonths(start.slice(0, 7), -2), end.slice(0, 7));
  const dayIn = (m, dd) => `${m}-${String(Math.min(dd, daysInMonth(m))).padStart(2, '0')}`;
  for (const m of months) {
    if (pers.length) {
      const c = persOf(m); add('personale', dayIn(m, 27), c.amount * (1 - f24), 'Stipendi netti di ' + m, { ref: c.source, kind: 'stipendi' });
      const pc = persOf(addMonths(m, -1)); add('f24', dayIn(m, 16), pc.amount * f24, 'F24 su stipendi di ' + addMonths(m, -1), { ref: pc.source, kind: 'f24' });
    }
    if (others.length) { const c = othOf(m); add('altri', endOfMonth(m), c.amount, 'Costi fissi monetari di ' + m, { ref: c.source, kind: 'fissi' }); }
  }
  // variabili a terzi (logistica, imballi, trasformazione variabile) al ritmo degli ultimi 90 giorni
  const facts = ctx?.facts || EMPTY;
  let var90 = 0, comm = {};
  if (facts.length) {
    for (const x of facts) {
      if (x.date > from90 && x.date <= T) var90 += x.logistics + x.pack + x.varConv;
      const q = quarterOf(x.date); comm[q] = (comm[q] || 0) + x.commission;
    }
  } else {
    const ag = byId(d.agents || EMPTY);
    for (const s of d.shipments || EMPTY) {
      if (!s?.date || s.date > T) continue;
      const p = prod[s.productId], v = n0(s.tonnes) * n0(s.price);
      if (s.date > from90) var90 += n0(s.tonnes) * (n0(p?.logisticsCost) + n0(p?.packCost) + n0(p?.varProcessCost ?? p?.processCost));
      const a = ag[s.agentId || cust[s.customerId]?.agentId]; const q = quarterOf(s.date); comm[q] = (comm[q] || 0) + v * n0(a?.commissionPct) / 100;
    }
  }
  for (const m of months) add('altri', endOfMonth(m), var90 / 3, 'Logistica, imballi e trasformazione variabile', { ref: 'ritmo ultimi 90 giorni', kind: 'variabili' });

  // --- energia: bolletta del mese pagata 30 giorni dopo la fine del mese
  const evat = has(f.energyVatPct) ? +f.energyVatPct : 22;
  const curM = T.slice(0, 7);
  const enBy = {};
  for (const e of d.energy || EMPTY) if (e?.month) { const pr = energyPriceAt(d.settings, e.month); enBy[e.month] = n0(e.kwhGrid) * pr.kwhPrice + n0(e.gplKg) * pr.gplPrice; }
  const closedEn = Object.keys(enBy).filter(m => m < curM).sort();
  let lastEn = closedEn.length ? enBy[closedEn[closedEn.length - 1]] : null;
  if (lastEn == null && facts.length) { const lm = addMonths(curM, -1); lastEn = sum(facts.filter(x => x.month === lm), x => x.energy); }
  for (const m of monthsIn(addMonths(start.slice(0, 7), -2), end.slice(0, 7))) {
    const cost = m < curM && enBy[m] != null ? enBy[m] : lastEn;
    if (cost) add('energia', addDays(endOfMonth(m), 30), cost * (1 + evat / 100), 'Energia di ' + m, { ref: m < curM && enBy[m] != null ? 'letture' : 'come l’ultimo mese', kind: 'energia' });
  }

  // --- provvigioni del trimestre precedente, a fine del mese successivo
  for (const m of monthsIn(addMonths(start.slice(0, 7), -1), end.slice(0, 7))) {
    if (![1, 4, 7, 10].includes(+m.slice(5, 7))) continue;
    const q = quarterOf(addMonths(m, -1));
    if (comm[q]) add('provvigioni', endOfMonth(m), comm[q], 'Provvigioni ' + q.replace('-Q', ' T'), { ref: 'maturate nel trimestre', kind: 'provvigioni' });
  }

  // --- rate dei finanziamenti
  for (const ln of f.loans || EMPTY) {
    const amt = n0(ln.instalment); if (!amt) continue;
    for (const m of monthsIn(start.slice(0, 7), end.slice(0, 7))) {
      const dt = dayIn(m, Math.max(1, Math.round(n0(ln.day) || 1)));
      if ((ln.until && dt > ln.until) || (ln.from && dt < ln.from)) continue;
      add('rate', dt, amt, ln.name || 'Finanziamento', { ref: 'rata mensile', kind: 'rata' });
    }
  }

  // --- liquidazione IVA (solo se attivata)
  if (f.vatSettlement) {
    const quarterly = f.vatSettlement === 'trimestrale';
    const outV = {}, inV = {};
    for (const inv of L.invoices) if (inv.date) outV[inv.date.slice(0, 7)] = (outV[inv.date.slice(0, 7)] || 0) + n0(inv.vat);
    for (const g of L.uninvoiced.list) outV[g.month] = (outV[g.month] || 0) + (g.gross - g.taxable);
    for (const pl of d.plan || EMPTY) {
      if (!pl?.week || pl.week > end) continue;
      const p = prod[pl.productId], st = pp[pl.productId]; if (!p) continue;
      const price = st?.t > 0 ? st.rev / st.t : n0(p.listPrice);
      const m = addDays(pl.week, 2).slice(0, 7);
      if (m >= curM) outV[m] = (outV[m] || 0) + n0(pl.tonnes) * price * vat / 100;
    }
    for (const l of d.ingLots || EMPTY) if (l.status !== 'bloccato' && l.date) inV[l.date.slice(0, 7)] = (inV[l.date.slice(0, 7)] || 0) + n0(l.tonnes) * n0(l.price) * pv / 100;
    for (const m of Object.keys(enBy)) inV[m] = (inV[m] || 0) + enBy[m] * evat / 100;
    let carry = 0;
    const span = monthsIn(addMonths(start.slice(0, 7), -3), end.slice(0, 7));
    let accOut = 0, accIn = 0;
    for (const m of span) {
      accOut += outV[m] || 0; accIn += inV[m] || 0;
      const mm = +m.slice(5, 7);
      if (quarterly && mm % 3 !== 0) continue;
      const due = quarterly ? (mm === 12 ? `${+m.slice(0, 4) + 1}-03-16` : dayIn(addMonths(m, 2), 16)) : dayIn(addMonths(m, 1), 16);
      const net = accOut - accIn + carry;
      accOut = 0; accIn = 0;
      if (net > 0) { carry = 0; add('iva', due, net, 'IVA di ' + m, { ref: quarterly ? 'trimestrale' : 'mensile', kind: 'iva' }); } else carry = net;
    }
  }

  // --- settimane
  const weeks = W.map(w => ({ ...w, in: Object.fromEntries(CASH_IN.map(c => [c.id, 0])), out: Object.fromEntries(CASH_OUT.map(c => [c.id, 0])) }));
  for (const x of items) {
    const w = weeks[x.week]; if (!w) continue;
    if (x.cat in w.in) w.in[x.cat] += x.amount; else w.out[x.cat] += x.amount;
  }
  let bal = opening;
  for (const w of weeks) {
    w.opening = bal;
    w.inTot = sum(Object.values(w.in)); w.outTot = sum(Object.values(w.out));
    w.net = w.inTot - w.outTot;
    w.closing = w.opening + w.net;
    w.headroom = w.closing + lines;
    bal = w.closing;
  }
  let low = weeks[0];
  for (const w of weeks) if (w.closing < low.closing) low = w;
  const firstBelow = weeks.find(w => w.closing < 0) || null, firstOver = weeks.find(w => w.closing < -lines) || null;
  assumptions.push(`Scaduti oltre il ritardo abituale del cliente: incasso atteso ${OVERDUE_LAG} giorni dopo l’inizio della previsione (dopo un sollecito).`);
  if (excluded.n) assumptions.push(`Esclusi ${excluded.n} insoluti o contestati per un totale lordo di ${Math.round(excluded.insolute + excluded.contestate).toLocaleString('it-IT')} €.`);
  if (!f.cash?.date) assumptions.push('Saldo di cassa non impostato: la previsione parte da zero a oggi.');
  return {
    start, end, today: T, opening, lines, weeks, items, excluded, beyond, assumptions, balanceSet: !!f.cash?.date,
    lowPoint: { week: low.week, from: low.from, to: low.to, closing: low.closing, headroom: low.headroom, belowZero: low.closing < 0, belowLines: low.closing < -lines },
    firstBelowZero: firstBelow ? firstBelow.week : null, firstOverLines: firstOver ? firstOver.week : null,
    totals: { in: sum(weeks, w => w.inTot), out: sum(weeks, w => w.outTot), closing: weeks[weeks.length - 1].closing },
  };
}

/** Punto più basso della cassa prevista {week, from, to, closing, headroom, belowZero, belowLines}; null se il saldo di cassa non è mai stato impostato. */
export function cashLowPoint(d, ctx) {
  if (!finOf(d).cash?.date) return null;
  return cashForecast(d, ctx).lowPoint;
}
