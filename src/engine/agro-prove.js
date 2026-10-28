/* DifesaOS · Prove di campo: analisi dei rilievi, efficacia e evidenze per prodotto (area Prodotti).
 * Una prova (fieldTrials) ha le tesi (testimone non trattato, prodotto aziendale, riferimento del concorrente, altre dosi o
 * strategie) e i rilievi: per ogni tesi un valore per ripetizione (blocco). L'analisi segue la pratica delle relazioni di
 * efficacia (linee guida EPPO PP 1/152 e PP 1/181): analisi della varianza a blocchi randomizzati (completamente
 * randomizzata se mancano dati), percentuali con la trasformazione angolare, confronto delle medie con la differenza minima
 * significativa protetta (LSD di Fisher, 5%) e lettere (stessa lettera = differenza non significativa; «a» alla media più alta),
 * efficacia di Abbott sul testimone: (testimone − tesi) / testimone × 100. */
import { tInv, fCdf } from './stats.js';
import { sum, mean, byId, nf, dateIt, daysBetween } from '../core/util.js';

const EMPTY = [];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/** Variabili dei rilievi: unità, percentuale (trasformazione angolare), verso del «meglio». */
export const TRIAL_VARS = {
  severita: { label: 'Gravità (superficie colpita)', short: 'gravità', unit: '%', pct: true, lower: true },
  incidenza: { label: 'Incidenza (organi colpiti)', short: 'incidenza', unit: '%', pct: true, lower: true },
  conteggio: { label: 'Individui per campione', short: 'individui', unit: 'n.', pct: false, lower: true },
  copertura: { label: 'Copertura delle infestanti', short: 'copertura', unit: '%', pct: true, lower: true },
  fitotossicita: { label: 'Fitotossicità', short: 'fitotossicità', unit: '%', pct: true, lower: true, phyto: true },
  resa: { label: 'Resa', short: 'resa', unit: 't/ha', pct: false, lower: false },
};
export const THESIS_KIND = { testimone: 'Testimone non trattato', proprio: 'Prodotto aziendale', riferimento: 'Riferimento di mercato', altro: 'Altra dose o strategia' };
export const TRIAL_STATUS = { pianificata: 'Pianificata', 'in corso': 'In corso', conclusa: 'Conclusa' };

/** Articolo davanti a una percentuale: «l’83%», «l’11%», «il 92%» (e «dell’83%», «del 92%»). */
const vowelNum = v => { const n = String(Math.round(Math.abs(+v))); return n === '1' || n === '11' || n.startsWith('8'); };
export const ilPct = (v, dec = 0) => `${vowelNum(v) ? 'l’' : 'il '}${nf(v, dec)}%`;
export const delPct = (v, dec = 0) => `${vowelNum(v) ? 'dell’' : 'del '}${nf(v, dec)}%`;
export const VERDICT = { superiore: 'Migliore del riferimento', equivalente: 'Pari al riferimento', inferiore: 'Inferiore al riferimento' };

/** Trasformazione angolare di una percentuale (gradi): arcoseno della radice della proporzione. */
export const angular = p => (Math.asin(Math.sqrt(Math.min(100, Math.max(0, p)) / 100)) * 180) / Math.PI;

/** Efficacia di Abbott (%) di una tesi sul testimone, con le medie della variabile (null se il testimone è a zero). */
export function abbott(control, treated) {
  if (num(control) == null || num(treated) == null || !(control > 0)) return null;
  return ((control - treated) / control) * 100;
}

/**
 * Lettere di significatività dalle coppie diverse (algoritmo «inserisci e assorbi» di Piepho, 2004): ids in ordine di media
 * decrescente, differs(i, j) vero se la coppia è significativamente diversa. → {id: 'ab'}
 */
export function letters(ids, differs) {
  let cols = [new Set(ids)];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (!differs(ids[i], ids[j])) continue;
    const next = [];
    for (const c of cols) {
      if (c.has(ids[i]) && c.has(ids[j])) { const a = new Set(c), b = new Set(c); a.delete(ids[i]); b.delete(ids[j]); next.push(a, b); }
      else next.push(c);
    }
    // assorbimento: si tolgono le colonne contenute in un'altra
    cols = next.filter((c, k) => c.size && !next.some((o, h) => h !== k && o.size >= c.size && [...c].every(x => o.has(x)) && (o.size > c.size || h < k)));
  }
  const pos = id => ids.indexOf(id);
  cols.sort((a, b) => Math.min(...[...a].map(pos)) - Math.min(...[...b].map(pos)) || Math.max(...[...a].map(pos)) - Math.max(...[...b].map(pos)));
  const out = Object.fromEntries(ids.map(id => [id, '']));
  cols.forEach((c, k) => { for (const id of c) out[id] += String.fromCharCode(97 + k); });
  return out;
}

