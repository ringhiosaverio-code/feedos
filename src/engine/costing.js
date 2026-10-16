/* FeedOS 16 · Costo pieno per tonnellata, margini e prezzi minimi. */
import { formulaCost } from './formulation.js';

/** Costo €/t di un prodotto finito: materie prime + calo + energia + trasformazione + imballo + logistica. */
export function productCost(product, formula, ingById, line, energy, overrides) {
  const raw = formula ? formulaCost(formula.lines, ingById, overrides) : 0;
  const shrink = raw * (+product.shrinkPct || 0) / 100;
  const kwh = +line?.kwhPerT || 0, gpl = +line?.gplKgPerT || 0;
  const en = kwh * (+energy?.kwhPrice || 0) + gpl * (+energy?.gplPrice || 0);
  const proc = +product.processCost || 0;
  const pack = +product.packCost || 0;
  const logi = +product.logisticsCost || 0;
  const total = raw + shrink + en + proc + pack + logi;
  const price = +product.listPrice || 0;
  const margin = price - total;
  return {
    raw, shrink, energy: en, processing: proc, packaging: pack, logistics: logi, total,
    price, margin, marginPct: price > 0 ? margin / price : null,
    minPrice: minPrice(total, product.minMarginPct), targetPrice: minPrice(total, product.targetMarginPct),
    parts: [
      { k: 'Materie prime', v: raw }, { k: 'Calo di lavorazione', v: shrink }, { k: 'Energia', v: en },
      { k: 'Trasformazione', v: proc }, { k: 'Imballo', v: pack }, { k: 'Logistica', v: logi },
    ],
  };
}

/** Prezzo minimo per ottenere un margine percentuale sul prezzo. */
export function minPrice(cost, marginPct) {
  const m = (+marginPct || 0) / 100;
  return m >= 1 ? null : cost / (1 - m);
}

/** Valutazione di un'offerta: margine unitario e totale rispetto al costo pieno corrente. */
export function offerCheck(offer, cost, product) {
  const price = +offer.price || 0;
  const margin = price - cost.total;
  const mp = price > 0 ? margin / price : null;
  const min = cost.minPrice;
  let status = 'ok';
  if (mp != null && mp < (+product.minMarginPct || 0) / 100 - 1e-9) status = 'sotto-minimo';
  else if (mp != null && mp < (+product.targetMarginPct || 0) / 100 - 1e-9) status = 'sotto-obiettivo';
  return { price, margin, marginPct: mp, total: margin * (+offer.tonnes || 0), minPrice: min, status };
}
