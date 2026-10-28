/* FeedOS 18 · ESG › Persone e sicurezza › Formazione: ore-persona per genere e per tema (VS B10, medie per genere non mostrate sotto
 * 5 persone), scadenze della formazione obbligatoria (validità del corso o periodicità di base del pacchetto, stato «da verificare»),
 * registro delle sessioni senza nomi (partecipanti per genere). Prefisso CSS epe-. Scritture con store.batch. */
import React, { useMemo, useState } from 'react';
import { LuPlus } from 'react-icons/lu';
import { nf, dateIt, addMonths, monthLabel, monthsIn, daysBetween } from '../core/util.js';
import { trainingExpiries, topicLabel, topicsFor, sessionDue } from '../engine/esg-persone.js';
import { Panel, Kpi, Table, Btn, Empty, Chip } from '../ui/ui.jsx';
import { Columns, Bars, Legend } from '../ui/charts.jsx';
import { StatusChip } from './esg-shared.jsx';
import { pctTxt, numTxt, dt, dayTxt, RecordDrawer, vsMonth, pctChange, prevMonth } from './esg-persone-ui.jsx';

const EXP_CHIP = { scaduta: 'crit', 'in scadenza': 'warn', valida: 'good', 'senza scadenza': 'outline' };
const people = t => (+t.partF || 0) + (+t.partM || 0) + (+t.partNd || 0);

export function Formazione({ d, P, S, today, arg }) {
  const [open, setOpen] = useState(arg === 'nuovo' ? 'new' : null);
  const t = S?.training, tp = S?.trainingPrev;
  const exp = useMemo(() => trainingExpiries(d, today), [d, today]);
  const soon = exp.filter(x => x.status === 'scaduta' || x.status === 'in scadenza');
  const lastClosed = addMonths(today.slice(0, 7), -1);
  const monthHours = m => (d.trainings || []).filter(x => x && String(x.date).slice(0, 7) === m).reduce((s, x) => s + (+x.hours || 0) * people(x), 0);
  const hm = monthHours(lastClosed), hp = monthHours(prevMonth(lastClosed));
  const hD = pctChange(hm, hp);
  const next12 = monthsIn(today.slice(0, 7), addMonths(today.slice(0, 7), 11));
  const dueCols = next12.map(m => {
    const xs = exp.filter(x => x.due && x.due.slice(0, 7) === m);
    return { label: monthLabel(m), parts: [{ key: 'p', value: xs.reduce((s, x) => s + x.participants, 0) }] };
  });
  const overdue = exp.filter(x => x.status === 'scaduta').reduce((s, x) => s + x.participants, 0);
  const rows = useMemo(() => [...(d.trainings || [])].sort((a, b) => (a.date < b.date ? 1 : -1)), [d.trainings]);
  const topics = topicsFor(d);
  const drawer = open ? <TrainingDrawer d={d} rec={open === 'new' ? null : open} today={today} onClose={() => setOpen(null)} /> : null;
  const per = x => (x?.value != null ? nf(x.value, 1) : '—');
  return (
    <>
      <div className="kpis">
        <Kpi label="Ore di formazione per dipendente" value={numTxt(t?.perEmployee)} unit="h" foot={t ? `${nf(t.total)} ore-persona · ${P.short}` : 'nessuna sessione'} target={S?.trainingTarget ? `${nf(S.trainingTarget)} h` : undefined}
          cmp={t?.perEmployee != null && tp?.perEmployee != null ? { value: tp.perEmployee, cur: t.perEmployee, kind: 'flow', good: 'up', decimals: 1, label: 'anno prima' } : undefined} />
        <Kpi label="Donne" value={per(t?.perF)} unit={t?.perF?.value != null ? 'h a testa' : ''} foot={t?.perF?.suppressed ? `non mostrato: ${t.perF.note}` : t ? `${nf(t.hoursF)} ore-persona` : ''} />
        <Kpi label="Uomini" value={per(t?.perM)} unit={t?.perM?.value != null ? 'h a testa' : ''} foot={t?.perM?.suppressed ? `non mostrato: ${t.perM.note}` : t ? `${nf(t.hoursM)} ore-persona` : ''} />
        <Kpi label="Quota obbligatoria" value={pctTxt(t?.mandatoryShare, 0)} foot="sicurezza e corsi richiesti dalla legge" />
        <Kpi label={`Ore-persona a ${monthLabel(lastClosed, false)}`} value={nf(hm)} unit="h" delta={hD} deltaGood={hD == null ? null : hD >= 0} foot={hD != null ? vsMonth(prevMonth(lastClosed)) : hp === 0 && hm > 0 ? 'nessuna ora il mese prima' : ''} />
        <Kpi label="Corsi da rinnovare" value={nf(soon.length)} foot={soon.length ? `entro 60 giorni o scaduti · ${soon.reduce((s, x) => s + x.participants, 0)} persone` : 'nessuno entro 60 giorni'} />
      </div>
      <Panel title="Scadenze della formazione obbligatoria" sub="Ultima sessione di ogni serie di corsi; validità dal corso o, se manca, dal pacchetto «persone»" flush>
        <Table rows={exp} rowKey={x => x.key} pageSize={12} exportName="scadenze-formazione" initialSort={{ key: 'due', dir: 'asc' }} cols={[
          { key: 'course', label: 'Corso', render: x => <span className="epe-wrap"><span className="epe-strong">{x.course}</span><span className="sub">{x.label}{x.law ? ` · ${x.law}` : ''}</span></span> },
          { key: 'date', label: 'Ultima sessione', render: x => dt(x.date) },
          { key: 'participants', label: 'Persone', align: 'r' },
          { key: 'due', label: 'Scadenza', render: x => (x.due ? <span className={x.status === 'scaduta' ? 'epe-late' : ''}>{dt(x.due)} · {dayTxt(x.days)}</span> : '—') },
          { key: 'status', label: 'Stato', render: x => <Chip kind={EXP_CHIP[x.status] || 'outline'}>{x.status}</Chip> },
          { key: 'valid', label: 'Validità', nosort: true, csv: x => (x.validMonths ? `${x.validMonths} mesi (${x.validSrc})` : ''), render: x => (x.validMonths ? <span className="epe-src small">{x.validMonths} mesi{x.validSrc === 'pacchetto' ? <> dal pacchetto <StatusChip status={x.ruleStatus} /></> : ' dal corso'}</span> : '—') },
        ]} empty="Nessun corso obbligatorio nel registro" />
      </Panel>
      <div className="grid g2">
        <Panel title="Persone da riaggiornare nei prossimi 12 mesi" sub={overdue ? `Più ${overdue} persone con corsi già scaduti` : 'Partecipanti delle sessioni in scadenza, per mese'}>
          {dueCols.some(c => c.parts[0].value > 0) ? <Columns cols={dueCols} keys={[{ key: 'p', label: 'Persone', color: 'var(--s4)' }]} height={190} unit="persone" ariaLabel="Persone da riaggiornare per mese" /> : <Empty title="Nessuna scadenza nei prossimi 12 mesi" />}
        </Panel>
        <Panel title="Ore-persona per tema" sub={P.label}>
          {t?.byTopic?.length ? <Bars data={t.byTopic.map(x => ({ key: x.topic, label: x.label, value: x.hours }))} unit="h" ariaLabel="Ore-persona per tema" /> : <Empty title="Nessuna sessione nel periodo" />}
          {t ? <Legend items={[{ label: `donne ${nf(t.hoursF)} h`, color: 'var(--s5)' }, { label: `uomini ${nf(t.hoursM)} h`, color: 'var(--s1)' }]} /> : null}
        </Panel>
      </div>
      <Panel title="Registro della formazione" sub="Sessioni con partecipanti per genere, senza nomi" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setOpen('new')}>Nuova sessione</Btn>}>
        <Table rows={rows} onRow={x => setOpen(x)} exportName="registro-formazione" initialSort={{ key: 'date', dir: 'desc' }} pageSize={15} cols={[
          { key: 'date', label: 'Data', render: x => dt(x.date) },
          { key: 'course', label: 'Corso', render: x => <span className="epe-wrap">{x.course}</span> },
          { key: 'topic', label: 'Tema', render: x => topicLabel(x.topic), csv: x => x.topic },
          { key: 'hours', label: 'Ore', align: 'r', render: x => nf(x.hours, 1) },
          { key: 'partF', label: 'Donne', align: 'r' }, { key: 'partM', label: 'Uomini', align: 'r' },
          { key: 'mandatory', label: 'Obbligatorio', render: x => (x.mandatory ? 'sì' : 'no') },
          { key: 'due', label: 'Scadenza', value: x => (x.mandatory ? sessionDue(d, x) : null), render: x => (x.mandatory ? dt(sessionDue(d, x)) : '—') },
        ]} empty="Nessuna sessione registrata" />
        <p className="small muted epe-pad">Temi per il settore di questo archivio: {topics.map(x => x.label.toLowerCase()).join(', ')}.</p>
      </Panel>
      {drawer}
    </>
  );
}

