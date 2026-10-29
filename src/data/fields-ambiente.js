/* FeedOS 18 · Campi e importazioni · Registri ambientali (pacchetto WP9). File senza dipendenze.
 * FIELDS_AMBIENTE = { raccolta: [campi come in core/fields.js] } · COLL_LABEL_AMBIENTE = { raccolta: 'Nome italiano' }.
 * Le analisi dello scarico (liste param, valore, unità, limite) e il dettaglio dei campioni si modificano nelle schede del pacchetto:
 * il campo «analyses» non è un campo semplice, quindi non compare qui. Le registrazioni RENTRI hanno per id quello del movimento
 * del registro dei rifiuti (waste.id), così un movimento ha al più una registrazione. */

const RECEPTORS = ['fognatura', 'corpo idrico', 'suolo'];
const ORIGINS = ['ricevimento', 'macinazione', 'raffreddamento', 'insacco', 'caldaia', 'essiccazione', 'solventi'];
const POLLUTANTS = ['polveri', 'NOx', 'CO', 'COV'];
const AUDIT_TYPES = ['diagnosi 102/2014', 'ISO 50001', 'interno'];

export const FIELDS_AMBIENTE = {
  waterDischarges: [
    { key: 'month', label: 'Mese dello scarico', type: 'month', required: true },
    { key: 'point', label: 'Punto di scarico', type: 'text', required: true, maxLen: 160 },
    { key: 'receptor', label: 'Recettore', type: 'enum', options: RECEPTORS, required: true },
    { key: 'm3', label: 'Volume scaricato (m³)', type: 'number', required: true, min: 0, decimals: 0 },
    { key: 'measured', label: 'Misurato con contatore o misuratore', type: 'bool' },
    { key: 'permitRef', label: 'Autorizzazione allo scarico', type: 'text', maxLen: 160 },
  ],
  wasteRentri: [
    { key: 'carrier', label: 'Trasportatore', type: 'text', maxLen: 160 },
    { key: 'carrierReg', label: 'Iscrizione del trasportatore', type: 'text', maxLen: 60 },
    { key: 'destPlant', label: 'Impianto di destinazione', type: 'text', maxLen: 160 },
    { key: 'destAuth', label: 'Autorizzazione dell’impianto', type: 'text', maxLen: 160 },
    { key: 'registeredAt', label: 'Data di registrazione', type: 'date' },
    { key: 'xfirId', label: 'Identificativo xFIR', type: 'text', maxLen: 60 },
    { key: 'opFinal', label: 'Operazione finale (R1–R12, D1–D14)', type: 'text', maxLen: 8 },
    { key: 'fourthCopyAt', label: 'Data della quarta copia del FIR', type: 'date' },
  ],
  stacks: [
    { key: 'code', label: 'Codice del camino', type: 'text', required: true, maxLen: 12 },
    { key: 'name', label: 'Impianto collegato', type: 'text', maxLen: 160 },
    { key: 'origin', label: 'Origine delle emissioni', type: 'enum', options: ORIGINS, required: true },
    { key: 'pollutant', label: 'Inquinante', type: 'enum', options: POLLUTANTS, required: true },
    { key: 'flowNm3h', label: 'Portata (Nm³/h)', type: 'number', required: true, min: 0, decimals: 0 },
    { key: 'hoursYear', label: 'Ore di funzionamento annue', type: 'number', required: true, min: 0, max: 8760, decimals: 0 },
    { key: 'limitMgNm3', label: 'Limite (mg/Nm³)', type: 'number', required: true, min: 0, decimals: 1 },
    { key: 'freqMonths', label: 'Frequenza dei campionamenti (mesi)', type: 'number', min: 1, max: 60, decimals: 0 },
    { key: 'filter', label: 'Sistema di abbattimento', type: 'text', maxLen: 160 },
    { key: 'permitRef', label: 'Riferimento dell’autorizzazione', type: 'text', maxLen: 160 },
  ],
  stackSamples: [
    { key: 'stackId', label: 'Camino', type: 'ref', ref: 'stacks', required: true },
    { key: 'date', label: 'Data del campionamento', type: 'date', required: true },
    { key: 'valueMgNm3', label: 'Concentrazione (mg/Nm³)', type: 'number', required: true, min: 0, decimals: 2 },
    { key: 'lab', label: 'Laboratorio', type: 'text', maxLen: 160 },
    { key: 'evidenceId', label: 'Evidenza (rapporto di prova)', type: 'text', maxLen: 60 },
  ],
  energyAudits: [
    { key: 'date', label: 'Data dell’audit', type: 'date', required: true },
    { key: 'type', label: 'Tipo di audit', type: 'enum', options: AUDIT_TYPES, required: true },
    { key: 'auditor', label: 'Auditor o ufficio', type: 'text', maxLen: 160 },
    { key: 'measures', label: 'Misure individuate', type: 'text', maxLen: 400 },
    { key: 'nextDue', label: 'Prossima scadenza', type: 'date' },
  ],
};

export const COLL_LABEL_AMBIENTE = {
  waterDischarges: 'Scarichi idrici',
  wasteRentri: 'Registrazioni RENTRI',
  stacks: 'Camini',
  stackSamples: 'Campionamenti ai camini',
  energyAudits: 'Audit energetici',
};
export const IMPORT_TYPES_AMBIENTE = {};
export const IMPORT_DESC_AMBIENTE = {};
