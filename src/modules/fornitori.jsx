/* FeedOS 17 · Fornitori qualificati (pacchetto WP5): classifica con punteggio (puntualità, qualità, prezzo, documenti),
 * mappa del valore (prezzo rispetto ai colleghi contro qualità), certificati in scadenza e scheda del fornitore con
 * andamento di OTIF e premio, lotti, ordini, reclami collegati e modifica di qualifica, condizioni e certificati.
 * Contratto della fondazione: la scheda laterale SupplierD({d, id}), aperta con openDrawer('supplier', id); dopo i lotti
 * mostra le sezioni dei pacchetti di slots.jsx (SUPPLIER_SECTIONS, fondazione 18), ciascuna isolata dagli errori. */
import React, { useMemo, useRef, useState } from 'react';
import { LuTruck, LuPlus, LuSave } from 'react-icons/lu';
import { store, toast, openDrawer } from '../core/store.js';
import { ctxOf, appToday } from '../core/derived.js';
import { nf, sf, dateIt, addDays, daysBetween, relDays, sum, byId, monthLabel, slug } from '../core/util.js';
import { usePeriod } from '../ui/period.jsx';
import { scorecard, supplierOf, supplierTrend, docsScore, APPROVAL } from '../engine/suppliers.js';
import { Panel, Kpi, Table, Chip, Btn, Field, Select, NumInput, Empty, Drawer, Kv, SearchBox, filterRows, useWidth } from '../ui/ui.jsx';
import { LineChart, Legend } from '../ui/charts.jsx';
import { Def, eurTxt } from './direzione-conto.jsx';
import { SUPPLIER_SECTIONS, SlotGuard } from './slots.jsx';

const pc = (v, k = 0) => (v == null || !Number.isFinite(v) ? '—' : `${nf(v * 100, k)}%`);
const spc = (v, k = 1) => (v == null || !Number.isFinite(v) ? '—' : `${sf(v * 100, k)}%`);
const CLS_KIND = { A: 'good', B: 'warn', C: 'crit' };
const clsChip = r => (r.cls ? <Chip kind={CLS_KIND[r.cls]}>{nf(r.score)} · {r.cls}</Chip> : '—');

