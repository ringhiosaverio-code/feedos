/* FeedOS 16 · ESG e tesi: i 49 indicatori del registro alimentati dai dati di ogni giorno (con la provenienza di ogni
 * valore), energia e CO₂ con il modello della tesi, passaporto di prodotto, copertura VSME e bozza di report,
 * collegamento tra la tesi e l'uso in azienda. */
import React, { useMemo, useState } from 'react';
import { LuCopy, LuDownload, LuPrinter, LuLeaf, LuDatabase, LuPencil, LuFileText, LuInfo } from 'react-icons/lu';
import { useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, appToday, kpis, period12, volumes, shippedByLot } from '../core/derived.js';
import { nf, sf, sum, dateIt, addDays, monthLabel, mean, norm } from '../core/util.js';
import { download, stamp, num } from '../core/io.js';
import { computeKpis, vsmeCoverage } from '../engine/esg.js';
import { ESG_REGISTRY, PILLARS, CLASSES, VSME_BASIC } from '../data/esgRegistry.js';
import { THESIS } from '../data/thesis.js';
import { balance, aggregate, intensityAt, scope1PerKg, DEFAULTS, GRID_FACTORS } from '../engine/energy.js';
import { formulaCO2, coProductShare, afb1Check } from '../engine/formulation.js';
import { PageHead, Panel, Btn, Table, Chip, Kpi, Field, Select, Empty, SearchBox, filterRows, Seg, Kv, Cls, confirm } from '../ui/ui.jsx';
import { Columns, LineChart, Sankey, Bars, StackBar, Legend, SERIES } from '../ui/charts.jsx';
import { lotCheck } from './qualita.jsx';
import { NAV } from '../app/nav.js';

// Solo la versione completa contiene i dati della tesi: nella pubblica TH è null e il modulo dei dati non entra nel file.
const TH = __FULL__ ? THESIS : null;
const FULL = !!TH;
const SRC = { auto: { kind: 'good', label: 'dai dati' }, manuale: { kind: 'accent', label: 'inserito' }, tesi: { kind: 'maize', label: 'tesi' } };

