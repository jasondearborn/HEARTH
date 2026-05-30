# HEARTH Protocol — Product Specification v2

**HEARTH**: *Human-Endorsed Authenticated Relay & Transfer Hub*

A peer-to-peer communication and content-distribution standard for **tribes** — small, bridgeable communities of people who vouch for each other. The core design goal is that **trust is earned through human vouching, accountability flows back to the vouchers, and the cost structure favors individual humans over automated or industrial-scale exploitation.**

> Changes from v1: scope narrowed to tribal-scale communication (no global broadcast); fixed the double-"Human" name; vouching now requires ≥2 endorsers and makes them accountable (transitive, decaying penalty); added quorum-based bad-actor adjudication; added sender-unlinkable distribution via anonymous tokens; replaced the single Seed with a portable multi-device identity; added bridgeable multi-tribe membership.

---

## 0. Design thesis

Existing secure-P2P systems are scale-neutral: a corporation or botnet can run 10,000 nodes as easily as one. HEARTH is not trying to be a global network — it is explicitly **anti-global-scale**, because a reputation system with decay cannot and should not span the planet. HEARTH is built for **tribes**: Dunbar-sized groups bound by mutual human vouching.

Two primitives carry the design:

1. **The Ember** — a non-transferable, decaying reputation credential earned by good-faith participation *and lost* through bad behavior or by vouching for bad actors.
2. **Vouching with skin in the game** — you join a tribe only when ≥2 existing members vouch for you, and **their** standing is staked on your behavior. A bad actor doesn't just burn their own reputation; the damage propagates back up the chain that admitted them, decaying with distance.

This makes admission self-policing: members won't vouch carelessly, because careless vouching costs them.

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
- **Not** global-scale. Reputation decay makes planetary scale impossible by design; HEARTH targets tribes and bridges between them, not a worldwide graph.
- **Not** a cryptocurrency or token. No coin, no chain-as-database.
- **Not** marketed for journalists, activists, or whistleblowers, and **not** a strong-anonymity system against a global passive adversary. (The sender-unlinkability in §5 protects against recipients, individual relays, and ordinary observers — see the honest ceiling in §5.4. For nation-state traffic-correlation resistance, run HEARTH over Tor.)
- **Not** a broadcast/alerting platform. Real-time one-to-many *messaging* is out of scope. One-to-many *content distribution* within a tribe is in scope and is treated as a distinct, sender-anonymous primitive (§5).
- **Not** a content host / CDN. Distribution is tribe-scoped, not a public swarm.

---

## 2. Identity (req. 3)

Replaces v1's single "Seed." Identity is two-layered so a person is "the same person" across their iPhone, desktop, etc., and so a stolen device is recoverable.

### 2.1 Root identity ("Hearthstone")
Generated once. This is the pseudonymous address and the anchor of all reputation. Kept offline / in a secure enclave / optionally split (threshold, §2.5). Rarely exercised directly.

### 2.2 Device keys (subkeys)
Each device generates its own keypair, certified by the root via a signed **device certificate**. All devices act as the same identity because their certs chain to the root (SSH-CA / Signal-Sesame / FIDO model). **Reputation binds to the root, so it is shared across every enrolled device automatically.** This is the portability you want: log in on a new device, you're the same person, with the same standing.

### 2.3 Passkeys
A device key may be a platform **passkey (WebAuthn/FIDO2)** in the secure enclave/TPM, unlocked by biometric — the private key never leaves hardware in cleartext.
- **Consumer default:** platform-synced passkeys (iCloud Keychain / Google Password Manager) give "new device = same person" with minimal friction. Caveat: you then trust the platform vendor's sync security.
- **Hardened mode:** threshold root (§2.5), no cloud sync, for high-reputation accounts that are attractive targets.

### 2.4 Enrollment of a new device
An existing device signs the new device's cert (scan QR / short numeric code, like Signal/WhatsApp linking). No central server. The set of valid device certs is published as a **signed, monotonically-versioned record** under the root.

