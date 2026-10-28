/* FeedOS 18 · ESG › Clima e GHG (pacchetto WP1 «clima»): inventario GHG per esercizio con sottosezioni
 * riepilogo · combustibili · flotta · fgas · elettricita · scope3 · fattori · ponte · metodo (#esg.clima.<id>).
 * Contratto: ClimaPage({ d, route }) disegna la scheda «clima» (titolo e schede li disegna esg.jsx); ClimaCard({ d }) è il
 * riquadro del cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Prefisso CSS e DOM ecl-. */
import React, { useMemo, useState } from 'react';
import { LuCloud, LuPrinter, LuDownload, LuFileText, LuSnowflake, LuPlus, LuX, LuTrash2, LuLock } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, monthLabel } from '../core/util.js';
import { currentPeriod, reportingPeriods, periodByKey } from '../engine/esg-years.js';
import { inventory, comparableInv, categoryRows, inventoryRows, inventoryJson, methodMarkdown, bridgeFor, bridgeText, baseYearStatus, baseSnapshotOf, usedFactors, ets2Exposure,
  climaSignals, climaSummary, climaSettings, CLIMA_METHOD, FUEL_LABEL } from '../engine/esg-clima.js';
import { Panel, Kpi, Table, Btn, Chip, Field, NumInput, Select, Seg, Empty, Kv, Bullet, confirm } from '../ui/ui.jsx';
import { StackBar, Columns, Legend, Waterfall, Bars } from '../ui/charts.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, QualityChip, StatusChip, Lineage, MethodNote, Disclaimer, EsgCard, setEsgSettings } from './esg-shared.jsx';
import { Combustibili, Flotta, Fgas, Fattori } from './esg-clima-registri.jsx';
import { tco2, pctTxt, numTxt, authorNow, downloadCsv, downloadText, ScopeChip, CatStatus } from './esg-clima-ui.jsx';

const EMPTY = [];
const SECTIONS = [['riepilogo', 'Riepilogo'], ['combustibili', 'Combustibili'], ['flotta', 'Flotta e consegne'], ['fgas', 'F-gas'], ['elettricita', 'Elettricità'], ['scope3', 'Scope 3'],
  ['fattori', 'Fattori'], ['ponte', 'Cosa è cambiato'], ['metodo', 'Metodo e stampa']];
const QCOL = { misurato: 'var(--good)', calcolato: 'var(--s1)', stimato: 'var(--warn)', default: 'var(--line-2)', mancante: 'var(--crit)' };
const QLAB = { misurato: 'Misurato', calcolato: 'Calcolato', stimato: 'Stimato', default: 'Valori predefiniti', mancante: 'Mancante' };
const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });

