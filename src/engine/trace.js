/* FeedOS 16 · Tracciabilità a monte e a valle (Reg. CE 178/2002 art. 18, Reg. CE 183/2005)
 * e simulazione di richiamo con bilancio di massa. */

export function buildIndex(d) {
  const usedIn = new Map();      // lotto materia prima -> [{lot, kg}]
  for (const lot of d.lots) for (const c of lot.comp || []) {
    if (!usedIn.has(c.l)) usedIn.set(c.l, []);
    usedIn.get(c.l).push({ lot: lot.id, kg: c.kg });
  }
  const shipped = new Map();     // lotto prodotto -> [spedizioni]
  for (const s of d.shipments) {
    if (!shipped.has(s.lotId)) shipped.set(s.lotId, []);
    shipped.get(s.lotId).push(s);
  }
  const lotById = new Map(d.lots.map(l => [l.id, l]));
  const ingLotById = new Map(d.ingLots.map(l => [l.id, l]));
  return { usedIn, shipped, lotById, ingLotById };
}

/** A monte: da un lotto di prodotto ai lotti di materia prima e ai fornitori. */
export function backward(ix, lotId) {
  const lot = ix.lotById.get(lotId);
  if (!lot) return null;
  return {
    lot,
    inputs: (lot.comp || []).map(c => ({ ...c, ingLot: ix.ingLotById.get(c.l) })).sort((a, b) => b.kg - a.kg),
    shipments: ix.shipped.get(lotId) || [],
  };
}

/** Richiamo: a partire da lotti di materia prima e/o lotti di prodotto. */
export function recall(ix, { ingLots = [], lots = [] }) {
  const affected = new Map(); // lotId -> {lot, kgFromSource}
  let ingKgUsed = 0;
  for (const il of ingLots) {
    for (const u of ix.usedIn.get(il) || []) {
      const prev = affected.get(u.lot);
      affected.set(u.lot, { lot: ix.lotById.get(u.lot), kg: (prev?.kg || 0) + u.kg });
      ingKgUsed += u.kg;
    }
  }
  for (const l of lots) if (!affected.has(l)) affected.set(l, { lot: ix.lotById.get(l), kg: null });
  const customers = new Map();
  let shippedT = 0, producedT = 0;
  const lotRows = [];
  for (const { lot, kg } of affected.values()) {
    if (!lot) continue;
    producedT += +lot.tonnes || 0;
    const sh = ix.shipped.get(lot.id) || [];
    const lotShipped = sh.reduce((s, x) => s + (+x.tonnes || 0), 0);
    shippedT += lotShipped;
    for (const s of sh) {
      if (!customers.has(s.customerId)) customers.set(s.customerId, { customerId: s.customerId, tonnes: 0, shipments: [] });
      const c = customers.get(s.customerId);
      c.tonnes += +s.tonnes || 0; c.shipments.push(s);
    }
    lotRows.push({ lot, kgFromSource: kg, shipped: lotShipped, inStock: Math.max(0, (+lot.tonnes || 0) - lotShipped) });
  }
  lotRows.sort((a, b) => (a.lot.date < b.lot.date ? -1 : 1));
  const received = ingLots.reduce((s, id) => s + (+ix.ingLotById.get(id)?.tonnes || 0), 0);
  const remainingIng = ingLots.reduce((s, id) => s + (+ix.ingLotById.get(id)?.remaining || 0), 0);
  return {
    lots: lotRows,
    customers: [...customers.values()].sort((a, b) => b.tonnes - a.tonnes),
    producedT, shippedT, inStockT: Math.max(0, producedT - shippedT),
    massBalance: ingLots.length ? { received, used: ingKgUsed / 1000, remaining: remainingIng, gap: received - ingKgUsed / 1000 - remainingIng } : null,
    first: lotRows[0]?.lot.date, last: lotRows[lotRows.length - 1]?.lot.date,
  };
}
