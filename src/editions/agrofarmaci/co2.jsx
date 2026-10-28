/* DifesaOS · ESG › CO₂ dei programmi di difesa: per olivo, vite e melo il programma aziendale e l'alternativa a confronto,
 * in kg CO₂e per ettaro e per kg di raccolto (o di olio), con rame per ettaro e costo. Dosi e trattamenti si possono
 * provare qui senza salvarli. Gli assorbimenti del suolo stanno a parte e non si sottraggono. */
import React, { useMemo, useState } from 'react';
import { LuLeaf, LuRotateCcw, LuSprout } from 'react-icons/lu';
import { go } from '../../core/router.js';
import { nf, eur, pct } from '../../core/util.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Bullet, NumInput, Empty } from '../../ui/ui.jsx';
import { StackBar } from '../../ui/charts.jsx';
import { programmeCo2, compareProgrammes, programmesByCrop, CO2_FACTORS } from '../../engine/agro-co2.js';

const CROP_LABEL = { olivo: 'Olivo', vite: 'Vite', melo: 'Melo' };
const g = v => (v == null ? '—' : nf(v * 1000, v * 1000 < 10 ? 1 : 0)); // kg → g

export function Co2Programmi({ d, route }) {
  const by = useMemo(() => programmesByCrop(d), [d]);
  const crops = Object.keys(by);
  const crop = crops.includes(route.id) ? route.id : crops[0];
  const [edits, setEdits] = useState({}); // {progId: {i: {dose, n}}}
  if (!crops.length) return <Empty icon={LuLeaf} title="Nessun programma di difesa registrato">Un programma ha coltura, resa per ettaro, trattamenti (prodotto, dose, numero) e passaggi della macchina.</Empty>;
  const list = by[crop] || [];
  const withEdits = p => ({ ...p, applications: p.applications.map((a, i) => ({ ...a, ...(edits[p.id]?.[i] || {}) })) });
  const res = list.map(p => ({ p: withEdits(p), r: programmeCo2(d, withEdits(p)) }));
  const base = res.find(x => x.p.baseline) || res[0], alt = res.find(x => x !== base);
  const cmp = alt ? compareProgrammes(base.r, alt.r) : null;
  const touched = Object.keys(edits).some(k => list.some(p => p.id === k));
  const setApp = (pid, i, patch) => setEdits(e => ({ ...e, [pid]: { ...(e[pid] || {}), [i]: { ...(e[pid]?.[i] || {}), ...patch } } }));
  const isOlive = base.r.perKgOil != null;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <Seg options={crops.map(c => ({ id: c, label: CROP_LABEL[c] || c }))} value={crop} onChange={c => go('esg', 'co2', c)} label="Coltura" />
        {touched && <Btn small kind="ghost" icon={LuRotateCcw} onClick={() => setEdits({})}>Torna ai programmi registrati</Btn>}
      </div>
      {cmp && <div className="note good" id="co2-summary">
        L’alternativa {cmp.total.abs <= 0 ? 'riduce' : 'aumenta'} le emissioni del programma di <b>{nf(Math.abs(cmp.total.abs))} kg CO₂e per ettaro</b> ({pct(Math.abs(cmp.total.pct), 0)}){isOlive && cmp.perKgOil ? `, cioè ${g(Math.abs(cmp.perKgOil.abs))} g per kg di olio` : cmp.perKg ? `, cioè ${g(Math.abs(cmp.perKg.abs))} g per kg di raccolto` : ''};
        il rame scende di {nf(Math.max(0, -cmp.copper.abs), 2)} kg/ha e i passaggi di {nf(Math.max(0, -cmp.passes.abs))}; il costo dei prodotti {cmp.cost.abs >= 0 ? 'sale' : 'scende'} di {eur(Math.abs(cmp.cost.abs))} per ettaro.
      </div>}
      <div className="split">
        {res.map(({ p, r }) => (
          <Panel key={p.id} title={p.name} sub={`${p.region} · resa ${nf(p.yieldTHa, 1)} t/ha${p.oilYieldPct ? ` · olio ${nf(p.oilYieldPct)}%` : ''}${p.note ? ` · ${p.note}` : ''}`} className={p.baseline ? '' : 'accent'}>
            <div className="kpis two">
              <Kpi label="Emissioni del programma" value={nf(r.total)} unit="kg CO₂e/ha" foot={`prodotti ${nf(r.products)} · gasolio ${nf(r.fuel)}`} />
              <Kpi label={r.perKgOil != null ? 'Per kg di olio' : 'Per kg di raccolto'} value={g(r.perKgOil ?? r.perKg)} unit="g CO₂e" foot={r.perKgOil != null ? `${g(r.perKg)} g per kg di olive` : `${nf(r.yieldKg)} kg/ha`} />
              <Kpi label="Rame metallo" value={nf(r.copperKgHa, 2)} unit="kg/ha" foot={`${nf(r.copper7y, 1)} kg in 7 anni (limite 28)`} status={r.copperKgHa > 4 ? 'bad' : r.copperKgHa > 3.2 ? 'warn' : 'ok'} />
              <Kpi label="Costo dei prodotti" value={eur(r.cost)} unit="/ha" foot={`${nf(r.passes)} passaggi`} />
            </div>
            <StackBar parts={[{ key: 'p', label: 'Prodotti', value: r.products, color: 'var(--s1)' }, { key: 'f', label: 'Gasolio', value: r.fuel, color: 'var(--s4)' }]} ariaLabel="Ripartizione delle emissioni" />
            <div className="small muted" style={{ marginTop: 6 }}>Rame metallo per ettaro all’anno (fascia verde fino a 4 kg)</div>
            <Bullet value={r.copperKgHa} lo={0} hi={6} min={0} max={4} />
            <Table rows={r.rows} pageSize={12} rowKey={x => x.i} exportName={`programma-${p.id}`} cols={[
              { key: 'product', label: 'Prodotto', render: x => <span>{x.product}{x.organic && <> <Chip kind="good">bio</Chip></>}<div className="muted small">{x.when}</div></span> },
              { key: 'dose', label: 'Dose/ha', align: 'r', render: x => <NumInput slim value={x.dose} onChange={v => setApp(p.id, x.i, { dose: v ?? 0 })} decimals={2} min={0} ariaLabel={`Dose di ${x.product}`} />, csv: true },
              { key: 'n', label: 'Tratt.', align: 'r', render: x => <NumInput slim value={x.n} onChange={v => setApp(p.id, x.i, { n: v ?? 0 })} decimals={0} min={0} ariaLabel={`Trattamenti con ${x.product}`} /> },
              { key: 'co2', label: 'kg CO₂e/ha', align: 'r', render: x => nf(x.co2, 1) },
            ]} />
            {p.soil && <div className="note maize"><LuSprout /> Assorbimenti del suolo stimati {nf(p.soil.lo, 1)}–{nf(p.soil.hi, 1)} t CO₂/ha all’anno ({p.soil.practice}): mostrati a parte, <b>non sottratti</b> dalle emissioni.</div>}
          </Panel>))}
      </div>
      <Panel title="Metodo" sub={`Versione del calcolo ${CO2_FACTORS.version} · fattori delle materie prime e degli imballi indicativi`}>
        <ul className="list small">
          <li>Prodotti dalla culla al cancello: materie prime della ricetta per i loro fattori, energia della linea di formulazione (elettricità e GPL dello stabilimento), imballo per tipo di confezione.</li>
          <li>Gasolio dei passaggi: litri per passaggio × {nf(base.r.diesel.value, 2)} kg CO₂e per litro, dai fattori della scheda Clima: {base.r.diesel.source} · stato «{base.r.diesel.status}».</li>
          <li>Per kg di raccolto: emissioni per ettaro divise per la resa; per l’olivo anche per kg di olio con la resa in olio indicata.</li>
          <li>Esclusi: concimi, irrigazione, potatura, raccolta e trasporti; per un’impronta completa del prodotto agricolo servono i dati dell’azienda agricola.</li>
          <li>{CO2_FACTORS.soilNote} Il calcolo non permette di dichiarare un prodotto «a impatto zero» o «neutrale».</li>
        </ul>
      </Panel>
    </>
  );
}

