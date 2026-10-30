/**
 * The EdgeRules DSL of the loan origination model: a joint mortgage application goes through the steps of a bank
 * origination process. Every step reads a record and returns a record, so each result explains itself.
 *
 * - `applicantRecord` and `applicationRecord` are the records the decisions read: the input data plus derived facts.
 *   `applicationRecord` holds the `applicantRecord` of every applicant, and the scorecard reads that record.
 * - `applicantScorecard` is the scorecard decision table; `riskGrade` maps the score to a grade and a default rate.
 * - `policyRules` are the knockout rules of the credit policy, one record per rule.
 * - `pricingGrid` prices the grade and the loan-to-value; `affordability` stress-tests the payment.
 * - `decisionMatrix` combines the knockouts, the grade, the LTV and the DSTI into APPROVE, REFER or DECLINE.
 * - `loanOriginationDecision` is the `@Service`; `originationBook` and `capacityBook` are the workbooks.
 */
export const LOAN_ORIGINATION_DSL = `{
    type Applicant: { name: <string>; birthDate: <date>; employment: <string>; yearsEmployed: <number>; monthlyIncome: <number>; monthlyExpenses: <number>; monthlyDebtPayments: <number>; bureauScore: <number>; delinquencies: <number> }
    type LoanTerms: { applicationDate: <date>; loanAmount: <number>; propertyValue: <number>; termYears: <number> }
    type Application: { applicationDate: <date>; loanAmount: <number>; propertyValue: <number>; termYears: <number>; applicants: <Applicant[]> }
    type ApplicantRecord: { data: <Applicant>; age: <number>; disposableIncome: <number> }
    func creditPolicy(): {
        referenceRate: 0.03
        stressBuffer: 0.03
        maxDsti: 0.45
        maxLtv: 0.8
        maxAgeAtMaturity: 75
        minBureauScore: 550
        maxDelinquencies: 2
    }
    ruleset applicantScorecard(age: number, employment: string, yearsEmployed: number, bureauScore: number, delinquencies: number): {
        hitPolicy: "collect-matches"
        rules: [
            { when: { age: < 25 }, then: { characteristic: "Age", attribute: "under 25", points: 10 } }
            { when: { age: 25..39 }, then: { characteristic: "Age", attribute: "25 to 39", points: 25 } }
            { when: { age: 40..59 }, then: { characteristic: "Age", attribute: "40 to 59", points: 35 } }
            { when: { age: >= 60 }, then: { characteristic: "Age", attribute: "60 and over", points: 20 } }
            { when: { employment: "permanent" }, then: { characteristic: "Employment", attribute: "permanent", points: 40 } }
            { when: { employment: "contract" }, then: { characteristic: "Employment", attribute: "contract", points: 25 } }
            { when: { employment: "self-employed" }, then: { characteristic: "Employment", attribute: "self-employed", points: 20 } }
            { when: { employment: not(in ["permanent", "contract", "self-employed"]) }, then: { characteristic: "Employment", attribute: "other", points: 0 } }
            { when: { yearsEmployed: < 2 }, then: { characteristic: "Time employed", attribute: "under 2 years", points: 5 } }
            { when: { yearsEmployed: >= 2 and < 5 }, then: { characteristic: "Time employed", attribute: "2 to 5 years", points: 15 } }
            { when: { yearsEmployed: >= 5 }, then: { characteristic: "Time employed", attribute: "5 years and over", points: 25 } }
            { when: { bureauScore: < 580 }, then: { characteristic: "Bureau score", attribute: "under 580", points: 0 } }
            { when: { bureauScore: 580..669 }, then: { characteristic: "Bureau score", attribute: "580 to 669", points: 20 } }
            { when: { bureauScore: 670..739 }, then: { characteristic: "Bureau score", attribute: "670 to 739", points: 40 } }
            { when: { bureauScore: 740..799 }, then: { characteristic: "Bureau score", attribute: "740 to 799", points: 55 } }
            { when: { bureauScore: >= 800 }, then: { characteristic: "Bureau score", attribute: "800 and over", points: 70 } }
            { when: { delinquencies: 0 }, then: { characteristic: "Delinquencies", attribute: "none", points: 30 } }
            { when: { delinquencies: 1 }, then: { characteristic: "Delinquencies", attribute: "one", points: 10 } }
            { when: { delinquencies: >= 2 }, then: { characteristic: "Delinquencies", attribute: "two or more", points: 0 } }
        ]
    }
    ruleset riskGrade(score: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { score: >= 170 }, then: { grade: "A", probabilityOfDefault: 0.005 } }
            { when: { score: >= 140 }, then: { grade: "B", probabilityOfDefault: 0.012 } }
            { when: { score: >= 110 }, then: { grade: "C", probabilityOfDefault: 0.03 } }
            { when: { score: >= 80 }, then: { grade: "D", probabilityOfDefault: 0.07 } }
        ]
        default: { grade: "E", probabilityOfDefault: 0.15 }
    }
    ruleset pricingGrid(grade: string, ltv: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { grade: "A", ltv: <= 0.6 }, then: { margin: 0.01 } }
            { when: { grade: "A", ltv: <= 0.8 }, then: { margin: 0.0125 } }
            { when: { grade: "A" }, then: { margin: 0.0175 } }
            { when: { grade: "B", ltv: <= 0.6 }, then: { margin: 0.015 } }
            { when: { grade: "B", ltv: <= 0.8 }, then: { margin: 0.0175 } }
            { when: { grade: "B" }, then: { margin: 0.0225 } }
            { when: { grade: "C", ltv: <= 0.6 }, then: { margin: 0.0225 } }
            { when: { grade: "C", ltv: <= 0.8 }, then: { margin: 0.025 } }
            { when: { grade: "C" }, then: { margin: 0.03 } }
            { when: { grade: "D" }, then: { margin: 0.035 } }
        ]
        default: { margin: 0.05 }
    }
    ruleset decisionMatrix(knockouts: number, grade: string, ltv: number, dsti: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { knockouts: > 0 }, then: { outcome: "DECLINE", reason: "A policy rule failed" } }
            { when: { grade: "E" }, then: { outcome: "DECLINE", reason: "Risk grade E" } }
            { when: { dsti: > 0.5 }, then: { outcome: "DECLINE", reason: "Debt service above 50% of income" } }
            { when: { ltv: > 0.95 }, then: { outcome: "DECLINE", reason: "Loan-to-value above 95%" } }
            { when: { grade: "D" }, then: { outcome: "REFER", reason: "Risk grade D needs an underwriter" } }
            { when: { dsti: > 0.45 }, then: { outcome: "REFER", reason: "Debt service above 45% of income" } }
            { when: { ltv: > 0.8 }, then: { outcome: "REFER", reason: "Loan-to-value above 80%" } }
        ]
        default: { outcome: "APPROVE", reason: "Within the credit policy" }
    }
    func applicantRecord(applicant: Applicant, applicationDate: date): {
        data: applicant
        age: calendarDiff(applicant.birthDate, applicationDate).years
        disposableIncome: applicant.monthlyIncome - applicant.monthlyExpenses - applicant.monthlyDebtPayments
    }
    func policyRules(age: number, termYears: number, employment: string, bureauScore: number, delinquencies: number): {
        rules: [
            { code: "AGE_MIN", description: "The applicant is 18 or older", passed: age >= 18 }
            { code: "AGE_AT_MATURITY", description: "The applicant is 75 or younger when the loan ends", passed: age + termYears <= creditPolicy().maxAgeAtMaturity }
            { code: "EMPLOYED", description: "The applicant has an income from employment", passed: employment != "unemployed" }
            { code: "BUREAU_MIN", description: "The bureau score is 550 or more", passed: bureauScore >= creditPolicy().minBureauScore }
            { code: "DELINQUENCIES", description: "Two or fewer delinquencies in the last 24 months", passed: delinquencies <= creditPolicy().maxDelinquencies }
        ]
        failed: for rule in rules[passed = false] return rule.code
        allPassed: count(failed) = 0
    }
    func scoreApplicant(record: ApplicantRecord): {
        bins: applicantScorecard(record.age, record.data.employment, record.data.yearsEmployed, record.data.bureauScore, record.data.delinquencies)
        score: sum(for bin in bins return bin.points)
        grade: riskGrade(score)
    }
    func applicantDecision(record: ApplicantRecord, termYears: number): {
        name: record.data.name
        scorecard: scoreApplicant(record)
        policy: policyRules(record.age, termYears, record.data.employment, record.data.bureauScore, record.data.delinquencies)
    }
    func applicationRecord(application: Application): {
        data: application
        ltv: round(application.loanAmount / application.propertyValue, 4)
        householdIncome: sum(for applicant in application.applicants return applicant.monthlyIncome)
        householdExpenses: sum(for applicant in application.applicants return applicant.monthlyExpenses)
        householdDebtPayments: sum(for applicant in application.applicants return applicant.monthlyDebtPayments)
        applicantRecords: for applicant in application.applicants return applicantRecord(applicant, application.applicationDate)
    }
    func affordability(householdIncome: number, householdDebtPayments: number, loanAmount: number, rate: number, termYears: number): {
        payment: round(-pmt(rate / 12, termYears * 12, loanAmount), 2)
        stressedRate: rate + creditPolicy().stressBuffer
        stressedPayment: round(-pmt(stressedRate / 12, termYears * 12, loanAmount), 2)
        dsti: round((householdDebtPayments + stressedPayment) / householdIncome, 4)
        maxPayment: round(max([0, householdIncome * creditPolicy().maxDsti - householdDebtPayments]), 2)
        maxLoan: round(pv(stressedRate / 12, termYears * 12, -maxPayment), 0)
    }
    func jointApplication(loan: LoanTerms, mainApplicant: Applicant, coApplicant: Applicant): {
        applicationDate: loan.applicationDate
        loanAmount: loan.loanAmount
        propertyValue: loan.propertyValue
        termYears: loan.termYears
        applicants: [mainApplicant, coApplicant]
    }
    @Service
    func loanOriginationDecision(application: Application): {
        record: applicationRecord(application)
        applicants: for applicant in record.applicantRecords return applicantDecision(applicant, application.termYears)
        householdScore: min(for applicant in applicants return applicant.scorecard.score)
        grade: riskGrade(householdScore)
        knockouts: flatten(for applicant in applicants return for code in applicant.policy.failed return applicant.name + ": " + code)
        pricing: pricingGrid(grade.grade, record.ltv)
        rate: creditPolicy().referenceRate + pricing.margin
        affordability: affordability(record.householdIncome, record.householdDebtPayments, application.loanAmount, rate, application.termYears)
        decision: decisionMatrix(count(knockouts), grade.grade, record.ltv, affordability.dsti)
        offer: {
            amount: if decision.outcome = "APPROVE" then application.loanAmount else 0
            rate: if decision.outcome = "APPROVE" then rate else 0
            monthlyPayment: if decision.outcome = "APPROVE" then affordability.payment else 0
            maxAmount: round(min([affordability.maxLoan, application.propertyValue * creditPolicy().maxLtv]), 0)
            counterOfferAmount: if decision.outcome != "APPROVE" and count(knockouts) = 0 and grade.grade != "E" and maxAmount < application.loanAmount then maxAmount else 0
        }
    }
    func borrowingCapacity(householdIncome: number, householdDebtPayments: number, rate: number): for term in [10, 15, 20, 25, 30] return {
        termYears: term
        maxPayment: affordability(householdIncome, householdDebtPayments, 0, rate, term).maxPayment
        maxLoan: affordability(householdIncome, householdDebtPayments, 0, rate, term).maxLoan
    }
    sampleApplication: {
        applicationDate: date("2026-10-01")
        loanAmount: 240000
        propertyValue: 320000
        termYears: 25
        applicants: [
            { name: "Jonas Petraitis"; birthDate: date("1988-04-12"); employment: "permanent"; yearsEmployed: 8; monthlyIncome: 4200; monthlyExpenses: 1300; monthlyDebtPayments: 250; bureauScore: 765; delinquencies: 0 }
            { name: "Ieva Petraitiene"; birthDate: date("1990-09-30"); employment: "contract"; yearsEmployed: 3; monthlyIncome: 2600; monthlyExpenses: 900; monthlyDebtPayments: 0; bureauScore: 702; delinquencies: 1 }
        ]
    }
    sampleDecision: loanOriginationDecision(application: sampleApplication).decision.outcome
    @Workbook(name: "Joint mortgage application")
    originationBook: {
        @InputNode(name: "Loan terms")
        loan: { applicationDate: date("2026-10-01"); loanAmount: 240000; propertyValue: 320000; termYears: 25 }
        @InputNode(name: "Main applicant")
        mainApplicant: { name: "Jonas Petraitis"; birthDate: date("1988-04-12"); employment: "permanent"; yearsEmployed: 8; monthlyIncome: 4200; monthlyExpenses: 1300; monthlyDebtPayments: 250; bureauScore: 765; delinquencies: 0 }
        @InputNode(name: "Co-applicant")
        coApplicant: { name: "Ieva Petraitiene"; birthDate: date("1990-09-30"); employment: "contract"; yearsEmployed: 3; monthlyIncome: 2600; monthlyExpenses: 900; monthlyDebtPayments: 0; bureauScore: 702; delinquencies: 1 }
        @FunctionNode(name: "Joint application")
        application: jointApplication(loan: loan, mainApplicant: mainApplicant, coApplicant: coApplicant)
        @FunctionNode(name: "Main applicant record")
        mainRecord: applicantRecord(applicant: mainApplicant, applicationDate: loan.applicationDate)
        @FunctionNode(name: "Co-applicant record")
        coRecord: applicantRecord(applicant: coApplicant, applicationDate: loan.applicationDate)
        @FunctionNode(name: "Main applicant scorecard")
        mainScorecard: scoreApplicant(record: mainRecord)
        @FunctionNode(name: "Co-applicant scorecard")
        coScorecard: scoreApplicant(record: coRecord)
        @FunctionNode(name: "Origination decision")
        origination: loanOriginationDecision(application: application)
    }
    @Workbook(name: "Borrowing capacity")
    capacityBook: {
        @InputNode(name: "Household")
        household: { monthlyIncome: 6800; monthlyDebtPayments: 250; rate: 0.0425 }
        @FunctionNode(name: "Borrowing capacity")
        capacity: borrowingCapacity(householdIncome: household.monthlyIncome, householdDebtPayments: household.monthlyDebtPayments, rate: household.rate)
    }
}`;
