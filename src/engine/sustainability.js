/* FeedOS 16 · Misure di sostenibilità oltre all'energia: acqua, rifiuti, inventario delle emissioni Scope 1-2-3,
 * risposte al questionario ESG, livello di maturità e prossimi passi. Calcolo puro, senza interfaccia.
 * Ogni numero dichiara la fonte: registri dell'app (acqua, rifiuti, produzione, energia) o risposte al questionario. */
import { SURVEY_SECTIONS, SURVEY_QUESTIONS, QUESTION, visible, answered } from '../data/survey.js';
import { EER_BY_CODE, isHazardous } from '../data/eer.js';
import { DEFAULTS } from './energy.js';
import { sum, addDays, nf, daysInMonth } from '../core/util.js';

// mesi del periodo per i registri mensili: da quello di inizio a quello di fine (il mese in corso non ha ancora la lettura)
const inMonth = (P, m) => m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7);
const inDay = (P, x) => x >= P.from && x <= P.to;
const YN = v => (v === 'si' ? 'Sì' : v === 'no' ? 'No' : null);
const numOr = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
export const HOURS_PER_FTE = 1720;

function tonnesByMonth(runs) {
  const t = {};
  for (const r of runs) { const m = r.date.slice(0, 7); t[m] = (t[m] || 0) + (+r.tonnes || 0); }
  return t;
}
/** Quota di giorni del mese coperta dal registro di produzione: meno di 1 solo nel primo e nell'ultimo mese del registro,
 * se comincia o finisce a metà (es. lavorazioni registrate dal 27 ottobre). Restituisce la funzione mese → quota. */
function runCoverage(runs) {
  let first = null, last = null;
  for (const r of runs) { if (!first || r.date < first) first = r.date; if (!last || r.date > last) last = r.date; }
  return m => {
    if (!first || m < first.slice(0, 7) || m > last.slice(0, 7)) return 0;
    const from = m === first.slice(0, 7) ? +first.slice(8, 10) : 1, to = m === last.slice(0, 7) ? +last.slice(8, 10) : daysInMonth(m);
    return (to - from + 1) / daysInMonth(m);
  };
}
/** Sotto questa quota la produzione registrata non rappresenta il mese: la lettura del contatore sì, i litri per tonnellata no. */
export const MIN_RUN_COVERAGE = 0.9;

/* ---------------- acqua ---------------- */
/** Prelievi idrici del periodo dal registro (una riga per mese e fonte). Litri per tonnellata, intensità e tendenza solo sui mesi
 * con lettura e con la produzione registrata per intero: un mese in cui il registro comincia o finisce a metà ha la lettura
 * di tutto il mese ma solo una parte delle tonnellate, e gonfierebbe il rapporto. */
export function waterStats(d, P) {
  const rows = (d.water || []).filter(w => inMonth(P, w.month));
  const tByM = tonnesByMonth(d.runs || []);   // produzione dell'intero mese, per confrontarla con la lettura del mese
  const cover = runCoverage(d.runs || []);
  const months = [...new Set(rows.map(w => w.month))].sort();
  const bySource = {};
  for (const r of rows) { const s = r.source || 'Acquedotto'; bySource[s] = (bySource[s] || 0) + (+r.m3 || 0); }
  const byMonth = months.map(m => {
    const rs = rows.filter(r => r.month === m);
    const src = {};
    for (const r of rs) { const s = r.source || 'Acquedotto'; src[s] = (src[s] || 0) + (+r.m3 || 0); }
    const m3 = sum(rs, r => r.m3), t = tByM[m] || 0, coverage = cover(m), partial = t > 0 && coverage < MIN_RUN_COVERAGE;
    return { month: m, m3, bySource: src, tonnes: t, coverage, partial, perT: t > 0 && !partial ? m3 / t : null };
  });
  const m3 = sum(rows, r => r.m3);
  const full = byMonth.filter(x => x.perT != null);
  const tCovered = sum(full, x => x.tonnes);
  // tendenza: ultimi 3 mesi confrontabili contro i precedenti del periodo
  const last = full.slice(-3), prev = full.slice(0, -3);
  const ratio = a => { const t = sum(a, x => x.tonnes); return t > 0 ? sum(a, x => x.m3) / t : null; };
  const recent = ratio(last), before = prev.length >= 3 ? ratio(prev) : null;
  const sourceDrift = {};
  if (before) for (const src of Object.keys(bySource)) {
    const r = a => { const t = sum(a, x => x.tonnes); return t > 0 ? sum(a, x => x.bySource[src] || 0) / t : null; };
    const x = r(last), y = r(prev);
    if (x != null && y) sourceDrift[src] = x / y - 1;
  }
  return {
    m3, months: byMonth, bySource, nMonths: months.length, tonnes: tCovered,
    intensity: tCovered > 0 ? sum(full, x => x.m3) / tCovered : null,   // m³ per tonnellata prodotta, sui mesi confrontabili
    partial: byMonth.filter(x => x.partial).map(x => x.month),
    recent, before, drift: recent != null && before ? recent / before - 1 : null, sourceDrift,
    lastMonth: months[months.length - 1] || null,
  };
}

