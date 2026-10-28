/* FeedOS 17 · guscio dell'applicazione: menu per reparto, barra comandi, periodo globale, ruoli, tema, annulla/ripeti,
 * avvisi di archivio (sola lettura, errore di apertura, altra scheda aperta). */
import React, { useEffect, useMemo, useState } from 'react';
import { LuSearch, LuUndo2, LuRedo2, LuSun, LuMoon, LuMonitor, LuPresentation, LuMenu, LuLock, LuTriangleAlert, LuCircleAlert, LuX, LuUserRound } from 'react-icons/lu';
import { useStore, useData, uiStore, store, toast } from '../core/store.js';
import { usePrefs, setPrefs } from '../core/prefs.js';
import { useRoute, go } from '../core/router.js';
import { ROLES, ROLE, AGENT_HIDDEN } from '../core/roles.js';
import { signals } from '../core/derived.js';
import { dateIt } from '../core/util.js';
import { NAV } from './nav.js';
import { AREA } from './areas.js';
import { Modal, Toasts, Btn, Drawer, Panel, Empty, Select } from '../ui/ui.jsx';
import { PeriodBar } from '../ui/period.jsx';
import { Palette } from './Palette.jsx';
import { Tour } from './Tour.jsx';
import { DrawerHost } from '../modules/drawers.jsx';
import { DqBadge } from '../modules/slots.jsx';
import { Oggi } from '../modules/oggi.jsx';
import { Direzione } from '../modules/direzione.jsx';
import { Finanza } from '../modules/finanza.jsx';
import { Gemello } from '../modules/gemello.jsx';
import { Formulazione } from '../modules/formulazione.jsx';
import { Acquisti } from '../modules/acquisti.jsx';
import { Produzione } from '../modules/produzione.jsx';
import { Qualita } from '../modules/qualita.jsx';
import { Commerciale } from '../modules/commerciale.jsx';
import { Economia } from '../modules/economia.jsx';
import { Esg } from '../modules/esg.jsx';
import { Dati } from '../modules/dati.jsx';
import { PageHead } from '../ui/ui.jsx';
import { META } from '../editions/meta.js';
import { PAGES as EDITION_PAGES, TAB_PAGES } from '../editions/app.js';

const PAGES = { oggi: Oggi, direzione: Direzione, finanza: Finanza, gemello: Gemello, formulazione: Formulazione, acquisti: Acquisti, produzione: Produzione, qualita: Qualita, commerciale: Commerciale, economia: Economia, esg: Esg, dati: Dati, ...EDITION_PAGES };
/** Nome e versione mostrati: quelli dell'edizione (DifesaOS 1.0) o di FeedOS con la versione dell'app. */
const PRODUCT_VERSION = META.version || VERSION;
import { VERSION } from './version.js';
export { VERSION };

/** Tema impostato dalla pagina ospite prima dell'avvio (data-theme sulla radice), da rispettare con il tema «automatico». */
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

export function App() {
  const ready = useStore(s => s.ready);
  const d = useData();
  const route = useRoute();
  const role = ROLE[usePrefs(p => p.role)] || ROLE.direzione;
  const theme = usePrefs(p => p.theme) || 'auto';
  const size = usePrefs(p => p.size) || 'normale';

  useEffect(() => {
    const el = document.documentElement;
    // «automatico» rispetta il tema scelto dalla pagina che ospita l'app (un visore che imposta data-theme), altrimenti quello del sistema
    if (theme === 'auto') { if (HOST_THEME) el.setAttribute('data-theme', HOST_THEME); else el.removeAttribute('data-theme'); } else el.setAttribute('data-theme', theme);
    if (size === 'aula') el.setAttribute('data-size', 'aula'); else el.removeAttribute('data-size');
  }, [theme, size]);

  useEffect(() => {
    const onKey = e => {
      const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); uiStore.set({ palette: true }); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); const l = store.undo(); if (l) toast('Annullato: ' + l); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); const l = store.redo(); if (l) toast('Ripristinato: ' + l); return; }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); uiStore.set({ palette: true }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { document.title = `${NAV[route.area]?.label || META.product} · ${META.product} ${META.version || VERSION.split('.')[0]}`; }, [route.area]);

  if (!ready) return <div className="content"><p className="muted">Apertura dell’archivio…</p></div>;
  const blocked = role.id === 'agente' && AGENT_HIDDEN.includes(route.area);
  // scheda in più dell'edizione dentro un'area esistente (es. Commerciale › Campagne in DifesaOS): testata dell'area + pagina della scheda
  const TabPage = TAB_PAGES[`${route.area}.${route.tab}`];
  const Page = TabPage ? EditionTab : (NAV[route.area] && PAGES[route.area]) || Oggi; // aree di un'altra edizione: Oggi
  // una scheda nascosta in questa edizione (indirizzo vecchio o scritto a mano) apre la prima scheda dell'area
  const tabs = NAV[route.area]?.tabs || [];
  const page = route.tab && !TabPage && tabs.length && (META.hiddenTabs?.[route.area] || []).includes(route.tab) ? { ...route, tab: tabs[0].id, id: null } : route;
  return (
    <div className="app">
      <SkipLink />
      <Sidebar d={d} route={route} role={role} />
      <div className="main">
        <Topbar d={d} route={route} role={role} theme={theme} />
        <Banners />
        <main className="content" id="contenuto" tabIndex={-1}>
          <Guard key={route.area + '.' + (route.tab || '') + '.' + (route.id || '')}>{blocked ? <NotForRole area={route.area} /> : <Page route={page} />}</Guard>
        </main>
      </div>
      <MobileNav d={d} route={route} role={role} />
      <DrawerHost />
      <Palette />
      <Tour />
      <Modal />
      <Toasts />
    </div>
  );
}

