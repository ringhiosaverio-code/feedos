/* DifesaOS · Estensore del demo: registrazioni, usi in etichetta, procedimenti, sostanze attive, schede di sicurezza,
 * classificazione Seveso e ADR (area Regolatorio). TUTTO INVENTATO: numeri di registrazione, date, dosi e stati sono
 * dimostrativi e non descrivono prodotti reali. La struttura dei dati (coltura, avversità, dose per ettolitro e per ettaro,
 * trattamenti all'anno, carenza) è quella delle etichette italiane. Contratto e regola «solo aggiunte» come in data/demo/extend.js. */
import { addDays, addMonths, round } from '../../../core/util.js';
import { ACTIVES_AGRO, HAZARD_AGRO, RM_SEVESO } from './catalog.js';
import { finishedStock, rawStock, sevesoIndex } from '../../../engine/agro-reg.js';

// gruppi di resistenza (codici pubblici FRAC, IRAC, HRAC; da verificare sull'ultima tabella)
const MOA = { rame: 'FRAC M01', zolfo: 'FRAC M02', tetraconazolo: 'FRAC 3', fosetil: 'FRAC P07', acetamiprid: 'IRAC 4A', deltametrina: 'IRAC 3A', pendimetalin: 'HRAC 3', flufenacet: 'HRAC 15', bacillus: 'FRAC BM02', arancio: 'non classificato (da verificare)' };
const CROP = { vite: 'Vite', olivo: 'Olivo', frutta: 'Melo e pero', orticole: 'Pomodoro', cereali: 'Frumento e orzo' };
// usi per sostanza e coltura: [avversità, dose per hl (g o ml), dose min e max per ha (kg o L), trattamenti all'anno, carenza in giorni (null = fino a inizio fioritura)]
const USES = {
  rame: { vite: ['Peronospora, escoriosi', 150, 1.5, 2.5, 5, 21], olivo: ['Occhio di pavone, rogna', 250, 2.5, 3.5, 3, 14], frutta: ['Ticchiolatura, cancri rameali (autunno-inverno)', 300, 3, 4, 3, null], orticole: ['Peronospora, batteriosi', 200, 1.5, 2.5, 6, 3] },
  zolfo: { vite: ['Oidio', 250, 3, 5, 8, 5], frutta: ['Oidio', 300, 3, 4.5, 6, 5], orticole: ['Oidio', 300, 3, 4, 6, 5] },
  tetraconazolo: { vite: ['Oidio', 30, 0.25, 0.35, 3, 14], frutta: ['Ticchiolatura, oidio', 40, 0.5, 0.6, 3, 14], cereali: ['Septoriosi, ruggini', null, 0.8, 1, 2, 35] },
  fosetil: { vite: ['Peronospora', 250, 2.5, 3, 4, 28], frutta: ['Marciume del colletto, batteriosi', 250, 3, 3.75, 4, 15], orticole: ['Peronospora', 250, 2, 2.5, 3, 15] },
  acetamiprid: { frutta: ['Afidi, carpocapsa', 25, 0.2, 0.25, 2, 14], orticole: ['Afidi, aleurodidi', 20, 0.15, 0.2, 2, 7], vite: ['Cicaline', 15, 0.15, 0.15, 1, 21] },
  deltametrina: { olivo: ['Mosca delle olive', 50, 0.5, 0.75, 2, 7], frutta: ['Carpocapsa, cimici', 50, 0.5, 0.75, 2, 7], orticole: ['Nottue, afidi', 40, 0.3, 0.5, 2, 3], cereali: ['Afidi, criocere', null, 0.25, 0.3, 1, 30] },
  pendimetalin: { cereali: ['Infestanti graminacee e dicotiledoni (pre-emergenza)', null, 3, 5, 1, null], orticole: ['Infestanti annuali (pre-trapianto)', null, 2, 3, 1, null] },
  flufenacet: { cereali: ['Graminacee (loglio, coda di volpe)', null, 0.48, 0.6, 1, null] },
  bacillus: { vite: ['Muffa grigia', 250, 2, 4, 6, 0], frutta: ['Moniliosi, muffa grigia', 200, 2, 3, 6, 0], orticole: ['Muffa grigia, sclerotinia', 200, 2, 3, 6, 0] },
  arancio: { vite: ['Oidio, cicaline (azione collaterale)', 400, 0.8, 1.6, 6, 1], frutta: ['Oidio, afidi', 400, 1, 1.6, 6, 1], orticole: ['Aleurodidi, oidio', 400, 0.8, 1.6, 6, 1] },
};
const ORGANIC = new Set(['rame', 'zolfo', 'bacillus', 'arancio']);

