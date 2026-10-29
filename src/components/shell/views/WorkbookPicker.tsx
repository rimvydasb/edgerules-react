import {Paper, Text, UnstyledButton} from '@mantine/core';
import type {ReactElement} from 'react';
import * as classes from '../shell.module.css';

export interface WorkbookPickerProps {
    workbooks: readonly string[];
    onSelect: (workbook: string) => void;
}

/** The Flow view of the model root when the model has workbooks: one panel per workbook, a click opens its flow. */
export function WorkbookPicker({workbooks, onSelect}: WorkbookPickerProps): ReactElement {
    return (
        <div className={classes.workbooks} data-testid="shell-workbook-picker">
            {workbooks.map((name) => (
                <UnstyledButton key={name} onClick={() => onSelect(name)} aria-label={name}>
                    <Paper withBorder p="xl" className={classes.workbookPanel}>
                        <Text fw={600} size="xl">
                            {name}
                        </Text>
                    </Paper>
                </UnstyledButton>
            ))}
        </div>
    );
}
