/* FeedOS 17 · Acquisti › Varianze (pacchetto WP5): varianza di prezzo d'acquisto (PPV) sugli standard dell'anno, varianza di materiale
 * dei lotti prodotti scomposta in formula, prezzo e quantità, premio pagato sul mercato, effetto dei tempi d'acquisto e standard modificabili.
 * Contratto della fondazione: la sezione della scheda prodotto ProductActualVsStd({d, id}). */
import React, { useMemo, useState } from 'react';
import { LuSave, LuScale } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { ctxOf, appToday } from '../core/derived.js';
import { nf, sf, addDays, byId, monthLabel, sum } from '../core/util.js';
import { PM_LABEL, pm, pmIn, pmDec, nfPm, colPm } from '../core/units.js';
import { usePeriod } from '../ui/period.jsx';
import { ppv, materialVariance, marketPremium, timing, stdPrices, productActualVsStd } from '../engine/purchaseVariance.js';
import { Panel, Kpi, Table, Chip, Btn, Select, NumInput, Empty, SearchBox, filterRows } from '../ui/ui.jsx';
import { LineChart, Legend, SERIES } from '../ui/charts.jsx';
import { Def, HWaterfall, MonthBars, eurTxt, skEur } from './direzione-conto.jsx';

const spc = (v, k = 1) => (v == null || !Number.isFinite(v) ? '—' : `${sf(v * 100, k)}%`);
const sEur = v => (v == null || !Number.isFinite(v) ? '—' : Math.abs(v) < 0.5 ? '0 €' : (v > 0 ? '+' : '') + eurTxt(v));
const signKind = v => (v > 0.5 ? 'crit' : v < -0.5 ? 'good' : '');

