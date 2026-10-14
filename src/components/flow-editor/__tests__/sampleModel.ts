import { MutableDecisionService } from '@edgerules/node/mutable';
import type { PortableNode } from '@edgerules/portable';
import type { FlowEditorEngine } from '../service/createFlowEditorService';

// The sample model of the FunctionNode design proposal, with the engine's own syntax.
export const SAMPLE_MODEL = `{
  type Applicant: { age: <number>; income: <number>; segment: <string> }
  applicant: { age: 23; income: 25000; segment: "retail" }
  application: { amount: 32000 }
  ruleset risk(age: number, income: number, segment: string): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000, segment: "retail" }, then: { level: "high", limit: 1000 } }
      { when: { age: >= 26 }, then: { level: "medium", limit: 5000 } }
    ]
    default: { level: "none", limit: 0 }
  }
  func creditScore(age: number, income: number): 300 + age * 2 + income / 1000
  func monthly(amount: number): amount / 12
  func applicantDecision(person: Applicant): { eligible: person.age >= 18; reason: if person.age >= 18 then "adult" else "minor" }
  decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
  score: creditScore(age: applicant.age, income: applicant.income)
  payment: monthly(amount: application.amount * 1.1)
  eligibility: applicantDecision(person: applicant)
}`;

export function sampleService(): {
    mutable: FlowEditorEngine;
    portable: () => Record<string, PortableNode>;
} {
    const mutable = MutableDecisionService.fromCode(SAMPLE_MODEL);
    const portable = () => mutable.toPortable() as unknown as Record<string, PortableNode>;
    return { mutable, portable };
}
