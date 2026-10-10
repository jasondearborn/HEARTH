# HEARTH — backlog

Worked one task per night by the unattended nightly session (runner: jasondearborn/scripts
`nightly/`). The runner merges `nightly/hearth-<date>` to main only when the gates pass and no
protected file changed.

## State
- 2026-10-09: spec v5 plus the S8 Ember-mechanics follow-up, pushed to origin. No implementation
  yet. Goal from here: a production-ready **TypeScript reference engine** in `engine/` whose math
  is verifiably faithful to the spec, while hardening the spec where implementing exposes gaps.
  The Embers game (private repo jasondearborn/embers) vendors this engine; its "Engine
  requests" list in `~/dev/embers/BACKLOG.md` feeds this queue.

- 2026-10-09 (nightly): **engine scaffold landed.** `engine/` (TS 5, ESM, Node 18+, `node:test`):
  `src/fixed.ts` (fixed-point primitives per new spec §13.6), `src/params.ts` (all 86 Appendix D
  names, status/evidence/section verbatim, reuses as references), `scripts/check-trace.mjs`
  (every `// spec §x`, `App. X`, `App. D: <name>` tag must exist in v5). `npm test` = tsc strict
  + unit tests + trace check. Spec: §13.6 reputation arithmetic added (λ = 992 328, half-even
  `mul`/`div`, left-fold `pow`, operand order, term-by-term evaluation).

- 2026-10-09 (nightly 2): **golden vectors + first slice of embers.ts.** `tools/export_vectors.py`
  (stdlib, seed 20261009) drives `hearth_v5_ember_sim.py` and writes `engine/vectors/ember.json`
  (decay, tier, 60 weight cases, 12 R_m histories incl. penalties and a clamp case; tolerances
  derived in the file). `src/embers.ts` (drafted by local Qwen first try, reviewed): `tierOf`,
  `tierMultiplier`, `proximityMultiplier`, `diminishingFactor`, `emberWeight` (§13.6 rule 5 fold),
  `decayedTerm`, `reputation` (term-by-term, penalties, clamp). Measured agreement: weight 4.8e-7
  (tol 2e-6), decay 0.064% (tol 0.1%), R_m 4.6e-6 abs. `tests/test_export_vectors.py` fails if
  the committed vectors go stale against the sim. Gates: Python 20/20, engine 40/40, trace 103 tags.

- 2026-10-09 (nightly 3): **pair counter `C` and budget overflow, spec then engine.** Spec §5.2.2
  "Counter evaluation (normative)": budget applied first, over-budget Embers neither weigh nor
  raise `c` (`[UNPROVEN]`, definitional); prior = `(epoch, sequence, record hash)` within the
  pair, same-epoch prior counts 1; `C = Σ pow(LAMBDA, Δepoch)` term by term. New **proved**
  per-relationship bound `R_pair ≤ K·log₂(1 + S)` (numerically tight to 0.994 over 1 500 random
  schedules; the "≈1 BASE_UNIT" figure is only the steady-schedule equilibrium). Self-issued
  Embers made invalid (v5 never forbade them; threat row 45). `src/ledger.ts`: `countedEmbers`,
  `checkpointWeights`, `memberReputation` (validates: one tribe per log, no Stranger issuers,
  one tier per issuer per epoch, hex hashes, no duplicates). Property tests: log-order
  independence (two Stewards agree), monotone decay, `0 ≤ C`, the log₂ bound, export allowlist
  (no aggregate API). Golden vectors: 623 per-Ember counters from S8's recurrence (6 intervals ×
  365 days; sim gained a no-op `trace` hook): max C rel err 1.0e-5 (tol 1e-3), weight 5.4e-7
  (tol 2.2e-5). Gates: Python 22/22, engine 58/58 in 4 s, trace 109 tags.

