// spec §4.3, §4.5 — admission check: voucher count, tier, budget, independence, escalations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromDecimal } from '../src/fixed.js';
import type { Tier } from '../src/embers.js';
import type { VouchEdge } from '../src/penalty.js';
import { checkAdmission, type AdmissionInput } from '../src/admission.js';

const fp = fromDecimal;
const T = 1000;

// accepted vouch graph as of the current checkpoint (voucher -> vouchee)
const e = (voucher: string, vouchee: string): VouchEdge => ({ voucher, vouchee, admittedAt: 500, linkageWeight: fp('1.0') });
// a, b are founders (no admitting vouchers). a admitted p and r; b admitted q.
// Undirected distances: a-p 1, a-r 1, p-r 2, b-q 1, nothing connects {a,p,r} to {b,q}.
const graphEdges = [e('a', 'p'), e('a', 'r'), e('b', 'q')];
const tiers = new Map<string, Tier>([
  ['a', 'Member'], ['b', 'Trusted'], ['p', 'Member'], ['q', 'Steward-eligible'], ['r', 'Member'], ['s', 'Stranger'],
]);

function input(vouchers: string[], p: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    vouchee: 'n',
    epoch: T,
    vouches: vouchers.map((voucher) => ({ voucher, epoch: T })),
    graphEdges,
    tiers,
    suspended: new Set<string>(),
    priorVouches: [],
    priorKinAdmissions: [],
    ...p,
  };
}

test('checkAdmission: two independent Member+ vouchers admit normally', () => {
  assert.deepEqual(checkAdmission(input(['a', 'b'])), {
    accepted: true, path: 'independent', failures: [], linkageWeights: [fp('1.0'), fp('1.0')], probationEpochs: 0,
  });
});

test('checkAdmission: a dependent pair is admitted by a third outside voucher (escalation 1)', () => {
  // a vouched p (1 hop); q is outside both neighbourhoods
  assert.deepEqual(checkAdmission(input(['a', 'p', 'q'])), {
    accepted: true, path: 'third-voucher', failures: [], linkageWeights: [fp('1.0'), fp('1.0'), fp('1.0')], probationEpochs: 0,
  });
});

test('checkAdmission: only the first two vouches are the pair; order is the submitter\'s choice', () => {
  // [p, r, b]: p-r are 2 hops apart (common voucher a) -> dependent; b is outside -> escalation 1
  assert.equal(checkAdmission(input(['p', 'r', 'b'])).path, 'third-voucher');
  // [b, p, r]: b and p are independent, so the pair passes outright
  assert.equal(checkAdmission(input(['b', 'p', 'r'])).path, 'independent');
});

test('checkAdmission: no outside voucher makes it a kin-admission (escalation 2): stake 1.5x, probation 45', () => {
  // a-p dependent; r is 1 hop from a, so not outside
  assert.deepEqual(checkAdmission(input(['a', 'p', 'r'])), {
    accepted: true, path: 'kin', failures: [], linkageWeights: [fp('1.5'), fp('1.5'), fp('1.0')], probationEpochs: 45,
  });
});

test('checkAdmission: repeat kin-admission by the same pair compounds within KIN_REPEAT_WINDOW = 365', () => {
  const prior = (epoch: number, vouchers: string[]) => ({ priorKinAdmissions: [{ epoch, vouchers }] });
  // same unordered pair {a, p}, 100 epochs ago (outside the 30-epoch neighbourhood window): 2.25x
  assert.deepEqual(checkAdmission(input(['a', 'p'], prior(T - 100, ['p', 'a']))).linkageWeights, [fp('2.25'), fp('2.25')]);
  // 364 epochs ago is still inside the rolling 365 window; 365 ago is not
  assert.deepEqual(checkAdmission(input(['a', 'p'], prior(T - 364, ['a', 'p']))).linkageWeights, [fp('2.25'), fp('2.25')]);
  assert.deepEqual(checkAdmission(input(['a', 'p'], prior(T - 365, ['a', 'p']))).linkageWeights, [fp('1.5'), fp('1.5')]);
});

