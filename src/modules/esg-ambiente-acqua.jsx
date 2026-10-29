/* FeedOS 18 · ESG › Registri ambientali › Acqua e scarichi (VS B6): prelievo, scarico e consumo per mese; scarichi con le analisi e i
 * limiti; sostanze scaricate in kg nel periodo (rame, solidi, COD) per il punto e il recettore. Impostazione dello stress idrico. */
import React, { useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { nf, monthLabel } from '../core/util.js';
import { Panel, Kpi, Table, Btn, Drawer, Seg, Chip } from '../ui/ui.jsx';
import { LineChart, SERIES } from '../ui/charts.jsx';
import { WATER_STRESS, ambienteSettings } from '../engine/esg-ambiente.js';
import { setEsgSettings } from './esg-shared.jsx';
import { numTxt, pctTxt, prevMonth, vsMonth, pctChange, saveRecord, removeRecord, RecordForm, AnalysisEditor, cleanAnalyses } from './esg-ambiente-ui.jsx';

const STRESS_TXT = { 'n.d.': 'non determinato', basso: 'basso', medio: 'medio', alto: 'alto' };

/** Sezione «acqua-scarichi». */
export function AcquaSection({ d, P, S, today }) {
  const W = S.water, K = ambienteSettings(d);
  const [edit, setEdit] = useState(null);     // null, {} (nuovo) o il record da modificare
  const last = P.to.slice(0, 7), prev = prevMonth(last);
  const months = W.months.filter(m => m.withdrawal != null);
  const ltOf = m => { const x = S.water.months.find(y => y.month === m.month); return x && x.perT != null ? x.perT * 1000 : null; };
  const lt = { cur: months.find(m => m.month === last), pre: months.find(m => m.month === prev) };
  const discharges = (d.waterDischarges || []).filter(x => x && x.month >= P.from.slice(0, 7) && x.month <= P.to.slice(0, 7))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : (a.id < b.id ? -1 : 1)));
  const sub = substances(discharges);
  const chartM = months.map(m => m.month);
  const monthRows = months.map(m => ({ id: m.month, month: m.month, withdrawal: m.withdrawal, discharge: m.discharge, consumption: m.consumption, lt: ltOf(m),
    status: m.discharge == null ? 'scarico non registrato' : m.discharge > m.withdrawal ? 'scarico oltre il prelievo' : m.partial ? 'produzione parziale' : 'in regola' }));
  const newDefault = { month: last };
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Prelievo idrico del periodo" value={W.withdrawal != null ? nf(W.withdrawal, 0) : '—'} unit="m³" foot={`pozzo e acquedotto · ${W.months.length} mesi`} />
        <Kpi label="Scarico registrato" value={W.discharge != null ? nf(W.discharge, 0) : '—'} unit="m³" foot={W.discharge != null ? `${W.coverageMonths} mesi con lo scarico registrato` : 'da registrare dal contatore dello scarico'} />
        <Kpi label="Consumo (prelievo meno scarico)" value={W.consumption != null ? nf(W.consumption, 0) : '—'} unit="m³"
          foot={W.consumptionShare != null ? `${pctTxt(W.consumptionShare, 0)} dell’acqua prelevata` : '—'} />
        <Kpi label="Prelievo per tonnellata" value={W.withdrawalLt != null ? nf(W.withdrawalLt, 0) : '—'} unit="l/t"
          delta={lt.cur && lt.pre && ltOf(lt.cur) != null && ltOf(lt.pre) != null ? pctChange(ltOf(lt.cur), ltOf(lt.pre)) : null}
          deltaGood={lt.cur && lt.pre && ltOf(lt.cur) != null && ltOf(lt.pre) != null ? ltOf(lt.cur) <= ltOf(lt.pre) : null}
          foot={lt.cur && lt.pre ? vsMonth(prev) : 'mesi con produzione completa'} />
      </div>
      <div className="eam-settings row" style={{ gap: 8 }}>
        <span className="small muted">Stress idrico del sito</span>
        <Seg label="Stress idrico del sito" value={K.waterStress} options={WATER_STRESS.map(x => ({ id: x, label: STRESS_TXT[x] || x, title: 'Classe di stress idrico del sito (impostazione)' }))}
          onChange={v => setEsgSettings('ambiente', { waterStress: v }, `Registri ambientali: stress idrico «${v}»`)} />
      </div>
      <Panel title="Prelievo, scarico e consumo per mese" sub={`${monthLabel(chartM[0] || last, true)} – ${monthLabel(last, true)}: m³ del registro dell’acqua e degli scarichi`}>
        {months.length ? <LineChart ariaLabel="Prelievo, scarico e consumo per mese" unit="m³" decimals={0} height={220}
          labels={chartM.map(m => monthLabel(m, true))}
          series={[{ key: 'w', label: 'Prelievo', color: SERIES[0], values: months.map(m => m.withdrawal) },
            { key: 'd', label: 'Scarico', color: SERIES[1], values: months.map(m => m.discharge) },
            { key: 'c', label: 'Consumo', color: SERIES[2], dashed: true, values: months.map(m => m.consumption) }]} />
          : <p className="muted small">Nessuna lettura dell’acqua nel periodo: inserire le letture di pozzo e acquedotto.</p>}
        {monthRows.length ? <Table rows={monthRows} rowKey={x => x.id} pageSize={12} exportName="acqua-mesi" cols={MONTH_COLS.map(c => ({ key: c.key, label: c.label, align: c.align, sort: true,
          render: c.key === 'status' ? x => <Chip kind={x.status === 'in regola' ? 'good' : x.status === 'scarico non registrato' ? 'outline' : 'warn'}>{x.status}</Chip> : c.render }))} /> : null}
      </Panel>
      <div className="g2 eam-two">
        <Panel title="Scarichi" sub="Punto, recettore, volume e analisi del campione. Un valore sopra il limite è segnalato" flush
          actions={<Btn small kind="ghost" icon={LuPlus} onClick={() => setEdit({})}>Nuovo scarico</Btn>}>
          <Table rows={discharges} rowKey={x => x.id} pageSize={10} onRow={x => setEdit(x)} exportName="scarichi" empty="Nessuno scarico nel periodo: registrare volume e analisi dal contatore e dal laboratorio" cols={[
            { key: 'month', label: 'Mese', render: x => monthLabel(x.month, true), sort: true },
            { key: 'point', label: 'Punto di scarico', render: x => <span className="eam-wrap">{x.point}<span className="sub">{x.receptor}{x.permitRef ? ` · ${x.permitRef}` : ''}</span></span> },
            { key: 'm3', label: 'm³', align: 'r', sort: true, render: x => nf(x.m3, 0) },
            { key: 'analyses', label: 'Analisi', nosort: true, render: x => <span className="eam-wrap">{(x.analyses || []).map((a, i) => <span key={i} className="eam-an-line">{a.param} {numTxt(a.value, 2)} {a.unit}{a.limit != null ? ` (limite ${numTxt(a.limit, 2)})` : ''} {a.limit != null && +a.value > +a.limit ? <Chip kind="crit">oltre il limite</Chip> : null}</span>)}</span> },
          ]} />
        </Panel>
        <Panel title="Sostanze scaricate nel periodo" sub="Massa = volume × concentrazione (kg = m³ × mg/l ÷ 1000), sui campioni registrati" flush>
          <Table rows={sub} rowKey={x => x.param} pageSize={10} exportName="sostanze-scaricate" empty="Nessuna analisi di scarico nel periodo" cols={[
            { key: 'param', label: 'Sostanza', render: x => <span className="eam-wrap">{x.param}<span className="sub">{x.samples} campioni · limite più basso {x.limit != null ? numTxt(x.limit, 2) : '—'} mg/l</span></span> },
            { key: 'kg', label: 'kg nel periodo', align: 'r', sort: true, render: x => numTxt(x.kg, x.kg < 10 ? 2 : 0) },
            { key: 'maxValue', label: 'Valore massimo mg/l', align: 'r', sort: true, render: x => numTxt(x.maxValue, 2) },
          ]} />
        </Panel>
      </div>
      <p className="small muted eam-note">Il prelievo viene dal registro dell’acqua della scheda Acqua; lo scarico e le analisi si inseriscono qui. Il limite è quello dell’autorizzazione o del gestore riportato nel record: non è una verifica di conformità.</p>
      {edit && <DischargeDrawer d={d} rec={edit.id ? edit : null} defaults={newDefault} onClose={() => setEdit(null)} />}
    </>
  );
}

