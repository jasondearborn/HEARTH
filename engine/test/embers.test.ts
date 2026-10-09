// spec §5.1, §5.2, §4.2, §13.6 — Ember weight, decay and reputation in fixed point
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, LAMBDA, mul, div, pow, fromDecimal } from '../src/fixed.js';
import {
  tierOf, tierMultiplier, proximityMultiplier, diminishingFactor, emberWeight,
  decayedTerm, reputation, type Tier,
} from '../src/embers.js';

const fp = fromDecimal;

test('tierOf uses the §4.2 thresholds, lower bound inclusive', () => {
  const cases: Array<[string, Tier]> = [
    ['0', 'Stranger'], ['0.099999', 'Stranger'], ['0.1', 'Member'], ['0.399999', 'Member'],
    ['0.4', 'Trusted'], ['0.749999', 'Trusted'], ['0.75', 'Steward-eligible'],
    ['12', 'Steward-eligible'],
  ];
  for (const [r, want] of cases) assert.equal(tierOf(fp(r)), want, `tierOf(${r})`);
});

test('tierMultiplier follows §5.2.3; Strangers cannot issue (§5.2.1)', () => {
  assert.equal(tierMultiplier('Member'), fp('1.0'));
  assert.equal(tierMultiplier('Trusted'), fp('1.5'));
  assert.equal(tierMultiplier('Steward-eligible'), fp('2.0'));
  assert.throws(() => tierMultiplier('Stranger'), RangeError);
});

test('proximityMultiplier follows §5.2.4', () => {
  assert.equal(proximityMultiplier('proximity'), fp('1.0'));
  assert.equal(proximityMultiplier('remote'), fp('0.4'));
});

test('diminishingFactor is div(REP_SCALE, REP_SCALE + C) (§13.6 rule 5)', () => {
  assert.equal(diminishingFactor(0n), REP_SCALE);
  assert.equal(diminishingFactor(REP_SCALE), 500_000n);
  assert.equal(diminishingFactor(2n * REP_SCALE), 333_333n);
  assert.equal(diminishingFactor(fp('0.5')), 666_667n);
  assert.throws(() => diminishingFactor(-1n), RangeError);
});

test('emberWeight folds left to right, rounding at each step (§13.6 rule 5)', () => {
  const x = {
    baseUnit: fp('0.08'), issuerTier: 'Trusted' as Tier, connectivity: fp('0.75'),
    context: 'remote' as const, C: fp('2'),
  };
  const want = mul(mul(mul(mul(fp('0.08'), fp('1.5')), fp('0.75')), fp('0.4')), div(REP_SCALE, fp('3')));
  assert.equal(emberWeight(x), want);
  assert.equal(emberWeight(x), 12_000n); // 0.036 / 3
  assert.throws(() => emberWeight({ ...x, issuerTier: 'Stranger' }), RangeError);
});

test('decayedTerm is mul(weight, pow(LAMBDA, t - epoch)) and rejects future epochs', () => {
  assert.equal(decayedTerm(fp('1'), 10, 10), fp('1'));
  assert.equal(decayedTerm(fp('1'), 0, 90), 500_003n);
  assert.equal(decayedTerm(80_000n, 3, 50), mul(80_000n, pow(LAMBDA, 47)));
  assert.throws(() => decayedTerm(fp('1'), 11, 10), RangeError);
});

test('reputation sums terms exactly, subtracts penalties, clamps at 0 (§5.1, §13.6 rule 6)', () => {
  const embers = [{ weight: fp('0.08'), epoch: 0 }, { weight: fp('0.12'), epoch: 45 }];
  const t = 90;
  const want = decayedTerm(fp('0.08'), 0, t) + decayedTerm(fp('0.12'), 45, t);
  assert.equal(reputation(embers, [], t), want);
  const pen = [{ weight: fp('0.05'), epoch: 60 }];
  assert.equal(reputation(embers, pen, t), want - decayedTerm(fp('0.05'), 60, t));
  assert.equal(reputation(embers, [{ weight: fp('10'), epoch: 90 }], t), 0n);
  assert.equal(reputation([], [], t), 0n);
});

test('reputation is term-by-term, not a running total (§13.6 rule 6)', () => {
  // A running total R <- mul(R, LAMBDA) rounds at every step; the canonical form rounds once
  // per term. They differ for this history, and the canonical one is required.
  const w = 7n;
  const embers = Array.from({ length: 50 }, (_, e) => ({ weight: w, epoch: e }));
  const t = 49;
  let running = 0n;
  for (let e = 0; e <= t; e++) running = mul(running, LAMBDA) + w;
  const canonical = embers.reduce((s, x) => s + mul(w, pow(LAMBDA, t - x.epoch)), 0n);
  assert.notEqual(running, canonical);
  assert.equal(reputation(embers, [], t), canonical);
});
