/* FeedOS 18 · Report e questionari (pacchetto WP4): elementi d'interfaccia condivisi dalle sezioni della scheda «vsme».
 * Esercizio scelto (anche quelli con una chiusura fuori dall'elenco mobile), anelli di copertura, stato dei datapoint,
 * firma (ruolo e nome), scaricamento dei file. Stile in styles/esg-report.css (prefisso erp-). */
import React from 'react';
import { usePrefs, setPrefs } from '../core/prefs.js';
import { download, stamp } from '../core/io.js';
import { nf } from '../core/util.js';
import { NAV } from '../app/nav.js';
import { reportPeriods, SIGN_ROLES } from '../engine/esg-report.js';
import { Chip, Select } from '../ui/ui.jsx';

/** Esercizio della scheda: scelta ricordata in prefs.esgPeriod (come le altre schede ESG), anche se è un esercizio chiuso fuori elenco. */
export function useReportPeriod(d) {
  const periods = reportPeriods(d);
  const saved = usePrefs(p => p.esgPeriod);
  const P = periods.find(p => p.key === saved) || periods[0];
  return { P, periods, setKey: k => setPrefs({ esgPeriod: k }) };
}

/** Percentuale leggibile (frazione → «64%»). */
export const pc = (x, dec = 0) => (x == null || !Number.isFinite(+x) ? '—' : `${nf(x * 100, dec)}%`);

/** Anello di copertura (classi .ring di app.css). */
export function CovRing({ value, label, sub, size = 92 }) {
  const stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const color = value == null ? 'var(--line-2)' : v >= 0.9 ? 'var(--good)' : v >= 0.7 ? 'var(--warn)' : 'var(--crit)';
  return (
    <div className="erp-ring">
      <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${pc(value)}`}>
        <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
        <div className="ring-c"><b>{pc(value)}</b></div>
      </div>
      <div className="erp-ring-t"><b>{label}</b>{sub && <span>{sub}</span>}</div>
    </div>
  );
}

const ST = { coperto: ['good', 'coperto'], mancante: ['crit', 'mancante'], omesso: ['accent', 'omesso con motivazione'], 'da-motivare': ['warn', 'omissione da motivare'],
  'non-applicabile': ['outline', 'non applicabile'], facoltativo: ['outline', 'facoltativo'], 'fuori-ambito': ['outline', 'fuori ambito'] };
/** Stato di un datapoint nel rapporto. */
export function DpStatus({ status }) { const [k, l] = ST[status] || ['outline', status]; return <Chip kind={k}>{l}</Chip>; }

const CL = { 'in revisione': 'warn', approvato: 'good', riaperto: 'accent', aperto: 'outline' };
/** Stato della chiusura dell'esercizio. */
export function ClosingChip({ status }) { const s = status || 'aperto'; return <Chip kind={CL[s] || 'outline'}>{s === 'aperto' ? 'esercizio aperto' : s}</Chip>; }

/** Nome della scheda ESG (come nella barra delle schede). */
export const tabLabel = tab => NAV.esg?.tabs?.find(t => t.id === tab)?.label || tab;

/** Firma: ruolo (non è un permesso) e nome facoltativo. */
export function SignFields({ value, onChange }) {
  return (
    <div className="erp-sign">
      <label className="field"><span>Chi firma (ruolo)</span>
        <Select value={value.role} onChange={role => onChange({ ...value, role })} options={[{ id: '', label: 'Scegli il ruolo' }, ...Object.entries(SIGN_ROLES).map(([id, label]) => ({ id, label }))]} ariaLabel="Ruolo di chi firma" />
      </label>
      <label className="field"><span>Nome (facoltativo)</span>
        <input className="input" value={value.name} maxLength={80} onChange={e => onChange({ ...value, name: e.target.value })} placeholder="Per esempio M. Rossi" />
      </label>
    </div>
  );
}

/** Scarica un file con il nome feedos-<argomento>-<data>.<estensione>. */
export function save(topic, ext, content) {
  const mime = ext === 'csv' ? 'text/csv;charset=utf-8' : ext === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8';
  download(`feedos-${topic}-${stamp()}.${ext}`, typeof content === 'string' ? content : JSON.stringify(content, null, 2), mime);
}
