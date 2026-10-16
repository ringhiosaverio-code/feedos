/* FeedOS 17 · Fornitori qualificati (pacchetto WP5: punteggio, OTIF, premio sul mercato, certificati, condizioni).
 * Contratto della fondazione: la scheda laterale SupplierD({d, id}), aperta con openDrawer('supplier', id); il pacchetto aggiunge la scheda Acquisti › Fornitori. */
import React from 'react';
import { LuTruck } from 'react-icons/lu';
import { openDrawer } from '../core/store.js';
import { nf, dateIt } from '../core/util.js';
import { Drawer, Kv } from '../ui/ui.jsx';

export function SupplierD({ d, id }) {
  const s = (d.suppliers || []).find(x => x.id === id);
  if (!s) return <Drawer title="Fornitore non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  const ingName = i => (d.ingredients || []).find(x => x.id === i)?.name || i;
  const lots = (d.ingLots || []).filter(l => l.supplierId === id || (!l.supplierId && l.supplier === s.name)).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Drawer title={s.name} sub={`Fornitore${s.code ? ' · ' + s.code : ''}`} icon={<span className="dicon"><LuTruck /></span>}>
      <Kv items={[['Materie prime', (s.ingIds || []).map(ingName).join(', ') || '—'], ['Qualifica', s.approval || '—'],
        ['Pagamento', s.paymentDays != null ? `${s.paymentDays} giorni${s.endOfMonth ? ' fine mese' : ''}` : '—'], ['Ordine minimo', s.minOrderT != null ? `${nf(s.minOrderT)} t` : '—']]} />
      <div className="dsec"><div className="eyebrow">Ultimi lotti ricevuti</div>
        {lots.length ? lots.slice(0, 8).map(l => <button key={l.id} className="dlink" onClick={() => openDrawer('ingLot', l.id)}><span className="code">{l.code}</span><span className="muted">{dateIt(l.date, 'dm')} · {nf(l.tonnes, 1)} t · {nf(l.price, 1)} €/t</span></button>)
          : <span className="small muted">Nessun lotto registrato.</span>}
      </div>
    </Drawer>
  );
}
