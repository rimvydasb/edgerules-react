import {IconArrowRight, IconBook2, IconMathFunction, IconPlus} from '@tabler/icons-react';
import {useState, type ReactElement, type ReactNode} from 'react';
import {KIND_COLORS} from '#ui/kindColors';
import {CREATE_OPTIONS, CreateDialog} from '../../project-explorer/internal';
import * as classes from '../shell.module.css';

/** One workbook of the model, as its panel shows it. */
export interface WorkbookSummary {
    path: string; // the field name of the workbook
    name?: string; // the `name` of its `@Workbook` annotation
    description?: string; // from the documentation store
    inputs: number; // its `@InputNode` fields
    functions: number; // its `@FunctionNode` fields
}

/** One `@Service` function of the model, as its panel shows it. */
export interface ServiceSummary {
    path: string; // the fully qualified path of the function
    label: string; // `path(...)` when it has arguments, `path()` when it has none
    description?: string; // from the documentation store
    arguments: number;
}

export interface WorkbookPickerProps {
    workbooks: readonly WorkbookSummary[];
    services: readonly ServiceSummary[];
    onSelect: (workbook: string) => void;
    onSelectService: (service: string) => void;
    // Creates a workbook of the name; an error message, or undefined on success. Without it there is no add panel.
    onCreate?: (name: string) => string | undefined;
    taken: ReadonlySet<string>; // the root names a new workbook must not take
}

const WORKBOOK_OPTION = CREATE_OPTIONS.workbooks[0]!;

function count(value: number, noun: string): string {
    return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

interface PanelProps {
    title: string;
    field?: string; // the field path under the title
    description?: string;
    icon: ReactNode;
    iconColor: string;
    footer: string;
    action: string;
    onClick: () => void;
    testId: string;
}

function Panel({
    title,
    field,
    description,
    icon,
    iconColor,
    footer,
    action,
    onClick,
    testId,
}: PanelProps): ReactElement {
    return (
        <button
            type="button"
            className={classes.workbookPanel}
            onClick={onClick}
            aria-label={title}
            aria-description={description}
            data-testid={testId}
        >
            <span className={classes.workbookHead}>
                <span className={classes.workbookIcon} style={{backgroundColor: iconColor}}>
                    {icon}
                </span>
                <span className={classes.workbookTitles}>
                    <span className={classes.workbookTitle}>{title}</span>
                    {field !== undefined && <code className={classes.workbookField}>{field}</code>}
                </span>
            </span>
            <span className={description ? classes.workbookDescription : classes.workbookNoDescription}>
                {description || 'No description'}
            </span>
            <span className={classes.workbookFooter}>
                <span>{footer}</span>
                <span className={classes.workbookOpen}>
                    {action}
                    <IconArrowRight aria-hidden="true" size={14} />
                </span>
            </span>
        </button>
    );
}

/**
 * The Flow view of the model root when the model has workbooks: one panel per workbook with its name, its field name,
 * its description and its node counts, and a panel that creates a new workbook. A click opens its flow. Below, one
 * panel per `@Service` function of the model; a click opens it.
 */
export function WorkbookPicker({
    workbooks,
    services,
    onSelect,
    onSelectService,
    onCreate,
    taken,
}: WorkbookPickerProps): ReactElement {
    const [creating, setCreating] = useState(false);
    return (
        <div className={classes.workbooks} data-testid="shell-workbook-picker">
            <section className={classes.workbookGroup} aria-label="Workbooks">
                <h2 className={classes.workbookGroupTitle}>Workbooks</h2>
                <div className={classes.workbookPanels}>
                    {workbooks.map((workbook) => (
                        <Panel
                            key={workbook.path}
                            title={workbook.name ?? workbook.path}
                            field={workbook.name !== undefined ? workbook.path : undefined}
                            description={workbook.description}
                            icon={<IconBook2 aria-hidden="true" size={20} color="#fff" />}
                            iconColor={KIND_COLORS.model}
                            footer={`${count(workbook.inputs, 'input')} · ${count(workbook.functions, 'function')}`}
                            action="Open flow"
                            onClick={() => onSelect(workbook.path)}
                            testId={`shell-workbook-${workbook.path}`}
                        />
                    ))}
                    {onCreate && (
                        <button
                            type="button"
                            className={classes.workbookAdd}
                            onClick={() => setCreating(true)}
                            aria-label="New workbook"
                            data-testid="shell-workbook-add"
                        >
                            <span className={classes.workbookAddIcon}>
                                <IconPlus aria-hidden="true" size={24} />
                            </span>
                            New workbook
                        </button>
                    )}
                </div>
            </section>
            {services.length > 0 && (
                <section className={classes.workbookGroup} aria-label="Service Methods">
                    <h2 className={classes.workbookGroupTitle}>Service Methods</h2>
                    <div className={classes.workbookPanels}>
                        {services.map((service) => (
                            <Panel
                                key={service.path}
                                title={service.label}
                                description={service.description}
                                icon={<IconMathFunction aria-hidden="true" size={20} color="#fff" />}
                                iconColor={KIND_COLORS.service}
                                footer={count(service.arguments, 'argument')}
                                action="Open"
                                onClick={() => onSelectService(service.path)}
                                testId={`shell-service-${service.path}`}
                            />
                        ))}
                    </div>
                </section>
            )}
            {creating && onCreate && (
                <CreateDialog
                    option={WORKBOOK_OPTION}
                    taken={taken}
                    onCancel={() => setCreating(false)}
                    onCreate={(name) => {
                        const error = onCreate(name);
                        if (error === undefined) setCreating(false);
                        return error;
                    }}
                />
            )}
        </div>
    );
}
