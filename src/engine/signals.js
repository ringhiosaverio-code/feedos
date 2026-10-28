/* FeedOS 17 · Segnali: regole trasparenti che leggono i dati e propongono una decisione.
 * Ogni segnale spiega il perché con i numeri e suggerisce il passo successivo; nessuna azione è automatica.
 * Dopo le regole incorporate girano i fornitori dei pacchetti (providers.js), ciascuno isolato dagli errori degli altri. */
import { makeCtx } from './actuals.js';
import { fmtUp } from '../core/units.js';
import { SIGNAL_PROVIDERS } from './providers.js';
import { optimize, formulaCost, afb1Check } from './formulation.js';
import { productCost } from './costing.js';
import { checkAnalysis } from './quality.js';
import { profile, SPECIES, AFB1_LIMITS } from './nutrients.js';
import { addDays, daysBetween, sum, nf, dateIt, byId, monthLabel } from '../core/util.js';
import { waterStats, wasteStats } from './sustainability.js';
import { esgThresholds } from './esg-piano.js';

const SEV = { critico: 3, attenzione: 2, info: 1 };

export function annualVolumes(d, today) {
  const from = addDays(today, -365);
  const v = {};
  for (const s of d.shipments) if (s.date > from) v[s.productId] = (v[s.productId] || 0) + s.tonnes;
  return v;
}

/**
 * Segnali alla data. x = contesto dei motori {mrp, volumes, reopt, facts, costs, ix} (derived.signals);
 * se manca qualcosa (test in node) si ricostruisce con actuals.makeCtx. I fornitori ricevono ctx = {today, ...x}.
 */
