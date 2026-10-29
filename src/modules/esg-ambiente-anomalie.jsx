/* FeedOS 18 · ESG › Registri ambientali › Anomalie e bilancio dei materiali (VS B7). Anomalie: z robusto con la mediana e lo scarto mediano
 * per linea e mese, errore di unità a 500 volte la mediana; ogni anomalia porta i record di origine. Bilancio dei materiali: consumo
 * delle materie prime (bilancio dell’impianto, in sola lettura), prodotti, calo di processo e rifiuti di processo, con la differenza. */
import React from 'react';
import { nf, monthLabel } from '../core/util.js';
import { go } from '../core/router.js';
import { Panel, Kpi, Table, Btn, Chip, Empty, Seg } from '../ui/ui.jsx';
import { Sankey, SERIES } from '../ui/charts.jsx';
import { anomalyList, ambienteSettings } from '../engine/esg-ambiente.js';
import { setEsgSettings, MethodNote } from './esg-shared.jsx';
import { numTxt } from './esg-ambiente-ui.jsx';

const SOURCE_TAB = m => (m.startsWith('kwh-t') || m === 'gpl-kg-t' ? 'energia-prestazioni' : m === 'acqua-lt' ? 'acqua-scarichi' : 'rentri');
const SOURCE_LABEL = { 'energia-prestazioni': 'Energia (ENPI)', 'acqua-scarichi': 'Acqua e scarichi', rentri: 'RENTRI e MUD' };
const KS = [{ id: 2.5, label: 'Più sensibile (2,5)', title: 'Segnala anche gli scostamenti moderati' }, { id: 3.5, label: 'Standard (3,5)', title: 'Soglia di base del pacchetto' }, { id: 5, label: 'Solo i casi gravi (5)', title: 'Segnala solo gli scostamenti molto grandi' }];

/** Sezione «anomalie». */
export function AnomalieSection({ d, P, S, today }) {
  const K = ambienteSettings(d).anomalyK;
  const list = anomalyList(d, today, { K, P });
  const unitErr = list.filter(a => a.unitError).length;
  const rows = list.map(a => ({ ...a, tab: SOURCE_TAB(a.metric), recIds: a.records.slice(0, 6).join(', ') + (a.records.length > 6 ? ` … (+${a.records.length - 6})` : '') }));
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Anomalie nel periodo" value={list.length} foot={list.length ? 'da verificare prima della verifica esterna' : 'nessuna sopra la soglia'} status={list.length ? 'warn' : 'ok'} />
        <Kpi label="Di cui errori di unità" value={unitErr} foot="valore 500 volte la mediana della serie" />
        <Kpi label="Soglia" value={numTxt(K, 1)} unit="z" foot="scostamenti standardizzati" />
      </div>
      <div className="eam-settings row" style={{ gap: 8 }}>
        <span className="small muted">Sensibilità</span>
        <Seg label="Sensibilità delle anomalie" value={K} options={KS} onChange={v => setEsgSettings('ambiente', { anomalyK: v }, `Registri ambientali: soglia anomalie ${v}`)} />
      </div>
      <Panel title="Valori fuori dalla norma" sub="Ogni riga rimanda ai record di origine e alla sezione che li contiene" flush>
        <Table rows={rows} rowKey={x => x.key} pageSize={12} exportName="anomalie-ambiente" empty="Nessuna anomalia nel periodo con questa soglia" cols={[
          { key: 'month', label: 'Mese', render: x => monthLabel(x.month, true), sort: true },
          { key: 'label', label: 'Serie', render: x => <span className="eam-wrap">{x.label}<span className="sub">{x.n} mesi nella serie · mediana {numTxt(x.median, 1)} {x.unit}</span></span> },
          { key: 'value', label: 'Valore', align: 'r', sort: true, render: x => `${numTxt(x.value, 1)} ${x.unit}` },
          { key: 'z', label: 'z', align: 'r', sort: true, render: x => numTxt(x.z, 1) },
          { key: 'unitError', label: 'Tipo', nosort: true, render: x => (x.unitError ? <Chip kind="crit">errore di unità</Chip> : <Chip kind="warn">scostamento</Chip>) },
          { key: 'recIds', label: 'Record di origine', nosort: true, render: x => <span className="eam-wrap small">{x.recIds}</span> },
          { key: 'tab', label: 'Registro', nosort: true, render: x => <Btn small kind="ghost" onClick={() => go('esg', 'ambiente', x.tab)}>{SOURCE_LABEL[x.tab]}</Btn> },
        ]} />
      </Panel>
      <MethodNote title="Come si calcola" text={{
        it: 'Per ogni serie (kWh per tonnellata di ciascuna linea, GPL per tonnellata, litri d’acqua per tonnellata, rifiuti per tonnellata) il valore si confronta con la mediana della serie. Lo scarto è misurato con il MAD (mediana degli scarti assoluti) e il punteggio z = 0,6745 × (valore − mediana) ÷ MAD, così un valore anomalo non altera la soglia. Oltre la soglia scelta si segnala lo scostamento; oltre 500 volte la mediana si segnala l’errore di unità (virgola o zero in più).',
        en: 'Each series (electricity per tonne by line, LPG per tonne, water per tonne, waste per tonne) is compared with its median. The spread is measured with the median absolute deviation (MAD) and the robust score z = 0.6745 × (value − median) ÷ MAD, so an outlier does not move the threshold. Above the chosen threshold the deviation is flagged; above 500 times the median a unit error is flagged.',
      }} />
    </>
  );
}

