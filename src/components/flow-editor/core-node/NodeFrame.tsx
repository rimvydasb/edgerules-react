import type {ReactElement} from 'react';
import {useFlowEditor} from '../FlowEditorProvider';
import {DescriptionRow} from './DescriptionRow';
import {InlineInput} from './InlineInput';
import {NodeMenuButton} from './NodeMenuButton';
import {runCommand} from './useCoreNode';
import type {NodeFrameProps} from './types';
import styles from './coreNode.module.css';

/**
 * The frame every node kind shares: an 80px header (tile, title line with the node menu, summary line), the
 * description row and the body. The frame owns the header edits: node name, field name and description.
 */
export function NodeFrame({
    field,
    label,
    testId,
    selected,
    width,
    color,
    icon,
    badge,
    summaryLabel,
    summary,
    menuItems,
    editing,
    onEditingChange,
    children,
}: NodeFrameProps): ReactElement {
    const {service, documentation, readOnly = false} = useFlowEditor();
    const title = label ?? field;
    const stopEditing = () => onEditingChange(null);

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ''}`} style={{width}} data-testid={testId}>
            <div className={`${styles.row} ${styles.tall}`}>
                <div className={styles.tile} style={{background: color}} aria-hidden>
                    {icon}
                </div>
                <div className={styles.headStack}>
                    <div className={`${styles.headLine} ${styles.headFirst}`}>
                        <div className={styles.title}>
                            {editing?.kind === 'node-name' ? (
                                <InlineInput
                                    value={label ?? ''}
                                    ariaLabel={`Name of node ${field}`}
                                    placeholder={field}
                                    onCommit={(text) =>
                                        runCommand(() => service.setNodeName(field, text)) ?? stopEditing()
                                    }
                                    onCancel={stopEditing}
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
                                        const failed = runCommand(() => service.renameField(field, text));
                                        if (failed) return failed;
                                        if (text !== field) documentation?.renamePath(field, text);
                                        stopEditing();
                                    }}
                                    onCancel={stopEditing}
                                />
                            ) : (
                                <span className={styles.fieldName}>{field}</span>
                            )}
                            {badge}
                        </div>
                        <NodeMenuButton items={menuItems} ariaLabel="Node actions" />
                    </div>
                    <div className={styles.headLine}>
                        <span className={styles.summaryLabel}>{summaryLabel}</span>
                        {summary}
                    </div>
                </div>
            </div>
            {documentation && (
                <DescriptionRow
                    documentation={documentation}
                    field={field}
                    editing={editing?.kind === 'description'}
                    readOnly={readOnly}
                    onEditingChange={(next) => onEditingChange(next ? {kind: 'description'} : null)}
                />
            )}
            {children}
        </div>
    );
}

/** The dimmed, right-aligned text of the summary line, for example a return type. */
export function NodeSummary({children}: {children: string}): ReactElement {
    return (
        <span className={styles.summaryText} title={children}>
            {children}
        </span>
    );
}
