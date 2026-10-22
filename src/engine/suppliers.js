/* FeedOS 17 · Fornitori qualificati, punteggio e segnali d'acquisto (pacchetto WP5).
 * Contratto della fondazione: scorecard(d, ctx, P), purchasingSignals(d, ctx), purchasingReportSection(d, ctx, P, C).
 * Punteggio 0–100 = 35 puntualità (OTIF) + 30 qualità + 25 prezzo + 10 documenti; classe A ≥ 80, B ≥ 60, C sotto.
 * Un fornitore senza anagrafica (solo il nome sui lotti e sugli ordini) si valuta lo stesso, senza la parte documenti. */
import { sum, mean, median, quantile, stdev, addDays, daysBetween, mondayOf, byId, nf, dateIt, slug } from '../core/util.js';
import { marketPremium, ppv, stdPrice } from './purchaseVariance.js';
import { abcClasses } from './mrp.js';

const EMPTY = [];
const n0 = v => (Number.isFinite(+v) ? +v : 0);
export const APPROVAL = { qualificato: { label: 'Qualificato', kind: 'good' }, condizionato: { label: 'Condizionato', kind: 'warn' }, sospeso: { label: 'Sospeso', kind: 'crit' } };
export const CLASS_OF = s => (s == null ? null : s >= 80 ? 'A' : s >= 60 ? 'B' : 'C');
const isOpenPo = p => p && p.status !== 'ricevuto' && p.status !== 'annullato';

/** Elenco dei fornitori: anagrafica più quelli che compaiono solo per nome su lotti e ordini (id «nome:…»). */
export function supplierList(d) {
  const out = [...(d.suppliers || EMPTY)];
  const known = new Set(out.map(s => s.name));
  const add = name => { if (name && !known.has(name)) { known.add(name); out.push({ id: 'nome:' + slug(name), name, ingIds: [], virtual: true }); } };
  for (const l of d.ingLots || EMPTY) if (!l.supplierId) add(l.supplier);
  for (const p of d.purchases || EMPTY) if (!p.supplierId) add(p.supplier);
  return out;
}

/** Fornitore di un lotto, di un ordine o di un id: anagrafica per supplierId, altrimenti per nome. */
export function supplierOf(d, x) {
  if (!x) return null;
  const list = supplierList(d);
  if (typeof x === 'string') return list.find(s => s.id === x) || list.find(s => s.name === x) || null;
  return (x.supplierId && list.find(s => s.id === x.supplierId)) || list.find(s => s.name === x.supplier) || null;
}
const keyOf = (d, x, byName) => x.supplierId || byName[x.supplier] || (x.supplier ? 'nome:' + slug(x.supplier) : null);

/** Stato dei documenti: 100 certificati validi e audit entro 12 mesi, 50 una sola delle due, 0 certificato scaduto o assente. */
export function docsScore(s, today) {
  if (!s || s.virtual) return null;
  const certs = s.cert || EMPTY;
  const certOk = certs.length > 0 && certs.every(c => c.expiry && c.expiry >= today);
  const auditOk = !!s.lastAudit && s.lastAudit >= addDays(today, -365);
  return certOk && auditOk ? 100 : certOk || auditOk ? 50 : 0;
}

/**
 * Punteggio dei fornitori nel periodo P (contratto). opts.ingId limita lotti e ordini a una materia prima.
 * Per fornitore: otif, avgDelay (giorni), ltMean e ltSd (giorni dall'ordine all'arrivo), rejectRate, pgDev, umExcess, afb1Mean, afb1P95,
 * complaints (reclami attribuiti per quota di materia prima), premiumMedian (sul mercato), priceIdx (sui colleghi della stessa materia prima
 * e mese), docs, quality, priceScore, score, cls, spend, tonnes, lots, pos.
 */
