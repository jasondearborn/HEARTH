"""
HEARTH v3 reputation-dynamics adversarial simulation.

Models a tribe with:
  - decay-weighted reputation (Embers), half-life H
  - admission requiring >=2 vouchers who are themselves Member+ tier
  - quorum bad-actor conviction: weighted complaints, per-complainant cap, M_min distinct
  - transitive decaying penalty up the vouch chain (direct = P_dir, hop h = P_dir * g^(h-1))

Three adversaries, run as separate scenarios, metrics aggregated over Monte-Carlo seeds:
  1. Infiltrator who defects  -> damage before conviction, deterrence (voucher rep loss)
  2. Sybil farm               -> identities reaching Member tier given limited duped vouchers
  3. Tribe-capture            -> P(wrongful conviction) of an honest target vs legit conviction

Outputs recommended-parameter sweeps to stdout and results.json.
"""
import random, math, json, statistics as st
from collections import deque

# ---------- shared reputation engine ----------

def lam(H):                      # daily decay multiplier for half-life H days
    return 0.5 ** (1.0 / H)

def equilibrium_inflow(H, target=1.0):
    # daily ember inflow that drives an always-active honest member to ~target rep
    return (1 - lam(H)) * target

TIER = [("Stranger",0.0),("Member",0.10),("Trusted",0.40),("Steward",0.75)]
def tier(r):
    t = "Stranger"
    for name,thr in TIER:
        if r >= thr: t = name
    return t

# ---------- scenario 1: infiltrator who defects ----------
# Honest tribe of N. Infiltrator behaves for D_behave days (gains rep, gets vouched by
# 2 random Member+ honests), then defects: abuses every day. Each abuse day, each of k
# interacting honest members observes w/ p_obs and (cumulatively) reports w/ p_report.
# Conviction when weighted-complaint sum >= T and distinct >= M_min. Then penalty propagates.

def run_infiltrator(H, P_dir, g, q, M_min, cap, p_report=0.35, new_per_day=2.0,
                    active_frac=0.8, D_behave=120, seed=0):
    rng = random.Random(seed)
    N = 100
    inflow = equilibrium_inflow(H)
    L = lam(H)
    # honest members at steady-state-ish rep with spread
    rep = {i: max(0.05, rng.gauss(0.85, 0.18)) for i in range(N)}
    # build a shallow vouch forest among honest (each non-anchor has 2 parents)
    parents = {i: [] for i in range(N)}
    anchors = list(range(8))
    for i in range(8, N):
        cand = [j for j in range(i) if rep[j] >= 0.10]
        parents[i] = rng.sample(cand, 2)
    # infiltrator joins, vouched by 2 random trusted members
    inf = N
    rep[inf] = 0.0
    voucher_pool = [j for j in range(N) if rep[j] >= 0.10]
    inf_vouchers = rng.sample(voucher_pool, 2)
    parents[inf] = inf_vouchers
    rep_before = {v: rep[v] for v in inf_vouchers}

    # behave phase: infiltrator accrues rep like an active honest member
    for d in range(D_behave):
        for i in list(rep): rep[i] = rep[i]*L + inflow*(0.6+0.4*rng.random())
        rep[inf] = rep[inf]*L + inflow   # active
    inf_rep_at_defect = rep[inf]

    # defect phase: sparse, cumulative reporting; quorum = fraction of active tribe
    A = int(round(active_frac*N))
    quorum = max(M_min, math.ceil(q*A))
    complainants = set()
    pool = list(range(N)); rng.shuffle(pool)
    damage = 0; convicted_day = None
    for d in range(400):
        for i in range(N): rep[i] = rep[i]*L + inflow*(0.6+0.4*rng.random())
        rep[inf] = rep[inf]*L              # infiltrator decays during abuse
        damage += 1
        # a few new honest members encounter the abuse today; each reports w/ prob p_report
        n_new = 0
        while pool and (rng.random() < new_per_day - n_new or n_new==0):
            cand = pool.pop()
            if rng.random() < p_report: complainants.add(cand)
            n_new += 1
            if n_new >= 6: break
        if len(complainants) >= quorum:
            convicted_day = d; break

    # apply transitive penalty
    loss = {}
    if convicted_day is not None:
        rep[inf] = 0.0
        # BFS up the vouch chain
        seen = set([inf]); frontier = deque([(inf,0)])
        while frontier:
            node,hop = frontier.popleft()
            for p in parents.get(node,[]):
                if p in seen: continue
                seen.add(p)
                pen = P_dir * (g**hop)        # hop=0 -> direct voucher
                if pen < 0.01: continue
                loss[p] = loss.get(p,0) + rep[p]*pen
                rep[p] *= (1-pen)
                frontier.append((p,hop+1))
    direct_loss = st.mean([loss.get(v,0) for v in inf_vouchers]) if inf_vouchers else 0
    total_loss = sum(loss.values())
    return dict(damage=damage if convicted_day is not None else 999,
                convicted=convicted_day is not None,
                latency=(convicted_day if convicted_day is not None else 999),
                inf_rep_at_defect=inf_rep_at_defect,
                direct_voucher_loss=direct_loss,
                total_chain_loss=total_loss,
                chain_depth=len(loss))

