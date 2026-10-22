/* FeedOS 17 · Previsione statistica semplice e verificabile.
 * Livellamento esponenziale con tendenza smorzata (Holt, φ < 1: la tendenza si spegne invece di proseguire all'infinito) e,
 * con almeno due cicli di storia (n ≥ 2m), stagionalità additiva (Holt-Winters). Parametri scelti per minimo errore sui dati
 * passati; bande dagli errori osservati, mai sotto zero. forecastAuto sceglie il modello confrontando ultimo valore,
 * media mobile a 4, livellamento semplice, Holt smorzato e Holt-Winters sull'errore a un passo con origine mobile.
 * Non è intelligenza artificiale: sono metodi classici, trasparenti e controllabili con il backtest. */
import { quantile, mean } from '../core/util.js';

const AGRID = [0.1, 0.2, 0.35, 0.5, 0.7];
const BGRID = [0.01, 0.05, 0.15];
const GGRID = [0.05, 0.15, 0.3];
/** Smorzamento della tendenza provato nella griglia. */
export const PHI_GRID = [0.8, 0.85, 0.9, 0.95, 0.98];

// somma φ + φ² + … + φ^k (k passi di tendenza smorzata)
const damp = (phi, k) => { let s = 0, p = 1; for (let i = 0; i < k; i++) { p *= phi; s += p; } return s; };

function hw(y, alpha, beta, gamma, m, phi = 1) {
  const n = y.length;
  const seasonal = m > 1 && n >= 2 * m;
  let level, trend;
  if (seasonal) { level = mean(y.slice(0, m)); trend = (mean(y.slice(m, 2 * m)) - mean(y.slice(0, m))) / m; }
  else { level = y[0]; const k = Math.min(4, n - 1); trend = k > 0 ? (y[k] - y[0]) / k : 0; } // media delle prime k differenze
  const s = seasonal ? y.slice(0, m).map(v => v - level) : [];
  const fitted = [];
  for (let t = 0; t < n; t++) {
    const si = seasonal ? s[t % m] : 0;
    const f = level + phi * trend + si;
    fitted.push(t === 0 && !seasonal ? y[0] : f);
    const prevLevel = level;
    level = alpha * (y[t] - si) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    if (seasonal) s[t % m] = gamma * (y[t] - level) + (1 - gamma) * si;
  }
  return { level, trend, s, fitted, seasonal, phi };
}

/** Adatta il modello cercando i parametri su una griglia (minimo errore quadratico a un passo), tendenza smorzata. */
export function fit(y, m = 12) {
  let best = null;
  const seas = m > 1 && y.length >= 2 * m;
  for (const a of AGRID) for (const b of BGRID) for (const p of PHI_GRID) for (const g of (seas ? GGRID : [0])) {
    const r = hw(y, a, b, g, m, p);
    const start = r.seasonal ? m : 1;
    let sse = 0;
    for (let t = start; t < y.length; t++) sse += (y[t] - r.fitted[t]) ** 2;
    if (!best || sse < best.sse - 1e-12) best = { a, b, g, phi: p, sse, r };
  }
  return best;
}

const pos = v => Math.max(0, v);

/** Previsione h passi avanti con banda empirica P10–P90 (dagli errori a un passo × √k), valori e bande mai sotto zero. */
export function forecast(y, h = 3, m = 12) {
  if (!y || y.length < 4) return null;
  const best = fit(y, m);
  const { r } = best;
  const start = r.seasonal ? m : 1;
  const res = [];
  for (let t = start; t < y.length; t++) res.push(y[t] - r.fitted[t]);
  const q10 = quantile(res, 0.1) ?? 0, q90 = quantile(res, 0.9) ?? 0;
  const out = [];
  for (let k = 1; k <= h; k++) {
    const si = r.seasonal ? r.s[(y.length + k - 1) % m] : 0;
    const f = r.level + damp(r.phi, k) * r.trend + si;
    const widen = Math.sqrt(k);
    out.push({ k, value: pos(f), lo: pos(f + q10 * widen), hi: pos(f + q90 * widen) });
  }
  return { points: out, params: { alpha: best.a, beta: best.b, gamma: best.g, phi: best.phi, seasonal: r.seasonal }, residuals: res };
}

/** Backtest con origine mobile: errore medio assoluto percentuale (MAPE) e distorsione (bias). */
export function backtest(y, h = 1, m = 12, minTrain = 8) {
  const errs = [];
  for (let t = Math.max(minTrain, 4); t + h <= y.length; t++) {
    const f = forecast(y.slice(0, t), h, m);
    if (!f) continue;
    const pred = f.points[h - 1].value, act = y[t + h - 1];
    errs.push({ t: t + h - 1, pred, act, err: pred - act, ape: act !== 0 ? Math.abs(pred - act) / Math.abs(act) : null, inBand: act >= f.points[h - 1].lo && act <= f.points[h - 1].hi });
  }
  const apes = errs.map(e => e.ape).filter(v => v != null);
  return {
    n: errs.length,
    mape: apes.length ? mean(apes) : null,
    bias: errs.length ? mean(errs.map(e => e.err)) : null,
    within10: apes.length ? apes.filter(v => v <= 0.1).length / apes.length : null,
    coverage: errs.length ? errs.filter(e => e.inBand).length / errs.length : null,
    points: errs,
  };
}

