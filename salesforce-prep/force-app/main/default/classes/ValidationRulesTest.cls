@IsTest
private class ValidationRulesTest {
    @IsTest
    static void maxPayCannotBeBelowMinPay() {
        Position__c position = new Position__c(
            Name = 'Analyst',
            Min_Pay__c = 500000,
            Max_Pay__c = 400000
        );
        Database.SaveResult result = Database.insert(position, false);
        Assert.isFalse(result.isSuccess());
    }

    @IsTest
    static void approvedPositionNeedsHiringManager() {
        Position__c position = new Position__c(
            Name = 'Analyst',
            Status__c = 'Open - Approved'
        );
        Database.SaveResult result = Database.insert(position, false);
        Assert.isFalse(result.isSuccess());
    }

    @IsTest
    static void ratingMustBeOneToFive() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        Job_Application__c app = TestDataFactory.createApplications(
            position,
            TestDataFactory.createCandidates(1)
        )[0];
        Database.SaveResult result = Database.insert(
            new Review__c(Job_Application__c = app.Id, Rating__c = 6),
            false
        );
        Assert.isFalse(result.isSuccess());
    }

    @IsTest
    static void averageRatingIsCalculated() {
        Position__c position = TestDataFactory.createPosition(
            'Open - Approved'
        );
        Job_Application__c app = TestDataFactory.createApplications(
            position,
            TestDataFactory.createCandidates(1)
        )[0];
        insert new List<Review__c>{
            new Review__c(Job_Application__c = app.Id, Rating__c = 4),
            new Review__c(Job_Application__c = app.Id, Rating__c = 5)
        };
        Job_Application__c refreshed = [
            SELECT Average_Rating__c, Number_of_Reviews__c
            FROM Job_Application__c
            WHERE Id = :app.Id
        ];
        Assert.areEqual(2, refreshed.Number_of_Reviews__c);
        Assert.areEqual(4.5, refreshed.Average_Rating__c);
    }

    @IsTest
    static void phoneMustHaveTenDigits() {
        Database.SaveResult bad = Database.insert(
            new Candidate__c(
                Last_Name__c = 'Sharma',
                Email__c = 'bad.phone@example.com',
                Phone__c = '12345'
            ),
            false
        );
        Database.SaveResult good = Database.insert(
            new Candidate__c(
                Last_Name__c = 'Sharma',
                Email__c = 'good.phone@example.com',
                Phone__c = '+91 9876543210'
            ),
            false
        );
        Assert.isFalse(bad.isSuccess());
        Assert.isTrue(good.isSuccess());
    }
}
