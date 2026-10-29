/* FeedOS 18 · ESG › Persone e sicurezza › Parità e retribuzioni, INAIL OT23.
 * Parità: divario retributivo di genere su righe pseudonime (media, mediana, variabile, quartili, per categoria) con soppressione dei
 * gruppi sotto 5 persone, obblighi della trasparenza retributiva (D.Lgs. 96/2026) per fascia, rapporto biennale M/F (tabelle di
 * appoggio in CSV), autovalutazione UNI/PdR 125 (solo nomi delle aree e pesi). OT23: interventi di prevenzione con punti e
 * evidenze, soglia e riduzione dal pacchetto (da verificare sul modello INAIL dell'anno). Prefisso CSS epe-. Scritture con store.batch. */
import React, { useMemo, useState } from 'react';
import { LuDownload, LuSave, LuPlus, LuTrash2, LuArrowRight, LuPencil, LuCheck } from 'react-icons/lu';
import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { nf, dateIt, daysBetween } from '../core/util.js';
import { pdr125Score, ot23Total, ot23Reduction, packItem } from '../engine/esg-persone.js';
import { biennialRows, BIENNIAL_COLS } from '../engine/esg-persone-text.js';
import { CATEGORY_LABEL } from '../data/pack-persone.js';
import { Panel, Kpi, Table, Btn, Empty, Chip, NumInput, Field } from '../ui/ui.jsx';
import { Columns, Legend } from '../ui/charts.jsx';
import { StatusChip, EvidenceCount } from './esg-shared.jsx';
import { pctTxt, dt, dayTxt, RecordDrawer, undoToast, downloadCsv, PackSource, PrivacyNote } from './esg-persone-ui.jsx';

const eur = v => (v == null || !Number.isFinite(+v) ? 'non mostrato' : `${nf(v)} €`);

