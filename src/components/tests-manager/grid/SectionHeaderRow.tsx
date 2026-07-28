import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import type {ReactElement} from 'react';
import type {TestCase, TestCasesService, TestRow, TestSectionId} from '../../test-cases-service';
import {useForceUpdateOn} from '../hooks/useForceUpdate';
import {CELL_BORDER_SX} from './gridStyle';
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
    // A stale column shows no counter — scoring an expectation against a value the current model
    // would not produce is worse than no tick.
    if (resultSet && resultSet.modelRevision !== currentRevision) return undefined;

    let total = 0;
    let passed = 0;
    for (const row of rows) {
        // A row the model no longer declares can never be satisfied again — don't let leftover
        // assertion data on it count toward or against the pass rate.
        if (!row.present) continue;
        const expected = testCasesService.getCell(testCaseId, row.path, 'assertion');
        if (!expected) continue;
        total += 1;
        if (matches(expected, resultSet?.results[row.path]?.value, row.type)) passed += 1;
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
        <TableRow sx={{backgroundColor: 'action.hover'}} data-testid={`section-${sectionId}`}>
            <TableCell
                colSpan={4}
                sx={{
                    ...CELL_BORDER_SX,
                    fontWeight: 600,
                    position: 'sticky',
                    left: 0,
                    backgroundColor: 'action.hover',
                    zIndex: 1,
                }}
            >
                {SECTION_LABELS[sectionId]}
            </TableCell>
            {visibleCases.map((testCase) => {
                const summary =
                    sectionId === 'assertions'
                        ? assertionSummary(testCasesService, rows, testCase.id, revision)
                        : undefined;
                return (
                    <TableCell
                        key={testCase.id}
                        align="center"
                        sx={CELL_BORDER_SX}
                        data-testid={sectionId === 'assertions' ? `assertion-summary-${testCase.id}` : undefined}
                    >
                        {summary ? (
                            <span
                                style={{
                                    color: summary.allPass ? 'green' : 'red',
                                    fontWeight: 600,
                                }}
                            >
                                {summary.label} {summary.allPass ? '✓' : '✗'}
                            </span>
                        ) : null}
                    </TableCell>
                );
            })}
        </TableRow>
    );
}
