/* FeedOS 17 · Area Finanza (pacchetto WP2): crediti e fidi, cassa a 13 settimane (finanza-cassa.jsx), capitale circolante,
 * rimanenze valorizzate, parametri. I numeri dei modelli portano «stimato» finché non si importano fatture e incassi;
 * le rimanenze sono una valorizzazione gestionale, non fiscale.
 * Contratto della fondazione: export Finanza({route}) e la sezione della scheda cliente CustomerCredit({d, id}). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LuMail, LuPrinter, LuX, LuArrowRight, LuInbox, LuCoins, LuFileText, LuCalendar, LuTrendingUp } from 'react-icons/lu';
import { useData, store, toast, openDrawer, closeDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { usePrefs } from '../core/prefs.js';
import { AREA_META } from '../core/roles.js';
import { ctxOf, idx, appToday } from '../core/derived.js';
import { nf, sum, dateIt, daysBetween, addDays, endOfMonth, monthLabel, pct } from '../core/util.js';
import { PM_LABEL, nfPm, fmtPm } from '../core/units.js';
import { META } from '../editions/meta.js';
import { creditSummary, ledger, invoicesOf, registerPaymentOps, allocatePaymentOps, dunningOps, AGING_BUCKETS, pdOf, lgdOf, PD_DEFAULT, LGD_DEFAULT, customerTerms, creditStart, AR_HORIZON } from '../engine/credit.js';
import { workingCapital, workingCapitalHistory, finOf, vatOf } from '../engine/cash.js';
import { inventorySummary, valuationAt, finishedAt, stockHistory, abcXyz, slowMovers, carryRate, stockStart, STOCK_HORIZON } from '../engine/inventory.js';
import { balanceCoverage } from '../engine/actuals.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, NumInput, Empty, SearchBox, filterRows, Seg, Kv, Bullet } from '../ui/ui.jsx';
import { LineChart, StackBar, Legend, SERIES } from '../ui/charts.jsx';
import { usePeriod } from '../ui/period.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { NAV } from '../app/nav.js';
import { Cassa, Definitions } from './finanza-cassa.jsx';

/* ---------- formattatori ---------- */
const mila = (v, dd = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v / 1000, dd));
const eur = (v, dd = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v, dd) + ' €');
const gg = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v));
/** Etichetta dei numeri modellati. */
export function Est({ title = 'Valore stimato dal modello: diventa reale importando fatture e incassi (Dati › Importa).' }) {
  return <Chip kind="maize" title={title}>stimato</Chip>;
}
const METHOD = { riba: 'Ri.Ba.', bonifico: 'Bonifico', sdd: 'SDD', rimessa: 'Rimessa diretta' };
const METHODS = Object.entries(METHOD).map(([id, label]) => ({ id, label }));
const STATUS = { aperta: ['', 'aperta'], parziale: ['warn', 'parziale'], pagata: ['good', 'pagata'], insoluta: ['crit', 'insoluta'], contestata: ['serious', 'contestata'] };
const AGING_COLORS = { oltre60: 'var(--seq-7)', b31_60: 'var(--seq-5)', b0_30: 'var(--seq-3)', b1_30: 'var(--warn)', b31_60s: 'var(--serious)', b61_90: 'var(--crit)', oltre90: 'color-mix(in srgb, var(--crit) 62%, #000)' };
const agingColor = b => (b.group === 'scaduto' && b.id === 'b31_60' ? AGING_COLORS.b31_60s : AGING_COLORS[b.id]);
const RISK_TXT = { A: 'Rischio basso', B: 'Rischio moderato', C: 'Rischio elevato', D: 'Rischio molto elevato' };

/** Esc chiude la finestra (in cattura: la scheda laterale sotto non lo riceve). */
function useEsc(onClose) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
}

/* ======================================================================== */
export function Finanza({ route }) {
  const d = useData();
  const tabs = NAV.finanza.tabs;
  const tab = tabs.some(t => t.id === route.tab) ? route.tab : tabs[0].id;
  return (
    <>
      <PageHead title="Finanza" lead={AREA_META.finanza.lead} tabs={tabs} tab={tab} onTab={x => go('finanza', x)} />
      {tab === 'crediti' && <Crediti d={d} sel={route.id} />}
      {tab === 'cassa' && <Cassa d={d} />}
      {tab === 'circolante' && <Circolante d={d} />}
      {tab === 'rimanenze' && <Rimanenze d={d} sel={route.id} />}
      {tab === 'parametri' && <Parametri d={d} />}
    </>
  );
}

const hasSales = d => (d.shipments || []).length > 0 || (d.invoices || []).length > 0;
function NoData({ title = 'Nessun credito da mostrare' }) {
  return (
    <Panel>
      <Empty icon={LuInbox} title={title}>
        <p>I crediti nascono dalle consegne ai clienti (stimati) o dalle fatture e dagli incassi importati da Dati › Importa.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Btn kind="primary" onClick={() => go('dati', 'importa')}>Importa fatture e incassi</Btn></div>
      </Empty>
    </Panel>
  );
}

