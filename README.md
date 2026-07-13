# HEARTH

*A protocol for communities with a real front door — and a spec that shows its work.*

## The story

Every open network eventually meets the same flood. Spam, bots, fake sellers, rented accounts,
and now machine-generated everything. The platforms' answer has been moderation at industrial
scale — one company, one policy, one global judgment call. The decentralized world's answer has
mostly been "no gatekeepers at all," which trades the corporate moderator for an open door that
anyone, and anything, can walk through.

HEARTH starts from a different premise: **the strongest trust signal humans have ever used is
another human willing to stake their own name on you.** You don't join a HEARTH community
("tribe") with an invite link. You join when two members who already belong vouch for you —
ideally in person — and if you turn out to be a bad actor, *they* lose standing too. Reputation
is earned, decays if you disappear, and can be lost. A tribe can publish to the world through a
"Beacon" whose every artifact carries the names and staked reputations of the people who vetted
it. And tribes rate each other — not on one global scoreboard, but from each reader's own vantage,
because HEARTH refuses to be an arbiter of truth. It proves *who* stands behind something, never
that it's *correct*.

No company in the middle. No token. No global scale — deliberately. Dunbar-sized communities,
bridged and federated, that police themselves.

## The method

This repository is a spec-writing exercise with an unusual discipline: **every design claim either
carries evidence or is labeled as unproven.** The spec has been through five versions, and the
history is preserved because the history *is* the argument:

- **v1** proposed the idea; a brutal internal critique ([HEARTH-v1-critique.md](HEARTH-v1-critique.md))
  found twelve structural weaknesses, from an unsolved "who computes reputation" problem to a trust
  graph that quietly deanonymized its members.
- **v2–v3** rebuilt identity around multi-device keys, added Spark tokens (anonymous but
  rate-limited sharing), and replaced hand-set constants with parameters calibrated by adversarial
  Monte-Carlo simulation ([hearth_v3_sim.py](hearth_v3_sim.py)).
- **v4** added the Beacon and the Federation, pressure-tested by a second simulation
  ([hearth_federation_sim.py](hearth_federation_sim.py)) that found and fixed a real flaw in its
  own scoring formula before shipping it.
- **v5** — the current spec — is the hardening pass: a full normative rewrite
  ([HEARTH-protocol-spec-v5.md](HEARTH-protocol-spec-v5.md)) informed by a systematic survey of
  thirty-plus overlapping systems ([HEARTH-prior-art.md](HEARTH-prior-art.md)), from Scuttlebutt's
  collapse to Bluesky's labelers to the IETF's freshest anonymous-credential drafts. Seven new
  simulations ([hearth_v5_sim.py](hearth_v5_sim.py)) were run against v5's own proposed mechanisms —
  and two of them **falsified the draft design**: a voucher-independence rule that would have
  blocked half of all honest admissions, and a federation threshold that silenced every honest
  single-source opinion. Both were redesigned on the evidence, and the failed variants are
  documented in the spec's appendices rather than quietly deleted.

That is the standard the project tries to hold: *technically defensible* doesn't mean "sounds
rigorous," it means falsifiable claims, adversarial testing, named limitations, and prior art
metabolized rather than ignored. The spec's threat model has thirty-five rows, and five of them
say "accepted risk" out loud.

## Reading guide

| If you want… | Read |
|---|---|
| The plain-language pitch (no cryptography) | [HEARTH-README.md](HEARTH-README.md) |
| The full normative spec (v5, current) | [HEARTH-protocol-spec-v5.md](HEARTH-protocol-spec-v5.md) |
| Why not just use Signal / Bluesky / BrightID / Sigstore…? | [HEARTH-prior-art.md](HEARTH-prior-art.md) |
| The simulations behind the numbers | [hearth_v5_sim.py](hearth_v5_sim.py), [hearth_v3_sim.py](hearth_v3_sim.py), [hearth_federation_sim.py](hearth_federation_sim.py) + results JSONs |
| How the design evolved (and what it got wrong) | [HEARTH-v1-critique.md](HEARTH-v1-critique.md), then spec v1 → v4 |

## Status

This is a specification project — there is no implementation yet. The spec is written to be
implementable (record definitions, state machines, conformance checklists, a pinned cryptographic
profile), and its open questions are listed with explicit resolution paths rather than left
implicit. Contributions, critiques, and attacks on the design are welcome; the project's whole
premise is that a spec that hasn't survived hostile review isn't done.
