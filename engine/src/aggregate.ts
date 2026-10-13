// spec §6.6 — aggregate penalty cap across incidents (PENALTY_CAP_AGGREGATE)
import { mul, fromDecimal } from "./fixed.js";
import { resolve } from "./params.js";
import type { TransitivePenalty } from "./penalty.js";

export interface Incident {
  convictionEpoch: number;
  convictionHash: string; // 64 lowercase hex chars
  penalties: readonly TransitivePenalty[];
  snapshot: ReadonlyMap<string, bigint>; // conviction-checkpoint reputation (§6.5)
}

export interface CappedPenalty {
  member: string;
  hop: number;
  fraction: bigint;
  applied: bigint;
  amount: bigint;
}

export interface CappedIncident {
  convictionEpoch: number;
  convictionHash: string;
  penalties: CappedPenalty[];
}

// spec §6.6 — ceiling on a member's summed applied fractions across incidents
const PENALTY_CAP_AGGREGATE: bigint = fromDecimal(
  String(resolve("PENALTY_CAP_AGGREGATE").value),
);

// spec §6.6 — rolling window, 30 epochs: a prior incident counts when t − 30 < e ≤ t
const AGGREGATE_WINDOW_EPOCHS = 30;

const HASH_RE = /^[0-9a-f]{64}$/;

function cmp<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// spec §6.6 — clip each member's propagated penalties across incidents, in conviction
// order (epoch ascending, then hash ascending), so applied fractions never exceed
// PENALTY_CAP_AGGREGATE within the rolling window ending at each incident.
export function applyAggregateCap(
  incidents: readonly Incident[],
): CappedIncident[] {
  const seenHashes = new Set<string>();
  for (const incident of incidents) {
    if (!HASH_RE.test(incident.convictionHash)) {
      throw new RangeError("convictionHash must be 64 lowercase hex chars");
    }
    if (seenHashes.has(incident.convictionHash)) {
      throw new RangeError("duplicate convictionHash");
    }
    seenHashes.add(incident.convictionHash);
    if (
      !Number.isInteger(incident.convictionEpoch) ||
      incident.convictionEpoch < 0
    ) {
      throw new RangeError("convictionEpoch must be a non-negative integer");
    }
    for (const penalty of incident.penalties) {
      if (!incident.snapshot.has(penalty.member)) {
        throw new RangeError(`no snapshot for ${penalty.member}`);
      }
    }
  }

  const ordered = [...incidents].sort(
    (a, b) =>
      cmp(a.convictionEpoch, b.convictionEpoch) ||
      cmp(a.convictionHash, b.convictionHash),
  );

  // Applied fractions already taken per member, tagged with the epoch they were
  // applied at, so the rolling window can drop the ones that have aged out.
  const history = new Map<string, { epoch: number; applied: bigint }[]>();

  return ordered.map((incident) => {
    const t = incident.convictionEpoch;
    const penalties = incident.penalties.map((penalty) => {
      const prior = history.get(penalty.member) ?? [];
      let used = 0n;
      for (const entry of prior) {
        if (entry.epoch > t - AGGREGATE_WINDOW_EPOCHS && entry.epoch <= t) {
          used += entry.applied;
        }
      }
      const headroom = PENALTY_CAP_AGGREGATE - used;
      const room = headroom > 0n ? headroom : 0n;
      const applied = penalty.fraction < room ? penalty.fraction : room;
      const r = incident.snapshot.get(penalty.member)!;
      prior.push({ epoch: t, applied });
      history.set(penalty.member, prior);
      return {
        member: penalty.member,
        hop: penalty.hop,
        fraction: penalty.fraction,
        applied,
        amount: mul(applied, r),
      };
    });
    return {
      convictionEpoch: t,
      convictionHash: incident.convictionHash,
      penalties,
    };
  });
}
