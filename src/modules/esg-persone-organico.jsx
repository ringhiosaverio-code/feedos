/* FeedOS 18 · ESG › Persone e sicurezza › Organico: fotografie dell'organico per genere, categoria e contratto (griglia di modifica),
 * ETP, tempo determinato, somministrati e autonomi, entrate e uscite, turnover, contratto collettivo e minimi (VS B8, B10, C5).
 * Solo conteggi: nessun nome. Prefisso CSS epe-. Scritture con store.batch (una fotografia = un passo annullabile). */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuPencil, LuTrash2, LuCopy } from 'react-icons/lu';
import { nf, dateIt, addMonths, endOfMonth } from '../core/util.js';
import { snapshots, snapshotStats } from '../engine/esg-persone.js';
import { CATEGORIES, CATEGORY_LABEL, CONTRACTS, CONTRACT_LABEL, GENDER_LABEL } from '../data/pack-persone.js';
import { Panel, Kpi, Table, Btn, Empty, Kv, Select, NumInput } from '../ui/ui.jsx';
import { Columns, StackBar, Legend } from '../ui/charts.jsx';
import { Lineage } from './esg-shared.jsx';
import { pctTxt, numTxt, RecordDrawer, downloadCsv } from './esg-persone-ui.jsx';

const KEYS = [{ key: 'F', label: 'Donne', color: 'var(--s5)' }, { key: 'M', label: 'Uomini', color: 'var(--s1)' }, { key: 'nd', label: 'Non indicato', color: 'var(--s7)' }];
const CONTRACT_COLOR = { indeterminato: 'var(--s1)', apprendistato: 'var(--s3)', determinato: 'var(--s4)' };
const SURVEY_ROWS = [['Dirigenti', 'dirigenti'], ['Quadri', 'quadri'], ['Impiegati', 'impiegati'], ['Operai', 'operai']];

