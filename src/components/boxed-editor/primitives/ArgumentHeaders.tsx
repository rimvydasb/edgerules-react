import Box from '@mui/material/Box';
import type {ReactElement} from 'react';
import {ColumnDragHandle} from './ColumnDragHandle';
import {CELL, TALL_ROW_HEIGHT} from './layout';
import {TypeName} from './TypeName';

export interface Argument {
    name: string;
    type?: string;
}

export interface ArgumentHeadersProps {
    arguments: Argument[];
}

/**
 * The argument/column header block under a tall (80 px) container header row's `ValueColumn` —
 * `function`, `ruleset`, `optimisation`. Not consumed until Phase 4, built now alongside the
 * rest of the shared primitive set.
 */
export function ArgumentHeaders({arguments: args}: ArgumentHeadersProps): ReactElement {
    return (
        <Box sx={{display: 'flex', flexDirection: 'column', width: '100%', height: TALL_ROW_HEIGHT}}>
            <Box
                sx={{
                    display: 'flex',
                    height: CELL,
                    alignItems: 'center',
                    px: 1,
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'text.secondary',
                }}
            >
                arguments
            </Box>
            <Box sx={{display: 'flex', height: CELL}}>
                {args.map((argument) => (
                    <Box
                        key={argument.name}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 0,
                            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                            '&:last-of-type': {borderRight: 'none'},
                        }}
                    >
                        <ColumnDragHandle />
                        <TypeName type={argument.type} sx={{px: 1}}>
                            {argument.name}
                        </TypeName>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
