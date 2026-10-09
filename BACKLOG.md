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

## Next
1. **engine scaffold + params.** `engine/` package (TypeScript 5, `node:test`, devDeps
   `typescript` only, ESM, Node 18+). `src/params.ts` transcribes Appendix D (each constant
   tagged `// spec App. D: <name>` with its evidence status). Add `scripts/check-trace.mjs`:
   every `// spec §x.y` tag must name a heading that exists in the v5 spec; wire it into
   `npm test`. **Decide and record the numeric policy** (float64 with defined rounding points vs
   fixed-point) as a conformance note in §13, with its rationale.
2. **Golden vectors.** `tools/export_vectors.py` (stdlib) drives the existing sim functions
   (`hearth_v5_ember_sim.py` first) with fixed seeds and writes `engine/vectors/*.json`. The TS
   tests must reproduce them within a stated tolerance. Two independent implementations must
   agree.
3. **embers.ts (§5):** Ember accrual, decay, the 1/(1+c) per-pair diminishing rule (§5.2.2),
   bounds. Property tests: monotone decay, bounded scores, no global score reachable via the API.
   Also serves the game's "per-observer reputation query" request.
4. **membership.ts (§4):** vouching, admission, voucher stake and slash, probation, expulsion.
5. **adjudication.ts (§6).**
6. **Spec: §9 rᵢ(T) derivation is undefined (high, §16 #14).** Define it so clients converge,
   back it with a sim, then **federation.ts (§9)** plus the Appendix B worked example as a test.
7. Spec hardening, high-severity open findings from HEARTH-v5-review.md, one per night:
   §10.2.1 partition semantics (#13); Noise pattern and PQ claims (#17); Sparks RSA-1 holder
   binding and budget time base (#15); Beacon StatusRecord signer field; Federation dispute
   defenses with no fields or slash rule; device-log freshness (#16).
8. Sim debt: heterogeneous tribes for S8; C.6/C.7 seeds, CIs and `[sim:]` labels.

## Decisions
- 2026-10-09: reference engine in TypeScript, so the browser game and future clients share one
  implementation. The Python sims stay as the independent cross-check (golden vectors).
- 2026-10-09: nightly work auto-merges to main through the runner's gate and protected-path
  guard. Frozen files and LICENSE are protected by the runner, not only by convention.