export function Organico({ d, P, S, today, arg }) {
  const all = snapshots(d);
  const last = all[all.length - 1] || null;
  const [sel, setSel] = useState(S?.wf?.snapshotId || last?.id || '');
  const [edit, setEdit] = useState(arg === 'nuova' ? 'new' : null);
  const snap = all.find(s => s.id === sel) || (S?.wf ? all.find(s => s.id === S.wf.snapshotId) : null) || last;
  const st = useMemo(() => (snap ? snapshotStats(snap) : null), [snap]);
  const isPeriod = S?.wf && snap && S.wf.snapshotId === snap.id;
  const w = isPeriod ? S.wf : null;
  const sv = d.survey?.['pe-cat'];
  const newDefaults = () => {
    const date = endOfMonth(addMonths(today.slice(0, 7), -1));
    const base = last ? { ...last } : {};
    delete base.id;
    return { ...base, date: all.some(s => s.date === date) ? today : date, rows: (last?.rows || []).map(r => ({ ...r })), hiresF: 0, hiresM: 0, leaversF: 0, leaversM: 0, parentalF: 0, parentalM: 0, note: '', country: base.country || 'IT' };
  };
  const actions = (
    <>
      {all.length > 1 && <Select className="slim auto" value={snap?.id || ''} onChange={setSel} options={[...all].reverse().map(s => ({ id: s.id, label: `al ${dateIt(s.date)}` }))} ariaLabel="Fotografia dell’organico" />}
      {snap && <Btn small kind="ghost" icon={LuPencil} onClick={() => setEdit(snap)}>Modifica</Btn>}
      <Btn small kind="primary" icon={snap ? LuCopy : LuPlus} onClick={() => setEdit('new')}>{snap ? 'Nuova fotografia' : 'Inserisci l’organico'}</Btn>
    </>
  );
  const drawer = edit ? <SnapshotDrawer d={d} rec={edit === 'new' ? null : edit} defaults={edit === 'new' ? newDefaults() : {}} onClose={() => setEdit(null)} /> : null;
  if (!snap) return (
    <>
      <Panel title="Organico" sub="Nessuna fotografia" actions={actions}>
        <Empty title="Nessuna fotografia dell’organico">Indica a fine periodo quante persone ci sono per genere, categoria e contratto, con gli ETP: bastano i conteggi del libro unico del lavoro.</Empty>
      </Panel>
      {drawer}
    </>
  );
  const cols = CATEGORIES.map(c => ({ label: CATEGORY_LABEL[c], parts: KEYS.map(k => ({ key: k.key, value: st.byCategory[c][k.key] })) }));
  const keys = KEYS.filter(k => k.key !== 'nd' || st.byGender.nd > 0);
  const parts = CONTRACTS.map(c => ({ key: c, label: CONTRACT_LABEL[c], value: st.byContract[c], color: CONTRACT_COLOR[c] })).filter(p => p.value > 0);
  const matrix = CATEGORIES.map(c => ({ id: c, cat: CATEGORY_LABEL[c], ...st.byCategory[c], temp: snap.rows.filter(r => r.category === c && r.contract === 'determinato').reduce((s, r) => s + (+r.headcount || 0), 0) })).filter(x => x.total > 0);
  const surveyDiff = sv ? SURVEY_ROWS.filter(([k, c]) => sv[k] != null && +sv[k] !== st.byCategory[c].total) : [];
  return (
    <>
      <Panel title={`Organico al ${dateIt(snap.date)}`} sub={isPeriod ? `Fotografia dell’esercizio ${P.label}` : 'Fotografia fuori dall’esercizio scelto'} actions={actions}>
        <div className="kpis">
          <Kpi label="Dipendenti" value={nf(st.headcount)} foot={`${nf(st.fte, 1)} ETP · ${st.partTime} a tempo parziale`} />
          <Kpi label="Donne" value={pctTxt(st.womenShare, 0)} foot={`${st.byGender.F} donne e ${st.byGender.M} uomini`} />
          <Kpi label="Tempo determinato" value={nf(st.temporary)} foot={`${st.byContract.apprendistato} in apprendistato (indeterminato)`} />
          <Kpi label="Somministrati e autonomi" value={`${numTxt(snap.agency, 0)} e ${numTxt(snap.selfEmployed, 0)}`} foot="non dipendenti (VS C5)" />
          <Kpi label="Turnover" value={w ? pctTxt(w.turnover) : '—'} foot={w ? `${w.leavers.total} uscite su un organico medio di ${nf(w.avgHeadcount, 1)}` : 'solo per la fotografia dell’esercizio'} />
          <Kpi label="Donne tra dirigenti e quadri" value={pctTxt(st.mgmt.womenShare, 0)} foot={`${st.mgmt.F} su ${st.mgmt.total} · rapporto ${st.mgmt.ratio == null ? '—' : nf(st.mgmt.ratio, 2)}`} />
        </div>
      </Panel>
      <div className="grid g2">
        <Panel title="Persone per categoria e genere">
          <Columns cols={cols} keys={keys} height={200} unit="persone" ariaLabel="Persone per categoria e genere" />
          <Legend items={keys.map(k => ({ label: `${k.label} ${st.byGender[k.key]}`, color: k.color }))} />
        </Panel>
        <Panel title="Persone per tipo di contratto" sub="L’apprendistato è un contratto a tempo indeterminato (VS B8)">
          <StackBar parts={parts} ariaLabel="Persone per contratto" />
          <Legend items={parts.map(p => ({ label: `${p.label} ${p.value}`, color: p.color }))} />
          <div className="epe-mt">
            <Kv items={[
              ['Contratto collettivo', snap.ccnl || '—'], ['Coperti da contratti collettivi', snap.ccnlCoveragePct != null ? `${nf(snap.ccnlCoveragePct)}%` : '—'],
              ['Retribuzioni pari o superiori ai minimi', snap.minWageOk == null ? '—' : snap.minWageOk ? 'sì' : 'no'], ['Paese del contratto', snap.country || 'IT'],
            ]} />
          </div>
        </Panel>
      </div>
      <Panel title="Categoria e genere" sub="Conteggi alla data della fotografia" flush
        actions={<Btn small kind="ghost" onClick={() => downloadCsv(`organico-${snap.date}`, snap.rows, [{ key: 'category', label: 'Categoria' }, { value: r => GENDER_LABEL[r.gender] || r.gender, label: 'Genere' }, { key: 'contract', label: 'Contratto' }, { value: r => (r.fullTime === false ? 'parziale' : 'pieno'), label: 'Tempo' }, { key: 'headcount', label: 'Persone' }, { key: 'fte', label: 'ETP' }])}>CSV</Btn>}>
        <Table rows={matrix} rowKey={x => x.id} pageSize={10} cols={[
          { key: 'cat', label: 'Categoria' }, { key: 'F', label: 'Donne', align: 'r' }, { key: 'M', label: 'Uomini', align: 'r' }, { key: 'total', label: 'Totale', align: 'r' },
          { key: 'fte', label: 'ETP', align: 'r', render: x => nf(x.fte, 1) }, { key: 'temp', label: 'A termine', align: 'r' },
        ]} />
      </Panel>
      <div className="grid g2">
        <Panel title="Movimenti del periodo" sub="Entrate e uscite nei 12 mesi fino alla data della fotografia">
          <Kv items={[
            ['Entrate', `${nf((+snap.hiresF || 0) + (+snap.hiresM || 0))} (donne ${nf(+snap.hiresF || 0)}, uomini ${nf(+snap.hiresM || 0)})`],
            ['Uscite', `${nf((+snap.leaversF || 0) + (+snap.leaversM || 0))} (donne ${nf(+snap.leaversF || 0)}, uomini ${nf(+snap.leaversM || 0)}); escluse le scadenze dei contratti a termine`],
            ['Congedi parentali usati', `donne ${nf(+snap.parentalF || 0)}, uomini ${nf(+snap.parentalM || 0)}`],
          ]} />
          {w && <div className="epe-mt"><Lineage item={{ formula: 'uscite ÷ organico medio del periodo', method: w.avgSrc, records: w.leavers.total, quality: 'calcolato' }} label="Come si calcola il turnover" /></div>}
        </Panel>
        <Panel title="Confronto con il questionario ESG" sub="Dipendenti per categoria dichiarati nel questionario">
          {sv ? (surveyDiff.length
            ? <p className="note warn small">Il questionario indica {surveyDiff.map(([k, c]) => `${k.toLowerCase()} ${sv[k]} (qui ${st.byCategory[c].total})`).join(', ')}: aggiornare il questionario o la fotografia.</p>
            : <p className="small">Il questionario dichiara gli stessi numeri per categoria ({SURVEY_ROWS.map(([k]) => `${k.toLowerCase()} ${sv[k] ?? '—'}`).join(', ')}).</p>)
            : <p className="small muted">Il questionario ESG non ha i dipendenti per categoria.</p>}
          <p className="small muted">{snap.note || ''}</p>
        </Panel>
      </div>
      {drawer}
    </>
  );
}