const MONTH_COLS = [
  { key: 'month', label: 'Mese', render: x => monthLabel(x.month, true) },
  { key: 'withdrawal', label: 'Prelievo m³', align: 'r', render: x => nf(x.withdrawal, 0) },
  { key: 'discharge', label: 'Scarico m³', align: 'r', render: x => (x.discharge == null ? '—' : nf(x.discharge, 0)) },
  { key: 'consumption', label: 'Consumo m³', align: 'r', render: x => (x.consumption == null ? '—' : nf(x.consumption, 0)) },
  { key: 'lt', label: 'l/t', align: 'r', render: x => (x.lt == null ? '—' : nf(x.lt, 0)) },
  { key: 'status', label: 'Stato', nosort: true },
];

/** Sostanze degli scarichi nel periodo: per parametro in mg/l, massa = m³ × mg/l ÷ 1000. */
export function substances(rows) {
  const m = new Map();
  for (const r of rows) for (const a of r.analyses || []) {
    if (!a || a.value == null || !/mg\/l/i.test(a.unit || 'mg/l')) continue;
    const x = m.get(a.param) || { param: a.param, kg: 0, samples: 0, maxValue: null, limit: null };
    x.kg += (+r.m3 || 0) * (+a.value) / 1000; x.samples++;
    x.maxValue = x.maxValue == null ? +a.value : Math.max(x.maxValue, +a.value);
    if (a.limit != null) x.limit = x.limit == null ? +a.limit : Math.min(x.limit, +a.limit);
    m.set(a.param, x);
  }
  return [...m.values()].sort((a, b) => b.kg - a.kg);
}

