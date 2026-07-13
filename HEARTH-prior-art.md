# HEARTH — Prior Art & Design Rationale

*Companion to `HEARTH-protocol-spec-v5.md`. For every system that overlaps HEARTH, this document
answers three questions: what does it do, what did the world learn from it, and what did HEARTH
adopt, reject, or inherit as an open risk. Section references (§n) point at the v5 spec.*

---

## 1. Why this document exists

A protocol earns trust two ways: by what it proves, and by showing it has metabolized the failures of
everything that came before it. HEARTH overlaps five research-and-product lineages — human-vouching
sybil resistance, P2P private-group communication, anonymous credentials, verifiable
publication/transparency logs, and federated moderation. Nothing in any lineage combines HEARTH's
primitives; several systems supply one layer each, and several supply a documented failure HEARTH is
explicitly designed around.

**The honest headline first:** every strict vouch-gated network surveyed — BrightID, Proof of
Humanity, Idena, Duniter, Humanity DAO — stayed niche or died. The base rate for "strict human
vouching + mass adoption" is 0-for-5. HEARTH's bet is structurally different (tribe-scoped utility
rather than one global graph; 1:1 messaging requires no tribe at all), but it is a bet, recorded as
the spec's riskiest assumption (spec §1.4, §16). This document does not argue HEARTH will win; it
argues HEARTH is the best-informed attempt in its class.

---

## 2. Master comparison matrix

| System | Category | What it shares with HEARTH | Fatal/limiting lesson | HEARTH verdict |
|---|---|---|---|---|
| BrightID | Social-graph personhood | Graph-based sybil scoring | Unmeasured resistance; duplicate-group attacks | Adopt group-level graph analysis; reject unmeasured claims (§4, sims) |
| Proof of Humanity | Vouch registry | Staked vouching, voucher penalty | Binary single-hop penalty; governance fork nearly killed it | Adopt vouch lock-in; define schism semantics (§4.7, §15.4) |
| Circles UBI | Web-of-trust currency | Trust edges, exposure caps | Economic bootstrap failed; sybil design held | Adopt valueless-by-construction framing for Sparks (§1.1, §7) |
| Idena | Synchronous personhood | Friction-as-security | Most rigorous = least adopted | Adopt the tradeoff honestly; reject ceremonies (§1.4) |
| Worldcoin | Biometric personhood | None (contrast row) | Scales fast at privacy/centralization cost | Rejected class; stated as conscious tradeoff |
| EigenTrust | Trust-flow math | Reputation aggregation | Anchor centralization; "who computes it" | Rejected global scores; vantage-scoped Federation (§9) |
| Advogato | Attack-resistant trust metric | Bounded trust flow | Proof bug: post-attack vs pre-attack capacities | Adopt the fix: penalty snapshot semantics (§6.4) |
| MeritRank | Sybil-tolerant reputation | Decay taxonomy | Time decay alone is the weakest lever | Adopt connectivity discount + voucher independence (§4.3–4.4) |
| Cheng–Friedman | Theory | Sybilproofness theorem | Symmetric reputation cannot be sybilproof | Adopt explicit asymmetry statement (§4.8) |
| Secure Scuttlebutt | P2P social protocol | Gossip, local-first | Unbounded full-feed replication → OOM → sunset | Prohibit full-history replication (§10.4) |
| Briar | Tor P2P messenger | Delay-tolerant sync, honest threat model | 4× battery, foreground-only, no iOS | Adopt sideloading + mailboxes; name the wake/push gap (§10.5) |
| Cwtch | Metadata-resistant groups | Untrusted ciphertext-only relays | Groups retrofitted onto 1:1 took years | Validates Steward relay boundary (§11); design groups natively |
| Retroshare | Friend-to-friend network | Vouched-only visibility | 20 years proves pure F2F caps at hobbyist scale | Adopt invariant inside tribes; 1:1 needs no tribe (§10.1) |
| Veilid | P2P app framework | Private routing, multi-writer DHT | Pre-1.0 after 3 years, one demo app | Borrow multi-writer-hint concept; reject dependency |
| Willow/Earthstar | Capability-scoped sync | Bounded partial sync, sideloading | Young, but spec-mature (Meadowcap Final) | Adopt as design pattern for tribe-state sync (§10.4) |
| Matrix (+MSC4244) | Federated chat, MLS migration | Decentralized group state | State-reset bugs; MLS needs a per-room hub | Adopt sequencer-Steward (rotating hub) for MLS (§10.2) |
| Signal | Centralized E2E messenger | zkgroup/KVAC private groups, sealed sender | Traffic analysis still bites sealed sender | Adopt two-credential pattern; keep GPA non-goal (§5.7, §7) |
| iroh / libp2p | P2P transport | Hole-punch + stateless relay | 10–30% of connections stay relayed | Adopt pattern + capacity planning figure (§11) |
| Privacy Pass / ARC | Anonymous tokens | Rate-limited unlinkable multi-show credentials | No threshold issuance in the draft | Adopt presentation/tag mechanics; add threshold BBS issuance (§7) |
| RSA blind sigs (RFC 9474) | Anonymous tokens | Simple blind issuance | One-show only; threshold is 2025 research | Adopt as SPARK-RSA-1 MVP profile (§7.2) |
| BBS signatures | Anonymous credentials | Selective disclosure, threshold issuance | Range proofs fight daily decay | Adopt tier credentials vs checkpoint; no live range proofs (§5.5) |
| Zcash nullifiers | Double-spend prevention | Nullifier registries | Forever-growing global set | Rejected; epoch-scoped instead (§7.4) |
| Semaphore / RLN | Rate-limiting nullifiers | Epoch-scoped N-per-epoch nullifiers | Deanonymize-on-violation too harsh here | Adopt epoch scoping; reject key-reveal penalty (§7.4) |
| Certificate Transparency | Transparency log | Merkle append-only logs | Gossip layer never deployed in 12 years | Adopt log structure; mandate witnesses instead of gossip (§2.2) |
| IETF Key Transparency | Identity→key logs | Versioned device-key binding | — (production at WhatsApp) | Adopt roles + fork-and-stick + majority threshold (§3, §5.4) |
| Sigstore | Artifact provenance | Signed publication + log witness | Nobody watches unless someone is named the watcher | Adopt named monitor-of-record (§8.6) |
| C2PA | Content provenance | "Provenance, not truth"; tombstone redaction | Metadata stripped by every platform pipeline | Adopt tombstones; avoid embedding (records fetched by hash) (§8.5) |
| Sigsum / witness cosigning | Log integrity | k-of-n cosigned checkpoints, no blockchain | Not yet internet-scale | Adopt; witnesses = bridge-partner tribes (§5.4) |
| Bluesky labelers | Composable moderation | Personalized, no global score — at 43M users | Labels weaponized for brigading (open issue) | Validates §9; brigading stays a named open risk (§16.7) |
| Nostr WoT / Vertex | Subjective reputation | Personalized PageRank from own vantage | Off-protocol reputation re-centralizes at an oracle | Validates first-class citation records (§9.1) |
| Fediverse defederation | Inter-community disputes | Communities rating communities, in the wild | Opaque blocklists, disputer harassment, curator burnout | Adopt mandatory dispute rationale; name retaliation risk; Steward terms (§9.2, §15.3) |
| Retraction Watch / Crossref | Publication retraction | Graduated, additive retraction status | Stigma suppresses honest self-correction | Adopt disputed→retracted ladder + cheaper self-retraction (§8.4) |

