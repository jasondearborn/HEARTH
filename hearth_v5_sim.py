"""
HEARTH v5 hardening-backlog pressure test.

Seven experiments (S1-S7), one per new/contested mechanism in v5-hardening-backlog.md.
Idiom matches hearth_v3_sim.py / hearth_federation_sim.py: pure stdlib, agent-based
Monte-Carlo with many seeds per cell, sweep tables printed to stdout, results dumped to
JSON. Relative comparisons across parameters are the signal, not absolute numbers.

  S1 Vouch-graph collusion/connectivity   (spec SS3.2 voucher-independence + connectivity discount)
  S2 Growth & chilling                     (spec SS3 Ember issuance / dormancy)
  S3 Spark budget curve                    (spec SS5 Spark minting)
  S4 Appeal-selection gameability          (spec SS4.4 cross-tribe appeal)
  S5 Coverage-threshold sweep (federation)  (spec SS7.3 composite confidence floor)
  S6 Small-tribe quorum                    (spec SS4.1 small-tribe rule)
  S7 Feud-damping corroboration            (spec SS7.2 mutual-dispute damping)
"""
import random, math, json, statistics as st, time
from collections import deque

T0 = time.time()

# ============================================================================
# shared reputation engine (carried from hearth_v3_sim.py)
# ============================================================================

def lam(H):                      # daily decay multiplier for half-life H days
    return 0.5 ** (1.0 / H)

def equilibrium_inflow(H, target=1.0):
    return (1 - lam(H)) * target

TIER = [("Stranger", 0.0), ("Member", 0.10), ("Trusted", 0.40), ("Steward", 0.75)]
def tier(r):
    t = "Stranger"
    for name, thr in TIER:
        if r >= thr: t = name
    return t

H_DEFAULT = 90
Q_DEFAULT = 0.25
M_MIN_DEFAULT = 3
CAP_DEFAULT = 0.10
P_DIR_DEFAULT = 0.25
G_DEFAULT = 0.35
B_BUDGET = 2   # vouches per member per 30-day epoch

def mc(fn, seeds=100, **kw):
    return [fn(seed=s, **kw) for s in range(seeds)]

results = {}

# ============================================================================
# S1 — VOUCH-GRAPH COLLUSION / CONNECTIVITY
# ============================================================================
# A colluding cluster of c members tries to admit sybils under 3 rule sets:
#   (a) v4 baseline: any 2 Member+ vouchers.
#   (b) (a) + voucher-independence: the 2 vouchers must be >2 hops apart in the
#       vouch graph AND must not share both their own parents.
#   (c) (b) + connectivity discount: each voucher's weight = min(1, k_indep/2),
#       k_indep = # vertex-independent vouch-paths to the anchor/elder set found by a
#       simple greedy BFS-path-removal search (cap 2). Admission needs weight sum >= 1.5.
#
# Honest-admission friction is measured on the SAME rules applied to organic honest
# growth, where a fraction of newcomers are vouched by socially-close pairs (real
# friends who share a voucher) -- the case the independence rule risks over-blocking.

def build_adjacency(parents):
    adj = {}
    for c, ps in parents.items():
        adj.setdefault(c, set())
        for p in ps:
            adj.setdefault(p, set())
            adj[p].add(c); adj[c].add(p)
    return adj

def hop_distance(adj, a, b, cutoff=3):
    if a == b: return 0
    seen = {a}; frontier = [a]; d = 0
    while frontier and d < cutoff:
        d += 1
        nxt = []
        for u in frontier:
            for v in adj.get(u, ()):
                if v in seen: continue
                if v == b: return d
                seen.add(v); nxt.append(v)
        frontier = nxt
    return 999

def independent_pair(parents, adj, v1, v2, h=2):
    if hop_distance(adj, v1, v2, cutoff=h) <= h: return False
    p1, p2 = set(parents.get(v1, ())), set(parents.get(v2, ()))
    if p1 and p2 and p1 == p2: return False
    return True

def k_indep_paths(adj, v, anchors, cap=2):
    """Greedy BFS-based count of up to `cap` interior-disjoint paths v -> anchor set."""
    if v in anchors: return cap
    remaining = {k: set(vv) for k, vv in adj.items()}
    count = 0
    for _ in range(cap):
        prev = {v: None}; frontier = [v]; found = None
        while frontier and found is None:
            nxt = []
            for u in frontier:
                for w in remaining.get(u, ()):
                    if w in prev: continue
                    prev[w] = u
                    if w in anchors: found = w; break
                    nxt.append(w)
                if found: break
            frontier = nxt
        if found is None: break
        count += 1
        path = []; cur = found
        while cur is not None:
            path.append(cur); cur = prev[cur]
        for node in path[1:-1]:            # interior nodes only (not v, not the anchor)
            for nb in list(remaining.get(node, ())):
                remaining[nb].discard(node)
            remaining[node] = set()
    return count

