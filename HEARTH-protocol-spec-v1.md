# HEARTH Protocol — Product Specification v1

**HEARTH**: *Human-Endorsed Authenticated Relay & Transfer for Humans*

A peer-to-peer communication and file-sharing standard whose core design goal is that **the cost structure favors individual humans and structurally penalizes industrial-scale, automated, or commercial exploitation.**

---

## 0. Design thesis (read this first)

Every existing secure-P2P system optimizes for one of: privacy (Tor, Signal), decentralization (IPFS, BitTorrent), or trustless coordination (blockchains). None of them are *hostile to scale*. In fact most are scale-neutral or scale-friendly — a corporation or botnet can run 10,000 nodes as easily as one, often more easily because they have capital.

HEARTH inverts this. The protocol's novel primitive is a **non-transferable, decaying, human-attested reputation credential ("Ember")** that gates throughput. The asymmetry it creates:

- A normal human accrues enough Embers passively, for free, to do everything they'd ever want.
- An actor trying to operate at commercial or abusive scale must continuously acquire *fresh human attestation* — which is slow, costly, and cannot be automated or purchased in bulk without detection.

This is the requirement-5 mechanism (disincentivize corporate/malicious usage), and it's the part that makes HEARTH genuinely new rather than "Signal-plus-IPFS."

---

## 1. Goals & non-goals

### Goals
1. End-to-end encrypted communication and file transfer, secure against in-flight interception by any third party (req. 1).
2. Fully open standard, reference implementation, and tooling under a permissive + copyleft hybrid (req. 2).
3. First-class mobile and desktop support with a low-friction onboarding (req. 3).
4. Optimized for prosocial use: personal communication, mutual-aid file sharing, civic and educational distribution (req. 4).
5. Structural disincentives against corporate exploitation, spam, and abuse (req. 5).
6. Pseudonymous-by-default with an optional, earned reputation layer (req. 6).
7. Novel architecture, not a fork or reskin of an existing protocol (req. 7).

### Non-goals
- **Not** a cryptocurrency or token. No coin, no chain-as-database, no financialization. (Tokens are precisely what lets capital buy scale — explicitly excluded.)
- **Not** anonymous in the Tor sense. HEARTH provides *pseudonymity and metadata minimization*, not strong anonymity against a global passive adversary. Stating this honestly: if your threat model is a nation-state correlating traffic, use Tor underneath HEARTH; HEARTH does not claim to defeat that on its own.
- **Not** a content host / CDN replacement. Throughput limits are a feature, not a bug.
- **Not** a replacement for the web.

---

## 2. Core concepts

### 2.1 Identity — the *Seed*
Each user generates a long-lived keypair locally (Ed25519 signing + X25519 for key agreement). The public key hash is the user's pseudonymous address. No registration, no central authority, no email, no phone number required to *exist* on the network.

A Seed by itself can do very little — it can receive, and it can send at a heavily rate-limited "stranger tier." This is deliberate: a brand-new unattested identity is cheap to create, so a brand-new identity must be nearly worthless for abuse.

### 2.2 The *Ember* — non-transferable human-attested reputation
An Ember is a signed attestation from one Seed to another that says, in effect, *"I have interacted with this identity and it behaved like a good-faith human participant."*

Critical properties (this is the heart of the novelty):

- **Non-transferable.** An Ember is bound to the recipient's public key. It cannot be sold, gifted, or moved. There is no market for them because they are meaningless on any key but their target.
- **Decaying.** Embers lose weight over time on a half-life (default 90 days). Reputation reflects *recent* good standing, not accumulated history. You cannot stockpile reputation in 2026 and cash it in 2030.
- **Costly to issue at scale.** Each Seed can issue only a small number of *weighted* Embers per epoch, and the weight of an Ember you issue is itself a function of *your own* current Ember standing. A fresh/low-rep identity's attestations are nearly worthless. This makes vouching-rings (sybil farms attesting to each other) collapse: a ring of zero-reputation nodes attesting to each other produces ≈ zero reputation.
- **Earned through use, not work or money.** You gain Embers by being a counterparty in successful, uncontested exchanges with already-reputable humans. No CAPTCHA, no proof-of-work, no payment.

Your effective reputation = decay-weighted sum of inbound Embers, weighted by the issuer's own reputation. This is a PageRank-style trust flow, seeded by a small set of bootstrap anchors (§6).

### 2.3 Throughput tiers
Reputation maps to capability:

