import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../../src/data/demo/generator.js';
import { sum, byId } from '../../src/core/util.js';
test('mangimificio dimostrativo coerente', () => {
  const t0 = performance.now();
  const d = generateDemo({ today: '2026-09-23' });
  const ms = performance.now() - t0;
  const d2 = generateDemo({ today: '2026-09-23' });
  assert.equal(JSON.stringify(d).length, JSON.stringify(d2).length, 'deterministico');
  const prodT = sum(d.runs, r => r.tonnes), shipT = sum(d.shipments, s => s.tonnes), rev = sum(d.shipments, s => s.tonnes * s.price);
  console.log(`generato in ${ms.toFixed(0)} ms · JSON ${(JSON.stringify(d).length/1024).toFixed(0)} KB`);
  console.log(`produzione ${prodT.toFixed(0)} t · spedito ${shipT.toFixed(0)} t · ricavi ${(rev/1e6).toFixed(2)} M€ · runs ${d.runs.length} · lotti ${d.lots.length} · lotti MP ${d.ingLots.length} · spedizioni ${d.shipments.length}`);
  console.log(`clienti ${d.customers.length} · reclami ${d.complaints.length} · visite ${d.visits.length} · offerte ${d.offers.length} · quotazioni ${d.market.length} · piano ${d.plan.length} · energia ${d.energy.length} mesi`);
  const kwh = sum(d.energy, e => e.kwhGrid + e.kwhPV - e.kwhExport), gpl = sum(d.energy, e => e.gplKg);
  console.log(`energia elettrica ${Math.round(kwh)} kWh (${(kwh/prodT).toFixed(1)} kWh/t) · GPL ${Math.round(gpl)} kg (${(gpl/prodT).toFixed(2)} kg/t) · FV ${sum(d.energy,e=>e.kwhPV)} kWh`);
  console.log('prezzi listino', d.products.map(p => p.code + ' ' + p.listPrice).join(', '));
  console.log('AFB1 bloccati', d.ingLots.filter(l => l.status === 'bloccato').map(l => l.code + ' ' + l.analyses.AFB1).join(', '));
  console.log('scorte', d.ingredients.map(i => i.id + ' ' + i.stock).join(', '));
  // bilanci di massa: ogni lotto di prodotto ha composizione pari a tonnellate × 1000 kg
  for (const l of d.lots) { const kg = sum(l.comp, c => c.kg); assert.ok(Math.abs(kg - l.tonnes * 1000) < 2, l.code + ' composizione ' + kg + ' vs ' + l.tonnes); }
  // spedito ≤ prodotto per lotto
  const lotShip = {}; for (const s of d.shipments) lotShip[s.lotId] = (lotShip[s.lotId] || 0) + s.tonnes;
  const lotById = byId(d.lots);
  for (const [id, t] of Object.entries(lotShip)) assert.ok(t <= lotById[id].tonnes + 0.01, 'spedito oltre il prodotto per ' + id);
  // nessun lotto bloccato usato
  const blocked = new Set(d.ingLots.filter(l => l.status === 'bloccato').map(l => l.id));
  for (const l of d.lots) for (const c of l.comp) assert.ok(!blocked.has(c.l), 'lotto bloccato usato');
  assert.ok(prodT > 40000 && prodT < 80000);
});
