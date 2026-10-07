"""
HEARTH v5 spec SS5.2 "Ember issuance mechanics" -- pressure test.
(Review 2026-10-07, SS16 item 8.)

Three experiments on the Ember rule "weight = BASE_UNIT * tier * connection * proximity
* DELTA^floor(c)", where c is a per-(issuer, recipient) counter that decays like reputation:

  E1 Pair curve       long-run weight per day one issuer gives one recipient on a fixed
                      schedule (deterministic recurrence), for three diminishing variants
                      and two counter half-lives. Shows the cliff at interval ~ H.
  E2 Honest tribe     small-world tribe of 60, seeded, 2 simulated years; steady-member
                      reputation and tier mix per variant / interaction rate, plus a
                      BASE_UNIT calibration so a steady member sits near 1.0 (the spec's
                      design target, SS5.2.6).
  E3 Colluding pair   two members pump each other every day at full budget; the standing
                      one pair can mint per member, in BASE_UNITs.

Pure stdlib, seeded, deterministic. Relative comparisons are the signal, not absolute
numbers. Usage:  python3 hearth_v5_ember_sim.py [--smoke] [--out PATH]
"""
import argparse
import json
import math
import os
import random
import statistics as st
import sys
import time

# ============================================================================
# constants (spec SS5.2 / SS5.3)
# ============================================================================

H = 90                      # reputation half-life, days (spec SS5.3); one epoch = one day
LAM = 0.5 ** (1 / H)
DELTA = 0.5                 # per-pair diminishing base (spec SS5.2.2)
TIER_THRESHOLDS = [("Stranger", 0.0), ("Member", 0.10), ("Trusted", 0.40), ("Steward", 0.75)]
TIER_MULT = {"Member": 1.0, "Trusted": 1.5, "Steward": 2.0}
PROX_MULT = 1.0
REMOTE_MULT = 0.4
# B_E per epoch; the spec gives no default -> ASSUMED (recorded in results meta)
DEFAULT_BUDGETS = {"Member": 3, "Trusted": 5, "Steward": 8}
VARIANTS = ("floor", "smooth", "hyperbolic")
TIER_NAMES = [name for name, _ in TIER_THRESHOLDS]


# ============================================================================
# mechanics
# ============================================================================

def tier(r):
    t = "Stranger"
    for name, thr in TIER_THRESHOLDS:
        if r >= thr:
            t = name
    return t


def diminishing_factor(c, variant="floor", delta=DELTA):
    if variant == "floor":          # the spec rule
        return delta ** math.floor(c)
    if variant == "smooth":
        return delta ** c
    if variant == "hyperbolic":
        return 1.0 / (1.0 + c)
    raise ValueError("unknown diminishing variant: %r" % (variant,))


def counter_decay(half_life):
    return 0.5 ** (1 / half_life)


def ember_weight(base_unit, issuer_tier, conn_mult, proximity, c, variant="floor", delta=DELTA):
    if issuer_tier == "Stranger":
        return 0.0
    return (base_unit * TIER_MULT[issuer_tier] * conn_mult
            * (PROX_MULT if proximity else REMOTE_MULT)
            * diminishing_factor(c, variant, delta))


