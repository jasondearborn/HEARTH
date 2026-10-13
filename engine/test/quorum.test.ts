// spec §6.3 — quorum, small-tribe rule, definition of N; §6.4 appeal window as gate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quorum, appealIsGate, activeTribeSize, type RosterEntry } from '../src/quorum.js';

test('quorum: standard rule max(3, ceil(0.25 N)) for N >= 12', () => {
  assert.equal(quorum(12), 3);
  assert.equal(quorum(13), 4); // ceil(3.25)
  assert.equal(quorum(16), 4);
  assert.equal(quorum(17), 5);
  assert.equal(quorum(100), 25);
  assert.equal(quorum(150), 38); // ceil(37.5)
});

test('quorum: small-tribe rule max(3, ceil(0.5 N)) for N < 12, with the 11 -> 12 step', () => {
  assert.equal(quorum(11), 6);
  assert.equal(quorum(8), 4);
  assert.equal(quorum(7), 4); // ceil(3.5)
  assert.equal(quorum(5), 3);
  assert.equal(quorum(3), 3);
  assert.equal(quorum(1), 3); // the floor can exceed N: conviction is then impossible
  assert.equal(quorum(0), 3);
});

test('quorum: exact integer ceiling, no float error at multiples', () => {
  for (let n = 12; n <= 400; n++) assert.equal(quorum(n), Math.max(3, Math.floor((n + 3) / 4)), `N=${n}`);
  for (let n = 0; n < 12; n++) assert.equal(quorum(n), Math.max(3, Math.floor((n + 1) / 2)), `N=${n}`);
});

test('quorum: rejects a negative or non-integer N', () => {
  assert.throws(() => quorum(-1), RangeError);
  assert.throws(() => quorum(12.5), RangeError);
  assert.throws(() => quorum(Number.NaN), RangeError);
});

test('appealIsGate: the appeal window gates penalty only below 12 (§6.4)', () => {
  assert.equal(appealIsGate(11), true);
  assert.equal(appealIsGate(0), true);
  assert.equal(appealIsGate(12), false);
  assert.equal(appealIsGate(40), false);
  assert.throws(() => appealIsGate(-2), RangeError);
});

const ok: RosterEntry = { id: 'x', dormant: false, revoked: false, reentryProbation: false, kinProbation: false };

test('activeTribeSize: counts only members eligible as distinct complainants', () => {
  const roster: RosterEntry[] = [
    { ...ok, id: 'a' },
    { ...ok, id: 'b' },
    { ...ok, id: 'c', dormant: true },
    { ...ok, id: 'd', revoked: true },
    { ...ok, id: 'e', reentryProbation: true },
    { ...ok, id: 'f', kinProbation: true },
    { ...ok, id: 'g' },
  ];
  assert.equal(activeTribeSize(roster), 3);
  assert.equal(activeTribeSize([]), 0);
});

test('activeTribeSize: a duplicate roster id is an error, not double counted', () => {
  assert.throws(() => activeTribeSize([{ ...ok, id: 'a' }, { ...ok, id: 'a' }]), RangeError);
});
