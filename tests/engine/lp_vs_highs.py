"""Confronto del simplesso di FeedOS con HiGHS (scipy) su problemi di formulazione casuali."""
import json, subprocess, numpy as np
from scipy.optimize import linprog
rng = np.random.default_rng(20260923)
def make(n, k):
    # ingredienti con 'nutrienti' casuali; vincolo di somma = 1000 kg; min/max su nutrienti; limiti di inclusione
    N = rng.uniform(0, 1, (k, n)) * rng.choice([1, 10, 50, 0.5], size=(k, 1))
    N[:, rng.choice(n, size=max(1, n // 5), replace=False)] *= rng.uniform(2, 6)
    price = rng.uniform(0.05, 1.2, n)  # €/kg
    A, b, t = [], [], []
    A.append([1.0] * n); b.append(1000.0); t.append('=')
    ref = rng.dirichlet(np.ones(n)) * 1000  # una miscela di riferimento (garantisce spesso la fattibilità)
    for i in range(k):
        v = N[i] @ ref
        kind = rng.choice(['>=', '<=', 'both'])
        if kind in ('>=', 'both'): A.append(list(N[i])); b.append(float(v * rng.uniform(0.85, 1.0))); t.append('>=')
        if kind in ('<=', 'both'): A.append(list(N[i])); b.append(float(v * rng.uniform(1.0, 1.15))); t.append('<=')
    ub = [float(x) if rng.random() < 0.6 else float('inf') for x in rng.uniform(80, 700, n)]
    lb = [float(x) if rng.random() < 0.15 else 0.0 for x in rng.uniform(5, 40, n)]
    for j in range(n):
        if ub[j] < lb[j]: ub[j] = lb[j] + 50
    return dict(c=list(price), A=[list(map(float, r)) for r in A], b=b, types=t, lb=lb, ub=ub)
probs = [make(int(rng.integers(6, 45)), int(rng.integers(3, 25))) for _ in range(400)]
res = json.loads(subprocess.run(['node', 'tests/engine/lp_runner.mjs'], input=json.dumps(probs, allow_nan=False).replace('Infinity', '1e308') if False else json.dumps([{**p, 'ub': [u if u != float('inf') else 1e300 for u in p['ub']]} for p in probs]), capture_output=True, text=True, check=True).stdout)
agree = infeas = mism = dual_ok = dual_cmp = 0; worst = 0; times = []; bounds_ok = []
for p, r in zip(probs, res):
    A = np.array(p['A']); b = np.array(p['b']); t = p['types']
    Aub = [A[i] if t[i] == '<=' else -A[i] for i in range(len(t)) if t[i] != '=']
    bub = [b[i] if t[i] == '<=' else -b[i] for i in range(len(t)) if t[i] != '=']
    Aeq = [A[i] for i in range(len(t)) if t[i] == '=']; beq = [b[i] for i in range(len(t)) if t[i] == '=']
    bounds = list(zip(p['lb'], [None if u == float('inf') else u for u in p['ub']]))
    h = linprog(p['c'], A_ub=Aub or None, b_ub=bub or None, A_eq=Aeq or None, b_eq=beq or None, bounds=bounds, method='highs')
    if h.status == 2:
        infeas += 1
        if r['status'] != 'infeasible': mism += 1; print('MISMATCH infeas', r['status'])
        continue
    if h.status != 0: continue
    if r['status'] != 'optimal': mism += 1; print('MISMATCH', r['status'], h.message); continue
    times.append(r['ms'])
    rel = abs(r['objective'] - h.fun) / max(1, abs(h.fun)); worst = max(worst, rel)
    if rel < 1e-7: agree += 1
    else: mism += 1; print('OBJ diff', rel)
    # duali: confronto con i marginali di HiGHS (segno: dz/db)
    y = np.array(r['duals'])
    hy = []; iu = ie = 0
    for i in range(len(t)):
        if t[i] == '=': hy.append(h.eqlin.marginals[ie]); ie += 1
        elif t[i] == '<=': hy.append(h.ineqlin.marginals[iu]); iu += 1
        else: hy.append(-h.ineqlin.marginals[iu]); iu += 1
    hy = np.array(hy)
    # verifica indipendente dall'unicità: segni corretti e scarti complementari
    x = np.array(r['x']); act = A @ x
    ok = True
    for i in range(len(t)):
        if t[i] == '>=' and y[i] < -1e-7: ok = False
        if t[i] == '<=' and y[i] > 1e-7: ok = False
        slack = act[i] - b[i]
        if abs(slack) > 1e-6 * max(1, abs(b[i])) and abs(y[i]) > 1e-7: ok = False
    dual_ok += ok
    if np.allclose(y, hy, atol=1e-6, rtol=1e-5): dual_cmp += 1
    rc = np.array(r['reducedCosts']); bd = np.array(r['boundDuals'])
    # HiGHS: lower.marginals >= 0 sui limiti inferiori attivi, upper.marginals <= 0 sui superiori
    lo = np.array(h.lower.marginals); up = np.array(h.upper.marginals)
    atl = np.array(r['atLower']); atu = np.array(r['atUpper'])
    exp_rc = lo + up  # costo ridotto totale = c - yA ; noi separiamo: rc (senza ub) e bd (duale del limite superiore)
    rc_ok = np.allclose(rc - bd, lo, atol=1e-6, rtol=1e-5) and np.allclose(bd, up, atol=1e-6, rtol=1e-5)
    bounds_ok.append(rc_ok)
print(f'problemi: {len(probs)} · non ammissibili (concordi): {infeas} · ottimi concordi: {agree} · discordanze: {mism} · scarto relativo max: {worst:.2e}')
print(f'duali coerenti (segno + scarti complementari): {dual_ok}/{agree} · identici a HiGHS: {dual_cmp}/{agree}')
print(f'tempo medio {np.mean(times):.2f} ms · max {np.max(times):.2f} ms')

print(f'costi ridotti e duali dei limiti identici a HiGHS: {sum(bounds_ok)}/{len(bounds_ok)}')
