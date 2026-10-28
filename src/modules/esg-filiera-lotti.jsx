/* FeedOS 18 · ESG › EUDR e fornitori: registro dei lotti in ambito (filtri, riferimenti DDS incollati dal foglio del fornitore),
 * scheda del lotto (tre indicatori spiegati, rischio con le componenti, dati, GeoJSON con controllo e mappa, tracciabilità),
 * quote della soia (consumo e acquisti, origini, andamento, «Indagine soia») e registro della soia DCF con i crediti.
 * Prefisso CSS efl-. Scritture con store.batch e un'etichetta italiana. */
import React, { useMemo, useState } from 'react';
import { LuArrowLeft, LuClipboardPaste, LuSave, LuUpload, LuDownload, LuMap, LuPlus, LuTrash2, LuFileSpreadsheet, LuFileJson, LuDatabase } from 'react-icons/lu';
import { store, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { traceIndex } from '../core/derived.js';
import { nf, dateIt, monthsIn, endOfMonth, monthLabel, norm, sum } from '../core/util.js';
import { readFile } from '../core/io.js';
import { sha256HexSync } from '../core/hash.js';
import { recall } from '../engine/trace.js';
import { eudrRegister, normDdsRef, validDdsRef, normCountry, countryName, packList, schemeOf, soyShares, soySurvey, dcfBalance, creditsInPeriod } from '../engine/esg-filiera.js';
import { validateGeoJSON, plotsToGeoJSON, plotMapSvg } from '../engine/esg-filiera-geo.js';
import { COUNTRY_NAMES } from '../data/pack-filiera.js';
import { COC_OPTIONS, SCHEME_OPTIONS } from '../data/fields-filiera.js';
import { Panel, Kpi, Table, Btn, Chip, Field, Select, Seg, Empty, Kv, NumInput, SearchBox, filterRows, confirm } from '../ui/ui.jsx';
import { StackBar, LineChart, Legend, SERIES } from '../ui/charts.jsx';
import { StatusChip, EvidenceCount } from './esg-shared.jsx';
import { pctTxt, tTxt, eurTxt, undoToast, downloadCsv, downloadText, TierChip, BandChip, StateChip, Flags, Check, PlotMap, shortName } from './esg-filiera-ui.jsx';

const FILTERS = [['tutti', 'Tutti i lotti'], ['senza-dds', 'Senza riferimento DDS'], ['incompleti', 'Dati incompleti'], ['rischio', 'Rischio interno medio o alto'], ['paese-alto', 'Paese ad alto rischio'], ['diretti', 'Importati direttamente']];
const PRED = { tutti: () => true, 'senza-dds': r => !r.status.hasRef, incompleti: r => r.status.state !== 'completo', rischio: r => r.risk.band === 'medio' || r.risk.band === 'alto', 'paese-alto': r => r.tier === 'alto', diretti: r => r.directImport };
const COUNTRY_OPTS = [{ id: '', label: '— non indicato —' }, ...Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1], 'it')).map(([k, v]) => ({ id: k, label: `${v} (${k})` }))];

