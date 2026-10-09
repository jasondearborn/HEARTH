"""
Golden-vector exporter: drives hearth_v5_ember_sim.py (float64, non-normative) and writes
engine/vectors/ember.json, which the TypeScript reference engine (fixed point, spec §13.6)
must reproduce within the tolerances stated in the file. Two independent implementations
agreeing is the evidence; neither is tuned to the other.

Pure stdlib, seeded, deterministic: re-running writes a byte-identical file
(tests/test_export_vectors.py enforces this against the committed copy).

Usage:  python3 tools/export_vectors.py [--out PATH]
"""
import argparse
import hashlib
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import hearth_v5_ember_sim as E  # noqa: E402

SEED = 20261009
DEFAULT_OUT = os.path.join(ROOT, "engine", "vectors", "ember.json")
SIM_FILE = "hearth_v5_ember_sim.py"
VARIANT = "hyperbolic"          # the sim's name for the current §5.2.2 rule 1/(1+c)
BASE_UNIT = "0.08"              # App. D reference value
SPEC_TIER = {"Stranger": "Stranger", "Member": "Member", "Trusted": "Trusted",
             "Steward": "Steward-eligible"}
ISSUER_TIERS = ("Member", "Trusted", "Steward")     # Strangers cannot issue (§5.2.1)
CONNECTIVITY = ("1.0", "0.75", "0.5", "0.25")
MAX_GAP = 730                   # decay gaps covered by the stated tolerance (§13.6 rationale)

# Tolerances. Weight: the multiplier product is exact in fixed point (all factors have
# <= 6 decimals combined), so only the diminishing-factor div and the final mul round:
# <= 0.5e-6 + 2.4 * 0.5e-6 < 2e-6. Decay: pow(LAMBDA, k) drifts from exact 0.5^(k/90) by
# under 0.1% for k <= 730 (§13.6 rationale). Reputation: each term carries the weight error
# plus the decay drift plus one mul rounding.
TOLERANCE = {
    "weight_abs": 2e-6,
    "decay_rel": 1e-3,
    "reputation": "abs(ts - py) <= sum over terms of (decay_rel * |term| + weight_abs + 1e-6)",
}


def dec(x):
    """A float rendered as an exact 6-decimal string (REP_SCALE resolution, §13.6 rule 3)."""
    return "%.6f" % x


def weight_inputs(rng):
    return {
        "issuer_tier": rng.choice(ISSUER_TIERS),
        "connectivity": rng.choice(CONNECTIVITY),
        "context": rng.choice(("proximity", "remote")),
        "c": dec(rng.uniform(0, 5) if rng.random() < 0.8 else 0.0),
    }


def py_weight(w):
    return E.ember_weight(float(BASE_UNIT), w["issuer_tier"], float(w["connectivity"]),
                          w["context"] == "proximity", float(w["c"]), VARIANT)


def spec_inputs(w):
    return dict(w, issuer_tier=SPEC_TIER[w["issuer_tier"]])


def decay_vectors():
    ks = [0, 1, 2, 7, 14, 30, 45, 89, 90, 91, 180, 270, 365, 500, 730]
    return [{"k": k, "expected": E.LAM ** k} for k in ks]


def tier_vectors():
    rs = ["0", "0.000001", "0.099999", "0.1", "0.100001", "0.25", "0.399999", "0.4",
          "0.749999", "0.75", "0.750001", "1", "5"]
    return [{"r": r, "expected": SPEC_TIER[E.tier(float(r))]} for r in rs]


def weight_vectors(rng, n=60):
    out = []
    for _ in range(n):
        w = weight_inputs(rng)
        out.append(dict(spec_inputs(w), expected=py_weight(w)))
    return out


def reputation_vectors(rng, n=12):
    out = []
    for i in range(n):
        t = rng.randint(MAX_GAP // 2, MAX_GAP)
        embers = []
        for _ in range(rng.randint(1, 40)):
            w = weight_inputs(rng)
            e = dict(spec_inputs(w), epoch=rng.randint(0, t))
            e["_py"] = py_weight(w) * E.LAM ** (t - e["epoch"])
            embers.append(e)
        penalties = []
        # every third case carries penalties; one case is driven below zero to test the clamp
        if i % 3 == 2:
            for _ in range(rng.randint(1, 3)):
                p = {"amount": dec(rng.uniform(0.01, 0.5) if i != n - 1 else 50.0),
                     "epoch": rng.randint(0, t)}
                p["_py"] = float(p["amount"]) * E.LAM ** (t - p["epoch"])
                penalties.append(p)
        raw = sum(e.pop("_py") for e in embers) - sum(p.pop("_py") for p in penalties)
        out.append({"t": t, "embers": embers, "penalties": penalties,
                    "expected": max(0.0, raw)})
    return out


def build():
    rng = random.Random(SEED)
    with open(os.path.join(ROOT, SIM_FILE), "rb") as f:
        sim_sha = hashlib.sha256(f.read()).hexdigest()
    return {
        "meta": {
            "generator": "tools/export_vectors.py",
            "source": SIM_FILE,
            "source_sha256": sim_sha,
            "seed": SEED,
            "spec": "HEARTH-protocol-spec-v5.md §5.1, §5.2, §5.3, §4.2, §13.6",
            "variant": VARIANT,
            "base_unit": BASE_UNIT,
            "units": "decimal quantities as strings (exact at REP_SCALE); expected values float64",
            "penalties": "amount is positive and subtracted (§5.1 penalty term); the sim has no "
                         "penalties, so their float terms are computed here with the sim's LAM",
            "tolerance": TOLERANCE,
        },
        "decay": decay_vectors(),
        "tier": tier_vectors(),
        "weight": weight_vectors(rng),
        "reputation": reputation_vectors(rng),
    }


def render(data):
    return json.dumps(data, indent=1, sort_keys=True) + "\n"


def main(out_path=DEFAULT_OUT):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        f.write(render(build()))
    print("wrote %s" % out_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Export HEARTH engine golden vectors")
    ap.add_argument("--out", default=DEFAULT_OUT)
    main(ap.parse_args().out)
