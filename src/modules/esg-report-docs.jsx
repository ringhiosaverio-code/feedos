/* FeedOS 18 · Report e questionari (pacchetto WP4): rapporto VS stampabile in italiano o inglese con paragrafi modificabili ed
 * esportazioni (Markdown, CSV, JSON, CSV nell'ordine EFRAG), pacchetto ESG per la banca con la tavola PMI-Banche da trascrivere,
 * storico di tre esercizi con lo storico dichiarato. */
import React, { useMemo, useState } from 'react';
import { LuPrinter, LuDownload, LuFileText, LuFileJson, LuFileSpreadsheet, LuPencil, LuSave, LuRotateCcw, LuUpload, LuHistory } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { dateIt, nf } from '../core/util.js';
import { readFile } from '../core/io.js';
import { T } from '../engine/esg-nlg.js';
import { esgToday } from '../engine/esg-years.js';
import { applyPackOps } from '../engine/esg-packs.js';
import { threeYear, bankPack, textEditOps, historyRowFor, METHODS } from '../engine/esg-report.js';
import { narratives, reportHeader, vsmeMarkdown, vsmeCsv, vsmeJson, efragCsv, bankMarkdown, bankCsv, historyCsv, histCell, unitText } from '../engine/esg-report-text.js';
import { pmiStatus, pmiTemplateCsv, pmiPackFromCsv } from '../engine/esg-report-q.js';
import { VS_MODULES, VS_SOURCE, VS_PROVIDERS } from '../data/vsme-datapoints.js';
import { PACK_REPORT_PMI } from '../data/pack-report.js';
import { Panel, Btn, Chip, Seg, Drawer } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { StatusChip, Disclaimer } from './esg-shared.jsx';
import { save } from './esg-report-ui.jsx';

const LANGS = [{ id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }];
const SRC_KIND = { chiusura: 'good', storico: 'violet', gestionale: 'accent', calcolato: 'outline', istantanea: 'warn' };

