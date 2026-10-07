# PwC Technical Interview Prep (Interview: Fri 16 Oct)

Plan: 9 days (7–15 Oct), ~6–8 h/day. Salesforce is the main track, so it gets about 50% of the time.

## Before you start (30 min, today)
1. Sign up for a free **Developer Edition org**: https://developer.salesforce.com/signup
2. Sign up on Trailhead (https://trailhead.salesforce.com) and link the org (Trailhead > Hands-on Orgs > Connect).
3. Install VS Code + "Salesforce Extension Pack" (optional; Developer Console is enough).

## Day-by-day

| Day | Date | Salesforce (3–4 h) | DSA / SQL / other (3–4 h) |
|-----|------|--------------------|---------------------------|
| 1 | Wed 7 Oct | Platform basics, CRM, Lightning (read `01-salesforce-concepts.md` sec 1-2). Trailhead: *Get Started*, *Salesforce Platform Basics*. Start **Recruiting App Step 1-2** (data model) | SQL: SELECT, WHERE, GROUP BY, HAVING, JOINs (`04-sql.md`) |
| 2 | Thu 8 Oct | Formulas, validation rules, data management. Recruiting App Step 3-4 | SQL: subqueries, window functions, 15 practice queries |
| 3 | Fri 9 Oct | Security (OWD, roles, profiles, perm sets, sharing). Recruiting App Step 5 | DSA: arrays, strings, hashing (`05-dsa.md`) |
| 4 | Sat 10 Oct | Lightning App Builder, UI customization, reports & dashboards. Recruiting App Step 6-7 | DSA: two pointers, sliding window, binary search |
| 5 | Sun 11 Oct | **Flow**: record-triggered, screen flow. Recruiting App Step 8 | DSA: linked list, stack/queue, recursion |
| 6 | Mon 12 Oct | **Apex**: syntax, SOQL, DML, triggers, test classes (`03-apex-cheatsheet.md`). Add trigger + test class to project | DSA: trees, BFS/DFS, heap |
| 7 | Tue 13 Oct | Governor limits, async Apex, order of execution, integration basics. Record project demo | DSA: DP basics (+ OOP/DBMS/OS quick revise) |
| 8 | Wed 14 Oct | Mock interview on all Salesforce Q&A (say answers aloud) | SQL mock + 2 timed DSA problems |
| 9 | Thu 15 Oct | Project walkthrough rehearsal (`02-recruiting-app-project.md` "How to explain it"), HR round (`06-hr-behavioral.md`) | Light revise, sleep early |

## Files
- `01-salesforce-concepts.md` – concepts + likely interview Q&A
- `02-recruiting-app-project.md` – the project, built step by step (do this in your org)
- `recruiting-app/` – Apex class, trigger, tests (SFDX layout) for the project
- `03-apex-cheatsheet.md` – Apex/SOQL/triggers/limits
- `04-sql.md` – SQL revision + practice questions
- `05-dsa.md` – DSA patterns + curated problem list
- `06-hr-behavioral.md` – HR / project / behavioral answers

## Honesty notes
- Trailhead badges for the Tekstac course show 100% for you, but you said you haven't done the work. Interviewers will ask about it. Build the project yourself in the org; don't claim things you can't explain.
- Salesforce UI/features change a little each release; if a menu is named differently, use Setup's Quick Find box.
- The Apex files in `recruiting-app/` are written by hand and have not been deployed to an org. Run the tests in your org and fix anything that differs.
