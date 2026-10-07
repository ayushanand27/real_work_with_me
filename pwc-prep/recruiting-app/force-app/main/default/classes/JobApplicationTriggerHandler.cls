public with sharing class JobApplicationTriggerHandler {

    // Blocks a candidate from applying to the same position twice.
    public static void preventDuplicates(List<Job_Application__c> newApps) {
        Set<Id> positionIds = new Set<Id>();
        Set<Id> candidateIds = new Set<Id>();
        for (Job_Application__c a : newApps) {
            positionIds.add(a.Position__c);
            candidateIds.add(a.Candidate__c);
        }

        // One query for the whole batch (bulk-safe).
        Set<String> existingKeys = new Set<String>();
        for (Job_Application__c e : [
            SELECT Position__c, Candidate__c
            FROM Job_Application__c
            WHERE Position__c IN :positionIds AND Candidate__c IN :candidateIds
        ]) {
            existingKeys.add(key(e.Position__c, e.Candidate__c));
        }

        Set<String> seenInBatch = new Set<String>();
        for (Job_Application__c a : newApps) {
            String k = key(a.Position__c, a.Candidate__c);
            if (existingKeys.contains(k) || !seenInBatch.add(k)) {
                a.addError('This candidate has already applied for this position.');
            }
        }
    }

    private static String key(Id positionId, Id candidateId) {
        return String.valueOf(positionId) + '-' + String.valueOf(candidateId);
    }
}
