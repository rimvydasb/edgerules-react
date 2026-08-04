# Phase 11 — Business-flow capstone: loan origination, built from blank

**Area:** `e2e/boxed-editor/business-flow.spec.ts` (new). **Test-only phase — no product code changes.**

**Goal:** prove a business analyst can build a complete, realistic, executable decisioning model **from an empty
editor**, using nothing but the editor's own affordances, and that the editor survives the failures a real person
makes along the way.

**Prerequisites:** [Phase 1](improvement-phase-1.md) for the harness. Individual steps are gated on
[Phases 2–6](improvement-phase-2.md) as noted per step — see the gate table below. Write the ungated steps first; the
file grows as the fixes land.

**Fixture:** `BlankModel`, and **nothing else**. This is the one hard rule of this phase.

---

## Why this phase exists

Every other phase tests a construct in isolation, starting from a fixture that already contains it. That is exactly
the condition under which the create-path bugs in [`current-bugs.md`](current-bugs.md) stayed invisible through a
28-test suite. This phase is the opposite: one long, stateful sequence, in narrative order, where the model built in
step 3 is what step 9 has to reference and step 11 has to maintain. A suite of short independent tests structurally
cannot catch that class of regression.

It also doubles as the full-entity-type sweep: the scenario touches **all 21** `BoxedRowKind`s.

---

## Hard rules for this file

1. **`BlankModel` only.** If a construct cannot be created through the UI, that is a finding for
   [`current-bugs.md`](current-bugs.md), never a reason to pre-bake it into the fixture.
2. **No service calls, ever.** Menus, placeholders, cells, keyboard, drag — the vocabulary of a person.
   See [`qa-general-info.md`](qa-general-info.md) §1.3.
3. **Cumulative assertions.** Every step re-asserts that the model built so far still links and still executes, not
   just its own delta.
4. **No reordering or skipping to make a later step pass.** A blocked step is `test.fixme` with its bug number, so
   the blocked surface stays visible in the report.
5. **No weakening.** Where a step's intended assertion is currently false because of an open bug, write the test
   against the *fixed* behaviour and fixme it. Do not rewrite it to assert the broken behaviour — this is precisely
   the regression that must never come back.

---

## Row-kind coverage

| `BoxedRowKind`                             | Introduced in                                                      |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `model`                                     | Implicit root of the blank starting model.                        |
| `context`                                   | `application` — the intake record (Step 1).                       |
| `field`                                     | `applicationDate`, `loanAmount`, `propertyValue`, `applicant` (Step 1). |
| `complexType`                               | `type Applicant: { name, age, income }` (Step 1).                 |
| `list` / `list-item`                        | `requiredDocuments` and its entries (Step 2).                     |
| `relation` / `relation-item`                | `collateralProperties` and its records, one with a drill-down (Step 3). |
| `function` / `function-result`              | `monthlyPayment`, `affordabilityScore`, `originationFee`, `application.loanToValue` (Step 4). |
| `ruleset` / `rule` / `ruleset-default` / `ruleset-hit-policy` | `riskTier` (Step 8).                             |
| `optimisation` / `optimisation-setting`     | `portfolioMix` and its `using`/`timeLimit` (Step 9).              |
| `optimisation-variable-group` / `-variable` | One loan-count variable per risk tier (Step 9).                   |
| `optimisation-objective`                    | Maximise expected portfolio yield (Step 9).                       |
| `optimisation-constraint-group` / `-constraint` | Capital-adequacy and per-tier exposure limits (Step 9).       |

---

## Gate table