/* ================= registro dei lotti ================= */
export function Lotti({ d, P, today }) {
  const reg = eudrRegister(d);
  const [f, setF] = useState('tutti');
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState(false);
  const base = all ? reg.rows : reg.rows.filter(r => r.date >= P.from && r.date <= P.to);
  const rows = filterRows(base.filter(PRED[f]), q, ['code', 'ddt', r => r.ing?.name, 'supplierName', 'countryName', r => r.refs.join(' '), r => r.e?.scheme || '']);
  const t = sum(base, r => r.t), tRef = sum(base.filter(r => r.status.hasRef), r => r.t);
  if (!reg.rows.length) return <Panel title="Lotti in ambito EUDR"><Empty icon={LuDatabase} title="Nessun lotto di materie prime in ambito">Conferma la classificazione delle materie prime (soia, palma…) in «Materie prime»: i lotti di arrivo di quelle materie compaiono qui.</Empty></Panel>;
  return (
    <>
      <div className="kpis">
        <Kpi label={all ? 'Lotti in ambito (archivio)' : 'Lotti in ambito nel periodo'} value={nf(base.length)} foot={`${tTxt(t)} t ricevute`} />
        <Kpi label="Con riferimento DDS" value={pctTxt(t ? tRef / t : null)} status={!t ? undefined : tRef / t >= 0.95 ? 'ok' : tRef / t >= 0.8 ? 'warn' : 'bad'} foot={`${nf(base.filter(r => r.status.hasRef).length)} lotti`} onClick={() => setF('senza-dds')} />
        <Kpi label="Dati incompleti" value={nf(base.filter(r => r.status.state === 'incompleto').length)} foot="riferimento, paese o requisiti del ruolo" onClick={() => setF('incompleti')} />
        <Kpi label="Rischio interno medio o alto" value={pctTxt(t ? sum(base.filter(PRED.rischio), r => r.t) / t : null)} foot="quota delle tonnellate" onClick={() => setF('rischio')} />
      </div>
      <Panel title="Registro dei lotti in ambito" sub={`Lotti di arrivo di materie prime dell’allegato I · ruolo: ${reg.role.label} · clic per la scheda del lotto`} flush id="efl-lotti"
        actions={<>
          <Select value={f} onChange={setF} options={FILTERS.map(([id, label]) => ({ id, label }))} ariaLabel="Filtro dei lotti" />
          <label className="check small"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> tutto l’archivio</label>
          <SearchBox value={q} onChange={setQ} placeholder="Cerca lotto, DDT, fornitore, riferimento" />
          <Btn small icon={LuClipboardPaste} onClick={() => setPaste(x => !x)}>Incolla riferimenti</Btn>
        </>}>
        {paste && <IncollaDds d={d} today={today} onDone={() => setPaste(false)} />}
        <Table rows={rows} pageSize={40} exportName="eudr-lotti" initialSort={{ key: 'date', dir: 'desc' }} onRow={r => go('esg', 'filiera', 'lotto.' + r.id)} cols={[
          { key: 'date', label: 'Arrivo', render: r => dateIt(r.date) },
          { key: 'code', label: 'Lotto', render: r => <span><b>{r.code}</b>{r.directImport && <> <Chip kind="violet">import diretto</Chip></>}<span className="sub">{r.ing?.name} · NC {r.hs || '—'}</span></span>, csv: r => r.code },
          { key: 'materia', label: 'Materia prima', csvOnly: true, csv: r => r.ing?.name },
          { key: 'supplierName', label: 'Fornitore', render: r => shortName(r.supplierName) },
          { key: 't', label: 't', align: 'r', render: r => tTxt(r.t) },
          { key: 'country', label: 'Paese', render: r => (r.country ? <span>{r.countryName}<span className="sub"><TierChip tier={r.tier} /></span></span> : <Chip kind="crit">mancante</Chip>), csv: r => r.country || '', sort: r => r.countryName },
          { key: 'tier', label: 'Rischio paese', csvOnly: true, csv: r => r.tier || '' },
          { key: 'ref', label: 'Riferimento DDS', render: r => (r.refs.length ? <span className="mono efl-ref">{r.refs[0]}{r.refs.length > 1 ? ` +${r.refs.length - 1}` : ''}</span> : <Chip kind="warn">mancante</Chip>), csv: r => r.refs.join(' '), sort: r => r.refs[0] || '' },
          { key: 'scheme', label: 'Schema', render: r => (r.e?.scheme && r.e.scheme !== 'nessuno' ? <span>{r.e.scheme}<span className="sub">{r.e.coc}</span></span> : <span className="muted">nessuno</span>), csv: r => r.e?.scheme || '', sort: r => r.e?.scheme || '' },
          { key: 'flags', label: 'EUDR · DCF · SSG', nosort: true, render: r => <Flags s={r.status} />, csv: r => `${r.status.eudrOk ? 'EUDR sì' : 'EUDR no'}; ${r.status.dcf ? 'DCF' : r.status.dcfMB ? 'DCF bilancio di massa' : 'no DCF'}; ${r.status.ssg ? 'SSG' : 'no SSG'}` },
          { key: 'risk', label: 'Rischio interno', align: 'r', render: r => <BandChip band={r.risk.band} score={r.risk.score} />, sort: r => r.risk.score, csv: r => r.risk.score },
          { key: 'state', label: 'Stato', render: r => <StateChip state={r.status.state} />, sort: r => r.status.state, csv: r => r.status.state },
        ]} />
      </Panel>
      <p className="small muted">Per un file CSV del fornitore usa Dati › Importa › «Riferimenti DDS (EUDR)»: il lotto si riconosce dal codice o dal documento di trasporto e un secondo invio aggiorna senza duplicare. <button type="button" className="linkish" onClick={() => go('dati', 'importa')}>Apri l’importazione</button></p>
    </>
  );
}

function parsePaste(d, txt) {
  const reg = eudrRegister(d);
  const byKey = new Map();
  for (const l of d.ingLots || []) for (const k of [l.id, l.code, l.ddt]) if (k) byKey.set(norm(String(k)).trim(), l);
  return String(txt || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 500).map((line, i) => {
    const parts = (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',')).map(x => x.trim());
    const il = byKey.get(norm(parts[0] || '').trim()) || null;
    const ref = normDdsRef(parts[1] || '');
    const country = parts[2] ? normCountry(parts[2]) : null;
    const row = il ? reg.byId.get(il.id) : null;
    const status = !il ? (i === 0 && /lotto|lot|ddt/i.test(parts[0] || '') ? 'intestazione' : 'lotto non trovato') : !row ? 'materia prima fuori ambito' : !ref ? 'riferimento vuoto' : row.refs.includes(ref) && (!country || row.country === country) ? 'già registrato' : validDdsRef(ref) ? 'da registrare' : 'da registrare (formato da verificare)';
    return { i: i + 1, line, il, row, ref, country, countryRaw: parts[2] || '', status };
  });
}
function IncollaDds({ d, today, onDone }) {
  const [txt, setTxt] = useState('');
  const rows = useMemo(() => parsePaste(d, txt), [d, txt]);
  const ok = rows.filter(r => r.status.startsWith('da registrare'));
  const apply = () => {
    const objs = ok.map(r => {
      const e = r.row.e;
      const country = r.country || e?.country || null;
      const keep = e?.status === 'respinto' || e?.status === 'in verifica';
      return { id: e?.id || `eu-${r.il.id}`, ingLotId: r.il.id, ingId: r.il.ingId, supplierId: r.il.supplierId || null, ddsRef: r.ref, ...(r.country ? { country: r.country } : {}), status: keep ? e.status : country ? 'completo' : 'incompleto', source: 'incollato dal foglio del fornitore', updatedAt: today };
    });
    store.batch([{ kind: 'upsertMany', coll: 'eudrLots', key: 'ingLotId', objs }], `EUDR: ${objs.length} riferimenti DDS incollati`);
    undoToast(`${objs.length} riferimenti registrati`); onDone();
  };
  return (
    <div className="efl-paste">
      <p className="small">Una riga per lotto: <b>lotto</b> (codice o documento di trasporto), <b>riferimento DDS</b> e, se c’è, <b>paese di produzione</b>, separati da tabulazione (copia da un foglio di calcolo), punto e virgola o virgola.</p>
      <textarea className="input efl-ta" rows={5} value={txt} onChange={e => setTxt(e.target.value)} placeholder={'M07-26286-00\t26NL4K7Q2M9XBD\tBR\nDDT 8856; 26ITK7Q2M9X4BD; Argentina'} aria-label="Riferimenti da incollare" />
      {rows.length > 0 && (
        <div className="tw efl-mt"><table className="t"><thead><tr><th>Riga</th><th>Lotto</th><th>Riferimento</th><th>Paese</th><th>Esito</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.i}><td>{r.i}</td><td>{r.il ? r.il.code : <span className="muted">{r.line.slice(0, 30)}</span>}</td><td className="mono">{r.ref || '—'}</td><td>{r.country ? countryName(r.country) : r.countryRaw ? <Chip kind="warn">{r.countryRaw}?</Chip> : '—'}</td>
            <td><Chip kind={r.status.startsWith('da registrare') ? (r.status.includes('verificare') ? 'warn' : 'good') : r.status === 'già registrato' || r.status === 'intestazione' ? 'outline' : 'crit'}>{r.status}</Chip></td></tr>)}</tbody></table></div>
      )}
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} disabled={!ok.length} onClick={apply}>Registra {ok.length || ''} riferimenti</Btn><Btn small kind="ghost" onClick={onDone}>Chiudi</Btn></div>
    </div>
  );
}

