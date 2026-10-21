/* FeedOS 17 · Ponte del margine tra due periodi (prezzo, volume, mix e costi) che quadra al centesimo (pacchetto WP1).
 * basis() raccoglie per chiave (prodotto, specie, cliente, agente) tonnellate, ricavi, listino, materie prime per ingrediente,
 * kWh e GPL e gli altri costi variabili; pvm() scompone M_B − M_A in volume, mix e effetti unitari; narrative() lo racconta.
 * Puro: usabile nei test in node. */
import { monthOf, monthFraction, sum, nf, sf } from '../core/util.js';
import { makeCtx, makeIndex, energyPriceAt, fixedFor } from './actuals.js';
import { SPECIES } from './nutrients.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const has = v => v != null && v !== '' && Number.isFinite(+v);
const EMPTY = [];
const EPS = 1e-9;
export const STIMA = '_stima';

/** Riga vuota della base. */
export function emptyRow(key) {
  return { key, t: 0, rev: 0, list: 0, raw: 0, shrink: 0, energy: 0, varConv: 0, pack: 0, logistics: 0, commission: 0,
    kwh: 0, gplKg: 0, kwhEur: 0, gplEur: 0, estEnergy: 0, ing: {}, n: 0 };
}
const addIng = (r, id, kg, eur) => { const x = (r.ing[id] ||= { kg: 0, eur: 0 }); x.kg += kg; x.eur += eur; };

/** Ingredienti per tonnellata di un lotto (kg/t e €/t) dalla composizione; null se manca un lotto MP o un prezzo. */
function lotIngredients(lot, ix) {
  const comp = lot?.comp || EMPTY, t = n0(lot?.tonnes);
  if (!comp.length || t <= 0) return null;
  const out = {};
  for (const c of comp) {
    const il = ix.ingLot[c.l];
    if (!il || !has(il.price)) return null;
    const id = c.ing || il.ingId || c.l;
    const o = (out[id] ||= { kgT: 0, eurT: 0 });
    o.kgT += n0(c.kg) / t; o.eurT += n0(c.kg) / 1000 * +il.price / t;
  }
  return out;
}

/** Consumi di energia per tonnellata del lotto e prezzi del mese (stesse regole di actuals.lotUnitCost). */
function lotEnergy(lot, ix, settings) {
  const p = ix.prod[lot?.productId];
  const run = ix.run[lot?.runId] || ix.runByLot[lot?.id];
  const line = ix.line[run?.lineId] || ix.line[p?.lineId];
  if (run && n0(run.tonnes) > 0 && has(run.kwh)) {
    const pr = energyPriceAt(settings, monthOf(run.date));
    const gpl = has(run.gplKg) ? +run.gplKg : n0(line?.gplKgPerT) * run.tonnes;
    return { kwhT: +run.kwh / run.tonnes, gplT: gpl / run.tonnes, kp: pr.kwhPrice, gp: pr.gplPrice };
  }
  const pr = energyPriceAt(settings, monthOf(run?.date || lot?.date || ''));
  return { kwhT: n0(line?.kwhPerT), gplT: n0(line?.gplKgPerT), kp: pr.kwhPrice, gp: pr.gplPrice };
}

/**
 * Base del ponte nel periodo P, per chiave by ('productId' | 'species' | 'customerId' | 'agentId').
 * Materie prime per ingrediente dalla composizione dei lotti (scalata su t spedite / t del lotto); senza composizione
 * o con un prezzo mancante il costo va nella pseudo-chiave '_stima'. Energia = kWh e GPL della lavorazione ai prezzi del mese.
 * I mesi di P precedenti ai fatti usano lo storico mensile (materie prime ed energia in '_stima'), ripartito per giorni nei mesi parziali.
 * opts.filter(f) limita i fatti (es. un solo prodotto per il dettaglio per cliente).
 * → {rows: {[k]: riga}, fixed, fixedDetail, by, P}
 */