| Tier | Reputation | Capability |
|------|-----------|-----------|
| Stranger | new / 0 | Tiny messages, rate-limited; can receive; can request to be vouched |
| Member | low | Normal 1:1 messaging, modest file sizes |
| Trusted | medium | Group channels, larger transfers, can issue meaningful Embers |
| Steward | high | Can run relays, anchor others, higher fan-out |

The asymmetry: a human reaches **Member** within a few real interactions and **Trusted** within weeks of normal use. An automated actor must obtain attestations from *already-trusted humans* for *each* identity it spins up — and because Embers are rate-limited and weight-discounted, mass attestation is detectable and self-limiting.

---

## 3. Cryptography & wire security (req. 1)

- **Identity keys:** Ed25519 (sign), X25519 (ECDH).
- **Session establishment:** A Noise-Protocol-Framework handshake (Noise_XX pattern) for mutual authentication + forward secrecy. *Note: Noise is an existing, audited framework — HEARTH uses it as a building block rather than rolling its own transport crypto. The novelty is in the identity/reputation layer, not in inventing new primitives, which would be irresponsible.*
- **Message encryption:** Double Ratchet for 1:1 (forward secrecy + post-compromise security). Sender keys (à la MLS-style group ratchet) for groups; HEARTH targets **MLS (RFC 9420)** for group messaging rather than reinventing group key agreement.
- **File transfer:** Content chunked, each chunk encrypted under an ephemeral content key; content key wrapped to recipient(s). Chunks are content-addressed (BLAKE3 hash) for integrity and dedup *within an authorized transfer only* — no global public DHT of content (see §4.2 rationale).
- **In-flight:** all bytes on the wire are ciphertext from a completed handshake. No plaintext metadata beyond what's required to route to the next hop.
- **At rest:** local store encrypted with a key derived from a device passphrase/biometric via Argon2id.

What HEARTH protects: confidentiality + integrity + authenticity of content and the fact of *what* is being said, against any third party intercepting the link.

What HEARTH does **not** fully protect (stated plainly): traffic-analysis / who-talks-to-whom against a global passive observer. Metadata is minimized (padded message sizes, batched relay) but not anonymized to Tor's level by default.

---

## 4. Transport & topology

### 4.1 Peer discovery & connectivity
- Local discovery: mDNS on LAN.
- Wide-area: a Kademlia-style DHT storing **only** identity→endpoint hints (signed, short-TTL), never content.
- NAT traversal: ICE/STUN + hole punching; fallback to volunteer **relay nodes** run by Stewards. Relays see only ciphertext and minimal routing metadata.

### 4.2 Why no global content DHT
A public content-addressed DHT (IPFS/BitTorrent style) is exactly the primitive that makes a system attractive for unsanctioned mass distribution and for corporate freeloading on volunteer storage. HEARTH deliberately scopes file transfer to **authorized, point-to-point or group-scoped** exchange. You share files *with people you're connected to*, not to an anonymous global swarm. This directly serves req. 4 and req. 5.

---

## 5. Anti-abuse / anti-corporate mechanics (req. 5) — detailed

Layered, all flowing from the Ember primitive:

1. **Reputation-gated throughput.** Bandwidth, message rate, fan-out, and max file size all scale with decay-weighted reputation. A new identity is throttled to near-uselessness for spam.
2. **Sybil resistance via trust-flow.** Reputation must flow from bootstrap anchors through *real humans*. Fabricated identities attesting to each other form a disconnected subgraph with ≈ 0 flow.
3. **Non-transferable, decaying credentials.** No reputation market; no buy-in for capital; no stockpiling.
4. **Issuance budget proportional to standing.** High-rep humans can vouch meaningfully but only a few per epoch — so even a compromised trusted node can't mint an army.
5. **Fan-out asymmetry.** One-to-many broadcast capability is the most-abused vector (spam, propaganda, exfil). Fan-out is the *most* reputation-expensive action and is sub-linear in reputation — generous for a community organizer, prohibitive for a marketing operation.
6. **No anonymity-for-scale.** An actor wanting both scale *and* deniability finds the two in tension: scale requires attestation, attestation creates a (pseudonymous) trust trail.
7. **License-level disincentive.** (§8) Commercial gateways are license-restricted.

**Honest limitation:** This raises the cost of abuse; it does not make it impossible. A patient adversary who behaves like real humans across many identities for months *can* accrue reputation. The design goal is to make abuse *as expensive as genuine participation*, removing the economic asymmetry that automated/corporate abuse relies on. Anyone claiming a P2P system is abuse-*proof* is selling something.

---

## 6. Bootstrapping the trust graph

The chicken-and-egg problem: reputation flows from anchors, but who anchors first?

