/* FeedOS 17 · Registri dei fornitori di segnali e delle sezioni del report CdA (fondazione).
 * Ogni pacchetto scrive le sue funzioni nel proprio motore; qui si elencano soltanto, così nessun pacchetto tocca signals.js.
 * Firme: segnali (d, ctx) → Signal[]; sezioni (d, ctx, P, C) → Section | null. */
import { budgetSignals } from './budget.js';
import { financeSignals, financeReportSection } from './credit.js';
import { profitSignals, profitReportSection } from './profitability.js';
import { commercialSignals, commercialReportSection } from './pricing.js';
import { purchasingSignals, purchasingReportSection } from './suppliers.js';
import { productionSignals, opsReportSection } from './oee.js';
import { kpiSignals, kpiReportSection } from './kpis.js';
import { dqSignals, dqReportSection } from './dataquality.js';
// fondazione 18: i nove pacchetti ESG (segnali con il prefisso del pacchetto, sezioni 80-88)
import { climaSignals, climaReportSection } from './esg-clima.js';
import { pcfSignals, pcfReportSection } from './esg-pcf.js';
import { filieraSignals, filieraReportSection } from './esg-filiera.js';
import { reportSignals, reportReportSection } from './esg-report.js';
import { personeSignals, personeReportSection } from './esg-persone.js';
import { governanceSignals, governanceReportSection } from './esg-governance.js';
import { pianoSignals, pianoReportSection } from './esg-piano.js';
import { rischiSignals, rischiReportSection } from './esg-rischi.js';
import { ambienteSignals, ambienteReportSection } from './esg-ambiente.js';

/** Fornitori di segnali, eseguiti da computeSignals dopo le regole incorporate. */
export const SIGNAL_PROVIDERS = [budgetSignals, financeSignals, profitSignals, commercialSignals, purchasingSignals, productionSignals, kpiSignals, dqSignals,
  climaSignals, pcfSignals, filieraSignals, reportSignals, personeSignals, governanceSignals, pianoSignals, rischiSignals, ambienteSignals];

/** Sezioni esterne del report CdA, in ordine (le sezioni proprie della Direzione stanno in report.js). */
export const REPORT_SECTIONS = [
  { id: 'kpi', order: 10, build: kpiReportSection },
  { id: 'redditivita', order: 40, build: profitReportSection },
  { id: 'commerciale', order: 45, build: commercialReportSection },
  { id: 'finanza', order: 50, build: financeReportSection },
  { id: 'acquisti', order: 60, build: purchasingReportSection },
  { id: 'produzione', order: 70, build: opsReportSection },
  { id: 'esg-sintesi', order: 80, build: reportReportSection },
  { id: 'esg-clima', order: 81, build: climaReportSection },
  { id: 'esg-impronta', order: 82, build: pcfReportSection },
  { id: 'esg-filiera', order: 83, build: filieraReportSection },
  { id: 'esg-ambiente', order: 84, build: ambienteReportSection },
  { id: 'esg-persone', order: 85, build: personeReportSection },
  { id: 'esg-governance', order: 86, build: governanceReportSection },
  { id: 'esg-piano', order: 87, build: pianoReportSection },
  { id: 'esg-rischi', order: 88, build: rischiReportSection },
  { id: 'dati', order: 90, build: dqReportSection },
];
