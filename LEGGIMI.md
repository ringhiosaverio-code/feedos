# FeedOS 16.1 · il sistema operativo del mangimificio

FeedOS 16 è una riscrittura completa di FeedOS 15. Non è più un insieme di moduli aggiunti versione dopo versione, ma un'unica applicazione organizzata **per reparto**: direzione, formulazione, acquisti, produzione, qualità, commerciale, economia ed ESG. Ogni mattina legge i dati dello stabilimento e propone **le decisioni da prendere, con il perché espresso in numeri**. Nessuna azione parte da sola.

Si apre con un doppio clic, funziona senza rete e senza server, e i dati restano nel browser di chi la usa.

---

## 1. Come si apre

1. Apri **`FeedOS-16-demo.html`**: è la versione dimostrativa, con un mangimificio di fantasia. Si può mostrare a chiunque.
2. Apri **`FeedOS-16-completa-RISERVATA.html`** solo per uso personale o per la seduta di laurea: contiene anche la scheda **«Dalla tesi all'azienda»**, con i dati dell'impresa studiata nella tesi. **Non pubblicarla** senza il consenso scritto dell'impresa, perché il questionario è a diffusione riservata.
3. Browser consigliati: Chrome o Edge aggiornati; vanno bene anche Firefox e Safari.
4. Alla prima apertura viene caricato il **mangimificio dimostrativo**, riportato alla data di oggi. Il riquadro giallo nel menu ricorda che i dati sono inventati.

| Comando | Effetto |
|---|---|
| `Ctrl K` oppure `/` | Barra dei comandi: cerca formule, lotti, clienti, oppure fai una domanda come «margine suino», «scorte mais», «richiamo M01», «e se mais +10%», «acqua», «rifiuti», «emissioni», «esg» |
| `Ctrl Z` / `Ctrl Y` | Annulla / ripeti l'ultima modifica, anche dopo un'operazione su più archivi |
| Icona del monitor | Tema automatico, chiaro o scuro |
| Icona della lavagna | **Presentazione guidata** in 10 passi (frecce ← →, `Esc` per uscire) |
| Dati › Impostazioni › «Aula» | Testo grande per proiettore |

## 2. Dove sono i dati e come non perderli

- I dati si salvano **automaticamente** nel browser (IndexedDB) mezzo secondo dopo ogni modifica. In basso a sinistra c'è lo stato: «Salvato in questo browser».
- Ogni giorno viene salvata un'**istantanea automatica**. Anche prima di ogni sostituzione dell'archivio (ripristino, demo, importazione) si salva un'istantanea, che si recupera da **Dati › Archivio**.
- **Esporta un backup** ogni settimana e prima di cambiare computer o browser. Il backup è un solo file JSON: da **Dati › Archivio › Esporta backup completo**. Svuotare i dati di navigazione del browser cancella anche l'archivio locale.
- Ogni modifica resta nel **registro delle modifiche**, con data, vista usata e descrizione.

## 3. Le aree, reparto per reparto

