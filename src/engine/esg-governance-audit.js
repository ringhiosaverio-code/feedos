/* FeedOS 18 · Governance ed evidenze (WP6): pacchetto per il revisore (ZIP senza compressione, src/core/zip.js).
 * Contenuto: LEGGIMI, indice delle evidenze, datapoint con provenienza, fattori con versione, versioni dei pacchetti di contenuti,
 * scadenze, politiche, certificati e permessi, dichiarazioni con l'esito del controllo, note metodologiche, chiusura (o istantanea)
 * con impronta SHA-256 del JSON canonico, allegati facoltativi ed elenco delle impronte di tutti i file (formato sha256sum).
 * I dati degli altri pacchetti arrivano già raccolti da chi chiama (registro ESG, clima): questo file non importa i registri.
 * Funzioni pure e deterministiche: la data dei file è quella passata (stesso contenuto → stesso archivio). */
import { toCSV } from '../core/io.js';
import { sha256HexSync, canonicalJson } from '../core/hash.js';
import { zipStore, zipName } from '../core/zip.js';
import { dateIt, nf, slug } from '../core/util.js';
import { T } from './esg-nlg.js';
import { VS_DP } from '../data/vsme-datapoints.js';
import { esgToday } from './esg-years.js';
import { claimsView, evidenceState, policyState, governancePack } from './esg-governance.js';

const A = x => (Array.isArray(x) ? x : []);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const txt = v => (v == null ? '' : Array.isArray(v) ? v.map(txt).join(' · ') : isObj(v) ? Object.entries(v).map(([k, x]) => `${k}: ${txt(x)}`).join(', ') : String(v));

/**
 * File del pacchetto per il revisore: inputs {datapoints: {dpId: datapoint}, calendar: [...], methodNotes: {pkg: {it, en}}, factors: [...],
 * packs: [{pack, version, validAsOf, origin}], closing: riga di esgClosings | null, lang, today, attachments: [{id, name, bytes}]}.
 * → {files: [{name, data}], manifest: [{name, sha256, size}], hash (impronta del manifesto), counts}
 */
