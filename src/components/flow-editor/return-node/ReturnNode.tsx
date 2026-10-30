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
import {ADD_ROW_TEXT, returnSummary, useReturnNodeLayout} from './layout';
import {returnFieldMenuItems, returnNodeMenuItems} from './returnNodeMenus';
import type {ReturnField, ReturnNodeRowEditing, ReturnNodeType} from './types';
import styles from './returnNode.module.css';

/** The tile color of the return: the color of an output, which it resembles. */
export const RETURN_COLOR = '#2f9e44';

/** The input pin of the last row: a wire into it adds a new field to the return. */
export const ADD_PIN = 'in:+';

/** The one input pin of a returned expression: every field it reads wires into it. */
export const RETURN_EXPRESSION_PIN = 'in:*';

// The row name of a returned expression: `return` is a keyword, so no field of a context has it.
const RETURN_EXPRESSION_ROW = 'return';

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\[\d+\]|\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * The EdgeRules ReturnNode: the `return` field of a `@Service`, annotated `@ReturnNode` or not, as what the service
 * returns. A context shows one row per field, each with an input pin and its expression; a wire into the last row adds
 * the wired value as a new field. An expression shows one row with its text; its input pin takes one wire per field
 * it reads, and the wires follow the text. The node shows no computed value. Every change is link-checked: a field
 * that a caller reads stays.
 */
export function ReturnNode({id, data, selected}: NodeProps<ReturnNodeType>): ReactElement {
    const {service, languageService, readOnly, onOpenNode, editing, setEditing, menu} =
        useCoreNode<ReturnNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getReturnNode(data.field));
    const layout = useReturnNodeLayout(model);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => item.name).join(',')}`);
    const [rowError, setRowError] = useState<{name: string; message: string} | undefined>();
    const {field} = model;
    const stopEditing = () => setEditing(null);

    const menuItems = returnNodeMenuItems({...menu, field, onOpenNode});
    const isExpression = model.expression !== undefined;

    const renderName = (item: ReturnField) => (
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
                    editing={editing?.kind === 'return-field' && editing.name === item.name}
                    editable={!readOnly}
                    title={readOnly ? `${item.name} : ${item.type}` : `${item.name} : ${item.type} (click to rename)`}
                    ariaLabel={`Rename return field ${item.name}`}
                    onStartEditing={() => setEditing({kind: 'return-field', name: item.name})}
                    onCommit={(text) =>
                        runCommand(() => service.renameReturnField(field, item.name, text)) ?? stopEditing()
                    }
                    onCancel={stopEditing}
                />
                {!readOnly && (
                    <NodeMenuButton
                        variant="row"
                        ariaLabel={`Actions for return field ${item.name}`}
                        items={returnFieldMenuItems({
                            model,
                            item,
                            onMove: (direction) =>
                                void runCommand(() => service.moveReturnField(field, item.name, direction)),
                            onDelete: () => {
                                const failed = runCommand(() => service.removeReturnField(field, item.name));
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
            label={model.label ?? 'Return'}
            testId={`return-node-${field}`}
            selected={selected}
            width={layout.width}
            color={RETURN_COLOR}
            icon={<IconTargetArrow size={19} stroke={2} />}
            summaryLabel="returns"
            summary={<NodeSummary>{returnSummary(model)}</NodeSummary>}
            menuItems={menuItems}
            editing={editing}
            onEditingChange={setEditing}
        >
            {isExpression && (
                <TrackRow error={rowError?.name === RETURN_EXPRESSION_ROW ? rowError.message : undefined}>
                    <Track width={layout.width}>
                        <Pin
                            id={RETURN_EXPRESSION_PIN}
                            side="in"
                            type={model.type ?? 'any'}
                            title={`return reads ${model.variables.join(', ') || 'nothing'}`}
                        />
                        <InputValueCell
                            name={RETURN_EXPRESSION_ROW}
                            value={model.expression}
                            editing={editing?.kind === 'return-expression'}
                            languageService={languageService}
                            readOnly={readOnly}
                            embedContext={() => service.inputValueContext(field)}
                            onStartEditing={() => setEditing({kind: 'return-expression', name: RETURN_EXPRESSION_ROW})}
                            onCommit={(text) => runCommand(() => service.setReturnExpression(field, text))}
                            onClose={stopEditing}
                            onErrorChange={(message) =>
                                setRowError(message ? {name: RETURN_EXPRESSION_ROW, message} : undefined)
                            }
                        />
                    </Track>
                </TrackRow>
            )}
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
                            editing={editing?.kind === 'return-value' && editing.name === item.name}
                            languageService={languageService}
                            readOnly={readOnly}
                            embedContext={() => service.inputValueContext(field, item.name)}
                            onStartEditing={() => setEditing({kind: 'return-value', name: item.name})}
                            onCommit={(text) => runCommand(() => service.setReturnFieldValue(field, item.name, text))}
                            onClose={stopEditing}
                            onErrorChange={(message) => setRowError(message ? {name: item.name, message} : undefined)}
                        />
                    </Track>
                </TrackRow>
            ))}
            {!readOnly && !isExpression && (
                <TrackRow error={rowError?.name === '' ? rowError.message : undefined}>
                    <Track width={layout.width}>
                        <Pin id={ADD_PIN} side="in" type="any" title="Wire a value here to add it to the return" />
                        <div className={styles.add} data-testid="return-add-row">
                            {ADD_ROW_TEXT}
                        </div>
                    </Track>
                </TrackRow>
            )}
        </NodeFrame>
    );
}