/* ================= scheda del lotto ================= */
export function LottoDettaglio({ d, today, id }) {
  const reg = eudrRegister(d);
  const r = reg.byId.get(id);
  if (!r) return <Panel title="Lotto non trovato"><Empty title="Il lotto non è in ambito o non esiste più"><Btn small icon={LuArrowLeft} onClick={() => go('esg', 'filiera', 'lotti')}>Torna ai lotti</Btn></Empty></Panel>;
  const s = r.status;
  return (
    <>
      <div className="row gap-s"><Btn small kind="ghost" icon={LuArrowLeft} onClick={() => go('esg', 'filiera', 'lotti')}>Tutti i lotti</Btn></div>
      <Panel title={`Lotto ${r.code} · ${r.ing?.name}`} sub={`${dateIt(r.date)} · ${tTxt(r.t)} t · ${nf(r.price, 1)} €/t · NC ${r.hs || '—'} · DDT ${r.ddt || '—'}`} actions={<><StateChip state={s.state} /><Flags s={s} /></>}>
        <Kv items={[['Fornitore', <button type="button" className="linkish" onClick={() => r.supplierId && openDrawer('supplier', r.supplierId)}>{r.supplierName}</button>], ['Ruolo per il lotto', s.effRole === 'operatore' ? 'operatore (importazione diretta)' : reg.role.label],
          ['Paese di produzione', r.country ? <span>{r.countryName} {r.e?.region ? `· ${r.e.region}` : ''} <TierChip tier={r.tier} /></span> : 'non indicato'], ['Fonte della classificazione del paese', `${r.tierInfo.source || '—'}`],
          ['Evidenze', <EvidenceCount d={d} type="eudrLots" refId={r.e?.id || r.id} />], r.e?.note ? ['Nota', r.e.note] : null]} />
      </Panel>
      <div className="grid g3 efl-flagcards">
        <Panel title={`EUDR ${s.eudrOk ? '✓' : '✗'}`} sub="Requisiti del ruolo per il lotto">
          <ul className="efl-checks">{s.checks.map(c => <li key={c.key}><Check ok={c.ok} required={c.required} /><span>{c.label}<span className="sub">{c.note}</span></span></li>)}</ul>
        </Panel>
        <Panel title={s.dcf ? 'DCF fisica ✓' : s.dcfMB ? 'DCF in bilancio di massa' : 'DCF ✗'} sub="Senza deforestazione e conversione">
          <ul className="efl-checks">
            <li><Check ok={s.dcfChecks.conversionFree} /><span>Senza conversione di ecosistemi<span className="sub">{r.e?.conversionFree === true ? 'dichiarato' : 'non dimostrato'}</span></span></li>
            <li><Check ok={s.dcfChecks.cutoff} /><span>Data limite entro il 31/12/2020<span className="sub">{r.e?.cutoff ? dateIt(r.e.cutoff) : 'non indicata'}</span></span></li>
            <li><Check ok={s.dcf} /><span>Catena a identità preservata o segregata<span className="sub">{r.e?.coc || 'non indicata'}{s.dcfMB ? ' · vale come DCF in bilancio di massa, non fisica' : ''}</span></span></li>
          </ul>
        </Panel>
        <Panel title={`FEFAC SSG ${s.ssg ? '✓' : '✗'}`} sub="Schema che supera il benchmark">
          <ul className="efl-checks"><li><Check ok={s.ssg} /><span>{r.e?.scheme && r.e.scheme !== 'nessuno' ? r.e.scheme : 'Nessuno schema'}<span className="sub">{r.e?.ssgBenchmark ? `benchmark SSG ${r.e.ssgBenchmark}` : 'nessun benchmark indicato'}</span></span></li>
            <li><Check ok={s.certValid !== false} required={!!r.e?.certExpiry} /><span>Certificato valido all’arrivo<span className="sub">{r.e?.certNo ? `${r.e.certNo} fino al ${dateIt(r.e.certExpiry)}` : 'nessun certificato'}</span></span></li></ul>
        </Panel>
      </div>
      <div className="split">
        <LotEdit key={r.id + (r.e?.updatedAt || '')} d={d} r={r} today={today} />
        <Panel title="Rischio interno" sub={r.risk.label} actions={<BandChip band={r.risk.band} score={r.risk.score} />}>
          <div className="tw"><table className="t"><thead><tr><th>Componente</th><th className="r">Peso</th><th className="r">Fattore</th><th className="r">Punti</th></tr></thead>
            <tbody>{r.risk.components.map(c => <tr key={c.key}><td>{c.label}<span className="sub">{c.why}</span></td><td className="r">{c.weight}</td><td className="r">{nf(c.factor, 2)}</td><td className="r">{nf(c.points, 1)}</td></tr>)}
              <tr className="efl-tot"><td>Totale</td><td /><td /><td className="r">{r.risk.score}</td></tr></tbody></table></div>
          <p className="xs muted">Fasce: sotto 25 trascurabile, sotto 50 basso, sotto 75 medio, altrimenti alto. I pesi si cambiano nelle impostazioni del pacchetto.</p>
        </Panel>
      </div>
      <Geo key={'g' + r.id} d={d} r={r} today={today} />
      <Tracciato d={d} r={r} />
    </>
  );
}

