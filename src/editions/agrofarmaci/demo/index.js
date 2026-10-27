/* FitoOS · archivi di partenza dell'edizione agrofarmaci (provvisorio: archivio vuoto con il settore). */
import { emptyData } from '../../../core/schema.js';
import { todayLocal } from '../../../core/util.js';

export const AGRO_DEMO_VERSION = 1;
export function starterData() {
  const d = emptyData();
  d.settings = { ...d.settings, dataset: 'proprio', company: { ...d.settings.company, name: 'La mia azienda', short: 'Agrofarmaci', sector: 'agrofarmaci' } };
  return d;
}
export function demoData(today = todayLocal()) {
  const d = starterData();
  d.settings = { ...d.settings, dataset: 'demo', demoAnchor: today, demoVersion: AGRO_DEMO_VERSION, company: { ...d.settings.company, name: 'Arvale Dimostrativa S.p.A.', short: 'Arvale Demo', sector: 'agrofarmaci' } };
  return d;
}
export function upgradeDemo(d) { return d; }