- Launch with a small, transparent, public set of **bootstrap anchors** — civic orgs, libraries, universities, open-source foundations — who attest in-person or via existing real-world trust (e.g., a library hands out an attestation at a signup desk; a conference badge scan).
- Anchors are **public and auditable**; their attestation weight is capped and decays like everyone's, so the network doesn't stay centrally dependent.
- Over time the human trust graph self-sustains and anchor influence dilutes. Anchors are training wheels, not gatekeepers.

This ties req. 4 (betterment of society) to the mechanism itself: the institutions that bootstrap trust are public-interest institutions.

---

## 7. Mobile & desktop adoption (req. 3)

- **Reference clients:** native-feeling apps for iOS, Android, macOS, Windows, Linux from one shared core (Rust core + thin platform UI). 
- **Core as a library:** `libhearth` (Rust) with FFI bindings (Swift, Kotlin, Python, WASM) so third parties build easily.
- **Onboarding in <60s:** install → generate Seed → optionally scan an attestation QR from a friend or anchor → start messaging at Member tier immediately if vouched.
- **QR-based in-person vouching** is the primary growth loop and doubles as the sybil-resistant attestation path: meeting a human in person is the cheapest legitimate way to gain reputation and the most expensive thing to fake at scale.
- **Account portability:** Seed backup via recovery phrase; reputation is tied to the Seed, so restoring the key restores standing.

---

## 8. Licensing & openness (req. 2 + req. 5)

- **Protocol spec:** public, royalty-free, no patents asserted (defensive patent pledge).
- **Reference implementation:** dual-licensed:
  - **AGPL-3.0** for the networked node/relay code — any modified relay offered as a service must publish source. This is a deliberate anti-corporate-freeloading lever.
  - **Apache-2.0** for `libhearth` client embedding so individual developers and nonprofits adopt freely.
- **Trademark:** the HEARTH mark is held by a nonprofit foundation; conformance required to use the name (prevents embrace-extend-extinguish).
- **Commercial-gateway clause:** bridging HEARTH into a closed commercial product at scale requires a foundation agreement; individual and nonprofit use is unconditionally free.

---

## 9. Governance

- Stewarded by a nonprofit **HEARTH Foundation**; spec changes via an open RFC process.
- No single corporate maintainer; changes affecting the reputation algorithm require supermajority + public comment period (the reputation math is the system's constitution and must not be quietly tuned in anyone's favor).

---

## 10. Threat model summary

| Adversary | Mitigated? | How / caveat |
|-----------|-----------|--------------|
| Passive link eavesdropper | Yes | E2E encryption, Noise handshake |
| Active MITM | Yes | Mutual auth, key continuity, TOFU + attestation |
| Spammer / botnet | Largely | Reputation-gated throughput; not impossible, but uneconomic |
| Corporate freeloader | Largely | AGPL relays, fan-out cost, gateway clause |
| Sybil attacker | Largely | Trust-flow reputation; patient long-game attacker still possible |
| Global passive traffic-analysis adversary | **No (by design)** | Use Tor underneath; HEARTH minimizes but doesn't anonymize metadata |
| Endpoint compromise | Partial | At-rest encryption, post-compromise security via ratchet; can't fix a rooted device |

---

## 11. Novelty statement (req. 7) — verify this yourself

HEARTH's components individually exist (Noise, MLS, Double Ratchet, Kademlia, trust-flow reputation à la EigenTrust/PageRank). The **novel combination** that doesn't exist as a single standard today:

> A secure P2P comms+transfer protocol whose **throughput and fan-out are gated by a non-transferable, decaying, trust-flow-weighted human-attestation credential**, explicitly engineered so the marginal cost of abuse equals the marginal cost of genuine human participation — with **no token, no global content DHT, and AGPL relays** to remove every existing avenue by which capital buys scale.

Closest prior art to check: Scuttlebutt (social trust, but no throughput gating / decay), BrightID & Proof-of-Humanity (personhood, but token-financialized and identity-permanent), EigenTrust (the reputation math, but not a comms protocol), Signal/MLS (the crypto, but scale-neutral). None combine the anti-scale economic design with these crypto + governance choices.

---

## 12. Open questions for v2

- Exact decay half-life and issuance-budget curves need simulation against adversarial models before fixing.
- Recovery vs. reputation: a lost Seed loses standing — is social recovery worth the sybil risk it introduces?
- Quantifying fan-out cost so community organizers aren't accidentally punished alongside spammers.
- Formal sybil-resistance proof / bound on the trust-flow algorithm.
- Whether *optional* stronger anonymity (mixnet mode) should be a profile, given the metadata caveat.
