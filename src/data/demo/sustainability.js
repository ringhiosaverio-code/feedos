/* FeedOS 16 · Mangimificio dimostrativo: letture dell'acqua, registro dei rifiuti e risposte al questionario ESG.
 * Dati SINTETICI e deterministici, derivati dalla produzione del mangimificio di fantasia (nessun dato reale).
 * Racconto per la demo: negli ultimi tre mesi l'acquedotto preleva di più a parità di produzione (perdita sulla rete
 * dei servizi) e una parte degli imballaggi misti va ancora a smaltimento. */
import { rng, monthOf, round, sum } from '../../core/util.js';
import { EER_BY_CODE, isHazardous } from '../eer.js';

export function demoSustainability({ today, runs, seed = 17 }) {
  const R = rng(seed);
  const thisMonth = monthOf(today);
  const months = [...new Set(runs.map(r => monthOf(r.date)))].sort().filter(m => m < thisMonth).slice(-12);
  const pelletT = {}, allT = {};
  for (const r of runs) { const m = monthOf(r.date); allT[m] = (allT[m] || 0) + r.tonnes; if (r.lineId !== 'L3') pelletT[m] = (pelletT[m] || 0) + r.tonnes; }

  // ---------- acqua: pozzo per caldaia e condizionamento a vapore, acquedotto per servizi e lavaggi ----------
  const water = [];
  let readA = 18420, readP = 52310;
  months.forEach((m, k) => {
    const leak = k >= months.length - 3 ? 1.48 : 1;                        // perdita sulla rete dei servizi
    const process = round((pelletT[m] || 0) * 0.046 * R.range(0.95, 1.05), 0); // ≈ 46 litri per tonnellata pellettata
    const services = round(52 * R.range(0.9, 1.1) * leak, 0);
    readP += process; readA += services;
    water.push({ id: 'wa-' + m + '-p', month: m, source: 'Pozzo', m3: process, reading: readP, note: 'Caldaia e vapore di condizionamento (dati dimostrativi)' });
    water.push({ id: 'wa-' + m + '-a', month: m, source: 'Acquedotto', m3: services, reading: readA, note: leak > 1 ? 'Consumo dei servizi in aumento' : 'Servizi, uffici e lavaggi (dati dimostrativi)' });
  });

  // ---------- rifiuti: formulari del registro di carico e scarico ----------
  const waste = [];
  let fir = 41200;
  const put = (date, code, kg, dest, note = '') => {
    const e = EER_BY_CODE[code];
    waste.push({ id: 'rf-' + (waste.length + 1), date, eer: code, name: e?.name || code, kg: round(kg, 0), hazardous: isHazardous(code), dest, op: dest === 'recupero' ? 'R13' : 'D15', fir: 'FIR ' + (++fir), note });
  };
  months.forEach((m, k) => {
    const day = n => `${m}-${String(n).padStart(2, '0')}`;
    const t = (allT[m] || 3500) / 3500;
    put(day(R.int(8, 12)), '15 01 01', R.range(380, 520) * t, 'recupero');
    put(day(R.int(8, 12)), '15 01 02', R.range(210, 300) * t, 'recupero');
    put(day(R.int(20, 26)), '15 01 06', R.range(150, 220) * t, 'smaltimento', 'Imballaggi misti non separati');
    put(day(R.int(20, 26)), '20 03 01', R.range(90, 130), 'smaltimento');
    if (k % 2 === 0) put(day(R.int(14, 18)), '15 01 03', R.range(450, 700), 'recupero', 'Pallet rotti');
    if (k % 3 === 1) {
      put(day(R.int(3, 7)), '02 03 04', R.range(600, 900), 'recupero', 'Spazzature di linea a impianto di biogas');
      put(day(R.int(3, 7)), '15 01 10*', R.range(25, 45), 'smaltimento', 'Confezioni di additivi e detergenti');
      put(day(R.int(3, 7)), '15 02 02*', R.range(15, 30), 'smaltimento');
    }
    if (k % 6 === 4) {
      put(day(R.int(15, 25)), '13 02 05*', R.range(140, 200), 'recupero', 'Oli esausti di riduttori e presse');
      put(day(R.int(15, 25)), '15 02 03', R.range(60, 90), 'smaltimento', 'Maniche dei filtri sostituite');
    }
  });
  if (months.length > 6) {
    put(months[5] + '-19', '17 04 05', 1240, 'recupero', 'Matrici e rulli usurati');
    put(months[8] + '-07', '16 06 01*', 320, 'recupero', 'Batterie dei carrelli elevatori');
    put(months[9] + '-14', '20 01 21*', 12, 'recupero');
  }
  waste.sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---------- questionario ESG compilato dal mangimificio di fantasia (alcune risposte lasciate aperte) ----------
  const survey = {
    'gen-feed': ['Bovini', 'Suini', 'Avicoli', 'Ovicaprini', 'Equini', 'Conigli'],
    'mp-cert': '25-50%', 'mp-schemes': ['GMP+', 'RTRS'],
    'en-diesel': 4200, 'en-ren': ['Fotovoltaico'],
    'em-measure': 'si', 'em-target': 'si', 'em-target-desc': 'Portare il fotovoltaico al 55% dell’elettricità e ridurre del 15% la CO₂ per tonnellata entro il 2028.', 'em-target-pct': 15, 'em-target-year': 2028,
    'wa-src': ['Acquedotto', 'Pozzo'], 'wa-disch': 'si',
    'wt-reduce': 'si', 'wt-reduce-desc': 'Spazzature di linea rilavorate quando ammesso; quelle non rilavorabili vanno a biogas.',
    'pe-cat': { Dirigenti: 2, Quadri: 4, Impiegati: 9, Operai: 16 }, 'pe-women': 22, 'pe-women-mgmt': 25, 'pe-turnover': 6.4, 'pe-gap': 6.5,
    'hs-inj': 1, 'hs-days': 12, 'hs-hours': 52000, 'hs-iso': 'no',
    'tr-hours': 18, 'tr-topics': ['Sicurezza', 'Qualità', 'Ambiente'], 'tr-ethics': 60,
    'te-init': 'si', 'te-desc': 'Stage con l’istituto agrario della zona e giornate tecniche per gli allevatori.',
    'gv-board': 'si', 'gv-board-n': 3, 'gv-board-w': 1, 'gv-esg-lead': 'no',
    'et-code': 'si', 'et-231': 'si', 'et-anticorr': 'si', 'et-cases': 0, 'et-whistle': 0, 'et-certs': ['ISO 9001', 'GMP+', 'Biologico'],
    'rk-climate': 'si', 'rk-mitig': 'no',
    'bd-protected': 'no', 'bd-assess': 'no', 'bd-impacts': 'no', 'bd-commod': ['Soia', 'Mais'], 'bd-trace': 'Parziale', 'bd-traced-pct': 40, 'bd-policy': 'no', 'bd-programs': ['Riduzione impatti agricoli'], 'bd-target': 'no',
    'sc-n': 11, 'sc-top80': 5, 'sc-qual': 'no', 'sc-aspects': ['Sicurezza', 'Benessere animale'], 'sc-eval': 25, 'sc-spend': 40, 'sc-audits': 6, 'sc-nc': 1,
    'sc-coc': 'no', 'sc-clauses': 'no', 'sc-risk': ['Lavoro minorile', 'Corruzione'], 'sc-critical': 'si', 'sc-certreq': ['GMP+'], 'sc-certpct': 60,
    'doc-list': ['Visura camerale', 'Organigramma', 'Bilanci degli ultimi 3 anni', 'Certificazioni', 'Registro consumi energetici', 'Registro rifiuti', 'Codice Etico', 'Modello 231'],
  };
  return { water, waste, survey, check: { m3: sum(water, w => w.m3), kg: sum(waste, w => w.kg) } };
}
