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

/** Fornitori di segnali, eseguiti da computeSignals dopo le regole incorporate. */
export const SIGNAL_PROVIDERS = [budgetSignals, financeSignals, profitSignals, commercialSignals, purchasingSignals, productionSignals, kpiSignals, dqSignals];

/** Sezioni esterne del report CdA, in ordine (le sezioni proprie della Direzione stanno in report.js). */
export const REPORT_SECTIONS = [
  { id: 'kpi', order: 10, build: kpiReportSection },
  { id: 'redditivita', order: 40, build: profitReportSection },
  { id: 'commerciale', order: 45, build: commercialReportSection },
  { id: 'finanza', order: 50, build: financeReportSection },
  { id: 'acquisti', order: 60, build: purchasingReportSection },
  { id: 'produzione', order: 70, build: opsReportSection },
  { id: 'dati', order: 90, build: dqReportSection },
];
