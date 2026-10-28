/* DifesaOS · Illustrazioni disegnate dall'app (SVG): sintomi delle prove del demo e confezioni dei prodotti.
 * Non sono fotografie: ogni immagine porta la scritta «illustrazione» e nell'interfaccia il segno «illustrazione dimostrativa».
 * I sintomi sono in proporzione alla gravità misurata nella tesi (severity 0–1), con un seme fisso per la stessa immagine. */
import { rng } from '../../core/util.js';

const W = 480, H = 360;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = v => Math.round(v * 10) / 10;
export const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function frame(body, { bg = ['#E6EBE0'], tag = 'illustrazione dimostrativa' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<rect width="${W}" height="${H}" fill="${bg[0]}"/>${body}`
    + `<rect x="${W - 168}" y="${H - 32}" width="160" height="24" rx="12" fill="#3B3F44"/><text x="${W - 88}" y="${H - 16}" font-family="sans-serif" font-size="12" fill="#fff" text-anchor="middle">${esc(tag)}</text></svg>`;
}

// macchie e sintomi
const oilSpot = (R, x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#e8d45a" opacity="0.75"/><circle cx="${f1(x + R.range(-1, 1))}" cy="${f1(y + R.range(-1, 1))}" r="${f1(r * 0.45)}" fill="#8a6a2a" opacity="0.55"/>`;
const scabSpot = (R, x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#3f4a2a" opacity="0.85"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.35)}" fill="none" stroke="#6b6a3a" stroke-width="1.2" opacity="0.5"/>`;
const peacockSpot = (R, x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.6)}" fill="#e2c94a" opacity="0.6"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#3b2b1a" opacity="0.9"/>`;
const powder = (R, x, y, r) => Array.from({ length: 5 }, () => `<circle cx="${f1(x + R.range(-r, r) * 0.6)}" cy="${f1(y + R.range(-r, r) * 0.6)}" r="${f1(r * R.range(0.25, 0.5))}" fill="#f4f4ee" opacity="0.7"/>`).join('');
const mold = (R, x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#8e8f86" opacity="0.85"/>` + Array.from({ length: 7 }, () => `<circle cx="${f1(x + R.range(-r, r))}" cy="${f1(y + R.range(-r, r))}" r="${f1(R.range(1.5, 3.5))}" fill="#c9cac2" opacity="0.8"/>`).join('');
const sting = (R, x, y) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="5" fill="#c9b27a" opacity="0.55"/><path d="M${f1(x - 1.6)} ${f1(y + 1.4)} L${f1(x)} ${f1(y - 2)} L${f1(x + 1.6)} ${f1(y + 1.4)} Z" fill="#2b2016"/>`;

function grappolo(R, sev, symptom) {
  const berries = [];
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const n = Math.max(2, Math.round(7 - i * 0.6 + R.range(-0.5, 0.5)));
    for (let j = 0; j < n; j++) berries.push({ x: 240 + (j - (n - 1) / 2) * 27 + R.range(-4, 4), y: 92 + i * 25 + R.range(-3, 3), r: R.range(12, 14.5) });
  }
  const hit = new Set(R.shuffle(berries.map((_, i) => i)).slice(0, Math.round(berries.length * Math.min(1, sev * 1.15))));
  const leaf = '<path d="M90 60 C150 20 230 30 250 80 C220 70 190 95 170 120 C140 110 110 100 90 60 Z" fill="#5f8f3e" opacity="0.85"/>';
  const stem = '<path d="M240 40 C238 60 242 75 240 92" stroke="#6b5130" stroke-width="5" fill="none"/>';
  const b = berries.map((o, i) => {
    const sick = hit.has(i);
    const fill = sick ? (symptom === 'oidio' ? '#9fae7c' : '#8a6f45') : '#8db35a';
    let s = `<circle cx="${f1(o.x)}" cy="${f1(o.y)}" r="${f1(o.r)}" fill="${fill}" stroke="#5c7a36" stroke-width="0.8"/>`;
    if (sick && symptom === 'oidio') s += powder(R, o.x, o.y, o.r);
    if (sick && symptom !== 'oidio') s += `<path d="M${f1(o.x - o.r * 0.5)} ${f1(o.y)} q ${f1(o.r * 0.5)} ${f1(-o.r * 0.4)} ${f1(o.r)} 0" stroke="#5b4528" stroke-width="1.2" fill="none"/>`;
    return s;
  }).join('');
  return leaf + stem + b;
}

function fogliaVite(R, sev) {
  const leaf = '<path d="M240 330 L238 250 C170 270 95 235 90 175 C120 180 135 165 125 140 C95 120 100 80 140 70 C160 95 185 100 200 85 C190 55 215 25 240 20 C265 25 290 55 280 85 C295 100 320 95 340 70 C380 80 385 120 355 140 C345 165 360 180 390 175 C385 235 310 270 242 250 Z" fill="#6aa043" stroke="#4d7a2e" stroke-width="2"/>';
  const veins = ['M240 250 L240 40', 'M240 210 L130 150', 'M240 210 L350 150', 'M240 160 L165 90', 'M240 160 L315 90'].map(dd => `<path d="${dd}" stroke="#4d7a2e" stroke-width="1.5" fill="none" opacity="0.7"/>`).join('');
  const n = Math.round(sev * 60);
  const spots = Array.from({ length: n }, () => oilSpot(R, R.range(150, 330), R.range(70, 230), R.range(6, 13))).join('');
  return leaf + veins + spots;
}

function foglieOlivo(R, sev) {
  const leaves = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11, x = 70 + t * 340, y = 200 - Math.sin(t * Math.PI) * 60 + (i % 2 ? 28 : -28), a = (i % 2 ? 35 : -35) + R.range(-10, 10);
    leaves.push({ x, y, a, sick: R.next() < sev });
  }
  const twig = '<path d="M50 230 C160 150 300 150 430 190" stroke="#6b5130" stroke-width="6" fill="none"/>';
  return twig + leaves.map(l => `<g transform="translate(${f1(l.x)} ${f1(l.y)}) rotate(${f1(l.a)})"><ellipse rx="44" ry="10" fill="#58784a" stroke="#3f5a33" stroke-width="1"/><ellipse rx="40" ry="4" cy="2" fill="#9fb59a" opacity="0.35"/>${l.sick ? peacockSpot(R, R.range(-22, 22), 0, R.range(4, 6)) : ''}</g>`).join('');
}

function olive(R, sev) {
  const n = 16, out = [];
  const twig = '<path d="M40 120 C160 90 320 100 450 140" stroke="#6b5130" stroke-width="6" fill="none"/>';
  for (let i = 0; i < n; i++) {
    const x = 70 + (i % 8) * 46 + R.range(-6, 6), y = 170 + Math.floor(i / 8) * 80 + R.range(-8, 8);
    const sick = R.next() < sev;
    const col = R.next() < 0.3 ? '#5b3a55' : '#7f9a3a';
    out.push(`<path d="M${f1(x)} ${f1(y - 40)} L${f1(x)} ${f1(y - 22)}" stroke="#6b5130" stroke-width="2"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="17" ry="23" fill="${col}"/>${sick ? sting(R, x + R.range(-6, 6), y + R.range(-6, 8)) : ''}`);
  }
  return twig + out.join('');
}

function fogliaMelo(R, sev) {
  const leaf = '<path d="M240 330 C150 290 110 200 140 120 C165 60 215 35 240 30 C265 35 315 60 340 120 C370 200 330 290 240 330 Z" fill="#5f9a3f" stroke="#447a2a" stroke-width="2"/>';
  const veins = '<path d="M240 330 L240 40" stroke="#447a2a" stroke-width="2.2"/>' + [80, 120, 160, 200, 240, 280].map(y => `<path d="M240 ${y} L${f1(240 - (330 - y) * 0.32)} ${y - 30}" stroke="#447a2a" stroke-width="1.2" opacity="0.7"/><path d="M240 ${y} L${f1(240 + (330 - y) * 0.32)} ${y - 30}" stroke="#447a2a" stroke-width="1.2" opacity="0.7"/>`).join('');
  const n = Math.round(sev * 80);
  return leaf + veins + Array.from({ length: n }, () => scabSpot(R, R.range(160, 320), R.range(70, 290), R.range(3, 7))).join('');
}

function pomodori(R, sev) {
  const out = ['<path d="M60 70 C160 60 300 70 430 90" stroke="#4e7a2e" stroke-width="5" fill="none"/>'];
  const fruits = Array.from({ length: 11 }, (_, i) => ({ x: 85 + i * 31 + R.range(-4, 4), y: 130 + (i % 3) * 52 + R.range(-6, 6), r: R.range(21, 26) }));
  const hit = new Set(R.shuffle(fruits.map((_, i) => i)).slice(0, Math.round(fruits.length * Math.min(1, sev * 1.1))));
  fruits.forEach((o, i) => {
    out.push(`<path d="M${f1(o.x)} ${f1(o.y - o.r - 30)} L${f1(o.x)} ${f1(o.y - o.r)}" stroke="#4e7a2e" stroke-width="2"/><circle cx="${f1(o.x)}" cy="${f1(o.y)}" r="${f1(o.r)}" fill="#d2402c"/><path d="M${f1(o.x - 8)} ${f1(o.y - o.r + 2)} l8 -6 l8 6 l-8 -2 z" fill="#3f6a25"/>`);
    if (hit.has(i)) out.push(mold(R, o.x + R.range(-6, 6), o.y + R.range(-4, 8), o.r * 0.55));
  });
  return out.join('');
}

const DRAW = { grappolo, 'foglia-vite': fogliaVite, 'foglie-olivo': foglieOlivo, olive, 'foglia-melo': fogliaMelo, pomodori };

/** Illustrazione di un sintomo: art = {kind, symptom, severity (0–1), seed} → data URL SVG (null se il disegno non esiste). */
export function symptomArt(art) {
  const draw = DRAW[art?.kind];
  if (!draw) return null;
  const R = rng(+art.seed || 1);
  const sev = Math.max(0, Math.min(1, +art.severity || 0));
  const bg = art.kind === 'pomodori' ? ['#E9ECE6'] : art.kind === 'olive' || art.kind === 'foglie-olivo' ? ['#E8EADF'] : ['#E6EBE0'];
  return svgUrl(frame(draw(R, sev, art.symptom), { bg }));
}

const PACK_COLOR = { rameico: '#2a7f8f', zolfo: '#d9b51c', fungicida: '#2f8a4e', insetticida: '#c4472f', erbicida: '#7a6a2a', biologico: '#6fae3a', biostimolante: '#7a4fa0' };
/** Formato della confezione dal testo dell'imballo («Sacco 10 kg», «Flacone 1 L», …). */
export function packFormat(p) {
  const s = String(p?.packaging || '').toLowerCase();
  if (/flacon|bottigl/.test(s)) return 'flacone';
  if (/tanic/.test(s)) return 'tanica';
  if (/scatol|astucc/.test(s)) return 'scatola';
  if (/sacc|bust/.test(s)) return 'sacco';
  return p?.uom === 'L' ? 'flacone' : 'sacco';
}

/** Illustrazione della confezione di un prodotto (nome, formato, colore per categoria) → data URL SVG. */
export function packArt(p) {
  const R = rng(String(p?.id || p?.code || 'x').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const col = PACK_COLOR[p?.category] || '#3c6e8f';
  const fmt = packFormat(p);
  const name = esc(p?.name || 'Prodotto');
  const size = esc(String(p?.packaging || '').replace(/^\S+\s/, ''));
  const raw = String(p?.name || 'Prodotto');
  const fs = Math.max(11, Math.min(20, Math.floor(150 / (0.62 * Math.max(1, raw.length)))));
  let shape;
  if (fmt === 'flacone') shape = `<path d="M205 70 h70 v28 c30 10 45 30 45 60 v150 c0 12 -8 20 -20 20 h-120 c-12 0 -20 -8 -20 -20 v-150 c0 -30 15 -50 45 -60 z" fill="#f4f6f3" stroke="#9aa59a" stroke-width="2"/><rect x="200" y="45" width="80" height="30" rx="5" fill="${col}"/>`;
  else if (fmt === 'tanica') shape = `<path d="M150 90 h150 l30 30 v185 c0 10 -8 18 -18 18 h-162 c-10 0 -18 -8 -18 -18 v-197 c0 -10 8 -18 18 -18 z" fill="#f4f6f3" stroke="#9aa59a" stroke-width="2"/><rect x="290" y="62" width="34" height="26" rx="4" fill="${col}"/><path d="M175 90 v-25 h80 v25" stroke="#9aa59a" stroke-width="10" fill="none"/>`;
  else if (fmt === 'scatola') shape = `<path d="M150 95 l90 -35 l90 35 v200 l-90 35 l-90 -35 z" fill="#f4f6f3" stroke="#9aa59a" stroke-width="2"/><path d="M150 95 l90 35 l90 -35 M240 130 v200" stroke="#c7cec5" stroke-width="2" fill="none"/>`;
  else shape = `<path d="M150 70 q90 -18 180 0 l12 250 q-102 22 -204 0 z" fill="#f4f6f3" stroke="#9aa59a" stroke-width="2"/><path d="M150 82 q90 -16 180 0" stroke="#c7cec5" stroke-width="3" fill="none"/>`;
  const label = `<rect x="158" y="150" width="164" height="110" rx="8" fill="#fff" stroke="${col}" stroke-width="2"/><rect x="158" y="150" width="164" height="26" rx="8" fill="${col}"/>`
    + `<text x="240" y="168" font-family="sans-serif" font-size="11" fill="#fff" text-anchor="middle">${esc(String(p?.category || '').replace(/^./, c => c.toLocaleUpperCase('it')))}</text>`
    + `<text x="240" y="210" font-family="sans-serif" font-weight="600" font-size="${fs}" fill="#1f2a22" text-anchor="middle">${name}</text>`
    + `<text x="240" y="238" font-family="sans-serif" font-size="12" fill="#55605a" text-anchor="middle">${size}</text>`;
  return svgUrl(frame(shape + label, { bg: ['#ECEEEF'] }));
}