/* ---------------- rapporto ---------------- */
export function Bozza({ d, P, rep }) {
  const [lang, setLang] = useState(rep.settings.lang);
  const [edit, setEdit] = useState(null);
  const [txt, setTxt] = useState('');
  const hist = useMemo(() => threeYear(d, P), [d, P.key]);
  const narr = useMemo(() => narratives(rep, lang, { history: hist }), [rep, lang, hist]);
  const h = reportHeader(rep, lang);
  const name = `rapporto-vs-${P.key}-${lang}`;
  const missing = narr.reduce((s, n) => s + n.missing.length, 0);
  const saveText = id => { const r = textEditOps(d, P.key, id, lang, txt); if (r.ops.length) { store.batch(r.ops, r.label); toast(txt.trim() ? 'Testo salvato' : 'Torna il testo automatico'); } setEdit(null); };
  return (
    <>
      <Panel className="no-print" title="Rapporto VS" sub={`${narr.length} informative · ${missing ? `${missing} segnaposto «da completare»` : 'nessun segnaposto'} · stampa in tema chiaro, anche come PDF`}
        actions={<div className="row gap-s">
          <Seg label="Lingua" value={lang} onChange={setLang} options={LANGS} />
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuFileText} onClick={() => save(name, 'md', vsmeMarkdown(rep, lang, { narratives: narr, methods: METHODS }))}>Markdown</Btn>
          <Btn small icon={LuFileSpreadsheet} onClick={() => save(name, 'csv', vsmeCsv(rep, lang))}>CSV</Btn>
          <Btn small icon={LuFileJson} onClick={() => save(name, 'json', vsmeJson(rep, lang))}>JSON</Btn>
          <Btn small icon={LuDownload} onClick={() => save(`vs-efrag-${P.key}-${lang}`, 'csv', efragCsv(rep, lang))} title="Datapoint nell’ordine del modello digitale EFRAG, da copiare nel modello per il convertitore XBRL gratuito">CSV EFRAG</Btn>
        </div>}>
        <p className="small muted">I paragrafi si scrivono da soli dai datapoint: «Modifica» sostituisce il testo di un’informativa per questo esercizio e questa lingua (resta segnato «testo modificato»). Il CSV EFRAG segue l’ordine del modello digitale VSME: si copia nel modello EFRAG e si converte con lo strumento gratuito; FeedOS non produce XBRL.</p>
      </Panel>
      <PrintPage title={h.title} period={rep.period.label} footer={`${h.status}${rep.closing?.hash ? ` · SHA-256 ${rep.closing.hash.slice(0, 16)}…` : ''}`}>
        <div className="erp-pp-head"><b>{h.company}</b><span>{h.period}</span><span>{h.status}</span>{h.hash && <span className="mono erp-wrap">{h.hash}</span>}<span>{h.coverage}</span></div>
        {['B', 'C'].map(m => {
          const ns = narr.filter(n => n.module === m);
          if (!ns.length) return null;
          return (
            <section key={m} className="erp-mod">
              <h2 className="erp-h2">{VS_MODULES[m][lang]}</h2>
              {ns.map(n => (
                <section key={n.id} className="erp-narr">
                  <h3>{n.id} · {n.title}{n.edited && <Chip kind="violet">{T('report.edited', {}, lang)}</Chip>}
                    <span className="no-print erp-edit"><Btn small kind="ghost" icon={LuPencil} onClick={() => { setEdit(n.id); setTxt(n.paragraphs.join('\n\n')); }} title="Modifica il testo di questa informativa">Modifica</Btn></span></h3>
                  {edit === n.id ? (
                    <div className="no-print stack">
                      <textarea className="input erp-ta" rows={6} value={txt} onChange={e => setTxt(e.target.value)} aria-label={`Testo dell’informativa ${n.id}`} />
                      <div className="row"><Btn small kind="primary" icon={LuSave} onClick={() => saveText(n.id)}>Salva il testo</Btn>
                        {n.edited && <Btn small icon={LuRotateCcw} onClick={() => { setTxt(''); const r = textEditOps(d, P.key, n.id, lang, ''); store.batch(r.ops, r.label); setEdit(null); }}>Torna al testo automatico</Btn>}
                        <Btn small kind="ghost" onClick={() => setEdit(null)}>Annulla</Btn></div>
                    </div>
                  ) : n.paragraphs.map((p, k) => <p key={k} className={/\[(da completare|to be completed)/.test(p) ? 'erp-miss' : ''}>{p}</p>)}
                </section>
              ))}
            </section>
          );
        })}
        <section className="erp-narr">
          <h3>{T('report.gaps', {}, lang)}</h3>
          {rep.gaps.length ? <ul className="erp-ul">{rep.gaps.map(g => <li key={g.id}><b>{g.id}</b> {g.label[lang]} · {VS_PROVIDERS[g.provider]?.title[lang]}</li>)}</ul> : <p>{T('report.gaps.none', {}, lang)}</p>}
        </section>
        <section className="erp-narr">
          <h3>{T('method', {}, lang)}</h3>
          <p>{T('report.qualityNote', {}, lang)} {T('report.labelsNote', {}, lang)}</p>
          {Object.entries(METHODS).map(([pkg, m]) => <p key={pkg} className="small"><b>{VS_PROVIDERS[pkg]?.title[lang]}.</b> {String(m?.[lang] || m?.it || '').replace(/\n\s*\n/g, ' ')}</p>)}
          <p className="small muted">{VS_SOURCE[lang]} · {T('validAsOf', {}, lang)} {dateIt(VS_SOURCE.validAsOf)} · {T('status.da-verificare', {}, lang)}</p>
        </section>
        <Disclaimer lang={lang} />
      </PrintPage>
    </>
  );
}

