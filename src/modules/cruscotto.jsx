/* FeedOS 17 · Oggi › Cruscotto (pacchetto WP7): gli indicatori chiave del periodo globale con obiettivo, semaforo, confronto,
 * andamento di 13 mesi e definizione; le prime perdite in euro con il collegamento alla pagina che le spiega; la messa in servizio
 * quando l'archivio è dell'impresa. Ogni riquadro porta alla pagina di dettaglio. */
import React, { useMemo } from 'react';
import { LuCircleCheck, LuCircle, LuArrowRight } from 'react-icons/lu';
import { go } from '../core/router.js';
import { ctxOf, appToday } from '../core/derived.js';
import { usePrefs } from '../core/prefs.js';
import { nf, sum, addDays } from '../core/util.js';
import { usePeriod } from '../ui/period.jsx';
import { KPIS, kpiValues, kpiHistory, targetFor, statusFor, projection, topLosses, shown } from '../engine/kpis.js';
import { Panel, Kpi, Empty } from '../ui/ui.jsx';
import { Bars } from '../ui/charts.jsx';
import { Def, money, eurTxt } from './direzione-conto.jsx';
import { ESG_KPI_IDS } from '../engine/esg-registry.js';

const GROUPS = [
  { id: 'eco', label: 'Economia e mercato', ids: ['ricavi-netti', 'volume-t', 'prezzo-netto-t', 'mdc-t', 'margine-pieno-t', 'quota-mp', 'ebitda-pct'] },
  { id: 'prod', label: 'Produzione e qualità', ids: ['oee', 'utilizzo-linee', 'kwh-t', 'scarto-pct', 'calo-effettivo', 'lotti-bloccati-pct', 'reclami-1000t'] },
  { id: 'acq', label: 'Acquisti e scorte', ids: ['otif', 'ppv-pct', 'copertura-mp-gg', 'dio', 'eccedenze-eur'] },
  { id: 'fin', label: 'Clienti e finanza', ids: ['dso', 'scaduto-pct', 'successo-offerte-valore', 'top10-pct', 'hhi'] },
  // fondazione 18: indicatori ESG riservati ai pacchetti (un id non ancora nel catalogo non disegna nulla)
  { id: 'esg', label: 'ESG', ids: ['co2-t', ...ESG_KPI_IDS] },
];
const K = Object.fromEntries(KPIS.map(k => [k.id, k]));

/** Valore e unità come si mostrano in un riquadro: gli importi in k€ o M€, le percentuali in punti. */
function display(k, v) {
  if (v == null) return { value: '—', unit: '' };
  if (k.unit === '€') { const m = money(v); return { value: m.value, unit: m.unit }; }
  return { value: nf(shown(k, v), k.decimals ?? 1), unit: k.unit === 'n' ? '' : k.unit };
}
const targetTxt = (k, t) => {
  if (!t) return undefined;
  if (k.dir === 'range' && (t.min != null || t.max != null)) return `${nf(shown(k, t.min ?? 0), 0)}–${nf(shown(k, t.max ?? 0), 0)} ${k.unit}`;
  if (t.target == null) return undefined;
  const x = display(k, t.target);
  return `${k.dir === 'down' ? '≤ ' : k.dir === 'up' && k.kind !== 'flow' ? '≥ ' : ''}${x.value}${x.unit && x.unit !== '%' ? ' ' + x.unit : x.unit}`;
};

