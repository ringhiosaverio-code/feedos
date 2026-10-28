/* FeedOS 18 · ESG › Governance ed evidenze (pacchetto WP6 «governance»): sottosezioni (#esg.governance.<id>) panoramica · calendario ·
 * politiche · organi · 231 · certificati-permessi · evidenze · claim · legale.
 * Contratto: GovernancePage({ d, route }) disegna la scheda (titolo e schede le disegna esg.jsx); GovernanceCard({ d }) è il riquadro del
 * cruscotto ESG. Periodo: useEsgPeriod(d) ed <EsgPeriodBar/>, mai usePeriod. Visibile in FeedOS e in DifesaOS: i testi sono neutri,
 * gli obblighi si filtrano per settore e le voci dell'area Regolatorio di DifesaOS si aprono lì. Prefisso CSS e DOM ego-.
 * Scritture solo con store.batch e un'etichetta italiana. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuLandmark, LuCalendarDays, LuDownload, LuPrinter, LuCircleCheck, LuArrowRight, LuUpload, LuSave, LuPlus, LuExternalLink, LuRotateCcw } from 'react-icons/lu';
import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday } from '../core/derived.js';
import { nf, dateIt, addDays, addMonths, monthLabel, daysBetween } from '../core/util.js';
import { readFile } from '../core/io.js';
import { META as EDITION } from '../editions/meta.js';
import { currentPeriod, sectorOf, SECTORS } from '../engine/esg-years.js';
import { applyPackOps } from '../engine/esg-packs.js';
import { collectCalendar, ESG_PACKAGE } from '../engine/esg-registry.js';
import { T } from '../engine/esg-nlg.js';
import { governanceSummary, governanceSignals, governanceProfile, governanceSettings, governancePack, obligationsFor, calendarWindow, markDoneOps, obligationPatchOps,
  FLAG_LABEL, GOVERNANCE_METHOD, GOV_TAB } from '../engine/esg-governance.js';
import { icsExport } from '../engine/esg-governance-ics.js';
import { PACK_GOVERNANCE, GOV_TOPICS } from '../data/pack-governance.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Kv, NumInput, SearchBox, filterRows, Drawer, Empty } from '../ui/ui.jsx';
import { Columns, Legend, StackBar } from '../ui/charts.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { SignalList } from './shared.jsx';
import { EsgPeriodBar, useEsgPeriod, EsgSubNav, StatusChip, MethodNote, Disclaimer, EsgCard, setEsgSettings } from './esg-shared.jsx';
import { pctTxt, undoToast, dayTxt, downloadCsv, downloadText, OblChip, RecordDrawer, dt } from './esg-governance-ui.jsx';
import { Politiche, Organi, Modello231, CertificatiPermessi, Legale } from './esg-governance-registri.jsx';
import { Evidenze, Dichiarazioni } from './esg-governance-evidenze.jsx';

const SECTIONS = [['panoramica', 'Panoramica'], ['calendario', 'Calendario'], ['politiche', 'Politiche'], ['organi', 'Organi e ruoli'], ['231', 'Modello 231'],
  ['certificati-permessi', 'Certificati e permessi'], ['evidenze', 'Evidenze'], ['claim', 'Dichiarazioni ambientali'], ['legale', 'Procedimenti e C8']];

/** Scheda ESG › Governance ed evidenze. */
export function GovernancePage({ d, route }) {
  const { P, prev, setKey } = useEsgPeriod(d);
  const today = appToday(d);
  const S = useMemo(() => governanceSummary(d, P), [d, P.key]);
  const [sec, ...rest] = String(route?.id || 'panoramica').split('.');
  const arg = rest.join('.');
  const sub = SECTIONS.some(([id]) => id === sec) ? sec : 'panoramica';
  const badge = { calendario: S.obligations.overdue + S.obligations.soon || null, 'certificati-permessi': S.expiries.filter(x => x.coll !== 'evidence').length || null,
    evidenze: S.evidence.coverage.missing.length || null, claim: S.claims.blocked + S.claims.review || null };
  const props = { d, P, prev, S, today };
  return (
    <div className="ego" id="ego-page">
      <EsgPeriodBar d={d} value={P.key} onChange={setKey} />
      <EsgSubNav items={SECTIONS.map(([id, label]) => ({ id, label, badge: badge[id] }))} value={sub} tab="governance" label="Sezioni di Governance ed evidenze" />
      {sub === 'panoramica' && <Panoramica {...props} />}
      {sub === 'calendario' && <Calendario {...props} pick={arg} />}
      {sub === 'politiche' && <Politiche {...props} />}
      {sub === 'organi' && <Organi {...props} />}
      {sub === '231' && <Modello231 {...props} />}
      {sub === 'certificati-permessi' && <CertificatiPermessi {...props} />}
      {sub === 'evidenze' && <Evidenze {...props} />}
      {sub === 'claim' && <Dichiarazioni {...props} />}
      {sub === 'legale' && <Legale {...props} />}
    </div>
  );
}

