/* FeedOS 16 · Sostenibilità: cruscotto ESG (maturità, misure, prossimi passi, KPI richiesti), questionario guidato,
 * registro dell'acqua e registro dei rifiuti. Le risposte e le registrazioni alimentano il registro dei 49 indicatori. */
import React, { useMemo, useState } from 'react';
import {
  LuBuilding2, LuWheat, LuZap, LuCloud, LuDroplets, LuRecycle, LuUsers, LuHardHat, LuBookOpen, LuHeartHandshake, LuLandmark, LuScale,
  LuShield, LuSprout, LuTruck, LuFolder, LuCheck, LuCircleCheck, LuCircleDashed, LuArrowRight, LuChevronLeft, LuChevronRight, LuPlus,
  LuTrash2, LuDownload, LuPrinter, LuSparkles, LuTrophy, LuDatabase, LuWandSparkles, LuTriangleAlert, LuClipboardList, LuFactory,
} from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { go } from '../core/router.js';
import { appToday, esgOverview, kpis, period12 } from '../core/derived.js';
import { nf, sum, dateIt, monthLabel } from '../core/util.js';
import { download, toCSV, stamp } from '../core/io.js';
import { SURVEY_SECTIONS, QUESTION, visible, answered } from '../data/survey.js';
import { EER, EER_BY_CODE, isHazardous, WASTE_OPS, defaultWasteOp } from '../data/eer.js';
import { closedMonths } from '../engine/sustainability.js';
import { esgThresholds } from '../engine/esg-piano.js';
import { ESG_DASHBOARD_CARDS } from './esg-slots.jsx';
import { SlotGuard } from './slots.jsx';
import { Panel, Btn, Table, Chip, Kpi, Field, Select, Empty, Seg, NumInput, confirm, Spark } from '../ui/ui.jsx';
import { printNow } from '../ui/print.jsx';
import { Columns, LineChart, StackBar, Legend } from '../ui/charts.jsx';

const SEC_ICON = { building: LuBuilding2, wheat: LuWheat, zap: LuZap, cloud: LuCloud, droplet: LuDroplets, recycle: LuRecycle, users: LuUsers, helmet: LuHardHat, book: LuBookOpen, heart: LuHeartHandshake, landmark: LuLandmark, scale: LuScale, shield: LuShield, sprout: LuSprout, truck: LuTruck, folder: LuFolder };
const PILLAR = { E: { label: 'Ambiente', color: 'var(--pe)' }, S: { label: 'Sociale', color: 'var(--ps)' }, G: { label: 'Governance', color: 'var(--pg)' } };
const SRC_CHIP = { auto: { kind: 'good', label: 'dai dati', icon: LuDatabase }, questionario: { kind: 'violet', label: 'questionario', icon: LuClipboardList }, manuale: { kind: 'accent', label: 'inserito' }, tesi: { kind: 'maize', label: 'tesi' } };
const SOURCE_COLOR = { Acquedotto: 'var(--s1)', Pozzo: 'var(--s3)', Altro: 'var(--s4)' };
const YN_OPT = [{ id: 'si', label: 'Sì' }, { id: 'no', label: 'No' }];
const fmtN = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : nf(v, d));
const pctTxt = (v, d = 0) => (v == null ? '—' : nf(v * 100, d) + '%');

/** Apre una domanda del questionario: va alla sezione, poi scorre fino alla domanda e la evidenzia. */
export function openQuestion(id) {
  const q = QUESTION[id]; if (!q) return go('esg', 'questionario');
  go('esg', 'questionario', q.section);
  let tries = 0;
  const seek = () => {
    const el = document.getElementById('q-' + id);
    if (!el) { if (++tries < 8) setTimeout(seek, 70); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    el.querySelector('button, input, textarea, select')?.focus({ preventScroll: true });
  };
  setTimeout(seek, 80);
}
const follow = link => (link?.q ? openQuestion(link.q) : link?.tab ? go('esg', link.tab) : null);

/* ================= elementi grafici ================= */
export function Ring({ value, size = 120, stroke = 11, color = 'var(--accent)', label, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-c">{children}</div>
    </div>
  );
}
function Meter({ value, target, color = 'var(--accent)', label }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="meter" role="img" aria-label={label}>
      <i style={{ width: v * 100 + '%', background: color }} />
      {target != null && <b style={{ left: target * 100 + '%' }} title={`obiettivo ${nf(target * 100)}%`} />}
    </span>
  );
}
function Tile({ icon: I, tone, title, value, unit, sub, chip, onClick, children }) {
  return (
    <button type="button" className={`tile t-${tone}`} onClick={onClick}>
      <span className="tile-hd"><span className="tile-ic"><I aria-hidden="true" /></span><span className="tile-tt">{title}</span>{chip}</span>
      <span className="tile-v">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="tile-sub">{sub}</span>}
      {children && <span className="tile-viz">{children}</span>}
    </button>
  );
}