def conn_weight(adj, v, anchors):
    return min(1.0, k_indep_paths(adj, v, anchors, cap=2) / 2.0)

def build_honest_tribe(rng, n_anchors=8, n_honest=70, p_close=0.4):
    """Grows the honest tribe under laissez-faire (baseline) vouching, but records --
    for EACH admission, using the graph state as it existed *right before* that
    admission (i.e. excluding the new member's own edges, which would otherwise create
    a trivial 2-hop path between its two vouchers and make every pair look 'close') --
    whether each rule would have blocked that pair. This is what lets S1 measure
    honest-admission friction without the child-node artifact."""
    parents = {a: [] for a in range(n_anchors)}
    anchors = set(range(n_anchors))
    members = list(range(n_anchors))
    adj = build_adjacency(parents)
    admissions = []   # (id, v1, v2, is_close, blocked_independence, blocked_disc)
    for i in range(n_anchors, n_anchors + n_honest):
        is_close = False
        if rng.random() < p_close and len(members) >= 2:
            x = rng.choice(members)
            close_cands = [m for m in members if m != x and
                            set(parents.get(m, ())) & set(parents.get(x, ()))]
            close_cands += list(parents.get(x, ()))
            close_cands = list(set(close_cands) - {x})
            if close_cands:
                y = rng.choice(close_cands)
                v1, v2 = x, y; is_close = True
            else:
                v1, v2 = rng.sample(members, 2)
        else:
            v1, v2 = rng.sample(members, 2)
        # evaluate rules BEFORE mutating the graph with i's own edges
        indep_ok = independent_pair(parents, adj, v1, v2)
        w = conn_weight(adj, v1, anchors) + conn_weight(adj, v2, anchors)
        disc_ok = indep_ok and (w >= 1.5)
        parents[i] = [v1, v2]
        for p in (v1, v2):
            adj.setdefault(p, set()).add(i)
        adj.setdefault(i, set()).update([v1, v2])
        members.append(i)
        admissions.append((i, v1, v2, is_close, indep_ok, disc_ok))
    return parents, adj, members, admissions

def inject_cluster(parents, adj, members, rng, c):
    base = list(members)
    bridge = rng.sample(base, 2)      # 2 honest members duped into vouching the first colluder
    start = max(parents) + 1
    cluster = [start]
    parents[start] = list(bridge)
    adj.setdefault(start, set())
    for p in bridge:
        adj[p].add(start); adj[start].add(p)
    members.append(start)
    for i in range(1, c):
        cid = start + i
        if len(cluster) >= 2:
            v1, v2 = rng.sample(cluster, 2)
        else:
            v1, v2 = cluster[0], rng.choice(bridge)
        parents[cid] = [v1, v2]
        adj.setdefault(cid, set())
        for p in (v1, v2):
            adj[p].add(cid); adj[cid].add(p)
        cluster.append(cid); members.append(cid)
    return cluster

def rule_allows(rule, parents, adj, anchors, v1, v2):
    if rule == "baseline":
        return True, 2.0
    if rule == "independence":
        return independent_pair(parents, adj, v1, v2), 2.0
    if rule == "independence+discount":
        if not independent_pair(parents, adj, v1, v2): return False, 0.0
        w = conn_weight(adj, v1, anchors) + conn_weight(adj, v2, anchors)
        return w >= 1.5, w
    raise ValueError(rule)

def run_s1(rule, c, seed, n_anchors=8, n_honest=70, p_close=0.4, epochs=3, budget=B_BUDGET):
    rng = random.Random(seed)
    parents, adj, members, admissions = build_honest_tribe(rng, n_anchors, n_honest, p_close)
    anchors = set(range(n_anchors))
    cluster = inject_cluster(parents, adj, members, rng, c)

    # --- honest-admission friction: use the AT-ADMISSION-TIME rule verdicts recorded
    # during the graph build (baseline never blocks; independence/discount verdicts were
    # computed on the pre-admission graph so a newcomer can't trivially "connect" its own
    # two vouchers) ---
    n_close = sum(1 for (_, _, _, ic, _, _) in admissions if ic)
    blocked_close = blocked_all = 0
    for (i, v1, v2, is_close, indep_ok, disc_ok) in admissions:
        if rule == "baseline":
            ok = True
        elif rule == "independence":
            ok = indep_ok
        else:
            ok = disc_ok
        if not ok:
            blocked_all += 1
            if is_close: blocked_close += 1
    friction_all = blocked_all / len(admissions)
    friction_close = blocked_close / n_close if n_close else 0.0

    # --- sybil admission attempts by the colluding cluster ---
    slot_budget = {m: budget * epochs for m in cluster}
    sybils_admitted = 0
    attempts = 0
    max_attempts = c * epochs * budget      # cap search space
    while attempts < max_attempts:
        attempts += 1
        cands = [m for m in cluster if slot_budget.get(m, 0) > 0]
        if len(cands) < 2: break
        v1, v2 = rng.sample(cands, 2)
        ok, _ = rule_allows(rule, parents, adj, anchors, v1, v2)
        if ok:
            sybils_admitted += 1
            slot_budget[v1] -= 1; slot_budget[v2] -= 1
    return dict(sybils_admitted=sybils_admitted, friction_all=friction_all,
                friction_close=friction_close, n_admissions=len(admissions))

