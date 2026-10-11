# CTFd Automation Toolkit – KPMG CTF 2026

A single-file Python client for the CTFd REST API.

## Setup

```sh
pip install requests
export CTFD_TOKEN=<your_token>
# Optional: override the base URL
export CTFD_BASE_URL=https://kpmg-ctf2026.ctfd.io
```

Your token expires **2026-10-12 05:30 UTC** — regenerate before then if needed.

## Commands

| Command | Description |
|---------|-------------|
| `python ctfd_client.py list` | List all challenges with category, points, solved status |
| `python ctfd_client.py details <id>` | Full JSON details for one challenge |
| `python ctfd_client.py submit <id> <flag>` | Submit a single flag |
| `python ctfd_client.py batch flags.txt` | Bulk-submit from a file |
| `python ctfd_client.py scoreboard` | Top-20 scoreboard |
| `python ctfd_client.py download <id> [dir]` | Download all files for a challenge |

## Batch flag file format

```
# challenge_id:flag  (# lines are comments)
1:CTF{flag_here}
42:KPMG{another_flag}
```

## Key API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/users/me` | Verify token / get user info |
| GET | `/api/v1/teams/me` | Team info |
| GET | `/api/v1/challenges` | All challenges |
| GET | `/api/v1/challenges/{id}` | Single challenge details |
| POST | `/api/v1/challenges/attempt` | Submit a flag |
| GET | `/api/v1/scoreboard` | Live scoreboard |

## Flag submission statuses

- `correct` – accepted
- `incorrect` – wrong answer
- `already_solved` – already submitted
- `ratelimited` – slow down (client auto-sleeps 0.5 s between submissions)