# ---------- scenario 2: sybil farm ----------
# Attacker controls c duped/colluding honest Member+ accounts as vouchers, and wants to
# admit S sybils. Each sybil needs >=2 distinct Member+ vouchers. A duped voucher can
# vouch a limited number/epoch (issuance budget B). Once sybils defect they convict and
# the transitive penalty hits the dupes, who then stop. Measure sybils that reach Member.

def run_sybil(H, P_dir, g, B_budget, seed=0, duped=2, member_thr=0.10):
    rng = random.Random(seed)
    inflow = equilibrium_inflow(H); L = lam(H)
    # duped vouchers have decent rep
    dupe_rep = [max(0.2, rng.gauss(0.7,0.15)) for _ in range(duped)]
    # each sybil needs 2 distinct Member+ vouchers; only `duped` available
    if duped < 2:
        return dict(sybils_member=0, rounds=0)
    # vouches available before budget exhausted (each dupe can issue B_budget meaningful vouches)
    pairs_possible = (duped * B_budget) // 2   # each sybil consumes 2 voucher-slots
    admitted = pairs_possible
    # sybils start at rep 0; to reach Member they must accrue inflow like honest -> but they
    # are uncooperative, so they only gain if they mimic honest interactions for a while.
    # Model: a sybil reaches Member only if it behaves ~D days; but goal is spam, so assume
    # it tries minimal behave window W_b then defects. Reaching Member requires inflow*...
    days_to_member = math.log(member_thr* (1-L)/inflow + 0) if False else None
    # rep trajectory from 0 with active inflow: r_{t}= inflow*(1-L^t)/(1-L). Solve r>=thr:
    ratio = 1 - member_thr*(1-L)/inflow
    days_to_member = math.ceil(math.log(max(ratio,1e-9))/math.log(L)) if ratio>0 else 1
    # each behaving sybil costs the attacker time and risks early detection; we just report
    return dict(sybils_admitted=admitted,
                days_each_sybil_must_behave_to_reach_Member=days_to_member,
                voucher_slots=duped*B_budget)

# ---------- decay cost to INTERMITTENT honest users (the real cost of short H) ----------
def idle_retention(H, gap_days):
    # fraction of reputation retained after `gap_days` of inactivity
    return lam(H) ** gap_days

# ---------- scenario 3: tribe-capture wrongful conviction (FRACTION quorum) ----------
# Quorum = distinct complainants >= max(M_min, ceil(q * active_tribe)). Capture attacker
# controls fraction f of the tribe; honest target is innocent so only attackers complain.
# Wrongful iff f*N (capped by their rep meeting Member+) reaches the fraction quorum.
def run_capture(N, f, q, M_min, active_frac=0.8, seed=0):
    rng = random.Random(seed)
    A = int(round(active_frac*N))
    quorum = max(M_min, math.ceil(q*A))
    n_att = int(round(f*N))
    # only Member+ attackers can file weighted complaints; assume ~90% qualify
    n_att_eff = sum(1 for _ in range(n_att) if rng.random() < 0.9)
    wrongful = n_att_eff >= quorum
    return dict(wrongful=wrongful, n_att=n_att_eff, quorum=quorum)

