// spec §4.5 — voucher-independence rule (escalation form), kin-admission stake
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, fromDecimal } from '../src/fixed.js';
import {
  buildVouchGraph, hopIndependent, admittingSet, independent, kinStakeMult, kinLinkageWeight,
  kinProbationEpochs, independenceHops, type VouchGraph,
} from '../src/independence.js';
import { type VouchEdge } from '../src/penalty.js';

const fp = fromDecimal;

const T = 1000;
function edge(voucher: string, vouchee: string, p: Partial<VouchEdge> = {}): VouchEdge {
  return { voucher, vouchee, admittedAt: T, linkageWeight: fp('1.0'), ...p };
}

const edges: { voucher: string; vouchee: string }[] = [
  { voucher: 'a', vouchee: 'b' }, // a→b
  { voucher: 'b', vouchee: 'c' }, // b→c: a..c one hop via b
  { voucher: 'a', vouchee: 'd' }, // a→d
];

test('hopIndependent: direct and neighbour links within h=2 are not independent', () => {
  const g = buildVouchGraph(edges);
  // A direct vouch edge is a path of 1: excluded for any h >= 1, included at h = 0.
  assert.equal(hopIndependent(g, 'a', 'b', 1), false);
  assert.equal(hopIndependent(g, 'a', 'b', 2), false);
  assert.equal(hopIndependent(g, 'a', 'b', 0), true);
  // Two edges (a-b-c): excluded only at h = 2.
  assert.equal(hopIndependent(g, 'a', 'c', 1), true);
  assert.equal(hopIndependent(g, 'a', 'c', 2), false);
  assert.equal(hopIndependent(g, 'b', 'd', 1), true); // b-a-d, 2 edges
  assert.equal(hopIndependent(g, 'b', 'd', 2), false);
});

test('hopIndependent: h=2 excludes common vouch-neighbours; disjoint nodes pass', () => {
  // b and c are both vouched by a: they share a common vouch-neighbour, exactly §4.5(a)'s case
  const g = buildVouchGraph([
    { voucher: 'a', vouchee: 'b' },
    { voucher: 'a', vouchee: 'c' },
  ]);
  assert.equal(hopIndependent(g, 'b', 'c', 2), false);
  assert.equal(hopIndependent(g, 'b', 'c', 1), true); // out of budget
  // isolated voucher outside the component
  const g2 = buildVouchGraph([{ voucher: 'p', vouchee: 'q' }]);
  assert.equal(hopIndependent(g2, 'p', 'r', 2), true);
  const g3: VouchGraph = buildVouchGraph([]);
  assert.equal(hopIndependent(g3, 'm', 'n', 0), true);
  assert.equal(hopIndependent(g3, 'm', 'n', 5), true);
});

test('edge cases: negative hop throws', () => {
  const g = buildVouchGraph([]);
  assert.throws(() => hopIndependent(g, 'a', 'b', -1), RangeError);
});

test('admittingSet: who originally vouched the member in, sorted', () => {
  const e: VouchEdge[] = [...edges.map((x) => edge(x.voucher, x.vouchee)), edge('z', 'b', { linkageWeight: fp('1.5') })];
  assert.deepEqual(admittingSet(e, 'b'), ['a', 'z']);
  assert.deepEqual(admittingSet(e, 'a'), []);
});

test('independent: both checks together', () => {
  const e: VouchEdge[] = [...edges.map((x) => edge(x.voucher, x.vouchee)), edge('z', 'b'), edge('z', 'd')]; // z vouched b and d in
  const g = buildVouchGraph(e);
  // b-z-d is 2 edges: not independent at the default h = 2
  assert.equal(independent(g, 'b', 'd', 2, ['a', 'z'], ['a']), false);
  assert.equal(independent(g, 'b', 'd', 1, ['a', 'z'], ['a']), true); // out of budget
  // hop-independent pair whose admitting sets are identical mirrors the duplicate-groups attack
  const e2: VouchEdge[] = [...edges.map((x) => edge(x.voucher, x.vouchee)), edge('k', 'y'), edge('k', 'v')];
  const g2 = buildVouchGraph(e2);
  assert.equal(independent(g2, 'y', 'v', 2, ['k'], ['k']), false); // identical admit sets
  assert.equal(independent(g2, 'd', 'y', 2, ['a'], ['k']), true); // disjoint components, different sets
});

test('parameters carry their App. D names and defaults', () => {
  assert.equal(independenceHops(), 2);
  assert.equal(kinProbationEpochs(), 45);
  assert.equal(kinStakeMult(0), fp('1.0'));
  assert.equal(kinStakeMult(1), fp('1.5'));
  assert.equal(kinStakeMult(2), fp('2.25'));
});

test('kinLinkageWeight scales the decayed linkage by the compounding multiplier', () => {
  const e = edge('a', 'b', { admittedAt: T });
  const base = fp('1.0');
  const w = kinLinkageWeight(e, T, 1);
  // 1.0 × 1.5 (REP_SCALE rounding): 1.5 within tolerance
  const diff = w - fp('1.5');
  assert.ok(diff < 1000n && diff > -1000n, `kin weight ${w}`);
  // Second repeat of the same pair: 2.25
  const w2 = kinLinkageWeight(e, T, 2);
  const diff2 = w2 - fp('2.25');
  assert.ok(diff2 < 3000n && diff2 > -3000n, `kin weight 2 ${w2}`);
  void base;
});

test('REP_SCALE remains 1e6 and the graph is undirected (§4.5 note)', () => {
  assert.equal(REP_SCALE, 1_000_000n);
  const g = buildVouchGraph(edges);
  // The voucher side of a→b sees b, and b sees a
  assert.ok(g.adjacency.get('a')!.has('b'));
  assert.ok(g.adjacency.get('b')!.has('a'));
});
