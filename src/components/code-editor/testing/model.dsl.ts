export const VALID_MODEL_DSL = `{
  type Customer: { name: <string>; income: <number, 0> }
  applicant: {
    age: 21
    address: {
      city: "Vilnius"
      zip: "01100"
    }
  }
  func riskScore(income: number): { score: income / 100 }
  limit: riskScore(applicant.age).score
}`;

export const INVALID_MODEL_DSL = `{
  applicant: {
    age:
  }
}`;

/** Surrounding model for cell-editing tests: the cell value is spliced between the parts. */
export const CELL_EMBED_PREFIX = `{
  applicant: {
    age: 21
    address: { city: "Vilnius" }
  }
  cell: `;

export const CELL_EMBED_SUFFIX = `
}`;