### 2.5 Anti-hijack
- **Device revocation.** Root, or a quorum of existing devices, can revoke a device cert. Revocation is a signed, version-incrementing statement gossiped to peers; counterparties refuse sessions from revoked keys. *Stolen laptop → revoke that one key; root and reputation untouched.*
- **Containment.** A stolen device leaks only its own subkey (revocable) plus the at-rest store (Argon2id-protected). It does **not** leak the root or the ability to issue Embers/vouches — provided the root is kept separate.
- **Root rotation with delay + multi-device confirm.** Rotating to a new root is announced by the old root, gated behind a time-lock and confirmation from multiple enrolled devices, so a thief can't instantly rotate the owner out.
- **Threshold root.** Split the root M-of-N across devices/backup (e.g., 2-of-3: phone + desktop + offline backup). Stealing one device can neither move the identity nor enroll rogue devices. Default for Stewards/high-rep accounts.
- **Social recovery via the tribe.** Your guardians are tribe members. M-of-N attested guardians co-sign a recovery, gated by (a) a time-lock, (b) out-of-band notification to all enrolled devices so a malicious recovery is visible and vetoable, and (c) a reputation cool-down so recovery doesn't instantly restore full standing.
- **Takeover detection.** New-device enrollment and root rotation always notify all existing devices out-of-band; a newly-enrolled device serves a probation window during which high-value actions (vouching, issuing Embers, running a relay) are rate-limited.

---

## 3. Tribes & membership

### 3.1 What a tribe is
A tribe is a small (Dunbar-scale, ≤ ~150 active members) community with its own reputation graph. Tribes are **bridgeable**: one root identity can belong to several tribes and carry standing between them (§3.4).

### 3.2 Admission requires ≥2 vouchers
A prospective member (the "third") is admitted only when **at least two existing members vouch** for them. Vouching is in-person-first (QR exchange, proximity- and time-bound) because physical presence is the cheapest legitimate trust signal and the most expensive thing to fake at scale.

Vouching is **staking**: by vouching, you bind a portion of your own reputation to the vouchee's future conduct.

### 3.3 Reputation computation
Because tribes are small, each member can observe their tribe's vouch/Ember graph directly. Effective reputation = decay-weighted (90-day default half-life) sum of inbound Embers, weighted by issuer standing, *minus* accrued negative marks (§4). Stewards periodically publish a **threshold-signed reputation checkpoint** gossiped to the tribe so members agree on tiers without each recomputing from a partial view.

### 3.4 Bridging between tribes (multi-membership)
A member in good standing in tribe A who joins tribe B may present a **bridge attestation** — a signed, selective-disclosure proof of "I hold ≥ X standing in another tribe" — which counts toward admission. Sybil controls:
- A bridge attestation **does not bypass** the ≥2-local-voucher requirement; it only adds weight.
- Imported standing is **capped and discounted**, and the discount increases with **membership overlap**: if A and B share most members, bridging adds little (this kills echo-chamber sybil rings that spin up overlapping tribes to launder reputation).
- Bridge weight decays like everything else.

---

## 4. Vouching accountability & bad-actor handling (req. 5)

This is the core novelty of v2.

### 4.1 Bad-actor adjudication — quorum of affected peers
A member is marked a bad actor only by a **quorum**: M-of-N distinct members who have actually interacted with the target file reputation-weighted complaints. This resists single-person brigading and retaliation. A lone complaint dents nothing on its own; standing erodes only as independent, weighted complaints accumulate past threshold.

Rate limits and weighting:
- Complaints are reputation-weighted (a Steward's complaint counts more than a stranger's) but **capped per complainant** so no single high-rep member can unilaterally convict.
- Filing is rate-limited per member per epoch to prevent complaint-spam.

### 4.2 Transitive, decaying penalty up the vouch chain
When the quorum confirms a bad actor:
- The bad actor's own reputation is slashed (beyond normal decay).
- **Direct vouchers** take the largest penalty — they personally endorsed this person.
- **Vouchers of those vouchers** take a smaller penalty, and so on, **decaying with each hop** up the chain that admitted the bad actor.
- The penalty per hop is bounded so a single bad actor deep in your sub-tree can't wipe out a distant member, but the gradient is steep enough that careless vouching is genuinely costly.

