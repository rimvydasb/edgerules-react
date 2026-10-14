import type {ReactElement} from 'react';
import * as classes from '../boxedEditor.module.css';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {EditableColumnHeader} from './EditableColumnHeader';
import {splitUnits} from './layout';
import {SubGrid, SubGridStack, Track} from './SubGrid';

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
 * The argument header block under a tall (80 px) `function`/`optimisation` header row's value
 * cell (render it with `valueIsSubGrid`): an "arguments" band, then one whole-step track per
 * argument.
 */
export function ArgumentHeaders({
    rowPath,
    arguments: args,
    onRename,
    onRetype,
    onMove,
}: ArgumentHeadersProps): ReactElement {
    const {valueUnits} = useBoxedLayout();
    const units = splitUnits(args.length, valueUnits);
    return (
        <SubGridStack>
            <SubGrid divided>
                <Track units={valueUnits} className={classes.bandLabel}>
                    arguments
                </Track>
            </SubGrid>
            <SubGrid>
                {args.map((argument, index) => (
                    <Track key={argument.name} units={units[index]} pad={false}>
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
                    </Track>
                ))}
            </SubGrid>
        </SubGridStack>
    );
}
