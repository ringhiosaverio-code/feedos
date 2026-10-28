/* DifesaOS · Costi, prezzi della concorrenza e leve di risparmio per prodotto (area Prodotti › Costi e concorrenza).
 * Tutto in € per tonnellata di massa come gli altri motori; per kg o litro con perUnit (i liquidi con la densità).
 * - unitEconomics: dal listino al margine pieno sui fatti degli ultimi 12 mesi (stesse definizioni della cascata «pocket»
 *   di Economia, più la trasformazione fissa); senza vendite, listino e costo pieno di oggi.
 * - savingsLevers: leve misurate sui dati (fornitore qualificato più conveniente, ordini sotto lo scaglione di sconto, titolo
 *   sopra il necessario, scarti, energia, sconti fuori listino) e leve stimate con ipotesi modificabili (gara sugli imballi,
 *   cambi prodotto, consegne piccole, tempi di incasso). Ogni leva dice da dove viene il numero e cosa fare.
 * - competitorBoard: prezzi rilevati dei concorrenti (e offerte perse sul prezzo) confrontati a ettaro, perché l'agricoltore
 *   confronta il costo del trattamento, non il prezzo al kg: € per ettaro = prezzo × dose di etichetta.
 * - priceStrategy: risparmio tenuto come margine o passato in parte al prezzo, prezzo di parità a ettaro e margine a quel prezzo. */
import { sum, mean, median, quantile, byId, addDays, nf } from '../core/util.js';
import { absorption } from './breakeven.js';
import { changeovers } from './oee.js';
import { asToleranceRange } from './quality.js';

const EMPTY = [];
const n0 = v => (Number.isFinite(+v) ? +v : 0);
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const inP = (x, P) => !!x && x >= P.from && x <= P.to;

/** Ipotesi delle leve stimate (settings.agro.savings le sostituisce una per una). */
export const SAVINGS_DEFAULTS = Object.freeze({
  supplierSharePct: 50,     // quota massima dei volumi sul fornitore qualificato più conveniente (doppia fonte per sicurezza)
  packTenderPct: 5,         // riduzione attesa da una gara sugli imballi
  changeoverCutPct: 30,     // tempo di cambio e pulizia recuperabile con la pianificazione a campagne
  extraDiscountCutPct: 25,  // parte degli sconti fuori listino recuperabile con le regole di deroga
  dsoCutDays: 15,           // giorni di incasso in meno
  smallDropT: 0.3,          // consegne piccole: sotto questa quantità (t)
  dropConsolidatePct: 40,   // quota delle consegne piccole accorpabili
  retailMarkupPct: 18,      // ricarico della rivendita, per confrontare i prezzi rilevati all'agricoltore
  sigmaK: 3,                // titolo: obiettivo = limite inferiore di tolleranza + k deviazioni standard (mai sotto il dichiarato)
});
export const SAVINGS_LABELS = {
  supplierSharePct: ['Quota massima sul fornitore più conveniente', '%'], packTenderPct: ['Riduzione dalla gara sugli imballi', '%'],
  changeoverCutPct: ['Tempo di cambio recuperabile', '%'], extraDiscountCutPct: ['Sconti fuori listino recuperabili', '%'], dsoCutDays: ['Giorni di incasso in meno', 'gg'],
  smallDropT: ['Consegna piccola: sotto', 't'], dropConsolidatePct: ['Consegne piccole accorpabili', '%'], retailMarkupPct: ['Ricarico della rivendita', '%'], sigmaK: ['Titolo: margine di sicurezza', 'σ'],
};
export const savingsSettings = d => ({ ...SAVINGS_DEFAULTS, ...(d?.settings?.agro?.savings || {}) });
export const LEVER_AREA = { acquisti: 'Acquisti', qualita: 'Qualità', produzione: 'Produzione', logistica: 'Logistica', commerciale: 'Commerciale', amministrazione: 'Amministrazione' };

/** € per tonnellata → € per unità di vendita (kg o L, i liquidi con la densità). */
export const perUnit = (vT, p) => (num(vT) == null ? null : p?.uom === 'L' ? (+vT * (+p.density || 1)) / 1000 : +vT / 1000);
/** € per unità di vendita → € per tonnellata. */
export const fromUnit = (vU, p) => (num(vU) == null ? null : p?.uom === 'L' ? (+vU * 1000) / (+p.density || 1) : +vU * 1000);
const unitTxt = p => (p?.uom === 'L' ? 'L' : 'kg');