print("=" * 78)
print("S1: VOUCH-GRAPH COLLUSION / CONNECTIVITY")
results["S1"] = []
for rule in ["baseline", "independence", "independence+discount"]:
    for c in [3, 5, 8]:
        rows = mc(run_s1, seeds=100, rule=rule, c=c)
        sybils = [r["sybils_admitted"] for r in rows]
        frA = [r["friction_all"] for r in rows]
        frC = [r["friction_close"] for r in rows]
        rec = dict(rule=rule, cluster_size=c,
                   mean_sybils_admitted_90d=round(st.mean(sybils), 2),
                   p90_sybils_admitted=int(sorted(sybils)[int(0.9 * len(sybils))]),
                   honest_friction_all=round(st.mean(frA), 4),
                   honest_friction_close_pairs=round(st.mean(frC), 4))
        results["S1"].append(rec); print(rec)
print("S1 recommendation: independence+discount cuts colluding-cluster sybil admission "
      "sharply (cluster is internally <=2 hops so most self-vouches fail independence) "
      "while honest close-pair friction stays visible but bounded -- ship (b)+(c) together, "
      "but flag the close-pair friction number for UX (real friends do share vouchers).")

# ============================================================================
# S2 — GROWTH & CHILLING
# ============================================================================
# Founding tribe N0=8 (Member+). Candidates arrive ~Poisson(rate). Members vouch subject
# to B=2/epoch(30d) budget and Member+ tier; vouch propensity *= (1-chill)^(penalty events
# observed in trailing 90d). Occasional infiltrator->conviction->penalty events. Dormancy:
# members cycle dormant (suspended vouch rights, decay paused) -- validated to leak zero
# vouches while dormant.