/* ---------------- rifiuti ---------------- */
export function wasteStats(d, P) {
  const rows = (d.waste || []).filter(w => inDay(P, w.date));
  const runs = (d.runs || []).filter(r => inDay(P, r.date));
  const tonnes = sum(runs, r => r.tonnes);
  const haz = w => w.hazardous ?? isHazardous(w.eer);
  const kg = sum(rows, w => w.kg), hazKg = sum(rows.filter(haz), w => w.kg), recKg = sum(rows.filter(w => w.dest === 'recupero'), w => w.kg);
  const codes = {};
  for (const w of rows) {
    const k = w.eer || 'n.d.';
    const c = codes[k] ||= { code: k, name: w.name || EER_BY_CODE[k]?.name || 'Rifiuto', kg: 0, recKg: 0, hazardous: haz(w), recoverable: !!EER_BY_CODE[k]?.recoverable, n: 0 };
    c.kg += +w.kg || 0; c.n++;
    if (w.dest === 'recupero') c.recKg += +w.kg || 0;
  }
  const byCode = Object.values(codes).sort((a, b) => b.kg - a.kg);
  // imballaggi e altri rifiuti di norma recuperabili mandati a smaltimento: opportunità concreta
  const missed = byCode.filter(c => c.recoverable && c.kg - c.recKg > 0).map(c => ({ ...c, disposedKg: c.kg - c.recKg }));
  const scrapT = sum(runs, r => r.waste || 0);
  return {
    kg, hazKg, nonHazKg: kg - hazKg, recKg, disposedKg: kg - recKg, n: rows.length,
    recovery: kg > 0 ? recKg / kg : null, hazShare: kg > 0 ? hazKg / kg : null,
    perT: tonnes > 0 ? kg / tonnes : null, tonnes, byCode, missed, missedKg: sum(missed, c => c.disposedKg),
    scrapT, scrapShare: tonnes > 0 ? scrapT / tonnes : null,
  };
}

/* ---------------- inventario delle emissioni ---------------- */
/** Scope 1 (GPL + gas naturale + gasolio), Scope 2 location-based, Scope 3 categoria 1 (materie prime acquistate, stima). */
export function ghgInventory({ energy: b, survey = {}, ingCO2Kg = 0, tonnes = 0, revenue = 0, factors = DEFAULTS }) {
  const gasSmc = numOr(survey['en-gas']) || 0, dieselL = numOr(survey['en-diesel']) || 0;
  const fGas = factors.feGas || DEFAULTS.feGas, fDiesel = factors.feDiesel || DEFAULTS.feDiesel;
  const s1Gpl = b?.scope1 || 0, s1Gas = gasSmc * fGas / 1000, s1Diesel = dieselL * fDiesel / 1000;
  const scope1 = s1Gpl + s1Gas + s1Diesel, scope2 = b?.scope2 || 0, scope3 = ingCO2Kg / 1000;
  const total = scope1 + scope2 + scope3;
  return {
    scope1, scope2, scope3, total, s1Gpl, s1Gas, s1Diesel, gasSmc, dieselL,
    perT: tonnes > 0 ? total * 1000 / tonnes : null,
    perTOps: tonnes > 0 ? (scope1 + scope2) * 1000 / tonnes : null,
    perMEur: revenue > 0 ? (scope1 + scope2) / (revenue / 1e6) : null,
    shares: total > 0 ? { s1: scope1 / total, s2: scope2 / total, s3: scope3 / total } : null,
  };
}

/* ---------------- materie prime e fornitori ---------------- */
export function rawMaterials(d, P) {
  const ingById = Object.fromEntries(d.ingredients.map(i => [i.id, i]));
  const formById = Object.fromEntries(d.formulas.map(f => [f.id, f]));
  const kg = {};
  for (const r of d.runs) {
    if (!inDay(P, r.date)) continue;
    const f = formById[r.formulaId]; if (!f) continue;
    const lines = ((f.history || []).find(h => h.version === r.formulaVersion) || f).lines || [];
    for (const l of lines) kg[l.ing] = (kg[l.ing] || 0) + r.tonnes * l.kg / 1000;
  }
  return Object.entries(kg).map(([id, t]) => ({ id, name: ingById[id]?.name || id, t, origin: ingById[id]?.origin || 'n.d.', certified: !!ingById[id]?.certified }))
    .sort((a, b) => b.t - a.t);
}

