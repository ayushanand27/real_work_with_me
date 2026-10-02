/**
 * The controller runs in user mode, so these tests run as a Standard User
 * with the Recruiter permission set to prove the security model works.
 */
@IsTest
private class RecruitingControllerTest {
    @IsTest
    static void returnsApplicationsForPosition() {
        System.runAs(TestDataFactory.createRecruiterUser()) {
            Position__c position = TestDataFactory.createPosition(
                'Open - Approved'
            );
            TestDataFactory.createApplications(
                position,
                TestDataFactory.createCandidates(2)
            );

            Test.startTest();
            List<Job_Application__c> apps = RecruitingController.getApplications(
                position.Id
            );
            Test.stopTest();

            Assert.areEqual(2, apps.size());
            Set<String> names = new Set<String>();
            for (Job_Application__c app : apps) {
                names.add(app.Candidate__r.Full_Name__c);
            }
            Assert.isTrue(names.contains('Test Candidate 0'));
            Assert.isTrue(names.contains('Test Candidate 1'));
        }
    }

    @IsTest
    static void updatesStatus() {
        System.runAs(TestDataFactory.createRecruiterUser()) {
            Position__c position = TestDataFactory.createPosition(
                'Open - Approved'
            );
            Job_Application__c app = TestDataFactory.createApplications(
                position,
                TestDataFactory.createCandidates(1)
            )[0];

            Test.startTest();
            RecruitingController.updateStatus(app.Id, 'Screening');
            Test.stopTest();

            Assert.areEqual(
                'Screening',
                [SELECT Status__c FROM Job_Application__c WHERE Id = :app.Id]
                .Status__c
            );
        }
    }

    @IsTest
    static void surfacesValidationErrors() {
        System.runAs(TestDataFactory.createRecruiterUser()) {
            Position__c position = TestDataFactory.createPosition(
                'Open - Approved'
            );
            List<Job_Application__c> apps = TestDataFactory.createApplications(
                position,
                TestDataFactory.createCandidates(1)
            );
            apps[0].Status__c = 'Hired';
            update apps;

            Test.startTest();
            try {
                RecruitingController.updateStatus(apps[0].Id, 'Screening');
                Assert.fail(
                    'Expected the Hired_Is_Final validation rule to fire'
                );
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('already hired'));
            }
            Test.stopTest();
        }
    }
}
