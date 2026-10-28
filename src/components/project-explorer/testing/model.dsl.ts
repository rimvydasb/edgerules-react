/**
 * The example model of the Project Explorer: one entity of every section (docs/stories/project-explorer-redesign.md).
 * Shared by the tests (via `@edgerules/node`) and the Storybook stories (via `@edgerules/web`), so both build the same
 * real service.
 */
export const MODEL_DSL = `{
    type Person: {
        name: <string>; age: <number>; tags: <string[]>
    }
    type PeopleList: <Person[]>
    func riskScore(income: number): { score: income / 100 }
    @Service
    func processApplication(income: number): { result: riskScore(income).score }
    ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { age: 18..25 }, then: { level: "high" } }
        ]
        default: { level: "none" }
    }
    globalConst: 42
    nested: {
        func deep(): {
            subField: 10
            return: subField
        }
    }
    list: [{a: 1}, {a: 2}]
    @Workbook
    loanBook: {
        @InputNode(name: "Applicant")
        applicant: { income: 5000 }
        @FunctionNode
        decision: riskScore(income: applicant.income)
        @OutputNode
        result: { score: decision.score }
        helper: 1
    }
}`;