export function supplierStats(d, P) {
  const ingById = Object.fromEntries(d.ingredients.map(i => [i.id, i]));
  const lots = (d.ingLots || []).filter(l => inDay(P, l.date) && l.status !== 'bloccato');
  const val = l => (+l.tonnes || 0) * (+l.price || 0);
  const bySup = {}, geo = { Italia: 0, UE: 0, 'Extra-UE': 0 };
  for (const l of lots) {
    const s = l.supplier || ingById[l.ingId]?.supplier || 'n.d.';
    bySup[s] = (bySup[s] || 0) + val(l);
    const o = ingById[l.ingId]?.origin; const k = o === 'Italia' ? 'Italia' : o === 'UE' ? 'UE' : 'Extra-UE';
    geo[k] += val(l);
  }
  const tot = sum(Object.values(bySup));
  const ranked = Object.entries(bySup).sort((a, b) => b[1] - a[1]);
  let acc = 0, top80 = 0;
  for (const [, v] of ranked) { if (acc >= tot * 0.8) break; acc += v; top80++; }
  return {
    n: ranked.length, top80: tot > 0 ? top80 : null, value: tot,
    geo: tot > 0 ? Object.fromEntries(Object.entries(geo).map(([k, v]) => [k, v / tot])) : null,
  };
}

/* ---------------- dal questionario agli indicatori ---------------- */
export function employees(a = {}) {
  const g = a['pe-cat'] || {};
  const vals = Object.values(g).map(numOr).filter(x => x != null);
  return vals.length ? sum(vals) : null;
}

/** Valori del registro dei 49 indicatori ricavati dalle risposte: { codice: [valore, unità, nota] }. */
export function surveyKpis(a = {}) {
  const out = {};
  const put = (code, v, unit, note = '') => { if (v != null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v))) out[code] = [v, unit, note]; };
  const emp = employees(a);
  if (emp != null) put('S1', emp, 'addetti', Object.entries(a['pe-cat'] || {}).filter(([, v]) => numOr(v) != null).map(([k, v]) => `${nf(+v)} ${k.toLowerCase()}`).join(', '));
  const inj = numOr(a['hs-inj']), days = numOr(a['hs-days']);
  const hours = numOr(a['hs-hours']) || (emp ? emp * HOURS_PER_FTE : null);
  const est = !numOr(a['hs-hours']) ? ` · ore stimate (${nf(HOURS_PER_FTE)} h per addetto)` : '';
  if (inj != null && hours) put('S2', inj * 1e6 / hours, 'per milione di ore', `${nf(inj)} infortuni su ${nf(hours)} h lavorate${est}`);
  if (days != null && hours) put('S3', days * 1e3 / hours, 'giornate per 1.000 h', `${nf(days)} giornate perse${est}`);
  put('S4', numOr(a['tr-hours']), 'h/addetto·anno');
  put('S5', numOr(a['pe-gap']), '%');
  put('S6', numOr(a['pe-turnover']), '%');
  put('S7', numOr(a['pe-women-mgmt']), '%');
  if (a['gv-board'] === 'si') { const n = numOr(a['gv-board-n']), w = numOr(a['gv-board-w']); put('G1', n != null ? `${nf(n)} consiglieri${w != null ? ` (${nf(w)} ${w === 1 ? 'donna' : 'donne'}, ${nf(n ? w / n * 100 : 0)}%)` : ''}` : 'Consiglio di Amministrazione', ''); }
  else if (a['gv-board'] === 'no') put('G1', 'Nessun Consiglio di Amministrazione', '');
  put('G2', YN(a['et-231']), 'sì/no'); put('G3', YN(a['et-anticorr']), 'sì/no'); put('G4', numOr(a['et-cases']), 'n. (3 anni)');
  const certs = [...(a['et-certs'] || []), ...(a['hs-iso'] === 'si' ? ['ISO 45001'] : [])];
  if (a['et-certs'] || a['hs-iso']) put('G5', certs.length ? certs.join('; ') : 'Nessuna', 'elenco');
  put('G6', numOr(a['sc-audits']), 'n./anno'); put('G7', numOr(a['sc-nc']), 'n./anno'); put('G8', numOr(a['tr-ethics']), '%');
  put('G9', YN(a['et-code']), 'sì/no'); put('G10', YN(a['sc-coc']), 'sì/no'); put('G11', numOr(a['sc-eval']), '%');
  if (a['gv-esg-lead']) put('G12', a['gv-esg-lead'] === 'si' ? (a['gv-esg-role'] ? `Sì · ${a['gv-esg-role']}` : 'Sì') : 'No', 'sì/no');
  if (a['mp-cert']) put('E14', a['mp-cert'].replace('-', '–'), '% (fascia)');
  return out;
}

