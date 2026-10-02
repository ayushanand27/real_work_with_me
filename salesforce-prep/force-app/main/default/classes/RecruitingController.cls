/**
 * Apex controller for the positionPipeline Lightning Web Component.
 * Queries and DML run in user mode so object, field and sharing security
 * of the logged-in user are always enforced.
 */
public with sharing class RecruitingController {
    @AuraEnabled(cacheable=true)
    public static List<Job_Application__c> getApplications(Id positionId) {
        return [
            SELECT
                Id,
                Name,
                Status__c,
                Average_Rating__c,
                Number_of_Reviews__c,
                Candidate__c,
                Candidate__r.Full_Name__c,
                Candidate__r.Email__c
            FROM Job_Application__c
            WHERE Position__c = :positionId
            WITH USER_MODE
            ORDER BY CreatedDate
        ];
    }

    @AuraEnabled
    public static void updateStatus(Id applicationId, String status) {
        try {
            update as user new Job_Application__c(
                Id = applicationId,
                Status__c = status
            );
        } catch (DmlException e) {
            AuraHandledException error = new AuraHandledException(
                e.getDmlMessage(0)
            );
            error.setMessage(e.getDmlMessage(0));
            throw error;
        }
    }
}
