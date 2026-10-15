# HANDOFF — how directors and coding agents pass work

Canonical copy: `jasondearborn/scripts` → `handoff/HANDOFF.md`. Each project repo carries a
copy at its root; `handoff/sync-handoff.sh` keeps them identical. Edit the canonical copy only.

## Roles

- **Director**: Claude (Opus) or Jason. Writes the task, writes the failing tests, reviews,
  merges. Only a director merges into `main`.
- **Worker**: an opencode session (qwen-vm, OpenCode Go models; local Qwen as a last resort).
  Writes code on a task branch, checks in often, opens a PR, and stops.

All GitHub activity uses Jason's account, so every comment says who wrote it. Its first line
must start with one of these tags:

| Tag | Author |
|---|---|
| `🤖 opencode/<model>:` | a worker (e.g. `🤖 opencode/deepseek-flash:`) |
| `🧠 Claude:` | the Claude director |
| `🛠 oc:` | the `oc` dispatcher (automatic notices only) |
| *(no tag)* | Jason. Treat as director instructions. |

Workers commit as `coder (qwen-vm) <coder@qwen-vm.invalid>` (qwen-vm's git config). Never
change that identity; it is how a director tells worker commits apart.

## The queue: GitHub issues

A task is an issue labelled `agent:ready`. Its body uses these sections (the dispatcher
parses them; keep the headings exact):

```
## Goal
One or two sentences: what changes for the user or the code.

## Spec
The rules the code must follow. Exact names, signatures, field order, concrete example
values. Link spec sections (file + heading) instead of pasting whole documents.

## Tests
Branch `task/<n>-<slug>` holds failing tests at <sha>: <test files>.
(Or "none" for docs-only work, with what to check instead.)

## Gate
`npm ci && npm test && npm run build`

## Allowed paths
- src/sim/road.ts
- src/sim/road.test.ts (read only)

## Model
deepseek/deepseek-flash

## Notes
Optional: pitfalls, related issues, what not to do.
```

A director may file several `agent:ready` issues at once. Issues running at the same time in
one repo must have non-overlapping **Allowed paths**.

## Labels and lifecycle

```
agent:ready ──► agent:working ──► agent:review ──► merged (issue closed by "Closes #n")
                    │   ▲               │
                    ▼   │               ▼
              agent:blocked        agent:changes ──► agent:working …
```

| Label | Set by | Meaning |
|---|---|---|
| `agent:ready` | director | Fully specified; a worker may take it. |
| `agent:working` | worker | Claimed; one worker is on it. |
| `agent:blocked` | worker | Stopped on a question only a director can answer. |
| `agent:review` | worker | PR open, gate green; waiting for a director. |
| `agent:changes` | director | Review asked for changes; the worker resumes. |

Moving to a new label removes the previous `agent:*` label. Exactly one `agent:*` label at a time.

## Worker protocol

1. **Claim.** Only take an issue labelled `agent:ready` or `agent:changes`, and only the
   one you were dispatched to. Set `agent:working` and comment:
   `🤖 opencode/<model>: claimed. Session <id>, branch task/<n>-<slug>.`
2. **Branch.** Work on `task/<n>-<slug>`. If the director already pushed it (tests first),
   build on it; never rewrite its existing commits. Never push to `main`, never force-push.
3. **Stay in scope.** Edit only **Allowed paths**. Never edit tests the director wrote,
   `.github/`, `scripts/*gate*`, `AGENTS.md`, `HANDOFF.md`, `LICENSE`. If the task cannot be
   done inside the allowed paths, that is a BLOCKED question, not a reason to widen scope.
4. **Check in.** Commit and push whenever the gate is green on a step, and at least every
   30 minutes while working. Commit messages: `<what changed> (#<n>)`.
5. **Gate.** Run the issue's **Gate** command exactly as written before declaring done. Paste
   the last ~20 lines of its output into the PR.
6. **Finish → PR.** Open (or update) a PR from the task branch to `main`, title
   `<issue title> (#<n>)`, body:
   ```
   🤖 opencode/<model>:
   Closes #<n>

   ## What changed
   ## Gate output
   ## Decisions I made
   ## Follow-ups (not done)

   HANDOFF: REVIEW
   ```
   Set `agent:review`. Then stop. Do not merge, approve, or close anything.
7. **Blocked.** After two failed attempts at the same gate error, or on any design question
   (ambiguous spec, a test that looks wrong, a needed file outside scope), commit and push what
   you have, then comment:
   ```
   🤖 opencode/<model>:
   HANDOFF: BLOCKED
   Question: <one specific question>
   Options: <A / B, with your recommendation>
   State: <what works, what fails, last gate output tail>
   ```
   Set `agent:blocked`. Then stop. Never guess on a design question. Never weaken or skip a test
   to get green.
8. **Changes requested.** When resumed after `agent:changes`, read every director comment and
   PR review comment newer than your last comment, address each, push, reply on the PR with
   what you did per comment, and set `agent:review` again.

The last line of the worker's final message is `HANDOFF: REVIEW` or `HANDOFF: BLOCKED`.

## Director protocol

1. **File** the issue (template above). Write failing tests first and push them to
   `task/<n>-<slug>` whenever there is something testable. Pick the model from the ranking
   (Claude: memory `opencode-go-models`). Label `agent:ready`.
2. **Dispatch** with `oc dispatch <repo> <n>` (or let the nightly runner do it), or start an
   opencode session by hand and point it at the issue.
3. **Review** PRs in `agent:review`: read the full diff, rerun the gate locally, and check the
   result against the spec, not just against the tests.
   - Good: `gh pr merge <pr> --merge` (merge commit, the no-ff equivalent). Never squash or
     rebase. The issue closes from `Closes #n`.
   - Needs work: leave PR review comments, set `agent:changes`, then `oc resume <repo> <n>`
     (same session, so the worker keeps its context). A model escalation goes in the resume
     call (`-m`).
   - Small fixes are cheaper to make yourself on the task branch before merging; say so in a
     PR comment.
4. **Unblock** issues in `agent:blocked`: answer in a comment, adjust the issue body if the
   spec changed, set `agent:ready`, and resume or redispatch.
5. **Escalate** when a worker is blocked on capability rather than spec: re-dispatch on the
   next model up the ranking, then a Claude Sonnet subagent, then local Qwen.

## Guard rails

- `main` is director-only. GitHub cannot enforce this for private repos on the current plan,
  so the runner's tamper check flags any commit on `origin/main` authored by
  `coder@qwen-vm.invalid` that is not inside a director's merge commit.
- One worker per issue. At most `OC_MAX_WORKERS` (default 3) sessions on qwen-vm at once
  (limited by its RAM).
- Secrets never go in issues, PRs, commits or logs. qwen-vm holds the PAT and the Go key; no
  other credentials.
