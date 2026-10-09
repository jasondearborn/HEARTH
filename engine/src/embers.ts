// spec §5.1, §5.2, §4.2, §13.6 — Ember weight, decay and reputation
import { REP_SCALE, LAMBDA, mul, div, pow, fromDecimal } from "./fixed.js";
import { resolve } from "./params.js";

const fx = (name: string): bigint => fromDecimal(String(resolve(name).value));

export type Tier = "Stranger" | "Member" | "Trusted" | "Steward-eligible";
export type Context = "proximity" | "remote";
export interface WeightInputs {
  baseUnit: bigint;
  issuerTier: Tier;
  connectivity: bigint;
  context: Context;
  C: bigint;
}
export interface Term {
  weight: bigint;
  epoch: number;
}

// spec §4.2
export function tierOf(r: bigint): Tier {
  if (r >= fx("TIER_STEWARD_ELIGIBLE")) return "Steward-eligible";
  if (r >= fx("TIER_TRUSTED")) return "Trusted";
  if (r >= fx("TIER_MEMBER")) return "Member";
  return "Stranger";
}

// spec §5.2.3, §5.2.1
export function tierMultiplier(t: Tier): bigint {
  switch (t) {
    case "Member":
      return fx("tier_multiplier(Member)");
    case "Trusted":
      return fx("tier_multiplier(Trusted)");
    case "Steward-eligible":
      return fx("tier_multiplier(Steward-eligible)");
    case "Stranger":
      throw new RangeError("Strangers cannot issue Embers");
  }
}

// spec §5.2.4
export function proximityMultiplier(c: Context): bigint {
  return c === "proximity"
    ? fx("PROXIMITY_MULTIPLIER")
    : fx("REMOTE_MULTIPLIER");
}

// spec §5.2.2, §13.6
export function diminishingFactor(C: bigint): bigint {
  if (C < 0n) throw new RangeError("C must be non-negative");
  return div(REP_SCALE, REP_SCALE + C);
}

// spec §5.2, §13.6
export function emberWeight(x: WeightInputs): bigint {
  return mul(
    mul(
      mul(mul(x.baseUnit, tierMultiplier(x.issuerTier)), x.connectivity),
      proximityMultiplier(x.context),
    ),
    diminishingFactor(x.C),
  );
}

// spec §5.1, §5.3
export function decayedTerm(weight: bigint, epoch: number, t: number): bigint {
  if (epoch > t) throw new RangeError("epoch must not exceed t");
  return mul(weight, pow(LAMBDA, t - epoch));
}

// spec §5.1, §13.6 rule 6
export function reputation(
  embers: readonly Term[],
  penalties: readonly Term[],
  t: number,
): bigint {
  let total = 0n;
  for (const e of embers) total += decayedTerm(e.weight, e.epoch, t);
  for (const p of penalties) total -= decayedTerm(p.weight, p.epoch, t);
  return total < 0n ? 0n : total;
}
