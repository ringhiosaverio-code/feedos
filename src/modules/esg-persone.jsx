/* FeedOS 18 · ESG › Persone e sicurezza (pacchetto WP5 «persone»): sottosezioni (#esg.persone.<id>) panoramica · organico · sicurezza ·
 * formazione · parita · ot23. Dati pseudonimi e aggregati, gruppi con meno di 5 persone non mostrati.
 * Contratto: PersonePage({ d, route }) disegna la scheda (titolo e schede le disegna esg.jsx); PersoneCard({ d }) è il riquadro del
 * cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Visibile in FeedOS e in DifesaOS: testi neutri, temi
 * della formazione e riferimenti di settore secondo il settore dell'archivio. Prefisso CSS e DOM epe-. Scritture con store.batch. */
import React, { useMemo } from 'react';
import { LuUsers, LuDownload, LuPrinter, LuFileText, LuFileJson, LuArrowRight } from 'react-icons/lu';
import { go } from '../core/router.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, addMonths, monthLabel, daysBetween, endOfMonth } from '../core/util.js';
import { currentPeriod } from '../engine/esg-years.js';
import { personeSummary, personeSignals, personeDatapoints, personeCalendarItems, monthlySafety, trainingStats, workforce, PERSONE_METHOD, PERSONE_TAB } from '../engine/esg-persone.js';
import { personeMarkdown } from '../engine/esg-persone-text.js';
import { fmtValue } from '../engine/esg-report-text.js';
import { VS_DP } from '../data/vsme-datapoints.js';
import { Panel, Kpi, Table, Btn, Empty, Kv } from '../ui/ui.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { SignalList } from './shared.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, QualityChip, Lineage, MethodNote, Disclaimer, EsgCard, StatusChip } from './esg-shared.jsx';
import { pctTxt, numTxt, dt, dayTxt, downloadCsv, downloadText, vsMonth, pctChange, prevMonth } from './esg-persone-ui.jsx';
import { Organico } from './esg-persone-organico.jsx';
import { Sicurezza } from './esg-persone-sicurezza.jsx';
import { Formazione } from './esg-persone-formazione.jsx';
import { Parita, Ot23 } from './esg-persone-parita.jsx';

const SECTIONS = [['panoramica', 'Panoramica'], ['organico', 'Organico'], ['sicurezza', 'Sicurezza'], ['formazione', 'Formazione'], ['parita', 'Parità e retribuzioni'], ['ot23', 'INAIL OT23']];

