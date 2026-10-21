/* FeedOS 17 · Scheda laterale dell'agente (pacchetto WP4): prestazioni degli ultimi 12 mesi, portafoglio, schema
 * provvigionale modificabile (base, scaglioni, eccezioni per prodotto, riduzione sotto il prezzo minimo, maturazione,
 * mandato) con annulla, e storico degli estratti conto trimestrali. Aperta con openDrawer('agent', id). */
import React, { useMemo, useState } from 'react';
import { LuUserRound, LuPlus, LuTrash2, LuFileText } from 'react-icons/lu';
import { store, toast, openDrawer, closeDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { ctxOf, appToday } from '../core/derived.js';
import { nf, dateIt } from '../core/util.js';
import { resolvePeriod } from '../core/period.js';
import { agentPerformance, schemeOf, statementHistory } from '../engine/commissions.js';
import { Drawer, Kv, Btn, Chip, Field, NumInput, Select, Seg, Table } from '../ui/ui.jsx';

const eurK = v => (v == null || !Number.isFinite(+v) ? '—' : nf(v / 1000, 1) + ' k€');

export function AgentD({ d, id }) {
  const a = (d.agents || []).find(x => x.id === id);
  const ctx = ctxOf(d); const today = appToday(d);
  const P = useMemo(() => resolvePeriod({ preset: '12m' }, today), [today]);
  const perf = useMemo(() => (a ? agentPerformance(d, ctx, P).find(r => r.id === id) : null), [d, ctx, P, id, a]);
  const hist = useMemo(() => (a ? statementHistory(d, ctx, id, 4) : []), [d, ctx, id, a]);
  if (!a) return <Drawer title="Agente non trovato"><p className="muted">Potrebbe essere stato eliminato o appartenere a un altro archivio.</p></Drawer>;
  const mine = (d.customers || []).filter(c => c.agentId === id).sort((x, y) => String(x.name).localeCompare(String(y.name), 'it'));
  const toStatements = () => { closeDrawer(); go('commerciale', 'rete', id); };
  return (
    <Drawer title={a.name} sub={`Agente · ${a.zone || 'zona non indicata'} · mandato ${schemeOf(a).mandate === 'pluri' ? 'plurimandatario' : 'monomandatario'}`} icon={<span className="dicon"><LuUserRound /></span>} wide
      actions={<Btn kind="primary" icon={LuFileText} onClick={toStatements}>Estratti conto e stampa</Btn>}>
      {perf && <div className="kpis">
        <div className="kpi"><span className="lbl">Ricavi (12 mesi)</span><span className="val">{eurK(perf.revenue)}</span><span className="foot">{nf(perf.tonnes)} t · {perf.customers} clienti</span></div>
        <div className="kpi"><span className="lbl">MdC II per tonnellata</span><span className="val">{perf.mc2T != null ? nf(perf.mc2T, 1) : '—'}<small>€/t</small></span><span className="foot">dopo la provvigione dello schema</span></div>
        <div className="kpi"><span className="lbl">Prezzo realizzato</span><span className="val">{perf.realization != null ? nf(perf.realization * 100, 1) : '—'}<small>% del listino</small></span><span className="foot">{perf.shareBelowMinT != null ? `${nf(perf.shareBelowMinT * 100, 1)}% delle t sotto il minimo` : ''}</span></div>
        <div className="kpi"><span className="lbl">Offerte vinte (valore)</span><span className="val">{perf.winRateValue != null ? nf(perf.winRateValue * 100) : '—'}<small>%</small></span><span className="foot">{perf.visits} visite · {perf.idleCustomers} clienti fermi da 30 giorni</span></div>
        <div className="kpi"><span className="lbl">Provvigioni dello schema</span><span className="val">{eurK(perf.commission)}</span><span className="foot">maturate {eurK(perf.accrued)}</span></div>
        <div className="kpi"><span className="lbl">Scaduto dei clienti</span><span className="val">{perf.overdue != null ? eurK(perf.overdue) : '—'}</span><span className="foot">{perf.overdue != null ? 'crediti scaduti del portafoglio' : 'senza fatture registrate'}</span></div>
      </div>}
      <SchemeEditor d={d} a={a} />
      <div className="dsec"><div className="eyebrow">Estratti conto degli ultimi trimestri</div>
        {hist.length ? <Table rows={hist} rowKey={h => h.quarter} pageSize={8} cols={[
          { key: 'label', label: 'Trimestre', render: h => <b>{h.label}</b> },
          { key: 'revenue', label: 'Fatturato', align: 'r', render: h => eurK(h.revenue) },
          { key: 'maturate', label: 'Maturate', align: 'r', render: h => nf(h.maturate) + ' €' },
          { key: 'pending', label: 'In attesa', align: 'r', render: h => (h.pending > 0.5 ? <Chip kind="warn">{nf(h.pending)} €</Chip> : '—') },
          { key: 'netto', label: 'Netto Enasarco', align: 'r', render: h => nf(h.netto) + ' €' },
          { key: 'dueDate', label: 'Pagamento', render: h => dateIt(h.dueDate) },
        ]} /> : <span className="small muted">Nessun trimestre chiuso con vendite.</span>}
      </div>
      <div className="dsec"><div className="eyebrow">Clienti ({mine.length})</div>
        {mine.length ? mine.map(c => <button key={c.id} className="dlink" onClick={() => openDrawer('customer', c.id)}><span>{c.name}</span><span className="muted">{c.city}{c.province ? ` (${c.province})` : ''}</span></button>)
          : <span className="small muted">Nessun cliente assegnato.</span>}
      </div>
    </Drawer>
  );
}

/** Schema provvigionale: le modifiche si salvano in un solo passo annullabile; il conto economico usa la provvigione standard. */
function SchemeEditor({ d, a }) {
  const base = schemeOf(a);
  const [s, setS] = useState(() => ({ ...base, tiers: base.tiers.map(t => ({ ...t })), byProduct: { ...base.byProduct } }));
  const [prod, setProd] = useState('');
  const changed = JSON.stringify(s) !== JSON.stringify(base);
  const set = p => setS(x => ({ ...x, ...p }));
  const save = () => {
    const scheme = { ...s, tiers: s.tiers.filter(t => t.from != null && t.pct != null).sort((x, y) => x.from - y.from) };
    store.update('agents', a.id, { scheme }, `Schema provvigionale di ${a.name}`);
    toast('Schema provvigionale salvato', 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const products = (d.products || []).filter(p => p.active !== false);
  return (
    <div className="dsec">
      <div className="eyebrow">Schema provvigionale</div>
      <div className="form">
        <Field label="Provvigione di base %"><NumInput value={s.basePct} decimals={2} min={0} max={20} onChange={v => set({ basePct: v ?? 0 })} ariaLabel="Provvigione di base" /></Field>
        <Field label="Sotto il prezzo minimo" hint="quota della provvigione riconosciuta"><NumInput value={s.belowMinFactor} decimals={2} min={0} max={1} onChange={v => set({ belowMinFactor: v ?? 1 })} ariaLabel="Fattore sotto il prezzo minimo" /></Field>
        <Field label="Maturazione"><Seg options={[{ id: 'fatturato', label: 'Al fatturato' }, { id: 'incasso', label: 'All’incasso' }]} value={s.accrual} onChange={v => set({ accrual: v })} label="Maturazione" /></Field>
        <Field label="Mandato"><Seg options={[{ id: 'mono', label: 'Mono' }, { id: 'pluri', label: 'Pluri' }]} value={s.mandate || 'mono'} onChange={v => set({ mandate: v })} label="Mandato" /></Field>
      </div>
      <div className="small" style={{ fontWeight: 600, marginTop: 6 }}>Scaglioni sul fatturato da inizio anno</div>
      {s.tiers.map((t, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="small muted">da</span><NumInput value={t.from} decimals={0} min={0} onChange={v => setS(x => ({ ...x, tiers: x.tiers.map((y, j) => (j === i ? { ...y, from: v } : y)) }))} ariaLabel={`Soglia dello scaglione ${i + 1}`} />
          <span className="small muted">€ →</span><NumInput value={t.pct} decimals={2} min={0} max={20} onChange={v => setS(x => ({ ...x, tiers: x.tiers.map((y, j) => (j === i ? { ...y, pct: v } : y)) }))} ariaLabel={`Percentuale dello scaglione ${i + 1}`} /><span className="small muted">%</span>
          <Btn small kind="ghost" icon={LuTrash2} title="Togli lo scaglione" onClick={() => setS(x => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))} />
        </div>
      ))}
      <Btn small kind="ghost" icon={LuPlus} onClick={() => setS(x => ({ ...x, tiers: [...x.tiers, { from: (x.tiers.at(-1)?.from || 0) + 1000000, pct: x.basePct }] }))}>Aggiungi scaglione</Btn>
      <div className="small" style={{ fontWeight: 600, marginTop: 6 }}>Eccezioni per prodotto</div>
      {Object.entries(s.byProduct).map(([code, v]) => (
        <div key={code} className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="code">{code}</span><span className="small">{products.find(p => p.code === code || p.id === code)?.name || ''}</span>
          <NumInput value={v} decimals={2} min={0} max={20} onChange={x => setS(y => ({ ...y, byProduct: { ...y.byProduct, [code]: x ?? 0 } }))} ariaLabel={`Provvigione per ${code}`} /><span className="small muted">%</span>
          <Btn small kind="ghost" icon={LuTrash2} title="Togli l’eccezione" onClick={() => setS(y => { const b = { ...y.byProduct }; delete b[code]; return { ...y, byProduct: b }; })} />
        </div>
      ))}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Select value={prod} onChange={setProd} options={[{ id: '', label: 'Prodotto…' }, ...products.filter(p => !(p.code in s.byProduct)).map(p => ({ id: p.code, label: `${p.code} · ${p.name}` }))]} ariaLabel="Prodotto per l’eccezione" />
        <Btn small icon={LuPlus} disabled={!prod} onClick={() => { setS(y => ({ ...y, byProduct: { ...y.byProduct, [prod]: y.basePct } })); setProd(''); }}>Aggiungi</Btn>
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="small muted">Il conto economico usa la provvigione standard ({nf(a.commissionPct ?? 0, 2)}%); lo schema vale per gli estratti conto, con la differenza dichiarata.</span>
        <Btn kind="primary" disabled={!changed} onClick={save}>Salva lo schema</Btn>
      </div>
    </div>
  );
}
