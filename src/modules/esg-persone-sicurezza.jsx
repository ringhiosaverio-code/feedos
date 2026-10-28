/* FeedOS 18 · ESG › Persone e sicurezza › Sicurezza: indici UNI 7249 (IF × 10⁶, IG × 10³) e tasso del VS B9 (× 200.000) con formula e
 * moltiplicatore, ore lavorate per mese (con la stima ETP × 1.720 h segnalata), registro degli infortuni e dei quasi infortuni senza nomi,
 * cause e reparti, riferimento di settore (stima derivata), azioni correttive. Prefisso CSS epe-. Scritture con store.batch. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuSave } from 'react-icons/lu';
import { store } from '../core/store.js';
import { nf, dateIt, addMonths, monthLabel, monthsIn, daysBetween } from '../core/util.js';
import { safetyRates, monthlySafety, actionsState, isRecordable, isLti, packItem } from '../engine/esg-persone.js';
import { Panel, Kpi, Table, Btn, Empty, Chip, NumInput, Field, Select } from '../ui/ui.jsx';
import { Columns, Bars, LineChart, Legend } from '../ui/charts.jsx';
import { QualityChip, StatusChip } from './esg-shared.jsx';
import { numTxt, dt, dayTxt, RecordDrawer, undoToast, vsMonth, pctChange, prevMonth, PackSource } from './esg-persone-ui.jsx';

const KIND_CHIP = { infortunio: 'crit', 'quasi-infortunio': 'warn', 'malattia-professionale': 'violet', 'in-itinere': 'outline' };
const ACT_CHIP = { aperta: 'outline', 'in corso': 'accent', chiusa: 'good' };

export function Sicurezza({ d, P, S, today, arg }) {
  const r = S?.rates, rp = S?.ratesPrev;
  const [open, setOpen] = useState(arg === 'nuovo' ? 'new' : null);
  const [act, setAct] = useState(null);
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const months = useMemo(() => monthsIn(P.from, P.to), [P.from, P.to]);
  const series = useMemo(() => monthlySafety(d, monthsIn(addMonths(lastClosed, -12), lastClosed)), [d, lastClosed]);
  const cur = series[series.length - 1], before = series[series.length - 2];
  const band = S?.band;
  const lines = useMemo(() => Object.fromEntries((d.lines || []).map(l => [l.id, l.name])), [d.lines]);
  const injuries = useMemo(() => [...(d.injuries || [])].sort((a, b) => (a.date < b.date ? 1 : -1)), [d.injuries]);
  const acts = useMemo(() => actionsState(d, today), [d, today]);
  const items = { if: packItem(d, 'idx-if'), ig: packItem(d, 'idx-ig'), b9: packItem(d, 'idx-b9'), fb: packItem(d, 'hours-fallback') };
  const hoursD = pctChange(cur?.hours, before?.hours);
  const ifD = pctChange(cur?.if12, before?.if12);
  const injDrawer = open ? <InjuryDrawer d={d} rec={open === 'new' ? null : open} today={today} onClose={() => setOpen(null)} /> : null;
  const actDrawer = act ? <ActionDrawer d={d} rec={act === 'new' ? null : act} today={today} onClose={() => setAct(null)} /> : null;
  return (
    <>
      <div className="kpis">
        <Kpi label="Indice di frequenza" value={numTxt(r?.ifr)} unit="per 10⁶ h" foot={r ? `${r.lti} infortuni con assenza · ${P.short}` : ''} cmp={r && rp?.ifr != null ? { value: rp.ifr, cur: r.ifr, kind: 'ratio', good: 'down', decimals: 1, label: 'anno prima' } : undefined} />
        <Kpi label="Indice di gravità" value={numTxt(r?.igr, 2)} unit="per 10³ h" foot={r ? `${r.lostDays} giornate perse${r.convDays ? ` + ${r.convDays} convenzionali` : ''}` : ''} cmp={r && rp?.igr != null ? { value: rp.igr, cur: r.igr, kind: 'ratio', good: 'down', decimals: 2, label: 'anno prima' } : undefined} />
        <Kpi label="Infortuni registrabili (VS B9)" value={numTxt(r?.b9)} unit="per 200.000 h" foot={r ? `${r.recordable} registrabili · ${r.fatalities ? `${r.fatalities} decessi` : 'nessun decesso'}` : ''} cmp={r && rp?.b9 != null ? { value: rp.b9, cur: r.b9, kind: 'ratio', good: 'down', decimals: 1, label: 'anno prima' } : undefined} />
        <Kpi label="Quasi infortuni segnalati" value={r ? nf(r.nearMiss) : '—'} foot={r?.nearMissRatio != null ? `${nf(r.nearMissRatio, 1)} per infortunio registrabile` : 'nel periodo'} />
        <Kpi label={`Ore lavorate a ${monthLabel(lastClosed, false)}`} value={cur?.hours != null ? nf(cur.hours) : '—'} unit="h" delta={hoursD} deltaGood={null} foot={hoursD != null ? vsMonth(prevMonth(lastClosed)) : cur?.src === 'mancante' ? 'mese senza ore' : ''} />
        <Kpi label="Indice di frequenza, 12 mesi" value={numTxt(cur?.if12)} unit="per 10⁶ h" delta={ifD} deltaGood={ifD == null ? null : ifD <= 0} foot={ifD != null ? vsMonth(prevMonth(lastClosed)) : ''} />
      </div>
      <Panel title="Come si calcolano gli indici" sub={`Esercizio ${P.label}: ${r?.hours != null ? `${nf(r.hours)} ore lavorate` : 'ore non disponibili'}`}
        actions={r ? <span className="epe-src small">ore <QualityChip q={r.hoursQuality} /></span> : null} flush>
        {r ? <Table rows={[
          { id: 'if', name: 'Indice di frequenza (IF)', value: numTxt(r.ifr), unit: 'per 10⁶ h', formula: r.formulas.ifr, item: items.if },
          { id: 'ig', name: 'Indice di gravità (IG)', value: numTxt(r.igr, 2), unit: 'per 10³ h', formula: r.formulas.igr, item: items.ig },
          { id: 'b9', name: 'Tasso del VS B9', value: numTxt(r.b9), unit: 'per 200.000 h', formula: r.formulas.b9, item: items.b9 },
        ]} rowKey={x => x.id} pageSize={5} cols={[
          { key: 'name', label: 'Indice', nosort: true },
          { key: 'value', label: 'Valore', align: 'r', nosort: true, render: x => <span className="epe-num">{x.value} <span className="xs muted">{x.unit}</span></span> },
          { key: 'formula', label: 'Formula con i numeri del periodo', nosort: true, render: x => <span className="epe-wrap">{x.formula}</span> },
          { key: 'src', label: 'Fonte', nosort: true, render: x => <PackSource item={x.item} validAsOf={S.pack.validAsOf} /> },
        ]} /> : <Empty title="Nessun dato del periodo">Inserire le ore lavorate e gli eventi del registro.</Empty>}
        {r?.hoursEstimated?.length ? <p className="note warn small epe-m16">Ore stimate per {r.hoursEstimated.length} {r.hoursEstimated.length === 1 ? 'mese' : 'mesi'} ({r.hoursEstimated.map(m => monthLabel(m)).join(', ')}): ETP della fotografia × {nf(r.perFte)} h ÷ 12. Il dato risulta «stimato» nel VS. <StatusChip status={items.fb?.status} /></p> : null}
        {r?.inItinere ? <p className="small muted epe-m16">{r.inItinere === 1 ? 'Un infortunio in itinere è' : `${r.inItinere} infortuni in itinere sono`} nel registro ma fuori dagli indici.</p> : null}
        <div className="epe-m16 small">
          {band
            ? <span className="epe-src">Riferimento di settore: {band.label}, circa {band.lo}–{band.hi} {band.unit} (stima derivata, non dati di aziende){r?.ifr != null ? `; questo stabilimento ${nf(r.ifr, 1)}` : ''}. <StatusChip status={band.status} /></span>
            : <span className="muted">Nessun riferimento di settore nel pacchetto per questo settore: il confronto utile è con gli esercizi precedenti.</span>}
        </div>
      </Panel>
      <div className="grid g2">
        <Panel title="Indice di frequenza sui 12 mesi" sub="Valore a fine mese sugli ultimi 12 mesi">
          <LineChart series={[{ key: 'if', label: 'IF 12 mesi', color: 'var(--s1)', values: series.map(x => x.if12) }]} labels={series.map(x => monthLabel(x.month))} height={200} unit="" decimals={1}
            refs={band ? [{ y: band.hi, label: `settore ${band.hi}`, kind: 'muted' }] : []} ariaLabel="Indice di frequenza sui 12 mesi" />
        </Panel>
        <HoursEditor d={d} months={months} P={P} />
      </div>
      <div className="grid g2">
        <Panel title="Eventi per causa" sub="Infortuni e quasi infortuni del periodo (in itinere esclusi)">
          {r?.byCause?.length ? <Bars data={r.byCause.map(x => ({ key: x.key, label: x.key, value: x.events, color: x.injuries ? 'var(--s2)' : 'var(--s4)' }))} unit="" ariaLabel="Eventi per causa" /> : <Empty title="Nessun evento nel periodo" />}
          {r?.byCause?.length ? <Legend items={[{ label: 'con infortuni', color: 'var(--s2)' }, { label: 'solo quasi infortuni', color: 'var(--s4)' }]} /> : null}
        </Panel>
        <Panel title="Eventi per linea o reparto">
          {r?.byArea?.length ? <Bars data={r.byArea.map(x => ({ key: x.key, label: x.key, value: x.events }))} unit="" ariaLabel="Eventi per linea o reparto" /> : <Empty title="Nessun evento nel periodo" />}
        </Panel>
      </div>
      <Panel title="Registro degli infortuni e dei quasi infortuni" sub="Senza nomi né dati sanitari: tipo di evento, giorni di assenza e categoria della causa" flush
        actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setOpen('new')}>Nuovo evento</Btn>}>
        <Table rows={injuries} onRow={x => setOpen(x)} exportName="registro-infortuni" initialSort={{ key: 'date', dir: 'desc' }} pageSize={15} cols={[
          { key: 'date', label: 'Data', render: x => dt(x.date) },
          { key: 'kind', label: 'Tipo', render: x => <Chip kind={KIND_CHIP[x.kind] || 'outline'}>{x.kind}</Chip>, csv: x => x.kind },
          { key: 'where', label: 'Linea o reparto', value: x => lines[x.lineId] || x.area || '', render: x => <span className="epe-wrap">{lines[x.lineId] || x.area || '—'}</span> },
          { key: 'cause', label: 'Causa' },
          { key: 'recordable', label: 'Registrabile', render: x => (x.kind !== 'infortunio' ? '—' : x.recordable === true ? 'sì' : x.recordable === false ? 'no' : 'da indicare'), csv: x => (x.recordable == null ? '' : x.recordable ? 'sì' : 'no') },
          { key: 'lostDays', label: 'Giorni', align: 'r', render: x => (x.lostDays == null ? '—' : nf(x.lostDays)) },
          { key: 'note', label: 'Descrizione', render: x => <span className="epe-wrap">{x.note || ''}</span> },
        ]} empty="Nessun evento nel registro" />
      </Panel>
      <Panel title="Azioni correttive" sub={`${acts.open.length} aperte${acts.late.length ? `, ${acts.late.length} in ritardo` : ''} · ${acts.closed} chiuse`} flush
        actions={<Btn small icon={LuPlus} onClick={() => setAct('new')}>Nuova azione</Btn>}>
        <Table rows={[...acts.rows].sort((a, b) => (a.status === 'chiusa') - (b.status === 'chiusa') || String(a.due || '9').localeCompare(String(b.due || '9')))} onRow={x => setAct(x)} exportName="azioni-sicurezza" pageSize={10} cols={[
          { key: 'text', label: 'Azione', render: x => <span className="epe-wrap">{x.text}</span> },
          { key: 'event', label: 'Evento', value: x => injuries.find(i => i.id === x.injuryId)?.date || '', render: x => { const i = injuries.find(y => y.id === x.injuryId); return i ? `${dt(i.date)} · ${i.kind}` : '—'; } },
          { key: 'owner', label: 'Responsabile' },
          { key: 'due', label: 'Entro', render: x => (x.due ? <span className={acts.late.includes(x) ? 'epe-late' : ''}>{dt(x.due)}{x.status !== 'chiusa' ? ` · ${dayTxt(daysBetween(today, x.due))}` : ''}</span> : '—') },
          { key: 'status', label: 'Stato', render: x => <Chip kind={acts.late.includes(x) ? 'crit' : ACT_CHIP[x.status] || 'outline'}>{acts.late.includes(x) ? 'in ritardo' : x.status}</Chip>, csv: x => x.status },
        ]} empty="Nessuna azione registrata" />
      </Panel>
      {injDrawer}{actDrawer}
    </>
  );
}

/** Ore lavorate per mese dell'esercizio: modifica in griglia, un solo passo annullabile al salvataggio. */
function HoursEditor({ d, months, P }) {
  const by = useMemo(() => Object.fromEntries((d.hoursWorked || []).map(r => [String(r.month || r.id).slice(0, 7), r])), [d.hoursWorked]);
  const [draft, setDraft] = useState({});
  const val = (m, k) => (draft[m] && k in draft[m] ? draft[m][k] : by[m]?.[k] ?? null);
  const set = (m, k, v) => setDraft(x => ({ ...x, [m]: { ...(x[m] || {}), [k]: v } }));
  const changed = Object.keys(draft).filter(m => Object.entries(draft[m]).some(([k, v]) => (by[m]?.[k] ?? null) !== v));
  const H = useMemo(() => {
    const out = {};
    for (const m of months) out[m] = by[m] && Number.isFinite(+by[m].hours) ? 'misurato' : 'mancante';
    return out;
  }, [by, months]);
  const save = () => {
    const ops = [];
    for (const m of changed) {
      const patch = draft[m];
      if (by[m]) ops.push({ kind: 'update', coll: 'hoursWorked', id: by[m].id, patch });
      else if (patch.hours != null) ops.push({ kind: 'add', coll: 'hoursWorked', obj: { id: m, month: m, hours: patch.hours, overtime: patch.overtime ?? null, agencyHours: patch.agencyHours ?? null, absenceHours: null, note: '' } });
    }
    if (!ops.length) return;
    store.batch(ops, `Ore lavorate: ${ops.length === 1 ? monthLabel(changed[0], false) : `${ops.length} mesi`} aggiornate`);
    setDraft({});
    undoToast('Ore lavorate salvate');
  };
  const total = months.reduce((s, m) => s + (+val(m, 'hours') || 0), 0);
  return (
    <Panel title="Ore lavorate per mese" sub={`${P.short}: ${nf(total)} ore registrate dei dipendenti`} flush
      actions={<Btn small kind="primary" icon={LuSave} onClick={save} disabled={!changed.length}>Salva{changed.length ? ` (${changed.length})` : ''}</Btn>}>
      <div className="tw epe-hours">
        <table className="t">
          <thead><tr><th>Mese</th><th className="r">Ore</th><th className="r">Straordinari</th><th className="r">Somministrati</th><th>Dato</th></tr></thead>
          <tbody>
            {months.map(m => (
              <tr key={m}>
                <td>{monthLabel(m, false)}</td>
                <td className="r"><NumInput slim value={val(m, 'hours')} decimals={0} min={0} onChange={v => set(m, 'hours', v)} ariaLabel={`Ore di ${monthLabel(m, false)}`} /></td>
                <td className="r"><NumInput slim value={val(m, 'overtime')} decimals={0} min={0} onChange={v => set(m, 'overtime', v)} ariaLabel={`Straordinari di ${monthLabel(m, false)}`} /></td>
                <td className="r"><NumInput slim value={val(m, 'agencyHours')} decimals={0} min={0} onChange={v => set(m, 'agencyHours', v)} ariaLabel={`Ore dei somministrati di ${monthLabel(m, false)}`} /></td>
                <td>{draft[m] ? <Chip kind="accent">da salvare</Chip> : H[m] === 'misurato' ? <QualityChip q="misurato" /> : <span title="Si stima con gli ETP della fotografia × 1.720 h ÷ 12"><QualityChip q="stimato" /></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Cassetto di un evento del registro. */
function InjuryDrawer({ d, rec, today, onClose }) {
  const validate = o => (o.kind === 'infortunio' && o.fatal && !o.recordable ? 'Un infortunio mortale è sempre registrabile' : null);
  return (
    <RecordDrawer d={d} coll="injuries" rec={rec} onClose={onClose} validate={validate} labelOf={o => `${o.kind || 'evento'} del ${dateIt(o.date)}`}
      defaults={{ date: today, kind: 'infortunio', recordable: false, lostDays: 0, convDays: 0, fatal: false, status: 'aperto', lineId: null, area: '', cause: 'altro', inailRef: '', note: '' }}
      title={rec ? `${rec.kind} del ${dateIt(rec.date)}` : 'Nuovo evento nel registro'}>
      <p className="note small epe-note">Registrabile: infortunio che richiede cure oltre il primo soccorso, assenza o limitazioni al lavoro. Giorni di assenza: oltre quello dell’evento (0 se nessuno). Nessun nome e nessuna diagnosi: bastano tipo, giorni e causa.</p>
      {rec && rec.kind === 'infortunio' && <p className="small">{isLti(rec) ? 'Conta nell’indice di frequenza (assenza di almeno un giorno).' : 'Non conta nell’indice di frequenza (nessuna assenza).'} {isRecordable(rec) ? 'Conta nel tasso del VS B9.' : 'Non conta nel tasso del VS B9.'}</p>}
    </RecordDrawer>
  );
}

/** Cassetto di un'azione correttiva, con l'evento collegato. */
function ActionDrawer({ d, rec, today, onClose }) {
  const [injuryId, setInjury] = useState(rec?.injuryId || '');
  const evs = [...(d.injuries || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 80);
  return (
    <RecordDrawer d={d} coll="safetyActions" rec={rec} onClose={onClose} extra={{ injuryId: injuryId || null }} labelOf={o => String(o.text || '').slice(0, 60)}
      defaults={{ text: '', owner: 'RSPP', due: null, status: 'aperta', closedAt: null, note: '' }} title={rec ? 'Azione correttiva' : 'Nuova azione correttiva'}>
      <Field label="Evento collegato">
        <Select value={injuryId} onChange={setInjury} options={[{ id: '', label: 'nessuno' }, ...evs.map(i => ({ id: i.id, label: `${dateIt(i.date)} · ${i.kind} · ${i.cause || ''}` }))]} ariaLabel="Evento collegato" />
      </Field>
    </RecordDrawer>
  );
}
