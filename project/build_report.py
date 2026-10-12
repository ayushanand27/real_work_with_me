"""Build the final Word report from results/*.csv and results/*.png.
Usage: python3 build_report.py "Student Name" "Registration Number"
"""
import sys
import pandas as pd
from docx_helpers import *
import report_static as R

NAME = sys.argv[1] if len(sys.argv) > 1 else "[Name of Student]"
REG = sys.argv[2] if len(sys.argv) > 2 else "[Registration Number]"
acc = pd.read_csv("results/accuracy.csv"); ov = pd.read_csv("results/overall.csv"); mc = pd.read_csv("results/mcnemar_by_dataset.csv")
ST = ["zero_shot", "zero_shot_cot", "few_shot", "few_shot_cot"]
SL = {"zero_shot": "Zero-shot", "zero_shot_cot": "Zero-shot CoT", "few_shot": "Few-shot", "few_shot_cot": "Few-shot CoT"}
ML = {"allam-2-7b": "ALLaM-2-7B", "qwen/qwen3.8-27b": "Qwen3.8-27B"}
DL = {"gsm8k": "GSM8K", "strategyqa": "StrategyQA", "date": "Date Und."}

def fmt_p(p): return "<0.001" if p < 0.001 else f"{p:.3f}"

d = new_document()
R.title_page(d, NAME, REG); page_break(d)
R.contents(d); page_break(d)
R.introduction(d); R.problem(d); R.objectives(d); R.literature(d); R.methodology(d, 60, 2, 1164)

heading(d, "6. Result and Discussions")
subheading(d, "6.1 Accuracy of the four strategies")
rows = []
for (m, ds), g in acc.groupby(["model", "dataset"]):
    g = g.set_index("style")
    best = g.acc.idxmax()
    rows.append([f"{ML[m]} / {DL[ds]} (n={int(g.n.iloc[0])})"] + [("**" if s == best else "") + f"{g.loc[s,'acc']:.1f}" + ("**" if s == best else "") + f" ({g.loc[s,'lo']:.0f}-{g.loc[s,'hi']:.0f})" for s in ST])
rows = [[c.replace("**", "") if i else c for i, c in enumerate(r)] for r in rows]
table(d, ["Model / dataset"] + [SL[s] for s in ST], rows, "Table 2: Accuracy % (95% Wilson interval) for each strategy", widths=[2.2, 1.1, 1.1, 1.1, 1.1], size=9)
para(d, "Table 2 and Figures 2 and 3 show a clear pattern that depends on the dataset more than on the model. On **GSM8K**, reasoning is decisive: for the small ALLaM model, accuracy rises from 11.7% (zero-shot) to 46.7% with zero-shot CoT and 56.7% with few-shot CoT, while few-shot examples without reasoning give only 13.3%. Qwen shows the same shape at a higher level (53.3% → 93.3% → 95.0%, with plain few-shot at 61.7%). On **StrategyQA**, differences between strategies are small (ALLaM 66.7–75.0%, Qwen 76.5–86.3%) and their confidence intervals overlap heavily. On **Date Understanding** (ALLaM only), few-shot CoT is best at 56.7% against 36.7% for zero-shot, but zero-shot CoT is actually lower than zero-shot (30.0%).")
figure(d, "results/acc_allam-2-7b.png", "Figure 2: Accuracy of ALLaM-2-7B by strategy and dataset (error bars: 95% Wilson interval)", 3.9)
figure(d, "results/acc_qwen_qwen3.8-27b.png", "Figure 3: Accuracy of Qwen3.8-27B by strategy and dataset (error bars: 95% Wilson interval)", 3.9)

subheading(d, "6.2 Statistical significance")
cells = []
for (m, ds), g in mc.groupby(["model", "dataset"]):
    g = g.set_index("cmp")
    cells.append([f"{ML[m]} / {DL[ds]}"] + [f"{fmt_p(g.loc[k,'p'])} ({int(g.loc[k,'other_only'])} vs {int(g.loc[k,'zs_only'])})" for k in ["zero_shot_cot", "few_shot", "few_shot_cot"]])
