import type {NodeProps} from '@xyflow/react';
import {useState, type ReactElement} from 'react';
import {
    EditableName,
    InlineInput,
    NodeEmptyState,
    NodeFrame,
    NodeMenuButton,
    NodeSummary,
    Pin,
    runCommand,
    Track,
    TrackBand,
    TrackFiller,
    TrackName,
    TrackNameText,
    TrackRow,
    useCoreNode,
    useServiceRead,
    useSyncPins,
} from '../core-node';
import {CalleePicker} from './CalleePicker';
import {KIND_COLOR, KindIcon} from './KindIcon';
import {argumentMenuFooter, argumentMenuItems, functionNodeMenuItems} from './functionNodeMenus';
import {useFunctionNodeLayout} from './layout';
import type {FunctionNodeRowEditing, FunctionNodeType, NodeArgument, NodeResult} from './types';
import styles from './functionNode.module.css';

function pinTitle(argument: NodeArgument): string {
    const {binding} = argument;
    if (!binding) return `${argument.name} : ${argument.type} (unbound)`;
    return `${argument.name} : ${argument.type} ${binding.kind === 'path' ? '←' : '='} ${binding.text}`;
}

function resultPinTitle(field: string, result: NodeResult): string {
    const unnamed = result.name === 'result' && !result.renamable;
    return `${field}${unnamed ? '' : `.${result.name}`} : ${result.type}`;
}

