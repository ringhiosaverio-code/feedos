/* FeedOS 18 · Obiettivi e piano (pacchetto WP7 «piano»): calcoli puri, senza dati dell'archivio.
 * Economia delle misure (fattore di recupero del capitale, costo annuo, costo marginale di abbattimento, tempo di ritorno, valore
 * attuale netto al prezzo interno del carbonio), curva dei costi di abbattimento, traiettorie lineari, categoria SBTi e controllo
 * FLAG, iperammortamento per scaglioni, tep dei certificati bianchi, scatti del margine dei finanziamenti legati alla sostenibilità.
 * Funzioni pure: nessun orologio, nessuna eccezione, nessun messaggio in console. Importi in €, emissioni in t CO₂e all'anno. */

export const finite = v => v != null && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
export const num = v => (finite(v) ? +v : null);
const posInt = (v, fb) => { const n = Math.round(num(v) ?? fb); return n >= 1 ? n : 1; };

/** Fattore di recupero del capitale: r(1+r)^n / ((1+r)^n − 1); con r = 0 vale 1/n. */
export function crf(r, n) {
  const k = posInt(n, 1), x = num(r) ?? 0;
  if (!(x > 0)) return 1 / k;
  const f = (1 + x) ** k;
  return (x * f) / (f - 1);
}
/** Fattore di attualizzazione di una rendita: Σ 1/(1+r)^t per t = 1…n (= 1 / CRF). */
export function annuityFactor(r, n) {
  const k = Math.max(0, Math.round(num(n) ?? 0)), x = num(r) ?? 0;
  if (!k) return 0;
  if (!(x > 0)) return k;
  return (1 - (1 + x) ** -k) / x;
}

/**
 * Economia di una misura. m: {capex, opexDelta (maggior costo annuo, + = costa), savingsEur (risparmio annuo), tco2Year, lifeYears};
 * prm: {carbonPrice (€/t CO₂e), rate (tasso di sconto), horizon (anni se manca la vita utile), incentiveValue (€ attuali che riducono il capex)}.
 *   capexNet   = capex − incentivo
 *   annualCost = capexNet · CRF + opexDelta − savings          (€/anno; negativo = la misura fa risparmiare)
 *   MAC        = annualCost / tco2Year                         (€/t CO₂e)
 *   payback    = capexNet / (savings − opexDelta)               (anni; null se il flusso annuo non è positivo)
 *   NPV(c)     = −capexNet + Σ_{t=1..n} (savings − opexDelta + c · tco2Year) / (1+r)^t
 * Il VAN cambia segno esattamente quando il prezzo del carbonio è uguale al MAC (breakEven).
 */
export function economics(m = {}, prm = {}) {
  const capex = Math.max(0, num(m.capex) ?? 0), opex = num(m.opexDelta) ?? 0, sav = num(m.savingsEur) ?? 0, t = num(m.tco2Year);
  const rate = num(prm.rate) ?? 0.06, c = num(prm.carbonPrice) ?? 0, n = posInt(m.lifeYears, num(prm.horizon) ?? 10);
  const incentive = Math.max(0, Math.min(capex, num(prm.incentiveValue) ?? 0));
  const capexNet = capex - incentive;
  const net = sav - opex;
  const k = crf(rate, n), af = annuityFactor(rate, n);
  const annualCost = capexNet * k + opex - sav;
  const mac = t != null && t > 0 ? annualCost / t : null;
  const payback = net > 0 ? capexNet / net : null;
  const npvAt = price => -capexNet + (net + (num(price) ?? 0) * (t != null && t > 0 ? t : 0)) * af;
  return {
    capex, incentive, capexNet, opexDelta: opex, savings: sav, net, tco2: t, life: n, rate, crf: k, af,
    annualCost, mac, payback, npvNoCarbon: npvAt(0), npv: npvAt(c), npvAt, carbonPrice: c, breakEven: mac,
    complete: t != null && t > 0 && num(m.capex) != null,
  };
}

/**
 * Curva dei costi marginali di abbattimento: barre di larghezza = t CO₂e/anno e altezza = €/t, dalla più conveniente.
 * rows: [{id, label, tco2, mac, ...}] → {bars: [{...row, x0, x1}], total, saving (t a costo negativo), excluded: [righe senza t o MAC]}
 */
export function maccCurve(rows = []) {
  const ok = [], excluded = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r && finite(r.tco2) && +r.tco2 > 0 && finite(r.mac)) ok.push(r); else if (r) excluded.push(r);
  }
  ok.sort((a, b) => a.mac - b.mac || b.tco2 - a.tco2 || String(a.id).localeCompare(String(b.id)));
  let x = 0;
  const bars = ok.map(r => { const x0 = x; x += +r.tco2; return { ...r, x0, x1: x }; });
  return { bars, total: x, saving: bars.filter(b => b.mac < 0).reduce((s, b) => s + b.tco2, 0), excluded };
}

