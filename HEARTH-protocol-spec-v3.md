# HEARTH Protocol — Product Specification v3

**HEARTH**: *Human-Endorsed Authenticated Relay & Transfer Hub*

A peer-to-peer communication and content-distribution standard for **tribes** — small, bridgeable communities of people who vouch for each other. Trust is earned through human vouching, accountability flows back to the vouchers, and the cost structure favors individual humans over automated or industrial-scale exploitation.

> **Changes from v2:** the reputation-dynamics parameters that were open questions in v2 §12 are now **calibrated against adversarial simulation** (Appendix A). Specifically: decay half-life and a new dormancy grace (§3.3), the transitive penalty gradient (§4.2), and a **fraction-of-tribe quorum** that replaces the absolute weighted threshold (§4.1). All numbers below are simulation-backed recommendations, not arbitrary constants.

---

## 0. Design thesis

HEARTH is explicitly **anti-global-scale** — a reputation system with decay cannot and should not span the planet. It is built for **tribes**: Dunbar-sized groups bound by mutual human vouching, optionally bridged.

Two primitives carry the design:

1. **The Ember** — a non-transferable, decaying reputation credential earned by good-faith participation and lost through bad behavior or by vouching for bad actors.
2. **Vouching with skin in the game** — you join a tribe only when ≥2 existing members vouch for you, and **their** standing is staked on your conduct. A confirmed bad actor doesn't only burn their own reputation; the penalty propagates back up the vouch chain that admitted them, decaying with distance.

Admission is therefore self-policing: careless vouching is costly, so members gate it.

---

## 1. Goals & non-goals

### Goals
1. End-to-end encrypted communication and file/content transfer, secure against any third-party interception (req. 1).
2. Fully open standard and reference implementation (req. 2).
3. First-class mobile and desktop support; identity that ports cleanly across a person's devices (req. 3).
4. Optimized for prosocial tribal use: personal communication, intra-community file sharing, and **sender-unlinkable one-to-many content distribution within a tribe** (req. 4).
5. Structural disincentives against automated/industrial-scale abuse and spam, enforced primarily through vouching accountability (req. 5).
6. Pseudonymous-by-default with an earned, decaying reputation layer; **distribution can be sender-anonymous even from relays** (req. 6).
7. Novel architecture: the combination of vouch-staking, transitive penalty, and anonymous-but-rate-limited distribution is not an existing standard (req. 7).

### Non-goals
- **Not** global-scale. Reputation decay makes planetary scale impossible by design.
- **Not** a cryptocurrency or token. No coin, no chain-as-database.
- **Not** marketed for journalists, activists, or whistleblowers, and **not** strong-anonymity against a global passive adversary (see the honest ceiling, §5.4).
- **Not** a broadcast/alerting platform. Real-time one-to-many *messaging* is out of scope. One-to-many *content distribution* within a tribe is in scope as a distinct, sender-anonymous primitive (§5).
- **Not** a content host / CDN. Distribution is tribe-scoped, not a public swarm.

---

## 2. Identity (req. 3)

Two-layered so a person is "the same person" across devices, and a stolen device is recoverable.

### 2.1 Root identity ("Hearthstone")
Generated once. The pseudonymous address and anchor of all reputation. Kept offline / in a secure enclave / optionally split (threshold, §2.5). Rarely exercised directly.

### 2.2 Device keys (subkeys)
Each device generates its own keypair, certified by the root via a signed **device certificate**; certs chain to the root (SSH-CA / Signal-Sesame / FIDO model). **Reputation binds to the root, so it is shared across every enrolled device.** Log in on a new device → same person, same standing.

### 2.3 Passkeys
A device key may be a platform **passkey (WebAuthn/FIDO2)** in the secure enclave/TPM, biometric-unlocked; the private key never leaves hardware in cleartext.
- **Consumer default:** platform-synced passkeys (iCloud Keychain / Google Password Manager) for low-friction portability. Caveat: you trust the platform vendor's sync security.
- **Hardened mode:** threshold root (§2.5), no cloud sync, for high-reputation accounts.

