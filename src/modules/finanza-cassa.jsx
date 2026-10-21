/* FeedOS 17 · Finanza › Cassa a 13 settimane (pacchetto WP2): saldo previsto settimana per settimana, entrate e uscite
 * per categoria con il dettaglio delle voci, prima settimana sotto soglia evidenziata, saldo iniziale, linee di credito
 * e finanziamenti salvati nelle impostazioni (annullabili). Tutto stimato dal motore engine/cash.js. */
import React, { useMemo, useRef, useState } from 'react';
import { LuPlus, LuTrash2, LuChevronRight, LuChevronDown, LuLandmark, LuInfo } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { ctxOf } from '../core/derived.js';
import { nf, sum, dateIt, isoWeek } from '../core/util.js';
import { cashForecast, finOf, CASH_IN, CASH_OUT } from '../engine/cash.js';
import { Panel, Btn, Chip, Kpi, Field, Select, NumInput, Empty, useWidth } from '../ui/ui.jsx';
import { LineChart, Legend, niceTicks } from '../ui/charts.jsx';

const mila = (v, dd = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v / 1000, dd));
const eur = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v) + ' €');
const dm = s => dateIt(s, 'dm');
/** Flusso con segno in migliaia: «+508», «−126», «0» sotto i 500 €. */
const signed = v => (Math.abs(v) < 500 ? '0' : (v > 0 ? '+' : '−') + mila(Math.abs(v)));
const Est = () => <Chip kind="maize" title="Previsione del modello: incassi, pagamenti e costi stimati dai dati dell’archivio">stimato</Chip>;
const LINE_TYPES = ['fido di cassa', 'anticipo fatture', 'salvo buon fine', 'finanziamento a breve', 'altro'];

// raggruppamenti del grafico (colori di serie in ordine fisso, verificati per daltonismo e contrasto nei due temi)
const FLOW_IN = [
  { key: 'incassi', label: 'Incassi da clienti', color: 'var(--s1)', of: w => w.in.incassi },
  { key: 'previsti', label: 'Incassi dal piano', color: 'var(--s3)', of: w => w.in.previsti },
];
const FLOW_OUT = [
  { key: 'mp', label: 'Materie prime', color: 'var(--s2)', of: w => w.out.fornitori + w.out.ordini + w.out.pianificati },
  { key: 'pers', label: 'Personale e F24', color: 'var(--s7)', of: w => w.out.personale + w.out.f24 },
  { key: 'altri', label: 'Altri pagamenti', color: 'var(--s4)', of: w => w.out.energia + w.out.provvigioni + w.out.rate + w.out.iva + w.out.altri },
];

const setFin = (fn, label) => store.settings(st => ({ ...st, finance: fn({ ...(st.finance || {}) }) }), label);

