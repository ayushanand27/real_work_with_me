// Sample data for demos. Run with:
//   sf apex run --file scripts/apex/seed-data.apex
// or paste into Developer Console > Debug > Open Execute Anonymous Window.
Id me = UserInfo.getUserId();

List<Position__c> positions = new List<Position__c>{
    new Position__c(Name = 'Salesforce Developer', Status__c = 'Open - Approved', Department__c = 'Technology',
        Location__c = 'Bengaluru', Min_Pay__c = 600000, Max_Pay__c = 1200000, Hiring_Manager__c = me),
    new Position__c(Name = 'Associate - Assurance', Status__c = 'Open - Approved', Department__c = 'Assurance',
        Location__c = 'Kolkata', Min_Pay__c = 450000, Max_Pay__c = 700000, Hiring_Manager__c = me),
    new Position__c(Name = 'Tax Consultant', Status__c = 'New', Department__c = 'Tax',
        Location__c = 'Mumbai', Min_Pay__c = 500000, Max_Pay__c = 900000)
};
insert positions;

List<String> firstNames = new List<String>{ 'Asha', 'Vikram', 'Neha', 'Rohan', 'Priya', 'Arjun' };
List<String> lastNames = new List<String>{ 'Rao', 'Shah', 'Iyer', 'Gupta', 'Nair', 'Mehta' };
List<Candidate__c> candidates = new List<Candidate__c>();
for (Integer i = 0; i < firstNames.size(); i++) {
    candidates.add(new Candidate__c(First_Name__c = firstNames[i], Last_Name__c = lastNames[i],
        Email__c = firstNames[i].toLowerCase() + '.' + lastNames[i].toLowerCase() + '@example.com',
        Phone__c = '98765432' + String.valueOf(10 + i), Years_of_Experience__c = i + 1));
}
insert candidates;

List<String> statuses = new List<String>{ 'New', 'Screening', 'Interviewing', 'Interviewing', 'Offer Extended', 'New' };
List<Job_Application__c> apps = new List<Job_Application__c>();
for (Integer i = 0; i < candidates.size(); i++) {
    apps.add(new Job_Application__c(Position__c = positions[Math.mod(i, 2)].Id,
        Candidate__c = candidates[i].Id, Status__c = statuses[i]));
}
insert apps;

insert new List<Review__c>{
    new Review__c(Job_Application__c = apps[2].Id, Rating__c = 4, Assessment__c = 'Strong Apex fundamentals.'),
    new Review__c(Job_Application__c = apps[2].Id, Rating__c = 5, Assessment__c = 'Great communication.'),
    new Review__c(Job_Application__c = apps[4].Id, Rating__c = 3, Assessment__c = 'Needs more Flow experience.')
};
System.debug('Seeded ' + positions.size() + ' positions, ' + candidates.size() + ' candidates, ' + apps.size() + ' applications.');
