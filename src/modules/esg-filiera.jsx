/* FeedOS 18 · ESG › EUDR e fornitori (pacchetto WP3 «filiera»): sottosezioni (#esg.filiera.<id>) panoramica · ruolo · materie ·
 * lotti (e lotto.<id>) · soia · bilancio-dcf · fornitori · moduli · clienti.
 * Contratto: FilieraPage({ d, route }) disegna la scheda (titolo e schede le disegna esg.jsx); FilieraCard({ d }) è il riquadro del
 * cruscotto ESG; SupplierEsg({ d, id }) è la sezione della scheda fornitore. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod.
 * Prefisso CSS e DOM efl-. Scritture solo con store.batch / store.update e un'etichetta italiana. */
import React, { useMemo, useState } from 'react';
import { LuGlobe, LuCircleCheck, LuTriangleAlert, LuArrowRight, LuUpload, LuSave, LuListChecks, LuShieldCheck, LuSend, LuPencil } from 'react-icons/lu';
import { store, closeDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, addDays, addMonths, daysBetween } from '../core/util.js';
import { readFile } from '../core/io.js';
import { currentPeriod, sectorOf } from '../engine/esg-years.js';
import { applyPackOps } from '../engine/esg-packs.js';
import { DEFAULT_RISK_WEIGHTS, filieraSummary, filieraSignals, filieraSettings, filieraPack, companyRole, eudrRole, eudrDeadlines, classification, packList, supplierEsgScore, EUDR_ROLES, FILIERA_METHOD, FILIERA_TAB } from '../engine/esg-filiera.js';
import { PACK_FILIERA, COUNTRY_NAMES } from '../data/pack-filiera.js';
import { EUDR_COMMODITY_OPTIONS } from '../data/fields-filiera.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, Kv, NumInput, SearchBox, filterRows } from '../ui/ui.jsx';
import { SignalList } from './shared.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, StatusChip, MethodNote, Disclaimer, EsgCard, setEsgSettings } from './esg-shared.jsx';
import { pctTxt, tTxt, undoToast, BandChip, shortName } from './esg-filiera-ui.jsx';
import { Lotti, LottoDettaglio, Soia, BilancioDcf } from './esg-filiera-lotti.jsx';
import { Fornitori, Moduli, Clienti } from './esg-filiera-rete.jsx';

const SECTIONS = [['panoramica', 'Panoramica'], ['ruolo', 'Ruolo e scadenze'], ['materie', 'Materie prime'], ['lotti', 'Lotti e DDS'], ['soia', 'Soia'], ['bilancio-dcf', 'Bilancio DCF'],
  ['fornitori', 'Fornitori ESG'], ['moduli', 'Moduli fornitori'], ['clienti', 'Lettere ai clienti']];
const SOY_ONLY = ['soia', 'bilancio-dcf'];

