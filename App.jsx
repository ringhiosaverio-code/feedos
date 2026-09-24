/* FeedOS 16 · guscio dell'applicazione: menu per reparto, barra comandi, ruoli, tema, annulla/ripeti. */
import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { LuSearch, LuUndo2, LuRedo2, LuSun, LuMoon, LuMonitor, LuPresentation, LuMenu, LuSparkles, LuWifiOff } from 'react-icons/lu';
import { useStore, useData, useUi, uiStore, store, toast } from '../core/store.js';
import { useRoute, go } from '../core/router.js';
import { ROLES, ROLE, AREA_META } from '../core/roles.js';
import { signals, appToday } from '../core/derived.js';
import { dateIt } from '../core/util.js';
import { NAV } from './nav.js';
import { Modal, Toasts, Btn, Drawer } from '../ui/ui.jsx';
import { Palette } from './Palette.jsx';
import { Tour } from './Tour.jsx';
import { DrawerHost } from '../modules/drawers.jsx';
import { Oggi } from '../modules/oggi.jsx';
import { Gemello } from '../modules/gemello.jsx';
import { Formulazione } from '../modules/formulazione.jsx';
import { Acquisti } from '../modules/acquisti.jsx';
import { Produzione } from '../modules/produzione.jsx';
import { Qualita } from '../modules/qualita.jsx';
import { Commerciale } from '../modules/commerciale.jsx';
import { Economia } from '../modules/economia.jsx';
import { Esg } from '../modules/esg.jsx';
import { Dati } from '../modules/dati.jsx';

const PAGES = { oggi: Oggi, gemello: Gemello, formulazione: Formulazione, acquisti: Acquisti, produzione: Produzione, qualita: Qualita, commerciale: Commerciale, economia: Economia, esg: Esg, dati: Dati };
import { VERSION } from './version.js';
export { VERSION };

export function App() {
  const ready = useStore(s => s.ready);
  const d = useData();
  const route = useRoute();
  const role = ROLE[d.settings?.role] || ROLE.direzione;
  const theme = d.settings?.theme || 'auto';
  const size = d.settings?.size || 'normale';

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme);
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

  useEffect(() => { document.title = `${NAV[route.area]?.label || 'FeedOS'} · FeedOS 16`; }, [route.area]);

  if (!ready) return <div className="content"><p className="muted">Apertura dell’archivio…</p></div>;
  const Page = PAGES[route.area] || Oggi;
  return (
    <div className="app">
      <Sidebar d={d} route={route} role={role} />
      <div className="main">
        <Topbar d={d} route={route} role={role} theme={theme} />
        <main className="content" id="contenuto">
          <Guard key={route.area + '.' + (route.tab || '') + '.' + (route.id || '')}><Page route={route} /></Guard>
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

/** Un errore in una pagina non deve fermare tutta l'applicazione: si mostra un avviso e si può tornare indietro. */
class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.warn('FeedOS: errore nella pagina', err, info?.componentStack?.slice(0, 400)); } catch { /* ignora */ } }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel" style={{ padding: 20, display: 'grid', gap: 10 }} role="alert">
        <h1 style={{ font: '700 30px/1 var(--f-display)', textTransform: 'uppercase' }}>Questa pagina non si è aperta</h1>
        <p className="muted">Probabilmente mancano dei dati che la pagina si aspetta (per esempio un archivio appena creato). I dati salvati non sono stati toccati.</p>
        <p className="small mono">{String(this.state.err?.message || this.state.err).slice(0, 200)}</p>
        <div className="row"><Btn kind="primary" onClick={() => go('oggi')}>Torna a Oggi</Btn><Btn onClick={() => this.setState({ err: null })}>Riprova</Btn></div>
      </div>
    );
  }
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
  const saving = useStore(s => s.saving), mode = useStore(s => s.saveMode);
  const demo = d.settings?.dataset === 'demo';
  return (
    <aside className="side" aria-label="Menu principale">
      <button className="brand" onClick={() => go('oggi')} title="Vai a Oggi">
        <span className="mark" aria-hidden="true">F</span>
        <span><b>FeedOS</b><small>{d.settings?.company?.short || 'Mangimificio'} · {VERSION}</small></span>
      </button>
      {demo ? (
        <div className="dataset demo" title="I dati sono inventati e generati dall’app: non rappresentano un’impresa reale.">
          <b>Dati dimostrativi</b><span>Mangimificio di fantasia · al {dateIt(d.settings.demoAnchor)}</span>
        </div>
      ) : d.settings?.dataset === 'vuoto' ? (
        <div className="dataset"><b>Archivio vuoto</b><span>Inserisci i tuoi dati o carica la demo da «Dati».</span></div>
      ) : null}
      <nav className="nav" aria-label="Aree">
        {role.areas.map((a, i) => {
          const N = NAV[a]; const I = N.icon;
          return (
            <React.Fragment key={a}>
              {i === 2 && <div className="grp eyebrow">Reparti</div>}
              <a href={'#' + a} aria-current={route.area === a ? 'page' : undefined} title={N.label}>
                <I aria-hidden="true" /><span>{N.label}</span>
                {counts[a] ? <span className={`count ${a === 'oggi' ? '' : 'soft'}`} aria-label={`${counts[a]} segnalazioni`}>{counts[a]}</span> : null}
              </a>
            </React.Fragment>
          );
        })}
      </nav>
      <div className="side-foot">
        <div className={`savestate ${saving === 'pending' ? 'pending' : saving === 'error' ? 'error' : ''}`}>
          <i aria-hidden="true" /><span className="txt">{saving === 'pending' ? 'Salvataggio…' : saving === 'error' ? 'Salvataggio non riuscito' : mode === 'memory' ? 'Solo in memoria: esporta i dati' : 'Salvato in questo browser'}</span>
        </div>
        <span className="txt xs">Vista: {role.label}</span>
      </div>
    </aside>
  );
}

