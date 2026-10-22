/* FeedOS 17 · Voci del menu principale e schede di ogni area (derivate da areas.js). */
import { AREA_DEFS } from './areas.js';

export const NAV = Object.fromEntries(AREA_DEFS.map(a => [a.id, { icon: a.icon, label: a.label, tabs: a.tabs, period: a.period }]));
export function tabOf(area, tab) { const t = NAV[area]?.tabs || []; return t.find(x => x.id === tab)?.id || t[0]?.id || null; }
