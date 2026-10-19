// A loan repayment model: the monthly amortization schedule (a list of records) and the cost split of the loan
// (a record of numbers). The ChartNode tests and stories chart both.
export const LOAN_MODEL = `{
  loan: { amount: 25000; annualRate: 0.06; years: 3 }
  func repayment(amount: number, annualRate: number, years: number): amortizationSchedule(amount, annualRate / 12, years * 12)
  func loanCost(amount: number, annualRate: number, years: number): {
    principal: amount
    interest: sum(for installment in repayment(amount, annualRate, years) return installment.interest)
  }
  schedule: repayment(amount: loan.amount, annualRate: loan.annualRate, years: loan.years)
  cost: loanCost(amount: loan.amount, annualRate: loan.annualRate, years: loan.years)
}`;