export function computeSignals(d, today, x = {}) {
  const out = [];
  const add = s => out.push({ date: today, ...s, rank: SEV[s.severity] * 1e9 + (s.impact || 0) });
  const ingById = byId(d.ingredients), prodById = byId(d.products), formById = byId(d.formulas), specById = byId(d.specs), lineById = byId(d.lines), custById = byId(d.customers);
  const ctx = x.ix && x.costs && x.facts && x.mrp && x.volumes ? { today, ...x } : { ...makeCtx(d, today), ...x, today };
  const volumes = ctx.volumes;
  const en = d.settings?.energy || {};

  // 1 · fabbisogni di materie prime
  const mrp = ctx.mrp;
  const later = [], week = [];
  for (const r of mrp.rows) {
    if (!r.planned?.length && r.risk === 'ok') continue;
    const ing = ingById[r.ingId];
    const gap = r.cells.find(c => c.status === 'rottura');          // scoperta anche con gli ordini pianificati
    const lateO = r.planned.find(p => p.late);
    if (lateO || gap) {
      const p = lateO || r.planned[0];
      const crit = gap && daysBetween(today, gap.week) <= 14;
      add({ key: `mrp:${r.ingId}:${p ? p.week : gap.week}`, area: 'acquisti', roles: ['acquisti', 'direzione', 'produzione'],
        severity: crit ? 'critico' : 'attenzione',
        title: p ? `Ordinare subito ${ing.name.toLowerCase()}: ${nf(p.qty, p.qty < 10 ? 1 : 0)} t` : `Scorta di ${ing.name.toLowerCase()} insufficiente`,
        why: `Con il piano delle prossime 8 settimane la scorta scende sotto la sicurezza nella settimana del ${dateIt(p ? p.week : gap.week, 'dm')}; oggi copre ${r.cover != null ? nf(r.cover) + ' giorni' : 'pochi giorni'} e la consegna richiede ${r.lead} giorni.${gap ? ` Anche ordinando oggi, la settimana del ${dateIt(gap.week, 'dm')} resta scoperta di ${nf(Math.abs(gap.end), 1)} t.` : ''}`,
        action: gap ? 'Chiedere una consegna urgente al fornitore o spostare la produzione dei prodotti che la usano; valutare una formula alternativa.' : 'Emettere l’ordine oggi: la data utile per una consegna regolare è già passata.',
        impact: (p ? p.qty : Math.abs(gap.end)) * (+ing.price || 0) * (crit ? 3 : 1), link: { area: 'acquisti', tab: 'fabbisogni', id: r.ingId } });
      continue;
    }
    const due = r.planned.filter(p => daysBetween(today, p.orderBy) <= 7);
    if (due.length) week.push({ r, ing, p: due[0] }); else if (r.planned.length) later.push({ r, ing, p: r.planned[0] });
  }
  if (week.length) {
    const val = sum(week, x => x.p.qty * (+x.ing.price || 0));
    week.sort((a, b) => (a.p.orderBy < b.p.orderBy ? -1 : 1));
    add({ key: `mrp-week:${week.map(x => x.r.ingId + x.p.week).join(',')}`, area: 'acquisti', roles: ['acquisti', 'direzione'], severity: 'attenzione',
      title: week.length === 1 ? `1 ordine da emettere entro 7 giorni: ${week[0].ing.name.toLowerCase()}` : `${week.length} ordini da emettere entro 7 giorni`,
      why: `Per consegne regolari: ${week.slice(0, 4).map(x => `${x.ing.name.toLowerCase()} ${nf(x.p.qty, x.p.qty < 10 ? 1 : 0)} t entro ${dateIt(x.p.orderBy, 'dm')}`).join('; ')}${week.length > 4 ? '…' : ''}. Valore indicativo ${nf(val / 1000)} mila €.`,
      action: 'Aprire i fabbisogni ed emettere gli ordini, oppure confermare le quantità con i fornitori.', impact: val / 50, link: { area: 'acquisti', tab: 'fabbisogni' } });
  }
  if (later.length) {
    const val = sum(later, x => x.p.qty * (+x.ing.price || 0));
    add({ key: `mrp-later:${later.map(x => x.r.ingId).join(',')}`, area: 'acquisti', roles: ['acquisti', 'direzione'], severity: 'info',
      title: `${later.length} ${later.length === 1 ? 'ordine pianificato' : 'ordini pianificati'} nelle prossime settimane`,
      why: `Dal piano di produzione: ${later.slice(0, 4).map(x => `${x.ing.name.toLowerCase()} ${nf(x.p.qty, x.p.qty < 10 ? 1 : 0)} t entro ${dateIt(x.p.orderBy, 'dm')}`).join('; ')}${later.length > 4 ? '…' : ''}. Valore indicativo ${nf(val / 1000)} mila €.`,
      action: 'Nessuna urgenza: gli ordini compariranno tra quelli da emettere quando si avvicina la data utile.', impact: val / 100, link: { area: 'acquisti', tab: 'fabbisogni' } });
  }

  // 2 · formule da ri-ottimizzare ai prezzi correnti
  for (const f of d.formulas) {
    if (f.status !== 'approvata') continue;
    const spec = specById[f.specId];
    if (!spec) continue;
    const cur = formulaCost(f.lines, ingById);
    const r = x.reopt?.[f.id] || optimize({ ingredients: d.ingredients, spec, lines: f.lines, options: { contaminant: { AFB1: AFB1_LIMITS[SPECIES[spec.species]?.afb1 || 'altri'] } } });
    if (r.status !== 'optimal') continue;
    const saving = cur - r.cost;
    const vol = sum(d.products.filter(p => p.formulaId === f.id), p => volumes[p.id] || 0);
    if (saving >= 1.5) {
      add({ key: `reopt:${f.id}:${Math.round(r.cost)}`, area: 'formulazione', roles: ['formulazione', 'direzione'],
        severity: saving * vol >= 15000 ? 'attenzione' : 'info',
        title: `Ri-ottimizzare ${f.name}: −${nf(saving, 2)} €/t`,
        why: `Ai prezzi di oggi la formula approvata costa ${nf(cur, 2)} €/t${f.approvedCost ? ` (all’approvazione ${nf(f.approvedCost, 2)} €/t)` : ''}. Una nuova soluzione che rispetta tutta la specifica costa ${nf(r.cost, 2)} €/t: circa ${nf(saving * vol / 1000, 0)} mila € l’anno sui volumi attuali.`,
        action: 'Aprire la formula, confrontare le due versioni e approvare solo dopo la verifica tecnica.',
        impact: saving * vol, link: { area: 'formulazione', tab: 'formule', id: f.id } });
    }
  }

  // 3 · prezzo netto realizzato (ultimi 90 giorni, dai fatti) sotto il prezzo minimo; senza consegne vale il listino
  const net90 = {}, from90 = addDays(today, -90);
  for (const f of ctx.facts || []) if (f.date > from90 && f.date <= today) { const n = (net90[f.productId] ||= { t: 0, rev: 0 }); n.t += f.tonnes; n.rev += f.revenue; }
  for (const p of d.products) {
    if (p.active === false) continue;
    const c = productCost(p, formById[p.formulaId], ingById, lineById[p.lineId], en);
    const n = net90[p.id], realized = n?.t > 0;
    const net = realized ? n.rev / n.t : +p.listPrice || 0;
    if (c.minPrice != null && net > 0 && net < c.minPrice) {
      const mPct = (net - c.total) / net;
      add({ key: `margin:${p.id}:${Math.round(c.total)}`, area: 'economia', roles: ['direzione', 'commerciale'], severity: 'attenzione',
        title: `Prezzo netto di ${p.name} sotto il margine minimo`,
        why: `${realized ? `Prezzo netto realizzato negli ultimi 90 giorni ${fmtUp(net, p)} (${nf(n.t)} t consegnate, listino ${fmtUp(p.listPrice, p)})` : `Nessuna consegna negli ultimi 90 giorni: listino ${fmtUp(net, p)}`} contro costo pieno di oggi ${fmtUp(c.total, p, 2)}: margine ${nf(mPct * 100, 1)}% (minimo ${nf(p.minMarginPct)}%). Prezzo minimo ${fmtUp(c.minPrice, p)}.`,
        action: 'Valutare revisione del listino e degli sconti, o ri-ottimizzazione della formula.', impact: (c.minPrice - net) * (volumes[p.id] || 0),
        link: { area: 'economia', tab: 'margini', id: p.id } });
    }
  }

  // 4 · offerte sotto il prezzo minimo
  for (const o of d.offers) {
    if (!['bozza', 'inviata'].includes(o.status)) continue;
    if (o.validUntil && o.validUntil < today) continue; // offerta scaduta: non è più una decisione sul prezzo
    const p = prodById[o.productId]; if (!p) continue;
    const c = productCost(p, formById[p.formulaId], ingById, lineById[p.lineId], en);
    if (o.price < c.minPrice - 0.5) {
      add({ key: `offer:${o.id}:${o.price}`, area: 'commerciale', roles: ['commerciale', 'agente', 'direzione'], severity: o.status === 'bozza' ? 'attenzione' : 'critico',
        title: `Offerta ${o.code} a ${custById[o.customerId]?.name} sotto il prezzo minimo`,
        why: `${nf(o.tonnes)} t di ${p.name} a ${fmtUp(o.price, p)}; prezzo minimo per il margine del ${nf(p.minMarginPct)}%: ${fmtUp(c.minPrice, p)} (differenza ${fmtUp(c.minPrice - o.price, p)}).`,
        action: o.status === 'bozza' ? 'Correggere il prezzo prima dell’invio o chiedere approvazione alla direzione.' : 'Offerta già inviata: valutare con la direzione.',
        impact: (c.minPrice - o.price) * o.tonnes, link: { area: 'commerciale', tab: 'offerte', id: o.id }, agentId: o.agentId ?? custById[o.customerId]?.agentId ?? null });
    }
  }

  // 5 · aflatossina B1: lotti in giacenza sopra la media e loro effetto nelle formule sensibili
  const sensitive = d.formulas.filter(f => SPECIES[f.species]?.afb1 === 'giovani_lattifere');
  for (const l of d.ingLots) {
    const af = l.analyses?.AFB1;
    if (af == null || l.remaining <= 0.1) continue;
    if (l.status === 'bloccato') continue;
    if (af < 10) continue;
    const worst = sensitive.map(f => ({ f, kg: f.lines.find(x => x.ing === l.ingId)?.kg || 0 })).sort((a, b) => b.kg - a.kg)[0];
    const est = worst ? af * worst.kg / 1000 : 0;
    const ing = ingById[l.ingId];
    add({ key: `afb1:${l.id}`, area: 'qualita', roles: ['qualita', 'formulazione', 'produzione', 'direzione'], severity: est > 4 ? 'critico' : 'attenzione',
      title: `Lotto ${l.code} di ${ing.name.toLowerCase()} con aflatossina B1 a ${nf(af, 1)} µg/kg`,
      why: `Ammesso come materia prima (limite 20 µg/kg). ${worst && worst.kg ? `Nella formula «${worst.f.name}» entra a ${nf(worst.kg)} kg/t: stima nel mangime ${nf(est, 1)} µg/kg contro il limite di 5 µg/kg per bovine da latte e animali giovani.` : ''} Giacenza ${nf(l.remaining, 1)} t.`,
      action: 'Destinare il lotto alle formule per animali adulti non da latte o miscelarlo con lotti a basso contenuto.',
      impact: 5e5 + af * 1000, link: { area: 'qualita', tab: 'lotti-mp', id: l.id } });
  }

  // 6 · analisi fuori tolleranza di etichetta
  for (const lot of d.lots) {
    if (lot.date < addDays(today, -90)) continue;
    const p = prodById[lot.productId]; const f = formById[p?.formulaId]; if (!f) continue;
    for (const a of lot.analyses || []) {
      const run = d.runs.find(r => r.id === lot.runId);
      const lines = (f.history || []).find(h => h.version === run?.formulaVersion)?.lines || f.lines;
      const prof = profile(lines, ingById);
      const chk = checkAnalysis('PG', a.values.PG, Math.round(prof.PG * 10) / 10);
      if (chk.status !== 'ok' && chk.status !== 'n/d') {
        add({ key: `tol:${lot.id}`, area: 'qualita', roles: ['qualita', 'produzione', 'direzione'], severity: lot.shipped === false ? 'attenzione' : 'critico',
          title: `Lotto ${lot.code}: proteina fuori tolleranza di etichetta`,
          why: `Analisi ${a.method} del ${dateIt(a.date, 'dm')}: proteina grezza ${nf(a.values.PG, 2)}% contro dichiarato ${nf(prof.PG, 1)}% (ammesso ${nf(chk.min, 2)}–${nf(chk.max, 2)}%).`,
          action: 'Aprire una non conformità, ripetere l’analisi e verificare dosaggio e materie prime del lotto.',
          impact: 4e5, link: { area: 'qualita', tab: 'lotti', id: lot.id } });
      }
    }
  }

  // 7 · lotti in attesa di rilascio
  const waiting = d.lots.filter(l => l.status === 'in attesa');
  if (waiting.length) add({ key: `release:${waiting.map(l => l.id).join(',')}`, area: 'qualita', roles: ['qualita', 'produzione'], severity: 'info',
    title: `${waiting.length} lotti in attesa di rilascio`, why: `Lotti prodotti di recente senza esito di analisi: ${waiting.map(l => l.code).join(', ')}.`,
    action: 'Registrare l’esito o rilasciare i lotti.', impact: 1, link: { area: 'qualita', tab: 'lotti' } });

  // 8 · reclami aperti e ricorrenti
  for (const c of d.complaints) {
    if (c.status === 'chiuso') continue;
    const age = daysBetween(c.date, today);
    if (age > 10) add({ key: `compl:${c.id}`, area: 'qualita', roles: ['qualita', 'commerciale', 'direzione'], severity: c.severity >= 3 ? 'critico' : 'attenzione',
      title: `Reclamo ${c.code} aperto da ${age} giorni`, why: `${custById[c.customerId]?.name}: «${c.description}». Stato: ${c.status}.`,
      action: 'Assegnare l’analisi della causa e dare una risposta al cliente.', impact: 3e5 + age, link: { area: 'qualita', tab: 'reclami', id: c.id } });
  }
  // 9 e 10 (deriva energetica, capacità nel piano): in oee.js › productionSignals, eseguiti con i fornitori

  // 11 · clienti fermi: frequenza = giorni di consegna distinti / giorni dalla prima consegna (almeno 30); soglia = max(30, 3 intervalli)
  const firstShip = {}, lastShip = {}, days = {};
  for (const s of d.shipments) {
    if (s.date > today) continue;
    if (!firstShip[s.customerId] || s.date < firstShip[s.customerId]) firstShip[s.customerId] = s.date;
    if (!lastShip[s.customerId] || s.date > lastShip[s.customerId]) lastShip[s.customerId] = s.date;
    (days[s.customerId] ||= new Set()).add(s.date);
  }
  for (const c of d.customers) {
    const ls = lastShip[c.id]; if (!ls) continue;
    const f = days[c.id].size / Math.max(30, daysBetween(firstShip[c.id], today));
    const every = 1 / f;
    const gap = daysBetween(ls, today);
    if (gap > Math.max(30, 3 / f)) add({ key: `idle:${c.id}:${ls}`, area: 'commerciale', roles: ['commerciale', 'agente', 'direzione'], severity: 'attenzione',
      title: `${c.name} non ordina da ${gap} giorni`, why: `Di solito riceve una consegna ogni ${nf(every)} giorni; ultima il ${dateIt(ls, 'dm')}.`,
      action: 'Programmare una visita o una telefonata.', impact: 1e5 + gap, link: { area: 'commerciale', tab: 'clienti', id: c.id }, agentId: c.agentId ?? null });
  }

  // 12 · mercati
  const byCom = {};
  for (const q of d.market) if (q.date <= today) (byCom[q.commodity] ||= []).push(q); // solo quotazioni già pubblicate
  for (const [com, qs] of Object.entries(byCom)) {
    qs.sort((a, b) => a.date < b.date ? -1 : 1);
    const last = qs[qs.length - 1], prev = qs[qs.length - 5];
    if (!prev) continue;
    const ch = last.price / prev.price - 1;
    if (Math.abs(ch) >= 0.05) add({ key: `mkt:${com}:${last.date}`, area: 'acquisti', roles: ['acquisti', 'direzione', 'formulazione'], severity: ch > 0 ? 'attenzione' : 'info',
      title: `${last.label} ${ch > 0 ? '+' : '−'}${nf(Math.abs(ch) * 100)}% in 4 settimane`, why: `${nf(prev.price)} → ${nf(last.price)} €/t (${last.source}).`,
      action: ch > 0 ? 'Verificare le coperture e l’effetto sui costi con il simulatore «E se…».' : 'Valutare acquisti a copertura.', impact: Math.abs(ch) * 1e4,
      link: { area: 'acquisti', tab: 'mercati', id: com } });
  }

  // 13 · dati ESG mancanti
  const lastMonth = addDays(today.slice(0, 7) + '-01', -1).slice(0, 7);
  if (!d.energy.some(e => e.month === lastMonth)) add({ key: `esg-energy:${lastMonth}`, area: 'esg', roles: ['direzione', 'produzione'], severity: 'attenzione',
    title: `Letture energetiche di ${lastMonth} da registrare`, why: 'Prelievo di rete, produzione e immissione del fotovoltaico, GPL: servono per E1–E7 e per la CO₂ per tonnellata.',
    action: 'Registrare le letture del mese.', impact: 1e3, link: { area: 'esg', tab: 'energia' } });

  // 13b · acqua: lettura del mese mancante, consumo per tonnellata in aumento
  const P12 = { from: addDays(today, -364), to: today };
  if ((d.water || []).length) {
    if (!d.water.some(w => w.month === lastMonth)) add({ key: `esg-water:${lastMonth}`, area: 'esg', roles: ['direzione', 'produzione'], severity: 'attenzione',
      title: `Lettura dell’acqua di ${monthLabel(lastMonth, false)} da registrare`, why: 'Serve per il prelievo idrico (E9) e per i litri d’acqua per tonnellata di mangime.',
      action: 'Registrare la lettura del contatore.', impact: 900, link: { area: 'esg', tab: 'acqua' } });
    const ws = waterStats(d, P12), drift = esgThresholds(d).waterDrift; // soglia configurabile (F10), di base +12%
    if (ws.drift != null && ws.drift > drift) {
      const top = Object.entries(ws.sourceDrift).sort((a, b) => b[1] - a[1])[0];
      add({ key: `water-drift:${ws.lastMonth}`, area: 'esg', roles: ['direzione', 'produzione'], severity: 'attenzione',
        title: `Acqua per tonnellata +${nf(ws.drift * 100)}% negli ultimi 3 mesi`,
        why: `${nf(ws.recent * 1000, 1)} litri per tonnellata contro ${nf(ws.before * 1000, 1)} dei mesi precedenti, a parità di produzione.${top && top[1] > drift ? ` L’aumento viene soprattutto da: ${top[0].toLowerCase()} (+${nf(top[1] * 100)}%).` : ''}`,
        action: 'Cercare perdite sulla rete e sui servizi (servizi igienici, lavaggi, reintegro caldaia) e confrontare le letture dei contatori.', impact: 1.5e5 + ws.drift * 1e5,
        link: { area: 'esg', tab: 'acqua' } });
    }
  }
  // 13c · rifiuti recuperabili mandati a smaltimento
  if ((d.waste || []).length) {
    const wst = wasteStats(d, P12);
    const top = wst.missed[0];
    if (wst.n >= 4 && wst.missedKg >= 500) add({ key: `waste-missed:${today.slice(0, 7)}`, area: 'esg', roles: ['direzione', 'produzione', 'qualita'], severity: 'info',
      title: `${nf(wst.missedKg)} kg di rifiuti recuperabili sono andati a smaltimento`,
      why: `${top.name} (EER ${top.code}): ${nf(top.disposedKg)} kg negli ultimi 12 mesi con destinazione smaltimento. Quota complessiva a recupero ${nf((wst.recovery || 0) * 100)}%.`,
      action: 'Separare gli imballaggi alla fonte e chiedere al trasportatore il conferimento a recupero.', impact: 2e4 + wst.missedKg,
      link: { area: 'esg', tab: 'rifiuti' } });
  }

  // 14 · attività scadute
  for (const t of d.tasks) if (t.status !== 'fatto' && t.status !== 'scartato' && t.due && t.due < today) add({ key: `task:${t.id}`, area: t.area || 'oggi', roles: ['direzione', t.area], severity: 'attenzione',
    title: `Attività scaduta: ${t.title}`, why: `Scadenza ${dateIt(t.due, 'dm')} · responsabile ${t.owner || 'da assegnare'}.`, action: 'Aggiornare lo stato o ripianificare.', impact: 5e4, link: { area: 'oggi', tab: 'attivita', id: t.id } });

  // fornitori dei pacchetti (budget, finanza, redditività, commerciale, acquisti, produzione, KPI, qualità dei dati)
  for (const p of SIGNAL_PROVIDERS) try { for (const s of p(d, ctx) || []) add(s); } catch (e) { console.warn('FeedOS: segnali non calcolati', p.name, e); }

  const st = d.settings?.signalState || {};
  return out.filter(s => { const k = st[s.key]; return !k || (k.status === 'rimandato' && k.until <= today); }).sort((a, b) => b.rank - a.rank);
}