/** Scheda di uno scarico: campi del registro più le analisi; nuovo o modifica, con eliminazione. */
function DischargeDrawer({ d, rec, defaults, onClose }) {
  const [rows, setRows] = useState(() => (rec?.analyses || []).map(a => ({ param: a.param, value: a.value, unit: a.unit, limit: a.limit })));
  const title = rec ? `Scarico di ${monthLabel(rec.month, false)}` : 'Nuovo scarico';
  return (
    <Drawer title={title} sub="Scarichi idrici" wide onClose={onClose}
      actions={rec ? <Btn kind="danger" icon={LuTrash2} onClick={() => removeRecord('waterDischarges', rec.id, 'Scarico idrico', 'questo scarico')}>Elimina</Btn> : null}>
      <RecordForm coll="waterDischarges" rec={rec} d={d} defaults={{ measured: true, receptor: 'fognatura', ...defaults }} saveLabel={rec ? 'Salva' : 'Aggiungi'} onCancel={onClose}
        onSave={v => { saveRecord('waterDischarges', rec, { ...v, analyses: cleanAnalyses(rows) }, 'Scarico idrico'); onClose(); }}>
        <AnalysisEditor rows={rows} onChange={setRows} />
      </RecordForm>
      <p className="small muted">Le analisi con un limite segnalano il superamento; valore e limite restano quelli del campione.</p>
    </Drawer>
  );
}