Effect: admission becomes self-policing. You won't vouch for someone you don't actually trust, and you have an incentive to watch the people you vouched for — because their misconduct flows back to you.

### 4.3 Why this replaces v1's missing downside
v1 had only time-decay as a downside; a bad actor kept hard-earned standing for ~90 days. v2 adds an active, social, propagating downside that mirrors how real tribes enforce norms: the people who let you in are answerable for you.

### 4.4 Honest limitation
A patient adversary who behaves well long enough to be vouched, then defects once, still does *some* damage before the quorum forms. The design goal is to make the *expected* cost of vouching for an eventual defector high enough that careful members gate admission tightly — not to make defection impossible. Quorum adjudication also has a failure mode: a captured majority within a tribe can wrongly convict a member. Mitigations: per-complainant caps, reputation-weighting, and an appeal path that bridges the dispute to an overlapping tribe (§3.4) for an outside quorum.

---

## 5. Content distribution with sender-unlinkability (req. 4 + req. 6)

You want to share content one-to-many within your tribe **without a third party being able to trace the content back to you and stop you.** This conflicts head-on with reputation gating (which normally requires knowing who you are). v2 resolves it with anonymous, rate-limited spend tokens.

### 5.1 The "Spark" — an anonymous distribution token
- Your client periodically mints single-use, unlinkable **Spark** tokens against your current reputation, blind-signed (RSA blind signatures or BBS+) by the tribe's Stewards under a threshold key.
- The number of Sparks you can mint per epoch is a function of your reputation — so a low-rep identity or a spammer gets very few, preserving anti-abuse (req. 5).
- A Spark proves "minted by a member in good standing, within budget" **without revealing which member.**

### 5.2 Distributing
- To distribute content to the tribe (or a subset), you attach a **Spark instead of your identity**. Relays verify the Spark is validly signed and unspent, then forward.
- **Double-spend prevention:** each Spark carries a nullifier; spent nullifiers are gossiped to the tribe checkpoint. Reusing a Spark is rejected.
- Content is chunked, each chunk encrypted under an ephemeral content key, the content key wrapped to authorized recipients (tribe members or a named subset). Chunks are content-addressed (BLAKE3) for integrity/dedup **within the authorized transfer only** — no global content DHT.

### 5.3 Hiding the sender from relays too
Distribution payloads are **onion/mix-routed** through Steward relays: each relay peels one layer, learning only the next hop, never the origin. Combined with the Spark (which carries no identity), neither recipients nor any single relay can link the content to you.

### 5.4 Honest ceiling (read this)
v2 sender-unlinkability protects against: **recipients**, **any single relay**, and **ordinary network observers**. It does **not** defeat a **global passive adversary** who can watch all relay traffic simultaneously and correlate timing/volume. That is out of scope by design (it's also why this isn't pitched for activists/whistleblowers). If your real-world adversary has that capability, run HEARTH over Tor; HEARTH does not claim to defeat global traffic correlation on its own. Padding and batched relay raise the bar but do not eliminate it.

### 5.5 Anonymity vs. accountability
Sparks are anonymous but **rate-limited by reputation**, so abuse via the anonymous channel is bounded the same way as everything else. If anonymously-distributed content is itself abusive, recipients can still file quorum complaints about the *content* (e.g., by its content hash) even without knowing the sender; repeated abusive content from the tribe shrinks the Steward-set's willingness to keep minting and can trigger tightened minting budgets — a collective, not individual, response.

---

## 6. Cryptography & wire security (req. 1)

