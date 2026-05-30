# HEARTH Protocol — Product Specification v4

**HEARTH**: *Human-Endorsed Authenticated Relay & Transfer Hub*

A peer-to-peer communication, content-distribution, and **publication** standard for **tribes** — small, bridgeable communities of people who vouch for each other. Trust is earned through human vouching, accountability flows back to the vouchers, and a tribe's public reputation is a *signal carried by the federation of tribes*, never a verdict on truth.

> **Changes from v3:** adds the public face of a tribe. (1) The **Beacon** (§6) — attributed, publicly-verifiable publication of tribe artifacts (RFCs, research, datasets) backed by an endorsement quorum that *stakes* reputation and can be *retracted with penalty*. (2) The **Federation** (§7) — an inter-tribe reputation layer where tribes cite (and, with quorum, dispute) other tribes, and every reader sees a **personalized composite score computed from their own tribe affiliations**, decomposable into per-tribe opinions. The protocol certifies *provenance and reputation*, explicitly **not** truth.

---

## 0. Design thesis

HEARTH is explicitly **anti-global-scale** — a reputation system with decay cannot and should not span the planet. It is built for **tribes**: Dunbar-sized groups bound by mutual human vouching, optionally bridged, and loosely federated.

Three primitives carry the design:

1. **The Ember** — a non-transferable, decaying reputation credential earned by good-faith participation and lost through bad behavior or by vouching for bad actors.
2. **Vouching with skin in the game** — you join a tribe only when ≥2 existing members vouch for you, and their standing is staked on your conduct; misconduct propagates back up the vouch chain, decaying with distance.
3. **Reputation as a signal, not a verdict** — internally it gates membership; on the Beacon it provides verifiable provenance for what a tribe publishes; across the Federation it produces a per-reader reputation signal. At no layer does the protocol claim to certify that content is *correct*. A tribe may publish nonsense; it simply wears its standing in public.

---

## 1. Goals & non-goals

### Goals
1. End-to-end encrypted communication and file/content transfer, secure against any third-party interception (req. 1).
2. Fully open standard and reference implementation (req. 2).
3. First-class mobile and desktop support; identity that ports cleanly across a person's devices (req. 3).
4. Optimized for prosocial tribal use: personal communication, intra-community file sharing, sender-unlinkable one-to-many distribution, and **publicly-verifiable attributed publication** (req. 4).
5. Structural disincentives against automated/industrial-scale abuse, enforced through vouching accountability (req. 5).
6. Pseudonymous-by-default with an earned, decaying reputation layer; anonymous intra-tribe distribution *and* attributed public publication as distinct modes (req. 6).
7. Novel architecture: vouch-staking + transitive penalty + anonymous rate-limited distribution + staked retractable publication + personalized federation reputation is not an existing standard (req. 7).

### Non-goals
- **Not** an arbiter of truth. The Federation surfaces *who vetted what and how the network regards them*; it never ranks content by correctness. Epistemic divergence between tribes is expected and preserved.
- **Not** global-scale; **not** a cryptocurrency or token.
- **Not** marketed for journalists/activists/whistleblowers, and **not** strong-anonymity against a global passive adversary (§5.4).
- **Not** a broadcast/alerting platform. The Beacon is *pull-based published artifacts*, not real-time one-to-many messaging and not a CDN swarm.

---

## 2. Identity (req. 3)

Two-layered so a person is "the same person" across devices, and a stolen device is recoverable.

### 2.1 Root identity ("Hearthstone")
Generated once. The pseudonymous address and anchor of all reputation. Kept offline / in a secure enclave / optionally split (threshold, §2.5). Rarely exercised.

### 2.2 Device keys (subkeys)
Each device generates its own keypair, certified by the root via a signed device certificate; certs chain to the root. **Reputation binds to the root, shared across every enrolled device.** New device = same person, same standing.

### 2.3 Passkeys
A device key may be a platform passkey (WebAuthn/FIDO2) in the secure enclave/TPM, biometric-unlocked; private key never leaves hardware in cleartext.

- **Consumer default:** platform-synced passkeys (iCloud Keychain / Google Password Manager) for low-friction portability; you trust the vendor's sync security.
- **Hardened mode:** threshold root (§2.5), no cloud sync, for high-reputation accounts.