export function Cruscotto({ d }) {
  const per = usePeriod(d);
  const ctx = ctxOf(d);
  const V = useMemo(() => kpiValues(d, ctx, per.P), [d, ctx, per.P]);
  const VC = useMemo(() => (per.C && !per.C.budget ? kpiValues(d, ctx, per.C) : null), [d, ctx, per.C]);
  const H = useMemo(() => Object.fromEntries(KPIS.filter(k => k.hist).map(k => [k.id, kpiHistory(d, ctx, k.id, 13)])), [d, ctx]);
  const L = useMemo(() => topLosses(d, ctx, per.P), [d, ctx, per.P]);
  const st = useMemo(() => Object.fromEntries(KPIS.map(k => [k.id, statusFor(d, k.id, V[k.id], per.P)])), [d, V, per.P]);
  // etichetta breve del confronto: i riquadri sono stretti
  const cmpLabel = !per.C ? null : per.C.budget ? 'budget' : per.spec.compare === 'ap' ? 'anno prec.' : per.spec.compare === 'prec' ? 'periodo prec.' : per.C.short;
  const counts = { ok: 0, warn: 0, bad: 0 };
  for (const s of Object.values(st)) if (s) counts[s]++;
  const tile = id => {
    const k = K[id];
    if (!k) return null;
    const v = V[id], t = targetFor(d, id, per.P), x = display(k, v);
    const proj = k.kind === 'flow' ? projection(d, ctx, id, per.P) : null;
    const cmp = VC && VC[id] != null && v != null ? { cur: shown(k, v), value: shown(k, VC[id]), kind: k.kind === 'flow' ? 'flow' : 'ratio', good: k.dir === 'down' ? 'down' : k.dir === 'up' ? 'up' : null, unit: k.unit === '%' ? 'pt' : k.unit === '€' ? '' : k.unit, decimals: k.decimals ?? 1, label: cmpLabel, cov: per.cov } : undefined;
    const spark = (H[id] || []).map(p => (p.value == null ? null : shown(k, p.value)));
    return (
      <Kpi key={id} label={<Def text={k.def}>{k.label}</Def>} value={x.value} unit={x.unit} status={st[id] || undefined} target={targetTxt(k, t)} cmp={cmp}
        foot={v == null ? 'dato non disponibile' : proj != null ? `proiezione ${display(k, proj).value} ${display(k, proj).unit}` : undefined}
        spark={spark.filter(p => p != null).length > 2 ? spark : undefined} sparkColor={st[id] === 'bad' ? 'var(--crit)' : st[id] === 'warn' ? 'var(--warn)' : 'var(--s1)'}
        onClick={() => go(k.link.area, k.link.tab)} title={`Apri: ${k.label}`} />
    );
  };
  const top = L.slice(0, 5);
  const off = KPIS.filter(k => st[k.id] === 'bad');
  return (
    <>
      <Setup d={d} />
      <div className="split">
        <Panel title="Sintesi del periodo" sub={`Indicatori con un obiettivo · gli obiettivi si impostano in Dati › Impostazioni · ${per.P.from.split('-').reverse().join('/')} – ${per.P.to.split('-').reverse().join('/')}`} id="kpi-summary">
          <div className="kpis">
            <Kpi label="In linea" value={nf(counts.ok)} status="ok" />
            <Kpi label="Vicini alla soglia" value={nf(counts.warn)} status="warn" />
            <Kpi label="Fuori obiettivo" value={nf(counts.bad)} status={counts.bad ? 'bad' : 'ok'} />
          </div>
          {off.length > 0 && (
            <div className="loss-list">
              {off.map(k => { const x = display(k, V[k.id]); return (
                <button key={k.id} className="loss-row" onClick={() => go(k.link.area, k.link.tab)}>
                  <b>{x.value}{x.unit && <small> {x.unit}</small>}</b><span><b>{k.label}</b><span className="small muted"> · obiettivo {targetTxt(k, targetFor(d, k.id, per.P))}</span></span><LuArrowRight aria-hidden="true" />
                </button>
              ); })}
            </div>
          )}
        </Panel>
        <Panel title="Prime 5 perdite in euro" sub="Quanto costano, nel periodo, le inefficienze che i dati misurano · clic per la pagina che le spiega" id="kpi-losses">
          {top.length ? (
            <>
              <Bars data={top.map(x => ({ key: x.id, label: x.label, value: x.eur / 1000 }))} unit="k€" decimals={0} labelW={200} onClick={x => { const l = top.find(y => y.id === x.key)?.link; if (l) go(l.area, l.tab); }} ariaLabel="Prime perdite in euro" />
              <div className="loss-list">
                {top.map(x => <button key={x.id} className="loss-row" onClick={() => go(x.link.area, x.link.tab)}><b>{eurTxt(x.eur)}</b><span className="small">{x.def}</span><LuArrowRight aria-hidden="true" /></button>)}
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>In tutto {eurTxt(sum(L, x => x.eur))} da {L.length} fonti: non si sommano a un risultato, indicano dove guardare per primi.</p>
            </>
          ) : <Empty title="Nessuna perdita misurabile nel periodo" />}
        </Panel>
      </div>
      {GROUPS.filter(g => g.ids.some(id => K[id])).map(g => (
        <Panel key={g.id} title={g.label} id={`kpi-${g.id}`}>
          <div className="kpis">{g.ids.map(tile)}</div>
        </Panel>
      ))}
    </>
  );
}

