"""
CTFd API client for KPMG CTF 2026.

Usage:
    export CTFD_TOKEN=<your_token>
    python ctfd_client.py list
    python ctfd_client.py details <challenge_id>
    python ctfd_client.py submit <challenge_id> <flag>
    python ctfd_client.py batch flags.txt
    python ctfd_client.py scoreboard
    python ctfd_client.py download <challenge_id>
"""

import os
import sys
import time
import json
import requests

BASE_URL = os.getenv("CTFD_BASE_URL", "https://kpmg-ctf2026.ctfd.io")
TOKEN = os.getenv("CTFD_TOKEN")

if not TOKEN:
    print("ERROR: CTFD_TOKEN environment variable not set.", file=sys.stderr)
    print("  export CTFD_TOKEN=<your_token>", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json",
}

RATE_LIMIT_DELAY = 0.5  # seconds between requests


def _get(path, **kwargs):
    r = requests.get(f"{BASE_URL}{path}", headers=HEADERS, **kwargs)
    r.raise_for_status()
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(f"API error on GET {path}: {body}")
    return body["data"]


def _post(path, payload):
    r = requests.post(f"{BASE_URL}{path}", headers=HEADERS, json=payload)
    r.raise_for_status()
    return r.json()


# ── Public API ────────────────────────────────────────────────────────────────

def get_user():
    return _get("/api/v1/users/me")


def get_team():
    return _get("/api/v1/teams/me")


def get_challenges():
    return _get("/api/v1/challenges")


def get_challenge_details(challenge_id: int):
    return _get(f"/api/v1/challenges/{challenge_id}")


def submit_flag(challenge_id: int, flag: str) -> dict:
    payload = {"challenge_id": challenge_id, "submission": flag}
    result = _post("/api/v1/challenges/attempt", payload)
    return result


def get_scoreboard():
    return _get("/api/v1/scoreboard")


def download_challenge_files(challenge_id: int, dest_dir: str = "."):
    details = get_challenge_details(challenge_id)
    files = details.get("files", [])
    if not files:
        print(f"  No files for challenge {challenge_id}.")
        return
    os.makedirs(dest_dir, exist_ok=True)
    for file_path in files:
        url = f"{BASE_URL}{file_path}"
        filename = file_path.split("/")[-1].split("?")[0]
        dest = os.path.join(dest_dir, filename)
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            f.write(resp.content)
        print(f"  Downloaded → {dest}")


def batch_submit(flags_file: str):
    """Submit flags from a file with lines: challenge_id:flag"""
    results = []
    with open(flags_file) as f:
        lines = [l.strip() for l in f if l.strip() and ":" in l and not l.startswith("#")]

    for line in lines:
        cid_str, flag = line.split(":", 1)
        cid = int(cid_str.strip())
        flag = flag.strip()
        result = submit_flag(cid, flag)
        status = result.get("data", {}).get("status", "unknown")
        print(f"  Challenge {cid:>4} | {status:<15} | {flag}")
        results.append({"challenge_id": cid, "flag": flag, "status": status})
        time.sleep(RATE_LIMIT_DELAY)

    print(f"\nSummary: {sum(1 for r in results if r['status'] == 'correct')} correct / {len(results)} submitted")
    return results


# ── CLI ───────────────────────────────────────────────────────────────────────

def cmd_list(_args):
    user = get_user()
    print(f"Authenticated as: {user['name']} (id={user['id']})\n")
    challenges = get_challenges()
    categories = {}
    for c in challenges:
        categories.setdefault(c["category"], []).append(c)

    total_pts = sum(c["value"] for c in challenges)
    solved_pts = sum(c["value"] for c in challenges if c.get("solved_by_me"))

    print(f"{'ID':>4}  {'Category':<18}  {'Name':<40}  {'Pts':>5}  {'Solved'}")
    print("-" * 80)
    for cat, chals in sorted(categories.items()):
        for c in sorted(chals, key=lambda x: x["value"]):
            solved = "✓" if c.get("solved_by_me") else " "
            print(f"{c['id']:>4}  {c['category']:<18}  {c['name']:<40}  {c['value']:>5}  {solved}")

    print(f"\nTotal: {len(challenges)} challenges | {total_pts} pts available | {solved_pts} pts solved")


def cmd_details(args):
    if not args:
        print("Usage: details <challenge_id>")
        sys.exit(1)
    d = get_challenge_details(int(args[0]))
    print(json.dumps(d, indent=2))


def cmd_submit(args):
    if len(args) < 2:
        print("Usage: submit <challenge_id> <flag>")
        sys.exit(1)
    result = submit_flag(int(args[0]), args[1])
    status = result.get("data", {}).get("status", "unknown")
    print(f"Result: {status}")
    if status not in ("correct", "already_solved"):
        sys.exit(1)


def cmd_batch(args):
    if not args:
        print("Usage: batch <flags_file>")
        sys.exit(1)
    batch_submit(args[0])


def cmd_scoreboard(_args):
    board = get_scoreboard()
    print(f"{'Rank':>4}  {'Name':<30}  {'Score':>7}")
    print("-" * 45)
    for entry in board[:20]:
        print(f"{entry['pos']:>4}  {entry['name']:<30}  {entry['score']:>7}")


COMMANDS = {
    "list": cmd_list,
    "details": cmd_details,
    "submit": cmd_submit,
    "batch": cmd_batch,
    "scoreboard": cmd_scoreboard,
    "download": lambda args: download_challenge_files(int(args[0]), args[1] if len(args) > 1 else "."),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"Commands: {', '.join(COMMANDS)}")
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])
