/* FeedOS 18 · Dati dimostrativi · Clima e GHG (pacchetto WP1).
 * Contratto: demoClima(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.clima.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde, coerenti con il resto del demo:
 * - gasolio della flotta (4 camion di proprietà) proporzionale alle tonnellate consegnate ai clienti serviti con la flotta,
 *   circa 1 l/t; gasolio dei 3 carrelli proporzionale alla produzione (circa 4.200 litri l'anno, come nel questionario);
 *   il GPL resta nel registro dell'energia; nessun gas naturale;
 * - modalità di consegna: i clienti più lontani con un vettore (circa 18% delle tonnellate), i più vicini e piccoli ritirano
 *   in proprio (circa 12%), gli altri con la flotta;
 * - F-gas: split degli uffici R-32 2,1 kg (esente), sala quadri R-410A 6,5 kg (controllo annuale), cella degli additivi
 *   R-404A 12 kg (controllo semestrale) con una ricarica di 1,8 kg dopo una perdita e il prossimo controllo tra 20 giorni;
 * - contratti elettrici senza garanzie d'origine, mix residuo dimostrativo 0,45 kg CO₂/kWh (non è il valore AIB);
 * - profili logistici delle materie prime (soia extra-UE via nave, UE via camion, nazionali compresi nel fattore);
 * - materiali di consumo a valore; anno base = l'esercizio corrente (non ancora congelato). */
import { addDays, addMonths, monthLabel, round } from '../../core/util.js';

