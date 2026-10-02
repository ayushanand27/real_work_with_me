import { createElement } from 'lwc';
import PositionPipeline from 'c/positionPipeline';
import getApplications from '@salesforce/apex/RecruitingController.getApplications';
import updateStatus from '@salesforce/apex/RecruitingController.updateStatus';

jest.mock(
    '@salesforce/apex/RecruitingController.getApplications',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/RecruitingController.updateStatus',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const APPLICATIONS = [
    {
        Id: 'a01000000000001AAA',
        Name: 'JA-00001',
        Status__c: 'New',
        Average_Rating__c: null,
        Number_of_Reviews__c: 0,
        Candidate__r: { Full_Name__c: 'Asha Rao' }
    },
    {
        Id: 'a01000000000002AAA',
        Name: 'JA-00002',
        Status__c: 'Interviewing',
        Average_Rating__c: 4.5,
        Number_of_Reviews__c: 2,
        Candidate__r: { Full_Name__c: 'Vikram Shah' }
    },
    {
        Id: 'a01000000000003AAA',
        Name: 'JA-00003',
        Status__c: 'Rejected',
        Average_Rating__c: 2,
        Number_of_Reviews__c: 1,
        Candidate__r: { Full_Name__c: 'Neha Iyer' }
    }
];

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

function createComponent() {
    const element = createElement('c-position-pipeline', { is: PositionPipeline });
    element.recordId = 'a00000000000001AAA';
    document.body.appendChild(element);
    return element;
}

describe('c-position-pipeline', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('groups applications into stage columns', async () => {
        const element = createComponent();
        getApplications.emit(APPLICATIONS);
        await flushPromises();

        const headings = [...element.shadowRoot.querySelectorAll('h3')].map((h) => h.textContent.trim());
        expect(headings).toEqual([
            'New (1)',
            'Screening (0)',
            'Interviewing (1)',
            'Offer Extended (0)',
            'Hired (0)'
        ]);
        expect(element.shadowRoot.querySelectorAll('article.card')).toHaveLength(2);
        expect(element.shadowRoot.querySelector('.rejected').textContent).toBe('Rejected: 1');
        expect(element.shadowRoot.textContent).toContain('Rating 4.5 / 5 (2 reviews)');
    });

    it('shows an empty state when there are no applications', async () => {
        const element = createComponent();
        getApplications.emit([]);
        await flushPromises();

        expect(element.shadowRoot.querySelector('.empty')).not.toBeNull();
    });

    it('shows the error message when loading fails', async () => {
        const element = createComponent();
        getApplications.error({ message: 'No access' });
        await flushPromises();

        expect(element.shadowRoot.querySelector('.error').textContent).toBe('No access');
    });

    it('advances a candidate to the next stage', async () => {
        updateStatus.mockResolvedValue();
        const element = createComponent();
        getApplications.emit(APPLICATIONS);
        await flushPromises();

        const toastHandler = jest.fn();
        element.addEventListener('lightning__showtoast', toastHandler);
        element.shadowRoot.querySelector('lightning-button.advance').click();
        await flushPromises();

        expect(updateStatus).toHaveBeenCalledWith({
            applicationId: 'a01000000000001AAA',
            status: 'Screening'
        });
        expect(toastHandler.mock.calls[0][0].detail.variant).toBe('success');
    });

    it('shows an error toast when the update fails', async () => {
        updateStatus.mockRejectedValue({ body: { message: 'Hired applications cannot change status.' } });
        const element = createComponent();
        getApplications.emit(APPLICATIONS);
        await flushPromises();

        const toastHandler = jest.fn();
        element.addEventListener('lightning__showtoast', toastHandler);
        element.shadowRoot.querySelector('lightning-button.reject').click();
        await flushPromises();

        expect(updateStatus).toHaveBeenCalledWith({
            applicationId: 'a01000000000001AAA',
            status: 'Rejected'
        });
        const toast = toastHandler.mock.calls[0][0].detail;
        expect(toast.variant).toBe('error');
        expect(toast.message).toBe('Hired applications cannot change status.');
    });
});
