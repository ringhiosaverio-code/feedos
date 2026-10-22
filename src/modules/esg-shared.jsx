/* FeedOS 18 · Elementi condivisi dei pacchetti ESG (fondazione 18): stesso aspetto in ogni scheda.
 * Periodo: l'area ESG non ha la barra del periodo globale (period:false) → ogni pagina usa l'esercizio ESG con
 * useEsgPeriod(d) e <EsgPeriodBar/> (scelta ricordata in prefs.esgPeriod; di base l'esercizio corrente). Mai usePeriod qui.
 * Esporta: EsgPeriodBar, useEsgPeriod, EsgSubNav, QualityChip, StatusChip, Lineage, EvidenceCount, MethodNote, Disclaimer,
 * EsgCard (riquadro del cruscotto), esgSettings, esgSettingsOp, setEsgSettings. Stile in styles/esg-shared.css (prefisso esh-). */
import React from 'react';
import { LuCalendarRange, LuInfo, LuPaperclip, LuArrowRight, LuLeaf, LuBookOpen } from 'react-icons/lu';
import { store } from '../core/store.js';
import { go, href } from '../core/router.js';
import { esgPeriods } from '../core/derived.js';
import { usePrefs, setPrefs } from '../core/prefs.js';
import { nf, dateIt } from '../core/util.js';
import { periodByKey, previousPeriod, esgSettings, esgSettingsOp } from '../engine/esg-years.js';
import { T } from '../engine/esg-nlg.js';
import { evidenceFor } from '../engine/esg-governance.js';
import { Chip, Select, Kv } from '../ui/ui.jsx';

export { esgSettings, esgSettingsOp };

/** Aggiorna settings.esg18[pkg] con un passo annullabile: oggetto = fusione profonda; funzione (attuale) → nuovo valore intero. */
export function setEsgSettings(pkg, patchOrFn, label) {
  return store.batch([esgSettingsOp(pkg, patchOrFn)], label || `Impostazioni ESG · ${pkg}`);
}

/**
 * Esercizio ESG scelto: { P, key, periods, setKey, prev }. P ha la forma dei periodi ESG ({key, from, to, days, months, label,
 * short, mode}) e si passa ai motori al posto del periodo globale; prev è l'esercizio precedente (anche senza dati).
 */
export function useEsgPeriod(d) {
  const periods = esgPeriods(d);
  const saved = usePrefs(p => p.esgPeriod);
  const P = periods.find(p => p.key === saved) || periods[0];
  return { P, key: P.key, periods, setKey: k => setPrefs({ esgPeriod: k }), prev: previousPeriod(d, P.key) };
}

/** Selettore dell'esercizio ESG. Senza value/onChange usa la scelta ricordata (useEsgPeriod). */
export function EsgPeriodBar({ d, value, onChange }) {
  const own = useEsgPeriod(d);
  const P = (value && (own.periods.find(p => p.key === value) || periodByKey(d, value))) || own.P;
  const options = own.periods.some(p => p.key === P.key) ? own.periods : [P, ...own.periods];
  return (
    <div className="esh-pbar no-print" role="group" aria-label="Esercizio ESG">
      <LuCalendarRange aria-hidden="true" />
      <span className="esh-pbar-l">Esercizio</span>
      <Select className="slim auto" value={P.key} onChange={onChange || own.setKey} options={options.map(p => ({ id: p.key, label: p.label }))} ariaLabel="Esercizio ESG" />
      <span className="small muted">{dateIt(P.from)} – {dateIt(P.to)} · {P.mode === 'anno' ? 'esercizio annuale' : 'ultimi 12 mesi chiusi'}</span>
    </div>
  );
}

