import {useReactFlow, type NodeProps} from '@xyflow/react';
import {IconLogout2} from '@tabler/icons-react';
import {useMemo, useState, type ReactElement} from 'react';
import {
    DescriptionLine,
    InlineInput,
    NodeMenuButton,
    Pin,
    TrackRow,
    useCanvasActions,
    useWiredReading,
} from '../core-node';
import {useFlowEditor} from '../FlowEditorProvider';
import {outputNodeMenuItems} from './outputNodeMenus';
import {outputShape, shapeSummary} from './outputShape';
import type {OutputNodeData, OutputNodeType} from './types';
import {ValueTable} from './ValueTable';
import styles from '../core-node/coreNode.module.css';
import outputStyles from './outputNode.module.css';

export {sourcePath} from '../core-node';
export {formatValue} from './outputShape';

const OUTPUT_COLOR = '#2f9e44';
const WIDTH = 240;

/**
 * The EdgeRules OutputNode: one value row with an input pin. It shows what the engine computes for the path that
 * is wired into it, in the shape of the value: a single value in the row; a list, a list of records or a record as
 * a table under the row. A table shows at most ROW_LIMIT rows and COLUMN_LIMIT columns; the full value shows beside
 * the canvas. The node writes nothing to the model: its title and description are canvas data.
 */
export function OutputNode({id, data, selected}: NodeProps<OutputNodeType>): ReactElement {
    const {readOnly = false} = useFlowEditor();
    const flow = useReactFlow();
    const canvas = useCanvasActions();
    const {source, reading} = useWiredReading('in:value');
    const [editing, setEditing] = useState<'node-name' | 'description' | null>(null);

    const failed = reading && 'error' in reading;
    const value = reading && !failed ? reading.value : undefined;
    const columns = reading && !failed ? reading.columns : undefined;
    const type = reading && !failed ? reading.type : 'any';
    const title = data.label ?? 'Output';
    const shape = useMemo(
        () => (reading && !failed ? outputShape(value, columns) : undefined),
        [reading, failed, value, columns],
    );
    const tabular = shape !== undefined && shape.kind !== 'scalar';

    // xyflow merges the patch into the node data; the FlowEditor keeps its output entry in step with it.
    const update = (patch: Partial<OutputNodeData>) => flow.updateNodeData(id, patch);
    const menuItems = outputNodeMenuItems({
        readOnly,
        hasDescription: Boolean(data.description),
        onRenameNode: () => setEditing('node-name'),
        onDuplicate: canvas && (() => canvas.duplicateOutput(id)),
        onAddDescription: () => setEditing('description'),
        onRemoveDescription: () => update({description: undefined}),
        onDelete: () => void flow.deleteElements({nodes: [{id}]}),
    });

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''} ${tabular ? outputStyles.tabular : ''}`}
            style={tabular ? undefined : {width: WIDTH}}
            data-testid={`output-node-${id}`}
            data-shape={shape?.kind}
        >
            <div className={styles.row}>
                <div className={styles.tile} style={{background: OUTPUT_COLOR}} aria-hidden>
                    <IconLogout2 size={19} stroke={2} />
                </div>
                <div className={`${styles.title} ${outputStyles.title}`}>
                    {editing === 'node-name' ? (
                        <InlineInput
                            value={data.label ?? ''}
                            ariaLabel={`Name of output ${id}`}
                            placeholder="Output"
                            onCommit={(text) => {
                                update({label: text.trim() || undefined});
                                setEditing(null);
                            }}
                            onCancel={() => setEditing(null)}
                        />
                    ) : (
                        <strong className={styles.titleText} title={title}>
                            {title}
                        </strong>
                    )}
                    {source && <span className={styles.fieldName}>{source}</span>}
                </div>
                <NodeMenuButton items={menuItems} ariaLabel="Output actions" />
            </div>
            <DescriptionLine
                description={data.description}
                ariaLabel={`Description of output ${id}`}
                placeholder="Describe what this output shows"
                editing={editing === 'description'}
                readOnly={readOnly}
                onCommit={(text) => update({description: text || undefined})}
                onEditingChange={(next) => setEditing(next ? 'description' : null)}
            />
            <TrackRow error={failed ? reading.error : undefined}>
                <Pin
                    id="in:value"
                    side="in"
                    type={type}
                    bound={source ? 'path' : undefined}
                    bad={failed}
                    title={source ? `${source} : ${type}` : 'Wire a result here'}
                />
                <div className={outputStyles.name}>value</div>
                <div
                    className={`${outputStyles.value} ${tabular ? outputStyles.summary : ''}`}
                    data-testid="output-value"
                    title={shape?.kind === 'scalar' ? shape.text : undefined}
                >
                    {shape ? shapeSummary(shape) : source ? (failed ? '' : '…') : '—'}
                </div>
            </TrackRow>
            {tabular && <ValueTable shape={shape} testId="output" />}
        </div>
    );
}
