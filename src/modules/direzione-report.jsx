/* FeedOS 17 · Direzione › Report CdA (WP1): anteprima su fogli A4 (una pagina per sezione), commenti per sezione salvati
 * nella chiusura del mese, stampa o PDF sempre in tema chiaro, esportazione in CSV e Markdown. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuPrinter, LuDownload, LuFileText, LuSnowflake } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { signals } from '../core/derived.js';
import { nf, sf, monthLabel, endOfMonth, dateIt, monthsIn, addMonths } from '../core/util.js';
import { download, stamp } from '../core/io.js';
import { makePeriod, comparePeriod } from '../core/period.js';
import { firstFactDate } from '../engine/pnl.js';
import { buildReport, reportMarkdown, reportCsv, reportComments, commentOps, defaultReportMonth, cellText, REPORT_TEMPLATES, TEMPLATE_LABELS } from '../engine/report.js';
import { PrintPage, printNow } from '../ui/print.jsx';
import { Panel, Btn, Seg, Select, Chip, Empty } from '../ui/ui.jsx';
import { useDir, HWaterfall, eurTxt } from './direzione-conto.jsx';

const CMP = [{ id: 'prec', label: 'Mese prima' }, { id: 'ap', label: 'Anno prima' }, { id: 'budget', label: 'Budget' }, { id: 'nessuno', label: 'Nessuno' }];

/** Valore di un indicatore del report (le percentuali arrivano come frazioni). */
function kpiValue(k) {
  // sezioni di altri pacchetti: il valore può arrivare già formattato
  if (typeof k.value === 'string' && k.value.trim() && !Number.isFinite(+k.value)) return k.value + (k.unit && !k.value.includes(k.unit) ? ' ' + k.unit : '');
  if (k.value == null || k.value === '' || !Number.isFinite(+k.value)) return '—';
  if (k.unit === '€') return eurTxt(+k.value);
  if (k.unit === '%') return nf(+k.value * 100, k.decimals ?? 1) + '%';
  return nf(+k.value, k.decimals ?? 0) + (k.unit ? ' ' + k.unit : '');
}
function kpiDelta(k) {
  const c = k.cmp;
  if (!c || c.value == null || k.value == null || k.value === '' || !Number.isFinite(+c.value) || !Number.isFinite(+k.value)) return null;
  if (c.cov != null && c.cov < 0.9) return { text: 'non confrontabile', cls: '' };
  const dv = +k.value - +c.value, up = (c.good || 'up') === 'up';
  let text;
  if (c.kind === 'ratio') text = k.unit === '%' ? sf(dv * 100, 1) + ' pt' : sf(dv, k.decimals ?? 1) + (k.unit ? ' ' + k.unit : '');
  else text = Math.abs(c.value) >= 0.5 ? sf(dv / Math.abs(c.value) * 100, 1) + '%' : '—';
  return { text: `${text}${c.label ? ' vs ' + c.label : ''}`, cls: Math.abs(dv) < 1e-9 ? '' : (dv > 0) === up ? 'good' : 'bad' };
}

