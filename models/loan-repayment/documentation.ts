import type {DocumentationDocument} from '../../src/components/project-session';

/** `documentation.json` of the loan repayment project: one description per model path. */
export const LOAN_REPAYMENT_DOCUMENTATION: DocumentationDocument = {
    schemaVersion: 1,
    byPath: {
        LoanRequest: 'A loan application: the amount, the term in years and the credit score of the borrower',
        Installment: 'One monthly installment of the repayment schedule',
        pricingTier: 'Selects the price tier and the rate premium from the credit score and the term',
        annualRate: 'The base rate of 3.5% plus the premium of the price tier',
        monthlyPayment: 'The fixed monthly annuity payment, rounded to cents',
        repaymentSchedule: 'The monthly amortization schedule of the loan',
        loanCost: 'The total interest and the total amount paid over the schedule',
        yearlySummary: 'The interest and the principal paid in each year, and the balance at the end of the year',
        compareTerms: 'The remaining balance of two schedules at the end of each year',
        loanRepayment: 'Prices a loan request and returns its monthly repayment schedule',
        sampleRequest: 'An example loan request',
        samplePayment: 'The monthly payment of the example loan request',
        mortgageBook: 'A mortgage: the repayment plan, the remaining balance and the yearly split of the payments',
        'mortgageBook.mortgage': 'The mortgage to price',
        'mortgageBook.repayment': 'The repayment plan of the mortgage',
        'mortgageBook.yearly': 'The interest and the principal paid in each year of the mortgage',
        termComparisonBook: 'The same loan over 15 and over 30 years',
        'termComparisonBook.shortTerm': 'The loan over 15 years',
        'termComparisonBook.longTerm': 'The loan over 30 years',
        'termComparisonBook.comparison': 'The remaining balance of both plans at the end of each year',
    },
};
