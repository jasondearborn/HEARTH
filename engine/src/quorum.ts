// spec §6.3 — quorum, small-tribe rule, definition of N; §6.4 appeal window as gate

const SMALL_TRIBE_MAX = 12;
const QUORUM_FRACTION = 0.25; // q
const QUORUM_MIN = 3; // M_min
const SMALL_TRIBE_FRACTION = 0.5;

export interface RosterEntry {
  id: string;
  dormant: boolean;
  revoked: boolean;
  reentryProbation: boolean;
  kinProbation: boolean;
}

function requireCount(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError("active tribe size must be a non-negative integer");
  }
  return n;
}

// spec §6.3 — standard rule max(M_min, ceil(q·N)) for N >= 12; small-tribe max(3, ceil(0.5·N)).
export function quorum(n: number): number {
  const size = requireCount(n);
  if (size < SMALL_TRIBE_MAX) {
    return Math.max(QUORUM_MIN, Math.floor((size + 1) / 2));
  }
  return Math.max(QUORUM_MIN, Math.floor((size + 3) / 4));
}

// spec §6.4 — below N = 12 the appeal window gates penalty; at or above it is a backstop.
export function appealIsGate(n: number): boolean {
  return requireCount(n) < SMALL_TRIBE_MAX;
}

// spec §6.3 — definition of N: members eligible to be counted as a distinct complainant.
export function activeTribeSize(roster: readonly RosterEntry[]): number {
  const seen = new Set<string>();
  let count = 0;
  for (const entry of roster) {
    if (seen.has(entry.id)) throw new RangeError(`duplicate roster id: ${entry.id}`);
    seen.add(entry.id);
    if (
      !entry.dormant &&
      !entry.revoked &&
      !entry.reentryProbation &&
      !entry.kinProbation
    ) {
      count++;
    }
  }
  return count;
}
