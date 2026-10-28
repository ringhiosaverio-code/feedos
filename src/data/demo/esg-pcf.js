/* FeedOS 18 · Dati dimostrativi · Impronta mangimi (pacchetto WP2 «pcf»), seme 1001.
 * Contratto: demoPcf(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se il registro c'è già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.pcf.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde:
 * - registro dei fattori: una riga generica per materia prima con il totale del catalogo (continuità con il vecchio passaporto) e
 *   componenti inventate (es. farina di soia 44%: 1.450 = fossile 420 + gestione del suolo 130 + cambio d'uso del suolo 900); righe per
 *   origine: soia 44% Brasile convenzionale 1.450 e Stati Uniti 560; soia certificata Brasile ProTerra segregata 650 (LUC 0);
 * - impronte dichiarate dal fornitore «Additivi (demo)»: lisina valida dal mese in corso, metionina scaduta (prima dell'esercizio);
 * - classi di circolarità e frazioni edibili delle proteine delle 29 materie prime; registro degli imballaggi («Sacchi 25 kg»: 40 sacchi
 *   × 0,12 kg di carta con il 30% di riciclato, 0,4 kg/t di film, pallet a rendere);
 * - tre fotografie pubblicate (una superata, una attiva aggiornata, una attiva da ricalcolare dopo la nuova formula);
 * - una proposta di formula a basso carbonio per «Latte 18 Pellet» dalla frontiera costo–emissioni; tre dichiarazioni inviate.
 * Edizione agrofarmaci: nessun dato (la scheda è nascosta). */
import { addDays, addMonths, monthStart, round } from '../../core/util.js';
import { sectorOf } from '../../engine/esg-years.js';
import { sha256HexSync, canonicalJson } from '../../core/hash.js';
import { pcf, snapshotFrom, versionLines } from '../../engine/esg-pcf-core.js';
import { lowCarbonFrontier, pointForCut, designRecord } from '../../engine/esg-pcf-formula.js';

