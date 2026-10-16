/* FeedOS 17 · Estensori del mangimificio dimostrativo: ogni pacchetto aggiunge i suoi dati al demo di base.
 * Ogni estensore riceve l'archivio cumulativo (in sola lettura) e {today, R: rng(seme + offset)} e restituisce una patch
 * {add?: {raccolta: righe}, update?: {raccolta: [{id, ...campi}]}, settings?: {chiave: valore}}.
 * Regola: un aggiornamento può solo AGGIUNGERE campi assenti nel record di partenza (eccezione: ingLots.supplier);
 * le righe con un id già presente non si aggiungono; le impostazioni si fondono a un livello per chiave. */
import { rng } from '../../core/util.js';
import { demoCosts } from './costs.js';
import { demoCommerciale } from './commerciale.js';
import { demoAcquisti } from './acquisti.js';
import { demoProduzione } from './produzione.js';
import { demoFinanza } from './finanza.js';
import { demoRedditivita } from './redditivita.js';
import { demoDirezione } from './direzione.js';
import { demoPiattaforma } from './piattaforma.js';

/** [nome, estensore, offset del seme], nell'ordine di esecuzione. */
export const EXTENDERS = [
  ['costs', demoCosts, 101],
  ['commerciale', demoCommerciale, 501],
  ['acquisti', demoAcquisti, 601],
  ['produzione', demoProduzione, 701],
  ['finanza', demoFinanza, 301],
  ['redditivita', demoRedditivita, 401],
  ['direzione', demoDirezione, 201],
  ['piattaforma', demoPiattaforma, 801],
];
/** Campi che un estensore può riscrivere anche se presenti (raccolta → campi). */
export const OVERWRITE_OK = { ingLots: ['supplier'] };

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Violazioni della regola «solo aggiunte» di una patch rispetto all'archivio d.
 * → [testo] (vuoto se la patch è regolare): campi esistenti riscritti, id aggiunti già presenti o ripetuti, aggiornamenti di id sconosciuti.
 */
export function patchViolations(d, patch) {
  const out = [];
  for (const [coll, rows] of Object.entries(patch?.add || {})) {
    if (!Array.isArray(rows)) { out.push(`add.${coll}: non è un elenco`); continue; }
    const ids = new Set((d[coll] || []).map(r => r.id));
    for (const r of rows) {
      if (!isObj(r) || typeof r.id !== 'string') out.push(`add.${coll}: riga senza id`);
      else if (ids.has(r.id)) out.push(`add.${coll}: id già presente ${r.id}`);
      else ids.add(r.id);
    }
  }
  for (const [coll, ups] of Object.entries(patch?.update || {})) {
    const cur = new Map((d[coll] || []).map(r => [r.id, r])), ok = OVERWRITE_OK[coll] || [];
    for (const u of ups || []) {
      const r = cur.get(u?.id);
      if (!r) { out.push(`update.${coll}: id sconosciuto ${u?.id}`); continue; }
      for (const k of Object.keys(u)) if (k !== 'id' && k in r && !ok.includes(k)) out.push(`update.${coll}.${u.id}: campo già presente «${k}»`);
    }
  }
  return out;
}

/** Applica una patch senza toccare d: aggiunge le righe nuove, aggiunge i campi assenti, fonde le impostazioni a un livello. */
export function applyPatch(d, patch) {
  if (!patch) return d;
  const out = { ...d };
  for (const [coll, rows] of Object.entries(patch.add || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;
    const ids = new Set((d[coll] || []).map(r => r.id));
    const fresh = rows.filter(r => isObj(r) && typeof r.id === 'string' && !ids.has(r.id) && ids.add(r.id));
    out[coll] = [...(d[coll] || []), ...fresh];
  }
  for (const [coll, ups] of Object.entries(patch.update || {})) {
    if (!Array.isArray(ups) || !ups.length || !Array.isArray(out[coll])) continue;
    const ok = OVERWRITE_OK[coll] || [];
    const m = new Map(ups.filter(u => u && u.id != null).map(u => [u.id, u]));
    out[coll] = out[coll].map(r => {
      const u = m.get(r.id); if (!u) return r;
      let x = null;
      for (const [k, v] of Object.entries(u)) if (k !== 'id' && (!(k in r) || ok.includes(k))) (x ||= { ...r })[k] = v;
      return x || r;
    });
  }
  if (isObj(patch.settings)) {
    const s = { ...d.settings };
    for (const [k, v] of Object.entries(patch.settings)) s[k] = isObj(v) && isObj(s[k]) ? { ...s[k], ...v } : v;
    out.settings = s;
  }
  return out;
}

/**
 * Applica gli estensori in ordine all'archivio d (alla data today, seme di base seed).
 * Un estensore che si interrompe non ferma il demo: si segnala e si passa al successivo.
 */
export function applyDemoExtenders(d, today = d?.settings?.demoAnchor, seed = 16) {
  let out = d;
  for (const [name, fn, offset] of EXTENDERS) {
    let patch;
    try { patch = fn(out, { today, R: rng(seed + offset) }); } catch (e) { console.warn(`FeedOS: estensore del demo «${name}» non applicato`, e); continue; }
    const bad = patchViolations(out, patch);
    if (bad.length) console.warn(`FeedOS: estensore del demo «${name}»: ${bad.length} modifiche non consentite ignorate`, bad.slice(0, 5));
    out = applyPatch(out, patch);
  }
  return out;
}
