🧠 Claude: engine slice for the §6.2 retaliation discount (contested pairs), part of the Embers request "adjudication §6.1–§6.4". Ready for a worker.

## Goal
Add `engine/src/contested.ts`: `contestedAt(complaints, t)` returns the record hashes of every complaint that is contested at epoch `t`.

## Spec
`HEARTH-protocol-spec-v5.md` §6.2 "Retaliation discount rule", including the new "Contested evaluation (normative, added 2026-10-13)" paragraph. That paragraph is on the director's nightly branch and may not be on `main` yet; its content is restated here and is binding:
- Only complaints with `epoch ≤ t` exist at `t`; later ones are ignored.
- A complaint `x` (complainant A, target B, epoch eₓ) is **contested** at `t` iff some existing complaint `y` with complainant B and target A has `|eₓ − e_y| < RETALIATION_WINDOW` (30). Same epoch counts (difference 0).
- Symmetric: it does not matter which was filed first. It never lapses as `t` grows. Each complaint is checked against every opposite-direction complaint; a pair is an ordered member pair (A→B with B→A), so A→C does not contest A→B.

```ts
export function contestedAt(
  complaints: readonly { hash: string; complainant: string; target: string; epoch: number }[],
  t: number,
): Set<string>
```
- Throws `RangeError` on: a `hash` that is not 64 lowercase hex chars, a duplicate `hash`, an `epoch` that is not a non-negative integer.
- Result must not depend on input order. Do **not** export a named complaint interface (another module owns `Complaint`; `index.ts` re-exports all modules and names must not clash). A non-exported local type alias is fine.
- `RETALIATION_WINDOW` via `resolve("RETALIATION_WINDOW").value` (`params.ts`).
- Out of scope: the "resolved" clause (restoring weight once a case reaches quorum without the pair). Under the §6.3 conviction gate it changes no verdict.

## Tests
Branch `task/15-contested` holds failing tests at 3d740bd: `engine/test/contested.test.ts`.

## Gate
`npm --prefix engine ci && npm --prefix engine test`

## Allowed paths
- engine/src/contested.ts
- engine/test/contested.test.ts (read only)

## Model
opencode-go/deepseek-v4.1-flash

## Notes
- Group complaints by `complainant + "\u0000" + target` for an O(n log n) or simple O(n²) check; either is fine at tribe scale.
- Start the file with `// spec §6.2 — …`; every `// spec §…` tag must name a section that exists in `HEARTH-protocol-spec-v5.md` (the trace check in `npm test`).
- Do **not** edit `engine/src/index.ts`; the director adds the re-export at merge.
- No runtime dependencies. Never edit the test file; if a test looks wrong, that is `HANDOFF: BLOCKED`.