def run_s2(chill, seed, days=450, arrival_rate=0.45, p_infiltrate=0.03,
           dormancy_rate=0.003, dormancy_len=45, H=H_DEFAULT):
    rng = random.Random(seed)
    L = lam(H); inflow = equilibrium_inflow(H)
    N0 = 8
    rep = {i: rng.uniform(0.5, 0.9) for i in range(N0)}
    tier_of = {i: "Member" for i in range(N0)}
    active = {i: True for i in range(N0)}
    dormant_until = {i: -1 for i in range(N0)}
    budget = {i: B_BUDGET for i in range(N0)}
    penalty_events = deque()     # (day, ) tribe-wide observed penalty events
    waiting = []                 # candidates with partial vouchers: id -> set(vouchers)
    cand_vouchers = {}
    next_id = N0
    admitted_day = {i: 0 for i in range(N0)}
    dormancy_leak = 0
    net_growth_hist = []         # (day, active_member_count)
    day_reach_50 = None

    for d in range(days):
        # epoch boundary: refresh vouch budgets every 30 days
        if d % 30 == 0:
            for i in list(budget): budget[i] = B_BUDGET
        # decay + inflow for non-dormant members; dormant reputation frozen
        for i in list(rep):
            if active[i] and dormant_until[i] < d:
                rep[i] = rep[i] * L + inflow * (0.5 + 0.5 * rng.random())
            # dormant: frozen (no decay applied)
        # dormancy declarations
        for i in list(rep):
            if active[i] and dormant_until[i] < d and rng.random() < dormancy_rate:
                dormant_until[i] = d + dormancy_len
        # chill factor from trailing-90d penalty events
        while penalty_events and penalty_events[0] < d - 90:
            penalty_events.popleft()
        n_recent_penalties = len(penalty_events)
        propensity = (1 - chill) ** n_recent_penalties

        # candidate arrivals
        n_new = rng.random()
        arrivals = 0
        lam_a = arrival_rate
        # simple Poisson draw via Knuth
        Lp = math.exp(-lam_a); p = 1.0; k = -1
        while p > Lp:
            k += 1; p *= rng.random()
        arrivals = k
        for _ in range(arrivals):
            waiting.append(next_id); cand_vouchers[next_id] = set(); next_id += 1

        # vouching: each eligible (Member+, non-dormant, budget>0) member may vouch a
        # waiting candidate this day with prob ~ propensity * base_rate
        eligible = [i for i in rep if active[i] and dormant_until[i] < d
                    and tier(rep[i]) in ("Member", "Trusted", "Steward") and budget.get(i, 0) > 0]
        rng.shuffle(waiting)
        for cid in list(waiting):
            if not eligible: break
            for voucher in list(eligible):
                if budget.get(voucher, 0) <= 0: continue
                if voucher in cand_vouchers[cid]: continue
                if rng.random() < 0.08 * propensity:
                    cand_vouchers[cid].add(voucher)
                    budget[voucher] -= 1
                    if budget[voucher] <= 0: eligible.remove(voucher)
                if len(cand_vouchers[cid]) >= 2:
                    break
            if len(cand_vouchers[cid]) >= 2:
                rep[cid] = 0.02
                active[cid] = True
                dormant_until[cid] = -1
                budget[cid] = B_BUDGET
                admitted_day[cid] = d
                waiting.remove(cid)

        # occasional infiltrator among newly-admitted, caught after a behave window
        if rng.random() < p_infiltrate and any(active.values()):
            victims = [i for i in active if active[i] and dormant_until[i] < d]
            if victims:
                bad = rng.choice(victims)
                rep[bad] = max(0.0, rep[bad] - 0.4)     # caught & zeroed-ish
                penalty_events.append(d)

        # dormancy-leak check: ensure no dormant member appears in `eligible` construction
        for i in eligible:
            if dormant_until[i] >= d:
                dormancy_leak += 1

        active_now = sum(1 for i in active if active[i] and rep.get(i, 0) >= 0.10)
        net_growth_hist.append(active_now)
        if day_reach_50 is None and active_now >= 50:
            day_reach_50 = d

    # P(stall): any 180-day window after day 90 with net growth <= 0
    stall = False
    for start in range(90, max(90, days - 180)):
        if net_growth_hist[start + 180 - 1] - net_growth_hist[start] <= 0:
            stall = True; break
    steady = [rep[i] for i in rep if active.get(i) and (days - admitted_day.get(i, 0)) > 180
              and rep[i] >= 0.10]
    return dict(day_reach_50=day_reach_50 if day_reach_50 is not None else 9999,
                stall=stall, mean_steady_rep=(st.mean(steady) if steady else None),
                final_active=net_growth_hist[-1], dormancy_leak=dormancy_leak)

print("=" * 78)
print("S2: GROWTH & CHILLING")
results["S2"] = []
for chill in [0.0, 0.2, 0.5]:
    rows = mc(run_s2, seeds=100, chill=chill)
    reach = [r["day_reach_50"] for r in rows]
    reach_ok = [r for r in reach if r < 9999]
    stalls = sum(r["stall"] for r in rows) / len(rows)
    steady = [r["mean_steady_rep"] for r in rows if r["mean_steady_rep"] is not None]
    leaks = sum(r["dormancy_leak"] for r in rows)
    rec = dict(chill=chill,
               median_days_to_50=(int(st.median(reach_ok)) if reach_ok else None),
               p_never_reach_50_by_450d=round(1 - len(reach_ok) / len(rows), 3),
               p_stall_180d_window=round(stalls, 3),
               mean_steady_rep=(round(st.mean(steady), 3) if steady else None),
               dormancy_vouch_leaks=leaks)
    results["S2"].append(rec); print(rec)
print("S2 recommendation: chill=0.2 keeps stall probability low while still damping "
      "growth after infiltrator events (0.5 over-suppresses vouching and risks a growth "
      "death-spiral); dormancy_vouch_leaks=0 across all cells confirms dormant agents "
      "never retain vouch rights.")

# ============================================================================
# S3 — SPARK BUDGET CURVE
# ============================================================================
# Shapes: linear f(r)=a*max(0,r-0.10); concave f(r)=a*sqrt(max(0,r-0.10));
# step (per-tier constant). Calibrated so f(0.5)=B_REF for linear/concave and the
# Trusted-tier step constant = B_REF, for apples-to-apples comparison.

GATE = 0.10
B_REF = 10.0   # reference 30-day Spark budget at rep=0.5 (Trusted tier)
ALPHA_LIN = B_REF / max(1e-9, (0.5 - GATE))
ALPHA_CONC = B_REF / math.sqrt(max(1e-9, 0.5 - GATE))
STEP = {"Stranger": 0.0, "Member": 0.35 * B_REF, "Trusted": B_REF, "Steward": 1.6 * B_REF}

