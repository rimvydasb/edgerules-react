import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/Error';
import Tooltip from '@mui/material/Tooltip';
import type { ReactElement } from 'react';
import { useBoxedEditorTestContext } from '../context/BoxedEditorTestContext';
import { useRowTestResult } from '../hooks/useRowTestResult';

export interface TestResultCellProps {
  path: string;
}

const ELLIPSIS_SX = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const NAV_BUTTON_SX = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  p: 0,
  lineHeight: 1,
  fontSize: '1rem',
  color: 'text.secondary',
  '&:disabled': { opacity: 0.3, cursor: 'default' },
} as const;

function formatResultValue(value: unknown): { text: string; tooltip?: string } {
  if (value === undefined) return { text: '' };
  if (typeof value === 'number') return { text: value.toLocaleString() };
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false' };
  if (Array.isArray(value)) return { text: `${value.length} item${value.length === 1 ? '' : 's'}` };
  if (typeof value === 'string') return { text: value, tooltip: value };
  if (typeof value === 'object' && value !== null) {
    return { text: '{…}', tooltip: JSON.stringify(value, null, 2) };
  }
  return { text: String(value) };
}

/**
 * Header controls rendered in place of the model root's own cell: selected case, `i/N`,
 * previous/next, the running spinner, and the run-level error chip (Section 6, "Header").
 */
function TestResultsHeader(): ReactElement {
  const { cases, currentIndex, currentCase, next, prev, running, runError } = useBoxedEditorTestContext();
  const isRunning = currentCase !== undefined && running.includes(currentCase.id);

  if (cases.length === 0) {
    return (
      <Box component="span" sx={{ ...ELLIPSIS_SX, color: 'text.disabled', fontStyle: 'italic' }}>
        No test cases
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', minWidth: 0 }}>
      <Box
        component="button"
        type="button"
        aria-label="Previous test case"
        disabled={currentIndex === 0}
        onClick={prev}
        sx={NAV_BUTTON_SX}
      >
        ‹
      </Box>
      <Tooltip title={currentCase?.name ?? ''}>
        <Box component="span" sx={{ ...ELLIPSIS_SX, flex: 1, fontSize: '0.75rem' }}>
          {currentCase?.name}
        </Box>
      </Tooltip>
      <Box component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
        {currentIndex + 1}/{cases.length}
      </Box>
      <Box
        component="button"
        type="button"
        aria-label="Next test case"
        disabled={currentIndex >= cases.length - 1}
        onClick={next}
        sx={NAV_BUTTON_SX}
      >
        ›
      </Box>
      {isRunning && <CircularProgress aria-label="Running" size={12} />}
      {!isRunning && runError && (
        <Tooltip title={runError}>
          <ErrorOutlineIcon aria-label="Run error" color="error" sx={{ fontSize: 14 }} />
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * That row's value for the selected test case (Section 8, "Result formatting"), or — at the model
 * root — the column header (Section 6).
 */
export function TestResultCell({ path }: TestResultCellProps): ReactElement {
  const { result, pending, stale } = useRowTestResult(path);

  if (path === '*') return <TestResultsHeader />;

  if (pending) {
    return (
      <Box component="span" sx={{ ...ELLIPSIS_SX, color: 'text.disabled', fontStyle: 'italic' }}>
        …
      </Box>
    );
  }

  if (result?.status === 'error') {
    return (
      <Tooltip title={result.error ?? ''}>
        <Box component="span" sx={{ ...ELLIPSIS_SX, color: 'text.disabled' }}>
          {result.error}
        </Box>
      </Tooltip>
    );
  }

  const { text, tooltip } = formatResultValue(result?.value);

  return (
    <Tooltip title={tooltip ?? ''}>
      <Box
        component="span"
        sx={{
          ...ELLIPSIS_SX,
          fontStyle: stale ? 'italic' : 'normal',
          color: stale ? 'text.disabled' : 'inherit',
        }}
      >
        {text}
      </Box>
    </Tooltip>
  );
}
