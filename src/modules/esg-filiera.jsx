/* FeedOS 18 · ESG › EUDR e fornitori (pacchetto WP3 «filiera»): stub della fondazione 18.
 * Contratto: FilieraPage({ d, route }) disegna la scheda «filiera» (il titolo e le schede li disegna esg.jsx);
 * FilieraCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/> da esg-shared.jsx, mai usePeriod. */
import React from 'react';
import { LuGlobe } from 'react-icons/lu';
import { SectionPlaceholder } from './shared.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › EUDR e fornitori. */
export function FilieraPage({ d, route }) {
  return <SectionPlaceholder title="EUDR e fornitori">Ruolo EUDR, lotti con riferimento della dichiarazione di dovuta diligenza, rischio paese, soia senza deforestazione e valutazione ESG dei fornitori.</SectionPlaceholder>;
}

/** Riquadro del cruscotto ESG. */
export function FilieraCard({ d }) {
  return <EsgCard title="EUDR e fornitori" tab="filiera" icon={LuGlobe} />;
}

/** Sezione della scheda fornitore (SUPPLIER_SECTIONS, {d, id}). Stub: non mostra nulla. */
export function SupplierEsg({ d, id }) { return null; }