function LotEdit({ d, r, today }) {
  const e = r.e || {};
  const [v, setV] = useState({ ddsRef: e.ddsRef || '', ddsVerification: e.ddsVerification || '', upstream: (e.upstreamRefs || []).join(', '), country: normCountry(e.country) || '', region: e.region || '', scheme: e.scheme || '', coc: e.coc || '',
    cutoff: e.cutoff || '', conv: e.conversionFree === true ? 'si' : e.conversionFree === false ? 'no' : '', ssg: e.ssgBenchmark || '', certNo: e.certNo || '', certExpiry: e.certExpiry || '', mitigation: e.mitigation || '',
    status: e.status === 'in verifica' || e.status === 'respinto' ? e.status : 'auto', directImport: !!e.directImport, note: e.note || '' });
  const set = p => setV(x => ({ ...x, ...p }));
  const pickScheme = code => {
    const sc = schemeOf(d, code);
    set({ scheme: code, ...(sc && !v.cutoff && sc.cutoff ? { cutoff: sc.cutoff } : {}), ...(sc && !v.conv && sc.conversionFree != null ? { conv: sc.conversionFree ? 'si' : 'no' } : {}), ...(sc && !v.ssg && sc.ssg ? { ssg: sc.ssg } : {}) });
  };
  const ref = normDdsRef(v.ddsRef);
  const save = () => {
    const upstreamRefs = v.upstream.split(/[\s,;]+/).map(normDdsRef).filter(Boolean);
    const hasRef = !!ref || upstreamRefs.length > 0;
    const obj = { id: e.id || `eu-${r.id}`, ingLotId: r.id, ingId: r.ingId, supplierId: r.supplierId, ddsRef: ref || null, ddsVerification: v.ddsVerification.trim().toUpperCase() || null, upstreamRefs, country: v.country || null, region: v.region.trim() || null,
      scheme: v.scheme || null, coc: v.coc || null, cutoff: v.cutoff || null, conversionFree: v.conv === 'si' ? true : v.conv === 'no' ? false : null, ssgBenchmark: v.ssg || null, certNo: v.certNo.trim() || null, certExpiry: v.certExpiry || null,
      mitigation: v.mitigation.trim() || null, directImport: v.directImport, note: v.note.trim() || null, status: v.status !== 'auto' ? v.status : hasRef && v.country ? 'completo' : 'incompleto', updatedAt: today, source: 'inserito a mano' };
    store.batch([{ kind: 'upsertMany', coll: 'eudrLots', key: 'ingLotId', objs: [obj] }], `EUDR: dati del lotto ${r.code}`);
    undoToast('Dati del lotto salvati');
  };
  const schemes = packList(d, 'schema').map(x => x.code).filter(Boolean);
  return (
    <Panel title="Dati EUDR del lotto" sub="Riferimento DDS, origine, certificazione e catena di custodia">
      <div className="form">
        <Field label="Riferimento DDS" hint={ref && !validDdsRef(ref) ? <span className="efl-warn">formato atteso: AA + paese + 10 caratteri (es. 26IT…)</span> : 'proprio o comunicato dal fornitore'}><input className="input mono" value={v.ddsRef} maxLength={40} onChange={x => set({ ddsRef: x.target.value })} /></Field>
        <Field label="Codice di verifica"><input className="input mono" value={v.ddsVerification} maxLength={24} onChange={x => set({ ddsVerification: x.target.value })} /></Field>
        <Field label="Altri riferimenti a monte" hint="separati da virgola"><input className="input mono" value={v.upstream} onChange={x => set({ upstream: x.target.value })} /></Field>
        <Field label="Paese di produzione"><Select value={v.country} onChange={x => set({ country: x })} options={COUNTRY_OPTS} /></Field>
        <Field label="Regione di produzione"><input className="input" value={v.region} maxLength={80} onChange={x => set({ region: x.target.value })} /></Field>
        <Field label="Schema di certificazione"><Select value={v.scheme} onChange={pickScheme} options={[{ id: '', label: '— non indicato —' }, ...[...new Set([...schemes, ...SCHEME_OPTIONS])].map(x => ({ id: x, label: x }))]} /></Field>
        <Field label="Catena di custodia"><Select value={v.coc} onChange={x => set({ coc: x })} options={[{ id: '', label: '— non indicata —' }, ...COC_OPTIONS.map(x => ({ id: x, label: x }))]} /></Field>
        <Field label="Data limite (cut-off)"><input type="date" className="input" value={v.cutoff} onChange={x => set({ cutoff: x.target.value })} /></Field>
        <Field label="Senza conversione"><Select value={v.conv} onChange={x => set({ conv: x })} options={[{ id: '', label: 'non noto' }, { id: 'si', label: 'sì' }, { id: 'no', label: 'no' }]} /></Field>
        <Field label="Benchmark FEFAC SSG"><Select value={v.ssg} onChange={x => set({ ssg: x })} options={[{ id: '', label: 'nessuno' }, { id: '2023', label: 'SSG 2023' }, { id: '2021', label: 'SSG 2021' }]} /></Field>
        <Field label="Numero del certificato"><input className="input" value={v.certNo} maxLength={60} onChange={x => set({ certNo: x.target.value })} /></Field>
        <Field label="Scadenza del certificato"><input type="date" className="input" value={v.certExpiry} onChange={x => set({ certExpiry: x.target.value })} /></Field>
        <Field label="Stato"><Select value={v.status} onChange={x => set({ status: x })} options={[{ id: 'auto', label: 'secondo i dati' }, { id: 'in verifica', label: 'in verifica' }, { id: 'respinto', label: 'respinto' }]} /></Field>
      </div>
      <Field label="Misure di attenuazione del rischio" hint={r.tier === 'alto' ? 'obbligatorie: il paese è ad alto rischio' : 'verifiche, analisi satellitari del fornitore, audit'}><input className="input" value={v.mitigation} maxLength={400} onChange={x => set({ mitigation: x.target.value })} /></Field>
      <Field label="Nota"><input className="input" value={v.note} maxLength={400} onChange={x => set({ note: x.target.value })} /></Field>
      <label className="check small efl-mt"><input type="checkbox" checked={v.directImport} onChange={x => set({ directImport: x.target.checked })} /> Importato direttamente: l’azienda è l’operatore per questo lotto (DDS propria e geolocalizzazione)</label>
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} onClick={save}>Salva</Btn></div>
    </Panel>
  );
}