export function basis(d, ctx, P, by = 'productId', { filter = null, fixed: withFixed = true } = {}) {
  ctx = ctx || makeCtx(d);
  const ix = ctx.ix || makeIndex(d), settings = d.settings || {};
  const rows = {};
  const row = k => (rows[k ?? '_'] ||= emptyRow(k ?? '_'));
  const ingCache = new Map(), enCache = new Map();
  let first = null;
  for (const f of ctx.facts || EMPTY) {
    if (f.month && (first == null || f.month < first)) first = f.month;
    if (f.date < P.from || f.date > P.to || (filter && !filter(f))) continue;
    const r = row(f[by]), t = n0(f.tonnes);
    r.t += t; r.rev += f.revenue; r.list += f.listRevenue; r.shrink += f.shrink; r.varConv += f.varConv; r.pack += f.pack;
    r.logistics += f.logistics; r.commission += f.commission; r.n++;
    const lot = ix.lot[f.lotId] || { productId: f.productId, comp: EMPTY, tonnes: 0, date: f.date, id: null };
    const ck = lot.id || `~${f.productId}|${monthOf(f.date)}`;
    // materie prime per ingrediente
    let ing = ingCache.get(ck);
    if (ing === undefined) { ing = lotIngredients(lot, ix); ingCache.set(ck, ing); }
    if (ing) {
      let eur = 0;
      for (const [id, x] of Object.entries(ing)) { addIng(r, id, x.kgT * t, x.eurT * t); eur += x.eurT * t; }
      r.raw += eur;
      if (Math.abs(eur - f.raw) > 1e-6) addIng(r, STIMA, 0, f.raw - eur), r.raw += f.raw - eur; // quadratura con il fatto
    } else { addIng(r, STIMA, 1000 * t, f.raw); r.raw += f.raw; }
    // energia
    let en = enCache.get(ck);
    if (!en) { en = lotEnergy(lot, ix, settings); enCache.set(ck, en); }
    const kwh = en.kwhT * t, gpl = en.gplT * t, ke = kwh * en.kp, ge = gpl * en.gp;
    r.kwh += kwh; r.gplKg += gpl; r.kwhEur += ke; r.gplEur += ge; r.estEnergy += f.energy - ke - ge; r.energy += f.energy;
  }
  // storico mensile: mesi precedenti al primo mese con fatti (come pnl.aggregate)
  for (const h of d.salesHistory || EMPTY) {
    const m = String(h.month || '').slice(0, 7);
    const q = m ? monthFraction(m, P) : 0; // mesi parziali: valori ripartiti per giorni
    if (!m || (first && m >= first) || q <= 0) continue;
    const f = { productId: h.productId ?? null, customerId: h.customerId ?? null, agentId: h.agentId ?? null,
      species: h.species ?? ix.prod[h.productId]?.species ?? null, month: m, date: m + '-01', source: 'storico' };
    if (filter && !filter(f)) continue;
    const r = row(f[by]), t = n0(h.tonnes) * q, rev = n0(h.revenue) * q, raw = n0(h.raw) * q, en = n0(h.energy) * q;
    r.t += t; r.rev += rev; r.list += has(h.listRevenue) ? +h.listRevenue * q : rev; r.shrink += n0(h.shrink) * q; r.varConv += n0(h.varConv) * q; r.pack += n0(h.pack) * q;
    r.logistics += n0(h.logistics) * q; r.commission += n0(h.commission) * q; r.n += (has(h.n) ? +h.n : 1) * q;
    addIng(r, STIMA, 1000 * t, raw); r.raw += raw;
    r.estEnergy += en; r.energy += en;
  }
  let fixedDetail = null;
  if (withFixed) fixedDetail = fixedFor(d.fixedCosts || EMPTY, d.costCenters || EMPTY, P);
  return { rows, fixed: fixedDetail ? fixedDetail.total : 0, fixedDetail, by, P };
}

/** Unità di una riga (per t): prezzo, listino, materie prime per ingrediente, energia e altri costi. */
function unit(r) {
  const t = r.t;
  const q = {}, pi = {};
  for (const [id, x] of Object.entries(r.ing)) { q[id] = x.kg / t; pi[id] = x.kg > EPS ? x.eur / x.kg : null; }
  return {
    t, p: r.rev / t, L: r.list / t, q, pi, rawT: r.raw / t, shrinkT: r.shrink / t,
    e: r.kwh / t, te: r.kwh > EPS ? r.kwhEur / r.kwh : null, g: r.gplKg / t, tg: r.gplKg > EPS ? r.gplEur / r.gplKg : null, estT: r.estEnergy / t,
    energyT: (r.kwhEur + r.gplEur + r.estEnergy) / t, varConvT: r.varConv / t, packT: r.pack / t, logT: r.logistics / t, commT: r.commission / t,
    ingEurT: id => r.ing[id] ? r.ing[id].eur / t : 0,
  };
}
/** Quota delle materie prime con dettaglio per ingrediente (non '_stima'). */
const detailShare = r => (Math.abs(r.raw) > EPS ? 1 - (r.ing[STIMA]?.eur || 0) / r.raw : 1);
/** Materie prime come voce unica: q = 1000 kg/t, π = costo per kg. */
function collapse(u) {
  u.q = { [STIMA]: 1000 }; u.pi = { [STIMA]: u.rawT / 1000 };
  u.ingEurT = id => (id === STIMA ? u.rawT : 0);
}
/** Margine totale di una riga al livello scelto (energia dai suoi componenti). */
function rowMargin(r, level) {
  const energy = r.kwhEur + r.gplEur + r.estEnergy;
  const mc1 = r.rev - r.raw - r.shrink - energy - r.varConv - r.pack;
  return level === 'mc1' ? mc1 : mc1 - r.logistics - r.commission;
}

