/* FeedOS 18 · ESG › Registri ambientali › Emissioni in atmosfera (VS B4): registro dei camini (origine, inquinante, portata, ore, limite,
 * frequenza), campionamenti con il limite in grafico, kg/anno per camino (media × portata × ore). Scadenze dei campionamenti. */
import React, { useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { nf, dateIt } from '../core/util.js';
import { Panel, Kpi, Table, Btn, Drawer, Chip, Empty } from '../ui/ui.jsx';
import { LineChart, SERIES } from '../ui/charts.jsx';
import { pollutantLabel, STACK_POLLUTANTS, STACK_ORIGINS } from '../engine/esg-ambiente.js';
import { numTxt, saveRecord, removeRecord, RecordForm } from './esg-ambiente-ui.jsx';

const DUE_KIND = { 'in regola': 'good', 'entro 30 giorni': 'warn', scaduto: 'crit', mancante: 'crit' };

/** Sezione «aria». */
export function AriaSection({ d, P, S }) {
  const [edit, setEdit] = useState(null);     // {kind:'stack'|'sample', rec?}
  const st = S.stacks.stacks, dust = S.stacks.dustKg;
  const samples = (d.stackSamples || []).filter(x => x && x.date >= P.from && x.date <= P.to).sort((a, b) => (a.date < b.date ? 1 : -1));
  const byId = Object.fromEntries((d.stacks || []).map(s => [s.id, s]));
  const stackRows = st.map(s => ({ ...s, pollLabel: pollutantLabel(s.pollutant) }));
  const sampleRows = samples.map(x => ({ ...x, code: byId[x.stackId]?.code || x.stackId, limit: byId[x.stackId]?.limitMgNm3 ?? null, over: byId[x.stackId] && +x.valueMgNm3 > +byId[x.stackId].limitMgNm3 }));
  const withSamples = st.filter(s => s.samples.length);
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Polveri dai camini" value={dust != null ? nf(dust, 0) : '—'} unit="kg/anno" foot="media dei campionamenti × portata × ore, camini a polveri" />
        <Kpi label="Campionamenti sopra il limite" value={S.stacks.exceed.length} status={S.stacks.exceed.length ? 'bad' : 'ok'} foot="nel periodo" />
        <Kpi label="Campionamenti da fare" value={st.filter(s => s.dueState !== 'in regola').length} foot="entro 30 giorni, scaduti o mai fatti" />
        <Kpi label="Camini nel registro" value={st.length} foot={`${S.stacks.samples} campionamenti in archivio`} />
      </div>
      <Panel title="Registro dei camini" sub="Origine, inquinante, limite e frequenza dell’autorizzazione. Un clic per modificare il camino" flush
        actions={<Btn small kind="ghost" icon={LuPlus} onClick={() => setEdit({ kind: 'stack' })}>Nuovo camino</Btn>}>
        <Table rows={stackRows} rowKey={x => x.id} pageSize={10} exportName="camini" onRow={x => setEdit({ kind: 'stack', rec: d.stacks.find(s => s.id === x.id) })}
          empty="Nessun camino nel registro: inserire i punti di emissione e il limite dell’autorizzazione" cols={[
            { key: 'code', label: 'Camino', render: x => <span className="eam-wrap">{x.code}<span className="sub">{x.name}</span></span> },
            { key: 'origin', label: 'Origine' },
            { key: 'pollLabel', label: 'Inquinante' },
            { key: 'flowNm3h', label: 'Nm³/h', align: 'r', render: x => nf(x.flowNm3h, 0) },
            { key: 'limitMgNm3', label: 'Limite mg/Nm³', align: 'r', render: x => numTxt(x.limitMgNm3, 0) },
            { key: 'mean', label: 'Media mg/Nm³', align: 'r', render: x => numTxt(x.mean, 2) },
            { key: 'kgYr', label: 'kg/anno', align: 'r', sort: true, render: x => (x.kgYr == null ? '—' : nf(x.kgYr, x.kgYr < 10 ? 1 : 0)) },
            { key: 'nextDue', label: 'Prossimo campionamento', render: x => (x.nextDue ? dateIt(x.nextDue) : 'mai campionato') },
            { key: 'dueState', label: 'Stato', nosort: true, render: x => <Chip kind={DUE_KIND[x.dueState] || 'outline'}>{x.dueState}</Chip> },
          ]} />
      </Panel>
      {withSamples.length > 0 && (
        <Panel title="Campionamenti e limiti" sub="Ogni grafico riporta il limite dell’autorizzazione come linea di riferimento">
          <div className="eam-charts">
            {withSamples.map((s, i) => (
              <figure className="eam-chart" key={s.id}>
                <figcaption className="small"><b>{s.code}</b> · {pollutantLabel(s.pollutant)} · limite {numTxt(s.limitMgNm3, 0)} mg/Nm³</figcaption>
                <LineChart ariaLabel={`Campionamenti del camino ${s.code}`} unit="mg/Nm³" decimals={1} height={180} markLast={false}
                  labels={s.samples.map(x => dateIt(x.date, 'dm'))}
                  refs={s.limitMgNm3 != null ? [{ y: s.limitMgNm3, label: 'limite', kind: 'crit' }] : []}
                  series={[{ key: 'v', label: s.code, color: SERIES[i % SERIES.length], values: s.samples.map(x => +x.valueMgNm3) }]} />
              </figure>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Campionamenti del periodo" sub="Un clic per correggere un campione o aggiungerne uno"
        actions={<Btn small kind="ghost" icon={LuPlus} onClick={() => setEdit({ kind: 'sample' })} disabled={!(d.stacks || []).length}>Nuovo campionamento</Btn>} flush>
        <Table rows={sampleRows} rowKey={x => x.id} pageSize={10} exportName="campionamenti-camini" onRow={x => setEdit({ kind: 'sample', rec: d.stackSamples.find(s => s.id === x.id) })}
          empty="Nessun campionamento nel periodo" cols={[
            { key: 'date', label: 'Data', render: x => dateIt(x.date), sort: true },
            { key: 'code', label: 'Camino' },
            { key: 'valueMgNm3', label: 'mg/Nm³', align: 'r', sort: true, render: x => numTxt(x.valueMgNm3, 2) },
            { key: 'limit', label: 'Limite', align: 'r', render: x => numTxt(x.limit, 0) },
            { key: 'lab', label: 'Laboratorio', render: x => x.lab || '—' },
            { key: 'over', label: 'Esito', nosort: true, render: x => (x.over ? <Chip kind="crit">oltre il limite</Chip> : <Chip kind="good">entro il limite</Chip>) },
          ]} />
      </Panel>
      <p className="small muted eam-note">kg/anno = media dei campionamenti del periodo (mg/Nm³) × portata (Nm³/h) × ore di funzionamento annue ÷ 10⁶. Con un solo campionamento il dato è indicativo; la media resta quella del laboratorio.</p>
      {edit && edit.kind === 'stack' && <StackDrawer d={d} rec={edit.rec || null} onClose={() => setEdit(null)} />}
      {edit && edit.kind === 'sample' && <SampleDrawer d={d} rec={edit.rec || null} P={P} onClose={() => setEdit(null)} />}
    </>
  );
}

/** Scheda di un camino (nuovo o modifica): origine, inquinante, portata, ore, limite, frequenza e autorizzazione. */
function StackDrawer({ d, rec, onClose }) {
  return (
    <Drawer title={rec ? `Camino ${rec.code}` : 'Nuovo camino'} sub="Emissioni in atmosfera" wide onClose={onClose}
      actions={rec ? <Btn kind="danger" icon={LuTrash2} onClick={() => removeRecord('stacks', rec.id, 'Camino', `il camino ${rec.code}`)}>Elimina</Btn> : null}>
      <RecordForm coll="stacks" rec={rec} d={d} defaults={{ freqMonths: 6, pollutant: 'polveri', origin: 'ricevimento' }} saveLabel={rec ? 'Salva' : 'Aggiungi'} onCancel={onClose}
        onSave={v => { saveRecord('stacks', rec, v, 'Camino'); onClose(); }} />
      <p className="small muted">Inquinanti: {STACK_POLLUTANTS.map(pollutantLabel).join(', ')}. Origini: {STACK_ORIGINS.join(', ')}. Limite e frequenza sono quelli dell’autorizzazione.</p>
    </Drawer>
  );
}

/** Campionamento di un camino (nuovo o modifica): data, concentrazione, laboratorio, evidenza. */
function SampleDrawer({ d, rec, P, onClose }) {
  const first = (d.stacks || [])[0]?.id || '';
  return (
    <Drawer title={rec ? `Campionamento del ${dateIt(rec.date)}` : 'Nuovo campionamento'} sub="Emissioni in atmosfera" onClose={onClose}
      actions={rec ? <Btn kind="danger" icon={LuTrash2} onClick={() => removeRecord('stackSamples', rec.id, 'Campionamento', 'questo campionamento')}>Elimina</Btn> : null}>
      <RecordForm coll="stackSamples" rec={rec} d={d} defaults={{ stackId: first, date: P.to }} saveLabel={rec ? 'Salva' : 'Aggiungi'} onCancel={onClose}
        onSave={v => { saveRecord('stackSamples', rec, v, 'Campionamento al camino'); onClose(); }} />
      <p className="small muted">Il valore è la concentrazione del rapporto di prova (mg/Nm³ alle condizioni normali). Il superamento del limite è segnalato in Oggi come critico.</p>
    </Drawer>
  );
}
