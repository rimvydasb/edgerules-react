import type {NodeProps} from '@xyflow/react';
import {IconLogin2} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
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
import {DeclarationIcon} from './DeclarationIcon';
import {InputValueCell} from './InputValueCell';
import {recordSummary, useInputNodeLayout} from './layout';
import type {InputField, InputNodeRowEditing, InputNodeType} from './types';

const INPUT_COLOR = '#ed6c02';

/**
 * The EdgeRules InputNode: one `@InputNode` record as a table of fields and values, with an output pin per field.
 * A value edit writes the expression to the model, so every node and output that reads the field recalculates.
 */
export function InputNode({id, data, selected}: NodeProps<InputNodeType>): ReactElement {
    const {service, languageService, readOnly, onOpenNode, editing, setEditing, menu} =
        useCoreNode<InputNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getInputNode(data.field));
    const layout = useInputNodeLayout(model);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => (item.declaration ? '' : item.name)).join(',')}`);
    const [valueError, setValueError] = useState<{name: string; message: string} | undefined>();
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
        <Track width={layout.inputTrack}>
            <TrackName side="in">
                {item.declaration && <DeclarationIcon kind={item.declaration} />}
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
                {!readOnly && (
                    <NodeMenuButton
                        variant="row"
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
            </TrackName>
        </Track>
    );

    const renderValue = (item: InputField) => (
        <Track width={layout.outputTrack}>
            <InputValueCell
                name={item.name}
                value={item.value}
                declaration={item.declaration !== undefined}
                editing={editing?.kind === 'input-value' && editing.name === item.name}
                languageService={languageService}
                readOnly={readOnly}
                embedContext={() => service.inputValueContext(field, item.name)}
                onStartEditing={() => setEditing({kind: 'input-value', name: item.name})}
                onCommit={(text) => runCommand(() => service.setInputFieldValue(field, item.name, text))}
                onClose={stopEditing}
                onErrorChange={(message) => setValueError(message ? {name: item.name, message} : undefined)}
            />
            {!item.declaration && (
                <Pin
                    id={`out:${item.name}`}
                    side="out"
                    type={item.type}
                    title={`${field}.${item.name} : ${item.type}`}
                />
            )}
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
                        <TrackBand width={layout.inputTrack} side="in" noun="field" count={model.fields.length} />
                        <TrackBand width={layout.outputTrack} side="out" noun="value" count={model.fields.length} />
                    </TrackRow>
                    {model.fields.map((item) => (
                        <TrackRow
                            key={item.name}
                            error={valueError?.name === item.name ? valueError.message : undefined}
                        >
                            {renderField(item)}
                            {renderValue(item)}
                        </TrackRow>
                    ))}
                </>
            )}
        </NodeFrame>
    );
}
