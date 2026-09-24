/* FeedOS 16 · Formulazione: formule a costo minimo, prezzi ombra, prezzo di convenienza, frontiera costo–CO₂,
 * controllo dell'aflatossina, cartellino, versioni e approvazione. */
import React, { useEffect, useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuLock, LuLockOpen, LuSparkles, LuCheck, LuFileText, LuHistory, LuGitCompare, LuArrowLeft, LuSave, LuTriangleAlert, LuLeaf, LuPrinter, LuCopy } from 'react-icons/lu';
import { useData, store, toast, openDrawer, uiStore } from '../core/store.js';
import { go } from '../core/router.js';
import { idx, reopt, volumes, appToday, contaminantFor, costs, signals } from '../core/derived.js';
import { nf, sum, dateIt, round, byId, norm, addDays } from '../core/util.js';
import { optimize, checkSpec, formulaCost, formulaCO2, coProductShare, carbonFrontier, diagnose, afb1Check, priceRange } from '../engine/formulation.js';
import { NUTRIENTS, NUT, SPECIES, profile, onDM } from '../engine/nutrients.js';
import { labelFor } from '../engine/label.js';
import { PageHead, Panel, Btn, Table, Chip, Sev, NumInput, Select, Field, Kpi, Bullet, Empty, Kv, SearchBox, filterRows, confirm, Seg, Tabs } from '../ui/ui.jsx';
import { Frontier, Bars, StackBar, SERIES } from '../ui/charts.jsx';
import { SignalList } from './shared.jsx';
import { NAV } from '../app/nav.js';
import { ROLE } from '../core/roles.js';

/** Arrotonda a 0,1 kg e riporta il totale a 1.000 kg sulla riga più grande. */
export function roundLines(lines) {
  const out = lines.filter(l => l.kg > 0.049).map(l => ({ ing: l.ing, kg: round(l.kg, 1), ...(l.locked ? { locked: true } : {}) }));
  const diff = round(1000 - sum(out, l => l.kg), 1);
  if (out.length && Math.abs(diff) > 0 && Math.abs(diff) < 1) { const big = out.reduce((a, b) => (b.kg > a.kg ? b : a)); big.kg = round(big.kg + diff, 1); }
  return out;
}

const CAT = { cereale: 'Cereali', proteico: 'Proteici', coprodotto: 'Co-prodotti', foraggio: 'Foraggi', grasso: 'Grassi', minerale: 'Minerali', aminoacido: 'Aminoacidi', premix: 'Premiscele' };
const CAT_COLOR = { cereale: 'var(--s4)', proteico: 'var(--s1)', coprodotto: 'var(--s3)', foraggio: 'var(--s6)', grasso: 'var(--s2)', minerale: 'var(--s7)', aminoacido: 'var(--s5)', premix: 'var(--s8)' };

export function Formulazione({ route }) {
  const tab = route.tab || 'formule';
  const d = useData();
  if (tab === 'formule' && route.id) return route.id === 'nuova' ? <NuovaFormula d={d} /> : <Editor d={d} id={route.id} />;
  const sigs = signals(d).filter(s => s.area === 'formulazione');
  return (
    <>
      <PageHead title="Formulazione" lead="Formule a costo minimo che rispettano la specifica nutrizionale, con prezzi ombra, controllo dell’aflatossina, CO₂ per tonnellata e bozza di cartellino. Nessuna formula cambia senza approvazione."
        actions={<Btn kind="primary" icon={LuPlus} onClick={() => go('formulazione', 'formule', 'nuova')}>Nuova formula</Btn>}
        tabs={NAV.formulazione.tabs} tab={tab} onTab={t => go('formulazione', t)} />
      {tab === 'formule' && <Formule d={d} sigs={sigs} />}
      {tab === 'materie' && <Materie d={d} />}
      {tab === 'specifiche' && <Specifiche d={d} id={route.id} />}
    </>
  );
}

/* ---------------- elenco formule ---------------- */
function Formule({ d, sigs }) {
  const I = idx(d); const R = reopt(d); const V = volumes(d);
  const [q, setQ] = useState('');
  const rows = useMemo(() => d.formulas.map(f => {
    const cur = formulaCost(f.lines, I.ing);
    const opt = R[f.id]?.status === 'optimal' ? R[f.id].cost : null;
    const prods = d.products.filter(p => p.formulaId === f.id);
    const vol = sum(prods, p => V[p.id] || 0);
    return { ...f, cur, opt, saving: opt != null ? cur - opt : null, vol, prods, co2: formulaCO2(f.lines, I.ing), co: coProductShare(f.lines, I.ing), afb1: afb1Check(f.lines, I.ing, f.species) };
  }), [d.formulas, I, R, V]);
  const view = filterRows(rows, q, ['name', 'code', r => SPECIES[r.species]?.name, r => r.prods.map(p => p.name).join(' ')]);
  const totSaving = sum(rows, r => Math.max(0, r.saving || 0) * r.vol);
  return (
    <>
      <div className="kpis">
        <Kpi label="Formule approvate" value={rows.filter(r => r.status === 'approvata').length} foot={`${rows.length} in archivio`} />
        <Kpi label="Costo medio materie prime" value={nf(sum(rows, r => r.cur * r.vol) / Math.max(1, sum(rows, r => r.vol)), 1)} unit="€/t" foot="ponderato sui volumi" />
        <Kpi label="Risparmio disponibile ri-ottimizzando" value={nf(totSaving / 1000)} unit="mila €/anno" foot="ai prezzi di oggi, sui volumi attuali" />
        <Kpi label="CO₂e delle materie prime" value={nf(sum(rows, r => r.co2 * r.vol) / Math.max(1, sum(rows, r => r.vol)))} unit="kg/t" foot="fattori indicativi" />
      </div>
      {sigs.length > 0 && <Panel title="Da decidere in formulazione" flush><SignalList items={sigs} limit={3} compact /></Panel>}
      <Panel title="Formule" sub="Costo ai prezzi di oggi · clic per aprire l’editor" flush actions={<SearchBox value={q} onChange={setQ} placeholder="Cerca formula o prodotto" id="f-search" />}>
        <Table rows={view} onRow={r => go('formulazione', 'formule', r.id)} initialSort={{ key: 'vol', dir: 'desc' }} cols={[
          { key: 'name', label: 'Formula', render: r => <><b>{r.name}</b><span className="sub">{r.code} · {r.prods.map(p => p.name).join(', ') || 'nessun prodotto'}</span></> },
          { key: 'status', label: 'Stato', render: r => <Chip kind={r.status === 'approvata' ? 'good' : 'warn'} icon={r.status === 'approvata' ? LuCheck : LuTriangleAlert}>{r.status} · v{r.version}</Chip> },
          { key: 'cur', label: 'Costo oggi', align: 'r', render: r => nf(r.cur, 2) },
          { key: 'approvedCost', label: 'All’approvazione', align: 'r', render: r => <>{nf(r.approvedCost, 2)}<span className="sub">{dateIt(r.approvedAt, 'dm')}</span></> },
          { key: 'saving', label: 'Risparmio possibile', align: 'r', render: r => r.saving > 0.5 ? <Chip kind={r.saving >= 3 ? 'warn' : ''}>−{nf(r.saving, 2)} €/t</Chip> : <span className="muted">—</span> },
          { key: 'co2', label: 'kg CO₂e/t', align: 'r', render: r => nf(r.co2) },
          { key: 'co', label: 'Co-prodotti', align: 'r', render: r => nf(r.co * 100) + '%' },
          { key: 'afb1', label: 'AFB1 stimata', align: 'r', sort: r => r.afb1.ratio, render: r => <span title={`Limite ${r.afb1.limit} µg/kg`} className={r.afb1.ratio > 0.8 ? 'chip warn' : ''}>{nf(r.afb1.value, 1)} / {r.afb1.limit}</span> },
          { key: 'vol', label: 't/anno', align: 'r', render: r => nf(r.vol) },
        ]} />
      </Panel>
    </>
  );
}

