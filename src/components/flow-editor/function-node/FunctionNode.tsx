import type {Node, NodeProps} from '@xyflow/react';
import {IconDotsVertical} from '@tabler/icons-react';
import {useMemo, useState, useSyncExternalStore, type ReactElement} from 'react';
import {RowActionsMenu} from '../../../ui/RowActionsMenu';
import {isPortableError} from '../../../lib/portable';
import {useFlowEditor, useFunctionNodeModel} from '../FlowEditorProvider';
import type {FunctionNodeData, FunctionNodeModel, NodeArgument} from '../flow-editor-types';
import {CalleePicker} from './CalleePicker';
import {DescriptionRow} from './DescriptionRow';
import {KIND_COLOR, KindIcon} from './KindIcon';
import {InlineInput} from './InlineInput';
import {Pin} from './Pin';
import {argumentMenuFooter, argumentMenuItems, nodeMenuItems} from './nodeMenus';
import {computeFunctionNodeLayout} from './layout';
import {FONTS, measureText} from './measure';
import styles from './functionNode.module.css';

const KEBAB_WIDTH = 40;
const TILE_WIDTH = 40;

export type FunctionNodeType = Node<FunctionNodeData, 'functionNode'>;

function plural(word: string, count: number): string {
    return count === 1 ? word : `${word}s`;
}

function pinTitle(argument: NodeArgument): string {
    const {binding} = argument;
    if (!binding) return `${argument.name} : ${argument.type} (unbound)`;
    return `${argument.name} : ${argument.type} ${binding.kind === 'path' ? '←' : '='} ${binding.text}`;
}

function useNodeLayout(model: FunctionNodeModel) {
    return useMemo(() => {
        const title = model.label ?? model.field;
        const showDraft = model.draft && model.callee !== undefined;
        const titleWidth =
            TILE_WIDTH +
            10 +
            measureText(title, FONTS.title) +
            8 +
            measureText(model.field, FONTS.field) +
            (showDraft ? 52 : 0) +
            10 +
            KEBAB_WIDTH;
        const calleeLineWidth = model.callee
            ? TILE_WIDTH +
              10 +
              measureText('CALLS', FONTS.label) +
              8 +
              (14 + 6 + measureText(model.callee.path, FONTS.chip) + 6 + 12 + 16) +
              12 +
              measureText(`→ ${model.callee.returnLabel}`, FONTS.ret) +
              28
            : TILE_WIDTH +
              10 +
              measureText('CALLS', FONTS.label) +
              8 +
              measureText('Select a function or ruleset…', FONTS.placeholder) +
              40;
        const layout = computeFunctionNodeLayout({
            titleWidth,
            calleeLineWidth,
            argumentNameWidths: model.arguments.map((argument) => measureText(argument.name, FONTS.name) + 28),
            resultNameWidths: model.results.map((result) => measureText(result.name, FONTS.name)),
        });
        // A node without a callee has no body to size: the empty-state text sets 7 to 12 steps.
        return model.callee ? layout : {...layout, width: Math.min(480, Math.max(280, layout.width))};
    }, [model]);
}

type Editing =
    | {kind: 'node-name'}
    | {kind: 'field'}
    | {kind: 'result'; name: string}
    | {kind: 'argument'; name: string}
    | {kind: 'description'};

const NO_DESCRIPTIONS = {subscribe: () => () => {}, getDescription: () => undefined};

