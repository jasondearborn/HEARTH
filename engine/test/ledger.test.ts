// spec §5.2.1, §5.2.2, §5.1, §13.6 — Ember log replay: budget, pair counter C, member reputation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REP_SCALE, LAMBDA, pow, fromDecimal } from '../src/fixed.js';
import { emberWeight, reputation, type Tier, type Context } from '../src/embers.js';
import * as ledger from '../src/ledger.js';
import {
  countedEmbers, checkpointWeights, memberReputation, type EmberRecord, type Budgets,
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
const seqs = (rs: readonly EmberRecord[]): number[] => rs.map((r) => r.sequence);

test('budget: first B_E per issuer per epoch by ascending (sequence, record hash), §5.2.1', () => {
  const log = [
    rec({ epoch: 5, sequence: 3 }), rec({ epoch: 5, sequence: 1, recipient: 'c' }),
    rec({ epoch: 5, sequence: 2, recipient: 'd' }),
  ];
  assert.deepEqual(seqs(countedEmbers(log, BUDGETS)), [1, 2]); // input order preserved
});

test('budget: ties on sequence go to the lower record hash', () => {
  const hi = rec({ epoch: 0, sequence: 0, recordHash: 'ff00' });
  const lo = rec({ epoch: 0, sequence: 0, recordHash: '0aff', recipient: 'c' });
  const mid = rec({ epoch: 0, sequence: 0, recordHash: '0b', recipient: 'd' });
  // byte-string order: 0a ff < 0b < ff 00
  assert.deepEqual(countedEmbers([hi, mid, lo], BUDGETS), [mid, lo]);
});

test('budget: separate per epoch and per issuer; tier picks B_E', () => {
  const log = [
    rec({ epoch: 0, sequence: 0 }), rec({ epoch: 0, sequence: 1 }), rec({ epoch: 0, sequence: 2 }),
    rec({ epoch: 1, sequence: 3 }),
    rec({ epoch: 0, sequence: 0, issuer: 'z' }),
    rec({ epoch: 0, sequence: 0, issuer: 't', issuerTier: 'Trusted' }),
    rec({ epoch: 0, sequence: 1, issuer: 't', issuerTier: 'Trusted' }),
    rec({ epoch: 0, sequence: 2, issuer: 't', issuerTier: 'Trusted' }),
    rec({ epoch: 0, sequence: 3, issuer: 't', issuerTier: 'Trusted' }),
  ];
  const kept = countedEmbers(log, BUDGETS);
  assert.equal(kept.filter((r) => r.issuer === 'a' && r.epoch === 0).length, 2);
  assert.equal(kept.filter((r) => r.issuer === 'a' && r.epoch === 1).length, 1);
  assert.equal(kept.filter((r) => r.issuer === 'z').length, 1);
  assert.deepEqual(seqs(kept.filter((r) => r.issuer === 't')), [0, 1, 2]);
});

test('self-issued Embers are invalid: dropped, and use no budget (§5.2)', () => {
  const self = rec({ epoch: 0, sequence: 0, recipient: 'a' });
  const x = rec({ epoch: 0, sequence: 1 });
  const y = rec({ epoch: 0, sequence: 2, recipient: 'c' });
  assert.deepEqual(countedEmbers([self, x, y], BUDGETS), [x, y]);
});

test('C: same-epoch prior counts 1, earlier epochs decay term by term (§5.2.2 items 2-3)', () => {
  const log = [
    rec({ epoch: 10, sequence: 0 }), rec({ epoch: 0, sequence: 2 }), rec({ epoch: 0, sequence: 1 }),
    rec({ epoch: 1, sequence: 5 }),
  ];
  const w = checkpointWeights(log, BUDGETS, BASE);
  const C = new Map(w.map((x) => [x.record.sequence, x.C]));
  assert.equal(C.get(1), 0n);
  assert.equal(C.get(2), REP_SCALE);
  assert.equal(C.get(5), 2n * pow(LAMBDA, 1));
  // epoch orders before sequence: seq 0 at epoch 10 comes last
  assert.equal(C.get(0), 2n * pow(LAMBDA, 10) + pow(LAMBDA, 9));
});

test('C is the term-by-term sum, not a carried-forward counter (§13.6 rule 6)', () => {
  const log = [rec({ epoch: 0, sequence: 0 }), rec({ epoch: 1, sequence: 1 }), rec({ epoch: 200, sequence: 2 })];
  const C = checkpointWeights(log, BUDGETS, BASE).map((x) => x.C);
  assert.deepEqual(C, [0n, LAMBDA, pow(LAMBDA, 200) + pow(LAMBDA, 199)]);
});

test('C counts only in-budget Embers (§5.2.2 item 1) and only the same pair', () => {
  const log = [
    rec({ epoch: 0, sequence: 0 }), rec({ epoch: 0, sequence: 1 }), rec({ epoch: 0, sequence: 2 }),
    rec({ epoch: 1, sequence: 3 }), rec({ epoch: 1, sequence: 0, recipient: 'c' }),
    rec({ epoch: 1, sequence: 0, issuer: 'q' }),
  ];
  const w = checkpointWeights(log, BUDGETS, BASE);
  assert.equal(w.length, 5); // seq 2 at epoch 0 is over budget
  const at = (i: string, r: string, e: number) =>
    w.find((x) => x.record.issuer === i && x.record.recipient === r && x.record.epoch === e)!;
  assert.equal(at('a', 'b', 1).C, 2n * LAMBDA);
  assert.equal(at('a', 'c', 1).C, 0n);
  assert.equal(at('q', 'b', 1).C, 0n);
});

test('weight is emberWeight with the derived C, input order preserved', () => {
  const log = [
    rec({ epoch: 3, sequence: 0, context: 'remote', issuerTier: 'Steward-eligible', connectivity: fp('0.5') }),
    rec({ epoch: 4, sequence: 1, context: 'remote', issuerTier: 'Steward-eligible', connectivity: fp('0.5') }),
  ];
  const w = checkpointWeights(log, BUDGETS, BASE);
  assert.deepEqual(w.map((x) => x.record), log);
  for (const x of w) {
    assert.equal(x.weight, emberWeight({
      baseUnit: BASE, issuerTier: x.record.issuerTier, connectivity: x.record.connectivity,
      context: x.record.context, C: x.C,
    }));
  }
});

test('memberReputation replays the log for one member up to t (§5.1)', () => {
  const log = [
    rec({ epoch: 0, sequence: 0 }), rec({ epoch: 2, sequence: 1 }), rec({ epoch: 9, sequence: 2 }),
    rec({ epoch: 1, sequence: 0, recipient: 'c' }), rec({ epoch: 1, sequence: 0, issuer: 'b', recipient: 'a' }),
  ];
  const pen = [{ weight: fp('0.01'), epoch: 1 }];
  const mine = checkpointWeights(log.filter((r) => r.epoch <= 5), BUDGETS, BASE)
    .filter((x) => x.record.recipient === 'b')
    .map((x) => ({ weight: x.weight, epoch: x.record.epoch }));
  assert.equal(mine.length, 2);
  assert.equal(memberReputation(log, BUDGETS, BASE, 'b', pen, 5), reputation(mine, pen, 5));
  assert.equal(memberReputation(log, BUDGETS, BASE, 'nobody', [], 5), 0n);
});

test('validation: one tribe per log, no Stranger issuers, consistent tier, well-formed fields', () => {
  const ok = rec({ epoch: 0, sequence: 0 });
  const bad: Array<Partial<EmberRecord>> = [
    { tribe: 'U' }, { issuerTier: 'Stranger' as Tier }, { issuerTier: 'Trusted' },
    { recordHash: 'ABCD' }, { recordHash: 'abc' }, { recordHash: '' }, { recordHash: ok.recordHash },
    { epoch: -1 }, { epoch: 1.5 }, { sequence: -1 }, { sequence: Number.MAX_SAFE_INTEGER + 1 },
    { context: 'telepathy' as Context }, { connectivity: -1n },
  ];
  for (const b of bad) {
    const other = { ...rec({ epoch: 0, sequence: 1 }), ...b };
    assert.throws(() => countedEmbers([ok, other], BUDGETS), RangeError, JSON.stringify(b, (_k, v) =>
      typeof v === 'bigint' ? String(v) : v));
  }
  assert.throws(() => countedEmbers([ok], { ...BUDGETS, Member: -1 }), RangeError);
  assert.throws(() => countedEmbers([ok], { ...BUDGETS, Member: 1.5 }), RangeError);
});

test('validation: one tier per issuer per epoch, for every pair of tiers', () => {
  const pairs: Array<[Tier, Tier]> = [['Member', 'Steward-eligible'], ['Trusted', 'Member'], ['Steward-eligible', 'Trusted']];
  for (const [x, y] of pairs) {
    const log = [rec({ epoch: 4, sequence: 0, issuerTier: x }), rec({ epoch: 4, sequence: 1, issuerTier: y, recipient: 'c' })];
    assert.throws(() => countedEmbers(log, BUDGETS), RangeError, `${x}/${y}`);
    // a tier change across epochs is legitimate (tier comes from the latest checkpoint, §4.2)
    const ok = [rec({ epoch: 4, sequence: 0, issuerTier: x }), rec({ epoch: 5, sequence: 1, issuerTier: y })];
    assert.equal(countedEmbers(ok, BUDGETS).length, 2);
  }
});

test('identifiers containing separators never collide (pairs and budget groups)', () => {
  // naive `${issuer}-${recipient}` keys merge a-b→c with a→b-c
  const log = [
    rec({ epoch: 0, sequence: 0, issuer: 'a-b', recipient: 'c' }),
    rec({ epoch: 0, sequence: 1, issuer: 'a', recipient: 'b-c' }),
    rec({ epoch: 1, sequence: 2, issuer: 'a-b', recipient: 'c' }),
    rec({ epoch: 1, sequence: 3, issuer: 'a', recipient: 'b-c' }),
  ];
  const C = checkpointWeights(log, { ...BUDGETS, Member: 1 }, BASE).map((x) => x.C);
  assert.deepEqual(C, [0n, 0n, LAMBDA, LAMBDA]);
});

test('API exposes no tribe-wide or cross-tribe aggregate (anti-goal: no global score)', () => {
  assert.deepEqual(Object.keys(ledger).sort(), ['checkpointWeights', 'countedEmbers', 'explainReputation', 'memberReputation']);
});

// ---- property tests: seeded, deterministic (mulberry32) ----
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
const CONN = ['1', '0.75', '0.5', '0.25'];

function randomLog(r: () => number, members: string[], epochs: number, perEpoch: number): EmberRecord[] {
  const log: EmberRecord[] = [];
  const tierOf = new Map(members.map((m) => [m, TIERS[Math.floor(r() * 3)]!]));
  const connOf = new Map(members.map((m) => [m, fp(CONN[Math.floor(r() * 4)]!)]));
  let h = 0;
  for (let e = 0; e < epochs; e++) {
    for (const i of members) {
      const k = Math.floor(r() * (perEpoch + 1));
      for (let s = 0; s < k; s++) {
        const j = members[Math.floor(r() * members.length)]!;
        log.push({
          issuer: i, recipient: j, tribe: 'T', epoch: e, sequence: Math.floor(r() * 4),
          recordHash: hex(h++ * 2654435761 % 4294967296), context: r() < 0.3 ? 'proximity' : 'remote',
          issuerTier: tierOf.get(i)!, connectivity: connOf.get(i)!,
        });
      }
    }
  }
  return log;
}

test('property: replay is independent of log order (two Stewards agree)', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const r = rng(seed);
    const members = ['a', 'b', 'c', 'd'];
    const log = randomLog(r, members, 30, 7);
    const shuffled = [...log];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    for (const m of members) {
      assert.equal(memberReputation(log, BUDGETS, BASE, m, [], 40), memberReputation(shuffled, BUDGETS, BASE, m, [], 40));
    }
  }
});

