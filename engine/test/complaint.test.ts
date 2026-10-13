// spec §6.1 — ComplaintRecord filing check (evidence, enrollment, self-complaint, rate limit, evidence reuse)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkComplaint, type Complaint, type ComplaintContext } from '../src/complaint.js';

const hex = (c: string): string => c.repeat(64);
const T = 200;

function complaint(p: Partial<Complaint> = {}): Complaint {
  return { hash: hex('1'), complainant: 'a', target: 'b', epoch: T, evidenceHash: hex('e'), ...p };
}

function ctx(p: Partial<ComplaintContext> = {}): ComplaintContext {
  return { roster: new Set(['a', 'b', 'c']), accepted: [], dismissedEvidence: new Set<string>(), ...p };
}

test('checkComplaint: a well-formed complaint between enrolled members is accepted', () => {
  assert.deepEqual(checkComplaint(complaint(), ctx()), { accepted: true, failures: [] });
});

test('checkComplaint: evidence_hash is required and must be 64 lowercase hex chars', () => {
  for (const evidenceHash of ['', 'abc', hex('E'), hex('g'), hex('e') + '0']) {
    assert.deepEqual(checkComplaint(complaint({ evidenceHash }), ctx()), { accepted: false, failures: ['evidence'] }, evidenceHash);
  }
});

test('checkComplaint: complainant and target must be roster-enrolled; no self-complaint', () => {
  assert.deepEqual(checkComplaint(complaint({ complainant: 'x' }), ctx()).failures, ['complainant-not-enrolled']);
  assert.deepEqual(checkComplaint(complaint({ target: 'y' }), ctx()).failures, ['target-not-enrolled']);
  assert.deepEqual(checkComplaint(complaint({ target: 'a' }), ctx()).failures, ['self-complaint']);
});

test('checkComplaint: COMPLAINT_RATE_LIMIT = 1 accepted complaint per complainant per epoch', () => {
  const earlier = complaint({ hash: hex('2'), target: 'c' });
  assert.deepEqual(checkComplaint(complaint(), ctx({ accepted: [earlier] })).failures, ['rate-limit']);
  // a different epoch, or a different complainant, does not count
  assert.equal(checkComplaint(complaint(), ctx({ accepted: [{ ...earlier, epoch: T - 1 }] })).accepted, true);
  assert.equal(checkComplaint(complaint(), ctx({ accepted: [{ ...earlier, complainant: 'c', target: 'b' }] })).accepted, true);
});

test('checkComplaint: evidence from a dismissed case is rejected; evidence shared with live complaints is not', () => {
  assert.deepEqual(checkComplaint(complaint(), ctx({ dismissedEvidence: new Set([hex('e')]) })).failures, ['evidence-reused']);
  const witness = complaint({ hash: hex('3'), complainant: 'c', epoch: T - 3 });
  assert.equal(checkComplaint(complaint(), ctx({ accepted: [witness] })).accepted, true);
});

test('checkComplaint: every failure is reported, in spec order', () => {
  const c = complaint({ complainant: 'x', target: 'x', evidenceHash: '' });
  assert.deepEqual(checkComplaint(c, ctx()).failures, ['evidence', 'complainant-not-enrolled', 'target-not-enrolled', 'self-complaint']);
  const d = complaint({ target: 'a' });
  const out = checkComplaint(d, ctx({
    accepted: [complaint({ hash: hex('4'), target: 'c' })],
    dismissedEvidence: new Set([hex('e')]),
  }));
  assert.deepEqual(out, { accepted: false, failures: ['self-complaint', 'rate-limit', 'evidence-reused'] });
});

test('checkComplaint: malformed records throw (bad record hash, bad epoch, already accepted)', () => {
  assert.throws(() => checkComplaint(complaint({ hash: 'nothex' }), ctx()), RangeError);
  assert.throws(() => checkComplaint(complaint({ epoch: -1 }), ctx()), RangeError);
  assert.throws(() => checkComplaint(complaint({ epoch: 1.5 }), ctx()), RangeError);
  assert.throws(() => checkComplaint(complaint(), ctx({ accepted: [complaint({ epoch: T - 9 })] })), RangeError);
});
