/**
 * Business rules for Job_Application__c.
 *
 * before insert : block applications to closed positions, block duplicates
 * before update : block duplicates if the position or candidate changes
 * after update  : when an application is Hired, mark the position
 *                 Closed - Filled and reject every other open application
 *
 * Declared without sharing on purpose: the hiring automation must close the
 * position and reject competing applications even when the recruiter who
 * clicks "Hired" cannot see every one of those records.
 */
public without sharing class JobApplicationTriggerHandler {
    public static final String STATUS_HIRED = 'Hired';
    public static final String STATUS_REJECTED = 'Rejected';
    public static final String POSITION_FILLED = 'Closed - Filled';
    public static final Set<String> CLOSED_POSITION_STATUSES = new Set<String>{
        'Closed - Filled',
        'Closed - Cancelled'
    };
    private static final Set<String> FINAL_STATUSES = new Set<String>{
        STATUS_HIRED,
        STATUS_REJECTED
    };
    public static final String DUPLICATE_ERROR = 'This candidate has already applied for this position.';
    public static final String CLOSED_POSITION_ERROR = 'This position is closed and is not accepting applications.';

    public static void run(
        System.TriggerOperation operation,
        List<Job_Application__c> newList,
        Map<Id, Job_Application__c> oldMap
    ) {
        switch on operation {
            when BEFORE_INSERT {
                blockClosedPositions(newList);
                preventDuplicates(newList, null);
            }
            when BEFORE_UPDATE {
                preventDuplicates(newList, oldMap);
            }
            when AFTER_UPDATE {
                handleHires(newList, oldMap);
            }
        }
    }

    @TestVisible
    private static String buildKey(Job_Application__c app) {
        return String.valueOf(app.Position__c) +
            '-' +
            String.valueOf(app.Candidate__c);
    }

    private static void blockClosedPositions(List<Job_Application__c> apps) {
        Set<Id> positionIds = new Set<Id>();
        for (Job_Application__c app : apps) {
            positionIds.add(app.Position__c);
        }
        Map<Id, Position__c> positions = new Map<Id, Position__c>(
            [SELECT Id, Status__c FROM Position__c WHERE Id IN :positionIds]
        );
        for (Job_Application__c app : apps) {
            Position__c position = positions.get(app.Position__c);
            if (
                position != null &&
                CLOSED_POSITION_STATUSES.contains(position.Status__c)
            ) {
                app.Position__c.addError(CLOSED_POSITION_ERROR);
            }
        }
    }

    private static void preventDuplicates(
        List<Job_Application__c> apps,
        Map<Id, Job_Application__c> oldMap
    ) {
        Map<String, Job_Application__c> appsByKey = new Map<String, Job_Application__c>();
        for (Job_Application__c app : apps) {
            String key = buildKey(app);
            Boolean keyUnchanged =
                oldMap != null &&
                oldMap.get(app.Id).Unique_Key__c == key;
            app.Unique_Key__c = key;
            if (keyUnchanged) {
                continue;
            }
            if (appsByKey.containsKey(key)) {
                // Same candidate twice for one position in a single insert.
                app.addError(DUPLICATE_ERROR);
            } else {
                appsByKey.put(key, app);
            }
        }
        if (appsByKey.isEmpty()) {
            return;
        }
        for (Job_Application__c existing : [
            SELECT Unique_Key__c
            FROM Job_Application__c
            WHERE Unique_Key__c IN :appsByKey.keySet()
        ]) {
            appsByKey.get(existing.Unique_Key__c).addError(DUPLICATE_ERROR);
        }
    }

    private static void handleHires(
        List<Job_Application__c> apps,
        Map<Id, Job_Application__c> oldMap
    ) {
        Set<Id> filledPositionIds = new Set<Id>();
        Set<Id> hiredAppIds = new Set<Id>();
        for (Job_Application__c app : apps) {
            Boolean becameHired =
                app.Status__c == STATUS_HIRED &&
                oldMap.get(app.Id).Status__c != STATUS_HIRED;
            if (becameHired) {
                filledPositionIds.add(app.Position__c);
                hiredAppIds.add(app.Id);
            }
        }
        if (filledPositionIds.isEmpty()) {
            return;
        }

        List<Position__c> positionsToClose = new List<Position__c>();
        for (Id positionId : filledPositionIds) {
            positionsToClose.add(
                new Position__c(Id = positionId, Status__c = POSITION_FILLED)
            );
        }

        List<Job_Application__c> competingApps = [
            SELECT Id
            FROM Job_Application__c
            WHERE
                Position__c IN :filledPositionIds
                AND Id NOT IN :hiredAppIds
                AND Status__c NOT IN :FINAL_STATUSES
        ];
        for (Job_Application__c competing : competingApps) {
            competing.Status__c = STATUS_REJECTED;
        }

        update positionsToClose;
        update competingApps;
    }
}
