import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
fig, ax = plt.subplots(figsize=(9, 2.2)); ax.set_xlim(0, 100); ax.set_ylim(2, 28); ax.axis("off")
boxes = [("Datasets\nGSM8K\nStrategyQA\nDate Und.", "#DCE6F2"), ("Sampling\nSHA-256 order,\nexemplars\nheld out", "#E2EFDA"),
         ("Prompt builder\nzero-shot\nzero-shot CoT\nfew-shot\nfew-shot CoT", "#FFF2CC"), ("LLM call\n(temperature 0)\nALLaM-2-7B\nQwen3.8-27B", "#FCE4D6"),
         ("Answer\nextraction +\nexact-match\nscoring", "#EAD1DC"), ("Analysis\nWilson CI\nMcNemar test\ntokens, errors", "#D9D9D9")]
w, gap = 14.2, 2.4
for i, (t, c) in enumerate(boxes):
    x = 1 + i * (w + gap)
    ax.add_patch(FancyBboxPatch((x, 5), w, 20, boxstyle="round,pad=0.4", fc=c, ec="#444", lw=1))
    ax.text(x + w / 2, 15, t, ha="center", va="center", fontsize=6.6, family="serif")
    if i < len(boxes) - 1:
        ax.add_patch(FancyArrowPatch((x + w + 0.6, 15), (x + w + gap - 0.6, 15), arrowstyle="-|>", mutation_scale=9, color="#444"))
fig.savefig("results/pipeline.png", dpi=220, bbox_inches="tight")
