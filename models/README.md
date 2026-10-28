# Models

Complete, realistic EdgeRules projects that the components are tested and demonstrated with. Each model is one project
bundle: the DSL model and the documentation, tests and flow slices that a host stores next to it.

| Model                                         | Shows                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [loan-repayment](loan-repayment/index.ts)     | Types, a decision table, functions, a `@Service`, two `@Workbook`s with charts, test suites                                                           |
| [loan-origination](loan-origination/index.ts) | Records, a scorecard and three decision tables, policy rules, affordability, a `@Service`, two `@Workbook`s with charts, test suites over list inputs |

## Layout of a Model

```text
models/<model-name>/
├── index.ts          # <MODEL>_PROJECT: the ProjectBundleInput for ProjectFactory.createBundle
├── model.ts          # the EdgeRules DSL
├── documentation.ts  # documentation.json: description by model path
├── tests.ts          # tests.json: test suites by subject
├── flow.ts           # flow.json: Flow Editor layouts (outputs, charts) by flow root
└── __tests__/        # vitest with the real @edgerules/node engine
```

## Rules

- A model MUST link and execute with the engine version of `package.json`. Its `__tests__` prove it: every authored test
  case passes through the Tests Manager runner, and every documentation path, output and chart source exists.
- Stories open a model with `openStoryProject(<MODEL>_PROJECT)`. Playwright specs of a model are in
  `e2e/models/<model-name>.spec.ts`.
- Keep values deterministic: tests and specs assert exact engine results.
- A test row of a list element other than `[0]` (`applicants[1].name`) is `custom: true`. The schema derives only `[0]`,
  so the Tests view drops a row it cannot derive unless the row is user-authored.
