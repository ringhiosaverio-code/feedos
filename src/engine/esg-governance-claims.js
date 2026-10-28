/* FeedOS 18 · Governance ed evidenze (WP6): controllo delle dichiarazioni ambientali (claim) secondo le regole contro il
 * greenwashing (D.Lgs. 30/2026 che recepisce la dir. (UE) 2024/825, in vigore dal 27/09/2026; tra imprese D.Lgs. 145/2007).
 * Regole, in ordine: neutralità basata su compensazioni (sempre bloccata, anche con evidenze), asserzioni generiche senza
 * eccellenza riconosciuta, marchi di sostenibilità fai-da-te, impegni futuri (ammessi solo con un piano verificato),
 * «senza deforestazione / DCF» (nei mangimi solo con il registro DCF della filiera non negativo), «conforme EUDR» o norme
 * citate senza verifica di terzi, confronti e percentuali (stesso metodo e periodo dichiarati), riciclabilità e biodegradabilità.
 * Testo normalizzato: minuscole, senza accenti, CO₂ = CO2, trattini e spazi indifferenti nelle parole composte («eco-sostenibile»).
 * Una frase negativa («non è carbon neutral») non è una dichiarazione vietata ma resta da rivedere.
 * Esito: 'bloccata' (blocco o rilievo alto), 'da rivedere' (rilievo medio), 'ammessa' (solo note o condizioni). ok = ammessa.
 * Funzione pura, nessuna eccezione: un testo vuoto è ammesso senza rilievi. */
import { dcfClaimCheck } from './esg-filiera.js';
import * as PIANO from './esg-piano.js';
import { sectorOf, esgToday } from './esg-years.js';

const ECGT = 'D.Lgs. 30/2026 (dir. (UE) 2024/825), Codice del consumo artt. 21-23';
const B2B = 'D.Lgs. 145/2007 (pubblicità ingannevole tra imprese)';
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

