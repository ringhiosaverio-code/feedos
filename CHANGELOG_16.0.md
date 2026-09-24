# FeedOS 16.0 · che cosa cambia rispetto a FeedOS 15

## Perché una riscrittura

FeedOS 15 aveva un motore di formulazione solido, un registro ESG rigoroso e un portale Python sicuro, ma era cresciuto per strati: una sezione per ogni versione (7 aree «intelligence» che si sovrapponevano), 14 fogli di stile, funzioni sostituite a caldo da un modulo all'altro, un primo avvio vuoto, avvisi che spingevano il contenuto fuori dallo schermo, termini inglesi e nessuna vista d'insieme dello stabilimento. FeedOS 16 riparte da zero con un'idea sola: **un'applicazione per reparto che ogni giorno dice cosa decidere e perché**.

## Novità principali

**Esperienza**
- Navigazione per reparto (10 aree con schede) al posto delle aree per versione; viste per ruolo (direzione, formulazione, acquisti, produzione, qualità, commerciale, agente).
- **Oggi**: decisioni spiegate con i numeri, ordinate per urgenza e impatto economico; per ognuna: apri, assegna (attività con responsabile e scadenza), rimanda, ignora.
- **Gemello digitale** dello stabilimento con quattro letture: materia, costo, energia, CO₂.
- Barra dei comandi (`Ctrl K`) con ricerca e domande in italiano («scorte mais», «e se mais +10%»).
- Annulla e ripeti su tutto, registro delle modifiche, istantanee automatiche.
- Presentazione guidata in 10 passi per la seduta di laurea; modalità «Aula»; tema chiaro e scuro; uso da telefono.
- Mangimificio dimostrativo coerente (52 settimane di storia, 1.100 lotti, 6.600 consegne, tracciabilità completa) che si rigenera alla data di oggi.

**Formulazione**
- Editor con composizione, profilo e specifica affiancati; ottimizzazione con variazione massima, prezzo del carbonio, uso delle sole scorte.
- Prezzi ombra (effetto di ogni vincolo), prezzo di convenienza delle materie prime escluse, valore dei limiti massimi, intervallo di stabilità dei prezzi.
- Frontiera costo–CO₂ con scelta di una composizione; controllo dell'aflatossina B1 dai lotti; diagnosi quando la specifica non ha soluzione.
- Bozza di cartellino (Reg. CE 767/2009), versioni con confronto, approvazione esplicita.

**Acquisti**
- Fabbisogni settimanali dal piano (MRP) con ordini pianificati e data utile; distinzione tra ordini in ritardo, da emettere entro 7 giorni e programmabili; mappa di calore della copertura.
- Scorte in giorni di copertura, arrivi che creano il lotto «in attesa» di accettazione, quotazioni con previsione verificata sul passato e confronto con il metodo ingenuo.

**Produzione**
- Carico delle linee sulla capacità utile e riequilibrio proposto tra linee dello stesso tipo o in anticipo.
- Registrazione di produzione che scarica i lotti di materia prima (FIFO), crea il lotto di prodotto e aggiorna le scorte in un solo passo annullabile.
- Energia per tonnellata per linea con riferimento e soglia di deriva, collegata ai reclami.

**Qualità e tracciabilità**
- Rilascio dei lotti con le tolleranze di etichetta (Reg. UE 2017/2279); accettazione delle materie prime con aflatossina B1 (Dir. 2002/32/CE).
- Carte di controllo con limiti a 3σ e Cpk; reclami a colonne con cause e costi.
- Richiamo a monte e a valle con bilancio di massa, blocco dei lotti a magazzino, elenco consegne e attività di comunicazione.

**Commerciale ed economia**
- Margine vero per cliente e prodotto (prezzo incassato meno costo pieno di oggi); mappa dei clienti; offerte con prezzo minimo in tempo reale; listino allineabile al prezzo obiettivo; IOFC nelle visite tecniche; rete agenti.
- Cascata dal prezzo al margine; simulatore «E se…» che separa l'efficienza già disponibile dall'effetto dello scenario, con soia certificata e prezzo del carbonio; previsione della domanda confrontata con il piano.

**ESG e tesi**
- I 49 indicatori del registro della tesi alimentati dai dati (18 calcolati automaticamente nel mangimificio dimostrativo), con la fonte di ogni valore.
- Energia e CO₂ con Sankey dei flussi, fattori di rete ISPRA selezionabili e modello I(s) della tesi.
- Passaporto di prodotto; copertura del VSME Basic e bozza di report.
- Versione completa: «Dalla tesi all'azienda» con i dati dell'esercizio 2025 (esclusi dalla versione pubblica, controllo automatico in fase di build).

## Architettura

- Un unico file HTML (circa 0,8 MB con caratteri incorporati), React 19, codice raggruppato con esbuild; nessuna dipendenza in rete.
- `src/engine`: calcolo puro e testato (programmazione lineare, formulazione, fabbisogni, previsione, qualità, tracciabilità, scenari, energia, ESG, segnali, operazioni).
- Stato immutabile con annulla/ripeti, salvataggio automatico in IndexedDB (riserva: localStorage, memoria), istantanee giornaliere, dati derivati memorizzati, protezione dagli errori per pagina.

## Verifiche eseguite

- Simplesso confrontato con HiGHS su 400 problemi: 384 ottimi concordi (scarto massimo 7·10⁻¹⁵), 16 non ammissibili concordi, prezzi ombra e costi ridotti identici.
- 12 test del motore (formulazione con differenze finite, coerenza dei dati dimostrativi, segnali, importazione da FeedOS 15): tutti superati.
- Importazione del progetto dimostrativo di FeedOS 15: stessa soluzione del motore di FeedOS 15 (244,08 €/t di materie prime, stessa composizione).
- Collaudo automatico di 44 pagine a 1440 px, a 390 px (telefono), in tema scuro, nella versione pubblica e con un archivio aziendale vuoto: nessun errore, nessuno sbordo orizzontale.
- Percorso operativo completo (arrivo e accettazione di un lotto, reclamo, offerta, listino, annulla e ripeti, scenario, importazione CSV, backup e ripristino, demo, ricarica della pagina): tutto riuscito.

## Compatibilità e passi successivi

- I dati di FeedOS 15 si importano da *Dati › Importa › Da FeedOS 15* (materie prime, specifica, formula in bozza, indicatori ESG). Prodotti, preventivi e registrazioni vengono elencati ma non convertiti.
- Il portale server di FeedOS 15 non è incluso: la **sincronizzazione multiutente con accesso autenticato** è il primo passo della versione 16.1, insieme a lettura automatica dei contatori (autoconsumo fotovoltaico), integrazione con le analisi NIR e stampa dei cartellini.