/* ================= cruscotto ================= */
export function Cruscotto({ d }) {
  const o = esgOverview(d);
  const R = kpis(d, period12(d));
  const b = R.energy, W = o.water, S = o.waste, G = o.ghg, a = o.a;
  const pill = id => o.score.pillars.find(p => p.id === id);
  const govItems = o.score.items.filter(x => x.pillar === 'G');
  const K = Object.fromEntries(R.kpis.map(k => [k.code, k]));
  const nextSec = SURVEY_SECTIONS.find(s => o.progress.bySection[s.id].pct < 1);
  const [allSteps, setAllSteps] = useState(false);
  const [grp, setGrp] = useState('');
  const reqDone = o.requested.filter(r => r.value != null).length;
  const th = esgThresholds(d);
  return (
    <>
      <section className="esh-hub" aria-label="Pacchetti ESG">
        {ESG_DASHBOARD_CARDS.map((Card, i) => <SlotGuard key={i}><Card d={d} /></SlotGuard>)}
      </section>
      <section className="esg-hero" id="esg-hero" aria-label="Maturità ESG">
        <div className="hero-score">
          <Ring value={o.score.score} size={148} stroke={13} color="var(--accent)" label={`Maturità ESG ${nf(o.score.score)} su 100`}>
            <b>{nf(o.score.score)}</b><span>su 100</span>
          </Ring>
          <div className="hero-txt">
            <span className="eyebrow">Maturità ESG</span>
            <h2>{o.score.level}</h2>
            <p>{o.score.items.filter(x => x.result === true).length} buone pratiche su {o.score.items.length}, misurate su dati e risposte. {o.steps[0] ? <>Il passo che vale di più: <b>+{nf(o.steps[0].pts)} punti</b>.</> : 'Tutti i criteri sono soddisfatti.'}</p>
          </div>
        </div>
        <div className="hero-pillars">
          {['E', 'S', 'G'].map(id => { const p = pill(id); return (
            <div key={id} className="hp">
              <Ring value={p.score} size={74} stroke={8} color={PILLAR[id].color} label={`${p.label} ${nf(p.score)} su 100`}><b>{nf(p.score)}</b></Ring>
              <span><b>{p.label}</b><small>{p.met} di {p.total} criteri{p.unknown ? ` · ${p.unknown} da rispondere` : ''}</small></span>
            </div>); })}
        </div>
        <div className="hero-cta">
          <div className="row between"><b>Questionario ESG</b><span className="small muted">{o.progress.done} di {o.progress.total} risposte</span></div>
          <Meter value={o.progress.pct} color="var(--accent)" label={`Questionario compilato al ${nf(o.progress.pct * 100)}%`} />
          <div className="row gap-s">
            <Btn kind="primary" icon={LuClipboardList} onClick={() => go('esg', 'questionario', nextSec?.id)}>{o.progress.pct >= 0.999 ? 'Rivedi il questionario' : o.progress.done ? 'Continua il questionario' : 'Inizia il questionario'}</Btn>
            <Btn icon={LuDroplets} onClick={() => go('esg', 'acqua', 'nuova')}>Lettura acqua</Btn>
            <Btn icon={LuRecycle} onClick={() => go('esg', 'rifiuti', 'nuovo')}>Rifiuto</Btn>
          </div>
        </div>
      </section>

      <div className="milestones" aria-label="Traguardi">
        <span className="eyebrow"><LuTrophy aria-hidden="true" /> Traguardi</span>
        {o.milestones.map(m => <span key={m.id} className={`ms ${m.done ? 'done' : ''}`} title={m.hint}>{m.done ? <LuCircleCheck aria-hidden="true" /> : <LuCircleDashed aria-hidden="true" />}{m.label}{!m.done && <small>{m.hint}</small>}</span>)}
      </div>

      <div className="tiles">
        <Tile icon={LuZap} tone="energy" title="Energia" value={fmtN(b.energyPerT, 1)} unit="kWh/t" onClick={() => go('esg', 'energia')}
          sub={<>{nf(b.kwhTotal / 1000)} MWh in 12 mesi · fotovoltaico {pctTxt(b.coverage)} dell’elettricità</>}>
          <Meter value={b.coverage} target={th.pvShare} color="var(--s4)" label="Copertura fotovoltaica" />
        </Tile>
        <Tile icon={LuCloud} tone="co2" title="Emissioni Scope 1-2-3" value={fmtN(G.total)} unit="t CO₂e" onClick={() => go('esg', 'energia')}
          sub={G.shares ? <>il {nf(G.shares.s3 * 100)}% viene dalle materie prime · {fmtN(G.perT)} kg/t</> : 'servono energia e formule'}>
          <span className="scopes">
            <span><i style={{ background: 'var(--s2)' }} />S1 <b>{fmtN(G.scope1)}</b></span>
            <span><i style={{ background: 'var(--s1)' }} />S2 <b>{fmtN(G.scope2)}</b></span>
            <span><i style={{ background: 'var(--s3)' }} />S3 <b>{fmtN(G.scope3)}</b></span>
          </span>
        </Tile>
        <Tile icon={LuDroplets} tone="water" title="Acqua" value={W.nMonths ? fmtN(W.intensity * 1000, 1) : '—'} unit={W.nMonths ? 'litri/t' : ''} onClick={() => go('esg', 'acqua')}
          chip={W.drift > th.waterDrift ? <Chip kind="warn" icon={LuTriangleAlert}>+{nf(W.drift * 100)}%</Chip> : null}
          sub={W.nMonths ? <>{nf(W.m3)} m³ in {W.nMonths} mesi · {Object.keys(W.bySource).join(' e ').toLowerCase()}</> : 'Registra la prima lettura del contatore'}>
          {W.nMonths > 1 && <Spark values={W.months.map(m => (m.perT != null ? m.perT * 1000 : null))} color="var(--s1)" w={140} h={26} />}
        </Tile>
        <Tile icon={LuRecycle} tone="waste" title="Rifiuti" value={S.n ? pctTxt(S.recovery) : '—'} unit={S.n ? 'a recupero' : ''} onClick={() => go('esg', 'rifiuti')}
          sub={S.n ? <>{nf(S.kg / 1000, 1)} t prodotte · {fmtN(S.perT, 2)} kg/t · pericolosi {nf(S.hazKg)} kg</> : 'Registra il primo formulario'}>
          {S.n > 0 && <Meter value={S.recovery} target={th.recovery} color="var(--s3)" label="Quota a recupero" />}
        </Tile>
        <Tile icon={LuUsers} tone="people" title="Persone e sicurezza" value={fmtN(K.S1?.value)} unit={K.S1?.value != null ? 'addetti' : ''} onClick={() => go('esg', 'questionario', 'persone')}
          sub={<>indice di frequenza {fmtN(K.S2?.value, 1)} · formazione {fmtN(K.S4?.value)} h/addetto</>}>
          <span className="mini3"><span><b>{fmtN(numOrNull(a['hs-inj']))}</b>infortuni</span><span><b>{K.S7?.value != null ? nf(K.S7.value) + '%' : '—'}</b>donne resp.</span><span><b>{K.S6?.value != null ? nf(K.S6.value, 1) + '%' : '—'}</b>turnover</span></span>
        </Tile>
        <Tile icon={LuTruck} tone="supply" title="Filiera" value={o.sup.geo ? pctTxt(o.sup.geo.Italia) : '—'} unit={o.sup.geo ? 'acquisti in Italia' : ''} onClick={() => go('esg', 'questionario', 'filiera')}
          sub={<>{o.sup.n} fornitori nei lotti · valutati ESG {K.G11?.value != null ? nf(K.G11.value) + '%' : '—'} · audit {fmtN(K.G6?.value)}</>}>
          {o.sup.geo && <StackBar parts={[{ key: 'it', label: 'Italia', value: o.sup.geo.Italia * 100, color: 'var(--s3)' }, { key: 'ue', label: 'UE', value: o.sup.geo.UE * 100, color: 'var(--s1)' }, { key: 'x', label: 'Extra-UE', value: o.sup.geo['Extra-UE'] * 100, color: 'var(--s2)' }]} height={12} showLabels={false} ariaLabel="Acquisti per provenienza" />}
        </Tile>
        <Tile icon={LuSprout} tone="bio" title="Biodiversità" value={K.E15?.value != null ? nf(K.E15.value) + '%' : '—'} unit="soia senza deforestazione" onClick={() => go('esg', 'questionario', 'biodiversita')}
          sub={<>tracciabilità {a['bd-trace'] ? a['bd-trace'].toLowerCase() : 'da indicare'} · {(a['bd-programs'] || []).filter(x => x !== 'Nessuna iniziativa').length} iniziative</>}>
          <Meter value={(K.E15?.value || 0) / 100} color="var(--s6)" label="Soia certificata" />
        </Tile>
        <Tile icon={LuLandmark} tone="gov" title="Governance" value={`${govItems.filter(x => x.result === true).length}/${govItems.length}`} unit="pratiche" onClick={() => go('esg', 'questionario', 'etica')}
          sub={<>{[a['et-code'] === 'si' && 'Codice Etico', a['et-231'] === 'si' && 'Modello 231', a['gv-esg-lead'] === 'si' && 'responsabile ESG'].filter(Boolean).join(' · ') || 'Codice Etico, 231, responsabile ESG'}</>}>
          <span className="dots">{govItems.map(x => <i key={x.id} className={x.result === true ? 'on' : x.result == null ? 'unk' : ''} title={x.label} />)}</span>
        </Tile>
      </div>

      <div className="split">
        <Panel title="Prossimi passi" sub="Ordinati per punti di maturità guadagnati: ogni passo porta alla domanda o alla scheda giusta" flush id="esg-steps">
          {o.steps.length ? (
            <ol className="steps2">
              {(allSteps ? o.steps : o.steps.slice(0, 6)).map(s => (
                <li key={s.id}>
                  <span className="pdot" style={{ background: PILLAR[s.pillar].color }} title={PILLAR[s.pillar].label} />
                  <span className="st-t"><b>{s.label}</b><span>{s.text}</span></span>
                  <span className="pts">+{nf(s.pts)}</span>
                  <Btn small kind={s.unknown ? 'primary' : ''} icon={s.unknown ? LuClipboardList : LuArrowRight} onClick={() => (s.q ? openQuestion(s.q) : go('esg', s.tab))}>{s.unknown ? 'Rispondi' : 'Apri'}</Btn>
                </li>
              ))}
            </ol>
          ) : <Empty icon={LuTrophy} title="Tutti i criteri sono soddisfatti">Il livello di maturità è il massimo previsto dai criteri.</Empty>}
          {o.steps.length > 6 && <div className="pager"><span>{o.steps.length} passi possibili</span><Btn small kind="ghost" onClick={() => setAllSteps(x => !x)}>{allSteps ? 'Mostra i primi 6' : 'Mostra tutti'}</Btn></div>}
        </Panel>
        <Panel title="Inventario delle emissioni" sub="Ultimi 12 mesi · GHG Protocol: Scope 2 location-based, Scope 3 categoria 1 stimata dalle formule">
          <div className="ghg">
            {[['Scope 1 · combustibili', G.scope1, 'var(--s2)', [['GPL', G.s1Gpl], ['Gas naturale', G.s1Gas], ['Gasolio', G.s1Diesel]].filter(x => x[1] > 0)],
              ['Scope 2 · elettricità di rete', G.scope2, 'var(--s1)', []],
              ['Scope 3 · materie prime acquistate', G.scope3, 'var(--s3)', []]].map(([l, v, c, det]) => (
              <div key={l} className="ghg-r">
                <span className="row between"><span><i className="dot" style={{ background: c }} /> {l}</span><b>{fmtN(v, v < 100 ? 1 : 0)} t CO₂e</b></span>
                <Meter value={G.total ? v / G.total : 0} color={c} label={l} />
                {det.length > 0 && <small className="muted">{det.map(([k, x]) => `${k} ${nf(x, 1)} t`).join(' · ')}</small>}
              </div>
            ))}
          </div>
          <div className="kv" style={{ marginTop: 12 }}>
            <dt>Per tonnellata di mangime</dt><dd>{fmtN(G.perT)} kg CO₂e (stabilimento {fmtN(G.perTOps, 1)})</dd>
            <dt>Scope 1+2 sui ricavi</dt><dd>{fmtN(G.perMEur, 1)} t per milione di euro</dd>
          </div>
          {!(G.gasSmc || G.dieselL) && <p className="small muted" style={{ marginTop: 8 }}>Gas naturale e gasolio dei mezzi non sono indicati: <button className="linkish" onClick={() => openQuestion('en-diesel')}>aggiungili nel questionario</button>.</p>}
        </Panel>
      </div>

      <Panel title="KPI richiesti dal questionario" sub={`${reqDone} di ${o.requested.length} con un valore · in verde dai dati, in viola dalle risposte`} id="esg-req"
        actions={<Seg options={[{ id: '', label: 'Tutti' }, { id: 'manca', label: `Mancanti (${o.requested.length - reqDone})` }]} value={grp} onChange={setGrp} label="Filtro" />}>
        <div className="reqgrid">
          {['Ambiente', 'Sociale', 'Governance', 'Biodiversità', 'Filiera'].map(g => {
            const rows = o.requested.filter(r => r.group === g && (grp !== 'manca' || r.value == null));
            const all = o.requested.filter(r => r.group === g), ok = all.filter(r => r.value != null).length;
            if (!rows.length) return null;
            return (
              <section key={g} className="reqcard" aria-label={g}>
                <header><b>{g}</b><span className={ok === all.length ? 'full' : ''}>{ok}/{all.length}</span></header>
                {rows.map(r => (
                  <button key={r.label} type="button" className={`reqrow ${r.value == null ? 'miss' : ''}`} onClick={() => follow(r.link)} title={r.source ? `Fonte: ${SRC_CHIP[r.source]?.label || r.source}` : 'Da completare'}>
                    <i className={`src-${r.source || 'none'}`} aria-hidden="true" />
                    <span>{r.label}</span>
                    {r.value != null ? <b>{nf(r.value, r.dec)}<small> {r.unit}</small></b> : <em><LuPlus aria-hidden="true" />completa</em>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
const numOrNull = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/* ================= questionario ================= */
const ansText = (q, v) => {
  if (v == null || v === '') return '';
  if (q.type === 'yn') return v === 'si' ? 'Sì' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  if (q.type === 'grid') return Object.entries(v).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k} ${nf(+x)}`).join(', ');
  if (q.type === 'num') return nf(+v, q.plain ? 0 : q.decimals ?? 0, q.plain ? { useGrouping: false } : undefined) + (q.unit ? ' ' + q.unit : '');
  return String(v);
};
const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

function Pills({ options, value, onChange, multi, exclusive, label }) {
  const opts = options.map(o => (typeof o === 'string' ? { id: o, label: o } : o));
  const sel = multi ? value || [] : value;
  const on = id => (multi ? sel.includes(id) : sel === id);
  const toggle = id => {
    if (!multi) return onChange(sel === id ? null : id);
    let next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    if (exclusive && !sel.includes(id)) next = id === exclusive ? [id] : next.filter(x => x !== exclusive);
    onChange(next.length ? next : null);
  };
  return (
    <div className="pills" role="group" aria-label={label}>
      {opts.map(o => <button key={o.id} type="button" className="pill" aria-pressed={on(o.id)} onClick={() => toggle(o.id)}>{on(o.id) && <LuCheck aria-hidden="true" />}{o.label}</button>)}
    </div>
  );
}
function TextAnswer({ value, onSave, placeholder, label }) {
  const [v, setV] = useState(value || '');
  React.useEffect(() => setV(value || ''), [value]);
  return <textarea className="input" rows={2} value={v} placeholder={placeholder} aria-label={label} onChange={e => setV(e.target.value)} onBlur={() => { if ((v || '') !== (value || '')) onSave(v.trim() || null); }} />;
}
function GridAnswer({ q, value, onSave }) {
  const g = value || {};
  const tot = sum(Object.values(g), x => +x || 0);
  return (
    <div className="qgrid">
      {q.rows.map(r => <label key={r}><span>{r}</span><NumInput value={g[r]} decimals={0} min={0} ariaLabel={`${q.q}: ${r}`} onChange={v => { const n = { ...g, [r]: v }; if (v == null) delete n[r]; onSave(Object.keys(n).length ? n : null); }} /></label>)}
      <label className="tot"><span>Totale</span><b>{nf(tot)}</b></label>
    </div>
  );
}

function AutoAnswer({ q, o, R }) {
  const b = R.energy, W = o.water, S = o.waste, G = o.ghg;
  const K = Object.fromEntries(R.kpis.map(k => [k.code, k]));
  const box = (main, sub, tab) => <div className="auto"><LuDatabase aria-hidden="true" /><span><b>{main}</b>{sub && <small>{sub}</small>}</span>{tab && <Btn small kind="ghost" icon={LuArrowRight} onClick={() => go('esg', tab)}>Apri</Btn>}</div>;
  switch (q.auto) {
    case 'revenue': return box(R.revenue ? `${nf(R.revenue)} €` : 'Nessuna consegna registrata', 'ricavi delle consegne degli ultimi 12 mesi');
    case 'energy': return box(`${nf(b.kwhElec)} kWh di elettricità · ${nf(b.gplKg)} kg di GPL`, `rete ${nf(b.kwhGrid)} kWh + fotovoltaico autoconsumato ${nf(b.kwhSelf)} kWh · dalle letture mensili`, 'energia');
    case 'renewablePct': return box(b.coverage != null ? `${nf(b.coverage * 100, 1)}% dell’elettricità` : 'Nessuna lettura', 'fotovoltaico autoconsumato sul consumo elettrico', 'energia');
    case 'ghg': return (
      <div className="auto3">
        {[['Scope 1', G.scope1, 'combustibili'], ['Scope 2', G.scope2, 'elettricità di rete'], ['Scope 3', G.scope3, 'materie prime (stima)']].map(([l, v, s]) => <span key={l}><small>{l}</small><b>{fmtN(v, v < 100 ? 1 : 0)}</b><small>t CO₂e · {s}</small></span>)}
      </div>);
    case 'water': return W.nMonths ? box(`${nf(W.m3)} m³ in ${W.nMonths} mesi`, `${nf(W.intensity * 1000, 1)} litri per tonnellata · ${Object.entries(W.bySource).map(([k, v]) => `${k.toLowerCase()} ${nf(v)} m³`).join(', ')}`, 'acqua') : box('Nessuna lettura registrata', 'Registra le letture mensili del contatore nella scheda Acqua', 'acqua');
    case 'waste': return S.n ? box(`${nf(S.kg)} kg · ${nf(S.recovery * 100)}% a recupero`, `pericolosi ${nf(S.hazKg)} kg · non pericolosi ${nf(S.nonHazKg)} kg · ${S.n} formulari`, 'rifiuti') : box('Nessun rifiuto registrato', 'Riporta i formulari nella scheda Rifiuti', 'rifiuti');
    case 'soyDf': return box(K.E15?.value != null ? `${nf(K.E15.value)}% della soia` : 'Nessuna soia nelle formule', 'dalle formule usate in produzione (indicatore E15)', 'passaporto');
    case 'supplierGeo': return o.sup.geo ? (
      <div className="auto"><LuDatabase aria-hidden="true" /><span style={{ flex: 1 }}>
        <StackBar parts={[{ key: 'it', label: 'Italia', value: o.sup.geo.Italia * 100, color: 'var(--s3)' }, { key: 'ue', label: 'UE', value: o.sup.geo.UE * 100, color: 'var(--s1)' }, { key: 'x', label: 'Extra-UE', value: o.sup.geo['Extra-UE'] * 100, color: 'var(--s2)' }]} height={20} ariaLabel="Acquisti per provenienza" />
        <small>quota in valore dei lotti di materie prime degli ultimi 12 mesi</small></span></div>) : box('Nessun lotto di materia prima', '');
    case 'rawMaterials': return o.raw.length ? (
      <div className="rawlist">{o.raw.slice(0, 8).map(r => <span key={r.id}><b>{r.name}</b><span>{nf(r.t)} t</span><Chip kind="outline">{r.origin}</Chip></span>)}<small className="muted">dalle formule delle produzioni degli ultimi 12 mesi</small></div>) : box('Nessuna produzione registrata', '');
    default: return null;
  }
}

export function Questionario({ d, sec }) {
  const o = esgOverview(d);
  const R = kpis(d, period12(d));
  const a = o.a;
  const [onlyOpen, setOnlyOpen] = useState(false);
  const S = SURVEY_SECTIONS.find(s => s.id === sec) || SURVEY_SECTIONS[0];
  const i = SURVEY_SECTIONS.indexOf(S);
  const prog = o.progress.bySection[S.id];
  const save = (q, v) => store.survey({ [q.id]: v }, `Questionario · ${q.q.slice(0, 70)}: ${ansText(q, v) || 'risposta tolta'}`);
  let n = SURVEY_SECTIONS.slice(0, i).reduce((s, x) => s + x.questions.length, 0);
  const csv = () => download(`questionario-esg-${stamp()}.csv`, toCSV(SURVEY_SECTIONS.flatMap(s => s.questions.filter(q => q.type !== 'auto').map(q => ({ s: s.title, q: q.q, a: ansText(q, a[q.id]) }))), [{ key: 's', label: 'Sezione' }, { key: 'q', label: 'Domanda' }, { key: 'a', label: 'Risposta' }]), 'text/csv;charset=utf-8');
  const Icon = SEC_ICON[S.icon] || LuClipboardList;
  return (
    <>
      <div className="survey-top no-print">
        <div className="st-prog">
          <div className="row between"><b>{nf(o.progress.pct * 100)}% completato</b><span className="small muted">{o.progress.done} di {o.progress.total} risposte · si salva da solo</span></div>
          <Meter value={o.progress.pct} label="Avanzamento del questionario" />
        </div>
        <label className="check small"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Solo domande senza risposta</label>
        <Btn small icon={LuDownload} onClick={csv}>CSV</Btn>
        <Btn small icon={LuPrinter} onClick={printNow}>Stampa</Btn>
      </div>
      <div className="survey no-print">
        <nav className="snav" aria-label="Sezioni del questionario">
          {SURVEY_SECTIONS.map(s => { const p = o.progress.bySection[s.id]; const I = SEC_ICON[s.icon] || LuClipboardList; return (
            <button key={s.id} type="button" aria-current={s.id === S.id ? 'step' : undefined} onClick={() => go('esg', 'questionario', s.id)} className={p.pct >= 0.999 ? 'done' : ''}>
              <span className="sn-ic" style={{ '--pc': PILLAR[s.pillar].color }}><I aria-hidden="true" /></span>
              <span className="sn-t">{s.title}<small>{p.total ? `${p.done}/${p.total}` : 'dai dati'}</small></span>
              {p.pct >= 0.999 ? <LuCircleCheck className="sn-ok" aria-label="completa" /> : <span className="sn-bar"><i style={{ width: p.pct * 100 + '%' }} /></span>}
            </button>); })}
        </nav>
        <section className="panel ssec" aria-label={S.title}>
          <div className="ssec-hd">
            <span className="ssec-ic" style={{ '--pc': PILLAR[S.pillar].color }}><Icon aria-hidden="true" /></span>
            <div style={{ flex: 1, minWidth: 0 }}><span className="eyebrow">Sezione {i + 1} di {SURVEY_SECTIONS.length} · {PILLAR[S.pillar].label}</span><h2>{S.title}</h2><p className="small muted">{S.lead}</p></div>
            {prog.total > 0 && <Ring value={prog.pct * 100} size={56} stroke={6} color={PILLAR[S.pillar].color} label={`${prog.done} di ${prog.total}`}><b className="small">{prog.done}/{prog.total}</b></Ring>}
          </div>
          <div className="qs">
            {S.questions.map(q => {
              n++;
              if (!visible(q, a)) return null;
              const v = a[q.id], done = answered(q, v);
              if (onlyOpen && (done || q.type === 'auto')) return null;
              const sug = q.suggest ? o.suggest[q.suggest] : undefined;
              return (
                <div key={q.id} className={`q ${done ? 'done' : ''} ${q.when ? 'sub' : ''}`} id={'q-' + q.id}>
                  <div className="q-hd">
                    <span className="q-n">{n}</span>
                    <span className="q-t">{q.q}{q.unit && q.type === 'num' && <span className="muted"> ({q.unit})</span>}</span>
                    {q.kpi && <Chip kind="outline" title="Indicatore del registro alimentato da questa risposta">{q.kpi}</Chip>}
                    {q.type === 'auto' ? <Chip kind="good" icon={LuDatabase}>dai dati</Chip> : done ? <LuCircleCheck className="q-ok" aria-label="risposta data" /> : null}
                  </div>
                  <div className="q-in">
                    {q.type === 'yn' && <Pills options={YN_OPT} value={v} onChange={x => save(q, x)} label={q.q} />}
                    {q.type === 'one' && <Pills options={q.options} value={v} onChange={x => save(q, x)} label={q.q} />}
                    {q.type === 'many' && <Pills options={q.options} value={v} multi exclusive={q.exclusive} onChange={x => save(q, x)} label={q.q} />}
                    {q.type === 'num' && <span className="qnum"><NumInput value={v} decimals={q.decimals ?? 0} min={0} onChange={x => save(q, x)} ariaLabel={q.q} placeholder="—" />{q.unit && <span className="muted small">{q.unit}</span>}</span>}
                    {q.type === 'text' && <TextAnswer value={v} placeholder={q.placeholder} label={q.q} onSave={x => save(q, x)} />}
                    {q.type === 'grid' && <GridAnswer q={q} value={v} onSave={x => save(q, x)} />}
                    {q.type === 'auto' && <AutoAnswer q={q} o={o} R={R} />}
                  </div>
                  {sug != null && !same(sug, v) && (
                    <button type="button" className="suggest" onClick={() => save(q, sug)}><LuWandSparkles aria-hidden="true" /> Dai dati di FeedOS: <b>{ansText(q, sug)}</b> · usa questo valore</button>
                  )}
                  {q.hint && <small className="q-hint">{q.hint}</small>}
                </div>
              );
            })}
            {onlyOpen && prog.done >= prog.total && <Empty icon={LuCircleCheck} title="Sezione completa">Tutte le domande di questa sezione hanno una risposta.</Empty>}
          </div>
          <div className="ssec-ft">
            <Btn icon={LuChevronLeft} disabled={i === 0} onClick={() => go('esg', 'questionario', SURVEY_SECTIONS[i - 1]?.id)}>Indietro</Btn>
            <span className="small muted">{prog.total ? `${prog.done} di ${prog.total} risposte in questa sezione` : 'Valori calcolati dai dati'}</span>
            {i < SURVEY_SECTIONS.length - 1
              ? <Btn kind="primary" onClick={() => go('esg', 'questionario', SURVEY_SECTIONS[i + 1].id)}>{SURVEY_SECTIONS[i + 1].title}<LuChevronRight aria-hidden="true" /></Btn>
              : <Btn kind="primary" icon={LuSparkles} onClick={() => go('esg', 'cruscotto')}>Vai al cruscotto</Btn>}
          </div>
        </section>
      </div>
      <div className="survey-print">
        <h2>Questionario ESG · {d.settings?.company?.name}</h2>
        <p className="small">Compilato con FeedOS il {dateIt(appToday(d))}. Valori calcolati dai dati degli ultimi 12 mesi dove indicato.</p>
        {SURVEY_SECTIONS.map(s => (
          <section key={s.id}><h3>{s.title}</h3>
            <dl>{s.questions.filter(q => visible(q, a)).map(q => <React.Fragment key={q.id}><dt>{q.q}</dt><dd>{q.type === 'auto' ? <AutoAnswer q={q} o={o} R={R} /> : ansText(q, a[q.id]) || '—'}</dd></React.Fragment>)}</dl>
          </section>
        ))}
      </div>
    </>
  );
}

/* ================= acqua ================= */
export function Acqua({ d, nuova }) {
  const today = appToday(d);
  const R = kpis(d, period12(d));
  const W = R.water;
  const a = d.survey || {};
  const closed = closedMonths(today, 12);
  const firstFree = src => [...closed].reverse().find(m => !d.water.some(w => w.month === m && w.source === src)) || closed[closed.length - 1];
  const [f, setF] = useState(() => ({ month: firstFree('Acquedotto'), source: 'Acquedotto', reading: null, m3: null, note: '' }));
  const prev = d.water.filter(w => w.source === f.source && w.month < f.month && w.reading != null).sort((x, y) => (x.month < y.month ? 1 : -1))[0];
  const set = p => setF(x => ({ ...x, ...p }));
  const onReading = v => set({ reading: v, ...(v != null && prev && v >= prev.reading ? { m3: Math.round((v - prev.reading) * 10) / 10 } : {}) });
  const submit = () => {
    if (!/^\d{4}-\d{2}$/.test(f.month || '')) return toast('Indica il mese della lettura', 'err');
    if (f.month > today.slice(0, 7)) return toast('Il mese della lettura non può essere nel futuro', 'err');
    if (!(f.m3 > 0)) return toast('Indica i metri cubi consumati nel mese', 'err');
    const obj = { month: f.month, source: f.source, m3: f.m3, reading: f.reading, note: f.note };
    const ex = d.water.find(w => w.month === f.month && w.source === f.source);
    const after = () => { toast(`Lettura di ${monthLabel(f.month, false)} registrata: ${nf(f.m3)} m³`, 'ok', { label: 'Annulla', fn: () => store.undo() }); setF({ month: firstFree(f.source), source: f.source, reading: null, m3: null, note: '' }); };
    if (ex) confirm('Sostituire la lettura esistente?', <p>Per {monthLabel(f.month, false)} ({f.source.toLowerCase()}) è già registrato un consumo di {nf(ex.m3)} m³.</p>, () => { store.update('water', ex.id, obj, `Acqua ${f.month} ${f.source}: ${nf(f.m3)} m³`); after(); }, { ok: 'Sostituisci' });
    else { store.add('water', obj, `Acqua ${f.month} ${f.source}: ${nf(f.m3)} m³`); after(); }
  };
  const remove = w => { store.remove('water', w.id, `Lettura dell’acqua eliminata: ${w.month} ${w.source}`); toast('Lettura eliminata', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const sources = Object.keys(W.bySource);
  const top = Object.entries(W.bySource).sort((x, y) => y[1] - x[1])[0];
  const mByM = Object.fromEntries(W.months.map(m => [m.month, m]));
  const rows = [...d.water].sort((x, y) => (x.month < y.month ? 1 : x.month > y.month ? -1 : x.source < y.source ? -1 : 1));
  const avg = W.intensity != null ? W.intensity * 1000 : null;
  const drift = esgThresholds(d).waterDrift;
  return (
    <>
      <div className="kpis">
        <Kpi label="Prelievo idrico (12 mesi)" value={W.nMonths ? nf(W.m3) : '—'} unit="m³" foot={`${closed.filter(m => W.months.some(x => x.month === m)).length} mesi chiusi registrati su ${closed.length}`} />
        <Kpi label="Acqua per tonnellata" value={avg != null ? nf(avg, 1) : '—'} unit="litri/t" delta={W.drift != null ? W.drift * 100 : null} deltaGood={W.drift != null ? W.drift <= 0 : null} foot="ultimi 3 mesi" spark={W.months.map(m => (m.perT != null ? m.perT * 1000 : null))} sparkColor="var(--s1)" />
        <Kpi label="Fonte principale" value={top ? top[0] : '—'} foot={top ? `${nf(top[1] / W.m3 * 100)}% del prelievo` : 'nessuna lettura'} />
        <Kpi label="Scarichi monitorati" value={a['wa-disch'] === 'si' ? 'Sì' : a['wa-disch'] === 'no' ? 'No' : '—'} foot="dal questionario" onClick={() => openQuestion('wa-disch')} />
      </div>
      {W.drift > drift && <div className="note crit"><b>Acqua per tonnellata +{nf(W.drift * 100)}% negli ultimi 3 mesi</b> ({nf(W.recent * 1000, 1)} contro {nf(W.before * 1000, 1)} litri/t). {Object.entries(W.sourceDrift).filter(([, x]) => x > drift).map(([k, x]) => `${k}: +${nf(x * 100)}%. `).join('')}A parità di produzione, un aumento così indica di solito una perdita o un reintegro anomalo della caldaia.</div>}
      <div className="split r">
        <Panel title="Registra una lettura" sub="Basta il consumo del mese; con la lettura del contatore il consumo si calcola da solo" id="esg-water-form" className={nuova ? 'hilite' : ''}>
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Fonte"><Seg options={['Acquedotto', 'Pozzo', 'Altro'].map(x => ({ id: x, label: x }))} value={f.source} onChange={s => set({ source: s, month: firstFree(s), reading: null, m3: null })} label="Fonte" /></Field>
            <div className="form">
              <Field label="Mese"><input className="input" type="month" value={f.month} max={today.slice(0, 7)} onChange={e => set({ month: e.target.value })} /></Field>
              <Field label="Lettura del contatore (m³)" hint={prev ? `precedente ${nf(prev.reading)} (${monthLabel(prev.month)})` : 'facoltativa'}><NumInput value={f.reading} decimals={1} min={0} onChange={onReading} ariaLabel="Lettura del contatore" /></Field>
              <Field label="Consumo del mese (m³)"><NumInput value={f.m3} decimals={1} min={0} onChange={v => set({ m3: v })} ariaLabel="Consumo del mese" /></Field>
            </div>
            <Field label="Nota"><input className="input" value={f.note} onChange={e => set({ note: e.target.value })} placeholder="Es. sostituito il contatore" /></Field>
            <div className="row between">
              <span className="small muted">{f.m3 > 0 && mByM[f.month]?.tonnes && !mByM[f.month].partial ? `${nf(f.m3 * 1000 / mByM[f.month].tonnes, 1)} litri per tonnellata prodotta nel mese` : ''}</span>
              <Btn kind="primary" icon={LuPlus} onClick={submit}>Registra</Btn>
            </div>
          </div>
        </Panel>
        <Panel title="Mese per mese" sub="Metri cubi prelevati per fonte e litri per tonnellata di mangime prodotto">
          {W.nMonths ? (
            <>
              <Columns cols={W.months.map(m => ({ label: monthLabel(m.month), parts: sources.map(s => ({ key: s, value: m.bySource[s] || 0 })) }))} keys={sources.map(s => ({ key: s, label: s, color: SOURCE_COLOR[s] || 'var(--s5)' }))} unit="m³" height={190} ariaLabel="Prelievo idrico mensile" />
              <Legend items={sources.map(s => ({ label: s, color: SOURCE_COLOR[s] || 'var(--s5)' }))} />
              <div style={{ marginTop: 12 }}>
                <LineChart labels={W.months.map(m => monthLabel(m.month))} height={150} unit="L/t" decimals={1} series={[{ key: 'l', label: 'Litri per tonnellata', color: 'var(--s1)', values: W.months.map(m => (m.perT != null ? m.perT * 1000 : null)) }]} refs={avg != null ? [{ y: avg, label: `media ${nf(avg, 1)}`, kind: 'muted' }] : []} ariaLabel="Litri per tonnellata" />
                {W.partial.length > 0 && <p className="small muted" style={{ margin: '6px 0 0' }}>{W.partial.map(m => monthLabel(m, false)).join(', ')}: produzione registrata solo per una parte del mese, quindi niente litri per tonnellata; la lettura del contatore resta nel prelievo.</p>}
              </div>
            </>
          ) : <Empty icon={LuDroplets} title="Ancora nessuna lettura">Registra il consumo dell’ultimo mese: da lì nascono il prelievo idrico (E9) e i litri per tonnellata.</Empty>}
        </Panel>
      </div>
      <Panel title="Registro delle letture" sub="Una riga per mese e fonte · si annulla con Ctrl Z" flush>
        <Table rows={rows} pageSize={24} exportName="acqua-letture" cols={[
          { key: 'month', label: 'Mese', csv: w => w.month, render: w => <b>{monthLabel(w.month, false)}</b> },
          { key: 'source', label: 'Fonte', render: w => <span className="row gap-s"><i className="dot" style={{ background: SOURCE_COLOR[w.source] || 'var(--s5)' }} />{w.source}</span> },
          { key: 'reading', label: 'Lettura', align: 'r', render: w => (w.reading != null ? nf(w.reading) : '—') },
          { key: 'm3', label: 'Consumo m³', align: 'r', render: w => <b>{nf(w.m3)}</b> },
          { key: 'lt', label: 'Litri/t del mese', align: 'r', sort: w => mByM[w.month]?.perT ?? null, csv: w => (mByM[w.month]?.perT != null ? mByM[w.month].perT * 1000 : null), render: w => (mByM[w.month]?.perT != null ? nf(mByM[w.month].perT * 1000, 1) : <span className="muted" title={mByM[w.month]?.partial ? 'Produzione registrata solo per una parte del mese' : undefined}>—</span>) },
          { key: 'note', label: 'Nota', render: w => <span className="small muted">{w.note}</span> },
          { key: 'x', label: '', nosort: true, align: 'r', csv: false, render: w => <Btn small kind="ghost" icon={LuTrash2} title="Elimina la lettura" onClick={() => remove(w)} /> },
        ]} empty="Nessuna lettura registrata" />
      </Panel>
    </>
  );
}

/* ================= rifiuti ================= */
export function Rifiuti({ d, nuovo }) {
  const today = appToday(d);
  const R = kpis(d, period12(d));
  const S = R.waste;
  const [f, setF] = useState({ date: today, eer: '15 01 01', code: '', name: '', kg: null, dest: 'recupero', op: 'R13', fir: '', note: '' });
  const ops = WASTE_OPS.filter(o => o.dest === f.dest);
  const set = p => setF(x => ({ ...x, ...p }));
  const custom = f.eer === 'altro';
  const code = custom ? f.code.trim() : f.eer;
  const haz = isHazardous(code);
  const submit = () => {
    if (!code) return toast('Indica il codice EER', 'err');
    if (f.date > today) return toast('La data non può essere nel futuro', 'err');
    if (!(f.kg > 0)) return toast('Indica i chilogrammi', 'err');
    const name = custom ? (f.name.trim() || 'Rifiuto') : EER_BY_CODE[code]?.name;
    const op = ops.some(o => o.code === f.op) ? f.op : defaultWasteOp(f.dest);
    store.add('waste', { date: f.date || today, eer: code, name, kg: f.kg, hazardous: haz, dest: f.dest, op, fir: f.fir.trim(), note: f.note.trim() }, `Rifiuto ${code}: ${nf(f.kg)} kg a ${f.dest} (${op})`);
    toast(`Registrati ${nf(f.kg)} kg di ${name.toLowerCase()}`, 'ok', { label: 'Annulla', fn: () => store.undo() });
    set({ kg: null, fir: '', note: '' });
  };
  const remove = w => { store.remove('waste', w.id, `Rifiuto eliminato: ${w.eer} ${nf(w.kg)} kg`); toast('Registrazione eliminata', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const ifAll = S.kg ? (S.recKg + S.missedKg) / S.kg : null;
  const maxKg = Math.max(1, ...S.byCode.map(c => c.kg));
  const rows = [...d.waste].sort((x, y) => (x.date < y.date ? 1 : -1));
  return (
    <>
      <div className="kpis">
        <Kpi label="Rifiuti prodotti (12 mesi)" value={S.n ? nf(S.kg / 1000, 1) : '—'} unit="t" foot={`${S.n} formulari`} />
        <Kpi label="Avviati a recupero" value={S.recovery != null ? nf(S.recovery * 100, 1) : '—'} unit="%" foot={`${nf(S.recKg)} kg con operazioni R`} />
        <Kpi label="Rifiuti pericolosi" value={S.n ? nf(S.hazKg) : '—'} unit="kg" foot={S.hazShare != null ? `${nf(S.hazShare * 100, 1)}% del totale` : ''} />
        <Kpi label="Rifiuti per tonnellata" value={S.perT != null && S.n ? nf(S.perT, 2) : '—'} unit="kg/t" foot={`${nf(S.tonnes)} t prodotte`} />
        <Kpi label="Scarti di produzione" value={nf(S.scrapT, 1)} unit="t" foot={S.scrapShare != null ? `${nf(S.scrapShare * 100, 2)}% della produzione · dalle registrazioni` : ''} onClick={() => go('produzione', 'registro')} />
      </div>
      {S.missedKg >= 200 && <div className="note maize"><b>{nf(S.missedKg)} kg di rifiuti di norma recuperabili sono andati a smaltimento</b> ({S.missed.slice(0, 2).map(c => `${c.name.toLowerCase()}, EER ${c.code}`).join('; ')}). Separandoli alla fonte il recupero passerebbe dal {nf(S.recovery * 100)}% al {nf(ifAll * 100)}%.</div>}
      <div className="split r">
        <Panel title="Registra un rifiuto" sub="Dal formulario: codice EER, chilogrammi e destinazione" id="esg-waste-form" className={nuovo ? 'hilite' : ''}>
          <div className="stack" style={{ gap: 12 }}>
            <Field label="Codice EER"><Select value={f.eer} onChange={v => { const dest = v === 'altro' || EER_BY_CODE[v]?.recoverable ? 'recupero' : 'smaltimento'; set({ eer: v, dest, op: defaultWasteOp(dest) }); }} options={[...EER.map(e => ({ id: e.code, label: `${e.code} · ${e.name}` })), { id: 'altro', label: 'Altro codice…' }]} ariaLabel="Codice EER" /></Field>
            {custom && <div className="form"><Field label="Codice" hint="con * se pericoloso"><input className="input" value={f.code} onChange={e => set({ code: e.target.value })} placeholder="es. 16 01 07*" /></Field><Field label="Descrizione"><input className="input" value={f.name} onChange={e => set({ name: e.target.value })} /></Field></div>}
            <div className="row gap-s">{haz ? <Chip kind="crit" icon={LuTriangleAlert}>Pericoloso</Chip> : <Chip kind="good">Non pericoloso</Chip>}{!custom && EER_BY_CODE[f.eer]?.hint && <span className="small muted">{EER_BY_CODE[f.eer].hint}</span>}</div>
            <div className="form">
              <Field label="Data"><input className="input" type="date" value={f.date} max={today} onChange={e => set({ date: e.target.value })} /></Field>
              <Field label="Quantità (kg)"><NumInput value={f.kg} decimals={0} min={0} onChange={v => set({ kg: v })} ariaLabel="Quantità in kg" /></Field>
              <Field label="N. formulario"><input className="input" value={f.fir} onChange={e => set({ fir: e.target.value })} placeholder="FIR …" /></Field>
            </div>
            <Field label="Destinazione"><Seg options={[{ id: 'recupero', label: 'Recupero (R)' }, { id: 'smaltimento', label: 'Smaltimento (D)' }]} value={f.dest} onChange={v => set({ dest: v, op: defaultWasteOp(v) })} label="Destinazione" /></Field>
            <Field label="Operazione dichiarata nel formulario"><Select value={f.op} onChange={v => set({ op: v })} options={ops.map(o => ({ id: o.code, label: `${o.code} · ${o.label}` }))} ariaLabel="Operazione di recupero o smaltimento" /></Field>
            <div className="row between"><span className="small muted">Resta nel registro delle modifiche e si annulla con Ctrl Z.</span><Btn kind="primary" icon={LuPlus} onClick={submit}>Registra</Btn></div>
          </div>
        </Panel>
        <Panel title="Per codice EER" sub="Chilogrammi negli ultimi 12 mesi · in verde la parte a recupero">
          {S.n ? (
            <div className="eerlist">
              {S.byCode.map(c => (
                <div key={c.code} className="eer">
                  <span className={`code ${c.hazardous ? 'haz' : ''}`}>{c.code}</span>
                  <span className="eer-n" title={c.name}>{c.name}</span>
                  <b>{nf(c.kg)} kg</b>
                  <span className="eer-bar" style={{ width: Math.max(4, c.kg / maxKg * 100) + '%' }}><i style={{ width: c.recKg / c.kg * 100 + '%' }} /></span>
                </div>
              ))}
              <div className="row between small muted" style={{ marginTop: 6 }}><Legend items={[{ label: 'Recupero', color: 'var(--s3)' }, { label: 'Smaltimento', color: 'var(--surface-3)' }]} /><span>{S.recovery != null ? `${nf(S.recovery * 100)}% a recupero` : ''}</span></div>
            </div>
          ) : <Empty icon={LuRecycle} title="Ancora nessun rifiuto registrato">Riporta i formulari dell’ultimo trimestre: bastano codice EER, chilogrammi e destinazione.</Empty>}
        </Panel>
      </div>
      <Panel title="Registro dei rifiuti" sub="Le registrazioni alimentano E10 (rifiuti prodotti) ed E11 (quota a recupero)" flush>
        <Table rows={rows} pageSize={25} exportName="rifiuti-registro" cols={[
          { key: 'date', label: 'Data', csv: w => w.date, render: w => dateIt(w.date) },
          { key: 'eer', label: 'EER', render: w => <span className={`code ${w.hazardous ? 'haz' : ''}`}>{w.eer}</span> },
          { key: 'name', label: 'Rifiuto', render: w => <><b>{w.name}</b>{w.note && <span className="sub">{w.note}</span>}</> },
          { key: 'kg', label: 'kg', align: 'r', render: w => <b>{nf(w.kg)}</b> },
          { key: 'op', label: 'Operazione', csvOnly: true, csv: w => w.op || '' },
          { key: 'haz', label: 'Pericoloso', csvOnly: true, csv: w => (w.hazardous ?? isHazardous(w.eer)) },
          { key: 'dest', label: 'Destinazione', render: w => <Chip kind={w.dest === 'recupero' ? 'good' : ''} icon={w.dest === 'recupero' ? LuRecycle : LuFactory}>{w.dest}{w.op ? ` · ${w.op}` : ''}</Chip> },
          { key: 'fir', label: 'Formulario', render: w => <span className="small mono">{w.fir}</span> },
          { key: 'x', label: '', nosort: true, align: 'r', csv: false, render: w => <Btn small kind="ghost" icon={LuTrash2} title="Elimina la registrazione" onClick={() => remove(w)} /> },
        ]} empty="Nessun rifiuto registrato" />
      </Panel>
    </>
  );
}

