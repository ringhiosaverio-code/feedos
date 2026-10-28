/* FeedOS 16 · ESG e tesi: cruscotto di maturità, questionario guidato, registri di acqua e rifiuti (in sostenibilita.jsx),
 * i 49 indicatori del registro alimentati dai dati di ogni giorno (con la provenienza di ogni valore), energia e CO₂ con
 * il modello della tesi, collegamento tra la tesi e l'azienda.
 * Fondamenta 18: le schede dei nove pacchetti ESG (clima, impronta/passaporto, filiera, ambiente, persone, governance, piano,
 * rischi, report/VSME) arrivano da esg-pages.jsx e si disegnano dentro SlotGuard; passaporto e VSME sono in esg-pcf.jsx ed esg-report.jsx. */
import React, { useMemo, useState } from 'react';
import { LuDatabase, LuPencil, LuFileText, LuClipboardList } from 'react-icons/lu';
import { useData, store, toast } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday, kpis, period12 } from '../core/derived.js';
import { nf, sf, sum, dateIt, monthLabel } from '../core/util.js';
import { num } from '../core/io.js';
import { computeKpis } from '../engine/esg.js';
import { registerMonths } from '../engine/sustainability.js';
import { ESG_REGISTRY, PILLARS } from '../data/esgRegistry.js';
import { THESIS } from '../data/thesis.js';
import { balance, aggregate, intensityAt, scope1PerKg, DEFAULTS, GRID_FACTORS } from '../engine/energy.js';
import { PageHead, Panel, Table, Chip, Kpi, Field, Select, Empty, SearchBox, filterRows, Seg, Kv, Cls } from '../ui/ui.jsx';
import { Columns, LineChart, Sankey, Legend, SERIES } from '../ui/charts.jsx';
import { NAV } from '../app/nav.js';
import { Cruscotto, Questionario, Acqua, Rifiuti, openQuestion } from './sostenibilita.jsx';
import { SURVEY_QUESTIONS } from '../data/survey.js';
import { ESG_PAGES } from './esg-pages.jsx';
import { SlotGuard } from './slots.jsx';

// Solo la versione completa contiene i dati della tesi: nella pubblica TH è null e il modulo dei dati non entra nel file.
const TH = __FULL__ ? THESIS : null;
const FULL = !!TH;
const SRC = { auto: { kind: 'good', label: 'dai dati' }, questionario: { kind: 'violet', label: 'questionario' }, manuale: { kind: 'accent', label: 'inserito' }, tesi: { kind: 'maize', label: 'tesi' } };
const SRC_ICON = { auto: LuDatabase, questionario: LuClipboardList, manuale: LuPencil, tesi: LuFileText };
// indicatore del registro → domanda del questionario che lo alimenta
const KPI_Q = Object.fromEntries(SURVEY_QUESTIONS.filter(q => q.kpi && q.type !== 'auto').map(q => [q.kpi, q.id]));

export function Esg({ route }) {
  const d = useData();
  // la scheda «tesi» c'è solo nella versione completa; in un'edizione senza cruscotto si apre la prima scheda
  const tab = NAV.esg.tabs.some(t => t.id === route.tab) ? route.tab : NAV.esg.tabs[0]?.id || 'cruscotto';
  const Page = ESG_PAGES[tab]; // schede dei pacchetti ESG (esg-pages.jsx), ciascuna isolata dagli errori
  return (
    <>
      <PageHead title={FULL ? 'ESG e tesi' : 'ESG'} lead={`Quanto è sostenibile lo stabilimento, misurato con i dati di ogni giorno: clima ed emissioni, impronta dei mangimi, filiera, acqua e rifiuti, persone, governance, obiettivi e rischi. Il questionario guidato completa ciò che i dati non dicono e alimenta i 49 indicatori ${FULL ? 'della tesi' : 'ESG'}, l’impronta dei mangimi e il report VSME.`}
        tabs={NAV.esg.tabs} tab={tab} onTab={t => go('esg', t)} />
      {Page && <SlotGuard key={tab}><Page d={d} route={route} /></SlotGuard>}
      {tab === 'cruscotto' && <Cruscotto d={d} />}
      {tab === 'questionario' && <Questionario d={d} sec={route.id} />}
      {tab === 'acqua' && <Acqua d={d} nuova={route.id === 'nuova'} />}
      {tab === 'rifiuti' && <Rifiuti d={d} nuovo={route.id === 'nuovo'} />}
      {tab === 'indicatori' && <Indicatori d={d} />}
      {tab === 'energia' && <Energia d={d} />}
      {FULL && tab === 'tesi' && <TesiFull d={d} T={TH} />}
    </>
  );
}

