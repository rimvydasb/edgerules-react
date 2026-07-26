import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

// Every cell in the grid gets a full border (not just the horizontal rule MUI's `Table` draws by
// default) so the sheet reads as a solid bordered grid, matching the reference design.
export const CELL_BORDER_SX: SystemStyleObject<Theme> = {
  border: '1px solid',
  borderColor: 'divider',
};

// The `TableCell` an `InputCell`/`AssertionCell` sits in must be `position: relative` with zero
// padding (see `TestRowLine`) — a percentage height on the field itself can't resolve reliably
// against an auto-sized table cell (the cell's own height depends on its content, a circular
// reference most browsers just punt on), so the field is instead absolutely positioned to the
// cell's full padding box, which *does* resolve against the cell's final, already-laid-out size.
// Tints a row whose path the model no longer declares (`TestRow.present: false`) — kept visible,
// with its data, rather than hidden, per `TestRowLine`'s `WarningAmberIcon` treatment.
export const DELETED_ROW_BG = 'rgba(211, 47, 47, 0.12)';

export const FILL_CELL_SX: SystemStyleObject<Theme> = {
  position: 'absolute',
  inset: 0,
  '& .MuiInputBase-root': {
    height: '100%',
  },
  '& .MuiInput-underline:before': { border: 'none' },
  '& .MuiInput-underline:after': { border: 'none' },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { border: 'none' },
  '& .MuiInputBase-input': {
    height: '100%',
    boxSizing: 'border-box',
    padding: '0 8px',
  },
};
