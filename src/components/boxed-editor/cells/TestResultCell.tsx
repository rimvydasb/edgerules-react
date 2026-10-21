import {Loader, Tooltip} from '@mantine/core';
import {IconAlertCircleFilled} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import {useBoxedEditorTestContext} from '../context/BoxedEditorTestContext';
import {useRowTestResult} from '../hooks/useRowTestResult';

export interface TestResultCellProps {
    path: string;
}

function formatResultValue(value: unknown): {text: string; tooltip?: string} {
    if (value === undefined) return {text: ''};
    if (typeof value === 'number') return {text: value.toLocaleString()};
    if (typeof value === 'boolean') return {text: value ? 'true' : 'false'};
    if (Array.isArray(value)) return {text: `${value.length} item${value.length === 1 ? '' : 's'}`};
    if (typeof value === 'string') return {text: value, tooltip: value};
    if (typeof value === 'object' && value !== null) {
        return {text: '{…}', tooltip: JSON.stringify(value, null, 2)};
    }
    return {text: String(value)};
}

/**
 * Header controls rendered in place of the model root's own cell: selected case, `i/N`,
 * previous/next, the running spinner, and the run-level error chip (Section 6, "Header").
 */
function TestResultsHeader(): ReactElement {
    const {cases, currentIndex, currentCase, next, prev, running, runError} = useBoxedEditorTestContext();
    const isRunning = currentCase !== undefined && running.includes(currentCase.id);

    if (cases.length === 0) {
        return <span className={cx(classes.ellipsis, classes.disabledText, classes.italic)}>No test cases</span>;
    }

    return (
        <div className={classes.resultHeader}>
            <button
                type="button"
                aria-label="Previous test case"
                disabled={currentIndex === 0}
                onClick={prev}
                className={classes.nav}
            >
                ‹
            </button>
            <Tooltip label={currentCase?.name ?? ''} disabled={!currentCase} withinPortal>
                <span className={classes.resultName}>{currentCase?.name}</span>
            </Tooltip>
            <span className={classes.resultCount}>
                {currentIndex + 1}/{cases.length}
            </span>
            <button
                type="button"
                aria-label="Next test case"
                disabled={currentIndex >= cases.length - 1}
                onClick={next}
                className={classes.nav}
            >
                ›
            </button>
            {isRunning && <Loader aria-label="Running" size={12} />}
            {!isRunning && runError && (
                <Tooltip label={runError} withinPortal>
                    <IconAlertCircleFilled aria-label="Run error" size={14} className={classes.runError} />
                </Tooltip>
            )}
        </div>
    );
}

/**
 * That row's value for the selected test case (Section 8, "Result formatting"), or — at the model
 * root — the column header (Section 6).
 */
export function TestResultCell({path}: TestResultCellProps): ReactElement {
    const {result, pending, stale} = useRowTestResult(path);

    if (path === '*') return <TestResultsHeader />;

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
