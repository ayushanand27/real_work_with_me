"""Aggregate results/raw.jsonl into tables, significance tests and charts."""
import json, sys, math, itertools
import pandas as pd, numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.stats import binomtest

RAW = sys.argv[1] if len(sys.argv) > 1 else "results/raw.jsonl"
df = pd.DataFrame([json.loads(l) for l in open(RAW)])
df = df[df.temperature == 0.0]
ORDER = ["zero_shot", "zero_shot_cot", "few_shot", "few_shot_cot"]
LABEL = {"zero_shot": "Zero-shot", "zero_shot_cot": "Zero-shot CoT", "few_shot": "Few-shot", "few_shot_cot": "Few-shot CoT"}
DLAB = {"gsm8k": "GSM8K", "strategyqa": "StrategyQA", "date": "Date Understanding"}

def wilson(k, n, z=1.96):
    if n == 0: return (0, 0)
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)

acc = df.groupby(["model", "dataset", "style"]).agg(n=("correct", "size"), k=("correct", "sum"),
        tokens=("completion_tokens", "mean"), latency=("latency", "mean")).reset_index()
acc["acc"] = 100 * acc.k / acc.n
acc[["lo", "hi"]] = [tuple(100 * x for x in wilson(k, n)) for k, n in zip(acc.k, acc.n)]
acc.to_csv("results/accuracy.csv", index=False)

# overall per model/style
ov = df.groupby(["model", "style"]).agg(n=("correct", "size"), acc=("correct", "mean"), tokens=("completion_tokens", "mean"), latency=("latency", "mean")).reset_index()
ov["acc"] *= 100; ov.to_csv("results/overall.csv", index=False)

# McNemar (exact) of each style vs zero-shot, pooled over datasets, per model
rows = []
for m, g in df.groupby("model"):
    pv = g.pivot_table(index=["dataset", "id"], columns="style", values="correct", aggfunc="first")
    for s in ORDER[1:]:
        b = int(((pv["zero_shot"] == True) & (pv[s] == False)).sum()); c = int(((pv["zero_shot"] == False) & (pv[s] == True)).sum())
        p = binomtest(b, b + c, 0.5).pvalue if b + c else 1.0
        rows.append({"model": m, "comparison": f"{LABEL[s]} vs Zero-shot", "zs_only_correct": b, "other_only_correct": c, "p_value": p})
pd.DataFrame(rows).to_csv("results/mcnemar.csv", index=False)

# charts
models = sorted(df.model.unique()); dsets = [d for d in ["gsm8k", "strategyqa", "date"] if d in df.dataset.unique()]
colors = ["#4C72B0", "#55A868", "#C44E52", "#8172B2"]
for m in models:
    fig, ax = plt.subplots(figsize=(7, 3.8)); w = 0.2
    for i, s in enumerate(ORDER):
        v = [acc[(acc.model == m) & (acc.dataset == d) & (acc["style"] == s)] for d in dsets]
        y = [x.acc.iloc[0] if len(x) else 0 for x in v]
        e = [[(x.acc.iloc[0] - x.lo.iloc[0]) if len(x) else 0 for x in v], [(x.hi.iloc[0] - x.acc.iloc[0]) if len(x) else 0 for x in v]]
        ax.bar(np.arange(len(dsets)) + (i - 1.5) * w, y, w, yerr=e, capsize=2, label=LABEL[s], color=colors[i])
    ax.set_xticks(range(len(dsets))); ax.set_xticklabels([DLAB[d] for d in dsets]); ax.set_ylabel("Accuracy (%)"); ax.set_ylim(0, 105)
    ax.set_title(f"Accuracy by prompting strategy: {m}"); ax.legend(fontsize=7, ncol=4, loc="lower center"); fig.tight_layout()
    fig.savefig(f"results/acc_{m}.png", dpi=200); plt.close(fig)
fig, ax = plt.subplots(figsize=(6, 3.8))
for m, mk in zip(models, ["o", "s", "^", "D"]):
    o = ov[ov.model == m].set_index("style").loc[ORDER]
    ax.scatter(o.tokens, o.acc, marker=mk, s=60, label=m)
    for s in ORDER: ax.annotate(LABEL[s], (o.loc[s, "tokens"], o.loc[s, "acc"]), fontsize=6, xytext=(3, 3), textcoords="offset points")
ax.set_xlabel("Mean completion tokens per answer"); ax.set_ylabel("Overall accuracy (%)"); ax.set_xscale("symlog", linthresh=10); ax.legend(fontsize=7)
ax.set_title("Accuracy vs. output cost"); fig.tight_layout(); fig.savefig("results/cost_tradeoff.png", dpi=200)
pd.set_option("display.width", 200)
print(acc.round(1).to_string()); print(ov.round(2).to_string()); print(pd.read_csv("results/mcnemar.csv").round(4).to_string())
