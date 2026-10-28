/* FeedOS 18 · ESG › Impronta mangimi › Dichiarazioni ai clienti (#esg.passaporto.clienti[.<id>]): elenco dei clienti serviti
 * nell'esercizio con le t CO₂e consegnate, dichiarazione annuale per cliente (stampa, CSV, JSON, Markdown, in italiano o inglese),
 * archivio ZIP di tutte le dichiarazioni, registro degli invii. Solo totali e ripartizioni per prodotto: mai le formule. Prefisso epc-. */
import React, { useMemo, useState } from 'react';
import { LuPrinter, LuDownload, LuFileArchive, LuCheck, LuArrowRight, LuFileText, LuShieldCheck, LuShieldAlert } from 'react-icons/lu';
import { go } from '../core/router.js';
import { NAV } from '../app/nav.js';
import { download, toCSV, stamp } from '../core/io.js';
import { zipStore } from '../core/zip.js';
import { nf, dateIt } from '../core/util.js';
import { T } from '../engine/esg-nlg.js';
import { checkClaim } from '../engine/esg-governance.js';
import { customerTotals, pcfSettings } from '../engine/esg-pcf.js';
import { customerStatement, statementLines, statementMarkdown, statementCsvRows, statementCsvCols, statementFileBase } from '../engine/esg-pcf-exchange.js';
import { Panel, Kpi, Table, Btn, Chip, Select, Seg, Empty } from '../ui/ui.jsx';
import { PrintPage, printNow } from '../ui/print.jsx';
import { Disclaimer, setEsgSettings } from './esg-shared.jsx';
import { kgTxt, tTxt, pctTxt, undoToast, downloadCsv, downloadText, downloadJson } from './esg-pcf-ui.jsx';

const A = x => (Array.isArray(x) ? x : []);

export function Clienti({ d, P, today, pick }) {
  const list = useMemo(() => {
    const ids = new Set();
    for (const s of A(d.shipments)) if (s && s.date >= P.from && s.date <= P.to) ids.add(s.customerId);
    return A(d.customers).filter(c => c && ids.has(c.id)).map(c => ({ c, ct: customerTotals(d, c.id, P) })).filter(x => x.ct && x.ct.totals.t > 0).sort((a, b) => b.ct.totals.tco2e - a.ct.totals.tco2e);
  }, [d, P.key]);
  const sent = pcfSettings(d).sent.filter(x => x && x.periodKey === P.key);
  if (!list.length) return <Panel title="Dichiarazioni ai clienti"><Empty icon={LuFileText} title="Nessuna consegna nel periodo">La dichiarazione nasce dalle consegne del cliente, dai lotti prodotti e dall’impronta delle versioni delle formule.</Empty></Panel>;
  if (pick && list.some(x => x.c.id === pick)) return <Dichiarazione d={d} P={P} today={today} list={list} id={pick} sent={sent} />;
  return <Elenco d={d} P={P} list={list} sent={sent} />;
}