/* ---------------- avanzamento del questionario ---------------- */
export function surveyProgress(a = {}) {
  const sections = SURVEY_SECTIONS.map(s => {
    const qs = s.questions.filter(q => q.type !== 'auto' && visible(q, a));
    const done = qs.filter(q => answered(q, a[q.id])).length;
    return { id: s.id, title: s.title, total: qs.length, done, pct: qs.length ? done / qs.length : 1 };
  });
  const total = sum(sections, s => s.total), done = sum(sections, s => s.done);
  return { sections, total, done, pct: total ? done / total : 0, bySection: Object.fromEntries(sections.map(s => [s.id, s])) };
}

/* ---------------- maturità ESG: criteri trasparenti, punteggio per pilastro ---------------- */
// test → true (soddisfatto) · false (non soddisfatto) · null (manca la risposta o il dato)
const yes = (a, id) => (a[id] == null ? null : a[id] === 'si');
const CRITERIA = [
  // ambiente
  { id: 'co2', pillar: 'E', pts: 8, label: 'Emissioni di CO₂ misurate', test: c => yes(c.a, 'em-measure'), q: 'em-measure', action: 'Adottare l’inventario Scope 1-2-3 di FeedOS come misura ufficiale delle emissioni.' },
  { id: 'target', pillar: 'E', pts: 8, label: 'Obiettivi di riduzione delle emissioni', test: c => yes(c.a, 'em-target'), q: 'em-target', action: 'Fissare un obiettivo (es. −20% di CO₂ per tonnellata in 3 anni) partendo dalla copertura fotovoltaica.' },
  { id: 'ren', pillar: 'E', pts: 8, label: 'Energia rinnovabile in uso', test: c => (c.energy?.kwhSelf > 0 ? true : c.a['en-ren'] ? c.a['en-ren'].some(x => x !== 'Nessuno') : null), q: 'en-ren', action: 'Valutare un impianto fotovoltaico o un contratto di energia rinnovabile certificata.' },
  { id: 'water', pillar: 'E', pts: 8, label: 'Prelievi idrici misurati ogni mese', test: c => c.water.nMonths >= 6, tab: 'acqua', action: 'Registrare ogni mese la lettura del contatore dell’acqua (scheda Acqua).' },
  { id: 'disch', pillar: 'E', pts: 4, label: 'Scarichi idrici monitorati', test: c => yes(c.a, 'wa-disch'), q: 'wa-disch', action: 'Programmare analisi periodiche degli scarichi e conservarne i referti.' },
  { id: 'wastereg', pillar: 'E', pts: 8, label: 'Rifiuti registrati per codice EER', test: c => c.waste.n >= 4, tab: 'rifiuti', action: 'Riportare in FeedOS i formulari dei rifiuti (scheda Rifiuti): bastano codice EER, kg e destinazione.' },
  { id: 'recovery', pillar: 'E', pts: 8, label: 'Almeno metà dei rifiuti avviata a recupero', test: c => (c.waste.recovery == null ? null : c.waste.recovery >= 0.5), tab: 'rifiuti', action: 'Separare carta, plastica e legno degli imballaggi e conferirli a recupero (operazioni R).' },
  { id: 'reduce', pillar: 'E', pts: 4, label: 'Programma di riduzione degli sprechi', test: c => yes(c.a, 'wt-reduce'), q: 'wt-reduce', action: 'Avviare un programma sugli scarti di linea: oggi sono misurati nelle registrazioni di produzione.' },
  { id: 'soy', pillar: 'E', pts: 6, label: 'Soia certificata senza deforestazione', test: c => (c.soyShare == null ? null : c.soyShare > 0), q: 'bd-soy', action: 'Chiedere ai fornitori di soia una quota certificata (RTRS, ProTerra, FEFAC SSG): lo scenario «soia senza deforestazione» in Economia ne mostra il costo.' },
  { id: 'trace', pillar: 'E', pts: 6, label: 'Tracciabilità fino all’origine delle commodity a rischio', test: c => (c.a['bd-trace'] == null ? null : c.a['bd-trace'] === 'Completa'), partial: c => (c.a['bd-trace'] === 'Parziale' ? 0.5 : 0), q: 'bd-trace', action: 'Chiedere ai fornitori di soia e mais il paese e la regione di coltivazione per ogni consegna.' },
  { id: 'bioassess', pillar: 'E', pts: 4, label: 'Impatti sulla biodiversità valutati', test: c => yes(c.a, 'bd-assess'), q: 'bd-assess', action: 'Fare uno screening dei siti rispetto alle aree protette (Natura 2000) e delle commodity a rischio.' },
  { id: 'biopolicy', pillar: 'E', pts: 4, label: 'Politica sulla biodiversità', test: c => yes(c.a, 'bd-policy'), q: 'bd-policy', action: 'Scrivere una politica breve su biodiversità e deforestazione (anche una pagina).' },
  // sociale
  { id: 'iso45', pillar: 'S', pts: 8, label: 'Sistema di gestione della sicurezza ISO 45001', test: c => yes(c.a, 'hs-iso'), q: 'hs-iso', action: 'Valutare la certificazione ISO 45001 partendo dal documento di valutazione dei rischi.' },
  { id: 'injmon', pillar: 'S', pts: 5, label: 'Infortuni e giornate perse monitorati', test: c => (c.a['hs-inj'] == null || c.a['hs-days'] == null ? null : true), q: 'hs-inj', action: 'Registrare infortuni, giornate perse e ore lavorate: servono per gli indici di frequenza e gravità.' },
  { id: 'injzero', pillar: 'S', pts: 5, label: 'Nessun infortunio nell’anno', test: c => (numOr(c.a['hs-inj']) == null ? null : numOr(c.a['hs-inj']) === 0), q: 'hs-inj', action: 'Analizzare le cause degli infortuni e aggiornare la formazione sulla sicurezza.' },
  { id: 'training', pillar: 'S', pts: 8, label: 'Almeno 20 ore di formazione per addetto', test: c => (numOr(c.a['tr-hours']) == null ? null : numOr(c.a['tr-hours']) >= 20), q: 'tr-hours', action: 'Pianificare la formazione annuale su sicurezza, qualità e sostenibilità (soglia indicativa: 20 h per addetto).' },
  { id: 'gender', pillar: 'S', pts: 5, label: 'Parità: donne in ruoli di responsabilità misurate', test: c => (numOr(c.a['pe-women-mgmt']) == null ? null : true), q: 'pe-women-mgmt', action: 'Misurare la quota di donne in ruoli di responsabilità e il divario retributivo.' },
  { id: 'paygap', pillar: 'S', pts: 4, label: 'Divario retributivo di genere calcolato', test: c => (numOr(c.a['pe-gap']) == null ? null : true), q: 'pe-gap', action: 'Calcolare il divario retributivo medio tra uomini e donne dalle buste paga.' },
  { id: 'community', pillar: 'S', pts: 5, label: 'Iniziative sul territorio', test: c => yes(c.a, 'te-init'), q: 'te-init', action: 'Raccontare (o avviare) le iniziative con scuole agrarie, allevatori e comunità locali.' },
  { id: 'hrisk', pillar: 'S', pts: 6, label: 'Verifiche sui diritti umani in filiera', test: c => (c.a['sc-risk'] == null ? null : c.a['sc-risk'].length >= 3), q: 'sc-risk', action: 'Inserire nella qualifica fornitori le verifiche su lavoro minorile, lavoro forzato e discriminazione.' },
  { id: 'scqual', pillar: 'S', pts: 6, label: 'Qualifica dei fornitori con criteri ESG', test: c => yes(c.a, 'sc-qual'), q: 'sc-qual', action: 'Aggiungere al questionario di qualifica fornitori 5 domande ESG (certificazioni, sicurezza, ambiente).' },
  { id: 'sceval', pillar: 'S', pts: 5, label: 'Fornitori valutati su criteri ESG', test: c => (numOr(c.a['sc-eval']) == null ? null : numOr(c.a['sc-eval']) > 0), q: 'sc-eval', action: 'Partire dai fornitori che fanno l’80% degli acquisti: sono pochi e coprono quasi tutta la spesa.' },
  // governance
  { id: 'board', pillar: 'G', pts: 4, label: 'Consiglio di Amministrazione', test: c => yes(c.a, 'gv-board'), q: 'gv-board', action: 'Descrivere composizione e deleghe dell’organo amministrativo.' },
  { id: 'ethics', pillar: 'G', pts: 8, label: 'Codice Etico adottato', test: c => yes(c.a, 'et-code'), q: 'et-code', action: 'Adottare un Codice Etico (è anche la base del Modello 231).' },
  { id: 'm231', pillar: 'G', pts: 8, label: 'Modello Organizzativo 231', test: c => yes(c.a, 'et-231'), q: 'et-231', action: 'Valutare l’adozione del Modello 231 con un organismo di vigilanza.' },
  { id: 'anticorr', pillar: 'G', pts: 6, label: 'Procedura anticorruzione', test: c => yes(c.a, 'et-anticorr'), q: 'et-anticorr', action: 'Formalizzare una procedura anticorruzione e un canale di segnalazione (whistleblowing).' },
  { id: 'esglead', pillar: 'G', pts: 8, label: 'Responsabile della sostenibilità', test: c => yes(c.a, 'gv-esg-lead'), q: 'gv-esg-lead', action: 'Nominare un referente della sostenibilità con un mandato scritto (anche part-time).' },
  { id: 'riskesg', pillar: 'G', pts: 6, label: 'Valutazione periodica dei rischi ESG', test: c => yes(c.a, 'rk-esg'), q: 'rk-esg', action: 'Fare una volta all’anno la mappa dei rischi ESG (ambiente, persone, filiera, compliance).' },
  { id: 'climate', pillar: 'G', pts: 5, label: 'Rischi climatici sulla filiera agricola identificati', test: c => yes(c.a, 'rk-climate'), q: 'rk-climate', action: 'Valutare siccità e caldo estremo su mais e soia: effetto su prezzi, qualità e aflatossine.' },
  { id: 'mitig', pillar: 'G', pts: 5, label: 'Piani di mitigazione dei rischi', test: c => yes(c.a, 'rk-mitig'), q: 'rk-mitig', action: 'Definire piani di mitigazione: fornitori alternativi, scorte di sicurezza, controlli sulle micotossine.' },
  { id: 'coc', pillar: 'G', pts: 6, label: 'Codice di condotta per i fornitori', test: c => yes(c.a, 'sc-coc'), q: 'sc-coc', action: 'Preparare un codice di condotta fornitori da allegare agli ordini.' },
  { id: 'clauses', pillar: 'G', pts: 5, label: 'Clausole ESG nei contratti', test: c => yes(c.a, 'sc-clauses'), q: 'sc-clauses', action: 'Inserire nei contratti quadro una clausola sul rispetto del codice di condotta.' },
  { id: 'audits', pillar: 'G', pts: 5, label: 'Audit presso i fornitori', test: c => (numOr(c.a['sc-audits']) == null ? null : numOr(c.a['sc-audits']) > 0), q: 'sc-audits', action: 'Programmare audit presso i fornitori strategici (soia, mais, premiscele).' },
];
export const PILLAR_LABEL = { E: 'Ambiente', S: 'Sociale', G: 'Governance' };
export const LEVELS = [[0, 'Avvio'], [25, 'In crescita'], [50, 'Strutturato'], [75, 'Avanzato']];
export const levelOf = s => LEVELS.filter(([t]) => s >= t).pop()[1];

