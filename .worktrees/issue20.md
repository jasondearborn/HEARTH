🧠 Claude: engine slice for member standing at an epoch (part of the Embers request "vouch, admit and slash flow"). Ready for a worker.

## Goal
Add `engine/src/standing.ts`: `standingAt(history, t)` reports whether a member is dormant, in re-entry probation, in kin-admission probation, or revoked at epoch `t`; `isSuspended(standing)` says whether any of those applies (cannot vouch, does not count toward N or as a distinct complainant).

## Spec
`HEARTH-protocol-spec-v5.md` §4.10 "Dormancy rules" (including the new "Probation windows (normative, added 2026-10-13)" bullet), §4.5 escalation 2 (kin-admission probation), §6.3 "Definition of N". The new bullet is on the director's nightly branch and may not be on `main` yet; its content is restated here and is binding:
- A dormancy period covers epochs `start ≤ e < end` (half-open).
- Re-entry probation after a period ending at `end` covers `end ≤ e < end + DORMANCY_PROBATION` (14).
- Kin-admission probation covers `a ≤ e < a + KIN_PROBATION` (45) for a kin-admission at epoch `a`.
- Revoked from `revokedAt` onward, permanently (`revokedAt ≤ t`).
- The four flags are independent; any one of them suspends.

```ts
export interface MemberHistory {
  dormancy: readonly { start: number; end: number }[]; // accepted dormancy periods, any order
  kinAdmittedAt: number | null;                         // epoch of this member's kin-admission, if any
  revokedAt: number | null;
}
export interface Standing { dormant: boolean; reentryProbation: boolean; kinProbation: boolean; revoked: boolean }
export function standingAt(history: MemberHistory, t: number): Standing
export function isSuspended(standing: Standing): boolean
```
- `Standing` must have exactly these four keys (tests use `deepEqual`).
- Throws `RangeError` when `t`, a period bound, `kinAdmittedAt` or `revokedAt` is negative or not an integer, or a period has `end <= start`.
- `DORMANCY_PROBATION` and `KIN_PROBATION` via `resolve("NAME").value` (`params.ts`).

## Tests
Branch `task/20-standing` holds failing tests at 33882a6: `engine/test/standing.test.ts`.

## Gate
`npm --prefix engine ci && npm --prefix engine test`

## Allowed paths
- engine/src/standing.ts
- engine/test/standing.test.ts (read only)

## Model
opencode-go/deepseek-v4.1-flash

## Notes
- Do **not** export a type named `DormancyPeriod` (another module owns it; `index.ts` re-exports every module and names must not clash). Use the inline type shown.
- Start the file with `// spec §4.10 — …`; every `// spec §…` tag must name a section that exists in `HEARTH-protocol-spec-v5.md` (the trace check in `npm test`).
- Do **not** edit `engine/src/index.ts`; the director adds the re-export at merge.
- No runtime dependencies. Never edit the test file; if a test looks wrong, that is `HANDOFF: BLOCKED`.