| Area | A cosa serve | Cosa si decide |
|---|---|---|
| **Oggi** | Le decisioni aperte ordinate per urgenza e impatto economico, i numeri della settimana, lo stabilimento in miniatura, le attività | Aprire, assegnare (diventa un'attività con responsabile e scadenza), rimandare di 7 giorni, ignorare |
| **Gemello digitale** | Lo stabilimento in un solo disegno: ricevimento, silos, linee, prodotti, clienti; flussi di materia, costo, energia e CO₂ | Dove si accumulano costi ed emissioni |
| **Formulazione** | Formule a costo minimo (programmazione lineare), prezzi ombra, prezzo di convenienza delle materie prime escluse, stabilità dei prezzi, frontiera costo–CO₂, aflatossina B1, bozza di cartellino, versioni | Ri-ottimizzare e **approvare** una nuova versione (la formula in uso cambia solo con l'approvazione) |
| **Acquisti e mercati** | Dal piano di produzione ai fabbisogni; ordini pianificati con la data utile; scorte in giorni di copertura; arrivi; quotazioni con previsione **verificata sul passato** | Quali ordini emettere questa settimana; cosa è già in ritardo |
| **Produzione** | Carico delle linee e **riequilibrio** proposto; registrazione di produzione che scarica i lotti di materia prima (FIFO) e crea il lotto di prodotto; energia per tonnellata e deriva per linea | Spostare volumi tra linee; assegnare una verifica alla manutenzione |
| **Qualità e tracciabilità** | Rilascio dei lotti con le tolleranze di etichetta; accettazione delle materie prime con l'aflatossina B1; carte di controllo con Cpk; reclami; **richiamo** con bilancio di massa | Rilasciare, bloccare, accettare, respingere; simulare un richiamo |
| **Commerciale** | Clienti sul territorio con il margine vero; **offerte con prezzo minimo in tempo reale**; listino confrontato con il costo pieno; visite con il reddito sul costo alimentare (IOFC); rete agenti | Prezzo delle offerte; allineamento del listino |
| **Economia** | Dal prezzo incassato al margine (cascata), contributo al margine per prodotto; simulatore **«E se…»**; previsione della domanda confrontata con il piano | Impatto di materie prime, energia, volumi; coerenza del piano |
| **ESG e tesi** | **Cruscotto** con livello di maturità ESG (ambiente, sociale, governance), traguardi e prossimi passi; **questionario ESG guidato** in 16 sezioni; registri di **acqua** (letture mensili per fonte, litri per tonnellata) e **rifiuti** (codici EER, pericolosi, quota a recupero); inventario **Scope 1-2-3**; i **49 indicatori** della tesi alimentati da dati e risposte (ogni valore dichiara la fonte); energia e CO₂ con il modello della tesi; **passaporto di prodotto**; copertura del **VSME** e bozza di report | Cosa misurare, cosa migliorare per primo, cosa manca per un report completo |
| **Dati** | Backup, ripristino, istantanee, importazione CSV (prezzi, giacenze, quotazioni) e da FeedOS 15, registro, impostazioni | — |

**Viste per ruolo** (menu in alto): direzione, formulazione, acquisti, produzione, qualità, commerciale, agente. Cambiano l'ordine del menu e ciò che «Oggi» mette in primo piano. **Non sono permessi di sicurezza**: nella versione locale chiunque usi quel browser vede tutti i dati.

## 4. Percorso per la seduta di laurea (10 minuti)

La **presentazione guidata** (icona della lavagna, oppure «Presentazione guidata» in *Oggi*) segue questo percorso e porta da sola sulle pagine giuste.

1. **Oggi**: «Il sistema non decide al posto delle persone: mette in fila le decisioni e le spiega con i numeri.»
2. **Gemello digitale**: lo stabilimento come un sistema di flussi; si passa da materia a costo, energia e CO₂.
3. **Formulazione**: la formula approvata qualche mese fa oggi costa di più; *Ottimizza* → proposta con risparmio annuo; scheda *Prezzi ombra* (cosa costa ogni vincolo); scheda *Costo e CO₂* (frontiera).
4. **Acquisti**: dal piano agli ordini; tre ordini in ritardo, uno con una settimana scoperta anche ordinando oggi.
5. **Produzione › Energia**: linea pellet 2 al +11% di kWh/t, con due reclami per pellet friabile nello stesso periodo.
6. **Qualità › Richiamo**: dal lotto di mais con aflatossina alta ai clienti, con il bilancio di massa chiuso, in meno di un millisecondo.
7. **Commerciale › Nuova offerta**: il margine si vede mentre si scrive il prezzo.
8. **Economia › E se…**: mais +10%; la ri-ottimizzazione assorbe una parte dell'aumento; il risparmio già disponibile oggi resta separato.
9. **ESG › Indicatori**: i 49 indicatori, con la fonte di ogni valore; poi **Energia e CO₂** con il modello I(s) della tesi. Se c'è tempo: **ESG › Cruscotto** (maturità, acqua con la perdita degli ultimi tre mesi, rifiuti, Scope 1-2-3).
10. **ESG › Passaporto di prodotto**, e nella versione completa **Dalla tesi all'azienda**: 89.450 t, 10,88 kg CO₂/t (intervallo 10,36–11,39), scenari del fattore di rete.

Suggerimento: prima della seduta usa *Dati › Archivio › Rigenera il mangimificio dimostrativo*, così numeri e segnali corrispondono a questo percorso.

## 5. Passare ai dati reali

1. **Dati › Archivio › Inizia con i dati della tua azienda**: l'archivio riparte con materie prime e specifiche di esempio da verificare. Nessun cliente o movimento. Quello precedente resta in un'istantanea.
2. **Dati › Impostazioni**: ragione sociale, stabilimento, numero di riconoscimento, prezzi di elettricità e GPL, fattori di emissione.
3. **Formulazione › Materie prime**: sostituisci valori nutrizionali, prezzi, limiti e fattori di emissione con quelli del tuo laboratorio e dei tuoi fornitori. Prezzi e giacenze si importano anche da CSV (**Dati › Importa**, con il modello scaricabile).
4. **Formulazione › Specifiche** e **Nuova formula**: la prima proposta a costo minimo è pronta in pochi secondi; approvala dopo la verifica tecnica.
5. Da **FeedOS 15**: *Dati › Importa › Da FeedOS 15* legge il backup completo (`feedos-7-backup-….json`) o il progetto di formulazione (`feedos-6.1-progetto.json`). Si importano materie prime, specifica, composizione (come formula in bozza) e valori degli indicatori ESG. Ciò che non ha un corrispondente sicuro (prodotti, preventivi, registrazioni) viene elencato, non inventato. Sul progetto dimostrativo di FeedOS 15 il motore di FeedOS 16 trova la stessa soluzione (244,08 €/t di materie prime).
6. **ESG › Questionario**: le risposte (persone, sicurezza, formazione, governance, etica, rischi, biodiversità, filiera) alimentano gli indicatori del registro. Dove FeedOS ha già il dato (energia, emissioni, acqua, rifiuti, fornitori) la domanda si compila da sola o propone un valore da confermare con un clic.
7. **ESG › Acqua** e **ESG › Rifiuti**: una lettura del contatore al mese e i formulari dei rifiuti (codice EER, kg, recupero o smaltimento).
8. Da lì in avanti: arrivi (**Acquisti › Ordini › Arrivo**), accettazione dei lotti (**Qualità › Lotti materie prime**), registrazioni (**Produzione › Registra produzione**), consegne e offerte.

## 6. Metodi e fonti

- **Formulazione**: programmazione lineare (simplesso a due fasi) su kg per tonnellata; vincoli su nutrienti (tal quale o sostanza secca), rapporti, gruppi, limiti per materia prima, contaminanti, variazione massima, scorte. Il motore è stato confrontato con HiGHS (SciPy) su 400 problemi casuali: **nessuna discordanza** e prezzi ombra identici.
- **Prezzi ombra e convenienza**: duali dei vincoli e costi ridotti; intervallo di stabilità del prezzo per bisezione; frontiera costo–CO₂ con tetto crescente alle emissioni.
- **Fabbisogni**: MRP a periodi settimanali; ordine pianificato quando la scorta proiettata scende sotto la sicurezza, da emettere entro «inizio settimana − tempo di consegna»; una rottura è «non evitabile» solo dentro il tempo di consegna.
- **Previsioni**: livellamento esponenziale con tendenza (Holt), stagionalità con almeno due cicli; banda P10–P90 dagli errori osservati; **backtest** con origine mobile e confronto con il metodo ingenuo. Se il modello non batte il metodo ingenuo, l'app lo dice.
- **Tolleranze di etichetta**: Reg. (CE) 767/2009, all. IV, parte A (testo modificato dal Reg. UE 2017/2279). **Aflatossina B1**: Dir. 2002/32/CE, all. I (20 µg/kg materie prime; 5 per bovine da latte, vitelli, suinetti e pollame giovane; 20 per bovini, suini e pollame adulti; 10 per gli altri mangimi).
- **Cartellino**: componenti analitici del Reg. (CE) 767/2009, all. VI, capo II.
- **Tracciabilità**: Reg. (CE) 178/2002, art. 18; lotti di materia prima e di prodotto collegati con prelievo FIFO; bilancio di massa.
- **Energia ed emissioni**: Scope 1 dal GPL con CH₄ e N₂O di combustione (IPCC 2006, GWP AR6), più gas naturale e gasolio indicati nel questionario; Scope 2 location-based con fattori ISPRA; Scope 3 categoria 1 (materie prime acquistate) dai fattori di emissione delle formule effettivamente prodotte; modello della tesi I(s) = [E·(1−s)·FE + m·f] / Q.
- **Acqua**: prelievo per mese e fonte (acquedotto, pozzo, altro) dalle letture; litri per tonnellata sulla produzione degli stessi mesi; tendenza degli ultimi tre mesi contro i precedenti (segnale oltre +12%).
- **Rifiuti**: registro dei formulari con codice EER (Decisione 2000/532/CE, asterisco = pericoloso); quota a recupero in peso (operazioni R); segnalati i rifiuti di norma recuperabili mandati a smaltimento.
- **Sicurezza**: indice di frequenza = infortuni × 1.000.000 / ore lavorate; indice di gravità = giornate perse × 1.000 / ore lavorate (ore stimate a 1.720 per addetto se mancano).
- **Maturità ESG**: 33 criteri trasparenti (12 ambiente, 10 sociale, 11 governance) con un peso ciascuno; punteggio per pilastro = punti ottenuti / punti possibili; i prossimi passi sono i criteri mancanti ordinati per punti.
- **Carte di controllo**: valori individuali, σ da escursione mobile (MR/1,128), regola delle 8 serie, Cpk rispetto alle tolleranze di legge.
- **VSME**: modulo Basic (B1–B11); un requisito è coperto se almeno un indicatore collegato è di classe A o B (regola della tesi).

## 7. Limiti dichiarati

- Il mangimificio dimostrativo è **inventato**: valori nutrizionali, prezzi e fattori di emissione sono ordini di grandezza indicativi, non analisi né fabbisogni validati. I comuni sono reali solo come riferimento geografico.
- Il **passaporto di prodotto** e l'indicatore E8 sono **stime** per confrontare prodotti e scelte: non sono una LCA certificata (ISO 14067). Lo stesso vale per lo **Scope 3**, che comprende solo le materie prime acquistate.
- La **maturità ESG** è uno strumento per dare priorità alle azioni, non un rating: criteri e soglie (per esempio 20 ore di formazione per addetto) sono indicativi. I fattori di gas naturale e gasolio vanno verificati con i parametri standard nazionali dell'anno.
- Acqua, rifiuti e risposte del mangimificio dimostrativo sono **inventati**, come il resto dei suoi dati.
- Il **cartellino** è una bozza generata dalla formula: denominazioni, additivi e tenori vanno verificati con la scheda della premiscela e la normativa vigente.
- Versione **locale e a utente singolo**: nessuna sincronizzazione tra colleghi, nessuna autenticazione. Le viste per ruolo organizzano il lavoro ma non proteggono i dati.
- Il portale server di FeedOS 15 non è stato portato in questa versione: la sincronizzazione multiutente è il prossimo passo (vedi `CHANGELOG_16.0.md`).

## 8. Per chi sviluppa

Dalla cartella principale del repository (serve Node.js 20 o successivo):

```
npm install                         # esbuild, React, icone
npm run build                       # crea dist/FeedOS-16.html (completa), dist/FeedOS-16-demo.html (pubblica) e la variante da pubblicare
npm test                            # motore di calcolo, dati dimostrativi, segnali, acqua, rifiuti, questionario, importazione da FeedOS 15
python3 tests/engine/lp_vs_highs.py # confronto del simplesso con HiGHS (richiede SciPy)
python3 tests/e2e/smoke.py 1440 light   # tutte le pagine: errori, sbordi, tempi (richiede Playwright)
python3 tests/e2e/ops.py                # operazioni complete: arrivi, reclami, offerte, acqua, rifiuti, questionario, backup, importazione
```

I test dell'interfaccia aprono i file in `dist/`; con la variabile `CHROMIUM=/percorso/chromium` usano un browser già installato. I due test di importazione da FeedOS 15 richiedono il progetto dimostrativo di FeedOS 15 (`FEEDOS15_PROJECT=/percorso/demo-project.json`), altrimenti vengono saltati. Per aggiornare la versione pubblica: copia `dist/FeedOS-16-demo.html` su `index.html` e `FeedOS-16-demo.html`.

Struttura: `src/engine` (calcolo puro, senza interfaccia: `sustainability.js` per acqua, rifiuti, Scope 1-2-3, questionario e maturità), `src/core` (stato, salvataggio, navigazione, dati derivati), `src/modules` (una pagina per area; `sostenibilita.jsx` per cruscotto, questionario, acqua e rifiuti), `src/ui` (componenti e grafici), `src/data` (registro ESG, questionario `survey.js`, codici EER `eer.js`, dati dimostrativi, profilo della tesi solo nella versione completa), `fonts`, `tests`, `tools/make_fonts.py`. Caratteri incorporati: TeX Gyre Heros e DejaVu Sans Mono (licenze libere), rinominati FeedOS Sans/Display/Mono.
