/**
 * Nightly clean-up: cancels approved positions that have been open for more
 * than STALE_AFTER_DAYS days without a single application.
 *
 * Run once:      Database.executeBatch(new StalePositionBatch());
 * Schedule 2 AM: System.schedule('Stale positions', '0 0 2 * * ?', new StalePositionBatch());
 */
public with sharing class StalePositionBatch implements Database.Batchable<SObject>, Schedulable {
    public static final Integer STALE_AFTER_DAYS = 90;
    public static final String STATUS_OPEN = 'Open - Approved';
    public static final String STATUS_CANCELLED = 'Closed - Cancelled';

    public Database.QueryLocator start(Database.BatchableContext context) {
        Date cutoff = Date.today().addDays(-STALE_AFTER_DAYS);
        return Database.getQueryLocator(
            [
                SELECT Id, Status__c
                FROM Position__c
                WHERE
                    Status__c = :STATUS_OPEN
                    AND Open_Date__c <= :cutoff
                    AND Number_of_Applications__c = 0
            ]
        );
    }

    public void execute(
        Database.BatchableContext context,
        List<Position__c> scope
    ) {
        for (Position__c position : scope) {
            position.Status__c = STATUS_CANCELLED;
        }
        update scope;
    }

    public void finish(Database.BatchableContext context) {
        System.debug(
            LoggingLevel.INFO,
            'StalePositionBatch finished, job ' + context.getJobId()
        );
    }

    public void execute(SchedulableContext context) {
        Database.executeBatch(new StalePositionBatch(), 200);
    }
}
