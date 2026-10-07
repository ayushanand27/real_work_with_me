# 1. Salesforce Concepts + Interview Q&A

## 1. Platform basics
- **Salesforce** = cloud (SaaS + PaaS) CRM platform. Multi-tenant, metadata-driven: your customizations are stored as metadata, and the platform runs shared code for all orgs.
- **Clouds**: Sales, Service, Marketing, Commerce, Experience (communities), Platform (Force.com).
- **Editions**: Developer (free, for learning), Professional, Enterprise, Unlimited.
- **Lightning Experience** = the modern UI; **Lightning Web Components (LWC)** = modern UI framework (JS); Aura = older.
- **Standard objects**: Account, Contact, Lead, Opportunity, Case, Campaign, Product, User. **Custom objects** end in `__c`.
- **Lead -> Convert -> Account + Contact + Opportunity.**
- **Sandbox** (dev/test copy of prod) vs **Production** vs **Developer org**. Deploy with Change Sets, SFDX/CLI, or DevOps tools.
- **MVC**: Model = objects/fields, View = Lightning pages/LWC/Visualforce, Controller = Apex/Flow.

## 2. Data model
| Relationship | Notes |
|---|---|
| Lookup | Loose link; child can exist without parent; optional; no roll-up summary |
| Master-Detail | Tight; child inherits owner/sharing from parent; deleting parent deletes child (cascade); supports roll-up summary fields; parent required |
| Many-to-Many | Junction object with **two master-detail** fields (e.g. Job Application between Position and Candidate) |
| Hierarchical | Lookup to same object (User only) |
| External lookup / Indirect lookup | For external objects |

- Field types: Text, Number, Currency, Picklist, Multi-select picklist, Checkbox, Date, Formula, Roll-up Summary, Auto Number, Lookup, Master-detail.
- **Schema Builder**: drag-and-drop visual tool to create objects/fields.
- **Record Types**: different business processes / picklist values / page layouts for the same object.
- **Page Layouts** (which fields the user sees) vs **Field-Level Security** (whether the user can see/edit a field at all).
- **Formula fields** are read-only, calculated on view. **Roll-up summary**: COUNT/SUM/MIN/MAX on child records, master-detail only.
- **Validation rule**: formula returning TRUE = error. Example: `AND(ISPICKVAL(Status__c,"Closed"), ISBLANK(Close_Date__c))`.

## 3. Security (very commonly asked)
Layers, outermost to innermost:
1. **Org level**: login hours, IP ranges, MFA.
2. **Object level**: Profiles + Permission Sets (CRUD).
3. **Field level**: Field-Level Security.
4. **Record level**: 
   - **OWD** (Org-Wide Defaults): Private, Public Read Only, Public Read/Write, Controlled by Parent. Most restrictive baseline.
   - **Role hierarchy**: opens access *upwards*.
   - **Sharing rules**: open access *sideways* (criteria or owner based).
   - **Manual sharing**, **Teams**, **Apex managed sharing**.
- You can **only open up** access beyond OWD, never restrict below it.
- **Profile**: one per user (base access). **Permission Set / Permission Set Group**: additive extras. Best practice: minimal-access profile + permission sets.
- Q: *Difference between Role and Profile?* Profile = what you can do (object/field/app/system permissions). Role = what records you can see (hierarchy).

## 4. Automation (Flow is the future)
- **Workflow Rules and Process Builder are retired/legacy; use Flow.**
- **Flow types**:
  - *Screen Flow*: user-guided UI (wizards).
  - *Record-Triggered Flow*: runs on create/update/delete; before-save (fast, update same record) or after-save (related records, emails, actions).
  - *Schedule-Triggered Flow*: batch at a time.
  - *Autolaunched Flow*: called from Apex/other flows/buttons.
