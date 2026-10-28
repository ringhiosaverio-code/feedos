/* DifesaOS · Estensore del demo: prove di campo, illustrazioni delle prove e prezzi rilevati della concorrenza (area Prodotti).
 * TUTTO INVENTATO: aziende agricole, centri di saggio, concorrenti e prezzi sono di fantasia; i valori dei rilievi sono generati
 * con un modello plausibile (efficacia delle tesi, effetto dei blocchi, variabilità) e non descrivono prodotti reali.
 * Le «foto» del demo sono illustrazioni disegnate dall'app (kind 'illustrazione'), mai fotografie spacciate per vere.
 * I prezzi dei concorrenti partono dal prezzo netto di Arvale degli ultimi 12 mesi e dalla differenza a ettaro voluta per la storia
 * del demo: generico del tetraconazolo più conveniente, rame a ettaro meno caro del concorrente pur costando di più al kg. */
import { addDays, round, clamp, sum } from '../../../core/util.js';
import { RIVALS_AGRO } from './catalog.js';

const P = code => 'p-' + code.toLowerCase();
const [RIV_A, RIV_B, RIV_C] = RIVALS_AGRO;

/* Prove: [codice, anni dall'anno in corso, prodotto, coltura, nome coltura, avversità, luogo, regione, azienda, mese-giorno inizio, mese-giorno fine,
 *  tesi [[id, tipo, prodotto|null, etichetta, dose, unità, trattamenti, medie {variabile: valore}]], rilievi [[id, mm-dd, BBCH, organo, variabile, main]],
 *  cv della variabilità, conclusioni (vuote = da scrivere), linee guida] */
