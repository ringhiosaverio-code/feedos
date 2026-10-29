/* FeedOS 18 · ESG › Rischi climatici: sottosezioni «assicurazioni» (copertura catastrofale L. 213/2023, polizze, azioni di
 * adattamento), «filiera» (esposizione delle materie prime, concentrazione, origini di base, rischi di fornitura) e «transizione»
 * (matrice probabilità × impatto, registro, esposizione al carbonio). Scritture con store.batch (un passo per azione, etichetta
 * italiana). Prefisso di classe eri-. */
import React, { useState } from 'react';
import { LuPlus, LuX, LuShieldCheck, LuTriangleAlert, LuPencil } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { Panel, Kpi, Table, Btn, Chip, Empty, Kv, Seg } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { nf } from '../core/util.js';
import { listJoin } from '../engine/esg-nlg.js';
import { setEsgSettings, EvidenceCount } from './esg-shared.jsx';
import {
  HAZARDS, hazardKey, KIND_LABEL, insuranceCheck, sourcingExposure, riskRows, transitionExposure, rischiSettings, isLowRiskOrigin,
  daysToExpiry, perilsOf, REQUIRED_PERILS,
} from '../engine/esg-rischi.js';
import { InsuranceChip, LevelMeter, RiskMatrix, eurTxt, pctTxt, dateTxt, daysTxt } from './esg-rischi-ui.jsx';

const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
/** Scrive una riga di una raccolta: aggiunta se non ha id, altrimenti modifica. Un solo passo annullabile. */
export function writeRow(coll, v, id, label) {
  if (id) store.batch([{ kind: 'update', coll, id, patch: v }], label);
  else store.batch([{ kind: 'add', coll, obj: v }], label);
  undoToast(id ? 'Modifica salvata' : 'Registrazione aggiunta');
}
const siteName = (d, id) => (d.sites || []).find(s => s && s.id === id)?.name || '—';
const eurSum = v => `${nf(v, 0)} €`;

