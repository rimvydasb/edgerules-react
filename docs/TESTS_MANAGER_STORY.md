# Tests Manager Story

Tests Manager will be able to provide a maintenance for all test cases for the selected model. All test cases and test
results will be persisted and accessed via `TestCasesService`.

## Tests Manager GUI

- **Path column**: shows the path to the model field that is being tested. Since EdgeRules models are referentialy
  transparent, user can set any value to the model.
- **Path column header**: is a drop-down selection that allows choosing the whole model and all first level functions
  that have all arguments typed.
- **Description column**: is filled by `DocumentationService` that either pulls already existing descriptions found by
  path and model name or allows user adding new description.
- **Test Case columns**: each column represents a test case. User can add new test cases or remove existing ones with
  context menu actions that are available for each test case individually.
- **Paging**: if the model has more than allowed number of test cases, the GUI will show paging.
- **Assertions**: the GUI will assert results against values in cells that are entered by the user. Not matching
  cells will be highlighted in red. Tooltip shows real factual value.
- **Validations**: the GUI will show results in cells. Those cells are read-only and dedicated just to view the result.
  `Validations` is very useful when user does not really know what value is returned, but want to visually inspect it.
- **::**: indicates drag drop handle for the row. User can drag and drop rows to reorder them.
- **:**: this is three dots icon for context menu that is available for each test case.

### General Language

- Tests Manager GUI follows the same language as Boxed Editor GUI:
    - Everything else is single-height (40px) and grows only in 40px steps if it needs to wrap.
    - Same icons for drag and drop, add, remove, context menu, etc.
    - Same spacing, padding, and margins, context menu style, and row hover effects.

### Workbook Testing

The particular GUI shows how `Workbook` is being tested. Workbook kind of model is a `context` with multiple fields.

|    | Model Name              ▼ | Description           | Test Case 1         : | Test Case 2         : | ... | Test Case N         : |
|----|---------------------------|-----------------------|-----------------------|-----------------------|-----|-----------------------|
| :: | `name`                    | `User Name`           | `Steve`               | `John`                | ... | `Mary`                |
| :: | `age`                     | `User Age`            | `30`                  | `25`                  | ... | `40`                  |
| :: | `credit.balance`          | `User Credit Balance` | `1000`                | `0`                   | ... | `-100`                |
| :: | `credit.limit`            | `User Credit Limit`   | `2000`                | `0`                   | ... | `10000`               |
|    | ___                       | ___                   | ___                   | ___                   | ___ | ___                   |
|    | Assertions                |                       | `Test Case 1 Results` | `Test Case 2 Results` | ... | `Test Case N Results` |
| :: | `creditDecision.approved` | `Credit Approved`     | `true`                | `false`               | ... | `false`               |
| :: | `creditDecision.limit`    | `Credit Limit`        | `10000`               | `0`                   | ... | `10000`               |
|    | ___                       | ___                   | ___                   | ___                   | ___ | ___                   |
|    | Validations               |                       |                       |                       | ... |                       |
| :: | `maxLimit`                | `Maximum Limit`       | `10000`               | `10000`               | ... | `10000`               |

**Example model for the above test manager GUI:**

```edgerules
{
    maxLimit: 10000,
    name: <string, required: true>,
    age: <number, required: true>,
    credit: {
        balance: <number, required: true>,
        limit: <number, required: true>
    },
    creditDecision: {
        approved: if credit.balance >= 0 and age > 17 then true else false,
        limit: if approved then maxLimit else 0
    }
}
```

### Decision Service Testing

```edgerules
{
  type Credit: {
    balance: <number, required: true>,
    limit: <number, required: true>
  }
   maxLimit: 10000,
   func creditDecision(name: string, age: number, credit: Credit): {
      approved: if creditBalance >= 0 and age > 17 then true else false,
      limit: if approved then maxLimit else 0
   }
}
```

| creditDecision   | Description           | ... |
|------------------|-----------------------|-----|
| `name`           | `User Name`           | ... |
| `age`            | `User Age`            | ... |
| `credit.balance` | `User Credit Balance` | ... |
| `credit.limit`   | `User Credit Limit`   | ... |
| ___              | ___                   | ___ |
| Assertions       |                       | ... |
| `approved`       | `Credit Approved`     | ... |
| `limit`          | `Credit Limit`        | ... |

## Object Model

```typescript

```