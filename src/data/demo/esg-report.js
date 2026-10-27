/* FeedOS 18 · Dati dimostrativi · Report e questionari (pacchetto WP4 «report»), seme 1201.
 * Contratto: demoReport(d, { today, R }) → { add, settings }: solo aggiunte, idempotente (se i dati del report ci sono già
 * restituisce {}), deterministico (date relative a today, nessun orologio); impostazioni solo in settings.esg18.report.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde, coerenti con il resto del demo:
 * - esercizio «12 mesi a …» corrente in revisione: istantanea preparata dalla qualità, revisione e approvazione da fare;
 * - storico dichiarato dei due esercizi precedenti alla stessa scala dei valori correnti (id «storico-…» con periodKey e date:
 *   il demo resta con un solo esercizio selezionabile, come chiede la prova della fondazione);
 * - tre questionari: banca (struttura PMI-Banche da trascrivere), «Caseificio Sila (demo)» con 25 voci di cui 4 oltre il VS,
 *   autovalutazione per temi di una piattaforma di rating bancario;
 * - analisi di materialità con la libreria del settore (35 voci, 11 materiali). */
import { currentPeriod, previousPeriod } from '../../engine/esg-years.js';
import { addDays, monthsIn, round } from '../../core/util.js';
import { frozenFor } from '../../engine/pnl.js';
import { computeKpis } from '../../engine/esg.js';
import { closeOpsSync, vsmeReport } from '../../engine/esg-report.js';
import { templateItems, seedMateriality } from '../../engine/esg-report-q.js';

const SETTINGS = { option: 'basic+comprehensive', basis: 'individuale', legalForm: 'Società per azioni (S.p.A.)', country: 'Italia', nace: '10.91', countries: 1,
  pollutantsReporting: true, waterSignificant: true, waterStress: false, lang: 'it', threshold: 3 };

const Q_CASEIFICIO = [
  ['1', 'Ragione sociale e forma giuridica', ['B1.legal-form']], ['2', 'Codice ATECO / NACE dell’attività principale', ['B1.nace']], ['3', 'Fatturato dell’ultimo esercizio (€)', ['B1.turnover']],
  ['4', 'Numero di dipendenti', ['B1.employees']], ['5', 'Certificazioni possedute (ISO, GMP+, altre)', ['B1.certifications']], ['6', 'Consumo totale di energia (MWh)', ['B3.mwh']],
  ['7', 'Energia elettrica da fonti rinnovabili (MWh)', ['B3.mwh-ren-el']], ['8', 'Emissioni Scope 1 (t CO2e)', ['B3.s1']], ['9', 'Emissioni Scope 2 location-based (t CO2e)', ['B3.s2-lb']],
  ['10', 'Emissioni Scope 2 market-based (t CO2e)', ['B3.s2-mb']], ['11', 'Emissioni Scope 3 (t CO2e), se calcolate', ['B3.s3']],
  ['12', 'Obiettivi di riduzione delle emissioni: anno base, anno obiettivo e riduzione prevista', ['C3.targets']], ['13', 'Prelievo idrico totale (m3)', ['B6.withdrawal']],
  ['14', 'Rifiuti prodotti (pericolosi e non pericolosi) e quantità avviata a recupero', ['B7.waste-haz', 'B7.waste-nonhaz', 'B7.diverted']],
  ['15', 'Tasso di infortuni e infortuni mortali', ['B9.recordable-rate', 'B9.fatalities']], ['16', 'Ore medie di formazione per dipendente', ['B10.training-h']],
  ['17', 'Percentuale di dipendenti coperti da contratto collettivo', ['B10.ccnl']], ['18', 'Codice di condotta e politica sui diritti umani', ['C6.code', 'C6.coverage']],
  ['19', 'Meccanismo di segnalazione per i lavoratori', ['C6.grievance']], ['20', 'Condanne o sanzioni per corruzione negli ultimi tre anni', ['B11.convictions', 'B11.fines']],
  ['21', 'Siti in o vicino ad aree protette', ['B5.sites-sensitive']],
  ['22', 'Impronta carbonica per prodotto (kg CO2e/kg) secondo PEFCR Feed, con banca dati e versione', [], 'Su richiesta forniamo la scheda di impronta dei prodotti consegnati: stima interna secondo la metodologia PEFCR Feed, con banca dati e versione indicate nella scheda.'],
  ['23', 'Quota di soia certificata senza deforestazione e schema di certificazione', []],
  ['24', 'Riferimenti delle dichiarazioni di dovuta diligenza EUDR per la soia dei mangimi consegnati', []],
  ['25', 'Piano di controllo delle micotossine (aflatossina B1) nei mangimi per vacche da latte', [], 'Analisi dell’aflatossina B1 su ogni lotto di mais in ingresso e piano di campionamento dei mangimi per vacche da latte secondo il manuale HACCP.'],
];

