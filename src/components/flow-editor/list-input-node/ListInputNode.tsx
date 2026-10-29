import type {NodeProps} from '@xyflow/react';
import {IconListDetails} from '@tabler/icons-react';
import {useEffect, useState, type ReactElement} from 'react';
import {
    NodeEmptyState,
    NodeFrame,
    NodeSummary,
    Pin,
    Track,
    TrackBand,
    TrackName,
    TrackNameText,
    TrackRow,
    useCoreNode,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import type {FlowEditorService} from '../flow-editor-types';
import {listInputNodeMenuItems} from './listInputNodeMenus';
import {listSummary, useListInputNodeLayout} from './layout';
import type {ListInputNodeType} from './types';

const INPUT_COLOR = '#ed6c02';

/** The number of items of the list at `field`, as the engine evaluates it; reads again after every change. */
function useItemCount(service: FlowEditorService, field: string): number | undefined {
    const [count, setCount] = useState<number>();
    useEffect(() => {
        let current = true;
        const refresh = () => {
            void service.readOutput(field).then((reading) => {
                if (current)
                    setCount('value' in reading && Array.isArray(reading.value) ? reading.value.length : undefined);
            });
        };
        refresh();
        const unsubscribe = service.subscribe(refresh);
        return () => {
            current = false;
            unsubscribe();
        };
    }, [service, field]);
    return count;
}

/**
 * The EdgeRules ListInputNode: one `@InputNode` list with a single output pin for the whole list. The body shows the
 * shape of an item, one row per field; the items themselves are edited in the Boxed Editor or as code.
 */
export function ListInputNode({id, data, selected}: NodeProps<ListInputNodeType>): ReactElement {
    const {service, onOpenNode, editing, setEditing, menu} = useCoreNode(data.field);
    const model = useServiceRead(service, data.field, () => service.getListInputNode(data.field));
    const count = useItemCount(service, data.field);
    const layout = useListInputNodeLayout(model, count);
    useSyncPins(id, `${layout.width}`);
    const {field, itemFields} = model;

    return (
        <NodeFrame
            field={field}
            label={model.label}
            testId={`list-input-node-${field}`}
            selected={selected}
            width={layout.width}
            color={INPUT_COLOR}
            icon={<IconListDetails size={19} stroke={2} />}
            summaryLabel="input"
            summary={
                <>
                    <NodeSummary>{listSummary(model, count)}</NodeSummary>
                    <Pin id="out:*" side="out" type={model.type} title={`${field} : ${model.type}`} />
                </>
            }
            menuItems={listInputNodeMenuItems({...menu, field, onOpenNode})}
            editing={editing}
            onEditingChange={setEditing}
        >
            {itemFields.length === 0 ? (
                <NodeEmptyState>{`A list of ${model.type.replace(/\[\]$/, '')} values.`}</NodeEmptyState>
            ) : (
                <>
                    <TrackRow>
                        <TrackBand width={layout.inputTrack} side="in" noun="item field" count={itemFields.length} />
                        <TrackBand width={layout.outputTrack} side="out" noun="type" count={itemFields.length} />
                    </TrackRow>
                    {itemFields.map((item) => (
                        <TrackRow key={item.name}>
                            <Track width={layout.inputTrack}>
                                <TrackName side="in" title={`${item.name} : ${item.type}`}>
                                    <TrackNameText>{item.name}</TrackNameText>
                                </TrackName>
                            </Track>
                            <Track width={layout.outputTrack}>
                                <TrackName side="out">
                                    <TrackNameText>{item.type}</TrackNameText>
                                </TrackName>
                            </Track>
                        </TrackRow>
                    ))}
                </>
            )}
        </NodeFrame>
    );
}
