// spec §6.4 — adjudication state machine: case identity, CASE_WINDOW, case evaluation; §6.3 conviction gate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjudicate, type AdjudicationInput } from '../src/case.js';

const hex = (c: string): string => c.repeat(64);
const c = (h: string, complainant: string, epoch: number, target = 'x') => ({ hash: hex(h), complainant, target, epoch });

function run(complaints: AdjudicationInput['complaints'], p: Partial<AdjudicationInput> = {}) {
  return adjudicate({ complaints, t: 300, quorumAt: () => 3, eligible: () => true, contested: () => false, ...p });
}

test('adjudicate: three distinct complainants inside the window convict at the third', () => {
  assert.deepEqual(run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 105)]), [{
    target: 'x', openedEpoch: 100, status: 'convicted', closedEpoch: 105,
    complaints: [hex('1'), hex('2'), hex('3')], counted: ['a', 'b', 'c'],
  }]);
});

test('adjudicate: one complainant counts once; without quorum the case is dismissed at opened + 60', () => {
  assert.deepEqual(run([c('1', 'a', 100), c('2', 'a', 120), c('3', 'b', 130)]), [{
    target: 'x', openedEpoch: 100, status: 'dismissed', closedEpoch: 160,
    complaints: [hex('1'), hex('2'), hex('3')], counted: ['a', 'b'],
  }]);
});

test('adjudicate: CASE_WINDOW = 60, open at opened <= e < opened + 60', () => {
  const in159 = run([c('1', 'a', 100), c('2', 'b', 110), c('3', 'c', 159)]);
  assert.equal(in159.length, 1);
  assert.deepEqual([in159[0]!.status, in159[0]!.closedEpoch], ['convicted', 159]);
  // at 160 the first case has closed: the third complaint opens a new case
  const at160 = run([c('1', 'a', 100), c('2', 'b', 110), c('3', 'c', 160)]);
  assert.deepEqual(at160.map((k) => [k.openedEpoch, k.status, k.closedEpoch, k.complaints, k.counted]), [
    [100, 'dismissed', 160, [hex('1'), hex('2')], ['a', 'b']],
    [160, 'pending', null, [hex('3')], ['c']],
  ]);
});

test('adjudicate: an open case at t is pending; complaints after t do not exist yet', () => {
  const out = run([c('1', 'a', 100), c('2', 'b', 110), c('3', 'c', 140)], { t: 130 });
  assert.deepEqual(out, [{
    target: 'x', openedEpoch: 100, status: 'pending', closedEpoch: null,
    complaints: [hex('1'), hex('2')], counted: ['a', 'b'],
  }]);
  // the last open epoch is 159: at t = 159 still pending, at t = 160 dismissed
  assert.equal(run([c('1', 'a', 100)], { t: 159 })[0]!.status, 'pending');
  assert.equal(run([c('1', 'a', 100)], { t: 160 })[0]!.status, 'dismissed');
});

test('adjudicate: evaluated every epoch, so a complainant who becomes eligible counts without refiling', () => {
  const eligible = (m: string, e: number): boolean => m !== 'b' || e >= 120;
  const out = run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 102)], { eligible });
  assert.deepEqual([out[0]!.status, out[0]!.closedEpoch, out[0]!.counted], ['convicted', 120, ['a', 'b', 'c']]);
});

test('adjudicate: a complainant revoked before conviction drops out of the count', () => {
  const eligible = (m: string, e: number): boolean => m !== 'a' || e < 105;
  const out = run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 110)], { eligible });
  assert.deepEqual([out[0]!.status, out[0]!.closedEpoch, out[0]!.counted], ['dismissed', 160, ['b', 'c']]);
});

test('adjudicate: contested complaints do not count; another uncontested complaint by the same member does', () => {
  const contested = (h: string): boolean => h === hex('2');
  const out = run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 102)], { contested });
  assert.deepEqual([out[0]!.status, out[0]!.counted], ['dismissed', ['a', 'c']]);
  const again = run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 102), c('4', 'b', 130)], { contested });
  assert.deepEqual([again[0]!.status, again[0]!.closedEpoch, again[0]!.counted], ['convicted', 130, ['a', 'b', 'c']]);
  // contested status is asked per epoch
  const lateContest = (h: string, e: number): boolean => h === hex('3') && e >= 102;
  assert.equal(run([c('1', 'a', 100), c('2', 'b', 101), c('3', 'c', 102)], { contested: lateContest })[0]!.status, 'dismissed');
});

test('adjudicate: quorum is fixed from the opening epoch', () => {
  const asked: number[] = [];
  const quorumAt = (o: number): number => { asked.push(o); return o < 150 ? 3 : 2; };
  const out = run([c('1', 'a', 100), c('2', 'b', 155)], { quorumAt });
  assert.deepEqual([out[0]!.status, out[0]!.closedEpoch], ['dismissed', 160]);
  assert.ok(asked.length > 0 && asked.every((o) => o === 100));
  assert.equal(run([c('1', 'a', 150), c('2', 'b', 155)], { quorumAt })[0]!.status, 'convicted');
});

test('adjudicate: same-epoch complaints all join the convicting case; a later one opens a new case', () => {
  const out = run([c('4', 'd', 100), c('1', 'a', 100), c('2', 'b', 100), c('3', 'c', 100), c('5', 'e', 101)]);
  assert.deepEqual(out.map((k) => [k.openedEpoch, k.status, k.closedEpoch, k.complaints, k.counted]), [
    [100, 'convicted', 100, [hex('1'), hex('2'), hex('3'), hex('4')], ['a', 'b', 'c', 'd']],
    [101, 'pending', null, [hex('5')], ['e']],
  ]);
});

test('adjudicate: one case per target; output in (openedEpoch, target) order', () => {
  const out = run([c('1', 'a', 105, 'y'), c('2', 'a', 100, 'z'), c('3', 'b', 105, 'x')]);
  assert.deepEqual(out.map((k) => [k.target, k.openedEpoch, k.complaints]), [
    ['z', 100, [hex('2')]],
    ['x', 105, [hex('3')]],
    ['y', 105, [hex('1')]],
  ]);
});

test('adjudicate: no complaints, no cases; malformed input throws', () => {
  assert.deepEqual(run([]), []);
  assert.throws(() => run([c('1', 'a', 100), c('1', 'b', 101)]), RangeError); // duplicate hash
  assert.throws(() => run([{ hash: 'nothex', complainant: 'a', target: 'x', epoch: 1 }]), RangeError);
  assert.throws(() => run([c('1', 'a', -3)]), RangeError);
});