function Geo({ d, r, today }) {
  const [up, setUp] = useState(null);
  const onFile = async ev => {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    const text = await readFile(f);
    setUp({ name: f.name, text, v: validateGeoJSON(text) });
  };
  const save = () => {
    const id = r.e?.id || `eu-${r.id}`;
    const rows = up.v.features.filter(x => x.coords).map((x, k) => ({ id: `pl-${id}-${k + 1}`, eudrLotId: id, name: x.name, geom: x.geom, coords: x.coords, areaHa: x.areaHa, declaredAreaHa: x.declaredAreaHa, lat: x.lat, lon: x.lon, valid: x.valid, issues: x.issues.slice(0, 6) }));
    const ops = [];
    if (r.plots.length) ops.push({ kind: 'removeMany', coll: 'eudrPlots', ids: r.plots.map(p => p.id) });
    if (rows.length) ops.push({ kind: 'addMany', coll: 'eudrPlots', objs: rows });
    ops.push({ kind: 'upsertMany', coll: 'eudrLots', key: 'ingLotId', objs: [{ id, ingLotId: r.id, ingId: r.ingId, supplierId: r.supplierId, plotsCount: rows.length, areaHa: up.v.totalAreaHa, geoValid: up.v.ok, plotsHash: sha256HexSync(up.text), plotsFile: up.name, updatedAt: today }] });
    store.batch(ops, `EUDR: ${rows.length} appezzamenti del lotto ${r.code}`);
    undoToast('Appezzamenti salvati'); setUp(null);
  };
  const shown = up ? up.v.features : r.plots;
  return (
    <Panel title="Geolocalizzazione degli appezzamenti" sub="File GeoJSON del formato del sistema d’informazione UE: WGS-84, 6 decimali, punto solo sotto i 4 ha, poligono da 4 ha"
      actions={<>
        <label className="btn small"><LuUpload aria-hidden="true" />Carica GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={onFile} /></label>
        {r.plots.length > 0 && <Btn small kind="ghost" icon={LuDownload} onClick={() => downloadText(`appezzamenti-${r.code}`, 'geojson', plotsToGeoJSON(r.plots, { country: r.country }), 'application/geo+json')}>GeoJSON</Btn>}
        {r.plots.length > 0 && <Btn small kind="ghost" icon={LuMap} onClick={() => downloadText(`mappa-${r.code}`, 'svg', plotMapSvg(r.plots, { title: `Appezzamenti del lotto ${r.code}` }), 'image/svg+xml')}>Mappa SVG</Btn>}
      </>}>
      {up && (
        <div className={`note ${up.v.ok ? 'good' : 'crit'} small`}>
          <b>{up.name}</b>: {up.v.ok ? 'file valido' : 'file con errori'} · {up.v.features.length} appezzamenti · {nf(up.v.totalAreaHa, 2)} ha · {nf(up.v.vertexCount)} vertici{up.v.intersectionsChecked ? '' : ' (intersezioni non controllate)'}
          {up.v.issues.length > 0 && <ul className="efl-issues">{up.v.issues.slice(0, 12).map((x, i) => <li key={i}><Chip kind={x.level === 'errore' ? 'crit' : 'warn'}>{x.level}</Chip> {x.msg}</li>)}</ul>}
          <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuSave} onClick={save}>{up.v.ok ? 'Salva gli appezzamenti' : 'Salva comunque (geolocalizzazione non valida)'}</Btn><Btn small kind="ghost" onClick={() => setUp(null)}>Annulla</Btn></div>
        </div>
      )}
      {shown.length ? (
        <div className="efl-geo">
          <PlotMap features={shown} title={`Appezzamenti del lotto ${r.code}`} />
          <div className="tw"><table className="t"><thead><tr><th>Appezzamento</th><th>Geometria</th><th className="r">ha</th><th className="r">Lat, lon</th><th>Esito</th></tr></thead>
            <tbody>{shown.map((p, i) => <tr key={p.id || i}><td>{String(p.name || '').replace(/ \(dati dimostrativi\)/, '')}</td><td>{p.geom}</td><td className="r">{p.areaHa != null ? nf(p.areaHa, 2) : '—'}</td><td className="r mono">{p.lat != null ? `${nf(p.lat, 4)}, ${nf(p.lon, 4)}` : '—'}</td>
              <td>{p.valid ? <Chip kind="good">valido</Chip> : <Chip kind="crit" title={(p.issues || []).join(' · ')}>da correggere</Chip>}</td></tr>)}</tbody></table></div>
          {!up && r.e?.plotsHash && <p className="xs muted">File {r.e.plotsFile || ''} · SHA-256 <span className="mono efl-hash">{r.e.plotsHash}</span></p>}
        </div>
      ) : !up && <p className="small muted">{r.status.effRole === 'operatore' ? 'Serve la geolocalizzazione di tutti gli appezzamenti: per l’operatore è un requisito della DDS.' : 'Non richiesta per il ruolo dell’azienda: si può conservare il file ricevuto dal fornitore.'}</p>}
    </Panel>
  );
}

