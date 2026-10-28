/* FeedOS 18 · ESG › Governance ed evidenze: registri (politiche con la matrice B2 e il C6, organo amministrativo e ruoli, Modello 231
 * con OdV e conteggi delle segnalazioni, certificati e permessi, procedimenti con B11/C7 e ricavi del C8).
 * Testi neutri rispetto al settore; nessun nome di persona nei registri (ruoli). Prefisso CSS ego-. Scritture con store.batch. */
import React, { useMemo, useState } from 'react';
import { LuPlus, LuSave, LuCircleCheck, LuShieldAlert } from 'react-icons/lu';
import { store } from '../core/store.js';
import { nf, dateIt, addMonths, daysBetween, slug } from '../core/util.js';
import { META as EDITION } from '../editions/meta.js';
import { naceOf } from '../engine/esg-years.js';
import { T } from '../engine/esg-nlg.js';
import { b2Matrix, c6Coverage, boardStats, policyState, expiryState, governanceSettings, b11, c7, c8, governanceDatapoints } from '../engine/esg-governance.js';
import { C6_TOPICS } from '../data/fields-governance.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Kv, NumInput } from '../ui/ui.jsx';
import { EvidenceCount, setEsgSettings, Disclaimer } from './esg-shared.jsx';
import { pctTxt, eurTxt, undoToast, dayTxt, ExpChip, Tick, RecordDrawer, dt } from './esg-governance-ui.jsx';

const MATTER_LABEL = { clima: 'Clima', inquinamento: 'Inquinamento', acqua: 'Acqua', biodiversita: 'Biodiversità', circolarita: 'Economia circolare', lavoratori: 'Forza lavoro propria', filiera: 'Catena del valore', comunita: 'Comunità', consumatori: 'Consumatori e clienti', condotta: 'Condotta' };
const STATUS_KIND = { approvata: 'good', bozza: 'warn', ritirata: 'outline' };

