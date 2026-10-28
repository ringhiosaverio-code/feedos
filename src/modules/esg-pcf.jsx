/* FeedOS 18 · ESG › Impronta mangimi (pacchetto WP2 «pcf», scheda «passaporto»): sottosezioni (#esg.passaporto.<id>)
 * scheda (o direttamente l'id del prodotto, come il vecchio passaporto) · prodotti · clienti (e clienti.<id>) · fattori ·
 * formulazione · imballaggi · scambio · metodo.
 * Contratto: PcfPage({ d, route }), PcfCard({ d }) (riquadro del cruscotto ESG), CustomerEsg (scheda cliente) e ProductPcf (scheda
 * prodotto), passport(d, p, I, today, f) per chi usava il vecchio passaporto. Il passaporto conserva #esg-passport.
 * Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Prefisso CSS e DOM epc-. Scritture solo con store.batch ed etichetta italiana.
 * Le parti per i clienti (scheda stampata, dichiarazioni, PACT) non mostrano mai le materie prime della formula. */
import React, { useMemo, useState } from 'react';
import { LuPrinter, LuWheat, LuDownload, LuUpload, LuTriangleAlert, LuArrowRight, LuSend, LuFileText } from 'react-icons/lu';
import { store, closeDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { NAV } from '../app/nav.js';
import { idx, appToday } from '../core/derived.js';
import { nf, sum, dateIt, addDays } from '../core/util.js';
import { fmtPm } from '../core/units.js';
import { balance, aggregate, scope1PerKg, DEFAULTS } from '../engine/energy.js';
import { formulaCO2, coProductShare, afb1Check } from '../engine/formulation.js';
import { currentPeriod } from '../engine/esg-years.js';
import { pcf, pcfSignals, pcfSummary, pcfSettings, pcfOn, weightedPcf, customerTotals, recalcAlerts, PCF_METHOD, PCF_DEFAULTS, pcfPack } from '../engine/esg-pcf.js';
import { publishOps, activeSnapshots, originClass, originLabel, BOUNDARY_LABEL, EL_MODEL_LABEL, HEP_LABEL, packList, packInfo } from '../engine/esg-pcf-core.js';
import { greenFeedSheet, mi57Package } from '../engine/esg-pcf-exchange.js';
import { CO_CLASSES } from '../data/pack-pcf.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, Kv, NumInput, confirm } from '../ui/ui.jsx';
import { StackBar, Legend, Bars, SERIES } from '../ui/charts.jsx';
import { printNow } from '../ui/print.jsx';
import { lotCheck } from './qualita.jsx';
import { SignalList } from './shared.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, StatusChip, MethodNote, Disclaimer, EsgCard, setEsgSettings, Lineage, QualityChip } from './esg-shared.jsx';
import { kgTxt, tTxt, pctTxt, undoToast, downloadCsv, downloadJson, SourceChip, DqrChip, SnapChip, Band } from './esg-pcf-ui.jsx';
import { Clienti } from './esg-pcf-clienti.jsx';
import { Fattori, Imballaggi, Scambio } from './esg-pcf-registri.jsx';
import { Formulazione } from './esg-pcf-formula.jsx';

const SECTIONS = [['scheda', 'Scheda prodotto'], ['prodotti', 'Portafoglio'], ['clienti', 'Dichiarazioni ai clienti'], ['fattori', 'Fattori'], ['formulazione', 'Formulazione a basso carbonio'],
  ['imballaggi', 'Imballaggi'], ['scambio', 'Scambio dati'], ['metodo', 'Metodo']];
const COMP = [['raw', 'Materie prime', 'var(--s3)'], ['loss', 'Perdite', 'var(--s8)'], ['inbound', 'Trasporto in ingresso', 'var(--s4)'], ['millCommon', 'Energia comune', 'var(--s1)'],
  ['millPellet', 'Vapore e pellet', 'var(--s2)'], ['packaging', 'Imballaggio', 'var(--s5)'], ['outbound', 'Consegna', 'var(--s7)']];

/** Scheda ESG › Impronta mangimi (id della scheda «passaporto»; route.id = sottosezione o prodotto). */
export function PcfPage({ d, route }) {
  const { P, prev, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const rid = String(route?.id || '');
  const isProd = A(d.products).some(p => p.id === rid);
  const [sec, ...rest] = rid.split('.');
  const arg = rest.join('.');
  const sub = isProd || !sec ? 'scheda' : SECTIONS.some(([id]) => id === sec) ? sec : 'scheda';
  const sig = useMemo(() => pcfSignals(d, { today }), [d, today]);
  const S = useMemo(() => pcfSummary(d, P), [d, P.key]);
  if (!S) return <Empty title="Archivio non disponibile" />;
  const cnt = pre => sig.filter(s => s.key.startsWith(pre)).length || null;
  const badge = { scheda: cnt('pcf:recalc:'), fattori: cnt('pcf:ef-generic:'), imballaggi: cnt('pcf:pkg-missing:'), scambio: cnt('pcf:pact-expired:') };
  const props = { d, P, prev, today, S, sig };
  return (
    <div className="epc" id="epc-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge[id] }))} value={sub} tab="passaporto" label="Sezioni di Impronta mangimi" />
      {sub === 'scheda' && <Scheda {...props} productId={isProd ? rid : arg || null} />}
      {sub === 'prodotti' && <Prodotti {...props} />}
      {sub === 'clienti' && <Clienti {...props} pick={arg} />}
      {sub === 'fattori' && <Fattori {...props} />}
      {sub === 'formulazione' && <Formulazione {...props} pick={arg} />}
      {sub === 'imballaggi' && <Imballaggi {...props} pick={arg} />}
      {sub === 'scambio' && <Scambio {...props} />}
      {sub === 'metodo' && <Metodo {...props} />}
    </div>
  );
}
const A = x => (Array.isArray(x) ? x : []);

/** Riquadro del cruscotto ESG: impronta media ponderata, quota LUC, segnale principale. */
export function PcfCard({ d }) {
  if (!pcfOn(d)) return <EsgCard title="Impronta mangimi" tab="passaporto" icon={LuWheat} value="—" sub="Impronta dei prodotti non attiva in questa edizione." />;
  const P = currentPeriod(d);
  const w = weightedPcf(d, P);
  const sig = pcfSignals(d, { today: appToday(d) });
  if (!w) return <EsgCard title="Impronta mangimi" tab="passaporto" icon={LuWheat} value="—" sub="Servono formule, produzione e fattori delle materie prime per calcolare l’impronta dei prodotti." />;
  const top = sig.find(x => x.severity === 'attenzione') || sig[0] || null;
  const status = sig.some(x => x.severity === 'critico') ? 'bad' : sig.some(x => x.severity === 'attenzione') ? 'warn' : 'ok';
  return (
    <EsgCard title="Impronta mangimi" tab="passaporto" id="prodotti" icon={LuWheat} value={nf(w.pcf)} unit="kg CO₂e/t" status={status}
      sub={`${P.short} · media ponderata sulla produzione · LUC ${pctTxt(w.lucShare)} · dati primari ${pctTxt(w.primary, 1)}`}>
      {top && <p className="epc-card-sig">{top.title}</p>}
    </EsgCard>
  );
}

/** Sezione della scheda cliente: impronta dei mangimi consegnati nell'esercizio, dichiarazione, lettera EUDR. */
export function CustomerEsg({ d, id }) {
  if (!pcfOn(d)) return null;
  const P = currentPeriod(d);
  const ct = customerTotals(d, id, P);
  if (!ct || !(ct.totals.t > 0)) return null;
  const sent = pcfSettings(d).sent.find(x => x.customerId === id && x.periodKey === P.key);
  const nav = (...a) => { closeDrawer(); go(...a); };
  return (
    <div className="dsec epc-dsec">
      <div className="eyebrow">Impronta dei mangimi consegnati · {P.short}</div>
      <Kv items={[
        ['Impronta', `${tTxt(ct.totals.tco2e)} t CO₂e · ${kgTxt(ct.totals.kgPerT)} kg CO₂e/t su ${tTxt(ct.totals.t)} t`],
        ['di cui cambio d’uso del suolo', `${tTxt(ct.totals.luc)} t CO₂e (${pctTxt(ct.totals.lucShare)})`],
        ['Soia senza deforestazione (stima)', ct.dcfEstimate == null ? 'nessuna soia' : pctTxt(ct.dcfEstimate)],
        ['Dichiarazione d’impronta', sent ? `inviata il ${dateIt(sent.at)}` : 'non ancora inviata per questo esercizio'],
      ]} />
      <div className="row gap-s">
        <Btn small icon={LuFileText} onClick={() => nav('esg', 'passaporto', `clienti.${id}`)}>Dichiarazione d’impronta</Btn>
        {NAV.esg?.tabs.some(t => t.id === 'filiera') && <Btn small kind="ghost" icon={LuArrowRight} onClick={() => nav('esg', 'filiera', `clienti.${id}`)}>Lettera EUDR</Btn>}
      </div>
    </div>
  );
}

/** Sezione della scheda prodotto: impronta in vigore con la banda d'incertezza e lo stato della pubblicazione. */
export function ProductPcf({ d, id }) {
  if (!pcfOn(d)) return null;
  const r = pcf(d, id, {});
  if (!r) return null;
  const snap = activeSnapshots(d).find(s => s.productId === id);
  const al = snap ? recalcAlerts(d).find(a => a.product.id === id) : null;
  const nav = (...a) => { closeDrawer(); go(...a); };
  return (
    <div className="dsec epc-dsec">
      <div className="eyebrow">Impronta di carbonio (stima dalla culla al cancello)</div>
      <Kv items={[
        ['Impronta in vigore', `${kgTxt(r.total)} kg CO₂e/t · P10–P90 ${kgTxt(r.mc.p10)}–${kgTxt(r.mc.p90)}`],
        ['di cui cambio d’uso del suolo', `${kgTxt(r.luc)} kg/t (${pctTxt(r.lucShare)})`],
        ['Dati primari', pctTxt(r.primaryShare, 1)],
        ['Pubblicazione', <SnapChip snap={snap} alert={al} />],
      ]} />
      <div className="row gap-s"><Btn small icon={LuWheat} onClick={() => nav('esg', 'passaporto', id)}>Scheda ambientale</Btn></div>
    </div>
  );
}

/* ---------------- passaporto di prodotto: parte di qualità e sicurezza del vecchio passaporto (stessi conti) ---------------- */
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

/* ================= scheda del prodotto ================= */
function Scheda({ d, P, today, S, productId }) {
  const prods = A(d.products).filter(p => p.active !== false);
  const p = prods.find(x => x.id === productId) || prods[0] || null;
  const [lotId, setLotId] = useState('');
  const pid = p?.id || '';
  const lots = useMemo(() => A(d.lots).filter(l => l.productId === pid && A(l.comp).length).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15), [d.lots, pid]);
  const lot = lots.some(l => l.id === lotId) ? lotId : '';
  const r = useMemo(() => (pid ? pcf(d, pid, { P, lotId: lot || undefined }) : null), [d, pid, P.key, lot]);
  const legacy = useMemo(() => {
    if (!p) return null;
    const en = d.settings?.energy || {};
    const f = { ...DEFAULTS, feGrid: +en.feGrid || DEFAULTS.feGrid, feGpl: +en.feGpl || DEFAULTS.feGpl };
    try { return passport(d, p, idx(d), today, f); } catch { return null; }
  }, [d, pid, today]);
  if (!p) return <Panel title="Scheda ambientale del mangime"><Empty icon={LuWheat} title="Nessun prodotto attivo">Servono prodotti con una formula approvata.</Empty></Panel>;
  if (!r) return <Panel title={p.name}><Empty icon={LuWheat} title="Impronta non calcolabile">Il prodotto non ha una formula con materie prime: collegalo a una formula in Formulazione.</Empty></Panel>;
  const snap = activeSnapshots(d).find(s => s.productId === p.id);
  const alert = S.snapshots.alerts.find(a => a.product.id === p.id) || null;
  const history = A(d.pcfSnapshots).filter(s => s.productId === p.id).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const company = d.settings?.company || {};
  const code = `FOS-${p.code || p.id}-${r.formula?.version ?? 0}-${String(r.date).replace(/-/g, '').slice(2)}${r.lot ? '-L' : ''}`;
  const c = r.components;
  const parts = COMP.map(([k, label, color]) => ({ key: k, label, value: c[k] || 0, color })).filter(x => x.value > 0.05);
  const flag = [{ key: 'luc', label: 'Cambio d’uso del suolo', value: r.luc, color: 'var(--s8)' }, { key: 'lm', label: 'Gestione del suolo', value: r.landMgmt, color: 'var(--s6)' }, { key: 'nf', label: 'Non FLAG', value: Math.max(0, r.nonFlag), color: 'var(--s7)' }].filter(x => x.value > 0.05);
  const byClass = {};
  for (const l of r.lines) { const k = originClass(l.origin) || 'n.d.'; byClass[k] = (byClass[k] || 0) + l.kg / 1000; }
  const ORIG = { IT: 'Italia', UE: 'altri paesi UE', EXTRA: 'extra-UE', 'n.d.': 'non nota' };
  const publish = () => confirm('Pubblicare l’impronta corrente?', `${p.name}: ${kgTxt(r.total)} kg CO₂e/t (formula versione ${r.formula?.version}). ${snap ? 'La fotografia attiva diventa «superata» e resta nello storico (identificativi PACT precedenti).' : 'È la prima pubblicazione del prodotto.'}`,
    () => { const x = publishOps(d, p.id, { at: today }); if (x.ops.length && store.batch(x.ops, `Impronta pubblicata: ${p.name}`)) undoToast(`Impronta di ${p.name} pubblicata`); }, { ok: 'Pubblica' });
  const json = () => downloadJson(`scheda-ambientale-${p.code || p.id}`, { format: 'feedos-scheda-ambientale', v: 1, company: company.name || '', product: r.product, formula: { code: r.formula?.code, version: r.formula?.version }, period: r.period, date: r.date, code,
    sheet: greenFeedSheet(r), components: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v == null ? null : Math.round(v * 10) / 10])), flag: { luc: Math.round(r.luc), landMgmt: Math.round(r.landMgmt), nonFlag: Math.round(r.nonFlag) },
    landM2aPerT: Math.round(r.land), primaryShare: Math.round((r.primaryShare || 0) * 1000) / 10, dqr: r.dqr == null ? null : Math.round(r.dqr * 100) / 100, snapshot: snap ? { publishedAt: snap.publishedAt, hash: snap.hash } : null, hash: r.hash });
  const mi57 = () => { const m = mi57Package(d, p.id, P); if (m) { downloadJson(`mi57-${p.code || p.id}`, m.json); downloadCsv(`mi57-${p.code || p.id}`, m.csv, [{ label: 'Sezione', key: 'sezione' }, { label: 'Voce', key: 'voce' }, { label: 'Valore', key: 'valore' }, { label: 'Unità', key: 'unita' }, { label: 'Nota', key: 'nota' }]); } };
  return (
    <>
      <div className="row between no-print epc-bar">
        <div className="row gap-s">
          <Select value={p.id} onChange={v => go('esg', 'passaporto', v)} options={prods.map(x => ({ id: x.id, label: x.name }))} ariaLabel="Prodotto" className="epc-sel" />
          <Select value={lot} onChange={setLotId} options={[{ id: '', label: 'Formula in vigore' }, ...lots.map(l => ({ id: l.id, label: `Lotto ${l.code} · ${dateIt(l.date, 'dm')}` }))]} ariaLabel="Base del calcolo" className="epc-sel" />
        </div>
        <div className="row gap-s">
          <Btn small icon={LuSend} onClick={publish} disabled={!!r.lot} title={r.lot ? 'Si pubblica l’impronta della formula, non quella di un lotto' : undefined}>Pubblica l’impronta</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={json}>JSON</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={mi57} title="Dati di attività per uno strumento riconosciuto GMP+ MI5.7 (contiene la formula: uso interno)">Pacchetto MI5.7</Btn>
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa o PDF</Btn>
        </div>
      </div>
      {alert && <div className="note warn no-print epc-alert"><LuTriangleAlert aria-hidden="true" /> <b>Fotografia pubblicata da ricalcolare.</b> {alert.reasons.map(x => x.text).join('; ')}. Pubblicata il {dateIt(alert.snapshot.publishedAt)} con {kgTxt(alert.snapshot.total)} kg CO₂e/t, oggi {kgTxt(alert.current.total)}.</div>}
      <div className="passport epc-sheet" id="esg-passport">
        <div className="pp-head">
          <div><div className="eyebrow">Scheda ambientale del mangime · {company.name}</div><h2>{p.name}</h2>
            <div className="small muted">{p.form} · {p.packaging} · formula {r.formula?.code} versione {r.formula?.version}{r.formula?.date ? ` del ${dateIt(r.formula.date)}` : ''}{r.lot ? ` · lotto ${r.lot.code} del ${dateIt(r.lot.date)}` : ''}</div></div>
          <div className="pp-code"><span className="eyebrow">Codice</span><b className="mono">{code}</b><span className="xs muted">calcolata il {dateIt(r.date)}{snap ? ` · pubblicata il ${dateIt(snap.publishedAt)}` : ''}</span></div>
        </div>
        <div className="pp-grid">
          <div className="pp-big"><span className="eyebrow">Cambiamento climatico, dalla culla al cancello (stima)</span><b>{nf(r.total)}</b><span>kg CO₂e per tonnellata · P10–P90 {kgTxt(r.mc.p10)}–{kgTxt(r.mc.p90)}</span>
            <StackBar parts={parts} ariaLabel="Composizione dell’impronta" />
            <Legend items={parts.map(x => ({ label: `${x.label} ${kgTxt(x.value)}`, color: x.color }))} />
          </div>
          <div><span className="eyebrow">Uso del suolo (FLAG) e fossile</span>
            <StackBar parts={flag} ariaLabel="FLAG e non FLAG" />
            <Kv items={[['Cambio d’uso del suolo', `${kgTxt(r.luc)} kg CO₂e/t (${pctTxt(r.lucShare, 1)})`], ['Gestione del suolo', `${kgTxt(r.landMgmt)} kg CO₂e/t`], ['Non FLAG', `${kgTxt(r.nonFlag)} kg CO₂e/t`],
              ['Occupazione di suolo', `${nf(r.land)} m²·anno/t${r.landEstimatedShare > 0.05 ? ' (in parte stimata per categoria)' : ''}`], r.componentCoverage != null && r.componentCoverage < 0.999 ? ['Componenti note', `per il ${pctTxt(r.componentCoverage)} delle materie prime`] : null].filter(Boolean)} />
          </div>
          <div><span className="eyebrow">Circolarità e filiera</span>
            <Kv items={[['Residui dell’agroindustria', `${pctTxt(r.coShares.residuo, 1)} in peso`], ['Farine di estrazione', `${pctTxt(r.coShares['farina-oleosa'], 1)} in peso`],
              ['Ex prodotti alimentari', pctTxt(r.exFood, 1)], ['Proteine edibili dall’uomo', r.hep.value == null ? '—' : `${pctTxt(r.hep.value)} (scenario ${HEP_LABEL[r.hep.scenario]}; ${pctTxt(r.hep.low)}–${pctTxt(r.hep.high)})`],
              ['Soia senza deforestazione', r.soy.kg > 0 ? `${pctTxt(r.soy.dcfShare)} della soia · ${r.soy.basis}` : 'formula senza soia'],
              ['Origine delle materie prime', Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ORIG[k] || k} ${pctTxt(v)}`).join(' · ')]]} />
          </div>
          <div><span className="eyebrow">Dati, energia e imballaggio</span>
            <Kv items={[['Dati primari', `${pctTxt(r.primaryShare, 1)} dell’impronta`], ['Qualità del dato', <DqrChip q={r.dqr} />],
              ['Energia di stabilimento', `${nf(r.energy.kwhT, 1)} kWh/t · ${nf(r.energy.fuelT, 2)} kg GPL/t · fotovoltaico ${pctTxt(r.energy.pvShare, 1)} dell’elettricità`],
              ['Imballaggio', r.packaging.bulk ? 'sfuso, senza imballaggio' : `${nf(r.packaging.kgPerT, 1)} kg/t${r.packaging.recycledPct != null ? ` · riciclato ${nf(r.packaging.recycledPct)}%` : ''}${r.packaging.isDefault ? ' (peso di base)' : ''}`],
              ['Banche dati', r.dbVersions.join(', ') || '—']]} />
          </div>
          {legacy && <div><span className="eyebrow">Qualità e sicurezza</span>
            <Kv items={[['Lotti conformi all’etichetta (90 gg)', legacy.conf == null ? 'nessuna analisi' : `${nf(legacy.conf * 100)}% di ${legacy.nAn} analizzati`], ['Aflatossina B1 stimata', `${nf(legacy.afb1.value, 1)} µg/kg (limite ${legacy.afb1.limit})`],
              ['Ultimo lotto', legacy.lastLot ? `${legacy.lastLot.code} · ${dateIt(legacy.lastLot.date)}` : '—'], ['Tracciabilità', 'lotti di materia prima e clienti collegati a ogni lotto']]} />
          </div>}
          <div><span className="eyebrow">Altre categorie dell’impronta ambientale</span>
            <p className="small epc-m0">Calcolato solo il cambiamento climatico. Le altre 15 categorie (acidificazione, eutrofizzazione, uso dell’acqua, uso del suolo come indice di qualità, risorse fossili e minerali…) risultano <b>non calcolate</b>.</p>
          </div>
        </div>
        <p className="pp-note">Metodo: {r.method}, {BOUNDARY_LABEL[r.boundary] || r.boundary}; materie prime con i fattori del registro (origine, banca dati e anno), perdite di lavorazione {nf(r.lossPct, 1)}%, energia del mangimificio per linea con {EL_MODEL_LABEL[r.energy.model] || r.energy.model} (fattore: {r.energySource}), imballaggio dalla scheda della confezione; incertezza Monte Carlo ({nf(r.mc.n)} iterazioni). Stima interna, non verificata da terzi: serve a confrontare prodotti e scelte di formulazione e a rispondere ai clienti. Esercizio dell’energia: {P.label}.</p>
        <Disclaimer />
      </div>
      <Panel title="Da dove viene l’impronta" sub="Per materia prima: uso interno, non si stampa e non va ai clienti (le formule restano riservate)" className="no-print" flush
        actions={<Btn small kind="ghost" icon={LuDownload} onClick={() => downloadCsv(`impronta-righe-${p.code || p.id}`, r.lines, [{ label: 'Materia prima', key: 'name' }, { label: 'kg/t', value: l => Math.round(l.kg * 10) / 10 }, { label: 'Origine', value: l => l.origin || '' }, { label: 'Fattore kg CO₂e/t', value: l => l.ef }, { label: 'Fonte', key: 'efSource' }, { label: 'Banca dati', value: l => `${l.db || ''} ${l.dbVersion || ''}`.trim() }, { label: 'kg CO₂e/t prodotto', value: l => Math.round((l.raw + l.loss + l.tin) * 10) / 10 }, { label: 'di cui LUC', value: l => Math.round(l.luc * 10) / 10 }])}>CSV (riservato)</Btn>}>
        <Table rows={r.lines.map((l, i) => ({ ...l, id: `${l.ing}-${l.ingLotId || i}`, contrib: l.raw + l.loss + l.tin }))} pageSize={20} initialSort={{ key: 'contrib', dir: 'desc' }} cols={[
          { key: 'name', label: 'Materia prima', render: l => <><b>{l.name}</b>{l.ingLotId && <span className="sub">lotto {A(d.ingLots).find(x => x.id === l.ingLotId)?.code || l.ingLotId}</span>}</> },
          { key: 'kg', label: 'kg/t', align: 'r', render: l => nf(l.kg, 1) },
          { key: 'origin', label: 'Origine', render: l => <span className="small">{originLabel(l.origin)}{l.scheme ? ` · ${l.scheme}` : ''}{l.coc ? ` (${l.coc})` : ''}</span> },
          { key: 'ef', label: 'Fattore', align: 'r', render: l => (l.ef == null ? <Chip kind="crit">mancante</Chip> : nf(l.ef)) },
          { key: 'efSource', label: 'Fonte', render: l => <span className="row gap-s epc-nowrap"><SourceChip source={l.efSource} /><DqrChip q={l.dqr} /></span> },
          { key: 'contrib', label: 'kg CO₂e/t', align: 'r', render: l => <b>{kgTxt(l.contrib)}</b> },
          { key: 'luc', label: 'di cui LUC', align: 'r', render: l => (l.hasComp ? kgTxt(l.luc) : <span className="muted">—</span>) },
          { key: 'lin', label: '', nosort: true, render: l => <Lineage item={{ formula: `${nf(l.kg, 1)} kg/t × ${nf(l.ef ?? 0)} kg CO₂e/t ÷ 1.000${l.tin > 0 ? ' + trasporto' : ''}`, source: l.ref, year: l.year, quality: l.efSource === 'fornitore' ? 'misurato' : l.efSource === 'registro' ? 'calcolato' : l.efSource === 'anagrafica' ? 'default' : l.efSource === 'letteratura' ? 'stimato' : 'mancante', note: l.status ? `stato: ${l.status}` : null }} label="Dettagli" /> },
        ]} />
      </Panel>
      <Panel title="Pubblicazioni" sub="Ogni pubblicazione congela l’impronta con un’impronta digitale: è la base delle dichiarazioni e del JSON PACT" className="no-print" flush>
        {history.length ? <Table rows={history} pageSize={10} cols={[
          { key: 'publishedAt', label: 'Pubblicata', render: s => dateIt(s.publishedAt) },
          { key: 'formulaVersion', label: 'Formula', render: s => `versione ${s.formulaVersion}` },
          { key: 'total', label: 'kg CO₂e/t', align: 'r', render: s => <b>{kgTxt(s.total)}</b> },
          { key: 'band', label: 'P10–P90', align: 'r', render: s => (s.p10 != null ? `${kgTxt(s.p10)}–${kgTxt(s.p90)}` : '—') },
          { key: 'status', label: 'Stato', render: s => (s.status === 'attiva' ? <SnapChip snap={s} alert={alert && alert.snapshot.id === s.id ? alert : null} /> : <Chip kind="outline">superata</Chip>) },
          { key: 'hash', label: 'Impronta digitale', render: s => <span className="mono xs">{String(s.hash || '').slice(0, 16)}…</span> },
        ]} /> : <div className="epc-pad"><p className="small muted epc-m0">Nessuna pubblicazione: pubblica l’impronta per usarla nelle dichiarazioni ai clienti e nel JSON PACT.</p></div>}
      </Panel>
    </>
  );
}

/* ================= portafoglio ================= */
function Prodotti({ d, P, prev, S }) {
  const w = S.weighted;
  const wp = useMemo(() => (prev ? weightedPcf(d, prev) : null), [d, prev?.key]);
  const rows = S.products.map(x => ({ ...x, id: x.productId, total: x.r.total, luc: x.r.lucShare, dcf: x.r.soy.dcfShare, hep: x.r.hep.value, land: x.r.land, p10: x.r.mc.p10, p90: x.r.mc.p90, primary: x.r.primaryShare }));
  const max = Math.max(1, ...rows.map(x => x.p90 || x.total));
  const drivers = useMemo(() => {
    const m = new Map();
    const short = new Map(A(d.ingredients).map(i => [i.id, i.short || i.name]));
    for (const x of S.products) for (const l of x.r.lines) { const v = (x.t || 0) * (l.raw + l.loss + l.tin) / 1000; const k = short.get(l.ing) || l.name; m.set(k, (m.get(k) || 0) + v); }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value], i) => ({ key: label, label, value, color: i < 3 ? 'var(--s3)' : 'var(--s1)' }));
  }, [S]);
  const cmp = (cur, pv, good, kind = 'ratio', decimals = 0, unit = '') => (pv != null ? { value: pv, kind, good, decimals, unit, label: prev.label } : undefined);
  if (!rows.length) return <Panel title="Portafoglio"><Empty icon={LuWheat} title="Nessun prodotto con formula">Servono prodotti attivi collegati a formule con materie prime.</Empty></Panel>;
  const comp = w ? (() => { const acc = {}; let tt = 0; for (const x of S.products) { const t = x.t || 0; tt += t; for (const [k] of COMP) acc[k] = (acc[k] || 0) + t * (x.r.components[k] || 0); } return COMP.map(([k, label, color]) => ({ key: k, label, value: tt ? acc[k] / tt : 0, color })).filter(x => x.value > 0.05); })() : [];
  return (
    <>
      <div className="kpis" id="epc-kpis">
        <Kpi label="Impronta media dei mangimi prodotti" value={w ? nf(w.pcf) : '—'} unit="kg CO₂e/t" foot={w ? `${nf(w.t)} t prodotte · ponderata sulle versioni` : 'nessuna produzione'} cmp={w ? cmp(w.pcf, wp?.pcf, 'down') : undefined} raw={w?.pcf} />
        <Kpi label="Cambio d’uso del suolo" value={pctTxt(w?.lucShare, 1)} foot="quota dell’impronta" cmp={w && wp?.lucShare != null ? { value: wp.lucShare * 100, cur: w.lucShare * 100, kind: 'ratio', good: 'down', unit: 'pt', label: prev.label } : undefined} />
        <Kpi label="Dati primari" value={pctTxt(w?.primary, 1)} foot="energia misurata e impronte dei fornitori" />
        <Kpi label="Soia senza deforestazione" value={pctTxt(w?.dcfSoy, 1)} foot="nelle formule prodotte (stima)" />
        <Kpi label="Emissioni dei prodotti" value={w ? nf(w.tco2e) : '—'} unit="t CO₂e" foot={`${nf(w ? w.landHa : 0)} ha·anno di suolo`} />
        <Kpi label="Impronte da ricalcolare" value={nf(S.snapshots.outdated)} status={S.snapshots.outdated ? 'warn' : 'ok'} foot={`${S.snapshots.active} pubblicate`} />
      </div>
      <Panel title="Impronta per prodotto" sub={`kg CO₂e per tonnellata al cancello, formula in vigore · banda P10–P90 · produzione di ${P.label}`} flush>
        <Table rows={rows} onRow={x => go('esg', 'passaporto', x.productId)} initialSort={{ key: 'total', dir: 'desc' }} exportName="impronta-prodotti" cols={[
          { key: 'name', label: 'Prodotto', render: x => <><b>{x.name}</b><span className="sub">{x.form} · {x.packaging}</span></> },
          { key: 'total', label: 'kg CO₂e/t', align: 'r', render: x => <b>{kgTxt(x.total)}</b> },
          { key: 'band', label: 'P10–P90', nosort: true, csv: x => `${Math.round(x.p10)}-${Math.round(x.p90)}`, render: x => <Band p10={x.p10} p90={x.p90} value={x.total} max={max} /> },
          { key: 'luc', label: 'LUC', align: 'r', csv: x => (x.luc == null ? null : x.luc * 100), render: x => pctTxt(x.luc) },
          { key: 'dcf', label: 'Soia DCF', align: 'r', csv: x => (x.dcf == null ? null : x.dcf * 100), render: x => (x.dcf == null ? <span className="muted">—</span> : pctTxt(x.dcf)) },
          { key: 'hep', label: 'Proteine edibili', align: 'r', csv: x => (x.hep == null ? null : x.hep * 100), render: x => pctTxt(x.hep) },
          { key: 'land', label: 'm²·anno/t', align: 'r', render: x => nf(x.land) },
          { key: 't', label: 't prodotte', align: 'r', render: x => nf(x.t) },
          { key: 'tco2e', label: 't CO₂e', align: 'r', render: x => tTxt(x.tco2e) },
          { key: 'stato', label: 'Pubblicazione', csv: x => (x.snapshot ? (x.alert ? 'da ricalcolare' : 'pubblicata') : 'non pubblicata'), render: x => <SnapChip snap={x.snapshot} alert={x.alert} /> },
        ]} foot={w ? <><td><b>Media ponderata</b></td><td className="r"><b>{nf(w.pcf)}</b></td><td /><td className="r">{pctTxt(w.lucShare)}</td><td className="r">{pctTxt(w.dcfSoy)}</td><td /><td className="r">{nf(w.land)}</td><td className="r">{nf(w.t)}</td><td className="r">{tTxt(w.tco2e)}</td><td /></> : null} />
      </Panel>
      <div className="split">
        <Panel title="Composizione media" sub="kg CO₂e per t, ponderata sulla produzione">
          {comp.length ? <><StackBar parts={comp} ariaLabel="Composizione media dell’impronta" /><Legend items={comp.map(x => ({ label: `${x.label} ${kgTxt(x.value)}`, color: x.color }))} /></> : <p className="small muted">Nessuna produzione nel periodo.</p>}
          <p className="small muted">Le materie prime pesano quasi tutta l’impronta: le leve sono la scelta delle origini, la soia senza deforestazione e i coprodotti (sezione Formulazione).</p>
        </Panel>
        <Panel title="Dove si concentra l’impronta" sub="t CO₂e per materia prima nella produzione del periodo · uso interno" className="no-print">
          {drivers.length ? <Bars data={drivers} unit="t" decimals={0} ariaLabel="Emissioni per materia prima" /> : <p className="small muted">Nessuna produzione nel periodo.</p>}
        </Panel>
      </div>
      <MethodNote text={PCF_METHOD} />
    </>
  );
}

/* ================= metodo e impostazioni ================= */
function Metodo({ d, S }) {
  const s = S.settings;
  const set = (patch, label) => setEsgSettings('pcf', patch, label);
  const lit = packList(d, 'materia');
  const pk = packInfo(d);
  return (
    <>
      <Panel title="Impostazioni del calcolo" sub="Valgono per tutte le schede, le dichiarazioni e le esportazioni del pacchetto">
        <div className="epc-segs">
          <Field label="Confini del sistema"><Seg options={[{ id: 'culla-cancello', label: 'Al cancello' }, { id: 'culla-cliente', label: 'Con la consegna' }]} value={s.includeOutbound ? 'culla-cliente' : 'culla-cancello'}
            onChange={v => set({ includeOutbound: v === 'culla-cliente' }, v === 'culla-cliente' ? 'Impronta: consegna al cliente inclusa' : 'Impronta: confini al cancello del mangimificio')} label="Confini" /></Field>
          <Field label="Elettricità"><Seg options={[{ id: 'rete-LB-meno-FV', label: 'Rete meno fotovoltaico' }, { id: 'rete-LB', label: 'Tutta da rete' }]} value={s.elModel} onChange={v => set({ elModel: v }, 'Impronta: modello dell’elettricità')} label="Modello dell’elettricità" /></Field>
          <Field label="Proteine edibili dall’uomo"><Seg options={[{ id: 'low', label: 'Basso' }, { id: 'med', label: 'Medio' }, { id: 'high', label: 'Alto' }]} value={s.hepScenario} onChange={v => set({ hepScenario: v }, 'Impronta: scenario delle proteine edibili')} label="Scenario" /></Field>
          <Field label="Nome del metodo" className="epc-grow"><input className="input" value={s.method} maxLength={80} onChange={e => set({ method: e.target.value || PCF_DEFAULTS.method }, 'Impronta: nome del metodo')} /></Field>
        </div>
        <div className="form epc-mt">
          <Field label="Calo di lavorazione di base (%)" hint="se il prodotto non ha il suo calo"><NumInput value={s.lossDefault} decimals={2} min={0} max={10} onChange={v => v != null && set({ lossDefault: v }, 'Impronta: calo di base')} /></Field>
          <Field label="Iterazioni Monte Carlo" hint="da 100 a 2.000"><NumInput value={s.mcN} decimals={0} min={100} max={2000} onChange={v => v != null && set({ mcN: Math.max(100, Math.min(2000, Math.round(v))) }, 'Impronta: iterazioni Monte Carlo')} /></Field>
          <Field label="Ricalcolo: origine (punti)"><NumInput value={s.recalcOriginPp} decimals={0} min={1} max={50} onChange={v => v != null && set({ recalcOriginPp: v }, 'Impronta: soglia di ricalcolo per origine')} /></Field>
          <Field label="Ricalcolo: energia (%)"><NumInput value={s.recalcEnergyPct} decimals={0} min={1} max={50} onChange={v => v != null && set({ recalcEnergyPct: v }, 'Impronta: soglia di ricalcolo per energia')} /></Field>
        </div>
      </Panel>
      <Panel title="Nota metodologica"><MethodNote text={PCF_METHOD} open title="Testo in italiano" /><MethodNote text={PCF_METHOD} lang="en" title="Methodology note (English)" /></Panel>
      <Panel title="Valori di letteratura del pacchetto" sub={`Pacchetto «pcf» ${pk.version} valido al ${dateIt(pk.validAsOf)} (${pk.origin}) · nessun valore GFLI incluso: si importano dall’esportazione GFLI`} flush>
        <Table rows={lit} pageSize={15} exportName="impronta-letteratura" cols={[
          { key: 'label', label: 'Materia prima', render: x => <><b>{x.label}</b>{x.note && <span className="sub">{x.note}</span>}</> },
          { key: 'total', label: 'kg CO₂e/t', align: 'r', render: x => nf(x.total) },
          { key: 'luc', label: 'di cui LUC', align: 'r', render: x => nf(x.luc) },
          { key: 'range', label: 'Intervallo', nosort: true, csv: x => `${x.low}-${x.high}`, render: x => `${nf(x.low)}–${nf(x.high)}` },
          { key: 'source', label: 'Fonte', render: x => <span className="small epc-wrap">{x.source} ({x.year})</span> },
          { key: 'status', label: 'Stato', render: x => <StatusChip status={x.status} /> },
        ]} />
      </Panel>
      <Disclaimer />
    </>
  );
}
