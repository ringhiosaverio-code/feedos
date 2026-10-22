/* FeedOS 18 · Riquadri del cruscotto ESG (fondazione 18): uno per pacchetto, nell'ordine dei pacchetti (WP1…WP9).
 * Il Cruscotto (sostenibilita.jsx) li disegna in una griglia sopra il resto, ciascuno dentro SlotGuard. Ogni riquadro
 * ({ d }) usa EsgCard di esg-shared.jsx: stato, valore principale, segnale più importante e collegamento alla scheda. */
import { ClimaCard } from './esg-clima.jsx';
import { PcfCard } from './esg-pcf.jsx';
import { FilieraCard } from './esg-filiera.jsx';
import { ReportCard } from './esg-report.jsx';
import { PersoneCard } from './esg-persone.jsx';
import { GovernanceCard } from './esg-governance.jsx';
import { PianoCard } from './esg-piano.jsx';
import { RischiCard } from './esg-rischi.jsx';
import { AmbienteCard } from './esg-ambiente.jsx';

export const ESG_DASHBOARD_CARDS = [ClimaCard, PcfCard, FilieraCard, ReportCard, PersoneCard, GovernanceCard, PianoCard, RischiCard, AmbienteCard];
