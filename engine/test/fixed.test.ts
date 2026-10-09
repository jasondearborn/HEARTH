// Fixed-point reputation arithmetic. spec §13.6, spec §5.1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, LAMBDA, roundDiv, mul, div, fromDecimal, pow } from '../src/fixed.js';

test('REP_SCALE is 10^6 (spec App. D: REP_SCALE)', () => {
  assert.equal(REP_SCALE, 1_000_000n);
});

test('roundDiv rounds the exact rational half-to-even, sign-symmetric (§13.6 rule 2)', () => {
  const cases: Array<[bigint, bigint, bigint]> = [
    [5n, 2n, 2n], [7n, 2n, 4n], [3n, 2n, 2n], [1n, 2n, 0n],
    [-5n, 2n, -2n], [-7n, 2n, -4n], [-3n, 2n, -2n], [-1n, 2n, 0n],
    [5n, -2n, -2n], [-5n, -2n, 2n],
    [1n, 3n, 0n], [2n, 3n, 1n], [-2n, 3n, -1n], [-1n, 3n, 0n],
    [0n, 7n, 0n], [6n, 3n, 2n], [-6n, 3n, -2n],
  ];
  for (const [n, d, want] of cases) assert.equal(roundDiv(n, d), want, `roundDiv(${n}, ${d})`);
});

test('roundDiv by zero throws RangeError', () => {
  assert.throws(() => roundDiv(1n, 0n), RangeError);
});

test('mul rounds after each multiplication', () => {
  assert.equal(mul(1_500_000n, 1_500_000n), 2_250_000n);
  assert.equal(mul(1n, 500_000n), 0n); // 0.5 -> even 0
  assert.equal(mul(3n, 500_000n), 2n); // 1.5 -> even 2
  assert.equal(mul(5n, 500_000n), 2n); // 2.5 -> even 2
  assert.equal(mul(-3n, 500_000n), -2n);
  assert.equal(mul(80_000n, 1_000_000n), 80_000n);
});

test('mul is exact beyond 2^53 (§13.6 rule 1)', () => {
  const a = 123_456_789_000_000n; // 123456789 units
  assert.equal(mul(a, a), 15_241_578_750_190_521_000_000n);
});

test('div rounds half-to-even and rejects zero divisor', () => {
  assert.equal(div(1_000_000n, 3_000_000n), 333_333n);
  assert.equal(div(2_000_000n, 3_000_000n), 666_667n);
  assert.equal(div(1_000_000n, 1_000_000n), 1_000_000n);
  assert.equal(div(-2_000_000n, 3_000_000n), -666_667n);
  assert.throws(() => div(1n, 0n), RangeError);
});

test('fromDecimal converts exactly or rejects (§13.6 rule 3)', () => {
  assert.equal(fromDecimal('0.08'), 80_000n);
  assert.equal(fromDecimal('1.5'), 1_500_000n);
  assert.equal(fromDecimal('90'), 90_000_000n);
  assert.equal(fromDecimal('0.10'), 100_000n);
  assert.equal(fromDecimal('-0.25'), -250_000n);
  assert.equal(fromDecimal('0.000001'), 1n);
  assert.equal(fromDecimal('0'), 0n);
  for (const bad of ['0.0000001', '1e-3', 'abc', '', '.5', '1.', '+1', '0x10', ' 1', '1.2.3']) {
    assert.throws(() => fromDecimal(bad), RangeError, `fromDecimal(${JSON.stringify(bad)})`);
  }
});

test('LAMBDA is 992328 for H = 90 (§13.6 rule 4)', () => {
  assert.equal(LAMBDA, 992_328n);
  // Exact check that LAMBDA = round(0.5^(1/90) * 10^6): with x = LAMBDA, S = REP_SCALE,
  // ((x - 1/2)/S)^90 < 1/2 < ((x + 1/2)/S)^90, i.e. 2(2x-1)^90 < (2S)^90 < 2(2x+1)^90.
  const x = LAMBDA;
  const twoS90 = (2n * REP_SCALE) ** 90n;
  assert.ok(2n * (2n * x - 1n) ** 90n < twoS90);
  assert.ok(twoS90 < 2n * (2n * x + 1n) ** 90n);
});

test('pow is the rounded left fold, with fixed golden values (§13.6 rule 4)', () => {
  const golden: Array<[number, bigint]> = [
    [0, 1_000_000n], [1, 992_328n], [30, 793_701n], [90, 500_003n],
    [180, 250_004n], [365, 60_138n], [730, 3_619n],
  ];
  for (const [k, want] of golden) assert.equal(pow(LAMBDA, k), want, `pow(LAMBDA, ${k})`);
});

test('pow matches a step-by-step fold for every k in 0..400 and another base', () => {
  for (const base of [LAMBDA, 1_500_000n, 333_333n]) {
    let acc = REP_SCALE;
    for (let k = 0; k <= 400; k++) {
      assert.equal(pow(base, k), acc, `pow(${base}, ${k})`);
      acc = mul(acc, base);
    }
  }
});

test('pow rejects negative or non-integer exponents', () => {
  assert.throws(() => pow(LAMBDA, -1), RangeError);
  assert.throws(() => pow(LAMBDA, 1.5), RangeError);
  assert.throws(() => pow(LAMBDA, Number.NaN), RangeError);
});

test('pow drift against exact 0.5^(k/90) stays under 0.1% up to two years', () => {
  for (const k of [90, 180, 365, 730]) {
    const exact = 0.5 ** (k / 90) * 1e6;
    const got = Number(pow(LAMBDA, k));
    assert.ok(Math.abs(got - exact) / exact < 1e-3, `k=${k}: ${got} vs ${exact}`);
  }
});