/** Messa in servizio: i passi pesati per avere un archivio dell'impresa completo (solo per i dati propri). */
function Setup({ d }) {
  const lastBackupAt = usePrefs(p => p.lastBackupAt);
  if (d.settings?.dataset === 'demo') return null;
  const today = appToday(d);
  const steps = [
    ['Impresa e coordinate', 6, !!d.settings?.company?.name && d.settings.company.lat != null, ['dati', 'impostazioni']],
    ['Linee con portata e ore', 8, (d.lines || []).length > 0 && d.lines.every(l => l.capacityTph > 0 && l.hoursWeek > 0), ['dati', 'anagrafiche']],
    ['Materie prime con prezzi aggiornati', 10, (d.ingredients || []).length > 0 && d.ingredients.filter(i => i.active !== false).every(i => i.price > 0 && (!i.priceDate || i.priceDate >= addDays(today, -30))), ['dati', 'importa']],
    ['Specifiche nutrizionali', 6, (d.specs || []).length > 0, ['formulazione', 'specifiche']],
    ['Formule approvate', 10, (d.formulas || []).some(f => f.status === 'approvata'), ['formulazione', 'formule']],
    ['Prodotti con listino e costi', 8, (d.products || []).length > 0 && d.products.every(p => p.listPrice > 0 && p.formulaId), ['dati', 'anagrafiche']],
    ['Clienti con termini e agente', 8, (d.customers || []).length > 0 && d.customers.every(c => c.agentId && (c.terms?.days || c.paymentDays)), ['dati', 'anagrafiche']],
    ['Agenti', 4, (d.agents || []).length > 0, ['dati', 'anagrafiche']],
    ['12 mesi di consegne', 12, (d.shipments || []).some(s => s.date <= addDays(today, -330)) || (d.salesHistory || []).length > 0, ['dati', 'importa']],
    ['Fatture aperte', 8, (d.invoices || []).length > 0, ['dati', 'importa']],
    ['Costi fissi per centro', 8, (d.fixedCosts || []).length > 0, ['dati', 'importa']],
    ['Obiettivi degli indicatori', 6, Object.keys(d.settings?.targets || {}).length > 0, ['dati', 'impostazioni']],
    ['Primo backup', 6, !!lastBackupAt, ['dati', 'archivio']],
  ];
  const done = sum(steps.filter(s => s[2]), s => s[1]), tot = sum(steps, s => s[1]);
  const pct = Math.round((100 * done) / tot);
  return (
    <Panel title={`Messa in servizio: ${pct}%`} sub="I passi per avere numeri affidabili dai dati dell’impresa · clic per andare al punto" id="kpi-setup">
      <span className="meter" role="img" aria-label={`${pct}% completato`} style={{ marginBottom: 16 }}><i style={{ width: pct + '%', background: pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--crit)' }} /></span>
      <div className="grid g3" style={{ gap: 8 }}>
        {steps.map(([label, w, ok, link]) => (
          <button key={label} className="dlink" onClick={() => go(link[0], link[1])}>{ok ? <LuCircleCheck aria-hidden="true" style={{ color: 'var(--good)' }} /> : <LuCircle aria-hidden="true" />}<span className={ok ? 'muted' : ''}>{label}</span></button>
        ))}
      </div>
    </Panel>
  );
}