/**
 * Dal listino al margine pieno di un prodotto nel periodo P (fatti di spedizione, costi effettivi dei lotti).
 * → {p, t, revenue, perT {list, custDisc, extraDisc, net, rebate, commission, finCost, logistics, pocket, raw, shrink, energy, varConv, pack,
 *    industrial, fixConv, full, margin, contrib}, marginPct (sul netto fattura), std (true senza vendite: listino e costo di oggi), steps}
 */
export function unitEconomics(d, ctx, productId, P) {
  const p = ctx?.ix?.prod?.[productId] || (d.products || EMPTY).find(x => x.id === productId);
  if (!p) return null;
  const cust = ctx?.ix?.cust || byId(d.customers || EMPTY);
  const T = { t: 0, list: 0, net: 0, custDisc: 0, rebate: 0, commission: 0, finCost: 0, logistics: 0, raw: 0, shrink: 0, energy: 0, varConv: 0, pack: 0, fixConv: 0 };
  for (const f of ctx?.facts || EMPTY) {
    if (f.productId !== productId || !inP(f.date, P)) continue;
    const c = cust[f.customerId];
    T.t += f.tonnes; T.list += f.listRevenue; T.net += f.revenue;
    T.custDisc += f.listRevenue * n0(c?.discountPct) / 100; T.rebate += f.revenue * n0(c?.rebatePct) / 100;
    T.commission += f.commission; T.finCost += f.finCost; T.logistics += f.logistics;
    T.raw += f.raw; T.shrink += f.shrink; T.energy += f.energy; T.varConv += f.varConv; T.pack += f.pack; T.fixConv += f.fixConv;
  }
  const std = !(T.t > 0);
  let u;
  if (std) {
    const c = ctx?.costs?.[productId] || {};
    const list = n0(p.listPrice);
    u = { list, custDisc: 0, extraDisc: 0, net: list, rebate: 0, commission: 0, finCost: 0, logistics: n0(p.logisticsCost), raw: c.raw, shrink: c.shrink, energy: c.energy,
      varConv: c.processingVar, pack: c.packaging, fixConv: c.processingFix };
    if (c.raw == null) u.raw = u.shrink = null;
  } else {
    const k = 1 / T.t;
    // lo sconto abituale dei clienti non supera lo sconto effettivo: la cascata torna sempre al netto fattura
    const disc = T.list - T.net, cd = Math.min(T.custDisc, Math.max(0, disc)); // disc < 0: venduto sopra il listino
    u = { list: T.list * k, custDisc: cd * k, extraDisc: (disc - cd) * k, net: T.net * k, rebate: T.rebate * k, commission: T.commission * k,
      finCost: T.finCost * k, logistics: T.logistics * k, raw: T.raw * k, shrink: T.shrink * k, energy: T.energy * k, varConv: T.varConv * k, pack: T.pack * k, fixConv: T.fixConv * k };
  }
  u.pocket = u.net - u.rebate - u.commission - u.finCost - u.logistics;
  u.industrial = u.raw == null ? null : u.raw + n0(u.shrink) + n0(u.energy) + n0(u.varConv) + n0(u.pack);
  u.full = u.industrial == null ? null : u.industrial + n0(u.fixConv);
  u.contrib = u.industrial == null ? null : u.pocket - u.industrial;
  u.margin = u.full == null ? null : u.pocket - u.full;
  const step = (key, label, v, kind = 'neg') => ({ key, label, value: v, kind });
  const steps = [
    step('list', 'Listino', u.list, 'total'), step('custDisc', 'Sconto cliente', -u.custDisc), step('extraDisc', u.extraDisc >= 0 ? 'Sconto extra' : 'Sopra il listino', -u.extraDisc),
    step('rebate', 'Premi', -u.rebate), step('commission', 'Provvigioni', -u.commission), step('finCost', 'Dilazione', -u.finCost), step('logistics', 'Trasporto', -u.logistics),
    step('pocket', 'Prezzo pocket', u.pocket, 'total'),
    ...(u.full == null ? [] : [step('raw', 'Materie prime', -(u.raw + n0(u.shrink))), step('conv', 'Energia e trasformazione', -(n0(u.energy) + n0(u.varConv) + n0(u.fixConv))), step('pack', 'Imballo', -n0(u.pack)), step('margin', 'Margine pieno', u.margin, 'total')]),
  ].filter(s => s.kind === 'total' || Math.abs(s.value) > 0.005);
  return { p, t: T.t, revenue: T.net, perT: u, marginPct: u.margin != null && u.net > 0 ? u.margin / u.net : null, std, steps };
}

