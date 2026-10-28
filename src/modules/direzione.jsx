/* FeedOS 17 · Area Direzione (pacchetto WP1): sintesi, conto economico, scostamenti, budget, costi fissi, chiusura del mese, report CdA.
 * Ogni scheda segue il periodo globale (usePeriod) e confronta con il periodo scelto o con il budget; i mesi in corso sono
 * tratteggiati o segnati «in corso», i costi fissi da budget o da media sono «stimati». */
import React, { useMemo, useRef, useState } from 'react';
import { LuArrowRight, LuCircleCheck, LuTriangleAlert, LuCircleAlert, LuLock, LuLockOpen, LuPlus, LuTrash2, LuUpload, LuSnowflake, LuX } from 'react-icons/lu';
import { store, toast, useData } from '../core/store.js';
import { getPrefs } from '../core/prefs.js';
import { go } from '../core/router.js';
import { signals } from '../core/derived.js';
import { nf, sf, pct, monthLabel, dateIt, addMonths, endOfMonth, monthsIn, daysInMonth, uid, norm } from '../core/util.js';
import { PM_LABEL, pm, pmDec, fmtPm } from '../core/units.js';
import { parseCSV, readFile, num } from '../core/io.js';
import { comparePeriod, makePeriod } from '../core/period.js';
import { isClosedMonth } from '../core/schema.js';
import { AREA_META } from '../core/roles.js';
import { NAV } from '../app/nav.js';
import { monthlySeries, lastMonths, firstFactDate, effectiveCoverage } from '../engine/pnl.js';
import { basis, pvm, narrative, basisLabel, LEVELS } from '../engine/pvm.js';
import { budgetBasis, budgetTotals, landing, activeVersion, hasBudget, isLocked, budgetVersions } from '../engine/budget.js';
import { checklist, closeMonthOps, reopenMonthOps, reopenLabel, closeLabel, closingRecord, closedThrough, nextToClose, frozenVsLive } from '../engine/closing.js';
import { PageHead, Panel, Kpi, Btn, Chip, Seg, Select, Table, Empty, Field, NumInput, Kv, confirm } from '../ui/ui.jsx';
import { SignalList } from './shared.jsx';
import { COST_CENTERS } from '../data/demo/costs.js';
import { Conto, useDir, kc, goal, money, eurTxt, kEur, skEur, perT, Def, HWaterfall, MonthBars, Delta } from './direzione-conto.jsx';
import { Budget } from './direzione-budget.jsx';
import { ReportCda } from './direzione-report.jsx';

export function Direzione({ route }) {
  const tabs = NAV.direzione.tabs;
  const t = tabs.find(x => x.id === route.tab) || tabs[0];
  return (
    <>
      <PageHead title="Direzione" lead={AREA_META.direzione.lead} tabs={tabs} tab={t.id} onTab={x => go('direzione', x)} />
      {t.id === 'sintesi' && <Sintesi />}
      {t.id === 'conto' && <ContoTab />}
      {t.id === 'ponte' && <Ponte />}
      {t.id === 'budget' && <BudgetTab />}
      {t.id === 'costi' && <CostiFissi />}
      {t.id === 'chiusura' && <Chiusura sel={route.id} />}
      {t.id === 'report' && <ReportTab />}
    </>
  );
}
function ContoTab() { const d = useData(); return <Conto d={d} />; }
function BudgetTab() { const d = useData(); return <Budget d={d} />; }
function ReportTab() { const d = useData(); return <ReportCda d={d} />; }

/** «sul mese prima», «sull’anno prima», «sul budget». */
const vsText = (A, B) => (!A ? '' : A.budget ? 'sul budget' : A.compare === 'ap' ? 'sull’anno prima' : B && B.months?.length === 1 && A.months?.length === 1 ? 'sul mese prima' : 'sul periodo di confronto');
const wholeP = (m, today) => makePeriod(m + '-01', endOfMonth(m), { preset: 'custom', today });
const matOf = d => d.settings?.finance?.materiality || { abs: 5000, pct: 2 };

/** Ponte tra il periodo A (periodo o budget) e il periodo B per dimensione e livello. */
function bridgeOf(d, ctx, A, B, by, level) {
  if (!A || !B) return null;
  const year = +B.to.slice(0, 4);
  const bb = A.budget && (by === 'customerId' || by === 'agentId') ? 'productId' : by;
  const baseA = A.budget ? budgetBasis(d, B, activeVersion(d, year), bb === 'species' ? 'species' : 'productId') : basis(d, ctx, A, bb);
  const baseB = basis(d, ctx, B, bb);
  return { res: pvm(baseA, baseB, { level }), by: bb, baseA, baseB };
}

