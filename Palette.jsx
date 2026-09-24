/* FeedOS 16 · barra comandi (Ctrl K): pagine, azioni e voci dell'archivio con ricerca tollerante. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch, LuArrowRight, LuFlaskConical, LuUsers, LuBoxes, LuWheat, LuTag, LuFileText, LuZap, LuSparkles, LuShieldCheck, LuHandshake, LuMessageSquare } from 'react-icons/lu';
import { useUi, uiStore, useData, store, toast, openDrawer } from '../core/store.js';
import { go } from '../core/router.js';
import { ROLES } from '../core/roles.js';
import { norm, nf } from '../core/util.js';
import { NAV } from './nav.js';

function buildIndex(d) {
  const items = [];
  for (const [area, N] of Object.entries(NAV)) {
    items.push({ kind: 'Pagina', icon: N.icon, label: N.label, run: () => go(area) });
    for (const t of N.tabs) items.push({ kind: 'Pagina', icon: N.icon, label: `${N.label} › ${t.label}`, run: () => go(area, t.id) });
  }
  const A = (label, run, icon = LuZap, extra = '') => items.push({ kind: 'Azione', icon, label, run, extra });
  A('Nuova formula', () => go('formulazione', 'formule', 'nuova'), LuFlaskConical);
  A('Ottimizza una formula ai prezzi di oggi', () => go('formulazione', 'formule'), LuFlaskConical);
  A('Nuova offerta con margine in tempo reale', () => go('commerciale', 'offerte', 'nuova'), LuHandshake);
  A('Registra una produzione', () => go('produzione', 'registro', 'nuova'));
  A('Simula un richiamo di prodotto', () => go('qualita', 'richiamo'), LuShieldCheck);
  A('Apri il simulatore «E se…»', () => go('economia', 'scenari'), LuSparkles);
  A('Registra un reclamo', () => go('qualita', 'reclami', 'nuovo'), LuMessageSquare);
  A('Esporta un backup completo', () => go('dati', 'archivio', 'backup'));
  A('Carica il mangimificio dimostrativo', () => go('dati', 'archivio'));
  A('Presentazione guidata', () => uiStore.set({ tour: 0 }), LuSparkles);
  A('Tema chiaro', () => store.settings({ theme: 'light' })); A('Tema scuro', () => store.settings({ theme: 'dark' })); A('Tema automatico', () => store.settings({ theme: 'auto' }));
  A('Modalità aula (caratteri grandi)', () => store.settings({ size: d.settings?.size === 'aula' ? 'normale' : 'aula' }));
  for (const r of ROLES) A(`Vista: ${r.label}`, () => { store.settings({ role: r.id }); toast('Vista: ' + r.label); });
  for (const f of d.formulas) items.push({ kind: 'Formula', icon: LuFlaskConical, label: f.name, extra: f.code, run: () => go('formulazione', 'formule', f.id) });
  for (const p of d.products) items.push({ kind: 'Prodotto', icon: LuBoxes, label: p.name, extra: p.code, run: () => openDrawer('product', p.id) });
  for (const i of d.ingredients) items.push({ kind: 'Materia prima', icon: LuWheat, label: i.name, extra: i.code, run: () => openDrawer('ingredient', i.id) });
  for (const c of d.customers) items.push({ kind: 'Cliente', icon: LuUsers, label: c.name, extra: `${c.city} (${c.province})`, run: () => openDrawer('customer', c.id) });
  for (const o of d.offers) items.push({ kind: 'Offerta', icon: LuFileText, label: o.code, extra: d.customers.find(c => c.id === o.customerId)?.name || '', run: () => openDrawer('offer', o.id) });
  for (const c of d.complaints) items.push({ kind: 'Reclamo', icon: LuMessageSquare, label: c.code, extra: c.description, run: () => openDrawer('complaint', c.id) });
  for (const l of d.lots) items.push({ kind: 'Lotto prodotto', icon: LuTag, label: l.code, extra: d.products.find(p => p.id === l.productId)?.name || '', run: () => openDrawer('lot', l.id), weak: true });
  for (const l of d.ingLots) items.push({ kind: 'Lotto materia prima', icon: LuTag, label: l.code, extra: d.ingredients.find(i => i.id === l.ingId)?.name || '', run: () => openDrawer('ingLot', l.id), weak: true });
  return items.map(i => ({ ...i, hay: norm(`${i.label} ${i.extra || ''} ${i.kind}`) }));
}

/** Domande in linguaggio semplice, riconosciute da parole chiave (nessun servizio esterno). */
function questions(q, d) {
  const s = norm(q).trim();
  const out = [];
  const find = (arr, text, f) => { const t = norm(text); return arr.filter(x => norm(f(x)).includes(t)).slice(0, 3); };
  let m;
  if ((m = s.match(/^(margin[ei]|margine di|guadagno)\s+(.+)/))) for (const p of find(d.products, m[2], p => p.name + ' ' + p.code)) out.push({ kind: 'Risposta', icon: LuSparkles, label: `Margine di ${p.name}`, extra: 'apre Economia › Margini', run: () => go('economia', 'margini', p.id) });
  if ((m = s.match(/^(scort[ae]|giacenz[ae]|magazzino)\s+(.+)/))) for (const i of find(d.ingredients, m[2], i => i.name)) out.push({ kind: 'Risposta', icon: LuSparkles, label: `Scorta di ${i.name}: ${nf(i.stock, 1)} t`, extra: 'apre le scorte', run: () => go('acquisti', 'scorte', i.id) });
  if ((m = s.match(/^(costo|prezzo|formula)\s+(.+)/))) for (const f of find(d.formulas, m[2], f => f.name + ' ' + f.code)) out.push({ kind: 'Risposta', icon: LuSparkles, label: `Costo della formula ${f.name}`, extra: 'apre la formula', run: () => go('formulazione', 'formule', f.id) });
  if ((m = s.match(/^(richiam[oa]|dove e finito|dove è finito)\s+(.+)/))) {
    for (const l of d.ingLots.filter(l => norm(l.code).includes(norm(m[2]))).slice(0, 3)) out.push({ kind: 'Risposta', icon: LuShieldCheck, label: `Richiamo del lotto ${l.code}`, extra: 'simula dove è finito', run: () => go('qualita', 'richiamo', l.id) });
    for (const l of d.lots.filter(l => norm(l.code).includes(norm(m[2]))).slice(0, 3)) out.push({ kind: 'Risposta', icon: LuShieldCheck, label: `Richiamo del lotto ${l.code}`, extra: 'simula dove è finito', run: () => go('qualita', 'richiamo', l.id) });
  }
  if ((m = s.match(/^(e se|se)\s+(.+?)\s*([+-]\s*\d+)\s*%?/))) for (const i of find(d.ingredients, m[2], i => i.name)) out.push({ kind: 'Risposta', icon: LuSparkles, label: `E se ${i.name.toLowerCase()} ${m[3].replace(/\s/g, '')}%?`, extra: 'apre il simulatore con questo scenario', run: () => { uiStore.set({ scenarioSeed: { byIngredient: { [i.id]: +m[3].replace(/\s/g, '') } } }); go('economia', 'scenari'); } });
  return out;
}