/* ================= politiche ================= */
export function Politiche({ d, P, today }) {
  const [ed, setEd] = useState(null);
  const [covers, setCovers] = useState([]);
  const m = useMemo(() => b2Matrix(d, P.to), [d.policies, P.to]);
  const c6 = c6Coverage(d, P.to);
  const dp = governanceDatapoints(d, P);
  const rows = (d.policies || []).map(p => ({ ...p, st: policyState(p, today) }));
  const open = p => { setCovers(p?.covers || []); setEd(p || {}); };
  const review = p => { store.update('policies', p.id, { reviewedAt: today }, `Politica riesaminata: ${p.title}`); undoToast('Riesame registrato'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Temi B2 coperti" value={`${m.filter(x => x.covered).length}/${m.length}`} status={m.filter(x => x.covered).length >= 8 ? 'ok' : 'warn'} foot="pratica, politica o iniziativa attiva" />
        <Kpi label="Politiche pubbliche" value={nf(rows.filter(p => p.st.active && p.public).length)} foot={`su ${nf(rows.filter(p => p.st.active).length)} attive`} />
        <Kpi label="Con obiettivo misurabile" value={nf(rows.filter(p => p.st.active && p.hasTarget).length)} />
        <Kpi label="Bozze" value={nf(rows.filter(p => p.status === 'bozza').length)} foot="non contano nel B2" />
        <Kpi label="Riesami scaduti" value={nf(rows.filter(p => p.st.reviewOverdue).length)} status={rows.some(p => p.st.reviewOverdue) ? 'warn' : 'ok'} />
      </div>
      <Panel title="Matrice B2 del VS" sub={`Politiche approvate e attive al ${dateIt(P.to)} per tema: pratiche, politiche, iniziative future, pubblicazione e obiettivi`} flush>
        <div className="tw">
          <table className="t ego-matrix">
            <thead><tr><th>Tema</th><th className="c">Pratiche</th><th className="c">Politiche</th><th className="c">Iniziative</th><th className="c">Pubbliche</th><th className="c">Obiettivi</th><th>Voci</th></tr></thead>
            <tbody>{m.map(x => (
              <tr key={x.matter} className={x.covered ? '' : 'ego-uncov'}>
                <td><b>{x.label}</b><span className="sub">{x.dp}</span></td>
                <td className="c"><Tick on={x.practices} /></td><td className="c"><Tick on={x.policies} /></td><td className="c"><Tick on={x.initiatives} /></td><td className="c"><Tick on={x.public} /></td><td className="c"><Tick on={x.targets} /></td>
                <td><span className="ego-wrap">{x.items.length ? x.items.map(p => p.title).join(' · ') : <span className="muted">nessuna politica attiva</span>}{x.drafts.length ? <span className="sub">in bozza: {x.drafts.map(p => p.title).join(', ')}</span> : null}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      <div className="split">
        <Panel title="Registro delle politiche" sub="Codici, politiche, pratiche e iniziative con approvazione, riesame e responsabile" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => open(null)}>Nuova politica</Btn>}>
          <Table rows={rows} pageSize={20} exportName="politiche-esg" onRow={open} cols={[
            { key: 'title', label: 'Titolo', render: p => <span className="ego-wrap"><b>{p.title}</b><span className="sub">{MATTER_LABEL[p.matter] || p.matter} · {p.kind}{p.public ? ' · pubblica' : ''}</span></span>, csv: p => p.title },
            { key: 'status', label: 'Stato', render: p => <Chip kind={STATUS_KIND[p.status] || 'outline'}>{p.status || 'approvata'}</Chip> },
            { key: 'approvedAt', label: 'Approvata', render: p => <span>{dt(p.approvedAt)}<span className="sub">{p.approver || ''}</span></span>, csv: p => p.approvedAt || '' },
            { key: 'review', label: 'Prossimo riesame', render: p => (p.st.nextReview ? <span className="ego-nowrap">{dateIt(p.st.nextReview)} {p.st.reviewOverdue && <Chip kind="warn">scaduto</Chip>}</span> : '—'), csv: p => p.st.nextReview || '', sort: p => p.st.nextReview || '9999' },
            { key: 'target', label: 'Obiettivo', render: p => <span className="ego-wrap">{p.hasTarget ? p.target || 'sì' : '—'}</span>, csv: p => (p.hasTarget ? p.target || 'sì' : '') },
            { key: 'act', label: '', nosort: true, csv: false, render: p => (p.st.active ? <span onClick={e => e.stopPropagation()}><Btn small kind="ghost" icon={LuCircleCheck} onClick={() => review(p)} title="Registra il riesame di oggi">Riesaminata</Btn></span> : null) },
          ]} />
        </Panel>
        <Panel title="Diritti umani nella forza lavoro (C6)" sub="Codice di condotta o politica, temi coperti e meccanismo di reclamo">
          <Kv items={[['Codice o politica', c6.code ? `sì · ${c6.codeSrc}` : 'no'], ['Meccanismo di reclamo', c6.grievance ? 'sì (canale di segnalazione attivo)' : 'no']]} />
          <ul className="ego-c6">{C6_TOPICS.map(t => { const k = { 'lavoro minorile': 'childLabour', 'lavoro forzato': 'forcedLabour', tratta: 'trafficking', discriminazione: 'discrimination', 'prevenzione infortuni': 'accidents' }[t]; return <li key={t}><Tick on={!!c6.topics[k]} /> {t}</li>; })}</ul>
          <p className="xs muted">Contano le politiche attive sui temi «forza lavoro propria» e «condotta»; il codice dei fornitori vale per la catena del valore (B2).</p>
          <h3 className="ego-h3">C2 · responsabile e descrizione</h3>
          <p className="small">{dp['C2.accountable']?.value ? <>Livello più alto responsabile: <b>{dp['C2.accountable'].value}</b></> : 'Responsabile non indicato'}</p>
          <ResponsabileC2 d={d} />
        </Panel>
      </div>
      {ed && (
        <RecordDrawer d={d} coll="policies" rec={ed.id ? ed : null} onClose={() => setEd(null)} labelOf={p => p.title}
          defaults={{ status: 'approvata', kind: 'politica', public: false, hasTarget: false, reviewMonths: 24, covers: [], evidenceIds: [], approvedAt: today }} extra={{ covers }}>
          <fieldset className="ego-fs">
            <legend>Temi dei diritti umani coperti (C6)</legend>
            <div className="ego-checks">{C6_TOPICS.map(t => <label key={t} className="check small"><input type="checkbox" checked={covers.includes(t)} onChange={e => setCovers(x => (e.target.checked ? [...x, t] : x.filter(y => y !== t)))} /> {t}</label>)}</div>
          </fieldset>
          {ed.id && <p className="small"><EvidenceCount d={d} type="policies" refId={ed.id} /></p>}
        </RecordDrawer>
      )}
    </>
  );
}
function ResponsabileC2({ d }) {
  const [v, setV] = useState(governanceSettings(d).accountable || '');
  return (
    <div className="row gap-s">
      <input className="input grow" value={v} maxLength={80} onChange={e => setV(e.target.value)} placeholder="Es. Consiglio di amministrazione" aria-label="Responsabile di livello più alto" />
      <Btn small icon={LuSave} onClick={() => { setEsgSettings('governance', { accountable: v.trim() }, 'Governance: responsabile di livello più alto'); undoToast('Salvato'); }}>Salva</Btn>
    </div>
  );
}

/* ================= organi e ruoli ================= */
export function Organi({ d, P, today }) {
  const [ed, setEd] = useState(null);
  const [role, setRole] = useState(null);
  const b = boardStats(d, P.to);
  const all = d.boardMembers || [];
  const sv = d.survey || {};
  const mismatch = sv['gv-board'] === 'si' && Number.isFinite(+sv['gv-board-n']) && (+sv['gv-board-n'] !== b.members || +sv['gv-board-w'] !== b.women);
  const leave = x => { store.update('boardMembers', x.id, { until: today }, `Organo amministrativo: ${x.role} cessato`); undoToast('Cessazione registrata'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Componenti" value={nf(b.members)} foot={`al ${dateIt(P.to)}`} />
        <Kpi label="Rapporto donne/uomini (C9)" value={b.ratio == null ? '—' : nf(b.ratio, 2)} foot={`${b.women} donne, ${b.men} uomini`} />
        <Kpi label="Indipendenti" value={nf(b.independent)} foot={b.members ? pctTxt(b.independent / b.members) : ''} />
        <Kpi label="Esecutivi" value={nf(b.executive)} />
        <Kpi label="Con competenze di sostenibilità" value={nf(b.esgSkill)} />
      </div>
      {mismatch && <div className="note maize small">Il questionario ESG indica {sv['gv-board-n']} componenti di cui {sv['gv-board-w']} donne: il registro ne ha {b.members} e {b.women}. Il C9 usa il registro.</div>}
      <div className="split">
        <Panel title="Organo amministrativo" sub="Componenti per ruolo, senza nomi: genere, ruolo esecutivo, indipendenza e competenze" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setEd({})}>Componente</Btn>}>
          <Table rows={all} pageSize={20} exportName="organo-amministrativo" onRow={x => setEd(x)} cols={[
            { key: 'role', label: 'Ruolo', render: x => <b>{x.role}</b> }, { key: 'gender', label: 'Genere' },
            { key: 'executive', label: 'Esecutivo', render: x => <Tick on={!!x.executive} />, csv: x => (x.executive ? 'sì' : 'no') },
            { key: 'independent', label: 'Indipendente', render: x => <Tick on={!!x.independent} />, csv: x => (x.independent ? 'sì' : 'no') },
            { key: 'esgSkill', label: 'Sostenibilità', render: x => <Tick on={!!x.esgSkill} />, csv: x => (x.esgSkill ? 'sì' : 'no') },
            { key: 'since', label: 'In carica', render: x => <span>{dt(x.since)}{x.until ? ` – ${dateIt(x.until)}` : ''}</span>, csv: x => `${x.since || ''} ${x.until || ''}` },
            { key: 'act', label: '', nosort: true, csv: false, render: x => (!x.until ? <span onClick={e => e.stopPropagation()}><Btn small kind="ghost" onClick={() => leave(x)}>Cessato oggi</Btn></span> : null) },
          ]} />
        </Panel>
        <Panel title="Ruoli ESG (RACI)" sub="Chi prepara i dati, chi li rivede e chi approva: gli stessi ruoli firmano la chiusura dell’esercizio nel report" flush actions={<Btn small icon={LuPlus} onClick={() => setRole({})}>Ambito</Btn>}>
          <Table rows={d.esgRoles || []} pageSize={20} exportName="ruoli-esg" onRow={x => setRole(x)} cols={[
            { key: 'area', label: 'Ambito', render: x => <b>{x.area}</b> }, { key: 'responsible', label: 'Prepara (R)' }, { key: 'reviewer', label: 'Rivede (C)' }, { key: 'approver', label: 'Approva (A)' },
          ]} />
        </Panel>
      </div>
      {ed && <RecordDrawer d={d} coll="boardMembers" rec={ed.id ? ed : null} onClose={() => setEd(null)} labelOf={x => x.role} defaults={{ executive: false, independent: false, esgSkill: false, since: today, until: null }} />}
      {role && <RecordDrawer d={d} coll="esgRoles" rec={role.id ? role : null} onClose={() => setRole(null)} labelOf={x => x.area} defaults={{ note: '' }} idOf={x => slug(x.area)} />}
    </>
  );
}

/* ================= Modello 231, OdV e segnalazioni ================= */
const OUT_KIND = { efficace: 'good', 'da migliorare': 'warn', 'non efficace': 'crit', 'non testato': 'outline' };
export function Modello231({ d, P, today }) {
  const st = governanceSettings(d);
  const [ed, setEd] = useState(null);
  const [odv, setOdv] = useState(null);
  const [ws, setWs] = useState(null);
  const [m, setM] = useState({ adopted: st.model231?.adopted || '', lastUpdate: st.model231?.lastUpdate || '', odv: st.model231?.odv || '', channel: !!st.whistle?.channel, provider: st.whistle?.provider || '' });
  const ctrl = (d.m231Controls || []).map(c => { const next = c.lastTest && c.testMonths ? addMonths(c.lastTest, +c.testMonths) : null; return { ...c, next, nextState: next ? expiryState(next, today, 30) : 'senza scadenza' }; });
  const stats = [...(d.whistleStats || [])].sort((a, b) => b.year - a.year);
  const tot = stats.reduce((s, x) => s + (+x.received || 0), 0);
  const tested = (c, outcome) => { store.update('m231Controls', c.id, { lastTest: today, outcome }, `Modello 231: verifica del controllo «${c.control.slice(0, 40)}»`); undoToast('Verifica registrata'); };
  const saveModel = () => { setEsgSettings('governance', x => ({ ...x, model231: { ...(x.model231 || {}), adopted: m.adopted || null, lastUpdate: m.lastUpdate || null, odv: m.odv.trim() }, whistle: { ...(x.whistle || {}), channel: m.channel, provider: m.provider.trim() } }), 'Governance: Modello 231 e canale di segnalazione'); undoToast('Salvato'); };
  return (
    <>
      <div className="note maize ego-banner" role="note"><LuShieldAlert aria-hidden="true" /><span>{T('governance.whistle.banner').replace('FeedOS', EDITION.product)}</span></div>
      <div className="kpis">
        <Kpi label="Controlli del Modello" value={nf(ctrl.length)} foot={`${ctrl.filter(c => c.lastTest && daysBetween(c.lastTest, today) <= 365).length} verificati negli ultimi 12 mesi`} />
        <Kpi label="Da migliorare o non efficaci" value={nf(ctrl.filter(c => ['da migliorare', 'non efficace'].includes(c.outcome)).length)} status={ctrl.some(c => c.outcome === 'non efficace') ? 'bad' : ctrl.some(c => c.outcome === 'da migliorare') ? 'warn' : 'ok'} />
        <Kpi label="Relazioni dell’OdV nel periodo" value={nf((d.odvReports || []).filter(r => r.date >= P.from && r.date <= P.to).length)} foot={P.short} />
        <Kpi label="Segnalazioni ricevute" value={nf(tot)} foot={stats.length ? `dal ${stats[stats.length - 1].year}, solo conteggi` : 'nessun anno registrato'} />
      </div>
      <div className="split">
        <Panel title="Controlli del Modello 231" sub="Aree a rischio, controlli, responsabili ed esiti delle verifiche" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setEd({})}>Controllo</Btn>}>
          <Table rows={ctrl} pageSize={20} exportName="controlli-231" onRow={c => setEd(c)} cols={[
            { key: 'area', label: 'Area', render: c => <span className="ego-wrap"><b>{c.area}</b><span className="sub">{c.risk}</span></span>, csv: c => c.area },
            { key: 'control', label: 'Controllo', render: c => <span className="ego-wrap">{c.control}<span className="sub">{c.owner}</span></span> },
            { key: 'outcome', label: 'Esito', render: c => <Chip kind={OUT_KIND[c.outcome] || 'outline'}>{c.outcome || 'non testato'}</Chip> },
            { key: 'next', label: 'Prossima verifica', render: c => (c.next ? <ExpChip state={c.nextState === 'valido' ? 'valido' : c.nextState} days={daysBetween(today, c.next)} /> : '—'), csv: c => c.next || '', sort: c => c.next || '9999' },
            { key: 'act', label: '', nosort: true, csv: false, render: c => <span onClick={e => e.stopPropagation()}><Btn small kind="ghost" icon={LuCircleCheck} onClick={() => tested(c, c.outcome && c.outcome !== 'non testato' ? c.outcome : 'efficace')} title="Registra la verifica di oggi con l’ultimo esito">Verificato</Btn></span> },
          ]} />
        </Panel>
        <div className="stack">
          <Panel title="Modello e canale di segnalazione">
            <div className="form">
              <Field label="Modello adottato il"><input className="input" type="date" value={m.adopted || ''} onChange={e => setM(x => ({ ...x, adopted: e.target.value }))} /></Field>
              <Field label="Ultimo aggiornamento"><input className="input" type="date" value={m.lastUpdate || ''} onChange={e => setM(x => ({ ...x, lastUpdate: e.target.value }))} /></Field>
              <Field label="Organismo di vigilanza"><input className="input" value={m.odv} maxLength={120} onChange={e => setM(x => ({ ...x, odv: e.target.value }))} placeholder="Monocratico, collegiale…" /></Field>
              <Field label="Gestore del canale"><input className="input" value={m.provider} maxLength={120} onChange={e => setM(x => ({ ...x, provider: e.target.value }))} placeholder="Piattaforma o soggetto autonomo" /></Field>
            </div>
            <label className="check small ego-mt"><input type="checkbox" checked={m.channel} onChange={e => setM(x => ({ ...x, channel: e.target.checked }))} /> Canale interno di segnalazione attivo (scritto e orale)</label>
            <div className="row gap-s ego-mt"><Btn small icon={LuSave} onClick={saveModel}>Salva</Btn></div>
          </Panel>
          <Panel title="Relazioni dell’Organismo di vigilanza" flush actions={<Btn small icon={LuPlus} onClick={() => setOdv({})}>Relazione</Btn>}>
            <Table rows={[...(d.odvReports || [])].sort((a, b) => (a.date < b.date ? 1 : -1))} pageSize={10} onRow={r => setOdv(r)} cols={[
              { key: 'date', label: 'Data', render: r => dt(r.date) }, { key: 'summary', label: 'Sintesi', render: r => <span className="ego-wrap">{r.summary}<span className="sub">{r.period}{r.findings ? ` · ${r.findings} rilievi` : ''}</span></span> },
            ]} />
          </Panel>
        </div>
      </div>
      <Panel title="Segnalazioni: solo conteggi annuali" sub="Avviso di ricevimento entro 7 giorni e riscontro entro 3 mesi (D.Lgs. 24/2023): nessun contenuto, nessun nome" flush actions={<Btn small icon={LuPlus} onClick={() => setWs({})}>Anno</Btn>}>
        <Table rows={stats} rowKey={x => x.id} pageSize={10} exportName="segnalazioni-conteggi" onRow={x => setWs(x)} cols={[
          { key: 'year', label: 'Anno', render: x => <b>{x.year}</b> }, { key: 'received', label: 'Ricevute', align: 'r' },
          { key: 'ack', label: 'Avviso entro 7 giorni', align: 'r', render: x => (x.received ? pctTxt((+x.acknowledged7d || 0) / x.received) : '—'), csv: x => x.acknowledged7d },
          { key: 'fb', label: 'Riscontro entro 3 mesi', align: 'r', render: x => (x.received ? pctTxt((+x.feedback3m || 0) / x.received) : '—'), csv: x => x.feedback3m },
          { key: 'substantiated', label: 'Fondate', align: 'r' }, { key: 'retaliation', label: 'Ritorsioni', align: 'r' },
        ]} />
      </Panel>
      {ed && <RecordDrawer d={d} coll="m231Controls" rec={ed.id ? ed : null} onClose={() => setEd(null)} labelOf={c => c.control} defaults={{ outcome: 'non testato', testMonths: 12 }} />}
      {odv && <RecordDrawer d={d} coll="odvReports" rec={odv.id ? odv : null} onClose={() => setOdv(null)} labelOf={r => `relazione del ${dateIt(r.date)}`} defaults={{ date: today, findings: 0, evidenceId: null }} />}
      {ws && <WhistleDrawer d={d} rec={ws.id ? ws : null} onClose={() => setWs(null)} />}
    </>
  );
}
function WhistleDrawer({ d, rec, onClose }) {
  // l'id della riga è l'anno: si ricava al salvataggio
  return <RecordDrawer d={d} coll="whistleStats" rec={rec} onClose={onClose} labelOf={x => `segnalazioni ${x.year}`} defaults={{ received: 0, acknowledged7d: 0, feedback3m: 0, substantiated: 0, retaliation: 0 }}
    idOf={x => (Number.isFinite(+x.year) ? String(Math.round(+x.year)) : '')} />;
}

