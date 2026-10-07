# HEARTH v5 — critical review (2026-10-07)

A skeptical, pre-Internet-Draft review of `HEARTH-protocol-spec-v5.md`. The aim was to find what would
break interoperability, what is exploitable, and where the spec claims more than its evidence supports.
The spec was then corrected in place, per AGENTS.md: v5 is not frozen, failures are recorded rather than
deleted, and new mechanisms enter as `[UNPROVEN]`.

**Method.** The orchestrator (Opus) reviewed §0–§6, §14–§16 and Appendices A/D/E directly, and checked
each simulation claim against `hearth_v5_sim.py` and its results JSON. Three Sonnet reviewers made a first
pass over §3 + §10–§13, §7–§8 and §9 + Appendices B/C, and a Haiku pass audited cross-references.
Before acting on any subagent finding, the orchestrator checked it against the spec text or the sim code.

**Commits.** `95ffdde` (core §3.4/§4–§6/§15.3), `7ec6d47` (peripheral §3.5/§7–§12), `4e969f4` (threat
model, §16, Appendix D), `fb7c82a` (cross-references), plus this document.

## Verdict

The design thesis holds up, and so does the project's discipline: failures are written down, and parameters
carry their evidence status. The review found three classes of problem:

1. **Evidence overclaims in the simulations.** These matter most, because the project's credibility rests on
   its evidence labels:
   - **S2** does not implement §5.2, so the "§5.2 parameters exercised in S2" labels and the 0.65 equilibrium
     conclusion did not hold.
   - **S5**'s "0% lure" is a consequence of the chosen sampling ranges.
   - **S6**'s "0% wrongful at N ≥ 12" describes a rule the spec does not ship at N ≥ 12.
   - **S7** is two coin flips presented to 0.1% precision.

   All four are now corrected in the spec. The original numbers stay on record, and only the
   interpretations were withdrawn.
2. **Interoperability gaps.** Two conforming implementations would compute different results:
   - penalty decay, arithmetic, and Ember budget overflow ordering;
   - k(m);
   - the kin-admission neighborhood;
   - the conviction gate;
   - the appeal draw;
   - rᵢ(T).

   All but rᵢ(T) are now pinned down; rᵢ(T) is open (§16 item 14).
3. **Security flaws in peripheral layers.** A Spark tag derived from the payload allowed undetected
   double-spends. The presence-hint key had no secret input. Beacon readers could not detect a withheld
   retraction, and the freshness check guarded the wrong statuses. A single stolen device could enrol and
   revoke other devices. Spark issuer keys could be partitioned to deanonymize members. The MLS admission
   flow was impossible as written. All of these are fixed in place.

## Findings fixed in the spec

