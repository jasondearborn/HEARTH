// spec §6.6, §6.5, §4.7, §13.6 — transitive, decaying penalty for one conviction
import { LAMBDA, mul, pow, fromDecimal } from "./fixed.js";
import { resolve } from "./params.js";

const fx = (name: string): bigint => fromDecimal(String(resolve(name).value));

export const PENALTY_FLOOR: bigint = fromDecimal("0.01");

export interface VouchEdge {
  voucher: string;
  vouchee: string;
  admittedAt: number;
  linkageWeight: bigint;
}

export interface TransitivePenalty {
  member: string;
  hop: number;
  path: string[];
  fraction: bigint;
  amount: bigint;
}

// spec §4.7
export function decayedLinkage(edge: VouchEdge, t: number): bigint {
  if (edge.admittedAt > t) throw new RangeError("admitted_at must not exceed t");
  return mul(edge.linkageWeight, pow(LAMBDA, t - edge.admittedAt));
}

// spec §6.6
export function penaltyFraction(
  hop: number,
  weights: readonly bigint[],
): bigint {
  if (!Number.isInteger(hop) || hop < 0)
    throw new RangeError("hop must be a non-negative integer");
  if (weights.length !== hop + 1)
    throw new RangeError("a hop-h path has h + 1 edge weights");
  let acc = fx("P_dir");
  acc = mul(acc, pow(fx("g"), hop));
  for (const w of weights) {
    acc = mul(acc, w);
  }
  return acc;
}

const cmp = <T extends string | number | bigint>(a: T, b: T): number =>
  a < b ? -1 : a > b ? 1 : 0;

// spec §6.6, §6.5
// One incident's per-member penalties at conviction epoch t, against the conviction-checkpoint
// snapshot (§6.5: never recomputed as earlier hops apply). PENALTY_CAP_AGGREGATE across
// incidents is not applied here. Path enumeration is bounded by the floor while g·w < 1; with
// compounding kin stake it is bounded only by simple paths (§6.6 finding).
export function transitivePenalties(
  edges: readonly VouchEdge[],
  convicted: string,
  t: number,
  snapshot: ReadonlyMap<string, bigint>,
): TransitivePenalty[] {
  // Ignore edges with admittedAt > t; sort deterministically
  // (by voucher, then admittedAt, then linkageWeight)
  const validEdges = edges
    .filter((e) => e.admittedAt <= t)
    .sort(
      (a, b) =>
        cmp(a.voucher, b.voucher) ||
        cmp(a.admittedAt, b.admittedAt) ||
        cmp(a.linkageWeight, b.linkageWeight),
    );

  // Build adjacency list for upward traversal (vouchee -> edges into it)
  const adj: Map<string, VouchEdge[]> = new Map();
  for (const edge of validEdges) {
    if (!adj.has(edge.vouchee)) adj.set(edge.vouchee, []);
    adj.get(edge.vouchee)!.push(edge);
  }

  // Best uncapped candidate per member over all simple paths
  const best: Map<string, TransitivePenalty> = new Map();

  // path runs from `member` down to the convicted; weights[0] is nearest the convicted
  const walk = (member: string, path: string[], weights: bigint[]): void => {
    for (const edge of adj.get(member) ?? []) {
      if (path.includes(edge.voucher)) continue; // simple paths only
      const w = decayedLinkage(edge, t);
      if (w < PENALTY_FLOOR) continue;

      const nextWeights = [...weights, w];
      const hop = nextWeights.length - 1;
      const fraction = penaltyFraction(hop, nextWeights);
      if (fraction < PENALTY_FLOOR) continue;

      const nextPath = [edge.voucher, ...path];
      const cur = best.get(edge.voucher);
      if (
        !cur ||
        fraction > cur.fraction ||
        (fraction === cur.fraction && hop < cur.hop)
      ) {
        best.set(edge.voucher, {
          member: edge.voucher,
          hop,
          path: nextPath,
          fraction,
          amount: 0n,
        });
      }
      walk(edge.voucher, nextPath, nextWeights);
    }
  };
  walk(convicted, [convicted], []);

  // Cap and compute amounts only after the search
  const cap = fx("PENALTY_CAP_PER_INCIDENT");
  return Array.from(best.values())
    .map(({ member, hop, path, fraction }) => {
      const capped = fraction < cap ? fraction : cap;
      const r = snapshot.get(member);
      if (r === undefined) throw new RangeError(`no snapshot for ${member}`);
      return { member, hop, path, fraction: capped, amount: mul(capped, r) };
    })
    .sort((a, b) => cmp(a.member, b.member));
}