/* ---------------- scelta automatica del modello ---------------- */
function sesFit(y) {
  let best = null;
  for (const a of AGRID) {
    let level = y[0], sse = 0;
    for (let t = 1; t < y.length; t++) { sse += (y[t] - level) ** 2; level = a * y[t] + (1 - a) * level; }
    if (!best || sse < best.sse - 1e-12) best = { a, sse, level };
  }
  return best;
}
/** Modelli candidati: nome, etichetta, previsione a h passi dalla serie (null se non applicabile). */
export const MODELS = [
  { id: 'naive', label: 'Ultimo valore', fc: (y, h) => Array(h).fill(y[y.length - 1]) },
  { id: 'ma4', label: 'Media mobile a 4 settimane', fc: (y, h) => (y.length < 4 ? null : Array(h).fill(mean(y.slice(-4)))) },
  { id: 'ses', label: 'Livellamento esponenziale', fc: (y, h) => (y.length < 2 ? null : Array(h).fill(sesFit(y).level)) },
  { id: 'holtDamped', label: 'Holt con tendenza smorzata', fc: (y, h) => { if (y.length < 4) return null; const b = fit(y, 1); return Array.from({ length: h }, (_, k) => b.r.level + damp(b.r.phi, k + 1) * b.r.trend); } },
  { id: 'holtWinters', label: 'Holt-Winters stagionale', seasonal: true, fc: (y, h, m) => {
    if (!(m > 1) || y.length < 2 * m) return null;
    const b = fit(y, m); const r = b.r;
    return Array.from({ length: h }, (_, k) => r.level + damp(r.phi, k + 1) * r.trend + r.s[(y.length + k) % m]);
  } },
];
export const MODEL_LABEL = Object.fromEntries(MODELS.map(x => [x.id, x.label]));

// errori a un passo con origine mobile su y[from..to-1], ogni volta riadattando il modello su y[0..t-1]
function oneStep(model, y, from, to, m) {
  const out = [];
  for (let t = from; t < to; t++) {
    const f = model.fc(y.slice(0, t), 1, m);
    if (!f) return null;
    const pred = pos(f[0]), act = y[t];
    out.push({ t, pred, act, err: act - pred, ape: act !== 0 ? Math.abs(pred - act) / Math.abs(act) : null });
  }
  return out;
}
const mapeOf = errs => { const a = (errs || []).map(e => e.ape).filter(v => v != null); return a.length ? mean(a) : null; };

/**
 * Previsione con scelta automatica del modello.
 * Selezione: MAPE a un passo con origine mobile su y senza gli ultimi «holdout» punti (da minTrain in poi); il modello con l'errore
 * più basso vince (a parità il più semplice), quindi non fa mai peggio della media mobile a 4 (benchmark) su quella finestra.
 * Gli ultimi «holdout» punti, mai usati per scegliere, danno l'errore di verifica (holdoutMape).
 * Banda P10–P90: quantili degli errori fuori campione del modello scelto × √k, mai sotto zero.
 * → {model, label, points: [{k, value, lo, hi}], mape, holdoutMape, benchmarkMape, benchmarkHoldoutMape, candidates: [{model, label, mape, holdoutMape}], n}
 */
export function forecastAuto(y, h = 8, { m = 52, holdout = 4, minTrain = 12 } = {}) {
  const n = y?.length || 0;
  const empty = { model: 'naive', label: MODEL_LABEL.naive, points: [], mape: null, holdoutMape: null, benchmarkMape: null, benchmarkHoldoutMape: null, candidates: [], n };
  if (n < 4) return empty;
  const H = Math.max(0, Math.min(holdout, n - 8));
  const end = n - H;
  const from = Math.max(4, Math.min(minTrain, end - 3));
  const cands = [];
  for (const mod of from < end ? MODELS : []) {
    const sel = oneStep(mod, y, from, end, m);
    if (!sel) continue;
    const hold = H ? oneStep(mod, y, end, n, m) : [];
    cands.push({ model: mod.id, label: mod.label, mape: mapeOf(sel), holdoutMape: H ? mapeOf(hold) : null, errs: [...sel, ...(hold || [])], mod });
  }
  const ranked = cands.filter(c => c.mape != null);
  let best = ranked[0] || null;
  for (const c of ranked) if (c.mape < best.mape - 1e-12) best = c;
  const chosen = best?.mod || MODELS.find(x => x.id === 'holtDamped');
  const vals = chosen.fc(y, h, m) || MODELS[0].fc(y, h);
  const errs = (best?.errs || []).map(e => e.err);
  let q10 = quantile(errs, 0.1), q90 = quantile(errs, 0.9);
  if (errs.length < 5) { const f = forecast(y, h, 1); const r = f?.residuals || []; q10 = quantile(r, 0.1); q90 = quantile(r, 0.9); }
  q10 = q10 ?? 0; q90 = q90 ?? 0;
  const points = vals.map((v, i) => { const w = Math.sqrt(i + 1); return { k: i + 1, value: pos(v), lo: pos(v + q10 * w), hi: pos(v + q90 * w) }; });
  const bench = cands.find(c => c.model === 'ma4');
  return {
    model: chosen.id, label: chosen.label, points,
    mape: best?.mape ?? null, holdoutMape: best?.holdoutMape ?? null,
    benchmarkMape: bench?.mape ?? null, benchmarkHoldoutMape: bench?.holdoutMape ?? null,
    candidates: cands.map(c => ({ model: c.model, label: c.label, mape: c.mape, holdoutMape: c.holdoutMape })),
    n, selection: { from, to: end, holdout: H }, seasonal: chosen.id === 'holtWinters',
  };
}
