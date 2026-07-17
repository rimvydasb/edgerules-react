import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { isObject, type EditorLinkRenderNode } from '../boxed-model';
import { useEditorNavigation } from '../BoxedEditorProvider';
import type { BoxedEditorTargetKind } from '../boxed-editor-types';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';

export function EditorLinkBox({ node, depth }: { node: EditorLinkRenderNode; depth: number }): ReactElement {
  const navigation = useEditorNavigation();
  const kind = (isObject(node.authored) ? node.authored['@kind'] : undefined) as BoxedEditorTargetKind;
  const text = kind === 'type-definition' ? 'Open Types Editor' : kind === 'ruleset' ? 'Open Decision Table Editor' : 'Open Loop Editor';
  const value = navigation.open ? <Button size="small" onClick={() => navigation.open?.({ path: node.path, kind })}>{text}</Button> : <Typography color="text.secondary">{text}</Typography>;
  return <BoxFrame node={node} depth={depth} header={<BoxHeader node={node} />} value={value} type={<BoxTypeChip schema={node.schema} />} />;
}
