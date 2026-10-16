/* FeedOS 16 · componenti di base dell'interfaccia. */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LuCircleAlert, LuTriangleAlert, LuInfo, LuCircleCheck, LuX, LuChevronUp, LuChevronDown, LuSearch, LuInbox } from 'react-icons/lu';
import { nf, norm } from '../core/util.js';
import { uiStore, useUi, closeDrawer } from '../core/store.js';

export function Panel({ title, sub, actions, children, flush, className = '', id, inset }) {
  return (
    <section className={`panel ${inset ? 'inset' : ''} ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && <div className="hd"><div>{title && <h2>{title}</h2>}{sub && <div className="sub">{sub}</div>}</div>{actions && <div className="row gap-s">{actions}</div>}</div>}
      <div className={`bd ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function PageHead({ title, lead, actions, tabs, tab, onTab }) {
  return (
    <header className="ph">
      <div className="ph-row">
        <div><h1>{title}</h1>{lead && <p className="lead">{lead}</p>}</div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
      {tabs && <Tabs items={tabs} value={tab} onChange={onTab} />}
    </header>
  );
}

export function Tabs({ items, value, onChange, label = 'Sezioni' }) {
  return (
    <nav className="tabs" role="tablist" aria-label={label}>
      {items.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} id={'tab-' + t.id}>
          {t.label}{t.n != null && t.n !== 0 && <span className="n">{t.n}</span>}
        </button>
      ))}
    </nav>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)} title={o.title}>{o.label}</button>)}
    </div>
  );
}

export function Btn({ children, kind = '', small, icon: Icon, onClick, title, disabled, type = 'button', ...rest }) {
  return (
    <button type={type} className={`btn ${kind} ${small ? 'small' : ''} ${!children ? 'icon' : ''}`} onClick={onClick} title={title} aria-label={!children ? title : undefined} disabled={disabled} {...rest}>
      {Icon && <Icon aria-hidden="true" />}{children}
    </button>
  );
}

const SEV_ICON = { critico: LuCircleAlert, attenzione: LuTriangleAlert, info: LuInfo, ok: LuCircleCheck };
const SEV_CLASS = { critico: 'crit', attenzione: 'warn', info: '', ok: 'good', serio: 'serious' };
const SEV_LABEL = { critico: 'Critico', attenzione: 'Attenzione', info: 'Informazione', ok: 'In regola', serio: 'Da seguire' };
export function Sev({ level, label }) {
  const I = SEV_ICON[level] || LuInfo;
  return <span className={`chip ${SEV_CLASS[level] || ''}`}><I aria-hidden="true" />{label || SEV_LABEL[level]}</span>;
}
export function Chip({ kind = '', icon: I, children, title }) {
  return <span className={`chip ${kind}`} title={title}>{I && <I aria-hidden="true" />}{children}</span>;
}
export function Cls({ c }) { return <span className={`cls ${c}`} title={{ A: 'Classe A · calcolabile', B: 'Classe B · da acquisire o consolidare', C: 'Classe C · nuova rilevazione' }[c]}>{c}</span>; }

export function Kpi({ label, value, unit, foot, delta, deltaGood, spark, onClick, title, sparkColor }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="kpi" onClick={onClick} title={title} type={onClick ? 'button' : undefined}>
      <span className="lbl">{label}</span>
      <span className="val">{value}{unit && <small>{unit}</small>}</span>
      <span className="foot">
        <span>{delta != null && <span className={`delta ${delta >= 0 ? 'up' : 'down'} ${deltaGood == null ? '' : deltaGood ? 'good' : 'bad'}`}>{delta >= 0 ? '▲' : '▼'} {nf(Math.abs(delta), 1)}%</span>} {foot}</span>
        {spark && <Spark values={spark} color={sparkColor} />}
      </span>
    </Tag>
  );
}

export function Spark({ values, color = 'var(--s1)', w = 84, h = 22 }) {
  const v = values.filter(x => x != null && Number.isFinite(x));
  if (v.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
  const pts = values.map((y, i) => [2 + i * (w - 4) / (values.length - 1), h - 3 - ((y ?? mn) - mn) / rg * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d + `L${last[0]} ${h} L2 ${h}Z`} fill={color} opacity=".1" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** Numero con virgola decimale all'italiana; conferma su invio o uscita dal campo. */
export function NumInput({ value, onChange, decimals = 2, className = '', min, max, placeholder, id, slim, ariaLabel, step }) {
  const fmt = v => v == null || v === '' || !Number.isFinite(+v) ? '' : String(Math.round(+v * 10 ** decimals) / 10 ** decimals).replace('.', ',');
  const [txt, setTxt] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(fmt(value)); }, [value]);
  const commit = () => {
    const s = txt.trim().replace(/\./g, '').replace(',', '.');
    if (s === '') { onChange(null); return; }
    let v = Number(s);
    if (!Number.isFinite(v)) { setTxt(fmt(value)); return; }
    if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v);
    onChange(v); setTxt(fmt(v));
  };
  return <input id={id} aria-label={ariaLabel} inputMode="decimal" className={`input num ${slim ? 'slim' : ''} ${className}`} value={txt} placeholder={placeholder}
    onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; commit(); }}
    onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const v = (+String(txt).replace(',', '.') || 0) + (e.key === 'ArrowUp' ? step : -step); onChange(v); setTxt(fmt(v)); } }} />;
}

