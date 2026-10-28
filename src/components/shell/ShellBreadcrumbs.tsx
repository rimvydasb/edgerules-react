import {Tooltip} from '@mantine/core';
import {IconBraces, IconChevronRight, IconMathFunction, IconSitemap} from '@tabler/icons-react';
import {Fragment, type ReactElement} from 'react';
import {cx} from '#ui/cx';
import {KIND_COLORS} from '#ui/kindColors';
import type {ShellPathSegment} from './shell-path';
import * as classes from './shell.module.css';

export interface ShellBreadcrumbsProps {
    segments: ShellPathSegment[]; // the root path, one segment per field
    onNavigate: (path: string) => void;
    explorerOpen: boolean;
    onToggleExplorer: () => void;
}

// The icon square of the root path kind, in the shared kind colors of the Boxed Editor header rows. A context row of
// the Boxed Editor has no colored icon, so a context gets a muted one.
function KindGlyph({kind}: {kind: 'model' | ShellPathSegment['kind']}): ReactElement {
    if (kind === 'model') return <IconSitemap size={20} color="#fff" />;
    if (kind === 'function') return <IconMathFunction size={19} color="#fff" />;
    return <IconBraces size={19} />;
}

const KIND_FILL: Partial<Record<'model' | ShellPathSegment['kind'], string>> = {
    model: KIND_COLORS.model,
    function: KIND_COLORS.function,
};

// The kind icon square also opens and closes the Project Explorer, like the rail button of the Node palette.
function ExplorerToggle({
    kind,
    open,
    onToggle,
}: {
    kind: 'model' | ShellPathSegment['kind'];
    open: boolean;
    onToggle: () => void;
}): ReactElement {
    const label = open ? 'Hide project explorer' : 'Show project explorer';
    const fill = KIND_FILL[kind];
    return (
        <Tooltip label={label} position="bottom-start" withArrow>
            <button
                type="button"
                aria-label={label}
                aria-pressed={open}
                className={cx(classes.kindIcon, open && classes.kindIconOpen)}
                style={fill ? {backgroundColor: fill} : undefined}
                onClick={onToggle}
            >
                <KindGlyph kind={kind} />
            </button>
        </Tooltip>
    );
}

/** `Model` › `applicant` › `calculateAge(...)`: the fully qualified root path, the last item as plain text. */
export function ShellBreadcrumbs({
    segments,
    onNavigate,
    explorerOpen,
    onToggleExplorer,
}: ShellBreadcrumbsProps): ReactElement {
    const items = [
        {label: 'Model', path: '*'},
        ...segments.map((segment) => ({
            label: segment.kind === 'function' ? `${segment.name}(...)` : segment.name,
            path: segment.path,
        })),
    ];
    return (
        <>
            <ExplorerToggle kind={segments.at(-1)?.kind ?? 'model'} open={explorerOpen} onToggle={onToggleExplorer} />
            <nav aria-label="Model path" className={classes.breadcrumbs}>
                {items.map((item, index) => (
                    <Fragment key={item.path}>
                        {index > 0 && <IconChevronRight aria-hidden="true" size={14} className={classes.separator} />}
                        {index === items.length - 1 ? (
                            <span className={classes.current} aria-current="page">
                                {item.label}
                            </span>
                        ) : (
                            <button type="button" className={classes.crumb} onClick={() => onNavigate(item.path)}>
                                {item.label}
                            </button>
                        )}
                    </Fragment>
                ))}
            </nav>
        </>
    );
}
