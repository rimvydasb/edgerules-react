import type {NodeProps} from '@xyflow/react';
import {IconLogin2} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {
    EditableName,
    NodeEmptyState,
    NodeFrame,
    NodeMenuButton,
    NodeSummary,
    Pin,
    runCommand,
    Track,
    TrackBand,
    TrackName,
    TrackRow,
    useCoreNode,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {inputFieldMenuFooter, inputFieldMenuItems, inputNodeMenuItems} from './inputNodeMenus';
import {recordSummary, useInputNodeLayout} from './layout';
import type {InputField, InputNodeRowEditing, InputNodeType} from './types';

const INPUT_COLOR = '#ed6c02';

/** The EdgeRules InputNode: one `@InputNode` record with an output pin per field. It shows structure, not values. */
export function InputNode({id, data, selected}: NodeProps<InputNodeType>): ReactElement {
    const {service, readOnly, onOpenNode, editing, setEditing, menu} = useCoreNode<InputNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getInputNode(data.field));
    const layout = useInputNodeLayout(model);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => item.name).join(',')}`);
    const {field} = model;
    const stopEditing = () => setEditing(null);

    const addField = (after?: string) => {
        const before = new Set(model.fields.map((item) => item.name));
        if (runCommand(() => service.addInputField(field, after))) return;
        const added = service.getInputNode(field).fields.find((item) => !before.has(item.name));
        if (added) setEditing({kind: 'input-field', name: added.name});
    };

    const menuItems = inputNodeMenuItems({...menu, field, onOpenNode, onAddField: () => addField()});

    const renderField = (item: InputField) => (
        <Track width={layout.outputTrack}>
            <TrackName side="out">
                <EditableName
                    name={item.name}
                    editing={editing?.kind === 'input-field' && editing.name === item.name}
                    editable={!readOnly}
                    title={readOnly ? `${item.name} : ${item.type}` : `${item.name} : ${item.type} (click to rename)`}
                    ariaLabel={`Rename field ${item.name}`}
                    onStartEditing={() => setEditing({kind: 'input-field', name: item.name})}
                    onCommit={(text) =>
                        runCommand(() => service.renameInputField(field, item.name, text)) ?? stopEditing()
                    }
                    onCancel={stopEditing}
                />
            </TrackName>
            {!readOnly && (
                <NodeMenuButton
                    variant="row"
                    align="start"
                    ariaLabel={`Actions for field ${item.name}`}
                    footer={inputFieldMenuFooter(model)}
                    items={inputFieldMenuItems({
                        model,
                        item,
                        onMove: (direction) =>
                            void runCommand(() => service.moveInputField(field, item.name, direction)),
                        onAddBelow: () => addField(item.name),
                        onDelete: () => void runCommand(() => service.removeInputField(field, item.name)),
                    })}
                />
            )}
            <Pin id={`out:${item.name}`} side="out" type={item.type} title={`${field}.${item.name} : ${item.type}`} />
        </Track>
    );

    return (
        <NodeFrame
            field={field}
            label={model.label}
            testId={`input-node-${field}`}
            selected={selected}
            width={layout.width}
            color={INPUT_COLOR}
            icon={<IconLogin2 size={19} stroke={2} />}
            summaryLabel="input"
            summary={
                <>
                    <NodeSummary>{recordSummary(model)}</NodeSummary>
                    <Pin id="out:*" side="out" type="record" forceRecord title={field} />
                </>
            }
            menuItems={menuItems}
            editing={editing}
            onEditingChange={setEditing}
        >
            {model.fields.length === 0 ? (
                <NodeEmptyState>This record has no fields.</NodeEmptyState>
            ) : (
                <>
                    <TrackRow>
                        <TrackBand width={layout.outputTrack} side="out" noun="field" count={model.fields.length} />
                    </TrackRow>
                    {model.fields.map((item) => (
                        <TrackRow key={item.name}>{renderField(item)}</TrackRow>
                    ))}
                </>
            )}
        </NodeFrame>
    );
}