export function Varianze({ d, sel }) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const today = appToday(d);
  const Y = { from: today.slice(0, 4) + '-01-01', to: today };
  const pv = useMemo(() => ppv(d, ctx, per.P), [d, ctx, per.P]);
  const pvC = useMemo(() => (per.C && !per.C.budget ? ppv(d, ctx, per.C) : null), [d, ctx, per.C]);
  const pvY = useMemo(() => ppv(d, ctx, Y), [d, ctx, Y.from, Y.to]);
  const mv = useMemo(() => materialVariance(d, ctx, per.P), [d, ctx, per.P]);
  const mp = useMemo(() => marketPremium(d, per.P), [d, per.P]);
  const tm = useMemo(() => timing(d, per.P), [d, per.P]);
  const ing = byId(d.ingredients || []), prod = byId(d.products || []);
  if (!pv.byIng.length && !mv.byLot.length) return <Panel title="Varianze"><Empty icon={LuScale} title="Nessun arrivo né produzione nel periodo">Le varianze confrontano i prezzi dei lotti ricevuti e i consumi dei lotti prodotti con i costi standard dell’anno.</Empty></Panel>;
  const T = mv.total;
  const top = pv.byIng.slice(0, 4).map(x => x.ingId);
  const colors = Object.fromEntries(top.map((k, i) => [k, SERIES[i]]));
  const months = pv.byMonth.map(m => ({
    key: m.month, label: monthLabel(m.month), title: monthLabel(m.month, false),
    bars: [...top.map(k => ({ key: k, value: (m.byIng[k] || 0) / 1000, color: colors[k] })), { key: 'altre', value: (m.ppv - sum(top, k => m.byIng[k] || 0)) / 1000, color: 'var(--axis)' }],
  }));
  const steps = [
    { key: 'stdNow', label: 'Standard con le formule di oggi', value: (T.std - T.formula) / 1000, kind: 'total', def: 'Costo delle materie prime dei lotti prodotti con le formule approvate oggi, ai prezzi standard dell’anno.' },
    { key: 'formula', label: 'Effetto formula', value: T.formula / 1000, def: 'Differenza fra le versioni di formula usate davvero e quelle approvate oggi, entrambe ai prezzi standard.' },
    { key: 'std', label: 'Standard delle formule usate', value: T.std / 1000, kind: 'total' },
    { key: 'price', label: 'Varianza di prezzo', value: T.price / 1000, def: 'Tonnellate consumate × (prezzo dei lotti di materia prima consumati − standard).' },
    { key: 'quantity', label: 'Varianza di quantità', value: T.quantity / 1000, def: '(Tonnellate consumate − tonnellate della formula) × standard: dosaggi, cali e scarti in miscelazione.' },
    { key: 'actual', label: 'Costo effettivo', value: T.actual / 1000, kind: 'total' },
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label={<Def text="Varianza di prezzo d’acquisto: Σ lotti ricevuti nel periodo (prezzo − standard dell’anno) × tonnellate. Positiva = si è pagato più dello standard.">PPV del periodo</Def>}
          value={sEur(pv.total)} foot={`${spc(pv.pct)} su ${eurTxt(pv.stdSpend)} di standard`}
          cmp={pvC && pvC.spend > 0.5 * pv.spend ? { cur: pv.total / 1000, value: pvC.total / 1000, kind: 'ratio', good: 'down', unit: 'k€', decimals: 0, label: per.C.short, cov: per.cov } : undefined} />
        <Kpi label="PPV da inizio anno" value={sEur(pvY.total)} foot={spc(pvY.pct) + ' sugli standard'} />
        <Kpi label={<Def text="Costo effettivo delle materie prime dei lotti prodotti meno il loro costo standard (formule usate, prezzi standard), per tonnellata prodotta.">Varianza di materiale</Def>}
          value={T.varT != null ? sf(pm(T.varT), pmDec(2)) : '—'} unit={PM_LABEL} foot={`${sEur(T.actual - T.std)} su ${nf(T.tonnes)} t`} status={T.varT == null ? undefined : T.varT <= 0 ? 'ok' : T.varT < 5 ? 'warn' : 'bad'} />
        <Kpi label={<Def text="Prezzo del lotto ÷ quotazione della stessa settimana − 1: mediana delle materie prime quotate.">Premio sul mercato</Def>} value={spc(mp.median)} foot={`${nf(mp.lots.length)} lotti con quotazione`} />
        <Kpi label={<Def text="Σ t × (media delle quotazioni delle 13 settimane prima dell’arrivo − quotazione all’arrivo). Positivo = si è comprato sotto la media recente.">Tempi d’acquisto</Def>} value={sEur(tm.total)} foot={tm.total >= 0 ? 'comprato sotto la media del trimestre' : 'comprato sopra la media del trimestre'} />
      </div>

      <div className="split">
        <Panel title="Dallo standard al costo effettivo" sub={`Materie prime dei ${nf(mv.byLot.length)} lotti prodotti nel periodo · k€`}>
          <HWaterfall steps={steps} fmt={v => `${nf(v, Math.abs(v) < 10 ? 1 : 0)} k€`} ariaLabel="Scomposizione della varianza di materiale" />
        </Panel>
        <Panel title="PPV mese per mese" sub="Prime 4 materie prime per varianza e le altre · k€ (positivo = sopra lo standard)">
          {months.length ? <MonthBars cols={months} legend={[...top.map(k => ({ label: ing[k]?.short || ing[k]?.name || k, color: colors[k] })), { label: 'Altre', color: 'var(--axis)' }]} unit="k€" decimals={0} ariaLabel="Varianza di prezzo mensile" /> : <Empty title="Nessun arrivo nel periodo" />}
        </Panel>
      </div>

      <ByIngredient d={d} pv={pv} mv={mv} mp={mp} sel={sel} />
      <Panel title="Varianza di materiale per prodotto" sub="Costo delle materie prime per tonnellata: effettivo ai prezzi dei lotti consumati contro lo standard dell’anno con la formula usata" flush>
        <Table rows={mv.byProduct.map(r => ({ ...r, id: r.productId }))} onRow={r => openDrawer('product', r.productId)} initialSort={{ key: 'var', dir: 'desc' }} exportName="varianze-prodotti" cols={[
          { key: 'name', label: 'Prodotto', sort: r => prod[r.productId]?.name, render: r => <span><b>{prod[r.productId]?.name || r.productId}</b><span className="sub">{prod[r.productId]?.code}</span></span>, csv: r => prod[r.productId]?.name },
          { key: 'tonnes', label: 't', align: 'r', render: r => nf(r.tonnes) },
          { key: 'actualT', label: colPm('Effettivo'), align: 'r', render: r => nfPm(r.actualT, 2), csv: r => pm(r.actualT) },
          { key: 'stdT', label: colPm('Standard'), align: 'r', render: r => nfPm(r.stdT, 2), csv: r => pm(r.stdT) },
          { key: 'varT', label: colPm('Varianza'), align: 'r', render: r => <Chip kind={signKind(r.varT)}>{sf(pm(r.varT), pmDec(2))}</Chip>, csv: r => pm(r.varT) },
          { key: 'price', label: 'Prezzo', align: 'r', render: r => skEur(r.price, 1) },
          { key: 'quantity', label: 'Quantità', align: 'r', render: r => skEur(r.quantity, 1) },
          { key: 'formula', label: 'Formula', align: 'r', render: r => skEur(r.formula, 1) },
          { key: 'var', label: 'Totale', align: 'r', render: r => <b>{skEur(r.var, 1)}</b> },
        ]} />
      </Panel>
      <Standards d={d} today={today} />
    </>
  );
}

