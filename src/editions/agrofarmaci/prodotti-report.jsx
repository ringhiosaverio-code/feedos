/* DifesaOS · Prodotti › Report prodotto: scheda stampabile (A4, anche PDF dal browser) con identità e registrazione, usi in etichetta,
 * evidenze delle prove di campo con foto, mercato e prezzi della concorrenza, costi, margine e leve di risparmio.
 * Due versioni: completa per la direzione e «per i clienti» (senza costi, margini e concorrenti), la sola della vista Agente. */
import React, { useMemo, useState } from 'react';
import { LuPrinter, LuFileText } from 'react-icons/lu';
import { nf, eur, dateIt, byId, sum, addDays, monthOf } from '../../core/util.js';
import { download, stamp } from '../../core/io.js';
import { go } from '../../core/router.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Select, Kv } from '../../ui/ui.jsx';
import { Bars, Columns, Waterfall } from '../../ui/charts.jsx';
import { PrintPage, printNow } from '../../ui/print.jsx';
import { saleStatus, SALE_LABEL } from '../../engine/agro-reg.js';
import { productFootprint } from '../../engine/agro-co2.js';
import { productEvidence, evidenceText, VERDICT, delPct } from '../../engine/agro-prove.js';
import { unitEconomics, savingsLevers, competitorBoard, priceStrategy, savingsSettings, perUnit } from '../../engine/agro-risparmi.js';
import { PackImage, PhotoGrid, AddPhotos } from './photos.jsx';

const VERSIONS = [{ id: 'completo', label: 'Completo (direzione)' }, { id: 'clienti', label: 'Per i clienti' }];
const uOf = p => (p?.uom === 'L' ? 'L' : 'kg');
const doseTxt = (lo, hi, unit) => (lo == null ? '—' : `${nf(lo, lo < 1 ? 2 : 1)}${hi != null && hi !== lo ? `–${nf(hi, hi < 1 ? 2 : 1)}` : ''} ${unit || ''}`);
const phiTxt = u => (u.phiText ? u.phiText : u.phiDays == null ? 'fioritura' : `${nf(u.phiDays)} gg`);

