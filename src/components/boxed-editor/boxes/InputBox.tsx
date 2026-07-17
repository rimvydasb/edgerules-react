import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import { CodeEditorCell } from '../../code-editor-cell';
import { FieldActions } from '../actions/FieldActions';
import { MetadataAction } from '../actions/MetadataAction';
import { expressionEmbedContext } from '../boxed-embed';
import type { InputRenderNode } from '../boxed-model';
import {
  useBoxedEditorState,
  useExpressionActions,
} from '../BoxedEditorProvider';
import { inputText } from '../boxed-editor-utils';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import type { BoxPresentationProps } from './box-props';

export function InputBox({
  node,
  depth,
  actions,
  suppressFieldActions,
}: { node: InputRenderNode } & BoxPresentationProps): ReactElement {
  const state = useBoxedEditorState();
  const expression = useExpressionActions();
  const editing = expression.activePath === node.path;
  const activate = (): void => expression.activate(node);
  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={<BoxHeader node={node} editable={!suppressFieldActions} />}
      value={
        editing ? (
          <CodeEditorCell
            value={inputText(node.authored)}
            service={state.languageService}
            embedContext={expressionEmbedContext(state.snapshot, node.path)}
            autoFocus
            onCommit={(text) => expression.commit(node, text)}
            onCancel={expression.cancel}
          />
        ) : (
          <Box component="code" sx={{ minHeight: 24 }}>
            {inputText(node.authored)}
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
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        actions ?? (
          <>
            <MetadataAction node={node} />
            {!suppressFieldActions && <FieldActions node={node} />}
          </>
        )
      }
    />
  );
}
