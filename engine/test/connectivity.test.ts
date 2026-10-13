// spec §4.6 — connectivity discount: k(m) vertex-disjoint vouch paths to the elder set
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, fromDecimal } from '../src/fixed.js';
import { connectivityK, connectivityMultiplier, type VouchLink } from '../src/connectivity.js';

const fp = fromDecimal;
// voucher -> vouchee, as in a VouchRecord; paths run from m to its vouchers, upward
const v = (voucher: string, vouchee: string): VouchLink => ({ voucher, vouchee });

test('connectivityK: two elders vouching m directly give k = 2', () => {
  const edges = [v('E1', 'm'), v('E2', 'm')];
  assert.equal(connectivityK(edges, 'm', ['E1', 'E2']), 2);
  assert.equal(connectivityMultiplier(edges, 'm', ['E1', 'E2']), REP_SCALE);
});

test('connectivityK: paths must not share a vertex (shared elder, shared voucher)', () => {
  // m <- a <- E1 and m <- b <- E1: both paths end at E1
  const sharedElder = [v('E1', 'a'), v('E1', 'b'), v('a', 'm'), v('b', 'm')];
  assert.equal(connectivityK(sharedElder, 'm', ['E1', 'E2']), 1);
  assert.equal(connectivityMultiplier(sharedElder, 'm', ['E1', 'E2']), fp('0.5'));
  // m <- a, and a <- E1, a <- E2: both paths go through a
  const sharedVoucher = [v('a', 'm'), v('E1', 'a'), v('E2', 'a')];
  assert.equal(connectivityK(sharedVoucher, 'm', ['E1', 'E2']), 1);
});

test('connectivityK: an exact search, not greedy (first path must not block the second)', () => {
  // a is vouched by E1 and E2, b only by E1. Taking m-a-E1 first would leave b no elder;
  // m-a-E2 plus m-b-E1 is disjoint, so k = 2.
  const edges = [v('E1', 'a'), v('E2', 'a'), v('E1', 'b'), v('a', 'm'), v('b', 'm')];
  assert.equal(connectivityK(edges, 'm', ['E1', 'E2']), 2);
  // same graph with the elder list and edge list reversed: the answer is a graph property
  assert.equal(connectivityK([...edges].reverse(), 'm', ['E2', 'E1']), 2);
});

test('connectivityK: no path gives 0 and multiplier 0', () => {
  assert.equal(connectivityK([v('a', 'm')], 'm', ['E1']), 0);
  assert.equal(connectivityMultiplier([v('a', 'm')], 'm', ['E1']), 0n);
  assert.equal(connectivityK([], 'm', ['E1', 'E2']), 0);
});

test('connectivityK: direction matters, m vouching an elder is not a path back', () => {
  assert.equal(connectivityK([v('m', 'E1'), v('m', 'E2')], 'm', ['E1', 'E2']), 0);
});

test('connectivityK: search depth CONNECTIVITY_SEARCH_DEPTH = 6 edges', () => {
  // chain m <- n1 <- ... <- n5 <- E1 is 6 edges; one more node makes 7
  const chain = (len: number, elder: string, tag: string): VouchLink[] => {
    const nodes = ['m'];
    for (let i = 1; i < len; i++) nodes.push(`${tag}${i}`);
    nodes.push(elder);
    const out: VouchLink[] = [];
    for (let i = 0; i + 1 < nodes.length; i++) out.push(v(nodes[i + 1]!, nodes[i]!));
    return out;
  };
  assert.equal(connectivityK(chain(6, 'E1', 'p'), 'm', ['E1']), 1);
  assert.equal(connectivityK(chain(7, 'E1', 'p'), 'm', ['E1']), 0);
  assert.equal(connectivityK([...chain(6, 'E1', 'p'), ...chain(7, 'E2', 'q')], 'm', ['E1', 'E2']), 1);
  assert.equal(connectivityK([...chain(6, 'E1', 'p'), ...chain(3, 'E2', 'q')], 'm', ['E1', 'E2']), 2);
});

test('connectivityK: result is min(k, k_target); parallel edges add nothing', () => {
  const edges = [v('E1', 'm'), v('E2', 'm'), v('E3', 'm')];
  assert.equal(connectivityK(edges, 'm', ['E1', 'E2', 'E3']), 2);
  assert.equal(connectivityK([v('E1', 'm'), v('E1', 'm')], 'm', ['E1', 'E2']), 1);
});

test('connectivityK: a path may pass an elder; it still counts once per distinct vertex', () => {
  // m <- E1 <- E2: one path (ends at E1, or continues to E2; either way it uses E1)
  assert.equal(connectivityK([v('E1', 'm'), v('E2', 'E1')], 'm', ['E1', 'E2']), 1);
});

test('connectivityMultiplier: an elder is 1 regardless of its own paths', () => {
  assert.equal(connectivityMultiplier([], 'E1', ['E1']), REP_SCALE);
  assert.equal(connectivityK([], 'E1', ['E1']), 2);
});
