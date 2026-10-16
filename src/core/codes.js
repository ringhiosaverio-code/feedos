/* FeedOS 17 · numerazione dei documenti: OF offerte, OA ordini d'acquisto, RC reclami, FT fatture.
 * Un contatore per prefisso e anno in settings.counters ('OF-2026'): un numero cancellato non torna mai in uso. */
import { todayLocal } from './util.js';

/** Raccolta in cui cercare i codici già usati per ogni prefisso. */
export const CODE_COLLS = Object.freeze({ OF: 'offers', OA: 'purchases', RC: 'complaints', FT: 'invoices' });

const RX = /^([A-Z]{2,3})-(\d{2})(?:-(\d+)|(\d{2,}))$/;
/** Legge un codice: 'OF-26-112' → {prefix: 'OF', yy: '26', n: 112}; formato storico 'OA-2601' → {prefix: 'OA', yy: '26', n: 1}. */
export function parseCode(code) {
  const m = RX.exec(String(code ?? '').trim());
  return m ? { prefix: m[1], yy: m[2], n: Number(m[3] ?? m[4]) } : null;
}

const fmt = (prefix, yy, n) => `${prefix}-${yy}-${String(n).padStart(3, '0')}`;
const counterOp = (key, n) => ({ kind: 'settings', value: st => ({ ...st, counters: { ...(st.counters || {}), [key]: Math.max(+(st.counters?.[key]) || 0, n) } }) });

/**
 * Prossimo codice libero dell'anno della data: {code: 'OF-26-001', n, key: 'OF-2026', op}.
 * Il numero parte dal massimo tra contatore e codici esistenti di quell'anno; op (impostazioni) va nello stesso store.batch.
 */
export function nextCode(d, prefix, date, coll = CODE_COLLS[prefix]) {
  const yyyy = String(date || todayLocal()).slice(0, 4), yy = yyyy.slice(2), key = `${prefix}-${yyyy}`;
  let max = +(d?.settings?.counters?.[key]) || 0;
  // le fatture portano il numero in «number» (FT-26-001), gli altri documenti in «code»
  for (const x of (coll && d?.[coll]) || []) { const c = parseCode(x?.code ?? x?.number); if (c && c.prefix === prefix && c.yy === yy && c.n > max) max = c.n; }
  const n = max + 1;
  return { code: fmt(prefix, yy, n), n, key, op: counterOp(key, n) };
}

/** count codici consecutivi (importazioni, fatturazione di fine mese): {codes, op}. */
export function nextCodes(d, prefix, count, date, coll) {
  const f = nextCode(d, prefix, date, coll), yy = f.key.slice(-2);
  const codes = Array.from({ length: Math.max(0, count) }, (_, i) => fmt(prefix, yy, f.n + i));
  return { codes, op: counterOp(f.key, f.n + Math.max(0, count) - 1) };
}
