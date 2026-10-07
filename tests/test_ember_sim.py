"""Trust-anchor tests for hearth_v5_ember_sim.py (spec §5.2 Ember issuance mechanics).

Written before the implementation (2026-10-07 review follow-up, §16 item 8). Stdlib only.
Run: python3 -m unittest -q tests.test_ember_sim
"""
import json
import math
import os
import random
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import hearth_v5_ember_sim as E  # noqa: E402


class Constants(unittest.TestCase):
    def test_spec_defaults(self):
        self.assertEqual(E.H, 90)
        self.assertAlmostEqual(E.LAM, 0.5 ** (1 / 90), places=12)
        self.assertEqual(E.DELTA, 0.5)
        self.assertEqual(E.TIER_MULT, {"Member": 1.0, "Trusted": 1.5, "Steward": 2.0})
        self.assertEqual(E.PROX_MULT, 1.0)
        self.assertEqual(E.REMOTE_MULT, 0.4)
        for t in ("Member", "Trusted", "Steward"):
            self.assertIn(t, E.DEFAULT_BUDGETS)
            self.assertGreaterEqual(E.DEFAULT_BUDGETS[t], 1)

    def test_tier_boundaries(self):
        self.assertEqual(E.tier(0.0), "Stranger")
        self.assertEqual(E.tier(0.0999), "Stranger")
        self.assertEqual(E.tier(0.10), "Member")
        self.assertEqual(E.tier(0.3999), "Member")
        self.assertEqual(E.tier(0.40), "Trusted")
        self.assertEqual(E.tier(0.7499), "Trusted")
        self.assertEqual(E.tier(0.75), "Steward")
        self.assertEqual(E.tier(5.0), "Steward")


class Diminishing(unittest.TestCase):
    def test_floor_variant_is_spec_rule(self):
        f = E.diminishing_factor
        self.assertEqual(f(0.0), 1.0)
        self.assertEqual(f(0.99), 1.0)
        self.assertEqual(f(1.0), 0.5)
        self.assertEqual(f(2.7), 0.25)
        self.assertEqual(f(2.7, variant="floor"), 0.25)

    def test_other_variants(self):
        f = E.diminishing_factor
        self.assertAlmostEqual(f(2.7, variant="smooth"), 0.5 ** 2.7, places=12)
        self.assertAlmostEqual(f(3.0, variant="hyperbolic"), 0.25, places=12)
        with self.assertRaises(ValueError):
            f(1.0, variant="nope")

    def test_counter_decay(self):
        self.assertAlmostEqual(E.counter_decay(90), E.LAM, places=12)
        self.assertAlmostEqual(E.counter_decay(14) ** 14, 0.5, places=12)


class Weight(unittest.TestCase):
    def test_composition(self):
        self.assertAlmostEqual(E.ember_weight(1.0, "Trusted", 1.0, True, 0.0), 1.5, places=12)
        # 2.0 base * Member 1.0 * conn 0.5 * remote 0.4 * floor(1.2)=1 -> 0.5
        self.assertAlmostEqual(E.ember_weight(2.0, "Member", 0.5, False, 1.2), 0.2, places=12)
        self.assertAlmostEqual(
            E.ember_weight(1.0, "Steward", 1.0, True, 3.0, variant="hyperbolic"), 0.5, places=12)

    def test_stranger_issues_nothing(self):
        self.assertEqual(E.ember_weight(1.0, "Stranger", 1.0, True, 0.0), 0.0)


