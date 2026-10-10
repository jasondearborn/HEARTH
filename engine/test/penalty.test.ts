// spec §6.6, §6.5, §4.7, §13.6 — transitive, decaying penalty for one conviction
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, LAMBDA, pow, fromDecimal } from '../src/fixed.js';
import {
  PENALTY_FLOOR, decayedLinkage, penaltyFraction, transitivePenalties, type VouchEdge,
} from '../src/penalty.js';

const fp = fromDecimal;
const T = 1000;

function edge(voucher: string, vouchee: string, p: Partial<VouchEdge> = {}): VouchEdge {
  return { voucher, vouchee, admittedAt: T, linkageWeight: REP_SCALE, ...p };
}
function snapshot(...members: string[]): Map<string, bigint> {
  return new Map(members.map((m) => [m, REP_SCALE]));
}

test('PENALTY_FLOOR is the §6.6 floor 0.01', () => {
  assert.equal(PENALTY_FLOOR, fp('0.01'));
});

test('decayedLinkage decays from admitted_at with LAMBDA (§4.7, LINKAGE_HALF_LIFE = H)', () => {
  assert.equal(decayedLinkage(edge('a', 'b'), T), REP_SCALE);
  assert.equal(decayedLinkage(edge('a', 'b', { admittedAt: T - 90 }), T), 500_003n);
  assert.equal(decayedLinkage(edge('a', 'b', { admittedAt: T - 7, linkageWeight: fp('1.5') }), T),
    (fp('1.5') * pow(LAMBDA, 7) + REP_SCALE / 2n) / REP_SCALE);
  assert.throws(() => decayedLinkage(edge('a', 'b', { admittedAt: T + 1 }), T), RangeError);
});

test('penaltyFraction reproduces the §6.6 table with unit linkage', () => {
  const one = (n: number): bigint[] => Array(n).fill(REP_SCALE);
  assert.equal(penaltyFraction(0, one(1)), 250_000n);
  assert.equal(penaltyFraction(1, one(2)), 87_500n);
  assert.equal(penaltyFraction(2, one(3)), 30_625n);
  assert.equal(penaltyFraction(3, one(4)), 10_719n);
  assert.equal(penaltyFraction(4, one(5)), 3_752n);
});

test('penaltyFraction folds P_dir, pow(g, h), then w1..w(h+1) nearest-first (§6.6 step 3)', () => {
  // the other two orders give 28 044
  assert.equal(penaltyFraction(1, [326_681n, 981_098n]), 28_045n);
  assert.throws(() => penaltyFraction(1, [REP_SCALE]), RangeError);
  assert.throws(() => penaltyFraction(-1, []), RangeError);
});

test('a unit chain gets the table, stops below the floor, and amounts use the snapshot', () => {
  const edges = [edge('e', 'x'), edge('d', 'e'), edge('c', 'd'), edge('b', 'c'), edge('a', 'b')];
  const snap = snapshot('a', 'b', 'c', 'd', 'x');
  snap.set('e', fp('0.8'));
  const got = transitivePenalties(edges, 'x', T, snap);
  assert.deepEqual(got.map((p) => [p.member, p.hop, p.fraction]), [
    ['b', 3, 10_719n], ['c', 2, 30_625n], ['d', 1, 87_500n], ['e', 0, 250_000n],
  ]);
  assert.equal(got.find((p) => p.member === 'e')!.amount, 200_000n);
  assert.equal(got.find((p) => p.member === 'd')!.amount, 87_500n);
  assert.deepEqual(got.find((p) => p.member === 'b')!.path, ['b', 'c', 'd', 'e', 'x']);
});

test('order-sensitive weights through transitivePenalties match penaltyFraction', () => {
  const edges = [edge('a', 'x', { linkageWeight: 326_681n }), edge('b', 'a', { linkageWeight: 981_098n })];
  const got = transitivePenalties(edges, 'x', T, snapshot('a', 'b'));
  assert.equal(got.find((p) => p.member === 'b')!.fraction, 28_045n);
});

test('PENALTY_CAP_PER_INCIDENT applies after the multiplication (kin stake 1.5)', () => {
  const got = transitivePenalties([edge('v', 'x', { linkageWeight: fp('1.5') })], 'x', T, snapshot('v'));
  assert.deepEqual(got.map((p) => [p.member, p.fraction]), [['v', fp('0.3')]]);
});

