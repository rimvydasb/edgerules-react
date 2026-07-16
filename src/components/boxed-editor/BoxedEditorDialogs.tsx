import type { ReactElement } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { AddFieldDraft, BoxedEditorDialogsProps } from './boxed-editor-types';
import { childPath } from './boxed-editor-utils';

export function BoxedEditorDialogs(props: BoxedEditorDialogsProps): ReactElement {
  const {
    errors,
    addDraft, setAddDraft, commitAdd,
    inputDraft, setInputDraft, commitInput,
    signatureDraft, setSignatureDraft, commitSignature,
    invocationDraft, setInvocationDraft, commitInvocation,
    listItemDraft, setListItemDraft, commitListItem,
    columnDraft, setColumnDraft, commitColumn,
    metadataDraft, setMetadataDraft, commitMetadata,
  } = props;

  return <>
    <Dialog open={Boolean(addDraft)} onClose={() => setAddDraft(null)}>
      <DialogTitle>Add field</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, minWidth: 300 }}>
        <TextField autoFocus label="Name" value={addDraft?.name ?? ''} onChange={event => setAddDraft(current => current ? { ...current, name: event.target.value } : current)} />
        <Select aria-label="Field kind" value={addDraft?.kind ?? 'expression'} onChange={event => setAddDraft(current => current ? { ...current, kind: event.target.value as AddFieldDraft['kind'] } : current)}>
          <MenuItem value="expression">Expression</MenuItem>
          <MenuItem value="input">Input</MenuItem>
          <MenuItem value="context">Context</MenuItem>
          <MenuItem value="list">Literal list</MenuItem>
        </Select>
        {addDraft && errors[childPath(addDraft.parentPath, addDraft.name)] && <Alert severity="error">{errors[childPath(addDraft.parentPath, addDraft.name)]}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setAddDraft(null)}>Cancel</Button><Button onClick={commitAdd}>Add field</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(inputDraft)} onClose={() => setInputDraft(null)}>
      <DialogTitle>Edit input</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 300 }}>
        <TextField label="Type" value={inputDraft?.value.type ?? ''} onChange={event => setInputDraft(current => current ? { ...current, value: { ...current.value, type: event.target.value } } : current)} />
        <FormControlLabel control={<Checkbox checked={inputDraft?.value.required === true} onChange={event => setInputDraft(current => current ? { ...current, value: { ...current.value, ...(event.target.checked ? { required: true } : { required: undefined }) } } : current)} />} label="Required" />
        {inputDraft && errors[inputDraft.path] && <Alert severity="error">{errors[inputDraft.path]}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setInputDraft(null)}>Cancel</Button><Button onClick={commitInput}>Save input</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(signatureDraft)} onClose={() => setSignatureDraft(null)}>
      <DialogTitle>Edit {signatureDraft?.external ? 'external function' : 'function'} signature</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 420 }}>
        {signatureDraft?.parameters.map((parameter, index) => <Box key={index} sx={{ display: 'flex', gap: 1 }}>
          <TextField label={`Parameter ${index + 1} name`} value={parameter.name} onChange={event => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)} />
          <TextField label={`Parameter ${index + 1} type`} value={parameter.type} onChange={event => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) } : current)} />
          <IconButton aria-label={`Remove parameter ${index + 1}`} onClick={() => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.filter((_, itemIndex) => itemIndex !== index) } : current)}><DeleteIcon fontSize="small" /></IconButton>
        </Box>)}
        <Button onClick={() => setSignatureDraft(current => current ? { ...current, parameters: [...current.parameters, { name: '', type: 'number' }] } : current)}>Add parameter</Button>
        <TextField label="Return type" value={signatureDraft?.returnType ?? ''} onChange={event => setSignatureDraft(current => current ? { ...current, returnType: event.target.value } : current)} />
        {signatureDraft && errors[signatureDraft.path] && <Alert severity="error">{errors[signatureDraft.path]}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setSignatureDraft(null)}>Cancel</Button><Button onClick={commitSignature}>Save signature</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(invocationDraft)} onClose={() => setInvocationDraft(null)}>
      <DialogTitle>Edit invocation</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 420 }}>
        <TextField label="Method" value={invocationDraft?.method ?? ''} onChange={event => setInvocationDraft(current => current ? { ...current, method: event.target.value } : current)} />
        <FormControlLabel control={<Checkbox checked={invocationDraft?.named === true} onChange={event => setInvocationDraft(current => current ? { ...current, named: event.target.checked, arguments: current.arguments.map(argument => ({ ...argument, name: event.target.checked ? argument.name : '' })) } : current)} />} label="Named arguments" />
        {invocationDraft?.arguments.map((argument, index) => <Box key={index} sx={{ display: 'flex', gap: 1 }}>
          <TextField label={invocationDraft.named ? `Argument ${index + 1} name` : `Argument ${index + 1}`} value={invocationDraft.named ? argument.name : String(index + 1)} disabled={!invocationDraft.named} onChange={event => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)} />
          <TextField label={`Argument ${index + 1} expression`} value={argument.value} onChange={event => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) } : current)} />
          <IconButton aria-label={`Remove argument ${index + 1}`} onClick={() => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.filter((_, itemIndex) => itemIndex !== index) } : current)}><DeleteIcon fontSize="small" /></IconButton>
        </Box>)}
        <Button onClick={() => setInvocationDraft(current => current ? { ...current, arguments: [...current.arguments, { name: '', value: '0' }] } : current)}>Add argument</Button>
        {invocationDraft && errors[invocationDraft.path] && <Alert severity="error">{errors[invocationDraft.path]}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setInvocationDraft(null)}>Cancel</Button><Button onClick={commitInvocation}>Save invocation</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(listItemDraft)} onClose={() => setListItemDraft(null)}>
      <DialogTitle>Add {listItemDraft?.relation ? 'relation row' : 'list item'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}>
        {listItemDraft?.fields.map((field, index) => <TextField key={field.name} label={listItemDraft.relation ? `${field.name} expression` : 'Item expression'} value={field.value} onChange={event => setListItemDraft(current => current ? { ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) } : current)} />)}
      </DialogContent>
      <DialogActions><Button onClick={() => setListItemDraft(null)}>Cancel</Button><Button onClick={commitListItem}>Add</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(columnDraft)} onClose={() => setColumnDraft(null)}>
      <DialogTitle>{columnDraft?.action === 'add' ? 'Add relation column' : columnDraft?.action === 'rename' ? 'Rename relation column' : 'Delete relation column'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}>
        {columnDraft?.action !== 'delete' && <TextField autoFocus label="Column name" value={columnDraft?.name ?? ''} onChange={event => setColumnDraft(current => current ? { ...current, name: event.target.value } : current)} />}
        {columnDraft?.action === 'add' && <TextField label="Default expression" value={columnDraft?.value ?? ''} onChange={event => setColumnDraft(current => current ? { ...current, value: event.target.value } : current)} />}
        {columnDraft?.action === 'delete' && <Typography>Delete {columnDraft?.source} from every row?</Typography>}
      </DialogContent>
      <DialogActions><Button onClick={() => setColumnDraft(null)}>Cancel</Button><Button onClick={commitColumn}>{columnDraft?.action === 'delete' ? 'Delete column' : 'Save column'}</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(metadataDraft)} onClose={() => setMetadataDraft(null)}>
      <DialogTitle>Edit metadata</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}>
        <TextField label="Node kind" value={metadataDraft?.nodeKind ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, nodeKind: event.target.value } : current)} />
        <TextField label="Node label" value={metadataDraft?.nodeName ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, nodeName: event.target.value } : current)} />
        <TextField label="Description" multiline minRows={2} value={metadataDraft?.description ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, description: event.target.value } : current)} />
        {metadataDraft && errors[metadataDraft.path] && <Alert severity="error">{errors[metadataDraft.path]}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setMetadataDraft(null)}>Cancel</Button><Button onClick={commitMetadata}>Save metadata</Button></DialogActions>
    </Dialog>
  </>;
}
