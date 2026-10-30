import type {NodeProps} from '@xyflow/react';
import {IconArrowBarToRight} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
import {childPath, parentPath} from '#lib/portableUtils';
import {KIND_COLORS} from '#ui/kindColors';
import {
    InlineInput,
    NodeEmptyState,
    NodeFrame,
    NodeSummary,
    Pin,
    runCommand,
    Track,
    TrackBand,
    TrackName,
    TrackNameText,
    TrackRow,
    useNodeDescription,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {useFlowEditor} from '../FlowEditorProvider';
import {useParameterNodeLayout} from './layout';
import {parameterNodeMenuItems} from './parameterNodeMenus';
import type {ParameterNodeEditing, ParameterNodeType} from './types';

/** The tile color of a parameter: the color of a service, whose input it is. */
export const PARAMETER_COLOR = KIND_COLORS.service;

/**
 * The EdgeRules ParameterNode: one parameter of a `@Service`, drawn from its declared type, never from a value. A
 * record type has an output pin per field and one for the whole record; any other type has one pin. The title is the
 * parameter name: renaming it renames the parameter in the service body and at every call site.
 */
export function ParameterNode({id, data, selected}: NodeProps<ParameterNodeType>): ReactElement {
    const {service, documentation, readOnly = false, onOpenNode} = useFlowEditor();
    const [editing, setEditing] = useState<ParameterNodeEditing | null>(null);
    const description = useNodeDescription(documentation, data.field);
    const model = useServiceRead(service, data.field, () => service.getParameterNode(data.field));
    const layout = useParameterNodeLayout(model);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => item.name).join(',')}`);
    const {field, fields} = model;
    const record = fields.length > 0;
    const stopEditing = () => setEditing(null);

    const rename = (text: string): string | void => {
        const failed = runCommand(() => service.renameParameter(field, text.trim()));
        if (failed) return failed;
        const renamed = childPath(parentPath(field) ?? '*', text.trim());
        if (renamed !== field) documentation?.renamePath(field, renamed);
    };

    const menuItems = parameterNodeMenuItems({
        model,
        readOnly,
        canDescribe: documentation !== undefined,
        hasDescription: Boolean(description),
        onRename: () => setEditing({kind: 'node-name'}),
        onChangeType: () => setEditing({kind: 'parameter-type'}),
        onAddDescription: () => setEditing({kind: 'description'}),
        onRemoveDescription: () => documentation?.setDescription(field, ''),
        onDelete: () => {
            if (!runCommand(() => service.deleteField(field))) documentation?.setDescription(field, '');
        },
        onOpenNode,
    });

    const summary =
        editing?.kind === 'parameter-type' ? (
            <InlineInput
                value={model.type}
                ariaLabel={`Type of parameter ${model.name}`}
                align="end"
                onCommit={(text) => runCommand(() => service.setParameterType(field, text)) ?? stopEditing()}
                onCancel={stopEditing}
            />
        ) : (
            <>
                <NodeSummary>{model.type}</NodeSummary>
                {record && (
                    <Pin id="out:*" side="out" type="record" forceRecord title={`${model.name} : ${model.type}`} />
                )}
            </>
        );

    return (
        <NodeFrame
            field={field}
            label={model.name}
            testId={`parameter-node-${field}`}
            selected={selected}
            width={layout.width}
            color={PARAMETER_COLOR}
            icon={<IconArrowBarToRight size={19} stroke={2} />}
            summaryLabel="parameter"
            summary={summary}
            menuItems={menuItems}
            editing={editing}
            onEditingChange={setEditing}
            onRenameNode={rename}
        >
            {!model.exists ? (
                <NodeEmptyState>This parameter does not exist.</NodeEmptyState>
            ) : record ? (
                <>
                    <TrackRow>
                        <TrackBand width={layout.inputTrack} side="in" noun="field" count={fields.length} />
                        <TrackBand width={layout.outputTrack} side="out" noun="type" count={fields.length} />
                    </TrackRow>
                    {fields.map((item) => (
                        <TrackRow key={item.name}>
                            <Track width={layout.inputTrack}>
                                <TrackName side="in" title={`${model.name}.${item.name} : ${item.type}`}>
                                    <TrackNameText>{item.name}</TrackNameText>
                                </TrackName>
                            </Track>
                            <Track width={layout.outputTrack}>
                                <TrackName side="out">
                                    <TrackNameText>{item.type}</TrackNameText>
                                </TrackName>
                                <Pin
                                    id={`out:${item.name}`}
                                    side="out"
                                    type={item.type}
                                    title={`${model.name}.${item.name} : ${item.type}`}
                                />
                            </Track>
                        </TrackRow>
                    ))}
                </>
            ) : (
                <TrackRow>
                    <Track width={layout.outputTrack}>
                        <TrackName side="out">
                            <TrackNameText>{model.type}</TrackNameText>
                        </TrackName>
                        <Pin id="out:*" side="out" type={model.type} title={`${model.name} : ${model.type}`} />
                    </Track>
                </TrackRow>
            )}
        </NodeFrame>
    );
}