/* ---------------- leve di risparmio ---------------- */

function lever(o) { return { regulatory: null, ...o, year: o.year ?? o.perT * (o.t || 0) }; }

/** Prezzo medio pagato per fornitore di una materia prima nel periodo (lotti accettati). → {bySup: {name: {t, value, price, id}}, t, price} */
function paidBySupplier(d, ingId, P) {
  const bySup = {};
  for (const l of d.ingLots || EMPTY) {
    if (l.ingId !== ingId || !inP(l.date, P) || l.status === 'bloccato' || !(+l.price > 0) || !(+l.tonnes > 0)) continue;
    const k = l.supplier || l.supplierId || '—';
    const o = (bySup[k] ||= { t: 0, value: 0, lots: 0, id: l.supplierId || null });
    o.t += +l.tonnes; o.value += +l.tonnes * +l.price; o.lots++;
  }
  for (const o of Object.values(bySup)) o.price = o.value / o.t;
  const t = sum(Object.values(bySup), o => o.t);
  return { bySup, t, price: t ? sum(Object.values(bySup), o => o.value) / t : null };
}

/**
 * Leve di risparmio di un prodotto nel periodo P (di solito gli ultimi 12 mesi), in € per tonnellata di prodotto e per anno.
 * → [{id, area, label, perT, year, basis: 'dati'|'stima', how, detail, owner, regulatory}] in ordine di valore annuo.
 */