export function Select({ value, onChange, options, className = '', id, ariaLabel }) {
  return (
    <select id={id} aria-label={ariaLabel} className={`select ${className}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Cerca', id }) {
  return <div className="search"><LuSearch aria-hidden="true" /><input id={id} className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>;
}

export function Empty({ icon: I = LuInbox, title, children }) {
  return <div className="empty"><I aria-hidden="true" /><b>{title}</b>{children && <div className="small">{children}</div>}</div>;
}

/**
 * Tabella con ordinamento, ricerca esterna e paginazione.
 * cols: [{key, label, render(row), sort(row), align:'r', width, className}]
 */
export function Table({ rows, cols, onRow, rowKey = r => r.id, pageSize = 50, initialSort, selected, foot, caption, empty = 'Nessun elemento' }) {
  const [sort, setSort] = useState(initialSort || null); // {key, dir}
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows.length]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find(x => x.key === sort.key);
    if (!c) return rows;
    const f = c.sort || (r => r[c.key]);
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'desc' ? -1 : 1);
    });
  }, [rows, sort, cols]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const toggle = k => setSort(s => !s || s.key !== k ? { key: k, dir: 'asc' } : s.dir === 'asc' ? { key: k, dir: 'desc' } : null);
  return (
    <div>
      <div className="tw">
        <table className="t">
          {caption && <caption className="sr">{caption}</caption>}
          <thead><tr>{cols.map(c => (
            <th key={c.key} className={c.align === 'r' ? 'r' : ''} style={c.width ? { width: c.width } : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              {c.nosort ? c.label : <button onClick={() => toggle(c.key)}>{c.label}{sort?.key === c.key && (sort.dir === 'asc' ? <LuChevronUp size={12} /> : <LuChevronDown size={12} />)}</button>}
            </th>))}</tr></thead>
          <tbody>
            {view.map(r => (
              <tr key={rowKey(r)} className={`${onRow ? 'click' : ''} ${selected && selected === rowKey(r) ? 'sel' : ''}`} onClick={onRow ? () => onRow(r) : undefined}
                tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? e => { if (e.key === 'Enter') onRow(r); } : undefined}>
                {cols.map(c => <td key={c.key} className={`${c.align === 'r' ? 'r' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
            {!view.length && <tr><td colSpan={cols.length}><Empty title={empty} /></td></tr>}
          </tbody>
          {foot && <tfoot><tr>{foot}</tr></tfoot>}
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <span>{nf(sorted.length)} righe · pagina {page + 1} di {pages}</span>
          <span className="row gap-s">
            <Btn small kind="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Precedente</Btn>
            <Btn small kind="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Successiva</Btn>
          </span>
        </div>
      )}
    </div>
  );
}

export function filterRows(rows, q, fields) {
  const s = norm(q).trim();
  if (!s) return rows;
  const parts = s.split(/\s+/);
  return rows.filter(r => { const hay = norm(fields.map(f => typeof f === 'function' ? f(r) : r[f]).join(' ')); return parts.every(p => hay.includes(p)); });
}

export function Drawer({ title, sub, children, actions, wide, onClose = closeDrawer, icon }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); try { prev?.focus?.(); } catch { /* ignora */ } };
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dettaglio'} tabIndex={-1} ref={ref}>
        <div className="hd">
          {icon}
          <div style={{ flex: 1, minWidth: 0 }}>{sub && <div className="eyebrow">{sub}</div>}<h2>{title}</h2></div>
          <Btn kind="ghost" icon={LuX} title="Chiudi" onClick={onClose} />
        </div>
        <div className="bd">{children}</div>
        {actions && <div className="ft">{actions}</div>}
      </aside>
    </>
  );
}

export function Modal() {
  const m = useUi(s => s.modal);
  if (!m) return null;
  const close = () => uiStore.set({ modal: null });
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={m.title}>
        <div className="hd"><h3>{m.title}</h3></div>
        <div className="bd">{m.body}</div>
        <div className="ft">
          <Btn onClick={close}>{m.cancel || 'Annulla'}</Btn>
          <Btn kind={m.danger ? 'danger' : 'primary'} onClick={() => { close(); m.onOk?.(); }} autoFocus>{m.ok || 'Conferma'}</Btn>
        </div>
      </div>
    </>
  );
}
export function confirm(title, body, onOk, opt = {}) { uiStore.set({ modal: { title, body, onOk, ...opt } }); }

export function Toasts() {
  const list = useUi(s => s.toast);
  return (
    <div className="toasts" aria-live="polite">
      {list.map(t => <div key={t.id} className="toast">{t.kind === 'err' ? <LuCircleAlert /> : <LuCircleCheck />}<span>{t.text}</span>{t.action && <button onClick={t.action.fn}>{t.action.label}</button>}</div>)}
    </div>
  );
}

export function Kv({ items }) {
  return <dl className="kv">{items.filter(Boolean).map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v ?? '—'}</dd></React.Fragment>)}</dl>;
}

export function Bullet({ value, min, max, lo, hi, bad: badIn }) {
  // lo/hi: estremi della scala; min/max: intervallo ammesso
  const L = lo, H = hi, rg = H - L || 1;
  const pos = v => Math.max(0, Math.min(100, (v - L) / rg * 100));
  const a = min != null && min !== '' ? pos(+min) : 0, b = max != null && max !== '' ? pos(+max) : 100;
  const bad = badIn != null ? badIn : value != null && ((min != null && min !== '' && value < +min - 1e-9) || (max != null && max !== '' && value > +max + 1e-9));
  return (
    <div className="bullet" aria-hidden="true">
      <div className="track" /><div className="ok" style={{ left: a + '%', width: Math.max(1, b - a) + '%' }} />
      {value != null && <div className={`mark ${bad ? 'bad' : ''}`} style={{ left: pos(value) + '%' }} />}
    </div>
  );
}

export function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => { const x = Math.round(e[0].contentRect.width); if (x > 0) setW(x); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return w;
}
