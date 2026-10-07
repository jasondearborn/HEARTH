# AGENTS.md — HEARTH

Instructions for AI coding agents working in this repository. Optimized to
minimize tokens read, tokens written, and compute spent per task.

## What this project is

HEARTH is a **specification project**: a protocol for vouched-membership,
company-less communities. There is no implementation yet. The deliverables are
markdown spec documents and Python adversarial simulations that back the
spec's claims. Target trajectory: reference library → Internet-Draft →
Independent-stream RFC.

The project's core discipline, which you must preserve:
**every design claim either carries evidence (simulation, prior art, proof)
or is explicitly labeled unproven.** Never add an unlabeled claim. Never
delete a documented failure.

## Repo map — read only what the task needs

| File | Purpose | Read when |
|---|---|---|
| `HEARTH-protocol-spec-v5.md` | Current normative spec | Spec edits, protocol questions |
| `HEARTH-README.md` | Plain-language pitch | Positioning/comms tasks only |
| `README.md` | Repo front page | Rarely |
| `HEARTH-prior-art.md` | Survey of 30+ related systems | Adding citations, "why not X" questions |
| `HEARTH-protocol-spec-v1..v4.md` | Historical. Frozen. | Almost never — only explicit history tasks |
| `HEARTH-v1-critique.md` | Historical. Frozen. | Almost never |
| `hearth_v5_sim.py` | Current simulations | Sim work only |
| `hearth_v3_sim.py`, `hearth_federation_sim.py` | Historical sims. Frozen. | Almost never |
| `*_sim_results.json` | Raw sim output | **Never read raw** — see Simulations |

**Default context for a spec task:** the relevant *section* of v5 plus this
file. Do not load the entire v5 spec for a localized edit — search for the
section heading and read that section.

**Frozen files** (`v1`–`v4` specs, critique, old sims, old results JSONs) are
never edited. They are the project's evidence trail. If a task appears to
require changing them, stop and ask.

## Cost-efficiency rules

1. **Search before reading.** Grep for the term/section; read the hit plus
   ~50 lines of context. Do not read whole files to "get oriented" — this
   file is the orientation.
2. **Targeted edits only.** Use string-replacement edits on spec files. Never
   regenerate a full spec document to change one section.
3. **Never read `*_results.json` directly.** They are large. Extract what you
   need programmatically, e.g.:
   `python3 -c "import json;d=json.load(open('hearth_v5_sim_results.json'));print(list(d.keys()))"`
   then pull only the keys required.
4. **Smoke-test sims cheaply.** During iteration, run simulations with
   reduced trial counts (e.g. 100 iterations) to validate logic. Full
   Monte-Carlo runs happen once, at the end, when results will be committed.
   If the sim lacks an iterations flag, add one before iterating on it.
5. **Don't re-derive; cite.** If a question is answered in the prior-art doc
   or a spec appendix, reference it instead of re-analyzing.
6. **One clarifying question beats a wrong 5k-token draft.** If the task is
   ambiguous about which mechanism or spec section it targets, ask first.
7. **No unsolicited summaries.** After an edit, report what changed in ≤3
   lines. Do not restate the spec back.

## Spec conventions

- **Versioning:** the current spec is edited in place until a version is
  declared frozen; a new version is a new file (`HEARTH-protocol-spec-vN.md`).
  Never renumber or retroactively edit a frozen version.
- **Normative language:** RFC 2119/8174 keywords (MUST/SHOULD/MAY, capitals)
  in normative sections. Prose sections stay lowercase. Preserve this split —
  it feeds the future Internet-Draft conversion.
- **Evidence labels:** claims are tagged with their support:
  `[sim: hearth_v5_sim.py §name]`, `[prior-art: SystemName]`, or
  `[UNPROVEN]`. New mechanisms enter as `[UNPROVEN]` until a simulation or
  argument is attached.
- **Falsified designs go to appendices, not /dev/null.** If a simulation
  kills a proposed rule, the rule and the result are written up in the spec's
  appendix. This is the project's signature discipline.
- **Threat model:** any new mechanism gets a row in the threat-model table:
  attack, mitigation or "accepted risk". "Accepted risk" is a legitimate
  entry; a missing row is not.

## Simulation conventions

- Python 3, stdlib-only preferred. Do not add dependencies without asking —
  zero-dep sims are part of the project's reproducibility story.
- Every sim is seeded and deterministic; results JSONs must be reproducible
  from a stated seed.
- A sim that *falsifies* a design is a success. Report it as a finding, fix
  the design or mark accepted risk — never tune the sim until it passes.
- New sim scenarios: add to `hearth_v5_sim.py` rather than new files, unless
  testing a distinct subsystem.

## Model tiering and delegation

Match model capability to task difficulty. Protocol reasoning is the only
frontier-model work in this repo; most tasks are search, extraction, and
mechanical edits.

| Tier | Models | Use for |
|---|---|---|
| Orchestration / design | Fable or Opus, **one instance** | Planning, task decomposition, protocol/mechanism reasoning, threat-model changes, sim result interpretation, anything touching normative MUST/SHOULD text |
| Execution | Sonnet | Spec section edits from an approved plan, writing/modifying sim code, README sync, commit prep |
| Retrieval / mechanical | Haiku | Grep-and-report, extracting keys from results JSONs, cross-reference checks, format/lint fixes, changelog entries |

Rules:

1. **One orchestrator.** Exactly one Fable/Opus instance plans and reviews.
   It does not do retrieval or mechanical edits itself — delegate down.
2. **Max 3 concurrent subagents.** This repo is small; parallelism beyond
   that burns tokens on coordination, not work. Most tasks need 0–1
   subagents.
3. **Delegate down, never up.** A subagent that hits a design question
   (ambiguous normative language, a sim falsifying a mechanism, a
   threat-model gap) returns it to the orchestrator. Subagents never resolve
   protocol semantics on their own.
4. **Scoped briefs.** Every delegation names: target file(s), the specific
   section, the expected output form, and a token/read budget. "Go
   understand the spec" is a forbidden brief.
5. **Subagents return digests, not dumps.** Findings come back as ≤20-line
   summaries with file:line references, never pasted file contents.
6. **No recursive spawning.** Subagents do not spawn subagents.
7. **Escalation is one-way and cheap.** If a Haiku-tier task turns out to
   need judgment, hand it up rather than letting the cheap model guess —
   a wrong normative edit costs more than the model savings.
8. **Single-file trivial tasks skip the hierarchy.** A typo fix or one-line
   sim tweak is one Sonnet call, no orchestrator ceremony.

Enforcement note: this section is policy. If using Claude Code, bind it in
`.claude/agents/*.md` subagent definitions (each pins a `model:` field) so
tier selection is configuration, not compliance.

## Editing hygiene

- Editor references in docs/examples: `vi`, never `nano`.
- Code examples: Python unless the context dictates otherwise.
- Keep the README table-of-differences and the changelog in
  `HEARTH-README.md` in sync with spec changes that alter user-visible
  behavior. Localized normative tightening does not require README edits.
- Commit messages: `spec:`, `sim:`, `docs:`, `readme:` prefixes; one logical
  change per commit; if a sim result motivated a spec change, name the sim in
  the message.

## Hard rules

- Never delete or soften documented failures, falsified variants, or
  "accepted risk" rows.
- Never introduce a token, global reputation score, or mandatory central
  service — these are explicit anti-goals, not oversights.
- Never claim a scale, security, or privacy property without an evidence
  label.
- Licensing/governance files (`LICENSE`, any future `GOVERNANCE.md`) are
  human-only edits.
