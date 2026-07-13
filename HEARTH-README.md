# HEARTH — what it is and why it's worth your time

*Tracks spec: **v5** · Last updated to match: v5 · Audience: you've used Signal, WhatsApp, Mastodon, or torrents and want the gist without the cryptography.*

---

## The one-sentence version

**HEARTH is a private group app with a real front door and no company in the middle:** you only get in when people already inside vouch for you, and if you turn out to be a creep or a scammer, the people who vouched for you take the hit too.

Encryption isn't the selling point — Signal and WhatsApp already do that. The selling point is **vetted membership you can trust, run by nobody.**

## How it's different from the apps you already use

Each row below is a *different* thing HEARTH does — not four ways of saying "it's private."

| You know… | What it does | What HEARTH does differently |
|-----------|--------------|------------------------------|
| **WhatsApp / Signal** | Encrypted chat, but a company runs it and anyone with the invite link can walk in | No company in the middle, and no open link — you're let in only when real members vouch for you. |
| **Facebook Groups / Discord** | Communities you join by link, kept in line by volunteer admins constantly fighting spam and fake accounts | The group polices itself: no vouch, no entry, and a bad actor costs the people who vouched them — so moderation isn't one burned-out admin's problem. |
| **Instagram / X** | Anyone can post anything in public; no real way to know who stands behind it | The public "Beacon" lets a tribe publish too — but every post is signed and provably vetted by named people who put their reputation on it. |
| **Reddit** | Karma and mods give a rough sense of who's trusted, but it's one global score and easy to game | Reputation here is earned, can be *lost*, and is shown from *your own* community's point of view — not one global number. |
| **Dropbox / Google Drive** | To share a file you upload it to a company's servers first | Files move directly between you and the people you're connected to — encrypted, nothing parked on a corporate cloud, and if you choose, not traceable back to you. |

## The key ideas (in plain words)

- **You're vouched in, not signed up.** To join a group ("tribe"), at least two existing members have to vouch for you — ideally in person, by scanning a code. That's the cover charge that keeps bots, spammers, and randos out.
- **Vouching has teeth.** If someone you vouched for behaves badly and the group agrees, *your* standing drops too. So people don't vouch carelessly. The group polices itself.
- **Reputation fades.** Standing is based on recent good behavior, not a trophy you earned years ago. (Go quiet for a while and it eases off gently — there's a "I'm away" mode so a vacation doesn't wipe you out.)
- **One you, all your devices.** Your identity lives across your phone and laptop like a passkey/Face-ID login — same person everywhere. Lose a device? Revoke it; your account and reputation survive. A thief can't just walk off with your identity.
- **Private chat + file sharing**, end-to-end encrypted, between people you're connected to.
- **Anonymous sharing inside your tribe.** You can drop a file or post to the group without it being traceable back to you — useful when you want to share something without being the face of it. (Honest limit below.)
- **A public "Beacon" page (optional).** A tribe can publish things to the whole internet — an RFC, a research finding, a guide — where anyone can verify *who* vetted it and that they put their reputation on the line. If it's later proven wrong, the group can retract it and the people who endorsed it take a reputation hit.
- **Tribes rate tribes — from your point of view.** There's no single global "score." A tribe's reputation is shown *as your own tribes see it*. Your book club and your church might rank the same horror-movie tribe very differently, and HEARTH shows you both, instead of pretending there's one right answer.

## Real-world uses

- **A neighborhood or parents' group that's drowning in scammers.** On Facebook or WhatsApp, one leaked link and you're flooded with fake sellers and bots. Here, no vouch means no entry — full stop.
- **A trading or collector community** where a scammer costs real money. Reputation you have to *earn and can lose* is the whole point.
- **Family and close friends who want off Big Tech.** Photos and files shared straight between devices, no corporate server holding them. A new partner joins the circle when two family members vouch in person.
- **A group of engineers publishing standards/RFCs**, or **researchers sharing community-vetted findings** — out in the open on a Beacon page, with verifiable "real, accountable humans checked this" provenance. In a world filling up with AI-generated content, "vetted by people who staked their name" is becoming the scarce, valuable thing.
- **Hobby and fan communities** that want to keep their corner real, and see how the wider network of tribes regards each other.

## What HEARTH is honestly *not*

- **Not a replacement for texting your mom.** The network is smaller and joining takes a real vouch. That friction is the feature, not a bug — it's what keeps the bad actors out. Reach for it when a group is too important or too targeted to leave open to anyone with a link.
- **Not a hiding place from a government.** It keeps your sharing untraceable to ordinary snoops and even to the relays passing it along — but it does **not** claim to beat a nation-state watching all internet traffic. (If that's your threat, run it over Tor.) It is **not** built or marketed for journalists, activists, or whistleblowers.
- **Not a truth machine.** HEARTH proves *who* said something and *who vouched for it* — never that it's *correct*. A tribe of cranks can publish nonsense; it just wears its reputation in public. You decide what to trust, with the receipts in front of you.

---
## Technical Specifications
[[HEARTH-protocol-spec-v5]]

Changelog:

- **v5** — the hardening pass: the spec became a real engineering document (precise rules, defined data structures, per-role requirements) instead of a narrative. New protections: two vouchers for the same newcomer now have to be genuinely independent people (with a fallback so close friends aren't locked out); a "you complained about me so I'm complaining about you" counter-complaint counts for less; tiny tribes need a bigger share of members to convict someone (harder to frame people in small groups); retracting your own mistake on the Beacon costs much less than getting caught; and every mechanism was stress-tested in simulation — two proposed rules failed their tests and were redesigned, which is written up rather than hidden.
- **v4** — added the Beacon (public verifiable publishing) and the Federation (tribes rating tribes from your own vantage). First README.
