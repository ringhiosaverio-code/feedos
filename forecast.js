/* FeedOS 16 · Previsione statistica semplice e verificabile.
 * Livellamento esponenziale con tendenza (Holt) e, con almeno due cicli di storia, stagionalità additiva
 * (Holt-Winters). Parametri scelti per minimo errore sui dati passati; bande dagli errori osservati.
 * Non è intelligenza artificiale: è un metodo classico, trasparente e controllabile con il backtest. */
import { quantile, mean } from '../core/util.js';

function hw(y, alpha, beta, gamma, m) {
  const n = y.length;
  const seasonal = m > 1 && n >= 2 * m;
  let level = seasonal ? mean(y.slice(0, m)) : y[0];
  let trend = seasonal ? (mean(y.slice(m, 2 * m)) - mean(y.slice(0, m))) / m : (n > 1 ? y[1] - y[0] : 0);
  const s = seasonal ? y.slice(0, m).map(v => v - level) : [];
  const fitted = [];
  for (let t = 0; t < n; t++) {
    const si = seasonal ? s[t % m] : 0;
    const f = level + trend + si;
    fitted.push(t === 0 && !seasonal ? y[0] : f);
    const prevLevel = level;
    level = alpha * (y[t] - si) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    if (seasonal) s[t % m] = gamma * (y[t] - level) + (1 - gamma) * si;
  }
  return { level, trend, s, fitted, seasonal };
}

/** Adatta il modello cercando i parametri su una griglia (minimo errore quadratico a un passo). */
export function fit(y, m = 12) {
  const grid = [0.1, 0.2, 0.35, 0.5, 0.7];
  const bgrid = [0.01, 0.05, 0.15];
  const ggrid = [0.05, 0.15, 0.3];
  let best = null;
  for (const a of grid) for (const b of bgrid) for (const g of (m > 1 && y.length >= 2 * m ? ggrid : [0])) {
    const r = hw(y, a, b, g, m);
    const start = r.seasonal ? m : 1;
    let sse = 0;
    for (let t = start; t < y.length; t++) sse += (y[t] - r.fitted[t]) ** 2;
    if (!best || sse < best.sse) best = { a, b, g, sse, r };
  }
  return best;
}

/** Previsione h passi avanti con banda empirica P10–P90 (dagli errori a un passo). */
export function forecast(y, h = 3, m = 12) {
  if (y.length < 4) return null;
  const best = fit(y, m);
  const { r } = best;
  const start = r.seasonal ? m : 1;
  const res = [];
  for (let t = start; t < y.length; t++) res.push(y[t] - r.fitted[t]);
  const q10 = quantile(res, 0.1) ?? 0, q90 = quantile(res, 0.9) ?? 0;
  const out = [];
  for (let k = 1; k <= h; k++) {
    const si = r.seasonal ? r.s[(y.length + k - 1) % m] : 0;
    const f = r.level + k * r.trend + si;
    const widen = Math.sqrt(k);
    out.push({ k, value: f, lo: f + q10 * widen, hi: f + q90 * widen });
  }
  return { points: out, params: { alpha: best.a, beta: best.b, gamma: best.g, seasonal: r.seasonal }, residuals: res };
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
