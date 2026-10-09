// spec §13.6 — golden vectors: the engine reproduces the Python sim within stated tolerance
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAMBDA, REP_SCALE, pow, fromDecimal } from '../src/fixed.js';
import { tierOf, emberWeight, decayedTerm, reputation, type Tier } from '../src/embers.js';

interface WeightCase {
  issuer_tier: Tier; connectivity: string; context: 'proximity' | 'remote'; c: string;
}
interface Vectors {
  meta: { base_unit: string; tolerance: { weight_abs: number; decay_rel: number } };
  decay: Array<{ k: number; expected: number }>;
  tier: Array<{ r: string; expected: Tier }>;
  weight: Array<WeightCase & { expected: number }>;
  reputation: Array<{
    t: number; expected: number;
    embers: Array<WeightCase & { epoch: number }>;
    penalties: Array<{ amount: string; epoch: number }>;
  }>;
}

// dist/test/ -> engine/vectors/
const V: Vectors = JSON.parse(
  readFileSync(new URL('../../vectors/ember.json', import.meta.url), 'utf8'),
) as Vectors;
const TOL = V.meta.tolerance;
const BASE = fromDecimal(V.meta.base_unit);
const toFloat = (x: bigint): number => Number(x) / Number(REP_SCALE);
const weightOf = (w: WeightCase): bigint =>
  emberWeight({
    baseUnit: BASE, issuerTier: w.issuer_tier, connectivity: fromDecimal(w.connectivity),
    context: w.context, C: fromDecimal(w.c),
  });

test('vectors file is non-trivial', () => {
  assert.ok(V.decay.length >= 10 && V.tier.length >= 10);
  assert.ok(V.weight.length >= 50 && V.reputation.length >= 10);
});

test('decay: pow(LAMBDA, k) within decay_rel of 0.5^(k/90)', () => {
  for (const { k, expected } of V.decay) {
    const got = toFloat(pow(LAMBDA, k));
    assert.ok(Math.abs(got - expected) <= TOL.decay_rel * expected, `k=${k}: ${got} vs ${expected}`);
  }
});

test('tier: exact agreement', () => {
  for (const { r, expected } of V.tier) assert.equal(tierOf(fromDecimal(r)), expected, `r=${r}`);
});

test('weight: within weight_abs', () => {
  for (const [i, w] of V.weight.entries()) {
    const got = toFloat(weightOf(w));
    assert.ok(Math.abs(got - w.expected) <= TOL.weight_abs, `weight[${i}]: ${got} vs ${w.expected}`);
  }
});

test('reputation: within the per-term bound', () => {
  for (const [i, r] of V.reputation.entries()) {
    const embers = r.embers.map((e) => ({ weight: weightOf(e), epoch: e.epoch }));
    const penalties = r.penalties.map((p) => ({ weight: fromDecimal(p.amount), epoch: p.epoch }));
    const terms = [...embers, ...penalties].map((x) => toFloat(decayedTerm(x.weight, x.epoch, r.t)));
    const bound = terms.reduce((s, x) => s + TOL.decay_rel * Math.abs(x) + TOL.weight_abs + 1e-6, 0);
    const got = toFloat(reputation(embers, penalties, r.t));
    assert.ok(Math.abs(got - r.expected) <= bound, `reputation[${i}]: ${got} vs ${r.expected} (bound ${bound})`);
  }
});