table(d, ["Model / dataset", "Zero-shot CoT", "Few-shot", "Few-shot CoT"], cells,
      "Table 3: Exact McNemar p-value against zero-shot (questions fixed vs. broken)", widths=[2.3, 1.5, 1.5, 1.5], size=9)
para(d, "Table 3 gives the exact McNemar p-value of each strategy against zero-shot, with the number of questions the strategy fixed versus broke in brackets. With 60 questions per cell, only large effects reach significance at the 5% level. The GSM8K gains from CoT are highly significant for both models (p < 0.001; for example, Qwen fixed 24 questions with zero-shot CoT and broke none). Few-shot examples alone did not significantly help on GSM8K for either model (ALLaM p = 1.000, Qwen p = 0.180). On StrategyQA no comparison is significant (all p ≥ 0.06; Qwen's few-shot gain from 76.5% to 86.3% is borderline at p = 0.0625). On Date Understanding only ALLaM's few-shot CoT beats zero-shot significantly (p = 0.023), and it also beats zero-shot CoT (p = 0.0015). Because many comparisons were made without correction, the borderline p-values should be treated as suggestive only.")

subheading(d, "6.3 Cost of each strategy")
crow = [[ML[m], SL[s], f"{ov[(ov.model==m)&(ov['style']==s)].tokens.iloc[0]:.1f}", f"{ov[(ov.model==m)&(ov['style']==s)].acc.iloc[0]:.1f}"] for m in ML for s in ST]
table(d, ["Model", "Strategy", "Mean output tokens", "Overall accuracy %"], crow, "Table 4: Output length and pooled accuracy", widths=[1.6, 1.8, 1.6, 1.6], size=9)
para(d, "Reasoning is paid for in output tokens. Answer-only strategies produce about 5-12 tokens, whereas CoT outputs are roughly 13 to 80 times longer. Interestingly, few-shot CoT is both more accurate and cheaper than zero-shot CoT for ALLaM (104.6 versus 233.7 tokens; 60.6% versus 50.6% pooled accuracy), because the worked examples teach the model to reason concisely. For Qwen, few-shot CoT used 248.6 tokens against 423.9 for zero-shot CoT. Pooled accuracies in Table 4 are averages over the datasets each model completed, so they must not be compared between the two models (Qwen has no Date Understanding results).")
figure(d, "results/cost_tradeoff.png", "Figure 4: Pooled accuracy versus mean output tokens (log-like horizontal axis)", 3.4)

subheading(d, "6.4 Error analysis")
para(d, "**Format failures.** The largest single failure was in ALLaM's zero-shot CoT on Date Understanding: 14 of 60 answers gave a date (for example \"Answer: 01/02/2015\") instead of the requested option letter and so could not be scored. Among answers that could be parsed, zero-shot CoT (39.1%) is no better than zero-shot (38.6%), so on this task the lower score combines a format problem with an absence of real benefit. Few-shot prompting removed this failure entirely (0 of 60), because the examples show the answer format.")
para(d, "**Reasoning errors.** Where CoT fails, the arithmetic or calendar logic is usually wrong rather than missing. In one ALLaM zero-shot CoT date answer the model computed \"02/25/2011 − 10 = 02/15/2011\" after reasoning from an incorrect intermediate date, and then chose the wrong option.")
para(d, "**Direct answers are guesses.** On GSM8K the question \"Marcus is half of Leo's age and five years younger than Deanna. Deanna is 26. How old is Leo?\" (correct answer 42) was answered \"20\" by ALLaM and \"62\" by Qwen when asked for the answer only, but both were correct with few-shot CoT, writing 26 − 5 = 21 and 21 × 2 = 42. Without intermediate steps the models effectively guess.")
para(d, "**When reasoning does not help.** On StrategyQA, Qwen's zero-shot CoT broke four questions that zero-shot had answered correctly. For \"Is the Illuminati card game still popular?\" (answer: No) the model wrote a plausible-sounding justification ending in \"Yes\". Longer reasoning can rationalise a wrong guess when the question depends on world knowledge rather than computation. Finally, seven of Qwen's CoT answers (three zero-shot CoT and one few-shot CoT on StrategyQA, and two zero-shot CoT and one few-shot CoT on GSM8K) reached the 1,000-token cap and were counted wrong, which slightly understates its CoT accuracy.")