export function scorecard(d, ctx, P, { ingId = null } = {}) {
  const today = ctx?.today || d.settings?.demoAnchor || P.to;
  const ing = byId(d.ingredients || EMPTY);
  const list = supplierList(d);
  const byName = Object.fromEntries((d.suppliers || EMPTY).map(s => [s.name, s.id]));
  const rows = Object.fromEntries(list.map(s => [s.id, { s, pos: [], lots: [], prem: [], rel: [], complaints: 0 }]));
  const lots = (d.ingLots || EMPTY).filter(l => l.date >= P.from && l.date <= P.to && (!ingId || l.ingId === ingId));
  // prezzo medio della stessa materia prima nello stesso mese (tutti i fornitori): base dell'indice di prezzo
  const avgM = {};
  for (const l of lots) if (l.status !== 'bloccato') { const o = (avgM[l.ingId + l.date.slice(0, 7)] ||= { t: 0, v: 0 }); o.t += n0(l.tonnes); o.v += n0(l.tonnes) * n0(l.price); }
  for (const l of lots) {
    const r = rows[keyOf(d, l, byName)];
    if (!r) continue;
    r.lots.push(l);
    const a = avgM[l.ingId + l.date.slice(0, 7)];
    if (l.status !== 'bloccato' && a?.t) r.rel.push({ t: n0(l.tonnes), x: n0(l.price) / (a.v / a.t) - 1 });
  }
  for (const p of d.purchases || EMPTY) {
    if (!p.receivedAt || p.receivedAt < P.from || p.receivedAt > P.to || (ingId && p.ingId !== ingId)) continue;
    rows[keyOf(d, p, byName)]?.pos.push(p);
  }
  for (const x of marketPremium(d, P).lots) if (!ingId || x.ingId === ingId) rows[x.supplierId || byName[x.supplier] || 'nome:' + slug(x.supplier)]?.prem.push(x.premium);
  // reclami del periodo: quota dei kg del lotto di prodotto venuti dai lotti del fornitore
  const ingLot = byId(d.ingLots || EMPTY), lotById = byId(d.lots || EMPTY);
  for (const c of d.complaints || EMPTY) {
    if (!c.date || c.date < P.from || c.date > P.to) continue;
    const comp = (lotById[c.lotId]?.comp || EMPTY).filter(x => !ingId || (x.ing || ingLot[x.l]?.ingId) === ingId);
    const tot = sum(comp, x => n0(x.kg));
    if (!tot) continue;
    for (const x of comp) { const il = ingLot[x.l]; if (il) { const r = rows[keyOf(d, il, byName)]; if (r) r.complaints += n0(x.kg) / tot; } }
  }
  const out = [];
  for (const r of Object.values(rows)) {
    if (!r.lots.length && !r.pos.length) continue;
    const s = r.s;
    const good = r.pos.filter(p => p.receivedAt <= addDays(p.deliveryDate || p.receivedAt, 1) && Math.abs(n0(p.receivedT ?? p.tonnes) - n0(p.tonnes)) <= 0.02 * n0(p.tonnes));
    const otif = r.pos.length ? good.length / r.pos.length : null;
    const delays = r.pos.filter(p => p.deliveryDate).map(p => Math.max(0, daysBetween(p.deliveryDate, p.receivedAt)));
    const lts = r.pos.filter(p => p.date).map(p => daysBetween(p.date, p.receivedAt));
    const withPg = r.lots.filter(l => l.analyses?.PG != null && ing[l.ingId]?.nutr?.PG);
    const withUm = r.lots.filter(l => l.analyses?.UM != null && ing[l.ingId]?.dm);
    const afb = r.lots.map(l => l.analyses?.AFB1).filter(v => v != null && Number.isFinite(+v)).map(Number);
    const rejectRate = r.lots.length ? r.lots.filter(l => l.status === 'bloccato').length / r.lots.length : null;
    const pgDev = withPg.length ? mean(withPg.map(l => (l.analyses.PG - ing[l.ingId].nutr.PG) / ing[l.ingId].nutr.PG)) : null;
    const umExcess = withUm.length ? mean(withUm.map(l => Math.max(0, l.analyses.UM - (100 - ing[l.ingId].dm)))) : null;
    const afb1P95 = afb.length ? quantile(afb, 0.95) : null;
    const tonnes = sum(r.lots.filter(l => l.status !== 'bloccato'), l => n0(l.tonnes));
    const complaintsPer1000 = tonnes ? (r.complaints / tonnes) * 1000 : 0;
    // qualità: 100 meno le penalità (respinti, proteina sotto la tabella, umidità in eccesso, aflatossina alta, reclami)
    const pen = (rejectRate || 0) * 400 + Math.max(0, -(pgDev || 0)) * 400 + (umExcess || 0) * 12 + Math.max(0, (afb1P95 || 0) - 8) * 2.5 + complaintsPer1000 * 15;
    const quality = Math.max(0, Math.min(100, 100 - pen));
    const priceIdx = r.rel.length ? sum(r.rel, x => x.t * x.x) / sum(r.rel, x => x.t) : null;
    const priceScore = priceIdx == null ? 50 : Math.max(0, Math.min(100, 50 - priceIdx * 1500));
    const docs = docsScore(s, today);
    const parts = [[35, otif == null ? null : otif * 100], [30, quality], [25, priceScore], [10, docs]].filter(([, v]) => v != null);
    const score = parts.length ? sum(parts, ([w, v]) => w * v) / sum(parts, ([w]) => w) : null;
    out.push({
      id: s.id, name: s.name, approval: s.approval || null, virtual: !!s.virtual, ingIds: [...new Set(r.lots.map(l => l.ingId))],
      otif, avgDelay: delays.length ? mean(delays) : null, ltMean: lts.length ? mean(lts) : null, ltSd: lts.length > 1 ? stdev(lts) : null, pos: r.pos.length,
      rejectRate, pgDev, umExcess, afb1Mean: afb.length ? mean(afb) : null, afb1P95, complaints: r.complaints, complaintsPer1000,
      premiumMedian: r.prem.length ? median(r.prem) : null, priceIdx, priceScore, quality, docs, score, cls: CLASS_OF(score),
      spend: sum(r.lots.filter(l => l.status !== 'bloccato'), l => n0(l.tonnes) * n0(l.price)), tonnes, lots: r.lots.length,
    });
  }
  return out.sort((a, b) => (b.spend || 0) - (a.spend || 0));
}

