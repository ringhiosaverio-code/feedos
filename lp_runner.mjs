import { solveLP } from '../../src/engine/lp.js';
import fs from 'fs';
const probs = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = probs.map(p => { if (p.ub) p.ub = p.ub.map(u => u >= 1e299 ? Infinity : u); const t0 = performance.now(); const r = solveLP(p); r.ms = performance.now() - t0; return r; });
process.stdout.write(JSON.stringify(out));
