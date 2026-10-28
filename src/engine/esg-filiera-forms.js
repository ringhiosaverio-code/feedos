/* FeedOS 18 · EUDR e fornitori (pacchetto WP3 «filiera»): moduli autonomi per i fornitori e importazione delle risposte.
 * supplierForm(payload, lang) → testo HTML completo, con stile e codice in linea e nessun indirizzo esterno: il fornitore lo apre
 * senza connessione, compila e preme «Salva risposta», che scarica un JSON con l'impronta SHA-256 del contenuto in JSON canonico
 * (WebCrypto se c'è, altrimenti il calcolo in JavaScript incluso nel file). importReply(json, d) controlla formato, impronta
 * e richiesta, confronta con i dati attuali e prepara le operazioni di un solo passo annullabile (store.batch).
 * Tipi: eudr (una riga per lotto: DDS, paese, GeoJSON, certificato), esg (domande di base), pcf (campi PACT), certificati. */
import { sha256HexSync, canonicalJson } from '../core/hash.js';
import { addMonths, round, byId } from '../core/util.js';
import { esgToday } from './esg-years.js';
import { T } from './esg-nlg.js';
import { classification, normCountry, normDdsRef, validDdsRef, packList, REQUEST_KINDS } from './esg-filiera.js';
import { validateGeoJSON, MAX_GEOJSON_BYTES } from './esg-filiera-geo.js';
import { COUNTRY_NAMES } from '../data/pack-filiera.js';