export function Palette() {
  const open = useUi(s => s.palette);
  const d = useData();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef(null);
  const index = useMemo(() => open ? buildIndex(d) : [], [open, d]);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => ref.current?.focus(), 10); } }, [open]);
  const results = useMemo(() => {
    const s = norm(q).trim();
    const qs = s ? questions(q, d) : [];
    if (!s) return index.filter(i => i.kind === 'Pagina' && !i.label.includes('›')).concat(index.filter(i => i.kind === 'Azione').slice(0, 8));
    const parts = s.split(/\s+/);
    const hits = index.filter(i => parts.every(p => i.hay.includes(p)));
    hits.sort((a, b) => score(b, s) - score(a, s));
    return [...qs, ...hits].slice(0, 40);
  }, [q, index]);
  if (!open) return null;
  const close = () => uiStore.set({ palette: false });
  const run = it => { close(); setTimeout(() => it.run(), 0); };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(x => Math.min(results.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(x => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && results[sel]) run(results[sel]);
  };
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="pal" role="dialog" aria-modal="true" aria-label="Cerca o apri un comando">
        <div className="q"><LuSearch aria-hidden="true" />
          <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} placeholder="Cerca… oppure chiedi: «margine suino», «scorte mais», «richiamo M01», «e se mais +10%»" aria-label="Cerca" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={'pal-' + sel} />
        </div>
        <ul id="pal-list" role="listbox">
          {results.map((it, i) => { const I = it.icon || LuArrowRight; return (
            <li key={i} id={'pal-' + i} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
              <I aria-hidden="true" /><span>{it.label}{it.extra && <small> · {it.extra}</small>}</span><span className="g">{it.kind}</span>
            </li>); })}
          {!results.length && <li aria-disabled="true"><span className="muted">Nessun risultato. Prova con un codice, un nome o «scorte mais».</span></li>}
        </ul>
        <div className="hint"><span><kbd>↑</kbd> <kbd>↓</kbd> per scegliere</span><span><kbd>Invio</kbd> per aprire</span><span><kbd>Esc</kbd> per chiudere</span><span>Le risposte usano solo i dati di questo archivio.</span></div>
      </div>
    </>
  );
}
function score(it, s) {
  let x = 0;
  const l = norm(it.label);
  if (l.startsWith(s)) x += 50;
  if (l.includes(s)) x += 20;
  if (it.kind === 'Pagina') x += 8;
  if (it.kind === 'Azione') x += 6;
  if (it.weak) x -= 10;
  return x - l.length / 100;
}