| Step | Gated on                                                                 |
| ---- | ------------------------------------------------------------------------ |
| 1    | complexType sub-step: [Bug 7](current-bugs.md#bug-7--a-complextype-can-never-be-created-from-the-ui) — [Phase 3](improvement-phase-3.md) |
| 2    | ungated                                                                  |
| 3    | second record: [Bug 12](current-bugs.md#bug-12--appending-a-record-to-a-relation-with-any-non-string-column-silently-does-nothing) — [Phase 3](improvement-phase-3.md) |
| 4    | [Bug 1](current-bugs.md#bug-1--untyped-functionoptimisation-argument-corrupts-on-round-trip) — [Phase 2](improvement-phase-2.md) |
| 5    | [Bugs 5/11](current-bugs.md#bug-11--the-link-check-is-model-global-so-one-dangling-reference-freezes-every-subsequent-commit) — [Phase 2](improvement-phase-2.md) |
| 6    | error visibility: [Bug 5](current-bugs.md#bug-5--errors-from-container-level-add--delete--actions-are-swallowed) — [Phase 2](improvement-phase-2.md) |
| 7    | [Bug 5](current-bugs.md#bug-5--errors-from-container-level-add--delete--actions-are-swallowed) — [Phase 2](improvement-phase-2.md) |
| 8    | [Bugs 3/13](current-bugs.md#bug-13--new-condition-columns-are-hardcoded-string-so-no-numeric-decision-table-is-buildable) — [Phase 4](improvement-phase-4.md); [Bugs 8/9](current-bugs.md#bug-8--dropdownchip-settings-are-decorative-hit-policy-and-solver-settings-cannot-be-changed) — [Phase 5](improvement-phase-5.md) |
| 9    | settings: [Bug 8](current-bugs.md#bug-8--dropdownchip-settings-are-decorative-hit-policy-and-solver-settings-cannot-be-changed) — [Phase 5](improvement-phase-5.md); solver wiring — [Phase 1](improvement-phase-1.md) |
| 10   | [Bug 10](current-bugs.md#bug-10--rename-never-migrates-references-silently-breaking-the-whole-model) — [Phase 6](improvement-phase-6.md) |
| 11   | [Bugs 2/3/4](current-bugs.md#bug-2--no-way-to-rename-a-function-argument-or-a-decision-table-column) — [Phase 4](improvement-phase-4.md) |
| 12   | ungated                                                                  |
| 13   | Steps 8 and 9                                                            |

---

## The target model — this phase's definition of done

After Step 13 the built model must be equivalent to this. Assert structurally via `live-model`, or against normalized
text via `getCode('*')` — note `getCode` **requires** a path argument; the no-arg call returns a `PortableError`.

```
{
  type Applicant: { name: <string>; age: <number>; income: <number> }

  application: {
    applicationDate: date("2026-03-01")
    loanAmount: 250000
    propertyValue: 320000
    applicant: <Applicant, required: true>
    loanToValue: func(amount: number, value: number): amount / value
  }

  requiredDocuments: ["payslip", "bank-statement", "property-valuation"]

  collateralProperties: [
    { address: { street: "Gedimino 9", city: "Vilnius" }, value: 320000, propertyType: "residential" }
    { address: { street: "Laisves 12",  city: "Kaunas"  }, value: 180000, propertyType: "commercial"  }
  ]

  monthlyPayment: func(amount: number, annualRate: number, years: number):
    amount * (annualRate / 12) / (1 - (1 + annualRate / 12) ** (-12 * years))

  affordabilityScore: func(income: number, payment: number): {
    monthlyIncome: income / 12
    ratio: payment / monthlyIncome
    result: 1 - ratio
  }

  originationFee: func(): 350

  ruleset riskTier(age: number, income: number, ltv: number): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000, ltv: > 0.8 }, then: { tier: "high",   maxExposure: 1000000, expectedYield: 0.11 } }
      { when: { age: 26..64, income: >= 30000 },            then: { tier: "medium", maxExposure: 5000000, expectedYield: 0.07 } }
      { when: { age: >= 65 },                               then: { tier: "low",    maxExposure: 2000000, expectedYield: 0.05 } }
    ]
    default: { tier: "declined", maxExposure: 0, expectedYield: 0 }
  }

  optimise portfolioMix(capital: number): {
    using: "highs"
    variables: {
      highTierLoans:   <number, min: 0>
      mediumTierLoans: <number, min: 0>
      lowTierLoans:    <number, min: 0>
    }
    maximise: 0.11 * highTierLoans + 0.07 * mediumTierLoans + 0.05 * lowTierLoans
    constraints: {
      capitalAdequacy: highTierLoans + mediumTierLoans + lowTierLoans <= capital
      highExposure:    highTierLoans <= 100
      mediumExposure:  mediumTierLoans <= 400
      lowExposure:     lowTierLoans <= 300
    }
  }
}
```

Exact literals may drift as the steps are written. What must not drift is the **shape**: all 21 row kinds present,
and the cross-construct reference from `portfolioMix`'s objective coefficients back to `riskTier`'s `expectedYield`
outputs.

---

## Tasks

- [x] Create `e2e/boxed-editor/business-flow.spec.ts` with `test.describe('Boxed Editor / business flow')` and a
      single `test('builds a loan origination and portfolio decisioning model from a blank start, surviving
      parse/link/argument failures along the way')`, segmented into the 13 `test.step`s below. One page, one model,
      never reset.

- [x] **Step 1 — applicant & application intake.** `Add field` × 3 directly on the model root first, to prove
      root-level field creation before any container exists. Then create the `application` context.

  > Affordance note found while planning: `Convert to context` on a field **replaces** it with an *empty* container
  > (`convertField` discards the value) — it does not gather sibling fields into it. So the realistic sequence is:
  > convert one field to a context, rename it `application`, `Add field` inside it three times, delete the two
  > leftover root fields. If that reads badly to a real user, file it.

  Add the `complexType` `Applicant` with `name`/`age`/`income`, then reference it as a typed field
  (`application.applicant: <Applicant, required: true>`). *(complexType sub-step gated on Bug 7.)*

- [x] **Step 2 — required documents.** `Add list` (`requiredDocuments`) at the model root; append 3+ string items via
      the trailing "(new item)" placeholder. Assert the seeded default is `""` and that committing a number into one
      is rejected visibly (list homogeneity).

- [x] **Step 3 — collateral properties.** `Add relation` (`collateralProperties`); add its columns one at a time
      (`address`, `value`, `propertyType`), then add records. **Order matters:** add the first record while every
      column is still string-typed, author `value` as a number, *then* append the second record — that append is
      Bug 12's exact trigger and must now succeed. Make one record's `address` a drill-down complex cell rather than
      a flat string, and edit a nested field inside it.

- [x] **Step 4 — calculations, first failure.** Add the inline function `monthlyPayment`. Add its first argument
      (`amount`). **Add a second immediately** — Bug 1's exact trigger — and assert the *fixed* behaviour: two
      distinct arguments, model still links, no silent no-op. Add a third (`years`); the corruption compounds
      per-argument, so three is a stronger assertion than two. Then add `affordabilityScore` as a multi-statement
      function (2+ body fields, via `function-result`'s `Duplicate` — the only path there), `originationFee` with
      zero arguments, and a `loanToValue` function nested inside the `application` context.

- [x] **Step 5 — recovery checkpoint.** Immediately after Step 4, perform an entirely unrelated mutation —
      `Add relation` on the model root, distinct from `collateralProperties` — and assert it succeeds. **This is the
      single most important assertion in the file:** it directly tests "cannot create anything, even after the error
      is fixed." Then strengthen it: delete a row that another row references, assert the model-level error is
      visible and names the offending path, assert an unrelated `Add field` still commits, repair the dangling
      reference, and confirm everything links again.

- [x] **Step 6 — deliberate parse failure and recovery.** Open `monthlyPayment`'s result expression, commit
      `application.loanAmount /`, assert the inline error appears **with the trailing-operator message**
      (`Expected a value after "/".`), assert every other row is still interactive (click into an unrelated field,
      cancel with Escape, confirm no residual edit state and no second open editor), then commit a valid expression
      and confirm the error clears and `onChange` fired exactly once.

- [x] **Step 7 — deliberate link failure and recovery.** Delete a `monthlyPayment` argument the body *does*
      reference; assert the rejection is visible and the signature unchanged. Then delete one that genuinely is
      unused and confirm that one succeeds.

- [x] **Step 8 — risk-tiering decision table.** `Add decision table` (`riskTier`). Add condition columns
      `age`/`income`/`ltv` **and retype them to `number`** — without that, only string equality is authorable and the
      step is vacuous. Add action columns `tier`/`maxExposure`/`expectedYield`. Build 3+ rules **incrementally**,
      asserting cumulative state after each add — one as a cell-map condition, another as a boolean expression. Fill
      in the `default` row. Switch `hitPolicy` to `best-match`, confirm the priority column appears everywhere it
      should, then switch back. Execute after **each** rule is added, so a rule that silently fails to commit is
      caught immediately rather than at the end.

- [x] **Step 9 — portfolio capital allocation.** `Add optimisation` (`portfolioMix`) at the model root — **root
      only**; also assert the action is genuinely absent from a nested context's menu. Add one variable per
      `riskTier` output tier, set the `maximise` objective across those variables, and add capital/exposure
      constraints referencing both the variables and a value from `application`/`riskTier` — the cross-construct
      reference that makes this a model rather than a pile of constructs. Verify `Add variable`'s seeded companion
      constraint (`E339` avoidance) never leaves a variable unreferenced, then delete that placeholder once a real
      constraint references the variable and confirm the model still links. Exercise `Switch to minimise` /
      `Switch to maximise`. Add a `timeLimit` setting. Execute — this needs the solver wired in
      [Phase 1](improvement-phase-1.md).

- [x] **Step 10 — rename under load.** Rename the `application` context, touching every downstream reference built in
      Steps 1, 4, 8 and 9. Assert every dependent row's displayed expression follows, and the model still links and
      executes. Also rename a nested row and a relation column in the same step, and assert the description and
      test-case overlays followed. *(Gated on Bug 10 — write against the fixed behaviour and fixme until it lands.)*

- [x] **Step 11 — bulk maintenance pass.** In one continuous sequence: reorder two `riskTier` rules by drag,
      duplicate a rule, delete the duplicate, add a fourth condition column, delete a different existing column,
      rename yet another, reorder two columns, change one column's type. Chained back-to-back, not in isolation —
      that chaining is what the original bugs needed to surface. Execute once at the end and assert the result still
      matches the intent.

- [x] **Step 12 — read-only handoff.** Re-render the same underlying service in `readOnly` mode, simulating handing
      the finished model to a reviewer. Confirm no mutation control survives — **except** `Duplicate` and
      `Expand`/`Collapse`, which are explicitly `nonMutating` and must remain.

- [x] **Step 13 — final execution audit.** Run the model with 3+ distinct applicant/application input sets chosen to
      hit different branches of `riskTier` (first-rule match, later-rule match, default fallback), and confirm
      `portfolioMix` re-optimises consistently against each. Then assert the finished model against the target shape
      above.

---

## Definition of done

- [x] The spec builds the target model from `{}` using only UI gestures.
- [x] All 21 row kinds are created by this flow, or the exception is filed in
      [`current-bugs.md`](current-bugs.md).
- [x] Every step asserts cumulatively through `live-result` / `live-model`.
- [x] Any step still fixme'd names its blocking bug in the step title.
- [x] `tsc --noEmit` clean; the full `e2e/boxed-editor` suite green.

**Result:** the single BlankModel-only scenario now completes all 13 steps. Overlay migration in Step 10 is also
covered directly by `rename.spec.ts`, while the capstone verifies the same live service remains linkable and
executable through context, nested-field, and relation-column renames.