export function Parita({ d, P, S, today }) {
  const pg = S?.pay, sc = S?.settings?.smallCell ?? 5;
  const thr = S?.settings?.gapThresholdPct ?? 5;
  const du = S?.duties, bi = S?.biennial;
  const q = pg?.quartiles || [];
  const qCols = q.map(x => ({ label: `${x.q}° quartile`, parts: x.suppressed ? [] : [{ key: 'F', value: Math.round(x.shareF * 100) }, { key: 'M', value: 100 - Math.round(x.shareF * 100) }] }));
  const signsDiffer = pg && !pg.overall.suppressed && pg.overall.meanGap != null && pg.overall.medianGap != null && Math.sign(pg.overall.meanGap) !== Math.sign(pg.overall.medianGap);
  return (
    <>
      <PrivacyNote smallCell={sc} />
      {pg ? (
        <>
          <div className="kpis">
            <Kpi label="Divario retributivo medio" value={pg.overall.suppressed ? 'non mostrato' : pctTxt(pg.overall.meanGap)} foot={pg.overall.suppressed ? pg.overall.note : `${pg.nF} donne e ${pg.nM} uomini · retribuzione al tempo pieno`} />
            <Kpi label="Divario retributivo mediano" value={pg.overall.suppressed ? 'non mostrato' : pctTxt(pg.overall.medianGap)} foot="(mediana uomini − mediana donne) ÷ mediana uomini" />
            <Kpi label="Divario delle componenti variabili" value={pg.variable.suppressed ? 'non mostrato' : pctTxt(pg.variable.gap)} foot={pg.variable.suppressed ? pg.variable.note : `ricevono una parte variabile: donne ${pctTxt(pg.variable.shareF, 0)}, uomini ${pctTxt(pg.variable.shareM, 0)}`} />
            <Kpi label="Donne nel quartile più alto" value={q[3]?.suppressed ? 'non mostrato' : pctTxt(q[3]?.shareF, 0)} foot={`donne sul totale ${pctTxt(pg.nF / (pg.nF + pg.nM), 0)}`} />
            <Kpi label={`Categorie oltre il ${nf(thr)}%`} value={nf(pg.flagged.length)} foot={pg.byCategory.some(c => !c.suppressed) ? `su ${pg.byCategory.filter(c => !c.suppressed).length} confrontabili` : `nessuna categoria con almeno ${sc} donne e ${sc} uomini`} />
          </div>
          {signsDiffer && <p className="note small epe-note">Media e mediana vanno in direzioni diverse: dipende dalla composizione (per esempio più donne tra gli impiegati e più uomini tra gli operai e i dirigenti). Il confronto che conta per la valutazione congiunta è dentro la stessa categoria.</p>}
          <Panel title="Divario per categoria" sub={`Retribuzione annua lorda riportata al tempo pieno · ${pg.periodKey === P.key ? P.label : `esercizio ${pg.periodKey}`}`} flush>
            <Table rows={pg.byCategory} rowKey={x => x.category} pageSize={10} cols={[
              { key: 'category', label: 'Categoria', render: x => CATEGORY_LABEL[x.category] || x.category },
              { key: 'n', label: 'Donne e uomini', nosort: true, render: x => `${x.nF} e ${x.nM}` },
              { key: 'meanF', label: 'Media donne', align: 'r', render: x => (x.suppressed ? <span className="muted">—</span> : eur(x.meanF)) },
              { key: 'meanM', label: 'Media uomini', align: 'r', render: x => (x.suppressed ? <span className="muted">—</span> : eur(x.meanM)) },
              { key: 'meanGap', label: 'Divario medio', align: 'r', render: x => (x.suppressed ? <span className="muted small">{x.note}</span> : <span className={Math.abs(x.meanGap) >= thr / 100 ? 'epe-late' : ''}>{pctTxt(x.meanGap)}</span>) },
              { key: 'medianGap', label: 'Divario mediano', align: 'r', render: x => (x.suppressed ? '—' : pctTxt(x.medianGap)) },
            ]} />
          </Panel>
          {pg.flag5 && <p className="note warn small">Divario medio di almeno il {nf(thr)}% nella categoria {pg.flagged.map(c => (CATEGORY_LABEL[c] || c).toLowerCase()).join(', ')}. {du?.report ? 'Per chi presenta la relazione, se non è giustificato da criteri oggettivi e non è corretto entro sei mesi serve la valutazione congiunta con le rappresentanze.' : 'Sotto i 100 dipendenti la relazione non è obbligatoria: conviene comunque documentare i criteri (livello, anzianità, mansione) che spiegano la differenza.'}</p>}
        </>
      ) : (
        <Panel title="Divario retributivo di genere" sub="Nessuna retribuzione per l’esercizio">
          <Empty title="Retribuzioni non inserite">Importare un file con codice pseudonimo, genere, categoria, livello, ETP, fisso e variabile annui (Dati › Importa › Retribuzioni pseudonime). Sotto i 150 dipendenti il dato è facoltativo nel VS.</Empty>
          <div className="row epe-pad"><Btn icon={LuArrowRight} onClick={() => go('dati', 'importa')}>Vai a Importa</Btn></div>
        </Panel>
      )}
      <div className="grid g2 epe-top">
        {pg ? (
          <Panel title="Donne e uomini per quartile di retribuzione" sub="Quattro fasce con lo stesso numero di persone, dalla più bassa alla più alta">
            {qCols.some(c => c.parts.length) ? <><Columns cols={qCols} keys={[{ key: 'F', label: 'Donne', color: 'var(--s5)' }, { key: 'M', label: 'Uomini', color: 'var(--s1)' }]} height={190} unit="%" ariaLabel="Quota di donne e uomini per quartile" />
              <Legend items={[{ label: 'Donne', color: 'var(--s5)' }, { label: 'Uomini', color: 'var(--s1)' }]} /></> : <Empty title={`Quartili non mostrati: meno di ${sc} persone per fascia`} />}
          </Panel>
        ) : null}
        <Panel title="Rapporto biennale sul personale maschile e femminile" sub="Art. 46 D.Lgs. 198/2006"
          actions={<Btn small kind="ghost" icon={LuDownload} disabled={!S?.wf} onClick={() => downloadCsv(`rapporto-biennale-${P.key}`, biennialRows(S), BIENNIAL_COLS)}>Tabelle CSV</Btn>}>
          <p className="small">{bi?.applies ? `Dovuto: oltre 50 dipendenti. Biennio ${bi.biennium}, da trasmettere entro il ${dateIt(bi.due)} sul portale del Ministero.` : 'Non dovuto fino a 50 dipendenti; le tabelle restano utili per i questionari dei clienti.'}</p>
          <p className="small muted">Il file riporta organico per categoria e genere, contratti, entrate e uscite, congedi, formazione e retribuzioni medie per categoria solo per gruppi con almeno {sc} persone.</p>
          <PackSource item={bi?.item} validAsOf={S?.pack?.validAsOf} />
          {bi?.item?.note && <p className="small muted">{bi.item.note}</p>}
        </Panel>
      </div>
      <Panel title="Trasparenza retributiva" sub={`D.Lgs. 96/2026 · dipendenti medi ${du?.headcount != null ? nf(du.headcount, 1) : 'n.d.'}`}>
        <ul className="epe-bands">
          {(du?.bands || []).map(b => (
            <li key={b.id} className={du?.band?.id === b.id ? 'epe-band-on' : ''}>
              <span className="epe-strong">{b.label}</span>
              <span>{b.firstReport ? `prima relazione entro il ${dateIt(b.firstReport)}, ${b.every}` : 'nessuna relazione sul divario'}</span>
              <span className="epe-src small">{du?.band?.id === b.id ? <Chip kind="accent">questa impresa</Chip> : null}<StatusChip status={b.status} /></span>
            </li>
          ))}
        </ul>
        {du?.band?.note && <p className="small">{du.band.note}</p>}
        {du?.joint && <p className="small muted">{du.joint.note}</p>}
        <PackSource item={du?.band || du?.joint} validAsOf={S?.pack?.validAsOf} />
      </Panel>
      <PdrPanel d={d} S={S} today={today} />
    </>
  );
}

