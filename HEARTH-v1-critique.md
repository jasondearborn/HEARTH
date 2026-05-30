# HEARTH v1 — Critique, Use Cases, and Proposed Revisions

Reviewer notes on `HEARTH-protocol-spec-v1.md`. Structure: (1) critique, (2) attractive use cases scored against the goals, (3) the central tension and iterated solutions, (4) a multi-device identity + anti-hijack design, (5) naming.

---

## 1. Critique

### What's good (keep it)
- **Intellectual honesty.** The spec repeatedly states what it does *not* protect (metadata vs. global passive adversary, sybil not impossible, abuse uneconomic-not-impossible). That candor is rare and correct. Don't lose it.
- **No token.** Correctly identifies financialization as the thing that lets capital buy scale. Excluding it is the right call and is load-bearing for the whole thesis.
- **Reuses audited primitives.** Noise, MLS (RFC 9420), Double Ratchet, BLAKE3, Argon2id. Not rolling its own transport crypto is the responsible choice; the novelty is correctly scoped to the identity/reputation layer.
- **The core thesis is genuinely interesting.** "Make the marginal cost of abuse equal the marginal cost of genuine participation" is a real, defensible design north star.

### Where it's weak or unproven

**1.1 The reputation math is the entire product and it's hand-waved.**
EigenTrust/PageRank-style trust-flow has two unsolved problems the spec glosses:
- **Who computes it?** Global trust-flow needs a global view of the graph. In a P2P system with no global state, either (a) relays/Stewards compute and you've reintroduced a trusted authority and a consensus problem, or (b) every node computes over its partial view and reputation/tier becomes *inconsistent between observers* — which breaks tier-gating UX (two peers disagree on whether you're "Trusted"). The spec must pick a model. This is the single biggest gap.
- **Decay vs. anchors is a conservation problem.** Reputation flows *from* anchors. Anchor weight decays "like everyone's." If anchors dilute and nothing continuously injects fresh reputation, total system reputation trends toward zero and everyone slowly demotes. You need a defined, ongoing reputation *source*. "Training wheels, not gatekeepers" is a slogan, not a mechanism.

**1.2 Non-transferable ≠ non-rentable.** Binding Embers to a key stops credential *sale*. It does nothing against renting the whole identity/device — exactly how modern residential-proxy and "real-phone" botnets already work. And human attestation is *buyable*: click-farms in low-wage markets attest for cents. So "abuse cost = genuine participation cost" is defeated by labor arbitrage. The asymmetry you're banking on is smaller than claimed.

**1.3 Decay punishes legitimate intermittent users.** Mutual-aid that happens twice a year, or a disaster responder offline for months, gets throttled *exactly when they need throughput*. Decay optimizes against some of the prosocial intermittent use req. 4 wants to serve.

**1.4 Fan-out gating fights the spec's own prosocial goals.** Req. 4 explicitly wants civic and educational *distribution* — one-to-many. Req. 5 makes fan-out the most reputation-expensive action. Algorithmically a community organizer and a marketing operation look identical; "generous for organizers, prohibitive for marketers" is a hope, not a mechanism. This is the central contradiction (see §3).

**1.5 Double cold-start.** A comms network is already worthless until your contacts join. HEARTH adds a *second* throttle: even once you're on, you're near-useless until vouched in person. The "<60s onboarding" claim is undercut by "useful only after attestation." Two cold-starts stacked is brutal for adoption (req. 3).