test('property: with no new Embers, reputation never rises (monotone decay)', () => {
  for (let seed = 100; seed < 106; seed++) {
    const log = randomLog(rng(seed), ['a', 'b', 'c'], 20, 4);
    let prev = memberReputation(log, BUDGETS, BASE, 'b', [], 19);
    for (let t = 20; t < 120; t += 7) {
      const cur = memberReputation(log, BUDGETS, BASE, 'b', [], t);
      assert.ok(cur <= prev, `seed ${seed} t=${t}`);
      prev = cur;
    }
  }
});

test('property: 0 <= C, and weight <= undiminished weight', () => {
  const log = randomLog(rng(7), ['a', 'b', 'c'], 40, 6);
  for (const x of checkpointWeights(log, BUDGETS, BASE)) {
    assert.ok(x.C >= 0n);
    const full = emberWeight({ baseUnit: BASE, issuerTier: x.record.issuerTier,
      connectivity: x.record.connectivity, context: x.record.context, C: 0n });
    assert.ok(x.weight <= full);
  }
});

test('property: one pair contributes at most K·log2(1 + S(t)) (§5.2.2 per-relationship bound)', () => {
  const lam = Math.pow(0.5, 1 / 90);
  const toF = (x: bigint): number => Number(x) / Number(REP_SCALE);
  for (let seed = 200; seed < 260; seed++) {
    const r = rng(seed);
    const p = r();
    const tier = TIERS[seed % 3]!;
    const log: EmberRecord[] = [];
    for (let e = 0; e < 400; e++) {
      if (r() >= p) continue;
      const k = 1 + Math.floor(r() * BUDGETS[tier as keyof Budgets]);
      for (let s = 0; s < k; s++) {
        log.push(rec({ epoch: e, sequence: s, issuerTier: tier, context: r() < 0.5 ? 'proximity' : 'remote' }));
      }
    }
    if (log.length === 0) continue;
    const t = 400 + Math.floor(r() * 300);
    const w = checkpointWeights(log, BUDGETS, BASE);
    let K = 0;
    let S = 0;
    for (const x of w) {
      K = Math.max(K, toF(emberWeight({ baseUnit: BASE, issuerTier: tier, connectivity: REP_SCALE,
        context: x.record.context, C: 0n })));
      S += Math.pow(lam, t - x.record.epoch);
    }
    const got = toF(memberReputation(log, BUDGETS, BASE, 'b', [], t));
    // slack: per-term rounding (weight div + mul, decay mul) and the <0.1% pow drift (§13.6)
    const bound = K * Math.log2(1 + S) * 1.001 + w.length * 3e-6;
    assert.ok(got <= bound, `seed ${seed}: ${got} > ${bound}`);
  }
});
