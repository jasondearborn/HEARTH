# HEARTH Protocol — Specification v5

**HEARTH**: *Human-Endorsed Authenticated Relay & Transfer Hub*

A peer-to-peer communication, content-distribution, and **publication** standard for **tribes** — small,
bridgeable communities of people who vouch for each other. Trust is earned through human vouching,
accountability flows back to the vouchers, and a tribe's public reputation is a *signal carried by the
federation of tribes*, never a verdict on truth. This is the first version of the spec written as a
**normative functional specification**: it defines protocol behavior, data structures at field level, state
machines, and cryptographic primitives, using BCP-14 key words throughout, rather than the narrative product-
description style of v1–v4.

> **Changes from v4:** a ground-up **normative rewrite** in BCP-14 style, with explicit record definitions,
> field-level schemas, and state machines for every mechanism. New mechanisms: a Key-Transparency-style
> append-only **device log** with Search/Update/Monitor roles (§3); explicit **Ember issuance mechanics**
> closing the v1-critique's reputation-conservation gap (§5.2); **voucher independence** with a **connectivity
> discount** against collusion clusters (§4.5–§4.6); a **retaliation discount** on complaints (§6.2); a
> **small-tribe quorum** rule for tribes under 12 members (§6.3); **graduated Beacon retraction** with a
> cheaper self-retraction path (§8.4); **witness cosigning** of every log head (§5.6, §8.2); a rotating,
> quorum-countersigned **sequencer-Steward** for MLS group messaging (§10.2); **epoch-scoped nullifiers** for
> Sparks (§7.5); **mandatory dispute rationale** in the Federation (§9.1); and defined **schism semantics**
> for both tribes (§4.11) and Stewards (§15.4). Seven new agent-based simulations (S1–S7, Appendices A/C)
> pressure-tested these mechanisms — two **overturned a locked draft decision**: S1 found the independence
> rule's hard-block variant blocks ~47% of honest admissions and 100% of socially-close honest pairs, so it
> shipped as an escalation form instead (§4.5); S5 found the v4-locked "≥2 distinct opining tribes" floor
> 100%-suppresses genuine single-source Federation opinions with no added lure-attack protection, so it was
> dropped in favor of the coverage floor alone plus a single-source display form (§9.4). A third (S7, feud-
> damping corroboration) came back with the rule working only at high federation corroboration density, and
> is **deferred** rather than shipped (§9.6, §16). One honest correction: v1–v4's suggestion that Spark
> traffic could "run over Tor" against a global passive adversary is **withdrawn** — Tor does not defeat that
> adversary either, and the spec now says so plainly (§7.8).

---

## 0. Status, conventions, terminology, actors & roles

### 0.1 Status of this document

This is version 5 of the HEARTH protocol specification: a **normative functional specification**. It
defines protocol behavior, data structures (at field level), state machines, and cryptographic
primitives, but not byte-level wire encodings; a companion encoding specification is future work
(§16). Versions 1–4 and their critiques remain in the repository as design history; Appendix E
summarizes the evolution.

### 0.2 Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

Non-normative material appears in subsections titled *Honest limitations*, in *Rationale* notes, and
in the appendices. These are deliberate: HEARTH's design tradition is to state what a mechanism does
**not** achieve next to what it does.

Protocol constants are tagged inline as `(Parameter: NAME, default, status, evidence)` and compiled in
Appendix D. Status is one of: **sim-backed** (calibrated against the simulations in Appendices A–B),
**provisional** (reasoned default, not yet simulated), or **deployment-tunable** (a per-tribe or
per-implementation choice within a stated safe range).

### 0.3 Terminology

- **Hearthstone (root identity):** the long-lived root keypair that is a person's pseudonymous address
  and the anchor of all reputation (§3).
- **Device key / device certificate:** a per-device subkey certified by the root (§3).
- **Tribe:** a community of at most ~150 active members with its own reputation graph, admission
  process, Steward set, and seal (§4).
- **Ember:** the non-transferable, decaying reputation credential earned within a tribe (§5).
- **Vouch:** a staked, in-person-first endorsement admitting a new member; vouchers share liability
  for the vouchee's conduct (§4, §6).
- **Tier:** the discrete standing ladder — Stranger, Member, Trusted, Steward-eligible (§4.2).
- **Steward:** a Trusted-tier-plus member elected to the tribe's operational quorum: threshold-signing
  checkpoints and seals, relaying, sequencing MLS commits, serving mailboxes and mirrors (§4, §10, §11).
- **Epoch:** the reputation-checkpoint period (§2.4); the protocol's unit of time for credential
  freshness, nullifier scoping, budgets, and rate limits.
- **Checkpoint:** the Merkle-log entry, majority-threshold-signed by the Steward set, committing to
  every member's reputation value and tier for an epoch (§5).
- **Spark:** an anonymous, rate-limited, single-spend distribution credential (§7).
- **Beacon:** a tribe's public, verifiable publication log (§8).
- **Federation:** the inter-tribe citation/dispute layer and the personalized composite computed from
  a reader's own affiliations (§9).
