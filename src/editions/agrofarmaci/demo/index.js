/* FitoOS · archivi di partenza dell'edizione agrofarmaci: azienda dimostrativa inventata «Arvale Dimostrativa S.p.A.»
 * (generatore più estensori dell'edizione) e archivio vuoto con il settore e le linee tipiche. */
import { generateAgroDemo, AGRO_DEMO_VERSION } from './generator.js';
import { AGRO_EXTENDERS } from './extenders.js';
import { applyDemoExtenders } from '../../../data/demo/extend.js';
import { INGREDIENTS_AGRO, LINES_AGRO } from './catalog.js';
import { emptyData } from '../../../core/schema.js';
import { todayLocal } from '../../../core/util.js';

export { AGRO_DEMO_VERSION };

/** Demo alla data indicata (giorno locale): generatore più gli estensori dell'edizione. */
export function demoData(today = todayLocal()) {
  const d = applyDemoExtenders(generateAgroDemo({ today }), today, 26, { list: AGRO_EXTENDERS });
  return { ...d, settings: { ...d.settings, signalState: {} }, events: [] };
}

/** Archivio senza movimenti: materie prime di esempio (da verificare) e le tre linee tipiche di formulazione. */
export function starterData() {
  const d = emptyData();
  d.settings = { ...d.settings, dataset: 'proprio', company: { ...d.settings.company, name: 'La mia azienda', short: 'Agrofarmaci', sector: 'agrofarmaci' } };
  d.ingredients = INGREDIENTS_AGRO.map(i => ({ ...i, stock: 0, supplier: '' }));
  d.lines = LINES_AGRO.map(l => ({ ...l }));
  return d;
}

/** Un demo salvato da una versione precedente dell'edizione si rigenera alla stessa data (nessun passo intermedio ancora). */
export function upgradeDemo(d) { return d; }
