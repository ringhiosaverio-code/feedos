/* FeedOS 17 · Centro della qualità dei dati (pacchetto WP7): punteggio con andamento, punteggio per area, regole con i record
 * da correggere e il collegamento alla scheda o alla pagina giusta, esportazione degli errori; badge nel menu laterale.
 * Contratto della fondazione: DqBadge() nel menu laterale; il pacchetto aggiunge la scheda Dati › Qualità dei dati. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuShieldCheck, LuChevronDown, LuChevronRight, LuDownload, LuWrench } from 'react-icons/lu';
import { useData, store, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { ctxOf, appToday } from '../core/derived.js';
import { usePrefs } from '../core/prefs.js';
import { nf, dateIt } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { runRules, DQ_AREAS } from '../engine/dataquality.js';
import { Panel, Kpi, Chip, Btn, Empty } from '../ui/ui.jsx';
import { LineChart } from '../ui/charts.jsx';

const SEV = { critico: { kind: 'crit', label: 'critica' }, attenzione: { kind: 'warn', label: 'attenzione' }, info: { kind: '', label: 'informativa' } };
const scoreColor = s => (s == null ? 'var(--axis)' : s >= 90 ? 'var(--good)' : s >= 75 ? 'var(--warn)' : 'var(--crit)');
const fix = l => { if (!l) return; if (l.drawer) openDrawer(l.drawer[0], l.drawer[1]); else go(l.area, l.tab, l.id); };

function Ring({ score, size = 132 }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score ?? 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Punteggio ${nf(score ?? 0)} su 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(score)} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: size / 4, fontWeight: 700, fill: 'var(--ink)' }}>{score == null ? '—' : nf(score)}</text>
    </svg>
  );
}

export function QualitaDati({ d }) {
  const ctx = ctxOf(d);
  const today = appToday(d);
  const lastBackupAt = usePrefs(p => p.lastBackupAt);
  const R = useMemo(() => runRules(d, ctx, { lastBackupAt: lastBackupAt ?? null }), [d, ctx, lastBackupAt]);
  const [open, setOpen] = useState(null);
  // storico giornaliero del punteggio (ultimi 90 giorni), scritto senza entrare nella cronologia
  useEffect(() => {
    if (R.score == null) return;
    const h = d.settings?.dq?.history || [];
    if (h.length && h[h.length - 1].date === today && Math.abs(h[h.length - 1].score - R.score) < 0.05) return;
    store.batch([{ kind: 'settings', value: st => ({ ...st, dq: { ...(st.dq || {}), history: [...(st.dq?.history || []).filter(x => x.date !== today), { date: today, score: Math.round(R.score * 10) / 10 }].slice(-90) } }) }], 'Qualità dei dati', { silent: true });
  }, [R.score, today]);
  const hist = d.settings?.dq?.history || [];
  const bad = R.rules.filter(r => !r.ok);
  const exportCsv = () => {
    const rows = R.rules.flatMap(r => r.fails.map(f => ({ rule: r.id, label: r.label, severity: r.severity, coll: f.coll, id: f.id, msg: f.msg })));
    download(`qualita-dati-${stamp()}.csv`, toCSV(rows, [{ key: 'rule', label: 'Regola' }, { key: 'label', label: 'Descrizione' }, { key: 'severity', label: 'Gravità' }, { key: 'coll', label: 'Archivio' }, { key: 'id', label: 'Record' }, { key: 'msg', label: 'Dettaglio' }]), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <div className="split">
        <Panel title="Punteggio della qualità dei dati" sub="100 = tutte le regole rispettate · una regola critica (tracciabilità, bilancio di massa dei lotti) perde tutto il suo peso al primo errore" id="dq-score">
          <div className="row" style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring score={R.score} />
            <div className="stack" style={{ gap: 6, flex: 1, minWidth: 220 }}>
              {Object.entries(R.byArea).map(([a, s]) => (
                <div key={a} className="row between small"><span>{DQ_AREAS[a]}</span><span className="row gap-s" style={{ minWidth: 160 }}><span className="meter" style={{ flex: 1 }}><i style={{ width: s + '%', background: scoreColor(s) }} /></span><b className="num">{nf(s)}</b></span></div>
              ))}
            </div>
          </div>
          {hist.length > 1 && <div style={{ marginTop: 12 }}><LineChart labels={hist.map(h => dateIt(h.date, 'dm'))} height={120} unit="" decimals={0} area={false} yMin={50} yMax={100} xEvery={Math.max(1, Math.ceil(hist.length / 6))} series={[{ key: 's', label: 'Punteggio', color: 'var(--s1)', values: hist.map(h => h.score) }]} ariaLabel="Andamento del punteggio" /></div>}
        </Panel>
        <div className="kpis" style={{ alignContent: 'start' }}>
          <Kpi label="Regole rispettate" value={`${R.rules.filter(r => r.ok).length}/${R.rules.length}`} status={bad.some(r => r.severity === 'critico') ? 'bad' : bad.length ? 'warn' : 'ok'} />
          <Kpi label="Errori critici" value={nf(bad.filter(r => r.severity === 'critico').reduce((s, r) => s + r.failCount, 0))} foot="tracciabilità e bilancio di massa" />
          <Kpi label="Record da correggere" value={nf(bad.reduce((s, r) => s + r.failCount, 0))} foot={`${bad.length} regole`} />
          <Kpi label="Record controllati" value={nf(R.rules.reduce((s, r) => s + r.base, 0))} foot="a ogni modifica" />
        </div>
      </div>
      <Panel title="Regole di controllo" sub="Le stesse regole valgono alla chiusura del mese e nelle importazioni · clic su una regola per i record, «Correggi» apre la scheda" flush id="dq-rules"
        actions={<Btn small icon={LuDownload} onClick={exportCsv} disabled={!bad.length}>CSV degli errori</Btn>}>
        <div className="tw">
          <table className="t">
            <thead><tr><th>Regola</th><th>Area</th><th>Gravità</th><th className="r">Controllati</th><th className="r">Da correggere</th><th>Esempio</th></tr></thead>
            <tbody>
              {R.rules.map(r => (
                <React.Fragment key={r.id}>
                  <tr className={r.failCount ? 'click' : ''} onClick={r.failCount ? () => setOpen(open === r.id ? null : r.id) : undefined} aria-expanded={r.failCount ? open === r.id : undefined}>
                    <td><span className="row gap-s" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>{r.failCount ? (open === r.id ? <LuChevronDown aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} /> : <LuChevronRight aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />) : <LuShieldCheck aria-hidden="true" style={{ color: 'var(--good)', flex: 'none', marginTop: 2 }} />}<b>{r.label}</b></span></td>
                    <td className="small">{DQ_AREAS[r.area]}</td>
                    <td><Chip kind={SEV[r.severity].kind}>{SEV[r.severity].label}</Chip></td>
                    <td className="r">{r.base ? nf(r.base) : '—'}</td>
                    <td className="r">{r.failCount ? <Chip kind={r.severity === 'critico' ? 'crit' : 'warn'}>{nf(r.failCount)}</Chip> : <Chip kind="good">0</Chip>}</td>
                    <td className="small muted">{r.fails[0]?.msg || (r.base ? 'nessun errore' : 'niente da controllare')}</td>
                  </tr>
                  {open === r.id && r.fails.slice(0, 25).map(f => (
                    <tr key={r.id + f.id} className="sub-row">
                      <td colSpan={5} className="small" style={{ paddingLeft: 36 }}>{f.msg}</td>
                      <td>{f.link && <Btn small icon={LuWrench} onClick={() => fix(f.link)}>Correggi</Btn>}</td>
                    </tr>
                  ))}
                  {open === r.id && r.failCount > 25 && <tr className="sub-row"><td colSpan={6} className="small muted" style={{ paddingLeft: 36 }}>… e altri {nf(r.failCount - 25)}: esporta il CSV degli errori.</td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {!R.rules.length && <Empty title="Nessuna regola da eseguire" />}
    </>
  );
}

/** Punteggio della qualità dei dati nel menu laterale (calcolato a modifiche ferme). */
export function DqBadge() {
  const d = useData();
  const lastBackupAt = usePrefs(p => p.lastBackupAt);
  const [score, setScore] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => { try { setScore(runRules(d, ctxOf(d), { lastBackupAt: lastBackupAt ?? null }).score); } catch { setScore(null); } }, 400);
    return () => clearTimeout(t);
  }, [d, lastBackupAt]);
  if (score == null) return null;
  return (
    <a href="#dati.qualita" className="dq-badge" title="Qualità dei dati: apri le regole e i record da correggere" onClick={e => { e.preventDefault(); go('dati', 'qualita'); }}>
      <i style={{ background: scoreColor(score) }} aria-hidden="true" /><span className="txt">Qualità dei dati {nf(score)}/100</span>
    </a>
  );
}