- **Identity keys:** Ed25519 (sign), X25519 (ECDH). **PQ migration path:** hybrid X25519 + ML-KEM for key agreement is a v2.x target, since the root is long-lived. (New vs v1, which was silent on PQ.)
- **Session:** Noise_XX handshake (mutual auth + forward secrecy).
- **Messaging:** Double Ratchet for 1:1; MLS (RFC 9420) for tribe group messaging.
- **Distribution:** chunked + per-chunk ephemeral keys, content key wrapped to recipients, onion-routed (§5.3).
- **Anonymous credentials:** RSA blind signatures or BBS+ for Sparks (§5.1) and for selective-disclosure reputation/bridge proofs (§3.4) — so reputation can be proven without exposing the vouch graph (fixes v1's trust-graph privacy hole).
- **At rest:** local store encrypted via Argon2id-derived key (device passphrase/biometric).

---

## 7. Transport & topology

- **Local discovery:** mDNS on LAN. On-LAN traffic within a tribe may run at an ungated **proximity tier** (physical presence is itself sybil-resistance) — useful for in-person gatherings and offline-first scenarios.
- **Wide-area:** Kademlia-style DHT storing only signed, short-TTL identity→endpoint hints. Never content.
- **NAT traversal:** ICE/STUN + hole punching; fallback to volunteer **Steward relays**, which see only ciphertext and, for distribution, only one onion hop.

---

## 8. Licensing & openness (req. 2)

- **Spec:** public, royalty-free, defensive patent pledge.
- **Reference implementation:** AGPL-3.0 for node/relay code; Apache-2.0 for the embeddable client core (`libhearth`).
- **Trademark:** held by a nonprofit foundation; conformance required to use the HEARTH name.
- **Dropped from v1:** the unenforceable "commercial-gateway-at-scale" clause. On an E2E, tribe-scoped network you cannot detect commercial scale without the surveillance the design removes, and the field-of-use restriction conflicted with "fully open." AGPL on relays is the honest anti-freeloading lever; rely on it.

---

## 9. Governance

- Nonprofit **HEARTH Foundation**; spec changes via open RFC.
- Reputation/penalty math changes require a defined electorate (Foundation members + elected tribe delegates) with a public comment period. **The electorate is explicitly *not* reputation-weighted**, to prevent the highest-rep actors from governing the rules that produce reputation (fixes a v1 capture risk).

---

## 10. Threat model summary

| Adversary | Mitigated? | How / caveat |
|-----------|-----------|--------------|
| Passive link eavesdropper | Yes | E2E encryption, Noise |
| Active MITM | Yes | Mutual auth, key continuity, attestation |
| Spammer / botnet | Largely | Reputation-gated throughput + Spark minting budget; vouching accountability gates admission |
| Careless/colluding voucher | New in v2 | Transitive decaying penalty; quorum adjudication |
| Sybil ring | Largely | ≥2 in-person vouchers, overlap-discounted bridging, trust-flow with decay |
| Recipient tracing the distributor | Yes | Spark tokens carry no identity |
| Single relay tracing the distributor | Yes | Onion/mix routing |
| **Global passive traffic-correlation adversary** | **No (by design)** | Run over Tor; §5.4 |
| Device theft / identity hijack | Largely (new in v2) | Device subkeys + revocation + threshold root + gated social recovery |
| Endpoint compromise | Partial | At-rest encryption, post-compromise ratchet; can't fix a rooted device |
| Captured-tribe wrongful conviction | Partial | Per-complainant caps, weighting, cross-tribe appeal |

---

## 11. Novelty statement (req. 7)

The novel combination, not present as a single standard today:

> A tribe-scoped secure P2P comms + content-distribution protocol where **admission requires multiple in-person vouchers who stake their own reputation**, **misconduct penalties propagate transitively (and decaying) back up the vouch chain**, and **one-to-many distribution is sender-unlinkable via reputation-rate-limited anonymous tokens** — with no token/coin, no global content DHT, and deliberately no global scale.

Closest prior art: Scuttlebutt (social trust, no staked vouching/penalty), EigenTrust (the math, not a comms protocol), BrightID/Proof-of-Humanity (personhood, but financialized/permanent), Signal/MLS (the crypto, scale-neutral), anonymous-credential systems (the token math, not a tribal comms design).

---

## 12. Open questions for v3

- Exact penalty gradient per vouch-chain hop, and decay half-life, need adversarial simulation before fixing.
- Quorum thresholds (M-of-N) and complaint weighting curves vs. wrongful-conviction risk.
- Spark minting budget curve vs. reputation — generous enough for a prolific good-faith sharer, tight for a spammer.
- Cross-tribe appeal mechanics for captured-tribe disputes.
- Whether the proximity/LAN ungated tier needs its own abuse bound.
- PQ migration sequencing for the long-lived root key.