function SectionBody({ s }) {
  return (
    <>
      {s.kpis?.length > 0 && <div className="dz-rk">{s.kpis.map((k, i) => { const dl = kpiDelta(k); return (
        <div key={i} className={k.status ? `st-${k.status}` : undefined}><span>{k.label}</span><b>{kpiValue(k)}</b>{dl && <small className={dl.cls}>{dl.text}</small>}{(k.note || k.foot) && <small>{k.note || k.foot}</small>}</div>); })}</div>}
      {s.id === 'ponte' && s.steps && <HWaterfall steps={[{ key: 'a', label: 'Partenza', value: s.start, kind: 'total' }, ...s.steps.filter(x => Math.abs(x.value) >= 0.5).map(x => ({ ...x, kind: 'step', def: null })), { key: 'b', label: 'Arrivo', value: s.end, kind: 'total' }]} ariaLabel="Ponte del margine" />}
      {s.table?.rows?.length > 0 && s.id !== 'ponte' && (
        <div className="dz-rtw">
          <table className="dz-rt">
            <thead><tr>{s.table.cols.map(c => <th key={c.key} className={c.align === 'r' ? 'r' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{s.table.rows.map((r, i) => <tr key={i} className={r.total || r.kind === 'total' ? 'tot' : ''}>{s.table.cols.map(c => <td key={c.key} className={c.align === 'r' ? 'r' : ''}>{cellText(r, c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {s.narrative?.length > 0 && <div className="dz-rn">{s.narrative.map((t, i) => <p key={i}>{t}</p>)}</div>}
    </>
  );
}

/** Commento della sezione: si modifica a schermo, si stampa come testo. Salvato all'uscita dal campo. */
function Comment({ d, month, id, value }) {
  const [txt, setTxt] = useState(value || '');
  useEffect(() => { setTxt(value || ''); }, [value, month]);
  const save = () => {
    if ((txt || '') === (value || '')) return;
    store.batch(commentOps(d, month, id, txt), `Commento al report CdA (${monthLabel(month, false)}): ${id}`);
    toast('Commento salvato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <div className="dz-comment">
      <label className="no-print small" style={{ fontWeight: 600, color: 'var(--ink-2)' }} htmlFor={`cm-${id}`}>Commento della direzione</label>
      <textarea id={`cm-${id}`} className="input no-print" value={txt} placeholder="Commento per il consiglio (facoltativo): resta nella chiusura del mese" onChange={e => setTxt(e.target.value)} onBlur={save} />
      {txt && <div className="print-only">{txt}</div>}
    </div>
  );
}

export function ReportCda({ d }) {
  const dir = useDir(d);
  const { ctx, today, spec } = dir;
  const first = firstFactDate(ctx.facts);
  const months = useMemo(() => {
    const s = new Set((d.salesHistory || []).map(h => String(h.month).slice(0, 7)));
    if (first) for (const m of monthsIn(first.slice(0, 7), addMonths(today.slice(0, 7), -1))) s.add(m);
    return [...s].filter(m => m < today.slice(0, 7)).sort().reverse();
  }, [d.salesHistory, first, today]);
  const [tpl, setTpl] = useState('cda');
  const [month, setMonth] = useState(() => defaultReportMonth(d, today));
  const [cmpMode, setCmp] = useState(() => (spec.compare === 'nessuno' ? 'prec' : spec.compare));
  const m = months.includes(month) ? month : months[0];
  const P = useMemo(() => (m ? makePeriod(m + '-01', endOfMonth(m), { preset: 'custom', today }) : null), [m, today]);
  const C = useMemo(() => (P ? comparePeriod(P, cmpMode, today) : null), [P, cmpMode, today]);
  const sig = signals(d);
  const comments = m ? reportComments(d, m) : {};
  const r = useMemo(() => (P ? buildReport(d, ctx, P, C, tpl, { comments, signals: sig }) : null), [d, ctx, P, C, tpl, sig]);
  if (!months.length || !r) return <Panel title="Report CdA"><Empty icon={LuFileText} title="Ancora nessun mese completo">Il report del consiglio si prepara su un mese finito: servono consegne (o lo storico mensile) di almeno un mese intero.</Empty></Panel>;
  const per = `${P.label}${C ? ` · confronto: ${C.budget ? 'budget' : C.label}` : ''}`;
  const name = `report-${tpl}-${m}`;
  return (
    <>
      <Panel className="no-print dz-sheet-tools" title="Report per il consiglio" sub={`${TEMPLATE_LABELS[tpl]} · ${r.sections.length} pagine A4 · la stampa è sempre in tema chiaro, una pagina per sezione`}
        actions={<div className="row gap-s">
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuDownload} onClick={() => download(`${name}-${stamp()}.csv`, reportCsv(r), 'text/csv;charset=utf-8')}>Esporta CSV</Btn>
          <Btn small icon={LuFileText} onClick={() => download(`${name}-${stamp()}.md`, reportMarkdown(r), 'text/markdown;charset=utf-8')}>Esporta Markdown</Btn>
        </div>}>
        <div className="dz-tools">
          <span className="lbl">Modello</span>
          <Seg label="Modello" value={tpl} onChange={setTpl} options={Object.keys(REPORT_TEMPLATES).map(id => ({ id, label: { cda: 'CdA', commerciale: 'Commerciale', operations: 'Operations' }[id] }))} />
          <span className="lbl">Mese</span>
          <Select className="slim" ariaLabel="Mese del report" value={m} onChange={setMonth} options={months.map(x => ({ id: x, label: monthLabel(x, false) }))} />
          <span className="lbl">Confronto</span>
          <Seg label="Confronto" value={cmpMode} onChange={setCmp} options={CMP} />
          {r.header.closed ? <Chip kind="accent" icon={LuSnowflake}>mese chiuso</Chip> : <Chip kind="warn">mese non chiuso: numeri provvisori</Chip>}
        </div>
        {r.header.failed?.length > 0 && <div className="note warn" style={{ marginTop: 10 }}>Sezioni non disponibili per un errore nei dati: {r.header.failed.map(f => f.title).join(', ')}. Il resto del report è completo.</div>}
      </Panel>
      <div className="dz-report">
        {r.sections.map((s, i) => (
          <PrintPage key={s.id} title={s.title} period={per} dq={r.header.dqScore} issued={today}
            footer={`Report ${TEMPLATE_LABELS[tpl].toLowerCase()} · ${monthLabel(m, false)} · pagina ${i + 1} di ${r.sections.length}${r.header.closed ? ' · numeri congelati alla chiusura' : ' · numeri provvisori'}`}>
            {i === 0 && <p className="small" style={{ color: 'var(--ink-2)' }}>Report {TEMPLATE_LABELS[tpl].toLowerCase()} di {monthLabel(m, false)}{C ? `, confrontato con ${C.budget ? 'il budget' : C.label}` : ''}. Valori gestionali al costo effettivo dei lotti; i costi stimati sono indicati come tali.</p>}
            <SectionBody s={s} />
            <Comment d={d} month={m} id={s.id} value={comments[s.id]} />
          </PrintPage>
        ))}
      </div>
    </>
  );
}