### 2.4 Enrollment of a new device
An existing device signs the new device's cert (scan QR / short code). No central server. The valid device-cert set is a signed, monotonically-versioned record under the root.

### 2.5 Anti-hijack
Device revocation (signed, versioned, gossiped); containment (a stolen device leaks only its subkey + the Argon2id at-rest store, never the root); root rotation behind a time-lock + multi-device confirm; threshold root (M-of-N) default for Stewards; tribe-based social recovery (M-of-N guardians, time-locked, notified, cool-down); takeover detection (enrollment/rotation notify all devices; new devices serve a rate-limited probation).

---

## 3. Tribes & membership

### 3.1 What a tribe is
A small (≤ ~150 active members) community with its own reputation graph. Tribes are **bridgeable** (a root identity can belong to several) and **federated** (tribes cite each other, §7).

### 3.2 Admission requires ≥2 vouchers
Admitted only when ≥2 existing Member-tier-or-above members vouch, in-person-first (proximity- and time-bound QR). Vouching **stakes** part of your reputation on the vouchee's conduct (§4.2).

### 3.3 Reputation computation — *calibrated*
Effective reputation = decay-weighted sum of inbound Embers, issuer-weighted, minus accrued penalties (§4).

**Decay half-life: H = 90 days** (daily multiplier λ = 0.5^(1/90) ≈ 0.99233).

**Why 90 and not shorter:** decay's real cost falls on legitimate *intermittent* users, not on bad actors (a defector is convicted long before decay matters). Simulated reputation retained after an idle gap (Appendix A.1):

| Half-life | After 2 wk idle | After 1 mo | After 3 mo |
|-----------|-----------------|------------|------------|
| 30 d | 0.72 | 0.50 | 0.13 |
| 60 d | 0.85 | 0.71 | 0.35 |
| **90 d** | **0.90** | **0.79** | **0.50** |
| 180 d | 0.95 | 0.89 | 0.71 |

H=30 strips half a user's standing in a month away from the keyboard. H=90 keeps a one-month absence cheap (79% retained) while still reflecting recent standing.

**Dormancy grace.** A member may declare dormancy; decay pauses (or floors at last tier minus one) for up to 180 days, then resumes. Re-entry carries a short probation on high-value actions.

**Tier consistency.** Stewards periodically publish a threshold-signed reputation checkpoint gossiped to the tribe.

### 3.4 Bridging between tribes
A member joining tribe B may present a **bridge attestation** (selective-disclosure proof of standing elsewhere) which *adds weight* but does not bypass the ≥2-local-voucher rule. Imported standing is capped and **discounted by membership overlap** — heavily-overlapping tribes grant near-zero bridge weight, killing echo-chamber sybil rings.

---

## 4. Vouching accountability & bad-actor handling (req. 5) — *calibrated*

### 4.1 Adjudication — fraction-of-tribe quorum
A member is marked a bad actor only when distinct complainants who interacted with them reach:

> **quorum = max( M_min, ⌈ q · active_tribe_size ⌉ )**, with **q = 0.25** and **M_min = 3**.

Complaints are reputation-weighted with a **per-complainant cap = 0.10** (no whale convicts alone), but the gate is the distinct-fraction count.

**Why a fraction, and why 0.25 (Appendix A.3):** an absolute body-count can't tell an honest majority from a captured minority. A fraction of the tribe can — honest abuse is witnessed by the whole tribe; a capture attacker is bounded by the fraction they control.

| Quorum q | Capture needs (fraction to frame an innocent) | Legit conviction latency (median / p90, private 1:1) |
|----------|-----------------------------------------------|------------------------------------------------------|
| 0.10 | ~10% — too weak | 10 d / 16 d |
| 0.20 | ~18% | 22 d / 29 d |
| **0.25** | **~20% (0% wrongful below 15%)** | **27 d / 36 d** |
| 0.30 | ~25% | 32 d / 41 d |
| 0.40 | ~33% but legit conviction starts failing | 43 d / 49 d |

Latency scales with how public the abuse is; the figures are worst-case private 1:1 abuse. The 20–30% capture band is backstopped by cross-tribe appeal (§4.4). Complaints are rate-limited per member per epoch.

### 4.2 Transitive, decaying penalty — *calibrated*
On conviction the bad actor's reputation is zeroed (with a re-accrual cooldown) and penalty propagates up the vouch chain: **direct voucher loses P_dir = 0.25 of current reputation; a voucher h hops up loses P_dir · g^h with gradient g = 0.35; propagation stops below 0.01/hop** (~3 effective hops):

