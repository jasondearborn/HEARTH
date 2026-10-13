// spec §4.9, §4.9.1 — bridge weight (overlap discount) and source-tribe eligibility gate
import { REP_SCALE, mul, fromDecimal } from "./fixed.js";
import { resolve } from "./params.js";

const fx = (name: string): bigint => fromDecimal(String(resolve(name).value));

export interface BridgeSource {
  checkpointHistoryEpochs: number; // (i) epochs of continuous checkpoint history of the source tribe
  activeMembers: number; // (ii)
  federationRated: boolean; // (iii) non-"unrated" standing from the target tribe's vantage
  sourceCheckpointEpoch: number; // (iv) the proof's anchor checkpoint
  admissionEpoch: number; // (iv) epoch of the admission it is presented for
}

// spec §4.9.1
export function bridgeWeight(overlap: bigint): bigint {
  if (overlap < 0n || overlap > REP_SCALE)
    throw new RangeError("overlap must be in [0, REP_SCALE]");
  const base = fx("BASE_BRIDGE_WEIGHT");
  const cap = fx("BRIDGE_WEIGHT_CAP");
  const weight = mul(base, REP_SCALE - overlap);
  return weight < cap ? weight : cap;
}

const nonNegativeInteger = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer`);
};

// spec §4.9
export function bridgeSourceFailures(s: BridgeSource): string[] {
  nonNegativeInteger("checkpointHistoryEpochs", s.checkpointHistoryEpochs);
  nonNegativeInteger("activeMembers", s.activeMembers);
  nonNegativeInteger("sourceCheckpointEpoch", s.sourceCheckpointEpoch);
  nonNegativeInteger("admissionEpoch", s.admissionEpoch);

  const minAge = resolve("MIN_BRIDGE_SOURCE_AGE").value;
  const minSize = resolve("MIN_BRIDGE_SOURCE_SIZE").value;
  const maxAge = resolve("BRIDGE_PROOF_MAX_AGE").value;

  const failures: string[] = [];
  if (s.checkpointHistoryEpochs < minAge) failures.push("age");
  if (s.activeMembers < minSize) failures.push("size");
  if (!s.federationRated) failures.push("unrated");

  const proofAge = s.admissionEpoch - s.sourceCheckpointEpoch;
  if (proofAge < 0) failures.push("future");
  else if (proofAge > maxAge) failures.push("stale");

  return failures;
}
