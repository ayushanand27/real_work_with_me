# Interview Prep: Presenting the Recruiting App

## 60-second project pitch

> "For my Salesforce capstone I built a Recruiting app. A hiring team was tracking positions and
> candidates in spreadsheets, so I modelled four custom objects: Position, Candidate, Job
> Application as the junction between them, and Review for interviewer feedback. I used
> master-detail relationships so roll-up summaries could count applications and total review
> scores, and a formula to compute the average rating because roll-ups can't average. Data quality
> is enforced by validation rules, for example max pay can't be below min pay and a hired
> application can't be changed. A before-save flow stamps the open date when a position is
> approved. In Apex I wrote a bulkified trigger with a handler class that blocks duplicate
> applications and, when someone is hired, closes the position and rejects the other applicants. A
> scheduled batch job closes stale positions. Recruiters use a Lightning Web Component on the
> position page to move candidates through the pipeline. Security is handled with two permission
> sets, Recruiter and Interviewer, and the LWC controller runs in user mode. All of it is covered
> by Apex tests, including a 200-record bulk test, and Jest tests for the component."

Be ready to open the org and show: Schema Builder → a Position page with the pipeline → hire a
candidate and show the position close → the dashboard.

## Design decisions you should be able to defend

| Question | Answer |
| --- | --- |
| Why master-detail Position → Job Application? | An application can't exist without a position, sharing should follow the position, and I need roll-up summaries (only available on master-detail). |
| Why is Candidate a lookup, not master-detail? | A candidate exists independently and applies to many positions. An object can have at most 2 master-detail fields, and deleting a candidate should be blocked (`Restrict`), not cascade. |
| How do you get an average with roll-ups? | Roll-ups support only COUNT, SUM, MIN, MAX. I roll up SUM and COUNT and divide in a formula field, guarding against divide-by-zero. |
| Why both a unique field and a trigger for duplicates? | The trigger gives a friendly error and catches duplicates inside the same insert. The unique index on `Unique_Key__c` is the database-level guarantee in case of race conditions. |
| Flow or trigger? | Simple same-record field updates → before-save flow (fastest, no code). Cross-object logic with queries, duplicate checks and bulk handling → Apex. Salesforce's guidance is "clicks before code". |
| Why is the handler `without sharing`? | Closing the position and rejecting competing applications must happen even if the recruiter cannot see every record. The LWC controller is `with sharing` and uses `WITH USER_MODE`, so the UI never shows data the user can't access. |
| How is the trigger bulkified? | No SOQL or DML inside loops: I collect Ids into Sets, query once, use Maps for lookups, and do one `update` per object. The 200-record test proves it. |
| How do you stop trigger recursion? | Logic only acts on a *change* (`old.Status__c != 'Hired'`), so the second pass (rejecting other apps) does not fire the hire logic again. A static Boolean flag is the other common pattern. |

## Core topics, quick answers

**Platform basics**
- *Salesforce* is a multi-tenant cloud CRM. *Org* = one customer's instance. Metadata-driven, so customizing does not change core code.
- *Standard vs custom objects*: Account, Contact, Opportunity, Lead, Case are standard; custom objects end in `__c`.
- *Sales Cloud* (leads, opportunities), *Service Cloud* (cases, knowledge), *Experience Cloud* (portals).
- *Lead conversion* creates an Account, Contact and optionally an Opportunity.

**Data modeling**
- Relationship types: Lookup (loose, optional), Master-Detail (tight, cascade delete, sharing inherited, roll-ups), Many-to-many via a junction object (two master-details), Hierarchical (User only), External lookup.
- Max 2 master-detail per object; up to 40 lookups (default limit).
- Converting lookup → master-detail requires every record to have a value.

**Formulas and validation**
- Formula fields are calculated at read time and are not stored; roll-ups are stored.
- Useful functions: `ISBLANK`, `ISPICKVAL`, `PRIORVALUE`, `ISCHANGED`, `ISNEW`, `REGEX`, `TEXT`, `TODAY`.
- Validation rule fires when the formula is **true** (true = error).