export function esgScore(ctx) {
  const items = CRITERIA.map(k => {
    const r = k.test(ctx);
    const got = r === true ? k.pts : r === false && k.partial ? k.pts * k.partial(ctx) : 0;
    return { ...k, test: undefined, partial: undefined, result: r, got, missing: k.pts - got };
  });
  const pillars = Object.keys(PILLAR_LABEL).map(p => {
    const it = items.filter(x => x.pillar === p);
    const tot = sum(it, x => x.pts), got = sum(it, x => x.got);
    return { id: p, label: PILLAR_LABEL[p], score: tot ? got / tot * 100 : 0, met: it.filter(x => x.result === true).length, total: it.length, unknown: it.filter(x => x.result == null).length };
  });
  const score = sum(pillars, p => p.score) / pillars.length;
  return { score, level: levelOf(score), pillars, items };
}

/* ---------------- KPI richiesti dal questionario (ultime pagine) ---------------- */
export function requestedKpis(ctx) {
  const { a, R, water, waste, ghg, sup } = ctx;
  const K = Object.fromEntries((R?.kpis || []).map(k => [k.code, k]));
  const b = R?.energy || {};
  const kv = code => (K[code]?.value != null && typeof K[code].value === 'number' ? K[code].value : null);
  const srcOf = code => K[code]?.source || null;
  const Q = (id, f = numOr) => { const v = f(a[id]); return v == null ? [null, null] : [v, 'questionario']; };
  const row = (group, label, [value, source], unit, dec = 0, link = null) => ({ group, label, value, source, unit, dec, link });
  const bio = (a['bd-programs'] || []).filter(x => x !== 'Nessuna iniziativa');
  const T = tab => ({ tab }), q = id => ({ q: id });
  return [
    row('Ambiente', 'Consumo energetico totale', [b.kwhTotal || null, b.kwhTotal ? 'auto' : null], 'kWh', 0, T('energia')),
    row('Ambiente', 'Intensità energetica', [b.energyPerT ?? null, b.energyPerT ? 'auto' : null], 'kWh/t', 1, T('energia')),
    row('Ambiente', 'Consumo idrico totale', [water.nMonths ? water.m3 : null, water.nMonths ? 'auto' : null], 'm³', 0, T('acqua')),
    row('Ambiente', 'Intensità idrica', [water.intensity, water.intensity != null ? 'auto' : null], 'm³/t', 3, T('acqua')),
    row('Ambiente', 'Emissioni Scope 1', [ghg.scope1 || null, ghg.scope1 ? 'auto' : null], 't CO₂e', 1, T('energia')),
    row('Ambiente', 'Emissioni Scope 2 (location-based)', [ghg.scope2 || null, ghg.scope2 ? 'auto' : null], 't CO₂', 1, T('energia')),
    row('Ambiente', 'Emissioni Scope 3 · materie prime (stima)', [ghg.scope3 || null, ghg.scope3 ? 'auto' : null], 't CO₂e', 0, T('passaporto')),
    row('Ambiente', 'Energia elettrica rinnovabile', [b.coverage != null ? b.coverage * 100 : null, b.coverage != null ? 'auto' : null], '%', 1, T('energia')),
    row('Ambiente', 'Rifiuti avviati a recupero', [waste.recovery != null ? waste.recovery * 100 : null, waste.recovery != null ? 'auto' : null], '%', 1, T('rifiuti')),
    row('Sociale', 'Indice di frequenza infortuni (LTIFR)', [kv('S2'), srcOf('S2')], 'per milione di ore', 2, q('hs-inj')),
    row('Sociale', 'Indice di gravità infortuni', [kv('S3'), srcOf('S3')], 'giornate per 1.000 h', 2, q('hs-days')),
    row('Sociale', 'Ore di formazione per dipendente', [kv('S4'), srcOf('S4')], 'h', 1, q('tr-hours')),
    row('Sociale', 'Divario retributivo di genere', [kv('S5'), srcOf('S5')], '%', 1, q('pe-gap')),
    row('Sociale', 'Donne in ruoli apicali', [kv('S7'), srcOf('S7')], '%', 1, q('pe-women-mgmt')),
    row('Sociale', 'Turnover del personale', [kv('S6'), srcOf('S6')], '%', 1, q('pe-turnover')),
    row('Governance', 'Dipendenti formati su etica e compliance', [kv('G8'), srcOf('G8')], '%', 0, q('tr-ethics')),
    row('Governance', 'Fornitori valutati ESG', [kv('G11'), srcOf('G11')], '%', 0, q('sc-eval')),
    row('Governance', 'Audit ESG sui fornitori', [kv('G6'), srcOf('G6')], 'n.', 0, q('sc-audits')),
    row('Governance', 'Segnalazioni whistleblowing ricevute', Q('et-whistle'), 'n.', 0, q('et-whistle')),
    row('Biodiversità', 'Soia certificata deforestation-free', [kv('E15'), srcOf('E15')], '%', 0, T('passaporto')),
    row('Biodiversità', 'Materie prime completamente tracciate', Q('bd-traced-pct'), '%', 0, q('bd-traced-pct')),
    row('Biodiversità', 'Iniziative di tutela della biodiversità', a['bd-programs'] ? [bio.length, 'questionario'] : [null, null], 'n.', 0, q('bd-programs')),
    row('Biodiversità', 'Siti in aree sensibili', a['bd-protected'] ? [a['bd-protected'] === 'si' ? 1 : 0, 'questionario'] : [null, null], 'n.', 0, q('bd-protected')),
    row('Biodiversità', 'Ettari in programmi di ripristino o compensazione', Q('bd-ha'), 'ha', 1, q('bd-ha')),
    row('Filiera', 'Fornitori valutati ESG', [kv('G11'), srcOf('G11')], '%', 0, q('sc-eval')),
    row('Filiera', 'Spesa coperta da valutazione ESG', Q('sc-spend'), '%', 0, q('sc-spend')),
    row('Filiera', 'Audit sui fornitori', [kv('G6'), srcOf('G6')], 'n.', 0, q('sc-audits')),
    row('Filiera', 'Non conformità ESG rilevate', [kv('G7'), srcOf('G7')], 'n.', 0, q('sc-nc')),
    row('Filiera', 'Fornitori che hanno sottoscritto il Codice di Condotta', a['sc-coc'] === 'no' ? [0, 'questionario'] : Q('sc-coc-pct'), '%', 0, q('sc-coc')),
    row('Filiera', 'Fornitori certificati (RTRS, ISCC, GMP+…)', Q('sc-certpct'), '%', 0, q('sc-certpct')),
    row('Filiera', 'Acquisti da fornitori nazionali', [sup.geo ? sup.geo.Italia * 100 : null, sup.geo ? 'auto' : null], '%', 1, T('passaporto')),
    row('Filiera', 'Fornitori ad alto rischio monitorati', Q('sc-highrisk'), '%', 0, q('sc-highrisk')),
  ];
}

