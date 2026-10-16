/* FeedOS 16 · Qualità e tracciabilità: rilascio dei lotti con le tolleranze di etichetta, accettazione delle materie
 * prime con l'aflatossina B1, carte di controllo, reclami, richiamo con bilancio di massa in pochi millisecondi. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuShieldCheck, LuShieldAlert, LuPlus, LuDownload, LuListChecks, LuLock, LuSearch, LuCheck, LuX, LuTimer, LuArrowRight } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, signals, traceIndex, shippedByLot } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, mean, round, norm } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { checkAnalysis, toleranceRange, controlStats, TOLERANCE_NOTE } from '../engine/quality.js';
import { recall } from '../engine/trace.js';
import { profile, AFB1_LIMITS } from '../engine/nutrients.js';
import { acceptIngLotOps } from '../engine/operations.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv } from '../ui/ui.jsx';
import { LineChart, Bars, Dots, Legend } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

export const PARAMS = [{ id: 'PG', label: 'Proteina grezza' }, { id: 'GG', label: 'Grassi grezzi' }, { id: 'FG', label: 'Fibra grezza' }, { id: 'CE', label: 'Ceneri grezze' }];
const LOT_KIND = { rilasciato: 'good', 'in attesa': 'warn', bloccato: 'crit' };
export const lotChip = s => <Chip kind={LOT_KIND[s] || ''} icon={s === 'rilasciato' ? LuShieldCheck : s === 'bloccato' ? LuLock : LuTimer}>{s}</Chip>;

/** Valori dichiarati in etichetta per un lotto (dalla versione di formula usata), arrotondati come sul cartellino. */
export function declaredFor(d, lot, I = idx(d)) {
  const run = I.run[lot.runId];
  const f = I.form[I.prod[lot.productId]?.formulaId];
  if (!f) return {};
  const lines = (f.history || []).find(h => h.version === run?.formulaVersion)?.lines || f.lines;
  const p = profile(lines, I.ing);
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  return { PG: r1(p.PG), GG: r1(p.GG), FG: r1(p.FG), CE: r1(p.CE), UM: p.SS != null ? r1(100 - p.SS) : null };
}
/** Esito complessivo dell'ultima analisi di un lotto rispetto alle tolleranze. */
export function lotCheck(d, lot, I) {
  const a = lot.analyses?.[lot.analyses.length - 1];
  if (!a) return { status: 'n/d', items: [] };
  const dec = declaredFor(d, lot, I);
  const items = PARAMS.map(p => ({ ...p, value: a.values?.[p.id], declared: dec[p.id], ...checkAnalysis(p.id, a.values?.[p.id], dec[p.id]) }));
  const bad = items.filter(x => x.status === 'difetto' || x.status === 'eccesso');
  return { status: bad.length ? 'fuori' : 'ok', items, bad, date: a.date, method: a.method };
}

export function Qualita({ route }) {
  const d = useData();
  const tab = route.tab || 'lotti';
  return (
    <>
      <PageHead title="Qualità e tracciabilità" lead="Rilascio dei lotti con le tolleranze di etichetta, accettazione delle materie prime con l’aflatossina B1, carte di controllo, reclami e richiamo: da un lotto ai clienti in pochi millisecondi, con il bilancio di massa."
        actions={<><Btn icon={LuPlus} onClick={() => go('qualita', 'reclami', 'nuovo')}>Nuovo reclamo</Btn><Btn kind="primary" icon={LuShieldAlert} onClick={() => go('qualita', 'richiamo')}>Simula un richiamo</Btn></>}
        tabs={NAV.qualita.tabs} tab={tab} onTab={t => go('qualita', t)} />
      {tab === 'lotti' && <Lotti d={d} sel={route.id} />}
      {tab === 'lotti-mp' && <LottiMP d={d} sel={route.id} />}
      {tab === 'analisi' && <Carte d={d} sel={route.id} />}
      {tab === 'reclami' && <Reclami d={d} sel={route.id} />}
      {tab === 'richiamo' && <Richiamo d={d} sel={route.id} />}
    </>
  );
}