function Tracciato({ d, r }) {
  const res = useMemo(() => recall(traceIndex(d), { ingLots: [r.id] }), [d, r.id]);
  return (
    <Panel title="Dove è finito il lotto" sub="Tracciabilità: lotti prodotti che lo contengono e clienti raggiunti (lettere EUDR)">
      {res.lots.length ? (
        <>
          <Kv items={[['Lotti prodotti', `${nf(res.lots.length)} · ${tTxt(res.producedT)} t`], ['Consegnati', `${tTxt(res.shippedT)} t a ${nf(res.customers.length)} clienti`], ['Bilancio di massa del lotto', res.massBalance ? `ricevuto ${tTxt(res.massBalance.received)} t · usato ${tTxt(res.massBalance.used)} t · residuo ${tTxt(res.massBalance.remaining)} t` : '—']]} />
          <div className="efl-chiplist efl-mt">{res.customers.slice(0, 10).map(c => { const cu = (d.customers || []).find(x => x.id === c.customerId); return <button key={c.customerId} type="button" className="chip outline efl-chipbtn" onClick={() => go('esg', 'filiera', 'clienti.' + c.customerId)} title="Apri la lettera EUDR del cliente">{cu?.name || c.customerId} · {tTxt(c.tonnes)} t</button>; })}</div>
        </>
      ) : <p className="small muted">Il lotto non è ancora stato usato in produzione.</p>}
    </Panel>
  );
}

/* ================= soia ================= */
export function Soia({ d, P }) {
  const [basis, setBasis] = useState('consumo');
  const sh = soyShares(d, P);
  const months = monthsIn(P.from, P.to);
  const trend = useMemo(() => months.map(m => soyShares(d, { from: m + '-01', to: endOfMonth(m) })), [d, P.key]);
  if (!sh || !(sh.purchase.tSoy > 0 || sh.consumption.tSoy > 0)) return <Panel title="Soia nei mangimi"><Empty title="Nessuna soia in ambito nel periodo">Conferma la classificazione delle materie prime a base di soia e registra i lotti di arrivo.</Empty></Panel>;
  const x = basis === 'acquisti' ? sh.purchase : sh.consumption, oil = basis === 'acquisti' ? sh.oil.purchase : sh.oil.consumption;
  const top = x.origins.slice(0, 6), rest = x.origins.slice(6);
  const parts = [...top.map((o, i) => ({ key: o.country || 'nn', label: o.name, value: o.t, color: o.country ? SERIES[i % SERIES.length] : 'var(--line-2)' })), ...(rest.length ? [{ key: 'altri', label: 'Altri paesi', value: sum(rest, o => o.t), color: 'var(--line-2)' }] : [])];
  const pick = k => trend.map(s => { const y = basis === 'acquisti' ? s?.purchase : s?.consumption; return y && y.tSoy > 0 && y[k] != null ? Math.round(y[k] * 1000) / 10 : null; });
  const survey = () => {
    const sv = soySurvey(d, P);
    downloadCsv('indagine-soia', [...sv.rows, { prodotto: 'Totale soia', t: sv.total, quota: 1 }, { prodotto: 'Crediti book and claim (non fisici)', schema: sv.credits.schemes.join(', '), t: sv.credits.t, quota: null }],
      [{ label: 'Periodo', value: () => `${dateIt(sv.period.from)} – ${dateIt(sv.period.to)}` }, { key: 'prodotto', label: 'Prodotto' }, { key: 'nc', label: 'Codice NC' }, { key: 'paese', label: 'Paese (ISO)' }, { key: 'nomePaese', label: 'Paese' },
        { key: 'catena', label: 'Catena di custodia' }, { key: 'schema', label: 'Schema' }, { key: 'ssg', label: 'FEFAC SSG' }, { key: 'dcf', label: 'Senza deforestazione' }, { key: 'dds', label: 'Riferimento DDS' }, { key: 'lotti', label: 'Lotti' }, { key: 't', label: 'Tonnellate' }, { label: 'Quota', value: r => (r.quota == null ? '' : Math.round(r.quota * 1000) / 10) }]);
  };
  return (
    <>
      <div className="row between efl-gap">
        <Seg options={[{ id: 'consumo', label: 'Per consumo' }, { id: 'acquisti', label: 'Per acquisti' }]} value={basis} onChange={setBasis} label="Base di calcolo" />
        <span className="row gap-s">
          <Btn small icon={LuFileSpreadsheet} onClick={survey}>Indagine soia (CSV)</Btn>
          <Btn small kind="ghost" icon={LuFileJson} onClick={() => downloadText('quote-soia', 'json', JSON.stringify(sh, null, 2), 'application/json')}>JSON</Btn>
        </span>
      </div>
      <p className="small muted">{basis === 'consumo' ? (sh.compositionBased ? 'Soia nelle composizioni dei lotti prodotti nel periodo, attribuita ai lotti di arrivo dalla tracciabilità.' : 'Senza composizioni dei lotti: formula × produzione, origine non nota.') : 'Lotti di soia ricevuti nel periodo.'} Farina di estrazione e semi; l’olio di soia è contato a parte. I quattro indicatori non si sommano.</p>
      <div className="kpis">
        <Kpi label="DCF fisica" value={pctTxt(x.dcf, 1)} foot={`${tTxt(x.tDcf)} t · IP o segregata, data limite ≤ 2020`} />
        <Kpi label="DCF in bilancio di massa" value={pctTxt(x.dcfMB, 1)} foot={`${tTxt(x.tDcfMB)} t · indicatore separato`} />
        <Kpi label="Coperta da crediti" value={pctTxt(x.credits, 1)} foot={`${tTxt(sh.credits.t)} t · book and claim, non fisica`} />
        <Kpi label="Conforme FEFAC SSG" value={pctTxt(x.ssg)} foot={`${tTxt(x.tSsg)} t`} />
        <Kpi label="Con riferimento DDS" value={pctTxt(x.dds)} foot={`${tTxt(x.tDds)} t`} />
        <Kpi label="Soia per tonnellata di mangime" value={sh.soyPerTFeed != null ? nf(sh.soyPerTFeed, 0) : '—'} unit="kg/t" foot={`${tTxt(sh.consumption.tSoy)} t su ${tTxt(sh.tFeed)} t prodotte`} />
      </div>
      <div className="split">
        <Panel title="Origine della soia" sub={`${tTxt(x.tSoy)} t · paese di produzione dei lotti · rischio paese: ${pctTxt(x.highRisk, 1)} da paesi ad alto rischio`}>
          <StackBar parts={parts} ariaLabel="Origine della soia per paese" />
          <Legend items={parts.map(p => ({ label: `${p.label} ${pctTxt(p.value / (x.tSoy || 1))}`, color: p.color }))} />
          <div className="tw efl-mt"><table className="t"><thead><tr><th>Materia prima</th><th className="r">t</th></tr></thead><tbody>{x.byItem.map(i => <tr key={i.ingId}><td>{i.name}</td><td className="r">{tTxt(i.t)}</td></tr>)}
            <tr><td>Olio di soia (contato a parte)<span className="sub">{pctTxt(oil.dds)} con DDS</span></td><td className="r">{tTxt(oil.tSoy)}</td></tr></tbody></table></div>
        </Panel>
        <Panel title="Andamento mensile" sub={`${basis === 'consumo' ? 'Consumo' : 'Acquisti'} del mese · quota sulle tonnellate di soia`}>
          <LineChart labels={months.map(m => monthLabel(m))} unit="%" decimals={0} height={220} area={false} yMin={0} yMax={100} ariaLabel="Quote mensili della soia"
            series={[{ key: 'dds', label: 'Con DDS', color: 'var(--s1)', values: pick('dds') }, { key: 'ssg', label: 'FEFAC SSG', color: 'var(--s3)', values: pick('ssg') }, { key: 'mb', label: 'DCF bilancio di massa', color: 'var(--s4)', values: pick('dcfMB') }, { key: 'dcf', label: 'DCF fisica', color: 'var(--s6)', values: pick('dcf') }]} />
          <Legend line items={[{ label: 'Con DDS', color: 'var(--s1)' }, { label: 'FEFAC SSG', color: 'var(--s3)' }, { label: 'DCF bilancio di massa', color: 'var(--s4)' }, { label: 'DCF fisica', color: 'var(--s6)' }]} />
        </Panel>
      </div>
      <p className="small muted">I crediti «book and claim» ({tTxt(sh.credits.t)} t attribuite al periodo pro quota dei giorni) sostengono la produzione responsabile ma non riducono l’impronta e non rendono «senza deforestazione» la soia impiegata.</p>
    </>
  );
}