const TRIALS = [
  ['01', -2, 'CU30WG', 'vite', 'Vite (Glera)', 'Peronospora (Plasmopara viticola)', 'Conegliano (TV)', 'Veneto', 'Azienda agricola Colle Basso (fantasia)', '04-22', '09-12',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { incidenza: 71, severita: 38, resa: 9.6, fitotossicita: 0 }],
      ['T2', 'proprio', 'CU30WG', 'Cuprarvo 30 WG', 2, 'kg/ha', 8, { incidenza: 14, severita: 4.5, resa: 14.1, fitotossicita: 0 }, true],
      ['T3', 'proprio', 'CU24SC', 'Cuprofluo SC', 1.6, 'L/ha', 8, { incidenza: 12.5, severita: 4.0, resa: 14.3, fitotossicita: 0 }],
      ['T4', 'riferimento', null, 'Rame idrossido 30 WG di mercato', 2.5, 'kg/ha', 8, { incidenza: 15.5, severita: 5.2, resa: 13.8, fitotossicita: 0 }, false, RIV_A]],
    [['A0', '05-30', 'BBCH 65', 'foglie', 'fitotossicita'], ['A1', '07-04', 'BBCH 77', 'grappoli', 'incidenza'], ['A2', '07-04', 'BBCH 77', 'grappoli', 'severita', true], ['A3', '09-05', 'BBCH 89', 'grappoli', 'resa']],
    0.16, 'Annata ad alta pressione (38% di gravità sul testimone). Cuprarvo 30 WG a 2 kg/ha (600 g di rame per ettaro a trattamento) ha protetto almeno quanto il rame idrossido di mercato a 2,5 kg/ha, con il 20% di rame in meno; nessuna fitotossicità. Indicazione: posizionare Cuprarvo 30 WG a 2 kg/ha nei trattamenti ogni 7–10 giorni.', 'EPPO PP 1/31, PP 1/152, PP 1/181'],
  ['02', -1, 'CU30WG', 'vite', 'Vite (Lambrusco)', 'Peronospora (Plasmopara viticola)', 'Sorbara (MO)', 'Emilia-Romagna', 'Cantina sociale Due Rive, vigneto sperimentale (fantasia)', '04-25', '09-20',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { severita: 52, resa: 10.4 }],
      ['T2', 'proprio', 'CU30WG', 'Cuprarvo 30 WG', 2, 'kg/ha', 9, { severita: 6.1, resa: 16.2 }, true],
      ['T3', 'altro', 'CU30WG', 'Cuprarvo 30 WG a dose ridotta', 1.5, 'kg/ha', 9, { severita: 8.9, resa: 15.4 }],
      ['T4', 'riferimento', null, 'Rame idrossido 30 WG di mercato', 2.5, 'kg/ha', 9, { severita: 6.8, resa: 16.0 }, false, RIV_A]],
    [['A1', '07-10', 'BBCH 79', 'grappoli', 'severita', true], ['A2', '09-12', 'BBCH 89', 'grappoli', 'resa']],
    0.18, 'Pressione molto alta (52% sul testimone). Cuprarvo 30 WG a 2 kg/ha almeno pari al riferimento a 2,5 kg/ha; la dose ridotta a 1,5 kg/ha resta valida nei periodi a bassa pressione ma va evitata in fioritura e allegagione.', 'EPPO PP 1/31, PP 1/152, PP 1/181'],
  ['03', -1, 'CU30WG', 'olivo', 'Olivo (Coratina)', 'Occhio di pavone (Venturia oleaginea)', 'Andria (BT)', 'Puglia', 'Oliveto sperimentale Masseria Lama (fantasia)', '10-10', '05-20',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { incidenza: 46 }],
      ['T2', 'proprio', 'CU30WG', 'Cuprarvo 30 WG', 3, 'kg/ha', 3, { incidenza: 9.0 }, true],
      ['T3', 'riferimento', null, 'Ossicloruro di rame 20 WG di mercato', 4, 'kg/ha', 3, { incidenza: 11.2 }, false, RIV_B]],
    [['A1', '05-12', 'BBCH 55', 'foglie', 'incidenza', true]],
    0.17, 'Cuprarvo 30 WG a 3 kg/ha (900 g di rame per ettaro) almeno pari all’ossicloruro di mercato a 4 kg/ha (800 g): stessa protezione con un trattamento in autunno e due a fine inverno.', 'EPPO PP 1/152, PP 1/181'],
  ['04', -1, 'TE100EC', 'melo', 'Melo (Golden Delicious)', 'Ticchiolatura (Venturia inaequalis)', 'Cles (TN)', 'Trentino', 'Frutteto sperimentale Val di Sole (fantasia)', '03-25', '08-30',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { severita: 31, fitotossicita: 0 }],
      ['T2', 'proprio', 'TE100EC', 'Tetrion 100 EC', 0.6, 'L/ha', 3, { severita: 3.8, fitotossicita: 0 }, true],
      ['T3', 'riferimento', null, 'Tetraconazolo 100 EC generico', 0.6, 'L/ha', 3, { severita: 3.4, fitotossicita: 0 }, false, RIV_C]],
    [['A0', '05-06', 'BBCH 61', 'foglie', 'fitotossicita'], ['A1', '06-18', 'BBCH 74', 'foglie', 'severita', true]],
    0.2, 'Tetrion 100 EC senza differenze significative dal generico del tetraconazolo alla stessa dose: la differenza di prezzo va giustificata con il servizio tecnico o ridotta.', 'EPPO PP 1/5, PP 1/152, PP 1/181'],
  ['05', 0, 'BA25WG', 'pomodoro', 'Pomodoro in serra (ciliegino)', 'Muffa grigia (Botrytis cinerea)', 'Vittoria (RG)', 'Sicilia', 'Serre sperimentali Ipparì (fantasia)', '02-15', '06-10',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { incidenza: 24 }],
      ['T2', 'proprio', 'BA25WG', 'Bacillon WG', 3, 'kg/ha', 6, { incidenza: 8.6 }, true],
      ['T3', 'riferimento', null, 'Fungicida di sintesi di mercato (antibotritico)', 1.2, 'kg/ha', 3, { incidenza: 3.9 }, false, RIV_B]],
    [['A1', '05-28', 'BBCH 85', 'frutti', 'incidenza', true]],
    0.18, 'Bacillon WG ha dimezzato la muffa grigia ma è rimasto sotto l’antibotritico di sintesi. Indicazione: usarlo in alternanza con il chimico e negli ultimi trattamenti prima della raccolta, dove conta l’assenza di residui.', 'EPPO PP 1/152, PP 1/181'],
  ['06', 0, 'ZO80WG', 'vite', 'Vite (Sangiovese)', 'Oidio (Erysiphe necator)', 'Montalcino (SI)', 'Toscana', 'Podere sperimentale Le Crete (fantasia)', '05-05', '09-25',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { severita: 44, resa: 7.1 }],
      ['T2', 'proprio', 'ZO80WG', 'Solfarvo 80 WG', 4, 'kg/ha', 7, { severita: 7.2, resa: 9.8 }, true],
      ['T3', 'altro', 'AR60SL', 'Solfarvo 80 WG + Citrinova SL', 1.2, 'L/ha', 7, { severita: 5.1, resa: 10.0 }],
      ['T4', 'riferimento', null, 'Zolfo bagnabile 80 WG di mercato', 4, 'kg/ha', 7, { severita: 7.9, resa: 9.7 }, false, RIV_C]],
    [['A1', '07-28', 'BBCH 81', 'grappoli', 'severita', true], ['A2', '09-18', 'BBCH 89', 'grappoli', 'resa']],
    0.17, '', 'EPPO PP 1/4, PP 1/152, PP 1/181'],
  ['07', 0, 'DE25EC', 'olivo', 'Olivo (Ogliarola)', 'Mosca delle olive (Bactrocera oleae)', 'Bitonto (BA)', 'Puglia', 'Oliveto sperimentale Masseria Lama (fantasia)', '07-15', '11-20',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, { incidenza: 28 }],
      ['T2', 'proprio', 'DE25EC', 'Deltarva 25 EC', 0.6, 'L/ha', 2, { incidenza: 6.5 }, true],
      ['T3', 'riferimento', null, 'Insetticida di mercato autorizzato su olivo', 0.5, 'L/ha', 2, { incidenza: 7.4 }, false, RIV_A]],
    [['A1', '09-20', 'BBCH 79', 'drupe', 'incidenza'], ['A2', '10-22', 'BBCH 81', 'drupe', 'incidenza', true]],
    0.2, '', 'EPPO PP 1/152, PP 1/181'],
  ['08', 1, 'PE33EC', 'frumento', 'Frumento tenero', 'Infestanti graminacee e dicotiledoni (pre-emergenza)', 'Molinella (BO)', 'Emilia-Romagna', 'Azienda agricola Bassa Pianura (fantasia)', '11-12', '05-30',
    [['T1', 'testimone', null, 'Testimone non trattato', null, '', 0, {}],
      ['T2', 'proprio', 'PE33EC', 'Pendimar 330 EC', 4, 'L/ha', 1, {}, true],
      ['T3', 'riferimento', null, 'Erbicida di pre-emergenza di mercato', 3, 'L/ha', 1, {}, false, RIV_B]],
    [], 0.2, '', 'EPPO PP 1/93, PP 1/152, PP 1/181'],
];

