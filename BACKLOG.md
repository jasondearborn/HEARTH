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

## Next
1. **Golden vectors.** `tools/export_vectors.py` (stdlib) drives the existing sim functions
   (`hearth_v5_ember_sim.py` first) with fixed seeds and writes `engine/vectors/*.json`. The TS
   tests must reproduce them within a stated tolerance. Two independent implementations must
   agree.
2. **embers.ts (§5):** Ember accrual, decay, the 1/(1+c) per-pair diminishing rule (§5.2.2),
   bounds. Property tests: monotone decay, bounded scores, no global score reachable via the API.
   Also serves the game's "per-observer reputation query" request. Build on `fixed.ts`
   (§13.6 rules 4–6: left-fold `pow`, left-to-right weight product, term-by-term `R_m`).
   **Open questions to settle in the spec first:** (a) §5.2.2 "prior Embers" — ordered how
   within one epoch (by `(sequence, record hash)` as in budget overflow?), and do over-budget
   Embers count toward `c`? (b) `c` itself in fixed point: `Σ pow(LAMBDA, t − epoch(prior))`?
   (c) §5.1 `R_m` is one tribe-scoped checkpoint value, not per-observer; the game's
   "observer's view" maps to the observer's provisional local recomputation (§5.1, §5.5.2) or to
   the §9 composite. Say which in the API docs; don't invent a per-observer score in §5.
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
