/* FeedOS 18 · Dati dimostrativi · Registri ambientali (pacchetto WP9): stub della fondazione 18.
 * Contratto: demoAmbiente(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.ambiente.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde. */
export function demoAmbiente(d, { today, R } = {}) { return {}; }