export const STEP_DEFS = [
  { key: 'volume', label: 'Volume', art: 'il volume', def: '(t_B − t_A) × margine medio unitario di A: quanto cambia il margine se cambiano solo le tonnellate.' },
  { key: 'mix', label: 'Mix', art: 'il mix', def: 'Σ (t_B,k − T_B × quota_A,k) × (m_A,k − m̄_A): spostamento delle vendite verso chiavi più o meno marginose; le chiavi nuove entrano qui col loro margine.' },
  { key: 'listino', label: 'Listino', art: 'il listino', def: 'Σ t_B × (listino_B − listino_A) per t, sulle chiavi presenti nei due periodi.' },
  { key: 'sconti', label: 'Sconti', art: 'gli sconti', plural: true, def: 'Σ t_B × [(prezzo_B − listino_B) − (prezzo_A − listino_A)]: variazione dello sconto medio per t.' },
  { key: 'mpPrezzo', label: 'Prezzo materie prime', art: 'il prezzo delle materie prime', def: '−Σ t_B × Σ_i q_i,B × (π_i,B − π_i,A): stesse ricette, prezzi dei lotti MP diversi.' },
  { key: 'mpRicetta', label: 'Ricette', art: 'le ricette', plural: true, def: '−Σ t_B × Σ_i (q_i,B − q_i,A) × π_i,A: quantità per t degli ingredienti cambiate, ai prezzi di A.' },
  { key: 'calo', label: 'Calo di lavorazione', art: 'il calo di lavorazione', def: '−Σ t_B × (calo_B − calo_A) per t.' },
  { key: 'energiaEfficienza', label: 'Consumi di energia', art: 'i consumi di energia', plural: true, def: '−Σ t_B × [(kWh_B − kWh_A) × €/kWh_A + (GPL_B − GPL_A) × €/kg_A] per t: efficienza delle linee.' },
  { key: 'energiaTariffa', label: 'Tariffe dell’energia', art: 'le tariffe dell’energia', plural: true, def: '−Σ t_B × [kWh_B × (€/kWh_B − €/kWh_A) + GPL_B × (€/kg_B − €/kg_A)] per t.' },
  { key: 'trasformazione', label: 'Trasformazione', art: 'la trasformazione', def: '−Σ t_B × (trasformazione variabile_B − _A) per t.' },
  { key: 'imballi', label: 'Imballi', art: 'gli imballi', plural: true, def: '−Σ t_B × (imballi_B − imballi_A) per t.' },
  { key: 'logistica', label: 'Logistica', art: 'la logistica', level: 'mc2', def: '−Σ t_B × (trasporti_B − trasporti_A) per t (da MdC II).' },
  { key: 'provvigioni', label: 'Provvigioni', art: 'le provvigioni', plural: true, level: 'mc2', def: '−Σ t_B × (provvigioni_B − provvigioni_A) per t (da MdC II).' },
  { key: 'fissi', label: 'Costi fissi', art: 'i costi fissi', plural: true, level: 'ebit', def: '−(F_B − F_A): solo a livello EBIT.' },
  { key: 'altro', label: 'Altre voci', art: 'altre voci', plural: true, def: 'Righe senza tonnellate (rettifiche di ricavo o di costo).' },
];
const STEP = Object.fromEntries(STEP_DEFS.map(s => [s.key, s]));
export const LEVELS = { mc1: 'Margine di contribuzione I', mc2: 'Margine di contribuzione', ebit: 'EBIT' };

