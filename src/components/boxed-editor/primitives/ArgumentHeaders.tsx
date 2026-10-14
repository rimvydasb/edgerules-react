import type {ReactElement} from 'react';
import * as classes from '../boxedEditor.module.css';
import {EditableColumnHeader} from './EditableColumnHeader';
import {cx} from '../../../ui/cx';

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
        <div className={cx(classes.stack, classes.tall)}>
            <div className={cx(classes.line, classes.bandLabel, classes.bandBottom)}>arguments</div>
            <div className={classes.line}>
                {args.map((argument, index) => (
                    <div key={argument.name} className={classes.groupCell}>
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
                    </div>
                ))}
            </div>
        </div>
    );
}