function ByIngredient({ d, pv, mv, mp, sel }) {
  const ing = byId(d.ingredients || []);
  const [q, setQ] = useState('');
  const cons = Object.fromEntries(mv.byIng.map(x => [x.ingId, x]));
  const prem = Object.fromEntries(mp.byIng.map(x => [x.ingId, x]));
  const rows = filterRows(pv.byIng.map(x => ({ ...x, id: x.ingId, name: ing[x.ingId]?.name || x.ingId, cons: cons[x.ingId], prem: prem[x.ingId]?.median ?? null })), q, ['name']);
  return (
    <Panel title="Varianza di prezzo per materia prima" sub="Arrivi del periodo contro lo standard dell’anno; a destra la varianza sui consumi dei lotti prodotti" flush id="var-ing" actions={<SearchBox value={q} onChange={setQ} placeholder="Cerca materia prima" />}>
      <Table rows={rows} selected={sel} onRow={r => openDrawer('ingredient', r.ingId)} initialSort={{ key: 'ppv', dir: 'desc' }} exportName="varianze-materie-prime" cols={[
        { key: 'name', label: 'Materia prima', render: r => <b>{r.name}</b> },
        { key: 'tonnes', label: 't ricevute', align: 'r', render: r => nf(r.tonnes) },
        { key: 'avgPrice', label: 'Prezzo medio', align: 'r', render: r => nf(r.avgPrice, 1) },
        { key: 'std', label: 'Standard', align: 'r', render: r => nf(r.std, 1) },
        { key: 'pct', label: 'Scarto', align: 'r', render: r => <Chip kind={r.pct > 0.05 ? 'crit' : r.pct > 0.01 ? 'warn' : r.pct < -0.01 ? 'good' : ''}>{spc(r.pct)}</Chip>, csv: r => r.pct },
        { key: 'ppv', label: 'PPV', align: 'r', render: r => <b>{sEur(r.ppv)}</b>, csv: r => r.ppv },
        { key: 'prem', label: 'Premio sul mercato', align: 'r', render: r => spc(r.prem), csv: r => r.prem },
        { key: 'consPrice', label: 'Sui consumi: prezzo', align: 'r', sort: r => r.cons?.price, render: r => (r.cons ? sEur(r.cons.price) : '—'), csv: r => r.cons?.price },
        { key: 'consQty', label: 'quantità', align: 'r', sort: r => r.cons?.quantity, render: r => (r.cons ? sEur(r.cons.quantity) : '—'), csv: r => r.cons?.quantity },
      ]} />
    </Panel>
  );
}