export function Esg({ route }) {
  const d = useData();
  const tab = route.tab || 'indicatori';
  return (
    <>
      <PageHead title="ESG e tesi" lead="Il registro dei 49 indicatori (ambiente, sociale, economia, governance) alimentato dai dati di ogni giorno: ogni valore dichiara da dove viene. Energia e CO₂ con il modello della tesi, passaporto di prodotto, copertura del VSME e bozza di report."
        tabs={NAV.esg.tabs} tab={tab} onTab={t => go('esg', t)} />
      {tab === 'indicatori' && <Indicatori d={d} />}
      {tab === 'energia' && <Energia d={d} />}
      {tab === 'passaporto' && <Passaporto d={d} sel={route.id} />}
      {tab === 'vsme' && <Vsme d={d} />}
      {tab === 'tesi' && (TH ? <TesiFull d={d} T={TH} /> : <TesiMetodo d={d} />)}
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
        <Kpi label="Inseriti a mano" value={R.kpis.filter(k => k.source === 'manuale').length} foot="con data e vista nel registro" onClick={() => setSrc('manuale')} />
        <Kpi label="Senza valore" value={R.kpis.filter(k => k.value == null).length} foot="da acquisire o da costruire" onClick={() => setSrc('vuoto')} />
      </div>
      <Panel title="Registro degli indicatori" sub="Classe A calcolabile · B da acquisire o consolidare · C nuova rilevazione (Appendice A della tesi) · i valori «dai dati» non si modificano a mano" flush id="esg-kpi"
        actions={<>
          <Seg options={[{ id: '', label: 'Tutti' }, ...Object.entries(PILLARS).map(([k, l]) => ({ id: k, label: l }))]} value={pil} onChange={setPil} label="Pilastro" />
          <Seg options={[{ id: '', label: 'Ogni fonte' }, { id: 'auto', label: 'Dai dati' }, { id: 'manuale', label: 'Inseriti' }, { id: 'vuoto', label: 'Vuoti' }]} value={src} onChange={setSrc} label="Fonte" />
          <SearchBox value={q} onChange={setQ} placeholder="Cerca indicatore" id="kpi-search" />
          {FULL && <label className="check small"><input type="checkbox" checked={thesis} onChange={e => setThesis(e.target.checked)} /> Valori della tesi</label>}
        </>}>
        <Table rows={rows} rowKey={k => k.code} pageSize={60} cols={[
          { key: 'code', label: 'Codice', render: k => <span className="code">{k.code}</span> },
          { key: 'name', label: 'Indicatore', render: k => <><b>{k.name}</b><span className="sub">{k.formula}</span></> },
          { key: 'value', label: 'Valore', align: 'r', sort: k => (typeof k.value === 'number' ? k.value : null), render: k => k.source === 'auto' || k.source === 'tesi' ? <><b>{typeof k.value === 'number' ? nf(k.value, Math.abs(k.value) < 100 ? (Math.abs(k.value) < 10 ? 2 : 1) : 0) : k.value}</b><span className="sub">{k.unitShown}</span></>
            : <ManualCell k={k} onSave={v => setVal(k, v)} /> },
          { key: 'source', label: 'Fonte', render: k => k.source ? <Chip kind={SRC[k.source].kind} icon={k.source === 'auto' ? LuDatabase : k.source === 'manuale' ? LuPencil : LuFileText} title={k.note || k.source}>{SRC[k.source].label}</Chip> : <span className="muted small">da acquisire</span> },
          { key: 'cls', label: 'Classe', render: k => <Cls c={k.cls} /> },
          { key: 'freq', label: 'Frequenza', render: k => <span className="small">{k.freq}</span> },
          { key: 'vsme', label: 'VSME', render: k => k.vsme ? <span className="code">{k.vsme}</span> : '—' },
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
  const months = d.energy.filter(e => e.month + '-15' >= P.from && e.month + '-15' <= P.to).sort((a, b) => (a.month < b.month ? -1 : 1));
  const tonnes = sum(d.runs.filter(r => r.date >= P.from && r.date <= P.to), r => r.tonnes);
  const B = balance({ ...aggregate(months), tonnes }, f);
  if (!months.length || !tonnes) return <Panel title="Energia e CO₂"><Empty title="Servono le letture mensili di energia e le registrazioni di produzione">Le letture dei contatori (rete, fotovoltaico, GPL) si importano o si inseriscono; la produzione arriva dalle registrazioni. Il fattore di rete si imposta in Dati › Impostazioni.</Empty></Panel>;
  const lineKwh = {}, lineGpl = {};
  for (const r of d.runs) if (r.date >= P.from && r.date <= P.to) { lineKwh[r.lineId] = (lineKwh[r.lineId] || 0) + (r.kwh || 0); lineGpl[r.lineId] = (lineGpl[r.lineId] || 0) + (r.gplKg || 0); }
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
        <Panel title="Da dove arriva e dove va l’energia" sub="MWh negli ultimi 12 mesi: elettricità dalle letture dei contatori, calore dal potere calorifico del GPL" id="esg-sankey">
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
        <Panel title="Il modello della tesi" sub="I(s) = [E·(1−s)·FE + m·f] / Q: intensità in funzione della copertura fotovoltaica s" id="esg-model">
          <LineChart labels={ss.map(s => nf(s * 100) + '%')} height={200} unit="kg/t" decimals={2} markLast={false}
            series={[{ key: 'i', label: 'Intensità', color: 'var(--s3)', values: ss.map(s => intensityAt(s, model)) }]}
            refs={[{ y: intensityAt(s0, model), label: `oggi ${nf(s0 * 100)}%`, kind: 'muted' }]} ariaLabel="Intensità in funzione della copertura fotovoltaica" />
          <p className="small" style={{ marginTop: 8 }}>Ogni punto di copertura fotovoltaica in più vale <b>{nf(slope, 3)} kg CO₂/t</b>; portare la copertura dal {nf(s0 * 100)}% al {nf(target * 100)}% porterebbe l’intensità da {nf(intensityAt(s0, model), 2)} a {nf(intensityAt(target, model), 2)} kg CO₂/t ({sf((intensityAt(target, model) - intensityAt(s0, model)) * tonnes / 1000, 1)} t CO₂ l’anno).</p>
        </Panel>
      </div>
    </>
  );
}

/* ---------------- passaporto di prodotto ---------------- */
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
        <Table rows={all} rowKey={x => x.p.id} selected={P.p.id} onRow={x => go('esg', 'passaporto', x.p.id)} initialSort={{ key: 'total', dir: 'desc' }} cols={[
          { key: 'name', label: 'Prodotto', sort: x => x.p.name, render: x => <b>{x.p.name}</b> },
          { key: 'total', label: 'Totale', align: 'r', render: x => <b>{nf(x.total)}</b> },
          { key: 'raw', label: 'Materie prime', align: 'r', render: x => nf(x.raw) },
          { key: 'plant', label: 'Stabilimento', align: 'r', sort: x => x.plantE + x.plantH, render: x => nf(x.plantE + x.plantH, 1) },
          { key: 'co', label: 'Co-prodotti', align: 'r', render: x => nf(x.co * 100) + '%' },
          { key: 'it', label: 'Origine Italia', align: 'r', sort: x => x.origin.Italia || 0, render: x => nf((x.origin.Italia || 0) * 100) + '%' },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- VSME e report ---------------- */
function Vsme({ d }) {
  const P = period12(d); const R = kpis(d, P);
  const cov = vsmeCoverage(R.kpis, VSME_BASIC);
  const K = Object.fromEntries(R.kpis.map(k => [k.code, k]));
  const c = d.settings?.company || {};
  const v = (code, dec = 0) => { const k = K[code]; return k?.value == null ? '[da completare]' : typeof k.value === 'number' ? `${nf(k.value, dec)} ${k.unitShown}` : `${k.value}`; };
  const text = `# Rapporto di sostenibilità · VSME modulo Basic (bozza)
${c.name || ''} · ${c.site || ''} · periodo ${dateIt(P.from)} – ${dateIt(P.to)}

## B1 · Criteri di redazione
Rapporto redatto secondo lo standard volontario VSME (EFRAG), modulo Basic, su base individuale. Perimetro: ${c.site || 'stabilimento'}. I valori operativi sono calcolati dai dati di FeedOS; gli altri sono stati inseriti dall’impresa.

## B3 · Energia ed emissioni di gas serra
- Elettricità prelevata dalla rete: ${v('E1')}; fotovoltaico autoconsumato: ${v('E2')} (copertura ${v('E3', 1)}).
- Intensità elettrica: ${v('E4', 1)}. GPL: ${v('E5')}.
- Scope 1 (combustione GPL): ${nf(R.scope1, 1)} t CO₂e. Scope 2 location-based: ${nf(R.scope2, 1)} t CO₂ (fattore ${nf((R.factors.feGrid) * 1000, 1)} g CO₂/kWh).
- Intensità sui ricavi: ${R.revenue ? nf((R.scope1 + R.scope2) / (R.revenue / 1e6), 2) : '[da completare]'} t CO₂e per milione di euro.

## B6 · Acqua
- Prelievo idrico: ${v('E9')}.

## B7 · Uso delle risorse, economia circolare e rifiuti
- Co-prodotti dell’agroindustria nelle formule: ${v('E12', 1)} del prodotto. Soia certificata senza deforestazione: ${v('E15', 1)}.
- Rifiuti prodotti: ${v('E10')}; avviati a recupero: ${v('E11')}.

## B8 · Forza lavoro
- Addetti: ${v('S1')}. Tasso di turnover: ${v('S2', 1)}.

## B9 · Salute e sicurezza
- Infortuni registrabili: ${v('S3', 2)}. Ore di formazione per addetto: ${v('S4')}.

## B10 · Retribuzione, contrattazione e formazione
- Copertura della contrattazione collettiva: ${v('G2')}.

## B11 · Condotta d’impresa
- Condanne o sanzioni per corruzione: ${v('G4')}. Certificazioni: ${v('G5')}.

Bozza generata automaticamente: verificare ogni valore e completare le parti narrative (B2, B4, B5) prima della pubblicazione.`;
  return (
    <div className="split">
      <Panel title="Copertura del modulo Basic del VSME" sub="Un requisito è coperto se almeno un indicatore collegato è di classe A o B (regola della tesi, §2.8)" flush id="esg-vsme">
        <Table rows={cov} rowKey={r => r.id} pageSize={20} cols={[
          { key: 'id', label: 'Req.', render: r => <span className="code">{r.id}</span> },
          { key: 'name', label: 'Requisito', render: r => <><b>{r.name}</b><span className="sub">{r.text}</span></> },
          { key: 'linked', label: 'Indicatori', align: 'r', sort: r => r.linked.length, render: r => r.linked.length ? `${r.withData} di ${r.linked.length} con valore` : '—' },
          { key: 'covered', label: 'Copertura', render: r => r.covered == null ? <Chip>narrativo</Chip> : <Chip kind={r.covered === 'coperto' ? 'good' : r.covered === 'parziale' ? 'warn' : 'crit'}>{r.covered}</Chip> },
        ]} />
      </Panel>
      <Panel title="Bozza di report" sub="Testo con i valori di oggi: copialo nel documento dell’impresa e completa le parti narrative"
        actions={<><Btn small icon={LuCopy} onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Bozza copiata'); } catch { toast('Copia non riuscita', 'err'); } }}>Copia</Btn><Btn small icon={LuDownload} onClick={() => download(`vsme-bozza-${stamp()}.md`, text, 'text/markdown;charset=utf-8')}>Scarica</Btn></>}>
        <pre className="report">{text}</pre>
      </Panel>
    </div>
  );
}

/* ---------------- dalla tesi all'azienda ---------------- */
function TesiMetodo({ d }) {
  const R = kpis(d, period12(d));
  const byCls = c => ESG_REGISTRY.filter(k => k.cls === c).length;
  const auto = R.kpis.filter(k => k.source === 'auto');
  return (
    <>
      <div className="note maize">Questa versione dimostrativa non contiene i dati dell’impresa studiata nella tesi: mostra il metodo applicato al mangimificio di fantasia.</div>
      <div className="grid g3 start">
        {['A', 'B', 'C'].map(c => <Panel key={c} title={<span className="row gap-s"><Cls c={c} />{CLASSES[c].label}</span>} sub={CLASSES[c].text}><div className="hero-fig">{byCls(c)}</div><p className="small muted">indicatori del registro · {R.kpis.filter(k => k.cls === c && k.source === 'auto').length} calcolati da FeedOS</p></Panel>)}
      </div>
      <Panel title="Dal registro ai dati di ogni giorno" sub="Come la tesi diventa uno strumento di lavoro">
        <ul className="steplist">
          <li><span><b>Un registro unico di 49 indicatori</b> in quattro pilastri, ognuno con formula, unità, fonte, frequenza e classe informativa: niente numeri senza definizione.</span></li>
          <li><span><b>{auto.length} indicatori si calcolano da soli</b> dalle registrazioni di produzione, dalle letture di energia, dai lotti, dai reclami e dalle consegne: {auto.map(k => k.code).join(', ')}.</span></li>
          <li><span><b>Gli altri si inseriscono una volta</b> e restano nel registro delle modifiche, con data e vista: la provenienza di ogni valore è sempre visibile.</span></li>
          <li><span><b>Energia e CO₂ usano il modello della tesi</b> (Scope 1 dal GPL con CH₄ e N₂O, Scope 2 location-based, intensità per tonnellata in funzione della copertura fotovoltaica).</span></li>
          <li><span><b>Il VSME Basic si compone dai dati</b>: copertura dei requisiti e bozza di report con i valori aggiornati.</span></li>
        </ul>
      </Panel>
    </>
  );
}

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