export function Cassa({ d }) {
  const ctx = ctxOf(d), today = ctx.today;
  const F = useMemo(() => cashForecast(d, ctx), [d, ctx]);
  const fin = finOf(d);
  const lp = F.lowPoint, W = F.weeks;
  const firstBad = F.firstBelowZero;
  const weekLbl = w => (w.week === 0 && w.from !== w.to ? `${dm(w.from)}–${dm(w.to)}` : dm(w.from));
  const hasFlows = F.items.length > 0;
  return (
    <>
      {!F.balanceSet && <div className="note maize"><b>Saldo di cassa non impostato:</b> la previsione parte da zero a oggi. Indica saldo e data nel riquadro «Saldo, linee e finanziamenti» qui sotto.</div>}
      <div className="kpis">
        <Kpi label="Saldo iniziale" value={mila(F.opening)} unit="mila €" foot={F.balanceSet ? `al ${dateIt(F.start)}` : 'da impostare'} title="Saldo dei conti correnti alla data indicata (impostazioni)" />
        <Kpi label={<>Punto più basso <Est /></>} value={mila(lp.closing)} unit="mila €" status={lp.belowLines ? 'bad' : lp.belowZero ? 'warn' : 'ok'}
          foot={`settimana del ${dm(lp.from)}`} title="Saldo minimo di fine settimana nelle 13 settimane: sotto zero si usano le linee di credito" />
        <Kpi label="Margine sulle linee" value={mila(lp.headroom)} unit="mila €" status={lp.belowLines ? 'bad' : lp.headroom < F.lines * 0.25 ? 'warn' : 'ok'} foot={`linee per ${mila(F.lines)} mila`} title="Saldo minimo + linee di credito accordate: quanto resta prima di superare i fidi" />
        <Kpi label={<>Entrate 13 settimane <Est /></>} value={mila(F.totals.in)} unit="mila €" foot={`dal piano ${mila(sum(W, w => w.in.previsti))} mila`} />
        <Kpi label={<>Uscite 13 settimane <Est /></>} value={mila(F.totals.out)} unit="mila €" foot={`materie prime ${mila(sum(W, w => w.out.fornitori + w.out.ordini + w.out.pianificati))} mila`} />
        <Kpi label="Saldo finale" value={mila(F.totals.closing)} unit="mila €" foot={`al ${dm(F.end)} · Δ ${signed(F.totals.closing - F.opening)} mila`} />
      </div>
      {!hasFlows ? (
        <Panel><Empty icon={LuLandmark} title="Nessun movimento previsto">Senza consegne, fatture, ordini o costi fissi non ci sono incassi e pagamenti da prevedere: la cassa resta al saldo iniziale.</Empty></Panel>
      ) : <>
        <div className="split">
          <Panel title="Saldo di fine settimana" sub={`mila € · linea rossa: linee di credito esaurite (−${mila(F.lines)} mila)`} id="fin-cash-line">
            <LineChart labels={W.map(w => w.from)} formatX={dm} unit="mila €" decimals={0} height={240} area={false} ariaLabel="Saldo di cassa previsto a fine settimana"
              series={[{ key: 'c', label: 'Saldo previsto', color: 'var(--s1)', values: W.map(w => w.closing / 1000) }]}
              refs={[{ y: 0, label: 'zero' }, ...(F.lines > 0 ? [{ y: -F.lines / 1000, label: '− linee', kind: 'crit' }] : [])]} />
          </Panel>
          <Panel title="Entrate e uscite" sub="mila € per settimana: sopra le entrate, sotto le uscite, il trattino è il flusso netto">
            <FlowChart weeks={W} />
            <Legend items={[...FLOW_IN, ...FLOW_OUT].map(x => ({ label: x.label, color: x.color }))} />
          </Panel>
        </div>
        <WeekTable F={F} weekLbl={weekLbl} firstBad={firstBad} />
      </>}
      <div className="split">
        <CashInputs d={d} fin={fin} today={today} />
        <Panel title="Ipotesi del modello" sub="Come nasce ogni riga della previsione">
          <dl className="fin-hyp">
            {[...CASH_IN, ...CASH_OUT].map(c => <React.Fragment key={c.id}><dt>{c.label}</dt><dd>{c.hint}</dd></React.Fragment>)}
          </dl>
          {F.assumptions.map((a, i) => <p key={i} className="small muted">{a}</p>)}
          {Object.keys(F.beyond).length > 0 && <p className="small muted">Oltre il {dm(F.end)}: incassi già maturati per {eur((F.beyond.incassi || 0) + (F.beyond.previsti || 0))} e pagamenti per {eur(sum(Object.entries(F.beyond).filter(([k]) => k !== 'incassi' && k !== 'previsti'), ([, v]) => v))}.</p>}
        </Panel>
      </div>
    </>
  );
}

