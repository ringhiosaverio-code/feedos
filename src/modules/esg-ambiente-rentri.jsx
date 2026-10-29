/* FeedOS 18 · ESG › Registri ambientali › RENTRI e MUD: registrazione dei movimenti entro 10 giorni lavorativi, xFIR dal 15/09/2026,
 * operazione finale (solo R1–R12 contano come recupero), e il MUD per EER × operazione × destinazione con il CSV per il compilatore. */
import React, { useState } from 'react';
import { LuDownload, LuTrash2 } from 'react-icons/lu';
import { nf, dateIt } from '../core/util.js';
import { Panel, Kpi, Table, Btn, Drawer, Seg, Chip, Kv, Empty } from '../ui/ui.jsx';
import { mudSummary, XFIR_FROM, RENTRI_DAYS, isFinalRecovery } from '../engine/esg-ambiente.js';
import { numTxt, pctChange, prevMonth, vsMonth, downloadCsv, saveRecord, removeRecord, RecordForm } from './esg-ambiente-ui.jsx';

const STATUS_KIND = { regolare: 'good', 'da registrare': 'outline', 'in ritardo': 'crit', 'xFIR mancante': 'warn' };
const MUD_COLS = [
  { key: 'eer', label: 'Codice EER' }, { key: 'name', label: 'Descrizione' },
  { key: 'hazardous', label: 'Pericoloso', render: x => (x.hazardous ? 'sì' : 'no') },
  { key: 'op', label: 'Operazione' }, { key: 'prelimTxt', label: 'Operazione preliminare' },
  { key: 'dest', label: 'Destinazione' }, { key: 'kg', label: 'kg' }, { key: 'n', label: 'Movimenti' },
];

