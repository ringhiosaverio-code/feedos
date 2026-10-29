/* FeedOS 18 · Dati dimostrativi · Registri ambientali (pacchetto WP9): camini e campionamenti, scarichi idrici, registrazioni RENTRI
 * dei movimenti del registro dei rifiuti, un audit energetico e le soglie del pacchetto. Solo aggiunte, idempotente (se i dati ci sono
 * già restituisce {}), deterministico (R = rng del seme + offset). Dati inventati: il mangimificio dimostrativo di Valle Verde e
 * l’azienda di agrofarmaci dimostrativa (sector «agrofarmaci»: camini dell’essiccatore e dello scrubber dei solventi, rame negli scarichi,
 * lavaggi delle linee; nessuna parola del mangimificio). Impostazioni solo in settings.esg18.ambiente. */
import { addDays } from '../../core/util.js';
import { sectorOf } from '../../engine/esg-years.js';
import { XFIR_FROM, isPrelim } from '../../engine/esg-ambiente-calc.js';

const arr = x => (Array.isArray(x) ? x : []);
const ymd = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
/** Data di chiusura del periodo di 90 giorni per le operazioni finali (le più vecchie hanno già un’operazione finale). */
const cutoffOf = today => addDays(today, -90);

const FEED_STACKS = [
  { id: 'st-e1', code: 'E1', name: 'Ricevimento e macinazione (aspirazione)', origin: 'ricevimento', pollutant: 'polveri', flowNm3h: 12000, hoursYear: 2000, limitMgNm3: 10, filter: 'Filtro a maniche', permitRef: 'AUA dimostrativa, prescrizione 4', freqMonths: 6 },
  { id: 'st-e2', code: 'E2', name: 'Raffreddatore della linea L1', origin: 'raffreddamento', pollutant: 'polveri', flowNm3h: 18000, hoursYear: 5000, limitMgNm3: 10, filter: 'Cicloni e filtro a maniche', permitRef: 'AUA dimostrativa, prescrizione 5', freqMonths: 6 },
  { id: 'st-e3', code: 'E3', name: 'Raffreddatore della linea L2', origin: 'raffreddamento', pollutant: 'polveri', flowNm3h: 18000, hoursYear: 5000, limitMgNm3: 10, filter: 'Cicloni e filtro a maniche', permitRef: 'AUA dimostrativa, prescrizione 5', freqMonths: 6 },
  { id: 'st-e4', code: 'E4', name: 'Caldaia a GPL del vapore', origin: 'caldaia', pollutant: 'NOx', flowNm3h: 1800, hoursYear: 3000, limitMgNm3: 350, filter: 'Nessuno (combustione a GPL)', permitRef: 'AUA dimostrativa, prescrizione 7', freqMonths: 12 },
];
const FEED_SAMPLES = [
  ['st-e1', '2025-11-20', 4.6], ['st-e1', '2026-05-14', 4.2],
  ['st-e2', '2025-12-03', 4.6], ['st-e2', '2026-06-09', 4.1],
  ['st-e3', '2025-12-04', 3.8], ['st-e3', '2026-06-10', 4.0],
  ['st-e4', '2025-12-15', 118], ['st-e4', '2026-06-17', 131],
];
const AGRO_STACKS = [
  { id: 'st-e1', code: 'E1', name: 'Essiccatore del granulatore WG', origin: 'essiccazione', pollutant: 'polveri', flowNm3h: 6200, hoursYear: 3200, limitMgNm3: 20, filter: 'Maniche filtranti', permitRef: 'AUA dimostrativa, prescrizione 3', freqMonths: 6 },
  { id: 'st-e2', code: 'E2', name: 'Scrubber degli sfiati dei solventi', origin: 'solventi', pollutant: 'COV', flowNm3h: 2500, hoursYear: 2000, limitMgNm3: 50, filter: 'Scrubber a umido', permitRef: 'AUA dimostrativa, prescrizione 6', freqMonths: 12 },
  { id: 'st-e3', code: 'E3', name: 'Generatore di aria calda a GPL', origin: 'caldaia', pollutant: 'NOx', flowNm3h: 900, hoursYear: 2400, limitMgNm3: 350, filter: 'Nessuno (combustione a GPL)', permitRef: 'AUA dimostrativa, prescrizione 8', freqMonths: 12 },
];
const AGRO_SAMPLES = [
  ['st-e1', '2025-11-12', 9.1], ['st-e1', '2026-05-20', 12.4],
  ['st-e2', '2025-12-09', 21], ['st-e2', '2026-06-16', 34],
  ['st-e3', '2025-12-15', 96], ['st-e3', '2026-06-17', 104],
];
const CARRIERS = [['Trasporti Ionici S.r.l. (fantasia)', 'AL-IT-0101'], ['Ecologistica Valle Verde S.r.l. (fantasia)', 'AL-IT-0102']];

