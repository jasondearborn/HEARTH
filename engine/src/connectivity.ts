// spec §4.6 — connectivity discount: k(m) vertex-disjoint vouch paths to the elder set
import { div, REP_SCALE } from "./fixed.js";
import { resolve } from "./params.js";

export interface VouchLink {
  voucher: string;
  vouchee: string;
}

const cmp = <T extends string | number>(a: T, b: T): number =>
  a < b ? -1 : a > b ? 1 : 0;

const cmpPath = (a: readonly string[], b: readonly string[]): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = cmp(a[i]!, b[i]!);
    if (c !== 0) return c;
  }
  return cmp(a.length, b.length);
};

// Upward adjacency (vouchee -> its distinct vouchers). Parallel edges collapse into
// one and the lists are sorted, so enumeration never depends on edge order.
function upwardAdjacency(
  edges: readonly VouchLink[],
): ReadonlyMap<string, readonly string[]> {
  const byVouchee = new Map<string, Set<string>>();
  for (const e of edges) {
    (byVouchee.get(e.vouchee) ?? byVouchee.set(e.vouchee, new Set()).get(e.vouchee))!.add(e.voucher);
  }
  const sorted = new Map<string, readonly string[]>();
  for (const [vouchee, vouchers] of byVouchee) {
    sorted.set(vouchee, [...vouchers].sort(cmp));
  }
  return sorted;
}

// spec §4.6 — every simple upward path from `member` of 1..depth edges ending at an
// elder, recorded as its vertex list excluding `member`. Paths stop at their first
// elder: passing through an elder never helps, since the truncated path uses a subset
// of the vertices and reaches the same target set.
function enumeratePaths(
  up: ReadonlyMap<string, readonly string[]>,
  elders: ReadonlySet<string>,
  member: string,
  depth: number,
): string[][] {
  const paths: string[][] = [];
  const onPath = new Set([member]); // simple paths: no vertex repeats, member included
  const path: string[] = []; // intermediate vertices since member

  const walk = (node: string, edgesLeft: number): void => {
    if (edgesLeft < 1) return;
    for (const next of up.get(node) ?? []) {
      if (onPath.has(next)) continue;
      if (elders.has(next)) {
        paths.push([...path, next]);
        continue; // terminal elder
      }
      path.push(next);
      onPath.add(next);
      walk(next, edgesLeft - 1);
      path.pop();
      onPath.delete(next);
    }
  };

  walk(member, depth);
  return paths;
}

// spec §4.6 — exact maximum number of pairwise vertex-disjoint paths (no shared vertex
// besides `member`, terminal elders included), capped at kTarget. Greedy taking of the
// first path found is wrong; this backtracks over candidate subsets and exits as soon
// as kTarget disjoint paths are found, since only min(k, k_target) matters. Maximum
// length-bounded vertex-disjoint paths is NP-hard for bounds >= 5, but kTarget = 2
// within a ~150-member tribe keeps this exhaustive search tractable.
function maxDisjointPaths(
  paths: readonly (readonly string[])[],
  kTarget: number,
): number {
  const sorted = [...paths].sort(cmpPath);
  const vertexSets = sorted.map((p) => new Set(p));
  const chosen: number[] = [];
  let best = 0;

  const overlapsChosen = (i: number): boolean => {
    const candidate = sorted[i]!;
    for (const j of chosen) {
      const used = vertexSets[j]!;
      if (candidate.some((v) => used.has(v))) return true;
    }
    return false;
  };

  const search = (start: number): void => {
    if (best >= kTarget) return;
    if (chosen.length > best) best = chosen.length;
    if (chosen.length + (sorted.length - start) <= best) return; // cannot improve
    for (let i = start; i < sorted.length; i++) {
      if (best >= kTarget) return;
      if (overlapsChosen(i)) continue;
      chosen.push(i);
      search(i + 1);
      chosen.pop();
    }
  };

  search(0);
  return Math.min(best, kTarget);
}

// spec §4.6 — k(m) capped: min(k(m), k_target). Paths run directed upward from `member`
// to its vouchers; an edge where `member` is the voucher is not a step toward the elders.
export function connectivityK(
  edges: readonly VouchLink[],
  member: string,
  elders: readonly string[],
): number {
  const kTarget = resolve("k_target").value; // spec App. D: k_target
  const elderSet = new Set(elders);
  if (elderSet.has(member)) return kTarget; // an elder is fully connected by definition
  const depth = resolve("CONNECTIVITY_SEARCH_DEPTH").value; // spec App. D: CONNECTIVITY_SEARCH_DEPTH
  const paths = enumeratePaths(upwardAdjacency(edges), elderSet, member, depth);
  return maxDisjointPaths(paths, kTarget);
}

// spec §4.6 — connectivity_multiplier(m) = min(1, k(m)/k_target)
export function connectivityMultiplier(
  edges: readonly VouchLink[],
  member: string,
  elders: readonly string[],
): bigint {
  const kTarget = resolve("k_target").value; // spec App. D: k_target
  const k = connectivityK(edges, member, elders);
  // connectivityK caps k at kTarget, so this is min(1, k/k_target): 0 -> 0n, 1 -> 0.5, kTarget -> 1.0
  return div(BigInt(k) * REP_SCALE, BigInt(kTarget) * REP_SCALE);
}
