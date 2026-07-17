import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { FieldActions } from '../actions/FieldActions';
import { MetadataAction } from '../actions/MetadataAction';
import { isObject, type InputRenderNode } from '../boxed-model';
import { useBoxedEditorState, useInputActions } from '../BoxedEditorProvider';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import type { BoxPresentationProps } from './box-props';

export function InputBox({ node, depth, actions, suppressFieldActions }: { node: InputRenderNode } & BoxPresentationProps): ReactElement {
  const { readOnly } = useBoxedEditorState();
  const input = useInputActions();
  const value = isObject(node.authored) ? <Button size="small" color="inherit" disabled={readOnly} onClick={() => input.edit(node)}><Typography component="code">&lt;{String(node.authored.type)}{node.authored.required ? ', required' : ''}&gt;</Typography></Button> : null;
  return <BoxFrame node={node} depth={depth} header={<BoxHeader node={node} editable={!suppressFieldActions} />} value={value} type={<BoxTypeChip schema={node.schema} />}
    actions={actions ?? <><MetadataAction node={node} />{!suppressFieldActions && <FieldActions node={node} />}</>} />;
}
