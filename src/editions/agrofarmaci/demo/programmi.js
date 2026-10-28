/* DifesaOS · Estensore del demo: programmi di difesa consigliati per olivo, vite e melo, ciascuno con un'alternativa a minore
 * CO₂ e meno rame (ESG › CO₂ dei programmi di difesa). Rese, dosi, passaggi e consumi di gasolio sono dati dimostrativi
 * plausibili, da sostituire con i protocolli dei tecnici; gli assorbimenti del suolo sono intervalli indicativi. */

const P = code => 'p-' + code.toLowerCase();
const app = (code, dose, n, when) => ({ productId: P(code), dose, n, when });

export function demoProgrammi(d, { today } = {}) {
  if (!today || !(d.products || []).length || (d.cropProgrammes || []).length) return {};
  const has = new Set(d.products.map(p => p.id));
  const ok = prog => prog.applications.every(a => has.has(a.productId));
  const cropProgrammes = [
    { id: 'cp-olivo-rif', crop: 'olivo', name: 'Olivo · programma aziendale', baseline: true, region: 'Puglia (zona dimostrativa)', yieldTHa: 6, oilYieldPct: 15, passes: 7, fuelLPerPass: 6,
      applications: [app('CU30WG', 3, 3, 'Autunno e fine inverno: occhio di pavone e rogna'), app('DE25EC', 0.6, 2, 'Estate: mosca delle olive'), app('BS40', 3, 2, 'Pre-fioritura e allegagione')],
      soil: null, note: 'Trattamenti separati, terreno lavorato' },
    { id: 'cp-olivo-alt', crop: 'olivo', name: 'Olivo · rame a basso dosaggio e inerbimento', baseline: false, region: 'Puglia (zona dimostrativa)', yieldTHa: 6, oilYieldPct: 15, passes: 4, fuelLPerPass: 6,
      applications: [app('CU24SC', 2, 3, 'Autunno e fine inverno, in miscela con il biostimolante'), app('DE25EC', 0.6, 1, 'Solo al superamento della soglia nelle trappole'), app('BS40', 3, 2, 'In miscela con il rame')],
      soil: { lo: 0.4, hi: 1.2, practice: 'Inerbimento permanente e trinciatura delle potature' }, note: 'Miscele in un solo passaggio, monitoraggio della mosca con trappole' },
    { id: 'cp-vite-rif', crop: 'vite', name: 'Vite · programma aziendale', baseline: true, region: 'Veneto (zona dimostrativa)', yieldTHa: 14, passes: 14, fuelLPerPass: 5,
      applications: [app('CU30WG', 2, 5, 'Peronospora'), app('ZO80WG', 4, 6, 'Oidio'), app('TE100EC', 0.3, 2, 'Oidio, fasi critiche'), app('FO80WG', 2.5, 3, 'Peronospora, fioritura e allegagione'), app('BA25WG', 3, 1, 'Muffa grigia in pre-raccolta')],
      soil: null, note: 'Calendario fisso ogni 7–8 giorni' },
    { id: 'cp-vite-alt', crop: 'vite', name: 'Vite · difesa guidata dal modello e prodotti biologici', baseline: false, region: 'Veneto (zona dimostrativa)', yieldTHa: 14, passes: 10, fuelLPerPass: 5,
      applications: [app('CU24SC', 1.6, 5, 'Peronospora, interventi guidati dal modello previsionale'), app('ZO80WG', 4, 5, 'Oidio'), app('AR60SL', 1.2, 2, 'Oidio e cicaline'), app('FO80WG', 2.5, 2, 'Peronospora, fioritura'), app('BA25WG', 3, 2, 'Muffa grigia')],
      soil: { lo: 0.3, hi: 0.9, practice: 'Inerbimento a file alterne' }, note: 'Miscele zolfo e rame nello stesso passaggio' },
    { id: 'cp-melo-rif', crop: 'melo', name: 'Melo · programma aziendale', baseline: true, region: 'Trentino (zona dimostrativa)', yieldTHa: 55, passes: 12, fuelLPerPass: 6,
      applications: [app('CU20WG', 4, 2, 'Fine inverno: cancri rameali e ticchiolatura'), app('TE100EC', 0.6, 3, 'Ticchiolatura e oidio'), app('ZO80WG', 4, 4, 'Oidio'), app('AC20SL', 0.25, 2, 'Afidi e carpocapsa'), app('DE25EC', 0.6, 1, 'Cimici')],
      soil: null, note: '' },
    { id: 'cp-melo-alt', crop: 'melo', name: 'Melo · meno chimica di sintesi in pre-raccolta', baseline: false, region: 'Trentino (zona dimostrativa)', yieldTHa: 55, passes: 10, fuelLPerPass: 6,
      applications: [app('CU20WG', 3, 2, 'Fine inverno'), app('TE100EC', 0.6, 2, 'Ticchiolatura, fasi critiche'), app('ZO80WG', 4, 4, 'Oidio'), app('AC20SL', 0.25, 1, 'Afidi'), app('BA25WG', 2.5, 2, 'Marciumi in pre-raccolta'), app('AR60SL', 1.2, 1, 'Afidi')],
      soil: { lo: 0.3, hi: 0.8, practice: 'Inerbimento dell’interfila' }, note: 'Confusione sessuale contro la carpocapsa (non conteggiata fra i prodotti)' },
  ].filter(ok);
  return { add: { cropProgrammes } };
}