/** Valore corrente di una misura: datapoint del rapporto (pacchetti) oppure il calcolo di base dei registri. */
function currentValues(d2, P) {
  const rep = vsmeReport(d2, P, { live: true });
  const v = id => (rep.byId[id]?.hasValue && typeof rep.byId[id].value === 'number' ? rep.byId[id].value : null);
  let k = null;
  try { k = computeKpis(d2, P); } catch { k = null; }
  const sv = d2.survey || {};
  const head = Object.values(sv['pe-cat'] || {}).reduce((s, x) => s + (+x || 0), 0) || null;
  const wasteT = k?.waste?.n ? k.waste.kg / 1000 : null;
  return {
    s1: v('B3.s1') ?? k?.ghg?.scope1 ?? null, s2lb: v('B3.s2-lb') ?? k?.ghg?.scope2 ?? null, mwh: v('B3.mwh') ?? (k?.energy?.kwhTotal ? k.energy.kwhTotal / 1000 : null),
    mwhRen: v('B3.mwh-ren-el') ?? (k?.energy?.kwhSelf ? k.energy.kwhSelf / 1000 : null), waterM3: v('B6.withdrawal') ?? (k?.water?.nMonths ? k.water.m3 : null),
    wasteT: (v('B7.waste-haz') != null && v('B7.waste-nonhaz') != null ? v('B7.waste-haz') + v('B7.waste-nonhaz') : null) ?? wasteT,
    wasteHazT: v('B7.waste-haz') ?? (k?.waste?.n ? k.waste.hazKg / 1000 : null), recoveryPct: k?.waste?.recovery != null ? k.waste.recovery * 100 : null,
    headcount: v('B1.employees') ?? head, hours: v('B9.hours') ?? (+sv['hs-hours'] || null), tonnes: k?.tonnes || null,
  };
}
const scale = (x, f, dec = 0) => (x == null ? undefined : round(x * f, dec));

