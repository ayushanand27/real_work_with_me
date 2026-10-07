public with sharing class PositionService {

    // Closes any open position that has at least one Hired application.
    public static Integer closeFilledPositions() {
        Set<Id> filledIds = new Set<Id>();
        for (Job_Application__c a : [
            SELECT Position__c FROM Job_Application__c
            WHERE Stage__c = 'Hired' AND Position__r.Status__c = 'Open'
        ]) {
            filledIds.add(a.Position__c);
        }
        List<Position__c> toClose = new List<Position__c>();
        for (Id pid : filledIds) {
            toClose.add(new Position__c(Id = pid, Status__c = 'Closed', Close_Date__c = Date.today()));
        }
        update toClose;
        return toClose.size();
    }

    // Used later by an LWC: open positions with their application counts.
    @AuraEnabled(cacheable=true)
    public static List<Position__c> getOpenPositions() {
        return [
            SELECT Id, Name, Location__c, Department__c, Number_of_Applications__c
            FROM Position__c
            WHERE Status__c = 'Open'
            ORDER BY Open_Date__c DESC
            LIMIT 50
        ];
    }
}
