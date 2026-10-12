"""Dataset loading, sampling, and prompt construction for the prompting study."""
import json, random, re, string

SEED = 42
LETTERS = string.ascii_uppercase
STYLES = ["zero_shot", "zero_shot_cot", "few_shot", "few_shot_cot"]
DATASETS = ["gsm8k", "strategyqa", "date"]
K = 4  # number of in-context examples

DATE_SHOTS = [  # hand-written exemplars (kept out of the test sample)
    ("Yesterday was April 30, 2021. What is the date today in MM/DD/YYYY?\nOptions:\nA. 05/01/2021\nB. 04/29/2021\nC. 05/09/2021\nD. 03/11/2021", "A",
     "Yesterday was 04/30/2021, so today is one day later: 05/01/2021."),
    ("Today is Christmas Eve of 1937. What is the date 10 days ago in MM/DD/YYYY?\nOptions:\nA. 12/14/2026\nB. 12/14/1937\nC. 12/24/1937\nD. 01/04/1938", "B",
     "Christmas Eve is 12/24/1937. Ten days before is 12/14/1937."),
    ("Jane was born on the last day of February in 2001. Today is her 16-year-old birthday. What is the date tomorrow in MM/DD/YYYY?\nOptions:\nA. 03/01/2017\nB. 02/28/2017\nC. 03/02/2017\nD. 03/01/2002", "A",
     "The last day of Feb 2001 is 02/28/2001. Her 16th birthday is 02/28/2017 (2017 is not a leap year). Tomorrow is 03/01/2017."),
    ("The deadline is Jun 1, 2021, which is 2 days away from now. What is the date 24 hours later in MM/DD/YYYY?\nOptions:\nA. 05/30/2021\nB. 06/02/2021\nC. 05/31/2021\nD. 06/01/2021", "C",
     "The deadline is 06/01/2021 and is 2 days away, so today is 05/30/2021. 24 hours later is 05/31/2021."),
]

def _gsm_gold(ans): return ans.split("####")[-1].strip().replace(",", "")

def load(dataset, n):
    rng = random.Random(SEED)
    if dataset == "gsm8k":
        test = [json.loads(l) for l in open("data/gsm8k_test.jsonl")]
        train = [json.loads(l) for l in open("data/gsm8k_train.jsonl")]
        idx = rng.sample(range(len(test)), n)
        items = [{"id": f"gsm8k-{i}", "question": test[i]["question"], "gold": _gsm_gold(test[i]["answer"])} for i in idx]
        shots = []
        for j in random.Random(SEED).sample(range(len(train)), K):
            sol = re.sub(r"<<.*?>>", "", train[j]["answer"].split("####")[0]).strip()
            shots.append((train[j]["question"], _gsm_gold(train[j]["answer"]), sol))
        return items, shots
    if dataset == "strategyqa":
        ex = json.load(open("data/strategyqa.json"))["examples"]
        idx = list(range(len(ex))); rng.shuffle(idx)
        pick, shot_idx = idx[:n], idx[n:n + K]
        def gold(e): return max(e["target_scores"], key=e["target_scores"].get)
        items = [{"id": f"strategyqa-{i}", "question": ex[i]["input"], "gold": gold(ex[i])} for i in pick]
        shots = [(ex[i]["input"], gold(ex[i]), ex[i]["target"].strip()) for i in shot_idx]
        return items, shots
    if dataset == "date":
        ex = json.load(open("data/date_understanding.json"))["examples"]
        idx = list(range(len(ex))); rng.shuffle(idx)
        items = []
        for i in idx[:n]:
            opts = list(ex[i]["target_scores"].items()); rng.shuffle(opts)
            q = ex[i]["input"] + "\nOptions:\n" + "\n".join(f"{LETTERS[k]}. {o}" for k, (o, _) in enumerate(opts))
            items.append({"id": f"date-{i}", "question": q, "gold": LETTERS[[s for _, s in opts].index(1)]})
        return items, DATE_SHOTS
    raise ValueError(dataset)

FORMAT = {
    "gsm8k": "a single number",
    "strategyqa": "Yes or No",
    "date": "a single option letter",
}

def build(dataset, style, question, shots):
    """Return (system, user) messages for one prompting strategy."""
    cot = style.endswith("cot")
    sys_msg = ("You are a careful assistant that solves reasoning problems. "
               f"End your reply with a final line of the form 'Answer: <{FORMAT[dataset]}>'.")
    if not cot:
        sys_msg += " Do not show any reasoning; reply with only that final line."
    parts = []
    if style.startswith("few_shot"):
        for q, a, r in shots:
            parts.append(f"Question: {q}\n" + (f"Reasoning: {r}\n" if cot else "") + f"Answer: {a}")
    parts.append(f"Question: {question}\n" + ("Reasoning: Let's think step by step." if style == "zero_shot_cot" else ""))
    return sys_msg, "\n\n".join(parts).strip()

def extract(dataset, text):
    m = re.findall(r"answer\s*:\s*(.+)", text, flags=re.I)
    s = (m[-1] if m else text.strip().splitlines()[-1] if text.strip() else "").strip().strip("*").strip()
    if dataset == "gsm8k":
        nums = re.findall(r"-?\d[\d,]*\.?\d*", s)
        return nums[-1].replace(",", "").rstrip(".") if nums else ""
    if dataset == "strategyqa":
        m2 = re.search(r"\b(yes|no)\b", s, flags=re.I); return m2.group(1).capitalize() if m2 else ""
    m2 = re.search(r"\b([A-F])\b", s.upper()); return m2.group(1) if m2 else ""

def correct(dataset, pred, gold):
    if not pred: return False
    if dataset == "gsm8k":
        try: return abs(float(pred) - float(gold)) < 1e-6
        except ValueError: return False
    return pred == gold