/* ---------------- Sintesi ---------------- */
function Sintesi() {
  const d = useData();
  const dir = useDir(d);
  const { ctx, today, cur, cmp, P, C } = dir;
  const y = +today.slice(0, 4);
  // l'andamento parte dal primo mese con i dati completi: un mese iniziato a metà ha i costi fissi di tutto il mese e poche vendite
  const series = useMemo(() => { const s = monthlySeries(d, ctx, lastMonths(today, 13)), k = s.findIndex(m => m.open || (m.tonnes > 0 && !m.partial)); return k > 0 ? s.slice(k) : s; }, [d, ctx, today]);
  const L = useMemo(() => (hasBudget(d, y) && dir.hasData ? landing(d, ctx, y) : null), [d, ctx, y, dir.hasData]);
  const br = useMemo(() => (C && dir.hasData ? bridgeOf(d, ctx, C, P, 'productId', 'mc2') : null), [d, ctx, C, P, dir.hasData]);
  const sig = signals(d).filter(s => s.area === 'direzione' || s.area === 'economia');
  const ct = closedThrough(d), toClose = nextToClose(d, ctx), tm = today.slice(0, 7);
  if (!dir.hasData && !series.some(m => m.tonnes > 0)) return (
    <Panel title="Sintesi">
      <Empty title="Nessun dato economico">
        <p>La sintesi della direzione nasce dalle consegne (ricavi e costo effettivo dei lotti) e dai costi fissi per centro di costo. Importa le consegne o registra i primi movimenti, poi definisci i centri di costo.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Btn kind="primary" onClick={() => go('dati', 'importa')}>Importa consegne</Btn><Btn onClick={() => go('direzione', 'costi')}>Centri e costi fissi</Btn></div>
      </Empty>
    </Panel>
  );
  const t = cur.tonnes, by = cur.by, cb = cmp?.by;
  const ebitdaPct = cur.revenueNet ? by.ebitda / cur.revenueNet : null, ebitdaPctC = cmp?.revenueNet ? cb.ebitda / cmp.revenueNet : null;
  const behind = toClose && toClose < tm ? (toClose < addMonths(tm, -1) ? 'bad' : +today.slice(8) > 5 ? 'warn' : 'ok') : 'ok';
  const cols = series.map(m => ({
    key: m.month, label: monthLabel(m.month).split(' ')[0], title: monthLabel(m.month, false), note: m.open ? 'in corso' : m.partial ? `mese parziale: consegne dal ${dateIt(m.firstDay)}` : null, m,
    bars: [{ key: 'mdc2', label: 'MdC II', value: m.mdc2 / 1000, color: 'var(--s1)', hatch: m.open }, { key: 'ebit', label: 'EBIT', value: m.ebit / 1000, color: 'var(--s3)', hatch: m.open }],
  }));
  const tip = c => [
    { label: 'MdC II', value: `${kEur(c.m.mdc2, 0)} · ${perT(c.m.mdc2T)} ${PM_LABEL}`, color: 'var(--s1)' },
    { label: 'EBIT', value: kEur(c.m.ebit, 0), color: 'var(--s3)' },
    { label: 'Tonnellate', value: nf(c.m.tonnes) + ' t' },
    { label: `Costi fissi${c.m.estimatedFixed ? ' (stimati)' : ''}`, value: kEur(c.m.fixed, 0) },
    { label: 'Pareggio', value: c.m.bepT ? nf(c.m.bepT) + ' t' : '—' },
  ];
  const brief = [['ricaviNetti', 'Ricavi netti'], ['mdc1', 'MdC I'], ['mdc2', 'MdC II'], ['fissi', 'Costi fissi'], ['ebitda', 'EBITDA'], ['ebit', 'EBIT']].map(([id, label]) => {
    const v = id === 'fissi' ? -cur.fixedTotal : by[id], c = !cmp ? null : id === 'fissi' ? -cmp.fixedTotal : cb[id];
    return { id, label, v, c, t: t ? v / t : null };
  });
  const narr = br ? narrative(br.res, matOf(d), { vs: vsText(C, P) }) : [];
  return (
    <>
      <div className="kpis">
        <Kpi label="Ricavi netti" {...money(cur.revenueNet)} cmp={kc(dir, cur.revenueNet, cmp?.revenueNet)} foot={`${nf(t)} t`} />
        <Kpi label={<Def text="MdC II per tonnellata: ricavi netti − materie prime, calo, energia, trasformazione variabile, imballi, trasporti e provvigioni, al costo effettivo dei lotti.">Margine di contribuzione</Def>}
          value={perT(t ? by.mdc2 / t : null)} unit={PM_LABEL} cmp={kc(dir, t ? pm(by.mdc2 / t) : null, cmp && cmp.tonnes ? pm(cb.mdc2 / cmp.tonnes) : null, { kind: 'ratio', unit: PM_LABEL })} foot={eurTxt(by.mdc2)}
          {...goal(d, 'mdc-t', t ? by.mdc2 / t : null, v => fmtPm(v, 0))} />
        <Kpi label={<Def text="EBITDA sui ricavi netti: MdC II meno i costi fissi monetari (ammortamenti esclusi).">EBITDA</Def>} value={ebitdaPct == null ? '—' : nf(ebitdaPct * 100, 1)} unit="%"
          cmp={kc(dir, ebitdaPct, ebitdaPctC, { kind: 'ratio', unit: '%', scale: 100 })} foot={eurTxt(by.ebitda)} {...goal(d, 'ebitda-pct', ebitdaPct, v => nf(v * 100, 1) + '%')} />
        <Kpi label="EBIT" {...money(by.ebit)} cmp={kc(dir, by.ebit, cb?.ebit)} foot={cur.partialFixedMonths?.length ? <Chip kind="warn" title={`Consuntivo dei costi fissi incompleto per ${cur.partialFixedMonths.map(m => monthLabel(m, false)).join(', ')}: i centri senza importo valgono zero`}>fissi parziali</Chip>
            : cur.estimatedMonths?.length ? <Chip kind="maize" title={`Costi fissi stimati per ${cur.estimatedMonths.map(m => monthLabel(m, false)).join(', ')}`}>fissi stimati</Chip> : cur.frozen ? 'numeri congelati' : `${pct(cur.revenueNet ? by.ebit / cur.revenueNet : null, 1)} dei ricavi`} />
        <Kpi label={<Def text="EBIT da inizio anno + MdC II previsto per il resto dell’anno − costi fissi del resto dell’anno. Banda P10–P90 approssimata (limiti dei prodotti sommati).">{`Stima di chiusura ${y}`}</Def>}
          {...(L ? money(L.landing) : { value: '—' })} onClick={() => go('direzione', 'budget')}
          status={!L || L.budgetEbit == null ? null : L.landing >= L.budgetEbit ? 'ok' : L.landing >= L.budgetEbit * 0.9 ? 'warn' : 'bad'}
          cmp={L && L.budgetEbit != null ? { cur: L.landing, value: L.budgetEbit, kind: 'flow', good: 'up', label: 'budget' } : undefined}
          foot={L ? `P10–P90 ${kEur(L.p10, 0)}–${kEur(L.p90, 0)}` : hasBudget(d, y) ? null : 'nessun budget'} />
        <Kpi label="Mese da chiudere" value={toClose && toClose < tm ? monthLabel(toClose, false) : 'In regola'} status={behind} onClick={() => go('direzione', 'chiusura', toClose && toClose < tm ? toClose : undefined)}
          foot={ct ? `chiuso fino a ${monthLabel(ct, false)}` : 'nessun mese chiuso'} />
      </div>
      <div className="note dz-oneline">
        <p>{!C ? 'Scegli un confronto nella barra del periodo per leggere gli scostamenti del margine.' : dir.cov != null && dir.cov < 0.9 ? (dir.covP != null && dir.covP < 0.9 ? 'Il periodo scelto ha dati solo per una parte dei giorni (inizio dei dati): gli scostamenti non sono confrontabili.' : 'Il periodo di confronto non ha dati completi: gli scostamenti non sono confrontabili.') : narr.join(' ')}</p>
        {C && <button className="linkish small" onClick={() => go('direzione', 'ponte')}>Scostamenti <LuArrowRight /></button>}
      </div>
      <div className="split">
        <Panel title="Margine di contribuzione ed EBIT per mese" sub={`${series.length < 13 ? `Ultimi ${series.length} mesi (dal primo completo di dati)` : 'Ultimi 13 mesi'}, migliaia di euro · il mese in corso è tratteggiato · mesi chiusi con i numeri congelati`}>
          <MonthBars cols={cols} height={250} unit="k€" tip={tip} ariaLabel="MdC II ed EBIT per mese"
            legend={[{ label: 'MdC II', color: 'var(--s1)' }, { label: 'EBIT', color: 'var(--s3)' }, { label: 'In corso', color: 'var(--ink-2)', hatch: true }]} />
        </Panel>
        <Panel title="Conto in breve" sub={`${P.label}${cmp ? ' · Δ ' + (C.budget ? 'sul budget' : 'su ' + C.short) : ''}`} flush actions={<Btn small kind="ghost" onClick={() => go('direzione', 'conto')}>Conto economico <LuArrowRight /></Btn>}>
          <Table rows={brief} pageSize={10} cols={[
            { key: 'label', label: 'Voce', nosort: true, render: r => <b>{r.label}</b> },
            { key: 'v', label: '€', align: 'r', nosort: true, render: r => eurTxt(r.v) },
            { key: 't', label: PM_LABEL, align: 'r', nosort: true, render: r => perT(r.t) },
            ...(cmp ? [{ key: 'c', label: 'Δ', align: 'r', nosort: true, render: r => <Delta cur={r.v} cmp={r.c} kind="pct" /> }] : []),
          ]} />
        </Panel>
      </div>
      <Panel title="Decisioni della direzione" sub="Segnali di direzione ed economia, per gravità e impatto" flush>
        <SignalList items={sig} limit={5} emptyText="Nessuna decisione aperta su margini, budget e chiusure." />
      </Panel>
    </>
  );
}

/* ---------------- Scostamenti ---------------- */
const DIMS = [{ id: 'productId', label: 'Prodotto' }, { id: 'species', label: 'Specie' }, { id: 'customerId', label: 'Cliente' }, { id: 'agentId', label: 'Agente' }];
const LVL = [{ id: 'mc1', label: 'MdC I' }, { id: 'mc2', label: 'MdC II' }, { id: 'ebit', label: 'EBIT' }];