/* ---------------- grafico divergente delle entrate e uscite ---------------- */
function FlowChart({ weeks, height = 240 }) {
  const box = useRef(null);
  const W = useWidth(box);
  const [hover, setHover] = useState(null);
  const ins = weeks.map(w => FLOW_IN.map(c => c.of(w) / 1000)), outs = weeks.map(w => FLOW_OUT.map(c => c.of(w) / 1000));
  const maxIn = Math.max(1, ...ins.map(a => sum(a))), maxOut = Math.max(1, ...outs.map(a => sum(a)));
  const ticks = niceTicks(-maxOut, maxIn, 4), lo = ticks[0], hi = ticks[ticks.length - 1];
  const padL = Math.max(40, 8 + 7 * nf(Math.max(Math.abs(lo), hi)).length + 7), padR = 8, padT = 10, padB = 24;
  const n = weeks.length, slot = (W - padL - padR) / Math.max(1, n), bw = Math.max(6, Math.min(26, slot * 0.62));
  const y = v => padT + (hi - v) / (hi - lo || 1) * (height - padT - padB);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL) / 52))));
  const seg = (x, v0, v1, color, key, round) => {
    const a = y(v0), b = y(v1), top = Math.min(a, b), h = Math.max(0, Math.abs(b - a) - 2); // 2 px di stacco tra i segmenti
    if (h < 0.5) return null;
    const yy = v1 >= v0 ? top : top + 2;
    if (!round) return <rect key={key} x={x} y={yy} width={bw} height={h} fill={color} />;
    const r = Math.min(4, h, bw / 2);
    const d = v1 >= v0 ? `M${x} ${yy + h}V${yy + r}Q${x} ${yy} ${x + r} ${yy}H${x + bw - r}Q${x + bw} ${yy} ${x + bw} ${yy + r}V${yy + h}Z`
      : `M${x} ${yy}V${yy + h - r}Q${x} ${yy + h} ${x + r} ${yy + h}H${x + bw - r}Q${x + bw} ${yy + h} ${x + bw} ${yy + h - r}V${yy}Z`;
    return <path key={key} d={d} fill={color} />;
  };
  const tip = hover != null ? weeks[hover] : null;
  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Entrate e uscite previste per settimana" style={{ height }}>
        <g className="grid">{ticks.map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map(t => <text key={'t' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t)}</text>)}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
        {weeks.map((w, i) => {
          const cx = padL + slot * (i + 0.5), x = cx - bw / 2;
          let acc = 0; const up = [];
          ins[i].forEach((v, k) => { if (v > 0) { up.push(seg(x, acc, acc + v, FLOW_IN[k].color, 'i' + k, ins[i].slice(k + 1).every(z => !(z > 0)))); acc += v; } });
          let dn = 0; const down = [];
          outs[i].forEach((v, k) => { if (v > 0) { down.push(seg(x, -dn, -dn - v, FLOW_OUT[k].color, 'o' + k, outs[i].slice(k + 1).every(z => !(z > 0)))); dn += v; } });
          const net = sum(ins[i]) - sum(outs[i]);
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`Settimana del ${dm(w.from)}: entrate ${mila(w.inTot)} mila, uscite ${mila(w.outTot)} mila`}>
              <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} />
              <g opacity={hover == null || hover === i ? 1 : 0.55}>{up}{down}</g>
              <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(net)} y2={y(net)} stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
              {i % every === 0 && <text x={cx} y={height - 6} textAnchor="middle">{dm(w.from)}</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="tip" style={{ left: Math.min(Math.max(padL + slot * (hover + 0.5), 100), W - 100), top: padT }} role="status">
          <div className="muted xs">Settimana del {dm(tip.from)} – {dm(tip.to)}</div>
          {FLOW_IN.map(c => <div key={c.key} className="r"><span className="row gap-s"><i className="key" style={{ background: c.color }} /><span className="small">{c.label}</span></span><b>+{mila(c.of(tip))}</b></div>)}
          {FLOW_OUT.map(c => <div key={c.key} className="r"><span className="row gap-s"><i className="key" style={{ background: c.color }} /><span className="small">{c.label}</span></span><b>−{mila(c.of(tip))}</b></div>)}
          <div className="r"><span className="small">Flusso netto</span><b>{tip.net >= 0 ? '+' : '−'}{mila(Math.abs(tip.net))}</b></div>
          <div className="r"><span className="small">Saldo a fine settimana</span><b>{mila(tip.closing)}</b></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- tabella settimanale con categorie espandibili ---------------- */
function WeekTable({ F, weekLbl, firstBad }) {
  const [open, setOpen] = useState({});
  const W = F.weeks;
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }));
  // dettaglio: voci raggruppate per etichetta (cliente, fornitore, mese…), le 8 più grandi più «altre»
  const detail = useMemo(() => {
    const out = {};
    for (const it of F.items) {
      const m = (out[it.cat] ||= new Map());
      const r = m.get(it.label) || { label: it.label, weeks: new Array(W.length).fill(0), tot: 0, refs: new Set() };
      r.weeks[it.week] += it.amount; r.tot += it.amount; if (it.ref) r.refs.add(it.ref);
      m.set(it.label, r);
    }
    for (const k of Object.keys(out)) {
      const list = [...out[k].values()].sort((a, b) => b.tot - a.tot);
      if (list.length > 8) {
        const rest = list.slice(8), o = { label: `altre ${rest.length} voci`, weeks: new Array(W.length).fill(0), tot: 0, refs: new Set() };
        for (const r of rest) { r.weeks.forEach((v, i) => { o.weeks[i] += v; }); o.tot += r.tot; }
        out[k] = [...list.slice(0, 8), o];
      } else out[k] = list;
    }
    return out;
  }, [F.items, W.length]);
  const cell = (v, neg) => (Math.abs(v) < 0.5 ? <span className="muted">·</span> : (neg ? '−' : '') + mila(v));
  const groups = [['in', 'Entrate', CASH_IN], ['out', 'Uscite', CASH_OUT]];
  const cls = i => (i === firstBad ? 'wk below' : 'wk');
  return (
    <Panel title="Settimana per settimana" sub={`mila € · clic su una riga per il dettaglio${firstBad != null ? ` · in evidenza la prima settimana sotto zero (${weekLbl(W[firstBad])})` : ''}`} flush id="fin-cash-table">
      <div className="tw fin-cash-tw">
        <table className="t fin-cash">
          <thead><tr><th className="lbl">Voce</th>{W.map((w, i) => <th key={i} className={'r ' + cls(i)} title={`${dateIt(w.from)} – ${dateIt(w.to)}`}>sett. {isoWeek(w.from)}<span className="sub">{weekLbl(w)}</span></th>)}<th className="r">Totale</th></tr></thead>
          <tbody>
            <tr className="bal"><td className="lbl">Saldo iniziale</td>{W.map((w, i) => <td key={i} className={'r ' + cls(i)}>{mila(w.opening)}</td>)}<td className="r">{mila(F.opening)}</td></tr>
            {groups.map(([g, label, cats]) => (
              <React.Fragment key={g}>
                <tr className="grp" onClick={() => toggle(g)}>
                  <td className="lbl"><button className="linkish" aria-expanded={!!open[g]}>{open[g] ? <LuChevronDown /> : <LuChevronRight />}{label}</button></td>
                  {W.map((w, i) => <td key={i} className={'r ' + cls(i)}>{cell(g === 'in' ? w.inTot : w.outTot, g === 'out')}</td>)}
                  <td className="r">{cell(sum(W, w => (g === 'in' ? w.inTot : w.outTot)), g === 'out')}</td>
                </tr>
                {open[g] && cats.map(c => {
                  const tot = sum(W, w => w[g][c.id]);
                  if (Math.abs(tot) < 0.5 && !detail[c.id]) return null;
                  const k = g + c.id;
                  return (
                    <React.Fragment key={c.id}>
                      <tr className="cat" onClick={() => detail[c.id] && toggle(k)} title={c.hint}>
                        <td className="lbl"><button className="linkish" aria-expanded={!!open[k]} disabled={!detail[c.id]}>{detail[c.id] ? (open[k] ? <LuChevronDown /> : <LuChevronRight />) : <i className="ph-ic" />}{c.label}</button></td>
                        {W.map((w, i) => <td key={i} className={'r ' + cls(i)}>{cell(w[g][c.id], g === 'out')}</td>)}
                        <td className="r">{cell(tot, g === 'out')}</td>
                      </tr>
                      {open[k] && (detail[c.id] || []).map(r => (
                        <tr key={r.label} className="item">
                          <td className="lbl" title={[...r.refs].slice(0, 6).join(' · ')}>{r.label}</td>
                          {r.weeks.map((v, i) => <td key={i} className={'r ' + cls(i)}>{cell(v, g === 'out')}</td>)}
                          <td className="r">{cell(r.tot, g === 'out')}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
            <tr className="net"><td className="lbl">Flusso netto</td>{W.map((w, i) => <td key={i} className={'r ' + cls(i)}>{signed(w.net)}</td>)}<td className="r">{signed(F.totals.in - F.totals.out)}</td></tr>
            <tr className="bal end"><td className="lbl">Saldo finale</td>{W.map((w, i) => <td key={i} className={`r ${cls(i)} ${w.closing < -F.lines ? 'crit' : w.closing < 0 ? 'neg' : ''}`}>{mila(w.closing)}</td>)}<td className="r">{mila(F.totals.closing)}</td></tr>
            <tr className="head"><td className="lbl">Margine sulle linee</td>{W.map((w, i) => <td key={i} className={`r ${cls(i)} ${w.headroom < 0 ? 'crit' : ''}`}>{mila(w.headroom)}</td>)}<td /></tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------------- saldo, linee di credito, finanziamenti ---------------- */
/** Campo di testo che salva all'uscita o con Invio (un solo passo annullabile per modifica). */
function TextCommit({ value, onCommit, ariaLabel, placeholder }) {
  const [v, setV] = useState(value || '');
  const last = useRef(value);
  if (last.current !== value) { last.current = value; if (v !== (value || '')) setV(value || ''); }
  const commit = () => { const t = v.trim(); if (t !== (value || '')) onCommit(t); };
  return <input className="input slim" value={v} placeholder={placeholder} aria-label={ariaLabel} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function CashInputs({ d, fin, today }) {
  const cash = fin.cash || {};
  const lines = fin.creditLines || [], loans = fin.loans || [];
  const nid = (p, arr) => { let i = arr.length + 1; while (arr.some(x => x.id === p + i)) i++; return p + i; };
  const updLine = (i, patch, label) => setFin(f => ({ ...f, creditLines: (f.creditLines || []).map((l, k) => (k === i ? { ...l, ...patch } : l)) }), label);
  const updLoan = (i, patch, label) => setFin(f => ({ ...f, loans: (f.loans || []).map((l, k) => (k === i ? { ...l, ...patch } : l)) }), label);
  const undoToast = t => toast(t, 'ok', { label: 'Annulla', fn: () => store.undo() });
  return (
    <Panel title="Saldo, linee e finanziamenti" sub="Si salvano nell’archivio; ogni modifica si annulla con Ctrl+Z" id="fin-cash-inputs">
      <div className="form">
        <Field label="Saldo dei conti €" hint="somma dei conti correnti"><NumInput value={cash.balance ?? null} decimals={0} step={10000} ariaLabel="Saldo di cassa"
          onChange={v => setFin(f => ({ ...f, cash: { date: f.cash?.date || today, balance: v ?? 0 } }), `Saldo di cassa: ${eur(v ?? 0)}`)} /></Field>
        <Field label="Alla data" hint="la previsione parte da qui"><input type="date" className="input" value={cash.date || ''} aria-label="Data del saldo"
          onChange={e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setFin(f => ({ ...f, cash: { balance: f.cash?.balance ?? 0, date: e.target.value } }), `Data del saldo di cassa: ${dateIt(e.target.value)}`)} /></Field>
      </div>
      <div className="eyebrow fin-sub">Linee di credito · {eur(sum(lines, l => +l.limit || 0))}</div>
      {lines.length ? (
        <div className="fin-rows">
          {lines.map((l, i) => (
            <div key={l.id || i} className="fin-row">
              <TextCommit value={l.bank} ariaLabel="Banca" placeholder="Banca" onCommit={v => updLine(i, { bank: v }, `Linea di credito: banca ${v}`)} />
              <Select className="slim" value={l.type || 'altro'} onChange={v => updLine(i, { type: v }, `Linea di credito ${l.bank || ''}: ${v}`)} options={LINE_TYPES} ariaLabel="Tipo di linea" />
              <NumInput slim value={l.limit ?? null} decimals={0} min={0} step={50000} ariaLabel="Fido accordato" onChange={v => updLine(i, { limit: v ?? 0 }, `Linea di credito ${l.bank || ''}: ${eur(v ?? 0)}`)} />
              <Btn small kind="ghost" icon={LuTrash2} title={`Elimina la linea ${l.bank || ''}`} onClick={() => { setFin(f => ({ ...f, creditLines: (f.creditLines || []).filter((_, k) => k !== i) }), `Linea di credito eliminata: ${l.bank || ''}`); undoToast('Linea di credito eliminata'); }} />
            </div>
          ))}
        </div>
      ) : <p className="small muted">Nessuna linea: sotto zero la cassa supera subito i fidi.</p>}
      <Btn small icon={LuPlus} onClick={() => { setFin(f => ({ ...f, creditLines: [...(f.creditLines || []), { id: nid('cl-', f.creditLines || []), bank: 'Nuova banca', type: 'fido di cassa', limit: 100000 }] }), 'Linea di credito aggiunta'); undoToast('Linea di credito aggiunta'); }}>Aggiungi linea</Btn>
      <div className="eyebrow fin-sub">Finanziamenti · rate mensili {eur(sum(loans, l => +l.instalment || 0))}</div>
      {loans.length ? (
        <div className="fin-rows">
          {loans.map((l, i) => (
            <div key={l.id || i} className="fin-row loan">
              <TextCommit value={l.name} ariaLabel="Finanziamento" placeholder="Nome" onCommit={v => updLoan(i, { name: v }, `Finanziamento: ${v}`)} />
              <NumInput slim value={l.instalment ?? null} decimals={0} min={0} step={500} ariaLabel="Rata mensile €" onChange={v => updLoan(i, { instalment: v ?? 0 }, `Rata di ${l.name || 'finanziamento'}: ${eur(v ?? 0)}`)} />
              <label className="fin-day"><span className="small muted">giorno</span><NumInput slim value={l.day ?? 1} decimals={0} min={1} max={31} ariaLabel="Giorno del mese" onChange={v => updLoan(i, { day: v ?? 1 }, `Giorno della rata di ${l.name || 'finanziamento'}: ${v ?? 1}`)} /></label>
              <Btn small kind="ghost" icon={LuTrash2} title={`Elimina ${l.name || 'il finanziamento'}`} onClick={() => { setFin(f => ({ ...f, loans: (f.loans || []).filter((_, k) => k !== i) }), `Finanziamento eliminato: ${l.name || ''}`); undoToast('Finanziamento eliminato'); }} />
            </div>
          ))}
        </div>
      ) : <p className="small muted">Nessun finanziamento.</p>}
      <Btn small icon={LuPlus} onClick={() => { setFin(f => ({ ...f, loans: [...(f.loans || []), { id: nid('ln-', f.loans || []), name: 'Nuovo finanziamento', instalment: 5000, day: 30 }] }), 'Finanziamento aggiunto'); undoToast('Finanziamento aggiunto'); }}>Aggiungi finanziamento</Btn>
    </Panel>
  );
}