/** Sottosezione «Assicurazioni»: stato della copertura catastrofale, polizze, azioni di adattamento. */
export function AssicurazioniView({ d, today }) {
  const ins = insuranceCheck(d, today);
  const [pol, setPol] = useState(null), [act, setAct] = useState(null);
  const cat = ins.policies.slice().sort((a, b) => String(a.to).localeCompare(String(b.to)));
  const next = cat.find(p => (daysToExpiry(p, today) ?? -1) >= 0) || cat[0] || null;
  const dte = next ? daysToExpiry(next, today) : null;
  const noAssets = ins.assets <= 0;
  return (
    <>
      <div className={`eri-banner ${noAssets ? '' : ins.compliant ? 'ok' : 'bad'}`} role="status">
        {ins.compliant ? <LuShieldCheck aria-hidden="true" /> : <LuTriangleAlert aria-hidden="true" />}
        <div>
          <b>{noAssets ? 'Valore dei beni da inserire' : ins.compliant ? 'Copertura catastrofale conforme' : `Copertura non conforme su ${ins.gaps.length} ${ins.gaps.length === 1 ? 'sito' : 'siti'}`}</b>
          <p className="small">{noAssets ? 'Inserisci il valore di terreni, fabbricati, impianti e attrezzature dei siti di proprietà: senza questi dati la copertura non si può verificare.'
            : ins.compliant ? 'Sisma, alluvione e frana coperti su tutti i siti di proprietà, con somma assicurata pari o superiore al valore dei beni (L. 213/2023, commi 101–111).'
            : 'Senza la polizza catastrofale obbligatoria si perdono contributi e agevolazioni pubbliche. Adeguare la polizza con il broker prima della scadenza.'}</p>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Copertura catastrofale" value={ins.ratio != null ? pctTxt(ins.ratio) : '—'} foot="somma assicurata ÷ valore dei beni di proprietà" status={ins.ratio == null ? undefined : ins.compliant ? 'ok' : 'bad'} />
        <Kpi label="Somma assicurata" value={nf(ins.insured)} unit="€" foot={next ? `polizza ${next.number || next.id}` : 'nessuna polizza catastrofale'} />
        <Kpi label="Valore dei beni di proprietà" value={nf(ins.assets)} unit="€" foot="terreni, fabbricati, impianti, attrezzature" />
        <Kpi label="Scadenza della polizza catastrofale" value={next ? dateTxt(next.to) : '—'} foot={next ? daysTxt(dte) : 'da registrare'} status={dte != null && dte <= 60 ? 'warn' : undefined} />
      </div>
      <Panel title="Copertura per sito" sub="La somma assicurata si ripartisce tra i siti in proporzione al valore dei loro beni" flush>
        {!ins.rows.length ? <Empty icon={LuShieldCheck} title="Nessun sito di proprietà">Registra i siti nella scheda Siti.</Empty> : (
          <Table rows={ins.rows} rowKey={r => r.site.id} exportName="rischi-copertura" cols={[
            { key: 'site', label: 'Sito', render: r => <b>{r.site.name}</b>, csv: r => r.site.name },
            { key: 'assets', label: 'Valore dei beni', align: 'r', sort: r => r.assets, csv: r => r.assets, render: r => eurTxt(r.assets) },
            { key: 'insured', label: 'Quota assicurata', align: 'r', sort: r => r.insured, csv: r => Math.round(r.insured), render: r => (r.assets ? eurTxt(r.insured) : '—') },
            { key: 'gap', label: 'Non coperto', align: 'r', sort: r => r.gap || 0, csv: r => (r.gap == null ? '' : Math.round(r.gap)), render: r => (r.gap ? eurTxt(r.gap) : '—') },
            { key: 'status', label: 'Stato', csv: r => r.status, render: r => <InsuranceChip status={r.status} /> },
            { key: 'missing', label: 'Rischi mancanti', csv: r => r.missing.join(', '), render: r => (r.missing.length ? <span className="small">{listJoin(r.missing, 'it')}</span> : <span className="muted small">—</span>) },
          ]} />
        )}
      </Panel>
      <Panel title="Polizze" sub="Tipo, compagnia, rischi assicurati, somma, scadenza. La scadenza della catastrofale compare nel calendario degli adempimenti."
        flush actions={<Btn small kind="primary" icon={pol ? LuX : LuPlus} onClick={() => setPol(pol ? null : {})}>{pol ? 'Chiudi' : 'Nuova polizza'}</Btn>}>
        {pol && <div className="eri-form"><EntityForm coll="insurancePolicies" d={d} rec={pol.id ? pol : { kind: 'catastrofale', perils: 'sisma, alluvione, frana' }}
          saveLabel={pol.id ? 'Salva la polizza' : 'Registra la polizza'} onSave={v => { writeRow('insurancePolicies', v, pol.id, `Rischi · polizza ${KIND_LABEL[v.kind] || v.kind}: ${v.insurer || v.number || ''}`.trim()); setPol(null); }} onCancel={() => setPol(null)} /></div>}
        {!(d.insurancePolicies || []).length ? <Empty title="Nessuna polizza registrata">Registra la polizza catastrofale obbligatoria e le altre coperture (all risks, responsabilità civile).</Empty> : (
          <Table rows={(d.insurancePolicies || []).filter(Boolean)} rowKey={p => p.id} exportName="rischi-polizze" onRow={p => setPol(p)} cols={[
            { key: 'kind', label: 'Tipo', render: p => <b>{KIND_LABEL[p.kind] || p.kind}</b>, csv: p => KIND_LABEL[p.kind] || p.kind },
            { key: 'insurer', label: 'Compagnia', render: p => <span className="small">{p.insurer || '—'}<span className="sub">n. {p.number || '—'}</span></span>, csv: p => p.insurer || '' },
            { key: 'perils', label: 'Rischi assicurati', csv: p => perilsOf(p).join(', '), render: p => (perilsOf(p).length ? <span className="row gap-s eri-chips">{perilsOf(p).map(x => <Chip key={x} kind={REQUIRED_PERILS.includes(x) ? 'good' : 'outline'}>{x}</Chip>)}</span> : (p.kind === 'catastrofale' || p.kind === 'all-risks') ? <Chip kind="crit">non indicati</Chip> : <span className="muted small">—</span>) },
            { key: 'insuredSum', label: 'Somma assicurata', align: 'r', sort: p => +p.insuredSum || 0, csv: p => +p.insuredSum || 0, render: p => eurTxt(p.insuredSum) },
            { key: 'to', label: 'Scadenza', sort: p => String(p.to), csv: p => p.to || '', render: p => <span className="small">{dateTxt(p.to)}<span className="sub">{daysTxt(daysToExpiry(p, today))}</span></span> },
            { key: 'evidence', label: 'Evidenze', nosort: true, render: p => <EvidenceCount d={d} type="insurancePolicies" refId={p.id} /> },
          ]} />
        )}
      </Panel>
      <Panel title="Azioni di adattamento" sub="Interventi per ridurre i pericoli dei siti, con responsabile e scadenza: quelli in ritardo generano un segnale in Oggi" flush
        actions={<Btn small kind="primary" icon={act ? LuX : LuPlus} onClick={() => setAct(act ? null : {})}>{act ? 'Chiudi' : 'Nuova azione'}</Btn>}>
        {act && <div className="eri-form"><EntityForm coll="adaptationActions" d={d} rec={act.id ? act : { status: 'pianificata', hazard: 'alluvione' }}
          saveLabel={act.id ? 'Salva l’azione' : 'Registra l’azione'} onSave={v => { writeRow('adaptationActions', v, act.id, `Rischi · azione di adattamento: ${v.action}`); setAct(null); }} onCancel={() => setAct(null)} /></div>}
        {!(d.adaptationActions || []).length ? <Empty title="Nessuna azione di adattamento">Registra gli interventi già decisi, per esempio ventilazione, quote di sicurezza o bacini di contenimento.</Empty> : (
          <Table rows={(d.adaptationActions || []).filter(Boolean)} rowKey={a => a.id} exportName="rischi-adattamento" onRow={a => setAct(a)} cols={[
            { key: 'action', label: 'Azione', render: a => <span className="small"><b>{a.action}</b>{a.hazard ? <span className="sub">{HAZARDS[hazardKey(a.hazard)] || a.hazard}</span> : null}</span>, csv: a => a.action },
            { key: 'site', label: 'Sito', csv: a => siteName(d, a.siteId), render: a => <span className="small">{siteName(d, a.siteId)}</span> },
            { key: 'cost', label: 'Costo', align: 'r', sort: a => +a.cost || 0, csv: a => +a.cost || 0, render: a => eurTxt(a.cost) },
            { key: 'owner', label: 'Responsabile', csv: a => a.owner || '', render: a => <span className="small">{a.owner || '—'}</span> },
            { key: 'due', label: 'Scadenza', sort: a => String(a.due), csv: a => a.due || '', render: a => <span className="small">{dateTxt(a.due)}{a.due && a.due < today && a.status !== 'fatta' && a.status !== 'sospesa' ? <Chip kind="warn">in ritardo</Chip> : null}</span> },
            { key: 'status', label: 'Stato', csv: a => a.status || '', render: a => <Chip kind={a.status === 'fatta' ? 'good' : a.status === 'sospesa' ? 'outline' : 'accent'}>{a.status || '—'}</Chip> },
          ]} />
        )}
      </Panel>
    </>
  );
}