/** Testo per il confronto: minuscole, senza accenti, CO₂ → co2, apostrofi uniformi, spazi singoli. */
export function normClaim(text) {
  return String(text ?? '')
    .replace(/CO\s?₂/gi, 'co2').replace(/₂/g, '2')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’‘`´]/g, "'").replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
}

/* Le parole composte si scrivono attaccate, con il trattino o con lo spazio: «eco-?\s?» copre tutte e tre le forme. */
const J = "[-\\s]?";
const RULES = [
  // neutralità e compensazioni: sempre bloccate
  { id: 'compensazione', severity: 'blocco', re: new RegExp(`\\b(carbon${J}neutral\\w*|climate${J}neutral\\w*|co2${J}neutr\\w*|carbonio${J}neutr\\w*|neutral\\w*${J}(climatic\\w*|carbonica|in carbonio|per il clima|rispetto al clima)|(a|ad)?${J}impatto${J}(ambientale${J})?zero|zero${J}impatt\\w*|zero${J}(co2${J})?emission\\w*|emission\\w*${J}zero|climate${J}positive|carbon${J}(positive|negative)|compensat[aoie]\\w*|compensazion\\w*|offset\\w*|net${J}zero|zero${J}emissioni${J}nette|emissioni${J}nette${J}zero)\\b`, 'g'),
    msg: 'Neutralità, impatto zero o compensazione delle emissioni: vietata se si basa su crediti o compensazioni, anche documentati.', need: 'Nessuna evidenza la rende ammissibile: togliere la dichiarazione o descrivere solo le riduzioni effettive misurate.' },
  // asserzioni ambientali generiche
  { id: 'generica', severity: 'alto', re: new RegExp(`\\b(green|eco${J}(friendly|sostenibil\\w*|compatibil\\w*|logic\\w*)|eco|ecologic\\w*|sostenibil[ei]|sustainable|environmentally${J}friendly|climate${J}friendly|rispettos\\w*${J}dell'?${J}ambiente|amic\\w*${J}dell'?${J}ambiente|eco${J}consapevol\\w*|a${J}basso${J}impatto${J}ambientale|(prodotto|mangime|formula|confezione|imballo|scelta)${J}verde|piu${J}verde)\\b`, 'g'),
    msg: 'Asserzione ambientale generica: vietata senza un’eccellenza ambientale riconosciuta (Ecolabel UE o marchio ufficiale equivalente) per il prodotto intero.', need: 'Certificato Ecolabel UE o marchio di tipo I (EN ISO 14024), oppure sostituire con un dato preciso e verificabile.' },
  { id: 'naturale', severity: 'medio', re: /\b(naturale|naturali|natural|100% natural\w*)\b/g,
    msg: '«Naturale» letto come vantaggio ambientale: chiarire che descrive la composizione, non un minore impatto.', need: 'Scheda di composizione del prodotto.' },
  { id: 'marchio', severity: 'alto', re: new RegExp(`\\b(marchio${J}(verde|green|ecologico|di sostenibilita)|bollino${J}(verde|green|eco\\w*)|etichetta${J}ecologica|label${J}(green|eco))\\b`, 'g'),
    msg: 'Marchio di sostenibilità: ammesso solo se basato su uno schema di certificazione o istituito da un’autorità pubblica.', need: 'Certificato dello schema di certificazione.' },
  { id: 'eudr', severity: 'alto', re: new RegExp(`\\b(conform\\w*${J}(alla${J})?eudr|eudr${J}(compliant|conform\\w*)|eudr${J}free)\\b`, 'g'),
    msg: '«Conforme EUDR» riferito al prodotto: il prodotto finito non è nell’allegato I del regolamento, la dichiarazione è fuorviante.', need: 'Riferirsi ai lotti di materia prima con i loro riferimenti DDS, non al prodotto.' },
  { id: 'norma', severity: 'alto', re: new RegExp(`\\b((certificat\\w*|conform\\w*)${J}(iso${J})?14067|iso${J}14067${J}(certificat\\w*|conform\\w*)|pact${J}(conformant|conform\\w*)|conform\\w*${J}pact|sbti${J}(validated|validat\\w*|approv\\w*)|(validat\\w*|approvat\\w*)${J}(da${J})?sbti)\\b`, 'g'),
    msg: 'Conformità a una norma o validazione di terzi dichiarata: serve la verifica dell’ente o il documento di validazione.', need: 'Attestato di verifica di terza parte o lettera di validazione.' },
  { id: 'biodegradabile', severity: 'alto', re: /\b(biodegradabil\w*|compostabil\w*|biodegradable|compostable)\b/g, std: /\b(en ?13432|en ?14995|ok compost|uni en|iso ?17088)\b/,
    msg: 'Biodegradabile o compostabile senza la norma di riferimento.', need: 'Certificato secondo EN 13432 o equivalente, con la parte del prodotto a cui si riferisce.' },
  { id: 'riciclabile', severity: 'medio', re: /\b(riciclabil\w*|recyclable|riciclat\w*|recycled)\b/g,
    msg: 'Riciclabile o riciclato: indicare la parte (imballaggio, sacco, tanica) e la quota, non il prodotto intero.', need: 'Dichiarazione del fornitore dell’imballaggio con la percentuale.' },
];
const DCF_RE = new RegExp(`\\b(senza${J}deforestazione|libera${J}da${J}deforestazione|zero${J}deforestazione|deforestation${J}(and${J}conversion${J})?free|senza${J}(deforestazione${J}e${J})?conversione|dcf)\\b`, 'g');
const FUTURE_RE = /\b(entro\s+(?:il\s+)?|by\s+|nel\s+|dal\s+)(20[2-9]\d)\b/;
const FUTURE_TOPIC = /\b(net[-\s]?zero|zero emissioni nette|emissioni nette zero|neutralita climatica|decarbonizz\w*|ridurre|ridurremo|riduzione|dimezz\w*|abbatt\w*|elimin\w*|raggiung\w*|obiettivo|reduce|halve|target)\b/;
const COMPARE_RE = /([-+]?\s?\d+(?:[.,]\d+)?\s?%|\b(riduzione|ridott[aoie]|in meno|meno\s+(co2|emissioni|energia|acqua|rame)|rispetto a\w*|inferiore|piu efficiente|dimezzat\w*|lower|less|reduced|reduction)\b)/;
const CLIMATE_WORD = /\b(co2|co2e|emission\w*|impronta|carbon\w*|ghg|gas serra|clima\w*|energia|acqua|rame|footprint)\b/;
const METHOD_RE = /\b(pefcr\w*|pef\b|iso\s?14067|iso\s?14064|iso\s?14040|iso\s?14044|ghg protocol|lca|metodo|method|gfli)\b/;
const PERIOD_RE = /\b((19|20)\d{2}|versione|anno base|baseline|rispetto (al|alla|ai|alle|a)\b)/;
const NEG_RE = /\b(non|not|mai|never|ne)\s+(\S+\s+){0,2}$/;
const EXCELLENCE_RE = /\b(ecolabel|emas|iso\s?14024|tipo i|type i)\b/;

function findAll(re, s) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s))) { out.push({ term: m[0], index: m.index }); if (m[0] === '') re.lastIndex++; }
  return out;
}
const negated = (s, i) => NEG_RE.test(s.slice(Math.max(0, i - 40), i));

/** Piano di transizione verificato (pacchetto piano quando lo espone; altrimenti impostazioni o ctx). */
function planVerified(d, ctx) {
  if (typeof ctx?.planVerified === 'boolean') return ctx.planVerified;
  try { if (typeof PIANO.planVerified === 'function') return !!PIANO.planVerified(d); } catch { /* il pacchetto piano risponde come può */ }
  return d?.settings?.esg18?.piano?.planVerified === true;
}
/** Le evidenze collegate dimostrano un'eccellenza ambientale riconosciuta (Ecolabel UE, EMAS, tipo I)? */
function hasExcellence(evidence) {
  return (Array.isArray(evidence) ? evidence : []).some(e => isObj(e) && EXCELLENCE_RE.test(normClaim(`${e.title || ''} ${e.issuer || ''} ${e.note || ''}`)));
}

/**
 * Controllo di una dichiarazione: text + ctx {d, evidence: [righe di evidence], lang, kind, planVerified, channel}.
 * → { ok, verdict: 'ammessa'|'da rivedere'|'bloccata', findings: [{id, severity: 'blocco'|'alto'|'medio'|'info', term, msg, need, law}], law, normalized }.
 */
export function checkClaim(text, ctx = {}) {
  const c = isObj(ctx) ? ctx : {};
  const s = normClaim(text);
  const findings = [];
  const add = (id, severity, term, msg, need) => { if (!findings.some(f => f.id === id && f.term === term)) findings.push({ id, severity, term, msg, need, law: id === 'eudr' ? 'Reg. (UE) 2023/1115, allegato I' : `${ECGT}; ${B2B}` }); };
  if (!s) return { ok: true, verdict: 'ammessa', findings, law: ECGT, normalized: s };
  const d = isObj(c.d) ? c.d : null;
  const ev = Array.isArray(c.evidence) ? c.evidence : [];
  const fm = s.match(FUTURE_RE);
  const thisYear = +String(c.today || (d ? esgToday(d) : '2026')).slice(0, 4) || 2026;
  const future = !!fm && +fm[2] >= thisYear && (FUTURE_TOPIC.test(s) || /\d\s?%/.test(s));
  const excellence = hasExcellence(ev);
  for (const r of RULES) {
    for (const h of findAll(r.re, s)) {
      if (r.id === 'biodegradabile' && r.std.test(s)) { add(r.id, 'info', h.term, 'Norma di riferimento indicata: conservare il certificato.', r.need); continue; }
      if (negated(s, h.index)) { add(r.id, 'medio', h.term, `Frase negativa («${h.term}»): non è una dichiarazione vietata, ma va riletta perché non sembri un vanto ambientale.`, 'Rileggere il testo nel contesto.'); continue; }
      if (r.id === 'compensazione' && future && /^(net|zero emissioni nette|emissioni nette)/.test(h.term)) continue; // impegno futuro: regola apposita
      if (r.id === 'generica' && excellence) { add(r.id, 'info', h.term, 'Asserzione generica coperta da un’eccellenza ambientale riconosciuta tra le evidenze.', r.need); continue; }
      add(r.id, r.severity, h.term, r.msg, r.need);
    }
  }
  // impegni futuri: ammessi solo con un piano pubblico, misurabile e verificato da terzi
  if (future) {
    const ok = planVerified(d, c);
    add('futuro', ok ? 'info' : 'alto', fm[0], ok ? 'Impegno futuro coperto da un piano di transizione verificato: citarlo accanto alla dichiarazione.' : 'Impegno futuro senza un piano di attuazione pubblico, misurabile e verificato da un esperto indipendente.',
      'Piano di transizione con obiettivi intermedi e verifica indipendente (scheda Obiettivi e piano).');
  }
  // senza deforestazione: nei mangimi decide il registro DCF della filiera; negli altri settori non si blocca mai su questo
  for (const h of findAll(DCF_RE, s)) {
    if (negated(s, h.index)) continue;
    if (d && sectorOf(d) === 'mangimi') {
      let r = null;
      try { r = dcfClaimCheck(d); } catch { r = null; }
      if (r && r.ok === false) add('dcf', 'alto', h.term, r.reason || 'Registro della soia DCF negativo: dichiarazioni «senza deforestazione» bloccate.', 'Saldo del registro DCF non negativo (scheda EUDR e fornitori).');
      else add('dcf', 'info', h.term, `«${h.term}»: ammessa finché il registro DCF della filiera resta non negativo${r ? ` (saldo ${String(r.balance ?? 0).replace('.', ',')} t)` : ''}; citare schema e catena di custodia.`, 'Certificati dei lotti e registro DCF.');
    } else add('dcf', 'medio', h.term, `«${h.term}»: indicare schema, materia prima e catena di custodia a cui si riferisce, con le evidenze.`, 'Certificati della materia prima interessata.');
    break;
  }
  // confronti e percentuali su clima, energia, acqua: stesso metodo e periodo dichiarati
  if (COMPARE_RE.test(s) && CLIMATE_WORD.test(s)) {
    const term = (s.match(COMPARE_RE) || [''])[0].trim();
    const hasM = METHOD_RE.test(s), hasP = PERIOD_RE.test(s);
    if (hasM && hasP) add('confronto', 'info', term, 'Confronto con metodo e termine di paragone dichiarati: ammesso alle condizioni di usare lo stesso metodo e lo stesso periodo del calcolo conservato (istantanea dell’impronta).', 'Calcolo conservato con metodo, periodo e versione dei fattori.');
    else add('confronto', 'medio', term, `Confronto o percentuale senza ${!hasM && !hasP ? 'metodo e termine di paragone' : !hasM ? 'il metodo di calcolo' : 'il termine di paragone (anno o versione)'}.`, 'Indicare metodo (es. PEFCR, ISO 14067) e periodo o versione di riferimento, con il calcolo tra le evidenze.');
  }
  const rank = { blocco: 3, alto: 2, medio: 1, info: 0 };
  findings.sort((a, b) => rank[b.severity] - rank[a.severity]);
  const top = findings.length ? rank[findings[0].severity] : 0;
  const verdict = top >= 2 ? 'bloccata' : top === 1 ? 'da rivedere' : 'ammessa';
  return { ok: verdict === 'ammessa', verdict, findings, law: ECGT, normalized: s };
}

/** Testo breve dell'esito (per tabelle e segnali). */
export const VERDICT_LABEL = { ammessa: 'ammessa', 'da rivedere': 'da rivedere', bloccata: 'bloccata' };
