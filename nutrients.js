/* Catalogo dei parametri nutrizionali e dei contaminanti usati da FeedOS 16.
 * Tutti i valori delle materie prime sono espressi sul tal quale (t.q.). */
export const NUTRIENTS = [
  { id: 'SS', name: 'Sostanza secca', short: 'SS', unit: '%', dec: 1, group: 'base' },
  { id: 'PG', name: 'Proteina grezza', short: 'PG', unit: '%', dec: 1, group: 'base', label: 'Proteina grezza' },
  { id: 'GG', name: 'Grassi grezzi', short: 'GG', unit: '%', dec: 1, group: 'base', label: 'Grassi grezzi' },
  { id: 'FG', name: 'Fibra grezza', short: 'FG', unit: '%', dec: 1, group: 'base', label: 'Fibra grezza' },
  { id: 'CE', name: 'Ceneri grezze', short: 'CE', unit: '%', dec: 1, group: 'base', label: 'Ceneri grezze' },
  { id: 'AM', name: 'Amido', short: 'Amido', unit: '%', dec: 1, group: 'carboidrati' },
  { id: 'NDF', name: 'Fibra neutro detersa', short: 'NDF', unit: '%', dec: 1, group: 'carboidrati' },
  { id: 'UFL', name: 'Unità foraggere latte', short: 'UFL', unit: '/kg', dec: 2, group: 'energia' },
  { id: 'EN', name: 'Energia netta suini', short: 'EN', unit: 'MJ/kg', dec: 2, group: 'energia' },
  { id: 'EM', name: 'Energia metabolizzabile pollame', short: 'EM', unit: 'MJ/kg', dec: 2, group: 'energia' },
  { id: 'ED', name: 'Energia digeribile (conigli, equini)', short: 'ED', unit: 'MJ/kg', dec: 2, group: 'energia' },
  { id: 'LYS', name: 'Lisina', short: 'Lys', unit: '%', dec: 2, group: 'aminoacidi', label: 'Lisina' },
  { id: 'MET', name: 'Metionina', short: 'Met', unit: '%', dec: 2, group: 'aminoacidi', label: 'Metionina' },
  { id: 'MC', name: 'Metionina + cistina', short: 'Met+Cys', unit: '%', dec: 2, group: 'aminoacidi' },
  { id: 'THR', name: 'Treonina', short: 'Thr', unit: '%', dec: 2, group: 'aminoacidi' },
  { id: 'CA', name: 'Calcio', short: 'Ca', unit: '%', dec: 2, group: 'minerali', label: 'Calcio' },
  { id: 'P', name: 'Fosforo', short: 'P', unit: '%', dec: 2, group: 'minerali', label: 'Fosforo' },
  { id: 'NA', name: 'Sodio', short: 'Na', unit: '%', dec: 2, group: 'minerali', label: 'Sodio' },
  { id: 'MG', name: 'Magnesio', short: 'Mg', unit: '%', dec: 2, group: 'minerali', label: 'Magnesio' },
  { id: 'AFB1', name: 'Aflatossina B1', short: 'AFB1', unit: 'µg/kg', dec: 1, group: 'contaminanti' },
];
export const NUT = Object.fromEntries(NUTRIENTS.map(n => [n.id, n]));

/* Limiti massimi di aflatossina B1 (Direttiva 2002/32/CE, all. I, mangime al 12% di umidità), in µg/kg. */
export const AFB1_LIMITS = {
  materia_prima: 20,
  giovani_lattifere: 5,   // bovine/ovine/caprine da latte e giovani, suinetti, pollame giovane
  altri_adulti: 20,       // bovini (non da latte), ovini, caprini, suini (esclusi suinetti), pollame (esclusi giovani)
  altri: 10,              // altri mangimi complementari e completi
};

/* Specie e categoria di etichettatura (Reg. CE 767/2009, all. VI capo II). */
export const SPECIES = {
  'bovini-latte': { name: 'Bovine da latte', labelGroup: 'ruminanti', afb1: 'giovani_lattifere', energy: 'UFL' },
  'bovini-carne': { name: 'Bovini da carne', labelGroup: 'ruminanti', afb1: 'altri_adulti', energy: 'UFL' },
  'vitelli': { name: 'Vitelli', labelGroup: 'ruminanti', afb1: 'giovani_lattifere', energy: 'UFL' },
  'ovicaprini-latte': { name: 'Ovini e caprini da latte', labelGroup: 'ruminanti', afb1: 'giovani_lattifere', energy: 'UFL' },
  'suini-ingrasso': { name: 'Suini all’ingrasso', labelGroup: 'suini', afb1: 'altri_adulti', energy: 'EN' },
  'suinetti': { name: 'Suinetti', labelGroup: 'suini', afb1: 'giovani_lattifere', energy: 'EN' },
  'scrofe': { name: 'Scrofe', labelGroup: 'suini', afb1: 'altri_adulti', energy: 'EN' },
  'ovaiole': { name: 'Galline ovaiole', labelGroup: 'pollame', afb1: 'altri_adulti', energy: 'EM' },
  'broiler': { name: 'Polli da carne', labelGroup: 'pollame', afb1: 'altri_adulti', energy: 'EM' },
  'conigli': { name: 'Conigli', labelGroup: 'altre', afb1: 'altri', energy: 'ED' },
  'equini': { name: 'Equini', labelGroup: 'altre', afb1: 'altri', energy: 'ED' },
};

/** Profilo nutrizionale di una miscela (kg per t) sul tal quale. */
export function profile(lines, ingById) {
  const out = {};
  let tot = 0;
  for (const l of lines) tot += +l.kg || 0;
  if (tot <= 0) return out;
  for (const n of NUTRIENTS) {
    let s = 0, known = 0;
    for (const l of lines) {
      const ing = ingById[l.ing];
      if (!ing) continue;
      const v = n.id === 'SS' ? ing.dm : ing.nutr?.[n.id];
      if (v == null || v === '') continue;
      s += (+l.kg) * (+v); known += +l.kg;
    }
    out[n.id] = known > 0 ? s / tot : null;
  }
  return out;
}

/** Valore di un parametro sulla sostanza secca. */
export function onDM(value, ss) { return value == null || !ss ? null : value * 100 / ss; }
