"""Result-independent report text: front matter, introduction ... methodology, references."""
from docx_helpers import *

REFS = [
 'T. B. Brown et al., "Language models are few-shot learners," in Advances in Neural Information Processing Systems (NeurIPS), vol. 33, 2020. arXiv:2005.14165.',
 'J. Wei et al., "Chain-of-thought prompting elicits reasoning in large language models," in Advances in Neural Information Processing Systems (NeurIPS), vol. 35, 2022. arXiv:2201.11903.',
 'T. Kojima, S. S. Gu, M. Reid, Y. Matsuo, and Y. Iwasawa, "Large language models are zero-shot reasoners," in Advances in Neural Information Processing Systems (NeurIPS), vol. 35, 2022. arXiv:2205.11916.',
 'X. Wang et al., "Self-consistency improves chain of thought reasoning in language models," in Int. Conf. on Learning Representations (ICLR), 2023. arXiv:2203.11171.',
 'K. Cobbe et al., "Training verifiers to solve math word problems," arXiv preprint arXiv:2110.14168, 2021.',
 'M. Geva, D. Khashabi, E. Segal, T. Khot, D. Roth, and J. Berant, "Did Aristotle use a laptop? A question answering benchmark with implicit reasoning strategies," Trans. Assoc. Comput. Linguistics, vol. 9, 2021. arXiv:2101.02235.',
 'A. Srivastava et al., "Beyond the imitation game: Quantifying and extrapolating the capabilities of language models," Trans. Mach. Learn. Res., 2023. arXiv:2206.04615.',
 'S. Min et al., "Rethinking the role of demonstrations: What makes in-context learning work?," in Proc. Conf. on Empirical Methods in Natural Language Processing (EMNLP), 2022. arXiv:2202.12837.',
 'D. Zhou et al., "Least-to-most prompting enables complex reasoning in large language models," in Int. Conf. on Learning Representations (ICLR), 2023. arXiv:2205.10625.',
 'Z. Zhang, A. Zhang, M. Li, and A. Smola, "Automatic chain of thought prompting in large language models," in Int. Conf. on Learning Representations (ICLR), 2023. arXiv:2210.03493.',
 'T. Z. Zhao, E. Wallace, S. Feng, D. Klein, and S. Singh, "Calibrate before use: Improving few-shot performance of language models," in Proc. Int. Conf. on Machine Learning (ICML), 2021. arXiv:2102.09690.',
 'F. Shi et al., "Large language models can be easily distracted by irrelevant context," in Proc. Int. Conf. on Machine Learning (ICML), 2023. arXiv:2302.00093.',
 'M. Suzgun et al., "Challenging BIG-Bench tasks and whether chain-of-thought can solve them," in Findings of the Assoc. for Computational Linguistics (ACL), 2023. arXiv:2210.09261.',
 'Z. Sprague et al., "To CoT or not to CoT? Chain-of-thought helps mainly on math and symbolic reasoning," arXiv preprint arXiv:2409.12183, 2024.',
 'Y. Lu, M. Bartolo, A. Moore, S. Riedel, and P. Stenetorp, "Fantastically ordered prompts and where to find them: Overcoming few-shot prompt order sensitivity," in Proc. Annu. Meeting of the Assoc. for Computational Linguistics (ACL), 2022. arXiv:2104.08786.',
 'P. Sahoo et al., "A systematic survey of prompt engineering in large language models: Techniques and applications," arXiv preprint arXiv:2402.07927, 2024.',
 'S. Yao et al., "Tree of thoughts: Deliberate problem solving with large language models," in Advances in Neural Information Processing Systems (NeurIPS), vol. 36, 2023. arXiv:2305.10601.',
]

def title_page(d, name, reg):
    center(d, "A Comparative Evaluation of Zero Shot and Few Shot Prompting Strategies for Enhancing Complex Reasoning in Large Language Models", 16, True, 12, upper=True)
    center(d, "A", 12, False, 6); center(d, "Report on", 12, False, 6)
    center(d, "Prompt Engineering", 14, True, 0); center(d, "IS4143", 14, True, 14)
    center(d, "Submitted in the partial fulfilment of the requirement for the award of the degree of", 12, False, 6)
    center(d, "Bachelor of Technology", 14, True, 4); center(d, "in", 12, False, 4)
    center(d, "Computer Science & Engineering (IoT & Intelligent Systems)", 12, True, 4)
    center(d, "2023-2027", 12, False, 10); center(d, "By:", 12, False, 4)
    center(d, name, 12, True, 0); center(d, reg, 12, True, 0); center(d, "Semester: 7", 12, False, 18)
    center(d, "School of Computer Science and Engineering", 12, True, 0)
    center(d, "Department of IoT & Intelligent Systems", 12, True, 0)
    center(d, "Manipal University Jaipur", 12, True, 0); center(d, "Jaipur, Rajasthan", 12, False, 4)
    center(d, "July-Nov 2026", 12, True, 0)

