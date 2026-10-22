/* FeedOS 18 · Dati dimostrativi · Rischi climatici (pacchetto WP8): stub della fondazione 18.
 * Contratto: demoRischi(d, { today, R }) → { add?, update?, settings? }, solo aggiunte, idempotente (se i dati ci sono già
 * restituisce {}), deterministico (R = rng del seme + offset, niente orologio); impostazioni solo in settings.esg18.rischi.
 * Dati inventati per il mangimificio dimostrativo di Valle Verde. */
export function demoRischi(d, { today, R } = {}) { return {}; }