def pair_contribution_per_day(interval_days, variant="floor", counter_half_life=H, days=4000,
                              base_unit=1.0, issuer_tier="Member", proximity=True):
    """Mean weight/day one issuer gives one recipient, issuing every interval_days (2nd half)."""
    c = 0.0
    cl = counter_decay(counter_half_life)
    total = 0.0
    for d in range(days):
        c *= cl
        if d % interval_days == 0:
            w = ember_weight(base_unit, issuer_tier, 1.0, proximity, c, variant)
            c += 1.0
            if d >= days // 2:
                total += w
    return total / (days - days // 2)


# ============================================================================
# random helpers
# ============================================================================

def poisson(rng, mean):
    if mean <= 0:
        return 0
    if mean > 30:                   # normal approximation (Knuth underflows)
        return int(round(max(0, rng.gauss(mean, math.sqrt(mean)))))
    limit = math.exp(-mean)
    k = 0
    p = 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def small_world_contacts(rng, n, k, p_rewire=0.1):
    """Undirected Watts-Strogatz graph; returns sorted neighbour lists (symmetric)."""
    half = k // 2
    adj = [set() for _ in range(n)]
    for i in range(n):
        for j in range(1, half + 1):
            m = (i + j) % n
            if m != i:
                adj[i].add(m)
                adj[m].add(i)
    for j in range(1, half + 1):
        for i in range(n):
            m = (i + j) % n
            if m == i or m not in adj[i]:
                continue
            if rng.random() < p_rewire:
                choices = [x for x in range(n) if x != i and x not in adj[i]]
                if not choices:
                    continue
                new = rng.choice(choices)
                adj[i].discard(m)
                adj[m].discard(i)
                adj[i].add(new)
                adj[new].add(i)
    return [sorted(s) for s in adj]


# ============================================================================
# honest-tribe simulation
# ============================================================================

def run_tribe(seed, n=60, contacts=12, days=730, interaction_rate=1.0, variant="floor",
              counter_half_life=H, base_unit=1.0, budgets=None, p_proximity=0.3,
              init_rep=0.5, activity=None):
    rng = random.Random(seed)
    if budgets is None:
        budgets = DEFAULT_BUDGETS
    contacts_of = small_world_contacts(rng, n, contacts)
    if activity is None:
        activity = []
        for _ in range(n):
            u = rng.random()
            activity.append(0.9 if u < 0.5 else (0.5 if u < 0.8 else 0.15))   # steady/regular/intermittent
    reps = [init_rep] * n
    counter = {}                    # (issuer, recipient) -> decayed count
    cl = counter_decay(counter_half_life)
    max_issued = {}
    stranger_issued = 0

    for _day in range(days):
        # 1. decay reputation and pair counters
        reps = [r * LAM for r in reps]
        counter = {key: v * cl for key, v in counter.items() if v * cl >= 1e-9}
        # 2. start-of-epoch tier snapshot (checkpoint semantics)
        tiers = [tier(r) for r in reps]
        # 3. issuance
        inflow = [0.0] * n
        for i in range(n):
            ti = tiers[i]
            if ti == "Stranger":
                continue
            if rng.random() >= activity[i]:
                continue
            k = min(poisson(rng, interaction_rate), budgets[ti], len(contacts_of[i]))
            if k <= 0:
                continue
            recipients = rng.sample(contacts_of[i], k)
            for j in recipients:
                prox = rng.random() < p_proximity
                c = counter.get((i, j), 0.0)
                w = ember_weight(base_unit, ti, 1.0, prox, c, variant)
                if ti == "Stranger":            # check only; unreachable by construction
                    stranger_issued += 1
                inflow[j] += w
                counter[(i, j)] = c + 1.0
            if k > max_issued.get(ti, 0):
                max_issued[ti] = k
        # 4. apply inflow
        reps = [reps[j] + inflow[j] for j in range(n)]

    tier_counts = {name: 0 for name in TIER_NAMES}
    for r in reps:
        tier_counts[tier(r)] += 1
    return {
        "final_reps": reps,
        "activity": list(activity),
        "tier_counts": tier_counts,
        "max_issued_per_epoch": max_issued,
        "stranger_issued": stranger_issued,
        "contacts": contacts,
    }


def steady_stats(result):
    reps = result["final_reps"]
    act = result["activity"]
    steady = [r for r, a in zip(reps, act) if a >= 0.8]
    n = len(reps)
    counts = {name: 0 for name in TIER_NAMES}
    for r in reps:
        counts[tier(r)] += 1
    return {
        "median_steady": st.median(steady) if steady else 0.0,
        "frac_tiers": {name: counts[name] / n for name in TIER_NAMES},
    }


def calibrate_base_unit(seeds, target=1.0, iters=18, **run_kw):
    """Bisect log10(base_unit) in [-4, 2] so mean steady-member median rep ~ target."""
    lo, hi = -4.0, 2.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        b = 10 ** mid
        val = st.mean(steady_stats(run_tribe(s, base_unit=b, **run_kw))["median_steady"]
                      for s in seeds)
        if val < target:
            lo = mid
        else:
            hi = mid
    return 10 ** ((lo + hi) / 2)


# ============================================================================
# experiments
# ============================================================================

def _mean_stats(seeds, **kw):
    ms = []
    fr = {name: [] for name in TIER_NAMES}
    for s in seeds:
        ss = steady_stats(run_tribe(s, **kw))
        ms.append(ss["median_steady"])
        for name in TIER_NAMES:
            fr[name].append(ss["frac_tiers"][name])
    return st.mean(ms), {name: st.mean(v) for name, v in fr.items()}


def e1_pair_curve(smoke):
    variants = VARIANTS[:1] if smoke else VARIANTS
    chls = [90, 14][:1] if smoke else [90, 14]
    intervals = [1, 3, 7, 14, 30, 60, 89, 92, 120, 180]
    if smoke:
        intervals = intervals[:1]
    rows = []
    for variant in variants:
        for chl in chls:
            for iv in intervals:
                pd = pair_contribution_per_day(iv, variant, chl)
                rows.append({"variant": variant, "counter_half_life": chl, "interval_days": iv,
                             "per_day": pd, "equilibrium": pd / (1 - LAM)})
    return rows


def e2_honest_tribe(smoke, seeds):
    combos = [("floor", 90), ("floor", 14), ("smooth", 90), ("hyperbolic", 90)]
    rates = [0.25, 0.5, 1.0, 2.0]
    kw = dict(n=60, contacts=12, days=730)
    iters = 18
    if smoke:
        combos, rates = combos[:1], rates[:1]
        kw = dict(n=30, contacts=6, days=200)
        iters = 8
    rows = []
    for variant, chl in combos:
        for rate in rates:
            med, fr = _mean_stats(seeds, interaction_rate=rate, variant=variant,
                                  counter_half_life=chl, base_unit=1.0, **kw)
            rows.append({"variant": variant, "counter_half_life": chl, "interaction_rate": rate,
                         "median_steady_mean": med, "frac_tiers_mean": fr})
            print("  E2 %-10s chl=%-3d rate=%-4s base=1.0   median_steady=%.3f  tiers=%s"
                  % (variant, chl, rate, med, {k: round(v, 2) for k, v in fr.items()}))
        # calibration: the spec's design target is a steady member at ~1.0 (SS5.2.6)
        b = calibrate_base_unit(seeds[:3], target=1.0, iters=iters, variant=variant,
                                counter_half_life=chl, interaction_rate=1.0, **kw)
        med, fr = _mean_stats(seeds, interaction_rate=1.0, variant=variant,
                              counter_half_life=chl, base_unit=b, **kw)
        rows.append({"variant": variant, "counter_half_life": chl, "interaction_rate": 1.0,
                     "calibrated_base_unit": b, "median_steady_mean": med,
                     "frac_tiers_mean": fr})
        print("  E2 %-10s chl=%-3d rate=1.0  calibrated base=%.4f  median_steady=%.3f  tiers=%s"
              % (variant, chl, b, med, {k: round(v, 2) for k, v in fr.items()}))
    return rows


def collusion_per_day(variant, chl, issuer_tier, budget, days=4000):
    """Two members pump each other daily at full budget; mean weight/day per member (2nd half)."""
    c = 0.0
    cl = counter_decay(chl)
    total = 0.0
    for d in range(days):
        c *= cl
        for _ in range(budget):
            w = ember_weight(1.0, issuer_tier, 1.0, True, c, variant)
            c += 1.0
            if d >= days // 2:
                total += w
    return total / (days - days // 2)


def e3_colluding_pair(smoke):
    combos = [("floor", 90), ("floor", 14), ("smooth", 90), ("hyperbolic", 90)]
    tiers = ["Member", "Trusted", "Steward"]
    if smoke:
        combos, tiers = combos[:1], tiers[:1]
    rows = []
    for variant, chl in combos:
        for t in tiers:
            budget = DEFAULT_BUDGETS[t]
            pd = collusion_per_day(variant, chl, t, budget)
            rows.append({"variant": variant, "counter_half_life": chl, "issuer_tier": t,
                         "budget": budget, "per_day": pd, "equilibrium": pd / (1 - LAM)})
    return rows


def main(smoke=False, out_path=None):
    t0 = time.time()
    if out_path is None:
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "hearth_v5_ember_sim_results.json")
    seeds = [1, 2] if smoke else list(range(1, 11))
    results = {}

    print("E1 pair curve (equilibrium = long-run recipient rep one pair sustains, BASE_UNITs)")
    e1 = e1_pair_curve(smoke)
    for r in e1:
        print("  E1 %-10s chl=%-3d interval=%-4d per_day=%.6f  equilibrium=%.4f"
              % (r["variant"], r["counter_half_life"], r["interval_days"], r["per_day"],
                 r["equilibrium"]))

    print("E2 honest tribe (seeds %s)" % seeds)
    e2 = e2_honest_tribe(smoke, seeds)

    print("E3 colluding pair (standing one pair can mint per member, BASE_UNITs)")
    e3 = e3_colluding_pair(smoke)
    for r in e3:
        print("  E3 %-10s chl=%-3d %-8s budget=%d per_day=%.4f  equilibrium=%.3f"
              % (r["variant"], r["counter_half_life"], r["issuer_tier"], r["budget"],
                 r["per_day"], r["equilibrium"]))

    results["meta"] = {
        "seeds": seeds,
        "smoke": bool(smoke),
        "assumed": {
            "DEFAULT_BUDGETS": DEFAULT_BUDGETS,
            "init_rep": 0.5,
            "p_proximity": 0.3,
            "activity_mix": "50% 0.9 / 30% 0.5 / 20% 0.15",
        },
        "spec": "HEARTH v5 §5.2, review 2026-10-07",
        "python": sys.version.split()[0],
        "runtime_s": 0.0,
    }
    results["E1_pair_curve"] = e1
    results["E2_honest_tribe"] = e2
    results["E3_colluding_pair"] = e3
    results["meta"]["runtime_s"] = time.time() - t0
    with open(out_path, "w") as fh:
        json.dump(results, fh, indent=2)
    print("wrote %s (%.1f s)" % (out_path, results["meta"]["runtime_s"]))
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="HEARTH v5 SS5.2 Ember issuance simulation")
    ap.add_argument("--smoke", action="store_true", help="tiny fast run (<20 s)")
    ap.add_argument("--out", default=None, help="results JSON path")
    args = ap.parse_args()
    main(smoke=args.smoke, out_path=args.out)
