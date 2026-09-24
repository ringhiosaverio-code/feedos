/* Mangimificio dimostrativo · catalogo delle materie prime e delle specifiche.
 * VALORI INDICATIVI a scopo dimostrativo (ordini di grandezza da tabelle di composizione degli alimenti):
 * non sono analisi reali né fabbisogni validati. Prezzi ipotetici in €/t; fattori di emissione indicativi
 * in kg CO₂e/t, dalla coltivazione al cancello del mangimificio, da sostituire con banche dati riconosciute. */

const I = (id, code, name, label, category, dm, nutr, price, ef, extra = {}) => ({
  id, code, name, label, category, dm, nutr, price, ef, active: true, ...extra,
});

// nutr: PG GG FG CE AM NDF UFL EN EM ED LYS MET MC THR CA P NA MG
const N = (PG, GG, FG, CE, AM, NDF, UFL, EN, EM, ED, LYS, MET, MC, THR, CA, P, NA, MG) =>
  ({ PG, GG, FG, CE, AM, NDF, UFL, EN, EM, ED, LYS, MET, MC, THR, CA, P, NA, MG });

const AFB1 = { mais: 3.0, sorgo: 2.0, ddgs: 4.0, glutine: 3.5, frumento: 0.5, orzo: 0.5, crusca: 0.8, farinaccio: 0.8, soia44: 0.3, soia48: 0.3, soiadf: 0.3, girasole: 0.6, colza: 0.4, soiaint: 0.5, favino: 0.2, pisello: 0.2, polpe: 0.2, medica: 0.3 };

const SHORT = { mais: 'Mais', orzo: 'Orzo', frumento: 'Frumento', sorgo: 'Sorgo', crusca: 'Crusca', farinaccio: 'Farinaccio', soia44: 'Soia 44', soia48: 'Soia 48', soiadf: 'Soia 44 DF', girasole: 'Girasole', colza: 'Colza', favino: 'Favino', pisello: 'Pisello', soiaint: 'Soia integrale', ddgs: 'DDGS', glutine: 'Corn gluten', polpe: 'Polpe', medica: 'Medica', melasso: 'Melasso', olio: 'Olio di soia', carbonato: 'Carbonato', fosfato: 'Fosfato', sale: 'Sale', bicarbonato: 'Bicarbonato', ossmg: 'Ossido di Mg', lisina: 'Lisina', metionina: 'Metionina', treonina: 'Treonina', premix: 'Premiscela' };

