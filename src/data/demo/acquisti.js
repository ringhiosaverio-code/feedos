/* FeedOS 17 · Estensore del demo: fornitori qualificati, ordini storici, quarantena e standard (pacchetto WP5).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Prezzi e analisi dei lotti non cambiano: i lotti delle materie prime principali si ripartiscono fra due o tre fornitori
 * secondo il premio già pagato sul mercato e l'aflatossina, così i punteggi dei fornitori risultano diversi. */
import { addDays, median, round, slug, byId } from '../../core/util.js';
import { parseCode } from '../../core/codes.js';

// fornitori inventati che si affiancano a quello esistente delle materie prime principali
const EXTRA = {
  mais: ['Agricola Tavoliere S.r.l. (fantasia)', 'Cereali del Sud S.r.l. (fantasia)'],
  soia44: ['Proteine Adriatiche S.r.l. (fantasia)'],
  sorgo: ['Cereali del Sud S.r.l. (fantasia)'],
  colza: ['Oleaginose Italia S.r.l. (fantasia)'],
  premix: ['Nutrimix S.r.l. (fantasia)'],
  farinaccio: ['Molini Riuniti S.r.l. (fantasia)'],
};
// dal più conveniente al più caro (premio sul mercato del lotto, o prezzo rispetto al mese, già presenti nei dati)
const LADDER = {
  mais: ['Agricola Tavoliere S.r.l. (fantasia)', 'Consorzio agrario (demo)', 'Cereali del Sud S.r.l. (fantasia)'],
  soia44: ['Proteine Adriatiche S.r.l. (fantasia)', 'Trader proteici (demo)'],
  sorgo: ['Cereali del Sud S.r.l. (fantasia)', 'Cooperativa cerealicola (demo)'],
  colza: ['Oleificio (demo)', 'Oleaginose Italia S.r.l. (fantasia)'],
  premix: ['Nutrimix S.r.l. (fantasia)', 'Additivi (demo)'],
  farinaccio: ['Molini Riuniti S.r.l. (fantasia)', 'Molino (demo)'],
};
const AFB1_SINK = 'Cereali del Sud S.r.l. (fantasia)'; // riceve i lotti con più aflatossina (e quello respinto): fornitore condizionato
// puntualità: quota di consegne in ritardo e di consegne corte
const PROFILE = {
  'Cereali del Sud S.r.l. (fantasia)': { late: 0.24, short: 0.08, lt: 3 },
  'Proteine Adriatiche S.r.l. (fantasia)': { late: 0.18, short: 0.05, lt: 3 },
  'Agricola Tavoliere S.r.l. (fantasia)': { late: 0.04, short: 0.02, lt: 1 },
  'Oleaginose Italia S.r.l. (fantasia)': { late: 0.06, short: 0.02, lt: 2 },
};
const CERTS = ['GMP+', 'FAMI-QS', 'ISO 22000'];

