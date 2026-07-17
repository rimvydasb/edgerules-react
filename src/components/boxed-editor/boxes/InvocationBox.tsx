import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import { MetadataAction } from '../actions/MetadataAction';
import { isObject, type InvocationRenderNode } from '../boxed-model';
import { useInvocationActions } from '../BoxedEditorProvider';
import { invocationText } from '../boxed-editor-utils';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import { StaticExpression } from '../primitives/StaticExpression';
import { InvocationArgumentBox } from './InvocationArgumentBox';

export function InvocationBox({ node, depth }: { node: InvocationRenderNode; depth: number }): ReactElement {
  const invocation = useInvocationActions();
  const value = isObject(node.authored) ? <StaticExpression value={invocationText(node.authored)} /> : null;
  return <BoxFrame node={node} depth={depth} header={<BoxHeader node={node} />} value={value} type={<BoxTypeChip schema={node.schema} />}
    actions={<><Button size="small" aria-label={`Edit invocation ${node.path}`} onClick={() => invocation.edit(node)}>Invocation</Button><MetadataAction node={node} /></>}
  >{node.children?.map(child => <InvocationArgumentBox key={child.id} node={child} depth={depth + 1} />)}</BoxFrame>;
}
