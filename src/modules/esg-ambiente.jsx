/* FeedOS 18 · ESG › Registri ambientali (pacchetto WP9 «ambiente»): sezioni (#esg.ambiente.<id>) sintesi · acqua-scarichi · rentri ·
 * aria · energia-prestazioni · anomalie · bilancio-materiali. RENTRI e MUD, emissioni dai camini, scarichi idrici, ENPI, anomalie e
 * bilancio dei materiali (VS B4, B6, B7). Contratto: AmbientePage({ d, route }) disegna la scheda (titolo e schede le disegna esg.jsx);
 * AmbienteCard({ d }) è il riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Visibile in FeedOS e in
 * DifesaOS: testi neutri, riferimenti di settore solo nel mangimificio. Prefisso CSS e DOM eam-. */
import React, { useMemo } from 'react';
import { LuRecycle, LuPrinter, LuFileJson } from 'react-icons/lu';
import { appToday } from '../core/derived.js';
import { href } from '../core/router.js';
import { nf, dateIt, endOfMonth } from '../core/util.js';
import { currentPeriod } from '../engine/esg-years.js';
import { AMB_TAB, ambienteSummary, ambienteSignals, ambienteCalendarItems, ambienteSettings, rentriSummary, AMBIENTE_METHOD } from '../engine/esg-ambiente.js';
import { PACK_AMBIENTE } from '../data/pack-ambiente.js';
import { Panel, Kpi, Table, Btn, Empty, Chip } from '../ui/ui.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { SignalList } from './shared.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, MethodNote, Disclaimer, EsgCard, StatusChip } from './esg-shared.jsx';
import { numTxt, pctChange, vsMonth, prevMonth, downloadText } from './esg-ambiente-ui.jsx';
import { AcquaSection } from './esg-ambiente-acqua.jsx';
import { RentriSection } from './esg-ambiente-rentri.jsx';
import { AriaSection } from './esg-ambiente-aria.jsx';
import { EnergiaSection } from './esg-ambiente-energia.jsx';
import { AnomalieSection, MaterialiSection } from './esg-ambiente-anomalie.jsx';

const SECTIONS = [['sintesi', 'Sintesi'], ['acqua-scarichi', 'Acqua e scarichi'], ['rentri', 'RENTRI e MUD'], ['aria', 'Emissioni in atmosfera'],
  ['energia-prestazioni', 'Energia (ENPI)'], ['anomalie', 'Anomalie'], ['bilancio-materiali', 'Bilancio dei materiali']];