### 2.4 Enrollment of a new device
An existing device signs the new device's cert (scan QR / short code, like Signal/WhatsApp linking). No central server. The valid device-cert set is published as a signed, monotonically-versioned record under the root.

### 2.5 Anti-hijack
- **Device revocation.** Root, or a quorum of existing devices, revokes a device cert via a signed, version-incrementing statement gossiped to peers; counterparties refuse revoked keys. Stolen laptop → revoke that key; root and reputation untouched.
- **Containment.** A stolen device leaks only its own subkey (revocable) + the Argon2id-protected at-rest store. Not the root, not the ability to issue Embers/vouches — provided the root is kept separate.
- **Root rotation** is announced by the old root behind a time-lock + multi-device confirmation, so a thief can't instantly rotate the owner out.
- **Threshold root.** M-of-N split across devices/backup (e.g., 2-of-3). Stealing one device can't move the identity or enroll rogue devices. Default for Stewards.
- **Social recovery via the tribe.** M-of-N attested guardians co-sign recovery, gated by a time-lock, out-of-band notification to all enrolled devices, and a reputation cool-down.
- **Takeover detection.** Enrollment and rotation always notify existing devices; a newly-enrolled device serves a probation window with rate-limited high-value actions.

---

## 3. Tribes & membership

### 3.1 What a tribe is
A small (Dunbar-scale, ≤ ~150 active members) community with its own reputation graph. Tribes are **bridgeable**: one root identity can belong to several tribes and carry standing between them (§3.4).

### 3.2 Admission requires ≥2 vouchers
A prospective member is admitted only when **≥2 existing members who are themselves Member-tier or above** vouch for them. Vouching is in-person-first (proximity- and time-bound QR exchange). Vouching is **staking**: you bind part of your reputation to the vouchee's future conduct (§4.2).

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

H=30 strips half a user's standing in a month away from the keyboard — punishing exactly the prosocial intermittent participant. H=90 keeps a one-month absence cheap (79% retained) while still reflecting recent standing.

**Dormancy grace (new in v3).** A member may declare dormancy; decay pauses (or floors at their last tier minus one) for up to 180 days, after which it resumes. This protects seasonal/occasional users without letting a permanently-absent account retain full power. Re-entry from dormancy carries a short probation on high-value actions.

**Tier consistency.** Stewards periodically publish a **threshold-signed reputation checkpoint** gossiped to the tribe, so members agree on tiers without each recomputing from a partial view.

### 3.4 Bridging between tribes
A member in good standing in tribe A joining tribe B may present a **bridge attestation** — a selective-disclosure proof of "I hold ≥ X standing elsewhere" — which *adds weight* but does **not** bypass the ≥2-local-voucher rule. Imported standing is capped and **discounted by membership overlap** (heavily-overlapping tribes grant near-zero bridge weight), which kills echo-chamber sybil rings. Bridge weight decays like everything else.

---

## 4. Vouching accountability & bad-actor handling (req. 5) — *calibrated*

### 4.1 Adjudication — fraction-of-tribe quorum
A member is marked a bad actor only when the count of **distinct complainants** who interacted with them reaches:

> **quorum = max( M_min, ⌈ q · active_tribe_size ⌉ )**, with **q = 0.25** and **M_min = 3**.

Each complaint is reputation-weighted with a **per-complainant cap = 0.10** so no whale can convict alone, but the *gate* is the distinct-fraction count. This replaces v2's absolute weighted threshold, which (simulation showed) let a handful of high-rep colluders convict anyone.

**Why a fraction, and why 0.25 (Appendix A.3):** an absolute body-count can't tell an honest majority from a captured minority — both are "enough complaints." A *fraction of the tribe* can: honest abuse is witnessed by the whole tribe, but a capture attacker is bounded by the fraction they control.

| Quorum q | Capture needs (fraction of tribe to frame an innocent) | Legit conviction latency (median / p90, private 1:1 abuse) |
|----------|--------------------------------------------------------|------------------------------------------------------------|
| 0.10 | ~10% — too weak | 10 d / 16 d |
| 0.20 | ~18% | 22 d / 29 d |
| **0.25** | **~20% (0% wrongful below 15%)** | **27 d / 36 d** |
| 0.30 | ~25% | 32 d / 41 d |
| 0.40 | ~33% but legit conviction starts failing (73% rate) | 43 d / 49 d |

