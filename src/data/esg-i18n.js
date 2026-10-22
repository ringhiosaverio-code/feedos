/* FeedOS 18 · Testi bilingui (italiano e inglese) per report, lettere e moduli ESG (fondazione 18).
 * L'interfaccia resta in italiano; esportazioni, lettere e moduli possono uscire anche in inglese.
 * I18N = { chiave: { it, en } }: chiavi di base qui, quelle dei pacchetti (prefisso «<pkg>.») nei file src/data/i18n-<pkg>.js.
 * Interpolazione {nome} con T(chiave, valori, lingua) di src/engine/esg-nlg.js. File senza logica. */
import { I18N_CLIMA } from './i18n-clima.js';
import { I18N_PCF } from './i18n-pcf.js';
import { I18N_FILIERA } from './i18n-filiera.js';
import { I18N_REPORT } from './i18n-report.js';
import { I18N_PERSONE } from './i18n-persone.js';
import { I18N_GOVERNANCE } from './i18n-governance.js';
import { I18N_PIANO } from './i18n-piano.js';
import { I18N_RISCHI } from './i18n-rischi.js';
import { I18N_AMBIENTE } from './i18n-ambiente.js';

export const LANGS = ['it', 'en'];

/** Chiavi comuni a tutti i pacchetti. */
export const I18N_BASE = {
  disclaimer: { it: 'FeedOS organizza dati e calcoli; non sostituisce consulenza legale, fiscale o la verifica di un ente terzo.', en: 'FeedOS organises data and calculations; it does not replace legal or tax advice or verification by a third party.' },
  validAsOf: { it: 'valido al', en: 'valid as of' },
  source: { it: 'fonte', en: 'source' },
  method: { it: 'Nota metodologica', en: 'Methodology note' },
  period: { it: 'periodo', en: 'period' },
  unit: { it: 'unità', en: 'unit' },
  value: { it: 'valore', en: 'value' },
  quality: { it: 'qualità del dato', en: 'data quality' },
  evidence: { it: 'evidenze', en: 'evidence' },
  na: { it: 'n.d.', en: 'n/a' },
  and: { it: 'e', en: 'and' },
  estimate: { it: 'stima', en: 'estimate' },
  demo: { it: 'dati dimostrativi', en: 'demonstration data' },
  'status.da-verificare': { it: 'da verificare', en: 'to be verified' },
  'status.verificato': { it: 'verificato', en: 'verified' },
  'status.preliminare': { it: 'preliminare', en: 'preliminary' },
  'status.da-trascrivere': { it: 'da trascrivere', en: 'to be transcribed' },
  'quality.misurato': { it: 'misurato', en: 'measured' },
  'quality.calcolato': { it: 'calcolato', en: 'calculated' },
  'quality.stimato': { it: 'stimato', en: 'estimated' },
  'quality.dichiarato': { it: 'dichiarato', en: 'declared' },
  'quality.default': { it: 'valore predefinito', en: 'default value' },
  'quality.mancante': { it: 'mancante', en: 'missing' },
  'nlg.up': { it: 'in aumento del {pct}', en: 'up {pct}' },
  'nlg.down': { it: 'in calo del {pct}', en: 'down {pct}' },
  'nlg.upAbs': { it: 'in aumento di {abs}', en: 'up {abs}' },
  'nlg.downAbs': { it: 'in calo di {abs}', en: 'down {abs}' },
  'nlg.stable': { it: 'stabile', en: 'stable' },
  'nlg.fromTo': { it: 'da {prev} a {cur}', en: 'from {prev} to {cur}' },
  'nlg.points': { it: '{n} punti', en: '{n} points' },
  'nlg.point': { it: '{n} punto', en: '{n} point' },
  'nlg.better': { it: 'un miglioramento', en: 'an improvement' },
  'nlg.worse': { it: 'un peggioramento', en: 'a deterioration' },
  'nlg.notComparable': { it: 'non confrontabile con il periodo precedente', en: 'not comparable with the previous period' },
};

/** Tutti i testi: base più i pacchetti. */
export const I18N = { ...I18N_BASE, ...I18N_CLIMA, ...I18N_PCF, ...I18N_FILIERA, ...I18N_REPORT, ...I18N_PERSONE, ...I18N_GOVERNANCE, ...I18N_PIANO, ...I18N_RISCHI, ...I18N_AMBIENTE };