export function Fornitori({ d, sel }) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const today = appToday(d);
  const [q, setQ] = useState('');
  const rows = useMemo(() => scorecard(d, ctx, per.P), [d, ctx, per.P]);
  const ing = byId(d.ingredients || []);
  if (!rows.length) return <Panel title="Fornitori"><Empty icon={LuTruck} title="Nessun arrivo nel periodo">Il punteggio dei fornitori nasce dagli ordini ricevuti e dai lotti accettati o respinti: registra gli arrivi o scegli un periodo più lungo.</Empty></Panel>;
  const spend = sum(rows, r => r.spend);
  const withPos = rows.filter(r => r.otif != null && r.pos);
  const otif = withPos.length ? sum(withPos, r => r.otif * r.pos) / sum(withPos, r => r.pos) : null;
  const prem = rows.filter(r => r.premiumMedian != null);
  const certs = (d.suppliers || []).flatMap(s => (s.cert || []).map(c => ({ ...c, s, id: s.id + c.type }))).filter(c => c.expiry && c.expiry <= addDays(today, 90)).sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
  const notOk = (d.suppliers || []).filter(s => s.approval && s.approval !== 'qualificato');
  const view = filterRows(rows, q, ['name', r => r.ingIds.map(i => ing[i]?.name).join(' ')]);
  return (
    <>
      <div className="kpis">
        <Kpi label="Fornitori con arrivi" value={nf(rows.length)} foot={`${eurTxt(spend)} di materie prime nel periodo`} />
        <Kpi label={<Def text="On time in full: consegne arrivate entro un giorno dalla data promessa e con una quantità entro il 2% dell’ordinato, pesate sul numero di ordini.">Consegne puntuali e complete</Def>}
          value={pc(otif)} status={otif == null ? undefined : otif >= 0.95 ? 'ok' : otif >= 0.85 ? 'warn' : 'bad'} target="95%" />
        <Kpi label={<Def text="Prezzo del lotto ÷ quotazione di mercato della stessa settimana − 1, mediana dei fornitori delle materie prime quotate.">Premio mediano sul mercato</Def>}
          value={prem.length ? spc(sum(prem, r => r.premiumMedian * r.spend) / sum(prem, r => r.spend)) : '—'} foot="ponderato sulla spesa" />
        <Kpi label="Certificati in scadenza" value={nf(certs.filter(c => c.expiry <= addDays(today, 30)).length)} status={certs.some(c => c.expiry < today) ? 'bad' : certs.some(c => c.expiry <= addDays(today, 30)) ? 'warn' : 'ok'} foot="entro 30 giorni" />
        <Kpi label="Da riqualificare" value={nf(notOk.length)} status={notOk.some(s => s.approval === 'sospeso') ? 'bad' : notOk.length ? 'warn' : 'ok'} foot={notOk.length ? notOk.map(s => s.name.replace(/ \((demo|fantasia)\)/, '')).slice(0, 2).join(', ') : 'tutti qualificati'} />
      </div>

      <div className="split">
        <Panel title="Mappa del valore" sub="Prezzo pagato rispetto agli altri fornitori della stessa materia prima nello stesso mese, contro la qualità dei lotti · cerchio = spesa">
          <ValueMap rows={rows} sel={sel} />
        </Panel>
        <Panel title="Certificati e audit" sub="In scadenza nei prossimi 90 giorni">
          {certs.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {certs.map(c => (
                <button key={c.id} className="dlink" onClick={() => openDrawer('supplier', c.s.id)}>
                  <span className="code">{c.type}</span><span>{c.s.name} · {dateIt(c.expiry)}</span>
                  <Chip kind={c.expiry < today ? 'crit' : c.expiry <= addDays(today, 30) ? 'warn' : ''}>{c.expiry < today ? 'scaduto' : relDays(c.expiry, today)}</Chip>
                </button>
              ))}
            </div>
          ) : <p className="small muted">Nessun certificato in scadenza.</p>}
          {notOk.length > 0 && <div className="note warn" style={{ marginTop: 12 }}>{notOk.map(s => <div key={s.id}><b>{s.name}</b>: {APPROVAL[s.approval]?.label.toLowerCase()}{s.note ? ` — ${s.note}` : ''}</div>)}</div>}
        </Panel>
      </div>

      <Panel title="Classifica dei fornitori" sub="Punteggio 0–100: 35 puntualità, 30 qualità (respinti, proteina, umidità, aflatossina, reclami), 25 prezzo rispetto ai colleghi, 10 documenti · clic per la scheda" flush id="sup-rank"
        actions={<SearchBox value={q} onChange={setQ} placeholder="Cerca fornitore o materia prima" />}>
        <Table rows={view} onRow={r => openDrawer('supplier', r.id)} selected={sel} initialSort={{ key: 'spend', dir: 'desc' }} exportName="fornitori" cols={[
          { key: 'name', label: 'Fornitore', render: r => <span><b>{r.name}</b>{r.approval && r.approval !== 'qualificato' && <> <Chip kind={APPROVAL[r.approval]?.kind}>{r.approval}</Chip></>}<span className="sub">{r.ingIds.map(i => ing[i]?.short || ing[i]?.name || i).slice(0, 4).join(', ')}</span></span>, csv: r => r.name },
          { key: 'score', label: 'Punteggio', align: 'r', render: clsChip, csv: r => r.score },
          { key: 'otif', label: 'OTIF', align: 'r', render: r => (r.otif == null ? '—' : <span className={r.otif < 0.85 ? 'chip crit' : r.otif < 0.95 ? 'chip warn' : ''}>{pc(r.otif)}</span>), csv: r => r.otif },
          { key: 'avgDelay', label: 'Ritardo medio', align: 'r', render: r => (r.avgDelay == null ? '—' : `${nf(r.avgDelay, 1)} gg`) },
          { key: 'rejectRate', label: 'Respinti', align: 'r', render: r => (r.rejectRate ? <span className="chip crit">{pc(r.rejectRate, 1)}</span> : '0%') },
          { key: 'afb1P95', label: <Def text="Aflatossina B1: 95° percentile dei lotti (µg/kg); limite per le materie prime 20.">AFB1 P95</Def>, csvLabel: 'AFB1 P95', align: 'r', render: r => (r.afb1P95 == null ? '—' : <span className={r.afb1P95 >= 10 ? 'chip warn' : ''}>{nf(r.afb1P95, 1)}</span>) },
          { key: 'premiumMedian', label: 'Premio sul mercato', align: 'r', render: r => spc(r.premiumMedian) },
          { key: 'priceIdx', label: <Def text="Prezzo medio pagato rispetto alla media di tutti i fornitori della stessa materia prima nello stesso mese, pesato sulle tonnellate.">Prezzo vs colleghi</Def>, csvLabel: 'Prezzo vs colleghi', align: 'r', render: r => spc(r.priceIdx, 2) },
          { key: 'docs', label: 'Documenti', align: 'r', render: r => (r.docs == null ? <span className="muted">senza anagrafica</span> : r.docs === 100 ? <Chip kind="good">in regola</Chip> : <Chip kind={r.docs ? 'warn' : 'crit'}>{r.docs ? 'audit scaduto' : 'certificato scaduto'}</Chip>), csv: r => r.docs },
          { key: 'spend', label: 'Spesa', align: 'r', render: r => eurTxt(r.spend) },
        ]} />
      </Panel>
    </>
  );
}