test('linkage decays to the conviction epoch; a fully decayed edge is not traversed (§4.7)', () => {
  const half = transitivePenalties([edge('v', 'x', { admittedAt: T - 90 })], 'x', T, snapshot('v'));
  assert.deepEqual(half.map((p) => p.fraction), [125_001n]);
  // pow(LAMBDA, 600) = 9 843 < 0.01: the edge carries no exposure, so nothing propagates through it,
  // although u's heavy edge would otherwise give u 0.0875 * 0.009843 * 20 = 0.0172 at hop 1
  const old = [edge('v', 'x', { admittedAt: T - 600 }), edge('u', 'v', { linkageWeight: fp('20') })];
  assert.deepEqual(transitivePenalties(old, 'x', T, snapshot('u', 'v')), []);
});

test('edges admitted after the conviction epoch are ignored', () => {
  const got = transitivePenalties([edge('v', 'x', { admittedAt: T + 1 }), edge('w', 'x')], 'x', T,
    snapshot('v', 'w'));
  assert.deepEqual(got.map((p) => p.member), ['w']);
});

test('several paths: the largest fraction applies, never the sum', () => {
  // v is hop 0 via a decayed edge (0.25 * 0.1 = 0.025) and hop 1 via a (0.0875)
  const edges = [edge('v', 'x', { linkageWeight: fp('0.1') }), edge('a', 'x'), edge('v', 'a')];
  const got = transitivePenalties(edges, 'x', T, snapshot('a', 'v'));
  const v = got.find((p) => p.member === 'v')!;
  assert.deepEqual([v.hop, v.fraction, v.path], [1, 87_500n, ['v', 'a', 'x']]);
  // diamond: two equal hop-1 paths do not add up
  const diamond = [edge('a', 'x'), edge('b', 'x'), edge('v', 'a'), edge('v', 'b')];
  const d = transitivePenalties(diamond, 'x', T, snapshot('a', 'b', 'v'));
  assert.equal(d.find((p) => p.member === 'v')!.fraction, 87_500n);
});

test('a tie between paths keeps the smallest hop', () => {
  // hop 0 at weight 0.35 gives 0.0875, the same as hop 1 at unit weight
  const edges = [edge('v', 'x', { linkageWeight: fp('0.35') }), edge('a', 'x'), edge('v', 'a')];
  const v = transitivePenalties(edges, 'x', T, snapshot('a', 'v')).find((p) => p.member === 'v')!;
  assert.deepEqual([v.hop, v.fraction], [0, 87_500n]);
});

test('cycles terminate and the convicted member is never penalised', () => {
  const edges = [edge('a', 'x'), edge('x', 'a'), edge('b', 'a'), edge('a', 'b')];
  const got = transitivePenalties(edges, 'x', T, snapshot('a', 'b', 'x'));
  assert.deepEqual(got.map((p) => [p.member, p.hop]), [['a', 0], ['b', 1]]);
});

test('compounding kin stake (g*w > 1) spreads past hop 3, bounded by the cap (§6.6 finding)', () => {
  const w = fp('3.375');
  const names = ['x', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'];
  const edges = names.slice(1).map((m, i) => edge(m, names[i]!, { linkageWeight: w }));
  const got = transitivePenalties(edges, 'x', T, snapshot(...names));
  assert.equal(got.length, 6);
  for (const p of got) assert.equal(p.fraction, fp('0.3'));
});

test('output is sorted by member and independent of edge order', () => {
  const edges = [edge('e', 'x'), edge('d', 'e'), edge('c', 'd'), edge('z', 'x', { linkageWeight: fp('0.5') }),
    edge('c', 'z'), edge('b', 'c')];
  const snap = snapshot('b', 'c', 'd', 'e', 'z');
  const want = transitivePenalties(edges, 'x', T, snap);
  assert.deepEqual(want.map((p) => p.member), ['b', 'c', 'd', 'e', 'z']);
  let seed = 7;
  for (let i = 0; i < 20; i++) {
    const shuffled = [...edges];
    for (let j = shuffled.length - 1; j > 0; j--) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      const k = seed % (j + 1);
      [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
    }
    assert.deepEqual(transitivePenalties(shuffled, 'x', T, snap), want);
  }
});

test('a penalised member missing from the snapshot is an error (§6.5)', () => {
  assert.throws(() => transitivePenalties([edge('v', 'x')], 'x', T, new Map()), RangeError);
});
