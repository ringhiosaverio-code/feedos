/* FeedOS 18 · ESG › Rischi climatici (pacchetto WP8 «rischi»): stub della fondazione 18.
 * Contratto: RischiPage({ d, route }) disegna la scheda «rischi» (il titolo e le schede li disegna esg.jsx);
 * RischiCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuThermometerSun } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Rischi climatici. */
export function RischiPage({ d, route }) {
  return <SectionPlaceholder title="Rischi climatici">Registro dei siti, screening dei rischi fisici, copertura assicurativa contro le catastrofi naturali, esposizione climatica della filiera e rischi di transizione.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function RischiCard({ d }) {
  return <EsgCard title="Rischi climatici" tab="rischi" icon={LuThermometerSun} />;
}