test('checkAdmission: neighbourhood rate bound rejects a kin-admission near a recent one (30 epochs)', () => {
  // prior kin-admission 10 epochs ago vouched by r: r is 1 hop from a (V1)
  const near = input(['a', 'p'], { priorKinAdmissions: [{ epoch: T - 10, vouchers: ['r', 'x'] }] });
  const out = checkAdmission(near);
  assert.equal(out.accepted, false);
  assert.equal(out.path, 'kin');
  assert.deepEqual(out.failures, [{ reason: 'neighborhood' }]);
  assert.deepEqual(out.linkageWeights, []);
  // 30 epochs ago has left the window (T - 30 < e is false)
  assert.equal(checkAdmission(input(['a', 'p'], { priorKinAdmissions: [{ epoch: T - 30, vouchers: ['r', 'x'] }] })).accepted, true);
  // a recent kin-admission far away (b's side) does not block
  assert.equal(checkAdmission(input(['a', 'p'], { priorKinAdmissions: [{ epoch: T - 1, vouchers: ['q', 'y'] }] })).accepted, true);
  // the bound applies to kin-admissions only
  assert.equal(checkAdmission(input(['a', 'b'], { priorKinAdmissions: [{ epoch: T - 1, vouchers: ['a', 'p'] }] })).accepted, true);
});

test('checkAdmission: B_VOUCH = 2 per rolling VOUCH_WINDOW = 30 epochs, counting this vouch', () => {
  const two = [{ voucher: 'a', epoch: T - 29 }, { voucher: 'a', epoch: T - 5 }];
  const out = checkAdmission(input(['a', 'b'], { priorVouches: two }));
  assert.equal(out.accepted, false);
  assert.deepEqual(out.failures, [{ reason: 'budget', voucher: 'a' }]);
  const aged = [{ voucher: 'a', epoch: T - 30 }, { voucher: 'a', epoch: T - 5 }];
  assert.equal(checkAdmission(input(['a', 'b'], { priorVouches: aged })).accepted, true);
  // other vouchers' history does not count against a
  assert.equal(checkAdmission(input(['a', 'b'], { priorVouches: [{ voucher: 'q', epoch: T }, { voucher: 'q', epoch: T }] })).accepted, true);
});

test('checkAdmission: vouchers must be Member tier or above and not suspended', () => {
  assert.deepEqual(checkAdmission(input(['s', 'b'])).failures, [{ reason: 'voucher-tier', voucher: 's' }]);
  assert.deepEqual(checkAdmission(input(['a', 'ghost'])).failures, [{ reason: 'voucher-tier', voucher: 'ghost' }]);
  assert.deepEqual(checkAdmission(input(['a', 'b'], { suspended: new Set(['b']) })).failures, [{ reason: 'voucher-suspended', voucher: 'b' }]);
});

test('checkAdmission: record-level failures (count, duplicates, self-vouch)', () => {
  const one = checkAdmission(input(['a']));
  assert.deepEqual(one, { accepted: false, path: null, failures: [{ reason: 'too-few-vouchers' }], linkageWeights: [], probationEpochs: 0 });
  assert.deepEqual(checkAdmission(input(['a', 'a', 'b'])).failures, [{ reason: 'duplicate-voucher', voucher: 'a' }]);
  assert.deepEqual(checkAdmission(input(['a', 'b'], { vouchee: 'a' })).failures, [{ reason: 'self-vouch', voucher: 'a' }]);
});

test('checkAdmission: every failure is listed, record-level first, then per vouch in list order', () => {
  const out = checkAdmission(input(['s', 'a'], {
    suspended: new Set(['a']),
    priorVouches: [{ voucher: 'a', epoch: T }, { voucher: 'a', epoch: T }],
  }));
  assert.deepEqual(out.failures, [
    { reason: 'voucher-tier', voucher: 's' },
    { reason: 'voucher-suspended', voucher: 'a' },
    { reason: 'budget', voucher: 'a' },
  ]);
  assert.equal(out.accepted, false);
});
