/* FeedOS 16 · importazione da FeedOS 15: backup completo «feedos-workspace-7» oppure progetto di formulazione 6.1.
 * Si importa ciò che ha un corrispondente certo; il resto viene elencato e non inventato. */
import { emptyData } from './schema.js';
import { uid, round } from './util.js';

const NUT_MAP = { protein: 'PG', proteina: 'PG', pg: 'PG', cp: 'PG', fat: 'GG', grassi: 'GG', gg: 'GG', ee: 'GG', fiber: 'FG', fibre: 'FG', fibra: 'FG', fg: 'FG', cf: 'FG', ash: 'CE', ceneri: 'CE', ce: 'CE',
  starch: 'AM', amido: 'AM', ndf: 'NDF', ufl: 'UFL', en: 'EN', ne: 'EN', me: 'EM', em: 'EM', de: 'ED', ed: 'ED', lys: 'LYS', lysine: 'LYS', lisina: 'LYS', met: 'MET', methionine: 'MET', metionina: 'MET',
  metcys: 'MC', mc: 'MC', thr: 'THR', threonine: 'THR', treonina: 'THR', ca: 'CA', calcium: 'CA', calcio: 'CA', p: 'P', phosphorus: 'P', fosforo: 'P', na: 'NA', sodium: 'NA', sodio: 'NA', mg: 'MG', magnesium: 'MG', magnesio: 'MG' };
const mapNut = k => NUT_MAP[String(k).toLowerCase().replace(/[^a-z]/g, '')] || null;

export function detectF15(j) {
  if (j && j.schema === 'feedos-workspace-7' && j.workspace) return 'backup';
  if (j && (j.schemaVersion || j.materials) && Array.isArray(j.materials)) return 'project';
  return null;
}

export function migrateF15(j, base = emptyData()) {
  const kind = detectF15(j);
  if (!kind) throw new Error('Il file non sembra un backup o un progetto di FeedOS 15.');
  const project = kind === 'backup' ? j.project : j;
  const ws = kind === 'backup' ? j.workspace : null;
  const d = { ...base, settings: { ...base.settings, dataset: 'proprio', importedFrom: 'FeedOS 15', importedAt: new Date().toISOString() } };
  const report = [], skipped = [];
  const unmapped = new Set();
  // materie prime
  const ings = [];
  for (const m of project?.materials || []) {
    const nutr = {};
    for (const [k, v] of Object.entries(m.values || {})) { const id = mapNut(k); if (id && v !== '' && v != null && Number.isFinite(+v)) nutr[id] = m.basis === 'DM' && m.dm ? round(+v * m.dm / 100, 3) : +v; else unmapped.add(k); }
    ings.push({ id: uid('mp'), code: 'MP' + String(ings.length + 1).padStart(2, '0'), name: String(m.name || 'Materia prima').slice(0, 80), label: String(m.name || '').slice(0, 80), category: guessCat(m.name), dm: +m.dm || 88,
      nutr, price: +m.price || 0, ef: m.ef != null && m.ef !== '' ? +m.ef : null, maxKg: m.max != null && m.max !== '' ? +m.max : null, stock: +m.stock || 0, active: true, origin: m.efGeo || '', supplier: '', leadDays: 7, safetyDays: 10, contam: {}, note: m.source || '' });
  }
  if (ings.length) { d.ingredients = ings; report.push(['Materie prime', ings.length]); }
  // specifica e formula dal progetto
  const cons = (project?.nutrients || []).map(n => ({ nut: mapNut(n.id) || mapNut(n.label), min: n.min ?? null, max: n.max ?? null, basis: n.basis === 'DM' ? 'ss' : 'tq', raw: n })).filter(c => { if (!c.nut) unmapped.add(c.raw.id); return !!c.nut; }).map(({ raw, ...c }) => c);
  if (cons.length) {
    const ingLimits = {};
    (project.materials || []).forEach((m, i) => { const lim = {}; if (m.min) lim.min = +m.min; if (m.max != null && m.max !== '') lim.max = +m.max; if (Object.keys(lim).length) ingLimits[ings[i].id] = lim; });
    const spec = { id: uid('sp'), name: `${project.name || 'Progetto FeedOS 15'} · specifica`, species: 'bovini-carne', kind: 'completo', constraints: cons, ratios: [], ingLimits, groups: [], note: project.specSource || '' };
    d.specs = [spec, ...(d.specs || [])];
    report.push(['Specifiche nutrizionali', 1]);
    const lines = (project.materials || []).map((m, i) => ({ ing: ings[i].id, kg: +m.base || 0 })).filter(l => l.kg > 0);
    if (lines.length) {
      d.formulas = [{ id: uid('fo'), code: 'F-IMP-01', name: project.name || 'Formula importata', specId: spec.id, species: spec.species, status: 'bozza', version: 0, lines, draft: lines, history: [], approvedAt: null, approvedCost: null }, ...(d.formulas || [])];
      report.push(['Formule (in bozza, da verificare)', 1]);
    }
  }
  // indicatori ESG
  if (ws?.kpis) {
    const esg = {};
    for (const [code, r] of Object.entries(ws.kpis)) if (r && r.value != null && r.value !== '') esg[code] = r.value;
    d.esgManual = { ...(d.esgManual || {}), ...esg };
    if (Object.keys(esg).length) report.push(['Valori degli indicatori ESG', Object.keys(esg).length]);
  }
  if (ws) for (const [k, label] of [['products', 'prodotti del listino'], ['quotes', 'preventivi'], ['production', 'registrazioni di produzione'], ['offers', 'offerte dei fornitori'], ['actions', 'azioni del piano ESG']]) if (Array.isArray(ws[k]) && ws[k].length) skipped.push(`${ws[k].length} ${label}`);
  if (unmapped.size) skipped.push(`parametri senza corrispondenza: ${[...unmapped].slice(0, 8).join(', ')}`);
  d.events = [{ id: uid('ev'), at: new Date().toISOString(), role: base.settings?.role || 'direzione', label: 'Importazione da FeedOS 15', coll: 'archivio' }];
  return { data: d, report, skipped, kind };
}
function guessCat(n) {
  const s = String(n || '').toLowerCase();
  if (/mais|orzo|frument|sorgo|avena|triticale|cereal/.test(s)) return 'cereale';
  if (/soia|girasole|colza|pisell|favin|proteic|lupin/.test(s)) return 'proteico';
  if (/crusca|farinaccio|polpe|ddgs|borland|glutine|melass|co-?prod/.test(s)) return 'coprodotto';
  if (/olio|grass/.test(s)) return 'grasso';
  if (/carbonat|fosfat|sale|cloruro|bicarbonat|ossido|minerale/.test(s)) return 'minerale';
  if (/lisina|metionina|treonina|triptofano/.test(s)) return 'aminoacido';
  if (/premix|premiscela|integratore|vitamin/.test(s)) return 'premix';
  if (/medica|fieno|paglia|foragg/.test(s)) return 'foraggio';
  return 'cereale';
}
