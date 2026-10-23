import {IconBraces, IconChevronRight, IconMathFunction, IconSitemap} from '@tabler/icons-react';
import {Fragment, type ReactElement} from 'react';
import {KIND_COLORS} from '#ui/kindColors';
import type {ShellPathSegment} from './shell-path';
import * as classes from './shell.module.css';

export interface ShellBreadcrumbsProps {
    segments: ShellPathSegment[]; // the root path, one segment per field
    onNavigate: (path: string) => void;
}

// The icon square of the root path kind, in the shared kind colors of the Boxed Editor header rows. A context row of
// the Boxed Editor has no colored icon, so a context gets a muted one.
function KindIcon({kind}: {kind: 'model' | ShellPathSegment['kind']}): ReactElement {
    if (kind === 'model') {
        return (
            <div aria-hidden="true" className={classes.kindIcon} style={{backgroundColor: KIND_COLORS.model}}>
                <IconSitemap size={20} color="#fff" />
            </div>
        );
    }
    if (kind === 'function') {
        return (
            <div aria-hidden="true" className={classes.kindIcon} style={{backgroundColor: KIND_COLORS.function}}>
                <IconMathFunction size={19} color="#fff" />
            </div>
        );
    }
    return (
        <div aria-hidden="true" className={classes.kindIcon}>
            <IconBraces size={19} />
        </div>
    );
}

/** `Model` › `applicant` › `calculateAge(...)`: the fully qualified root path, the last item as plain text. */
export function ShellBreadcrumbs({segments, onNavigate}: ShellBreadcrumbsProps): ReactElement {
    const items = [
        {label: 'Model', path: '*'},
        ...segments.map((segment) => ({
            label: segment.kind === 'function' ? `${segment.name}(...)` : segment.name,
            path: segment.path,
        })),
    ];
    return (
        <>
            <KindIcon kind={segments.at(-1)?.kind ?? 'model'} />
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
