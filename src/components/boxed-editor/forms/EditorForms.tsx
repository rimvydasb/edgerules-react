import type { Dispatch, ReactElement, SetStateAction } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type {
  AddFieldDraft,
  ListItemDraft,
  RelationColumnDraft,
  SignatureDraft,
} from '../boxed-editor-types';
import { childPath } from '../boxed-editor-utils';
import { EditorDialog } from '../primitives/EditorDialog';

type Setter<T> = Dispatch<SetStateAction<T | null>>;

export function AddFieldForm({
  draft,
  setDraft,
  error,
  commit,
}: {
  draft: AddFieldDraft | null;
  setDraft: Setter<AddFieldDraft>;
  error?: string;
  commit: () => void;
}): ReactElement {
  return (
    <EditorDialog
      open={Boolean(draft)}
      title="Add field"
      error={error ?? (draft ? undefined : '')}
      onCancel={() => setDraft(null)}
      onSubmit={commit}
      submitLabel="Add field"
      minWidth={300}
    >
      <TextField
        autoFocus
        label="Name"
        value={draft?.name ?? ''}
        onChange={(event) =>
          setDraft((current) =>
            current ? { ...current, name: event.target.value } : current,
          )
        }
      />
      <Select
        aria-label="Field kind"
        value={draft?.kind ?? 'expression'}
        onChange={(event) =>
          setDraft((current) =>
            current
              ? {
                  ...current,
                  kind: event.target.value as AddFieldDraft['kind'],
                }
              : current,
          )
        }
      >
        <MenuItem value="expression">Expression</MenuItem>
        <MenuItem value="input">Input</MenuItem>
        <MenuItem value="context">Context</MenuItem>
        <MenuItem value="list">Literal list</MenuItem>
      </Select>
    </EditorDialog>
  );
}

export function FunctionSignatureForm({
  draft,
  setDraft,
  error,
  commit,
}: {
  draft: SignatureDraft | null;
  setDraft: Setter<SignatureDraft>;
  error?: string;
  commit: () => void;
}): ReactElement {
  return (
    <EditorDialog
      open={Boolean(draft)}
      title={`Edit ${draft?.external ? 'external function' : 'function'} signature`}
      error={error}
      onCancel={() => setDraft(null)}
      onSubmit={commit}
      submitLabel="Save signature"
      minWidth={420}
    >
      {draft?.parameters.map((parameter, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label={`Parameter ${index + 1} name`}
            value={parameter.name}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      parameters: current.parameters.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    }
                  : current,
              )
            }
          />
          <TextField
            label={`Parameter ${index + 1} type`}
            value={parameter.type}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      parameters: current.parameters.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, type: event.target.value }
                          : item,
                      ),
                    }
                  : current,
              )
            }
          />
          <IconButton
            aria-label={`Remove parameter ${index + 1}`}
            onClick={() =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      parameters: current.parameters.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }
                  : current,
              )
            }
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        onClick={() =>
          setDraft((current) =>
            current
              ? {
                  ...current,
                  parameters: [
                    ...current.parameters,
                    { name: '', type: 'number' },
                  ],
                }
              : current,
          )
        }
      >
        Add parameter
      </Button>
      <TextField
        label="Return type"
        value={draft?.returnType ?? ''}
        onChange={(event) =>
          setDraft((current) =>
            current ? { ...current, returnType: event.target.value } : current,
          )
        }
      />
    </EditorDialog>
  );
}

export function ListItemForm({
  draft,
  setDraft,
  commit,
}: {
  draft: ListItemDraft | null;
  setDraft: Setter<ListItemDraft>;
  commit: () => void;
}): ReactElement {
  return (
    <EditorDialog
      open={Boolean(draft)}
      title={`Add ${draft?.relation ? 'relation row' : 'list item'}`}
      onCancel={() => setDraft(null)}
      onSubmit={commit}
      submitLabel="Add"
    >
      {draft?.fields.map((field, index) => (
        <TextField
          key={field.name}
          label={
            draft.relation ? `${field.name} expression` : 'Item expression'
          }
          value={field.value}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    fields: current.fields.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  }
                : current,
            )
          }
        />
      ))}
    </EditorDialog>
  );
}

export function RelationColumnForm({
  draft,
  setDraft,
  commit,
}: {
  draft: RelationColumnDraft | null;
  setDraft: Setter<RelationColumnDraft>;
  commit: () => void;
}): ReactElement {
  const title =
    draft?.action === 'add'
      ? 'Add relation column'
      : draft?.action === 'rename'
        ? 'Rename relation column'
        : 'Delete relation column';
  return (
    <EditorDialog
      open={Boolean(draft)}
      title={title}
      onCancel={() => setDraft(null)}
      onSubmit={commit}
      submitLabel={draft?.action === 'delete' ? 'Delete column' : 'Save column'}
    >
      {draft?.action !== 'delete' && (
        <TextField
          autoFocus
          label="Column name"
          value={draft?.name ?? ''}
          onChange={(event) =>
            setDraft((current) =>
              current ? { ...current, name: event.target.value } : current,
            )
          }
        />
      )}
      {draft?.action === 'add' && (
        <TextField
          label="Default expression"
          value={draft?.value ?? ''}
          onChange={(event) =>
            setDraft((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
        />
      )}
      {draft?.action === 'delete' && (
        <Typography>Delete {draft.source} from every row?</Typography>
      )}
    </EditorDialog>
  );
}

export function addFieldError(
  draft: AddFieldDraft | null,
  errors: Readonly<Record<string, string>>,
): string | undefined {
  return draft ? errors[childPath(draft.parentPath, draft.name)] : undefined;
}
