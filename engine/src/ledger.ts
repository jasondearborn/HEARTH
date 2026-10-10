// spec §5.2.1, §5.2.2, §5.1, §13.6 — Ember log replay: budget, pair counter C, member reputation
import { REP_SCALE, LAMBDA, mul } from "./fixed.js";
import {
  emberWeight,
  reputation,
  decayedTerm,
  type Tier,
  type Context,
  type Term,
} from "./embers.js";

export interface EmberRecord {
  issuer: string;
  recipient: string;
  tribe: string;
  epoch: number;
  context: Context;
  sequence: number;
  recordHash: string;
  issuerTier: Tier;
  connectivity: bigint;
}

export type Budgets = Readonly<
  Record<"Member" | "Trusted" | "Steward-eligible", number>
>;

export type ExclusionReason = "over-budget" | "self-issued";

export interface ExcludedEmber {
  record: EmberRecord;
  reason: ExclusionReason;
}

export interface Weighted {
  record: EmberRecord;
  C: bigint;
  weight: bigint;
}

export interface ExplainedEmber extends Weighted {
  decayed: bigint;
}

export interface ExplainedPenalty extends Term {
  decayed: bigint;
}

export interface Explanation {
  member: string;
  t: number;
  embers: ExplainedEmber[];
  excluded: ExcludedEmber[];
  penalties: ExplainedPenalty[];
  emberTotal: bigint;
  penaltyTotal: bigint;
  reputation: bigint;
}

// spec §13.6 — pow(LAMBDA, k) as a table of the same left fold, so identical by construction
const LAMBDA_POW: bigint[] = [REP_SCALE];
function lambdaPow(k: number): bigint {
  while (LAMBDA_POW.length <= k) LAMBDA_POW.push(mul(LAMBDA_POW[LAMBDA_POW.length - 1]!, LAMBDA));
  return LAMBDA_POW[k]!;
}

// spec §5.2.1, §5.2.2
export function countedEmbers(
  log: readonly EmberRecord[],
  budgets: Budgets,
): EmberRecord[] {
  // Validate budgets
  for (const tier of ["Member", "Trusted", "Steward-eligible"] as const) {
    const budget = budgets[tier];
    if (!Number.isInteger(budget) || budget < 0) {
      throw new RangeError(`Budget for ${tier} must be a non-negative integer`);
    }
  }

  // Validate records
  const seenHashes = new Set<string>();
  const tierByIssuerEpoch = new Map<string, Tier>();
  for (const record of log) {
    if (record.tribe !== log[0]?.tribe) {
      throw new RangeError("All records must have the same tribe");
    }
    if (
      record.issuerTier !== "Member" &&
      record.issuerTier !== "Trusted" &&
      record.issuerTier !== "Steward-eligible"
    ) {
      throw new RangeError(
        "issuerTier must be one of Member, Trusted or Steward-eligible",
      );
    }
    const issuerEpochKey = JSON.stringify([record.issuer, record.epoch]);
    const priorTier = tierByIssuerEpoch.get(issuerEpochKey);
    if (priorTier !== undefined && priorTier !== record.issuerTier) {
      throw new RangeError(
        "issuerTier must be consistent for the same issuer and epoch",
      );
    }
    tierByIssuerEpoch.set(issuerEpochKey, record.issuerTier);
    if (record.context !== "proximity" && record.context !== "remote") {
      throw new RangeError("context must be one of proximity or remote");
    }
    if (!/^(?:[0-9a-f]{2})+$/.test(record.recordHash)) {
      throw new RangeError(
        "recordHash must match the pattern /^(?:[0-9a-f]{2})+$/",
      );
    }
    if (seenHashes.has(record.recordHash)) {
      throw new RangeError("Duplicate recordHash found");
    }
    seenHashes.add(record.recordHash);
    if (!Number.isSafeInteger(record.epoch) || record.epoch < 0) {
      throw new RangeError("epoch must be a safe integer >= 0");
    }
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 0) {
      throw new RangeError("sequence must be a safe integer >= 0");
    }
    if (record.connectivity < 0n) {
      throw new RangeError("connectivity must be non-negative");
    }
  }

  // Drop records where issuer === recipient
  const filtered = log.filter((r) => r.issuer !== r.recipient);

  // Group by (issuer, epoch)
  const groups = new Map<string, EmberRecord[]>();
  for (const record of filtered) {
    const key = JSON.stringify([record.issuer, record.epoch]);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  // Within each group, sort by sequence ascending, then recordHash ascending
  for (const records of groups.values()) {
    records.sort((a, b) => {
      if (a.sequence !== b.sequence) {
        return a.sequence - b.sequence;
      }
      return a.recordHash < b.recordHash ? -1 : 1;
    });
  }

  // Keep the first budgets[issuerTier] of each group
  const kept = new Set<EmberRecord>();
  for (const records of groups.values()) {
    const budget = budgets[records[0]!.issuerTier as keyof Budgets]; // Stranger rejected above
    for (const r of records.slice(0, budget)) {
      kept.add(r);
    }
  }

  // Return in original input order
  return log.filter((r) => kept.has(r));
}

