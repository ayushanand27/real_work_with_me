# Recruiting App: Salesforce Self-Designed Use Case

The capstone ("Self-Designed Use Case") for the PwC Tekstac **Salesforce** course.
It is one working Salesforce app that uses every module of the syllabus, built around the
same Recruiting App the Trailhead projects use, so the story you tell in the interview is
consistent end to end.

**Business problem.** A hiring team tracks open positions, candidates and interview feedback in
spreadsheets. Duplicate applications slip in, closed roles keep receiving applicants, nobody
knows the average interview score, and stale roles stay open for months. This app fixes that.

## What is in the project, mapped to the syllabus

| Syllabus module | Where it is in this project |
| --- | --- |
| Data Modeling / Schema Builder | 4 custom objects: `Position__c`, `Candidate__c`, `Job_Application__c` (junction), `Review__c`. Master-detail Position → Job Application → Review; lookup Job Application → Candidate. Open **Setup → Schema Builder** to see the diagram. |
| Formulas and Validations | Formulas: `Position__c.Days_Open__c`, `Candidate__c.Full_Name__c`, `Job_Application__c.Average_Rating__c`. Roll-ups: `Number_of_Applications__c`, `Number_of_Reviews__c`, `Total_Rating__c`. 6 validation rules (pay range, manager required, 10-digit phone, rating 1 to 5, experience not negative, hired is final using `PRIORVALUE`). |
| Data Management | `Candidate__c.Email__c` is unique + External ID (use it for upserts in Data Import Wizard / Data Loader). `scripts/apex/seed-data.apex` loads demo data. |
| Lightning Experience Customization | Custom Lightning app **Recruiting**, 4 tabs, page layouts with related lists. |
| Lightning App Builder | `positionPipeline` LWC is exposed for record pages; you drag it onto the Position page (step 5 below). |
| Data Security / User Management | Permission sets **Recruiter** (full CRUD) and **Interviewer** (read-only + write reviews). OWD: Position and Candidate Public Read Only, Job Application and Review Controlled by Parent. Field-level security per field. |
| Flow Builder | `Set Position Open Date`: a before-save record-triggered flow. A screen flow is built by hand in step 7. |
| Apex (Developer Console, Apex basics) | `JobApplicationTrigger` + `JobApplicationTriggerHandler` (duplicate check, closed-position check, auto-close on hire), `StalePositionBatch` (Batch + Schedulable), `RecruitingController` (`@AuraEnabled`, `WITH USER_MODE`). |
| Apex testing | 15 test methods in 4 test classes plus `TestDataFactory`, including a 200-record bulk test and `System.runAs` security tests. |
| Reports and Dashboards | Built by hand in step 6 (it is a common interview demo, so practice it). |
| LWC (bonus) | `positionPipeline`: Kanban board of candidates by stage with Move/Reject buttons, plus 5 Jest tests. |

## How the automation works

1. A recruiter approves a Position. The **flow** stamps `Open_Date__c` with today's date.
2. Candidates apply. The **trigger** sets `Unique_Key__c` = Position Id + Candidate Id and blocks a
   second application from the same candidate, and blocks applications to closed positions.
3. Interviewers add Reviews. Roll-ups count and sum ratings and a formula divides them, because
   roll-up summary fields cannot average.
4. The recruiter moves cards on the **Hiring Pipeline** LWC. When one candidate is marked
   **Hired**, the trigger closes the Position as *Closed - Filled* and rejects every other open
   application. A validation rule stops a hired application from being changed back.
5. Every night the **batch** cancels positions open for 90+ days with zero applications.

## Deploy it to your own org (about 15 minutes)

You need a free org. Use a **Trailhead Playground** (Trailhead → your profile → Hands-on Orgs) or a
**Developer Edition** org from <https://developer.salesforce.com/signup>.

1. **Install tools.** [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) and
   VS Code with the *Salesforce Extension Pack*.
2. **Get the code.**
   ```bash
   git clone https://github.com/ayushanand27/real_work_with_me.git
   cd real_work_with_me/salesforce-prep
   ```
3. **Log in and deploy.**
   ```bash
   sf org login web --alias recruiting --set-default
   sf project deploy start --source-dir force-app --test-level RunLocalTests
   ```
   `RunLocalTests` also runs all Apex tests. To run them again later:
   `sf apex run test --test-level RunLocalTests --code-coverage --result-format human --wait 10`
4. **Give yourself access and load data.** Fields deployed by the Metadata API are hidden until a
   permission set grants them, even for admins.
   ```bash
   sf org assign permset --name Recruiter
   sf apex run --file scripts/apex/seed-data.apex
   sf org open
   ```
   Open the App Launcher and pick **Recruiting**.
5. **Lightning App Builder.** Open any Position → gear icon → **Edit Page** → drag **Position Hiring
   Pipeline** from Custom components onto the page → **Save** → **Activate** → *Assign as Org
   Default* → Save.
6. **Reports and dashboard (by hand).**
   - Setup → Report Types → New: primary object *Positions*, related *Job Applications* (A records
     may or may not have B). Deploy it.
   - Reports → New → *Positions with Job Applications*. Group rows by **Position Title**, then
     **Status**; add a bar chart. Save as *Applications by Position*.
   - Second report on Job Applications: group by **Status**, summarize **Average Rating**.
   - Dashboards → New *Hiring Overview*: a donut from report 2 (by status), a bar chart from report
     1, and a metric of total open positions.
7. **Screen flow (by hand).** Setup → Flows → New → Screen Flow.
   Screen (First Name, Last Name, Email, Position lookup) → *Create Records* Candidate → *Create
   Records* Job Application using the new Candidate Id → confirmation screen. Activate it and add it
   to the Home page with Lightning App Builder (Flow component).
8. **Try the security model.** Create a second user with the *Standard User* profile and assign the
   **Interviewer** permission set. Log in as them: they can read candidates and add reviews but
   cannot edit positions or applications.

## Run the LWC tests locally

```bash
npm install
npm test
```

## Project layout

```
force-app/main/default/
  objects/          Position__c, Candidate__c, Job_Application__c, Review__c (fields + validation rules)
  classes/          trigger handler, batch, LWC controller, tests, TestDataFactory
  triggers/         JobApplicationTrigger
  flows/            Set_Position_Open_Date
  lwc/              positionPipeline (+ Jest tests)
  permissionsets/   Recruiter, Interviewer
  applications/     Recruiting app
  layouts/, tabs/
scripts/apex/seed-data.apex
INTERVIEW_PREP.md   how to present this project + likely questions
```
