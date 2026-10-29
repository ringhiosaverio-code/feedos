/* FeedOS 18 · ESG › Rischi climatici: elementi condivisi delle schede (prefisso di classe eri-): livello dei pericoli, stato della
 * copertura, mappa dei siti senza sfondo geografico (solo posizioni relative), matrice probabilità × impatto. Nessun dato qui: si
 * riceve tutto da esg-rischi.js. Testi in italiano, numeri con nf/dateIt. */
import React from 'react';
import { Chip } from '../ui/ui.jsx';
import { nf, dateIt } from '../core/util.js';
import { LEVEL_LABEL } from '../engine/esg-rischi.js';

export const fin = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
/** Frazione come percentuale (— se manca). */
export const pctTxt = (v, d = 0) => (fin(v) ? `${nf(+v * 100, d)}%` : '—');
/** Euro senza decimali (— se manca). */
export const eurTxt = v => (fin(v) ? `${nf(+v, 0)} €` : '—');
/** Data gg/mm/aaaa (— se manca). */
export const dateTxt = s => (s && /^\d{4}-\d{2}-\d{2}/.test(String(s)) ? dateIt(String(s).slice(0, 10)) : '—');
/** Giorni alla scadenza in parole. */
export const daysTxt = n => (n == null ? '' : n < 0 ? `scaduta da ${-n} ${-n === 1 ? 'giorno' : 'giorni'}` : n === 0 ? 'scade oggi' : `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`);