/** Scheda in più dell'edizione: la testata dell'area con tutte le sue schede, poi la pagina della scheda. */
function EditionTab({ route }) {
  const d = useData();
  const A = AREA[route.area], Comp = TAB_PAGES[`${route.area}.${route.tab}`];
  return (
    <>
      <PageHead title={A?.label} lead={A?.lead} tabs={NAV[route.area]?.tabs || []} tab={route.tab} onTab={t => go(route.area, t)} />
      <Comp d={d} route={route} />
    </>
  );
}

/** Collegamento «salta al contenuto» per tastiera e lettori di schermo (non cambia l'ancora dell'indirizzo). */
function SkipLink() {
  const jump = e => { e.preventDefault(); const el = document.getElementById('contenuto'); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'start' }); } };
  return <a className="skip" href="#contenuto" onClick={jump}>Vai al contenuto</a>;
}

/** Un errore in una pagina non deve fermare tutta l'applicazione: si mostra un avviso e si può tornare indietro. */
class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.warn('FeedOS: errore nella pagina', err, info?.componentStack?.slice(0, 400)); } catch { /* ignora */ } }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel guard-err" style={{ padding: 24, display: 'grid', gap: 8 }} role="alert">
        <h1 style={{ font: '600 32px/1 var(--f-display)' }}>Questa pagina non si è aperta</h1>
        <p className="muted">Probabilmente mancano dei dati che la pagina si aspetta (per esempio un archivio appena creato). I dati salvati non sono stati toccati.</p>
        <p className="small mono">{String(this.state.err?.message || this.state.err).slice(0, 200)}</p>
        <div className="row"><Btn kind="primary" onClick={() => go('oggi')}>Torna a Oggi</Btn><Btn onClick={() => this.setState({ err: null })}>Riprova</Btn></div>
      </div>
    );
  }
}

/** Indirizzo diretto a un'area che la vista corrente non prevede (Agente: direzione, finanza, economia). */
function NotForRole({ area }) {
  return (
    <>
      <header className="ph"><div className="ph-row"><div><h1>{NAV[area]?.label}</h1></div></div></header>
      <Panel>
        <Empty icon={LuLock} title="Area non prevista per la vista Agente">
          <p>La vista Agente mostra clienti, offerte, visite e qualità del proprio portafoglio. Per i numeri di direzione, finanza ed economia scegli un’altra vista.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Btn kind="primary" onClick={() => go('oggi')}>Torna a Oggi</Btn>
            <Btn onClick={() => { setPrefs({ role: 'direzione' }); toast('Vista: ' + ROLE.direzione.label); }}>Passa alla vista Direzione</Btn>
          </div>
        </Empty>
      </Panel>
    </>
  );
}

