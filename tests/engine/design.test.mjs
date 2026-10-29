/* Regole grafiche dell'interfaccia (richieste dall'utente il 28/10/2026), controllate su tutti i fogli di stile e i componenti:
 * 1. spaziature (padding, margin, gap) solo in multipli di 8 px, anche negli stili in linea;
 * 2. una palette neutra: niente gradienti e niente bagliori (text-shadow, drop-shadow, ombre colorate);
 * 3. niente emoticon né simboli usati come icone: icone a linea da react-icons/lu;
 * 4. due soli pesi dei caratteri (400 e 600) e niente maiuscolo;
 * 6. grafici con linee sottili (spessore al massimo 2).
 * I file dei pacchetti ancora in costruzione si controllano quando entrano nel ramo (IN_CORSO). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const IN_CORSO = ['esg-piano'];
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : ext.some(x => e.name.endsWith(x)) ? [path.join(dir, e.name)] : []));
const skip = f => IN_CORSO.some(k => path.basename(f).startsWith(k));
const CSS = walk(path.join(ROOT, 'src/styles'), ['.css']).filter(f => !skip(f));
const UI = walk(path.join(ROOT, 'src'), ['.jsx']).filter(f => !skip(f));
const ART = [path.join(ROOT, 'src/editions/agrofarmaci/art.js')];
const rel = f => path.relative(ROOT, f);
const lines = f => fs.readFileSync(f, 'utf8').split('\n');
// i commenti non contano
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

function scan(files, rules) {
  const bad = [];
  for (const f of files) {
    const text = strip(fs.readFileSync(f, 'utf8')).split('\n');
    text.forEach((l, i) => { for (const [name, rx, ok] of rules) for (const m of l.matchAll(rx)) if (!ok || !ok(m)) bad.push(`${rel(f)}:${i + 1} ${name}: ${m[0].trim().slice(0, 60)}`); });
  }
  return bad;
}
const mult8 = v => Math.abs(parseFloat(v)) % 8 === 0;
const PROP = '(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap';

test('spaziature in multipli di 8 px nei fogli di stile e negli stili in linea', () => {
  const cssDecl = new RegExp(`(?<![\\w-])(?:${PROP})\\s*:\\s*([^;}{]+)`, 'g');
  const bad = scan(CSS, [['spaziatura', cssDecl, m => [...m[1].matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)].every(x => x[2] === 'px' && mult8(x[1]))]]);
  const KEYS = 'padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingInline|paddingBlock|margin|marginTop|marginBottom|marginLeft|marginRight|marginInline|marginBlock|gap|rowGap|columnGap';
  bad.push(...scan(UI, [
    ['spaziatura in linea', new RegExp(`(?<![\\w.])(?:${KEYS})\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(?![\\w.%])`, 'g'), m => mult8(m[1])],
    ['spaziatura in linea', new RegExp(`(?<![\\w.])(?:${KEYS})\\s*:\\s*['"]([^'"]*)['"]`, 'g'), m => [...m[1].matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)].every(x => x[2] === 'px' && mult8(x[1]))],
  ]));
  assert.deepEqual(bad, []);
});

test('palette neutra: niente gradienti e niente bagliori', () => {
  const bad = scan([...CSS, ...UI, ...ART], [
    ['gradiente', /(?:linear|radial|conic)-gradient\(|<(?:linear|radial)Gradient/g],
    ['bagliore', /text-shadow\s*:|drop-shadow\(|textShadow\s*:/g],
  ]);
  // ombre: solo neutre (rgba nere o i gettoni --shadow) o bordi interni (inset); mai aloni colorati
  bad.push(...scan(CSS, [['ombra colorata', /box-shadow\s*:([^;}]*)/gi, m => !/(?:#[0-9a-f]{3,8}|color-mix|var\(--(?!shadow|overlay)[\w-]+\))/i.test(m[1]) || /^\s*inset\b/.test(m[1])]]));
  assert.deepEqual(bad, []);
});

test('niente emoticon né simboli usati come icone nei componenti', () => {
  const bad = scan(UI, [['simbolo', /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}▲▼◆✓✗✕↗]/gu]]);
  assert.deepEqual(bad, []);
});

test('due soli pesi dei caratteri (400 e 600) e niente maiuscolo', () => {
  const W = new Set(['400', '600', 'normal', 'inherit']);
  const bad = scan(CSS, [
    ['peso', /font-weight\s*:\s*([\w-]+)/g, m => W.has(m[1])],
    ['peso', /(?<![\w-])font\s*:\s*(\d{3})\b/g, m => W.has(m[1])],
    ['maiuscolo', /text-transform\s*:\s*uppercase/g],
  ]);
  bad.push(...scan([...UI, ...ART], [
    ['peso in linea', /fontWeight\s*:\s*['"]?(\w+)/g, m => W.has(m[1])],
    ['peso in linea', /(?<![\w-])font\s*:\s*['"`](\d{3})\b/g, m => W.has(m[1])],
    ['peso SVG', /font-weight="?(\w+)/g, m => W.has(m[1])],
    ['maiuscolo', /textTransform\s*:\s*['"]uppercase|(?<!charAt\(0\))\.toUpperCase\(\)/g],
  ]));
  assert.deepEqual(bad, []);
});

test('grafici con linee sottili', () => {
  const charts = [path.join(ROOT, 'src/ui/charts.jsx'), path.join(ROOT, 'src/ui/ui.jsx')];
  const bad = scan(charts, [['linea spessa', /strokeWidth=\{?["']?(\d+(?:\.\d+)?)/g, m => parseFloat(m[1]) <= 2]]);
  assert.deepEqual(bad, []);
});
