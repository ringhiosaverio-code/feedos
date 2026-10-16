/* FeedOS 17 · Manutenzione leggera (pacchetto WP6: contatori, scadenze, MTBF/MTTR, rientro della sostituzione).
 * Contratto della fondazione: la scheda laterale AssetD({d, id}), aperta con openDrawer('asset', id); il pacchetto aggiunge la scheda Produzione › Manutenzione. */
import React from 'react';
import { LuWrench } from 'react-icons/lu';
import { nf, dateIt } from '../core/util.js';
import { Drawer, Kv } from '../ui/ui.jsx';

export function AssetD({ d, id }) {
  const a = (d.assets || []).find(x => x.id === id);
  if (!a) return <Drawer title="Componente non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  const line = (d.lines || []).find(l => l.id === a.lineId);
  return (
    <Drawer title={a.name} sub={`Componente${a.code ? ' · ' + a.code : ''}${line ? ' · ' + line.name : ''}`} icon={<span className="dicon"><LuWrench /></span>}>
      <Kv items={[['Tipo', a.kind || '—'], ['Linea', line?.name || '—'], ['Vita utile', a.lifeT != null ? `${nf(a.lifeT)} t` : '—'],
        ['Piano di manutenzione', a.plan?.every ? `ogni ${nf(a.plan.every)} ${a.plan.unit || ''}` : '—'], ['Ultimo intervento', a.lastServiceAt ? dateIt(a.lastServiceAt) : '—'],
        ['Costo di sostituzione', a.replaceCost != null ? `${nf(a.replaceCost)} €` : '—']]} />
    </Drawer>
  );
}
