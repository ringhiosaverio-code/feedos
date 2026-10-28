/* FeedOS 17 · Pagine di stampa A4: anteprima a schermo come un foglio, stampa sempre in tema chiaro (styles/print.css).
 * Ogni PrintPage è una pagina: intestazione con azienda, periodo, data di emissione e (facoltativo) punteggio della qualità dei dati. */
import React from 'react';
import { useData, toast } from '../core/store.js';
import { META as EDITION } from '../editions/meta.js';
import { appToday } from '../core/derived.js';
import { dateIt, nf } from '../core/util.js';

/**
 * @param title titolo della pagina · @param period testo o periodo risolto {label} · @param dq punteggio 0–100 (facoltativo)
 * @param issued data di emissione 'YYYY-MM-DD' (di base oggi dell'archivio)
 */
export function PrintPage({ title, period, dq, issued, children, className = '', footer }) {
  const d = useData();
  const co = d.settings?.company || {};
  const per = typeof period === 'string' ? period : period?.label;
  return (
    <article className={`print-page ${className}`} aria-label={typeof title === 'string' ? title : 'Pagina di stampa'}>
      <header className="pp-hd">
        <div className="pp-co"><b>{co.name || 'FeedOS'}</b>{(co.site || co.address) && <span>{co.site || co.address}</span>}</div>
        <div className="pp-meta">
          {per && <span>Periodo: <b>{per}</b></span>}
          <span>Emesso il {dateIt(issued || appToday(d))}</span>
          {dq != null && Number.isFinite(+dq) && <span>Qualità dei dati {nf(dq)}/100</span>}
        </div>
      </header>
      {title && <h1 className="pp-title">{title}</h1>}
      <div className="pp-bd">{children}</div>
      <footer className="pp-ft"><span>{footer || 'Valori gestionali elaborati con FeedOS'}</span><span>{co.short || co.name || ''}</span></footer>
    </article>
  );
}

/** Apre la stampa del browser (da lì anche «Salva come PDF»). */
/** Stampa (o «Salva come PDF» del browser). Dentro il visualizzatore di claude.ai la stampa non è permessa: si spiega cosa fare. */
export function printNow() {
  if (typeof window !== 'undefined' && window.claude?.use) {
    toast(`In questa vista la stampa non è disponibile: apri il file HTML di ${EDITION.product} nel browser per stampare o salvare in PDF`, 'err');
    return;
  }
  window.print();
}