class PairContribution(unittest.TestCase):
    """Long-run weight per day one issuer gives one recipient on a fixed schedule."""

    def test_quarterly_beats_monthly_beats_weekly_under_spec_rule(self):
        p = E.pair_contribution_per_day
        q120 = p(120)
        m30 = p(30)
        w7 = p(7)
        self.assertAlmostEqual(q120, 1 / 120, delta=0.06 / 120)       # c* ~ 0.66 -> factor 1
        self.assertAlmostEqual(m30, 0.125 / 30, delta=0.06 * 0.125 / 30)  # c* ~ 3.85 -> 0.5^3
        self.assertLess(w7, 1e-4)                                        # c* ~ 17.9 -> ~0

    def test_cliff_at_one_half_life(self):
        # c* = lam^k/(1-lam^k) crosses 1.0 at k = H (90 d): 92 d keeps factor 1, 89 d drops to 0.5
        self.assertGreater(E.pair_contribution_per_day(92), 1.7 * E.pair_contribution_per_day(89))

    def test_short_counter_half_life(self):
        # counter half-life 14 d, weekly issuance: c* = 0.707/0.293 ~ 2.41 -> 0.5^2
        v = E.pair_contribution_per_day(7, counter_half_life=14)
        self.assertAlmostEqual(v, 0.25 / 7, delta=0.06 * 0.25 / 7)

    def test_deterministic(self):
        self.assertEqual(E.pair_contribution_per_day(30), E.pair_contribution_per_day(30))


class Poisson(unittest.TestCase):
    def test_mean(self):
        rng = random.Random(7)
        xs = [E.poisson(rng, 2.0) for _ in range(20000)]
        self.assertAlmostEqual(sum(xs) / len(xs), 2.0, delta=0.05)
        self.assertTrue(all(isinstance(x, int) and x >= 0 for x in xs))
        self.assertEqual(E.poisson(random.Random(1), 0.0), 0)


class Tribe(unittest.TestCase):
    KW = dict(n=30, contacts=6, days=120, interaction_rate=1.0)

    def test_deterministic_by_seed(self):
        a = E.run_tribe(seed=11, **self.KW)
        b = E.run_tribe(seed=11, **self.KW)
        c = E.run_tribe(seed=12, **self.KW)
        self.assertEqual(a["final_reps"], b["final_reps"])
        self.assertNotEqual(a["final_reps"], c["final_reps"])

    def test_invariants(self):
        r = E.run_tribe(seed=3, **self.KW)
        self.assertEqual(len(r["final_reps"]), 30)
        self.assertEqual(len(r["activity"]), 30)
        self.assertTrue(all(x >= 0 for x in r["final_reps"]))
        self.assertEqual(r["stranger_issued"], 0)
        for t, mx in r["max_issued_per_epoch"].items():
            self.assertLessEqual(mx, E.DEFAULT_BUDGETS[t])
        self.assertEqual(sum(r["tier_counts"].values()), 30)

    def test_no_interaction_means_pure_decay(self):
        r = E.run_tribe(seed=5, n=10, contacts=4, days=90, interaction_rate=0.0, init_rep=0.5)
        for x in r["final_reps"]:
            self.assertAlmostEqual(x, 0.5 * E.LAM ** 90, places=9)

    def test_budget_override_respected(self):
        budgets = {"Member": 1, "Trusted": 1, "Steward": 1}
        r = E.run_tribe(seed=9, n=20, contacts=8, days=60, interaction_rate=5.0, budgets=budgets)
        for mx in r["max_issued_per_epoch"].values():
            self.assertLessEqual(mx, 1)


class Results(unittest.TestCase):
    def test_smoke_main_writes_results(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "res.json")
            E.main(smoke=True, out_path=out)
            with open(out) as fh:
                res = json.load(fh)
        for k in ("meta", "E1_pair_curve", "E2_honest_tribe", "E3_colluding_pair"):
            self.assertIn(k, res)
        self.assertIn("seeds", res["meta"])
        self.assertTrue(res["meta"]["smoke"])
        self.assertTrue(len(res["E1_pair_curve"]) > 0)
        self.assertTrue(len(res["E2_honest_tribe"]) > 0)
        self.assertTrue(len(res["E3_colluding_pair"]) > 0)


if __name__ == "__main__":
    unittest.main()
