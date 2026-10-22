/* FeedOS 18 · ESG › Impronta mangimi (pacchetto WP2 «pcf», scheda «passaporto»): pagina di partenza della fondazione 18.
 * Contiene il passaporto di prodotto spostato da esg.jsx senza cambiamenti (stesso #esg-passport, stessi numeri), che il
 * pacchetto pcf fa evolvere. Contratto: PcfPage({ d, route }), PcfCard({ d }), le sezioni delle schede laterali
 * CustomerEsg (scheda cliente) e ProductPcf (scheda prodotto), passport(d, p, I, today, f) per chi lo usava. */
import React, { useMemo } from 'react';
import { LuPrinter, LuWheat } from 'react-icons/lu';
import { go } from '../core/router.js';
import { idx, appToday } from '../core/derived.js';
import { nf, sum, dateIt, addDays } from '../core/util.js';
import { balance, aggregate, scope1PerKg, DEFAULTS } from '../engine/energy.js';
import { formulaCO2, coProductShare, afb1Check } from '../engine/formulation.js';
import { Panel, Btn, Table, Select, Empty, Kv } from '../ui/ui.jsx';
import { StackBar, Legend, SERIES } from '../ui/charts.jsx';
import { lotCheck } from './qualita.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Impronta mangimi (id della scheda «passaporto»; route.id = prodotto scelto). */
export function PcfPage({ d, route }) {
  return <Passaporto d={d} sel={route?.id} />;
}

/** Riquadro del cruscotto ESG. */
export function PcfCard({ d }) {
  return <EsgCard title="Impronta mangimi" tab="passaporto" icon={LuWheat} />;
}

/** Sezione della scheda cliente (CUSTOMER_SECTIONS, {d, id}): dichiarazione d'impronta e lettera EUDR. Stub: niente. */
export function CustomerEsg({ d, id }) { return null; }

/** Sezione della scheda prodotto (PRODUCT_SECTIONS, {d, id}): impronta del prodotto. Stub: niente. */
export function ProductPcf({ d, id }) { return null; }

/* ---------------- passaporto di prodotto (da esg.jsx, invariato) ---------------- */
export function passport(d, p, I, today, f) {
  const form = I.form[p.formulaId]; if (!form) return null;
  const lines = form.lines;
  const tot = sum(lines, l => l.kg) || 1;
  const origin = {};
  for (const l of lines) { const o = I.ing[l.ing]?.origin || 'n.d.'; origin[o] = (origin[o] || 0) + l.kg / tot; }
  const soy = lines.filter(l => /soia/i.test(I.ing[l.ing]?.name || ''));
  const soyT = sum(soy, l => l.kg), soyCert = sum(soy.filter(l => I.ing[l.ing]?.certified), l => l.kg);
  const from = addDays(today, -90);
  const runs = d.runs.filter(r => r.productId === p.id && r.date > from);
  const t = sum(runs, r => r.tonnes);
  const kwhT = t ? sum(runs, r => r.kwh || 0) / t : I.line[p.lineId]?.kwhPerT;
  const gplT = t ? sum(runs, r => r.gplKg || 0) / t : I.line[p.lineId]?.gplKgPerT;
  const cov = (() => { const m = d.energy.filter(e => e.month + '-15' > addDays(today, -365)); const b = balance(aggregate(m), f); return b.coverage || 0; })();
  const raw = formulaCO2(lines, I.ing);
  const plantE = kwhT * (1 - cov) * f.feGrid, plantH = gplT * scope1PerKg(f);
  const lots = d.lots.filter(l => l.productId === p.id && l.date > from);
  const an = lots.filter(l => l.analyses?.length);
  const ok = an.filter(l => lotCheck(d, l, I).status === 'ok').length;
  return { p, form, origin, co: coProductShare(lines, I.ing), soyShare: soyT ? soyCert / soyT : null, soyT, raw, plantE, plantH, total: raw + plantE + plantH, kwhT, gplT, cov, conf: an.length ? ok / an.length : null, nAn: an.length, lastLot: lots.sort((a, b) => (a.date < b.date ? 1 : -1))[0], afb1: afb1Check(lines, I.ing, form.species) };
}

