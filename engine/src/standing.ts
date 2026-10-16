// spec §4.10 — dormancy and probation standing at an epoch; §4.5 kin-admission probation; §6.3 definition of N
import { resolve } from "./params.js";

export interface MemberHistory {
  /** accepted dormancy periods, any order; each covers `start ≤ e < end` */
  dormancy: readonly { start: number; end: number }[];
  /** epoch of this member's kin-admission, if any */
  kinAdmittedAt: number | null;
  revokedAt: number | null;
}

export interface Standing {
  dormant: boolean;
  reentryProbation: boolean;
  kinProbation: boolean;
  revoked: boolean;
}

function assertEpoch(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer, got ${value}`);
  }
}

/**
 * §4.10 (dormancy evaluation, half-open periods; re-entry probation after a period) and §4.5
 * escalation 2(i) (kin-admission probation): report the four independent suspension flags at
 * epoch `t`. A member is `dormant` while `start ≤ t < end`, in `reentryProbation` for
 * `DORMANCY_PROBATION` epochs after a period ends, in `kinProbation` for `KIN_PROBATION` epochs
 * from the kin-admission epoch, and `revoked` permanently from `revokedAt` onward.
 */
export function standingAt(history: MemberHistory, t: number): Standing {
  assertEpoch(t, "t");
  const periods = history.dormancy;
  for (const p of periods) {
    assertEpoch(p.start, "dormancy period start");
    assertEpoch(p.end, "dormancy period end");
    if (p.end <= p.start) {
      throw new RangeError(`dormancy period end ${p.end} must be greater than start ${p.start}`);
    }
  }
  const kinAdmittedAt = history.kinAdmittedAt;
  if (kinAdmittedAt !== null) assertEpoch(kinAdmittedAt, "kinAdmittedAt");
  const revokedAt = history.revokedAt;
  if (revokedAt !== null) assertEpoch(revokedAt, "revokedAt");

  const reentryWindow = resolve("DORMANCY_PROBATION").value;
  const kinWindow = resolve("KIN_PROBATION").value;

  let dormant = false;
  let reentryProbation = false;
  for (const p of periods) {
    if (p.start <= t && t < p.end) dormant = true;
    if (p.end <= t && t < p.end + reentryWindow) reentryProbation = true;
  }
  const kinProbation = kinAdmittedAt !== null && kinAdmittedAt <= t && t < kinAdmittedAt + kinWindow;
  const revoked = revokedAt !== null && revokedAt <= t;

  return { dormant, reentryProbation, kinProbation, revoked };
}

/** §6.3 definition of N: any suspension flag removes the member from N and forbids vouching. */
export function isSuspended(standing: Standing): boolean {
  return standing.dormant || standing.reentryProbation || standing.kinProbation || standing.revoked;
}
