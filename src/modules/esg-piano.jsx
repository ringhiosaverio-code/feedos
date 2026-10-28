/* FeedOS 18 · ESG › Obiettivi e piano (pacchetto WP7 «piano»): stub della fondazione 18.
 * Contratto: PianoPage({ d, route }) disegna la scheda «piano» (il titolo e le schede li disegna esg.jsx);
 * PianoCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuTarget } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Obiettivi e piano. */
export function PianoPage({ d, route }) {
  return <SectionPlaceholder title="Obiettivi e piano">Obiettivi con anno base e traiettoria, misure con curva dei costi di abbattimento, finanziamenti legati alla sostenibilità e piano di transizione.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function PianoCard({ d }) {
  return <EsgCard title="Obiettivi e piano" tab="piano" icon={LuTarget} />;
}
