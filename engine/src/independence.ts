// spec §4.5 — voucher-independence rule (escalation form), kin-admission stake
import { fromDecimal, mul } from "./fixed.js";
import { resolve } from "./params.js";
import type { VouchEdge } from "./penalty.js";
import { decayedLinkage } from "./penalty.js";

const fx = (name: string): bigint => fromDecimal(String(resolve(name).value));

export interface VouchGraph {
  /** undirected adjacency: every vouch edge as a pair (voucher, vouchee) */
  adjacency: Map<string, Set<string>>;
}

/** §4.5: "the tribe's vouch graph is the undirected graph over voucher→vouchee edges". */
export function buildVouchGraph(edges: readonly { voucher: string; vouchee: string }[]): VouchGraph {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a))!.add(b);
    (adjacency.get(b) ?? adjacency.set(b, new Set()).get(b))!.add(a);
  };
  for (const e of edges) link(e.voucher, e.vouchee);
  return { adjacency };
}

/** §4.5 (a) hop independence: true when no path of length ≤ h connects v1 and v2. */
export function hopIndependent(graph: VouchGraph, v1: string, v2: string, h: number): boolean {
  if (h < 0) throw new RangeError("hop budget must be non-negative");
  if (v1 === v2) return false;
  // BFS: a path of h edges means h levels of expansion; a direct vouch edge is 1 hop.
  const seen = new Set([v1]);
  let frontier: string[] = [v1];
  for (let hop = 1; hop <= h; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const nb of graph.adjacency.get(node) ?? []) {
        if (nb === v2) return false; // distance = hop ≤ h
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) return true;
  }
  return true;
}

/** §4.5 (b): the set of members who originally vouched `id` into the tribe, sorted. */
export function admittingSet(edges: readonly VouchEdge[], id: string): string[] {
  return edges
    .filter((e) => e.vouchee === id)
    .map((e) => e.voucher)
    .sort();
}

/** §4.5 (a)+(b) together. Empty admitting sets (founders, and members admitted before the
 * check existed) do not count as "identical groups": the rule targets clustered duplicates. */
export function independent(
  graph: VouchGraph,
  v1: string,
  v2: string,
  h: number,
  admit1: readonly string[],
  admit2: readonly string[],
): boolean {
  if (!hopIndependent(graph, v1, v2, h)) return false;
  if (admit1.length > 0 && admit2.length > 0 && admit1.length === admit2.length && admit1.every((x, i) => x === admit2[i])) {
    return false; // identical admit groups: the documented duplicate-groups attack [BRIGHTID]
  }
  return true;
}

/** §4.5 kin stake multiplier: 1.5, then 2.25, compounding per repeat (n = repetition count). */
export function kinStakeMult(n: number): bigint {
  if (n < 0) throw new RangeError("kin repeat count must be non-negative");
  const step = fx("KIN_STAKE_MULT");
  let acc = fromDecimal("1");
  for (let i = 0; i < n; i++) acc = mul(acc, step);
  return acc;
}

/**
 * §4.5 escalation 2(ii): the vouchers' linkage weight (§4.7) raised by the kin stake multiplier
 * for this vouchee. `repeatCount` is the 0-based repetition count of kin-admissions by the same
 * voucher pair within KIN_REPEAT_WINDOW (§4.5).
 */
export function kinLinkageWeight(edge: VouchEdge, t: number, repeatCount: number): bigint {
  return mul(decayedLinkage(edge, t), kinStakeMult(repeatCount));
}

/** §4.5 KIN_PROBATION: epochs during which a kin admittee takes no trust-conferring action. */
export function kinProbationEpochs(): number {
  return resolve("KIN_PROBATION").value;
}

/** §4.5 hop-independence parameter (default 2, sim-backed Appendix A.5 S1). */
export function independenceHops(): number {
  return resolve("VOUCH_INDEPENDENCE_HOPS").value;
}