subheading(d, "6.5 Discussion")
para(d, "The results answer the objectives as follows. (1) Eliciting reasoning matters far more than adding examples when the task needs multi-step computation: on GSM8K both CoT strategies lifted accuracy by 35-45 percentage points, while examples alone added little. (2) The benefit is task dependent, in line with the meta-analysis of Sprague et al. [14]: on the commonsense task StrategyQA there was no significant gain from any strategy. (3) Examples help in a different way: they fix the answer format and, combined with reasoning, make the reasoning shorter, which is why few-shot CoT dominated zero-shot CoT on Date Understanding and in cost. (4) The larger model was more accurate everywhere it was tested and made better use of reasoning on arithmetic (93-95% versus 47-57%), but its absolute gain from CoT was similar (about 40 points versus 35-45), so reasoning prompts help models of both sizes. These conclusions apply to the specific models, datasets and 60-question samples used here.")

heading(d, "7. Challenges and Limitations")
bullets(d, [
 "**Incomplete design.** The free API quota for Qwen3.8-27B (a daily cap of 200,000 tokens and 1,000 output tokens per minute) ended the run before Date Understanding could be tested, and StrategyQA was completed for 51 of 60 questions. The model-size comparison is therefore only available on GSM8K and StrategyQA.",
 "**Small samples.** With 51-60 questions per cell, the 95% intervals are about ±12 points wide, so small differences cannot be detected; many comparisons were not corrected for multiple testing.",
 "**Model availability.** The Llama models originally planned were no longer offered on the API, so ALLaM-2-7B and Qwen3.8-27B were used. Results may differ for other model families, and the models' training data may have included these public benchmarks.",
 "**Single run at temperature 0.** Run-to-run variation, and the effect of example choice and order [15], were not measured. Answer parsing relies on the model following the \"Answer:\" format, and truncated outputs count as wrong."])

heading(d, "8. Future Work")
bullets(d, [
 "Complete the Qwen3.8-27B Date Understanding runs (the runner is resumable) and increase the sample to 200 or more questions per dataset.",
 "Add self-consistency voting [4] and least-to-most decomposition [9] and measure their accuracy-per-token against the four baselines.",
 "Measure sensitivity to the choice and ordering of the in-context examples [15] and test automatically generated demonstrations [10].",
 "Include reasoning-native models, whose hidden reasoning may make prompt-level CoT unnecessary."])

heading(d, "9. Conclusion")
para(d, "This project compared zero-shot, zero-shot CoT, few-shot and few-shot CoT prompting on arithmetic, commonsense and temporal reasoning with two open-weight models. Chain-of-thought reasoning was the dominant factor for arithmetic: it raised GSM8K accuracy from 11.7% to as much as 56.7% for ALLaM-2-7B and from 53.3% to as much as 95.0% for Qwen3.8-27B, a significant gain in every case (p < 0.001), whereas few-shot examples alone gave no significant gain. On StrategyQA no strategy was significantly better than another. Few-shot CoT was the most reliable overall: it had the highest accuracy in three of the five model-dataset settings (GSM8K for both models and Date Understanding), was within sampling error of the best on StrategyQA, avoided answer-format failures, and needed fewer output tokens than zero-shot CoT. The practical recommendation is to use few-shot CoT for computation-heavy tasks and plain prompts for knowledge-based questions. The limitations above, chiefly the small samples and the incomplete Qwen runs, mean these findings should be confirmed on larger samples. All code, prompts and raw outputs are in the project repository so the experiments can be reproduced.")
R.references(d)
page_numbers(d)
cp = d.core_properties
cp.author = cp.last_modified_by = NAME
cp.title = "A Comparative Evaluation of Zero Shot and Few Shot Prompting Strategies for Enhancing Complex Reasoning in Large Language Models"
cp.subject = "Prompt Engineering (IS4143) Research Based Project"; cp.comments = ""
d.save("report/Prompt_Engineering_IS4143_Research_Report.docx")
print("saved")