/**
 * Analisi della varianza di un rilievo. groups: [{id, values: [per ripetizione]}]; transform 'asin' o 'none'.
 * Blocchi randomizzati se tutte le tesi hanno gli stessi blocchi completi (ripetizione = blocco), altrimenti a una via.
 * → {design, k, n, means (scala originale), tmeans, sd, F, p, dfT, dfE, mse, cv, lsd (scala dell'analisi, disegno bilanciato),
 *    letters, significant, transform} oppure null con meno di due tesi o senza gradi di libertà per l'errore.
 */
export function anova(groups, { transform = 'none', alpha = 0.05 } = {}) {
  const tr = transform === 'asin' ? angular : v => v;
  const G = (groups || EMPTY).map(g => ({ id: g.id, raw: (g.values || EMPTY).map(num) })).filter(g => g.raw.some(v => v != null));
  if (G.length < 2) return null;
  const r = Math.max(...G.map(g => g.raw.length));
  const complete = r >= 2 && G.every(g => g.raw.length === r && g.raw.every(v => v != null));
  const k = G.length;
  const means = {}, tmeans = {}, sd = {}, n = {};
  for (const g of G) {
    const v = g.raw.filter(x => x != null), t = v.map(tr);
    n[g.id] = v.length; means[g.id] = mean(v); tmeans[g.id] = mean(t);
    sd[g.id] = v.length > 1 ? Math.sqrt(sum(v, x => (x - means[g.id]) ** 2) / (v.length - 1)) : null;
  }
  const all = G.flatMap(g => g.raw.filter(x => x != null).map(tr));
  const N = all.length, grand = mean(all);
  const ssTot = sum(all, y => (y - grand) ** 2);
  const ssT = sum(G, g => n[g.id] * (tmeans[g.id] - grand) ** 2);
  let ssB = 0, dfB = 0, design = 'completamente randomizzato';
  if (complete) {
    design = 'blocchi randomizzati';
    dfB = r - 1;
    for (let b = 0; b < r; b++) { const bm = mean(G.map(g => tr(g.raw[b]))); ssB += k * (bm - grand) ** 2; }
  }
  const dfT = k - 1, dfE = N - 1 - dfT - dfB;
  if (dfE < 1) return null;
  const ssE = Math.max(0, ssTot - ssT - ssB), mse = ssE / dfE;
  const F = mse > 0 ? ssT / dfT / mse : ssT > 0 ? Infinity : 0;
  const p = F === Infinity ? 0 : 1 - fCdf(F, dfT, dfE);
  const significant = p < alpha;
  const tq = tInv(1 - alpha / 2, dfE);
  const lsdPair = (a, b) => tq * Math.sqrt(mse * (1 / n[a] + 1 / n[b]));
  const ids = G.map(g => g.id).sort((a, b) => tmeans[b] - tmeans[a]);
  // LSD protetta: con F non significativo tutte le tesi hanno la stessa lettera
  const L = letters(ids, (a, b) => significant && Math.abs(tmeans[a] - tmeans[b]) > lsdPair(a, b) + 1e-12);
  return {
    design, k, n, r: complete ? r : null, means, tmeans, sd, F, p, dfT, dfE, mse, cv: grand ? (Math.sqrt(mse) / Math.abs(grand)) * 100 : null,
    lsd: complete ? tq * Math.sqrt((2 * mse) / r) : null, lsdPair, letters: L, significant, transform: transform === 'asin' ? 'asin' : 'none', alpha,
  };
}

