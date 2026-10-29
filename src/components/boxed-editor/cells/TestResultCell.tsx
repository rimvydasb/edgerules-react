// Known violation: `Loader` renders in every running row; replace it with a CSS Module spinner.
// oxlint-disable-next-line no-restricted-imports -- known violation, see above
import {Loader, Tooltip} from '@mantine/core';
import {IconAlertCircleFilled, IconChevronLeft, IconChevronRight} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';
import {useBoxedEditorTestContext} from '../context/BoxedEditorTestContext';
import {useRowTestResult} from '../hooks/useRowTestResult';

export interface TestResultCellProps {
    path: string;
    /** On the subject's own row: show the whole result there (a decision table, whose rows are rules). */
    showSubjectResult?: boolean;
}

// One value as cell text. An object lists its fields inline (`grade: A, probabilityOfDefault: 0.005`); a nested one
// keeps its braces.
function formatInline(value: unknown, nested = false): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    if (typeof value === 'object') {
        const fields = Object.entries(value)
            .map(([key, field]) => `${key}: ${formatInline(field, true)}`)
            .join(', ');
        return nested ? `{${fields}}` : fields;
    }
    return String(value);
}

function formatResultValue(value: unknown): {text: string; tooltip?: string} {
    const text = formatInline(value);
    if (typeof value === 'string') return {text, tooltip: value};
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return {text, tooltip: JSON.stringify(value, null, 2)};
    }
    return {text};
}

/**
 * The test column heading in the editor's header row: the selected case, `i/N`, the running spinner, the run-level
 * error chip, and the previous/next buttons in one closing step cell (Section 6, "Header").
 */
export function TestResultsHeader(): ReactElement {
    const {cases, currentIndex, currentCase, next, prev, running, runError} = useBoxedEditorTestContext();
    const isRunning = currentCase !== undefined && running.includes(currentCase.id);

    if (cases.length === 0) {
        return (
            <div className={classes.resultHeader}>
                <span className={cx(classes.resultLabel, classes.disabledText, classes.italic)}>No test cases</span>
            </div>
        );
    }

    return (
        <div className={classes.resultHeader}>
            <div className={classes.resultLabel}>
                <Tooltip label={currentCase?.name ?? ''} disabled={!currentCase} withinPortal>
                    <span className={classes.resultName}>{currentCase?.name}</span>
                </Tooltip>
                {isRunning && <Loader aria-label="Running" size={12} />}
                {!isRunning && runError && (
                    <Tooltip label={runError} withinPortal>
                        <IconAlertCircleFilled aria-label="Run error" size={14} className={classes.runError} />
                    </Tooltip>
                )}
                <span className={classes.resultCount}>
                    {currentIndex + 1}/{cases.length}
                </span>
            </div>
            <div className={classes.navCell}>
                <button
                    type="button"
                    aria-label="Previous test case"
                    disabled={currentIndex === 0}
                    onClick={prev}
                    className={classes.nav}
                >
                    <IconChevronLeft size={16} />
                </button>
                <button
                    type="button"
                    aria-label="Next test case"
                    disabled={currentIndex >= cases.length - 1}
                    onClick={next}
                    className={classes.nav}
                >
                    <IconChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}

/** That row's value for the selected test case (Section 8, "Result formatting"). */
export function TestResultCell({path, showSubjectResult}: TestResultCellProps): ReactElement {
    const {result, pending, stale} = useRowTestResult(path, showSubjectResult);

    if (pending) {
        return <span className={cx(classes.ellipsis, classes.disabledText, classes.italic)}>…</span>;
    }

    if (result?.status === 'error') {
        return (
            <Tooltip label={result.error ?? ''} disabled={!result.error} withinPortal>
                <span className={cx(classes.ellipsis, classes.disabledText)}>{result.error}</span>
            </Tooltip>
        );
    }

    const {text, tooltip} = formatResultValue(result?.value);

    return (
        <Tooltip label={tooltip ?? ''} disabled={!tooltip} withinPortal>
            <span className={cx(classes.ellipsis, stale && classes.stale)} data-stale={stale || undefined}>
                {text}
            </span>
        </Tooltip>
    );
}