const SRC = 'Dati dimostrativi (valori inventati per l’esempio)';
// id: [fossile, gestione del suolo, cambio d'uso del suolo, suolo m²·a/t, intervallo relativo basso, alto]
const SPLIT = {
  mais: [170, 210, 0, 1100, 0.8, 1.35], orzo: [160, 190, 0, 1700, 0.8, 1.3], frumento: [200, 230, 0, 1500, 0.8, 1.3], sorgo: [165, 195, 0, 1600, 0.8, 1.35],
  crusca: [95, 85, 0, 600, 0.7, 1.4], farinaccio: [100, 90, 0, 600, 0.7, 1.4],
  soia44: [420, 130, 900, 2600, 0.65, 1.6], soia48: [440, 140, 920, 2700, 0.65, 1.6], soiadf: [470, 180, 0, 2600, 0.75, 1.4], soiaint: [450, 150, 800, 2800, 0.6, 1.7],
  girasole: [230, 190, 30, 2000, 0.7, 1.4], colza: [260, 260, 0, 1500, 0.8, 1.35], favino: [130, 170, 0, 2600, 0.75, 1.4], pisello: [120, 160, 0, 2400, 0.75, 1.4],
  ddgs: [450, 170, 0, 700, 0.75, 1.3], glutine: [270, 130, 0, 600, 0.7, 1.5], polpe: [175, 85, 0, 300, 0.6, 1.5], medica: [250, 170, 0, 900, 0.65, 1.4], melasso: [150, 70, 0, 200, 0.6, 1.6],
  olio: [700, 200, 1500, 3000, 0.6, 1.8], carbonato: [60, 0, 0, 0, 0.5, 2], fosfato: [1200, 0, 0, 0, 0.7, 1.5], sale: [110, 0, 0, 0, 0.5, 2], bicarbonato: [800, 0, 0, 0, 0.6, 1.5],
  ossmg: [1500, 0, 0, 0, 0.7, 1.5], lisina: [3900, 400, 200, 300, 0.65, 1.4], metionina: [3500, 0, 0, 0, 0.7, 1.4], treonina: [4400, 400, 200, 300, 0.65, 1.4], premix: [1880, 120, 0, 100, 0.5, 2.5],
};
// id: [classe, HEF basso, medio, alto]
const CIRC = {
  mais: ['primario', 0.7, 0.8, 0.9], orzo: ['primario', 0.4, 0.6, 0.8], frumento: ['primario', 0.6, 0.8, 1], sorgo: ['primario', 0.4, 0.6, 0.8], crusca: ['residuo', 0, 0.1, 0.2],
  farinaccio: ['residuo', 0.1, 0.2, 0.3], soia44: ['farina-oleosa', 0.5, 0.7, 0.92], soia48: ['farina-oleosa', 0.5, 0.7, 0.92], soiadf: ['farina-oleosa', 0.5, 0.7, 0.92],
  girasole: ['farina-oleosa', 0, 0.15, 0.3], colza: ['farina-oleosa', 0, 0.3, 0.59], favino: ['primario', 0.5, 0.7, 0.9], pisello: ['primario', 0.5, 0.7, 0.9], soiaint: ['primario', 0.5, 0.7, 0.92],
  ddgs: ['residuo', 0, 0, 0.1], glutine: ['residuo', 0, 0, 0], polpe: ['residuo', 0, 0, 0], medica: ['primario', 0, 0, 0], melasso: ['residuo', 0, 0, 0], olio: ['primario', 0, 0, 0],
  carbonato: ['minerale-additivo', 0, 0, 0], fosfato: ['minerale-additivo', 0, 0, 0], sale: ['minerale-additivo', 0, 0, 0], bicarbonato: ['minerale-additivo', 0, 0, 0], ossmg: ['minerale-additivo', 0, 0, 0],
  lisina: ['minerale-additivo', 0, 0, 0], metionina: ['minerale-additivo', 0, 0, 0], treonina: ['minerale-additivo', 0, 0, 0], premix: ['minerale-additivo', 0, 0, 0],
};
const uuidOf = R => { const h = n => Array.from({ length: n }, () => Math.floor(R.next() * 16).toString(16)).join(''); return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(R.next() * 4)]}${h(3)}-${h(12)}`; };

export function demoPcf(d, { today, R } = {}) {
  if (!d || sectorOf(d) !== 'mangimi') return {};
  if ((d.efIngredients || []).length || (d.packagingSpecs || []).length || (d.pcfSnapshots || []).length) return {};
  const ings = (d.ingredients || []).filter(i => i && i.id && Number.isFinite(+i.ef));
  if (!ings.length) return {};
  const day = today || d.settings?.demoAnchor;
  if (!day) return {};
  const rnd = R && typeof R.next === 'function' ? R : { next: () => 0.5 };

  // ---------- registro dei fattori ----------
  const efIngredients = [];
  for (const i of ings) {
    const s = SPLIT[i.id];
    const total = +i.ef;
    const [fos, lm, luc, land, lo, hi] = s || [total * 0.6, total * 0.4, 0, 1000, 0.7, 1.4];
    const k = s ? total / (fos + lm + luc) : 1; // le componenti tornano sempre al totale del catalogo
    efIngredients.push({ id: `ef-${i.id}`, ingId: i.id, origin: '*', scheme: null, coc: null, fossil: round(fos * k, 1), biogenic: 0, landMgmt: round(lm * k, 1), luc: round(luc * k, 1), processing: null, transportToEu: null,
      total, landM2a: land, allocation: 'economica', db: 'dimostrativo', dbVersion: 'Valle Verde 2026.1', year: 2026, dqr: 3, low: round(total * lo, 0), high: round(total * hi, 0),
      includesTransportTo: 'mangimificio', status: 'dimostrativo', source: SRC, note: 'Riga generica: stesso valore del catalogo delle materie prime' });
  }
  const byIng = Object.fromEntries(ings.map(i => [i.id, i]));
  if (byIng.soia44) {
    efIngredients.push({ id: 'ef-soia44-br', ingId: 'soia44', origin: 'BR', scheme: null, coc: null, fossil: 420, biogenic: 0, landMgmt: 130, luc: 900, total: 1450, landM2a: 2600, allocation: 'economica', db: 'dimostrativo', dbVersion: 'Valle Verde 2026.1',
      year: 2026, dqr: 3, low: 950, high: 2300, includesTransportTo: 'mangimificio', status: 'dimostrativo', source: SRC, note: 'Brasile, soia convenzionale (cambio d’uso del suolo statistico)' });
    efIngredients.push({ id: 'ef-soia44-us', ingId: 'soia44', origin: 'US', scheme: null, coc: null, fossil: 380, biogenic: 0, landMgmt: 130, luc: 50, total: 560, landM2a: 2200, allocation: 'economica', db: 'dimostrativo', dbVersion: 'Valle Verde 2026.1',
      year: 2026, dqr: 3, low: 450, high: 680, includesTransportTo: 'mangimificio', status: 'dimostrativo', source: SRC, note: 'Stati Uniti' });
  }
  if (byIng.soiadf) efIngredients.push({ id: 'ef-soiadf-br-proterra', ingId: 'soiadf', origin: 'BR', scheme: 'ProTerra', coc: 'segregato', fossil: 470, biogenic: 0, landMgmt: 180, luc: 0, total: 650, landM2a: 2600, allocation: 'economica',
    db: 'dimostrativo', dbVersion: 'Valle Verde 2026.1', year: 2026, dqr: 3, low: 480, high: 900, includesTransportTo: 'mangimificio', status: 'dimostrativo', source: SRC, note: 'Brasile, ProTerra, catena di custodia segregata: senza conversione dopo il 2008' });

  // ---------- impronte dichiarate dal fornitore ----------
  const supplierPcfs = [];
  const sup = (d.suppliers || []).find(s => s && s.id === 'sup-additivi');
  if (sup) {
    const m0 = monthStart(day);
    const rows = [];
    if (byIng.lisina) rows.push({ ingId: 'lisina', pcfExcl: 4300, fossil: 3800, luc: 150, landMgmt: 350, periodStart: m0, periodEnd: addDays(addMonths(m0, 12), -1), primaryDataShare: 62, dqi: 2 });
    if (byIng.metionina) rows.push({ ingId: 'metionina', pcfExcl: 3300, fossil: 3300, luc: 0, landMgmt: 0, periodStart: addMonths(m0, -28), periodEnd: addDays(addMonths(m0, -16), -1), primaryDataShare: 55, dqi: 2 });
    for (const r of rows) {
      const pfId = uuidOf(rnd);
      const row = { id: `spcf-${r.ingId}-additivi`, supplierId: sup.id, supplierName: sup.name, ingId: r.ingId, pfId, specVersion: '2.3.0', pcfExcl: r.pcfExcl, pcfIncl: r.pcfExcl, fossil: r.fossil, luc: r.luc, landMgmt: r.landMgmt,
        periodStart: r.periodStart, periodEnd: r.periodEnd, primaryDataShare: r.primaryDataShare, dqi: r.dqi, fileHash: null, evidenceId: null, verified: false, status: 'valida', importedAt: r.periodStart <= day ? r.periodStart : day, source: 'file PACT (dimostrativo)' };
      row.fileHash = sha256HexSync(canonicalJson({ ...row, fileHash: null }));
      supplierPcfs.push(row);
    }
  }

  // ---------- circolarità ----------
  const ingCircular = ings.filter(i => CIRC[i.id]).map(i => { const [coClass, hefLow, hefMed, hefHigh] = CIRC[i.id]; return { id: i.id, coClass, hefLow, hefMed, hefHigh, source: 'dati dimostrativi (scenari in stile Ertl 2015)' }; });

  // ---------- imballaggi ----------
  const bagged = (d.products || []).some(p => /sacchi 25 kg/i.test(p?.packaging || ''));
  const bulk = (d.products || []).some(p => /^sfuso$/i.test(p?.packaging || ''));
  const packagingSpecs = [];
  if (bagged) packagingSpecs.push({ id: 'pk-sacchi-25', packaging: 'Sacchi 25 kg', unitsPerT: 40, palletReusable: true, palletsPerT: 0.8, conaiClass: 'carta',
    components: [{ material: 'carta', kgPerUnit: 0.12, recycledPct: 30, recyclability: 'B', supplierId: null, docEvidenceId: null }, { material: 'film-LDPE', kgPerUnit: 0.01, recycledPct: 0, recyclability: 'C', supplierId: null, docEvidenceId: null }],
    declaration: 'Dichiarazione di conformità del fornitore dei sacchi (dimostrativa)', note: 'Sacco in carta a due strati con valvola; film estensibile 0,4 kg per tonnellata; pallet EPAL a rendere' });
  if (bulk) packagingSpecs.push({ id: 'pk-sfuso', packaging: 'Sfuso', unitsPerT: 0, palletReusable: false, palletsPerT: 0, conaiClass: null, components: [], note: 'Consegna in autocisterna: nessun imballaggio' });

  // ---------- fotografie pubblicate (calcolate con il registro appena creato) ----------
  const tmp = { ...d, efIngredients, supplierPcfs, ingCircular, packagingSpecs, pcfSnapshots: [], lowCarbonDesigns: [] };
  const pcfSnapshots = [];
  const prodOf = id => (d.products || []).find(p => p && p.id === id);
  const formOf = p => (d.formulas || []).find(f => f && f.id === p?.formulaId);
  const hDate = (f, v) => (f?.history || []).find(h => +h?.version === +v)?.date || null;
  const snap = (pid, v, at, status, precedingIds = []) => {
    const r = pcf(tmp, pid, { formulaVersion: v });
    if (!r || !at || at > day) return null;
    const s = snapshotFrom(r, { id: `pcs-${pid}-${pcfSnapshots.filter(x => x.productId === pid).length + 1}`, publishedAt: at, by: 'Ufficio qualità (demo)', status, precedingIds });
    // il registro EUDR (pacchetto filiera) arriva dopo questo estensore: le fotografie dimostrative non portano il mix delle origini,
    // così il confronto per origine riparte dalla prima pubblicazione fatta dall'utente
    s.originMix = null;
    pcfSnapshots.push(s);
    return s;
  };
  const lt18s = prodOf('p-lt18s'), f18 = formOf(lt18s);
  if (lt18s && f18 && +f18.version >= 2 && versionLines(f18, +f18.version - 1)) {
    const v1 = snap('p-lt18s', +f18.version - 1, addDays(hDate(f18, +f18.version - 1) || addDays(day, -330), 30), 'superata');
    const v2 = snap('p-lt18s', +f18.version, addDays(f18.approvedAt || hDate(f18, f18.version) || addDays(day, -120), 21), 'attiva', v1 ? [v1.id] : []);
    if (v1 && v2) v1.supersededAt = v2.publishedAt;
  }
  const lt22 = prodOf('p-lt22'), f22 = formOf(lt22);
  if (lt22 && f22 && +f22.version >= 2 && versionLines(f22, +f22.version - 1)) snap('p-lt22', +f22.version - 1, addDays(hDate(f22, +f22.version - 1) || addDays(day, -200), 15), 'attiva');

  // ---------- proposta di formula a basso carbonio (Latte 18 Pellet) ----------
  const lowCarbonDesigns = [];
  const lt18 = prodOf('p-lt18'), fl = formOf(lt18);
  if (lt18 && fl) {
    const fr = lowCarbonFrontier(tmp, fl, { objective: 'co2', date: day });
    const pt = pointForCut(tmp, fl, fr, 0.09);
    const base = pcf(tmp, lt18.id, {});
    if (fr && pt && base) lowCarbonDesigns.push(designRecord(lt18, fr, pt, base, { id: 'lcd-p-lt18-1', at: addDays(day, -9),
      note: 'Proposta del responsabile qualità per il caseificio che chiede un mangime a impronta ridotta: −9% sulle materie prime rispetto alla riformulazione a costo minimo (dimostrativa)' }));
  }

  // ---------- dichiarazioni inviate (registro nelle impostazioni del pacchetto) ----------
  const P0 = addMonths(day.slice(0, 7), -12) + '-01', P1 = addDays(monthStart(day), -1);
  const tByCust = new Map();
  for (const s of d.shipments || []) if (s && s.date >= P0 && s.date <= P1) tByCust.set(s.customerId, (tByCust.get(s.customerId) || 0) + (+s.tonnes || 0));
  const dairy = (d.customers || []).filter(c => c && c.type === 'allevamento' && (c.species || []).includes('bovini-latte') && tByCust.get(c.id) > 0)
    .sort((a, b) => tByCust.get(b.id) - tByCust.get(a.id) || String(a.id).localeCompare(String(b.id))).slice(0, 3);
  const periodKey = `12m-${P1.slice(0, 7)}`;
  const sent = dairy.map((c, k) => ({ customerId: c.id, periodKey, at: addDays(day, -(4 + 3 * k)), lang: 'it', format: k === 2 ? 'csv' : 'pdf', by: 'Ufficio commerciale (demo)' }));

  const add = {};
  if (efIngredients.length) add.efIngredients = efIngredients;
  if (supplierPcfs.length) add.supplierPcfs = supplierPcfs;
  if (ingCircular.length) add.ingCircular = ingCircular;
  if (packagingSpecs.length) add.packagingSpecs = packagingSpecs;
  if (pcfSnapshots.length) add.pcfSnapshots = pcfSnapshots;
  if (lowCarbonDesigns.length) add.lowCarbonDesigns = lowCarbonDesigns;
  return { add, settings: { esg18: { pcf: { method: 'PEFCR Feed · stima interna', boundary: 'culla-cancello', elModel: 'rete-LB-meno-FV', mcN: 2000, seed: 18, includeOutbound: false, hepScenario: 'med', lossDefault: 0.5, sent } } } };
}
