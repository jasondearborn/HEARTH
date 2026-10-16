// spec §6.2 — contested pairs: retaliation discount rule, contested evaluation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contestedAt } from '../src/contested.js';

const hex = (c: string): string => c.repeat(64);
const c = (h: string, complainant: string, target: string, epoch: number) => ({ hash: hex(h), complainant, target, epoch });
const sorted = (s: Set<string>): string[] => [...s].sort();

test('contestedAt: A against B and B against A within RETALIATION_WINDOW are both contested', () => {
  const log = [c('1', 'A', 'B', 100), c('2', 'B', 'A', 120)];
  assert.deepEqual(sorted(contestedAt(log, 120)), [hex('1'), hex('2')]);
});

test('contestedAt: a complaint filed after t does not exist yet', () => {
  const log = [c('1', 'A', 'B', 100), c('2', 'B', 'A', 120)];
  assert.deepEqual(sorted(contestedAt(log, 119)), []);
});

test('contestedAt: the window is |e1 - e2| < 30 (29 apart contested, 30 apart not)', () => {
  assert.deepEqual(sorted(contestedAt([c('1', 'A', 'B', 100), c('2', 'B', 'A', 129)], 200)), [hex('1'), hex('2')]);
  assert.deepEqual(sorted(contestedAt([c('1', 'A', 'B', 100), c('2', 'B', 'A', 130)], 200)), []);
});

test('contestedAt: symmetric, not chronological; same-epoch pairs count', () => {
  const later = contestedAt([c('1', 'A', 'B', 120), c('2', 'B', 'A', 100)], 120);
  assert.deepEqual(sorted(later), [hex('1'), hex('2')]);
  assert.deepEqual(sorted(contestedAt([c('1', 'A', 'B', 50), c('2', 'B', 'A', 50)], 50)), [hex('1'), hex('2')]);
});

test('contestedAt: the status does not lapse as t advances', () => {
  const log = [c('1', 'A', 'B', 100), c('2', 'B', 'A', 120)];
  assert.deepEqual(sorted(contestedAt(log, 1000)), [hex('1'), hex('2')]);
});

test('contestedAt: pairs are per ordered member pair, not per member', () => {
  const log = [c('1', 'A', 'B', 100), c('2', 'A', 'C', 100), c('3', 'C', 'A', 105), c('4', 'B', 'C', 101)];
  assert.deepEqual(sorted(contestedAt(log, 110)), [hex('2'), hex('3')]);
});

test('contestedAt: each complaint is judged against every opposite complaint', () => {
  // B against A at 140 is 40 from the first A against B but 10 from the second
  const log = [c('1', 'A', 'B', 100), c('2', 'B', 'A', 140), c('3', 'A', 'B', 150)];
  assert.deepEqual(sorted(contestedAt(log, 150)), [hex('2'), hex('3')]);
  // input order does not matter
  assert.deepEqual(sorted(contestedAt([...log].reverse(), 150)), [hex('2'), hex('3')]);
});

test('contestedAt: no complaints, nothing contested; malformed input throws', () => {
  assert.deepEqual(sorted(contestedAt([], 10)), []);
  assert.throws(() => contestedAt([c('1', 'A', 'B', 1), c('1', 'B', 'A', 2)], 5), RangeError); // duplicate hash
  assert.throws(() => contestedAt([{ hash: 'zz', complainant: 'A', target: 'B', epoch: 1 }], 5), RangeError);
  assert.throws(() => contestedAt([c('1', 'A', 'B', -1)], 5), RangeError);
});
