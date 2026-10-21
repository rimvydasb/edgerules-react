import {Handle, Position, useNodeConnections} from '@xyflow/react';
import type {ReactElement} from 'react';
import {isListType, typeKind} from './typeKind';
import type {PinProps} from './types';
import styles from './coreNode.module.css';

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
