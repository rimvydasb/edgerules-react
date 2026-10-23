import type {ReactElement} from 'react';
import type {TestRow} from '../../test-cases-service';
import {cx} from '#ui/cx';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {useResult} from '../hooks/useCell';
import {formatValue} from '../model/values';
import * as classes from './testsGrid.module.css';

// Read-only. Exists purely to inspect what a path evaluates to. A stale value renders muted.
export function ValidationCell({testCaseId, row}: {testCaseId: string; row: TestRow}): ReactElement {
    const {testCasesService, revision} = useTestsManagerContext();
    const {result, isStale} = useResult(testCasesService, testCaseId, row, revision);

    return (
        <div
            data-testid={`validation-${row.path}`}
            data-stale={isStale || undefined}
            className={cx(classes.value, isStale && classes.stale)}
        >
            {result ? formatValue(result.value) : ''}
        </div>
    );
}
