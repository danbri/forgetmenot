import json, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
OUT="/home/user/forgetmenot/third_party/data/wq-analysis"
rows=json.load(open("/tmp/lg/yearly.json"))
labels=[str(r["y"]) for r in rows]
tabled=[r["tabled"] for r in rows]
answered=[r["answered"] for r in rows]
x=list(range(len(rows)))
fig,ax=plt.subplots(figsize=(11,5.5))
ax.plot(x,tabled,"-o",color="#1f4e9c",lw=2.2,label="Tabled",zorder=3)
ax.plot(x,answered,"--",color="#888",lw=1.4,label="Answered",zorder=2)
for xi,v in zip(x,tabled):
    ax.annotate(f"{v:,}",(xi,v),textcoords="offset points",xytext=(0,8),ha="center",fontsize=8)
# objective election-year markers (GE polling days)
ge={"2015":"GE 7 May 2015","2017":"GE 8 Jun 2017","2019":"GE 12 Dec 2019","2024":"GE 4 Jul 2024"}
for xi,lab in zip(x,labels):
    if lab in ge:
        ax.axvline(xi,color="#d4380d",ls=":",lw=1,alpha=0.6,zorder=1)
        ax.annotate(ge[lab],(xi,1500),rotation=90,va="bottom",ha="right",fontsize=7,color="#d4380d")
ax.set_title("House of Commons written questions per year, 2015–2026")
ax.set_ylabel("Questions (House of Commons)")
ax.set_xticks(x); ax.set_xticklabels(labels)
ax.yaxis.set_major_formatter(mtick.FuncFormatter(lambda v,_:f"{int(v):,}"))
ax.set_ylim(0,90000)
ax.grid(axis="y",alpha=0.3)
ax.legend(loc="upper left")
ax.annotate("2026 partial\n(to 29 May)",(x[-1],tabled[-1]),textcoords="offset points",
            xytext=(-6,-28),ha="center",fontsize=7,color="#555")
plt.tight_layout(); plt.savefig(f"{OUT}/04_timeline_2015_2026.png",dpi=140); plt.close()
print("written 04_timeline_2015_2026.png")
print("tabled:",dict(zip(labels,tabled)))