/* ---------------- banche ---------------- */
export function Banche({ d, P }) {
  const [lang, setLang] = useState('it');
  const pack = useMemo(() => bankPack(d, P, { lang }), [d, P.key, lang]);
  const pmi = pmiStatus(d);
  const name = `pacchetto-banca-${P.key}-${lang}`;
  const json = () => ({ meta: pack.meta, period: { key: P.key, from: P.from, to: P.to }, sections: pack.sections.map(s => ({ id: s.id, rows: s.rows, table: s.table && { periods: s.table.periods.map(p => p.key), rows: s.table.rows.map(r => ({ key: r.key, unit: r.unit, values: r.values })) }, evidence: s.evidence })), pmi: pack.pmi, disclaimer: T('disclaimer', {}, lang) });
  const importPmi = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const r = pmiPackFromCsv(await readFile(file), esgToday(d));
    if (!r.ok) { toast(`Tavola non importata: ${r.errors[0]}`, 'err'); return; }
    const a = applyPackOps(d, r.pack, PACK_REPORT_PMI);
    if (!a.ok) { toast(`Tavola non importata: ${a.errors[0]}`, 'err'); return; }
    store.batch(a.ops, `Tavola PMI-Banche importata (${r.pack.items.filter(x => x.text).length} voci trascritte)`); toast('Tavola PMI-Banche importata');
  };
  return (
    <>
      <Panel className="no-print" title="Pacchetto ESG per la banca" sub="Profilo, energia ed emissioni su tre esercizi, obiettivi, rischi, persone, governance, evidenze: dagli stessi dati del rapporto VS"
        actions={<div className="row gap-s">
          <Seg label="Lingua" value={lang} onChange={setLang} options={LANGS} />
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuFileText} onClick={() => save(name, 'md', bankMarkdown(pack, lang))}>Markdown</Btn>
          <Btn small icon={LuFileSpreadsheet} onClick={() => save(name, 'csv', bankCsv(pack, lang))}>CSV</Btn>
          <Btn small icon={LuFileJson} onClick={() => save(name, 'json', json())}>JSON</Btn>
        </div>}>
        <div className="erp-pmi">
          <div><b>Documento PMI-Banche</b> <StatusChip status={pmi.status === 'trascritto' ? 'verificato' : 'da trascrivere'} /> <span className="small">{pmi.transcribed} voci trascritte su {pmi.total} · {pmi.sections.length} sezioni · versione {pmi.version} ({pmi.origin}) · valido al {dateIt(pmi.validAsOf)}</span>
            <p className="small muted">{pmi.source} FeedOS non riporta il testo delle voci: va trascritto dal documento pubblico nel modello CSV (numero, sezione, testo, datapoint VS, corrispondenza) e importato qui; poi il questionario della banca si compila da solo.</p></div>
          <div className="row gap-s">
            <Btn small icon={LuDownload} onClick={() => save('modello-pmi-banche', 'csv', pmiTemplateCsv(d))}>Modello CSV</Btn>
            <label className="btn small"><LuUpload aria-hidden="true" />Importa la tavola<input type="file" accept=".csv,text/csv" className="erp-file" onChange={importPmi} /></label>
          </div>
        </div>
      </Panel>
      <PrintPage title={T('report.bank.title', {}, lang)} period={P.label} footer={pack.meta.statusText}>
        <div className="erp-pp-head"><b>{pack.meta.company}</b><span>{pack.meta.periodText}</span><span>{pack.meta.statusText}</span>{pack.meta.hash && <span className="mono erp-wrap">SHA-256 {pack.meta.hash}</span>}<span>{T('report.bank.intro', {}, lang)}</span></div>
        {pack.sections.map(s => (
          <section key={s.id} className="erp-narr">
            <h3>{T(`report.bank.${s.id}`, {}, lang)}</h3>
            {s.table && <div className="tw"><table className="t erp-t"><thead><tr><th>{lang === 'en' ? 'Indicator' : 'Indicatore'}</th>{s.table.periods.map(p => <th key={p.key} className="r">{p.short || p.label}</th>)}</tr></thead>
              <tbody>{s.table.rows.map(r => <tr key={r.key}><td>{r.label[lang]}</td>{s.table.periods.map((p, i) => <td key={p.key} className="r">{histCell(r, i, lang)}</td>)}</tr>)}</tbody></table></div>}
            {s.rows?.length > 0 && <dl className="erp-kv">{s.rows.map(r => <React.Fragment key={r.id}><dt>{r.label}</dt><dd className={r.missing ? 'erp-miss' : ''}>{r.text}{r.quality && <span className="sub">{r.quality} · {r.source}</span>}</dd></React.Fragment>)}</dl>}
            {s.id === 'lacune' && !s.rows.length && <p>{T('report.gaps.none', {}, lang)}</p>}
            {s.id === 'evidenze' && (s.evidence.length ? <ul className="erp-ul">{s.evidence.map(e => <li key={e.id}>{e.title}{e.expiry ? ` · scad. ${dateIt(e.expiry)}` : ''}{e.sha256 ? ` · SHA-256 ${String(e.sha256).slice(0, 12)}…` : ''} ({e.dpIds.join(', ')})</li>)}</ul> : <p className="small muted">{T('report.bank.noEvidence', {}, lang)}</p>)}
          </section>
        ))}
        <p className="small">{T('report.bank.pmi', { done: pack.pmi.transcribed, total: pack.pmi.total }, lang)}.</p>
        <Disclaimer lang={lang} />
      </PrintPage>
    </>
  );
}

