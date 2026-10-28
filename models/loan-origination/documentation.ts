import type {DocumentationDocument} from '../../src/components/project-session';

/** `documentation.json` of the loan origination project: one description per model path. */
export const LOAN_ORIGINATION_DOCUMENTATION: DocumentationDocument = {
    schemaVersion: 1,
    byPath: {
        Applicant: 'One borrower of the application: identity, employment, monthly budget and credit bureau data',
        LoanTerms: 'The requested loan: the application date, the amount, the property value and the term in years',
        Application: 'A mortgage application: the loan terms and one or more applicants',
        creditPolicy: 'The parameters of the credit policy: the reference rate, the stress buffer and the limits',
        applicantScorecard:
            'The application scorecard: every characteristic of the applicant falls into one bin, and each bin gives points',
        riskGrade: 'Maps the scorecard points to a risk grade and its probability of default',
        pricingGrid: 'The margin over the reference rate for the risk grade and the loan-to-value',
        decisionMatrix:
            'Combines the knockouts, the risk grade, the loan-to-value and the debt service into a decision',
        applicantRecord: 'The applicant data plus the age at the application date and the disposable income',
        policyRules: 'The knockout rules of the credit policy, one record per rule',
        scoreApplicant: 'Scores one applicant with the scorecard and grades the score',
        applicantDecision: 'The scorecard and the policy rules of one applicant',
        applicationRecord: 'The application data plus the loan-to-value and the household budget',
        affordability:
            'The monthly payment, the payment stress-tested at the rate plus the buffer, the debt service to income and the largest affordable loan',
        jointApplication: 'Builds an application from the loan terms and two applicants',
        loanOriginationDecision:
            'Decides a mortgage application: scores and checks every applicant, prices the loan, tests affordability and makes an offer',
        borrowingCapacity: 'The largest affordable loan of a household for terms of 10 to 30 years',
        sampleApplication: 'An example joint mortgage application',
        sampleDecision: 'The decision on the example application',
        originationBook:
            'A joint mortgage application from the loan terms and two applicants to the decision and the offer',
        'originationBook.loan': 'The requested loan',
        'originationBook.mainApplicant': 'The main applicant',
        'originationBook.coApplicant': 'The co-applicant',
        'originationBook.application': 'The application built from the loan terms and both applicants',
        'originationBook.mainScorecard': 'The scorecard of the main applicant',
        'originationBook.coScorecard': 'The scorecard of the co-applicant',
        'originationBook.origination': 'The origination decision on the application',
        capacityBook: 'How much a household can borrow for each term',
        'capacityBook.household': 'The monthly income, the monthly debt payments and the offered rate of the household',
        'capacityBook.capacity': 'The largest affordable payment and loan for each term',
    },
};
