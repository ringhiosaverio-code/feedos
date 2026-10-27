/* FitoOS · pagine dell'edizione agrofarmaci (provvisorio). */
import React from 'react';
import { PageHead } from '../../ui/ui.jsx';
import { SectionPlaceholder } from '../../modules/shared.jsx';
import { NAV } from '../../app/nav.js';
import { go } from '../../core/router.js';

function Regolatorio({ route }) {
  const tabs = NAV.regolatorio?.tabs || [];
  const tab = tabs.some(t => t.id === route.tab) ? route.tab : tabs[0]?.id;
  return (
    <>
      <PageHead title="Regolatorio" lead={NAV.regolatorio?.lead} tabs={tabs} tab={tab} onTab={t => go('regolatorio', t)} />
      <SectionPlaceholder title={tabs.find(t => t.id === tab)?.label || 'Regolatorio'}>In preparazione.</SectionPlaceholder>
    </>
  );
}
const Wip = ({ route }) => <SectionPlaceholder title="In preparazione">In preparazione.</SectionPlaceholder>;

export const PAGES = { regolatorio: Regolatorio };
export const TAB_PAGES = { 'commerciale.campagne': Wip, 'esg.co2': Wip };
export const TOUR_STEPS = [];