/* ---------------- valori proposti dai dati (pulsante «usa questo valore») ---------------- */
export function surveySuggest(d, ctx) {
  const { a, water, energy: b, sup, raw } = ctx;
  const emp = employees(a);
  const s = {};
  if (emp != null) s.empBand = emp <= 10 ? '1-10' : emp <= 50 ? '11-50' : emp <= 250 ? '51-250' : '>250';
  if (b?.kwhPV > 0) s.renewables = ['Fotovoltaico'];
  if (water.nMonths) s.waterSources = Object.keys(water.bySource);
  if (emp != null) s.hours = emp * HOURS_PER_FTE;
  if (sup.n) s.suppliers = sup.n;
  if (sup.top80) s.top80 = sup.top80;
  const used = new Set(raw.map(r => r.name.toLowerCase()));
  const com = [];
  if ([...used].some(n => n.includes('soia'))) com.push('Soia');
  if ([...used].some(n => n.includes('mais'))) com.push('Mais');
  if ([...used].some(n => n.includes('palma'))) com.push('Olio di palma');
  if (com.length) s.commodities = com;
  const docs = [];
  if (d.energy?.length) docs.push('Registro consumi energetici');
  if (d.water?.length) docs.push('Registro consumi idrici');
  if (d.waste?.length) docs.push('Registro rifiuti');
  if (ctx.ghg?.total) docs.push('Inventario emissioni GHG');
  if (docs.length) s.documents = [...new Set([...(a['doc-list'] || []), ...docs])];
  return s;
}

