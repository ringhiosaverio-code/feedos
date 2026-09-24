/* FeedOS 16 · struttura dell'archivio (senza dipendenze: usabile anche nei test). */
export const COLLECTIONS = ['ingredients', 'specs', 'formulas', 'products', 'lines', 'customers', 'agents', 'ingLots', 'lots', 'runs', 'shipments',
  'complaints', 'market', 'purchases', 'plan', 'energy', 'visits', 'offers', 'tasks', 'scenarios', 'events'];

export function emptyData() {
  const d = { settings: { schema: 16, dataset: 'vuoto', company: { name: 'Il mio mangimificio', short: 'Mangimificio', site: '', approval: '', address: '' }, energy: { kwhPrice: 0.19, gplPrice: 0.98, feGrid: 0.3769, feGpl: 3.0115 }, milkPrice: 0.54, role: 'direzione', signalState: {} }, esgManual: {} };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

