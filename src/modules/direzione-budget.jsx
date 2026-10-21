/* FeedOS 17 · Direzione › Budget (WP1): budget mese per mese contro consuntivo e previsione, stima di chiusura con banda P10–P90,
 * creazione e revisione guidate (anteprima dal vivo, un solo passo annullabile), approvazione che blocca la versione. */
import React, { useMemo, useRef, useState } from 'react';
import { LuPlus, LuGitBranch, LuStamp, LuDownload, LuLock, LuRotateCcw } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { getPrefs } from '../core/prefs.js';
import { go } from '../core/router.js';
import { nf, sf, monthLabel, dateIt, addDays } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { SPECIES } from '../engine/nutrients.js';
import { pnlFor } from '../engine/pnl.js';
import { budgetVsActual, budgetTotals, landing, activeVersion, budgetStatus, versionStatus, isLocked, budgetVersions, hasBudget, seedBudgetRows, budgetWriteOps, approveBudgetOps, nextRevision } from '../engine/budget.js';
import { Panel, Kpi, Btn, Chip, Seg, Select, Table, Drawer, Empty, Field, Kv, confirm } from '../ui/ui.jsx';
import { useDir, money, eurTxt, kEur, MonthBars, Def } from './direzione-conto.jsx';

const METRICS = [{ id: 'ebit', label: 'EBIT', unit: 'k€', k: 1000 }, { id: 'mc2', label: 'MdC II', unit: 'k€', k: 1000 }, { id: 'revenue', label: 'Ricavi', unit: 'k€', k: 1000 }, { id: 'tonnes', label: 'Tonnellate', unit: 't', k: 1 }];
const LAND_KEY = { ebit: 'ebit', mc2: 'mc2', revenue: 'rev', tonnes: 't' };

/** Variazione rispetto al budget: chip verde o rosso (per i costi fissi meno è meglio). */
function Var({ act, bud, good = 'up', pctMode = true }) {
  if (act == null || bud == null || !Number.isFinite(act) || !Number.isFinite(bud) || Math.abs(bud) < 1e-9) return null;
  const dv = act - bud;
  const txt = pctMode ? sf(dv / Math.abs(bud) * 100, 1) + '%' : sf(dv / 1000, 1) + ' k€';
  const cls = Math.abs(dv / Math.abs(bud)) < 0.005 ? '' : (good === 'up') === dv > 0 ? 'good' : 'bad';
  return <span className={`dz-var ${cls}`}>{txt}</span>;
}

/** Testo libero in una finestra di conferma (nome di chi approva, note). */
function PromptBody({ label, init = '', box, hint }) {
  const [v, setV] = useState(init);
  return <Field label={label} hint={hint}><input className="input" autoFocus value={v} onChange={e => { setV(e.target.value); box.current = e.target.value; }} /></Field>;
}

