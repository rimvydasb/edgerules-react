import type {ReactElement} from 'react';
import type {TestCase, TestCasesService, TestRow, TestSectionId} from '../../test-cases-service';
import {useForceUpdateOn} from '../hooks/useForceUpdate';
import {cx} from '#ui/cx';
import {GridCell, GridRow} from '#ui/grid';
import * as classes from './testsGrid.module.css';
import {matches} from '../model/values';

const SECTION_LABELS: Record<TestSectionId, string> = {
    inputs: 'Inputs',
    assertions: 'Assertions',
    validations: 'Validations',
};

function assertionSummary(
    testCasesService: TestCasesService,
    rows: TestRow[],
    testCaseId: string,
    revision: string | number | undefined,
): {label: string; allPass: boolean} | undefined {
    const resultSet = testCasesService.getResultSet(testCaseId);
    const currentRevision = revision === undefined ? undefined : String(revision);
    // A column that has not run, or a stale one, shows no counter — scoring an expectation against
    // a value the current model would not produce is worse than no tick.
    if (!resultSet || resultSet.modelRevision !== currentRevision) return undefined;

    let total = 0;
    let passed = 0;
    for (const row of rows) {
        // A row the model no longer declares can never be satisfied again — don't let leftover
        // assertion data on it count toward or against the pass rate.
        if (!row.present) continue;
        const expected = testCasesService.getCell(testCaseId, row.path, 'assertion');
        if (!expected) continue;
        total += 1;
        if (matches(expected, resultSet.results[row.path]?.value, row.type)) passed += 1;
    }
    if (total === 0) return undefined;
    return {label: `${passed}/${total}`, allPass: passed === total};
}

// Inputs / Assertions / Validations separators; the Assertions row carries each column's pass
// counter.
export function SectionHeaderRow({
    sectionId,
    rows,
    testCasesService,
    visibleCases,
    revision,
}: {
    sectionId: TestSectionId;
    rows: TestRow[];
    testCasesService: TestCasesService;
    visibleCases: TestCase[];
    revision: string | number | undefined;
}): ReactElement {
    useForceUpdateOn(testCasesService.subscribe);

    return (
        <GridRow className={classes.section} data-testid={`section-${sectionId}`}>
            <GridCell colSpan={4} className={cx(classes.section, classes.sectionSticky)}>
                {SECTION_LABELS[sectionId]}
            </GridCell>
            {visibleCases.map((testCase) => {
                const summary =
                    sectionId === 'assertions'
                        ? assertionSummary(testCasesService, rows, testCase.id, revision)
                        : undefined;
                return (
                    <GridCell
                        key={testCase.id}
                        align="center"
                        className={classes.section}
                        data-testid={sectionId === 'assertions' ? `assertion-summary-${testCase.id}` : undefined}
                    >
                        {summary ? (
                            <span className={summary.allPass ? classes.pass : classes.fail}>
                                {summary.label} {summary.allPass ? '✓' : '✗'}
                            </span>
                        ) : null}
                    </GridCell>
                );
            })}
            <GridCell className={classes.section} />
        </GridRow>
    );
}
