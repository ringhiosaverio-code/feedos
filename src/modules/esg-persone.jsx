/* FeedOS 18 · ESG › Persone e sicurezza (pacchetto WP5 «persone»): stub della fondazione 18.
 * Contratto: PersonePage({ d, route }) disegna la scheda «persone» (il titolo e le schede li disegna esg.jsx);
 * PersoneCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuUsers } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Persone e sicurezza. */
export function PersonePage({ d, route }) {
  return <SectionPlaceholder title="Persone e sicurezza">Organico per genere e contratto, registro degli infortuni con gli indici, formazione, salari minimi e divario retributivo, in forma pseudonima.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function PersoneCard({ d }) {
  return <EsgCard title="Persone e sicurezza" tab="persone" icon={LuUsers} />;
}
