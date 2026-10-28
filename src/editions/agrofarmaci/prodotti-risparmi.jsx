/* DifesaOS · Prodotti › Costi e concorrenza: dal listino al margine pieno, costo del trattamento a ettaro contro i concorrenti,
 * leve di risparmio (misurate sui dati o stimate con ipotesi modificabili) e scelta fra più margine e prezzo più basso.
 * I calcoli stanno in engine/agro-risparmi.js; qui la presentazione, le rilevazioni dei prezzi e il piano di risparmio. */
import React, { useMemo, useState } from 'react';
import { LuPiggyBank, LuPlus, LuTrash2, LuRotateCcw, LuListChecks, LuTags } from 'react-icons/lu';
import { store, toast } from '../../core/store.js';
import { go } from '../../core/router.js';
import { nf, eur, dateIt, sum, uid, addDays } from '../../core/util.js';
import { Panel, Kpi, Table, Chip, Seg, Btn, Select, Field, NumInput, Empty } from '../../ui/ui.jsx';
import { Bars, Waterfall } from '../../ui/charts.jsx';
import {
  unitEconomics, savingsLevers, competitorBoard, priceStrategy, savingsPortfolio, savingsSettings, perUnit, SAVINGS_DEFAULTS, SAVINGS_LABELS, LEVER_AREA,
} from '../../engine/agro-risparmi.js';

const uOf = p => (p?.uom === 'L' ? 'L' : 'kg');
const gapChip = g => (g == null ? '—' : <Chip kind={g > 0.05 ? 'warn' : g < -0.05 ? 'good' : 'outline'}>{g > 0 ? '+' : '−'}{nf(Math.abs(g) * 100)}% {g > 0.05 ? 'più caro' : g < -0.05 ? 'più conveniente' : 'in linea'}</Chip>);
const sgn = v => `${v >= 0 ? '+' : '−'}${nf(Math.abs(v) * 100, 1)}%`;

