import type {Node, NodeProps} from '@xyflow/react';
import {IconDotsVertical, IconLogin2} from '@tabler/icons-react';
import {useMemo, useState, useSyncExternalStore, type ReactElement} from 'react';
import {RowActionsMenu} from '../../../ui/RowActionsMenu';
import {isPortableError} from '../../../lib/portable';
import {useFlowEditor, useInputNodeModel} from '../FlowEditorProvider';
import type {InputNodeData, InputNodeModel} from '../flow-editor-types';
import {DescriptionRow} from '../function-node/DescriptionRow';
import {InlineInput} from '../function-node/InlineInput';
import {computeFunctionNodeLayout} from '../function-node/layout';
import {FONTS, measureText} from '../function-node/measure';
import {inputFieldMenuFooter, inputFieldMenuItems, inputNodeMenuItems} from '../function-node/nodeMenus';
import {Pin} from '../function-node/Pin';
import {useSyncPins} from '../function-node/useSyncPins';
import styles from '../function-node/functionNode.module.css';

const KEBAB_WIDTH = 40;
const TILE_WIDTH = 40;
const INPUT_COLOR = '#ed6c02';

export type InputNodeType = Node<InputNodeData, 'inputNode'>;

type Editing = {kind: 'node-name'} | {kind: 'field'} | {kind: 'input-field'; name: string} | {kind: 'description'};

const NO_DESCRIPTIONS = {subscribe: () => () => {}, getDescription: () => undefined};

function useNodeLayout(model: InputNodeModel) {
    return useMemo(() => {
        const title = model.label ?? model.field;
        const titleWidth =
            TILE_WIDTH +
            10 +
            measureText(title, FONTS.title) +
            8 +
            measureText(model.field, FONTS.field) +
            10 +
            KEBAB_WIDTH;
        const summaryWidth =
            TILE_WIDTH + 10 + measureText('INPUT', FONTS.label) + 8 + measureText(summaryOf(model), FONTS.ret) + 28;
        return computeFunctionNodeLayout({
            titleWidth,
            calleeLineWidth: summaryWidth,
            argumentNameWidths: [],
            resultNameWidths: model.fields.map((item) => measureText(item.name, FONTS.name)),
        });
    }, [model]);
}

function summaryOf(model: InputNodeModel): string {
    return `{ ${model.fields.map((item) => item.name).join(', ')} }`;
}

