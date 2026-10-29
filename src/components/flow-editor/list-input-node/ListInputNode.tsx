import type {NodeProps} from '@xyflow/react';
import {IconListDetails} from '@tabler/icons-react';
import {useMemo, type ReactElement} from 'react';
import {
    NodeEmptyState,
    NodeFrame,
    NodeSummary,
    Pin,
    useCoreNode,
    useModelReading,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {formatValue, outputShape} from '../output-node/outputShape';
import {ValueTable} from '../output-node/ValueTable';
import {listInputNodeMenuItems} from './listInputNodeMenus';
import {listSummary, useListInputNodeWidth} from './layout';
import type {ListInputNodeType} from './types';

const INPUT_COLOR = '#ed6c02';

/**
 * The EdgeRules ListInputNode: one `@InputNode` list with a single output pin for the whole list. The body shows the
 * items as the engine evaluates them, in the table of an OutputNode: at most ROW_LIMIT items and COLUMN_LIMIT item
 * fields, then `…`. A value that is not a list, such as the Missing value of an untyped `[]`, shows as text. The items
 * themselves are edited in the Boxed Editor or as code.
 */
export function ListInputNode({id, data, selected}: NodeProps<ListInputNodeType>): ReactElement {
    const {service, onOpenNode, editing, setEditing, menu} = useCoreNode(data.field);
    const model = useServiceRead(service, data.field, () => service.getListInputNode(data.field));
    const reading = useModelReading(service, data.field);
    const failed = reading !== undefined && 'error' in reading;
    const items = reading && !failed && Array.isArray(reading.value) ? reading.value : undefined;
    const shape = useMemo(() => {
        if (!items) return undefined;
        // An empty list of records names its columns from the declared item type.
        const columns = reading && 'columns' in reading ? reading.columns : undefined;
        return outputShape(items, columns ?? model.itemFields.map((item) => item.name));
    }, [items, reading, model]);
    const width = useListInputNodeWidth(model, items?.length);
    useSyncPins(id, `${width}|${items?.length}`);
    const {field} = model;

    return (
        <NodeFrame
            field={field}
            label={model.label}
            testId={`list-input-node-${field}`}
            selected={selected}
            width={width}
            fit
            color={INPUT_COLOR}
            icon={<IconListDetails size={19} stroke={2} />}
            summaryLabel="input"
            summary={
                <>
                    <NodeSummary>{listSummary(model, items?.length)}</NodeSummary>
                    <Pin id="out:*" side="out" type={model.type} title={`${field} : ${model.type}`} />
                </>
            }
            menuItems={listInputNodeMenuItems({...menu, field, onOpenNode})}
            editing={editing}
            onEditingChange={setEditing}
        >
            {failed && <NodeEmptyState>{reading.error}</NodeEmptyState>}
            {reading && !failed && !items && <NodeEmptyState>{formatValue(reading.value)}</NodeEmptyState>}
            {shape && shape.kind !== 'scalar' && <ValueTable shape={shape} testId="list-input" />}
        </NodeFrame>
    );
}
