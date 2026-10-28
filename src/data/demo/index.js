/* FeedOS 17 · archivi di partenza: mangimificio dimostrativo (dati inventati) e archivio vuoto con il catalogo di base.
 * Le preferenze d'interfaccia (tema, dimensione, vista) non stanno più nei dati: vedi core/prefs.js. */
import { generateDemo, DEMO_VERSION } from './generator.js';
import { demoSustainability } from './sustainability.js';
import { applyDemoExtenders, ESG18_EXTENDERS } from './extend.js';
import { INGREDIENTS, SPECS } from './catalog.js';
import { emptyData } from '../../core/schema.js';
import { todayLocal, round } from '../../core/util.js';

/** Demo alla data indicata (giorno locale): generatore (schema 17) più i dati dei pacchetti (extend.js). */
export function demoData(today = todayLocal()) {
  const d = applyDemoExtenders(generateDemo({ today }), today);
  return { ...d, settings: { ...d.settings, signalState: {} }, events: [] };
}

/** Archivio senza movimenti: materie prime e specifiche di esempio (da verificare), una linea per tipo. */
export function starterData() {
  const d = emptyData();
  d.settings = { ...d.settings, dataset: 'proprio' };
  d.ingredients = INGREDIENTS.map(i => ({ ...i, stock: 0, supplier: '', nutr: { ...i.nutr }, contam: { ...i.contam } }));
  d.specs = SPECS.map(s => ({ ...s, constraints: s.constraints.map(c => ({ ...c })) }));
  d.lines = [
    { id: 'L1', code: 'P1', name: 'Linea pellet', kind: 'pellet', capacityTph: 10, hoursWeek: 40, kwhPerT: 22, gplKgPerT: 2.5, color: 1 },
    { id: 'L2', code: 'F1', name: 'Linea farine', kind: 'farina', capacityTph: 12, hoursWeek: 24, kwhPerT: 8, gplKgPerT: 0, color: 3 },
  ];
  return d;
}

/** Rettifiche che chiudono il bilancio di massa dei lotti MP tagliati a mano dai demo fino alla versione 2 (solo aggiunte). */
export function closingAdjustments(d, date) {
  const used = {}, adj = {};
  for (const l of d.lots || []) for (const c of l.comp || []) used[c.l] = (used[c.l] || 0) + (+c.kg || 0) / 1000;
  for (const a of d.adjustments || []) adj[a.ingLotId] = (adj[a.ingLotId] || 0) + (+a.tonnes || 0);
  const ids = new Set((d.adjustments || []).map(a => a.id));
  const out = [];
  for (const l of d.ingLots || []) {
    const gap = round((+l.tonnes || 0) - (+l.remaining || 0) - (used[l.id] || 0) + (adj[l.id] || 0), 4);
    if (gap <= 0.01) continue;
    let n = out.length + 1; while (ids.has('adj-u' + n)) n++;
    ids.add('adj-u' + n);
    out.push({ id: 'adj-u' + n, date, ingId: l.ingId, ingLotId: l.id, tonnes: -gap, reason: 'inventario', note: 'Rettifica inventariale (dato dimostrativo)' });
  }
  return out;
}

/**
 * Passi di aggiornamento di un archivio dimostrativo salvato da una versione precedente (settings.demoVersion),
 * applicati in ordine dopo migrateData (le raccolte dello schema corrente ci sono già). Ogni passo aggiunge, non cancella.
 */
export const DEMO_UPGRADES = [
  {
    to: 2, label: 'acqua, rifiuti e questionario',
    up(d) {
      const s = demoSustainability({ today: d.settings.demoAnchor || todayLocal(), runs: d.runs || [] });
      return { ...d, water: d.water?.length ? d.water : s.water, waste: d.waste?.length ? d.waste : s.waste, survey: d.survey && Object.keys(d.survey).length ? d.survey : s.survey };
    },
  },
  {
    to: 3, label: 'rettifiche di inventario, centri di costo e costi fissi',
    up(d) {
      const today = d.settings.demoAnchor || todayLocal();
      const adj = closingAdjustments(d, today);
      const base = adj.length ? { ...d, adjustments: [...(d.adjustments || []), ...adj] } : d;
      return applyDemoExtenders(base, today, 16, { only: ['costs'] });
    },
  },
  {
    // elenco esplicito: gli estensori aggiunti dopo (ESG 18) girano solo nel loro passo, mai due volte
    to: 4, label: 'direzione, finanza, redditività, commerciale, acquisti, produzione e obiettivi',
    up(d) { return applyDemoExtenders(d, d.settings.demoAnchor || todayLocal(), 16, { only: ['commerciale', 'acquisti', 'produzione', 'finanza', 'redditivita', 'direzione', 'piattaforma'] }); },
  },
  {
    to: 5, label: 'ESG 18: clima, impronta, filiera, ambiente, persone, governance, rischi, piano, report',
    up(d) { return applyDemoExtenders(d, d.settings.demoAnchor || todayLocal(), 16, { only: ESG18_EXTENDERS }); },
  },
];

/** Archivio dimostrativo di una versione precedente: applica i passi mancanti senza toccare il resto. */
export function upgradeDemo(d) {
  const v = d?.settings?.dataset === 'demo' ? d.settings.demoVersion || 1 : DEMO_VERSION;
  if (v >= DEMO_VERSION) return d;
  let out = d;
  for (const step of DEMO_UPGRADES) if (step.to > v && step.to <= DEMO_VERSION) out = step.up(out);
  return { ...out, settings: { ...out.settings, demoVersion: DEMO_VERSION } };
}
