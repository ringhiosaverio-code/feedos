/* FeedOS 17 · Area Finanza (pacchetto WP2): crediti e fidi, cassa a 13 settimane, capitale circolante, rimanenze, parametri.
 * Contratto della fondazione: export Finanza({route}) e la sezione della scheda cliente CustomerCredit({d, id}). */
import React from 'react';
import { go } from '../core/router.js';
import { AREA_META } from '../core/roles.js';
import { PageHead } from '../ui/ui.jsx';
import { NAV } from '../app/nav.js';
import { SectionPlaceholder } from './shared.jsx';

const SCOPE = {
  crediti: 'Crediti aperti e scaduti per cliente, fidi e loro utilizzo, DSO, classe di rischio e incassi.',
  cassa: 'Saldo di cassa previsto settimana per settimana: incassi, fornitori, ordini, personale, imposte, rate e linee di credito.',
  circolante: 'Crediti, rimanenze e debiti: capitale circolante, giorni di incasso, di magazzino e di pagamento, e il suo costo.',
  rimanenze: 'Materie prime e prodotto finito valorizzati, classi ABC/XYZ, materiali lenti ed eccedenze.',
  parametri: 'IVA, costo del denaro, probabilità di insolvenza e condizioni di pagamento di base.',
};

export function Finanza({ route }) {
  const tabs = NAV.finanza.tabs;
  const t = tabs.find(x => x.id === route.tab) || tabs[0];
  return (
    <>
      <PageHead title="Finanza" lead={AREA_META.finanza.lead} tabs={tabs} tab={t.id} onTab={x => go('finanza', x)} />
      <SectionPlaceholder title={t.label}>{SCOPE[t.id]}</SectionPlaceholder>
    </>
  );
}

/** Sezione «Crediti» della scheda cliente (esposizione, fido, scaduto, estratto conto); null finché il pacchetto non c'è. */
export function CustomerCredit({ d, id }) { return null; }
