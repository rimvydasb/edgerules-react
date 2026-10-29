import type {NodeProps} from '@xyflow/react';
import {IconVariable} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
import {
    NodeEmptyState,
    NodeFrame,
    NodeSummary,
    Pin,
    runCommand,
    Track,
    TrackRow,
    useCoreNode,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {InputValueCell} from '../object-input-node/InputValueCell';
import {useValueInputNodeLayout} from './layout';
import type {ValueInputNodeRowEditing, ValueInputNodeType} from './types';
import {valueInputNodeMenuItems} from './valueInputNodeMenus';

const INPUT_COLOR = '#ed6c02';

/**
 * The EdgeRules ValueInputNode: one `@InputNode` single value, such as a number or a string, with one output pin. A
 * value edit writes the expression to the model, so every node and output that reads the field recalculates.
 */
export function ValueInputNode({id, data, selected}: NodeProps<ValueInputNodeType>): ReactElement {
    const {service, languageService, readOnly, onOpenNode, editing, setEditing, menu} =
        useCoreNode<ValueInputNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getValueInputNode(data.field));
    const layout = useValueInputNodeLayout(model);
    useSyncPins(id, `${layout.width}`);
    const [valueError, setValueError] = useState<string | undefined>();
    const {field, value} = model;

    return (
        <NodeFrame
            field={field}
            label={model.label}
            testId={`value-input-node-${field}`}
            selected={selected}
            width={layout.width}
            color={INPUT_COLOR}
            icon={<IconVariable size={19} stroke={2} />}
            summaryLabel="input"
            summary={<NodeSummary>{model.type}</NodeSummary>}
            menuItems={valueInputNodeMenuItems({...menu, field, onOpenNode})}
            editing={editing}
            onEditingChange={setEditing}
        >
            {value === undefined ? (
                <NodeEmptyState>This value does not exist.</NodeEmptyState>
            ) : (
                <TrackRow error={valueError}>
                    <Track width={layout.outputTrack}>
                        <InputValueCell
                            name={field}
                            value={value}
                            editing={editing?.kind === 'input-value'}
                            languageService={languageService}
                            readOnly={readOnly}
                            embedContext={() => service.inputValueContext(field)}
                            onStartEditing={() => setEditing({kind: 'input-value', name: field})}
                            onCommit={(text) => runCommand(() => service.setInputValue(field, text))}
                            onClose={() => setEditing(null)}
                            onErrorChange={setValueError}
                        />
                        <Pin id="out:*" side="out" type={model.type} title={`${field} : ${model.type}`} />
                    </Track>
                </TrackRow>
            )}
        </NodeFrame>
    );
}
