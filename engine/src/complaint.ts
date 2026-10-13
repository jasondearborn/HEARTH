// spec §6.1 — ComplaintRecord filing check (evidence, enrollment, self-complaint, rate limit, evidence reuse)
import { resolve } from "./params.js";

const HEX64 = /^[0-9a-f]{64}$/;

export interface Complaint {
  /** record hash, 64 lowercase hex chars */
  hash: string;
  complainant: string;
  target: string;
  /** epoch filed */
  epoch: number;
  /** content-addressed evidence */
  evidenceHash: string;
}

export interface ComplaintContext {
  /** roster-enrolled members of the tribe */
  roster: ReadonlySet<string>;
  /** complaints this relay already accepted */
  accepted: readonly Complaint[];
  /** evidence hashes of complaints counted in dismissed cases (§6.4) */
  dismissedEvidence: ReadonlySet<string>;
}

export type ComplaintFailure =
  | "evidence"
  | "complainant-not-enrolled"
  | "target-not-enrolled"
  | "self-complaint"
  | "rate-limit"
  | "evidence-reused";

export interface ComplaintCheck {
  accepted: boolean;
  failures: ComplaintFailure[];
}

/**
 * spec §6.1 — whether a Steward relay accepts a ComplaintRecord, listing every reason it fails.
 * A malformed record (bad record hash, non-integer/non-negative epoch, or a duplicate record
 * hash already accepted) throws `RangeError`; it is not a rejection.
 */
export function checkComplaint(complaint: Complaint, ctx: ComplaintContext): ComplaintCheck {
  if (!HEX64.test(complaint.hash))
    throw new RangeError("complaint hash must be 64 lowercase hex chars");
  if (!Number.isInteger(complaint.epoch) || complaint.epoch < 0)
    throw new RangeError("epoch must be a non-negative integer");
  if (ctx.accepted.some((c) => c.hash === complaint.hash))
    throw new RangeError(`complaint ${complaint.hash} is already accepted`);

  const failures: ComplaintFailure[] = [];

  if (!HEX64.test(complaint.evidenceHash)) failures.push("evidence");
  if (!ctx.roster.has(complaint.complainant)) failures.push("complainant-not-enrolled");
  if (!ctx.roster.has(complaint.target)) failures.push("target-not-enrolled");
  if (complaint.complainant === complaint.target) failures.push("self-complaint");

  const limit = resolve("COMPLAINT_RATE_LIMIT").value;
  const sameFiler = ctx.accepted.filter(
    (c) => c.complainant === complaint.complainant && c.epoch === complaint.epoch,
  ).length;
  if (sameFiler >= limit) failures.push("rate-limit");

  if (ctx.dismissedEvidence.has(complaint.evidenceHash)) failures.push("evidence-reused");

  return { accepted: failures.length === 0, failures };
}
