/* FeedOS 18 · ESG › Report e questionari (pacchetto WP4 «report», scheda «vsme»): pagina di partenza della fondazione 18.
 * Contiene la copertura VSME e la bozza di report spostate da esg.jsx senza cambiamenti (stesso #esg-vsme), che il pacchetto
 * report fa evolvere. Contratto: ReportPage({ d, route }), ReportCard({ d }). */
import React from 'react';
import { LuCopy, LuDownload, LuFileText } from 'react-icons/lu';
import { toast } from '../core/store.js';
import { kpis, period12 } from '../core/derived.js';
import { nf, dateIt } from '../core/util.js';
import { download, stamp } from '../core/io.js';
import { vsmeCoverage } from '../engine/esg.js';
import { VSME_BASIC } from '../data/esgRegistry.js';
import { Panel, Btn, Table, Chip } from '../ui/ui.jsx';
import { EsgCard } from './esg-shared.jsx';

/** Scheda ESG › Report e questionari (id della scheda «vsme»). */
export function ReportPage({ d, route }) {
  return <Vsme d={d} />;
}

/** Riquadro del cruscotto ESG. */
export function ReportCard({ d }) {
  return <EsgCard title="Report e questionari" tab="vsme" icon={LuFileText} />;
}

/* ---------------- VSME e report (da esg.jsx, invariato) ---------------- */
function Vsme({ d }) {
  const P = period12(d); const R = kpis(d, P);
  const cov = vsmeCoverage(R.kpis, VSME_BASIC);
  const K = Object.fromEntries(R.kpis.map(k => [k.code, k]));
  const c = d.settings?.company || {};
  const v = (code, dec = 0) => { const k = K[code]; return k?.value == null ? '[da completare]' : typeof k.value === 'number' ? `${nf(k.value, dec)} ${k.unitShown}` : `${k.value}`; };
  const G = R.ghg, Wt = R.water, Ws = R.waste, A = d.survey || {};
  const text = `# Rapporto di sostenibilità · VSME modulo Basic (bozza)
${c.name || ''} · ${c.site || ''} · periodo ${dateIt(P.from)} – ${dateIt(P.to)}

## B1 · Criteri di redazione
Rapporto redatto secondo lo standard volontario VSME (EFRAG), modulo Basic, su base individuale. Perimetro: ${c.site || 'stabilimento'}. I valori operativi sono calcolati dai dati di FeedOS; gli altri provengono dal questionario ESG o sono stati inseriti dall’impresa.

## B2 · Pratiche e iniziative per la transizione
- Obiettivi di riduzione delle emissioni: ${A['em-target'] === 'si' ? (A['em-target-desc'] || 'sì') : A['em-target'] === 'no' ? 'non ancora definiti' : '[da completare]'}.
- Programmi di riduzione degli sprechi: ${A['wt-reduce'] === 'si' ? (A['wt-reduce-desc'] || 'sì') : A['wt-reduce'] === 'no' ? 'nessuno' : '[da completare]'}.

## B3 · Energia ed emissioni di gas serra
- Elettricità prelevata dalla rete: ${v('E1')}; fotovoltaico autoconsumato: ${v('E2')} (copertura ${v('E3', 1)}).
- Intensità elettrica: ${v('E4', 1)}. GPL: ${v('E5')}.
- Scope 1 (GPL${G.gasSmc ? ', gas naturale' : ''}${G.dieselL ? ', gasolio' : ''}): ${nf(G.scope1, 1)} t CO₂e. Scope 2 location-based: ${nf(G.scope2, 1)} t CO₂ (fattore ${nf((R.factors.feGrid) * 1000, 1)} g CO₂/kWh).
- Scope 3, categoria 1 (materie prime acquistate, stima dai fattori indicativi delle formule): ${nf(G.scope3)} t CO₂e.
- Intensità sui ricavi (Scope 1+2): ${G.perMEur != null ? nf(G.perMEur, 2) : '[da completare]'} t CO₂e per milione di euro.

## B4 · Inquinamento di aria, acqua e suolo
- Concentrazione di polveri alle emissioni: ${v('E16', 1)}. Scarichi idrici monitorati: ${A['wa-disch'] === 'si' ? 'sì' : A['wa-disch'] === 'no' ? 'no' : '[da completare]'}.

## B5 · Biodiversità
- Siti in o vicino ad aree sensibili: ${A['bd-protected'] === 'si' ? `sì (${A['bd-area'] || 'area da indicare'}${A['bd-dist'] != null ? `, ${nf(A['bd-dist'], 1)} km` : ''})` : A['bd-protected'] === 'no' ? 'nessuno' : '[da completare]'}.

## B6 · Acqua
- Prelievo idrico: ${v('E9')}${Wt.intensity != null ? ` (${nf(Wt.intensity * 1000, 1)} litri per tonnellata prodotta)` : ''}.

## B7 · Uso delle risorse, economia circolare e rifiuti
- Co-prodotti dell’agroindustria nelle formule: ${v('E12', 1)} del prodotto. Soia certificata senza deforestazione: ${v('E15', 1)}.
- Rifiuti prodotti: ${v('E10')}${Ws.n ? ` (pericolosi ${nf(Ws.hazKg)} kg)` : ''}; avviati a recupero: ${v('E11', 1)}.

## B8 · Forza lavoro · caratteristiche
- Addetti: ${v('S1')}. Turnover: ${v('S6', 1)}. Donne in ruoli di responsabilità: ${v('S7', 1)}.

## B9 · Forza lavoro · salute e sicurezza
- Indice di frequenza degli infortuni: ${v('S2', 2)}. Indice di gravità: ${v('S3', 2)}.

## B10 · Forza lavoro · retribuzione, contrattazione e formazione
- Divario retributivo di genere: ${v('S5', 1)}. Ore di formazione per addetto: ${v('S4', 1)}.

## B11 · Condanne e sanzioni per corruzione
- Episodi di corruzione: ${v('G4')}. Modello 231: ${v('G2')}. Procedura anticorruzione: ${v('G3')}. Certificazioni: ${v('G5')}.

Bozza generata automaticamente: verificare ogni valore e completare le parti narrative prima della pubblicazione.`;
  return (
    <div className="split">
      <Panel title="Copertura del modulo Basic del VSME" sub="Un requisito è coperto se almeno un indicatore collegato è di classe A o B" flush id="esg-vsme">
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