export function demoReport(d, { today } = {}) {
  if (!d || !today) return {};
  for (const c of ['esgAnswers', 'esgClosings', 'esgHistory', 'questionnaires', 'materiality']) if (Array.isArray(d[c]) && d[c].length) return {};
  const P = currentPeriod({ ...d, settings: { ...d.settings, demoAnchor: today, dataset: 'demo' } });
  const p1 = previousPeriod(d, P.key), p2 = previousPeriod(d, p1.key);
  const sv = d.survey || {};
  const at = addDays(today, -6);
  const ans = (dpId, value, extra = {}) => ({ id: `${P.key}:${dpId}`, periodKey: P.key, dpId, value, unit: null, quality: 'dichiarato', note: '', evidenceIds: [], override: false, omission: null, omissionNote: '', status: 'rivisto', by: 'qualita', at, ...extra });
  const esgAnswers = [
    ans('B1.balance-sheet', 11840000, { unit: '€', method: 'Totale attivo dello stato patrimoniale del bilancio 2025 approvato (dato dimostrativo).' }),
    ans('C1.strategy', `Ridurre l’impronta per tonnellata di prodotto e documentarla ai clienti con dati chiusi ogni anno. ${sv['em-target-desc'] || ''} Più coprodotti locali nelle formule, soia certificata e un piano di efficienza su vapore e aria compressa (dato dimostrativo).`.replace(/\s+/g, ' ').trim()),
    ans('B7.circular', `${sv['wt-reduce-desc'] || 'Recupero delle spazzature di linea.'} Coprodotti agroindustriali nelle formule (crusca, polpe, farine di estrazione) e pallet a rendere con i fornitori principali (dato dimostrativo).`.replace(/\s+/g, ' ').trim()),
  ];
  const settings = { ...SETTINGS };
  const d2 = { ...d, esgAnswers, settings: { ...d.settings, esg18: { ...(d.settings?.esg18 || {}), report: settings } } };
  // storico dichiarato dei due esercizi precedenti, alla scala dei valori correnti
  const cur = currentValues(d2, P);
  let fin = null;
  try { fin = frozenFor(d, monthsIn(p1)); } catch { fin = null; }
  const ratio = cur.tonnes && fin?.tonnes ? Math.min(1.06, Math.max(1, cur.tonnes / (frozenFor(d, monthsIn(P))?.tonnes || cur.tonnes))) : 1.03;
  const t1 = fin?.tonnes ? round(fin.tonnes * ratio, 0) : scale(cur.tonnes, 1.012), r1 = fin?.revenueNet ? round(fin.revenueNet, 0) : undefined;
  const hist = (X, f, extra) => ({ id: `storico-${X.key}`, periodKey: X.key, from: X.from, to: X.to, label: X.label, source: 'storico dichiarato',
    s1: scale(cur.s1, f.s1, 1), s2lb: scale(cur.s2lb, f.s2, 1), mwh: scale(cur.mwh, f.mwh, 0), mwhRen: scale(cur.mwhRen, f.ren, 0), waterM3: scale(cur.waterM3, f.water, 0),
    wasteT: scale(cur.wasteT, f.waste, 2), wasteHazT: scale(cur.wasteHazT, f.haz, 3), recoveryPct: cur.recoveryPct == null ? undefined : round(cur.recoveryPct - f.rec, 1), ...extra });
  const esgHistory = [
    hist(p1, { s1: 1.04, s2: 1.13, mwh: 1.02, ren: 0.86, water: 1.05, waste: 1.08, haz: 1.1, rec: 4 }, { tonnes: t1, revenueNet: r1, headcount: cur.headcount ? cur.headcount - 1 : undefined, hours: cur.hours ? round(cur.hours * 0.97, -2) : undefined, recordable: 2, fatalities: 0,
      note: 'Valori dichiarati dal rendiconto interno 2024/25 (dati dimostrativi); produzione e ricavi coerenti con le chiusure mensili del gestionale.' }),
    hist(p2, { s1: 1.09, s2: 1.27, mwh: 1.04, ren: 0.71, water: 1.11, waste: 1.15, haz: 1.2, rec: 9 }, { tonnes: t1 ? round(t1 * 0.975, 0) : undefined, revenueNet: r1 ? round(r1 * 0.95, -3) : undefined,
      headcount: cur.headcount ? cur.headcount - 2 : undefined, hours: cur.hours ? round(cur.hours * 0.94, -2) : undefined, recordable: 3, fatalities: 0, note: 'Valori dichiarati dal rendiconto interno 2023/24 (dati dimostrativi).' }),
  ].map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)));
  // questionari
  const q = (id, kind, title, requester, rec, due, items, extra = {}) => ({ id, kind, title, requester, customerId: null, receivedAt: addDays(today, rec), dueAt: addDays(today, due), periodKey: P.key,
    status: 'in compilazione', note: '', items: items.map(it => ({ override: null, evidenceIds: [], ...it })), ...extra });
  const questionnaires = [
    q('q-banca-alfa', 'pmi-banche', 'Questionario ESG per il rinnovo del fido (Documento PMI-Banche)', 'Banca Alfa (fantasia)', -9, 5, templateItems(d2, 'pmi-banche'), { note: 'La banca usa la struttura del Documento PMI-Banche: voci da trascrivere dalla tavola pubblica.' }),
    q('q-caseificio-sila', 'cliente', 'Questionario di sostenibilità dei fornitori 2026', 'Caseificio Sila (demo)', -14, 12, Q_CASEIFICIO.map(([qid, text, dpIds, override]) => ({ qid, text, section: '', unit: '', dpIds, beyondVs: !dpIds.length, override: override || null }))),
    q('q-rating-banca-beta', 'synesgy', 'Autovalutazione ESG su piattaforma di rating (per temi)', 'Banca Beta (fantasia)', -3, 26, templateItems(d2, 'synesgy')),
  ];
  const materiality = seedMateriality(d2, P.key, null, settings.threshold).map(r => ({ ...r, assessedAt: at, by: 'direzione' }));
  // istantanea dell'esercizio in revisione, sui dati completi del report
  const d3 = { ...d2, esgHistory, questionnaires, materiality };
  const cl = closeOpsSync(d3, P, { role: 'qualita', name: 'Responsabile qualità (demo)' }, { at });
  const esgClosings = cl.ok ? [cl.record] : [];
  return { add: { esgAnswers, esgHistory, questionnaires, materiality, esgClosings }, settings: { esg18: { report: settings } } };
}
