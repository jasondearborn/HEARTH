// spec §6.6 — PENALTY_CAP_AGGREGATE across incidents (aggregate cap computation); §2.4 windows
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromDecimal, mul } from '../src/fixed.js';
import type { TransitivePenalty } from '../src/penalty.js';
import { applyAggregateCap, type Incident } from '../src/aggregate.js';

const fp = fromDecimal;
const hash = (c: string): string => c.repeat(64);

function pen(member: string, fraction: string, R: bigint, hop = 0): TransitivePenalty {
  const f = fp(fraction);
  return { member, hop, path: [member], fraction: f, amount: mul(f, R) };
}

const R = { v: fp('0.8'), w: fp('0.5') };
const snapshot = new Map(Object.entries(R));

function incident(epoch: number, h: string, penalties: TransitivePenalty[]): Incident {
  return { convictionEpoch: epoch, convictionHash: hash(h), penalties, snapshot };
}

// applied fraction of the first penalty of incident i
const applied = (out: ReturnType<typeof applyAggregateCap>, i: number): bigint => out[i]!.penalties[0]!.applied;

test('applyAggregateCap: a single incident under the cap is unchanged', () => {
  const out = applyAggregateCap([incident(100, 'a', [pen('v', '0.30', R.v)])]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.convictionHash, hash('a'));
  assert.deepEqual(out[0]!.penalties, [
    { member: 'v', hop: 0, fraction: fp('0.30'), applied: fp('0.30'), amount: mul(fp('0.30'), R.v) },
  ]);
});

test('applyAggregateCap: later incidents are clipped to the 0.40 headroom, then to 0', () => {
  const out = applyAggregateCap([
    incident(100, 'a', [pen('v', '0.30', R.v)]),
    incident(105, 'b', [pen('v', '0.30', R.v)]),
    incident(110, 'c', [pen('v', '0.25', R.v, 1)]),
  ]);
  assert.deepEqual([0, 1, 2].map((i) => applied(out, i)), [fp('0.30'), fp('0.10'), 0n]);
  assert.equal(out[1]!.penalties[0]!.amount, mul(fp('0.10'), R.v));
  // a member clipped to zero stays listed, with amount 0 and its pre-cap fraction kept
  assert.deepEqual(out[2]!.penalties[0], { member: 'v', hop: 1, fraction: fp('0.25'), applied: 0n, amount: 0n });
});

test('applyAggregateCap: the rolling window is 30 epochs ending at the incident (t - 30 < e <= t)', () => {
  const base = [
    incident(100, 'a', [pen('v', '0.30', R.v)]),
    incident(105, 'b', [pen('v', '0.30', R.v)]), // applied 0.10
  ];
  // at 130, epoch 100 has left the window: used = 0.10, headroom 0.30
  const at130 = applyAggregateCap([...base, incident(130, 'c', [pen('v', '0.30', R.v)])]);
  assert.equal(applied(at130, 2), fp('0.30'));
  // at 129, epoch 100 is still inside: used = 0.40, headroom 0
  const at129 = applyAggregateCap([...base, incident(129, 'c', [pen('v', '0.30', R.v)])]);
  assert.equal(applied(at129, 2), 0n);
});

test('applyAggregateCap: used sums applied fractions, not pre-cap ones', () => {
  const out = applyAggregateCap([
    incident(100, 'a', [pen('v', '0.30', R.v)]),
    incident(101, 'b', [pen('v', '0.30', R.v)]), // applied 0.10 of 0.30
    incident(130, 'c', [pen('v', '0.30', R.v)]), // window (100, 130]: only epoch 101's 0.10 counts
  ]);
  assert.equal(applied(out, 2), fp('0.30'));
});

test('applyAggregateCap: conviction order is epoch, then hash; input order does not matter', () => {
  const x = incident(100, 'b', [pen('v', '0.30', R.v)]);
  const y = incident(100, 'a', [pen('v', '0.30', R.v)]);
  const z = incident(99, 'f', [pen('w', '0.20', R.w)]);
  const out = applyAggregateCap([x, y, z]);
  assert.deepEqual(out.map((i) => i.convictionHash), [hash('f'), hash('a'), hash('b')]);
  assert.equal(applied(out, 1), fp('0.30')); // 'a' first in epoch 100
  assert.equal(applied(out, 2), fp('0.10'));
});

test('applyAggregateCap: members are capped independently; amounts use each incident snapshot', () => {
  const other = new Map([['v', fp('0.4')], ['w', fp('0.9')]]);
  const out = applyAggregateCap([
    incident(100, 'a', [pen('v', '0.30', R.v), pen('w', '0.30', R.w, 1)]),
    { convictionEpoch: 101, convictionHash: hash('b'), snapshot: other, penalties: [pen('v', '0.30', fp('0.4')), pen('w', '0.05', fp('0.9'), 2)] },
  ]);
  assert.deepEqual(out[1]!.penalties.map((p) => [p.member, p.applied, p.amount]), [
    ['v', fp('0.10'), mul(fp('0.10'), fp('0.4'))],
    ['w', fp('0.05'), mul(fp('0.05'), fp('0.9'))],
  ]);
});

test('applyAggregateCap: malformed input throws', () => {
  assert.throws(() => applyAggregateCap([incident(1, 'a', []), incident(2, 'a', [])]), RangeError); // duplicate hash
  assert.throws(() => applyAggregateCap([{ ...incident(1, 'a', []), convictionHash: 'XYZ' }]), RangeError);
  assert.throws(() => applyAggregateCap([incident(1, 'a', [pen('nobody', '0.1', fp('0.5'))])]), RangeError); // no snapshot entry
  assert.throws(() => applyAggregateCap([incident(-1, 'a', [])]), RangeError);
});

test('applyAggregateCap: no incidents, no output', () => {
  assert.deepEqual(applyAggregateCap([]), []);
});
