import type { ReactElement, ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

export function EditorDialog({
  open,
  title,
  children,
  error,
  onCancel,
  onSubmit,
  submitLabel,
  minWidth = 360,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  error?: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  minWidth?: number;
}): ReactElement {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth }}>
        {children}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onSubmit}>{submitLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