/** Sezione «bilancio-materiali». */
export function MaterialiSection({ d, P, S }) {
  const M = S.mass;
  if (!M || !M.consumed) return <Empty title="Bilancio dei materiali non disponibile">Servono le materie prime consumate e le produzioni del periodo (registro di produzione e magazzino).</Empty>;
  const diff = M.difference, pct = M.differencePct;
  // il diagramma deve tornare: se le uscite superano il consumo, il nodo «Scostamento» entra a sinistra; se il consumo supera le uscite, esce a destra
  const gapIn = diff < 0 ? -diff : 0, gapOut = diff > 0 ? diff : 0;
  const nodes = [
    { id: 'in', label: 'Materie prime consumate', col: 0, color: SERIES[0] },
    ...(gapIn ? [{ id: 'gap', label: 'Scostamento del bilancio', col: 0, color: SERIES[5] }] : []),
    { id: 'out', label: 'Prodotti', col: 1, color: SERIES[2] },
    { id: 'loss', label: 'Calo di processo', col: 1, color: SERIES[3] },
    { id: 'waste', label: 'Rifiuti di processo', col: 1, color: SERIES[4] },
    ...(gapOut ? [{ id: 'gapo', label: 'Scostamento del bilancio', col: 1, color: SERIES[5] }] : []),
  ];
  const links = [
    { from: 'in', to: 'out', value: M.products - gapIn }, { from: 'gap', to: 'out', value: gapIn },
    { from: 'in', to: 'loss', value: M.lossT }, { from: 'in', to: 'waste', value: M.processWasteT }, { from: 'in', to: 'gapo', value: gapOut },
  ].filter(l => l.value > 0);
  const mats = M.materials.map(x => ({ ...x, share: x.t / M.consumed }));
  const others = M.others > 0 ? [{ id: 'altre', label: `Altre materie prime (${M.nMaterials - 6})`, t: M.others, share: M.others / M.consumed }] : [];
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Prodotti del periodo" value={nf(M.products, 0)} unit="t" foot="tonnellate delle linee di produzione" />
        <Kpi label="Materie prime consumate" value={nf(M.consumed, 0)} unit="t" foot="dal bilancio dell’impianto" />
        <Kpi label="Calo di processo" value={numTxt(M.lossT, 1)} unit="t" foot="calo fra le conte di magazzino" />
        <Kpi label="Rifiuti di processo" value={numTxt(M.processWasteT, 1)} unit="t" foot={`imballi: ${numTxt(M.packagingT, 1)} t, fuori dal bilancio`} />
        <Kpi label="Differenza" value={numTxt(diff, 0)} unit="t" status={pct != null && Math.abs(pct) > 0.005 ? 'warn' : 'ok'} foot={pct != null ? `${numTxt(pct * 100, 2)}% del consumo` : '—'} />
      </div>
      <Panel title="Dal consumo alle uscite" sub="Materie prime consumate, prodotti, calo e rifiuti di processo (tonnellate del periodo)">
        <Sankey ariaLabel="Flusso di massa: materie prime, prodotti, calo e rifiuti" nodes={nodes} links={links} unit="t" decimals={0} height={240} />
        {diff < 0 && <p className="small eam-note">Le uscite superano il consumo di materie prime di {numTxt(-diff, 0)} t: il dato non si chiude. Controllare la pesatura dei prodotti, il calo di magazzino o i consumi registrati nelle formule.</p>}
        {diff > 0 && <p className="small eam-note">Il consumo supera le uscite registrate di {numTxt(diff, 0)} t: parte del materiale non è ancora contabilizzata come prodotto, calo o rifiuto.</p>}
      </Panel>
      <Panel title="Materie prime con il consumo maggiore" sub="Tonnellate consumate nel periodo e quota sul totale" flush>
        <Table rows={[...mats, ...others]} rowKey={x => x.id} pageSize={8} exportName="flusso-materiali" cols={[
          { key: 'label', label: 'Materia prima', render: x => x.label },
          { key: 't', label: 't', align: 'r', sort: true, render: x => nf(x.t, 1) },
          { key: 'share', label: 'Quota', align: 'r', sort: true, render: x => `${numTxt(x.share * 100, 1)}%` },
        ]} />
      </Panel>
      <p className="small muted eam-note">Gli imballi non sono materie prime dell’impianto: il loro peso è nei rifiuti (VS B7) ma non nel bilancio. Il bilancio è in sola lettura: nessun movimento di magazzino viene creato da questa scheda.</p>
    </>
  );
}
