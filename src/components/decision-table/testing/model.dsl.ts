/** Shared fixture models for Decision Table Editor tests and stories. */

export const RISK_MODEL_DSL = `{
    type Applicant: { age: <number>; income: <number>; segment: <string> }
    applicant: { age: 23, income: 25000, segment: "retail" }
    ruleset risk(age: number, income: number, segment: string): {
        hitPolicy: "first-match"
        rules: [
            { when: { age: 18..25, income: < 30000, segment: "retail" }, then: { level: "high",   limit: 1000 } }
            { when: { age: 18..25, income: >= 30000 },                   then: { level: "medium", limit: 5000 } }
            { when: age >= 65 or segment = "premium",                    then: { level: "low",    limit: 20000 } }
        ]
        default: { level: "none", limit: 0 }
    }
    decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
}`;

export const SCORECARD_MODEL_DSL = `{
    ruleset scoreFactors(age: number, income: number): {
        hitPolicy: "collect-matches"
        rules: [
            { when: age >= 18 and age <= 25, then: 5 }
            { when: age > 25 and age <= 64,  then: 10 }
            { when: income >= 30000,          then: 20 }
        ]
    }
    total: sum(scoreFactors(age: 30, income: 50000))
}`;

export const BEST_MATCH_MODEL_DSL = `{
    ruleset tier(score: number): {
        hitPolicy: "best-match"
        rules: [
            { when: { score: > 500 }, then: { tier: "silver" }, priority: 1 }
            { when: { score: > 650 }, then: { tier: "gold" },   priority: 2 }
        ]
        default: { tier: "none" }
    }
    result: tier(score: 700)
}`;
