import TextField from '@mui/material/TextField';
import {useState, type KeyboardEvent, type ReactElement} from 'react';
import type {TestRow} from '../../test-cases-service';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {useCell} from '../hooks/useCell';
import {FILL_CELL_SX} from './gridStyle';
import {CellParseError, parseCell} from '../model/values';

// Editable, type-directed parsing. Committing an edit (blur or Enter) persists it and — when
// `autoRun` is on — re-runs this test case; committing never blocks on the run itself.
export function InputCell({testCaseId, row}: {testCaseId: string; row: TestRow}): ReactElement {
    const {testCasesService, runner, readOnly, autoRun, revision} = useTestsManagerContext();
    const cell = useCell(testCasesService, testCaseId, row, 'input', revision);
    const [draft, setDraft] = useState<string | undefined>(undefined);
    const value = draft ?? cell.text;

    let invalid = false;
    if (value !== '') {
        try {
            parseCell(value, row.type);
        } catch (error) {
            invalid = error instanceof CellParseError;
        }
    }

    const commit = (): void => {
        if (draft !== undefined && draft !== cell.text) {
            cell.setText(draft);
            if (autoRun) void runner.run(testCaseId);
        }
        setDraft(undefined);
    };

    return (
        <TextField
            variant="standard"
            size="small"
            fullWidth
            value={value}
            disabled={readOnly}
            error={invalid}
            slotProps={{htmlInput: {'aria-label': `input ${row.path}`}}}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
            sx={FILL_CELL_SX}
        />
    );
}