| # | Section | Finding | Fix |
|---|---|---|---|
| 1 | §4.1 | Genesis deadlock: Anchors start at 0.50, Steward-eligible needs 0.75, checkpoints need Stewards from epoch 0 | Anchors are the genesis Steward set; eligibility waived for the first term |
| 2 | §4.4 | Scan called "the proximity proof", but it is unverifiable and trivially bypassed by a colluding voucher | Reframed as an honest-participant ritual; limitation + threat row 37 |
| 3 | §4.4 | `generated_at`/`expiry` typed `epoch` (24 h) for a 10-minute window; signed fields ≠ VouchRecord table | `timestamp` type; `signed_at` field; sign all table fields |
| 4 | §4.5 | Neighborhood cap undefined ("neighborhood" isn't a partition) and written as `MAY` | Deterministic per-admission MUST |
| 5 | §4.5/§6.6 | Kin stake multiplier acts via `linkage_weight`, which the penalty formula never used; once applied, the per-incident cap clips it above 1.2× | `linkage_weight` enters the formula; clipping disclosed; decision open (§16 #11) |
| 6 | §4.6 | k(m) under-determined (elder set as of when, elders' own multiplier, NP-hard max) | Pinned to the checkpoint; compute min(k, k_target) |
| 7 | §4.9 | `uint` types for fractions; presented `bridge_weight` trusted; no freshness on standing proofs | Fixed-point; verifier recomputes; `BRIDGE_PROOF_MAX_AGE` |
| 8 | §5.1 | `penalties(m,t)` undefined: constant penalties outlive decayed standing; no arithmetic for "MUST replay identically" | Penalties decay as negative Embers; R ≥ 0; fixed-point `REP_SCALE` |
| 9 | §5.2 | Over-budget Ember selection order undefined | `(sequence, hash)` order |
| 10 | §5.5 | Leaves keyed by root identity and "safe to mirror": publishes every roster (contradicts PSI in §4.9.1); only a bucket published, yet §6.5 replays exact values | Private labels; committed exact value; heads public, leaves tribe-internal; `policy_hash` |
| 11 | §5.5.3 | Dispute "rebutted" by a Merkle audit path, which proves inclusion, not the value | Computation transcript; dispute record defined and sent to witnesses |
| 12 | §5.6 | "Bridge-partner tribe" and the witness key undefined; k=2 with one partner impossible | `BridgePartnership` record; `min(K, N)` |
| 13 | §3.4/§5.5.4 | §5.5.4 says keep first-seen, §3.4 says reject both; unsigned junk could trigger a permanent halt | Aligned to §3.4; requires two validly-signed views |
| 14 | §6.3 | "Weighted-and-distinct gate" never defined | Count-only gate stated normatively; weighted gate open (§16 #9) |
| 15 | §6.3 | 11→12 discontinuity halves quorum; growing N mid-case is a capture lever | N frozen at case open; threat row 38; curve open (§16 #10) |
| 16 | §6.4 | No case identity; dismissed cases refilable every epoch | Case = (target, opened_epoch); evidence reuse rejected |
| 17 | §6.7 | "Bridges to" undefined; draw seed grindable by the convicting faction; \|E\| < 2 undefined; intra-tribe vote rule undefined | Canonical record; grinding disclosed (row 39); \|E\|<2 rule; vote rule `[UNPROVEN]` |
| 18 | §15.3 | "Minimum Steward count" and "caretaker mode" referenced, never defined | `MIN_STEWARDS`, `CARETAKER_GRACE`, caretaker semantics |
| 19 | §3.5 | Single device may enrol (contradicts the containment invariant); "authorization policy" undefined | Per-operation authorization table |
| 20 | §7.2 | `tag_value` derived from `context` (manifest hash): one show reused on another manifest gets a new tag, so double-spends go undetected | Tag from (secret, window, show_index) only |
| 21 | §7.2 | Issuer keys not committed: per-member keys deanonymize (key partitioning) | Keys in witnessed log; client consistency check (row 42) |
| 22 | §7.3 | ARC is MAC-based (keyed verification), not BBS; the composition argument is invalid | Withdrawn, `[UNPROVEN]`; redesign open (§16 #15) |
| 23 | §8.5 | Unsalted hash tombstones of low-entropy PII are brute-forceable; redactions not logged | Salted per-field commitments SHOULD; RedactionRecords logged |
| 24 | §8.7 | Backward links cannot reveal a withheld newer StatusRecord; freshness gate guarded disputed/retracted instead of active | Completeness against a fresh head, else "unknown"; gate inverted to active/reaffirmed |
| 25 | §9.4 | Decayed/zero opinions stay in the denominator; wᵢ set by the tribes being aggregated | `OPINION_EPSILON` ⇒ ⊥; self-voice note |
| 26 | §10.2 | External Commit "on behalf of" the joiner is impossible in RFC 9420; no MLS↔roster/device-log binding | Add+Welcome or joiner-built commit with gated GroupInfo; credential binding; Remove within one epoch |
| 27 | §11.2 | `hint_key = KDF(identity_id, epoch, device_id)` has no secret, so anyone can track presence | `locator_secret` shared only with contacts/tribes |
| 28 | §12.3 | "No key reuse" vs. one device key signing ~8 record types; no domain separation | SignWithLabel-style labels MUST; separate Steward keys SHOULD |
| 29 | many | 15+ stale cross-references (witness, fork-and-stick, sybilproofness, GPA, nullifiers, decay table, Beacon staking) | Fixed (`fb7c82a`) |

## Evidence corrections (numbers kept, interpretation withdrawn)

| Sim | Claim in v5 | What the code does | Status now |
|---|---|---|---|
| S2 (`run_s2`) | §5.2 parameters "exercised as defaults"; equilibrium 0.65 vs 1.0 "measured" | Scalar daily inflow `(1−λ)·U(0.5,1)`; mean 0.75 of target by construction; no §5.2 terms | Labels → "none"; equilibrium unmeasured (§5.2.6, §16 #8) |
| S5 (`s5_lure_case`) | "0% lure success at coverage 0.25"; ≥2 floor "adds no lure protection" | Lure weight ≤ 0.2, honest ≥ 0.6, so max lure coverage = 0.25 exactly; ≥2 does help at floors 0.10/0.15; sim's "ok" ignores the single-source display rule | Floor provisional; row 31 → Partial (C.6) |
| S6 (`run_s6`) | Small-tribe rule gives "0% wrongful at N ≥ 12" | Rule (b) evaluated at N=12/20, where the spec ships the baseline: 92% / 81% wrongful at 33% / 30% capture | Attribution corrected; row 10; §16 #10 |
| S7 (`run_s7`) | "Separates feuds perfectly"; 6.5/40.5/80.0% to 0.1%; "pre-registered" | Two Bernoulli draws: p² and 1−0.08² = 99.4%; threshold in the same script; no adversarial corroboration | Restated analytically (C.7) |
| C.1 | Ring containment is "the strongest pressure-test result" | Follows from the formula (no vantage term ⇒ ⊥) | Relabelled as an argument; overlap claim withdrawn |

## Open findings (recorded, not fixed in this pass)

Grouped by section. Each maps to a §16 item where one exists. Severity is the reviewer's, confirmed by
spot checks where marked ✓.

**Identity & devices (§3)**
- Device log has no head freshness bound or witnesses; a relay can serve a view omitting a RevocationEntry; "KT-style" overstates a per-identity hash chain (high ✓ in part) — §16 #16.
- Takeover notification travels via the Steward mailbox, which is in-band, droppable and floodable; no Monitor poll period (high).
- A single stolen device can cancel guardian recovery indefinitely; `recovery_policy` and `reason_code` are public via Search (med).
- State machine: probation→active by wall clock with no log entry; "SHOULD … or MUST within one epoch" teardown wording (med).
- Suite floor: no RAISE_SUITE_FLOOR operation; AND-verification of dual signatures not stated; no session-level floor; DeviceCertificate lacks `not_after` (med).

**Messaging & transport (§10–§11)**
- §10.2.1 "partition" cannot occur without an equivocating Steward; countersignature weight undefined; contradicts fork-and-stick permanence (high) — §16 #13.
- Fairness SLA gameable (stale/superseded commits; sequencer-asserted `received_at`) (med).
- No signed sequencer-rotation record or deterministic successor; `mls_epoch` name collides with protocol and RFC 9420 epochs (med).
- Tribe-less 1:1 pairs have no relay/mailbox/tier; tier-based relay shedding requires the relay to learn identities; direct-first hole punching leaks IP with no relay-only mode (med, judgment).
- Sync/sideload: carriers can withhold revocations; "current membership set" not a signed object; capability records unsigned/unbounded (med).
- Several Parameter tags lack defaults/evidence (`RELAY_BUDGET_BY_TIER`, `MAILBOX_MAX_*`, `MLS_SEQUENCER_LIVENESS_TIMEOUT`); one clock for tribe-less identities undefined (low).

**Crypto & conformance (§12–§13)**
- Noise pattern, prologue and static-key binding unspecified; hybrid "Noise_XX + ML-KEM-768" is not a standard pattern; the Double Ratchet's PQ status is absent; the HNDL claim covers transport only (high) — §16 #17.
- FROST (RFC 9591) not cited; DKG/resharing/key-continuity chain unspecified; one FROST signature vs `list<signature>` field (med).
- Merkle tree hash: RFC 9162 leaf/node domain separation not adopted; the BLAKE3 ≥256-bit rationale cites preimage, not collision, resistance (low).
- §13 claims "complete set of MUSTs" but omits several (§3.5 probation, §3.8, §10.4 push payload, §12.2/§12.3); no log-operator/guardian/DHT roles (med).

**Sparks (§7)**
- RSA-1 holder-binding PoP under a key known at authenticated issuance links tokens to members (high) — §16 #15.
- Budget time base inconsistent (per credential / per epoch / 30 days in A.7); credential valid 3 epochs vs registry kept 2 (high) — §16 #15.
- "At most one extra forward" assumes honest lag; N-relay replay amplification; unauthenticated Bloom gossip; `[RLN]` evidence misattributed (med).
- Continuous budget α·(R−0.10) fingerprints members; issuance→first-use timing correlation (med, judgment).
- A.7 terminology inverted ("non-superadditive"); "mathematically guaranteed" false near the gate; 30-day budget vs 24 h epoch (med).
- Onion routing asserted without a packet format; entry+exit collusion within tiny Steward sets; verifier hop undefined (med).
- No issuance record or per-identity uniqueness; k devices ⇒ k× budget; aggregate cap "defined in §4/§5" does not exist (med).

**Beacon (§8)**
- StatusRecord has no signer/authorization field (the reader check now requires one, but the record schema still lacks it); a single endorser self-retraction can levy penalties on co-endorsers (high, partially addressed).
- Steward majority can redact a retracted publication's authors or rationale to launder history (med).
- Status transition relation incomplete (retracted→reaffirmed after appeal, re-open, races); "unexercised appeal → reaffirmed" contradicts §6.4 (med).
- Seal signs only `bundle_hash‖publication_hash`; reader trust anchor for the tribe key at `sealed_epoch` undefined; no "unwitnessed" state in the report (med).
- `log_index` inside the endorsed body; no independence or self-endorsement rule for the k=3 endorsers (med, judgment).
- "Repeat self-retraction converges to the forced price" is false (1.0× vs 2.0×); 0.25×2.0 exceeds `PENALTY_CAP_PER_INCIDENT` (med).
- C2PA comparison inaccurate (C2PA has soft bindings and remote manifests); exact-byte BLAKE3 lookup breaks under transcoding (med).

**Federation (§9)**
- rᵢ(T) derivation undefined, so clients diverge (high) — §16 #14 (gap now stated in §9.4).
- Counter-dispute weaponizes blanket mutual damping; corroboration is manufacturable by sybil tribes (high) — §16 #14, row 43.
- Dispute "reputation-weighted, rate-limited, staking" defenses have no fields, slash rule or parameters, yet are counted in §9.9 and row 28 (high).
- §9.5: "γ ≤ 0.3 and ≥ 2 bridges independently collapse the leak" contradicted by C.2 (leak ≈ 0.49γ); "independent bridge" undefined (med).
- Vertex "same shape validated" overstated (PPR normalizes out-flow; HEARTH's composite is unnormalized, so a tribe can cite everyone at 1.0) (med).
- Display-rule precedence (single-source vs weak vs shown) contradicts itself in places (med).
- No MUST NOT on exporting signed composites or shipping default vantage/anchor sets (Bluesky default-labeler outcome) (med, judgment).
- `CITATION_HALFLIFE` "deployment-tunable" yet reader-computed; whitewashing via new tribes/schism absent from §9.9 (med).
- App B example omits coverage/single-source/decay; C.6/C.7 lack `[sim: …]` labels, seeds and CIs (low).

## Not changed, deliberately

- **Frozen files** (v1–v4 specs, v1 critique, old sims and results) — untouched, per AGENTS.md.
- **Simulation code and results** — the sims were not re-run or modified. Corrections are in the spec's
  interpretation only. Re-running S2 with §5.2 implemented, extending S6 to a smooth quorum curve, and an
  adversarial S5/S7 are the next evidence work (§16 #8, #10, #14).
- **Parameter values** — no constant was retuned. Every new parameter is `provisional, evidence: none`.
- **Anti-goals** — no change introduces a token, a global score, or a mandatory central service.

## Follow-up: S8 Ember-mechanics simulation (2026-10-07)

This addresses open question §16 item 8. `hearth_v5_ember_sim.py`, its tests and results are committed. Written
up in Appendix A.10.

- **Finding: §5.2.2's `δ^⌊c⌋` is falsified.** Its counter decays at the 90-day half-life. The result is that
  frequent honest interaction earns ~0 per relationship, a pair's value drops sharply between 92 and 89 days,
  and tribe-wide standing *falls* as interaction rises (10.9 → 2.1 `BASE_UNIT`s from 0.25 to 2 interactions/day).
  It also lets four colluders hold Steward-eligible standing by issuing each other once a quarter.
- **Disposition: replaced by `1/(1+c)`.** The new rule is monotone and cliff-free, caps each relationship at about
  1 `BASE_UNIT`, and cuts the colluding-pair ceiling from 34% to 8% of the calibrated target. It ships as a
  provisional post-simulation amendment. `BASE_UNIT` reference value: 0.08.
- **Still open:** heterogeneous tribes (the model's uniform degree makes its tier distribution meaningless),
  newcomer time-to-Member, multi-member cliques, and real `B_E` defaults.
