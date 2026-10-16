/* FeedOS 17 · Scheda laterale dell'agente (pacchetto WP4: portafoglio, prestazioni, schema provvigionale, estratti conto).
 * Contratto della fondazione: export AgentD({d, id}), aperta con openDrawer('agent', id). */
import React from 'react';
import { LuUserRound } from 'react-icons/lu';
import { openDrawer } from '../core/store.js';
import { nf } from '../core/util.js';
import { Drawer, Kv } from '../ui/ui.jsx';

export function AgentD({ d, id }) {
  const a = (d.agents || []).find(x => x.id === id);
  if (!a) return <Drawer title="Agente non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  const mine = (d.customers || []).filter(c => c.agentId === id).sort((x, y) => String(x.name).localeCompare(String(y.name), 'it'));
  return (
    <Drawer title={a.name} sub={`Agente · ${a.zone || 'zona non indicata'}`} icon={<span className="dicon"><LuUserRound /></span>}>
      <Kv items={[['Zona', a.zone || '—'], ['Provvigione di base', a.commissionPct != null ? `${nf(a.commissionPct, 1)}% sul fatturato` : '—'], ['Clienti in portafoglio', nf(mine.length)]]} />
      <div className="dsec"><div className="eyebrow">Clienti</div>
        {mine.length ? mine.map(c => <button key={c.id} className="dlink" onClick={() => openDrawer('customer', c.id)}><span>{c.name}</span><span className="muted">{c.city}{c.province ? ` (${c.province})` : ''}</span></button>)
          : <span className="small muted">Nessun cliente assegnato.</span>}
      </div>
    </Drawer>
  );
}