/** Dati del report di un prodotto (anche per l'esportazione in testo). */
function useReport(d, ctx, P, p) {
  return useMemo(() => {
    if (!p) return null;
    const S = savingsSettings(d);
    const regs = (d.registrations || []).filter(r => r.productId === p.id);
    const reg = regs[0] || null;
    const regIds = new Set(regs.map(r => r.id));
    const uses = (d.regUses || []).filter(u => regIds.has(u.registrationId)).sort((a, b) => String(a.cropName).localeCompare(String(b.cropName)) || String(a.pest).localeCompare(String(b.pest)));
    const asById = byId(d.activeSubstances || []);
    const actives = (p.actives || []).map(a => ({ ...a, s: asById[a.as] || null }));
    const ev = productEvidence(d, p.id);
    const econ = unitEconomics(d, ctx, p.id, P);
    const levers = savingsLevers(d, ctx, p.id, P, S);
    const board = competitorBoard(d, ctx, p.id, P, S);
    const save = sum(levers, x => x.perT);
    const keep = priceStrategy(econ, save, 0, board), half = priceStrategy(econ, save, 0.5, board);
    const months = [];
    for (let k = 11; k >= 0; k--) months.push(monthOf(addDays(P.to, -k * 30.44)));
    const byM = Object.fromEntries([...new Set(months)].map(m => [m, 0]));
    const custs = new Set();
    for (const f of ctx.facts || []) if (f.productId === p.id && f.date >= P.from && f.date <= P.to) { if (f.month in byM) byM[f.month] += f.tonnes; custs.add(f.customerId); }
    const co2 = productFootprint(d, p.id);
    const trialIds = new Set(ev.rows.map(r => r.trial.id));
    const photos = (d.photos || []).filter(x => x.trialId && trialIds.has(x.trialId) && (!x.thesisId || ev.rows.some(r => r.trial.id === x.trialId && [r.own?.id, r.ctl?.id, r.ref?.id].includes(x.thesisId))));
    const advice = ev.rows.filter(r => String(r.trial.conclusions || '').trim()).map(r => ({ code: r.trial.code, crop: r.trial.cropName, text: r.trial.conclusions.trim() }));
    return { reg, uses, actives, ev, econ, levers, board, save, keep, half, months: Object.entries(byM), customers: custs.size, co2, photos, advice, S };
  }, [d, ctx, P.from, P.to, p]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ReportProdotto({ d, ctx, P, route, today, agent }) {
  const prods = useMemo(() => (d.products || []).filter(x => x.active !== false).sort((a, b) => String(a.category).localeCompare(String(b.category)) || a.name.localeCompare(b.name)), [d.products]);
  const best = useMemo(() => {
    const rev = {};
    for (const f of ctx.facts || []) if (f.date >= P.from) rev[f.productId] = (rev[f.productId] || 0) + f.revenue;
    return [...prods].sort((a, b) => (rev[b.id] || 0) - (rev[a.id] || 0))[0];
  }, [ctx.facts, prods, P.from]);
  const p = prods.find(x => x.id === route.id) || best || prods[0];
  const [verSel, setVer] = useState('completo');
  const ver = agent ? 'clienti' : verSel;
  const R = useReport(d, ctx, P, p);
  if (!p || !R) return null;
  const full = ver === 'completo';
  const pages = [<Cover key="c" d={d} p={p} R={R} full={full} />, <Uses key="u" p={p} R={R} full={full} today={today} />];
  if (R.ev.n || R.photos.length) pages.push(<Trials key="t" p={p} R={R} full={full} />);
  if (full) pages.push(<Market key="m" p={p} R={R} />, <Costs key="k" p={p} R={R} />);
  const title = (i) => [`${p.name}`, 'Usi in etichetta e registrazione', 'Prove di campo', 'Mercato e prezzi', 'Costi, margine e risparmi'][i];
  const names = pages.map(x => ({ c: 0, u: 1, t: 2, m: 3, k: 4 }[x.key]));
  return (
    <>
      <Panel className="no-print" title="Report prodotto" sub={`${pages.length} pagine A4 · la stampa (o «Salva come PDF») è sempre in tema chiaro${full ? '' : ' · versione senza costi, margini e concorrenti'}`}
        actions={<div className="row gap-s" style={{ flexWrap: 'wrap' }}>
          <Btn small kind="primary" icon={LuPrinter} onClick={printNow}>Stampa / PDF</Btn>
          <Btn small icon={LuFileText} onClick={() => download(`report-${p.code}-${stamp()}.md`, reportMarkdown(p, R, full), 'text/markdown;charset=utf-8')}>Esporta testo</Btn>
          <AddPhotos label="Foto della confezione" meta={{ productId: p.id, role: 'confezione', caption: `Confezione di ${p.name}`, date: today }} />
        </div>}>
        <div className="row gap-s" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="lbl small muted">Prodotto</span>
          <Select value={p.id} onChange={v => go('prodotti', 'report', v)} options={prods.map(x => ({ id: x.id, label: `${x.name} · ${x.category}` }))} ariaLabel="Prodotto del report" />
          {!agent && <><span className="lbl small muted">Versione</span><Seg options={VERSIONS} value={ver} onChange={setVer} label="Versione del report" /></>}
        </div>
      </Panel>
      <div className="pr-report">
        {pages.map((pg, i) => (
          <PrintPage key={pg.key} title={i === 0 ? null : title(names[i])} period={full ? `${dateIt(P.from)} – ${dateIt(P.to)}` : null}
            footer={`Report prodotto · ${p.name}${full ? ' · uso interno' : ''} · pagina ${i + 1} di ${pages.length}`}>{pg}</PrintPage>
        ))}
      </div>
    </>
  );
}

/* ---------------- pagine ---------------- */
function Cover({ d, p, R, full }) {
  const u = uOf(p), e = R.econ, ev = R.ev;
  const comp = R.actives.map(a => `${a.s?.name || a.as} ${nf(a.g)} ${a.unit || (p.uom === 'L' ? 'g/L' : 'g/kg')}`).join(' + ');
  const sale = R.reg ? saleStatus(R.reg, d.settings?.demoAnchor || new Date().toISOString().slice(0, 10)) : null;
  return (
    <>
      <div className="pr-cover">
        <PackImage d={d} p={p} />
        <div>
          <div className="eyebrow">{String(p.category || '').toUpperCase()} · {p.formulation || p.form}</div>
          <h1 className="pr-title">{p.name}</h1>
          <Kv items={[
            ['Composizione', comp || (p.composition || '—')], ['Formulazione', p.formulation || p.form || '—'],
            ['Registrazione', R.reg?.regNumber ? `${R.reg.regNumber}${R.reg.regDate ? ` del ${dateIt(R.reg.regDate)}` : ''}${sale ? ` · ${SALE_LABEL[sale].toLowerCase()}` : ''}` : 'senza registrazione come agrofarmaco'],
            ['Agricoltura biologica', R.reg?.organic ? 'impiegabile' : 'no'], ['Confezioni', p.packaging || '—'], ['Codice', p.code],
          ]} />
        </div>
      </div>
      <div className="kpis pr-kpis">
        {full && <Kpi label="Vendite 12 mesi" value={e.std ? '—' : nf(e.t)} unit={e.std ? '' : 't'} foot={e.std ? 'nessuna consegna' : eur(e.revenue)} />}
        {full && <Kpi label="Prezzo netto" value={nf(perUnit(e.perT.net, p), 2)} unit={`€/${u}`} foot={e.std ? 'listino' : 'media delle consegne'} />}
        {full && <Kpi label="Margine pieno" value={e.marginPct == null ? '—' : nf(e.marginPct * 100, 1)} unit={e.marginPct == null ? '' : '%'} foot="sul prezzo netto" />}
        <Kpi label="Efficacia nelle prove" value={ev.effOwn == null ? '—' : nf(ev.effOwn)} unit={ev.effOwn == null ? '' : '%'} foot={ev.n ? `${nf(ev.n)} ${ev.n === 1 ? 'prova' : 'prove'} di campo` : 'nessuna prova'} />
        {full && <Kpi label="A ettaro contro i concorrenti" value={R.board?.gap == null ? '—' : `${R.board.gap > 0 ? '+' : '−'}${nf(Math.abs(R.board.gap) * 100)}%`} foot={R.board?.gap == null ? 'nessun prezzo rilevato' : R.board.gap > 0 ? 'più caro' : 'più conveniente'} />}
        {!full && <Kpi label="Colture in etichetta" value={nf(new Set(R.uses.map(x => x.cropName)).size)} foot={`${nf(R.uses.length)} usi autorizzati`} />}
        {R.co2 && <Kpi label="Impronta di carbonio" value={nf(R.co2.perUnit, 2)} unit={`kg CO₂e/${R.co2.unit}`} foot="dalla culla al cancello, indicativa" />}
      </div>
      <div className="pr-summary">
        <h3>Sintesi</h3>
        {full && !e.std && <p>Negli ultimi 12 mesi {p.name} ha venduto {nf(e.t)} t ({eur(e.revenue)}) a {nf(perUnit(e.perT.net, p), 2)} € per {u} netti a {nf(R.customers)} clienti{e.marginPct != null ? `, con un margine pieno del ${nf(e.marginPct * 100, 1)}%` : ''}.</p>}
        <p>{evidenceText(ev, p.name)}</p>
        {full && R.board?.gap != null && <p>A ettaro costa il {nf(Math.abs(R.board.gap) * 100)}% {R.board.gap > 0 ? 'in più' : 'in meno'} della mediana dei concorrenti rilevati ({nf(R.board.n)} prezzi); il prezzo di parità a ettaro è {nf(R.board.parity, 2)} € per {u}.</p>}
        {full && R.levers.length > 0 && <p>Le leve di risparmio trovate valgono {nf(perUnit(R.save, p), 3)} € per {u} ({eur(sum(R.levers, x => x.year))} l’anno): {R.levers.slice(0, 3).map(x => x.label.toLowerCase()).join('; ')}.{R.keep ? ` Tenendo il prezzo il margine pieno sale al ${nf(R.keep.newMarginPct * 100, 1)}%; passandone metà al prezzo, il prezzo scende del ${nf(-R.half.priceChange * 100, 1)}%.` : ''}</p>}
        {!full && R.advice.length > 0 && <p>Indicazioni dalle prove: {R.advice.slice(0, 2).map(a => a.text).join(' ')}</p>}
      </div>
    </>
  );
}

function Uses({ p, R, full, today }) {
  const sub = R.actives.filter(a => a.s);
  return (
    <>
      {R.uses.length ? (
        <Table rows={R.uses} pageSize={60} cols={[
          { key: 'cropName', label: 'Coltura' }, { key: 'pest', label: 'Avversità' },
          { key: 'dosePerHl', label: 'Dose/hl', align: 'r', render: x => doseTxt(x.dosePerHl, x.dosePerHlMax, x.perHlUnit) },
          { key: 'doseMin', label: 'Dose/ha', align: 'r', render: x => doseTxt(x.doseMin, x.doseMax, x.doseUnit) },
          { key: 'maxApplications', label: 'Tratt./anno', align: 'r', render: x => x.maxApplications ?? '—' },
          { key: 'phiDays', label: 'Carenza', align: 'r', render: phiTxt },
        ]} />
      ) : <p className="small muted">Nessun uso in etichetta registrato per questo prodotto.</p>}
      <p className="small muted">Riassunto degli usi registrati nell’archivio: prima dell’uso vale sempre l’etichetta autorizzata, con le frasi e i simboli di pericolo.</p>
      {sub.length > 0 && (
        <>
          <h3 className="pr-h3">Sostanze attive</h3>
          <Kv items={sub.map(a => [a.s.name, `${a.s.status}${a.s.approvalExpiry ? ` · approvazione UE fino al ${dateIt(a.s.approvalExpiry)}` : ''}${a.s.moa ? ` · ${a.s.moa}` : ''}${full && a.s.cfs ? ' · candidata alla sostituzione' : ''}${a.s.lowRisk ? ' · basso rischio' : ''}`])} />
          {sub.some(a => a.s.conditions) && <p className="small">{sub.filter(a => a.s.conditions).map(a => a.s.conditions).join(' ')}</p>}
        </>
      )}
      {full && R.reg?.saleUntil && <div className="note warn">In revoca: vendita fino al {dateIt(R.reg.saleUntil)}, impiego fino al {dateIt(R.reg.useUntil)}.</div>}
      <p className="small muted">Situazione al {dateIt(today)}.</p>
    </>
  );
}

function Trials({ p, R, full }) {
  const ev = R.ev;
  const chart = ev.rows.filter(r => r.effOwn != null).flatMap(r => [
    { key: r.trial.id + 'o', label: `${r.trial.code} · ${p.name}`, value: r.effOwn, color: 'var(--s3)' },
    ...(r.effRef != null ? [{ key: r.trial.id + 'r', label: `${r.trial.code} · riferimento`, value: r.effRef, color: 'var(--s1)' }] : []),
  ]);
  return (
    <>
      <p>{evidenceText(ev, p.name)}</p>
      {ev.n > 0 && (
        <Table rows={ev.rows.map(r => ({ id: r.trial.id, ...r }))} pageSize={20} cols={[
          { key: 'code', label: 'Prova', render: r => <span><b>{r.trial.code}</b><div className="muted small">{r.trial.site?.place}{r.trial.season ? ` · ${r.trial.season}` : ''}</div></span> },
          { key: 'crop', label: 'Coltura e avversità', render: r => <span>{r.trial.cropName}<div className="muted small">{String(r.trial.pest || '').split(' (')[0]}</div></span> },
          { key: 'dose', label: 'Dose', align: 'r', render: r => (r.own?.dose == null ? '—' : `${nf(r.own.dose, r.own.dose < 1 ? 2 : 1)} ${r.own.doseUnit}`) },
          { key: 'pressure', label: 'Testimone', align: 'r', render: r => (r.pressure == null ? '—' : `${nf(r.pressure, 1)}%`) },
          { key: 'effOwn', label: 'Efficacia', align: 'r', render: r => (r.effOwn == null ? '—' : `${nf(r.effOwn)}%`) },
          { key: 'effRef', label: 'Riferimento', align: 'r', render: r => (r.effRef == null ? '—' : `${nf(r.effRef)}%`) },
          { key: 'verdict', label: 'Esito', render: r => (r.verdict ? <Chip kind={r.verdict === 'inferiore' ? 'crit' : r.verdict === 'superiore' ? 'good' : 'accent'}>{VERDICT[r.verdict]}</Chip> : '—') },
        ]} />
      )}
      {chart.length > 0 && <Bars data={chart} unit="%" decimals={0} max={100} ariaLabel="Efficacia nelle prove" labelW={240} />}
      {R.photos.length > 0 && <><h3 className="pr-h3">Foto dalle prove</h3><PhotoGrid photos={R.photos} max={6} /></>}
      {R.advice.length > 0 && <><h3 className="pr-h3">Indicazioni d’uso dalle prove</h3><ul className="pr-list">{R.advice.map(a => <li key={a.code}><b>{a.code}</b>, {a.crop}: {a.text}</li>)}</ul></>}
      <p className="small muted">Efficacia di Abbott sul testimone non trattato al rilievo principale; esito dalla differenza minima significativa al 5% dopo l’analisi della varianza (blocchi randomizzati). Prove secondo le linee guida EPPO.{full ? '' : ' Risultati delle prove dell’azienda: possono variare con annata, pressione della malattia e tempestività dei trattamenti.'}</p>
    </>
  );
}

function Market({ p, R }) {
  const u = uOf(p), B = R.board;
  return (
    <>
      <Columns cols={R.months.map(([m, t]) => ({ label: m.slice(5) + '/' + m.slice(2, 4), parts: [{ key: 't', value: t }] }))} keys={[{ key: 't', label: 'Tonnellate consegnate', color: 'var(--s1)' }]} height={190} unit="t" decimals={1} ariaLabel="Consegne per mese" />
      <p className="small">Consegne degli ultimi 12 mesi a {nf(R.customers)} clienti; prezzo netto medio {nf(perUnit(R.econ.perT.net, p), 2)} € per {u} contro {nf(perUnit(R.econ.perT.list, p), 2)} di listino.</p>
      <h3 className="pr-h3">Prezzi della concorrenza</h3>
      {B?.groups?.length ? (
        <>
          <Table rows={B.groups.map(g => ({ id: g.key, ...g }))} pageSize={20} cols={[
            { key: 'competitor', label: 'Concorrente', render: g => <span>{g.competitor}{g.product ? <div className="muted small">{g.product}</div> : null}</span> },
            { key: 'crop', label: 'Coltura', render: g => g.cropName || g.crop || '—' },
            { key: 'n', label: 'Rilevazioni', align: 'r' },
            { key: 'price', label: `€/${u} rivendita`, align: 'r', render: g => nf(g.price, 2) },
            { key: 'eurHa', label: '€/ha loro', align: 'r', render: g => (g.eurHa == null ? '—' : nf(g.eurHa, 2)) },
            { key: 'ourEurHa', label: '€/ha noi', align: 'r', render: g => (g.ourEurHa == null ? '—' : nf(g.ourEurHa, 2)) },
            { key: 'gap', label: 'Differenza a ettaro', align: 'r', render: g => (g.gap == null ? '—' : `${g.gap > 0 ? '+' : '−'}${nf(Math.abs(g.gap) * 100)}%`) },
          ]} />
          {B.gap != null && <p className="small">Prezzo di parità a ettaro (mediana dei concorrenti): <b>{nf(B.parity, 2)} € per {u}</b>, contro {nf(B.ourPrice, 2)} netti di oggi.</p>}
        </>
      ) : <p className="small muted">Nessun prezzo della concorrenza rilevato negli ultimi 12 mesi.</p>}
    </>
  );
}

function Costs({ p, R }) {
  const u = uOf(p), U = v => perUnit(v, p), e = R.econ;
  return (
    <>
      {e.perT.full != null ? <Waterfall steps={e.steps.map(s => ({ ...s, value: U(s.value) }))} unit={`€/${u}`} decimals={3} labelDec={2} height={220} ariaLabel={`Dal listino al margine di ${p.name}`} />
        : <p className="small muted">Costo pieno non disponibile: manca la ricetta del prodotto.</p>}
      {R.levers.length > 0 && (
        <>
          <h3 className="pr-h3">Leve di risparmio</h3>
          <Table rows={R.levers.slice(0, 8)} pageSize={8} cols={[
            { key: 'label', label: 'Leva', render: x => <span>{x.label}<div className="muted small">{x.how}</div></span> },
            { key: 'basis', label: 'Base', render: x => x.basis },
            { key: 'perT', label: `€/${u}`, align: 'r', render: x => nf(U(x.perT), 3) },
            { key: 'year', label: '€ l’anno', align: 'r', render: x => eur(x.year) },
          ]} />
        </>
      )}
      {R.keep && (
        <div className="pr-summary">
          <h3>Margine o prezzo</h3>
          <p>Con tutte le leve ({nf(U(R.save), 3)} € per {u}): tenendo il prezzo il margine pieno passa dal {nf(R.keep.marginPct * 100, 1)}% al {nf(R.keep.newMarginPct * 100, 1)}%;
            passandone metà al prezzo, il prezzo netto scende a {nf(U(R.half.newPrice), 2)} € per {u} ({nf(R.half.priceChange * 100, 1)}%) con un margine del {nf(R.half.newMarginPct * 100, 1)}%.
            {R.keep.parity ? ` Al prezzo di parità a ettaro (${nf(U(R.keep.parity.price), 2)} € per ${u}) il margine sarebbe ${delPct(R.keep.parity.marginPctAfter * 100, 1)} con i risparmi.` : ''}</p>
        </div>
      )}
    </>
  );
}

/** Report in testo (Markdown) per incollarlo in una mail o in un documento. */
function reportMarkdown(p, R, full) {
  const u = uOf(p), e = R.econ, L = [];
  L.push(`# ${p.name}`, '', `${p.category} · ${p.formulation || p.form} · ${p.packaging || ''}`, '');
  if (R.reg?.regNumber) L.push(`Registrazione ${R.reg.regNumber}${R.reg.regDate ? ` del ${dateIt(R.reg.regDate)}` : ''}${R.reg.organic ? ' · impiegabile in agricoltura biologica' : ''}`, '');
  L.push('## Sintesi', '', evidenceText(R.ev, p.name), '');
  if (full && !e.std) L.push(`Vendite 12 mesi: ${nf(e.t)} t, ${eur(e.revenue)}; prezzo netto ${nf(perUnit(e.perT.net, p), 2)} €/${u}; margine pieno ${e.marginPct == null ? '—' : nf(e.marginPct * 100, 1) + '%'}.`, '');
  L.push('## Usi in etichetta', '', '| Coltura | Avversità | Dose/ha | Carenza |', '|---|---|---|---|');
  for (const x of R.uses) L.push(`| ${x.cropName} | ${x.pest} | ${doseTxt(x.doseMin, x.doseMax, x.doseUnit)} | ${phiTxt(x)} |`);
  L.push('', 'Prima dell’uso vale sempre l’etichetta autorizzata.', '');
  if (R.ev.n) {
    L.push('## Prove di campo', '', '| Prova | Coltura | Efficacia | Riferimento | Esito |', '|---|---|---|---|---|');
    for (const r of R.ev.rows) L.push(`| ${r.trial.code} | ${r.trial.cropName} | ${r.effOwn == null ? '—' : nf(r.effOwn) + '%'} | ${r.effRef == null ? '—' : nf(r.effRef) + '%'} | ${r.verdict ? VERDICT[r.verdict] : '—'} |`);
    L.push('');
    for (const a of R.advice) L.push(`- ${a.code}, ${a.crop}: ${a.text}`);
    L.push('');
  }
  if (full) {
    if (R.board?.gap != null) L.push('## Concorrenza', '', `A ettaro ${R.board.gap > 0 ? 'più caro' : 'più conveniente'} del ${nf(Math.abs(R.board.gap) * 100)}% della mediana dei concorrenti; prezzo di parità ${nf(R.board.parity, 2)} €/${u}.`, '');
    if (R.levers.length) {
      L.push('## Leve di risparmio', '');
      for (const x of R.levers) L.push(`- ${x.label}: ${nf(perUnit(x.perT, p), 3)} €/${u}, ${eur(x.year)} l’anno (${x.basis}). ${x.how}`);
      L.push('');
    }
  }
  return L.join('\n');
}