function Passaporto({ d, sel }) {
  const I = idx(d); const today = appToday(d);
  const en = d.settings?.energy || {};
  const f = { ...DEFAULTS, feGrid: +en.feGrid || DEFAULTS.feGrid, feGpl: +en.feGpl || DEFAULTS.feGpl };
  const all = useMemo(() => d.products.map(p => passport(d, p, I, today, f)).filter(Boolean), [d, today]);
  const P = all.find(x => x.p.id === sel) || all[0];
  if (!P) return <Empty title="Nessun prodotto" />;
  const code = `FOS-${P.p.code}-${P.form.version}-${today.replace(/-/g, '').slice(2)}`;
  return (
    <>
      <div className="row between no-print">
        <Select value={P.p.id} onChange={v => go('esg', 'passaporto', v)} options={d.products.map(p => ({ id: p.id, label: p.name }))} ariaLabel="Prodotto" className="auto" />
        <Btn icon={LuPrinter} onClick={() => window.print()}>Stampa o salva in PDF</Btn>
      </div>
      <div className="passport" id="esg-passport">
        <div className="pp-head">
          <div><div className="eyebrow">Passaporto di prodotto · {d.settings?.company?.name}</div><h2>{P.p.name}</h2><div className="small muted">{P.p.form} · {P.p.packaging} · formula {P.form.code} versione {P.form.version} del {dateIt(P.form.approvedAt)}</div></div>
          <div className="pp-code"><span className="eyebrow">Codice</span><b className="mono">{code}</b><span className="xs muted">generato il {dateIt(today)}</span></div>
        </div>
        <div className="pp-grid">
          <div className="pp-big"><span className="eyebrow">Impronta dalla culla al cancello (stima)</span><b>{nf(P.total)}</b><span>kg CO₂e per tonnellata</span>
            <StackBar parts={[{ key: 'r', label: 'Materie prime', value: P.raw, color: 'var(--s3)' }, { key: 'e', label: 'Elettricità', value: P.plantE, color: 'var(--s1)' }, { key: 'h', label: 'Calore GPL', value: P.plantH, color: 'var(--s2)' }]} ariaLabel="Composizione dell’impronta" />
            <Legend items={[{ label: `Materie prime ${nf(P.raw)}`, color: 'var(--s3)' }, { label: `Elettricità ${nf(P.plantE, 1)}`, color: 'var(--s1)' }, { label: `Calore ${nf(P.plantH, 1)}`, color: 'var(--s2)' }]} />
          </div>
          <div><span className="eyebrow">Origine delle materie prime (in peso)</span>
            <StackBar parts={Object.entries(P.origin).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: k, value: v * 100, color: SERIES[i] }))} ariaLabel="Origine delle materie prime" />
            <Kv items={Object.entries(P.origin).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${nf(v * 100, 1)}%`])} />
          </div>
          <div><span className="eyebrow">Circolarità e filiera</span>
            <Kv items={[['Co-prodotti dell’agroindustria', `${nf(P.co * 100, 1)}% in peso`], ['Soia certificata senza deforestazione', P.soyT ? `${nf(P.soyShare * 100)}% della soia` : 'formula senza soia'], ['Energia di stabilimento', `${nf(P.kwhT, 1)} kWh/t · ${nf(P.gplT, 2)} kg GPL/t`], ['Quota fotovoltaica dell’elettricità', `${nf(P.cov * 100, 1)}%`]]} />
          </div>
          <div><span className="eyebrow">Qualità e sicurezza</span>
            <Kv items={[['Lotti conformi all’etichetta (90 gg)', P.conf == null ? 'nessuna analisi' : `${nf(P.conf * 100)}% di ${P.nAn} analizzati`], ['Aflatossina B1 stimata', `${nf(P.afb1.value, 1)} µg/kg (limite ${P.afb1.limit})`], ['Ultimo lotto', P.lastLot ? `${P.lastLot.code} · ${dateIt(P.lastLot.date)}` : '—'], ['Tracciabilità', 'lotti di materia prima e clienti collegati a ogni lotto']]} />
          </div>
        </div>
        <p className="pp-note">Metodo: materie prime con fattori di emissione indicativi dalla coltivazione al cancello del mangimificio; elettricità di rete {nf(f.feGrid * 1000, 1)} g CO₂/kWh sulla quota non coperta dal fotovoltaico; GPL con CH₄ e N₂O di combustione. Non è una LCA certificata (ISO 14067): serve a confrontare prodotti e scelte di formulazione. Trasporto al cliente escluso.</p>
      </div>
      <Panel title="Confronto tra prodotti" sub="kg CO₂e per tonnellata · clic per il passaporto" flush>
        <Table rows={all} rowKey={x => x.p.id} selected={P.p.id} onRow={x => go('esg', 'passaporto', x.p.id)} initialSort={{ key: 'total', dir: 'desc' }} exportName="impronta-prodotti" cols={[
          { key: 'name', label: 'Prodotto', sort: x => x.p.name, csv: x => x.p.name, render: x => <b>{x.p.name}</b> },
          { key: 'total', label: 'Totale', align: 'r', render: x => <b>{nf(x.total)}</b> },
          { key: 'raw', label: 'Materie prime', align: 'r', render: x => nf(x.raw) },
          { key: 'plant', label: 'Stabilimento', align: 'r', sort: x => x.plantE + x.plantH, csv: x => x.plantE + x.plantH, render: x => nf(x.plantE + x.plantH, 1) },
          { key: 'co', label: 'Co-prodotti', align: 'r', csv: x => x.co * 100, render: x => nf(x.co * 100) + '%' },
          { key: 'it', label: 'Origine Italia', align: 'r', sort: x => x.origin.Italia || 0, csv: x => (x.origin.Italia || 0) * 100, render: x => nf((x.origin.Italia || 0) * 100) + '%' },
        ]} />
      </Panel>
    </>
  );
}
