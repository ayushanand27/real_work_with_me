# 2. Project: Recruiting App (build this in your Developer Org)

This is the project the Tekstac course lists ("Build a Data Model for Recruiting App", "Keep Data Secure", "Improve Data Quality", "Customize the UI", "Automate Business Process", "Reports and Dashboards"), plus an Apex layer. Build all of it yourself, tonight and tomorrow. Then you can truthfully say "I built this".

**One-line pitch:** *A Salesforce app that lets a recruiting team manage job positions, candidates and applications end to end, with security, data-quality rules, automation, reports and Apex.*

## Step 1: Data model (Setup > Object Manager, or Schema Builder)
Create custom objects:

| Object | Fields |
|---|---|
| **Position__c** | Name (text), Job_Description__c (long text), Location__c (text), Department__c (picklist), Status__c (picklist: Open, Closed, On Hold), Min_Salary__c, Max_Salary__c (currency), Open_Date__c, Close_Date__c (date), Number_of_Applications__c (**roll-up** COUNT of Job Applications) |
| **Candidate__c** | First_Name__c, Last_Name__c, Email__c (email, **unique**), Phone__c, Current_Company__c, Years_Experience__c (number), Skills__c (multi-picklist), Full_Name__c (formula) |
| **Job_Application__c** (junction) | Position__c (**master-detail**), Candidate__c (**master-detail**), Stage__c (picklist: New, Screening, Interview, Offer, Hired, Rejected), Applied_Date__c, Expected_Salary__c |
| **Review__c** | Job_Application__c (master-detail), Rating__c (number 1-5), Comments__c (long text) |

**Why this matters (be ready to say):** Job_Application is a *junction object* creating a **many-to-many** between Position and Candidate. Review is a child of Job Application. Roll-up summary works because of master-detail.

## Step 2: Create the app
App Manager > New Lightning App "Recruiting"; add tabs for the 4 objects + Reports + Dashboards. Create Tabs for each object first (Setup > Tabs).

## Step 3: Formulas & validation rules (data quality)
- `Candidate__c.Full_Name__c` formula: `First_Name__c & " " & Last_Name__c`
- Validation on Position: **Max salary >= Min salary**
  `Max_Salary__c < Min_Salary__c` -> "Max salary must be greater than or equal to min salary."
- Validation: **Close date after open date**
  `AND(NOT(ISBLANK(Close_Date__c)), Close_Date__c < Open_Date__c)`
- Validation: closed positions need a close date
  `AND(ISPICKVAL(Status__c,"Closed"), ISBLANK(Close_Date__c))`
- Candidate email uniqueness (field setting "Unique") + **Duplicate rule** (Setup > Duplicate Rules) matching on Email.
- Required fields via page layout and validation.

## Step 4: Load data
Create a CSV of 10-15 sample candidates and positions; import with **Data Import Wizard** (or Data Loader). Be able to explain Wizard vs Data Loader.

## Step 5: Security
- OWD: Position = Public Read Only, Candidate = **Private**, Job Application = Controlled by Parent.
- Roles: Recruiting Director > Recruiting Manager > Recruiter. Create 2-3 test users.
- Profile: clone Standard User -> "Recruiter"; give CRUD only on the recruiting objects.
- Permission Set: "Salary Viewer" granting access to Expected_Salary__c / salary fields (so only HR/managers see salary via **field-level security**).
- Sharing rule: share Candidate records owned by Recruiters role with Managers (or HR group).
- Test with **Login As** to show different views.

## Step 6: UI customization
- Page Layouts per profile; compact layout; **Record Types** (e.g. Position: Technical / Non-Technical) with different picklists.
- **Lightning App Builder**: custom Record Page for Position: header highlights, tabs (Details, Related), Related List "Job Applications", **dynamic forms**/component visibility (show salary section only if user has the permission).
- Create a custom Home page with a Rich-text component and Report chart.
- **List Views** for Open Positions; **Path** on Job Application Stage__c (guidance for each stage).

## Step 7: Reports and dashboards
- Report 1: Positions by Status (Summary).
- Report 2: Applications by Stage per Position (Matrix) using report type "Positions with Job Applications".
- Report 3: Average Review rating per Candidate.
- Dashboard "Recruiting Overview": donut (Positions by status), bar (Applications by stage), table (Top candidates by rating), gauge (hire rate). Mention **running user**.

## Step 8: Automation (Flow)
1. **Record-triggered flow** (after save) on Job_Application__c when Stage__c changes to **Hired**: update Position__c.Status__c = "Closed" and set Close_Date__c = TODAY; send email alert to the recruiter. 
2. **Record-triggered flow** (before save) on Job_Application__c create: default Applied_Date__c = TODAY.
3. **Screen flow** "Quick Apply": user picks a Position, enters Candidate details; flow does Get Records to check if a candidate with same email exists (reuse), else Create Candidate; then Create Job Application; ends on a confirmation screen. Add the flow to the Position record page as a button or Lightning page component.
4. **Approval process** (optional): offer approval for Offer stage when Expected_Salary__c > some limit.
- Mention: no DML/Get Records inside loops, add Fault paths, test in Debug mode.

## Step 9: Apex layer (this separates you from "admin only" candidates)
Code is in `recruiting-app/force-app/main/default/`:
- `JobApplicationTriggerHandler.cls` + `JobApplicationTrigger.trigger`: **prevents duplicate applications** (same candidate applying to the same position twice) and bulk-safe.
- `PositionService.cls`: `closeFilledPositions()` plus an `@AuraEnabled` method to get open positions with application counts (used in a future LWC).
- `JobApplicationTriggerTest.cls`: test class with positive, negative and bulk (200 records) tests, 75%+ coverage is required to deploy.
Deploy via Developer Console: File > New > Apex Class / Apex Trigger, paste code, Run Tests (Test > New Run).

## How to explain it in the interview (2 min script)
> "I built a Recruiting app on Salesforce to manage the hiring pipeline. The data model has Position and Candidate connected through a Job Application junction object — a many-to-many using two master-detail relationships — with Review as a child of Application. I used a roll-up summary to count applications per position. For data quality I added validation rules (salary range, close date), a unique email and duplicate rules. For security I set OWD for Candidate to Private, built roles and a recruiter profile, and used a permission set with field-level security for salary. For the UI I used Lightning App Builder, record types and Path. Automation is done with Flow: a record-triggered flow closes the position when an application is marked Hired, and a screen flow handles quick applications. I also wrote an Apex trigger with a handler class to block duplicate applications, bulkified, with a test class covering single and 200-record cases. Finally I created reports and a dashboard for the recruiting manager."

## Likely follow-up questions on the project
- *Why master-detail for Job Application?* To get the roll-up summary and cascade delete; the junction is the many-to-many.
- *Why a trigger instead of a validation rule or unique field?* A duplicate across two fields needs a composite key; alternative = a text field `Unique_Key__c` (Position Id + Candidate Id) marked unique, which is simpler and I'd mention it as a declarative option.
- *How did you bulkify?* Collect IDs into Sets, one SOQL query outside loops, Map lookups, single DML.
- *What would you improve?* LWC for the application form, integration with LinkedIn/email, Einstein scoring, scheduled flow to remind reviewers.
- *How do you deploy it?* Change set / SFDX from sandbox to production.