export function savingsLevers(d, ctx, productId, P, S = savingsSettings(d)) {
  const ix = ctx?.ix || {};
  const p = ix.prod?.[productId] || (d.products || EMPTY).find(x => x.id === productId);
  if (!p) return [];
  const econ = unitEconomics(d, ctx, productId, P);
  const t = econ?.t || 0;
  const f = ix.form?.[p.formulaId] || (d.formulas || EMPTY).find(x => x.id === p.formulaId);
  const ings = ix.ing || byId(d.ingredients || EMPTY);
  const sups = d.suppliers || EMPTY;
  const supByName = Object.fromEntries(sups.map(s => [s.name, s]));
  const out = [];
  const fin = d.settings?.finance || {};

  // 1-2. acquisti: fornitore qualificato più conveniente e ordini sotto lo scaglione di sconto
  for (const line of f?.lines || EMPTY) {
    const ing = ings[line.ing];
    if (!ing || ing.category === 'acqua' || !(+line.kg > 0)) continue;
    const kgT = +line.kg / 1000; // t di materia prima per t di prodotto
    const iname = String(ing.name || ing.label || ing.id).split(' (')[0];
    const paid = paidBySupplier(d, ing.id, P);
    const entries = Object.entries(paid.bySup);
    if (entries.length >= 2) {
      const ok = entries.filter(([name]) => (supByName[name]?.approval || 'qualificato') === 'qualificato').filter(([, o]) => o.lots >= 2);
      const best = ok.sort((a, b) => a[1].price - b[1].price)[0];
      if (best) {
        const share = best[1].t / paid.t, target = Math.max(share, S.supplierSharePct / 100), moved = target - share;
        const others = entries.filter(([n]) => n !== best[0]), oT = sum(others, ([, o]) => o.t);
        const pOthers = oT ? sum(others, ([, o]) => o.value) / oT : null;
        const gap = pOthers != null ? pOthers - best[1].price : 0;
        if (moved > 0.01 && gap > 0.005 * best[1].price) {
          const perIngT = moved * gap;
          out.push(lever({ id: 'acq-forn-' + ing.id, area: 'acquisti', owner: 'Acquisti', basis: 'dati', t, label: `${iname}: più volumi al fornitore qualificato più conveniente`,
            perT: kgT * perIngT,
            detail: `${best[0]} costa ${nf(best[1].price)} €/t contro ${nf(pOthers)} €/t degli altri fornitori negli ultimi 12 mesi (${nf(gap / pOthers * 100, 1)}% in meno); oggi ha il ${nf(share * 100)}% dei volumi.`,
            how: `Portare la quota di ${best[0]} al ${nf(target * 100)}% tenendo un secondo fornitore qualificato; il calcolo vale ${nf(+line.kg)} kg di ${iname.toLowerCase()} per tonnellata di prodotto.` }));
        }
      }
    }
    // scaglioni di sconto del fornitore principale
    const main = entries.sort((a, b) => b[1].t - a[1].t)[0];
    const sup = main && supByName[main[0]];
    const breaks = (sup?.priceBreaks || EMPTY).filter(b => +b.fromT > 0 && +b.discountPct > 0).sort((a, b) => a.fromT - b.fromT);
    if (sup && breaks.length) {
      const pos = (d.purchases || EMPTY).filter(x => x.ingId === ing.id && (x.supplierId === sup.id || x.supplier === sup.name) && inP(x.date, P) && +x.tonnes > 0);
      const avgPo = pos.length ? mean(pos.map(x => +x.tonnes)) : null;
      const yearT = main[1].t * 365 / Math.max(1, Math.round((Date.parse(P.to) - Date.parse(P.from)) / 864e5) + 1);
      const br = avgPo != null ? breaks.filter(b => b.fromT > avgPo && yearT >= 2 * b.fromT).pop() : null;
      const cur = avgPo != null ? breaks.filter(b => b.fromT <= avgPo).pop() : null;
      if (br && pos.length >= 3) {
        const extraPct = br.discountPct - (cur?.discountPct || 0);
        const carry = (n0(d.settings?.ops?.carryRatePct) || 8) / 100;
        const gross = main[1].price * extraPct / 100;                         // € per t di materia prima del fornitore
        const carryPerT = ((br.fromT - avgPo) / 2) * main[1].price * carry / Math.max(1, yearT); // scorta media in più, per t acquistata
        const netIngT = (gross - carryPerT) * (main[1].t / paid.t);
        if (netIngT > 0) out.push(lever({ id: 'acq-lotti-' + ing.id, area: 'acquisti', owner: 'Acquisti', basis: 'dati', t, label: `${iname}: ordini da almeno ${nf(br.fromT)} t (sconto ${nf(br.discountPct, 1)}%)`,
          perT: kgT * netIngT,
          detail: `Ordine medio a ${sup.name} di ${nf(avgPo, 1)} t (${nf(pos.length)} ordini in 12 mesi); lo scaglione da ${nf(br.fromT)} t dà il ${nf(extraPct, 1)}% in più. Al netto del costo della scorta in più (${nf(carry * 100)}% l’anno).`,
          how: `Accorpare gli ordini di ${iname.toLowerCase()} in lotti da ${nf(br.fromT)} t con consegne programmate.` }));
      }
    }
  }

  // 3. titolo della sostanza attiva sopra il necessario (sovradosaggio)
  const decl = (p.actives || EMPTY)[0];
  const ratios = [];
  for (const l of d.lots || EMPTY) {
    if (l.productId !== productId || !inP(l.date, P)) continue;
    for (const a of l.analyses || EMPTY) { const v = a.values || {}; if (num(v.titolo) != null && +v.dichiarato > 0) ratios.push(+v.titolo / +v.dichiarato); }
  }
  if (decl && ratios.length >= 8 && f) {
    const mu = mean(ratios), sd = Math.sqrt(sum(ratios, x => (x - mu) ** 2) / (ratios.length - 1));
    const tol = asToleranceRange(+decl.g, p.form);
    const low = tol ? tol.min / +decl.g : 0.95;
    const target = Math.max(1, low + S.sigmaK * sd);
    const aiCostT = sum((f.lines || EMPTY).filter(x => ings[x.ing]?.asId === decl.as), x => (+x.kg / 1000) * n0(ings[x.ing]?.price));
    if (mu > target + 0.002 && aiCostT > 0) out.push(lever({ id: 'qual-titolo', area: 'qualita', owner: 'Qualità e produzione', basis: 'dati', t,
      label: `Titolo medio ${nf((mu - 1) * 100, 1)}% sopra il dichiarato`, perT: ((mu - target) / mu) * aiCostT,
      detail: `${nf(ratios.length)} lotti analizzati: titolo medio ${nf(mu * 100, 1)}% del dichiarato, deviazione standard ${nf(sd * 100, 1)}%; tolleranza da ${nf(low * 100, 1)}%. Basta il ${nf(target * 100, 1)}% (limite inferiore + ${nf(S.sigmaK)} σ, mai sotto il dichiarato).`,
      how: 'Ridurre il sovradosaggio della sostanza attiva in ricetta e tenere sotto controllo la carta del titolo lotto per lotto.', regulatory: 'Resta entro la tolleranza del contenuto dichiarato: la composizione autorizzata non cambia.' }));
  }

  // 4. gara sugli imballi (stima)
  if (n0(p.packCost) > 0 && S.packTenderPct > 0) out.push(lever({ id: 'acq-imballi', area: 'acquisti', owner: 'Acquisti', basis: 'stima', t, label: `Gara sugli imballi (${p.packaging || 'confezione'})`,
    perT: n0(p.packCost) * S.packTenderPct / 100,
    detail: `Imballo ${nf(perUnit(p.packCost, p), 3)} € per ${unitTxt(p)}; ipotesi di riduzione ${nf(S.packTenderPct, 1)}% con una gara fra almeno tre fornitori omologati.`,
    how: 'Chiedere offerte per la stessa specifica (omologazione ADR e UN dove serve) e valutare formati più grandi per i clienti professionali.' }));

  // 5. scarti di produzione sopra il quartile migliore
  const runs = (d.runs || EMPTY).filter(r => r.productId === productId && inP(r.date, P) && +r.tonnes > 0);
  const c = ctx?.costs?.[productId];
  if (runs.length >= 6 && c && c.raw != null) {
    const rate = sum(runs, r => n0(r.waste)) / sum(runs, r => +r.tonnes);
    const best = quantile(runs.map(r => n0(r.waste) / +r.tonnes), 0.25);
    const varT = c.raw + n0(c.energy) + n0(c.processingVar);
    if (rate - best > 0.0005) out.push(lever({ id: 'prod-scarti', area: 'produzione', owner: 'Produzione', basis: 'dati', t, label: `Scarti di produzione al ${nf(rate * 100, 2)}%`,
      perT: (rate - best) * varT,
      detail: `${nf(runs.length)} lavorazioni: scarto medio ${nf(rate * 100, 2)}%, il quarto migliore delle lavorazioni sta al ${nf(best * 100, 2)}%. Ogni punto di scarto costa materie prime, energia e trasformazione.`,
      how: 'Standardizzare avvio e fine lotto come nelle lavorazioni migliori (tarature, lavaggi recuperati nel lotto successivo dello stesso prodotto).' }));
    // 6. energia per tonnellata sopra il quartile migliore
    const kw = runs.filter(r => +r.kwh > 0 && +r.tonnes >= 0.5);
    const kwhPrice = n0(d.settings?.energy?.kwhPrice);
    if (kw.length >= 6 && kwhPrice > 0) {
      const m = sum(kw, r => +r.kwh) / sum(kw, r => +r.tonnes), q = quantile(kw.map(r => +r.kwh / +r.tonnes), 0.25);
      if ((m - q) * kwhPrice > 0.5) out.push(lever({ id: 'prod-energia', area: 'produzione', owner: 'Produzione', basis: 'dati', t, label: `Energia: ${nf(m, 1)} kWh/t contro ${nf(q, 1)} delle lavorazioni migliori`,
        perT: (m - q) * kwhPrice,
        detail: `Prezzo dell’energia ${nf(kwhPrice, 3)} €/kWh; il riferimento è il quarto migliore delle ${nf(kw.length)} lavorazioni del prodotto.`,
        how: 'Lotti pieni (le lavorazioni piccole consumano di più a tonnellata) e verifica di essiccatore e mulini nelle lavorazioni peggiori.' }));
    }
  }

  // 7. cambi prodotto e pulizie (stima: valore della capacità liberata)
  if (p.lineId && runs.length) {
    const lineRuns = (d.runs || EMPTY).filter(r => r.lineId === p.lineId && inP(r.date, P));
    const co = changeovers(lineRuns);
    const toThis = co.filter(x => x.to === productId).length;
    const mins = sum((d.stops || EMPTY).filter(s => s.lineId === p.lineId && inP(s.date, P) && (s.reason === 'cambio' || s.reason === 'pulizia')), s => n0(s.minutes));
    let rate = null;
    try { rate = absorption(d, ctx, P).rows.find(r => r.lineId === p.lineId)?.rate ?? null; } catch { rate = null; }
    if (co.length && toThis && mins > 0 && rate > 0 && S.changeoverCutPct > 0) {
      const hours = (toThis * mins) / co.length / 60;
      const value = hours * rate * S.changeoverCutPct / 100;
      if (t > 0 && value > 50) out.push(lever({ id: 'prod-cambi', area: 'produzione', owner: 'Pianificazione', basis: 'stima', t, label: `Cambi prodotto e pulizie: ${nf(hours)} ore l’anno`,
        perT: value / t, year: value,
        detail: `${nf(toThis)} cambi verso questo prodotto su ${nf(co.length)} della linea, ${nf(mins / co.length)} minuti medi di cambio e pulizia; costo orario della linea ${nf(rate)} €/h; ipotesi di recupero ${nf(S.changeoverCutPct)}%.`,
        how: 'Pianificare a campagne per famiglia (stessa sostanza attiva o colore), dal prodotto meno critico al più critico per le pulizie. È capacità liberata: diventa risparmio di cassa se si riducono turni o straordinari.' }));
    }
  }

  if (!econ?.std && t > 0) {
    const ships = (d.shipments || EMPTY).filter(s => s.productId === productId && inP(s.date, P));
    // 8. consegne piccole (stima)
    const small = ships.filter(s => +s.tonnes > 0 && +s.tonnes < S.smallDropT).length;
    const perDrop = n0(d.settings?.logistics?.perDrop) || 35;
    if (small >= 10 && S.dropConsolidatePct > 0) {
      const value = small * perDrop * S.dropConsolidatePct / 100;
      out.push(lever({ id: 'log-consegne', area: 'logistica', owner: 'Logistica e commerciale', basis: 'stima', t, label: `${nf(small)} consegne sotto ${nf(S.smallDropT, 1)} t`,
        perT: value / t, year: value,
        detail: `${nf(small)} consegne piccole su ${nf(ships.length)} (${nf(small / ships.length * 100)}%); costo per consegna ${nf(perDrop)} €; ipotesi: se ne accorpa il ${nf(S.dropConsolidatePct)}%.`,
        how: 'Ordine minimo per consegna franco o giri settimanali per zona; le urgenze in campagna restano a parte.' }));
    }
    const u = econ.perT;
    // 9. sconti fuori listino
    if (u.extraDisc > 0.5 && S.extraDiscountCutPct > 0) out.push(lever({ id: 'com-sconti', area: 'commerciale', owner: 'Commerciale', basis: 'dati', t, label: `Sconti fuori listino: ${nf(perUnit(u.extraDisc, p), 3)} € per ${unitTxt(p)}`,
      perT: u.extraDisc * S.extraDiscountCutPct / 100,
      detail: `Oltre allo sconto abituale dei clienti si concedono ${nf(u.extraDisc / u.list * 100, 1)}% del listino; ipotesi: se ne recupera il ${nf(S.extraDiscountCutPct)}% con deroghe approvate e motivate.`,
      how: 'Deroghe sotto il prezzo minimo solo con approvazione e motivo (Commerciale › Offerte); rivedere i clienti con più sconto extra.' }));
    // 10. tempi di incasso
    if (u.finCost > 0 && S.dsoCutDays > 0) {
      const vat = num(fin.vatPct) ?? 10, rate = num(fin.rate) ?? 5;
      const perT = u.net * (1 + vat / 100) * (rate / 100) * S.dsoCutDays / 365;
      out.push(lever({ id: 'amm-incassi', area: 'amministrazione', owner: 'Amministrazione e commerciale', basis: 'stima', t, label: `Incasso ${nf(S.dsoCutDays)} giorni prima`, perT,
        detail: `Onere finanziario della dilazione ${nf(perUnit(u.finCost, p), 3)} € per ${unitTxt(p)} (tasso ${nf(rate, 1)}%, IVA ${nf(vat)}%); ipotesi: ${nf(S.dsoCutDays)} giorni in meno.`,
        how: 'Sconto cassa mirato o scadenze di campagna più corte per i clienti con dilazioni lunghe; controllo dei fidi.' }));
    }
  }
  return out.filter(x => x.perT > 0.01 && x.year >= 0).sort((a, b) => b.year - a.year);
}

