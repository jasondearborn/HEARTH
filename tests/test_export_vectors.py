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


if __name__ == "__main__":
    unittest.main()