export { REQUEST_KINDS };
export const FORM_FORMAT = 'feedos-modulo-fornitore';
export const REPLY_FORMAT = 'feedos-risposta-fornitore';
export const MAX_REPLY_BYTES = 4000000;
export const MAX_FORM_LOTS = 60;
const KINDS = Object.keys(REQUEST_KINDS);
const EMPTY = Object.freeze([]);
const A = x => (Array.isArray(x) ? x : EMPTY);
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const has = v => v != null && String(v).trim() !== '';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => (has(v) ? String(v).trim().slice(0, n) : null);
const numOf = v => { if (v == null || v === '' || typeof v === 'boolean') return null; const x = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
export const COC_LABELS = { IP: { it: 'identità preservata', en: 'identity preserved' }, segregato: { it: 'segregata', en: 'segregated' }, 'bilancio-di-massa': { it: 'bilancio di massa', en: 'mass balance' }, crediti: { it: 'crediti (book and claim)', en: 'credits (book and claim)' }, nessuno: { it: 'nessuna', en: 'none' } };
const COUNTRY_EN = { AR: 'Argentina', AT: 'Austria', BR: 'Brazil', CA: 'Canada', CN: 'China', DE: 'Germany', ES: 'Spain', FR: 'France', HR: 'Croatia', HU: 'Hungary', ID: 'Indonesia', IN: 'India', IT: 'Italy',
  MY: 'Malaysia', NL: 'Netherlands', PY: 'Paraguay', RO: 'Romania', RS: 'Serbia', RU: 'Russia', UA: 'Ukraine', US: 'United States', UY: 'Uruguay', BO: 'Bolivia', GB: 'United Kingdom', PL: 'Poland', BG: 'Bulgaria' };
const FORM_COUNTRIES = ['BR', 'AR', 'US', 'PY', 'UY', 'BO', 'CA', 'UA', 'RS', 'IT', 'AT', 'FR', 'HU', 'RO', 'HR', 'DE', 'PL', 'BG', 'ES', 'NL', 'CN', 'IN', 'ID', 'MY', 'RU', 'GB'];
const ESG_YN = ['coc', 'hrPolicy', 'hrDueDiligence', 'safety', 'envPolicy', 'deforestation', 'anticorruption', 'grievance'];
const ESG_NUM = ['injuries', 'ghg', 'renewable', 'rating'];
const CERT_TYPES = ['GMP+', 'FAMI-QS', 'ISO 22000', 'FSSC 22000', 'ISO 14001', 'ISO 45001', 'ISO 9001', 'RTRS', 'ProTerra', 'ISCC', 'RSPO', 'Europe Soya', 'Biologico', 'altro'];

/* ---------------- dati del modulo ---------------- */
/**
 * Contenuto di un modulo per una richiesta {id, supplierId, kind, lang, sentAt, dueAt, lots?: [ingLotId]}: azienda, fornitore, lotti
 * con i valori già noti (eudr), prodotti (pcf), certificati attuali (certificati). È ciò che l'impronta del modulo (formHash) fissa.
 */
export function requestPayload(d, req = {}) {
  const co = d?.settings?.company || {};
  const sup = A(d?.suppliers).find(s => s && s.id === req.supplierId) || { id: req.supplierId || '', name: req.supplierName || req.supplierId || '' };
  const kind = KINDS.includes(req.kind) ? req.kind : 'eudr';
  const lang = req.lang === 'en' ? 'en' : 'it';
  const p = { format: FORM_FORMAT, v: 1, replyFormat: REPLY_FORMAT, requestId: String(req.id || ''), kind, lang, company: { name: co.name || '', site: co.site || '' }, supplier: { id: sup.id, name: sup.name || sup.id },
    sentAt: ISO.test(String(req.sentAt || '')) ? req.sentAt : null, dueAt: ISO.test(String(req.dueAt || '')) ? req.dueAt : null };
  if (kind === 'eudr') {
    const cls = classification(d), ings = byId(A(d?.ingredients).filter(i => i && has(i.id)));
    const lotsById = new Map(A(d?.ingLots).filter(l => l && has(l.id)).map(l => [l.id, l]));
    const cur = new Map(A(d?.eudrLots).filter(e => e && has(e.ingLotId)).map(e => [e.ingLotId, e]));
    p.lots = A(req.lots).slice(0, MAX_FORM_LOTS).map(id => lotsById.get(id)).filter(Boolean).map(il => {
      const e = cur.get(il.id) || {};
      const pre = { ddsRef: e.ddsRef || null, ddsVerification: e.ddsVerification || null, upstreamRefs: A(e.upstreamRefs).join(', ') || null, country: normCountry(e.country), region: e.region || null,
        scheme: e.scheme || null, coc: e.coc || null, certNo: e.certNo || null, certExpiry: e.certExpiry || null };
      return { ingLotId: il.id, code: il.code || il.id, ddt: il.ddt || '', date: il.date || '', material: ings[il.ingId]?.name || il.ingId, hs: cls.get(il.ingId)?.hs || '', t: round(+il.tonnes || 0, 2),
        prefill: Object.fromEntries(Object.entries(pre).filter(([, v]) => has(v))) };
    });
  } else if (kind === 'pcf') {
    const ings = byId(A(d?.ingredients).filter(i => i && has(i.id)));
    p.products = A(sup.ingIds).map(id => ({ id, name: ings[id]?.name || id }));
  } else if (kind === 'certificati') {
    p.certs = A(sup.cert).filter(isObj).map(c => ({ type: c.type || '', number: c.number || '', expiry: c.expiry || '' }));
  }
  p.schemes = packList(d, 'schema').map(s => s.code).filter(has);
  return p;
}
/** Impronta SHA-256 del contenuto del modulo (JSON canonico). */
export function formHash(payload) { return sha256HexSync(canonicalJson(payload)); }

/* ---------------- codice in linea del modulo (senza dipendenze, senza indirizzi) ---------------- */
/** SHA-256 in JavaScript puro, UTF-8 e JSON canonico identici a src/core/hash.js: funzioni futf8, fsha256(testo), fcanon(valore). */
export const FORM_HASH_JS = `var FK=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function futf8(s){s=String(s);if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(s);var o=[],i,c;for(i=0;i<s.length;i++){c=s.codePointAt(i);if(c>0xffff)i++;if(c<0x80)o.push(c);else if(c<0x800)o.push(0xc0|(c>>6),0x80|(c&63));else if(c<0x10000)o.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));else o.push(0xf0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63));}return new Uint8Array(o);}
function fsha256(text){var m=futf8(text),l=m.length,n=((l+9+63)>>6)<<6,b=new Uint8Array(n),v,H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],W=new Array(64),i,j;b.set(m);b[l]=0x80;v=new DataView(b.buffer);v.setUint32(n-8,Math.floor(l/0x20000000));v.setUint32(n-4,(l*8)>>>0);
for(i=0;i<n;i+=64){for(j=0;j<16;j++)W[j]=v.getUint32(i+j*4);for(j=16;j<64;j++){var x=W[j-15],y=W[j-2];W[j]=(W[j-16]+(((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3))+W[j-7]+(((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10)))>>>0;}
var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(j=0;j<64;j++){var s1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(h+s1+ch+FK[j]+W[j])>>>0,s0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),mj=(a&bb)^(a&c)^(bb&c),t2=(s0+mj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=bb;bb=a;a=(t1+t2)>>>0;}
H[0]=(H[0]+a)>>>0;H[1]=(H[1]+bb)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;}
var out='';for(i=0;i<8;i++)out+=('00000000'+H[i].toString(16)).slice(-8);return out;}
function fcanon(v){if(v===null)return 'null';var t=typeof v;if(t==='number')return isFinite(v)?JSON.stringify(v):'null';if(t==='string'||t==='boolean')return JSON.stringify(v);if(t!=='object')return undefined;if(Array.isArray(v))return '['+v.map(function(z){var q=fcanon(z);return q===undefined?'null':q;}).join(',')+']';var k=Object.keys(v).sort(),p=[],i,q;for(i=0;i<k.length;i++){q=fcanon(v[k[i]]);if(q!==undefined)p.push(JSON.stringify(k[i])+':'+q);}return '{'+p.join(',')+'}';}`;

const FORM_APP_JS = `function fhash(o){var s=fcanon(o),sub=window.crypto&&window.crypto.subtle;if(sub&&sub.digest){return sub.digest('SHA-256',futf8(s)).then(function(buf){var u=new Uint8Array(buf),h='',i;for(i=0;i<u.length;i++)h+=('0'+u[i].toString(16)).slice(-2);return h;},function(){return fsha256(s);});}return Promise.resolve(fsha256(s));}
(function(){var data=JSON.parse(document.getElementById('fo-data').textContent),M=data.msg,files={};
function q(s,r){return (r||document).querySelector(s);}function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function val(el){if(!el)return null;var v=String(el.value||'').trim();return v===''?null:v;}
function num(v){if(v==null)return null;var x=Number(String(v).replace(/\\s/g,'').replace(',','.'));return isFinite(x)?x:null;}
function today(){var t=new window.Date();function p(n){return (n<10?'0':'')+n;}return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());}
qa('input[type=file][data-lot]').forEach(function(inp){inp.addEventListener('change',function(){var i=inp.getAttribute('data-lot'),msg=q('[data-geo-msg="'+i+'"]'),f=inp.files&&inp.files[0];delete files[i];msg.textContent='';if(!f)return;var r=new FileReader();r.onload=function(){var txt=String(r.result||''),ok=false,n=0;try{var g=JSON.parse(txt);ok=!!g&&g.type==='FeatureCollection'&&Array.isArray(g.features);n=ok?g.features.length:0;}catch(e){ok=false;}if(ok&&txt.length<=1500000){files[i]={name:f.name,text:txt};msg.textContent=M.geoOk.replace('{n}',n);msg.className='fo-ok';}else{msg.textContent=M.geoBad;msg.className='fo-bad';}};r.readAsText(f);});});
function collect(){var o={format:data.replyFormat,v:1,requestId:data.requestId,supplierId:data.supplier.id,kind:data.kind,lang:data.lang,formHash:data.formHash,answeredAt:today(),respondent:{name:val(q('#fo-name')),email:val(q('#fo-email'))}};
if(data.kind==='eudr'){o.lots=qa('[data-lot-row]').map(function(row){var i=row.getAttribute('data-lot-row'),g={ingLotId:data.lots[i].ingLotId};qa('[data-k]',row).forEach(function(el){var v=val(el);if(v!=null)g[el.getAttribute('data-k')]=v;});if(files[i]){g.geojson=files[i].text;g.geojsonName=files[i].name;}return g;});}
if(data.kind==='esg'){var a={};qa('[data-q]').forEach(function(el){var k=el.getAttribute('data-q');if(el.type==='radio'){if(el.checked)a[k]=el.value;}else{var v=val(el);if(v!=null)a[k]=el.hasAttribute('data-num')?num(v):v;}});o.answers=a;}
if(data.kind==='pcf'){o.pcf=qa('[data-pcf-row]').map(function(row){var p={};qa('[data-k]',row).forEach(function(el){var v=val(el);if(v!=null)p[el.getAttribute('data-k')]=el.hasAttribute('data-num')?num(v):v;});return p;}).filter(function(p){return Object.keys(p).length>2;});}
if(data.kind==='certificati'){o.certs=qa('[data-cert-row]').map(function(row){var c={};qa('[data-k]',row).forEach(function(el){var v=val(el);if(v!=null)c[el.getAttribute('data-k')]=v;});return c;}).filter(function(c){return c.type&&(c.number||c.expiry);});}
return o;}
q('#fo-save').addEventListener('click',function(){var core=collect();fhash(core).then(function(h){core.hash=h;var json=JSON.stringify(core,null,1),name='risposta-'+data.requestId+'.json';try{var blob=new Blob([json],{type:'application/json'}),a=document.createElement('a');a.download=name;a.href = URL.createObjectURL(blob);document.body.appendChild(a);a.click();a.remove();}catch(e){}
q('#fo-out').value=json;q('#fo-hash').textContent=h;q('#fo-saved').textContent=M.saved.replace('{file}',name);q('#fo-result').hidden=false;});});})();`;

const FORM_CSS = `:root{--bg:#F3F6F2;--surface:#FBFCFA;--ink:#101A14;--ink2:#405048;--muted:#6A786F;--line:#D5DDD5;--accent:#1D6B45;--accentInk:#FFFFFF;--good:#0B6B20;--bad:#B02727;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0B110E;--surface:#121A16;--ink:#E7EEE9;--ink2:#AFBDB4;--muted:#7D8C83;--line:#25312B;--accent:#4FC18B;--accentInk:#04120A;--good:#4CCB4C;--bad:#F07B7B}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.fo{max-width:940px;margin:0 auto;padding:24px 16px 48px}.fo h1{font-size:24px;line-height:1.2;margin:4px 0 6px}.fo-eyebrow{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.fo-meta{margin:0;color:var(--ink2);font-size:13px}.fo-note{color:var(--muted);font-size:13px}.fo-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:14px 0}
.fo-card h2{font-size:16px;margin:0 0 8px}.fo-kv{display:flex;flex-wrap:wrap;gap:2px 16px;font-size:13px;color:var(--ink2);margin:0 0 10px}.fo-kv b{color:var(--ink)}
.fo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 12px}label{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--ink2);min-width:0}
input,select,textarea{width:100%;min-width:0;font:inherit;font-size:14px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:0}.fo-q{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--line)}
.fo-q:last-child{border-bottom:0}.fo-q>span{flex:1 1 300px;font-size:14px}.fo-yn{display:flex;gap:16px}.fo-yn label{display:inline-flex;align-items:center;gap:6px;font-weight:500;color:var(--ink)}.fo-yn input{width:auto}
.fo-q input[data-num]{max-width:160px}.fo-actions{margin:18px 0}button{font:inherit;font-weight:700;padding:10px 20px;border-radius:9px;border:1px solid var(--accent);background:var(--accent);color:var(--accentInk);cursor:pointer}
.fo-ok{color:var(--good);font-size:12px;font-weight:600}.fo-bad{color:var(--bad);font-size:12px;font-weight:600}code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
textarea{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}footer{margin-top:28px;font-size:12px;color:var(--muted)}@media print{button,#fo-result,input[type=file]{display:none}}`;

/* ---------------- HTML del modulo ---------------- */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const dIt = s => (ISO.test(String(s || '')) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const jsonInScript = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
function countrySelect(k, value, L) {
  const list = [...new Set([...(value && !FORM_COUNTRIES.includes(value) ? [value] : []), ...FORM_COUNTRIES])];
  return `<select data-k="${k}">${opt('', T('filiera.form.choose', {}, L), !value)}${list.map(c => opt(c, `${c} · ${L === 'en' ? COUNTRY_EN[c] || COUNTRY_NAMES[c] || c : COUNTRY_NAMES[c] || c}`, value === c)).join('')}</select>`;
}
const field = (label, control) => `<label>${esc(label)}${control}</label>`;
const input = (k, value, extra = '') => `<input data-k="${k}" value="${esc(value ?? '')}"${extra}>`;

/** Modulo autonomo in HTML (testo): nessun collegamento esterno, stile e codice in linea, lingua it/en. */
export function supplierForm(payload, lang) {
  const p = isObj(payload) ? payload : {};
  const L = (lang || p.lang) === 'en' ? 'en' : 'it';
  const kind = KINDS.includes(p.kind) ? p.kind : 'eudr';
  const co = p.company?.name || 'FeedOS', sup = p.supplier?.name || '';
  const t = (k, v) => esc(T(k, { company: co, ...v }, L));
  const data = { ...p, lang: L, formHash: formHash(p), msg: { geoOk: T('filiera.form.geojsonOk', {}, L), geoBad: T('filiera.form.geojsonBad', {}, L), saved: T('filiera.form.saved', { company: co }, L) } };
  const parts = [];
  if (kind === 'eudr') {
    const schemes = A(p.schemes).length ? p.schemes : ['RTRS', 'ProTerra', 'ISCC', 'nessuno'];
    parts.push(`<p>${t('filiera.form.intro.eudr')}</p>`);
    A(p.lots).forEach((l, i) => {
      const f = isObj(l.prefill) ? l.prefill : {};
      parts.push(`<section class="fo-card" data-lot-row="${i}"><h2>${t('filiera.form.lot')} ${esc(l.code)}</h2><p class="fo-kv"><span>${t('filiera.form.ddt')}: <b>${esc(l.ddt || '—')}</b></span><span>${t('filiera.form.date')}: <b>${esc(dIt(l.date))}</b></span><span>${t('filiera.form.material')}: <b>${esc(l.material)}${l.hs ? ' · NC ' + esc(l.hs) : ''}</b></span><span>${t('filiera.form.qty')}: <b>${esc(String(l.t).replace('.', L === 'en' ? '.' : ','))}</b></span></p><div class="fo-grid">`
        + field(T('filiera.form.ddsRef', {}, L), input('ddsRef', f.ddsRef, ' placeholder="26IT0000000000" autocomplete="off"'))
        + field(T('filiera.form.ddsVer', {}, L), input('ddsVerification', f.ddsVerification, ' autocomplete="off"'))
        + field(T('filiera.form.upstream', {}, L), input('upstreamRefs', f.upstreamRefs))
        + field(T('filiera.form.country', {}, L), countrySelect('country', f.country, L))
        + field(T('filiera.form.region', {}, L), input('region', f.region))
        + field(T('filiera.form.scheme', {}, L), `<select data-k="scheme">${opt('', T('filiera.form.choose', {}, L), !f.scheme)}${schemes.map(s => opt(s, s, f.scheme === s)).join('')}</select>`)
        + field(T('filiera.form.coc', {}, L), `<select data-k="coc">${opt('', T('filiera.form.choose', {}, L), !f.coc)}${Object.entries(COC_LABELS).map(([k, v]) => opt(k, v[L], f.coc === k)).join('')}</select>`)
        + field(T('filiera.form.certNo', {}, L), input('certNo', f.certNo))
        + field(T('filiera.form.certExpiry', {}, L), input('certExpiry', f.certExpiry, ' type="date"'))
        + `<label>${t('filiera.form.geojson')}<input type="file" data-lot="${i}" accept=".geojson,.json,application/geo+json,application/json"><span data-geo-msg="${i}"></span></label>`
        + field(T('filiera.form.notes', {}, L), input('notes', ''))
        + '</div></section>');
    });
  } else if (kind === 'esg') {
    parts.push(`<p>${t('filiera.form.intro.esg')}</p><section class="fo-card">`);
    for (const k of ESG_YN) parts.push(`<div class="fo-q"><span>${t(`filiera.form.q.${k}`)}</span><span class="fo-yn"><label><input type="radio" name="q-${k}" data-q="${k}" value="si">${t('filiera.form.yes')}</label><label><input type="radio" name="q-${k}" data-q="${k}" value="no">${t('filiera.form.no')}</label></span></div>`);
    for (const k of ESG_NUM) parts.push(`<div class="fo-q"><span>${t(`filiera.form.q.${k}`)}</span><input data-q="${k}" data-num="1" inputmode="decimal"></div>`);
    parts.push(`<div class="fo-q"><span>${t('filiera.form.notes')}</span><textarea data-q="notes" rows="3"></textarea></div></section>`);
  } else if (kind === 'pcf') {
    parts.push(`<p>${t('filiera.form.intro.pcf')}</p>`);
    const prods = A(p.products).length ? p.products : [{ id: '', name: '' }];
    prods.forEach((pr, i) => {
      parts.push(`<section class="fo-card" data-pcf-row="${i}"><h2>${esc(pr.name || T('filiera.form.pcf.product', {}, L))}</h2><input type="hidden" data-k="productId" value="${esc(pr.id)}"><div class="fo-grid">`
        + field(T('filiera.form.pcf.product', {}, L), input('product', pr.name))
        + field(T('filiera.form.pcf.declaredUnit', {}, L), `<select data-k="declaredUnit">${opt('kilogram', 'kg', true)}${opt('tonne', 't', false)}</select>`)
        + field(T('filiera.form.pcf.pcfExcl', {}, L), input('pcfExcl', '', ' data-num="1" inputmode="decimal"'))
        + field(T('filiera.form.pcf.fossil', {}, L), input('fossil', '', ' data-num="1" inputmode="decimal"'))
        + field(T('filiera.form.pcf.luc', {}, L), input('luc', '', ' data-num="1" inputmode="decimal"'))
        + field(T('filiera.form.pcf.periodStart', {}, L), input('periodStart', '', ' type="date"'))
        + field(T('filiera.form.pcf.periodEnd', {}, L), input('periodEnd', '', ' type="date"'))
        + field(T('filiera.form.pcf.country', {}, L), countrySelect('country', null, L))
        + field(T('filiera.form.pcf.standards', {}, L), input('standards', ''))
        + field(T('filiera.form.pcf.rules', {}, L), input('rules', ''))
        + field(T('filiera.form.pcf.primary', {}, L), input('primaryShare', '', ' data-num="1" inputmode="decimal"'))
        + field(T('filiera.form.pcf.verified', {}, L), `<select data-k="verified">${opt('', T('filiera.form.choose', {}, L), true)}${opt('si', T('filiera.form.yes', {}, L), false)}${opt('no', T('filiera.form.no', {}, L), false)}</select>`)
        + '</div></section>');
    });
  } else {
    parts.push(`<p>${t('filiera.form.intro.certificati')}</p>`);
    const rows = [...A(p.certs), ...Array.from({ length: Math.max(3, 6 - A(p.certs).length) }, () => ({}))];
    rows.forEach((c, i) => {
      parts.push(`<section class="fo-card" data-cert-row="${i}"><div class="fo-grid">`
        + field(T('filiera.form.cert.type', {}, L), `<select data-k="type">${opt('', T('filiera.form.choose', {}, L), !c.type)}${[...new Set([...(c.type && !CERT_TYPES.includes(c.type) ? [c.type] : []), ...CERT_TYPES])].map(x => opt(x, x, c.type === x)).join('')}</select>`)
        + field(T('filiera.form.cert.number', {}, L), input('number', c.number))
        + field(T('filiera.form.cert.issuer', {}, L), input('issuer', c.issuer))
        + field(T('filiera.form.cert.expiry', {}, L), input('expiry', c.expiry, ' type="date"'))
        + '</div></section>');
    });
  }
  return `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t(`filiera.form.title.${kind}`)} · ${esc(sup)}</title><style>${FORM_CSS}</style></head>`
    + `<body><main class="fo"><header><p class="fo-eyebrow">${t('filiera.form.from', { supplier: sup })}</p><h1>${t(`filiera.form.title.${kind}`)}</h1><p class="fo-meta">${t('filiera.form.meta', { id: p.requestId || '—', sent: dIt(p.sentAt), due: dIt(p.dueAt) })}</p></header>`
    + `<p>${t('filiera.form.intro')}</p><p class="fo-note">${t('filiera.form.privacy')}</p>${parts.join('')}`
    + `<section class="fo-card"><div class="fo-grid">${field(T('filiera.form.respondent', {}, L), '<input id="fo-name" autocomplete="name">')}${field(T('filiera.form.email', {}, L), '<input id="fo-email" type="email" autocomplete="email">')}</div></section>`
    + `<div class="fo-actions"><button id="fo-save" type="button">${t('filiera.form.save')}</button></div>`
    + `<div id="fo-result" class="fo-card" hidden><p id="fo-saved" class="fo-ok"></p><p>${t('filiera.form.hash')}: <code id="fo-hash"></code></p><p class="fo-note">${t('filiera.form.copy')}</p><textarea id="fo-out" rows="8" readonly aria-label="JSON"></textarea></div>`
    + `<footer>${t('filiera.form.footer')} ${esc(T('disclaimer', {}, L))}</footer></main>`
    + `<script type="application/json" id="fo-data">${jsonInScript(data)}</script><script>${FORM_HASH_JS}\n${FORM_APP_JS}</script></body></html>`;
}

/* ---------------- risposte ---------------- */
/** Contenuto della risposta senza l'impronta (ciò su cui si calcola l'impronta). */
export function replyCore(reply) { const c = { ...(isObj(reply) ? reply : {}) }; delete c.hash; return c; }
/** Impronta di una risposta: SHA-256 del JSON canonico del contenuto senza il campo hash. */
export function replyHash(reply) { return sha256HexSync(canonicalJson(replyCore(reply))); }
/** L'impronta della risposta corrisponde al contenuto? */
export function verifyReplyHash(reply) { return isObj(reply) && typeof reply.hash === 'string' && /^[0-9a-f]{64}$/.test(reply.hash) && replyHash(reply) === reply.hash; }

/** Lettura e controllo formale di una risposta (testo JSON o oggetto) → {ok, errors, reply}. */
export function parseReply(input) {
  let r = input;
  if (typeof input === 'string') {
    if (input.length > MAX_REPLY_BYTES) return { ok: false, errors: ['File troppo grande: oltre 4 MB.'], reply: null };
    try { r = JSON.parse(input); } catch { return { ok: false, errors: ['Il file non è un JSON leggibile.'], reply: null }; }
  }
  const errors = [];
  if (!isObj(r)) return { ok: false, errors: ['Il contenuto non è una risposta di un modulo FeedOS.'], reply: null };
  if (r.format !== REPLY_FORMAT) errors.push('Il file non è una risposta di un modulo per i fornitori di FeedOS.');
  if (r.v !== 1) errors.push('Versione della risposta non riconosciuta.');
  if (!has(r.requestId)) errors.push('Manca l’identificativo della richiesta.');
  if (!KINDS.includes(r.kind)) errors.push('Tipo di modulo non riconosciuto.');
  if (typeof r.hash !== 'string' || !/^[0-9a-f]{64}$/.test(r.hash)) errors.push('Manca l’impronta SHA-256 della risposta: il file non viene dal pulsante «Salva risposta».');
  return { ok: !errors.length, errors, reply: r };
}

const yesOf = v => v === true || v === 'si' || v === 'sì' || v === 'yes' || v === 'y';
const clamp100 = v => Math.max(0, Math.min(100, Math.round(v)));
/** Punteggi E/S/G dichiarati dalle risposte al questionario ESG (0–100). */
export function esgScoresFromAnswers(a = {}) {
  const n = k => numOf(a[k]);
  const E = 35 * yesOf(a.envPolicy) + 25 * yesOf(a.deforestation) + (n('ghg') != null ? 20 : 0) + (n('renewable') != null ? Math.min(20, Math.max(0, n('renewable')) / 5) : 0);
  const S = 30 * yesOf(a.hrPolicy) + 25 * yesOf(a.hrDueDiligence) + 25 * yesOf(a.safety) + 20 * yesOf(a.grievance);
  const G = 40 * yesOf(a.coc) + 40 * yesOf(a.anticorruption) + (n('rating') != null ? Math.min(20, Math.max(0, n('rating')) / 5) : 0);
  return { scoreE: clamp100(E), scoreS: clamp100(S), scoreG: clamp100(G) };
}
const COC_ALIASES = { ip: 'IP', 'identita preservata': 'IP', 'identity preserved': 'IP', segregato: 'segregato', segregata: 'segregato', segregated: 'segregato', 'bilancio-di-massa': 'bilancio-di-massa', 'bilancio di massa': 'bilancio-di-massa', 'mass balance': 'bilancio-di-massa', crediti: 'crediti', credits: 'crediti', 'book and claim': 'crediti', nessuno: 'nessuno', nessuna: 'nessuno', none: 'nessuno' };
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const LOT_LABELS = { ddsRef: 'Riferimento DDS', ddsVerification: 'Codice di verifica', upstreamRefs: 'Riferimenti a monte', country: 'Paese', region: 'Regione', scheme: 'Schema', coc: 'Catena di custodia', cutoff: 'Data limite',
  conversionFree: 'Senza conversione', ssgBenchmark: 'FEFAC SSG', certNo: 'Certificato', certExpiry: 'Scadenza del certificato', plotsCount: 'Appezzamenti', areaHa: 'Superficie (ha)', geoValid: 'Geolocalizzazione valida', status: 'Stato' };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Importazione di una risposta: formato, impronta (deve corrispondere), richiesta e fornitore, differenze con i dati attuali e operazioni
 * per un solo store.batch. → {ok, errors, warnings, hashOk, formOk, request, supplier, kind, changes: [{target, field, label, from, to}],
 *   plots, ops, label, summary}. Con errori ops è vuoto. opts.today per i test.
 */
export function importReply(json, d, opts = {}) {
  const today = ISO.test(String(opts.today || '')) ? opts.today : esgToday(d);
  const res = { ok: false, errors: [], warnings: [], hashOk: false, formOk: null, request: null, supplier: null, kind: null, changes: [], plots: [], ops: [], label: '', summary: {} };
  const p = parseReply(json);
  if (!p.ok) { res.errors = p.errors; return res; }
  const r = p.reply;
  res.kind = r.kind;
  res.hashOk = verifyReplyHash(r);
  if (!res.hashOk) res.errors.push('L’impronta SHA-256 non corrisponde al contenuto: il file è stato modificato dopo il salvataggio. Chiedete al fornitore di salvarlo di nuovo dal modulo.');
  const req = A(d?.supplierRequests).find(x => x && x.id === r.requestId) || null;
  res.request = req;
  if (!req) res.warnings.push(`Richiesta ${r.requestId} non trovata nell’archivio: si importano solo i dati riconosciuti del fornitore.`);
  else if (has(req.formHash)) { res.formOk = req.formHash === r.formHash; if (!res.formOk) res.warnings.push('La risposta si riferisce a una versione diversa del modulo (impronta del modulo diversa da quella registrata).'); }
  if (req && req.kind && req.kind !== r.kind) res.errors.push(`La richiesta ${req.id} è di tipo «${req.kind}», la risposta di tipo «${r.kind}».`);
  if (req && has(r.supplierId) && req.supplierId !== r.supplierId) res.errors.push('La risposta indica un fornitore diverso da quello della richiesta.');
  const supId = req?.supplierId || r.supplierId;
  const s = A(d?.suppliers).find(x => x && x.id === supId) || null;
  if (!s) res.errors.push('Il fornitore della risposta non è in anagrafica.');
  res.supplier = s;
  if (res.errors.length) return res;
  const answeredAt = ISO.test(String(r.answeredAt || '')) && r.answeredAt <= today ? r.answeredAt : today;
  const ops = [];
  if (r.kind === 'eudr') {
    const lotsById = new Map(A(d?.ingLots).filter(l => l && l.id).map(l => [l.id, l]));
    const allowed = new Set(A(req?.lots).length ? req.lots : A(d?.ingLots).filter(l => l && (l.supplierId === supId || l.supplier === s.name)).map(l => l.id));
    const cur = new Map(A(d?.eudrLots).filter(e => e && e.ingLotId).map(e => [e.ingLotId, e]));
    const plotsByLot = new Map();
    for (const pl of A(d?.eudrPlots)) if (pl && pl.eudrLotId) { if (!plotsByLot.has(pl.eudrLotId)) plotsByLot.set(pl.eudrLotId, []); plotsByLot.get(pl.eudrLotId).push(pl.id); }
    const schemes = packList(d, 'schema');
    const objs = [], removePlots = [], addPlots = [];
    for (const x of A(r.lots).slice(0, 500)) {
      if (!isObj(x)) continue;
      const il = lotsById.get(x.ingLotId);
      if (!il) { res.warnings.push(`Lotto ${String(x.ingLotId).slice(0, 40)} non trovato nell’archivio: ignorato.`); continue; }
      if (!allowed.has(il.id)) { res.warnings.push(`Lotto ${il.code || il.id} non richiesto a questo fornitore: ignorato.`); continue; }
      const e = cur.get(il.id) || null;
      const patch = {};
      if (has(x.ddsRef)) { patch.ddsRef = normDdsRef(x.ddsRef).slice(0, 40); if (!validDdsRef(patch.ddsRef)) res.warnings.push(`${il.code}: riferimento «${patch.ddsRef}» fuori dal formato atteso, da verificare.`); }
      if (has(x.ddsVerification)) patch.ddsVerification = String(x.ddsVerification).toUpperCase().replace(/\s/g, '').slice(0, 24);
      if (has(x.upstreamRefs)) patch.upstreamRefs = String(x.upstreamRefs).split(/[\s,;]+/).map(normDdsRef).filter(Boolean).slice(0, 20);
      if (has(x.country)) { const c = normCountry(x.country); if (c) patch.country = c; else res.warnings.push(`${il.code}: paese «${String(x.country).slice(0, 30)}» non riconosciuto.`); }
      if (has(x.region)) patch.region = str(x.region, 80);
      if (has(x.scheme)) {
        const sc = schemes.find(z => normTxt(z.code) === normTxt(x.scheme));
        patch.scheme = sc ? sc.code : 'altro';
        if (!sc) patch.note = `Schema indicato dal fornitore: ${str(x.scheme, 60)}`;
        if (sc) { if (sc.ssg && !e?.ssgBenchmark) patch.ssgBenchmark = sc.ssg; if (sc.cutoff && !e?.cutoff) patch.cutoff = sc.cutoff; if (sc.conversionFree != null && e?.conversionFree == null) patch.conversionFree = sc.conversionFree; }
      }
      if (has(x.coc)) { const c = COC_ALIASES[normTxt(x.coc)]; if (c) patch.coc = c; }
      if (has(x.certNo)) patch.certNo = str(x.certNo, 60);
      if (ISO.test(String(x.certExpiry || ''))) patch.certExpiry = x.certExpiry;
      if (has(x.notes)) patch.note = [patch.note, str(x.notes, 300)].filter(Boolean).join(' · ');
      const id = e?.id || `eu-${il.id}`;
      if (has(x.geojson)) {
        const text = String(x.geojson);
        if (text.length > MAX_GEOJSON_BYTES) res.warnings.push(`${il.code}: file GeoJSON oltre 2 MB, non importato.`);
        else {
          const v = validateGeoJSON(text);
          for (const is of v.issues.slice(0, 8)) res.warnings.push(`${il.code}: ${is.msg}`);
          const rows = v.features.filter(f => f.coords).map((f, k) => ({ id: `pl-${id}-${k + 1}`, eudrLotId: id, name: f.name, geom: f.geom, coords: f.coords, areaHa: f.areaHa, declaredAreaHa: f.declaredAreaHa, lat: f.lat, lon: f.lon, valid: f.valid, issues: f.issues.slice(0, 6) }));
          removePlots.push(...(plotsByLot.get(id) || []));
          addPlots.push(...rows);
          res.plots.push({ lot: il.code, ok: v.ok, count: rows.length, areaHa: v.totalAreaHa });
          Object.assign(patch, { plotsCount: rows.length, areaHa: v.totalAreaHa, geoValid: v.ok, plotsHash: sha256HexSync(text), plotsFile: str(x.geojsonName, 120) || 'appezzamenti.geojson' });
        }
      }
      for (const [k, v] of Object.entries(patch)) if (!same(e?.[k], v) && LOT_LABELS[k]) res.changes.push({ target: il.code || il.id, field: k, label: LOT_LABELS[k], from: e?.[k] ?? null, to: v });
      const merged = { ...(e || { id, ingLotId: il.id, ingId: il.ingId, supplierId: il.supplierId || supId }), ...patch };
      const complete = (has(merged.ddsRef) || A(merged.upstreamRefs).length > 0) && !!normCountry(merged.country);
      const status = e?.status === 'respinto' ? 'respinto' : complete ? 'completo' : 'incompleto';
      if (!same(e?.status, status)) res.changes.push({ target: il.code || il.id, field: 'status', label: LOT_LABELS.status, from: e?.status ?? null, to: status });
      objs.push({ ...patch, id, ingLotId: il.id, ingId: e?.ingId || il.ingId, supplierId: e?.supplierId || il.supplierId || supId, status, source: 'risposta del fornitore', requestId: r.requestId, updatedAt: today });
    }
    if (objs.length) ops.push({ kind: 'upsertMany', coll: 'eudrLots', key: 'ingLotId', objs });
    if (removePlots.length) ops.push({ kind: 'removeMany', coll: 'eudrPlots', ids: removePlots });
    if (addPlots.length) ops.push({ kind: 'addMany', coll: 'eudrPlots', objs: addPlots });
    res.summary = { lots: objs.length, complete: objs.filter(o => o.status === 'completo').length, plots: addPlots.length };
  } else if (r.kind === 'esg') {
    const a0 = isObj(r.answers) ? r.answers : {};
    const a = {};
    for (const k of ESG_YN) if (has(a0[k])) a[k] = yesOf(a0[k]) ? 'si' : 'no';
    for (const k of ESG_NUM) { const v = numOf(a0[k]); if (v != null) a[k] = v; }
    if (has(a0.notes)) a.notes = str(a0.notes, 600);
    const sc = esgScoresFromAnswers(a);
    const e = A(d?.supplierEsg).find(x => x && x.id === supId) || null;
    const obj = { id: supId, assessedAt: answeredAt, ...sc, selfAssessment: a, source: 'questionario del fornitore', nextReview: addMonths(answeredAt, 12), requestId: r.requestId };
    if (a.coc === 'si' && !e?.cocSignedAt) obj.cocSignedAt = answeredAt;
    for (const k of ['scoreE', 'scoreS', 'scoreG', 'assessedAt', 'cocSignedAt']) if (k in obj && !same(e?.[k], obj[k])) res.changes.push({ target: s.name, field: k, label: { scoreE: 'Punteggio ambiente', scoreS: 'Punteggio sociale', scoreG: 'Punteggio governance', assessedAt: 'Data della valutazione', cocSignedAt: 'Codice di condotta firmato il' }[k], from: e?.[k] ?? null, to: obj[k] });
    ops.push({ kind: 'upsertMany', coll: 'supplierEsg', key: 'id', objs: [obj] });
    res.summary = { ...sc };
  } else if (r.kind === 'certificati') {
    const certs = A(r.certs).filter(isObj).slice(0, 30).map(c => ({ type: str(c.type, 40), number: str(c.number, 60), issuer: str(c.issuer, 80), expiry: ISO.test(String(c.expiry || '')) ? c.expiry : null })).filter(c => c.type && (c.number || c.expiry))
      .map(c => Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)));
    if (certs.length) {
      const types = new Set(certs.map(c => c.type));
      const next = [...A(s.cert).filter(c => c && !types.has(c.type)), ...certs];
      for (const c of certs) { const old = A(s.cert).find(x => x && x.type === c.type); if (!same(old?.expiry, c.expiry) || !same(old?.number, c.number)) res.changes.push({ target: s.name, field: 'cert', label: `Certificato ${c.type}`, from: old ? `${old.number || ''} ${old.expiry || ''}`.trim() : null, to: `${c.number || ''} ${c.expiry || ''}`.trim() }); }
      ops.push({ kind: 'update', coll: 'suppliers', id: s.id, patch: { cert: next } });
    }
    res.summary = { certs: certs.length };
  } else if (r.kind === 'pcf') {
    const rows = pcfRows(r);
    res.summary = { products: rows.length };
    if (!rows.length) res.warnings.push('Nessuna impronta compilata nella risposta.');
    for (const x of rows) res.changes.push({ target: x.product || x.productId || s.name, field: 'pcf', label: 'Impronta dichiarata (kg CO₂e per kg)', from: null, to: x.pcfExcl });
  }
  if (req) ops.push({ kind: 'update', coll: 'supplierRequests', id: req.id, patch: { status: 'ricevuto', receivedAt: today, replyHash: r.hash, respondent: str(r.respondent?.name, 80), ...(r.kind === 'pcf' ? { pcf: pcfRows(r) } : {}) } });
  res.ops = ops;
  res.ok = true;
  res.label = `Risposta di ${s.name} al modulo «${REQUEST_KINDS[r.kind]}» importata`;
  return res;
}
function pcfRows(r) {
  return A(r.pcf).filter(isObj).slice(0, 50).map(x => ({ productId: str(x.productId, 40), product: str(x.product, 120), declaredUnit: x.declaredUnit === 'tonne' ? 'tonne' : 'kilogram', pcfExcl: numOf(x.pcfExcl), fossil: numOf(x.fossil), luc: numOf(x.luc),
    periodStart: ISO.test(String(x.periodStart || '')) ? x.periodStart : null, periodEnd: ISO.test(String(x.periodEnd || '')) ? x.periodEnd : null, country: normCountry(x.country), standards: str(x.standards, 120), rules: str(x.rules, 120),
    primaryShare: numOf(x.primaryShare), verified: has(x.verified) ? yesOf(x.verified) : null })).filter(x => x.pcfExcl != null);
}
/**
 * Impronte dichiarate in una risposta «pcf» con i nomi dei campi PACT (per il pacchetto pcf, che le registra nel suo archivio).
 * Nessuna dichiarazione di conformità PACT: è solo la forma dei dati.
 */
export function pcfReplyToPact(reply) {
  return pcfRows(isObj(reply) ? reply : {}).map(x => ({ productIds: x.productId ? [x.productId] : [], productNameCompany: x.product, pcf: { declaredUnit: x.declaredUnit, unitaryProductAmount: 1, pCfExcludingBiogenic: x.pcfExcl,
    fossilGhgEmissions: x.fossil, dLucGhgEmissions: x.luc, referencePeriodStart: x.periodStart, referencePeriodEnd: x.periodEnd, geographyCountry: x.country, crossSectoralStandardsUsed: x.standards ? [x.standards] : [],
    productOrSectorSpecificRules: x.rules ? [x.rules] : [], primaryDataShare: x.primaryShare, assurance: x.verified === true } }));
}