/* ---------------- concorrenza a ettaro ---------------- */

const DOSE_K = { 'kg/ha': 1, 'L/ha': 1, 'l/ha': 1, 'g/ha': 0.001, 'ml/ha': 0.001, 'mL/ha': 0.001 };
/** Dose di etichetta per ettaro di un prodotto su una coltura (metà dell'intervallo, in kg o L). */
export function labelDose(d, productId, crop) {
  const regs = (d.registrations || EMPTY).filter(r => r.productId === productId).map(r => r.id);
  const uses = (d.regUses || EMPTY).filter(u => regs.includes(u.registrationId) && (!crop || u.crop === crop) && num(u.doseMin) != null);
  if (!uses.length) return null;
  const u = uses[0], k = DOSE_K[u.doseUnit] ?? 1;
  return ((+u.doseMin + (num(u.doseMax) ?? +u.doseMin)) / 2) * k;
}

/**
 * Prezzi della concorrenza di un prodotto negli ultimi 12 mesi: rilevazioni (competitorPrices) e offerte perse sul prezzo.
 * Prezzi portati al livello della rivendita (quelli all'agricoltore si dividono per 1 + ricarico) e a ettaro con le dosi.
 * → {p, ourPrice (netto fattura per unità), rows, groups [{key, competitor, product, crop, n, price, dose, eurHa, ourEurHa, gap, parity, last}],
 *    gap (mediana dei gruppi a ettaro: > 0 noi più cari), parity (prezzo per unità che pareggia la mediana a ettaro)}
 */
