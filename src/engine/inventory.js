/* FeedOS 17 · Rimanenze: valorizzazione, classi ABC/XYZ, lenti ed eccedenze (pacchetto WP2).
 * Contratto della fondazione: le firme esportate restano queste; il pacchetto ne scrive il contenuto. */
import { inventoryValuation, makeIndex, costsOf } from './actuals.js';

/** Sintesi delle rimanenze: MP al FIFO e prodotto finito al costo pieno effettivo (da actuals); il resto lo calcola il pacchetto. */
export function inventorySummary(d, ctx, P) {
  const shipped = {};
  for (const s of d.shipments || []) shipped[s.lotId] = (shipped[s.lotId] || 0) + (+s.tonnes || 0);
  const ix = ctx?.ix || makeIndex(d);
  const v = inventoryValuation(d, { ix, costsToday: ctx?.costs || costsOf(d, ix), shipped });
  return { mpFifo: v.mp.fifo, fgValue: v.fg.valueFull, dio: null, excessValue: 0, carryingCost: 0 };
}

/** Classi ABC (valore consumato) e XYZ (variabilità) per materia prima: {ingId: {abc, xyz, value, share, cv}}. */
export function abcXyz(d, ctx, P) { return {}; }
