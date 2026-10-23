import {Anchor, Breadcrumbs, Text} from '@mantine/core';
import type {ReactElement} from 'react';
import type {ShellPathSegment} from './shell-path';

export interface ShellBreadcrumbsProps {
    segments: ShellPathSegment[]; // the root path, one segment per field
    onNavigate: (path: string) => void;
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
        <nav aria-label="Model path">
            <Breadcrumbs separator="›" separatorMargin={6}>
                {items.map((item, index) =>
                    index === items.length - 1 ? (
                        <Text key={item.path} size="sm" fw={600} aria-current="page">
                            {item.label}
                        </Text>
                    ) : (
                        <Anchor key={item.path} size="sm" component="button" onClick={() => onNavigate(item.path)}>
                            {item.label}
                        </Anchor>
                    ),
                )}
            </Breadcrumbs>
        </nav>
    );
}
