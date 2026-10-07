@isTest
private class JobApplicationTriggerTest {

    @TestSetup
    static void setup() {
        insert new Position__c(Name = 'Salesforce Developer', Status__c = 'Open', Open_Date__c = Date.today());
        insert new Candidate__c(First_Name__c = 'Asha', Last_Name__c = 'Rao', Email__c = 'asha@example.com');
    }

    @isTest
    static void firstApplicationSucceeds() {
        Position__c p = [SELECT Id FROM Position__c LIMIT 1];
        Candidate__c c = [SELECT Id FROM Candidate__c LIMIT 1];
        Test.startTest();
        Database.SaveResult r = Database.insert(new Job_Application__c(Position__c = p.Id, Candidate__c = c.Id, Stage__c = 'New'), false);
        Test.stopTest();
        System.assert(r.isSuccess(), 'First application should be saved');
    }

    @isTest
    static void duplicateApplicationIsBlocked() {
        Position__c p = [SELECT Id FROM Position__c LIMIT 1];
        Candidate__c c = [SELECT Id FROM Candidate__c LIMIT 1];
        insert new Job_Application__c(Position__c = p.Id, Candidate__c = c.Id, Stage__c = 'New');
        Test.startTest();
        Database.SaveResult r = Database.insert(new Job_Application__c(Position__c = p.Id, Candidate__c = c.Id, Stage__c = 'New'), false);
        Test.stopTest();
        System.assert(!r.isSuccess(), 'Duplicate should be rejected');
        System.assert(r.getErrors()[0].getMessage().contains('already applied'));
    }

    @isTest
    static void bulkInsert200() {
        Position__c p = [SELECT Id FROM Position__c LIMIT 1];
        List<Candidate__c> cands = new List<Candidate__c>();
        for (Integer i = 0; i < 200; i++) {
            cands.add(new Candidate__c(First_Name__c = 'C' + i, Last_Name__c = 'T', Email__c = 'c' + i + '@example.com'));
        }
        insert cands;
        List<Job_Application__c> apps = new List<Job_Application__c>();
        for (Candidate__c c : cands) {
            apps.add(new Job_Application__c(Position__c = p.Id, Candidate__c = c.Id, Stage__c = 'New'));
        }
        Test.startTest();
        insert apps;
        Test.stopTest();
        System.assertEquals(200, [SELECT COUNT() FROM Job_Application__c WHERE Position__c = :p.Id]);
    }

    @isTest
    static void closeFilledPositionsClosesHired() {
        Position__c p = [SELECT Id FROM Position__c LIMIT 1];
        Candidate__c c = [SELECT Id FROM Candidate__c LIMIT 1];
        insert new Job_Application__c(Position__c = p.Id, Candidate__c = c.Id, Stage__c = 'Hired');
        Test.startTest();
        Integer closed = PositionService.closeFilledPositions();
        Test.stopTest();
        System.assertEquals(1, closed);
        System.assertEquals('Closed', [SELECT Status__c FROM Position__c WHERE Id = :p.Id].Status__c);
    }
}
