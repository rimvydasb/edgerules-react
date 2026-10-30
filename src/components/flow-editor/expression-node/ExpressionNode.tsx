import type {NodeProps} from '@xyflow/react';
import {IconMath} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {
    DescriptionRow,
    InlineInput,
    NodeMenuButton,
    Pin,
    runCommand,
    useCoreNode,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {expressionNodeMenuItems} from './expressionNodeMenus';
import {expressionNodeWidth, expressionTitle} from './layout';
import type {ExpressionNodeType} from './types';
import styles from '../core-node/coreNode.module.css';

export const EXPRESSION_COLOR = '#7048e8';
// The one input pin: every field the expression reads wires into it.
export const EXPRESSION_PIN = 'in:*';

/**
 * The EdgeRules ExpressionNode: one computed field of the flow context that no other node shows, so that every value a
 * node reads is on the canvas. A one-row header: the tile, the field name and the node menu. The input pin takes one
 * wire per field the expression reads (its `@variables`); the output pin feeds what reads the field. The wires into it
 * follow the expression text: edit it in the boxed or code editor.
 */
export function ExpressionNode({id, data, selected}: NodeProps<ExpressionNodeType>): ReactElement {
    const {service, documentation, readOnly, onOpenNode, editing, setEditing, menu} = useCoreNode(data.field);
    const model = useServiceRead(service, data.field, () => service.getExpressionNode(data.field));
    const {field, type, expression} = model;
    const width = expressionNodeWidth(field);
    useSyncPins(id, `${width}`);
    const title = expressionTitle(field);
    const stopEditing = () => setEditing(null);

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''}`}
            style={{width}}
            data-testid={`expression-node-${field}`}
        >
            <div className={styles.row}>
                <Pin
                    id={EXPRESSION_PIN}
                    side="in"
                    type="any"
                    title={`${field} reads ${model.variables.join(', ') || 'nothing'}`}
                />
                <div className={styles.tile} style={{background: EXPRESSION_COLOR}} aria-hidden>
                    <IconMath size={19} stroke={2} />
                </div>
                <div className={`${styles.headLine} ${styles.headFirst}`} style={{flex: 1}}>
                    <div className={styles.title}>
                        {editing?.kind === 'field' ? (
                            <InlineInput
                                value={title}
                                ariaLabel={`Field name of node ${field}`}
                                onCommit={(text) => {
                                    const failed = runCommand(() => service.renameField(field, text));
                                    if (failed) return failed;
                                    if (text !== title) {
                                        const scope = field.slice(0, -title.length);
                                        documentation?.renamePath(field, `${scope}${text}`);
                                    }
                                    stopEditing();
                                }}
                                onCancel={stopEditing}
                            />
                        ) : (
                            <strong
                                className={styles.titleText}
                                title={expression === undefined ? field : `${field} = ${expression} : ${type}`}
                            >
                                {title}
                            </strong>
                        )}
                    </div>
                    <NodeMenuButton
                        items={expressionNodeMenuItems({...menu, field, readOnly, onOpenNode})}
                        ariaLabel="Node actions"
                    />
                </div>
                <Pin id="out:*" side="out" type={type} title={`${field} : ${type}`} />
            </div>
            {documentation && (
                <DescriptionRow
                    documentation={documentation}
                    field={field}
                    editing={editing?.kind === 'description'}
                    readOnly={readOnly}
                    onEditingChange={(next) => setEditing(next ? {kind: 'description'} : null)}
                />
            )}
        </div>
    );
}