/**
 * Ponte da A a B: M_A + Σ effetti = M_B (check < 1e-6 × max(1, |M_B|)).
 * level 'mc1' | 'mc2' | 'ebit' (a EBIT i margini unitari sono di MdC II e i fissi sono un passo a parte).
 * Se un lato di una chiave non ha il dettaglio per ingrediente, le materie prime di quella chiave vanno tutte nel prezzo (collapsed).
 * → {start, end, steps: [{key, label, value}], rows: [{key, tA, tB, mA, mB, MA, MB, <passo>: €, total}], check, level, TA, TB, mBarA, mBarB, collapsed}
 */
export function pvm(A, B, { level = 'mc2' } = {}) {
  const lv = level === 'mc1' ? 'mc1' : level === 'ebit' ? 'ebit' : 'mc2';
  const rA = A?.rows || {}, rB = B?.rows || {};
  const pos = rows => Object.values(rows).filter(r => r.t > EPS);
  const zero = rows => Object.values(rows).filter(r => !(r.t > EPS));
  const VA = sum(pos(rA), r => rowMargin(r, lv)), VB = sum(pos(rB), r => rowMargin(r, lv));
  const ZA = sum(zero(rA), r => rowMargin(r, lv)), ZB = sum(zero(rB), r => rowMargin(r, lv));
  const FA = lv === 'ebit' ? n0(A?.fixed) : 0, FB = lv === 'ebit' ? n0(B?.fixed) : 0;
  const MA = VA + ZA - FA, MB = VB + ZB - FB;
  const TA = sum(pos(rA), r => r.t), TB = sum(pos(rB), r => r.t);
  const mBarA = TA > EPS ? VA / TA : 0;
  const keys = [...new Set([...Object.keys(rA).filter(k => rA[k].t > EPS), ...Object.keys(rB).filter(k => rB[k].t > EPS)])].sort();
  const acc = Object.fromEntries(STEP_DEFS.map(s => [s.key, 0]));
  const rows = [];
  let collapsed = 0;
  for (const k of keys) {
    const a = rA[k]?.t > EPS ? rA[k] : null, b = rB[k]?.t > EPS ? rB[k] : null;
    const e = Object.fromEntries(STEP_DEFS.map(s => [s.key, 0]));
    const mA = a ? rowMargin(a, lv) / a.t : null, mB = b ? rowMargin(b, lv) / b.t : null;
    const tA = a ? a.t : 0, tB = b ? b.t : 0;
    if (a) {
      const sA = TA > EPS ? tA / TA : 0;
      e.volume = (TB - TA) * sA * mBarA;
      e.mix = (tB - TB * sA) * (mA - mBarA);
    } else e.mix = tB * (mB - mBarA);
    if (a && b) {
      const ua = unit(a), ub = unit(b);
      // un lato senza dettaglio per ingrediente (storico, budget, lotti senza composizione): le materie prime si confrontano
      // come un'unica voce, quindi tutta la variazione per t va nel prezzo
      if (detailShare(a) < 0.5 || detailShare(b) < 0.5) { collapse(ua); collapse(ub); collapsed++; }
      e.listino = tB * (ub.L - ua.L);
      e.sconti = tB * ((ub.p - ub.L) - (ua.p - ua.L));
      let pr = 0, rc = 0;
      for (const i of new Set([...Object.keys(ua.q), ...Object.keys(ub.q)])) {
        // ingrediente assente in A: π_A := π_B; assente in B: tutto nella ricetta. Le righe di sola quadratura (€ senza kg) vanno nella ricetta.
        const qA = ua.q[i] || 0, qB = ub.q[i] || 0, cA = ua.ingEurT(i), cB = ub.ingEurT(i);
        const piB = ub.pi[i] ?? ua.pi[i] ?? 0, piA = ua.pi[i] ?? piB;
        pr += qB * (piB - piA);
        rc += (cB - qB * piB) + qB * piA - cA; // = (q_B − q_A) π_A quando i kg ci sono in entrambi
      }
      e.mpPrezzo = -tB * pr; e.mpRicetta = -tB * rc;
      e.calo = -tB * (ub.shrinkT - ua.shrinkT);
      const teB = ub.te ?? ua.te ?? 0, teA = ua.te ?? teB, tgB = ub.tg ?? ua.tg ?? 0, tgA = ua.tg ?? tgB;
      e.energiaEfficienza = -tB * ((ub.e - ua.e) * teA + (ub.g - ua.g) * tgA + (ub.estT - ua.estT));
      e.energiaTariffa = -tB * (ub.e * (teB - teA) + ub.g * (tgB - tgA));
      e.trasformazione = -tB * (ub.varConvT - ua.varConvT);
      e.imballi = -tB * (ub.packT - ua.packT);
      if (lv !== 'mc1') { e.logistica = -tB * (ub.logT - ua.logT); e.provvigioni = -tB * (ub.commT - ua.commT); }
    }
    let total = 0;
    for (const s of STEP_DEFS) { acc[s.key] += e[s.key]; total += e[s.key]; }
    rows.push({ key: k, tA, tB, mA, mB, MA: a ? rowMargin(a, lv) : 0, MB: b ? rowMargin(b, lv) : 0, ...e, total, onlyA: !b, onlyB: !a });
  }
  acc.altro = ZB - ZA;
  acc.fissi = lv === 'ebit' ? -(FB - FA) : 0;
  const steps = STEP_DEFS.filter(s => (!s.level || (s.level === 'mc2' ? lv !== 'mc1' : lv === 'ebit')) && (s.key !== 'altro' || Math.abs(acc.altro) > EPS))
    .map(s => ({ key: s.key, label: s.label, value: acc[s.key], def: s.def }));
  const check = MA + sum(steps, s => s.value) - MB;
  return { start: MA, end: MB, steps, rows, check, level: lv, TA, TB, mBarA, mBarB: TB > EPS ? VB / TB : 0, FA, FB, collapsed };
}