/** Rilievi di una prova con l'analisi: [{...rilievo, v (variabile), an, efficacy {thesisId: %}, controlId}]. */
export function trialAnalysis(t) {
  const theses = t?.theses || EMPTY;
  const control = theses.find(x => x.kind === 'testimone');
  return [...(t?.assessments || EMPTY)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(a => {
    const v = TRIAL_VARS[a.variable] || { label: a.variable || 'Rilievo', short: a.variable || 'rilievo', unit: a.unit || '', pct: false, lower: true };
    const groups = theses.map(th => ({ id: th.id, values: a.values?.[th.id] || EMPTY }));
    const an = anova(groups, { transform: a.transform || (v.pct ? 'asin' : 'none') });
    const efficacy = {};
    if (an && v.lower && !v.phyto && control && an.means[control.id] != null) for (const th of theses) if (th.id !== control.id && an.means[th.id] != null) efficacy[th.id] = abbott(an.means[control.id], an.means[th.id]);
    return { ...a, v, an, efficacy, controlId: control?.id || null };
  });
}

/** Rilievo principale: quello segnato main, altrimenti l'ultimo di efficacia (gravità, incidenza, individui, copertura). */
export function mainAssessment(rows) {
  const eff = (rows || EMPTY).filter(r => r.an && r.v.lower && !r.v.phyto);
  return eff.find(r => r.main) || eff[eff.length - 1] || null;
}

/**
 * Sintesi di una prova per il prodotto productId (di base quello della prova): tesi aziendale e di riferimento, efficacia,
 * esito contro il riferimento (dalla LSD del rilievo principale), resa contro testimone e riferimento, fitotossicità.
 */
export function trialSummary(t, productId = t?.productId) {
  const rows = trialAnalysis(t);
  const main = mainAssessment(rows);
  const theses = t?.theses || EMPTY;
  const own = theses.find(x => x.kind === 'proprio' && x.productId === productId && x.main) || theses.find(x => x.kind === 'proprio' && x.productId === productId);
  const ref = theses.find(x => x.kind === 'riferimento');
  const ctl = theses.find(x => x.kind === 'testimone');
  const out = { trial: t, rows, main, own, ref, ctl, effOwn: null, effRef: null, verdict: null, yield: null, phyto: null, pressure: null };
  if (main?.an && own) {
    out.effOwn = main.efficacy[own.id] ?? null;
    out.effRef = ref ? main.efficacy[ref.id] ?? null : null;
    out.pressure = ctl ? main.an.means[ctl.id] ?? null : null;
    if (ref && main.an.means[ref.id] != null) {
      const a = main.an, diff = a.tmeans[own.id] - a.tmeans[ref.id];
      const sig = a.significant && Math.abs(diff) > a.lsdPair(own.id, ref.id) + 1e-12;
      out.verdict = !sig ? 'equivalente' : (main.v.lower ? diff < 0 : diff > 0) ? 'superiore' : 'inferiore';
    }
  }
  const y = [...rows].reverse().find(r => r.variable === 'resa' && r.an);
  if (y && own) {
    const m = y.an.means;
    out.yield = { own: m[own.id] ?? null, ctl: ctl ? m[ctl.id] ?? null : null, ref: ref ? m[ref.id] ?? null : null, unit: y.v.unit, letters: y.an.letters };
    out.yield.gainCtl = out.yield.own != null && out.yield.ctl ? out.yield.own / out.yield.ctl - 1 : null;
    out.yield.gainRef = out.yield.own != null && out.yield.ref ? out.yield.own / out.yield.ref - 1 : null;
  }
  const ph = rows.filter(r => r.v.phyto && r.an);
  if (ph.length && own) out.phyto = Math.max(...ph.map(r => r.an.means[own.id] ?? 0));
  return out;
}

/** Stato effettivo di una prova alla data: «conclusa» se segnata o con l'ultimo rilievo oltre la fine prevista. */
export function trialStatus(t, today) {
  if (t?.status === 'conclusa') return 'conclusa';
  if (t?.status === 'pianificata' && (!t.start || !isDate(today) || t.start > today)) return 'pianificata';
  return t?.status || 'in corso';
}

/**
 * Evidenze di campo di un prodotto: prove concluse (o con rilievi analizzati) in cui il prodotto è una tesi aziendale.
 * → {n, rows: [sintesi], crops, pests, effOwn (media), effRef (media sulle prove con riferimento), verdicts {superiore, equivalente, inferiore},
 *    yieldGain (media sul testimone), seasons, sites}
 */
export function productEvidence(d, productId) {
  const rows = (d?.fieldTrials || EMPTY)
    .filter(t => (t.theses || EMPTY).some(x => x.kind === 'proprio' && x.productId === productId))
    .map(t => trialSummary(t, productId))
    .filter(s => s.main)
    .sort((a, b) => (b.trial.season || 0) - (a.trial.season || 0) || String(a.trial.code).localeCompare(String(b.trial.code)));
  const pick = k => rows.map(r => r[k]).filter(v => v != null);
  const verdicts = { superiore: 0, equivalente: 0, inferiore: 0 };
  for (const r of rows) if (r.verdict) verdicts[r.verdict]++;
  const gains = rows.map(r => r.yield?.gainCtl).filter(v => v != null);
  return {
    n: rows.length, rows, crops: [...new Set(rows.map(r => String(r.trial.cropName || r.trial.crop).split(' (')[0]))], pests: [...new Set(rows.map(r => String(r.trial.pest).split(' (')[0]))],
    effOwn: pick('effOwn').length ? mean(pick('effOwn')) : null, effRef: pick('effRef').length ? mean(pick('effRef')) : null,
    withRef: rows.filter(r => r.effRef != null).length, verdicts, yieldGain: gains.length ? mean(gains) : null,
    seasons: [...new Set(rows.map(r => r.trial.season))].sort(), sites: [...new Set(rows.map(r => r.trial.site?.place).filter(Boolean))],
  };
}

/** Frase di sintesi delle evidenze (per il report di prodotto e le schede per i clienti). */
export function evidenceText(ev, productName) {
  if (!ev?.n) return `${productName}: nessuna prova di campo con rilievi analizzati.`;
  const parts = [`${productName} è stato provato in ${ev.n === 1 ? 'una prova' : `${nf(ev.n)} prove`} di campo (${ev.seasons.join(', ')}) su ${ev.crops.join(', ').toLowerCase()}`];
  if (ev.effOwn != null) parts.push(`con un’efficacia media ${delPct(ev.effOwn)} sul testimone non trattato${ev.effRef != null ? ` contro ${ilPct(ev.effRef)} del riferimento di mercato` : ''}`);
  let s = parts.join(', ') + '.';
  const v = ev.verdicts, tot = v.superiore + v.equivalente + v.inferiore;
  if (tot) s += ` Rispetto al riferimento è risultato ${v.superiore ? `migliore in ${nf(v.superiore)} ${v.superiore === 1 ? 'prova' : 'prove'}, ` : ''}pari in ${nf(v.equivalente)}${v.inferiore ? ` e inferiore in ${nf(v.inferiore)}` : ''} su ${nf(tot)} (differenza minima significativa al 5%).`;
  if (ev.yieldGain != null) s += ` Resa ${ev.yieldGain >= 0 ? '+' : ''}${nf(ev.yieldGain * 100)}% sul testimone.`;
  return s;
}

/** KPI dell'archivio delle prove. */
export function trialKpis(d, today) {
  const T = d?.fieldTrials || EMPTY;
  const st = T.map(t => trialStatus(t, today));
  const own = T.map(t => trialSummary(t)).filter(s => s.effOwn != null);
  const withRef = own.filter(s => s.verdict);
  return {
    n: T.length, concluded: st.filter(s => s === 'conclusa').length, running: st.filter(s => s === 'in corso').length, planned: st.filter(s => s === 'pianificata').length,
    effOwn: own.length ? mean(own.map(s => s.effOwn)) : null, okVsRef: withRef.filter(s => s.verdict !== 'inferiore').length, withRef: withRef.length,
    photos: (d?.photos || EMPTY).filter(x => x.trialId).length,
  };
}

/**
 * Segnali delle prove: prodotto inferiore al riferimento in una prova non ancora discussa (rivedere dose o posizionamento) e prove
 * finite senza relazione. Nessun segnale senza prove.
 */
export function proveSignals(d, ctx) {
  const out = [];
  const T = d?.fieldTrials || EMPTY;
  if (!T.length) return out;
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!isDate(today)) return out;
  const prods = byId(d.products || EMPTY);
  for (const t of T) {
    const s = trialSummary(t);
    const last = (t.assessments || EMPTY).map(a => a.date).filter(isDate).sort().pop();
    const recent = last && daysBetween(last, today) <= 400;
    const name = prods[t.productId]?.name || 'il prodotto';
    if (s.verdict === 'inferiore' && recent && !String(t.conclusions || '').trim()) out.push({
      key: `prove:inferiore:${t.id}`, area: 'prodotti', roles: ['direzione', 'formulazione', 'commerciale'], severity: 'attenzione',
      title: `${name} inferiore al riferimento nella prova ${t.code}`,
      why: `${t.cropName || t.crop}, ${String(t.pest || '').split(' (')[0].toLowerCase()}: efficacia ${nf(s.effOwn)}% contro ${ilPct(s.effRef)} del riferimento, differenza significativa al 5% (${s.main.v.short} del ${dateIt(s.main.date)}).`,
      action: 'Rivedere dose, intervallo o posizionamento con lo sviluppo prodotto prima di usare il dato con i clienti.', impact: 4e4, link: { area: 'prodotti', tab: 'prove', id: t.id },
    });
    if (trialStatus(t, today) === 'conclusa' && !String(t.conclusions || '').trim() && recent) out.push({
      key: `prove:relazione:${t.id}`, area: 'prodotti', roles: ['direzione', 'formulazione'], severity: 'info',
      title: `Relazione da scrivere per la prova ${t.code}`,
      why: `La prova su ${String(t.cropName || t.crop).toLowerCase()} è conclusa (ultimo rilievo del ${dateIt(last)}) ma manca la conclusione: senza, il risultato non entra nelle schede per i clienti.`,
      action: 'Scrivere la conclusione nella prova (bastano due righe: risultato e indicazione d’uso).', impact: 8e3, link: { area: 'prodotti', tab: 'prove', id: t.id },
    });
  }
  return out;
}