/** Avvisi sull'archivio: sola lettura, errore di apertura, altra scheda aperta, anomalie di struttura. */
function Banners() {
  const readOnly = useStore(s => s.readOnly), loadError = useStore(s => s.loadError), otherTab = useStore(s => s.otherTab), shape = useStore(s => s.shapeErrors);
  const [hide, setHide] = useState({});
  const out = [];
  if (loadError) out.push({ id: 'load', kind: 'crit', icon: LuCircleAlert, title: loadError, text: 'Le modifiche di questa sessione non vengono salvate. Da Dati › Archivio puoi esportare un backup prima di continuare.' });
  else if (readOnly) out.push({ id: 'ro', kind: 'crit', icon: LuLock, title: 'Sola lettura', text: 'Le modifiche di questa sessione non vengono salvate.' });
  if (otherTab && !readOnly) out.push({ id: 'tab', kind: 'warn', icon: LuTriangleAlert, title: 'FeedOS è aperto anche in un’altra scheda', text: 'Lavora in una scheda sola: le modifiche fatte in una possono sovrascrivere quelle dell’altra.', close: true });
  if (shape?.length) out.push({ id: 'shape', kind: 'warn', icon: LuTriangleAlert, title: `L’archivio contiene ${shape.length} anomalie di struttura`, text: shape.slice(0, 3).join(' · ') + (shape.length > 3 ? ' …' : ''), close: true });
  const view = out.filter(b => !hide[b.id]);
  if (!view.length) return null;
  return (
    <div className="banners no-print">
      {view.map(b => { const I = b.icon; return (
        <div key={b.id} className={`banner ${b.kind}`} role={b.kind === 'crit' ? 'alert' : 'status'}>
          <I aria-hidden="true" /><span><b>{b.title}</b> {b.text}</span>
          {b.close && <Btn kind="ghost" small icon={LuX} title="Chiudi l’avviso" onClick={() => setHide(h => ({ ...h, [b.id]: true }))} />}
        </div>); })}
    </div>
  );
}

function useCounts(d) {
  const list = signals(d);
  return useMemo(() => {
    const c = {};
    for (const s of list) if (s.severity !== 'info') c[s.area] = (c[s.area] || 0) + 1;
    c.oggi = list.filter(s => s.severity === 'critico').length;
    return c;
  }, [list]);
}

function Sidebar({ d, route, role }) {
  const counts = useCounts(d);
  const saving = useStore(s => s.saving), mode = useStore(s => s.saveMode), readOnly = useStore(s => s.readOnly);
  const demo = d.settings?.dataset === 'demo';
  const top = role.top || 2;
  return (
    <aside className="side" aria-label="Menu principale">
      <button className="brand" onClick={() => go('oggi')} title="Vai a Oggi">
        <span className="mark" aria-hidden="true">F</span>
        <span><b>{META.product}</b><small>{d.settings?.company?.short || META.companyFallback} · {PRODUCT_VERSION}</small></span>
      </button>
      {demo ? (
        <div className="dataset demo" title="I dati sono inventati e generati dall’app: non rappresentano un’impresa reale.">
          <b>Dati dimostrativi</b><span>{META.labels?.demoCompany || 'Azienda di fantasia'} · al {dateIt(d.settings.demoAnchor)}</span>
        </div>
      ) : d.settings?.dataset === 'vuoto' ? (
        <div className="dataset"><b>Archivio vuoto</b><span>Inserisci i tuoi dati o carica la demo da «Dati».</span></div>
      ) : null}
      <nav className="nav" aria-label="Aree">
        {role.areas.map((a, i) => {
          const N = NAV[a]; if (!N) return null; const I = N.icon;
          return (
            <React.Fragment key={a}>
              {i === top && <div className="grp eyebrow">Reparti</div>}
              <a href={'#' + a} aria-current={route.area === a ? 'page' : undefined} title={N.label}>
                <I aria-hidden="true" /><span>{N.label}</span>
                {counts[a] ? <span className={`count ${a === 'oggi' ? '' : 'soft'}`} aria-label={`${counts[a]} segnalazioni`}>{counts[a]}</span> : null}
              </a>
            </React.Fragment>
          );
        })}
      </nav>
      <div className="side-foot">
        <div className="side-state">
          <div className={`savestate ${saving === 'pending' ? 'pending' : saving === 'error' || readOnly ? 'error' : ''}`}>
            <i aria-hidden="true" /><span className="txt">{readOnly ? 'Sola lettura: le modifiche non vengono salvate' : saving === 'pending' ? 'Salvataggio…' : saving === 'error' ? 'Salvataggio non riuscito' : mode === 'memory' ? 'Solo in memoria: esporta i dati' : 'Salvato in questo browser'}</span>
          </div>
          <DqBadge />
        </div>
        <span className="txt xs">Vista: {role.label}</span>
      </div>
    </aside>
  );
}

/** Scelta dell'agente per la vista Agente: filtro di comodità (prefs.agentId), non una protezione dei dati. */
function AgentPick({ d }) {
  const agentId = usePrefs(p => p.agentId);
  const opts = [{ id: '', label: 'Tutti gli agenti' }, ...(d.agents || []).map(a => ({ id: a.id, label: a.name }))];
  return (
    <label className="agent-pick"><LuUserRound aria-hidden="true" /><span className="hide-m">Agente</span>
      <Select className="slim" ariaLabel="Agente della vista" value={agentId || ''} onChange={v => setPrefs({ agentId: v || null })} options={opts} />
    </label>
  );
}

