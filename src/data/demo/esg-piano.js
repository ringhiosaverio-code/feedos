/* FeedOS 18 · Dati dimostrativi · Obiettivi e piano (pacchetto WP7).
 * Contratto: demoPiano(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.piano.
 * Dati inventati: mangimificio dimostrativo di Valle Verde (FeedOS) o azienda di agrofarmaci dimostrativa (DifesaOS), secondo il
 * settore dell'archivio. Gli obiettivi riprendono il questionario ESG (−15% di CO₂ per tonnellata e fotovoltaico al 55% entro tre
 * anni dall'esercizio base); i valori base vengono dallo storico dichiarato dell'esercizio base, le misure della libreria si stimano
 * dai registri (solo quelle già completate hanno valori misurati). Anni e date relativi al giorno del demo. */
import { currentPeriod, previousPeriod, sectorOf } from '../../engine/esg-years.js';
import { inventory } from '../../engine/esg-clima.js';
import { addDays, round } from '../../core/util.js';

const T = (id, metric, o) => ({ id, metric, type: 'intensità', pathway: 'lineare', reference: 'interno', status: 'approvato', ...o });
const M = (id, libId, o) => ({ id, libId, evidenceIds: [], params: {}, ...o });

/** Estensore del pacchetto piano. */
export function demoPiano(d, { today } = {}) {
  if (!d || !today) return {};
  for (const c of ['esgTargets', 'measures', 'sllLoans']) if (Array.isArray(d[c]) && d[c].length) return {};
  if (d.settings?.esg18?.piano) return {};
  const dd = { ...d, settings: { ...d.settings, demoAnchor: today, dataset: 'demo' } };
  const P = currentPeriod(dd), base = previousPeriod(dd, P.key);
  const py = +P.to.slice(0, 4), by = +base.to.slice(0, 4), cy = +today.slice(0, 4);
  let inv = null;
  try { inv = inventory(dd, P); } catch { inv = null; }
  const cur = inv?.hasData && inv.intensity?.opsPerT ? inv.intensity.opsPerT : null;
  const agro = sectorOf(d) === 'agrofarmaci';
  const approvedAt = `${py}-03-24`;
  const common = [
    T('pi-t-s12t', 's12-t', { title: 'Scope 1 + 2 per tonnellata: −15% in tre anni', kpi: 'esg-s12-t', baseKey: base.key, baseYear: by, reductionPct: 15, targetYear: by + 3, approvedAt, approvedBy: 'Consiglio di amministrazione',
      note: 'Dal questionario ESG; valore base dallo storico dichiarato dell’esercizio base (dato dimostrativo).' }),
    T('pi-t-ren', 'ren-el', { title: 'Elettricità rinnovabile al 55%', kpi: 'esg-ren-el', type: 'quota', baseKey: base.key, baseYear: by, baseValue: 38, targetValue: 55, targetYear: by + 3, approvedAt, approvedBy: 'Consiglio di amministrazione',
      note: 'Quota base dichiarata (fotovoltaico esistente); ampliamento del fotovoltaico con accumulo (dato dimostrativo).' }),
  ];
  const targets = agro ? [
    ...common,
    T('pi-t-rame', 'rame-ha', { title: 'Rame per ettaro nei programmi consigliati', baseKey: base.key, baseYear: by, baseValue: 2.4, targetValue: 1.5, targetYear: by + 3, approvedAt, approvedBy: 'Consiglio di amministrazione',
      note: 'Media dei programmi di difesa consigliati ai clienti (olivo, vite, melo); limite di legge 28 kg/ha in 7 anni (dato dimostrativo).' }),
    T('pi-t-rec', 'recupero', { title: 'Rifiuti a recupero al 60%', type: 'quota', baseKey: base.key, baseYear: by, targetValue: 60, targetYear: by + 3, status: 'proposto',
      note: 'Imballi contaminati e acque di lavaggio: più recupero di materia con il nuovo contratto del trasportatore (dato dimostrativo).' }),
  ] : [
    ...common,
    T('pi-t-soia', 'soia-dcf', { title: 'Soia senza deforestazione al 60%', type: 'quota', baseKey: base.key, baseYear: by, baseValue: 0, targetValue: 60, targetYear: by + 2, approvedAt, approvedBy: 'Consiglio di amministrazione',
      note: 'Soia DCF fisica (segregata o a identità preservata), senza i crediti a bilancio di massa (dato dimostrativo).' }),
    T('pi-t-if', 'if', { title: 'Indice di frequenza sotto 15', baseKey: base.key, baseYear: by, targetValue: 15, targetYear: by + 2, approvedAt, approvedBy: 'Consiglio di amministrazione',
      note: 'Infortuni per milione di ore lavorate; base dallo storico dichiarato (dato dimostrativo).' }),
  ];
  const late = addDays(today, -20);
  const done = (id, libId, title, o) => M(id, libId, { title, status: 'completata', startYear: cy - 1, completedAt: `${cy - 1}-${o.month}`, owner: o.owner, tco2Year: o.t, savingsEur: o.sav, capex: o.capex, opexDelta: o.opex || 0,
    lifeYears: o.life, incentive: o.incentive ?? null, note: o.note });
  const measures = agro ? [
    M('pi-m-vfd', 'vfd', { title: 'Inverter su mulino ad aria e ventilatori dell’essiccatore WG', status: 'approvata', startYear: cy, dueDate: late, owner: 'Resp. manutenzione', incentive: 'iper-green', params: { n: 2 },
      note: 'Offerta in valutazione; consegna slittata per i tempi del fornitore (dato dimostrativo).' }),
    M('pi-m-ess', 'essiccatore-recupero', { title: 'Recupero di calore sull’aria esausta dell’essiccatore WG', status: 'approvata', startYear: cy + 1, dueDate: `${cy + 1}-06-30`, owner: 'Resp. manutenzione', incentive: 'iper-green' }),
    M('pi-m-fv', 'fv-bess', { title: 'Fotovoltaico sul magazzino biologici: +250 kWp e accumulo da 400 kWh', status: 'in corso', startYear: cy, dueDate: `${cy}-12-31`, owner: 'Direzione tecnica', incentive: 'iper-green', capex: 392000,
      params: { kWp: 250, bessKwh: 400 }, note: 'Preventivo dell’installatore, allacciamento richiesto (dato dimostrativo).' }),
    M('pi-m-solv', 'solventi-recupero', { title: 'Recupero dei solventi sugli sfiati della linea liquidi', status: 'approvata', startYear: cy + 1, dueDate: `${cy + 1}-09-30`, owner: 'Resp. HSE', incentive: 'iper-green' }),
    M('pi-m-cov', 'cov-carboni', { title: 'Carboni attivi sugli sfiati dei miscelatori EC', status: 'in corso', startYear: cy, dueDate: `${cy}-12-15`, owner: 'Resp. HSE', note: 'Richiesto dalla revisione dell’autorizzazione alle emissioni (dato dimostrativo).' }),
    M('pi-m-pcr', 'imballi-pcr', { title: 'Taniche da 5 e 20 L con il 30% di polietilene riciclato', status: 'idea', startYear: cy + 1, owner: 'Acquisti' }),
    M('pi-m-rame', 'rame-basso-dosaggio', { title: 'Programma rame a basso dosaggio (formulati WG e SC)', status: 'approvata', startYear: cy, dueDate: `${cy + 2}-03-31`, owner: 'Regolatorio e sviluppo',
      note: 'Prove di campo su olivo e vite in corso; registrazione dei nuovi formulati (dato dimostrativo).' }),
    done('pi-m-led', 'led', 'Illuminazione a LED del magazzino ADR e della linea liquidi', { month: '05-31', owner: 'Resp. manutenzione', t: 3.4, sav: 3300, capex: 38500, life: 15, incentive: 'sabatini', note: 'Valori misurati sulle bollette dei 6 mesi successivi (dato dimostrativo).' }),
    done('pi-m-aria', 'aria-compressa', 'Ricerca delle perdite di aria compressa', { month: '11-30', owner: 'Resp. manutenzione', t: 5.1, sav: 5000, capex: 2800, opex: 6500, life: 5, note: 'Due campagne con gli ultrasuoni l’anno (dato dimostrativo).' }),
  ] : [
    M('pi-m-vfd', 'vfd', { title: 'Inverter sulla pressa e sul mulino della linea pellet 2', status: 'approvata', startYear: cy, dueDate: late, owner: 'Resp. manutenzione', incentive: 'iper-green', params: { share: 0.25, n: 2 },
      note: 'Offerta in valutazione; consegna slittata per i tempi del fornitore (dato dimostrativo).' }),
    M('pi-m-eco', 'economizzatore', { title: 'Economizzatore della caldaia e recupero delle condense', status: 'idea', startYear: cy + 1, owner: 'Resp. manutenzione', incentive: 'TEE' }),
    M('pi-m-fv', 'fv-bess', { title: 'Fotovoltaico sulla copertura del magazzino: +300 kWp e accumulo da 400 kWh', status: 'in corso', startYear: cy, dueDate: `${cy}-12-31`, owner: 'Direzione tecnica', incentive: 'iper-green', capex: 486000,
      params: { kWp: 300, bessKwh: 400 }, note: 'Preventivo dell’installatore, lavori avviati (dato dimostrativo).' }),
    done('pi-m-led', 'led', 'Illuminazione a LED dei capannoni e del piazzale', { month: '06-30', owner: 'Resp. manutenzione', t: 4.3, sav: 3500, capex: 31500, life: 15, incentive: 'sabatini', note: 'Valori misurati sulle bollette dei 6 mesi successivi (dato dimostrativo).' }),
    done('pi-m-aria', 'aria-compressa', 'Ricerca delle perdite di aria compressa', { month: '11-30', owner: 'Resp. manutenzione', t: 6, sav: 4900, capex: 3200, opex: 7000, life: 5, note: 'Due campagne con gli ultrasuoni l’anno (dato dimostrativo).' }),
    M('pi-m-hvo', 'hvo', { title: 'HVO per il 30% della flotta di consegna', status: 'idea', startYear: cy + 1, owner: 'Logistica' }),
    M('pi-m-dcf', 'soia-dcf', { title: 'Soia DCF al 60% nelle formule principali', status: 'approvata', startYear: cy, dueDate: `${cy + 1}-06-30`, owner: 'Acquisti', params: { share: 0.6 },
      note: 'Contratti con due fornitori di soia segregata; premio di prezzo dalla formulazione a basso carbonio (dato dimostrativo).' }),
    M('pi-m-gira', 'sost-soia', { title: 'Girasole e colza al posto di parte della farina di soia', status: 'idea', startYear: cy + 1, owner: 'Formulazione', params: { share: 0.3 } }),
  ];
  const s12 = (f, dec = 1) => (cur ? round(cur * f, dec) : null);
  const spt = (a, b, c) => Object.fromEntries([[py, a], [py + 1, b], [py + 2, c]].filter(([, v]) => v != null));
  const sllLoans = [agro
    ? { id: 'pi-sll-1', bank: 'Banca Emiliana (fantasia)', amount: 2500000, marginBps: 165, ratchetBps: 5, startDate: `${py - 1}-11-20`, endDate: `${py + 4}-11-20`, verifier: 'Società di revisione (fantasia)',
      kpis: [{ metric: 's12-t', spt: spt(s12(1.01), s12(0.96), s12(0.9)) }, { metric: 'recupero', spt: spt(50, 54, 58) }], testDates: [`${py + 1}-05-31`, `${py + 2}-05-31`],
      note: 'Finanziamento chirografario di 5 anni con scatto del margine su due KPI (dato dimostrativo).' }
    : { id: 'pi-sll-1', bank: 'Banca Alfa (fantasia)', amount: 3000000, marginBps: 180, ratchetBps: 7.5, startDate: `${py - 1}-05-15`, endDate: `${py + 4}-05-15`, verifier: 'Società di revisione (fantasia)',
      kpis: [{ metric: 's12-t', spt: spt(s12(1.01), s12(0.96), s12(0.9)) }, { metric: 'soia-dcf', spt: spt(10, 30, 50) }], testDates: [`${py + 1}-04-30`, `${py + 2}-04-30`],
      note: 'Finanziamento dell’impianto fotovoltaico e delle linee: margine ± 7,5 punti base su due KPI verificati ogni anno (dato dimostrativo).' }];
  for (const k of sllLoans[0].kpis) if (!Object.keys(k.spt).length) delete k.spt;
  const settings = {
    carbonPrice: 80, discountRate: 0.06, ires: 0.24, horizon: 10, ets2Prices: [45, 60, 100], targets: { pvShare: 0.40, recovery: 0.50, trainingH: 20, waterDrift: 0.12 },
    withIncentives: false, teePrice: null, primaryTarget: 'pi-t-s12t', sbtiSubmission: null,
    planVerified: false, verifier: '', verifiedAt: null, planApprovedAt: approvedAt, planApprover: 'Consiglio di amministrazione', planOwner: 'Amministratore delegato',
    planNote: 'Piano approvato con il budget; verifica esterna prevista con la revisione del prossimo esercizio (dato dimostrativo).',
  };
  return { add: { esgTargets: targets, measures, sllLoans }, settings: { esg18: { piano: settings } } };
}
