/* FeedOS 16 · elementi condivisi tra i moduli: elenco dei segnali, azioni sulle decisioni, piccoli formattatori. */
import React, { useState } from 'react';
import { LuCircleAlert, LuTriangleAlert, LuInfo, LuArrowRight, LuListChecks, LuClock, LuEyeOff } from 'react-icons/lu';
import { store, toast, useData } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday } from '../core/derived.js';
import { addDays, dateIt, nf } from '../core/util.js';
import { Btn, Sev, Empty, confirm } from '../ui/ui.jsx';
import { NAV } from '../app/nav.js';

const ICON = { critico: LuCircleAlert, attenzione: LuTriangleAlert, info: LuInfo };
const OWNER = { acquisti: 'Acquisti', formulazione: 'Formulazione', produzione: 'Produzione', qualita: 'Qualità', commerciale: 'Commerciale', economia: 'Direzione', esg: 'Direzione', oggi: 'Direzione' };

export function signalActions(s, d) {
  const today = appToday(d);
  return {
    open: () => go(s.link?.area || s.area, s.link?.tab, s.link?.id),
    task: () => {
      store.batch([
        { kind: 'add', coll: 'tasks', obj: { title: s.title, detail: `${s.why} ${s.action || ''}`.trim(), area: s.area, owner: OWNER[s.area] || 'Direzione', due: addDays(today, s.severity === 'critico' ? 3 : 7), status: 'aperto', priority: s.severity === 'critico' ? 'alta' : s.severity === 'attenzione' ? 'media' : 'bassa', source: 'segnale', signalKey: s.key, createdAt: today, link: s.link } },
        { kind: 'settings', value: st => ({ ...st, signalState: { ...(st.signalState || {}), [s.key]: { status: 'in attività', at: today } } }) },
      ], 'Attività creata da un segnale: ' + s.title);
      toast('Attività creata e assegnata a ' + (OWNER[s.area] || 'Direzione'), 'ok', { label: 'Annulla', fn: () => store.undo() });
    },
    snooze: () => {
      store.settings(st => ({ ...st, signalState: { ...(st.signalState || {}), [s.key]: { status: 'rimandato', until: addDays(today, 7), at: today } } }), 'Segnale rimandato di 7 giorni: ' + s.title);
      toast('Rimandato di 7 giorni', 'ok', { label: 'Annulla', fn: () => store.undo() });
    },
    dismiss: () => confirm('Ignorare questo segnale?', <p>«{s.title}» non comparirà più. La scelta resta nel registro delle modifiche e si può annullare.</p>, () => {
      store.settings(st => ({ ...st, signalState: { ...(st.signalState || {}), [s.key]: { status: 'ignorato', at: today, role: st.role } } }), 'Segnale ignorato: ' + s.title);
      toast('Segnale ignorato', 'ok', { label: 'Annulla', fn: () => store.undo() });
    }, { ok: 'Ignora' }),
  };
}

export function SignalList({ items, limit = 8, compact, emptyText = 'Nessuna decisione in sospeso per questa vista.' }) {
  const d = useData();
  const [all, setAll] = useState(false);
  const view = all ? items : items.slice(0, limit);
  if (!items.length) return <Empty title="Tutto in ordine" icon={LuListChecks}>{emptyText}</Empty>;
  return (
    <div className="signals">
      {view.map(s => {
        const I = ICON[s.severity] || LuInfo;
        const a = signalActions(s, d);
        return (
          <article key={s.key} className={`sig ${s.severity}`}>
            <span className="ic" aria-hidden="true"><I /></span>
            <div style={{ minWidth: 0 }}>
              <h4>{s.title}</h4>
              <p className="why">{s.why}</p>
              {!compact && s.action && <p className="act">Prossimo passo: {s.action}</p>}
              <div className="meta"><Sev level={s.severity} /><span className="chip outline">{NAV[s.area]?.label || s.area}</span></div>
            </div>
            <div className="btns">
              <Btn small kind="primary" icon={LuArrowRight} onClick={a.open}>Apri</Btn>
              {!compact && <Btn small onClick={a.task} icon={LuListChecks} title="Crea un’attività con responsabile e scadenza">Assegna</Btn>}
              {!compact && <Btn small kind="ghost" onClick={a.snooze} icon={LuClock} title="Rimanda di 7 giorni" />}
              {!compact && <Btn small kind="ghost" onClick={a.dismiss} icon={LuEyeOff} title="Ignora" />}
            </div>
          </article>
        );
      })}
      {items.length > limit && <div className="row" style={{ padding: '10px 16px' }}><Btn small kind="ghost" onClick={() => setAll(x => !x)}>{all ? 'Mostra meno' : `Mostra tutte (${items.length})`}</Btn></div>}
    </div>
  );
}

export const T = v => v == null ? '—' : nf(v, v < 10 ? 1 : 0) + ' t';
export const E = (v, dcm = 2) => v == null ? '—' : nf(v, dcm) + ' €/t';
export function when(d, s) { return dateIt(s, 'dm'); }