export const INGREDIENTS = [
  I('mais', 'MP01', 'Mais granella', 'Mais', 'cereale', 86.5, N(7.4, 3.5, 2.2, 1.2, 63.5, 10.5, 1.07, 11.2, 13.2, 13.5, 0.24, 0.17, 0.35, 0.28, 0.03, 0.25, 0.01, 0.10), 226, 380, { origin: 'Italia', maxKg: 700, stock: 820, leadDays: 5, safetyDays: 10, supplier: 'Consorzio agrario (demo)' }),
  I('orzo', 'MP02', 'Orzo', 'Orzo', 'cereale', 87.0, N(10.1, 1.9, 4.6, 2.2, 52.0, 18.5, 1.00, 9.6, 11.0, 12.4, 0.37, 0.17, 0.40, 0.34, 0.07, 0.35, 0.02, 0.12), 214, 350, { origin: 'Italia', maxKg: 400, stock: 260, leadDays: 5, safetyDays: 10, supplier: 'Cooperativa cerealicola (demo)' }),
  I('frumento', 'MP03', 'Frumento tenero', 'Frumento', 'cereale', 87.0, N(11.5, 1.7, 2.4, 1.6, 60.5, 12.5, 1.07, 10.6, 12.7, 13.4, 0.32, 0.18, 0.44, 0.33, 0.06, 0.33, 0.01, 0.11), 238, 430, { origin: 'Italia', maxKg: 400, stock: 190, leadDays: 5, safetyDays: 10, supplier: 'Consorzio agrario (demo)' }),
  I('sorgo', 'MP04', 'Sorgo', 'Sorgo', 'cereale', 87.5, N(9.5, 3.0, 2.5, 1.7, 62.0, 10.5, 1.03, 10.9, 13.0, 13.2, 0.21, 0.16, 0.33, 0.30, 0.03, 0.29, 0.01, 0.14), 208, 360, { origin: 'Italia', maxKg: 300, stock: 110, leadDays: 7, safetyDays: 10, supplier: 'Cooperativa cerealicola (demo)' }),
  I('crusca', 'MP05', 'Crusca di frumento', 'Crusca di frumento', 'coprodotto', 87.0, N(15.0, 3.6, 9.5, 5.2, 18.0, 42.0, 0.82, 6.6, 7.2, 10.0, 0.58, 0.23, 0.53, 0.48, 0.13, 1.00, 0.03, 0.40), 196, 180, { origin: 'Italia', coProduct: true, maxKg: 250, stock: 140, leadDays: 4, safetyDays: 7, supplier: 'Molino (demo)' }),
  I('farinaccio', 'MP06', 'Farinaccio di frumento', 'Farinaccio di frumento', 'coprodotto', 87.5, N(15.5, 3.9, 5.5, 3.7, 30.0, 30.0, 0.96, 8.5, 9.6, 11.8, 0.60, 0.24, 0.55, 0.50, 0.10, 0.82, 0.02, 0.28), 206, 190, { origin: 'Italia', coProduct: true, maxKg: 250, stock: 120, leadDays: 4, safetyDays: 7, supplier: 'Molino (demo)' }),
  I('soia44', 'MP07', 'Farina di estrazione di soia 44%', 'Farina di estrazione di soia tostata', 'proteico', 88.0, N(44.0, 1.9, 6.5, 6.5, 1.5, 13.5, 1.06, 8.2, 9.3, 13.5, 2.70, 0.60, 1.26, 1.72, 0.32, 0.62, 0.02, 0.28), 386, 1450, { origin: 'Extra-UE', coProduct: true, maxKg: 400, stock: 310, leadDays: 10, safetyDays: 14, supplier: 'Trader proteici (demo)' }),
  I('soia48', 'MP08', 'Farina di estrazione di soia decorticata 48%', 'Farina di estrazione di soia decorticata tostata', 'proteico', 88.0, N(47.5, 1.8, 3.8, 6.3, 1.5, 9.0, 1.12, 8.4, 10.0, 14.0, 2.92, 0.65, 1.36, 1.86, 0.30, 0.64, 0.02, 0.28), 408, 1500, { origin: 'Extra-UE', coProduct: true, maxKg: 400, stock: 180, leadDays: 10, safetyDays: 14, supplier: 'Trader proteici (demo)' }),
  I('soiadf', 'MP09', 'Farina di soia 44% certificata senza deforestazione', 'Farina di estrazione di soia tostata', 'proteico', 88.0, N(44.0, 1.9, 6.5, 6.5, 1.5, 13.5, 1.06, 8.2, 9.3, 13.5, 2.70, 0.60, 1.26, 1.72, 0.32, 0.62, 0.02, 0.28), 408, 650, { origin: 'Extra-UE', coProduct: true, certified: 'Senza deforestazione (certificata)', maxKg: 400, stock: 60, leadDays: 14, safetyDays: 14, supplier: 'Trader proteici (demo)' }),
  I('girasole', 'MP10', 'Farina di estrazione di girasole 34%', 'Farina di estrazione di girasole parzialmente decorticato', 'proteico', 89.0, N(34.0, 2.0, 22.0, 6.5, 1.0, 37.0, 0.72, 5.6, 7.3, 9.5, 1.20, 0.76, 1.35, 1.22, 0.38, 1.00, 0.02, 0.50), 292, 450, { origin: 'UE', coProduct: true, maxKg: 250, stock: 95, leadDays: 10, safetyDays: 14, supplier: 'Oleificio (demo)' }),
  I('colza', 'MP11', 'Farina di estrazione di colza', 'Farina di estrazione di colza', 'proteico', 89.0, N(34.5, 2.6, 12.5, 7.0, 1.0, 28.0, 0.86, 6.3, 8.0, 10.8, 1.85, 0.70, 1.55, 1.50, 0.75, 1.10, 0.03, 0.45), 301, 520, { origin: 'UE', coProduct: true, maxKg: 200, stock: 70, leadDays: 10, safetyDays: 14, supplier: 'Oleificio (demo)' }),
  I('favino', 'MP12', 'Favino', 'Fave', 'proteico', 87.0, N(26.5, 1.3, 7.8, 3.4, 40.0, 14.0, 1.07, 8.8, 10.8, 12.5, 1.65, 0.20, 0.52, 0.92, 0.14, 0.47, 0.01, 0.14), 332, 300, { origin: 'Italia', maxKg: 200, stock: 45, leadDays: 7, safetyDays: 10, supplier: 'Cooperativa cerealicola (demo)' }),
  I('pisello', 'MP13', 'Pisello proteico', 'Piselli', 'proteico', 87.0, N(21.0, 1.2, 5.5, 3.0, 45.0, 12.0, 1.07, 9.6, 11.3, 13.0, 1.52, 0.21, 0.51, 0.79, 0.10, 0.40, 0.01, 0.12), 322, 280, { origin: 'UE', maxKg: 250, stock: 40, leadDays: 10, safetyDays: 10, supplier: 'Trader proteici (demo)' }),
  I('soiaint', 'MP14', 'Soia integrale tostata', 'Semi di soia tostati', 'proteico', 89.0, N(35.5, 19.0, 5.5, 5.0, 2.0, 12.0, 1.35, 11.0, 14.0, 16.0, 2.20, 0.50, 1.05, 1.40, 0.25, 0.53, 0.02, 0.22), 522, 1400, { origin: 'UE', maxKg: 150, stock: 35, leadDays: 10, safetyDays: 10, supplier: 'Trader proteici (demo)' }),
  I('ddgs', 'MP15', 'Borlande di mais essiccate (DDGS)', 'Borlande di distilleria essiccate di mais', 'coprodotto', 89.0, N(27.0, 7.5, 7.5, 5.0, 5.0, 33.0, 1.05, 8.1, 9.9, 12.5, 0.78, 0.53, 1.05, 1.00, 0.06, 0.80, 0.18, 0.30), 264, 620, { origin: 'UE', coProduct: true, maxKg: 200, stock: 85, leadDays: 12, safetyDays: 14, supplier: 'Bioraffineria (demo)' }),
  I('glutine', 'MP16', 'Glutine di mais (corn gluten feed)', 'Glutine di mais', 'coprodotto', 88.0, N(20.0, 3.0, 8.0, 6.5, 18.0, 36.0, 0.95, 7.0, 7.5, 11.0, 0.62, 0.35, 0.78, 0.72, 0.12, 0.85, 0.20, 0.35), 236, 400, { origin: 'UE', coProduct: true, maxKg: 250, stock: 75, leadDays: 12, safetyDays: 14, supplier: 'Amideria (demo)' }),
  I('polpe', 'MP17', 'Polpe di bietola essiccate', 'Polpe di barbabietola da zucchero', 'coprodotto', 89.0, N(9.0, 0.8, 18.0, 7.0, 0.5, 40.0, 0.93, 5.8, 3.0, 10.5, 0.50, 0.15, 0.25, 0.40, 0.85, 0.10, 0.20, 0.25), 254, 260, { origin: 'UE', coProduct: true, maxKg: 250, stock: 60, leadDays: 12, safetyDays: 14, supplier: 'Zuccherificio (demo)' }),
  I('medica', 'MP18', 'Erba medica disidratata 17%', 'Erba medica disidratata', 'foraggio', 90.0, N(17.0, 2.5, 26.0, 10.0, 1.0, 44.0, 0.66, 3.8, 4.0, 8.5, 0.75, 0.25, 0.45, 0.70, 1.60, 0.25, 0.10, 0.28), 236, 420, { origin: 'Italia', maxKg: 350, stock: 90, leadDays: 7, safetyDays: 10, supplier: 'Disidratatore (demo)' }),
  I('melasso', 'MP19', 'Melasso di barbabietola', 'Melasso di barbabietola da zucchero', 'coprodotto', 74.0, N(11.0, 0.1, 0.0, 11.0, 0.0, 0.0, 0.92, 7.4, 8.6, 10.5, 0.05, 0.02, 0.05, 0.05, 0.35, 0.03, 0.60, 0.25), 251, 220, { origin: 'UE', coProduct: true, maxKg: 60, stock: 30, leadDays: 7, safetyDays: 10, supplier: 'Zuccherificio (demo)' }),
  I('olio', 'MP20', 'Olio di soia', 'Olio di soia', 'grasso', 99.5, N(0, 99.0, 0, 0, 0, 0, 2.30, 30.0, 35.0, 35.0, 0, 0, 0, 0, 0, 0, 0, 0), 1150, 2400, { origin: 'UE', maxKg: 50, stock: 18, leadDays: 7, safetyDays: 10, supplier: 'Oleificio (demo)' }),
  I('carbonato', 'MP21', 'Carbonato di calcio', 'Carbonato di calcio', 'minerale', 99.0, N(0, 0, 0, 96.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 38.0, 0, 0.05, 0.50), 66, 60, { origin: 'Italia', maxKg: 120, stock: 55, leadDays: 5, safetyDays: 10, supplier: 'Minerali (demo)' }),
  I('fosfato', 'MP22', 'Fosfato bicalcico', 'Fosfato bicalcico', 'minerale', 97.0, N(0, 0, 0, 90.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24.0, 18.0, 0.10, 0.60), 722, 1200, { origin: 'UE', maxKg: 30, stock: 14, leadDays: 7, safetyDays: 14, supplier: 'Minerali (demo)' }),
  I('sale', 'MP23', 'Cloruro di sodio', 'Cloruro di sodio', 'minerale', 99.5, N(0, 0, 0, 99.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39.0, 0), 96, 110, { origin: 'Italia', maxKg: 10, stock: 12, leadDays: 5, safetyDays: 10, supplier: 'Minerali (demo)' }),
  I('bicarbonato', 'MP24', 'Bicarbonato di sodio', 'Bicarbonato di sodio', 'minerale', 99.5, N(0, 0, 0, 63.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27.0, 0), 518, 800, { origin: 'UE', maxKg: 15, stock: 8, leadDays: 7, safetyDays: 14, supplier: 'Minerali (demo)' }),
  I('ossmg', 'MP25', 'Ossido di magnesio', 'Ossido di magnesio', 'minerale', 99.0, N(0, 0, 0, 95.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.5, 0, 0, 54.0), 482, 1500, { origin: 'UE', maxKg: 8, stock: 4, leadDays: 7, safetyDays: 14, supplier: 'Minerali (demo)' }),
  I('lisina', 'MP26', 'L-lisina HCl', 'L-lisina monocloridrato', 'aminoacido', 98.5, N(95.0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 78.0, 0, 0, 0, 0, 0, 0, 0), 1650, 4500, { origin: 'Extra-UE', maxKg: 8, stock: 3.2, leadDays: 14, safetyDays: 21, supplier: 'Additivi (demo)' }),
  I('metionina', 'MP27', 'DL-metionina', 'DL-metionina', 'aminoacido', 99.5, N(58.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99.0, 99.0, 0, 0, 0, 0, 0), 3100, 3500, { origin: 'UE', maxKg: 4, stock: 1.4, leadDays: 14, safetyDays: 21, supplier: 'Additivi (demo)' }),
  I('treonina', 'MP28', 'L-treonina', 'L-treonina', 'aminoacido', 99.0, N(73.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 98.5, 0, 0, 0, 0), 1900, 5000, { origin: 'Extra-UE', maxKg: 4, stock: 1.1, leadDays: 14, safetyDays: 21, supplier: 'Additivi (demo)' }),
  I('premix', 'MP29', 'Premiscela vitaminico-minerale', 'Premiscela di additivi', 'premix', 95.0, N(0, 0, 0, 60.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12.0, 2.0, 4.0, 1.0), 2400, 2000, { origin: 'UE', maxKg: 10, stock: 6, leadDays: 10, safetyDays: 21, supplier: 'Additivi (demo)' }),
].map(i => ({ ...i, short: SHORT[i.id] || i.name, contam: { AFB1: AFB1[i.id] ?? 0 } }));