/** Riquadro del cruscotto ESG: scadenze entro 30 giorni, prossima scadenza, evidenze e dichiarazioni. */
export function GovernanceCard({ d }) {
  if (!GOV_TAB) return null;
  const today = appToday(d);
  const P = currentPeriod(d);
  const S = governanceSummary(d, P);
  if (!S || (!(d.complianceItems || []).length && !(d.policies || []).length && !(d.evidence || []).length))
    return <EsgCard title="Governance ed evidenze" tab="governance" icon={LuLandmark} value="—" sub="Calendario degli adempimenti, politiche, certificati e registro delle evidenze con impronta." />;
  const sig = governanceSignals(d, { today });
  const status = sig.some(x => x.severity === 'critico') ? 'bad' : sig.some(x => x.severity === 'attenzione') ? 'warn' : 'ok';
  const next = S.obligations.next[0];
  const n30 = S.obligations.next.filter(o => o.days != null && o.days <= 30).length + S.obligations.overdue;
  return (
    <EsgCard title="Governance ed evidenze" tab="governance" id="calendario" icon={LuLandmark} value={nf(n30)} unit={n30 === 1 ? 'scadenza a 30 giorni' : 'scadenze a 30 giorni'} status={status}
      chip={S.obligations.overdue ? <Chip kind="crit">{S.obligations.overdue} scadute</Chip> : null}
      sub={`${next ? `Prossima: ${next.title} (${dateIt(next.date)})` : 'Nessuna scadenza pianificata'} · evidenze ${pctTxt(S.evidence.coverage.share)} · ${S.claims.blocked ? `${S.claims.blocked} dichiarazioni bloccate` : 'dichiarazioni in regola'}`} />
  );
}

/* ================= panoramica ================= */
const STACK = [['scaduto', 'Scaduti', 'var(--crit)'], ['in scadenza', 'In scadenza', 'var(--warn)'], ['in vigore', 'In vigore da confermare', 'var(--maize)'], ['pianificato', 'Pianificati', 'var(--s1)'],
  ['da pianificare', 'Da pianificare', 'var(--s5)'], ['su evento', 'Su evento', 'var(--s3)'], ['altrove', 'In un’altra scheda', 'var(--s7)'], ['fatto', 'Fatti', 'var(--good)']];
