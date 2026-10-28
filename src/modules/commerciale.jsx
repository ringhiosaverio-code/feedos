/* FeedOS 17 · Commerciale: clienti con il margine effettivo del periodo, offerte con scadenza, deroghe ed esito strutturato,
 * listini con data di decorrenza, prezzo netto realizzato e simulatore di revisione, visite che diventano attività,
 * agenti con prestazioni, schemi provvigionali ed estratto conto trimestrale. Tutte le schede seguono il periodo globale;
 * nella vista Agente con un agente scelto mostrano solo il suo portafoglio (filtro di comodità, non una protezione dei dati). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuPlus, LuSend, LuCheck, LuX, LuDownload, LuSparkles, LuTriangleAlert, LuUsers, LuPrinter, LuRefreshCw, LuTags, LuCalendarClock, LuFileText, LuUserRound, LuHandshake, LuMapPin } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, signals, costs, customerStats, volumes, ctxOf } from '../core/derived.js';
import { usePrefs } from '../core/prefs.js';
import { nextCode } from '../core/codes.js';
import { nf, sf, sum, dateIt, addDays, daysBetween, mean, round, relDays, uid, addMonths } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { PM_LABEL, pm, pmDec, nfPm, fmtPm, up, upIn, upDec, upStep, fmtUp, cellUp, colUp, upLabel, SMALL_UNITS } from '../core/units.js';
import { offerCheck } from '../engine/costing.js';
import { listAt } from '../engine/actuals.js';
import { SPECIES } from '../engine/nutrients.js';
import {
  offerState, offerAgent, offerValue, decidedOn, OPEN_STATES, OFFER_STATES, LOSS_REASONS, lossLabel, winStats, pipeline, funnel, lossBreakdown,
  authorizedDiscount, priceHistory, listOn, newPriceListOps, bulkRevisionOps, syncListOps, priceListRows, pocketWaterfall, revisionSim, realization,
  hasNextAction, probOf,
} from '../engine/pricing.js';
import { statement, agentPerformance, quartersIn, lastClosedQuarter, quarterRange, schemeOf, commissionTotals } from '../engine/commissions.js';
import { creditSummary } from '../engine/credit.js';
import { abcCustomers } from '../engine/profitability.js';
import { usePeriod } from '../ui/period.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, confirm, Seg, Kv, useWidth } from '../ui/ui.jsx';
import { Bars, Legend, Waterfall, SERIES } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';

export const OCHECK = { ok: { kind: 'good', label: 'margine obiettivo' }, 'sotto-obiettivo': { kind: 'warn', label: 'sotto l’obiettivo' }, 'sotto-minimo': { kind: 'crit', label: 'sotto il minimo' } };
const ABC_KIND = { A: 'accent', B: '', C: 'outline' };
const RISK_KIND = { A: 'good', B: '', C: 'warn', D: 'crit' };
const agentColor = (d, id) => SERIES[Math.max(0, (d.agents || []).findIndex(a => a.id === id)) % SERIES.length];
const round5 = v => Math.round(v / 5) * 5, ceil5 = v => Math.ceil(v / 5) * 5;
const stop = fn => e => { e.stopPropagation(); fn(); };
const pctTxt = (v, dd = 1) => (v == null || !Number.isFinite(v) ? '—' : nf(v * 100, dd) + '%');
const kEur = v => (v == null ? '—' : nf(v / 1000, Math.abs(v) < 10000 ? 1 : 0));
/** Confronto per Kpi: solo con un periodo C reale (il budget non ha valori commerciali). */
const cmpOf = (C, cov, cur, value, o = {}) => (C && !C.budget && value != null && cur != null ? { cur, value, kind: 'flow', good: 'up', label: C.short, cov, ...o } : undefined);

/** Agente della vista: solo col ruolo agente e un agente scelto nella testata (prefs.agentId). */
export function useAgentScope(d) {
  const role = usePrefs(p => p.role), agentId = usePrefs(p => p.agentId);
  const agent = role === 'agente' && agentId ? (d.agents || []).find(a => a.id === agentId) : null;
  return { agentId: agent?.id || null, agent };
}
/** Crediti per cliente (pacchetto finanza); con lo stub o un errore restituisce un oggetto vuoto. */
export function useCredit(d) {
  const today = appToday(d);
  return useMemo(() => { try { return creditSummary(d, today) || {}; } catch { return {}; } }, [d.invoices, d.payments, d.shipments, d.customers, d.offers, d.settings?.finance, today]);
}

export function Commerciale({ route }) {
  const d = useData();
  const tab = route.tab || 'clienti';
  const per = usePeriod(d);
  const { agentId, agent } = useAgentScope(d);
  return (
    <>
      <PageHead title="Commerciale" lead="Clienti con il margine del periodo al costo effettivo dei lotti consegnati (dopo le provvigioni), offerte con scadenza, deroghe ed esito, listini con data di decorrenza e prezzo netto realizzato, visite che diventano attività, agenti e provvigioni con estratto conto."
        actions={<Btn kind="primary" icon={LuPlus} onClick={() => go('commerciale', 'offerte', 'nuova')}>Nuova offerta</Btn>}
        tabs={NAV.commerciale.tabs} tab={tab} onTab={t => go('commerciale', t)} />
      {agent && <div className="note com-scope" role="status"><LuUserRound aria-hidden="true" /> <span>Vista di <b>{agent.name}</b>: clienti, offerte, visite e provvigioni del suo portafoglio. È un filtro di comodità della vista Agente, non una protezione dei dati.</span></div>}
      {tab === 'clienti' && <Clienti d={d} sel={route.id} per={per} scope={agentId} />}
      {tab === 'offerte' && <Offerte d={d} sel={route.id} per={per} scope={agentId} />}
      {tab === 'listino' && <Listino d={d} per={per} scope={agentId} />}
      {tab === 'visite' && <Visite d={d} sel={route.id} per={per} scope={agentId} />}
      {tab === 'rete' && <Rete d={d} sel={route.id} per={per} scope={agentId} />}
    </>
  );
}

/** Finestra di dialogo con convalida (Esc chiude, il pulsante di conferma resta spento finché i dati non bastano). */
export function Dialog({ title, children, onClose, onOk, ok = 'Conferma', okDisabled, danger, hint }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    box.current?.querySelector('input, select, textarea, button.chip')?.focus();
    const k = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true); // in cattura: la scheda laterale sotto non riceve Esc
    return () => { window.removeEventListener('keydown', k, true); try { if (prev && document.contains(prev)) prev.focus?.(); } catch { /* ignora */ } };
  }, []);
  return createPortal(
    <>
      <div className="scrim com-top" onClick={onClose} />
      <div className="modal com-dialog" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="hd"><h3>{title}</h3></div>
        <div className="bd">{children}</div>
        <div className="ft">
          {hint && <span className="small muted sp">{hint}</span>}
          <Btn onClick={onClose}>Annulla</Btn>
          <Btn kind={danger ? 'danger' : 'primary'} disabled={okDisabled} onClick={onOk}>{ok}</Btn>
        </div>
      </div>
    </>, document.body);
}

/* ---------------- clienti ---------------- */
function useCustomerRows(d, P, C, scope) {
  const S = customerStats(d, P), SC = C && !C.budget ? customerStats(d, C) : null; const I = idx(d);
  return useMemo(() => (d.customers || []).filter(c => !scope || c.agentId === scope).map(c => {
    const s = S[c.id] || {}, sc = SC?.[c.id];
    return {
      ...c, ...s, agent: I.agent[c.agentId]?.name, marginT: s.tonnes ? s.margin / s.tonnes : null,
      tonnesC: sc ? sc.tonnes : null, marginC: sc ? sc.margin : null, servedC: !!sc?.tonnes,
      trend: sc?.tonnes > 0 ? (s.tonnes || 0) / sc.tonnes - 1 : null, idle: s.lastInP ? daysBetween(s.lastInP, P.to) : null,
    };
  }), [S, SC, d.customers, I, scope, P.to]);
}
/** ABC per ricavi del periodo (A fino all'80% cumulato, B fino al 95%): ripiego quando la redditività non lo fornisce. */
function localAbc(rows) {
  const s = rows.filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue), tot = sum(s, r => r.revenue);
  const out = {}; let acc = 0;
  for (const r of s) { out[r.id] = acc / tot < 0.8 ? 'A' : acc / tot < 0.95 ? 'B' : 'C'; acc += r.revenue; }
  return out;
}

