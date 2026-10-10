// spec §5.1, §5.5.2, §5.5.3 — explainReputation: the computation transcript behind one R_m
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, fromDecimal } from '../src/fixed.js';
import { emberWeight, decayedTerm, type Tier } from '../src/embers.js';
import {
  checkpointWeights, memberReputation, explainReputation, type EmberRecord, type Budgets,
} from '../src/ledger.js';

const fp = fromDecimal;
const BASE = fp('0.08');
const BUDGETS: Budgets = { Member: 2, Trusted: 3, 'Steward-eligible': 5 };
const hex = (n: number): string => n.toString(16).padStart(8, '0');

let nextHash = 1;
function rec(p: Partial<EmberRecord> & { epoch: number; sequence: number }): EmberRecord {
  return {
    issuer: 'a', recipient: 'b', tribe: 'T', context: 'proximity',
    recordHash: hex(nextHash++), issuerTier: 'Member', connectivity: REP_SCALE, ...p,
  };
}

test('explain lists each counted Ember with C, weight and decayed value, and agrees with memberReputation', () => {
  const log = [
    rec({ epoch: 0, sequence: 0 }), rec({ epoch: 2, sequence: 1 }), rec({ epoch: 9, sequence: 2 }),
    rec({ epoch: 1, sequence: 0, recipient: 'c' }), rec({ epoch: 1, sequence: 0, issuer: 'b', recipient: 'a' }),
  ];
  const pen = [{ weight: fp('0.01'), epoch: 1 }];
  const x = explainReputation(log, BUDGETS, BASE, 'b', pen, 5);
  const w = checkpointWeights(log, BUDGETS, BASE).filter((y) => y.record.recipient === 'b' && y.record.epoch <= 5);
  assert.equal(x.member, 'b');
  assert.equal(x.t, 5);
  assert.deepEqual(x.embers, w.map((y) => ({ ...y, decayed: decayedTerm(y.weight, y.record.epoch, 5) })));
  assert.deepEqual(x.penalties, [{ weight: fp('0.01'), epoch: 1, decayed: decayedTerm(fp('0.01'), 1, 5) }]);
  assert.equal(x.emberTotal, x.embers.reduce((s, e) => s + e.decayed, 0n));
  assert.equal(x.penaltyTotal, x.penalties[0]!.decayed);
  assert.equal(x.reputation, x.emberTotal - x.penaltyTotal);
  assert.equal(x.reputation, memberReputation(log, BUDGETS, BASE, 'b', pen, 5));
});

test('explain excludes over-budget, self-issued, other recipients and future Embers; keeps log order', () => {
  const late = rec({ epoch: 3, sequence: 0 });
  const early = rec({ epoch: 0, sequence: 0 });
  const second = rec({ epoch: 0, sequence: 1 });
  const over = rec({ epoch: 0, sequence: 2 }); // over Member budget (2)
  const self = rec({ epoch: 1, sequence: 0, issuer: 'b' }); // self-issued
  const log = [
    late, early, second, over, self,
    rec({ epoch: 1, sequence: 1, recipient: 'c' }),
    rec({ epoch: 7, sequence: 0 }), // after t
  ];
  const x = explainReputation(log, BUDGETS, BASE, 'b', [], 4);
  assert.deepEqual(x.embers.map((e) => e.record), [late, early, second]);
  // §5.2.1 budget overflow and self-issue (threat row 45) are reported, with reason, in log
  // order; other recipients and Embers after t are not "excluded", just not this transcript's
  assert.deepEqual(x.excluded, [{ record: over, reason: 'over-budget' }, { record: self, reason: 'self-issued' }]);
  assert.deepEqual(x.penalties, []);
  assert.equal(x.penaltyTotal, 0n);
});