/* ---------------- indicatori ---------------- */
function Indicatori({ d }) {
  const P = period12(d);
  const [thesis, setThesis] = useState(false);
  const R = useMemo(() => thesis && TH ? computeKpis(d, P, { thesis: TH.kpiValues }) : kpis(d, P), [d, thesis]);
  const [pil, setPil] = useState(''), [src, setSrc] = useState(''), [q, setQ] = useState('');
  const rows = filterRows(R.kpis.filter(k => (!pil || k.pillar === pil) && (!src || (src === 'vuoto' ? k.value == null : k.source === src))), q, ['code', 'name', 'formula', 'source']);
  const setVal = (k, v) => store.esg({ [k.code]: v === '' ? null : v }, `Indicatore ${k.code}: ${v === '' ? 'svuotato' : v}`);
  const withV = R.kpis.filter(k => k.value != null);
  return (
    <>
      <div className="kpis">
        <Kpi label="Indicatori con un valore" value={`${withV.length} / ${R.kpis.length}`} foot={`periodo ${dateIt(P.from, 'dm')} – ${dateIt(P.to, 'dm')}`} />
        <Kpi label="Calcolati dai dati operativi" value={R.kpis.filter(k => k.source === 'auto').length} foot="si aggiornano da soli" onClick={() => setSrc('auto')} />
        <Kpi label="Dal questionario ESG" value={R.kpis.filter(k => k.source === 'questionario').length} foot="si modificano nel questionario" onClick={() => setSrc('questionario')} />
        <Kpi label="Inseriti a mano" value={R.kpis.filter(k => k.source === 'manuale').length} foot="con data e vista nel registro" onClick={() => setSrc('manuale')} />
        <Kpi label="Senza valore" value={R.kpis.filter(k => k.value == null).length} foot="da acquisire o da costruire" onClick={() => setSrc('vuoto')} />
      </div>
      <Panel title="Registro degli indicatori" sub={`Classe A calcolabile · B da acquisire o consolidare · C nuova rilevazione${FULL ? ' (Appendice A della tesi)' : ''} · i valori «dai dati» non si modificano a mano`} flush id="esg-kpi"
        actions={<>
          <Seg options={[{ id: '', label: 'Tutti' }, ...Object.entries(PILLARS).map(([k, l]) => ({ id: k, label: l }))]} value={pil} onChange={setPil} label="Pilastro" />
          <Seg options={[{ id: '', label: 'Ogni fonte' }, { id: 'auto', label: 'Dai dati' }, { id: 'questionario', label: 'Questionario' }, { id: 'manuale', label: 'Inseriti' }, { id: 'vuoto', label: 'Vuoti' }]} value={src} onChange={setSrc} label="Fonte" />
          <SearchBox value={q} onChange={setQ} placeholder="Cerca indicatore" id="kpi-search" />
          {FULL && <label className="check small"><input type="checkbox" checked={thesis} onChange={e => setThesis(e.target.checked)} /> Valori della tesi</label>}
        </>}>
        <Table rows={rows} rowKey={k => k.code} pageSize={60} exportName="indicatori-esg" cols={[
          { key: 'code', label: 'Codice', render: k => <span className="code">{k.code}</span> },
          { key: 'name', label: 'Indicatore', render: k => <><b>{k.name}</b><span className="sub">{k.formula}</span></> },
          { key: 'value', label: 'Valore', align: 'r', sort: k => (typeof k.value === 'number' ? k.value : null), csv: k => (typeof k.value === 'number' ? k.value : k.value ?? null), render: k => k.source === 'auto' || k.source === 'tesi' || k.source === 'questionario' ? <><b>{typeof k.value === 'number' ? nf(k.value, Math.abs(k.value) < 100 ? (Math.abs(k.value) < 10 ? 2 : 1) : 0) : k.value}</b><span className="sub">{k.unitShown}</span>{k.source === 'questionario' && KPI_Q[k.code] && <button className="linkish xs" onClick={() => openQuestion(KPI_Q[k.code])}>modifica nel questionario</button>}</>
            : <ManualCell k={k} onSave={v => setVal(k, v)} /> },
          { key: 'unitShown', label: 'Unità', csvOnly: true, csv: k => k.unitShown || k.unit || '' },
          { key: 'source', label: 'Fonte', csv: k => (k.source ? SRC[k.source].label : ''), render: k => k.source ? <Chip kind={SRC[k.source].kind} icon={SRC_ICON[k.source]} title={k.note || k.source}>{SRC[k.source].label}</Chip> : KPI_Q[k.code] ? <button className="linkish small" onClick={() => openQuestion(KPI_Q[k.code])}>rispondi nel questionario</button> : <span className="muted small">da acquisire</span> },
          { key: 'cls', label: 'Classe', csv: k => k.cls, render: k => <Cls c={k.cls} /> },
          { key: 'freq', label: 'Frequenza', render: k => <span className="small">{k.freq}</span> },
          { key: 'vsme', label: 'VSME', csv: k => k.vsme || '', render: k => k.vsme ? <span className="code">{k.vsme}</span> : '—' },
        ]} />
      </Panel>
    </>
  );
}
const show = v => (v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v));
function ManualCell({ k, onSave }) {
  const [v, setV] = useState(show(k.value));
  React.useEffect(() => setV(show(k.value)), [k.value]);
  return <div className="row gap-s" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
    <input className="input slim" style={{ width: 140, textAlign: 'right' }} value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== show(k.value)) { const t = String(v).trim(); const n = /^[-+]?[\d.]*,?\d+$/.test(t) ? num(t) : null; onSave(t === '' ? '' : n != null ? n : t); } }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={`Valore di ${k.name}`} placeholder={k.unit} />
  </div>;
}