- 2026-10-10 (nightly 1): **explain + observer view (game request "per-observer reputation
  query").** `explainReputation(log, budgets, baseUnit, member, penalties, t)` in `ledger.ts`
  returns the §5.5.3 computation transcript: each counted Ember (record with its weight factors,
  `C`, weight, decayed value), each penalty decayed, `emberTotal`, `penaltyTotal`, and
  `reputation` (= `memberReputation`, property-tested over 10 seeded logs × 5 members, each term
  recomputed from its own factors). Doc comment: no per-observer score in §5; an observer's view
  is this function over the observer's own log, provisional until the checkpoint. New
  `src/index.ts` re-exports all modules (package `main`/`types` now resolve; tested). Gates:
  Python 22/22, engine 66/66, trace 113 tags.

## Next
1. **Game leftovers from "per-observer reputation query"** (embers `engine-shim.ts` stubs):
   `contributionCredit` = `BASE_UNIT`, which has no default in v5 (tribe policy, §5.2.1), so the
   game must pick and state one; `directPenalty` = `P_dir` (already in `params.ts`); `anchorStanding`
   = `ANCHOR_INITIAL_REPUTATION`. Likely only a short note to the game, plus an optional
   `excluded` list in `explainReputation` (over-budget and self-issued Embers to the member, with
   reason) so the game can show "why didn't that count".
2. **Spec: budget ordering across recipients.** §5.2 makes `sequence` per-recipient, but the
   overflow rule orders an issuer's whole epoch by `(sequence, record hash)`, so sequences from
   different recipients are compared. Deterministic (engine implements it as written), but
   meaningless as an order; consider an issuer-global sequence or `(record hash)` alone. Label it.
3. **membership.ts (§4):** vouching, admission, voucher stake and slash, probation, expulsion.
   Also the game's "vouch, admit and slash flow callable from a game tick".
4. **adjudication.ts (§6).**
5. **Spec: §9 rᵢ(T) derivation is undefined (high, §16 #14).** Define it so clients converge,
   back it with a sim, then **federation.ts (§9)** plus the Appendix B worked example as a test.
6. Spec hardening, high-severity open findings from HEARTH-v5-review.md, one per night:
   §10.2.1 partition semantics (#13); Noise pattern and PQ claims (#17); Sparks RSA-1 holder
   binding and budget time base (#15); Beacon StatusRecord signer field; Federation dispute
   defenses with no fields or slash rule; device-log freshness (#16).
7. Sim debt: heterogeneous tribes for S8; C.6/C.7 seeds, CIs and `[sim:]` labels.
8. Small spec cleanups found while transcribing App. D: `DISPUTE_ABUSE_THRESHOLD` and
   `THRESHOLD_ROOT_DEFAULT` are compound values written as prose (engine keeps them as text /
   list); `DORMANCY_MAX_DAYS`, `NULLIFIER_RETENTION_EPOCHS`, `VOUCH_INDEPENDENCE_HOPS` give no
   unit in the Default column; App. D says `δ` status "—" (engine maps it to `retired`). Give
   each a structured default, and make the App. D reuse references explicit (its own note).

## Decisions
- 2026-10-09: reference engine in TypeScript, so the browser game and future clients share one
  implementation. The Python sims stay as the independent cross-check (golden vectors).
- 2026-10-09: nightly work auto-merges to main through the runner's gate and protected-path
  guard. Frozen files and LICENSE are protected by the runner, not only by convention.
- 2026-10-09: **numeric policy = integer fixed point (bigint), not float64 with rounding
  points.** §5.1 already mandated fixed point at `REP_SCALE`; float `pow` differs across JS
  engines and platforms, integers don't. §13.6 closes what §5.1 left open (λ value, division,
  operand order, term-by-term evaluation so values replay from the log alone, §6.5). Cost:
  per-step drift (λ^90 = 0.500003), under 0.1% to two years; whether it ever matters at a tier
  boundary is `[UNPROVEN]`. Python sims stay float64; golden vectors compare within tolerance.
- 2026-10-09: engine devDeps are `typescript` plus `@types/node` (types only, no runtime code),
  needed to typecheck tests that import `node:test`. Runtime dependencies stay at zero.
- 2026-10-09: `params.ts` stores App. D reuses (`LINKAGE_HALF_LIFE`=`H`, `BEACON_RETRACT_PENALTY`
  =`P_dir`, …) as references, not copied literals, as App. D's consistency note asks; a test
  re-parses App. D on every run so spec edits that drift from the engine fail the gate.
- 2026-10-09: golden-vector tolerances are **derived from §13.6 error bounds and written in the
  vectors file**, never fitted to observed differences (weight: exact multiplier product, so only
  two roundings; decay: the stated <0.1% drift to 730 epochs; R_m: per-term sum of both). The
  exporter maps sim names to spec names (`Steward` → `Steward-eligible`, `hyperbolic` = current
  §5.2.2 rule). Penalty float terms are computed in the exporter because the sim has none.
- 2026-10-09 (nightly 3): over-budget Embers do **not** count toward `c`: §5.2.1 excludes them
  from aggregation and `c` is aggregation; otherwise a weightless record would change others'
  weights. Self-issued Embers are dropped (invalid, not an error) so one bad record cannot stop a
  Steward's whole checkpoint; malformed records (bad hash, mixed tribe, Stranger issuer) throw.
  Issuer tier and connectivity are inputs on each record (from the latest checkpoint, §4.2), not
  derived by the ledger, so the ledger never needs a running reputation state.
- 2026-10-09 (nightly 3): `pow(LAMBDA, k)` in the ledger is a memoised table of the same left
  fold (§13.6 rule 4 allows tables with identical results). The direct fold made the gate 6 min.
- 2026-10-09 (nightly 3): delegation record. Qwen (harness, 2 repairs, then opencode) ended
  blocked on ledger.ts (~200 lines, over the ~150-line slice guideline: should have been two
  tasks). The follow-up went to a Sonnet agent rather than a second Qwen round because Qwen's own
  loop had already spent its repairs, and the night's clock was short. Sonnet fixed it in 25 s.
- 2026-10-10: the game's "signed standing" is **not** added to the engine: §5.1 floors `R_m` at 0
  and there is no negative reputation in the spec. `explainReputation` exposes the unclamped
  `emberTotal − penaltyTotal`, documented as a display aid only; "Distrusted" stays game-side.
- 2026-10-10: delegation record. Qwen harness replies were malformed (2 format retries); opencode
  produced a correct patch in 124 s, but the gate reported exit 127 because the isolated
  worktree has no `engine/node_modules`. Next time use
  `--validation-cmd "npm --prefix engine ci && npm --prefix engine test"`. Patch reviewed and
  applied by hand with three tidy-ups.
- 2026-10-09: Strangers issuing an Ember is a `RangeError` in the engine (§5.2.1: budgets exist for
  Member+ only), not the sim's silent weight 0. The vectors exclude Stranger issuers.
