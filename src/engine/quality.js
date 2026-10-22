/* FeedOS 16 · Qualità: tolleranze di etichetta, carte di controllo, capacità, richiamo. */
import { mean, stdev } from '../core/util.js';

/* Tolleranze sui componenti analitici dichiarati (Reg. CE 767/2009, all. IV parte A, come modificato dal
 * Reg. UE 2017/2279) per mangimi per animali da produzione alimentare. Per ogni fascia: [limite superiore della
 * fascia, tolleranza in difetto, tolleranza in eccesso, tipo] dove tipo 'u' = unità percentuali, 'r' = % del dichiarato. */
const TOL = {
  PG: [[8, 1, 1, 'u'], [24, 12.5, 12.5, 'r'], [Infinity, 3, 3, 'u']],
  GG: [[8, 1, 2, 'u'], [24, 12.5, 25, 'r'], [Infinity, 3, 6, 'u']],
  FG: [[10, 1.75, 1.75, 'u'], [20, 17.5, 17.5, 'r'], [Infinity, 3.5, 3.5, 'u']],
  CE: [[8, 2, 1, 'u'], [32, 25, 12.5, 'r'], [Infinity, 8, 4, 'u']],
  CA: [[1, 0.3, 0.6, 'u'], [5, 30, 60, 'r'], [Infinity, 1.5, 3, 'u']],
  NA: [[1, 0.3, 0.6, 'u'], [5, 30, 60, 'r'], [Infinity, 1.5, 3, 'u']],
};
export const TOLERANCE_NOTE = 'Tolleranze del Reg. (CE) 767/2009, all. IV, parte A (testo modificato dal Reg. UE 2017/2279), mangimi per animali da produzione alimentare.';

/** Intervallo ammesso [min, max] per un valore dichiarato in etichetta. */
export function toleranceRange(param, declared) {
  const t = TOL[param];
  if (!t || declared == null) return null;
  const band = t.find(b => declared < b[0]) || t[t.length - 1];
  const [, lo, hi, kind] = band;
  const dl = kind === 'u' ? lo : declared * lo / 100;
  const dh = kind === 'u' ? hi : declared * hi / 100;
  return { min: declared - dl, max: declared + dh };
}

/** Verifica un'analisi rispetto al valore dichiarato. */
export function checkAnalysis(param, value, declared) {
  const r = toleranceRange(param, declared);
  if (!r || value == null) return { status: 'n/d' };
  if (value < r.min) return { status: 'difetto', ...r };
  if (value > r.max) return { status: 'eccesso', ...r };
  return { status: 'ok', ...r };
}

/** Statistiche di una carta di controllo per valori individuali (media ± 3 σ) e capacità rispetto ai limiti. */
export function controlStats(values, lsl, usl) {
  const v = values.filter(x => x != null && Number.isFinite(x));
  if (v.length < 3) return null;
  const m = mean(v), s = stdev(v) || 0;
  // σ stimata anche con l'escursione mobile media (più robusta per valori individuali)
  let mr = 0;
  for (let i = 1; i < v.length; i++) mr += Math.abs(v[i] - v[i - 1]);
  const sMR = v.length > 1 ? (mr / (v.length - 1)) / 1.128 : s;
  const sig = sMR || s;
  const ucl = m + 3 * sig, lcl = m - 3 * sig;
  const out = v.map((x, i) => ({ i, x, out: x > ucl || x < lcl }));
  let cpk = null;
  if (sig > 0 && (lsl != null || usl != null)) {
    const a = usl != null ? (usl - m) / (3 * sig) : Infinity;
    const b = lsl != null ? (m - lsl) / (3 * sig) : Infinity;
    cpk = Math.min(a, b);
  }
  // regola delle serie: 8 punti consecutivi dallo stesso lato della media
  let run = 0, side = 0, runs = 0;
  for (const x of v) { const sd = x > m ? 1 : x < m ? -1 : 0; if (sd !== 0 && sd === side) run++; else { side = sd; run = 1; } if (run === 8) runs++; }
  return { n: v.length, mean: m, sd: sig, ucl, lcl, outOfControl: out.filter(o => o.out).length, cpk, runs };
}
