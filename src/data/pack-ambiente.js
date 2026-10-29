/* FeedOS 18 · Pacchetto di contenuti «ambiente» integrato (WP9 Registri ambientali): regole e date dei registri ambientali con
 * norma, stato e «valido al». File senza dipendenze: un pacchetto importato con versione più recente lo sostituisce
 * (src/engine/esg-packs.js). Le voci sono sintesi di ricerca FeedOS, non testi ufficiali: restano «da verificare» finché un
 * controllo sulla fonte ufficiale non le conferma. Non sono consulenza legale. */

const V = '2026-10-21';

export const PACK_AMBIENTE = {
  pack: 'ambiente',
  version: '2026.1',
  validAsOf: V,
  source: 'Sintesi FeedOS al 21/10/2026: D.Lgs. 152/2006 artt. 190 e 269, DM 59/2023 (RENTRI), calendario RENTRI e xFIR (Milleproroghe 2026), MUD 2026 (DPCM 30/01/2026), D.Lgs. 102/2014 art. 8, direttiva (UE) 2023/1791 (rifusa), direttiva (UE) 2024/1785 (IED 2.0)',
  items: [
    { id: 'rentri-registrazione', kind: 'regola', law: 'DM 59/2023 (RENTRI); art. 190 D.Lgs. 152/2006', title: 'Registrazione dei movimenti sul registro di carico e scarico digitale entro 10 giorni lavorativi', value: 10, unit: 'giorni lavorativi',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (conoscenza, giugno 2025)' },
    { id: 'xfir', kind: 'regola', law: 'Milleproroghe 2026; calendario RENTRI', title: 'FIR digitale (xFIR) obbligatorio per i movimenti dal 15 settembre 2026', value: '2026-09-15', unit: 'data',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (articoli di settore, settembre 2026)' },
    { id: 'mud-2027', kind: 'scadenza', law: 'MUD: dichiarazione annuale (dati dell’anno precedente)', title: 'MUD 2027 (dati del 2026): scadenza normale, da confermare con il DPCM', value: '2027-04-30', unit: 'data',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (DPCM MUD 2026 e comunicazioni del settore)' },
    { id: 'diagnosi-102-2014', kind: 'scadenza', law: 'D.Lgs. 102/2014 art. 8', title: 'Diagnosi energetica quadriennale (grandi imprese e imprese energivore)', value: '2027-12-05', unit: 'data',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (scadenza del ciclo 2023)' },
    { id: 'eed-audit-10tj', kind: 'regola', law: 'Direttiva (UE) 2023/1791 art. 11 (in corso di recepimento)', title: 'Soglia di consumo per l’audit energetico nella direttiva rifusa, se recepita', value: 10, unit: 'TJ/anno',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (stato del recepimento non verificato)' },
    { id: 'eed-enms-85tj', kind: 'regola', law: 'Direttiva (UE) 2023/1791 art. 11 (in corso di recepimento)', title: 'Soglia per il sistema di gestione dell’energia nella direttiva rifusa, se recepita', value: 85, unit: 'TJ/anno',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (stato del recepimento non verificato)' },
    { id: 'aua-campionamento', kind: 'regola', law: 'D.Lgs. 152/2006 art. 269; AUA (DPR 59/2013)', title: 'Frequenza dei campionamenti ai camini: quella prescritta dall’autorizzazione in vigore', value: null, unit: 'mesi',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS: il valore è quello dell’autorizzazione di ogni stabilimento' },
    { id: 'ied-ems', kind: 'scadenza', law: 'Direttiva (UE) 2024/1785 (IED 2.0)', title: 'Sistema di gestione ambientale certificato per gli impianti AIA esistenti', value: '2030-07-01', unit: 'data',
      status: 'da verificare', source: 'Sintesi di ricerca FeedOS (recepimento da verificare)' },
  ],
};