/** Sottosezioni di una scheda: con tab va a #esg.<tab>.<id>, altrimenti chiama onChange(id). items: [{id, label, badge?}]. */
export function EsgSubNav({ items = [], value, onChange, tab, label = 'Sezioni' }) {
  return (
    <nav className="esh-subnav no-print" aria-label={label}>
      {items.map(it => (
        <button key={it.id} type="button" aria-current={it.id === value ? 'page' : undefined} onClick={() => (tab ? go('esg', tab, it.id) : onChange?.(it.id))}>
          {it.label}{it.badge != null && it.badge !== '' && <span className="esh-badge">{it.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

const QUALITY = { misurato: ['good', 'misurato'], calcolato: ['accent', 'calcolato'], stimato: ['warn', 'stimato'], dichiarato: ['violet', 'dichiarato'], default: ['outline', 'predefinito'], mancante: ['crit', 'mancante'] };
/** Qualità di un dato (misurato, calcolato, stimato, dichiarato, default, mancante). */
export function QualityChip({ q }) {
  const [kind, label] = QUALITY[q] || ['outline', q || '—'];
  return <Chip kind={kind} title={`Qualità del dato: ${label}`}>{label}</Chip>;
}

const STATUS = { 'da verificare': 'warn', verificato: 'good', preliminare: 'accent', 'da trascrivere': 'outline', dimostrativo: 'maize', 'non verificato': 'warn' };
/** Stato di un contenuto (fattore, scadenza, norma): «da verificare» è sempre visibile. */
export function StatusChip({ status }) {
  if (!status) return null;
  return <Chip kind={STATUS[status] || 'outline'} title={status === 'da verificare' ? 'Non ancora verificato su una fonte ufficiale' : undefined}>{status}</Chip>;
}

const numTxt = v => (typeof v === 'number' ? nf(v, Math.abs(v) < 1 ? 4 : Math.abs(v) < 100 ? 2 : 0) : String(v));
/** Da dove viene un numero: formula, fattore, fonte, anno, registrazioni, qualità, evidenze, nota (si apre al clic). */
export function Lineage({ item, label = 'Da dove viene' }) {
  if (!item || typeof item !== 'object') return null;
  const f = item.factor;
  const rows = [
    item.formula ? ['Formula', item.formula] : null,
    item.method ? ['Metodo', item.method] : null,
    f != null ? ['Fattore', typeof f === 'object' ? `${numTxt(f.value)} ${f.unit || ''}${f.source ? ' · ' + f.source : ''}${f.year ? ` (${f.year})` : ''}` : numTxt(f)] : null,
    item.source ? ['Fonte', item.source] : null,
    item.year != null ? ['Anno', String(item.year)] : null,
    item.records != null ? ['Registrazioni', Array.isArray(item.records) ? nf(item.records.length) : numTxt(item.records)] : null,
    item.quality ? ['Qualità', <QualityChip q={item.quality} />] : null,
    Array.isArray(item.evidence) && item.evidence.length ? ['Evidenze', nf(item.evidence.length)] : null,
    item.note ? ['Nota', item.note] : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <details className="esh-lin">
      <summary><LuInfo aria-hidden="true" />{label}</summary>
      <Kv items={rows} />
    </details>
  );
}

/** Numero di evidenze collegate a un record (registro delle evidenze del pacchetto governance); porta al registro. */
export function EvidenceCount({ d, type, refId }) {
  const n = evidenceFor(d, type, refId).length;
  return (
    <button type="button" className={`linkish small esh-ev ${n ? '' : 'esh-ev0'}`} onClick={() => go('esg', 'governance', 'evidenze')} title="Apri il registro delle evidenze">
      <LuPaperclip aria-hidden="true" />{n ? `${nf(n)} ${n === 1 ? 'evidenza' : 'evidenze'}` : 'nessuna evidenza'}
    </button>
  );
}

/** Nota metodologica: testo (o {it, en}) con paragrafi separati da una riga vuota. */
export function MethodNote({ text, lang = 'it', title, open = false }) {
  const s = text && typeof text === 'object' ? (text[lang] ?? text.it ?? '') : String(text || '');
  if (!s.trim()) return null;
  return (
    <details className="esh-method" open={open}>
      <summary><LuBookOpen aria-hidden="true" />{title || T('method', {}, lang)}</summary>
      {s.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>)}
    </details>
  );
}

/** Avvertenza obbligatoria di calcolatori, report e lettere. */
export function Disclaimer({ lang = 'it' }) {
  return <p className="esh-disc">{T('disclaimer', {}, lang)}</p>;
}

/**
 * Riquadro del cruscotto ESG (stesso aspetto per i nove pacchetti). Senza value mostra «In preparazione».
 * status 'ok' | 'warn' | 'bad' colora il bordo; chip accanto al titolo; children sotto il valore; collegamento alla scheda.
 */
export function EsgCard({ title, tab, id, icon: I = LuLeaf, value, unit, sub, status, chip, children }) {
  return (
    <article className={`esh-card${status ? ' esh-' + status : ''}`} aria-label={title}>
      <header className="esh-card-hd"><span className="esh-card-ic"><I aria-hidden="true" /></span><b>{title}</b>{chip}</header>
      {value != null && value !== '' ? <div className="esh-card-v">{value}{unit && <small>{unit}</small>}</div> : <div className="esh-card-wip">In preparazione</div>}
      {sub && <p className="esh-card-sub">{sub}</p>}
      {children}
      <a className="esh-card-go" href={href('esg', tab, id)}>Apri la scheda<LuArrowRight aria-hidden="true" /></a>
    </article>
  );
}
