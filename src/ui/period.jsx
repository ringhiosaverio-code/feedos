/* FeedOS 17 · Periodo globale nell'interfaccia: hook usePeriod e barra di scelta (preset, confronto, date). */
import React, { useMemo, useSyncExternalStore } from 'react';
import { getPeriodSpec, setPeriodSpec, subscribePeriod, resolvePeriod, comparePeriod, PRESETS, COMPARES } from '../core/period.js';
import { appToday, dataStartOf } from '../core/derived.js';
import { coverage } from '../engine/actuals.js';
import { useData } from '../core/store.js';
import { pct } from '../core/util.js';
import { Seg, Select, Chip } from './ui.jsx';

/** Specifica del periodo condivisa (indirizzo e preferenze). */
export function usePeriodSpec() { return useSyncExternalStore(subscribePeriod, getPeriodSpec, getPeriodSpec); }

/**
 * Periodo P e confronto C per l'archivio d. C è null con 'nessuno', {budget: true, ...P} con 'budget'.
 * cov = quota del periodo di confronto coperta dai dati (fatti o storico): sotto 0,9 il confronto non è omogeneo.
 * → {spec, P, C, setSpec, today, cov}
 */
export function usePeriod(d) {
  const spec = usePeriodSpec();
  const today = appToday(d);
  const fyStart = d.settings?.finance?.fiscalYearStartMonth ?? 1;
  const P = useMemo(() => resolvePeriod(spec, today, { fyStart }), [spec, today, fyStart]);
  const C = useMemo(() => comparePeriod(P, spec.compare, today), [P, spec.compare, today]);
  const start = dataStartOf(d);
  const cov = C ? (C.budget ? 1 : coverage(C, start)) : null;
  return { spec, P, C, setSpec: setPeriodSpec, today, cov };
}

/** Barra del periodo: preset (pulsanti su schermo largo, elenco su schermo stretto), confronto, date per «Date a scelta». */
export function PeriodBar() {
  const d = useData();
  const { spec, P, C, cov } = usePeriod(d);
  const pick = id => setPeriodSpec(id === 'custom' ? { preset: 'custom', from: P.from, to: P.to } : { preset: id });
  const setDate = (k, v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setPeriodSpec({ preset: 'custom', from: P.from, to: P.to, [k]: v }); };
  return (
    <div className="pbar" role="group" aria-label="Periodo">
      <span className="p-seg"><Seg label="Periodo" value={spec.preset} onChange={pick} options={PRESETS.map(p => ({ id: p.id, label: p.short, title: p.label }))} /></span>
      <Select className="p-sel slim" ariaLabel="Periodo" value={spec.preset} onChange={pick} options={PRESETS.map(p => ({ id: p.id, label: p.label }))} />
      {spec.preset === 'custom' && (
        <span className="p-dates">
          <input type="date" className="input slim" aria-label="Dal" value={P.from} max={P.to} onChange={e => setDate('from', e.target.value)} />
          <span aria-hidden="true">–</span>
          <input type="date" className="input slim" aria-label="Al" value={P.to} min={P.from} onChange={e => setDate('to', e.target.value)} />
        </span>
      )}
      <span className="plabel" title={P.label}>{P.label}{P.open && <span className="muted"> · in corso</span>}</span>
      <label className="p-cmp"><span>Confronta con</span>
        <Select className="slim" ariaLabel="Confronta con" value={spec.compare} onChange={v => setPeriodSpec({ compare: v })} options={COMPARES} />
      </label>
      {C && !C.budget && <span className="plabel cmp" title={C.label}>{C.short}</span>}
      {cov != null && cov < 0.9 && <Chip kind="warn" title={`I dati coprono il ${pct(cov, 0)} del periodo di confronto`}>non confrontabile</Chip>}
    </div>
  );
}