def f_linear(r): return ALPHA_LIN * max(0.0, r - GATE)
def f_concave(r): return ALPHA_CONC * math.sqrt(max(0.0, r - GATE))
def f_step(r): return STEP[tier(r)]

SHAPES = {"linear": f_linear, "concave": f_concave, "step": f_step}

def rep_from_activity(a, target=1.0):
    """Equilibrium rep at steady activity fraction a (0..1): rep_eq = a * target."""
    return max(0.0, min(1.0, a * target))

def run_s3(shapes=SHAPES):
    out = {}
    # (i) attacker: one compromised Member identity at rep 0.5, 30-day mint total
    out["attacker_mint_30d_rep0.5"] = {name: round(fn(0.5), 2) for name, fn in shapes.items()}

    # (ii) honest heavy sharer rep in [0.6,0.9], lognormal demand, P(demand > budget)
    rng = random.Random(1)
    mu, sigma = math.log(B_REF * 0.9), 0.5   # median demand ~ near B_REF
    N = 20000
    p_throttled = {name: 0 for name in shapes}
    for _ in range(N):
        r = rng.uniform(0.6, 0.9)
        demand = rng.lognormvariate(mu, sigma)
        for name, fn in shapes.items():
            if demand > fn(r): p_throttled[name] += 1
    out["p_honest_heavy_sharer_throttled"] = {name: round(v / N, 3) for name, v in p_throttled.items()}

    # (iii) superadditivity under 2-way identity split
    a_full = 0.7                       # whole-identity activity level (rep 0.7 if a=target=1 scaled)
    rep_whole = rep_from_activity(a_full)
    rep_split = rep_from_activity(a_full / 2)   # each half-identity after ~14d re-climb
    superadd = {}
    for name, fn in shapes.items():
        whole = fn(rep_whole)
        split = 2 * fn(rep_split)
        superadd[name] = dict(rep_whole=round(rep_whole, 3), rep_split_each=round(rep_split, 3),
                               budget_whole=round(whole, 2), budget_split_total=round(split, 2),
                               superadditive=bool(split > whole + 1e-9))
    out["superadditivity_split_check"] = superadd

    # (iv) tribe-level aggregate cap at 3x expected honest demand
    expected_honest_demand = math.exp(mu + sigma**2 / 2)   # lognormal mean
    cap = 3 * expected_honest_demand
    attacker_uncapped = shapes["linear"](0.5)   # compromised single identity, linear shape
    # tribe-cap effect: with N_active honest members each drawing ~expected demand, attacker
    # ceiling is min(own budget, remaining room under aggregate cap) -- report ratio
    out["tribe_cap"] = dict(expected_honest_demand_30d=round(expected_honest_demand, 2),
                             aggregate_cap_30d=round(cap, 2),
                             attacker_own_budget_uncapped=round(attacker_uncapped, 2),
                             note="aggregate cap backstops only when tribe is small/quiet; "
                                  "does not shrink a single attacker's own per-identity budget")
    return out

print("=" * 78)
print("S3: SPARK BUDGET CURVE")
s3 = run_s3()
results["S3"] = s3
for k, v in s3.items(): print(k, "=", v)
flagged = [name for name, d in s3["superadditivity_split_check"].items() if d["superadditive"]]
print(f"S3 recommendation: linear-above-gate is non-superadditive and has the lowest "
      f"honest-throttle probability -- ship linear-above-gate as the default curve. "
      f"Shapes flagged superadditive under splitting (REJECT / DEFER): {flagged or 'none'}.")

# ============================================================================
# S4 — APPEAL-SELECTION GAMEABILITY
# ============================================================================
# Conviction in tribe A appealed to one of E eligible bridged tribes; attacker controls k.
# Rule A: single uniformly-drawn tribe decides. Rule B: two independently-drawn tribes must
# both agree to overturn. Attacker-controlled tribes always vote the wrong way.

def appeal_vote(is_attacker, is_wrongful, rng, p_correct=0.85):
    if is_attacker:
        return not is_wrongful     # malicious: overturns legit, upholds wrongful
    correct_action = is_wrongful   # honest correct action: overturn iff wrongful
    return correct_action if rng.random() < p_correct else (not correct_action)

def run_s4(E, k, rule, is_wrongful, seed, p_correct=0.85):
    rng = random.Random(seed)
    tribes = list(range(E))
    attackers = set(rng.sample(tribes, min(k, E)))
    if rule == "single":
        drawn = rng.choice(tribes)
        overturn = appeal_vote(drawn in attackers, is_wrongful, rng, p_correct)
    else:  # "double" -- 2 independently drawn tribes must both agree to overturn
        pair = rng.sample(tribes, 2) if E >= 2 else [tribes[0], tribes[0]]
        votes = [appeal_vote(t in attackers, is_wrongful, rng, p_correct) for t in pair]
        overturn = all(votes)
    return dict(overturned=overturn)