test('explain keeps the unclamped totals; only reputation takes the §5.1 floor', () => {
  const log = [rec({ epoch: 0, sequence: 0 })];
  const pen = [{ weight: fp('1'), epoch: 0 }, { weight: fp('0.5'), epoch: 2 }];
  const x = explainReputation(log, BUDGETS, BASE, 'b', pen, 3);
  assert.ok(x.emberTotal - x.penaltyTotal < 0n);
  assert.equal(x.reputation, 0n);
  assert.equal(x.reputation, memberReputation(log, BUDGETS, BASE, 'b', pen, 3));
  assert.deepEqual(x.penalties.map((p) => p.epoch), [0, 2]); // input order
});

test('explain for a member with no Embers is empty and zero', () => {
  const x = explainReputation([rec({ epoch: 0, sequence: 0 })], BUDGETS, BASE, 'nobody', [], 5);
  assert.deepEqual(x, {
    member: 'nobody', t: 5, embers: [], excluded: [], penalties: [], emberTotal: 0n, penaltyTotal: 0n,
    reputation: 0n,
  });
});

test('explain rejects what memberReputation rejects (penalty after t, malformed log)', () => {
  const log = [rec({ epoch: 0, sequence: 0 })];
  assert.throws(() => explainReputation(log, BUDGETS, BASE, 'b', [{ weight: 1n, epoch: 6 }], 5), RangeError);
  assert.throws(() => explainReputation([rec({ epoch: 0, sequence: 0, recordHash: 'XYZ' })], BUDGETS, BASE, 'b', [], 5), RangeError);
});

// ---- property: the transcript recomputes (§5.5.3), seeded mulberry32 ----
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TIERS: Tier[] = ['Member', 'Trusted', 'Steward-eligible'];

test('property: every transcript recomputes to memberReputation from its own weight factors', () => {
  const members = ['m0', 'm1', 'm2', 'm3', 'm4'];
  for (let seed = 1; seed <= 10; seed++) {
    const r = rng(seed);
    const tierOf = new Map(members.map((m) => [m, TIERS[Math.floor(r() * 3)]!]));
    const log: EmberRecord[] = [];
    let h = 0;
    for (let e = 0; e < 30; e++) {
      for (const i of members) {
        for (let k = Math.floor(r() * 4); k > 0; k--) {
          log.push({
            issuer: i, recipient: members[Math.floor(r() * members.length)]!, tribe: 'T', epoch: e,
            sequence: Math.floor(r() * 4), recordHash: hex(h++ * 2654435761 % 4294967296),
            context: r() < 0.3 ? 'proximity' : 'remote', issuerTier: tierOf.get(i)!,
            connectivity: fp(['1', '0.5', '0.25'][Math.floor(r() * 3)]!),
          });
        }
      }
    }
    const pen = r() < 0.5 ? [{ weight: fp('0.05'), epoch: 10 }] : [];
    for (const m of members) {
      const x = explainReputation(log, BUDGETS, BASE, m, pen, 30);
      let sum = 0n;
      for (const e of x.embers) {
        assert.equal(e.record.recipient, m);
        const { issuerTier, connectivity, context } = e.record;
        assert.equal(e.weight, emberWeight({ baseUnit: BASE, issuerTier, connectivity, context, C: e.C }));
        assert.equal(e.decayed, decayedTerm(e.weight, e.record.epoch, 30));
        sum += e.decayed;
      }
      assert.equal(x.emberTotal, sum);
      // every Ember to m at or before t is either counted or excluded, never both, in log order
      const mine = log.filter((y) => y.recipient === m && y.epoch <= 30);
      const counted = new Set(x.embers.map((e) => e.record));
      assert.deepEqual(x.excluded.map((e) => e.record), mine.filter((y) => !counted.has(y)));
      for (const e of x.excluded) {
        assert.equal(e.reason, e.record.issuer === m ? 'self-issued' : 'over-budget');
      }
      const net = x.emberTotal - x.penaltyTotal;
      assert.equal(x.reputation, net < 0n ? 0n : net);
      assert.equal(x.reputation, memberReputation(log, BUDGETS, BASE, m, pen, 30));
    }
  }
});