q = 0.25 is the knee: a capture attacker must control ~one-fifth of the entire tribe to wrongfully convict someone, while genuine abuse still convicts reliably. **Latency scales with how public the abuse is** — the figures above are worst-case *private 1:1* abuse seen by few members per day; abusive *distribution* (Spark spam, §5) is witnessed by many at once and convicts in days. The 20–30% capture band is backstopped by cross-tribe appeal (§4.4). Complaints are rate-limited per member per epoch to prevent complaint-spam.

### 4.2 Transitive, decaying penalty — *calibrated*
On confirmed conviction:
- The bad actor's reputation is zeroed and they enter a re-accrual cooldown.
- Penalty propagates up the vouch chain: **direct voucher loses P_dir = 0.25 of their current reputation; a voucher h hops up loses P_dir · g^h with gradient g = 0.35; propagation stops once the per-hop penalty falls below 0.01.**

That cutoff bounds meaningful penalty to ~3 hops regardless of branching (Appendix A.2):

| Hop | Penalty (fraction of that member's rep) |
|-----|------------------------------------------|
| 0 (direct voucher) | 0.25 |
| 1 | 0.088 |
| 2 | 0.031 |
| 3 | 0.011 |
| 4 | <0.01 → not applied |

A direct voucher loses about a quarter of their standing — enough to demote them a meaningful fraction of a tier and make careless vouching genuinely costly — while a member three hops removed loses ~1%. Simulated mean total reputation removed per incident ≈ 0.82 "rep-units," concentrated on the direct voucher.

Guards: **anchors are exempt** from propagated penalty (they'd otherwise absorb everything); **per-member per-incident loss is capped** so one deep bad actor can't compound across multiple convictions in a short window; gradient g is tunable in **0.20–0.40** (higher spreads more collateral, lower weakens deterrence — 0.35 is the recommended balance).

### 4.3 Why this replaces v2's missing downside
v2 had only time-decay as a downside; a bad actor kept hard-earned standing for ~90 days. v3 adds an active, social, propagating downside, calibrated so the *direct* voucher feels it sharply and distant members barely at all.

### 4.4 Honest limitations
- A patient infiltrator who behaves until vouched then defects still does some damage before the quorum forms (worst-case ~3–5 weeks for purely private abuse; far less if the abuse touches many members). Throughput and Spark limits cap the *rate* of that damage.
- A captured tribe controlling ≥~20% of members can wrongfully convict. Mitigations: per-complainant cap, reputation-weighting, rate limits, and an **appeal path** that bridges the dispute (§3.4) to an overlapping tribe for an outside quorum.

### 4.5 Sybil-farm bound
Each sybil needs **2 distinct Member-tier vouchers** and, starting from zero reputation, must behave ~**14 days** to self-climb to Member tier before it has meaningful throughput (Appendix A.4). Admission is bounded by the **vouch issuance budget B = 2 meaningful vouches per member per 30-day epoch**: even a fully compromised trusted account admits ≤2 new members/month, and the §4.2 penalty then craters that account's reputation when its sybils defect — demoting it out of Member tier so it cannot vouch again. Sybil throughput is therefore bounded by (compromised Member+ accounts) × B / 2, each sybil costing two weeks of behaving and burning a voucher.

---

## 5. Content distribution with sender-unlinkability (req. 4 + req. 6)

Share content one-to-many within a tribe without a third party tracing it back to you. Reputation gating normally requires identity; v3 resolves the conflict with anonymous, rate-limited tokens.

### 5.1 The "Spark" — anonymous distribution token
- Your client mints single-use, unlinkable **Spark** tokens against your reputation, blind-signed (RSA blind signatures or BBS+) by the tribe's Stewards under a threshold key.
- Sparks-per-epoch is a function of your reputation, so a low-rep identity or spammer gets very few — preserving anti-abuse (req. 5).
- A Spark proves "minted by a member in good standing, within budget" **without revealing which member.**

### 5.2 Distributing
- Attach a **Spark instead of your identity**. Relays verify it's validly signed and unspent, then forward.
- **Double-spend prevention:** each Spark carries a nullifier; spent nullifiers are gossiped to the tribe checkpoint.
- Content is chunked, each chunk encrypted under an ephemeral key, the content key wrapped to authorized recipients. Chunks are BLAKE3 content-addressed **within the authorized transfer only** — no global content DHT.

### 5.3 Hiding the sender from relays too
Distribution payloads are **onion/mix-routed** through Steward relays: each relay learns only the next hop, never the origin. With the identity-free Spark, neither recipients nor any single relay can link content to you.

### 5.4 Honest ceiling (read this)
v3 sender-unlinkability protects against **recipients**, **any single relay**, and **ordinary network observers**. It does **not** defeat a **global passive adversary** correlating all relay traffic by timing/volume — out of scope by design (which is also why this isn't pitched for activists/whistleblowers). For that threat, run HEARTH over Tor. Padding and batched relay raise the bar; they don't eliminate it.

### 5.5 Anonymity vs. accountability
Sparks are anonymous but reputation-rate-limited, so the anonymous channel is bounded like everything else. Abusive *content* can still be quorum-complained-about by its content hash even without knowing the sender; sustained abuse from a tribe tightens the Steward-set's minting budget — a collective, not individual, response.

---

## 6. Cryptography & wire security (req. 1)

- **Identity keys:** Ed25519 (sign), X25519 (ECDH). **PQ migration path:** hybrid X25519 + ML-KEM for key agreement is a v3.x target given the long-lived root (sequencing is still an open question, §12).
- **Session:** Noise_XX handshake (mutual auth + forward secrecy).
- **Messaging:** Double Ratchet for 1:1; MLS (RFC 9420) for tribe groups.
- **Distribution:** chunked + per-chunk ephemeral keys, content key wrapped to recipients, onion-routed (§5.3).
- **Anonymous credentials:** RSA blind signatures or BBS+ for Sparks (§5.1) and selective-disclosure reputation/bridge proofs (§3.4) — reputation is proven without exposing the vouch graph.
- **At rest:** Argon2id-derived key (device passphrase/biometric).

---

## 7. Transport & topology

- **Local discovery:** mDNS on LAN. On-LAN traffic may run at an ungated **proximity tier** (physical presence is itself sybil-resistance) — for in-person gatherings and offline-first use. (Its own abuse bound is an open question, §12.)
- **Wide-area:** Kademlia-style DHT of signed, short-TTL identity→endpoint hints only. Never content.
- **NAT traversal:** ICE/STUN + hole punching; fallback to volunteer **Steward relays** seeing only ciphertext and, for distribution, one onion hop.

---

## 8. Licensing & openness (req. 2)

- **Spec:** public, royalty-free, defensive patent pledge.
- **Reference implementation:** AGPL-3.0 for node/relay code; Apache-2.0 for the embeddable client core (`libhearth`).
- **Trademark:** held by a nonprofit foundation; conformance required to use the HEARTH name.
- AGPL on relays is the honest anti-freeloading lever; the unenforceable v1 "commercial-gateway-at-scale" clause stays dropped.

---

## 9. Governance

- Nonprofit **HEARTH Foundation**; spec changes via open RFC.
- Reputation/penalty-math changes require a defined electorate (Foundation members + elected tribe delegates) with a public comment period. **The electorate is explicitly *not* reputation-weighted**, so the highest-rep actors can't govern the rules that produce reputation.

---

## 10. Threat model summary

| Adversary | Mitigated? | How / caveat |
|-----------|-----------|--------------|
| Passive link eavesdropper | Yes | E2E encryption, Noise |
| Active MITM | Yes | Mutual auth, key continuity, attestation |
| Spammer / botnet | Largely | Reputation-gated throughput + Spark budget; vouching gates admission |
| Careless/colluding voucher | Yes (calibrated) | Transitive decaying penalty (§4.2); direct voucher loses ~25% rep |
| Infiltrator who defects | Largely | Quorum conviction; bounded damage window; rate caps |
| Sybil ring | Largely | ≥2 Member+ vouchers, issuance budget, overlap-discounted bridging |
| Recipient tracing distributor | Yes | Identity-free Spark tokens |
| Single relay tracing distributor | Yes | Onion/mix routing |
| **Global passive traffic-correlation** | **No (by design)** | Run over Tor; §5.4 |
| Device theft / identity hijack | Largely | Device subkeys + revocation + threshold root + gated recovery |
| Tribe-capture wrongful conviction | Partial (calibrated) | q=0.25 forces ~20% control; cross-tribe appeal backstop |
| Endpoint compromise | Partial | At-rest encryption, post-compromise ratchet; can't fix a rooted device |

---

## 11. Novelty statement (req. 7)

> A tribe-scoped secure P2P comms + content-distribution protocol where **admission requires multiple in-person vouchers who stake their own reputation**, **misconduct penalties propagate transitively (and decaying) up the vouch chain**, and **one-to-many distribution is sender-unlinkable via reputation-rate-limited anonymous tokens** — with no token/coin, no global content DHT, and deliberately no global scale; with the reputation-dynamics parameters calibrated against adversarial simulation rather than hand-set.

Closest prior art: Scuttlebutt (social trust, no staked vouching/penalty), EigenTrust (the math, not a comms protocol), BrightID/Proof-of-Humanity (personhood, financialized/permanent), Signal/MLS (the crypto, scale-neutral), anonymous-credential systems (the token math, not a tribal design).

---

## 12. Open questions for v4

Resolved in v3 (was v2 §12): penalty gradient, decay half-life, quorum threshold + complaint weighting (now §3.3, §4.1, §4.2; Appendix A). Still open:

- **Cross-tribe appeal mechanics** for the 20–30% capture band (who hears it, how the outside quorum is selected without being itself gameable).
- **Proximity/LAN ungated tier abuse bound** — physical presence resists sybils but not a malicious insider at a gathering; needs its own limit.
- **PQ migration sequencing** for the long-lived root key (hybrid rollout, downgrade protection).
- **Spark minting-budget curve** vs. reputation — exact shape so a prolific good-faith sharer isn't throttled while a spammer is (v3 fixes the mechanism, not the final curve).
- **Quorum behavior in very small or very new tribes**, where M_min=3 dominates q·N and a single faction is a larger share.
- **Dormancy-grace abuse** — preventing accounts from cycling dormancy to dodge decay while retaining power.

---

## Appendix A — Simulation evidence

Agent-based Monte-Carlo model (`hearth_v3_sim.py`, results in `hearth_v3_sim_results.json`). Tribe N=100, daily steps, 120–400 day horizons, 120–400 seeds per cell. Three adversaries: infiltrator-who-defects, sybil-farm, tribe-capture. Caveat: a model, not a proof — relative comparisons across parameters are the signal, not absolute day-counts, which depend on the (deliberately conservative) reporting-rate assumptions.

**A.1 Decay half-life.** Idle-retention table in §3.3. Shorter H disproportionately punishes intermittent honest users; H=90 chosen as the balance, plus dormancy grace.

**A.2 Penalty gradient.** With P_dir=0.25, the per-hop penalty falls below the 0.01 cutoff by hop 4, so meaningful collateral is ~3 hops regardless of branching. Direct-voucher loss ≈0.20–0.21 rep; total per-incident ≈0.82 rep-units. Raising g from 0 to 0.7 raises total collateral from ~0.41 to ~1.83 while direct loss is unchanged — i.e., g is purely a *spread* knob; 0.35 keeps spread bounded.

**A.3 Fraction quorum.** Table in §4.1. q=0.25 yields 0% wrongful conviction below 15% tribe-capture, 13.5% at 20%, near-certain above 25%, while keeping legitimate conviction reliable (100% conviction rate up to q=0.30; collapses by q=0.40).

**A.4 Sybil farm.** Each sybil must behave ~14 days from zero to reach Member tier (H=90), needs 2 Member+ vouchers, and admission is capped by issuance budget B=2/voucher/epoch; the transitive penalty then removes the duped voucher's ability to continue.