// spec §5.2, §5.2.2, §13.6
export function checkpointWeights(
  log: readonly EmberRecord[],
  budgets: Budgets,
  baseUnit: bigint,
): Weighted[] {
  const counted = countedEmbers(log, budgets);

  // Group counted records by (issuer, recipient) pair
  const pairs = new Map<string, EmberRecord[]>();
  for (const record of counted) {
    const key = JSON.stringify([record.issuer, record.recipient]);
    if (!pairs.has(key)) {
      pairs.set(key, []);
    }
    pairs.get(key)!.push(record);
  }

  // Sort records in each pair by (epoch, sequence, recordHash) ascending,
  // and precompute each record's position within its pair
  const position = new Map<EmberRecord, number>();
  for (const records of pairs.values()) {
    records.sort((a, b) => {
      if (a.epoch !== b.epoch) return a.epoch - b.epoch;
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      return a.recordHash < b.recordHash ? -1 : 1;
    });
    records.forEach((r, i) => position.set(r, i));
  }

  // Calculate C for each record
  const result: Weighted[] = [];
  for (const record of counted) {
    const key = JSON.stringify([record.issuer, record.recipient]);
    const records = pairs.get(key)!;
    const index = position.get(record)!;

    // Calculate C as sum over prior records in the same pair
    let C = 0n;
    for (let i = 0; i < index; i++) {
      const prior = records[i]!;
      const diff = record.epoch - prior.epoch;
      C += lambdaPow(diff);
    }

    const weight = emberWeight({
      baseUnit,
      issuerTier: record.issuerTier,
      connectivity: record.connectivity,
      context: record.context,
      C,
    });

    result.push({ record, C, weight });
  }

  return result;
}

// spec §5.1, §13.6
export function memberReputation(
  log: readonly EmberRecord[],
  budgets: Budgets,
  baseUnit: bigint,
  member: string,
  penalties: readonly Term[],
  t: number,
): bigint {
  // Replay (and validate) the whole log; a record's C and budget depend only on
  // records at or before its own epoch, so later records cannot change these terms.
  const weighted = checkpointWeights(log, budgets, baseUnit);

  const terms = weighted
    .filter((x) => x.record.recipient === member && x.record.epoch <= t)
    .map((x) => ({ weight: x.weight, epoch: x.record.epoch }));

  // Calculate reputation
  return reputation(terms, penalties, t);
}

// spec §5.1, §5.5.2, §5.5.3 — computation transcript for one member: every counted Ember and
// penalty with its weight factors and decayed value. `reputation` equals memberReputation.
// R_m is one tribe-scoped value; there is no per-observer score. An observer's view is this
// function over the Embers that observer has seen (its own log), provisional until the next
// checkpoint (§5.1). `emberTotal − penaltyTotal` before the §5.1 floor is a display aid only.
// `excluded` lists Embers to the member at or before t that carry no weight, in log order:
// over the issuer's epoch budget (§5.2.1) or self-issued (invalid, §5.2). Embers after t are
// in neither list.
export function explainReputation(
  log: readonly EmberRecord[],
  budgets: Budgets,
  baseUnit: bigint,
  member: string,
  penalties: readonly Term[],
  t: number,
): Explanation {
  const counted = checkpointWeights(log, budgets, baseUnit);
  const countedRecords = new Set(counted.map((x) => x.record));

  const embers = counted
    .filter((x) => x.record.recipient === member && x.record.epoch <= t)
    .map((x) => ({ ...x, decayed: decayedTerm(x.weight, x.record.epoch, t) }));

  const excluded = log
    .filter(
      (record) =>
        record.recipient === member &&
        record.epoch <= t &&
        !countedRecords.has(record),
    )
    .map((record) => {
      const reason: ExclusionReason =
        record.issuer === record.recipient ? "self-issued" : "over-budget";
      return { record, reason };
    });

  const explained = penalties.map((p) => ({
    weight: p.weight,
    epoch: p.epoch,
    decayed: decayedTerm(p.weight, p.epoch, t),
  }));

  const emberTotal = embers.reduce((sum, e) => sum + e.decayed, 0n);
  const penaltyTotal = explained.reduce((sum, p) => sum + p.decayed, 0n);
  const net = emberTotal - penaltyTotal;

  return {
    member,
    t,
    embers,
    excluded,
    penalties: explained,
    emberTotal,
    penaltyTotal,
    reputation: net < 0n ? 0n : net,
  };
}
