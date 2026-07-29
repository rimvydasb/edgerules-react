# EdgeRules WASM Upgrade

Check the latest version on https://www.npmjs.com/package/@edgerules/web?activeTab=versions

## Upgrade Steps

1. Update the `@edgerules/web` dependency in your `package.json` to the latest version.
2. Check `engine-bug-reports.md` for the engine bugs that might be solved by this upgrade. Check if bugs are solved.
    - if bug is solved, simply delete it from `engine-bug-reports.md` - no explanation is needed.
    - if bug is not solved, add a comment to the bug report with the version of the engine that you upgraded to
3. Find out all relevant code places that are needed to be updated due to changed API of the new version. Update those
   code places. It could be that code contains work-around for engine bugs that are solved in the new version. In this
   case, fix those workarounds.