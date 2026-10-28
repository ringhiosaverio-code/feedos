/* DifesaOS · archivi di partenza dell'edizione agrofarmaci: azienda dimostrativa inventata «Arvale Dimostrativa S.p.A.»
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

/**
 * Passi di aggiornamento di un demo salvato da una versione precedente dell'edizione (settings.demoVersion), dopo migrateData:
 * ogni passo aggiunge con i suoi estensori (stesso seme, stessa data del demo), non cancella.
 */
export const AGRO_DEMO_UPGRADES = [
  { to: 2, label: 'prove di campo, illustrazioni e prezzi della concorrenza', up: d => applyDemoExtenders(d, d.settings.demoAnchor || todayLocal(), 26, { only: ['prove'], list: AGRO_EXTENDERS }) },
];

/** Demo di una versione precedente: applica i passi mancanti senza toccare il resto. */
export function upgradeDemo(d) {
  const v = d?.settings?.dataset === 'demo' ? d.settings.demoVersion || 1 : AGRO_DEMO_VERSION;
  if (v >= AGRO_DEMO_VERSION) return d;
  let out = d;
  for (const step of AGRO_DEMO_UPGRADES) if (step.to > v && step.to <= AGRO_DEMO_VERSION) out = step.up(out);
  return { ...out, settings: { ...out.settings, demoVersion: AGRO_DEMO_VERSION } };
}