/** Scheda ESG › Clima e GHG. */
export function ClimaPage({ d, route }) {
  const sub = SECTIONS.some(([id]) => id === route?.id) ? route.id : 'riepilogo';
  const { P, prev, setKey } = useEsgPeriod(d);
  const inv = inventory(d, P);
  const today = appToday(d);
  const sig = useMemo(() => climaSignals(d, { today }), [d, today]);
  const badge = id => { const n = sig.filter(s => s.link?.id === id && s.severity !== 'info').length; return n || null; };
  const props = { d, P, prev, inv };
  return (
    <div className="ecl" id="ecl-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge(id) }))} value={sub} tab="clima" label="Sezioni di Clima e GHG" />
      {inv?.error && <div className="note crit">L’inventario non si è potuto calcolare: {inv.error}</div>}
      {sub === 'riepilogo' && <Riepilogo {...props} sig={sig} />}
      {sub === 'combustibili' && <Combustibili {...props} />}
      {sub === 'flotta' && <Flotta {...props} />}
      {sub === 'fgas' && <Fgas {...props} />}
      {sub === 'elettricita' && <Elettricita {...props} />}
      {sub === 'scope3' && <Scope3 {...props} />}
      {sub === 'fattori' && <Fattori {...props} />}
      {sub === 'ponte' && <Ponte {...props} />}
      {sub === 'metodo' && <Metodo {...props} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: totale dell'esercizio, intensità, segnale più importante. */
export function ClimaCard({ d }) {
  const P = currentPeriod(d);
  const s = climaSummary(d, P);
  const today = appToday(d);
  const sig = climaSignals(d, { today });
  if (!s?.hasData) return <EsgCard title="Clima e GHG" tab="clima" icon={LuCloud} value="—" sub="Registra energia, combustibili e acquisti per calcolare l’inventario dell’esercizio." />;
  const top = sig.find(x => x.severity === 'critico') || sig.find(x => x.severity === 'attenzione') || null;
  const status = sig.some(x => x.severity === 'critico') ? 'bad' : sig.some(x => x.severity === 'attenzione') ? 'warn' : 'ok';
  return (
    <EsgCard title="Clima e GHG" tab="clima" icon={LuCloud} value={tco2(s.totals.lb)} unit="t CO₂e" status={status} chip={<Chip kind="outline">{P.short}</Chip>}
      sub={`Scope 1 + 2: ${nf(s.intensity.opsPerT, 1)} kg CO₂e/t · FLAG ${pctTxt(s.flagShare)}${s.s2.mb == null ? ' · market-based non calcolato' : ''}`}>
      {top && <p className="ecl-card-sig">{top.title}</p>}
    </EsgCard>
  );
}

/* ================= riepilogo ================= */
const lineageOf = (row, lines) => {
  const ls = lines.filter(l => !l.excluded);
  const first = ls.find(l => l.factor) || ls[0];
  return { method: row.method, formula: first?.formula, factor: ls.length === 1 ? first?.factor : null, source: [...new Set(ls.map(l => l.source).filter(Boolean))].join(' · ') || null,
    records: ls.reduce((s, l) => s + (l.records || 0), 0) || null, quality: row.quality || null, note: ls.length > 1 ? `${ls.length} righe di calcolo: vedi il dettaglio sotto.` : first?.note || null };
};
function Riepilogo({ d, P, prev, inv, sig }) {
  if (!inv?.hasData) return <Panel title="Inventario dell’esercizio"><Empty icon={LuCloud} title="Nessun dato nel periodo">Servono le letture dell’energia (Energia e CO₂), i consumi di combustibili, i lotti di materie prime ricevuti e le consegne: da lì nascono Scope 1, 2 e 3.</Empty></Panel>;
  const pinv = prev ? inventory(d, prev) : null, ok = comparableInv(pinv);
  const cmp = (pv, kind = 'flow', decimals = 0) => (ok && pv != null ? { value: pv, kind, good: 'down', decimals, unit: kind === 'flow' ? 't' : '', label: prev.label } : undefined);
  const tot = inv.totals.lb, flagShare = tot > 0 ? inv.s3.flag / tot : null;
  const cats = categoryRows(inv);
  const catLines = r => (r.scope === 1 ? inv.scope1.lines.filter(l => l.group === { 's1-stat': 'stationary', 's1-mob': 'mobile', 's1-fug': 'fugitive' }[r.id]) : r.scope === 2 ? (r.id === 's2-lb' ? inv.s2.lines : EMPTY) : inv.s3.lines.filter(l => l.cat === r.id));
  const s12 = [{ key: 'st', label: 'Combustione stazionaria', value: inv.scope1.stationary, color: 'var(--s2)' }, { key: 'mo', label: 'Combustione mobile', value: inv.scope1.mobile, color: 'var(--s4)' },
    { key: 'fu', label: 'Refrigeranti', value: inv.scope1.fugitive, color: 'var(--s5)' }, { key: 'el', label: 'Elettricità (location-based)', value: inv.s2.lb, color: 'var(--s1)' }].filter(x => x.value > 0);
  const q = ['misurato', 'calcolato', 'stimato', 'default', 'mancante'].map(k => ({ key: k, label: QLAB[k], value: inv.quality[k] || 0, color: QCOL[k] })).filter(x => x.value > 0);
  const json = () => downloadText('clima-inventario', 'json', JSON.stringify(inventoryJson(d, P), null, 2), 'application/json');
  return (
    <>
      <div className="kpis" id="ecl-kpis">
        <Kpi label="Scope 1" value={tco2(inv.s1)} raw={inv.s1} unit="t CO₂e" foot="combustibili, flotta, refrigeranti" cmp={cmp(pinv?.s1)} />
        <Kpi label="Scope 2 location-based" value={tco2(inv.s2.lb)} raw={inv.s2.lb} unit="t CO₂e" foot={inv.s2.mb == null ? 'market-based non calcolato' : `market-based ${tco2(inv.s2.mb)} t`} cmp={cmp(pinv?.s2?.lb)} />
        <Kpi label="Scope 3" value={tco2(inv.s3.total)} raw={inv.s3.total} unit="t CO₂e" foot={`materie prime ${pctTxt(tot ? inv.s3.c1 / tot : null)} del totale`} cmp={cmp(pinv?.s3?.total)} />
        <Kpi label="Totale" value={tco2(tot)} raw={tot} unit="t CO₂e" foot={`${nf(inv.intensity.perT, 0)} kg CO₂e per t prodotta`} cmp={cmp(pinv?.totals?.lb)} />
        <Kpi label="Scope 1 + 2 per tonnellata" value={nf(inv.intensity.opsPerT, 1)} raw={inv.intensity.opsPerT} unit="kg CO₂e/t" foot={`${nf(inv.intensity.perMEurNet, 1)} t CO₂e per M€ di ricavi netti`} cmp={cmp(pinv?.intensity?.opsPerT, 'ratio', 1)} />
        <Kpi label="Quota FLAG" value={pctTxt(flagShare)} foot={inv.s3.flagMethod === 'componenti' ? 'dalle componenti dei fattori' : 'stima per categoria'} />
      </div>
      {!ok && pinv && <p className="small muted">Il confronto con l’esercizio precedente ({prev.label}) non è disponibile: i registri non coprono quel periodo. La scheda «Cosa è cambiato» confronta le due metà dell’esercizio.</p>}
      <div className="split">
        <Panel title="Emissioni per scope" sub={`${P.label} · t CO₂e, GWP a 100 anni AR6, controllo operativo`}>
          <StackBar parts={[{ key: 's1', label: 'Scope 1', value: inv.s1, color: 'var(--s2)' }, { key: 's2', label: 'Scope 2', value: inv.s2.lb, color: 'var(--s1)' }, { key: 's3', label: 'Scope 3', value: inv.s3.total, color: 'var(--s3)' }]} ariaLabel="Ripartizione per scope" />
          <div className="ecl-legend">
            {[['Scope 1', inv.s1, 'var(--s2)'], ['Scope 2 location-based', inv.s2.lb, 'var(--s1)'], ['Scope 3', inv.s3.total, 'var(--s3)']].map(([l, v, c]) => <span key={l}><i style={{ background: c }} />{l} <b>{tco2(v)} t</b> · {pctTxt(tot ? v / tot : null, 1)}</span>)}
          </div>
          <h3 className="ecl-h3">Scope 1 e 2 per fonte</h3>
          {s12.length ? <><StackBar parts={s12} ariaLabel="Scope 1 e 2 per fonte" /><Legend items={s12.map(x => ({ label: `${x.label} ${tco2(x.value)} t`, color: x.color }))} /></> : <p className="small muted">Nessuna emissione diretta o da elettricità nel periodo.</p>}
          <h3 className="ecl-h3">Qualità dei dati (quota delle t CO₂e)</h3>
          <StackBar parts={q} ariaLabel="Qualità dei dati" />
          <Legend items={q.map(x => ({ label: `${x.label} ${pctTxt(x.value)}`, color: x.color }))} />
        </Panel>
        <div className="stack">
          <Panel title="FLAG e uso del suolo" sub="Materie prime agricole: cambio d’uso del suolo e gestione del suolo">
            <StackBar parts={[{ key: 'f', label: 'FLAG', value: inv.s3.flag, color: 'var(--s6)' }, { key: 'n', label: 'Non FLAG', value: inv.s3.nonFlag, color: 'var(--s7)' }]} ariaLabel="FLAG e non FLAG della categoria 1" />
            <Kv items={[['Emissioni FLAG', `${tco2(inv.s3.flag)} t CO₂e (${pctTxt(flagShare)} del totale)`], ...(inv.s3.flagMethod !== 'categoria' ? [['di cui cambio d’uso del suolo', `${tco2(inv.s3.luc)} t`]] : []),
              ['Non FLAG della categoria 1', `${tco2(inv.s3.nonFlag)} t CO₂e`], ['Suolo occupato', `${nf(inv.s3.landHa)} ha·anno`],
              ['Metodo', inv.s3.flagMethod === 'componenti' ? 'componenti dei fattori delle materie prime' : <span>stima per categoria <StatusChip status="da verificare" /></span>]]} />
          </Panel>
          <Panel title="Energia ed intensità (VS B3)">
            <Kv items={[['Energia consumata', `${nf(inv.energy.mwh)} MWh`], ['di cui elettricità', `${nf(inv.energy.mwhEl)} MWh, rinnovabile ${pctTxt(inv.energy.renElShare)}`], ['di cui combustibili', `${nf(inv.energy.mwhFuel)} MWh${inv.energy.mwhRenFuel ? `, rinnovabili ${nf(inv.energy.mwhRenFuel)} MWh` : ''}`],
              ['Intensità sui ricavi netti', `${nf(inv.intensity.perMEurNet, 1)} t CO₂e/M€ (Scope 1 + 2)`], ['CO₂ biogenica', `${tco2(inv.biogenicCO2)} t, fuori dagli scope`]]} />
            <div className="ecl-bench"><span className="small">Scope 1 + 2: <b>{nf(inv.intensity.opsPerT, 1)} kg CO₂e/t</b> · riferimento di settore 10–20 kg/t</span><Bullet value={inv.intensity.opsPerT} lo={0} hi={30} min={10} max={20} /></div>
          </Panel>
        </div>
      </div>
      <Panel title="Categorie e metodi" sub="Scope 1, 2 e le 15 categorie dello Scope 3, con la qualità e la provenienza di ogni numero" flush id="ecl-cats"
        actions={<><Btn small kind="ghost" icon={LuDownload} onClick={() => downloadCsv('clima-categorie', cats, [{ label: 'Scope', value: r => r.scope }, { label: 'Voce', key: 'label' }, { label: 't CO₂e', value: r => r.value ?? null }, { label: 'Quota', value: r => r.share }, { label: 'Qualità', value: r => r.quality || '' }, { label: 'Inclusa', value: r => (r.included === false ? 'no' : 'sì') }, { label: 'Metodo o motivazione', key: 'method' }])}>CSV</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={json}>JSON</Btn></>}>
        <Table rows={cats} pageSize={30} cols={[
          { key: 'scope', label: 'Scope', render: r => <ScopeChip s={r.scope} /> },
          { key: 'label', label: 'Voce', render: r => <><b>{r.label}</b>{r.scope === 3 && <span className="sub"><CatStatus s={r.status} /></span>}{r.info && <span className="sub">informativo, non sommato</span>}</> },
          { key: 'value', label: 't CO₂e', align: 'r', render: r => (r.value == null ? <span className="muted">{r.computedValue > 0 ? `(${tco2(r.computedValue)})` : '—'}</span> : <b>{tco2(r.value)}</b>) },
          { key: 'share', label: '%', align: 'r', render: r => pctTxt(r.share, 1) },
          { key: 'quality', label: 'Qualità', render: r => (r.quality ? <QualityChip q={r.quality} /> : '—') },
          { key: 'method', label: 'Metodo o motivazione', render: r => <span className="small ecl-wrap">{r.method}{r.value != null && r.value > 0 && <Lineage item={lineageOf(r, catLines(r))} />}</span> },
        ]} />
      </Panel>
      <Panel title="Righe di calcolo" sub="Attività × fattore = t CO₂e, per fonte; ogni fattore con fonte, anno e stato" flush
        actions={<Btn small kind="ghost" icon={LuDownload} onClick={() => downloadCsv('clima-inventario', inventoryRows(inv), [{ label: 'Scope', key: 'scope' }, { label: 'Categoria', key: 'category' }, { label: 'Voce', key: 'label' }, { label: 'Attività', key: 'activity' }, { label: 'Unità', key: 'unit' }, { label: 'Fattore', key: 'factor' }, { label: 'Unità del fattore', key: 'factorUnit' }, { label: 'Fonte del fattore', key: 'factorSource' }, { label: 'Anno', key: 'factorYear' }, { label: 'Stato', key: 'factorStatus' }, { label: 't CO₂e', key: 'tco2e' }, { label: 'CO₂ biogenica t', key: 'biogenic' }, { label: 'Qualità', key: 'quality' }, { label: 'Inclusa', key: 'included' }, { label: 'Metodo', key: 'method' }])}>CSV</Btn>}>
        <Table rows={inv.lines.filter(l => l.tco2e > 0 || l.activity > 0)} pageSize={20} initialSort={{ key: 'tco2e', dir: 'desc' }} cols={[
          { key: 'label', label: 'Fonte', render: l => <><b>{l.label}</b><span className="sub">Scope {l.scope}{l.excluded ? ' · categoria esclusa' : ''}</span></> },
          { key: 'activity', label: 'Attività', align: 'r', render: l => `${nf(l.activity, l.activity < 100 ? 1 : 0)} ${l.unit}` },
          { key: 'factor', label: 'Fattore', align: 'r', sort: l => l.factor?.value ?? null, render: l => (l.factor ? <span className="small">{numTxt(l.factor.value)} {l.factor.unit}</span> : <span className="small muted">vari</span>) },
          { key: 'tco2e', label: 't CO₂e', align: 'r', render: l => <b>{tco2(l.tco2e)}</b> },
          { key: 'quality', label: 'Qualità', render: l => <QualityChip q={l.quality} /> },
          { key: 'lin', label: '', nosort: true, render: l => <Lineage item={l} label="Dettagli" /> },
        ]} />
      </Panel>
      <MethodNote text={CLIMA_METHOD} />
      <Disclaimer />
    </>
  );
}

/* ================= elettricità ================= */
function Elettricita({ d, P, inv }) {
  const [adding, setAdding] = useState(false);
  const s2 = inv.s2, contracts = [...(d.elecContracts || EMPTY)].sort((a, b) => b.year - a.year);
  const remove = c => { store.remove('elecContracts', c.id, `Clima · contratto elettrico eliminato: ${c.supplier} ${c.year}`); undoToast('Contratto eliminato'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Elettricità dalla rete" value={nf(s2.kwhGrid / 1000)} unit="MWh" foot={`${s2.months.length} mesi di letture`} />
        <Kpi label="Fotovoltaico autoconsumato" value={nf(s2.kwhSelf / 1000)} unit="MWh" foot={`${nf((s2.kwhExport || 0) / 1000)} MWh ceduti alla rete`} />
        <Kpi label="Elettricità rinnovabile" value={pctTxt(inv.energy.renElShare)} foot="autoconsumo + garanzie d’origine + PPA" />
        <Kpi label="Scope 2 location-based" value={tco2(s2.lb)} unit="t CO₂e" foot={s2.efLb ? `${numTxt(s2.efLb.value)} kg CO₂/kWh` : 'fattore di rete mancante'} />
        <Kpi label="Scope 2 market-based" value={s2.mb == null ? 'non calcolato' : tco2(s2.mb)} unit={s2.mb == null ? '' : 't CO₂e'} foot={s2.efRm ? `mix residuo ${numTxt(s2.efRm.value)} kg CO₂/kWh` : 'manca il mix residuo'} status={s2.mb == null ? 'warn' : undefined} />
      </div>
      <div className="split">
        <Panel title="Mese per mese" sub="MWh prelevati dalla rete e fotovoltaico autoconsumato (zero emissioni in entrambi i metodi)">
          {s2.months.length ? <>
            <Columns cols={s2.months.map(m => ({ label: monthLabel(m.month), parts: [{ key: 'g', value: m.grid / 1000 }, { key: 's', value: m.self / 1000 }] }))} keys={[{ key: 'g', label: 'Rete', color: 'var(--s1)' }, { key: 's', label: 'Fotovoltaico autoconsumato', color: 'var(--s4)' }]} unit="MWh" height={210} ariaLabel="Elettricità mensile" />
            <Legend items={[{ label: 'Rete', color: 'var(--s1)' }, { label: 'Fotovoltaico autoconsumato', color: 'var(--s4)' }]} />
          </> : <Empty title="Nessuna lettura dell’energia nel periodo">Le letture mensili si registrano nella scheda Energia e CO₂.</Empty>}
        </Panel>
        <Panel title="Due metodi, due numeri" sub="GHG Protocol, Scope 2 Guidance: si riportano entrambi">
          <Kv items={[
            ['Location-based', s2.efLb ? <span>kWh di rete × {numTxt(s2.efLb.value)} kg CO₂/kWh · {s2.efLb.source} ({s2.efLb.year ?? '—'}) <StatusChip status={s2.efLb.status} /></span> : '—'],
            ['Market-based', s2.mb == null ? <span className="ecl-warn">{s2.reason}</span> : <span>(kWh di rete − garanzie d’origine − PPA) × {numTxt(s2.efRm?.value)} kg CO₂/kWh · {s2.efRm?.source} <StatusChip status={s2.efRm?.status} /></span>],
            ['Strumenti contrattuali', `${nf(s2.instrKwh / 1000)} MWh di garanzie d’origine e PPA nel periodo`],
          ]} />
          <p className="small muted ecl-mt">Il mix residuo si trascrive dal registro dei fattori (voce «Mix residuo Italia») dopo averlo verificato sulla tabella AIB, oppure dal contratto se il fornitore dichiara il proprio mix.</p>
        </Panel>
      </div>
      <Panel title="Contratti di energia elettrica" sub="Per anno: garanzie d’origine, PPA rinnovabili e, se disponibile, il mix residuo dichiarato dal fornitore" flush
        actions={<Btn small icon={adding ? LuX : LuPlus} onClick={() => setAdding(x => !x)}>{adding ? 'Chiudi' : 'Nuovo contratto'}</Btn>}>
        {adding && <div className="ecl-pad"><EntityForm coll="elecContracts" d={d} rec={{ year: Number(P.to.slice(0, 4)), goMWh: 0, ppaMWh: 0 }} saveLabel="Aggiungi il contratto"
          onSave={v => { store.batch([{ kind: 'add', coll: 'elecContracts', obj: v }], `Clima · contratto elettrico ${v.year}: ${v.supplier}`); setAdding(false); undoToast('Contratto aggiunto'); }} onCancel={() => setAdding(false)} /></div>}
        <Table rows={contracts} exportName="clima-contratti-elettrici" cols={[
          { key: 'year', label: 'Anno', render: c => <b>{c.year}</b> },
          { key: 'supplier', label: 'Fornitore', render: c => <><span>{c.supplier}</span>{c.note && <span className="sub">{c.note}</span>}</> },
          { key: 'goMWh', label: 'Garanzie d’origine MWh', align: 'r', render: c => nf(c.goMWh || 0) },
          { key: 'ppaMWh', label: 'PPA MWh', align: 'r', render: c => nf(c.ppaMWh || 0) },
          { key: 'residualOverride', label: 'Mix del fornitore', align: 'r', render: c => (c.residualOverride != null ? numTxt(c.residualOverride) : '—') },
          { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: c => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il contratto" onClick={() => remove(c)} /> },
        ]} empty="Nessun contratto registrato" />
      </Panel>
    </>
  );
}

/* ================= Scope 3 ================= */
const LEG_RE = /(nave|treno|camion|chiatta)\s*[:=]?\s*([\d.,]+)/gi;
function Scope3({ d, P, inv }) {
  const [adding, setAdding] = useState(null); // 'profilo' | 'dato'
  const [pf, setPf] = useState({ target: 'origin:Extra-UE', legs: 'nave 10000, camion 100', included: false, note: '' });
  const S = climaSettings(d), s3 = inv.s3, c1 = s3.c1detail, lg = s3.logistics;
  const setInclude = (c, v) => setEsgSettings('clima', { include: { [c.id]: v } }, `Clima · categoria ${c.n} dello Scope 3 ${v ? 'inclusa' : 'esclusa'}`);
  const setReason = (c, reason) => { if ((reason || '').trim() === (c.reason || '').trim()) return; setEsgSettings('clima', { relevance: { [c.id]: { status: c.included ? undefined : c.status, reason: reason.trim() } } }, `Clima · motivazione della categoria ${c.n}`); };
  const top = c1.ingredients.slice(0, 10);
  const ingName = id => (d.ingredients || EMPTY).find(i => i.id === id)?.name || id;
  const profiles = (d.logisticsProfiles || EMPTY).map(p => ({ ...p, calc: lg.inbound.find(x => x.id === p.id) }));
  const addProfile = () => {
    const legs = [...String(pf.legs).matchAll(LEG_RE)].map(m => ({ mode: m[1].toLowerCase(), km: +String(m[2]).replace(/\./g, '').replace(',', '.') })).filter(l => l.km > 0);
    if (!legs.length) return toast('Indica le tratte, per esempio «nave 10000, camion 100»', 'err');
    const [kind, val] = pf.target.split(':');
    const obj = { ingId: kind === 'ing' ? val : null, supplierId: null, origin: kind === 'origin' ? val : null, legs, includedInEf: !!pf.included, note: pf.note.trim() };
    store.batch([{ kind: 'add', coll: 'logisticsProfiles', obj }], `Clima · profilo logistico: ${kind === 'ing' ? ingName(val) : val}`);
    setAdding(null); undoToast('Profilo logistico aggiunto');
  };
  const removeP = p => { store.remove('logisticsProfiles', p.id, 'Clima · profilo logistico eliminato'); undoToast('Profilo eliminato'); };
  const removeI = r => { store.remove('scope3Inputs', r.id, 'Clima · dato dello Scope 3 eliminato'); undoToast('Dato eliminato'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Scope 3" value={tco2(s3.total)} unit="t CO₂e" foot={`${nf(inv.intensity.s3PerT, 0)} kg CO₂e per t prodotta`} />
        <Kpi label="Materie prime acquistate (cat. 1)" value={tco2(c1.ingT)} unit="t CO₂e" foot={`${nf(c1.purchT)} t ricevute in ${nf(c1.nLots)} lotti`} />
        <Kpi label="Trasporti (cat. 4 e 9)" value={tco2(s3.c4 + s3.c9)} unit="t CO₂e" foot="ingressi non compresi, vettori, ritiri" />
        <Kpi label="Suolo occupato" value={nf(s3.landHa)} unit="ha·anno" foot={s3.flagMethod === 'componenti' ? 'dai fattori delle materie prime' : 'stima per categoria'} />
      </div>
      <Panel title="Screening delle 15 categorie" sub="Includi o escludi una categoria e scrivi la motivazione: compare nel rapporto e nel VSME" flush id="ecl-screening">
        <Table rows={s3.cats} rowKey={c => c.id} pageSize={15} exportName="clima-screening-scope3" cols={[
          { key: 'n', label: '#', render: c => <b>{c.n}</b> },
          { key: 'label', label: 'Categoria', render: c => <><b>{c.label}</b><span className="sub"><CatStatus s={c.status} /></span></> },
          { key: 'included', label: 'Inclusa', csv: c => (c.included ? 'sì' : 'no'), render: c => <label className="check small"><input type="checkbox" checked={c.included} disabled={c.n === 1} onChange={e => setInclude(c, e.target.checked)} aria-label={`Includi la categoria ${c.n}`} />{c.included ? 'sì' : 'no'}</label> },
          { key: 'value', label: 't CO₂e', align: 'r', sort: c => c.computedValue, csv: c => c.value, render: c => (c.included ? <b>{tco2(c.value)}</b> : <span className="muted">{c.computedValue > 0 ? `(${tco2(c.computedValue)})` : '—'}</span>) },
          { key: 'reason', label: 'Metodo o motivazione', csv: c => c.reason, render: c => <ReasonCell c={c} onSave={r => setReason(c, r)} /> },
        ]} />
      </Panel>
      <div className="split">
        <Panel title="Materie prime con più emissioni" sub="Categoria 1 sugli acquisti: tonnellate ricevute × fattore della materia prima">
          {top.length ? <Bars data={top.map(g => ({ key: g.ingId, label: g.name, value: g.tco2e, color: g.flagMethod === 'componenti' ? 'var(--s6)' : 'var(--s3)' }))} unit="t" decimals={0} ariaLabel="Emissioni per materia prima" /> : <Empty title="Nessun lotto ricevuto nel periodo" />}
        </Panel>
        <Panel title="Acquisti e consumi" sub="La categoria 1 si calcola sugli acquisti (GHG Protocol); la differenza con i consumi è la variazione delle scorte">
          <Kv items={[['Materie prime acquistate', `${nf(c1.purchT)} t → ${tco2(c1.ingT)} t CO₂e`], ['Materie prime consumate', `${nf(c1.consumedT)} t → ${tco2(c1.c1cons)} t CO₂e`],
            ['Differenza (scorte)', `${nf(c1.purchT - c1.consumedT)} t → ${tco2(c1.ingT - c1.c1cons)} t CO₂e`], ['Imballaggi acquistati', `${nf(c1.packKg)} kg → ${tco2(c1.packT)} t CO₂e`], ['Materiali di consumo', `${tco2(c1.consT)} t CO₂e (a valore)`],
            ...(c1.missing.length ? [['Senza fattore', c1.missing.map(m => `${m.name} (${nf(m.t)} t)`).join(', ')]] : [])]} />
        </Panel>
      </div>
      <Panel title="Fattori delle materie prime" sub="Dal registro delle materie prime (pacchetto impronta); quota FLAG e suolo dalle componenti o stimati per categoria" flush>
        <Table rows={c1.ingredients} rowKey={g => g.ingId} pageSize={12} exportName="clima-materie-prime" initialSort={{ key: 'tco2e', dir: 'desc' }} cols={[
          { key: 'name', label: 'Materia prima', render: g => <><b>{g.name}</b><span className="sub">{g.origin} · {g.category}</span></> },
          { key: 't', label: 't acquistate', align: 'r', render: g => nf(g.t) },
          { key: 'ef', label: 'kg CO₂e/t', align: 'r', render: g => nf(g.ef) },
          { key: 'tco2e', label: 't CO₂e', align: 'r', render: g => <b>{tco2(g.tco2e)}</b> },
          { key: 'flag', label: 'FLAG t', align: 'r', render: g => tco2(g.flag) },
          { key: 'landHa', label: 'ha·anno', align: 'r', render: g => nf(g.landHa) },
          { key: 'quality', label: 'Qualità', render: g => <QualityChip q={g.quality} /> },
          { key: 'sources', label: 'Fonte', csv: g => g.sources.join(', '), render: g => <span className="small muted">{g.sources.join(', ') || '—'}</span> },
        ]} />
      </Panel>
      <div className="split">
        <Panel title="Trasporti in ingresso" sub="Tratte oltre a quelle già comprese nel fattore della materia prima (per materia prima, fornitore o provenienza)" flush
          actions={<Btn small icon={adding === 'profilo' ? LuX : LuPlus} onClick={() => setAdding(x => (x === 'profilo' ? null : 'profilo'))}>{adding === 'profilo' ? 'Chiudi' : 'Nuovo profilo'}</Btn>}>
          {adding === 'profilo' && <div className="ecl-pad stack ecl-gap">
            <div className="form">
              <Field label="Si applica a"><Select value={pf.target} onChange={v => setPf(x => ({ ...x, target: v }))} options={[...['Italia', 'UE', 'Extra-UE'].map(o => ({ id: 'origin:' + o, label: `Provenienza ${o}` })), ...(d.ingredients || EMPTY).map(i => ({ id: 'ing:' + i.id, label: i.name }))]} ariaLabel="Ambito del profilo" /></Field>
              <Field label="Tratte (mezzo e km)"><input className="input" value={pf.legs} onChange={e => setPf(x => ({ ...x, legs: e.target.value }))} placeholder="nave 10000, camion 100" /></Field>
              <Field label="Nota"><input className="input" value={pf.note} onChange={e => setPf(x => ({ ...x, note: e.target.value }))} /></Field>
            </div>
            <label className="check small"><input type="checkbox" checked={pf.included} onChange={e => setPf(x => ({ ...x, included: e.target.checked }))} /> Trasporto già compreso nel fattore (nessuna emissione in più)</label>
            <div className="row"><Btn kind="primary" icon={LuPlus} onClick={addProfile}>Aggiungi il profilo</Btn></div>
          </div>}
          <Table rows={profiles} pageSize={10} exportName="clima-profili-logistici" cols={[
            { key: 'target', label: 'Ambito', csv: p => (p.ingId ? ingName(p.ingId) : p.origin || p.supplierId || ''), render: p => <><b>{p.ingId ? ingName(p.ingId) : `Provenienza ${p.origin || '—'}`}</b>{p.note && <span className="sub">{p.note}</span>}</> },
            { key: 'legs', label: 'Tratte', csv: p => (p.legs || EMPTY).map(l => `${l.mode} ${l.km}`).join(', '), render: p => <span className="small">{(p.legs || EMPTY).map(l => `${l.mode} ${nf(l.km)} km`).join(' + ')}</span> },
            { key: 't', label: 't nel periodo', align: 'r', sort: p => p.calc?.t ?? 0, csv: p => p.calc?.t ?? 0, render: p => nf(p.calc?.t ?? 0) },
            { key: 'tco2e', label: 't CO₂e', align: 'r', sort: p => p.calc?.tco2e ?? 0, csv: p => p.calc?.tco2e ?? 0, render: p => (p.includedInEf ? <span className="small muted">nel fattore</span> : <b>{tco2(p.calc?.tco2e ?? 0)}</b>) },
            { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: p => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il profilo" onClick={() => removeP(p)} /> },
          ]} empty="Nessun profilo: i trasporti in ingresso si considerano compresi nei fattori" />
          {lg.lotsNoProfile > 0 && <p className="small muted ecl-pad">{nf(lg.tNoProfile)} t ricevute senza profilo logistico: trasporto considerato compreso nel fattore.</p>}
        </Panel>
        <Panel title="Altri dati dello Scope 3" sub="Materiali di consumo e beni strumentali a valore, viaggi e pendolarismo in chilometri" flush
          actions={<Btn small icon={adding === 'dato' ? LuX : LuPlus} onClick={() => setAdding(x => (x === 'dato' ? null : 'dato'))}>{adding === 'dato' ? 'Chiudi' : 'Nuovo dato'}</Btn>}>
          {adding === 'dato' && <div className="ecl-pad"><EntityForm coll="scope3Inputs" d={d} rec={{ year: Number(P.to.slice(0, 4)), cat: '1-consumabili', unit: '€' }} saveLabel="Aggiungi"
            onSave={v => { store.batch([{ kind: 'add', coll: 'scope3Inputs', obj: v }], `Clima · dato dello Scope 3: categoria ${v.cat}, ${v.year}`); setAdding(null); undoToast('Dato aggiunto'); }} onCancel={() => setAdding(null)} /></div>}
          <Table rows={d.scope3Inputs || EMPTY} exportName="clima-dati-scope3" cols={[
            { key: 'year', label: 'Anno', render: r => <b>{r.year}</b> },
            { key: 'cat', label: 'Categoria', render: r => <span className="small">{r.cat === '1-consumabili' ? '1 · materiali di consumo' : `${r.cat}`}{r.note && <span className="sub">{r.note}</span>}</span> },
            { key: 'qty', label: 'Quantità', align: 'r', render: r => `${nf(r.qty)} ${r.unit}` },
            { key: 'x', label: '', nosort: true, csv: false, align: 'r', render: r => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il dato" onClick={() => removeI(r)} /> },
          ]} empty="Nessun dato inserito" />
        </Panel>
      </div>
      <Disclaimer />
    </>
  );
}
function ReasonCell({ c, onSave }) {
  const [v, setV] = useState(c.reason || '');
  React.useEffect(() => setV(c.reason || ''), [c.reason]);
  if (c.n === 1 || (c.included && c.computed)) return <span className="small ecl-wrap">{c.method || c.reason}</span>;
  return <input className="input slim ecl-reason" value={v} onChange={e => setV(e.target.value)} onBlur={() => onSave(v)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={`Motivazione della categoria ${c.n}`} />;
}

/* ================= ponte ================= */
const STEP_HELP = { volume: 'più o meno tonnellate prodotte, a parità di tutto il resto', mix: 'quota dei prodotti con formule più o meno impattanti', formule: 'composizione delle formule e fattori delle materie prime per tonnellata di prodotto',
  scorte: 'materie prime acquistate in più o in meno di quelle consumate', elettricita: 'kWh per tonnellata', fotovoltaico: 'quota di elettricità coperta dall’autoconsumo', rete: 'fattore di emissione della rete',
  termica: 'GPL, gasolio e gas per tonnellata', combustibile: 'passaggio a combustibili con fattore diverso (es. HVO)', refrigeranti: 'ricariche di gas refrigerante', altre: 'trasporti, rifiuti, imballaggi, combustibili a monte per tonnellata' };
function Ponte({ d, P, prev, inv }) {
  const [mode, setMode] = useState('auto');
  const br = useMemo(() => (inv?.hasData ? bridgeFor(d, P, prev, mode) : null), [d, P.key, prev?.key, mode, inv]);
  if (!br?.bridge) return <Panel title="Cosa è cambiato e perché"><Empty title="Servono dati per due periodi">Il ponte confronta l’esercizio con il precedente o le due metà dell’esercizio.</Empty></Panel>;
  const b = br.bridge;
  const steps = b.steps.filter(s => Math.abs(s.value) >= 0.5);
  const it = bridgeText(br, 'it'), en = bridgeText(br, 'en');
  return (
    <>
      <div className="row between ecl-mb">
        <Seg options={[{ id: 'auto', label: 'Automatico' }, { id: 'precedente', label: 'Esercizio precedente' }, { id: 'semestri', label: 'Due metà dell’esercizio' }]} value={mode} onChange={setMode} label="Confronto" />
        {br.note && <span className="small muted">{br.note}</span>}
      </div>
      <Panel title="Ponte delle emissioni" sub={`${br.A.period.label} → ${br.B.period.label} · t CO₂e, totale location-based · scomposizione esatta (la somma dei passi è la differenza)`} id="ecl-bridge">
        <Waterfall steps={[{ label: br.A.period.label, value: b.start, kind: 'total' }, ...steps.map(s => ({ label: s.label, value: s.value, kind: s.value < 0 ? 'neg' : 'pos' })), { label: br.B.period.label, value: b.end, kind: 'total' }]} unit="t CO₂e" decimals={0} height={280} ariaLabel="Ponte delle emissioni" />
        <p className="ecl-lead">{it.text}</p>
        <details className="small muted"><summary>In inglese (per report e questionari)</summary><p>{en.text}</p></details>
      </Panel>
      <Panel title="Passi del ponte" flush>
        <Table rows={b.steps.map(s => ({ ...s, help: STEP_HELP[s.id] }))} pageSize={20} exportName="clima-ponte" cols={[
          { key: 'label', label: 'Passo', render: s => <><b>{s.label}</b><span className="sub">{s.help}</span></> },
          { key: 'value', label: 't CO₂e', align: 'r', render: s => <b className={s.value > 0.5 ? 'ecl-up' : s.value < -0.5 ? 'ecl-down' : 'muted'}>{s.value > 0 ? '+' : s.value < 0 ? '−' : ''}{tco2(Math.abs(s.value))}</b> },
        ]} />
      </Panel>
    </>
  );
}

/* ================= metodo e stampa ================= */
function Metodo({ d, P, inv }) {
  const today = appToday(d);
  const S = climaSettings(d);
  const by = baseYearStatus(d);
  const periods = reportingPeriods(d);
  const [baseKey, setBaseKey] = useState(S.baseYearKey || P.key);
  const freeze = () => {
    const snap = baseSnapshotOf(d, baseKey, { at: today, by: authorNow() });
    if (!snap) return toast('Il periodo scelto non ha dati', 'err');
    confirm('Congelare l’anno base?', <p>{periodByKey(d, baseKey)?.label}: totale {tco2(snap.totals.lb)} t CO₂e. Da qui FeedOS segnala quando cambi di metodo o correzioni spostano il totale oltre il {nf(S.recalcThresholdPct)}%.</p>,
      () => { setEsgSettings('clima', { baseYearKey: baseKey, baseSnapshot: snap }, `Clima · anno base congelato: ${periodByKey(d, baseKey)?.label}`); undoToast('Anno base congelato'); }, { ok: 'Congela' });
  };
  const fl = usedFactors(d, inv, P), cats = categoryRows(inv), e2 = ets2Exposure(d, P);
  const co = d.settings?.company || {};
  return (
    <>
      <div className="split">
        <Panel title="Anno base e ricalcolo" sub="Ricalcolo quando cambi strutturali, di metodo o correzioni spostano il totale dell’anno base oltre la soglia">
          <div className="stack ecl-gap">
            <div className="form">
              <Field label="Anno base"><Select value={baseKey} onChange={setBaseKey} options={periods.map(p => ({ id: p.key, label: p.label }))} ariaLabel="Anno base" /></Field>
              <Field label="Soglia di ricalcolo (%)"><NumInput value={S.recalcThresholdPct} decimals={1} min={1} max={20} onChange={v => v != null && setEsgSettings('clima', { recalcThresholdPct: v }, `Clima · soglia di ricalcolo ${v}%`)} ariaLabel="Soglia di ricalcolo" /></Field>
            </div>
            <div className="row"><Btn kind="primary" icon={LuLock} onClick={freeze}>Congela l’anno base</Btn></div>
            <Kv items={[['Anno base', by.set ? by.period?.label || by.key : 'non fissato'], ['Fotografia', by.frozen ? `congelata il ${dateIt(by.snapshot.at)}${by.snapshot.by ? ` da ${by.snapshot.by}` : ''} · ${tco2(by.snapshot.totals.lb)} t CO₂e` : 'non ancora congelata'],
              ['Controllo', by.check ? (by.check.needed ? <Chip kind="warn">ricalcolo necessario</Chip> : <Chip kind="good">nessun ricalcolo</Chip>) : '—']]} />
            {by.check?.reasons?.map((r, i) => <p key={i} className="small">{r}</p>)}
          </div>
        </Panel>
        <Panel title="Esportazioni" sub="Rapporto dell’inventario in Markdown (italiano e inglese), dati in JSON e CSV, stampa o PDF dal browser">
          <div className="ecl-btns">
            <Btn icon={LuPrinter} kind="primary" onClick={printNow}>Stampa o PDF</Btn>
            <Btn icon={LuFileText} onClick={() => downloadText('clima-rapporto-it', 'md', methodMarkdown(d, P, 'it'), 'text/markdown;charset=utf-8')}>Rapporto MD (IT)</Btn>
            <Btn icon={LuFileText} onClick={() => downloadText('clima-report-en', 'md', methodMarkdown(d, P, 'en'), 'text/markdown;charset=utf-8')}>Report MD (EN)</Btn>
            <Btn icon={LuDownload} onClick={() => downloadText('clima-inventario', 'json', JSON.stringify(inventoryJson(d, P), null, 2), 'application/json')}>JSON</Btn>
          </div>
        </Panel>
      </div>
      {inv?.hasData ? <PrintPage title="Inventario dei gas a effetto serra" period={P} footer="Stima interna secondo GHG Protocol e struttura ISO 14064-1, non verificata da terzi · elaborata con FeedOS" className="ecl-sheet">
        <div id="ecl-print" className="ecl-print">
          <h3>1. Organizzazione e confini</h3>
          <Kv items={[['Organizzazione', co.name || '—'], ['Sito', co.site || co.address || '—'], ['Confini', 'controllo operativo dello stabilimento'], ['Periodo', `${dateIt(inv.window.from)} – ${dateIt(inv.window.to)}`], ['GWP', 'IPCC AR6, 100 anni']]} />
          <h3>2. Risultati</h3>
          <div className="tw"><table className="t ecl-pt"><thead><tr><th>Voce</th><th className="r">t CO₂e</th><th className="r">%</th><th>Qualità</th></tr></thead><tbody>
            {cats.filter(r => r.scope !== 3 || r.included).map(r => <tr key={r.id}><td>{r.label}</td><td className="r">{r.value == null ? '—' : tco2(r.value)}</td><td className="r">{pctTxt(r.share, 1)}</td><td>{r.quality ? QLAB[r.quality].toLowerCase() : '—'}</td></tr>)}
            <tr className="ecl-tot"><td>Totale (Scope 1 + 2 location-based + 3)</td><td className="r">{tco2(inv.totals.lb)}</td><td className="r">100%</td><td /></tr>
          </tbody></table></div>
          <p>Scope 2 market-based: {inv.s2.mb == null ? 'non calcolato (manca un mix residuo verificato)' : `${tco2(inv.s2.mb)} t CO₂e`}. FLAG: {tco2(inv.s3.flag)} t CO₂e. Intensità: {nf(inv.intensity.opsPerT, 1)} kg CO₂e/t (Scope 1 + 2), {nf(inv.intensity.perMEurNet, 1)} t CO₂e per M€ di ricavi netti. CO₂ biogenica fuori dagli scope: {tco2(inv.biogenicCO2)} t.</p>
          <h3>3. Categorie dello Scope 3 escluse</h3>
          <ul>{inv.s3.cats.filter(c => !c.included).map(c => <li key={c.id}><b>{c.n}. {c.label}</b>: {c.reason}</li>)}</ul>
          <h3>4. Fattori di emissione</h3>
          <div className="tw"><table className="t ecl-pt"><thead><tr><th>Fattore</th><th className="r">Valore</th><th>Unità</th><th>Fonte</th><th className="r">Anno</th><th>Stato</th></tr></thead><tbody>
            {fl.map(f => <tr key={f.id}><td>{f.label}</td><td className="r">{numTxt(f.value)}</td><td>{f.unit}</td><td>{f.source}</td><td className="r">{f.year ?? '—'}</td><td>{f.status}{f.overridden ? ' *' : ''}</td></tr>)}
          </tbody></table></div>
          <p className="xs">* valore sostituito nel registro dei fattori, con motivo.</p>
          <h3>5. Qualità dei dati e anno base</h3>
          <p>Misurato o calcolato {pctTxt(inv.quality.misurato + inv.quality.calcolato)}, stimato {pctTxt(inv.quality.stimato)}, valori predefiniti {pctTxt(inv.quality.default)} delle t CO₂e. Anno base: {by.set ? `${by.period?.label}${by.frozen ? `, congelato il ${dateIt(by.snapshot.at)}` : ', non ancora congelato'}` : 'non fissato'}; soglia di ricalcolo {nf(S.recalcThresholdPct)}%.</p>
          <h3>6. Esposizione all’ETS2 (dal {e2.start})</h3>
          <p>{nf(e2.annualTCO2, 1)} t di CO₂ fossile all’anno: {e2.rows.map(r => `${nf(r.price)} €/t → ${nf(r.cost)} €`).join(' · ')}.</p>
          <MethodNote text={CLIMA_METHOD} open title="7. Nota metodologica" />
          <Disclaimer />
        </div>
      </PrintPage> : <Empty title="Nessun dato da stampare nel periodo" />}
    </>
  );
}
