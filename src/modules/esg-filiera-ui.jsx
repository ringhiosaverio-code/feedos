/* FeedOS 18 · ESG › EUDR e fornitori: elementi condivisi dalle sottosezioni (numeri, etichette di stato, indicatori separati,
 * mappa degli appezzamenti, esportazioni). Prefisso CSS efl-. Nessuno stato proprio. */
import React from 'react';
import { LuCheck, LuX, LuMinus } from 'react-icons/lu';
import { nf } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { store, toast } from '../core/store.js';
import { Chip } from '../ui/ui.jsx';
import { plotMapModel } from '../engine/esg-filiera-geo.js';

export const pctTxt = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : `${nf(v * 100, d)}%`);
export const tTxt = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v, Math.abs(v) < 10 ? 1 : 0));
export const eurTxt = v => (v == null || !Number.isFinite(+v) ? '—' : Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 2)} M€` : Math.abs(v) >= 1e4 ? `${nf(v / 1e3, 0)} mila €` : `${nf(v, 0)} €`);
export const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
/** Scarica righe in CSV (separatore punto e virgola, virgola decimale). */
export function downloadCsv(name, rows, cols) { download(`feedos-${name}-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8'); }
export function downloadText(name, ext, text, mime = 'text/plain;charset=utf-8') { download(`feedos-${name}-${stamp()}.${ext}`, text, mime); }
export const slugName = s => String(s || 'fornitore').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\((demo|fantasia)\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
export const shortName = s => String(s || '').replace(/ \((demo|fantasia)\)/g, '');

const TIER = { basso: ['good', 'rischio basso'], standard: ['warn', 'rischio standard'], alto: ['crit', 'rischio alto'] };
/** Rischio paese (classificazione UE). */
export function TierChip({ tier }) { const [k, l] = TIER[tier] || ['outline', 'paese non noto']; return <Chip kind={k}>{l}</Chip>; }
const BAND = { trascurabile: 'good', basso: 'accent', medio: 'warn', alto: 'crit' };
/** Fascia del punteggio di rischio interno. */
export function BandChip({ band, score }) { return <Chip kind={BAND[band] || 'outline'} title="Punteggio interno: non sostituisce la valutazione del rischio dell’art. 10">{score != null ? `${score} · ` : ''}{band || '—'}</Chip>; }
const STATE = { completo: 'good', incompleto: 'warn', 'in verifica': 'accent', respinto: 'crit' };
/** Stato dei dati del lotto. */
export function StateChip({ state }) { return <Chip kind={STATE[state] || 'outline'}>{state || '—'}</Chip>; }
const REQ = { inviato: 'accent', sollecitato: 'warn', ricevuto: 'good', accettato: 'good', respinto: 'crit' };
/** Stato di una richiesta al fornitore. */
export function ReqChip({ status, overdue }) { return <Chip kind={overdue ? 'crit' : REQ[status] || 'outline'}>{overdue ? `${status} · in ritardo` : status}</Chip>; }

/** I tre indicatori del lotto, sempre separati: EUDR, DCF (fisica o in bilancio di massa), FEFAC SSG. */
export function Flags({ s }) {
  if (!s) return null;
  return (
    <span className="efl-flags">
      <Chip kind={s.eudrOk ? 'good' : 'crit'} title={s.eudrOk ? 'Requisiti EUDR del ruolo soddisfatti' : 'Requisiti EUDR mancanti'}>EUDR {s.eudrOk ? '✓' : '✗'}</Chip>
      <Chip kind={s.dcf ? 'good' : s.dcfMB ? 'accent' : 'outline'} title="Senza deforestazione e conversione: fisica (IP o segregata) o in bilancio di massa">{s.dcf ? 'DCF' : s.dcfMB ? 'DCF bil. massa' : 'DCF —'}</Chip>
      <Chip kind={s.ssg ? 'good' : 'outline'} title="Schema che supera il benchmark FEFAC SSG">{s.ssg ? 'SSG ✓' : 'SSG —'}</Chip>
    </span>
  );
}
/** Esito di un controllo: sì, no o non richiesto. */
export function Check({ ok, required = true }) {
  if (!required) return <span className="efl-chk efl-na" title="non richiesto"><LuMinus aria-hidden="true" /></span>;
  return ok ? <span className="efl-chk efl-ok" title="soddisfatto"><LuCheck aria-label="sì" /></span> : <span className="efl-chk efl-ko" title="mancante"><LuX aria-label="no" /></span>;
}

/** Mappa degli appezzamenti in SVG (nessuna mappa di sfondo): poligoni e punti con i colori del tema. */
export function PlotMap({ features, title = 'Mappa degli appezzamenti' }) {
  const m = plotMapModel(features, { width: 640, height: 320 });
  if (!m) return <p className="small muted">Nessuna coordinata da disegnare.</p>;
  return (
    <figure className="efl-map">
      <svg viewBox={`0 0 ${m.width} ${m.height}`} role="img" aria-label={title}>
        <rect width={m.width} height={m.height} className="efl-map-bg" />
        {m.shapes.map(sh => (
          <g key={sh.key} className={sh.valid ? 'efl-map-ok' : 'efl-map-ko'}>
            {sh.kind === 'area' ? <path d={sh.d} fillRule="evenodd" /> : <circle cx={sh.cx} cy={sh.cy} r={sh.r} />}
            <text x={sh.lx} y={sh.ly} textAnchor="middle">{sh.label.replace(/ \(dati dimostrativi\)/, '')}</text>
          </g>
        ))}
        <g className="efl-map-scale"><rect x="12" y={m.height - 18} width={m.scale.px} height="3" /><text x="12" y={m.height - 24}>{m.scale.label}</text>
          <text x={m.width - 12} y="18" textAnchor="end">N ↑</text><text x="12" y="18">{m.corners.nw}</text><text x={m.width - 12} y={m.height - 8} textAnchor="end">{m.corners.se}</text></g>
      </svg>
      <figcaption className="xs muted">Proiezione equirettangolare adattata agli appezzamenti, senza mappa di sfondo · coordinate WGS-84</figcaption>
    </figure>
  );
}
