/* FeedOS 16 · presentazione guidata: dieci passi attraverso lo stabilimento dimostrativo, con evidenziazione
 * dell'area di schermo e testo breve. Frecce ← → per spostarsi, Esc per uscire. Pensata anche per la seduta di laurea. */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { LuArrowLeft, LuArrowRight, LuX } from 'react-icons/lu';
import { useUi, uiStore, useData, closeDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { Btn } from '../ui/ui.jsx';

const hotLot = d => { const hot = d.ingLots.filter(l => (l.analyses?.AFB1 ?? 0) >= 10 && l.status === 'accettato'); const used = hot.filter(l => l.ingId === 'mais' && l.remaining < l.tonnes - 0.5).sort((a, b) => b.analyses.AFB1 - a.analyses.AFB1); return (used[0] || hot[0])?.id; };
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const when = d => { const f = d.formulas.find(x => x.id === staleFormula(d)); return f?.approvedAt ? `a ${MESI[+f.approvedAt.slice(5, 7) - 1]}` : 'qualche mese fa'; };
const staleFormula = d => d.formulas.find(f => f.id === 'f-vl18')?.id || d.formulas[0]?.id;

export const STEPS = [
  { to: ['oggi', 'decisioni'], sel: '#oggi-decisioni', title: 'Oggi: le decisioni, con il perché', text: 'FeedOS legge ogni giorno formule, scorte, lotti, energia e offerte e propone le decisioni in ordine di urgenza e di impatto economico. Ogni segnale spiega i numeri; nessuna azione parte da sola: si apre, si assegna, si rimanda o si ignora, e tutto resta nel registro.' },
  { to: ['gemello'], sel: '.twin', title: 'Il gemello digitale', text: 'Lo stabilimento in un solo disegno: dalle materie prime ai silos, alle linee, ai clienti. Lo stesso schema mostra materia, costo, energia e CO₂ dell’ultimo mese, con i flussi calcolati dai dati registrati.' },
  { to: d => ['formulazione', 'formule', staleFormula(d)], sel: '#fx-opt', title: 'Formule a costo minimo', text: d => `La formula approvata ${when(d)}, ai prezzi di oggi, costa più del necessario. «Ottimizza» trova la composizione di costo minimo che rispetta tutta la specifica e l’aflatossina; i prezzi ombra dicono quanto costa ogni vincolo. Nulla cambia senza approvazione.` },
  { to: ['acquisti', 'fabbisogni'], sel: '#acq-sugg', title: 'Dal piano agli ordini', text: 'Il piano delle prossime 8 settimane diventa fabbisogno di materie prime. FeedOS proietta le scorte, pianifica gli ordini con la data utile e distingue ciò che è in ritardo da ciò che si può ancora programmare.' },
  { to: ['produzione', 'energia', 'L2'], sel: '#prod-energy', title: 'Energia per tonnellata, linea per linea', text: 'La linea pellet 2 consuma l’11% in più per tonnellata da cinque settimane e nello stesso periodo arrivano reclami per pellet friabile: due segnali collegati. La verifica si assegna alla manutenzione con un clic.' },
  { to: d => ['qualita', 'richiamo', hotLot(d)], sel: '#q-recall-kpi', wait: 400, title: 'Richiamo in millisecondi', text: 'Da un lotto di mais con aflatossina alta ai lotti di mangime che lo contengono, ai clienti che li hanno ricevuti, con il bilancio di massa chiuso. Il Regolamento 178/2002 chiede di saperlo in fretta: qui serve meno di un millisecondo.' },
  { to: ['commerciale', 'offerte', 'nuova'], sel: '#com-offer', title: 'Offerte con il margine vero', text: 'Mentre l’agente scrive il prezzo, FeedOS mostra costo pieno di oggi, prezzo minimo e obiettivo. Le offerte sotto il minimo diventano un segnale per la direzione, prima dell’invio.' },
  { to: ['economia', 'scenari'], before: () => uiStore.set({ scenarioSeed: { byIngredient: { mais: 10 } } }), sel: '#eco-results', wait: 500, title: 'E se il mais sale del 10%?', text: 'Lo scenario si propaga su formule, costi, margini e CO₂. La ri-ottimizzazione assorbe una parte dell’aumento; il risparmio già disponibile oggi è tenuto separato, per non attribuirlo allo scenario.' },
  { to: ['esg', 'indicatori'], sel: '#esg-kpi', title: 'I 49 indicatori della tesi, dai dati', text: 'Il registro della tesi (ambiente, sociale, economia, governance) è alimentato dai dati di ogni giorno: ogni valore dichiara se viene dai dati, se è stato inserito o se manca. Da qui nascono energia e CO₂, il passaporto di prodotto e la bozza del VSME.' },
  { to: ['esg', 'passaporto'], sel: '#esg-passport', title: 'Il passaporto di prodotto', text: 'Per ogni mangime: impronta stimata dalla culla al cancello, origine delle materie prime, co-prodotti, soia certificata, conformità dei lotti. Uno strumento per parlare di sostenibilità con numeri verificabili.' },
];

export function Tour() {
  const step = useUi(s => s.tour);
  const d = useData();
  const [rect, setRect] = useState(null);
  const S = step != null ? STEPS[step] : null;
  useEffect(() => {
    if (!S) return;
    closeDrawer(); uiStore.set({ palette: false });
    S.before?.();
    const to = typeof S.to === 'function' ? S.to(d) : S.to;
    go(...to);
    setRect(null);
    let tries = 0, alive = true;
    const find = () => {
      if (!alive) return;
      const el = document.querySelector(S.sel);
      if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => alive && measure(), 80); }
      else if (tries++ < 60) setTimeout(find, 60);
    };
    const measure = () => { const el = document.querySelector(S.sel); if (el) { const r = el.getBoundingClientRect(); setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); } };
    setTimeout(find, S.wait || 150);
    const on = () => measure();
    window.addEventListener('resize', on); window.addEventListener('scroll', on, true);
    return () => { alive = false; window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [step]);
  useEffect(() => {
    if (step == null) return;
    const k = e => {
      if (e.key === 'Escape') uiStore.set({ tour: null });
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target?.tagName !== 'BUTTON')) uiStore.set({ tour: step < STEPS.length - 1 ? step + 1 : null });
      else if (e.key === 'ArrowLeft') uiStore.set({ tour: Math.max(0, step - 1) });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [step]);
  if (!S) return null;
  const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
  const r = rect ? { x: Math.max(4, rect.x - pad), y: Math.max(4, rect.y - pad), w: Math.min(vw - 8, rect.w + pad * 2), h: Math.min(vh - 8, rect.h + pad * 2) } : null;
  const cardW = Math.min(400, vw - 32);
  let pos = { left: (vw - cardW) / 2, top: vh / 2 - 120 };
  if (r) {
    const below = r.y + r.h + 14, above = r.y - 14;
    if (vh - below > 230) pos = { left: Math.min(Math.max(16, r.x), vw - cardW - 16), top: below };
    else if (above > 230) pos = { left: Math.min(Math.max(16, r.x), vw - cardW - 16), top: above - 220 };
    else pos = { left: vw - cardW - 16, top: Math.max(16, vh - 260) };
  }
  const last = step === STEPS.length - 1;
  return (
    <>
      {r ? <div className="tour-spot" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} /> : <div className="scrim" style={{ zIndex: 84 }} />}
      <div className="tour-card" role="dialog" aria-modal="false" aria-label={S.title} style={{ left: pos.left, top: pos.top, width: cardW }}>
        <div className="row between"><span className="eyebrow">Presentazione · {step + 1} di {STEPS.length}</span><Btn kind="ghost" small icon={LuX} title="Esci dalla presentazione" onClick={() => uiStore.set({ tour: null })} /></div>
        <h3>{S.title}</h3>
        <p className="small" style={{ color: 'var(--ink-2)' }}>{typeof S.text === 'function' ? S.text(d) : S.text}</p>
        <div className="tour-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}</div>
        <div className="row between">
          <Btn small kind="ghost" icon={LuArrowLeft} disabled={step === 0} onClick={() => uiStore.set({ tour: step - 1 })}>Indietro</Btn>
          <Btn small kind="primary" onClick={() => uiStore.set({ tour: last ? null : step + 1 })}>{last ? 'Fine' : 'Avanti'}{!last && <LuArrowRight aria-hidden="true" />}</Btn>
        </div>
      </div>
    </>
  );
}
