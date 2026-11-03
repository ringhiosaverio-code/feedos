# Leggero – launcher minimale per Samsung Tizen TV

Schermata iniziale senza pubblicità, anteprime o animazioni, con le sole app che scegli tu.
Non modifica il sistema del TV e non lo rende più veloce di per sé: sostituisce solo la Home che usi.

## Installazione
1. TV: App → digita 12345 → Modalità sviluppatore ON → inserisci l'IP del PC → riavvia il TV.
2. PC: installa Tizen Studio (con TV Extensions) e crea un certificato Samsung (Certificate Manager).
3. Compila e firma: `tizen package -t wgt -s <profilo_certificato> -- .`
4. Collega: `sdb connect <IP_TV>`, poi `tizen install -n Leggero.wgt -t <nome_TV>`.
5. Avvia "Leggero" da App → l'app installata dall'utente.

## Uso
- Frecce + OK per aprire un'app, Indietro per uscire.
- Tasto GIALLO: mostra gli ID delle app installate. Copiali in `apps.js`.
- Gli ID in `apps.js` sono esempi e potrebbero non valere per il tuo TV.
