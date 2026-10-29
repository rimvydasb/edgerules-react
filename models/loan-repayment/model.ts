/**
 * The EdgeRules DSL of the loan repayment model.
 *
 * - `pricingTier` is the decision table: the credit score and the term select the price tier and the rate premium.
 * - `loanRepayment` is the `@Service`: it prices a `LoanRequest` and returns its monthly repayment schedule.
 * - `mortgageBook` and `termComparisonBook` are the two workbooks that call the service and chart the repayment.
 */
export const LOAN_REPAYMENT_DSL = `{
    type LoanRequest: { amount: <number>; years: <number>; creditScore: <number> }
    type Installment: { period: <number>; payment: <number>; interest: <number>; principal: <number>; balance: <number> }
    ruleset pricingTier(creditScore: number, years: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { creditScore: >= 760, years: <= 15 }, then: { tier: "prime", premium: 0.005, approved: true } }
            { when: { creditScore: >= 760 }, then: { tier: "prime", premium: 0.0075, approved: true } }
            { when: { creditScore: 680..759 }, then: { tier: "standard", premium: 0.015, approved: true } }
            { when: { creditScore: 600..679, years: <= 10 }, then: { tier: "near-prime", premium: 0.03, approved: true } }
        ]
        default: { tier: "declined", premium: 0, approved: false }
    }
    func annualRate(creditScore: number, years: number): 0.035 + pricingTier(creditScore, years).premium
    func monthlyPayment(amount: number, annualRate: number, years: number): round(-pmt(annualRate / 12, years * 12, amount), 2)
    func repaymentSchedule(amount: number, annualRate: number, years: number): amortizationSchedule(amount, annualRate / 12, years * 12)
    func loanCost(schedule: Installment[]): {
        totalInterest: round(sum(for installment in schedule return installment.interest), 2)
        totalPaid: round(sum(for installment in schedule return installment.payment), 2)
    }
    func yearlySummary(schedule: Installment[]): for n in 1..(count(schedule) / 12) return {
        year: n
        interest: round(sum(for installment in schedule[period > (n - 1) * 12 and period <= n * 12] return installment.interest), 2)
        principal: round(sum(for installment in schedule[period > (n - 1) * 12 and period <= n * 12] return installment.principal), 2)
        balance: schedule[period = n * 12][0].balance
    }
    func compareTerms(shorter: Installment[], longer: Installment[]): for n in 1..(count(longer) / 12) return {
        year: n
        shorterBalance: if n * 12 <= count(shorter) then shorter[period = n * 12][0].balance else 0
        longerBalance: longer[period = n * 12][0].balance
    }
    @Service
    func loanRepayment(request: LoanRequest): {
        pricing: pricingTier(request.creditScore, request.years)
        rate: annualRate(request.creditScore, request.years)
        payment: if pricing.approved then monthlyPayment(request.amount, rate, request.years) else 0
        schedule: repaymentSchedule(request.amount, rate, request.years)[pricing.approved]
        cost: loanCost(schedule)
    }
    sampleRequest: { amount: 25000; years: 3; creditScore: 700 }
    samplePayment: loanRepayment(request: sampleRequest).payment
    @Workbook(name: "Mortgage plan")
    mortgageBook: {
        @InputNode(name: "Mortgage request")
        mortgage: { amount: 250000; years: 25; creditScore: 780 }
        @FunctionNode(name: "Repayment plan")
        repayment: loanRepayment(request: mortgage)
        @FunctionNode(name: "Yearly summary")
        yearly: yearlySummary(schedule: repayment.schedule)
    }
    @Workbook(name: "15 vs 30 years")
    termComparisonBook: {
        @InputNode(name: "15-year loan")
        shortTerm: { amount: 180000; years: 15; creditScore: 720 }
        @InputNode(name: "30-year loan")
        longTerm: { amount: 180000; years: 30; creditScore: 720 }
        @FunctionNode(name: "15-year plan")
        shortPlan: loanRepayment(request: shortTerm)
        @FunctionNode(name: "30-year plan")
        longPlan: loanRepayment(request: longTerm)
        @FunctionNode(name: "Balance by year")
        comparison: compareTerms(shorter: shortPlan.schedule, longer: longPlan.schedule)
    }
}`;
