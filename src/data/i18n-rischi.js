/* FeedOS 18 · Testi bilingui · Rischi climatici (pacchetto WP8): etichette dei pericoli, dei livelli, degli orizzonti e degli stati
 * della copertura, per esportazioni e report in inglese. I valori in italiano restano quelli dell'interfaccia.
 * I18N_RISCHI = { 'rischi.chiave': { it, en } } (chiavi con il prefisso «rischi.»), unite in src/data/esg-i18n.js. */
const E = (it, en) => ({ it, en });

export const I18N_RISCHI = {
  'rischi.hazard.alluvione': E('alluvione', 'flood'),
  'rischi.hazard.frana': E('frana', 'landslide'),
  'rischi.hazard.sisma': E('sisma', 'earthquake'),
  'rischi.hazard.caldo': E('caldo', 'heat'),
  'rischi.hazard.siccita': E('siccità', 'drought'),
  'rischi.hazard.grandine-vento': E('grandine e vento', 'hail and wind'),
  'rischi.hazard.incendio': E('incendio', 'fire'),
  'rischi.hazard.mare': E('mareggiate e innalzamento del mare', 'storm surge and sea-level rise'),
  'rischi.level.0': E('trascurabile', 'negligible'),
  'rischi.level.1': E('basso', 'low'),
  'rischi.level.2': E('medio', 'medium'),
  'rischi.level.3': E('alto', 'high'),
  'rischi.level.4': E('molto alto', 'very high'),
  'rischi.horizon.breve': E('≤ 1 anno', '≤ 1 year'),
  'rischi.horizon.medio': E('1–5 anni', '1–5 years'),
  'rischi.horizon.lungo': E('> 5 anni', '> 5 years'),
  'rischi.insurance.conforme': E('conforme', 'compliant'),
  'rischi.insurance.sottoassicurato': E('sottoassicurato', 'underinsured'),
  'rischi.insurance.rischi-mancanti': E('rischi mancanti', 'perils missing'),
  'rischi.insurance.scaduta': E('scaduta', 'expired'),
  'rischi.insurance.assente': E('assente', 'absent'),
  'rischi.insurance.valori-mancanti': E('valori da inserire', 'asset values to be entered'),
  'rischi.catastrophe': E('Polizza catastrofale (sisma, alluvione, frana)', 'Catastrophe policy (earthquake, flood, landslide)'),
};
