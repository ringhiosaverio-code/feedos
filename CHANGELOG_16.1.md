# FeedOS 16.1 · misure ESG dal questionario: acqua, rifiuti, Scope 1-2-3, persone e filiera

## In breve

L'area **ESG e tesi** si apre ora su un **cruscotto** che dice a che punto è lo stabilimento e da dove conviene partire. Le domande del questionario ESG per il settore mangimistico (CSRD/ESRS, VSME) diventano un **questionario guidato** dentro l'app: dove FeedOS ha già il dato la risposta si compila da sola, il resto si dà con un clic. Due nuovi registri misurano **acqua** e **rifiuti**.

## Novità

**Cruscotto ESG** (prima scheda dell'area)
- Livello di **maturità ESG** da 0 a 100 (Avvio, In crescita, Strutturato, Avanzato), con un anello per ambiente, sociale e governance: 33 criteri trasparenti, ognuno con il suo peso.
- **Prossimi passi** ordinati per punti guadagnati: ogni passo porta alla domanda o alla scheda giusta.
- **Traguardi**: questionario completato, inventario Scope 1-2-3, un anno di letture dell'acqua, rifiuti tracciati, 40 indicatori su 49.
- Otto riquadri: energia, emissioni Scope 1-2-3, acqua, rifiuti, persone e sicurezza, filiera, biodiversità, governance.
- **Inventario delle emissioni**: Scope 1 (GPL, gas naturale, gasolio), Scope 2 location-based, Scope 3 categoria 1 stimato dalle formule prodotte; intensità per tonnellata e sui ricavi.
- **KPI richiesti dal questionario** (ambiente, sociale, governance, biodiversità, filiera) con la fonte di ogni valore e il collegamento per completare quelli mancanti.

**Questionario guidato**
- 16 sezioni (informazioni generali, materie prime, energia, emissioni, acqua, rifiuti, persone, sicurezza, formazione, territorio, governance, etica, rischi, biodiversità, filiera, documenti), una alla volta, con avanzamento per sezione e complessivo.
- Risposte a scelta con un clic; domande che compaiono solo quando servono; salvataggio automatico, annulla e ripeti, registro delle modifiche.
- Valori calcolati dai dati (fatturato, energia, emissioni, acqua, rifiuti, soia certificata, provenienza degli acquisti, materie prime consumate) e **valori proposti** da confermare (numero di dipendenti, fornitori attivi, fornitori che fanno l'80% degli acquisti, ore lavorate, documenti disponibili).
- Le risposte alimentano 20 indicatori del registro (S1–S7, G1–G12, E14) con la nuova fonte «questionario»; esportazione CSV e stampa del questionario compilato.

**Acqua**
- Letture mensili per fonte (acquedotto, pozzo, altro); con la lettura del contatore il consumo si calcola dalla lettura precedente.
- Prelievo dei 12 mesi (E9), litri per tonnellata, tendenza degli ultimi tre mesi; nuovo segnale in «Oggi» quando l'acqua per tonnellata sale oltre il 12% e quando manca la lettura del mese scorso.

**Rifiuti**
- Registro dei formulari con i codici EER più frequenti in un mangimificio (pericolosi riconosciuti dall'asterisco), chilogrammi e destinazione (recupero o smaltimento).
- Rifiuti prodotti (E10), quota a recupero (E11), pericolosi, kg per tonnellata, scarti di produzione dalle registrazioni; segnale sui rifiuti recuperabili mandati a smaltimento.

**Altro**
- Barra dei comandi: «Registra la lettura dell'acqua», «Registra un rifiuto», «Compila il questionario ESG» e risposte rapide a «acqua», «rifiuti», «emissioni», «esg».
- Bozza del report VSME: corretti gli indicatori associati a B8–B11 (turnover, indici infortuni, divario retributivo, formazione e corruzione erano collegati a codici sbagliati); aggiunte le parti B2, B4, B5, lo Scope 3 e l'intensità idrica.
- Ritocchi grafici: riquadri con leggera profondità e transizioni, schede più leggibili; su telefono le scelte lunghe nella pagina Richiamo non escono più dallo schermo.
- Il mangimificio dimostrativo ha un anno di letture dell'acqua (con una perdita negli ultimi tre mesi), 70 formulari di rifiuti e un questionario quasi completo, tutti inventati. Un archivio dimostrativo salvato con la 16.0 riceve questi dati all'apertura senza perdere nulla.

## Codice

- Il repository ha di nuovo la struttura del progetto (`src/`, `fonts/`, `tests/`, `tools/`): `npm install`, `npm run build` e `npm test` funzionano dalla cartella principale. Tolti i percorsi fissi della macchina di sviluppo da build e test.
- Nuovi moduli: `src/engine/sustainability.js` (calcolo puro), `src/data/survey.js`, `src/data/eer.js`, `src/data/demo/sustainability.js`, `src/modules/sostenibilita.jsx`.
- Archivio: nuove raccolte `water` e `waste`, oggetto `survey`; i backup della 16.0 si aprono senza conversioni.
- Nuovi test del motore (`tests/engine/sustainability.test.mjs`) e nuovi passi nel collaudo operativo (`tests/e2e/ops.py`).

## Verifiche eseguite

- 19 test del motore superati (2 saltati: richiedono il progetto dimostrativo di FeedOS 15, non incluso nel repository).
- Collaudo automatico di tutte le pagine a 1440 px e 390 px, in tema chiaro e scuro, nella versione pubblica e con un archivio aziendale vuoto: nessun errore, nessuno sbordo orizzontale.
- Percorso operativo completo, comprese lettura dell'acqua, rifiuto pericoloso, risposta al questionario con valore proposto e annulla: tutto riuscito.
- Il controllo della build conferma che la versione pubblica non contiene i dati della tesi.

## Passi successivi

- La sincronizzazione multiutente con accesso autenticato resta il primo passo successivo (vedi `CHANGELOG_16.0.md`).
- Importazione CSV delle letture dell'acqua e del registro di carico e scarico dei rifiuti.