/* ---------------- nuova formula ---------------- */
function NuovaFormula({ d }) {
  const [specId, setSpecId] = useState(d.specs[0]?.id);
  const [name, setName] = useState('');
  const spec = d.specs.find(s => s.id === specId);
  const create = () => {
    if (!spec) return;
    const r = optimize({ ingredients: d.ingredients, spec, lines: [], options: { contaminant: contaminantFor(d, { species: spec.species }) } });
    const lines = r.status === 'optimal' ? roundLines(r.lines) : [];
    const code = 'F-' + (spec.id.replace('sp-', '').toUpperCase()) + '-' + String(d.formulas.length + 1).padStart(2, '0');
    const id = store.add('formulas', { code, name: name.trim() || spec.name, specId, species: spec.species, status: 'bozza', version: 0, lines, draft: lines, history: [], approvedAt: null, approvedCost: null, createdAt: appToday(d) }, 'Nuova formula: ' + (name.trim() || spec.name));
    toast(r.status === 'optimal' ? 'Formula creata con la soluzione a costo minimo: verificala e approvala.' : 'Formula creata vuota: la specifica non ha soluzione con le materie prime attive.');
    go('formulazione', 'formule', id);
  };
  return (
    <>
      <PageHead title="Nuova formula" lead="Scegli la specifica nutrizionale: FeedOS propone subito la composizione a costo minimo con le materie prime e i prezzi di oggi. Resterà una bozza fino all’approvazione." actions={<Btn icon={LuArrowLeft} onClick={() => go('formulazione', 'formule')}>Formule</Btn>} />
      <Panel title="Impostazione">
        <div className="form">
          <Field label="Specifica nutrizionale"><Select value={specId} onChange={setSpecId} options={d.specs.map(s => ({ id: s.id, label: s.name }))} id="nf-spec" /></Field>
          <Field label="Nome della formula" hint="Facoltativo: di norma il nome della specifica"><input className="input" value={name} onChange={e => setName(e.target.value)} id="nf-name" /></Field>
        </div>
        <div className="row" style={{ marginTop: 14 }}><Btn kind="primary" icon={LuSparkles} onClick={create}>Crea e ottimizza</Btn>{spec && <span className="small muted">{spec.constraints.length} vincoli nutrizionali · specie {SPECIES[spec.species]?.name}</span>}</div>
      </Panel>
    </>
  );
}