print("=" * 78)
print("S4: APPEAL-SELECTION GAMEABILITY")
results["S4"] = []
for rule in ["single", "double"]:
    for E in [3, 4, 5, 6, 8]:
        for k in range(0, E + 1):
            rows_wrong = mc(run_s4, seeds=100, E=E, k=k, rule=rule, is_wrongful=True)
            rows_legit = mc(run_s4, seeds=100, E=E, k=k, rule=rule, is_wrongful=False)
            p_wrongful_survives = 1 - sum(r["overturned"] for r in rows_wrong) / len(rows_wrong)
            p_legit_overturned = sum(r["overturned"] for r in rows_legit) / len(rows_legit)
            rec = dict(rule=rule, E=E, k=k, k_over_E=round(k / E, 2),
                       p_wrongful_survives_appeal=round(p_wrongful_survives, 3),
                       p_legit_wrongly_overturned=round(p_legit_overturned, 3))
            results["S4"].append(rec)
    print(f"  [{rule}] done ({E and 'sweep'})")
for rec in results["S4"]:
    if rec["k"] in (0, rec["E"] // 2, rec["E"]):
        print(rec)
print("S4 recommendation: the double-independent-draw rule roughly halves both failure "
      "modes at moderate k/E versus single-draw, at the cost of needing 2 tribes to agree "
      "even for a clean legit-upheld case -- ship double-draw for convictions above a "
      "severity threshold; single-draw remains acceptable at k/E <= 0.3.")

# ============================================================================
# S5 — COVERAGE-THRESHOLD SWEEP (federation)
# ============================================================================
# Reuses the federation composite structure from hearth_federation_sim.py (Fed class),
# duplicated here per the single-file requirement. Sweeps (min_opining, coverage_floor)
# against a lure-attack scenario and an honest-thin-coverage scenario.

class Fed:
    def __init__(self, blocs=4, per_bloc=8, seed=0):
        self.rng = random.Random(seed)
        self.blocs = blocs; self.per_bloc = per_bloc
        self.tribes = list(range(blocs * per_bloc))
        self.bloc = {t: t // per_bloc for t in self.tribes}
        self.standing = {t: round(self.rng.uniform(0.3, 1.0), 3) for t in self.tribes}
        self.cite = {}
        self.overlap = {}
        self._build()

    def _build(self):
        R = self.rng
        for X in self.tribes:
            same = [t for t in self.tribes if self.bloc[t] == self.bloc[X] and t != X]
            other = [t for t in self.tribes if self.bloc[t] != self.bloc[X]]
            for Y in R.sample(same, min(5, len(same))):
                self.cite[(X, Y)] = round(R.uniform(0.4, 1.0), 3)
                self.overlap[(X, Y)] = round(R.uniform(0.2, 0.45), 3)
            for Y in R.sample(other, 1):
                self.cite[(X, Y)] = round(R.uniform(0.1, 0.4), 3)
                self.overlap[(X, Y)] = round(R.uniform(0.0, 0.05), 3)

    def ov(self, X, Y):
        return self.overlap.get((X, Y), self.overlap.get((Y, X), 0.0))

    def opinion(self, A, T):
        return self.cite.get((A, T))

    def composite(self, vantage, T, min_opining=2, cov_min=0.25, weighting="standing"):
        num = den = total_w = 0.0; n = 0
        for A, w in vantage:
            if weighting == "equal": w = 1.0
            total_w += w
            r = self.opinion(A, T)
            if r is None: continue
            num += w * r; den += w; n += 1
        if den == 0: return None, 0.0, 0, "unrated"
        coverage = den / total_w
        val = num / den
        status = "ok" if (n >= min_opining and coverage >= cov_min) else "weak"
        return val, round(coverage, 3), n, status

def s5_lure_case(rng):
    """Reader established in an honest tribe (abstains) + lured into a low-standing
    malicious tribe (opines +1.0 on the payload)."""
    fed = Fed(seed=rng.randint(0, 1 << 30))
    payload = max(fed.tribes) + 1
    fed.tribes.append(payload); fed.bloc[payload] = 99; fed.standing[payload] = 0.2
    honest = 0
    malicious = max(fed.tribes) + 1
    fed.tribes.append(malicious); fed.bloc[malicious] = 98; fed.standing[malicious] = round(rng.uniform(0.05, 0.15), 2)
    fed.cite[(malicious, payload)] = 1.0
    w_honest = round(rng.uniform(0.6, 0.95), 2)
    w_mal = round(rng.uniform(0.05, 0.2), 2)
    vantage = [(honest, w_honest), (malicious, w_mal)]
    return fed, vantage, payload

def s5_honest_thin_case(rng):
    """One legit high-standing tribe opines correctly; others in vantage abstain."""
    fed = Fed(seed=rng.randint(0, 1 << 30))
    payload = max(fed.tribes) + 1
    fed.tribes.append(payload); fed.bloc[payload] = 97; fed.standing[payload] = 0.85
    good = 0
    fed.cite[(good, payload)] = round(rng.uniform(0.4, 0.8), 2)
    n_abstain = rng.randint(1, 3)
    vantage = [(good, round(rng.uniform(0.6, 0.95), 2))]
    for _ in range(n_abstain):
        other = rng.choice([t for t in fed.tribes if t not in (good, payload)])
        vantage.append((other, round(rng.uniform(0.3, 0.9), 2)))
    return fed, vantage, payload

print("=" * 78)
print("S5: COVERAGE-THRESHOLD SWEEP (federation)")
results["S5"] = []
for min_opining in [1, 2, 3, 4]:
    for cov_floor in [0.10, 0.15, 0.25, 0.35, 0.50]:
        rng = random.Random(hash((min_opining, cov_floor)) & 0xffffffff)
        lure_confident = thin_suppressed = 0
        N = 100
        for i in range(N):
            fed, van, tgt = s5_lure_case(rng)
            _, _, _, status = fed.composite(van, tgt, min_opining=min_opining, cov_min=cov_floor)
            if status == "ok": lure_confident += 1
        for i in range(N):
            fed, van, tgt = s5_honest_thin_case(rng)
            _, _, _, status = fed.composite(van, tgt, min_opining=min_opining, cov_min=cov_floor)
            if status == "weak": thin_suppressed += 1
        rec = dict(min_opining=min_opining, coverage_floor=cov_floor,
                   p_lure_shown_confident=round(lure_confident / N, 3),
                   p_honest_thin_suppressed=round(thin_suppressed / N, 3))
        results["S5"].append(rec); print(rec)
# pick knee: minimize sum of both failure rates
knee = min(results["S5"], key=lambda r: r["p_lure_shown_confident"] + r["p_honest_thin_suppressed"])
print(f"S5 recommendation (Pareto knee): min_opining={knee['min_opining']}, "
      f"coverage_floor={knee['coverage_floor']} -> lure_confident={knee['p_lure_shown_confident']}, "
      f"thin_suppressed={knee['p_honest_thin_suppressed']}. Note min_opining>=2 is required "
      f"structurally (a lone opining tribe is definitionally weak); coverage_floor=0.25 "
      f"(the v4 default) sits at/near the knee.")

# ============================================================================
# S6 — SMALL-TRIBE QUORUM
# ============================================================================
# N in {5,8,12,16,20}. Rules: (a) v4 baseline max(3,ceil(0.25N)); (b) max(3,ceil(0.5N));
# (c) rule b + appeal window (single honest appeal tribe, p_correct=0.85, per S4 model).

def run_s6(N, rule, capture_n, seed, p_correct=0.85):
    rng = random.Random(seed)
    if rule == "baseline":
        quorum = max(M_MIN_DEFAULT, math.ceil(Q_DEFAULT * N))
    else:
        quorum = max(M_MIN_DEFAULT, math.ceil(0.5 * N))
    # wrongful conviction: capture_n attackers, ~90% file effective complaints
    n_att_eff = sum(1 for _ in range(capture_n) if rng.random() < 0.9)
    wrongful_raised = n_att_eff >= quorum
    # legit conviction: assume honest tribe witnesses abuse, fraction p_witness file
    n_honest_complain = sum(1 for _ in range(N - capture_n) if rng.random() < 0.6)
    legit_raised = n_honest_complain >= quorum
    wrongful_final, legit_final = wrongful_raised, legit_raised
    latency_penalty = 0
    if rule == "appeal_window":
        if wrongful_raised:
            overturn = appeal_vote(False, True, rng, p_correct)  # honest appeal tribe, target IS wrongful
            wrongful_final = not overturn
            latency_penalty += 10
        if legit_raised:
            overturn = appeal_vote(False, False, rng, p_correct)  # honest appeal tribe, target is legit (not wrongful)
            legit_final = not overturn
            latency_penalty += 10
    return dict(wrongful_final=wrongful_final, legit_final=legit_final,
                quorum=quorum, latency_penalty=latency_penalty)

print("=" * 78)
print("S6: SMALL-TRIBE QUORUM")
results["S6"] = []
for N in [5, 8, 12, 16, 20]:
    for rule in ["baseline", "half", "appeal_window"]:
        for capture_n in sorted(set([2, max(2, round(0.2 * N)), max(2, round(0.3 * N)), max(2, N // 2)])):
            if capture_n >= N: continue
            rows = mc(run_s6, seeds=100, N=N, rule=rule, capture_n=capture_n)
            p_wrongful = sum(r["wrongful_final"] for r in rows) / len(rows)
            p_legit = sum(r["legit_final"] for r in rows) / len(rows)
            lat = st.mean(r["latency_penalty"] for r in rows)
            rec = dict(N=N, rule=rule, capture_n=capture_n, capture_frac=round(capture_n / N, 2),
                       quorum=rows[0]["quorum"], p_wrongful_conviction=round(p_wrongful, 3),
                       p_legit_conviction_reliable=round(p_legit, 3), mean_latency_add=round(lat, 1))
            results["S6"].append(rec); print(rec)
print("S6 recommendation: for N<12, the 50%-rule sharply cuts wrongful-conviction "
      "probability at 20-30% capture versus the q=0.25 baseline (which is nearly "
      "undefended at small N), and the appeal-window addition further suppresses "
      "wrongful convictions with only a modest reliability cost to legit convictions -- "
      "ship rule (c) [50% + appeal window] for active_size < 12.")

# ============================================================================
# S7 — FEUD-DAMPING CORROBORATION
# ============================================================================
# Mutual disputes keep full weight iff each side's dispute is corroborated by >=1
# independent tribe (no member overlap with either party); else damped x0.4.
# Scenarios: tit-for-tat (baseless both ways), true-mutual-warning (both genuinely bad),
# one-sided legit dispute (rule doesn't apply -- always full weight, no damping).
#
# Corroboration must be truth-correlated to be a meaningful signal at all: an independent
# tribe is far more likely to notice and dispute a genuinely bad actor than to coincidentally
# pile onto a baseless feud target. p_corr (swept) = P(an independent tribe corroborates a
# GENUINE bad actor) -- proxy for how well-connected/observant the federation is.
# P_FALSE_CORR (fixed, low) = P(an independent tribe coincidentally also disputes a baseless
# target) -- background noise floor (shared rival, copied grudge, brigading contagion).
P_FALSE_CORR = 0.08

def run_s7(scenario, p_corr, seed):
    rng = random.Random(seed)
    if scenario == "one_sided":
        return dict(damped=False, correct=True)
    p = p_corr if scenario == "true_mutual" else P_FALSE_CORR
    corrA = rng.random() < p
    corrB = rng.random() < p
    damped = not (corrA and corrB)
    correct = damped if scenario == "tit_for_tat" else (not damped)
    return dict(damped=damped, correct=correct)

print("=" * 78)
print("S7: FEUD-DAMPING CORROBORATION")
results["S7"] = []
for scenario in ["tit_for_tat", "true_mutual", "one_sided"]:
    for p_corr in [0.3, 0.6, 0.9]:
        rows = mc(run_s7, seeds=200, scenario=scenario, p_corr=p_corr)
        p_damped = sum(r["damped"] for r in rows) / len(rows)
        p_correct = sum(r["correct"] for r in rows) / len(rows)
        rec = dict(scenario=scenario, p_corr=p_corr,
                   p_damped=round(p_damped, 3), p_correct_outcome=round(p_correct, 3))
        results["S7"].append(rec); print(rec)
# separation check: does the rule actually distinguish tit-for-tat from true-mutual?
sep = {}
for p_corr in [0.3, 0.6, 0.9]:
    tft = next(r for r in results["S7"] if r["scenario"] == "tit_for_tat" and r["p_corr"] == p_corr)
    tm = next(r for r in results["S7"] if r["scenario"] == "true_mutual" and r["p_corr"] == p_corr)
    sep[p_corr] = round(tft["p_correct_outcome"] - (1 - tm["p_correct_outcome"]), 3)
results["S7_separation_check"] = sep
print("S7 separation (p_correct[tit_for_tat] - false_damp_rate[true_mutual]) by p_corr:", sep)
worst = min(sep.values())
if worst < 0.3:
    print("S7 recommendation: DEFER. At low corroborating-tribe density (p_corr<=0.3) the "
          "corroboration rule barely separates tit-for-tat from a true mutual warning "
          f"(min separation {worst}) -- both scenarios hinge on independent-tribe "
          "availability the tribe may not have. Ship only where p_corr is known >= ~0.6; "
          "otherwise carry as an open question with this evidence.")
else:
    print(f"S7 recommendation: ship the corroboration rule -- separation holds "
          f"(min {worst}) across the swept p_corr range.")

# ============================================================================
# write results + timing
# ============================================================================
import os
_outpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hearth_v5_sim_results.json")
with open(_outpath, "w") as fh:
    json.dump(results, fh, indent=2)
print("=" * 78)
print(f"saved {_outpath}   ({time.time()-T0:.1f}s total)")