| Hop | Penalty (fraction of that member's rep) |
|-----|------------------------------------------|
| 0 (direct voucher) | 0.25 |
| 1 | 0.088 |
| 2 | 0.031 |
| 3 | 0.011 |
| 4 | <0.01 → not applied |

Anchors are exempt; per-member per-incident loss is capped; g is tunable in 0.20–0.40 (a pure *spread* knob — it doesn't change the direct hit).

### 4.3 Honest limitations
A patient infiltrator does some damage before the quorum forms (worst-case ~3–5 weeks private; far less if public). A captured tribe (≥~20%) can wrongfully convict — mitigated by per-complainant cap, weighting, rate limits, and a cross-tribe **appeal** to an overlapping tribe for an outside quorum.

### 4.4 Sybil-farm bound
Each sybil needs 2 Member-tier vouchers and ~14 days of behaving from zero to reach Member tier; admission is bounded by **issuance budget B = 2 meaningful vouches per member per 30-day epoch**, and the §4.2 penalty craters duped vouchers when their sybils defect.

---

## 5. Anonymous intra-tribe distribution (req. 4 + req. 6)

Share content one-to-many *within* a tribe without anyone tracing it to you. (Contrast with §6, which is *attributed* and *public*.)

- **Spark token (§5.1):** single-use, unlinkable, blind-signed (RSA blind sig / BBS+) by the tribe's Stewards under a threshold key; mint rate is a function of your reputation, so a spammer gets very few. Proves "minted by a member in good standing" without revealing which member.
- **Distributing (§5.2):** attach a Spark instead of your identity; relays verify it's signed and unspent (nullifier gossiped to the checkpoint), then forward. Content chunked, per-chunk ephemeral keys, content key wrapped to recipients; BLAKE3 content-addressed within the authorized transfer only — no global content DHT.
- **Hiding the sender from relays (§5.3):** onion/mix routing through Steward relays — each relay learns only the next hop.
- **Honest ceiling (§5.4):** protects against recipients, any single relay, and ordinary observers; **not** a global passive traffic-correlation adversary (run over Tor for that). Padding and batched relay raise but don't eliminate the bar.

---

## 6. The Beacon — public attributed publication (req. 4)

A tribe's outward face. Where §5 is anonymous and inward, the Beacon is **attributed, public, and verifiable by anyone without joining.** It turns a tribe into a publisher whose output carries cryptographic provenance and staked human endorsement — an RFC shop, a research collective, a standards body, a review circle.

### 6.1 What a publication is
A **publication record** binds:

- the artifact (content-addressed, BLAKE3), its metadata, version, and prior-version link;
- the authoring member(s);
- an **endorsement bundle** — signatures from members at Trusted tier or above who each *stake reputation* on it;
- the tribe's threshold **seal**, issued only when the endorsement quorum is met.

### 6.2 Endorsement quorum (the positive mirror of §4.1)
Publication under the tribe seal requires **≥ k Trusted-tier endorsers** (default k = 3, configurable per tribe) or a threshold-signed tribe seal. Each endorser's signature is a reputation stake, not a rubber stamp.

### 6.3 Retraction with penalty (the teeth)
A publication can be **disputed** and, by the §4.1 quorum, marked **retracted/bad**. When it is:

- the publication is publicly flagged retracted (the record is append-only and tamper-evident; nothing is silently deleted);
- **endorsers take a reputation penalty** (a §4.2-style staking loss; whether it propagates up the *vouch* chain is configurable — default: direct endorsers only, since endorsing ≠ vouching).

This is what makes "community-vetted" mean something: vetting carelessly costs you, and the cost is visible. It does **not** mean the content was true or false — only that the tribe's own quorum withdrew its endorsement.

### 6.4 Public verification flow
A reader anywhere fetches the artifact + endorsement bundle from **any mirror** (Stewards serve it, but it's content-addressed and tribe-signed, so anyone can host or mirror it). They verify, with no account:

> *these named members of tribe X, at these tiers, signed this artifact on this date; the tribe seal is valid; status = active / retracted.*

Provenance is absolute and decentralized. Correctness is not claimed (§6.6).

### 6.5 Why this beats the alternatives
- vs. **arXiv / journals / IETF**: central gatekeeper, weak non-cryptographic provenance, a single point of capture or shutdown. The Beacon is decentralized, verifiable, and accountable.
- vs. **GitHub / Substack / a blog**: no trust signal at all — anyone posts anything.
- The macro tailwind: as machine-generated content floods every channel, a verifiable "vetted by accountable humans who staked reputation" layer becomes scarce and valuable. This is arguably HEARTH's largest reason to exist.

### 6.6 Honest limitation — provenance, not truth
The Beacon proves *who* vetted something and that they're accountable. It **cannot prove the content is correct.** A tribe of cranks vetting crank work is cryptographically identical to a tribe of experts vetting good work. Readers judge a tribe by its track record and its Federation standing (§7) — the way one trusts the IETF or a journal by reputation, not by fiat. The retraction penalty gives a tribe a reason to guard that track record; it does not make the tribe right.

---

## 7. The Federation — inter-tribe reputation as a signal (req. 4 + req. 6)

Tribes regard each other, and a reader sees a **personalized composite** of how *their own* tribes regard a target tribe. There is **no global canonical score** — that would recreate a central truth authority, which the protocol refuses to be.

### 7.1 Inter-tribe citations (the tribe-level trust-flow)
The same trust-flow primitive as Embers, one level up:

- A tribe may **cite** (endorse, positive weight) another tribe — a collective act issued by the tribe's threshold seal, not by one member.
- A tribe may **abstain** entirely (most tribe pairs have no opinion; abstention is first-class and costs nothing).
- Inter-tribe reputation **decays slowly** — tribes are durable, so tribe-citation half-life defaults to **365 days**, not 90.

### 7.2 Bounded negative ranking (quorum-gated)
A tribe may **dispute** (negative weight) another tribe, but only:

- via an **internal quorum of its own Trusted+ members** (reuse §4.1 machinery) — it's the tribe's collective decision, not a drive-by;
- **reputation-weighted and rate-limited**, and it **stakes the disputing tribe's own standing** (a dispute the broader federation reads as bad-faith reflects back on the issuer);
- with **faster decay than positive citations** (grudges expire) and **feud damping** — if A and B dispute each other, the mutual negatives are discounted (a feud is information about the pair, not a one-sided signal).

This surfaces actively-bad tribes without turning the federation into a brigading battlefield.

### 7.3 Personalized composite score (the reader's view)
A reader **R** belongs to tribes {A₁…Aₙ} with standing wᵢ (R's own reputation in Aᵢ). For a target tribe **T**, each Aᵢ has an opinion rᵢ(T) ∈ [−1, +1] (from its citations/disputes, with one optional discounted transitive hop, §7.4) or **⊥ (abstain)**. The reader's composite is the standing-weighted average over the tribes that *have* an opinion:

> **S_R(T) = Σᵢ wᵢ·rᵢ(T)  /  Σᵢ wᵢ·𝟙[rᵢ(T) ≠ ⊥]**

If none of R's tribes has any opinion of T (directly or via the bounded hop), the result is **"unrated from your vantage"** — an honest null, never a fabricated number.

**Confidence / coverage (added after pressure-testing — Appendix C.3).** The weighted average alone is dangerously overconfident: simulation showed that if *only one low-standing tribe* opines and the reader's established tribes abstain, the formula returns that lone opinion at full confidence (e.g., a reader lured into a malicious 0.1-standing tribe got composite **+1.0** for an adversary payload). The renormalized denominator hides this because abstainers drop out. The fix the protocol ships:

- Report **coverage = (Σ opining wᵢ) / (Σ all-vantage wᵢ)** alongside the value — what fraction of the reader's vantage actually has an opinion.
- Require **≥ 2 distinct opining tribes** and **coverage ≥ 0.25** before showing a confident composite; below that, surface it as **"weak / uncorroborated"** rather than a headline number. In the lure case above, coverage = 0.1 → flagged weak, which is the honest read.

**Crucially, the composite is decomposable.** The single number is the glance; one tap reveals the per-tribe breakdown (and the coverage flag), so divergence and thin sourcing are shown rather than averaged away. (Worked example: Appendix B; adversarial results: Appendix C.)

### 7.4 Bounded transitivity & anti-gaming — *hardened after pressure-testing*
- **Citation rings are bounded by the reader's vantage (verified, Appendix C.1):** a ring of mutually-citing tribes — or a high-internal-standing **sybil tribe** — that no tribe in R's vantage cites contributes exactly **0** (returns *unrated*), at every γ. This is the strongest result of the pressure test: federation standing cannot be self-minted; it must be *received* from inside the reader's own trust neighborhood. **Overlap-discounting** (§3.4) additionally stops near-identical tribes inflating each other.
- **Transitive flow is OFF by default (changed in this revision).** The only contamination path simulation found is a single *duped* citation from a tribe already in the reader's vantage to a ring; with one discounted hop at γ = 0.5 that leaked a composite of **0.245** (~70% of a normal cross-bloc trust level) into the duped reader (Appendix C.2). So:
  - **Default:** direct citations only (hop = 0). The duped-bridge leak then drops to *unrated* — the ring still has no direct citation from the vantage.
  - **Optional "explore" mode:** one transitive hop, but only with **γ ≤ 0.3** *and* a **≥ 2-independent-bridge** rule (a single duped citation is insufficient; the target needs two distinct in-vantage→bridge→target paths). Both were verified to collapse the single-duped-bridge attack to *unrated* (Appendix C.2).

### 7.5 No anchors needed — bootstrapping solved
Because the score is computed from the reader's *own* affiliations, **the Federation needs no global anchor set.** Your tribes are your seed. A new user with one tribe sees the federation through that tribe's eyes; joining more tribes enriches the vantage. This removes the anchor-centralization and bootstrap problems that plagued v1's global reputation.

### 7.6 Optional neutral vantage (the "hybrid")
A reader may *additionally* load a published, named **neutral anchor vantage** (e.g., a curated set of public-interest tribes, or "the medical-research consensus set") to deliberately view a tribe from outside their own affiliations. Off by default, always labeled. This is the relief valve for the echo-chamber limitation (§7.7) — you can choose to look from somewhere other than home.

### 7.7 Honest limitations
- **Echo chambers.** A composite built from your own tribes reinforces your bubble. The protocol does not break the bubble; it makes the walls *transparent* (decomposition, §7.3) and offers an exit (neutral vantage, §7.6). It will not force a reader out of their epistemic in-group, by design — that would be the protocol asserting truth.
- **Still not truth.** A high composite means "the tribes you trust trust this one," nothing more. Conspiracy tribes can score high among their peers; that is the honest output of a system that refuses to be a truth oracle.
- **Privacy.** A reader's composite is computed **client-side**, so their set of tribe affiliations need not be revealed to anyone. Inter-tribe citations are public (that's their purpose); the intra-tribe member vouch graph stays private via selective disclosure (§3.4, §8).

---

## 8. Cryptography & wire security (req. 1)

- **Identity keys:** Ed25519 (sign), X25519 (ECDH). **PQ migration path:** hybrid X25519 + ML-KEM for key agreement (sequencing open, §13).
- **Session:** Noise_XX (mutual auth + forward secrecy).
- **Messaging:** Double Ratchet for 1:1; MLS (RFC 9420) for tribe groups.
- **Distribution:** chunked + per-chunk ephemeral keys, content key wrapped to recipients, onion-routed (§5.3).
- **Publication:** artifacts content-addressed (BLAKE3); endorsements are Ed25519 signatures; tribe seal is a threshold signature (e.g., FROST). Records are append-only and tamper-evident (hash-chained), so retraction is additive, never a silent edit.
- **Anonymous & selective-disclosure credentials:** RSA blind signatures / BBS+ for Sparks (§5.1), reputation/bridge proofs (§3.4), and to prove endorser tier without exposing the full vouch graph.
- **At rest:** Argon2id-derived key (device passphrase/biometric).

---

## 9. Transport & topology

- **Local discovery:** mDNS on LAN; an ungated **proximity tier** for in-person/offline-first use (abuse bound open, §13).
- **Wide-area:** Kademlia-style DHT of signed, short-TTL identity→endpoint hints only — never content.
- **NAT traversal:** ICE/STUN + hole punching; fallback to volunteer **Steward relays** (ciphertext only; one onion hop for distribution; read-only artifact mirrors for the Beacon).

---

## 10. Licensing & openness (req. 2)

Spec public, royalty-free, defensive patent pledge. Reference implementation AGPL-3.0 (node/relay) + Apache-2.0 (`libhearth` core). HEARTH trademark held by a nonprofit foundation; conformance required to use the name. No commercial-gateway clause (unenforceable on an unobservable network).

---

## 11. Governance

Nonprofit **HEARTH Foundation**; spec changes via open RFC. Reputation/penalty/citation-math changes require a defined electorate (Foundation members + elected tribe delegates) with a public comment period; **the electorate is explicitly not reputation-weighted**, so the highest-rep actors can't govern the rules that mint reputation.

---

## 12. Threat model summary

| Adversary | Mitigated? | How / caveat |
|-----------|-----------|--------------|
| Passive link eavesdropper | Yes | E2E encryption, Noise |
| Active MITM | Yes | Mutual auth, key continuity, attestation |
| Spammer / botnet | Largely | Reputation-gated throughput + Spark budget; vouching gates admission |
| Careless/colluding voucher | Yes (calibrated) | Transitive decaying penalty; direct voucher loses ~25% rep |
| Sybil ring (member or tribe) | Largely | ≥2 Member+ vouchers; vantage-bounded citation flow; overlap discount |
| Recipient / single relay tracing distributor | Yes | Identity-free Spark + onion routing |
| **Global passive traffic-correlation** | **No (by design)** | Run over Tor; §5.4 |
| Device theft / identity hijack | Largely | Device subkeys + revocation + threshold root + gated recovery |
| Tribe-capture wrongful conviction | Partial | q=0.25 forces ~20% control; cross-tribe appeal |
| Reputation-laundering publisher | Largely | Endorsements non-transferable + staked; retraction penalty; Federation standing |
| Inter-tribe brigading / feuds | Partial | Quorum-gated, staked, fast-decaying, feud-damped negatives (§7.2) |
| Federation as truth-authority capture | N/A (by design) | No global score; personalized vantage, no anchors to capture (§7.5) |
| Echo-chamber epistemics | Partial / by design | Decomposition + optional neutral vantage; protocol won't assert truth (§7.7) |

---

## 13. Open questions for v5

Resolved in v3/v4: reputation-dynamics parameters (§3.3, §4), Beacon publication, federation reputation model. **Resolved by pressure-testing (Appendix C):** ring-resistance (rings/sybil tribes outside the vantage = *unrated*), transitive depth & γ (transitive OFF by default; if on, γ ≤ 0.3 + ≥2 bridges), composite weighting (standing-weighting alone is insufficient — ship coverage + ≥2-opining floor, §7.3). Still open:

- **Cross-tribe appeal selection** — how the outside quorum for §4.3 / §7.6 is chosen without being itself gameable.
- **Proximity/LAN ungated-tier abuse bound** (a malicious insider at a gathering).
- **PQ migration sequencing** for the long-lived root key.
- **Spark minting-budget curve** vs. reputation (mechanism fixed, final curve not).
- **Endorsement-penalty propagation** — should a retracted publication penalize only direct endorsers, or also their vouch chain? (default: direct only).
- **Feud-damping side effect** — discounting *mutual* disputes (§7.2) also mutes two tribes that may both be correctly warning about each other; needs a rule that distinguishes a genuine two-sided warning from a tit-for-tat feud.
- **Coverage threshold tuning** — the ≥2-opining / coverage ≥ 0.25 floor (§7.3) was set by hand; needs UX testing so honest thin-coverage cases aren't over-suppressed.

---

## Appendix A — Member-level simulation evidence

Agent-based Monte-Carlo model (`hearth_v3_sim.py`, results `hearth_v3_sim_results.json`). Tribe N=100, daily steps, 120–400 seeds/cell. A model, not a proof — relative comparisons across parameters are the signal, not absolute day-counts.

**A.1 Decay half-life:** idle-retention table in §3.3 — H=90 balances bad-actor freshness against punishing intermittent honest users.
**A.2 Penalty gradient:** P_dir=0.25, g=0.35 → meaningful collateral ~3 hops; g is a pure spread knob (direct loss unchanged 0→0.7).
**A.3 Fraction quorum:** q=0.25 → 0% wrongful below 15% capture, reliable legitimate conviction up to q=0.30.
**A.4 Sybil farm:** ~14 days to Member tier from zero; bounded by issuance budget B=2/epoch.

(The federation/composite layer in §7 is pressure-tested separately in Appendix C, `hearth_federation_sim.py`.)

---

## Appendix B — Worked example: the personalized composite

Reader **R** belongs to two tribes:

- **Religious tribe** — R's standing w₁ = 0.8
- **Fantasy Book Club** — R's standing w₂ = 0.5

Target tribe **T = Horror Movie tribe**. The two tribes regard it differently:

- Religious tribe disputes it: r₁(T) = **−0.4**
- Fantasy Book Club cites it: r₂(T) = **+0.6**

**Composite (§7.3):**

> S_R(T) = (0.8 × −0.4 + 0.5 × +0.6) / (0.8 + 0.5) = (−0.32 + 0.30) / 1.3 = **−0.015 ≈ neutral**

The headline number is ~neutral — but that is the *least* interesting part. The decomposition R sees on tap is the real signal:

| R's tribe | R's standing | Opinion of Horror tribe |
|-----------|--------------|-------------------------|
| Religious tribe | 0.80 | −0.40 (disputed) |
| Fantasy Book Club | 0.50 | +0.60 (cited) |

R learns: *"the part of me that's in the religious tribe distrusts this; the part that's in the book club likes it."* The protocol reports the divergence faithfully and lets R decide. A different reader — say, one in two horror-adjacent tribes — would compute a strongly positive composite for the very same target. There is no contradiction, because there is no global truth being claimed: only **who, from where, regards whom.**

---

## Appendix C — Federation pressure-test evidence

Model `hearth_federation_sim.py`. A block-structured federation (4 epistemic "blocs" × 8 tribes) with within-bloc positive citations, sparse cross-bloc citations, and cross-bloc disputes between opposed blocs. Adversaries injected: collusion rings, a duped bridge citation, a high-internal-standing sybil tribe, a reader lured into a low-standing malicious tribe, and reciprocal feuds. As with Appendix A: a model, not a proof.

**C.1 Ring-resistance & sybil tribes — PASS (strongest result).**
A collusion ring (6 tribes citing each other at weight 1.0 + a payload tribe), and separately a sybil tribe with **0.9 internal standing but no inbound citations**, both return **unrated** from any honest reader whose vantage doesn't cite them — at every γ. Federation standing must be *received from inside the reader's trust neighborhood*; it cannot be self-minted.

**C.2 Transitive hop & γ — FIXED.** The one contamination path is a single *duped* citation from an in-vantage tribe to the ring:

| Config | Payload composite in duped reader |
|--------|-----------------------------------|
| No bridge, any γ | unrated |
| 1 duped bridge, γ = 0.0 | 0.00 |
| 1 duped bridge, γ = 0.3 | 0.147 |
| 1 duped bridge, γ = 0.5 | 0.245 (~70% of a normal cross-bloc trust level) |
| 1 duped bridge, γ = 0.7 | 0.343 |
| **Mitigation: transitive OFF (hop 0)** | **unrated** |
| **Mitigation: require ≥2 independent bridges** | **unrated** |

→ Resolution: transitive flow **off by default**; if enabled, γ ≤ 0.3 **and** ≥2 bridges.

**C.3 Composite weighting — FLAW FOUND & FIXED.** Reader established in honest tribe (standing 0.9, *abstains* on target) and lured into a malicious tribe (standing 0.1, rates payload +1.0):

| Weighting | Composite | Coverage | Verdict |
|-----------|-----------|----------|---------|
| Standing-weighted | **+1.0** | 0.10 | naive value is dangerously overconfident |
| Equal | **+1.0** | 0.50 | same |

Standing-weighting does **not** save the reader, because the abstaining honest tribe drops out of the denominator. Fix shipped in §7.3: report **coverage** and require **≥2 opining tribes + coverage ≥ 0.25**, else mark **weak**. Coverage = 0.10 here → correctly flagged weak.

**C.4 Divergence (feature check) — PASS.** Same target tribe scored +0.34, +0.20, +0.29 (weak, single-source), and **−0.13** by readers anchored in the four different blocs — divergence preserved, opposed bloc negative, thin-coverage vantage correctly flagged.

**C.5 Feud damping — PARTIAL.** A one-sided dispute stays at full weight (−0.8); a *mutual* feud with damping is discounted (−0.8 → −0.32). Works as designed, but see the §13 caveat: damping mutual disputes also mutes two tribes that may both be correctly warning about each other.
