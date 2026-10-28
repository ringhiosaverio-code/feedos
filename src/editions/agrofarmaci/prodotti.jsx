/* DifesaOS · Area Prodotti: report di prodotto stampabile (con foto e prove), archivio delle prove di campo, costi, prezzi della
 * concorrenza e leve di risparmio. La vista Agente vede report per i clienti e prove, non costi e margini. */
import React from 'react';
import { LuPackage } from 'react-icons/lu';
import { useData } from '../../core/store.js';
import { go } from '../../core/router.js';
import { usePrefs } from '../../core/prefs.js';
import { appToday, signals, ctxOf, period12 } from '../../core/derived.js';
import { PageHead, Panel, Empty } from '../../ui/ui.jsx';
import { SignalList } from '../../modules/shared.jsx';
import { NAV } from '../../app/nav.js';
import { ReportProdotto } from './prodotti-report.jsx';
import { Prove } from './prodotti-prove.jsx';
import { Risparmi } from './prodotti-risparmi.jsx';

export function Prodotti({ route }) {
  const d = useData();
  const agent = usePrefs(p => p.role) === 'agente';
  const tabs = (NAV.prodotti?.tabs || []).filter(t => !(agent && t.id === 'risparmi'));
  const tab = tabs.some(t => t.id === route.tab) ? route.tab : tabs[0]?.id;
  const today = appToday(d);
  const ctx = ctxOf(d), P = period12(d);
  const sig = signals(d).filter(s => s.area === 'prodotti' && (!agent || (s.roles || []).includes('agente')));
  return (
    <>
      <PageHead title={NAV.prodotti?.label || 'Prodotti'} lead={NAV.prodotti?.lead} tabs={tabs} tab={tab} onTab={t => go('prodotti', t)} />
      {!(d.products || []).length ? <Empty icon={LuPackage} title="Nessun prodotto nell’archivio">I prodotti si importano da Dati › Importa o si inseriscono in Dati › Anagrafiche.</Empty> : (
        <>
          {sig.length > 0 && tab !== 'report' && <Panel title="Da decidere sui prodotti" sub="Dai segnali di «Oggi»" className="no-print"><SignalList items={sig} limit={4} compact /></Panel>}
          {tab === 'prove' ? <Prove d={d} route={route} today={today} />
            : tab === 'risparmi' ? <Risparmi d={d} ctx={ctx} P={P} route={route} today={today} />
            : <ReportProdotto d={d} ctx={ctx} P={P} route={route} today={today} agent={agent} />}
        </>
      )}
    </>
  );
}
