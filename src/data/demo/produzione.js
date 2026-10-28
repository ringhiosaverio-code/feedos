/* FeedOS 17 · Estensore del demo: calendario, fermi, cespiti e interventi, inventari fisici (pacchetto WP6).
 * Contratto (extend.js): riceve l'archivio cumulativo in sola lettura e {today, R}; restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi nuovi}]}, settings?: {chiave: valore}} che aggiunge soltanto.
 * Le ore di marcia delle campagne non cambiano: i fermi riempiono il resto delle ore di turno di ogni settimana. */
import { addDays, mondayOf, sum, round, endOfMonth, monthOf, byId } from '../../core/util.js';
import { bookAt, usedBetween } from '../../engine/massbalance.js';

/** Festività nazionali italiane (con il lunedì dell'Angelo) degli anni indicati. */
function holidays(years) {
  const out = [];
  for (const y of years) {
    // Pasqua con l'algoritmo di Meeus; il lunedì dell'Angelo è il giorno dopo
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push(`${y}-01-01`, `${y}-01-06`, addDays(easter, 1), `${y}-04-25`, `${y}-05-01`, `${y}-06-02`, `${y}-08-15`, `${y}-11-01`, `${y}-12-08`, `${y}-12-25`, `${y}-12-26`);
  }
  return out.sort();
}

// [id, codice, nome, linea, tipo, vita in t, piano, costo di sostituzione, quota del piano già usata, note]
const ASSETS = [
  ['as-p1-traf', 'TR-P1', 'Trafila linea pellet 1', 'L1', 'trafila', 30000, { every: 30000, unit: 't' }, 9500, 0.55, 'Ø 6 mm, rapporto di compressione 1:10'],
  ['as-p1-rul', 'RU-P1', 'Rulli linea pellet 1', 'L1', 'rulli', 15000, { every: 15000, unit: 't' }, 3800, 0.62],
  ['as-p1-cond', 'CO-P1', 'Condizionatore linea pellet 1', 'L1', 'condizionatore', null, { every: 180, unit: 'giorni' }, 0, 0.5],
  ['as-p2-traf', 'TR-P2', 'Trafila linea pellet 2', 'L2', 'trafila', 24000, { every: 24000, unit: 't' }, 8200, 0.9, 'Ø 3–4 mm, matrice fine per suinetti e conigli'],
  ['as-p2-rul', 'RU-P2', 'Rulli linea pellet 2', 'L2', 'rulli', 12000, { every: 12000, unit: 't' }, 3400, 0.97],
  ['as-p2-cond', 'CO-P2', 'Condizionatore linea pellet 2', 'L2', 'condizionatore', null, { every: 180, unit: 'giorni' }, 0, 0.7],
  ['as-f1-mul', 'GR-F1', 'Griglie del mulino a martelli', 'L3', 'griglie mulino', 4000, { every: 4000, unit: 't' }, 1200, 0.92],
  ['as-f1-mix', 'MX-F1', 'Miscelatore orizzontale', 'L3', 'miscelatore', null, { every: 1500, unit: 'h' }, 0, 0.4],
  ['as-f1-ins', 'IN-F1', 'Insaccatrice a valvola', 'L3', 'insaccatrice', null, { every: 1200, unit: 'h' }, 0, 0.75],
  ['as-cald', 'CA-01', 'Caldaia a vapore', null, 'caldaia', null, { every: 365, unit: 'giorni' }, 0, 0.6, 'GPL, 1,5 t/h di vapore'],
];
// calo fra due conte fisiche, in quota dei prelievi: cereali e coprodotti polverosi perdono umidità e polvere
const SHRINK = { mais: 0.0035, sorgo: 0.003, farinaccio: 0.0025, soia44: 0.0012, colza: 0.0015, premix: 0 };

/* Configurazione dello stabilimento: componenti delle linee, cali delle materie prime, linea che si usura nelle ultime settimane,
 * componenti a sostituzione, intervento aperto. Il mangimificio usa i valori qui sotto; l'edizione agrofarmaci passa i suoi. */
