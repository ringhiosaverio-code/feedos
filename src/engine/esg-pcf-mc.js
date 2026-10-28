/* FeedOS 18 · Impronta mangimi (pacchetto WP2 «pcf»): incertezza dell'impronta con il metodo Monte Carlo.
 * Ogni contributo (materia prima, energia, imballaggio, trasporto) varia con una distribuzione triangolare (minimo, centrale,
 * massimo); i contributi sono indipendenti. Generatore con seme (core/util rng): stesso seme, stesso risultato. Al massimo 2.000
 * iterazioni. Funzione pura, senza orologio né console. */
import { rng } from '../core/util.js';

export const MC_MAX = 2000;

/** Intervallo relativo di un fattore senza minimo e massimo, secondo la qualità del dato (DQR 1 ottimo … 5 scarso). */
export function spreadByDqr(dqr) {
  const q = Number.isFinite(+dqr) ? Math.round(+dqr) : 5;
  const w = q <= 1 ? 0.1 : q === 2 ? 0.15 : q === 3 ? 0.25 : q === 4 ? 0.35 : 0.5;
  return { low: 1 - w, high: 1 + w };
}

/** Estrazione da una triangolare (a minimo, c moda, b massimo) con u uniforme in [0, 1). */
export function triangular(u, a, c, b) {
  if (!(b > a)) return c;
  const f = (c - a) / (b - a);
  return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

/**
 * Monte Carlo sulla somma dei contributi. inputs: [{central, low, high}] (stessa unità, es. kg CO₂e/t); n iterazioni (≤ 2.000);
 * seed intero. → {p10, p50, p90, mean, n, central}. Senza contributi validi → valori nulli e n = 0.
 */
export function pcfMonteCarlo(inputs, n = MC_MAX, seed = 18) {
  const xs = (Array.isArray(inputs) ? inputs : []).filter(x => x && Number.isFinite(+x.central)).map(x => {
    const c = +x.central;
    let lo = Number.isFinite(+x.low) ? +x.low : c, hi = Number.isFinite(+x.high) ? +x.high : c;
    if (lo > hi) [lo, hi] = [hi, lo];
    return { a: Math.min(lo, c), c, b: Math.max(hi, c) };
  });
  const central = xs.reduce((s, x) => s + x.c, 0);
  const N = Math.max(0, Math.min(MC_MAX, Math.round(+n || 0)));
  if (!xs.length || !N) return { p10: xs.length ? central : null, p50: xs.length ? central : null, p90: xs.length ? central : null, mean: xs.length ? central : null, n: 0, central: xs.length ? central : null };
  const R = rng((Math.round(+seed) || 18) >>> 0);
  const out = new Float64Array(N);
  let tot = 0;
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (const x of xs) s += triangular(R.next(), x.a, x.c, x.b);
    out[k] = s; tot += s;
  }
  out.sort();
  const q = p => { const h = (N - 1) * p, i = Math.floor(h), f = h - i; return i + 1 < N ? out[i] + f * (out[i + 1] - out[i]) : out[i]; };
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: tot / N, n: N, central };
}