/* ---------------- editor ---------------- */
function Editor({ d, id }) {
  const f = d.formulas.find(x => x.id === id);
  const I = idx(d);
  const [view, setView] = useState('composizione');
  const [draft, setDraft] = useState(null);
  const [opts, setOpts] = useState({ maxChange: '', carbon: 0, useStock: false });
  const [res, setRes] = useState(null);
  useEffect(() => { if (f) { setDraft((f.draft || f.lines).map(l => ({ ...l }))); setRes(null); } }, [id]);
  if (!f) return <><PageHead title="Formula non trovata" lead="La formula potrebbe essere stata eliminata o appartenere a un altro archivio." /><Empty title="Nessuna formula con questo codice"><Btn onClick={() => go('formulazione', 'formule')}>Torna alle formule</Btn></Empty></>;
  if (!draft) return null;
  const spec = I.spec[f.specId];
  const prods = d.products.filter(p => p.formulaId === f.id);
  const vol = sum(prods, p => volumes(d)[p.id] || 0);
  const chk = checkSpec(draft, I.ing, spec);
  const cost = formulaCost(draft, I.ing), costApproved = formulaCost(f.lines, I.ing);
  const total = sum(draft, l => +l.kg || 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(f.lines);
  const cont = contaminantFor(d, f);
  const locked = Object.fromEntries(draft.filter(l => l.locked).map(l => [l.ing, +l.kg]));
  const P = { ingredients: d.ingredients, spec, lines: draft, options: { contaminant: cont, maxChange: opts.maxChange === '' ? null : +opts.maxChange, carbonPrice: (+opts.carbon || 0) / 1000, locked, stockTonnes: opts.useStock ? Math.max(1, vol / 52 * 4) : null } };
  const run = () => {
    const r = optimize(P);
    if (r.status !== 'optimal') { setRes({ status: r.status, diag: diagnose(P) }); return; }
    setRes(r); setView('composizione');
  };
  const apply = () => { setDraft(roundLines(res.lines.map(l => ({ ...l, locked: !!locked[l.ing] })))); setRes(null); toast('Proposta applicata alla bozza: verifica, poi salva o approva'); };
  const saveDraft = () => { store.update('formulas', f.id, { draft }, `Bozza salvata: ${f.name}`); toast('Bozza salvata'); };
  const approve = () => confirm(`Approvare la versione ${f.version + 1}?`, <>
    <p>La formula «{f.name}» passerà alla versione {f.version + 1} con costo {nf(cost, 2)} €/t ai prezzi di oggi ({cost < costApproved ? '−' : '+'}{nf(Math.abs(cost - costApproved), 2)} €/t rispetto alla versione in uso).</p>
    {!chk.ok && <p className="note crit">Attenzione: la bozza non rispetta tutta la specifica.</p>}
    {Math.abs(total - 1000) > 0.5 && <p className="note crit">Il totale è {nf(total, 1)} kg invece di 1.000 kg.</p>}
    <p className="small muted">Resta nel registro chi ha approvato e quando. I prodotti collegati useranno la nuova versione dalla prossima produzione.</p></>, () => {
      const lines = draft.map(({ ing, kg }) => ({ ing, kg: +kg }));
      const version = f.version + 1;
      store.update('formulas', f.id, x => ({ ...x, lines, draft: null, version, status: 'approvata', approvedAt: appToday(d), approvedCost: round(cost, 2), history: [...(x.history || []), { version, date: appToday(d), lines, cost: round(cost, 2), note: 'Approvata in FeedOS', author: ROLE[d.settings.role]?.label || 'Direzione', approvedBy: ROLE[d.settings.role]?.label || 'Direzione' }] }), `Formula approvata: ${f.name} v${version}`);
      toast(`Versione ${version} approvata`);
    }, { ok: 'Approva' });
  const setLine = (ing, patch) => setDraft(ds => ds.map(l => l.ing === ing ? { ...l, ...patch } : l));
  const removeLine = ing => setDraft(ds => ds.filter(l => l.ing !== ing));
  const addLine = ing => { if (!ing || draft.some(l => l.ing === ing)) return; setDraft(ds => [...ds, { ing, kg: 0 }]); };
  const afb = afb1Check(draft, I.ing, f.species);
  return (
    <>
      <PageHead title={f.name} lead={<>{f.code} · {SPECIES[f.species]?.name} · versione {f.version} {f.approvedAt ? `approvata il ${dateIt(f.approvedAt)}` : '(mai approvata)'} · usata da {prods.map(p => p.name).join(', ') || 'nessun prodotto'} · {nf(vol)} t/anno</>}
        actions={<>
          <Btn icon={LuArrowLeft} onClick={() => go('formulazione', 'formule')}>Formule</Btn>
          <Btn icon={LuSave} onClick={saveDraft} disabled={!dirty}>Salva bozza</Btn>
          <Btn kind="primary" icon={LuCheck} onClick={approve} disabled={!dirty && f.status === 'approvata'}>Approva versione</Btn>
        </>} />
      <div className="kpis" id="fx-kpi">
        <Kpi label="Costo materie prime (bozza)" value={nf(cost, 2)} unit="€/t" foot={dirty ? `in uso ${nf(costApproved, 2)} €/t` : 'uguale alla versione in uso'} delta={dirty && costApproved ? (cost / costApproved - 1) * 100 : null} deltaGood={cost <= costApproved} />
        <Kpi label="Specifica" value={chk.ok ? 'Rispettata' : `${chk.items.filter(x => x.status !== 'ok').length} fuori`} foot={`${chk.items.length} vincoli controllati`} />
        <Kpi label="Aflatossina B1 stimata" value={nf(afb.value, 1)} unit="µg/kg" foot={`limite ${afb.limit} µg/kg (${SPECIES[f.species]?.name.toLowerCase()})`} />
        <Kpi label="CO₂e materie prime" value={nf(formulaCO2(draft, I.ing))} unit="kg/t" foot={`co-prodotti ${nf(coProductShare(draft, I.ing) * 100)}% in peso`} />
      </div>
      <Tabs items={[{ id: 'composizione', label: 'Composizione e ottimizzazione' }, { id: 'sensibilita', label: 'Prezzi ombra e convenienza' }, { id: 'co2', label: 'Costo e CO₂' }, { id: 'cartellino', label: 'Cartellino' }, { id: 'storia', label: 'Versioni', n: f.history?.length }]} value={view} onChange={setView} />
      {view === 'composizione' && (
        <>
          <Panel title="Ottimizzazione" sub="Il motore cerca la composizione di costo minimo che rispetta tutti i vincoli" id="fx-opt"
            actions={<Btn kind="primary" icon={LuSparkles} onClick={run}>Ottimizza ai prezzi di oggi</Btn>}>
            <div className="form">
              <Field label="Variazione massima per ingrediente" hint="kg/t rispetto alla bozza; vuoto = libera"><NumInput value={opts.maxChange === '' ? null : opts.maxChange} onChange={v => setOpts(o => ({ ...o, maxChange: v == null ? '' : v }))} decimals={0} placeholder="libera" id="fx-maxchange" /></Field>
              <Field label="Prezzo interno del carbonio" hint="€ per t di CO₂e: pesa le emissioni delle materie prime"><NumInput value={opts.carbon} onChange={v => setOpts(o => ({ ...o, carbon: v || 0 }))} decimals={0} id="fx-carbon" /></Field>
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={opts.useStock} onChange={e => setOpts(o => ({ ...o, useStock: e.target.checked }))} /> Usa solo le scorte per 4 settimane di produzione</label>
            </div>
            {res && res.status !== 'optimal' && <Infeasible res={res} spec={spec} />}
            {res && res.status === 'optimal' && <Proposal res={res} draft={draft} I={I} vol={vol} cost={cost} onApply={apply} onDiscard={() => setRes(null)} />}
          </Panel>
          <div className="split">
            <Composition draft={draft} I={I} d={d} setLine={setLine} removeLine={removeLine} addLine={addLine} total={total} spec={spec} />
            <Profile chk={chk} spec={spec} afb={afb} />
          </div>
        </>
      )}
      {view === 'sensibilita' && <Sensitivity P={P} I={I} spec={spec} />}
      {view === 'co2' && <CarbonView P={P} I={I} cost={cost} draft={draft} onPick={lines => { setDraft(roundLines(lines)); setView('composizione'); toast('Composizione della frontiera applicata alla bozza'); }} />}
      {view === 'cartellino' && <Cartellino d={d} f={f} draft={draft} I={I} spec={spec} prods={prods} />}
      {view === 'storia' && <Storia d={d} f={f} I={I} onRestore={lines => { setDraft(lines.map(l => ({ ...l }))); setView('composizione'); toast('Versione caricata nella bozza'); }} />}
    </>
  );
}

function Composition({ draft, I, d, setLine, removeLine, addLine, total, spec }) {
  const [adding, setAdding] = useState('');
  const rows = [...draft].sort((a, b) => b.kg - a.kg);
  const avail = d.ingredients.filter(i => !draft.some(l => l.ing === i.id) && i.active !== false);
  const cats = {};
  for (const l of draft) { const c = I.ing[l.ing]?.category || 'altro'; cats[c] = (cats[c] || 0) + (+l.kg || 0); }
  return (
    <Panel title="Composizione per 1.000 kg" sub={Math.abs(total - 1000) > 0.05 ? `Totale ${nf(total, 1)} kg: ${total < 1000 ? 'mancano' : 'eccedono'} ${nf(Math.abs(1000 - total), 1)} kg` : 'Totale 1.000 kg'} flush>
      <div style={{ padding: '0 16px 12px' }}>
        <StackBar parts={Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: CAT[k] || k, value: v, color: CAT_COLOR[k] || 'var(--ink-2)' }))} ariaLabel="Composizione per categoria" />
      </div>
      <div className="tw">
        <table className="t">
          <thead><tr><th>Materia prima</th><th className="r">kg/t</th><th className="r">%</th><th className="r">€/t</th><th className="r">Contributo €/t</th><th className="r">Limiti kg/t</th><th /></tr></thead>
          <tbody>
            {rows.map(l => {
              const ing = I.ing[l.ing]; const lim = spec?.ingLimits?.[l.ing] || {};
              const out = (lim.min != null && l.kg < lim.min - 0.05) || (lim.max != null && l.kg > lim.max + 0.05) || (ing?.maxKg != null && l.kg > ing.maxKg + 0.05);
              return (
                <tr key={l.ing}>
                  <td><button className="code" onClick={() => openDrawer('ingredient', l.ing)} title="Scheda materia prima">{ing?.code}</button> <b>{ing?.name}</b>{ing?.coProduct && <span className="sub">co-prodotto</span>}</td>
                  <td className="r" style={{ width: 110 }}><NumInput value={l.kg} onChange={v => setLine(l.ing, { kg: v || 0 })} decimals={1} slim className={out ? 'warn' : ''} ariaLabel={`kg/t di ${ing?.name}`} /></td>
                  <td className="r">{nf(l.kg / 10, 1)}</td>
                  <td className="r">{nf(ing?.price)}</td>
                  <td className="r">{nf((ing?.price || 0) * l.kg / 1000, 2)}</td>
                  <td className="r small muted">{lim.min != null || lim.max != null || ing?.maxKg != null ? `${lim.min ?? 0}–${lim.max ?? ing?.maxKg ?? '∞'}` : '—'}</td>
                  <td className="nowrap"><button className="btn ghost small icon" onClick={() => setLine(l.ing, { locked: !l.locked })} title={l.locked ? 'Sblocca: l’ottimizzazione potrà cambiarla' : 'Blocca questa quantità durante l’ottimizzazione'} aria-pressed={!!l.locked}>{l.locked ? <LuLock /> : <LuLockOpen />}</button>
                    <button className="btn ghost small icon" onClick={() => removeLine(l.ing)} title="Togli dalla bozza"><LuTrash2 /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>Totale</td><td className="r">{nf(total, 1)}</td><td className="r">{nf(total / 10, 1)}</td><td /><td className="r">{nf(formulaCost(draft, I.ing), 2)}</td><td /><td /></tr></tfoot>
        </table>
      </div>
      <div className="row" style={{ padding: '12px 16px' }}>
        <select className="select" style={{ maxWidth: 320 }} value={adding} onChange={e => setAdding(e.target.value)} aria-label="Aggiungi materia prima">
          <option value="">Aggiungi una materia prima…</option>
          {Object.entries(CAT).map(([k, lab]) => <optgroup key={k} label={lab}>{avail.filter(i => i.category === k).map(i => <option key={i.id} value={i.id}>{i.name} · {nf(i.price)} €/t</option>)}</optgroup>)}
        </select>
        <Btn icon={LuPlus} onClick={() => { addLine(adding); setAdding(''); }} disabled={!adding}>Aggiungi</Btn>
      </div>
    </Panel>
  );
}

function Profile({ chk, spec, afb }) {
  return (
    <Panel title="Profilo rispetto alla specifica" sub={spec?.name} flush>
      <div className="tw">
        <table className="t">
          <thead><tr><th>Parametro</th><th className="r">Valore</th><th style={{ width: '38%' }}>Intervallo ammesso</th><th /></tr></thead>
          <tbody>
            {chk.items.map((x, i) => {
              const n = x.nut ? NUT[x.nut] : null;
              const lo = Math.min(x.value ?? 0, x.min ?? x.value ?? 0), hi = Math.max(x.value ?? 0, x.max ?? (x.min != null ? x.min * 1.3 : (x.value ?? 1) * 1.3));
              const pad = (hi - lo) * 0.25 || 0.1;
              return (
                <tr key={i}>
                  <td><b>{n ? n.short : x.ratio.replace('CA', 'Ca').replace('/P', ':P')}</b><span className="sub">{n ? `${n.name}${x.basis === 'ss' ? ' · sulla s.s.' : ''}` : 'rapporto'}</span></td>
                  <td className="r"><b>{x.value == null ? '—' : nf(x.value, n?.dec ?? 2)}</b> <span className="muted small">{n?.unit === '%' ? '%' : n?.unit || ''}</span></td>
                  <td><Bullet value={x.value} min={x.min} max={x.max} lo={Math.max(0, lo - pad)} hi={hi + pad} bad={x.status !== 'ok'} /><span className="sub">{x.min != null && x.min !== '' ? `min ${nf(x.min, n?.dec ?? 2)}` : ''}{x.min != null && x.max != null ? ' · ' : ''}{x.max != null && x.max !== '' ? `max ${nf(x.max, n?.dec ?? 2)}` : ''}</span></td>
                  <td>{x.status === 'ok' ? <Chip kind="good" icon={LuCheck}>ok</Chip> : <Chip kind="crit" icon={LuTriangleAlert}>{x.status === 'low' ? 'basso' : x.status === 'high' ? 'alto' : 'n/d'}</Chip>}</td>
                </tr>
              );
            })}
            <tr><td><b>AFB1</b><span className="sub">Aflatossina B1 stimata dai lotti</span></td><td className="r"><b>{nf(afb.value, 1)}</b> <span className="muted small">µg/kg</span></td>
              <td><Bullet value={afb.value} max={afb.limit} lo={0} hi={afb.limit * 1.3} /><span className="sub">max {afb.limit} (Dir. 2002/32/CE)</span></td>
              <td>{afb.value <= afb.limit ? <Chip kind="good" icon={LuCheck}>ok</Chip> : <Chip kind="crit" icon={LuTriangleAlert}>oltre</Chip>}</td></tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Proposal({ res, draft, I, vol, cost, onApply, onDiscard }) {
  const ids = [...new Set([...draft.map(l => l.ing), ...res.lines.map(l => l.ing)])];
  const rows = ids.map(id => ({ id, a: draft.find(l => l.ing === id)?.kg || 0, b: res.lines.find(l => l.ing === id)?.kg || 0 })).filter(r => Math.abs(r.a - r.b) > 0.05).sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
  const saving = cost - res.cost;
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <div className={`note ${saving > 0.01 ? 'good' : ''}`}>
        <b>Proposta: {nf(res.cost, 2)} €/t</b> · {saving > 0.01 ? `risparmio ${nf(saving, 2)} €/t, circa ${nf(saving * vol / 1000)} mila € l’anno sui volumi attuali` : saving < -0.01 ? `costa ${nf(-saving, 2)} €/t in più: la bozza attuale non rispetta la specifica o i nuovi vincoli lo richiedono` : 'la bozza è già la soluzione di costo minimo'}. Tutti i vincoli sono rispettati; CO₂e {nf(res.co2)} kg/t.
      </div>
      {rows.length > 0 ? (
        <div className="tw"><table className="t">
          <thead><tr><th>Materia prima</th><th className="r">Bozza kg/t</th><th className="r">Proposta kg/t</th><th className="r">Differenza</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{I.ing[r.id]?.name}</td><td className="r">{nf(r.a, 1)}</td><td className="r"><b>{nf(r.b, 1)}</b></td><td className="r"><span className={r.b > r.a ? 'delta up' : 'delta down'}>{r.b > r.a ? '+' : '−'}{nf(Math.abs(r.b - r.a), 1)}</span></td></tr>)}</tbody>
        </table></div>
      ) : <p className="small muted">Nessuna differenza di composizione.</p>}
      <div className="row"><Btn kind="primary" icon={LuCheck} onClick={onApply}>Applica alla bozza</Btn><Btn kind="ghost" onClick={onDiscard}>Scarta</Btn><span className="small muted">L’applicazione cambia solo la bozza: la formula in uso resta quella approvata.</span></div>
    </div>
  );
}

function Infeasible({ res, spec }) {
  const { diag } = res;
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <div className="note crit"><b>Nessuna composizione rispetta insieme tutti i vincoli.</b> {res.status === 'infeasible' ? 'Le materie prime ammesse, i loro limiti e la specifica sono incompatibili.' : res.message}</div>
      {diag?.tips?.length > 0 && <div><div className="eyebrow" style={{ marginBottom: 6 }}>Vincoli che bloccano la soluzione</div>
        <ul className="steplist">{diag.tips.map((t, i) => { const n = NUT[t.nut]; const ex = diag.extremes[t.nut]; return <li key={i}><span>Senza il vincolo su <b>{n?.name}</b> la soluzione esiste ({nf(t.cost, 2)} €/t, {n?.short} {nf(t.reachable, n?.dec)}{n?.unit === '%' ? '%' : ' ' + n?.unit}). Con queste materie prime {n?.short} può andare da {nf(ex?.min, n?.dec)} a {nf(ex?.max, n?.dec)}.</span></li>; })}</ul></div>}
      <p className="small muted">Suggerimenti: allarga un limite, aggiungi una materia prima con il nutriente mancante o sblocca le quantità fisse.</p>
    </div>
  );
}

