# FeedOS 17

Il sistema operativo del mangimificio in un unico file HTML: controllo di gestione (conto economico al costo effettivo, budget, chiusura del mese, report CdA), finanza (crediti, cassa a 13 settimane, rimanenze), formulazione a costo minimo, acquisti con fornitori e varianze, produzione con OEE, manutenzione e bilancio di massa, qualità e tracciabilità, commerciale con listini, offerte e agenti, economia (redditività per cliente, pareggio, simulatore), ESG, cruscotto di 25 indicatori con obiettivi, qualità dei dati e importazione guidata dal gestionale. Funziona senza rete e senza server; i dati restano nel browser.

- **Provala**: apri `index.html` (mangimificio dimostrativo con dati inventati).
- **Edizione agrofarmaci**: apri `DifesaOS-demo.html` (DifesaOS 1.0, stesso codice, azienda di agrofarmaci inventata «Arvale Dimostrativa S.p.A.»): area Regolatorio (registrazioni e usi in etichetta, art. 43 e 46, sostanze attive, schede di sicurezza, Seveso e ADR), area Prodotti (report di prodotto stampabili con prove di campo e foto, statistica delle prove, costi, concorrenza a ettaro e leve di risparmio), campagne con ordini anticipati e premi, CO₂ dei programmi di difesa per ettaro e per kg di raccolto o di olio.
- **Guida completa**: [LEGGIMI.md](LEGGIMI.md) · novità: [CHANGELOG_17.0.md](CHANGELOG_17.0.md) (precedenti: [16.1](CHANGELOG_16.1.md), [16.0](CHANGELOG_16.0.md)).
- **Sviluppo** (Node.js 20+): `npm install`, `npm run build` (file in `dist/`), `npm test`.
