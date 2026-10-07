# HEARTH Use-Case Feasibility Study

**Status:** living document, non-normative, exploratory. This file assesses what HEARTH could be
*used for*, judged against the v5 spec as written — it proposes no spec changes. Per the project
discipline, every verdict cites the spec sections it rests on; anything not derivable from the
spec or the simulations is marked **[UNPROVEN]**. New use cases get a table row first (status
*stub*), then a short analysis section when explored (status *explored*).

Verdict scale: **native** (the spec already does this) · **feasible as profile** (works as a usage
convention on existing mechanisms, no spec change) · **partial** (some of it works, core of it
doesn't) · **infeasible** (conflicts with a normative MUST/MUST NOT or a stated non-goal).

## Use-case table

| Use case | Verdict | What HEARTH provides | What breaks / caveats | Key spec §§ | Status |
|---|---|---|---|---|---|
| Code / project repository | **Partial** — infeasible as git replacement; feasible as provenance + release layer | Hash-addressed signed records, `prior_version` chains, endorsement-as-review, disputes-as-advisories, fork semantics | No public clone-by-hash (no global DHT), no full-history replication, not a CDN, ~150-member ceiling | §2.3, §8, §7.7, §10.3.4, §1.3, §4.11 | Explored (below) |
| Chat / messaging app | **Native** | 1:1 and MLS tribe group messaging with sequencer-Steward ordering, offline mailboxes | Mailboxes are delivery buffers (14-day TTL), not archives | §10.1–10.2, §10.4 | Explored (trivially — it's in scope) |
| File sharing within a tribe | **Native** | Spark-authorized anonymous distribution; chunked, encrypted, content-addressed within the transfer | Reputation-gated throughput; PQ Spark tokens impractical for large transfers today | §7.1, §7.6–7.7, §7.9 | Explored (trivially — it's in scope) |
| Publication / review circle | **Native** | The Beacon's stated purpose: versioned, endorsed, retractable artifacts with reader verification | Pull-based only | §8 | Explored (trivially — it's in scope) |
| Public content distribution / CDN | **Infeasible** | — | Named non-goal: "Not a broadcast platform or CDN" | §1.3, §7.7 | Explored (by spec text) |
| Package registry (npm/PyPI-style) | **[UNPROVEN]** — likely same shape as code repo | Beacon release chains + federation trust between publisher tribes | Discovery and mass fetch must live outside HEARTH | §8, §9 | Stub |
| Social feed / microblogging | **[UNPROVEN]** | — | Anti-global-scale posture likely conflicts with feed dynamics | §1.1, §1.3 | Stub |
| Collaborative documents / wiki | **[UNPROVEN]** | Append-only records with supersession links | No CRDT/merge layer in spec | §2.3 | Stub |

---

## Code / project repository (explored 2026-07-14)

**Question.** Can HEARTH serve as a distributed code repository — and could the HEARTH project
itself be the initial seed tribe?

### What maps well

Git and HEARTH share an object model: every HEARTH record is BLAKE3 hash-addressed, signed,
append-only, and references other records by hash (§2.3) — a Merkle DAG. On top of that, the
Beacon (§8) already provides the *release* half of a repository:

| Repo concept | HEARTH mechanism |
|---|---|
| Signed release / tag | `PublicationRecord` with `artifact_hash` (§8.1) |
| Release history | `prior_version` chain (§8.1) |
| Code review / approval | `EndorsementBundle` — a verifiable reputation stake, not a rubber stamp (§8.1, §8.3) |
| Yanked release | Graduated retraction status machine (§8.4) |
| Security advisory | Federation `DisputeRecord` (§9.1, §9.3) |
| Friendly fork | New artifact lineage + `CitationRecord` back to origin (§9.2) |
| Hostile fork / governance split | Tribe schism: history stays with threshold-signing continuity; both lineages independently citable (§4.11) |
| Third-party attestation | Witness cosigning by bridge-partner tribes (§5.6, §8.2) |
| Download host | Mirror role — content-addressed copies, no signing authority (§8.6, §13.3) |

The honest one-line pitch: **Sigstore with social trust instead of OIDC** — provenance backed by
named humans with staked, decaying reputation rather than an identity provider. (Sigstore and
Sigsum are already metabolized prior art: §8.6's monitor-of-record and §5.6's witnesses come from
them.)

### What breaks

Four normative commitments rule out HEARTH as the *storage and transport* of repositories:

1. **No global content DHT.** Chunk hashes are content-addressed *within an authorized transfer
   only*; a relay MUST NOT make them discoverable outside it (§7.7). Public anonymous
   clone-by-hash is exactly the primitive v1 rejected and v5 kept rejecting.
2. **No full-history replication.** A relay or client MUST NOT require or perform full-history
   replication as a condition of sync (§10.3.4, the Scuttlebutt lesson). Tribe sync carries the
   Beacon *index* only; artifact bodies are fetched on demand (§10.3.1). Live git-history sync
   through HEARTH would violate this by construction.
3. **Not a CDN, anti-global-scale.** Tribes cap near 150 (§1.1, §4.1); the Beacon is pull-based
   published artifacts, not a broadcast platform (§1.3). A popular repo's consumers cannot be a
   tribe and were never meant to be.
4. **Practical transfer limits.** PQ Spark tokens run 85–175 KB per chunk presentation (§7.9),
   and volunteer relay economics are already flagged unproven at Dunbar scale (§11.6).

### The feasible shape: a Beacon code-release profile **[UNPROVEN]**

Keep git as the working transport (day-to-day commits, branches, clones happen over ordinary git
hosting or Mirrors). Use HEARTH as the trust layer above it: a maintainer tribe publishes each
release — a git bundle or tarball, `artifact_hash` = BLAKE3 of the artifact — as a
`PublicationRecord`; reviewers endorse; advisories arrive as disputes; readers run the §8.7
verification algorithm and fetch the artifact from any Mirror or ordinary host, checking the hash.
This is a usage convention on existing mechanisms — it respects every MUST/MUST NOT above and
needs no spec change.

### HEARTH as seed tribe **[UNPROVEN]**

The bootstrap maps cleanly onto genesis mechanics: tribe formation requires ≥2 founding
co-signers as the Anchor set, recorded in the epoch-0 CheckpointRecord (§4.1); the spec's
maintainers/electorate (§15.2) are the natural Anchors, and the spec, sims, and results JSONs are
the natural first Beacon artifacts, with spec releases forming a `prior_version` chain.
Dogfooding value: publishing the spec through its own Beacon would exercise §8 end-to-end and has
already surfaced one gap (below).

Honest caveats:

- **N=1 degradation.** Witness cosigning (§5.6) and the Federation (§9) need counterparty tribes;
  at one tribe, witnessing degrades to self-attestation. §9.7 anticipates cold-start
  bootstrapping, but the anti-equivocation benefit is real only once bridge partners exist.
- **No implementation exists.** The wire encoding is deferred (§16); "seed tribe" is a design
  target, not something executable today.

### Gaps and sim candidates for v6

- **No artifact-size cap.** v1 had a reputation-scaled max file size; v5 defines no artifact or
  record size bound — effective limits are mailbox byte caps (§10.4) and Spark budgets (§7.6).
  A release profile needs a pinned bound.
- **Sim candidate:** Mirror/relay load under release-fetch traffic (does §11.4 load-shedding hold
  when one Beacon artifact is hot?).
- **Sim candidate:** endorsement-as-code-review incentive effects — does staking Ember on
  releases distort the §5.2 issuance equilibrium?
