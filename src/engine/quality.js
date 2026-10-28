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

/* Agrofarmaci: tolleranze sul contenuto di sostanza attiva dichiarato (g/kg o g/L), secondo lo schema del manuale FAO/OMS
 * delle specifiche (da verificare): fino a 25 ±15% (±25% per granuli e WG), oltre 25 fino a 100 ±10%, oltre 100 fino a 250 ±6%,
 * oltre 250 fino a 500 ±5%, oltre 500 ±25 g. */
export const AS_TOLERANCE_NOTE = 'Tolleranze sul contenuto di sostanza attiva secondo lo schema FAO/OMS delle specifiche degli agrofarmaci (da verificare sulla specifica del prodotto).';
export function asToleranceRange(declared, form = '') {
  if (declared == null || !(declared > 0)) return null;
  const het = /^(WG|WDG|GR|DP|WP)$/i.test(String(form));
  const d = declared <= 25 ? declared * (het ? 0.25 : 0.15) : declared <= 100 ? declared * 0.1 : declared <= 250 ? declared * 0.06 : declared <= 500 ? declared * 0.05 : 25;
  return { min: declared - d, max: declared + d };
}

/** Intervallo ammesso [min, max] per un valore dichiarato in etichetta (titolo: contenuto di sostanza attiva degli agrofarmaci). */
export function toleranceRange(param, declared, form) {
  if (param === 'titolo') return asToleranceRange(declared, form);
  const t = TOL[param];
  if (!t || declared == null) return null;
  const band = t.find(b => declared < b[0]) || t[t.length - 1];
  const [, lo, hi, kind] = band;
  const dl = kind === 'u' ? lo : declared * lo / 100;
  const dh = kind === 'u' ? hi : declared * hi / 100;
  return { min: declared - dl, max: declared + dh };
}

/** Verifica un'analisi rispetto al valore dichiarato. */
export function checkAnalysis(param, value, declared, form) {
  const r = toleranceRange(param, declared, form);
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
