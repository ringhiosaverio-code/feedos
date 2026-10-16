/* FeedOS 16 · Programmazione lineare (simplesso a due fasi, tableau denso).
 * Minimizza c·x con vincoli A x (<=,>=,=) b e limiti lb <= x <= ub.
 * Restituisce anche i valori duali (prezzi ombra: derivata di z rispetto a b_i) e i costi ridotti,
 * necessari per l'analisi di sensibilità della formulazione.
 * Nessuna dipendenza esterna. Dimensioni tipiche: 10–120 variabili, 10–200 vincoli. */

const TOL = 1e-9;

/**
 * @param {{c:number[], A:number[][], b:number[], types:string[], lb?:number[], ub?:number[]}} p
 * @param {{maxIter?:number}} [opt]
 */
export function solveLP(p, opt = {}) {
  const n = p.c.length;
  const m0 = p.A.length;
  const maxIter = opt.maxIter || 50000;
  if (p.b.length !== m0 || p.types.length !== m0) return { status: 'error', message: 'Dimensioni non coerenti' };
  for (const row of p.A) if (row.length !== n) return { status: 'error', message: 'Riga di lunghezza errata' };
  const all = [...p.c, ...p.b, ...p.A.flat()];
  if (all.some(v => !Number.isFinite(v))) return { status: 'error', message: 'Valori non numerici' };
  const lb = p.lb ? p.lb.slice() : new Array(n).fill(0);
  const ub = p.ub ? p.ub.slice() : new Array(n).fill(Infinity);
  for (let j = 0; j < n; j++) {
    if (!Number.isFinite(lb[j])) return { status: 'error', message: 'Limite inferiore non finito' };
    if (ub[j] < lb[j] - 1e-9) return { status: 'infeasible', reason: 'bounds', variable: j };
  }

  // 1. sostituzione x = lb + x'
  const rows = [];
  for (let i = 0; i < m0; i++) {
    const a = p.A[i];
    let bi = p.b[i];
    for (let j = 0; j < n; j++) bi -= a[j] * lb[j];
    rows.push({ a: a.slice(), b: bi, type: p.types[i], orig: i, kind: 'row' });
  }
  // 2. limiti superiori come righe esplicite
  for (let j = 0; j < n; j++) {
    if (Number.isFinite(ub[j])) {
      const a = new Array(n).fill(0); a[j] = 1;
      rows.push({ a, b: ub[j] - lb[j], type: '<=', orig: j, kind: 'ub' });
    }
  }
  const m = rows.length;
  // 3. scala delle righe e segno di b
  for (const r of rows) {
    let mx = 0;
    for (const v of r.a) mx = Math.max(mx, Math.abs(v));
    r.scale = mx > 0 ? 1 / mx : 1;
    if (r.scale !== 1) { r.a = r.a.map(v => v * r.scale); r.b *= r.scale; }
    r.flip = 1;
    if (r.b < 0) {
      r.flip = -1; r.a = r.a.map(v => -v); r.b = -r.b;
      r.type = r.type === '<=' ? '>=' : r.type === '>=' ? '<=' : '=';
    }
  }
  // 4. colonne ausiliarie
  let col = n;
  const slackCol = new Array(m).fill(-1), artCol = new Array(m).fill(-1), initBasic = new Array(m);
  for (let i = 0; i < m; i++) {
    const r = rows[i];
    if (r.type === '<=') { slackCol[i] = col++; initBasic[i] = slackCol[i]; }
    else if (r.type === '>=') { slackCol[i] = col++; }
  }
  const firstArt = col;
  for (let i = 0; i < m; i++) {
    const r = rows[i];
    if (r.type !== '<=') { artCol[i] = col++; initBasic[i] = artCol[i]; }
  }
  const N = col; // numero di colonne (senza termine noto)
  const W = N + 1;
  // tableau: m righe di vincolo + 1 riga dei costi ridotti
  const T = new Float64Array((m + 1) * W);
  const at = (i, j) => T[i * W + j];
  for (let i = 0; i < m; i++) {
    const r = rows[i], base = i * W;
    for (let j = 0; j < n; j++) T[base + j] = r.a[j];
    if (r.type === '<=') T[base + slackCol[i]] = 1;
    else if (r.type === '>=') { T[base + slackCol[i]] = -1; T[base + artCol[i]] = 1; }
    else T[base + artCol[i]] = 1;
    T[base + N] = r.b;
  }
  const basis = initBasic.slice();
  const isArt = j => j >= firstArt;
  let iter = 0;

  function pivot(pr, pc) {
    const rb = pr * W, pv = T[rb + pc];
    for (let j = 0; j < W; j++) T[rb + j] /= pv;
    for (let i = 0; i <= m; i++) {
      if (i === pr) continue;
      const ib = i * W, f = T[ib + pc];
      if (f === 0) continue;
      for (let j = 0; j < W; j++) T[ib + j] -= f * T[rb + j];
      T[ib + pc] = 0;
    }
    basis[pr] = pc;
    iter++;
  }

  function setObjective(cost) { // riga m = c_j - c_B B^-1 A_j ; ultima colonna = -z
    const ob = m * W;
    for (let j = 0; j < W; j++) T[ob + j] = j < N ? cost[j] : 0;
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]];
      if (cb === 0) continue;
      const ib = i * W;
      for (let j = 0; j < W; j++) T[ob + j] -= cb * T[ib + j];
    }
  }

  function run(blocked) {
    let bland = false, stall = 0, lastObj = Infinity;
    while (iter < maxIter) {
      const ob = m * W;
      let pc = -1, best = -TOL * 10;
      for (let j = 0; j < N; j++) {
        if (blocked(j)) continue;
        const rc = T[ob + j];
        if (bland) { if (rc < -1e-9) { pc = j; break; } }
        else if (rc < best) { best = rc; pc = j; }
      }
      if (pc < 0) return 'optimal';
      let pr = -1, minRatio = Infinity;
      for (let i = 0; i < m; i++) {
        const v = T[i * W + pc];
        if (v > 1e-11) {
          const ratio = T[i * W + N] / v;
          if (ratio < minRatio - 1e-12 || (Math.abs(ratio - minRatio) <= 1e-12 && pr >= 0 && basis[i] < basis[pr])) { minRatio = ratio; pr = i; }
        }
      }
      if (pr < 0) return 'unbounded';
      pivot(pr, pc);
      const obj = -T[m * W + N];
      if (obj < lastObj - 1e-12) { lastObj = obj; stall = 0; }
      else if (++stall > 50) bland = true; // anti-ciclo
    }
    return 'iteration_limit';
  }

  // Fase 1
  const hasArt = firstArt < N;
  if (hasArt) {
    const c1 = new Float64Array(N);
    for (let j = firstArt; j < N; j++) c1[j] = 1;
    setObjective(c1);
    const s1 = run(() => false);
    if (s1 === 'iteration_limit') return { status: 'error', message: 'Limite di iterazioni (fase 1)', iterations: iter };
    const infeas = -T[m * W + N];
    if (infeas > 1e-7 * Math.max(1, ...rows.map(r => Math.abs(r.b)))) {
      return { status: 'infeasible', reason: 'constraints', infeasibility: infeas, iterations: iter };
    }
    // espelli le artificiali rimaste in base (degeneri)
    for (let i = 0; i < m; i++) {
      if (!isArt(basis[i])) continue;
      let pc = -1;
      for (let j = 0; j < firstArt; j++) if (Math.abs(T[i * W + j]) > 1e-9) { pc = j; break; }
      if (pc >= 0) pivot(i, pc); // altrimenti riga ridondante: l'artificiale resta a zero
    }
  }
  // Fase 2
  const c2 = new Float64Array(N);
  for (let j = 0; j < n; j++) c2[j] = p.c[j];
  setObjective(c2);
  const s2 = run(j => isArt(j));
  if (s2 !== 'optimal') return { status: s2 === 'unbounded' ? 'unbounded' : 'error', message: s2, iterations: iter };

  // Soluzione
  const xp = new Float64Array(N);
  for (let i = 0; i < m; i++) xp[basis[i]] = T[i * W + N];
  const x = new Array(n);
  for (let j = 0; j < n; j++) x[j] = lb[j] + (Math.abs(xp[j]) < 1e-10 ? 0 : xp[j]);
  let objective = 0;
  for (let j = 0; j < n; j++) objective += p.c[j] * x[j];

  // Duali: y = c_B B^-1 ; B^-1 = colonne della base iniziale (slack o artificiale di ogni riga)
  const yN = new Array(m).fill(0);
  for (let r = 0; r < m; r++) {
    const cj = initBasic[r];
    let s = 0;
    for (let i = 0; i < m; i++) {
      const cb = basis[i] < n ? p.c[basis[i]] : 0;
      if (cb !== 0) s += cb * T[i * W + cj];
    }
    yN[r] = s;
  }
  // riporta i duali alle righe originali (segno e scala)
  const duals = new Array(m0).fill(0);
  const boundDuals = new Array(n).fill(0);
  for (let r = 0; r < m; r++) {
    const R = rows[r];
    const y = yN[r] * R.flip * R.scale;
    if (R.kind === 'row') duals[R.orig] = clean(y);
    else boundDuals[R.orig] = clean(y);
  }
  // costi ridotti rispetto ai soli vincoli originali: rc_j = c_j - y·A_j (i duali dei limiti superiori sono separati)
  const reducedCosts = new Array(n);
  for (let j = 0; j < n; j++) {
    let s = p.c[j];
    for (let i = 0; i < m0; i++) s -= duals[i] * p.A[i][j];
    reducedCosts[j] = clean(s);
  }
  // attività e scarti dei vincoli originali
  const activity = p.A.map(a => a.reduce((s, v, j) => s + v * x[j], 0));
  const slack = activity.map((v, i) => p.types[i] === '>=' ? v - p.b[i] : p.types[i] === '<=' ? p.b[i] - v : Math.abs(v - p.b[i]));
  const binding = slack.map((s, i) => Math.abs(s) <= 1e-7 * Math.max(1, Math.abs(p.b[i])));
  const atUpper = x.map((v, j) => Number.isFinite(ub[j]) && Math.abs(ub[j] - v) <= 1e-7 * Math.max(1, Math.abs(ub[j])));
  const atLower = x.map((v, j) => Math.abs(v - lb[j]) <= 1e-7 * Math.max(1, Math.abs(lb[j])));
  return { status: 'optimal', x, objective, duals, boundDuals, reducedCosts, activity, slack, binding, atUpper, atLower, iterations: iter };
}

function clean(v) { return Math.abs(v) < 1e-12 ? 0 : v; }