/** Mappa del valore: x = prezzo rispetto ai colleghi (a sinistra conviene), y = qualità, area = spesa. */
function ValueMap({ rows, sel }) {
  const box = useRef(null);
  const W = useWidth(box), H = 260;
  // solo i fornitori con un collega sulla stessa materia prima: per gli altri il prezzo non ha termini di paragone
  const pts = rows.filter(r => r.priceIdx != null && Math.abs(r.priceIdx) > 1e-6 && r.quality != null && r.spend > 0);
  if (!pts.length) return <div ref={box}><p className="small muted">Servono lotti di almeno due fornitori per la stessa materia prima.</p></div>;
  const xs = pts.map(r => r.priceIdx * 100), mx = Math.max(1, ...xs.map(Math.abs)) * 1.15;
  const ys = pts.map(r => r.quality), lo = Math.max(0, Math.floor(Math.min(...ys) / 10) * 10 - 5), hi = 100;
  const smax = Math.max(...pts.map(r => r.spend));
  const padL = 40, padR = 16, padT = 14, padB = 34;
  const x = v => padL + ((v + mx) / (2 * mx)) * (W - padL - padR);
  const placed = [];
  const y = v => padT + ((hi - v) / (hi - lo || 1)) * (H - padT - padB);
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fornitori: prezzo rispetto ai colleghi e qualità" style={{ height: H }}>
        <g className="grid">{[lo, (lo + hi) / 2, hi].map(t => <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />)}<line x1={x(0)} x2={x(0)} y1={padT} y2={H - padB} /></g>
        {[lo, (lo + hi) / 2, hi].map(t => <text key={'y' + t} x={padL - 6} y={y(t) + 3.5} textAnchor="end">{nf(t)}</text>)}
        <text x={padL} y={H - 8} className="lbl-ink">più conveniente</text>
        <text x={W - padR} y={H - 8} textAnchor="end" className="lbl-ink">più caro</text>
        <text x={x(0)} y={H - 20} textAnchor="middle">media</text>
        {[...pts].sort((a, b) => b.spend - a.spend).map(r => {
          const rad = 5 + 13 * Math.sqrt(r.spend / smax);
          // etichetta solo se non si sovrappone a una già scritta (prima i fornitori con più spesa)
          const lx = x(r.priceIdx * 100), ly = y(r.quality) - rad - 3;
          const free = !placed.some(p => Math.abs(p.x - lx) < 95 && Math.abs(p.y - ly) < 13);
          if (free) placed.push({ x: lx, y: ly });
          const color = r.cls === 'A' ? 'var(--good)' : r.cls === 'B' ? 'var(--warn)' : 'var(--crit)';
          return (
            <g key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDrawer('supplier', r.id)}>
              <title>{`${r.name}: prezzo ${sf(r.priceIdx * 100, 2)}% rispetto ai colleghi · qualità ${nf(r.quality)} · punteggio ${nf(r.score)}`}</title>
              <circle cx={x(r.priceIdx * 100)} cy={y(r.quality)} r={rad} fill={color} fillOpacity={r.id === sel ? 0.75 : 0.35} stroke={color} strokeWidth={r.id === sel ? 2.5 : 1.2} />
              {free && <text x={lx} y={ly} textAnchor="middle" className="lbl-ink">{r.name.replace(/ (S\.r\.l\.|\(demo\)|\(fantasia\))/g, '').slice(0, 18)}</text>}
            </g>
          );
        })}
      </svg>
      <Legend items={[{ label: 'Classe A', color: 'var(--good)' }, { label: 'Classe B', color: 'var(--warn)' }, { label: 'Classe C', color: 'var(--crit)' }]} />
    </div>
  );
}