/* ---------------- sensibilità ---------------- */
function Sensitivity({ P, I, spec }) {
  const res = useMemo(() => optimize(P), [P.lines, P.options.carbonPrice, P.options.maxChange]);
  const [ranges, setRanges] = useState({});
  if (res.status !== 'optimal') return <Panel title="Prezzi ombra"><p className="muted">Serve prima una soluzione ammissibile: usa «Ottimizza» nella scheda Composizione.</p></Panel>;
  const binding = res.constraints.filter(c => c.binding && c.shadow && Math.abs(c.shadow) > 0.005 && (c.kind === 'nut' || c.kind === 'contam'));
  const stepOf = n => n?.unit === '%' ? (n.dec >= 2 ? 0.01 : 0.1) : n?.unit === 'µg/kg' ? 1 : 0.01;
  const excluded = res.ingredients.filter(i => !i.used && i.entryPrice != null && i.entryPrice > 0).sort((a, b) => (b.entryPrice / b.price) - (a.entryPrice / a.price)).slice(0, 12);
  const atMax = res.ingredients.filter(i => i.atMax && i.maxValue > 0.001).sort((a, b) => b.maxValue - a.maxValue);
  const used = res.lines.slice(0, 8);
  return (
    <>
      <div className="note">Questa analisi riguarda la <b>soluzione di costo minimo</b> per la specifica ({nf(res.cost, 2)} €/t). I prezzi ombra dicono quanto costa ogni vincolo che «tira»: sono esatti per piccole variazioni e sono stati verificati con il ricalcolo.</div>
      <div className="grid g2 start">
        <Panel title="Vincoli che costano" sub="Effetto sul costo di una piccola variazione del limite" flush>
          <Table rows={binding} rowKey={c => c.nut + c.side} pageSize={20} cols={[
            { key: 'nut', label: 'Vincolo', render: c => <><b>{NUT[c.nut]?.name}</b><span className="sub">{c.kind === 'contam' ? 'limite di legge ' : c.side === 'min' ? 'minimo ' : 'massimo '}{nf(c.bound, NUT[c.nut]?.dec)}{NUT[c.nut]?.unit === '%' ? '%' : ' ' + NUT[c.nut]?.unit}{c.basis === 'ss' ? ' sulla s.s.' : ''}</span></> },
            { key: 'shadow', label: 'Se alzi il limite', align: 'r', sort: c => -Math.abs(c.shadow), render: c => { const n = NUT[c.nut]; const step = stepOf(n); return <><b>{c.shadow * step > 0 ? '+' : '−'}{nf(Math.abs(c.shadow * step), 2)} €/t</b><span className="sub">di {nf(step, step < 0.1 ? 2 : step < 1 ? 1 : 0)} {n?.unit === '%' ? 'punti %' : n?.unit}</span></>; } },
          ]} empty="Nessun vincolo nutrizionale attivo." />
        </Panel>
        <Panel title="Materie prime escluse: prezzo di convenienza" sub="Sotto questo prezzo entrerebbero in formula" flush>
          <Table rows={excluded} pageSize={12} cols={[
            { key: 'name', label: 'Materia prima', sort: i => I.ing[i.id]?.name, render: i => <><button className="code" onClick={() => openDrawer('ingredient', i.id)}>{I.ing[i.id]?.code}</button> {I.ing[i.id]?.name}</> },
            { key: 'price', label: 'Prezzo oggi', align: 'r', render: i => nf(i.price) },
            { key: 'entryPrice', label: 'Entra sotto', align: 'r', render: i => <b>{nf(i.entryPrice)}</b> },
            { key: 'gap', label: 'Distanza', align: 'r', sort: i => i.entryPrice / i.price, render: i => <span className={i.entryPrice / i.price > 0.95 ? 'chip warn' : ''}>−{nf((1 - i.entryPrice / i.price) * 100)}%</span> },
          ]} />
        </Panel>
      </div>
      <div className="grid g2 start">
        <Panel title="Limiti massimi che frenano il risparmio" sub="Materie prime al loro massimo: valore di 1 kg/t in più" flush>
          <Table rows={atMax} pageSize={12} cols={[
            { key: 'id', label: 'Materia prima', render: i => I.ing[i.id]?.name },
            { key: 'kg', label: 'kg/t', align: 'r', render: i => nf(i.kg, 1) },
            { key: 'maxValue', label: 'Risparmio per +1 kg', align: 'r', render: i => <b>{nf(i.maxValue, 3)} €/t</b> },
          ]} empty="Nessun limite massimo attivo." />
        </Panel>
        <Panel title="Stabilità del prezzo" sub="Fino a che prezzo la quantità resta invariata" flush>
          <Table rows={used} rowKey={l => l.ing} pageSize={10} cols={[
            { key: 'ing', label: 'Materia prima', render: l => I.ing[l.ing]?.name },
            { key: 'kg', label: 'kg/t', align: 'r', render: l => nf(l.kg, 1) },
            { key: 'rg', label: 'Intervallo di prezzo €/t', align: 'r', nosort: true, render: l => ranges[l.ing] ? <span>{ranges[l.ing].down == null ? '0' : nf(ranges[l.ing].down)} – {ranges[l.ing].up == null ? 'oltre' : nf(ranges[l.ing].up)}</span> :
              <Btn small kind="ghost" onClick={() => setRanges(r => ({ ...r, [l.ing]: priceRange(P, l.ing, res) }))}>Calcola</Btn> },
          ]} />
        </Panel>
      </div>
    </>
  );
}

