@IsTest
private class StalePositionBatchTest {
    @IsTest
    static void cancelsOnlyStalePositionsWithoutApplications() {
        Position__c stale = TestDataFactory.createPosition('Open - Approved');
        Position__c busy = TestDataFactory.createPosition('Open - Approved');
        Position__c fresh = TestDataFactory.createPosition('Open - Approved');
        Date longAgo = Date.today().addDays(-120);
        stale.Open_Date__c = longAgo;
        busy.Open_Date__c = longAgo;
        fresh.Open_Date__c = Date.today();
        update new List<Position__c>{ stale, busy, fresh };
        TestDataFactory.createApplications(
            busy,
            TestDataFactory.createCandidates(1)
        );

        Test.startTest();
        Database.executeBatch(new StalePositionBatch());
        Test.stopTest();

        Map<Id, Position__c> results = new Map<Id, Position__c>(
            [SELECT Id, Status__c FROM Position__c]
        );
        Assert.areEqual('Closed - Cancelled', results.get(stale.Id).Status__c);
        Assert.areEqual('Open - Approved', results.get(busy.Id).Status__c);
        Assert.areEqual('Open - Approved', results.get(fresh.Id).Status__c);
    }

    @IsTest
    static void schedulerQueuesTheBatch() {
        Test.startTest();
        String jobId = System.schedule(
            'Stale positions test',
            '0 0 2 * * ?',
            new StalePositionBatch()
        );
        Test.stopTest();

        CronTrigger job = [
            SELECT CronExpression
            FROM CronTrigger
            WHERE Id = :jobId
        ];
        Assert.areEqual('0 0 2 * * ?', job.CronExpression);
    }
}
