/* FeedOS 18 · Registri ambientali (pacchetto WP9 «ambiente»): statistica dei registri, senza interfaccia.
 * ENPI: minimi quadrati mensili kWh = a + b·t(linea principale) + c·t(altre linee), dalle produzioni per linea e mese; base del
 * modello sui mesi precedenti e controllo degli ultimi tre (scostamento, CUSUM). Anomalie: z robusto con MAD per linea o mese,
 * regola dell’errore di unità (valore ≥ 500 volte la mediana), ogni anomalia rimanda ai record di origine. Flusso di massa:
 * bilancio dell’impianto (plantBalance di massbalance.js, in sola lettura) con le uscite. Funzioni pure. */
import { median, sum, monthOf, daysInMonth, endOfMonth, addMonths } from '../core/util.js';
import { plantBalance } from './massbalance.js';
import { waterStats } from './sustainability.js';
import { KWH_PER_KG_GPL, ymd, inRange } from './esg-ambiente-calc.js';

/** Tipi di linea che fanno da «linea principale» (pellettatura o granulazione) nel modello energetico. */
export const MAIN_KINDS = ['pellet', 'granulazione'];
/** Mesi di controllo dell’ENPI: gli ultimi tre, se ci sono almeno dieci mesi chiusi. */
export const MONITOR_MONTHS = 3;
/** Soglia dell’anomalia di errore di unità (valore ≥ questo multiplo della mediana). */
export const UNIT_ERROR_X = 500;
/** Deriva dell’ENPI: il mese di controllo deve superare il modello di oltre l’1% e di oltre due errori standard. */
export const DRIFT_MIN = 0.01;

/** Risolve un sistema lineare A·x = b (eliminazione di Gauss con pivot parziale); null se singolare. */
export function solveLinear(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Minimi quadrati ordinari: X (righe con l’intercetta), y. → {beta, yhat, sse, r2, s, n, p} o null. */
export function olsFit(X, y) {
  const n = y.length, p = X[0] ? X[0].length : 0;
  if (!p || n < p) return null;
  const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) { b[j] += X[i][j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += X[i][j] * X[i][k]; }
  const beta = solveLinear(A, b);
  if (!beta) return null;
  const yhat = X.map(r => r.reduce((s, v, j) => s + v * beta[j], 0));
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  const sse = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0), sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  return { beta, yhat, sse, r2: sst > 1e-9 ? 1 - sse / sst : null, s: n > p ? Math.sqrt(sse / (n - p)) : null, n, p };
}

/** CUSUM unilaterale (scostamenti standardizzati z, riferimento k): S = max(0, S + z − k). */
export function cusumUp(zs, k = 0.5) {
  let s = 0;
  return zs.map(z => { s = Math.max(0, s + z - k); return s; });
}

/** Punteggi robusti: z = 0,6745 (x − mediana) ÷ MAD. Con MAD nullo nessuno scostamento (z = 0). */
export function madScores(xs) {
  const med = median(xs);
  const mad = median(xs.map(x => Math.abs(x - med)));
  return { med, mad, z: xs.map(x => (mad > 0 ? (0.6745 * (x - med)) / mad : 0)) };
}

/** Copertura dei giorni di un mese con i registri di produzione (1 = mese pieno). */
export function coverageFn(runs) {
  let first = null, last = null;
  for (const r of runs) { const x = ymd(r?.date); if (!x) continue; if (!first || x < first) first = x; if (!last || x > last) last = x; }
  return m => {
    if (!first || m < first.slice(0, 7) || m > last.slice(0, 7)) return 0;
    const from = m === first.slice(0, 7) ? +first.slice(8, 10) : 1, to = m === last.slice(0, 7) ? +last.slice(8, 10) : daysInMonth(m);
    return (to - from + 1) / daysInMonth(m);
  };
}
/** Linea della «principale» (pellet o granuli) secondo il tipo nell’anagrafica delle linee. */
export const lineIsMain = (d, lineId) => { const l = arr(d?.lines).find(x => x.id === lineId); return !!l && MAIN_KINDS.includes(l.kind); };
const arr = x => (Array.isArray(x) ? x : []);
const num = v => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const cap = xs => xs.slice(0, 50);

/**
 * Serie mensile dei registri energia e produzione (mesi con il contatore): elettricità totale (prelievo più fotovoltaico
 * autoconsumato), energia termica del GPL, tonnellate della linea principale e delle altre. closed = mese chiuso e pieno.
 */