export function competitorBoard(d, ctx, productId, P, S = savingsSettings(d)) {
  const p = ctx?.ix?.prod?.[productId] || (d.products || EMPTY).find(x => x.id === productId);
  if (!p) return null;
  const econ = unitEconomics(d, ctx, productId, P);
  const ourPrice = perUnit(econ?.perT?.net, p);
  const from = addDays(P.to, -364);
  const rows = [];
  for (const o of d.competitorPrices || EMPTY) {
    if (o.productId !== productId || !o.date || o.date < from || o.date > P.to || !(+o.price > 0)) continue;
    const price = o.level === 'agricoltore' ? +o.price / (1 + S.retailMarkupPct / 100) : +o.price;
    rows.push({ ...o, source: o.source || 'rilevazione', comparable: price, doseHa: num(o.dose) != null ? +o.dose * (DOSE_K[o.doseUnit] ?? 1) : null, cropName: o.crop ? (d.regUses || EMPTY).find(u => u.crop === o.crop && u.cropName)?.cropName || o.crop : null });
  }
  for (const o of d.offers || EMPTY) {
    if (o.productId !== productId || !(+o.competitorPrice > 0) || !o.date || o.date < from || o.date > P.to) continue;
    rows.push({ id: 'of:' + o.id, date: o.decidedAt || o.date, productId, competitor: o.competitor || 'Concorrente', competitorProduct: '', crop: null, price: perUnit(+o.competitorPrice, p),
      level: 'rivendita', comparable: perUnit(+o.competitorPrice, p), doseHa: null, source: 'offerta persa', customerId: o.customerId, agentId: o.agentId });
  }
  const G = {};
  for (const r of rows) {
    const key = `${r.competitor}|${r.competitorProduct || ''}|${r.crop || ''}`;
    (G[key] ||= { key, competitor: r.competitor, product: r.competitorProduct || '', crop: r.crop || null, rows: [] }).rows.push(r);
  }
  const groups = Object.values(G).map(g => {
    const price = median(g.rows.map(r => r.comparable));
    const doses = g.rows.map(r => r.doseHa).filter(v => v != null);
    const dose = doses.length ? median(doses) : null;
    const ourDose = g.crop ? (median(g.rows.map(r => num(r.ourDose)).filter(v => v != null)) ?? labelDose(d, productId, g.crop)) : null;
    const eurHa = dose != null ? price * dose : null, ourEurHa = ourDose != null && ourPrice != null ? ourPrice * ourDose : null;
    const cropName = g.crop ? (d.regUses || EMPTY).find(u => u.crop === g.crop && u.cropName)?.cropName || g.crop : null;
    return { ...g, cropName, n: g.rows.length, price, dose, ourDose, eurHa, ourEurHa, gapKg: ourPrice != null ? ourPrice / price - 1 : null,
      gap: eurHa && ourEurHa ? ourEurHa / eurHa - 1 : null, parity: eurHa != null && ourDose ? eurHa / ourDose : null, last: g.rows.map(r => r.date).sort().pop() };
  }).sort((a, b) => (b.gap ?? -9) - (a.gap ?? -9));
  const ha = groups.filter(g => g.gap != null);
  return { p, ourPrice, rows: rows.sort((a, b) => (a.date < b.date ? 1 : -1)), groups, gap: ha.length ? median(ha.map(g => g.gap)) : null, parity: ha.length ? median(ha.map(g => g.parity)) : null, n: rows.length };
}

