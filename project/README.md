# IS4143 research project: zero-shot vs few-shot prompting for reasoning

Compares four prompting strategies (zero-shot, zero-shot CoT, few-shot, few-shot CoT) on GSM8K, StrategyQA and
Date Understanding with ALLaM-2-7B and Qwen3.8-27B (via the Groq API, temperature 0).

| File | Purpose |
|---|---|
| `prompts_data.py` | dataset sampling (deterministic, SHA-256 ordering), prompt templates, answer extraction/scoring |
| `run_experiment.py` | resumable runner; appends to `results/raw.jsonl`. `GROQ_API_KEY=... python run_experiment.py --n 60 [--models ...] [--otpm 950 --workers 1]` |
| `analyze.py` | accuracy + Wilson CIs, McNemar tests, charts (`results/*.csv`, `results/*.png`) |
| `build_report.py` | builds `report/Prompt_Engineering_IS4143_Research_Report.docx` (`python build_report.py "Name" "Reg No"`) |
| `data/` | GSM8K (OpenAI), StrategyQA and Date Understanding (BIG-bench) source files |

Status: ALLaM-2-7B is complete (3 datasets x 60 questions). Qwen3.8-27B is complete for GSM8K and 51/60 StrategyQA
questions; the free tier's 200k tokens/day cap stopped the run before Date Understanding. The runner skips finished
cells, so rerunning it later with the same arguments completes the remainder; rerun `analyze.py` and `build_report.py` afterwards
(update the scope text in `report_static.py` and the figures quoted in `build_report.py` to match).
The API key is read from the environment and is never stored in the repository.