export function enpiRows(d, today) {
  const runs = arr(d?.runs), cur = monthOf(today || '');
  const cover = coverageFn(runs);
  const byM = new Map();
  for (const r of runs) {
    const m = monthOf(r?.date || '');
    if (!ymd(r?.date)) continue;
    const x = byM.get(m) || { tMain: 0, tOther: 0, ids: [] };
    if (lineIsMain(d, r.lineId)) x.tMain += +r.tonnes || 0; else x.tOther += +r.tonnes || 0;
    if (x.ids.length < 50) x.ids.push(r.id);
    byM.set(m, x);
  }
  return arr(d?.energy).filter(e => e && /^\d{4}-\d{2}$/.test(e.month || '') && (!cur || e.month < cur)).sort((a, b) => (a.month < b.month ? -1 : 1)).map(e => {
    const g = byM.get(e.month) || { tMain: 0, tOther: 0, ids: [] };
    const el = (+e.kwhGrid || 0) + (+e.kwhPV || 0) - (+e.kwhExport || 0);
    const th = (+e.gplKg || 0) * KWH_PER_KG_GPL;
    const tTot = g.tMain + g.tOther;
    const coverage = cover(e.month);
    return { month: e.month, energyId: e.id, el, th, tMain: g.tMain, tOther: g.tOther, tTot, coverage, closed: coverage >= 0.9 && tTot > 0 && el > 0, runIds: g.ids };
  });
}

/**
 * Modello ENPI: base = mesi chiusi meno gli ultimi tre (se ce ne sono almeno dieci); coefficienti a (kWh mensili di base, luce e
 * servizi), b (kWh per t della linea principale), c (kWh per t delle altre linee), R² ed errore standard s della base. Per ogni
 * mese: atteso, scostamento, z = residuo ÷ s, CUSUM. Allarme: mese di controllo con z > 2.
 */
export function enpiModel(d, today) {
  const rows = enpiRows(d, today).filter(r => r.closed);
  if (rows.length < 6) return { ok: false, reason: 'Servono almeno sei mesi chiusi con i registri di energia e di produzione.', rows: [] };
  const monitorN = rows.length >= 10 ? MONITOR_MONTHS : 0;
  const base = rows.slice(0, rows.length - monitorN);
  const fit = olsFit(base.map(r => [1, r.tMain, r.tOther]), base.map(r => r.el));
  if (!fit) return { ok: false, reason: 'Le produzioni delle linee non permettono di stimare il modello (linee sempre nello stesso rapporto).', rows: [] };
  const [a, b, c] = fit.beta, s = fit.s || 0;
  const out = rows.map((r, i) => {
    const expected = a + b * r.tMain + c * r.tOther, residual = r.el - expected;
    return { ...r, expected, residual, dev: expected > 0 ? residual / expected : null, z: s > 0 ? residual / s : 0, monitor: i >= base.length };
  });
  const cus = cusumUp(out.map(r => r.z));
  out.forEach((r, i) => { r.cusum = cus[i]; });
  return {
    ok: true, rows: out, beta: { a, b, c }, r2: fit.r2, s, n: base.length, baselineFrom: base[0].month, baselineTo: base.at(-1).month,
    monitorMonths: out.filter(r => r.monitor).map(r => r.month), alarms: out.filter(r => r.monitor && r.z > 2 && r.dev > DRIFT_MIN).map(r => r.month),
    cusumAlarm: out.some(r => r.cusum > 4), reason: null,
  };
}

/** Scostamento ENPI del periodo P: (elettricità − atteso) ÷ atteso, sui mesi chiusi del periodo; e i totali delle tonnellate. */
export function enpiForPeriod(d, today, P) {
  const m = enpiModel(d, today);
  if (!m.ok || !P) return { ok: m.ok, devPct: null, model: m, rows: [], el: null, expected: null, tMain: null, th: null };
  const rows = m.rows.filter(r => r.month >= P.from.slice(0, 7) && r.month <= P.to.slice(0, 7));
  const expected = sum(rows, r => r.expected), el = sum(rows, r => r.el), tMain = sum(rows, r => r.tMain), th = sum(rows, r => r.th);
  return { ok: true, model: m, rows, el, expected, tMain, th, devPct: rows.length && expected > 0 ? (el - expected) / expected * 100 : null,
    elPerMain: tMain > 0 ? el / tMain : null, thPerMain: tMain > 0 ? th / tMain : null };
}