/* ---------------- traiettorie ---------------- */
/** Valore della traiettoria lineare di un obiettivo nell'anno y (prima dell'anno base: il valore base; dopo l'anno obiettivo: l'obiettivo). */
export function pathAt(t, year) {
  const by = num(t?.baseYear), ty = num(t?.targetYear), b = num(t?.baseValue), v = num(t?.targetValue), y = num(year);
  if (by == null || ty == null || b == null || v == null || y == null) return null;
  if (ty <= by) return y >= ty ? v : b;
  const f = Math.max(0, Math.min(1, (y - by) / (ty - by)));
  return b + (v - b) * f;
}
/** Punti della traiettoria lineare anno per anno, dall'anno base all'anno obiettivo (o fino a toYear). */
export function trajectory(t, toYear) {
  const by = num(t?.baseYear), ty = num(t?.targetYear);
  if (by == null || ty == null) return [];
  const end = Math.max(ty, num(toYear) ?? ty);
  const out = [];
  for (let y = by; y <= end && out.length < 60; y++) out.push({ year: y, value: pathAt(t, y) });
  return out;
}
/** Riduzione percentuale dell'obiettivo rispetto al valore base (positiva = riduzione). */
export function reductionPct(t) {
  const b = num(t?.baseValue), v = num(t?.targetValue);
  return b != null && v != null && b !== 0 ? (b - v) / Math.abs(b) : null;
}
/**
 * Obiettivo di riferimento lineare ispirato ai criteri SBTi: valore base × (1 − tasso × anni), mai sotto zero.
 * kind 's12' (−4,2% l'anno) | 'flag' (−3,03% l'anno). Non è una validazione SBTi.
 */
export function referenceTarget({ baseValue, baseYear, targetYear, kind = 's12', rates = { s12: 0.042, flag: 0.0303 } } = {}) {
  const b = num(baseValue), by = num(baseYear), ty = num(targetYear);
  if (b == null || by == null || ty == null || ty <= by) return null;
  const r = num(rates?.[kind]) ?? (kind === 'flag' ? 0.0303 : 0.042);
  return { value: Math.max(0, b * (1 - r * (ty - by))), rate: r, years: ty - by, reduction: Math.min(1, r * (ty - by)) };
}
/** Tasso annuo composto necessario per passare da `from` a `to` in `years` anni (negativo = riduzione). */
export function requiredRate(from, to, years) {
  const a = num(from), b = num(to), n = num(years);
  if (a == null || b == null || n == null || n <= 0 || a <= 0 || b < 0) return null;
  return (b / a) ** (1 / n) - 1;
}

/* ---------------- SBTi: categoria e FLAG ---------------- */
/**
 * Categoria SBTi (Corporate Net-Zero Standard V2, paese ad alto reddito): A se Scope 1 + 2 ≥ 10.000 t, oppure se si superano almeno
 * 2 soglie su 3 (stato patrimoniale ≥ 25 M€, ricavi ≥ 50 M€, ≥ 250 dipendenti equivalenti a tempo pieno); altrimenti B.
 * → {category, tests: [{id, label, value, threshold, met, known}], met, unknown, reason, provisional}
 */
export function sbtiCategory({ s12, balanceSheet, turnover, fte } = {}, crit = {}) {
  const C = { s12: 10000, balanceSheet: 25000000, turnover: 50000000, fte: 250, minTests: 2, ...(crit || {}) };
  const t = (id, label, value, threshold) => ({ id, label, value: num(value), threshold, known: num(value) != null, met: num(value) != null && +value >= threshold });
  const emis = t('s12', 'Scope 1 + 2 ≥ 10.000 t CO₂e', s12, C.s12);
  const tests = [t('balanceSheet', 'Stato patrimoniale ≥ 25 M€', balanceSheet, C.balanceSheet), t('turnover', 'Ricavi ≥ 50 M€', turnover, C.turnover), t('fte', 'Dipendenti ≥ 250 a tempo pieno', fte, C.fte)];
  const met = tests.filter(x => x.met).length, unknown = tests.filter(x => !x.known).length;
  let category, reason;
  if (emis.met) { category = 'A'; reason = 'Scope 1 + 2 sopra 10.000 t CO₂e'; }
  else if (met >= C.minTests) { category = 'A'; reason = `${met} soglie dimensionali su 3 superate`; }
  else { category = 'B'; reason = `${met} ${met === 1 ? 'soglia dimensionale superata' : 'soglie dimensionali superate'} su 3 e Scope 1 + 2 sotto 10.000 t CO₂e`; }
  const provisional = category === 'B' && (!emis.known || met + unknown >= C.minTests);
  return { category, tests: [emis, ...tests], met, unknown, reason, provisional };
}
/**
 * Controllo FLAG: quota delle emissioni FLAG sul totale; sopra la soglia (di base 20%) serve un obiettivo FLAG e un impegno di
 * zero deforestazione entro 2 anni dalla presentazione dell'obiettivo e comunque entro il 31/12/2030.
 */