def contents(d):
    center(d, "Contents", 16, True, 8, upper=True)
    for i, s in enumerate(["Introduction", "Problem Statement", "Project Objectives", "Literature Review", "Methodology",
              "Result and Discussions", "Challenges and Limitations", "Future Work", "Conclusion", "References"], 1):
        p = d.add_paragraph(); p.paragraph_format.left_indent = Inches(1.2); p.paragraph_format.line_spacing = 1.5
        p.add_run(f"{i}.  {s}").font.name = FONT
        for r in p.runs: r.font.size = Pt(12)

def introduction(d):
    heading(d, "1. Introduction")
    para(d, "Large language models (LLMs) now perform a wide range of tasks without any task-specific training. Instead of updating model weights, users steer the model through its input, the prompt. This practice, called prompt engineering, has become the main way of adapting a model for a given use. Brown et al. showed that a sufficiently large model can learn a task from a handful of worked examples placed in the prompt, which is known as few-shot or in-context learning [1]. The opposite extreme, zero-shot prompting, gives the model only an instruction and the question.")
    para(d, "Reasoning tasks expose the weaknesses of both styles. A question such as a multi-step arithmetic word problem or a date calculation needs several intermediate inferences, and a model asked to answer in one step often fails. Wei et al. found that showing worked reasoning in the examples, known as chain-of-thought (CoT) prompting, greatly improves accuracy on such problems [2], and Kojima et al. showed that even the single phrase \"Let's think step by step\" can elicit this behaviour without any examples [3]. These findings suggest that two separate choices matter: whether the prompt contains examples, and whether the model is encouraged to reason aloud. Practitioners rarely see these two choices measured separately, and the cost of each in tokens and time is seldom reported.")
    para(d, "This project therefore runs a controlled comparison of four prompting strategies (zero-shot, zero-shot CoT, few-shot and few-shot CoT) on three reasoning benchmarks and two open-weight models of different sizes. All prompts, code and raw model outputs are released with this report so that every number can be reproduced.")

def problem(d):
    heading(d, "2. Problem Statement")
    para(d, "Prompt design is usually guided by anecdote. It is unclear how much of the accuracy on complex reasoning comes from adding examples, how much from eliciting step-by-step reasoning, and how much extra output the model has to produce to obtain it. The effect may also depend on the model's size and on the kind of reasoning required (arithmetic, commonsense or temporal). A practitioner choosing a prompting strategy for a reasoning application therefore lacks evidence on which strategy gives the best accuracy for an acceptable cost on a given model. This project addresses that gap with a controlled, reproducible empirical comparison.")

def objectives(d):
    heading(d, "3. Project Objectives")
    numbered(d, [
     "To implement four prompting strategies (zero-shot, zero-shot CoT, few-shot, few-shot CoT) with identical task instructions and answer formats.",
     "To measure the accuracy of each strategy on arithmetic (GSM8K), commonsense (StrategyQA) and temporal (Date Understanding) reasoning tasks.",
     "To test whether the observed differences between strategies are statistically significant, using an exact McNemar test.",
     "To quantify the cost of each strategy in generated tokens, and to compare a small and a medium-sized model.",
     "To identify, through manual error analysis, the typical ways in which each strategy fails."])

def literature(d):
    heading(d, "4. Literature Review")
    para(d, "**In-context learning.** Brown et al. introduced the idea that large autoregressive models can perform new tasks from a few demonstrations in the prompt, with no gradient updates [1]. Later work questioned what the demonstrations contribute. Min et al. found that replacing the labels in the examples with random ones hurts performance surprisingly little, suggesting that examples mostly convey the format and the input distribution [8]. Few-shot results are also fragile: they depend on the choice, the order and the label balance of the examples [11], [15], and irrelevant text in the prompt can mislead the model [12].")
    para(d, "**Eliciting reasoning.** Wei et al. showed that adding intermediate reasoning steps to the examples (chain of thought) sharply improves arithmetic, commonsense and symbolic reasoning, but mainly in sufficiently large models [2]. Kojima et al. found that a zero-shot trigger phrase is enough to obtain much of this benefit [3]. Suzgun et al. showed that CoT lifts a model over the average human rater on many BIG-Bench Hard tasks [13], while Sprague et al.'s meta-analysis of over a hundred papers concluded that the benefit is concentrated on math and symbolic problems and is small elsewhere [14]. Zhang et al. proposed building the demonstrations automatically [10].")
    para(d, "**Beyond a single chain.** Self-consistency samples several reasoning paths and takes a majority vote, improving accuracy at higher cost [4]. Least-to-most prompting decomposes a problem into easier sub-problems [9], and Tree of Thoughts searches over alternative reasoning branches [17]. Cobbe et al. introduced GSM8K together with a trained verifier to select among candidate solutions [5]. Surveys such as Sahoo et al. catalogue these techniques [16].")
    table(d, ["Work", "Technique", "Main finding", "Gap addressed here"], [
      ["Brown et al. [1]", "Few-shot prompting", "Examples in the prompt enable new tasks", "Effect of examples vs. reasoning"],
      ["Min et al. [8]", "Demonstration analysis", "Label correctness matters little", "Format vs. content of examples"],
      ["Wei et al. [2]", "Few-shot CoT", "Reasoning steps help large models", "Cost in tokens not reported"],
      ["Kojima et al. [3]", "Zero-shot CoT", "A trigger phrase elicits reasoning", "Compared with few-shot CoT"],
      ["Sprague et al. [14]", "Meta-analysis of CoT", "Gains mostly on math/symbolic", "Per-task check on 3 task types"],
      ["Wang et al. [4]", "Self-consistency", "Voting over paths improves accuracy", "Left as future work"]],
      "Table 1: Summary of closely related work", widths=[1.2, 1.4, 2.0, 1.9], size=9, left=True)
    para(d, "Most of this literature evaluates a single model family and reports accuracy only. The present study keeps the task instructions, answer format and decoding settings fixed across four strategies, uses two different open-weight models, and reports accuracy together with confidence intervals, significance tests and output length.")