/* ---------------- quadro d'insieme per il cruscotto ---------------- */
export function overview(d, P, R) {
  const a = d.survey || {};
  const water = R.water || waterStats(d, P), waste = R.waste || wasteStats(d, P);
  const ghg = R.ghg;
  const sup = supplierStats(d, P), raw = rawMaterials(d, P);
  const soy = (R.kpis || []).find(k => k.code === 'E15');
  const ctx = { a, R, water, waste, ghg, sup, raw, energy: R.energy, soyShare: soy?.source === 'auto' ? soy.value / 100 : null };
  const progress = surveyProgress(a);
  const score = esgScore(ctx);
  const steps = score.items.filter(x => x.missing > 0).sort((x, y) => y.missing - x.missing || (x.result == null) - (y.result == null)).map(x => ({
    id: x.id, pillar: x.pillar, pts: x.missing, label: x.label, unknown: x.result == null,
    text: x.result == null && x.q ? `Rispondi: «${QUESTION[x.q]?.q || x.label}»` : x.action, q: x.q, tab: x.tab,
  }));
  const withValue = (R.kpis || []).filter(k => k.value != null).length;
  const closed = closedMonths(P.to, 12), haveWater = new Set((d.water || []).map(w => w.month).filter(m => closed.includes(m))).size;
  const milestones = [
    { id: 'survey', label: 'Questionario completato', done: progress.pct >= 0.999, hint: `${progress.done} di ${progress.total} risposte` },
    { id: 'ghg', label: 'Inventario Scope 1-2-3', done: !!(ghg?.scope1 && ghg?.scope2 && ghg?.scope3), hint: 'energia, combustibili e formule' },
    { id: 'water', label: 'Un anno di letture dell’acqua', done: haveWater >= 12, hint: `${haveWater} mesi chiusi su 12` },
    { id: 'waste', label: 'Rifiuti tracciati per codice EER', done: waste.n >= 4, hint: `${waste.n} registrazioni` },
    { id: 'kpi', label: 'Registro con 40 indicatori su 49', done: withValue >= 40, hint: `${withValue} con un valore` },
  ];
  return { a, ctx, water, waste, ghg, sup, raw, progress, score, steps, milestones, requested: requestedKpis(ctx), suggest: surveySuggest(d, ctx), kpisWithValue: withValue };
}

export { SURVEY_SECTIONS, SURVEY_QUESTIONS, QUESTION };
export const prevPeriod = P => ({ from: addDays(P.from, -365), to: addDays(P.from, -1) });
/** Gli ultimi n mesi già chiusi prima della data (AAAA-MM), dal più vecchio. */
export function closedMonths(today, n = 12) {
  let [y, m] = today.slice(0, 7).split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) { m--; if (m === 0) { m = 12; y--; } out.unshift(`${y}-${String(m).padStart(2, '0')}`); }
  return out;
}
