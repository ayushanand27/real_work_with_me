"""Run all (model x dataset x prompting style) combinations against the Groq API.
Results are appended to results/raw.jsonl and the run is resumable (finished cells are skipped).
Usage: GROQ_API_KEY=... python run_experiment.py --n 100 --models allam-2-7b qwen/qwen3.8-27b
"""
import argparse, json, os, sys, time, threading, requests
from concurrent.futures import ThreadPoolExecutor
import prompts_data as P

URL = "https://api.groq.com/openai/v1/chat/completions"
OUT = "results/raw.jsonl"
lock = threading.Lock()
pace = threading.Lock()
recent = []  # (time, completion_tokens) of finished calls, used to respect an output-tokens-per-minute cap

def wait_for_budget(otpm, expected=450):
    """Sleep until adding `expected` output tokens keeps the last 60 s under the OTPM cap."""
    while otpm:
        now = time.time()
        recent[:] = [(t, n) for t, n in recent if now - t < 60]
        used = sum(n for _, n in recent)
        if used + expected <= otpm: return
        time.sleep(max(0.5, 60 - (now - recent[0][0]) + 0.2))

def call(model, system, user, temperature, max_tokens, key):
    body = {"model": model, "temperature": temperature, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "low"  # gpt-oss cannot disable its built-in reasoning
    for attempt in range(60):
        t0 = time.time()
        r = requests.post(URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=90)
        if r.status_code == 200:
            j = r.json()
            return j["choices"][0]["message"]["content"], j["usage"]["completion_tokens"], j["usage"]["prompt_tokens"], time.time() - t0
        if r.status_code in (429, 503, 500):
            time.sleep(min(float(r.headers.get("retry-after", 2 ** min(attempt, 5))), 60) + 0.5); continue
        raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
    raise RuntimeError("too many retries")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--models", nargs="+", default=["allam-2-7b", "qwen/qwen3.8-27b"])
    ap.add_argument("--datasets", nargs="+", default=P.DATASETS)
    ap.add_argument("--styles", nargs="+", default=P.STYLES)
    ap.add_argument("--runs", type=int, default=1, help="repeats per item (use >1 with --temperature>0 for consistency)")
    ap.add_argument("--temperature", type=float, default=0.0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--otpm", type=int, default=0, help="output-token-per-minute cap to pace against (0 = off)")
    a = ap.parse_args()
    key = os.environ["GROQ_API_KEY"]
    os.makedirs("results", exist_ok=True)
    done = set()
    if os.path.exists(OUT):
        for l in open(OUT):
            r = json.loads(l); done.add((r["model"], r["dataset"], r["style"], r["id"], r["run"], r["temperature"]))
    jobs = []
    for m in a.models:
        for d in a.datasets:
            items, shots = P.load(d, a.n)
            for s in a.styles:
                for it in items:
                    for run in range(a.runs):
                        if (m, d, s, it["id"], run, a.temperature) not in done:
                            jobs.append((m, d, s, it, shots, run))
    print(f"{len(jobs)} calls to make", flush=True)
    cnt = [0]
    def work(j):
        m, d, s, it, shots, run = j
        sysm, user = P.build(d, s, it["question"], shots)
        mx = 1000 if s.endswith("cot") else 40
        try:
            with pace:  # serialise paced calls so the token window is accurate
                wait_for_budget(a.otpm if s.endswith("cot") else 0)
                text, ct, pt, lat = call(m, sysm, user, a.temperature, mx, key)
                recent.append((time.time(), ct))
        except Exception as e:
            print("ERR", m, d, s, it["id"], e, file=sys.stderr, flush=True); return
        pred = P.extract(d, text)
        rec = {"model": m, "dataset": d, "style": s, "id": it["id"], "run": run, "temperature": a.temperature,
               "gold": it["gold"], "pred": pred, "correct": P.correct(d, pred, it["gold"]),
               "completion_tokens": ct, "prompt_tokens": pt, "latency": round(lat, 3), "output": text}
        with lock:
            open(OUT, "a").write(json.dumps(rec) + "\n"); cnt[0] += 1
            if cnt[0] % 50 == 0: print(cnt[0], "done", flush=True)
    with ThreadPoolExecutor(a.workers) as ex: list(ex.map(work, jobs))
    print("finished", cnt[0])

if __name__ == "__main__":
    main()