export function demoAcquisti(d, { today, R } = {}) {
  if (!today || !R || !(d.ingLots || []).length) return {};
  const ing = byId(d.ingredients || []);
  const quotes = {};
  for (const q of d.market || []) (quotes[q.commodity] ||= []).push(q);
  for (const list of Object.values(quotes)) list.sort((a, b) => (a.date < b.date ? -1 : 1));
  const quoteAt = (com, date) => { let p = null; for (const q of quotes[com] || []) { if (q.date > date) break; p = q.price; } return p; };

  // ---------- (a) anagrafica dei fornitori ----------
  const names = new Set((d.ingredients || []).map(i => i.supplier).filter(Boolean));
  for (const list of Object.values(EXTRA)) for (const n of list) names.add(n);
  const ingIdsOf = n => (d.ingredients || []).filter(i => i.supplier === n || (EXTRA[i.id] || []).includes(n)).map(i => i.id);
  let k = 0;
  const suppliers = [...names].sort().map(name => {
    const id = 'sup-' + slug(name.replace(/\((demo|fantasia)\)/, '')).slice(0, 24);
    const ids = ingIdsOf(name);
    const cat = ing[ids[0]]?.category;
    const certTypes = cat === 'premix' || cat === 'aminoacido' || cat === 'minerale' ? ['FAMI-QS', 'GMP+'] : ['GMP+', 'ISO 22000'];
    return {
      id, code: 'F' + String(++k).padStart(3, '0'), name, ingIds: ids,
      cert: certTypes.map(type => ({ type, expiry: addDays(today, R.int(120, 700)) })),
      approval: name === AFB1_SINK ? 'condizionato' : 'qualificato', lastAudit: addDays(today, -R.int(60, 330)),
      paymentDays: R.pick([30, 60, 60, 90]), endOfMonth: R.chance(0.6), minOrderT: cat === 'premix' || cat === 'aminoacido' ? 1 : cat === 'minerale' ? 5 : 28,
      priceBreaks: [], contact: '', note: name.includes('(fantasia)') ? 'Fornitore inventato per il mangimificio dimostrativo' : '',
    };
  });
  const supByName = Object.fromEntries(suppliers.map(s => [s.name, s]));
  // un certificato in scadenza fra 18 giorni; il fornitore con il lotto respinto è da riqualificare
  const tp = supByName['Trader proteici (demo)'];
  if (tp) tp.cert[0].expiry = addDays(today, 18);
  const sink = supByName[AFB1_SINK];
  if (sink) { sink.lastAudit = addDays(today, -420); sink.note = 'Condizionato dopo il lotto di mais respinto per aflatossina B1: audit di riqualifica da programmare'; }
  // sconti per quantità sul mais e sulla soia
  if (supByName['Consorzio agrario (demo)']) supByName['Consorzio agrario (demo)'].priceBreaks = [{ fromT: 56, discountPct: 0.8 }, { fromT: 112, discountPct: 1.5 }];
  if (tp) tp.priceBreaks = [{ fromT: 60, discountPct: 1 }];

  // ---------- (b) lotti delle materie prime principali ripartiti fra i fornitori ----------
  const lotUpd = {};
  const upd = (l, patch) => { lotUpd[l.id] = { ...(lotUpd[l.id] || { id: l.id }), ...patch }; };
  for (const [ingId, ladder] of Object.entries(LADDER)) {
    const lots = (d.ingLots || []).filter(l => l.ingId === ingId && ladder.every(n => supByName[n]));
    if (!lots.length) continue;
    // premio: sulla quotazione della settimana se c'è, altrimenti sulla mediana dei prezzi del mese
    const monthMed = {};
    for (const l of lots) (monthMed[l.date.slice(0, 7)] ||= []).push(+l.price);
    for (const m of Object.keys(monthMed)) monthMed[m] = median(monthMed[m]);
    const prem = l => { const q = quoteAt(ingId, l.date); return q ? l.price / q - 1 : l.price / monthMed[l.date.slice(0, 7)] - 1; };
    const afb = lots.map(l => l.analyses?.AFB1).filter(v => v != null).sort((a, b) => a - b);
    const afbHi = afb.length ? afb[Math.floor(afb.length * 0.85)] : Infinity;
    const sorted = [...lots].sort((a, b) => prem(a) - prem(b));
    sorted.forEach((l, i) => {
      let name = ladder[Math.min(ladder.length - 1, Math.floor((i * ladder.length) / sorted.length))];
      if (ladder.includes(AFB1_SINK) && (l.status === 'bloccato' || (l.analyses?.AFB1 ?? 0) >= afbHi)) name = AFB1_SINK;
      upd(l, { supplier: name, supplierId: supByName[name].id });
    });
  }
  for (const l of d.ingLots || []) if (!lotUpd[l.id] && supByName[l.supplier]) upd(l, { supplierId: supByName[l.supplier].id });
  // scadenze: premiscele 180 giorni, amminoacidi 365; una premiscela in giacenza scade fra 20 giorni
  for (const l of d.ingLots || []) {
    const c = ing[l.ingId]?.category;
    if (c === 'premix') upd(l, { expiry: addDays(l.date, 180) });
    else if (c === 'aminoacido') upd(l, { expiry: addDays(l.date, 365) });
  }
  const oldPremix = (d.ingLots || []).filter(l => l.ingId === 'premix' && l.status === 'accettato' && l.remaining > 0).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (oldPremix) upd(oldPremix, { expiry: addDays(today, 20) });

  // ---------- (c) un ordine storico per ogni lotto ricevuto nelle ultime 52 settimane ----------
  const purchases = [];
  const counter = {};
  for (const p of d.purchases || []) { const c = parseCode(p.code); if (c?.prefix === 'OA') counter[c.yy] = Math.max(counter[c.yy] || 0, c.n); }
  const code = date => { const yy = date.slice(2, 4); counter[yy] = (counter[yy] || 0) + 1; return `OA-${yy}-${String(counter[yy]).padStart(3, '0')}`; };
  const from = addDays(today, -364);
  const recv = (d.ingLots || []).filter(l => l.date >= from && l.date <= today && (l.status === 'accettato' || l.status === 'bloccato')).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  for (const l of recv) {
    const name = lotUpd[l.id]?.supplier || l.supplier, s = supByName[name], pr = PROFILE[name] || { late: 0.03, short: 0.015, lt: 1 };
    const lead = +ing[l.ingId]?.leadDays || 7;
    const late = R.chance(pr.late), short = R.chance(pr.short);
    const deliveryDate = late ? addDays(l.date, -R.int(3, 8)) : addDays(l.date, R.int(-1, 2));
    const date = addDays(deliveryDate, -lead - R.int(0, pr.lt));
    const tonnes = short ? round(l.tonnes / (1 - R.range(0.03, 0.08)), 1) : l.tonnes;
    const id = 'po-h' + (purchases.length + 1);
    purchases.push({ id, code: code(date), ingId: l.ingId, supplier: name, supplierId: s?.id || null, date, tonnes, price: l.price, deliveryDate, status: 'ricevuto', receivedAt: l.date, receivedT: l.tonnes, source: 'storico' });
    upd(l, { poId: id });
  }

  // ---------- (d) un lotto di sorgo in quarantena, arrivato ieri ----------
  const sorgo = ing.sorgo, sq = sorgo && supByName[sorgo.supplier];
  const ingLots = [];
  if (sorgo && sq) {
    const date = addDays(today, -1), id = 'po-q1', price = sorgo.price;
    purchases.push({ id, code: code(addDays(date, -7)), ingId: 'sorgo', supplier: sq.name, supplierId: sq.id, date: addDays(date, -7), tonnes: 28, price, deliveryDate: date, status: 'ricevuto', receivedAt: date, receivedT: 28, source: 'storico' });
    ingLots.push({ id: 'il-q1', code: `${sorgo.code.replace('MP', 'M')}-Q${date.slice(2, 4)}-01`, ingId: 'sorgo', supplier: sq.name, supplierId: sq.id, date, tonnes: 28, remaining: 28, price, ddt: 'DDT ' + R.int(1000, 9999),
      analyses: { PG: round(sorgo.nutr?.PG || 10, 1), UM: round(100 - (sorgo.dm || 87) + 0.4, 1), AFB1: null }, status: 'in attesa', note: 'Arrivo in attesa dell’analisi dell’aflatossina B1', poId: id });
  }

  // ---------- (e) un ordine confermato in ritardo di 3 giorni ----------
  const pa = supByName['Proteine Adriatiche S.r.l. (fantasia)'];
  if (pa && ing.soia44) purchases.push({ id: 'po-late1', code: code(addDays(today, -14)), ingId: 'soia44', supplier: pa.name, supplierId: pa.id, date: addDays(today, -14), tonnes: 30, price: ing.soia44.price, deliveryDate: addDays(today, -3), status: 'confermato', source: 'manuale' });

  // ordini aperti già presenti: il fornitore anagrafico
  const poUpd = (d.purchases || []).filter(p => supByName[p.supplier] && !p.supplierId).map(p => ({ id: p.id, supplierId: supByName[p.supplier].id }));

  // ---------- (f) standard dell'anno: mediana dei prezzi delle prime 3 settimane di dati ----------
  const first = (d.ingLots || []).reduce((a, l) => (l.date < a ? l.date : a), '9999');
  const year = +today.slice(0, 4);
  const standards = [];
  for (const i of d.ingredients || []) {
    const ps = (d.ingLots || []).filter(l => l.ingId === i.id && l.status !== 'bloccato' && l.date <= addDays(first, 20)).map(l => +l.price);
    if (ps.length) standards.push({ id: `std-${year}-${i.id}`, year, ingId: i.id, price: round(median(ps), 1), note: 'Prezzi delle prime 3 settimane di dati (dimostrativo)' });
  }

  return { add: { suppliers, purchases, ingLots, standards }, update: { ingLots: Object.values(lotUpd), purchases: poUpd } };
}