function Panoramica({ d, P, S, today }) {
  const sig = useMemo(() => governanceSignals(d, { today }), [d, today]);
  const obl = useMemo(() => obligationsFor(d, today).filter(o => o.applies), [d, today]);
  const cal = useMemo(() => calendarWindow(collectCalendar(d, today), today, 90, 0).slice(0, 8), [d, today]);
  const pr = S.profile;
  const parts = STACK.map(([k, label, color]) => ({ key: k, label, color, value: obl.filter(o => o.status === k).length })).filter(p => p.value > 0);
  const nextDays = S.obligations.next[0]?.days;
  return (
    <>
      <section className="ego-hero" aria-label="Situazione degli adempimenti">
        <div className="ego-stat ego-stat-main">
          <span className="eyebrow">Adempimenti applicabili</span>
          <b>{nf(S.obligations.n)}</b>
          <span>{S.obligations.overdue ? `${S.obligations.overdue} scaduti · ` : 'nessuno scaduto · '}{S.obligations.soon} in scadenza</span>
          <small>{S.obligations.next[0] ? `Prossimo: ${S.obligations.next[0].title} · ${dateIt(S.obligations.next[0].date)} (${dayTxt(nextDays)})` : 'Nessuna scadenza pianificata'}</small>
        </div>
        <div className="ego-stat">
          <span className="eyebrow">Evidenze dei datapoint</span>
          <b>{pctTxt(S.evidence.coverage.share)}</b>
          <span>{nf(S.evidence.coverage.covered.length)} di {nf(S.evidence.coverage.ids.length)} datapoint obbligatori del VS</span>
          <small>{nf(S.evidence.n)} documenti con impronta SHA-256</small>
        </div>
        <div className="ego-stat">
          <span className="eyebrow">Dichiarazioni ambientali</span>
          <b>{nf(S.claims.blocked)}</b>
          <span>{S.claims.blocked === 1 ? 'bloccata' : 'bloccate'} su {nf(S.claims.n)} nel registro</span>
          <small>{S.claims.publishedBad ? `${S.claims.publishedBad} già pubblicate da correggere` : 'nessuna pubblicata con rilievi'}</small>
        </div>
      </section>
      <div className="kpis" id="ego-kpis">
        <Kpi label="Adempimenti fatti nei tempi" value={pctTxt(S.obligations.onTime)} status={S.obligations.onTime == null ? undefined : S.obligations.onTime >= 0.95 ? 'ok' : S.obligations.onTime >= 0.85 ? 'warn' : 'bad'} target="95%" foot={P.short} onClick={() => go('esg', 'governance', 'calendario')} />
        <Kpi label="Temi B2 con una politica" value={`${S.b2.rows.filter(x => x.covered).length}/${S.b2.rows.length}`} status={S.b2.share >= 0.8 ? 'ok' : S.b2.share >= 0.5 ? 'warn' : 'bad'} foot={S.b2.drafts ? `${S.b2.drafts} in bozza` : 'nessuna bozza'} onClick={() => go('esg', 'governance', 'politiche')} />
        <Kpi label="Rapporto donne/uomini nel CdA" value={S.board.ratio == null ? '—' : nf(S.board.ratio, 2)} foot={`${S.board.women} ${S.board.women === 1 ? 'donna' : 'donne'} su ${S.board.members} componenti (C9)`} onClick={() => go('esg', 'governance', 'organi')} />
        <Kpi label="Certificati e permessi in scadenza" value={nf(S.expiries.filter(x => x.coll !== 'evidence').length)} status={S.expiries.some(x => x.coll !== 'evidence') ? 'warn' : 'ok'} foot="entro 90 giorni (permessi 180)" onClick={() => go('esg', 'governance', 'certificati-permessi')} />
        <Kpi label="Controlli 231 verificati" value={`${S.m231.tested}/${S.m231.controls}`} status={S.m231.weak ? 'warn' : 'ok'} foot={S.m231.weak ? `${S.m231.weak} da migliorare` : 'ultimi 12 mesi'} onClick={() => go('esg', 'governance', '231')} />
      </div>
      <div className="split">
        <Panel title="Da fare" sub="Segnali di governance (gli stessi di Oggi)" flush>
          <SignalList items={sig} limit={6} emptyText="Nessuna scadenza imminente, nessun certificato in scadenza, nessuna dichiarazione a rischio." />
        </Panel>
        <div className="stack">
          <Panel title="Stato degli obblighi" sub={`${obl.length} obblighi applicabili a ${pr.sectorLabel.toLowerCase()} · pacchetto ${S.pack.version} valido al ${dateIt(S.pack.validAsOf)}`}>
            {parts.length ? <><StackBar parts={parts} ariaLabel="Obblighi applicabili per stato" /><Legend items={parts.map(p => ({ label: `${p.label} ${p.value}`, color: p.color }))} /></> : <Empty title="Nessun obbligo applicabile" />}
          </Panel>
          <Panel title="Prossimi 90 giorni" sub="Da tutte le schede ESG" flush actions={<Btn small kind="ghost" icon={LuCalendarDays} onClick={() => go('esg', 'governance', 'calendario')}>Calendario</Btn>}>
            {cal.length ? <ul className="ego-next">
              {cal.map(c => (
                <li key={c.key}>
                  <span className="ego-next-d"><b>{c.date.slice(8, 10)}</b>{monthLabel(c.date.slice(0, 7))}</span>
                  <span className="ego-next-t"><button type="button" className="linkish" onClick={() => openItem(c)}>{c.title}</button><span className="xs muted">{ESG_PACKAGE[c.pkg]?.title || c.pkg}{c.owner ? ` · ${c.owner}` : ''} · {dayTxt(c.days)}</span></span>
                </li>
              ))}
            </ul> : <Empty title="Nessuna scadenza nei prossimi 90 giorni" />}
          </Panel>
        </div>
      </div>
      <Panel title="Profilo usato per l’applicabilità" sub="Dati dell’archivio che decidono quali obblighi valgono; si correggono nel calendario (Profilo dell’impresa)"
        actions={<Btn small kind="ghost" icon={LuArrowRight} onClick={() => go('esg', 'governance', 'calendario.profilo')}>Correggi</Btn>}>
        <Kv items={[['Settore', SECTORS[pr.sector] && SECTORS[pr.sector].nace.slice(0, 2) !== String(pr.nace).slice(0, 2) ? <span>{pr.sectorLabel} · <span className="ego-warn-t">NACE {pr.nace} nelle impostazioni del report: per questo settore di solito {SECTORS[pr.sector].nace}</span></span> : `${pr.sectorLabel} (NACE ${pr.nace})`], ['Dipendenti', pr.employees == null ? 'non noti' : `${nf(pr.employees)} · ${pr.employeesSrc}`], ['Ricavi degli ultimi 12 mesi', `${nf(pr.revenue12 / 1e6, 1)} M€`],
          ['Caratteristiche', <span className="ego-flags">{Object.entries(pr.flags).filter(([, v]) => v).map(([k]) => <Chip key={k} kind="outline">{FLAG_LABEL[k] || k}</Chip>)}</span>]]} />
      </Panel>
      <Panel title="Metodo e limiti">
        <MethodNote text={GOVERNANCE_METHOD} title="Nota metodologica" />
        <p className="small muted">Contenuti normativi: pacchetto «governance» {S.pack.version} valido al {dateIt(S.pack.validAsOf)} ({S.pack.origin}); le voci «da verificare» vanno controllate sulle fonti ufficiali. {EDITION.product} non è un canale di segnalazione e non deposita pratiche presso le autorità.</p>
        <Disclaimer />
      </Panel>
    </>
  );
}
/** Apre una voce del calendario: la scheda che la gestisce (o l'area Regolatorio di DifesaOS). */
function openItem(c) {
  const g = c.goto && c.goto.area && c.goto.area !== 'esg' ? c.goto : c.link || { area: 'esg', tab: 'governance', id: 'calendario' };
  go(g.area, g.tab, g.id);
}

