import type {NodeProps} from '@xyflow/react';
import {IconTargetArrow} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
import {
    EditableName,
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
import {InputValueCell} from '../object-input-node/InputValueCell';
import {ADD_ROW_TEXT, resultSummary, useResultNodeLayout} from './layout';
import {resultFieldMenuItems, resultNodeMenuItems} from './resultNodeMenus';
import type {ResultField, ResultNodeRowEditing, ResultNodeType} from './types';
import styles from './resultNode.module.css';

/** The tile color of the result: the color of an output, which it resembles. */
export const RESULT_COLOR = '#2f9e44';

/** The input pin of the last row: a wire into it adds a new field to the result. */
export const ADD_PIN = 'in:+';

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\[\d+\]|\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * The EdgeRules ResultNode: the `return` record of a `@Service`, annotated `@ResultNode`, as the values the service
 * returns. Each field has an input pin and its expression; the node shows no computed value. A wire into the last
 * row adds the wired value as a new field. Every change is link-checked: a field that a caller reads stays.
 */
export function ResultNode({id, data, selected}: NodeProps<ResultNodeType>): ReactElement {
    const {service, languageService, readOnly, onOpenNode, editing, setEditing, menu} =
        useCoreNode<ResultNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getResultNode(data.field));
    const layout = useResultNodeLayout(model);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => item.name).join(',')}`);
    const [rowError, setRowError] = useState<{name: string; message: string} | undefined>();
    const {field} = model;
    const stopEditing = () => setEditing(null);

    const menuItems = resultNodeMenuItems({...menu, field, onOpenNode});

    const renderName = (item: ResultField) => (
        <Track width={layout.inputTrack}>
            <Pin
                id={`in:${item.name}`}
                side="in"
                type={item.type}
                bound={item.value !== undefined && PATH.test(item.value.trim()) ? 'path' : 'value'}
                title={`${item.name} : ${item.type}`}
            />
            <TrackName side="in">
                <EditableName
                    name={item.name}
                    editing={editing?.kind === 'result-field' && editing.name === item.name}
                    editable={!readOnly}
                    title={readOnly ? `${item.name} : ${item.type}` : `${item.name} : ${item.type} (click to rename)`}
                    ariaLabel={`Rename result field ${item.name}`}
                    onStartEditing={() => setEditing({kind: 'result-field', name: item.name})}
                    onCommit={(text) =>
                        runCommand(() => service.renameResultField(field, item.name, text)) ?? stopEditing()
                    }
                    onCancel={stopEditing}
                />
                {!readOnly && (
                    <NodeMenuButton
                        variant="row"
                        ariaLabel={`Actions for result field ${item.name}`}
                        items={resultFieldMenuItems({
                            model,
                            item,
                            onMove: (direction) =>
                                void runCommand(() => service.moveResultField(field, item.name, direction)),
                            onDelete: () => {
                                const failed = runCommand(() => service.removeResultField(field, item.name));
                                setRowError(failed ? {name: item.name, message: failed} : undefined);
                            },
                        })}
                    />
                )}
            </TrackName>
        </Track>
    );

    return (
        <NodeFrame
            field={field}
            label={model.label ?? 'Result'}
            testId={`result-node-${field}`}
            selected={selected}
            width={layout.width}
            color={RESULT_COLOR}
            icon={<IconTargetArrow size={19} stroke={2} />}
            summaryLabel="returns"
            summary={<NodeSummary>{resultSummary(model)}</NodeSummary>}
            menuItems={menuItems}
            editing={editing}
            onEditingChange={setEditing}
        >
            {model.fields.length > 0 && (
                <TrackRow>
                    <TrackBand width={layout.inputTrack} side="in" noun="value" count={model.fields.length} />
                    <TrackBand width={layout.outputTrack} side="out" noun="expression" count={model.fields.length} />
                </TrackRow>
            )}
            {model.fields.map((item) => (
                <TrackRow key={item.name} error={rowError?.name === item.name ? rowError.message : undefined}>
                    {renderName(item)}
                    <Track width={layout.outputTrack}>
                        <InputValueCell
                            name={item.name}
                            value={item.value}
                            editing={editing?.kind === 'result-value' && editing.name === item.name}
                            languageService={languageService}
                            readOnly={readOnly}
                            embedContext={() => service.inputValueContext(field, item.name)}
                            onStartEditing={() => setEditing({kind: 'result-value', name: item.name})}
                            onCommit={(text) => runCommand(() => service.setResultFieldValue(field, item.name, text))}
                            onClose={stopEditing}
                            onErrorChange={(message) => setRowError(message ? {name: item.name, message} : undefined)}
                        />
                    </Track>
                </TrackRow>
            ))}
            {!readOnly && (
                <TrackRow error={rowError?.name === '' ? rowError.message : undefined}>
                    <Track width={layout.width}>
                        <Pin id={ADD_PIN} side="in" type="any" title="Wire a value here to add it to the result" />
                        <div className={styles.add} data-testid="result-add-row">
                            {ADD_ROW_TEXT}
                        </div>
                    </Track>
                </TrackRow>
            )}
        </NodeFrame>
    );
}