export function Budget({ d }) {
  const dir = useDir(d);
  const { ctx, today } = dir;
  const curYear = +today.slice(0, 4);
  const [year, setYear] = useState(dir.year);
  const [verSel, setVerSel] = useState(null);
  const [metric, setMetric] = useState('ebit');
  const [wiz, setWiz] = useState(null); // {year, version, mode}
  const name = useRef('');
  const versions = budgetVersions(d, year);
  const active = activeVersion(d, year);
  const version = verSel && versions.includes(verSel) ? verSel : active;
  const st = versionStatus(d, year, version);
  const locked = isLocked(d, year, version);
  const superseded = locked && version !== active;
  const has = hasBudget(d, year, version);
  const years = [...new Set([curYear - 1, curYear, curYear + 1, ...(d.budget || []).map(r => +String(r.month).slice(0, 4))])].filter(y => y === curYear || hasBudget(d, y)).sort();
  const yP = { from: `${year}-01-01`, to: `${year}-12-31` };
  const bt = useMemo(() => (has ? budgetTotals(d, yP, version) : null), [d, year, version, has]);
  const bva = useMemo(() => (has ? budgetVsActual(d, ctx, year, version) : null), [d, ctx, year, version, has]);
  const L = useMemo(() => (has && year === curYear ? landing(d, ctx, year, version) : null), [d, ctx, year, version, has, curYear]);
  const openWiz = (y, mode) => setWiz({ year: y, version: mode === 'revisione' ? nextRevision(d, y) : (mode === 'rigenera' ? version : 'B'), mode });
  const approve = (keep = false) => {
    if (!keep) name.current = getPrefs().role === 'direzione' ? 'Direzione' : '';
    confirm(`Approvare il budget ${year} (versione ${version})?`, <>
      <p>La versione approvata diventa il riferimento dei confronti «vs budget» e della stima di chiusura, e non si può più rigenerare: per cambiarla si crea una revisione.{active !== version && isLocked(d, year, active) ? ` La versione ${active}, oggi di riferimento, resta nello storico come superata.` : ''}</p>
      <PromptBody label="Approvato da" init={name.current} box={name} hint="Nome e ruolo di chi approva (resta nel registro delle modifiche)" />
    </>, () => {
      const by = String(name.current || '').trim();
      if (!by) { toast('Indica chi approva il budget', 'err'); approve(true); return; }
      if (store.batch(approveBudgetOps(d, year, version, by, today), `Budget ${year} versione ${version} approvato da ${by}`) !== false)
        toast(`Budget ${year} (versione ${version}) approvato: è il nuovo riferimento`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    }, { ok: 'Approva' });
  };
  const head = (
    <div className="dz-tools">
      <span className="lbl">Anno</span>
      <Seg label="Anno del budget" value={String(year)} onChange={v => { setYear(+v); setVerSel(null); }} options={years.map(y => ({ id: String(y), label: String(y) }))} />
      {versions.length > 1 && <><span className="lbl">Versione</span><Select className="slim" ariaLabel="Versione" value={version} onChange={setVerSel} options={versions.map(v => ({ id: v, label: `${v}${v === active ? ' · riferimento' : ''}${isLocked(d, year, v) ? (v === active ? ' · approvata' : ' · superata') : ' · bozza'}` }))} /></>}
      {has && (locked
        ? <Chip kind={superseded ? 'outline' : 'good'} icon={LuLock} title={`Approvato il ${dateIt(st.approvedAt)} da ${st.approvedBy}${st.supersededAt ? ` · superato il ${dateIt(st.supersededAt)}` : ''}`}>{superseded ? 'approvato · superato' : `approvato · ${st.approvedBy}`}</Chip>
        : <Chip kind="maize" title={version !== active ? `I confronti usano ancora la versione ${active}` : undefined}>bozza{version !== active ? ` · riferimento ${active}` : ''}</Chip>)}
      <span className="sp" />
      {!hasBudget(d, curYear + 1) && <Btn small kind={year === curYear + 1 ? 'primary' : ''} icon={LuPlus} onClick={() => openWiz(curYear + 1, 'nuovo')}>Crea budget {curYear + 1}</Btn>}
      {has && !locked && <Btn small icon={LuRotateCcw} onClick={() => openWiz(year, 'rigenera')} title="Ricalcola questa versione con nuove ipotesi">Rigenera</Btn>}
      {has && <Btn small icon={LuGitBranch} onClick={() => openWiz(year, 'revisione')} title="Nuova versione del budget dell’anno, con ipotesi aggiornate">Revisione</Btn>}
      {has && !locked && <Btn small kind="primary" icon={LuStamp} onClick={() => approve()}>Approva</Btn>}
    </div>
  );
  const wizard = wiz && <BudgetWizard d={d} ctx={ctx} today={today} {...wiz} basedOn={wiz.mode === 'revisione' ? version : null} onClose={() => setWiz(null)} onSaved={(y, v) => { setYear(y); setVerSel(v || null); }} />;
  if (!has) return (
    <>
      {head}
      <Panel title={`Budget ${year}`}>
        <Empty title={`Nessun budget per il ${year}`}>
          <p>Il budget parte dai volumi dello stesso mese degli ultimi 12 mesi per prodotto, dal listino di oggi con lo sconto realizzato negli ultimi 90 giorni, dai costi di oggi di materie prime ed energia e dai costi fissi per centro dell’anno prima. Ogni ipotesi si regola prima di salvare.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}><Btn kind="primary" icon={LuPlus} onClick={() => openWiz(year, 'nuovo')} disabled={!(d.shipments || []).length && !(d.salesHistory || []).length}>Crea budget {year}</Btn></div>
          {!(d.shipments || []).length && !(d.salesHistory || []).length && <p className="small" style={{ marginTop: 8 }}>Servono prima le consegne (o lo storico mensile) da cui partire: Dati › Importa.</p>}
        </Empty>
      </Panel>
      {wizard}
    </>
  );
  const M = METRICS.find(m => m.id === metric);
  const lm = Object.fromEntries((L?.byMonth || []).map(x => [x.month, x]));
  const cols = bva.months.map(m => {
    const f = lm[m.month];
    const act = m.act ? m.act[metric] : null;
    const fc = f ? (m.act ? m.act[metric] : 0) + f[LAND_KEY[metric]] : null; // mese in corso: consuntivo a oggi + previsione del resto
    const isOpen = m.open, future = !m.act;
    const bars = [{ key: 'bud', label: 'Budget', value: m.bud[metric] / M.k, color: 'var(--ink-2)', outline: true }];
    if (isOpen && f) bars.push({ key: 'fc', label: 'Consuntivo + previsione', value: fc / M.k, color: 'var(--s1)', hatch: true });
    else if (future && f) bars.push({ key: 'fc', label: 'Previsione', value: f[LAND_KEY[metric]] / M.k, color: 'var(--s1)', hatch: true });
    else if (act != null) bars.push({ key: 'act', label: 'Consuntivo', value: act / M.k, color: 'var(--s1)' });
    return { key: m.month, label: monthLabel(m.month).split(' ')[0], title: monthLabel(m.month, false), bars, note: isOpen ? 'in corso' : future && f ? 'previsione' : null, m, f };
  });
  const fmtM = v => (metric === 'tonnes' ? nf(v) + ' t' : eurTxt(v));
  const tip = c => [
    { label: 'Budget', value: fmtM(c.m.bud[metric]), color: 'var(--ink-2)' },
    c.m.act && { label: c.m.open ? 'Consuntivo a oggi' : 'Consuntivo', value: fmtM(c.m.act[metric]), color: 'var(--s1)' },
    c.f && { label: c.m.open ? 'Previsione resto del mese' : 'Previsione (stimata)', value: fmtM(c.f[LAND_KEY[metric]]), color: 'var(--s1)' },
  ].filter(Boolean);
  const exportCsv = () => {
    const rows = bva.months;
    const colsCsv = [{ label: 'Mese', value: r => r.month }];
    for (const k of ['tonnes', 'revenue', 'mc2', 'fixed', 'ebit']) colsCsv.push({ label: `${k} consuntivo`, value: r => (r.act ? Math.round(r.act[k] * 100) / 100 : null) }, { label: `${k} budget`, value: r => Math.round(r.bud[k] * 100) / 100 });
    download(`budget-${year}-${version}-${stamp()}.csv`, toCSV(rows, colsCsv), 'text/csv;charset=utf-8');
  };
  const ytd = bva.ytd;
  const cell = (k, good = 'up') => ({
    key: k, align: 'r', sort: r => r.act?.[k] ?? r.est?.[k] ?? null,
    render: r => <>{r.act ? <b>{k === 'tonnes' ? nf(r.act[k]) : kEur(r.act[k], 0)}</b> : r.est ? <span className="muted" title="Previsione (stimata)">{k === 'tonnes' ? nf(r.est[k]) : kEur(r.est[k], 0)}*</span> : <span className="muted">—</span>}
      {r.act && !r.open && <Var act={r.act[k]} bud={r.bud[k]} good={good} />}<span className="sub">budget {k === 'tonnes' ? nf(r.bud[k]) : kEur(r.bud[k], 0)}</span></>,
  });
  const tableRows = bva.months.map(m => ({ ...m, id: m.month, est: !m.act && lm[m.month] ? { tonnes: lm[m.month].t, revenue: lm[m.month].rev, mc2: lm[m.month].mc2, fixed: lm[m.month].fixed, ebit: lm[m.month].ebit } : null }));
  const gapBad = L && L.gap != null && L.gap < 0;
  return (
    <>
      {head}
      <div className="kpis">
        <Kpi label={`EBIT a budget ${year}`} {...money(bt.ebit)} foot={`MdC II ${nf(bt.tonnes ? bt.mc2 / bt.tonnes : null, 1)} €/t · ${nf(bt.tonnes)} t · fissi ${eurTxt(bt.fixed)}`} />
        <Kpi label="EBIT da inizio anno" {...money(ytd.act.ebit)} cmp={{ cur: ytd.act.ebit, value: ytd.bud.ebit, kind: 'flow', good: 'up', label: 'budget' }} foot={year === curYear ? `a oggi · budget pro quota ${eurTxt(ytd.bud.ebit)}` : `budget ${eurTxt(ytd.bud.ebit)}`} />
        {L && <Kpi label={<Def text="EBIT da inizio anno + MdC II previsto per il resto dell’anno (previsione settimanale per prodotto × margine unitario a prezzi netti degli ultimi 90 giorni e costi di oggi) − costi fissi del resto dell’anno. Banda P10–P90 approssimata: somma dei limiti dei prodotti.">Stima di chiusura</Def>}
          {...money(L.landing)} status={L.budgetEbit == null ? null : L.landing >= L.budgetEbit ? 'ok' : L.landing >= L.budgetEbit * 0.9 ? 'warn' : 'bad'}
          foot={`P10–P90 ${kEur(L.p10, 0)} – ${kEur(L.p90, 0)} · approssimata`} cmp={L.budgetEbit != null ? { cur: L.landing, value: L.budgetEbit, kind: 'flow', good: 'up', label: 'budget' } : undefined} />}
        {L && L.gap != null && <Kpi label={<Def text="Differenza tra stima di chiusura e budget, divisa per i mesi che restano: quanto EBIT in più (o in meno) serve ogni mese per arrivare al budget.">Gap per mese</Def>} {...money(-L.gapPerMonth)} status={gapBad ? 'bad' : 'ok'}
          foot={gapBad ? `da recuperare in ${nf(L.restMonths, 1)} mesi` : `di margine sul budget in ${nf(L.restMonths, 1)} mesi`} />}
        {L && L.requiredPerT != null && <Kpi label={<Def text="Gap totale diviso per le tonnellate previste nel resto dell’anno: aumento del MdC per tonnellata necessario per chiudere a budget.">€/t necessari</Def>} value={nf(Math.max(0, L.requiredPerT), 1)} unit="€/t"
          status={L.requiredPerT > 0 ? 'bad' : 'ok'} foot={`in più sulle ${nf(L.restT)} t previste (stimate)`} />}
      </div>
      <Panel title={`Budget e consuntivo ${year} per mese`} sub={`Versione ${version}${st?.approvedAt && locked ? `, approvata il ${dateIt(st.approvedAt)}` : ''} · barre vuote: budget; piene: consuntivo; tratteggiate: previsione dei mesi rimanenti (stimata)`}
        actions={<Seg label="Misura" value={metric} onChange={setMetric} options={METRICS.map(m => ({ id: m.id, label: m.label }))} />}>
        <MonthBars cols={cols} height={240} unit={M.unit} decimals={0} tip={tip} ariaLabel={`${M.label} a budget e a consuntivo per mese`}
          legend={[{ label: 'Budget', color: 'var(--ink-2)', outline: true }, { label: 'Consuntivo', color: 'var(--s1)' }, { label: 'Previsione (stimata)', color: 'var(--s1)', hatch: true }]} />
      </Panel>
      <Panel title="Mese per mese" sub="Consuntivo (o previsione*, stimata) con lo scostamento dal budget; i mesi chiusi usano i numeri congelati" flush
        actions={<Btn small kind="ghost" icon={LuDownload} onClick={exportCsv}>CSV</Btn>}>
        <Table rows={tableRows} pageSize={12} rowKey={r => r.id} cols={[
          { key: 'month', label: 'Mese', render: r => <><b>{monthLabel(r.month, false)}</b>{r.open ? <span className="sub">in corso</span> : r.frozen ? <span className="sub">chiuso</span> : r.est ? <span className="sub">previsione</span> : null}</> },
          { label: 'Tonnellate', ...cell('tonnes') }, { label: 'Ricavi netti', ...cell('revenue') }, { label: 'MdC II', ...cell('mc2') }, { label: 'Costi fissi', ...cell('fixed', 'down') }, { label: 'EBIT', ...cell('ebit') },
        ]} foot={<>
          <td><b>Da inizio anno</b></td>
          {['tonnes', 'revenue', 'mc2', 'fixed', 'ebit'].map(k => <td key={k} className="r">{k === 'tonnes' ? nf(ytd.act[k]) : kEur(ytd.act[k], 0)}<Var act={ytd.act[k]} bud={ytd.bud[k]} good={k === 'fixed' ? 'down' : 'up'} /><span className="sub">budget {k === 'tonnes' ? nf(ytd.bud[k]) : kEur(ytd.bud[k], 0)}</span></td>)}
        </>} />
      </Panel>
      {L && <div className="note">Stima di chiusura: EBIT da inizio anno {eurTxt(L.ebitYtd)} + MdC II previsto da {dateIt(L.restFrom)} a fine anno {eurTxt(L.restMc2)} (su {nf(L.restT)} t) − costi fissi del resto dell’anno {eurTxt(L.restFixed)} = <b>{eurTxt(L.landing)}</b>{L.budgetEbit != null && <> contro {eurTxt(L.budgetEbit)} di budget ({sf(L.gap / 1000, 0)} k€)</>}. <span className="muted">Previsione dei volumi per prodotto sulle consegne settimanali delle ultime 52 settimane; prezzi netti degli ultimi 90 giorni; costi variabili ai prezzi di oggi.</span> <button className="linkish small" onClick={() => go('direzione', 'ponte')}>Scostamenti vs budget →</button></div>}
      {wizard}
    </>
  );
}