/** Sottosezione «Filiera»: esposizione delle materie del periodo, concentrazione, origini di base e rischi di fornitura. */
export function FilieraView({ d, P, today }) {
  const ex = sourcingExposure(d, P);
  const S = rischiSettings(d);
  const [sr, setSr] = useState(null);
  const [origin, setOrigin] = useState(null);
  const text = Object.entries(S.originByIngredient || {}).map(([k, v]) => `${k}=${v}`).join('\n');
  const saveOrigin = () => {
    const next = {};
    for (const line of String(origin ?? text).split(/\n|;/)) { const m = line.match(/^\s*([\w-]+)\s*=\s*(.+?)\s*$/); if (m) next[m[1]] = m[2]; }
    setEsgSettings('rischi', st => ({ ...st, originByIngredient: next }), 'Rischi · origini di base per materia');
    setOrigin(null); undoToast('Origini salvate');
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Esposizione climatica della filiera" value={ex.value != null ? nf(ex.value, 1) : '—'} unit="su 4" foot="media dei livelli di rischio, pesata sulle tonnellate valutate" />
        <Kpi label="Acquisti con una valutazione" value={pctTxt(ex.assessedShare)} foot={`${nf(ex.assessedT)} t su ${nf(ex.total)} t nel periodo`} />
        <Kpi label="Da origini a rischio standard" value={pctTxt(ex.standardShare)} foot="extra-UE o origini non indicate" />
        <Kpi label="Tonnellate acquistate" value={nf(ex.total)} unit="t" foot={`periodo ${P?.label || ''}`} />
      </div>
      <Panel title="Origine e rischio per materia" sub="Tonnellate del periodo per materia e origine. Il livello è quello più alto tra i pericoli registrati per quella coppia." flush id="eri-filiera">
        {!ex.rows.length ? <Empty icon={LuShieldCheck} title="Nessun acquisto nel periodo">Gli acquisti di materie prime del periodo alimentano l’esposizione.</Empty> : (
          <Table rows={ex.rows} rowKey={r => `${r.commodity}|${r.origin}`} exportName="rischi-filiera" cols={[
            { key: 'commodity', label: 'Materia', render: r => <b>{r.commodity}</b>, csv: r => r.commodity },
            { key: 'origin', label: 'Origine', render: r => <span className="small">{r.origin}{!isLowRiskOrigin(r.origin) ? <Chip kind="warn">rischio standard</Chip> : null}</span>, csv: r => r.origin },
            { key: 't', label: 't', align: 'r', sort: r => r.t, csv: r => Math.round(r.t), render: r => nf(r.t) },
            { key: 'level', label: 'Livello', sort: r => r.level ?? -1, csv: r => r.level ?? '', render: r => <LevelMeter level={r.level} /> },
            { key: 'hazards', label: 'Pericoli', csv: r => r.hazards.map(h => HAZARDS[hazardKey(h)] || h).join(', '), render: r => (r.hazards.length ? <span className="small">{listJoin(r.hazards.map(h => HAZARDS[hazardKey(h)] || h), 'it')}</span> : <span className="muted small">non valutato</span>) },
          ]} />
        )}
      </Panel>
      <Panel title="Concentrazione per materia" sub="Indice HHI sulle origini: 10.000 significa un’unica origine; sopra 2.500 la fornitura è concentrata. Quota della prima origine e quota a rischio standard.">
        {!ex.concentration.length ? <Empty title="Nessun dato">Servono acquisti con origine nel periodo.</Empty> : (
          <Table rows={ex.concentration} rowKey={c => c.commodity} exportName="rischi-concentrazione" cols={[
            { key: 'commodity', label: 'Materia', render: c => <b>{c.commodity}</b>, csv: c => c.commodity },
            { key: 't', label: 't', align: 'r', sort: c => c.t, csv: c => Math.round(c.t), render: c => nf(c.t) },
            { key: 'hhi', label: 'HHI', align: 'r', sort: c => c.hhi || 0, csv: c => c.hhi ?? '', render: c => (c.hhi == null ? '—' : <span>{nf(c.hhi)}{c.hhi > 2500 && !isLowRiskOrigin(c.topOrigin) ? <Chip kind="warn">concentrata</Chip> : null}</span>) },
            { key: 'top', label: 'Origine principale', csv: c => c.topOrigin || '', render: c => <span className="small">{c.topOrigin || '—'}</span> },
            { key: 'share', label: 'Quota principale', align: 'r', sort: c => c.topShare || 0, csv: c => (c.topShare == null ? '' : Math.round(c.topShare * 100)), render: c => pctTxt(c.topShare) },
            { key: 'std', label: 'Quota a rischio standard', align: 'r', sort: c => c.standardShare || 0, csv: c => (c.standardShare == null ? '' : Math.round(c.standardShare * 100)), render: c => pctTxt(c.standardShare) },
          ]} />
        )}
      </Panel>
      <Panel title="Origine di base per materia" sub="Serve dove il lotto non ha un paese (la filiera EUDR lo dà per la soia). Una riga per materia: materia=codice paese, per esempio mais=IT."
        actions={origin == null ? <Btn small icon={LuPencil} onClick={() => setOrigin(text)}>Modifica</Btn> : <><Btn small kind="primary" onClick={saveOrigin}>Salva</Btn><Btn small onClick={() => setOrigin(null)}>Annulla</Btn></>}>
        {origin == null ? (text ? <pre className="eri-pre">{text}</pre> : <p className="small muted">Nessuna origine di base: vale l’origine dell’anagrafica della materia, altrimenti «non indicata».</p>)
          : <textarea className="input eri-area" value={origin} onChange={e => setOrigin(e.target.value)} aria-label="Origine di base per materia" rows={5} />}
      </Panel>
      <Panel title="Rischi di fornitura" sub="Pericolo climatico per materia e origine: alimenta l’esposizione e la scheda per la banca" flush
        actions={<Btn small kind="primary" icon={sr ? LuX : LuPlus} onClick={() => setSr(sr ? null : {})}>{sr ? 'Chiudi' : 'Nuovo rischio'}</Btn>}>
        {sr && <div className="eri-form"><EntityForm coll="sourcingRisks" d={d} rec={sr.id ? sr : { hazard: 'siccita', level: 2 }} saveLabel={sr.id ? 'Salva' : 'Registra'}
          onSave={v => { writeRow('sourcingRisks', v, sr.id, `Rischi · fornitura: ${v.commodity} da ${v.origin}`); setSr(null); }} onCancel={() => setSr(null)} /></div>}
        {!(d.sourcingRisks || []).length ? <Empty title="Nessun rischio di fornitura">Registra per ogni materia e origine il pericolo climatico più rilevante.</Empty> : (
          <Table rows={(d.sourcingRisks || []).filter(Boolean)} rowKey={r => r.id} exportName="rischi-fornitura" onRow={r => setSr(r)} cols={[
            { key: 'commodity', label: 'Materia', render: r => <b>{r.commodity}</b>, csv: r => r.commodity },
            { key: 'origin', label: 'Origine', csv: r => r.origin, render: r => <span className="small">{r.origin}</span> },
            { key: 'hazard', label: 'Pericolo', csv: r => HAZARDS[hazardKey(r.hazard)] || r.hazard, render: r => <span className="small">{HAZARDS[hazardKey(r.hazard)] || r.hazard}</span> },
            { key: 'level', label: 'Livello', sort: r => +r.level || 0, csv: r => r.level ?? '', render: r => <LevelMeter level={r.level} /> },
            { key: 'note', label: 'Nota', csv: r => r.note || '', render: r => <span className="small muted">{r.note || ''}</span> },
          ]} />
        )}
      </Panel>
    </>
  );
}