function Ponte() {
  const d = useData();
  const dir = useDir(d);
  const { ctx, today, P, C } = dir;
  const [b, setB] = useState('bar');
  const [a, setA] = useState('bar');
  const [dim, setDim] = useState('productId');
  const [level, setLevel] = useState('mc2');
  const [drill, setDrill] = useState(null);
  const first = firstFactDate(ctx.facts);
  const tm = today.slice(0, 7);
  const months = useMemo(() => {
    const s = new Set((d.salesHistory || []).map(h => String(h.month).slice(0, 7)));
    if (first) for (const m of monthsIn(first.slice(0, 7), tm)) s.add(m);
    return [...s].sort().reverse();
  }, [d.salesHistory, first, tm]);
  const lastFull = months.find(m => m < tm) || tm;
  const PB = b === 'bar' ? P : wholeP(b, today);
  const PA = a === 'bar' ? (C || comparePeriod(PB, 'prec', today)) : a === 'prec' || a === 'ap' ? comparePeriod(PB, a, today) : a === 'budget' ? { ...PB, budget: true, compare: 'budget' } : wholeP(a, today);
  const br = useMemo(() => bridgeOf(d, ctx, PA, PB, dim, level), [d, ctx, PA?.key, PA?.budget, PB.key, dim, level]);
  const covA = PA.budget ? (budgetTotals(d, PB, activeVersion(d, +PB.to.slice(0, 4)))?.coverage ?? 0) : effectiveCoverage(d, ctx, PA);
  const covB = effectiveCoverage(d, ctx, PB) ?? 1; // es. il primo mese, con consegne solo da metà mese
  const drillBr = useMemo(() => {
    if (!drill || !br || PA.budget || br.by !== 'productId') return null;
    const f = x => x.productId === drill;
    return pvm(basis(d, ctx, PA, 'customerId', { filter: f }), basis(d, ctx, PB, 'customerId', { filter: f }), { level: level === 'ebit' ? 'mc2' : level });
  }, [drill, br, d, ctx, PA?.key, PB.key, level]);
  const shortcut = mode => { setB(lastFull); setA(mode); setDrill(null); };
  if (!first && !(d.salesHistory || []).length) return (
    <Panel title="Scostamenti del margine">
      <Empty title="Nessun dato da confrontare">
        <p>Il ponte spiega la differenza di margine tra due periodi (volume, mix, listino, sconti, materie prime, energia e altri costi) e quadra al centesimo. Servono le consegne con i lotti, o lo storico mensile dei ricavi e dei costi.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Btn kind="primary" onClick={() => go('dati', 'importa')}>Importa consegne</Btn></div>
      </Empty>
    </Panel>
  );
  if (!br) return null;
  const { res } = br;
  const hasA = res.TA > 0 || Math.abs(res.start) > 0;
  const lbl = p => (p.budget ? `Budget ${p.label}` : p.label);
  const mat = matOf(d);
  const steps = [{ key: 'A', label: PA.budget ? 'Budget' : 'Periodo A', value: res.start, kind: 'total', sub: PA.budget ? null : PA.short },
    ...res.steps.filter(s => Math.abs(s.value) >= 0.5).map(s => ({ ...s, kind: 'step' })),
    { key: 'B', label: 'Periodo B', value: res.end, kind: 'total', sub: PB.short }];
  const sumOf = (r, ks) => ks.reduce((s, k) => s + (r[k] || 0), 0);
  const effCols = (labelOf, onRow) => [
    { key: 'key', label: { productId: 'Prodotto', species: 'Specie', customerId: 'Cliente', agentId: 'Agente' }[labelOf] || 'Chiave', sort: r => basisLabel(d, labelOf, r.key), csv: r => basisLabel(d, labelOf, r.key),
      render: r => <><b>{basisLabel(d, labelOf, r.key)}</b>{r.onlyB ? <span className="sub">solo in B</span> : r.onlyA ? <span className="sub">solo in A</span> : null}</> },
    { key: 'tB', label: 't B', align: 'r', render: r => <>{nf(r.tB)}<span className="sub">A {nf(r.tA)}</span></> },
    { key: 'mB', label: `Margine ${PM_LABEL}`, align: 'r', csv: r => pm(r.mB), render: r => <>{perT(r.mB)}<span className="sub">A {perT(r.mA)}</span></> },
    { key: 'vm', label: 'Volume e mix', align: 'r', sort: r => sumOf(r, ['volume', 'mix']), csv: r => sumOf(r, ['volume', 'mix']), render: r => <Delta cur={sumOf(r, ['volume', 'mix'])} cmp={0} /> },
    { key: 'pr', label: 'Prezzo', align: 'r', sort: r => sumOf(r, ['listino', 'sconti']), csv: r => sumOf(r, ['listino', 'sconti']), render: r => <Delta cur={sumOf(r, ['listino', 'sconti'])} cmp={0} /> },
    { key: 'mp', label: 'Materie prime', align: 'r', sort: r => sumOf(r, ['mpPrezzo', 'mpRicetta']), csv: r => sumOf(r, ['mpPrezzo', 'mpRicetta']), render: r => <Delta cur={sumOf(r, ['mpPrezzo', 'mpRicetta'])} cmp={0} /> },
    { key: 'ot', label: 'Altri costi', align: 'r', sort: r => sumOf(r, ['calo', 'energiaEfficienza', 'energiaTariffa', 'trasformazione', 'imballi', 'logistica', 'provvigioni']), csv: r => sumOf(r, ['calo', 'energiaEfficienza', 'energiaTariffa', 'trasformazione', 'imballi', 'logistica', 'provvigioni']),
      render: r => <Delta cur={sumOf(r, ['calo', 'energiaEfficienza', 'energiaTariffa', 'trasformazione', 'imballi', 'logistica', 'provvigioni'])} cmp={0} /> },
    { key: 'total', label: 'Totale', align: 'r', csv: r => r.total, render: r => <b><Delta cur={r.total} cmp={0} /></b> },
  ];
  return (
    <>
      <Panel title="Periodi a confronto" sub="B è il periodo da spiegare, A il riferimento. Il ponte scompone M_B − M_A e quadra al centesimo.">
        <div className="stack" style={{ gap: 16 }}>
          <div className="row gap-s">
            <span className="small muted">Scorciatoie sull’ultimo mese finito ({monthLabel(lastFull, false)}):</span>
            <button className="chip outline pick" onClick={() => shortcut('prec')}>vs mese precedente</button>
            <button className="chip outline pick" onClick={() => shortcut('ap')}>vs anno precedente</button>
            <button className="chip outline pick" onClick={() => shortcut('budget')}>vs budget</button>
            {(a !== 'bar' || b !== 'bar') && <button className="chip outline pick" onClick={() => { setA('bar'); setB('bar'); }}>periodo della barra</button>}
          </div>
          <div className="dz-periods">
            <div className="dz-per"><span className="eyebrow">Periodo B</span>
              <Select ariaLabel="Periodo B" value={b} onChange={v => { setB(v); setDrill(null); }} options={[{ id: 'bar', label: `Periodo della barra · ${P.label}` }, ...months.map(m => ({ id: m, label: monthLabel(m, false) + (m === tm ? ' (in corso)' : '') }))]} />
              <span className="small muted">{PB.label}{PB.open ? ' · in corso' : ''}{covB < 0.9 && <> · <Chip kind="warn" title={`Dati per il ${pct(covB, 0)} del periodo`}>non confrontabile</Chip></>}</span>
            </div>
            <div className="dz-per"><span className="eyebrow">Periodo A (riferimento)</span>
              <Select ariaLabel="Periodo A" value={a} onChange={v => { setA(v); setDrill(null); }} options={[{ id: 'bar', label: C ? `Confronto della barra · ${C.budget ? 'budget' : C.short}` : 'Confronto della barra (periodo prima)' }, { id: 'prec', label: 'Periodo precedente' }, { id: 'ap', label: 'Stesso periodo dell’anno prima' }, { id: 'budget', label: 'Budget dello stesso periodo' }, ...months.map(m => ({ id: m, label: monthLabel(m, false) }))]} />
              <span className="small muted">{lbl(PA)}{covA < 0.9 && <> · <Chip kind="warn" title={`Dati per il ${pct(covA, 0)} del periodo`}>non confrontabile</Chip></>}</span>
            </div>
          </div>
          <div className="dz-tools">
            <span className="lbl">Dimensione</span><Seg label="Dimensione" value={br.by} onChange={v => { setDim(v); setDrill(null); }} options={DIMS} />
            <span className="lbl">Margine</span><Seg label="Livello del margine" value={level} onChange={setLevel} options={LVL} />
            {PA.budget && (dim === 'customerId' || dim === 'agentId') && <span className="small muted">Il budget è per prodotto: dimensione prodotto.</span>}
          </div>
        </div>
      </Panel>
      <div className="kpis">
        <Kpi label={`${LEVELS[level]} A`} {...money(res.start)} foot={PA.budget ? 'budget' : PA.short} />
        <Kpi label={`${LEVELS[level]} B`} {...money(res.end)} foot={`${PB.short} · ${nf(res.TB)} t`} />
        <Kpi label="Differenza" value={(res.end - res.start >= 0 ? '+' : '−') + money(Math.abs(res.end - res.start)).value} unit={money(res.end - res.start).unit}
          status={Math.abs(res.end - res.start) < Math.max(mat.abs ?? 5000, (mat.pct ?? 2) / 100 * Math.abs(res.start)) ? 'ok' : res.end > res.start ? 'ok' : 'bad'}
          foot={Math.abs(res.start) >= 0.5 ? sf((res.end - res.start) / Math.abs(res.start) * 100, 1) + '% su A' : '—'} />
        <Kpi label={<Def text="Margine medio per tonnellata: M / t. La differenza tra B e A si spiega con i passi del ponte.">Margine per t</Def>} value={perT(res.mBarB)} unit={PM_LABEL} foot={`A ${perT(res.mBarA)} ${PM_LABEL}`} />
      </div>
      <div className="split">
        <Panel title="Ponte del margine" sub={`${LEVELS[level]} da ${lbl(PA)} a ${PB.label} · passa sopra un effetto per la formula`}>
          {hasA ? <HWaterfall steps={steps} ariaLabel="Ponte del margine" /> : <Empty title="Nessun dato nel periodo A">Scegli un altro periodo di riferimento.</Empty>}
          <p className="dz-check" style={{ marginTop: 8 }}>Quadratura: {LEVELS[level]} A + Σ effetti − {LEVELS[level]} B = {nf(res.check, 2)} €{res.collapsed ? ` · materie prime senza dettaglio per ingrediente in ${res.collapsed} ${br.by === 'productId' ? 'prodotti' : 'chiavi'}: la variazione per t è tutta nel prezzo` : ''}</p>
        </Panel>
        <Panel title="Lettura" sub={`Soglia di materialità ${kEur(Math.max(mat.abs ?? 5000, (mat.pct ?? 2) / 100 * Math.abs(res.start)), 1)} (${nf(mat.pct ?? 2)}% del margine di A, minimo ${kEur(mat.abs ?? 5000, 0)})`}>
          <div className="dz-read">
            {covB < 0.9 && <div className="note warn">Il periodo B ha dati solo per il {pct(covB, 0)} dei giorni (per esempio il primo mese, con consegne da metà mese): il confronto non è omogeneo.</div>}
            {covA < 0.9 && <div className="note warn">{PA.budget ? `Il budget copre solo il ${pct(covA, 0)} del periodo (un budget per anno): il confronto non è omogeneo.` : `Il periodo A ha dati solo per il ${pct(covA, 0)} dei giorni (per esempio il primo mese, parziale): il confronto non è omogeneo.`}</div>}
            {narrative(res, mat, { vs: vsText(PA, PB) }).map((t, i) => <p key={i}>{t}</p>)}
            <Kv items={[
              ['Volume', `${sf(res.TB - res.TA, 0)} t (${res.TA ? sf((res.TB - res.TA) / res.TA * 100, 1) + '%' : '—'})`],
              ['Prezzo netto', skEur((res.steps.find(s => s.key === 'listino')?.value || 0) + (res.steps.find(s => s.key === 'sconti')?.value || 0))],
              ['Materie prime', skEur((res.steps.find(s => s.key === 'mpPrezzo')?.value || 0) + (res.steps.find(s => s.key === 'mpRicetta')?.value || 0))],
            ]} />
          </div>
        </Panel>
      </div>
      <Panel title={`Effetti per ${DIMS.find(x => x.id === br.by).label.toLowerCase()}`} sub={br.by === 'productId' && !PA.budget ? 'Contributo di ogni prodotto agli effetti del ponte (€) · clic su un prodotto per il dettaglio per cliente' : 'Contributo di ogni chiave agli effetti del ponte (€)'} flush>
        <Table rows={res.rows} rowKey={r => r.key} initialSort={{ key: 'total', dir: 'asc' }} exportName="scostamenti" selected={drill}
          onRow={br.by === 'productId' && !PA.budget ? r => setDrill(x => (x === r.key ? null : r.key)) : undefined} cols={effCols(br.by)} />
      </Panel>
      {drillBr && <Panel title={`Dettaglio per cliente · ${basisLabel(d, 'productId', drill)}`} sub={`${LEVELS[level === 'ebit' ? 'mc2' : level]} del prodotto da ${lbl(PA)} a ${PB.label}: ${eurTxt(drillBr.start)} → ${eurTxt(drillBr.end)}`} flush
        actions={<Btn small kind="ghost" icon={LuX} title="Chiudi il dettaglio" onClick={() => setDrill(null)} />}>
        <Table rows={drillBr.rows} rowKey={r => r.key} initialSort={{ key: 'total', dir: 'asc' }} exportName="scostamenti-clienti" cols={effCols('customerId')} pageSize={20} />
      </Panel>}
    </>
  );
}

