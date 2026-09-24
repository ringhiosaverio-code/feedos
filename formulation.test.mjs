import test from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENTS, SPECS } from '../../src/data/demo/catalog.js';
import { optimize, checkSpec, priceRange, carbonFrontier, diagnose, afb1Check, formulaCost } from '../../src/engine/formulation.js';
import { SPECIES } from '../../src/engine/nutrients.js';
const byId = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));
const P = spec => ({ ingredients: INGREDIENTS, spec, lines: [], options: { contaminant: { AFB1: { 'giovani_lattifere': 5, 'altri_adulti': 20, 'altri': 10 }[SPECIES[spec.species].afb1] } } });

test('tutte le specifiche dimostrative hanno una soluzione conforme', () => {
  for (const spec of SPECS) {
    const r = optimize(P(spec));
    assert.equal(r.status, 'optimal', spec.name + ': ' + r.status);
    const tot = r.lines.reduce((s, l) => s + l.kg, 0);
    assert.ok(Math.abs(tot - 1000) < 1e-3, spec.name + ' totale 1000 kg: ' + tot);
    const chk = checkSpec(r.lines, byId, spec);
    assert.ok(chk.ok, spec.name + ' fuori specifica: ' + JSON.stringify(chk.items.filter(x => x.status !== 'ok')));
    const af = afb1Check(r.lines, byId, spec.species);
    assert.ok(af.value <= af.limit + 1e-9, 'AFB1 entro il limite');
    console.log(`${spec.name.padEnd(42)} ${r.cost.toFixed(2).padStart(7)} €/t · ${r.co2.toFixed(0).padStart(4)} kg CO2e/t · co-prodotti ${(r.coShare*100).toFixed(0)}% · ${r.lines.length} ingredienti · ${r.lines.slice(0,4).map(l=>l.ing+' '+l.kg.toFixed(0)).join(', ')}`);
  }
});

test('i prezzi ombra coincidono con le differenze finite', () => {
  let checked = 0;
  for (const spec of SPECS) {
    const base = optimize(P(spec));
    for (const c of base.constraints.filter(c => c.kind === 'nut' && c.binding && Math.abs(c.shadow) > 1e-6)) {
      const eps = Math.max(1e-5, Math.abs(c.bound) * 1e-4);
      const mk = sgn => ({ ...spec, constraints: spec.constraints.map(k => k.nut === c.nut && (k.basis || 'tq') === c.basis ? { ...k, [c.side]: +k[c.side] + sgn * eps } : k) });
      const rp = optimize(P(mk(1))), rm = optimize(P(mk(-1)));
      if (rp.status !== 'optimal' || rm.status !== 'optimal') continue;
      const fdp = (rp.cost - base.cost) / eps, fdm = (base.cost - rm.cost) / eps;
      const fd = Math.abs(fdp - c.shadow) < Math.abs(fdm - c.shadow) ? fdp : fdm;
      assert.ok(Math.abs(fd - c.shadow) < Math.max(0.01 * Math.abs(c.shadow), 0.02), `${spec.name} ${c.nut} ${c.side}: ombra ${c.shadow} vs differenze finite ${fdp} / ${fdm}`);
      checked++;
    }
  }
  console.log('prezzi ombra verificati:', checked);
  assert.ok(checked > 20);
});

test('prezzo di convenienza: sotto entra, sopra resta escluso', () => {
  const spec = SPECS.find(s => s.id === 'sp-si15');
  const base = optimize(P(spec));
  const out = base.ingredients.filter(i => !i.used && i.entryPrice != null && i.entryPrice > 5 && i.entryPrice < i.price);
  assert.ok(out.length > 3);
  for (const i of out.slice(0, 6)) {
    const below = optimize({ ...P(spec), options: { ...P(spec).options, priceOverrides: { [i.id]: i.entryPrice - 2 } } });
    const above = optimize({ ...P(spec), options: { ...P(spec).options, priceOverrides: { [i.id]: i.entryPrice + 2 } } });
    assert.ok((below.lines.find(l => l.ing === i.id)?.kg || 0) > 0.01, i.id + ' dovrebbe entrare sotto ' + i.entryPrice);
    assert.ok(!(above.lines.find(l => l.ing === i.id)?.kg > 0.01), i.id + ' non dovrebbe entrare sopra ' + i.entryPrice);
  }
});

test('intervallo di prezzo e frontiera costo–CO2', () => {
  const spec = SPECS.find(s => s.id === 'sp-vl18');
  const base = optimize(P(spec));
  const main = base.lines[0].ing;
  const rg = priceRange(P(spec), main, base);
  assert.ok(rg.up == null || rg.up >= rg.price);
  assert.ok(rg.down == null || rg.down <= rg.price);
  const fr = carbonFrontier(P(spec), 6);
  assert.ok(fr.length >= 3);
  for (let k = 1; k < fr.length; k++) { assert.ok(fr[k].co2 <= fr[k-1].co2 + 1e-6); assert.ok(fr[k].cost >= fr[k-1].cost - 1e-6); }
  console.log('frontiera latte 18%:', fr.map(f => `${f.co2.toFixed(0)} kg → ${f.cost.toFixed(2)} €`).join(' | '));
  console.log('intervallo', main, rg);
});

test('diagnosi di una specifica impossibile', () => {
  const spec = { ...SPECS[0], constraints: [...SPECS[0].constraints.filter(c => c.nut !== 'PG' && c.nut !== 'FG'), { nut: 'PG', min: 30, max: 32, basis: 'tq' }, { nut: 'FG', min: null, max: 3, basis: 'tq' }] };
  const r = optimize(P(spec));
  assert.equal(r.status, 'infeasible');
  const d = diagnose(P(spec));
  assert.ok(d.tips.length >= 1);
  console.log('diagnosi:', d.tips.map(t => t.nut).join(', '), '· PG max raggiungibile', d.extremes.PG.max.toFixed(1));
});