# ---------- sweeps ----------
def mc(fn, seeds=200, **kw):
    return [fn(seed=s, **kw) for s in range(seeds)]

def agg(rows, key):
    vals=[r[key] for r in rows]
    return vals

results = {}

# --- Sweep A: decay half-life H -> cost to intermittent honest users (idle gaps)
print("="*70); print("SWEEP A: decay half-life H  (reputation retained after idle gap)")
results["decayH"]=[]
for H in [30,60,90,180]:
    rec=dict(H=H,
             retain_2wk=round(idle_retention(H,14),3),
             retain_1mo=round(idle_retention(H,30),3),
             retain_3mo=round(idle_retention(H,90),3))
    results["decayH"].append(rec); print(rec)

# --- Sweep B: penalty (P_dir, g) -> deterrence vs collateral spread (infiltrator)
print("="*70); print("SWEEP B: penalty gradient (P_dir, g)")
results["penalty"]=[]
for P_dir in [0.15,0.25,0.40]:
    for g in [0.0,0.2,0.35,0.5,0.7]:
        rows = mc(run_infiltrator, seeds=150, H=90, P_dir=P_dir, g=g, q=0.25, M_min=3, cap=0.10)
        convd=[r for r in rows if r["convicted"]]
        rec=dict(P_dir=P_dir, g=g,
                 direct_voucher_loss=round(st.mean(agg(convd,"direct_voucher_loss")),3) if convd else None,
                 total_chain_loss=round(st.mean(agg(convd,"total_chain_loss")),3) if convd else None,
                 mean_chain_depth=round(st.mean(agg(convd,"chain_depth")),2) if convd else None)
        results["penalty"].append(rec); print(rec)

# --- Sweep C1: fraction quorum q -> legit conviction latency / damage (infiltrator)
print("="*70); print("SWEEP C1: conviction latency vs fraction quorum q")
results["quorum_latency"]=[]
for q in [0.05,0.10,0.20,0.25,0.30,0.40]:
    rows=mc(run_infiltrator, seeds=200, H=90, P_dir=0.25, g=0.35, q=q, M_min=3, cap=0.10)
    convd=[r for r in rows if r["convicted"]]
    rec=dict(q=q, conviction_rate=round(len(convd)/len(rows),3),
             median_latency_days=int(st.median(agg(convd,"latency"))) if convd else None,
             p90_damage_days=int(sorted(agg(convd,"damage"))[int(0.9*len(convd))]) if convd else None)
    results["quorum_latency"].append(rec); print(rec)

# --- Sweep C2: wrongful conviction vs capture fraction f, for each quorum q
print("="*70); print("SWEEP C2: wrongful conviction vs capture fraction f")
results["capture"]=[]
for q in [0.10,0.20,0.25,0.30]:
    for f in [0.05,0.10,0.15,0.20,0.25,0.30,0.40]:
        rows=mc(run_capture, seeds=400, N=100, f=f, q=q, M_min=3)
        wr=sum(r["wrongful"] for r in rows)/len(rows)
        rec=dict(q=q,f=f,wrongful_rate=round(wr,3),quorum=rows[0]["quorum"])
        results["capture"].append(rec); print(rec)

# --- Sweep D: sybil farm
print("="*70); print("SWEEP D: sybil farm admission")
results["sybil"]=[]
for B in [1,2,3]:
    r=run_sybil(H=90, P_dir=0.25, g=0.35, B_budget=B, seed=0, duped=2)
    results["sybil"].append(dict(issuance_budget=B, **r))
    print(results["sybil"][-1])

with open("results.json","w") as fh:
    json.dump(results, fh, indent=2)
print("\nsaved results.json")
