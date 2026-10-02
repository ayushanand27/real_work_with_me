import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getApplications from '@salesforce/apex/RecruitingController.getApplications';
import updateStatus from '@salesforce/apex/RecruitingController.updateStatus';

// Order of the columns on the board, and where "Advance" moves a card to.
export const STAGES = ['New', 'Screening', 'Interviewing', 'Offer Extended', 'Hired'];
const REJECTED = 'Rejected';
const HIRED = 'Hired';

export default class PositionPipeline extends LightningElement {
    @api recordId;

    applications = [];
    error;
    isLoading = true;
    wiredResult;

    @wire(getApplications, { positionId: '$recordId' })
    wiredApplications(result) {
        this.wiredResult = result;
        const { data, error } = result;
        if (data) {
            this.applications = data;
            this.error = undefined;
            this.isLoading = false;
        } else if (error) {
            this.applications = [];
            this.error = error;
            this.isLoading = false;
        }
    }

    get hasApplications() {
        return this.applications.length > 0;
    }

    get errorMessage() {
        return this.error?.body?.message ?? 'Unable to load applications.';
    }

    get rejectedCount() {
        return this.applications.filter((app) => app.Status__c === REJECTED).length;
    }

    get stages() {
        return STAGES.map((stage, index) => {
            const nextStatus = STAGES[index + 1];
            const applications = this.applications
                .filter((app) => app.Status__c === stage)
                .map((app) => ({
                    id: app.Id,
                    candidateName: app.Candidate__r?.Full_Name__c ?? app.Name,
                    ratingLabel:
                        app.Average_Rating__c == null
                            ? 'No reviews yet'
                            : `Rating ${app.Average_Rating__c} / 5 (${app.Number_of_Reviews__c} reviews)`,
                    canMove: stage !== HIRED,
                    nextStatus,
                    nextLabel: `Move to ${nextStatus}`
                }));
            return { name: stage, applications, count: applications.length };
        });
    }

    async handleMove(event) {
        const { id, status } = event.target.dataset;
        this.isLoading = true;
        try {
            await updateStatus({ applicationId: id, status });
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Application updated',
                    message: `Moved to ${status}`,
                    variant: 'success'
                })
            );
            // Hiring closes the position in Apex, so refresh the record page too.
            await Promise.all([
                refreshApex(this.wiredResult),
                notifyRecordUpdateAvailable([{ recordId: this.recordId }])
            ]);
        } catch (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Could not update application',
                    message: error?.body?.message ?? 'Unknown error',
                    variant: 'error'
                })
            );
        } finally {
            this.isLoading = false;
        }
    }
}
