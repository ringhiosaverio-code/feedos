/* FeedOS 18 · Testi bilingui · Persone e sicurezza (pacchetto WP5): scheda esportata in italiano o in inglese per clienti e banche.
 * I18N_PERSONE = { 'persone.chiave': { it, en } } (chiavi con il prefisso «persone.»), unite in src/data/esg-i18n.js. */
const E = (it, en) => ({ it, en });

export const I18N_PERSONE = {
  'persone.md.title': E('Persone e sicurezza', 'People and safety'),
  'persone.md.period': E('Periodo: {label} ({from} – {to}). Dati pseudonimi e aggregati.', 'Period: {label} ({from} – {to}). Pseudonymous, aggregated data.'),
  'persone.md.workforce': E('Organico', 'Workforce'),
  'persone.md.wf': E('Al {date}: {n} dipendenti ({fte} ETP), {f} donne e {m} uomini; {perm} a tempo indeterminato (apprendisti compresi) e {temp} a termine; lavoratori somministrati {agency}; autonomi in esclusiva {self}.', 'At {date}: {n} employees ({fte} FTE), {f} women and {m} men; {perm} permanent (apprentices included) and {temp} temporary; agency workers {agency}; exclusive self-employed {self}.'),
  'persone.md.turnover': E('Turnover {v} (uscite ÷ organico medio).', 'Turnover {v} (leavers ÷ average headcount).'),
  'persone.md.mgmt': E('Donne tra dirigenti e quadri: {share}; rapporto donne/uomini {ratio}.', 'Women among executives and middle managers: {share}; female-to-male ratio {ratio}.'),
  'persone.md.ccnl': E('Dipendenti coperti da contratti collettivi: {pct} ({ccnl}). Retribuzioni pari o superiori ai minimi applicabili: {mw}.', 'Employees covered by collective agreements: {pct} ({ccnl}). Pay at or above the applicable minimum wage: {mw}.'),
  'persone.md.safety': E('Salute e sicurezza', 'Health and safety'),
  'persone.md.hours': E('Ore lavorate dai dipendenti: {h} ({q}).', 'Hours worked by employees: {h} ({q}).'),
  'persone.md.events': E('Infortuni con assenza {lti}; infortuni registrabili {rec}; decessi {fat}; quasi infortuni segnalati {nm}; infortuni in itinere {iti} (fuori dagli indici).', 'Lost-time injuries {lti}; recordable injuries {rec}; fatalities {fat}; near misses reported {nm}; commuting accidents {iti} (outside the rates).'),
  'persone.md.rates': E('Indice di frequenza (UNI 7249, per milione di ore): {if}. Indice di gravità (UNI 7249, per mille ore): {ig}. Tasso del VS B9 (ogni 200.000 ore): {b9}.', 'Frequency rate (UNI 7249, per million hours): {if}. Severity rate (UNI 7249, per thousand hours): {ig}. VS B9 rate (per 200,000 hours): {b9}.'),
  'persone.md.training': E('Formazione', 'Training'),
  'persone.md.training.line': E('{total} ore-persona nel periodo; {per} ore per dipendente (donne {f}, uomini {m}).', '{total} person-hours in the period; {per} hours per employee (women {f}, men {m}).'),
  'persone.md.pay': E('Retribuzioni e parità', 'Pay and gender equality'),
  'persone.md.pay.line': E('Divario retributivo di genere: medio {mean}, mediano {median}, sulla retribuzione annua lorda riportata al tempo pieno ({nf} donne, {nm} uomini).', 'Gender pay gap: mean {mean}, median {median}, on annual gross pay converted to full time ({nf} women, {nm} men).'),
  'persone.md.pay.none': E('Divario retributivo non mostrato: meno di {n} persone in uno dei due gruppi.', 'Gender pay gap not shown: fewer than {n} people in one of the two groups.'),
  'persone.md.suppressed': E('Valori di gruppi con meno di {n} persone non mostrati.', 'Values for groups with fewer than {n} people are not shown.'),
  'persone.md.notShown': E('non mostrato', 'not shown'),
  'persone.md.method': E('Metodo', 'Method'),
  'persone.md.quality': E('qualità: {q}', 'quality: {q}'),
  'persone.yes': E('sì', 'yes'),
  'persone.no': E('no', 'no'),
};