**Data management**
- Data Import Wizard: up to 50,000 records, standard + custom objects, browser-based, dedupe.
- Data Loader: up to 5 million records, insert/update/upsert/delete/export, can be scheduled via CLI.
- Upsert needs an External ID (or the record Id) to match.

**Security (very common in interviews)** — think in layers:
1. **Org**: login hours, IP ranges, MFA.
2. **Object**: Profiles and Permission Sets (CRUD). Best practice: minimal profile + permission sets / permission set groups.
3. **Field**: Field-Level Security.
4. **Record**: OWD (most restrictive baseline) → Role hierarchy (opens up) → Sharing rules (owner- or criteria-based) → Manual sharing → Teams. Apex managed sharing for code.
- Profile: one per user, required. Permission set: many per user, only grants.
- `with sharing` respects record access; `without sharing` ignores it; `inherited sharing` uses the caller's. `WITH USER_MODE` / `as user` also enforce CRUD and FLS.

**Flow**
- Types: Screen flow (UI), Record-triggered (before-save for same-record updates, after-save for related records/actions), Schedule-triggered, Autolaunched (called from Apex/other flows), Platform-event-triggered.
- Workflow Rules and Process Builder are retired: migrate to Flow.
- Order of execution (short): system validation → before-save flows → before triggers → custom validation rules → duplicate rules → save → after triggers → assignment/auto-response rules → after-save flows → roll-ups to parent → commit.

**Apex**
- Governor limits (per synchronous transaction): 100 SOQL queries, 150 DML statements, 50,000 rows queried, 10,000 rows DML, 6 MB heap, 10 s CPU. Async: 200 SOQL, 12 MB heap, 60 s CPU.
- Trigger context variables: `Trigger.new`, `Trigger.old`, `Trigger.newMap`, `Trigger.oldMap`, `Trigger.isInsert`, `Trigger.isBefore`, `Trigger.operationType`.
- Before triggers: change field values on the same record without DML. After triggers: records have Ids; update related records.
- Async options: `@future` (simple, primitives only), Queueable (chaining, objects), Batch (millions of records, `start/execute/finish`), Schedulable (cron).
- 75% code coverage is required to deploy to production; aim to assert behaviour, not just cover lines.
- `Test.startTest()/stopTest()` resets limits and forces async code to finish. `@TestSetup` creates shared data. `System.runAs` tests as another user.
- SOQL vs SOSL: SOQL queries one object (plus relationships); SOSL searches text across many objects.

**LWC**
- Decorators: `@api` (public property), `@wire` (reactive data from Apex/UI API), `@track` (deep reactivity, rarely needed now).
- Calling Apex: `@wire` needs `cacheable=true` and is read-only; use imperative calls for DML, then `refreshApex`.
- Lifecycle hooks: `constructor`, `connectedCallback`, `renderedCallback`, `disconnectedCallback`, `errorCallback`.
- Communication: parent → child via `@api`; child → parent via `CustomEvent`; unrelated components via Lightning Message Service.
- LWC vs Aura: LWC uses web standards, is faster, and is the recommended framework.

**Reports and dashboards**
- Report formats: Tabular, Summary, Matrix, Joined.
- Custom report types control which related objects appear.
- Dashboards run as a specific user or as the logged-in viewer (dynamic dashboards).
- Bucket fields group values without a formula field; cross filters do "with/without" related records.

## Likely scenario questions

1. *"Prevent closing an Opportunity without a Contact Role."* → Validation rules can't see child records; use a before-update trigger, or a roll-up/count field plus a validation rule.
2. *"When an Account's phone changes, update all its Contacts."* → After-save record-triggered flow, or an after-update trigger that bulk-queries Contacts with `WHERE AccountId IN :ids`.
3. *"A user can see a record they shouldn't."* → Check OWD, role hierarchy, sharing rules, manual shares, then profile/permission set "View All".
4. *"Your trigger hits 101 SOQL queries."* → Query is inside a loop. Move it out, collect Ids into a Set, query once, use a Map.
5. *"Process 2 million records nightly."* → Batch Apex with a Schedulable wrapper (exactly what `StalePositionBatch` does).