/* ---------------- costo e CO₂ ---------------- */
function CarbonView({ P, I, cost, draft, onPick }) {
  const fr = useMemo(() => carbonFrontier({ ...P, options: { ...P.options, carbonPrice: 0 } }, 9), [P.lines]);
  const [sel, setSel] = useState(null);
  if (!fr.length) return <Panel title="Frontiera costo–CO₂"><p className="muted">Serve una specifica con soluzione ammissibile.</p></Panel>;
  const base = fr[0];
  const pts = fr.map((p, i) => ({ x: p.co2, y: p.cost, label: i === 0 ? 'Costo minimo' : `−${nf(base.co2 - p.co2)} kg CO₂e/t`, active: sel === i }));
  const curCO2 = formulaCO2(draft, I.ing);
  const s = sel != null ? fr[sel] : null;
  return (
    <div className="split">
      <Panel title="Frontiera costo–CO₂" sub="Ogni punto è la formula di costo minimo con un tetto alle emissioni delle materie prime" id="fx-frontier">
        <Frontier points={pts} current={{ x: curCO2, y: cost, label: 'Bozza attuale' }} xLabel="kg CO₂e per t di mangime (materie prime)" yLabel="€/t" onPick={(p, i) => setSel(i)} ariaLabel="Frontiera tra costo ed emissioni" />
        <p className="small muted" style={{ marginTop: 8 }}>La bozza attuale: {nf(cost, 2)} €/t e {nf(curCO2)} kg CO₂e/t. Fattori di emissione indicativi: sostituirli con dati di filiera prima di comunicare risultati.</p>
      </Panel>
      <Panel title={s ? 'Formula selezionata' : 'Come leggerla'} sub={s ? `${nf(s.cost, 2)} €/t · ${nf(s.co2)} kg CO₂e/t` : undefined}>
        {s ? (
          <div className="stack">
            <Kv items={[['Costo in più', `${nf(s.cost - base.cost, 2)} €/t`], ['Emissioni in meno', `${nf(base.co2 - s.co2)} kg CO₂e/t`], ['Costo per t di CO₂e evitata', base.co2 - s.co2 > 0.5 ? `${nf((s.cost - base.cost) / (base.co2 - s.co2) * 1000)} €/t CO₂e` : '—'], ['Costo marginale al tetto', `${nf(s.abatement)} €/t CO₂e`]]} />
            <Bars data={[...s.lines].sort((a, b) => b.kg - a.kg).slice(0, 8).map(l => ({ key: l.ing, label: I.ing[l.ing]?.name, value: l.kg, color: CAT_COLOR[I.ing[l.ing]?.category] }))} unit="kg" ariaLabel="Composizione della formula selezionata" />
            <Btn kind="primary" icon={LuLeaf} onClick={() => onPick(s.lines)}>Usa questa composizione come bozza</Btn>
          </div>
        ) : <ul className="steplist">
          <li><span>Il punto più a destra e più in basso è la formula di costo minimo; il rombo dorato è la bozza attuale.</span></li>
          <li><span>Andando verso sinistra le emissioni scendono e il costo sale: la pendenza dice quanto costa ogni chilo di CO₂e evitato.</span></li>
          <li><span>Clicca un punto per vedere la composizione e usarla come bozza, da verificare e approvare.</span></li>
        </ul>}
      </Panel>
    </div>
  );
}