function Clienti({ d, sel, per, scope }) {
  const { P, C, cov } = per;
  const rows = useCustomerRows(d, P, C, scope); const today = appToday(d); const ctx = ctxOf(d);
  const credit = useCredit(d), byCredit = credit.byCustomer || {}, hasCredit = Object.keys(byCredit).length > 0;
  const abc = useMemo(() => { try { return abcCustomers(d, ctx, P) || {}; } catch { return {}; } }, [ctx, P.key, d.customers]);
  const local = useMemo(() => localAbc(rows), [rows]);
  const [q, setQ] = useState(''), [agent, setAgent] = useState('');
  useEffect(() => { if (sel && (d.customers || []).some(c => c.id === sel)) openDrawer('customer', sel); }, [sel]);
  if (!(d.customers || []).length) return <Panel title="Clienti"><Empty icon={LuUsers} title="Nessun cliente in archivio">Aggiungi i clienti da Dati › Anagrafiche o importali da un file CSV: margini, offerte, visite e provvigioni partono da lì.</Empty></Panel>;
  const abcOf = id => abc[id]?.abcRev ?? local[id] ?? null;
  const view = filterRows(rows.filter(r => !agent || r.agentId === agent), q, ['name', 'city', 'province', 'agent', 'code']);
  const served = rows.filter(r => r.tonnes > 0), servedC = rows.filter(r => r.servedC);
  const T = sum(rows, r => r.tonnes || 0), TC = sum(rows, r => r.tonnesC || 0), M = sum(rows, r => r.margin || 0), MC = sum(rows, r => r.marginC || 0);
  const idle = rows.filter(r => r.idle != null && r.idle > 30);
  const sigs = signals(d).filter(s => s.area === 'commerciale' && s.link?.tab === 'clienti' && (!scope || s.agentId === scope));
  return (
    <>
      <div className="kpis">
        <Kpi label="Clienti serviti" value={served.length} cmp={cmpOf(C, cov, served.length, C ? servedC.length : null)} foot={`su ${rows.length} in ${scope ? 'portafoglio' : 'anagrafica'} · ${P.short}`} title="Clienti con almeno una consegna nel periodo" />
        <Kpi label="Consegnato" value={nf(T)} unit="t" cmp={cmpOf(C, cov, T, C ? TC : null)} foot={`${nf(sum(rows, r => r.revenue || 0) / 1e6, 2)} M€ di ricavi`} />
        <Kpi label="Margine medio" value={T ? nfPm(M / T, 1) : '—'} unit={PM_LABEL} cmp={cmpOf(C, cov, T ? pm(M / T) : null, TC ? pm(MC / TC) : null, { kind: 'ratio', unit: PM_LABEL })} foot="costo effettivo, dopo le provvigioni"
          title="Σ (ricavi − costo pieno effettivo dei lotti consegnati − provvigioni) / Σ t: materie prime dei lotti ai prezzi d’acquisto, energia misurata, trasformazione, imballo e logistica standard" />
        <Kpi label="Fermi da oltre 30 giorni" value={idle.length} status={idle.length ? 'warn' : null} foot="hanno comprato nel periodo, non negli ultimi 30 giorni" title={`Ultima consegna nel periodo prima del ${dateIt(addDays(P.to, -30), 'dm')}`} />
      </div>
      {sigs.length > 0 && <Panel title="Clienti da richiamare" flush><SignalList items={sigs} limit={3} /></Panel>}
      <div className="split r">
        <Panel title="Sul territorio" sub={`Colore = agente, dimensione = tonnellate (${P.short})`} id="com-map">
          <CustomerMap d={d} rows={rows} onPick={c => openDrawer('customer', c.id)} agent={agent} />
          {!scope && <Legend items={(d.agents || []).map(a => ({ label: a.name, color: agentColor(d, a.id) }))} />}
        </Panel>
        <Panel title="Clienti" sub="Margine al costo effettivo del periodo, dopo le provvigioni · clic per la scheda" flush
          actions={<>{!scope && <select className="select com-agent" value={agent} onChange={e => setAgent(e.target.value)} aria-label="Agente"><option value="">Tutti gli agenti</option>{(d.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}<SearchBox value={q} onChange={setQ} placeholder="Cliente o comune" id="cust-search" /></>}>
          <Table rows={view} selected={sel} onRow={c => openDrawer('customer', c.id)} initialSort={{ key: 'tonnes', dir: 'desc' }} pageSize={25} exportName="clienti" cols={[
            { key: 'name', label: 'Cliente', csv: c => c.name, render: c => <><b>{c.name}</b>{abcOf(c.id) && <Chip kind={ABC_KIND[abcOf(c.id)]} title={`Classe ${abcOf(c.id)} per ricavi del periodo`}>{abcOf(c.id)}</Chip>}<span className="sub">{c.city} ({c.province}) · {c.type}</span></> },
            { key: 'abc', label: 'ABC', sort: c => abcOf(c.id) || 'Z', csv: c => abcOf(c.id), render: c => abcOf(c.id) || '—', className: 'hide-col' },
            { key: 'tonnes', label: 't nel periodo', align: 'r', csv: c => c.tonnes || 0, render: c => nf(c.tonnes || 0) },
            { key: 'trend', label: C && !C.budget ? `vs ${C.short}` : 'Tendenza', align: 'r', csv: c => c.trend, render: c => c.trend == null ? '—' : <span className={c.trend < -0.25 ? 'chip warn' : ''}>{sf(c.trend * 100)}%</span> },
            { key: 'marginT', label: `Margine ${PM_LABEL}`, align: 'r', csv: c => pm(c.marginT), render: c => c.marginT == null ? '—' : <span className={c.marginT < 0 ? 'chip crit' : ''}>{nfPm(c.marginT, 1)}</span> },
            ...(hasCredit ? [{ key: 'risk', label: 'Credito', sort: c => byCredit[c.id]?.riskClass || 'Z', csv: c => byCredit[c.id]?.riskClass, render: c => { const r = byCredit[c.id]; return r?.riskClass ? <Chip kind={RISK_KIND[r.riskClass]} title={`Classe di rischio ${r.riskClass}${r.util != null ? ` · fido usato ${pctTxt(r.util, 0)}` : ''}${r.overdue ? ` · scaduto ${nf(r.overdue)} €` : ''}`}>{r.riskClass}</Chip> : '—'; } }] : []),
            { key: 'idle', label: 'Ultima consegna', align: 'r', sort: c => c.last, csv: c => c.last, render: c => c.last ? <span className={c.idle > 30 ? 'chip warn' : ''}>{relDays(c.last, today)}</span> : '—' },
            ...(scope ? [] : [{ key: 'agent', label: 'Agente' }]),
          ]} />
        </Panel>
      </div>
    </>
  );
}

function CustomerMap({ d, rows, onPick, agent }) {
  const box = useRef(null); const W = useWidth(box, 420);
  const [hover, setHover] = useState(null);
  const pts = rows.filter(r => r.lat != null && r.lon != null);
  if (!pts.length) return <Empty icon={LuMapPin} title="Nessuna coordinata">Le posizioni arrivano da latitudine e longitudine del comune in anagrafica.</Empty>;
  const lat0 = Math.min(...pts.map(p => p.lat)) - 0.1, lat1 = Math.max(...pts.map(p => p.lat)) + 0.1;
  const lon0 = Math.min(...pts.map(p => p.lon)) - 0.1, lon1 = Math.max(...pts.map(p => p.lon)) + 0.1;
  const k = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
  const H = Math.min(560, Math.max(300, W * (lat1 - lat0) / ((lon1 - lon0) * k)));
  const sx = (W - 20) / ((lon1 - lon0) * k), sy = (H - 20) / (lat1 - lat0), s = Math.min(sx, sy);
  const x = lon => 10 + (lon - lon0) * k * s, y = lat => 10 + (lat1 - lat) * s;
  const tmax = Math.max(...pts.map(p => p.tonnes || 0), 1);
  const r = t => 3 + 9 * Math.sqrt((t || 0) / tmax);
  const provs = {};
  for (const p of pts) (provs[p.province] ||= []).push(p);
  const h = hover != null ? pts[hover] : null;
  const quiet = p => !p.tonnes || p.idle > 30;
  return (
    <div className="chart map" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mappa schematica dei clienti" style={{ height: H }}>
        <g className="grid">{Array.from({ length: 7 }, (_, i) => lat0 + (lat1 - lat0) * i / 6).map(v => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} />)}</g>
        {Object.entries(provs).map(([pv, ps]) => { const cx = mean(ps.map(p => x(p.lon))), top = Math.min(...ps.map(p => y(p.lat) - r(p.tonnes))); return <text key={pv} x={cx} y={Math.max(12, top - 6)} textAnchor="middle" className="prov">{pv}</text>; })}
        {pts.map((p, i) => (
          <g key={p.id} onPointerEnter={() => setHover(i)} onClick={() => onPick(p)} style={{ cursor: 'pointer' }} opacity={!agent || p.agentId === agent ? 1 : 0.18}>
            <circle cx={x(p.lon)} cy={y(p.lat)} r={r(p.tonnes) + 5} className="hit" />
            <circle cx={x(p.lon)} cy={y(p.lat)} r={r(p.tonnes)} fill={agentColor(d, p.agentId)} fillOpacity={quiet(p) ? 0.25 : 0.75} stroke={quiet(p) ? agentColor(d, p.agentId) : 'var(--surface)'} strokeWidth={quiet(p) ? 2 : 1.2} />
          </g>
        ))}
      </svg>
      {h && <div className="tip" style={{ left: Math.min(Math.max(x(h.lon), 90), W - 90), top: y(h.lat) - r(h.tonnes) - 6 }}><b>{h.name}</b><div className="small">{h.city} · {nf(h.tonnes || 0)} t · {h.marginT != null ? fmtPm(h.marginT, 1) : '—'}</div>{h.idle > 30 && <div className="small">nessuna consegna negli ultimi {h.idle} giorni del periodo</div>}</div>}
      <p className="xs muted" style={{ margin: '6px 0 0' }}>Posizioni dei comuni (coordinate approssimate), senza base cartografica · cerchio vuoto = nessuna consegna negli ultimi 30 giorni del periodo.</p>
    </div>
  );
}

/* ---------------- offerte ---------------- */
function Offerte({ d, sel, per, scope }) {
  const { P, C, cov } = per;
  const I = idx(d); const Cc = costs(d); const today = appToday(d);
  const isNew = sel === 'nuova' || String(sel || '').startsWith('nuova.');
  const prefill = isNew && sel.startsWith('nuova.') ? sel.slice(6) : null;
  const [st, setSt] = useState('aperte');
  const [dlg, setDlg] = useState(null);
  useEffect(() => { if (sel && !isNew && (d.offers || []).some(o => o.id === sel)) openDrawer('offer', sel); }, [sel]);
  const all = useMemo(() => (d.offers || []).filter(o => !scope || offerAgent(d, o, I.cust[o.customerId]) === scope).map(o => {
    const p = I.prod[o.productId], c = Cc[o.productId];
    return { ...o, state: offerState(o, today), chk: p && c ? offerCheck(o, c, p) : null, cname: I.cust[o.customerId]?.name, pname: p?.name, value: offerValue(o), decided: decidedOn(o) };
  }), [d.offers, I, Cc, today, scope]);
  const open = all.filter(o => OPEN_STATES.includes(o.state)), expired = all.filter(o => o.state === 'scaduta');
  const inPd = o => o.decided >= P.from && o.decided <= P.to;
  const rows = all.filter(o => st === 'tutte' || (st === 'aperte' ? OPEN_STATES.includes(o.state) : st === 'scadute' ? o.state === 'scaduta' : o.state === st && inPd(o)));
  const W = winStats(d, P, { agentId: scope }), WC = C && !C.budget ? winStats(d, C, { agentId: scope }) : null;
  const pipe = pipeline(d, today, { agentId: scope }), prob = probOf(d);
  const belowMin = open.filter(o => o.chk?.status === 'sotto-minimo');
  const losses = lossBreakdown(d, P, { agentId: scope });
  const soon = open.filter(o => o.validUntil && o.validUntil <= addDays(today, 7)).sort((a, b) => (a.validUntil < b.validUntil ? -1 : 1));
  const accept = o => { store.update('offers', o.id, { status: 'accettata', decidedAt: today }, `Offerta ${o.code}: accettata`); toast(`Offerta ${o.code} accettata`, 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const send = o => { store.update('offers', o.id, { status: 'inviata', sentAt: today }, `Offerta ${o.code}: inviata`); toast(`Offerta ${o.code} inviata`, 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const actions = o => o.state === 'scaduta'
    ? <span className="com-act"><Btn small icon={LuRefreshCw} onClick={stop(() => setDlg({ kind: 'renew', o }))}>Rinnova</Btn><Btn small kind="ghost" onClick={stop(() => setDlg({ kind: 'lose', o }))}>Chiudi come persa</Btn></span>
    : OPEN_STATES.includes(o.state)
      ? <span className="com-act">{o.state === 'bozza' ? <Btn small icon={LuSend} onClick={stop(() => send(o))}>Inviata</Btn> : <Btn small icon={LuCheck} onClick={stop(() => accept(o))}>Accettata</Btn>}<Btn small kind="ghost" onClick={stop(() => setDlg({ kind: 'lose', o }))}>Persa</Btn></span>
      : <span className="small muted">{o.state} il {dateIt(o.decided, 'dm')}{o.lossReason ? ` · ${lossLabel(o.lossReason)}` : ''}</span>;
  const noCust = !(d.customers || []).length;
  return (
    <>
      {isNew && (noCust ? <Panel title="Nuova offerta" id="com-offer"><Empty icon={LuUsers} title="Prima servono i clienti">Aggiungi un cliente e un prodotto con listino: l’offerta mostra subito margine, prezzo minimo e obiettivo.</Empty></Panel> : <NuovaOfferta d={d} prefill={prefill} scope={scope} />)}
      <div className="kpis">
        <Kpi label="Offerte aperte" value={open.length} foot={`${nf(sum(open, o => o.tonnes))} t in trattativa${expired.length ? ` · ${expired.length} scadute da chiudere` : ''}`} status={expired.length ? 'warn' : null} title="Bozze e inviate entro la validità; le scadute sono escluse" />
        <Kpi label="Pipeline pesata" value={kEur(pipe.weighted)} unit="mila €" foot={`su ${kEur(pipe.value)} mila € aperti`} title={`Σ t × prezzo × probabilità dello stato: bozza ${nf(prob.bozza * 100)}%, inviata ${nf(prob.inviata * 100)}% (Dati › Impostazioni)`} />
        <Kpi label="Successo a valore" value={W.rate == null ? '—' : nf(W.rate * 100)} unit="%" cmp={cmpOf(C, cov, W.rate != null ? W.rate * 100 : null, WC?.rate != null ? WC.rate * 100 : null, { kind: 'ratio', unit: 'pt', decimals: 0 })}
          foot={`${W.decided} decise nel periodo · ${kEur(W.decidedValue)} mila €`} title="Σ t × prezzo delle accettate / Σ t × prezzo delle decise (accettate + perse), per data della decisione" />
        <Kpi label="Aperte sotto il prezzo minimo" value={belowMin.length} status={belowMin.length ? 'bad' : open.length ? 'ok' : null} foot={belowMin.some(o => o.approval?.by) ? `${belowMin.filter(o => o.approval?.by).length} con deroga approvata` : 'da rivedere o far approvare'} title="Su tutte le offerte aperte, qualunque sia il filtro della tabella" />
        <Kpi label="Margine delle offerte aperte" value={kEur(sum(open, o => o.chk?.total || 0))} unit="mila €" foot="ai costi pieni di oggi" />
      </div>
      <Panel title="Offerte" sub="Controllo al costo pieno di oggi (materie prime, energia, trasformazione, imballo, logistica) · accettate e perse per data della decisione nel periodo" flush
        actions={<Seg options={[{ id: 'aperte', label: `Aperte ${open.length}` }, { id: 'scadute', label: `Scadute ${expired.length}` }, { id: 'accettata', label: 'Accettate' }, { id: 'persa', label: 'Perse' }, { id: 'tutte', label: 'Tutte' }]} value={st} onChange={setSt} label="Stato" />}>
        <Table rows={rows} selected={sel} onRow={o => openDrawer('offer', o.id)} initialSort={{ key: 'date', dir: 'desc' }} exportName="offerte" cols={[
          { key: 'code', label: 'Offerta', csv: o => o.code, render: o => <><span className="code">{o.code}</span><span className="sub">{dateIt(o.date, 'dm')} · valida fino al {dateIt(o.validUntil, 'dm')}</span></> },
          { key: 'cname', label: 'Cliente', csv: o => o.cname, render: o => <><b>{o.cname}</b><span className="sub">{o.pname}</span></> },
          { key: 'tonnes', label: 't', align: 'r', render: o => nf(o.tonnes) },
          { key: 'price', label: colUp('Prezzo'), align: 'r', csv: o => up(o.price, I.prod[o.productId]), render: o => <>{cellUp(o.price, I.prod[o.productId])}<span className="sub">minimo {cellUp(o.chk?.minPrice, I.prod[o.productId])}</span></> },
          { key: 'margin', label: 'Margine', align: 'r', sort: o => o.chk?.marginPct, csv: o => o.chk?.margin, render: o => o.chk ? <>{fmtUp(o.chk.margin, I.prod[o.productId], 1)}<span className="sub">{nf(o.chk.marginPct * 100, 1)}%</span></> : '—' },
          { key: 'chk', label: 'Controllo', sort: o => o.chk?.status, csv: o => o.chk ? OCHECK[o.chk.status].label : '', render: o => o.chk ? <span className="com-chips"><Chip kind={OCHECK[o.chk.status].kind} icon={o.chk.status === 'ok' ? LuCheck : LuTriangleAlert}>{OCHECK[o.chk.status].label}</Chip>{o.approval?.by && <Chip kind="outline" title={`Deroga approvata da ${o.approval.by} il ${dateIt(o.approval.at)}`}>deroga</Chip>}{o.creditException?.by && <Chip kind="outline" title={`Fuori fido: eccezione di ${o.creditException.by}`}>fido</Chip>}</span> : '—' },
          { key: 'state', label: 'Stato', csv: o => o.state, render: o => <Chip kind={OFFER_STATES[o.state]?.kind}>{OFFER_STATES[o.state]?.label || o.state}</Chip> },
          { key: 'act', label: '', nosort: true, csv: false, render: actions },
        ]} empty={st === 'aperte' ? 'Nessuna offerta aperta.' : 'Nessuna offerta in questo stato nel periodo.'} />
      </Panel>
      <div className="grid g2 start">
        <Panel title="In scadenza nei prossimi 7 giorni" sub="Offerte aperte da richiamare prima che scadano" flush>
          {soon.length ? <div className="com-list">{soon.map(o => <button key={o.id} className="dlink" onClick={() => openDrawer('offer', o.id)}><span><span className="code">{o.code}</span> {o.cname}</span><span className="muted">{nf(o.tonnes)} t · {kEur(o.value)} mila € · scade {relDays(o.validUntil, today)}</span></button>)}</div>
            : <Empty icon={LuCalendarClock} title="Nessuna scadenza imminente" />}
        </Panel>
        <Panel title="Perché perdiamo" sub={`Offerte perse nel periodo per motivo (valore) · ${P.short}`}>
          {losses.length ? <>
            <Bars data={losses.map(r => ({ key: r.reason, label: `${r.label} (${r.n})`, value: r.value / 1000, color: r.reason === 'prezzo' || r.reason === 'concorrente' ? 'var(--s2)' : 'var(--s7)' }))} unit="mila €" decimals={1} ariaLabel="Offerte perse per motivo" />
            {losses.filter(r => r.competitorGap != null).map(r => <p key={r.reason} className="small muted" style={{ margin: '8px 0 0' }}>{r.label}: concorrenti più bassi di {fmtPm(r.competitorGap, 1)} in media ({Object.entries(r.competitors).map(([k, v]) => `${k} ×${v}`).join(', ') || 'concorrente non indicato'}).</p>)}
          </> : <Empty icon={LuHandshake} title="Nessuna offerta persa nel periodo" />}
        </Panel>
      </div>
      {dlg?.kind === 'lose' && <LossDialog d={d} offer={dlg.o} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'renew' && <RenewDialog d={d} offer={dlg.o} onClose={() => setDlg(null)} />}
    </>
  );
}

/** Chiusura di un'offerta come persa con motivo strutturato, concorrente e prezzo del concorrente. */
export function LossDialog({ d, offer, onClose }) {
  const today = appToday(d);
  const [f, setF] = useState({ reason: offer.lossReason || 'prezzo', competitor: offer.competitor || '', competitorPrice: offer.competitorPrice ?? null, note: '' });
  const gap = f.competitorPrice > 0 ? offer.price - f.competitorPrice : null;
  const pp = (d.products || []).find(x => x.id === offer.productId);
  const save = () => {
    const note = f.note.trim() ? [offer.note, f.note.trim()].filter(Boolean).join(' · ') : offer.note;
    store.update('offers', offer.id, { status: 'persa', decidedAt: today, lossReason: f.reason, competitor: f.competitor.trim() || null, competitorPrice: f.competitorPrice > 0 ? f.competitorPrice : null, note: note || '' }, `Offerta ${offer.code}: persa (${lossLabel(f.reason).toLowerCase()})`);
    toast(`Offerta ${offer.code} chiusa come persa`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    onClose();
  };
  return (
    <Dialog title={`Offerta ${offer.code} persa`} onClose={onClose} onOk={save} ok="Chiudi come persa" danger hint="Si può annullare">
      <p className="small muted" style={{ margin: 0 }}>Il motivo strutturato alimenta l’analisi delle perdite per motivo, concorrente e differenza di prezzo.</p>
      <Field label="Motivo principale">
        <div className="row gap-s" role="group" aria-label="Motivo">{LOSS_REASONS.map(r => <button key={r.id} type="button" className={`chip pick ${f.reason === r.id ? 'on' : ''}`} aria-pressed={f.reason === r.id} onClick={() => setF(x => ({ ...x, reason: r.id }))}>{r.label}</button>)}</div>
      </Field>
      <div className="form">
        <Field label="Concorrente"><input className="input" value={f.competitor} onChange={e => setF(x => ({ ...x, competitor: e.target.value }))} placeholder="Nome del concorrente" /></Field>
        <Field label={`Prezzo del concorrente ${upLabel(pp)}`} hint={gap != null ? `${gap > 0 ? 'più basso' : 'più alto'} di ${fmtUp(Math.abs(gap), pp)} rispetto ai nostri ${fmtUp(offer.price, pp)}` : `nostro prezzo ${fmtUp(offer.price, pp)}`}><NumInput value={up(f.competitorPrice, pp)} onChange={v => setF(x => ({ ...x, competitorPrice: upIn(v, pp) }))} decimals={upDec(0)} min={0} /></Field>
      </div>
      <Field label="Nota"><textarea className="input" value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="Cosa ha deciso il cliente" /></Field>
    </Dialog>
  );
}

/** Rinnovo di un'offerta scaduta: nuova validità ed eventuale nuovo prezzo (sotto il minimo serve chi approva). */
export function RenewDialog({ d, offer, onClose }) {
  const today = appToday(d); const I = idx(d); const C = costs(d);
  const p = I.prod[offer.productId], cost = C[offer.productId];
  const [until, setUntil] = useState(addDays(today, 30)), [price, setPrice] = useState(offer.price), [by, setBy] = useState('');
  const chk = p && cost && price > 0 ? offerCheck({ price, tonnes: offer.tonnes }, cost, p) : null;
  const needApp = chk?.status === 'sotto-minimo';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(until) && until >= today && price > 0 && (!needApp || by.trim());
  const save = () => {
    if (!valid) return;
    store.update('offers', offer.id, { validUntil: until, price, status: offer.status === 'bozza' ? 'bozza' : 'inviata', renewedAt: today, ...(cost ? { costAtRenewal: round(cost.total, 2) } : {}), ...(needApp ? { approval: { by: by.trim(), at: today, note: 'Rinnovo sotto il prezzo minimo' } } : {}) }, `Offerta ${offer.code}: rinnovata fino al ${dateIt(until)}`);
    toast(`Offerta ${offer.code} valida fino al ${dateIt(until)}`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    onClose();
  };
  return (
    <Dialog title={`Rinnova l’offerta ${offer.code}`} onClose={onClose} onOk={save} ok="Rinnova" okDisabled={!valid} hint={needApp && !by.trim() ? 'Sotto il minimo serve chi approva' : null}>
      <div className="form">
        <Field label="Valida fino al"><input type="date" className="input" value={until} min={today} onChange={e => setUntil(e.target.value)} /></Field>
        <Field label={`Prezzo ${upLabel(p)}`} hint={cost ? `minimo ${fmtUp(cost.minPrice, p)} · obiettivo ${fmtUp(cost.targetPrice, p)} ai costi di oggi` : ''}><NumInput value={up(price, p)} onChange={v => setPrice(upIn(v, p) || 0)} decimals={upDec(0)} step={upStep} /></Field>
      </div>
      {chk && <div className={`note ${chk.status === 'sotto-minimo' ? 'crit' : chk.status === 'ok' ? 'good' : 'warn'}`}>Margine {fmtUp(chk.margin, p, 1)} ({nf(chk.marginPct * 100, 1)}%) ai costi di oggi · {OCHECK[chk.status].label}{offer.costAtOffer ? ` · costo pieno all’offerta ${fmtUp(offer.costAtOffer, p, 1)}, oggi ${fmtUp(cost.total, p, 1)}` : ''}</div>}
      {needApp && <Field label="Deroga approvata da" hint="Nome di chi autorizza il prezzo sotto il minimo (resta nell’offerta e nel registro)"><input className="input" value={by} onChange={e => setBy(e.target.value)} placeholder="Es. Direzione commerciale" /></Field>}
    </Dialog>
  );
}

function NuovaOfferta({ d, prefill, scope }) {
  const I = idx(d); const C = costs(d); const today = appToday(d); const V = volumes(d);
  const credit = useCredit(d);
  const custs = useMemo(() => [...(d.customers || [])].filter(c => !scope || c.agentId === scope).sort((a, b) => a.name.localeCompare(b.name, 'it')), [d.customers, scope]);
  const [cust, setCust] = useState(prefill && I.cust[prefill] ? prefill : custs[0]?.id);
  useEffect(() => { if (prefill && I.cust[prefill]) { setCust(prefill); setPid(null); setPrice(null); } }, [prefill]);
  const c = I.cust[cust];
  const prods = (d.products || []).filter(p => p.active !== false && (!c?.products?.length || c.products.includes(p.code)));
  const [pid, setPid] = useState(null);
  const p = I.prod[pid && prods.some(x => x.id === pid) ? pid : prods[0]?.id];
  const cost = p ? C[p.id] : null;
  const [t, setT] = useState(SMALL_UNITS ? 2 : 60), [price, setPrice] = useState(null), [until, setUntil] = useState(addDays(today, 30));
  const [by, setBy] = useState(''), [why, setWhy] = useState(''), [creditBy, setCreditBy] = useState('');
  const list = p ? listAt(d.priceLists, p, today) : 0;
  const pr = price ?? (p ? round5(list * (1 - (c?.discountPct || 0) / 100)) : 0);
  const chk = p && cost ? offerCheck({ price: pr, tonnes: t }, cost, p) : null;
  const auth = authorizedDiscount(d, c), disc = list > 0 ? (1 - pr / list) * 100 : 0;
  const vat = +(d.settings?.finance?.vatPct ?? 10);
  const cr = credit.byCustomer?.[c?.id];
  const value = t * pr * (1 + vat / 100);
  const overCredit = cr && +cr.creditLimit > 0 && (+cr.exposure || 0) + value > +cr.creditLimit;
  const needApp = chk?.status === 'sotto-minimo';
  const missing = !p || !(t > 0) || !(pr > 0) ? 'Indica prodotto, quantità e prezzo' : needApp && !by.trim() ? 'Sotto il prezzo minimo serve il nome di chi approva la deroga' : overCredit && !creditBy.trim() ? 'Oltre il fido serve il nome di chi autorizza l’eccezione' : !/^\d{4}-\d{2}-\d{2}$/.test(until) || until < today ? 'La validità non può essere nel passato' : null;
  const save = status => {
    if (missing) { toast(missing, 'err'); return; }
    const { code, op } = nextCode(d, 'OF', today);
    const id = uid('of');
    const obj = { id, code, date: today, customerId: c.id, productId: p.id, tonnes: t, price: pr, validUntil: until, status, agentId: c.agentId, note: '', costAtOffer: round(cost.total, 2), listAtOffer: list,
      ...(needApp ? { approval: { by: by.trim(), at: today, note: why.trim() } } : {}),
      ...(overCredit ? { creditException: { by: creditBy.trim(), at: today, exposure: round(+cr.exposure || 0), limit: +cr.creditLimit } } : {}) };
    store.batch([{ kind: 'add', coll: 'offers', obj }, op], `Nuova offerta ${code} a ${c.name}: ${nf(t)} t di ${p.name} a ${fmtUp(pr, p)}`);
    toast(status === 'inviata' ? `Offerta ${code} registrata come inviata` : `Bozza ${code} salvata`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    go('commerciale', 'offerte', id);
  };
  return (
    <Panel title="Nuova offerta" sub="Il margine si aggiorna mentre scrivi: costo pieno di oggi, prezzo minimo e obiettivo del prodotto, sconto autorizzato e fido del cliente" id="com-offer"
      actions={<Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={() => go('commerciale', 'offerte')} />}>
      <div className="split">
        <div className="stack" style={{ gap: 12 }}>
          <div className="form">
            <Field label="Cliente"><Select value={cust} onChange={v => { setCust(v); setPid(null); setPrice(null); }} options={custs.map(x => ({ id: x.id, label: x.name }))} id="of-cust" /></Field>
            <Field label="Prodotto"><Select value={p?.id} onChange={v => { setPid(v); setPrice(null); }} options={prods.map(x => ({ id: x.id, label: x.name }))} id="of-prod" /></Field>
          </div>
          <div className="form">
            <Field label="Quantità (t)"><NumInput value={t} onChange={v => setT(v || 0)} decimals={0} min={0} id="of-t" /></Field>
            <Field label={`Prezzo ${upLabel(p)}`} hint={`listino in vigore ${fmtUp(list, p)} · sconto abituale ${nf(c?.discountPct, 1)}%`}><NumInput value={up(pr, p)} onChange={v => setPrice(v == null ? null : upIn(v, p))} decimals={upDec(0)} step={upStep} id="of-price" /></Field>
            <Field label="Valida fino al"><input type="date" className="input" value={until} min={today} onChange={e => setUntil(e.target.value)} id="of-until" /></Field>
          </div>
          <div className="row">
            <Btn small icon={LuSparkles} disabled={!cost} onClick={() => setPrice(ceil5(cost.targetPrice))}>Prezzo obiettivo {cellUp(ceil5(cost?.targetPrice || 0), p)}</Btn>
            <Btn small disabled={!cost} onClick={() => setPrice(ceil5(cost.minPrice))}>Prezzo minimo {cellUp(ceil5(cost?.minPrice || 0), p)}</Btn>
            {list > 0 && <Btn small kind="ghost" onClick={() => setPrice(null)}>Listino − sconto abituale</Btn>}
          </div>
          {disc > auth + 1e-9 && <div className="note warn small">Sconto sul listino {nf(disc, 1)}%: oltre il {nf(auth, 1)}% autorizzato per questo cliente (sconto abituale + {nf(auth - (c?.discountPct || 0), 1)} punti di trattativa).</div>}
          {needApp && <div className="form">
            <Field label="Deroga approvata da" hint="Obbligatorio sotto il prezzo minimo: resta nell’offerta"><input className="input" value={by} onChange={e => setBy(e.target.value)} placeholder="Es. Direzione commerciale" id="of-approver" /></Field>
            <Field label="Motivo della deroga"><input className="input" value={why} onChange={e => setWhy(e.target.value)} placeholder="Es. ingresso in un nuovo allevamento" /></Field>
          </div>}
          {overCredit && <div className="stack" style={{ gap: 8 }}>
            <div className="note crit small">Fido superato: esposizione {nf(cr.exposure)} € + offerta {nf(value)} € IVA inclusa contro un fido di {nf(cr.creditLimit)} €.</div>
            <Field label="Eccezione al fido autorizzata da"><input className="input" value={creditBy} onChange={e => setCreditBy(e.target.value)} placeholder="Es. Amministrazione" id="of-credit" /></Field>
          </div>}
          <div className="row"><Btn kind="primary" icon={LuSend} disabled={!!missing} title={missing || undefined} onClick={() => save('inviata')}>Registra come inviata</Btn><Btn disabled={!!missing} onClick={() => save('bozza')}>Salva bozza</Btn>{missing && <span className="small muted">{missing}</span>}</div>
        </div>
        {chk && (
          <div className={`offer-check ${chk.status}`}>
            <div className="eyebrow">Esito</div>
            <div className="big"><Chip kind={OCHECK[chk.status].kind} icon={chk.status === 'ok' ? LuCheck : LuTriangleAlert}>{OCHECK[chk.status].label}</Chip></div>
            <Kv items={[['Margine', `${fmtUp(chk.margin, p, 1)} · ${nf(chk.marginPct * 100, 1)}% del prezzo`], ['Margine dell’offerta', `${nf(chk.total)} €`], ['Costo pieno oggi', `${fmtUp(cost.total, p, 1)} (materie prime ${fmtUp(cost.raw, p, 1)})`], ['Prezzo minimo', `${fmtUp(cost.minPrice, p, 1)} (margine ${nf(p.minMarginPct)}%)`], ['Prezzo obiettivo', `${fmtUp(cost.targetPrice, p, 1)} (margine ${nf(p.targetMarginPct)}%)`], ['Sconto sul listino', `${nf(disc, 1)}% (autorizzato ${nf(auth, 1)}%)`], ['Volume annuo del prodotto', `${nf(V[p.id] || 0)} t`], cr && +cr.creditLimit > 0 ? ['Fido del cliente', `${nf(cr.exposure)} € su ${nf(cr.creditLimit)} €`] : null]} />
            {chk.status === 'sotto-minimo' && <p className="small" style={{ margin: 0 }}>Sotto il minimo il prezzo non copre il margine deciso dalla direzione: per registrare l’offerta serve il nome di chi approva la deroga.</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- listino ---------------- */
/** Andamento del listino (ultimi 12 mesi e prossima versione, tratteggiata) a gradini. */
function StepSpark({ d, p, today, w = 104, h = 26 }) {
  const hist = priceHistory(d, p.id);
  const next = hist.find(x => x.validFrom > today);
  const from = addDays(today, -365), end = next ? addDays(next.validFrom, 45) : today;
  const segs = [];
  if (!hist.length) segs.push({ a: from, b: end, v: +p.listPrice || 0 });
  else {
    if (hist[0].validFrom > from) segs.push({ a: from, b: addDays(hist[0].validFrom, -1), v: +hist[0].price });
    for (const x of hist) { const a = x.validFrom > from ? x.validFrom : from, b = x.validTo && x.validTo < end ? x.validTo : end; if (a <= b) segs.push({ a, b, v: +x.price, future: x.validFrom > today }); }
  }
  if (!segs.length) return null;
  const vs = segs.map(s => s.v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1, span = Math.max(1, daysBetween(from, end));
  const X = s => 2 + daysBetween(from, s) / span * (w - 4), Y = v => mx === mn ? h / 2 : h - 4 - (v - mn) / rg * (h - 8);
  const past = segs.filter(s => !s.future), fut = segs.filter(s => s.future);
  const path = list => list.map((s, i) => `${i ? `V${Y(s.v).toFixed(1)}` : `M${X(s.a).toFixed(1)} ${Y(s.v).toFixed(1)}`}H${X(s.b).toFixed(1)}`).join('');
  const tip = hist.map(x => `dal ${dateIt(x.validFrom)}: ${fmtUp(x.price, p)}${x.reason ? ` (${x.reason})` : ''}`).join('\n') || `listino ${fmtUp(p.listPrice, p)}, nessuna versione registrata`;
  const cur = listAt(d.priceLists, p, today);
  return (
    <svg className="com-step" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Storico del listino di ${p.name}`}><title>{tip}</title>
      <path d={path(past)} fill="none" stroke="var(--s1)" strokeWidth="1.8" strokeLinejoin="round" />
      {fut.length > 0 && <path d={`M${X(fut[0].a).toFixed(1)} ${Y(past.at(-1)?.v ?? fut[0].v).toFixed(1)}V${Y(fut[0].v).toFixed(1)}H${X(fut[0].b).toFixed(1)}`} fill="none" stroke="var(--s4)" strokeWidth="1.8" strokeDasharray="3 2" />}
      <circle cx={X(today)} cy={Y(cur)} r="2.6" fill="var(--s1)" stroke="var(--surface)" strokeWidth="1.2" />
    </svg>
  );
}

const firstOfNextMonth = today => addMonths(today.slice(0, 7), 1) + '-01';

function Listino({ d, per, scope }) {
  const { P, C, cov } = per;
  const ctx = ctxOf(d); const today = appToday(d);
  const rows = useMemo(() => priceListRows(d, ctx, P, { agentId: scope }), [d.priceLists, d.products, d.salesHistory, ctx, P.key, scope]);
  const RT = useMemo(() => realization(d, ctx, P, null, { agentId: scope }).total, [ctx, P.key, scope, d.salesHistory]);
  const RC = useMemo(() => (C && !C.budget ? realization(d, ctx, C, null, { agentId: scope }).total : null), [ctx, C?.key, C?.budget, scope, d.salesHistory]);
  const [selId, setSel] = useState(null), [draft, setDraft] = useState(null), [csvCust, setCsvCust] = useState('');
  const sync = syncListOps(d, today);
  if (!(d.products || []).length) return <Panel title="Listino"><Empty icon={LuTags} title="Nessun prodotto in archivio">Crea i prodotti con formula, costi di trasformazione e listino: qui compariranno prezzo netto realizzato, listino necessario e storico delle versioni.</Empty></Panel>;
  const sel = rows.find(r => r.id === selId) || [...rows].sort((a, b) => b.vol - a.vol)[0];
  const under = rows.filter(r => r.status === 'sotto-minimo');
  const gaps = rows.filter(r => r.gapPct != null && r.gapPct > 0.03);
  let ptN = 0, ptW = 0; for (const r of rows) if (r.passThrough != null && r.vol > 0) { ptN += r.passThrough * r.vol; ptW += r.vol; }
  const setPrice = (r, price) => {
    const ops = newPriceListOps(d, { productId: r.id, price, validFrom: today, reason: 'Modifica dal listino', today });
    if (!ops.length) return;
    store.batch(ops, `Listino: ${r.name} a ${fmtUp(price, r.p)} da oggi`);
    toast(`${r.name}: ${fmtUp(price, r.p)} da oggi (nuova versione)`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const alignAll = () => confirm(`Allineare ${under.length} listini al prezzo obiettivo?`, <><p>Per i prodotti con il prezzo netto sotto il minimo il listino passa, da oggi, al <b>listino necessario</b> (prezzo obiettivo ai costi di oggi diviso per 1 − sconto medio degli ultimi 90 giorni), arrotondato a {SMALL_UNITS ? 'mezzo centesimo' : '5 €/t'}:</p><p className="small">{under.map(r => `${r.name} ${cellUp(r.listNow, r.p)} → ${fmtUp(ceil5(r.required), r.p)}`).join(' · ')}.</p><p className="small muted">Ogni prodotto riceve una nuova versione di listino; le offerte già inviate non cambiano.</p></>, () => {
    const ops = bulkRevisionOps(d, { byProduct: Object.fromEntries(under.map(r => [r.id, ceil5(r.required)])), validFrom: today, reason: 'Allineamento al prezzo obiettivo', approvedBy: '', today });
    store.batch(ops, `Listino allineato: ${under.length} prodotti`);
    toast('Listino aggiornato da oggi', 'ok', { label: 'Annulla', fn: () => store.undo() });
  }, { ok: 'Aggiorna' });
  const exportList = () => download(`listino-${stamp()}.csv`, toCSV(rows, [{ key: 'code', label: 'Codice' }, { key: 'name', label: 'Prodotto' }, { label: 'Forma', value: r => r.p.form }, { label: 'Confezione', value: r => r.p.packaging }, { label: colUp('Prezzo'), value: r => up(r.listNow, r.p) }, { label: 'Unità', value: r => upLabel(r.p) }, { label: 'In vigore dal', value: r => [...r.hist].reverse().find(h => h.validFrom <= today)?.validFrom || '' }, { label: 'Condizioni', value: () => 'franco destino, trasporto standard incluso, IVA esclusa' }]), 'text/csv;charset=utf-8');
  const exportCust = () => {
    const c = (d.customers || []).find(x => x.id === csvCust); if (!c) return;
    const mine = rows.filter(r => !c.products?.length || c.products.includes(r.code));
    download(`listino-${c.code || c.id}-${stamp()}.csv`, toCSV(mine, [{ key: 'code', label: 'Codice' }, { key: 'name', label: 'Prodotto' }, { label: colUp('Listino'), value: r => up(r.listNow, r.p) }, { label: 'Unità', value: r => upLabel(r.p) }, { label: 'Sconto %', value: () => +c.discountPct || 0 }, { label: colUp('Prezzo netto'), value: r => round(up(r.listNow * (1 - (+c.discountPct || 0) / 100), r.p), upDec(2)) }, { label: 'Condizioni', value: () => 'franco destino, trasporto standard incluso, IVA esclusa' }]), 'text/csv;charset=utf-8');
  };
  const openDraft = (byProduct = {}) => setDraft({ validFrom: firstOfNextMonth(today), mode: 'prodotti', byProduct, bySpecies: {}, reason: '', approvedBy: '', elasticity: +(d.settings?.finance?.elasticity ?? 0) || 0 });
  const W = sel ? pocketWaterfall(d, ctx, P, { productId: sel.id, agentId: scope }) : null;
  return (
    <>
      {sync.length > 0 && <div className="note maize row between"><span><b>{sync.length} versioni di listino sono entrate in vigore</b>: i prezzi in anagrafica (usati da costi e margini a listino) vanno allineati.</span><Btn small kind="primary" onClick={() => { store.batch(sync, `Listini entrati in vigore: ${sync.length} prodotti`); toast('Listino in anagrafica allineato', 'ok', { label: 'Annulla', fn: () => store.undo() }); }}>Applica i listini in vigore</Btn></div>}
      {under.length > 0 && !scope && <div className="note crit row between"><span><b>{under.length === 1 ? '1 prodotto ha' : `${under.length} prodotti hanno`} il prezzo netto sotto il margine minimo</b> (realizzato negli ultimi 90 giorni, ai costi di oggi): {under.map(r => r.name).join(', ')}.</span><Btn small kind="primary" onClick={alignAll}>Allinea al prezzo obiettivo</Btn></div>}
      <div className="kpis">
        <Kpi label="Realizzazione sul listino" value={RT.list > 0 ? nf(RT.net / RT.list * 100, 1) : '—'} unit="%" cmp={cmpOf(C, cov, RT.list > 0 ? RT.net / RT.list * 100 : null, RC?.list > 0 ? RC.net / RC.list * 100 : null, { kind: 'ratio', unit: 'pt' })}
          foot={`prezzo netto medio ${fmtPm(RT.netT, 1)}`} title="Σ ricavi / Σ (t × listino in vigore il giorno della consegna)" />
        <Kpi label="Sconto medio realizzato" value={RT.discountPct != null ? nf(RT.discountPct * 100, 2) : '—'} unit="%" cmp={cmpOf(C, cov, RT.discountPct != null ? RT.discountPct * 100 : null, RC?.discountPct != null ? RC.discountPct * 100 : null, { kind: 'ratio', unit: 'pt', good: 'down', decimals: 2 })} foot={`${nf(RT.discount / 1000)} mila € sotto il listino`} />
        <Kpi label="Pass-through materie prime" value={ptW ? nf(ptN / ptW * 100) : '—'} unit="%" foot={`dal ${dateIt(P.from, 'dm')} a oggi, pesato sui volumi`} title="(listino oggi − listino a inizio periodo) / (materie prime €/t dell’ultimo mese − del primo mese), dai costi effettivi dei lotti" />
        <Kpi label="Listini sotto il necessario" value={gaps.length} status={gaps.length ? 'warn' : 'ok'} foot="oltre il 3% sotto il prezzo che dà il margine obiettivo" title="Listino necessario = prezzo obiettivo ai costi di oggi / (1 − sconto medio degli ultimi 90 giorni)" />
      </div>
      {draft && <Revisione d={d} ctx={ctx} rows={rows} draft={draft} setDraft={setDraft} />}
      <Panel title="Listino" sub="Prezzi franco destino, trasporto standard incluso, IVA esclusa · netto e sconto nel periodo, controllo sul prezzo netto · clic per la cascata del prezzo" flush
        actions={<>{!draft && !scope && <Btn small kind="primary" icon={LuCalendarClock} onClick={() => openDraft()}>Nuovo listino dal…</Btn>}<Btn small icon={LuDownload} onClick={exportList}>Esporta listino</Btn></>}>
        <Table rows={rows} selected={sel?.id} onRow={r => setSel(r.id)} initialSort={{ key: 'gapPct', dir: 'desc' }} exportName="listino-analisi" cols={[
          { key: 'name', label: 'Prodotto', csv: r => r.name, render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.p.form} · {r.p.packaging}</span></> },
          { key: 'listNow', label: colUp('Listino'), align: 'r', csv: r => up(r.listNow, r.p), render: r => <div className="com-li" onClick={e => e.stopPropagation()}>{scope ? <b>{cellUp(r.listNow, r.p)}</b> : <NumInput value={up(r.listNow, r.p)} decimals={upDec(0)} slim step={upStep} onChange={v => { const t = upIn(v, r.p); if (t > 0 && Math.abs(t - r.listNow) >= 0.5) setPrice(r, t); }} ariaLabel={`Listino di ${r.name} da oggi in ${upLabel(r.p)}`} />}{SMALL_UNITS && !scope && <span className="sub">{upLabel(r.p)}</span>}{r.next && <span className="sub" title={r.next.reason || ''}>→ {nf(r.next.price)} dal {dateIt(r.next.validFrom, 'dm')}</span>}</div> },
          { key: 'netT', label: colUp('Netto medio'), align: 'r', csv: r => up(r.netT, r.p), render: r => r.netT == null ? '—' : <>{cellUp(r.netT, r.p, 1)}<span className="sub">{nf(r.tonnes)} t</span></> },
          { key: 'discountPct', label: 'Sconto', align: 'r', render: r => pctTxt(r.discountPct, 2) },
          { key: 'passThrough', label: 'Pass-through', align: 'r', render: r => r.pt ? <span title={`Listino ${fmtUp(r.pt.listFrom, r.p)} → ${fmtUp(r.pt.listNow, r.p)}; materie prime ${fmtUp(r.pt.rawFrom, r.p, 1)} → ${fmtUp(r.pt.rawNow, r.p, 1)} (${r.pt.monthFrom} → ${r.pt.monthNow})`}>{nf(r.pt.value * 100)}%</span> : <span className="muted" title="Materie prime ferme (meno di 1 €/t) o dati insufficienti">—</span> },
          { key: 'required', label: colUp('Necessario'), align: 'r', csv: r => up(r.required, r.p), render: r => r.required == null ? '—' : <>{cellUp(r.required, r.p)}<span className="sub">sconto 90 gg {pctTxt(r.discount90, 1)}</span></> },
          { key: 'gapPct', label: 'Gap', align: 'r', csv: r => r.gap, render: r => r.gap == null ? '—' : <span className={r.gapPct > 0.03 ? 'chip warn' : r.gapPct > 0 ? '' : 'muted'}>{r.gap > 0 ? '+' : ''}{fmtUp(r.gap, r.p)}<span className="sub">{sf(r.gapPct * 100, 1)}%</span></span> },
          { key: 'status', label: 'Controllo netto', sort: r => ({ 'sotto-minimo': 0, 'sotto-obiettivo': 1, ok: 2 })[r.status], csv: r => r.status ? OCHECK[r.status].label : '', render: r => r.status ? <Chip kind={OCHECK[r.status].kind} title={`Netto ${fmtUp(r.netCheck, r.p, 1)} (${r.net90 != null ? 'ultimi 90 giorni' : 'listino, nessuna consegna in 90 giorni'}) · minimo ${fmtUp(r.cost?.minPrice, r.p, 1)} · obiettivo ${fmtUp(r.cost?.targetPrice, r.p, 1)}`}>{OCHECK[r.status].label}</Chip> : '—' },
          { key: 'hist', label: 'Storico', nosort: true, csv: r => r.hist.map(h => `${h.validFrom}:${h.price}`).join(' '), render: r => <StepSpark d={d} p={r.p} today={today} /> },
        ]} />
        <div className="row com-foot">
          <span className="small muted">Listino personalizzato (listino × (1 − sconto abituale)):</span>
          <select className="select slim com-agent" value={csvCust} onChange={e => setCsvCust(e.target.value)} aria-label="Cliente del listino personalizzato"><option value="">Scegli un cliente</option>{[...(d.customers || [])].filter(c => !scope || c.agentId === scope).sort((a, b) => a.name.localeCompare(b.name, 'it')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <Btn small icon={LuDownload} disabled={!csvCust} onClick={exportCust}>CSV del cliente</Btn>
          {gaps.length > 0 && !draft && !scope && <Btn small kind="ghost" icon={LuSparkles} onClick={() => openDraft(Object.fromEntries(gaps.map(r => [r.id, ceil5(r.required)])))}>Prepara il listino necessario</Btn>}
        </div>
      </Panel>
      {sel && W && (
        <div className="split">
          <Panel title={`Dal listino al margine pocket · ${sel.name}`} sub={`${upLabel(sel.p)} sulle consegne del periodo (${nf(W.tonnes)} t): sconti, premi, provvigione, dilazione e trasporto, poi il costo industriale effettivo`} id="com-pocket">
            {W.tonnes > 0 ? <Waterfall steps={W.steps.map(s => ({ label: s.label, value: s.value, kind: s.kind === 'total' ? 'total' : undefined, color: s.key === 'margin' ? (s.value >= 0 ? 'var(--s3)' : 'var(--crit)') : s.key === 'pocket' ? 'var(--s1)' : undefined }))} height={280} ariaLabel={`Cascata del prezzo di ${sel.name}`} />
              : <Empty title="Nessuna consegna nel periodo" />}
            <p className="xs muted" style={{ margin: '6px 0 0' }}>Prezzo pocket = netto − premio di fine anno − provvigione − onere della dilazione − trasporto; margine pocket = prezzo pocket − (materie prime dei lotti, calo, energia misurata, trasformazione variabile, imballo).</p>
          </Panel>
          <Panel title="Versioni del listino" sub="Ogni revisione ha decorrenza e motivo; le precedenti restano per la realizzazione storica" flush
            actions={<Btn small kind="ghost" onClick={() => openDrawer('product', sel.id)}>Scheda prodotto</Btn>}>
            {sel.hist.length ? <div className="tw"><table className="t"><thead><tr><th>Dal</th><th>Al</th><th className="r">{upLabel(sel.p)}</th><th>Motivo</th></tr></thead>
              <tbody>{[...sel.hist].reverse().map(h => <tr key={h.id}><td>{dateIt(h.validFrom)}</td><td>{h.validTo ? dateIt(h.validTo) : h.validFrom > today ? 'futura' : 'in vigore'}</td><td className="r"><b>{nf(up(h.price, sel.p), upDec(0))}</b></td><td>{h.reason || '—'}{h.approvedBy && <span className="sub">approvato da {h.approvedBy}</span>}</td></tr>)}</tbody></table></div>
              : <Empty icon={LuTags} title="Nessuna versione registrata">Il prezzo di listino è {fmtUp(sel.listPrice, sel.p)}; la prima revisione registrerà anche il prezzo precedente.</Empty>}
          </Panel>
        </div>
      )}
    </>
  );
}

const SPECIES_LABEL = s => SPECIES[s]?.name || s || 'altro';

/** Nuovo listino con decorrenza: prezzi per prodotto o % per specie, simulazione dell'effetto prima di confermare. */
function Revisione({ d, ctx, rows, draft, setDraft }) {
  const today = appToday(d);
  const set = patch => setDraft(x => ({ ...x, ...patch }));
  const species = [...new Set(rows.map(r => r.species))];
  const at = r => listAt(d.priceLists, r.p, draft.validFrom || today);
  const eff = useMemo(() => {
    const out = {};
    for (const r of rows) {
      const v = draft.mode === 'specie' ? (draft.bySpecies[r.species] ? round5(at(r) * (1 + draft.bySpecies[r.species] / 100)) : null) : draft.byProduct[r.id];
      if (v > 0 && Math.abs(v - at(r)) >= 0.5) out[r.id] = v;
    }
    return out;
  }, [draft, rows, d.priceLists]);
  const okDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.validFrom);
  const sim = useMemo(() => (okDate ? revisionSim(d, ctx, { byProduct: eff, validFrom: draft.validFrom, elasticity: draft.elasticity }) : null), [eff, draft.validFrom, draft.elasticity, ctx, d.priceLists, d.offers, d.customers]);
  const n = Object.keys(eff).length;
  const confirmIt = () => {
    const ops = bulkRevisionOps(d, { byProduct: eff, validFrom: draft.validFrom, reason: draft.reason.trim() || 'Revisione di listino', approvedBy: draft.approvedBy.trim(), today });
    if (!ops.length) { toast('Nessun prezzo cambia', 'err'); return; }
    store.batch(ops, `Nuovo listino dal ${dateIt(draft.validFrom)}: ${n} prodotti`);
    toast(draft.validFrom <= today ? `Listino aggiornato da oggi: ${n} prodotti` : `Listino dal ${dateIt(draft.validFrom)} registrato: i prezzi di oggi non cambiano`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    setDraft(null);
  };
  const offers = sim ? [...new Set([...sim.openOffersBelowMin, ...sim.openOffersBeyondDiscount])] : [];
  return (
    <Panel title="Nuovo listino" sub="Decorrenza, prezzi e simulazione prima di confermare · una data futura non cambia i prezzi di oggi" id="com-rev"
      actions={<Btn small kind="ghost" icon={LuX} title="Chiudi senza salvare" onClick={() => setDraft(null)} />}>
      <div className="com-rev">
        <div className="stack" style={{ gap: 12 }}>
          <div className="form">
            <Field label="In vigore dal"><input type="date" className="input" value={draft.validFrom} onChange={e => set({ validFrom: e.target.value })} id="rev-from" /></Field>
            <Field label="Motivo"><input className="input" value={draft.reason} onChange={e => set({ reason: e.target.value })} placeholder="Es. aumento della soia" /></Field>
            <Field label="Approvato da"><input className="input" value={draft.approvedBy} onChange={e => set({ approvedBy: e.target.value })} placeholder="Es. Direzione" /></Field>
          </div>
          <div className="row between">
            <Seg options={[{ id: 'prodotti', label: 'Prezzi per prodotto' }, { id: 'specie', label: '% per specie' }]} value={draft.mode} onChange={v => set({ mode: v })} label="Modo" />
            {draft.mode === 'prodotti' && <span className="row gap-s"><Btn small kind="ghost" onClick={() => set({ byProduct: Object.fromEntries(rows.filter(r => r.required).map(r => [r.id, ceil5(r.required)])) })}>Al listino necessario</Btn><Btn small kind="ghost" onClick={() => set({ byProduct: {} })}>Azzera</Btn></span>}
          </div>
          {draft.mode === 'prodotti' ? (
            <div className="tw tall"><table className="t"><thead><tr><th>Prodotto</th><th className="r">Alla decorrenza</th><th className="r">Necessario</th><th className="r">{colUp('Nuovo')}</th><th className="r">Δ</th></tr></thead>
              <tbody>{rows.map(r => { const v = draft.byProduct[r.id] ?? null, base = at(r); return (
                <tr key={r.id}><td><b>{r.name}</b><span className="sub">{r.code}</span></td><td className="r">{cellUp(base, r.p)}</td><td className="r">{r.required ? cellUp(r.required, r.p) : '—'}</td>
                  <td className="r"><div className="com-li"><NumInput value={up(v, r.p)} decimals={upDec(0)} slim step={upStep} placeholder={nf(up(base, r.p), upDec(0))} onChange={x => set({ byProduct: { ...draft.byProduct, [r.id]: upIn(x, r.p) } })} ariaLabel={`Nuovo prezzo di ${r.name} in ${upLabel(r.p)}`} /></div></td>
                  <td className="r">{v > 0 && base > 0 ? <span className={v < base ? 'chip warn' : ''}>{sf((v / base - 1) * 100, 1)}%</span> : '—'}</td></tr>); })}</tbody></table></div>
          ) : (
            <div className="com-species">{species.map(s => <Field key={s} label={SPECIES_LABEL(s)} hint={rows.filter(r => r.species === s).map(r => r.code).join(', ')}><NumInput value={draft.bySpecies[s] ?? null} decimals={1} step={0.5} placeholder="0" onChange={x => set({ bySpecies: { ...draft.bySpecies, [s]: x } })} ariaLabel={`Variazione % per ${SPECIES_LABEL(s)}`} /></Field>)}</div>
          )}
          <Field label="Elasticità della domanda" hint="ε: −0,5 vuol dire che un aumento del 2% fa perdere l’1% dei volumi; 0 = volumi invariati"><NumInput value={draft.elasticity} decimals={2} step={0.1} max={0} onChange={x => set({ elasticity: x ?? 0 })} /></Field>
        </div>
        <div className="stack com-sim" style={{ gap: 10 }}>
          <div className="eyebrow">Effetto stimato in un anno</div>
          {sim && n ? <>
            <div className="kpis two">
              <Kpi label="Δ margine di contribuzione" value={sf(sim.annualDeltaMc2 / 1000, 0)} unit="mila €" status={sim.annualDeltaMc2 >= 0 ? 'ok' : 'bad'} foot="stimato, volumi degli ultimi 12 mesi" title="Σ (V + ΔV) × Δ prezzo netto + ΔV × MdC unitario; Δ prezzo netto = Δ listino × netto/listino degli ultimi 90 giorni; ΔV = V × ε × Δp/p" />
              <Kpi label="Δ ricavi" value={sf(sim.annualDeltaRevenue / 1000, 0)} unit="mila €" foot={`${n} prodotti · ε ${nf(sim.elasticity, 2)}`} />
              <Kpi label="Clienti sotto il minimo" value={`${sim.customersBelowMinBefore.length} → ${sim.customersBelowMin.length}`} status={sim.customersBelowMin.length > sim.customersBelowMinBefore.length ? 'bad' : null} foot="netto = listino × (1 − sconto abituale)" />
              <Kpi label="Offerte aperte da rivedere" value={offers.length} status={offers.length ? 'warn' : null} foot="sotto il minimo o oltre lo sconto autorizzato" />
            </div>
            {offers.length > 0 && <p className="small muted" style={{ margin: 0 }}>{offers.map(o => o.code).join(', ')}: il prezzo offerto resta quello inviato.</p>}
          </> : <Empty icon={LuCalendarClock} title="Nessun prezzo cambia">Scrivi i nuovi prezzi o una variazione per specie: la simulazione si aggiorna subito.</Empty>}
          <div className="row"><Btn kind="primary" icon={LuCheck} disabled={!n || !okDate} onClick={confirmIt} id="rev-ok">Conferma il nuovo listino</Btn><Btn kind="ghost" onClick={() => setDraft(null)}>Annulla</Btn></div>
          {okDate && <p className="xs muted" style={{ margin: 0 }}>{draft.validFrom <= today ? 'Decorrenza oggi o passata: il listino in anagrafica si aggiorna subito.' : `Decorrenza futura: fino al ${dateIt(addDays(draft.validFrom, -1))} resta in vigore il listino attuale.`} Si può annullare.</p>}
        </div>
      </div>
    </Panel>
  );
}

/* ---------------- visite ---------------- */
function Visite({ d, sel, per, scope }) {
  const { P, C, cov } = per;
  const I = idx(d); const today = appToday(d);
  const [agent, setAgent] = useState('');
  const ag = scope || agent;
  const inP = v => v.date >= P.from && v.date <= P.to;
  const vs = (d.visits || []).filter(v => inP(v) && (!ag || v.agentId === ag));
  const vsC = C && !C.budget ? (d.visits || []).filter(v => v.date >= C.from && v.date <= C.to && (!ag || v.agentId === ag)) : null;
  const portfolio = (d.customers || []).filter(c => !ag || c.agentId === ag);
  const covered = new Set(vs.map(v => v.customerId)).size;
  const F = funnel(d, P, { agentId: ag || undefined });
  const lastTouch = useMemo(() => { const m = {}; for (const v of d.visits || []) if (!m[v.customerId] || v.date > m[v.customerId]) m[v.customerId] = v.date; for (const o of d.offers || []) if (!m[o.customerId] || o.date > m[o.customerId]) m[o.customerId] = o.date; return m; }, [d.visits, d.offers]);
  const doneTasks = useMemo(() => new Set((d.tasks || []).filter(t => t.status === 'fatto' || t.status === 'scartato').map(t => t.id)), [d.tasks]);
  const late = v => hasNextAction(v) && v.nextActionDue && v.nextActionDue < today && !(v.taskId && doneTasks.has(v.taskId)) && !(lastTouch[v.customerId] > v.date);
  const lateN = (d.visits || []).filter(v => (!ag || v.agentId === ag) && late(v) && v.nextActionDue >= addDays(today, -60)).length;
  const dairy = (d.visits || []).filter(v => v.iofc != null && v.date > addDays(today, -180) && (!ag || v.agentId === ag));
  const byC = {};
  for (const v of dairy) (byC[v.customerId] ||= []).push(v);
  const iofc = Object.entries(byC).map(([id, arr]) => ({ key: id, label: I.cust[id]?.name, value: mean(arr.map(v => v.iofc)) })).sort((a, b) => b.value - a.value).slice(0, 12);
  const custs = useMemo(() => [...(d.customers || [])].filter(c => !scope || c.agentId === scope).sort((a, b) => a.name.localeCompare(b.name, 'it')), [d.customers, scope]);
  const first = sel && I.cust[sel] ? sel : custs[0]?.id;
  const blank = { customerId: first, date: today, kind: 'tecnica', notes: '', milkKg: null, feedCostHead: null, nextAction: '', nextActionDue: addDays(today, 14) };
  const [f, setF] = useState(blank);
  useEffect(() => { if (sel && I.cust[sel]) setF(x => ({ ...x, customerId: sel })); }, [sel]);
  const cust = I.cust[f.customerId];
  const isDairy = cust?.species?.includes('bovini-latte');
  const milkPrice = +d.settings?.milkPrice || 0.54;
  const hasNext = f.nextAction.trim() && !/^nessun[ao]?$/i.test(f.nextAction.trim());
  const valid = cust && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.date <= today && (!hasNext || /^\d{4}-\d{2}-\d{2}$/.test(f.nextActionDue));
  const add = () => {
    if (!valid) return;
    const iofcV = isDairy && f.milkKg && f.feedCostHead ? round(f.milkKg * milkPrice - f.feedCostHead, 2) : null;
    const owner = I.agent[cust.agentId]?.name || 'Commerciale';
    const vid = uid('vi'), tid = hasNext ? uid('ta') : null;
    const ops = [{ kind: 'add', coll: 'visits', obj: { id: vid, customerId: cust.id, date: f.date, kind: f.kind, notes: f.notes.trim(), milkKg: isDairy ? f.milkKg : null, feedCostHead: isDairy ? f.feedCostHead : null, agentId: cust.agentId, milkPrice: isDairy ? milkPrice : null, iofc: iofcV, nextAction: hasNext ? f.nextAction.trim() : '', nextActionDue: hasNext ? f.nextActionDue : null, taskId: tid } }];
    if (hasNext) ops.push({ kind: 'add', coll: 'tasks', obj: { id: tid, title: `${f.nextAction.trim()} · ${cust.name}`, detail: f.notes.trim() ? `Dalla visita del ${dateIt(f.date)}: ${f.notes.trim()}` : `Prossimo passo concordato nella visita del ${dateIt(f.date)}.`, area: 'commerciale', owner, due: f.nextActionDue, status: 'aperto', priority: 'media', source: 'visita', createdAt: today, visitId: vid, link: { area: 'commerciale', tab: 'visite', id: cust.id } } });
    store.batch(ops, `Visita registrata: ${cust.name}${hasNext ? ` · attività per ${owner}` : ''}`);
    toast(hasNext ? `Visita registrata · attività «${f.nextAction.trim()}» per ${owner} entro il ${dateIt(f.nextActionDue, 'dm')}` : 'Visita registrata', 'ok', { label: 'Annulla', fn: () => store.undo() });
    setF(x => ({ ...blank, customerId: x.customerId, kind: x.kind }));
  };
  if (!(d.customers || []).length) return <Panel title="Visite"><Empty icon={LuUsers} title="Nessun cliente in archivio">Le visite si registrano sui clienti in anagrafica: aggiungili da Dati › Anagrafiche.</Empty></Panel>;
  return (
    <>
      <div className="kpis">
        <Kpi label="Visite nel periodo" value={vs.length} cmp={cmpOf(C, cov, vs.length, vsC ? vsC.length : null)} foot={`${nf(sum(vs, v => v.kind === 'tecnica' ? 1 : 0))} tecniche · ${P.short}`} />
        <Kpi label="Copertura del portafoglio" value={portfolio.length ? nf(covered / portfolio.length * 100) : '—'} unit="%" foot={`${covered} clienti visitati su ${portfolio.length}`} title="Clienti con almeno una visita nel periodo / clienti in portafoglio" />
        <Kpi label="Visite che portano un’offerta" value={F.toOffer == null ? '—' : nf(F.toOffer * 100, 1)} unit="%" foot={`${F.offers} offerte entro 30 giorni · ${F.accepted} accettate`} title="Visite seguite entro 30 giorni da un’offerta allo stesso cliente; accettate = di quelle offerte" />
        <Kpi label="Prossimi passi scaduti" value={lateN} status={lateN ? 'warn' : 'ok'} foot="ultimi 60 giorni, senza visite o offerte successive" />
      </div>
      <div className="split">
        <Panel title="Visite del periodo" sub="Prossimo passo con scadenza: diventa un’attività in Oggi › Attività" flush
          actions={!scope && <select className="select com-agent" value={agent} onChange={e => setAgent(e.target.value)} aria-label="Agente"><option value="">Tutti gli agenti</option>{(d.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}>
          <Table rows={vs} onRow={v => openDrawer('customer', v.customerId)} initialSort={{ key: 'date', dir: 'desc' }} pageSize={25} exportName="visite" cols={[
            { key: 'date', label: 'Data', render: v => dateIt(v.date, 'dm') },
            { key: 'c', label: 'Cliente', sort: v => I.cust[v.customerId]?.name, csv: v => I.cust[v.customerId]?.name, render: v => <><b>{I.cust[v.customerId]?.name}</b><span className="sub">{I.agent[v.agentId]?.name}</span></> },
            { key: 'kind', label: 'Tipo', render: v => <Chip kind={v.kind === 'tecnica' ? 'accent' : ''}>{v.kind}</Chip> },
            { key: 'notes', label: 'Note e prossimo passo', csv: v => [v.notes, hasNextAction(v) ? `prossimo passo: ${v.nextAction}${v.nextActionDue ? ' entro ' + v.nextActionDue : ''}` : ''].filter(Boolean).join(' · '),
              render: v => <>{v.notes || <span className="muted">—</span>}{hasNextAction(v) && <span className="sub">prossimo passo: {v.nextAction}{v.nextActionDue && <> · <span className={late(v) ? 'chip warn' : ''}>entro {dateIt(v.nextActionDue, 'dm')}</span></>}</span>}</> },
            { key: 'iofc', label: 'IOFC €/capo', align: 'r', render: v => v.iofc == null ? '—' : <>{nf(v.iofc, 2)}<span className="sub">{nf(v.milkKg, 1)} kg latte</span></> },
          ]} empty="Nessuna visita nel periodo." />
        </Panel>
        <Panel title="Registra una visita" sub="Per le stalle da latte: reddito sul costo alimentare (IOFC) = latte × prezzo − costo della razione per capo al giorno" id="com-visit">
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Cliente"><Select value={f.customerId} onChange={v => setF(x => ({ ...x, customerId: v }))} options={custs.map(c => ({ id: c.id, label: c.name }))} id="vi-cust" /></Field>
            <div className="form">
              <Field label="Data"><input type="date" className="input" value={f.date} max={today} onChange={e => setF(x => ({ ...x, date: e.target.value }))} id="vi-date" /></Field>
              <Field label="Tipo"><Seg options={[{ id: 'tecnica', label: 'Tecnica' }, { id: 'commerciale', label: 'Commerciale' }]} value={f.kind} onChange={v => setF(x => ({ ...x, kind: v }))} label="Tipo di visita" /></Field>
            </div>
            {isDairy && <div className="form">
              <Field label="Latte kg/capo/giorno"><NumInput value={f.milkKg} onChange={v => setF(x => ({ ...x, milkKg: v }))} decimals={1} /></Field>
              <Field label="Razione €/capo/giorno"><NumInput value={f.feedCostHead} onChange={v => setF(x => ({ ...x, feedCostHead: v }))} decimals={2} /></Field>
            </div>}
            {isDairy && f.milkKg && f.feedCostHead ? <div className="note good">IOFC {nf(f.milkKg * milkPrice - f.feedCostHead, 2)} € per capo al giorno (latte a {nf(milkPrice, 2)} €/kg)</div> : null}
            <Field label="Note"><textarea className="input" value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} placeholder="Cosa è emerso" /></Field>
            <div className="form">
              <Field label="Prossimo passo" hint={hasNext ? `diventa un’attività per ${I.agent[cust?.agentId]?.name || 'il commerciale'}` : 'facoltativo'}><input className="input" value={f.nextAction} onChange={e => setF(x => ({ ...x, nextAction: e.target.value }))} placeholder="Es. inviare offerta" id="vi-next" /></Field>
              <Field label="Entro il"><input type="date" className="input" value={f.nextActionDue || ''} min={f.date} disabled={!hasNext} onChange={e => setF(x => ({ ...x, nextActionDue: e.target.value }))} id="vi-due" /></Field>
            </div>
            <Btn kind="primary" icon={LuPlus} disabled={!valid} onClick={add}>Registra</Btn>
          </div>
        </Panel>
      </div>
      <Panel title="Reddito sul costo alimentare nelle stalle seguite" sub="Media delle visite tecniche degli ultimi 6 mesi (€/capo/giorno) · aiuta a parlare di risultato per l’allevatore, non solo di prezzo al quintale">
        {iofc.length ? <Bars data={iofc} decimals={2} unit="€" color="var(--s3)" ariaLabel="IOFC per cliente" /> : <Empty title="Nessuna visita tecnica con IOFC negli ultimi 6 mesi" />}
      </Panel>
    </>
  );
}

/* ---------------- agenti e provvigioni ---------------- */
const SCHEME_TXT = s => [s.tiers?.length ? `scaglioni ${s.tiers.map(t => `${nf(t.pct, 1)}% da ${nf(t.from / 1000)} mila €`).join(', ')}` : `base ${nf(s.basePct, 1)}%`, Object.keys(s.byProduct || {}).length ? `prodotti ${Object.entries(s.byProduct).map(([k, v]) => `${k} ${nf(v, 1)}%`).join(', ')}` : null, `${s.accrual === 'incasso' ? 'all’incasso' : 'al fatturato'}`].filter(Boolean).join(' · ');

function Rete({ d, sel, per, scope }) {
  const { P, C, cov } = per;
  const deep = /^prov\.([^.]+)\.(\d{4}-Q[1-4])$/.exec(String(sel || ''));
  const [view, setView] = useState(deep ? 'provvigioni' : 'prestazioni');
  if (!(d.agents || []).length) return <Panel title="Agenti e provvigioni"><Empty icon={LuUserRound} title="Nessun agente in archivio">Aggiungi gli agenti con zona e provvigione da Dati › Anagrafiche: qui compariranno prestazioni, schemi provvigionali ed estratti conto.</Empty></Panel>;
  return (
    <>
      <div className="row between no-print">
        <Seg options={[{ id: 'prestazioni', label: 'Prestazioni' }, { id: 'provvigioni', label: 'Provvigioni ed estratti' }]} value={view} onChange={setView} label="Vista" />
        <span className="small muted">{scope ? 'Solo il tuo portafoglio' : 'Clic su un agente per la scheda con lo schema provvigionale'}</span>
      </div>
      {view === 'prestazioni' ? <Prestazioni d={d} P={P} C={C} cov={cov} scope={scope} /> : <Provvigioni d={d} P={P} scope={scope} deep={deep} />}
    </>
  );
}

function Prestazioni({ d, P, C, cov, scope }) {
  const ctx = ctxOf(d);
  const all = useMemo(() => agentPerformance(d, ctx, P, C), [ctx, P.key, C?.key, C?.budget, d.agents, d.offers, d.visits, d.customers, d.invoices, d.payments]);
  const rows = all.filter(r => !scope || r.id === scope);
  const hasOverdue = rows.some(r => r.overdue != null);
  const T = sum(rows, r => r.tonnes), Rv = sum(rows, r => r.revenue), M = sum(rows, r => r.mc2), Cm = sum(rows, r => r.commission);
  const TC = sum(rows, r => r.cmp?.tonnes || 0), MC = sum(rows, r => r.cmp?.mc2 || 0), RvC = sum(rows, r => r.cmp?.revenue || 0);
  const below = sum(rows, r => (r.shareBelowMinT || 0) * r.tonnes);
  const dlt = (r, k, o = {}) => (r.cmp && cov != null && cov >= 0.9 && r.cmp[k] != null && r[k] != null ? <span className="sub">{o.ratio ? sf((r[k] - r.cmp[k]) * (o.scale || 1), o.dec ?? 1) + (o.unit || '') : r.cmp[k] ? sf((r[k] / r.cmp[k] - 1) * 100) + '%' : '—'} vs {C.short}</span> : null);
  return (
    <>
      <div className="kpis">
        <Kpi label="Ricavi della rete" value={nf(Rv / 1e6, 2)} unit="M€" cmp={cmpOf(C, cov, Rv, C ? RvC : null)} foot={`${nf(T)} t · ${P.short}`} />
        <Kpi label="MdC dopo le provvigioni" value={T ? nfPm(M / T, 1) : '—'} unit={PM_LABEL} cmp={cmpOf(C, cov, T ? pm(M / T) : null, TC ? pm(MC / TC) : null, { kind: 'ratio', unit: PM_LABEL })} foot="con la provvigione dello schema di ogni agente" title="Margine di contribuzione = ricavi − costi variabili effettivi − logistica − provvigioni dello schema" />
        <Kpi label="Provvigioni del periodo" value={nf(Cm / 1000, 1)} unit="mila €" foot={`${pctTxt(Rv ? Cm / Rv : null, 2)} dei ricavi`} title="Calcolate con lo schema di ogni agente (scaglioni, prodotti, riduzione sotto il prezzo minimo)" />
        <Kpi label="Tonnellate sotto il prezzo minimo" value={T ? nf(below / T * 100, 1) : '—'} unit="%" status={T && below / T > 0.2 ? 'warn' : null} foot="prezzo sotto il minimo al costo pieno effettivo" />
      </div>
      <div className="grid g2 start">
        <Panel title="Tonnellate per agente" sub={P.short}><Bars data={rows.map(a => ({ key: a.id, label: a.name, value: a.tonnes, color: agentColor(d, a.id) }))} unit="t" ariaLabel="Tonnellate per agente" onClick={x => openDrawer('agent', x.key)} /></Panel>
        <Panel title="MdC per tonnellata dopo le provvigioni" sub="Costo effettivo dei lotti consegnati"><Bars data={rows.map(a => ({ key: a.id, label: a.name, value: pm(a.mc2T || 0), color: agentColor(d, a.id) }))} unit={PM_LABEL} decimals={pm(1000) < 10 ? 2 : 1} ariaLabel="Margine per agente" onClick={x => openDrawer('agent', x.key)} /></Panel>
      </div>
      <Panel title="Prestazioni degli agenti" sub={C && !C.budget ? `Scostamenti rispetto a ${C.short}${cov != null && cov < 0.9 ? ' (non confrontabile: dati insufficienti)' : ''}` : 'Periodo selezionato'} flush>
        <Table rows={rows} onRow={a => openDrawer('agent', a.id)} initialSort={{ key: 'revenue', dir: 'desc' }} exportName="agenti" cols={[
          { key: 'name', label: 'Agente', csv: a => a.name, render: a => <><b>{a.name}</b><span className="sub">{a.zone}</span></> },
          { key: 'customers', label: 'Clienti', align: 'r' },
          { key: 'revenue', label: 'Ricavi', align: 'r', render: a => <>{kEur(a.revenue)} mila €{dlt(a, 'revenue')}</> },
          { key: 'mc2T', label: `MdC ${PM_LABEL}`, align: 'r', csv: a => pm(a.mc2T), render: a => <>{nfPm(a.mc2T, 1)}{dlt(a, 'mc2T', { ratio: true, unit: ` ${PM_LABEL}`, scale: pm(1), dec: pmDec(1) })}</> },
          { key: 'realization', label: 'Realizzazione', align: 'r', render: a => <span title="Σ ricavi / Σ (t × listino del giorno)">{pctTxt(a.realization, 1)}</span> },
          { key: 'shareBelowMinT', label: 'Sotto il minimo', align: 'r', render: a => <span className={a.shareBelowMinT > 0.25 ? 'chip warn' : ''}>{pctTxt(a.shareBelowMinT, 0)}</span> },
          { key: 'winRateValue', label: 'Successo', align: 'r', render: a => <span title="A valore, offerte decise nel periodo">{pctTxt(a.winRateValue, 0)}</span> },
          { key: 'visitsPerCustomer', label: 'Visite/cliente', align: 'r', render: a => nf(a.visitsPerCustomer, 1) },
          { key: 'funnel', label: 'Visita → offerta', align: 'r', sort: a => a.funnel.toOffer, csv: a => a.funnel.toOffer, render: a => <span title={`${a.funnel.visits} visite → ${a.funnel.offers} offerte → ${a.funnel.accepted} accettate`}>{pctTxt(a.funnel.toOffer, 0)}</span> },
          { key: 'idleCustomers', label: 'Fermi', align: 'r', render: a => a.idleCustomers ? <Chip kind="warn">{a.idleCustomers}</Chip> : '—' },
          ...(hasOverdue ? [{ key: 'overdue', label: 'Scaduto', align: 'r', render: a => a.overdue ? <span className="chip warn">{kEur(a.overdue)} mila €</span> : '—' }] : []),
          { key: 'commission', label: 'Provvigioni', align: 'r', render: a => <>{nf(a.commission)} €<span className="sub">maturate {nf(a.accrued)}</span></> },
        ]} />
      </Panel>
    </>
  );
}

function Provvigioni({ d, P, scope, deep }) {
  const ctx = ctxOf(d); const today = appToday(d); const I = idx(d);
  const qs = quartersIn(P);
  const lc = lastClosedQuarter(today);
  const [q, setQ] = useState(deep && qs.includes(deep[2]) ? deep[2] : qs.includes(lc) ? lc : qs[0]);
  const agents = (d.agents || []).filter(a => !scope || a.id === scope);
  const [agentId, setAgent] = useState(deep && agents.some(a => a.id === deep[1]) ? deep[1] : agents[0]?.id);
  const list = useMemo(() => agents.map(a => statement(d, ctx, a.id, q)).filter(Boolean), [ctx, q, d.agents, d.invoices, d.payments, d.settings?.agentRules, scope]);
  const cur = list.find(s => s.agentId === agentId) || list[0];
  const Q = quarterRange(q);
  const csv = s => download(`estratto-${s.agent.name.toLowerCase().replace(/\W+/g, '-')}-${q}-${stamp()}.csv`, toCSV(s.rows, [
    { key: 'date', label: 'Data' }, { label: 'Cliente', value: r => I.cust[r.customerId]?.name }, { label: 'Prodotto', value: r => I.prod[r.productId]?.name }, { label: 'Fattura', value: r => r.invoice || '' },
    { label: 't', value: r => round(r.tonnes, 2) }, { label: 'Fatturato €', value: r => round(r.revenue, 2) }, { label: colUp('Prezzo'), value: r => round(up(r.price, I.prod[r.productId]), upDec(2)) }, { label: colUp('Minimo'), value: r => round(up(r.minPrice, I.prod[r.productId]), upDec(2)) }, ...(SMALL_UNITS ? [{ label: 'Unità', value: r => upLabel(I.prod[r.productId]) }] : []),
    { label: 'Aliquota %', value: r => round(r.pct, 3) }, { label: 'Origine', value: r => r.source + (r.belowMin ? ' · sotto il minimo' : '') }, { label: 'Provvigione €', value: r => round(r.amount, 2) },
    { label: 'Maturata €', value: r => round(r.accrued, 2) }, { label: 'Stato', value: r => r.state + (r.estimated ? ' (stimato)' : '') },
  ]), 'text/csv;charset=utf-8');
  if (!Q) return <Empty title="Nessun trimestre nel periodo" />;
  return (
    <>
      <Panel title={`Provvigioni del ${Q.label}`} sub={`Maturate a oggi (${dateIt(today, 'dm')}) sulle consegne del trimestre · pagamento entro il ${dateIt(list[0]?.dueDate)}`} flush
        actions={<Select value={q} onChange={v => setQ(v)} options={qs.map(x => ({ id: x, label: quarterRange(x).label + (x === quarterOf2(today) ? ' (in corso)' : '') }))} ariaLabel="Trimestre" className="slim" />}>
        <Table rows={list.map(s => ({ ...s, id: s.agentId }))} selected={cur?.agentId} onRow={s => setAgent(s.agentId)} exportName={`provvigioni-${q}`} cols={[
          { key: 'agent', label: 'Agente', sort: s => s.agent.name, csv: s => s.agent.name, render: s => <><b>{s.agent.name}</b><span className="sub" title={SCHEME_TXT(s.scheme)}>{SCHEME_TXT(s.scheme)}</span></> },
          { key: 'rev', label: 'Fatturato', align: 'r', sort: s => s.totals.revenue, csv: s => s.totals.revenue, render: s => `${kEur(s.totals.revenue)} mila €` },
          { key: 'amount', label: 'Provvigioni', align: 'r', sort: s => s.totals.amount, csv: s => s.totals.amount, render: s => <>{nf(s.totals.amount)} €<span className="sub" title="Differenza rispetto alle provvigioni al tasso standard nel conto economico">{sf(s.difference)} € vs CE</span></> },
          { key: 'mat', label: 'Maturate', align: 'r', sort: s => s.totals.maturate, csv: s => s.totals.maturate, render: s => <>{nf(s.totals.maturate)} €{s.totals.pending > 0.5 && <span className="sub">da maturare {nf(s.totals.pending)}</span>}</> },
          { key: 'ena', label: 'Enasarco agente', align: 'r', sort: s => s.totals.enasarcoAgente, csv: s => s.totals.enasarcoAgente, render: s => `${nf(s.totals.enasarcoAgente)} €` },
          { key: 'firr', label: 'FIRR', align: 'r', sort: s => s.totals.firr, csv: s => s.totals.firr, render: s => `${nf(s.totals.firr)} €` },
          { key: 'net', label: 'Netto', align: 'r', sort: s => s.totals.netto, csv: s => s.totals.netto, render: s => <b>{nf(s.totals.netto)} €</b> },
        ]} />
        <p className="xs muted com-pad">Enasarco {nf(list[0]?.enasarcoPct, 1)}% sulle provvigioni maturate, metà a carico dell’agente e metà della ditta{list.some(s => !s.massimaleSet) ? ' · massimale da impostare in Dati › Impostazioni (non applicato)' : ''}; FIRR a scaglioni annui. Valori precompilati da verificare con il consulente.{list.some(s => s.estimated) ? ' Senza fatture in archivio la maturazione è stimata: fatturato a fine mese, incasso alla scadenza contrattuale.' : ''}</p>
      </Panel>
      {cur && <div className="row between no-print com-sheet-bar">
        <span className="row gap-s"><b>Estratto conto di {cur.agent.name}</b>{!cur.massimaleSet && <Chip kind="warn" title="Senza massimale l’Enasarco si calcola su tutte le provvigioni maturate">massimale da impostare</Chip>}{cur.estimated && <Chip kind="outline">maturazione stimata</Chip>}</span>
        <span className="row gap-s"><Btn small icon={LuDownload} onClick={() => csv(cur)}>CSV dettaglio</Btn><Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa estratto</Btn><Btn small kind="ghost" onClick={() => openDrawer('agent', cur.agentId)}>Scheda agente</Btn></span>
      </div>}
      {cur && <StatementSheet d={d} s={cur} />}
    </>
  );
}
const quarterOf2 = s => `${s.slice(0, 4)}-Q${Math.ceil(+s.slice(5, 7) / 3)}`;

/** Estratto conto A4: riepilogo per cliente, totali con Enasarco, FIRR e netto, note di calcolo. */
export function StatementSheet({ d, s }) {
  const I = idx(d);
  const byC = {};
  for (const r of s.rows) { const c = (byC[r.customerId] ||= { id: r.customerId, n: 0, t: 0, rev: 0, amount: 0, accrued: 0, below: 0 }); c.n++; c.t += r.tonnes; c.rev += r.revenue; c.amount += r.amount; c.accrued += r.accrued; if (r.belowMin) c.below += r.tonnes; }
  const cs = Object.values(byC).sort((a, b) => b.rev - a.rev);
  const T = s.totals;
  return (
    <PrintPage title={`Estratto conto provvigioni · ${s.label}`} period={`${dateIt(s.from)} – ${dateIt(s.to)}`} className="com-sheet" footer={`Agente ${s.agent.name} · mandato ${s.mandate === 'pluri' ? 'plurimandatario' : 'monomandatario'} · ${SCHEME_TXT(s.scheme)}`}>
      <div className="com-sheet-hd">
        <div><span className="muted">Agente</span><b>{s.agent.name}</b><span>{s.agent.zone}</span></div>
        <div><span className="muted">Schema</span><b>{s.mandate === 'pluri' ? 'Plurimandatario' : 'Monomandatario'}</b><span>{SCHEME_TXT(s.scheme)}</span></div>
        <div><span className="muted">Pagamento entro</span><b>{dateIt(s.dueDate)}</b><span>{T.n} consegne · {nf(T.tonnes)} t</span></div>
      </div>
      <table className="t com-sheet-t"><thead><tr><th>Cliente</th><th className="r">t</th><th className="r">Fatturato €</th><th className="r">Provvigione €</th><th className="r">Maturata €</th></tr></thead>
        <tbody>{cs.map(c => <tr key={c.id}><td>{I.cust[c.id]?.name || c.id}{c.below > 0 && <span className="sub">{nf(c.below, 1)} t sotto il prezzo minimo: aliquota ridotta</span>}</td><td className="r">{nf(c.t, 1)}</td><td className="r">{nf(c.rev)}</td><td className="r">{nf(c.amount, 2)}</td><td className="r">{nf(c.accrued, 2)}</td></tr>)}</tbody>
        <tfoot><tr><td>Totale</td><td className="r">{nf(T.tonnes, 1)}</td><td className="r">{nf(T.revenue)}</td><td className="r">{nf(T.amount, 2)}</td><td className="r">{nf(T.maturate, 2)}</td></tr></tfoot></table>
      <div className="com-sheet-tot">
        <dl className="kv">
          <dt>Provvigioni maturate</dt><dd>{nf(T.maturate, 2)} €</dd>
          {T.pending > 0.005 && <><dt>Da maturare (non incluse)</dt><dd>{nf(T.pending, 2)} €</dd></>}
          <dt>Enasarco {nf(s.enasarcoPct, 1)}% {s.massimaleSet ? `(massimale ${nf(s.massimale)} €)` : '(massimale da impostare)'}</dt><dd>{nf(T.enasarco, 2)} €</dd>
          <dt>· a carico dell’agente</dt><dd>− {nf(T.enasarcoAgente, 2)} €</dd>
          <dt>· a carico della ditta</dt><dd>{nf(T.enasarcoMandante, 2)} €</dd>
          <dt>FIRR del trimestre (a carico della ditta)</dt><dd>{nf(T.firr, 2)} €</dd>
          <dt className="com-net">Netto da liquidare</dt><dd className="com-net">{nf(T.netto, 2)} €</dd>
        </dl>
        <p className="xs muted">Maturazione {s.scheme.accrual === 'incasso' ? 'all’incasso (quota pagata delle fatture)' : 'al fatturato (fattura emessa o mese chiuso)'}{s.estimated ? ', stimata senza fatture in archivio' : ''}; fatture insolute stornate. FIRR a scaglioni sulle provvigioni dell’anno ({s.firrBrackets.map(([cap, p]) => cap ? `${nf(p)}% fino a ${nf(cap)} €` : `${nf(p)}% oltre`).join(', ')}): quota del trimestre = FIRR sul cumulato meno FIRR prima del trimestre. Valori precompilati da verificare con il consulente. Al tasso standard il conto economico porta {nf(s.standardInCE, 2)} € (differenza di schema {sf(s.difference, 2)} €).</p>
      </div>
    </PrintPage>
  );
}