const C = (nut, min, max, basis) => ({ nut, min, max, basis: basis || 'tq' });
const L = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? { min: v[0], max: v[1] } : { max: v }]));
const RUMINANT_NO_AA = { lisina: 0, metionina: 0, treonina: 0 };

export const SPECS = [
  { id: 'sp-vl18', name: 'Vacche da latte · complementare 18%', species: 'bovini-latte', kind: 'complementare',
    constraints: [C('PG', 18, 19), C('GG', null, 5.0), C('FG', null, 9.0), C('AM', 22, null), C('NDF', null, 27), C('UFL', 0.98, null), C('CA', 0.9, 1.3), C('P', 0.5, null), C('NA', 0.3, 0.6), C('MG', 0.35, null)],
    ratios: [{ num: 'CA', den: 'P', min: 1.4, max: 2.6 }], ingLimits: L({ premix: [8, 8], sale: 8, bicarbonato: 12, olio: 20, melasso: 50, mais: [200, 450], sorgo: 120, ddgs: 120, farinaccio: 180, glutine: 150, ...RUMINANT_NO_AA }), groups: [] },
  { id: 'sp-vl22', name: 'Vacche da latte · alta produzione 22%', species: 'bovini-latte', kind: 'complementare',
    constraints: [C('PG', 22, 23), C('GG', null, 5.5), C('FG', null, 8.5), C('AM', 18, null), C('UFL', 1.0, null), C('CA', 0.9, 1.4), C('P', 0.55, null), C('NA', 0.3, 0.6), C('MG', 0.35, null)],
    ratios: [], ingLimits: L({ premix: [10, 10], sale: 8, bicarbonato: 15, olio: 25, melasso: 50, mais: [180, 400], sorgo: 100, ddgs: 120, farinaccio: 180, glutine: 150, ...RUMINANT_NO_AA }), groups: [] },
  { id: 'sp-bc14', name: 'Bovini da carne · finissaggio 14%', species: 'bovini-carne', kind: 'completo',
    constraints: [C('PG', 14, 15), C('GG', null, 5.0), C('FG', null, 8.0), C('AM', 35, null), C('UFL', 1.0, null), C('CA', 0.7, 1.1), C('P', 0.4, null), C('NA', 0.25, 0.5)],
    ratios: [], ingLimits: L({ premix: [5, 5], sale: 8, bicarbonato: 12, olio: 20, mais: [320, 650], sorgo: 150, ddgs: 120, farinaccio: 150, ...RUMINANT_NO_AA }), groups: [] },
  { id: 'sp-vt20', name: 'Vitelli · svezzamento 20%', species: 'vitelli', kind: 'complementare',
    constraints: [C('PG', 20, 21), C('GG', null, 5.0), C('FG', 6, 9), C('AM', 25, null), C('UFL', 1.0, null), C('CA', 0.8, 1.2), C('P', 0.5, null), C('NA', 0.25, 0.45)],
    ratios: [], ingLimits: L({ premix: [8, 8], sale: 6, olio: 20, melasso: 40, mais: [150, 400], orzo: 250, ddgs: 60, farinaccio: 150, sorgo: 100, ...RUMINANT_NO_AA }), groups: [] },
  { id: 'sp-oc18', name: 'Ovini e caprini da latte 18%', species: 'ovicaprini-latte', kind: 'complementare',
    constraints: [C('PG', 17.5, 18.5), C('GG', null, 5.0), C('FG', null, 10.0), C('UFL', 0.95, null), C('CA', 0.8, 1.2), C('P', 0.45, null), C('NA', 0.3, 0.5)],
    ratios: [], ingLimits: L({ premix: [8, 8], sale: 8, olio: 20, melasso: 50, mais: [150, 400], sorgo: 120, ddgs: 100, glutine: 150, farinaccio: 180, ...RUMINANT_NO_AA }), groups: [] },
  { id: 'sp-si15', name: 'Suini all’ingrasso pesante 15%', species: 'suini-ingrasso', kind: 'completo',
    constraints: [C('PG', 14.5, 15.5), C('GG', null, 5.0), C('FG', null, 5.5), C('EN', 9.4, null), C('LYS', 0.75, null), C('MC', 0.46, null), C('THR', 0.5, null), C('CA', 0.6, 0.85), C('P', 0.45, null), C('NA', 0.12, 0.25)],
    ratios: [], ingLimits: L({ premix: [4, 4], medica: 30, ddgs: 60, olio: 20, melasso: 30, mais: [250, 600], orzo: [150, 350], sorgo: 150, farinaccio: 150 }), groups: [] },
  { id: 'sp-sw19', name: 'Suinetti · svezzamento 19%', species: 'suinetti', kind: 'completo',
    constraints: [C('PG', 18.5, 19.5), C('GG', null, 6.0), C('FG', null, 4.5), C('EN', 10.0, null), C('LYS', 1.25, null), C('MC', 0.72, null), C('THR', 0.78, null), C('CA', 0.6, 0.8), C('P', 0.55, null), C('NA', 0.2, 0.3)],
    ratios: [], ingLimits: L({ premix: [5, 5], medica: 0, girasole: 0, colza: 0, ddgs: 0, glutine: 0, polpe: 0, favino: 60, crusca: 50, farinaccio: 100 }), groups: [] },
  { id: 'sp-ov17', name: 'Galline ovaiole 17%', species: 'ovaiole', kind: 'completo',
    constraints: [C('PG', 16.5, 17.5), C('GG', null, 6.0), C('FG', null, 5.0), C('EM', 11.4, null), C('LYS', 0.8, null), C('MET', 0.4, null), C('MC', 0.68, null), C('CA', 3.7, 4.2), C('P', 0.4, null), C('NA', 0.15, 0.2)],
    ratios: [], ingLimits: L({ premix: [5, 5], medica: 40, polpe: 0, glutine: 60, ddgs: 80, mais: [350, 650], sorgo: 100 }), groups: [] },
  { id: 'sp-br21', name: 'Polli da carne · accrescimento 21%', species: 'broiler', kind: 'completo',
    constraints: [C('PG', 20.5, 21.5), C('GG', null, 8.0), C('FG', null, 4.0), C('EM', 12.6, null), C('LYS', 1.18, null), C('MET', 0.5, null), C('MC', 0.88, null), C('THR', 0.78, null), C('CA', 0.8, 0.95), C('P', 0.45, null), C('NA', 0.16, 0.22)],
    ratios: [], ingLimits: L({ premix: [5, 5], medica: 0, polpe: 0, girasole: 40, crusca: 30, farinaccio: 50, glutine: 0, mais: [400, 650], sorgo: 100 }), groups: [] },
  { id: 'sp-co16', name: 'Conigli · ingrasso 16%', species: 'conigli', kind: 'completo',
    constraints: [C('PG', 15.5, 16.5), C('GG', null, 4.5), C('FG', 15, 18), C('AM', null, 18), C('ED', 9.5, null), C('LYS', 0.75, null), C('MC', 0.55, null), C('CA', 0.8, 1.2), C('P', 0.45, null), C('NA', 0.2, 0.3)],
    ratios: [], ingLimits: L({ premix: [5, 5], olio: 15, medica: [150, 320], crusca: 220 }), groups: [] },
  { id: 'sp-eq12', name: 'Equini · mantenimento 12%', species: 'equini', kind: 'complementare',
    constraints: [C('PG', 11.5, 13), C('GG', null, 5.0), C('FG', 8, 14), C('AM', null, 30), C('ED', 11, null), C('CA', 0.6, 1.0), C('P', 0.35, null), C('NA', 0.2, 0.4)],
    ratios: [], ingLimits: L({ premix: [8, 8], olio: 20, melasso: 60, orzo: [150, 400], medica: [80, 250], sorgo: 100, ...RUMINANT_NO_AA }), groups: [] },
];