/* ---------------- energia e CO₂ ---------------- */
function Energia({ d }) {
  const today = appToday(d); const P = period12(d);
  const en = d.settings?.energy || {};
  const f = { ...DEFAULTS, feGrid: +en.feGrid || DEFAULTS.feGrid, feGpl: +en.feGpl || DEFAULTS.feGpl };
  // mesi chiusi del periodo, come per l'acqua (F5): letture e produzione degli stessi mesi
  const regM = new Set(registerMonths(P));
  const months = d.energy.filter(e => regM.has(e.month)).sort((a, b) => (a.month < b.month ? -1 : 1));
  const inM = r => regM.has(String(r.date).slice(0, 7));
  const tonnes = sum(d.runs.filter(inM), r => r.tonnes);
  const B = balance({ ...aggregate(months), tonnes }, f);
  if (!months.length || !tonnes) return <Panel title="Energia e CO₂"><Empty title="Servono le letture mensili di energia e le registrazioni di produzione">Le letture dei contatori (rete, fotovoltaico, GPL) si importano o si inseriscono; la produzione arriva dalle registrazioni. Il fattore di rete si imposta in Dati › Impostazioni.</Empty></Panel>;
  const lineKwh = {}, lineGpl = {};
  for (const r of d.runs) if (inM(r)) { lineKwh[r.lineId] = (lineKwh[r.lineId] || 0) + (r.kwh || 0); lineGpl[r.lineId] = (lineGpl[r.lineId] || 0) + (r.gplKg || 0); }
  const services = Math.max(0, B.kwhElec - sum(Object.values(lineKwh)));
  const M = x => x / 1000;
  const nodes = [
    { id: 'rete', label: 'Rete elettrica', col: 0, color: 'var(--s1)' }, { id: 'fv', label: 'Fotovoltaico', col: 0, color: 'var(--s4)' }, { id: 'gpl', label: 'GPL', col: 0, color: 'var(--s2)' },
    { id: 'el', label: 'Elettricità', col: 1, color: 'var(--s1)' }, { id: 'heat', label: 'Calore (vapore)', col: 1, color: 'var(--s2)' }, { id: 'exp', label: 'Ceduta alla rete', col: 1, color: 'var(--ink-2)' },
    ...d.lines.map((l, i) => ({ id: l.id, label: l.name, col: 2, color: SERIES[i] })), { id: 'serv', label: 'Servizi generali', col: 2, color: 'var(--ink-2)' },
  ];
  const links = [
    { from: 'rete', to: 'el', value: M(B.kwhGrid) }, { from: 'fv', to: 'el', value: M(B.kwhSelf) }, { from: 'fv', to: 'exp', value: M(B.kwhExport) }, { from: 'gpl', to: 'heat', value: M(B.kwhHeat) },
    ...d.lines.map(l => ({ from: 'el', to: l.id, value: M(lineKwh[l.id] || 0) })), { from: 'el', to: 'serv', value: M(services) },
    ...d.lines.filter(l => lineGpl[l.id]).map(l => ({ from: 'heat', to: l.id, value: M((lineGpl[l.id] || 0) * f.lhvKwhKg) })),
  ].filter(x => x.value > 0.5);
  const s0 = B.coverage || 0;
  const model = { E: B.kwhElec, Q: tonnes, m: B.gplKg, FE: f.feGrid, f: f.feGpl };
  const ss = Array.from({ length: 13 }, (_, i) => i * 0.05);
  const slope = (intensityAt(0, model) - intensityAt(0.01, model));
  const target = s0 < 0.4 ? 0.4 : Math.min(0.8, Math.ceil((s0 + 0.15) * 20) / 20);
  const setFactor = id => { const g = GRID_FACTORS.find(x => x.id === id); if (!g) return; store.settings(st => ({ ...st, energy: { ...st.energy, feGrid: g.value, gridFactor: g.id } }), `Fattore di rete: ${g.label}`); toast(`Fattore di rete: ${g.label} (${nf(g.value * 1000, 1)} g CO₂/kWh)`); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Elettricità consumata" value={nf(B.kwhElec / 1000)} unit="MWh" foot={`${nf(B.elecPerT, 1)} kWh/t`} />
        <Kpi label="Copertura fotovoltaica" value={nf(s0 * 100, 1)} unit="%" foot={`${nf(B.kwhSelf / 1000)} MWh autoconsumati`} />
        <Kpi label="Scope 1 (GPL)" value={nf(B.scope1, 1)} unit="t CO₂e" foot={`${nf(B.gplKg / 1000, 1)} t di GPL`} />
        <Kpi label="Scope 2 location-based" value={nf(B.scope2, 1)} unit="t CO₂" foot={`${nf(f.feGrid * 1000, 1)} g CO₂/kWh`} />
        <Kpi label="Intensità dei vettori energetici" value={nf(B.co2PerT, 2)} unit="kg CO₂/t" foot={`${nf(tonnes)} t prodotte`} />
      </div>
      <div className="split">
        <Panel title="Da dove arriva e dove va l’energia" sub="MWh negli ultimi 12 mesi chiusi: elettricità dalle letture dei contatori, calore dal potere calorifico del GPL" id="esg-sankey">
          <Sankey nodes={nodes} links={links} height={300} unit="MWh" ariaLabel="Flussi di energia dello stabilimento" />
        </Panel>
        <Panel title="Fattore di emissione della rete" sub="Metodo location-based (GHG Protocol Scope 2)">
          <div className="stack" style={{ gap: 10 }}>
            <Field label="Fattore usato nei calcoli"><Select value={en.gridFactor || ''} onChange={setFactor} options={[...(!GRID_FACTORS.some(g => g.id === en.gridFactor) ? [{ id: '', label: `Personalizzato · ${nf((+en.feGrid || 0) * 1000, 1)} g/kWh` }] : []), ...GRID_FACTORS.map(g => ({ id: g.id, label: `${g.label} · ${nf(g.value * 1000, 1)} g/kWh` }))]} id="esg-factor" /></Field>
            <p className="small muted">{GRID_FACTORS.find(g => g.id === en.gridFactor)?.src || 'Valore inserito nelle impostazioni.'} Il GPL usa {nf(f.feGpl, 4)} kg CO₂/kg; lo Scope 1 aggiunge CH₄ e N₂O di combustione ({nf(scope1PerKg(f), 4)} kg CO₂e/kg).</p>
            <Kv items={[['CO₂ da elettricità di rete', `${nf(B.co2Grid, 1)} t`], ['CO₂ da GPL', `${nf(B.co2Gpl, 1)} t (${nf((B.gplShare || 0) * 100)}% del totale)`], ['Energia per tonnellata', `${nf(B.energyPerT, 1)} kWh/t (elettrica + termica)`]]} />
          </div>
        </Panel>
      </div>
      <div className="split">
        <Panel title="Mese per mese" sub="Elettricità dalla rete e fotovoltaico autoconsumato (MWh)">
          <Columns cols={months.map(m => ({ label: monthLabel(m.month), parts: [{ key: 'g', value: M(m.kwhGrid) }, { key: 's', value: M(Math.max(0, m.kwhPV - m.kwhExport)) }] }))} keys={[{ key: 'g', label: 'Rete', color: 'var(--s1)' }, { key: 's', label: 'Fotovoltaico autoconsumato', color: 'var(--s4)' }]} unit="MWh" height={230} ariaLabel="Elettricità mensile" />
          <Legend items={[{ label: 'Rete', color: 'var(--s1)' }, { label: 'Fotovoltaico autoconsumato', color: 'var(--s4)' }]} />
        </Panel>
        <Panel title={FULL ? 'Il modello della tesi' : 'Modello dell’intensità per tonnellata'} sub="I(s) = [E·(1−s)·FE + m·f] / Q: intensità in funzione della copertura fotovoltaica s" id="esg-model">
          <LineChart labels={ss.map(s => nf(s * 100) + '%')} height={200} unit="kg/t" decimals={2} markLast={false}
            series={[{ key: 'i', label: 'Intensità', color: 'var(--s3)', values: ss.map(s => intensityAt(s, model)) }]}
            refs={[{ y: intensityAt(s0, model), label: `oggi ${nf(s0 * 100)}%`, kind: 'muted' }]} ariaLabel="Intensità in funzione della copertura fotovoltaica" />
          <p className="small" style={{ marginTop: 8 }}>Ogni punto di copertura fotovoltaica in più vale <b>{nf(slope, 3)} kg CO₂/t</b>; portare la copertura dal {nf(s0 * 100)}% al {nf(target * 100)}% porterebbe l’intensità da {nf(intensityAt(s0, model), 2)} a {nf(intensityAt(target, model), 2)} kg CO₂/t ({sf((intensityAt(target, model) - intensityAt(s0, model)) * tonnes / 1000, 1)} t CO₂ l’anno).</p>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- dalla tesi all'azienda ---------------- */

function TesiFull({ d, T }) {
  const model = { E: T.electricity, Q: T.production, m: T.gpl, FE: T.feGrid, f: T.feGpl };
  const ss = Array.from({ length: 11 }, (_, i) => i * 0.05);
  const R = kpis(d, period12(d));
  const auto = R.kpis.filter(k => k.source === 'auto');
  return (
    <>
      <div className="note maize"><b>{T.label}.</b> {T.note} Versione completa: non pubblicare senza il consenso scritto dell’impresa.</div>
      <div className="kpis">
        <Kpi label="Produzione" value={nf(T.production)} unit="t" foot={`${T.company} · ${T.year}`} />
        <Kpi label="Elettricità" value={nf(T.electricity / 1000)} unit="MWh" foot={`${nf(T.electricity / T.production, 2)} kWh/t`} />
        <Kpi label="GPL" value={nf(T.gpl)} unit="kg" foot={`${nf(T.gpl * T.feGpl / 1000, 2)} t CO₂`} />
        <Kpi label="Intensità (Monte Carlo)" value={nf(T.mc.median, 2)} unit="kg CO₂/t" foot={`intervallo 95%: ${nf(T.mc.p025, 2)}–${nf(T.mc.p975, 2)}`} />
      </div>
      <div className="split">
        <Panel title="Intensità in funzione della copertura fotovoltaica" sub={`I(s) = [E·(1−s)·FE + m·f] / Q · FE ${nf(T.feGrid * 1000, 1)} g/kWh, f ${nf(T.feGpl, 4)} kg/kg`}>
          <LineChart labels={ss.map(s => nf(s * 100) + '%')} height={230} unit="kg/t" decimals={2} markLast={false}
            series={[{ key: 'i', label: 'Intensità', color: 'var(--s3)', values: ss.map(s => intensityAt(s, model)) }]}
            refs={[{ y: intensityAt(T.fvMin, model), label: `FV ${nf(T.fvMin * 100)}%`, kind: 'muted' }, { y: intensityAt(T.fvMax, model), label: `FV ${nf(T.fvMax * 100, 1)}%`, kind: 'muted' }]} ariaLabel="Intensità della tesi" />
          <p className="small muted" style={{ marginTop: 8 }}>Copertura fotovoltaica stimata tra {nf(T.fvMin * 100)}% e {nf(T.fvMax * 100, 1)}% (impianto ≈{T.pvKwp} kWp, producibilità PVGIS {nf(T.pvgisKwh)} kWh): per questo la tesi raccomanda un contatore dell’autoconsumo.</p>
        </Panel>
        <Panel title="Scenari del fattore di rete" sub="Tabella 4.7 e aggiornamenti successivi">
          <Table rows={T.factors} rowKey={x => x.id} cols={[
            { key: 'label', label: 'Fattore', render: x => <><b>{x.label}</b><span className="sub">{x.src}</span></> },
            { key: 'i', label: 'Intensità a FV 25–39,7%', align: 'r', nosort: true, render: x => `${nf(intensityAt(T.fvMax, { ...model, FE: x.value }), 2)}–${nf(intensityAt(T.fvMin, { ...model, FE: x.value }), 2)}` },
          ]} />
        </Panel>
      </div>
      <div className="split">
        <Panel title="Profilo dell’impresa" sub="Dati comunicati per la tesi">
          <Kv items={T.profile.map(p => [p.k, `${p.v} ${p.u}`])} />
        </Panel>
        <Panel title="Dal questionario al sistema" sub={`${auto.length} indicatori su 49 diventano automatici con FeedOS`}>
          <Kv items={[['Costo totale (Tab. 4.9)', `${nf(T.costTotal, 2)} €/t`], ...T.costs.slice(0, 4).map(([k, v]) => [k, `${nf(v, 2)} €/t`]), ['Ricavi', `${nf(T.revenue)} €`]]} />
        </Panel>
      </div>
      <Panel title="Indicatori: valore della tesi e fonte in FeedOS" flush>
        <Table rows={ESG_REGISTRY} rowKey={k => k.code} pageSize={60} cols={[
          { key: 'code', label: 'Codice', render: k => <span className="code">{k.code}</span> },
          { key: 'name', label: 'Indicatore', render: k => <b>{k.name}</b> },
          { key: 'tesi', label: 'Nella tesi', nosort: true, render: k => <span className="small">{T.kpiValues[k.code] || '—'}</span> },
          { key: 'cls', label: 'Classe', render: k => <Cls c={k.cls} /> },
          { key: 'fonte', label: 'In FeedOS', nosort: true, render: k => { const x = R.kpis.find(y => y.code === k.code); return x?.source === 'auto' ? <Chip kind="good">automatico</Chip> : <Chip>da inserire</Chip>; } },
        ]} />
      </Panel>
    </>
  );
}
