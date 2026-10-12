// spec §4.9, §4.9.1 — bridge weight (overlap discount) and source-tribe eligibility gate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, fromDecimal } from '../src/fixed.js';
import { bridgeWeight, bridgeSourceFailures, type BridgeSource } from '../src/bridge.js';

const fp = fromDecimal;

test('bridgeWeight: BASE_BRIDGE_WEIGHT x (1 - overlap), capped at BRIDGE_WEIGHT_CAP', () => {
  assert.equal(bridgeWeight(0n), fp('0.05')); // zero overlap: full base weight (= cap at defaults)
  assert.equal(bridgeWeight(REP_SCALE), 0n); // identical rosters: nothing
  assert.equal(bridgeWeight(fp('0.5')), fp('0.025'));
  assert.equal(bridgeWeight(fp('0.2')), fp('0.04'));
  // fixed-point mul rounds half-even at REP_SCALE: 0.05 x 0.999999 = 0.04999995 -> 0.050000
  assert.equal(bridgeWeight(fp('0.000001')), fp('0.05'));
  // 0.05 x 0.000001 = 0.00000005 -> 0 (half-even at the 1e-6 unit)
  assert.equal(bridgeWeight(fp('0.999999')), 0n);
});

test('bridgeWeight: never exceeds the cap and never increases with overlap', () => {
  let prev = bridgeWeight(0n);
  for (let o = 0n; o <= REP_SCALE; o += 12_345n) {
    const w = bridgeWeight(o);
    assert.ok(w <= fp('0.05'), `overlap ${o}`);
    assert.ok(w >= 0n);
    assert.ok(w <= prev, `monotone at ${o}`);
    prev = w;
  }
});

test('bridgeWeight: overlap outside [0, 1] is a RangeError', () => {
  assert.throws(() => bridgeWeight(-1n), RangeError);
  assert.throws(() => bridgeWeight(REP_SCALE + 1n), RangeError);
});

const good: BridgeSource = {
  checkpointHistoryEpochs: 90,
  activeMembers: 12,
  federationRated: true,
  sourceCheckpointEpoch: 993,
  admissionEpoch: 1000,
};

test('bridgeSourceFailures: a source meeting every bar has no failures', () => {
  assert.deepEqual(bridgeSourceFailures(good), []);
  assert.deepEqual(bridgeSourceFailures({ ...good, sourceCheckpointEpoch: 1000 }), []); // same epoch is fresh
});

test('bridgeSourceFailures: each bar of §4.9 (i)-(iv) is reported by name, in order', () => {
  assert.deepEqual(bridgeSourceFailures({ ...good, checkpointHistoryEpochs: 89 }), ['age']);
  assert.deepEqual(bridgeSourceFailures({ ...good, activeMembers: 11 }), ['size']);
  assert.deepEqual(bridgeSourceFailures({ ...good, federationRated: false }), ['unrated']);
  assert.deepEqual(bridgeSourceFailures({ ...good, sourceCheckpointEpoch: 992 }), ['stale']); // 8 epochs old
  assert.deepEqual(
    bridgeSourceFailures({ checkpointHistoryEpochs: 2, activeMembers: 2, federationRated: false, sourceCheckpointEpoch: 1, admissionEpoch: 1000 }),
    ['age', 'size', 'unrated', 'stale'],
  );
});

test('bridgeSourceFailures: a proof anchored after the admission epoch is "future"', () => {
  assert.deepEqual(bridgeSourceFailures({ ...good, sourceCheckpointEpoch: 1001 }), ['future']);
});

test('bridgeSourceFailures: negative or non-integer counts are a RangeError', () => {
  assert.throws(() => bridgeSourceFailures({ ...good, activeMembers: -1 }), RangeError);
  assert.throws(() => bridgeSourceFailures({ ...good, checkpointHistoryEpochs: 1.5 }), RangeError);
});
