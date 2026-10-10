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
  if (edge.admittedAt > t) throw new RangeError();
  return mul(edge.linkageWeight, pow(LAMBDA, t - edge.admittedAt));
}

// spec §6.6
export function penaltyFraction(
  hop: number,
  weights: readonly bigint[],
): bigint {
  if (!Number.isInteger(hop) || hop < 0) throw new RangeError();
  if (weights.length !== hop + 1) throw new RangeError();
  let acc = fx("P_dir");
  acc = mul(acc, pow(fx("g"), hop));
  for (const w of weights) {
    acc = mul(acc, w);
  }
  return acc;
}

// spec §6.6, §6.5
export function transitivePenalties(
  edges: readonly VouchEdge[],
  convicted: string,
  t: number,
  snapshot: ReadonlyMap<string, bigint>,
): TransitivePenalty[] {
  // Ignore edges with admittedAt > t
  const validEdges = edges.filter((e) => e.admittedAt <= t);

  // Sort edges deterministically (by voucher, then admittedAt, then linkageWeight)
  validEdges.sort((a, b) => {
    if (a.voucher !== b.voucher) return a.voucher < b.voucher ? -1 : 1;
    if (a.admittedAt !== b.admittedAt)
      return a.admittedAt < b.admittedAt ? -1 : 1;
    return a.linkageWeight < b.linkageWeight ? -1 : 1;
  });

  // Build adjacency list for upward traversal
  const adj: Map<string, VouchEdge[]> = new Map();
  for (const edge of validEdges) {
    if (!adj.has(edge.vouchee)) adj.set(edge.vouchee, []);
    adj.get(edge.vouchee)!.push(edge);
  }

  // Track candidates for each member
  const candidates: Map<string, TransitivePenalty> = new Map();

  // DFS from convicted member
  const visited = new Set<string>();
  const stack: { member: string; path: string[]; weights: bigint[] }[] = [];

  // Initialize stack with edges from convicted member
  const initialEdges = adj.get(convicted) || [];
  for (const edge of initialEdges) {
    const w = decayedLinkage(edge, t);
    if (w >= PENALTY_FLOOR) {
      stack.push({
        member: edge.voucher,
        path: [edge.voucher, convicted],
        weights: [edge.linkageWeight],
      });
    }
  }

  while (stack.length > 0) {
    const { member, path, weights } = stack.pop()!;

    // Avoid cycles
    if (visited.has(member)) continue;
    visited.add(member);

    // Compute penalty fraction
    const hop = weights.length - 1;
    const fraction = penaltyFraction(hop, weights);

    // Skip if below floor
    if (fraction < PENALTY_FLOOR) continue;

    // Cap fraction
    const cappedFraction =
      fraction < fx("PENALTY_CAP_PER_INCIDENT")
        ? fraction
        : fx("PENALTY_CAP_PER_INCIDENT");

    // Compute amount
    const amount = mul(cappedFraction, snapshot.get(member)!);

    // Add to candidates, keeping the one with larger fraction, or smaller hop if equal
    const existing = candidates.get(member);
    if (
      !existing ||
      fraction > existing.fraction ||
      (fraction === existing.fraction && hop < existing.hop)
    ) {
      candidates.set(member, {
        member,
        hop,
        path,
        fraction: cappedFraction,
        amount,
      });
    }

    // Continue DFS
    const nextEdges = adj.get(member) || [];
    for (const edge of nextEdges) {
      const w = decayedLinkage(edge, t);
      if (w >= PENALTY_FLOOR) {
        stack.push({
          member: edge.voucher,
          path: [edge.voucher, ...path],
          weights: [edge.linkageWeight, ...weights],
        });
      }
    }
  }

  // Convert to array and sort by member id
  const result = Array.from(candidates.values());
  result.sort((a, b) => (a.member < b.member ? -1 : 1));

  return result;
}