/* ================= calendario ================= */
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const KIND_COLOR = { scadenza: 'var(--s1)', rinnovo: 'var(--s2)', controllo: 'var(--s3)', traguardo: 'var(--s4)' };
const KINDS = ['scadenza', 'rinnovo', 'controllo', 'traguardo'];
const WINDOWS = [{ id: '30', label: '30 giorni' }, { id: '90', label: '90 giorni' }, { id: '180', label: '180 giorni' }, { id: '365', label: '12 mesi' }];
function ruleText(r, permits) {
  if (!r) return '—';
  if (r.type === 'fixed') return `una volta, il ${dateIt(r.date)}`;
  if (r.type === 'annual') { const [m, g] = r.md.split('-'); return `ogni anno il ${+g} ${monthLabel(`2000-${m}`, false).replace(' 2000', '')}`; }
  if (r.type === 'every') return `ogni ${r.months} mesi dall’ultima scadenza completata`;
  if (r.type === 'permit') return `${r.monthsBefore ? `${r.monthsBefore} ${r.monthsBefore === 1 ? 'mese' : 'mesi'} prima della` : 'alla'} scadenza del permesso «${r.kind}»`;
  if (r.type === 'event') return 'quando succede (nessuna data fissa)';
  return 'data indicata dall’azienda';
}
function Calendario({ d, P, S, today, pick }) {
  const [win, setWin] = useState('180');
  const [pkg, setPkg] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [past, setPast] = useState(true);
  const [open, setOpen] = useState(null);
  const all = useMemo(() => collectCalendar(d, today), [d, today]);
  const obl = useMemo(() => obligationsFor(d, today), [d, today]);
  const items = useMemo(() => filterRows(calendarWindow(all, today, +win, past ? 60 : 0).filter(c => (!pkg || c.pkg === pkg) && (!kind || c.kind === kind)), q, ['title', 'law', 'owner', 'source']), [all, today, win, pkg, kind, q, past]);
  const months = useMemo(() => { const m = new Map(); for (const c of items) { const k = c.date.slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(c); } return [...m.entries()]; }, [items]);
  const load = useMemo(() => {
    const ms = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7) + '-01', i).slice(0, 7));
    return ms.map(m => ({ label: monthLabel(m), parts: KINDS.map(k => ({ key: k, value: all.filter(c => c.date.slice(0, 7) === m && c.kind === k).length })) }));
  }, [all, today]);
  const pkgs = [...new Set(all.map(c => c.pkg))];
  const co = d.settings?.company || {};
  const oblOf = c => (c.obligationId ? obl.find(o => o.id === c.obligationId) : null);
  const exportIcs = () => {
    const txt = icsExport(items.map(c => ({ ...c, pkgLabel: ESG_PACKAGE[c.pkg]?.title || c.pkg })), { name: T('governance.ics.name', { company: co.short || co.name || EDITION.product }), stamp: today, product: EDITION.product });
    downloadText('adempimenti-esg', 'ics', txt, 'text/calendar;charset=utf-8');
  };
  const exportCsv = () => downloadCsv('adempimenti-esg', items, [{ label: 'Data', key: 'date' }, { label: 'Scadenza', key: 'title' }, { label: 'Tipo', key: 'kind' }, { label: 'Scheda', value: c => ESG_PACKAGE[c.pkg]?.title || c.pkg },
    { label: 'Norma', key: 'law' }, { label: 'Responsabile', key: 'owner' }, { label: 'Fonte', key: 'source' }, { label: 'Valido al', key: 'validAsOf' }, { label: 'Stato', value: c => c.govStatus || c.state }]);
  return (
    <>
      <div className="no-print stack">
        <Panel title="Calendario degli adempimenti" sub={`Scadenze di tutte le schede ESG: obblighi del pacchetto «governance» per ${S.profile.sectorLabel.toLowerCase()}, certificati, permessi, evidenze, riesami e controlli`} flush
          actions={<>
            <Btn small icon={LuDownload} onClick={exportIcs} disabled={!items.length} title="Calendario per Outlook, Google Calendar o Apple Calendario (RFC 5545)">.ics</Btn>
            <Btn small kind="ghost" icon={LuDownload} onClick={exportCsv} disabled={!items.length}>CSV</Btn>
            <Btn small kind="ghost" icon={LuPrinter} onClick={printNow} disabled={!items.length}>Stampa</Btn>
          </>}>
          <div className="ego-filters">
            <Seg options={WINDOWS} value={win} onChange={setWin} label="Orizzonte" />
            <Select value={pkg} onChange={setPkg} ariaLabel="Scheda" options={[{ id: '', label: 'Tutte le schede' }, ...pkgs.map(p => ({ id: p, label: ESG_PACKAGE[p]?.title || p }))]} />
            <Select value={kind} onChange={setKind} ariaLabel="Tipo" options={[{ id: '', label: 'Tutti i tipi' }, ...KINDS.map(k => ({ id: k, label: k }))]} />
            <SearchBox value={q} onChange={setQ} placeholder="Cerca adempimento, norma, responsabile" />
            <label className="check small"><input type="checkbox" checked={past} onChange={e => setPast(e.target.checked)} /> anche gli ultimi 60 giorni</label>
          </div>
          {months.length ? months.map(([m, xs]) => (
            <section key={m} className="ego-month" aria-label={monthLabel(m, false)}>
              <h3>{cap(monthLabel(m, false))}<span className="xs muted"> · {xs.length} {xs.length === 1 ? 'voce' : 'voci'}</span></h3>
              <ul className="ego-cal">
                {xs.map(c => {
                  const o = oblOf(c);
                  const st = c.govStatus || (c.days < 0 ? 'scaduto' : c.days <= 30 ? 'in scadenza' : 'pianificato');
                  return (
                    <li key={c.key} className={`ego-ci ego-ci-${st.replace(/\s+/g, '-')}`}>
                      <span className="ego-ci-d"><b>{c.date.slice(8, 10)}</b><span>{dayTxt(c.days)}</span></span>
                      <span className="ego-ci-t">
                        <b>{c.title}</b>
                        <span className="xs muted">{[c.law, c.owner && `responsabile: ${c.owner}`, c.validAsOf && `valido al ${dateIt(c.validAsOf)}`].filter(Boolean).join(' · ')}</span>
                        <span className="ego-chips"><Chip kind="outline">{ESG_PACKAGE[c.pkg]?.title || c.pkg}</Chip><Chip kind="outline">{c.kind}</Chip><OblChip status={st} />{c.status === 'da verificare' && <StatusChip status="da verificare" />}</span>
                      </span>
                      <span className="ego-ci-a">
                        {o && o.status !== 'fatto' && <Btn small icon={LuCircleCheck} onClick={() => setOpen(o.id)} title="Segna come fatto, con data ed evidenze">Fatto</Btn>}
                        <Btn small kind="ghost" icon={LuArrowRight} onClick={() => (o ? setOpen(o.id) : openItem(c))} title={o ? 'Dettagli dell’obbligo' : 'Apri la scheda'}>{o ? 'Dettagli' : 'Apri'}</Btn>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )) : <Empty title="Nessuna scadenza con questi filtri" icon={LuCalendarDays}>Allarga l’orizzonte o togli i filtri.</Empty>}
        </Panel>
        <Panel title="Carico dei prossimi 12 mesi" sub="Voci del calendario per mese e tipo, da tutte le schede">
          <Columns cols={load} keys={KINDS.map(k => ({ key: k, label: k, color: KIND_COLOR[k] }))} height={190} ariaLabel="Scadenze per mese nei prossimi 12 mesi" />
          <Legend items={KINDS.map(k => ({ label: k, color: KIND_COLOR[k] }))} />
        </Panel>
        <Obblighi d={d} today={today} obl={obl} onOpen={setOpen} S={S} />
        <div className="split" id="ego-profilo">
          <ProfiloPanel d={d} today={today} focus={pick === 'profilo'} />
          <PackPanel d={d} />
        </div>
      </div>
      <div className="print-only">
        <PrintPage title="Scadenziario degli adempimenti" period={`prossimi ${WINDOWS.find(w => w.id === win)?.label}`} footer={`Pacchetto «governance» ${S.pack.version} valido al ${dateIt(S.pack.validAsOf)} · ${T('disclaimer')}`}>
          <table className="t ego-print-t">
            <thead><tr><th>Data</th><th>Adempimento</th><th>Norma</th><th>Responsabile</th><th>Scheda</th><th>Stato</th></tr></thead>
            <tbody>{items.map(c => <tr key={c.key}><td>{dateIt(c.date)}</td><td>{c.title}</td><td>{c.law || '—'}</td><td>{c.owner || '—'}</td><td>{ESG_PACKAGE[c.pkg]?.title || c.pkg}</td><td>{c.govStatus || c.state}</td></tr>)}</tbody>
          </table>
        </PrintPage>
      </div>
      {open && obl.find(o => o.id === open) && <ObligationDrawer key={open} d={d} o={obl.find(o => o.id === open)} today={today} onClose={() => setOpen(null)} />}
    </>
  );
}

/* registro degli obblighi del pacchetto */
const SCOPES = [{ id: 'applicabili', label: 'Applicabili' }, { id: 'settore', label: 'Tutti del settore' }, { id: 'tutti', label: 'Catalogo completo' }];
function Obblighi({ d, today, obl, onOpen, S }) {
  const [scope, setScope] = useState('applicabili');
  const [topic, setTopic] = useState('');
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const catalog = useMemo(() => (scope === 'tutti' ? obligationsFor(d, today, { sector: 'tutti' }) : obl), [scope, d, today, obl]);
  const rows = filterRows(catalog.filter(o => (scope !== 'applicabili' || o.applies) && (!topic || o.topic === topic)), q, ['title', 'law', 'owner', 'reason']);
  const sector = sectorOf(d);
  return (
    <Panel title="Obblighi e adempimenti" sub={`Dal pacchetto «governance» ${S.pack.version} (${PACK_GOVERNANCE.items.filter(x => (x.sectors || []).includes(sector)).length} voci per ${SECTORS[sector]?.label.toLowerCase()}) più gli adempimenti propri dell’azienda`} flush
      actions={<>
        <Seg options={SCOPES} value={scope} onChange={setScope} label="Quali obblighi" />
        <Select value={topic} onChange={setTopic} ariaLabel="Argomento" options={[{ id: '', label: 'Tutti gli argomenti' }, ...Object.entries(GOV_TOPICS).map(([id, label]) => ({ id, label }))]} />
        <SearchBox value={q} onChange={setQ} placeholder="Cerca obbligo" />
        <Btn small kind="primary" icon={LuPlus} onClick={() => setAdd(true)}>Adempimento</Btn>
      </>}>
      <Table rows={rows} rowKey={o => o.id} pageSize={25} exportName="obblighi-esg" onRow={o => (o.sectorMatch ? onOpen(o.id) : null)} initialSort={null} cols={[
        { key: 'title', label: 'Obbligo', render: o => <span className="ego-wrap"><b>{o.title}</b><span className="sub">{o.law || '—'}</span></span>, csv: o => o.title, sort: o => o.title },
        { key: 'applies', label: 'Si applica', render: o => <span className="ego-wrap">{o.applies ? <Chip kind="good">sì</Chip> : <Chip kind="outline">no</Chip>}<span className="sub">{o.reason}</span></span>, csv: o => (o.applies ? 'sì' : 'no') + ' · ' + o.reason, sort: o => (o.applies ? 0 : 1) },
        { key: 'date', label: 'Prossima scadenza', render: o => (o.date ? <span>{dateIt(o.date)}<span className="sub">{dayTxt(o.days)}</span></span> : o.via ? <span className="sub">nella scheda {ESG_PACKAGE[o.via.pkg]?.title || o.via.pkg}</span> : <span className="sub">{o.next?.missing || '—'}</span>), csv: o => o.date || '', sort: o => o.date || '9999' },
        { key: 'status', label: 'Stato', render: o => <OblChip status={o.status} />, sort: o => o.status },
        { key: 'owner', label: 'Responsabile', render: o => o.owner || <span className="muted">da assegnare</span> },
        { key: 'src', label: 'Fonte', render: o => <span className="ego-wrap">{o.statusText === 'da verificare' && <StatusChip status="da verificare" />}<span className="sub">{o.validAsOf ? `valido al ${dateIt(o.validAsOf)}` : o.source}</span></span>, csv: o => `${o.source || ''}${o.statusText ? ' · ' + o.statusText : ''}` },
      ]} />
      {add && <RecordDrawer d={d} coll="complianceItems" rec={null} defaults={{ obligationId: null, applies: null, done: [], lastDoneAt: null, evidenceIds: [], status: 'aperto', recurrenceMonths: null, owner: '', due: addDays(today, 30) }} onClose={() => setAdd(false)} />}
    </Panel>
  );
}

/* dettaglio di un obbligo: applicabilità, responsabile, completamenti con evidenze */
function ObligationDrawer({ d, o, today, onClose }) {
  const [at, setAt] = useState(today);
  const [ev, setEv] = useState([]);
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState(o.ci?.owner || '');
  const [due, setDue] = useState(o.ci?.due || '');
  const evidence = (d.evidence || []).filter(e => e && !e.supersededBy);
  const done = () => {
    const ops = markDoneOps(d, o, { at, by: owner || o.owner, evidenceIds: ev, note: note.trim() });
    if (!ops.length) return;
    store.batch(ops, `Adempimento fatto: ${o.title}${o.date ? ` (scadenza del ${dateIt(o.date)})` : ''}`); undoToast('Adempimento registrato'); onClose();
  };
  const patch = (p, label) => { store.batch(obligationPatchOps(d, o, p), label); undoToast('Salvato'); };
  const url = typeof o.source === 'string' && /^https:\/\//.test(o.source) ? o.source : null;
  const applyMode = o.ci?.applies === true ? 'si' : o.ci?.applies === false ? 'no' : 'auto';
  const ext = o.ext && o.ext.area !== 'esg' ? o.ext : null;
  return (
    <Drawer title={o.title} sub={o.custom ? 'Adempimento dell’azienda' : `Obbligo del pacchetto «governance» · ${GOV_TOPICS[o.topic] || o.topic}`} onClose={onClose} wide
      actions={o.status !== 'fatto' && o.applies ? <Btn kind="primary" icon={LuCircleCheck} onClick={done}>Segna come fatto</Btn> : null}>
      <div className="stack">
        <Kv items={[['Norma', o.law || '—'], ['Si applica', <span>{o.applies ? 'sì' : 'no'} · {o.reason}</span>], ['Scadenza', `${ruleText(o.item?.due)}${o.date ? ` · prossima il ${dateIt(o.date)} (${dayTxt(o.days)})` : ''}`],
          ['Stato', <OblChip status={o.status} />], o.what ? ['Cosa fare', o.what] : null, o.evidence ? ['Evidenza attesa', o.evidence] : null,
          ['Fonte', url ? <a href={url} target="_blank" rel="noopener noreferrer" className="ego-url">{url}</a> : o.source || '—'], o.validAsOf ? ['Valido al', dateIt(o.validAsOf)] : null,
          o.statusText ? ['Contenuto', <StatusChip status={o.statusText} />] : null, o.note ? ['Nota', o.note] : null]} />
        {o.via && <div className="note small">La data la calcola la scheda {ESG_PACKAGE[o.via.pkg]?.title || o.via.pkg}: qui non si duplica. <button type="button" className="linkish small" onClick={() => go('esg', ESG_PACKAGE[o.via.pkg]?.tab || o.via.pkg)}>Apri la scheda</button></div>}
        {ext && <div className="note small"><b>Gestito nell’area {ext.area === 'regolatorio' ? 'Regolatorio' : ext.area}</b>{o.extState ? `: ${o.extState.text}.` : '.'} <button type="button" className="linkish small" onClick={() => go(ext.area, ext.tab)}><LuExternalLink aria-hidden="true" /> Apri</button></div>}
        {o.ext?.area === 'esg' && <div className="note small">{o.extState?.text ? `${o.extState.text}. ` : ''}<button type="button" className="linkish small" onClick={() => go('esg', o.ext.tab)}>Apri la scheda</button></div>}
        <Panel title="Responsabile e applicabilità" inset>
          <div className="form">
            <Field label="Responsabile"><input className="input" value={owner} maxLength={80} onChange={e => setOwner(e.target.value)} placeholder={o.item?.owner || 'Ruolo o persona'} /></Field>
            {['manual', 'every', 'event'].includes(o.item?.due?.type) && <Field label={o.item?.due?.type === 'every' ? 'Prima scadenza (senza storico)' : 'Prossima scadenza'}><input className="input" type="date" value={due || ''} onChange={e => setDue(e.target.value)} /></Field>}
          </div>
          <div className="row gap-s ego-mt">
            <Btn small icon={LuSave} onClick={() => patch({ owner: owner.trim(), ...(['manual', 'every', 'event'].includes(o.item?.due?.type) ? { due: due || null } : {}) }, `Adempimento «${o.title}»: responsabile e data`)}>Salva</Btn>
            {!o.custom && <Seg label="Applicabilità" value={applyMode} onChange={v => patch({ applies: v === 'si' ? true : v === 'no' ? false : null }, `Adempimento «${o.title}»: applicabilità ${v === 'auto' ? 'automatica' : v === 'si' ? 'inclusa' : 'esclusa'}`)}
              options={[{ id: 'auto', label: 'Automatica' }, { id: 'si', label: 'Si applica' }, { id: 'no', label: 'Non si applica' }]} />}
          </div>
        </Panel>
        {o.applies && o.status !== 'fatto' && (
          <Panel title="Segna come fatto" sub={o.date ? `Completa la scadenza del ${dateIt(o.date)}` : 'Registra il completamento di oggi'} inset>
            <div className="form">
              <Field label="Fatto il"><input className="input" type="date" value={at} max={today} onChange={e => setAt(e.target.value)} /></Field>
              <Field label="Evidenza"><Select value="" onChange={v => v && setEv(x => [...new Set([...x, v])])} ariaLabel="Aggiungi un’evidenza" options={[{ id: '', label: evidence.length ? '— aggiungi un documento —' : 'nessun documento nel registro' }, ...evidence.map(e => ({ id: e.id, label: e.title }))]} /></Field>
              <Field label="Nota"><input className="input" value={note} maxLength={200} onChange={e => setNote(e.target.value)} /></Field>
            </div>
            {ev.length > 0 && <div className="ego-chips ego-mt">{ev.map(id => <Chip key={id} kind="accent">{evidence.find(e => e.id === id)?.title || id} <button type="button" className="linkish" onClick={() => setEv(x => x.filter(y => y !== id))} aria-label="Togli">×</button></Chip>)}</div>}
          </Panel>
        )}
        <Panel title="Completamenti registrati" flush inset>
          <Table rows={[...(o.ci?.done || [])].sort((a, b) => (a.due < b.due ? 1 : -1))} rowKey={x => `${x.due}|${x.at}`} pageSize={10} empty="Nessun completamento registrato" cols={[
            { key: 'due', label: 'Scadenza', render: x => dt(x.due) }, { key: 'at', label: 'Fatto il', render: x => <span>{dt(x.at)}{x.at && x.due && x.at > x.due ? <Chip kind="warn">{daysBetween(x.due, x.at)} giorni dopo</Chip> : null}</span> },
            { key: 'by', label: 'Da' }, { key: 'ev', label: 'Evidenze', render: x => (x.evidenceIds || []).map(id => (d.evidence || []).find(e => e.id === id)?.title || id).join(', ') || '—' }, { key: 'note', label: 'Nota' },
          ]} />
        </Panel>
      </div>
    </Drawer>
  );
}

/* profilo dell'impresa per l'applicabilità */
function ProfiloPanel({ d, today, focus }) {
  const st = governanceSettings(d);
  const pr = governanceProfile(d, today);
  const [emp, setEmp] = useState(st.employees ?? null);
  const setFlag = (k, v) => { setEsgSettings('governance', x => ({ ...x, flags: { ...(x.flags || {}), [k]: v } }), `Governance: profilo · ${FLAG_LABEL[k]} ${v ? 'sì' : 'no'}`); undoToast('Profilo aggiornato'); };
  const reset = () => { setEsgSettings('governance', x => ({ ...x, flags: {} }), 'Governance: profilo automatico'); undoToast('Profilo automatico'); };
  const saveEmp = () => { setEsgSettings('governance', x => ({ ...x, employees: emp > 0 ? Math.round(emp) : null }), 'Governance: dipendenti'); undoToast('Dipendenti salvati'); };
  useEffect(() => { if (focus) document.getElementById('ego-profile')?.scrollIntoView({ block: 'start' }); }, [focus]);
  return (
    <Panel title="Profilo dell’impresa" sub="Le caratteristiche si ricavano dai dati; una scelta qui prevale (segnata «impostazione»)" id="ego-profile" className={focus ? 'ego-focus' : ''}
      actions={Object.keys(pr.flagSrc).length ? <Btn small kind="ghost" icon={LuRotateCcw} onClick={reset}>Automatico</Btn> : null}>
      <div className="form">
        <Field label="Dipendenti" hint={`In uso: ${pr.employees == null ? 'non noti' : nf(pr.employees)} (${pr.employeesSrc || '—'})`}><NumInput value={emp} onChange={setEmp} decimals={0} min={0} ariaLabel="Dipendenti" /></Field>
      </div>
      <div className="row gap-s ego-mt"><Btn small icon={LuSave} onClick={saveEmp}>Salva i dipendenti</Btn><span className="xs muted">Vuoto = dal pacchetto Persone o dal questionario ESG</span></div>
      <ul className="ego-flaglist">
        {Object.keys(FLAG_LABEL).filter(k => k !== 'claims').map(k => (
          <li key={k}>
            <label className="check small"><input type="checkbox" checked={!!pr.flags[k]} onChange={e => setFlag(k, e.target.checked)} /> {FLAG_LABEL[k]}</label>
            {pr.flagSrc[k] && <Chip kind="outline">impostazione</Chip>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* pacchetto di contenuti «governance» */
function PackPanel({ d }) {
  const [res, setRes] = useState(null);
  const p = governancePack(d);
  const sector = sectorOf(d);
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const r = applyPackOps(d, await readFile(f), PACK_GOVERNANCE);
    if (r.ok && r.pack?.pack !== 'governance') { setRes({ ok: false, errors: [`Il file è il pacchetto «${r.pack.pack}», non «governance».`] }); return; }
    setRes(r);
  };
  const apply = () => { store.batch(res.ops, `Pacchetto di contenuti «governance» ${res.pack.version} importato`); undoToast('Pacchetto importato'); setRes(null); };
  const items = p.items || [];
  const toVerify = items.filter(x => x.status === 'da verificare' && (x.sectors || []).includes(sector)).length;
  return (
    <Panel title="Contenuti normativi" sub={`Pacchetto in uso: ${p.version} (${p.origin}), valido al ${dateIt(p.validAsOf)} · ${items.length} obblighi, ${items.filter(x => (x.sectors || []).includes(sector)).length} per questo settore`}
      actions={<label className="btn small"><LuUpload aria-hidden="true" />Importa un pacchetto più recente<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>}>
      <p className="small muted">Ogni obbligo riporta norma, fonte e «valido al»; {toVerify} voci per questo settore sono «da verificare» con il consulente. Un pacchetto importato vale solo se la sua versione è più recente di quella integrata.</p>
      <div className="row gap-s"><Btn small kind="ghost" icon={LuDownload} onClick={() => downloadText('pacchetto-governance', 'json', JSON.stringify(p, null, 2), 'application/json')}>Scarica il pacchetto in uso</Btn></div>
      {res && !res.ok && <div className="note crit small ego-mt">{res.errors.join(' · ')}</div>}
      {res && res.ok && (
        <div className="note small ego-mt">
          Pacchetto {res.pack.version} valido al {dateIt(res.pack.validAsOf)}: {res.diff.added.length} voci nuove, {res.diff.changed.length} modificate, {res.diff.removed.length} tolte.
          <div className="row gap-s ego-mt"><Btn small kind="primary" icon={LuSave} onClick={apply}>Usa questo pacchetto</Btn><Btn small kind="ghost" onClick={() => setRes(null)}>Annulla</Btn></div>
        </div>
      )}
    </Panel>
  );
}

