import Box from '@mui/material/Box';
import type { ReactElement } from 'react';
import type { TestRow } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { useResult } from '../hooks/useCell';
import { formatValue } from '../model/values';

// Read-only. Exists purely to inspect what a path evaluates to. A stale value renders muted.
export function ValidationCell({
  testCaseId,
  row,
}: {
  testCaseId: string;
  row: TestRow;
}): ReactElement {
  const { testCases, revision } = useTestsManagerContext();
  const { result, isStale } = useResult(testCases, testCaseId, row, revision);

  return (
    <Box
      data-testid={`validation-${row.path}`}
      sx={{
        color: isStale ? 'text.disabled' : 'text.primary',
        fontStyle: isStale ? 'italic' : 'normal',
        position: 'absolute',
        inset: 0,
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {result ? formatValue(result.value) : ''}
    </Box>
  );
}
