/* FeedOS 18 · ESG › Registri ambientali (pacchetto WP9 «ambiente»): stub della fondazione 18.
 * Contratto: AmbientePage({ d, route }) disegna la scheda «ambiente» (il titolo e le schede li disegna esg.jsx);
 * AmbienteCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuRecycle } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Registri ambientali. */
export function AmbientePage({ d, route }) {
  return <SectionPlaceholder title="Registri ambientali">RENTRI e MUD sul registro dei rifiuti, recupero effettivo, emissioni in atmosfera dai camini, scarichi idrici, modello energetico e anomalie.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function AmbienteCard({ d }) {
  return <EsgCard title="Registri ambientali" tab="ambiente" icon={LuRecycle} />;
}
