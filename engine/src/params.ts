// Protocol parameters, transcribed from spec App. D

export type Status =
  | "sim-backed"
  | "provisional"
  | "deployment-tunable"
  | "retired";
export type Unit =
  | "epochs"
  | "days"
  | "hours"
  | "minutes"
  | "hops"
  | "count"
  | "ratio"
  | "multiplier"
  | "scale";
export type ParamValue =
  | { readonly kind: "number"; readonly value: number; readonly unit: Unit }
  | { readonly kind: "ref"; readonly ref: string; readonly factor: number }
  | {
      readonly kind: "list";
      readonly values: readonly number[];
      readonly unit: Unit;
    }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unset" }
  | { readonly kind: "retired" };

export interface Param {
  readonly name: string;
  readonly value: ParamValue;
  readonly status: Status;
  readonly evidence: string;
  readonly section: string;
}

function make(
  name: string,
  value: ParamValue,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return Object.freeze({
    name,
    value: Object.freeze(value),
    status,
    evidence,
    section,
  });
}

function makeNumber(
  name: string,
  value: number,
  unit: Unit,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(name, { kind: "number", value, unit }, status, evidence, section);
}

function makeRef(
  name: string,
  ref: string,
  factor: number,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(name, { kind: "ref", ref, factor }, status, evidence, section);
}

function makeList(
  name: string,
  values: number[],
  unit: Unit,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(
    name,
    { kind: "list", values: Object.freeze([...values]), unit },
    status,
    evidence,
    section,
  );
}

function makeText(
  name: string,
  text: string,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(name, { kind: "text", text }, status, evidence, section);
}

function makeUnset(
  name: string,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(name, { kind: "unset" }, status, evidence, section);
}

function makeRetired(
  name: string,
  status: Status,
  evidence: string,
  section: string,
): Param {
  return make(name, { kind: "retired" }, status, evidence, section);
}

