/* FeedOS 18 · Pacchetto di contenuti «clima» integrato: fattori di emissione aziendali con fonte, anno e stato.
 * File senza dipendenze, di proprietà del pacchetto clima. Un pacchetto importato con versione più recente
 * (settings.esg18.packs.clima) lo sostituisce (src/engine/esg-packs.js); una sostituzione dell'utente (raccolta
 * factorOverrides, con motivo) vince su entrambi.
 * Voce: { id, group, label, value, unit, source, year, status, kind, note?, sectors?, comp?, gas? }
 *   kind 'annuale'  = fattore pubblicato ogni anno (rete, mix residuo, DEFRA): invecchia, si controlla l'anno;
 *   kind 'parametro' = valore di riferimento stabile (IPCC 2006, GWP AR6, poteri calorifici): non invecchia;
 *   kind 'stima'     = stima prudente di FeedOS, sempre «da verificare» finché l'utente non la sostituisce.
 * sectors: voci valide solo per un settore (es. ['mangimi']); senza sectors la voce vale per tutti.
 * Le voci senza valore (value null) sono segnaposto da compilare: il calcolo che le usa resta «non calcolato». */
export const PACK_CLIMA = {
  pack: 'clima',
  version: '2026.4',
  validAsOf: '2026-10-21',
  source: 'FeedOS · pacchetto fattori clima integrato',
  items: [
    /* ---------- elettricità (Scope 2 e categoria 3) ---------- */
    { id: 'el.lb.it.2023', group: 'elettricita', label: 'Rete elettrica Italia 2023, location-based', value: 0.2347, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 413/2025 (mix nazionale)', year: 2023, status: 'verificato', kind: 'annuale', note: 'Solo CO₂ (fattore di emissione del parco termoelettrico sui consumi elettrici).' },
    { id: 'el.lb.it.2024p', group: 'elettricita', label: 'Rete elettrica Italia 2024, location-based (preliminare)', value: 0.1989, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 413/2025', year: 2024, status: 'preliminare', kind: 'annuale' },
    { id: 'el.lb.it.2024', group: 'elettricita', label: 'Rete elettrica Italia 2024, location-based (consolidato)', value: 0.1926, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 430/2026', year: 2024, status: 'verificato', kind: 'annuale', note: 'Solo CO₂. Valore di base per gli archivi nuovi.' },
    { id: 'el.lb.it.2025p', group: 'elettricita', label: 'Rete elettrica Italia 2025, location-based (preliminare)', value: 0.1996, unit: 'kg CO₂/kWh', source: 'ISPRA, Rapporti 430/2026', year: 2025, status: 'preliminare', kind: 'annuale' },
    { id: 'el.rm.it', group: 'elettricita', label: 'Mix residuo Italia (Scope 2 market-based)', value: null, unit: 'kg CO₂/kWh', source: 'AIB, European Residual Mix 2025 (anno di produzione 2024): valore da trascrivere dopo la verifica', year: 2024, status: 'da trascrivere', kind: 'annuale',
      note: 'Senza questo valore lo Scope 2 market-based resta «non calcolato»: non si riempie con una stima.' },
    { id: 'el.td', group: 'elettricita', label: 'Perdite di trasmissione e distribuzione della rete', value: 0.06, unit: 'quota dei kWh di rete', source: 'Terna, statistiche delle perdite di rete (circa 6%)', year: 2024, status: 'da verificare', kind: 'annuale' },

    /* ---------- combustibili (Scope 1) ---------- */
    { id: 'gpl.co2', group: 'combustibili', label: 'GPL, CO₂ da combustione', value: 2.985, unit: 'kg CO₂/kg', source: 'IPCC 2006, vol. 2: 63,1 t CO₂/TJ × 47,3 MJ/kg', year: 2006, status: 'verificato', kind: 'parametro', note: 'Il valore nazionale MASE/ISPRA dell’anno, quando verificato, arriva con un aggiornamento del pacchetto.' },
    { id: 'gpl.nonco2', group: 'combustibili', label: 'GPL, CH₄ e N₂O da combustione', value: 0.0026, unit: 'kg CO₂e/kg', source: 'IPCC 2006, vol. 2, tab. 2.3 (CH₄ 1 kg/TJ, N₂O 0,1 kg/TJ) con GWP AR6', year: 2006, status: 'verificato', kind: 'parametro' },
    { id: 'gpl.ncv', group: 'combustibili', label: 'GPL, potere calorifico inferiore', value: 13.14, unit: 'kWh/kg', source: 'IPCC 2006, vol. 2 (47,3 MJ/kg)', year: 2006, status: 'verificato', kind: 'parametro' },
    { id: 'gpl.density', group: 'combustibili', label: 'GPL, densità', value: 0.51, unit: 'kg/l', source: 'Valore tipico della miscela commerciale', year: 2025, status: 'da verificare', kind: 'parametro' },
    { id: 'gas.co2', group: 'combustibili', label: 'Gas naturale, CO₂ da combustione', value: 1.975, unit: 'kg CO₂/Sm³', source: 'Parametri standard nazionali MASE/ISPRA (valore in uso in FeedOS)', year: 2024, status: 'da verificare', kind: 'annuale' },
    { id: 'gas.nonco2', group: 'combustibili', label: 'Gas naturale, CH₄ e N₂O da combustione', value: 0.0019, unit: 'kg CO₂e/Sm³', source: 'IPCC 2006, vol. 2, tab. 2.3 (CH₄ 1 kg/TJ, N₂O 0,1 kg/TJ) con GWP AR6', year: 2006, status: 'verificato', kind: 'parametro' },
    { id: 'gas.ncv', group: 'combustibili', label: 'Gas naturale, potere calorifico inferiore', value: 9.72, unit: 'kWh/Sm³', source: 'Valore tipico del gas distribuito in Italia (35 MJ/Sm³)', year: 2024, status: 'da verificare', kind: 'parametro' },
    { id: 'diesel.co2e', group: 'combustibili', label: 'Gasolio (100% minerale), combustione', value: 2.66, unit: 'kg CO₂e/l', source: 'DEFRA 2025 (≈ IPCC 74,1 t CO₂/TJ × 43,0 MJ/kg × 0,835 kg/l)', year: 2025, status: 'verificato', kind: 'annuale', note: 'CO₂e: CH₄ e N₂O già compresi.' },
    { id: 'diesel.ncv', group: 'combustibili', label: 'Gasolio, potere calorifico inferiore', value: 9.97, unit: 'kWh/l', source: 'IPCC 2006, vol. 2 (43,0 MJ/kg × 0,835 kg/l)', year: 2006, status: 'verificato', kind: 'parametro' },
    { id: 'diesel.mob.nonco2', group: 'combustibili', label: 'Motori diesel stradali, CH₄ e N₂O', value: 0.042, unit: 'kg CO₂e/l', source: 'IPCC 2006, vol. 2, tab. 3.2.2 (CH₄ 3,9 kg/TJ, N₂O 3,9 kg/TJ)', year: 2006, status: 'verificato', kind: 'parametro', note: 'Si usa solo con fattori di sola CO₂ (es. HVO, la cui CO₂ è biogenica).' },
    { id: 'hvo.co2', group: 'combustibili', label: 'HVO 100, CO₂ fossile', value: 0, unit: 'kg CO₂/l', source: 'GHG Protocol: CO₂ dei biocarburanti fuori dagli scope', year: 2025, status: 'verificato', kind: 'parametro' },
    { id: 'hvo.bio', group: 'combustibili', label: 'HVO 100, CO₂ biogenica (fuori dagli scope)', value: 2.5, unit: 'kg CO₂/l', source: 'Regola GHG Protocol sulla CO₂ biogenica (valore indicativo)', year: 2025, status: 'da verificare', kind: 'parametro' },
    { id: 'hvo.ncv', group: 'combustibili', label: 'HVO 100, potere calorifico inferiore', value: 9.53, unit: 'kWh/l', source: 'Valore tipico (44 MJ/kg × 0,78 kg/l)', year: 2025, status: 'da verificare', kind: 'parametro' },
    { id: 'benzina.co2e', group: 'combustibili', label: 'Benzina (100% minerale), combustione', value: 2.34, unit: 'kg CO₂e/l', source: 'DEFRA 2025, benzina 100% minerale', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'benzina.ncv', group: 'combustibili', label: 'Benzina, potere calorifico inferiore', value: 8.94, unit: 'kWh/l', source: 'IPCC 2006, vol. 2 (44,3 MJ/kg × 0,745 kg/l)', year: 2006, status: 'verificato', kind: 'parametro' },
    { id: 'biomassa.nonco2', group: 'combustibili', label: 'Biomassa legnosa, CH₄ e N₂O', value: 0.033, unit: 'kg CO₂e/kg', source: 'IPCC 2006, vol. 2, tab. 2.3 (CH₄ 30 kg/TJ, N₂O 4 kg/TJ; 17 MJ/kg)', year: 2006, status: 'da verificare', kind: 'parametro' },
    { id: 'biomassa.bio', group: 'combustibili', label: 'Biomassa legnosa, CO₂ biogenica (fuori dagli scope)', value: 1.9, unit: 'kg CO₂/kg', source: 'IPCC 2006, vol. 2 (112 t CO₂/TJ × 17 MJ/kg)', year: 2006, status: 'da verificare', kind: 'parametro' },
    { id: 'biomassa.ncv', group: 'combustibili', label: 'Biomassa legnosa, potere calorifico inferiore', value: 4.72, unit: 'kWh/kg', source: 'Valore tipico del pellet di legno (17 MJ/kg)', year: 2025, status: 'da verificare', kind: 'parametro' },
    { id: 'biometano.nonco2', group: 'combustibili', label: 'Biometano, CH₄ e N₂O da combustione', value: 0.0019, unit: 'kg CO₂e/Sm³', source: 'Come il gas naturale (IPCC 2006, tab. 2.3)', year: 2006, status: 'da verificare', kind: 'parametro' },
    { id: 'biometano.bio', group: 'combustibili', label: 'Biometano, CO₂ biogenica (fuori dagli scope)', value: 1.975, unit: 'kg CO₂/Sm³', source: 'Stesso carbonio del gas naturale, di origine biogenica', year: 2025, status: 'da verificare', kind: 'parametro' },

    /* ---------- combustibili a monte e perdite di rete (Scope 3, categoria 3) ---------- */
    { id: 'wtt.diesel', group: 'wtt', label: 'Gasolio, dal pozzo al serbatoio', value: 0.61, unit: 'kg CO₂e/l', source: 'DEFRA 2025, fattori WTT', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'wtt.gpl', group: 'wtt', label: 'GPL, dal pozzo al serbatoio', value: 0.19, unit: 'kg CO₂e/l', source: 'DEFRA 2025, fattori WTT (0,51 kg/l)', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'wtt.gas', group: 'wtt', label: 'Gas naturale, dal pozzo al contatore', value: 0.34, unit: 'kg CO₂e/Sm³', source: 'DEFRA 2025, fattori WTT', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'wtt.benzina', group: 'wtt', label: 'Benzina, dal pozzo al serbatoio', value: 0.61, unit: 'kg CO₂e/l', source: 'Stima prudente FeedOS (da sostituire con il valore DEFRA dell’anno)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'wtt.hvo', group: 'wtt', label: 'HVO 100, filiera a monte', value: 0.36, unit: 'kg CO₂e/l', source: 'Stima prudente FeedOS (da sostituire con il valore del fornitore o DEFRA)', year: 2025, status: 'da verificare', kind: 'stima' },

    /* ---------- trasporti (Scope 3, categorie 4 e 9): dal pozzo alla ruota ---------- */
    { id: 'tr.camion', group: 'trasporti', label: 'Autoarticolato, carico medio', value: 0.105, unit: 'kg CO₂e/t·km', source: 'DEFRA 2025, trasporto merci su strada (i valori GLEC sono riservati ai membri)', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'tr.nave', group: 'trasporti', label: 'Nave portarinfuse', value: 0.006, unit: 'kg CO₂e/t·km', source: 'Valore di tipo GLEC (letteratura di settore)', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'tr.treno', group: 'trasporti', label: 'Treno merci (UE)', value: 0.025, unit: 'kg CO₂e/t·km', source: 'Valore di tipo GLEC (letteratura di settore)', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'tr.chiatta', group: 'trasporti', label: 'Chiatta fluviale', value: 0.03, unit: 'kg CO₂e/t·km', source: 'Valore di tipo GLEC (letteratura di settore)', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'tr.auto', group: 'trasporti', label: 'Auto media (viaggi e pendolarismo)', value: 0.17, unit: 'kg CO₂e/km', source: 'Stima prudente FeedOS (ordine di grandezza DEFRA, auto media)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'tr.aereo', group: 'trasporti', label: 'Aereo, tratta media', value: 0.15, unit: 'kg CO₂e/pkm', source: 'Stima prudente FeedOS (ordine di grandezza DEFRA, voli di linea)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'tr.treno.pax', group: 'trasporti', label: 'Treno passeggeri', value: 0.035, unit: 'kg CO₂e/pkm', source: 'Stima prudente FeedOS', year: 2025, status: 'da verificare', kind: 'stima' },

    /* ---------- rifiuti (categoria 5) e fine vita degli imballaggi venduti (categoria 12) ---------- */
    { id: 'rf.discarica', group: 'rifiuti', label: 'Rifiuti in discarica', value: 0.5, unit: 'kg CO₂e/kg', source: 'DEFRA 2025, smaltimento dei rifiuti', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'rf.riciclo', group: 'rifiuti', label: 'Rifiuti a riciclo', value: 0.02, unit: 'kg CO₂e/kg', source: 'DEFRA 2025, smaltimento dei rifiuti', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'rf.termo', group: 'rifiuti', label: 'Rifiuti a recupero energetico', value: 0.02, unit: 'kg CO₂e/kg', source: 'DEFRA 2025, smaltimento dei rifiuti', year: 2025, status: 'da verificare', kind: 'annuale' },
    { id: 'eol.imballaggi', group: 'rifiuti', label: 'Fine vita degli imballaggi venduti (scenario medio)', value: 0.068, unit: 'kg CO₂e/kg', source: 'Scenario FeedOS: 70% riciclo, 20% recupero energetico, 10% discarica con i fattori DEFRA 2025', year: 2025, status: 'da verificare', kind: 'stima' },

    /* ---------- imballaggi acquistati (categoria 1) ---------- */
    { id: 'pk.carta', group: 'imballaggi', label: 'Sacco di carta multistrato', value: 1.1, unit: 'kg CO₂e/kg', source: 'Letteratura di settore (valore indicativo)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'pk.pe', group: 'imballaggi', label: 'Film o sacco in polietilene', value: 2.5, unit: 'kg CO₂e/kg', source: 'Letteratura di settore (valore indicativo)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'pk.sacco.kgt', group: 'imballaggi', label: 'Imballaggio dei prodotti in sacchi (di base)', value: 5.6, unit: 'kg/t', source: 'Stima FeedOS: sacco da 25 kg di circa 0,14 kg, 40 sacchi per tonnellata', year: 2025, status: 'da verificare', kind: 'stima', sectors: ['mangimi'],
      note: 'Si usa per i prodotti in sacchi finché il registro degli imballaggi per articolo non ha il peso reale.' },

    /* ---------- acquisti a valore (categorie 1 e 2) ---------- */
    { id: 'sp.consumabili', group: 'spesa', label: 'Materiali di consumo, ricambi e servizi tecnici', value: 0.35, unit: 'kg CO₂e/€', source: 'Stima prudente FeedOS su fattori input-output (da sostituire con una banca dati EEIO)', year: 2025, status: 'da verificare', kind: 'stima' },
    { id: 'sp.capex', group: 'spesa', label: 'Beni strumentali (impianti, mezzi, edifici)', value: 0.4, unit: 'kg CO₂e/€', source: 'Stima prudente FeedOS su fattori input-output (da sostituire con una banca dati EEIO)', year: 2025, status: 'da verificare', kind: 'stima' },

    /* ---------- potenziali di riscaldamento globale (AR6, 100 anni) ---------- */
    { id: 'gwp.co2', group: 'gwp', label: 'GWP a 100 anni della CO₂', value: 1, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'gwp.ch4', group: 'gwp', label: 'GWP a 100 anni del metano', value: 27.9, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'gwp.ch4.fossil', group: 'gwp', label: 'GWP a 100 anni del metano fossile', value: 29.8, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'gwp.n2o', group: 'gwp', label: 'GWP a 100 anni del protossido di azoto', value: 273, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },

    /* ---------- refrigeranti (GWP AR6 a 100 anni; miscele dalla composizione) ---------- */
    { id: 'ref.R-32', group: 'refrigeranti', gas: 'R-32', label: 'R-32 (HFC-32)', value: 771, unit: 'kg CO₂e/kg', source: 'IPCC AR6 WG1, cap. 7, materiale supplementare', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-125', group: 'refrigeranti', gas: 'R-125', label: 'R-125 (HFC-125)', value: 3740, unit: 'kg CO₂e/kg', source: 'IPCC AR6 WG1, cap. 7, materiale supplementare', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-134a', group: 'refrigeranti', gas: 'R-134a', label: 'R-134a (HFC-134a)', value: 1530, unit: 'kg CO₂e/kg', source: 'IPCC AR6 WG1, cap. 7, materiale supplementare', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-143a', group: 'refrigeranti', gas: 'R-143a', label: 'R-143a (HFC-143a)', value: 5810, unit: 'kg CO₂e/kg', source: 'IPCC AR6 WG1, cap. 7, materiale supplementare', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-1234yf', group: 'refrigeranti', gas: 'R-1234yf', label: 'R-1234yf (HFO)', value: 0.501, unit: 'kg CO₂e/kg', source: 'IPCC AR6 WG1, cap. 7, materiale supplementare', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-410A', group: 'refrigeranti', gas: 'R-410A', label: 'R-410A (R-32 50%, R-125 50%)', value: 2256, unit: 'kg CO₂e/kg', source: 'Calcolato dalla composizione con i GWP AR6', year: 2021, status: 'verificato', kind: 'parametro', comp: [['R-32', 0.5], ['R-125', 0.5]] },
    { id: 'ref.R-404A', group: 'refrigeranti', gas: 'R-404A', label: 'R-404A (R-125 44%, R-143a 52%, R-134a 4%)', value: 4728, unit: 'kg CO₂e/kg', source: 'Calcolato dalla composizione con i GWP AR6', year: 2021, status: 'verificato', kind: 'parametro', comp: [['R-125', 0.44], ['R-143a', 0.52], ['R-134a', 0.04]] },
    { id: 'ref.R-407C', group: 'refrigeranti', gas: 'R-407C', label: 'R-407C (R-32 23%, R-125 25%, R-134a 52%)', value: 1908, unit: 'kg CO₂e/kg', source: 'Calcolato dalla composizione con i GWP AR6', year: 2021, status: 'verificato', kind: 'parametro', comp: [['R-32', 0.23], ['R-125', 0.25], ['R-134a', 0.52]] },
    { id: 'ref.R-449A', group: 'refrigeranti', gas: 'R-449A', label: 'R-449A (R-32 24,3%, R-125 24,7%, R-1234yf 25,3%, R-134a 25,7%)', value: 1504, unit: 'kg CO₂e/kg', source: 'Calcolato dalla composizione con i GWP AR6', year: 2021, status: 'verificato', kind: 'parametro', comp: [['R-32', 0.243], ['R-125', 0.247], ['R-1234yf', 0.253], ['R-134a', 0.257]] },
    { id: 'ref.R-744', group: 'refrigeranti', gas: 'R-744', label: 'R-744 (anidride carbonica)', value: 1, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-290', group: 'refrigeranti', gas: 'R-290', label: 'R-290 (propano)', value: 0.02, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },
    { id: 'ref.R-717', group: 'refrigeranti', gas: 'R-717', label: 'R-717 (ammoniaca)', value: 0, unit: 'kg CO₂e/kg', source: 'IPCC AR6', year: 2021, status: 'verificato', kind: 'parametro' },

    /* ---------- quota FLAG e uso del suolo delle materie prime: stime per categoria (settore mangimi) ----------
     * Si usano solo quando il registro dei fattori delle materie prime non dà le componenti LUC e gestione del suolo. */
    { id: 'flag.cereale', group: 'flag', label: 'Quota FLAG · cereali', value: 0.45, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.proteico.extra', group: 'flag', label: 'Quota FLAG · farine proteiche extra-UE (con cambio d’uso del suolo)', value: 0.85, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.proteico.certificato', group: 'flag', label: 'Quota FLAG · farine proteiche certificate senza deforestazione', value: 0.5, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.proteico', group: 'flag', label: 'Quota FLAG · farine proteiche UE e nazionali', value: 0.55, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.coprodotto', group: 'flag', label: 'Quota FLAG · coprodotti', value: 0.4, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.foraggio', group: 'flag', label: 'Quota FLAG · foraggi disidratati', value: 0.35, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.grasso.extra', group: 'flag', label: 'Quota FLAG · grassi e oli extra-UE', value: 0.8, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.grasso', group: 'flag', label: 'Quota FLAG · grassi e oli UE e nazionali', value: 0.6, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (in attesa dei fattori con componenti LUC e gestione del suolo)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.minerale', group: 'flag', label: 'Quota FLAG · minerali', value: 0, unit: 'quota del fattore', source: 'Origine non agricola', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.aminoacido', group: 'flag', label: 'Quota FLAG · amminoacidi di fermentazione', value: 0.15, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (substrati zuccherini)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.premix', group: 'flag', label: 'Quota FLAG · premiscele e additivi', value: 0.05, unit: 'quota del fattore', source: 'Stima FeedOS per categoria (veicolanti agricoli)', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'flag.altro', group: 'flag', label: 'Quota FLAG · altre materie prime agricole', value: 0.5, unit: 'quota del fattore', source: 'Stima FeedOS per categoria', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.cereale', group: 'suolo', label: 'Occupazione di suolo · cereali', value: 1.4, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.proteico.extra', group: 'suolo', label: 'Occupazione di suolo · farine proteiche extra-UE', value: 2.6, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.proteico', group: 'suolo', label: 'Occupazione di suolo · farine proteiche UE e nazionali', value: 1.8, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.coprodotto', group: 'suolo', label: 'Occupazione di suolo · coprodotti', value: 0.6, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.foraggio', group: 'suolo', label: 'Occupazione di suolo · foraggi', value: 1.1, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.grasso.extra', group: 'suolo', label: 'Occupazione di suolo · grassi e oli extra-UE', value: 3, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.grasso', group: 'suolo', label: 'Occupazione di suolo · grassi e oli UE e nazionali', value: 2.4, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.minerale', group: 'suolo', label: 'Occupazione di suolo · minerali', value: 0, unit: 'm²·anno/kg', source: 'Origine non agricola', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.aminoacido', group: 'suolo', label: 'Occupazione di suolo · amminoacidi', value: 0.3, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.premix', group: 'suolo', label: 'Occupazione di suolo · premiscele', value: 0.1, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
    { id: 'land.altro', group: 'suolo', label: 'Occupazione di suolo · altre materie prime agricole', value: 1, unit: 'm²·anno/kg', source: 'Stima FeedOS da rese medie indicative', year: 2026, status: 'da verificare', kind: 'stima', sectors: ['mangimi'] },
  ],
};

/** Gruppi del registro dei fattori, nell'ordine della pagina. */
export const CLIMA_FACTOR_GROUPS = [
  ['elettricita', 'Elettricità'], ['combustibili', 'Combustibili'], ['wtt', 'Filiera dei combustibili (cat. 3)'], ['trasporti', 'Trasporti'], ['rifiuti', 'Rifiuti e fine vita'],
  ['imballaggi', 'Imballaggi'], ['spesa', 'Acquisti a valore'], ['gwp', 'Potenziali di riscaldamento'], ['refrigeranti', 'Refrigeranti'], ['flag', 'Quota FLAG (stime)'], ['suolo', 'Uso del suolo (stime)'],
];

/**
 * Screening delle 15 categorie dello Scope 3 (GHG Protocol): rilevanza di base e motivazione. Le voci con sectors valgono per
 * quel settore; per gli altri settori resta la motivazione generica (text). L'utente cambia rilevanza e motivazione.
 * status: 'calcolata' | 'stimata' | 'non-rilevante' | 'non-applicabile' | 'esclusa'
 */
export const SCOPE3_SCREENING = [
  { cat: 1, label: 'Beni e servizi acquistati', status: 'calcolata', text: 'Materie prime acquistate (tonnellate × fattore della materia prima), imballaggi e materiali di consumo. È la categoria principale.' },
  { cat: 2, label: 'Beni strumentali', status: 'non-rilevante', text: 'Impianti, mezzi ed edifici: di norma meno dell’1% del totale. Si stima a valore quando si registrano gli investimenti dell’anno.' },
  { cat: 3, label: 'Combustibili ed energia (a monte)', status: 'calcolata', text: 'Filiera dei combustibili usati (dal pozzo al serbatoio) e perdite di rete dell’elettricità acquistata.' },
  { cat: 4, label: 'Trasporto e distribuzione a monte', status: 'calcolata', text: 'Trasporti in ingresso non compresi nel fattore della materia prima e consegne ai clienti fatte da vettori pagati dall’azienda.' },
  { cat: 5, label: 'Rifiuti prodotti', status: 'calcolata', text: 'Rifiuti del registro per destinazione (riciclo, recupero energetico, discarica).' },
  { cat: 6, label: 'Viaggi di lavoro', status: 'non-rilevante', text: 'Pochi viaggi, sotto lo 0,5% del totale: si stimano dai chilometri quando servono.' },
  { cat: 7, label: 'Pendolarismo dei dipendenti', status: 'non-rilevante', text: 'Sotto lo 0,5% del totale: si stima dai chilometri casa-lavoro quando serve.' },
  { cat: 8, label: 'Beni in leasing a monte', status: 'non-applicabile', text: 'Beni in leasing già compresi negli Scope 1 e 2 (controllo operativo).' },
  { cat: 9, label: 'Trasporto e distribuzione a valle', status: 'calcolata', text: 'Ritiri fatti dai clienti con mezzi propri: tonnellate × distanza stradale × fattore del camion.' },
  { cat: 10, label: 'Lavorazione dei prodotti venduti', status: 'non-applicabile', text: 'I prodotti venduti non subiscono altre lavorazioni significative.',
    bySector: { mangimi: 'Mangimi completi pronti all’uso: nessuna lavorazione a valle (la miscelazione in azienda di eventuali complementari è trascurabile).', agrofarmaci: 'Da valutare: formulazione o confezionamento presso terzi dei prodotti venduti.' } },
  { cat: 11, label: 'Uso dei prodotti venduti', status: 'esclusa', text: 'Nessuna emissione diretta durante l’uso dei prodotti venduti.',
    bySector: { mangimi: 'Le emissioni enteriche degli animali sono Scope 1 degli allevatori: per il mangimificio sono emissioni indirette e facoltative, escluse dal totale (eventuale stima solo informativa).', agrofarmaci: 'Da valutare: emissioni durante l’applicazione dei prodotti (indirette, facoltative).' } },
  { cat: 12, label: 'Fine vita dei prodotti venduti', status: 'calcolata', text: 'Imballaggi venduti con i prodotti (sacchi, film): peso × fattore di fine vita.' },
  { cat: 13, label: 'Beni in leasing a valle', status: 'non-applicabile', text: 'Nessun bene dato in leasing a terzi.' },
  { cat: 14, label: 'Franchising', status: 'non-applicabile', text: 'Nessun punto vendita in franchising.' },
  { cat: 15, label: 'Investimenti', status: 'non-applicabile', text: 'Nessuna partecipazione rilevante da consolidare.' },
];
