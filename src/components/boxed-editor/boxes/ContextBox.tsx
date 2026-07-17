import type { ReactElement } from 'react';
import AddIcon from '@mui/icons-material/Add';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { FieldActions } from '../actions/FieldActions';
import { MetadataAction } from '../actions/MetadataAction';
import type { ContextRenderNode } from '../boxed-model';
import { useBoxedNodeRenderer, useFieldActions } from '../BoxedEditorProvider';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import type { BoxPresentationProps } from './box-props';

export function ContextBox({
  node,
  depth,
  actions,
  suppressFieldActions,
}: { node: ContextRenderNode } & BoxPresentationProps): ReactElement {
  const fields = useFieldActions();
  const BoxedNode = useBoxedNodeRenderer();
  const children = node.children ?? [];
  const ownActions =
    node.path === '*' ? null : (
      <>
        <MetadataAction node={node} />
        {!suppressFieldActions && <FieldActions node={node} />}
      </>
    );
  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={
        <BoxHeader
          node={node}
          editable={!suppressFieldActions && node.path !== '*'}
        />
      }
      value={
        !children.length ? (
          <Typography color="text.secondary">Empty context</Typography>
        ) : null
      }
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        actions ?? (
          <>
            <IconButton
              size="small"
              aria-label={`Add field to ${node.path}`}
              onClick={() => fields.add(node)}
            >
              <AddIcon fontSize="small" />
            </IconButton>
            {ownActions}
          </>
        )
      }
    >
      {children.map((child) => (
        <BoxedNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </BoxFrame>
  );
}
