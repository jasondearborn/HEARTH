🧠 Claude: engine slice for the §6.1 ComplaintRecord filing check (Embers request "adjudication §6.1–§6.4"). Ready for a worker.

## Goal
Add `engine/src/complaint.ts`: a pure `checkComplaint(complaint, ctx)` that says whether a Steward relay accepts a ComplaintRecord, listing every reason it fails.

## Spec
`HEARTH-protocol-spec-v5.md` §6.1 "ComplaintRecord", including the new "Filing check (normative, added 2026-10-13)" paragraph. That paragraph is on the director's nightly branch and may not be on `main` yet; its content is restated here and is binding.

```ts
export interface Complaint {
  hash: string;          // record hash, 64 lowercase hex chars
  complainant: string;
  target: string;
  epoch: number;         // epoch filed
  evidenceHash: string;  // content-addressed evidence
}
export interface ComplaintContext {
  roster: ReadonlySet<string>;              // roster-enrolled members of the tribe
  accepted: readonly Complaint[];           // complaints this relay already accepted
  dismissedEvidence: ReadonlySet<string>;   // evidence hashes of complaints counted in dismissed cases (§6.4)
}
export type ComplaintFailure =
  | "evidence" | "complainant-not-enrolled" | "target-not-enrolled"
  | "self-complaint" | "rate-limit" | "evidence-reused";
export interface ComplaintCheck { accepted: boolean; failures: ComplaintFailure[] }
export function checkComplaint(complaint: Complaint, ctx: ComplaintContext): ComplaintCheck
```
Checks, all evaluated, failures pushed in exactly this order:
1. `evidence`: `evidenceHash` is not 64 lowercase hex chars (empty string included).
2. `complainant-not-enrolled`: complainant not in `roster`.
3. `target-not-enrolled`: target not in `roster`.
4. `self-complaint`: complainant === target.
5. `rate-limit`: `ctx.accepted` already holds `COMPLAINT_RATE_LIMIT` (1) or more complaints by the same complainant with the same `epoch`.
6. `evidence-reused`: `dismissedEvidence` has `evidenceHash`. Sharing an evidence hash with complaints in `accepted` is fine.

`accepted` = no failures. Throws `RangeError` (malformed record, not a rejection) when: `hash` is not 64 lowercase hex chars; `epoch` is not a non-negative integer; a complaint with the same `hash` is already in `ctx.accepted`.
`COMPLAINT_RATE_LIMIT` via `resolve("COMPLAINT_RATE_LIMIT").value` (`params.ts`).

## Tests
Branch `task/14-complaint` holds failing tests at 7a15ace: `engine/test/complaint.test.ts`.

## Gate
`npm --prefix engine ci && npm --prefix engine test`

## Allowed paths
- engine/src/complaint.ts
- engine/test/complaint.test.ts (read only)

## Model
opencode-go/deepseek-v4.1-flash

## Notes
- House style: read `engine/src/admission.ts` if present on your branch, else `engine/src/penalty.ts`. Small file, about 60 lines.
- Start the file with `// spec §6.1 — …`; every `// spec §…` tag must name a section that exists in `HEARTH-protocol-spec-v5.md` (the trace check in `npm test`).
- Do **not** edit `engine/src/index.ts`; the director adds the re-export at merge.
- No runtime dependencies. Never edit the test file; if a test looks wrong, that is `HANDOFF: BLOCKED`.
