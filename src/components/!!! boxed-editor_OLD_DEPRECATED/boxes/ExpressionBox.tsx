import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import { CodeEditorCell } from '../../code-editor-cell';
import { FieldActions } from '../actions/FieldActions';
import { expressionEmbedContext } from '../boxed-embed';
import type { ExpressionRenderNode } from '../boxed-model';
import {
  useBoxedEditorState,
  useExpressionActions,
} from '../BoxedEditorProvider';
import { cellCode } from '../cell-code';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import { StaticExpression } from '../primitives/StaticExpression';
import type { BoxPresentationProps } from './box-props';

export function ExpressionBox({
  node,
  depth,
  actions,
  suppressFieldActions,
}: { node: ExpressionRenderNode } & BoxPresentationProps): ReactElement {
  const state = useBoxedEditorState();
  const expression = useExpressionActions();
  const editing = expression.activePath === node.path;
  const activate = (): void => expression.activate(node);
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
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        actions ??
        (!suppressFieldActions && node.path !== '*' ? (
          <FieldActions node={node} showRename={false} />
        ) : null)
      }
      value={
        editing ? (
          <CodeEditorCell
            value={cellCode(node.authored)}
            service={state.languageService}
            embedContext={expressionEmbedContext(state.snapshot, node.path)}
            autoFocus
            onCommit={(text) => expression.commit(node, text)}
            onCancel={expression.cancel}
          />
        ) : (
          <Box sx={{ minHeight: 24 }}>
            <StaticExpression value={node.authored} />
          </Box>
        )
      }
      valueProps={
        !state.readOnly && !editing
          ? {
              tabIndex: 0,
              onClick: activate,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === 'F2') {
                  event.preventDefault();
                  activate();
                }
              },
              cursor: 'cell',
            }
          : undefined
      }
    />
  );
}