/* ================= certificati e permessi ================= */
export function CertificatiPermessi({ d, today }) {
  const [cert, setCert] = useState(null);
  const [perm, setPerm] = useState(null);
  const certs = (d.companyCerts || []).map(c => ({ ...c, state: expiryState(c.to, today, 90), days: c.to ? daysBetween(today, c.to) : null }));
  const perms = (d.permits || []).map(p => ({ ...p, state: expiryState(p.to, today, 180), days: p.to ? daysBetween(today, p.to) : null }));
  const soon = [...certs, ...perms].filter(x => x.state === 'in scadenza' || x.state === 'scaduto');
  const horizon = [...certs.map(c => ({ id: c.id, label: c.scheme, to: c.to, kind: 'certificazione' })), ...perms.map(p => ({ id: p.id, label: p.kind, to: p.to, kind: 'autorizzazione' }))].filter(x => x.to).sort((a, b) => (a.to < b.to ? -1 : 1));
  const maxDays = Math.max(365, ...horizon.map(x => daysBetween(today, x.to)));
  return (
    <>
      <div className="kpis">
        <Kpi label="Certificazioni valide" value={nf(certs.filter(c => c.state !== 'scaduto').length)} foot={certs.length ? certs.map(c => c.scheme).join(', ') : 'nessuna registrata'} />
        <Kpi label="Autorizzazioni" value={nf(perms.length)} foot={perms.map(p => p.kind).join(', ')} />
        <Kpi label="In scadenza" value={nf(soon.length)} status={soon.some(x => x.state === 'scaduto') ? 'bad' : soon.length ? 'warn' : 'ok'} foot="certificati entro 90 giorni, permessi entro 180" />
      </div>
      {horizon.length > 0 && (
        <Panel title="Scadenze" sub="Giorni da oggi alla scadenza di ogni certificazione e autorizzazione">
          <ul className="ego-bars">
            {horizon.map(x => { const n = daysBetween(today, x.to); return (
              <li key={x.id}><span className="ego-bars-l">{x.label}<span className="xs muted"> · {x.kind}</span></span>
                <span className="ego-bars-t" aria-hidden="true"><i className={n < 0 ? 'ego-bad' : n <= (x.kind === 'certificazione' ? 90 : 180) ? 'ego-warnb' : ''} style={{ width: `${Math.max(2, Math.min(100, (Math.max(0, n) / maxDays) * 100))}%` }} /></span>
                <span className="ego-bars-v">{dateIt(x.to)} · {dayTxt(n)}</span></li>); })}
          </ul>
        </Panel>
      )}
      <Panel title="Certificazioni dell’azienda" sub="Entrano nel B1 del VS (certificazioni e marchi) e nel calendario degli adempimenti" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setCert({})}>Certificazione</Btn>}>
        <Table rows={certs} pageSize={20} exportName="certificazioni" onRow={c => setCert(c)} cols={[
          { key: 'scheme', label: 'Schema', render: c => <span className="ego-wrap"><b>{c.scheme}</b><span className="sub">{c.scope}</span></span>, csv: c => c.scheme },
          { key: 'issuer', label: 'Ente', render: c => <span>{c.issuer}<span className="sub">{c.number}</span></span>, csv: c => `${c.issuer || ''} ${c.number || ''}` },
          { key: 'to', label: 'Valido fino al', render: c => dt(c.to), csv: c => c.to || '' },
          { key: 'state', label: 'Stato', render: c => <ExpChip state={c.state} days={c.days} /> },
          { key: 'ev', label: 'Evidenze', nosort: true, csv: false, render: c => <span onClick={e => e.stopPropagation()}><EvidenceCount d={d} type="companyCerts" refId={c.id} /></span> },
        ]} />
      </Panel>
      <Panel title="Autorizzazioni e permessi" sub="Le domande di rinnovo entrano nel calendario con l’anticipo previsto (AUA 6 mesi, CPI 1 mese)" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setPerm({})}>Autorizzazione</Btn>}>
        <Table rows={perms} pageSize={20} exportName="autorizzazioni" onRow={p => setPerm(p)} cols={[
          { key: 'kind', label: 'Tipo', render: p => <span className="ego-wrap"><b>{p.kind}</b><span className="sub">{p.conditionsText}</span></span>, csv: p => p.kind },
          { key: 'authority', label: 'Autorità', render: p => <span>{p.authority}<span className="sub">{p.number}</span></span>, csv: p => `${p.authority || ''} ${p.number || ''}` },
          { key: 'from', label: 'Rilasciata', render: p => dt(p.from) },
          { key: 'to', label: 'Scadenza', render: p => dt(p.to), csv: p => p.to || '' },
          { key: 'state', label: 'Stato', render: p => <ExpChip state={p.state} days={p.days} /> },
          { key: 'ev', label: 'Evidenze', nosort: true, csv: false, render: p => <span onClick={e => e.stopPropagation()}><EvidenceCount d={d} type="permits" refId={p.id} /></span> },
        ]} />
      </Panel>
      {cert && <RecordDrawer d={d} coll="companyCerts" rec={cert.id ? cert : null} onClose={() => setCert(null)} labelOf={c => `${c.scheme}${c.number ? ' ' + c.number : ''}`} defaults={{ evidenceId: null }} />}
      {perm && <RecordDrawer d={d} coll="permits" rec={perm.id ? perm : null} onClose={() => setPerm(null)} labelOf={p => `${p.kind}${p.number ? ' ' + p.number : ''}`} defaults={{ conditions: [], evidenceId: null }} />}
    </>
  );
}