// coltura e organo → disegno dell'illustrazione
const ART = { vite: { grappoli: 'grappolo', foglie: 'foglia-vite' }, olivo: { foglie: 'foglie-olivo', drupe: 'olive' }, melo: { foglie: 'foglia-melo' }, pomodoro: { frutti: 'pomodori' } };
const SYMPTOM = { 'Peronospora (Plasmopara viticola)': 'peronospora', 'Oidio (Erysiphe necator)': 'oidio', 'Occhio di pavone (Venturia oleaginea)': 'occhio', 'Ticchiolatura (Venturia inaequalis)': 'ticchiolatura', 'Muffa grigia (Botrytis cinerea)': 'muffa', 'Mosca delle olive (Bactrocera oleae)': 'mosca' };
const SYMPTOM_TXT = { peronospora: 'peronospora', oidio: 'oidio', occhio: 'occhio di pavone', ticchiolatura: 'ticchiolatura', muffa: 'muffa grigia', mosca: 'punture di mosca' };

/* Prezzi della concorrenza: [prodotto, coltura, concorrente, prodotto del concorrente, dose del concorrente, unità, differenza voluta a ettaro (noi / loro − 1),
 *  rilevazioni, giorni dall'ultima, quota rilevata all'agricoltore] */
const RIVAL_PRICES = [
  ['TE100EC', 'frutta', RIV_C, 'Tetraconazolo 100 EC generico', 0.55, 'L/ha', 0.19, 6, 12, 0.3],
  ['CU30WG', 'vite', RIV_A, 'Rame idrossido 30 WG', 2.5, 'kg/ha', -0.15, 5, 25, 0.2],
  ['CU30WG', 'olivo', RIV_B, 'Ossicloruro di rame 20 WG', 4.5, 'kg/ha', -0.1, 3, 70, 0],
  ['DE25EC', 'olivo', RIV_B, 'Deltametrina 25 EC', 0.625, 'L/ha', 0.1, 4, 18, 0.5],
  ['AC20SL', 'frutta', RIV_A, 'Acetamiprid 20 SG', 0.25, 'kg/ha', 0.05, 3, 95, 0],
  ['ZO80WG', 'vite', RIV_C, 'Zolfo bagnabile 80 WG', 4, 'kg/ha', 0.05, 4, 40, 0.25],
  ['FO80WG', 'vite', RIV_A, 'Fosetil-alluminio 80 WG', 2.75, 'kg/ha', 0.04, 3, 130, 0],
  ['BA25WG', 'orticole', RIV_B, 'Bacillus amyloliquefaciens WG', 2.5, 'kg/ha', -0.08, 3, 60, 0],
  ['PE33EC', 'cereali', RIV_C, 'Pendimetalin 330 EC', 4, 'L/ha', 0.045, 3, 150, 0],
];
const DOSE_K = { 'kg/ha': 1, 'L/ha': 1 };