**1.6 No negative signal and no content-abuse model.** Embers only flow positive; decay is the only downside. A trusted actor who turns abusive keeps full standing for ~90 days, and reputation gates throughput, not *content* (harassment, CSAM, etc., fit inside an honest user's budget). You need bounded negative attestation / dispute-driven decay — which reintroduces brigading risk that must be designed for.

**1.7 The trust graph is a deanonymization surface.** "A pseudonymous trust trail" (§5.6) is a social graph. If it must be queryable to compute reputation, who can see who vouched for whom? That contradicts pseudonymity (req. 6) and metadata-minimization. This is underspecified and is potentially a bigger privacy hole than the metadata caveat you *did* disclose. (Fix in §3: recipient-held credentials + selective-disclosure proofs.)

**1.8 The license story overclaims "fully open."** AGPL-3.0 already forces relay source publication. The *additional* "commercial-gateway clause requiring a foundation agreement at scale" is a field-of-use restriction — that is not OSI-open, so "fully open standard" (goal 2) is in tension with it. Worse, "at scale" is undefined and **unenforceable on an E2E network engineered to be unobservable** — you can't detect commercial scale without the surveillance you designed away. The license lever is partly theater; say so or drop it.

**1.9 Governance capture.** "Reputation-algorithm changes need a supermajority" — of whom? If high-rep Stewards vote, the actors with the most reputation govern the reputation rules: entrenchment of early adopters and anchors. Define the electorate explicitly and insulate it from rep-weighting.

**1.10 Single-Seed identity is fragile and hijack-prone.** Reputation is tied to one keypair, backed up by a recovery phrase. Real humans have 3–4 devices. Either you copy the secret to every device (multiplying compromise surface; any device theft = total, *irrevocable* takeover *including* hard-earned reputation) or you can't be "the same person" across devices. There is no device key, no revocation, no compromise containment. This is the hijack vector. Addressed in §4.

**1.11 No post-quantum story for a *long-lived* identity key.** Ed25519/X25519 aren't PQ. Long-lived identity especially wants a hybrid migration path (e.g., X25519 + ML-KEM for key agreement, and a plan for signatures). Spec is silent.

**1.12 Minor: the identity→endpoint DHT is an enumeration/presence surface.** Signed short-TTL hints still let an observer enumerate active identities and map presence/online-time. Worth a line in the threat model.

---

## 2. Attractive use cases, scored against the goals

Goals recap: (1) E2E, (2) open, (3) low-friction mobile/desktop, (4) prosocial, (5) anti-corporate/anti-abuse, (6) pseudonymous + earned rep, (7) novel.

| # | Use case | Fit | Tension with goals |
|---|----------|-----|--------------------|
| 1 | **Family / close-friend chat + photo & file sharing** | Strong | None. Small fan-out, frequent use keeps rep warm, point-to-point transfer. This is the keystone app — it's what keeps reputation alive for everything else. |
| 2 | **Personal device-to-device sync (your own devices)** | Strong | None — but depends entirely on multi-device identity (§4). Fits no-DHT, point-to-point perfectly. |
| 3 | **Local mutual-aid / community organizing** | High prosocial (req 4) | **Needs broadcast → fights fan-out gating (req 5).** The group HEARTH most wants to serve hits the throughput wall. |
| 4 | **Open-source / research / hobbyist communities** | Good | Medium groups, regular use → reach Trusted naturally. Aligns 4,6,7. |
| 5 | **Disaster / offline-first relief mesh (LAN/mesh)** | High (mDNS, relays) | **Decay + rep-gating throttle people who've been offline — worst possible timing (req 4).** |
| 6 | **Whistleblower → small set of trusted recipients** | Moderate | Fits point-to-point/no-DHT. Carries the anonymity caveat — not safe vs. nation-state, and the attestation trail is a liability (req 6 in practice). |
| 7 | **Journalist / activist source comms** | Attractive on paper | **Conflicts with non-goal (not Tor-grade anonymous) AND the trust graph deanonymizes.** Position honestly as *not* for high-threat anonymity. |
| 8 | **Educational / public-domain distribution in low-connectivity regions** | Explicit req 4 goal | **Worst tension: one-to-many + no content DHT = the two design choices that fight it hardest.** Needs a dedicated primitive or it's effectively out of scope. |
| 9 | **Local craft/classifieds within a trust community** | Borderline | Individual-scale commerce risks being caught by the blunt anti-"commercial" framing (req 5). Clarify the enemy is *industrial* scale, not all value exchange. |

**Balance, stated plainly:** HEARTH is excellent for **small-group, high-frequency, interpersonal** use and structurally **hostile to broadcast/distribution**. Yet four of its headline prosocial goals — civic, educational, mutual-aid, disaster — are *broadcast-shaped*. The mechanism that defeats spam and propaganda also defeats the legitimate one-to-many cases that are the most inspiring reasons to build this. That is the contradiction to resolve before v2.

---

## 3. The central tension and iterated solutions

**Tension:** anti-scale (fan-out gating, no content DHT, decay) vs. the prosocial broadcast/distribution goals. Proposed mechanisms:

**3.1 Attested groups with pooled fan-out (a "Beacon").**
Make an organization/community a first-class *attested entity* whose broadcast budget is pooled from, and endorsed by, its members. A library, a mutual-aid network, or a class can broadcast legitimately because the *group itself* is human-attested and each broadcast is member-endorsed. This is the algorithmic line between organizer and spammer that §1.4 says is currently missing: a spammer can't get N real members to co-endorse each blast.

**3.2 Emergency / proximity tier.**
On-LAN (mDNS) or geo-fenced disaster mode grants ungated throughput regardless of reputation — *physical proximity is itself a sybil-resistance signal* (you can't be in 10,000 places at once). Fixes both the disaster case (#5) and decay-punishes-intermittent (§1.3).

**3.3 Bounded negative attestation.**
Add dispute/complaint signals that decay standing faster than the 90-day half-life, with rate-limited, reputation-weighted flagging and a quorum requirement to resist brigading. Gives the system a downside other than time.

**3.4 Click-farm hardening.**
Weight *in-person, time-bound, proximity-proven* QR attestations far above remote ones; cap reputation gain from any single attestation cluster (diminishing returns per source community). This pushes the real cost of bought attestation above click-farm wages — restoring the asymmetry §1.2 erodes.

**3.5 Pick a reputation-consistency model.**
Resolve §1.1: either Stewards publish a **threshold-signed, gossiped reputation checkpoint** (verifiable snapshot, periodic) or commit to purely local computation and accept/define the inconsistency. The current ambiguity makes tier-gating undefined in practice.

**3.6 Protect the trust graph with recipient-held credentials.**
Store Embers as credentials *held by the recipient*. To prove a tier, the holder presents a selective-disclosure / ZK proof ("I hold ≥ X weighted reputation") **without revealing who vouched** (BBS+ / anonymous-credential style). Fixes §1.7 and actually delivers req. 6. This also changes 3.5: snapshots commit to aggregate weights, not the raw edge list.

---

## 4. Multi-device identity + anti-hijack (your core ask)

Replace the single Seed with a **two-layer key model**. Same person across iPhone, desktop, etc.; theft of one device is recoverable.

### Model
- **Root identity key ("Hearthstone").** Generated once. *This* is the pseudonymous address and the anchor of reputation. Kept offline / in secure enclave / optionally split (see threshold mode). Rarely exercised.
- **Per-device keys (subkeys).** Each device generates its own keypair, certified by the root via a signed **device certificate**. All devices are "the same person" because their certs chain to the root (SSH-CA / Signal-Sesame / FIDO model). Reputation binds to the **root**, so it's shared across every enrolled device automatically — solving "same me on phone and laptop."

### Passkeys (your instinct is right)
- Each device key can be a **platform passkey (WebAuthn/FIDO2)** in the secure enclave/TPM, unlocked by biometric. Private key never leaves hardware in cleartext.
- **Synced passkeys** (iCloud Keychain / Google Password Manager) give the "log in on a new device = same person" UX you want, with the caveat that you're then trusting the platform vendor's sync security. Offer it as the *default consumer* path.

### Enrollment
- A new device is added by an **existing device signing its cert** (scan QR / short numeric code, like Signal/WhatsApp linking). No central server. The set of valid device certs is published as a **signed, monotonically-versioned record** under the root.

### Anti-hijack (what the current spec entirely lacks)
- **Device revocation.** Root — or a quorum of existing devices — can revoke a device cert. Revocation is a signed, version-incrementing statement gossiped to peers; counterparties refuse sessions from revoked keys. *Stolen laptop → revoke that one key; root and reputation untouched.*
- **Containment by design.** A stolen device leaks only its own subkey (revocable) plus the at-rest store (Argon2id-protected). It does **not** leak the root or the ability to mint Embers — *provided* root is kept separate. Contrast with v1's single Seed: one stolen key = total, irrevocable takeover.
- **Root rotation with delay + multi-device confirm.** Rotating to a new root is announced by the old root, gated behind a time-lock window and confirmation from multiple enrolled devices, so a thief can't instantly rotate the legitimate owner out.
- **Threshold root ("hardened" mode).** Split the root M-of-N across devices/backup (e.g., 2-of-3: phone + desktop + offline backup). Stealing one device can neither move the identity nor enroll rogue devices. Recommend this as default for Stewards/high-rep accounts — they're the juicy targets.
- **Social recovery, gated (answers your §12 open question).** Guardian model: M-of-N attested contacts co-sign a recovery. Bound the sybil risk with (a) a **time-lock**, (b) **out-of-band notification to all enrolled devices** so a malicious recovery is visible and vetoable, and (c) a **reputation cool-down** so recovery doesn't instantly transfer full standing.
- **Takeover detection.** New-device enrollment and root rotation *always* notify all existing devices out-of-band. Newly-enrolled devices serve a **probation window** during which high-value actions (issuing Embers, running a relay, large fan-out) are rate-limited.

### Tradeoff to state plainly
Easy portability (synced passkeys) and strong hijack resistance (threshold root) sit on a spectrum.
- **Default / consumer:** platform-synced device passkeys — great UX, good security.
- **Hardened / high-rep:** threshold root + offline backup share — strong takeover resistance, more friction.

This also makes reputation portability fall out for free: it's bound to the root, not to any single device.

---

## 5. Naming

The word **HEARTH** is good — it evokes home, the fire, and ties directly to *Ember*. The problem is only the backronym: *"Human-Endorsed Authenticated Relay & Transfer for Humans"* uses "Human" twice.

**Recommendation — keep the word, fix the expansion:**

> **HEARTH** — **H**uman-**E**ndorsed **A**uthenticated **R**elay & **T**ransfer **H**ub

One "Human," keeps relay + transfer, and "Hub" is honest (Steward relays exist). Clean.

Other expansions that keep the word:
- **H**uman-**E**ndorsed **A**ttested **R**elay & **T**ransfer **H**andshake
- **H**uman-**E**ndorsed **A**uthenticated **R**eputation & **T**rust **H**ub (leans into the rep layer)

If you'd rather drop "Human" entirely, you lose the thesis in the name — not recommended. Better to keep one "Human" since human-attestation *is* the novelty.

Note on the credential names: *Ember* (credential) under a *Hearth* (the protocol/home) is a strong, coherent metaphor — keep both. If you ever rename the credential, *Kindle* would fit thematically but is Amazon's trademark; avoid.

---

## Priority order for v2
1. Resolve reputation **computation/consistency** model (§1.1, §3.5) — without this, tiers are undefined.
2. Resolve the **broadcast tension** (§3.1, §3.2) — or HEARTH can't serve its own prosocial goals.
3. Ship the **multi-device + anti-hijack** identity model (§4) — current single-Seed is a security and adoption blocker.
4. Protect the **trust graph** (§3.6) — current design quietly breaks the pseudonymity goal.
5. Honest pass on **licensing enforceability** and **negative attestation** (§1.6, §1.8).
