/* FeedOS 18 · Registro delle schede ESG dei pacchetti (fondazione 18): id della scheda → pagina del pacchetto.
 * esg.jsx disegna ESG_PAGES[tab] dentro SlotGuard per queste schede (un errore resta nella scheda) e tiene il proprio
 * elenco per le altre (cruscotto, energia, acqua, rifiuti, indicatori, questionario). */
import { ClimaPage } from './esg-clima.jsx';
import { PcfPage } from './esg-pcf.jsx';
import { FilieraPage } from './esg-filiera.jsx';
import { ReportPage } from './esg-report.jsx';
import { PersonePage } from './esg-persone.jsx';
import { GovernancePage } from './esg-governance.jsx';
import { PianoPage } from './esg-piano.jsx';
import { RischiPage } from './esg-rischi.jsx';
import { AmbientePage } from './esg-ambiente.jsx';

export const ESG_PAGES = { clima: ClimaPage, passaporto: PcfPage, filiera: FilieraPage, ambiente: AmbientePage, persone: PersonePage, governance: GovernancePage, piano: PianoPage, rischi: RischiPage, vsme: ReportPage };
