/**
 * One trigger per object. All logic lives in JobApplicationTriggerHandler so
 * it can be unit tested and so the order of operations is explicit.
 */
trigger JobApplicationTrigger on Job_Application__c(
    before insert,
    before update,
    after update
) {
    JobApplicationTriggerHandler.run(
        Trigger.operationType,
        Trigger.new,
        Trigger.oldMap
    );
}