export function auditPackFiles(d, P, inputs = {}) {
  const lang = inputs.lang === 'en' ? 'en' : 'it';
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(inputs.today || '')) ? inputs.today : esgToday(d);
  const co = d?.settings?.company || {};
  const dps = isObj(inputs.datapoints) ? inputs.datapoints : {};
  const ev = A(d?.evidence).filter(e => e && e.id);
  const files = [];
  const add = (name, data) => files.push({ name: zipName(name), data: typeof data === 'string' ? data : data });

  // evidenze
  add('evidenze/indice-evidenze.csv', toCSV(ev.map(e => ({ ...e, state: evidenceState(e, today), linkText: A(e.links).map(l => `${l.type}:${l.ref}`).join(' '), att: A(inputs.attachments).some(a => a.id === e.id) ? `allegati/${attachmentName(e)}` : '' })), [
    { label: 'Id', key: 'id' }, { label: 'Titolo', key: 'title' }, { label: 'Tipo', key: 'kind' }, { label: 'Emesso da', key: 'issuer' }, { label: 'Data', key: 'issuedAt' }, { label: 'Scadenza', key: 'expiresAt' },
    { label: 'Stato', key: 'state' }, { label: 'SHA-256', key: 'sha256' }, { label: 'Byte', key: 'size' }, { label: 'Tipo di file', key: 'mime' }, { label: 'Conservazione', key: 'storage' }, { label: 'Percorso', key: 'path' },
    { label: 'Collegamenti', key: 'linkText' }, { label: 'Sostituita da', key: 'supersededBy' }, { label: 'Registrata da', key: 'addedBy' }, { label: 'Registrata il', key: 'addedAt' }, { label: 'File nel pacchetto', key: 'att' },
  ]));
  // datapoint con provenienza
  const dpRows = Object.entries(dps).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([id, x]) => ({ id, label: VS_DP[id]?.label?.[lang] || '', value: txt(x?.value), unit: x?.unit || '', quality: x?.quality || '', source: x?.source || '', method: x?.method || '', note: x?.note || '', evidence: A(x?.evidence).join(' '),
    linked: ev.filter(e => !e.supersededBy && A(e.links).some(l => (l.type === 'datapoint' || l.type === 'vs') && l.ref === id)).map(e => e.id).join(' ') }));
  add('datapoint.csv', toCSV(dpRows, [{ label: 'Datapoint', key: 'id' }, { label: 'Descrizione', key: 'label' }, { label: 'Valore', key: 'value' }, { label: 'Unità', key: 'unit' }, { label: 'Qualità', key: 'quality' },
    { label: 'Fonte', key: 'source' }, { label: 'Metodo', key: 'method' }, { label: 'Nota', key: 'note' }, { label: 'Evidenze del valore', key: 'evidence' }, { label: 'Evidenze collegate', key: 'linked' }]));
  // fattori e pacchetti di contenuti
  add('fattori.csv', toCSV(A(inputs.factors), [{ label: 'Id', key: 'id' }, { label: 'Fattore', key: 'label' }, { label: 'Valore', key: 'value' }, { label: 'Unità', key: 'unit' }, { label: 'Fonte', key: 'source' },
    { label: 'Anno', key: 'year' }, { label: 'Stato', key: 'status' }, { label: 'Modificato dall’azienda', value: r => (r.overridden ? 'sì' : '') }]));
  const gp = governancePack(d);
  const packs = [...A(inputs.packs)];
  if (!packs.some(p => p.pack === 'governance')) packs.push({ pack: 'governance', version: gp.version, validAsOf: gp.validAsOf, origin: gp.origin });
  add('pacchetti-di-contenuti.csv', toCSV(packs, [{ label: 'Pacchetto', key: 'pack' }, { label: 'Versione', key: 'version' }, { label: 'Valido al', key: 'validAsOf' }, { label: 'Origine', key: 'origin' }]));
  // scadenze, politiche, certificati e permessi, dichiarazioni
  add('scadenze.csv', toCSV(A(inputs.calendar), [{ label: 'Data', key: 'date' }, { label: 'Scadenza', key: 'title' }, { label: 'Tipo', key: 'kind' }, { label: 'Scheda', key: 'pkg' }, { label: 'Norma', key: 'law' },
    { label: 'Responsabile', key: 'owner' }, { label: 'Fonte', key: 'source' }, { label: 'Valido al', key: 'validAsOf' }]));
  add('politiche.csv', toCSV(A(d?.policies).map(p => ({ ...p, active: policyState(p, today).active ? 'sì' : 'no', nextReview: policyState(p, today).nextReview || '', coversText: A(p.covers).join(', ') })), [
    { label: 'Titolo', key: 'title' }, { label: 'Tema', key: 'matter' }, { label: 'Tipo', key: 'kind' }, { label: 'Stato', key: 'status' }, { label: 'Attiva', key: 'active' }, { label: 'Pubblica', value: p => (p.public ? 'sì' : 'no') },
    { label: 'Obiettivo', key: 'target' }, { label: 'Approvata il', key: 'approvedAt' }, { label: 'Approvata da', key: 'approver' }, { label: 'Prossimo riesame', key: 'nextReview' }, { label: 'Temi dei diritti umani', key: 'coversText' }, { label: 'Evidenza', key: 'evidenceId' }]));
  add('certificati-e-permessi.csv', toCSV([...A(d?.companyCerts).map(c => ({ tipo: 'certificazione', nome: c.scheme, ente: c.issuer, numero: c.number, dal: c.from, al: c.to, evidenza: c.evidenceId })),
    ...A(d?.permits).map(p => ({ tipo: 'autorizzazione', nome: p.kind, ente: p.authority, numero: p.number, dal: p.from, al: p.to, evidenza: p.evidenceId }))], [
    { label: 'Tipo', key: 'tipo' }, { label: 'Nome', key: 'nome' }, { label: 'Ente o autorità', key: 'ente' }, { label: 'Numero', key: 'numero' }, { label: 'Dal', key: 'dal' }, { label: 'Al', key: 'al' }, { label: 'Evidenza', key: 'evidenza' }]));
  add('dichiarazioni-ambientali.csv', toCSV(claimsView(d), [{ label: 'Testo', key: 'text' }, { label: 'Canale', key: 'channel' }, { label: 'Stato', key: 'status' }, { label: 'Esito del controllo', value: c => c.check.verdict },
    { label: 'Rilievi', value: c => c.check.findings.map(f => `[${f.severity}] ${f.msg}`).join(' | ') }, { label: 'Evidenze', value: c => A(c.evidenceIds).join(' ') }]));
  // note metodologiche
  const notes = isObj(inputs.methodNotes) ? inputs.methodNotes : {};
  add('note-metodologiche.md', [`# ${lang === 'en' ? 'Methodology notes' : 'Note metodologiche'}`, '', ...Object.entries(notes).flatMap(([pkg, m]) => [`## ${pkg}`, '', String((isObj(m) ? m[lang] ?? m.it : m) || ''), '']), `_${T('disclaimer', {}, lang)}_`, ''].join('\n'));
  // chiusura o istantanea
  const closing = isObj(inputs.closing) ? inputs.closing : null;
  const snap = closing || { id: P?.key || null, kind: 'istantanea', period: { key: P?.key || null, from: P?.from || null, to: P?.to || null }, at: today, datapoints: dps };
  const snapJson = canonicalJson(snap);
  const snapHash = sha256HexSync(snapJson);
  add(closing ? 'chiusura.json' : 'istantanea-datapoint.json', snapJson);
  add(closing ? 'chiusura.sha256.txt' : 'istantanea-datapoint.sha256.txt', `${snapHash}  ${closing ? 'chiusura.json' : 'istantanea-datapoint.json'}\n${closing?.hash ? `impronta registrata alla chiusura: ${closing.hash}${closing.hash === snapHash ? ' (coincide)' : ' (diversa: verificare)'}\n` : ''}`);
  // allegati
  for (const a of A(inputs.attachments)) if (a && a.bytes) add(`allegati/${attachmentName(ev.find(e => e.id === a.id) || { id: a.id, title: a.name })}`, a.bytes);
  // leggimi
  const readme = [
    `${co.name || 'FeedOS'} · ${lang === 'en' ? 'Audit pack' : 'Pacchetto per il revisore'}`,
    `${lang === 'en' ? 'Period' : 'Periodo'}: ${P?.label || ''} (${dateIt(P?.from)} – ${dateIt(P?.to)})`,
    `${lang === 'en' ? 'Prepared on' : 'Preparato il'}: ${dateIt(today)}`,
    '',
    lang === 'en' ? 'Contents:' : 'Contenuto:',
    `- evidenze/indice-evidenze.csv: ${nf(ev.length)} ${lang === 'en' ? 'documents with SHA-256 fingerprint and links to datapoints' : 'documenti con impronta SHA-256 e collegamenti ai datapoint'}`,
    `- datapoint.csv: ${nf(dpRows.length)} ${lang === 'en' ? 'VS datapoints with value, quality, source and method' : 'datapoint del VS con valore, qualità, fonte e metodo'}`,
    `- fattori.csv, pacchetti-di-contenuti.csv: ${lang === 'en' ? 'emission factors and content-pack versions' : 'fattori di emissione e versioni dei pacchetti di contenuti'}`,
    `- scadenze.csv, politiche.csv, certificati-e-permessi.csv, dichiarazioni-ambientali.csv`,
    `- note-metodologiche.md`,
    `- ${closing ? 'chiusura.json' : 'istantanea-datapoint.json'} (SHA-256 ${snapHash})`,
    A(inputs.attachments).length ? `- allegati/: ${A(inputs.attachments).length} ${lang === 'en' ? 'files' : 'file'}` : `- ${lang === 'en' ? 'no attachments included (index only)' : 'nessun allegato incluso (solo indice)'}`,
    `- MANIFEST-SHA256.txt: ${lang === 'en' ? 'fingerprints of every file (check with «sha256sum -c»)' : 'impronte di tutti i file (verifica con «sha256sum -c»)'}`,
    '',
    T('disclaimer', {}, lang),
  ].join('\r\n');
  files.unshift({ name: 'LEGGIMI.txt', data: readme });
  const manifest = files.map(f => { const h = sha256HexSync(f.data); return { name: f.name, sha256: h, size: typeof f.data === 'string' ? new TextEncoder().encode(f.data).length : f.data.length }; });
  const manText = manifest.map(m => `${m.sha256}  ${m.name}`).join('\n') + '\n';
  files.push({ name: 'MANIFEST-SHA256.txt', data: manText });
  return { files, manifest, hash: sha256HexSync(manText), counts: { evidence: ev.length, datapoints: dpRows.length, attachments: A(inputs.attachments).length, files: files.length } };
}
/** Nome dell'allegato nel pacchetto: id + titolo ripulito + estensione del file originale. */
export function attachmentName(e) {
  const ext = (String(e?.fileName || '').match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0];
  return `${e?.id || 'file'}-${slug(e?.title || 'documento').slice(0, 40) || 'documento'}${ext}`;
}
/** Archivio ZIP del pacchetto per il revisore (Uint8Array) con data dei file = oggi dell'archivio. */
export function auditPackZip(d, P, inputs = {}) {
  const r = auditPackFiles(d, P, inputs);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(inputs.today || '')) ? inputs.today : esgToday(d);
  return { bytes: zipStore(r.files, { date: today }), ...r };
}
