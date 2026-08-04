import Box from '@mui/material/Box';
import type {ReactElement} from 'react';
import {EditableColumnHeader} from './EditableColumnHeader';
import {CELL, TALL_ROW_HEIGHT} from './layout';

export interface Argument {
    name: string;
    type?: string;
}

export interface ArgumentHeadersProps {
    rowPath: string;
    arguments: Argument[];
    onRename: (from: string, to: string) => string | undefined;
    onRetype: (name: string, type: string) => string | undefined;
    onMove: (from: number, to: number) => void;
}

/**
 * The argument/column header block under a tall (80 px) container header row's `ValueColumn` —
 * `function`, `ruleset`, `optimisation`. Not consumed until Phase 4, built now alongside the
 * rest of the shared primitive set.
 */
export function ArgumentHeaders({
    rowPath,
    arguments: args,
    onRename,
    onRetype,
    onMove,
}: ArgumentHeadersProps): ReactElement {
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
                {args.map((argument, index) => (
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
                        <EditableColumnHeader
                            rowPath={rowPath}
                            name={argument.name}
                            type={argument.type}
                            typeEditable
                            index={index}
                            count={args.length}
                            onRename={(name) => onRename(argument.name, name)}
                            onRetype={(type) => onRetype(argument.name, type)}
                            onMove={(to) => onMove(index, to)}
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
