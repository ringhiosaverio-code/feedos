/* Statistica di base senza dipendenze: funzione beta incompleta regolarizzata, distribuzioni t di Student e F di Fisher
 * (funzioni di ripartizione e quantili), usate dall'analisi della varianza delle prove di campo (engine/agro-prove.js).
 * Algoritmi classici (frazione continua di Lentz per la beta incompleta, Lanczos per il logaritmo della gamma);
 * precisione verificata nei test contro i valori delle tavole (t 0,975 e F 0,95). */

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** Logaritmo naturale della funzione gamma (x > 0). */
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// frazione continua della beta incompleta (Lentz modificato)
function betacf(x, a, b) {
  const TINY = 1e-300, EPS = 1e-14;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, dd = 1 - (qab * x) / qap;
  if (Math.abs(dd) < TINY) dd = TINY;
  dd = 1 / dd;
  let h = dd;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    dd = 1 + aa * dd; if (Math.abs(dd) < TINY) dd = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    dd = 1 / dd; h *= dd * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    dd = 1 + aa * dd; if (Math.abs(dd) < TINY) dd = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    dd = 1 / dd;
    const del = dd * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regolarizzata I_x(a, b), 0 ≤ x ≤ 1. */
export function ibeta(x, a, b) {
  if (!(x > 0)) return 0;
  if (!(x < 1)) return 1;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  return x < (a + 1) / (a + b + 2) ? Math.exp(lnFront) * betacf(x, a, b) / a : 1 - Math.exp(lnFront) * betacf(1 - x, b, a) / b;
}

/** Funzione di ripartizione della t di Student con df gradi di libertà. */
export function tCdf(t, df) {
  if (!(df > 0) || !Number.isFinite(t)) return t === Infinity ? 1 : t === -Infinity ? 0 : NaN;
  const x = df / (df + t * t);
  const tail = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Quantile della t di Student: tInv(0.975, 12) ≈ 2,179. Bisezione sulla funzione di ripartizione (monotona). */
export function tInv(p, df) {
  if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInv(1 - p, df);
  let lo = 0, hi = 1;
  while (tCdf(hi, df) < p && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/** Funzione di ripartizione della F di Fisher con (d1, d2) gradi di libertà. */
export function fCdf(f, d1, d2) {
  if (!(f > 0)) return 0;
  if (!Number.isFinite(f)) return 1;
  return ibeta((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2);
}

/** Quantile della F: fInv(0.95, 3, 9) ≈ 3,863. */
export function fInv(p, d1, d2) {
  if (!(p > 0 && p < 1)) return NaN;
  let lo = 0, hi = 1;
  while (fCdf(hi, d1, d2) < p && hi < 1e7) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (fCdf(mid, d1, d2) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}
