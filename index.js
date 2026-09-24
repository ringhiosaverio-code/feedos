/* FeedOS 16 · archivi di partenza: mangimificio dimostrativo (dati inventati) e archivio vuoto con il catalogo di base. */
import { generateDemo } from './generator.js';
import { INGREDIENTS, SPECS } from './catalog.js';
import { emptyData } from '../../core/schema.js';
import { iso } from '../../core/util.js';

export function demoData(today = iso(new Date())) {
  const d = generateDemo({ today });
  return { ...d, settings: { ...d.settings, role: 'direzione', signalState: {}, theme: 'auto', size: 'normale' }, events: [] };
}

/** Archivio senza movimenti: materie prime e specifiche di esempio (da verificare), una linea per tipo. */
export function starterData(keep = {}) {
  const d = emptyData();
  d.settings = { ...d.settings, dataset: 'proprio', theme: keep.theme || 'auto', size: keep.size || 'normale', role: keep.role || 'direzione' };
  d.ingredients = INGREDIENTS.map(i => ({ ...i, stock: 0, supplier: '', nutr: { ...i.nutr }, contam: { ...i.contam } }));
  d.specs = SPECS.map(s => ({ ...s, constraints: s.constraints.map(c => ({ ...c })) }));
  d.lines = [
    { id: 'L1', code: 'P1', name: 'Linea pellet', kind: 'pellet', capacityTph: 10, hoursWeek: 40, kwhPerT: 22, gplKgPerT: 2.5, color: 1 },
    { id: 'L2', code: 'F1', name: 'Linea farine', kind: 'farina', capacityTph: 12, hoursWeek: 24, kwhPerT: 8, gplKgPerT: 0, color: 3 },
  ];
  return d;
}
