import {Tooltip} from '@mantine/core';
import {
    IconBook2,
    IconBraces,
    IconChevronRight,
    IconFlask,
    IconListCheck,
    IconMathFunction,
    IconSitemap,
    IconTag,
    IconVariable,
} from '@tabler/icons-react';
import {Fragment, type ReactElement} from 'react';
import {cx} from '#ui/cx';
import {KIND_COLORS} from '#ui/kindColors';
import type {ShellPathKind, ShellPathSegment} from './shell-path';
import * as classes from './shell.module.css';

export interface ShellBreadcrumbsProps {
    segments: ShellPathSegment[]; // the root path, one segment per field
    rootLabel?: string; // the model name; defaults to 'Model'
    onNavigate: (path: string) => void; // a crumb click; '*' is the model name
    primaryView: 'flow' | 'boxed'; // the view the kind icon opens: Flow when the root path has it, otherwise Boxed
    onOpenPrimary: () => void;
    tests?: boolean; // the Tests view: the root path is a test subject
}

type GlyphKind = 'model' | 'tests' | ShellPathKind;

// The icon square of the root path kind, in the shared kind colors of the Boxed Editor header rows. A context row of
// the Boxed Editor has no colored icon, so a context and a plain field get a muted one.
function KindGlyph({kind}: {kind: GlyphKind}): ReactElement {
    switch (kind) {
        case 'model':
            return <IconSitemap size={20} color="#fff" />;
        case 'tests':
            return <IconFlask size={19} color="#fff" />;
        case 'workbook':
            return <IconBook2 size={19} color="#fff" />;
        case 'function':
        case 'service':
            return <IconMathFunction size={19} color="#fff" />;
        case 'ruleset':
            return <IconListCheck size={19} color="#fff" />;
        case 'type':
            return <IconTag size={19} color="#fff" />;
        case 'field':
            return <IconVariable size={19} />;
        default:
            return <IconBraces size={19} />;
    }
}

const KIND_FILL: Partial<Record<GlyphKind, string>> = {
    model: KIND_COLORS.model,
    tests: '#2f9e44',
    workbook: KIND_COLORS.model,
    function: KIND_COLORS.function,
    service: KIND_COLORS.service,
    ruleset: KIND_COLORS.ruleset,
    type: KIND_COLORS.complexType,
};

// A callable reads as a call: `name(...)`.
function segmentLabel(segment: ShellPathSegment): string {
    return segment.kind === 'function' || segment.kind === 'service' || segment.kind === 'ruleset'
        ? `${segment.name}(...)`
        : segment.name;
}

// The kind icon square opens the root path in its main editor: the Flow Editor, or the Boxed Editor when the root
// path has no Flow view.
function KindButton({kind, view, onOpen}: {kind: GlyphKind; view: 'flow' | 'boxed'; onOpen: () => void}): ReactElement {
    const label = view === 'flow' ? 'Open in the Flow view' : 'Open in the Boxed view';
    const fill = KIND_FILL[kind];
    return (
        <Tooltip label={label} position="bottom-start" withArrow>
            <button
                type="button"
                aria-label={label}
                className={classes.kindIcon}
                style={fill ? {backgroundColor: fill} : undefined}
                onClick={onOpen}
                data-testid="shell-kind-icon"
            >
                <KindGlyph kind={kind} />
            </button>
        </Tooltip>
    );
}

/**
 * `Loan repayment` › `applicant` › `calculateAge(...)`: the fully qualified root path, the last item as plain text. In the
 * Tests view, the path of the test subject. The model name is always a button: it opens the model root.
 */
export function ShellBreadcrumbs({
    segments,
    rootLabel = 'Model',
    onNavigate,
    primaryView,
    onOpenPrimary,
    tests,
}: ShellBreadcrumbsProps): ReactElement {
    const items = [
        {label: rootLabel, path: '*'},
        ...segments.map((segment) => ({label: segmentLabel(segment), path: segment.path})),
    ];
    return (
        <>
            <KindButton
                kind={tests ? 'tests' : (segments.at(-1)?.kind ?? 'model')}
                view={primaryView}
                onOpen={onOpenPrimary}
            />
            <nav aria-label="Model path" className={classes.breadcrumbs}>
                {items.map((item, index) => (
                    <Fragment key={item.path}>
                        {index > 0 && <IconChevronRight aria-hidden="true" size={14} className={classes.separator} />}
                        {index === 0 || index < items.length - 1 ? (
                            <button
                                type="button"
                                className={cx(classes.crumb, index === items.length - 1 && classes.crumbCurrent)}
                                aria-current={index === items.length - 1 ? 'page' : undefined}
                                onClick={() => onNavigate(item.path)}
                            >
                                {item.label}
                            </button>
                        ) : (
                            <span className={classes.current} aria-current="page">
                                {item.label}
                            </span>
                        )}
                    </Fragment>
                ))}
            </nav>
        </>
    );
}