/* ---------------- anomalie ---------------- */
/** Serie mensili controllate: kWh/t per linea, GPL kg/t, litri d’acqua per t, kg di rifiuti per t (mesi chiusi e pieni). */
export function anomalySeries(d, today) {
  const runs = arr(d?.runs), cur = monthOf(today || '');
  const cover = coverageFn(runs);
  const ok = m => (!cur || m < cur) && cover(m) >= 0.9;
  const series = [];
  const lines = [...new Set(runs.map(r => r.lineId).filter(Boolean))].sort();
  for (const lid of lines) {
    const pts = new Map();
    for (const r of runs) {
      if (r.lineId !== lid || !ymd(r.date)) continue;
      const m = r.date.slice(0, 7); if (!ok(m)) continue;
      const p = pts.get(m) || { kwh: 0, t: 0, ids: [] };
      p.kwh += +r.kwh || 0; p.t += +r.tonnes || 0; if (p.ids.length < 50) p.ids.push(r.id); pts.set(m, p);
    }
    series.push({ metric: `kwh-t-${lid}`, label: `Energia elettrica per tonnellata, linea ${lid}`, unit: 'kWh/t', line: lid,
      points: [...pts].filter(([, p]) => p.t > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([m, p]) => ({ month: m, value: p.kwh / p.t, records: p.ids, source: 'runs' })) });
  }
  const tByM = new Map();
  for (const r of runs) { const m = monthOf(r?.date || ''); if (ymd(r?.date)) tByM.set(m, (tByM.get(m) || 0) + (+r.tonnes || 0)); }
  series.push({ metric: 'gpl-kg-t', label: 'GPL per tonnellata prodotta', unit: 'kg/t', line: null,
    points: arr(d?.energy).filter(e => e && ok(e.month) && (tByM.get(e.month) || 0) > 0 && num(e.gplKg) != null).sort((a, b) => (a.month < b.month ? -1 : 1))
      .map(e => ({ month: e.month, value: +e.gplKg / tByM.get(e.month), records: [e.id], source: 'energy' })) });
  const wm = arr(d?.water).map(w => w.month).filter(Boolean).sort();
  if (wm.length) {
    const cm = cur ? addMonths(cur, -1) : null;
    const P = { from: wm[0] + '-01', to: cm ? endOfMonth(cm) : endOfMonth(wm.at(-1)) };
    const ws = waterStats(d, P);
    series.push({ metric: 'acqua-lt', label: 'Prelievo idrico per tonnellata', unit: 'l/t', line: null,
      points: ws.months.filter(x => x.perT != null && !x.partial).map(x => ({ month: x.month, value: x.perT * 1000, records: arr(d.water).filter(w => w.month === x.month).map(w => w.id), source: 'water' })) });
  }
  const wkg = new Map();
  for (const w of arr(d?.waste)) { const m = monthOf(w?.date || ''); if (ymd(w?.date)) { const x = wkg.get(m) || { kg: 0, ids: [] }; x.kg += +w.kg || 0; if (x.ids.length < 50) x.ids.push(w.id); wkg.set(m, x); } }
  series.push({ metric: 'rifiuti-kg-t', label: 'Rifiuti per tonnellata prodotta', unit: 'kg/t', line: null,
    points: [...wkg].filter(([m]) => ok(m) && (tByM.get(m) || 0) > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([m, x]) => ({ month: m, value: x.kg / tByM.get(m), records: x.ids, source: 'waste' })) });
  return series;
}

/**
 * Anomalie: punti con |z| ≥ K (z robusto per serie) o errore di unità. Ogni anomalia porta valore, mediana, z e i record
 * di origine (ids). P (facoltativo) limita ai mesi del periodo. Ordinate per gravità.
 */
export function anomalyList(d, today, { K = 3.5, P = null } = {}) {
  const out = [];
  for (const s of anomalySeries(d, today)) {
    const pts = s.points;
    if (pts.length < 6) continue;
    const { med, z } = madScores(pts.map(p => p.value));
    pts.forEach((p, i) => {
      const unitError = med > 0 && p.value >= UNIT_ERROR_X * med;
      if (!unitError && Math.abs(z[i]) < K) return;
      if (P && (p.month < P.from.slice(0, 7) || p.month > P.to.slice(0, 7))) return;
      out.push({ key: `${s.metric}:${p.month}`, metric: s.metric, label: s.label, unit: s.unit, line: s.line, month: p.month, value: p.value, median: med, z: z[i],
        unitError, records: p.records, source: p.source, n: pts.length });
    });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || (a.key < b.key ? -1 : 1));
}

/* ---------------- flusso di massa ---------------- */
/** Flusso di massa del periodo: consumo di materie prime (bilancio dell’impianto), prodotti (tonnellate di linea), calo di processo,
 * rifiuti di processo (esclusi gli imballi, che non entrano nel bilancio delle materie prime) e differenza non spiegata. */
export function massFlow(d, P) {
  if (!P) return null;
  const runs = arr(d?.runs).filter(r => inRange(ymd(r.date), P));
  const products = sum(runs, r => r.tonnes);
  let bal = [];
  try { bal = plantBalance(d, P) || []; } catch { bal = []; }
  const consumed = sum(bal, r => r.out || 0), lossT = sum(bal, r => r.lossT || 0);
  const wastes = arr(d?.waste).filter(w => inRange(ymd(w.date), P));
  const wasteT = sum(wastes, w => +w.kg || 0) / 1000;
  const processWasteT = sum(wastes.filter(w => !String(w.eer || '').startsWith('15 01')), w => +w.kg || 0) / 1000;
  const packagingT = wasteT - processWasteT;
  const materials = bal.filter(r => (r.out || 0) > 0.001).map(r => ({ id: r.ingId, label: r.name, t: r.out })).sort((a, b) => b.t - a.t);
  return { products, consumed, lossT, wasteT, processWasteT, packagingT, difference: consumed - products - lossT - processWasteT,
    differencePct: consumed > 0 ? (consumed - products - lossT - processWasteT) / consumed : null, materials, top: materials.slice(0, 6),
    others: sum(materials.slice(6), x => x.t), nMaterials: materials.length };
}
