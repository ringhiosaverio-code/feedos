/* FeedOS 17 · Ruoli: cambiano l'ordine del menu e ciò che la pagina «Oggi» mette in primo piano.
 * Non sono permessi di sicurezza: nella versione locale chiunque usi il browser vede tutti i dati.
 * top = voci in testa al menu prima del gruppo «Reparti». */
import { AREA_DEFS } from '../app/areas.js';
import { AREA_IDS } from './areaIds.js';
import { META } from '../editions/meta.js';

const BASE_ROLES = [
  { id: 'direzione', label: 'Direzione', short: 'Direzione', top: 3, areas: ['oggi', 'direzione', 'finanza', 'economia', 'commerciale', 'acquisti', 'produzione', 'qualita', 'gemello', 'formulazione', 'esg', 'dati'] },
  { id: 'formulazione', label: 'Formulazione e nutrizione', short: 'Formulazione', areas: ['oggi', 'formulazione', 'acquisti', 'qualita', 'economia', 'produzione', 'esg', 'gemello', 'commerciale', 'direzione', 'finanza', 'dati'] },
  { id: 'acquisti', label: 'Acquisti e magazzino', short: 'Acquisti', areas: ['oggi', 'acquisti', 'formulazione', 'produzione', 'economia', 'qualita', 'gemello', 'commerciale', 'esg', 'direzione', 'finanza', 'dati'] },
  { id: 'produzione', label: 'Produzione', short: 'Produzione', areas: ['oggi', 'produzione', 'gemello', 'acquisti', 'qualita', 'formulazione', 'esg', 'economia', 'commerciale', 'direzione', 'finanza', 'dati'] },
  { id: 'qualita', label: 'Qualità e sicurezza alimentare', short: 'Qualità', areas: ['oggi', 'qualita', 'produzione', 'formulazione', 'acquisti', 'commerciale', 'esg', 'gemello', 'economia', 'direzione', 'finanza', 'dati'] },
  { id: 'commerciale', label: 'Commerciale', short: 'Commerciale', areas: ['oggi', 'commerciale', 'economia', 'qualita', 'produzione', 'gemello', 'formulazione', 'acquisti', 'esg', 'direzione', 'finanza', 'dati'] },
  { id: 'agente', label: 'Agente di zona', short: 'Agente', areas: ['oggi', 'commerciale', 'qualita', 'esg', 'gemello'] },
];
/** Ruoli dell'edizione (META.roles) o di base, con le sole aree presenti nell'edizione. */
export const ROLES = (META.roles || BASE_ROLES).map(r => ({ ...r, areas: r.areas.filter(a => AREA_IDS.includes(a)) }));
export const ROLE = Object.fromEntries(ROLES.map(r => [r.id, r]));
/** Aree che la vista Agente non apre nemmeno da un indirizzo diretto. */
export const AGENT_HIDDEN = ['direzione', 'finanza', 'economia'];

export const AREA_META = Object.fromEntries(AREA_DEFS.map(a => [a.id, { label: a.label, lead: a.lead }]));
