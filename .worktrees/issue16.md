🧠 Claude: engine slice for the §6.4 adjudication state machine (Embers request "case state machine"). Ready for a worker.

## Goal
Add `engine/src/case.ts`: `adjudicate(input)` groups accepted complaints into cases per target and reports each case as pending, convicted or dismissed as of epoch `t`. Quorum, eligibility and contested status come in as callbacks, so this module needs no other unmerged module.

## Spec
`HEARTH-protocol-spec-v5.md` §6.4 "Adjudication state machine" (case identity and the new "Case evaluation (normative, added 2026-10-13)" bullet) and the §6.3 "Conviction gate". The new bullet is on the director's nightly branch and may not be on `main` yet; its content is restated here and is binding.

```ts
export interface AdjudicationInput {
  complaints: readonly { hash: string; complainant: string; target: string; epoch: number }[]; // accepted ComplaintRecords
  t: number;                                             // evaluate up to and including epoch t
  quorumAt: (openedEpoch: number) => number;             // quorum fixed from N at the case's opening (§6.3)
  eligible: (member: string, epoch: number) => boolean;  // may count as a distinct complainant at that epoch (§6.3)
  contested: (hash: string, epoch: number) => boolean;   // complaint contested at that epoch (§6.2)
}
export type CaseStatus = "pending" | "convicted" | "dismissed";
export interface Case {
  target: string;
  openedEpoch: number;
  status: CaseStatus;
  closedEpoch: number | null;  // conviction epoch, or openedEpoch + CASE_WINDOW if dismissed; null if pending
  complaints: string[];        // hashes of joined complaints, in (epoch, hash) order
  counted: string[];           // distinct counted complainants, sorted, at the evaluation epoch (below)
}
export function adjudicate(input: AdjudicationInput): Case[]
```
Rules:
1. Ignore complaints with `epoch > t`. Per target, take complaints in `(epoch, hash)` order (hash: string compare).
2. A case opened at `o` is open at epochs `o ≤ e < o + CASE_WINDOW` (60). A complaint joins the target's open case, or opens a new case at its own epoch. Each complaint is in exactly one case.
3. Evaluate the case at **every** open epoch `e` from `o` up to `min(t, o + CASE_WINDOW − 1)`, after all complaints of epoch `e` have joined. `count(e)` = number of distinct complainants `m` with `eligible(m, e)` and at least one joined complaint (epoch ≤ e) with `!contested(hash, e)`.
4. Convicted at the first `e` with `count(e) ≥ quorumAt(o)`: `closedEpoch = e`, `counted` = those complainants at `e`. Complaints at epochs `> e` open a new case.
5. If never convicted and `o + CASE_WINDOW ≤ t`: dismissed, `closedEpoch = o + CASE_WINDOW`, `counted` at the last open epoch `o + CASE_WINDOW − 1`. Complaints at epochs `≥ o + CASE_WINDOW` open a new case.
6. Otherwise pending, `closedEpoch: null`, `counted` at `t`.
7. Output sorted by `(openedEpoch, target)`. Always call `quorumAt` with the opening epoch.
8. Throws `RangeError` on a `hash` not 64 lowercase hex chars, a duplicate `hash`, an `epoch` that is not a non-negative integer.

`CASE_WINDOW` via `resolve("CASE_WINDOW").value` (`params.ts`). Out of scope: appeal window and small-tribe gate (§6.7), penalties (§6.5/§6.6), the filing check (§6.1).

## Tests
Branch `task/16-case` holds failing tests at b259858: `engine/test/case.test.ts`. (The "implicitly any" tsc errors disappear once the module exists.)

## Gate
`npm --prefix engine ci && npm --prefix engine test`

## Allowed paths
- engine/src/case.ts
- engine/test/case.test.ts (read only)

## Model
opencode-go/deepseek-v4.1-flash

## Notes
- Do **not** export a named complaint interface (another module owns `Complaint`; `index.ts` re-exports every module and names must not clash). A non-exported local type alias is fine.
- Start the file with `// spec §6.4 — …`; every `// spec §…` tag must name a section that exists in `HEARTH-protocol-spec-v5.md` (the trace check in `npm test`).
- Do **not** edit `engine/src/index.ts`; the director adds the re-export at merge.
- No runtime dependencies. Never edit the test file; if a test looks wrong, that is `HANDOFF: BLOCKED`.
