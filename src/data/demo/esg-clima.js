/* FeedOS 18 · Dati dimostrativi · Clima e GHG (pacchetto WP1): stub della fondazione 18.
 * Contratto: demoClima(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.clima.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde. */
export function demoClima(d, { today, R } = {}) { return {}; }