/* ---------------- lotti di prodotto ---------------- */
function Lotti({ d, sel }) {
  const I = idx(d); const today = appToday(d); const SH = shippedByLot(d);
  const [days, setDays] = useState(60), [st, setSt] = useState(''), [q, setQ] = useState('');
  useEffect(() => { if (sel && I.lot[sel]) openDrawer('lot', sel); }, [sel]);
  const sigs = signals(d).filter(s => s.area === 'qualita' && s.link?.tab !== 'lotti-mp' && s.link?.tab !== 'reclami');
  const rows = useMemo(() => d.lots.filter(l => l.date > addDays(today, -days) || l.status !== 'rilasciato').map(l => {
    const c = lotCheck(d, l, I); const sh = SH[l.id] || 0;
    return { ...l, chk: c, shipped: sh, stock: Math.max(0, l.tonnes - sh), pname: I.prod[l.productId]?.name };
  }), [d.lots, d.shipments, days, today]);
  const view = filterRows(rows.filter(r => !st || (st === 'fuori' ? r.chk.status === 'fuori' : r.status === st)), q, ['code', 'pname']);
  const recent = d.lots.filter(l => l.date > addDays(today, -90));
  const analyzed = recent.filter(l => l.analyses?.length);
  const okN = analyzed.filter(l => lotCheck(d, l, I).status === 'ok').length;
  const release = l => { store.update('lots', l.id, { status: 'rilasciato', releasedAt: today }, `Lotto ${l.code} rilasciato`); toast(`Lotto ${l.code} rilasciato`, 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Lotti in attesa di rilascio" value={d.lots.filter(l => l.status === 'in attesa').length} foot="quarantena fino all’esito" onClick={() => setSt('in attesa')} />
        <Kpi label="Lotti bloccati" value={d.lots.filter(l => l.status === 'bloccato').length} onClick={() => setSt('bloccato')} />
        <Kpi label="Conformi all’etichetta (90 gg)" value={analyzed.length ? nf(okN / analyzed.length * 100, 1) : '—'} unit="%" foot={`${okN} di ${analyzed.length} lotti analizzati`} onClick={() => setSt('fuori')} />
        <Kpi label="Lotti analizzati (90 gg)" value={recent.length ? nf(analyzed.length / recent.length * 100) : '—'} unit="%" foot="piano di campionamento" />
      </div>
      {sigs.length > 0 && <Panel title="Da decidere in qualità" flush><SignalList items={sigs} limit={3} /></Panel>}
      <Panel title="Lotti di prodotto" sub={`Ultima analisi confrontata con i valori dichiarati · ${TOLERANCE_NOTE}`} flush
        actions={<><Seg options={[{ id: '', label: 'Tutti' }, { id: 'in attesa', label: 'In attesa' }, { id: 'fuori', label: 'Fuori tolleranza' }, { id: 'bloccato', label: 'Bloccati' }]} value={st} onChange={setSt} label="Stato" />
          <Seg options={[{ id: 30, label: '30 gg' }, { id: 60, label: '60 gg' }, { id: 365, label: '12 mesi' }]} value={days} onChange={setDays} label="Periodo" />
          <SearchBox value={q} onChange={setQ} placeholder="Lotto o prodotto" id="lot-search" /></>}>
        <Table rows={view} selected={sel} onRow={l => openDrawer('lot', l.id)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={40} cols={[
          { key: 'code', label: 'Lotto', render: l => <span className="code">{l.code}</span> },
          { key: 'pname', label: 'Prodotto', render: l => <b>{l.pname}</b> },
          { key: 'date', label: 'Data', render: l => dateIt(l.date, 'dm') },
          { key: 'tonnes', label: 't', align: 'r', render: l => nf(l.tonnes, 1) },
          { key: 'pg', label: 'PG misurata / dichiarata', align: 'r', sort: l => l.chk.items.find(x => x.id === 'PG')?.value, render: l => { const x = l.chk.items.find(i => i.id === 'PG'); return x?.value != null ? <>{nf(x.value, 2)} / {nf(x.declared, 1)}<span className="sub">ammesso {nf(x.min, 2)}–{nf(x.max, 2)}</span></> : <span className="muted">non analizzato</span>; } },
          { key: 'chk', label: 'Etichetta', sort: l => l.chk.status, render: l => l.chk.status === 'ok' ? <Chip kind="good" icon={LuCheck}>conforme</Chip> : l.chk.status === 'fuori' ? <Chip kind="crit">{l.chk.bad.map(b => b.id + ' ' + b.status).join(', ')}</Chip> : <span className="muted">—</span> },
          { key: 'stock', label: 'A magazzino t', align: 'r', render: l => nf(l.stock, 1) },
          { key: 'status', label: 'Stato', render: l => lotChip(l.status) },
          { key: 'x', label: '', nosort: true, render: l => l.status === 'in attesa' ? <Btn small icon={LuShieldCheck} onClick={e => { e.stopPropagation(); if (l.chk.status === 'fuori') confirm('Rilasciare un lotto fuori tolleranza?', <p>L’analisi di {l.code} è fuori tolleranza di etichetta. Il rilascio resta registrato con la tua vista e la data.</p>, () => release(l), { ok: 'Rilascia comunque', danger: true }); else release(l); }}>Rilascia</Btn> : null },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- lotti di materie prime ---------------- */
function LottiMP({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  const [st, setSt] = useState(''), [q, setQ] = useState(''), [ing, setIng] = useState('mais');
  useEffect(() => { if (sel && I.ingLot[sel]) openDrawer('ingLot', sel); }, [sel]);
  const rows = d.ingLots.map(l => ({ ...l, iname: I.ing[l.ingId]?.name, afb1: l.analyses?.AFB1 }));
  const view = filterRows(rows.filter(r => !st || (st === 'giacenza' ? r.status === 'accettato' && r.remaining > 0.005 : st === 'afb1' ? (r.afb1 ?? 0) >= 10 : r.status === st)), q, ['code', 'iname', 'supplier', 'ddt']);
  const cereals = ['mais', 'sorgo', 'ddgs', 'glutine'];
  const pts = d.ingLots.filter(l => l.ingId === ing && l.analyses?.AFB1 != null && l.date > addDays(today, -365))
    .map(l => ({ key: l.id, t: l.date, y: l.analyses.AFB1, label: `${l.code} · ${nf(l.tonnes)} t`, color: l.analyses.AFB1 > 20 ? 'var(--crit)' : l.analyses.AFB1 >= 10 ? 'var(--warn)' : 'var(--s1)' }));
  const hot = rows.filter(r => r.status === 'accettato' && r.remaining > 0.005 && (r.afb1 ?? 0) >= 10);
  return (
    <>
      <div className="kpis">
        <Kpi label="In attesa di accettazione" value={rows.filter(r => r.status === 'in attesa').length} foot="non utilizzabili in produzione" onClick={() => setSt('in attesa')} />
        <Kpi label="Respinti in 12 mesi" value={rows.filter(r => r.status === 'bloccato' && r.date > addDays(today, -365)).length} foot="AFB1 oltre 20 µg/kg" onClick={() => setSt('bloccato')} />
        <Kpi label="In giacenza con AFB1 ≥ 10 µg/kg" value={hot.length} foot={hot.length ? `${nf(sum(hot, r => r.remaining))} t: preferire formule per adulti` : 'nessuno'} onClick={() => setSt('afb1')} />
        <Kpi label="AFB1 media del mais (12 mesi)" value={nf(mean(d.ingLots.filter(l => l.ingId === 'mais' && l.analyses?.AFB1 != null && l.date > addDays(today, -365)).map(l => l.analyses.AFB1)) ?? 0, 1)} unit="µg/kg" foot="limite materie prime 20" />
      </div>
      <Panel title="Aflatossina B1 per lotto" sub="Limite per le materie prime 20 µg/kg (Dir. 2002/32/CE, al 12% di umidità) · da 10 µg/kg destinare a formule per animali adulti" id="q-afb1"
        actions={<Seg options={cereals.map(c => ({ id: c, label: I.ing[c]?.short || I.ing[c]?.name }))} value={ing} onChange={setIng} label="Materia prima" />}>
        <Dots points={pts} unit="µg/kg" decimals={1} height={230} refs={[{ y: AFB1_LIMITS.materia_prima, label: 'limite 20', kind: 'crit' }, { y: 10, label: 'attenzione', kind: 'warn' }, { y: AFB1_LIMITS.giovani_lattifere, label: 'lattifere 5', kind: 'muted' }]} ariaLabel="Aflatossina B1 dei lotti" onPick={p => openDrawer('ingLot', p.key)} />
      </Panel>
      <Panel title="Lotti di materie prime" sub="Accettazione all’arrivo: umidità, proteina e aflatossina B1 · clic per la scheda, l’esito e la tracciabilità a valle" flush
        actions={<><Seg options={[{ id: '', label: 'Tutti' }, { id: 'in attesa', label: 'In attesa' }, { id: 'giacenza', label: 'In giacenza' }, { id: 'afb1', label: 'AFB1 ≥ 10' }, { id: 'bloccato', label: 'Respinti' }]} value={st} onChange={setSt} label="Filtro" />
          <SearchBox value={q} onChange={setQ} placeholder="Lotto, materia prima, DDT" id="il-search" /></>}>
        <Table rows={view} selected={sel} onRow={l => openDrawer('ingLot', l.id)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={40} cols={[
          { key: 'code', label: 'Lotto', render: l => <span className="code">{l.code}</span> },
          { key: 'iname', label: 'Materia prima', render: l => <><b>{l.iname}</b><span className="sub">{l.supplier} · {l.ddt || '—'}</span></> },
          { key: 'date', label: 'Arrivo', render: l => dateIt(l.date, 'dm') },
          { key: 'tonnes', label: 't', align: 'r', render: l => nf(l.tonnes, 1) },
          { key: 'remaining', label: 'Residuo t', align: 'r', render: l => nf(l.remaining, 1) },
          { key: 'um', label: 'Umidità %', align: 'r', sort: l => l.analyses?.UM, render: l => nf(l.analyses?.UM, 1) },
          { key: 'afb1', label: 'AFB1 µg/kg', align: 'r', render: l => l.afb1 == null ? '—' : <span className={l.afb1 > 20 ? 'chip crit' : l.afb1 >= 10 ? 'chip warn' : ''}>{nf(l.afb1, 1)}</span> },
          { key: 'status', label: 'Stato', render: l => <Chip kind={l.status === 'accettato' ? 'good' : l.status === 'bloccato' ? 'crit' : 'warn'}>{l.status === 'bloccato' ? 'respinto' : l.status}</Chip> },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- carte di controllo ---------------- */
function Carte({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  const prods = d.products;
  const [pid, setPid] = useState(sel && I.prod[sel] ? sel : prods[0]?.id);
  const [par, setPar] = useState('PG');
  const lots = d.lots.filter(l => l.productId === pid && l.analyses?.length && l.date > addDays(today, -365)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows = lots.map(l => { const dec = declaredFor(d, l, I); const v = l.analyses[l.analyses.length - 1].values?.[par]; return { lot: l, v, dec: dec[par], dev: v != null && dec[par] != null ? v - dec[par] : null, chk: checkAnalysis(par, v, dec[par]) }; }).filter(r => r.dev != null);
  const decNow = rows.length ? rows[rows.length - 1].dec : null;
  const tol = decNow != null ? toleranceRange(par, decNow) : null;
  const S = controlStats(rows.map(r => r.dev), tol ? tol.min - decNow : null, tol ? tol.max - decNow : null);
  const outs = rows.filter(r => r.chk.status === 'difetto' || r.chk.status === 'eccesso');
  return (
    <>
      <Panel title="Carta di controllo" sub="Scarto tra valore analizzato e valore dichiarato, lotto per lotto (ultimi 12 mesi): limiti di controllo a ±3σ dalla variabilità del processo, limiti di tolleranza di legge"
        actions={<><Select value={pid} onChange={setPid} options={prods.map(p => ({ id: p.id, label: p.name }))} ariaLabel="Prodotto" /><Seg options={PARAMS.map(p => ({ id: p.id, label: p.id, title: p.label }))} value={par} onChange={setPar} label="Parametro" /></>} id="q-spc">
        {rows.length < 3 ? <Empty title="Servono almeno 3 lotti analizzati" /> : (
          <div className="split">
            <div>
              <LineChart labels={rows.map(r => r.lot.date)} formatX={x => dateIt(x, 'dm')} height={250} unit="punti" decimals={2} markLast={false} area={false}
                series={[{ key: 'dev', label: `Scarto ${par}`, color: 'var(--s1)', values: rows.map(r => r.dev) }]}
                refs={[{ y: 0, label: 'dichiarato', kind: 'muted' }, ...(S ? [{ y: S.ucl, label: 'UCL', kind: 'muted' }, { y: S.lcl, label: 'LCL', kind: 'muted' }] : []), ...(tol ? [{ y: tol.min - decNow, label: 'tolleranza', kind: 'crit' }, { y: tol.max - decNow, label: 'tolleranza', kind: 'crit' }] : [])]}
                ariaLabel={`Carta di controllo ${par}`} />
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <Kv items={[['Lotti analizzati', rows.length], ['Scarto medio', `${sf(S?.mean, 2)} punti`], ['Variabilità (σ)', `${nf(S?.sd, 2)} punti`], ['Punti fuori controllo', S?.outOfControl ?? '—'], ['Serie di 8 dallo stesso lato', S?.runs ?? '—'], ['Capacità (Cpk)', S?.cpk != null ? nf(S.cpk, 2) : '—'], ['Fuori tolleranza di etichetta', outs.length]]} />
              <div className={`note ${S?.cpk >= 1.33 ? 'good' : S?.cpk >= 1 ? 'maize' : 'crit'}`}>{S?.cpk == null ? 'Capacità non calcolabile.' : S.cpk >= 1.33 ? 'Processo capace: la variabilità sta ampiamente dentro le tolleranze di etichetta.' : S.cpk >= 1 ? 'Processo al limite: ridurre la variabilità (campionamento, analisi NIR delle materie prime, dosaggio).' : 'Processo non capace: una parte dei lotti può uscire dalle tolleranze. Verificare taratura NIR, dosaggio e valori delle materie prime.'}</div>
              <p className="small muted">UCL e LCL si calcolano con l’escursione mobile (σ = MR/1,128); le tolleranze usano il valore dichiarato della formula in vigore.</p>
            </div>
          </div>
        )}
      </Panel>
      {outs.length > 0 && <Panel title="Lotti fuori tolleranza" flush>
        <Table rows={outs} rowKey={r => r.lot.id} onRow={r => openDrawer('lot', r.lot.id)} cols={[
          { key: 'code', label: 'Lotto', sort: r => r.lot.code, render: r => <span className="code">{r.lot.code}</span> },
          { key: 'date', label: 'Data', sort: r => r.lot.date, render: r => dateIt(r.lot.date) },
          { key: 'v', label: 'Analizzato', align: 'r', render: r => nf(r.v, 2) },
          { key: 'dec', label: 'Dichiarato', align: 'r', render: r => nf(r.dec, 1) },
          { key: 'st', label: 'Esito', sort: r => r.chk.status, render: r => <Chip kind="crit">{r.chk.status}</Chip> },
          { key: 'status', label: 'Stato lotto', sort: r => r.lot.status, render: r => lotChip(r.lot.status) },
        ]} />
      </Panel>}
    </>
  );
}

/* ---------------- reclami ---------------- */
const CSTAGES = [['aperto', 'Aperti'], ['analisi', 'In analisi'], ['azione', 'Azione correttiva'], ['chiuso', 'Chiusi (90 gg)']];
function Reclami({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  useEffect(() => { if (sel && sel !== 'nuovo' && d.complaints.some(c => c.id === sel)) openDrawer('complaint', sel); }, [sel]);
  const y = d.complaints.filter(c => c.date > addDays(today, -365));
  const closed = y.filter(c => c.status === 'chiuso' && c.closedAt);
  const cats = {}; for (const c of y) cats[c.category] = (cats[c.category] || 0) + 1;
  const founded = closed.filter(c => c.rootCause && c.rootCause !== 'Nessuna non conformità riscontrata').length;
  return (
    <>
      {sel === 'nuovo' && <NuovoReclamo d={d} />}
      <div className="kpis">
        <Kpi label="Reclami aperti" value={d.complaints.filter(c => c.status !== 'chiuso').length} foot={`${d.complaints.filter(c => c.status !== 'chiuso' && daysBetween(c.date, today) > 10).length} oltre 10 giorni`} />
        <Kpi label="Tempo medio di chiusura" value={closed.length ? nf(mean(closed.map(c => daysBetween(c.date, c.closedAt)))) : '—'} unit="giorni" foot="ultimi 12 mesi" />
        <Kpi label="Reclami fondati" value={closed.length ? nf(founded / closed.length * 100) : '—'} unit="%" foot={`${founded} di ${closed.length} chiusi`} />
        <Kpi label="Costo dei reclami" value={nf(sum(y, c => c.cost || 0))} unit="€" foot="12 mesi, dichiarato alla chiusura" />
      </div>
      <div className="kanban" id="q-kanban">
        {CSTAGES.map(([k, label]) => {
          const items = d.complaints.filter(c => c.status === k && (k !== 'chiuso' || c.date > addDays(today, -90))).sort((a, b) => (a.date < b.date ? -1 : 1));
          return (
            <div key={k} className="col">
              <h4>{label}<span>{items.length}</span></h4>
              {items.map(c => { const age = daysBetween(c.date, today); return (
                <button key={c.id} className="card" onClick={() => openDrawer('complaint', c.id)}>
                  <span className="row between"><span className="code">{c.code}</span>{k !== 'chiuso' && <Chip kind={age > 10 ? 'crit' : age > 5 ? 'warn' : ''}>{age} gg</Chip>}</span>
                  <b>{c.description}</b>
                  <span className="small muted">{I.cust[c.customerId]?.name} · {I.prod[c.productId]?.name}</span>
                  <span className="row gap-s"><Chip kind="outline">{c.category}</Chip>{c.severity >= 3 && <Chip kind="crit">gravità {c.severity}</Chip>}</span>
                </button>); })}
              {!items.length && <span className="small muted">Nessuno</span>}
            </div>
          );
        })}
      </div>
      <div className="grid g2 start">
        <Panel title="Di cosa si lamentano i clienti" sub="Categorie, ultimi 12 mesi">
          <Bars data={Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v }))} unit="" ariaLabel="Reclami per categoria" />
        </Panel>
        <Panel title="Cause trovate" sub="Reclami chiusi, ultimi 12 mesi">
          <Bars data={Object.entries(closed.reduce((m, c) => { m[c.rootCause || 'Non indicata'] = (m[c.rootCause || 'Non indicata'] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v }))} color="var(--s3)" ariaLabel="Cause dei reclami" />
        </Panel>
      </div>
    </>
  );
}

function NuovoReclamo({ d }) {
  const I = idx(d); const today = appToday(d);
  const [cust, setCust] = useState(d.customers[0]?.id);
  const ships = d.shipments.filter(s => s.customerId === cust && s.date > addDays(today, -120)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const prods = [...new Set(ships.map(s => s.productId))];
  const [pid, setPid] = useState(null);
  const p = pid && prods.includes(pid) ? pid : prods[0];
  const lots = [...new Set(ships.filter(s => s.productId === p).map(s => s.lotId))];
  const [lot, setLot] = useState(null);
  const l = lot && lots.includes(lot) ? lot : lots[0];
  const [cat, setCat] = useState('Qualità del pellet'), [desc, setDesc] = useState(''), [sev, setSev] = useState(2);
  const save = () => {
    if (!desc.trim()) { toast('Descrivi il problema segnalato', 'err'); return; }
    const n = d.complaints.length + 1;
    const kind = /consegna/i.test(cat) ? 'servizio' : /etichett/i.test(cat) ? 'etichetta' : /prestazion/i.test(cat) ? 'prestazioni' : 'prodotto';
    const id = store.add('complaints', { code: `RC-${today.slice(2, 4)}-${String(n).padStart(3, '0')}`, date: today, customerId: cust, productId: p, lotId: l, category: cat, description: desc.trim(), kind, severity: sev, source: 'cliente', status: 'aperto', owner: 'Qualità', rootCause: '', action: '', closedAt: null, cost: null }, `Nuovo reclamo di ${I.cust[cust]?.name}`);
    toast('Reclamo registrato: il lotto è collegato per la tracciabilità');
    go('qualita', 'reclami', id);
  };
  return (
    <Panel title="Nuovo reclamo" sub="Il lotto si sceglie tra quelli consegnati al cliente: così la tracciabilità parte subito" actions={<Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={() => go('qualita', 'reclami')} />} id="q-new">
      <div className="form">
        <Field label="Cliente"><Select value={cust} onChange={v => { setCust(v); setPid(null); setLot(null); }} options={[...d.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ id: c.id, label: c.name }))} id="rc-cust" /></Field>
        <Field label="Prodotto"><Select value={p || ''} onChange={v => { setPid(v); setLot(null); }} options={prods.length ? prods.map(x => ({ id: x, label: I.prod[x]?.name })) : [{ id: '', label: 'Nessuna consegna recente' }]} /></Field>
        <Field label="Lotto consegnato"><Select value={l || ''} onChange={setLot} options={lots.length ? lots.map(x => ({ id: x, label: `${I.lot[x]?.code} · ${dateIt(I.lot[x]?.date, 'dm')}` })) : [{ id: '', label: '—' }]} /></Field>
        <Field label="Categoria"><Select value={cat} onChange={setCat} options={['Qualità del pellet', 'Qualità', 'Consegna', 'Etichetta', 'Prestazioni', 'Altro']} /></Field>
        <Field label="Gravità"><Select value={sev} onChange={v => setSev(+v)} options={[{ id: 1, label: '1 · lieve' }, { id: 2, label: '2 · media' }, { id: 3, label: '3 · grave' }]} /></Field>
      </div>
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        <Field label="Descrizione"><textarea className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Cosa ha segnalato il cliente, con quali quantità e quando" id="rc-desc" /></Field>
        <div className="row"><Btn kind="primary" icon={LuPlus} onClick={save} disabled={!p}>Registra reclamo</Btn></div>
      </div>
    </Panel>
  );
}

/* ---------------- richiamo ---------------- */
function Richiamo({ d, sel }) {
  const I = idx(d); const ix = traceIndex(d);
  const [kind, setKind] = useState(sel && I.lot[sel] ? 'lot' : 'ing');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(sel && (I.ingLot[sel] || I.lot[sel]) ? [sel] : []);
  useEffect(() => { if (sel && (I.ingLot[sel] || I.lot[sel])) { setPicked([sel]); setKind(I.lot[sel] ? 'lot' : 'ing'); } }, [sel]);
  const cands = useMemo(() => {
    const s = norm(q).trim();
    const src = kind === 'ing' ? d.ingLots.filter(l => l.status !== 'bloccato').map(l => ({ id: l.id, code: l.code, label: I.ing[l.ingId]?.name, date: l.date, extra: l.analyses?.AFB1 != null ? `AFB1 ${nf(l.analyses.AFB1, 1)}` : '' }))
      : d.lots.map(l => ({ id: l.id, code: l.code, label: I.prod[l.productId]?.name, date: l.date, extra: `${nf(l.tonnes, 1)} t` }));
    const f = s ? src.filter(x => norm(`${x.code} ${x.label}`).includes(s)) : src.filter(x => kind === 'ing' ? (I.ingLot[x.id]?.analyses?.AFB1 ?? 0) >= 10 : false);
    return f.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  }, [q, kind, d.ingLots, d.lots]);
  const t0 = performance.now();
  const R = picked.length ? recall(ix, kind === 'ing' ? { ingLots: picked.filter(id => I.ingLot[id]) } : { lots: picked.filter(id => I.lot[id]) }) : null;
  const ms = performance.now() - t0;
  const blockable = R ? R.lots.filter(x => x.inStock > 0.05 && x.lot.status !== 'bloccato') : [];
  const block = () => confirm(`Bloccare ${blockable.length} lotti a magazzino?`, <p>{nf(sum(blockable, x => x.inStock), 1)} t non potranno essere spedite finché non saranno sbloccate in Qualità.</p>, () => {
    store.batch(blockable.map(x => ({ kind: 'update', coll: 'lots', id: x.lot.id, patch: { status: 'bloccato', blockedAt: appToday(d), blockNote: 'Richiamo cautelativo' } })), `Richiamo: bloccati ${blockable.length} lotti`);
    toast(`${blockable.length} lotti bloccati`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  }, { ok: 'Blocca', danger: true });
  const notify = () => {
    const src = picked.map(id => I.ingLot[id]?.code || I.lot[id]?.code).join(', ');
    store.add('tasks', { title: `Richiamo ${src}: avvisare ${R.customers.length} clienti`, detail: R.customers.map(c => `${I.cust[c.customerId]?.name} (${nf(c.tonnes, 1)} t)`).join('; '), area: 'qualita', owner: 'Qualità', due: appToday(d), status: 'aperto', priority: 'alta', source: 'richiamo', createdAt: appToday(d) }, `Richiamo: attività di comunicazione ai clienti`);
    toast('Attività creata con l’elenco dei clienti');
  };
  const exportCsv = () => {
    const rows = R.customers.flatMap(c => c.shipments.map(s => ({ c, s })));
    download(`richiamo-${stamp()}.csv`, toCSV(rows, [{ label: 'Cliente', value: r => I.cust[r.c.customerId]?.name }, { label: 'Città', value: r => I.cust[r.c.customerId]?.city }, { label: 'Data consegna', value: r => r.s.date }, { label: 'DDT', value: r => r.s.ddt }, { label: 'Lotto', value: r => I.lot[r.s.lotId]?.code }, { label: 'Prodotto', value: r => I.prod[r.s.productId]?.name }, { label: 't', value: r => r.s.tonnes }]), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <Panel title="Da dove parte il richiamo" sub="Un lotto di materia prima (a valle: lotti di prodotto e clienti) o un lotto di prodotto (clienti e materie prime usate)" id="q-recall">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Seg options={[{ id: 'ing', label: 'Lotto di materia prima' }, { id: 'lot', label: 'Lotto di prodotto' }]} value={kind} onChange={k => { setKind(k); setPicked([]); }} label="Tipo di lotto" />
          <div style={{ flex: 1, minWidth: 260 }}><SearchBox value={q} onChange={setQ} placeholder={kind === 'ing' ? 'Codice lotto o materia prima (es. M01, mais)' : 'Codice lotto o prodotto'} id="rc-search" /></div>
        </div>
        {picked.length > 0 && <div className="row gap-s" style={{ marginTop: 12 }}><span className="small"><b>Lotti scelti:</b></span>{picked.map(id => <button key={id} className="chip pick on" onClick={() => setPicked(p => p.filter(x => x !== id))} title="Togli">{I.ingLot[id]?.code || I.lot[id]?.code} · {I.ingLot[id] ? I.ing[I.ingLot[id].ingId]?.name : I.prod[I.lot[id]?.productId]?.name} ✕</button>)}</div>}
        <div className="row gap-s" style={{ marginTop: 10 }}>
          {!q && kind === 'ing' && <span className="small muted">Suggeriti: lotti con aflatossina B1 ≥ 10 µg/kg</span>}
          {cands.map(c => <button key={c.id} className={`chip outline pick ${picked.includes(c.id) ? 'on' : ''}`} onClick={() => setPicked(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])} aria-pressed={picked.includes(c.id)}>{c.code} · {c.label}{c.extra ? ' · ' + c.extra : ''}</button>)}
        </div>
      </Panel>
      {!R ? <Empty icon={LuSearch} title="Scegli uno o più lotti">Il risultato comprende lotti coinvolti, clienti, quantità spedite e ancora a magazzino.</Empty> : (
        <>
          <div className="kpis" id="q-recall-kpi">
            <Kpi label="Lotti di prodotto coinvolti" value={R.lots.length} foot={R.first ? `dal ${dateIt(R.first, 'dm')} al ${dateIt(R.last, 'dm')}` : ''} />
            <Kpi label="Clienti da avvisare" value={R.customers.length} foot={`${nf(R.shippedT, 1)} t consegnate`} />
            <Kpi label="Ancora a magazzino" value={nf(R.inStockT, 1)} unit="t" foot={`${blockable.length} lotti non bloccati`} />
            <Kpi label="Tempo di risposta" value={nf(Math.max(ms, 0.1), 1)} unit="ms" foot="Reg. (CE) 178/2002, art. 18" />
          </div>
          {R.massBalance && (
            <Panel title="Bilancio di massa del lotto di materia prima" sub="Ricevuto = usato nei lotti di prodotto + residuo in silo (+ scarto)">
              <Kv items={[['Ricevuto', `${nf(R.massBalance.received, 2)} t`], ['Usato in produzione', `${nf(R.massBalance.used, 2)} t`], ['Residuo in silo', `${nf(R.massBalance.remaining, 2)} t`], ['Differenza', `${nf(R.massBalance.gap, 3)} t ${Math.abs(R.massBalance.gap) < 0.05 ? '· bilancio chiuso' : '· da verificare'}`]]} />
            </Panel>
          )}
          <div className="row">
            <Btn kind="primary" icon={LuLock} disabled={!blockable.length} onClick={block}>Blocca i lotti a magazzino</Btn>
            <Btn icon={LuListChecks} disabled={!R.customers.length} onClick={notify}>Crea l’attività di comunicazione</Btn>
            <Btn icon={LuDownload} disabled={!R.customers.length} onClick={exportCsv}>Elenco consegne (CSV)</Btn>
          </div>
          <div className="split">
            <Panel title="Lotti di prodotto" flush>
              <Table rows={R.lots} rowKey={x => x.lot.id} onRow={x => openDrawer('lot', x.lot.id)} cols={[
                { key: 'code', label: 'Lotto', sort: x => x.lot.code, render: x => <span className="code">{x.lot.code}</span> },
                { key: 'p', label: 'Prodotto', sort: x => I.prod[x.lot.productId]?.name, render: x => <><b>{I.prod[x.lot.productId]?.name}</b><span className="sub">{dateIt(x.lot.date)}</span></> },
                { key: 'kg', label: 'Dal lotto sorgente', align: 'r', sort: x => x.kgFromSource, render: x => x.kgFromSource == null ? '—' : nf(x.kgFromSource / 1000, 2) + ' t' },
                { key: 'shipped', label: 'Spedito t', align: 'r', render: x => nf(x.shipped, 1) },
                { key: 'inStock', label: 'Magazzino t', align: 'r', render: x => nf(x.inStock, 1) },
                { key: 's', label: 'Stato', sort: x => x.lot.status, render: x => lotChip(x.lot.status) },
              ]} />
            </Panel>
            <Panel title="Clienti" flush>
              <Table rows={R.customers} rowKey={c => c.customerId} onRow={c => openDrawer('customer', c.customerId)} cols={[
                { key: 'n', label: 'Cliente', sort: c => I.cust[c.customerId]?.name, render: c => <><b>{I.cust[c.customerId]?.name}</b><span className="sub">{I.cust[c.customerId]?.city} ({I.cust[c.customerId]?.province})</span></> },
                { key: 'tonnes', label: 't', align: 'r', render: c => nf(c.tonnes, 1) },
                { key: 'sh', label: 'Consegne', align: 'r', sort: c => c.shipments.length, render: c => c.shipments.length },
              ]} empty="Nessuna consegna: il prodotto è tutto a magazzino." />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
