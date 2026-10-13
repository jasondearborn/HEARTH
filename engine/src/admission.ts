// spec §4.3, §4.5 — admission check: count, tier, budget, independence, escalations
import { fromDecimal, mul } from "./fixed.js";
import { resolve } from "./params.js";
import {
  admittingSet,
  buildVouchGraph,
  hopIndependent,
  independent,
  independenceHops,
  kinProbationEpochs,
  kinStakeMult,
} from "./independence.js";
import type { Tier } from "./embers.js";
import type { VouchEdge } from "./penalty.js";

const fx = (name: string): bigint => fromDecimal(String(resolve(name).value));

// spec §2.4 — rolling W-epoch window ending at t: epochs e with t − W < e ≤ t.
function inWindow(e: number, t: number, w: number): boolean {
  return t - w < e && e <= t;
}

export interface AdmissionInput {
  vouchee: string;
  epoch: number; // admission epoch
  vouches: readonly { voucher: string; epoch: number }[]; // record order
  graphEdges: readonly VouchEdge[]; // accepted vouch graph, current checkpoint
  tiers: ReadonlyMap<string, Tier>; // latest checkpoint tiers (§4.2)
  suspended: ReadonlySet<string>; // may not vouch now: dormant, kin or re-entry probation
  priorVouches: readonly { voucher: string; epoch: number }[]; // vouches in accepted AdmissionRecords
  priorKinAdmissions: readonly { epoch: number; vouchers: readonly string[] }[]; // accepted kin-admissions
}

export type AdmissionPath = "independent" | "third-voucher" | "kin";

export interface AdmissionFailure {
  reason: string;
  voucher?: string;
}

export interface AdmissionResult {
  accepted: boolean;
  path: AdmissionPath | null;
  failures: AdmissionFailure[];
  linkageWeights: bigint[];
  probationEpochs: number;
}

/**
 * Steward-relay check of one AdmissionRecord against current-checkpoint state:
 * every failure (record-level, then per vouch in list order, then the kin
 * neighborhood bound), the admission path, and the resulting linkage weights
 * and probation. Out of scope here: the §4.4/§4.6 admission floor (combined
 * discounted weight) — the spec never defines its value (open question, §16),
 * so this module implements no floor; §4.4 proximity-challenge timestamps;
 * §4.9 bridge attestations.
 */
export function checkAdmission(input: AdmissionInput): AdmissionResult {
  const failures: AdmissionFailure[] = [];

  // 1. record-level failures, in this order: count, duplicates, self-vouch (§4.3).
  const tooFew = input.vouches.length < 2;
  if (tooFew) {
    failures.push({ reason: "too-few-vouchers" });
  }
  const seen = new Set<string>();
  const dupReported = new Set<string>();
  for (const v of input.vouches) {
    if (seen.has(v.voucher)) {
      if (!dupReported.has(v.voucher)) {
        dupReported.add(v.voucher);
        failures.push({ reason: "duplicate-voucher", voucher: v.voucher });
      }
    } else {
      seen.add(v.voucher);
    }
  }
  const selfReported = new Set<string>();
  for (const v of input.vouches) {
    if (v.voucher === input.vouchee && !selfReported.has(v.voucher)) {
      selfReported.add(v.voucher);
      failures.push({ reason: "self-vouch", voucher: v.voucher });
    }
  }

  // 2. per vouch, in list order: tier (§4.2), suspension, budget (§4.3).
  const bVouch = resolve("B_VOUCH").value;
  const vouchWindow = resolve("VOUCH_WINDOW").value;
  for (const v of input.vouches) {
    const tier = input.tiers.get(v.voucher);
    if (tier === undefined || tier === "Stranger") {
      failures.push({ reason: "voucher-tier", voucher: v.voucher });
    }
    if (input.suspended.has(v.voucher)) {
      failures.push({ reason: "voucher-suspended", voucher: v.voucher });
    }
    // budget: prior vouches by this voucher in the rolling window ending at
    // this vouch's epoch, plus 1 for this vouch (§4.3 issuance budget).
    const issued =
      input.priorVouches.filter(
        (p) => p.voucher === v.voucher && inWindow(p.epoch, v.epoch, vouchWindow),
      ).length + 1;
    if (issued > bVouch) {
      failures.push({ reason: "budget", voucher: v.voucher });
    }
  }

  // 3. path (§4.5): pair check, then escalation 1, else kin. Skipped (path
  // stays null) when the record has fewer than 2 vouches.
  let path: AdmissionPath | null = null;
  if (!tooFew) {
    const graph = buildVouchGraph(input.graphEdges);
    const h = independenceHops();
    const v1 = input.vouches[0]!.voucher;
    const v2 = input.vouches[1]!.voucher;
    const pairOk = independent(
      graph,
      v1,
      v2,
      h,
      admittingSet(input.graphEdges, v1),
      admittingSet(input.graphEdges, v2),
    );
    if (pairOk) {
      path = "independent";
    } else if (
      input.vouches.slice(2).some(
        (v) =>
          hopIndependent(graph, v.voucher, v1, h) &&
          hopIndependent(graph, v.voucher, v2, h),
      )
    ) {
      path = "third-voucher";
    } else {
      path = "kin";
      // 4. kin only: neighborhood rate bound (§4.5). Reject if any
      // kin-admission accepted in the rolling KIN_NEIGHBORHOOD_WINDOW ending
      // at the admission epoch had a voucher within h hops of V₁ or V₂.
      const neighborhoodWindow = resolve("KIN_NEIGHBORHOOD_WINDOW").value;
      const tooNear = input.priorKinAdmissions.some(
        (ka) =>
          inWindow(ka.epoch, input.epoch, neighborhoodWindow) &&
          ka.vouchers.some(
            (x) =>
              !hopIndependent(graph, x, v1, h) ||
              !hopIndependent(graph, x, v2, h),
          ),
      );
      if (tooNear) {
        failures.push({ reason: "neighborhood" });
      }
    }
  }

  // 5. verdict (§4.3): accepted iff no failures; kin carries KIN_PROBATION.
  const accepted = failures.length === 0;
  const probationEpochs = path === "kin" ? kinProbationEpochs() : 0;

  // 6. linkage weights (§4.3, §4.5 escalation 2(ii)), only for an accepted
  // record: LINKAGE_INITIAL per vouch; on a kin path V₁ and V₂ get
  // LINKAGE_INITIAL × kinStakeMult(r + 1), r = prior kin-admissions by the
  // same unordered pair in the rolling KIN_REPEAT_WINDOW ending at the
  // admission epoch. 1.5×, then 2.25×.
  let linkageWeights: bigint[] = [];
  if (accepted) {
    const initial = fx("LINKAGE_INITIAL");
    if (path === "kin") {
      const v1 = input.vouches[0]!.voucher;
      const v2 = input.vouches[1]!.voucher;
      const repeatWindow = resolve("KIN_REPEAT_WINDOW").value;
      const r = input.priorKinAdmissions.filter(
        (ka) =>
          inWindow(ka.epoch, input.epoch, repeatWindow) &&
          ka.vouchers.length >= 2 &&
          ((ka.vouchers[0] === v1 && ka.vouchers[1] === v2) ||
            (ka.vouchers[0] === v2 && ka.vouchers[1] === v1)),
      ).length;
      const kinWeight = mul(initial, kinStakeMult(r + 1));
      linkageWeights = input.vouches.map((_, i) => (i < 2 ? kinWeight : initial));
    } else {
      linkageWeights = input.vouches.map(() => initial);
    }
  }

  return { accepted, path, failures, linkageWeights, probationEpochs };
}