/**
 * Strategia di prezzo: risparmio per t (somma delle leve scelte) tenuto come margine o passato al prezzo per la quota pass (0–1).
 * Premi, provvigioni e dilazione seguono il prezzo; trasporto e costi industriali no.
 * → {save, price, newPrice, priceChange, margin, newMargin, marginPct, newMarginPct, parity: {price, marginPct, marginPctAfter}}
 */
export function priceStrategy(econ, saveT, pass = 0, board = null) {
  if (!econ || econ.perT.full == null) return null;
  const u = econ.perT, net = u.net;
  if (!(net > 0)) return null;
  const varRatio = (u.rebate + u.commission + u.finCost) / net;
  const costs = u.logistics + u.full;
  const M = net * (1 - varRatio) - costs;
  const save = Math.max(0, n0(saveT));
  const newPrice = net - (pass * save) / (1 - varRatio);
  const newMargin = M + (1 - pass) * save;
  const parityT = board?.parity != null ? fromUnit(board.parity, econ.p) : null;
  const mAt = (P, extra) => (P > 0 ? (P * (1 - varRatio) - costs + extra) / P : null);
  return {
    save, price: net, newPrice, priceChange: newPrice / net - 1, margin: M, newMargin, marginPct: M / net, newMarginPct: newMargin / newPrice,
    parity: parityT != null ? { price: parityT, change: parityT / net - 1, marginPct: mAt(parityT, 0), marginPctAfter: mAt(parityT, save) } : null,
  };
}

