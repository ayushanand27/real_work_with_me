@IsTest
private class JobApplicationTriggerHandlerTest {
    @IsTest
    static void hiringClosesPositionAndRejectsOthers() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        List<Job_Application__c> apps = TestDataFactory.createApplications(
            position,
            TestDataFactory.createCandidates(3)
        );

        Test.startTest();
        apps[0].Status__c = 'Hired';
        update apps[0];
        Test.stopTest();

        Position__c refreshed = [
            SELECT Status__c
            FROM Position__c
            WHERE Id = :position.Id
        ];
        Assert.areEqual('Closed - Filled', refreshed.Status__c);
        for (Job_Application__c app : [
            SELECT Id, Status__c
            FROM Job_Application__c
            WHERE Position__c = :position.Id
        ]) {
            String expected = app.Id == apps[0].Id ? 'Hired' : 'Rejected';
            Assert.areEqual(expected, app.Status__c);
        }
    }

    @IsTest
    static void duplicateApplicationIsBlocked() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        List<Candidate__c> candidates = TestDataFactory.createCandidates(1);
        TestDataFactory.createApplications(position, candidates);

        Job_Application__c duplicate = new Job_Application__c(
            Position__c = position.Id,
            Candidate__c = candidates[0].Id
        );
        Test.startTest();
        Database.SaveResult result = Database.insert(duplicate, false);
        Test.stopTest();

        Assert.isFalse(result.isSuccess());
        Assert.areEqual(
            JobApplicationTriggerHandler.DUPLICATE_ERROR,
            result.getErrors()[0].getMessage()
        );
    }

    @IsTest
    static void duplicateInSameInsertIsBlocked() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        Candidate__c candidate = TestDataFactory.createCandidates(1)[0];
        List<Job_Application__c> apps = new List<Job_Application__c>{
            new Job_Application__c(
                Position__c = position.Id,
                Candidate__c = candidate.Id
            ),
            new Job_Application__c(
                Position__c = position.Id,
                Candidate__c = candidate.Id
            )
        };

        Test.startTest();
        List<Database.SaveResult> results = Database.insert(apps, false);
        Test.stopTest();

        Assert.isTrue(results[0].isSuccess());
        Assert.isFalse(results[1].isSuccess());
    }

    @IsTest
    static void closedPositionRejectsNewApplications() {
        Position__c position = TestDataFactory.createPosition(
            'Closed - Cancelled'
        );
        Candidate__c candidate = TestDataFactory.createCandidates(1)[0];

        Test.startTest();
        Database.SaveResult result = Database.insert(
            new Job_Application__c(
                Position__c = position.Id,
                Candidate__c = candidate.Id
            ),
            false
        );
        Test.stopTest();

        Assert.isFalse(result.isSuccess());
        Assert.areEqual(
            JobApplicationTriggerHandler.CLOSED_POSITION_ERROR,
            result.getErrors()[0].getMessage()
        );
    }

    @IsTest
    static void bulkInsertOf200Applications() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        List<Candidate__c> candidates = TestDataFactory.createCandidates(200);

        Test.startTest();
        TestDataFactory.createApplications(position, candidates);
        Test.stopTest();

        Position__c refreshed = [
            SELECT Number_of_Applications__c
            FROM Position__c
            WHERE Id = :position.Id
        ];
        Assert.areEqual(200, refreshed.Number_of_Applications__c);
    }
}