/** The EdgeRules FunctionNode: structure only. Wires show where argument values come from. */
export function FunctionNode({data, selected}: NodeProps<FunctionNodeType>): ReactElement {
    const {service, documentation, readOnly = false, onOpenNode} = useFlowEditor();
    const model = useFunctionNodeModel(service, data.field);
    const layout = useNodeLayout(model);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [pickerOpened, setPickerOpened] = useState(false);
    const description = useSyncExternalStore((documentation ?? NO_DESCRIPTIONS).subscribe, () =>
        (documentation ?? NO_DESCRIPTIONS).getDescription(data.field),
    );
    const {callee} = model;
    const field = model.field;
    const showDraft = model.draft && callee !== undefined;
    const hasArguments = model.arguments.length > 0;
    const rowCount = Math.max(model.arguments.length, model.results.length);
    const argumentTrack = layout.argumentTrack;

    // Runs a service command; an error text keeps an inline edit open.
    const run = (command: () => unknown): string | void => {
        const result = command();
        if (isPortableError(result)) return result.message;
    };

    const addArgument = (after?: string) => {
        const before = new Set(model.arguments.map((argument) => argument.name));
        if (run(() => service.addArgument(field, after))) return;
        const added = service.getFunctionNode(field).arguments.find((argument) => !before.has(argument.name));
        if (added) setEditing({kind: 'argument', name: added.name});
    };

    const menuItems = nodeMenuItems({
        model,
        hasDescription: Boolean(description),
        canDescribe: documentation !== undefined,
        readOnly,
        onOpenNode,
        onRenameNode: () => setEditing({kind: 'node-name'}),
        onRenameField: () => setEditing({kind: 'field'}),
        onChangeCallee: () => setPickerOpened(true),
        onDuplicate: () => void run(() => service.duplicate(field)),
        onAddDescription: () => setEditing({kind: 'description'}),
        onRemoveDescription: () => documentation?.setDescription(field, ''),
        onAddArgument: () => addArgument(),
        onRemoveFromFlow: () => void run(() => service.removeFromFlow(field)),
        onDelete: () => {
            const failed = run(() => service.deleteField(field));
            if (!failed) documentation?.setDescription(field, '');
        },
    });

    const title = model.label ?? field;

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''}`}
            style={{width: layout.width}}
            data-testid={`function-node-${field}`}
        >
            <div className={`${styles.row} ${styles.tall}`}>
                <div className={styles.tile} style={{background: KIND_COLOR[callee?.kind ?? 'function']}}>
                    <KindIcon kind={callee?.kind ?? 'function'} size={19} />
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
                            {showDraft && (
                                <span
                                    className={styles.draftBadge}
                                    title="Not written to the model until every required argument is bound"
                                >
                                    draft
                                </span>
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
                        <span className={styles.callsLabel}>calls</span>
                        <CalleePicker
                            callees={service.listCallees()}
                            selected={callee}
                            disabled={readOnly}
                            opened={pickerOpened}
                            onOpenedChange={setPickerOpened}
                            onSelect={(method) => void run(() => service.setCallee(field, method))}
                        />
                        {callee && (
                            <>
                                <span className={styles.retType} title={callee.returnLabel}>
                                    → {callee.returnLabel}
                                </span>
                                <Pin id="out:*" side="out" type="record" forceRecord title={field} />
                            </>
                        )}
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

            {!callee ? (
                <div className={styles.emptyBody}>
                    Pick a function or ruleset. Its parameters become input pins and its results become output pins.
                </div>
            ) : (
                <>
                    <div className={styles.row}>
                        {hasArguments && (
                            <div className={`${styles.half} ${styles.band}`} style={{width: argumentTrack}}>
                                {plural('argument', model.arguments.length)}
                            </div>
                        )}
                        <div
                            className={`${styles.half} ${styles.band} ${styles.bandResult}`}
                            style={{width: layout.resultTrack}}
                        >
                            {plural('result', model.results.length)}
                        </div>
                    </div>
                    {Array.from({length: rowCount}, (_, index) => {
                        const argument = model.arguments[index];
                        const result = model.results[index];
                        const failed = argument !== undefined && model.error?.parameter === argument.name;
                        return (
                            <div key={index} className={`${styles.row} ${failed ? styles.rowError : ''}`}>
                                {hasArguments &&
                                    (argument ? (
                                        <div
                                            className={`${styles.half} ${styles.argRow}`}
                                            style={{width: argumentTrack}}
                                        >
                                            <Pin
                                                id={`in:${argument.name}`}
                                                side="in"
                                                type={argument.type}
                                                bound={argument.binding?.kind}
                                                bad={!argument.binding || failed}
                                                title={pinTitle(argument)}
                                            />
                                            <div
                                                className={`${styles.pname} ${styles.argName}`}
                                                title={pinTitle(argument)}
                                            >
                                                {editing?.kind === 'argument' && editing.name === argument.name ? (
                                                    <InlineInput
                                                        value={argument.name}
                                                        ariaLabel={`Name of argument ${argument.name}`}
                                                        onCommit={(text) =>
                                                            run(() =>
                                                                service.renameArgument(field, argument.name, text),
                                                            ) ?? setEditing(null)
                                                        }
                                                        onCancel={() => setEditing(null)}
                                                    />
                                                ) : (
                                                    <>
                                                        <span className={styles.nameText}>{argument.name}</span>
                                                        <span className={styles.required}>*</span>
                                                    </>
                                                )}
                                                {!readOnly && (
                                                    <RowActionsMenu
                                                        footer={argumentMenuFooter(model)}
                                                        items={argumentMenuItems({
                                                            model,
                                                            argument,
                                                            onMove: (direction) =>
                                                                void run(() =>
                                                                    service.moveArgument(
                                                                        field,
                                                                        argument.name,
                                                                        direction,
                                                                    ),
                                                                ),
                                                            onAddBelow: () => addArgument(argument.name),
                                                            onDelete: () =>
                                                                void run(() =>
                                                                    service.removeArgument(field, argument.name),
                                                                ),
                                                        })}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={`${styles.argKebab} nodrag`}
                                                            aria-label={`Actions for argument ${argument.name}`}
                                                            aria-haspopup="menu"
                                                        >
                                                            <IconDotsVertical size={15} />
                                                        </button>
                                                    </RowActionsMenu>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={styles.half} style={{width: argumentTrack}}>
                                            <div className={styles.filler} />
                                        </div>
                                    ))}
                                {result ? (
                                    <div className={styles.half} style={{width: layout.resultTrack}}>
                                        <div className={`${styles.pname} ${styles.resultName}`}>
                                            {editing?.kind === 'result' && editing.name === result.name ? (
                                                <InlineInput
                                                    value={result.name}
                                                    align="end"
                                                    ariaLabel={`Rename result ${result.name}`}
                                                    onCommit={(text) =>
                                                        run(() => service.renameResult(field, result.name, text)) ??
                                                        setEditing(null)
                                                    }
                                                    onCancel={() => setEditing(null)}
                                                />
                                            ) : result.renamable && !readOnly ? (
                                                <button
                                                    type="button"
                                                    className={`${styles.resultButton} nodrag`}
                                                    title={`Click to rename ${result.name} in ${callee.path}`}
                                                    onClick={() => setEditing({kind: 'result', name: result.name})}
                                                >
                                                    {result.name}
                                                </button>
                                            ) : (
                                                <span
                                                    className={`${styles.nameText} ${result.renamable ? '' : styles.locked}`}
                                                    title={
                                                        result.renamable
                                                            ? result.name
                                                            : `Unnamed return of ${callee.path}. It cannot be renamed.`
                                                    }
                                                >
                                                    {result.name}
                                                </span>
                                            )}
                                        </div>
                                        <Pin
                                            id={`out:${result.name}`}
                                            side="out"
                                            type={result.type}
                                            title={`${field}${result.name === 'result' && !result.renamable ? '' : `.${result.name}`} : ${result.type}`}
                                        />
                                    </div>
                                ) : (
                                    <div className={styles.half} style={{width: layout.resultTrack}}>
                                        <div className={styles.filler} />
                                    </div>
                                )}
                                {failed && model.error && (
                                    <span className={styles.errorMessage} role="alert">
                                        {model.error.message}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
