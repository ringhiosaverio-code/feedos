/* FeedOS 17 · Costo pieno di oggi per tonnellata, margini e prezzi minimi.
 * Calo di lavorazione sul peso uscito: per avere 1 t di prodotto servono 1/(1 − s) t di materie prime, quindi calo = MP × s/(1 − s).
 * Un prodotto senza formula non ha costo: raw, total e margin restano null (incomplete: true), mai un margine fasullo.
 * Il generatore del demo usa una sua copia congelata del calcolo, così i prezzi del demo non si spostano. */
import { formulaCost } from './formulation.js';

const n0 = v => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);

/** Quota di calo sul prodotto finito: shrinkPct/100 → MP × s/(1 − s); fuori da [0, 1) vale 0. */
export function shrinkFactor(product) {
  const s = n0(product?.shrinkPct) / 100;
  return s > 0 && s < 1 ? s / (1 - s) : 0;
}

/**
 * Costo €/t di un prodotto finito: materie prime + calo + energia + trasformazione + imballo + logistica.
 * overrides: prezzi delle materie prime {ingId: €/t} (scenari); overrides.fixConv divide la trasformazione in variabile e fissa
 * (true: dalla trasformazione variabile del prodotto, varProcessCost; un numero: quota fissa in €/t) e aggiunge la voce «Trasformazione fissa».
 */
export function productCost(product, formula, ingById, line, energy, overrides) {
  const { fixConv, ...prices } = overrides || {};
  const kwh = n0(line?.kwhPerT), gpl = n0(line?.gplKgPerT);
  const en = kwh * n0(energy?.kwhPrice) + gpl * n0(energy?.gplPrice);
  const proc = n0(product?.processCost);
  const procVar = Number.isFinite(+fixConv) && typeof fixConv === 'number' ? Math.max(0, proc - fixConv)
    : product?.varProcessCost != null && product.varProcessCost !== '' && Number.isFinite(+product.varProcessCost) ? Math.min(proc, +product.varProcessCost) : proc;
  const procFix = proc - procVar;
  const pack = n0(product?.packCost);
  const logi = n0(product?.logisticsCost);
  const price = n0(product?.listPrice);
  const split = fixConv != null && fixConv !== false;
  const procParts = split ? [{ k: 'Trasformazione', v: procVar }, { k: 'Trasformazione fissa', v: procFix }] : [{ k: 'Trasformazione', v: proc }];
  if (!formula) {
    // senza formula: niente costo né margine (incompleto), restano le voci note per la scheda
    return {
      raw: null, shrink: null, energy: en, processing: proc, processingVar: procVar, processingFix: procFix, packaging: pack, logistics: logi, total: null,
      price, margin: null, marginPct: null, minPrice: null, targetPrice: null, incomplete: true,
      parts: [{ k: 'Energia', v: en }, ...procParts, { k: 'Imballo', v: pack }, { k: 'Logistica', v: logi }],
    };
  }
  const raw = formulaCost(formula.lines || [], ingById, Object.keys(prices).length ? prices : undefined);
  const shrink = raw * shrinkFactor(product);
  const total = raw + shrink + en + proc + pack + logi;
  const margin = price - total;
  return {
    raw, shrink, energy: en, processing: proc, processingVar: procVar, processingFix: procFix, packaging: pack, logistics: logi, total,
    price, margin, marginPct: price > 0 ? margin / price : null,
    minPrice: minPrice(total, product.minMarginPct), targetPrice: minPrice(total, product.targetMarginPct), incomplete: false,
    parts: [
      { k: 'Materie prime', v: raw }, { k: 'Calo di lavorazione', v: shrink }, { k: 'Energia', v: en },
      ...procParts, { k: 'Imballo', v: pack }, { k: 'Logistica', v: logi },
    ],
  };
}

/** Prezzo minimo per ottenere un margine percentuale sul prezzo (null senza costo o con margine ≥ 100%). */
export function minPrice(cost, marginPct) {
  if (cost == null || !Number.isFinite(+cost)) return null;
  const m = (+marginPct || 0) / 100;
  return m >= 1 ? null : cost / (1 - m);
}

/**
 * Valutazione di un'offerta: margine unitario e totale rispetto al costo pieno corrente.
 * Con un costo incompleto (prodotto senza formula) margine e totale sono null e incomplete è true; lo stato resta 'ok'
 * perché non c'è un prezzo minimo con cui confrontare.
 */
export function offerCheck(offer, cost, product) {
  const price = +offer.price || 0;
  if (cost?.total == null) return { price, margin: null, marginPct: null, total: null, minPrice: null, status: 'ok', incomplete: true };
  const margin = price - cost.total;
  const mp = price > 0 ? margin / price : null;
  const min = cost.minPrice;
  let status = 'ok';
  if (mp != null && mp < (+product.minMarginPct || 0) / 100 - 1e-9) status = 'sotto-minimo';
  else if (mp != null && mp < (+product.targetMarginPct || 0) / 100 - 1e-9) status = 'sotto-obiettivo';
  return { price, margin, marginPct: mp, total: margin * (+offer.tonnes || 0), minPrice: min, status };
}