export const FEED_PRODUZIONE = {
  assets: ASSETS, shrink: SHRINK, cleanKinds: ['pellet'], wearLine: 'L2', wearKinds: ['trafila', 'rulli'], swapKinds: ['trafila', 'rulli', 'griglie mulino'],
  fastSwapKind: 'griglie mulino', openWo: 'as-f1-mul', maintNote: 'Lubrificazione, ispezione di trafila e rulli',
};
export function demoProduzione(d, opts = {}) { return produzioneDemo(d, opts, FEED_PRODUZIONE); }
/** Estensore di produzione con la configurazione dello stabilimento (cfg, vedi FEED_PRODUZIONE). */
export function produzioneDemo(d, { today, R } = {}, cfg = FEED_PRODUZIONE) {
  if (!today || !R || !(d.runs || []).length) return {};
  const lines = d.lines || [], prod = byId(d.products || []);
  const years = [...new Set(d.runs.map(r => +r.date.slice(0, 4)))];
  years.push(Math.max(...years) + 1);
  const hol = new Set(holidays(years));
  const settings = { calendar: { holidays: [...hol], extraHours: {} } };

  // ---------- cespiti: ultimo intervento tale che il contatore sia alla quota voluta del piano ----------
  const assets = cfg.assets.map(([id, code, name, lineId, kind, lifeT, plan, replaceCost, frac, spec]) => {
    let last;
    if (plan.unit === 'giorni') last = addDays(today, -Math.round(plan.every * frac));
    else {
      const target = plan.every * frac;
      const rs = d.runs.filter(r => (!lineId || r.lineId === lineId) && r.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
      let acc = 0;
      last = rs.length ? addDays(rs[rs.length - 1].date, -1) : addDays(today, -365);
      for (const r of rs) { acc += plan.unit === 'h' ? +r.hours || 0 : r.tonnes; if (acc >= target) { last = addDays(r.date, -1); break; } }
    }
    return { id, code, name, lineId, kind, lifeT, plan, lastServiceAt: last, replaceCost, spec: spec || '' };
  });
  const lineAssets = Object.fromEntries(lines.map(l => [l.id, assets.filter(a => a.lineId === l.id)]));

  // ---------- fermi: per linea e settimana riempiono le ore di turno non coperte dalla marcia ----------
  const stops = [], tasks = [];
  let ns = 0, nw = 0;
  const weeks = [...new Set(d.runs.map(r => mondayOf(r.date)))].sort().filter(w => w <= today);
  const wearFrom = weeks[Math.max(0, weeks.length - 5)]; // nelle ultime 5 settimane la trafila della pellet 2 si consuma (come la deriva energetica del demo)
  const stop = (lineId, date, reason, minutes, extra = {}) => {
    const m = Math.round(minutes);
    if (m > 0) stops.push({ id: `st-${++ns}`, date, lineId, reason, minutes: m, shift: R.pick(['1°', '2°']), assetId: null, note: '', source: 'demo', ...extra });
    return m;
  };
  lines.forEach((l, li) => {
    const pellet = cfg.cleanKinds.includes(l.kind);
    let wi = 0;
    for (const w of weeks) {
      wi++;
      // giorni lavorativi della settimana fino a oggi, senza festivi: la settimana in corso conta solo i giorni trascorsi
      const work = [0, 1, 2, 3, 4].map(i => addDays(w, i)).filter(x => x <= today && !hol.has(x));
      if (!work.length) continue;
      const pickDay = () => R.pick(work);
      const rs = d.runs.filter(r => r.lineId === l.id && mondayOf(r.date) === w).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const runH = sum(rs, r => +r.hours || 0);
      const cal = l.hoursWeek * work.length / 5;
      let unpl = 0;
      // cambi prodotto
      for (let i = 1; i < rs.length; i++) if (rs[i].productId !== rs[i - 1].productId) unpl += stop(l.id, rs[i].date, 'cambio', pellet ? Math.max(8, R.normal(20, 5)) : 10, { note: `${prod[rs[i - 1].productId]?.code || ''} → ${prod[rs[i].productId]?.code || ''}` });
      // micro-fermi e pulizia
      if (runH > 0) unpl += stop(l.id, pickDay(), 'micro', runH * 60 * R.range(0.02, 0.04), { note: 'Somma dei micro-fermi del turno' });
      if (pellet && rs.length) unpl += stop(l.id, pickDay(), 'pulizia', R.range(15, 35));
      // guasti: più frequenti sulla pellet 2 nelle ultime settimane, su trafila e rulli
      const late = l.id === cfg.wearLine && w >= wearFrom;
      const nBreak = R.chance(late ? 0.85 : 0.35) ? (late && R.chance(0.4) ? 2 : 1) : 0;
      for (let k = 0; k < nBreak; k++) {
        const pool = (lineAssets[l.id] || []).filter(a => !late || cfg.wearKinds.includes(a.kind));
        const a = pool.length ? R.pick(pool) : null;
        const date = pickDay(), min = R.int(30, late ? 200 : 240);
        unpl += stop(l.id, date, 'guasto', min, { assetId: a?.id || null, note: a ? `${a.name}: ${R.pick(['vibrazioni anomale', 'intasamento', 'cuscinetto', 'sensore di temperatura', 'usura'])}` : '' });
        if (min >= 60) tasks.push({ id: `wo-${++nw}`, createdAt: date, title: `Riparazione: ${a?.name || l.name}`, area: 'produzione', owner: 'Manutenzione', due: date, status: 'fatto', priority: 'alta', source: 'manutenzione', detail: 'Intervento correttivo (dato dimostrativo)', assetId: a?.id || null, kind: 'correttiva', cost: round(150 + min * 6 + R.range(0, 800), 0), downMin: min, doneAt: date, link: { area: 'produzione', tab: 'manutenzione', id: a?.id } });
      }
      // ogni 4 settimane (sfalsate fra le linee) 4 ore di manutenzione programmata, con il suo ordine di lavoro
      let plan = 0;
      if ((wi + li) % 4 === 0) {
        const date = work[work.length - 1];
        plan = stop(l.id, date, 'manutenzione', 240, { note: cfg.maintNote }) / 60;
        tasks.push({ id: `wo-${++nw}`, createdAt: date, title: `Manutenzione programmata: ${l.name}`, area: 'produzione', owner: 'Manutenzione', due: date, status: 'fatto', priority: 'media', source: 'manutenzione', detail: cfg.maintNote + ' (dato dimostrativo)', assetId: null, lineId: l.id, kind: 'preventiva', cost: round(R.range(280, 650), 0), downMin: 240, doneAt: date, link: { area: 'produzione', tab: 'manutenzione' } });
      }
      // ore oltre il turno: straordinario nel calendario della linea
      const need = runH + unpl / 60 + plan;
      if (need > cal) (settings.calendar.extraHours[l.id] ||= {})[w] = round(need - cal + 0.25, 2);
      // il resto è mancanza di ordini (programmata), lasciando una piccola quota non registrata
      const rest = Math.max(0, cal - need);
      if (rest > 0.5) stop(l.id, pickDay(), 'ordini', rest * 60 * R.range(0.9, 0.98), { note: 'Turno non saturo' });
    }
  });

  // ---------- interventi che hanno azzerato i contatori ----------
  for (const a of assets) {
    const swap = cfg.swapKinds.includes(a.kind);
    tasks.push({ id: `wo-${++nw}`, createdAt: a.lastServiceAt, title: `${swap ? 'Sostituzione' : 'Manutenzione preventiva'}: ${a.name}`, area: 'produzione', owner: 'Manutenzione', due: a.lastServiceAt, status: 'fatto', priority: 'media', source: 'manutenzione',
      detail: swap ? 'Sostituzione programmata (dato dimostrativo)' : 'Revisione del piano (dato dimostrativo)', assetId: a.id, kind: 'preventiva',
      cost: swap ? a.replaceCost : round(R.range(350, 950), 0), downMin: a.kind === cfg.fastSwapKind ? 90 : swap ? 360 : 180, doneAt: a.lastServiceAt, link: { area: 'produzione', tab: 'manutenzione', id: a.id } });
  }

  // un ordine di lavoro aperto: le griglie del mulino quasi a fine piano
  const grid = assets.find(a => a.id === cfg.openWo);
  if (grid) tasks.push({ id: `wo-${++nw}`, createdAt: addDays(today, -2), title: `Sostituzione: ${grid.name}`, area: 'produzione', owner: 'Manutenzione', due: addDays(today, 6), status: 'aperto', priority: 'media', source: 'manutenzione', detail: `${grid.name} · linea ${grid.lineId}`, assetId: grid.id, kind: 'preventiva', cost: grid.replaceCost, downMin: 90, link: { area: 'produzione', tab: 'manutenzione', id: grid.id } });

  // ---------- conte fisiche di fine mese delle materie prime principali ----------
  // nessuna è stata registrata: il calo si accumula nel libro e l'ultima conta lo contiene tutto
  const counts = [];
  const dates = [];
  for (let k = 0, x = endOfMonth(addDays(monthOf(today) + '-01', -1)); k < 6; k++, x = endOfMonth(addDays(x.slice(0, 7) + '-01', -1))) dates.unshift(x);
  let nc = 0;
  for (const id of Object.keys(cfg.shrink).filter(x => (d.ingredients || []).some(i => i.id === x))) {
    let gap = 0, prev = addDays(dates[0].slice(0, 7) + '-01', -1);
    for (const date of dates) {
      const book = bookAt(d, id, date);
      gap -= cfg.shrink[id] * usedBetween(d, id, prev, date) * Math.max(0, 1 + R.normal(0, 0.2));
      prev = date;
      if (!(book > 0.5)) continue;
      const measured = Math.max(0, book + gap + R.normal(0, book * 0.0015));
      counts.push({ id: `cnt-${++nc}`, date, ingId: id, measuredT: round(measured, 1), bookT: round(book, 2), applied: false, note: date === dates[dates.length - 1] ? 'Conta di fine mese da registrare' : 'Conta mensile (dato dimostrativo)', by: 'Magazzino' });
    }
  }

  // ---------- percorsi dei prodotti: le campagne del demo marciano fra l'82 e il 95% della targa ----------
  const routes = (d.products || []).map(p => { const l = lines.find(x => x.id === p.lineId); return l ? { id: p.id, routes: [{ lineId: l.id, idealTph: l.capacityTph }] } : null; }).filter(Boolean);

  return { add: { stops, assets, tasks, stockCounts: counts }, update: { products: routes }, settings };
}
