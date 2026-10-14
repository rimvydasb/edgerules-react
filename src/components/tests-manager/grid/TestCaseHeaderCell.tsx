import {IconDotsVertical, IconGripVertical} from '@tabler/icons-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {useState, useSyncExternalStore, type CSSProperties, type ReactElement} from 'react';
import type {TestCase} from '../../test-cases-service';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {testCaseActionsFor} from '../menu/actions';
import {TestsMenu} from '../menu/TestsMenu';
import {cx} from '../../../ui/cx';
import * as classes from './testsGrid.module.css';

// Three fixed parts: a 40x40 drag handle (reorders the column via `useColumnDrag`'s
// `DndContext`/`SortableContext`), the click-to-edit case name, and a 40x40 three-dots menu. Only the
// two inner dividers are drawn here — the outer frame is the host cell's own (single) border.
export function TestCaseHeaderCell({testCase}: {testCase: TestCase}): ReactElement {
    const {testCasesService, runner, readOnly} = useTestsManagerContext();
    const running = useSyncExternalStore(runner.subscribe, runner.getRunning);
    const isRunning = running.includes(testCase.id);
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState(testCase.name);
    const sortable = useSortable({id: testCase.id, disabled: readOnly});

    const commitName = (): void => {
        if (draftName.trim() !== '' && draftName !== testCase.name) {
            testCasesService.renameTestCase(testCase.id, draftName);
        }
        setEditing(false);
    };

    const startRename = (): void => {
        setDraftName(testCase.name);
        setEditing(true);
    };

    const style: CSSProperties = {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
    };

    return (
        <span
            ref={sortable.setNodeRef}
            data-testid={`case-header-${testCase.id}`}
            className={classes.caseHeader}
            style={style}
        >
            {!readOnly && (
                <span
                    aria-label={`drag ${testCase.name}`}
                    {...sortable.attributes}
                    {...sortable.listeners}
                    className={cx(classes.caseHandle, classes.drag)}
                >
                    <IconGripVertical size={16} />
                </span>
            )}
            <span
                onClick={() => !readOnly && !editing && startRename()}
                className={classes.caseName}
                style={{cursor: readOnly ? 'default' : 'text'}}
            >
                {editing ? (
                    <input
                        aria-label={`rename ${testCase.name}`}
                        value={draftName}
                        autoFocus
                        className={classes.caseNameInput}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={commitName}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                    />
                ) : (
                    <span className={classes.caseNameText}>{testCase.name}</span>
                )}
                {isRunning ? <span data-testid={`running-${testCase.id}`}>⏳</span> : null}
            </span>
            {!readOnly && (
                <span className={classes.caseMenu}>
                    <TestsMenu actions={testCaseActionsFor(testCase, testCasesService, runner)}>
                        <button type="button" aria-label={`case menu ${testCase.name}`} className={classes.iconButton}>
                            <IconDotsVertical size={16} />
                        </button>
                    </TestsMenu>
                </span>
            )}
        </span>
    );
}