/* ---------------- Costi fissi ---------------- */
const GROUPS = [{ id: 'stabilimento', label: 'Stabilimento' }, { id: 'commerciale', label: 'Commerciale' }, { id: 'struttura', label: 'Struttura' }];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function CostiFissi() {
  const d = useData();
  const { today } = useDir(d);
  const curYear = +today.slice(0, 4);
  const years = [...new Set([curYear, curYear + 1, ...(d.fixedCosts || []).map(f => +String(f.month).slice(0, 4))])].filter(Boolean).sort();
  const [year, setYear] = useState(curYear);
  const [kind, setKind] = useState('consuntivo');
  const [verSel, setVerSel] = useState(null);
  const centers = d.costCenters || [];
  // versioni del budget dell'anno: righe di budget e costi fissi di budget
  const vers = useMemo(() => {
    const s = new Set(budgetVersions(d, year));
    for (const f of d.fixedCosts || []) if (f.kind === 'budget' && String(f.month).startsWith(year + '-')) s.add(f.version || 'B');
    return [...s];
  }, [d.budget, d.fixedCosts, year]);
  const version = kind === 'budget' ? (verSel && vers.includes(verSel) ? verSel : activeVersion(d, year)) : null;
  const verLocked = kind === 'budget' && isLocked(d, year, version);
  const cell = useMemo(() => {
    const m = {};
    for (const f of d.fixedCosts || []) if ((f.kind || 'consuntivo') === kind && String(f.month).startsWith(year + '-') && (kind !== 'budget' || (f.version || 'B') === version)) (m[`${String(f.month).slice(0, 7)}|${f.centerId}`] ||= []).push(f);
    return m;
  }, [d.fixedCosts, year, kind, version]);
  // nei mesi senza consuntivo il budget di riferimento compare come suggerimento (è la stima usata nei conti)
  const budHint = useMemo(() => {
    if (kind !== 'consuntivo') return {};
    const v = activeVersion(d, year), m = {};
    for (const f of d.fixedCosts || []) if (f.kind === 'budget' && String(f.month).startsWith(year + '-') && (f.version || 'B') === v) { const k = `${String(f.month).slice(0, 7)}|${f.centerId}`; m[k] = (m[k] || 0) + (+f.amount || 0); }
    return m;
  }, [d.fixedCosts, d.settings, year, kind]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const val = (m, c) => { const r = cell[`${m}|${c}`]; return r ? r.reduce((s, x) => s + (+x.amount || 0), 0) : null; };
  const setVal = (m, c, v) => {
    const rows = cell[`${m}|${c.id}`] || [];
    const lab = `Costo fisso ${kind} · ${c.name} · ${monthLabel(m, false)}: ${v == null ? 'cancellato' : nf(v) + ' €'}`;
    let ops;
    if (v == null) ops = rows.length ? [{ kind: 'removeMany', coll: 'fixedCosts', ids: rows.map(r => r.id) }] : [];
    else if (rows.length) ops = [{ kind: 'update', coll: 'fixedCosts', id: rows[0].id, patch: { amount: v, source: rows[0].source === 'demo' ? 'manuale' : rows[0].source || 'manuale' } }, ...(rows.length > 1 ? [{ kind: 'removeMany', coll: 'fixedCosts', ids: rows.slice(1).map(r => r.id) }] : [])];
    else {
      const base = `${kind === 'budget' ? `fb-${version}` : 'fc'}-${m}-${c.id.replace(/^cc-/, '')}`;
      const id = (d.fixedCosts || []).some(f => f.id === base) ? uid('fc') : base;
      ops = [{ kind: 'add', coll: 'fixedCosts', obj: { id, month: m, centerId: c.id, kind, amount: v, source: 'manuale', note: '', ...(kind === 'budget' ? { version } : {}) } }];
    }
    if (ops.length && store.batch(ops, lab) !== false) toast('Salvato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const closed = m => (kind === 'consuntivo' && isClosedMonth(d, m)) || verLocked;
  const groups = [...GROUPS.map(g => ({ ...g, rows: centers.filter(c => c.cash !== false && (GROUPS.some(x => x.id === c.group) ? c.group : 'struttura') === g.id) })), { id: 'nonCash', label: 'Non monetari (ammortamenti)', rows: centers.filter(c => c.cash === false) }].filter(g => g.rows.length);
  const colTot = m => centers.reduce((s, c) => s + (val(m, c.id) || 0), 0);
  const rowTot = c => months.reduce((s, m) => s + (val(m, c.id) || 0), 0);
  const total = centers.reduce((s, c) => s + rowTot(c), 0);
  // consuntivo parziale: nel conto del mese i centri senza importo valgono zero (la stima vale solo per i mesi senza consuntivo)
  const partial = kind !== 'consuntivo' ? [] : months.filter(m => { const n = centers.filter(c => val(m, c.id) != null).length; return n > 0 && n < centers.length; });
  return (
    <>
      <div className="dz-tools">
        <span className="lbl">Anno</span><Seg label="Anno" value={String(year)} onChange={v => setYear(+v)} options={years.map(y => ({ id: String(y), label: String(y) }))} />
        <span className="lbl">Tipo</span><Seg label="Tipo di costo" value={kind} onChange={setKind} options={[{ id: 'consuntivo', label: 'Consuntivo' }, { id: 'budget', label: 'Budget' }]} />
        {kind === 'budget' && vers.length > 1 && <><span className="lbl">Versione</span><Select className="slim" ariaLabel="Versione del budget" value={version} onChange={setVerSel} options={vers.map(v => ({ id: v, label: v + (v === activeVersion(d, year) ? ' · riferimento' : '') }))} /></>}
        <span className="sp" />
        <span className="small muted">Totale {kind} {year}: <b>{eurTxt(total)}</b></span>
      </div>
      {!centers.length ? <Panel title="Costi fissi per centro"><Empty title="Nessun centro di costo">
        <p>I costi fissi mensili si registrano per centro di costo e alimentano EBITDA ed EBIT. Si può partire dagli otto centri tipici di un mangimificio e poi rinominarli, o aggiungerli uno per uno qui sotto.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Btn kind="primary" icon={LuPlus} onClick={() => { if (store.batch([{ kind: 'addMany', coll: 'costCenters', objs: COST_CENTERS.map(c => ({ ...c })) }], 'Centri di costo tipici di un mangimificio') !== false) toast('8 centri di costo aggiunti', 'ok', { label: 'Annulla', fn: () => store.undo() }); }}>Usa gli 8 centri tipici</Btn></div>
      </Empty></Panel> : (
        <Panel title={`Costi fissi ${kind === 'budget' ? 'di budget' : 'a consuntivo'} ${year}`} sub={kind === 'consuntivo' ? 'Importi mensili in euro per centro di costo; i mesi chiusi sono bloccati (si riaprono da Chiusura del mese). Un mese senza consuntivo usa il budget (in grigio nelle caselle vuote) o la media degli ultimi 12 mesi, segnato «stimato».' : verLocked ? `Versione ${version} approvata: bloccata. Per cambiare i costi fissi di budget crea una revisione da Direzione › Budget.` : `Budget della versione ${version} (bozza): si può correggere anche nei mesi chiusi.`} flush className="dz-grid">
          <div className="tw">
            <table className="t">
              <thead><tr><th>Centro</th>{MESI.map((lab, i) => partial.includes(months[i])
                ? <th key={lab} className="r dz-partial" title="Consuntivo parziale: mancano alcuni centri">{lab}<LuTriangleAlert aria-label="consuntivo parziale" /></th>
                : <th key={lab} className="r">{lab}</th>)}<th className="r">Totale</th></tr></thead>
              <tbody>
                {groups.map(g => (
                  <React.Fragment key={g.id}>
                    <tr className="grp"><td colSpan={14}>{g.label}</td></tr>
                    {g.rows.map(c => (
                      <tr key={c.id}>
                        <td><b>{c.name}</b><span className="sub">{c.code || c.id}</span></td>
                        {months.map(m => closed(m)
                          ? <td key={m} className="r lock" title={verLocked ? `Versione ${version} approvata` : 'Mese chiuso'}>{val(m, c.id) == null ? '—' : nf(val(m, c.id))}<LuLock aria-hidden="true" /></td>
                          : <td key={m} className="r"><NumInput slim decimals={0} min={0} value={val(m, c.id)} placeholder={budHint[`${m}|${c.id}`] != null ? nf(budHint[`${m}|${c.id}`]) : undefined} onChange={v => { if ((v ?? null) !== val(m, c.id)) setVal(m, c, v); }} ariaLabel={`${c.name} ${monthLabel(m, false)}`} /></td>)}
                        <td className="r"><b>{nf(rowTot(c))}</b></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr className="tot"><td>Totale</td>{months.map(m => <td key={m} className="r">{nf(colTot(m))}</td>)}<td className="r">{nf(total)}</td></tr>
              </tbody>
            </table>
          </div>
          {partial.length > 0 && <div className="note warn" style={{ margin: '8px 16px 16px' }}>
            Consuntivo parziale in {partial.map(m => monthLabel(m, false)).join(', ')}: nel conto economico di quel mese i centri senza importo valgono zero, perché il budget o la media sostituiscono solo i mesi senza alcun consuntivo. Completa i centri mancanti (o cancella gli importi del mese per tornare alla stima).
          </div>}
        </Panel>
      )}
      <div className="split">
        <Centers d={d} />
        <TrialBalance d={d} today={today} />
      </div>
    </>
  );
}

function Centers({ d }) {
  const centers = d.costCenters || [];
  const used = new Set((d.fixedCosts || []).map(f => f.centerId));
  const upd = (c, patch, what) => store.update('costCenters', c.id, patch, `Centro di costo ${c.name}: ${what}`);
  const add = () => {
    const n = centers.length + 1;
    store.add('costCenters', { id: uid('cc'), code: `CDC-${String(n).padStart(2, '0')}`, name: `Nuovo centro ${n}`, group: 'struttura', cash: true, driver: null }, 'Nuovo centro di costo');
  };
  return (
    <Panel title="Centri di costo" sub="Gruppo per il conto economico; «non monetario» per gli ammortamenti (sotto l’EBITDA)" actions={<Btn small icon={LuPlus} onClick={add}>Aggiungi</Btn>}>
      {!centers.length ? <p className="small muted">Nessun centro: aggiungine uno per iniziare.</p> : (
        <div className="dz-centers">
          {centers.map(c => (
            <div key={c.id} className="dz-center">
              <input className="input slim" defaultValue={c.name} aria-label={`Nome del centro ${c.name}`} onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) upd(c, { name: v }, 'nome'); }} />
              <Select className="slim" ariaLabel={`Gruppo di ${c.name}`} value={c.group || 'struttura'} onChange={v => upd(c, { group: v }, 'gruppo ' + v)} options={GROUPS} />
              <label className="check small"><input type="checkbox" checked={c.cash === false} onChange={e => upd(c, { cash: !e.target.checked }, e.target.checked ? 'non monetario' : 'monetario')} /> non monetario</label>
              <Btn small kind="ghost" icon={LuTrash2} title={used.has(c.id) ? 'Ha costi registrati: non si può eliminare' : `Elimina ${c.name}`} disabled={used.has(c.id)}
                onClick={() => confirm(`Eliminare il centro «${c.name}»?`, <p>Il centro non ha costi registrati. L’operazione si annulla con Ctrl+Z.</p>, () => store.remove('costCenters', c.id, `Centro di costo eliminato: ${c.name}`), { ok: 'Elimina', danger: true })} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Importazione dell'estratto mensile del bilancio di verifica: conto → centro (mappa salvata), anteprima, poi upsert. */
function TrialBalance({ d, today }) {
  const [text, setText] = useState('');
  const [month, setMonth] = useState(addMonths(today.slice(0, 7), -1));
  const [map, setMap] = useState({});
  const saved = d.settings?.finance?.chartMap || {};
  const centers = d.costCenters || [];
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const { header, rows } = parseCSV(text);
    const find = keys => header.find(h => keys.some(k => norm(h).includes(k)));
    const hAcc = find(['conto', 'account', 'codice']), hDesc = find(['descr', 'nome']), hAmt = find(['importo', 'saldo', 'amount', 'valore']), hDare = find(['dare']), hAvere = find(['avere']), hMonth = find(['mese', 'periodo', 'month']);
    const out = [];
    for (const r of rows) {
      const acc = String(r[hAcc] ?? '').trim();
      if (!acc) continue;
      const amt = hAmt ? num(r[hAmt]) : (num(r[hDare]) || 0) - (num(r[hAvere]) || 0);
      if (amt == null) continue;
      const mm = hMonth && /^\d{4}-\d{2}/.test(String(r[hMonth])) ? String(r[hMonth]).slice(0, 7) : month;
      out.push({ id: acc + '|' + mm, acc, desc: hDesc ? r[hDesc] : '', amount: amt, month: mm });
    }
    return { rows: out, header, ok: !!hAcc && (!!hAmt || !!hDare) };
  }, [text, month]);
  const centerOf = acc => map[acc] ?? saved[acc] ?? '';
  const totals = useMemo(() => {
    const t = {};
    for (const r of parsed?.rows || []) { const c = centerOf(r.acc); if (!c) continue; const k = r.month + '|' + c; t[k] = (t[k] || 0) + r.amount; }
    return t;
  }, [parsed, map, saved]);
  const apply = () => {
    const keys = Object.keys(totals);
    if (!keys.length) { toast('Assegna almeno un conto a un centro di costo', 'err'); return; }
    const objs = keys.map(k => { const [m, c] = k.split('|'); return { id: `fc-${m}-${c.replace(/^cc-/, '')}-bv`, month: m, centerId: c, kind: 'consuntivo', amount: Math.round(totals[k] * 100) / 100, source: 'bilancio', note: 'Da bilancio di verifica' }; });
    const newMap = { ...saved, ...Object.fromEntries(Object.entries(map).filter(([, v]) => v !== undefined)) };
    // il bilancio sostituisce il consuntivo del centro nel mese: si aggiorna la prima riga e si tolgono le altre (niente doppi)
    const extra = [];
    for (const o of objs) extra.push(...(d.fixedCosts || []).filter(f => (f.kind || 'consuntivo') === 'consuntivo' && String(f.month).slice(0, 7) === o.month && f.centerId === o.centerId).slice(1).map(f => f.id));
    const ok = store.batch([
      extra.length ? { kind: 'removeMany', coll: 'fixedCosts', ids: extra } : null,
      { kind: 'upsertMany', coll: 'fixedCosts', objs, key: ['month', 'centerId', 'kind'] },
      { kind: 'settings', value: s => ({ ...s, finance: { ...(s.finance || {}), chartMap: newMap } }) },
    ].filter(Boolean), `Costi fissi da bilancio di verifica: ${objs.length} righe (${[...new Set(objs.map(o => monthLabel(o.month, false)))].join(', ')})`);
    if (ok !== false) { toast(`${objs.length} costi fissi aggiornati`, 'ok', { label: 'Annulla', fn: () => store.undo() }); setText(''); setMap({}); }
  };
  const onFile = async e => { const f = e.target.files?.[0]; if (f) setText(await readFile(f)); e.target.value = ''; };
  return (
    <Panel title="Importa dal bilancio di verifica" sub="Incolla o carica l’estratto mensile (conto; descrizione; importo): ogni conto si assegna a un centro una volta sola" className="dz-paste"
      actions={<label className="btn small"><LuUpload aria-hidden="true" />File CSV<input type="file" accept=".csv,.txt" onChange={onFile} style={{ display: 'none' }} /></label>}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row"><Field label="Mese (se il file non lo indica)"><input type="month" className="input slim" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} /></Field></div>
        <textarea className="input" aria-label="Estratto del bilancio di verifica" placeholder={'conto;descrizione;importo\n6101;Salari e stipendi;41250,00\n6305;Manutenzioni;12800,50'} value={text} onChange={e => setText(e.target.value)} />
        {parsed && !parsed.ok && <div className="note warn">Servono almeno le colonne «conto» e «importo» (oppure «dare» e «avere»).</div>}
        {parsed?.ok && (
          <>
            <Table rows={parsed.rows} pageSize={12} cols={[
              { key: 'acc', label: 'Conto', render: r => <><b>{r.acc}</b><span className="sub">{r.desc}</span></> },
              { key: 'month', label: 'Mese', render: r => monthLabel(r.month) },
              { key: 'amount', label: 'Importo', align: 'r', render: r => nf(r.amount, 2) },
              { key: 'c', label: 'Centro', nosort: true, render: r => <Select className="slim" ariaLabel={`Centro del conto ${r.acc}`} value={centerOf(r.acc)} onChange={v => setMap(m => ({ ...m, [r.acc]: v }))} options={[{ id: '', label: 'Non importare' }, ...centers.map(c => ({ id: c.id, label: c.name }))]} /> },
            ]} />
            <div className="row between">
              <span className="small muted">{Object.keys(totals).length} importi per centro · {eurTxt(Object.values(totals).reduce((s, v) => s + v, 0))}{Object.keys(totals).some(k => isClosedMonth(d, k.split('|')[0])) ? ' · attenzione: mese chiuso, l’importazione sarà rifiutata' : ''}</span>
              <Btn kind="primary" small onClick={apply} disabled={!Object.keys(totals).length}>Applica</Btn>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- Chiusura del mese ---------------- */
const STATUS = { chiuso: ['accent', 'chiuso'], riaperto: ['warn', 'riaperto'], aperto: ['outline', 'aperto'] };

function CloseBody({ box, blocking }) {
  const [v, setV] = useState(() => ({ sintesi: '', conto: '', ponte: '', budget: '', force: false, note: '', ...(box.current || {}) }));
  const set = patch => { const n = { ...v, ...patch }; setV(n); box.current = n; };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p>I numeri del mese vengono congelati: consegne, lavorazioni, costi fissi a consuntivo, fatture e incassi del mese non si potranno più modificare senza riaprirlo. Rilascio e blocco dei lotti restano possibili.</p>
      {['sintesi', 'conto', 'ponte', 'budget'].map(k => (
        <Field key={k} label={`Commento · ${{ sintesi: 'sintesi', conto: 'conto economico', ponte: 'scostamenti', budget: 'budget' }[k]}`}><textarea className="input" rows={2} value={v[k]} onChange={e => set({ [k]: e.target.value })} /></Field>
      ))}
      {blocking.length > 0 && (
        <div className="note warn">
          <b>Voci bloccanti non superate:</b> {blocking.map(i => i.label).join(', ')}.
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={v.force} onChange={e => set({ force: e.target.checked })} /> Chiudi comunque (forzatura)</label>
          {v.force && <Field label="Motivo della forzatura (obbligatorio)"><input className="input" value={v.note} onChange={e => set({ note: e.target.value })} /></Field>}
        </div>
      )}
    </div>
  );
}
function ReopenBody({ box, after }) {
  const [v, setV] = useState(() => String(box.current || ''));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p>Riaprendo il mese i movimenti tornano modificabili e i numeri congelati non valgono più finché non lo si richiude. La nota resta nel registro delle modifiche.</p>
      {after.length > 0 && <div className="note warn">I mesi si chiudono in ordine: si riaprono anche {after.length === 1 ? monthLabel(after[0], false) : `i ${after.length} mesi chiusi dopo (fino a ${monthLabel(after[after.length - 1], false)})`}, da richiudere uno alla volta.</div>}
      <Field label="Nota (obbligatoria)"><textarea className="input" rows={3} value={v} autoFocus onChange={e => { setV(e.target.value); box.current = e.target.value; }} placeholder="Es. nota di credito tardiva al cliente…" /></Field>
    </div>
  );
}

function Chiusura({ sel }) {
  const d = useData();
  const { ctx, today, P } = useDir(d);
  const tm = today.slice(0, 7);
  const first = firstFactDate(ctx.facts);
  const ct = closedThrough(d);
  const months = useMemo(() => {
    const s = new Set((d.salesHistory || []).map(h => String(h.month).slice(0, 7)));
    for (const c of d.closings || []) s.add(c.month || c.id);
    if (first) for (const m of monthsIn(first.slice(0, 7), tm)) s.add(m);
    return [...s].filter(m => /^\d{4}-\d{2}$/.test(m) && m <= tm).sort().reverse();
  }, [d.salesHistory, d.closings, first, tm]);
  const series = useMemo(() => Object.fromEntries(monthlySeries(d, ctx, months.slice(0, 24)).map(m => [m.month, m])), [d, ctx, months]);
  const next = nextToClose(d, ctx);
  const m = months.includes(sel) ? sel : next && months.includes(next) && next < tm ? next : ct && months.includes(ct) ? ct : months[0];
  const rec = m ? closingRecord(d, m) : null;
  const items = useMemo(() => (m ? checklist(d, ctx, m) : []), [d, ctx, m]);
  const diff = useMemo(() => (m && rec?.status === 'chiuso' ? frozenVsLive(d, ctx, m) : []), [d, ctx, m, rec]);
  const box = useRef(null);
  if (!months.length) return <Panel title="Chiusura del mese"><Empty title="Nessun mese da chiudere">La chiusura congela i numeri di un mese finito: compare qui appena ci sono consegne o lo storico mensile.</Empty></Panel>;
  const isClosed = rec?.status === 'chiuso';
  const blocking = items.filter(i => i.blocking && !i.ok);
  const canClose = !isClosed && m < tm && !items.find(i => i.id === 'fine' && !i.ok) && !items.find(i => i.id === 'prev' && !i.ok);
  // con una voce mancante la finestra si riapre con quanto già scritto
  const doClose = (keep = false) => {
    if (!keep) box.current = { force: false, note: '' };
    confirm(`Chiudere ${monthLabel(m, false)}?`, <CloseBody box={box} blocking={blocking} />, () => {
      const v = box.current || {};
      if (blocking.length && !v.force) { toast('Lista di controllo con voci bloccanti: spunta «Chiudi comunque» e indica il motivo', 'err'); doClose(true); return; }
      if (blocking.length && !String(v.note || '').trim()) { toast('Indica il motivo della forzatura', 'err'); doClose(true); return; }
      const comments = Object.fromEntries(['sintesi', 'conto', 'ponte', 'budget'].filter(k => String(v[k] || '').trim()).map(k => [k, v[k].trim()]));
      const ops = closeMonthOps(d, ctx, m, { by: roleName(), comments, force: !!v.force, note: v.note });
      if (!ops) { toast('Il mese non si può chiudere: controlla le voci bloccanti', 'err'); return; }
      if (store.batch(ops, closeLabel(m) + (v.force ? ` (forzata: ${v.note.trim()})` : '')) !== false)
        toast(`${monthLabel(m, false)} chiuso: consegne, lavorazioni, costi fissi e fatture del mese sono bloccati`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    }, { ok: 'Chiudi il mese' });
  };
  const doReopen = (keep = false) => {
    if (!keep) box.current = '';
    const after = (d.closings || []).filter(c => c.status === 'chiuso' && (c.month || c.id) > m).map(c => c.month || c.id).sort();
    confirm(`Riaprire ${monthLabel(m, false)}?`, <ReopenBody box={box} after={after} />, () => {
      const note = String(box.current || '').trim();
      if (!note) { toast('La nota è obbligatoria per riaprire un mese', 'err'); doReopen(true); return; }
      const ops = reopenMonthOps(d, m, { by: roleName(), note });
      if (store.batch(ops, reopenLabel(m, note)) !== false) toast(`${monthLabel(m, false)} riaperto`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    }, { ok: 'Riapri', danger: true });
  };
  const s = series[m];
  // confronto con il mese prima (numeri congelati se chiuso); mese in corso o parziale: i flussi non sono confrontabili
  const ps = m ? series[addMonths(m, -1)] : null;
  const covM = !s || !ps ? null : s.partial || ps.partial ? 0 : m === tm ? s.days / daysInMonth(m) : 1;
  const kcm = (cur, prev, flow = true) => (cur == null || prev == null ? undefined : { cur: flow ? cur : pm(cur), value: flow ? prev : pm(prev), kind: flow ? 'flow' : 'ratio', good: 'up', unit: flow ? '' : PM_LABEL, decimals: flow ? 1 : pmDec(2), label: 'mese prima', cov: flow ? covM : (s?.partial || ps?.partial ? 0 : 1) });
  const st = isClosed ? STATUS.chiuso : rec?.status === 'riaperto' ? STATUS.riaperto : m === tm ? ['outline', 'in corso'] : ['outline', 'da chiudere'];
  return (
    <div className="split r">
      <Panel title="Mesi" sub={ct ? `Chiuso fino a ${monthLabel(ct, false)}` : 'Nessun mese chiuso'} flush>
        <div className="dz-mlist">
          {months.map(x => {
            const r = closingRecord(d, x), ss = series[x];
            const lab = r?.status === 'chiuso' ? (r.source === 'storico' ? 'storico' : 'chiuso') : r?.status === 'riaperto' ? 'riaperto' : x === tm ? 'in corso' : 'da chiudere';
            const kind = r?.status === 'chiuso' ? 'accent' : r?.status === 'riaperto' ? 'warn' : x === tm ? 'outline' : 'maize';
            const kpi = r?.kpis || (ss ? { mdc2T: ss.mdc2T, ebit: ss.ebit } : null);
            return (
              <button key={x} aria-pressed={x === m} onClick={() => go('direzione', 'chiusura', x)}>
                <span className="m">{monthLabel(x, false)}</span><Chip kind={kind}>{lab}</Chip>
                <span className="s">{kpi ? `MdC ${perT(kpi.mdc2T)} ${PM_LABEL} · EBIT ${kEur(kpi.ebit ?? null, 0)}` : '—'}{r?.closedAt && r.status === 'chiuso' ? ` · ${dateIt(r.closedAt.slice(0, 10))}` : ''}</span>
              </button>
            );
          })}
        </div>
      </Panel>
      <div className="stack">
        <Panel title={monthLabel(m, false)} sub={rec?.source === 'storico' ? 'Mese dallo storico mensile (gestionale precedente)' : isClosed ? `Chiuso il ${dateIt(rec.closedAt?.slice(0, 10))} da ${rec.closedBy || '—'}` : m === tm ? 'Mese in corso: si chiude dal giorno dopo la fine del mese' : 'Mese da chiudere'}
          actions={<div className="row gap-s"><Chip kind={st[0]} icon={isClosed ? LuSnowflake : undefined}>{st[1]}</Chip>
            {isClosed && ct && m <= ct && <Btn small icon={LuLockOpen} onClick={() => doReopen()}>Riapri</Btn>}
            {!isClosed && <Btn small kind="primary" icon={LuLock} onClick={() => doClose()} disabled={!canClose} title={canClose ? undefined : 'Il mese deve essere finito e il mese precedente chiuso'}>Chiudi il mese</Btn>}</div>}>
          <div className="stack" style={{ gap: 16 }}>
            {s && <div className="kpis">
              <Kpi label="Ricavi netti" {...money(rec?.status === 'chiuso' ? rec.pnl?.revenue : s.revenue)} cmp={kcm(s.revenue, ps?.revenue)} foot={`${nf(rec?.status === 'chiuso' ? rec.pnl?.tonnes : s.tonnes)} t`} />
              <Kpi label="MdC II" value={perT(rec?.status === 'chiuso' ? rec.kpis?.mdc2T : s.mdc2T)} unit={PM_LABEL} cmp={kcm(s.mdc2T, ps?.mdc2T, false)} foot={eurTxt(rec?.status === 'chiuso' ? rec.pnl?.mc2 : s.mdc2)} />
              <Kpi label="EBIT" {...money(rec?.status === 'chiuso' ? rec.kpis?.ebit : s.ebit)} cmp={kcm(s.ebit, ps?.ebit)} foot={s.estimatedFixed && !isClosed ? <Chip kind="maize">fissi stimati</Chip> : isClosed ? 'congelato' : 'dal vivo'} />
            </div>}
            {(rec?.note || rec?.forced || rec?.reopenNote || rec?.history?.length) && <Kv items={[
              rec.note && ['Nota', rec.note],
              rec.forced && ['Chiusura forzata', `${rec.forced.note || '—'} (voci: ${rec.forced.items.join(', ')})`],
              rec.status === 'riaperto' && ['Riaperto', `${dateIt(String(rec.reopenedAt).slice(0, 10))} da ${rec.reopenedBy || '—'}: ${rec.reopenNote}`],
              ...(rec.history || []).map((h, i) => [`Riapertura ${i + 1}`, `${dateIt(String(h.reopenedAt).slice(0, 10))} · ${h.note || ''}`]),
            ]} />}
          </div>
        </Panel>
        <Panel title="Lista di controllo" sub={isClosed ? 'Situazione attuale (il mese è chiuso)' : 'Le voci rosse bloccano la chiusura; le altre sono avvisi'}>
          <ul className="dz-cl">
            {items.map(i => (
              <li key={i.id}>
                <span className={`ic ${i.ok ? 'ok' : i.blocking ? 'block' : 'no'}`} aria-label={i.ok ? 'superata' : i.blocking ? 'bloccante' : 'avviso'}>{i.ok ? <LuCircleCheck /> : i.blocking ? <LuCircleAlert /> : <LuTriangleAlert />}</span>
                <span><b>{i.label}</b>{i.blocking && <span className="muted small"> · bloccante</span>}<span className="det">{i.detail}</span></span>
                {i.link && !i.ok ? <Btn small kind="ghost" onClick={() => go(i.link.area, i.link.tab, i.link.id)}>Apri <LuArrowRight /></Btn> : <span />}
              </li>
            ))}
          </ul>
        </Panel>
        {isClosed && rec?.source !== 'storico' && (
          <Panel title="Congelato e dal vivo" sub="Differenze tra i numeri della chiusura e quelli ricalcolati oggi (oltre 1 €)">
            {diff.length ? (
              <div className="dz-frozen">
                <div className="note warn">Dopo la chiusura sono cambiati dati del mese (correzioni forzate o anagrafiche): il conto usa i numeri congelati. Riaprire e richiudere il mese per aggiornarli.</div>
                <Table rows={diff} rowKey={r => r.id} cols={[
                  { key: 'label', label: 'Voce', render: r => <b>{r.label}</b> },
                  { key: 'frozen', label: 'Congelato', align: 'r', render: r => nf(r.frozen) },
                  { key: 'live', label: 'Dal vivo', align: 'r', render: r => nf(r.live) },
                  { key: 'delta', label: 'Δ', align: 'r', render: r => <Delta cur={r.live} cmp={r.frozen} /> },
                ]} />
              </div>
            ) : <p className="small muted"><LuCircleCheck aria-hidden="true" style={{ verticalAlign: '-2px', color: 'var(--good)' }} /> Nessuna differenza: i numeri congelati coincidono con quelli attuali.</p>}
          </Panel>
        )}
      </div>
    </div>
  );
}
function roleName() { const r = getPrefs().role; return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Direzione'; }