- **Witness:** an external party (typically a bridge-partner tribe's Steward) that cosigns log
  checkpoints to prevent equivocation (§5.4).
- **Fork-and-stick:** the client rule of permanently rejecting both views upon observing inconsistent
  signed log heads (§3.5).

### 0.4 Actors and conformance roles

| Role | Description | Conformance section |
|---|---|---|
| Client | Software acting for a member (all devices) | §13.1 |
| Steward relay | Volunteer relay/sequencer/mailbox/monitor operated by a Steward | §13.2 |
| Mirror | Any host serving Beacon artifacts and records | §13.3 |
| Witness | External checkpoint cosigner | §13.4 |
| Reader / Verifier | Any party, member or not, verifying Beacon or Federation records | §13.5 |

---

## 1. Design thesis, goals & non-goals

### 1.1 Thesis

HEARTH is explicitly **anti-global-scale**: a reputation system with decay cannot and should not span
the planet. It is built for **tribes** — Dunbar-sized groups bound by mutual human vouching, optionally
bridged, loosely federated. Three primitives carry the design:

1. **The Ember** — a non-transferable, decaying reputation credential earned by good-faith
   participation and lost through bad behavior or by vouching for bad actors.
2. **Vouching with skin in the game** — admission requires at least two independent members staking
   their own standing on the newcomer's conduct; misconduct propagates penalties back up the vouch
   chain, decaying with distance.
3. **Reputation as a signal, never a verdict** — internally it gates membership and throughput; on the
   Beacon it provides verifiable provenance; across the Federation it produces a per-reader signal. At
   no layer does the protocol certify that content is *true*.

The sybil-economics stance combines two defense classes deliberately: an **admission gate**
(vouching, the detect-and-punish family) and **valuelessness-by-construction** (a split or fake
identity earns near-zero throughput because budgets scale with earned standing — the pattern validated
by Circles [CIRCLES]). §4.8 states the resulting sybilproofness argument explicitly.

### 1.2 Goals

1. End-to-end encrypted communication and content transfer, secure against third-party interception.
2. A fully open standard and reference implementation.
3. First-class mobile and desktop support; one identity across a person's devices, recoverable on loss.
4. Prosocial tribal use: personal communication, intra-community sharing, sender-unlinkable
   one-to-many distribution, and publicly-verifiable attributed publication.
5. Structural disincentives against automated and industrial-scale abuse, enforced through vouching
   accountability — the marginal cost of abuse approaches the marginal cost of genuine participation.
6. Pseudonymity by default, with an earned, decaying reputation layer; anonymous intra-tribe
   distribution and attributed public publication as distinct modes.
7. A verifiably novel architecture (§1.4).

### 1.3 Non-goals

- **Not an arbiter of truth.** The Federation surfaces who vetted what and how the reader's own tribes
  regard them; it never ranks content by correctness. Epistemic divergence between tribes is expected
  and preserved. This stance has shipped precedent: C2PA asserts provenance while explicitly declining
  value judgments [C2PA].
- **Not global-scale; not a cryptocurrency; no token.** Financialization is what lets capital buy scale.
- **Not strong anonymity against a global passive adversary** (§7.6), and **not marketed** for
  journalists, activists, or whistleblowers.
- **Not a broadcast platform or CDN.** The Beacon is pull-based published artifacts.
- **Not continuous personhood verification.** HEARTH verifies humanity at admission via vouching; it
  does not re-verify. Post-admission identity rental is a named residual risk (§14).

### 1.4 Novelty and the prior-art base rate (honest framing)

No deployed system combines staked multi-hop vouch liability, decaying reputation with issuance
mechanics, anonymous rate-limited distribution credentials, staked retractable publication, and
vantage-personalized federation. The nearest precedents are each one layer of HEARTH: Proof of
Humanity's single-hop binary voucher removal [POH], Circles' valueless-sybil economics [CIRCLES],
Privacy Pass/ARC rate-limited tokens [ARC], Bluesky's composable labelers [BSKY-MOD], Sigsum's witness
cosigning [SIGSUM]. Novelty cuts both ways, and the spec says so: **every strict vouch-gated network
surveyed has stayed niche** (0-for-5 among direct comparables [R1]); HEARTH's differing bet is that a
tribe is useful to *itself* from day one — utility is tribe-scoped, so the network-effect cold-start
applies per-community, not globally — and that 1:1 use requires no tribe at all (§10.1). This is the
design's riskiest untested assumption and is tracked in §16.

---

## 2. Architecture overview

### 2.1 Layers

| Layer | Sections | Trust anchor |
|---|---|---|
| Identity & devices | §3 | Root key + device log |
| Tribe membership & reputation | §4–§6 | Steward majority-threshold checkpoint + witnesses |
| Distribution (anonymous) | §7 | Spark credentials + epoch nullifier registry |
| Publication (attributed, public) | §8 | Tribe seal + publication log + witnesses |
| Federation (inter-tribe) | §9 | Signed citation/dispute records, client-side composite |
| Messaging & sync | §10 | MLS group state + capability-scoped sync |
| Transport | §11 | Noise sessions; relays see ciphertext only |

### 2.2 One log design, used three times

HEARTH uses a single verifiable-log construction — a Merkle append-only log with signed heads,
inclusion and consistency proofs [RFC9162] — in three places:

1. the **device log** (per identity; binds a root to its current device-certificate set, §3),
2. the **tribe checkpoint log** (per tribe; reputation values and tiers per epoch, §5),
3. the **Beacon publication log** (per tribe; publications and status transitions, §8).

Equivocation resistance never relies on emergent gossip — Certificate Transparency's twelve-year
lesson is that specified-but-optional gossip does not get deployed [CT-GOSSIP]. Instead HEARTH
mandates, at each log: (a) **majority-threshold signatures** over log heads where a Steward set signs
(a bare k-of-n below majority allows a Steward subset to fork views [KEYTRANS]); (b) **witness
cosigning** of tribe-level log heads by external witnesses drawn from bridge-partner tribes [SIGSUM];
and (c) the client-side **fork-and-stick** rule (§3.5) as the zero-infrastructure last line.

### 2.3 Record model

Every protocol object is a signed record: `{ type, version, tribe or identity scope, epoch, body,
signature(s) }`, hash-addressed by BLAKE3 and referencing other records by hash. Records are
append-only; correction is a new record referencing its predecessor (status records, tombstones §8.5),
never an edit.

### 2.4 The epoch

The **epoch** is the tribe's checkpoint period. `(Parameter: EPOCH_LEN, default 24 h, provisional,
§5.4)`. One clock for everything: checkpoint publication, tier-credential freshness, Spark budget
refresh and nullifier scoping (§7), complaint and vouch rate-limits (§4–§6). A protocol with one epoch
has one staleness story; mechanisms MUST NOT invent private cadences.

---

## 3. Identity & devices

### 3.0 Scope and model

A HEARTH identity is two-layered: a **root identity** ("Hearthstone") that is the durable pseudonymous
address and the anchor to which all reputation binds, and a set of **device subkeys** enrolled under that
root. This section replaces v4 §2 and hardens it with an IETF Key Transparency (KT)-pattern append-only
device log [KEYTRANS], so that "which devices currently speak for this identity" is itself a verifiable,
equivocation-resistant object rather than an informally-gossiped list.

A root identity MUST have exactly one device log. A device log entry MUST be reachable only through the
Search/Update/Monitor roles defined in §3.2. Reputation (§5), tribe membership (§4), and all credentials
issued to a person (§5's TierCredential, §7's SparkCredential) bind to `identity_id`, never to a
`device_id` — enrolling or revoking a device MUST NOT itself change reputation.

### 3.1 Records

**IdentityRecord**

| Field | Type | Description |
|---|---|---|
| identity_id | identifier | Stable pseudonymous address, derived from the root key material. The anchor reputation (§5) binds to. |
| root_key_material | enum {single public key, FROST threshold public key} | The root verification key(s); a threshold (M-of-N) key when hardened mode (§3.6) is in effect. |
| suite_floor | enum (suite version tag) | Minimum cryptographic suite version this identity's records commit to (§12.2). Monotonically non-decreasing — MUST NOT be lowered by any subsequent record. |
| recovery_policy | GuardianPolicy \| null | Social-recovery configuration (§3.7); null if recovery is disabled for this identity. |
| creation_epoch | epoch | Protocol epoch (§2) of identity creation. |
| log_head | hash | Current head of this identity's device log (§3.2). |

**DeviceCertificate**

| Field | Type | Description |
|---|---|---|
| device_id | identifier | Public identifier of the device subkey. |
| device_public_key | public key | Device signing (and, where applicable, KEM) key material per the suite registry (§12.1). |
| identity_id | identifier | The root identity this device is certified under. |
| issuing_authority | enum {root, device-quorum, guardian-quorum} | Which authority produced the certifying signature (§3.4, §3.7). |
| certifying_signature | signature | Signature over the rest of this record by the issuing authority. |
| issued_epoch | epoch | Epoch of issuance. |
| status | enum {probation, active, revoked} | Current lifecycle state (§3.4). |
| suite_profile | enum | Which cryptographic suite version this device key uses — classical, PQ-hybrid transitional, etc. (§12.1, §3.8). |

**DeviceLogEntry** (one append-only, Merkle-linked log per identity; the KT "label" is `identity_id`)

| Field | Type | Description |
|---|---|---|
| identity_id | identifier | The log this entry belongs to. |
| version | uint | Monotonically increasing sequence number within this identity's log. |
| operation | enum {ADD_DEVICE, REVOKE_DEVICE, ROTATE_ROOT, UPDATE_RECOVERY_POLICY} | The operation recorded. |
| payload | DeviceCertificate \| RevocationEntry \| record | Operation-specific payload. |
| prior_entry_hash | hash | Hash of the immediately preceding entry — the append-only chain link. |
| authorizing_signature(s) | signature \| list<signature> | Signature(s) satisfying the operation's authorization policy (§3.4). |

**RevocationEntry**

| Field | Type | Description |
|---|---|---|
| device_id | identifier | The device being revoked. |
| reason_code | enum {theft, planned-rotation, voluntary, compromise-suspected} | Machine-readable reason. |
| revoked_epoch | epoch | Epoch of revocation. |
| authorizing_signature(s) | signature \| list<signature> | Root, device-quorum, or guardian-quorum signature(s) authorizing the revocation. |

**GuardianPolicy**

| Field | Type | Description |
|---|---|---|
| guardians | list<identifier> | Guardian identities eligible to co-sign a recovery (§3.7). |
| threshold | uint | M — guardian signatures required to authorize recovery. |
| time_lock | duration | Minimum delay between a recovery request being posted and it taking effect. |
| notify_set | list<device_id> | Devices that MUST receive out-of-band notification when a recovery request is posted. |

### 3.2 Device log roles: Search, Update, Monitor

The device log adopts the KT role split verbatim [KEYTRANS], [KEYTRANS-PROTO]:

- **Search** — any party (a peer establishing a session, a Steward relay, a tribe member verifying a
  vouch) MAY query "what is `identity_id`'s current device set at version V / at epoch E," and MUST
  receive both an **inclusion proof** (this entry is in the log) and a **consistency proof** (this log
  state is an append-only extension of any earlier state the querying party previously observed).
- **Update** — appending a new `DeviceLogEntry` requires an `authorizing_signature` set that satisfies
  the operation's policy (§3.4): root signature, or a device-quorum, or a guardian-quorum per
  `GuardianPolicy`. A Steward relay or any other third party MUST NOT be able to author a valid Update on
  its own signature alone.
- **Monitor** — the root identity (via any of its enrolled, active devices) MUST periodically re-fetch
  its own log's recent tail and verify it is consistent with the last state that device observed. This is
  KT's "contact monitoring": cheap, requires no third party, and catches unauthorized Updates (a
  compromised guardian quorum, a coerced device) as soon as any honest device checks in. A tribe or a
  bridge-partner tribe's Stewards MAY additionally offer a third-party auditing service over member device
  logs (KT's "third-party auditing" mode); this is OPTIONAL and RECOMMENDED for Steward-eligible
  identities specifically, given the outsized damage of a Steward identity takeover.

### 3.3 Passkeys and device key material

A device key SHOULD be a platform passkey (WebAuthn/FIDO2) held in a secure enclave or TPM and unlocked
by biometric or local PIN; the private key MUST NOT leave hardware in cleartext.

- **Consumer default:** platform-synced passkeys (vendor keychain sync) for low-friction cross-device
  portability. Implementers MUST disclose that this trusts the platform vendor's sync security; it is a
  usability/security tradeoff, not a protocol weakness.
- **Hardened mode:** a threshold root (§3.6) with no cloud-synced key material, RECOMMENDED default for
  Steward-eligible identities (§4) and any identity carrying reputation the holder judges high-value.

### 3.4 Fork-and-stick rule (defined once; referenced from §5, §8, §10)

Every append-only log in HEARTH (the device log of this section; the reputation CheckpointRecord log,
§5; the Beacon PublicationRecord log, §8) is a Merkle append-only log with periodically signed heads. All
three reuse the same equivocation defense, defined once here:

> **Fork-and-stick.** A client that is presented two views of the same log that are mutually inconsistent
> at the same version or checkpoint — i.e., they do not extend a common prior state, or they claim
> different values at the same version number — MUST reject **both** as canonical going forward, MUST
> cease relying on that log instance for any authorization decision (session establishment, admission,
> reputation lookup, publication-status check), and MUST raise a durable, visible alarm (to the
> identity's other enrolled devices for a device log; to the tribe's members for a checkpoint or Beacon
> log). This state is permanent per log-instance-and-client; it is not cleared by a subsequent consistent
> view, only by an out-of-band resolution process (§16).

Fork-and-stick requires no gossip infrastructure and no third-party auditor to be effective — it is a
purely client-local rule. It is the primary defense against split-view equivocation, chosen deliberately
over relying on emergent peer gossip, which real transparency-log deployments show does not materialize
organically even when specified (Certificate Transparency's gossip layer was specified in 2013 and has
never been deployed at scale) [CT-GOSSIP]. Where a log additionally has witness cosigners (§5.3, §8.2),
witness cosigning and fork-and-stick compose as two independent layers of the same defense.

### 3.5 Enrollment and revocation state machine

A device certificate's `status` field MUST transition only along this state machine:

```
(none) --Update:ADD_DEVICE--> probation --time elapses, no revocation--> active --Update:REVOKE_DEVICE--> revoked
```

- **enrolled → probation.** An existing active device signs the new device's `DeviceCertificate` (in
  person: scan QR / short code; remotely: an authenticated out-of-band channel). The `Update` is appended
  to the device log with `status = probation`. Enrollment and rotation events MUST trigger an
  out-of-band notification to every other enrolled device (mailbox delivery mechanism specified in §10).
- **probation.** During probation (Parameter: `DEVICE_PROBATION_DURATION`, default 3 protocol epochs
  [§2, 24 h/epoch] = 72 h, status: provisional, evidence: no dedicated sim — carried at v4's qualitative
  "rate-limited probation" intent, R1 identity-rental discussion), the device MUST be rate-limited on
  high-value actions: it MUST NOT issue Embers (§5), vouch (§4), mint Sparks (§7), or exercise Steward
  duties, and other actions it originates SHOULD be flagged to counterparties as "from a probationary
  device" until probation ends. A revocation raised against a probationary device during its window MUST
  immediately void it — no grace period.
- **probation → active.** After `DEVICE_PROBATION_DURATION` elapses with no revocation and no
  fork-and-stick alarm raised against the identity's log, the device transitions to `active` with full
  capability.
- **active → revoked.** Any of: root signature, a device-quorum meeting the identity's authorization
  policy, or a guardian-quorum per `GuardianPolicy` (§3.7) appends a `RevocationEntry`. A verifying party
  MUST treat a device as revoked as soon as it observes the `RevocationEntry` via Search or Monitor, and
  MUST refuse new sessions from a revoked device key. Sessions already established SHOULD be torn down on
  next re-key or MUST be torn down within one epoch.
- **Containment invariant:** compromise of a single device MUST leak only that device's subkey and its
  local Argon2id-protected at-rest store (§12.1) — never the root key material, never the ability to
  author a valid `Update` unilaterally (unless the identity has configured a single-device authorization
  policy, which is NOT RECOMMENDED and MUST be flagged to the user as reduced security).

### 3.6 Threshold root

An identity MAY configure `root_key_material` as an M-of-N FROST threshold key (Parameter:
`THRESHOLD_ROOT_DEFAULT`, default 2-of-3 for hardened-mode identities and Steward-eligible identities,
status: deployment-tunable, evidence: carried from v4 §2.5 qualitative default, no sim assigned) rather
than a single key. Stealing one share of a threshold root MUST NOT be sufficient to author a valid root
signature, add a device, or rotate the root. Threshold participants are themselves devices/holders under
the identity; FROST signing details are in §12.1/§12.3.

### 3.7 Social recovery

A tribe-based social-recovery path is available whenever `recovery_policy` is set. A guardian-quorum
recovery request MUST: (a) name a proposed new root or device set; (b) be signed by ≥ `threshold` of the
`guardians`; (c) be held for ≥ `time_lock` before taking effect (Parameter: `RECOVERY_TIME_LOCK`, default
7 protocol epochs, status: provisional, evidence: v4 §2.5 qualitative, no sim assigned); (d) trigger
out-of-band notification to every device in `notify_set`, specifically so a malicious recovery attempt is
visible and vetoable by the legitimate owner during the time-lock window. A device or the root MAY
cancel a pending recovery request during the time-lock by counter-signing a cancellation, which MUST take
priority over the pending request. On successful recovery, the identity enters a reputation-neutral
**post-recovery probation** (same mechanism as §3.5's device probation, applied identity-wide) rather
than an instant full-standing handoff.

### 3.8 Takeover detection

Enrollment, root rotation, and recovery events MUST notify all existing enrolled devices out-of-band
(§10 mailbox delivery). Newly-enrolled devices always serve the §3.5 probation window regardless of
enrollment path. There is no notification suppression mode — an implementation MUST NOT offer a "silent
enrollment" option, since that would defeat the primary detection mechanism for a coerced or stolen-device
enrollment.

### 3.9 Post-quantum sequencing (locked plan)

PQ migration for identity is sequenced, not simultaneous, and the sequencing is itself normative:

1. **Transport/KEM first.** Hybrid X25519+ML-KEM key agreement is used in the Noise and MLS suites now
   (§12.1) — this protects session confidentiality against a future "harvest now, decrypt later" adversary
   immediately, independent of identity-key PQ status.
2. **New roots MAY be dual-signature Ed25519+ML-DSA.** Device certificates get PQ suites first, because
   they are short-lived and cheap to reissue (§3.5's probation/rotation machinery already handles frequent
   device churn); root keys migrate more conservatively (step 3).
3. **The existing root-rotation mechanism is the PQ migration vehicle.** A root rotates to a dual-sig
   Ed25519+ML-DSA root using the ordinary §3.5/§3.6 time-locked, multi-device-confirmed rotation path,
   with a **continuity attestation**: the new root's first `DeviceLogEntry` (`ROTATE_ROOT`) MUST reference
   and be cross-signed against the old root's terminal log entry, so reputation (§5) and tribe membership
   (§4) continuity is preserved through the rotation rather than requiring re-admission.
4. **Monotonic suite floor.** Every record carries (or inherits from its `IdentityRecord`) a minimum-suite
   floor that can only ratchet upward (§3.1, §12.2) — this is the downgrade-protection mechanism: an
   attacker who compromises a future weaker suite cannot force a HEARTH identity's records back below a
   floor it has already crossed.
5. **PQ anonymous credentials are explicitly deferred**, cross-referenced to §7/§12: current PQ-secure
   anonymous-credential constructions (e.g. zkDilithium-based) measure 85–175 KB per token and 0.3–5 s
   generation time [PQ-ANON-CF] — unusable at Spark scale (§7, where a token is attached per content
   chunk). Sparks will require a dedicated suite migration when PQ anonymous credentials mature; this is
   named plainly rather than implied solved.

### 3.10 Holder binding

Credentials that prove a fact about an identity without revealing which member (TierCredential, §5;
SparkCredential, §7; bridge/endorser proofs, §4/§8) SHOULD be bound to the presenting device's secret key
(holder binding, [HOLDER-BIND]) so that a credential cannot be lent or copied to another device/person
without also handing over live control of that device's key material. This raises the cost of credential
lending; it does not eliminate it (§3.11).

### 3.11 Honest limitations

- **Identity rental is not solved, only raised in cost.** Research on gig-economy account rental suggests
  25–33% of gig workers rent accounts to others [R1-GIG]. Passkey/enclave device binding plus holder-binding
  credentials (§3.10) stop a *credential* from being lent independently of its device, but they do not stop
  someone from handing over an entire enrolled device, or completing admission (§4) themselves and then
  operating the identity on another person's behalf indefinitely. HEARTH verifies personhood at admission
  and at each device-enrollment event; it does not — and cannot, without invasive continuous biometric
  surveillance the project rejects on privacy grounds — verify that the same person is behind the keyboard
  on every subsequent action. This is a **named, accepted limitation**, not a solved problem; it is carried
  into the threat model (§14).
- **Contact monitoring only protects what is actively monitored.** An identity that never opens any
  device for an extended period does not self-monitor during that window; an unauthorized Update could
  persist undetected until the owner returns (mitigated, not eliminated, by §3.8's mandatory notification
  and by dormancy handling in §4).
- **Threshold root and guardian recovery both trade convenience for resilience** — a lost device *and* a
  lost/uncooperative guardian quorum simultaneously has no recovery path in this spec; this is a
  deliberate refusal to add a bypass that would also be a takeover vector, but it means data loss is
  possible in the worst case, and implementers should say so to users plainly.

---

## 4. Tribes & membership

### 4.1 What a tribe is

A tribe is a small (target ≤ ~150 active members), self-governing reputation graph anchored by a threshold-signed **tribe seal** (FROST, §12). Tribes are **bridgeable** — a root identity (§3) may hold membership and standing in several tribes simultaneously (§4.9) — and **federated** — tribes cite and dispute one another as collective actors (§9). A tribe is not global; it does not aspire to be.

**Anchors.** Every tribe has a founding member set, the **Anchors**, designated once at tribe genesis and recorded in the tribe's genesis record (the tribe's first CheckpointRecord, §5.5, epoch 0). Anchors exist to solve the bootstrap problem: a brand-new tribe has no existing Member-tier population to satisfy the ≥2-voucher admission rule (§4.3), so the genesis record instead lists the Anchor set directly, each Anchor entering at an initial reputation value set by tribe policy (Parameter: `ANCHOR_INITIAL_REPUTATION`, default 0.50 (Trusted-tier floor plus margin), status: provisional, evidence: none — deployment-tunable per tribe). Anchors participate in ordinary Ember issuance, vouching, and decay exactly like any other member from epoch 1 onward; the genesis exemption is a one-time bootstrap, not a standing privilege. Anchors are exempt from transitive penalty propagation (§6.6) — they founded the tribe and did not vouch anyone in, so there is no vouch edge to propagate penalty across; an Anchor who later vouches someone in is liable for that vouch exactly like any other voucher. The Anchor set is also the seed of the **elder set** used by the connectivity discount (§4.6).

**Tribe genesis is itself a governance act** requiring ≥2 founding co-signers under whatever key material the founders choose to hold the eventual seal (cross-ref §15 for the general governance/Steward-election machinery; out of scope here beyond noting the genesis record's existence).

### 4.2 Tier ladder (normative)

Tier is a function of a member's **effective reputation** in a specific tribe (computed per §5.1) as published in that tribe's latest CheckpointRecord (§5.5) — never a live, locally-recomputed value. A member's tier can therefore differ from what their own client would compute between checkpoints; the checkpoint is authoritative, and disagreement is handled via the dispute path (§5.5.3).

| Tier | Threshold (effective reputation R) | May vouch (§4.3) | May endorse (Beacon, §8) | Complaint weight (§6.1) | Spark budget class (§7) | Steward-eligible (§15) |
|---|---|---|---|---|---|---|
| **Stranger** | R < 0.10 | No | No | weight = R (uncapped below cap; typically small) | None — no Spark minting | No |
| **Member** | 0.10 ≤ R < 0.40 | Yes | No | weight = min(R, 0.10) | Base class | No |
| **Trusted** | 0.40 ≤ R < 0.75 | Yes | Yes (endorsement-quorum eligible) | weight = min(R, 0.10) | Elevated class | No |
| **Steward-eligible** | R ≥ 0.75 | Yes | Yes | weight = min(R, 0.10) | Elevated class | Yes, subject to §15 election |

(Parameter: `TIER_MEMBER`, default 0.10, status: sim-backed, evidence: Appendix A (carried, previously only present in v3/v4 sim code, now normative). Parameter: `TIER_TRUSTED`, default 0.40, status: sim-backed, evidence: Appendix A. Parameter: `TIER_STEWARD_ELIGIBLE`, default 0.75, status: sim-backed, evidence: Appendix A.)

Enrollment in a tribe's roster (successful AdmissionRecord, §4.4) is distinct from tier: a freshly-admitted member enters the roster but starts at low or zero effective reputation and is therefore **Stranger tier** until Embers accrue (§5.2) — consistent with the sybil-farm timing in §6.8. Stranger-tier members who are roster-enrolled retain the right to hold 1:1 contacts (§4.8, which needs no tribe at all), receive Embers, and read tribe state (§10); they cannot exercise trust-conferring rights until crossing 0.10.

Complaint eligibility (as complainant) is **not** gated by tier — any roster-enrolled member who directly interacted with the target may file (§6.1); only the *weight* their complaint carries scales with the table above.

### 4.3 Admission requires ≥2 independent vouchers

A prospective member is admitted to a tribe when ≥2 existing Member-tier-or-above members of that tribe vouch for them, subject to the independence rule (§4.5) and the connectivity discount (§4.6) on each voucher's weight, and subject to the per-voucher issuance budget below.

**VouchRecord**

| Field | Type | Description |
|---|---|---|
| voucher | identifier | Root identity of the vouching member (§3 IdentityRecord) |
| vouchee | identifier | Root identity of the prospective member |
| tribe | identifier | Tribe context |
| epoch | epoch | Epoch of vouching |
| proximity_challenge_ref | hash | Reference to the ProximityChallenge (§4.4) this vouch attests |
| linkage_weight | decimal | Initial stake weight (decays per §4.7) |
| signature | signature | Voucher's device-key signature over the above |

**Issuance budget.** Admission vouching is a higher-stakes, lower-frequency action than ordinary Ember issuance (§5.2) and is budgeted separately, over a rolling window rather than the 24 h protocol epoch: a member may issue at most `B_VOUCH` admission vouches per rolling `VOUCH_WINDOW`-epoch window. (Parameter: `B_VOUCH`, default 2, status: sim-backed, evidence: Appendix A.4, carried v3/v4 as "2 vouches per member per 30-day epoch," re-expressed here against a rolling ~30-epoch window because v5 unifies all epochs to the 24 h reputation-checkpoint epoch, §2. Parameter: `VOUCH_WINDOW`, default 30 epochs (~30 days), status: sim-backed, evidence: Appendix A.4.) This bounds sybil-farm throughput per compromised Member-tier account (§6.8) independent of how many hours per day the account is active.

### 4.4 The proximity QR challenge and the AdmissionRecord

Vouching is **in-person-first**. The mechanism:

**ProximityChallenge**

| Field | Type | Description |
|---|---|---|
| challenge_nonce | identifier | Fresh random nonce |
| vouchee | identifier | Prospective member's root identity |
| tribe | identifier | Target tribe |
| generated_at | epoch | Timestamp of generation |
| expiry | epoch | `generated_at + Δt` |
| signature | signature | Vouchee's device-key signature over the above |

The vouchee's device generates and signs a ProximityChallenge, rendered as a QR code. A prospective voucher scans it — the optical scan is the proximity proof, requiring physical co-presence with the vouchee's screen; there is no network-transmitted equivalent. (Parameter: `PROXIMITY_EXPIRY`, default 10 minutes, status: provisional, evidence: none, deployment-tunable — tight enough that forwarding the QR image to a remote confederate rather than scanning it in person is impractical for most attackers, though not impossible; this residual risk is named in §4.13 and is the same class of risk as D1's named identity-rental limitation, §3.)

Within `expiry`, the scanning member's device signs a VouchRecord over `{challenge_nonce, vouchee, voucher, tribe, timestamp}`. A conforming client MUST reject a VouchRecord whose referenced ProximityChallenge has expired.

**AdmissionRecord**

| Field | Type | Description |
|---|---|---|
| vouchee | identifier | |
| tribe | identifier | |
| epoch | epoch | Epoch of admission |
| vouches | list&lt;VouchRecord&gt; | ≥2, meeting §4.5 independence and §4.6 connectivity discount |
| bridge_attestations | list&lt;BridgeAttestation&gt; | Optional, §4.9 |
| admitted_at | epoch | |

An AdmissionRecord is submitted to the tribe's Steward sequencer (§10) for inclusion in tribe state and reflected in the next CheckpointRecord (§5.5). A Steward relay MUST reject an AdmissionRecord whose vouches fail §4.5 or whose combined discounted weight (§4.6) falls below the admission floor.

### 4.5 Voucher-independence rule (normative, escalation form)

The ≥2 vouchers for a given AdmissionRecord are checked for independence. Let the tribe's vouch graph be the undirected graph over voucher→vouchee edges. For any two proposed vouchers V₁, V₂, the **independence check** is:

(a) **Hop independence.** V₁ and V₂ are not connected by a path of length ≤ h in the vouch graph (this excludes both "V₁ vouched for V₂ or vice versa" and "V₁ and V₂ share a common vouch-neighbor"). (Parameter: `VOUCH_INDEPENDENCE_HOPS` (h), default 2, status: sim-backed, evidence: Appendix A.5 (S1).)

(b) **Admitting-set independence.** The set of members who originally vouched V₁ into the tribe is not identical to the set of members who originally vouched V₂ in. This targets the documented "duplicate groups" attack [BRIGHTID], where two colluding clusters mirror each other's vouch structure closely enough to individually satisfy any per-edge rule.

**Why this is an escalation rule, not a hard block.** Simulation (Appendix A.5) showed both faces of a hard-block variant: it eliminates colluding-cluster sybil admission (0–3 sybils/90 d admitted versus 8–24 under the baseline ≥2-voucher rule alone) — and it blocks **100% of admissions vouched by socially-close honest pairs and ~47% of all organic honest admissions** in a realistic small-world topology, because real friends routinely share a voucher. A hard block would trade the sybil problem for the Humanity-DAO death spiral [R1 §4]. Accordingly:

- If both vouchers pass the independence check, admission proceeds normally.
- If the check fails, the AdmissionRecord MUST satisfy **one** of the following escalations:
  1. **Third outside voucher.** An additional voucher from outside both V₁'s and V₂'s h-hop neighborhoods co-signs the admission; or
  2. **Kin-admission probation.** The admission proceeds with (i) an extended probation on the admittee — no trust-conferring actions (vouching, endorsing, Spark minting (§7), complaint weight above Stranger level) for `KIN_PROBATION` epochs regardless of reputation crossed (Parameter: `KIN_PROBATION`, default 45 epochs, status: provisional, evidence: none), and (ii) both vouchers' `linkage_weight` (§4.7) raised by a factor `KIN_STAKE_MULT` (Parameter: default 1.5, status: provisional), increasing their transitive-penalty exposure for this vouchee.
- A Steward relay MUST reject an AdmissionRecord that fails the independence check and carries neither escalation.

**Neighborhood rate bound.** Any given h-hop vouch-graph neighborhood (the same h as `VOUCH_INDEPENDENCE_HOPS`) MAY sponsor at most **one** kin-admission per `KIN_NEIGHBORHOOD_WINDOW` (Parameter, default 30 epochs, status: provisional, evidence: none). This bounds cluster growth *rate* directly, independent of stake: a cluster cannot simply pay a higher multiplier to push more sybils through escalation 2 faster, because the neighborhood cap is a hard limit on frequency, not a price.

**Compounding stake for repeat use.** Repeated kin-admissions sponsored by the same voucher pair carry an escalating stake multiplier — 1.5×, then 2.25×, compounding per repetition within a rolling 365-day window — rather than a flat 1.5× every time.

A colluding cluster cannot cheaply satisfy escalation 1 (its whole membership shares one neighborhood, and an outside voucher it dupes is cratered by §6.6 when the sybils defect). Escalation 2 alone is a weaker deterrent than it looks for a cluster that does not value the reputation it puts at risk: a sybil farm was always going to burn those identities, so an escalating stake multiplier is close to costless to it — a farm that doesn't care about its stake will happily keep paying a rising price it never intends to redeem. **The neighborhood cap is what actually bounds a sybil farm, because it is a rate bound the farm cannot buy its way past no matter how much stake it is willing to burn; the stake multiplier's real target is the honest-cluster case, where it discourages a close-knit group from leaning on repeat probation admissions instead of eventually diversifying their vouch graph.** Honest close-knit admissions take the mild friction of one extra voucher or a probation, instead of being refused. **Status: the hard-block variant is sim-backed (Appendix A.5); this escalation form — including the neighborhood cap and compounding stake — is a post-simulation amendment and is provisional — its friction/defense trade needs its own simulation pass before it can be called validated. The trade-off is disclosed rather than presented as solved.**

### 4.6 Connectivity discount

Raw decay-weighted inbound Ember sum, alone, does not distinguish a well-integrated member from one reachable only through a thin, engineered chain of vouches — the gap MeritRank's empirical study identifies as the most sybil-tolerance-relevant of its three decay mechanisms [MERITRANK], stronger than time decay alone. HEARTH v5 closes this gap:

For member *m* in tribe *T*, let `k(m)` be the count of vertex-disjoint (except at *m*) directed vouch-paths from *m* back to *T*'s elder set (Anchors ∪ current Steward set), searched to a bounded depth (Parameter: `CONNECTIVITY_SEARCH_DEPTH`, default 6 hops, status: provisional, evidence: none). Determinism requires all conforming implementations to search to the same depth — two implementations searching to different depths would compute different `k(m)` and hence different discounts for the same member from the same vouch graph, which conflicts with the determinism standard this spec insists on elsewhere (§6.5). Define:

> `connectivity_multiplier(m) = min(1, k(m) / k_target)`

(Parameter: `k_target`, default 2, status: sim-backed (directional), evidence: Appendix A.5 (S1) — layered on the independence rule, the discount reduced residual large-cluster (c=8) sybil admission from 3.11 to 2.51 per 90 d while adding no honest friction of its own, since it discounts weight rather than blocking admission. The `min(1, k/k_target)` linear-clamp shape is a candidate, not final.)

`connectivity_multiplier(m)` discounts every trust-conferring signal *m* issues: their vouch weight at admission (§4.3), their Ember issuance weight (§5.2), and their endorsement weight (§8). A member reachable by only one independent path to the elder set has every outbound trust signal discounted until additional independent vouch-paths accrue. This is the direct, cited fix for the gap R1 identifies: HEARTH's pre-v5 formula was "purely additive/multiplicative on individual edges with no graph-connectivity term" [MERITRANK].

### 4.7 Vouches are locked at admission

Once an AdmissionRecord is accepted, its constituent VouchRecords are **immutable and non-retractable** — a voucher cannot silently withdraw a vouch after the fact, following Proof of Humanity's precedent that a vouch locks in at the commit point [POH]. A voucher's exposure to transitive penalty (§6.6) for a given vouchee does not last forever, however: each VouchRecord's `linkage_weight` decays from `admitted_at` using the same decay function as reputation (§5.3, half-life `H`, independently tunable per Parameter: `LINKAGE_HALF_LIFE`, default = `H`, status: provisional, evidence: none). The **linkage exposure window** ends when `linkage_weight` decays below the same floor used to bound penalty propagation (§6.6, 0.01) — beyond that point the voucher is no longer exposed to transitive penalty for that specific vouchee, though the VouchRecord itself remains a permanent, non-erasable part of the tribe's history. This differs deliberately from PoH's model, where a voucher's liability is total and permanent [POH]: HEARTH's liability sunsets with time, matching the same relationship-distance intuition that penalty-by-hop already encodes, but along the time axis rather than the graph-distance axis. The tradeoff is stated plainly in §4.13.

### 4.8 Direct contact needs no tribe

A 1:1 Double Ratchet contact relationship (§10) between two root identities requires **no tribe membership at all** — mutual key exchange is sufficient. This is deliberate: it softens the "double cold-start" problem (a comms network is worthless before contacts join, *and* HEARTH adds a second throttle of vouched admission on top) by ensuring a person can always talk to someone they've met in person, immediately, without either of them belonging to a tribe. Tribes gate *group* features — group messaging (§10), Sparks (§7), Beacon endorsement (§8), Federation standing (§9) — not the ability to reach a vouched-in-person contact.

### 4.9 Bridging between tribes

A member in good standing in tribe A may import weight into tribe B via a **BridgeAttestation**, without bypassing B's ≥2-local-voucher rule (§4.3) — bridging never substitutes for local vouching. **Bridge weight never enters the canonical reputation formula R_m (§5.1) — this is stated here explicitly, and any conforming implementation that folds `bridge_weight` into checkpointed `R` is non-conforming.** Bridging affects exactly two things, and nothing else:

1. **Supplementary weight toward the admission floor (§4.4).** A BridgeAttestation MAY contribute discounted weight alongside local vouches when a Steward relay evaluates whether an AdmissionRecord's combined discounted weight clears the admission floor — it supplements local vouching, it does not replace the ≥2-voucher requirement.
2. **A one-time initial-standing grant at admission**, capped at `BRIDGE_INITIAL_BOOST` (Parameter, default 0.05 — deliberately below the Member-tier threshold `TIER_MEMBER` = 0.10, status: provisional). A bridged newcomer still earns Member tier the same way everyone else does — through ordinary §5.2 Ember issuance after admission — bridging only nudges their starting point, it does not hand them standing directly.

Earlier drafts described bridging as adding weight "to an admission or to ongoing standing"; that phrasing is corrected here and wherever else it appears in this section — bridge weight is scoped to admission-time only (the admission floor and the one-time initial boost above), never to a member's ongoing, checkpointed reputation.

**BridgeAttestation**

| Field | Type | Description |
|---|---|---|
| member | identifier | |
| source_tribe | identifier | Tribe A |
| source_checkpoint_epoch | epoch | The CheckpointRecord (§5.5) the standing proof is anchored to |
| target_tribe | identifier | Tribe B |
| standing_proof | signature (BBS) | Selective-disclosure proof against the source tribe's TierCredential (§5.7), proving "≥ tier X as of `source_checkpoint_epoch`" without revealing exact reputation or vouch graph |
| overlap_factor | uint | Jointly-attested membership-overlap fraction between A and B, §4.9.1 |
| bridge_weight | uint | Computed, §4.9.1; scoped to the admission floor and the one-time initial boost only, never to ongoing R_m |
| signature | signature | Member's signature binding the presentation |

**Source-tribe eligibility gate.** A BridgeAttestation is acceptable only from a source tribe that itself meets a minimum eligibility bar:

(i) ≥ `MIN_BRIDGE_SOURCE_AGE` epochs of continuous checkpoint history (Parameter, default 90, status: provisional, evidence: none);
(ii) ≥ `MIN_BRIDGE_SOURCE_SIZE` active members (Parameter, default 12, status: provisional, evidence: none); and
(iii) a non-"unrated" standing from the target tribe's own Federation vantage (§9).

**Why the gate is necessary in addition to the overlap discount.** §4.9.1's overlap discount defends against near-identical, high-overlap tribes inflating each other — real tribes with real shared membership history. Taken alone, however, the overlap formula gives its *highest* weight (least discount) to exactly **zero-overlap** tribes, which is precisely the profile of a freshly-fabricated, two-co-founder shell tribe an attacker can stand up for free, with instant Anchor-tier standing (§4.1) and no vouching lineage or track record behind it at all. The age/size/vantage gate closes that cheaper and more dangerous case directly: a shell tribe with no checkpoint history, too few members, or no Federation standing simply cannot source a BridgeAttestation, regardless of how favorable its overlap factor looks.

**4.9.1 Overlap discount.** Imported standing is capped and discounted by membership overlap between the two tribes: `bridge_weight = BASE_BRIDGE_WEIGHT × (1 − overlap_factor)`, capped at `BRIDGE_WEIGHT_CAP`. (Parameter: `BASE_BRIDGE_WEIGHT`, default 0.05, status: provisional, evidence: none — carried mechanism from v3/v4. Parameter: `BRIDGE_WEIGHT_CAP`, default 0.05 — aligned with `BRIDGE_INITIAL_BOOST`'s cap, status: provisional, evidence: none — carried mechanism from v3/v4.) `overlap_factor` is computed by the two tribes' Steward sets jointly via a private-set-intersection-cardinality protocol over their rosters (wire-level detail out of scope for this functional spec) and published as a jointly-signed attestation; a verifier trusts the joint signature, not either tribe unilaterally. Heavily-overlapping tribes — near-identical membership — grant near-zero bridge weight, which is the mechanism convergently validated by Circles' independently-arrived-at trust-limit design [CIRCLES] — the *mechanism* (discount by overlap) is convergently validated, but the specific constants (`BASE_BRIDGE_WEIGHT`, `BRIDGE_WEIGHT_CAP`) carry no HEARTH-specific evidence of their own and should not be read as validated merely because the shape they instantiate is.

### 4.10 Dormancy rules

A member may declare dormancy via a DormancyDeclaration. While dormant: decay pauses (or floors at the member's last tier minus one — tribe policy choice, Parameter: `DORMANCY_FLOOR_MODE`, status: provisional); vouching, endorsing (§8), Spark minting (§7), and Steward service are suspended (a dormant Steward automatically steps down for the duration, cross-ref §15 succession rules).

- **Maximum dormancy:** ≤ `DORMANCY_MAX_DAYS` per rolling `DORMANCY_ROLLING_WINDOW`. (Parameter: `DORMANCY_MAX_DAYS`, default 180, status: sim-backed, evidence: Appendix A.6 (S2). Parameter: `DORMANCY_ROLLING_WINDOW`, default 365 days, status: sim-backed, evidence: Appendix A.6.)
- **Cooldown between declarations:** ≥ `DORMANCY_COOLDOWN` between the end of one dormancy period and the start of the next. (Parameter: `DORMANCY_COOLDOWN`, default 60 days, status: sim-backed, evidence: Appendix A.6 — simulation recorded **zero** dormancy vouch-leaks across every seed and chill level: an agent cycling dormancy never appears in the vouch-eligible pool while dormant.) This closes the cycling-dormancy abuse this rule exists to stop.
- **Re-entry probation:** on return from dormancy, high-value actions (vouching, endorsing, Steward candidacy) are rate-limited for a probation window (Parameter: `DORMANCY_PROBATION`, default 14 days, status: provisional, evidence: none — mirrors D1's new-device probation pattern, §3).

### 4.11 Tribe-schism semantics

A tribe's identity is, cryptographically, its seal's key lineage. If a faction of Stewards executes a seal re-key that does not carry forward the required majority-threshold continuity (§5.5, §15 FROST resharing) — a contested fork rather than an ordinary rotation — the resulting seal is, by definition, a **new tribe identity**, not a continuation of the old one. Consequences, stated normatively:

- The old tribe identity's Beacon (§8) and Federation citation history (§9) do **not** transfer to the new seal; they remain attached to whichever branch preserves threshold-signing continuity, per D1's continuity-attestation and fork-and-stick machinery (§3).
- The Federation (§9) sees both lineages as distinct, independently citable tribe identities. Neither is automatically privileged as "the real tribe" — the protocol does not adjudicate governance disputes, only records their cryptographic consequence.
- A member's TierCredential (§5.7) is valid only in the lineage(s) whose Stewards continue to checkpoint that member. A member who does nothing is certified by whichever branch(es) keep including their roster entry; a member may explicitly follow one lineage by re-presenting for admission-continuity in it.

This is a direct, named response to the governance-capture lesson of the 2022 Proof of Humanity fork attempt on its own dispute-adjudication substrate [POH] — the lesson being that the adjudication/governance layer is a distinct attack surface from the vouch graph, and that surface needs its own defined failure semantics rather than silence.

### 4.12 Sybilproofness statement

Cheng & Friedman's theorem establishes that no *symmetric* reputation function can be sybilproof — splitting into multiple identities must be made asymmetrically worse than staying whole, or it cannot be defended against as a matter of mathematics, not engineering effort [CHENG-FRIEDMAN]. HEARTH v5's admission and reputation design is asymmetric by construction, on four independent axes:

1. **Admission cost is per-identity and non-transferable.** Splitting into two identities requires acquiring ≥2 independent Member+ vouchers (§4.3, §4.5) *twice*, not once — the cost does not amortize.
2. **Tier thresholds are absolute, not relative.** Splitting a given amount of vouching/interaction activity across two identities produces two lower reputation values, each further from crossing 0.10/0.40/0.75 (§4.2) than one merged identity would be — fewer aggregate rights, not more.
3. **Ember inflow is per-identity.** §5.2's issuance budgets and diminishing per-pair weight are computed per issuer-recipient identity pair; there is no mechanism by which reputation accrued under one identity transfers to or amplifies another.
4. **The Spark budget curve (§7) is required to be non-superadditive under identity splitting** — simulation (Appendix A.7, S3) confirmed the shipped linear-above-gate curve satisfies this (15.0 whole vs 12.5 split) and exposed that a concave (sqrt) curve is *structurally* superadditive under splitting (12.25 whole vs 15.81 split — a mathematical property of subadditive functions, not a simulation artifact), which is why §7 rejects concave shapes outright rather than merely deprioritizing them.

No mechanism in §4–§7 grants a benefit to operating multiple identities that a single identity does not already receive at lower cost. This is the property Cheng & Friedman's theorem requires; HEARTH does not claim sybil-*proofness* as an absolute (no deployed system does, §4.13), only that identity-splitting is asymmetrically penalized on every axis the protocol controls.

### 4.13 Honest limitations

- **Identity rental post-admission.** Vouching verifies personhood *at admission*; nothing in §4 continuously re-verifies that the same person who was vouched for is still the one operating the identity. This is D1's named limitation (§3) inherited wholesale — 25–33% of gig workers report renting or sharing verified accounts in adjacent industries, and proximity-bound vouching raises the cost of this without eliminating it.
- **QR-forwarding residual risk.** The proximity challenge's 10-minute expiry (§4.4) makes remote forwarding impractical for most attackers but not all; a well-coordinated attacker can screenshot and relay a QR code to a remote confederate inside the window. This is a friction cost, not a proof.
- **The linkage-decay exposure sunset (§4.7) is an explicit tradeoff, not a free improvement over PoH's permanent liability.** A shorter exposure window weakens long-term deterrence against a voucher who behaves for years before vouching badly; a longer window re-imports PoH's over-chilling risk. No simulation currently validates this specific tradeoff (unlike the penalty gradient itself, §6.6) — flagged as an open calibration question, not resolved by this draft.
- **Organic growth rate vs. sybil-farm bound is the same knob, and only the sybil side is currently simulated.** §4.3's `B_VOUCH` budget is what bounds attacker throughput (§6.8), but the identical budget also bounds how fast an honest founding tribe can grow — the Humanity DAO collapse is the concrete precedent for a too-strict admission-cost knob killing a registry outright, independent of whether its sybil defense "worked" [R1 §4]. The v5 growth simulation (Appendix A.6, S2) checked this tension for the first time and came back reassuring: from a founding tribe of 8 at `B_VOUCH = 2`, median time-to-50-members was 110–118 days with a 0% stall rate across every swept chilling level — no Humanity-DAO death spiral in this model. The caveat: that is a model of one arrival-rate regime, not field data (§16).
- **A person legitimately holding parallel, non-overlapping identities across unrelated tribes is invisible to and unpunished by this design, by construction.** The bridging/overlap-discount machinery (§4.9) mitigates reputation *inflation* from this pattern but does not detect or prevent the underlying identity multiplication — this is an accepted, named scope boundary, not an oversight.
- **Vouch-graph collusion clusters that satisfy §4.5's independence check but remain topologically suspicious are only measured by simulation (Appendix A.5), not eliminated by construction.** The independence rule is a necessary, not sufficient, defense; no bounded-hop or admitting-set check can catch every engineered cluster. Moreover the shipped escalation form of §4.5 is a post-simulation amendment whose own friction/defense trade is not yet simulated — only the stricter hard-block variant is.

---

## 5. Reputation engine

### 5.1 Reputation model

For member *m* in tribe *T* at time *t*, effective reputation is:

> `R_m(t) = Σ_e∈Embers(m) weight(e) · λ^(t − epoch(e))  −  penalties(m, t)`

where `λ = 0.5^(1/H)` is the daily decay multiplier (§5.3) and `weight(e)` is computed per §5.2. **This value is only canonical as published in the tribe's latest CheckpointRecord (§5.5)** — a member's own live recomputation from locally-observed Embers is provisional until reconciled at the next checkpoint. This directly answers the "who computes it" question left open since v1: neither a single global trust-flow computation nor an unreconciled per-node local view is authoritative; the Steward set computes and majority-threshold-signs a checkpoint each epoch, every member can request an inclusion proof of their own entry and dispute it (§5.5.3), and witness cosigning (§5.6) bounds how far a checkpoint can diverge from what bridge-partner tribes independently observe.

### 5.2 Ember issuance mechanics

This is new machinery, not present in any prior HEARTH spec version, closing the "conservation problem" identified in the v1 critique: *"Reputation flows from anchors. Anchor weight decays like everyone's. If anchors dilute and nothing continuously injects fresh reputation, total system reputation trends toward zero"* [v1-critique §1.1]. §5.2's answer: **reputation is not a fixed stock that flows outward from a dwindling anchor pool — it is continuously reinjected, every epoch, by ongoing interaction between the tribe's entire active Member+ population**, each bounded by an individual issuance budget. Anchors are the tribe's *initial* condition (§4.1), not its ongoing *source*; the ongoing source is the tribe's own continued social activity. As long as a tribe remains active, aggregate reputation replenishes each epoch independent of how far the original Anchors' own standing has decayed.

**EmberRecord**

| Field | Type | Description |
|---|---|---|
| issuer | identifier | Root identity of the issuing member |
| recipient | identifier | Root identity receiving the Ember |
| tribe | identifier | Tribe context (Embers are tribe-scoped) |
| epoch | epoch | Epoch of issuance |
| context | enum{proximity, remote} | Interaction attestation channel, §5.2.4 |
| proximity_proof | hash (optional) | Reference to a short-range proximity exchange (QR/NFC/BLE token, same pattern as §4.4), required when `context = proximity` |
| sequence | uint | Issuer-local, per-recipient sequence number (used for §5.2.2) |
| signature | signature | Issuer's device-key signature over the above |

`weight(e)` is computed by the Steward set at checkpoint time (not carried in the record itself) as:

> `weight(e) = BASE_UNIT × tier_multiplier(issuer) × connectivity_multiplier(issuer) × proximity_multiplier(e) × diminishing_factor(issuer, recipient, e)`

**5.2.1 Per-issuer per-epoch issuance budget.** Each Member+ tier member has an issuance budget `B_E(tier)` per epoch; Embers beyond the budget in a given epoch are recorded in the log (nothing is silently dropped from history) but excluded from checkpoint aggregation — a soft cap, not a protocol violation. (Parameter: `B_E(Member)`, `B_E(Trusted)`, `B_E(Steward-eligible)`, status: provisional — exercised as defaults in Appendix A.6 (S2), equilibrium calibration open per §5.2.6 .) This is the mechanism that bounds *total per-epoch reputation inflow into the tribe* to `(active Member+ population) × B_E`, closing the conservation gap at the aggregate level: inflow cannot run away regardless of how much any single high-standing member wants to issue.

**5.2.2 Per-pair diminishing weight.** Repeat Embers from the same issuer to the same recipient decay in marginal value, to stop a colluding pair pumping each other repeatedly within a single relationship. Let `c(issuer, recipient)` be the decay-weighted count of prior Embers from issuer to recipient (using the same `λ` as §5.3, so old repeat-issuance "forgets" over time rather than accumulating a permanent penalty):

> `diminishing_factor = δ^⌊c(issuer, recipient)⌋`

(Parameter: `δ`, default 0.5, status: provisional — exercised as defaults in Appendix A.6 (S2), equilibrium calibration open per §5.2.6.)

**5.2.3 Tier-weighting.** `tier_multiplier(issuer)` scales an Ember's contribution by the issuer's own standing — a Trusted or Steward-eligible member's endorsement of good conduct carries more weight than a freshly-admitted Member's. (Parameter: `tier_multiplier(Member) = 1.0`, `tier_multiplier(Trusted) = 1.5`, `tier_multiplier(Steward-eligible) = 2.0`, status: provisional — exercised as defaults in Appendix A.6 (S2), equilibrium calibration open per §5.2.6.)

**5.2.4 Proximity weighting.** In-person, proximity-attested interactions are weighted above remote ones, hardening against click-farm-style bought attestation (v1-critique §3.4, §1.2): `proximity_multiplier(context=proximity) > proximity_multiplier(context=remote)`. (Parameter: `PROXIMITY_MULTIPLIER = 1.0`, `REMOTE_MULTIPLIER = 0.4`, status: provisional — exercised as defaults in Appendix A.6 (S2), equilibrium calibration open per §5.2.6.) This does not eliminate bought attestation — cash still buys physical presence — but it raises the marginal cost of manufacturing standing above pure remote click-farm wages, restoring some of the asymmetry the v1 critique found eroded (§5.9).

**5.2.5 Connectivity discount applies here too.** `connectivity_multiplier(issuer)` (§4.6) applies uniformly to every trust-conferring signal a member issues — vouches, Embers, and endorsements alike — not to vouching alone. A peripheral member with few independent vouch-paths to the elder set has their Embers discounted exactly as their vouches are.

**5.2.6 Equilibrium target — measured discrepancy, disclosed.** Parameters across §5.2.1–5.2.4 are intended to be jointly calibrated so an active, honest, well-connected Member sits near equilibrium reputation ≈ 1.0 under steady-state participation — the assumption the tier thresholds (§4.2) were originally built against. The v5 growth simulation (Appendix A.6, S2) measured **mean steady-active equilibrium ≈ 0.65** under the swept parameter set, not 1.0. Growth outcomes were robust anyway (no stalls at any chill level), but the discrepancy matters for tier attainment: at equilibrium 0.65, few steady members organically cross the 0.75 Steward-eligibility threshold. This is an open calibration item, stated rather than hidden: either the §5.2 inflow parameters move up toward the 1.0 target, or the tier thresholds are re-anchored against the measured equilibrium. The two must be re-calibrated together (they are coupled), and the resolution path is a parameter RFC per §16.

### 5.3 Decay

Decay half-life **H = 90 days** (`λ = 0.5^(1/90) ≈ 0.99233`), carried unchanged from v3/v4. (Parameter: `H`, default 90 days, status: sim-backed, evidence: Appendix A.1.)

**Why 90 and not shorter:** decay's real cost falls on legitimate *intermittent* users, not on bad actors — a defector is convicted (§6) long before decay meaningfully erodes their standing. Simulated reputation retained after an idle gap:

| Half-life | After 2 wk idle | After 1 mo | After 3 mo |
|-----------|-----------------|------------|------------|
| 30 d | 0.72 | 0.50 | 0.13 |
| 60 d | 0.85 | 0.71 | 0.35 |
| **90 d** | **0.90** | **0.79** | **0.50** |
| 180 d | 0.95 | 0.89 | 0.71 |

H = 30 strips half a user's standing in a month away from the keyboard. H = 90 keeps a one-month absence cheap (79% retained) while still reflecting recent standing.

### 5.4 Dormancy interaction

Per §4.10: decay pauses (or floors, per `DORMANCY_FLOOR_MODE`) for the duration of a declared dormancy period, up to `DORMANCY_MAX_DAYS`. This is the mechanism that reconciles decay with the "prosocial intermittent user" problem the v1 critique named (§1.3, §3.3): a seasonal volunteer or a disaster responder who is offline for months is not automatically demoted by §5.3's decay curve provided they declared dormancy before going dark; undeclared absence decays normally.

### 5.5 CheckpointRecord

**CheckpointRecord**

| Field | Type | Description |
|---|---|---|
| tribe | identifier | |
| epoch | epoch | |
| prior_checkpoint_hash | hash | Chain link to the previous checkpoint |
| merkle_root | hash | Root over per-member leaves: `{member, tier, aggregate_reputation_bucket}` — aggregate values and tier labels **only**, never raw vouch edges or Ember records (v1-critique §3.6; this is what makes the checkpoint safe to gossip and mirror without exposing the underlying trust graph) |
| witness_cosignatures | list&lt;WitnessCosignature&gt; | §5.6 |
| steward_signature | signature | Majority-threshold signature (FROST, §12) over the above by the tribe's Steward set |

A Steward set MUST publish a CheckpointRecord every epoch (default 24 h, §2). The signature MUST be a genuine **majority** of the Steward set, not merely some fixed k — this is the anti-subset-forking requirement from Key Transparency [KEYTRANS]: a majority threshold specifically prevents a minority subset of Stewards from authenticating a forked checkpoint to a subset of members without the rest of the Steward set's participation.

**5.5.1 Inclusion proofs.** A member MAY request, and a Steward relay MUST serve, a Merkle inclusion proof for their own leaf in any published checkpoint — this is the "Search"/self-lookup half of the label/value/Search/Update/Monitor pattern [KEYTRANS], applied to the reputation checkpoint rather than a device-cert log.

**5.5.2 Self-monitoring.** A member SHOULD periodically re-derive their own expected aggregate value from their locally-observed EmberRecord log and compare it against their published checkpoint leaf — the "contact monitoring" mode of Key Transparency [KEYTRANS], the cheapest and default verification mode, requiring no third party.

**5.5.3 Dispute path.** If a member's self-monitored value disagrees with the published leaf, the member MAY publish signed evidence (their own relevant EmberRecord excerpts) contradicting the aggregate. A member MAY have at most **one open `CheckpointDispute` at a time** and MUST NOT file a new dispute until the prior one is resolved — this rate limit mirrors §6.1's cap on `ComplaintRecord` filings and closes the equivalent gap here: without it, a member could dispute their own leaf value repeatedly, one filing per epoch forever, at zero cost.

A Steward set MUST, within a bounded response window (Parameter: `CHECKPOINT_DISPUTE_WINDOW`, default 3 epochs, status: provisional, evidence: none), either (a) publish a corrected checkpoint, or (b) publish a Merkle audit path justifying the original value against the disputing member's evidence. Bridge-partner witnesses (§5.6) SHOULD decline to cosign the tribe's *next* checkpoint **only** when the Steward set has failed to respond — no corrected checkpoint and no audit path — within `CHECKPOINT_DISPUTE_WINDOW`: an SLA breach, not the mere existence of an open dispute. A dispute the Steward set rebuts with a valid audit path within the window is recorded as rebutted and does not trigger witness non-cosigning.

**Dispute-abuse throttle.** A member with 3 rebutted disputes within a rolling 90-epoch window has their dispute-filing right suspended for 30 epochs. (Parameter: `DISPUTE_ABUSE_THRESHOLD`, default 3 rebuttals / 90 epochs → 30-epoch suspension, status: provisional, evidence: none.) Together, the one-open-dispute limit, the SLA-conditioned witness response, and this throttle close the freeze path a member could otherwise exploit by disputing nothing but their own entry, repeatedly, at no cost to themselves.

**5.5.4 Fork-and-stick.** Any client or witness shown two inconsistent checkpoints for the same tribe and epoch MUST apply the fork-and-stick rule defined once in §3: hold the first-seen view permanently, reject any subsequent inconsistent view, and raise an alarm. This is the zero-infrastructure equivocation defense; it requires no gossip protocol to function [KEYTRANS].

### 5.6 Witness cosigning

Each CheckpointRecord (and, by the same mechanism, each Beacon publication-log head, §8) is cosigned k-of-n by a small set of **witnesses**, drawn by default from the tribe's existing bridge-partner tribes (§4.9) — a relationship that already exists and is already overlap-discounted, so recruiting witnesses from it costs nothing new [SIGSUM].

**WitnessCosignature**

| Field | Type | Description |
|---|---|---|
| witness_tribe | identifier | The cosigning tribe |
| checkpoint_hash | hash | Hash of the checkpoint being cosigned |
| extends_prior | bool | Witness's own verification that this checkpoint properly extends the prior checkpoint it previously cosigned (verify-extend-sign) |
| signature | signature | Witness's (delegated Steward) signature |

**Witness role definition.** A conforming witness, on receiving a candidate checkpoint, MUST: (1) verify the checkpoint carries a valid majority-threshold Steward signature from the source tribe; (2) verify a Merkle consistency proof that it properly extends the immediately-prior checkpoint the witness itself previously cosigned (or the genesis checkpoint, if first); (3) sign only if both hold. A witness MUST NOT cosign two divergent checkpoints for the same tribe and epoch — fork-and-stick (§3, §5.5.4) applies to witnesses exactly as it does to ordinary clients. A witness's role is deliberately lightweight — verify-extend-sign, not a full audit of checkpoint *contents* (§5.9 names the resulting residual risk) — sized so that a bridge-partner tribe's Steward delegate can serve without new infrastructure, per Sigsum's purpose-built no-blockchain design [SIGSUM].

(Parameter: `WITNESS_K`, default 2, `WITNESS_N` = number of bridge-partner tribes, status: provisional, evidence: none — no SIM currently targets this parameter specifically.)

Why not gossip: Certificate Transparency specified a gossip-based equivocation defense in 2013 and it has never organically deployed in twelve years of production operation [KEYTRANS §CT]; Sigstore inherits the identical unresolved gap. HEARTH does not repeat this mistake — witness cosigning is a small, named, recruited set with an explicit role definition, not an emergent property the spec merely hopes for.

**Zero-witness tribes.** Bridging is optional (§4.9, "MAY"), so `WITNESS_N` MAY legitimately be 0 — a brand-new or deliberately insular tribe can run with no bridge partners, and therefore no witnesses, indefinitely. This is a permitted, foreseeable deployment shape, not a conformance violation. A tribe's checkpoints in this state MUST be marked **"unwitnessed"** in any verifier presentation, and conforming verifiers MUST treat unwitnessed checkpoints as **reduced-assurance**: fork-and-stick (§5.5.4) remains the only equivocation defense available, and it requires two rival views to trigger — it does nothing against a single, self-consistent false checkpoint from a colluding Steward majority (§5.9).

### 5.7 TierCredential

**TierCredential**

| Field | Type | Description |
|---|---|---|
| holder | identifier | Bound to the holder's device key per D1's holder-binding pattern (§3; [HOLDER-BINDING]) so the credential cannot be lent without the device secret |
| tribe | identifier | |
| epoch | epoch | The CheckpointRecord this credential is anchored to |
| tier | enum{Member, Trusted, Steward-eligible} | Stranger tier confers no rights (§4.2) and is not issued a credential |
| issuer_signature | signature (BBS) | Threshold-signed by the tribe's Steward set, anchored to the CheckpointRecord's `merkle_root` |

A TierCredential is **recipient-held** and refreshed every epoch — issued freshly against each new checkpoint the holder's tier is reflected in. From it, the holder derives **per-use presentation proofs** at the point of use (e.g., "I hold ≥ Trusted tier in tribe A as of epoch E," disclosed without the exact reputation value, without which vouches contributed to it, and — depending on the calling context — without the holder's identity). This is the **two-credential pattern**: an epoch-bound standing credential, refreshed periodically, plus unlinkable derived proofs generated per use (BBS selective disclosure properties, §12).

### 5.8 No live range proofs (rationale)

HEARTH v5 explicitly does **not** support a live zero-knowledge range proof over the raw decaying reputation scalar (e.g., "prove R > 0.37 right now"). Reputation is a continuously-decaying value under §5.3; a live range proof over it goes stale within a day of derivation and would be, by a wide margin, the heaviest cryptographic operation in the credential profile roster for a benefit that does not survive the next decay tick anyway. §5.7's discrete, epoch-bound tier credential sidesteps this entirely: it proves membership in a discrete tier as of a specific checkpoint epoch, not a live numeric claim, and is cheap to derive and present. A tribe that wants finer-grained standing signals than the four-tier ladder (§4.2) can subdivide tiers in its own policy layer, but the base protocol commits to discrete, checkpoint-bound tiers, not continuous live proofs, as a matter of cost discipline.

### 5.9 Honest limitations

- **The Steward checkpoint is a small-scale reintroduction of "who computes it."** EigenTrust's central lesson is that whoever computes a trust value is a target and a potential source of bias [R1 §5, EigenTrust]. §5.5's majority-threshold signature, inclusion proofs, self-monitoring, dispute path, and witness cosigning are real, cited defenses, but they do not eliminate the risk: a genuinely *colluding majority* of a tribe's own Stewards can still produce a self-consistent false checkpoint that passes every witness check, because a witness verifies tree-extension and signature validity, not the underlying correctness of the aggregate values themselves. Mitigating this fully would require witnesses to independently re-derive aggregates from raw Ember logs — a much heavier role this draft does not adopt as a MUST, though it is named here as a possible future SHOULD for high-stakes tribes, echoing the Cloudflare-audits-WhatsApp production precedent for independent third-party auditing beyond contact-monitoring [KEYTRANS].
- **Proximity weighting raises the cost of bought attestation; it does not eliminate it.** Cash still buys physical presence at scale in principle; §5.2.4 changes the price, not the possibility (v1-critique §1.2, §3.4).
- **§5.2's parameters remain provisional even after S2.** The growth simulation (Appendix A.6) exercised the mechanism end-to-end and found it growth-robust, but its purpose was macro behavior (growth, stalls, chilling, dormancy), not per-knob calibration; the individual values (`B_E`, `δ`, tier multipliers, proximity multipliers) are reasoned defaults, not optimized constants.
- **The equilibrium discrepancy is real and open.** S2 measured steady-active equilibrium ≈ 0.65 against the 1.0 design target (§5.2.6); the tier thresholds in §4.2 and the §5.2 inflow parameters are coupled calibration targets that must be re-anchored together via the §16 process.
- **Zero-witness tribes have only fork-and-stick, not witness cosigning, as an equivocation defense.** §5.6 permits `WITNESS_N = 0` (bridging is optional) and requires such checkpoints to be marked "unwitnessed" and treated as reduced-assurance by conforming verifiers — but fork-and-stick alone does nothing against a single self-consistent false checkpoint, only against two rival ones. A deliberately insular or brand-new tribe is, for as long as it stays unbridged, relying entirely on Steward majority-threshold honesty and member self-monitoring (§5.5.2), with no external check at all.

---

## 6. Accountability & adjudication

### 6.1 ComplaintRecord

**ComplaintRecord**

| Field | Type | Description |
|---|---|---|
| complainant | identifier | Must be a roster-enrolled member of the same tribe who directly interacted with the target |
| target | identifier | |
| tribe | identifier | |
| epoch | epoch | Epoch filed |
| evidence_hash | hash | Content-addressed evidence — **required**; a Steward relay MUST reject a ComplaintRecord with no evidence reference |
| reason_code | enum | Structured reason code (shared taxonomy with the Federation's DisputeRecord reason codes, §9, for consistency) |
| signature | signature | Complainant's signature |

**Rate limit:** at most `COMPLAINT_RATE_LIMIT` complaints per member per epoch (Parameter, default 1, status: provisional, evidence: none — carried mechanism from v3/v4, now unambiguously bound to the 24 h protocol epoch, §2, resolving what was previously an underspecified "epoch" in v3/v4 text).

### 6.2 Retaliation discount rule

Named for the documented eBay dynamic: conditional on one party leaving negative feedback, the other retaliates in kind more than 37% of the time, against a baseline negative-feedback rate under 0.3% [EBAY]. HEARTH's complaint system is symmetric (any member may complain about any other) and therefore inherits the identical retaliation setup eBay's asymmetric-feedback-rights fix was designed around; HEARTH does not remove symmetric complaint rights (that would be a much blunter tool), it discounts the retaliatory pattern instead:

A **contested pair** exists whenever a ComplaintRecord filed by member A against member B and a ComplaintRecord filed by member B against member A both exist within a trailing window. (Parameter: `RETALIATION_WINDOW`, default 30 days, status: provisional, evidence: none.) The flag is **symmetric, not chronological** — it does not matter which direction was filed first. While a pair remains contested, both complaints:

- carry **half weight** (×0.5) toward the reputation-weighted total (§6.3), and
- **do not count toward the distinct-complainant fraction** used to gate quorum (§6.3) — either complaint can add discounted weight to an already-forming case, but neither can itself be one of the distinct complainants that pushes that case over the quorum threshold.

A contested pair is resolved, not permanent: if one direction's case reaches quorum through **other**, distinct complainants (i.e., complainants outside the A/B pair itself), that direction's complaint is restored to full weight and counted normally, while the opposing direction's complaint remains discounted. Until that happens, both sides sit at half weight.

This closes the specific attack the eBay lesson names — a member under legitimate complaint cannot manufacture an opposing case by complaining back at their own accusers — via a rule that does not create a new exploit of its own. A **purely chronological** rule (discount whichever complaint is filed second) would reward a first-mover attacker: someone who anticipates being complained about, or is actively abusing someone and expects them to eventually report it, could preemptively file a low-effort complaint against every plausible future accuser, so that when the genuine victim later complains, *their* complaint — not the abuser's strategic one — is the one discounted and dropped from the quorum count. Symmetric discounting removes that payoff entirely: filing first buys an attacker nothing, because both directions are discounted identically regardless of order.

### 6.3 Quorum

A member is convicted only when distinct complainants who interacted with them reach quorum:

> **Standard rule (active tribe size N ≥ 12): quorum = max(M_min, ⌈q · N⌉), q = 0.25, M_min = 3.**

**Definition of N.** N ("active tribe size") is the count of roster members who are **currently eligible to be counted as a distinct complainant** — i.e. not dormant (§4.10), not revoked (§3), and not in re-entry (§4.10) or kin-admission (§4.5) probation. Dormant, revoked, and probationary members remain on the roster but do not inflate N, consistent with their exclusion from complaint and quorum rights elsewhere in this section. The Appendix A.9 (S6) simulation did not sweep dormancy fraction as an independent parameter alongside N and capture fraction; this is flagged in §16 as a follow-up.

| Quorum q | Capture needs (fraction to frame an innocent) | Legit conviction latency (median / p90, private 1:1) |
|----------|-----------------------------------------------|--------------------------------------------------------|
| 0.10 | ~10% — too weak | 10 d / 16 d |
| 0.20 | ~18% | 22 d / 29 d |
| **0.25** | **~20% (0% wrongful below 15%)** | **27 d / 36 d** |
| 0.30 | ~25% | 32 d / 41 d |
| 0.40 | ~33% but legit conviction starts failing | 43 d / 49 d |

Latency scales with how public the abuse is; the figures are worst-case private 1:1 abuse. The 20–30% capture band is backstopped by cross-tribe appeal (§6.7).

**Small-tribe rule (N < 12), sim-backed with a disclosed cost:**

> **quorum = max(3, ⌈0.5 · N⌉), and conviction additionally requires the cross-tribe appeal window (§6.7) to pass unexercised before penalty is applied.**

At N = 12 the standard rule already yields quorum 3 (`⌈0.25×12⌉ = 3`); at N = 11 the small-tribe rule yields 6 — a deliberate discontinuity, reflecting that a small tribe's `M_min = 3` floor alone dominates and leaves too small a fraction requirement under the standard formula.

Simulation (Appendix A.9, S6) quantified both faces. The v4 baseline is badly under-defended in small tribes: at N = 12 with 33% capture, the baseline wrongfully convicts **92%** of the time; at N = 8 with 50% capture, also 92%. The small-tribe rule closes this — 0% wrongful at N ≥ 12, and adding the appeal-window gate cuts N = 8 wrongful conviction from 59% to **12%**. **The disclosed cost:** legitimate-conviction reliability drops from ~96–99% to roughly ~14–28% at the same sizes — under the 50% rule, a genuinely bad actor in a small tribe becomes meaningfully harder to formally convict at all. This is the honest price of closing the capture hole, not a free win. The design accepts it because a < 12-member tribe is a group where everyone knows everyone: informal social resolution carries weight formal conviction adds little to, whereas a wrongful formal conviction (with its transitive penalties, §6.6) is catastrophic and protocol-amplified. A small tribe that cannot reach the 50% bar against a genuinely bad actor retains every informal remedy, plus growth past N = 12 restores the standard rule.

Complaints are rate-limited per §6.1.

### 6.4 Adjudication state machine

> **filed → quorum-pending → { convicted | dismissed } → [appeal window, §6.7] → final**

- **Filed:** ComplaintRecord accepted (rate limit and evidence-hash checks pass).
- **Quorum-pending:** the case remains open for `CASE_WINDOW` epochs (Parameter, default 60 days, status: provisional, evidence: none, carried v3/v4 pattern) during which additional distinct complainants may join.
- **Convicted:** the weighted-and-distinct-fraction gate (§6.3) is met within the case window. Conviction triggers penalty computation per the timing semantics in §6.5.
- **Dismissed:** the case window expires without reaching quorum.
- **Appeal window:** following conviction, a window (Parameter: `APPEAL_WINDOW`, default 14 days, status: provisional, evidence: none) during which the convicted member (or any Trusted+ member acting on their behalf) may invoke cross-tribe appeal (§6.7). For tribes ≥ 12 members, penalty is applied at conviction (§6.5) and the appeal window is a **backstop** — a successful appeal reverses it (§6.7). For tribes < 12, per the small-tribe rule (§6.3), the appeal window MUST elapse unexercised **before** penalty is applied at all — a **gate**, not a backstop, reflecting that small tribes' quorum is more readily captured.

### 6.5 Penalty timing semantics (MUST)

This closes the exact ambiguity that broke Advogato's published security proof [ADVOGATO]: Advogato's proof bounded attacker-gained trust by the *post-attack* (final) capacity of compromised nodes rather than their *pre-attack* capacity, giving a real attacker a quadratic advantage the proof did not anticipate — an order-of-operations bug in a formally "proven" system, found years after publication by outside review. HEARTH's transitive penalty (§6.6) is the same class of computation in reverse (penalty flows backward through the vouch chain rather than trust flowing forward), and is exposed to the identical class of bug if left unspecified.

> **A conforming Steward set MUST compute every hop's penalty amount against the reputation snapshot published in the most recent CheckpointRecord as of the epoch the case transitions to Convicted — the "conviction checkpoint" — and MUST NOT recompute penalties iteratively as upstream vouchers' reputations fall as a result of earlier hops' penalties being applied.**

Concretely: if voucher V₁ (hop 0) loses 0.25 of their conviction-checkpoint reputation, and V₂ (hop 1, a voucher of V₁) loses `0.25 × 0.35` of *V₂'s own* conviction-checkpoint reputation — not of V₁'s post-penalty reputation, and not of V₂'s reputation as it stands after V₁'s penalty has already been applied. Every hop's input is the same fixed, pre-penalty snapshot.

> **All penalty amounts computed this way MUST be independently replayable: given the same conviction checkpoint and the same vouch graph, any two conforming implementations MUST derive identical penalty amounts for every affected member, deterministically.**

This is a MUST, not a SHOULD, precisely because the failure mode is subtle enough that it broke a formally-reviewed system without being noticed for years [ADVOGATO] — it is exactly the kind of timing ambiguity that must be pinned down in the spec text itself, not left to implementation convention.

### 6.6 Transitive, decaying penalty (carried, calibrated)

On conviction: the bad actor's reputation is zeroed with a re-accrual cooldown, and penalty propagates up the vouch chain, computed per §6.5's snapshot rule:

> **Direct voucher (hop 0) loses P_dir = 0.25 of their conviction-checkpoint reputation; a voucher h hops up loses P_dir · g^h with gradient g = 0.35; propagation stops once the per-hop penalty falls below 0.01 (~3 effective hops).**

| Hop | Penalty (fraction of that member's conviction-checkpoint rep) |
|-----|------------------------------------------------------------|
| 0 (direct voucher) | 0.25 |
| 1 | 0.088 |
| 2 | 0.031 |
| 3 | 0.011 |
| 4 | <0.01 → not applied |

**Guards:** Anchors are exempt (§4.1 — they have no vouch edge to propagate penalty across unless they themselves vouched someone in, in which case they are liable exactly as any voucher would be for that specific vouch). Per-member per-incident loss is capped so one deep bad actor cannot compound across multiple convictions in a short window (Parameter: `PENALTY_CAP_PER_INCIDENT`, default 0.30 of conviction-checkpoint reputation, status: provisional, evidence: none). Gradient `g` is tunable in 0.20–0.40 — a pure *spread* knob that does not change the direct-voucher hit (Appendix A.2). (Parameter: `P_dir`, default 0.25, status: sim-backed, evidence: Appendix A.2. Parameter: `g`, default 0.35, status: sim-backed, evidence: Appendix A.2, tunable range 0.20–0.40.)

**Aggregate cap across independent incidents.** `PENALTY_CAP_PER_INCIDENT` bounds one incident's loss, but nothing about it bounds the *sum* of losses a member takes from multiple, independent convictions reaching quorum in the same rolling window — a capture faction already at the ~20–25% quorum-capture fraction documented in §6.3 could wrongfully convict several different vouchees who happen to share the same upstream voucher, stacking that voucher's hop-0/hop-1 penalties with no ceiling across incidents. To close this: total propagated-penalty loss a member takes as a voucher (hop ≥ 0, i.e. from convictions of *others* they vouched for, directly or transitively) MUST NOT exceed `PENALTY_CAP_AGGREGATE` (Parameter, default 0.40 of conviction-checkpoint reputation per rolling 30 epochs, status: provisional) within that window; excess penalties are clipped, applied in conviction order (earliest-convicted incident's penalty is applied in full first, later incidents' penalties are clipped against whatever headroom remains). A member's own conviction — their reputation being zeroed as the convicted party, not as an upstream voucher — is exempt from `PENALTY_CAP_AGGREGATE`; the aggregate cap protects a voucher from compounding exposure to *others'* misconduct, not a bad actor from the consequence of their own. This closes the gap where a capture faction stacks multiple wrongful convictions specifically to destroy one shared voucher.

### 6.7 Cross-tribe appeal mechanism

**Eligibility.** The eligible appeal-tribe set for a conviction in tribe T is:

> `{ T' : T' bridges to T (§4.9), shares ≥ m distinct Member+ members with T, and membership overlap(T, T') ≤ 50% }`

(Parameter: `m`, default 3, status: provisional, evidence: none, carried from backlog design.)

**Selection: deterministic double draw.** TWO appeal tribes are selected by:

> `appeal_tribe_i = eligible_set[ hash(conviction_record_hash ‖ "appeal-draw" ‖ i) mod |eligible_set| ]`, i ∈ {1, 2}, redrawing i = 2 on collision.

The seed — the conviction record's own content hash — does not exist, and cannot be predicted, before conviction occurs; this makes the draw unpredictable pre-conviction (an attacker cannot pre-position influence in "the tribe that will be drawn") while remaining fully auditable post-conviction (any observer can recompute the same draw from the public conviction record and eligible set).

**Appeal quorum.** In each drawn tribe, `q` (reusing §6.3's 0.25 fraction) of that tribe's own Trusted+ members deliberate within the window (Parameter: `APPEAL_DELIBERATION_WINDOW`, status: provisional, evidence: none). **A conviction is overturned only if BOTH drawn tribes vote to overturn.**

**Why double-draw, with the evidence both ways (Appendix A.8, S4).** With an honest appeal pool, the both-must-agree rule cuts wrongful overturns of *legitimate* convictions from 12% to 2% — the failure mode that would otherwise let a convicted bad actor escape through one sympathetic or sloppy appeal tribe. The honest disclosure: double-draw does **not** meaningfully improve wrongful-conviction survival once an attacker controls ≥ 25% of the eligible pool (needing one of two draws to land on a captured tribe is nearly as likely as one of one), and the simulation showed the single-draw mechanism is symmetric — pool capture degrades both failure modes identically. **The real defense against appeal capture is the eligibility vetting above (m ≥ 3 shared members, ≤ 50% overlap) keeping the pool honest and reasonably large — the draw rule only prevents an attacker from *choosing* the venue, it cannot launder a rotten pool.**

**On overturn.** For tribes ≥ 12 (where penalty was already applied at conviction, §6.4), an overturned conviction is reversed via a signed correcting entry in the tribe's next checkpoint — append-only, never a silent edit — and affected members' reputation is restored to their pre-penalty snapshot value, then allowed to decay normally forward from the restoration point (not backdated, consistent with the general "nothing is silently rewritten" posture carried from the Beacon's tombstone model, §8). For tribes < 12 (small-tribe gate, §6.4), an exercised and successful appeal simply prevents penalty from ever being applied.

**Gameability numbers.** Appendix A.8 (S4) tabulates P(wrongful conviction survives appeal) and P(legitimate conviction wrongly overturned) as a function of attacker-controlled fraction k/E of the eligible pool, for both draw rules.

### 6.8 Sybil-farm bound (carried, flagged for re-validation)

Each sybil needs `B_VOUCH`-budget-consuming vouchers from ≥2 distinct Member+ identities (§4.3) and, historically (v3/v4, under the pre-§5.2 flat decay-weighted-sum reputation model with no issuance budget, diminishing weight, tier multiplier, or proximity weight terms), took **~14 days of behaving from zero to reach Member tier**. Admission throughput is bounded by `B_VOUCH = 2` per member per rolling 30-epoch window (§4.3); the §6.5–§6.6 penalty then craters a duped voucher's reputation when their sybils defect, typically demoting them out of Member tier and out of vouching eligibility.

**This figure is carried as the v3/v4 baseline expectation, not as a validated v5 number.** §5.2's Ember issuance mechanics — budgets, diminishing weight, tier weighting, proximity weighting, connectivity discount — materially change inflow dynamics versus the flat model the "~14 days" figure was measured against. The S2 growth simulation (Appendix A.6) exercised the new mechanics at the macro level but did not isolate per-sybil time-to-Member; re-deriving that figure under §5.2 is an open simulation item (§16) and until then the ~14-day bound is directional only.

### 6.9 Honest limitations

- **A patient infiltrator who behaves until vouched, then defects, still does damage before quorum forms** — worst-case ~3–5 weeks for purely private abuse per the §6.3 latency table, far less if the abuse touches many members at once. Throughput and Spark limits (§7) cap the *rate* of that damage, not its existence.
- **A captured tribe controlling ≥~20% of members can still wrongfully convict** an innocent member (§6.3 table) — mitigated, not eliminated, by the per-complainant cap, reputation weighting, rate limits, the retaliation discount (§6.2), and cross-tribe appeal (§6.7). The small-tribe rule (§6.3) exists precisely because this capture fraction is easier to reach in a small tribe.
- **Off-protocol retaliation against complainants is entirely unmitigated by this section.** On-protocol staking, rate limits, and quorum requirements protect against *on-protocol* gaming of the complaint mechanism; they do nothing against a convicted member's allies harassing complainants outside the protocol. This is named explicitly, not assumed away — see the Playvicious precedent cited in the Federation's honest-limitations section (§9), which documents exactly this failure mode against a tribe-level disputer and applies with equal force to individual complainants here.
- **The cross-tribe appeal's deterministic draw is unpredictable pre-conviction but its *eligible set* is not secret.** An attacker who can identify or influence a meaningful fraction of the eligible appeal-tribe set in advance (§6.7's `k` parameter) still has a foothold — the draw prevents *choosing which* eligible tribe hears the appeal, it does not prevent an attacker from working to ensure many or all eligible tribes are compromised. Appendix A.8 (S4) quantifies exactly how much protection the draw buys as a function of `k` — and shows it degrades fast past k/E ≈ 0.25, which is why pool eligibility vetting, not the draw, is the load-bearing defense.
- **The symmetric retaliation rule's cost falls on genuine victims who were preemptively complained about.** §6.2's contested-pair rule removes the first-mover payoff, but a real victim whose abuser filed a preemptive complaint against them still sits at half weight, excluded from the quorum count, until at least one *other* distinct complainant comes forward. A victim with no corroborating complainant — the isolated-victim case — cannot single-handedly clear their own complaint to full weight. This is disclosed as the accepted price of removing the first-mover exploit, not hidden as a solved problem.
- **§6.5's penalty-timing MUST closes one specific, historically-real bug class** (the Advogato pre/post-attack capacity ambiguity); it is not a general guarantee that no other order-of-operations bug exists in the adjudication machinery. The discipline it establishes — pin every computation to a named, fixed snapshot, require deterministic replay — is the generalizable lesson, applied here to the one place it was previously unstated.

---

## 7. Anonymous intra-tribe distribution (Sparks)

### 7.0 Scope

A **Spark** is the mechanism by which a member shares content one-to-many *within* their tribe without
any relay, recipient, or Steward being able to link the content to their identity, while still enforcing
that only members in good standing — and only up to a reputation-scaled budget — can distribute at all.
This is the anonymous, inward-facing counterpart to §8's Beacon, which is attributed and outward-facing.
Two protocol requirements are in permanent tension here: reputation-gating normally requires knowing
*who* is asking, and anonymity requires *not* knowing that. §7 resolves the tension with anonymous,
budget-limited, double-spend-preventable credentials rather than by weakening either requirement.

### 7.1 The Spark abstraction

A Spark is defined abstractly as: **a credential, issued by a tribe's Steward set against a member's
checkpointed reputation, that can be presented to prove "minted by a member of tribe T in good standing,
within this epoch's budget" without revealing which member, and that cannot be presented more times than
its issued budget allows.**

This document defines the abstraction once and two conformance profiles that implement it. A conforming
implementation MUST implement at least one profile and MUST declare which profile(s) it supports as part
of tribe configuration (a tribe's Stewards select and publish the tribe's active profile; mixed-profile
operation within a single tribe in the same epoch is out of scope).

| Profile | Shape | Status |
|---|---|---|
| **SPARK-BBS-1** | Threshold-BBS+ issuance + ARC-style multi-show unlinkable presentation, device holder-bound | Target profile |
| **SPARK-RSA-1** | RFC 9474 blind-RSA one-show tokens, serial-number nullifier | MVP / interim profile |

Both profiles MUST satisfy the same external contract: issuance is bound to a checkpointed reputation
value and a per-epoch budget (§7.6); every presentation produces a `NullifierTag` (§7.2.3) checked against
the epoch-scoped registry (§7.5); a Steward relay MUST reject a presentation whose tag is already present
in its local registry for the current epoch; no presentation, on its own, reveals which member minted the
underlying credential.

### 7.2 Record definitions

#### 7.2.1 SparkCredential

Issued once (per issuance event) by a tribe's Steward set to a member's device, held by the client, never
transmitted in cleartext to any relay or recipient.

| Field | Type | Description |
|---|---|---|
| `tribe_id` | identifier | Tribe under whose Steward set this credential is valid. |
| `issuance_epoch` | epoch | The reputation-checkpoint epoch (§2) at which the underlying budget was computed. |
| `profile` | enum {SPARK-BBS-1, SPARK-RSA-1} | Conformance profile this credential instance follows. |
| `show_budget` | uint | Maximum number of presentations this credential may produce. Always 1 under SPARK-RSA-1; a function of §7.6's budget curve under SPARK-BBS-1. |
| `holder_binding_key` | identifier | Public key of the issuing device; presentations MUST prove possession of the corresponding secret. |
| `issuer_signature` | signature | The Steward set's threshold signature (threshold-BBS+ under SPARK-BBS-1; single-key RSA blind signature under SPARK-RSA-1, see §7.4) over the credential's blinded attributes. |
| `expiry_epoch` | epoch | Epoch after which unused show budget is void. |

The client never reveals `holder_binding_key`, `issuer_signature`, or any other credential field directly
in a presentation; §7.2.2 defines what is actually disclosed.

**Expiry horizon (MUST).** `expiry_epoch − issuance_epoch` MUST NOT exceed `SPARK_EXPIRY_HORIZON`
(Parameter, default 2 epochs — matching `NULLIFIER_RETENTION_EPOCHS`, status: provisional, evidence: none).
Unused `show_budget` does not roll over past `expiry_epoch`; per-epoch budgets are non-cumulative by
construction. Without this bound, a member could accrue unspent `show_budget` silently across many epochs
and burst-spend all of it in a single epoch — every individual issuance curve-conformant, but the
*effective* per-epoch throughput far exceeding what §7.6's curve intends, since `NULLIFIER_RETENTION_EPOCHS`
only bounds how long a given *presentation* can be checked for double-spend, not how long unspent budget may
be banked before it is finally presented.

#### 7.2.2 SparkPresentation

Produced fresh at each use. A verifying Steward relay sees only this record, never the `SparkCredential`
it was derived from.

| Field | Type | Description |
|---|---|---|
| `tribe_id` | identifier | Tribe the presentation claims membership-in-good-standing for. |
| `presentation_epoch` | epoch | Current epoch at time of presentation; MUST be within the credential's `[issuance_epoch, expiry_epoch]` window and within the registry's retained window (§7.5). |
| `profile` | enum {SPARK-BBS-1, SPARK-RSA-1} | Profile used; determines proof shape below. |
| `context` | hash | Binds the presentation to what it authorizes — e.g. the hash of the distribution manifest (§7.7) it accompanies. Prevents replay-with-different-payload. |
| `proof` | opaque | Under SPARK-BBS-1: a zero-knowledge proof of knowledge of a valid, unexpired, unexhausted `SparkCredential` signed by the tribe's threshold issuer key, evaluated at `context`, plus a holder-binding proof-of-possession. Under SPARK-RSA-1: the unblinded RSA signature over the token together with a holder-binding proof-of-possession. |
| `tag` | NullifierTag | See §7.2.3. Deterministically derived so that re-presenting the same credential-show against the same epoch produces the same tag, without revealing which credential produced it. |

A verifying Steward relay MUST verify `proof` against the tribe's published issuer key(s) for
`presentation_epoch`, MUST verify the holder-binding proof-of-possession, and MUST check `tag` against the
epoch-scoped registry (§7.5) before forwarding any content accompanying the presentation.

#### 7.2.3 NullifierTag

| Field | Type | Description |
|---|---|---|
| `epoch` | epoch | The epoch this tag is scoped to. A tag is only meaningful, and only checked, within its own epoch and the grace window defined in §7.5. |
| `tribe_id` | identifier | Tribe whose registry this tag belongs to. |
| `tag_value` | hash | Opaque, deterministically derived from the underlying credential's private show-state and `context`; indistinguishable from random to anyone without the credential. Two presentations of the *same* show produce the *same* `tag_value`; two different shows (even from the same credential, under SPARK-BBS-1) produce unlinkable, independent `tag_value`s. |
| `first_seen_at` | timestamp | Local to the observing relay; not part of what's signed or gossiped — used only for local bounded double-accept accounting (§7.5). |

### 7.3 SPARK-BBS-1 (target profile)

**Issuance.** A tribe's Steward set jointly holds a threshold BBS+ signing key established without a
trusted dealer [BBS-THRESHOLD]. At each reputation-checkpoint epoch (§2, §5), for each member the Stewards
compute a show-budget from that epoch's `CheckpointRecord` per the budget curve (§7.6) and jointly issue a
`SparkCredential` good for up to `show_budget` presentations over the credential's validity window, via a
single client request answered by two rounds of inter-Steward messaging [BBS-THRESHOLD]. The Steward set
MUST NOT learn the member's identity-to-budget mapping beyond what it already knows from holding the
checkpoint itself (issuance does not create a new identity-linkage; it consumes an existing one the
Stewards already possess as checkpoint signers).

**Presentation.** Each show is an ARC-style presentation [ARC]: the client evolves private per-credential
state after every use (never reusing prior state), derives an independent `tag`, and produces a proof of
knowledge of a valid signature on the (BBS+ selectively-disclosed) credential attributes, bound to
`context`. Presentations of the same credential are pairwise unlinkable from each other and from issuance.
The `holder_binding_key` proof-of-possession is required on every presentation, following the device-
binding pattern of [BBS-HOLDER-BINDING]; a `SparkCredential` copied off a device without its secret key
MUST NOT produce a valid presentation.

**Security argument sketch (informative, not a proof).** SPARK-BBS-1 composes two independently analyzed
primitives — threshold BBS+ issuance [BBS-THRESHOLD] and ARC's multi-show presentation layer [ARC] — that
have not been formally composed or jointly reduced in any published work. This composition is original
protocol work and the argument below is a sketch, not a citation.

*Unforgeability of presentation.* A `SparkPresentation`'s `proof` is a zero-knowledge proof of knowledge
of a valid BBS+ signature under the Steward set's aggregate threshold public key. Producing a valid
`proof` without holding a genuine `SparkCredential` therefore requires forging a BBS+ signature under that
key, which [BBS-THRESHOLD]'s threshold-issuance protocol reduces to standard BBS+ EUF-CMA under an
honest-majority-of-Stewards assumption (the same trust assumption §5's checkpoint signing already makes).
The threshold nature of issuance does not weaken this: [BBS-THRESHOLD] shows the distributed protocol is
simulatable against a single ideal signer, so an adversary corrupting fewer than the threshold gains no
forging advantage over corrupting none.

*Unlinkability across shows.* ARC's presentation-unlinkability argument [ARC] treats the signer's public
key as an opaque parameter; nothing in ARC's proof depends on whether that key was produced by a single
signer or a threshold group, so substituting the threshold-BBS+ public key for ARC's assumed single-issuer
key preserves ARC's unlinkability property *provided* the BBS+ zero-knowledge proof of knowledge reveals
no more about the signed attributes than ARC's presentation layer already assumes is hidden — true here
because `show_budget` and `issuance_epoch` are the only signed attributes and both are selectively
disclosed only as required, never as identifying values.

*Bounded-show soundness.* The `show_budget` limit is enforced by ARC's client-side evolving-state
machine, independent of who signed the underlying credential; this bound is unaffected by moving from a
single BBS+ issuer to a threshold one.

*Acknowledged gap.* No single published security game covers "threshold-issued, ARC-presented,
holder-bound" as one object. This spec asserts security via black-box composition of the three component
arguments above; a formal joint reduction is future work (tracked per §16's resolution process), and
implementers SHOULD treat SPARK-BBS-1 as *target-maturity*, not *audited-maturity*, until that work lands.

### 7.4 SPARK-RSA-1 (MVP profile)

A one-show interim profile using RFC 9474 RSA blind signatures [RSA-BLIND]. A member requests one blinded
token per intended show, up to the epoch's show-budget (§7.6) — i.e. under this profile `show_budget` is
always 1 per `SparkCredential`, and a member's total per-epoch allowance is realized as *N separate
issuance events* rather than one multi-show credential. The client-chosen serial number, revealed at
redemption, doubles as the `NullifierTag.tag_value`.

Threshold issuance for RSA blind signatures is not yet implementable: it exists only as a 2025 research
result [RSA-THRESHOLD] not yet reduced to practice. A tribe running SPARK-RSA-1 MUST therefore issue under
a single Steward-held (or Steward-set-operated, non-thresholded) RSA key, rotated on a defined schedule.
Tribes MUST document this as a single-point-of-key-compromise tradeoff distinct from SPARK-BBS-1's
threshold guarantee; it is accepted for MVP simplicity and audit surface, not treated as equivalent
security. SPARK-RSA-1 is expected to be superseded by SPARK-BBS-1, or by a future threshold-RSA profile
once [RSA-THRESHOLD]-class work matures, without changing the wire-level Spark abstraction (§7.1).

### 7.5 Epoch-scoped nullifier registry

Nullifier scoping reuses the protocol epoch defined once in §2 (the reputation-checkpoint epoch, default
24 h) rather than introducing an independent timer.

- A Steward relay MUST maintain a nullifier registry scoped to `(epoch, tribe_id)` and MUST retain only
  the current epoch's registry plus one prior epoch as a clock-skew/in-flight grace window
  (Parameter: `NULLIFIER_RETENTION_EPOCHS`, default 2, status: provisional, evidence: [RLN]). A tag
  presented against an epoch older than the retention window MUST be rejected as stale by construction,
  independent of registry contents.
- Steward relays gossip their current-epoch registries to each other using Bloom filters, not flat sets
  (Parameter: `NULLIFIER_BLOOM_FPR`, default 0.001, status: deployment-tunable, evidence: [RLN]), tuned so
  that an occasional false "already spent" rejection is preferred over a missed double-accept.
- This design explicitly rejects the unbounded-growth global nullifier set pattern [ZCASH-NULLIFIER] in
  favor of the epoch-scoped pattern pioneered by RLN [RLN]: closed epochs are provably stale and their
  registries MAY be garbage-collected.

**Bounded double-accept semantics.** HEARTH has no global consensus layer (§0) and does not introduce one
for nullifiers. Each Steward relay's registry is an eventually-consistent local view. A relay MUST accept
a presentation whose `tag` is absent from its own local registry at verification time, even if another
relay has already accepted a presentation carrying the same `tag` but gossip has not yet converged. This
is an accepted, bounded failure mode, not a security break: at most one epoch's worth of double-accept per
uncoalesced tag is possible, the content authorized by a Spark is intra-tribe (not a transferable asset of
external value), and a double-accept costs the tribe at most one extra unbudgeted forward, not a
double-spent scarce resource. A relay MUST NOT treat a detected post-hoc double-accept as evidence of
misbehavior by the presenting device — it is indistinguishable from ordinary gossip lag — and MUST NOT
apply an identity-revealing penalty for it (contrast RLN's deanonymize-on-violation penalty [RLN], which
this spec explicitly rejects for Sparks: replay is rejected, not deanonymized; identity-revealing sanctions
remain exclusively an outcome of §6 adjudication).

### 7.6 Spark budget curve

A member's `show_budget` (SPARK-BBS-1) or per-epoch issuance count (SPARK-RSA-1) MUST be a function of
that member's tier and checkpointed reputation as of the current `CheckpointRecord` (§5), computed
identically by every Steward (deterministic given the checkpoint). **The normative default curve is
linear-above-gate:**

> `budget(R) = α · max(0, R − TIER_MEMBER)`

(Parameter: budget curve shape, default linear-above-gate, status: sim-backed, evidence: Appendix A.7 (S3).
Parameter: `α`, scaling constant, deployment-tunable within the aggregate cap below.)

Three candidate shapes — linear-above-gate, concave (sqrt-above-gate), tiered-step — were simulated
(Appendix A.7) against: (a) spam volume mintable per compromised Member-tier identity; (b) probability an
honest, unusually active sharer is throttled below genuine need; (c) non-superadditivity under identity
splitting; (d) effectiveness of a tribe-level aggregate cap. With all curves normalized to the same
attacker budget, linear-above-gate had the lowest honest-throttle probability (13.2%, vs 24.7% concave and
27.1% step) and passed the splitting check (a merged identity out-budgets its split halves, 15.0 vs 12.5).

**Non-superadditivity under identity splitting (MUST).** A tribe's Stewards MUST NOT configure a budget
curve under which two identities holding split reputation receive a combined budget exceeding what a
single merged identity would receive. This closes the identity-splitting loophole in the Cheng–Friedman
sybilproofness argument invoked in §4. Two shapes fail this structurally and are **non-conforming**:
(i) any curve with a per-identity floor above the tier gate (a positive intercept: N split identities
collect N floors); and (ii) **any concave (e.g., sqrt) curve** — subadditive functions of reputation are
mathematically guaranteed to reward splitting (Appendix A.7 measured 12.25 whole vs 15.81 split; this is a
property of the shape, not simulation noise). The simulation is the reason concave curves, which the
pre-simulation design treated as viable candidates, are rejected outright rather than deprioritized.
There is no per-identity floor above the tier gate.

The tribe-level aggregate minting cap (objective (d)) is a collective, not individual, backstop: if
sustained abuse is observed from within a tribe even under individually-conforming budgets, the Steward
set MAY tighten the tribe-wide aggregate mint rate for a bounded period, per the tribe-configuration
mechanism defined in §4/§5; this is a collective response, deliberately not an individual identity-linked
one, preserving the anonymity property Sparks exist to provide.

This per-epoch framing is what makes the curve — and the Appendix A.7 sybilproofness argument built on
non-superadditivity of the *per-epoch* curve — meaningful at all: a bankable, indefinitely-carried budget
would let a member accrue conforming per-epoch grants across many epochs and burst-spend them in one, which
would defeat both the throughput bound this section computes and the splitting-resistance property §4.12
claims from it. §7.2.1's `SPARK_EXPIRY_HORIZON` bound is what keeps unspent budget from being banked past a
couple of epochs.

### 7.7 Distribution

A Spark authorizes, but is not itself, the content transfer. Content is chunked; each chunk is encrypted
under an ephemeral key; the content key is wrapped to the authorized recipient set; chunks are content-
addressed (BLAKE3) *within the authorized transfer only* — HEARTH has no global content DHT, and a Steward
relay MUST NOT index or make chunk hashes discoverable outside the transfer they belong to. A distributing
client attaches a valid `SparkPresentation` (§7.2.2), with `context` bound to the transfer's manifest hash,
instead of any identity credential; a relay verifies the presentation (§7.5) before forwarding.

### 7.8 Onion routing and the honest ceiling

Distribution payloads are onion-routed through Steward relays by default: each relay learns only the next
hop, never the origin, and — combined with the identity-free Spark — neither a recipient nor any single
relay can link content to a sending member.

**What this protects against.** Recipients; any single relay; ordinary local or in-path network observers.

**What this does not protect against, and MUST NOT be described as protecting against.** A global passive
adversary correlating traffic timing and volume across multiple relays or across the network as a whole.
Prior spec drafts pointed to "run over Tor" as the answer here; this is an overclaim and is withdrawn:
Tor itself does not defeat a global passive adversary either — Tor's own threat model explicitly excludes
this [TOR-GPA]. There is no cheap fix; the honest position is that Steward onion routing is a
recipient/relay/local-observer defense, full stop, and the protocol does not claim more.

For flows that are inherently asynchronous — which includes most §7 distribution and all of §8's Beacon
publication path — a tribe MAY escalate to a mixnet-class transport (Nym-style batched, padded, Poisson-
delayed mixing [NYM]) as the concrete answer for adversaries who *do* have network-wide passive visibility,
at the cost of materially higher latency, which is an acceptable tradeoff for asynchronous flows and not
for anything latency-sensitive (§10's 1:1/group messaging is not routed through the mix layer). A tribe
choosing to escalate MUST document which flows are mix-routed and which remain onion-routed; this spec
does not mandate universal mixnet routing.

**Single-Steward traffic analysis (new, explicit acknowledgment).** Even without a global passive
adversary, a single well-positioned Steward relay — in particular the sequencer Steward defined in
§10.2.1, which necessarily sees commit/presentation timing and size for everything it sequences or relays
— can perform local traffic analysis (timing and size correlation) sufficient to infer activity patterns
even where content and sender identity remain hidden. This is not a hypothetical: the closest deployed
analogue, sealed-sender group messaging, has been shown vulnerable to exactly this class of analysis
[SIGNAL-TRAFFIC-ANALYSIS]. This is carried into the threat model (§14) as an explicit, named, unmitigated
risk of the single-relay-observes-commit-shape design, not glossed over.

### 7.9 Honest limitations

Sparks buy unlinkability against recipients, individual relays, and local observers — not against a
global passive adversary, and not fully against a single relay doing local traffic analysis on timing and
size (§7.8). SPARK-BBS-1's security rests on an original, uncited composition of two separately-analyzed
primitives (§7.3); it should be treated as the target architecture, audited and formally analyzed before
being relied on at stakes higher than intra-tribe content sharing. SPARK-RSA-1 avoids that composition risk
but currently sacrifices threshold issuance entirely, concentrating trust in whichever key issues tokens.
The epoch-scoped nullifier registry accepts a small, bounded rate of double-accept as the price of having
no consensus layer; this is a deliberate tradeoff appropriate to Dunbar-scale tribes distributing
non-scarce content, and would not be an acceptable tradeoff if Sparks were ever repurposed for anything
with real transferable value. Finally, PQ anonymous credentials are not a near-term option for Sparks at
all: current PQ token constructions run 85–175 KB and 0.3–5 s per token [CLOUDFLARE-PQ], two to three
orders of magnitude too large and slow for a token meant to be attached to every chunk of a distributed
transfer. Sparks will require a full suite migration once PQ anonymous credentials mature past that point,
tracked alongside but separately from the identity/transport PQ sequencing in §3/§12.

---

## 8. The Beacon

A tribe's outward face. Where §7 (Sparks) is anonymous and inward, the Beacon is **attributed, public, and
verifiable by anyone without joining the tribe.** It turns a tribe into a publisher whose output carries
cryptographic provenance and staked human endorsement — an RFC shop, a research collective, a standards body,
a review circle. The Beacon reuses, for the third time in this spec, the single log design introduced in §3
(device-cert log) and reused in §5 (reputation checkpoint log): a Merkle append-only log under a
majority-threshold seal, witness-cosigned by bridge-partner tribes, with fork-and-stick (§3) as the client-side
answer to equivocation. One log design, three deployments — not three designs.

### 8.1 Records

**PublicationRecord**

| Field | Type | Description |
|---|---|---|
| `artifact_hash` | hash | Content hash (BLAKE3) of the published artifact. |
| `prior_version` | hash \| null | Link to the prior `PublicationRecord` in this artifact's version chain. |
| `tribe_id` | identifier | Publishing tribe. |
| `author_ids` | list\<identifier\> | Authoring members' root identities (§3). |
| `metadata` | map | Title, artifact type, free-form tags. Non-normative content. |
| `log_index` | uint | Position of this entry in the tribe's publication log. |
| `created_epoch` | epoch | Epoch of first log inclusion. |

**EndorsementBundle**

| Field | Type | Description |
|---|---|---|
| `publication_hash` | hash | Hash of the `PublicationRecord` being endorsed. |
| `endorsements` | list\<Endorsement\> | One entry per endorsing member. |

Each `Endorsement` is `{endorser_id: identifier, endorser_tier: enum, signature: signature, epoch: epoch}`.
The signature covers `publication_hash ‖ epoch` under the endorser's current device key (§3). `endorser_tier`
MUST be independently checkable against that member's `TierCredential` (§5) at `epoch` — an endorsement is a
reputation stake, not a rubber stamp, and a reader MUST be able to verify the stake was real at the time it
was made.

**TribeSeal** (Beacon instance of the seal primitive also used in §5, §6, §9)

| Field | Type | Description |
|---|---|---|
| `publication_hash` | hash | |
| `endorsement_bundle_hash` | hash | Hash of the `EndorsementBundle` that met quorum (§8.2). |
| `threshold_signature` | signature | Majority-threshold signature by the tribe's Steward set (FROST, §12). |
| `log_head` | hash | Merkle log head this seal extends. |
| `witness_cosignatures` | list\<WitnessCosignature\> | k-of-n cosignatures, same record type as §5's checkpoint witnessing. |
| `sealed_epoch` | epoch | |

**StatusRecord**

| Field | Type | Description |
|---|---|---|
| `publication_hash` | hash | |
| `status` | enum{active, disputed, retracted, reaffirmed} | Current graduated status (§8.4). |
| `prior_status_record` | hash \| null | Chain link to the previous `StatusRecord` for this publication — status history is append-only, never overwritten. |
| `reason_code` | enum | Structured reason for a `disputed`/`retracted` transition (reuses the reason-code enum defined for `DisputeRecord`, §9.1). |
| `rationale_hash` | hash | Hash of a public, fetchable free-text statement. **MUST** be present for any transition away from `active`; a status transition without a resolvable rationale is invalid (mirrors §9.1's dispute-transparency rule). |
| `initiator` | enum{self, external} | Whether the tribe's own endorsers initiated the transition or it was forced by an external dispute reaching adjudication quorum. Governs the penalty (§8.4). |
| `penalty_applied` | decimal \| null | Fraction of stake applied to each direct endorser, snapshotted per the §6 penalty-timing semantics (pre-penalty reputation snapshot, applied once, deterministic, replayable). |
| `quorum_record` | hash \| null | Reference to the §6 adjudication result that forced this transition, if `initiator = external`. |
| `log_index` | uint | |
| `effective_epoch` | epoch | |
| `tombstoned_fields` | list\<hash\> \| null | Present when a redaction (§8.5) has replaced sensitive fields with hash tombstones. |

### 8.2 Publication log and seal

A tribe's Steward set MUST maintain the publication log as a Merkle append-only log: every `PublicationRecord`
and every `StatusRecord` is an entry; the log periodically signs a head (same cadence as the §5 reputation
checkpoint, default one epoch, or immediately on a status transition — implementations MAY batch). Log heads
MUST be signed by a **majority threshold** of the Steward set, not merely some k-of-n subset — this is the
same KT-derived anti-subset-forking requirement used for the §5 checkpoint and the §3 device log: a minority
of Stewards MUST NOT be able to authenticate a forked view of the Beacon to a subset of readers `[KEYTRANS]`.

A `TribeSeal` is issued only once an `EndorsementBundle` meets the endorsement quorum (§8.3); the Steward set
then countersigns. This is a deliberate two-layer check — the endorsement bundle attests that named individual
members staked their standing, and the Steward threshold signature attests that the quorum over that bundle
was validly reached — so that a single compromised endorser key or a single compromised Steward key is each
independently insufficient, in the spirit of Sigstore's layered log design (if one component is compromised,
an adjacent, independent component still catches it) `[SIGSTORE]`.

**Witness cosigning.** Every publication-log head MUST be cosigned k-of-n by witnesses, reusing exactly the
mechanism defined for §5's reputation checkpoint: witnesses are typically Stewards of bridge-partner tribes
(§4), performing a cheap verify-extend-sign role — they check the new head extends the last head they cosigned
and sign, with no obligation to audit the full log `[SIGSUM]`. This is deliberately not gossip: certificate
transparency specified a gossip-auditing layer for exactly this purpose and it has never organically deployed
in twelve years of production use `[CT]`; HEARTH does not repeat that assumption. A client (reader, mirror,
or member) that is ever shown two inconsistent log heads for the same tribe MUST apply fork-and-stick (§3):
reject both permanently, and treat the tribe's Beacon as unverifiable pending out-of-band resolution.

### 8.3 Endorsement quorum

Publication under the tribe seal requires **≥ k Trusted-tier-or-above endorsers**
(Parameter: `BEACON_ENDORSE_K`, default 3, status: deployment-tunable, evidence: v4 §6.2, no independent sim —
a tribe MAY raise k). Endorsement is an individual epistemic act with a real stake, checked per §8.1.

### 8.4 Graduated status machine

Publication status is a state machine, not a binary flag:

```
        (self-initiate)              (quorum convicts)
active ────────────────► retracted ◄──────────────┐
  │                          ▲                     │
  │ (dispute filed,          │ (quorum convicts)    │
  │  reaches quorum-pending) │                       │
  ▼                          │                       │
disputed ──────────────────────────────────────────┘
  │
  └────────────────────────────────────► reaffirmed
        (quorum dismisses / appeal window
         passes unexercised)
```

- **active** — the normal state after seal issuance (§8.2).
- **disputed** — an Expression-of-Concern-equivalent state. Entered when a dispute against the publication
  reaches quorum-pending status via the **same adjudication machinery as §6**, scoped to the tribe's Trusted+
  members (matching the endorsement-quorum population, §8.3), OR when the tribe's own Stewards flag it
  pending internal review. **Steward-initiated entry into `disputed` requires the same majority-threshold
  Steward signature as every other Steward act in this spec (§5.5, §10.2.1, §15) — a single Steward MUST NOT
  unilaterally flag a publication as disputed.** Without this, a single Steward could place any publication
  into `disputed` at zero cost (disputed carries no penalty), functioning as a cheap smear/freeze tool
  inconsistent with the majority-threshold discipline applied everywhere else in this document. **Disputed
  carries no penalty** — it is a visible flag, not a conviction. This
  state is adopted directly from graduated academic-retraction typing (Retraction / Expression of Concern /
  Correction), which exists precisely because a binary active/retracted flag forces reviewers into an
  all-or-nothing cliff that real epistemic uncertainty doesn't fit `[CROSSREF]`.
- **retracted** — reached either by external adjudication quorum convicting (forced) or by the endorsers
  self-initiating (self). **Endorsers take a reputation penalty**, reusing §6.2's staking-loss machinery:
  (Parameter: `BEACON_RETRACT_PENALTY`, default 0.25 (reuses §6.2's `P_dir`), status: deployment-tunable,
  evidence: reuse of §6.2 calibration, no independent Beacon-specific sim).
- **reaffirmed** — the dispute's adjudication quorum dismisses it, or the appeal window (§6) passes
  unexercised. No penalty; the publication's status history nonetheless permanently records that it was
  challenged and survived — this is itself a positive signal a reader can see (§8.7).

**Self-initiated retraction discount (LOCKED).** A tribe's endorsers MAY self-initiate a retraction directly
from `active` (skipping the disputed quorum-pending stage) at a materially reduced penalty:

> (Parameter: `SELF_RETRACT_FACTOR`, default 0.4 × `BEACON_RETRACT_PENALTY`, status: provisional, evidence:
> R4 retraction-stigma research, below)

This is the load-bearing lesson of academic publishing's decades-long experience with retraction: when the
reputational cost of *any* retraction is severe and undifferentiated, authors and journals rationally
under-report and delay — "reputation as an academic currency cannot be restored once lost" drives foot-dragging,
years-long "under investigation" limbo, and a documented career-exit effect where visible retractions push
authors out of the field entirely `[CROSSREF]`. HEARTH's endorsement-staking model is a *harsher, quantified,
automatic* version of the same force academia already shows suppresses honest self-correction at the merely
informal level. Since HEARTH's mechanism is enforced by protocol rather than social stigma, the chilling
effect would be worse, not better, without an explicit discount. Pricing self-correction at 0.4× keeps it
strictly rational for endorsers who realize they were wrong to say so before being forced to.

**Self-retraction escalation.** Self-initiated retractions get their **own** escalation counter, tracked
separately from the forced-retraction counter below, within `BEACON_RETRACT_ESCALATION_WINDOW`: the 1st
self-retraction by a given endorser in-window is priced at 0.4× (as above), the 2nd at 0.7×, and the 3rd
and later at 1.0× — equal to the forced base rate — per endorser. This preserves cheap honest self-correction
for the rare-mistake case (a single self-retraction stays at the low 0.4× rate) while closing the "publish,
harvest attention, cheaply self-retract, repeat" cycle: a tribe willing to publish provocative or false
content, harvest whatever attention or Federation citations accrue while it's `active`, and always
self-retract a step ahead of external adjudication would otherwise pay a flat, non-escalating 0.10 tax per
cycle forever, a materially cheaper and more predictable cost structure than a slower actor who gets caught
and faces the forced-retraction escalation. Repeat strategic self-retraction now converges to the same price
as repeat forced retraction, removing the incentive to prefer the strategic-self-retract cycle over honest
publication in the first place.

**Escalation for repeated forced retractions.** A `forced` retraction (i.e., `initiator = external`) counts
against each direct endorser's rolling window; the n-th forced retraction for a given endorser within the
window multiplies the base penalty:
(Parameter: `BEACON_RETRACT_ESCALATION_WINDOW`, default 365 days, status: provisional, evidence: rationale-only,
no sim, matching the citation-durability timescale of §9.2) with multiplier
(Parameter: `BEACON_RETRACT_ESCALATION_MULT`, default 1.0× / 1.5× / 2.0× for the 1st / 2nd / 3rd-and-later
forced retraction in-window, status: provisional, evidence: rationale-only, no sim). **Self-initiated
retractions do not count toward *this* (forced) escalation counter** — they count only toward their own,
separate counter defined above. Exempting self-retractions from the forced counter entirely, with no
counter of their own, would reintroduce exactly the chilling effect the 0.4× discount exists to remove in
the rare-mistake case while also reopening the repeat-strategic-abuse case the self-retraction escalation
counter above closes; giving self-retractions their own, slower-escalating counter keeps both properties —
an endorser who voluntarily corrects the record once still gets the cheap 0.4× rate, but repeated
voluntary "correction" converges to the same price as getting caught.

**Penalty timing.** All Beacon penalties, forced or self-initiated, are computed against the reputation
snapshot at the effective checkpoint, applied once, and deterministically replayable by any member — the same
rule as §6's penalty-timing semantics (the Advogato fix), applied here for the identical reason: a penalty
recomputed against a moving reputation value is neither auditable nor fair.

**Propagation.** The retraction penalty applies to **direct endorsers only**; it does not propagate up the
*vouch* chain (contrast §6.2, which does propagate a conviction penalty up the voucher chain). Endorsing is an
individual epistemic act distinct from vouching for a person's conduct; propagating a publication penalty up
the vouch chain would chill vouching for reasons unrelated to conduct, which is a different failure mode than
the one the vouch-chain penalty is designed to deter.

### 8.5 Hash-tombstone redaction

The Beacon's append-only guarantee ("nothing is silently deleted") is in tension with legitimate redaction
needs — a legal takedown, a doxxing removal, PII that should never have been included. HEARTH resolves this
the way C2PA resolves the same tension in its manifest chain: a `RedactionRecord` replaces the sensitive field
content with its hash (a tombstone) rather than deleting the log entry `[C2PA]`.

**RedactionRecord**

| Field | Type | Description |
|---|---|---|
| `publication_hash` | hash | Target publication. |
| `redacted_field_hashes` | list\<hash\> | Tombstone hashes replacing the removed field content. |
| `authorizing_signature` | signature | Steward majority-threshold signature (or documented legal-authority signature, deployment-specific). |
| `log_index` | uint | |
| `effective_epoch` | epoch | |

The redaction itself is a signed, publicly visible log entry — the hash chain stays intact and provably
unbroken; the sensitive content is gone; the *act* of removing it is not. A Steward relay MUST NOT silently
drop a field from a served `PublicationRecord` without a corresponding `RedactionRecord` in the log.

### 8.6 Roles

- **Publisher / author** — the member(s) who authored the artifact (§8.1).
- **Endorser** — a Trusted-tier-or-above member who stakes reputation on a publication (§8.3).
- **Steward** — signs the `TribeSeal`, operates the publication log, and by default serves as the Beacon's
  **monitor of record**: the party responsible for actually watching the log for inconsistency and for status
  transitions, rather than assuming this happens for free. Both CT and Sigstore document the same lesson —
  a log that anyone *can* audit is not the same as a log anyone *does* audit, and both ultimately rely on a
  small number of named, accountable watchers rather than emergent peer gossip `[CT]` `[SIGSTORE]`. A tribe
  MAY additionally designate any member, or a bridge-partner tribe, as a supplementary monitor — cheap,
  optional, and directly modeled on Key Transparency's "contact monitoring" pattern (each interested party
  re-checks the entries relevant to them) `[KEYTRANS]`.
- **Witness** — verify-extend-sign only cosigner of log heads (§8.2); typically a bridge-partner tribe's
  Steward set.
- **Mirror** — any party MAY host a content-addressed copy of the artifact, `EndorsementBundle`, `TribeSeal`,
  and `StatusRecord` chain; mirroring is an availability role with no signing authority of its own (v4 §6.4,
  carried).
- **Reader / verifier** — see §8.7.

### 8.7 Reader verification algorithm

A verifying reader, given only a `publication_hash` and no account, MUST perform the following steps before
treating a publication's status as current:

1. Fetch the `PublicationRecord`, `EndorsementBundle`, `TribeSeal`, and the current `StatusRecord` (and its
   `prior_status_record` chain back to publication) from any mirror, by content address.
2. Recompute the artifact's content hash and verify it equals `PublicationRecord.artifact_hash`.
3. For each `Endorsement` in the `EndorsementBundle`: verify the signature against the endorser's device-cert
   log (§3) at `epoch`, and verify `endorser_tier` against that member's `TierCredential` inclusion proof (§5)
   at the same epoch.
4. Verify the count/weight of valid endorsements meets the tribe's published `BEACON_ENDORSE_K` (§8.3).
5. Verify `TribeSeal.threshold_signature` is a valid majority-threshold Steward signature over
   `endorsement_bundle_hash ‖ publication_hash` (§12).
6. Verify a Merkle inclusion proof placing the `PublicationRecord` under `TribeSeal.log_head`.
7. **Cross-check the log head against ≥2 independent sources** — at least two independent mirrors, or the
   `witness_cosignatures` on `TribeSeal` — and confirm agreement. On any inconsistency between sources, the
   reader MUST apply fork-and-stick (§3): reject both views permanently and treat this tribe's Beacon as
   unverifiable until the divergence is resolved out-of-band. A reader MUST NOT rely on a single mirror's
   word for a "not retracted" status.
8. Walk the `StatusRecord` chain from publication to the present via `prior_status_record` links; verify no
   gaps and that each transition carries a resolvable `rationale_hash`; determine current `status`.
9. If `status ∈ {disputed, retracted}`, the reader MUST surface this prominently and MUST NOT present the
   publication as unretracted without having completed step 7 within a bounded freshness window
   (Parameter: `BEACON_STATUS_FRESHNESS`, default 1 epoch (24 h), status: provisional).
10. Report to the reader: the named endorsers and their tiers at endorsement time, the publishing tribe's
    identity, seal validity, and current status. This is a **provenance report, not a correctness claim**
    (§8.9).

### 8.8 Positioning versus C2PA

C2PA's foundational stance — the standard asserts *who signed what, when*, and explicitly declines to make
value judgments about whether the underlying content is true — is the same "provenance not truth" framing
HEARTH states throughout this spec, and is cited here as a real shipped precedent for that stance rather than
a novel HEARTH position `[C2PA]`. C2PA's dominant real-world failure mode is structural: its manifest travels
*inside* the file it describes, and the ordinary content pipeline — screenshots, re-encoding, most
social-media upload paths — strips it before a reader ever sees it, undermining the guarantee in exactly the
cases that matter most `[C2PA]`. The Beacon does not share this exposure: a `PublicationRecord` and its
`TribeSeal`/`StatusRecord` chain are fetched **separately, by content address**, from a mirror the reader
already trusts to be tribe-affiliated (§8.7) — they are not embedded in a file that a third-party platform
will recompress. This does not make the Beacon immune to *all* stripping-adjacent risk (a reader who only
ever sees the bare artifact, with no pointer to its `publication_hash`, gets no provenance at all — provenance
requires the reader to go looking), but it is not exposed to C2PA's specific, dominant, documented failure.

### 8.9 Honest limitations

- **Provenance, not truth.** The Beacon proves *who* vetted something and that they are accountable. It
  **cannot prove the content is correct.** A tribe of cranks vetting crank work is cryptographically identical
  to a tribe of experts vetting good work. Readers judge a tribe by its track record and its Federation
  standing (§9) — the way one trusts the IETF or a journal by reputation, not by fiat. The retraction penalty
  gives a tribe a reason to guard its track record; it does not make the tribe right.
- **Monitoring is a role someone must actually fill.** Certificate Transparency and Sigstore both show that a
  system where "anyone can audit" does not mean anyone does; the Beacon assigns a monitor of record (the
  Steward relay, §8.6) precisely so this isn't left implicit — but if that Steward relay itself colludes with
  a forked view, the residual defense is exactly witness cosigning plus the reader's own ≥2-source cross-check
  (§8.7), not an assumption that some third party is independently watching `[CT]` `[SIGSTORE]`.
- **Escalation and discount parameters are not yet sim-validated.** The self-retraction discount factor and
  escalation multiplier (§8.4) are grounded in strong qualitative evidence from academic publishing but have
  no HEARTH-specific simulation behind their exact values; they are marked provisional for that reason.
- **"Publish, harvest, cheap-retract, repeat" was a real gap in an earlier draft of §8.4, now closed by the
  self-retraction escalation counter.** Without its own escalation counter, self-retraction's flat 0.4×
  discount would have let a tribe willing to publish provocative or false content, harvest attention or
  Federation citations while it's `active`, and always self-retract a step ahead of external adjudication
  pay a flat, non-escalating tax per cycle forever — cheaper and more predictable than the compounding cost
  a slower actor faces once caught. §8.4's separate self-retraction escalation counter (1st 0.4×, 2nd 0.7×,
  3rd+ 1.0×) closes this by converging repeat strategic self-retraction to the forced-retraction rate; a
  single, genuine self-correction still gets the cheap rate.

---

## 9. The Federation

Tribes regard each other, and a reader sees a **personalized composite** of how *their own* tribes regard a
target tribe. There is **no global canonical score** — that would recreate a central truth authority, which
the protocol refuses to be. This section carries forward, largely intact, the design and pressure-test results
of v4 §7 / Appendix C — the project's most extensively validated section — hardened per the backlog with a
mandatory dispute-transparency rule, a corroboration-gated feud-damping refinement, and explicit citation of
production systems that have run close analogues of this design at scale.

### 9.1 Records

**CitationRecord**

| Field | Type | Description |
|---|---|---|
| `citing_tribe` | identifier | |
| `target_tribe` | identifier | |
| `weight` | decimal ∈ [0, 1] | Positive citation strength. |
| `threshold_signature` | signature | The citing tribe's majority-threshold Steward signature (§12) — a collective act, not one member's. |
| `epoch` | epoch | |
| `log_index` | uint | |
| `prior_citation` | hash \| null | Supersedes a previous `CitationRecord` between this pair, if any (an update, not a silent edit — the prior record remains in the log). |

**DisputeRecord**

| Field | Type | Description |
|---|---|---|
| `disputing_tribe` | identifier | |
| `target_tribe` | identifier | |
| `weight` | decimal ∈ [−1, 0) | Negative weight. |
| `reason_code` | enum{fraud, harassment, policy-violation, quality, other} | Structured, mandatory. |
| `statement_hash` | hash | Hash of a public, fetchable free-text rationale. |
| `quorum_record` | hash | Reference to the disputing tribe's internal Trusted+ adjudication quorum decision (reuses §6 machinery). |
| `threshold_signature` | signature | |
| `epoch` | epoch | |
| `log_index` | uint | |
| `prior_dispute` | hash \| null | |

**MUST — mandatory public rationale.** A `DisputeRecord` lacking a `reason_code`, or whose `statement_hash`
does not resolve to a fetchable rationale document, **is invalid** and MUST be excluded from every reader's
composite computation (§9.4). This is not a stylistic nicety: fediverse defederation practice is the closest
real-world analogue to an unstructured version of this mechanism, and it is a documented empirical failure —
only 20.1% of Mastodon instances publicly share their blocklists at all, and fewer than half give any reason
for a block, meaning most inter-community disputes in the wild are opaque even to the instances they target
`[FEDIVERSE]`. HEARTH requires disclosure as a validity condition, not a best practice.

### 9.2 Inter-tribe citations

A tribe MAY **cite** (positive weight) another tribe — a collective act issued under the citing tribe's
threshold seal, not by one member. A tribe MAY **abstain** entirely; abstention is first-class and costs
nothing, and most tribe pairs will have no opinion of each other. Citation weight decays slowly — tribes are
durable, unlike the individual behavior Embers track — with
(Parameter: `CITATION_HALFLIFE`, default 365 days, status: deployment-tunable, evidence: v4 §7.1, qualitative).

### 9.3 Bounded negative ranking (disputes)

A tribe MAY **dispute** (negative weight) another tribe, but only:

- via an internal adjudication quorum of its own Trusted+ members (reusing §6 machinery) — a collective
  decision, not a drive-by;
- carrying the mandatory public rationale (§9.1);
- reputation-weighted and rate-limited, and **staking the disputing tribe's own standing** — a dispute the
  broader federation reads as bad-faith reflects back on its issuer;
- decaying faster than positive citations, so grudges expire:
  (Parameter: `DISPUTE_HALFLIFE`, default 90 days (reuses the Ember decay half-life, §5), status: provisional,
  evidence: qualitative — grudges should expire materially faster than citations accrue, no independent sim).

This surfaces actively-bad tribes without turning the federation into a brigading battlefield — see §9.9 for
the risk this does *not* fully close.

### 9.4 Personalized composite score

A reader **R** belongs to tribes {A₁…Aₙ} with standing wᵢ (R's own reputation in Aᵢ, §5). For a target tribe
**T**, each Aᵢ has an opinion rᵢ(T) ∈ [−1, +1] (from its citations/disputes, with an optional discounted
transitive hop, §9.5) or **⊥ (abstain)**. The reader's composite is the standing-weighted average over the
tribes that have an opinion:

> **S_R(T) = Σᵢ wᵢ·rᵢ(T) / Σᵢ wᵢ·𝟙[rᵢ(T) ≠ ⊥]**

If none of R's tribes has an opinion of T, directly or via the bounded hop, the result **MUST** be reported as
**"unrated from your vantage"** — an honest null, never a fabricated number.

**Coverage.** The weighted average alone is dangerously overconfident on thin data: if only one low-standing
tribe opines and the reader's established tribes abstain, the naive formula returns that lone opinion at full
confidence, because abstainers drop out of the denominator (worked in detail below). A verifying client MUST
additionally compute and report:

> **coverage = (Σ opining wᵢ) / (Σ all-vantage wᵢ)**

and MUST apply a minimum coverage fraction before presenting a confident composite; below the floor it MUST
be surfaced as **"weak / uncorroborated"** rather than a headline number:

> (Parameter: `COMPOSITE_COVERAGE_FLOOR`, default 0.25, status: sim-backed, evidence: Appendix C.6 (S5))

**The v4 "≥2 distinct opining tribes" floor is dropped, on simulation evidence — a v5 change.** The S5
sweep (min-opining ∈ {1..4} × coverage floor ∈ {0.10..0.50}, lure-attack vs honest-thin-coverage scenarios,
Appendix C.6) found the Pareto knee at **min-opining = 1 with coverage ≥ 0.25**: the lure attack (a reader's
only opinion coming from a low-standing malicious tribe) is suppressed **0%-shown-confident** by the coverage
floor alone, while only 7% of genuinely-thin-but-legitimate single-tribe opinions are suppressed. The ≥2
floor, by contrast, added no lure protection the coverage floor wasn't already providing and mechanically
suppressed **100%** of honest single-source cases — a reader whose one well-placed, high-standing tribe
correctly opines was told "weak" every time. Requirements as amended:

- coverage ≥ `COMPOSITE_COVERAGE_FLOOR` → composite may be shown, with coverage always displayed;
- exactly **one** opining tribe (regardless of coverage) → the client MUST NOT show a bare composite
  number; it MUST show the **single-source form**: the opining tribe's name, its opinion, and the reader's
  standing in it (e.g., "single source: Tribe A (your standing 0.8) cites +0.6") — the decomposition *is*
  the display. This preserves the honest information the ≥2 floor destroyed while never dressing one
  tribe's opinion up as a corroborated composite;
- below the coverage floor → **"weak / uncorroborated"**, decomposition available on demand.

**Crucially, the composite is decomposable.** The single number is the glance; one tap reveals the per-tribe
breakdown and the coverage flag, so divergence and thin sourcing are shown rather than averaged away
(worked example: Appendix B; adversarial results: Appendix C).

### 9.5 Bounded transitivity & anti-gaming

- **Citation rings are bounded by the reader's vantage.** A ring of mutually-citing tribes — or a
  high-internal-standing sybil tribe — that no tribe in R's vantage cites contributes exactly **0** (returns
  unrated), at every transitive discount γ (Appendix C.1). This is the strongest pressure-test result in the
  whole federation design: federation standing cannot be self-minted; it must be *received* from inside the
  reader's own trust neighborhood. Overlap-discounting (§4) additionally stops near-identical tribes inflating
  each other.
- **Transitive flow is OFF by default.** The only contamination path the pressure test found is a single
  *duped* citation from a tribe already in the reader's vantage to a ring; with one discounted hop at γ = 0.5
  that leaked a composite of 0.245 (~70% of a normal cross-bloc trust level) into the duped reader
  (Appendix C.2). Default behavior is therefore direct citations only (hop = 0); the duped-bridge leak then
  drops to *unrated*, since the ring still has no direct citation from the vantage.
  - **Optional "explore" mode:** one transitive hop, but only with γ ≤ 0.3 **and** a ≥2-independent-bridge
    rule (a single duped citation is insufficient; the target needs two distinct in-vantage→bridge→target
    paths). Both constraints were independently verified to collapse the single-duped-bridge attack back to
    *unrated* (Appendix C.2).

This entire subsection matches, and is externally validated by, Nostr's Vertex service: personalized
PageRank computed from the *querying user's own* follow graph, with no global anchor, is precisely what §9.4's
"your tribes are your seed" claims and what §9.7 relies on — Vertex is a real, running, query-time
implementation of the same trust-flow shape at scale `[VERTEX]`. It is cited here as validation of the *math*,
not the deployment model — see §9.9 for the deployment-model warning that comes with it.

### 9.6 Feud damping

The baseline rule (v4, carried): if tribe A and tribe B dispute each other, the mutual negatives are
discounted by default — a feud is information about the pair, not a clean one-sided signal (Appendix C.5:
a one-sided dispute stays at full weight −0.8; a mutual feud is discounted to −0.32).

**Corroboration refinement.** Blanket mutual-discounting has a known side effect: it also mutes
two tribes that may both be *correctly* warning about each other, not just tribes locked in a tit-for-tat
feud, and fediverse practice shows undamped mutual blocking stacking indefinitely with no such distinction at
all `[FEDIVERSE]`. The candidate refinement: mutual disputes retain **full weight** if and only if each side's
dispute is independently **corroborated** — at least one tribe with no overlap with either A or B has also
filed a `DisputeRecord` against the same target; otherwise the mutual-discount rule (above) applies.

**Simulation verdict: DEFERRED.** The ship-or-defer test was run (Appendix C.7, S7), and the rule did not
clear the bar at realistic parameters. It suppresses baseless tit-for-tat feuds perfectly (100% correctly
damped at every corroboration density tested, with a truth-correlated corroboration model), and it never
misfires on one-sided disputes — but its ability to *preserve* a genuine mutual warning depends entirely on
how commonly an independent third tribe has also noticed and disputed the same bad actor: 80% correct at
corroboration density 0.9, only **6.5% correct at density 0.3** — in a sparse federation, a true mutual
warning is wrongly muted 93.5% of the time, and requiring corroboration on *both* sides compounds the
sparsity (two independent successes needed). Per the pre-registered decision rule, v5 therefore **retains
v4's blanket mutual-discount as the default**, and carries the corroboration refinement — with this
evidence, and the candidate relaxation of requiring corroboration on only the weaker side — into §16 as an
open question. A true mutual warning between two bad tribes is damped under the shipped default; the
mitigation is that damping discounts (×0.4) rather than erases the signal, and independent third-party
disputes, where they exist, carry full weight regardless.

### 9.7 No anchors needed — bootstrapping

Because the score is computed from the reader's own affiliations, the Federation needs **no global anchor
set.** A reader's tribes are their seed. A new member with one tribe sees the federation through that tribe's
eyes; joining more tribes enriches the vantage. This removes the anchor-centralization and bootstrap problems
that plagued earlier reputation-system designs, and is the same shape validated by Vertex's personalized
PageRank in production `[VERTEX]` — with one structural difference that matters (§9.9).

### 9.8 Optional neutral vantage

A reader MAY additionally load a published, named **neutral anchor vantage** (e.g., a curated set of
public-interest tribes, or a domain-consensus set) to deliberately view a target tribe from outside their own
affiliations. Off by default, always labeled when active. This is the relief valve for the echo-chamber
limitation (§9.9) — a reader can choose to look from somewhere other than home, but the protocol does not
force them to.

### 9.9 Honest limitations

- **Echo chambers.** A composite built from a reader's own tribes reinforces their bubble. The protocol does
  not break the bubble; it makes the walls *transparent* (decomposition, §9.4) and offers an exit (neutral
  vantage, §9.8). It will not force a reader out of their epistemic in-group, by design — that would be the
  protocol asserting truth.
- **Still not truth.** A high composite means "the tribes you trust, trust this one," nothing more.
  Conspiracy tribes can score high among their peers; that is the honest output of a system that refuses to
  be a truth oracle.
- **Privacy.** A reader's composite is computed client-side; their set of tribe affiliations need not be
  revealed to anyone. Inter-tribe citations and disputes are public by design (that's their purpose); the
  intra-tribe member vouch graph stays private via selective disclosure (§4, §5).
- **Named residual risk: targeted personal-standing inflation, distinct from the simulated low-standing lure.** Appendix C.6 (S5) validated the coverage floor and single-source display against a lure scenario where a malicious tribe gives the reader *low* standing (w=0.1) — correctly staying below the coverage floor. But coverage is computed from the reader's own standing in the opining tribe(s), and a tribe fully controls Ember issuance to its own members. A malicious tribe can do the opposite of the simulated scenario: deliberately direct its members' issuance at one specific target reader to build that reader's personal standing *high* inside the malicious tribe, pushing `coverage` above the floor and triggering the single-source display — which foregrounds "your standing 0.95" as if it were meaningful corroboration, when it is an artifact the opining tribe manufactured for that one reader. This scenario is unsimulated (§16). Clients SHOULD therefore weight single-source credibility partly by the *opining tribe's own* inbound Federation standing, not solely by the reader's personal standing within it, so a tribe with no track record of its own cannot manufacture apparent corroboration purely by being generous to one target.
- **Named unmitigated risk: off-protocol retaliation against disputing tribes.** Staking a disputing tribe's
  on-protocol reputation (§9.3) defends against *on-protocol* gaming of the dispute mechanism, but it does
  nothing to protect the humans who filed that dispute from *off-protocol* retaliation. This is not a
  hypothetical: one of the earliest Black-run Mastodon instances, whose admins built anti-racist blocking
  tools, was itself brigaded and harassed so severely over its (legitimate, community-protective) blocking
  decisions that it shut down `[FEDIVERSE]`. HEARTH's dispute mechanism has materially more on-protocol
  structure than unstructured fediverse blocking — quorum-gated, staked, rate-limited, and (§9.1) required to
  carry a public rationale — but none of that structure reaches an attacker who chooses to harass the
  disputing tribe's members outside the protocol entirely. This is stated here as an accepted, unmitigated
  limitation, not a solved problem.
- **Production validation and warning, together.** Bluesky's stackable-moderation labelers are the closest
  production system to this section's "many independent opinion sources, composed client-side, no global
  verdict" architecture, running at real scale (43M+ registered users) since March 2024, and they are genuine
  evidence the architecture works — the labeler ecosystem produced diverse, coexisting moderation regimes
  rather than collapsing to one dominant view `[BLUESKY]`. But Bluesky also supplies the sharpest cautionary
  data point for §9.3: a documented January 2025 case where a decentralized label applied by a single user's
  labeler service functioned as a coordinated brigading/targeting signal against a specific individual, with
  followers swept onto derived block lists — and Bluesky's own repository has an open, unresolved issue asking
  how to prevent labels from being used to target abuse `[BLUESKY]`. HEARTH's dispute mechanic has
  structurally more anti-gaming machinery than a bare Bluesky labeler (any single account can label on
  Bluesky; HEARTH requires an internal Trusted+ quorum, staking, and disclosure) — but this section should not
  be read as claiming the underlying problem is solved, only that HEARTH ships materially more defense against
  it than the nearest production system that has actually been attacked this way. Separately, Nostr's Vertex
  service validates the personalized-PageRank math of §9.4/§9.7 at real query-time scale, but its deployment
  model is a cautionary tale about *centralization*, not brigading: because Nostr has no native, staked
  reputation primitive, every third-party WoT effort (including Vertex) has had to bolt trust computation onto
  the bare follow graph as an off-protocol, hosted "Web of Trust as a Service" oracle — a soft
  trusted-third-party dependency the base protocol never specifies `[VERTEX]`. HEARTH's answer is structural,
  not aspirational: `CitationRecord` and `DisputeRecord` are first-class, signed protocol objects (§9.1), not
  something left to a third-party ranking service to compute out of band — this is the direct, deliberate
  response to the recentralization Nostr's WoT ecosystem shows happens by default when trust isn't native to
  the protocol.

---

## 10. Messaging & tribe-state synchronization

### 10.0 Scope

Two distinct messaging shapes exist in HEARTH, deliberately kept as separate primitives rather than one
retrofit onto the other (the retrofit path — bolting group semantics onto a 1:1-first protocol — is a
multi-year tax other systems have paid [CWTCH]): direct 1:1 contact, and tribe-group messaging. Alongside
messaging, this section defines how the bounded set of shared tribe state (membership, device-cert log
heads, revocations, checkpoints, Beacon index) stays synchronized across members and Stewards, and how
delivery to an offline member is handled.

### 10.1 1:1 messaging

Two devices that have exchanged identity keys directly (in person, via a vouch exchange, or via any other
out-of-band channel) MAY establish a Double Ratchet [SIGNAL-RATCHET-PRIOR-ART] session and exchange
messages. **A 1:1 session requires no tribe membership on either side.** This is deliberate: gating the
ability to talk to a specific person you've already mutually verified behind tribe admission would recreate
the "network is useless until your contacts join and get vouched in" double cold-start that has capped
pure friend-to-friend systems at hobbyist scale for two decades [RETROSHARE]. Tribes gate group features —
shared reputation, Sparks, the Beacon, tribe-state sync — not the ability to talk to a vouched-in-person
contact.

### 10.2 Tribe group messaging

A tribe's group channel uses MLS (RFC 9420) [MLS]. MLS requires a strict total order for Commit messages —
Commits are not commutative, and forward secrecy depends on in-order application — which is the single
largest unsolved problem for any non-centralized MLS deployment, HEARTH included [MSC4244] [R2-DMLS]. No
production system surveyed in this protocol's prior-art research runs decentralized MLS commit ordering;
Matrix's own MLS integration effort resolves it by assigning one centralized "hub" server per room to
sequence commits, an explicitly acknowledged centralization [MSC4244]. HEARTH adopts the same practical
answer — a single ordering authority per group — but makes it a rotating, quorum-countersigned role drawn
from the tribe's existing Steward set rather than a single fixed server, which is a genuine improvement on
the Matrix pattern, not merely a citation of it.

#### 10.2.1 Sequencer-Steward delivery service

**Designation.** A tribe's Steward set (§2–§5) designates one of its members as the tribe's **sequencer
Steward**, the MLS Delivery Service for that tribe's group: it receives proposed Commits/proposals from
members' devices, assigns them a total order, and is the party clients send Commits to and receive
ordered Commits from.

**Rotation.** The sequencer role rotates among the Steward set. A Steward relay MUST rotate the sequencer
role on: (a) a fixed schedule (Parameter: `MLS_SEQUENCER_ROTATION_PERIOD`, default 1 protocol epoch,
status: provisional), (b) any change to Steward-set membership (a Steward's revocation or a new Steward's
threshold-root confirmation per §3 immediately disqualifies/qualifies them for the rotation), (c) a
liveness timeout — a sequencer that fails to countersign or sequence within a bounded window (Parameter:
`MLS_SEQUENCER_LIVENESS_TIMEOUT`, default a small multiple of expected round-trip latency,
status: deployment-tunable) MUST be treated by the remaining Steward set as failed-over, triggering an
out-of-schedule rotation, and (d) a fairness-SLA breach (below), treated as equal in force to a liveness
timeout.

**Submission receipts and the fairness SLA.** A liveness timeout only catches a sequencer that stops
responding altogether; it is structurally blind to a sequencer that stays live while consistently
processing a specific member's (or faction's) Commits last, or holding them just under the timeout every
cycle — a real, censorship-adjacent harm that a binary "did it respond in time" test cannot see, and that
is otherwise undetectable after the fact because nothing in the record set proves when a member actually
submitted relative to when they were sequenced. To close this:

- Upon receiving a proposed Commit, the sequencer MUST return a signed `SubmissionReceipt`
  `{tribe_id, commit_hash, received_at, sequencer_signature}` to the submitting device.
- **Fairness SLA (a third, independent rotation trigger).** A member holding a `SubmissionReceipt` older
  than 3× the median sequencing latency of the current rotation period, whose commit remains unsequenced,
  MAY present the receipt to the Steward set. A verified stale receipt MUST be treated as a failover
  trigger equal in force to a liveness timeout. (Parameter: `MLS_FAIRNESS_MULTIPLE`, default 3× median,
  status: provisional.)

**Countersigned epoch advance.** Every MLS epoch advance MUST be recorded as a `SequencedCommitRecord` and
MUST be countersigned by a majority threshold of the tribe's Steward set before a client treats it as
canonical — the same majority-threshold-signing convention §5 already establishes for reputation
checkpoints, reused here rather than inventing a second signing convention.

| Field | Type | Description |
|---|---|---|
| `tribe_id` | identifier | Tribe whose MLS group this record advances. |
| `mls_epoch` | epoch | The MLS protocol epoch this record advances the group to. |
| `commit_hash` | hash | Hash of the MLS Commit message being sequenced. |
| `sequence_index` | uint | Total order position assigned by the sequencer Steward. |
| `sequencer_id` | identifier | The Steward that sequenced this Commit. |
| `sequencer_signature` | signature | Sequencer's signature over `(tribe_id, mls_epoch, commit_hash, sequence_index, prior_record_hash)`. |
| `steward_countersignatures` | list\<signature\> | Majority-threshold countersignatures from the Steward set, confirming the sequencer's ordering. |
| `prior_record_hash` | hash | Hash of the previous `SequencedCommitRecord` for this tribe — chains the sequence into a Merkle append-only log with a signed head, per the shared logging convention. |

A client MUST reject an MLS Commit that arrives without a validly-countersigned `SequencedCommitRecord`
and MUST NOT apply it.

**Partition behavior.** If a network partition causes two disjoint subsets of the Steward set to each
produce a countersigned `SequencedCommitRecord` for the same `(tribe_id, mls_epoch)` with different
`commit_hash` values, a client observing both MUST apply the **fork-and-stick rule defined once in §3**:
reject both, halt group operations for that tribe, and raise an alarm. Reconciliation is a Steward-quorum
act, not automatic: once connectivity is restored, the full Steward set MUST jointly ratify exactly one of
the two branches (by countersignature weight, or by an explicit re-vote if weights tie) as canonical; the
losing branch's Commits are void, and any member whose device state depended only on the losing branch
MUST rejoin via a fresh external commit (§10.2.2) rather than being silently reconciled. An MLS partition
that remains unreconciled after `PARTITION_SCHISM_TIMEOUT` (Parameter, default 30 epochs, status:
provisional) MUST be treated as a tribe schism per §4.11/§15.4 rather than remaining in indefinite limbo —
a partition indistinguishable at the network layer from a genuine, permanent Steward-faction split is
exactly the case §4.11/§15.4's schism semantics exist for, and an implementer should not be left to guess
whether a stuck partition is a mandatory, open-ended wait or a de facto schism.

**Admission via external commit.** A new member's device joins the tribe's MLS group via an MLS External
Commit, proposed by (or on behalf of) the vouchers who completed the member's admission flow (§4). The
External Commit MUST carry a reference to the `AdmissionRecord` (§4) that authorizes the join. The
sequencer Steward MUST verify the referenced `AdmissionRecord` is valid and current before sequencing the
External Commit, and the resulting `SequencedCommitRecord` MUST be countersigned exactly as any other epoch
advance (no admission-specific exception to the countersignature requirement).

**Future work.** Fully decentralized MLS commit ordering without any single sequencing authority — the DAG-
based approach explored in DMLS/FREEK-derived proposals [R2-DMLS] — remains research-stage as of this
writing: an IETF draft and an OpenMLS proof-of-concept exist, with nontrivial per-epoch storage overhead
and no production deployment found anywhere. HEARTH tracks this as future work (§16) and does not build
the countersigned-rotating-sequencer design above as a stopgap to be discarded, but as the considered
answer for as long as decentralized ordering remains unshipped elsewhere.

### 10.3 Tribe-state synchronization

Beyond message content, members and Stewards must stay synchronized on a small, bounded set of shared
tribe state. This section exists because prior systems that punted on defining this bound failed badly:
Secure Scuttlebutt required full replication of every followed identity's entire append-only history,
which produced multi-gigabyte syncs and out-of-memory failures on ordinary devices [SSB] — a failure mode
this spec avoids by construction, not by hoping tribes stay small.

#### 10.3.1 Synced state set

The tribe-state objects that participate in synchronization are exactly:

- current membership set (active/probation/dormant/revoked status per member, per §4);
- device-certificate log heads (the latest signed head of each member's device log, per §3 — not the full
  log history);
- revocation entries (per §3);
- the last `K` `CheckpointRecord`s (Parameter: `SYNC_CHECKPOINT_WINDOW_K`, default 30 checkpoints
  ≈ 30 epochs, status: deployment-tunable) — not the full checkpoint history;
- the Beacon publication index (record identifiers and current status only, per §8 — not full artifact
  bodies, which are fetched separately, content-addressed, on demand).

This is the complete synced set. Anything not on this list (full device-log history beyond the current
head, full checkpoint history beyond the window, message content, full Beacon artifact bodies) is fetched
on demand, out of band from tribe-state sync, if and when a party actually needs it.

#### 10.3.2 Capability-scoped sync requests

A device requests tribe state under an explicit, scoped capability rather than an undifferentiated firehose
— e.g., "the current membership set and revocations" or "checkpoints from epoch N onward," never "give me
everything." This spec follows the Willow/Meadowcap design pattern [WILLOW] as the named model for
capability-scoped, no-central-authority-required partial sync — adopted as a *design pattern to emulate*,
not a wire-format dependency (Willow's own implementations are still maturing and are not treated as a
required library).

| Field | Type | Description |
|---|---|---|
| `grantor` | identifier | Party granting sync access (typically a Steward, for tribe-state; a member, for their own device-log slice). |
| `grantee` | identifier | Party the capability is issued to. |
| `scope` | enum {membership, device-log-heads, revocations, checkpoints-window, beacon-index} | Which slice of §10.3.1's set this capability covers. |
| `validity_window` | epoch range | Bounds during which the capability is honored. |
| `delegatable` | bool | Whether `grantee` may further delegate a narrower capability derived from this one. |

A Steward relay servicing a sync request MUST verify the requesting device holds a valid capability for
the requested scope before responding, and MUST NOT respond with state outside that scope.

#### 10.3.3 Sideloading

Any transport that can carry a signed tribe-state object — LAN, a Steward relay, or removable/offline
media (sneakernet) — is a first-class carrier for tribe-state sync objects; because every object in
§10.3.1 is individually signed and independently verifiable, transport choice does not affect trust.
Sideloading is explicitly named, not merely permitted by omission, following Briar's field-validated
delay-tolerant, transport-agnostic sync model [BRIAR] and Willow's dedicated Sideloading protocol for
exactly this "eventually consistent, delivered by any means" case [WILLOW]. A device that has been offline
for an extended period MUST be able to catch up via sideload without requiring a live connection to a
Steward relay.

#### 10.3.4 Prohibition on full-history replication

A Steward relay or client **MUST NOT** require or perform full-history replication of any member's
complete historical record set as a condition of tribe-state sync. Synchronization is always bounded to
the set enumerated in §10.3.1, scoped further by capability (§10.3.2). This is a direct, permanent lesson
from Secure Scuttlebutt's terminal failure mode [SSB]: an append-only log with no selective-sync primitive
and no deletion does not survive contact with mobile hardware or Dunbar-scale-and-beyond social graphs, and
HEARTH does not repeat it, including for tribes that stay well under 150 members.

### 10.4 Offline mailboxes

A Steward relay holds a per-member encrypted mailbox for content that cannot be delivered immediately
(the recipient device is offline). This gives HEARTH a real answer to a gap pure-P2P delay-tolerant
systems like Briar have not solved cleanly — Briar's model requires the recipient's app to be in the
foreground to sync at all, at a measured ~4× battery cost versus a server-mediated messenger [BRIAR].

| Field | Type | Description |
|---|---|---|
| `recipient_device_id` | identifier | Device the entry is queued for. |
| `ciphertext` | opaque | The encrypted payload (message or distribution chunk); the Steward relay MUST NOT be able to read plaintext. |
| `size` | uint | Byte size, checked against the per-member cap below at enqueue time. |
| `enqueued_at` | timestamp | Local relay time of enqueue. |
| `expiry_epoch` | epoch | Entry MUST be dropped by the relay once past this epoch. |

- A Steward relay MUST enforce a per-member mailbox TTL (Parameter: `MAILBOX_TTL`, default 14 days,
  status: deployment-tunable) after which unclaimed entries are dropped.
- A Steward relay MUST enforce a per-member mailbox size cap (Parameter: `MAILBOX_MAX_BYTES`, default
  deployment-tunable; Parameter: `MAILBOX_MAX_ENTRIES`, default deployment-tunable) and MAY drop the
  oldest entries first once a cap is exceeded, or refuse new enqueues — deployments choose; the spec does
  not mandate one over the other, but MUST document the choice.
- **Wake/push payload constraints (MUST).** If a deployment uses a third-party push notification service
  to wake an offline device, the push payload MUST NOT contain plaintext message content and MUST NOT
  contain the sender's identity. A push payload MUST carry, at most, an opaque wake token sufficient to
  trigger the client to poll its Steward mailbox directly — nothing the push provider receives should
  reveal who sent what to whom, only that *some* mailbox entry exists for *some* device.
- **Battery/foreground tradeoff (named explicitly, left to implementations).** Two honest options exist,
  and this spec picks neither: (i) third-party push, which wakes reliably and cheaply on battery but hands
  a push provider a metadata signal (device woke at time T) it wouldn't otherwise have; (ii) Briar-style
  foreground-only or periodic background polling, which avoids any third-party metadata exposure but costs
  materially more battery and delivers only while the app can run [BRIAR]. Implementations MUST document
  which they chose and MUST NOT claim the third-party-push option carries no metadata cost.

### 10.5 Honest limitations

The sequencer-Steward delivery service is, structurally, a single ordering authority at any given moment —
rotation and countersignature bound the blast radius of a bad or captured sequencer but do not eliminate
the role; nobody, anywhere, currently runs MLS at scale without some form of this centralization, and this
spec does not claim to be the exception. A single sequencer Steward also has an unusually good vantage
point for the traffic-analysis risk already named in §7.8 — it sees timing and size for every commit it
orders, even though it never sees plaintext or (for Spark-authorized content) sender identity. Tribe-state
sync's capability-scoped, bounded design closes SSB's specific failure mode, but the underlying tension —
some party has to hold and serve state for offline members — is not eliminated, only bounded and made
Steward-accountable rather than unbounded and silent. And offline mailbox delivery has no clean answer to
the wake problem: every option on the table trades battery against metadata exposure to a third party;
this spec states the tradeoff rather than pretending one side of it is free, and leaves the choice to
implementations and their users. **Selective delay is bounded, not eliminated.** §10.2.1's fairness SLA and
signed `SubmissionReceipt`s make selective delay *provable* after the fact, and rotation bounds *how long*
any one compromised or coerced sequencer can sustain it before their turn ends — but a sequencer can still
delay a target's commits by any amount up to the `MLS_FAIRNESS_MULTIPLE` threshold within a single rotation
period without tripping anything. Neither mechanism eliminates sub-threshold selective delay; they make it
provable and bound its duration, which is a materially different claim.

---

## 11. Transport & topology

### 11.0 Scope

This section specifies how HEARTH peers find each other and establish a transport-level path, without
ever exposing content to the discovery/routing layer itself. It replaces and hardens v4 §9. It does not
specify anonymous distribution routing (§7), MLS commit sequencing (§10), or Beacon mirror serving (§8) —
those are separate concerns layered on top of the transport established here.

### 11.1 Local discovery

A client MAY discover nearby peers via mDNS on the local network. Continuous background mDNS
advertisement/scanning MUST NOT be a client's default behavior; discovery MUST be **foreground-gated**
by default (Parameter: `MDNS_DEFAULT_MODE`, default = foreground-only/on-demand, status: deployment-tunable,
evidence: [BRIAR] field lesson — always-on Bluetooth/mDNS-class radios were a documented battery
complaint in a system with an otherwise strong offline-first track record). An implementation MAY offer
an explicit, user-enabled "event/always-on proximity" mode for sustained in-person gatherings.

### 11.2 Wide-area discovery: identity→endpoint hints

A Kademlia-style DHT carries **only** signed, short-TTL identity→endpoint hints — never content, never a
persistent identity→key binding queryable at will.

**EndpointHintRecord**

| Field | Type | Description |
|---|---|---|
| hint_key | identifier | Per-epoch rotating lookup key (see below) — NOT the identity's static public key. |
| encrypted_endpoints | ciphertext | Transport endpoint(s)/rendezvous info, encrypted so only a party with an existing relationship to the identity can use it. |
| issued_epoch | epoch | Epoch of issuance. |
| ttl | duration | MUST be ≤ one protocol epoch. |
| signature | signature | Signed by the publishing device key. |

`hint_key` MUST be derived as `hint_key = KDF(identity_id, epoch, device_id, "hint")` rather than
published under the identity's static public key. A DHT participant that has not independently learned an
identity's current epoch-derived hint key (through an existing relationship — a contact, a tribe) cannot
correlate hint-key lookups across epochs to a persistent identity, mitigating passive presence-enumeration
by an observer who is merely watching the public DHT (v1-critique §1.12).

**Residual risk (stated explicitly, carried to §14):** within a single epoch, an adversary who already
knows (or brute-forces, for a small enough identity-and-epoch search space) a target's `hint_key` can still
observe lookup timing to infer presence/online windows for that epoch; an adversary who controls DHT
nodes positioned near a given `hint_key` (a local Sybil-DHT eclipse) can do the same. Per-epoch rotation
bounds the *duration* of correlation to one epoch; it does not defeat a targeted, well-resourced adversary
within that window.

### 11.3 NAT traversal

A client attempting to reach a peer MUST attempt direct connection via ICE/STUN-style hole punching first.
This is a proven pattern at production scale: measured direct-connection rates in comparable systems run
70–90% (iroh reports ~90% direct / ~95% of data volume flowing direct; libp2p's DCUtR measures ~70%
conditional success across 4.4M attempts, 85K+ networks) [IROH], [LIBP2P-DCUTR]. When hole punching fails,
a client MUST fall back to a **stateless ciphertext relay** through a Steward relay: the relay forwards
opaque, encrypted traffic and retains no session state or plaintext.

Steward capacity planning MUST assume a nontrivial, not merely incidental, fraction of connections are
fully relayed rather than a rare fallback (Parameter: `RELAY_FRACTION_PLANNING`, default 10–30% of
connections, status: provisional, evidence: [IROH], [LIBP2P-DCUTR] measured production ranges — this is an
external benchmark, not a HEARTH-specific sim result, and MAY differ at Dunbar-tribe scale per §11.6).

### 11.4 Steward relay load rules

Relay capacity is a shared, scarce resource contributed by a small, tribe-scoped set of volunteer
Stewards — not a global permissionless swarm — so admission/load-shedding MUST be explicit rather than
assumed to smooth out by law-of-large-numbers the way it does for libp2p/iroh's global relay pools
[LIBP2P-DCUTR-ECON].

- Each member's relay budget (bandwidth and concurrent-connection allowance through their tribe's
  Steward relays) is a function of tier (Parameter: `RELAY_BUDGET_BY_TIER`, status: deployment-tunable,
  evidence: cross-ref §4's tier ladder — no dedicated sim; a capacity-planning knob, not a security
  parameter).
- When a Steward relay's capacity is saturated, it MUST shed load lowest-tier-first (Stranger before
  Member before Trusted, per §4's ladder) and SHOULD signal explicit backpressure to shed clients (rather
  than silently dropping traffic) so they can retry hole-punching or try an alternate Steward.
- A Steward relay MUST NOT prioritize by any signal other than tier and existing budget consumption (no
  pay-for-priority — consistent with the no-token design thesis, §1).

### 11.5 Proximity-tier abuse bound — DEFERRED

The ungated proximity (mDNS) tier's abuse bound — specifically, what a malicious insider physically
present at a gathering can extract by exploiting proximity-gated trust — is **DEFERRED**. It requires
field data this spec cannot manufacture in simulation. Resolution process: §16 (open questions), which
MUST track this item until field deployment data (or a credible adversarial field-test) is available.

### 11.6 Honest limitations

- The DHT hint-rotation scheme (§11.2) bounds but does not eliminate presence enumeration; a well-resourced
  local adversary retains a real, stated capability within a single epoch.
- **Volunteer relay economics at Dunbar-tribe scale are unproven.** Every measured NAT-traversal/relay
  benchmark cited here (iroh, libp2p) comes from a global, permissionless relay pool with a huge peer
  count; HEARTH's Stewards are a handful of tribe-scoped volunteers. A popular or heavily-relayed tribe
  could plausibly saturate its own Stewards even with the §11.4 load-shedding rules in place — this spec
  states a planning figure and a shedding policy, not a proof that supply meets demand at small N. This is
  an open engineering risk, not a solved problem.
- **A single well-positioned Steward relay can traffic-analyze commit/message timing and size** even
  though it never sees plaintext or (for onion-routed traffic, §7) the sender's identity — consistent with
  HEARTH's explicit non-goal of resisting a global passive adversary (§1), but worth restating here because
  it applies to ordinary relayed transport traffic, not only the anonymous-distribution path.

---

## 12. Cryptographic profile

### 12.0 Scope

This section is the suite registry and agility rules for every cryptographic primitive named elsewhere in
the spec. It replaces and expands v4 §8. It does not redefine the protocols that use these primitives
(Noise handshake flow is §10/transport-layer session establishment; MLS group semantics are §10; Spark
issuance/presentation flow is §7; checkpoint/seal semantics are §5/§8/§9) — it fixes *which* suite each
of those protocols runs on, and the rules for changing that over time.

### 12.1 Suite registry v1

| Component | Suite (v1) | Used for | PQ status |
|---|---|---|---|
| Root/device signing | Ed25519; optionally dual-signature Ed25519 + ML-DSA-65 (FIPS 204) for PQ-ready roots and device certs | DeviceCertificate, DeviceLogEntry authorization (§3) | Hybrid available now per the §3.9 locked sequencing; classical Ed25519 remains valid until an identity opts into dual-sig |
| Session key agreement | X25519; hybrid X25519 + ML-KEM-768 (FIPS 203) | Noise_XX handshake (session transport) | Hybrid is the v5 default (§3.9 step 1) |
| Session transport | Noise_XX | 1:1 mutual-authenticated, forward-secret session establishment | Rides on the hybrid KEM above |
| Group messaging | MLS (RFC 9420) [MLS], ciphersuite `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (classical); hybrid-KEM MLS ciphersuite tracked pending IETF standardization | Tribe group E2E messaging (§10) | Transitional — no IETF-standardized hybrid MLS ciphersuite exists yet; track and adopt on standardization, do not roll a bespoke one |
| Threshold signatures | FROST [FROST] | Reputation CheckpointRecord (§5), tribe seal / Beacon PublicationRecord seal (§8), witness cosignatures where a tribe itself witnesses (§5, §8), MLS commit-sequencer epoch-advance countersignature (§10), threshold root signatures (§3.6) | Classical only; PQ threshold-signature schemes remain research-stage — not adopted in v1 |
| Content/log hashing | BLAKE3 | Content addressing; Merkle structure for the device log (§3), checkpoint log (§5), Beacon log (§8) | Hash-based, PQ-resistant by construction provided sufficient output length — see agility rule below |
| At-rest key protection | Argon2id | Device secret storage (§3.3) | N/A |
| Anonymous distribution credential | SPARK-BBS-1 (target: threshold BBS + ARC-style multi-show presentation, §7) and SPARK-RSA-1 (MVP: RFC 9474 blind RSA one-show, §7) | Sparks (§7) | Explicitly deferred (§3.9 step 5); classical only in v1, evidence: [PQ-ANON-CF] |
| Selective-disclosure credential | BBS signatures [BBS-SIG], with holder binding [HOLDER-BIND] | TierCredential (§5), bridge/endorser proofs (§4, §8) | Classical only |

### 12.2 Agility rules and downgrade protection

- Every record that participates in an identity's or a tribe's cryptographic trust chain carries (directly
  or by inheritance from its `IdentityRecord`/tribe seal record) a **minimum-suite floor**. A verifying
  party MUST reject any record signed under a suite weaker than the floor currently in force for its
  identity/tribe.
- The floor is **monotonically non-decreasing**: an `Update` (§3.2) or equivalent tribe-level operation MAY
  raise the floor; no operation may lower it. This is the protocol's downgrade-protection mechanism — an
  attacker who later compromises a weaker suite (e.g. a future break of classical Ed25519) cannot use that
  compromise to forge records for an identity/tribe that has already ratcheted its floor past that suite.
- BLAKE3 output for any hash used in a Merkle log linkage or content address MUST be taken at ≥256 bits, to
  retain ≥128-bit security against a quantum pre-image search (Grover-style quadratic speedup halves
  effective security margin).
- New suite entries added to this registry in a future revision MUST specify their own floor-compatibility
  rule explicitly (i.e., whether adopting them is itself a floor-raising event) — this is a conformance
  requirement on future registry amendments, not merely a convention.

### 12.3 Key separation

Distinct roles use distinct keys, and no key may be reused across roles even where the same party (e.g.
the Steward set) holds more than one of them. This bounds the blast radius of any single key compromise.

| Key | Held by | Signs | MUST NOT sign |
|---|---|---|---|
| Root identity key (single or FROST threshold) | The root identity / its threshold participants | DeviceCertificate issuance, DeviceLogEntry root-authorized operations, root-rotation attestations (§3) | Session traffic, MLS application messages, Ember/Vouch/Complaint records, tribe seals |
| Device key | An individual enrolled device | Noise session handshakes, MLS leaf credentials and application messages, EmberRecord issuance, VouchRecord, ComplaintRecord, EndorsementBundle signatures, device-quorum DeviceLogEntry operations (§3, §4, §5, §6, §8) | DeviceCertificate for a different identity's device, tribe seals, reputation checkpoints |
| Steward threshold signing key (FROST) | The tribe's Steward set (majority threshold, §5) | Reputation CheckpointRecord (§5), tribe seal on Beacon PublicationRecord (§8), inter-tribe CitationRecord/DisputeRecord seal (§9), MLS commit-sequencer epoch-advance countersignature (§10) | Spark credential issuance, individual device certificates |
| Spark issuance key (threshold BBS or RSABSSA, per §7's conformance profile) | The tribe's Steward issuance set — a **distinct keypair** from the Steward threshold signing key above, even if held by the same Stewards | SparkCredential issuance only (§7) | Reputation checkpoints, tribe seals, device certificates |

A Steward set that reuses its checkpoint/seal FROST key for Spark issuance is **non-conformant**: a
compromise or coercion of that single key would then forge both reputation checkpoints and anonymous
distribution credentials simultaneously, which the separation above is designed to prevent.

### 12.4 PQ migration

The identity-layer PQ migration plan is normative and lives in §3.9; this section's registry (§12.1)
reflects its output state (hybrid KEM and optional dual-sig roots available now, PQ threshold sigs and PQ
anonymous credentials deferred). Do not duplicate the sequencing narrative here — see §3.9.

### 12.5 Honest limitations

- **No standardized hybrid MLS ciphersuite exists yet.** HEARTH's group messaging is PQ-vulnerable at the
  application-message layer until IETF standardizes and HEARTH adopts one; the session/transport layer
  (Noise, via hybrid KEM) is protected sooner than the group-messaging layer, and implementers should not
  conflate the two.
- **PQ anonymous credentials remain impractical.** At 85–175 KB and 0.3–5 s per token [PQ-ANON-CF], a
  Spark-scale PQ migration is not a v5-timeframe deliverable; Sparks are knowingly built on a component
  that will need a hard suite migration later, and that migration will be disruptive (every issued
  SparkCredential under the old suite becomes unverifiable once a tribe ratchets its floor past it, per
  §12.2's downgrade-protection rule — this is a deliberate tradeoff, but a real one).
- **FROST threshold signatures have no adopted PQ successor today.** Every checkpoint, seal, and
  commit-sequencing countersignature in this registry is quantum-vulnerable; the whole "threshold Steward"
  trust model (§3.6, §5, §8, §9, §10) migrates only as fast as PQ threshold-signature research matures
  into something implementable, which is not yet.
- **Key separation is a discipline, not a cryptographic guarantee.** §12.3's table is a conformance
  requirement, but nothing in the wire protocol cryptographically prevents a non-conformant Steward set
  from reusing a key across roles; conformance tooling (§13) needs to be able to detect this from public
  records (e.g., the same public key appearing in both a CheckpointRecord seal and a SparkCredential
  issuance) and flag it, since the protocol itself cannot force good key hygiene.

---

## 13. Conformance

An implementation claims conformance for one or more roles. A role's checklist is the complete set of
MUST-level obligations for that role; the section references are normative.

### 13.1 Client

A conforming Client MUST: maintain the device log and monitor its own entries (§3); enforce
fork-and-stick on every log it consumes (§3.5); verify checkpoint inclusion proofs for its own
reputation entry and raise disputes on mismatch (§5); enforce voucher-independence checks before
co-signing a vouch (§4); compute penalties deterministically from the conviction checkpoint snapshot
(§6); spend Sparks only with fresh epoch-scoped state and never reuse presentation state (§7); refuse
MLS commits not sequenced by the current sequencer Steward, except during ratified partition
reconciliation (§10); sync tribe state only via the closed capability-scope set (§10); implement the
suite-registry minimum and downgrade ratchet (§12).

### 13.2 Steward relay

A conforming Steward relay MUST: participate in majority-threshold checkpoint signing or abstain
explicitly (§5); publish checkpoints on the epoch cadence and submit them for witness cosigning (§5);
forward ciphertext without inspection and retain no plaintext or long-term traffic logs (§11); enforce
Spark verification (signature + unspent tag) before forwarding (§7); maintain the current+1-epoch
nullifier set and gossip it to peer Stewards (§7); operate mailboxes within TTL/size policy and
document its cap-exceeded behavior (§10); serve as sequencer when designated and hand off on rotation
triggers (§10); act as monitor of record for the tribe's Beacon log (§8); apply relay budgets and shed
load lowest-tier-first with no pay-for-priority (§11).

### 13.3 Mirror

A conforming Mirror MUST serve records and artifacts byte-identical to their content address, include
current log heads and witness cosignatures when serving status, and MUST NOT claim currency beyond the
freshness bound (§8). Mirrors MAY be anonymous; they hold no keys.

### 13.4 Witness

A conforming Witness MUST verify that each submitted log head extends the last head it cosigned
(consistency proof), cosign within its stated availability window, retain its cosignature history, and
refuse to cosign two heads at the same log position (§5.4). A witness that observes a fork MUST publish
both conflicting heads.

### 13.5 Reader / Verifier

A conforming Verifier MUST execute the full verification sequence of §8.7 — including the ≥2-mirror or
witness-cosignature cross-check and the freshness bound — before presenting a publication as valid or
"not retracted," and MUST present Federation composites with their coverage qualifier, never as a bare
number (§9).

---

## 14. Threat model

Each row names the adversary, the verdict, and the load-bearing mechanism. Verdicts: **Mitigated**
(mechanism + evidence), **Bounded** (damage capped, not prevented), **Partial**, **Accepted risk**
(named, unmitigated by design or by honesty), **Out of scope**.

| # | Adversary / attack | Verdict | Mechanism / caveat |
|---|---|---|---|
| 1 | Passive link eavesdropper | Mitigated | Noise XX, MLS, E2E everywhere (§10, §12) |
| 2 | Active MITM | Mitigated | Mutual auth, key continuity, device log (§3) |
| 3 | Spammer / botnet | Bounded | Reputation-gated throughput + Spark budgets (§7); vouch-gated admission (§4) |
| 4 | Careless / colluding voucher | Bounded (calibrated for the hard-block variant; escalation form unvalidated — Appendix A.5) | Staked vouching, transitive penalty (§6); voucher independence (§4) |
| 5 | Sybil farm via duped vouchers | Bounded | ≥2 independent Member+ vouchers, issuance budget, connectivity discount (§4); penalty craters duped vouchers (§6); Appendix A.5 |
| 6 | Tight collusion cluster (letter-of-the-law vouches) | Bounded (new in v5) | Voucher-independence rule + connectivity discount Appendix A.5; MeritRank-derived. Appendix A.5 measured the hard-block variant; the shipped escalation form + neighborhood cap awaits its own sim |
| 7 | Identity split (one human, two roots) | Bounded | Sybilproofness asymmetry (§4.8): per-identity admission cost, absolute tiers, non-superadditive Spark curve Appendix A.7 |
| 8 | Identity rental post-admission | Accepted risk | Admission-time verification only; holder-binding credentials raise the bar (§3, §7); continuous re-verification rejected by design |
| 9 | Infiltrator who defects | Bounded | Quorum conviction; damage window ~weeks for private abuse (§6, Appendix A); rate caps |
| 10 | Tribe-capture wrongful conviction | Partial | q=0.25 needs ~20% control; per-complainant cap; cross-tribe appeal Appendix A.8; small-tribe rule Appendix A.9 |
| 11 | Retaliatory complaints | Bounded (new in v5) | Retaliation discount (§6); quorum still required |
| 12 | Complaint spam / adjudication DoS | Bounded | Per-member per-epoch complaint rate limits (§6) |
| 13 | Malicious Steward subset forging checkpoints | Mitigated, contingent on witness participation (zero-witness tribes: fork-and-stick only — §5.6) | Majority-threshold signatures; member self-monitoring; witness cosigning; fork-and-stick (§5) |
| 14 | Steward-set equivocation (split view) | Mitigated | Witness cosigning from bridge partners + fork-and-stick (§5.4); CT gossip lesson applied |
| 15 | Steward governance fork / seal re-keying | Bounded (new in v5) | Schism semantics: new lineage, empty citation history (§15.4) |
| 16 | Sequencer Steward censoring/reordering MLS commits | Bounded | Rotation triggers + liveness failover + countersigned epoch advance (§10); a hub exists — named tradeoff, DMLS tracked; fairness SLA + signed submission receipts make selective delay provable (§10.2.1) |
| 17 | Recipient / single relay tracing a distributor | Mitigated | Identity-free Sparks + onion routing (§7) |
| 18 | Single well-placed Steward doing traffic analysis | Accepted risk (named in v5) | Timing/size correlation on relayed traffic is feasible; padding raises the bar only (§7.6) |
| 19 | Global passive traffic correlation | Out of scope | Stated non-goal; mixnet-class transport named for async escalation — bare Tor claim removed (§7.6) |
| 20 | Spark double-spend via gossip lag | Accepted (bounded) | Eventually-consistent epoch-scoped nullifiers; rare double-accept is low-stakes by design (§7.4) |
| 21 | Device theft / identity hijack | Bounded | Device subkeys + revocation + probation + threshold root + gated recovery (§3) |
| 22 | Malicious social recovery | Bounded | M-of-N guardians + time-lock + all-device notification + veto window (§3) |
| 23 | DHT enumeration / presence tracking | Bounded (new in v5) | Short-TTL hints + per-epoch rotating hint keys (§11); residual risk stated |
| 24 | Relay DoS / volunteer capacity exhaustion | Bounded (new in v5) | Per-member relay budgets, tier-ordered shedding; 10–30% relayed planning figure (§11) |
| 25 | Reputation-laundering publisher | Bounded | Non-transferable staked endorsements; graduated retraction penalties; Federation standing (§8–§9) |
| 26 | Under-retraction (stigma chills self-correction) | Mitigated (new in v5) | Graduated disputed state + cheaper self-retraction (§8.4); academic-publishing evidence; repeat self-retraction escalates (§8.4) |
| 27 | Stale "not retracted" served by mirror | Mitigated (new in v5) | ≥2-mirror/witness cross-check + freshness bound in the MUST verification sequence (§8.7) |
| 28 | Inter-tribe brigading / dispute weaponization | Partial | Quorum-gated, staked, rate-limited, fast-decaying disputes + mandatory rationale (§9); industry-unsolved (Bluesky) — tracked §16 |
| 29 | Off-protocol retaliation against disputers | Accepted risk (named in v5) | Staking cannot reach off-protocol harassment (Playvicious precedent) |
| 30 | Citation ring / sybil tribe | Mitigated | Vantage-bounded composite: rings outside the reader's vantage = unrated (Appendix C.1); overlap discount |
| 31 | Lure into low-standing malicious tribe | Mitigated | Coverage floor (0% lure success at 0.25) + single-source display rule (§9, Appendix C.6) |
| 32 | Federation as captured truth authority | N/A by design | No global score, no anchor set; client-side composite (§9) |
| 33 | Echo-chamber epistemics | Accepted by design | Decomposition + optional neutral vantage; the protocol will not assert truth (§9) |
| 34 | Endpoint compromise (rooted device) | Partial | At-rest encryption, ratchets, revocation; no protocol fixes a rooted endpoint |
| 35 | Harvest-now-decrypt-later (quantum) | Partial | Hybrid ML-KEM for transport now; PQ roots via rotation; PQ anonymous credentials deferred with evidence (§3.9, §16) |

### 14.1 Reading the table honestly (non-normative)

Five rows are *Accepted risk* on purpose. A spec that claims to mitigate identity rental, single-relay
traffic analysis, off-protocol harassment, occasional nullifier lag, or its own epistemic bubbles would
be lying, and a reader who catches one lie discounts every other row. The table is the contract: each
Bounded/Partial row cites the mechanism that does the bounding and, where it exists, the simulation
that measured it.

---

## 15. Governance & licensing

### 15.1 Licensing

Spec: public, royalty-free, defensive patent pledge. Reference implementation: AGPL-3.0 (node/relay),
Apache-2.0 (`libhearth` core). The HEARTH trademark is held by the nonprofit Foundation; conformance
(§13) is required to use the name. There is no commercial-gateway clause: it would be unenforceable on
a network engineered to be unobservable, and v1's attempt is retained in history as the cautionary
example (v1 critique §1.8).

### 15.2 Foundation and electorate

Spec changes proceed by open RFC. Changes to reputation, penalty, quorum, or citation mathematics
require a defined electorate — Foundation members plus elected tribe delegates — with a public comment
period. **The electorate is explicitly not reputation-weighted**: the highest-standing actors must not
govern the rules that mint standing.

### 15.3 Steward sustainability and succession (new in v5)

Steward roles are unpaid, indefinite labor; the fediverse's blocklist-maintainer burnout is the
documented precedent [FEDI-BLOCK]. Accordingly: Steward positions have **terms** `(Parameter:
STEWARD_TERM, default 180 d, deployment-tunable)`; the threshold seal is **reshared** (FROST resharing)
at each rotation so departures do not strand key material; a tribe MUST maintain a minimum Steward
count (§4) and SHOULD stagger terms. A tribe whose Steward set falls below quorum enters a read-only
caretaker mode (§5.6) rather than an ungoverned one.

### 15.4 Schism semantics (new in v5)

Proof of Humanity's near-death came from a governance fork, not a sybil attack [POH-FORK]. HEARTH
defines the outcome in advance: the tribe *is* its seal lineage. A Steward faction that re-keys outside
the resharing rules creates a **new tribe identity** with an empty citation history; the Federation
sees both lineages, and each member's credentials remain valid in whichever lineage re-certifies them
at its next checkpoint. Forks are therefore expensive for the forkers and non-destructive for members —
the protocol makes schism a legible event rather than a capture vector.

---

## 16. Open questions & resolution process

Each deferred item names its blocker and its resolution path. Deferral is a claim boundary: the spec
asserts nothing about these beyond what is written here.

1. **Proximity/LAN ungated-tier abuse bound.** Blocker: needs field data from real gatherings, not
   simulation. Path: reference-implementation telemetry proposal + a v5.x parameter RFC.
2. **Feud-damping corroboration rule — DEFERRED on evidence (Appendix C.7).** The rule separates
   tit-for-tat feuds perfectly but wrongly mutes 93.5% of genuine mutual warnings when independent
   corroborating tribes are sparse. Mutual disputes stay blanket-damped (v4 behavior); the candidate
   relaxation (corroboration required on only the weaker side) returns as a v5.x RFC with new sim work.
3. **Wake/push for offline delivery without a metadata-bearing third party.** Blocker: platform
   constraints (§10.5); requirements are normative now, mechanism is implementation-defined.
4. **PQ migration of anonymous credentials.** Blocker: current PQ tokens are 85–175 KB and 0.3–5 s
   [CF-PQ] — unusable at Spark scale. Path: track CFRG; Sparks carry a suite identifier so a future
   SPARK-PQ-1 profile is additive.
5. **Byte-level encoding specification** (CBOR/CDDL) and a conformance test vector suite.
6. **Organic-growth validation.** Simulation (Appendix A.6) found no death-spiral at any chilling
   level, but a model of one arrival-rate regime is not field data, and the equilibrium-vs-tier-threshold
   discrepancy it exposed (§5.2.6) needs joint recalibration. Path: pilot tribes with published
   (privacy-preserving) growth telemetry + a parameter RFC.
6a. **Voucher-independence escalation form (§4.5).** The hard-block variant is sim-backed both ways
   (kills collusion clusters; blocks ~47% of honest admissions — Appendix A.5); the shipped escalation
   form is a post-simulation amendment whose own trade needs a follow-up sim before "validated" applies.
7. **Brigading via dispute signals.** Quorum + staking + rationale narrow the surface, but the failure
   mode is unsolved industry-wide (Bluesky's open issue [BSKY-19]); monitor and revisit.

Resolution process: an open question graduates only via a published RFC citing either simulation
results (Appendix A/B extension) or deployment evidence, through the §15.2 electorate.

---

## Appendix A — Member-level simulation evidence

Agent-based Monte-Carlo models: `hearth_v3_sim.py` (results `hearth_v3_sim_results.json`; tribe N=100,
daily steps, 120–400 seeds/cell) for A.1–A.4, and `hearth_v5_sim.py` (results `hearth_v5_sim_results.json`;
pure stdlib, 100–200 seeds/cell) for A.5–A.9. As with Appendix C: a model, not a proof — relative
comparisons across parameters are the signal, not absolute numbers.

**A.1 Decay half-life:** idle-retention table in §3.3 — H=90 balances bad-actor freshness against punishing intermittent honest users.
**A.2 Penalty gradient:** P_dir=0.25, g=0.35 → meaningful collateral ~3 hops; g is a pure spread knob (direct loss unchanged 0→0.7).
**A.3 Fraction quorum:** q=0.25 → 0% wrongful below 15% capture, reliable legitimate conviction up to q=0.30.
**A.4 Sybil farm:** ~14 days to Member tier from zero; bounded by issuance budget B=2/epoch.

(The federation/composite layer is pressure-tested separately in Appendix C, `hearth_federation_sim.py`.)

### A.5 Vouch-graph collusion / connectivity (S1)

Colluding cluster of size *c* (started via 2 duped honest vouchers, then mutually vouching itself) tries
to admit sybils under three rule sets. Honest-admission friction replays the SAME rules on organic honest
growth (70 honest admissions, 40% vouched by socially-close pairs — e.g. two friends who share a voucher),
evaluated against the graph state *as it stood at admission time* (not the final graph, which would
trivially "connect" every voucher pair through the child they jointly vouched).

| rule | cluster size | mean sybils admitted/90d | honest friction (all admissions) | honest friction (close-pair admissions) |
|---|---|---|---|---|
| baseline | 3 | 8.31 | 0.0% | 0.0% |
| baseline | 5 | 14.46 | 0.0% | 0.0% |
| baseline | 8 | 23.55 | 0.0% | 0.0% |
| independence | 3 | 0.0 | 47.0% | **100%** |
| independence | 5 | 0.0 | 47.0% | **100%** |
| independence | 8 | 3.11 | 47.0% | **100%** |
| independence+discount | 3 | 0.0 | 47.0% | **100%** |
| independence+discount | 5 | 0.0 | 47.0% | **100%** |
| independence+discount | 8 | 2.51 | 47.0% | **100%** |

**Recommendation:** independence+discount essentially eliminates colluding-cluster sybil admission
(cluster members sit ≤2 hops from each other via their own dense internal vouching, so nearly every
self-vouch pair fails the independence check) — the mechanism works as a sybil defense.

**FLAG — contradicts the backlog's "SIM S1 validates the parameterization" framing.** At the locked
default of h=2 hops, the independence rule blocks **100% of socially-close honest voucher pairs and ~47%
of all organic honest admissions** in this topology. That is not "validates the parameterization" — it is
evidence the h=2 default is too strict to ship as-is against real social graphs, where friends routinely
share a voucher. This went to v5 as a **DEFER / needs-relaxation** item: either raise h, soften the rule to
a friction-reducing variant (e.g. only block when *both* the hop-1 and shared-parent conditions fire), or
accept the friction as an intentional admission-slowdown and say so plainly in the spec rather than
presenting it as validated. §4.5 ships the escalation form as the disclosed resolution of this trade-off.

*Interpretation:* Simulated against a small-world honest vouch graph, the independence rule (h=2 hops)
defeats a colluding-cluster sybil farm (0–3 sybils/90d admitted vs 8–24 under baseline) but at a cost the
initial design underestimated: 100% of admissions vouched by socially-close pairs, and roughly half of all
organic admissions, are blocked under the same rule. This is a real trade-off, not a parameter bug — h
and/or the shared-parent clause need to be relaxed, or the friction accepted and disclosed, before this
mechanism ships as locked (§4.5, §16 item 6a).

### A.6 Growth & chilling (S2)

Founding tribe N0=8, Poisson candidate arrivals, B=2/epoch vouch budget, vouch propensity *=
(1-chill)^(penalty events in trailing 90d), infiltrator events at p=0.03/day.

| chill | median days to 50 members | P(never reach 50 by day 450) | P(stall, any 180d window after mo.3) | mean steady-member rep | dormancy vouch leaks |
|---|---|---|---|---|---|
| 0.0 | 110 | 0.0% | 0.0% | 0.646 | 0 |
| 0.2 | 110 | 0.0% | 0.0% | 0.646 | 0 |
| 0.5 | 118 | 0.0% | 0.0% | 0.644 | 0 |

**Recommendation:** growth is robust across the whole swept chill range — even chill=0.5 only pushes
median time-to-50 out by ~7% and never produces a stall or a non-arrival. `dormancy_vouch_leaks=0` in
every cell across all seeds validates the dormancy design (§4.10): an agent cycling dormancy never
appears in the vouch-eligible pool while dormant. Ship chill=0.2–0.5 with confidence — there is no
death-spiral risk in this model at the tested infiltration rate (3%/day); the chilling mechanism (§5.2) is
low-risk to growth. (The mean steady-member reputation figure of ≈0.65, versus the 1.0 design target, is
the equilibrium discrepancy disclosed at §5.2.6.)

### A.7 Spark budget curve (S3)

Shapes calibrated so f(rep=0.5) = 10.0 (30-day budget) for all three, for apples-to-apples comparison.

| shape | attacker mint/30d @ rep 0.5 | P(honest heavy sharer 0.6-0.9 throttled) | superadditive under 2-way split? |
|---|---|---|---|
| linear-above-gate | 10.0 | 13.2% | **No** (15.0 whole vs 12.5 split) |
| concave (sqrt) | 10.0 | 24.7% | **Yes — FLAGGED** (12.25 whole vs 15.81 split) |
| step (per-tier) | 10.0 | 27.1% | No (10.0 whole vs 7.0 split) |

Tribe-level aggregate cap at 3x expected honest demand (~10.2/30d) = ~30.6/30d — backstops only when the
tribe is small/quiet; it does not shrink a single attacker's own per-identity ceiling.

**Recommendation: ship linear-above-gate** (§7.6). It has the lowest honest-throttle probability *and* is
provably non-superadditive. The concave (sqrt) shape is mathematically guaranteed to be superadditive
under identity-splitting (sqrt is a textbook subadditive function: sqrt(a+b) <= sqrt(a)+sqrt(b) always) —
this is not a simulation artifact, it is a structural property of the shape, so concave should be
**rejected outright**, not just deprioritized. Step is non-superadditive but has the worst honest-throttle
rate of the three (flat tier ceiling clips heavy sharers near the top of a tier).

### A.8 Appeal-selection gameability (S4)

Attacker controls k of E eligible bridge tribes. Rule "single": one uniformly-drawn tribe decides. Rule
"double": two independently-drawn tribes must both agree to overturn.

| rule | E | k/E | P(wrongful conviction survives appeal) | P(legit conviction wrongly overturned) |
|---|---|---|---|---|
| single | 4 | 0.0 | 12% | 12% |
| single | 4 | 0.5 | 55% | 55% |
| single | 4 | 1.0 | 100% | 100% |
| double | 4 | 0.0 | 23% | 2% |
| double | 4 | 0.5 | 91% | 24% |
| double | 4 | 1.0 | 100% | 100% |

(Full E in {3,4,5,6,8} x every k in the JSON.) Under "single," attacker capture of the draw pool has an
*identical* effect on both failure modes — the mechanism is symmetric under model construction (equal
attacker malice and equal honest-tribe correctness in both directions), a clean structural result worth
stating in-spec.

**Recommendation:** the double-independent-draw rule cuts the baseline (k=0, honest appeal pool)
false-overturn rate from 12% to 2% — a large win when the appeal pool is clean — but its wrongful-survival
rate is *worse* than single-draw once an attacker controls even 1 of a small pool (needing only one of two
draws to land on a captured tribe is nearly as easy as needing the single draw to land there, while the
"both must agree" bar makes it harder to *overturn* anything, wrongful or not). Ship double-draw as the
default (§6.7) (better false-overturn protection matters more for legit convictions), but flag that it
does not meaningfully improve wrongful-conviction survival over single-draw at k/E >= 0.25 — the real
defense against appeal-pool capture is keeping E large and vetted (m=3 shared-member / <=50% overlap
eligibility), not the draw rule itself.

### A.9 Small-tribe quorum (S6)

N in {5,8,12,16,20}; rule (a) baseline max(3,ceil(0.25N)); rule (b) "half" max(3,ceil(0.5N)); rule (c)
"appeal_window" = rule (b) + honest single-tribe appeal (p_correct=0.85, per S4's vote model).

| N | rule | capture frac | quorum | P(wrongful conviction) | P(legit conviction reliable) |
|---|---|---|---|---|---|
| 8 | baseline | 0.50 | 3 | **92%** | 47% |
| 8 | half | 0.50 | 4 | 59% | 16% |
| 8 | appeal_window | 0.50 | 4 | **12%** | 14% |
| 12 | baseline | 0.33 | 3 | **92%** | 96% |
| 12 | half | 0.33 | 6 | **0%** | 28% |
| 12 | appeal_window | 0.33 | 6 | 0% | 26% |
| 20 | baseline | 0.30 | 5 | **81%** | 99% |
| 20 | half | 0.30 | 10 | **0%** | 30% |
| 20 | appeal_window | 0.30 | 10 | 0% | 22% |

(Full N x rule x capture_frac grid in the JSON.)

**Recommendation:** the v4 baseline (q=0.25) is badly under-defended below N~16 — at N=12, 33% capture
already wrongfully convicts 92% of the time. The 50%-rule closes this almost completely (0% wrongful at
33-50% capture for N>=12) but at a real reliability cost to legit convictions (drops from ~96-100% to
22-30% at the same N). The appeal-window addition buys back a little more wrongful-conviction suppression
at small N (8: 59%->12%) with only a modest further reliability hit and adds 5-8 days latency. Ship rule
(c) [50% + appeal window] for active_size < 12 (§6.3), but flag the reliability trade explicitly in-spec:
a genuinely bad actor in a small tribe becomes meaningfully harder to convict at all (legit-conviction
reliability roughly halves-to-thirds under the 50% rule) — this is the honest cost of closing the capture
hole, not a free win.

---

## Appendix B — Worked example: the personalized composite

Reader **R** belongs to two tribes:

- **Religious tribe** — R's standing w₁ = 0.8
- **Fantasy Book Club** — R's standing w₂ = 0.5

Target tribe **T = Horror Movie tribe**. The two tribes regard it differently:

- Religious tribe disputes it: r₁(T) = **−0.4**
- Fantasy Book Club cites it: r₂(T) = **+0.6**

**Composite (§9.4):**

> S_R(T) = (0.8 × −0.4 + 0.5 × +0.6) / (0.8 + 0.5) = (−0.32 + 0.30) / 1.3 = **−0.015 ≈ neutral**

The headline number is ~neutral — but that is the *least* interesting part. The decomposition R sees on tap
is the real signal:

| R's tribe | R's standing | Opinion of Horror tribe |
|---|---|---|
| Religious tribe | 0.80 | −0.40 (disputed) |
| Fantasy Book Club | 0.50 | +0.60 (cited) |

R learns: "the part of me that's in the religious tribe distrusts this; the part that's in the book club
likes it." The protocol reports the divergence faithfully and lets R decide. A different reader — say, one
in two horror-adjacent tribes — would compute a strongly positive composite for the very same target.
There is no contradiction, because there is no global truth being claimed: only who, from where, regards
whom.

---

## Appendix C — Federation pressure-test evidence

Model `hearth_federation_sim.py`. A block-structured federation (4 epistemic "blocs" × 8 tribes) with
within-bloc positive citations, sparse cross-bloc citations, and cross-bloc disputes between opposed blocs.
Adversaries injected: collusion rings, a duped bridge citation, a high-internal-standing sybil tribe, a
reader lured into a low-standing malicious tribe, and reciprocal feuds. As with Appendix A: a model, not a
proof.

**C.1 Ring-resistance & sybil tribes — PASS (strongest result).** A collusion ring (6 tribes citing each
other at weight 1.0 + a payload tribe), and separately a sybil tribe with 0.9 internal standing but no
inbound citations, both return **unrated** from any honest reader whose vantage doesn't cite them — at
every γ. Federation standing must be received from inside the reader's trust neighborhood; it cannot be
self-minted.

**C.2 Transitive hop & γ — FIXED.** The one contamination path is a single duped citation from an
in-vantage tribe to the ring:

| Config | Payload composite in duped reader |
|---|---|
| No bridge, any γ | unrated |
| 1 duped bridge, γ = 0.0 | 0.00 |
| 1 duped bridge, γ = 0.3 | 0.147 |
| 1 duped bridge, γ = 0.5 | 0.245 (~70% of a normal cross-bloc trust level) |
| 1 duped bridge, γ = 0.7 | 0.343 |
| **Mitigation: transitive OFF (hop 0)** | **unrated** |
| **Mitigation: require ≥2 independent bridges** | **unrated** |

→ Resolution: transitive flow off by default; if enabled, γ ≤ 0.3 and ≥2 bridges.

**C.3 Composite weighting — FLAW FOUND & FIXED.** Reader established in an honest tribe (standing 0.9,
abstains on target) and lured into a malicious tribe (standing 0.1, rates payload +1.0):

| Weighting | Composite | Coverage | Verdict |
|---|---|---|---|
| Standing-weighted | +1.0 | 0.10 | naive value is dangerously overconfident |
| Equal | +1.0 | 0.50 | same |

Standing-weighting does not save the reader, because the abstaining honest tribe drops out of the
denominator. Fix shipped in §9.4: report coverage, require coverage ≥ 0.25, and render single-opining-tribe
results in the single-source form (v5 dropped the v4 ≥2-opining floor on the S5 sweep evidence, Appendix
C.6). Coverage = 0.10 here → correctly flagged weak under both the v4 and v5 rules.

**C.4 Divergence (feature check) — PASS.** Same target tribe scored +0.34, +0.20, +0.29 (weak,
single-source), and −0.13 by readers anchored in the four different blocs — divergence preserved, opposed
bloc negative, thin-coverage vantage correctly flagged.

**C.5 Feud damping — PARTIAL.** A one-sided dispute stays at full weight (−0.8); a mutual feud with
damping is discounted (−0.8 → −0.32). Works as designed, but see §9.6: damping mutual disputes also mutes
two tribes that may both be correctly warning about each other — the corroboration refinement was
simulated (Appendix C.7, S7) and **deferred**: it separates feuds perfectly but wrongly mutes genuine
mutual warnings 93.5% of the time in sparse federations.

### C.6 Coverage-threshold sweep (S5)

Sweep (min_opining in {1,2,3,4}) x (coverage_floor in {0.10,0.15,0.25,0.35,0.50}) against a lure-attack
scenario (reader's only opinion is a low-standing malicious tribe, +1.0) and an honest-thin-coverage
scenario (one legitimate high-standing tribe opines correctly, others abstain).

| min_opining | coverage_floor | P(lure shown confident) | P(honest thin suppressed) |
|---|---|---|---|
| 1 | 0.10 | 74% | 0% |
| 1 | 0.15 | 40% | 0% |
| **1** | **0.25** | **0%** | **7%** |
| 1 | 0.35 | 0% | 34% |
| 1 | 0.50 | 0% | 71% |
| 2 | any | 0% | **100%** |
| 3-4 | any | 0% | **100%** |

**Recommendation (Pareto knee): min_opining=1, coverage_floor=0.25.** This zeroes the lure-attack rate
while suppressing only 7% of genuinely-thin-but-legit single-tribe opinions.

**FLAG — contradicts the v4-locked "≥2 distinct opining tribes" floor carried into the backlog.** With
min_opining>=2, the honest-thin-coverage scenario (exactly one established, high-standing tribe correctly
opines; everything else in the reader's vantage abstains) is marked "weak" **100% of the time, at every
coverage floor**. That is mechanically guaranteed — a single opining tribe can never satisfy
min_opining>=2 — and it is exactly the over-suppression risk the backlog's own carryover worried about
("needs UX testing so honest thin-coverage cases aren't over-suppressed"). The coverage_floor alone (with
min_opining=1) fully suppresses the lure case at 0.25+; the min_opining>=2 floor adds no additional lure
protection in this model and costs 100% of the single-informed-tribe case. This was a **DEFER/reconsider
item**: v5 (§9.4) resolves it by dropping the ≥2-opining floor and relying on coverage_floor=0.25 alone,
with a distinct, weaker "single-source" display status for the single-informed-tribe case rather than
either a full composite or "weak."

### C.7 Feud-damping corroboration (S7)

Mutual disputes retain full weight iff each side is corroborated by >=1 independent tribe; else damped
x0.4. Corroboration is modeled as truth-correlated: an independent tribe corroborates a **genuine** mutual-
warning target with probability p_corr (swept); it coincidentally "corroborates" a **baseless** tit-for-tat
target with a fixed low background rate (0.08) — the naive symmetric model (same p_corr regardless of
truth) mathematically forces zero separation between the two cases by construction, so it was replaced
with this truth-correlated version to make the test meaningful at all.

| scenario | p_corr | P(damped) | P(correct outcome) |
|---|---|---|---|
| tit-for-tat (baseless) | 0.3 / 0.6 / 0.9 | 100% | **100%** |
| true mutual warning | 0.3 | 93.5% | **6.5%** |
| true mutual warning | 0.6 | 59.5% | **40.5%** |
| true mutual warning | 0.9 | 20.0% | **80.0%** |
| one-sided legit dispute | any | 0% | 100% (rule correctly never applies) |

Separation (tit-for-tat correct rate minus true-mutual false-damp rate): 0.065 @ p_corr=0.3, 0.405 @ 0.6,
0.8 @ 0.9.

**Recommendation: DEFER as currently specified, ship conditionally.** The rule reliably suppresses
baseless tit-for-tat feuds at every corroboration density tested (100% correct). But it only correctly
*preserves* a genuine mutual warning when independent corroborating tribes are common (p_corr>=0.9 gives
80% correct; p_corr=0.3, plausible in a sparse federation, gives only 6.5% correct — a true mutual warning
is wrongly muted 93.5% of the time). Requiring corroboration from *both* sides compounds the sparsity
problem (needs two independent successes). Per §9.6/§16, v5 ships the v4 blanket mutual-discount as the
default and carries this corroboration refinement forward as an open question, with the candidate
relaxation of requiring corroboration on only the weaker side.

---

## Appendix D — Parameter table

Every `(Parameter: ...)` tag occurring in the body of this specification, compiled below. Status values
are as defined in §0.2.

| Parameter | Default | Status | Evidence | Defined in § |
|---|---|---|---|---|
| `EPOCH_LEN` | 24 h | provisional | — | §2.4 |
| `DEVICE_PROBATION_DURATION` | 3 epochs (72 h) | provisional | none — carried v4 qualitative intent, R1 identity-rental discussion | §3.5 |
| `THRESHOLD_ROOT_DEFAULT` | 2-of-3 | deployment-tunable | none — carried from v4 §2.5 qualitative default | §3.6 |
| `RECOVERY_TIME_LOCK` | 7 epochs | provisional | none — v4 §2.5 qualitative | §3.7 |
| `TIER_MEMBER` | 0.10 | sim-backed | Appendix A | §4.2 |
| `TIER_TRUSTED` | 0.40 | sim-backed | Appendix A | §4.2 |
| `TIER_STEWARD_ELIGIBLE` | 0.75 | sim-backed | Appendix A | §4.2 |
| `ANCHOR_INITIAL_REPUTATION` | 0.50 | provisional | none — deployment-tunable per tribe | §4.1 |
| `B_VOUCH` | 2 per rolling window | sim-backed | Appendix A.4 | §4.3 |
| `VOUCH_WINDOW` | 30 epochs (~30 days) | sim-backed | Appendix A.4 | §4.3 |
| `PROXIMITY_EXPIRY` | 10 minutes | provisional | none | §4.4 |
| `VOUCH_INDEPENDENCE_HOPS` (h) | 2 | sim-backed | Appendix A.5 (S1) | §4.5 |
| `KIN_PROBATION` | 45 epochs | provisional | none | §4.5 |
| `KIN_STAKE_MULT` | 1.5, compounding to 2.25× etc. per repetition by the same voucher pair within a rolling 365-day window | provisional | none | §4.5 |
| `KIN_NEIGHBORHOOD_WINDOW` | 30 epochs | provisional | none | §4.5 |
| `k_target` | 2 | sim-backed (directional) | Appendix A.5 (S1) | §4.6 |
| `CONNECTIVITY_SEARCH_DEPTH` | 6 hops | provisional | none | §4.6 |
| `LINKAGE_HALF_LIFE` | = `H` | provisional | none | §4.7 |
| `BASE_BRIDGE_WEIGHT` | 0.05 | provisional | none — carried mechanism from v3/v4 | §4.9.1 |
| `BRIDGE_WEIGHT_CAP` | 0.05 | provisional | none — carried mechanism from v3/v4 | §4.9.1 |
| `BRIDGE_INITIAL_BOOST` | 0.05 (below `TIER_MEMBER`) | provisional | none | §4.9 |
| `MIN_BRIDGE_SOURCE_AGE` | 90 epochs | provisional | none | §4.9 |
| `MIN_BRIDGE_SOURCE_SIZE` | 12 active members | provisional | none | §4.9 |
| `DORMANCY_FLOOR_MODE` | policy choice | provisional | — | §4.10 |
| `DORMANCY_MAX_DAYS` | 180 | sim-backed | Appendix A.6 (S2) | §4.10 |
| `DORMANCY_ROLLING_WINDOW` | 365 days | sim-backed | Appendix A.6 | §4.10 |
| `DORMANCY_COOLDOWN` | 60 days | sim-backed | Appendix A.6 (zero dormancy vouch-leaks across every seed/chill level) | §4.10 |
| `DORMANCY_PROBATION` | 14 days | provisional | none — mirrors §3.5's device-probation pattern | §4.10 |
| `B_E(Member)` / `B_E(Trusted)` / `B_E(Steward-eligible)` | per-tier, deployment-set | provisional | Appendix A.6 (S2), exercised as defaults | §5.2.1 |
| `δ` | 0.5 | provisional | Appendix A.6 (S2), exercised as default | §5.2.2 |
| `tier_multiplier(Member)` | 1.0 | provisional | Appendix A.6 (S2), exercised as default | §5.2.3 |
| `tier_multiplier(Trusted)` | 1.5 | provisional | Appendix A.6 (S2), exercised as default | §5.2.3 |
| `tier_multiplier(Steward-eligible)` | 2.0 | provisional | Appendix A.6 (S2), exercised as default | §5.2.3 |
| `PROXIMITY_MULTIPLIER` | 1.0 | provisional | Appendix A.6 (S2), exercised as default | §5.2.4 |
| `REMOTE_MULTIPLIER` | 0.4 | provisional | Appendix A.6 (S2), exercised as default | §5.2.4 |
| `H` | 90 days | sim-backed | Appendix A.1 | §5.3 |
| `CHECKPOINT_DISPUTE_WINDOW` | 3 epochs | provisional | none | §5.5.3 |
| `DISPUTE_ABUSE_THRESHOLD` | 3 rebuttals / 90 epochs → 30-epoch suspension | provisional | none | §5.5.3 |
| `WITNESS_K` | 2 | provisional | none — no sim targets this parameter specifically | §5.6 |
| `WITNESS_N` | = number of bridge-partner tribes | provisional | none | §5.6 |
| `COMPLAINT_RATE_LIMIT` | 1 per member per epoch | provisional | none — carried mechanism from v3/v4 | §6.1 |
| `RETALIATION_WINDOW` | 30 days | provisional | none | §6.2 |
| `CASE_WINDOW` | 60 days | provisional | none — carried v3/v4 pattern | §6.4 |
| `APPEAL_WINDOW` | 14 days | provisional | none | §6.4 |
| `PENALTY_CAP_PER_INCIDENT` | 0.30 (of conviction-checkpoint reputation) | provisional | none | §6.6 |
| `PENALTY_CAP_AGGREGATE` | 0.40 (of conviction-checkpoint reputation per rolling 30 epochs) | provisional | none | §6.6 |
| `P_dir` | 0.25 | sim-backed | Appendix A.2 | §6.6 |
| `g` | 0.35 (tunable 0.20–0.40) | sim-backed | Appendix A.2 | §6.6 |
| `m` (appeal-tribe eligibility) | 3 | provisional | none — carried from backlog design | §6.7 |
| `APPEAL_DELIBERATION_WINDOW` | (deployment-set) | provisional | none | §6.7 |
| `SPARK_EXPIRY_HORIZON` | 2 epochs (matches `NULLIFIER_RETENTION_EPOCHS`) | provisional | none | §7.2.1 |
| `NULLIFIER_RETENTION_EPOCHS` | 2 | provisional | [RLN] | §7.5 |
| `NULLIFIER_BLOOM_FPR` | 0.001 | deployment-tunable | [RLN] | §7.5 |
| Spark budget curve shape | linear-above-gate | sim-backed | Appendix A.7 (S3) | §7.6 |
| `α` (Spark budget scaling constant) | (deployment-set) | deployment-tunable | — | §7.6 |
| `BEACON_ENDORSE_K` | 3 | deployment-tunable | v4 §6.2, no independent sim | §8.3 |
| `BEACON_RETRACT_PENALTY` | 0.25 (reuses `P_dir`) | deployment-tunable | reuse of §6.2 calibration, no independent Beacon-specific sim | §8.4 |
| `SELF_RETRACT_FACTOR` | 0.4 × `BEACON_RETRACT_PENALTY` | provisional | R4 retraction-stigma research | §8.4 |
| `BEACON_RETRACT_ESCALATION_WINDOW` | 365 days | provisional | rationale-only, no sim | §8.4 |
| `BEACON_RETRACT_ESCALATION_MULT` | 1.0× / 1.5× / 2.0× | provisional | rationale-only, no sim | §8.4 |
| `BEACON_STATUS_FRESHNESS` | 1 epoch (24 h) | provisional | — | §8.7 |
| `CITATION_HALFLIFE` | 365 days | deployment-tunable | v4 §7.1, qualitative | §9.2 |
| `DISPUTE_HALFLIFE` | 90 days (reuses Ember decay half-life) | provisional | qualitative, no independent sim | §9.3 |
| `COMPOSITE_COVERAGE_FLOOR` | 0.25 | sim-backed | Appendix C.6 (S5) | §9.4 |
| `MLS_SEQUENCER_ROTATION_PERIOD` | 1 protocol epoch | provisional | — | §10.2.1 |
| `MLS_SEQUENCER_LIVENESS_TIMEOUT` | small multiple of expected RTT | deployment-tunable | — | §10.2.1 |
| `MLS_FAIRNESS_MULTIPLE` | 3× median sequencing latency | provisional | none | §10.2.1 |
| `PARTITION_SCHISM_TIMEOUT` | 30 epochs | provisional | none | §10.2.1 |
| `SYNC_CHECKPOINT_WINDOW_K` | 30 checkpoints (≈30 epochs) | deployment-tunable | — | §10.3.1 |
| `MAILBOX_TTL` | 14 days | deployment-tunable | — | §10.4 |
| `MAILBOX_MAX_BYTES` | (deployment-set) | deployment-tunable | — | §10.4 |
| `MAILBOX_MAX_ENTRIES` | (deployment-set) | deployment-tunable | — | §10.4 |
| `MDNS_DEFAULT_MODE` | foreground-only/on-demand | deployment-tunable | [BRIAR] field lesson | §11.1 |
| `RELAY_FRACTION_PLANNING` | 10–30% of connections | provisional | [IROH], [LIBP2P-DCUTR] — external benchmark, not a HEARTH-specific sim | §11.3 |
| `RELAY_BUDGET_BY_TIER` | function of tier (deployment-set) | deployment-tunable | none — capacity-planning knob, not a security parameter | §11.4 |
| `STEWARD_TERM` | 180 days | deployment-tunable | none | §15.3 |

**Consistency check.** No parameter in this draft was found tagged with mutually-inconsistent defaults or
status labels across different sections. A handful of values are *reused by reference* rather than
re-declared — `H` (§5.3) underlies `LINKAGE_HALF_LIFE`'s default (§4.7); `P_dir` (§6.6) underlies
`BEACON_RETRACT_PENALTY`'s default (§8.4); the `q = 0.25` fraction from §6.3 is reused (not re-tagged) as
the appeal-quorum fraction in §6.7. These are intentional reuses, not conflicts, but the byte-level encoding
spec (§16 item 5) should make each reuse an explicit reference rather than a re-literalized constant, so a
future change to the base parameter propagates correctly.

---

## Appendix E — Version history

- **v1** — original narrative product specification: Ember/vouch/tribe concepts introduced informally, no
  simulation, no formal threat model.
- **v1 critique** — internal review identifying structural gaps: the reputation-conservation problem, click-farm
  attestation gaming, DHT presence-enumeration leakage, checkpoint-authority ambiguity, and others — closed
  piecemeal across v2–v5.
- **v2** — introduced the two-layer identity model (root + devices), Embers as the reputation credential,
  and negative signal (complaints/penalties) as a first-class mechanism.
- **v3** — first sim-calibrated version: decay half-life, penalty gradient, quorum fraction, and sybil-farm
  timing parameters set against `hearth_v3_sim.py` (Appendix A.1–A.4).
- **v4** — added the Beacon (attributed public publication with staked endorsement and retraction) and the
  Federation (inter-tribe citation/dispute layer with the personalized composite), pressure-tested with
  `hearth_federation_sim.py` (Appendix C).
- **v5 (this document)** — a ground-up normative rewrite in BCP-14 style with field-level record definitions
  and state machines; new mechanisms (KT-style device log, Ember issuance mechanics, voucher independence
  and connectivity discount, retaliation discount, small-tribe quorum, graduated Beacon retraction, witness
  cosigning, sequencer-Steward MLS, epoch-scoped nullifiers, mandatory dispute rationale, schism semantics);
  seven new simulations S1–S7 (Appendices A.5–A.9, C.6–C.7), two of which overturned a locked draft decision
  (S1, S5) and one of which was deferred rather than shipped (S7); and one honest correction (the bare-Tor
  claim against a global passive adversary, withdrawn in §7.8).

---

## References

- **[ADVOGATO]** Advogato trust metric and Jesse Ruderman's 2005 break of its attack-resistance proof
  (pre-attack vs. post-attack capacity bug). https://www.squarefree.com/2005/05/26/advogato/
- **[ARC]** `draft-ietf-privacypass-arc-protocol` / `draft-ietf-privacypass-arc-crypto` — Anonymous
  Rate-Limited Credentials (Yun, Wood, Faz-Hernandez), IETF PRIVACYPASS WG, active draft 2026.
- **[BBS-HOLDER-BINDING]** "A Specification of an Anonymous Credential System Using BBS+ Signatures with
  Privacy-Preserving Revocation and Device Binding," eprint 2025/824. https://eprint.iacr.org/2025/824
- **[BBS-SIG]** `draft-irtf-cfrg-bbs-signatures` (IRTF CFRG, Informational); W3C Data Integrity BBS
  Cryptosuites v1.0. https://datatracker.ietf.org/doc/draft-irtf-cfrg-bbs-signatures/ ;
  https://www.w3.org/TR/vc-di-bbs/
- **[BBS-THRESHOLD]** "Threshold BBS+ Signatures for Distributed Anonymous Credential Issuance" (eprint
  2023/602).
- **[BLUESKY]** Bluesky AT Protocol stackable moderation (Ozone labelers). Production validation of
  composable, personalized, no-global-verdict architecture at scale (43M+ registered users since March
  2024); documented January 2025 labeler-as-brigading-vector incident; open unresolved issue
  bluesky-social/proposals#19.
- **[BRIAR]** Briar Project field/UX documentation and reviews; Bramble protocol suite; documented ~4x
  battery cost and foreground-only sync limitation; Iran 2026 shutdown field validation of offline/mesh
  mode. https://briarproject.org/how-it-works/ ;
  https://gusandrews.medium.com/expert-review-briar-a-p2p-messaging-app-33413034005f
- **[BRIGHTID]** BrightID GroupSybilRank / AntiSybil, "duplicate groups" attack taxonomy.
  https://github.com/BrightID/BrightID-AntiSybil
- **[BSKY-19]** bluesky-social/proposals#19 — open issue on preventing labeler misuse for
  targeting/abuse.
- **[BSKY-MOD]** Bluesky stackable moderation blog, 2024-03-12.
- **[C2PA]** C2PA Specification v2.4 / Content Credentials, Explainer. Signed manifest, hash-tombstone
  redaction, "provenance not truth" framing; dominant failure mode is metadata stripping by re-encoding
  pipelines.
- **[CF-PQ]** Cloudflare Research, "Policy, privacy and post-quantum: anonymous credentials for everyone"
  (2025-10-28). https://blog.cloudflare.com/pq-anonymous-credentials/
- **[CHENG-FRIEDMAN]** Cheng & Friedman, "Sybilproof Reputation Mechanisms" (2005).
  https://dl.acm.org/doi/10.1145/1080192.1080202
- **[CIRCLES]** Circles UBI whitepaper; trust-limit design (independent convergent precedent for overlap
  discounting). https://github.com/CirclesUBI/whitepaper
- **[CLOUDFLARE-PQ]** Cloudflare Research, "Post-Quantum Privacy Pass via Post-Quantum Anonymous
  Credentials" (Policharla et al.); Cloudflare Blog, "Policy, privacy and post-quantum" (Oct 2025).
  https://blog.cloudflare.com/pq-anonymous-credentials/ ;
  https://research.cloudflare.com/publications/Policharla2023/
- **[CROSSREF]** Retraction Watch / Crossref graduated retraction typing (Retraction / Expression of
  Concern / Correction) and documented academic under-retraction stigma evidence.
- **[CT]** RFC 6962 / RFC 9162, Certificate Transparency. Gossip-auditing layer specified, never
  organically deployed in production.
- **[CT-GOSSIP]** RFC 9162 (Certificate Transparency v2.0) §security-considerations (gossip out of scope)
  and the documented non-deployment of its gossip layer; "Efficient Gossip Protocols for Verifying
  Consistency of Certificate Logs," arXiv:1511.01514. https://www.rfc-editor.org/rfc/rfc9162.html ;
  https://arxiv.org/pdf/1511.01514
- **[CWTCH]** Cwtch's multi-year retrofit of group semantics onto the 1:1-first Ricochet protocol.
- **[EBAY]** eBay feedback retaliation dynamics (>37% retaliation rate vs. <0.3% baseline).
  https://arxiv.org/pdf/1102.4602
- **[FEDI-BLOCK]** arXiv:2506.05522; Seirdy blocklist-maintainer-burnout writeup.
- **[FEDIVERSE]** Fediverse defederation practice (FediBlock, Mastodon blocklists, Playvicious.social,
  Seirdy blocklist-maintainer burnout). Empirical evidence for dispute-transparency requirements,
  off-protocol retaliation against disputing parties, and unmitigated tit-for-tat feud stacking; only
  20.1% of Mastodon instances publicly share blocklists, fewer than half give a reason.
- **[FROST]** Komlo & Goldberg, "FROST: Flexible Round-Optimized Schnorr Threshold Signatures" (SAC 2020).
- **[HOLDER-BIND]** "A Specification of an Anonymous Credential System Using BBS+ Signatures with
  Privacy-Preserving Revocation and Device Binding," eprint 2025/824. https://eprint.iacr.org/2025/824
- **[HOLDER-BINDING]** Holder-binding credentials, eprint 2025/824 (same underlying source as
  [HOLDER-BIND] / [BBS-HOLDER-BINDING]; carried under this shortname from the §4/§5 drafting agent).
- **[IROH]** n0-computer, iroh 1.0 (June 2026) measured NAT-traversal/relay statistics.
  https://github.com/n0-computer/iroh ; https://www.iroh.computer/blog/comparing-iroh-and-libp2p
- **[KEYTRANS]** IETF KEYTRANS WG, `draft-ietf-keytrans-architecture` (active, 2026; -08 draft cited).
  Label/value log; Search/Update/Monitor roles; fork-and-stick; majority-threshold anti-subset-forking;
  WhatsApp/Cloudflare production precedent. https://datatracker.ietf.org/doc/draft-ietf-keytrans-architecture/ ;
  https://engineering.fb.com/2023/04/13/security/whatsapp-key-transparency/ ;
  https://blog.cloudflare.com/key-transparency/
- **[KEYTRANS-PROTO]** IETF KEYTRANS WG, `draft-ietf-keytrans-protocol` (active, 2026).
  https://datatracker.ietf.org/doc/draft-ietf-keytrans-protocol/
- **[LIBP2P-DCUTR]** Large-scale DCUtR/IPFS NAT traversal measurement. https://arxiv.org/html/2604.12484 ;
  "Challenging Tribal Knowledge," https://arxiv.org/abs/2510.27500
- **[LIBP2P-DCUTR-ECON]** libp2p Circuit Relay v2 economics (free, capped, low-processing-cost volunteer
  relaying at global swarm scale). https://libp2p.io/docs/circuit-relay/ ;
  https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md
- **[MERITRANK]** MeritRank: Sybil Tolerant Reputation for Merit-based Tokenomics (2022).
  https://arxiv.org/html/2207.09950
- **[MLS]** RFC 9420, "The Messaging Layer Security (MLS) Protocol." https://www.rfc-editor.org/rfc/rfc9420.html
- **[MSC4244]** Matrix Spec Proposal 4244, "RFC 9420 MLS for Matrix" — sequencer-hub delivery-service
  pattern.
- **[NYM]** Nym mixnet design documentation and comparison to Tor/I2P.
- **[POH]** Proof of Humanity: vouch-locking and single-hop binary penalty removal; Kleros PoH docs.
  https://blog.kleros.io/proof-of-humanity-an-explainer/
- **[POH-FORK]** Lesaege, "Making sense of recent drama in Proof of Humanity" — the 2022 governance-fork
  attempt on PoH's Kleros dispute-adjudication substrate.
  https://medium.com/@ClementLesaege/making-sense-of-recent-drama-in-proof-of-humanity-ccf3082eb0fa
- **[PQ-ANON-CF]** Cloudflare Research, "Policy, privacy and post-quantum: anonymous credentials for
  everyone" (Oct 28, 2025); Policharla et al., "Post-Quantum Privacy Pass via Post-Quantum Anonymous
  Credentials." https://blog.cloudflare.com/pq-anonymous-credentials/ ;
  https://research.cloudflare.com/publications/Policharla2023/
- **[R1]** research-R1 findings file (internal; vouch-reputation survey; survey table lands in
  HEARTH-prior-art.md).
- **[R1-GIG]** Prior-art research memo R1 (identity-rental prevalence in gig-economy account sharing,
  25–33% figure), as cited in `v5-hardening-backlog.md` §1.
- **[R2-DMLS]** `draft-kohbrok-mls-dmls`; `draft-xue-distributed-mls`; Phoenix R&D "Making MLS more
  decentralized" (DMLS/FREEK); De-MLS with Waku — all research-stage, no production deployment as of 2026.
- **[RETROSHARE]** Retroshare's 20-year friend-to-friend cold-start ceiling.
- **[RFC2119]** / **[RFC8174]** BCP 14 key-word conventions.
- **[RFC9162]** Certificate Transparency v2 (RFC 9162). https://www.rfc-editor.org/rfc/rfc9162.html
- **[RLN]** Rate-Limiting Nullifier (PSE); WAKU-RLN-RELAY. https://arxiv.org/abs/2207.00117
- **[RSA-BLIND]** RFC 9474 — RSA Blind Signatures with Appendix.
- **[RSA-THRESHOLD]** Lehmann, Nazarian, Özbay, "Stronger Security for Threshold Blind Signatures,"
  EUROCRYPT 2025 (eprint 2025/353).
- **[SIGNAL-KVAC]** Chase, Perrin, Zaverucha, "The Signal Private Group System and Anonymous Credentials
  Supporting Efficient Verifiable Encryption" (eprint 2019/1416).
- **[SIGNAL-RATCHET-PRIOR-ART]** Signal's Double Ratchet algorithm (Perrin, Marlinspike).
- **[SIGNAL-TRAFFIC-ANALYSIS]** "No safety in numbers: traffic analysis of sealed-sender groups in
  Signal" (arXiv 2305.09799).
- **[SIGSTORE]** Sigstore (Fulcio/Rekor). Layered independent-component trust model; "someone must
  actively monitor" lesson; `rekor-monitor`.
- **[SIGSUM]** Sigsum witness cosigning (k-of-n, verify-extend-sign, no blockchain), building on Syta et
  al. CoSi/Chainiac decentralized witness cosigning, arXiv:1503.08768.
- **[SSB]** Secure Scuttlebutt big-feed OOM failure mode; Staltz/Manyverse post-mortems.
- **[TOR-GPA]** "Achieving Sender Anonymity in Tor against the Global Passive Adversary" (MDPI 2022); Tor
  Project's own documented non-goal re: global passive adversaries.
- **[v1-critique]** HEARTH-v1-critique.md §1.1, §1.2, §1.3, §1.12, §3.3–3.6 (internal document; source of
  the reputation-conservation problem, the click-farm-hardening discussion, the DHT presence-enumeration
  discussion, and the checkpoint-privacy requirement this spec closes).
- **[VERTEX]** Vertex (Nostr personalized PageRank web-of-trust service). Validates
  personalized-PageRank-from-own-graph math; cautionary example of trust computation re-centralizing at
  an off-protocol oracle absent a native staked reputation primitive.
- **[WILLOW]** Willow protocol / Meadowcap capability system / Sideloading protocol (Earthstar project).
- **[ZCASH-NULLIFIER]** zcash/zcash GitHub issue #1390, "Forever growing nullifier set."