/** Scheda ESG › Persone e sicurezza. */
export function PersonePage({ d, route }) {
  const { P, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const S = useMemo(() => personeSummary(d, P), [d, P.key]);
  const [sec, ...rest] = String(route?.id || 'panoramica').split('.');
  const arg = rest.join('.');
  const sub = SECTIONS.some(([id]) => id === sec) ? sec : 'panoramica';
  const badge = {
    sicurezza: S?.actions.late.length || null,
    formazione: S?.expiries.filter(x => x.status === 'scaduta' || x.status === 'in scadenza').length || null,
  };
  const props = { d, P, S, today, arg };
  return (
    <div className="epe" id="epe-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge[id] }))} value={sub} tab="persone" label="Sezioni di Persone e sicurezza" />
      {sub === 'panoramica' && <Panoramica {...props} />}
      {sub === 'organico' && <Organico {...props} />}
      {sub === 'sicurezza' && <Sicurezza {...props} />}
      {sub === 'formazione' && <Formazione {...props} />}
      {sub === 'parita' && <Parita {...props} />}
      {sub === 'ot23' && <Ot23 {...props} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: indice di frequenza degli ultimi 12 mesi, organico, formazione. */
export function PersoneCard({ d }) {
  if (!PERSONE_TAB) return null;
  const P = currentPeriod(d);
  const S = personeSummary(d, P);
  if (!S?.inUse) return <EsgCard title="Persone e sicurezza" tab="persone" icon={LuUsers} value="—" sub="Organico per genere e contratto, infortuni con gli indici, formazione e divario retributivo, in forma pseudonima." />;
  const r = S.rates, w = S.wf, t = S.training;
  const exp = S.expiries.filter(x => x.status === 'scaduta' || x.status === 'in scadenza').length;
  return (
    <EsgCard title="Persone e sicurezza" tab="persone" id="sicurezza" icon={LuUsers} value={r?.ifr != null ? nf(r.ifr, 1) : '—'} unit="indice di frequenza"
      sub={`${w ? `${w.headcount} dipendenti` : 'organico da inserire'} · B9 ${numTxt(r?.b9)} ogni 200.000 h · formazione ${numTxt(t?.perEmployee)} h a testa${exp ? ` · ${exp} corsi da rinnovare` : ''}`} />
  );
}

/* ================= panoramica ================= */
function Panoramica({ d, P, S, today }) {
  const sig = useMemo(() => personeSignals(d, { today }), [d, today]);
  const cal = useMemo(() => personeCalendarItems(d, today).filter(c => daysBetween(today, c.date) <= 120).slice(0, 8), [d, today]);
  const dps = useMemo(() => personeDatapoints(d, P), [d, P.key]);
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const ms = useMemo(() => monthlySafety(d, [prevMonth(lastClosed), lastClosed]), [d, lastClosed]);
  const tr12 = useMemo(() => {
    const w = workforce(d, P);
    const at = m => trainingStats(d, { from: addMonths(m, -11) + '-01', to: endOfMonth(m) }, w)?.perEmployee ?? null;
    return [at(prevMonth(lastClosed)), at(lastClosed)];
  }, [d, P.key, lastClosed]);
  if (!S?.inUse) return <Start />;
  const { wf: w, wfPrev, rates: r, training: t, pay } = S;
  const ifD = pctChange(ms[1]?.if12, ms[0]?.if12);
  const trD = pctChange(tr12[1], tr12[0]);
  const rows = Object.entries(dps).map(([id, x]) => ({ id, ...x, label: VS_DP[id]?.label?.it || id, text: String(fmtValue(x.value, x.unit, 'it', VS_DP[id]) ?? '—').replace(/^1 persone$/, '1 persona') }));
  const company = d.settings?.company?.short || d.settings?.company?.name || '';
  const md = lang => downloadText(`persone-sicurezza-${P.key}-${lang}`, 'md', personeMarkdown(S, lang, company), 'text/markdown;charset=utf-8');
  const json = () => downloadText(`persone-datapoint-${P.key}`, 'json', JSON.stringify({ meta: { package: 'persone', period: S.period, packVersion: S.pack.version, validAsOf: S.pack.validAsOf, generatedOn: today, note: 'Dati pseudonimi e aggregati; gruppi con meno di 5 persone non inclusi.' }, datapoints: dps }, null, 2), 'application/json');
  const csv = () => downloadCsv(`persone-datapoint-${P.key}`, rows, [{ key: 'id', label: 'Datapoint' }, { key: 'label', label: 'Descrizione' }, { key: 'text', label: 'Valore' }, { value: x => x.unit || '', label: 'Unità' },
    { key: 'quality', label: 'Qualità' }, { key: 'source', label: 'Fonte' }, { value: x => x.method || '', label: 'Metodo' }, { value: x => x.note || '', label: 'Nota' }]);
  return (
    <>
      <div className="kpis" id="epe-kpis">
        <Kpi label="Dipendenti a fine periodo" value={w ? nf(w.headcount) : '—'} foot={w ? `${pctTxt(w.womenShare, 0)} donne · ${nf(w.fte, 1)} ETP · al ${dateIt(w.date)}` : 'fotografia da inserire'}
          cmp={w && wfPrev ? { value: wfPrev.headcount, cur: w.headcount, kind: 'flow', good: null, decimals: 0, label: 'un anno prima' } : undefined} onClick={() => go('esg', 'persone', 'organico')} />
        <Kpi label="Indice di frequenza, 12 mesi" value={numTxt(ms[1]?.if12)} unit="per 10⁶ h" delta={ifD} deltaGood={ifD == null ? null : ifD <= 0} foot={ifD != null ? vsMonth(prevMonth(lastClosed)) : `a fine ${monthLabel(lastClosed, false)}`} onClick={() => go('esg', 'persone', 'sicurezza')} />
        <Kpi label="Infortuni registrabili (VS B9)" value={numTxt(r?.b9)} unit="per 200.000 h" foot={r ? `${r.recordable} eventi · ${r.fatalities ? `${r.fatalities} decessi` : 'nessun decesso'}${r.hoursQuality === 'stimato' ? ' · ore in parte stimate' : ''}` : ''} onClick={() => go('esg', 'persone', 'sicurezza')} />
        <Kpi label="Formazione per dipendente, 12 mesi" value={numTxt(tr12[1])} unit="h" delta={trD} deltaGood={trD == null ? null : trD >= 0} foot={trD != null ? vsMonth(prevMonth(lastClosed)) : ''} target={S.trainingTarget ? `${nf(S.trainingTarget)} h` : undefined} onClick={() => go('esg', 'persone', 'formazione')} />
        <Kpi label="Divario retributivo di genere" value={pay ? (pay.overall.suppressed ? 'non mostrato' : pctTxt(pay.overall.meanGap)) : '—'} foot={pay ? (pay.overall.suppressed ? pay.overall.note : `medio · mediano ${pctTxt(pay.overall.medianGap)}`) : 'retribuzioni da importare'} onClick={() => go('esg', 'persone', 'parita')} />
        <Kpi label="Donne tra dirigenti e quadri" value={w ? pctTxt(w.mgmt.womenShare, 0) : '—'} foot={w ? `${w.mgmt.F} su ${w.mgmt.total} · rapporto donne/uomini ${w.mgmt.ratio == null ? '—' : nf(w.mgmt.ratio, 2)}` : ''} onClick={() => go('esg', 'persone', 'organico')} />
      </div>
      <div className="split">
        <Panel title="Da fare" sub="Segnali di persone e sicurezza (gli stessi di Oggi)" flush>
          <SignalList items={sig} limit={6} emptyText="Nessun corso in scadenza, nessuna azione in ritardo, ore lavorate complete." />
        </Panel>
        <div className="stack">
          <Panel title="Prossime scadenze" sub="Formazione obbligatoria, OT23 e azioni di sicurezza nei prossimi 120 giorni" flush>
            {cal.length ? <ul className="epe-next">
              {cal.map(c => {
                const n = daysBetween(today, c.date);
                return (
                  <li key={c.key}>
                    <span className="epe-next-d"><span className="epe-strong">{c.date.slice(8, 10)}</span>{monthLabel(c.date.slice(0, 7))}</span>
                    <span className="epe-next-t">
                      <button type="button" className="linkish" onClick={() => go('esg', 'persone', c.link?.id)}>{c.title}</button>
                      <span className="xs muted">{c.owner ? `${c.owner} · ` : ''}<span className={n < 0 ? 'epe-late' : ''}>{dayTxt(n)}</span></span>
                    </span>
                  </li>
                );
              })}
            </ul> : <Empty title="Nessuna scadenza nei prossimi 120 giorni" />}
          </Panel>
          <Panel title="Obblighi legati alla dimensione" sub={`Dipendenti medi del periodo: ${w ? nf(w.avgHeadcount, 1) : 'n.d.'}`}>
            <Kv items={[
              ['Trasparenza retributiva', <span className="epe-src">{S.duties.band ? (S.duties.report ? `prima relazione entro il ${dateIt(S.duties.firstReport)}, ${S.duties.every}` : 'nessuna relazione; diritti di informazione dei lavoratori') : 'organico da inserire'}<StatusChip status={S.duties.band?.status} /></span>],
              ['Rapporto biennale M/F', <span className="epe-src">{S.biennial.applies ? `biennio ${S.biennial.biennium}, entro il ${dateIt(S.biennial.due)}` : 'non dovuto fino a 50 dipendenti'}<StatusChip status={S.biennial.item?.status} /></span>],
              ['INAIL OT23', `domanda per il ${S.ot23.year} entro il ${dateIt(S.ot23.due)} · ${nf(S.ot23.points)} punti su ${nf(S.ot23.threshold)}`],
              ['UNI/PdR 125', S.pdr ? `${S.pdr.row.certified ? `certificata fino al ${dt(S.pdr.row.certExpiry)}` : 'non certificata'} · autovalutazione ${numTxt(S.pdr.total, 0)}%` : 'autovalutazione da fare'],
            ]} />
          </Panel>
        </div>
      </div>
      <Panel title="Datapoint del VS forniti da questa scheda" sub={`B1 dipendenti, B8, B9, B10 e C5 · ${S.period.label}`} flush
        actions={<>
          <Btn small kind="ghost" icon={LuDownload} onClick={csv} disabled={!rows.length}>CSV</Btn>
          <Btn small kind="ghost" icon={LuFileJson} onClick={json} disabled={!rows.length}>JSON</Btn>
          <Btn small kind="ghost" icon={LuFileText} onClick={() => md('it')}>Scheda</Btn>
          <Btn small kind="ghost" icon={LuFileText} onClick={() => md('en')} title="Scheda in inglese per clienti e banche">In inglese</Btn>
          <Btn small kind="ghost" icon={LuPrinter} onClick={printNow}>Stampa</Btn>
        </>}>
        <Table rows={rows} rowKey={x => x.id} pageSize={30} cols={[
          { key: 'id', label: 'Datapoint', render: x => <span className="epe-wrap"><span className="epe-strong">{x.id}</span><span className="sub">{x.label}</span></span> },
          { key: 'text', label: 'Valore', render: x => <span className="epe-wrap">{x.text}</span> },
          { key: 'quality', label: 'Qualità', render: x => <QualityChip q={x.quality} /> },
          { key: 'method', label: 'Da dove viene', nosort: true, render: x => <Lineage item={{ method: x.method, quality: x.quality, evidence: x.evidence, note: x.note, source: x.source }} label="Dettagli" /> },
        ]} empty="Nessun datapoint: inserire organico, ore, infortuni e formazione" />
      </Panel>
      <div className="epe-foot">
        <MethodNote text={PERSONE_METHOD} />
        <p className="small muted">Pacchetto di contenuti «persone» {S.pack.version}, valido al {dateIt(S.pack.validAsOf)}{S.pack.origin === 'importato' ? ' (importato)' : ''}.</p>
        <Disclaimer />
      </div>
      <div className="print-only">
        <PrintPage title="Persone e sicurezza" period={S.period.label} footer={`Dati pseudonimi e aggregati · pacchetto «persone» ${S.pack.version} · ${dateIt(S.pack.validAsOf)}`}>
          <table className="t epe-print-t">
            <thead><tr><th>Datapoint</th><th>Valore</th><th>Qualità</th></tr></thead>
            <tbody>{rows.map(x => <tr key={x.id}><td>{x.id} · {x.label}</td><td>{x.text}</td><td>{x.quality}</td></tr>)}</tbody>
          </table>
          <p className="small">{PERSONE_METHOD.it.split(/\n\s*\n/)[1]}</p>
          <Disclaimer />
        </PrintPage>
      </div>
    </>
  );
}

/** Primo uso: cosa inserire e da dove. */
function Start() {
  return (
    <Panel title="Persone e sicurezza" sub="Nessun dato ancora">
      <div className="stack epe-start">
        <p>Questa scheda calcola gli indicatori del VS su persone e sicurezza (B8, B9, B10, C5), gli indici di frequenza e di gravità, le scadenze della formazione obbligatoria e il divario retributivo, solo con dati pseudonimi.</p>
        <ol className="epe-steps">
          <li>Organico: una fotografia a fine periodo per genere, categoria e contratto.</li>
          <li>Ore lavorate per mese e registro degli infortuni (anche da file CSV in Dati › Importa).</li>
          <li>Registro della formazione con i corsi obbligatori e la loro validità.</li>
          <li>Retribuzioni pseudonime per il divario di genere (facoltative sotto i 150 dipendenti).</li>
        </ol>
        <div className="row">
          <Btn kind="primary" icon={LuArrowRight} onClick={() => go('esg', 'persone', 'organico')}>Inserisci l’organico</Btn>
          <Btn icon={LuArrowRight} onClick={() => go('dati', 'importa')}>Importa da CSV</Btn>
        </div>
      </div>
    </Panel>
  );
}