/** The EdgeRules InputNode: one `@InputNode` record with an output pin per field. It shows structure, not values. */
export function InputNode({id, data, selected}: NodeProps<InputNodeType>): ReactElement {
    const {service, documentation, readOnly = false, onOpenNode} = useFlowEditor();
    const model = useInputNodeModel(service, data.field);
    const layout = useNodeLayout(model);
    const [editing, setEditing] = useState<Editing | null>(null);
    useSyncPins(id, `${layout.width}|${model.fields.map((item) => item.name).join(',')}`);
    const description = useSyncExternalStore((documentation ?? NO_DESCRIPTIONS).subscribe, () =>
        (documentation ?? NO_DESCRIPTIONS).getDescription(data.field),
    );
    const field = model.field;

    // Runs a service command; an error text keeps an inline edit open.
    const run = (command: () => unknown): string | void => {
        const result = command();
        if (isPortableError(result)) return result.message;
    };

    const addField = (after?: string) => {
        const before = new Set(model.fields.map((item) => item.name));
        if (run(() => service.addInputField(field, after))) return;
        const added = service.getInputNode(field).fields.find((item) => !before.has(item.name));
        if (added) setEditing({kind: 'input-field', name: added.name});
    };

    const menuItems = inputNodeMenuItems({
        field,
        hasDescription: Boolean(description),
        canDescribe: documentation !== undefined,
        readOnly,
        onOpenNode,
        onRenameNode: () => setEditing({kind: 'node-name'}),
        onRenameField: () => setEditing({kind: 'field'}),
        onDuplicate: () => void run(() => service.duplicate(field)),
        onAddDescription: () => setEditing({kind: 'description'}),
        onRemoveDescription: () => documentation?.setDescription(field, ''),
        onAddField: () => addField(),
        onRemoveFromFlow: () => void run(() => service.removeFromFlow(field)),
        onDelete: () => {
            const failed = run(() => service.deleteField(field));
            if (!failed) documentation?.setDescription(field, '');
        },
    });

    const title = model.label ?? field;
    const count = model.fields.length;

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''}`}
            style={{width: layout.width}}
            data-testid={`input-node-${field}`}
        >
            <div className={`${styles.row} ${styles.tall}`}>
                <div className={styles.tile} style={{background: INPUT_COLOR}} aria-hidden>
                    <IconLogin2 size={19} stroke={2} />
                </div>
                <div className={styles.headStack}>
                    <div className={`${styles.headLine} ${styles.headFirst}`}>
                        <div className={styles.title}>
                            {editing?.kind === 'node-name' ? (
                                <InlineInput
                                    value={model.label ?? ''}
                                    ariaLabel={`Name of node ${field}`}
                                    placeholder={field}
                                    onCommit={(text) => run(() => service.setNodeName(field, text)) ?? setEditing(null)}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <strong className={styles.titleText} title={title}>
                                    {title}
                                </strong>
                            )}
                            {editing?.kind === 'field' ? (
                                <InlineInput
                                    value={field}
                                    ariaLabel={`Field name of node ${field}`}
                                    onCommit={(text) => {
                                        const failed = run(() => service.renameField(field, text));
                                        if (failed) return failed;
                                        if (text !== field) documentation?.renamePath(field, text);
                                        setEditing(null);
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <span className={styles.fieldName}>{field}</span>
                            )}
                        </div>
                        {menuItems.length > 0 && (
                            <RowActionsMenu items={menuItems}>
                                <button
                                    type="button"
                                    className={`${styles.kebab} nodrag`}
                                    aria-label="Node actions"
                                    aria-haspopup="menu"
                                >
                                    <IconDotsVertical size={16} />
                                </button>
                            </RowActionsMenu>
                        )}
                    </div>
                    <div className={styles.headLine}>
                        <span className={styles.callsLabel}>input</span>
                        <span className={styles.retType} title={summaryOf(model)}>
                            {summaryOf(model)}
                        </span>
                        <Pin id="out:*" side="out" type="record" forceRecord title={field} />
                    </div>
                </div>
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

            {count === 0 ? (
                <div className={styles.emptyBody}>This record has no fields.</div>
            ) : (
                <>
                    <div className={styles.row}>
                        <div
                            className={`${styles.half} ${styles.band} ${styles.bandResult}`}
                            style={{width: layout.resultTrack}}
                        >
                            {count === 1 ? 'field' : 'fields'}
                        </div>
                    </div>
                    {model.fields.map((item) => (
                        <div key={item.name} className={styles.row}>
                            <div className={styles.half} style={{width: layout.resultTrack}}>
                                <div className={`${styles.pname} ${styles.resultName}`}>
                                    {editing?.kind === 'input-field' && editing.name === item.name ? (
                                        <InlineInput
                                            value={item.name}
                                            align="end"
                                            ariaLabel={`Rename field ${item.name}`}
                                            onCommit={(text) =>
                                                run(() => service.renameInputField(field, item.name, text)) ??
                                                setEditing(null)
                                            }
                                            onCancel={() => setEditing(null)}
                                        />
                                    ) : readOnly ? (
                                        <span className={styles.nameText} title={`${item.name} : ${item.type}`}>
                                            {item.name}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className={`${styles.resultButton} nodrag`}
                                            title={`${item.name} : ${item.type} (click to rename)`}
                                            onClick={() => setEditing({kind: 'input-field', name: item.name})}
                                        >
                                            {item.name}
                                        </button>
                                    )}
                                </div>
                                {!readOnly && (
                                    <RowActionsMenu
                                        footer={inputFieldMenuFooter(model)}
                                        items={inputFieldMenuItems({
                                            model,
                                            item,
                                            onMove: (direction) =>
                                                void run(() => service.moveInputField(field, item.name, direction)),
                                            onAddBelow: () => addField(item.name),
                                            onDelete: () => void run(() => service.removeInputField(field, item.name)),
                                        })}
                                    >
                                        <button
                                            type="button"
                                            className={`${styles.argKebab} ${styles.kebabStart} nodrag`}
                                            aria-label={`Actions for field ${item.name}`}
                                            aria-haspopup="menu"
                                        >
                                            <IconDotsVertical size={15} />
                                        </button>
                                    </RowActionsMenu>
                                )}
                                <Pin
                                    id={`out:${item.name}`}
                                    side="out"
                                    type={item.type}
                                    title={`${field}.${item.name} : ${item.type}`}
                                />
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