/** Livello di un pericolo: quattro segmenti neutri, il numero e la parola (0 trascurabile … 4 molto alto). */
export function LevelMeter({ level }) {
  if (!fin(level)) return <span className="eri-na">n.d.</span>;
  const n = Math.max(0, Math.min(4, Math.round(+level)));
  return (
    <span className="eri-lv" title={`Livello ${n} su 4: ${LEVEL_LABEL[n]}`}>
      <span className="eri-lv-bars" aria-hidden="true">{[1, 2, 3, 4].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
      <span className="eri-lv-n">{n}</span><span className="eri-lv-t">{LEVEL_LABEL[n]}</span>
    </span>
  );
}

const INS = { conforme: ['good', 'conforme'], sottoassicurato: ['crit', 'sottoassicurato'], 'rischi-mancanti': ['crit', 'rischi mancanti'], scaduta: ['crit', 'scaduta'],
  assente: ['crit', 'assente'], 'valori-mancanti': ['outline', 'valori da inserire'] };
/** Stato della copertura di un sito. */
export function InsuranceChip({ status }) {
  const [k, l] = INS[status] || ['outline', status || '—'];
  return <Chip kind={k} title="Copertura catastrofale: sisma, alluvione e frana, somma pari al valore dei beni">{l}</Chip>;
}

/** Quanto è esposto un sito: numero di pericoli di livello 3 o più, con il colore del tono. */
export function HighChip({ n }) {
  if (n == null) return <span className="muted small">non valutato</span>;
  return n > 0 ? <Chip kind="warn">{n} {n === 1 ? 'pericolo alto' : 'pericoli alti'}</Chip> : <Chip kind="good">nessun pericolo alto</Chip>;
}

/** Posizione in chilometri rispetto al centro (nord in alto). */
const toKm = (p, c) => ({ x: (p.lon - c.lon) * 111.32 * Math.cos(c.lat * Math.PI / 180), y: -(p.lat - c.lat) * 110.57 });

/**
 * Mappa semplificata dei siti: stabilimento e siti in pieno, clienti in punti piccoli (entro 40 km), scala di 10 km.
 * Nessuna tessera né dato di rete: solo posizioni relative al centro dello stabilimento.
 */
export function SiteMap({ plant, sites, customers = [], ariaLabel = 'Mappa dei siti' }) {
  const W = 640, H = 340, pad = 40;
  const pts = [];
  const c = plant || sites.find(s => fin(s.lat) && fin(s.lon)) || null;
  if (!c) return <div className="eri-empty small">Coordinate dei siti mancanti: si inseriscono nella scheda del sito.</div>;
  const center = { lat: +c.lat, lon: +c.lon };
  const sitesP = sites.filter(s => fin(s.lat) && fin(s.lon)).map(s => ({ ...s, ...toKm(s, center) }));
  const custP = customers.filter(x => fin(x.lat) && fin(x.lon)).map(x => ({ ...x, ...toKm(x, center) })).filter(x => Math.hypot(x.x, x.y) <= 40);
  pts.push(...sitesP, ...custP, { x: 0, y: 0 });
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const spanX = Math.max(4, Math.max(...xs) - Math.min(...xs)), spanY = Math.max(4, Math.max(...ys) - Math.min(...ys));
  const k = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const X = x => W / 2 + x * k, Y = y => H / 2 + y * k;
  const bar = k * 10 <= W / 3 ? 10 : 5;
  return (
    <>
      <svg className="eri-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {custP.map(x => <circle key={'c' + x.id} cx={X(x.x)} cy={Y(x.y)} r={2} className="eri-map-cu"><title>{x.name || 'Cliente'}</title></circle>)}
        {sitesP.map((s, i) => (
          <g key={s.id}>
            <circle cx={X(s.x)} cy={Y(s.y)} r={s.main ? 6 : 5} className={s.owned === false ? 'eri-map-ext' : s.main ? 'eri-map-main' : 'eri-map-site'}><title>{s.name}</title></circle>
            <text x={X(s.x) + 9} y={Y(s.y) - 8} className="eri-map-lb">{i + 1}</text>
          </g>
        ))}
        <g className="eri-map-scale" transform={`translate(${W - pad - bar * k}, ${H - pad / 2})`}>
          <line x1={0} y1={0} x2={bar * k} y2={0} /><line x1={0} y1={-4} x2={0} y2={4} /><line x1={bar * k} y1={-4} x2={bar * k} y2={4} />
          <text x={0} y={-8}>{bar} km</text>
        </g>
      </svg>
      {sitesP.length > 0 && (
        <ol className="eri-legend" aria-label="Siti numerati sulla mappa">
          {sitesP.map((s, i) => <li key={s.id}><b>{s.name || `Sito ${i + 1}`}</b>{s.comune ? <span className="small muted"> · {s.comune}</span> : null}</li>)}
        </ol>
      )}
    </>
  );
}

/** Matrice 5 × 5 (probabilità in colonna, impatto in riga): ogni cella elenca i rischi che vi cadono. */
export function RiskMatrix({ rows, onPick }) {
  const cell = (L, I) => rows.filter(r => +r.likelihood === L && +r.impact === I);
  const band = (L, I) => { const s = L * I; return s >= 15 ? 'hi' : s >= 8 ? 'mid' : 'lo'; };
  return (
    <div className="eri-mx" role="table" aria-label="Matrice probabilità per impatto dei rischi">
      <div className="eri-mx-corner" role="columnheader">Impatto ↓ · Probabilità →</div>
      {[1, 2, 3, 4, 5].map(L => <div key={'h' + L} className="eri-mx-h" role="columnheader">{L}</div>)}
      {[5, 4, 3, 2, 1].map(I => (
        <React.Fragment key={'r' + I}>
          <div className="eri-mx-h" role="rowheader">{I}</div>
          {[1, 2, 3, 4, 5].map(L => {
            const xs = cell(L, I);
            return (
              <div key={`${L}-${I}`} role="cell" className={`eri-mx-c eri-mx-${band(L, I)}`} title={`Probabilità ${L}, impatto ${I}: ${xs.length} ${xs.length === 1 ? 'rischio' : 'rischi'}`}>
                {xs.map(r => <button key={r.id} type="button" className="eri-mx-b" onClick={() => onPick?.(r)} aria-label={`${r.driver}, probabilità ${L}, impatto ${I}`}>{r.id}</button>)}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
