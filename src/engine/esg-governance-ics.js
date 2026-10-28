/* FeedOS 18 · Governance ed evidenze (WP6): esportazione del calendario degli adempimenti in formato iCalendar (RFC 5545),
 * importabile in Outlook, Google Calendar e Apple Calendar. Eventi di un giorno intero (DTSTART;VALUE=DATE e DTEND il giorno
 * dopo), UID stabile ricavato dalla chiave della scadenza (una nuova importazione aggiorna invece di duplicare), righe chiuse da
 * CRLF e piegate a 75 ottetti UTF-8 senza spezzare un carattere, testo con «\», «;», «,» e a capo protetti (§3.3.11).
 * Promemoria (VALARM) 7 giorni prima. DTSTAMP fisso sulla data passata (stesso calendario → stesso file). Funzioni pure. */

import { addDays } from '../core/util.js';

/** Ottetti UTF-8 di un carattere (punto di codice). */
const bytesOf = ch => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };

/** Testo protetto per le proprietà TEXT: \ → \\, ; → \;, , → \,, a capo → \n. */
export function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Piega una riga logica in righe fisiche di al massimo 75 ottetti (le successive iniziano con uno spazio). */
export function icsFold(line) {
  const out = [];
  let cur = '', n = 0, limit = 75;
  for (const ch of String(line)) {
    const b = bytesOf(ch);
    if (n + b > limit) { out.push(cur); cur = ' '; n = 1; limit = 75; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** Riapre le righe piegate (per le prove e per rileggere un file). */
export function icsUnfold(text) { return String(text).replace(/\r\n[ \t]/g, ''); }

const ymd = s => String(s).slice(0, 10).replace(/-/g, '');
const nextDay = s => ymd(addDays(String(s).slice(0, 10), 1));
/** UID stabile: caratteri sicuri della chiave + dominio fisso. */
export const icsUid = (key, domain = 'feedos.local') => `${String(key || 'voce').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'voce'}@${domain}`;
const KIND = { scadenza: 'Scadenza', rinnovo: 'Rinnovo', controllo: 'Controllo', traguardo: 'Traguardo' };

/**
 * Calendario iCalendar: items = scadenze {key, date, title, kind?, law?, source?, validAsOf?, owner?, note?, pkgLabel?, url?}.
 * opts: {name, stamp: 'AAAA-MM-GG' (DTSTAMP), alarmDays (di base 7; 0 = nessun promemoria), product, domain}. → testo con CRLF.
 */
export function icsExport(items, opts = {}) {
  const stamp = /^\d{4}-\d{2}-\d{2}/.test(String(opts.stamp || '')) ? `${ymd(opts.stamp)}T000000Z` : '19700101T000000Z';
  const alarm = Number.isFinite(+opts.alarmDays) ? Math.max(0, Math.round(+opts.alarmDays)) : 7;
  const product = String(opts.product || 'FeedOS').replace(/[^A-Za-z0-9 ._-]/g, '');
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${product}//Calendario degli adempimenti ESG//IT`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.name || 'Adempimenti ESG')}`, 'X-WR-TIMEZONE:Europe/Rome',
  ];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !/^\d{4}-\d{2}-\d{2}/.test(String(it.date || ''))) continue;
    const uid = icsUid(it.key || `${it.date}-${it.title}`, opts.domain);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const desc = [it.what, it.law && `Norma: ${it.law}`, it.owner && `Responsabile: ${it.owner}`, it.source && `Fonte: ${it.source}`, it.validAsOf && `Valido al: ${it.validAsOf.split('-').reverse().join('/')}`,
      it.status === 'da verificare' && 'Stato: da verificare', it.note, it.pkgLabel && `Scheda: ${it.pkgLabel}`].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(it.date)}`, `DTEND;VALUE=DATE:${nextDay(it.date)}`,
      `SUMMARY:${icsEscape(it.title || 'Scadenza')}`);
    if (desc) L.push(`DESCRIPTION:${icsEscape(desc)}`);
    L.push(`CATEGORIES:${icsEscape(KIND[it.kind] || 'Scadenza')}`, 'TRANSP:TRANSPARENT', 'STATUS:CONFIRMED');
    if (alarm > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(it.title || 'Scadenza')}`, `TRIGGER:-P${alarm}D`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