---

## 3. Domain narratives

### 3.1 Vouching and sybil resistance

The detect-and-punish family (BrightID, PoH) and the valueless-by-construction family (Circles) are
different defense classes; HEARTH deliberately runs both — a vouch gate at admission, and
reputation-scaled throughput that makes a smuggled-in sybil nearly worthless. Three specific
inheritances:

- **MeritRank** tested three decay types on real data and found time decay — the only one v4 had for
  standing — to be the *weakest* sybil lever, and connectivity decay the strongest. v5 therefore adds
  the voucher-independence rule and a connectivity discount on vouch weight (spec §4.3–4.4,
  simulation S1).
- **Advogato** was broken not by an attack on its code but by a proof that bounded the wrong
  quantity (post-attack instead of pre-attack capacities). v5 pins penalty computation to the
  pre-penalty snapshot at the conviction checkpoint, deterministically replayable (spec §6.4).
- **Cheng–Friedman** proved no symmetric reputation function is sybilproof. v5 states its asymmetry
  explicitly: per-identity admission cost, absolute tier thresholds, and a Spark curve constrained to
  be non-superadditive under identity splitting (spec §4.8, simulation S3).

What no prior system provides: evidence about *graduated multi-hop* voucher liability. PoH's penalty
is a single-hop cliff. HEARTH's hop-decayed curve is novel, and the co-signing/microfinance literature
confirms liability chills vouching for distant relationships — so v5 simulates voucher-chilling
explicitly (S2) instead of assuming it away.

### 3.2 P2P private-group communication

Scuttlebutt died of unbounded replication; Retroshare proved pure friend-to-friend tops out at
hobbyist scale; Briar proved delay-tolerant sync works in the field (Iran, 2026) and that always-on
mobile P2P costs 4× battery; Cwtch validated the exact "relay sees ciphertext and shape only" trust
boundary Stewards use; Matrix, after six years of P2P attempts, scoped down to local mesh — where
HEARTH starts. Two decisive consequences for v5:

- **Nobody runs decentralized MLS in production.** Matrix's own MLS integration reintroduces a
  per-room hub. v5 stops implying otherwise and names a rotating **sequencer Steward** as the
  delivery service, with majority-countersigned epoch advancement (spec §10.2).
