import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { isObject, type ExternalFunctionRenderNode } from '../boxed-model';
import {
  useBoxedEditorState,
  useFunctionActions,
} from '../BoxedEditorProvider';
import { functionSignature } from '../boxed-editor-utils';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';

export function ExternalFunctionBox({
  node,
  depth,
}: {
  node: ExternalFunctionRenderNode;
  depth: number;
}): ReactElement {
  const { readOnly } = useBoxedEditorState();
  const functions = useFunctionActions();
  const value = isObject(node.authored) ? (
    <Button
      size="small"
      color="inherit"
      disabled={readOnly}
      onClick={() => functions.editSignature(node)}
    >
      <Typography component="code">
        {functionSignature(node.authored, node.name).replace(
          /^func /,
          'external func ',
        )}
      </Typography>
    </Button>
  ) : null;
  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={<BoxHeader node={node} />}
      value={value}
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        <Button
          size="small"
          aria-label={`Edit signature ${node.path}`}
          onClick={() => functions.editSignature(node)}
        >
          Signature
        </Button>
      }
    />
  );
}