/** Sezione «rentri». */
export function RentriSection({ d, P, S, today }) {
  const R = S.rentri;
  const [edit, setEdit] = useState(null);
  const [yearPick, setYearPick] = useState(null);
  const years = [...new Set(R.rows.map(r => r.date.slice(0, 4)))].sort().reverse();
  const year = years.includes(yearPick) ? yearPick : (years.find(y => y === P.to.slice(0, 4)) || years[0] || null);
  const M = year ? mudSummary(d, today, +year) : null;
  const last = P.to.slice(0, 7), prev = prevMonth(last);
  const cm = m => R.byMonth.find(x => x.month === m)?.completeness ?? null;
  const rows = [...R.rows].reverse();
  const mudRows = M ? M.lines.map(x => ({ ...x, prelimTxt: x.prelim ? 'sì' : 'no', id: `${x.eer}|${x.op}|${x.dest}` })) : [];
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Movimenti registrati" value={cm(last) != null ? nf(cm(last) * 100, 0) : (R.completeness != null ? nf(R.completeness * 100, 0) : '—')} unit="%"
          foot={R.total ? `${R.registered} di ${R.total} nel periodo · ultimo mese ${vsMonth(prev)}` : 'nessun movimento nel periodo'}
          delta={pctChange(cm(last), cm(prev))} deltaGood={cm(last) != null && cm(prev) != null ? cm(last) >= cm(prev) : null} />
        <Kpi label="Registrati oltre il termine" value={R.late} foot={`termine: ${RENTRI_DAYS} giorni lavorativi dalla data del movimento`} />
        <Kpi label="Senza xFIR dal 15/09/2026" value={R.xfirMissing} foot={R.xfirRows ? `${R.xfirRows} movimenti dal ${dateIt(XFIR_FROM)}` : 'nessun movimento dal 15/09/2026'} />
        <Kpi label="Recupero a operazione finale R1–R12" value={R.finalRecoveryPct != null ? nf(R.finalRecoveryPct * 100, 0) : '—'} unit="%"
          foot={`${numTxt(R.pendingKg / 1000, 1)} t in attesa di operazione finale (R13, D15)`} />
      </div>
      <Panel title="Registro dei movimenti del periodo" sub="Ogni movimento: registrazione, xFIR e operazione finale. Un clic per completare il dato" flush>
        <Table rows={rows} rowKey={x => x.id} pageSize={12} exportName="rentri-movimenti" onRow={x => setEdit(x)} empty="Nessun movimento nel periodo: il registro dei rifiuti è vuoto per questi mesi" cols={[
          { key: 'date', label: 'Data', render: x => dateIt(x.date), sort: true },
          { key: 'eer', label: 'Codice EER', render: x => <span className="eam-wrap">{x.eer}<span className="sub">{x.name}</span></span> },
          { key: 'kg', label: 'kg', align: 'r', sort: true, render: x => nf(x.kg, 0) },
          { key: 'final', label: 'Operazione', render: x => (x.final ? `${x.final}${isFinalRecovery(x.final) ? ' (recupero)' : ''}` : x.op ? `${x.op} in attesa` : '—') },
          { key: 'dest', label: 'Destinazione' },
          { key: 'registeredAt', label: 'Registrato il', render: x => (x.registeredAt ? dateIt(x.registeredAt) : `entro ${dateIt(x.deadline)}`) },
          { key: 'xfirId', label: 'xFIR', render: x => (x.reg?.xfirId || (x.xfirRequired ? 'mancante' : '—')) },
          { key: 'status', label: 'Stato', nosort: true, render: x => <Chip kind={STATUS_KIND[x.status] || 'outline'}>{x.status}</Chip> },
        ]} />
      </Panel>
      <Panel title="MUD" sub={`Somme per codice EER, operazione e destinazione dei movimenti dell’anno: il file CSV è per il compilatore del MUD`}
        actions={<>
          {years.length > 1 && <Seg label="Anno del MUD" value={year} onChange={setYearPick} options={years.map(y => ({ id: y, label: y }))} />}
          <Btn small kind="ghost" icon={LuDownload} onClick={() => M && downloadCsv(`mud-${year}`, mudRows, MUD_COLS)} disabled={!M || !M.lines.length}>CSV MUD</Btn>
        </>}>
        {M && M.lines.length ? (
          <>
            <div className="kpis eam-kpis">
              <Kpi label={`Rifiuti dell’anno ${year}`} value={nf(M.kg / 1000, 1)} unit="t" foot={`${M.n} movimenti · ${numTxt(M.hazKg / 1000, 1)} t pericolosi`} />
              <Kpi label="Operazione preliminare non chiusa" value={numTxt(M.prelimKg / 1000, 1)} unit="t" foot="R13 e D15 senza operazione finale" />
            </div>
            <Table rows={mudRows} rowKey={x => x.id} pageSize={12} cols={[
              { key: 'eer', label: 'EER', render: x => <span className="eam-wrap">{x.eer}<span className="sub">{x.name}</span></span> },
              { key: 'hazardous', label: 'Pericoloso', render: x => (x.hazardous ? <Chip kind="warn">sì</Chip> : 'no') },
              { key: 'op', label: 'Operazione', render: x => (x.prelim ? `${x.op} (preliminare)` : x.op) },
              { key: 'dest', label: 'Destinazione' },
              { key: 'kg', label: 'kg', align: 'r', sort: true, render: x => nf(x.kg, 0) },
              { key: 'n', label: 'Movimenti', align: 'r', render: x => nf(x.n) },
            ]} />
            {M.partialYear && <p className="small muted eam-note">Anno parziale: il registro comincia dopo il primo gennaio.</p>}
          </>
        ) : <Empty title={`Nessun movimento nel ${year || 'registro'}`}>Il MUD si ricava dal registro di carico e scarico dell’anno.</Empty>}
      </Panel>
      {edit && <MovementDrawer d={d} row={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

const REG_COLS = [
  { key: 'date', label: 'Data' }, { key: 'eer', label: 'EER' }, { key: 'name', label: 'Descrizione' }, { key: 'kg', label: 'kg' },
  { key: 'op', label: 'Operazione preliminare' }, { key: 'final', label: 'Operazione finale' }, { key: 'dest', label: 'Destinazione' },
  { key: 'registeredAt', label: 'Registrato il' }, { key: 'xfirId', label: 'xFIR', value: x => x.reg?.xfirId || '' }, { key: 'status', label: 'Stato' },
];

/** Registrazione RENTRI di un movimento: dati del trasportatore e dell’impianto, data di registrazione, xFIR e operazione finale. */
function MovementDrawer({ d, row, onClose }) {
  const rec = row.reg || null;
  const title = `Movimento del ${dateIt(row.date)}`;
  const save = v => {
    const obj = { ...v };
    if (rec) saveRecord('wasteRentri', rec, obj, 'RENTRI');
    else saveRecord('wasteRentri', null, { id: row.id, ...obj }, 'RENTRI');
    onClose();
  };
  return (
    <Drawer title={title} sub={`${row.eer} · ${numTxt(row.kg, 0)} kg`} wide onClose={onClose}
      actions={rec ? <Btn kind="danger" icon={LuTrash2} onClick={() => removeRecord('wasteRentri', rec.id, 'Registrazione RENTRI', 'questa registrazione')}>Elimina</Btn> : null}>
      <Kv items={[
        ['Stato', <Chip kind={STATUS_KIND[row.status] || 'outline'}>{row.status}</Chip>],
        ['Termine di registrazione', `${dateIt(row.deadline)} (${RENTRI_DAYS} giorni lavorativi)`],
        ['Operazione preliminare', row.op || '—'],
        ['Destinazione', row.dest || '—'],
        ['FIR del formulario', row.fir || '—'],
      ]} />
      <RecordForm coll="wasteRentri" rec={rec} d={d} defaults={{}} saveLabel={rec ? 'Salva' : 'Registra'} onSave={save} onCancel={onClose} />
      <p className="small muted">Operazione finale: R1–R12 contano come recupero; R13 e D15 restano in attesa finché non se ne indica una.</p>
    </Drawer>
  );
}
