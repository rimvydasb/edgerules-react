// A `@Service` with a record parameter and a number parameter, two function nodes and a `@ReturnNode`, and a caller
// that reads the result: the service flow tests and stories use it.
export const SERVICE_MODEL = `{
  type Applicant: { age: <number>; income: <number> }
  func creditScore(age: number, income: number): 300 + age * 2 + income / 1000
  func monthly(amount: number): amount / 12
  @Service
  func quote(applicant: Applicant, amount: number): {
    @FunctionNode(name: "Score")
    score: creditScore(age: applicant.age, income: applicant.income)
    @FunctionNode(name: "Monthly")
    installment: monthly(amount: amount)
    approved: score > 350
    @ReturnNode(name: "Quote")
    return: {
      score: score
      installment: installment
    }
  }
  offer: quote(applicant: {age: 30; income: 40000}, amount: 1200).installment
}`;
