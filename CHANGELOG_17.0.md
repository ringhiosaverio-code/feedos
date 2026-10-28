# FeedOS 17.0 · dal mangimificio ben gestito al controllo di gestione completo

## In breve

FeedOS 17 aggiunge al sistema operativo del mangimificio tutto ciò che serve a **governare l'azienda con i numeri**: conto economico gestionale al costo effettivo dei lotti, budget e chiusura del mese, crediti e cassa, redditività netta di ogni cliente, punto di pareggio, fornitori con punteggio, varianze di prezzo e di materiale, OEE e manutenzione delle linee, bilancio di massa con gli inventari fisici, un cruscotto di 25 indicatori con obiettivi e semafori, il controllo della qualità dei dati e l'importazione guidata dal gestionale. Tutto resta in un unico file HTML che funziona senza rete e senza server.

Ogni numero ha una sola definizione e si ritrova uguale in tutte le pagine, nei segnali di «Oggi» e nel report per il consiglio di amministrazione.

## Novità per area

**Fondamenta**
- **Periodo globale** in testata (mese, mese chiuso, trimestre, anno, 12 mesi, anno precedente, date a scelta) con il **confronto** (periodo precedente, anno precedente, budget); un confronto con un periodo senza dati sufficienti è segnalato come «non confrontabile».
- Un'unica tabella dei fatti di vendita **al costo effettivo dei lotti consegnati**: materie prime ai prezzi dei lotti consumati, calo, energia, trasformazione, imballi, trasporti, provvigioni, oneri finanziari.
- **Mesi chiusi**: consegne, lavorazioni, fatture, incassi, costi fissi e rettifiche di un mese chiuso non si modificano (si riapre con una nota che resta nel registro).
- Archivio allo schema 17 con migrazione automatica dei dati della 16; annulla e ripeti anche sulle operazioni che toccano più archivi.

**Direzione**
- **Conto economico gestionale**: ricavi lordi, sconti, MdC I e II, costi fissi per centro, EBITDA, EBIT e risultato dopo gli oneri del circolante, per tonnellata e sui ricavi.
- **Scostamenti** prezzo–volume–mix e cascata dal periodo di confronto o dal budget.
- **Budget** per mese e centro con versioni, revisioni e stima di chiusura dell'anno.
- **Chiusura del mese** con lista di controllo bloccante (tra cui la qualità dei dati), numeri congelati e commenti; **report CdA** stampabile, in Markdown e CSV, con le sezioni di tutte le aree.
- L'andamento mensile di margine ed EBIT parte dal primo mese con i dati completi: un mese iniziato a metà non mostra più una perdita che è solo l'effetto dei costi fissi del mese intero.

**Finanza**
- **Crediti e fidi**: scadenzario, anzianità, DSO, classi di rischio, perdita attesa, clienti oltre il fido; un'offerta oltre il fido richiede chi autorizza l'eccezione.
- **Cassa a 13 settimane**: incassi attesi, pagamenti ai fornitori e agli agenti, rate, linee di credito.
- **Capitale circolante** e **rimanenze** valorizzate al FIFO, al costo medio e a sostituzione, classi ABC/XYZ, materiali lenti ed eccedenze con il costo di mantenimento.
- I **saldi alla data** (crediti, DSO, capitale circolante, rimanenze) si confrontano solo se i dati cominciano abbastanza prima della data di confronto (90 giorni per crediti e debiti, 60 per il magazzino); altrimenti il confronto è «non confrontabile» invece di una variazione inventata.

**Economia**
- **Redditività netta per cliente**: margine dopo logistica, ritardi d'incasso, reclami e visite; quadranti (difendere, rinegoziare, sviluppare, ristrutturare), curva della balena, prezzo necessario per arrivare all'obiettivo.
- **Pareggio e leva operativa**: punto di pareggio in tonnellate e in euro, margine di sicurezza mese per mese, struttura dei costi, assorbimento dei fissi per linea.
- **Margini** al costo effettivo o ai costi di oggi; simulatore **«E se…»** con tutte le categorie di costo, elasticità e ri-ottimizzazione delle formule; **previsioni** con scelta automatica del modello e confronto con la media mobile.

**Commerciale**
- **Listini** con revisioni approvate, prezzo minimo e prezzo obiettivo dal costo pieno; **offerte** con stato, scadenza, rinnovo, causa della perdita e concorrente; tasso di successo a valore.
- **Agenti**: schemi provvigionali a scaglioni, per prodotto e sotto il prezzo minimo, maturazione al fatturato o all'incasso, Enasarco e FIRR, estratto conto trimestrale.