/* ---------------- scheda laterale del fornitore ---------------- */
export function SupplierD({ d, id }) {
  const s = supplierOf(d, id);
  if (!s) return <Drawer title="Fornitore non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  return <SupplierBody d={d} s={s} />;
}

function SupplierBody({ d, s }) {
  const today = appToday(d);
  const ing = byId(d.ingredients || []);
  const P12 = { from: addDays(today, -364), to: today };
  const ctx = ctxOf(d);
  const r = useMemo(() => scorecard(d, ctx, P12).find(x => x.id === s.id), [d, ctx, s.id, today]);
  const trend = useMemo(() => supplierTrend(d, s.id, today, 13), [d, s.id, today]);
  const mine = x => x.supplierId === s.id || (!x.supplierId && x.supplier === s.name);
  const lots = (d.ingLots || []).filter(mine).sort((a, b) => (a.date < b.date ? 1 : -1));
  const open = (d.purchases || []).filter(p => mine(p) && p.status !== 'ricevuto' && p.status !== 'annullato').sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
  const docs = docsScore(s, today);
  return (
    <Drawer title={s.name} sub={`Fornitore${s.code ? ' · ' + s.code : ''}${s.virtual ? ' · senza anagrafica' : ''}`} icon={<span className="dicon"><LuTruck /></span>} wide>
      {r ? (
        <div className="kpis" style={{ marginBottom: 12 }}>
          <Kpi label="Punteggio" value={r.score != null ? nf(r.score) : '—'} unit={r.cls ? `classe ${r.cls}` : ''} status={r.cls === 'A' ? 'ok' : r.cls === 'B' ? 'warn' : r.cls ? 'bad' : undefined} />
          <Kpi label="OTIF 12 mesi" value={pc(r.otif)} foot={`${nf(r.pos)} consegne · ritardo medio ${nf(r.avgDelay || 0, 1)} gg`} />
          <Kpi label="Qualità" value={nf(r.quality)} foot={`respinti ${pc(r.rejectRate, 1)}${r.afb1P95 != null ? ` · AFB1 P95 ${nf(r.afb1P95, 1)}` : ''}`} />
          <Kpi label="Premio sul mercato" value={spc(r.premiumMedian)} foot={`prezzo vs colleghi ${spc(r.priceIdx, 2)}`} />
        </div>
      ) : <p className="small muted">Nessun arrivo negli ultimi 12 mesi.</p>}
      <Kv items={[['Materie prime', (s.ingIds?.length ? s.ingIds : r?.ingIds || []).map(i => ing[i]?.name || i).join(', ') || '—'], ['Qualifica', s.approval ? <Chip kind={APPROVAL[s.approval]?.kind}>{APPROVAL[s.approval]?.label}</Chip> : '—'],
        ['Documenti', docs == null ? 'anagrafica da creare' : docs === 100 ? 'certificati validi, audit entro 12 mesi' : docs ? 'audit da rinnovare o certificato in scadenza' : 'certificato scaduto o assente'],
        ['Certificati', (s.cert || []).length ? (s.cert || []).map(c => `${c.type} fino al ${dateIt(c.expiry)}`).join(' · ') : '—'], ['Ultimo audit', s.lastAudit ? `${dateIt(s.lastAudit)} (${relDays(s.lastAudit, today)})` : '—'],
        ['Pagamento', s.paymentDays != null ? `${s.paymentDays} giorni${s.endOfMonth ? ' fine mese' : ''}` : '—'], ['Ordine minimo', s.minOrderT ? `${nf(s.minOrderT)} t` : '—'],
        ['Sconti per quantità', (s.priceBreaks || []).length ? s.priceBreaks.map(b => `da ${nf(b.fromT)} t −${nf(b.discountPct, 1)}%`).join(' · ') : '—'], s.note ? ['Note', s.note] : null]} />
      {trend.some(t => t.otif != null) && (
        <div className="dsec"><div className="eyebrow">Andamento mensile</div>
          <LineChart labels={trend.map(t => monthLabel(t.month))} height={160} unit="%" decimals={0} area={false} xEvery={3} markLast={false}
            series={[{ key: 'o', label: 'OTIF', color: 'var(--s1)', values: trend.map(t => (t.otif == null ? null : t.otif * 100)) }, { key: 'p', label: 'Premio sul mercato', color: 'var(--s2)', values: trend.map(t => (t.premium == null ? null : t.premium * 100)) }]}
            ariaLabel={`OTIF e premio mensili di ${s.name}`} />
          <Legend items={[{ label: 'OTIF %', color: 'var(--s1)', line: true }, { label: 'Premio sul mercato %', color: 'var(--s2)', line: true }]} />
        </div>
      )}
      <div className="dsec"><div className="eyebrow">Ordini aperti</div>
        {open.length ? open.map(p => <div key={p.id} className="dlink" style={{ cursor: 'default' }}><span className="code">{p.code}</span><span>{ing[p.ingId]?.name} · {nf(p.tonnes)} t a {nf(p.price, 1)} €/t<span className="sub">consegna {dateIt(p.deliveryDate, 'dm')}</span></span><Chip kind={p.deliveryDate < today ? 'crit' : ''}>{p.deliveryDate < today ? 'in ritardo' : p.status}</Chip></div>) : <p className="small muted">Nessuno.</p>}
      </div>
      <div className="dsec"><div className="eyebrow">Ultimi lotti ricevuti</div>
        {lots.length ? lots.slice(0, 8).map(l => (
          <button key={l.id} className="dlink" onClick={() => openDrawer('ingLot', l.id)}><span className="code">{l.code}</span><span className="muted">{dateIt(l.date, 'dm')} · {ing[l.ingId]?.short || ing[l.ingId]?.name} · {nf(l.tonnes, 1)} t · {nf(l.price, 1)} €/t{l.analyses?.AFB1 != null ? ` · AFB1 ${nf(l.analyses.AFB1, 1)}` : ''}</span>{l.status === 'bloccato' && <Chip kind="crit">respinto</Chip>}</button>
        )) : <span className="small muted">Nessun lotto registrato.</span>}
      </div>
      {SUPPLIER_SECTIONS.map((S, i) => <SlotGuard key={i}><S d={d} id={s.id} /></SlotGuard>)}
      {r && r.complaints > 0.05 && <div className="dsec"><div className="eyebrow">Reclami collegati · 12 mesi</div><p className="small">Quota attribuita ai lotti di questo fornitore: <b>{nf(r.complaints, 1)}</b> reclami ({nf(r.complaintsPer1000, 2)} ogni 1.000 t), in base ai kg delle sue materie prime nei lotti contestati.</p></div>}
      <SupplierEdit d={d} s={s} today={today} />
    </Drawer>
  );
}

