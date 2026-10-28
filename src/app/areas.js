/* FeedOS 17 · Aree dell'applicazione: icona, nome, descrizione, periodo globale e schede.
 * Fonte unica: nav.js (NAV), roles.js (AREA_META) e il router (AREAS, da areaIds.js) derivano da qui.
 * period: true mostra la barra del periodo nella testata. La scheda «tesi» esiste solo nella versione completa. */
import { LuHouse, LuLandmark, LuWallet, LuFactory, LuFlaskConical, LuShoppingCart, LuCog, LuShieldCheck, LuHandshake, LuEuro, LuLeaf, LuDatabase, LuScale } from 'react-icons/lu';
import { AREA_IDS } from '../core/areaIds.js';
import { META } from '../editions/meta.js';

const FULL = typeof __FULL__ !== 'undefined' && !!__FULL__;
const T = (id, label) => ({ id, label });

const DEFS = {
  oggi: { icon: LuHouse, label: 'Oggi', period: true, lead: 'Quello che richiede una decisione, spiegato con i numeri, e il cruscotto degli indicatori con i loro obiettivi.',
    tabs: [T('decisioni', 'Decisioni'), T('cruscotto', 'Cruscotto'), T('attivita', 'Attività'), T('registro', 'Ultime modifiche')] },
  direzione: { icon: LuLandmark, label: 'Direzione', period: true, lead: 'Conto economico gestionale al costo effettivo, scostamenti, budget e stima di chiusura, chiusura del mese e report per il consiglio.',
    tabs: [T('sintesi', 'Sintesi'), T('conto', 'Conto economico'), T('ponte', 'Scostamenti'), T('budget', 'Budget'), T('costi', 'Costi fissi'), T('chiusura', 'Chiusura del mese'), T('report', 'Report CdA')] },
  finanza: { icon: LuWallet, label: 'Finanza', period: true, lead: 'Crediti e fidi dei clienti, cassa delle prossime 13 settimane, capitale circolante e rimanenze valorizzate.',
    tabs: [T('crediti', 'Crediti e fidi'), T('cassa', 'Cassa 13 settimane'), T('circolante', 'Capitale circolante'), T('rimanenze', 'Rimanenze'), T('parametri', 'Parametri')] },
  gemello: { icon: LuFactory, label: 'Gemello digitale', period: true, lead: 'Lo stabilimento in un solo disegno: flussi di materia, energia, costo e CO₂ dell’ultimo mese.', tabs: [] },
  formulazione: { icon: LuFlaskConical, label: 'Formulazione', period: false, lead: 'Formule a costo minimo con prezzi ombra, controllo contaminanti, CO₂ e cartellino.',
    tabs: [T('formule', 'Formule'), T('materie', 'Materie prime'), T('specifiche', 'Specifiche')] },
  acquisti: { icon: LuShoppingCart, label: 'Acquisti e mercati', period: true, lead: 'Dal piano di produzione ai fabbisogni di materie prime, con magazzino, ordini, fornitori, varianze e quotazioni.',
    tabs: [T('fabbisogni', 'Fabbisogni'), T('scorte', 'Magazzino'), T('ordini', 'Ordini'), T('fornitori', 'Fornitori'), T('varianze', 'Varianze'), T('mercati', 'Mercati')] },
  produzione: { icon: LuCog, label: 'Produzione', period: true, lead: 'Piano delle linee, registrazioni, OEE e fermi, energia per tonnellata, manutenzione e bilancio di massa.',
    tabs: [T('piano', 'Piano'), T('registro', 'Registro'), T('oee', 'OEE e fermi'), T('energia', 'Energia e linee'), T('manutenzione', 'Manutenzione'), T('bilancio', 'Bilancio di massa')] },
  qualita: { icon: LuShieldCheck, label: 'Qualità e tracciabilità', period: true, lead: 'Lotti, analisi, contaminanti, reclami e richiamo con bilancio di massa.',
    tabs: [T('lotti', 'Lotti prodotto'), T('lotti-mp', 'Lotti materie prime'), T('analisi', 'Carte di controllo'), T('reclami', 'Reclami'), T('richiamo', 'Richiamo')] },
  commerciale: { icon: LuHandshake, label: 'Commerciale', period: true, lead: 'Clienti, offerte con margine in tempo reale, listino, visite, agenti e provvigioni.',
    tabs: [T('clienti', 'Clienti'), T('offerte', 'Offerte'), T('listino', 'Listino'), T('visite', 'Visite'), T('rete', 'Agenti e provvigioni')] },
  economia: { icon: LuEuro, label: 'Economia', period: true, lead: 'Margini al costo effettivo, redditività per cliente, prodotto e agente, punto di pareggio, previsioni verificate e simulatore «E se…».',
    tabs: [T('margini', 'Margini'), T('redditivita', 'Redditività'), T('pareggio', 'Pareggio'), T('scenari', 'E se…'), T('previsioni', 'Previsioni')] },
  // ESG (fondazione 18): schede nell'ordine del percorso dell'utente; i pacchetti disegnano le loro (modules/esg-pages.jsx)
  esg: { icon: LuLeaf, label: 'ESG', period: false,
    lead: FULL ? 'Clima, impronta dei mangimi, filiera, registri ambientali, persone, governance, obiettivi, rischi e report VSME: i 49 indicatori della tesi alimentati dai dati di ogni giorno.'
      : 'Clima, impronta dei mangimi, filiera, registri ambientali, persone, governance, obiettivi, rischi e report VSME: 49 indicatori alimentati dai dati di ogni giorno.',
    tabs: [T('cruscotto', 'Cruscotto'), T('clima', 'Clima e GHG'), T('energia', 'Energia e CO₂'), T('passaporto', 'Impronta mangimi'), T('filiera', 'EUDR e fornitori'),
      T('ambiente', 'Registri ambientali'), T('acqua', 'Acqua'), T('rifiuti', 'Rifiuti'), T('persone', 'Persone e sicurezza'), T('governance', 'Governance ed evidenze'),
      T('piano', 'Obiettivi e piano'), T('rischi', 'Rischi climatici'), T('vsme', 'Report e questionari'), T('indicatori', 'Indicatori'), T('questionario', 'Questionario'),
      ...(FULL ? [T('tesi', 'Dalla tesi all’azienda')] : [])] },
  // edizione agrofarmaci (DifesaOS): registrazioni, sostanze attive, schede di sicurezza, Seveso e ADR
  regolatorio: { icon: LuScale, label: 'Regolatorio', period: false, lead: 'Registrazioni dei prodotti con usi in etichetta e finestre di vendita e uso, sostanze attive e rinnovi, schede di sicurezza e invii ai clienti, Seveso e trasporto ADR.',
    tabs: [T('registrazioni', 'Registrazioni'), T('sostanze', 'Sostanze attive'), T('sds', 'Schede di sicurezza'), T('seveso', 'Seveso e ADR'), T('fonti', 'Regole e fonti')] },
  dati: { icon: LuDatabase, label: 'Dati', period: false, lead: 'Archivio, salvataggi, importazioni, anagrafiche, qualità dei dati, registro delle modifiche e impostazioni.',
    tabs: [T('archivio', 'Archivio'), T('importa', 'Importa'), T('anagrafiche', 'Anagrafiche'), T('qualita', 'Qualità dei dati'), T('registro', 'Registro modifiche'), T('impostazioni', 'Impostazioni')] },
};

/* Edizione: schede nascoste, schede in più (dopo una scheda esistente) e testi propri di un'area. */
function forEdition(id, def) {
  const hide = META.hiddenTabs?.[id] || [], extra = META.extraTabs?.[id] || [], over = META.areaOverrides?.[id] || {};
  let tabs = def.tabs.filter(t => !hide.includes(t.id));
  for (const x of extra) {
    const i = tabs.findIndex(t => t.id === x.after);
    const tab = T(x.id, x.label);
    tabs = i < 0 ? [...tabs, tab] : [...tabs.slice(0, i + 1), tab, ...tabs.slice(i + 1)];
  }
  return { ...def, ...over, tabs };
}
/** [{id, icon, label, lead, period, tabs: [{id, label}]}] nell'ordine di AREA_IDS. */
export const AREA_DEFS = AREA_IDS.map(id => ({ id, ...forEdition(id, DEFS[id]) }));
/** Area per id. */
export const AREA = Object.fromEntries(AREA_DEFS.map(a => [a.id, a]));