**Acquisti**
- **Fornitori qualificati** con certificati, qualifica e condizioni; **punteggio** 0–100 da puntualità e completezza (OTIF), qualità dei lotti (respinti, proteina, umidità, aflatossina, reclami), prezzo rispetto agli altri fornitori della stessa materia prima e documenti; mappa del valore e scheda del fornitore.
- **Varianze**: varianza di prezzo d'acquisto sugli standard dell'anno, varianza di materiale scomposta in formula, prezzo e quantità, premio pagato sul mercato, effetto dei tempi d'acquisto, standard modificabili.
- **Fabbisogni** più precisi: un lotto in quarantena è un arrivo condizionato (un arrivo registrato non genera più un ordine doppio), consegne in ritardo segnalate, ordini parziali per il residuo, ordine minimo e sconti del fornitore, **scorta di sicurezza statistica** con il capitale che si libererebbe, **copertura e rischio di prezzo** al P90 delle materie prime principali.
- Ordini con il codice del registro e il fornitore, arrivi parziali, storno di un arrivo, causa del respingimento di un lotto.

**Produzione**
- **OEE** di ogni linea (disponibilità, prestazioni, qualità) sul calendario reale con festivi e straordinari, albero delle perdite in ore o in euro, **valore di un punto di OEE**, fermi per causa, cambi prodotto ordinati per valore, turni a confronto, registro dei fermi.
- **Manutenzione**: componenti con contatori in tonnellate, ore o giorni, scadenze, MTBF e MTTR, costo per tonnellata, ordini di lavoro, **rientro della sostituzione della trafila** (energia e portata recuperate).
- **Bilancio di massa**: libro per materia prima, conte fisiche, **calo effettivo** fra due conte, differenze da registrare (rettifica sui lotti più vecchi, annullabile), lotti che non quadrano.

**Oggi e Dati**
- **Cruscotto** di 25 indicatori con formula dichiarata, obiettivo (anche mese per mese), semaforo, confronto e andamento di 13 mesi; **prime 5 perdite in euro**; segnali quando un indicatore resta fuori obiettivo per due mesi chiusi.
- **Qualità dei dati**: 20 regole (tracciabilità, bilancio di massa, anagrafiche, produzione, commerciale, amministrazione, backup) con punteggio, record da correggere e collegamento alla scheda giusta; punteggio nel menu laterale.
- **Anagrafiche** di clienti, agenti, prodotti, linee, materie prime, fornitori e centri di costo, con i controlli dei campi; non si cancella un record in uso.
- **Importazione guidata** dal gestionale: clienti, agenti, prodotti, consegne, costi fissi, fatture, incassi, energia; colonne italiane riconosciute da sole, numeri e date all'italiana, chili in tonnellate, anteprima con nuovi, modificati ed errori per cella, un solo passo annullabile.

**ESG**
- **Acqua per tonnellata** e tendenza solo sui mesi con la produzione registrata per intero: un mese in cui il registro delle lavorazioni comincia o finisce a metà non gonfia più la media (la lettura del contatore resta nel prelievo e il mese escluso è indicato sotto il grafico).

## Dati dimostrativi

Il mangimificio dimostrativo (sempre inventato) ha ora due anni di venduto (un anno di storico mensile e un anno di consegne), un anno di fatture e incassi, costi fissi e budget, 17 fornitori con ordini storici, un anno di fermi, dieci componenti delle linee con i loro interventi, conte fisiche mensili e gli obiettivi dei KPI. Un archivio dimostrativo salvato con la 16 riceve i nuovi dati all'apertura senza perdere nulla.

## Codice

- Motori nuovi in `src/engine/`: `actuals.js`, `pnl.js`, `pvm.js`, `budget.js`, `closing.js`, `report.js`, `credit.js`, `cash.js`, `inventory.js`, `profitability.js`, `breakeven.js`, `scenario.js`, `forecast.js`, `costing.js`, `pricing.js`, `commissions.js`, `suppliers.js`, `purchaseVariance.js`, `lines.js`, `oee.js`, `maintenance.js`, `massbalance.js`, `kpis.js`, `dataquality.js`; in `src/core/`: `period.js`, `ops.js`, `codes.js`, `fields.js`, `importers.js`.
- 195 test del motore (`npm test`), collaudo di tutte le pagine e operazioni complete nel browser (`tests/e2e`).
- La versione pubblica non contiene alcun dato dell'impresa studiata nella tesi.
