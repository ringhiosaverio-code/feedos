/* Voci del menu principale e schede di ogni area. */
import { LuHouse, LuFactory, LuFlaskConical, LuShoppingCart, LuCog, LuShieldCheck, LuHandshake, LuEuro, LuLeaf, LuDatabase } from 'react-icons/lu';

export const NAV = {
  oggi: { icon: LuHouse, label: 'Oggi', tabs: [{ id: 'decisioni', label: 'Decisioni' }, { id: 'attivita', label: 'Attività' }, { id: 'registro', label: 'Ultime modifiche' }] },
  gemello: { icon: LuFactory, label: 'Gemello digitale', tabs: [] },
  formulazione: { icon: LuFlaskConical, label: 'Formulazione', tabs: [{ id: 'formule', label: 'Formule' }, { id: 'materie', label: 'Materie prime' }, { id: 'specifiche', label: 'Specifiche' }] },
  acquisti: { icon: LuShoppingCart, label: 'Acquisti e mercati', tabs: [{ id: 'fabbisogni', label: 'Fabbisogni' }, { id: 'scorte', label: 'Scorte' }, { id: 'ordini', label: 'Ordini' }, { id: 'mercati', label: 'Mercati' }] },
  produzione: { icon: LuCog, label: 'Produzione', tabs: [{ id: 'piano', label: 'Piano' }, { id: 'registro', label: 'Registro' }, { id: 'energia', label: 'Energia e linee' }] },
  qualita: { icon: LuShieldCheck, label: 'Qualità e tracciabilità', tabs: [{ id: 'lotti', label: 'Lotti prodotto' }, { id: 'lotti-mp', label: 'Lotti materie prime' }, { id: 'analisi', label: 'Carte di controllo' }, { id: 'reclami', label: 'Reclami' }, { id: 'richiamo', label: 'Richiamo' }] },
  commerciale: { icon: LuHandshake, label: 'Commerciale', tabs: [{ id: 'clienti', label: 'Clienti' }, { id: 'offerte', label: 'Offerte' }, { id: 'listino', label: 'Listino' }, { id: 'visite', label: 'Visite' }, { id: 'rete', label: 'Rete agenti' }] },
  economia: { icon: LuEuro, label: 'Economia', tabs: [{ id: 'margini', label: 'Margini' }, { id: 'scenari', label: 'E se…' }, { id: 'previsioni', label: 'Previsioni' }] },
  esg: { icon: LuLeaf, label: 'ESG e tesi', tabs: [{ id: 'indicatori', label: 'Indicatori' }, { id: 'energia', label: 'Energia e CO₂' }, { id: 'passaporto', label: 'Passaporto prodotto' }, { id: 'vsme', label: 'VSME e report' }, { id: 'tesi', label: 'Dalla tesi all’azienda' }] },
  dati: { icon: LuDatabase, label: 'Dati', tabs: [{ id: 'archivio', label: 'Archivio' }, { id: 'importa', label: 'Importa' }, { id: 'registro', label: 'Registro modifiche' }, { id: 'impostazioni', label: 'Impostazioni' }] },
};
export function tabOf(area, tab) { const t = NAV[area]?.tabs || []; return t.find(x => x.id === tab)?.id || t[0]?.id || null; }