/* ---------------- storico ---------------- */
export function Storico({ d, P }) {
  const hist = useMemo(() => threeYear(d, P), [d, P.key]);
  const [open, setOpen] = useState(null);
  const rows = hist.rows;
  const past = hist.periods.slice(0, -1);
  const cur = open && hist.periods.find(p => p.key === open);
  const row = cur ? historyRowFor(d, cur) : null;
  const onSave = v => {
    const vals = Object.fromEntries(Object.entries(v).filter(([k]) => !['id', 'label'].includes(k)));
    if (row) store.update('esgHistory', row.id, { ...vals, label: v.label || row.label, source: 'storico dichiarato' }, `Storico ESG «${cur.label}» aggiornato`);
    else store.add('esgHistory', { ...vals, id: cur.key, periodKey: cur.key, from: cur.from, to: cur.to, label: v.label || cur.label, source: 'storico dichiarato' }, `Storico ESG «${cur.label}» dichiarato`);
    toast('Storico salvato'); setOpen(null);
  };
  return (
    <>
      <Panel title="Tre esercizi a confronto" sub="Valori approvati alla chiusura, poi storico dichiarato, poi i dati dell’esercizio; i ricavi passati possono venire dalle chiusure mensili del gestionale" flush
        actions={<Btn small icon={LuDownload} onClick={() => save(`storico-esg-${P.key}`, 'csv', historyCsv(hist))}>CSV</Btn>}>
        <div className="tw"><table className="t erp-t">
          <thead><tr><th>Indicatore</th>{hist.periods.map(p => <th key={p.key} className="r">{p.short || p.label}</th>)}<th className="r">Variazione</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.key}>
              <td>{r.label.it} <span className="muted xs">{unitText(r.unit)}</span></td>
              {r.values.map((v, i) => <td key={i} className="r">{v.value == null ? <span className="muted">—</span> : <>{histCell(r, i)}<span className={`erp-src ${SRC_KIND[v.source] || ''}`} title={T(`report.src.${v.source}`)}>{T(`report.src.${v.source}`)}</span></>}</td>)}
              <td className="r">{r.delta?.pct == null ? '—' : <span className={r.good && ((r.good === 'down') === (r.delta.pct < 0)) ? 'erp-good' : r.good ? 'erp-bad' : ''}>{r.delta.pct > 0 ? '+' : r.delta.pct < 0 ? '−' : ''}{nf(Math.abs(r.delta.pct) * 100, 1)}%</span>}</td>
            </tr>))}</tbody>
        </table></div>
      </Panel>
      <Panel title="Storico dichiarato" sub="Per gli esercizi prima di FeedOS: valori dal rendiconto interno o dal bilancio; si importano anche da CSV in Dati › Importa (tipo «Storico ESG»)">
        <div className="erp-hcards">
          {past.map(p => {
            const r = historyRowFor(d, p);
            const n = r ? Object.keys(r).filter(k => typeof r[k] === 'number').length : 0;
            return (
              <div key={p.key} className="erp-hcard">
                <b>{p.label}</b><span className="small muted">{dateIt(p.from)} – {dateIt(p.to)}</span>
                <span className="small">{r ? `${n} valori dichiarati${r.note ? ` · ${r.note}` : ''}` : 'Nessun valore dichiarato'}</span>
                <Btn small kind={r ? '' : 'primary'} icon={LuHistory} onClick={() => setOpen(p.key)}>{r ? 'Modifica' : 'Dichiara i valori'}</Btn>
              </div>
            );
          })}
        </div>
      </Panel>
      {cur && <Drawer title={`Storico ESG · ${cur.label}`} sub="Valori dichiarati" onClose={() => setOpen(null)}>
        <EntityForm coll="esgHistory" d={d} rec={row ? { ...row } : { id: cur.key, label: cur.label }} onSave={onSave} onCancel={() => setOpen(null)} saveLabel="Salva lo storico" />
      </Drawer>}
    </>
  );
}
