/* FeedOS 18 · ESG › Rischi climatici (pacchetto WP8 «rischi»): siti e pericoli fisici, copertura catastrofale (L. 213/2023),
 * esposizione della filiera, assicurazioni, rischi di transizione, prova di stress e la scheda stampabile per la banca e il VSME C4.
 * Contratto: RischiPage({ d, route }) disegna la scheda (titolo e schede li disegna esg.jsx); RischiCard({ d }) è il riquadro del
 * cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Prefisso CSS eri-. */
import React, { useMemo, useState } from 'react';
import { LuThermometerSun, LuPrinter, LuDownload, LuGauge } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { appToday } from '../core/derived.js';
import { nf } from '../core/util.js';
import { download, stamp } from '../core/io.js';
import { listJoin } from '../engine/esg-nlg.js';
import {
  HAZARDS, hazardKey, rischiSignals, rischiSummary, rischiMarkdown, RISCHI_METHOD, insuranceCheck, sourcingExposure, transitionExposure,
  stressTest, riskRows, rischiSettings, hazardsOf, siteRisk, assetsOf, ownedSites,
} from '../engine/esg-rischi.js';
import { Panel, Kpi, Table, Btn, Chip, Empty, NumInput } from '../ui/ui.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, EsgCard, MethodNote, Disclaimer, StatusChip, setEsgSettings } from './esg-shared.jsx';
import { SitiView, FisiciView, exportHazardsCsv } from './esg-rischi-siti.jsx';
import { AssicurazioniView, FilieraView, TransizioneView } from './esg-rischi-assic.jsx';
import { InsuranceChip, eurTxt, pctTxt, dateTxt } from './esg-rischi-ui.jsx';

const SECTIONS = [['siti', 'Siti'], ['fisici', 'Pericoli fisici'], ['assicurazioni', 'Assicurazioni'], ['filiera', 'Filiera'],
  ['transizione', 'Transizione'], ['stress', 'Stress di prezzo'], ['scheda', 'Scheda per la banca']];
const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });

/** Scheda ESG › Rischi climatici. */
export function RischiPage({ d, route }) {
  const sub = SECTIONS.some(([id]) => id === route?.id) ? route.id : 'siti';
  const { P, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const sig = useMemo(() => rischiSignals(d, { today }), [d, today]);
  const badge = id => { const k = sig.filter(s => s.link?.id === id && s.severity !== 'info').length; return k || null; };
  const demo = d?.settings?.dataset === 'demo';
  return (
    <div className="eri" id="eri-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      {demo && <p className="eri-demo small">Dati dimostrativi: i livelli dei pericoli sono autovalutazione dimostrativa, non la mappa ISPRA; coordinate, polizze e beni sono di fantasia.</p>}
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge(id) }))} value={sub} tab="rischi" label="Sezioni di Rischi climatici" />
      {sub === 'siti' && <SitiView d={d} today={today} />}
      {sub === 'fisici' && <FisiciView d={d} today={today} />}
      {sub === 'assicurazioni' && <AssicurazioniView d={d} today={today} />}
      {sub === 'filiera' && <FilieraView d={d} P={P} today={today} />}
      {sub === 'transizione' && <TransizioneView d={d} P={P} today={today} />}
      {sub === 'stress' && <StressView d={d} today={today} />}
      {sub === 'scheda' && <SchedaView d={d} P={P} today={today} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: copertura catastrofale e prossima scadenza della polizza. */
export function RischiCard({ d }) {
  const today = appToday(d);
  if (!(d.sites || []).length && !(d.insurancePolicies || []).length) {
    return <EsgCard title="Rischi climatici" tab="rischi" icon={LuThermometerSun} sub="Registra i siti e la polizza catastrofale obbligatoria per vedere la copertura." />;
  }
  const ins = insuranceCheck(d, today);
  const next = ins.policies.filter(p => p.to >= today).sort((a, b) => String(a.to).localeCompare(String(b.to)))[0] || null;
  const hot = ownedSites(d).filter(s => (siteRisk(s, hazardsOf(d, s.id)).max ?? 0) >= 3).length;
  return (
    <EsgCard title="Rischi climatici" tab="rischi" icon={LuThermometerSun} value={ins.ratio != null ? pctTxt(ins.ratio) : '—'} unit={ins.ratio != null ? 'copertura catastrofale' : undefined}
      status={ins.ratio == null ? undefined : ins.compliant ? 'ok' : 'bad'}
      sub={next ? `Polizza catastrofale ${ins.compliant ? 'conforme' : 'da adeguare'}, scadenza ${dateTxt(next.to)}${hot ? ` · ${hot} ${hot === 1 ? 'sito' : 'siti'} con pericoli alti` : ''}` : 'Nessuna polizza catastrofale registrata.'} />
  );
}

/** Sottosezione «Stress di prezzo»: shock per materia (o energia) con runScenario in sola lettura; salvati nelle impostazioni. */
function StressView({ d, today }) {
  const S = rischiSettings(d);
  const [vals, setVals] = useState(null);
  const cur = vals || S.stress || {};
  const keys = Object.keys(cur);
  const res = useMemo(() => stressTest(d, S.stress, today), [d, today, JSON.stringify(S.stress)]);
  const save = () => { setEsgSettings('rischi', st => ({ ...st, stress: vals }), 'Rischi · shock di prezzo dello stress'); setVals(null); undoToast('Shock salvati'); };
  const LABEL = { energia: 'Energia (elettricità e GPL)', mais: 'Mais', soia: 'Soia', rame: 'Rame', 'sostanze attive': 'Sostanze attive' };
  return (
    <>
      <Panel title="Shock di prezzo" sub="Variazione in % del prezzo di ogni materia (o dell’energia) rispetto al prezzo del periodo. Si salva nelle impostazioni del pacchetto."
        actions={vals ? <><Btn small kind="primary" onClick={save}>Salva gli shock</Btn><Btn small onClick={() => setVals(null)}>Annulla</Btn></> : null}>
        <div className="eri-shocks">
          {keys.map(k => (
            <label key={k} className="eri-shock">
              <span>{LABEL[k] || k}</span>
              <NumInput value={cur[k]} onChange={v => setVals({ ...cur, [k]: v })} decimals={0} min={-90} max={300} ariaLabel={`Shock di prezzo per ${LABEL[k] || k}, in percentuale`} />
              <span className="small muted">%</span>
            </label>
          ))}
        </div>
      </Panel>
      {!res || !(res.volumeBase > 0) ? <Panel title="Risultato"><Empty icon={LuGauge} title="Nessun prodotto con formula">La prova di stress usa le formule di produzione e i volumi degli ultimi dodici mesi: servono prodotti attivi con formula.</Empty></Panel> : (
        <>
          <div className="kpis">
            <Kpi label="Variazione del margine di contribuzione" value={nf(res.dMargin)} unit="€/anno" foot="a formule invariate, solo prezzi" status={res.dMargin < 0 ? 'bad' : 'ok'} />
            <Kpi label="Per tonnellata" value={res.perT != null ? nf(res.perT, 1) : '—'} unit="€/t" foot={res.volumeBase ? `su ${nf(res.volumeBase)} t all’anno` : ''} />
            <Kpi label="Margine di contribuzione base" value={nf(res.marginBase)} unit="€/anno" foot="ultimi dodici mesi" />
            <Kpi label="Margine con lo shock" value={nf(res.marginSc)} unit="€/anno" foot="stesse quantità e formule" />
          </div>
          <Panel title="Shock applicati" sub="Quali materie e quali shock sono entrati nella prova" flush>
            <Table rows={keys.map(k => ({ id: k, key: k, value: cur[k], used: res.matched.includes(k) }))} rowKey={r => r.id} exportName="rischi-stress" cols={[
              { key: 'key', label: 'Shock', render: r => <b>{LABEL[r.key] || r.key}</b>, csv: r => r.key },
              { key: 'value', label: 'Variazione', align: 'r', csv: r => r.value, render: r => `${nf(r.value)}%` },
              { key: 'used', label: 'Applicato', csv: r => (r.used ? 'sì' : 'no'), render: r => (r.used ? <Chip kind="good">sì</Chip> : <Chip kind="outline">nessuna materia</Chip>) },
            ]} />
          </Panel>
          <p className="small muted">Metodo: stesso motore dello scenario di prezzo (runScenario), in sola lettura: cambiano i prezzi delle materie e dell’energia, non le formule né i volumi. È una sensibilità, non una previsione di margine.</p>
        </>
      )}
    </>
  );
}

/** Sottosezione «Scheda per la banca»: foglio stampabile con siti, pericoli, copertura, filiera, transizione e stress (C4 del VSME). */
function SchedaView({ d, P, today }) {
  const ins = insuranceCheck(d, today);
  const ex = sourcingExposure(d, P);
  const te = transitionExposure(d, P);
  const st = stressTest(d, null, today);
  const top = riskRows(d).slice(0, 5);
  const sites = ownedSites(d).concat((d.sites || []).filter(s => s && s.owned === false));
  const H = rischiSettings(d).horizons;
  const hz = s => hazardsOf(d, s.id).filter(h => (+h.level || 0) >= 2).sort((a, b) => (+b.level || 0) - (+a.level || 0))
    .map(h => `${HAZARDS[hazardKey(h.hazard)] || h.hazard} ${h.level}`);
  const actions = (d.adaptationActions || []).filter(Boolean);
  const cat = ins.policies.slice().sort((a, b) => String(a.to).localeCompare(String(b.to)))[0] || null;
  const json = () => download(`feedos-rischi-riepilogo-${stamp()}.json`, JSON.stringify(rischiSummary(d, P), null, 2), 'application/json;charset=utf-8');
  const md = () => download(`feedos-rischi-scheda-${stamp()}.md`, rischiMarkdown(d, P, today), 'text/markdown;charset=utf-8');
  return (
    <>
      <div className="eri-toolbar no-print">
        <Btn small icon={LuPrinter} onClick={printNow}>Stampa o salva in PDF</Btn>
        <Btn small icon={LuDownload} onClick={() => exportHazardsCsv(d)}>Pericoli (CSV)</Btn>
        <Btn small icon={LuDownload} onClick={json}>Riepilogo (JSON)</Btn>
        <Btn small icon={LuDownload} onClick={md}>Scheda (Markdown)</Btn>
      </div>
      <PrintPage title="Rischi climatici: scheda per banca e VSME C4" period={P} issued={today} footer="Rischi climatici · FeedOS">
        <h2 className="eri-h2">1. Siti e pericoli fisici</h2>
        {!sites.length ? <p>Nessun sito registrato.</p> : (
          <div className="eri-scroll"><table className="eri-print">
            <thead><tr><th>Sito</th><th>Tipo</th><th>Comune</th><th>Valore dei beni</th><th>Copertura</th><th>Pericoli di livello 2 o più</th></tr></thead>
            <tbody>
              {sites.map(s => {
                const r = ins.rows.find(x => x.site.id === s.id);
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td><td className="eri-nw">{s.kind || '—'}</td><td className="eri-nw">{s.comune || '—'}</td>
                    <td>{s.owned === false ? 'locato' : eurTxt(assetsOf(s))}</td>
                    <td>{r ? <InsuranceChip status={r.status} /> : '—'}</td>
                    <td className="small">{hz(s).length ? hz(s).join(', ') : 'nessuno, o non valutato'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <p className="small">I livelli sono autovalutazione o verifica ISPRA IdroGEO, scala 0–4 (0 trascurabile, 4 molto alto), con fonte e data nel registro. <StatusChip status="da verificare" /></p>

        <h2 className="eri-h2">2. Copertura catastrofale (L. 213/2023, commi 101–111)</h2>
        <p>{ins.compliant ? `Copertura conforme: sisma, alluvione e frana su tutti i siti di proprietà; somma assicurata ${eurTxt(ins.insured)} contro ${eurTxt(ins.assets)} di beni.` : ins.assets > 0 ? `Copertura non conforme su ${ins.gaps.length} ${ins.gaps.length === 1 ? 'sito' : 'siti'}: senza la polizza si perdono contributi e agevolazioni pubbliche.` : 'Valore dei beni da inserire.'}
          {cat ? ` Polizza ${cat.number || cat.id} (${cat.insurer || 'compagnia da indicare'}), scadenza ${dateTxt(cat.to)}.` : ' Nessuna polizza catastrofale registrata.'}</p>

        <h2 className="eri-h2">3. Esposizione della filiera</h2>
        <p>{ex.value != null ? `Livello medio ${nf(ex.value, 1)} su 4 sulle tonnellate valutate (${pctTxt(ex.assessedShare)} delle ${nf(ex.total)} t del periodo). Da origini a rischio standard: ${pctTxt(ex.standardShare)}.` : 'Nessun acquisto valutato nel periodo.'}
          {ex.concentration.length ? ` Materie più concentrate (indice HHI): ${listJoin(ex.concentration.filter(c => c.hhi != null).slice(0, 3).map(c => `${c.commodity} ${nf(c.hhi)}`), 'it')}.` : ''}</p>

        <h2 className="eri-h2">4. Rischi di transizione: prime cinque voci</h2>
        {!top.length ? <p>Registro dei rischi vuoto.</p> : (
          <div className="eri-scroll"><table className="eri-print">
            <thead><tr><th>Rischio</th><th>Orizzonte</th><th>Probabilità × impatto</th><th>Effetto stimato</th><th>Risposta</th></tr></thead>
            <tbody>{top.map(r => <tr key={r.id}><td>{r.driver}</td><td className="eri-nw">{H[r.horizon] || r.horizon}</td><td>{r.likelihood} × {r.impact} = {r.score}</td><td>{eurTxt(r.financialLow)} – {eurTxt(r.financialHigh)}</td><td>{r.response || '—'}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="small">Costo delle emissioni Scope 1 + 2 al prezzo interno del carbonio ({nf(te.carbonPrice)} €/t): {te.carbonCost != null ? `${eurTxt(te.carbonCost)} all’anno` : 'da completare'}. Acquisti soggetti a CBAM nel periodo: {nf(te.cbamT)} t.</p>

        <h2 className="eri-h2">5. Stress di prezzo</h2>
        <p>{st ? `Con gli shock ${Object.entries(st.shock || {}).map(([k, v]) => `${k} +${v}%`).join(', ')}, il margine di contribuzione cambia di ${eurTxt(st.dMargin)} all’anno${st.perT != null ? ` (${nf(st.perT, 1)} €/t)` : ''}, a formule invariate.` : 'Prova di stress non disponibile: servono prodotti con formula.'}</p>

        <h2 className="eri-h2">6. Azioni di adattamento</h2>
        {!actions.length ? <p>Nessuna azione registrata.</p> : (
          <div className="eri-scroll"><table className="eri-print">
            <thead><tr><th>Azione</th><th>Sito</th><th>Costo</th><th>Scadenza</th><th>Stato</th></tr></thead>
            <tbody>{actions.map(a => <tr key={a.id}><td>{a.action}</td><td>{(d.sites || []).find(s => s && s.id === a.siteId)?.name || '—'}</td><td className="eri-nw">{eurTxt(a.cost)}</td><td className="eri-nw">{dateTxt(a.due)}</td><td className="eri-nw">{a.status || '—'}</td></tr>)}</tbody>
          </table></div>
        )}
        <Disclaimer />
      </PrintPage>
      <Panel title="Metodo" sub="Come sono calcolati i numeri della scheda" className="no-print">
        <MethodNote text={RISCHI_METHOD} lang="it" open={false} />
      </Panel>
    </>
  );
}