/** Portafoglio: per prodotto venduto (o a listino) costo, margine, risparmio potenziale e posizione a ettaro. */
export function savingsPortfolio(d, ctx, P, S = savingsSettings(d)) {
  const out = [];
  for (const p of d.products || EMPTY) {
    if (p.active === false) continue;
    const econ = unitEconomics(d, ctx, p.id, P);
    if (!econ || (econ.std && !(+p.listPrice > 0))) continue;
    const L = savingsLevers(d, ctx, p.id, P, S);
    const b = competitorBoard(d, ctx, p.id, P, S);
    const save = sum(L, x => x.perT);
    out.push({
      id: p.id, productId: p.id, code: p.code, name: p.name, category: p.category, p, t: econ.t, revenue: econ.revenue, std: econ.std,
      net: econ.perT.net, full: econ.perT.full, margin: econ.perT.margin, marginPct: econ.marginPct,
      saveT: save, saveYear: sum(L, x => x.year), dataYear: sum(L.filter(x => x.basis === 'dati'), x => x.year), levers: L.length,
      savePct: econ.perT.full ? save / econ.perT.full : null, gap: b?.gap ?? null, parity: b?.parity ?? null, obs: b?.n || 0,
    });
  }
  return out.sort((a, b) => b.saveYear - a.saveYear);
}

/** Segnale: concorrente più conveniente a ettaro su un prodotto con rilevazioni recenti. */
export function risparmiSignals(d, ctx) {
  const out = [];
  if (!(d?.competitorPrices || EMPTY).length) return out;
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!today || !ctx?.facts) return out;
  const P = { from: addDays(today, -364), to: today };
  const recent = addDays(today, -120);
  const ids = [...new Set(d.competitorPrices.filter(o => o.date >= recent).map(o => o.productId))];
  for (const id of ids) {
    const b = competitorBoard(d, ctx, id, P);
    if (!b || b.gap == null || b.gap < 0.08) continue;
    const g = b.groups.filter(x => x.gap != null && x.gap > 0).sort((x, y) => y.gap - x.gap)[0];
    const econ = unitEconomics(d, ctx, id, P);
    out.push({
      key: `prodotti:concorrenza:${id}:${today.slice(0, 7)}`, area: 'prodotti', roles: ['direzione', 'commerciale', 'agente'], severity: b.gap > 0.15 ? 'attenzione' : 'info',
      title: `${b.p.name} costa il ${nf(b.gap * 100)}% in più a ettaro dei concorrenti`,
      why: `${g ? `${g.competitor}${g.product ? ` (${g.product})` : ''}: ${nf(g.eurHa, 2)} €/ha contro ${nf(g.ourEurHa, 2)} €/ha${g.cropName ? ` su ${String(g.cropName).toLowerCase()}` : ''}, ${nf(g.n)} rilevazioni. ` : ''}Prezzo di parità a ettaro ${nf(b.parity, 2)} € per ${unitTxt(b.p)} contro ${nf(b.ourPrice, 2)} netti.`,
      action: 'Valutare le leve di risparmio del prodotto e quanto passarne al prezzo, o argomentare la differenza con le prove di campo.',
      impact: Math.max(1e4, (econ?.revenue || 0) * Math.min(0.3, b.gap) * 0.3), link: { area: 'prodotti', tab: 'risparmi', id },
    });
  }
  return out;
}