function SupplierEdit({ d, s, today }) {
  const [f, setF] = useState({ approval: s.approval || 'qualificato', paymentDays: s.paymentDays ?? 60, endOfMonth: !!s.endOfMonth, minOrderT: s.minOrderT ?? null, lastAudit: s.lastAudit || '', certType: 'GMP+', certExpiry: addDays(today, 365) });
  const set = p => setF(x => ({ ...x, ...p }));
  if (s.virtual) {
    const create = () => {
      store.add('suppliers', { id: 'sup-' + slug(s.name).slice(0, 24), code: '', name: s.name, ingIds: [...new Set((d.ingLots || []).filter(l => l.supplier === s.name).map(l => l.ingId))], cert: [], approval: 'qualificato', lastAudit: null, paymentDays: 60, endOfMonth: true, minOrderT: null, priceBreaks: [] }, `Anagrafica del fornitore ${s.name}`);
      toast('Anagrafica creata: aggiungi certificati e condizioni', 'ok', { label: 'Annulla', fn: () => store.undo() });
    };
    return <div className="dsec"><div className="eyebrow">Anagrafica</div><p className="small muted">Il fornitore compare solo per nome su lotti e ordini: creane l’anagrafica per gestire qualifica, certificati e condizioni.</p><Btn small kind="primary" icon={LuPlus} onClick={create}>Crea l’anagrafica</Btn></div>;
  }
  const save = () => {
    store.update('suppliers', s.id, { approval: f.approval, paymentDays: f.paymentDays, endOfMonth: f.endOfMonth, minOrderT: f.minOrderT, lastAudit: f.lastAudit || null }, `Fornitore ${s.name}: condizioni aggiornate`);
    toast('Fornitore aggiornato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const addCert = () => {
    const cert = [...(s.cert || []).filter(c => c.type !== f.certType), { type: f.certType, expiry: f.certExpiry }];
    store.update('suppliers', s.id, { cert }, `Fornitore ${s.name}: certificato ${f.certType} fino al ${dateIt(f.certExpiry)}`);
    toast(`Certificato ${f.certType} registrato`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <div className="dsec"><div className="eyebrow">Qualifica e condizioni</div>
      <div className="form">
        <Field label="Qualifica"><Select value={f.approval} onChange={v => set({ approval: v })} options={Object.entries(APPROVAL).map(([id, x]) => ({ id, label: x.label }))} /></Field>
        <Field label="Pagamento (giorni)"><NumInput value={f.paymentDays} onChange={v => set({ paymentDays: v })} decimals={0} /></Field>
        <Field label="Ordine minimo t"><NumInput value={f.minOrderT} onChange={v => set({ minOrderT: v })} decimals={1} /></Field>
        <Field label="Ultimo audit"><input type="date" className="input" value={f.lastAudit} max={today} onChange={e => set({ lastAudit: e.target.value })} /></Field>
      </div>
      <label className="row small" style={{ gap: 6, margin: '8px 0' }}><input type="checkbox" checked={f.endOfMonth} onChange={e => set({ endOfMonth: e.target.checked })} /> Pagamento a fine mese</label>
      <Btn small icon={LuSave} onClick={save}>Salva</Btn>
      <div className="form" style={{ marginTop: 12 }}>
        <Field label="Certificato"><Select value={f.certType} onChange={v => set({ certType: v })} options={['GMP+', 'FAMI-QS', 'ISO 22000', 'Biologico']} /></Field>
        <Field label="Valido fino al"><input type="date" className="input" value={f.certExpiry} min={today} onChange={e => set({ certExpiry: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 8 }}><Btn small icon={LuPlus} onClick={addCert}>Registra il certificato</Btn></div>
    </div>
  );
}