function Topbar({ d, route, role, theme }) {
  useStore(s => s.data); // aggiorna lo stato di annulla/ripeti
  const N = NAV[route.area];
  const tabLabel = N?.tabs?.find(t => t.id === route.tab)?.label;
  const nextTheme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  const ThemeIcon = theme === 'dark' ? LuMoon : theme === 'light' ? LuSun : LuMonitor;
  const blocked = role.id === 'agente' && AGENT_HIDDEN.includes(route.area);
  const showPeriod = AREA[route.area]?.period && !blocked, showAgent = role.id === 'agente';
  return (
    <>
      <header className="top">
        <div className="crumbs"><span className="area-only">{d.settings?.company?.short || META.product}</span><span className="area-only" aria-hidden="true">/</span><b>{N?.label}</b>{tabLabel && <><span className="area-only" aria-hidden="true">/</span><span className="area-only">{tabLabel}</span></>}</div>
        <button className="cmd" onClick={() => uiStore.set({ palette: true })} aria-label="Cerca o apri un comando">
          <LuSearch aria-hidden="true" /><span className="hide-m">{META.labels?.search || 'Cerca un lotto, un cliente o un comando…'}</span><span className="show-m">Cerca o chiedi…</span><kbd>Ctrl K</kbd>
        </button>
        <div className="tb">
          <select className="select hide-m" style={{ width: 150, height: 34 }} value={role.id} aria-label="Vista per ruolo"
            onChange={e => { setPrefs({ role: e.target.value }); toast('Vista: ' + ROLE[e.target.value].label); }}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}
          </select>
          <Btn kind="ghost" icon={LuUndo2} title={store.canUndo() ? `Annulla: ${store.undoLabel()}` : 'Niente da annullare'} disabled={!store.canUndo()} onClick={() => { const l = store.undo(); if (l) toast('Annullato: ' + l); }} />
          <Btn kind="ghost" icon={LuRedo2} title="Ripeti" disabled={!store.canRedo()} onClick={() => { const l = store.redo(); if (l) toast('Ripristinato: ' + l); }} />
          <Btn kind="ghost" icon={ThemeIcon} title={`Tema: ${{ auto: 'automatico', light: 'chiaro', dark: 'scuro' }[theme]} (clic per cambiare)`} onClick={() => setPrefs({ theme: nextTheme })} />
          <Btn kind="ghost" icon={LuPresentation} title="Presentazione guidata" className="hide-m" onClick={() => uiStore.set({ tour: 0 })} />
        </div>
      </header>
      {(showPeriod || showAgent) && (
        <div className="subbar no-print">
          {showPeriod && <PeriodBar />}
          {showAgent && <AgentPick d={d} />}
        </div>
      )}
    </>
  );
}

function MobileNav({ d, route, role }) {
  const [menu, setMenu] = useState(false);
  const counts = useCounts(d);
  const main = role.areas.filter(a => a !== 'oggi').slice(0, 2);
  const items = ['oggi', ...main];
  return (
    <>
      <nav className="mnav" aria-label="Navigazione rapida">
        {items.map(a => { const I = NAV[a].icon; return <a key={a} href={'#' + a} aria-current={route.area === a ? 'page' : undefined}><I aria-hidden="true" />{NAV[a].label.split(' ')[0]}{counts[a] && a === 'oggi' ? <span className="count">{counts[a]}</span> : null}</a>; })}
        <button onClick={() => uiStore.set({ palette: true })}><LuSearch aria-hidden="true" />Cerca</button>
        <button onClick={() => setMenu(true)}><LuMenu aria-hidden="true" />Menu</button>
      </nav>
      {menu && (
        <Drawer title="Menu" sub={role.label} onClose={() => setMenu(false)}>
          <nav className="nav">
            {role.areas.map(a => { const I = NAV[a].icon; return <a key={a} href={'#' + a} onClick={() => setMenu(false)} aria-current={route.area === a ? 'page' : undefined}><I aria-hidden="true" /><span>{NAV[a].label}</span></a>; })}
          </nav>
          <label className="field"><span>Vista per ruolo</span>
            <select className="select" value={role.id} onChange={e => setPrefs({ role: e.target.value })}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          </label>
          <Btn icon={LuPresentation} onClick={() => { setMenu(false); uiStore.set({ tour: 0 }); }}>Presentazione guidata</Btn>
        </Drawer>
      )}
    </>
  );
}