/* ================= procedimenti, B11, C7 e C8 ================= */
const C8_KEYS = ['weapons', 'tobacco', 'fossil', 'chemicals'];
export function Legale({ d, P }) {
  const [ed, setEd] = useState(null);
  const st = governanceSettings(d);
  const [v, setV] = useState({ ...(st.c8 || {}), ungc: !!st.ungcViolation });
  const b = b11(d, P), c = c7(d, P), s8 = c8(d, P);
  const save = () => { setEsgSettings('governance', x => ({ ...x, c8: { weapons: v.weapons ?? 0, tobacco: v.tobacco ?? 0, fossil: v.fossil ?? 0, chemicals: v.chemicals ?? null }, ungcViolation: !!v.ungc }), 'Governance: ricavi per settore (C8)'); undoToast('Salvato'); };
  return (
    <>
      <div className="kpis">
        <Kpi label="Condanne per corruzione (B11)" value={nf(b.convictions)} status={b.convictions ? 'bad' : 'ok'} foot={P.short} />
        <Kpi label="Sanzioni per corruzione (B11)" value={eurTxt(b.fines)} foot={P.short} />
        <Kpi label="Incidenti sui diritti umani (C7)" value={nf(c.own.length + c.chain.length)} status={c.own.length + c.chain.length ? 'warn' : 'ok'} foot="confermati nel periodo" />
        <Kpi label="Ricavi da prodotti chimici NACE 20.2 (C8)" value={s8.chemShare == null ? '—' : pctTxt(s8.chemShare)} foot={eurTxt(s8.rows[3].value)} />
      </div>
      <div className="split">
        <Panel title="Procedimenti e sanzioni" sub="Corruzione (B11), diritti umani (C7) e altri procedimenti: data, materia, esito e sanzione" flush actions={<Btn small kind="primary" icon={LuPlus} onClick={() => setEd({})}>Procedimento</Btn>}>
          <Table rows={[...(d.legalCases || [])].sort((a, b) => (a.date < b.date ? 1 : -1))} pageSize={20} exportName="procedimenti" onRow={x => setEd(x)} empty="Nessun procedimento registrato" cols={[
            { key: 'date', label: 'Data', render: x => dt(x.date) }, { key: 'kind', label: 'Materia', render: x => <Chip kind={x.kind === 'corruzione' ? 'crit' : 'outline'}>{x.kind}</Chip> },
            { key: 'description', label: 'Descrizione', render: x => <span className="ego-wrap">{x.description}<span className="sub">{x.scope}{x.authority ? ` · ${x.authority}` : ''}</span></span> },
            { key: 'conviction', label: 'Confermato', render: x => <Tick on={!!x.conviction} />, csv: x => (x.conviction ? 'sì' : 'no') },
            { key: 'fineEur', label: 'Sanzione', align: 'r', render: x => (x.fineEur ? eurTxt(x.fineEur) : '—') }, { key: 'status', label: 'Stato' },
          ]} />
        </Panel>
        <Panel title="Ricavi da settori particolari (C8)" sub={`Periodo ${P.label}: ricavi totali ${eurTxt(s8.total)} · codice NACE ${naceOf(d)}`}>
          <div className="ego-c8" role="list">
            {s8.rows.map(r => (
              <div key={r.key} className="ego-c8-row" role="listitem"><span>{T(`governance.c8.${r.key}`)}</span>
                {r.key === 'chemicals' && s8.chemAuto ? <span className="ego-c8-v">{eurTxt(r.value)}<span className="sub">calcolato dalle consegne</span></span> : <NumInput value={v[r.key] ?? (r.key === 'chemicals' ? null : 0)} onChange={x => setV(o => ({ ...o, [r.key]: x }))} decimals={0} min={0} slim ariaLabel={T(`governance.c8.${r.key}`)} />}</div>
            ))}
          </div>
          <label className="check small ego-mt"><input type="checkbox" checked={!!v.ungc} onChange={e => setV(o => ({ ...o, ungc: e.target.checked }))} /> Violazioni accertate dei principi del Global Compact o delle linee guida OCSE</label>
          <p className="small ego-mt">Esclusione dagli indici UE allineati a Parigi: <b>{s8.excluded ? 'sì' : 'no'}</b> <span className="xs muted">(Reg. delegato (UE) 2020/1818, art. 12; gli agrofarmaci si dichiarano nel C8 ma non escludono)</span></p>
          <div className="row gap-s ego-mt"><Btn small icon={LuSave} onClick={save}>Salva</Btn>{s8.chemAuto ? null : <Btn small kind="ghost" onClick={() => setV(o => ({ ...o, chemicals: null }))}>Prodotti chimici: dal calcolo</Btn>}</div>
          <Disclaimer />
        </Panel>
      </div>
      <Panel title="Testi per il report (C7)" sub="Si aggiornano dal registro dei procedimenti">
        <Kv items={[['Forza lavoro propria', c.own.length ? c.own.map(x => `${dateIt(x.date)}: ${x.description}`).join(' · ') : 'Nessun incidente confermato nella forza lavoro propria nel periodo'],
          ['Catena del valore, comunità, consumatori', c.chain.length ? c.chain.map(x => `${dateIt(x.date)}: ${x.description}`).join(' · ') : 'Nessun incidente confermato nel periodo']]} />
      </Panel>
      {ed && <RecordDrawer d={d} coll="legalCases" rec={ed.id ? ed : null} onClose={() => setEd(null)} labelOf={x => x.description || x.kind} defaults={{ conviction: false, fineEur: 0, status: 'aperto', scope: 'impresa' }} />}
    </>
  );
}