/** Etichette delle chiavi della base (prodotto, specie, cliente, agente). */
export function basisLabel(d, by, k) {
  if (k == null || k === '_') return by === 'agentId' ? 'Senza agente' : 'Non indicato';
  if (by === 'species') return SPECIES[k]?.name || k;
  const coll = { productId: 'products', customerId: 'customers', agentId: 'agents' }[by];
  return (d[coll] || EMPTY).find(x => x.id === k)?.name || k;
}

const kEur = v => nf(v / 1000, 1) + ' k€';
const skEur = v => sf(v / 1000, 1) + ' k€';
const joinIt = a => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);

/**
 * Lettura del ponte in al più 3 frasi sui fattori principali sopra la soglia di materialità
 * max(abs, pct% di |M_A|). opts.vs = «sul mese prima», «sull’anno prima», «sul budget»…
 * Es.: «Margine di contribuzione 104,5 k€ (−8,0 k€ sul mese prima): pesa il prezzo delle materie prime (−4,9 k€).»
 */
export function narrative(res, materiality = { abs: 5000, pct: 2 }, { vs = 'sul periodo di confronto', label } = {}) {
  if (!res) return [];
  const name = label || LEVELS[res.level] || 'Margine';
  const delta = res.end - res.start;
  const thr = Math.max(n0(materiality?.abs ?? 5000), n0(materiality?.pct ?? 2) / 100 * Math.abs(res.start));
  const head = `${name} ${kEur(res.end)} (${skEur(delta)} ${vs})`;
  if (!(res.TA > EPS) && Math.abs(res.start) < EPS) return [`${head}: nel periodo di confronto non ci sono dati, tutto il margine compare come mix.`];
  const big = res.steps.filter(s => Math.abs(s.value) >= thr && Math.abs(s.value) >= 0.5).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (!big.length) return [`${head}: nessun effetto supera la soglia di materialità (${kEur(thr)}).`];
  const it = s => `${STEP[s.key]?.art || s.label.toLowerCase()} (${skEur(s.value)})`;
  const top = big[0], neg = top.value < 0, pl = !!STEP[top.key]?.plural;
  const out = [`${head}: ${neg ? (pl ? 'pesano' : 'pesa') : (pl ? 'aiutano' : 'aiuta')} ${it(top)}.`];
  const same = big.slice(1).filter(s => (s.value < 0) === neg).slice(0, 3);
  const opp = big.slice(1).filter(s => (s.value < 0) !== neg).slice(0, 3);
  if (same.length) out.push(`${neg ? (same.length > 1 || STEP[same[0].key]?.plural ? 'Pesano' : 'Pesa') : (same.length > 1 || STEP[same[0].key]?.plural ? 'Aiutano' : 'Aiuta')} anche ${joinIt(same.map(it))}.`);
  if (opp.length) out.push(`In senso opposto ${joinIt(opp.map(it))}.`);
  return out.slice(0, 3);
}
