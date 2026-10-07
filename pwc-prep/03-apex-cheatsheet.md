# 3. Apex, SOQL, Triggers, Limits

## Apex basics
Java-like, strongly typed, runs on Salesforce servers, case-insensitive.
```apex
String s = 'Hi'; Integer n = 5; Decimal d = 2.5; Boolean b = true; Date dt = Date.today(); Id recId;
List<String> l = new List<String>{'a','b'};   // ordered, duplicates ok
Set<Integer> st = new Set<Integer>{1,2,2};    // unique, unordered
Map<Id, Account> m = new Map<Id, Account>([SELECT Id, Name FROM Account]);
for (Account a : accs) { ... }                // loop; no DML/SOQL inside loops!
```
- **sObject**: generic record type; `Account a = new Account(Name='X'); insert a;`
- **DML**: insert, update, upsert, delete, undelete, merge. `Database.insert(list, false)` allows partial success.
- **Exceptions**: `try { } catch (DmlException e) { } finally { }`.
- **Access modifiers**: private, public, global, protected. `with sharing` / `without sharing` / `inherited sharing`.
- **Static** vs instance, **constructors**, **interfaces**, **abstract/virtual** classes, `@AuraEnabled`, `@future`, `@isTest`, `@InvocableMethod`.

## SOQL
```sql
SELECT Id, Name, (SELECT LastName FROM Contacts) FROM Account WHERE Industry = 'Tech' AND AnnualRevenue > 1000000 ORDER BY Name LIMIT 10
SELECT COUNT(Id), Industry FROM Account GROUP BY Industry HAVING COUNT(Id) > 5
SELECT Name, Account.Name FROM Contact            -- child -> parent (dot notation)
SELECT Name, (SELECT Name FROM Contacts) FROM Account  -- parent -> child (subquery, plural relationship name)
SELECT Id FROM Account WHERE Id IN :idSet         -- bind variable with :
```
- Custom relationship names end `__r`, e.g. `Position__r.Name`.
- **SOSL**: `FIND 'Acme' IN ALL FIELDS RETURNING Account(Name), Contact(Name)`.
- Use `FOR UPDATE` to lock; `WITH SECURITY_ENFORCED` / `WITH USER_MODE` to respect FLS.

## Triggers
```apex
trigger AccountTrigger on Account (before insert, before update, after insert, after update, before delete, after delete, after undelete) { }
```
- Context variables: `Trigger.new`, `Trigger.old`, `Trigger.newMap`, `Trigger.oldMap`, `Trigger.isBefore/isAfter/isInsert/isUpdate/isDelete`, `Trigger.size`.
- **before**: validate/modify the same record's fields (no DML needed). **after**: record Id available; update *related* records.
- `Trigger.new` is read-only in **after** triggers; `Trigger.old` available only in update/delete.
- **Best practices**: one trigger per object, logic in a handler class, bulkify, no SOQL/DML in loops, use maps, avoid hard-coded IDs, write tests.
- **Recursion** control: static Boolean flag in a helper class.

## Governor limits (per synchronous transaction)
| Limit | Value |
|---|---|
| SOQL queries | 100 (async: 200) |
| Rows returned by SOQL | 50,000 |
| DML statements | 150 |
| Rows processed by DML | 10,000 |
| CPU time | 10,000 ms (async 60,000) |
| Heap size | 6 MB (async 12 MB) |
| Callouts | 100 |
| Future calls | 50 |

## Asynchronous Apex
| Type | Use |
|---|---|
| `@future` | Simple async, callouts after DML; primitives only; no chaining |
| **Queueable** | Like future but accepts objects, can chain jobs, monitor via Id |
| **Batch Apex** (`Database.Batchable`) | Process up to millions of records in chunks (default 200) - `start`, `execute`, `finish` |
| **Schedulable** | Run at a time/cron; often launches a batch |

```apex
global class CleanupBatch implements Database.Batchable<SObject> {
    global Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator('SELECT Id FROM Lead WHERE CreatedDate < LAST_N_DAYS:365');
    }
    global void execute(Database.BatchableContext bc, List<Lead> scope) { delete scope; }
    global void finish(Database.BatchableContext bc) { }
}
// Database.executeBatch(new CleanupBatch(), 200);
```

## Testing
- Min **75%** code coverage overall to deploy to production; each trigger needs some coverage.
- `@isTest`, `Test.startTest()/stopTest()` (resets limits, forces async to complete), `System.assert*`, `@TestSetup`, `System.runAs(user)`, test data created inside the test (not `SeeAllData=true`), `Test.setMock` for callouts.
- Test positive, negative, bulk (200), and different user permissions.

## Order of execution (short)
Load record -> system validation -> **before triggers** -> custom validation rules -> duplicate rules -> save (not committed) -> **after triggers** -> assignment/auto-response/workflow -> **after-save flows** -> roll-up summaries -> commit -> post-commit (emails, async).

## Integration quick notes
- **REST/SOAP API**, **Named Credentials** + `HttpRequest/HttpResponse/Http` for callouts, **Remote Site Settings**, **Platform Events**, **Outbound Messages**, **Apex REST** (`@RestResource`).
- Auth: OAuth 2.0 flows; **Connected App**.

## Common Apex coding questions
1. Bulkify a trigger that updates related contacts when an Account's phone changes.
```apex
trigger AccountPhoneSync on Account (after update) {
    Map<Id, String> phones = new Map<Id, String>();
    for (Account a : Trigger.new) {
        if (a.Phone != Trigger.oldMap.get(a.Id).Phone) phones.put(a.Id, a.Phone);
    }
    if (phones.isEmpty()) return;
    List<Contact> cs = [SELECT Id, AccountId FROM Contact WHERE AccountId IN :phones.keySet()];
    for (Contact c : cs) c.Phone = phones.get(c.AccountId);
    update cs;
}
```
2. Count of Contacts per Account without a roll-up: `SELECT AccountId, COUNT(Id) FROM Contact GROUP BY AccountId` (returns `AggregateResult`).
3. Prevent deleting Accounts that have Opportunities: `before delete` trigger, query Opportunities where `AccountId IN :Trigger.oldMap.keySet()`, `addError` on the account.
4. Difference `List` vs `Set` vs `Map`; `Trigger.new` vs `Trigger.newMap`; `insert` vs `Database.insert`; `before` vs `after`; `Queueable` vs `Future`.