function Topbar({ d, route, role, theme }) {
  useStore(s => s.data); // aggiorna lo stato di annulla/ripeti
  const N = NAV[route.area];
  const tabLabel = N?.tabs?.find(t => t.id === route.tab)?.label;
  const nextTheme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  const ThemeIcon = theme === 'dark' ? LuMoon : theme === 'light' ? LuSun : LuMonitor;
  return (
    <header className="top">
      <div className="crumbs"><span className="area-only">{d.settings?.company?.short || 'FeedOS'}</span><span className="area-only" aria-hidden="true">/</span><b>{N?.label}</b>{tabLabel && <><span className="area-only" aria-hidden="true">/</span><span className="area-only">{tabLabel}</span></>}</div>
      <button className="cmd" onClick={() => uiStore.set({ palette: true })} aria-label="Cerca o apri un comando">
        <LuSearch aria-hidden="true" /><span className="hide-m">Cerca una formula, un lotto, un cliente o un comando…</span><span className="show-m">Cerca o chiedi…</span><kbd>Ctrl K</kbd>
      </button>
      <div className="tb">
        <select className="select hide-m" style={{ width: 150, height: 34 }} value={role.id} aria-label="Vista per ruolo"
          onChange={e => { store.settings({ role: e.target.value }, 'Vista cambiata: ' + ROLE[e.target.value].label); toast('Vista: ' + ROLE[e.target.value].label); }}>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.short}</option>)}
        </select>
        <Btn kind="ghost" icon={LuUndo2} title={store.canUndo() ? `Annulla: ${store.undoLabel()}` : 'Niente da annullare'} disabled={!store.canUndo()} onClick={() => { const l = store.undo(); if (l) toast('Annullato: ' + l); }} />
        <Btn kind="ghost" icon={LuRedo2} title="Ripeti" disabled={!store.canRedo()} onClick={() => { const l = store.redo(); if (l) toast('Ripristinato: ' + l); }} />
        <Btn kind="ghost" icon={ThemeIcon} title={`Tema: ${{ auto: 'automatico', light: 'chiaro', dark: 'scuro' }[theme]} (clic per cambiare)`} onClick={() => store.settings({ theme: nextTheme })} />
        <Btn kind="ghost" icon={LuPresentation} title="Presentazione guidata" className="hide-m" onClick={() => uiStore.set({ tour: 0 })} />
      </div>
    </header>
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
            <select className="select" value={role.id} onChange={e => store.settings({ role: e.target.value })}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          </label>
          <Btn icon={LuPresentation} onClick={() => { setMenu(false); uiStore.set({ tour: 0 }); }}>Presentazione guidata</Btn>
        </Drawer>
      )}
    </>
  );
}