function Elenco({ d, P, list, sent }) {
  const [lang, setLang] = useState('it');
  const [busy, setBusy] = useState(false);
  const tot = list.reduce((s, x) => s + x.ct.totals.tco2e, 0), tt = list.reduce((s, x) => s + x.ct.totals.t, 0);
  const sentIds = new Set(sent.map(x => x.customerId));
  const rows = list.map(({ c, ct }) => ({ id: c.id, name: c.name, type: c.type, t: ct.totals.t, tco2e: ct.totals.tco2e, kgPerT: ct.totals.kgPerT, luc: ct.totals.lucShare, dcf: ct.dcfEstimate, traced: ct.tracedShare, sent: sent.find(x => x.customerId === c.id) || null }));
  const zip = () => {
    setBusy(true);
    try {
      const files = [], index = [];
      for (const r of rows) {
        const st = customerStatement(d, r.id, P, lang);
        if (!st) continue;
        const base = statementFileBase(st);
        files.push({ name: `${base}.json`, data: JSON.stringify(st, null, 2) });
        files.push({ name: `${base}.csv`, data: toCSV(statementCsvRows(st), statementCsvCols(lang)) });
        files.push({ name: `${base}.md`, data: statementMarkdown(st) });
        index.push({ cliente: st.customer.name, codice: st.customer.code, t: st.totals.t, tco2e: st.totals.tco2e, kgPerT: st.totals.kgPerT, lucShare: st.totals.lucShare, file: base, sha256: st.hash });
      }
      files.unshift({ name: 'indice.csv', data: toCSV(index, [{ key: 'cliente', label: lang === 'en' ? 'Customer' : 'Cliente' }, { key: 'codice', label: lang === 'en' ? 'Code' : 'Codice' }, { key: 't', label: 't' }, { key: 'tco2e', label: 't CO₂e' }, { key: 'kgPerT', label: 'kg CO₂e/t' }, { key: 'lucShare', label: 'LUC' }, { key: 'file', label: 'File' }, { key: 'sha256', label: 'SHA-256' }]) });
      const bytes = zipStore(files, { date: P.to });
      download(`feedos-dichiarazioni-impronta-${P.key || P.to}-${stamp()}.zip`, new Blob([bytes], { type: 'application/zip' }), 'application/zip');
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="kpis">
        <Kpi label="Clienti serviti" value={nf(list.length)} foot={P.label} />
        <Kpi label="Dichiarazioni inviate" value={nf(sentIds.size)} foot={`su ${nf(list.length)} clienti`} status={sentIds.size ? 'ok' : undefined} />
        <Kpi label="Impronta consegnata" value={tTxt(tot)} unit="t CO₂e" foot={`${nf(tt)} t di mangimi`} />
        <Kpi label="Media" value={kgTxt(tt ? tot * 1000 / tt : null)} unit="kg CO₂e/t" foot="sulle consegne del periodo" />
      </div>
      <Panel title="Dichiarazioni annuali per cliente" sub="Per lo Scope 3 categoria 1 di allevatori, caseifici e integratori: consegne × impronta della versione della formula del lotto" flush
        actions={<><Seg options={[{ id: 'it', label: 'IT' }, { id: 'en', label: 'EN' }]} value={lang} onChange={setLang} label="Lingua dell’archivio" />
          <Btn small icon={LuFileArchive} onClick={zip} disabled={busy}>Archivio ZIP di tutte</Btn></>}>
        <Table rows={rows} onRow={r => go('esg', 'passaporto', `clienti.${r.id}`)} initialSort={{ key: 'tco2e', dir: 'desc' }} exportName="impronta-clienti" cols={[
          { key: 'name', label: 'Cliente', render: r => <><b>{r.name}</b><span className="sub">{r.type}</span></> },
          { key: 't', label: 't consegnate', align: 'r', render: r => nf(r.t) },
          { key: 'tco2e', label: 't CO₂e', align: 'r', render: r => <b>{tTxt(r.tco2e)}</b> },
          { key: 'kgPerT', label: 'kg CO₂e/t', align: 'r', render: r => kgTxt(r.kgPerT) },
          { key: 'luc', label: 'LUC', align: 'r', csv: r => (r.luc == null ? null : r.luc * 100), render: r => pctTxt(r.luc) },
          { key: 'dcf', label: 'Soia DCF (stima)', align: 'r', csv: r => (r.dcf == null ? null : r.dcf * 100), render: r => (r.dcf == null ? <span className="muted">—</span> : pctTxt(r.dcf)) },
          { key: 'traced', label: 'Lotti tracciati', align: 'r', csv: r => (r.traced == null ? null : r.traced * 100), render: r => pctTxt(r.traced) },
          { key: 'sent', label: 'Dichiarazione', csv: r => (r.sent ? `inviata il ${r.sent.at}` : 'da inviare'), render: r => (r.sent ? <Chip kind="good">inviata il {dateIt(r.sent.at, 'dm')}</Chip> : <Chip kind="outline">da inviare</Chip>) },
        ]} />
      </Panel>
      <p className="small muted">L’archivio ZIP contiene per ogni cliente la dichiarazione in JSON, CSV e Markdown con la sua impronta digitale SHA-256, più l’indice. Le formule non sono mai incluse.</p>
    </>
  );
}

function Dichiarazione({ d, P, today, list, id, sent }) {
  const [lang, setLang] = useState('it');
  const st = useMemo(() => customerStatement(d, id, P, lang), [d, id, P.key, lang]);
  const rec = sent.find(x => x.customerId === id) || null;
  const claim = useMemo(() => { try { return checkClaim(st ? statementLines(st).join('\n') : '', { kind: 'dichiarazione-impronta' }); } catch { return { ok: true, findings: [] }; } }, [st]);
  if (!st) return <Empty title="Cliente non trovato" />;
  const base = statementFileBase(st);
  const t = st.totals;
  const L = k => T(k, {}, lang);
  const markSent = () => setEsgSettings('pcf', cur => ({ ...cur, sent: [...A(cur.sent).filter(x => !(x && x.customerId === id && x.periodKey === P.key)), { customerId: id, periodKey: P.key, at: today, lang, format: 'pdf', hash: st.hash }].slice(-500) }),
    `Dichiarazione d’impronta inviata: ${st.customer.name}`) && undoToast(`Dichiarazione per ${st.customer.name} segnata come inviata`);
  const lines = statementLines(st);
  return (
    <>
      <Panel title="Dichiarazione d’impronta per un cliente" sub="Totali per prodotto e ripartizione FLAG: la base per lo Scope 3 del cliente" className="no-print"
        actions={<>
          <Select value={id} onChange={v => go('esg', 'passaporto', `clienti.${v}`)} ariaLabel="Cliente" options={list.map(x => ({ id: x.c.id, label: `${x.c.name} · ${nf(x.ct.totals.t)} t` }))} className="auto" />
          <Seg options={[{ id: 'it', label: 'IT' }, { id: 'en', label: 'EN' }]} value={lang} onChange={setLang} label="Lingua della dichiarazione" />
        </>}>
        <div className="kpis">
          <Kpi label="Mangime consegnato" value={tTxt(t.t)} unit="t" foot={`${st.rows.length} prodotti`} />
          <Kpi label="Impronta" value={tTxt(t.tco2e)} unit="t CO₂e" foot={`${kgTxt(t.kgPerT)} kg CO₂e/t`} />
          <Kpi label="Cambio d’uso del suolo" value={pctTxt(t.lucShare, 1)} foot={`${tTxt(t.lucT)} t CO₂e · FLAG ${pctTxt(t.flagShare)}`} />
          <Kpi label="Soia senza deforestazione" value={pctTxt(st.soy.dcfShare)} foot={st.soy.basis} />
          <Kpi label="Riferimenti EUDR" value={nf(st.eudr.n)} foot={st.eudr.coverage == null ? 'nessuna materia prima in ambito' : `${pctTxt(st.eudr.coverage)} delle quantità in ambito`} />
        </div>
        <div className="row gap-s epc-mt">
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuDownload} onClick={() => downloadCsv(base, statementCsvRows(st), statementCsvCols(lang))}>CSV</Btn>
          <Btn small icon={LuDownload} onClick={() => downloadJson(base, st)}>JSON</Btn>
          <Btn small kind="ghost" icon={LuDownload} onClick={() => downloadText(base, 'md', statementMarkdown(st), 'text/markdown;charset=utf-8')}>Markdown</Btn>
          <Btn small kind={rec ? 'ghost' : ''} icon={LuCheck} onClick={markSent}>{rec ? `Inviata il ${dateIt(rec.at)}: aggiorna` : 'Segna come inviata'}</Btn>
          {NAV.esg?.tabs.some(x => x.id === 'filiera') && <Btn small kind="ghost" icon={LuArrowRight} onClick={() => go('esg', 'filiera', `clienti.${id}`)}>Lettera EUDR</Btn>}
          <Btn small kind="ghost" onClick={() => go('esg', 'passaporto', 'clienti')}>Tutti i clienti</Btn>
        </div>
        <p className="small epc-mt">{claim.ok && !A(claim.findings).length ? <Chip kind="good" icon={LuShieldCheck}>controllo delle dichiarazioni superato</Chip> : <Chip kind="warn" icon={LuShieldAlert}>{A(claim.findings).length} termini da rivedere</Chip>}
          <span className="muted"> · per le consegne senza lotto tracciato ({pctTxt(1 - (st.traceability.tracedShare ?? 1))}) vale l’impronta della formula in vigore</span></p>
      </Panel>
      <PrintPage title={L('pcf.statement.title')} period={lang === 'en' ? `${st.period.from} – ${st.period.to}` : `${dateIt(st.period.from)} – ${dateIt(st.period.to)}`} issued={st.issuedAt} className="epc-letter" footer={L('pcf.statement.footer')}>
        <p className="epc-l-to"><b>{L('pcf.statement.customer')}:</b> {st.customer.name}{st.customer.code ? ` (${st.customer.code})` : ''}<br /><b>{L('pcf.statement.supplier')}:</b> {st.company.name}{st.company.approval ? ` · ${st.company.approval}` : ''}</p>
        <p>{lines[2]}</p>
        <div className="tw"><table className="t epc-l-t">
          <thead><tr><th>{L('pcf.statement.product')}</th><th className="r">{L('pcf.statement.tonnes')}</th><th className="r">{L('pcf.statement.kgPerT')}</th><th className="r">{L('pcf.statement.tco2e')}</th><th className="r">{L('pcf.statement.luc')}</th><th className="r">{L('pcf.statement.lm')}</th><th className="r">{L('pcf.statement.nonFlag')}</th><th className="r">{L('pcf.statement.ha')}</th></tr></thead>
          <tbody>{st.rows.map(r => <tr key={r.productId}><td>{r.name}</td><td className="r">{nf(r.t, 1)}</td><td className="r">{nf(r.kgPerT)}</td><td className="r">{nf(r.tco2e, 1)}</td><td className="r">{nf(r.lucT, 1)}</td><td className="r">{nf(r.landMgmtT, 1)}</td><td className="r">{nf(r.nonFlagT, 1)}</td><td className="r">{nf(r.ha, 1)}</td></tr>)}</tbody>
          <tfoot><tr><td><b>{L('pcf.statement.total')}</b></td><td className="r"><b>{nf(t.t, 1)}</b></td><td className="r"><b>{nf(t.kgPerT)}</b></td><td className="r"><b>{nf(t.tco2e, 1)}</b></td><td className="r">{nf(t.lucT, 1)}</td><td className="r">{nf(t.landMgmtT, 1)}</td><td className="r">{nf(t.nonFlagT, 1)}</td><td className="r">{nf(t.ha, 1)}</td></tr></tfoot>
        </table></div>
        {lines.slice(3, -1).map((x, i) => <p key={i}>{x}</p>)}
        {st.eudr.refs.length > 0 && <p className="xs epc-refs"><b>{L('pcf.statement.eudr')}:</b> {st.eudr.refs.slice(0, 40).map(r => `${r.ref}${r.country ? ` (${r.country})` : ''}`).join(' · ')}{st.eudr.refs.length > 40 ? ` … (+${st.eudr.refs.length - 40})` : ''}</p>}
        <p className="xs">{L('pcf.statement.noRecipe')}</p>
        <p className="xs">{L('pcf.statement.fingerprint')}: <span className="mono epc-hash">{st.hash}</span></p>
        <Disclaimer lang={lang} />
      </PrintPage>
    </>
  );
}
