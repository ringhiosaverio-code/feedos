/* FeedOS 18 · ESG › Governance ed evidenze (pacchetto WP6 «governance»): stub della fondazione 18.
 * Contratto: GovernancePage({ d, route }) disegna la scheda «governance» (il titolo e le schede li disegna esg.jsx);
 * GovernanceCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuLandmark } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Governance ed evidenze. */
export function GovernancePage({ d, route }) {
  return <SectionPlaceholder title="Governance ed evidenze">Scadenzario degli adempimenti, politiche, organi e ruoli, modello 231 e segnalazioni (solo conteggi), certificati, registro delle evidenze con impronta.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function GovernanceCard({ d }) {
  return <EsgCard title="Governance ed evidenze" tab="governance" icon={LuLandmark} />;
}