const isNum = v => v != null && v !== '' && Number.isFinite(+v);
const R6371 = 6371;
function km(a, b) {
  const r = x => (+x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function demoClima(d, { today, R } = {}) {
  if (!d || !Array.isArray(d.runs) || !d.runs.length) return {};
  const already = ['fuelUse', 'vehicles', 'fgasEquipment', 'fgasEvents', 'elecContracts', 'logisticsProfiles', 'customerLogistics', 'scope3Inputs', 'factorOverrides'].some(c => Array.isArray(d[c]) && d[c].length);
  if (already) return {};
  const t0 = String(today || d.settings?.demoAnchor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t0)) return {};
  const noise = s => (R && typeof R.normal === 'function' ? R.normal(0, s) : 0);
  const lastClosed = addMonths(t0.slice(0, 7), -1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(lastClosed, i - 11));
  const inWin = new Set(months);
  const years = [...new Set(months.map(m => +m.slice(0, 4)))];

  /* ---------- mezzi ---------- */
  const vehicles = [
    { id: 'ecl-ve-at1', code: 'AT-01', kind: 'autoarticolato', fuel: 'gasolio', euro: 'Euro 6', owned: true, payloadT: 28 },
    { id: 'ecl-ve-at2', code: 'AT-02', kind: 'autoarticolato', fuel: 'gasolio', euro: 'Euro 6', owned: true, payloadT: 28 },
    { id: 'ecl-ve-mo1', code: 'MO-01', kind: 'motrice', fuel: 'gasolio', euro: 'Euro 6', owned: true, payloadT: 14 },
    { id: 'ecl-ve-mo2', code: 'MO-02', kind: 'motrice', fuel: 'gasolio', euro: 'Euro 6', owned: true, payloadT: 14 },
    { id: 'ecl-ve-ce1', code: 'CE-01', kind: 'carrello', fuel: 'gasolio', euro: 'Stage IV', owned: true, payloadT: 3.5 },
    { id: 'ecl-ve-ce2', code: 'CE-02', kind: 'carrello', fuel: 'gasolio', euro: 'Stage IV', owned: true, payloadT: 3.5 },
    { id: 'ecl-ve-ce3', code: 'CE-03', kind: 'carrello', fuel: 'gasolio', euro: 'Stage V', owned: true, payloadT: 2.5 },
  ];
  const trucks = [['ecl-ve-at1', 0.31], ['ecl-ve-at2', 0.29], ['ecl-ve-mo1', 0.21], ['ecl-ve-mo2', 0.19]];

  /* ---------- modalità di consegna ai clienti ---------- */
  const co = d.settings?.company || {};
  const plant = isNum(co.lat) && isNum(co.lon) ? { lat: +co.lat, lon: +co.lon } : { lat: 39.55, lon: 16.3 };
  const tByCust = {};
  for (const s of d.shipments || []) if (s && inWin.has(String(s.date).slice(0, 7))) tByCust[s.customerId] = (tByCust[s.customerId] || 0) + (+s.tonnes || 0);
  const totT = Object.values(tByCust).reduce((a, b) => a + b, 0);
  const custs = (d.customers || []).map(c => ({ c, t: tByCust[c.id] || 0, k: isNum(c.lat) && isNum(c.lon) ? km(plant, c) : 0 }));
  const mode = {};
  let acc = 0;
  for (const x of [...custs].sort((a, b) => b.k - a.k || (a.c.id < b.c.id ? -1 : 1))) { if (acc >= totT * 0.18) break; if (x.t <= 0) continue; mode[x.c.id] = 'vettore'; acc += x.t; }
  acc = 0;
  const near = [...custs].filter(x => !mode[x.c.id] && x.t > 0).sort((a, b) => (a.c.type === 'rivendita') === (b.c.type === 'rivendita') ? a.k - b.k || (a.c.id < b.c.id ? -1 : 1) : a.c.type === 'rivendita' ? -1 : 1);
  for (const x of near) { if (acc >= totT * 0.115) break; if (acc + x.t > totT * 0.13) continue; mode[x.c.id] = 'ritiro-cliente'; acc += x.t; }
  const customerLogistics = (d.customers || []).map(c => ({ id: c.id, mode: mode[c.id] || 'flotta-propria' }));

  /* ---------- consumi di gasolio ---------- */
  const fleetT = {}, prodT = {};
  for (const s of d.shipments || []) { const m = String(s?.date || '').slice(0, 7); if (inWin.has(m) && (mode[s.customerId] || 'flotta-propria') === 'flotta-propria') fleetT[m] = (fleetT[m] || 0) + (+s.tonnes || 0); }
  for (const r of d.runs) { const m = String(r?.date || '').slice(0, 7); if (inWin.has(m)) prodT[m] = (prodT[m] || 0) + (+r.tonnes || 0); }
  const fuelUse = [];
  let inv = 7311;
  for (const m of months) {
    const label = monthLabel(m, false);
    if (fleetT[m] > 0) {
      const tot = fleetT[m] * 1.0 * (1 + noise(0.03));
      for (const [vid, sh] of trucks) {
        const code = vehicles.find(v => v.id === vid).code;
        fuelUse.push({ id: `ecl-fu-${m}-${vid.slice(7)}`, month: m, fuel: 'gasolio', use: 'flotta', qty: round(tot * sh * (1 + noise(0.04)), 0), unit: 'l', vehicleId: vid, source: 'carta carburante',
          docRef: `Carta carburante ${code} · estratto di ${label}`, note: '' });
      }
    }
    if (prodT[m] > 0) {
      inv += 13;
      fuelUse.push({ id: `ecl-fu-${m}-carrelli`, month: m, fuel: 'gasolio', use: 'carrelli', qty: round(prodT[m] * 0.093 * (1 + noise(0.05)), 0), unit: 'l', vehicleId: null, source: 'fattura',
        docRef: `Fattura gasolio n. ${inv}/${m.slice(2, 4)} · serbatoio carrelli`, note: '' });
    }
  }

  /* ---------- gas fluorurati ---------- */
  const fgasEquipment = [
    { id: 'ecl-fg-uffici', name: 'Climatizzatore degli uffici (split)', location: 'Palazzina uffici', gas: 'R-32', chargeKg: 2.1, gwpOverride: null, hermetic: false, leakDetection: false, installedAt: '2021-05-14', fgasDbRef: '' },
    { id: 'ecl-fg-quadri', name: 'Condizionamento della sala quadri', location: 'Cabina elettrica', gas: 'R-410A', chargeKg: 6.5, gwpOverride: null, hermetic: false, leakDetection: false, installedAt: '2018-03-22', fgasDbRef: 'IMP-0001 (dimostrativo)' },
    { id: 'ecl-fg-cella', name: 'Cella frigorifera di additivi e premiscele', location: 'Magazzino additivi', gas: 'R-404A', chargeKg: 12, gwpOverride: null, hermetic: false, leakDetection: false, installedAt: '2016-09-07', fgasDbRef: 'IMP-0002 (dimostrativo)' },
  ];
  const cert = 'Tecnico certificato cat. I (dimostrativo)';
  const cellaLast = addMonths(addDays(t0, 20), -6);                       // prossimo controllo semestrale tra 20 giorni
  const repair = addDays(cellaLast, -28);                                  // perdita riparata e ricarica, verifica entro un mese
  const quadriLast = addDays(addMonths(t0, -5), -9);
  const fgasEvents = [
    { id: 'ecl-fe-cella-1', equipmentId: 'ecl-fg-cella', date: addMonths(cellaLast, -12), type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-cella-2', equipmentId: 'ecl-fg-cella', date: addMonths(cellaLast, -6), type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-cella-3', equipmentId: 'ecl-fg-cella', date: repair, type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-cella-4', equipmentId: 'ecl-fg-cella', date: repair, type: 'ricarica', kg: 1.8, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-cella-5', equipmentId: 'ecl-fg-cella', date: cellaLast, type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-quadri-1', equipmentId: 'ecl-fg-quadri', date: addMonths(quadriLast, -12), type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
    { id: 'ecl-fe-quadri-2', equipmentId: 'ecl-fg-quadri', date: quadriLast, type: 'controllo', kg: null, technicianCert: cert, sentToFgasDb: true },
  ];

  /* ---------- energia elettrica, fattori, logistica, altri dati ---------- */
  const elecContracts = years.map(y => ({ id: `ecl-ec-${y}`, year: y, supplier: 'Energia Valle Verde S.p.A. (fornitore dimostrativo)', goMWh: 0, goCountry: '', ppaMWh: 0, residualOverride: null,
    note: 'Fornitura a prezzo indicizzato, senza garanzie d’origine (dato dimostrativo)' }));
  const y0 = years[0];
  const factorOverrides = [
    { id: 'el.rm.it', value: 0.45, unit: 'kg CO₂/kWh', source: 'Valore dimostrativo: non è il mix residuo AIB pubblicato', year: y0, status: 'dimostrativo', by: 'Direzione', at: addDays(t0, -60),
      reason: 'Serve solo a mostrare lo Scope 2 market-based nel demo: sostituirlo con il mix residuo AIB dell’anno dopo averlo verificato', prev: null },
  ];
  const feGpl = +d.settings?.energy?.feGpl;
  if (isNum(feGpl) && Math.abs(feGpl - 2.985) > 1e-6) factorOverrides.push({ id: 'gpl.co2', value: feGpl, unit: 'kg CO₂/kg', source: 'Scheda tecnica del fornitore di GPL: miscela propano-butano (dato dimostrativo)', year: y0, status: 'dimostrativo',
    by: 'Qualità', at: addDays(t0, -200), reason: 'Miscela consegnata con più butano del valore IPCC di base; stesso valore della scheda Energia (dato dimostrativo)',
    prev: { value: 2.985, unit: 'kg CO₂/kg', source: 'IPCC 2006, vol. 2: 63,1 t CO₂/TJ × 47,3 MJ/kg', year: 2006, reason: 'valore del pacchetto', by: '', at: '' } });
  const ings = new Set((d.ingredients || []).map(i => i.id));
  const sea = [{ mode: 'nave', km: 10500 }, { mode: 'camion', km: 120 }];
  const logisticsProfiles = [
    ...(ings.has('soia44') ? [{ id: 'ecl-lp-soia44', ingId: 'soia44', supplierId: null, origin: null, legs: sea, includedInEf: false, note: 'Sud America → porto del Sud Italia → stabilimento (rotta dimostrativa)' }] : []),
    ...(ings.has('soiadf') ? [{ id: 'ecl-lp-soiadf', ingId: 'soiadf', supplierId: null, origin: null, legs: sea, includedInEf: false, note: 'Soia certificata: stessa rotta della convenzionale (dimostrativa)' }] : []),
    { id: 'ecl-lp-extra', ingId: null, supplierId: null, origin: 'Extra-UE', legs: sea, includedInEf: false, note: 'Altre materie prime extra-UE: rotta media via nave (dimostrativa)' },
    { id: 'ecl-lp-ue', ingId: null, supplierId: null, origin: 'UE', legs: [{ mode: 'camion', km: 900 }], includedInEf: false, note: 'Fornitori UE: camion, distanza media (dimostrativa)' },
    { id: 'ecl-lp-it', ingId: null, supplierId: null, origin: 'Italia', legs: [{ mode: 'camion', km: 180 }], includedInEf: true, note: 'Materie prime nazionali franco arrivo: trasporto già compreso nel fattore' },
  ];
  const scope3Inputs = years.map((y, i) => ({ id: `ecl-s3-cons-${y}`, year: y, cat: '1-consumabili', qty: i === 0 ? 78000 : 84000, unit: '€', factorId: 'sp.consumabili',
    note: 'Ricambi, lubrificanti, materiali di laboratorio e manutenzioni esterne (dato dimostrativo)' }));

  return {
    add: { vehicles, customerLogistics, fuelUse, fgasEquipment, fgasEvents, elecContracts, factorOverrides, logisticsProfiles, scope3Inputs },
    settings: { esg18: { clima: {
      boundary: 'controllo-operativo', baseYearKey: `12m-${lastClosed}`, recalcThresholdPct: 5, gwp: 'AR6', gridFactor: 'energia', defaultDelivery: 'flotta-propria',
      plantLat: 39.55, plantLon: 16.3, plantNote: 'coordinate dimostrative (si usano solo se l’anagrafica dell’azienda non ha le coordinate)', ets2Prices: [45, 60, 100],
    } } },
  };
}