/** Autovalutazione UNI/PdR 125: punteggio per area (0-100) × peso, soglia del 60%, stato della certificazione. */
function PdrPanel({ d, S, today }) {
  const item = packItem(d, 'pdr125');
  const year = +today.slice(0, 4);
  const rows = (d.pdr125 || []).filter(r => r && Number.isFinite(+r.year)).sort((a, b) => b.year - a.year);
  const row = rows.find(r => +r.year === year) || null, last = rows[0] || null;
  const [draft, setDraft] = useState(null);
  const [cert, setCert] = useState(false);
  const scores = draft || row?.scores || last?.scores || {};
  const sc = useMemo(() => pdr125Score(scores, item || undefined), [scores, item]);
  const save = () => {
    const op = row ? { kind: 'update', coll: 'pdr125', id: row.id, patch: { scores: { ...scores } } }
      : { kind: 'add', coll: 'pdr125', obj: { id: `pdr-${year}`, year, scores: { ...scores }, certified: last?.certified ?? false, certBody: last?.certBody || '', certExpiry: last?.certExpiry || null, note: '' } };
    store.batch([op], `UNI/PdR 125: autovalutazione ${year} salvata`);
    setDraft(null);
    undoToast('Autovalutazione salvata');
  };
  const base = row || last;
  return (
    <Panel title="Autovalutazione UNI/PdR 125" sub={`Certificazione della parità di genere · ${year} · soglia ${sc.threshold}%`}
      actions={<>
        <Btn small kind="ghost" icon={LuPencil} onClick={() => setCert(true)}>Certificazione</Btn>
        <Btn small kind="primary" icon={LuSave} onClick={save} disabled={!draft}>Salva</Btn>
      </>}>
      <div className="epe-pdr">
        <div className="tw">
          <table className="t">
            <thead><tr><th>Area</th><th className="r">Peso</th><th className="r">Punteggio 0-100</th><th className="r">Punti</th></tr></thead>
            <tbody>
              {sc.areas.map(a => (
                <tr key={a.id}>
                  <td><span className="epe-wrap">{a.label}</span></td>
                  <td className="r">{a.weight}%</td>
                  <td className="r"><NumInput slim value={a.score} decimals={0} min={0} max={100} onChange={v => setDraft({ ...scores, [a.id]: v })} ariaLabel={`Punteggio ${a.label}`} /></td>
                  <td className="r">{a.points == null ? '—' : nf(a.points, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Totale</td><td className="r">100%</td><td /><td className="r"><span className="epe-strong">{sc.total == null ? '—' : `${nf(sc.total, 1)}%`}</span></td></tr></tfoot>
          </table>
        </div>
        <div className="stack epe-pdr-side">
          <div className="epe-fig">
            <span className="epe-fig-l">Punteggio complessivo</span>
            <span className="epe-fig-v">{sc.total == null ? '—' : `${nf(sc.total, 1)}%`}</span>
            <span className="epe-fig-s">{!sc.complete ? 'mancano dei punteggi' : sc.pass ? `sopra la soglia del ${sc.threshold}%` : `servono ${nf(sc.threshold - sc.total, 1)} punti per la soglia del ${sc.threshold}%`}{sc.weakest ? ` · area più debole: ${sc.weakest.label.toLowerCase()}` : ''}</span>
          </div>
          <p className="small">{base?.certified ? `Certificata${base.certBody ? ` da ${base.certBody}` : ''}, valida fino al ${dt(base.certExpiry)}${base.certExpiry ? ` (${dayTxt(daysBetween(today, base.certExpiry))})` : ''}.` : 'Non certificata.'}</p>
          {item?.benefits && <p className="small muted">{item.benefits}</p>}
          <p className="small muted">{item?.note}</p>
          <PackSource item={item} validAsOf={S?.pack?.validAsOf} />
        </div>
      </div>
      {cert && <RecordDrawer d={d} coll="pdr125" rec={row} onClose={() => setCert(false)} canDelete={false} idOf={o => `pdr-${o.year}`} labelOf={o => `UNI/PdR 125 ${o.year}`}
        defaults={{ year, scores: { ...scores }, certified: last?.certified ?? false, certBody: last?.certBody || '', certExpiry: last?.certExpiry || null, note: '' }} title={`UNI/PdR 125 · ${year}`} />}
    </Panel>
  );
}

/* ================= INAIL OT23 ================= */
export function Ot23({ d, P, S, today }) {
  const item = packItem(d, 'ot23');
  const years = useMemo(() => [...(d.ot23 || [])].filter(r => r && Number.isFinite(+r.year)).sort((a, b) => b.year - a.year), [d.ot23]);
  const y = S?.ot23?.year ?? +today.slice(0, 4);
  const row = years.find(r => +r.year === y) || null;
  const tot = ot23Total(row, item || undefined);
  const due = `${y + 1}-${item?.due || '02-28'}`;
  const red = ot23Reduction(d, S?.wf?.fte ?? null);
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(null);
  const [sub, setSub] = useState(today);
  const write = (measures, label, extra = {}) => {
    const op = row ? { kind: 'update', coll: 'ot23', id: row.id, patch: { measures, ...extra } } : { kind: 'add', coll: 'ot23', obj: { id: `ot23-${y}`, year: y, measures, submittedAt: null, outcome: 'in preparazione', note: '', ...extra } };
    store.batch([op], label);
    undoToast('Salvato');
  };
  const ms = row?.measures || [];
  const add = () => {
    if (!title.trim()) return;
    const code = `M-${ms.length + 1}`;
    write([...ms, { code, title: title.trim(), points: points ?? 0, done: false, date: today, evidenceIds: [] }], `OT23 ${y}: aggiunto l’intervento «${title.trim()}»`);
    setTitle(''); setPoints(null);
  };
  const toggle = i => write(ms.map((m, j) => (j === i ? { ...m, done: !(m.done !== false) } : m)), `OT23 ${y}: intervento «${ms[i].title}» ${ms[i].done !== false ? 'da fare' : 'fatto'}`);
  const remove = i => write(ms.filter((_, j) => j !== i), `OT23 ${y}: tolto l’intervento «${ms[i].title}»`);
  const submit = () => write(ms, `OT23 ${y}: domanda presentata il ${dateIt(sub)}`, { submittedAt: sub, outcome: 'presentata' });
  return (
    <>
      <div className="kpis">
        <Kpi label={`Punti degli interventi fatti nel ${y}`} value={nf(tot.points)} foot={`soglia ${nf(tot.threshold)} punti (da verificare)`} />
        <Kpi label="Punti previsti" value={nf(tot.planned)} foot={tot.planned >= tot.threshold ? 'con tutti gli interventi la soglia è raggiunta' : `mancano ${nf(tot.threshold - tot.planned)} punti anche con tutti gli interventi`} />
        <Kpi label="Domanda entro" value={dateIt(due)} foot={row?.submittedAt ? `presentata il ${dateIt(row.submittedAt)}` : dayTxt(daysBetween(today, due))} />
        <Kpi label="Riduzione del tasso" value={red ? `${red.pct}%` : '—'} foot={red ? `circa ${nf(S?.wf?.fte ?? 0, 1)} lavoratori-anno · da verificare` : 'organico da inserire'} />
      </div>
      <Panel title={`Interventi di prevenzione del ${y}`} sub="Domanda all’INAIL entro il 28 febbraio dell’anno dopo, con la documentazione di ogni intervento" flush>
        <Table rows={ms.map((m, i) => ({ ...m, i }))} rowKey={x => `${x.code}-${x.i}`} pageSize={20} cols={[
          { key: 'code', label: 'Codice' },
          { key: 'title', label: 'Intervento', render: x => <span className="epe-wrap">{x.title}</span> },
          { key: 'points', label: 'Punti', align: 'r' },
          { key: 'done', label: 'Stato', render: x => <Btn small kind="ghost" icon={x.done !== false ? LuCheck : undefined} onClick={() => toggle(x.i)} title="Cambia lo stato" disabled={!!row?.submittedAt}>{x.done !== false ? 'fatto' : 'da fare'}</Btn> },
          { key: 'ev', label: 'Evidenze', nosort: true, render: x => <EvidenceCount d={d} type="ot23" refId={`${y}:${x.code}`} /> },
          { key: 'rm', label: '', nosort: true, render: x => (row?.submittedAt ? null : <Btn small kind="ghost" icon={LuTrash2} title="Togli l’intervento" onClick={() => remove(x.i)} />) },
        ]} empty="Nessun intervento registrato per l’anno" />
        {!row?.submittedAt && (
          <div className="epe-add">
            <Field label="Nuovo intervento"><input className="input" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="Es. procedura di blocco e cartellinatura delle macchine" /></Field>
            <Field label="Punti dal modello" className="epe-narrow"><NumInput value={points} decimals={0} min={0} max={200} onChange={setPoints} ariaLabel="Punti" /></Field>
            <Btn icon={LuPlus} onClick={add} disabled={!title.trim()}>Aggiungi</Btn>
          </div>
        )}
      </Panel>
      <div className="grid g2">
        <Panel title="Presentazione della domanda" sub={row?.submittedAt ? `Presentata il ${dateIt(row.submittedAt)} · esito: ${row.outcome || '—'}` : 'Non ancora presentata'}>
          {row?.submittedAt ? <p className="small">Gli interventi sono bloccati. Per correggere l’esito usare il registro degli anni.</p> : (
            <div className="epe-add">
              <Field label="Data di invio"><input type="date" className="input" value={sub} onChange={e => setSub(e.target.value)} /></Field>
              <Btn kind="primary" icon={LuCheck} onClick={submit} disabled={!ms.length || !sub}>Segna come presentata</Btn>
            </div>
          )}
          <p className="small muted">{item?.note}</p>
          <PackSource item={item} validAsOf={S?.pack?.validAsOf} />
        </Panel>
        <Panel title="Domande degli anni" flush>
          <Table rows={years.map(r => ({ ...r, t: ot23Total(r, item || undefined) }))} rowKey={x => x.id} pageSize={10} cols={[
            { key: 'year', label: 'Anno degli interventi' },
            { key: 'pts', label: 'Punti', align: 'r', render: x => nf(x.t.points) },
            { key: 'submittedAt', label: 'Presentata', render: x => dt(x.submittedAt) },
            { key: 'outcome', label: 'Esito', render: x => <Chip kind={x.outcome === 'accolta' ? 'good' : x.outcome === 'respinta' ? 'crit' : 'outline'}>{x.outcome || '—'}</Chip> },
          ]} empty="Nessuna domanda registrata" />
        </Panel>
      </div>
    </>
  );
}

