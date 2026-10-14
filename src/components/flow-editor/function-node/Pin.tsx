import {Handle, Position, useNodeConnections} from '@xyflow/react';
import type {ReactElement} from 'react';
import {isListType, typeKind} from './typeKind';
import styles from './functionNode.module.css';

export interface PinProps {
    id: string; // handle id: 'in:<parameter>', 'out:<result>' or 'out:*'
    side: 'in' | 'out';
    type: string; // 'number', 'Applicant', 'number[]'
    bound?: 'path' | 'value'; // input only: how the argument is bound
    bad?: boolean; // red ring: no binding, or the last binding was rejected
    title: string;
    forceRecord?: boolean; // the whole-result pin is always a square
}

/** One xyflow handle styled as a pin: color is the type, shape is the structure, fill is the connection state. */
export function Pin({id, side, type, bound, bad, title, forceRecord}: PinProps): ReactElement {
    const connections = useNodeConnections({handleType: side === 'in' ? 'target' : 'source', handleId: id});
    const connected = bound === 'path' || (side === 'out' && connections.length > 0);
    const classes = [
        styles.pin,
        side === 'in' ? styles.pinIn : styles.pinOut,
        connected ? styles.pinConnected : '',
        bound === 'value' ? styles.pinValue : '',
        forceRecord || typeKind(type) === 'record' ? styles.pinRecord : '',
        isListType(type) ? styles.pinList : '',
        bad ? styles.pinBad : '',
        'nodrag',
    ];
    return (
        <Handle
            id={id}
            type={side === 'in' ? 'target' : 'source'}
            position={side === 'in' ? Position.Left : Position.Right}
            className={classes.filter(Boolean).join(' ')}
            data-type={forceRecord ? 'record' : typeKind(type)}
            title={title}
        />
    );
}
