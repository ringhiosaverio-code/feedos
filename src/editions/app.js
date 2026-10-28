/* Edizione corrente (parti dell'app): dati dimostrativi, pagine e schede in più, presentazione guidata.
 * Senza la build vale l'edizione mangimi; la build agrofarmaci lo sostituisce con editions/agrofarmaci/app.js. */
export { demoData, upgradeDemo, starterData } from '../data/demo/index.js';
/** Pagine di aree in più: { areaId: Component({route}) }. */
export const PAGES = {};
/** Schede in più dentro aree esistenti: { 'area.tab': Component({d, route}) } (la testata la disegna il guscio). */
export const TAB_PAGES = {};
/** Passi della presentazione guidata (null = quelli di base in app/Tour.jsx). */
export const TOUR_STEPS = null;
