/* FeedOS 16 · Bozza di cartellino (Reg. CE 767/2009, all. VI capo II: componenti analitici obbligatori
 * per i mangimi composti destinati ad animali da produzione alimentare). Da verificare con l'ufficio tecnico. */
import { profile, SPECIES } from './nutrients.js';

const ADDITIVES_PER_KG_PREMIX = [ // tenori dimostrativi della premiscela (per kg di premiscela)
  ['Vitamina A (3a672a)', 2000000, 'UI'], ['Vitamina D3 (3a671)', 400000, 'UI'], ['Vitamina E (3a700)', 6000, 'mg'],
  ['Rame (3b405, solfato rameico pentaidrato)', 3000, 'mg'], ['Zinco (3b605, solfato di zinco monoidrato)', 16000, 'mg'],
  ['Manganese (3b502, ossido manganoso)', 10000, 'mg'], ['Iodio (3b202, iodato di calcio anidro)', 200, 'mg'], ['Selenio (3b801, selenito di sodio)', 60, 'mg'],
];

export function labelFor({ product, formula, spec, ingById, company, lot, today }) {
  const sp = SPECIES[spec?.species || formula?.species] || { name: 'animali', labelGroup: 'altre' };
  const kind = spec?.kind === 'completo' ? 'Mangime completo' : 'Mangime complementare';
  const prof = profile(formula.lines, ingById);
  const lines = [...formula.lines].sort((a, b) => b.kg - a.kg);
  const composition = lines.filter(l => ingById[l.ing]?.category !== 'premix').map(l => ({ name: ingById[l.ing]?.label || ingById[l.ing]?.name, pct: l.kg / 10 }));
  const premixKg = lines.filter(l => ingById[l.ing]?.category === 'premix').reduce((s, l) => s + l.kg, 0);
  const g = sp.labelGroup;
  const r = (v, d) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
  const an = [
    ['Proteina grezza', r(prof.PG, 1), '%'], ['Grassi grezzi', r(prof.GG, 1), '%'], ['Fibra grezza', r(prof.FG, 1), '%'], ['Ceneri grezze', r(prof.CE, 1), '%'],
  ];
  const complete = spec?.kind === 'completo';
  const caOk = complete || (prof.CA ?? 0) >= 5, pOk = complete || (prof.P ?? 0) >= 2;
  if (caOk) an.push(['Calcio', r(prof.CA, 2), '%']);
  if (pOk) an.push(['Fosforo', r(prof.P, 2), '%']);
  an.push(['Sodio', r(prof.NA, 2), '%']);
  if (g === 'suini' || g === 'pollame') { an.push(['Lisina', r(prof.LYS, 2), '%']); an.push(['Metionina', r(prof.MET, 2), '%']); }
  if (g === 'ruminanti' && !complete && (prof.MG ?? 0) >= 0.5) an.push(['Magnesio', r(prof.MG, 2), '%']);
  const moisture = prof.SS != null ? 100 - prof.SS : null;
  if (moisture != null && moisture > 14) an.push(['Umidità', r(moisture, 1), '%']);
  const additives = premixKg > 0 ? ADDITIVES_PER_KG_PREMIX.map(([n, v, u]) => { const x = v * premixKg / 1000; return { name: n, value: x >= 100 ? Math.round(x) : Math.round(x * 100) / 100, unit: `${u}/kg` }; }) : [];
  return {
    title: `${kind} per ${sp.name.toLowerCase()}`,
    name: product?.name || formula.name,
    composition, analytical: an.map(([name, value, unit]) => ({ name, value, unit })), additives,
    use: complete ? 'Somministrare a volontà o secondo il piano alimentare.' : `Somministrare in integrazione alla razione di base secondo le indicazioni del tecnico.`,
    lot: lot?.code || 'Vedi confezione', netWeight: product?.packaging === 'Sacchi 25 kg' ? '25 kg' : 'Vedi documento di trasporto',
    bestBefore: lot ? addMonths(lot.date, product?.packaging === 'Sfuso' ? 3 : 6) : null,
    approval: company?.approval || '', responsible: `${company?.name || ''} · ${company?.address || ''}`,
    moistureNote: 'L’umidità va dichiarata solo se supera il 14% (mangimi composti diversi da minerali e sostitutivi del latte).',
    disclaimer: 'Bozza generata dalla formula: verificare denominazioni, additivi e tenori con la scheda della premiscela e la normativa vigente.',
  };
}
function addMonths(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, d)); return t.toISOString().slice(0, 10); }
