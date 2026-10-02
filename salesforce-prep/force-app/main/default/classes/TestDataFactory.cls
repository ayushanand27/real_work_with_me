/**
 * Builds test records so every test class creates data the same way.
 */
@IsTest
public class TestDataFactory {
    /**
     * A Standard User with the Recruiter permission set. Use it with
     * System.runAs to test code that runs in user mode (CRUD, FLS, sharing).
     */
    public static User createRecruiterUser() {
        Profile standardProfile = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Standard User'
        ];
        String unique = String.valueOf(Crypto.getRandomInteger()).remove('-');
        User recruiter = new User(
            ProfileId = standardProfile.Id,
            LastName = 'Recruiter',
            Alias = 'recr',
            Email = 'recruiter' + unique + '@example.com',
            Username = 'recruiter' + unique + '@recruiting-app.test',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_IN',
            TimeZoneSidKey = 'Asia/Kolkata'
        );
        insert recruiter;
        insert new PermissionSetAssignment(
            AssigneeId = recruiter.Id,
            PermissionSetId = [
                SELECT Id
                FROM PermissionSet
                WHERE Name = 'Recruiter'
            ]
            .Id
        );
        return recruiter;
    }

    public static Position__c createPosition(String status) {
        Position__c position = new Position__c(
            Name = 'Salesforce Developer',
            Status__c = status,
            Department__c = 'Technology',
            Location__c = 'Bengaluru',
            Min_Pay__c = 600000,
            Max_Pay__c = 1200000,
            Hiring_Manager__c = UserInfo.getUserId()
        );
        insert position;
        return position;
    }

    public static List<Candidate__c> createCandidates(Integer count) {
        List<Candidate__c> candidates = new List<Candidate__c>();
        for (Integer i = 0; i < count; i++) {
            candidates.add(
                new Candidate__c(
                    First_Name__c = 'Test',
                    Last_Name__c = 'Candidate ' + i,
                    Email__c = 'candidate' + i + '@example.com',
                    Years_of_Experience__c = i
                )
            );
        }
        insert candidates;
        return candidates;
    }

    public static List<Job_Application__c> createApplications(
        Position__c position,
        List<Candidate__c> candidates
    ) {
        List<Job_Application__c> apps = new List<Job_Application__c>();
        for (Candidate__c candidate : candidates) {
            apps.add(
                new Job_Application__c(
                    Position__c = position.Id,
                    Candidate__c = candidate.Id,
                    Status__c = 'New'
                )
            );
        }
        insert apps;
        return apps;
    }
}
