import {IconArrowRight, IconBook2} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {KIND_COLORS} from '#ui/kindColors';
import * as classes from '../shell.module.css';

/** One workbook of the model, as its panel shows it. */
export interface WorkbookSummary {
    path: string; // the field name of the workbook
    name?: string; // the `name` of its `@Workbook` annotation
    description?: string; // from the documentation store
    inputs: number; // its `@InputNode` fields
    functions: number; // its `@FunctionNode` fields
}

export interface WorkbookPickerProps {
    workbooks: readonly WorkbookSummary[];
    onSelect: (workbook: string) => void;
}

function count(value: number, noun: string): string {
    return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/**
 * The Flow view of the model root when the model has workbooks: one panel per workbook with its name, its field name,
 * its description and its node counts. A click opens its flow.
 */
export function WorkbookPicker({workbooks, onSelect}: WorkbookPickerProps): ReactElement {
    return (
        <div className={classes.workbooks} data-testid="shell-workbook-picker">
            {workbooks.map((workbook) => {
                const title = workbook.name ?? workbook.path;
                return (
                    <button
                        key={workbook.path}
                        type="button"
                        className={classes.workbookPanel}
                        onClick={() => onSelect(workbook.path)}
                        aria-label={title}
                        aria-description={workbook.description}
                        data-testid={`shell-workbook-${workbook.path}`}
                    >
                        <span className={classes.workbookHead}>
                            <span className={classes.workbookIcon} style={{backgroundColor: KIND_COLORS.model}}>
                                <IconBook2 aria-hidden="true" size={20} color="#fff" />
                            </span>
                            <span className={classes.workbookTitles}>
                                <span className={classes.workbookTitle}>{title}</span>
                                {workbook.name !== undefined && (
                                    <code className={classes.workbookField}>{workbook.path}</code>
                                )}
                            </span>
                        </span>
                        <span
                            className={
                                workbook.description ? classes.workbookDescription : classes.workbookNoDescription
                            }
                        >
                            {workbook.description || 'No description'}
                        </span>
                        <span className={classes.workbookFooter}>
                            <span>
                                {count(workbook.inputs, 'input')} · {count(workbook.functions, 'function')}
                            </span>
                            <span className={classes.workbookOpen}>
                                Open flow
                                <IconArrowRight aria-hidden="true" size={14} />
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
