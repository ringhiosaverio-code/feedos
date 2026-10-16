/* FeedOS 17 · Area Direzione (pacchetto WP1): sintesi, conto economico, scostamenti, budget, costi fissi, chiusura del mese, report CdA.
 * Contratto della fondazione: export Direzione({route}); il pacchetto ne scrive il contenuto. */
import React from 'react';
import { go } from '../core/router.js';
import { AREA_META } from '../core/roles.js';
import { PageHead } from '../ui/ui.jsx';
import { NAV } from '../app/nav.js';
import { SectionPlaceholder } from './shared.jsx';

const SCOPE = {
  sintesi: 'Ricavi netti, margine di contribuzione per tonnellata, EBITDA ed EBIT del periodo, con il confronto scelto e le decisioni principali.',
  conto: 'Conto economico a costi diretti al costo effettivo: dai ricavi lordi al margine di contribuzione, ai costi fissi per centro, fino all’EBIT.',
  ponte: 'Scostamenti del margine tra due periodi: volume, mix, listino, sconti, materie prime, energia e costi fissi.',
  budget: 'Budget mensile per prodotto e centro di costo, confronto con il consuntivo e stima di chiusura dell’anno.',
  costi: 'Centri di costo e costi fissi mensili, a consuntivo e a budget, con l’importazione dal bilancio di verifica.',
  chiusura: 'Mesi con la lista di controllo: la chiusura congela i numeri, la riapertura richiede una nota.',
  report: 'Report per il consiglio di amministrazione su fogli A4, con le sezioni di tutte le aree.',
};

export function Direzione({ route }) {
  const tabs = NAV.direzione.tabs;
  const t = tabs.find(x => x.id === route.tab) || tabs[0];
  return (
    <>
      <PageHead title="Direzione" lead={AREA_META.direzione.lead} tabs={tabs} tab={t.id} onTab={x => go('direzione', x)} />
      <SectionPlaceholder title={t.label}>{SCOPE[t.id]}</SectionPlaceholder>
    </>
  );
}