/** Cassetto di una sessione di formazione. */
function TrainingDrawer({ d, rec, today, onClose }) {
  const validate = o => ((+o.partF || 0) + (+o.partM || 0) <= 0 ? 'Indicare almeno un partecipante' : o.nextDue && o.nextDue < o.date ? 'Il prossimo aggiornamento non può precedere la sessione' : null);
  return (
    <RecordDrawer d={d} coll="trainings" rec={rec} onClose={onClose} validate={validate} labelOf={o => o.course || 'sessione'}
      defaults={{ date: today, course: '', topic: 'sicurezza', hours: 4, partF: 0, partM: 0, mandatory: false, validMonths: null, nextDue: null, series: null, provider: '', note: '' }}
      title={rec ? rec.course : 'Nuova sessione di formazione'}>
      <p className="note small epe-note">Per i corsi obbligatori la scadenza si calcola dalla validità (mesi) o dalla data del prossimo aggiornamento; senza nessuna delle due vale la periodicità di base del tema nel pacchetto, da confermare con l’RSPP. Le sessioni della stessa serie si sostituiscono: conta l’ultima.</p>
      {rec?.mandatory && <p className="small">Scadenza calcolata: {dateIt(sessionDue(d, rec)) || '—'} ({dayTxt(sessionDue(d, rec) ? daysBetween(today, sessionDue(d, rec)) : null)}).</p>}
    </RecordDrawer>
  );
}