/* ======================================================================== */
/* ---------------- crediti e fidi ---------------- */
function Crediti({ d, sel }) {
  const ctx = ctxOf(d), today = ctx.today, I = idx(d);
  const { P, C, cov } = usePeriod(d);
  const role = usePrefs(p => p.role), agentId = usePrefs(p => p.agentId);
  // saldi alla fine del periodo scelto (a oggi se il periodo è in corso); incassi e solleciti si registrano sempre a oggi
  const asOf = P.to < today ? P.to : today, past = asOf < today;
  const cs = creditSummary(d, asOf);
  const csNow = past ? creditSummary(d, today) : cs;
  const cTo = C && !C.budget ? (C.to < today ? C.to : today) : null;
  const csC = cTo ? creditSummary(d, cTo) : null;
  // un saldo alla data di confronto è confrontabile solo se i dati dei crediti cominciano abbastanza prima
  const covB = cTo ? Math.min(cov ?? 1, balanceCoverage(cTo, creditStart(d), AR_HORIZON)) : cov;
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('tutti');
  const [pay, setPay] = useState(null);
  const [letter, setLetter] = useState(null);
  // #finanza.crediti.incasso (barra comandi) apre «Registra incasso»; #finanza.crediti.<cliente> (dai segnali) apre la sua scheda
  useEffect(() => {
    if (sel === 'incasso') setPay({ custId: null });
    else if (sel && (d.customers || []).some(c => c.id === sel)) openDrawer('customer', sel);
  }, [sel]);
  const est = cs.source !== 'fatture';
  const flows = usePeriodFlows(d, P, today);
  if (!hasSales(d)) return <NoData />;
  const agentView = role === 'agente' && agentId;
  const all = d.customers.filter(c => !agentView || c.agentId === agentId).map(c => ({ ...cs.byCustomer[c.id], id: c.id, name: c.name, code: c.code, agent: I.agent[c.agentId]?.name, terms: customerTerms(c, d.settings) }))
    .filter(r => r.active || r.creditLimit);
  const counts = { scaduti: all.filter(r => r.overdue > 0.5).length, fido: all.filter(r => r.util != null && r.util >= 0.9).length, rischio: all.filter(r => r.riskClass === 'C' || r.riskClass === 'D').length };
  const view = filterRows(all.filter(r => flt === 'tutti' || (flt === 'scaduti' ? r.overdue > 0.5 : flt === 'fido' ? r.util != null && r.util >= 0.9 : r.riskClass === 'C' || r.riskClass === 'D')), q, ['name', 'code', 'agent']);
  const od30pct = cs.open > 0 ? cs.overdue30 / cs.open : 0;
  const ag = cs.aging;
  const sollecito = r => {
    const ops = dunningOps(d, r.id, today);
    if (!ops.length) { toast('Nessuno scaduto da sollecitare per ' + r.name, 'err'); return; }
    store.batch(ops, `Sollecito di pagamento: ${r.name}`);
    toast('Attività di sollecito assegnata all’Amministrazione: lettera pronta da stampare', 'ok', { label: 'Annulla', fn: () => store.undo() });
    setLetter(r.id);
  };
  const riskTip = r => `${RISK_TXT[r.riskClass]} · ${nf(r.score, 1)}/100\n` + (r.breakdown || []).map(p => `${p.label}: ${nf(p.points, 1)} su ${p.max}`).join('\n');
  return (
    <>
      {est && <div className="note maize">{cs.source === 'stimato'
        ? <>Fatture <b>stimate dalle consegne</b>: una per cliente e mese, a fine mese, con i termini del cliente; le scadenze passate si considerano incassate. Importa fatture e incassi da Dati › Importa per scaduto, ritardi e rischio reali.</>
        : <>Una parte dei crediti ({eur(cs.estimatedOpen)}) viene da fatture stimate dalle consegne non ancora coperte da fatture registrate.</>}</div>}
      {past && <div className="note">Saldi al <b>{dateIt(asOf)}</b>, fine del periodo scelto{cTo ? `, confrontati con il ${dateIt(cTo)}` : ''}. Incassi e solleciti si registrano comunque a oggi ({dateIt(today)}).</div>}
      <div className="kpis">
        <Kpi label={<>Crediti aperti {est && <Est />}</>} value={mila(cs.open)} unit="mila €" raw={cs.open}
          cmp={csC ? { cur: cs.open, value: csC.open, kind: 'flow', good: 'down', label: 'al ' + dateIt(cTo, 'dm'), cov: covB } : undefined}
          foot={`${cs.nOpen} partite al ${dateIt(asOf, 'dm')}`} title="Residuo delle fatture emesse e non incassate alla data (IVA compresa)" />
        <Kpi label={<>Scaduto {est && <Est />}</>} value={mila(cs.overdue)} unit="mila €" status={od30pct > 0.15 ? 'bad' : od30pct > 0.08 ? 'warn' : 'ok'}
          foot={`oltre 30 gg ${mila(cs.overdue30)} mila · ${pct(od30pct, 1)}`} title="Partite oltre la scadenza; il pallino guarda la quota scaduta da oltre 30 giorni (8% attenzione, 15% critico)" onClick={() => setFlt('scaduti')} />
        <Kpi label={<>DSO a ritroso {est && <Est />}</>} value={gg(cs.dso)} unit="giorni" status={cs.dso != null && cs.dsoContract != null ? (cs.dso - cs.dsoContract > 20 ? 'bad' : cs.dso - cs.dsoContract > 10 ? 'warn' : 'ok') : null}
          cmp={csC?.dso != null ? { cur: cs.dso, value: csC.dso, kind: 'ratio', good: 'down', unit: 'gg', decimals: 0, label: 'al ' + dateIt(cTo, 'dm'), cov: covB } : undefined}
          foot={`contrattuale ${gg(cs.dsoContract)} gg`} title="Giorni di vendite lorde più recenti che servono a coprire i crediti aperti, mese per mese a ritroso dalla data. Il contrattuale è la media dei giorni di pagamento concordati, pesata sui ricavi dei 12 mesi." />
        <Kpi label="Fatture da emettere" value={mila(cs.uninvoiced.gross)} unit="mila €" foot={`${cs.uninvoiced.customers} clienti · si emettono il ${dateIt(endOfMonth(asOf), 'dm')}`} title="Consegne del mese non ancora fatturate alla data (IVA compresa)" />
        <Kpi label={<>Perdita attesa <Est title="Esposizione × probabilità di insolvenza della classe × perdita in caso di insolvenza (Parametri)." /></>} value={mila(cs.expectedLoss, 1)} unit="mila €" foot={`svalutazione suggerita ${mila(cs.writeDown, 1)} mila`} title="Svalutazione suggerita: scaduto 1–30 gg × 1%, 31–60 × 5%, 61–90 × 20%, oltre 90 × 50%" />
        <Kpi label="Clienti oltre il fido" value={cs.overLimit} status={cs.overLimit ? 'bad' : cs.nearLimit ? 'warn' : 'ok'} foot={`${cs.nearLimit} sopra il 90%`} onClick={() => setFlt('fido')} title="Esposizione = crediti aperti + consegne da fatturare + offerte accettate da consegnare, tutto IVA compresa" />
      </div>

      <div className="split">
        <Panel title="Anzianità dei crediti" sub={`${eur(ag.total)} al ${dateIt(asOf)} · a scadere e scaduto per fascia di giorni`} id="fin-aging">
          <StackBar showLabels={false} height={26} ariaLabel="Composizione dei crediti per anzianità"
            parts={AGING_BUCKETS.slice(0, 3).reverse().concat(AGING_BUCKETS.slice(3)).map(b => ({ key: b.group + b.id, label: (b.group === 'scaduto' ? 'Scaduto ' : 'A scadere ') + b.short + ' gg', value: ag[b.group][b.id], color: agingColor(b), abs: eur(ag[b.group][b.id]) }))} />
          <div className="fin-aging">
            {['aScadere', 'scaduto'].map(g => (
              <div key={g}>
                <div className="eyebrow">{g === 'scaduto' ? `Scaduto · ${eur(sum(Object.values(ag.scaduto)))}` : `A scadere · ${eur(sum(Object.values(ag.aScadere)))}`}</div>
                <table className="t fin-mini"><tbody>
                  {AGING_BUCKETS.filter(b => b.group === g).map(b => (
                    <tr key={b.id}><td><i className="key" style={{ background: agingColor(b) }} />{b.short} giorni</td><td className="r">{eur(ag[g][b.id])}</td><td className="r muted">{pct(ag.total ? ag[g][b.id] / ag.total : 0, 1)}</td></tr>
                  ))}
                </tbody></table>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Nel periodo" sub={P.label} id="fin-flows">
          <Kv items={[
            ['Fatturato (IVA compresa)', <>{eur(flows.invoiced)} <span className="muted small">· {flows.nInv} fatture{flows.estInv ? ' stimate' : ''}</span></>],
            ['Incassato', flows.nPay ? <>{eur(flows.collected)} <span className="muted small">· {flows.nPay} incassi</span></> : <span className="muted">nessun incasso registrato</span>],
            ['Ritardo medio sugli incassi', flows.nPay ? `${nf(flows.delay, 1)} giorni dopo la scadenza` : '—'],
            ['Insoluti', flows.insolute.n ? `${flows.insolute.n} · ${eur(flows.insolute.amount)}` : 'nessuno'],
            ['DSO contrattuale del periodo', `${gg(flows.dsoContract)} giorni`],
          ]} />
          <div className="fin-classes" aria-label="Clienti per classe di rischio">
            {['A', 'B', 'C', 'D'].map(k => (
              <div key={k} className={`fin-class rk-${k}`} title={`${RISK_TXT[k]}: probabilità di insolvenza ${nf(pdOf(d)[k], 1)}%`}>
                <b>{cs.classes[k]}</b><span>classe {k}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Clienti" sub={`Esposizione, fido, ritardo e classe di rischio al ${dateIt(asOf)} · clic per la scheda con l’estratto conto di oggi`} flush id="fin-clienti"
        actions={<>
          <SearchBox value={q} onChange={setQ} placeholder="Cerca cliente o agente" id="fin-search" />
          <Seg label="Filtro clienti" value={flt} onChange={setFlt} options={[{ id: 'tutti', label: 'Tutti' }, { id: 'scaduti', label: `Scaduti ${counts.scaduti}` }, { id: 'fido', label: `Fido ≥ 90% ${counts.fido}` }, { id: 'rischio', label: `Classe C–D ${counts.rischio}` }]} />
          <Btn small kind="primary" icon={LuCoins} onClick={() => setPay({ custId: null })}>Registra incasso</Btn>
        </>}>
        <Table rows={view} rowKey={r => r.id} selected={sel} onRow={r => openDrawer('customer', r.id)} initialSort={{ key: 'exposure', dir: 'desc' }} exportName="crediti-clienti" pageSize={50}
          empty={agentView ? 'Nessun cliente con crediti nel portafoglio di questo agente' : 'Nessun cliente con questi criteri'}
          cols={[
            { key: 'name', label: 'Cliente', render: r => <><b>{r.name}</b><span className="sub">{r.agent || '—'} · {r.terms.days} gg {r.terms.endOfMonth ? 'f.m.' : ''} · {METHOD[r.terms.method] || r.terms.method}</span></> },
            { key: 'exposure', label: 'Esposizione', align: 'r', render: r => <>{eur(r.exposure)}<span className="sub">aperti {mila(r.open)}{r.uninvoiced > 0.5 ? ` · da fatt. ${mila(r.uninvoiced)}` : ''}{r.offers > 0.5 ? ` · offerte ${mila(r.offers)}` : ''}</span></> },
            { key: 'creditLimit', label: 'Fido', align: 'r', width: 150, csv: r => r.creditLimit ?? '', render: r => r.creditLimit ? <div className="fin-bullet" title={`Esposizione ${eur(r.exposure)} su fido ${eur(r.creditLimit)}`}><Bullet value={r.exposure} lo={0} hi={Math.max(r.creditLimit, r.exposure) * 1.08} max={r.creditLimit} /><span className="sub">{eur(r.creditLimit)}</span></div> : <span className="muted">non fissato</span> },
            { key: 'util', label: 'Utilizzo', align: 'r', csv: r => (r.util == null ? '' : Math.round(r.util * 1000) / 10), render: r => r.util == null ? '—' : <span className={r.util >= 1 ? 'chip crit' : r.util >= 0.9 ? 'chip warn' : ''}>{pct(r.util, 0)}</span> },
            { key: 'avgDelay', label: 'Ritardo medio', align: 'r', csv: r => Math.round(r.avgDelay * 10) / 10, render: r => r.nPaid12 ? <>{nf(r.avgDelay)} gg{r.delay3 != null && r.delay3 > r.avgDelay + 5 && <span className="sub fin-worse" title="Ritardo degli ultimi 3 mesi"><LuTrendingUp aria-hidden="true" /> {nf(r.delay3)} gg (3 mesi)</span>}</> : <span className="muted">—</span> },
            { key: 'score', label: 'Rischio', align: 'r', csv: r => `${r.riskClass} ${Math.round(r.score)}`, render: r => <span className={`rk rk-${r.riskClass}`} title={riskTip(r)}>{r.riskClass} · {nf(r.score)}{r.insoluta && <i className="fin-ins" aria-label="insoluto"> ins.</i>}</span> },
            { key: 'overdue', label: 'Scaduto', align: 'r', render: r => r.overdue > 0.5 ? <>{eur(r.overdue)}<span className="sub">{r.overdue60 > 0.5 ? `oltre 60 gg ${mila(r.overdue60)} mila` : `da ${daysBetween(r.oldestDue, today)} gg`}</span></> : <span className="muted">—</span> },
            { key: 'act', label: <span className="sr">Azioni</span>, nosort: true, csv: false, render: r => (
              <span className="row gap-s fin-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <Btn small icon={LuCoins} title={`Registra un incasso di ${r.name}`} disabled={!(csNow.byCustomer[r.id]?.open > 0.5)} onClick={() => setPay({ custId: r.id })} />
                <Btn small icon={LuMail} title={csNow.byCustomer[r.id]?.overdue > 0.5 ? `Sollecito di pagamento a ${r.name}` : 'Nessuno scaduto da sollecitare oggi'} disabled={!(csNow.byCustomer[r.id]?.overdue > 0.5)} onClick={() => sollecito(r)} />
              </span>) },
          ]} />
      </Panel>
      <Definitions items={[
        ['DSO a ritroso', 'Si sottraggono dai crediti aperti le vendite lorde del mese in corso, poi di quello prima e così via: i giorni dei mesi consumati per intero più la quota dell’ultimo. Misura quanti giorni di vendite sono ancora da incassare.'],
        ['DSO contrattuale', 'Σ ricavi × giorni di pagamento concordati ÷ Σ ricavi negli ultimi 12 mesi. La differenza col DSO a ritroso viene dalla fatturazione a fine mese e dai ritardi.'],
        ['Esposizione e fido', 'Crediti aperti + consegne da fatturare + offerte accettate non ancora consegnate, tutto IVA compresa. Utilizzo = esposizione ÷ fido accordato.'],
        ['Punteggio di rischio (0–100)', '35 × scaduto oltre 60 gg ÷ esposizione + 25 × ritardo medio ÷ 60 gg + 15 se il ritardo degli ultimi 3 mesi peggiora di oltre 5 giorni + 15 × utilizzo del fido + 10 con un insoluto nei 12 mesi. Classi: A < 20, B < 40, C < 60, D ≥ 60.'],
        ['Perdita attesa', `Esposizione × probabilità di insolvenza della classe (A ${nf(pdOf(d).A, 1)}%, B ${nf(pdOf(d).B, 1)}%, C ${nf(pdOf(d).C, 1)}%, D ${nf(pdOf(d).D, 1)}%) × perdita in caso di insolvenza ${nf(lgdOf(d))}%.`],
      ]} />
      {pay && <PayModal d={d} custId={pay.custId} onClose={() => { setPay(null); if (sel === 'incasso') go('finanza', 'crediti'); }} />}
      {letter && <DunningSheet d={d} custId={letter} onClose={() => setLetter(null)} />}
    </>
  );
}

/** Fatturato, incassi, ritardo e insoluti del periodo P. */
function usePeriodFlows(d, P, today) {
  return useMemo(() => {
    const to = P.to < today ? P.to : today;
    const invs = invoicesOf(d, today).filter(i => i.date >= P.from && i.date <= to);
    const byId = new Map(invoicesOf(d, today).map(i => [i.id, i]));
    let collected = 0, w = 0, a = 0, nPay = 0;
    for (const p of d.payments || []) {
      if (!p.date || p.date < P.from || p.date > to) continue;
      collected += +p.amount || 0; nPay++;
      const inv = byId.get(p.invoiceId);
      if (inv?.dueDate) { const x = Math.abs(+p.amount || 0); w += x; a += x * daysBetween(inv.dueDate, p.date); }
    }
    const ins = (d.invoices || []).filter(i => i.status === 'insoluta' && (i.insolutoAt || i.dueDate) >= P.from && (i.insolutoAt || i.dueDate) <= to);
    let rw = 0, rd = 0;
    const cust = Object.fromEntries((d.customers || []).map(c => [c.id, c]));
    for (const s of d.shipments || []) if (s.date >= P.from && s.date <= to) { const v = s.tonnes * s.price; rw += v; rd += v * customerTerms(cust[s.customerId], d.settings).days; }
    return { invoiced: sum(invs, i => i.total), nInv: invs.length, estInv: invs.some(i => i.estimated), collected, nPay, delay: w ? a / w : null,
      insolute: { n: ins.length, amount: sum(ins, i => i.total) }, dsoContract: rw ? rd / rw : null };
  }, [d.invoices, d.payments, d.shipments, d.customers, d.settings?.finance, P.from, P.to, today]);
}

/* ---------------- registra incasso ---------------- */
/** Finestra «Registra incasso»: un cliente, una fattura o la ripartizione sulle più vecchie, importo anche parziale. */
export function PayModal({ d, custId: initial, onClose }) {
  const today = appToday(d);
  const L = ledger(d, today);
  const cust = useMemo(() => d.customers.filter(c => (L.byCust[c.id]?.open || 0) > 0.5).sort((a, b) => a.name.localeCompare(b.name, 'it')), [d.customers, L]);
  const [c, setC] = useState(initial && L.byCust[initial]?.open > 0.5 ? initial : cust[0]?.id || '');
  const items = (L.byCust[c]?.items || []).filter(i => i.residual > 0.005);
  const [target, setTarget] = useState('auto');
  const due = target === 'auto' ? sum(items.filter(i => i.status !== 'contestata'), i => i.residual) : items.find(i => i.id === target)?.residual || 0;
  const [amount, setAmount] = useState(Math.round(due * 100) / 100);
  const [date, setDate] = useState(today);
  const custObj = d.customers.find(x => x.id === c);
  const [method, setMethod] = useState(customerTerms(custObj, d.settings).method);
  useEffect(() => { setTarget('auto'); setMethod(customerTerms(d.customers.find(x => x.id === c), d.settings).method); }, [c]);
  useEffect(() => { setAmount(Math.round(due * 100) / 100); }, [c, target]);
  const close = React.useCallback(() => onClose(), [onClose]);
  useEsc(close);
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('select, input')?.focus(); }, []);
  const err = !c ? 'Nessun cliente con crediti aperti' : !(amount > 0) ? 'Indica un importo maggiore di zero' : amount > due + 0.01 ? `L’importo supera il residuo da incassare (${eur(due, 2)})` : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Data non valida' : date > addDays(today, 31) ? 'Data troppo nel futuro' : null;
  const ok = () => {
    if (err) return;
    let ops, label;
    if (target === 'auto') { const r = allocatePaymentOps(d, c, { date, amount, method }, today); ops = r.ops; label = `Incasso di ${eur(amount, 2)} da ${custObj?.name} su ${r.n} ${r.n === 1 ? 'fattura' : 'fatture'}`; }
    else { ops = registerPaymentOps(d, target, { date, amount, method }, today); const inv = items.find(i => i.id === target); label = `Incasso di ${eur(amount, 2)} da ${custObj?.name} (${inv?.number || 'fattura stimata'})`; }
    if (!ops.length) { toast('Niente da registrare', 'err'); return; }
    // force: l'incasso (e la registrazione della fattura stimata che lo riceve) non cambia ricavi né costi, solo crediti e cassa:
    // deve poter riguardare fatture di mesi già chiusi
    const done = store.batch(ops, label, { force: true });
    if (done) { toast(label, 'ok', { label: 'Annulla', fn: () => store.undo() }); close(); }
  };
  return (
    <>
      <div className="scrim fin-scrim" onClick={close} />
      <div className="modal fin-modal" role="dialog" aria-modal="true" aria-label="Registra incasso" ref={box}>
        <div className="hd"><h3>Registra incasso</h3><p className="small muted">Un incasso parziale lascia la fattura «parziale» con il residuo; si annulla con Ctrl+Z.</p></div>
        <div className="bd">
          {!cust.length ? <Empty title="Nessun credito aperto">Non ci sono fatture da incassare.</Empty> : <>
            <Field label="Cliente"><Select value={c} onChange={setC} options={cust.map(x => ({ id: x.id, label: `${x.name} · ${eur(L.byCust[x.id].open)}` }))} ariaLabel="Cliente" /></Field>
            <div className="fin-pick" role="radiogroup" aria-label="Fattura">
              <label className={`fin-opt ${target === 'auto' ? 'on' : ''}`}><input type="radio" name="fin-inv" checked={target === 'auto'} onChange={() => setTarget('auto')} />
                <span><b>Ripartisci sulle più vecchie</b><small>{items.length} partite aperte · {eur(sum(items.filter(i => i.status !== 'contestata'), i => i.residual), 2)}{items.some(i => i.status === 'contestata') ? ' (contestate escluse)' : ''}</small></span></label>
              {items.slice(0, 8).map(i => (
                <label key={i.id} className={`fin-opt ${target === i.id ? 'on' : ''}`}><input type="radio" name="fin-inv" checked={target === i.id} onChange={() => setTarget(i.id)} />
                  <span><b>{i.number || 'Fattura stimata'} · {dateIt(i.date, 'dm')}</b><small>{i.daysOverdue > 0 ? `scaduta da ${i.daysOverdue} gg` : `scade il ${dateIt(i.dueDate, 'dm')}`}{i.status !== 'aperta' ? ` · ${STATUS[i.status]?.[1] || i.status}` : ''}</small></span>
                  <span className="r">{eur(i.residual, 2)}</span></label>
              ))}
              {items.length > 8 && <span className="small muted">e altre {items.length - 8}: usa la ripartizione</span>}
            </div>
            <div className="form">
              <Field label="Importo €" hint={`residuo ${eur(due, 2)}`}><NumInput value={amount} decimals={2} min={0} onChange={v => setAmount(v ?? 0)} ariaLabel="Importo" /></Field>
              <Field label="Data dell’incasso"><input type="date" className="input" value={date} max={addDays(today, 31)} onChange={e => setDate(e.target.value)} aria-label="Data dell’incasso" /></Field>
              <Field label="Mezzo"><Select value={method} onChange={setMethod} options={METHODS} ariaLabel="Mezzo di pagamento" /></Field>
            </div>
            {err && <div className="note warn small" role="status">{err}</div>}
          </>}
        </div>
        <div className="ft">
          <Btn onClick={close} data-cancel="">Annulla</Btn>
          <Btn kind="primary" icon={LuCoins} onClick={ok} disabled={!!err} data-ok="">Registra</Btn>
        </div>
      </div>
    </>
  );
}

/* ---------------- lettera di sollecito ---------------- */
function DunningSheet({ d, custId, onClose }) {
  const today = appToday(d);
  const c = d.customers.find(x => x.id === custId);
  const L = ledger(d, today);
  const over = (L.byCust[custId]?.items || []).filter(i => i.daysOverdue > 0 && i.residual > 0.005);
  const co = d.settings?.company || {};
  const close = React.useCallback(() => onClose(), [onClose]);
  useEsc(close);
  const tot = sum(over, i => i.residual);
  return (
    <div className="fin-sheet" role="dialog" aria-modal="true" aria-label="Lettera di sollecito">
      <div className="fin-sheet-bar no-print">
        <LuFileText aria-hidden="true" /><b>Lettera di sollecito</b><span className="muted small">anteprima A4 · si stampa solo il foglio</span>
        <span className="sp" />
        <Btn kind="primary" icon={LuPrinter} onClick={printNow}>Stampa</Btn>
        <Btn icon={LuX} onClick={close}>Chiudi</Btn>
      </div>
      <PrintPage title="Sollecito di pagamento" footer="Lettera generata con FeedOS: verificare importi e coordinate prima dell’invio">
        <div className="fin-letter">
          <div className="to"><b>Spett.le {c?.name}</b><span>{c?.city}{c?.province ? ` (${c.province})` : ''}</span><span>Alla c.a. dell’amministrazione</span></div>
          <p><b>Oggetto: sollecito di pagamento per fatture scadute</b></p>
          <p>Gentili Signori, dalle nostre registrazioni al {dateIt(today, 'long')} risultano non ancora saldate le seguenti fatture:</p>
          <table className="t">
            <thead><tr><th>Fattura</th><th>Data</th><th>Scadenza</th><th className="r">Importo</th><th className="r">Già pagato</th><th className="r">Da saldare</th></tr></thead>
            <tbody>{over.map(i => <tr key={i.id}><td>{i.number || 'in emissione'}</td><td>{dateIt(i.date)}</td><td>{dateIt(i.dueDate)}</td><td className="r">{eur(i.total, 2)}</td><td className="r">{i.paid > 0 ? eur(i.paid, 2) : '—'}</td><td className="r">{eur(i.residual, 2)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={5}>Totale da saldare</td><td className="r">{eur(tot, 2)}</td></tr></tfoot>
          </table>
          <p>Vi chiediamo di provvedere al pagamento entro 10 giorni dal ricevimento della presente, con bonifico sulle coordinate {co.iban ? <>IBAN <b>{co.iban}</b></> : 'bancarie indicate in fattura'}, citando i numeri delle fatture.</p>
          <p>Se il pagamento è già stato disposto, vi preghiamo di considerare superata questa comunicazione e di inviarci gli estremi del bonifico. Restiamo a disposizione per qualunque chiarimento.</p>
          <p className="sign">Distinti saluti<br /><b>Amministrazione</b><br />{co.name || ''}</p>
        </div>
      </PrintPage>
    </div>
  );
}

/* ======================================================================== */
/* ---------------- sezione «Crediti» della scheda cliente ---------------- */
/** Sezione «Crediti e fido» della scheda cliente: esposizione e fido, scaduto, classe, estratto conto con saldo progressivo, incasso. */
export function CustomerCredit({ d, id }) {
  const today = appToday(d);
  const role = usePrefs(p => p.role);
  const [pay, setPay] = useState(false);
  const c = d.customers.find(x => x.id === id);
  if (!c || !hasSales(d)) return null;
  const cs = creditSummary(d, today);
  const b = cs.byCustomer[id];
  if (!b) return null;
  const L = ledger(d, today);
  const items = L.byCust[id]?.items || [];
  const est = cs.source !== 'fatture';
  const t = customerTerms(c, d.settings);
  let run = 0;
  const rows = items.map(i => { run += i.residual; return { ...i, run }; });
  const lim = b.creditLimit;
  const upd = (patch, label) => store.update('customers', id, patch, label);
  return (
    <div className="dsec fin-cc">
      <div className="row between"><div className="eyebrow">Crediti e fido {est && <Est />}</div>
        <span className={`rk rk-${b.riskClass}`} title={(b.breakdown || []).map(p => `${p.label}: ${nf(p.points, 1)} su ${p.max}`).join('\n')}>Classe {b.riskClass} · {nf(b.score)}/100</span></div>
      <div className="fin-cc-top">
        <div>
          <div className="fin-cc-n"><b>{eur(b.exposure)}</b><span>esposizione{lim ? ` su ${eur(lim)} di fido (${pct(b.util, 0)})` : ''}</span></div>
          {lim ? <Bullet value={b.exposure} lo={0} hi={Math.max(lim, b.exposure) * 1.08} max={lim} /> : <span className="small muted">Fido non fissato.</span>}
          <span className="small muted">aperti {eur(b.open)}{b.uninvoiced > 0.5 ? ` · da fatturare ${eur(b.uninvoiced)}` : ''}{b.offers > 0.5 ? ` · offerte accettate ${eur(b.offers)}` : ''}</span>
        </div>
        <Kv items={[
          ['Scaduto', b.overdue > 0.5 ? <span className="fin-red">{eur(b.overdue)}{b.overdue60 > 0.5 ? ` · oltre 60 gg ${eur(b.overdue60)}` : ''}</span> : 'nessuno'],
          ['Ritardo medio', b.nPaid12 ? `${nf(b.avgDelay)} giorni (12 mesi)${b.delay3 != null ? ` · ${nf(b.delay3)} negli ultimi 3` : ''}` : '—'],
          ['Perdita attesa', <>{eur(b.expectedLoss)} <Est title="Esposizione × probabilità di insolvenza della classe × perdita in caso di insolvenza." /></>],
          b.insoluta ? ['Insoluti', <span className="fin-red">almeno uno negli ultimi 12 mesi</span>] : null,
        ]} />
      </div>
      {role === 'agente' ? (
        // fido e termini li decide l'amministrazione: l'agente li vede soltanto
        <Kv items={[['Fido accordato', lim ? eur(lim) : 'non fissato'], ['Termini', `${t.days} giorni ${t.endOfMonth ? 'data fattura fine mese' : 'data fattura'} · ${METHOD[t.method] || t.method}`]]} />
      ) : (
        <div className="form">
          <Field label="Fido accordato €"><NumInput value={c.creditLimit ?? null} decimals={0} min={0} step={5000} onChange={v => (v ?? null) !== (c.creditLimit ?? null) && upd({ creditLimit: v }, `Fido di ${c.name}: ${v == null ? 'non fissato' : eur(v)}`)} ariaLabel="Fido accordato" /></Field>
          <Field label={`Giorni di pagamento ${t.endOfMonth ? '(d.f.f.m.)' : '(d.f.)'}`}><NumInput value={t.days} decimals={0} min={0} max={365} onChange={v => v != null && v !== t.days && upd({ terms: { ...t, days: v } }, `Termini di ${c.name}: ${v} giorni`)} ariaLabel="Giorni di pagamento" /></Field>
          <Field label="Mezzo"><Select value={t.method} onChange={v => upd({ terms: { ...t, method: v } }, `Mezzo di pagamento di ${c.name}: ${METHOD[v]}`)} options={METHODS} ariaLabel="Mezzo di pagamento" /></Field>
        </div>
      )}
      {rows.length ? (
        <div className="tw fin-stmt">
          <table className="t">
            <caption className="sr">Estratto conto delle partite aperte</caption>
            <thead><tr><th>Fattura</th><th>Scadenza</th><th className="r">Residuo</th><th className="r" title="Somma dei residui dalla scadenza più vecchia">Progressivo</th></tr></thead>
            <tbody>{rows.map(i => {
              const st = i.status !== 'aperta' ? i.status : i.daysOverdue > 0 ? 'scaduta' : null;
              return (
                <tr key={i.id}>
                  <td>{i.number ? <span className="code">{i.number}</span> : <span className="muted">stimata</span>}<span className="sub">{dateIt(i.date, 'dm')} · {eur(i.total)}</span></td>
                  <td>{dateIt(i.dueDate)}<span className="sub">{st && <span className={`fin-st ${st === 'scaduta' ? 'warn' : STATUS[st]?.[0] || ''}`}>{STATUS[st]?.[1] || st}</span>}{i.daysOverdue > 0 ? `${st === 'scaduta' ? '' : 'scaduta '}da ${i.daysOverdue} gg` : `tra ${daysBetween(today, i.dueDate)} gg`}</span></td>
                  <td className="r">{eur(i.residual, 2)}</td><td className="r">{eur(i.run, 2)}</td>
                </tr>);
            })}</tbody>
            <tfoot><tr><td colSpan={2}>Totale aperto</td><td className="r">{eur(b.open, 2)}</td><td /></tr></tfoot>
          </table>
        </div>
      ) : <span className="small muted">Nessuna fattura aperta.</span>}
      <div className="row gap-s">
        <Btn small kind="primary" icon={LuCoins} disabled={!(b.open > 0.5)} onClick={() => setPay(true)}>Registra incasso</Btn>
        {role !== 'agente' && <Btn small icon={LuArrowRight} onClick={() => { closeDrawer(); go('finanza', 'crediti', id); }}>Crediti e fidi</Btn>}
      </div>
      {pay && <PayModal d={d} custId={id} onClose={() => setPay(false)} />}
    </div>
  );
}

/* ======================================================================== */
/* ---------------- capitale circolante ---------------- */
function Circolante({ d }) {
  const ctx = ctxOf(d), today = ctx.today;
  const { P, C, cov } = usePeriod(d);
  // saldi alla fine del periodo scelto (a oggi se il periodo è in corso)
  const asOf = P.to < today ? P.to : today;
  const w = useMemo(() => workingCapital(d, ctx, asOf), [d, ctx, asOf]);
  const cTo = C && !C.budget ? (C.to < today ? C.to : today) : null;
  const wc = useMemo(() => (cTo ? workingCapital(d, ctx, cTo) : null), [d, ctx, cTo]);
  const hist = useMemo(() => workingCapitalHistory(d, ctx, 12, asOf), [d, ctx, asOf]);
  if (!hasSales(d) && !(d.ingLots || []).length) return <NoData title="Nessun dato per il capitale circolante" />;
  // saldi confrontabili solo se crediti, lotti e debiti verso fornitori (dai lotti ricevuti) hanno dati abbastanza prima della data
  const covB = cTo ? Math.min(cov ?? 1, balanceCoverage(cTo, creditStart(d), AR_HORIZON), balanceCoverage(cTo, stockStart(d), STOCK_HORIZON), balanceCoverage(cTo, stockStart(d, 'mp'), AR_HORIZON)) : cov;
  const cmp = (cur, val, good = 'down', kind = 'flow', unit) => (wc && val != null ? { cur, value: val, kind, good, unit, decimals: 0, label: 'al ' + dateIt(cTo, 'dm'), cov: covB } : undefined);
  const parts = [
    { key: 'arI', label: 'Crediti fatturati', value: w.arInvoiced, color: SERIES[0], abs: eur(w.arInvoiced) },
    { key: 'arU', label: 'Da fatturare', value: w.arUninvoiced, color: SERIES[2], abs: eur(w.arUninvoiced) },
    { key: 'mp', label: 'Materie prime', value: w.mp, color: SERIES[1], abs: eur(w.mp) },
    { key: 'fg', label: 'Prodotto finito', value: w.fg, color: SERIES[6], abs: eur(w.fg) },
  ];
  const maxD = Math.max(1, (w.dio || 0) + (w.dso || 0), w.dpo || 0);
  const from12 = addDays(asOf, -364);
  const t12 = sum(ctx.facts.filter(f => f.date >= from12 && f.date <= asOf), f => f.tonnes);
  const firstMonth = hist.findIndex(h => h.ar > 0);
  const levers = [
    ['DSO', w.dso, w.perDay.dso, 'incasso dai clienti', 'un giorno di vendite lorde (IVA compresa)', 'incassando 5 giorni prima'],
    ['DIO', w.dio, w.perDay.dio, 'giacenza in magazzino', 'un giorno di costo del venduto industriale', 'con 5 giorni di scorta in meno'],
    ['DPO', w.dpo, w.perDay.dpo, 'pagamento ai fornitori', 'un giorno di acquisti di materie prime (IVA compresa)', 'pagando 5 giorni dopo'],
  ];
  return (
    <>
      <div className="note">Valori gestionali al <b>{dateIt(asOf)}</b>{asOf < today ? ', fine del periodo scelto' : ''}: crediti dal partitario, rimanenze al FIFO (prodotto finito al costo pieno), debiti verso fornitori <b>stimati</b> dai lotti ricevuti e dai termini di pagamento.</div>
      <div className="kpis">
        <Kpi label="Crediti commerciali" value={mila(w.ar)} unit="mila €" raw={w.ar} cmp={cmp(w.ar, wc?.ar)} foot={`fatturati ${mila(w.arInvoiced)} · da fatturare ${mila(w.arUninvoiced)}`} title="Partite aperte più consegne non ancora fatturate, IVA compresa" />
        <Kpi label="Rimanenze MP + PF" value={mila(w.mp + w.fg)} unit="mila €" raw={w.mp + w.fg} cmp={cmp(w.mp + w.fg, wc ? wc.mp + wc.fg : null)} foot={`MP ${mila(w.mp)} · PF ${mila(w.fg)}`} title="Materie prime al FIFO (anche in quarantena) e prodotto finito al costo pieno industriale" />
        <Kpi label={<>Debiti fornitori <Est title="Lotti ricevuti negli ultimi 180 giorni non ancora scaduti, lordi d’IVA, con i termini del fornitore (o 60 gg f.m. di base)." /></>} value={mila(w.ap)} unit="mila €" raw={w.ap} cmp={cmp(w.ap, wc?.ap, 'up')} foot={`DPO ${gg(w.dpo)} giorni`} />
        <Kpi label={<>Capitale circolante <Est title="Comprende i debiti verso fornitori stimati dai lotti ricevuti e dai termini di pagamento." /></>} value={mila(w.nwc)} unit="mila €" raw={w.nwc} cmp={cmp(w.nwc, wc?.nwc)} foot="crediti + rimanenze − debiti" title="Capitale investito nel ciclo commerciale: va finanziato con mezzi propri o linee di credito" />
        <Kpi label={<>Costo annuo <Est title="Capitale circolante (con i debiti stimati) × costo del denaro." /></>} value={mila(w.costPerYear, 1)} unit="mila €" foot={`al ${nf(w.rate, 1)}% di costo del denaro`} title="Capitale circolante × costo del denaro (Parametri)" />
        <Kpi label={<>Ciclo di cassa <Est title="Il DPO viene dai debiti verso fornitori stimati." /></>} value={gg(w.ccc)} unit="giorni" raw={w.ccc} cmp={cmp(w.ccc, wc?.ccc, 'down', 'ratio', 'gg')} foot={`DSO ${gg(w.dso)} + DIO ${gg(w.dio)} − DPO ${gg(w.dpo)}`} title="Giorni tra il pagamento delle materie prime e l’incasso dai clienti" />
      </div>
      <div className="grid g2 start fin-wc">
        <Panel title="Dove sta il capitale" sub={`Impieghi ${eur(w.ar + w.mp + w.fg)} · finanziati dai fornitori per ${eur(w.ap)} (${pct(w.ap / Math.max(1, w.ar + w.mp + w.fg), 0)})`}>
          <StackBar parts={parts} height={26} ariaLabel="Composizione degli impieghi del capitale circolante" />
          <Legend items={parts.map(p => ({ label: `${p.label} ${mila(p.value)} mila`, color: p.color }))} />
          <div className="fin-bridge" aria-label="Dal capitale investito al capitale circolante">
            <span><small>Crediti</small><b>{mila(w.ar)}</b></span><i>+</i>
            <span><small>Rimanenze</small><b>{mila(w.mp + w.fg)}</b></span><i>−</i>
            <span><small>Debiti</small><b>{mila(w.ap)}</b></span><i>=</i>
            <span className="tot"><small>Capitale circolante</small><b>{mila(w.nwc)}</b></span>
            <em className="small muted">mila €</em>
          </div>
          <div className="fin-wc-stats">
            <span title="Capitale circolante ÷ vendite lorde (IVA compresa) degli ultimi 12 mesi chiusi"><small>Sulle vendite annue</small><b>{w.gross12 > 0 ? pct(w.nwc / w.gross12, 1) : '—'}</b></span>
            <span title="Costo annuo del capitale circolante ÷ 365"><small>Costo al giorno</small><b>{eur(w.costPerYear / 365)}</b></span>
            <span title="Costo annuo del capitale circolante ÷ tonnellate consegnate negli ultimi 12 mesi"><small>Costo per tonnellata venduta</small><b>{t12 > 0 ? fmtPm(w.costPerYear / t12, 2) : '—'}</b></span>
          </div>
        </Panel>
        <Panel title="Il ciclo in giorni" sub="Dal pagamento delle materie prime all’incasso dai clienti">
          <div className="fin-ccc" role="img" aria-label={`Magazzino ${gg(w.dio)} giorni più incasso ${gg(w.dso)} giorni, meno pagamento fornitori ${gg(w.dpo)} giorni: ciclo di cassa ${gg(w.ccc)} giorni`}>
            <div className="lane"><span className="lbl">Materia prima → incasso</span><div className="bar"><i className="dio" style={{ width: (w.dio || 0) / maxD * 100 + '%' }}>DIO {gg(w.dio)}</i><i className="dso" style={{ width: (w.dso || 0) / maxD * 100 + '%' }}>DSO {gg(w.dso)}</i></div></div>
            <div className="lane"><span className="lbl">Materia prima → pagamento</span><div className="bar"><i className="dpo" style={{ width: (w.dpo || 0) / maxD * 100 + '%' }}>DPO {gg(w.dpo)}</i>{w.ccc > 0 && <i className="gap" style={{ width: w.ccc / maxD * 100 + '%' }} title={`Ciclo di cassa: ${gg(w.ccc)} giorni da finanziare`}>{gg(w.ccc)} gg</i>}</div></div>
            {w.ccc > 0 && <span className="small muted fin-ccc-key"><i className="gap" aria-hidden="true" /> giorni da finanziare: il ciclo di cassa ({gg(w.ccc)} gg)</span>}
          </div>
          <div className="tw fin-tw"><table className="t fin-mini fin-lev">
            <thead><tr><th>Leva</th><th className="r">Oggi</th><th className="r">Un giorno vale</th><th className="r">5 giorni liberano</th></tr></thead>
            <tbody>{levers.map(([k, v, perDay, hint, basis, how]) => (
              <tr key={k} title={`Un giorno di ${k} = ${basis}`}>
                <td><b>{k}</b><span className="sub">{hint}</span></td><td className="r">{gg(v)} gg</td><td className="r">{eur(perDay)}</td>
                <td className="r">{eur(perDay * 5)}<span className="sub">{how}</span></td>
              </tr>))}</tbody>
          </table></div>
        </Panel>
      </div>
      <Panel title="Andamento a fine mese" sub={`12 mesi fino al ${dateIt(asOf, 'dm')}, mila €${asOf === today ? ` · il mese in corso è al ${dateIt(today, 'dm')}` : ''}${firstMonth > 0 || hist[0]?.ar < hist[hist.length - 1]?.ar * 0.5 ? ' · i primi mesi crescono perché lo storico dei dati è più breve dei termini di pagamento' : ''}`}>
        <LineChart labels={hist.map(h => monthLabel(h.month))} unit="mila €" decimals={0} area={false} ariaLabel="Capitale circolante, crediti, rimanenze e debiti a fine mese"
          series={[
            { key: 'nwc', label: 'Capitale circolante', color: SERIES[0], values: hist.map(h => h.nwc / 1000) },
            { key: 'ar', label: 'Crediti', color: SERIES[2], values: hist.map(h => h.ar / 1000) },
            { key: 'inv', label: 'Rimanenze', color: SERIES[1], values: hist.map(h => (h.mp + h.fg) / 1000) },
            { key: 'ap', label: 'Debiti fornitori', color: SERIES[6], values: hist.map(h => h.ap / 1000) },
          ]} />
        <Legend line items={[{ label: 'Capitale circolante', color: SERIES[0] }, { label: 'Crediti', color: SERIES[2] }, { label: 'Rimanenze', color: SERIES[1] }, { label: 'Debiti fornitori (stimati)', color: SERIES[6] }]} />
      </Panel>
      <Definitions items={[
        ['DSO (giorni di incasso)', 'Metodo a ritroso sui crediti fatturati: giorni di vendite lorde recenti che li coprono.'],
        ['DIO (giorni di magazzino)', `(MP + PF) ÷ (costo del venduto industriale dei 12 mesi ÷ ${w.days.dio} giorni con dati) = ${eur(w.mp + w.fg)} ÷ ${eur(w.perDay.dio)} al giorno. Costo del venduto = materie prime + calo + energia + trasformazione variabile + imballo dei fatti di vendita.`],
        ['DPO (giorni di pagamento)', `Debiti verso fornitori ÷ acquisti di materie prime lordi dei 12 mesi × giorni con dati = ${eur(w.ap)} ÷ ${eur(w.purchases12)} × ${w.days.dpo}.`],
        ['Giorni con dati', 'Le medie giornaliere usano i 365 giorni dei 12 mesi alla data; se l’archivio comincia dopo, solo i giorni da quando ci sono consegne o arrivi, così un archivio giovane non gonfia DIO e DPO.'],
        ['Ciclo di cassa', 'DSO + DIO − DPO: i giorni che il capitale resta impegnato tra pagamento ai fornitori e incasso dai clienti.'],
        ['Costo annuo', `Capitale circolante × ${nf(w.rate, 1)}% (costo del denaro nei Parametri).`],
      ]} />
    </>
  );
}

/* ======================================================================== */
/* ---------------- rimanenze ---------------- */
const MP_METHODS = [{ id: 'fifo', label: 'FIFO', title: 'Giacenza dei lotti × prezzo del lotto' }, { id: 'cmp', label: 'CMP', title: 'Costo medio ponderato degli arrivi degli ultimi 12 mesi' }, { id: 'sostituzione', label: 'Sostituzione', title: 'Giacenza × prezzo di oggi' }];
const FG_METHODS = [{ id: 'pieno', label: 'Pieno', title: 'Costo industriale pieno: variabile + trasformazione fissa' }, { id: 'variabile', label: 'Variabile', title: 'Solo i costi variabili: materie prime, calo, energia, trasformazione variabile, imballo' }];
const ABC_HINT = { A: 'fino all’80% del valore consumato', B: 'dall’80 al 95%', C: 'l’ultimo 5%' };
const ABC_SHORT = { A: 'primo 80% del valore', B: 'dall’80 al 95%', C: 'ultimo 5%' };
const XYZ_HINT = { X: 'consumo regolare (CV < 0,25)', Y: 'variabile (CV 0,25–0,75)', Z: 'irregolare (CV > 0,75)' };

function Rimanenze({ d, sel }) {
  const ctx = ctxOf(d), today = ctx.today, I = idx(d);
  const { P, C, cov } = usePeriod(d);
  const [mpM, setMpM] = useState('fifo');
  const [fgM, setFgM] = useState('pieno');
  const [cell, setCell] = useState(null);
  const [sheet, setSheet] = useState(false);
  // valori alla fine del periodo scelto (a oggi se il periodo è in corso); lenti ed eccedenze guardano il piano di oggi
  const at = P.to < today ? P.to : today, past = at < today;
  const [asOf, setAsOf] = useState(at);
  const sumy = useMemo(() => inventorySummary(d, ctx, P), [d, ctx, P]);
  const mp = valuationAt(d, at, mpM, { today });
  const mpFifo = mpM === 'fifo' ? mp : valuationAt(d, at, 'fifo', { today });
  const mpRepl = valuationAt(d, at, 'sostituzione', { today });
  const cTo = C && !C.budget ? (C.to < today ? C.to : today) : null;
  const mpC = cTo ? valuationAt(d, cTo, mpM, { today }) : null;
  const covB = cTo ? Math.min(cov ?? 1, balanceCoverage(cTo, stockStart(d, 'mp'), STOCK_HORIZON)) : cov;
  const fg = useMemo(() => finishedAt(d, ctx, at), [d, ctx, at]);
  const fgVal = fgM === 'pieno' ? fg.valueFull : fg.valueVar;
  const hist = useMemo(() => stockHistory(d, 12, ctx, at), [d, ctx, at]);
  const abc = useMemo(() => abcXyz(d, ctx, P), [d, ctx, P]);
  const slow = useMemo(() => slowMovers(d, ctx), [d, ctx]);
  const rate = carryRate(d);
  if (!(d.ingLots || []).length && !(d.lots || []).length) return <Panel><Empty icon={LuInbox} title="Nessuna rimanenza">Le rimanenze nascono dai lotti di materie prime ricevuti e dai lotti di prodotto non ancora spediti.</Empty></Panel>;
  const stockBy = Object.fromEntries(mpFifo.byIng.map(r => [r.ingId, r]));
  const rows = Object.entries(abc).map(([id, v]) => ({ id, ...v, name: I.ing[id]?.name || id, stockT: stockBy[id]?.t || 0, stockV: stockBy[id]?.value || 0 }));
  const grid = {};
  for (const r of rows) if (r.xyz) { const k = r.abc + r.xyz; (grid[k] ||= { n: 0, v: 0, s: 0 }); grid[k].n++; grid[k].v += r.value; grid[k].s += r.stockV; }
  const totV = sum(rows, r => r.value) || 1;
  const view = cell ? rows.filter(r => r.abc + r.xyz === cell) : rows;
  // giorni di magazzino e mantenimento alla data dal contratto inventorySummary (12 mesi che finiscono alla data)
  const { dio, dioTotal, dioMpShare: mpDays, dioFgShare: fgDays } = sumy;
  const rawDay = sumy.days12 > 0 ? sumy.raw12 / sumy.days12 : 0, stockAt = sumy.mpFifo + sumy.fgValue;
  return (
    <>
      <div className="row between fin-tools">
        <span className="row gap-s"><span className="small muted">Materie prime:</span><Seg label="Metodo delle materie prime" value={mpM} onChange={setMpM} options={MP_METHODS} />
          <span className="small muted">Prodotto finito:</span><Seg label="Costo del prodotto finito" value={fgM} onChange={setFgM} options={FG_METHODS} /></span>
        <Chip kind="outline" title="Valori per il controllo di gestione: non sostituiscono l’inventario fiscale di fine esercizio">valorizzazione gestionale, non fiscale</Chip>
      </div>
      {past && <div className="note">Rimanenze al <b>{dateIt(at)}</b>, fine del periodo scelto. Lenti ed eccedenze guardano il piano e le giacenze di oggi.</div>}
      <div className="kpis">
        <Kpi label={`Materie prime · ${MP_METHODS.find(m => m.id === mpM).label}`} value={mila(mp.value, 1)} unit="mila €" raw={mp.value}
          cmp={mpC ? { cur: mp.value, value: mpC.value, kind: 'flow', good: 'down', label: 'al ' + dateIt(cTo, 'dm'), cov: covB } : undefined}
          foot={mpM === 'fifo' ? `${nf(mp.t)} t · sostituzione ${mila(mpRepl.value, 1)} mila` : `FIFO ${mila(mpFifo.value, 1)} mila · Δ ${mila(mp.value - mpFifo.value, 1)}`} title={`${MP_METHODS.find(m => m.id === mpM).title}, al ${dateIt(at)}`} />
        <Kpi label={`Prodotto finito · costo ${fgM}`} value={mila(fgVal, 1)} unit="mila €" foot={`${nf(fg.t)} t in ${sum(fg.byProduct, r => r.lots)} lotti`} title={`Lotti prodotti e non ancora spediti al ${dateIt(at)} (esclusi i bloccati), al costo effettivo del lotto`} />
        <Kpi label="Giorni di magazzino MP" value={gg(dio)} unit="giorni" foot={`rotazione ${dio ? nf(365 / dio, 1) : '—'} volte l’anno · MP + PF ${gg(dioTotal)} gg`}
          title={`DIO delle materie prime = MP al FIFO ÷ (materie prime e calo consumati nei 12 mesi ÷ ${sumy.days12} giorni con dati) = ${eur(sumy.mpFifo)} ÷ ${eur(rawDay)} al giorno. Rotazione = 365 ÷ DIO.\nCon il prodotto finito: (MP + PF al costo pieno) ÷ (costo del venduto industriale dei 12 mesi ÷ giorni) = ${gg(mpDays)} gg di MP + ${gg(fgDays)} gg di PF = ${gg(dioTotal)} giorni, il DIO del capitale circolante.`} />
        <Kpi label="Capitale in eccesso" value={mila(sumy.excessValue, 1)} unit="mila €" status={sumy.excessValue > 50000 ? 'warn' : 'ok'} foot={`${past ? 'oggi · ' : ''}mantenerlo costa ${eur(sumy.excessCarryingCost)}/anno`} title="Giacenza di oggi oltre fabbisogno a 8 settimane + scorta di sicurezza delle materie prime lente o in eccesso, ai prezzi dei lotti più recenti" />
        <Kpi label="Costo di mantenimento" value={mila(stockAt * rate / 100, 1)} unit="mila €/anno" foot={`${nf(rate, 1)}% annuo su ${mila(stockAt)} mila`} title="Oneri finanziari, magazzino, assicurazione e cali sul valore delle rimanenze (MP al FIFO + PF al costo pieno; tasso nei Parametri)" />
      </div>
      <Panel title="Valore a fine mese" sub={`Materie prime al FIFO e prodotto finito al costo ${fgM}, mila €`}>
        <LineChart labels={hist.map(h => monthLabel(h.month))} unit="mila €" decimals={0} area={false} ariaLabel="Valore mensile delle rimanenze"
          series={[{ key: 'mp', label: 'Materie prime', color: SERIES[0], values: hist.map(h => h.mp / 1000) }, { key: 'fg', label: 'Prodotto finito', color: SERIES[1], values: hist.map(h => (fgM === 'pieno' ? h.fg : h.fgVar) / 1000) }]} />
        <Legend line items={[{ label: 'Materie prime', color: SERIES[0] }, { label: 'Prodotto finito', color: SERIES[1] }]} />
      </Panel>
      <div className="split r">
        <Panel title="Classi ABC · XYZ" sub={`Valore consumato in ${P.short} e regolarità dei consumi settimanali · clic per filtrare`} id="fin-abc">
          <div className="fin-grid" role="grid" aria-label="Matrice ABC per XYZ">
            <span />{['X', 'Y', 'Z'].map(x => <span key={x} className="hx" title={XYZ_HINT[x]}>{x}</span>)}
            {['A', 'B', 'C'].map(a => (
              <React.Fragment key={a}>
                <span className="hy" title={ABC_HINT[a]}>{a}</span>
                {['X', 'Y', 'Z'].map(x => { const g = grid[a + x]; const share = g ? g.v / totV : 0; return (
                  <button key={x} role="gridcell" className={`cell ${cell === a + x ? 'on' : ''}`} aria-pressed={cell === a + x} disabled={!g}
                    style={{ background: g ? `color-mix(in srgb, var(--s1) ${Math.round(8 + 60 * Math.sqrt(share))}%, var(--surface))` : undefined }}
                    title={g ? `${a}${x}: ${g.n} materie prime · ${pct(share, 1)} del valore consumato · giacenza ${eur(g.s)}` : `${a}${x}: nessuna`}
                    onClick={() => setCell(cell === a + x ? null : a + x)}>
                    <b>{g ? g.n : '—'}</b>{g && <small>{pct(share, 0)}</small>}
                  </button>); })}
              </React.Fragment>
            ))}
          </div>
          <div className="tw fin-tw"><table className="t fin-mini fin-abc-sum">
            <thead><tr><th>Classe</th><th className="r">Voci</th><th className="r">Consumato</th><th className="r">Giacenza</th><th className="r" title="Giacenza ÷ consumo medio giornaliero del periodo">Copertura</th></tr></thead>
            <tbody>{['A', 'B', 'C'].map(a => { const rs = rows.filter(r => r.abc === a), v = sum(rs, r => r.value), s = sum(rs, r => r.stockV); return (
              <tr key={a} title={ABC_HINT[a]}><td><b>{a}</b><span className="sub">{ABC_SHORT[a]}</span></td><td className="r">{rs.length}</td><td className="r">{eur(v)}<span className="sub">{pct(v / totV, 0)}</span></td><td className="r">{eur(s)}</td>
                <td className="r">{v > 0 ? `${nf(s / (v / P.days))} gg` : '—'}</td></tr>); })}</tbody>
          </table></div>
          <p className="small muted">X {XYZ_HINT.X}, Y {XYZ_HINT.Y}, Z {XYZ_HINT.Z}. Le AX si gestiscono con riordini regolari e scorte basse; le Z con scorte di sicurezza più alte o acquisti su ordine; le C con lotti di riordino più grandi e meno frequenti.</p>
        </Panel>
        <Panel title={cell ? `Materie prime ${cell}` : 'Materie prime per classe'} sub={cell ? <button className="linkish" onClick={() => setCell(null)}>mostra tutte</button> : 'Ordinate per valore consumato'} flush>
          <Table rows={view} rowKey={r => r.id} onRow={r => openDrawer('ingredient', r.id)} selected={sel} initialSort={{ key: 'value', dir: 'desc' }} pageSize={12} exportName="classi-abc-xyz"
            cols={[
              { key: 'name', label: 'Materia prima', render: r => <b>{r.name}</b> },
              { key: 'cls', label: 'Classe', sort: r => r.abc + (r.xyz || 'Z'), csv: r => r.abc + (r.xyz || ''), render: r => <span className={`chip ${r.abc === 'A' ? 'accent' : 'outline'}`}>{r.abc}{r.xyz || '·'}</span> },
              { key: 'value', label: 'Consumato', align: 'r', render: r => <>{eur(r.value)}<span className="sub">{pct(r.share, 1)} · cum. {pct(r.cumShare, 0)}</span></> },
              { key: 'cv', label: 'CV', align: 'r', csv: r => (r.cv == null ? '' : Math.round(r.cv * 100) / 100), render: r => (r.cv == null ? '—' : nf(r.cv, 2)) },
              { key: 'stockV', label: 'Giacenza', align: 'r', render: r => <>{eur(r.stockV)}<span className="sub">{nf(r.stockT, r.stockT < 10 ? 1 : 0)} t</span></> },
            ]} />
        </Panel>
      </div>
      <Panel title="Lenti ed eccedenze" sub={`Copertura oltre il necessario, nessun fabbisogno nelle 8 settimane del piano, lotti vecchi o in scadenza · mantenimento al ${nf(rate, 1)}% annuo`} flush id="fin-slow">
        <Table rows={slow} rowKey={r => r.ingId} onRow={r => openDrawer('ingredient', r.ingId)} selected={sel} initialSort={{ key: 'excessValue', dir: 'desc' }} exportName="lenti-ed-eccedenze" empty="Nessuna materia prima lenta o in eccesso"
          cols={[
            { key: 'name', label: 'Materia prima', className: 'fin-namecol', render: r => <><b>{r.name}</b><span className="sub">{[r.flags.noNeed && 'senza fabbisogno', r.flags.cover && 'copertura alta', r.flags.old && 'lotto vecchio', r.flags.expiring && 'in scadenza'].filter(Boolean).join(' · ')}</span></> },
            { key: 'value', label: 'Giacenza', align: 'r', csv: r => Math.round(r.value), render: r => <>{eur(r.value)}<span className="sub">{nf(r.t, 1)} t</span></> },
            { key: 'coverDays', label: 'Copertura', align: 'r', csv: r => (r.coverDays == null ? '' : Math.round(r.coverDays)),
              render: r => <>{r.coverDays == null ? <span className="chip warn">nessun uso</span> : <>{nf(r.coverDays)} gg</>}<span className="sub" title="Fabbisogno delle prossime 8 settimane dal piano e copertura che basta: max(60, 3 × (consegna + sicurezza)) giorni">8 sett. {nf(r.needT8w, r.needT8w < 10 ? 1 : 0)} t{r.coverDays != null ? ` · ne bastano ${r.coverMax}` : ''}</span></> },
            { key: 'oldestLotDays', label: 'Lotto più vecchio', align: 'r', csv: r => r.oldestLotDays ?? '',
              render: r => r.oldestLotDays == null ? '—' : <span title={r.oldestLotCode}>{r.oldestLotDays > 90 ? <b className="fin-red">{r.oldestLotDays} gg</b> : `${r.oldestLotDays} gg`}<span className="sub">{dateIt(r.oldestLotDate, 'dm')}{r.expiryDate ? <> · <span className={r.expiryDays <= 30 ? 'fin-red' : ''}>scade {dateIt(r.expiryDate, 'dm')}</span></> : ''}</span></span> },
            { key: 'excessValue', label: 'Capitale in eccesso', align: 'r', csv: r => Math.round(r.excessValue), render: r => <>{eur(r.excessValue)}<span className="sub">{nf(r.excessT, 1)} t · {eur(r.excessCarryingCost)}/anno</span></> },
            { key: 'carryingCost', label: 'Mantenimento/anno', align: 'r', csv: r => Math.round(r.carryingCost), render: r => eur(r.carryingCost) },
            { key: 'action', label: 'Azione suggerita', className: 'fin-actcol', nosort: true, render: r => r.action },
          ]} />
      </Panel>
      <Panel title="Rimanenze a una data" sub="Elenco stampabile per materia prima e prodotto finito, con il metodo scelto sopra"
        actions={<><label className="row gap-s small"><LuCalendar aria-hidden="true" />Al <input type="date" className="input slim" value={asOf} max={today} onChange={e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setAsOf(e.target.value)} aria-label="Rimanenze alla data" /></label>
          <Btn small kind="primary" icon={LuPrinter} onClick={() => setSheet(true)}>Elenco stampabile</Btn></>}>
        <AsOfSummary d={d} ctx={ctx} date={asOf} mpM={mpM} fgM={fgM} />
      </Panel>
      {sheet && <StockSheet d={d} ctx={ctx} date={asOf} mpM={mpM} fgM={fgM} onClose={() => setSheet(false)} />}
    </>
  );
}

function AsOfSummary({ d, ctx, date, mpM, fgM }) {
  const v = valuationAt(d, date, mpM, { today: ctx.today }), f = finishedAt(d, ctx, date);
  return <Kv items={[
    ['Materie prime', `${eur(v.value)} · ${nf(v.t)} t · ${v.byIng.length} materie prime (${MP_METHODS.find(m => m.id === mpM).label})`],
    v.quarantine > 0.5 ? ['In quarantena (a parte)', eur(v.quarantine)] : null,
    ['Prodotto finito', `${eur(fgM === 'pieno' ? f.valueFull : f.valueVar)} · ${nf(f.t)} t (costo ${fgM})`],
    ['Totale', <b>{eur(v.value + (fgM === 'pieno' ? f.valueFull : f.valueVar))}</b>],
  ]} />;
}

function StockSheet({ d, ctx, date, mpM, fgM, onClose }) {
  const I = idx(d);
  const v = valuationAt(d, date, mpM, { today: ctx.today }), f = finishedAt(d, ctx, date);
  const fgv = r => (fgM === 'pieno' ? r.valueFull : r.valueVar);
  const close = React.useCallback(() => onClose(), [onClose]);
  useEsc(close);
  return (
    <div className="fin-sheet" role="dialog" aria-modal="true" aria-label="Elenco delle rimanenze">
      <div className="fin-sheet-bar no-print">
        <LuFileText aria-hidden="true" /><b>Rimanenze al {dateIt(date)}</b><span className="muted small">anteprima A4</span><span className="sp" />
        <Btn kind="primary" icon={LuPrinter} onClick={printNow}>Stampa</Btn><Btn icon={LuX} onClick={close}>Chiudi</Btn>
      </div>
      <PrintPage title={`Rimanenze al ${dateIt(date)}`} period={`al ${dateIt(date, 'long')}`} footer={`Valorizzazione gestionale, non fiscale · elaborata con ${META.product}`}>
        <p className="small">Materie prime valorizzate con il metodo <b>{MP_METHODS.find(m => m.id === mpM).label}</b> ({MP_METHODS.find(m => m.id === mpM).title.toLowerCase()}); prodotto finito al costo <b>{fgM}</b>. <b>Valorizzazione gestionale, non fiscale.</b></p>
        <table className="t">
          <thead><tr><th>Materia prima</th><th className="r">t</th><th className="r">{PM_LABEL}</th><th className="r">Valore €</th></tr></thead>
          <tbody>{v.byIng.map(r => <tr key={r.ingId}><td>{I.ing[r.ingId]?.code} {I.ing[r.ingId]?.name || r.ingId}</td><td className="r">{nf(r.t, 1)}</td><td className="r">{nfPm(r.price, 1)}</td><td className="r">{nf(r.value)}</td></tr>)}</tbody>
          <tfoot><tr><td>Totale materie prime</td><td className="r">{nf(v.t, 1)}</td><td /><td className="r">{nf(v.value)}</td></tr></tfoot>
        </table>
        <table className="t">
          <thead><tr><th>Prodotto finito</th><th className="r">Lotti</th><th className="r">t</th><th className="r">{PM_LABEL}</th><th className="r">Valore €</th></tr></thead>
          <tbody>{f.byProduct.map(r => <tr key={r.productId}><td>{I.prod[r.productId]?.code} {I.prod[r.productId]?.name || r.productId}</td><td className="r">{r.lots}</td><td className="r">{nf(r.t, 1)}</td><td className="r">{nfPm(fgv(r) / r.t, 1)}</td><td className="r">{nf(fgv(r))}</td></tr>)}</tbody>
          <tfoot><tr><td>Totale prodotto finito</td><td /><td className="r">{nf(f.t, 1)}</td><td /><td className="r">{nf(fgM === 'pieno' ? f.valueFull : f.valueVar)}</td></tr></tfoot>
        </table>
        <p><b>Totale rimanenze: {eur(v.value + (fgM === 'pieno' ? f.valueFull : f.valueVar))}</b>{v.quarantine > 0.5 ? ` · in quarantena, non comprese: ${eur(v.quarantine)}` : ''}</p>
      </PrintPage>
    </div>
  );
}

/* ======================================================================== */
/* ---------------- parametri ---------------- */
function Parametri({ d }) {
  const f = finOf(d), pd = pdOf(d);
  // un campo lasciato senza modifiche non scrive nulla (niente passi vuoti da annullare)
  const same = (cur, patch) => Object.entries(patch).every(([k, v]) => JSON.stringify(cur?.[k] ?? null) === JSON.stringify(v ?? null));
  const setF = (patch, label) => !same(f, patch) && store.settings(st => ({ ...st, finance: { ...(st.finance || {}), ...patch } }), label) && toast(label, 'ok', { label: 'Annulla', fn: () => store.undo() });
  const setOps = (patch, label) => !same(d.settings?.ops, patch) && store.settings(st => ({ ...st, ops: { ...(st.ops || {}), ...patch } }), label) && toast(label, 'ok', { label: 'Annulla', fn: () => store.undo() });
  const num = (key, label, opts = {}) => (
    <Field label={label} hint={opts.hint}><NumInput value={f[key] ?? opts.def ?? null} decimals={opts.dec ?? 1} min={opts.min ?? 0} max={opts.max} placeholder={opts.def != null ? String(opts.def).replace('.', ',') : ''}
      onChange={v => (v ?? null) !== (f[key] ?? opts.def ?? null) && setF({ [key]: v }, `${label}: ${v == null ? 'valore di base' : nf(v, opts.dec ?? 1)}`)} ariaLabel={label} /></Field>
  );
  return (
    <>
      <div className="note">Parametri dei modelli di finanza: si salvano nell’archivio e ogni modifica si annulla con Ctrl+Z. Un campo vuoto torna al valore di base.</div>
      <div className="grid g2 start">
        <Panel title="IVA e costo del denaro">
          <div className="form">
            {num('vatPct', 'IVA sulle vendite %', { def: 10, max: 30, hint: 'mangimi: di norma 10%' })}
            {num('purchaseVatPct', 'IVA sugli acquisti MP %', { def: vatOf(d), max: 30, hint: 'di base come le vendite' })}
            {num('energyVatPct', 'IVA sull’energia %', { def: 22, max: 30 })}
            {num('rate', 'Costo del denaro % annuo', { def: 5, max: 30, hint: 'capitale circolante e oneri delle dilazioni' })}
          </div>
          <Field label="Liquidazione IVA nella cassa"><Seg label="Liquidazione IVA" value={f.vatSettlement === 'trimestrale' ? 'trimestrale' : f.vatSettlement ? 'mensile' : 'no'}
            onChange={v => v !== (f.vatSettlement === 'trimestrale' ? 'trimestrale' : f.vatSettlement ? 'mensile' : 'no') && setF({ vatSettlement: v === 'no' ? false : v }, v === 'no' ? 'Liquidazione IVA esclusa dalla cassa' : `Liquidazione IVA ${v} nella cassa`)}
            options={[{ id: 'no', label: 'Esclusa' }, { id: 'mensile', label: 'Mensile' }, { id: 'trimestrale', label: 'Trimestrale' }]} /></Field>
        </Panel>
        <Panel title="Rischio di credito" sub="Perdita attesa = esposizione × PD della classe × LGD">
          <div className="form">
            {['A', 'B', 'C', 'D'].map(k => (
              <Field key={k} label={`PD classe ${k} %`}><NumInput value={f.pd?.[k] ?? PD_DEFAULT[k]} decimals={1} min={0} max={100}
                onChange={v => (v ?? PD_DEFAULT[k]) !== pd[k] && setF({ pd: { ...(f.pd || {}), [k]: v ?? PD_DEFAULT[k] } }, `Probabilità di insolvenza della classe ${k}: ${nf(v ?? PD_DEFAULT[k], 1)}%`)} ariaLabel={`PD classe ${k}`} /></Field>
            ))}
            {num('lgd', 'LGD %', { def: LGD_DEFAULT, max: 100, dec: 0, hint: 'perdita in caso di insolvenza' })}
            {num('overdueSignalAbs', 'Soglia segnale scaduto €', { def: 5000, dec: 0, hint: 'scaduto oltre 30 giorni' })}
          </div>
          <p className="small muted">Valori in uso: A {nf(pd.A, 1)}% · B {nf(pd.B, 1)}% · C {nf(pd.C, 1)}% · D {nf(pd.D, 1)}% · LGD {nf(lgdOf(d))}%.</p>
        </Panel>
        <Panel title="Fornitori e personale" sub="Per i debiti stimati e la cassa a 13 settimane">
          <div className="form">
            {num('defaultSupplierDays', 'Giorni di pagamento fornitori', { def: 60, dec: 0, max: 365, hint: 'se il fornitore non ha termini propri' })}
            <Field label="Data fattura fine mese"><Seg label="Fine mese fornitori" value={f.defaultSupplierEom === false ? 'no' : 'si'} onChange={v => v !== (f.defaultSupplierEom === false ? 'no' : 'si') && setF({ defaultSupplierEom: v === 'si' }, v === 'si' ? 'Fornitori: data fattura fine mese' : 'Fornitori: data fattura')} options={[{ id: 'si', label: 'Sì' }, { id: 'no', label: 'No' }]} /></Field>
            {num('payrollF24Pct', 'Quota F24 sul costo del personale %', { def: 30, dec: 0, max: 60, hint: 'ritenute e contributi, versati il 16' })}
            {num('defaultCustomerDays', 'Giorni di pagamento clienti di base', { def: 60, dec: 0, max: 365, hint: 'per i clienti senza termini' })}
          </div>
        </Panel>
        <Panel title="Rimanenze">
          <div className="form">
            <Field label="Tasso di mantenimento % annuo" hint="oneri finanziari, magazzino, assicurazione, cali"><NumInput value={d.settings?.ops?.carryRatePct ?? 8} decimals={1} min={0} max={60}
              onChange={v => (v ?? 8) !== carryRate(d) && setOps({ carryRatePct: v ?? 8 }, `Tasso di mantenimento delle scorte: ${nf(v ?? 8, 1)}%`)} ariaLabel="Tasso di mantenimento" /></Field>
          </div>
          <p className="small muted">Usato per il costo delle rimanenze e del capitale in eccesso (Finanza › Rimanenze).</p>
        </Panel>
      </div>
    </>
  );
}
