/* FeedOS 18 · ESG › Clima e GHG (pacchetto WP1 «clima»): stub della fondazione 18.
 * Contratto: ClimaPage({ d, route }) disegna la scheda «clima» (il titolo e le schede li disegna esg.jsx);
 * ClimaCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuCloud } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Clima e GHG. */
export function ClimaPage({ d, route }) {
  return <SectionPlaceholder title="Clima e GHG">Inventario GHG per esercizio: Scope 1, Scope 2 location-based e market-based, Scope 3 per categoria, quota FLAG, fattori con fonte e anno, registro F-gas.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function ClimaCard({ d }) {
  return <EsgCard title="Clima e GHG" tab="clima" icon={LuCloud} />;
}