/* ---------------- cartellino ---------------- */
function Cartellino({ d, f, draft, I, spec, prods }) {
  const [pid, setPid] = useState(prods[0]?.id);
  const product = prods.find(p => p.id === pid) || prods[0];
  const lot = d.lots.filter(l => l.productId === product?.id).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const L = labelFor({ product, formula: { ...f, lines: draft }, spec, ingById: I.ing, company: d.settings.company, lot });
  const text = [`${L.title.toUpperCase()}`, L.name, '', 'COMPOSIZIONE: ' + L.composition.map(c => c.name).join(', ') + '.', '', 'COMPONENTI ANALITICI: ' + L.analytical.map(a => `${a.name} ${nf(a.value, a.name.match(/Calcio|Fosforo|Sodio|Lisina|Metionina|Magnesio/) ? 2 : 1)}%`).join('; ') + '.',
    L.additives.length ? 'ADDITIVI (per kg): ' + L.additives.map(a => `${a.name} ${nf(a.value, a.value < 1 ? 2 : a.value < 10 ? 1 : 0)} ${a.unit.replace('/kg', '')}`).join('; ') + '.' : '', '', 'ISTRUZIONI: ' + L.use, `Lotto: ${L.lot} · Peso netto: ${L.netWeight}${L.bestBefore ? ' · Da consumarsi preferibilmente entro: ' + dateIt(L.bestBefore) : ''}`, `Stabilimento ${L.approval} · ${L.responsible}`].filter(x => x !== undefined).join('\n');
  return (
    <div className="split">
      <div className="label-card" id="fx-label">
        <h3>{L.title}</h3>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>{L.name}</div>
        <div className="k">Composizione</div>
        <div>{L.composition.map(c => c.name).join(', ')}.</div>
        <div className="k">Componenti analitici</div>
        <div>{L.analytical.map((a, i) => <span key={i}>{a.name} {nf(a.value, ['Calcio', 'Fosforo', 'Sodio', 'Lisina', 'Metionina', 'Magnesio'].includes(a.name) ? 2 : 1)}%{i < L.analytical.length - 1 ? '; ' : '.'}</span>)}</div>
        {L.additives.length > 0 && <><div className="k">Additivi per kg</div><div>{L.additives.map((a, i) => <span key={i}>{a.name} {nf(a.value, a.value < 1 ? 2 : a.value < 10 ? 1 : 0)} {a.unit.replace('/kg', '')}{i < L.additives.length - 1 ? '; ' : '.'}</span>)}</div></>}
        <div className="k">Istruzioni per l’uso</div><div>{L.use}</div>
        <div className="k">Lotto · peso · scadenza</div>
        <div className="m">{L.lot} · {L.netWeight}{L.bestBefore ? ` · entro ${dateIt(L.bestBefore)}` : ''}</div>
        <div className="k">Stabilimento</div><div className="m">{L.approval} · {L.responsible}</div>
        <div className="note">{L.disclaimer}</div>
      </div>
      <Panel title="Dal calcolo all’etichetta" sub="Reg. (CE) 767/2009, all. VI capo II">
        <div className="stack">
          {prods.length > 1 && <Field label="Prodotto"><Select value={pid} onChange={setPid} options={prods.map(p => ({ id: p.id, label: p.name }))} id="lab-prod" /></Field>}
          <ul className="steplist">
            <li><span>Le materie prime sono elencate in ordine decrescente di peso con la loro denominazione di catalogo.</span></li>
            <li><span>I componenti analitici obbligatori dipendono dal tipo di mangime e dalla specie: calcio e fosforo nei complementari solo se superano 5% e 2%, lisina e metionina per suini e pollame.</span></li>
            <li><span>L’umidità si dichiara solo oltre il 14%. Gli additivi derivano dalla premiscela: verificare tenori e numeri di identificazione sulla sua scheda.</span></li>
          </ul>
          <Btn icon={LuCopy} onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Testo del cartellino copiato'); } catch { toast('Copia non riuscita: seleziona il testo a mano', 'err'); } }}>Copia il testo</Btn>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- versioni ---------------- */
function Storia({ d, f, I, onRestore }) {
  const hist = [...(f.history || [])].reverse();
  const [a, setA] = useState(hist[1]?.version ?? hist[0]?.version);
  const [b, setB] = useState(hist[0]?.version);
  const ha = hist.find(h => h.version === +a), hb = hist.find(h => h.version === +b);
  const ids = ha && hb ? [...new Set([...ha.lines.map(l => l.ing), ...hb.lines.map(l => l.ing)])] : [];
  return (
    <div className="split">
      <Panel title="Versioni approvate" flush>
        <Table rows={hist} rowKey={h => h.version} cols={[
          { key: 'version', label: 'Versione', render: h => <b>v{h.version}</b> },
          { key: 'date', label: 'Data', render: h => dateIt(h.date) },
          { key: 'cost', label: 'Costo all’epoca', align: 'r', render: h => nf(h.cost, 2) },
          { key: 'today', label: 'Costo oggi', align: 'r', sort: h => formulaCost(h.lines, I.ing), render: h => nf(formulaCost(h.lines, I.ing), 2) },
          { key: 'note', label: 'Nota', render: h => <>{h.note}<span className="sub">{h.author} · approvata da {h.approvedBy}</span></> },
          { key: 'x', label: '', nosort: true, render: h => <Btn small kind="ghost" icon={LuHistory} onClick={() => onRestore(h.lines)}>Carica</Btn> },
        ]} empty="Nessuna versione approvata." />
      </Panel>
      <Panel title="Confronto" sub="Differenze di composizione tra due versioni">
        {hist.length < 2 ? <p className="muted">Serve almeno una seconda versione.</p> : <>
          <div className="row" style={{ flexWrap: 'nowrap' }}><Select className="grow" value={a} onChange={setA} options={hist.map(h => ({ id: h.version, label: 'Versione ' + h.version }))} ariaLabel="Versione A" /><LuGitCompare aria-hidden="true" style={{ flex: 'none' }} /><Select className="grow" value={b} onChange={setB} options={hist.map(h => ({ id: h.version, label: 'Versione ' + h.version }))} ariaLabel="Versione B" /></div>
          <div className="tw" style={{ marginTop: 12 }}><table className="t"><thead><tr><th>Materia prima</th><th className="r">v{a}</th><th className="r">v{b}</th><th className="r">Δ</th></tr></thead>
            <tbody>{ids.map(id => { const x = ha.lines.find(l => l.ing === id)?.kg || 0, y = hb.lines.find(l => l.ing === id)?.kg || 0; return <tr key={id}><td>{I.ing[id]?.name}</td><td className="r">{nf(x, 1)}</td><td className="r">{nf(y, 1)}</td><td className="r">{Math.abs(y - x) < 0.05 ? '—' : (y > x ? '+' : '−') + nf(Math.abs(y - x), 1)}</td></tr>; })}</tbody></table></div>
        </>}
      </Panel>
    </div>
  );
}

/* ---------------- materie prime ---------------- */
function Materie({ d }) {
  const [q, setQ] = useState(''), [cat, setCat] = useState('');
  const rows = filterRows(d.ingredients.filter(i => !cat || i.category === cat), q, ['name', 'code', 'supplier', 'origin']);
  return (
    <Panel title="Materie prime" sub="Valori sul tal quale · prezzi e scorte correnti · clic per la scheda" flush
      actions={<><select className="select" style={{ width: 170 }} value={cat} onChange={e => setCat(e.target.value)} aria-label="Categoria"><option value="">Tutte le categorie</option>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><SearchBox value={q} onChange={setQ} placeholder="Cerca materia prima" id="mp-search" /></>}>
      <Table rows={rows} onRow={i => openDrawer('ingredient', i.id)} pageSize={40} cols={[
        { key: 'code', label: 'Codice', render: i => <span className="code">{i.code}</span> },
        { key: 'name', label: 'Materia prima', render: i => <><b>{i.name}</b><span className="sub">{CAT[i.category]}{i.coProduct ? ' · co-prodotto' : ''}{i.certified ? ' · ' + i.certified : ''}</span></> },
        { key: 'price', label: '€/t', align: 'r', render: i => nf(i.price) },
        { key: 'dm', label: 'SS %', align: 'r', render: i => nf(i.dm, 1) },
        { key: 'pg', label: 'PG %', align: 'r', sort: i => i.nutr?.PG, render: i => nf(i.nutr?.PG, 1) },
        { key: 'pgcost', label: '€ per punto PG', align: 'r', sort: i => i.nutr?.PG ? i.price / i.nutr.PG : null, render: i => i.nutr?.PG > 5 ? nf(i.price / i.nutr.PG, 1) : '—' },
        { key: 'ef', label: 'kg CO₂e/t', align: 'r', render: i => nf(i.ef) },
        { key: 'stock', label: 'Scorta t', align: 'r', render: i => nf(i.stock, 1) },
        { key: 'origin', label: 'Origine' },
      ]} />
    </Panel>
  );
}

/* ---------------- specifiche ---------------- */
function Specifiche({ d, id }) {
  const [sel, setSel] = useState(id || d.specs[0]?.id);
  const spec = d.specs.find(s => s.id === sel);
  const [addNut, setAddNut] = useState('');
  const upd = (patch, label) => store.update('specs', spec.id, patch, label);
  const setC = (i, patch) => upd(s => ({ ...s, constraints: s.constraints.map((c, k) => k === i ? { ...c, ...patch } : c) }), `Specifica ${spec.name}: vincolo modificato`);
  const used = d.formulas.filter(f => f.specId === spec?.id);
  return (
    <div className="split r">
      <Panel title="Specifiche" flush>
        <div className="picklist">{d.specs.map(s => <button key={s.id} aria-pressed={s.id === sel} onClick={() => setSel(s.id)}>
          <b>{s.name}</b><span>{SPECIES[s.species]?.name} · {s.constraints.length} vincoli · {s.kind}</span></button>)}</div>
      </Panel>
      {spec && <Panel title={spec.name} sub={`Usata da ${used.map(f => f.name).join(', ') || 'nessuna formula'} · le modifiche valgono dalla prossima ottimizzazione`}>
        <div className="tw"><table className="t">
          <thead><tr><th>Parametro</th><th className="r">Minimo</th><th className="r">Massimo</th><th>Base</th><th /></tr></thead>
          <tbody>{spec.constraints.map((c, i) => (
            <tr key={i}><td><b>{NUT[c.nut]?.name}</b> <span className="muted small">{NUT[c.nut]?.unit}</span></td>
              <td className="r" style={{ width: 120 }}><NumInput value={c.min} onChange={v => setC(i, { min: v })} decimals={NUT[c.nut]?.dec ?? 2} slim ariaLabel={`Minimo ${NUT[c.nut]?.name}`} /></td>
              <td className="r" style={{ width: 120 }}><NumInput value={c.max} onChange={v => setC(i, { max: v })} decimals={NUT[c.nut]?.dec ?? 2} slim ariaLabel={`Massimo ${NUT[c.nut]?.name}`} /></td>
              <td><select className="select" style={{ height: 28, width: 110 }} value={c.basis || 'tq'} onChange={e => setC(i, { basis: e.target.value })} aria-label="Base"><option value="tq">tal quale</option><option value="ss">sostanza secca</option></select></td>
              <td><button className="btn ghost small icon" title="Togli il vincolo" onClick={() => upd(s => ({ ...s, constraints: s.constraints.filter((_, k) => k !== i) }), `Specifica ${spec.name}: vincolo rimosso`)}><LuTrash2 /></button></td></tr>
          ))}</tbody>
        </table></div>
        <div className="row" style={{ marginTop: 12 }}>
          <select className="select" style={{ maxWidth: 280 }} value={addNut} onChange={e => setAddNut(e.target.value)} aria-label="Nuovo vincolo"><option value="">Aggiungi un vincolo…</option>{NUTRIENTS.filter(n => n.id !== 'AFB1' && !spec.constraints.some(c => c.nut === n.id)).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
          <Btn icon={LuPlus} disabled={!addNut} onClick={() => { upd(s => ({ ...s, constraints: [...s.constraints, { nut: addNut, min: null, max: null, basis: 'tq' }] }), `Specifica ${spec.name}: nuovo vincolo`); setAddNut(''); }}>Aggiungi</Btn>
        </div>
        <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Limiti delle materie prime (kg/t)</div>
        <div className="row gap-s">{Object.entries(spec.ingLimits || {}).map(([ing, l]) => <span key={ing} className="chip outline">{d.ingredients.find(i => i.id === ing)?.name}: {l.min != null ? `${l.min}–` : '≤ '}{l.max ?? '∞'}</span>)}</div>
      </Panel>}
    </div>
  );
}