/** Patch del regolatorio (solo aggiunte; idempotente: se le registrazioni ci sono già non aggiunge niente). */
export function demoRegolatorio(d, { today, R } = {}) {
  if (!today || !R || !(d.products || []).length || (d.registrations || []).length) return {};
  const D = days => addDays(today, days);

  /* ---------- sostanze attive ---------- */
  const activeSubstances = ACTIVES_AGRO.map(([id, name, group, days, status, cfs, lowRisk, note]) => {
    const a = { id, name, group, moa: MOA[id] || '', status, approvalExpiry: D(days), cfs, lowRisk, renewedOn: null, conditions: '', mrlReview: '', taskForce: '', note };
    if (id === 'rame') Object.assign(a, { conditions: 'Non superare 28 kg di rame per ettaro in 7 anni; si raccomanda una media di 4 kg per ettaro all’anno (dato dimostrativo, da verificare)', taskForce: 'Task force europea dei produttori di rame (partecipazione al dossier)' });
    if (id === 'fosetil') Object.assign(a, { renewedOn: D(-58), approvalExpiry: addMonths(D(-58), 180), note: 'Approvazione rinnovata: le registrazioni dei prodotti vanno rinnovate entro 3 mesi (dato dimostrativo)' });
    if (id === 'tetraconazolo') a.taskForce = 'Dossier di rinnovo presentato dal produttore della sostanza tecnica del gruppo';
    if (id === 'acetamiprid') a.mrlReview = 'Limiti massimi di residuo ridotti su alcune colture: etichette aggiornate (dato dimostrativo)';
    return a;
  });

  /* ---------- registrazioni ---------- */
  const registrations = [], regUses = [];
  let n = 17000 + R.int(0, 400);
  for (const p of d.products) {
    const ppp = (p.actives || []).length > 0;
    n += R.int(7, 91);
    const asIds = (p.actives || []).map(x => x.as);
    const year = 2008 + R.int(0, 14);
    const reg = {
      id: 'reg-' + p.code.toLowerCase(), productId: p.id, regNumber: ppp ? `n. ${n} (demo)` : '', regDate: `${year}-${String(R.int(1, 12)).padStart(2, '0')}-${String(R.int(1, 28)).padStart(2, '0')}`,
      holder: 'proprio', holderName: 'Arvale Dimostrativa S.p.A.', kind: ppp ? 'autorizzazione' : 'CE-fertilizzante', status: 'valida',
      expiryDate: null, saleUntil: null, useUntil: null, graceBasis: null, organic: ppp ? asIds.every(a => ORGANIC.has(a)) : true,
      professionalOnly: ppp && p.code !== 'CU30WG1', declared: (p.actives || []).map(x => ({ asId: x.as, content: x.g, unit: p.uom === 'L' ? 'g/L' : 'g/kg' })),
      labelVersion: R.int(1, 3), labelDate: D(-R.int(200, 900)), relabelDeadline: null, oldLabelUnits: 0, dataProtectionUntil: null, plants: ['Campolongo'], note: ppp ? '' : 'Biostimolante marcato CE (Reg. UE 2019/1009): nessuna scadenza di autorizzazione',
    };
    if (ppp) {
      // la registrazione del prodotto segue la sostanza con la scadenza più vicina, più un anno
      const exp = asIds.map(a => activeSubstances.find(x => x.id === a)?.approvalExpiry).filter(Boolean).sort()[0];
      reg.expiryDate = exp ? addMonths(exp, 12) : null;
      if (asIds.some(a => activeSubstances.find(x => x.id === a)?.status === 'in rinnovo')) reg.status = 'in-rinnovo';
    }
    if (p.code === 'FL50SC') Object.assign(reg, { status: 'in-revoca', expiryDate: D(50), saleUntil: addMonths(D(50), 6), useUntil: addMonths(addMonths(D(50), 6), 12), graceBasis: 'decreto', note: 'Revoca dopo il mancato rinnovo della sostanza attiva: autorizzazione valida fino alla data di revoca, poi vendita e impiego fino alle date del decreto (dato dimostrativo)' });
    if (p.code === 'AC20SL') Object.assign(reg, { labelVersion: 4, labelDate: D(-75), relabelDeadline: D(38), oldLabelUnits: 2600 });
    if (p.code === 'BA25WG') reg.dataProtectionUntil = D(640);
    if (p.code === 'CU24SC') reg.dataProtectionUntil = D(300);
    registrations.push(reg);
    for (const a of asIds.slice(0, 1)) for (const crop of p.crops || []) {
      const u = USES[a]?.[crop];
      if (!u) continue;
      const [pest, perHl, lo, hi, apps, phi] = u;
      // dosi in proporzione al titolo rispetto al prodotto di riferimento della sostanza (stesse quantità di sostanza per ettaro)
      const ref = { rame: 300, zolfo: 800 }[a];
      const k = ref ? ref / ((p.actives || [])[0]?.g || ref) : 1;
      const dose = v => (v == null ? null : round(v * k, v * k < 1 ? 2 : 1));
      regUses.push({ id: `ru-${p.code.toLowerCase()}-${crop}`, registrationId: reg.id, crop, cropName: CROP[crop] || crop, pest, dosePerHl: dose(perHl), doseMin: dose(lo), doseMax: dose(hi),
        doseUnit: p.code === 'ZODP' ? 'kg/ha' : p.uom === 'L' ? 'L/ha' : 'kg/ha', perHlUnit: p.uom === 'L' ? 'ml/hl' : 'g/hl', maxApplications: apps, intervalDays: apps > 1 ? 7 : null, phiDays: phi,
        validTo: reg.useUntil || null, note: phi == null ? 'Fino a inizio fioritura o prima dell’emergenza' : '' });
    }
  }
  // la polvere di zolfo si distribuisce a secco: dosi per ettaro più alte e niente dose per ettolitro
  for (const u of regUses) if (u.id.startsWith('ru-zodp-')) Object.assign(u, { dosePerHl: null, doseMin: 20, doseMax: 30, maxApplications: 6 });

  /* ---------- procedimenti ---------- */
  const reg = code => registrations.find(r => r.id === 'reg-' + code.toLowerCase());
  const ev = (id, r, extra) => ({ id, registrationId: r?.id || null, asId: null, kind: '', dueDate: null, submittedDate: null, decisionDate: null, outcome: 'in corso', authority: 'Ministero della Salute', protocol: '', fee: null, owner: 'Regolatorio', note: '', ...extra });
  const regEvents = [
    ev('re-1', reg('FO80WG'), { asId: 'fosetil', kind: 'rinnovo-art43', dueDate: addMonths(D(-58), 3), note: 'Domanda di rinnovo del prodotto dopo il rinnovo della sostanza attiva: dossier in preparazione' }),
    ev('re-2', reg('FL50SC'), { asId: 'flufenacet', kind: 'revoca', decisionDate: D(-30), outcome: 'accolta', protocol: 'Decreto di revoca (demo)', note: `Revoca dal ${D(50)}; vendita fino al ${addMonths(D(50), 6)}, impiego fino al ${addMonths(addMonths(D(50), 6), 12)}` }),
    ev('re-3', reg('AC20SL'), { asId: 'acetamiprid', kind: 'modifica-etichetta', submittedDate: D(-190), decisionDate: D(-75), outcome: 'accolta', fee: 1800, note: 'Adeguamento ai nuovi limiti massimi di residuo' }),
    ev('re-4', reg('TE100EC'), { asId: 'tetraconazolo', kind: 'rinnovo-sostanza', submittedDate: D(-900), outcome: 'in corso', note: 'Approvazione prorogata in attesa della decisione europea' }),
    ev('re-5', reg('CU30WG'), { asId: 'rame', kind: 'rinnovo-sostanza', submittedDate: D(-620), outcome: 'in corso', fee: 42000, note: 'Quota della task force per il dossier del rame' }),
    ev('re-6', reg('BA25WG'), { asId: 'bacillus', kind: 'estensione-uso', submittedDate: D(-210), outcome: 'in corso', fee: 2400, note: 'Estensione alle fragole in serra' }),
    ev('re-7', null, { kind: 'domanda-autorizzazione', submittedDate: D(-430), outcome: 'in corso', fee: 9600, note: 'Nuovo rameico a basso dosaggio (rame 15%) per vite e olivo: valutazione zonale in corso' }),
    ev('re-8', reg('CU24SC'), { asId: 'rame', kind: 'adeguamento-clp', submittedDate: D(-120), decisionDate: D(-60), outcome: 'accolta', note: 'Nuova classificazione della miscela: scheda di sicurezza e etichetta aggiornate' }),
  ];

  /* ---------- schede di sicurezza e invii ---------- */
  const sdsDocs = [], sdsDispatches = [];
  const recent = { CU30WG: [-50, 'Aggiornata la classificazione (H318) e la sezione 14'], AC20SL: [-70, 'Nuovi limiti di residuo e frasi di etichetta'], CU24SC: [-60, 'Nuova classificazione della miscela'] };
  for (const p of d.products) {
    const hz = HAZARD_AGRO[p.code] || { h: [] };
    const versions = recent[p.code] ? 4 : R.int(2, 4);
    for (let v = 1; v <= versions; v++) {
      const isLast = v === versions;
      const date = isLast && recent[p.code] ? D(recent[p.code][0]) : D(-(versions - v) * 420 - R.int(380, 700));
      const hazardous = (hz.h || []).some(h => /^H[23]/.test(h));
      sdsDocs.push({ id: `sds-${p.code.toLowerCase()}-${v}`, productId: p.id, version: v, date, changes: isLast && recent[p.code] ? recent[p.code][1] : v === 1 ? 'Prima emissione' : 'Revisione periodica',
        ufi: hazardous ? ufi(R) : '', pcnDate: hazardous ? addDays(date, -R.int(5, 30)) : null, language: 'it' });
    }
    if (p.code === 'AR60SL') { const last = sdsDocs[sdsDocs.length - 1]; last.pcnDate = null; last.changes = 'Composizione dei coformulanti aggiornata: notifica PCN da ripresentare'; }
  }
  const latest = {};
  for (const s of sdsDocs) if (!latest[s.productId] || s.version > latest[s.productId].version) latest[s.productId] = s;
  const pairs = {};
  for (const s of [...(d.shipments || [])].sort((a, b) => (a.date < b.date ? -1 : 1))) { const k = s.customerId + '|' + s.productId; if (!pairs[k]) pairs[k] = s.date; }
  let nd = 0;
  for (const [k, first] of Object.entries(pairs)) {
    const [customerId, productId] = k.split('|');
    const doc = latest[productId];
    if (!doc) continue;
    // versione inviata: quella in vigore alla prima consegna; le revisioni recenti arrivano a circa tre clienti su quattro
    const fresh = doc.date <= today && doc.date > D(-90);
    const got = fresh ? (R.chance(0.74) ? doc.version : doc.version - 1) : doc.version;
    sdsDispatches.push({ id: `sdd-${++nd}`, customerId, productId, version: got, date: fresh && got === doc.version ? addDays(doc.date, R.int(2, 25)) : addDays(first, -R.int(0, 3)), channel: R.pick(['posta elettronica', 'portale clienti', 'posta elettronica']) });
  }

  /* ---------- classificazione nei prodotti e nelle materie prime ---------- */
  const products = d.products.filter(p => HAZARD_AGRO[p.code] && !p.hazard).map(p => ({ id: p.id, hazard: JSON.parse(JSON.stringify(HAZARD_AGRO[p.code])), organic: registrations.find(r => r.productId === p.id)?.organic || false,
    moa: (p.actives || []).map(x => MOA[x.as]).filter(Boolean).join(' + ') }));
  const ingredients = (d.ingredients || []).filter(i => RM_SEVESO[i.id] && !i.seveso).map(i => ({ id: i.id, seveso: [...RM_SEVESO[i.id]] }));

  /* ---------- Seveso: quantità notificate poco sopra le giacenze di oggi, E1 appena superata ---------- */
  const dx = { ...d, products: d.products.map(p => ({ ...p, hazard: HAZARD_AGRO[p.code] || p.hazard })), ingredients: (d.ingredients || []).map(i => ({ ...i, seveso: RM_SEVESO[i.id] || i.seveso })) };
  const sv = sevesoIndex(dx, undefined, { finished: finishedStock(d), raw: rawStock(d) });
  const notified = {};
  for (const c of sv.cats) notified[c.id] = c.id === 'E1' ? Math.max(5, Math.floor(c.tonnes * 0.92 / 5) * 5) : Math.max(5, Math.ceil((c.tonnes * 1.6 + 5) / 5) * 5);
  const settings = { agro: { seveso: { tier: 'superiore', notifiedAt: D(-560), notified, note: 'Notifica dello stabilimento di soglia superiore (dati dimostrativi)' } } };

  return { add: { activeSubstances, registrations, regUses, regEvents, sdsDocs, sdsDispatches }, update: { products, ingredients }, settings };
}

/** Codice UFI di fantasia nel formato a 16 caratteri (non calcolato con l'algoritmo ufficiale). */
function ufi(R) {
  const A = 'ACDEFGHJKMNPQRSTUVWXY0123456789';
  const s = Array.from({ length: 16 }, () => A[R.int(0, A.length - 1)]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`;
}