/** Scheda ESG › Registri ambientali. */
export function AmbientePage({ d, route }) {
  const { P, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const S = useMemo(() => ambienteSummary(d, P), [d, P.key, today]);
  const sigs = useMemo(() => ambienteSignals(d, { today }), [d, today]);
  const [sec, ...rest] = String(route?.id || 'sintesi').split('.');
  const sub = SECTIONS.some(([id]) => id === sec) ? sec : 'sintesi';
  const badge = {
    'acqua-scarichi': S?.water?.over?.length || null,
    rentri: S?.rentri?.late || null,
    aria: S?.stacks?.stacks?.filter(s => s.dueState !== 'in regola').length || null,
    anomalie: S?.anomalies || null,
  };
  const props = { d, P, S, today, arg: rest.join('.'), sigs };
  return (
    <div className="eam" id="eam-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge[id] }))} value={sub} tab="ambiente" label="Sezioni dei registri ambientali" />
      {sub === 'sintesi' && <Sintesi {...props} />}
      {sub === 'acqua-scarichi' && <AcquaSection {...props} />}
      {sub === 'rentri' && <RentriSection {...props} />}
      {sub === 'aria' && <AriaSection {...props} />}
      {sub === 'energia-prestazioni' && <EnergiaSection {...props} />}
      {sub === 'anomalie' && <AnomalieSection {...props} />}
      {sub === 'bilancio-materiali' && <MaterialiSection {...props} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: recupero finale, polveri, consumo idrico per tonnellata e stato del RENTRI. */
export function AmbienteCard({ d }) {
  if (!AMB_TAB) return null;
  const S = ambienteSummary(d, currentPeriod(d));
  if (!S?.inUse) return <EsgCard title="Registri ambientali" tab="ambiente" icon={LuRecycle} value="—" sub="RENTRI e MUD, emissioni dai camini, scarichi idrici, consumo energetico (ENPI), anomalie e bilancio dei materiali." />;
  const R = S.rentri, dust = S.stacks.dustKg, lt = S.water.withdrawalLt;
  const bad = S.stacks.exceed.length > 0;
  return (
    <EsgCard title="Registri ambientali" tab="ambiente" icon={LuRecycle} value={R.finalRecoveryPct != null ? nf(R.finalRecoveryPct * 100, 0) : '—'} unit="% a recupero finale"
      status={bad ? 'bad' : R.late || S.stacks.stacks.some(s => s.dueState !== 'in regola') ? 'warn' : 'ok'}
      sub={`${lt != null ? `${numTxt(lt)} l/t di acqua` : 'acqua da registrare'} · ${dust != null ? `${numTxt(dust)} kg/anno di polveri` : 'camini da campionare'} · RENTRI ${R.completeness != null ? nf(R.completeness * 100, 0) : '—'}% registrato${R.late ? `, ${R.late} in ritardo` : ''}`} />
  );
}

/* ================= sintesi ================= */
const monthRange = m => ({ from: `${m}-01`, to: endOfMonth(m), key: m });

function Sintesi({ d, P, S, today, sigs }) {
  if (!S?.inUse) return <Empty title="Nessun registro ambientale in questo archivio">Inserire scarichi idrici, camini con i campionamenti, registrazioni RENTRI o audit energetici. Il registro dei rifiuti e quello dell’acqua si leggono già dalle schede Acqua e Rifiuti.</Empty>;
  const last = P.to.slice(0, 7), prev = prevMonth(last);
  const K = ambienteSettings(d);
  // valori mensili per le variazioni (mese chiuso più recente del periodo, e il mese prima)
  const wm = S.water.months.filter(x => x.perT != null);
  const lt = m => { const x = wm.find(y => y.month === m); return x ? x.perT * 1000 : null; };
  const rec = m => { const r = rentriSummary(d, today, monthRange(m)); return r.total ? r.finalRecoveryPct : null; };
  const comp = m => { const x = S.rentri.byMonth.find(y => y.month === m); return x ? x.completeness : null; };
  const recL = rec(last);
  const devLast = S.enpi.rows.length ? S.enpi.rows[S.enpi.rows.length - 1] : null;
  const pending = S.rentri.pendingKg;
  const cal = ambienteCalendarItems(d, today).filter(c => c.date >= today).slice(0, 6);
  const state = [
    { id: 'acqua-scarichi', name: 'Acqua e scarichi', kind: S.water.over.length ? 'crit' : S.water.discharge == null ? 'outline' : 'good',
      text: S.water.over.length ? `scarico maggiore del prelievo in ${S.water.over.length} mesi` : S.water.discharge == null ? 'scarichi non ancora registrati' : `${S.water.consumptionShare != null ? numTxt(S.water.consumptionShare * 100, 0) : '—'}% dell’acqua prelevata consumata` },
    { id: 'rentri', name: 'RENTRI e MUD', kind: S.rentri.late || S.rentri.xfirMissing ? 'warn' : 'good',
      text: `${numTxt(S.rentri.completeness * 100, 0)}% dei movimenti registrati; ${S.rentri.late} oltre il termine; ${S.rentri.xfirMissing} senza xFIR` },
    { id: 'aria', name: 'Emissioni in atmosfera', kind: S.stacks.exceed.length ? 'crit' : S.stacks.stacks.some(s => s.dueState !== 'in regola') ? 'warn' : 'good',
      text: S.stacks.exceed.length ? `${S.stacks.exceed.length} campionamenti sopra il limite` : S.stacks.stacks.length ? `${S.stacks.stacks.filter(s => s.dueState !== 'in regola').length} campionamenti da fare nei termini` : 'nessun camino registrato' },
    { id: 'energia-prestazioni', name: 'Energia (ENPI)', kind: !S.enpi.ok ? 'outline' : (S.enpi.model?.alarms || []).length ? 'warn' : 'good',
      text: !S.enpi.ok ? S.enpi.model.reason : `scostamento ${numTxt(S.enpi.devPct, 1)}% dal modello (R² ${numTxt(S.enpi.model.r2, 3)})` },
    { id: 'anomalie', name: 'Anomalie da verificare', kind: S.anomalies ? 'warn' : 'good', text: S.anomalies ? `${S.anomalies} valori fuori dalla norma nel periodo` : `nessuna nel periodo (soglia ${numTxt(K.anomalyK, 1)} z)` },
    { id: 'bilancio-materiali', name: 'Bilancio dei materiali', kind: 'outline', text: S.mass ? `differenza di ${numTxt(S.mass.difference, 0)} t sul consumo di ${numTxt(S.mass.consumed, 0)} t` : 'da completare con il registro di produzione' },
  ];
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Rifiuti a recupero finale (R1–R12)" value={S.rentri.finalRecoveryPct != null ? nf(S.rentri.finalRecoveryPct * 100, 0) : '—'} unit="%"
          foot={`periodo · ultimo mese ${recL != null ? nf(recL * 100, 0) : '—'}% · ${numTxt(pending / 1000, 1)} t in attesa dell’operazione finale`} />
        <Kpi label="Prelievo idrico per tonnellata" value={lt(last) != null ? nf(lt(last), 0) : (S.water.withdrawalLt != null ? nf(S.water.withdrawalLt, 0) : '—')} unit="l/t"
          delta={pctChange(lt(last), lt(prev))} deltaGood={lt(last) != null && lt(prev) != null ? lt(last) <= lt(prev) : null}
          foot={lt(last) != null && lt(prev) != null ? `ultimo mese · ${vsMonth(prev)}` : `periodo · ${S.water.withdrawalLt != null ? 'mesi con produzione completa' : 'nessuna lettura'}`} />
        <Kpi label="Polveri dai camini" value={S.stacks.dustKg != null ? nf(S.stacks.dustKg, 0) : '—'} unit="kg/anno" foot="media dei campionamenti × portata × ore" />
        <Kpi label="Scostamento ENPI dal modello" value={S.enpi.devPct != null ? nf(S.enpi.devPct, 1) : '—'} unit="%"
          foot={devLast && devLast.dev != null ? `ultimo mese ${nf(devLast.dev * 100, 1)}%` : 'modello dai mesi precedenti'} />
        <Kpi label="Movimenti registrati su RENTRI" value={comp(last) != null ? nf(comp(last) * 100, 0) : (S.rentri.completeness != null ? nf(S.rentri.completeness * 100, 0) : '—')} unit="%"
          delta={pctChange(comp(last), comp(prev))} deltaGood={comp(last) != null && comp(prev) != null ? comp(last) >= comp(prev) : null}
          foot={comp(last) != null && comp(prev) != null ? `ultimo mese · ${vsMonth(prev)}` : `periodo · ${S.rentri.late} oltre il termine`} />
        <Kpi label="Anomalie nel periodo" value={S.anomalies} foot={`soglia ${numTxt(K.anomalyK, 1)} z robusti`} />
      </div>
      <Panel title="Stato dei registri" sub="Ogni riga porta alla sezione che la spiega" flush>
        <Table rows={state} rowKey={x => x.id} pageSize={10} cols={[
          { key: 'name', label: 'Registro', render: x => <a href={href('esg', 'ambiente', x.id)} className="eam-link">{x.name}</a> },
          { key: 'state', label: 'Stato', nosort: true, render: x => <Chip kind={x.kind}>{x.text}</Chip> },
        ]} />
      </Panel>
      <div className="g2 eam-two">
        <Panel title="Prossime scadenze" sub="Campionamenti, MUD, diagnosi energetica. Norme e date da verificare sulle fonti ufficiali">
          {cal.length ? <Table rows={cal} rowKey={x => x.key} pageSize={8} cols={[
            { key: 'date', label: 'Data', render: x => dateIt(x.date) },
            { key: 'title', label: 'Scadenza', render: x => <span className="eam-wrap">{x.title}{x.law && <span className="sub">{x.law}</span>}</span> },
            { key: 'status', label: 'Stato', nosort: true, render: x => <StatusChip status={x.source ? 'da verificare' : undefined} /> },
          ]} /> : <p className="muted small">Nessuna scadenza nei prossimi mesi.</p>}
        </Panel>
        <Panel title="Da fare ora" sub="Segnali dei registri ambientali" flush>
          <SignalList items={sigs} limit={6} compact emptyText="Nessun segnale dei registri ambientali." />
        </Panel>
      </div>
      <div className="eam-foot">
        <div className="row eam-actions" style={{ gap: 8 }}>
          <Btn small kind="ghost" icon={LuFileJson} onClick={() => downloadText('registri-ambientali', 'json', JSON.stringify(summaryJson(d, S, P), null, 2), 'application/json;charset=utf-8')}>Riepilogo JSON</Btn>
          <Btn small kind="ghost" icon={LuPrinter} onClick={printNow}>Stampa</Btn>
        </div>
        <MethodNote text={AMBIENTE_METHOD} />
        <p className="small muted">Pacchetto di contenuti «ambiente» {PACK_AMBIENTE.version}, valido al {dateIt(PACK_AMBIENTE.validAsOf)}. Norme e date sono di sintesi e restano «da verificare» finché la fonte ufficiale non le conferma.</p>
        <Disclaimer />
      </div>
      <div className="print-only">
        <PrintPage title="Registri ambientali" period={P.label} footer="Registri ambientali · pacchetto «ambiente» FeedOS 18">
          <table className="t eam-print-t">
            <thead><tr><th>Registro</th><th>Stato</th></tr></thead>
            <tbody>{state.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.text}</td></tr>)}</tbody>
          </table>
          <p className="small">{AMBIENTE_METHOD.it.split(/\n/)[0]}</p>
          <Disclaimer />
        </PrintPage>
      </div>
    </>
  );
}

/** Riepilogo esportabile (JSON): periodo, acqua, RENTRI, camini, energia, anomalie. Valori senza formattazione. */
function summaryJson(d, S, P) {
  const r = (x, k = 2) => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 10 ** k) / 10 ** k);
  return {
    periodo: { chiave: P.key, da: P.from, a: P.to, etichetta: P.label },
    acqua: { prelievoM3: r(S.water.withdrawal, 0), scaricoM3: r(S.water.discharge, 0), consumoM3: r(S.water.consumption, 0), lPerT: r(S.water.withdrawalLt, 0) },
    rentri: { movimenti: S.rentri.total, registrati: S.rentri.registered, completezza: r(S.rentri.completeness, 3), oltreTermine: S.rentri.late, senzaXfir: S.rentri.xfirMissing, recuperoFinale: r(S.rentri.finalRecoveryPct, 3), pendenteKg: r(S.rentri.pendingKg, 0) },
    camini: S.stacks.stacks.map(s => ({ codice: s.code, inquinante: s.pollutant, limiteMgNm3: s.limitMgNm3, mediaMgNm3: r(s.mean, 2), kgAnno: r(s.kgYr, 1), prossimo: s.nextDue, stato: s.dueState })),
    energia: { scostamentoPct: r(S.enpi.devPct, 2), r2: S.enpi.model?.r2 != null ? r(S.enpi.model.r2, 4) : null, tj: r(S.audit?.tj, 2) },
    anomalie: S.anomalies,
    bilancioMateriali: S.mass ? { prodottiT: r(S.mass.products, 1), consumoT: r(S.mass.consumed, 1), caloT: r(S.mass.lossT, 1), rifiutiProcessoT: r(S.mass.processWasteT, 1), differenzaT: r(S.mass.difference, 1) } : null,
    generato: d?.settings?.demoAnchor || null,
  };
}
