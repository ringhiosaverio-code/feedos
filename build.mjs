/* FeedOS 16 · build: un unico file HTML offline (caratteri, stile e codice incorporati).
 * Uscite: dist/FeedOS-16.html (completa, con il profilo «dati della tesi»),
 *         dist/FeedOS-16-demo.html (pubblica: solo dati dimostrativi),
 *         dist/artifact/feedos-16.html (pubblica, senza scheletro html/head/body, per la pubblicazione). */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
// esbuild dalla cartella del progetto (npm install); in alternativa dall'installazione globale usata per lo sviluppo
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require('/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild'); }
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const dist = p => path.join(ROOT, 'dist', p);
fs.mkdirSync(dist('artifact'), { recursive: true });

const FONTS = [['FeedOS Sans', 'sans-400', 400, 'normal'], ['FeedOS Sans', 'sans-700', 700, 'normal'], ['FeedOS Sans', 'sans-400i', 400, 'italic'],
  ['FeedOS Display', 'display-700', 700, 'normal'], ['FeedOS Display', 'display-400', 400, 'normal'], ['FeedOS Mono', 'mono-400', 400, 'normal'], ['FeedOS Mono', 'mono-700', 700, 'normal']];
const fontCss = FONTS.map(([fam, f, w, st]) => `@font-face{font-family:'${fam}';src:url(data:font/woff;base64,${fs.readFileSync(path.join(ROOT, 'fonts', f + '.woff')).toString('base64')}) format('woff');font-weight:${w};font-style:${st};font-display:swap}`).join('\n');
const css = fs.readFileSync(path.join(ROOT, 'src/styles/app.css'), 'utf8');

async function bundle(full) {
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main.jsx')], bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic', target: ['es2020'],
    define: { 'process.env.NODE_ENV': '"production"', __FULL__: String(full) }, nodePaths: [path.join(ROOT, 'node_modules'), '/home/claude/.npm-global/lib/node_modules'], legalComments: 'none', metafile: true,
    logLevel: 'error',
  });
  return { js: r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'), meta: r.metafile };
}
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#101A14"/><rect y="25" width="32" height="7" fill="#D5940F"/><text x="16" y="21" font-family="Arial Narrow,Arial" font-weight="700" font-size="18" fill="#EDF1EC" text-anchor="middle">F</text></svg>');
const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>FeedOS 16</title><meta name="description" content="FeedOS 16 · sistema operativo del mangimificio: formulazione, acquisti, produzione, qualità, commerciale, economia ed ESG."><link rel="icon" href="${FAVICON}"><meta name="theme-color" content="#101A14">`;
const noscript = `<noscript><div style="max-width:640px;margin:40px auto;font:15px/1.5 Arial,sans-serif;padding:20px">FeedOS 16 ha bisogno di JavaScript. Apri il file con Chrome, Edge, Safari o Firefox.</div></noscript>`;

const t0 = Date.now();
const full = await bundle(true);
const pub = await bundle(false);
const page = js => `<!doctype html><html lang="it"><head>${head}<style>${fontCss}\n${css}</style></head><body><div id="root"></div>${noscript}<script>${js}</script></body></html>`;
fs.writeFileSync(dist('FeedOS-16.html'), page(full.js));
fs.writeFileSync(dist('FeedOS-16-demo.html'), page(pub.js));
fs.writeFileSync(dist('artifact/feedos-16.html'), `<title>FeedOS 16</title><style>${fontCss}\n${css}</style><div id="root"></div><script>${pub.js}</script>`);
const kb = f => (fs.statSync(dist(f)).size / 1024).toFixed(0) + ' KB';
console.log(`build in ${Date.now() - t0} ms · completa ${kb('FeedOS-16.html')} · pubblica ${kb('FeedOS-16-demo.html')} · artifact ${kb('artifact/feedos-16.html')}`);
if (process.argv.includes('--meta')) console.log(await esbuild.analyzeMetafile(full.meta, { verbose: false }));
const leak = ['Galtieri', 'Modugno', '89.450', '58.759.661'].filter(w => pub.js.includes(w));
if (leak.length) { console.error('ATTENZIONE: la versione pubblica contiene', leak); process.exitCode = 1; }