/** The EdgeRules FunctionNode: structure only. Wires show where argument values come from. */
export function FunctionNode({id, data, selected}: NodeProps<FunctionNodeType>): ReactElement {
    const {service, readOnly, onOpenNode, editing, setEditing, menu} = useCoreNode<FunctionNodeRowEditing>(data.field);
    const model = useServiceRead(service, data.field, () => service.getFunctionNode(data.field));
    const layout = useFunctionNodeLayout(model);
    useSyncPins(
        id,
        [
            layout.width,
            model.callee?.path,
            model.arguments.map((argument) => argument.name).join(','),
            model.results.map((result) => result.name).join(','),
        ].join('|'),
    );
    const [pickerOpened, setPickerOpened] = useState(false);
    const {callee, field} = model;
    const hasArguments = model.arguments.length > 0;
    const rowCount = Math.max(model.arguments.length, model.results.length);
    const stopEditing = () => setEditing(null);

    const addArgument = (after?: string) => {
        const before = new Set(model.arguments.map((argument) => argument.name));
        if (runCommand(() => service.addArgument(field, after))) return;
        const added = service.getFunctionNode(field).arguments.find((argument) => !before.has(argument.name));
        if (added) setEditing({kind: 'argument', name: added.name});
    };

    const menuItems = functionNodeMenuItems({
        ...menu,
        model,
        onOpenNode,
        onAddArgument: () => addArgument(),
    });

    const renderArgument = (argument: NodeArgument, failed: boolean) => (
        <Track width={layout.inputTrack}>
            <Pin
                id={`in:${argument.name}`}
                side="in"
                type={argument.type}
                bound={argument.binding?.kind}
                bad={!argument.binding || failed}
                title={pinTitle(argument)}
            />
            <TrackName side="in" title={pinTitle(argument)}>
                {editing?.kind === 'argument' && editing.name === argument.name ? (
                    <InlineInput
                        value={argument.name}
                        ariaLabel={`Name of argument ${argument.name}`}
                        onCommit={(text) =>
                            runCommand(() => service.renameArgument(field, argument.name, text)) ?? stopEditing()
                        }
                        onCancel={stopEditing}
                    />
                ) : (
                    <>
                        <TrackNameText>{argument.name}</TrackNameText>
                        <span className={styles.required}>*</span>
                    </>
                )}
                {!readOnly && (
                    <NodeMenuButton
                        variant="row"
                        ariaLabel={`Actions for argument ${argument.name}`}
                        footer={argumentMenuFooter(model)}
                        items={argumentMenuItems({
                            model,
                            argument,
                            onMove: (direction) =>
                                void runCommand(() => service.moveArgument(field, argument.name, direction)),
                            onAddBelow: () => addArgument(argument.name),
                            onDelete: () => void runCommand(() => service.removeArgument(field, argument.name)),
                        })}
                    />
                )}
            </TrackName>
        </Track>
    );

    const renderResult = (result: NodeResult, calleePath: string) => (
        <Track width={layout.outputTrack}>
            <TrackName side="out">
                <EditableName
                    name={result.name}
                    editing={editing?.kind === 'result' && editing.name === result.name}
                    editable={result.renamable && !readOnly}
                    title={
                        !result.renamable
                            ? `Unnamed return of ${calleePath}. It cannot be renamed.`
                            : readOnly
                              ? result.name
                              : `Click to rename ${result.name} in ${calleePath}`
                    }
                    className={result.renamable ? undefined : styles.locked}
                    ariaLabel={`Rename result ${result.name}`}
                    onStartEditing={() => setEditing({kind: 'result', name: result.name})}
                    onCommit={(text) =>
                        runCommand(() => service.renameResult(field, result.name, text)) ?? stopEditing()
                    }
                    onCancel={stopEditing}
                />
            </TrackName>
            <Pin id={`out:${result.name}`} side="out" type={result.type} title={resultPinTitle(field, result)} />
        </Track>
    );

    return (
        <NodeFrame
            field={field}
            label={model.label}
            testId={`function-node-${field}`}
            selected={selected}
            width={layout.width}
            color={KIND_COLOR[callee?.kind ?? 'function']}
            icon={<KindIcon kind={callee?.kind ?? 'function'} size={19} />}
            badge={
                model.draft &&
                callee && (
                    <span
                        className={styles.draftBadge}
                        title="Not written to the model until every required argument is bound"
                    >
                        draft
                    </span>
                )
            }
            summaryLabel="calls"
            summary={
                <>
                    <CalleePicker
                        callees={service.listCallees()}
                        selected={callee}
                        disabled={readOnly}
                        opened={pickerOpened}
                        onOpenedChange={setPickerOpened}
                        onSelect={(method) => void runCommand(() => service.setCallee(field, method))}
                    />
                    {callee && (
                        <>
                            <NodeSummary>{`→ ${callee.returnLabel}`}</NodeSummary>
                            <Pin id="out:*" side="out" type="record" forceRecord title={field} />
                        </>
                    )}
                </>
            }
            menuItems={menuItems}
            editing={editing}
            onEditingChange={setEditing}
        >
            {!callee ? (
                <NodeEmptyState>
                    Pick a function or ruleset. Its parameters become input pins and its results become output pins.
                </NodeEmptyState>
            ) : (
                <>
                    <TrackRow>
                        {hasArguments && (
                            <TrackBand
                                width={layout.inputTrack}
                                side="in"
                                noun="argument"
                                count={model.arguments.length}
                            />
                        )}
                        <TrackBand width={layout.outputTrack} side="out" noun="result" count={model.results.length} />
                    </TrackRow>
                    {Array.from({length: rowCount}, (_, index) => {
                        const argument = model.arguments[index];
                        const result = model.results[index];
                        const failed = argument !== undefined && model.error?.parameter === argument.name;
                        return (
                            <TrackRow key={index} error={failed ? model.error?.message : undefined}>
                                {hasArguments &&
                                    (argument ? (
                                        renderArgument(argument, failed)
                                    ) : (
                                        <TrackFiller width={layout.inputTrack} />
                                    ))}
                                {result ? (
                                    renderResult(result, callee.path)
                                ) : (
                                    <TrackFiller width={layout.outputTrack} />
                                )}
                            </TrackRow>
                        );
                    })}
                </>
            )}
        </NodeFrame>
    );
}