- Elements: Get Records, Create/Update/Delete Records, Decision, Assignment, Loop, Screen, Action, Subflow. Variables, collections, `{!$Record}` global variable.
- Best practice: **bulkify** flows (no DML/Get Records inside Loops), add fault paths.
- **Approval Process**: multi-step approvals. **Validation rules**, **Assignment rules**, **Escalation rules** (Cases), **Email alerts**.
- Declarative first ("clicks before code"): use Flow if it can do the job; Apex if complex logic, bulk/performance, or integrations.

## 5. Reports & dashboards
- Report types: Tabular, Summary, Matrix, Joined. Filters, groupings, **bucket fields**, **cross filters**, summary formulas.
- Dashboard = visual of report(s): chart, gauge, metric, table. **Dashboard running user** decides what data the viewers see (dynamic dashboards = run as logged-in user).
- **Report Type**: defines which objects/relationships can be reported (primary object with/without child).

## 6. Data management
- **Data Import Wizard** (up to 50k records, standard objects & custom objects), **Data Loader** (up to 5 million, insert/update/upsert/delete/export, CSV), **Dataloader.io**.
- **External ID** for upsert. **Duplicate rules + Matching rules** for data quality.
- Recycle bin, hard delete, Data Export (backup).

## 7. Rapid-fire Q&A (answer each in 2–3 lines)
1. **What is multi-tenancy?** Many customers share one infrastructure/instance, data logically isolated; enforced with governor limits.
2. **What is a governor limit and why?** Runtime limits (e.g. 100 SOQL queries, 150 DML per transaction) so one tenant can't monopolize shared resources.
3. **Lookup vs Master-Detail?** See table above.
4. **Can a junction object have 2 lookups?** Yes but then it's not a true M-D junction (no roll-up/cascade). Normally 2 master-detail.
5. **What is a Sandbox? Types?** Developer, Developer Pro, Partial Copy, Full.
6. **What is an App / Tab / Page Layout / Record Type / Lightning Page?**
7. **Profile vs Permission Set?** Profile is the baseline (one per user), perm sets are additive.
8. **What is Sharing Rule?** Grants access beyond OWD to groups/roles/queues based on owner or criteria.
9. **What is SOQL vs SOSL?** SOQL queries one object (+ related) with filters; SOSL searches text across multiple objects.
10. **Trigger vs Flow?** Flow first; trigger if logic is complex or needs high bulk performance/fine control.
11. **What is the Order of Execution?** System validation -> before triggers -> custom validation -> duplicate rules -> save -> after triggers -> assignment/auto-response/workflow -> record-triggered flows (after) -> rollup recalculation -> commit.
12. **What is a Wrapper class?** A custom class that bundles multiple values (e.g. record + checkbox) to return to a UI.
13. **What is a Custom Metadata Type vs Custom Setting?** CMT records are deployable metadata; custom settings are data (not deployable).
14. **What is LWC?** Component framework using standard web tech (JS, HTML, CSS); `@api`, `@wire`, `@track`.
15. **What's the difference between `with sharing` and `without sharing`?** Whether Apex enforces the running user's record-level sharing.
16. **What is Salesforce DX?** Source-driven development model (VS Code, CLI, scratch orgs, version control).
17. **What's an Email-to-Case / Web-to-Lead?** Standard features that create Cases/Leads from emails/web forms.
18. **What is a Connected App / Named Credential / REST API?** Integration building blocks: OAuth config / secure endpoint storage / REST access to data.
19. **Roll-up summary on lookup?** Not natively (use Flow/Apex or DLRS).
20. **What's the difference between Delete and Hard Delete?** Recycle bin (15 days) vs permanent.

## 8. Quick facts to remember
- Field limit: 500 custom fields per object (Enterprise). Max 40 roll-up summaries per object. 
- Master-detail limit: 2 per object. Lookup: 40 relationships total per object.
- Salesforce releases: 3 per year (Spring, Summer, Winter).
- Certifications to mention as goals: Salesforce Administrator (ADM-201), Platform App Builder, Platform Developer I.
