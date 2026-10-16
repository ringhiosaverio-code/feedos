/* FeedOS 16 · Gemello digitale: lo stabilimento disegnato con i dati del periodo (materia, costo, energia, CO₂). */
import React, { useMemo, useState } from 'react';
import { useData, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday, costs, idx, kpis } from '../core/derived.js';
import { addDays, nf, sum, monthLabel, dateIt } from '../core/util.js';
import { formulaCO2, formulaCost } from '../engine/formulation.js';
import { balance, DEFAULTS } from '../engine/energy.js';
import { PageHead, Panel, Seg, Kpi, Btn } from '../ui/ui.jsx';

function useTwin(d, period) {
  const I = idx(d); const C = costs(d);
  return useMemo(() => {
    const today = appToday(d);
    const from = period === '30' ? addDays(today, -29) : period + '-01';
    const to = period === '30' ? today : addDays(addDays(period + '-28', 4).slice(0, 7) + '-01', -1);
    const inP = x => x >= from && x <= to;
    const days = Math.max(1, (new Date(to) - new Date(from)) / 864e5 + 1);
    const runs = d.runs.filter(r => inP(r.date));
    const prod = sum(runs, r => r.tonnes);
    const recv = sum(d.ingLots.filter(l => inP(l.date) && l.status !== 'bloccato'), l => l.tonnes);
    const ships = d.shipments.filter(s => inP(s.date));
    const shipT = sum(ships, s => s.tonnes);
    const custN = new Set(ships.map(s => s.customerId)).size;
    const revenue = sum(ships, s => s.tonnes * s.price);
    const lines = d.lines.map(l => {
      const rs = runs.filter(r => r.lineId === l.id);
      const t = sum(rs, r => r.tonnes), kwh = sum(rs, r => r.kwh), gpl = sum(rs, r => r.gplKg), h = sum(rs, r => r.hours);
      return { ...l, t, kwh, gpl, hours: h, kwhT: t ? kwh / t : null, gplT: t ? gpl / t : null, util: h / (l.hoursWeek * days / 7) };
    });
    // materie prime principali per scorta e copertura
    const use = {};
    for (const r of runs) { const f = I.form[r.formulaId]; if (!f) continue; for (const x of f.lines) use[x.ing] = (use[x.ing] || 0) + r.tonnes * x.kg / 1000; }
    const silos = d.ingredients.filter(i => (use[i.id] || 0) > 0).sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0)).slice(0, 6)
      .map(i => ({ id: i.id, name: i.name, short: i.short || shortName(i.name), stock: +i.stock || 0, daily: (use[i.id] || 0) / days, cover: (use[i.id] || 0) > 0 ? (+i.stock || 0) / ((use[i.id] || 0) / days) : null, safety: +i.safetyDays || 10 }));
    // energia del periodo (mesi interi dall'archivio letture, altrimenti dalle registrazioni)
    const months = d.energy.filter(e => e.month + '-15' >= from && e.month + '-01' <= to);
    const en = months.length ? { kwhGrid: sum(months, e => e.kwhGrid), kwhPV: sum(months, e => e.kwhPV), kwhExport: sum(months, e => e.kwhExport), gplKg: sum(months, e => e.gplKg), tonnes: sum(months, e => e.tonnes) } : { kwhGrid: sum(lines, l => l.kwh), kwhPV: 0, kwhExport: 0, gplKg: sum(lines, l => l.gpl), tonnes: prod };
    const f = { ...DEFAULTS, feGrid: +d.settings?.energy?.feGrid || DEFAULTS.feGrid, feGpl: +d.settings?.energy?.feGpl || DEFAULTS.feGpl };
    const b = balance(en, f);
    // costo e CO₂ medi per tonnella prodotta (ricetta in vigore, prezzi di oggi)
    let raw = 0, co2ing = 0, proc = 0, logi = 0, pack = 0, enc = 0;
    for (const r of runs) {
      const p = I.prod[r.productId]; const fm = I.form[r.formulaId]; if (!p || !fm) continue;
      const c = C[p.id];
      raw += r.tonnes * formulaCost(fm.lines, I.ing); co2ing += r.tonnes * formulaCO2(fm.lines, I.ing);
      proc += r.tonnes * (c?.processing || 0); logi += r.tonnes * (c?.logistics || 0); pack += r.tonnes * (c?.packaging || 0); enc += r.tonnes * (c?.energy || 0);
    }
    const q = Math.max(1, prod);
    const price = shipT ? revenue / shipT : null;
    const cost = { raw: raw / q, proc: proc / q, energy: enc / q, pack: pack / q, logi: logi / q };
    cost.total = cost.raw * 1.006 + cost.proc + cost.energy + cost.pack + cost.logi;
    return { from, to, days, prod, recv, shipT, custN, revenue, price, lines, silos, b, cost, co2ing: co2ing / q, margin: price != null ? price - cost.total : null };
  }, [d, period, I, C]);
}
function lineName(n) { const s = n.replace(/^Linea /, ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function shortName(n) { return n.replace('Farina di estrazione di ', 'F.e. ').replace('Borlande di mais essiccate (DDGS)', 'DDGS').replace(' granella', '').replace('Farinaccio di frumento', 'Farinaccio').replace('Crusca di frumento', 'Crusca').replace('Glutine di mais (corn gluten feed)', 'Glutine').replace(' decorticata 48%', ' 48%').replace(' 44%', ' 44'); }

const MODES = [{ id: 'materia', label: 'Materia' }, { id: 'costo', label: 'Costo' }, { id: 'energia', label: 'Energia' }, { id: 'co2', label: 'CO₂' }];

export function Gemello() {
  const d = useData();
  const [mode, setMode] = useState('materia');
  const months = [...new Set(d.energy.map(e => e.month))].sort().reverse().slice(0, 12);
  const [period, setPeriod] = useState('30');
  const T = useTwin(d, period);
  return (
    <>
      <PageHead title="Gemello digitale" lead="Lo stabilimento in un solo disegno, ricostruito dai dati registrati: ricevimenti, silos, linee, energia, prodotti e clienti. Scegli cosa leggere sui flussi; ogni elemento si apre con un clic."
        actions={<>
          <select className="select" style={{ width: 190 }} value={period} onChange={e => setPeriod(e.target.value)} aria-label="Periodo">
            <option value="30">Ultimi 30 giorni</option>{months.map(m => <option key={m} value={m}>{monthLabel(m, false)}</option>)}
          </select>
          <Seg options={MODES} value={mode} onChange={setMode} label="Cosa mostrare" />
        </>} />
      <div className="twin" id="twin-full"><TwinSvg T={T} mode={mode} /></div>
      <div className="kpis">
        <Kpi label="Prodotto nel periodo" value={nf(T.prod)} unit="t" foot={`${nf(T.prod / T.days * 7)} t a settimana`} onClick={() => go('produzione', 'registro')} />
        <Kpi label="Materie prime ricevute" value={nf(T.recv)} unit="t" foot="lotti accettati" onClick={() => go('qualita', 'lotti-mp')} />
        <Kpi label="Consegnato" value={nf(T.shipT)} unit="t" foot={`${T.custN} clienti serviti`} onClick={() => go('commerciale', 'clienti')} />
        <Kpi label="Costo pieno medio" value={nf(T.cost.total, 1)} unit="€/t" foot={T.price ? `prezzo medio ${nf(T.price, 1)} €/t` : ''} onClick={() => go('economia', 'margini')} />
        <Kpi label="CO₂ dei vettori energetici" value={nf(T.b.co2PerT, 2)} unit="kg/t" foot={`FV ${nf((T.b.coverage || 0) * 100, 1)}% dell’elettricità`} onClick={() => go('esg', 'energia')} />
      </div>
      <p className="small muted">Costi calcolati con la ricetta in vigore e i prezzi di oggi; energia dalle letture mensili dei contatori; CO₂ dei vettori energetici con il metodo della tesi (elettricità location-based e GPL). Periodo: {dateIt(T.from)} – {dateIt(T.to)}.</p>
    </>
  );
}

export function TwinMini() {
  const d = useData();
  const T = useTwin(d, '30');
  return (
    <button className="twin" style={{ width: '100%', padding: 0, cursor: 'pointer', display: 'block', textAlign: 'left' }} onClick={() => go('gemello')} aria-label="Apri il gemello digitale">
      <TwinSvg T={T} mode="materia" compact />
    </button>
  );
}

/* ---------- disegno ---------- */
function TwinSvg({ T, mode, compact }) {
  const W = 1200, H = compact ? 560 : 600;
  const Y = 330; // asse principale
  const lineY = [200, 330, 460];
  const maxT = Math.max(1, ...T.lines.map(l => l.t));
  const flow = (t, max) => 3 + 16 * Math.sqrt(Math.max(0, t) / Math.max(1, max));
  const nav = (a, t, id) => e => { if (compact) return; e.stopPropagation(); go(a, t, id); };
  const val = (m, a) => mode === m ? a : null;
  const siloX = i => 205 + i * 44;
  const paths = {
    in: `M150 ${Y} C170 ${Y} 175 ${Y} 190 ${Y}`,
    mill: `M470 ${Y} L520 ${Y}`,
    mix: `M600 ${Y} L640 ${Y}`,
    lines: lineY.map(y => `M720 ${Y} C760 ${Y} 760 ${y} 800 ${y}`),
    fin: lineY.map(y => `M960 ${y} C990 ${y} 990 ${Y} 1015 ${Y}`),
    out: `M1085 ${Y} L1115 ${Y}`,
    grid: `M420 92 C420 150 560 200 560 ${Y - 42}`,
    pv: `M560 92 L560 ${Y - 42}`,
    gpl: lineY.slice(0, 2).map(y => `M700 92 C700 140 780 ${y - 40} 820 ${y - 22}`),
  };
  const particles = (d, n, dur, color = 'var(--maize)') => compact ? null : Array.from({ length: n }, (_, i) => (
    <circle key={i} className="particle" r="3.2" fill={color}><animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${-i * dur / n}s`} path={d} /></circle>
  ));
  const tl = (x, y, a, b, anchor = 'middle', cls = 'lbl-strong') => (
    <g>{a && <text x={x} y={y} textAnchor={anchor} className={cls} style={{ fontSize: compact ? 30 : 15 }}>{a}</text>}{b && !compact && <text x={x} y={y + 17} textAnchor={anchor} style={{ fontSize: 12 }}>{b}</text>}</g>
  );
  const dur = t => Math.max(1.6, 6 - 4 * Math.min(1, t / Math.max(1, T.prod)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gemello digitale: ${nf(T.prod)} t prodotte, ${nf(T.shipT)} t consegnate, ${nf(T.b.co2PerT, 2)} kg CO₂ per tonnellata`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="gSilo" x1="0" x2="1"><stop offset="0" stopColor="var(--surface-3)" /><stop offset=".5" stopColor="var(--surface)" /><stop offset="1" stopColor="var(--surface-3)" /></linearGradient>
        <pattern id="pv" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="var(--s1)" opacity=".85" /><path d="M0 5H10M5 0V10" stroke="var(--surface)" strokeWidth="1" opacity=".6" /></pattern>
      </defs>
      {/* fondo: pianta dello stabilimento */}
      <rect x="180" y="150" width="880" height="400" rx="18" fill="var(--surface-2)" stroke="var(--line)" />
      {!compact && <text x="200" y="176" className="eyebrow" style={{ fontSize: 11, letterSpacing: '.12em', fill: 'var(--muted)', fontWeight: 700 }}>STABILIMENTO</text>}

      {/* energia */}
      <g className="node" onClick={nav('esg', 'energia')} tabIndex={compact ? -1 : 0} aria-label="Rete elettrica">
        <path className="shape" d="M404 40 L436 40 L428 70 L412 70 Z M420 70 V92" fill="none" stroke="var(--ink-2)" strokeWidth="2" />
        {tl(420, 26, 'Rete', val('energia', `${nf(T.b.kwhGrid / 1000)} MWh`) || val('co2', `${nf(T.b.co2Grid, 1)} t CO₂`) || val('costo', `${nf(T.b.kwhGrid * 0.19 / 1000, 1)} mila €`))}
      </g>
      <g className="node" onClick={nav('esg', 'energia')} tabIndex={compact ? -1 : 0} aria-label="Fotovoltaico">
        <rect className="shape" x="526" y="46" width="68" height="34" rx="3" fill="url(#pv)" stroke="var(--ink-2)" strokeWidth="1.2" transform="skewX(-12) translate(10 0)" />
        {tl(560, 26, `FV ${nf((T.b.coverage || 0) * 100)}%`, val('energia', `${nf(T.b.kwhSelf / 1000)} MWh autoconsumati`) || val('co2', 'fattore zero (convenzione)'))}
      </g>
      <g className="node" onClick={nav('esg', 'energia')} tabIndex={compact ? -1 : 0} aria-label="Centrale termica a GPL">
        <rect className="shape" x="676" y="42" width="48" height="42" rx="8" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.5" />
        <path d="M700 76 C690 70 692 58 700 50 C702 58 710 60 708 68 C712 64 712 60 711 57 C718 64 714 76 700 76Z" fill="var(--s2)" />
        {tl(700, 26, 'GPL · vapore', val('energia', `${nf(T.b.gplKg / 1000, 1)} t · ${nf(T.b.kwhHeat / 1000)} MWh`) || val('co2', `${nf(T.b.co2Gpl, 1)} t CO₂`) || val('costo', `${nf(T.b.gplKg * 0.98 / 1000, 1)} mila €`))}
      </g>
      <path d={paths.grid} className="flow" stroke="var(--s1)" strokeWidth="2.5" opacity=".55" strokeDasharray="2 5" />
      <path d={paths.pv} className="flow" stroke="var(--s1)" strokeWidth="2.5" opacity=".55" strokeDasharray="2 5" />
      {paths.gpl.map((p, i) => <path key={i} d={p} className="flow" stroke="var(--s2)" strokeWidth="2.5" opacity=".55" strokeDasharray="2 5" />)}

      {/* ricevimento */}
      <g className="node" onClick={nav('qualita', 'lotti-mp')} tabIndex={compact ? -1 : 0} aria-label="Ricevimento materie prime">
        <Truck x={40} y={Y - 34} />
        {tl(95, Y + (compact ? 60 : 42), compact ? `${nf(T.recv)} t` : 'Ricevimento', val('materia', `${nf(T.recv)} t`) || val('costo', `${nf(T.cost.raw, 1)} €/t`) || val('co2', `${nf(T.co2ing)} kg CO₂e/t`) || ' ')}
      </g>
      <path d={paths.in} className="flow" stroke="var(--maize)" strokeWidth={flow(T.recv, T.prod)} opacity=".35" />
      {particles(paths.in, 3, 2.4)}

      {/* silos materie prime */}
      {T.silos.map((s, i) => {
        const x = siloX(i), h = 112, top = Y - 72;
        const f = Math.max(0.04, Math.min(1, (s.cover || 0) / 30));
        const low = s.cover != null && s.cover < s.safety;
        return (
          <g key={s.id} className="node" onClick={nav('acquisti', 'scorte', s.id)} tabIndex={compact ? -1 : 0} aria-label={`${s.name}: ${nf(s.stock)} t, ${nf(s.cover)} giorni`}>
            <rect className="shape" x={x} y={top} width="30" height={h} rx="7" fill="url(#gSilo)" stroke="var(--line-2)" strokeWidth="1.5" />
            <rect x={x + 2} y={top + h - 2 - (h - 4) * f} width="26" height={(h - 4) * f} rx="5" fill={low ? 'var(--serious)' : 'var(--maize)'} opacity=".85" />
            <path d={`M${x} ${top + h} L${x + 11} ${top + h + 12} L${x + 19} ${top + h + 12} L${x + 30} ${top + h}`} fill="var(--line-2)" />
            {!compact && <text x={x + 15} y={top - (i % 2 ? 22 : 8)} textAnchor="middle" style={{ fontSize: 10.5 }} className="lbl-ink">{s.short}</text>}
            {!compact && mode === 'materia' && <text x={x + 15} y={top + h + 28} textAnchor="middle" style={{ fontSize: 10.5 }}>{nf(s.cover)} gg</text>}
          </g>
        );
      })}
      {!compact && <text x={siloX(0) + 110} y={Y + 104} textAnchor="middle" className="lbl-ink" style={{ fontSize: 12 }}>Silos materie prime · giorni di copertura</text>}
      <path d={`M${siloX(5) + 34} ${Y} L470 ${Y}`} className="flow" stroke="var(--maize)" strokeWidth={flow(T.prod, T.prod)} opacity=".35" />

      {/* macinazione e dosaggio */}
      <g className="node" onClick={nav('produzione', 'piano')} tabIndex={compact ? -1 : 0} aria-label="Dosaggio e macinazione">
        <rect className="shape" x="470" y={Y - 40} width="60" height="80" rx="10" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.5" />
        <circle cx="500" cy={Y} r="17" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" /><path d={`M500 ${Y - 17} L500 ${Y + 17} M483 ${Y} L517 ${Y}`} stroke="var(--ink-2)" strokeWidth="1.2" />
        {!compact && <text x="500" y={Y + 86} textAnchor="middle" className="lbl-ink" style={{ fontSize: 12 }}>Dosaggio e macinazione</text>}
      </g>
      <path d={paths.mix} className="flow" stroke="var(--maize)" strokeWidth={flow(T.prod, T.prod)} opacity=".35" />
      {particles(`M${siloX(5) + 34} ${Y} L470 ${Y}`, 3, 2)}
      <g className="node" onClick={nav('produzione', 'piano')} tabIndex={compact ? -1 : 0} aria-label="Miscelazione">
        <rect className="shape" x="600" y={Y - 34} width="120" height="68" rx="30" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.5" />
        <path d={`M620 ${Y} Q640 ${Y - 18} 660 ${Y} T700 ${Y}`} fill="none" stroke="var(--maize)" strokeWidth="2.5" />
        {!compact && tl(660, Y - 64, 'Miscelazione', val('costo', `materie prime ${nf(T.cost.raw, 1)} €/t`) || val('materia', `${nf(T.prod)} t`), 'middle')}
      </g>
      {particles(paths.mix, 2, 1.4)}

      {/* linee */}
      {T.lines.map((l, i) => {
        const y = lineY[i];
        return (
          <g key={l.id}>
            <path d={paths.lines[i]} className="flow" stroke="var(--maize)" strokeWidth={flow(l.t, maxT)} opacity=".35" />
            {particles(paths.lines[i], Math.max(1, Math.round(4 * l.t / maxT)), dur(l.t))}
            <g className="node" onClick={nav('produzione', 'energia', l.id)} tabIndex={compact ? -1 : 0} aria-label={`${l.name}: ${nf(l.t)} t`}>
              <rect className="shape" x="800" y={y - 34} width="160" height="68" rx="12" fill="var(--surface)" stroke={l.kind === 'pellet' ? 'var(--ink-2)' : 'var(--line-2)'} strokeWidth="1.5" />
              {l.kind === 'pellet' && <g aria-hidden="true"><circle cx="828" cy={y} r="14" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" /><circle cx="828" cy={y} r="6" fill="var(--ink-2)" opacity=".35" /></g>}
              <text x="850" y={compact ? y + 10 : y - 9} className="lbl-strong" style={{ fontSize: compact ? 28 : 13.5 }}>{compact ? `${l.code} ${nf(l.t)} t` : lineName(l.name)}</text>
              {!compact && <text x="850" y={y + 9} style={{ fontSize: 12 }} className="lbl-ink">{mode === 'energia' ? `${nf(l.kwhT, 1)} kWh/t${l.gplT ? ` · ${nf(l.gplT, 2)} kg GPL/t` : ''}` : mode === 'co2' ? `${nf(((l.kwhT || 0) * DEFAULTS.feGrid * (1 - (T.b.coverage || 0)) + (l.gplT || 0) * DEFAULTS.feGpl), 1)} kg CO₂/t` : mode === 'costo' ? `energia ${nf((l.kwhT || 0) * 0.19 + (l.gplT || 0) * 0.98, 2)} €/t` : `${nf(l.t)} t`}</text>}
              {!compact && <text x="850" y={y + 25} style={{ fontSize: 11 }}>{`utilizzo ${nf(Math.min(1.5, l.util) * 100)}%`}</text>}
            </g>
            <path d={paths.fin[i]} className="flow" stroke="var(--maize)" strokeWidth={flow(l.t, maxT)} opacity=".35" />
            {particles(paths.fin[i], Math.max(1, Math.round(3 * l.t / maxT)), dur(l.t) * 0.7)}
          </g>
        );
      })}

      {/* prodotti finiti */}
      <g className="node" onClick={nav('qualita', 'lotti')} tabIndex={compact ? -1 : 0} aria-label="Prodotti finiti">
        <rect className="shape" x="1015" y={Y - 60} width="70" height="120" rx="10" fill="url(#gSilo)" stroke="var(--line-2)" strokeWidth="1.5" />
        <rect x="1025" y={Y + 18} width="50" height="12" rx="2" fill="var(--maize)" opacity=".7" /><rect x="1025" y={Y + 32} width="50" height="12" rx="2" fill="var(--maize)" opacity=".5" />
        {!compact && tl(1050, Y - 76, 'Prodotti finiti', val('costo', `costo pieno ${nf(T.cost.total, 1)} €/t`), 'middle')}
      </g>
      <path d={paths.out} className="flow" stroke="var(--maize)" strokeWidth={flow(T.shipT, T.prod)} opacity=".35" />
      {particles(paths.out, 2, 1.6)}
      {/* clienti */}
      <g className="node" onClick={nav('commerciale', 'clienti')} tabIndex={compact ? -1 : 0} aria-label="Clienti">
        <Truck x={1110} y={Y - 34} flip />
        {tl(compact ? 1125 : 1150, Y + (compact ? 60 : 42), `${T.custN} clienti`, val('materia', `${nf(T.shipT)} t consegnate`) || val('costo', T.price ? `prezzo ${nf(T.price, 1)} · margine ${nf(T.margin, 1)} €/t` : '') || val('co2', `${nf(T.co2ing + (T.b.co2PerT || 0))} kg CO₂e/t in tutto`) || val('energia', `${nf(T.b.energyPerT, 1)} kWh/t in tutto`))}
      </g>
      {!compact && mode === 'co2' && <g><rect x="200" y="505" width="840" height="32" rx="8" fill="var(--surface)" stroke="var(--line)" />
        <text x="220" y="526" className="lbl-ink" style={{ fontSize: 12.5 }}>{`Materie prime ≈ ${nf(T.co2ing)} kg CO₂e/t (fattori indicativi) · vettori energetici ${nf(T.b.co2PerT, 2)} kg CO₂/t · la trasformazione pesa circa il ${nf((T.b.co2PerT || 0) / (T.co2ing + (T.b.co2PerT || 0)) * 100, 1)}% del totale`}</text></g>}
      {!compact && mode === 'costo' && <g><rect x="200" y="505" width="840" height="32" rx="8" fill="var(--surface)" stroke="var(--line)" />
        <text x="220" y="526" className="lbl-ink" style={{ fontSize: 12.5 }}>{`Materie prime ${nf(T.cost.raw, 1)} + trasformazione ${nf(T.cost.proc, 1)} + energia ${nf(T.cost.energy, 1)} + imballo ${nf(T.cost.pack, 1)} + logistica ${nf(T.cost.logi, 1)} = ${nf(T.cost.total, 1)} €/t`}</text></g>}
    </svg>
  );
}

function Truck({ x, y, flip }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? ` translate(80 0) scale(-1 1)` : ''}`} aria-hidden="true">
      <rect className="shape" x="0" y="8" width="52" height="40" rx="5" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.5" />
      <path className="shape" d="M52 20 H68 L78 34 V48 H52 Z" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="1.5" />
      <rect x="6" y="14" width="40" height="8" rx="2" fill="var(--maize)" opacity=".6" />
      <circle cx="16" cy="52" r="7" fill="var(--ink-2)" /><circle cx="64" cy="52" r="7" fill="var(--ink-2)" />
    </g>
  );
}