const EMPTY_ROW = { category: 'operai', gender: 'M', contract: 'indeterminato', fullTime: true, headcount: 1, fte: 1 };
/** Cassetto della fotografia: campi di testata (data, contratto collettivo, movimenti) e griglia delle righe. */
function SnapshotDrawer({ d, rec, defaults, onClose }) {
  const [rows, setRows] = useState(() => (rec?.rows || defaults.rows || []).map(r => ({ ...r })));
  const set = (i, k, v) => setRows(rs => rs.map((r, j) => {
    if (j !== i) return r;
    const x = { ...r, [k]: v };
    if (k === 'headcount' && r.fullTime !== false) x.fte = v;
    if (k === 'fullTime' && v) x.fte = x.headcount;
    return x;
  }));
  const tot = rows.reduce((s, r) => s + (+r.headcount || 0), 0), fte = rows.reduce((s, r) => s + (+r.fte || 0), 0);
  const clean = rows.filter(r => (+r.headcount || 0) > 0).map(r => ({ gender: r.gender, category: r.category, contract: r.contract, fullTime: r.fullTime !== false, headcount: +r.headcount, fte: r.fte == null ? +r.headcount : +r.fte }));
  const validate = o => {
    if (!clean.length) return 'Inserire almeno una riga con delle persone';
    if (clean.some(r => r.fte > r.headcount + 1e-9)) return 'Gli ETP di una riga non possono superare le persone';
    if (!rec && (d.hrSnapshots || []).some(s => s.date === o.date)) return `Esiste già una fotografia al ${dateIt(o.date)}`;
    return null;
  };
  return (
    <RecordDrawer d={d} coll="hrSnapshots" rec={rec} defaults={{ ...defaults, rows: undefined }} extra={{ rows: clean }} onClose={onClose} validate={validate} idOf={o => `hr-${o.date}`}
      title={rec ? `Organico al ${dateIt(rec.date)}` : 'Nuova fotografia dell’organico'} labelOf={o => `organico al ${dateIt(o.date)}`}>
      <div className="epe-grid-ed">
        <p className="small muted">Una riga per ogni combinazione di categoria, genere, contratto e orario. Solo conteggi, nessun nome.</p>
        <div className="tw">
          <table className="t epe-gridt">
            <thead><tr><th>Categoria</th><th>Genere</th><th>Contratto</th><th>Orario</th><th className="r">Persone</th><th className="r">ETP</th><th aria-label="Togli" /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><Select className="slim" value={r.category} onChange={v => set(i, 'category', v)} options={CATEGORIES.map(c => ({ id: c, label: CATEGORY_LABEL[c] }))} ariaLabel="Categoria" /></td>
                  <td><Select className="slim" value={r.gender} onChange={v => set(i, 'gender', v)} options={Object.entries(GENDER_LABEL).map(([id, label]) => ({ id, label }))} ariaLabel="Genere" /></td>
                  <td><Select className="slim" value={r.contract} onChange={v => set(i, 'contract', v)} options={CONTRACTS.map(c => ({ id: c, label: CONTRACT_LABEL[c] }))} ariaLabel="Contratto" /></td>
                  <td><Select className="slim" value={r.fullTime === false ? 'p' : 'f'} onChange={v => set(i, 'fullTime', v === 'f')} options={[{ id: 'f', label: 'Tempo pieno' }, { id: 'p', label: 'Tempo parziale' }]} ariaLabel="Orario" /></td>
                  <td className="r"><NumInput slim value={r.headcount} decimals={0} min={0} onChange={v => set(i, 'headcount', v ?? 0)} ariaLabel="Persone" /></td>
                  <td className="r"><NumInput slim value={r.fte} decimals={2} min={0} onChange={v => set(i, 'fte', v)} ariaLabel="ETP" /></td>
                  <td><Btn small kind="ghost" icon={LuTrash2} title="Togli la riga" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Totale</td><td className="r">{nf(tot)}</td><td className="r">{nf(fte, 2)}</td><td /></tr></tfoot>
          </table>
        </div>
        <div className="row"><Btn small icon={LuPlus} onClick={() => setRows(rs => [...rs, { ...EMPTY_ROW }])}>Aggiungi riga</Btn></div>
      </div>
    </RecordDrawer>
  );
}
