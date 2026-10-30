import {Tooltip} from '@mantine/core';
import {IconArrowAutofitWidth, IconFlask, IconNotes, IconPlus} from '@tabler/icons-react';
import {Fragment, type ReactElement, type ReactNode} from 'react';
import {RowActionsMenu} from '#ui/RowActionsMenu';
import {cx} from '#ui/cx';
import type {BoxedRowData, BoxedRowKind} from '../boxed-editor-types';
import {DescriptionCell} from '../cells/DescriptionCell';
import {TestResultsHeader} from '../cells/TestResultCell';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {useRowActions} from '../hooks/useRowActions';
import * as classes from '../boxedEditor.module.css';
import {Cell, RowActionsButton, ROW_HEIGHT} from '../primitives';

/** The metaphor name the header shows when the editor opens one entity instead of the whole model. */
const METAPHOR_NAMES: Partial<Record<BoxedRowKind, string>> = {
    field: 'Expression',
    context: 'Context',
    complexType: 'Type',
    list: 'List',
    'list-item': 'List item',
    relation: 'Relation',
    'relation-item': 'Relation item',
    function: 'Function',
    'function-result': 'Function result',
    ruleset: 'Decision table',
    rule: 'Rule',
    optimisation: 'Optimisation',
};

function metaphorName(row: BoxedRowData): string {
    if (row.kind === 'model') return row.name;
    return METAPHOR_NAMES[row.kind] ?? row.kind;
}

interface HeaderButtonProps {
    label: string;
    /** Set for a toggle; a pressed toggle keeps its hover look. */
    pressed?: boolean;
    onClick: () => void;
    children: ReactNode;
}

function HeaderButton({label, pressed, onClick, children}: HeaderButtonProps): ReactElement {
    return (
        <Tooltip label={label} withinPortal>
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                className={cx(classes.headerButton, pressed && classes.headerButtonPressed)}
                onClick={onClick}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export interface HeaderRowProps {
    /** The root row of the editor: the `model` row for `'*'`, otherwise the opened entity. */
    row: BoxedRowData;
}

/**
 * The one-step header on top of every opened Boxed Expression: the model name (root) or the metaphor name, the
 * `Expand` button (only when the host gives `onExpand`), the description and test-results column toggles, and — at
 * the model root only — the `plus` menu that adds entities. The model name, version and description are edited in the settings of the Shell.
 * Above the two overlay columns it shows their headings: the model description and the test case selector.
 */
export function HeaderRow({row}: HeaderRowProps): ReactElement {
    const {testCasesService, onExpand, setShowDescription, setShowTestResults} = useBoxedEditorContext();
    const {template, showDescription, showTestResults} = useBoxedLayout();
    const actions = useRowActions(row);
    const isModel = row.kind === 'model';

    return (
        <Fragment>
            <div
                // The opened entity renders its own `row-<path>` below; only the model root has no other row.
                data-testid={isModel ? `row-${row.path}` : 'header-row'}
                className={cx(classes.row, classes.headerRow)}
                style={{gridTemplateColumns: template, height: ROW_HEIGHT}}
            >
                <div className={cx(classes.nameColumn, classes.span2)}>
                    <div aria-hidden="true" className={classes.handle} />
                    <div role="heading" aria-level={2} className={cx(classes.headerTitle, classes.strong)}>
                        {metaphorName(row)}
                    </div>
                    {onExpand && (
                        <HeaderButton label="Expand" onClick={onExpand}>
                            <IconArrowAutofitWidth size={18} />
                        </HeaderButton>
                    )}
                    {setShowDescription && (
                        <HeaderButton
                            label={showDescription ? 'Hide description' : 'Show description'}
                            pressed={showDescription}
                            onClick={() => setShowDescription(!showDescription)}
                        >
                            <IconNotes size={18} />
                        </HeaderButton>
                    )}
                    {setShowTestResults && testCasesService !== undefined && (
                        <HeaderButton
                            label={showTestResults ? 'Hide test column' : 'Show test column'}
                            pressed={showTestResults}
                            onClick={() => setShowTestResults(!showTestResults)}
                        >
                            <IconFlask size={18} />
                        </HeaderButton>
                    )}
                </div>
                {isModel && actions.length > 0 ? (
                    <RowActionsMenu items={actions}>
                        <RowActionsButton icon={<IconPlus size={20} />} />
                    </RowActionsMenu>
                ) : (
                    <div aria-hidden="true" className={classes.actionsFiller} />
                )}
                {showDescription && (
                    <Cell column="description">
                        {isModel ? (
                            <DescriptionCell path={row.path} />
                        ) : (
                            <span className={classes.columnHeading}>Description</span>
                        )}
                    </Cell>
                )}
                {showTestResults && (
                    <Cell column="test-results" flush>
                        <TestResultsHeader />
                    </Cell>
                )}
            </div>
        </Fragment>
    );
}