/* ================= registro della soia DCF e crediti ================= */
const KIND_CHIP = { entrata: 'good', uscita: 'accent', rettifica: 'warn' };
export function BilancioDcf({ d, P, today }) {
  const b = dcfBalance(d);
  const rows = [...(d.dcfLedger || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const lots = new Map((d.ingLots || []).map(l => [l.id, l]));
  const cred = creditsInPeriod(d, P, 'soia');
  const del = x => confirm('Eliminare il movimento?', <p>{dateIt(x.date)} · {x.kind} · {nf(x.tSoy, 2)} t. Si può annullare.</p>, () => { store.batch([{ kind: 'remove', coll: 'dcfLedger', id: x.id }], `Registro DCF: movimento del ${dateIt(x.date)} eliminato`); undoToast('Movimento eliminato'); }, { ok: 'Elimina', danger: true });
  return (
    <>
      <div className="kpis">
        <Kpi label="Saldo della soia DCF" value={nf(b.balance, 1)} unit="t" status={b.n ? (b.negative ? 'bad' : 'ok') : undefined} foot={b.negative ? `negativo dal ${dateIt(b.negativeSince)}: dichiarazioni DCF bloccate` : 'dichiarazioni DCF consentite'} />
        <Kpi label="Entrate certificate" value={nf(b.in, 1)} unit="t" foot="arrivi di soia DCF" />
        <Kpi label="Uscite dichiarate DCF" value={nf(b.out, 1)} unit="t" foot="soia nelle vendite dichiarate DCF" />
        <Kpi label="Rettifiche" value={nf(b.adj, 1)} unit="t" foot="differenze inventariali" />
      </div>
      {b.negative && <div className="note crit">Il registro è negativo: le vendite dichiarate «con soia senza deforestazione» superano la soia certificata entrata. Le lettere ai clienti non riportano il DCF finché il saldo non torna positivo.</div>}
      <div className="split">
        <Panel title="Saldo nel tempo" sub="Entrate − uscite ± rettifiche, in ordine di data">
          {b.series.length > 1 ? <LineChart labels={b.series.map(x => dateIt(x.date, 'dm'))} unit="t" decimals={1} height={220} area={false} refs={[{ y: 0, label: 'zero', kind: 'crit' }]} ariaLabel="Saldo del registro della soia DCF"
            series={[{ key: 'b', label: 'Saldo', color: 'var(--s6)', values: b.series.map(x => x.balance) }]} /> : <p className="small muted">Servono almeno due movimenti.</p>}
        </Panel>
        <MovimentoDcf d={d} today={today} />
      </div>
      <Panel title="Movimenti" flush>
        <Table rows={rows} pageSize={30} exportName="registro-soia-dcf" empty="Nessun movimento" cols={[
          { key: 'date', label: 'Data', render: x => dateIt(x.date) },
          { key: 'kind', label: 'Movimento', render: x => <Chip kind={KIND_CHIP[x.kind] || 'outline'}>{x.kind}</Chip> },
          { key: 'tSoy', label: 't', align: 'r', render: x => (x.kind === 'uscita' ? '−' : x.kind === 'rettifica' && x.tSoy < 0 ? '−' : '+') + nf(Math.abs(x.tSoy), 2) },
          { key: 'scheme', label: 'Schema' },
          { key: 'lot', label: 'Lotto', render: x => (x.ingLotId ? <button type="button" className="linkish" onClick={e => { e.stopPropagation(); go('esg', 'filiera', 'lotto.' + x.ingLotId); }}>{lots.get(x.ingLotId)?.code || x.ingLotId}</button> : '—'), csv: x => lots.get(x.ingLotId)?.code || '' },
          { key: 'note', label: 'Nota', render: x => <span className="efl-wrap">{x.note || ''}</span> },
          { key: 'del', label: '', nosort: true, csv: false, render: x => <Btn small kind="ghost" icon={LuTrash2} title="Elimina il movimento" onClick={e => { e.stopPropagation(); del(x); }} /> },
        ]} />
      </Panel>
      <Crediti d={d} P={P} cred={cred} />
    </>
  );
}
function MovimentoDcf({ d, today }) {
  const [v, setV] = useState({ date: today, kind: 'entrata', tSoy: null, scheme: 'ProTerra', ingLotId: '', note: '' });
  const set = p => setV(x => ({ ...x, ...p }));
  const dcfLots = eudrRegister(d).rows.filter(r => r.commodity === 'soia' && (r.status.dcf || r.status.dcfMB)).slice(0, 60);
  const add = () => {
    if (!(v.tSoy > 0) && v.kind !== 'rettifica') return;
    store.batch([{ kind: 'add', coll: 'dcfLedger', obj: { date: v.date, kind: v.kind, tSoy: v.kind === 'rettifica' ? v.tSoy : Math.abs(v.tSoy), scheme: v.scheme || null, ingLotId: v.ingLotId || null, note: v.note.trim() || null } }], `Registro DCF: ${v.kind} di ${nf(v.tSoy, 2)} t`);
    undoToast('Movimento registrato'); set({ tSoy: null, note: '' });
  };
  return (
    <Panel title="Nuovo movimento" sub="Entrata: soia certificata arrivata · uscita: soia nelle vendite dichiarate DCF · rettifica: con segno">
      <div className="form">
        <Field label="Data"><input type="date" className="input" value={v.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
        <Field label="Movimento"><Select value={v.kind} onChange={x => set({ kind: x })} options={['entrata', 'uscita', 'rettifica']} /></Field>
        <Field label="Soia (t)"><NumInput value={v.tSoy} onChange={x => set({ tSoy: x })} decimals={3} /></Field>
        <Field label="Schema"><Select value={v.scheme} onChange={x => set({ scheme: x })} options={SCHEME_OPTIONS} /></Field>
        <Field label="Lotto di arrivo"><Select value={v.ingLotId} onChange={x => set({ ingLotId: x })} options={[{ id: '', label: '—' }, ...dcfLots.map(r => ({ id: r.id, label: `${r.code} · ${dateIt(r.date)}` }))]} /></Field>
      </div>
      <Field label="Nota"><input className="input" value={v.note} maxLength={240} onChange={e => set({ note: e.target.value })} /></Field>
      <div className="row gap-s efl-mt"><Btn small kind="primary" icon={LuPlus} onClick={add} disabled={v.tSoy == null || (v.kind !== 'rettifica' && !(v.tSoy > 0))}>Registra</Btn></div>
    </Panel>
  );
}
function Crediti({ d, P, cred }) {
  const [v, setV] = useState({ year: +P.to.slice(0, 4), scheme: 'RTRS', tCovered: null, certId: '' });
  const set = p => setV(x => ({ ...x, ...p }));
  const add = () => { store.batch([{ kind: 'add', coll: 'soyCredits', obj: { year: v.year, scheme: v.scheme, tCovered: v.tCovered, certId: v.certId.trim() || null } }], `Crediti ${v.scheme} ${v.year}: ${nf(v.tCovered)} t`); undoToast('Crediti registrati'); set({ tCovered: null, certId: '' }); };
  return (
    <Panel title="Crediti di soia e palma (book and claim)" sub={`Attribuiti al periodo pro quota dei giorni dell’anno: ${tTxt(cred.t)} t · riportati sempre a parte`}>
      <Table rows={d.soyCredits || []} pageSize={20} exportName="crediti-soia" empty="Nessun credito registrato" cols={[
        { key: 'year', label: 'Anno' }, { key: 'scheme', label: 'Schema' }, { key: 'tCovered', label: 't coperte', align: 'r', render: x => nf(x.tCovered) },
        { key: 'inP', label: 'Nel periodo', align: 'r', render: x => { const r = cred.rows.find(y => y.id === x.id); return r ? `${nf(r.t)} t (${pctTxt(r.share)})` : '—'; }, csv: x => cred.rows.find(y => y.id === x.id)?.t ?? 0 },
        { key: 'certId', label: 'Identificativo', render: x => <span className="mono">{x.certId || '—'}</span> },
      ]} />
      <div className="form efl-mt">
        <Field label="Anno"><NumInput value={v.year} onChange={x => set({ year: x })} decimals={0} min={2000} max={2100} /></Field>
        <Field label="Schema"><Select value={v.scheme} onChange={x => set({ scheme: x })} options={['RTRS', 'ProTerra', 'RSPO', 'altro']} /></Field>
        <Field label="t coperte"><NumInput value={v.tCovered} onChange={x => set({ tCovered: x })} decimals={0} min={0} /></Field>
        <Field label="Identificativo dei crediti"><input className="input" value={v.certId} maxLength={80} onChange={e => set({ certId: e.target.value })} /></Field>
      </div>
      <div className="row gap-s efl-mt"><Btn small icon={LuPlus} disabled={!(v.tCovered > 0) || !v.year} onClick={add}>Registra i crediti</Btn></div>
    </Panel>
  );
}