- **Tribe-state sync is HEARTH's most unproven infrastructure bet**, and the spec now bounds it: an
  enumerated state set, capability-scoped requests, sideloading as first-class transport, and a MUST
  NOT on full-history replication (spec §10.4, the SSB lesson made normative).

### 3.3 Anonymous credentials and rate limiting

Privacy Pass proved blind tokens survive production scale; ARC adds multi-show rate limiting but no
threshold issuance; BBS brings selective disclosure and a real threshold-issuance construction;
Signal's zkgroup is the production existence proof for anonymous group credentials. v5's Spark design
is a composition — threshold-BBS issuance with ARC-style presentation and RLN-style epoch-scoped
nullifiers — and the spec says plainly that this composition is original protocol work requiring its
own security argument, with a deliberately boring fallback (RFC 9474 one-show tokens) as the MVP
profile. Two corrections landed from this research: tier proofs verify against the threshold-signed
checkpoint rather than range-proving a daily-decaying number, and the old "run over Tor" line was
replaced — Tor does not defeat global passive correlation either; a mixnet-class transport is the
named escalation for asynchronous flows (spec §7.6).

### 3.4 Transparency, publication, retraction

Certificate Transparency proved the Merkle log and also proved that optional gossip never ships —
twelve years, zero deployment. Key Transparency (WhatsApp/Cloudflare in production) contributed the
fork-and-stick rule and the majority-threshold requirement; Sigsum contributed witness cosigning
sized for small operators. HEARTH composes these into one log design used three times (device log,
checkpoint log, Beacon log) with witnesses recruited from bridge-partner tribes — relationships that
already exist and are already overlap-discounted (spec §2.2, §5.4).

For retraction, the decisive prior art is not cryptographic: decades of academic publishing show
that when retraction is catastrophic, people stop retracting. v5 therefore ships a graduated ladder
(active → disputed → retracted/reaffirmed) with self-initiated retraction costing materially less
than forced retraction, plus C2PA-style hash tombstones for lawful redaction inside an append-only
chain (spec §8.4–8.5). HEARTH's Beacon also structurally avoids C2PA's one documented fatal flaw:
records are fetched separately by content address, not embedded in files that platforms recompress.

### 3.5 Federated moderation

Bluesky's labelers are a 43-million-user natural experiment proving personalized composition works —
and proving the dispute signal itself becomes a brigading weapon without staking and quorum (their
open issue). The fediverse adds three failure modes from a decade of practice: opaque blocklists
(~80% undisclosed), harassment of principled disputers (Playvicious), and curator burnout (Seirdy).
v5's responses: disputes carry mandatory public rationale; off-protocol retaliation is a *named
unmitigated risk*, not a claimed solve; Stewards get terms and key resharing (spec §9.2, §15.3).
Nostr's Vertex shows personalized PageRank working from a reader's own vantage — and shows that
reputation left out of the protocol re-centralizes at an oracle, which is why citations and disputes
are first-class signed records in HEARTH.

---

## 4. The gap HEARTH fills

Combine the columns and a specific hole appears: **there is no protocol where a small community's
human-vouched trust graph produces (a) accountable admission, (b) anonymous-but-bounded
distribution, and (c) publicly verifiable, reputation-staked publication — with no company, no
token, and no global score.** Each neighbor solves one face: Signal has the crypto but a company;
Scuttlebutt had the sociality but no accountability; PoH has staked vouching but one global
financialized registry; Bluesky has subjective moderation but open admission and no stakes; Sigstore
has verifiable publication but corporate identity roots. HEARTH is the composition, with every
parameter either simulation-backed or explicitly labeled provisional.

## 5. Sources

Primary sources are cited throughout the four research reports this document distills; the load-bearing
ones: MeritRank (arXiv:2207.09950); Ruderman's Advogato break (squarefree.com, 2005); Cheng & Friedman
(ACM 2005); Kleros PoH documentation and post-mortems; Circles whitepaper and Coop report; SSB
post-mortems and PPPPP; Briar Bramble docs; Cwtch security handbook; MSC4244 and draft-kohbrok-mls-dmls;
iroh/libp2p NAT-traversal measurement studies (arXiv:2604.12484, 2510.27500); RFC 9576–9578,
draft-ietf-privacypass-arc-*; RFC 9474 and eprint 2025/353; draft-irtf-cfrg-bbs-signatures and eprint
2023/602, 2025/824; Chase–Perrin–Zaverucha (eprint 2019/1416); RLN documentation; zcash#1390;
RFC 6962/9162 and CT gossip literature; draft-ietf-keytrans-architecture; WhatsApp/Cloudflare KT
deployments; Sigsum and Syta et al. (arXiv:1503.08768); C2PA v2.4 and the RAND 2025 critique; Bluesky
stackable-moderation posts and bluesky-social/proposals#19; arXiv:2506.05522 (fediverse blocklists);
Crossref/Retraction Watch; Nature Human Behaviour (2025) on retraction careers.
