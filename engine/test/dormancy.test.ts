// spec §4.10 — DormancyDeclaration check (max per rolling window, cooldown, overlap); §2.4 windows
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dormancyFailures, type DormancyPeriod } from '../src/dormancy.js';

// half-open periods: epochs start <= e < end
const p = (start: number, end: number): DormancyPeriod => ({ start, end });

test('dormancyFailures: first declaration up to DORMANCY_MAX_DAYS = 180 epochs is accepted', () => {
  assert.deepEqual(dormancyFailures([], p(100, 280)), []);
  assert.deepEqual(dormancyFailures([], p(100, 281)), ['max']);
});

test('dormancyFailures: DORMANCY_COOLDOWN = 60 epochs from the end of the previous period', () => {
  assert.deepEqual(dormancyFailures([p(0, 10)], p(69, 70)), ['cooldown']);
  assert.deepEqual(dormancyFailures([p(0, 10)], p(70, 71)), []);
  // previous = the latest-ending earlier period, whatever order history is given in
  assert.deepEqual(dormancyFailures([p(100, 110), p(0, 10)], p(150, 151)), ['cooldown']);
});

test('dormancyFailures: dormant epochs are summed over the rolling 365-epoch window', () => {
  // 100 + 80 = 180 inside one window: allowed; 100 + 81: not
  assert.deepEqual(dormancyFailures([p(0, 100)], p(160, 240)), []);
  assert.deepEqual(dormancyFailures([p(0, 100)], p(160, 241)), ['max']);
});

test('dormancyFailures: window edges follow §2.4 (t - 365 < e <= t)', () => {
  // history covers epochs 0..179. Window ending 364 is epochs 0..364: 180 + 1 = 181
  assert.deepEqual(dormancyFailures([p(0, 180)], p(364, 365)), ['max']);
  // window ending 365 is epochs 1..365: 179 + 1 = 180
  assert.deepEqual(dormancyFailures([p(0, 180)], p(365, 366)), []);
  // far enough apart that no window holds more than 180
  assert.deepEqual(dormancyFailures([p(0, 180)], p(400, 580)), []);
});

test('dormancyFailures: overlap with an earlier period; every failure listed in fixed order', () => {
  // overlapping epochs count once: union 0..299 = 300 dormant epochs
  assert.deepEqual(dormancyFailures([p(0, 100)], p(50, 300)), ['overlap', 'cooldown', 'max']);
  assert.deepEqual(dormancyFailures([p(0, 100)], p(99, 100)), ['overlap', 'cooldown']);
});

test('dormancyFailures: malformed periods are a RangeError', () => {
  assert.throws(() => dormancyFailures([], p(10, 10)), RangeError); // empty
  assert.throws(() => dormancyFailures([], p(10, 5)), RangeError);
  assert.throws(() => dormancyFailures([], p(-1, 5)), RangeError);
  assert.throws(() => dormancyFailures([], p(1.5, 5)), RangeError);
  assert.throws(() => dormancyFailures([p(3, 2)], p(100, 101)), RangeError);
});