const SPEC_RANGE = [-20, 20];
function Slider({ label, value, onChange, min, max, step = 1, unit = '%', disabled }) {
  return (
    <div className="slider">
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>{label}</span><span className="num" style={{ fontWeight: 700 }}>{unit === '%' ? sf(value, step < 1 ? 1 : 0) + '%' : nf(value)}</span></div>
      <input type="range" className="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(+e.target.value)} aria-label={label} />
    </div>
  );
}

/** Creazione e revisione guidata: ipotesi con cursori e anteprima dal vivo del conto economico di budget. */
function BudgetWizard({ d, ctx, today, year, version, mode, basedOn, onClose, onSaved }) {
  const species = [...new Set((d.products || []).filter(p => p.active !== false).map(p => p.species).filter(Boolean))];
  const [o, setO] = useState({ growthPct: {}, listDeltaPct: 2, listFromMonth: 3, mpDeltaPct: 0, fixedInflPct: 2, centerPct: {} });
  const set = patch => setO(s => ({ ...s, ...patch }));
  const seed = useMemo(() => seedBudgetRows(d, ctx, { ...o, year, version }), [d, ctx, o, year, version]);
  const prev = useMemo(() => budgetTotals({ ...d, budget: seed.rows, fixedCosts: seed.fixed }, { from: `${year}-01-01`, to: `${year}-12-31` }, version), [seed, d, year, version]);
  const last12 = useMemo(() => pnlFor(d, ctx, { from: addDays(today, -364), to: today }), [d, ctx, today]);
  const cur = hasBudget(d, year) ? budgetTotals(d, { from: `${year}-01-01`, to: `${year}-12-31` }, activeVersion(d, year)) : null;
  const title = mode === 'revisione' ? `Revisione del budget ${year} (versione ${version})` : mode === 'rigenera' ? `Ricalcolo del budget ${year} (versione ${version})` : `Nuovo budget ${year}`;
  const save = () => {
    if (!seed.rows.length) { toast('Nessun volume da cui partire: servono consegne o storico mensile', 'err'); return; }
    const ops = budgetWriteOps(d, year, version, seed.rows, seed.fixed, { by: getPrefs().role || 'direzione', at: today, basedOn });
    if (!ops) { toast(`La versione ${version} è approvata: per cambiarla crea una revisione`, 'err'); return; }
    const label = `${mode === 'revisione' ? 'Revisione' : mode === 'rigenera' ? 'Ricalcolo' : 'Creazione'} del budget ${year} (versione ${version})`;
    if (store.batch(ops, label) !== false) { toast(`${label}: salvato come bozza`, 'ok', { label: 'Annulla', fn: () => store.undo() }); onSaved?.(year, version); onClose(); }
  };
  const row = (label, v, c, fmt = eurTxt) => [label, <>{fmt(v)}{c != null && <span className="muted"> · {fmt(c)}</span>}</>];
  return (
    <Drawer wide title={title} sub="Budget guidato" onClose={onClose} actions={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" onClick={save} disabled={!seed.rows.length}>Salva come bozza</Btn></>}>
      <div className="dz-preview" aria-live="polite">
        <div className="row between"><b>Anteprima {year}</b><span className="small muted">{cur ? 'nuovo · attuale' : 'nuovo · ultimi 12 mesi'}</span></div>
        {prev ? <Kv items={[
          row('Tonnellate', prev.tonnes, cur ? cur.tonnes : last12?.tonnes, v => nf(v) + ' t'),
          row('Ricavi netti', prev.revenue, cur ? cur.revenue : last12?.revenueNet),
          row('MdC II', prev.mc2, cur ? cur.mc2 : last12?.by.mdc2),
          row('MdC II per t', prev.tonnes ? prev.mc2 / prev.tonnes : null, cur ? (cur.tonnes ? cur.mc2 / cur.tonnes : null) : last12?.tonnes ? last12.by.mdc2 / last12.tonnes : null, v => nf(v, 1) + ' €/t'),
          row('Costi fissi', prev.fixed, cur ? cur.fixed : last12?.fixedTotal),
          row('EBIT', prev.ebit, cur ? cur.ebit : last12?.by.ebit),
        ]} /> : <p className="small muted">Nessun volume di partenza.</p>}
      </div>
      <div className="dz-cols2">
        <div className="dz-sliders">
          <div className="eyebrow">Volumi per specie (crescita sullo stesso mese degli ultimi 12 mesi)</div>
          {species.map(s => <Slider key={s} label={SPECIES[s]?.name || s} value={o.growthPct[s] || 0} min={SPEC_RANGE[0]} max={SPEC_RANGE[1]} onChange={v => set({ growthPct: { ...o.growthPct, [s]: v } })} />)}
        </div>
        <div className="dz-sliders">
          <div className="eyebrow">Prezzi e costi variabili</div>
          <Slider label="Listino" value={o.listDeltaPct} min={-10} max={10} step={0.5} onChange={v => set({ listDeltaPct: v })} />
          <Field label="Aumento di listino dal mese"><Select value={String(o.listFromMonth)} onChange={v => set({ listFromMonth: +v })} options={Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), label: monthLabel(`${year}-${String(i + 1).padStart(2, '0')}`, false) }))} /></Field>
          <Slider label="Prezzo delle materie prime" value={o.mpDeltaPct} min={-20} max={20} step={0.5} onChange={v => set({ mpDeltaPct: v })} />
          <div className="eyebrow" style={{ marginTop: 6 }}>Costi fissi (sullo stesso mese dell’anno prima)</div>
          <Slider label="Inflazione di base" value={o.fixedInflPct} min={-5} max={10} step={0.5} onChange={v => set({ fixedInflPct: v })} />
          {(d.costCenters || []).map(c => <Slider key={c.id} label={c.name} value={o.centerPct[c.id] ?? o.fixedInflPct} min={-20} max={20} step={0.5} onChange={v => set({ centerPct: { ...o.centerPct, [c.id]: v } })} />)}
        </div>
      </div>
      <p className="small muted">Prezzo = listino di oggi × (1 − sconto realizzato negli ultimi 90 giorni){o.listDeltaPct ? ` × (1 ${o.listDeltaPct > 0 ? '+' : '−'} ${nf(Math.abs(o.listDeltaPct), 1)}% da ${monthLabel(`${year}-${String(o.listFromMonth).padStart(2, '0')}`, false)})` : ''}. Materie prime ed energia ai costi di oggi; provvigioni alla percentuale media degli ultimi 12 mesi. Il salvataggio sostituisce le righe della versione {version} e i costi fissi di budget del {year} in un solo passo: si annulla con Ctrl+Z.</p>
    </Drawer>
  );
}