export function flagCheck({ flag, total } = {}, { share = 0.2, maxYears = 2, latest = '2030-12-31' } = {}, submission = null) {
  const f = num(flag), tot = num(total);
  const s = f != null && tot > 0 ? f / tot : null;
  const sub = typeof submission === 'string' && /^\d{4}-\d{2}-\d{2}/.test(submission) ? submission.slice(0, 10) : null;
  const byRule = sub ? `${+sub.slice(0, 4) + maxYears}${sub.slice(4)}` : null;
  const deadline = byRule && byRule < latest ? byRule : latest;
  return { share: s, required: s != null && s >= share, threshold: share, deadline, fromSubmission: !!sub };
}

/* ---------------- incentivi ---------------- */
/**
 * Iperammortamento per scaglioni dell'investimento complessivo: bands [{upTo, base, green}] in € cumulati.
 * → {total, amount (maggiorazione in €), rate (media), rows: [{from, to, part, rateApplied, amount}]}
 */
export function iperUplift(total, green = false, bands = []) {
  const T = Math.max(0, num(total) ?? 0);
  let from = 0, amount = 0;
  const rows = [];
  for (const b of Array.isArray(bands) ? bands : []) {
    const to = num(b?.upTo); if (to == null || to <= from) continue;
    const part = Math.max(0, Math.min(T, to) - from);
    const rateApplied = num(green ? b.green : b.base) ?? 0;
    rows.push({ from, to, part, rateApplied, amount: part * rateApplied });
    amount += part * rateApplied;
    from = to;
  }
  return { total: T, amount, rate: T > 0 ? amount / T : 0, rows, over: T > from ? T - from : 0 };
}
/** Valore fiscale attuale della maggiorazione: maggiorazione × IRES, distribuita sugli anni di ammortamento e scontata. */
export function iperTaxValue(upliftAmount, { ires = 0.24, rate = 0.06, years = 5 } = {}) {
  const u = Math.max(0, num(upliftAmount) ?? 0), n = posInt(years, 5), r = num(ires) ?? 0.24;
  const nominal = u * r;
  return { nominal, present: (nominal / n) * annuityFactor(num(rate) ?? 0.06, n), years: n };
}
/** Prova del risparmio per la maggiorazione «green»: ≥ 3% dei consumi dell'unità locale oppure ≥ 5% dei processi interessati. */
export function greenTest({ savedMWh, unitMWh, processMWh } = {}, { unit = 0.03, process = 0.05 } = {}) {
  const s = num(savedMWh), u = num(unitMWh), p = num(processMWh);
  const pctUnit = s != null && u > 0 ? s / u : null, pctProcess = s != null && p > 0 ? s / p : null;
  const passUnit = pctUnit != null && pctUnit >= unit, passProcess = pctProcess != null && pctProcess >= process;
  return { pctUnit, pctProcess, passUnit, passProcess, pass: passUnit || passProcess, known: pctUnit != null || pctProcess != null, thresholds: { unit, process } };
}
/** Tonnellate equivalenti di petrolio risparmiate (certificati bianchi): MWh elettrici, migliaia di Sm³ di gas, t di GPL, migliaia di litri di gasolio. */
export function teeToe({ mwhEl = 0, kSmcGas = 0, tGpl = 0, kLDiesel = 0 } = {}, f = { mwhEl: 0.187, kSmcGas: 0.82, tGpl: 1.10, kLDiesel: 0.86 }) {
  return (num(mwhEl) ?? 0) * (num(f.mwhEl) ?? 0.187) + (num(kSmcGas) ?? 0) * (num(f.kSmcGas) ?? 0.82) + (num(tGpl) ?? 0) * (num(f.tGpl) ?? 1.1) + (num(kLDiesel) ?? 0) * (num(f.kLDiesel) ?? 0.86);
}

/* ---------------- finanziamenti legati alla sostenibilità ---------------- */
/** Effetto annuo di uno scatto del margine: bps × importo / 10.000 (€). Positivo = maggior costo, negativo = sconto. */
export function ratchetEur(amount, bps) {
  const a = num(amount), b = num(bps);
  return a != null && b != null ? (a * b) / 10000 : null;
}
/**
 * Esito di un KPI rispetto all'obiettivo dell'anno (SPT): dir 'down' → raggiunto se valore ≤ SPT; 'up' → se ≥ SPT.
 * Scatto: −ratchetBps se raggiunto, +ratchetBps se mancato, 0 se il valore manca (a contratto si applica di solito la penalità).
 */
export function sptOutcome(value, spt, dir = 'down', ratchetBps = 0) {
  const v = num(value), s = num(spt), r = Math.abs(num(ratchetBps) ?? 0);
  if (s == null) return { met: null, bps: 0, margin: null };
  if (v == null) return { met: null, bps: r, margin: null, missing: true };
  const met = dir === 'up' ? v >= s : v <= s;
  return { met, bps: met ? -r : r, margin: dir === 'up' ? (v - s) / Math.abs(s || 1) : (s - v) / Math.abs(s || 1) };
}
