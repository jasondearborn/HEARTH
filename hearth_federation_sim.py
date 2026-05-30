"""
HEARTH v4 Federation / personalized-composite pressure test.

Models the inter-tribe citation graph (§7) and the reader's personalized composite
S_R(T) = sum_i w_i r_i(T) / sum_i w_i * 1[r_i != abstain]
where r_i(T) = direct cite(A_i,T) + one discounted, overlap-damped transitive hop.

Stresses the open questions from v4 §13:
  1. Ring-resistance: does a collusion ring contaminate an unconnected reader?
  2. Transitive depth / gamma: how much does one hop leak when a legit tribe is duped?
  3. Composite weighting: standing-weighted vs equal-weight under reader-luring.
  4. Sybil tribe with no legit inbound citations.
  5. Feud damping on reciprocal disputes.
  6. Baseline divergence across blocs (the intended feature).
"""
import random, statistics as st

# ---------------- federation construction ----------------
class Fed:
    def __init__(self, blocs=4, per_bloc=8, seed=0):
        self.rng = random.Random(seed)
        self.blocs = blocs; self.per_bloc = per_bloc
        self.tribes = list(range(blocs*per_bloc))
        self.bloc = {t: t//per_bloc for t in self.tribes}
        self.standing = {t: round(self.rng.uniform(0.3,1.0),3) for t in self.tribes}
        self.cite = {}       # (X,Y) -> weight in [-1,1]
        self.overlap = {}    # (X,Y) -> membership overlap in [0,1]
        self._build()

    def _build(self):
        R=self.rng
        for X in self.tribes:
            same=[t for t in self.tribes if self.bloc[t]==self.bloc[X] and t!=X]
            other=[t for t in self.tribes if self.bloc[t]!=self.bloc[X]]
            # within-bloc positive citations
            for Y in R.sample(same, min(5,len(same))):
                self.cite[(X,Y)]=round(R.uniform(0.4,1.0),3)
                self.overlap[(X,Y)]=round(R.uniform(0.2,0.45),3)
            # sparse cross-bloc positive
            for Y in R.sample(other, 1):
                self.cite[(X,Y)]=round(R.uniform(0.1,0.4),3)
                self.overlap[(X,Y)]=round(R.uniform(0.0,0.05),3)
        # cross-bloc disputes between "opposed" blocs (0<->3, 1<->2)
        opp={0:3,3:0,1:2,2:1}
        for X in self.tribes:
            for Y in self.tribes:
                if self.bloc[Y]==opp[self.bloc[X]] and R.random()<0.15:
                    self.cite[(X,Y)]=round(-R.uniform(0.3,0.8),3)
                    self.overlap.setdefault((X,Y),0.0)

    def ov(self,X,Y):
        return self.overlap.get((X,Y), self.overlap.get((Y,X), 0.0))

    def opinion(self, A, T, gamma=0.5, max_hop=1, overlap_damp=True):
        """tribe A's opinion of T: direct + one discounted transitive hop. None=abstain."""
        direct = self.cite.get((A,T))
        if max_hop>=1:
            trans=0.0; seen=False
            for B in self.tribes:
                if B in (A,T): continue
                c1=self.cite.get((A,B)); c2=self.cite.get((B,T))
                if c1 is None or c2 is None: continue
                if c1<=0: continue            # only flow trust through positive citations
                damp=(1-self.ov(A,B)) if overlap_damp else 1.0
                trans += gamma*c1*c2*damp
                seen=True
        else:
            trans=0.0; seen=False
        if direct is None and not seen: return None
        val=(direct or 0.0)+ (trans if (direct is None or True) else 0.0)
        return max(-1.0,min(1.0,val))

    def composite(self, vantage, T, gamma=0.5, max_hop=1, weighting="standing",
                  overlap_damp=True, min_opining=2, cov_min=0.25):
        """vantage = list of (tribe, reader_standing_in_tribe).
        Returns (value, coverage, n_opining, status, parts). status flags weak/unrated."""
        num=den=0.0; parts=[]; total_w=0.0
        for A,w in vantage:
            if weighting=="equal": w=1.0
            total_w+=w
            r=self.opinion(A,T,gamma,max_hop,overlap_damp)
            if r is None: continue
            num+=w*r; den+=w; parts.append((A,round(w,2),round(r,3)))
        if den==0: return None,0.0,0,"unrated",parts
        coverage=den/total_w
        val=num/den
        n=len(parts)
        status="ok"
        if n<min_opining or coverage<cov_min:
            status="weak"     # surface low-confidence: too few / too small a slice of vantage opines
        return val,round(coverage,3),n,status,parts

# ---------------- adversary injectors ----------------
def add_ring(fed, size=6, payload_strength=1.0, bridge_from=None):
    """Add a collusion ring of `size` tribes citing each other + a payload tribe.
       If bridge_from is a legit tribe id, it is duped into citing one ring tribe."""
    start=max(fed.tribes)+1
    ring=list(range(start,start+size)); payload=start+size
    for t in ring+[payload]:
        fed.tribes.append(t); fed.bloc[t]=99; fed.standing[t]=0.2
    for X in ring:
        for Y in ring:
            if X!=Y: fed.cite[(X,Y)]=1.0; fed.overlap[(X,Y)]=0.6
        fed.cite[(X,payload)]=payload_strength; fed.overlap[(X,payload)]=0.6
    if bridge_from is not None:
        fed.cite[(bridge_from, ring[0])]=0.5   # one duped legit->ring citation
        fed.overlap[(bridge_from, ring[0])]=0.02
    return ring, payload

# ---------------- scenarios ----------------
def reader_vantage(fed, tribes_standings):
    return [(t,s) for t,s in tribes_standings]

def show(label, res):
    v,cov,n,status,parts = res
    vs = "unrated" if v is None else round(v,3)
    print(f" {label:42s} value={vs!s:>8} coverage={cov} n={n} status={status}")
    return res

print("="*72)
print("S6: BASELINE DIVERGENCE (feature check) — same target, different vantages")
fed=Fed(seed=1); target=0
for b in range(4):
    ts=[t for t in fed.tribes if fed.bloc[t]==b][:2]
    van=[(ts[0],0.8),(ts[1],0.5)]
    show(f"reader in bloc {b}", fed.composite(van,target))

print("="*72)
print("S1+S2: RING RESISTANCE & TRANSITIVE LEAKAGE (transitive ON, hop=1)")
for bridge in [False, True]:
    for gamma in [0.0,0.3,0.5,0.7]:
        fed=Fed(seed=2)
        ring,payload=add_ring(fed, size=6, bridge_from=(8 if bridge else None))
        van=[(8,0.8),(9,0.6)]
        tag="bridged(1 duped cite)" if bridge else "no bridge"
        show(f"{tag} gamma={gamma}", fed.composite(van,payload,gamma=gamma,min_opining=1))

print("="*72)
print("MITIGATION A: TRANSITIVE OFF by default (hop=0) — direct citations only")
fed=Fed(seed=2); ring,payload=add_ring(fed,size=6,bridge_from=8)
show("bridged ring, hop=0", fed.composite([(8,0.8),(9,0.6)],payload,max_hop=0,min_opining=1))

print("="*72)
print("MITIGATION B: require >=2 independent bridge tribes for transitive to count")
# emulate: with a single duped bridge, demand 2 distinct positive bridge paths
def composite_2bridge(fed,vantage,T,gamma=0.5):
    num=den=0.0;parts=[];tw=0.0
    for A,w in vantage:
        tw+=w
        # count distinct bridges A->B->T
        bridges=[B for B in fed.tribes if B not in (A,T)
                 and fed.cite.get((A,B),0)>0 and fed.cite.get((B,T)) is not None]
        direct=fed.cite.get((A,T))
        if direct is None and len(bridges)<2:   # need >=2 independent bridges
            continue
        r=fed.opinion(A,T,gamma,1,True)
        if r is None: continue
        num+=w*r; den+=w; parts.append((A,r))
    return (None if den==0 else num/den), parts
fed=Fed(seed=2); ring,payload=add_ring(fed,size=6,bridge_from=8)
v,parts=composite_2bridge(fed,[(8,0.8),(9,0.6)],payload)
print(f" bridged ring, >=2-bridge rule: value={'unrated' if v is None else round(v,3)}")

print("="*72)
print("S3: WEIGHTING + COVERAGE FLOOR — reader lured into malicious LOW-standing tribe")
fed=Fed(seed=3); ring,payload=add_ring(fed,size=4)
M=max(fed.tribes)+1; fed.tribes.append(M); fed.bloc[M]=99; fed.standing[M]=0.1
fed.cite[(M,payload)]=1.0; fed.overlap[(M,payload)]=0.0
van=[(0,0.9),(M,0.1)]   # established in legit tribe 0, barely in malicious M
for wmode in ["standing","equal"]:
    show(f"weighting={wmode}", fed.composite(van,payload,weighting=wmode))
print(" -> coverage exposes it: only the 0.1-standing tribe opines; honest tribe 0 abstains")

print("="*72)
print("S4: SYBIL TRIBE with NO legit inbound citations")
fed=Fed(seed=4)
Sn=max(fed.tribes)+1; fed.tribes.append(Sn); fed.bloc[Sn]=99; fed.standing[Sn]=0.9
show("honest reader views sybil tribe", fed.composite([(0,0.8),(1,0.6)],Sn,min_opining=1))

print("="*72)
print("S5: FEUD DAMPING — one-sided weaponization vs genuine mutual feud")
def feud(reciprocal, damp):
    fed=Fed(seed=7); A,B=1,8
    fed.cite[(A,B)]=-0.8
    if reciprocal: fed.cite[(B,A)]=-0.8
    if damp and reciprocal:
        fed.cite[(A,B)]*=0.4; fed.cite[(B,A)]*=0.4
    res=fed.composite([(A,0.8),(2,0.6)],B,min_opining=1)
    return res[0]
def fmt(x): return "unrated" if x is None else round(x,3)
print(" one-sided dispute, no damping:  ", fmt(feud(False,False)))
print(" mutual feud,      no damping:   ", fmt(feud(True,False)))
print(" mutual feud,      with damping: ", fmt(feud(True,True)), " (negatives discounted)")