/** Confronto dei fornitori di una materia prima nel periodo (stesse misure, solo i suoi lotti e ordini). */
export function compareForIngredient(d, ctx, ingId, P) { return scorecard(d, ctx, P, { ingId }); }

/** OTIF mensile di un fornitore (ultimi n mesi): [{month, otif, n, premium}]. */
export function supplierTrend(d, supplierId, today, months = 13) {
  const s = supplierOf(d, supplierId);
  if (!s) return [];
  const out = [];
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const ms = [];
  for (let i = 0; i < months; i++) { ms.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
  for (const mo of ms) {
    const P = { from: mo + '-01', to: mo + '-31' };
    const r = scorecard(d, { today }, P).find(x => x.id === s.id);
    out.push({ month: mo, otif: r?.otif ?? null, n: r?.pos ?? 0, premium: r?.premiumMedian ?? null });
  }
  return out;
}

/** Classe ABC delle materie prime (la stessa dei fabbisogni: valore consumato nelle campagne degli ultimi 12 mesi). */
export function abcOfIngredients(d, today) {
  return abcClasses({ today, runs: d.runs || EMPTY, products: d.products || EMPTY, formulas: d.formulas || EMPTY, ingredients: d.ingredients || EMPTY });
}

/** Segnali degli acquisti: certificati, OTIF, fornitori sospesi con ordini, ordini in ritardo, PPV delle materie prime A. → Signal[] */
export function purchasingSignals(d, ctx) {
  const out = [];
  const today = ctx?.today || d.settings?.demoAnchor;
  if (!today) return out;
  const ing = byId(d.ingredients || EMPTY);
  const add = s => out.push({ area: 'acquisti', roles: ['acquisti', 'qualita', 'direzione'], ...s });
  // certificati scaduti o in scadenza entro 30 giorni
  for (const s of d.suppliers || EMPTY) for (const c of s.cert || EMPTY) {
    if (!c.expiry || c.expiry > addDays(today, 30)) continue;
    const gone = c.expiry < today;
    add({ key: `cert:${s.id}:${c.type}:${c.expiry}`, severity: gone ? 'critico' : 'attenzione', roles: ['acquisti', 'qualita'],
      title: `${s.name}: certificato ${c.type} ${gone ? 'scaduto' : `in scadenza il ${dateIt(c.expiry, 'dm')}`}`,
      why: `Senza ${c.type} valido il fornitore non è qualificato per ${(s.ingIds || []).map(i => ing[i]?.name.toLowerCase()).filter(Boolean).slice(0, 3).join(', ') || 'le sue materie prime'}: gli arrivi successivi andrebbero respinti in accettazione.`,
      action: 'Chiedere il certificato rinnovato e caricarlo nella scheda del fornitore.', impact: gone ? 2.5e5 : 1.2e5, link: { area: 'acquisti', tab: 'fornitori', id: s.id } });
  }
  // fornitore sospeso con ordini aperti
  for (const s of d.suppliers || EMPTY) {
    if (s.approval !== 'sospeso') continue;
    const open = (d.purchases || EMPTY).filter(p => isOpenPo(p) && (p.supplierId === s.id || p.supplier === s.name));
    if (open.length) add({ key: `susp:${s.id}`, severity: 'critico', title: `${s.name} è sospeso ma ha ${open.length} ordini aperti`,
      why: `Ordini ${open.slice(0, 3).map(p => p.code).join(', ')}${open.length > 3 ? '…' : ''}: la merce in arrivo da un fornitore sospeso non può essere accettata.`,
      action: 'Annullare o spostare gli ordini su un fornitore qualificato.', impact: 3e5, link: { area: 'acquisti', tab: 'ordini' } });
  }
  // puntualità nelle ultime 13 settimane
  const P13 = { from: addDays(today, -91), to: today };
  for (const r of scorecard(d, { today }, P13)) {
    if (r.otif != null && r.pos >= 6 && r.otif < 0.85) add({ key: `otif:${r.id}:${mondayOf(today)}`, severity: 'attenzione',
      title: `${r.name}: consegne puntuali e complete solo al ${nf(r.otif * 100)}%`,
      why: `Nelle ultime 13 settimane ${r.pos} consegne, ritardo medio ${nf(r.avgDelay || 0, 1)} giorni; obiettivo 95%. Con consegne incerte serve più scorta di sicurezza.`,
      action: 'Parlarne con il fornitore o spostare una parte dei volumi sul fornitore alternativo (Acquisti › Fornitori).', impact: 9e4 + (0.85 - r.otif) * 1e5, link: { area: 'acquisti', tab: 'fornitori', id: r.id } });
  }
  // ordini in ritardo
  for (const p of d.purchases || EMPTY) {
    if (!isOpenPo(p) || !p.deliveryDate || p.deliveryDate >= today) continue;
    const late = daysBetween(p.deliveryDate, today);
    add({ key: `po-late:${p.id}`, severity: late > 7 ? 'critico' : 'attenzione', roles: ['acquisti', 'produzione'],
      title: `Ordine ${p.code} in ritardo di ${late} ${late === 1 ? 'giorno' : 'giorni'}: ${nf(n0(p.tonnes) - n0(p.receivedT))} t di ${ing[p.ingId]?.name.toLowerCase() || p.ingId}`,
      why: `Consegna prevista il ${dateIt(p.deliveryDate, 'dm')} da ${p.supplier || 'fornitore non indicato'}; i fabbisogni lo contano ancora in arrivo questa settimana.`,
      action: 'Sollecitare il fornitore e confermare la nuova data, oppure registrare l’arrivo.', impact: 1e5 + late * 5e3, link: { area: 'acquisti', tab: 'ordini', id: p.id } });
  }
  // PPV delle materie prime A negli ultimi 30 giorni oltre il 5% dello standard
  const abc = abcOfIngredients(d, today);
  const pv = ppv(d, ctx, { from: addDays(today, -29), to: today });
  for (const x of pv.byIng) {
    if (abc[x.ingId] !== 'A' || x.pct == null || x.pct <= 0.05) continue;
    add({ key: `ppv:${x.ingId}:${today.slice(0, 7)}`, severity: 'attenzione', roles: ['acquisti', 'direzione'],
      title: `${ing[x.ingId]?.name || x.ingId}: pagato il ${nf(x.pct * 100, 1)}% sopra lo standard`,
      why: `Negli ultimi 30 giorni ${nf(x.tonnes)} t a ${nf(x.avgPrice, 1)} €/t contro ${nf(x.std, 1)} €/t di standard: ${nf(x.ppv / 1000, 1)} mila € di varianza di prezzo.`,
      action: 'Verificare contratti e coperture; aggiornare i costi standard se il mercato è cambiato in modo stabile (Acquisti › Varianze).', impact: 8e4 + x.ppv, link: { area: 'acquisti', tab: 'varianze', id: x.ingId } });
  }
  return out;
}

/** Sezione «Acquisti» del report CdA: spesa, PPV, premio sul mercato, puntualità e fornitori principali. */
export function purchasingReportSection(d, ctx, P, C) {
  const rows = scorecard(d, ctx, P);
  if (!rows.length) return null;
  const pv = ppv(d, ctx, P), mp = marketPremium(d, P);
  const spend = sum(rows, r => r.spend);
  const withPos = rows.filter(r => r.otif != null && r.pos);
  const otif = withPos.length ? sum(withPos, r => r.otif * r.pos) / sum(withPos, r => r.pos) : null;
  const pvC = C && !C.budget ? ppv(d, ctx, C) : null;
  const top = rows.slice(0, 8).map(r => ({ name: r.name, spend: r.spend, score: r.score, otif: r.otif, premium: r.premiumMedian }));
  const worst = [...rows].filter(r => r.score != null && r.spend > 0.02 * spend).sort((a, b) => a.score - b.score)[0];
  return {
    id: 'acquisti', title: 'Acquisti e fornitori', order: 60,
    kpis: [
      { label: 'Spesa per materie prime', value: spend / 1000, unit: 'k€', decimals: 0 },
      { label: 'Varianza di prezzo (PPV)', value: pv.total / 1000, unit: 'k€', decimals: 0, cmp: pvC ? { value: pvC.total / 1000, kind: 'flow', good: 'down' } : undefined },
      { label: 'Premio mediano sul mercato', value: mp.median != null ? mp.median * 100 : null, unit: '%', decimals: 1 },
      { label: 'Consegne puntuali e complete', value: otif != null ? otif * 100 : null, unit: '%', decimals: 0 },
      { label: 'Fornitori in classe C', value: rows.filter(r => r.cls === 'C').length, unit: '', decimals: 0 },
    ],
    table: { cols: [{ key: 'name', label: 'Fornitore', fmt: 'text' }, { key: 'spend', label: 'Spesa €', fmt: 'eur' }, { key: 'score', label: 'Punteggio', fmt: 'num' }, { key: 'otif', label: 'OTIF', fmt: 'pct' }, { key: 'premium', label: 'Premio sul mercato', fmt: 'pct' }], rows: top },
    narrative: [
      `Varianza di prezzo d’acquisto di ${nf(pv.total / 1000)} mila € (${pv.pct != null ? nf(pv.pct * 100, 1) + '%' : '—'} sugli standard)${pv.byIng[0] ? `, guidata da ${(d.ingredients || EMPTY).find(i => i.id === pv.byIng[0].ingId)?.name.toLowerCase() || pv.byIng[0].ingId} (${nf(pv.byIng[0].ppv / 1000)} mila €)` : ''}.`,
      worst ? `Il fornitore rilevante con il punteggio più basso è ${worst.name} (${nf(worst.score)} su 100, classe ${worst.cls}).` : '',
    ].filter(Boolean),
  };
}

/** Standard dell'anno di una materia prima (comodo per l'interfaccia). */
export { stdPrice };