/** Patch delle prove di campo, delle illustrazioni e dei prezzi della concorrenza (solo aggiunte; idempotente). */
export function demoProve(d, { today, R } = {}) {
  if (!today || !R || !(d.products || []).length || (d.fieldTrials || []).length) return {};
  const has = new Set(d.products.map(p => p.id));
  const Y = +today.slice(0, 4);
  const fieldTrials = [], photos = [];
  for (const [n, dy, code, crop, cropName, pest, place, region, farm, from, to, theses, assess, cv, conclusions, guideline] of TRIALS) {
    if (!has.has(P(code))) continue;
    const season = Y + dy;
    const start = `${season - (from > to ? 1 : 0)}-${from}`, end = `${season}-${to}`;
    const cross = from > to; // la prova attraversa l'anno (inizio in autunno, fine in primavera)
    const dateOf = md => `${cross && md >= from ? season - 1 : season}-${md}`;
    const blocks = [0, 1, 2, 3].map(() => 1 + R.normal(0, 0.07));
    const T = theses.filter(t => !t[2] || has.has(P(t[2])));
    const assessments = [];
    for (const [aid, md, bbch, organ, variable, main] of assess) {
      const date = dateOf(md);
      if (date > today) continue; // il rilievo non c'è ancora
      const values = {};
      for (const t of T) {
        const mu = t[7][variable];
        if (mu == null) continue;
        values[t[0]] = blocks.map(b => {
          if (variable === 'fitotossicita') return 0;
          if (variable === 'resa') return round(mu * (1 + (b - 1) * 0.6) * (1 + R.normal(0, 0.05)), 1);
          const k = mu < 10 ? cv * 1.6 : cv; // le medie piccole variano di più
          return round(clamp(mu * b * (1 + R.normal(0, k)), 0, 100), 1);
        });
      }
      assessments.push({ id: aid, date, bbch, organ, variable, ...(main ? { main: true } : {}), values });
    }
    const status = start > today ? 'pianificata' : end < today ? 'conclusa' : 'in corso';
    const id = `tr-${season}-${n}`;
    fieldTrials.push({
      id, code: `PC-${String(season).slice(2)}-${n}`, season, status, productId: P(code), crop, cropName, pest,
      title: `${pest.split(' (')[0]} su ${cropName.split(' (')[0].toLowerCase()}: ${T.find(t => t[8])?.[3] || code} a confronto con il mercato`,
      site: { place, region, farm }, design: 'blocchi randomizzati', reps: 4, plotM2: crop === 'pomodoro' ? 12 : crop === 'cereali' ? 20 : 40, guideline, gep: true,
      center: 'Centro di saggio Arvale, riconosciuto per le prove ufficiali (dimostrativo)', start, end, volumeLHa: crop === 'pomodoro' ? 1200 : crop === 'cereali' ? 300 : crop === 'olivo' ? 1000 : 800,
      theses: T.map(([tid, kind, pc, label, dose, unit, apps, , main, rival]) => ({ id: tid, kind, productId: pc ? P(pc) : null, label, dose, doseUnit: unit, apps, ...(main ? { main: true } : {}), ...(rival ? { competitor: rival } : {}) })),
      assessments, conclusions: status === 'conclusa' ? conclusions : '', author: 'Sviluppo prodotto Arvale (dimostrativo)', note: 'Prova dimostrativa: dati inventati.',
    });
    // illustrazioni: testimone, tesi aziendale principale e riferimento al rilievo principale
    const ma = assessments.find(a => a.main) || assessments.find(a => a.variable !== 'resa' && a.variable !== 'fitotossicita');
    const art = ma && ART[crop]?.[ma.organ];
    if (ma && art) for (const t of T.filter(t => t[1] === 'testimone' || t[8] || t[1] === 'riferimento')) {
      const v = ma.values[t[0]];
      if (!v) continue;
      const sev = sum(v) / v.length / 100;
      photos.push({ id: `ph-${id}-${t[0]}`, trialId: id, thesisId: t[0], productId: t[2] ? P(t[2]) : null, role: 'prova', kind: 'illustrazione', date: ma.date,
        caption: `${t[3]}: ${ma.organ} al rilievo ${ma.bbch} (${SYMPTOM_TXT[SYMPTOM[pest]] || 'sintomi'})`,
        art: { kind: art, symptom: SYMPTOM[pest] || 'macchie', severity: round(sev, 3), seed: R.int(1, 1e6) } });
    }
  }

  // prezzi della concorrenza: prezzo netto di Arvale (ultimi 12 mesi) e dose di etichetta del prodotto sulla coltura
  const from = addDays(today, -364);
  const net = {};
  for (const s of d.shipments || []) if (s.date >= from && s.date <= today) { const o = (net[s.productId] ||= { t: 0, v: 0 }); o.t += +s.tonnes || 0; o.v += (+s.tonnes || 0) * (+s.price || 0); }
  const regOf = Object.fromEntries((d.registrations || []).map(r => [r.productId, r.id]));
  const agents = (d.agents || []).map(a => a.id);
  const custs = d.customers || [];
  const competitorPrices = [];
  let k = 0;
  for (const [code, crop, rival, cprod, cdose, cunit, gap, nObs, lastDays, farmerShare] of RIVAL_PRICES) {
    const p = d.products.find(x => x.id === P(code));
    const o = net[P(code)];
    if (!p || !o?.t) continue;
    const unitPrice = (o.v / o.t) * (p.uom === 'L' ? +p.density || 1 : 1) / 1000;
    const use = (d.regUses || []).find(u => u.registrationId === regOf[p.id] && u.crop === crop && u.doseMin != null);
    if (!use) continue;
    const ourDose = (use.doseMin + (use.doseMax ?? use.doseMin)) / 2;
    const theirPrice = (unitPrice * ourDose) / (1 + gap) / (cdose * (DOSE_K[cunit] || 1));
    for (let i = 0; i < nObs; i++) {
      const date = addDays(today, -(lastDays + Math.round((i * (330 - lastDays)) / Math.max(1, nObs - 1))) - R.int(0, 6));
      if (date < from) continue;
      const farmer = R.chance(farmerShare);
      const pool = custs.filter(c => (c.species || []).includes(crop));
      const cust = R.pick(pool.length ? pool : custs);
      const price = round(theirPrice * (1 + R.normal(0, 0.025)) * (farmer ? 1.18 : 1), 2);
      competitorPrices.push({
        id: `cp-${++k}`, date, productId: p.id, crop, competitor: rival, competitorProduct: cprod, price, unit: cunit.startsWith('L') ? 'L' : 'kg', level: farmer ? 'agricoltore' : 'rivendita',
        dose: cdose, doseUnit: cunit, customerId: cust?.id || null, agentId: cust?.agentId || R.pick(agents) || null,
        source: farmer ? 'listino del rivenditore all’agricoltore' : R.pick(['visita al rivenditore', 'offerta del concorrente vista dal cliente', 'gara di un consorzio']),
        note: 'Rilevazione dimostrativa',
      });
    }
  }
  return { add: { fieldTrials, photos, competitorPrices } };
}