/** Standard dell'anno: righe salvate o, senza riga, la mediana dei prezzi delle prime 3 settimane dell'anno (o dei dati). */
function Standards({ d, today }) {
  const years = [...new Set([+today.slice(0, 4), ...(d.standards || []).map(s => +s.year)])].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  const [draft, setDraft] = useState({});
  const std = stdPrices(d, year);
  const saved = Object.fromEntries((d.standards || []).filter(s => +s.year === year).map(s => [s.ingId, s]));
  const rows = (d.ingredients || []).filter(i => std[i.id] != null || saved[i.id] || (+i.stock || 0) > 0).map(i => ({ id: i.id, name: i.name, std: std[i.id] ?? null, saved: !!saved[i.id], price: +i.price || null }));
  const changed = Object.entries(draft).filter(([k, v]) => v != null && Number.isFinite(+v) && Math.abs(+v - (std[k] ?? -1)) > 0.004);
  const save = () => {
    if (!changed.length) return;
    store.batch([{ kind: 'upsertMany', coll: 'standards', key: ['year', 'ingId'], objs: changed.map(([ingId, price]) => ({ id: `std-${year}-${ingId}`, year, ingId, price: +price, note: 'Modificato a mano' })) }], `Standard ${year}: ${changed.length} prezzi aggiornati`);
    toast(`${changed.length} standard aggiornati: varianze ricalcolate`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    setDraft({});
  };
  return (
    <Panel title={`Costi standard ${year}`} sub="Prezzi di riferimento delle materie prime per l’anno: le varianze si misurano su questi. Senza un valore salvato vale la mediana dei prezzi delle prime 3 settimane dell’anno" flush id="var-std"
      actions={<>{years.length > 1 && <Select value={String(year)} onChange={v => { setYear(+v); setDraft({}); }} options={years.map(y => ({ id: String(y), label: String(y) }))} ariaLabel="Anno degli standard" />}<Btn small kind="primary" icon={LuSave} disabled={!changed.length} onClick={save}>Salva {changed.length ? `(${changed.length})` : ''}</Btn></>}>
      <Table rows={rows} pageSize={12} initialSort={{ key: 'name', dir: 'asc' }} cols={[
        { key: 'name', label: 'Materia prima', render: r => <b>{r.name}</b> },
        { key: 'std', label: colPm('Standard'), align: 'r', render: r => <NumInput slim value={pm(draft[r.id] ?? r.std)} onChange={v => setDraft(x => ({ ...x, [r.id]: pmIn(v) }))} decimals={pmDec(1)} ariaLabel={`Standard di ${r.name}`} /> },
        { key: 'saved', label: 'Origine', render: r => (r.saved ? <Chip kind="good">salvato</Chip> : <Chip kind="outline">dai primi arrivi</Chip>), csv: r => (r.saved ? 'salvato' : 'calcolato') },
        { key: 'price', label: 'Prezzo di oggi', align: 'r', render: r => (r.price != null ? nf(r.price, 1) : '—') },
        { key: 'gap', label: 'Oggi vs standard', align: 'r', sort: r => (r.std ? r.price / r.std - 1 : null), render: r => (r.std && r.price ? <Chip kind={r.price > r.std * 1.05 ? 'crit' : r.price < r.std * 0.95 ? 'good' : ''}>{spc(r.price / r.std - 1)}</Chip> : '—') },
      ]} />
    </Panel>
  );
}

/** Sezione della scheda prodotto: costo delle materie prime effettivo e standard per mese (ultimi 6 mesi). */
export function ProductActualVsStd({ d, id }) {
  const today = appToday(d);
  const P = { from: addDays(today, -183), to: today };
  const rows = useMemo(() => productActualVsStd(d, id, P), [d, id, today]);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return (
    <div className="dsec"><div className="eyebrow">Materie prime: effettivo e standard · {last.varT != null ? `${sf(pm(last.varT), pmDec(2))} ${PM_LABEL} nell’ultimo mese` : ''}</div>
      <LineChart labels={rows.map(r => monthLabel(r.month))} height={150} unit={PM_LABEL} decimals={pmDec(1)} area={false} markLast={false}
        series={[{ key: 'a', label: 'Effettivo', color: 'var(--s1)', values: rows.map(r => pm(r.actualT)) }, { key: 's', label: 'Standard', color: 'var(--s2)', dashed: true, values: rows.map(r => pm(r.stdT)) }]} ariaLabel="Costo delle materie prime effettivo e standard" />
      <Legend items={[{ label: 'Effettivo (lotti consumati)', color: 'var(--s1)', line: true }, { label: 'Standard dell’anno', color: 'var(--s2)', line: true }]} />
    </div>
  );
}