/** Movimenti registrati su RENTRI: 1 su 6 non registrato (una di recente oltre il termine), due registrazioni in ritardo, xFIR dal 15/09/2026. */
function wasteRegister(d, today, agro) {
  const rows = arr(d.waste).filter(w => ymd(w?.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const cutoff = cutoffOf(today), out = [];
  // l’ultimo movimento non è ancora registrato; il primo dopo il 15/09/2026 è registrato senza xFIR (caso da correggere)
  const lastId = rows.at(-1)?.id, noXfirId = rows.find(w => w.date >= XFIR_FROM)?.id;
  rows.forEach((w, i) => {
    if (i % 6 === 5 || w.id === lastId) return;
    const lag = i === 17 || i === 44 ? 21 : 1 + (i % 4);
    const [carrier, carrierReg] = CARRIERS[i % 2];
    const reg = { id: w.id, carrier, carrierReg, destPlant: w.dest === 'recupero' ? 'Impianto di recupero (dimostrativo)' : 'Impianto di smaltimento (dimostrativo)', destAuth: agro ? 'AUA dell’impianto (dimostrativa)' : 'Autorizzazione dell’impianto (dimostrativa)', registeredAt: addDays(w.date, lag) };
    if (w.date >= XFIR_FROM && w.id !== noXfirId) reg.xfirId = `XF-${w.id.replace('rf-', '')}-26`;
    if (isPrelim(w.op) && w.date < cutoff) reg.opFinal = w.dest === 'recupero' ? (agro ? 'R4' : 'R12') : (agro ? 'D9' : 'D10');
    out.push(reg);
  });
  return out;
}

/** Scarichi: mensili, per mese del registro dell’acqua. Mangimificio: fognatura civile (55% del prelievo). Agrofarmaci: lavaggi delle linee pretrattati in fognatura e acque di prima pioggia in corpo idrico. */
function dischargeRows(d, R, agro) {
  const months = [...new Set(arr(d.water).map(w => w.month).filter(Boolean))].sort();
  const out = [];
  for (const m of months) {
    const withdrawal = arr(d.water).filter(w => w.month === m).reduce((s, w) => s + (+w.m3 || 0), 0);
    if (!agro) {
      out.push({ id: `wd-${m}`, month: m, point: 'Scarico civile in fognatura comunale (dimostrativo)', receptor: 'fognatura', m3: Math.round(withdrawal * 0.55 * R.range(0.97, 1.03)), measured: true,
        permitRef: 'Autorizzazione allo scarico in fognatura (dimostrativa)',
        analyses: [{ param: 'Solidi sospesi totali', value: Math.round(R.range(40, 90)), unit: 'mg/l', limit: 200, limitSrc: 'Regolamento del gestore (dimostrativo)' },
          { param: 'COD', value: Math.round(R.range(180, 320)), unit: 'mg/l', limit: 500, limitSrc: 'Regolamento del gestore (dimostrativo)' }] });
      continue;
    }
    // lavaggi: 2,2 m³ per passaggio di linea L2, 1,1 m³ per L1, 0,6 m³ per L3 (come il registro di produzione)
    const rs = arr(d.runs).filter(r => r.date && r.date.slice(0, 7) === m);
    const washes = Math.round(rs.filter(r => r.lineId === 'L2').length * 2.2 + rs.filter(r => r.lineId === 'L1').length * 1.1 + rs.filter(r => r.lineId === 'L3').length * 0.6);
    out.push({ id: `wd-${m}-f`, month: m, point: 'Scarico in fognatura delle acque di lavaggio, dopo il pretrattamento (dimostrativo)', receptor: 'fognatura', m3: washes, measured: true,
      permitRef: 'Autorizzazione allo scarico in fognatura (dimostrativa)',
      analyses: [{ param: 'Rame totale', value: +R.range(1.1, 1.6).toFixed(2), unit: 'mg/l', limit: 2, limitSrc: 'Autorizzazione dimostrativa' },
        { param: 'Solidi sospesi totali', value: Math.round(R.range(40, 90)), unit: 'mg/l', limit: 200, limitSrc: 'Regolamento del gestore (dimostrativo)' }] });
    out.push({ id: `wd-${m}-m`, month: m, point: 'Acque meteoriche di prima pioggia, corpo idrico superficiale (dimostrativo)', receptor: 'corpo idrico', m3: Math.round(R.range(20, 45)), measured: false,
      permitRef: 'Autorizzazione allo scarico in corpo idrico (dimostrativa)',
      analyses: [{ param: 'Rame totale', value: +R.range(0.02, 0.05).toFixed(3), unit: 'mg/l', limit: 0.1, limitSrc: 'Autorizzazione dimostrativa' }] });
  }
  return out;
}

/**
 * Estensore «ambiente»: camini (4 nel mangimificio, 3 nell’azienda di agrofarmaci), campionamenti, scarichi, registrazioni RENTRI,
 * un audit energetico interno e le impostazioni. Per il settore dell’archivio: sectorOf(d).
 */
export function demoAmbiente(d, { today, R } = {}) {
  if (!d || !R || !ymd(today) || arr(d.stacks).length || arr(d.waterDischarges).length || arr(d.wasteRentri).length) return {};
  const agro = sectorOf(d) === 'agrofarmaci';
  const stacks = agro ? AGRO_STACKS : FEED_STACKS;
  const samples = (agro ? AGRO_SAMPLES : FEED_SAMPLES).map(([stackId, date, v], i) => ({ id: `sm-${stackId.slice(3)}-${i + 1}`, stackId, date, valueMgNm3: v, lab: 'Laboratorio accreditato (dimostrativo)', evidenceId: null }));
  const audit = agro
    ? { id: 'ea-2024', date: '2024-06-12', type: 'interno', auditor: 'Ufficio tecnico dello stabilimento (dimostrativo)', measures: 'Recupero del calore dell’essiccatore e controllo dei compressori d’aria', nextDue: '2028-06-12' }
    : { id: 'ea-2024', date: '2024-06-12', type: 'interno', auditor: 'Ufficio tecnico dello stabilimento (dimostrativo)', measures: 'Inverter sui ventilatori e recupero del calore dei raffreddatori', nextDue: '2028-06-12' };
  return {
    add: {
      stacks: stacks.map(s => ({ ...s })),
      stackSamples: samples,
      waterDischarges: dischargeRows(d, R, agro),
      wasteRentri: wasteRegister(d, today, agro),
      energyAudits: [audit],
    },
    settings: { esg18: { ambiente: { waterStress: 'basso', anomalyK: 3.5, benchmark: agro ? null : { elPellet: 33, thPellet: 32 } } } },
  };
}
