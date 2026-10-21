/* FeedOS 17 · Estensore del demo: fatture, incassi, condizioni di pagamento e fidi, cassa e linee di credito (pacchetto WP2).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Dati INVENTATI e deterministici (stesso seme → stessi dati): profili di pagamento scelti con R sugli id dei clienti ordinati.
 * I termini dei fornitori non si scrivono qui: cash.payables li legge a calcolo da d.suppliers (pacchetto Acquisti, letto
 * con ripiego: vuoto finché il pacchetto non c'è), altrimenti da settings.finance.defaultSupplierDays (60 gg d.f.f.m.). */
import { rng, addDays, addMonths, endOfMonth, daysBetween } from '../../core/util.js';
import { customerTerms, dueDateFor, ledger } from '../../engine/cash.js';

const r2 = v => Math.round(v * 100) / 100;
const pad = n => String(n).padStart(3, '0');

export function demoFinanza(d, { today, R } = {}) {
  if (!today || !d?.shipments?.length || !d?.customers?.length) return {};
  R = R || rng(16 + 301);
  const vat = d.settings?.finance?.vatPct ?? 10;

  // ---------- termini dei clienti (campo nuovo) ----------
  const custs = [...d.customers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const terms = {};
  for (const c of custs) {
    const t = customerTerms(c, d.settings);
    terms[c.id] = { days: c.paymentDays ?? t.days, endOfMonth: true, method: c.type === 'rivendita' ? 'bonifico' : 'riba' };
  }

  // ---------- profili di pagamento ----------
  const order = R.shuffle(custs.map(c => c.id));
  const N = order.length, k = x => Math.max(0, Math.min(x, N));
  const nIns = k(Math.round(N * 3 / 42)), nSlow = k(Math.round(N * 3 / 42)), nLate = k(Math.round(N * 8 / 42));
  const profile = {};
  order.forEach((id, i) => { profile[id] = i < nIns ? 'insoluto' : i < nIns + nSlow ? 'lento' : i < nIns + nSlow + nLate ? 'ritardo' : 'puntuale'; });
  // tra i clienti con un insoluto, il più piccolo (consegnato degli ultimi 6 mesi) paga anche il resto lentamente e sempre più tardi:
  // il caso tipico di classe D; gli altri, a parte l'insoluto, pagano puntuali
  const vol = {}, from6 = addDays(today, -182);
  for (const s of d.shipments) if (s.date > from6 && s.date <= today) vol[s.customerId] = (vol[s.customerId] || 0) + (+s.tonnes || 0) * (+s.price || 0);
  const insIds = order.slice(0, nIns).sort((a, b) => (vol[a] || 0) - (vol[b] || 0) || (a < b ? -1 : 1));
  const payStyle = id => (profile[id] === 'insoluto' ? (id === insIds[0] ? 'peggiora' : 'puntuale') : profile[id]);

  // ---------- fatture: una per cliente × mese chiuso con consegne ----------
  const groups = new Map();
  for (const s of d.shipments) {
    if (!s?.date || s.date > today) continue;
    const m = s.date.slice(0, 7);
    if (endOfMonth(m) > today) continue; // mese in corso: resta da fatturare
    const key = s.customerId + '|' + m;
    let g = groups.get(key); if (!g) groups.set(key, g = { customerId: s.customerId, month: m, ddts: [], taxable: 0 });
    g.ddts.push(s.id); g.taxable += (+s.tonnes || 0) * (+s.price || 0);
  }
  const code = Object.fromEntries(d.customers.map(c => [c.id, c.code || c.id]));
  const list = [...groups.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : code[a.customerId] < code[b.customerId] ? -1 : 1));
  const counters = {};
  const invoices = [], payments = [];
  // giugno dell'anno dell'ancora; con un'ancora prima di agosto, il giugno dell'anno prima (l'insoluto è sempre già maturato)
  const juneDue = `${+today.slice(0, 4) - (today.slice(5, 7) < '08' ? 1 : 0)}-06`;
  // la fattura insoluta di ogni cliente del profilo: la prima con scadenza da giugno in poi (quella di giugno se c'è)
  const insMonth = {};
  for (const g of list) if (profile[g.customerId] === 'insoluto' && !insMonth[g.customerId] && dueDateFor(endOfMonth(g.month), terms[g.customerId]).slice(0, 7) >= juneDue) insMonth[g.customerId] = g.month;
  let partialDone = false, nPay = 0;
  for (const g of list) {
    const yyyy = g.month.slice(0, 4), yy = yyyy.slice(2);
    counters[yyyy] = (counters[yyyy] || 0) + 1;
    const number = `FT-${yy}-${pad(counters[yyyy])}`;
    const t = terms[g.customerId];
    const date = endOfMonth(g.month), dueDate = dueDateFor(date, t);
    const taxable = r2(g.taxable), iva = r2(taxable * vat / 100), total = r2(taxable + iva);
    const inv = { id: `ft-${yy}-${pad(counters[yyyy])}`, number, customerId: g.customerId, month: g.month, date, ddts: g.ddts, taxable, vat: iva, total, dueDate,
      method: t.method, status: 'aperta', paidAt: null, paidAmount: 0, source: 'demo' };
    const style = payStyle(g.customerId);
    // un insoluto per i clienti del profilo: la fattura che scadeva a giugno (dell'anno dell'ancora)
    if (insMonth[g.customerId] === g.month && dueDate < today) {
      inv.status = 'insoluta'; inv.insolutoAt = addDays(dueDate, 4);
      inv.note = t.method === 'riba' ? 'Ri.Ba. insoluta: richiamata dalla banca' : 'Non pagata alla scadenza nonostante i solleciti';
      invoices.push(inv); continue;
    }
    let delay;
    const recent = daysBetween(dueDate, today) <= 150;
    if (style === 'puntuale') delay = R.int(-2, 4);
    else if (style === 'ritardo') delay = R.int(15, 45);
    else if (style === 'lento') delay = R.int(45, 90);
    else delay = R.int(45, 75) + (recent ? R.int(15, 30) : 0); // 'peggiora': lento e sempre più tardi
    const payDate = addDays(dueDate, delay);
    if (payDate <= today) {
      nPay++;
      payments.push({ id: `pag-${nPay}`, date: payDate, customerId: g.customerId, invoiceId: inv.id, amount: total, method: t.method, note: '' });
      inv.status = 'pagata'; inv.paidAt = payDate; inv.paidAmount = total;
    } else if (!partialDone && style === 'lento' && dueDate < today && addDays(dueDate, 30) <= today) {
      // un acconto su una fattura scaduta di un cliente lento: stato «parziale»
      const amt = r2(Math.round(total * 0.4 / 100) * 100);
      nPay++;
      const pd = addDays(dueDate, 30);
      payments.push({ id: `pag-${nPay}`, date: pd, customerId: g.customerId, invoiceId: inv.id, amount: amt, method: 'bonifico', note: 'Acconto concordato al telefono' });
      inv.status = 'parziale'; inv.paidAmount = amt; inv.lastPaymentAt = pd;
      partialDone = true;
    }
    invoices.push(inv);
  }
  // una fattura contestata collegata a un reclamo aperto (se c'è ed è ancora da incassare)
  const openCompl = (d.complaints || []).filter(x => x.status !== 'chiuso').sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const x of openCompl) {
    const inv = invoices.find(i => i.customerId === x.customerId && i.status === 'aperta' && i.dueDate >= today && i.month <= String(x.date).slice(0, 7));
    if (inv) { inv.status = 'contestata'; inv.note = `Contestata dal cliente: reclamo ${x.code}`; inv.complaintId = x.id; break; }
  }

  // ---------- fidi: 1,3 × esposizione mensile media (crediti aperti + consegne da fatturare), arrotondata a 5.000 € ----------
  // esposizione mensile = il massimo del mese (campioni ai giorni 7, 14, 21, a fine mese e 3 giorni dopo), media dei 6 mesi chiusi:
  // dentro il mese l'esposizione sale con le consegne da fatturare e scende con gli incassi di fine mese, e il fido deve
  // coprire il picco normale; la supera chi paga in ritardo o accumula consegne
  const d1 = { ...d, invoices, payments, customers: d.customers.map(c => ({ ...c, terms: terms[c.id] })) };
  const credit = L => Object.fromEntries(custs.map(c => [c.id, (L.byCust[c.id]?.open || 0) + (L.byCust[c.id]?.uninvGross || 0)]));
  const avg = {};
  for (let k = 1; k <= 6; k++) {
    const m = addMonths(today.slice(0, 7), -k), e = endOfMonth(m);
    const peak = {};
    for (const s of [`${m}-07`, `${m}-14`, `${m}-21`, e, addDays(e, 3)]) {
      if (s >= today) continue;
      const x = credit(ledger(d1, s));
      for (const c of custs) peak[c.id] = Math.max(peak[c.id] || 0, x[c.id]);
    }
    for (const c of custs) avg[c.id] = (avg[c.id] || 0) + (peak[c.id] || 0) / 6;
  }
  const now = credit(ledger(d1, today));
  // i 2 clienti con la crescita maggiore: fido a 0,85 × il credito di oggi, così lo superano anche senza le offerte da consegnare
  const growth = custs.map(c => ({ id: c.id, cur: now[c.id], avg: avg[c.id] || 0 }))
    .filter(x => x.avg > 20000 && x.cur > 20000).map(x => ({ ...x, g: x.cur / x.avg })).sort((a, b) => b.g - a.g || (a.id < b.id ? -1 : 1));
  const over = new Set(growth.slice(0, 2).map(x => x.id));
  const limit = {};
  for (const c of custs) {
    const a = avg[c.id] || 0;
    if (over.has(c.id)) limit[c.id] = Math.floor(0.85 * now[c.id] / 5000) * 5000;
    else if (a > 0) limit[c.id] = Math.max(5000, Math.round(1.3 * a / 5000) * 5000);
  }

  const counterSet = Object.fromEntries(Object.entries(counters).map(([y, n]) => [`FT-${y}`, n]));
  return {
    add: { invoices, payments },
    update: { customers: custs.map(c => ({ id: c.id, terms: terms[c.id], ...(limit[c.id] ? { creditLimit: limit[c.id] } : {}) })) },
    settings: {
      counters: counterSet,
      finance: {
        cash: { date: today, balance: 620000 },
        creditLines: [
          { id: 'cl-1', bank: 'Banca Alfa (fantasia)', type: 'fido di cassa', limit: 800000 },
          { id: 'cl-2', bank: 'Banca Beta (fantasia)', type: 'anticipo fatture', limit: 700000 },
        ],
        loans: [{ id: 'ln-1', name: 'Mutuo impianto pellet', instalment: 18500, day: 30 }],
      },
    },
  };
}