def methodology(d, n, models, calls):
    heading(d, "5. Methodology")
    subheading(d, "5.1 Experimental design")
    para(d, "The study was planned as a full factorial experiment: 4 prompting strategies × 3 datasets × 2 models × 60 questions per dataset (1,440 model calls). All strategies are applied to exactly the same questions, so they are compared on paired data. The free API tier limits the number of tokens per day, and the daily budget for Qwen3.8-27B ran out before the run finished. The final data therefore consist of ALLaM-2-7B on all three datasets (60 questions each, 720 calls) and Qwen3.8-27B on GSM8K (60 questions, 240 calls) and StrategyQA (51 questions, 204 calls); Date Understanding was not completed for Qwen. Within each model and dataset only questions answered under all four strategies are analysed (1,164 calls in total). Figure 1 shows the pipeline.")
    figure(d, "results/pipeline.png", "Figure 1: Experimental pipeline", 6.0)
    subheading(d, "5.2 Datasets")
    bullets(d, [
      "**GSM8K** [5]: grade-school arithmetic word problems with a numeric answer. 60 questions were drawn from the official test split.",
      "**StrategyQA** [6]: yes/no questions needing implicit multi-hop commonsense reasoning (60 sampled questions, BIG-bench release [7]; 51 of them completed for Qwen).",
      "**Date Understanding** [7]: calendar reasoning posed as multiple choice with six options (60 questions, BIG-bench; option order was shuffled; ALLaM only)."])
    para(d, "Questions were selected by sorting item indices with a salted SHA-256 hash, which is deterministic and reproducible. Items used as few-shot examples were removed from the test pool, so there is no overlap between demonstrations and test questions.")
    subheading(d, "5.3 Prompting strategies")
    bullets(d, [
      "**Zero-shot:** an instruction and the question; the model is told to give only the final line \"Answer: ...\".",
      "**Zero-shot CoT:** the same instruction, but reasoning is allowed and the question is followed by \"Let's think step by step\" [3].",
      "**Few-shot:** four solved examples (question and answer only) precede the test question [1].",
      "**Few-shot CoT:** four examples that include worked reasoning before the answer [2]."])
    para(d, "For GSM8K the examples are drawn from the training split with their reference solutions; for StrategyQA they use the dataset's annotated rationales; for Date Understanding four short rationales were written by hand.")
    subheading(d, "5.4 Models and decoding")
    para(d, "Two models served through the Groq API were used: ALLaM-2-7B (a 7-billion-parameter model, here called the small model) and Qwen3.8-27B (27 billion parameters, the medium model), both used in their standard non-thinking mode so that any reasoning comes from the prompt rather than a hidden reasoning phase. Temperature was 0 for all runs. Answers were limited to 40 tokens for non-CoT strategies and 1000 tokens for CoT strategies.")
    subheading(d, "5.5 Metrics and statistics")
    para(d, "The final line \"Answer: ...\" is extracted with a regular expression and compared with the gold answer (numeric equality for GSM8K, exact match otherwise); a missing or malformed answer counts as wrong. Accuracy is reported with 95% Wilson confidence intervals. Each strategy is compared with zero-shot on the same items using an exact McNemar test (two-sided binomial test on discordant pairs). The mean number of generated tokens per answer measures cost.")

def references(d):
    heading(d, "References")
    for i, r in enumerate(REFS, 1):
        p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.left_indent = Inches(0.45); p.paragraph_format.first_line_indent = Inches(-0.45)
        p.paragraph_format.line_spacing = 1.15; p.paragraph_format.space_after = Pt(3)
        rr = p.add_run(f"[{i}]  {r}"); rr.font.name = FONT; rr.font.size = Pt(11)
