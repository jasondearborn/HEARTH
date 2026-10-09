"""Golden vectors (tools/export_vectors.py) are deterministic and the committed copy is current.

If hearth_v5_ember_sim.py changes, regenerate: python3 tools/export_vectors.py
"""
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import export_vectors as X  # noqa: E402


class GoldenVectors(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(X.render(X.build()), X.render(X.build()))

    def test_committed_copy_is_current(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "ember.json")
            X.main(out)
            with open(out) as f:
                fresh = f.read()
        with open(X.DEFAULT_OUT) as f:
            committed = f.read()
        self.assertEqual(fresh, committed, "engine/vectors/ember.json is stale; re-run "
                                           "python3 tools/export_vectors.py")

    def test_covers_every_section(self):
        d = X.build()
        self.assertGreaterEqual(len(d["weight"]), 50)
        self.assertGreaterEqual(len(d["reputation"]), 10)
        self.assertTrue(any(r["penalties"] for r in d["reputation"]))
        self.assertTrue(any(r["expected"] == 0.0 for r in d["reputation"]), "clamp case")
        self.assertTrue(all(w["issuer_tier"] != "Stranger" for w in d["weight"]))
        tiers = {v["expected"] for v in d["tier"]}
        self.assertEqual(tiers, {"Stranger", "Member", "Trusted", "Steward-eligible"})

    def test_counter_vectors(self):
        """§5.2.2 pair counter, replayed from the sim's pair_contribution_per_day recurrence."""
        d = X.build()
        tol = d["meta"]["tolerance"]
        self.assertIn("counter_rel", tol)
        self.assertIn("counter_weight_abs", tol)
        sched = {s["interval_days"]: s for s in d["counter"]}
        self.assertTrue({1, 7, 89, 92} <= set(sched))
        for iv, s in sched.items():
            es = s["embers"]
            self.assertGreaterEqual(len(es), 2, iv)
            self.assertEqual(es[0]["c"], 0.0)
            self.assertEqual([e["epoch"] for e in es], list(range(0, s["days"], iv)))
            self.assertTrue(all(e["epoch"] <= X.MAX_GAP for e in es))
            self.assertTrue(all(abs(e["weight"] - float(X.BASE_UNIT) / (1 + e["c"])) < 1e-12
                                for e in es), iv)
        # daily issuance approaches the equilibrium counter λ/(1−λ) ≈ 129
        self.assertGreater(sched[1]["embers"][-1]["c"], 100)

    def test_sim_trace_matches_mean(self):
        """The trace hook does not change what pair_contribution_per_day returns."""
        E = X.E
        trace = []
        a = E.pair_contribution_per_day(7, "hyperbolic", days=400, trace=trace)
        b = E.pair_contribution_per_day(7, "hyperbolic", days=400)
        self.assertEqual(a, b)
        self.assertEqual([t[0] for t in trace], list(range(0, 400, 7)))


if __name__ == "__main__":
    unittest.main()