const ENTRIES: readonly Param[] = [
  // spec App. D: EPOCH_LEN
  makeNumber("EPOCH_LEN", 24, "hours", "provisional", "—", "§2.4"),

  // spec App. D: DEVICE_PROBATION_DURATION
  makeNumber("DEVICE_PROBATION_DURATION", 3, "epochs", "provisional", "none — carried v4 qualitative intent, R1 identity-rental discussion", "§3.5"),

  // spec App. D: THRESHOLD_ROOT_DEFAULT
  makeList("THRESHOLD_ROOT_DEFAULT", [2, 3], "count", "deployment-tunable", "none — carried from v4 §2.5 qualitative default", "§3.6"),

  // spec App. D: RECOVERY_TIME_LOCK
  makeNumber("RECOVERY_TIME_LOCK", 7, "epochs", "provisional", "none — v4 §2.5 qualitative", "§3.7"),

  // spec App. D: TIER_MEMBER
  makeNumber("TIER_MEMBER", 0.1, "ratio", "sim-backed", "Appendix A", "§4.2"),

  // spec App. D: TIER_TRUSTED
  makeNumber("TIER_TRUSTED", 0.4, "ratio", "sim-backed", "Appendix A", "§4.2"),

  // spec App. D: TIER_STEWARD_ELIGIBLE
  makeNumber("TIER_STEWARD_ELIGIBLE", 0.75, "ratio", "sim-backed", "Appendix A", "§4.2"),

  // spec App. D: ANCHOR_INITIAL_REPUTATION
  makeNumber("ANCHOR_INITIAL_REPUTATION", 0.5, "ratio", "provisional", "none — deployment-tunable per tribe", "§4.1"),

  // spec App. D: B_VOUCH
  makeNumber("B_VOUCH", 2, "count", "sim-backed", "Appendix A.4", "§4.3"),

  // spec App. D: VOUCH_WINDOW
  makeNumber("VOUCH_WINDOW", 30, "epochs", "sim-backed", "Appendix A.4", "§4.3"),

  // spec App. D: PROXIMITY_EXPIRY
  makeNumber("PROXIMITY_EXPIRY", 10, "minutes", "provisional", "none", "§4.4"),

  // spec App. D: VOUCH_INDEPENDENCE_HOPS
  makeNumber("VOUCH_INDEPENDENCE_HOPS", 2, "hops", "sim-backed", "Appendix A.5 (S1)", "§4.5"),

  // spec App. D: KIN_PROBATION
  makeNumber("KIN_PROBATION", 45, "epochs", "provisional", "none", "§4.5"),

  // spec App. D: KIN_STAKE_MULT
  makeNumber("KIN_STAKE_MULT", 1.5, "multiplier", "provisional", "none", "§4.5"),

  // spec App. D: KIN_NEIGHBORHOOD_WINDOW
  makeNumber("KIN_NEIGHBORHOOD_WINDOW", 30, "epochs", "provisional", "none", "§4.5"),

  // spec App. D: k_target
  makeNumber("k_target", 2, "count", "sim-backed", "Appendix A.5 (S1)", "§4.6"),

  // spec App. D: CONNECTIVITY_SEARCH_DEPTH
  makeNumber("CONNECTIVITY_SEARCH_DEPTH", 6, "hops", "provisional", "none", "§4.6"),

  // spec App. D: LINKAGE_HALF_LIFE
  makeRef("LINKAGE_HALF_LIFE", "H", 1, "provisional", "none", "§4.7"),

  // spec App. D: BASE_BRIDGE_WEIGHT
  makeNumber("BASE_BRIDGE_WEIGHT", 0.05, "ratio", "provisional", "none — carried mechanism from v3/v4", "§4.9.1"),

  // spec App. D: BRIDGE_WEIGHT_CAP
  makeNumber("BRIDGE_WEIGHT_CAP", 0.05, "ratio", "provisional", "none — carried mechanism from v3/v4", "§4.9.1"),

  // spec App. D: BRIDGE_INITIAL_BOOST
  makeNumber("BRIDGE_INITIAL_BOOST", 0.05, "ratio", "provisional", "none", "§4.9"),

  // spec App. D: MIN_BRIDGE_SOURCE_AGE
  makeNumber("MIN_BRIDGE_SOURCE_AGE", 90, "epochs", "provisional", "none", "§4.9"),

  // spec App. D: MIN_BRIDGE_SOURCE_SIZE
  makeNumber("MIN_BRIDGE_SOURCE_SIZE", 12, "count", "provisional", "none", "§4.9"),

  // spec App. D: DORMANCY_FLOOR_MODE
  makeText("DORMANCY_FLOOR_MODE", "policy choice", "provisional", "—", "§4.10"),

  // spec App. D: DORMANCY_MAX_DAYS
  makeNumber("DORMANCY_MAX_DAYS", 180, "days", "sim-backed", "Appendix A.6 (S2)", "§4.10"),

  // spec App. D: DORMANCY_ROLLING_WINDOW
  makeNumber("DORMANCY_ROLLING_WINDOW", 365, "days", "sim-backed", "Appendix A.6", "§4.10"),

  // spec App. D: DORMANCY_COOLDOWN
  makeNumber("DORMANCY_COOLDOWN", 60, "days", "sim-backed", "Appendix A.6 (zero dormancy vouch-leaks across every seed/chill level)", "§4.10"),

  // spec App. D: DORMANCY_PROBATION
  makeNumber("DORMANCY_PROBATION", 14, "days", "provisional", "none — mirrors §3.5's device-probation pattern", "§4.10"),

  // spec App. D: B_E(Member)
  makeUnset("B_E(Member)", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.1"),

  // spec App. D: B_E(Trusted)
  makeUnset("B_E(Trusted)", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.1"),

  // spec App. D: B_E(Steward-eligible)
  makeUnset("B_E(Steward-eligible)", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.1"),

  // spec App. D: δ
  makeRetired("δ", "retired", "falsified by S8, Appendix A.10; §5.2.2 now uses `1/(1+c)`", "§5.2.2"),

  // spec App. D: BASE_UNIT
  makeNumber("BASE_UNIT", 0.08, "ratio", "provisional", "Appendix A.10 (S8): steady median 1.0 at degree ≈ 12, 1 interaction/day", "§5.2"),

  // spec App. D: tier_multiplier(Member)
  makeNumber("tier_multiplier(Member)", 1.0, "multiplier", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.3"),

  // spec App. D: tier_multiplier(Trusted)
  makeNumber("tier_multiplier(Trusted)", 1.5, "multiplier", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.3"),

  // spec App. D: tier_multiplier(Steward-eligible)
  makeNumber("tier_multiplier(Steward-eligible)", 2.0, "multiplier", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.3"),

  // spec App. D: PROXIMITY_MULTIPLIER
  makeNumber("PROXIMITY_MULTIPLIER", 1.0, "multiplier", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.4"),

  // spec App. D: REMOTE_MULTIPLIER
  makeNumber("REMOTE_MULTIPLIER", 0.4, "multiplier", "provisional", "none — S2 does not model §5.2 (review correction)", "§5.2.4"),

  // spec App. D: H
  makeNumber("H", 90, "days", "sim-backed", "Appendix A.1", "§5.3"),

  // spec App. D: CHECKPOINT_DISPUTE_WINDOW
  makeNumber("CHECKPOINT_DISPUTE_WINDOW", 3, "epochs", "provisional", "none", "§5.5.3"),

  // spec App. D: DISPUTE_ABUSE_THRESHOLD
  makeText("DISPUTE_ABUSE_THRESHOLD", "3 rebuttals / 90 epochs → 30-epoch suspension", "provisional", "none", "§5.5.3"),

  // spec App. D: WITNESS_K
  makeNumber("WITNESS_K", 2, "count", "provisional", "none — no sim targets this parameter specifically", "§5.6"),

  // spec App. D: WITNESS_N
  makeText("WITNESS_N", "number of bridge-partner tribes", "provisional", "none", "§5.6"),

  // spec App. D: COMPLAINT_RATE_LIMIT
  makeNumber("COMPLAINT_RATE_LIMIT", 1, "count", "provisional", "none — carried mechanism from v3/v4", "§6.1"),

  // spec App. D: RETALIATION_WINDOW
  makeNumber("RETALIATION_WINDOW", 30, "days", "provisional", "none", "§6.2"),

  // spec App. D: CASE_WINDOW
  makeNumber("CASE_WINDOW", 60, "days", "provisional", "none — carried v3/v4 pattern", "§6.4"),

  // spec App. D: APPEAL_WINDOW
  makeNumber("APPEAL_WINDOW", 14, "days", "provisional", "none", "§6.4"),

  // spec App. D: PENALTY_CAP_PER_INCIDENT
  makeNumber("PENALTY_CAP_PER_INCIDENT", 0.3, "ratio", "provisional", "none", "§6.6"),

  // spec App. D: PENALTY_CAP_AGGREGATE
  makeNumber("PENALTY_CAP_AGGREGATE", 0.4, "ratio", "provisional", "none", "§6.6"),

  // spec App. D: P_dir
  makeNumber("P_dir", 0.25, "ratio", "sim-backed", "Appendix A.2", "§6.6"),

  // spec App. D: g
  makeNumber("g", 0.35, "ratio", "sim-backed", "Appendix A.2", "§6.6"),

  // spec App. D: m
  makeNumber("m", 3, "count", "provisional", "none — carried from backlog design", "§6.7"),

  // spec App. D: APPEAL_DELIBERATION_WINDOW
  makeUnset("APPEAL_DELIBERATION_WINDOW", "provisional", "none", "§6.7"),

  // spec App. D: SPARK_EXPIRY_HORIZON
  makeRef("SPARK_EXPIRY_HORIZON", "NULLIFIER_RETENTION_EPOCHS", 1, "provisional", "none", "§7.2.1"),

  // spec App. D: NULLIFIER_RETENTION_EPOCHS
  makeNumber("NULLIFIER_RETENTION_EPOCHS", 2, "epochs", "provisional", "[RLN]", "§7.5"),

  // spec App. D: NULLIFIER_BLOOM_FPR
  makeNumber("NULLIFIER_BLOOM_FPR", 0.001, "ratio", "deployment-tunable", "[RLN]", "§7.5"),

  // spec App. D: Spark budget curve shape
  makeText("Spark budget curve shape", "linear-above-gate", "sim-backed", "Appendix A.7 (S3)", "§7.6"),

  // spec App. D: α
  makeUnset("α", "deployment-tunable", "—", "§7.6"),

  // spec App. D: BEACON_ENDORSE_K
  makeNumber("BEACON_ENDORSE_K", 3, "count", "deployment-tunable", "v4 §6.2, no independent sim", "§8.3"),

  // spec App. D: BEACON_RETRACT_PENALTY
  makeRef("BEACON_RETRACT_PENALTY", "P_dir", 1, "deployment-tunable", "reuse of §6.2 calibration, no independent Beacon-specific sim", "§8.4"),

  // spec App. D: SELF_RETRACT_FACTOR
  makeRef("SELF_RETRACT_FACTOR", "BEACON_RETRACT_PENALTY", 0.4, "provisional", "R4 retraction-stigma research", "§8.4"),

  // spec App. D: BEACON_RETRACT_ESCALATION_WINDOW
  makeNumber("BEACON_RETRACT_ESCALATION_WINDOW", 365, "days", "provisional", "rationale-only, no sim", "§8.4"),

  // spec App. D: BEACON_RETRACT_ESCALATION_MULT
  makeList("BEACON_RETRACT_ESCALATION_MULT", [1.0, 1.5, 2.0], "multiplier", "provisional", "rationale-only, no sim", "§8.4"),

  // spec App. D: BEACON_STATUS_FRESHNESS
  makeNumber("BEACON_STATUS_FRESHNESS", 1, "epochs", "provisional", "—", "§8.7"),

  // spec App. D: CITATION_HALFLIFE
  makeNumber("CITATION_HALFLIFE", 365, "days", "deployment-tunable", "v4 §7.1, qualitative", "§9.2"),

  // spec App. D: DISPUTE_HALFLIFE
  makeRef("DISPUTE_HALFLIFE", "H", 1, "provisional", "qualitative, no independent sim", "§9.3"),

  // spec App. D: COMPOSITE_COVERAGE_FLOOR
  makeNumber("COMPOSITE_COVERAGE_FLOOR", 0.25, "ratio", "provisional", "Appendix C.6 (S5) — structural result, see correction", "§9.4"),

  // spec App. D: MLS_SEQUENCER_ROTATION_PERIOD
  makeNumber("MLS_SEQUENCER_ROTATION_PERIOD", 1, "epochs", "provisional", "—", "§10.2.1"),

  // spec App. D: MLS_SEQUENCER_LIVENESS_TIMEOUT
  makeText("MLS_SEQUENCER_LIVENESS_TIMEOUT", "small multiple of expected RTT", "deployment-tunable", "—", "§10.2.1"),

  // spec App. D: MLS_FAIRNESS_MULTIPLE
  makeNumber("MLS_FAIRNESS_MULTIPLE", 3, "multiplier", "provisional", "none", "§10.2.1"),

  // spec App. D: PARTITION_SCHISM_TIMEOUT
  makeNumber("PARTITION_SCHISM_TIMEOUT", 30, "epochs", "provisional", "none", "§10.2.1"),

  // spec App. D: SYNC_CHECKPOINT_WINDOW_K
  makeNumber("SYNC_CHECKPOINT_WINDOW_K", 30, "count", "deployment-tunable", "—", "§10.3.1"),

  // spec App. D: MAILBOX_TTL
  makeNumber("MAILBOX_TTL", 14, "days", "deployment-tunable", "—", "§10.4"),

  // spec App. D: MAILBOX_MAX_BYTES
  makeUnset("MAILBOX_MAX_BYTES", "deployment-tunable", "—", "§10.4"),

  // spec App. D: MAILBOX_MAX_ENTRIES
  makeUnset("MAILBOX_MAX_ENTRIES", "deployment-tunable", "—", "§10.4"),

  // spec App. D: MDNS_DEFAULT_MODE
  makeText("MDNS_DEFAULT_MODE", "foreground-only/on-demand", "deployment-tunable", "[BRIAR] field lesson", "§11.1"),

  // spec App. D: RELAY_FRACTION_PLANNING
  makeList("RELAY_FRACTION_PLANNING", [0.1, 0.3], "ratio", "provisional", "[IROH], [LIBP2P-DCUTR] — external benchmark, not a HEARTH-specific sim", "§11.3"),

  // spec App. D: RELAY_BUDGET_BY_TIER
  makeUnset("RELAY_BUDGET_BY_TIER", "deployment-tunable", "none — capacity-planning knob, not a security parameter", "§11.4"),

  // spec App. D: STEWARD_TERM
  makeNumber("STEWARD_TERM", 180, "days", "deployment-tunable", "none", "§15.3"),

  // spec App. D: LINKAGE_INITIAL
  makeNumber("LINKAGE_INITIAL", 1.0, "ratio", "provisional", "none (added in review)", "§4.3"),

  // spec App. D: KIN_REPEAT_WINDOW
  makeNumber("KIN_REPEAT_WINDOW", 365, "epochs", "provisional", "none (added in review)", "§4.5"),

  // spec App. D: BRIDGE_PROOF_MAX_AGE
  makeNumber("BRIDGE_PROOF_MAX_AGE", 7, "epochs", "provisional", "none (added in review)", "§4.9"),

  // spec App. D: REP_SCALE
  makeNumber("REP_SCALE", 1_000_000, "scale", "provisional", "none (added in review)", "§5.1"),

  // spec App. D: MIN_STEWARDS
  makeNumber("MIN_STEWARDS", 3, "count", "provisional", "none (added in review)", "§15.3"),

  // spec App. D: CARETAKER_GRACE
  makeNumber("CARETAKER_GRACE", 7, "epochs", "provisional", "none (added in review)", "§15.3"),

  // spec App. D: OPINION_EPSILON
  makeNumber("OPINION_EPSILON", 0.01, "ratio", "provisional", "none (added in review)", "§9.4"),
];

export const PARAMS: Readonly<Record<string, Param>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((p) => [p.name, p])),
);

export function resolve(name: string): { value: number; unit: Unit } {
  const param = Object.hasOwn(PARAMS, name) ? PARAMS[name] : undefined;
  if (!param) throw new Error(`Unknown parameter: ${name}`);
  const value = param.value;
  switch (value.kind) {
    case "number":
      return { value: value.value, unit: value.unit };
    case "ref": {
      const target = resolve(value.ref);
      return { value: value.factor * target.value, unit: target.unit };
    }
    case "list":
    case "text":
    case "unset":
    case "retired":
      throw new Error(`Cannot resolve ${value.kind} parameter: ${name}`);
  }
}
