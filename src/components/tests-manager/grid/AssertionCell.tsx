import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import type { TestRow } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { useCell } from '../hooks/useCell';
import { FILL_CELL_SX } from './gridStyle';
import { formatValue } from '../model/values';

// Editable expected value. A cell whose expected value does not equal the computed value is
// highlighted in red and its tooltip shows the actual value; a stale result never highlights.
export function AssertionCell({
  testCaseId,
  row,
}: {
  testCaseId: string;
  row: TestRow;
}): ReactElement {
  const { testCasesService, readOnly, revision } = useTestsManagerContext();
  const cell = useCell(testCasesService, testCaseId, row, 'assertion', revision);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const value = draft ?? cell.text;
  const mismatch = value !== '' && cell.isMatch === false;

  const commit = (): void => {
    if (draft !== undefined && draft !== cell.text) cell.setText(draft);
    setDraft(undefined);
  };

  // Always wrapped in the same `Tooltip`, with an empty (non-shown) title when there is no
  // mismatch — conditionally wrapping only when `mismatch` is true would change the element tree
  // shape on every toggle, remounting the input and dropping focus mid-edit.
  return (
    <Tooltip title={mismatch ? formatValue(cell.result?.value) : ''}>
      <TextField
        variant="standard"
        size="small"
        fullWidth
        value={value}
        disabled={readOnly}
        slotProps={{
          htmlInput: {
            'aria-label': `assertion ${row.path}`,
            'data-mismatch': mismatch,
          },
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        sx={[
          FILL_CELL_SX,
          mismatch
            ? { '& .MuiInputBase-input': { color: 'error.main', fontWeight: 600 } }
            : false,
        ]}
      />
    </Tooltip>
  );
}