/** Scheda ESG › EUDR e fornitori. */
export function FilieraPage({ d, route }) {
  const { P, prev, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const S = useMemo(() => filieraSummary(d, P), [d, P.key]);
  const sig = useMemo(() => filieraSignals(d, { today }), [d, today]);
  const soyVisible = sectorOf(d) === 'mangimi' || [...classification(d).values()].some(k => k.commodity === 'soia');
  const items = SECTIONS.filter(([id]) => soyVisible || !SOY_ONLY.includes(id));
  const [sec, ...rest] = String(route?.id || 'panoramica').split('.');
  const arg = rest.join('.');
  const sub = sec === 'lotto' ? 'lotti' : items.some(([id]) => id === sec) ? sec : 'panoramica';
  const badge = { lotti: S.lots.recentMissing || null, moduli: S.requests.overdue || null, fornitori: S.suppliers.capaOverdue + S.suppliers.reviewsDue || null, materie: S.classification.toConfirm || null };
  const props = { d, P, prev, S, today };
  return (
    <div className="efl" id="efl-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={items.map(([id, label]) => ({ id, label, badge: badge[id] }))} value={sub} tab="filiera" label="Sezioni di EUDR e fornitori" />
      {sec === 'lotto' && arg ? <LottoDettaglio {...props} id={arg} /> : <>
        {sub === 'panoramica' && <Panoramica {...props} sig={sig} />}
        {sub === 'ruolo' && <Ruolo {...props} />}
        {sub === 'materie' && <Materie {...props} />}
        {sub === 'lotti' && <Lotti {...props} />}
        {sub === 'soia' && <Soia {...props} />}
        {sub === 'bilancio-dcf' && <BilancioDcf {...props} />}
        {sub === 'fornitori' && <Fornitori {...props} />}
        {sub === 'moduli' && <Moduli {...props} pick={arg} />}
        {sub === 'clienti' && <Clienti {...props} pick={arg} />}
      </>}
    </div>
  );
}

/** Riquadro del cruscotto ESG: quota delle materie in ambito con DDS, conto alla rovescia, segnale principale. */
export function FilieraCard({ d }) {
  const P = currentPeriod(d);
  const S = filieraSummary(d, P);
  const today = appToday(d);
  const sig = filieraSignals(d, { today });
  if (!S || !S.lots.n) return <EsgCard title="EUDR e fornitori" tab="filiera" icon={LuGlobe} value="—" sub="Classifica le materie prime in ambito (soia, palma) e registra i riferimenti DDS dei lotti di arrivo." />;
  const top = sig.find(x => x.severity === 'critico') || sig.find(x => x.severity === 'attenzione') || null;
  const status = sig.some(x => x.severity === 'critico') ? 'bad' : sig.some(x => x.severity === 'attenzione') ? 'warn' : 'ok';
  const dl = S.deadline;
  return (
    <EsgCard title="EUDR e fornitori" tab="filiera" icon={LuGlobe} value={pctTxt(S.lots.refShare)} unit="con DDS" status={status} chip={<Chip kind="outline">{P.short}</Chip>}
      sub={`${dl ? (dl.past ? `in applicazione dal ${dateIt(dl.date)}` : `${dateIt(dl.date)}: tra ${dl.days} giorni`) : 'nessuna scadenza'} · ${S.lots.recentMissing ? `${S.lots.recentMissing} arrivi recenti senza DDS` : 'arrivi recenti completi'}`}>
      {top && <p className="efl-card-sig">{top.title}</p>}
    </EsgCard>
  );
}

/* ================= panoramica ================= */
function Panoramica({ d, P, S, sig }) {
  const dl = S.deadline, soy = S.soy?.purchase;
  const ready = [
    { ok: S.role.confirmed, label: 'Ruolo EUDR confermato', note: S.role.confirmed ? S.role.label : `proposta: ${S.role.label}`, go: 'ruolo' },
    { ok: S.classification.toConfirm === 0, label: 'Materie prime classificate', note: S.classification.toConfirm ? `${S.classification.toConfirm} da confermare` : `${S.classification.inScope} in ambito, tutte confermate`, go: 'materie' },
    { ok: S.lots.refShare != null && S.lots.refShare >= 0.95, label: 'Riferimenti DDS dei lotti del periodo', note: `${pctTxt(S.lots.refShare)} delle tonnellate · ${S.lots.n - S.lots.nWithRef} lotti senza`, go: 'lotti' },
    { ok: S.lots.recentMissing === 0, label: 'Arrivi recenti completi', note: S.lots.recentMissing ? `${S.lots.recentMissing} lotti (${tTxt(S.lots.recentMissingT)} t) senza riferimento` : 'nessun arrivo recente senza riferimento', go: 'lotti' },
    { ok: S.lots.nHighRisk === 0, label: 'Nessun lotto da paesi ad alto rischio', note: S.lots.nHighRisk ? `${S.lots.nHighRisk} lotti da attenuare` : 'classificazione dei paesi UE', go: 'lotti' },
    { ok: !S.dcf.negative, label: 'Registro della soia DCF positivo', note: S.dcf.n ? `saldo ${nf(S.dcf.balance, 1)} t` : 'nessun movimento registrato', go: 'bilancio-dcf' },
    { ok: S.requests.overdue === 0, label: 'Richieste ai fornitori nei tempi', note: `${S.requests.open} aperte${S.requests.overdue ? `, ${S.requests.overdue} in ritardo` : ''}`, go: 'moduli' },
  ];
  return (
    <>
      <section className="efl-hero" aria-label="Applicazione del regolamento">
        <div className="efl-count">
          <span className="eyebrow">Regolamento UE sulla deforestazione</span>
          {dl ? <><b>{dl.past ? 'in vigore' : nf(dl.days)}</b><span>{dl.past ? `dal ${dateIt(dl.date)}` : `giorni al ${dateIt(dl.date, 'long')}`}</span></> : <b>—</b>}
          <small>{dl?.label}</small>
        </div>
        <div className="efl-hero-role">
          <span className="eyebrow">Ruolo dell’azienda</span>
          <p className="efl-role">{S.role.label} {S.role.confirmed ? <Chip kind="good">confermato</Chip> : <Chip kind="warn">da confermare</Chip>}</p>
          {S.role.alsoOperator && <p className="small">Per i lotti importati direttamente l’azienda è <b>operatore</b>: DDS propria e geolocalizzazione degli appezzamenti.</p>}
          <p className="small muted">{EUDR_ROLES[S.role.role]?.desc}</p>
          <Btn small icon={LuArrowRight} onClick={() => go('esg', 'filiera', 'ruolo')}>Ruolo, obblighi e scadenze</Btn>
        </div>
      </section>
      <div className="kpis" id="efl-kpis">
        <Kpi label="Materie in ambito con riferimento DDS" value={pctTxt(S.lots.refShare)} status={S.lots.refShare == null ? undefined : S.lots.refShare >= 0.95 ? 'ok' : S.lots.refShare >= 0.8 ? 'warn' : 'bad'} target="95%" foot={`${nf(S.lots.nWithRef)} di ${nf(S.lots.n)} lotti · ${tTxt(S.lots.t)} t`} onClick={() => go('esg', 'filiera', 'lotti')} />
        <Kpi label="Soia DCF fisica" value={pctTxt(soy?.dcf, 1)} foot={`più ${pctTxt(soy?.dcfMB, 1)} in bilancio di massa`} onClick={() => go('esg', 'filiera', 'soia')} />
        <Kpi label="Soia conforme FEFAC SSG" value={pctTxt(soy?.ssg)} foot="benchmark SSG 2021 o 2023" />
        <Kpi label="Crediti di soia (book and claim)" value={tTxt(S.credits.t)} unit="t" foot="riportati a parte: non cambiano l’origine" />
        <Kpi label="Arrivi recenti senza DDS" value={nf(S.lots.recentMissing)} status={S.lots.recentMissing ? 'warn' : 'ok'} foot="ultimi 45 giorni" onClick={() => go('esg', 'filiera', 'lotti')} />
        <Kpi label="Spesa con fornitori valutati ESG" value={pctTxt(S.suppliers.spendAssessed)} foot={`${S.suppliers.assessed} di ${S.suppliers.n} fornitori`} onClick={() => go('esg', 'filiera', 'fornitori')} />
      </div>
      <div className="split">
        <Panel title="Da fare" sub="Segnali della filiera (gli stessi di Oggi)" flush>
          <SignalList items={sig} limit={6} emptyText="Nessun lotto senza riferimento, nessuna richiesta in ritardo." />
        </Panel>
        <Panel title="Prontezza EUDR" sub={`${P.label} · ${pctTxt(S.lots.readiness)} delle tonnellate in ambito con dati completi`}>
          <ul className="efl-ready">
            {ready.map(x => (
              <li key={x.label}>
                {x.ok ? <LuCircleCheck className="efl-ok" aria-label="in regola" /> : <LuTriangleAlert className="efl-warn" aria-label="da completare" />}
                <button type="button" className="linkish" onClick={() => go('esg', 'filiera', x.go)}><b>{x.label}</b></button>
                <span className="small muted">{x.note}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Metodo e limiti">
        <MethodNote text={FILIERA_METHOD} title="Nota metodologica" />
        <p className="small muted">Contenuti normativi: pacchetto «filiera» {S.pack.version} valido al {dateIt(S.pack.validAsOf)} ({S.pack.origin}). FeedOS non deposita dichiarazioni nel sistema TRACES e non esegue verifiche satellitari.</p>
        <Disclaimer />
      </Panel>
    </>
  );
}

/* ================= ruolo, obblighi e scadenze ================= */
const SIZE_HELP = 'Micro o piccola impresa se non supera due di tre soglie (Dir. 2013/34/UE aggiornata nel 2023): 50 dipendenti, 15 M€ di ricavi netti, 7,5 M€ di totale attivo. Valori da verificare con il consulente.';
function Ruolo({ d, today }) {
  const st = filieraSettings(d);
  const cur = companyRole(d);
  const [a, setA] = useState({ imports: st.answers?.imports || 'mai', resellsAsSuch: !!st.answers?.resellsAsSuch, firstDownstream: !!st.answers?.firstDownstream, size: st.size || 'grande-media', note: st.roleNote || '' });
  const set = p => setA(x => ({ ...x, ...p }));
  const prop = eudrRole({ imports: a.imports, resellsAsSuch: a.resellsAsSuch, firstDownstream: a.firstDownstream }, { size: a.size, pack: filieraPack(d), sector: sectorOf(d) });
  const confirm = () => {
    setEsgSettings('filiera', { role: prop.role, roleConfirmedAt: today, size: a.size, answers: { imports: a.imports, resellsAsSuch: a.resellsAsSuch, firstDownstream: a.firstDownstream }, roleNote: a.note.trim() }, `EUDR: ruolo «${prop.label}» confermato`);
    undoToast('Ruolo EUDR confermato');
  };
  const deadlines = [...eudrDeadlines(d, today), ...packList(d, 'controllo').map(x => ({ ...x, days: daysBetween(today, x.date), past: x.date < today }))].sort((x, y) => (x.date < y.date ? -1 : 1));
  const pack = filieraPack(d);
  const yn = (v, on) => <Seg options={[{ id: 'si', label: 'Sì' }, { id: 'no', label: 'No' }]} value={v ? 'si' : 'no'} onChange={x => on(x === 'si')} />;
  return (
    <>
      <div className="split">
        <Panel title="Quale ruolo ha l’azienda?" sub="Albero decisionale del Reg. (UE) 2023/1115 come modificato dal Reg. (UE) 2025/2650: FeedOS propone, l’azienda conferma">
          <div className="efl-quiz">
            <div className="efl-q"><span>Importate direttamente soia, palma o loro derivati da paesi extra-UE, come dichiaranti in dogana?</span>
              <Seg options={[{ id: 'mai', label: 'Mai' }, { id: 'occasionale', label: 'A volte' }, { id: 'abituale', label: 'Di solito' }]} value={a.imports} onChange={v => set({ imports: v })} label="Importazioni dirette" /></div>
            <div className="efl-q"><span>Rivendete materie prime in ambito tal quali, senza trasformarle (per esempio farina di soia ad allevatori)?</span>{yn(a.resellsAsSuch, v => set({ resellsAsSuch: v }))}</div>
            {a.resellsAsSuch && <div className="efl-q"><span>Le comprate direttamente dall’operatore che le ha immesse sul mercato dell’UE?</span>{yn(a.firstDownstream, v => set({ firstDownstream: v }))}</div>}
            <div className="efl-q"><span>Dimensione dell’impresa <small className="muted">· {SIZE_HELP}</small></span>
              <Seg options={[{ id: 'grande-media', label: 'Grande o media' }, { id: 'micro-piccola', label: 'Micro o piccola' }]} value={a.size} onChange={v => set({ size: v })} label="Dimensione" /></div>
            <Field label="Nota sul ruolo (resta nelle impostazioni)"><textarea className="input efl-ta" rows={3} value={a.note} onChange={e => set({ note: e.target.value })} /></Field>
          </div>
        </Panel>
        <Panel title={`Proposta: ${prop.label}`} sub={`Si applica dal ${dateIt(prop.applicableFrom)} · ${prop.size === 'micro-piccola' ? 'micro e piccole imprese' : 'imprese grandi e medie'}`}
          actions={<Btn small kind="primary" icon={LuShieldCheck} onClick={confirm}>Conferma il ruolo</Btn>}>
          <p className="small">{prop.desc}</p>
          <ol className="efl-path">{prop.path.map(x => <li key={x}>{x}</li>)}</ol>
          {cur.confirmed && <p className="small muted">Ruolo confermato in archivio: <b>{cur.label}</b>{cur.confirmedAt ? ` (dal ${dateIt(cur.confirmedAt)})` : ''}{cur.role !== prop.role ? ' · diverso dalla proposta attuale' : ''}.</p>}
          <h3 className="efl-h3">Obblighi</h3>
          <ul className="efl-duties">
            {prop.duties.map(x => <li key={x.id}><span>{x.text}</span><span className="xs muted">{x.law}{x.practice ? ' · buona pratica' : ''}</span> {x.status === 'da verificare' && <StatusChip status="da verificare" />}</li>)}
          </ul>
          <p className="xs muted">{prop.source} · la scelta del ruolo resta dell’azienda: verificarla con il consulente legale.</p>
        </Panel>
      </div>
      <div className="split">
        <Panel title="Scadenze" sub={`Pacchetto «filiera» ${pack.version} · valido al ${dateIt(pack.validAsOf)}`} flush>
          <Table rows={deadlines} rowKey={x => x.id} pageSize={20} exportName="eudr-scadenze" cols={[
            { key: 'date', label: 'Data', render: x => dateIt(x.date) },
            { key: 'label', label: 'Scadenza', render: x => <span className="efl-wrap">{x.label}<span className="sub">{x.law}</span></span>, csv: x => x.label },
            { key: 'days', label: 'Giorni', align: 'r', render: x => (x.past ? <Chip kind="outline">trascorsa</Chip> : <Chip kind={x.days <= 30 ? 'warn' : 'accent'}>{nf(x.days)}</Chip>), csv: x => x.days },
            { key: 'status', label: 'Stato', render: x => <StatusChip status={x.status} /> },
          ]} />
        </Panel>
        <PaesiPanel d={d} />
      </div>
      <PackPanel d={d} />
      <PesiPanel d={d} />
    </>
  );
}
function PaesiPanel({ d }) {
  const tiers = packList(d, 'rischio-paesi');
  const name = c => COUNTRY_NAMES[c] || c;
  return (
    <Panel title="Classificazione dei paesi" sub="Rischio di deforestazione per paese di produzione: i paesi non elencati sono a rischio standard">
      <div className="efl-tiers">
        {tiers.filter(x => !x.all).map(x => (
          <div key={x.id} className={`efl-tier efl-tier-${x.tier}`}>
            <div className="row between"><b>Rischio {x.tier}</b><StatusChip status={x.status} /></div>
            <p className="small">{x.countries.length > 12 ? `${x.countries.slice(0, 12).map(name).join(', ')} e altri ${x.countries.length - 12}` : x.countries.map(name).join(', ')}</p>
            <span className="xs muted">{x.source}{x.from ? ` · dal ${dateIt(x.from)}` : ''}{x.note ? ` · ${x.note}` : ''}</span>
          </div>
        ))}
      </div>
      {tiers.some(x => x.all) && <p className="xs muted">{tiers.find(x => x.all).label} ({tiers.find(x => x.all).source}).</p>}
    </Panel>
  );
}
function PackPanel({ d }) {
  const [res, setRes] = useState(null);
  const p = filieraPack(d);
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const r = applyPackOps(d, await readFile(f), PACK_FILIERA);
    if (r.ok && r.pack?.pack !== 'filiera') { setRes({ ok: false, errors: [`Il file è il pacchetto «${r.pack.pack}», non «filiera».`] }); return; }
    setRes(r);
  };
  const apply = () => { store.batch(res.ops, `Pacchetto di contenuti «filiera» ${res.pack.version} importato`); undoToast('Pacchetto importato'); setRes(null); };
  return (
    <Panel title="Contenuti normativi" sub={`Pacchetto in uso: ${p.version} (${p.origin}), valido al ${dateIt(p.validAsOf)} · ${p.items.length} voci: paesi, codici NC, schemi, scadenze, obblighi`}
      actions={<label className="btn small"><LuUpload aria-hidden="true" />Importa un pacchetto più recente<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>}>
      <p className="small muted">Le voci «da verificare» vanno controllate sulle fonti ufficiali. Un pacchetto importato vale solo se la sua versione è più recente di quella integrata.</p>
      {res && !res.ok && <div className="note crit small">{res.errors.join(' · ')}</div>}
      {res && res.ok && (
        <div className="note small">
          Pacchetto {res.pack.version} valido al {dateIt(res.pack.validAsOf)}: {res.diff.added.length} voci nuove, {res.diff.changed.length} modificate, {res.diff.removed.length} tolte.
          <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} onClick={apply}>Usa questo pacchetto</Btn><Btn small kind="ghost" onClick={() => setRes(null)}>Annulla</Btn></div>
        </div>
      )}
    </Panel>
  );
}

const W_LABEL = { country: 'Rischio paese', commodity: 'Materia prima in ambito', coc: 'Catena di custodia', cert: 'Certificazione', missing: 'Dati mancanti' };
function PesiPanel({ d }) {
  const cur = filieraSettings(d).riskWeights || DEFAULT_RISK_WEIGHTS;
  const [w, setW] = useState({ ...DEFAULT_RISK_WEIGHTS, ...cur });
  const tot = Object.values(w).reduce((a, x) => a + (+x || 0), 0);
  const save = v => { setEsgSettings('filiera', st => ({ ...st, riskWeights: v }), 'EUDR: pesi del punteggio di rischio'); undoToast('Pesi salvati'); };
  return (
    <Panel title="Pesi del punteggio di rischio interno" sub="Il punteggio resta su 100 qualunque sia la somma dei pesi · di base 40, 20, 15, 15, 10">
      <div className="form">{Object.keys(DEFAULT_RISK_WEIGHTS).map(k => <Field key={k} label={W_LABEL[k]}><NumInput value={w[k]} onChange={x => setW(o => ({ ...o, [k]: x ?? 0 }))} decimals={0} min={0} max={100} /></Field>)}</div>
      <div className="row gap-s efl-mt">
        <Btn small kind="primary" icon={LuSave} disabled={!(tot > 0)} onClick={() => save(w)}>Salva i pesi</Btn>
        <Btn small kind="ghost" onClick={() => { setW({ ...DEFAULT_RISK_WEIGHTS }); save({ ...DEFAULT_RISK_WEIGHTS }); }}>Valori di base</Btn>
        <span className="small muted">Somma attuale {nf(tot)}</span>
      </div>
    </Panel>
  );
}

/* ================= classificazione delle materie prime ================= */
const SRC_KIND = { confermato: 'good', suggerito: 'warn', 'nessuna corrispondenza': 'outline' };
function Materie({ d, today }) {
  const cls = [...classification(d).values()];
  const [f, setF] = useState('ambito');
  const [q, setQ] = useState('');
  const [ed, setEd] = useState(null);
  const rows = filterRows(cls.filter(k => (f === 'tutte' ? true : f === 'ambito' ? k.inScope || k.suggestion?.commodity : !k.confirmed && k.suggestion?.commodity)), q, [k => k.ing?.name, k => k.ing?.code, 'commodity', 'hs']);
  const toConfirm = cls.filter(k => !k.confirmed && k.suggestion?.commodity);
  const row = k => ({ id: k.ingId, commodity: k.commodity, hs: k.hs || null, inScope: !!k.inScope, note: k.suggestion?.label || '', confirmedAt: today, by: 'Classificazione suggerita da FeedOS, confermata' });
  const confirmAll = () => { store.batch([{ kind: 'upsertMany', coll: 'eudrItems', key: 'id', objs: toConfirm.map(row) }], `EUDR: ${toConfirm.length} classificazioni confermate`); undoToast('Classificazioni confermate'); };
  const one = (k, inScope) => { store.batch([{ kind: 'upsertMany', coll: 'eudrItems', key: 'id', objs: [{ ...row(k), inScope, ...(inScope ? {} : { commodity: k.commodity, note: 'Fuori ambito per scelta dell’azienda' }) }] }], `EUDR: ${k.ing?.name} ${inScope ? 'in ambito' : 'fuori ambito'}`); undoToast('Classificazione registrata'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Materie prime in ambito" value={nf(cls.filter(k => k.inScope).length)} foot={`su ${nf(cls.length)} in anagrafica`} />
        <Kpi label="Classificazioni confermate" value={nf(cls.filter(k => k.confirmed).length)} />
        <Kpi label="Suggerimenti da confermare" value={nf(toConfirm.length)} status={toConfirm.length ? 'warn' : 'ok'} foot="regola R34 della qualità dei dati" />
      </div>
      <Panel title="Classificazione EUDR delle materie prime" sub="Codici NC dell’allegato I suggeriti dal nome (parole chiave del pacchetto «filiera») e confermati dall’azienda: sostituiscono la ricerca della parola «soia»" flush
        actions={<>
          <Select value={f} onChange={setF} ariaLabel="Filtro" options={[{ id: 'ambito', label: 'In ambito o simili' }, { id: 'conferma', label: 'Da confermare' }, { id: 'tutte', label: 'Tutte' }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Cerca materia prima" />
          {toConfirm.length > 0 && <Btn small kind="primary" icon={LuListChecks} onClick={confirmAll}>Conferma tutti ({toConfirm.length})</Btn>}
        </>}>
        <Table rows={rows} rowKey={k => k.ingId} pageSize={40} exportName="eudr-classificazione" onRow={k => setEd(k.ingId)} cols={[
          { key: 'name', label: 'Materia prima', render: k => <span><b>{k.ing?.name}</b><span className="sub">{k.ing?.code} · {k.ing?.category}</span></span>, csv: k => k.ing?.name, sort: k => k.ing?.name },
          { key: 'commodity', label: 'Prodotto EUDR', render: k => (k.commodity ? <Chip kind="accent">{k.commodity}</Chip> : '—') },
          { key: 'hs', label: 'Codice NC', render: k => (k.hs ? <span className="code">{k.hs}</span> : '—') },
          { key: 'inScope', label: 'In ambito', render: k => (k.inScope ? <Chip kind="warn">sì</Chip> : k.futureFrom ? <Chip kind="outline">dal {dateIt(k.futureFrom)}</Chip> : 'no'), csv: k => (k.inScope ? 'sì' : 'no') },
          { key: 'sug', label: 'Suggerimento', render: k => (k.suggestion ? <span className="efl-wrap">{k.suggestion.label}<span className="sub">parola «{k.suggestion.keyword}»{k.suggestion.status === 'da verificare' ? ' · da verificare' : ''}</span></span> : <span className="muted">nessuna corrispondenza</span>), csv: k => k.suggestion?.label || '' },
          { key: 'source', label: 'Stato', render: k => <Chip kind={SRC_KIND[k.source]}>{k.source}</Chip> },
          { key: 'act', label: '', nosort: true, csv: false, render: k => (k.suggestion?.commodity || k.confirmed ? (
            <span className="row gap-s efl-nowrap" onClick={e => e.stopPropagation()}>
              {(!k.confirmed || !k.inScope) && k.suggestion?.commodity && <Btn small onClick={() => one(k, true)}>Conferma</Btn>}
              {(k.inScope || !k.confirmed) && <Btn small kind="ghost" onClick={() => one(k, false)}>Fuori ambito</Btn>}
            </span>) : null) },
        ]} />
      </Panel>
      {ed && <EditItem key={ed} d={d} k={classification(d).get(ed)} today={today} onClose={() => setEd(null)} />}
    </>
  );
}
function EditItem({ d, k, today, onClose }) {
  const [v, setV] = useState({ commodity: k?.commodity || '', hs: k?.hs || '', inScope: !!k?.inScope, note: k?.row?.note || '' });
  if (!k) return null;
  const save = () => {
    store.batch([{ kind: 'upsertMany', coll: 'eudrItems', key: 'id', objs: [{ id: k.ingId, commodity: v.commodity || null, hs: v.hs.trim() || null, inScope: v.inScope && !!v.commodity, note: v.note.trim(), confirmedAt: today, by: 'Ufficio acquisti' }] }], `EUDR: classificazione di ${k.ing?.name}`);
    undoToast('Classificazione salvata'); onClose();
  };
  return (
    <Panel title={`Classificazione di ${k.ing?.name}`} sub="Prodotto EUDR, codice NC e ambito: la scelta dell’azienda vale sul suggerimento" actions={<Btn small kind="ghost" onClick={onClose}>Chiudi</Btn>}>
      <div className="form">
        <Field label="Prodotto EUDR"><Select value={v.commodity} onChange={x => setV(o => ({ ...o, commodity: x }))} options={[{ id: '', label: '— nessuno —' }, ...EUDR_COMMODITY_OPTIONS.map(x => ({ id: x, label: x }))]} /></Field>
        <Field label="Codice NC"><input className="input" value={v.hs} maxLength={12} onChange={e => setV(o => ({ ...o, hs: e.target.value }))} placeholder="2304 00" /></Field>
        <Field label="Nota"><input className="input" value={v.note} maxLength={240} onChange={e => setV(o => ({ ...o, note: e.target.value }))} /></Field>
      </div>
      <label className="check small efl-mt"><input type="checkbox" checked={v.inScope} onChange={e => setV(o => ({ ...o, inScope: e.target.checked }))} /> In ambito EUDR (allegato I)</label>
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} onClick={save}>Salva</Btn></div>
    </Panel>
  );
}

/* ================= sezione della scheda fornitore ================= */
/** Sezione «ESG ed EUDR» della scheda laterale del fornitore: punteggi, rischio con le componenti, codice, azioni, valutazione. */
export function SupplierEsg({ d, id }) {
  const [edit, setEdit] = useState(false);
  if (!FILIERA_TAB) return null;
  const today = appToday(d);
  const sc = supplierEsgScore(d, id, { today });
  if (!sc) return null;
  const openCapa = sc.capa.items.filter(c => c.status !== 'chiusa');
  return (
    <div className="dsec efl-sup">
      <div className="eyebrow">ESG ed EUDR del fornitore</div>
      <div className="row gap-s">
        {sc.esg != null ? <Chip kind={sc.valid ? 'accent' : 'outline'}>ESG {sc.esg}/100{sc.valid ? '' : ' · scaduta'}</Chip> : <Chip kind="outline">non valutato</Chip>}
        {sc.E != null && <span className="small muted">E {sc.E} · S {sc.S ?? '—'} · G {sc.G ?? '—'}</span>}
        <BandChip band={sc.risk.band} score={sc.risk.score} />
      </div>
      <Kv items={[
        ['Codice di condotta', sc.coc.signed ? `firmato il ${dateIt(sc.coc.at)}` : 'non firmato'],
        ['Valutazione', sc.assessedAt ? `${dateIt(sc.assessedAt)}${sc.source ? ' · ' + sc.source : ''}` : '—'],
        ['Prossima revisione', sc.nextReview ? <span>{dateIt(sc.nextReview)} {sc.reviewDue && <Chip kind="warn">scaduta</Chip>}</span> : '—'],
        ['Lotti in ambito (12 mesi)', sc.eudr.lots ? `${sc.eudr.lots} lotti · ${tTxt(sc.eudr.t)} t · ${pctTxt(sc.eudr.refShare)} con DDS` : 'nessuno'],
        sc.flags.length ? ['Segnalazioni', sc.flags.map(f => f.text).join('; ')] : null,
        openCapa.length ? ['Azioni correttive aperte', openCapa.map(c => `${c.text} (entro il ${dateIt(c.due)})`).join('; ')] : null,
      ]} />
      <details className="esh-lin"><summary>Componenti del rischio</summary>
        <Kv items={sc.risk.components.map(c => [c.label, `${nf(c.points, 1)} su ${c.weight} · ${c.why}`])} />
      </details>
      <div className="row gap-s">
        <Btn small icon={LuPencil} onClick={() => setEdit(x => !x)}>{edit ? 'Chiudi la valutazione' : 'Valuta'}</Btn>
        <Btn small kind="ghost" icon={LuSend} onClick={() => { closeDrawer(); go('esg', 'filiera', 'moduli.' + id); }}>Invia un modulo</Btn>
      </div>
      {edit && <EsgEdit d={d} id={id} sc={sc} today={today} onDone={() => setEdit(false)} />}
    </div>
  );
}
function EsgEdit({ d, id, sc, today, onDone }) {
  const cur = (d.supplierEsg || []).find(x => x.id === id) || {};
  const [v, setV] = useState({ assessedAt: today, scoreE: sc.E, scoreS: sc.S, scoreG: sc.G, countryRisk: cur.countryRisk || sc.countryRisk || 'basso', cocSignedAt: cur.cocSignedAt || '', flags: (cur.hrFlags || []).map(f => (typeof f === 'string' ? f : f.text)).join('\n'), capaText: '', capaDue: addDays(today, 60) });
  const set = p => setV(x => ({ ...x, ...p }));
  const save = () => {
    const capa = [...(cur.capa || []), ...(v.capaText.trim() ? [{ text: v.capaText.trim(), due: v.capaDue, status: 'aperta' }] : [])];
    const obj = { id, assessedAt: v.assessedAt, scoreE: v.scoreE, scoreS: v.scoreS, scoreG: v.scoreG, countryRisk: v.countryRisk, hrFlags: v.flags.split('\n').map(x => x.trim()).filter(Boolean), capa, nextReview: addMonths(v.assessedAt, 12), source: 'valutazione interna',
      ...(v.cocSignedAt ? { cocSignedAt: v.cocSignedAt } : {}) };
    store.batch([{ kind: 'upsertMany', coll: 'supplierEsg', key: 'id', objs: [obj] }], `Valutazione ESG del fornitore ${sc.name}`);
    undoToast('Valutazione salvata'); onDone();
  };
  const n = (k, label) => <Field label={label}><NumInput value={v[k]} onChange={x => set({ [k]: x })} decimals={0} min={0} max={100} /></Field>;
  return (
    <div className="efl-edit">
      <div className="form">
        <Field label="Data della valutazione"><input type="date" className="input" value={v.assessedAt} max={today} onChange={e => set({ assessedAt: e.target.value })} /></Field>
        {n('scoreE', 'Ambiente (0–100)')}{n('scoreS', 'Sociale (0–100)')}{n('scoreG', 'Governance (0–100)')}
        <Field label="Rischio paese delle forniture"><Select value={v.countryRisk} onChange={x => set({ countryRisk: x })} options={['basso', 'standard', 'alto']} /></Field>
        <Field label="Codice di condotta firmato il"><input type="date" className="input" value={v.cocSignedAt} max={today} onChange={e => set({ cocSignedAt: e.target.value })} /></Field>
      </div>
      <Field label="Segnalazioni sui diritti umani (una per riga)"><textarea className="input efl-ta" rows={2} value={v.flags} onChange={e => set({ flags: e.target.value })} /></Field>
      <div className="form efl-mt">
        <Field label="Nuova azione correttiva"><input className="input" value={v.capaText} maxLength={200} onChange={e => set({ capaText: e.target.value })} placeholder="facoltativa" /></Field>
        <Field label="Entro il"><input type="date" className="input" value={v.capaDue} onChange={e => set({ capaDue: e.target.value })} /></Field>
      </div>
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} onClick={save}>Salva la valutazione</Btn></div>
    </div>
  );
}
