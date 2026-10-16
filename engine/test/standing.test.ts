// spec §4.10 — dormancy and probation windows; §4.5 kin-admission probation; §6.3 definition of N
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingAt, isSuspended, type MemberHistory } from '../src/standing.js';

const none = { dormant: false, reentryProbation: false, kinProbation: false, revoked: false };

function history(p: Partial<MemberHistory> = {}): MemberHistory {
  return { dormancy: [], kinAdmittedAt: null, revokedAt: null, ...p };
}

test('standingAt: a member with no history is in good standing', () => {
  assert.deepEqual(standingAt(history(), 50), none);
  assert.equal(isSuspended(standingAt(history(), 50)), false);
});

test('standingAt: dormant on start <= t < end, then DORMANCY_PROBATION = 14 epochs of re-entry probation', () => {
  const h = history({ dormancy: [{ start: 100, end: 130 }] });
  assert.deepEqual(standingAt(h, 99), none);
  assert.deepEqual(standingAt(h, 100), { ...none, dormant: true });
  assert.deepEqual(standingAt(h, 129), { ...none, dormant: true });
  assert.deepEqual(standingAt(h, 130), { ...none, reentryProbation: true });
  assert.deepEqual(standingAt(h, 143), { ...none, reentryProbation: true });
  assert.deepEqual(standingAt(h, 144), none);
});

test('standingAt: every period counts, in any order', () => {
  const h = history({ dormancy: [{ start: 300, end: 310 }, { start: 100, end: 130 }] });
  assert.deepEqual(standingAt(h, 135), { ...none, reentryProbation: true });
  assert.deepEqual(standingAt(h, 200), none);
  assert.deepEqual(standingAt(h, 305), { ...none, dormant: true });
  assert.deepEqual(standingAt(h, 315), { ...none, reentryProbation: true });
});

test('standingAt: KIN_PROBATION = 45 epochs from the kin-admission epoch', () => {
  const h = history({ kinAdmittedAt: 200 });
  assert.deepEqual(standingAt(h, 199), none);
  assert.deepEqual(standingAt(h, 200), { ...none, kinProbation: true });
  assert.deepEqual(standingAt(h, 244), { ...none, kinProbation: true });
  assert.deepEqual(standingAt(h, 245), none);
});

test('standingAt: revocation is permanent from its epoch; flags are independent', () => {
  const h = history({ revokedAt: 300, kinAdmittedAt: 290, dormancy: [{ start: 280, end: 295 }] });
  assert.deepEqual(standingAt(h, 299), { ...none, reentryProbation: true, kinProbation: true });
  assert.deepEqual(standingAt(h, 300), { dormant: false, reentryProbation: true, kinProbation: true, revoked: true });
  assert.deepEqual(standingAt(h, 5000), { ...none, revoked: true });
});

test('isSuspended: any flag suspends vouching and removes the member from N', () => {
  assert.equal(isSuspended({ ...none, dormant: true }), true);
  assert.equal(isSuspended({ ...none, reentryProbation: true }), true);
  assert.equal(isSuspended({ ...none, kinProbation: true }), true);
  assert.equal(isSuspended({ ...none, revoked: true }), true);
  assert.equal(isSuspended(none), false);
});

test('standingAt: malformed input throws', () => {
  assert.throws(() => standingAt(history(), -1), RangeError);
  assert.throws(() => standingAt(history(), 2.5), RangeError);
  assert.throws(() => standingAt(history({ dormancy: [{ start: 10, end: 10 }] }), 20), RangeError);
  assert.throws(() => standingAt(history({ dormancy: [{ start: -5, end: 3 }] }), 20), RangeError);
  assert.throws(() => standingAt(history({ kinAdmittedAt: 1.5 }), 20), RangeError);
  assert.throws(() => standingAt(history({ revokedAt: -2 }), 20), RangeError);
});