const BAND = { alto: ['crit', 'alto'], medio: ['warn', 'medio'], basso: ['outline', 'basso'] };
/** Sottosezione «Transizione»: matrice probabilità × impatto, registro dei rischi, esposizione al carbonio (ETS2, CBAM). */
export function TransizioneView({ d, P, today }) {
  const rows = riskRows(d);
  const te = transitionExposure(d, P);
  const H = rischiSettings(d).horizons;
  const [sel, setSel] = useState(null); // null | {} | rischio
  const [flt, setFlt] = useState('tutti');
  const shown = rows.filter(r => flt === 'tutti' || r.type === flt);
  const lo = rows.reduce((a, r) => a + (+r.financialLow || 0), 0), hi = rows.reduce((a, r) => a + (+r.financialHigh ?? +r.financialLow ?? 0), 0);
  return (
    <>
      <div className="kpis">
        <Kpi label="Rischi nel registro" value={rows.length} foot={`${rows.filter(r => r.type === 'transizione').length} di transizione, ${rows.filter(r => r.type === 'fisico').length} fisici`} />
        <Kpi label="Priorità alte" value={rows.filter(r => r.band === 'alto').length} foot="probabilità × impatto da 15 in su" />
        <Kpi label="Effetto finanziario stimato" value={rows.length ? `${nf(lo / 1000)}–${nf(hi / 1000)}` : '—'} unit={rows.length ? 'mila €' : undefined} foot="somma delle stime del registro" />
      </div>
      <Panel title="Matrice probabilità × impatto" sub="Ogni cella raccoglie i rischi con quella probabilità (colonne) e quell’impatto (righe). Clic su un codice per modificarlo.">
        <RiskMatrix rows={rows} onPick={r => setSel(r)} />
      </Panel>
      <Panel title="Registro dei rischi" sub="Rischi di transizione e fisici con orizzonte, probabilità, impatto, effetto stimato e risposta" flush
        actions={<><Seg label="Tipo di rischio" value={flt} onChange={setFlt} options={[{ id: 'tutti', label: 'Tutti' }, { id: 'transizione', label: 'Transizione' }, { id: 'fisico', label: 'Fisici' }]} /><Btn small kind="primary" icon={sel ? LuX : LuPlus} onClick={() => setSel(sel ? null : {})}>{sel ? 'Chiudi' : 'Nuovo rischio'}</Btn></>}>
        {sel && <div className="eri-form"><EntityForm coll="riskRegister" d={d} rec={sel.id ? sel : { type: 'transizione', horizon: 'medio', likelihood: 3, impact: 3 }}
          saveLabel={sel.id ? 'Salva il rischio' : 'Registra il rischio'} onSave={v => { writeRow('riskRegister', v, sel.id, `Rischi · registro: ${v.driver}`); setSel(null); }} onCancel={() => setSel(null)} /></div>}
        {!rows.length ? <Empty title="Registro vuoto">Registra i rischi di transizione (prezzo del carbonio, clienti, regole sulle sostanze) e quelli fisici.</Empty> : (
          <Table rows={shown} rowKey={r => r.id} exportName="rischi-registro" onRow={r => setSel(r)} cols={[
            { key: 'driver', label: 'Rischio', render: r => <span className="small"><b>{r.driver}</b>{r.response ? <span className="sub">{r.response}</span> : null}</span>, csv: r => r.driver },
            { key: 'type', label: 'Tipo', csv: r => r.type, render: r => <span className="small">{r.type}</span> },
            { key: 'horizon', label: 'Orizzonte', csv: r => H[r.horizon] || r.horizon, render: r => <span className="small">{H[r.horizon] || r.horizon}</span> },
            { key: 'score', label: 'Probabilità × impatto', align: 'r', sort: r => r.score, csv: r => r.score, render: r => <span>{r.likelihood} × {r.impact} = {r.score} <Chip kind={BAND[r.band][0]}>{BAND[r.band][1]}</Chip></span> },
            { key: 'fin', label: 'Effetto stimato (€)', align: 'r', sort: r => +r.financialHigh || 0, csv: r => `${+r.financialLow || 0}-${+r.financialHigh || 0}`, render: r => <span className="small">{eurTxt(r.financialLow)} – {eurTxt(r.financialHigh)}</span> },
          ]} />
        )}
      </Panel>
      <Panel title="Esposizione al carbonio" sub="Costi di transizione calcolati con i dati del periodo: non sono previsioni di bilancio">
        <Kv items={[
          ['Prezzo del carbonio interno (piano)', `${nf(te.carbonPrice)} €/t CO₂e`],
          ['Emissioni Scope 1 + 2 del periodo', te.scope12T != null ? `${nf(te.scope12T)} t CO₂e` : 'da completare nella scheda Clima'],
          ['Costo delle emissioni al prezzo interno', te.carbonCost != null ? `${eurTxt(te.carbonCost)} all’anno` : '—'],
          [`ETS2 al prezzo interno${te.ets2Start ? ` (dal ${te.ets2Start})` : ''}`, te.ets2Cost != null ? `${eurTxt(te.ets2Cost)} all’anno` : '—'],
          ['Acquisti soggetti a CBAM', `${nf(te.cbamT)} t nel periodo (soglia ${nf(te.cbamThreshold)} t)`],
          ['Clienti e accesso al mercato EUDR', 'si valutano nella scheda EUDR e fornitori (non ancora calcolati qui)'],
        ]} />
      </Panel>
    </>
  );
}