export function Risparmi({ d, ctx, P, route, today }) {
  const savedS = d.settings?.agro?.savings;
  const S = useMemo(() => savingsSettings(d), [savedS]); // eslint-disable-line react-hooks/exhaustive-deps
  const port = useMemo(() => savingsPortfolio(d, ctx, P, S), [d, ctx, P.from, P.to, S]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = port.find(r => r.id === route.id) || port[0];
  if (!port.length) return <Empty icon={LuPiggyBank} title="Nessun prodotto con prezzo o vendite">Servono il listino o le consegne degli ultimi 12 mesi, e per i costi la ricetta dei prodotti.</Empty>;
  const sold = port.filter(r => !r.std && r.marginPct != null);
  const rev = sum(sold, r => r.revenue);
  const comp = port.filter(r => r.gap != null);
  const obs = (d.competitorPrices || []).filter(o => o.date >= P.from && o.date <= P.to).length;
  return (
    <>
      <div className="kpis">
        <Kpi label="Risparmio potenziale" value={nf(sum(port, r => r.saveYear) / 1000)} unit="mila € l’anno" foot={`di cui ${nf(sum(port, r => r.dataYear) / 1000)} mila misurati sui dati`} />
        <Kpi label="Margine pieno medio" value={rev ? nf(sum(sold, r => r.marginPct * r.revenue) / rev * 100, 1) : '—'} unit={rev ? '%' : ''} foot="sul prezzo netto, ultimi 12 mesi" />
        <Kpi label="Più cari a ettaro dei concorrenti" value={comp.length ? `${nf(comp.filter(r => r.gap > 0.05).length)}/${nf(comp.length)}` : '—'} foot="prodotti con prezzi rilevati" status={comp.some(r => r.gap > 0.15) ? 'warn' : comp.length ? 'ok' : null} />
        <Kpi label="Prezzi della concorrenza" value={nf(obs)} foot="rilevazioni negli ultimi 12 mesi" />
      </div>
      <Panel title="Prodotti" sub="Clic su un prodotto per la cascata del prezzo, il confronto a ettaro e le leve di risparmio" id="ris-portafoglio" flush>
        <Table rows={port} selected={sel?.id} onRow={r => go('prodotti', 'risparmi', r.id)} initialSort={{ key: 'saveYear', dir: 'desc' }} pageSize={12} exportName="risparmi-prodotti" cols={[
          { key: 'name', label: 'Prodotto', render: r => <span><b>{r.name}</b> <span className="muted small">{r.code}</span></span> },
          { key: 't', label: 't 12 mesi', align: 'r', render: r => (r.std ? '—' : nf(r.t)) },
          { key: 'net', label: 'Prezzo netto', align: 'r', render: r => `${nf(perUnit(r.net, r.p), 2)} €/${uOf(r.p)}`, csv: r => perUnit(r.net, r.p) },
          { key: 'full', label: 'Costo pieno', align: 'r', render: r => (r.full == null ? '—' : `${nf(perUnit(r.full, r.p), 2)} €/${uOf(r.p)}`), csv: r => perUnit(r.full, r.p) },
          { key: 'marginPct', label: 'Margine', align: 'r', render: r => (r.marginPct == null ? '—' : `${nf(r.marginPct * 100, 1)}%`) },
          { key: 'saveT', label: 'Risparmio', align: 'r', render: r => (r.saveT ? <span>{nf(perUnit(r.saveT, r.p), 3)} €/{uOf(r.p)}<div className="muted small">{r.savePct != null ? `${nf(r.savePct * 100, 1)}% del costo` : ''}</div></span> : '—'), csv: r => perUnit(r.saveT, r.p) },
          { key: 'saveYear', label: 'Risparmio annuo', align: 'r', render: r => eur(r.saveYear) },
          { key: 'gap', label: 'A ettaro', render: r => gapChip(r.gap), csv: r => r.gap },
        ]} />
      </Panel>
      {sel && <ProductSavings key={sel.id} d={d} ctx={ctx} P={P} S={S} p={sel.p} today={today} />}
      <Assumptions d={d} S={S} />
    </>
  );
}

function ProductSavings({ d, ctx, P, S, p, today }) {
  const econ = useMemo(() => unitEconomics(d, ctx, p.id, P), [d, ctx, p.id, P.from, P.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = useMemo(() => savingsLevers(d, ctx, p.id, P, S), [d, ctx, p.id, P.from, P.to, S]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => competitorBoard(d, ctx, p.id, P, S), [d, ctx, p.id, P.from, P.to, S]); // eslint-disable-line react-hooks/exhaustive-deps
  const [off, setOff] = useState({});
  const [pass, setPass] = useState(50);
  const u = uOf(p), U = v => perUnit(v, p);
  const chosen = L.filter(x => !off[x.id]);
  const saveT = sum(chosen, x => x.perT);
  const st = priceStrategy(econ, saveT, pass / 100, B);
  const ha = (B?.groups || []).filter(g => g.eurHa != null);
  const ourHa = ha.find(g => g.ourEurHa != null)?.ourEurHa;
  const plan = () => {
    const open = new Set((d.tasks || []).filter(t => t.status !== 'fatto').map(t => t.title));
    const ops = chosen.map(x => ({ kind: 'add', coll: 'tasks', obj: {
      id: uid('t'), title: `${p.name}: ${x.label}`, detail: `${x.how} Valore stimato ${eur(x.year)} l’anno (${x.basis === 'dati' ? 'misurato sui dati' : 'stima con ipotesi'}). ${x.detail}${x.regulatory ? ` ${x.regulatory}` : ''}`,
      area: 'prodotti', owner: x.owner, due: addDays(today, 30), status: 'aperto', priority: x.year >= 20000 ? 'alta' : 'media', source: 'risparmi', createdAt: today, link: { area: 'prodotti', tab: 'risparmi', id: p.id },
    } })).filter(o => !open.has(o.obj.title));
    if (!ops.length) { toast('Le attività di queste leve ci sono già', 'ok'); return; }
    store.batch(ops, `Piano di risparmio: ${p.name}`);
    toast(`${nf(ops.length)} attività create in «Oggi › Attività»`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <>
      <div className="split">
        <Panel title={`Dal listino al margine · ${p.name}`} sub={econ.std ? 'Senza vendite negli ultimi 12 mesi: listino e costo pieno di oggi' : `Media delle consegne degli ultimi 12 mesi (${nf(econ.t)} t), € per ${u}`} id="ris-cascata">
          {econ.perT.full == null ? <Empty title="Costo non disponibile">Senza ricetta il costo pieno non si calcola: si inserisce in Produzione e acquisti, o come costo standard del prodotto.</Empty>
            : <Waterfall steps={econ.steps.map(s => ({ ...s, value: U(s.value) }))} unit={`€/${u}`} decimals={3} labelDec={2} ariaLabel={`Cascata del prezzo di ${p.name}`} />}
        </Panel>
        <Panel title="Costo del trattamento a ettaro" sub="Prezzo × dose di etichetta, al prezzo della rivendita (quelli all’agricoltore tolto il ricarico)" id="ris-ettaro">
          {ha.length ? (
            <>
              <Bars data={[...(ourHa != null ? [{ key: 'noi', label: `${p.name} (noi)`, value: ourHa, color: 'var(--s3)' }] : []), ...ha.map(g => ({ key: g.key, label: `${g.product || g.competitor}${g.cropName ? ` · ${g.cropName}` : ''}`, value: g.eurHa, color: 'var(--s1)' }))]}
                unit="€/ha" decimals={2} ariaLabel="Costo a ettaro contro i concorrenti" labelW={250} />
              <p className="small">{B.gap > 0 ? `A ettaro costiamo il ${nf(B.gap * 100)}% in più della mediana dei concorrenti` : `A ettaro costiamo il ${nf(-B.gap * 100)}% in meno della mediana dei concorrenti`}: il prezzo di parità è <b>{nf(B.parity, 2)} € per {u}</b> contro {nf(B.ourPrice, 2)} netti.
                {ha.some(g => g.gapKg != null && Math.sign(g.gapKg) !== Math.sign(g.gap ?? 0)) && ' Attenzione al confronto al kg: con dosi diverse il prezzo al kg porta fuori strada.'}</p>
            </>
          ) : <Empty title="Nessun prezzo della concorrenza a ettaro">Una rilevazione con la dose di etichetta del concorrente (qui sotto, «Prezzi della concorrenza») permette il confronto a ettaro.</Empty>}
        </Panel>
      </div>
      <Panel title="Leve di risparmio" sub={`Scegli le leve del piano: «dati» viene dagli ultimi 12 mesi, «stima» dalle ipotesi in fondo alla pagina · € per ${u}`} id="ris-leve" flush>
        <Table rows={L} pageSize={20} empty="Nessuna leva trovata con i dati disponibili" cols={[
          { key: 'on', label: '', nosort: true, csv: false, render: x => <input type="checkbox" checked={!off[x.id]} onChange={e => setOff(o => ({ ...o, [x.id]: !e.target.checked }))} aria-label={`Includi ${x.label}`} onClick={e => e.stopPropagation()} /> },
          { key: 'label', label: 'Leva', render: x => <span><b>{x.label}</b><div className="small muted">{x.detail}</div><div className="small">{x.how}</div>{x.regulatory && <div className="small muted">{x.regulatory}</div>}</span> },
          { key: 'area', label: 'Area', render: x => LEVER_AREA[x.area] || x.area },
          { key: 'basis', label: 'Base', render: x => <Chip kind={x.basis === 'dati' ? 'good' : 'outline'}>{x.basis}</Chip> },
          { key: 'perT', label: `€/${u}`, align: 'r', render: x => nf(U(x.perT), 3), csv: x => U(x.perT) },
          { key: 'year', label: '€ l’anno', align: 'r', render: x => eur(x.year) },
        ]} />
      </Panel>
      {st && (
        <Panel title="Più margine o prezzo più basso?" sub={`Risparmio scelto: ${nf(U(saveT), 3)} € per ${u}, ${eur(sum(chosen, x => x.year))} l’anno. Premi, provvigioni e dilazione seguono il prezzo.`} id="ris-strategia"
          actions={<Btn small kind="primary" icon={LuListChecks} disabled={!chosen.length} onClick={plan}>Crea le attività del piano</Btn>}>
          <div className="pr-pass">
            <label htmlFor="ris-pass" className="small">Quota del risparmio passata al prezzo: <b>{nf(pass)}%</b></label>
            <input id="ris-pass" type="range" min="0" max="100" step="10" value={pass} onChange={e => setPass(+e.target.value)} />
            <span className="small muted">0% = tutto margine · 100% = tutto prezzo</span>
          </div>
          <div className="kpis">
            <Kpi label="Prezzo netto" value={nf(U(st.newPrice), 2)} unit={`€/${u}`} foot={`${sgn(st.priceChange)} da ${nf(U(st.price), 2)}`} />
            <Kpi label="Margine pieno" value={nf(st.newMarginPct * 100, 1)} unit="%" foot={`da ${nf(st.marginPct * 100, 1)}%`} status={st.newMarginPct >= st.marginPct ? 'ok' : 'warn'} />
            <Kpi label="A ettaro contro i concorrenti" value={B?.gap == null ? '—' : sgn((1 + B.gap) * (1 + st.priceChange) - 1)} foot={B?.gap == null ? 'nessun prezzo a ettaro' : `oggi ${sgn(B.gap)}`} />
            <Kpi label="Prezzo di parità a ettaro" value={st.parity ? nf(U(st.parity.price), 2) : '—'} unit={st.parity ? `€/${u}` : ''} foot={st.parity ? `margine ${nf(st.parity.marginPct * 100, 1)}%, ${nf(st.parity.marginPctAfter * 100, 1)}% con i risparmi` : ''} status={st.parity ? (st.parity.marginPctAfter >= (+p.minMarginPct || 0) / 100 ? 'ok' : 'bad') : null} />
          </div>
          <p className="small">{strategyText(p, st, B, pass)}</p>
        </Panel>
      )}
      <Rivals d={d} p={p} B={B} today={today} />
    </>
  );
}

/** Lettura della strategia in una frase. */
function strategyText(p, st, B, pass) {
  const u = uOf(p), U = v => perUnit(v, p);
  const parts = [];
  if (pass === 0) parts.push(`Tenendo il prezzo, il margine pieno sale dal ${nf(st.marginPct * 100, 1)}% al ${nf(st.newMarginPct * 100, 1)}%.`);
  else parts.push(`Passando al prezzo il ${nf(pass)}% del risparmio, il prezzo netto scende a ${nf(U(st.newPrice), 2)} € per ${u} (${sgn(st.priceChange)}) e il margine pieno passa dal ${nf(st.marginPct * 100, 1)}% al ${nf(st.newMarginPct * 100, 1)}%.`);
  if (st.parity && B?.gap != null) {
    if (B.gap > 0) parts.push(st.parity.marginPctAfter >= (+p.minMarginPct || 0) / 100
      ? `Per pareggiare il concorrente a ettaro serve ${nf(U(st.parity.price), 2)} € per ${u} (${sgn(st.parity.change)}): con i risparmi il margine resterebbe al ${nf(st.parity.marginPctAfter * 100, 1)}%, sopra il minimo del ${nf(+p.minMarginPct || 0)}%.`
      : `Pareggiare il concorrente a ettaro (${nf(U(st.parity.price), 2)} € per ${u}) porterebbe il margine al ${nf(st.parity.marginPctAfter * 100, 1)}% anche con i risparmi, sotto il minimo del ${nf(+p.minMarginPct || 0)}%: meglio difendere il prezzo con le prove di campo e il servizio.`);
    else parts.push(`A ettaro siamo già più convenienti del ${nf(-B.gap * 100)}%: c’è spazio di prezzo fino a ${nf(U(st.parity.price), 2)} € per ${u} prima di arrivare alla parità.`);
  }
  return parts.join(' ');
}

/* ---------------- prezzi della concorrenza ---------------- */
function Rivals({ d, p, B, today }) {
  const [adding, setAdding] = useState(false);
  const rows = B?.rows || [];
  const del = r => { store.remove('competitorPrices', r.id, 'Rilevazione di prezzo eliminata'); toast('Rilevazione eliminata', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  return (
    <Panel title={`Prezzi della concorrenza · ${p.name}`} sub="Rilevazioni degli agenti e offerte perse sul prezzo, ultimi 12 mesi" id="ris-concorrenza" flush
      actions={<Btn small icon={adding ? LuRotateCcw : LuPlus} onClick={() => setAdding(x => !x)}>{adding ? 'Chiudi il modulo' : 'Nuova rilevazione'}</Btn>}>
      {adding && <RivalForm d={d} p={p} today={today} onDone={() => setAdding(false)} />}
      <Table rows={rows} pageSize={10} exportName={`prezzi-concorrenza-${p.code}`} empty="Nessuna rilevazione negli ultimi 12 mesi" cols={[
        { key: 'date', label: 'Data', render: r => dateIt(r.date) },
        { key: 'competitor', label: 'Concorrente', render: r => <span>{r.competitor}{r.competitorProduct ? <div className="muted small">{r.competitorProduct}</div> : null}</span> },
        { key: 'crop', label: 'Coltura', render: r => r.cropName || r.crop || '—' },
        { key: 'price', label: 'Prezzo', align: 'r', render: r => `${nf(r.price, 2)} €/${r.unit || uOf(p)}${r.level === 'agricoltore' ? ' all’agricoltore' : ''}` },
        { key: 'comparable', label: 'Alla rivendita', align: 'r', render: r => nf(r.comparable, 2) },
        { key: 'doseHa', label: 'Dose/ha', align: 'r', render: r => (r.doseHa == null ? '—' : nf(r.doseHa, 3)) },
        { key: 'eurHa', label: '€/ha', align: 'r', sort: r => (r.doseHa == null ? null : r.comparable * r.doseHa), render: r => (r.doseHa == null ? '—' : nf(r.comparable * r.doseHa, 2)), csv: r => (r.doseHa == null ? null : r.comparable * r.doseHa) },
        { key: 'source', label: 'Fonte' },
        { key: 'x', label: '', nosort: true, csv: false, render: r => (String(r.id).startsWith('of:') ? <Chip kind="outline">offerta</Chip> : <Btn small kind="ghost" icon={LuTrash2} title="Elimina" onClick={e => { e.stopPropagation(); del(r); }} />) },
      ]} />
    </Panel>
  );
}

function RivalForm({ d, p, today, onDone }) {
  const regs = new Set((d.registrations || []).filter(r => r.productId === p.id).map(r => r.id));
  const crops = [...new Map((d.regUses || []).filter(x => regs.has(x.registrationId)).map(x => [x.crop, x.cropName])).entries()].map(([id, label]) => ({ id, label }));
  const names = [...new Set((d.competitorPrices || []).map(x => x.competitor).filter(Boolean))];
  const [f, setF] = useState({ date: today, crop: crops[0]?.id || '', competitor: '', competitorProduct: '', price: null, unit: uOf(p), level: 'rivendita', dose: null, doseUnit: p.uom === 'L' ? 'L/ha' : 'kg/ha', source: 'visita al rivenditore', note: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const ok = f.date && f.competitor.trim() && f.price > 0;
  const save = () => {
    store.add('competitorPrices', { id: uid('cp'), productId: p.id, ...f, competitor: f.competitor.trim(), competitorProduct: f.competitorProduct.trim(), source: f.source.trim(), note: f.note.trim() }, `Prezzo della concorrenza: ${f.competitor.trim()}`);
    toast('Rilevazione salvata', 'ok', { label: 'Annulla', fn: () => store.undo() });
    onDone();
  };
  return (
    <div className="pr-form">
      <div className="pr-form-grid">
        <Field label="Data"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Coltura del confronto">{crops.length ? <Select value={f.crop} onChange={v => set('crop', v)} options={crops} /> : <input className="input" value={f.crop} onChange={e => set('crop', e.target.value)} />}</Field>
        <Field label="Concorrente"><input className="input" list="pr-rivals" value={f.competitor} onChange={e => set('competitor', e.target.value)} /><datalist id="pr-rivals">{names.map(n => <option key={n} value={n} />)}</datalist></Field>
        <Field label="Prodotto del concorrente"><input className="input" value={f.competitorProduct} onChange={e => set('competitorProduct', e.target.value)} placeholder="Sostanza e formulazione" /></Field>
        <Field label="Prezzo"><div className="row gap-s"><NumInput value={f.price} onChange={v => set('price', v)} decimals={2} /><Select value={f.unit} onChange={v => set('unit', v)} options={[{ id: 'kg', label: '€/kg' }, { id: 'L', label: '€/L' }]} /></div></Field>
        <Field label="Livello del prezzo"><Seg options={[{ id: 'rivendita', label: 'Alla rivendita' }, { id: 'agricoltore', label: 'All’agricoltore' }]} value={f.level} onChange={v => set('level', v)} label="Livello del prezzo" /></Field>
        <Field label="Dose di etichetta del concorrente" hint="Serve per il confronto a ettaro"><div className="row gap-s"><NumInput value={f.dose} onChange={v => set('dose', v)} decimals={3} /><Select value={f.doseUnit} onChange={v => set('doseUnit', v)} options={['kg/ha', 'L/ha', 'g/ha', 'ml/ha'].map(x => ({ id: x, label: x }))} /></div></Field>
        <Field label="Fonte"><input className="input" value={f.source} onChange={e => set('source', e.target.value)} /></Field>
      </div>
      <div className="row gap-s" style={{ justifyContent: 'flex-end' }}><Btn small onClick={onDone}>Annulla</Btn><Btn small kind="primary" icon={LuTags} disabled={!ok} onClick={save}>Salva la rilevazione</Btn></div>
    </div>
  );
}

/* ---------------- ipotesi delle leve stimate ---------------- */
function Assumptions({ d, S }) {
  const saved = d.settings?.agro?.savings || {};
  const set = (k, v) => store.settings(s => ({ ...s, agro: { ...(s.agro || {}), savings: { ...(s.agro?.savings || {}), [k]: v } } }), 'Ipotesi di risparmio modificata');
  const reset = () => { store.settings(s => ({ ...s, agro: { ...(s.agro || {}), savings: {} } }), 'Ipotesi di risparmio ai valori di partenza'); toast('Ipotesi riportate ai valori di partenza', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  return (
    <Panel title="Ipotesi delle leve stimate" sub="Valgono per tutti i prodotti; le leve «dati» non dipendono da queste ipotesi" id="ris-ipotesi"
      actions={Object.keys(saved).length ? <Btn small kind="ghost" icon={LuRotateCcw} onClick={reset}>Valori di partenza</Btn> : null}>
      <div className="pr-form-grid">
        {Object.entries(SAVINGS_LABELS).map(([k, [label, unit]]) => (
          <Field key={k} label={`${label} (${unit})`} hint={saved[k] != null && saved[k] !== SAVINGS_DEFAULTS[k] ? `di partenza ${nf(SAVINGS_DEFAULTS[k], 1)}` : ''}>
            <NumInput value={S[k]} onChange={v => { if (v != null && v >= 0) set(k, v); }} decimals={k === 'smallDropT' ? 2 : 1} min={0} ariaLabel={label} />
          </Field>
        ))}
      </div>
    </Panel>
  );
}
