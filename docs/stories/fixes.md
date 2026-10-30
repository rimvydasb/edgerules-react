- [ ] Eliminate `Fit to width` in general - all elements must Fit to width by default always.
- [ ] Rename `Show the selected node beside the flow` to `Split view` and `Hide the selected node` to
  `Close split view`. Also, split view must be always on by default.
- [ ] Only when Boxed Editor opens in split view, add `Icon arrow-autofit-width` (Expand) on the left of
  `Show description`. When clicked, navigation will point to that Boxed Editor of that element. Expand icon will
  disappear then.
- [ ] `Shell` navigation must track from where I opened Boxed Editor. If `Boxed Editor` was opened from the flow, to
  `ShellBreadcrumbs` add intermediate navigation element of that flow. For example if I open `yearlySummary(...)` from
  `mortgageBook`, then navigation will look like this: `Loan Repayment Planner` > `Mortgage plan` >
  `yearlySummary(...)`. When I click `Mortgage plan`, then I should be navigated back to that workbook.
- [ ] `Workbook settings` modal popup must be wider, and name and description fields must be with white background.