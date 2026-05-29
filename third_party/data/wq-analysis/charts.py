import json, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick

OUT="/home/user/forgetmenot/third_party/data/wq-analysis"
import os; os.makedirs(OUT, exist_ok=True)

names=json.load(open("/tmp/lg/names.json"))
d25=json.load(open("/tmp/lg/wq2025.json"))
d23=json.load(open("/tmp/lg/wq2023.json"))

# ---- Chart 1: yearly volume ----
years=["2021","2022","2023","2024*","2025","2026\n(to 29 May)"]
vals=[50755,53777,48734,41844,80725,33963]
fig,ax=plt.subplots(figsize=(8,4.5))
bars=ax.bar(years,vals,color=["#5B8FF9"]*5+["#9aa7b5"])
bars[4].set_color("#d4380d")
for b,v in zip(bars,vals):
    ax.text(b.get_x()+b.get_width()/2, v+800, f"{v:,}", ha="center", va="bottom", fontsize=9)
ax.set_title("Commons written questions tabled, by year")
ax.set_ylabel("Questions tabled")
ax.yaxis.set_major_formatter(mtick.FuncFormatter(lambda x,_:f"{int(x):,}"))
ax.set_ylim(0,90000)
ax.text(0,-0.18,"*2024: general election dissolution (May–Jul) suppressed volume. 2026 partial.",
        transform=ax.transAxes,fontsize=7.5,color="#666")
plt.tight_layout(); plt.savefig(f"{OUT}/01_yearly_volume.png",dpi=140); plt.close()

# ---- Chart 2: top 20 askers 2025 ----
top=d25["entries"][:20]
labels=[names.get(str(e["id"]),str(e["id"])) for e in top][::-1]
counts=[e["n"] for e in top][::-1]
fig,ax=plt.subplots(figsize=(8,7))
ax.barh(labels,counts,color="#d4380d")
for i,(l,c) in enumerate(zip(labels,counts)):
    ax.text(c+20,i,f"{c:,}",va="center",fontsize=8)
ax.set_title("Top 20 askers of Commons written questions, 2025")
ax.set_xlabel("Questions tabled in 2025")
med=sorted([e["n"] for e in d25["entries"]])[len(d25["entries"])//2]
ax.text(0.98,0.02,f"Median MP in 2025: {med} questions\nTop asker = {top[0]['n']:,}",
        transform=ax.transAxes,ha="right",va="bottom",fontsize=8,
        bbox=dict(boxstyle="round",fc="#fff3e6",ec="#d4380d"))
plt.tight_layout(); plt.savefig(f"{OUT}/02_top20_2025.png",dpi=140); plt.close()

# ---- Chart 3: Lorenz / concentration curve ----
def lorenz(entries):
    ns=sorted([e["n"] for e in entries])
    tot=sum(ns); n=len(ns)
    xs=[0]; ys=[0]; cum=0
    for i,v in enumerate(ns):
        cum+=v
        xs.append((i+1)/n*100); ys.append(cum/tot*100)
    return xs,ys
fig,ax=plt.subplots(figsize=(6.5,6))
for d,lab,col in [(d23,"2023","#5B8FF9"),(d25,"2025","#d4380d")]:
    xs,ys=lorenz(d["entries"])
    ax.plot(xs,ys,label=f"{lab} ({d['distinctMembers']} MPs, {d['total']:,} Qs)",color=col,lw=2)
ax.plot([0,100],[0,100],"--",color="#999",label="perfect equality")
ax.set_title("Concentration of written questions among MPs\n(Lorenz curve)")
ax.set_xlabel("Cumulative % of MPs (least to most active)")
ax.set_ylabel("Cumulative % of questions tabled")
ax.legend(loc="upper left",fontsize=8)
ax.grid(alpha=0.3)
plt.tight_layout(); plt.savefig(f"{OUT}/03_concentration_lorenz.png",dpi=140); plt.close()

# ---- print concentration stats ----
def stats(d):
    ns=sorted([e["n"] for e in d["entries"]],reverse=True)
    tot=sum(ns); n=len(ns)
    top10=sum(ns[:10]); top20=sum(ns[:20]); top50=sum(ns[:50])
    return dict(year=d["from"][:4],MPs=n,total=tot,
        top10pct=round(top10/tot*100,1),top20pct=round(top20/tot*100,1),
        top50pct=round(top50/tot*100,1),max=ns[0],median=sorted(ns)[n//2])
print(json.dumps(stats(d23)))
print(json.dumps(stats(d25)))
print("Charts written to",OUT)
